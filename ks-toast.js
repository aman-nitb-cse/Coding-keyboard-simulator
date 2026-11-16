(() => {
  const KS = (self.KS = self.KS || {});
  if (KS.toast) return; // already loaded in this page
  class ToastManager {
    constructor() {
      this.host = null;
      this.shadow = null;
      this.container = null;
      this.hideTimeout = null;
    }

    init() {
      if (this.host && this.host.isConnected) return;
      this.host = document.createElement("div");
      this.host.id = "ks-pro-toast-host";
      Object.assign(this.host.style, {
        position: "fixed",
        top: "18px",
        right: "18px",
        zIndex: "2147483647",
        pointerEvents: "none"
      });
      this.shadow = this.host.attachShadow({ mode: "open" });

      const style = document.createElement("style");
      style.textContent = `
        .toast {
          min-width: 240px;
          max-width: 320px;
          background: rgba(15, 23, 42, 0.95);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border: 1px solid rgba(56, 189, 248, 0.35);
          border-radius: 12px;
          padding: 11px 14px;
          color: #f8fafc;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          box-shadow: 0 12px 28px -6px rgba(0, 0, 0, 0.55);
          transform: translateY(-12px) scale(0.97);
          opacity: 0;
          transition: transform 0.2s ease, opacity 0.2s ease;
          overflow: hidden;
          position: relative;
        }
        .toast.visible {
          transform: translateY(0) scale(1);
          opacity: 1;
        }
        .toast.success { border-color: rgba(16, 185, 129, 0.55); }
        .toast.warn { border-color: rgba(245, 158, 11, 0.55); }
        .row { display: flex; align-items: center; gap: 10px; }
        .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #38bdf8;
          box-shadow: 0 0 10px #38bdf8;
          flex-shrink: 0;
        }
        .dot.pulse { animation: pulse 1s infinite alternate; }
        .toast.success .dot { background: #10b981; box-shadow: 0 0 10px #10b981; }
        .toast.warn .dot { background: #f59e0b; box-shadow: 0 0 10px #f59e0b; }
        @keyframes pulse {
          0% { opacity: 0.45; transform: scale(0.88); }
          100% { opacity: 1; transform: scale(1.15); }
        }
        .content { flex: 1; }
        .title {
          font-size: 12.5px;
          font-weight: 700;
          color: #f8fafc;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .pct {
          font-size: 11px;
          font-family: ui-monospace, SFMono-Regular, monospace;
          color: #38bdf8;
          font-weight: 600;
        }
        .progress-track {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: rgba(255, 255, 255, 0.08);
        }
        .progress-bar {
          height: 100%;
          width: 0%;
          background: linear-gradient(90deg, #38bdf8, #10b981);
          transition: width 0.08s linear;
        }
      `;

      this.container = document.createElement("div");
      this.container.className = "toast";
      this.container.innerHTML = `
        <div class="row">
          <div class="dot" id="ks-dot"></div>
          <div class="content">
            <div class="title">
              <span id="ks-title">Typing...</span>
              <span class="pct" id="ks-pct"></span>
            </div>
          </div>
        </div>
        <div class="progress-track" id="ks-track">
          <div class="progress-bar" id="ks-bar"></div>
        </div>
      `;

      this.shadow.appendChild(style);
      this.shadow.appendChild(this.container);
      (document.body || document.documentElement).appendChild(this.host);
    }

    // A toast cannot be seen inside a tiny iframe: hand it to the top frame via the background worker.
    needsRelay() {
      try {
        if (window === window.top) return false;
        return window.innerWidth < 300 || window.innerHeight < 100;
      } catch (e) { return false; }
    }

    relay(opts) {
      const now = Date.now();
      const progressOnly = typeof opts.progress === "number" && !opts.autoHide;
      if (progressOnly && now - (this.lastRelay || 0) < 300) return; // throttle the progress ticks
      this.lastRelay = now;
      try { chrome.runtime.sendMessage({ action: "KS_TOAST_RELAY", opts }); } catch (e) {}
    }

    show(opts) {
      if (this.needsRelay()) { this.relay(opts); return; }
      this.render(opts);
    }

    render({ title, type = "info", pulse = false, progress = null, autoHide = 0 }) {
      this.init();
      clearTimeout(this.hideTimeout);

      const dot = this.shadow.getElementById("ks-dot");
      const titleEl = this.shadow.getElementById("ks-title");
      const pctEl = this.shadow.getElementById("ks-pct");
      const trackEl = this.shadow.getElementById("ks-track");
      const barEl = this.shadow.getElementById("ks-bar");

      this.container.className = "toast visible " + (type || "");
      dot.className = "dot" + (pulse ? " pulse" : "");
      titleEl.textContent = title;

      if (typeof progress === "number") {
        trackEl.style.display = "block";
        barEl.style.width = `${Math.min(100, Math.max(0, progress))}%`;
        pctEl.textContent = `${Math.round(progress)}%`;
      } else {
        trackEl.style.display = "none";
        pctEl.textContent = "";
      }

      if (autoHide > 0) {
        this.hideTimeout = setTimeout(() => this.hide(), autoHide);
      }
    }

    hide() {
      if (!this.container) return;
      this.container.classList.remove("visible");
    }
  }
  KS.toast = new ToastManager();
})();
