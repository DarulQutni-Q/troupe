//! What the host does when a chat reaches its account's plan limit. Pure: the
//! supervisor gathers the inputs and acts on the [`LimitDecision`].

use std::collections::HashMap;
use std::time::{Duration, SystemTime};

pub const SHORTEST_WINDOW: Duration = Duration::from_secs(5 * 60 * 60);

#[derive(Debug, Clone, PartialEq)]
pub struct Candidate {
    pub account_id: String,
    /// The login is confirmed and the last usage read did not report it
    /// signed out.
    pub ready: bool,
    /// Percent used of the account's most used window; `None` when the usage
    /// read had no windows or failed.
    pub percent: Option<f64>,
}

/// Ready accounts with room left, least used first. An account with an
/// unknown usage counts as unused.
#[must_use]
pub fn rank_alternatives(candidates: &[Candidate]) -> Vec<String> {
    let mut ranked: Vec<(&str, f64)> = candidates
        .iter()
        .filter(|c| c.ready)
        .map(|c| (c.account_id.as_str(), c.percent.unwrap_or(0.0)))
        .filter(|(_, percent)| *percent < 100.0)
        .collect();
    ranked.sort_by(|a, b| a.1.total_cmp(&b.1));
    ranked.into_iter().map(|(id, _)| id.to_string()).collect()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IgnoreReason {
    AutoSwitchOff,
    /// No account has room and the reset time is unknown.
    NoRoom,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LimitDecision {
    /// Move the project to `to` and continue the chat there.
    Switch {
        to: String,
    },
    /// No account has room: continue the chat when the window resets.
    ResumeAt {
        at: SystemTime,
    },
    /// The chat's agent runs an account the project no longer uses (another
    /// chat already moved the project): restart it on the project's account.
    Restart,
    Ignore {
        reason: IgnoreReason,
    },
}

pub struct LimitContext<'a> {
    /// The account the chat's agent was started with.
    pub agent_account: &'a str,
    pub project_account: &'a str,
    pub auto_switch: bool,
    pub candidates: &'a [String],
    /// Accounts that reached a limit, until their reset. A cached usage read
    /// can still show room for an account that just reached its limit.
    pub limited_until: &'a HashMap<String, SystemTime>,
    pub resets_at: Option<SystemTime>,
    pub now: SystemTime,
}

#[must_use]
pub fn decide(ctx: &LimitContext<'_>) -> LimitDecision {
    if ctx.agent_account != ctx.project_account {
        return LimitDecision::Restart;
    }
    if !ctx.auto_switch {
        return LimitDecision::Ignore {
            reason: IgnoreReason::AutoSwitchOff,
        };
    }
    let has_room = |id: &&String| {
        ctx.limited_until
            .get(id.as_str())
            .is_none_or(|until| *until <= ctx.now)
    };
    if let Some(to) = ctx.candidates.iter().find(has_room) {
        return LimitDecision::Switch { to: to.clone() };
    }
    match ctx.resets_at {
        Some(at) => LimitDecision::ResumeAt { at },
        None => LimitDecision::Ignore {
            reason: IgnoreReason::NoRoom,
        },
    }
}

#[cfg(test)]
#[path = "decide_tests.rs"]
mod tests;
