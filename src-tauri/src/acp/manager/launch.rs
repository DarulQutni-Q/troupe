//! Kept in memory only: the config carries the project env and the MCP list
//! can carry headers, so neither is written to disk.

use agent_client_protocol::schema::v1::McpServer;

use super::AcpManager;
use crate::acp::claude_agent::ClaudeLaunchAuth;
use crate::acp::config::{AgentConfig, AgentId, SessionId};

/// The spawn inputs of one agent, before the host added credentials.
#[derive(Debug, Clone)]
pub struct AgentLaunch {
    pub config: AgentConfig,
    pub project_id: Option<String>,
    pub claude: ClaudeLaunchAuth,
}

#[derive(Debug, Clone)]
pub struct LaunchRecipe {
    /// The agent the chat was last opened on.
    pub agent_id: AgentId,
    pub launch: AgentLaunch,
    pub cwd: String,
    /// The client's last MCP list (without the host plan server). A reopen
    /// without one keeps the list from before; `None` when no open sent one.
    pub mcp_servers: Option<Vec<McpServer>>,
    pub additional_directories: Vec<String>,
}

impl AcpManager {
    pub(super) fn record_agent_launch(&self, agent_id: &AgentId, launch: AgentLaunch) {
        let agents = self.agents.lock();
        let mut launches = self.launches.lock();
        launches.retain(|id, _| agents.contains_key(id));
        if agents.contains_key(agent_id) {
            launches.insert(agent_id.clone(), launch);
        }
    }

    pub(super) fn record_launch_recipe(
        &self,
        agent_id: &AgentId,
        session_id: &str,
        cwd: String,
        mcp_servers: Option<Vec<McpServer>>,
        additional_directories: Vec<String>,
    ) {
        let Some(launch) = self.agent_launch(agent_id) else {
            return;
        };
        let mut recipes = self.recipes.lock();
        let session_id = SessionId(session_id.to_string());
        let mcp_servers = mcp_servers.or_else(|| {
            recipes
                .get(&session_id)
                .and_then(|recipe| recipe.mcp_servers.clone())
        });
        recipes.insert(
            session_id,
            LaunchRecipe {
                agent_id: agent_id.clone(),
                launch,
                cwd,
                mcp_servers,
                additional_directories,
            },
        );
    }

    /// The chat was closed on `agent_id` (`None`: deleted), so the host must
    /// not reopen it. A close on an agent the chat already left (a client
    /// closing the old agent's copy after reopening it elsewhere) changes
    /// nothing.
    pub(super) fn forget_launch_recipe(&self, session_id: &str, agent_id: Option<&AgentId>) {
        let session_id = SessionId(session_id.to_string());
        {
            let mut recipes = self.recipes.lock();
            let current = recipes.get(&session_id).map(|recipe| &recipe.agent_id);
            if agent_id.is_some() && current.is_some() && current != agent_id {
                return;
            }
            recipes.remove(&session_id);
        }
        if let Some(limit) = self.claude_limit.get() {
            limit.chat_closed(session_id, agent_id.is_none());
        }
    }

    #[must_use]
    pub fn launch_recipe(&self, session_id: &SessionId) -> Option<LaunchRecipe> {
        self.recipes.lock().get(session_id).cloned()
    }

    /// Record a host-authored event in the session's log and deliver it to
    /// every sink. A session whose log takes no record now (no durable
    /// writer) still gets it live.
    pub fn record_session_event<P: serde::Serialize>(
        &self,
        session_id: &str,
        type_: &'static str,
        payload: &P,
    ) {
        use crate::web::sink::{record_host_event, HostRecordFanout};
        if let Err(error) = record_host_event(
            &self.sinks,
            session_id,
            type_,
            payload,
            HostRecordFanout::AllSinks,
        ) {
            log::warn!(
                "[acp] {type_} for session {} not recorded ({error}); delivered live only",
                crate::logging::redact_session_id(session_id)
            );
            crate::acp::events::fan_out(&self.sinks, Some(session_id), type_, payload);
        }
    }

    /// The launch of a live agent; `None` once it stopped or when the host
    /// spawned it for itself.
    #[must_use]
    pub fn agent_launch(&self, agent_id: &AgentId) -> Option<AgentLaunch> {
        let agents = self.agents.lock();
        if !agents.contains_key(agent_id) {
            return None;
        }
        self.launches.lock().get(agent_id).cloned()
    }
}

#[cfg(test)]
#[path = "launch_tests.rs"]
mod tests;

#[cfg(test)]
impl AcpManager {
    /// Fixture: the live test agent `agent_id` was launched with `launch` and
    /// holds the chat `session_id`.
    pub(crate) fn record_launch_for_test(
        &self,
        agent_id: &AgentId,
        session_id: &str,
        launch: AgentLaunch,
    ) {
        self.record_agent_launch(agent_id, launch);
        self.record_launch_recipe(agent_id, session_id, "/work".to_string(), None, Vec::new());
    }
}
