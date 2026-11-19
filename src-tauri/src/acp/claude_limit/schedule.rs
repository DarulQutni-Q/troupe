use std::collections::BTreeMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledResume {
    pub session_id: String,
    pub project_id: String,
    pub at: i64,
    pub account_id: Option<String>,
    pub window: Option<String>,
    /// The turn clock when the resume was scheduled. The clock restarts with
    /// the host, so a loaded entry reads 0.
    #[serde(skip)]
    pub turn_mark: u64,
}

#[derive(Serialize, Deserialize)]
struct ScheduleFile {
    version: u32,
    resumes: Vec<ScheduledResume>,
}

const VERSION: u32 = 1;

pub struct Schedule {
    path: Option<PathBuf>,
    label: &'static str,
    entries: BTreeMap<String, ScheduledResume>,
}

impl Schedule {
    /// Load Claude resumes. The log lines keep the `claude-limit` label.
    pub fn load(path: Option<PathBuf>) -> Self {
        Self::open(path, "claude-limit")
    }

    /// Load resumes and log with `label` (`claude-limit` or `codex-limit`).
    pub fn open(path: Option<PathBuf>, label: &'static str) -> Self {
        let entries = path
            .as_deref()
            .and_then(|path| match std::fs::read(path) {
                Ok(bytes) => Some(bytes),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
                Err(error) => {
                    log::warn!("[{label}] could not read scheduled resumes: {error}");
                    None
                }
            })
            .and_then(
                |bytes| match serde_json::from_slice::<ScheduleFile>(&bytes) {
                    Ok(file) if file.version == VERSION => Some(file.resumes),
                    Ok(file) => {
                        log::warn!(
                            "[{label}] ignored scheduled resumes of version {}",
                            file.version
                        );
                        None
                    }
                    Err(error) => {
                        log::warn!("[{label}] scheduled resumes are damaged: {error}");
                        None
                    }
                },
            )
            .unwrap_or_default()
            .into_iter()
            .map(|entry| (entry.session_id.clone(), entry))
            .collect::<BTreeMap<_, _>>();
        if !entries.is_empty() {
            log::info!("[{label}] loaded {} scheduled resumes", entries.len());
        }
        Self {
            path,
            label,
            entries,
        }
    }

    pub fn insert(&mut self, entry: ScheduledResume) {
        self.entries.insert(entry.session_id.clone(), entry);
        self.save();
    }

    pub fn remove(&mut self, session_id: &str) -> Option<ScheduledResume> {
        let removed = self.entries.remove(session_id);
        if removed.is_some() {
            self.save();
        }
        removed
    }

    pub fn next_at(&self) -> Option<i64> {
        self.entries.values().map(|entry| entry.at).min()
    }

    /// Session ids loaded from disk or inserted since. The supervisor holds
    /// each one's launch recipe until the resume ends.
    pub fn session_ids(&self) -> Vec<String> {
        self.entries.keys().cloned().collect()
    }

    /// Remove and return the earliest resume due at `now`. One at a time, so
    /// the entries still waiting stay visible while the first one acts.
    pub fn take_next_due(&mut self, now: i64) -> Option<ScheduledResume> {
        let due = self
            .entries
            .values()
            .filter(|entry| entry.at <= now)
            .min_by_key(|entry| entry.at)?
            .session_id
            .clone();
        self.remove(&due)
    }

    fn save(&self) {
        let Some(path) = &self.path else {
            return;
        };
        let file = ScheduleFile {
            version: VERSION,
            resumes: self.entries.values().cloned().collect(),
        };
        let result = serde_json::to_vec_pretty(&file)
            .map_err(std::io::Error::other)
            .and_then(|bytes| crate::acp::atomic_file::replace(path, &bytes));
        if let Err(error) = result {
            log::warn!("[{}] could not save scheduled resumes: {error}", self.label);
        }
    }
}

#[cfg(test)]
#[path = "schedule_tests.rs"]
mod tests;
