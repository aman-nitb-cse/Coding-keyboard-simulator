chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.target === "offscreen" && msg.action === "READ_CLIPBOARD") {
    const textarea = document.getElementById("clipboard-bridge");
    textarea.value = "";
    textarea.focus();
    const ok = document.execCommand("paste");
    sendResponse({ ok, text: textarea.value || "" });
    return true;
  }
});
