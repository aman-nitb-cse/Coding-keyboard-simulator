(() => {
  if (window.__keystrokeSimulatorV6Loaded) return;
  window.__keystrokeSimulatorV6Loaded = true;

  const KS = self.KS;
  const { AVG_HUMAN_CHAR_MS, getAdjacentTypoChar, getHumanKeystrokeDelay, sleep } = KS.human;
  const toast = KS.toast;

  let isTyping = false;

  // Editors living in tiny iframes (CodePen panes, tryit editors, embeds) relay their toast to the top frame.
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.action === "KS_TOAST_SHOW" && window === window.top && msg.opts) toast.show(msg.opts);
    });
  } catch (e) {}

  async function getClipboardText() {
    try {
      const response = await chrome.runtime.sendMessage({ action: "GET_CLIPBOARD_TEXT" });
      if (response && typeof response.text === "string" && response.text.length > 0) return response.text;
    } catch (e) {}
    try { return (await navigator.clipboard.readText()) || ""; } catch (e) { return ""; }
  }

  function stopTyping(title) {
    if (!isTyping) return;
    isTyping = false;
    KS.bridge({ action: "RESTORE" });
    toast.show({ title: title || "Stopped", type: "warn", autoHide: 1400 });
  }

  // The focused editor can briefly disappear while a page re-renders: wait a moment before giving up.
  // If the user clicks into a DIFFERENT live element mid-typing, stop instead of typing into it.
  async function waitForTarget(lock) {
    for (let n = 0; n < 20; n++) {
      const t = KS.deepActive();
      if (KS.isEditable(t)) {
        if (!lock.el || t === lock.el || !lock.el.isConnected) { lock.el = t; return t; }
        return null;
      }
      await sleep(50);
      if (!isTyping) return null;
    }
    return null;
  }

  // ---------- smart indentation ----------
  // After a newline the site's editor may (or may not) add its own indentation. Instead of guessing,
  // look at what it actually produced and fix it so the line ends up with exactly the SOURCE indentation.
  // Works the same for: no auto-indent, auto-indent, smart backspace, tabs vs spaces, comment continuation.
  async function reconcileIndent(desired, prevBefore) {
    let lastSeen = null, stalls = 0;
    for (let n = 0; n < 60 && isTyping; n++) {
      const target = KS.deepActive();
      const line = KS.readLine(target);
      if (!line) return false;                    // this editor can't be read -> caller falls back
      const cur = line.before;
      if (cur === desired) return true;
      // our last edit changed nothing (editor ignores it / reports stale text): give up, never loop on it
      if (cur === lastSeen) { if (++stalls >= 3) return true; } else { lastSeen = cur; stalls = 0; }
      if (cur.length > 40) return true;           // doesn't look like a fresh line: never delete real code
      if (prevBefore != null && cur === prevBefore && /\S/.test(cur)) return true; // newline didn't happen: caret still on the old line
      if (/^[ \t]*$/.test(cur) && desired.startsWith(cur)) {
        KS.insertText(target, desired.slice(cur.length));   // editor under-indented -> add the rest
      } else {
        KS.deleteBackward(target);                           // over-indented / other style / "* " continuation
      }
    }
    return true;
  }

  // ---------- smart bracket cancel ----------
  // Editors that auto-close ( [ { " ' ` or HTML tags put the closer AFTER the caret. If the text right after
  // the caret grew by exactly one closer (or a closing tag) because of what we just typed, remove it.
  const OPENERS = /[{(\["'`>]/;
  const CLOSER = /^([)\]}"'`]|<\/[\w:.-]+>)$/;

  async function typeChar(target, char) {
    const watch = OPENERS.test(char);
    const pre = watch ? KS.readLine(target) : null;
    KS.insertText(target, char);
    if (!watch || !pre) return;

    const cleanup = () => {
      const t = KS.deepActive();
      const post = KS.readLine(t);
      if (!post || post.after.length <= pre.after.length || !post.after.endsWith(pre.after)) return false;
      const extra = post.after.slice(0, post.after.length - pre.after.length);
      if (!CLOSER.test(extra)) return false;
      for (let k = 0; k < extra.length; k++) KS.deleteForward(t);
      return true;
    };
    if (cleanup()) return;
    await sleep(0);          // some editors insert the closer asynchronously (next tick)
    cleanup();
  }

  // ---------- typing ----------
  function indentOfNextLine(text, from) {
    // `from` = index right after "\n". Returns { desired, skip } for the line that starts there.
    let j = from;
    while (j < text.length && (text[j] === " " || text[j] === "\t")) j++;
    const blank = j >= text.length || text[j] === "\n";
    return { desired: blank ? "" : text.slice(from, j), skip: j - from };
  }

  async function humanType(text) {
    const total = text.length;
    let burstFactor = 1.0;
    let charsSinceLastTypo = 10;
    let i = 0;
    const lock = { el: null };
    toast.show({ title: "Typing...", type: "info", pulse: true, progress: 0 });

    while (i < total && isTyping) {
      const char = text[i];
      const prevChar = i > 0 ? text[i - 1] : "";
      const target = await waitForTarget(lock);
      if (!target) { stopTyping("Stopped: focus left the editor"); return; }

      if (i % 7 === 0) burstFactor = 0.82 + Math.random() * 0.38;

      if (char === "\n") {
        const prev = KS.readLine(target);
        KS.insertText(target, "\n");
        i++;
        const { desired, skip } = indentOfNextLine(text, i);
        i += skip;
        const handled = await reconcileIndent(desired, prev ? prev.before : null);
        if (!handled && desired) KS.insertText(KS.deepActive(), desired);   // unreadable editor: type it as-is
      } else {
        // occasional human typo + correction
        const typo = charsSinceLastTypo >= 8 && /[a-zA-Z0-9]/.test(char) && Math.random() < 0.042
          ? getAdjacentTypoChar(char) : null;
        if (typo) {
          charsSinceLastTypo = 0;
          KS.insertText(target, typo);
          const nextChar = i + 1 < total ? text[i + 1] : "";
          if (/[a-zA-Z0-9]/.test(nextChar) && Math.random() < 0.28) {
            await sleep(Math.round(AVG_HUMAN_CHAR_MS * (0.65 + Math.random() * 0.4)));
            if (!isTyping) return;
            KS.insertText(KS.deepActive(), nextChar);
            await sleep(220 + Math.floor(Math.random() * 190));
            if (!isTyping) return;
            KS.deleteBackward(KS.deepActive());
            await sleep(85 + Math.floor(Math.random() * 55));
            if (!isTyping) return;
            KS.deleteBackward(KS.deepActive());
          } else {
            await sleep(175 + Math.floor(Math.random() * 165));
            if (!isTyping) return;
            KS.deleteBackward(KS.deepActive());
          }
          await sleep(95 + Math.floor(Math.random() * 75));
          if (!isTyping) return;
        } else {
          charsSinceLastTypo++;
        }
        await typeChar(KS.deepActive() || target, char);
        i++;
      }

      if (i % 4 === 0 || i >= total) {
        toast.show({ title: "Typing...", type: "info", pulse: true, progress: (i / total) * 100 });
      }
      await sleep(getHumanKeystrokeDelay(char, prevChar, burstFactor));
    }
  }

  // ---------- actions ----------
  async function run(mode) {
    if (isTyping) { stopTyping("Stopped"); return; }

    const target = KS.deepActive();
    if (!KS.isEditable(target)) {
      toast.show({ title: "Click inside the editor first", type: "warn", autoHide: 1800 });
      return;
    }
    const raw = await getClipboardText();
    if (!raw) { toast.show({ title: "Clipboard Empty", type: "warn", autoHide: 1800 }); return; }
    const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    if (mode === "paste") {
      KS.bridge({ action: "ANALYZE_AND_APPLY" });
      const ok = KS.insertText(KS.deepActive() || target, text, { exact: true });
      setTimeout(() => KS.bridge({ action: "RESTORE" }), 60);
      toast.show(ok ? { title: "Pasted", type: "success", autoHide: 1500 }
                    : { title: "Paste failed in this editor", type: "warn", autoHide: 2200 });
      return;
    }

    isTyping = true;
    KS.bridge({ action: "ANALYZE_AND_APPLY" });
    try {
      await humanType(text);
      if (isTyping) {
        isTyping = false;
        toast.show({ title: "Done", type: "success", autoHide: 1400 });
      }
    } catch (err) {
      isTyping = false;
      toast.show({ title: "Typing error", type: "warn", autoHide: 2000 });
    } finally {
      isTyping = false;
      KS.bridge({ action: "RESTORE" });
    }
  }

  // ---------- shortcuts ----------
  // The two shortcuts are Chrome commands (set in chrome://extensions/shortcuts). The background script
  // forwards the pressed command to every frame of the tab; only the frame that really holds focus acts.
  function focusIsInChildFrame() {
    let el = document.activeElement;
    for (let guard = 0; el && guard < 20; guard++) {
      if (el.tagName === "IFRAME" || el.tagName === "FRAME") return true;
      if (el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
      else break;
    }
    return false;
  }

  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg || msg.action !== "KS_RUN") return;
      if (msg.mode !== "human" && msg.mode !== "paste") return;
      if (!document.hasFocus() || focusIsInChildFrame()) return;
      run(msg.mode);
    });
  } catch (e) {}

  // Esc stops typing. Capture phase on window, so it sees Esc before the page's own handlers in most cases.
  window.addEventListener("keydown", (e) => {
    if (e.isTrusted === false) return;
    if (e.key === "Escape" && isTyping) {
      e.preventDefault();
      e.stopImmediatePropagation();
      stopTyping("Stopped");
    }
  }, true);
})();
