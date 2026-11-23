//! Scenes whose parts belong to later units: the overlay layer (R4c) and the product surfaces
//! (the workspace shell, R5, and chat, R6). Each shows which unit draws it until that lands.

use rune::El;

use crate::kit::pending;
use crate::{Ctx, registry};

fn name(c: &Ctx) -> &'static str {
    registry::find(c.s.scene).map_or("", |s| s.name)
}

/// Dialogs, sheets, menus, the command palette and toasts.
pub fn overlay(c: &Ctx) -> El {
    pending(c.t, name(c), "R4c", "Drawn by the overlay layer: focus trap, dismiss order and placement.")
}

pub fn select(c: &Ctx) -> El {
    pending(c.t, name(c), "R4c", "Select opens a listbox in the overlay layer.")
}

pub fn floating(c: &Ctx) -> El {
    pending(c.t, name(c), "R4c", "Tooltip, HoverCard, Popover and the lightbox are overlays.")
}

pub fn status_rail(c: &Ctx) -> El {
    pending(c.t, name(c), "R6", "The status rail is part of the chat surface.")
}

pub fn status_rail_states(c: &Ctx) -> El {
    pending(c.t, name(c), "R6", "Status rail segments are part of the chat surface.")
}

pub fn model_selector(c: &Ctx) -> El {
    pending(c.t, name(c), "R6", "The model selector is a chat popover (R4c layer, R6 content).")
}

/// Status, connection, form, project icon, brand mark, sidebar rows and the status bar.
pub fn surface(c: &Ctx) -> El {
    pending(c.t, name(c), "R5", "A workspace-shell surface built from the base components.")
}
