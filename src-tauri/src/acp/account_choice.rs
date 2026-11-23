//! Which Account a chat runs on. Claude and Codex share this rule.

use std::collections::BTreeMap;

/// The Account a spawn uses: the chat's own choice, else its Project's, else
/// the Default Account. Callers drop choices that name a removed Account, so
/// every id this returns exists.
#[must_use]
pub fn chosen_account<'a>(
    default_account_id: &'a str,
    project_profiles: &'a BTreeMap<String, String>,
    chat_profiles: &'a BTreeMap<String, String>,
    project_id: Option<&str>,
    chat_id: Option<&str>,
) -> &'a str {
    chat_id
        .and_then(|chat| chat_profiles.get(chat.trim()))
        .or_else(|| project_id.and_then(|project| project_profiles.get(project.trim())))
        .map_or(default_account_id, String::as_str)
}
