//! Link preview resolver: the page title (`og:title` → `twitter:title` →
//! `<title>`), site name and favicon for a URL written in agent chat, so the
//! composer, the user bubble and agent replies can show a link as
//! favicon + title instead of the raw URL.
//!
//! Shared by the desktop `link_preview_resolve` command and the web
//! `POST /link/preview` route so every surface resolves identically.
//!
//! Safety posture (the URL comes from chat text, so it is untrusted):
//! - `http`/`https` only, no embedded credentials.
//! - Every hop (first request, redirects, icon fetch) connects only to public
//!   addresses: IP literals are checked here and DNS answers go through the
//!   shared rebinding-safe resolver (`mcp_catalog::icon::guarded_resolver`).
//! - Bounded: page head ≤ 512 KB, icon ≤ 100 KB, 8 s timeout, 4 redirects.
//! - The favicon reaches the renderer as a `data:` URI, so the existing CSP
//!   (`img-src … data:`) applies unchanged and no remote URL is loaded by the
//!   renderer itself.
//!
//! Best-effort everywhere: every failure returns `None` (the renderer keeps the
//! plain link) plus a durable boundary log carrying the host only — never the
//! full URL, which may embed tokens or passcodes.

mod fetch;
mod html;

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde::Serialize;
use url::Url;

/// Resolved preview for one link. `null` (not an error) means "show the plain
/// link".
#[derive(Debug, Clone, PartialEq, Eq, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LinkPreview {
    /// The final URL after redirects (what the page reports as itself).
    pub url: String,
    /// `og:title`, else `twitter:title`, else `<title>`. Whitespace collapsed.
    pub title: Option<String>,
    /// `og:site_name` when the page sets it.
    pub site_name: Option<String>,
    /// `data:<mime>;base64,…` favicon, when one could be fetched.
    pub icon_data_uri: Option<String>,
}

const CACHE_CAPACITY: usize = 512;
const CACHE_TTL_HIT: Duration = Duration::from_secs(30 * 60);
const CACHE_TTL_MISS: Duration = Duration::from_secs(5 * 60);

type Cache = Mutex<HashMap<String, (Instant, Option<LinkPreview>)>>;

fn cache() -> &'static Cache {
    static CACHE: OnceLock<Cache> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn cached(key: &str) -> Option<Option<LinkPreview>> {
    let guard = cache().lock().ok()?;
    let (at, value) = guard.get(key)?;
    let ttl = if value.is_some() {
        CACHE_TTL_HIT
    } else {
        CACHE_TTL_MISS
    };
    (at.elapsed() < ttl).then(|| value.clone())
}

fn store(key: String, value: Option<LinkPreview>) {
    let Ok(mut guard) = cache().lock() else {
        return;
    };
    if guard.len() >= CACHE_CAPACITY && !guard.contains_key(&key) {
        if let Some(oldest) = guard
            .iter()
            .min_by_key(|(_, (at, _))| *at)
            .map(|(k, _)| k.clone())
        {
            guard.remove(&oldest);
        }
    }
    guard.insert(key, (Instant::now(), value));
}

/// The longest URL either transport resolves; longer input is not a chat link.
pub(crate) const MAX_URL_LEN: usize = 4096;

/// Parse and validate a chat link: `http`/`https`, a host, no credentials,
/// at most [`MAX_URL_LEN`] bytes. The fragment is dropped (it never reaches
/// the server).
pub(crate) fn parse_link(raw: &str) -> Option<Url> {
    if raw.len() > MAX_URL_LEN {
        return None;
    }
    let mut url = Url::parse(raw.trim()).ok()?;
    if !matches!(url.scheme(), "http" | "https") {
        return None;
    }
    if url.host_str().is_none_or(str::is_empty) {
        return None;
    }
    if !url.username().is_empty() || url.password().is_some() {
        return None;
    }
    url.set_fragment(None);
    Some(url)
}

/// Resolve the preview for `raw`. `None` means "render the plain link".
pub async fn resolve(raw: String) -> Option<LinkPreview> {
    let Some(url) = parse_link(&raw) else {
        boundary_info("link preview refused: not an http(s) URL without credentials");
        return None;
    };
    let key = url.as_str().to_string();
    if let Some(hit) = cached(&key) {
        return hit;
    }
    let preview = fetch::resolve_uncached(&url).await;
    store(key, preview.clone());
    preview
}

/// Durable boundary log on both logger facades the crate uses (desktop `log`,
/// `termul-server` `tracing`). Callers pass the host at most — never a full
/// URL.
fn boundary_info(message: &str) {
    log::info!("[link_preview] {message}");
    tracing::info!(target: "termul::link_preview", "{message}");
}

fn boundary_warn(message: &str) {
    log::warn!("[link_preview] {message}");
    tracing::warn!(target: "termul::link_preview", "{message}");
}

#[cfg(test)]
mod tests;
