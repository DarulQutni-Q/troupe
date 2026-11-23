#[test]
fn projects_against_local_test_server() {
    let Ok(url) = std::env::var("TROUPE_TEST_SERVER") else {
        return;
    };
    assert!(
        url.starts_with("http://127.0.0.1:819"),
        "test server must use the reserved local test ports"
    );
    let config = client::Config {
        base_url: url,
        token: None,
        device_id: "test".into(),
        client_instance_id: "test".into(),
        seed: 1,
    };
    let data =
        client::native::http_send(&config, &client::http::HttpRequest::get("/projects")).unwrap();
    assert!(
        data.get("projects")
            .is_some_and(serde_json::Value::is_array)
    );
}
