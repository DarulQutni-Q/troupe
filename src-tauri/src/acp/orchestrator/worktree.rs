//! The per-run git worktree: a snapshot of the parent's current state
//! (including uncommitted changes) that the child works in, kept after
//! settle for review. The sweep removes abandoned worktrees at startup.

use std::path::PathBuf;

use tokio::runtime::Handle;

use crate::acp::orchestrator::run::RunId;
use crate::acp::subagents::{SubagentWorkspace, SubagentWorkspaceMode};

/// Prepare the run's worktree under `root`: snapshot the parent's state
/// (uncommitted changes included), then create the worktree on the
/// snapshot. Returns the workspace record with branch and base label.
pub(crate) async fn prepare(root: &str, run: &RunId) -> Result<SubagentWorkspace, String> {
    let _ = (root, run);
    Err("the worktree workspace is not available yet".to_string())
}

/// The diff summary of a settled worktree run, when git can produce one.
pub(crate) async fn diff_stat(path: &str) -> Option<String> {
    let _ = path;
    None
}

/// Remove `sub-*` worktrees older than the sweep age whose run is not
/// live, then delete their branches. Best-effort: failures log and
/// continue.
pub(crate) fn sweep(handle: &Handle, roots: Vec<PathBuf>) {
    let _ = (handle, roots, SubagentWorkspaceMode::Worktree);
}
