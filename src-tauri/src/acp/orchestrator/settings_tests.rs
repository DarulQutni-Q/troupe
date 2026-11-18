//! The settings store: defaults, persistence, corruption and validation.

use super::*;

fn dir() -> tempfile::TempDir {
    tempfile::tempdir().expect("tempdir")
}

#[test]
fn a_missing_file_loads_the_defaults() {
    let store = SettingsStore::open(dir().path());
    let settings = store.get();
    assert_eq!(
        settings,
        OrchestratorSettings {
            enabled: true,
            max_running: DEFAULT_MAX_RUNNING,
            max_depth: DEFAULT_MAX_DEPTH,
            agents: Default::default(),
        }
    );
}

#[test]
fn a_saved_settings_file_round_trips() {
    let dir = dir();
    let store = SettingsStore::open(dir.path());
    let saved = store
        .set(OrchestratorSettings {
            enabled: false,
            max_running: 2,
            max_depth: 3,
            agents: [("codex".to_string(), false)].into(),
        })
        .expect("saved");
    assert!(!saved.enabled);
    let reloaded = SettingsStore::open(dir.path()).get();
    assert_eq!(reloaded, saved);
}

#[test]
fn a_corrupt_file_is_backed_up_and_the_defaults_load() {
    let dir = dir();
    std::fs::write(dir.path().join(FILE_NAME), b"{not json").expect("write");
    let store = SettingsStore::open(dir.path());
    assert_eq!(store.get(), OrchestratorSettings::default());
    assert!(
        std::fs::read_dir(dir.path())
            .expect("dir")
            .filter_map(|entry| entry.ok())
            .any(|entry| entry.file_name().to_string_lossy().contains(FILE_NAME)),
        "the corrupt file was kept aside"
    );
}

#[test]
fn an_in_memory_store_never_writes() {
    let store = SettingsStore::in_memory();
    store
        .set(OrchestratorSettings {
            enabled: true,
            max_running: 8,
            max_depth: 4,
            agents: Default::default(),
        })
        .expect("saved");
    assert_eq!(store.get().max_running, 8);
}

#[test]
fn set_validates_the_bounds() {
    let store = SettingsStore::in_memory();
    for max_running in [0, 9] {
        let error = store
            .set(OrchestratorSettings {
                max_running,
                ..OrchestratorSettings::default()
            })
            .expect_err("out of range");
        assert!(error.contains("max_running"), "{error}");
    }
    for max_depth in [0, 5] {
        let error = store
            .set(OrchestratorSettings {
                max_depth,
                ..OrchestratorSettings::default()
            })
            .expect_err("out of range");
        assert!(error.contains("max_depth"), "{error}");
    }
    let error = store
        .set(OrchestratorSettings {
            agents: [("  ".to_string(), true)].into(),
            ..OrchestratorSettings::default()
        })
        .expect_err("blank key");
    assert!(error.contains("blank"), "{error}");
    assert_eq!(store.get(), OrchestratorSettings::default());
}
