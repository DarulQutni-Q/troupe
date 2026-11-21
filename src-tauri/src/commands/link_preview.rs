//! `link_preview_resolve` — favicon + title for a link written in agent chat
//! (see [`crate::link_preview`]).

use super::IpcResult;
use crate::link_preview::LinkPreview;

/// Resolve the preview for `url`. `IpcResult::success(None)` means "show the
/// plain link"; the shared resolver logs its own boundary events (host only).
#[tauri::command]
pub async fn link_preview_resolve(url: String) -> Result<IpcResult<Option<LinkPreview>>, String> {
    Ok(IpcResult::success(crate::link_preview::resolve(url).await))
}
