//! The orchestrator's settings: host-side truth, one atomic JSON file in
//! the data dir, plus the view/input pair the WS routes read and write.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};

use crate::acp::atomic_file;

pub const FILE_NAME: &str = "subagent-settings.json";
const SCHEMA_VERSION: u32 = 1;
pub const DEFAULT_MAX_RUNNING: u32 = 4;
pub const DEFAULT_MAX_DEPTH: u8 = 2;

/// Bound validation, shared by `set_settings` and the WS route.
pub const MAX_RUNNING_BOUNDS: (u32, u32) = (1, 8);
pub const MAX_DEPTH_BOUNDS: (u8, u8) = (1, 4);

/// The orchestrator settings. `agents` maps a launch key to whether it is
/// allowed; an absent key is allowed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OrchestratorSettings {
    pub enabled: bool,
    pub max_running: u32,
    /// 1 = no nesting.
    pub max_depth: u8,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub agents: BTreeMap<String, bool>,
}

impl Default for OrchestratorSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            max_running: DEFAULT_MAX_RUNNING,
            max_depth: DEFAULT_MAX_DEPTH,
            agents: BTreeMap::new(),
        }
    }
}

#[derive(Serialize, Deserialize)]
struct SettingsFile {
    schema_version: u32,
    #[serde(flatten)]
    settings: OrchestratorSettings,
}

/// The write input: a full replacement, validated and persisted atomically.
pub type SettingsInput = OrchestratorSettings;

pub(crate) struct SettingsStore {
    path: Option<PathBuf>,
    settings: Mutex<OrchestratorSettings>,
}

impl SettingsStore {
    /// Loads `<data_dir>/subagent-settings.json`. A missing file is the
    /// defaults; a corrupt one is copied aside and the defaults load, so a
    /// corrupt file never blocks the feature.
    pub(crate) fn open(data_dir: &Path) -> Self {
        let path = data_dir.join(FILE_NAME);
        let settings = match std::fs::read(&path) {
            Ok(bytes) => match serde_json::from_slice::<SettingsFile>(&bytes) {
                Ok(file) if file.schema_version == SCHEMA_VERSION => file.settings,
                Ok(file) => {
                    log::warn!(
                        "[orchestrator] settings schema {} is newer than {}; defaults loaded",
                        file.schema_version,
                        SCHEMA_VERSION
                    );
                    OrchestratorSettings::default()
                }
                Err(error) => {
                    let backup = atomic_file::backup_corrupt(&path, &bytes);
                    log::warn!(
                        "[orchestrator] settings file is corrupt ({error}); defaults loaded \
                         (backup: {})",
                        backup.is_ok()
                    );
                    OrchestratorSettings::default()
                }
            },
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                OrchestratorSettings::default()
            }
            Err(error) => {
                log::warn!("[orchestrator] settings file unreadable: {error}");
                OrchestratorSettings::default()
            }
        };
        Self {
            path: Some(path),
            settings: Mutex::new(settings),
        }
    }

    /// In-memory settings (tests).
    #[cfg(test)]
    pub(crate) fn in_memory() -> Self {
        Self {
            path: None,
            settings: Mutex::new(OrchestratorSettings::default()),
        }
    }

    pub(crate) fn get(&self) -> OrchestratorSettings {
        self.settings.lock().clone()
    }

    /// Validate and persist a full replacement.
    pub(crate) fn set(&self, input: SettingsInput) -> Result<OrchestratorSettings, String> {
        if !(MAX_RUNNING_BOUNDS.0..=MAX_RUNNING_BOUNDS.1).contains(&input.max_running) {
            return Err(format!(
                "max_running must be between {} and {}",
                MAX_RUNNING_BOUNDS.0, MAX_RUNNING_BOUNDS.1
            ));
        }
        if !(MAX_DEPTH_BOUNDS.0..=MAX_DEPTH_BOUNDS.1).contains(&input.max_depth) {
            return Err(format!(
                "max_depth must be between {} and {}",
                MAX_DEPTH_BOUNDS.0, MAX_DEPTH_BOUNDS.1
            ));
        }
        if input.agents.keys().any(|key| key.trim().is_empty()) {
            return Err("an agent allow key must not be blank".to_string());
        }
        let next = OrchestratorSettings {
            enabled: input.enabled,
            max_running: input.max_running,
            max_depth: input.max_depth,
            agents: input
                .agents
                .into_iter()
                .map(|(key, allowed)| (key.trim().to_string(), allowed))
                .collect(),
        };
        if let Some(path) = &self.path {
            let file = SettingsFile {
                schema_version: SCHEMA_VERSION,
                settings: next.clone(),
            };
            let written = serde_json::to_vec_pretty(&file)
                .map_err(std::io::Error::other)
                .and_then(|bytes| atomic_file::replace_private(path, &bytes));
            match written {
                Ok(()) => log::info!("[orchestrator] settings saved"),
                Err(error) => {
                    log::warn!("[orchestrator] settings could not be saved: {error}");
                    return Err(format!("settings could not be saved: {error}"));
                }
            }
        }
        *self.settings.lock() = next.clone();
        Ok(next)
    }
}

#[cfg(test)]
#[path = "settings_tests.rs"]
mod settings_tests;
