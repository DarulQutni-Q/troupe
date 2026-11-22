//! Guarded outbound fetches for link previews: the page head, then its icon.

use std::net::IpAddr;
use std::sync::OnceLock;
use std::time::Duration;

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use futures_util::StreamExt;
use url::{Host, Url};

use crate::mcp_catalog::icon::{guarded_resolver, is_public, sniff, system_lookup, Refused};

use super::html::{extract, PageMeta};
use super::{boundary_info, boundary_warn, LinkPreview};

/// Page bytes read at most; the head is almost always far smaller.
pub(super) const MAX_PAGE_BYTES: usize = 512 * 1024;
/// Favicon bytes accepted at most.
pub(super) const MAX_ICON_BYTES: usize = 100 * 1024;
const MAX_REDIRECTS: usize = 4;
const TIMEOUT: Duration = Duration::from_secs(8);
/// Several hosts serve their Open Graph tags only to a browser-like agent.
const USER_AGENT: &str = "Mozilla/5.0 (compatible; TroupeLinkPreview/1.0)";
const PAGE_ACCEPT: &str = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1";
const ICON_ACCEPT: &str = "image/*";

/// Whether an `http(s)` URL may be requested: IP-literal hosts must be public
/// (the guarded resolver never sees them); names are checked at DNS time.
pub(super) fn allowed(url: &Url) -> bool {
    if !matches!(url.scheme(), "http" | "https") {
        return false;
    }
    match url.host() {
        None => false,
        Some(Host::Domain(name)) => {
            let name = name.trim_end_matches('.').to_ascii_lowercase();
            !(name == "localhost"
                || name.ends_with(".localhost")
                || name.ends_with(".local")
                || name.ends_with(".internal")
                || name.ends_with(".home.arpa"))
        }
        Some(Host::Ipv4(ip)) => is_public(IpAddr::V4(ip)),
        Some(Host::Ipv6(ip)) => is_public(IpAddr::V6(ip)),
    }
}

fn client() -> Option<&'static reqwest::Client> {
    static CLIENT: OnceLock<Option<reqwest::Client>> = OnceLock::new();
    CLIENT
        .get_or_init(|| {
            reqwest::Client::builder()
                .user_agent(USER_AGENT)
                .timeout(TIMEOUT)
                .no_proxy()
                // A redirect must not carry the previous path and query (a
                // share link's token) to the next origin.
                .referer(false)
                .dns_resolver(guarded_resolver(is_public, system_lookup()))
                .redirect(reqwest::redirect::Policy::custom(|attempt| {
                    if attempt.previous().len() > MAX_REDIRECTS {
                        return attempt.error(Refused::TooManyRedirects);
                    }
                    if allowed(attempt.url()) {
                        attempt.follow()
                    } else {
                        attempt.error(Refused::NonPublicAddress)
                    }
                }))
                .build()
                .map_err(|e| boundary_warn(&format!("link preview client failed to build: {e}")))
                .ok()
        })
        .as_ref()
}

fn host_of(url: &Url) -> &str {
    url.host_str().unwrap_or("")
}

/// GET `url` and read at most `limit` bytes. For a page, reading stops early
/// once `</head>` arrives. Returns the final URL, lowercase MIME and body.
async fn get_bounded(
    url: &Url,
    accept: &str,
    limit: usize,
    stop_at_head: bool,
) -> Option<(Url, String, Vec<u8>)> {
    let client = client()?;
    let response = match client
        .get(url.clone())
        .header(reqwest::header::ACCEPT, accept)
        .send()
        .await
    {
        Ok(response) => response,
        Err(e) => {
            boundary_info(&format!(
                "link preview fetch failed for host {}: {}",
                host_of(url),
                e.without_url()
            ));
            return None;
        }
    };
    let status = response.status();
    if !status.is_success() {
        boundary_info(&format!(
            "link preview fetch returned {status} for host {}",
            host_of(url)
        ));
        return None;
    }
    let final_url = response.url().clone();
    let mime = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|v| {
            v.split(';')
                .next()
                .unwrap_or("")
                .trim()
                .to_ascii_lowercase()
        })
        .unwrap_or_default();
    let mut body = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = match chunk {
            Ok(chunk) => chunk,
            // A page head cut short can still carry its title; an icon cut
            // short is broken, so the resolver must try the next candidate.
            Err(_) if stop_at_head => break,
            Err(e) => {
                boundary_info(&format!(
                    "link preview icon read failed from {}: {}",
                    host_of(url),
                    e.without_url()
                ));
                return None;
            }
        };
        let room = limit.saturating_sub(body.len());
        body.extend_from_slice(&chunk[..chunk.len().min(room)]);
        if body.len() >= limit {
            if !stop_at_head {
                // An icon cut short is unusable.
                boundary_info(&format!(
                    "link preview icon refused oversized payload from {}",
                    host_of(url)
                ));
                return None;
            }
            break;
        }
        if stop_at_head && contains_head_end(&body) {
            break;
        }
    }
    Some((final_url, mime, body))
}

fn contains_head_end(body: &[u8]) -> bool {
    body.windows(7).any(|w| w.eq_ignore_ascii_case(b"</head>"))
}

/// The MIME an icon payload actually is: the shared sniffer, plus ICO which
/// the MCP-icon sniffer deliberately does not accept.
pub(super) fn icon_mime(bytes: &[u8]) -> Option<&'static str> {
    if let Some(kind) = sniff(bytes) {
        return Some(kind.mime());
    }
    matches!(bytes, [0, 0, 1, 0, ..]).then_some("image/x-icon")
}

/// A `data:image/…` icon declared inline by the page, kept when small enough.
fn inline_icon(url: &Url) -> Option<String> {
    let raw = url.as_str();
    (raw.starts_with("data:image/") && raw.len() <= MAX_ICON_BYTES * 4 / 3 + 64)
        .then(|| raw.to_string())
}

async fn fetch_icon(url: &Url) -> Option<String> {
    if url.scheme() == "data" {
        return inline_icon(url);
    }
    if !allowed(url) {
        return None;
    }
    let (_, _, bytes) = get_bounded(url, ICON_ACCEPT, MAX_ICON_BYTES, false).await?;
    let mime = icon_mime(&bytes)?;
    Some(format!("data:{mime};base64,{}", B64.encode(&bytes)))
}

/// The icon candidates in order: declared icons, then `/favicon.ico`.
fn icon_candidates(meta: &PageMeta, page: &Url) -> Vec<Url> {
    let mut out: Vec<Url> = meta.icons.iter().take(3).cloned().collect();
    if let Ok(fallback) = page.join("/favicon.ico") {
        if !out.contains(&fallback) {
            out.push(fallback);
        }
    }
    out
}

pub(super) async fn resolve_uncached(url: &Url) -> Option<LinkPreview> {
    if !allowed(url) {
        boundary_info(&format!(
            "link preview refused non-public host {}",
            host_of(url)
        ));
        return None;
    }
    let (final_url, mime, body) = get_bounded(url, PAGE_ACCEPT, MAX_PAGE_BYTES, true).await?;
    let meta = if mime.is_empty() || mime == "text/html" || mime == "application/xhtml+xml" {
        extract(&String::from_utf8_lossy(&body), &final_url)
    } else {
        // A direct file link (PDF, image, …): no title, the icon is the site's.
        PageMeta::default()
    };
    let mut icon_data_uri = None;
    for candidate in icon_candidates(&meta, &final_url) {
        if let Some(icon) = fetch_icon(&candidate).await {
            icon_data_uri = Some(icon);
            break;
        }
    }
    if meta.title.is_none() && icon_data_uri.is_none() {
        boundary_info(&format!(
            "link preview found no title or icon for host {}",
            host_of(&final_url)
        ));
        return None;
    }
    Some(LinkPreview {
        url: final_url.to_string(),
        title: meta.title,
        site_name: meta.site_name,
        icon_data_uri,
    })
}
