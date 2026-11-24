//! The web build's back button: one history entry per open overlay, so system back on a phone
//! (and the browser's back button) closes the top overlay instead of leaving the page. Native
//! builds have no history; every call is a no-op there and [`take_back_presses`] stays 0.
//!
//! The app wires three calls: [`install`] from `AppSpec::setup`, [`sync`] with
//! [`Overlays::depth`](super::Overlays::depth) from its view, and [`take_back_presses`] from
//! `AppSpec::poll`, popping one overlay per press.

#[cfg(target_arch = "wasm32")]
mod web {
    use std::cell::RefCell;

    use rune::Waker;
    use wasm_bindgen::JsValue;
    use wasm_bindgen::closure::Closure;
    use wasm_bindgen::JsCast;

    use crate::overlay::stack::{HistorySentinels, HistoryStep};

    #[derive(Default)]
    struct Web {
        sentinels: HistorySentinels,
        backs: usize,
        wake: Option<Waker>,
    }

    thread_local! {
        static WEB: RefCell<Web> = RefCell::default();
    }

    pub fn install(wake: Waker) {
        let first = WEB.with_borrow_mut(|w| w.wake.replace(wake).is_none());
        if !first {
            return;
        }
        let Some(window) = web_sys::window() else { return };
        let on_pop = Closure::<dyn Fn(JsValue)>::new(|_| {
            let wake = WEB.with_borrow_mut(|w| {
                if !w.sentinels.popstate() {
                    return None;
                }
                w.backs += 1;
                w.wake.clone()
            });
            if let Some(wake) = wake {
                wake();
            }
        });
        if let Err(e) = window.add_event_listener_with_callback("popstate", on_pop.as_ref().unchecked_ref()) {
            web_sys::console::warn_1(&format!("troupe overlay: no popstate listener: {e:?}").into());
        }
        on_pop.forget();
    }

    pub fn sync(depth: usize) {
        let Some(step) = WEB.with_borrow_mut(|w| w.wake.is_some().then(|| w.sentinels.reconcile(depth)).flatten()) else {
            return;
        };
        let Some(history) = web_sys::window().and_then(|w| w.history().ok()) else { return };
        let done = match step {
            HistoryStep::Push(n) => (0..n).try_for_each(|_| history.push_state(&JsValue::from_str("troupe-overlay"), "")),
            HistoryStep::Back(n) => history.go_with_delta(-(n as i32)),
        };
        if let Err(e) = done {
            web_sys::console::warn_1(&format!("troupe overlay: history {step:?} failed: {e:?}").into());
        }
    }

    pub fn take_back_presses() -> usize {
        WEB.with_borrow_mut(|w| std::mem::take(&mut w.backs))
    }
}

#[cfg(target_arch = "wasm32")]
pub use web::{install, sync, take_back_presses};

#[cfg(not(target_arch = "wasm32"))]
pub fn install(_wake: rune::Waker) {}

#[cfg(not(target_arch = "wasm32"))]
pub fn sync(_depth: usize) {}

#[cfg(not(target_arch = "wasm32"))]
pub fn take_back_presses() -> usize {
    0
}
