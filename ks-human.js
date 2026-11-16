// Human-like cadence + QWERTY typo helpers (logic unchanged from v1).
(() => {
  const KS = (self.KS = self.KS || {});
  if (KS.human) return; // already loaded in this page
  // Average human typing speed (~52-62 WPM -> ~155ms base keystroke interval with bursty cadence)
  const AVG_HUMAN_CHAR_MS = 145;
  // QWERTY neighbor map for realistic human fat-finger typos
  const QWERTY_NEIGHBORS = {
    a: "qwsz", b: "vghn", c: "xdfv", d: "ersfxc", e: "wsdr",
    f: "rtgvcd", g: "tyhbvf", h: "yujnbg", i: "ujko", j: "uikmnh",
    k: "ijlm", l: "okp", m: "njk", n: "bhjm", o: "iklp",
    p: "ol", q: "wa", r: "edft", s: "wedxza", t: "rfgy",
    u: "yhji", v: "cfgb", w: "qase", x: "zsdc", y: "tghu",
    z: "asx",
    "1": "2q", "2": "13qw", "3": "24we", "4": "35er", "5": "46rt",
    "6": "57ty", "7": "68yu", "8": "79ui", "9": "80io", "0": "9p"
  };
  function getAdjacentTypoChar(char) {
    const lower = char.toLowerCase();
    const neighbors = QWERTY_NEIGHBORS[lower];
    if (!neighbors) return null;
    const pick = neighbors.charAt(Math.floor(Math.random() * neighbors.length));
    return char === char.toUpperCase() && char !== lower ? pick.toUpperCase() : pick;
  }

  // Computes realistic human keystroke delay matching ~50-65 WPM average human cadence
  function getHumanKeystrokeDelay(char, prevChar, burstFactor) {
    // Base interval modified by current flow state (bursts vs slower careful typing)
    let delay = AVG_HUMAN_CHAR_MS * burstFactor * (0.68 + Math.random() * 0.65);

    // Same-finger / double-letter repeat is faster for humans
    if (char === prevChar && /[a-zA-Z0-9]/.test(char)) {
      delay *= 0.62;
    }
    // Uppercase or shifted symbols take slightly longer (Shift key coordination)
    else if (/[A-Z!@#$%^&*()_+{}|:"<>?]/.test(char)) {
      delay += 45 + Math.random() * 55;
    }
    // Numbers and operators require hand reach
    else if (/[0-9=\-[\]\\;',./]/.test(char)) {
      delay += 25 + Math.random() * 40;
    }

    // Word boundary micro-pause
    if (char === " " && prevChar !== " ") {
      delay += 35 + Math.random() * 60;
    }

    // Line break / statement end cognitive pause
    if (char === "\n") {
      delay += 210 + Math.random() * 240;
    } else if (char === ";" || char === "{" || char === "}") {
      delay += 110 + Math.random() * 140;
    }

    // Occasional micro-thinking pause (~2.5% chance at word/token starts)
    if (prevChar === " " && Math.random() < 0.06) {
      delay += 220 + Math.random() * 320;
    }

    return Math.round(delay);
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  KS.human = { AVG_HUMAN_CHAR_MS, getAdjacentTypoChar, getHumanKeystrokeDelay, sleep };
})();
