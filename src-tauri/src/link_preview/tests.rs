use url::Url;

use super::fetch::{allowed, icon_mime};
use super::html::{clean_text, decode_entities, extract};
use super::{parse_link, LinkPreview};

fn page() -> Url {
    Url::parse("https://example.com/a/b?x=1").unwrap()
}

#[test]
fn og_title_wins_over_twitter_and_title_tag() {
    let html = r#"<html><head>
        <title>Tag title</title>
        <meta name="twitter:title" content="Twitter title">
        <meta property="og:title" content="Zoom Recordings" />
        <meta property="og:site_name" content='Zoom'>
    </head></html>"#;
    let meta = extract(html, &page());
    assert_eq!(meta.title.as_deref(), Some("Zoom Recordings"));
    assert_eq!(meta.site_name.as_deref(), Some("Zoom"));
}

#[test]
fn falls_back_to_title_tag_with_entities_and_whitespace() {
    let html = "<head><title>\n  Tom &amp; Jerry &#8211; &#x41;  </title></head>";
    let meta = extract(html, &page());
    assert_eq!(meta.title.as_deref(), Some("Tom & Jerry \u{2013} A"));
}

#[test]
fn meta_attribute_order_and_case_do_not_matter() {
    let html = r#"<META CONTENT="Upper" PROPERTY="og:title">"#;
    assert_eq!(extract(html, &page()).title.as_deref(), Some("Upper"));
}

#[test]
fn icons_rank_rel_icon_near_32px_first_and_resolve_relative_hrefs() {
    let html = r#"
        <link rel="apple-touch-icon" href="/touch.png">
        <link rel="icon" sizes="192x192" href="big.png">
        <link rel="shortcut icon" href="//cdn.example.net/fav.ico">
        <link rel="icon" sizes="32x32" href="/fav-32.png">
        <link rel="stylesheet" href="/style.css">"#;
    let icons: Vec<String> = extract(html, &page())
        .icons
        .into_iter()
        .map(|u| u.to_string())
        .collect();
    assert_eq!(
        icons,
        vec![
            "https://example.com/fav-32.png",
            "https://cdn.example.net/fav.ico",
            "https://example.com/a/big.png",
            "https://example.com/touch.png",
        ]
    );
}

#[test]
fn a_quoted_gt_stays_inside_the_attribute_value() {
    let html = r#"<meta property="og:title" content="A > B"><title>Fallback</title>"#;
    assert_eq!(extract(html, &page()).title.as_deref(), Some("A > B"));
}

#[test]
fn commented_out_and_scripted_tags_are_ignored() {
    let html = r#"<!-- <meta property="og:title" content="Old"> <link rel="icon" href="/old.ico"> -->
        <script>document.write('<meta property="og:title" content="Script">')</script>
        <meta property="og:title" content="Current">
        <link rel="icon" href="/new.png">"#;
    let meta = extract(html, &page());
    assert_eq!(meta.title.as_deref(), Some("Current"));
    assert_eq!(meta.icons[0].as_str(), "https://example.com/new.png");
}

#[test]
fn a_quoted_inert_tag_name_does_not_start_an_inert_region() {
    let html =
        r#"<meta property="og:title" content="Using <script> safely"><title>Fallback</title>"#;
    assert_eq!(
        extract(html, &page()).title.as_deref(),
        Some("Using <script> safely")
    );
    let html = r#"<meta name="x" content="a <!-- b"><title>Fallback</title>"#;
    assert_eq!(extract(html, &page()).title.as_deref(), Some("Fallback"));
}

#[test]
fn no_metadata_yields_empty_meta() {
    let meta = extract("<html><body>hi</body></html>", &page());
    assert_eq!(meta.title, None);
    assert!(meta.icons.is_empty());
}

#[test]
fn entity_decoder_keeps_unknown_entities_and_multibyte_text() {
    assert_eq!(decode_entities("a &bogus; b"), "a &bogus; b");
    assert_eq!(decode_entities("é&é ünï"), "é&é ünï");
    assert_eq!(decode_entities("&lt;b&gt; &quot;q&quot;"), "<b> \"q\"");
}

#[test]
fn long_titles_are_capped() {
    let long = "x".repeat(400);
    let cleaned = clean_text(&long).unwrap();
    assert_eq!(cleaned.chars().count(), 301);
    assert!(cleaned.ends_with('…'));
    assert_eq!(clean_text("   "), None);
}

#[test]
fn parse_link_accepts_http_and_https_only_without_credentials() {
    assert_eq!(
        parse_link("https://zoom.us/rec/share/abc#frag").map(|u| u.to_string()),
        Some("https://zoom.us/rec/share/abc".to_string())
    );
    assert!(parse_link("http://example.com").is_some());
    assert!(parse_link("ftp://example.com").is_none());
    assert!(parse_link("javascript:alert(1)").is_none());
    assert!(parse_link("file:///etc/passwd").is_none());
    assert!(parse_link("https://user:pw@example.com").is_none());
    assert!(parse_link("not a url").is_none());
    let long = format!("https://example.com/{}", "a".repeat(super::MAX_URL_LEN));
    assert!(
        parse_link(&long).is_none(),
        "both transports refuse an oversized URL"
    );
}

#[test]
fn local_and_private_hosts_are_refused() {
    for raw in [
        "http://localhost:3000",
        "http://app.localhost",
        "http://printer.local",
        "http://127.0.0.1",
        "http://10.0.0.5",
        "http://192.168.1.1",
        "http://169.254.169.254/latest/meta-data",
        "http://[::1]/",
        "http://[::ffff:127.0.0.1]/",
        "http://metadata.google.internal",
    ] {
        assert!(
            !allowed(&Url::parse(raw).unwrap()),
            "{raw} should be refused"
        );
    }
    assert!(allowed(&Url::parse("https://example.com").unwrap()));
    assert!(allowed(&Url::parse("http://93.184.216.34").unwrap()));
}

#[test]
fn icon_sniffing_accepts_ico_png_svg_and_rejects_html() {
    assert_eq!(icon_mime(&[0, 0, 1, 0, 1, 0]), Some("image/x-icon"));
    assert_eq!(icon_mime(b"\x89PNG\r\n\x1a\n...."), Some("image/png"));
    assert_eq!(icon_mime(b"<svg xmlns='x'></svg>"), Some("image/svg+xml"));
    assert_eq!(icon_mime(b"<!doctype html><html>"), None);
}

#[test]
fn preview_serializes_camel_case_for_the_renderer_contract() {
    let preview = LinkPreview {
        url: "https://example.com/".into(),
        title: Some("T".into()),
        site_name: None,
        icon_data_uri: Some("data:image/png;base64,AA==".into()),
    };
    let json = serde_json::to_value(&preview).unwrap();
    assert_eq!(
        json,
        serde_json::json!({
            "url": "https://example.com/",
            "title": "T",
            "siteName": null,
            "iconDataUri": "data:image/png;base64,AA=="
        })
    );
}

#[tokio::test]
async fn resolve_refuses_non_http_and_local_urls_without_network() {
    assert_eq!(super::resolve("javascript:alert(1)".into()).await, None);
    assert_eq!(super::resolve("http://127.0.0.1:9/".into()).await, None);
}
