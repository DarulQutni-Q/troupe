//! The desktop backend: one thread per socket (blocking `tungstenite`), a
//! channel back to the [`Driver`] that steps the machine, and blocking HTTP
//! through `ureq`.

use std::collections::{HashMap, VecDeque};
use std::io::ErrorKind;
use std::net::TcpStream;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender, TryRecvError};
use std::thread;
use std::time::{Duration, Instant};

use rune_core::machine::Attempt;
use serde_json::Value;
use tungstenite::stream::MaybeTlsStream;
use tungstenite::{Message, WebSocket};

use crate::http::{COMMAND_ID_HEADER, HttpError, HttpRequest, Method, parse_body};
use crate::machine::{Config, Effect, Event, Machine, SocketEvent};

/// How long a socket thread blocks on a read before it checks for frames to
/// write. It bounds the delay of an outgoing frame.
const READ_SLICE: Duration = Duration::from_millis(5);

enum Outgoing {
    Text(String),
    Close,
}

/// Runs one machine: carries its effects out and feeds it socket events and
/// timer ticks. Single-threaded; the socket threads only talk to it through a
/// channel.
pub struct Driver<M: Machine> {
    machine: M,
    events: Receiver<SocketEvent>,
    events_tx: Sender<SocketEvent>,
    sockets: HashMap<Attempt, Sender<Outgoing>>,
    wakes: Vec<f64>,
    outputs: VecDeque<M::Output>,
    epoch: Instant,
}

impl<M: Machine> Driver<M> {
    pub fn new(machine: M) -> Self {
        let (events_tx, events) = mpsc::channel();
        Self {
            machine,
            events,
            events_tx,
            sockets: HashMap::new(),
            wakes: Vec::new(),
            outputs: VecDeque::new(),
            epoch: Instant::now(),
        }
    }

    #[must_use]
    pub fn machine(&self) -> &M {
        &self.machine
    }

    /// Seconds since the driver started.
    #[must_use]
    pub fn now(&self) -> f64 {
        self.epoch.elapsed().as_secs_f64()
    }

    pub fn start(&mut self) {
        self.apply(Event::Start);
    }

    pub fn stop(&mut self) {
        self.apply(Event::Stop);
    }

    pub fn command(&mut self, command: M::Command) {
        self.apply(Event::Command(command));
    }

    /// The next output, waiting at most `timeout` for one.
    pub fn next(&mut self, timeout: Duration) -> Option<M::Output> {
        let deadline = self.now() + timeout.as_secs_f64();
        loop {
            if let Some(output) = self.outputs.pop_front() {
                return Some(output);
            }
            let now = self.now();
            if self.wakes.iter().any(|t| *t <= now) {
                self.wakes.retain(|t| *t > now);
                self.apply(Event::Tick);
                continue;
            }
            if now >= deadline {
                return None;
            }
            let until = self.wakes.iter().copied().fold(deadline, f64::min);
            match self
                .events
                .recv_timeout(Duration::from_secs_f64((until - now).max(0.0)))
            {
                Ok(event) => self.apply(Event::Socket(event)),
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => return None,
            }
        }
    }

    fn apply(&mut self, event: Event<M::Command>) {
        let now = self.now();
        for effect in self.machine.step(event, now) {
            match effect {
                Effect::Open { socket, url } => {
                    let (tx, rx) = mpsc::channel();
                    self.sockets.insert(socket, tx);
                    let events = self.events_tx.clone();
                    thread::spawn(move || run_socket(socket, &url, &events, &rx));
                }
                Effect::Send { socket, text } => {
                    if let Some(tx) = self.sockets.get(&socket) {
                        let _ = tx.send(Outgoing::Text(text));
                    }
                }
                Effect::Close { socket } => {
                    if let Some(tx) = self.sockets.remove(&socket) {
                        let _ = tx.send(Outgoing::Close);
                    }
                }
                Effect::WakeAt(due) => self.wakes.push(due),
                Effect::Output(output) => self.outputs.push_back(output),
            }
        }
    }
}

impl<M: Machine> Drop for Driver<M> {
    fn drop(&mut self) {
        for (_, tx) in self.sockets.drain() {
            let _ = tx.send(Outgoing::Close);
        }
    }
}

fn run_socket(
    socket: Attempt,
    url: &str,
    events: &Sender<SocketEvent>,
    outgoing: &Receiver<Outgoing>,
) {
    let mut ws = match tungstenite::connect(url) {
        Ok((ws, _)) => ws,
        Err(e) => {
            log::info!("[client] connect {url} failed: {e}");
            let _ = events.send(SocketEvent::Closed { socket, code: None });
            return;
        }
    };
    if let MaybeTlsStream::Plain(stream) = ws.get_ref() {
        let _ = TcpStream::set_read_timeout(stream, Some(READ_SLICE));
    }
    let _ = events.send(SocketEvent::Opened(socket));
    let code = pump(socket, &mut ws, events, outgoing);
    let _ = events.send(SocketEvent::Closed { socket, code });
}

/// Moves frames both ways until the socket ends; returns its close code.
fn pump(
    socket: Attempt,
    ws: &mut WebSocket<MaybeTlsStream<TcpStream>>,
    events: &Sender<SocketEvent>,
    outgoing: &Receiver<Outgoing>,
) -> Option<u16> {
    loop {
        loop {
            match outgoing.try_recv() {
                Ok(Outgoing::Text(text)) => {
                    if let Err(e) = ws.send(Message::text(text)) {
                        log::info!("[client] send failed: {e}");
                        return None;
                    }
                }
                Ok(Outgoing::Close) | Err(TryRecvError::Disconnected) => {
                    let _ = ws.close(None);
                    let _ = ws.flush();
                    return None;
                }
                Err(TryRecvError::Empty) => break,
            }
        }
        match ws.read() {
            Ok(Message::Text(text)) => {
                if events
                    .send(SocketEvent::Text(socket, text.to_string()))
                    .is_err()
                {
                    return None;
                }
            }
            Ok(Message::Close(frame)) => return frame.map(|f| u16::from(f.code)),
            Ok(_) => {}
            Err(tungstenite::Error::Io(e))
                if matches!(e.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) => {}
            Err(e) => {
                log::info!("[client] socket ended: {e}");
                return None;
            }
        }
    }
}

/// Send one HTTP request and read the Troupe body.
pub fn http_send(config: &Config, request: &HttpRequest) -> Result<Value, HttpError> {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .http_status_as_error(false)
        .timeout_global(Some(Duration::from_secs(30)))
        .build()
        .into();
    let url = format!("{}{}", config.base_url.trim_end_matches('/'), request.path);
    let bearer = config.token.as_ref().map(|t| format!("Bearer {t}"));
    let network = |e: ureq::Error| HttpError::Network(e.to_string());
    let mut response = match request.method {
        Method::Get | Method::Delete => {
            let mut builder = if request.method == Method::Get {
                agent.get(&url)
            } else {
                agent.delete(&url)
            };
            if let Some(bearer) = &bearer {
                builder = builder.header("Authorization", bearer);
            }
            if let Some(id) = &request.command_id {
                builder = builder.header(COMMAND_ID_HEADER, id);
            }
            builder
                .header("Accept", "application/json")
                .call()
                .map_err(network)?
        }
        Method::Post | Method::Put => {
            let mut builder = if request.method == Method::Post {
                agent.post(&url)
            } else {
                agent.put(&url)
            };
            if let Some(bearer) = &bearer {
                builder = builder.header("Authorization", bearer);
            }
            if let Some(id) = &request.command_id {
                builder = builder.header(COMMAND_ID_HEADER, id);
            }
            let body = request
                .body
                .as_ref()
                .map_or_else(String::new, Value::to_string);
            builder
                .content_type("application/json")
                .send(body.as_bytes())
                .map_err(network)?
        }
    };
    let status = response.status().as_u16();
    let bytes = response.body_mut().read_to_vec().map_err(network)?;
    parse_body(status, &bytes)
}
