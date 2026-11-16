async function ensureOffscreenDocument() {
  if (chrome.runtime.getContexts) {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"]
    });
    if (existingContexts.length > 0) return;
  }
  try {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["CLIPBOARD"],
      justification: "Read clipboard on shortcut"
    });
  } catch (err) {}
}

// Shortcuts are managed in chrome://extensions/shortcuts. Pressing one grants "activeTab" for the current tab only,
// so nothing is injected anywhere until the user presses a shortcut.
const COMMAND_MODES = { "human-type": "human", "direct-paste": "paste" };
const ISOLATED_FILES = ["ks-toast.js", "ks-human.js", "ks-editor.js", "content.js"];

async function injectScripts(tabId) {
  const run = async (allFrames) => {
    await chrome.scripting.executeScript({ target: { tabId, allFrames }, files: ["page-bridge.js"], world: "MAIN" });
    await chrome.scripting.executeScript({ target: { tabId, allFrames }, files: ISOLATED_FILES });
  };
  // Editors inside iframes need the scripts too; if some frame is not allowed, fall back to the top frame only.
  try { await run(true); } catch (e) { await run(false); }
}

chrome.commands.onCommand.addListener(async (command) => {
  const mode = COMMAND_MODES[command];
  if (!mode) return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab || tab.id == null) return;
    await injectScripts(tab.id); // no-op when already loaded (the scripts guard against double loading)
    await chrome.tabs.sendMessage(tab.id, { action: "KS_RUN", mode });
  } catch (e) {} // restricted pages (chrome://, Web Store, ...) cannot be scripted
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // toast from a small iframe -> show it in the top frame of the same tab
  if (msg && msg.action === "KS_TOAST_RELAY" && sender && sender.tab && sender.tab.id != null) {
    try {
      const p = chrome.tabs.sendMessage(sender.tab.id, { action: "KS_TOAST_SHOW", opts: msg.opts }, { frameId: 0 });
      if (p && p.catch) p.catch(() => {});
    } catch (e) {}
    return false;
  }
  if (msg && msg.action === "GET_CLIPBOARD_TEXT") {
    (async () => {
      try {
        await ensureOffscreenDocument();
        const res = await chrome.runtime.sendMessage({
          target: "offscreen",
          action: "READ_CLIPBOARD"
        });
        sendResponse({ text: (res && res.text) ? res.text : "" });
      } catch (e) {
        sendResponse({ text: "" });
      }
    })();
    return true;
  }
});
