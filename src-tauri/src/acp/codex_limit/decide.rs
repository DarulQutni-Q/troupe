//! Codex inputs for the shared limit decision.

use crate::acp::claude_limit::decide::Candidate;
use crate::acp::codex_accounts::usage::{CodexAccountUsage, CodexUsageStatus};
use crate::acp::codex_accounts::CodexAccountsSnapshot;

pub use crate::acp::claude_limit::decide::{
    decide, first_with_room, plan_resume, rank_alternatives, ChatHolder, IgnoreReason,
    LimitContext, LimitDecision, ResumePlan, SHORTEST_WINDOW,
};

/// Every Account of `snapshot` except `exclude`, with its readiness and the
/// percent used of its most used window.
#[must_use]
pub fn candidates(
    snapshot: &CodexAccountsSnapshot,
    usage: &[CodexAccountUsage],
    exclude: Option<&str>,
) -> Vec<Candidate> {
    snapshot
        .profiles
        .iter()
        .filter(|account| Some(account.id.as_str()) != exclude)
        .map(|account| {
            let read = usage.iter().find(|u| u.account_id == account.id);
            Candidate {
                account_id: account.id.clone(),
                ready: account.signed_in == Some(true)
                    && read.is_none_or(|u| u.status != CodexUsageStatus::SignedOut),
                percent: most_used(read).map(|(percent, _)| percent),
            }
        })
        .collect()
}

/// The percent used of the most used window, and when it resets.
#[must_use]
pub fn most_used(usage: Option<&CodexAccountUsage>) -> Option<(f64, Option<&str>)> {
    let usage = usage.filter(|u| u.status == CodexUsageStatus::Ok)?;
    usage
        .windows
        .iter()
        .reduce(|top, window| {
            if window.percent > top.percent {
                window
            } else {
                top
            }
        })
        .map(|window| (window.percent, window.resets_at.as_deref()))
}

#[cfg(test)]
#[path = "decide_tests.rs"]
mod tests;
