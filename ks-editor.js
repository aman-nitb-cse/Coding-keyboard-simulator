// Editor helpers shared by content.js: find the real focused editor on ANY page (shadow DOM,
// same-origin iframes), read the current line, insert / delete text with several fallbacks.
(() => {
  const KS = (self.KS = self.KS || {});
  if (KS.insertText) return; // already loaded in this page
  const EVENT = "KS_EDITOR_ANALYZE_AND_CONFIG";

  // ---------- focus ----------
  // Walk through shadow roots and same-origin iframes to the element that really has focus.
  KS.deepActive = function deepActive(doc = document) {
    let el = doc.activeElement;
    for (let guard = 0; el && guard < 20; guard++) {
      if (el.shadowRoot && el.shadowRoot.activeElement) {
        el = el.shadowRoot.activeElement;
      } else if (el.tagName === "IFRAME" || el.tagName === "FRAME") {
        let inner = null;
        try { inner = el.contentDocument && el.contentDocument.activeElement; } catch (e) {}
        if (!inner || inner === el.contentDocument.body && !inner.isContentEditable) break;
        el = inner;
      } else break;
    }
    return el;
  };

  KS.isTextControl = (el) =>
    !!el && (el.tagName === "TEXTAREA" ||
      (el.tagName === "INPUT" && /^(text|search|url|tel|email|password|number|)$/i.test(el.type || "")));

  KS.isEditable = (el) => !!el && (KS.isTextControl(el) || el.isContentEditable === true);

  KS.docOf = (el) => (el && el.ownerDocument) || document;

  // ---------- bridge (Monaco / Ace / CodeMirror 5 live in the page world) ----------
  KS.bridge = function bridge(detail) {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: JSON.stringify(detail) }));
  };
  KS.bridgeLine = function bridgeLine() {
    KS.bridge({ action: "QUERY_LINE" });
    const raw = document.documentElement.dataset.ksLine;
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  };
  KS.bridgeInsert = function bridgeInsert(text) {
    KS.bridge({ action: "INSERT_EXACT", text });
    return document.documentElement.dataset.ksInserted === "true";
  };
  KS.engineHandled = () => document.documentElement.dataset.ksEngineHandled === "true";

  // ---------- current line (text before / after the caret on that line) ----------
  // Returns { before, after } or null when this editor can't be read (then callers fall back).
  KS.readLine = function readLine(target) {
    const viaBridge = KS.bridgeLine();
    if (viaBridge) return viaBridge;
    if (!target) return null;

    if (KS.isTextControl(target)) {
      // The hidden input of Monaco / Ace / CodeMirror is NOT the document. If the engine bridge could not
      // find the editor instance, report "unreadable" instead of a bogus line (callers have a safe fallback).
      try { if (target.closest && target.closest(".monaco-editor, .CodeMirror, .ace_editor")) return null; } catch (e) {}
      let val, pos;
      try { val = target.value || ""; pos = target.selectionEnd; } catch (e) { return null; } // e.g. type=email
      if (pos == null) return null;
      const start = val.lastIndexOf("\n", pos - 1) + 1;
      let end = val.indexOf("\n", pos);
      if (end === -1) end = val.length;
      return { before: val.slice(start, pos), after: val.slice(pos, end) };
    }

    if (target.isContentEditable) {
      const doc = KS.docOf(target);
      const sel = (doc.defaultView || window).getSelection();
      if (!sel || !sel.rangeCount) return null;
      const range = sel.getRangeAt(0);
      const host = target.closest("[contenteditable]:not([contenteditable=false])") || target;
      try {
        const pre = doc.createRange();
        pre.selectNodeContents(host);
        pre.setEnd(range.endContainer, range.endOffset);
        const post = doc.createRange();
        post.selectNodeContents(host);
        post.setStart(range.endContainer, range.endOffset);
        const before = pre.toString().replace(/ /g, " ");
        const after = post.toString().replace(/ /g, " ");
        const lastNl = before.lastIndexOf("\n");
        const nextNl = after.indexOf("\n");
        // Block-based editors (CodeMirror 6 .cm-line, Ace, etc.) have no "\n" in toString():
        // use the closest line element instead.
        const lineEl = (range.endContainer.nodeType === 1 ? range.endContainer : range.endContainer.parentElement)
          .closest(".cm-line, .view-line, .ace_line, [data-line], div, p");
        if (lastNl === -1 && nextNl === -1 && lineEl && lineEl !== host && host.contains(lineEl)) {
          const lr = doc.createRange();
          lr.selectNodeContents(lineEl);
          lr.setEnd(range.endContainer, range.endOffset);
          const lb = lr.toString().replace(/ /g, " ");
          const lr2 = doc.createRange();
          lr2.selectNodeContents(lineEl);
          lr2.setStart(range.endContainer, range.endOffset);
          return { before: lb, after: lr2.toString().replace(/ /g, " ") };
        }
        return {
          before: lastNl === -1 ? before : before.slice(lastNl + 1),
          after: nextNl === -1 ? after : after.slice(0, nextNl)
        };
      } catch (e) { return null; }
    }
    return null;
  };

  // ---------- insert ----------
  function setNativeValue(el, value) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value");
    if (setter && setter.set) setter.set.call(el, value); // bypasses React/Vue value trackers
    else el.value = value;
  }

  // Insert text at the caret. Tries the most "native" way first, then progressively harder ones.
  KS.insertText = function insertText(target, str, opts = {}) {
    if (!target) return false;
    const doc = KS.docOf(target);

    // 0. exact engine API (direct paste in Monaco/Ace/CM5: skips every auto-indent/auto-close hook)
    if (opts.exact && KS.bridgeInsert(str)) return true;

    // 1. real text-insertion command: fires beforeinput/input, works with undo history
    try { if (doc.execCommand("insertText", false, str)) return true; } catch (e) {}

    // 2. plain inputs: write the value ourselves (React/Vue safe)
    if (KS.isTextControl(target)) {
      try {
        const start = target.selectionStart == null ? target.value.length : target.selectionStart;
        const end = target.selectionEnd == null ? start : target.selectionEnd;
        setNativeValue(target, target.value.slice(0, start) + str + target.value.slice(end));
        try { target.selectionStart = target.selectionEnd = start + str.length; } catch (e) {}
        target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: str }));
        return true;
      } catch (e) {}
    }

    // 3. contenteditable: give the editor a chance to handle a synthetic paste (editors that own paste)
    if (target.isContentEditable) {
      try {
        const dt = new DataTransfer();
        dt.setData("text/plain", str);
        const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
        if (!target.dispatchEvent(ev) || ev.defaultPrevented) return true;
      } catch (e) {}
      // 4. last resort: edit the DOM selection directly
      try {
        const sel = (doc.defaultView || window).getSelection();
        if (sel && sel.rangeCount) {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          const node = doc.createTextNode(str);
          range.insertNode(node);
          range.setStartAfter(node);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
          target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: str }));
          return true;
        }
      } catch (e) {}
    }
    return false;
  };

  // ---------- delete ----------
  function key(target, name, code, keyCode) {
    const init = { key: name, code, keyCode, which: keyCode, bubbles: true, cancelable: true, composed: true };
    target.dispatchEvent(new KeyboardEvent("keydown", init));
    target.dispatchEvent(new KeyboardEvent("keyup", init));
  }

  KS.deleteBackward = function deleteBackward(target) {
    if (!target) return false;
    const doc = KS.docOf(target);
    try { if (doc.execCommand("delete", false, null)) return true; } catch (e) {}
    if (KS.isTextControl(target)) {
      try {
        const s = target.selectionStart, e = target.selectionEnd;
        if (s != null && s > 0) {
          setNativeValue(target, target.value.slice(0, s - 1) + target.value.slice(e));
          target.selectionStart = target.selectionEnd = s - 1;
          target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
          return true;
        }
      } catch (err) {}
    }
    key(target, "Backspace", "Backspace", 8);
    return false;
  };

  KS.deleteForward = function deleteForward(target) {
    if (!target) return false;
    const doc = KS.docOf(target);
    try { if (doc.execCommand("forwardDelete", false, null)) return true; } catch (e) {}
    if (KS.isTextControl(target)) {
      try {
        const s = target.selectionStart, e = target.selectionEnd;
        if (s != null && s < target.value.length) {
          setNativeValue(target, target.value.slice(0, s) + target.value.slice(e === s ? e + 1 : e));
          target.selectionStart = target.selectionEnd = s;
          target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentForward" }));
          return true;
        }
      } catch (err) {}
    }
    key(target, "Delete", "Delete", 46);
    return false;
  };
})();
