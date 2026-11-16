// Runs in the PAGE's own JS world (MAIN) so it can talk to Monaco / Ace / CodeMirror 5 + 6 objects.
// content.js talks to this file through a synchronous CustomEvent + dataset handshake.
(() => {
  if (window.__ksPageBridgeV6) return;
  window.__ksPageBridgeV6 = true;

  const EVENT = "KS_EDITOR_ANALYZE_AND_CONFIG";
  const root = () => document.documentElement;
  let restoreStack = []; // functions that undo whatever ANALYZE_AND_APPLY changed

  // ---------- helpers ----------
  function deepActive() {
    let el = document.activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
    return el;
  }

  const isMonaco = (v) => !!v && typeof v === "object" && typeof v.updateOptions === "function" &&
    typeof v.getModel === "function" && typeof v.getPosition === "function";

  // Wrapper components (react-monaco-editor, vue-monaco, ...) keep the instance on their own objects.
  function scanForMonaco(obj, out) {
    if (!obj || (typeof obj !== "object" && typeof obj !== "function")) return;
    let keys = [];
    try { keys = Object.keys(obj).slice(0, 60); } catch (e) { return; }
    for (const k of keys) {
      let v;
      try { v = obj[k]; } catch (e) { continue; }
      if (isMonaco(v)) { out.add(v); continue; }
      if (v && typeof v === "object") {
        try {
          if (isMonaco(v.current)) out.add(v.current);        // React ref / Vue shallowRef-like
          else if (isMonaco(v.value)) out.add(v.value);        // Vue ref
        } catch (e) {}
      }
    }
  }

  function findMonacoEditors() {
    const editors = new Set();
    try {
      const m = window.monaco;
      if (m && m.editor && typeof m.editor.getEditors === "function") {
        (m.editor.getEditors() || []).forEach((ed) => ed && editors.add(ed));
      }
    } catch (e) {}
    try {
      // Monaco bundled by webpack/vite/ESM has no global `monaco`: dig the instance out of the framework wrapper.
      document.querySelectorAll(".monaco-editor").forEach((node) => {
        // React (hooks, refs and class components)
        try {
          for (const key of Object.keys(node)) {
            if (!key.startsWith("__reactFiber$") && !key.startsWith("__reactInternalInstance$")) continue;
            let fiber = node[key];
            for (let depth = 0; fiber && depth < 15; depth++, fiber = fiber.return) {
              let cursor = fiber.memoizedState;
              for (let s = 0; cursor && s < 12; s++, cursor = cursor.next) {
                const val = cursor.memoizedState;
                if (!val || typeof val !== "object") continue;
                const cand = typeof val.updateOptions === "function" ? val : val.current;
                if (isMonaco(cand)) editors.add(cand);
              }
              const sn = fiber.stateNode;
              if (sn && typeof sn === "object" && !(typeof Node !== "undefined" && sn instanceof Node)) scanForMonaco(sn, editors);
            }
          }
        } catch (e) {}
        // Vue 2 / Vue 3
        try {
          let p = node;
          for (let d = 0; p && d < 8; d++, p = p.parentElement) {
            if (p.__vue__) scanForMonaco(p.__vue__, editors);
            let comp = p.__vueParentComponent;
            for (let c = 0; comp && c < 6; c++, comp = comp.parent) {
              scanForMonaco(comp.setupState, editors);
              scanForMonaco(comp.exposed, editors);
              scanForMonaco(comp.ctx, editors);
            }
          }
        } catch (e) {}
      });
    } catch (e) {}
    return Array.from(editors);
  }

  // CodeMirror 6 keeps its EditorView on the content DOM node (cmView, or cmTile in newer builds).
  function cm6ViewFrom(host) {
    try {
      const content = host.querySelector(".cm-content") || host;
      const cands = [content.cmView, content.cmTile, host.cmView, host.cmTile];
      for (const c of cands) {
        const v = c && c.view;
        if (v && v.state && typeof v.dispatch === "function") return v;
      }
    } catch (e) {}
    return null;
  }

  // Which editor object currently owns the keyboard focus? -> { type, ed } | null
  function focusedEditor() {
    const active = deepActive();
    if (!active || !active.closest) return null;

    if (active.closest(".monaco-editor")) {
      const list = findMonacoEditors();
      let ed = list.find((e) => { try { return e.hasTextFocus && e.hasTextFocus(); } catch (x) { return false; } });
      if (!ed) {
        ed = list.find((e) => {
          try { const n = e.getContainerDomNode && e.getContainerDomNode(); return n && n.contains(active); }
          catch (x) { return false; }
        });
      }
      if (!ed && list.length === 1) ed = list[0];
      if (ed) return { type: "monaco", ed };
    }
    const aceEl = active.closest(".ace_editor");
    if (aceEl) {
      const ed = (aceEl.env && aceEl.env.editor) || aceEl.__ace_editor__;
      if (ed) return { type: "ace", ed };
    }
    const cmEl = active.closest(".CodeMirror");
    if (cmEl && cmEl.CodeMirror) return { type: "cm5", ed: cmEl.CodeMirror };
    const cm6El = active.closest(".cm-editor");
    if (cm6El) {
      const view = cm6ViewFrom(cm6El);
      if (view) return { type: "cm6", ed: view };
    }
    return null;
  }

  // ---------- cursor line text ----------
  function queryLine() {
    const f = focusedEditor();
    let info = "";
    try {
      if (f && f.type === "monaco") {
        const pos = f.ed.getPosition();
        const line = f.ed.getModel().getLineContent(pos.lineNumber);
        info = { before: line.slice(0, pos.column - 1), after: line.slice(pos.column - 1), type: "monaco" };
      } else if (f && f.type === "ace") {
        const pos = f.ed.getCursorPosition();
        const line = f.ed.session.getLine(pos.row);
        info = { before: line.slice(0, pos.column), after: line.slice(pos.column), type: "ace" };
      } else if (f && f.type === "cm5") {
        const c = f.ed.getCursor();
        const line = f.ed.getLine(c.line);
        info = { before: line.slice(0, c.ch), after: line.slice(c.ch), type: "cm5" };
      }
    } catch (e) { info = ""; }
    root().dataset.ksLine = info ? JSON.stringify(info) : "";
  }

  // ---------- exact insert (direct paste, bypasses every auto-indent / auto-close hook) ----------
  function insertExact(text) {
    const f = focusedEditor();
    let ok = false;
    try {
      if (f && f.type === "monaco") {
        f.ed.pushUndoStop && f.ed.pushUndoStop();
        f.ed.executeEdits("ks-paste", [{ range: f.ed.getSelection(), text, forceMoveMarkers: true }]);
        f.ed.pushUndoStop && f.ed.pushUndoStop();
        ok = true;
      } else if (f && f.type === "ace") {
        const end = f.ed.session.replace(f.ed.getSelectionRange(), text);
        f.ed.selection.moveTo(end.row, end.column);
        ok = true;
      } else if (f && f.type === "cm5") {
        f.ed.replaceSelection(text, "end");
        ok = true;
      } else if (f && f.type === "cm6") {
        // a plain transaction never goes through closeBrackets / indentOnInput, so the text lands exactly as given
        const sel = f.ed.state.selection.main;
        f.ed.dispatch({
          changes: { from: sel.from, to: sel.to, insert: text },
          selection: { anchor: sel.from + text.length },
          scrollIntoView: true,
          userEvent: "input.paste"
        });
        ok = true;
      }
    } catch (e) { ok = false; }
    root().dataset.ksInserted = ok ? "true" : "false";
  }

  // ---------- suppress the editor's own auto behaviours while we type ----------
  const MONACO_DEFAULTS = {
    autoClosingBrackets: "languageDefined", autoClosingQuotes: "languageDefined",
    autoSurround: "languageDefined", autoIndent: "full",
    quickSuggestions: { other: "on", comments: "off", strings: "off" },
    suggestOnTriggerCharacters: true, acceptSuggestionOnCommitCharacter: true,
    acceptSuggestionOnEnter: "on"
  };
  const MONACO_OFF = {
    autoClosingBrackets: "never", autoClosingQuotes: "never", autoSurround: "never",
    quickSuggestions: false, suggestOnTriggerCharacters: false,
    acceptSuggestionOnCommitCharacter: false, acceptSuggestionOnEnter: "off"
  };

  function suppress(f) {
    const info = { monaco: false, ace: false, cm5: false };
    const ed = f.ed;
    if (f.type === "monaco") {
      let raw = {};
      try { raw = ed.getRawOptions ? ed.getRawOptions() : {}; } catch (e) {}
      const original = {};
      Object.keys(MONACO_OFF).forEach((k) => {
        original[k] = raw[k] !== undefined ? raw[k] : MONACO_DEFAULTS[k];
        try { ed.updateOptions({ [k]: MONACO_OFF[k] }); } catch (e) {} // one by one: an unknown key must not abort the rest
      });
      restoreStack.push(() => Object.keys(original).forEach((k) => { try { ed.updateOptions({ [k]: original[k] }); } catch (e) {} }));
      info.monaco = true;
    } else if (f.type === "ace") {
      const behaviours = ed.getBehavioursEnabled ? ed.getBehavioursEnabled() : true;
      const live = ed.getOption ? ed.getOption("enableLiveAutocompletion") : false;
      try { ed.setBehavioursEnabled(false); } catch (e) {}
      try { if (live) ed.setOption("enableLiveAutocompletion", false); } catch (e) {}
      restoreStack.push(() => {
        try { ed.setBehavioursEnabled(behaviours); } catch (e) {}
        try { if (live) ed.setOption("enableLiveAutocompletion", live); } catch (e) {}
      });
      info.ace = true;
    } else if (f.type === "cm5") {
      const brackets = ed.getOption("autoCloseBrackets");
      const tags = ed.getOption("autoCloseTags");
      try { ed.setOption("autoCloseBrackets", false); } catch (e) {}
      try { if (tags) ed.setOption("autoCloseTags", false); } catch (e) {}
      restoreStack.push(() => {
        try { ed.setOption("autoCloseBrackets", brackets); } catch (e) {}
        try { if (tags) ed.setOption("autoCloseTags", tags); } catch (e) {}
      });
      info.cm5 = true;
    }
    return info;
  }

  function analyzeAndApply() {
    // never stack a second set of "originals" on top of values we already changed
    if (restoreStack.length) { root().dataset.ksEngineHandled = "true"; return; }
    const f = focusedEditor();
    const handled = f ? suppress(f) : {};
    root().dataset.ksEngineHandled = f && (handled.monaco || handled.ace || handled.cm5) ? "true" : "false";
    root().dataset.ksEditorType = f ? f.type : "";
  }

  function restore() {
    const stack = restoreStack;
    restoreStack = [];
    stack.forEach((fn) => { try { fn(); } catch (e) {} });
    delete root().dataset.ksEngineHandled;
    delete root().dataset.ksEditorType;
  }

  window.addEventListener(EVENT, (e) => {
    let d = (e && e.detail) || {};
    if (typeof d === "string") { try { d = JSON.parse(d); } catch (x) { d = {}; } } // strings cross JS worlds reliably
    try {
      if (d.action === "ANALYZE_AND_APPLY") analyzeAndApply();
      else if (d.action === "RESTORE") restore();
      else if (d.action === "QUERY_LINE") queryLine();
      else if (d.action === "INSERT_EXACT") insertExact(String(d.text == null ? "" : d.text));
    } catch (err) {}
  });
})();
