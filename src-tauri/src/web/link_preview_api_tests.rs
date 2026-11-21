//! `POST /link/preview` route: same `IpcBody<Option<LinkPreview>>` envelope
//! the desktop `link_preview_resolve` command returns as `IpcResult`.

use axum::body::{to_bytes, Body};
use axum::http::{Request, StatusCode};
use axum::routing::post;
use tower::ServiceExt;

use super::link_preview_api::resolve_preview;

async fn post_url(url: &str) -> (StatusCode, serde_json::Value) {
    let app = axum::Router::new().route("/link/preview", post(resolve_preview));
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/link/preview")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::json!({ "url": url }).to_string()))
                .expect("request"),
        )
        .await
        .expect("response");
    let status = response.status();
    let bytes = to_bytes(response.into_body(), 1 << 20).await.expect("body");
    (status, serde_json::from_slice(&bytes).expect("json"))
}

#[tokio::test]
async fn a_refused_url_is_a_successful_null_preview() {
    for url in [
        "javascript:alert(1)",
        "http://127.0.0.1:9/",
        "http://localhost/",
    ] {
        let (status, body) = post_url(url).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(
            body,
            serde_json::json!({ "success": true, "data": null }),
            "{url}"
        );
    }
}

#[tokio::test]
async fn an_oversized_url_is_refused_without_fetching() {
    let url = format!("https://example.com/{}", "a".repeat(5000));
    let (_, body) = post_url(&url).await;
    assert_eq!(body, serde_json::json!({ "success": true, "data": null }));
}
