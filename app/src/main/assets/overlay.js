(function () {
  if (window.__showmark_v13) return; window.__showmark_v13 = true;
  const IS_TOP = window === window.top;
  const SM = window.ShowMarkShapes;
  const DEF = { tool: "none", lastTool: "auto", color: "#ff2d2d", width: 5, secs: 3, arrow: "arrow", fill: false, mode: "shape", hold: 350, zoomOn: true, zoom: 3, zoomSecs: 5, zoomColor: "#e6ff00", soundOn: true, vol: 0.5, zoomOrig: false, zoomSound: "random", arrowAnim: "random", zoomFx: "random", zbColor: "#e11d1d", zbWidth: 4, curtainOn: false, curtainDir: "random", curtainStyle: "soft", curtainSnd: "match", wipeGap: 0.15, wipeSecs: 0.8, dotOn: true, dotSize: 14, dotBlur: 1, dotOpacity: 0.8, dotShape: "dot", dotColor: "#e6ff00", dotAfter: 50 };
  let cfg = Object.assign({}, DEF);
  let drawing = null, shapes = [], raf = 0, suppressClickUntil = 0;
  let zdrag = null, zooms = [], suppressCtxUntil = 0;
  let cur = { strokes: [], timer: 0 }, groups = [];
  const MODES = ["shape", "en", "bn"];
  const MODE_NAME = { shape: "✨ আকৃতি (অটো)", en: "A ইংরেজি / সংখ্যা / গণিত লেখা", bn: "অ বাংলা লেখা" };
  const WRITE_WAIT = 1100;
  const FADE = 450, MOVE_TOL = 16;
  const isOn = () => cfg.tool !== "none";

  // ---------- ক্যানভাস (ক্লিক আটকায় না) ----------
  const cv = document.createElement("canvas");
  cv.style.cssText = "all:initial;position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483646;";
  const ctx = cv.getContext("2d");
  let W = 0, H = 0, dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ---------- ছোট বার্তা ----------
  const host = document.createElement("div");
  host.style.cssText = "all:initial;position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = "<style>#toast{position:fixed;left:50%;top:22px;transform:translateX(-50%);padding:9px 18px;border-radius:20px;background:rgba(18,20,34,.92);color:#fff;font:bold 17px 'Noto Sans Bengali','Nirmala UI','Segoe UI',Arial,sans-serif;opacity:0;transition:opacity .25s;pointer-events:none}</style><div id='toast'></div>";
  const toast = root.getElementById("toast");
  let toastT = 0;
  function showToast(t) {
    if (!IS_TOP) return;
    toast.textContent = t; toast.style.opacity = "1";
    clearTimeout(toastT); toastT = setTimeout(() => { toast.style.opacity = "0"; }, 1400);
  }
  function setTool(t) { const o = { tool: t }; if (t !== "none") o.lastTool = t; smchrome.storage.local.set(o); }

  function mount() {
    const r = document.documentElement; if (!r) return;
    if (!cv.isConnected) r.appendChild(cv);
    if (!host.isConnected) r.appendChild(host);
  }
  window.addEventListener("resize", resize);
  document.addEventListener("fullscreenchange", () => {
    const f = document.fullscreenElement;
    const h = f && !/^(VIDEO|IFRAME|CANVAS|IMG)$/.test(f.tagName) ? f : document.documentElement;
    h.appendChild(cv); h.appendChild(host); resize();
  });

  // ---------- সেটিং ----------
  smchrome.storage.local.get(DEF, (r) => { cfg = Object.assign({}, DEF, r); mount(); resize(); setTimeout(warmSounds, 0); if (isOn()) showToast("✨ ShowMark চালু আছে"); });
  smchrome.storage.onChanged.addListener((ch) => {
    for (const k in ch) { if (k.indexOf("smsnd_") !== 0) cfg[k] = ch[k].newValue; }
    if (ch.zoomSound || ch.curtainSnd) warmSounds();
    if (ch.mode) { clearTimeout(cur.timer); cur = { strokes: [], timer: 0 }; showToast(MODE_NAME[cfg.mode] || ""); }
    if (ch.tool) {
      drawing = null; clearTimeout(cur.timer); cur = { strokes: [], timer: 0 };
      if (!isOn()) { shapes = []; clearZooms(); }
      zselRemove(); zdrag = null; setHideAttr(false); setDrawAttr(false);
      showToast(isOn() ? "✨ চালু (বাম বাটন চেপে ধরে রেখে টানো)" : "দাগ বন্ধ");
    }
    loop();
  });

  // ---------- বাম বাটন চেপে ধরে রেখে আঁকা ----------
  // সাধারণ ক্লিক/টানা/সিলেক্ট/কপি আগের মতোই চলে। বাম বাটন চেপে একটু (হোল্ড সময়) স্থির ধরে রাখলে
  // আঁকার মোড চালু হয় (কার্সর ক্রসহেয়ার হয়), তখন টানলে দাগ হয়।
  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
  let lastInter = false;
  function syncInter() { const r = document.documentElement; const on = !!(r && (r.hasAttribute("data-showmark-draw") || r.hasAttribute("data-showmark-hide"))); if (on !== lastInter) { lastInter = on; smchrome.overlay.setInteractive(on); } }
  const sty = document.createElement("style");
  sty.textContent = "html[data-showmark-draw],html[data-showmark-draw] *{cursor:crosshair !important;user-select:none !important;-webkit-user-select:none !important;}html[data-showmark-hide],html[data-showmark-hide] *{cursor:none !important;}";
  const setDrawAttr = (on) => { const r = document.documentElement; if (!r) return; if (on && !sty.isConnected) (document.head || r).appendChild(sty); r.toggleAttribute("data-showmark-draw", on); syncInter(); };
  const setHideAttr = (on) => { const r = document.documentElement; if (!r) return; if (on && !sty.isConnected) (document.head || r).appendChild(sty); r.toggleAttribute("data-showmark-hide", on); syncInter(); };

  const downL = (e) => {
    if (e.button !== 0 || !isOn() || e.ctrlKey) return;
    const t = e.target;
    if (t && t.closest && t.closest("select,input[type=range],input[type=color]")) return;
    mount();
    const a = [e.clientX, e.clientY];
    const d = { pts: [a], ts: [0], t0: performance.now(), a: a, b: a, active: false };
    drawing = d;
    const hms = Math.max(60, Number(cfg.hold) || 350);
    d.prog = showProg(a[0], a[1], hms); if (cfg.soundOn) audio();
    d.timer = setTimeout(() => {
      if (drawing !== d) return;
      d.prog && d.prog();
      d.active = true; setDrawAttr(true); pulse(d.a[0], d.a[1]);
      try { window.getSelection().removeAllRanges(); } catch (_) {}
      loop();
    }, Math.max(60, Number(cfg.hold) || 350));
  };

  const moveL = (e) => {
    if (!drawing) return;
    const d = drawing;
    if (!(e.buttons & 1)) { finish(); return; }
    if (!d.active) {
      if (Math.hypot(e.clientX - d.a[0], e.clientY - d.a[1]) > MOVE_TOL) { clearTimeout(d.timer); d.prog && d.prog(); drawing = null; }
      return;
    }
    const l = d.pts[d.pts.length - 1];
    if (Math.hypot(e.clientX - l[0], e.clientY - l[1]) >= 2) { d.pts.push([e.clientX, e.clientY]); d.ts.push(Math.round(performance.now() - d.t0)); }
    d.b = [e.clientX, e.clientY];
    stop(e);
  };

  const upL = (e) => {
    if (e.button !== 0 || !drawing) return;
    if (drawing.active) stop(e);
    finish();
  };

  window.addEventListener("click", (e) => { if (performance.now() < suppressClickUntil) stop(e); }, true);
  window.addEventListener("dragstart", (e) => { if (drawing && drawing.active) e.preventDefault(); }, true);
  window.addEventListener("selectstart", (e) => { if (drawing && drawing.active) e.preventDefault(); }, true);
  window.addEventListener("pointermove", (e) => { if (drawing && drawing.active) e.stopPropagation(); }, true);
  window.addEventListener("pointerup", (e) => { if (drawing && drawing.active) e.stopPropagation(); }, true);

  // আঁকা/সিলেক্ট শুরু হলে কার্সরের চারপাশে একটা রিং ফুটে ওঠে
  const pl = document.createElement("style");
  pl.textContent = ".pl{position:fixed;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:3px solid #16a34a;box-shadow:0 0 12px rgba(22,163,74,.8);pointer-events:none}";
  root.appendChild(pl);
  const pg = document.createElement("style");
  pg.textContent = ".pg{position:fixed;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:3px solid #16a34a;border-top-color:transparent;pointer-events:none;opacity:.9}";
  root.appendChild(pg);
  function showProg(x, y, ms) {
    const el = document.createElement("div"); el.className = "pg"; el.style.left = x + "px"; el.style.top = y + "px";
    root.appendChild(el);
    el.animate([{ transform: "scale(1) rotate(0deg)", opacity: 0.35 }, { transform: "scale(1) rotate(360deg)", opacity: 1 }], { duration: ms, easing: "linear" });
    return () => el.remove();
  }
  function pulse(x, y) {
    const el = document.createElement("div"); el.className = "pl"; el.style.left = x + "px"; el.style.top = y + "px";
    root.appendChild(el);
    const an = el.animate([{ transform: "scale(.4)", opacity: 1 }, { transform: "scale(1.4)", opacity: 0 }], { duration: 420, easing: "ease-out" });
    an.onfinish = () => el.remove();
  }

  // ---------- সাউন্ড ইফেক্ট (কোনো ফাইল লাগে না, নিজেই তৈরি হয়) ----------
  let ac = null, nbuf = null, lastZ = -1, lastA = -1;
  function audio() {
    try { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === "suspended") ac.resume(); } catch (_) { ac = null; }
    return ac;
  }
  const volume = () => Math.max(0, Math.min(1, Number(cfg.vol))) * 0.25;
  function tone(a, t, f0, f1, dur, vol, type) {
    const o = a.createOscillator(), g = a.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol), t + Math.min(0.015, dur / 3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(a, t, dur, vol, f0, f1, Q, type) {
    if (!nbuf || nbuf.sampleRate !== a.sampleRate) { nbuf = a.createBuffer(1, a.sampleRate, a.sampleRate); const d = nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const s = a.createBufferSource(); s.buffer = nbuf; s.loop = true;
    const f = a.createBiquadFilter(); f.type = type || "bandpass"; f.Q.value = Q || 1;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol), t + Math.min(0.07, dur * 0.3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(a.destination); s.start(t); s.stop(t + dur + 0.05);
  }
  function playTick() {
    if (!cfg.soundOn) return; const a = audio(); if (!a) return;
    tone(a, a.currentTime, 1500, 1500, 0.06, volume() * 0.5);
  }

  // জুম বক্স ফুটে ওঠার ৮টি আলাদা সাউন্ড
  const ZSND = [
    // ০ নরম পপ
    (a, t, v) => { noise(a, t, 0.3, v * 0.8, 450, 3400, 1.1); tone(a, t + 0.05, 880, 880, 0.4, v * 0.9); tone(a, t + 0.11, 1318.5, 1318.5, 0.45, v * 0.6); tone(a, t + 0.17, 1760, 1760, 0.5, v * 0.3); },
    // ১ কাচের চাইম
    (a, t, v) => { [1318.5, 1760, 2093, 2637, 3136].forEach((f, i) => tone(a, t + i * 0.045, f, f, 0.9 - i * 0.08, v * (0.75 - i * 0.09))); noise(a, t, 0.25, v * 0.25, 6000, 9000, 2, "highpass"); },
    // ২ ম্যাজিক সুইপ
    (a, t, v) => { noise(a, t, 0.38, v * 0.7, 300, 6500, 1.4); [523.3, 659.3, 784, 1046.5, 1318.5, 1568].forEach((f, i) => tone(a, t + 0.04 + i * 0.055, f, f, 0.35, v * 0.55, "triangle")); },
    // ৩ গভীর বুম + ঝিলিক
    (a, t, v) => { tone(a, t, 110, 38, 0.7, v * 2.2); noise(a, t, 0.22, v * 0.9, 900, 120, 0.8, "lowpass"); [2093, 2793, 3520].forEach((f, i) => tone(a, t + 0.12 + i * 0.05, f, f, 0.5, v * 0.3)); },
    // ৪ বাবল পপ
    (a, t, v) => { tone(a, t, 260, 900, 0.13, v * 1.1); tone(a, t + 0.11, 420, 1500, 0.11, v * 0.9); tone(a, t + 0.2, 700, 2200, 0.1, v * 0.6); noise(a, t, 0.05, v * 0.4, 3000, 6000, 1, "highpass"); },
    // ৫ লেজার জ্যাপ
    (a, t, v) => { tone(a, t, 2000, 180, 0.2, v * 0.45, "sawtooth"); tone(a, t + 0.16, 880, 880, 0.35, v * 0.7); tone(a, t + 0.2, 1318.5, 1318.5, 0.4, v * 0.5); },
    // ৬ ঘণ্টা
    (a, t, v) => { [[1, 1], [2.76, 0.5], [5.4, 0.3], [8.93, 0.18]].forEach((m, i) => tone(a, t, 740 * m[0], 740 * m[0], 1.3 - i * 0.22, v * m[1] * 1.1)); },
    // ৭ হুশ + হিট
    (a, t, v) => { noise(a, t, 0.28, v * 1.0, 200, 4200, 0.9); noise(a, t + 0.26, 0.14, v * 1.2, 1800, 200, 0.8, "lowpass"); tone(a, t + 0.26, 150, 55, 0.35, v * 1.8); tone(a, t + 0.3, 1568, 1568, 0.4, v * 0.35); },
  ];
  // তীরের ৬টি অ্যানিমেশনের সাথে মেলানো সাউন্ড
  const ASND = [
    (a, t, v) => { noise(a, t, 0.32, v * 0.6, 500, 3200, 1.2); tone(a, t + 0.46, 760, 1140, 0.14, v * 0.7); },
    (a, t, v) => { noise(a, t, 0.55, v * 0.45, 1200, 7000, 2, "highpass"); tone(a, t, 380, 2200, 0.55, v * 0.35, "triangle"); tone(a, t + 0.58, 1568, 1568, 0.3, v * 0.45); },
    (a, t, v) => { tone(a, t, 180, 900, 0.2, v * 0.8, "triangle"); tone(a, t + 0.2, 900, 300, 0.14, v * 0.6, "triangle"); tone(a, t + 0.34, 300, 620, 0.12, v * 0.45, "triangle"); tone(a, t + 0.46, 620, 420, 0.12, v * 0.3, "triangle"); },
    (a, t, v) => { tone(a, t, 988, 988, 0.5, v * 0.6); tone(a, t + 0.34, 1319, 1319, 0.5, v * 0.5); tone(a, t + 0.68, 988, 988, 0.6, v * 0.35); tone(a, t + 1.0, 1319, 1319, 0.6, v * 0.25); },
    (a, t, v) => { for (let i = 0; i < 7; i++) tone(a, t + i * 0.07, 2000 + Math.random() * 3000, 2000 + Math.random() * 3000, 0.12, v * 0.35); tone(a, t + 0.5, 2349, 2349, 0.35, v * 0.4); },
    (a, t, v) => { tone(a, t, 220, 440, 0.5, v * 0.3, "sawtooth"); tone(a, t, 225, 445, 0.5, v * 0.3, "sawtooth"); noise(a, t, 0.5, v * 0.35, 300, 1800, 3); tone(a, t + 0.5, 1046, 1046, 0.25, v * 0.5); },
  ];
  // ---------- আরও অনেক ভাইরাল সাউন্ড (নিজেই তৈরি হয়, কোনো ফাইল লাগে না) ----------
  // জুম বক্সের নতুন ১৬টি (৮–২৩)
  const ZSND_NEW = [
    // ৮ হুশ-পপ
    (a, t, v) => { noise(a, t, 0.25, v * 0.9, 250, 5200, 1); tone(a, t + 0.22, 300, 1100, 0.09, v * 1.2); noise(a, t + 0.22, 0.06, v * 0.5, 2500, 6000, 1, "highpass"); },
    // ৯ ক্যামেরা শাটার
    (a, t, v) => { noise(a, t, 0.03, v * 1.2, 5000, 6000, 1.2, "highpass"); tone(a, t, 2200, 1200, 0.04, v * 0.4, "square"); noise(a, t + 0.07, 0.05, v * 1.0, 3500, 2000, 1.5); tone(a, t + 0.3, 1568, 1568, 0.25, v * 0.3); },
    // ১০ ক্যাশ রেজিস্টার ক্রিং
    (a, t, v) => { tone(a, t, 150, 100, 0.12, v * 1.2); [[2637, 0.6], [3951, 0.45], [5274, 0.25]].forEach((m, i) => tone(a, t + 0.1, m[0], m[0], 1.0 - i * 0.2, v * m[1])); },
    // ১১ বয়ইং স্প্রিং
    (a, t, v) => { [[200, 600], [600, 260], [260, 520], [520, 330], [330, 420]].forEach((m, i) => tone(a, t + i * 0.1, m[0], m[1], 0.12, v * 0.9, "triangle")); },
    // ১২ লেভেল-আপ
    (a, t, v) => { [523.3, 659.3, 784, 1046.5, 1318.5].forEach((f, i) => tone(a, t + i * 0.07, f, f, 0.18, v * 0.7, "triangle")); [784, 1046.5, 1568].forEach((f) => tone(a, t + 0.4, f, f, 0.55, v * 0.4)); },
    // ১৩ ভাইন-স্টাইল গভীর বুম
    (a, t, v) => { tone(a, t, 90, 35, 0.9, v * 2.6); tone(a, t + 0.01, 180, 60, 0.4, v * 0.5, "sawtooth"); noise(a, t, 0.35, v * 1.2, 400, 60, 0.7, "lowpass"); },
    // ১৪ সিনেমাটিক রাইজার + ইমপ্যাক্ট
    (a, t, v) => { noise(a, t, 0.45, v * 0.9, 200, 7000, 1.5); tone(a, t, 200, 1600, 0.45, v * 0.25, "sawtooth"); tone(a, t + 0.45, 120, 40, 0.6, v * 2.2); noise(a, t + 0.45, 0.3, v * 1.0, 1200, 100, 0.8, "lowpass"); },
    // ১৫ ঝিলমিল স্পার্কল
    (a, t, v) => { [2400, 3100, 2700, 3500, 2900, 3800, 3300, 4100, 3600, 4400].forEach((f, i) => tone(a, t + i * 0.045, f, f, 0.18, v * 0.3)); },
    // ১৬ টেপ স্টপ-ডাউন
    (a, t, v) => { tone(a, t, 900, 70, 0.55, v * 0.6, "sawtooth"); noise(a, t, 0.55, v * 0.35, 3000, 200, 1, "lowpass"); tone(a, t + 0.55, 1568, 1568, 0.3, v * 0.3); },
    // ১৭ ডাবল লেজার
    (a, t, v) => { tone(a, t, 2400, 300, 0.14, v * 0.4, "sawtooth"); tone(a, t + 0.16, 2400, 300, 0.14, v * 0.4, "sawtooth"); tone(a, t + 0.34, 1174.7, 1174.7, 0.4, v * 0.6); },
    // ১৮ প্লিং
    (a, t, v) => { tone(a, t, 1568, 1568, 0.5, v * 0.7); tone(a, t + 0.12, 2093, 2093, 0.8, v * 0.6); tone(a, t, 3136, 3136, 0.3, v * 0.2); },
    // ১৯ ডিজিটাল গ্লিচ
    (a, t, v) => { [900, 1700, 600, 2300, 1200, 3100].forEach((f, i) => tone(a, t + i * 0.04, f, f, 0.05, v * 0.4, "square")); noise(a, t, 0.25, v * 0.5, 4000, 1500, 3); tone(a, t + 0.3, 880, 880, 0.3, v * 0.4); },
    // ২০ বাবল ফাটা
    (a, t, v) => { for (let i = 0; i < 5; i++) tone(a, t + i * 0.06, 400 + i * 140, 1400 + i * 200, 0.08, v * 0.9); noise(a, t + 0.3, 0.06, v * 0.5, 3000, 6000, 1, "highpass"); },
    // ২১ হুইপ + ডিং
    (a, t, v) => { noise(a, t, 0.14, v * 1.1, 600, 6500, 2); tone(a, t + 0.14, 1568, 1568, 0.6, v * 0.7); tone(a, t + 0.14, 2349, 2349, 0.5, v * 0.3); },
    // ২২ বেস ড্রপ
    (a, t, v) => { tone(a, t, 160, 45, 0.5, v * 1.8); tone(a, t + 0.05, 160, 45, 0.5, v * 0.5, "sawtooth"); noise(a, t, 0.2, v * 0.5, 2000, 150, 1, "lowpass"); },
    // ২৩ স্লাইড হুইসেল
    (a, t, v) => { tone(a, t, 400, 2600, 0.45, v * 0.7); tone(a, t + 0.45, 2600, 2600, 0.12, v * 0.3); tone(a, t + 0.52, 1568, 1568, 0.3, v * 0.35); },
    // ২৪ হুইশ / ফাস্ট সুইশ (UI পপ হুইশ): মসৃণ বাতাসের ঝাপটা + নরম পপ
    (a, t, v) => { noise(a, t, 0.3, v * 1.0, 350, 7000, 0.9); noise(a, t + 0.02, 0.24, v * 0.4, 2500, 9500, 1.5, "highpass"); tone(a, t + 0.22, 360, 980, 0.08, v * 0.9); noise(a, t + 0.22, 0.05, v * 0.35, 3000, 6500, 1, "highpass"); tone(a, t + 0.26, 1174.7, 1174.7, 0.28, v * 0.25); },
  ];
  // তীরের নতুন ১৬টি অ্যানিমেশনের সাথে মেলানো ১৬টি সাউন্ড (৬–২১)
  const ASND_NEW = [
    // ৬ নিয়ন গুঞ্জন
    (a, t, v) => { tone(a, t, 440, 440, 0.5, v * 0.3, "sawtooth"); tone(a, t, 442, 442, 0.5, v * 0.3, "sawtooth"); noise(a, t, 0.4, v * 0.3, 1000, 4000, 2); tone(a, t + 0.45, 1568, 1568, 0.4, v * 0.4); },
    // ৭ রংধনু গ্লিসান্ডো
    (a, t, v) => { [523.3, 587.3, 659.3, 698.5, 784, 880, 987.8, 1046.5].forEach((f, i) => tone(a, t + i * 0.05, f, f, 0.14, v * 0.55, "triangle")); },
    // ৮ ড্যাশ-ড্যাশ টিক
    (a, t, v) => { for (let i = 0; i < 8; i++) tone(a, t + i * 0.08, 1800, 1800, 0.03, v * 0.45, "square"); tone(a, t + 0.7, 1318.5, 1318.5, 0.25, v * 0.4); },
    // ৯ বিন্দুর পপ
    (a, t, v) => { for (let i = 0; i < 8; i++) tone(a, t + i * 0.075, 500 + i * 70, 700 + i * 90, 0.06, v * 0.8); tone(a, t + 0.62, 1568, 1568, 0.3, v * 0.4); },
    // ১০ বিদ্যুৎ জ্যাপ
    (a, t, v) => { noise(a, t, 0.3, v * 0.9, 3000, 800, 4); tone(a, t, 1800, 200, 0.12, v * 0.4, "sawtooth"); tone(a, t + 0.14, 2200, 300, 0.1, v * 0.35, "sawtooth"); tone(a, t + 0.3, 150, 60, 0.3, v * 0.9); },
    // ১১ ঢেউয়ের টুং
    (a, t, v) => { [0, 0.25, 0.5].forEach((d, i) => tone(a, t + d, 880, 880, 0.7, v * (0.5 - i * 0.12))); noise(a, t, 0.5, v * 0.15, 2000, 4000, 2); },
    // ১২ উল্টো টান
    (a, t, v) => { tone(a, t, 1568, 1568, 0.15, v * 0.6); noise(a, t + 0.1, 0.4, v * 0.5, 6000, 500, 1.5); },
    // ১৩ দ্বিগুণ মিলন
    (a, t, v) => { tone(a, t, 400, 600, 0.5, v * 0.4, "triangle"); tone(a, t, 800, 600, 0.5, v * 0.4, "triangle"); tone(a, t + 0.5, 1200, 1200, 0.3, v * 0.4); },
    // ১৪ কলমের আঁচড়
    (a, t, v) => { noise(a, t, 0.9, v * 0.35, 1500, 2800, 3); tone(a, t + 0.88, 1046.5, 1046.5, 0.35, v * 0.4); },
    // ১৫ হার্টবিট
    (a, t, v) => { [0, 0.18, 0.62, 0.8].forEach((d, i) => tone(a, t + d, 70, 45, 0.15, v * (i < 2 ? 2.0 : 1.6))); },
    // ১৬ ঝিলিক সোয়াইপ
    (a, t, v) => { noise(a, t, 0.5, v * 0.5, 2000, 9000, 2, "highpass"); [2637, 3136, 3951].forEach((f, i) => tone(a, t + 0.45 + i * 0.05, f, f, 0.4, v * 0.35)); },
    // ১৭ লাফানো বয়ইং
    (a, t, v) => { tone(a, t, 300, 700, 0.1, v * 0.9, "triangle"); tone(a, t + 0.15, 500, 280, 0.1, v * 0.7, "triangle"); tone(a, t + 0.28, 300, 600, 0.09, v * 0.6, "triangle"); tone(a, t + 0.4, 480, 350, 0.09, v * 0.4, "triangle"); },
    // ১৮ ঘূর্ণির হুইর
    (a, t, v) => { tone(a, t, 300, 1200, 0.6, v * 0.4, "sawtooth"); tone(a, t, 1200, 300, 0.6, v * 0.25, "triangle"); noise(a, t, 0.6, v * 0.4, 500, 3000, 2); },
    // ১৯ স্ফুলিঙ্গের কড়কড়
    (a, t, v) => { for (let i = 0; i < 9; i++) noise(a, t + i * 0.05, 0.05, v * 0.6, 3500 + i * 300, 6000, 1.5, "highpass"); tone(a, t, 1500, 500, 0.3, v * 0.3, "sawtooth"); },
    // ২০ রাবার ব্যান্ড টুয়াং
    (a, t, v) => { tone(a, t, 330, 300, 0.3, v * 0.7, "triangle"); tone(a, t + 0.15, 300, 340, 0.3, v * 0.6, "triangle"); tone(a, t + 0.3, 340, 320, 0.3, v * 0.5, "triangle"); },
    // ২১ স্টপ-মোশন ক্লিক
    (a, t, v) => { for (let i = 0; i < 8; i++) tone(a, t + i * 0.1, 1200 + (i % 2) * 400, 1200 + (i % 2) * 400, 0.025, v * 0.6, "square"); tone(a, t + 0.85, 1318.5, 1318.5, 0.35, v * 0.5); },
  ];
  ZSND.push.apply(ZSND, ZSND_NEW); ASND.push.apply(ASND, ASND_NEW);
  // পর্দা সরার ১০টি ভাইরাল সাউন্ড
  const CSND = [
    // ০ সোয়াইপ হুশ
    (a, t, d, v) => { noise(a, t, d * 0.9, v * 1.0, 250, 6000, 1); tone(a, t + d * 0.85, 1318.5, 1318.5, 0.3, v * 0.3); },
    // ১ সিনেমাটিক রিভিল
    (a, t, d, v) => { noise(a, t, d, v * 0.8, 200, 7000, 1.5); tone(a, t, 200, 1600, d, v * 0.22, "sawtooth"); tone(a, t + d * 0.92, 120, 45, 0.5, v * 1.8); noise(a, t + d * 0.92, 0.25, v * 0.9, 1200, 100, 0.8, "lowpass"); },
    // ২ টা-ডা
    (a, t, d, v) => { noise(a, t, d * 0.7, v * 0.5, 300, 4500, 1.2); [523.3, 659.3, 784, 1046.5].forEach((f, i) => tone(a, t + d * 0.7 + i * 0.07, f, f, 0.25, v * 0.6, "triangle")); [784, 1046.5, 1568].forEach((f) => tone(a, t + d * 0.7 + 0.3, f, f, 0.6, v * 0.4)); },
    // ৩ কাচের ঝিলিক
    (a, t, d, v) => { noise(a, t, d, v * 0.4, 5000, 9000, 2, "highpass"); [2637, 3136, 3951, 4699].forEach((f, i) => tone(a, t + d * (0.3 + i * 0.17), f, f, 0.4, v * 0.35)); },
    // ৪ বেস সুইশ
    (a, t, d, v) => { tone(a, t, 180, 50, d * 0.8, v * 1.4); noise(a, t, d * 0.7, v * 0.7, 300, 2500, 1, "lowpass"); tone(a, t + d * 0.8, 1568, 1568, 0.3, v * 0.3); },
    // ৫ জিপার
    (a, t, d, v) => { const n = 24; for (let i = 0; i < n; i++) tone(a, t + (i / n) * d, 1200 + i * 60, 1200 + i * 60, 0.02, v * 0.3, "square"); noise(a, t, d, v * 0.35, 1500, 5000, 2); tone(a, t + d, 1318.5, 1318.5, 0.25, v * 0.35); },
    // ৬ পপ-ডিং
    (a, t, d, v) => { noise(a, t, d * 0.6, v * 0.5, 300, 4000, 1); tone(a, t + d * 0.6, 300, 1100, 0.09, v * 1.1); tone(a, t + d * 0.65, 1568, 1568, 0.6, v * 0.6); },
    // ৭ ঝিলমিল সুইপ
    (a, t, d, v) => { noise(a, t, d, v * 0.4, 800, 6500, 1.2); for (let i = 0; i < 10; i++) { const f = 2000 + i * 240; tone(a, t + (i / 10) * d, f, f, 0.18, v * 0.28); } },
    // ৮ হুশ + বুম
    (a, t, d, v) => { noise(a, t, d * 0.9, v * 1.0, 200, 4200, 0.9); tone(a, t + d * 0.9, 150, 55, 0.4, v * 1.9); noise(a, t + d * 0.9, 0.16, v * 1.1, 1800, 200, 0.8, "lowpass"); tone(a, t + d * 0.95, 1568, 1568, 0.4, v * 0.35); },
    // ৯ হুইশ / ফাস্ট সুইশ (UI পপ হুইশ)
    (a, t, d, v) => { noise(a, t, d * 0.9, v * 1.0, 350, 7000, 0.9); noise(a, t + d * 0.05, d * 0.7, v * 0.4, 2500, 9500, 1.5, "highpass"); tone(a, t + d * 0.82, 360, 980, 0.08, v * 0.9); noise(a, t + d * 0.82, 0.05, v * 0.35, 3000, 6500, 1, "highpass"); tone(a, t + d * 0.86, 1174.7, 1174.7, 0.28, v * 0.25); },
  ];

  // ---------- নিজের যোগ করা সাউন্ড (গ্যালারি/ফাইল থেকে) ----------
  // সেটিংয়ে যোগ করা সাউন্ড সবসময় সেভ থাকে: customSounds = তালিকা (নাম/আইডি), smsnd_<আইডি> = ফাইলের ডেটা।
  // ডিকোড করা সাউন্ড মনে রাখা হয় (sndBuf), তাই প্রথমবারের পর কোনো দেরি হয় না।
  const sndBuf = {}, sndWait = {};
  const customId = (v) => { v = String(v); return v.indexOf("c:") === 0 ? v.slice(2) : null; };
  function loadSnd(id, cb) {
    if (sndBuf[id]) { cb && cb(sndBuf[id]); return; }
    if (sndWait[id]) { cb && sndWait[id].push(cb); return; }
    sndWait[id] = cb ? [cb] : [];
    const done = (ab) => { if (ab) sndBuf[id] = ab; const w = sndWait[id] || []; delete sndWait[id]; w.forEach((f) => { try { f(ab); } catch (_) {} }); };
    const k = "smsnd_" + id, q = {}; q[k] = "";
    const dec = (u) => {
      if (!u || typeof u !== "string" || u.indexOf(",") < 0) { done(null); return; }
      try {
        const bin = atob(u.slice(u.indexOf(",") + 1)), b = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
        const oc = new OfflineAudioContext(2, 1, 48000);
        const p = oc.decodeAudioData(b.buffer, (ab) => done(ab), () => done(null));
        if (p && p.catch) p.catch(() => {});
      } catch (_) { done(null); }
    };
    try { smchrome.storage.local.get(q, (r) => dec(r && r[k])); } catch (_) { done(null); }
  }
  function playCustom(id, delaySec) {
    const a = audio(); if (!a) return;
    const t0 = a.currentTime + Math.max(0, delaySec || 0);
    loadSnd(id, (ab) => {
      if (!ab) return;
      try {
        const s = a.createBufferSource(), g = a.createGain(), t = Math.max(a.currentTime, t0);
        const vol = Math.max(0, Math.min(1, Number(cfg.vol))), len = Math.min(ab.duration, 10);
        s.buffer = ab; g.gain.setValueAtTime(vol, t);
        if (ab.duration > 10) { g.gain.setValueAtTime(vol, t + len - 0.2); g.gain.linearRampToValueAtTime(0, t + len); }
        s.connect(g); g.connect(a.destination); s.start(t); s.stop(t + len + 0.05);
      } catch (_) {}
    });
  }
  function warmSounds() { [cfg.zoomSound, cfg.curtainSnd].forEach((v) => { const id = customId(v); if (id && !sndBuf[id]) loadSnd(id); }); }
  function curtainSound(delaySec, durSec) {
    if (!cfg.soundOn) return;
    const sv = String(cfg.curtainSnd);
    if (sv === "off") return; // মিউট
    const cid = customId(sv);
    if (cid) { playCustom(cid, delaySec); return; }
    const a = audio(); if (!a) return;
    let idx = parseInt(sv, 10); if (!(idx >= 0)) idx = 7; // স্বয়ংক্রিয় = ঝিলমিল সুইপ
    const t = a.currentTime + Math.max(0, delaySec), d = Math.max(0.2, durSec), v = volume();
    try { CSND[Math.max(0, Math.min(CSND.length - 1, idx | 0))](a, t, d, v); } catch (_) {}
  }

  function pick(setting, n, last) {
    let i = parseInt(setting, 10);
    if (!(i >= 0 && i < n)) { do { i = Math.floor(Math.random() * n); } while (i === last && n > 1); }
    return i;
  }
  function playZoomSound() {
    if (!cfg.soundOn) return;
    const sv = String(cfg.zoomSound);
    if (sv === "off") return; // মিউট
    const cid = customId(sv);
    if (cid) { playCustom(cid, 0); return; }
    const a = audio(); if (!a) return;
    lastZ = pick(sv, ZSND.length, lastZ);
    try { ZSND[lastZ](a, a.currentTime, volume()); } catch (_) {}
  }
  function pickArrowAnim() { lastA = pick(cfg.arrowAnim, 22, lastA); return lastA; }
  function playArrowSound(i) {
    if (!cfg.soundOn) return; const a = audio(); if (!a) return;
    try { ASND[i % ASND.length](a, a.currentTime, volume()); } catch (_) {}
  }

  // ---------- ডান বাটন: চার কোনা সিলেক্ট করে বড় জুম বক্স ----------
  const rectOf = (d) => ({ x: Math.min(d.a[0], d.b[0]), y: Math.min(d.a[1], d.b[1]), w: Math.abs(d.a[0] - d.b[0]), h: Math.abs(d.a[1] - d.b[1]) });
  function zoomCancel() { zselRemove(); if (zdrag) { clearTimeout(zdrag.timer); zdrag.prog && zdrag.prog(); zdrag = null; } setDrawAttr(false); setHideAttr(false); loop(); }
  const zs = document.createElement("style");
  zs.textContent = ".zb{position:fixed;overflow:hidden;border-radius:14px;isolation:isolate;pointer-events:none;box-shadow:0 10px 36px rgba(0,0,0,.55);transform-origin:center}.zb .im{position:absolute;inset:0;background-repeat:no-repeat}.zb canvas{position:absolute;left:0;top:0;width:100%;height:100%}.zb .yl{position:absolute;inset:0;mix-blend-mode:multiply}.gh{position:fixed;border:3px solid #e11d1d;border-radius:8px;box-sizing:border-box;pointer-events:none;box-shadow:0 0 18px 4px rgba(255,230,0,.8);transform-origin:center}.zb .bd{position:absolute;inset:0;border:4px solid #e11d1d;border-radius:14px;box-sizing:border-box}.zb .pc{position:absolute;inset:0;isolation:isolate}";
  root.appendChild(zs);

  // ডান বাটন ধরে রাখলে পাতায় সবকিছু উধাও (বক্স নেই, কার্সর নেই, লেখা নেই)।
  // শুধু টেনে কিছুটা দূরে গেলে মাউসের জায়গায় ছোট্ট একটা গোল বিন্দু ভেসে ওঠে — সেটাই সিলেক্টের শেষ কোণা। শুরুতে আসে না।
  const zst = document.createElement("style");
  zst.textContent = ".dt{position:fixed;left:0;top:0;border-radius:50%;box-sizing:border-box;pointer-events:none;will-change:transform;animation:dtin .22s ease-out}" +
    "@keyframes dtin{from{opacity:0;scale:.3}to{opacity:var(--mo,.8);scale:1}}";
  root.appendChild(zst);
  let zsel = null;
  function zselRemove() { if (zsel) { zsel.el.remove(); zsel = null; } }
  function zselShow(d) {
    if (zsel || cfg.dotOn === false || window.__smNoDot) return;
    const sz = Math.max(4, Math.min(60, Number(cfg.dotSize) || 14)), mo = Math.max(0.1, Math.min(1, Number(cfg.dotOpacity) || 0.8));
    const bl = Math.max(0, Math.min(8, Number(cfg.dotBlur))), col = cfg.dotColor || "#e6ff00", ring_ = cfg.dotShape === "ring";
    const el = document.createElement("div"); el.className = "dt";
    el.style.cssText = "width:" + sz + "px;height:" + sz + "px;opacity:" + mo + ";--mo:" + mo + ";filter:blur(" + bl + "px);" +
      (ring_ ? "border:" + Math.max(1.5, sz / 7) + "px solid " + rgba(col, 0.95) + ";" : "background:" + rgba(col, 0.95) + ";") +
      "box-shadow:0 0 " + (3 + sz / 3) + "px " + rgba(col, 0.55) + ";";
    root.appendChild(el);
    zsel = { el: el, h: sz / 2 };
    zselUpdate(d);
  }
  function zselUpdate(d) {
    if (!zsel) return;
    zsel.el.style.transform = "translate(" + (d.b[0] - zsel.h) + "px," + (d.b[1] - zsel.h) + "px)";
  }

  // ডান বাটন চাপার সাথে সাথেই স্ক্রিনের ছবি আগে থেকে তুলে রাখি, যাতে ছাড়ার মুহূর্তেই ইফেক্ট আসে
  function precapture(onShown) {
    const o = {};
    o.promise = new Promise((resolve) => {
      const needHide = shapes.length || zooms.length || groups.length || cur.strokes.length || toast.style.opacity === "1";
      const go = () => {
        let done = false;
        const fin = (img) => { if (done) return; done = true; cv.style.visibility = ""; host.style.visibility = ""; resolve(img); if (onShown) onShown(); };
        try {
          smchrome.runtime.sendMessage({ type: "capture" }, (res) => {
            void smchrome.runtime.lastError;
            if (!res || !res.url) { fin(null); return; }
            const im = new Image(); o.url = res.url;
            im.onload = () => fin(im); im.onerror = () => fin(null); im.src = res.url;
          });
        } catch (err) { fin(null); }
        setTimeout(() => fin(null), 5000);
      };
      if (needHide) { cv.style.visibility = "hidden"; host.style.visibility = "hidden"; requestAnimationFrame(() => requestAnimationFrame(go)); } else go();
    });
    return o;
  }

  const downR = (e) => {
    if (e.button !== 2 || !isOn() || !cfg.zoomOn || e.ctrlKey || !IS_TOP) return;
    mount(); if (cfg.soundOn) audio();
    const a = [e.clientX, e.clientY], d = { a: a, b: a, active: false };
    zdrag = d;
    const t0 = performance.now(), hms = Math.max(60, Number(cfg.hold) || 350);
    d.timer = setTimeout(() => {
      if (zdrag !== d) return;
      d.prog && d.prog();
      // হ্যান্ডেল (থাকলে) আগে লুকিয়ে ফেলি, তারপর স্ক্রিনশট তুলি, শেষে হ্যান্ডেল ফেরত আনি
      if (window.__smHandleHide) window.__smHandleHide();
      const o = {}; d.pre = o;
      o.promise = new Promise((res) => setTimeout(() => { const p = precapture(); p.promise.then((img) => { o.url = p.url; res(img); }); }, window.__smHandleHide ? 70 : 0));
      o.promise.then(() => { if (zdrag === d && window.__smHandleShow) window.__smHandleShow(); });
      // ডেস্কটপে সাধারণ ডান-ক্লিকে স্ক্রিনশট নষ্ট না করতে, হোল্ড পূর্ণ হলেই তোলা হয়
      d.active = true; setDrawAttr(true); setHideAttr(true);
      try { window.getSelection().removeAllRanges(); } catch (_) {}
      d.ready = !(d.pre && d.pre.promise);
      if (!d.ready) { d.pre.promise.then(() => { d.ready = true; }); setTimeout(() => { d.ready = true; }, 900); }
      loop();
    }, Math.max(60, Number(cfg.hold) || 350));
  };

  const moveR = (e) => {
    if (!zdrag) return;
    const d = zdrag;
    if (!(e.buttons & 2)) { zoomCancel(); return; }
    if (!d.active) { if (Math.hypot(e.clientX - d.a[0], e.clientY - d.a[1]) > MOVE_TOL) zoomCancel(); return; }
    d.b = [e.clientX, e.clientY]; stop(e);
    if (!zsel && d.ready && Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]) >= Math.max(0, Number(cfg.dotAfter) >= 0 ? Number(cfg.dotAfter) : 50)) zselShow(d);
    else zselUpdate(d);
    loop();
  };

  const upR = (e) => {
    if (e.button !== 2 || !zdrag) return;
    const d = zdrag;
    if (!d.active) { zoomCancel(); return; }
    stop(e);
    suppressCtxUntil = performance.now() + 700;
    const r = rectOf(d), pre = d.pre; zoomCancel();
    if (r.w >= 14 && r.h >= 14) showZoom(r, pre);
  };

  window.addEventListener("contextmenu", (e) => { e.preventDefault(); }, true);
  window.addEventListener("dragstart", (e) => { if (zdrag && zdrag.active) e.preventDefault(); }, true);
  window.addEventListener("selectstart", (e) => { if (zdrag && zdrag.active) e.preventDefault(); }, true);
  window.addEventListener("pointermove", (e) => { if (zdrag && zdrag.active) e.stopPropagation(); }, true);
  window.addEventListener("pointerup", (e) => { if (zdrag && zdrag.active) e.stopPropagation(); }, true);

  function clearZooms() { zooms.forEach((z) => { clearTimeout(z.t); z.el.remove(); }); zooms = []; }

  function showZoom(r, pre) {
    if (pre && pre.promise) pre.promise.then((img) => { if (img) buildZoom(r, img, pre.url); else legacyZoom(r); });
    else legacyZoom(r);
  }

  function legacyZoom(r) {
    // ক্যাপচারের সময় আমাদের নিজের স্তর লুকিয়ে রাখি, যাতে শুধু আসল পাতা ওঠে
    cv.style.visibility = "hidden"; host.style.visibility = "hidden";
    requestAnimationFrame(() => requestAnimationFrame(() => {
      let sent = false;
      const back = () => { cv.style.visibility = ""; host.style.visibility = ""; };
      try {
        smchrome.runtime.sendMessage({ type: "capture" }, (res) => {
          void smchrome.runtime.lastError; sent = true; back();
          if (!res || !res.url) { showToast("স্ক্রিনশট নেওয়া গেল না"); return; }
          const im = new Image(); im.onload = () => buildZoom(r, im, res.url); im.src = res.url;
        });
      } catch (err) { back(); showToast("স্ক্রিনশট নেওয়া গেল না"); }
      setTimeout(() => { if (!sent) back(); }, 3000);
    }));
  }

  // ক্যাপচার করা অংশ কেটে বড় করে, পরিষ্কার (sharp) ও পড়ার মতো করে নেয়
  function crispCanvas(img, r, w2, h2, orig) {
    const pr = Math.min(2, Math.max(1, window.devicePixelRatio || 1)); // ফোনে ভারী না হতে সর্বোচ্চ ২
    const tw = Math.max(2, Math.round(w2 * pr)), th = Math.max(2, Math.round(h2 * pr));
    const c2 = document.createElement("canvas"); c2.width = tw; c2.height = th;
    const g = c2.getContext("2d", { willReadFrequently: true });
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
    const kx = img.naturalWidth / W, ky = img.naturalHeight / H;
    g.drawImage(img, r.x * kx, r.y * ky, r.w * kx, r.h * ky, 0, 0, tw, th);
    if (orig) return c2; // অরিজিনাল: স্ক্রিনে যেমন আছে হুবহু তেমন, কোনো রঙ বদল ছাড়া
    const id = g.getImageData(0, 0, tw, th), d = id.data, n = d.length;
    // অন্ধকার জায়গা হলে উল্টে দিই, যাতে হলুদের ওপর কালো লেখা হয়
    let sum = 0, cnt = 0;
    for (let i = 0; i < n; i += 16) { sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; cnt++; }
    const dark = sum / Math.max(1, cnt) < 115;
    if (dark) for (let i = 0; i < n; i += 4) { d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2]; }
    // শার্প করা (unsharp) + কনট্রাস্ট বাড়ানো
    const src = new Uint8ClampedArray(d), amt = 0.85, row = tw * 4;
    for (let y = 1; y < th - 1; y++) {
      for (let x = 1; x < tw - 1; x++) {
        const p = y * row + x * 4;
        for (let k = 0; k < 3; k++) {
          const v = src[p + k], blur = (src[p + k - 4] + src[p + k + 4] + src[p + k - row] + src[p + k + row]) / 4;
          let s = v + (v - blur) * amt * 2;
          s = (s - 128) * 1.18 + 128;
          d[p + k] = s < 0 ? 0 : s > 255 ? 255 : s;
        }
      }
    }
    g.putImageData(id, 0, 0);
    return c2;
  }

  function buildZoom(r, img, url) {
    const maxS = Math.max(1, Number(cfg.zoom) || 3);
    let s = Math.min(maxS, (W * 0.94) / r.w, (H * 0.9) / r.h);
    s = Math.max(0.5, s);
    const w2 = r.w * s, h2 = r.h * s, cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const left = w2 >= W - 12 ? 6 : Math.max(6, Math.min(W - w2 - 6, cx - w2 / 2));
    const top = h2 >= H - 12 ? 6 : Math.max(6, Math.min(H - h2 - 6, cy - h2 / 2));
    const el = document.createElement("div"); el.className = "zb";
    el.style.cssText = "left:" + left + "px;top:" + top + "px;width:" + w2 + "px;height:" + h2 + "px;";
    (() => {
      const mkInner = (orig) => {
        try { return crispCanvas(img, r, w2, h2, orig); }
        catch (err) {
          const d = document.createElement("div"); d.className = "im"; d.style.backgroundImage = "url(" + url + ")";
          d.style.backgroundSize = (W * s) + "px " + (H * s) + "px"; d.style.backgroundPosition = (-r.x * s) + "px " + (-r.y * s) + "px";
          return d;
        }
      };
      const yl = document.createElement("div"); yl.className = "yl"; yl.style.background = cfg.zoomColor || "#e6ff00";
      const bd = document.createElement("div"); bd.className = "bd";
      { const bw = Math.max(0, Number(cfg.zbWidth)); bd.style.border = (isNaN(bw) ? 4 : bw) > 0 ? ((isNaN(bw) ? 4 : bw) + "px solid " + (cfg.zbColor || "#e11d1d")) : "none"; }
      let wp = null;
      if (cfg.curtainOn && !cfg.zoomOrig) {
        // আগে শুধু অরিজিনাল; তার ওপরে মাস্ক-স্তর (রঙ + শার্প লেখা + বর্ডার) যা পরে বাম/ডান থেকে খুলে যায়
        const baseLayer = mkInner(true);
        el.appendChild(baseLayer);
        wp = makeWipe(); wp.base = baseLayer; wp.el.appendChild(mkInner(false)); wp.el.appendChild(yl); wp.el.appendChild(bd);
        el.appendChild(wp.el);
      } else {
        el.appendChild(mkInner(!!cfg.zoomOrig)); if (!cfg.zoomOrig) el.appendChild(yl);
        el.appendChild(bd);
      }
      popZoom(el, r, s, w2, h2, left, top, cx, cy, wp);
    })();
  }

  // ---------- জুম বক্স ফুটে ওঠার ৩২টি আলাদা ইফেক্ট (০ = আগের ক্লাসিকটা) ----------
  const zfx = document.createElement("style");
  zfx.textContent = ".rg{position:fixed;border-radius:16px;box-sizing:border-box;pointer-events:none;border:3px solid #e6ff00;box-shadow:0 0 22px rgba(255,230,0,.7)}";
  root.appendChild(zfx);
  let lastFx = -1;
  const FX_N = 32;
  function ring(el, left, top, w, h, delay) {
    const g = document.createElement("div"); g.className = "rg";
    g.style.cssText = "left:" + left + "px;top:" + top + "px;width:" + w + "px;height:" + h + "px;border-color:" + (cfg.zoomColor || "#e6ff00") + ";";
    root.insertBefore(g, el);
    const an = g.animate([{ transform: "scale(1)", opacity: 0 }, { transform: "scale(1.08)", opacity: 0.9, offset: 0.15 }, { transform: "scale(1.42)", opacity: 0 }], { duration: 680, delay: delay || 0, easing: "ease-out", fill: "backwards" });
    an.onfinish = () => g.remove();
  }
  function playFx(i, el, r, s, w2, h2, left, top, cx, cy) {
    const P = "perspective(900px) ";
    const run = (frames, ms, ease) => el.animate(frames, { duration: ms, easing: ease || "cubic-bezier(.2,.9,.3,1)" });
    if (i === 1) { // স্প্রিং বাউন্স + ঢেউ
      run([{ transform: "scale(.15)", opacity: 0 }, { transform: "scale(1.14)", opacity: 1, offset: 0.38 }, { transform: "scale(.94)", offset: 0.58 }, { transform: "scale(1.04)", offset: 0.76 }, { transform: "scale(.99)", offset: 0.9 }, { transform: "scale(1)" }], 640, "ease-out");
      ring(el, left, top, w2, h2, 120);
    } else if (i === 2) { // ৩ডি ফ্লিপ
      run([{ transform: P + "rotateY(-90deg) scale(.8)", opacity: 0 }, { transform: P + "rotateY(12deg) scale(1.04)", opacity: 1, offset: 0.7 }, { transform: P + "rotateY(0deg) scale(1)" }], 540);
    } else if (i === 3) { // ঝাপসা থেকে স্পষ্ট
      run([{ filter: "blur(22px) brightness(1.8) saturate(1.4)", transform: "scale(.9)", opacity: 0 }, { filter: "blur(8px) brightness(1.3) saturate(1.2)", opacity: 1, offset: 0.45 }, { filter: "blur(0px) brightness(1) saturate(1)", transform: "scale(1)", opacity: 1 }], 580, "ease-out");
    } else if (i === 4) { // পর্দা খোলা (মাঝখান থেকে)
      run([{ clipPath: "inset(0 50% 0 50% round 14px)", transform: "scale(.96)", opacity: 1 }, { clipPath: "inset(0 0 0 0 round 14px)", transform: "scale(1)", opacity: 1 }], 500, "cubic-bezier(.7,0,.2,1)");
    } else if (i === 5) { // নিচ থেকে স্লাইড
      run([{ transform: "translateY(70px) scale(.92)", opacity: 0, filter: "blur(6px)" }, { transform: "translateY(-6px) scale(1.01)", opacity: 1, filter: "blur(0px)", offset: 0.7 }, { transform: "translateY(0) scale(1)", opacity: 1, filter: "blur(0px)" }], 500);
    } else if (i === 6) { // স্পটলাইট গোল
      run([{ clipPath: "circle(0% at 50% 50%)", transform: "scale(.9)", opacity: 1 }, { clipPath: "circle(78% at 50% 50%)", transform: "scale(1)", opacity: 1 }], 620, "cubic-bezier(.3,.7,.2,1)");
    } else if (i === 7) { // গ্লিচ কাঁপুনি
      const n = "hue-rotate(0deg) saturate(1)";
      run([{ transform: "translate(-14px,0) skewX(-8deg)", filter: "hue-rotate(90deg) saturate(2.2)", opacity: 0 }, { transform: "translate(12px,2px) skewX(6deg)", filter: "hue-rotate(-60deg) saturate(2.2)", opacity: 1, offset: 0.15 }, { transform: "translate(-8px,-2px) skewX(-3deg)", filter: "hue-rotate(40deg) saturate(1.6)", offset: 0.3 }, { transform: "translate(6px,1px) skewX(2deg)", filter: n, offset: 0.45 }, { transform: "translate(-3px,0)", filter: n, offset: 0.6 }, { transform: "translate(0,0)", filter: n }], 540, "linear");
    } else if (i === 8) { // ঝপ করে পড়া
      run([{ transform: "scale(1.7) rotate(-5deg)", opacity: 0, filter: "blur(4px)" }, { transform: "scale(.96) rotate(1deg)", opacity: 1, filter: "blur(0px)", offset: 0.62 }, { transform: "scale(1.015) rotate(0deg)", offset: 0.8 }, { transform: "scale(1) rotate(0deg)", filter: "blur(0px)" }], 480, "cubic-bezier(.3,.8,.3,1)");
      ring(el, left, top, w2, h2, 260);
    } else if (i === 9) { // ফ্ল্যাশ + ডাবল ঢেউ
      run([{ filter: "brightness(3.2) saturate(.3)", transform: "scale(.8)", opacity: 0 }, { filter: "brightness(2) saturate(.7)", transform: "scale(1.05)", opacity: 1, offset: 0.3 }, { filter: "brightness(1) saturate(1)", transform: "scale(1)", opacity: 1 }], 580, "ease-out");
      ring(el, left, top, w2, h2, 80); ring(el, left, top, w2, h2, 260);
    } else if (i === 10) { // ৩ডি হেলে ওঠা
      run([{ transform: P + "rotateX(70deg) translateY(40px) scale(.9)", opacity: 0 }, { transform: P + "rotateX(-6deg) translateY(0) scale(1.02)", opacity: 1, offset: 0.7 }, { transform: P + "rotateX(0deg) scale(1)" }], 560);
    } else if (i === 11) { // স্কুইশ-স্ট্রেচ
      run([{ transform: "scale(.4,1.5)", opacity: 0 }, { transform: "scale(1.2,.85)", opacity: 1, offset: 0.4 }, { transform: "scale(.95,1.06)", offset: 0.65 }, { transform: "scale(1.02,.99)", offset: 0.85 }, { transform: "scale(1,1)" }], 620, "ease-out");
    } else if (i >= 12) { playFx2(i, run, el, r, s, w2, h2, left, top, cx, cy);
    } else { // ০: ক্লাসিক (আগেরটাই)
      const gh = document.createElement("div"); gh.className = "gh";
      gh.style.cssText = "left:" + r.x + "px;top:" + r.y + "px;width:" + r.w + "px;height:" + r.h + "px;border-color:" + (cfg.zbColor || "#e11d1d") + ";";
      root.appendChild(gh);
      const ga = gh.animate([{ transform: "translate(0,0) scale(1,1)", opacity: 0.95 }, { transform: "translate(" + (left + w2 / 2 - cx) + "px," + (top + h2 / 2 - cy) + "px) scale(" + (w2 / r.w * 1.06) + "," + (h2 / r.h * 1.06) + ")", opacity: 0 }], { duration: 480, easing: "cubic-bezier(.15,.8,.25,1)" });
      ga.onfinish = () => gh.remove();
      el.animate([{ transform: "scale(" + (1 / s) + ")", opacity: 0.2 }, { transform: "scale(1.035)", opacity: 1, offset: 0.72 }, { transform: "scale(1)", opacity: 1 }], { duration: 340, easing: "cubic-bezier(.2,.9,.3,1)" });
    }
  }


  // ---------- নতুন ২০টি ইফেক্ট (১২–৩১) ----------
  function playFx2(i, run, el, r, s, w2, h2, left, top, cx, cy) {
    const P = "perspective(900px) ", dx = cx - (left + w2 / 2), dy = cy - (top + h2 / 2);
    const SL = Math.min(W * 0.4, 420), ST = Math.min(H * 0.4, 300);
    const full = "inset(0 0 0 0 round 14px)";
    const S = (ms, fr, ease, org) => { if (org) fr.forEach((f) => { f.transformOrigin = org; }); return run(fr, ms, ease); };
    if (i === 12) { // ধীরে ধীরে জুম: নির্বাচিত জায়গা থেকে আস্তে আস্তে বড় হয়
      S(950, [{ transform: "translate(" + dx + "px," + dy + "px) scale(" + (1 / s) + ")", opacity: 0.35 }, { transform: "translate(0,0) scale(1)", opacity: 1 }], "cubic-bezier(.45,.05,.25,1)");
    } else if (i === 13) { // বাম দিক থেকে
      S(620, [{ transform: "translateX(" + (-SL) + "px) scale(.55)", opacity: 0 }, { transform: "translateX(10px) scale(1.03)", opacity: 1, offset: 0.78 }, { transform: "translateX(0) scale(1)", opacity: 1 }]);
    } else if (i === 14) { // ডান দিক থেকে
      S(620, [{ transform: "translateX(" + SL + "px) scale(.55)", opacity: 0 }, { transform: "translateX(-10px) scale(1.03)", opacity: 1, offset: 0.78 }, { transform: "translateX(0) scale(1)", opacity: 1 }]);
    } else if (i === 15) { // উপর থেকে
      S(620, [{ transform: "translateY(" + (-ST) + "px) scale(.55)", opacity: 0 }, { transform: "translateY(8px) scale(1.03)", opacity: 1, offset: 0.78 }, { transform: "translateY(0) scale(1)", opacity: 1 }]);
    } else if (i === 16) { // নিচ থেকে ধীরে
      S(900, [{ transform: "translateY(" + ST + "px) scale(.6)", opacity: 0 }, { transform: "translateY(0) scale(1)", opacity: 1 }], "cubic-bezier(.35,.1,.2,1)");
    } else if (i === 17) { // ঘুরে ঘুরে জুম
      S(720, [{ transform: "rotate(-200deg) scale(.08)", opacity: 0 }, { transform: "rotate(10deg) scale(1.06)", opacity: 1, offset: 0.78 }, { transform: "rotate(0deg) scale(1)", opacity: 1 }]);
    } else if (i === 18) { // বাম থেকে পর্দা সরা
      S(620, [{ clipPath: "inset(0 100% 0 0 round 14px)" }, { clipPath: full }], "cubic-bezier(.6,0,.2,1)");
    } else if (i === 19) { // ডান থেকে পর্দা সরা
      S(620, [{ clipPath: "inset(0 0 0 100% round 14px)" }, { clipPath: full }], "cubic-bezier(.6,0,.2,1)");
    } else if (i === 20) { // উপর থেকে পর্দা নামা
      S(620, [{ clipPath: "inset(0 0 100% 0 round 14px)" }, { clipPath: full }], "cubic-bezier(.6,0,.2,1)");
    } else if (i === 21) { // কোণ থেকে বড় হওয়া
      S(700, [{ clipPath: "inset(0 100% 100% 0 round 14px)", transform: "scale(.9)" }, { clipPath: full, transform: "scale(1)" }], "cubic-bezier(.3,.7,.2,1)");
    } else if (i === 22) { // হীরার মতো খোলা
      S(700, [{ clipPath: "polygon(50% 50%,50% 50%,50% 50%,50% 50%)", transform: "scale(.92)" }, { clipPath: "polygon(50% -25%,125% 50%,50% 125%,-25% 50%)", transform: "scale(1)" }], "cubic-bezier(.3,.7,.2,1)");
    } else if (i === 23) { // ধীরে ফুটে ওঠা
      S(900, [{ opacity: 0, transform: "scale(.97)" }, { opacity: 1, transform: "scale(1)" }], "ease-in-out");
    } else if (i === 24) { // স্পন্দন
      S(760, [{ transform: "scale(.5)", opacity: 0 }, { transform: "scale(1.12)", opacity: 1, offset: 0.3 }, { transform: "scale(.96)", offset: 0.5 }, { transform: "scale(1.06)", offset: 0.7 }, { transform: "scale(.99)", offset: 0.86 }, { transform: "scale(1)" }], "ease-out");
    } else if (i === 25) { // বাম থেকে বাউন্স
      S(760, [{ transform: "translateX(" + (-SL) + "px)", opacity: 0 }, { transform: "translateX(26px)", opacity: 1, offset: 0.55 }, { transform: "translateX(-12px)", offset: 0.75 }, { transform: "translateX(5px)", offset: 0.9 }, { transform: "translateX(0)" }], "ease-out");
    } else if (i === 26) { // ডান থেকে বাউন্স
      S(760, [{ transform: "translateX(" + SL + "px)", opacity: 0 }, { transform: "translateX(-26px)", opacity: 1, offset: 0.55 }, { transform: "translateX(12px)", offset: 0.75 }, { transform: "translateX(-5px)", offset: 0.9 }, { transform: "translateX(0)" }], "ease-out");
    } else if (i === 27) { // উপর থেকে ঝুলে পড়া
      S(720, [{ transform: P + "rotateX(-95deg)", opacity: 0 }, { transform: P + "rotateX(14deg)", opacity: 1, offset: 0.65 }, { transform: P + "rotateX(-6deg)", offset: 0.82 }, { transform: P + "rotateX(0deg)" }], "ease-out", "50% 0%");
    } else if (i === 28) { // ক্যামেরা ফোকাস
      S(900, [{ filter: "blur(16px)", transform: "scale(1.22)", opacity: 0.4 }, { filter: "blur(5px)", transform: "scale(1.08)", opacity: 1, offset: 0.5 }, { filter: "blur(0px)", transform: "scale(1)", opacity: 1 }], "ease-in-out");
    } else if (i === 29) { // ডান দিক থেকে ৩ডি ফ্লিপ
      S(600, [{ transform: P + "rotateY(90deg) scale(.8)", opacity: 0 }, { transform: P + "rotateY(-12deg) scale(1.04)", opacity: 1, offset: 0.7 }, { transform: P + "rotateY(0deg) scale(1)" }], null, "100% 50%");
    } else if (i === 30) { // হেলে এসে সোজা হওয়া
      S(620, [{ transform: "rotate(-9deg) scale(.6) translateY(40px)", opacity: 0 }, { transform: "rotate(3deg) scale(1.04)", opacity: 1, offset: 0.7 }, { transform: "rotate(0deg) scale(1)" }]);
    } else if (i === 31) { // ঢেউসহ ধীরে জুম
      S(950, [{ transform: "translate(" + dx + "px," + dy + "px) scale(" + (1 / s) + ")", opacity: 0.35 }, { transform: "translate(0,0) scale(1.03)", opacity: 1, offset: 0.78 }, { transform: "translate(0,0) scale(1)", opacity: 1 }], "cubic-bezier(.45,.05,.25,1)");
      ring(el, left, top, w2, h2, 520);
    }
  }

  // ---------- রঙের পর্দা (নতুন) ----------
  // ১) আগে অরিজিনাল ফুটেজ (কোনো রঙ/বর্ডার ছাড়া) জুম হয়ে বড় হয়।
  // ২) তারপর পেছনের রঙ বাম বা ডান থেকে পর্দার মতো এসে পুরো ভরে যায়। লেখা/ছবি নড়ে না, শুধু রঙ আসে।
  //    (রঙ + শার্প করা লেখা + বর্ডার একটা মাস্ক-স্তরে থাকে, মাস্কটা বাম/ডান থেকে খুলে যায়)
  function makeWipe() {
    const fromLeft = cfg.curtainDir === "fromLeft" ? true : cfg.curtainDir === "fromRight" ? false : Math.random() < 0.5;
    const f = cfg.curtainStyle === "hard" ? 0.02 : 0.4, M = 2 + f;
    const g = "linear-gradient(" + (fromLeft ? "90deg" : "270deg") + ",#000 0,#000 " + (100 / M).toFixed(2) + "%,transparent " + ((1 + f) / M * 100).toFixed(2) + "%,transparent 100%)";
    const p0 = fromLeft ? "100% 0" : "0% 0", p1 = fromLeft ? "0% 0" : "100% 0";
    const el = document.createElement("div"); el.className = "pc";
    const sz = (M * 100).toFixed(1) + "% 100%";
    el.style.cssText = "-webkit-mask-image:" + g + ";mask-image:" + g + ";-webkit-mask-size:" + sz + ";mask-size:" + sz + ";-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:" + p0 + ";mask-position:" + p0 + ";";
    return { el: el, p0: p0, p1: p1, fromLeft: fromLeft };
  }
  function runWipe(wp, zoomMs) {
    const gp = Number(cfg.wipeGap), u = Number(cfg.wipeSecs);
    const gap = Math.max(0, isNaN(gp) ? 0.15 : gp), dur = Math.max(0.2, isNaN(u) ? 0.8 : u);
    const delay = zoomMs / 1000 + gap; // জুম শেষ হওয়ার পর
    let fin = false;
    const finalize = () => {
      if (fin) return; fin = true;
      wp.el.style.cssText = "";                       // মাস্ক সরাও: ওপরের স্তর এখন পুরো অপাক
      if (wp.base && wp.base.parentNode) wp.base.remove(); // নিচের ঝাপসা অরিজিনাল স্তর মুছে দাও — আর দুই লেয়ার দেখা যাবে না
    };
    try {
      const an = wp.el.animate([{ maskPosition: wp.p0, webkitMaskPosition: wp.p0 }, { maskPosition: wp.p1, webkitMaskPosition: wp.p1 }], { duration: dur * 1000, delay: delay * 1000, easing: "cubic-bezier(.55,0,.25,1)", fill: "both" });
      an.onfinish = () => { finalize(); try { an.cancel(); } catch (_) {} };
    } catch (_) { finalize(); }
    setTimeout(finalize, (delay + dur) * 1000 + 250); // ফোনের WebView এ onfinish না এলেও যেন মুছে যায়
    curtainSound(delay, dur);
  }
  function popZoom(el, r, s, w2, h2, left, top, cx, cy, wp) {
    root.appendChild(el);
    playZoomSound();
    lastFx = pick(cfg.zoomFx, FX_N, lastFx);
    playFx(lastFx, el, r, s, w2, h2, left, top, cx, cy);
    if (wp) {
      let zms = 0; // জুম-পপ ইফেক্ট কতক্ষণ চলবে (ইফেক্টভেদে আলাদা)
      try { el.getAnimations().forEach((an) => { const e = an.effect && an.effect.getComputedTiming ? an.effect.getComputedTiming().endTime : 0; if (e > zms) zms = e; }); } catch (_) {}
      runWipe(wp, zms || 400);
    }
    const z = { el: el, t: 0 };
    const kill = () => {
      const i = zooms.indexOf(z); if (i >= 0) zooms.splice(i, 1);
      const an = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: "forwards" });
      an.onfinish = () => el.remove();
    };
    z.t = setTimeout(kill, Math.max(1, Number(cfg.zoomSecs) || 5) * 1000);
    zooms.push(z);
  }

  function style_(s) {
    s.color = cfg.color; s.lw = Number(cfg.width) || 5; s.fill = !!cfg.fill; s.arrowStyle = cfg.arrow;
    return s;
  }

  function finish() {
    const d = drawing; drawing = null;
    if (d) { clearTimeout(d.timer); d.prog && d.prog(); }
    setDrawAttr(false);
    if (!d || !d.active) return;
    if (d.pts.length > 1) suppressClickUntil = performance.now() + 400;
    if (cfg.mode !== "shape") {
      if (d.pts.length > 1) cur.strokes.push({ pts: d.pts, ts: d.ts });
      clearTimeout(cur.timer); cur.timer = setTimeout(flushWriting, WRITE_WAIT);
      loop(); return;
    }
    const s = SM.analyze(d.pts, { corners: "auto", pen: true, curved: true });
    if (s) { s.instant = false; style_(s); s.t0 = performance.now(); s.ms = (Number(cfg.secs) || 3) * 1000; if (s.type === "arrow" || s.type === "carrow") { s.anim = pickArrowAnim(); playArrowSound(s.anim); } shapes.push(s); }
    loop();
  }

  // কিবোর্ড: Esc = দাগ মুছো (main প্রসেস থেকে আসে); Alt+Shift+D / Alt+Shift+W main এ
  smchrome.overlay.onClear(() => {
    if (zooms.length) clearZooms();
    if (shapes.length || cur.strokes.length || groups.length) { shapes = []; clearTimeout(cur.timer); cur = { strokes: [], timer: 0 }; groups = []; loop(); }
  });

  // ---------- হাতের লেখা -> সুন্দর লেখা ----------
  function flushWriting() {
    const g = cur; cur = { strokes: [], timer: 0 };
    if (!g.strokes.length) return;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    g.strokes.forEach((s) => s.pts.forEach((p) => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }));
    g.box = [x0, y0, x1, y1]; g.color = cfg.color; g.lw = Number(cfg.width) || 5; g.ms = (Number(cfg.secs) || 3) * 1000;
    groups.push(g); loop();
    const ink = g.strokes.map((s) => [s.pts.map((p) => Math.round(p[0] - x0)), s.pts.map((p) => Math.round(p[1] - y0)), s.ts]);
    const lang = cfg.mode === "bn" ? "bn" : "en";
    const done = () => { groups = groups.filter((q) => q !== g); loop(); };
    try {
      smchrome.runtime.sendMessage({ type: "recognize", ink: ink, lang: lang, w: Math.max(40, Math.round(x1 - x0)), h: Math.max(40, Math.round(y1 - y0)) }, (res) => {
        void smchrome.runtime.lastError;
        done();
        if (!res || !res.text) { showToast("চিনতে পারিনি (ইন্টারনেট আছে তো?)"); return; }
        addText(res.text, g);
      });
    } catch (err) { done(); showToast("চিনতে পারিনি"); }
  }
  function addText(text, g) {
    const [x0, y0, x1, y1] = g.box, bw = Math.max(1, x1 - x0), bh = Math.max(1, y1 - y0);
    const font = (sz) => "600 " + sz + "px 'Noto Sans Bengali','Nirmala UI','Segoe UI',Arial,sans-serif";
    ctx.save(); ctx.font = font(100); const mw = ctx.measureText(text).width || 1; ctx.restore();
    let size = 100 * bw / mw;
    if (bh > 15) size = Math.min(size, bh * 1.35);
    size = Math.max(22, Math.min(170, size));
    shapes.push({ type: "text", text: text, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, size: size, font: font(size), color: g.color, lw: g.lw, fill: false, instant: false, t0: performance.now(), ms: g.ms + 1500 });
    loop();
  }

  // ---------- আঁকার কাজ ----------
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  function loop() { if (!raf) raf = requestAnimationFrame(tick); }
  function dashFor(p, L) { ctx.setLineDash(p < 1 ? [L * p, L * 2] : []); }

  // ---------- তীরের অ্যানিমেশন (২২ রকম) ----------
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  const easeElastic = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1);
  function rgba(c, a) {
    let h = /^#([0-9a-f]{6})$/i.exec(c);
    if (!h) { const m = /^#([0-9a-f]{3})$/i.exec(c); if (m) h = [0, m[1][0] + m[1][0] + m[1][1] + m[1][1] + m[1][2] + m[1][2]]; }
    if (!h) return c;
    const n = parseInt(h[1], 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }
  function star(x, y, R, r, rot) {
    ctx.beginPath();
    for (let k = 0; k < 8; k++) { const an = rot + k * Math.PI / 4, rr = k % 2 ? r : R, px = x + Math.cos(an) * rr, py = y + Math.sin(an) * rr; if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
    ctx.closePath(); ctx.fill();
  }
  // kind: 0 ঝপ+ঢেউ-রিং, 1 ধূমকেতু, 2 স্প্রিং ছুট, 3 জ্বলজ্বল পালস, 4 ঝিকিমিকি, 5 সাপের মতো
  function drawArrow(s, age) {
    const kind = s.anim || 0, dx = s.x2 - s.x1, dy = s.y2 - s.y1, len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len, nx = -uy, ny = ux, withHead = s.arrowStyle !== "line";
    const hl = withHead ? Math.min(Math.max(24, s.lw * 5), len * 0.6 + 1) : 0, hw = hl * 0.52;
    const TD = kind === 3 ? 420 : 600, popAt = TD * 0.8, pe = ease(clamp01(age / TD));
    const P = (f, off) => [s.x1 + ux * len * f + nx * (off || 0), s.y1 + uy * len * f + ny * (off || 0)];
    const ga = ctx.globalAlpha;
    let prog = pe, hs = 1, rot = 0, lw = s.lw, wavy = 0, riding = false, glow = 0, hm = 1;
    if (kind === 2) { prog = easeElastic(clamp01(age / 780)); lw = s.lw * (1 + 0.45 * (1 - clamp01(age / 400))); riding = true; }
    else if (kind === 3) {
      riding = true;
      if (age > TD) { const t2 = age - TD, dec = Math.max(0, 1 - t2 / 1500), pu = Math.sin(t2 / 110) * dec; glow = dec > 0 ? 8 + 26 * Math.abs(pu) : 0; lw = s.lw * (1 + 0.18 * pu); hm = 1 + 0.2 * pu; }
    } else hs = easeOutBack(clamp01((age - popAt) / 300));
    if (kind === 5) { rot = -Math.PI * 1.2 * (1 - clamp01((age - popAt) / 420)); wavy = Math.min(26, len * 0.12) * (1 - clamp01(age / (TD + 500))); }
    if (riding) hs = Math.min(1, prog * len / (hl * 1.2 + 1)) * hm;
    ctx.lineWidth = lw; ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (glow > 0) { ctx.shadowColor = s.color; ctx.shadowBlur = glow * dpr; }
    const shaftF = Math.max(0, prog - (hl * 0.7 * Math.min(1, hs)) / len);
    const wk = 2 * Math.PI * Math.max(1.5, len / 110);
    const wo = (f) => (wavy > 0.3 ? wavy * Math.sin(f * wk - age / 80) * Math.min(1, f * 4) : 0);

    // ডাঁটি
    if (wavy > 0.3) {
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) { const f = shaftF * i / 40, q = P(f, wo(f)); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }
      ctx.stroke();
    } else if (shaftF > 0.0005) {
      const e = P(shaftF);
      if (kind === 1) {
        const tail = 0.12 + 0.88 * clamp01((age - TD) / 350), gr = ctx.createLinearGradient(s.x1, s.y1, e[0], e[1]);
        gr.addColorStop(0, rgba(s.color, tail)); gr.addColorStop(1, rgba(s.color, 1)); ctx.strokeStyle = gr;
      }
      ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(e[0], e[1]); ctx.stroke();
      ctx.strokeStyle = s.color;
    }
    // মাথা
    if (withHead && hs > 0.01) {
      const tp = P(prog, wo(prog)), c = Math.cos(rot), sn = Math.sin(rot);
      const vx = ux * c - uy * sn, vy = ux * sn + uy * c, wx = -vy, wy = vx;
      ctx.fillStyle = s.color; ctx.beginPath(); ctx.moveTo(tp[0], tp[1]);
      ctx.lineTo(tp[0] - vx * hl * hs + wx * hw * hs, tp[1] - vy * hl * hs + wy * hw * hs);
      ctx.lineTo(tp[0] - vx * hl * hs - wx * hw * hs, tp[1] - vy * hl * hs - wy * hw * hs);
      ctx.closePath(); ctx.fill();
    }
    // বাড়তি ইফেক্ট
    if (kind === 0 && age > TD) {
      const u = clamp01((age - TD) / 480);
      if (u < 1) { const tp = P(1); ctx.save(); ctx.globalAlpha = ga * (1 - u); ctx.lineWidth = Math.max(1.5, s.lw * 0.5 * (1 - u)); ctx.shadowBlur = 0; ctx.beginPath(); ctx.arc(tp[0], tp[1], 6 + (hl + 20) * 0.9 * ease(u), 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
    }
    if (kind === 1 && age < TD + 300) {
      const tp = P(prog), fa = 1 - clamp01((age - TD) / 300);
      ctx.save(); ctx.globalAlpha = ga * fa; ctx.fillStyle = "#fff"; ctx.shadowColor = s.color; ctx.shadowBlur = 22 * dpr;
      ctx.beginPath(); ctx.arc(tp[0], tp[1], s.lw * 1.3 + 2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    if (kind === 4) {
      const fade = 1 - clamp01((age - TD - 500) / 500);
      if (fade > 0) {
        ctx.save(); ctx.globalAlpha = ga * fade; ctx.fillStyle = "#fff"; ctx.shadowColor = s.color; ctx.shadowBlur = 10 * dpr;
        for (let i = 0; i < 16; i++) {
          const f = (i + 0.5) / 16; if (f > prog) continue;
          const tw = Math.max(0, Math.sin(age / 110 + i * 1.9)), sz = s.lw * (0.5 + 1.1 * tw);
          if (sz < 0.8) continue;
          const q = P(f, Math.sin(i * 2.3 + age / 200) * s.lw * 2.4); star(q[0], q[1], sz * 2, sz * 0.6, age / 400 + i);
        }
        ctx.restore();
      }
      const u = clamp01((age - TD) / 450);
      if (age > TD && u < 1) {
        const tp = P(1); ctx.save(); ctx.globalAlpha = ga * (1 - u); ctx.lineWidth = Math.max(1.5, s.lw * 0.5); ctx.shadowBlur = 0;
        for (let k = 0; k < 8; k++) { const an = k * Math.PI / 4 + 0.3, r0 = hl * 0.5 + 8, r1 = r0 + (hl + 10) * ease(u); ctx.beginPath(); ctx.moveTo(tp[0] + Math.cos(an) * r0, tp[1] + Math.sin(an) * r0); ctx.lineTo(tp[0] + Math.cos(an) * r1, tp[1] + Math.sin(an) * r1); ctx.stroke(); }
        ctx.restore();
      }
    }
  }

  // ---------- বাঁকা/সোজা সব তীরের জন্য নতুন আঁকিয়ে (২২ রকম অ্যানিমেশন) ----------
  const ARROW_N = 22;
  function arrowPath(s) {
    if (s._p) return s._p;
    let r;
    if (s.type === "carrow") {
      r = SM.resample(s.pts, 64);
      for (let k = 0; k < 3; k++) {
        const q = [r[0]];
        for (let i = 1; i < r.length - 1; i++) q.push([(r[i - 1][0] + r[i][0] * 2 + r[i + 1][0]) / 4, (r[i - 1][1] + r[i][1] * 2 + r[i + 1][1]) / 4]);
        q.push(r[r.length - 1]); r = q;
      }
      r = SM.resample(r, 96);
    } else r = SM.resample([[s.x1, s.y1], [s.x2, s.y2]], 48);
    const cum = [0];
    for (let i = 1; i < r.length; i++) cum.push(cum[i - 1] + Math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1]));
    return (s._p = { pts: r, cum: cum, len: cum[cum.length - 1] || 1 });
  }
  function pAt(p, f) {
    const d = clamp01(f) * p.len; let i = 1;
    while (i < p.cum.length - 1 && p.cum[i] < d) i++;
    const a = p.pts[i - 1], b = p.pts[i], seg = p.cum[i] - p.cum[i - 1] || 1, t = clamp01((d - p.cum[i - 1]) / seg);
    const tx = b[0] - a[0], ty = b[1] - a[1], m = Math.hypot(tx, ty) || 1;
    return [a[0] + tx * t, a[1] + ty * t, tx / m, ty / m];
  }
  function pTrace(p, f0, f1, off) {
    const n = Math.max(2, Math.ceil(Math.abs(f1 - f0) * 90));
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const f = f0 + (f1 - f0) * i / n, q = pAt(p, f), o = off ? off(f) : 0, x = q[0] - q[3] * o, y = q[1] + q[2] * o;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
  }
  function hash01(i) { const x = Math.sin(i * 12.9898 + 4.1) * 43758.5453; return x - Math.floor(x); }
  // kind: 0 ঝপ+রিং 1 ধূমকেতু 2 স্প্রিং 3 পালস 4 তারা 5 সাপ | ৬ নিয়ন ৭ রংধনু ৮ ড্যাশ ৯ ডট ১০ বিদ্যুৎ ১১ ঢেউ ১২ উল্টো টান ১৩ দ্বিগুণ রেখা
  // ১৪ ধীরে আঁকা ১৫ হার্টবিট ১৬ ঝিলিক ১৭ লাফানো মাথা ১৮ ঘূর্ণি মাথা ১৯ স্ফুলিঙ্গ ২০ রাবার ব্যান্ড ২১ স্টপ-মোশন
  function drawPathArrow(s, age) {
    const kind = s.anim || 0, p = arrowPath(s), len = p.len, withHead = s.arrowStyle !== "line";
    const hl = withHead ? Math.min(Math.max(24, s.lw * 5), len * 0.5 + 1) : 0, hw = hl * 0.52;
    const ga = ctx.globalAlpha, col = s.color;
    let TD = 600, prog = 0, hs = 1, lw = s.lw, glow = 0, rot = 0, hm = 1, riding = false, off = null, headA = 1, tipPush = 0, dash = null, dashOff = 0;
    const u = clamp01(age / TD), pop = (t0) => easeOutBack(clamp01((age - t0) / 300));
    if (kind === 3) TD = 420; else if (kind === 6) TD = 650; else if (kind === 7) TD = 800; else if (kind === 8) TD = 700; else if (kind === 9) TD = 700;
    else if (kind === 10) TD = 450; else if (kind === 13) TD = 650; else if (kind === 14) TD = 1100; else if (kind === 15) TD = 500; else if (kind === 18) TD = 700;
    else if (kind === 19) TD = 550; else if (kind === 21) TD = 800;
    const uu = clamp01(age / TD), pe = ease(uu), popAt = TD * 0.8;
    prog = pe; hs = pop(popAt);
    if (kind === 2) { prog = Math.min(1, easeElastic(clamp01(age / 780))); lw = s.lw * (1 + 0.45 * (1 - clamp01(age / 400))); riding = true; }
    else if (kind === 3) {
      riding = true;
      if (age > TD) { const t2 = age - TD, dec = Math.max(0, 1 - t2 / 1500), pu = Math.sin(t2 / 110) * dec; glow = dec > 0 ? 8 + 26 * Math.abs(pu) : 0; lw = s.lw * (1 + 0.18 * pu); hm = 1 + 0.2 * pu; }
    } else if (kind === 5) {
      rot = -Math.PI * 1.2 * (1 - clamp01((age - popAt) / 420));
      const am = Math.min(26, len * 0.12) * (1 - clamp01(age / (TD + 500))), wk = 2 * Math.PI * Math.max(1.5, len / 110);
      if (am > 0.3) off = (f) => am * Math.sin(f * wk - age / 80) * Math.min(1, f * 4);
    } else if (kind === 6) { glow = 14 + 10 * Math.sin(age / 160); }
    else if (kind === 8) { dash = [s.lw * 2.2, s.lw * 2]; dashOff = -age / 22; }
    else if (kind === 10) {
      const dec = 1 - clamp01((age - TD * 0.6) / 600), amp = (Math.min(14, len * 0.06) + s.lw) * dec, fl = Math.floor(age / 45);
      if (amp > 0.4) off = (f) => amp * Math.sin(f * 61 + fl * 7.3) * Math.sin(f * 23 + fl * 3.1); glow = 12 * dec;
    } else if (kind === 13) { const g = s.lw * 2.6 * (1 - ease(clamp01((age - TD * 0.7) / 500))) + 0.001; lw = s.lw * 0.72; s._g = g; }
    else if (kind === 14) { prog = ease(clamp01(age / TD)); headA = clamp01((age - TD * 0.85) / 300); hs = headA; }
    else if (kind === 15 && age > TD) { const t2 = age - TD, b = t2 < 900 ? Math.max(0, Math.sin(t2 / 90)) * (1 - t2 / 900) : 0; lw = s.lw * (1 + 0.7 * b); hm = 1 + 0.35 * b; glow = 16 * b; }
    else if (kind === 17 && age > TD) { const t2 = age - TD, dec = 1 - clamp01(t2 / 1100); tipPush = Math.sin(t2 / 90) * dec * hl * 0.4; }
    else if (kind === 18) { rot = (1 - uu) * Math.PI * 4; riding = true; }
    else if (kind === 20) {
      const e = easeElastic(clamp01(age / 900)); prog = Math.min(1, e); tipPush = Math.max(0, e - 1) * len * 0.18;
      lw = s.lw * (1 + 0.4 * (1 - clamp01(age / 450)));
      const am = Math.min(14, len * 0.05) * (1 - clamp01(age / 1000)); if (am > 0.3) off = (f) => am * Math.sin(f * 10 - age / 70) * Math.min(1, f * 4);
    } else if (kind === 21) { prog = Math.ceil(uu * 8) / 8; const ph = (uu * 8) % 1; lw = s.lw * (1 + 0.3 * (1 - ph)); hs = pop(TD); }
    if (kind === 12) { prog = 1; }
    if (riding) hs = Math.min(1, prog * len / (hl * 1.2 + 1)) * hm; else if (kind === 15 || kind === 14) { /* keep */ } else hs = hs * hm;
    if (kind === 12) hs = easeOutBack(clamp01(age / 260));
    hs = Math.max(0, hs);

    ctx.lineWidth = lw; ctx.lineCap = "round"; ctx.lineJoin = "round";
    const endF = Math.max(0, prog - (hl * 0.7 * Math.min(1, hs)) / len);
    const startF = kind === 12 ? 1 - ease(clamp01((age - 150) / 550)) : 0;
    const shaftEnd = kind === 12 ? Math.max(startF, 1 - (hl * 0.7) / len) : endF;

    // ---------- ডাঁটি ----------
    if (shaftEnd > startF + 0.0005) {
      ctx.save();
      if (dash) { ctx.setLineDash(dash); ctx.lineDashOffset = dashOff; }
      if (kind === 6) {
        ctx.shadowColor = col; ctx.shadowBlur = glow * dpr; ctx.strokeStyle = col; ctx.lineWidth = lw * 1.5; ctx.globalAlpha = ga * 0.55; pTrace(p, startF, shaftEnd, off); ctx.stroke();
        ctx.globalAlpha = ga; ctx.lineWidth = lw * 0.55; ctx.strokeStyle = "#fff"; ctx.shadowBlur = 6 * dpr; pTrace(p, startF, shaftEnd, off); ctx.stroke();
      } else if (kind === 7) {
        const n = 44;
        for (let i = 0; i < n; i++) {
          const f0 = shaftEnd * i / n, f1 = shaftEnd * (i + 1) / n + 0.004;
          ctx.strokeStyle = "hsl(" + ((i / n * 300 + age / 8) % 360) + ",95%,58%)"; pTrace(p, f0, Math.min(1, f1)); ctx.stroke();
        }
      } else if (kind === 9) {
        const nd = Math.max(4, Math.floor(len / Math.max(8, s.lw * 3.2))); ctx.fillStyle = col;
        for (let i = 0; i <= nd; i++) {
          const f = i / nd; if (f > shaftEnd + 0.001) break;
          const sc = easeOutBack(clamp01((age - (i / nd) * TD * 0.85) / 160)), q = pAt(p, f);
          if (sc > 0.02) { ctx.beginPath(); ctx.arc(q[0], q[1], s.lw * 0.95 * sc, 0, Math.PI * 2); ctx.fill(); }
        }
      } else if (kind === 13) {
        const g = s._g || 0; ctx.strokeStyle = col;
        pTrace(p, 0, shaftEnd, (f) => g + (off ? off(f) : 0)); ctx.stroke();
        pTrace(p, 0, shaftEnd, (f) => -g + (off ? off(f) : 0)); ctx.stroke();
      } else {
        if (glow > 0) { ctx.shadowColor = col; ctx.shadowBlur = glow * dpr; }
        if (kind === 1) {
          const tipQ = pAt(p, shaftEnd), tail = 0.12 + 0.88 * clamp01((age - TD) / 350), gr = ctx.createLinearGradient(p.pts[0][0], p.pts[0][1], tipQ[0], tipQ[1]);
          gr.addColorStop(0, rgba(col, tail)); gr.addColorStop(1, rgba(col, 1)); ctx.strokeStyle = gr;
        } else ctx.strokeStyle = col;
        if (kind === 14) ctx.globalAlpha = ga * 0.96;
        pTrace(p, startF, shaftEnd, off); ctx.stroke();
      }
      ctx.restore();
    }
    // ---------- মাথা ----------
    if (withHead && hs > 0.01 && headA > 0.01) {
      const tipF = kind === 12 ? 1 : prog, tq = pAt(p, tipF), bq = pAt(p, Math.max(0, tipF - hl / len));
      let vx = tq[0] - bq[0], vy = tq[1] - bq[1]; const vm = Math.hypot(vx, vy);
      if (vm < 0.001) { vx = tq[2]; vy = tq[3]; } else { vx /= vm; vy /= vm; }
      const c = Math.cos(rot), sn = Math.sin(rot), ax = vx * c - vy * sn, ay = vx * sn + vy * c, wx = -ay, wy = ax;
      const tx = tq[0] + vx * tipPush, ty = tq[1] + vy * tipPush;
      ctx.save();
      if (glow > 0 || kind === 6) { ctx.shadowColor = col; ctx.shadowBlur = (kind === 6 ? 16 : glow) * dpr; }
      ctx.globalAlpha = ga * headA;
      ctx.fillStyle = kind === 7 ? "hsl(" + ((300 + age / 8) % 360) + ",95%,58%)" : col;
      ctx.beginPath(); ctx.moveTo(tx, ty);
      ctx.lineTo(tx - ax * hl * hs + wx * hw * hs, ty - ay * hl * hs + wy * hw * hs);
      ctx.lineTo(tx - ax * hl * hs - wx * hw * hs, ty - ay * hl * hs - wy * hw * hs);
      ctx.closePath(); ctx.fill(); ctx.restore();
    }
    // ---------- বাড়তি ইফেক্ট ----------
    const tipP = pAt(p, 1);
    if (kind === 0 && age > TD) {
      const t = clamp01((age - TD) / 480);
      if (t < 1) { ctx.save(); ctx.globalAlpha = ga * (1 - t); ctx.lineWidth = Math.max(1.5, s.lw * 0.5 * (1 - t)); ctx.shadowBlur = 0; ctx.beginPath(); ctx.arc(tipP[0], tipP[1], 6 + (hl + 20) * 0.9 * ease(t), 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
    }
    if (kind === 1 && age < TD + 300) {
      const tq = pAt(p, prog), fa = 1 - clamp01((age - TD) / 300);
      ctx.save(); ctx.globalAlpha = ga * fa; ctx.fillStyle = "#fff"; ctx.shadowColor = col; ctx.shadowBlur = 22 * dpr;
      ctx.beginPath(); ctx.arc(tq[0], tq[1], s.lw * 1.3 + 2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    if (kind === 4) {
      const fade = 1 - clamp01((age - TD - 500) / 500);
      if (fade > 0) {
        ctx.save(); ctx.globalAlpha = ga * fade; ctx.fillStyle = "#fff"; ctx.shadowColor = col; ctx.shadowBlur = 10 * dpr;
        for (let i = 0; i < 16; i++) {
          const f = (i + 0.5) / 16; if (f > prog) continue;
          const tw = Math.max(0, Math.sin(age / 110 + i * 1.9)), sz = s.lw * (0.5 + 1.1 * tw); if (sz < 0.8) continue;
          const q = pAt(p, f), o = Math.sin(i * 2.3 + age / 200) * s.lw * 2.4; star(q[0] - q[3] * o, q[1] + q[2] * o, sz * 2, sz * 0.6, age / 400 + i);
        }
        ctx.restore();
      }
      const t = clamp01((age - TD) / 450);
      if (age > TD && t < 1) {
        ctx.save(); ctx.globalAlpha = ga * (1 - t); ctx.lineWidth = Math.max(1.5, s.lw * 0.5); ctx.shadowBlur = 0;
        for (let k = 0; k < 8; k++) { const an = k * Math.PI / 4 + 0.3, r0 = hl * 0.5 + 8, r1 = r0 + (hl + 10) * ease(t); ctx.beginPath(); ctx.moveTo(tipP[0] + Math.cos(an) * r0, tipP[1] + Math.sin(an) * r0); ctx.lineTo(tipP[0] + Math.cos(an) * r1, tipP[1] + Math.sin(an) * r1); ctx.stroke(); }
        ctx.restore();
      }
    }
    if (kind === 11 && age > TD) {
      for (let k = 0; k < 3; k++) {
        const t = (age - TD - k * 260) / 800; if (t <= 0 || t >= 1) continue;
        ctx.save(); ctx.globalAlpha = ga * (1 - t); ctx.lineWidth = Math.max(1.5, s.lw * 0.6 * (1 - t)); ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.arc(tipP[0], tipP[1], 8 + (hl + 26) * ease(t), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
    }
    if (kind === 16 && age > TD && age < TD + 2100) {
      const fs = ((age - TD) / 700) % 1.5 - 0.25, a0 = Math.max(0, fs - 0.14), a1 = Math.min(endF, fs);
      if (a1 > a0 + 0.001) { ctx.save(); ctx.strokeStyle = "#fff"; ctx.globalAlpha = ga * 0.9; ctx.lineWidth = Math.max(2, s.lw * 0.6); ctx.shadowColor = "#fff"; ctx.shadowBlur = 12 * dpr; pTrace(p, a0, a1); ctx.stroke(); ctx.restore(); }
    }
    if (kind === 19 && age < TD + 700) {
      ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 8 * dpr;
      for (let i = 0; i < 16; i++) {
        const born = i * 36, t = (age - born) / 520; if (t <= 0 || t >= 1 || born > TD + 40) continue;
        const bq = pAt(p, ease(clamp01(born / TD))), an = hash01(i) * Math.PI * 2, sp = 40 + hash01(i + 9) * 90;
        const x = bq[0] + Math.cos(an) * sp * t, y = bq[1] + Math.sin(an) * sp * t + 30 * t * t;
        ctx.globalAlpha = ga * (1 - t); ctx.fillStyle = i % 2 ? "#fff" : col; ctx.beginPath(); ctx.arc(x, y, Math.max(0.8, s.lw * 0.5 * (1 - t) + 1), 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawShape(s, now) {
    const live = !!s.live, age = live ? 0 : now - s.t0;
    const alpha = !live && age > s.ms ? Math.max(0, 1 - (age - s.ms) / FADE) : 1;
    if (alpha <= 0) return false;
    const p = live || s.instant ? 1 : ease(Math.min(1, age / 220));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = s.lw;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = 6 * dpr;
    if (s.type === "ellipse") {
      const a = Math.max(0.5, s.rx), b = Math.max(0.5, s.ry), L = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
      ctx.beginPath(); ctx.ellipse(s.cx, s.cy, a, b, 0, -Math.PI / 2, Math.PI * 1.5);
      if (s.fill) { ctx.save(); ctx.globalAlpha = alpha * 0.14 * p; ctx.shadowBlur = 0; ctx.fill(); ctx.restore(); }
      dashFor(p, L); ctx.stroke();
    } else if (s.type === "rect") {
      const r = Math.min(s.r, s.w / 2, s.h / 2), x = s.x, y = s.y, w = s.w, h = s.h;
      ctx.beginPath(); ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
      if (s.fill) { ctx.save(); ctx.globalAlpha = alpha * 0.14 * p; ctx.shadowBlur = 0; ctx.fill(); ctx.restore(); }
      dashFor(p, 2 * (w + h)); ctx.stroke();
    } else if (s.type === "arrow" || s.type === "carrow") {
      if (s.type === "carrow" || (s.anim || 0) >= 6) drawPathArrow(s, age); else drawArrow(s, age);
    } else if (s.type === "text") {
      ctx.globalAlpha = alpha * Math.min(1, age / 160);
      ctx.font = s.font; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineWidth = Math.max(3, s.size / 10); ctx.strokeStyle = "rgba(0,0,0,.45)"; ctx.shadowBlur = 0;
      ctx.strokeText(s.text, s.cx, s.cy); ctx.fillText(s.text, s.cx, s.cy);
    } else if (s.type === "pen") {
      const q = s.pts; ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]);
      if (q.length === 1) ctx.lineTo(q[0][0] + 0.1, q[0][1]);
      for (let i = 1; i < q.length - 1; i++) ctx.quadraticCurveTo(q[i][0], q[i][1], (q[i][0] + q[i + 1][0]) / 2, (q[i][1] + q[i + 1][1]) / 2);
      if (q.length > 1) ctx.lineTo(q[q.length - 1][0], q[q.length - 1][1]);
      ctx.stroke();
    }
    ctx.restore();
    return true;
  }

  function tick() {
    raf = 0;
    const now = performance.now();
    ctx.clearRect(0, 0, W, H);
    shapes = shapes.filter((s) => drawShape(s, now));
    const inkOf = (pts, col, lw) => { ctx.save(); ctx.strokeStyle = col; ctx.globalAlpha = 0.6; ctx.lineWidth = Math.max(2, lw * 0.6); ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.stroke(); ctx.restore(); };
    cur.strokes.forEach((s) => inkOf(s.pts, cfg.color, Number(cfg.width) || 5));
    groups.forEach((g) => g.strokes.forEach((s) => inkOf(s.pts, g.color, g.lw)));
    if (drawing && drawing.active && drawing.pts.length > 1) {
      ctx.save(); ctx.strokeStyle = cfg.color; ctx.globalAlpha = 0.55; ctx.lineWidth = Math.max(2, (Number(cfg.width) || 5) * 0.6);
      ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.beginPath();
      drawing.pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
      ctx.stroke(); ctx.restore();
    }
    if (drawing || shapes.length || cur.strokes.length || groups.length || (zdrag && zdrag.active)) loop();
  }

  // ---------- main প্রসেস থেকে আসা গ্লোবাল মাউস ইভেন্ট ----------
  // m = { type: down|move|up, button: 0 বাম / 2 ডান, x, y (এই মনিটরের ভেতরে), buttons: বিটমাস্ক (১ বাম, ২ ডান), ctrlKey }
  smchrome.overlay.onMouse((m) => {
    const e = { button: m.button, clientX: m.x, clientY: m.y, buttons: m.buttons, ctrlKey: !!m.ctrlKey, target: null, preventDefault() {}, stopPropagation() {} };
    if (m.type === "down") { downL(e); downR(e); }
    else if (m.type === "move") { moveL(e); moveR(e); }
    else if (m.type === "up") { upL(e); upR(e); }
  });

  mount(); resize();
})();
