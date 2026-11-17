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
}

#[derive(Serialize, Deserialize)]
struct ScheduleFile {
    version: u32,
    resumes: Vec<ScheduledResume>,
}

const VERSION: u32 = 1;

pub struct Schedule {
    path: Option<PathBuf>,
    entries: BTreeMap<String, ScheduledResume>,
}

impl Schedule {
    pub fn load(path: Option<PathBuf>) -> Self {
        let entries = path
            .as_deref()
            .and_then(|path| match std::fs::read(path) {
                Ok(bytes) => Some(bytes),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
                Err(error) => {
                    log::warn!("[claude-limit] could not read scheduled resumes: {error}");
                    None
                }
            })
            .and_then(
                |bytes| match serde_json::from_slice::<ScheduleFile>(&bytes) {
                    Ok(file) if file.version == VERSION => Some(file.resumes),
                    Ok(file) => {
                        log::warn!(
                            "[claude-limit] ignored scheduled resumes of version {}",
                            file.version
                        );
                        None
                    }
                    Err(error) => {
                        log::warn!("[claude-limit] scheduled resumes are damaged: {error}");
                        None
                    }
                },
            )
            .unwrap_or_default()
            .into_iter()
            .map(|entry| (entry.session_id.clone(), entry))
            .collect::<BTreeMap<_, _>>();
        if !entries.is_empty() {
            log::info!("[claude-limit] loaded {} scheduled resumes", entries.len());
        }
        Self { path, entries }
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

    pub fn take_due(&mut self, now: i64) -> Vec<ScheduledResume> {
        let due: Vec<String> = self
            .entries
            .values()
            .filter(|entry| entry.at <= now)
            .map(|entry| entry.session_id.clone())
            .collect();
        let taken: Vec<ScheduledResume> = due
            .iter()
            .filter_map(|id| self.entries.remove(id))
            .collect();
        if !taken.is_empty() {
            self.save();
        }
        taken
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
            log::warn!("[claude-limit] could not save scheduled resumes: {error}");
        }
    }
}

#[cfg(test)]
#[path = "schedule_tests.rs"]
mod tests;
