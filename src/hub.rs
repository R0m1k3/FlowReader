//! Per-user WebSocket fan-out: events go to every open tab/device of a user.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use serde::Serialize;
use tokio::sync::mpsc;
use uuid::Uuid;

/// Outgoing queue per connection; a full queue means a slow consumer, which
/// is dropped (it resyncs on its next query anyway).
pub const CLIENT_BUFFER: usize = 64;

/// Open connections of one user: (connection id, outgoing queue).
type Connections = Vec<(u64, mpsc::Sender<String>)>;

#[derive(Default)]
pub struct Hub {
    next_id: AtomicU64,
    clients: Mutex<HashMap<Uuid, Connections>>,
}

#[derive(Serialize)]
struct Event<'a, T: Serialize> {
    #[serde(rename = "type")]
    kind: &'a str,
    payload: T,
}

impl Hub {
    pub fn register(&self, user_id: Uuid) -> (u64, mpsc::Receiver<String>) {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = mpsc::channel(CLIENT_BUFFER);
        self.clients
            .lock()
            .unwrap()
            .entry(user_id)
            .or_default()
            .push((id, tx));
        (id, rx)
    }

    pub fn unregister(&self, user_id: Uuid, conn: u64) {
        let mut clients = self.clients.lock().unwrap();
        if let Some(list) = clients.get_mut(&user_id) {
            list.retain(|(id, _)| *id != conn);
            if list.is_empty() {
                clients.remove(&user_id);
            }
        }
    }

    /// Sends an event to every connection of the given user only. Never
    /// blocks the caller.
    pub fn send_to_user<T: Serialize>(&self, user_id: Uuid, kind: &str, payload: T) {
        let data = match serde_json::to_string(&Event { kind, payload }) {
            Ok(d) => d,
            Err(e) => {
                tracing::warn!("marshaling WS event: {e}");
                return;
            }
        };
        let mut clients = self.clients.lock().unwrap();
        if let Some(list) = clients.get_mut(&user_id) {
            list.retain(|(_, tx)| tx.try_send(data.clone()).is_ok());
            if list.is_empty() {
                clients.remove(&user_id);
            }
        }
    }
}
