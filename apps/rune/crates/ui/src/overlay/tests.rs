use rune::{Cx, El, Env, Key, KeyEvent, Mods, Runtime, col};

use super::*;
use crate::Button;

#[derive(Default)]
struct S {
    overlays: Overlays,
    renamed: u32,
}

fn view(s: &S, _cx: &mut Cx<S>) -> El {
    let t = theme::tokens("termul", true);
    let mut layer = Vec::new();
    let opener = Button::new("View options").build(t).key("opener").on_press(|s: &mut S| s.overlays.open("menu"));
    let menu = Menu::new("menu")
        .item(MenuItem::new("Rename…").on_select(|s: &mut S| s.overlays.open("rename")))
        .item(MenuItem::new("Split right"))
        .open(s.overlays.is_open("menu"))
        .on_close(|s: &mut S| {
            s.overlays.close("menu");
        })
        .build(t, &mut layer, opener);
    Dialog::new("rename", "Rename session")
        .description("The name shows in the tab bar.")
        .footer(Button::new("Save").build(t).key("save").on_press(|s: &mut S| s.renamed += 1))
        .open(s.overlays.is_open("rename"))
        .on_close(|s: &mut S| {
            s.overlays.close("rename");
        })
        .build(t, &mut layer);
    root(col().padding(20.0).child(menu), layer)
}

fn runtime() -> Runtime<S> {
    let mut rt = Runtime::new(S::default(), view, (800.0, 600.0), Env::new(true, 1.0));
    rt.frame(0.0);
    rt
}

fn press(rt: &mut Runtime<S>, key: Key) {
    rt.key(KeyEvent { key, mods: Mods::default() });
    rt.frame(0.016);
}

fn tap(rt: &mut Runtime<S>, key: &str) {
    let (x, y) = rt.find(key).unwrap_or_else(|| panic!("no element keyed {key}"));
    rt.pointer_down(x, y);
    rt.pointer_up(x, y);
    rt.frame(0.016);
}

fn focused(rt: &Runtime<S>) -> Option<String> {
    rt.elements().into_iter().find(|e| e.focused).and_then(|e| e.key)
}

fn present(rt: &Runtime<S>, key: &str) -> bool {
    rt.elements().iter().any(|e| e.key.as_deref() == Some(key) && !e.exiting)
}

#[test]
fn escape_closes_the_dialog_then_the_menu_and_focus_returns_to_the_opener() {
    let mut rt = runtime();
    press(&mut rt, Key::Tab);
    assert_eq!(focused(&rt).as_deref(), Some("opener"));
    press(&mut rt, Key::Text(" ".into()));
    assert!(present(&rt, "menu-menu"), "Space on the opener opens the menu");

    assert_eq!(focused(&rt).as_deref(), Some("menu-item0"), "a menu the keyboard opened focuses its first row");
    press(&mut rt, Key::Down);
    assert_eq!(focused(&rt).as_deref(), Some("menu-item1"));
    press(&mut rt, Key::Up);
    press(&mut rt, Key::Text(" ".into()));
    assert_eq!(rt.state.overlays.top(), Some("rename"));
    assert!(present(&rt, "rename-dialog"), "the dialog opens over the menu");

    press(&mut rt, Key::Escape);
    assert_eq!(rt.state.overlays.top(), Some("menu"), "Escape closes the dialog only");
    assert!(present(&rt, "menu-menu"));
    assert!(!present(&rt, "rename-dialog"));

    press(&mut rt, Key::Escape);
    assert_eq!(rt.state.overlays.depth(), 0);
    assert!(!present(&rt, "menu-menu"));
    assert_eq!(focused(&rt).as_deref(), Some("opener"), "focus returns to the opener");
}

#[test]
fn tab_stays_inside_the_open_dialog() {
    let mut rt = runtime();
    rt.update(|s, _| s.overlays.open("rename"));
    rt.frame(0.016);
    let inside = ["close", "save"];
    for _ in 0..4 {
        press(&mut rt, Key::Tab);
        let key = focused(&rt);
        assert!(key.as_deref().is_some_and(|k| inside.contains(&k)), "focus left the dialog: {key:?}");
    }
}

#[test]
fn a_press_outside_closes_the_top_overlay() {
    let mut rt = runtime();
    tap(&mut rt, "opener");
    assert!(rt.state.overlays.is_open("menu"));
    rt.pointer_down(700.0, 500.0);
    rt.pointer_up(700.0, 500.0);
    rt.frame(0.016);
    assert_eq!(rt.state.overlays.depth(), 0);
}

#[test]
fn the_back_stack_closes_from_the_top_and_takes_children_with_a_parent() {
    let mut o = Overlays::default();
    o.open("sheet");
    o.open("sheet/model");
    o.open("sheet/model/effort");
    o.open("sheet");
    assert_eq!(o.depth(), 3, "opening an open key changes nothing");
    assert_eq!(o.above("sheet"), ["sheet/model".to_owned(), "sheet/model/effort".to_owned()]);
    assert_eq!(o.pop().as_deref(), Some("sheet/model/effort"));
    assert_eq!(o.close("sheet"), vec!["sheet/model".to_owned(), "sheet".to_owned()]);
    assert_eq!(o.depth(), 0);
    assert!(o.close("sheet").is_empty());
}

#[test]
fn history_sentinels_follow_the_stack_and_tell_back_presses_from_our_own() {
    let mut h = HistorySentinels::default();
    assert_eq!(h.reconcile(2), Some(HistoryStep::Push(2)));
    assert_eq!(h.reconcile(2), None);
    // Escape closed one overlay: consume its entry; the popstate that causes is ours.
    assert_eq!(h.reconcile(1), Some(HistoryStep::Back(1)));
    assert!(!h.popstate());
    // The user pressed back: the top overlay closes and no step follows.
    assert!(h.popstate());
    assert_eq!(h.reconcile(0), None);
    // A back press with nothing open is the page's own.
    assert!(!h.popstate());
}

#[test]
fn toasts_show_four_and_leave_after_their_time() {
    let mut toasts = Toasts::default();
    for i in 0..5 {
        toasts.push(0.0, ToastKind::Message, format!("toast {i}"), None);
    }
    assert_eq!(toasts.visible().iter().map(|t| t.id).collect::<Vec<_>>(), [2, 3, 4, 5]);
    assert!(toasts.expire(toast::DURATION + 0.1));
    let left: Vec<_> = toasts.visible().iter().map(|t| t.title.clone()).collect();
    assert_eq!(left, ["toast 0"], "the waiting toast gets its full time once shown");
    assert!(!toasts.expire(toast::DURATION + 1.0));
    assert!(toasts.expire(2.0 * toast::DURATION + 0.2));
    assert!(toasts.visible().is_empty());
}
