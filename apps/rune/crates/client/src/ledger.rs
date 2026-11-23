//! Requests the app asked for, kept until their reply arrives.
//!
//! A ledgered request carries a `commandId` minted once. When its socket dies
//! before the reply, the request goes back to the queue and the next live
//! socket resends it with the same `commandId`, so the host runs it at most
//! once (AD-5). An unledgered request that was on the wire fails with
//! `closed` instead, because resending it could run it twice.

use std::collections::BTreeMap;

use serde_json::Value;

use crate::machine::CallId;

/// How long to wait before asking again about a command the host reports
/// still running (`{ "receipt": "in_progress" }`).
pub const IN_PROGRESS_RETRY_S: f64 = 1.0;

/// Where one request stands.
#[derive(Clone, Debug, PartialEq)]
pub enum CallState {
    /// Waiting for a live socket.
    Queued,
    /// On the wire under this request id.
    Sent { request: String },
    /// The host is still running the first send; ask again at `retry_at`.
    InProgress { retry_at: f64 },
}

#[derive(Clone, Debug, PartialEq)]
pub struct Call<K> {
    pub kind: K,
    pub payload: Value,
    pub command_id: Option<String>,
    pub state: CallState,
}

#[derive(Clone, Debug)]
pub struct Ledger<K> {
    calls: BTreeMap<CallId, Call<K>>,
    prefix: String,
    minted: u64,
}

impl<K: Clone> Ledger<K> {
    /// `client_instance_id` prefixes every minted `commandId`; characters the
    /// host refuses are dropped.
    #[must_use]
    pub fn new(client_instance_id: &str) -> Self {
        let prefix: String = client_instance_id
            .chars()
            .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
            .take(96)
            .collect();
        Self {
            calls: BTreeMap::new(),
            prefix,
            minted: 0,
        }
    }

    /// Queue a request. A ledgered one gets its `commandId` now.
    pub fn add(&mut self, call: CallId, kind: K, payload: Value, ledgered: bool) {
        let command_id = ledgered.then(|| {
            self.minted += 1;
            format!("{}-c{}", self.prefix, self.minted)
        });
        self.calls.insert(
            call,
            Call {
                kind,
                payload,
                command_id,
                state: CallState::Queued,
            },
        );
    }

    /// The requests to put on the wire now, in the order the app made them.
    #[must_use]
    pub fn due(&self, now: f64) -> Vec<CallId> {
        self.calls
            .iter()
            .filter(|(_, c)| match c.state {
                CallState::Queued => true,
                CallState::InProgress { retry_at } => now >= retry_at,
                CallState::Sent { .. } => false,
            })
            .map(|(id, _)| *id)
            .collect()
    }

    #[must_use]
    pub fn get(&self, call: CallId) -> Option<&Call<K>> {
        self.calls.get(&call)
    }

    pub fn mark_sent(&mut self, call: CallId, request: String) {
        if let Some(c) = self.calls.get_mut(&call) {
            c.state = CallState::Sent { request };
        }
    }

    /// The host is still running it: returns when to ask again.
    pub fn mark_in_progress(&mut self, call: CallId, now: f64) -> f64 {
        let retry_at = now + IN_PROGRESS_RETRY_S;
        if let Some(c) = self.calls.get_mut(&call) {
            c.state = CallState::InProgress { retry_at };
        }
        retry_at
    }

    pub fn take(&mut self, call: CallId) -> Option<Call<K>> {
        self.calls.remove(&call)
    }

    /// The socket died. Ledgered requests wait for the next one; the
    /// unledgered requests that were on the wire are returned as failed.
    pub fn down(&mut self) -> Vec<(CallId, Call<K>)> {
        let failed: Vec<CallId> = self
            .calls
            .iter()
            .filter(|(_, c)| c.command_id.is_none() && matches!(c.state, CallState::Sent { .. }))
            .map(|(id, _)| *id)
            .collect();
        for c in self.calls.values_mut() {
            c.state = CallState::Queued;
        }
        failed
            .into_iter()
            .filter_map(|id| self.calls.remove(&id).map(|c| (id, c)))
            .collect()
    }
}

/// The host's answer to a resend whose first run is still going.
#[must_use]
pub fn is_in_progress_receipt(payload: Option<&Value>) -> bool {
    payload
        .and_then(|p| p.get("receipt"))
        .and_then(Value::as_str)
        == Some("in_progress")
}
