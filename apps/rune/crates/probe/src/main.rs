use client::{
    Config,
    cursor::Cursor,
    http::HttpRequest,
    native::{Driver, http_send},
    ws,
};
use std::time::Duration;
fn main() {
    if let Err(e) = run() {
        eprintln!("troupe-probe: {e}");
        std::process::exit(1);
    }
}
fn run() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = std::env::args().skip(1);
    let mut url = None;
    let mut token = None;
    let command = loop {
        match args.next().as_deref() {
            Some("--url") => url = args.next(),
            Some("--token") => token = args.next(),
            Some(c) => break c.to_owned(),
            None => {
                return Err(
                    "usage: troupe-probe --url URL --token TOKEN projects|chat ID --follow".into(),
                );
            }
        }
    };
    let config = Config {
        base_url: url.ok_or("--url required")?,
        token,
        device_id: "probe".into(),
        client_instance_id: format!("probe-{}", std::process::id()),
        seed: u64::from(std::process::id()),
    };
    match command.as_str() {
        "projects" => println!(
            "{}",
            serde_json::to_string_pretty(&http_send(&config, &HttpRequest::get("/projects"))?)?
        ),
        "chat" => {
            let id = args.next().ok_or("session id required")?;
            let follow = args.any(|a| a == "--follow");
            let mut driver = Driver::new(ws::WsClient::new(config));
            driver.command(ws::Command::Subscribe {
                session_id: id,
                cursor: Cursor::default(),
            });
            driver.start();
            loop {
                match driver.next(Duration::from_secs(30)) {
                    Some(ws::Output::Event(e)) => println!("{}", serde_json::to_string(&e)?),
                    Some(ws::Output::Snapshot(s)) => println!("{}", serde_json::to_string(&s)?),
                    Some(ws::Output::SessionLost { error, .. }) => {
                        return Err(error.message.into());
                    }
                    Some(_) => {}
                    None if !follow => break,
                    None => {}
                }
            }
        }
        "terminal" => {
            use client::terminal::{Command, Output, TerminalClient};
            use std::io::Write;
            let id = args.next().ok_or("terminal id required")?;
            let mut claim = None;
            let mut attach = false;
            while let Some(arg) = args.next() {
                match arg.as_str() {
                    "--attach" => attach = true,
                    "--claim" => claim = args.next(),
                    _ => return Err("unknown terminal option".into()),
                }
            }
            if !attach {
                return Err("--attach required".into());
            }
            let mut driver = Driver::new(TerminalClient::new(config));
            driver.command(Command::Attach {
                terminal_id: id,
                claim: claim.ok_or("--claim required")?,
                log_epoch: None,
                last_seq: 0,
            });
            driver.start();
            loop {
                match driver.next(Duration::from_secs(30)) {
                    Some(Output::Replay { bytes, .. } | Output::Data { bytes, .. }) => {
                        std::io::stdout().write_all(&bytes)?;
                        std::io::stdout().flush()?;
                    }
                    Some(Output::Lost { error, .. }) => return Err(error.message.into()),
                    Some(_) | None => {}
                }
            }
        }
        _ => return Err("unsupported command".into()),
    }
    Ok(())
}
