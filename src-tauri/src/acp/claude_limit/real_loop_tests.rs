use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use agent_client_protocol::schema::v1::{ContentBlock, TextContent};
use serde_json::Value;

use super::schedule::Schedule;
use super::supervisor::Supervisor;
use super::{resume_notice, switch_notice, ClaudeLimitHandle};
use crate::acp::claude_agent::{ClaudeAgentService, ClaudeUsageProbe};
use crate::acp::config::{AgentConfig, AgentId, SessionId};
use crate::acp::manager::real_loop_tests::{find_python, MOCK_AGENT, SKIP_ENV, TIMEOUT_TEST_LOCK};
use crate::acp::manager::SessionCreationContext;
use crate::acp::session_persistence::SessionPersistence;
use crate::acp::{AcpManager, SignInCheck};
use crate::web::prompt_turn::{run_prompt_turn, PromptTurnRequest};
use crate::web::sink::{AcpEvent, EventSink};
use crate::web::WsRelaySink;

const PROJECT: &str = "proj-1";
const WAIT: Duration = Duration::from_secs(45);

/// Usage per account dir name; the built-in account (no dir) reads `default`.
struct FixedUsage(HashMap<String, f64>);

#[async_trait::async_trait]
impl ClaudeUsageProbe for FixedUsage {
    async fn probe(&self, config_dir: Option<&Path>) -> Result<String, String> {
        let key = config_dir
            .and_then(|dir| dir.file_name()?.to_str())
            .unwrap_or("default");
        let percent = self.0.get(key).copied().unwrap_or(0.0);
        Ok(serde_json::json!({
            "subscription_type": "max",
            "rate_limits": {"five_hour": {"utilization": percent, "resets_at": "2099-01-01T00:00:00Z"}}
        })
        .to_string())
    }
}

#[derive(Default)]
struct Recorded(parking_lot::Mutex<Vec<(String, Value)>>);

impl EventSink for Recorded {
    fn emit(&self, event: &AcpEvent) {
        self.0
            .lock()
            .push((event.type_.to_string(), event.payload.clone()));
    }
}

struct Host {
    dir: tempfile::TempDir,
    acp: Arc<AcpManager>,
    relay: Arc<WsRelaySink>,
    persistence: Arc<SessionPersistence>,
    accounts: HashMap<&'static str, String>,
    _serial: tokio::sync::MutexGuard<'static, ()>,
}

impl Host {
    async fn start(usage: &[(&'static str, f64)], project_account: &str) -> Option<Self> {
        let Some(python) = find_python() else {
            if std::env::var(SKIP_ENV).as_deref() == Ok("1") {
                return None;
            }
            panic!("claude_limit real-loop tests need python3 on PATH (or {SKIP_ENV}=1)");
        };
        let serial = TIMEOUT_TEST_LOCK.lock().await;
        let dir = tempfile::tempdir().unwrap();
        let state = dir.path().join("state");
        let mut claude = ClaudeAgentService::with_logins_for_test(&state, &[]);
        let mut accounts = HashMap::new();
        let mut percents = HashMap::new();
        for (name, percent) in usage {
            let id = if *name == "default" {
                "default".to_string()
            } else {
                claude.insert_profile(name).unwrap().id
            };
            percents.insert(id.clone(), *percent);
            accounts.insert(*name, id);
        }
        claude.set_usage_probe_for_test(Arc::new(FixedUsage(percents)));
        claude
            .set_project_account(
                PROJECT,
                Some(&accounts[project_account]),
                None,
                SignInCheck::Skip,
            )
            .await
            .unwrap();
        write_managed_entrypoint(&state, python, dir.path());

        let persistence = SessionPersistence::open(dir.path().join("sessions"))
            .await
            .unwrap();
        let relay = Arc::new(WsRelaySink::with_persistence(64, persistence.clone()));
        let (handle, inbox) = ClaudeLimitHandle::channel();
        let acp = Arc::new(AcpManager::with_persistence_and_claude_agent(
            vec![relay.clone(), handle.sink()],
            persistence.clone(),
            Arc::new(claude),
        ));
        acp.set_claude_limit(handle);
        let schedule = Schedule::load(Some(state.join(super::SCHEDULE_FILE)));
        tokio::spawn(
            Supervisor::new(acp.clone(), relay.clone(), schedule, Duration::ZERO).run(inbox.0),
        );
        Some(Self {
            dir,
            acp,
            relay,
            persistence,
            accounts,
            _serial: serial,
        })
    }

    fn state(&self) -> PathBuf {
        self.dir.path().join("state")
    }

    async fn open_chat(&self) -> (AgentId, SessionId) {
        let entrypoint = self
            .state()
            .join("acp-registry-binaries/claude-acp/node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js");
        let config = AgentConfig {
            config_id: Some(super::CLAUDE_CONFIG_ID.to_string()),
            name: "Claude Agent".to_string(),
            command: "node".to_string(),
            args: vec![entrypoint.to_string_lossy().to_string()],
            env: HashMap::from([("MOCK_RESUME_OK".to_string(), "1".to_string())]),
            allow_terminal: false,
        };
        let spawned = self
            .acp
            .spawn_with_command_id(config, None, Some(PROJECT.to_string()))
            .await
            .expect("managed mock agent spawns");
        let session = self
            .acp
            .new_session_with_context(
                &spawned.agent_id,
                self.dir.path().to_string_lossy().to_string(),
                vec![],
                SessionCreationContext {
                    project_id: Some(PROJECT.to_string()),
                    ..SessionCreationContext::default()
                },
            )
            .await
            .expect("mock session");
        (spawned.agent_id, session.session_id)
    }

    fn prompt_and_leave(&self, agent_id: &AgentId, session_id: &SessionId, text: &str) {
        let blocks = vec![ContentBlock::Text(TextContent::new(text))];
        let request = PromptTurnRequest {
            agent_id: agent_id.clone(),
            session_id: session_id.clone(),
            content: blocks.clone(),
            record_content: blocks,
            turn_id: Some("client-turn".to_string()),
        };
        let (acp, relay) = (self.acp.clone(), self.relay.clone());
        tokio::spawn(async move {
            let _ = run_prompt_turn(&acp, &relay, request).await;
        });
    }

    async fn log_until(
        &self,
        session_id: &SessionId,
        done: impl Fn(&[(String, Value)]) -> bool,
    ) -> Vec<(String, Value)> {
        let deadline = tokio::time::Instant::now() + WAIT;
        loop {
            let _ = self.persistence.flush_session(&session_id.0).await;
            let records: Vec<(String, Value)> = self
                .persistence
                .replay_after(&session_id.0, 0)
                .unwrap_or_default()
                .into_iter()
                .map(|record| (record.type_, record.payload))
                .collect();
            if done(&records) {
                return records;
            }
            assert!(
                tokio::time::Instant::now() < deadline,
                "session log never matched; it holds {:?}",
                records.iter().map(|(kind, _)| kind).collect::<Vec<_>>()
            );
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    }
}

fn write_managed_entrypoint(state: &Path, python: &str, dir: &Path) {
    let package = state.join(
        "acp-registry-binaries/claude-acp/node_modules/@agentclientprotocol/claude-agent-acp",
    );
    std::fs::create_dir_all(package.join("dist")).unwrap();
    std::fs::write(
        package.join("package.json"),
        r#"{"name":"@agentclientprotocol/claude-agent-acp","version":"0.78.0","bin":{"claude-agent-acp":"dist/index.js"}}"#,
    )
    .unwrap();
    let script = dir.join("mock_agent.py");
    std::fs::write(&script, MOCK_AGENT).unwrap();
    std::fs::write(
        package.join("dist/index.js"),
        format!(
            "const child = require('child_process').spawn({python:?}, ['-u', {script:?}], {{ stdio: 'inherit' }});\nchild.on('exit', (code) => process.exit(code ?? 1));\n",
            script = script.to_string_lossy()
        ),
    )
    .unwrap();
}

fn texts<'a>(records: &'a [(String, Value)], kind: &str) -> Vec<&'a str> {
    records
        .iter()
        .filter(|(k, _)| k == kind)
        .filter_map(|(k, payload)| {
            let path = if k == "user_prompt" {
                "/content/0/text"
            } else {
                "/content/text"
            };
            payload.pointer(path)?.as_str()
        })
        .collect()
}

fn actions(records: &[(String, Value)]) -> Vec<Value> {
    records
        .iter()
        .filter(|(kind, _)| kind == "claude_limit_action")
        .map(|(_, payload)| payload.clone())
        .collect()
}

fn now_secs() -> i64 {
    i64::try_from(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs(),
    )
    .unwrap()
}

fn has_config_dir_chunk(records: &[(String, Value)]) -> bool {
    texts(records, "message_chunk")
        .iter()
        .any(|text| text.starts_with("config_dir="))
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_chat_at_its_limit_continues_on_the_account_with_most_room_with_no_client() {
    let Some(host) = Host::start(
        &[("default", 90.0), ("Work", 100.0), ("Spare", 10.0)],
        "Work",
    )
    .await
    else {
        return;
    };
    let (old_agent, session_id) = host.open_chat().await;
    let resets_at = now_secs() + 3600;
    host.prompt_and_leave(&old_agent, &session_id, &format!("limit:{resets_at}"));

    let records = host.log_until(&session_id, has_config_dir_chunk).await;

    let (work, spare) = (&host.accounts["Work"], &host.accounts["Spare"]);
    let snapshot = host.acp.claude_agent().accounts_snapshot().await.unwrap();
    assert_eq!(snapshot.project_profiles.get(PROJECT), Some(spare));
    let live_agents = host.acp.list_agents();
    assert_eq!(live_agents.len(), 1);
    let new_agent = live_agents[0].clone();
    assert_ne!(new_agent, old_agent);
    assert_eq!(
        actions(&records),
        vec![serde_json::json!({
            "sessionId": session_id.0,
            "projectId": PROJECT,
            "action": "switched",
            "from": {"id": work, "name": "Work"},
            "to": {"id": spare, "name": "Spare"},
            "fromAgentId": old_agent.0,
            "newAgentId": new_agent.0,
        })]
    );
    assert_eq!(
        texts(&records, "user_prompt"),
        vec![
            format!("limit:{resets_at}").as_str(),
            switch_notice("Work", "Spare", "5-hour").as_str()
        ]
    );
    let spare_dir = host.state().join("claude-accounts").join(spare);
    assert_eq!(
        texts(&records, "message_chunk"),
        vec![format!("config_dir={}", spare_dir.display()).as_str()]
    );
    let _ = host.acp.kill(&new_agent).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn with_no_room_the_chat_continues_at_the_reset_after_its_agent_was_reaped() {
    let Some(host) = Host::start(&[("default", 100.0), ("Work", 100.0)], "Work").await else {
        return;
    };
    let (old_agent, session_id) = host.open_chat().await;
    let resets_at = now_secs() + 3;
    host.prompt_and_leave(&old_agent, &session_id, &format!("limit:{resets_at}"));

    let scheduled = host
        .log_until(&session_id, |records| !actions(records).is_empty())
        .await;
    assert_eq!(
        actions(&scheduled),
        vec![serde_json::json!({
            "sessionId": session_id.0,
            "projectId": PROJECT,
            "action": "resume_scheduled",
            "at": resets_at * 1000,
        })]
    );
    let file: Value =
        serde_json::from_slice(&std::fs::read(host.state().join(super::SCHEDULE_FILE)).unwrap())
            .unwrap();
    assert_eq!(file["resumes"][0]["sessionId"], session_id.0);
    assert_eq!(file["resumes"][0]["at"], resets_at);

    host.acp.reap_agent(&old_agent).await.unwrap();
    assert_eq!(host.acp.list_agents(), Vec::<AgentId>::new());

    let records = host.log_until(&session_id, has_config_dir_chunk).await;
    let live_agents = host.acp.list_agents();
    assert_eq!(live_agents.len(), 1);
    let new_agent = live_agents[0].clone();
    assert_eq!(
        actions(&records)[1],
        serde_json::json!({
            "sessionId": session_id.0,
            "projectId": PROJECT,
            "action": "resumed",
            "fromAgentId": old_agent.0,
            "newAgentId": new_agent.0,
        })
    );
    let reset = chrono::DateTime::from_timestamp(resets_at, 0)
        .unwrap()
        .format("%H:%M UTC")
        .to_string();
    assert_eq!(
        texts(&records, "user_prompt")[1],
        resume_notice("Work", "5-hour", &reset)
    );
    let work_dir = host
        .state()
        .join("claude-accounts")
        .join(&host.accounts["Work"]);
    assert_eq!(
        texts(&records, "message_chunk"),
        vec![format!("config_dir={}", work_dir.display()).as_str()]
    );
    let file: Value =
        serde_json::from_slice(&std::fs::read(host.state().join(super::SCHEDULE_FILE)).unwrap())
            .unwrap();
    assert_eq!(file["resumes"], serde_json::json!([]));
    let _ = host.acp.kill(&new_agent).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_resume_due_after_a_restart_marks_the_chat_for_its_client() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join(super::SCHEDULE_FILE);
    std::fs::write(
        &path,
        serde_json::json!({"version": 1, "resumes": [{
            "sessionId": "s-restarted", "projectId": PROJECT, "at": 1,
            "accountId": "a1", "window": "five_hour"}]})
        .to_string(),
    )
    .unwrap();
    let live = Arc::new(Recorded::default());
    let relay = Arc::new(WsRelaySink::new());
    let (handle, inbox) = ClaudeLimitHandle::channel();
    let acp = Arc::new(AcpManager::new(vec![
        relay.clone(),
        handle.sink(),
        live.clone(),
    ]));
    tokio::spawn(
        Supervisor::new(
            acp,
            relay,
            Schedule::load(Some(path.clone())),
            Duration::ZERO,
        )
        .run(inbox.0),
    );
    let deadline = tokio::time::Instant::now() + Duration::from_secs(10);
    let event = loop {
        let found = live
            .0
            .lock()
            .iter()
            .find(|(kind, _)| kind == "acp:claude_limit_action")
            .map(|(_, payload)| payload.clone());
        if let Some(event) = found {
            break event;
        }
        assert!(tokio::time::Instant::now() < deadline, "no action event");
        tokio::time::sleep(Duration::from_millis(50)).await;
    };
    assert_eq!(
        event,
        serde_json::json!({
            "sessionId": "s-restarted",
            "projectId": PROJECT,
            "action": "failed",
            "reason": "The host restarted while this chat waited for its limit to reset. Send a message to continue.",
        })
    );
    assert_eq!(Schedule::load(Some(path)).next_at(), None);
    drop(handle);
}
