document.addEventListener("DOMContentLoaded", () => {
  const REPO_URL = "https://github.com/aman-nitb-cse/Coding-keyboard-simulator";
  const SHORTCUTS_URL = "chrome://extensions/shortcuts";
  const version = chrome.runtime.getManifest().version;
  document.getElementById("version").textContent = "v" + version;

  // Opens a pre-filled GitHub issue; nothing is sent anywhere until the user submits it there.
  document.getElementById("bugBtn").addEventListener("click", () => {
    const body = [
      "**What happened?**",
      "",
      "",
      "**Steps to reproduce**",
      "1. ",
      "",
      "**Website / editor** (e.g. LeetCode, Monaco, CodeMirror)",
      "",
      "",
      "---",
      "Extension version: " + version,
      "Browser: " + navigator.userAgent
    ].join("\n");
    const url = REPO_URL + "/issues/new?title=" + encodeURIComponent("Bug: ") +
      "&body=" + encodeURIComponent(body);
    chrome.tabs.create({ url });
  });

  // Shortcuts live in Chrome's own keyboard settings: show the current key, and send the user there to change it.
  const displays = {
    "human-type": document.getElementById("humanDisplay"),
    "direct-paste": document.getElementById("pasteDisplay")
  };

  function renderShortcuts() {
    if (!chrome.commands || !chrome.commands.getAll) return;
    chrome.commands.getAll((commands) => {
      (commands || []).forEach((c) => {
        const el = displays[c.name];
        if (el) el.textContent = c.shortcut ? formatShortcut(c.shortcut) : "Not set";
      });
    });
  }

  // Chrome returns e.g. "Alt+Shift+V" (or macOS symbols like "⌥⇧V"): show the first form with spaces around "+".
  function formatShortcut(s) {
    return s.indexOf("+") !== -1 ? s.split("+").join(" + ") : s;
  }

  function openKeyboardSettings() {
    chrome.tabs.create({ url: SHORTCUTS_URL });
    window.close();
  }

  ["humanBtn", "pasteBtn", "humanDisplay", "pasteDisplay"].forEach((id) => {
    document.getElementById(id).addEventListener("click", openKeyboardSettings);
  });

  renderShortcuts();
});
