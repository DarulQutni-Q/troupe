//! Minimal `<head>` metadata extraction for link previews. Not a full HTML
//! parser: it scans `<meta>`, `<link>` and `<title>` tags with bounded regexes,
//! which is all a preview needs and keeps the crate free of an HTML5 parser.

use std::sync::OnceLock;

use regex::Regex;
use url::Url;

/// The longest title a preview keeps (in chars) before it is cut with `…`.
const MAX_TITLE_CHARS: usize = 300;

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(super) struct PageMeta {
    pub title: Option<String>,
    pub site_name: Option<String>,
    /// Declared icon URLs, best first, resolved against the page URL.
    pub icons: Vec<Url>,
}

/// A start tag whose `>` may appear inside a quoted attribute value.
fn tag_re(name: &str) -> Regex {
    Regex::new(&format!(r#"(?is)<{name}\b(?:[^>"']|"[^"]*"|'[^']*')*>"#)).expect("static tag regex")
}

/// Regions whose markup is not live (comments, scripts, styles, templates),
/// plus whole `<title>`/`<textarea>` elements (their content is text, so a
/// `<script>` spelled inside one is not an element) and any other start tag,
/// all kept as written. Matching is leftmost-first, so a quoted
/// `<script>` inside an attribute value is consumed by its enclosing tag and
/// never mistaken for an element.
fn inert_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        const ATTRS: &str = r#"(?:[^>"']|"[^"]*"|'[^']*')*"#;
        let pattern = format!(
            r"(?is)(?P<inert><!--.*?(?:-->|\z)|<script\b{ATTRS}>.*?(?:</script\s*>|\z)|<style\b{ATTRS}>.*?(?:</style\s*>|\z)|<template\b{ATTRS}>.*?(?:</template\s*>|\z))|(?P<title_open><title\b{ATTRS}>)(?P<title_body>.*?)(?P<title_close></title\s*>|\z)|(?P<textarea><textarea\b{ATTRS}>.*?(?:</textarea\s*>|\z))|<[a-z]{ATTRS}>"
        );
        Regex::new(&pattern).expect("inert regex")
    })
}

/// Tokens inside a template: text-only regions (comments, scripts, styles,
/// titles, textareas) and other start tags are skipped whole, so a template
/// marker written inside one, or inside a quoted attribute, is never counted.
fn template_token_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        const ATTRS: &str = r#"(?:[^>"']|"[^"]*"|'[^']*')*"#;
        let pattern = format!(
            r"(?is)(?P<close></template\s*>)|(?P<open><template\b{ATTRS}>)|<!--.*?(?:-->|\z)|<script\b{ATTRS}>.*?(?:</script\s*>|\z)|<style\b{ATTRS}>.*?(?:</style\s*>|\z)|<title\b{ATTRS}>.*?(?:</title\s*>|\z)|<textarea\b{ATTRS}>.*?(?:</textarea\s*>|\z)|<[a-z]{ATTRS}>"
        );
        Regex::new(&pattern).expect("template token regex")
    })
}

/// End offset of the template starting at `start`, counting nested
/// templates; the end of `html` when it never closes.
fn template_end(html: &str, start: usize) -> usize {
    let mut depth = 0usize;
    for caps in template_token_re().captures_iter(&html[start..]) {
        if caps.name("open").is_some() {
            depth += 1;
        } else if let Some(close) = caps.name("close") {
            depth = depth.saturating_sub(1);
            if depth == 0 {
                return start + close.end();
            }
        }
    }
    html.len()
}

/// `html` with inert regions blanked out and every live tag kept as written.
fn live_html(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let mut pos = 0;
    while let Some(caps) = inert_re().captures_at(html, pos) {
        let whole = caps.get(0).expect("match");
        out.push_str(&html[pos..whole.start()]);
        if let (Some(open), Some(body), Some(close)) = (
            caps.name("title_open"),
            caps.name("title_body"),
            caps.name("title_close"),
        ) {
            // Title content is text: keep it for the fallback title, but
            // escape `<` so the meta/link scans cannot read it as markup.
            out.push_str(open.as_str());
            out.push_str(&body.as_str().replace('<', "&lt;"));
            out.push_str(close.as_str());
            pos = whole.end();
            continue;
        }
        if caps.name("textarea").is_some() {
            // Textarea content is text no preview needs.
            out.push(' ');
            pos = whole.end();
            continue;
        }
        if caps.name("inert").is_none() {
            out.push_str(whole.as_str());
            pos = whole.end();
            continue;
        }
        out.push(' ');
        let is_template = whole
            .as_str()
            .get(..9)
            .is_some_and(|p| p.eq_ignore_ascii_case("<template"));
        pos = if is_template {
            template_end(html, whole.start())
        } else {
            whole.end()
        };
    }
    out.push_str(&html[pos..]);
    out
}

/// Whether the live markup (outside comments, scripts, styles, templates and
/// text-only elements) has closed the head, so a page read can stop.
pub(super) fn has_live_head_end(html: &str) -> bool {
    let lower = html.to_ascii_lowercase();
    if !lower.contains("</head") {
        return false;
    }
    // Drop every live start tag (quote-aware) so a `</head>` written in an
    // attribute value does not count either.
    // Complete start tags go first, so the unfinished-tag search below can
    // never start inside a finished tag's attribute value.
    let live = live_html(&lower);
    let text = start_tag_re().replace_all(&live, " ");
    // A read chunk can end inside a start tag; that unfinished tag is
    // attribute text too.
    let text = match incomplete_tag_re().find(&text) {
        Some(tail) => &text[..tail.start()],
        None => text.as_ref(),
    };
    text.contains("</head>")
}

/// A start tag still open at the end of the read so far (quote-aware).
fn incomplete_tag_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r#"(?s)<[a-z](?:[^>"']|"[^"]*"|'[^']*')*(?:"[^"]*|'[^']*)?\z"#)
            .expect("incomplete tag regex")
    })
}

fn start_tag_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r#"(?is)<[a-z](?:[^>"']|"[^"]*"|'[^']*')*>"#).expect("start tag regex")
    })
}

fn meta_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| tag_re("meta"))
}

fn link_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| tag_re("link"))
}

fn title_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?is)<title\b[^>]*>(.*?)</title\s*>").expect("title regex"))
}

fn attr_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r#"(?s)([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))"#,
        )
        .expect("attr regex")
    })
}

/// The tag's attributes as lowercase-name → raw value pairs.
fn attrs(tag: &str) -> Vec<(String, String)> {
    // Skip the tag name itself so `<meta` is not read as an attribute.
    let body = tag.trim_start_matches('<');
    let body = body
        .find(|c: char| c.is_ascii_whitespace())
        .map_or("", |i| &body[i..]);
    attr_re()
        .captures_iter(body)
        .map(|c| {
            let value = c
                .get(2)
                .or_else(|| c.get(3))
                .or_else(|| c.get(4))
                .map_or("", |m| m.as_str());
            (c[1].to_ascii_lowercase(), value.to_string())
        })
        .collect()
}

fn attr<'a>(attrs: &'a [(String, String)], name: &str) -> Option<&'a str> {
    attrs
        .iter()
        .find(|(k, _)| k == name)
        .map(|(_, v)| v.as_str())
}

/// Decode the HTML entities a title realistically carries: the five named
/// XML entities, `&nbsp;`, and numeric `&#…;` / `&#x…;` references.
pub(super) fn decode_entities(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    let mut rest = raw;
    while let Some(amp) = rest.find('&') {
        out.push_str(&rest[..amp]);
        rest = &rest[amp..];
        // Byte scan: `;` is ASCII, so its index is always a char boundary
        // (slicing the str at a fixed byte count could split a code point).
        let window = &rest.as_bytes()[..rest.len().min(12)];
        let Some(semi) = window.iter().position(|b| *b == b';') else {
            out.push('&');
            rest = &rest[1..];
            continue;
        };
        let entity = &rest[1..semi];
        let decoded = match entity {
            "amp" => Some('&'),
            "lt" => Some('<'),
            "gt" => Some('>'),
            "quot" => Some('"'),
            "apos" => Some('\''),
            "nbsp" => Some(' '),
            _ => entity
                .strip_prefix("#x")
                .or_else(|| entity.strip_prefix("#X"))
                .and_then(|hex| u32::from_str_radix(hex, 16).ok())
                .or_else(|| entity.strip_prefix('#').and_then(|d| d.parse().ok()))
                .and_then(char::from_u32),
        };
        match decoded {
            Some(c) => {
                out.push(c);
                rest = &rest[semi + 1..];
            }
            None => {
                out.push('&');
                rest = &rest[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

/// Entity-decode, collapse whitespace, trim and cap a title-like value.
/// Empty → `None`.
pub(super) fn clean_text(raw: &str) -> Option<String> {
    let decoded = decode_entities(raw);
    let collapsed = decoded.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.is_empty() {
        return None;
    }
    if collapsed.chars().count() <= MAX_TITLE_CHARS {
        return Some(collapsed);
    }
    let mut cut: String = collapsed.chars().take(MAX_TITLE_CHARS).collect();
    cut.push('…');
    Some(cut)
}

/// Rank a `<link rel>` icon: lower is better. `None` = not an icon.
fn icon_rank(rel: &str, href: &str, sizes: Option<&str>) -> Option<u32> {
    let rel = rel.to_ascii_lowercase();
    let tokens: Vec<&str> = rel.split_ascii_whitespace().collect();
    let is_icon = tokens.contains(&"icon");
    let is_touch = tokens
        .iter()
        .any(|t| *t == "apple-touch-icon" || *t == "apple-touch-icon-precomposed");
    if !is_icon && !is_touch {
        return None;
    }
    if href.trim().is_empty() {
        return None;
    }
    let base = if is_icon { 0 } else { 100 };
    // Prefer small raster/vector icons sized for an inline 16px chip.
    let size_penalty = sizes
        .and_then(|s| s.split(['x', 'X']).next())
        .and_then(|w| w.trim().parse::<u32>().ok())
        .map_or(10, |w| w.abs_diff(32).min(90));
    Some(base + size_penalty)
}

/// Extract the preview metadata from a page's HTML (only the head matters,
/// but a body-level tag is still accepted).
pub(super) fn extract(html: &str, page_url: &Url) -> PageMeta {
    // Commented-out or scripted tags must not win over the live ones.
    let live = live_html(html);
    let html = live.as_str();
    let mut og_title = None;
    let mut twitter_title = None;
    let mut site_name = None;
    for m in meta_re().find_iter(html) {
        let a = attrs(m.as_str());
        let key = attr(&a, "property")
            .or_else(|| attr(&a, "name"))
            .map(str::to_ascii_lowercase);
        let Some(content) = attr(&a, "content") else {
            continue;
        };
        match key.as_deref() {
            Some("og:title") if og_title.is_none() => og_title = clean_text(content),
            Some("twitter:title") if twitter_title.is_none() => twitter_title = clean_text(content),
            Some("og:site_name") if site_name.is_none() => site_name = clean_text(content),
            _ => {}
        }
    }
    let title_tag = title_re()
        .captures(html)
        .and_then(|c| clean_text(c.get(1).map_or("", |m| m.as_str())));

    let mut ranked: Vec<(u32, usize, Url)> = Vec::new();
    for (index, m) in link_re().find_iter(html).enumerate() {
        let a = attrs(m.as_str());
        let (Some(rel), Some(href)) = (attr(&a, "rel"), attr(&a, "href")) else {
            continue;
        };
        let href = decode_entities(href);
        let Some(rank) = icon_rank(rel, &href, attr(&a, "sizes")) else {
            continue;
        };
        let Ok(url) = page_url.join(href.trim()) else {
            continue;
        };
        if matches!(url.scheme(), "http" | "https" | "data") {
            ranked.push((rank, index, url));
        }
    }
    ranked.sort_by_key(|(rank, index, _)| (*rank, *index));

    PageMeta {
        title: og_title.or(twitter_title).or(title_tag),
        site_name,
        icons: ranked.into_iter().map(|(_, _, url)| url).collect(),
    }
}
