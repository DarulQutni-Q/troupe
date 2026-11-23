//! The closed name sets of `/ws`: request types, event types, watch names,
//! error codes and delivery tiers.

wire_enum! {
    /// A `/ws` request `type`.
    pub enum WsRequestType {
        SendPrompt = "send_prompt",
        CancelPrompt = "cancel_prompt",
        StopSubagent = "stop_subagent",
        SetConfigOption = "set_config_option",
        SetMode = "set_mode",
        SetModel = "set_model",
        RespondPermission = "respond_permission",
        AnswerQuestion = "answer_question",
        AnswerMcpInstall = "answer_mcp_install",
        BrowserStop = "browser_stop",
        CreateSession = "create_session",
        LoadSession = "load_session",
        ResumeSession = "resume_session",
        CloseSession = "close_session",
        DisposeEphemeralSession = "dispose_ephemeral_session",
        PromoteSession = "promote_session",
        ListSessions = "list_sessions",
        RegisterDiscoveredSession = "register_discovered_session",
        ImportAgentSession = "import_agent_session",
        SpawnAgent = "spawn_agent",
        KillAgent = "kill_agent",
        ListAgents = "list_agents",
        Authenticate = "authenticate",
        AuthenticateAgent = "authenticate_agent",
        LogoutAgent = "logout_agent",
        DeleteAgentSession = "delete_agent_session",
        RespondElicitation = "respond_elicitation",
        Subscribe = "subscribe",
        Ping = "ping",
        ListPersistedSessions = "list_persisted_sessions",
        DeleteSession = "delete_session",
        RenameSession = "rename_session",
        OpenPersistedSession = "open_persisted_session",
        GetSessionPayload = "get_session_payload",
        RecoverSessionSnapshot = "recover_session_snapshot",
        GetSessionCursor = "get_session_cursor",
        GetSessionPayloadTail = "get_session_payload_tail",
        ListAcpCatalog = "list_acp_catalog",
        SetCatalogOptIn = "set_catalog_opt_in",
        FetchAcpRegistrySnapshot = "fetch_acp_registry_snapshot",
        SearchMcpCatalog = "search_mcp_catalog",
        GetMcpCatalogStatus = "get_mcp_catalog_status",
        SetMcpCatalogSync = "set_mcp_catalog_sync",
        DescribeMcpInstall = "describe_mcp_install",
        PlanMcpInstall = "plan_mcp_install",
        CommitMcpInstall = "commit_mcp_install",
        CancelMcpInstall = "cancel_mcp_install",
        GetMcpCatalogIcon = "get_mcp_catalog_icon",
        InstallAcpAgent = "install_acp_agent",
        AcpDeliverAuthRedirect = "acp_deliver_auth_redirect",
        StoreRead = "store_read",
        StoreWrite = "store_write",
        StoreDelete = "store_delete",
        AddProject = "add_project",
        UpdateProject = "update_project",
        RemoveProject = "remove_project",
        RecordAgentSwitch = "record_agent_switch",
        MarkChatRead = "mark_chat_read",
        Watch = "watch",
        Unwatch = "unwatch",
        SetDefaultProject = "set_default_project",
        SubagentSettingsGet = "subagent_settings_get",
        SubagentSettingsSet = "subagent_settings_set",
        ListClaudeAccounts = "list_claude_accounts",
        ListClaudeUsage = "list_claude_usage",
        SetDefaultClaudeAccount = "set_default_claude_account",
        SetProjectClaudeAccount = "set_project_claude_account",
        SetChatClaudeAccount = "set_chat_claude_account",
        SetClaudeAutoSwitch = "set_claude_auto_switch",
        SetClaudeResume = "set_claude_resume",
        AddClaudeAccount = "add_claude_account",
        RenameClaudeAccount = "rename_claude_account",
        RemoveClaudeAccount = "remove_claude_account",
        StartClaudeLinkLogin = "start_claude_link_login",
        FinishClaudeLinkLogin = "finish_claude_link_login",
        CancelClaudeLogin = "cancel_claude_login",
        ListCodexAccounts = "list_codex_accounts",
        ListCodexUsage = "list_codex_usage",
        SetDefaultCodexAccount = "set_default_codex_account",
        SetProjectCodexAccount = "set_project_codex_account",
        SetChatCodexAccount = "set_chat_codex_account",
        SetCodexAutoSwitch = "set_codex_auto_switch",
        SetCodexResume = "set_codex_resume",
        AddCodexAccount = "add_codex_account",
        RenameCodexAccount = "rename_codex_account",
        RemoveCodexAccount = "remove_codex_account",
        StartCodexAccountLogin = "start_codex_account_login",
        CanvasMount = "canvas_mount",
        CanvasUnmount = "canvas_unmount",
        CanvasReply = "canvas_reply",
    }
}

wire_enum! {
    /// The `type` of a `/ws` session log event. `gap` and `heartbeat` name the
    /// top-level delivery frames.
    pub enum WsEventType {
        AgentSpawned = "agent_spawned",
        SessionCreated = "session_created",
        SessionClosed = "session_closed",
        AgentDisconnected = "agent_disconnected",
        AgentError = "agent_error",
        ToolCall = "tool_call",
        ModeUpdate = "mode_update",
        ConfigOptionsUpdate = "config_options_update",
        SessionInfoUpdate = "session_info_update",
        UsageUpdate = "usage_update",
        PermissionRequest = "permission_request",
        PromptComplete = "prompt_complete",
        MessageChunk = "message_chunk",
        ToolCallUpdate = "tool_call_update",
        CommandsUpdate = "commands_update",
        PlanUpdate = "plan_update",
        AuthRequired = "auth_required",
        UserPrompt = "user_prompt",
        AgentSwitch = "agent_switch",
        LocalTitleGenerated = "local_title_generated",
        AgentWorking = "agent_working",
        BackgroundCommands = "background_commands",
        Gap = "gap",
        Heartbeat = "heartbeat",
    }
}

wire_enum! {
    /// A watch a connection can hold. `projects`, `chat_history`, `agents` and
    /// `chat_activity` have the empty scope; `fs` and `terminals` are scoped
    /// to a project id, `store` to a store key.
    pub enum WsWatchName {
        Projects = "projects",
        ChatHistory = "chat_history",
        Agents = "agents",
        Fs = "fs",
        Store = "store",
        Terminals = "terminals",
        ChatActivity = "chat_activity",
    }
}

wire_enum! {
    /// The stable snake_case `err.code` strings of `/ws`. Some handlers
    /// (the store, installs) answer SCREAMING_SNAKE_CASE codes outside this
    /// set, so `WsError::code` stays a string.
    pub enum WsErrorCode {
        NotFound = "not_found",
        Unauthorized = "unauthorized",
        RateLimited = "rate_limited",
        AgentCrashed = "agent_crashed",
        PermissionDenied = "permission_denied",
        Stale = "stale",
        Duplicate = "duplicate",
        Unsupported = "unsupported",
        NotImplemented = "not_implemented",
        AgentAuthRequired = "agent_auth_required",
        SessionOwnedByOther = "session_owned_by_other",
        ProtocolVersionMismatch = "protocol_version_mismatch",
        InvalidClientIdentity = "invalid_client_identity",
        TerminalLimit = "terminal_limit",
        ProjectBusy = "project_busy",
        OutcomeUnknown = "outcome_unknown",
        DestructiveOpBlocked = "destructive_op_blocked",
        ProviderQuotaExceeded = "provider_quota_exceeded",
        ProviderSessionLimit = "provider_session_limit",
        ProviderRequestRejected = "provider_request_rejected",
        Forbidden = "forbidden",
        AlreadyResolved = "already_resolved",
        AgentUnavailable = "agent_unavailable",
        InvalidAgentConfig = "invalid_agent_config",
        CommandConflict = "command_conflict",
        InvalidCommandId = "invalid_command_id",
        ClaudeAccountSignedOut = "claude_account_signed_out",
        CodexAccountSignedOut = "codex_account_signed_out",
        ClaudeLoginCodeIncomplete = "claude_login_code_incomplete",
        ClaudeLoginBusy = "claude_login_busy",
    }
}

wire_enum! {
    /// How the relay delivers an event type to a slow client.
    pub enum ReliabilityTier {
        Lossy = "lossy",
        Reliable = "reliable",
        Idempotent = "idempotent",
    }
}

wire_enum! {
    /// Whether the host keeps session history.
    pub enum HistoryMode {
        Server = "server",
        LiveOnly = "live_only",
    }
}

impl WsEventType {
    /// The delivery tier: lossy streams are dropped for a slow client and
    /// followed by a `gap` frame, `prompt_complete` is deduplicated by turn,
    /// everything else is never dropped silently.
    #[must_use]
    pub const fn tier(self) -> ReliabilityTier {
        match self {
            Self::MessageChunk | Self::ToolCallUpdate | Self::CommandsUpdate | Self::PlanUpdate => {
                ReliabilityTier::Lossy
            }
            Self::PromptComplete => ReliabilityTier::Idempotent,
            _ => ReliabilityTier::Reliable,
        }
    }
}
