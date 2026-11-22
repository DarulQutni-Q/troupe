//! `POST /link/preview` — web-parity route for `link_preview_resolve`.
//!
//! The URL is untrusted chat text; the shared resolver
//! ([`crate::link_preview`]) only connects to public addresses over
//! http(s), with bounded size, redirects and time, so the host cannot be used
//! to probe its own network. Reply is `IpcBody<Option<LinkPreview>>`:
//! `{success:true, data:{…}|null}` — `null` means "show the plain link".

use axum::{http::StatusCode, response::IntoResponse, Json};
use serde::Deserialize;

use crate::link_preview::LinkPreview;
use crate::web::fs_api::IpcBody;

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct LinkPreviewRequest {
    pub url: String,
}

pub async fn resolve_preview(Json(req): Json<LinkPreviewRequest>) -> impl IntoResponse {
    // The length cap lives in the shared resolver, so the desktop command
    // returns the same result for the same URL.
    (
        StatusCode::OK,
        Json(IpcBody::<Option<LinkPreview>>::ok(
            crate::link_preview::resolve(req.url).await,
        )),
    )
}
