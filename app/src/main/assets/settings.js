// ShowMark Desktop সেটিং উইন্ডো (সেটিং main প্রসেসে সংরক্ষিত হয়)
const $ = (id) => document.getElementById(id);
const DEF = { tool: "none", lastTool: "auto", color: "#ff2d2d", width: 5, secs: 3, arrow: "arrow", fill: false, mode: "shape", hold: 350, zoomOn: true, zoom: 3, zoomSecs: 5, zoomColor: "#e6ff00", soundOn: true, vol: 0.5, zoomOrig: false, zoomSound: "random", arrowAnim: "random", zoomFx: "random", zbColor: "#e11d1d", zbWidth: 4, curtainOn: false, curtainDir: "random", curtainStyle: "soft", curtainSnd: "match", wipeGap: 0.15, wipeSecs: 0.8, dotOn: true, dotSize: 14, dotBlur: 1, dotOpacity: 0.8, dotShape: "dot", dotColor: "#e6ff00", dotAfter: 50, zoomOff: 110, aimMs: 300, customSounds: [] };
const COLORS = ["#ff2d2d", "#1e6bff", "#17c964", "#ffd400", "#ff8a00", "#ff3dbb", "#ffffff", "#111111"];
let cfg = Object.assign({}, DEF);

function save(k, v) { cfg[k] = v; smchrome.storage.local.set({ [k]: v }); }

function power() {
  const b = $("power"), on = cfg.tool !== "none";
  b.className = on ? "on" : ""; b.textContent = on ? "✨ চালু আছে (বাম বাটন ধরে রেখে আঁকো) — বন্ধ করতে চাপো" : "বন্ধ আছে — চালু করতে চাপো";
  b.onclick = () => { const t = on ? "none" : "auto"; cfg.tool = t; smchrome.storage.local.set({ tool: t, lastTool: "auto" }); power(); };
}

const MODES = [["shape", "✨<br>আকৃতি"], ["en", "A<br>ইংরেজি/সংখ্যা/গণিত"], ["bn", "অ<br>বাংলা"]];
function modes() {
  const box = $("modes"); box.innerHTML = "";
  MODES.forEach((m) => {
    const b = document.createElement("button"); b.innerHTML = m[1];
    if (cfg.mode === m[0]) b.className = "on";
    b.onclick = () => { cfg.mode = m[0]; const o = { mode: m[0] }; if (cfg.tool === "none") { o.tool = "auto"; cfg.tool = "auto"; power(); } smchrome.storage.local.set(o); modes(); };
    box.appendChild(b);
  });
}

function preview() {
  const c = $("pv"), x = c.getContext("2d");
  x.clearRect(0, 0, c.width, c.height);
  x.strokeStyle = x.fillStyle = cfg.color; x.lineWidth = Number(cfg.width); x.lineCap = "round"; x.lineJoin = "round";
  x.beginPath(); x.moveTo(14, 23); x.lineTo(100, 23); x.stroke();
  const hl = Math.max(16, cfg.width * 4);
  x.beginPath(); x.moveTo(125, 23); x.lineTo(125 - hl, 23 - hl * 0.52); x.lineTo(125 - hl, 23 + hl * 0.52); x.closePath(); x.fill();
  x.beginPath(); x.ellipse(175, 23, 22, 15, 0, 0, Math.PI * 2); x.stroke();
  x.beginPath(); x.rect(215, 9, 60, 28); x.stroke();
}

function colors() {
  const box = $("sw"); box.innerHTML = "";
  COLORS.forEach((c) => {
    const i = document.createElement("i"); i.style.background = c;
    if (c.toLowerCase() === String(cfg.color).toLowerCase()) i.className = "sel";
    i.onclick = () => { save("color", c); colors(); preview(); };
    box.appendChild(i);
  });
  const inp = document.createElement("input"); inp.type = "color"; inp.value = cfg.color; inp.title = "নিজের পছন্দের রঙ";
  inp.oninput = () => { save("color", inp.value); preview(); };
  box.appendChild(inp);
}


const ZB_COLORS = ["#e11d1d", "#ff2d2d", "#1e6bff", "#17c964", "#ffd400", "#ff8a00", "#ff3dbb", "#ffffff", "#111111"];
function zbPrev() { const b = $("zbBox"); if (b) b.style.border = Number(cfg.zbWidth) > 0 ? (cfg.zbWidth + "px solid " + cfg.zbColor) : "none"; }
function zbColors() {
  const box = $("zbSw"); box.innerHTML = "";
  ZB_COLORS.forEach((c) => {
    const i = document.createElement("i"); i.style.background = c;
    if (c.toLowerCase() === String(cfg.zbColor).toLowerCase()) i.className = "sel";
    i.onclick = () => { save("zbColor", c); zbColors(); zbPrev(); };
    box.appendChild(i);
  });
  const inp = document.createElement("input"); inp.type = "color"; inp.value = cfg.zbColor; inp.title = "নিজের পছন্দের রঙ";
  inp.oninput = () => { save("zbColor", inp.value); zbPrev(); };
  box.appendChild(inp);
}

smchrome.storage.local.get(DEF, (r) => {
  cfg = Object.assign({}, DEF, r);
  renderSounds();
  $("zoomOn").checked = !!cfg.zoomOn; $("zoom").value = cfg.zoom; $("zV").textContent = cfg.zoom; $("zoomSecs").value = cfg.zoomSecs; $("zsV").textContent = cfg.zoomSecs; $("zoomColor").value = cfg.zoomColor; $("soundOn").checked = !!cfg.soundOn; $("zoomOrig").checked = !!cfg.zoomOrig; $("zoomColor").disabled = !!cfg.zoomOrig; $("vol").value = cfg.vol; $("vV").textContent = cfg.vol;
  $("hold").value = cfg.hold / 1000; $("hV").textContent = cfg.hold / 1000;
  $("arrow").value = cfg.arrow; $("zoomSound").value = String(cfg.zoomSound); $("arrowAnim").value = String(cfg.arrowAnim); $("zoomFx").value = String(cfg.zoomFx);
  $("dotOn").checked = cfg.dotOn !== false; $("dotSize").value = cfg.dotSize; $("dszV").textContent = cfg.dotSize; $("dotBlur").value = cfg.dotBlur; $("dblV").textContent = cfg.dotBlur;
  $("dotOpacity").value = cfg.dotOpacity; $("dopV").textContent = cfg.dotOpacity; $("dotShape").value = cfg.dotShape; $("dotColor").value = cfg.dotColor; $("dotAfter").value = cfg.dotAfter; $("dafV").textContent = cfg.dotAfter; $("aimMs").value = cfg.aimMs; $("amV").textContent = cfg.aimMs; $("zoomOff").value = cfg.zoomOff; $("zoV").textContent = cfg.zoomOff; dotPrev();
  $("width").value = cfg.width; $("wV").textContent = cfg.width;
  $("secs").value = cfg.secs; $("sV").textContent = cfg.secs;
  $("fill").checked = !!cfg.fill;
  $("zbWidth").value = cfg.zbWidth; $("zbV").textContent = cfg.zbWidth;
  $("curtainOn").checked = !!cfg.curtainOn; $("curtainDir").value = ["fromLeft", "fromRight"].indexOf(cfg.curtainDir) >= 0 ? cfg.curtainDir : "random"; $("curtainStyle").value = cfg.curtainStyle === "hard" ? "hard" : "soft"; $("wipeGap").value = cfg.wipeGap; $("cdV").textContent = cfg.wipeGap; $("wipeSecs").value = cfg.wipeSecs; $("csV").textContent = cfg.wipeSecs;
  power(); modes(); colors(); preview(); zbColors(); zbPrev();
});
smchrome.storage.onChanged.addListener((ch) => { if (ch.mode) { cfg.mode = ch.mode.newValue; modes(); } if (ch.tool) { cfg.tool = ch.tool.newValue; power(); } if (ch.color) { cfg.color = ch.color.newValue; colors(); preview(); } if (ch.width) { cfg.width = ch.width.newValue; $("width").value = cfg.width; $("wV").textContent = cfg.width; preview(); } });
$("arrow").addEventListener("change", () => save("arrow", $("arrow").value));
$("width").addEventListener("input", () => { $("wV").textContent = $("width").value; save("width", Number($("width").value)); preview(); });
$("secs").addEventListener("input", () => { $("sV").textContent = $("secs").value; save("secs", Number($("secs").value)); });
$("fill").addEventListener("change", () => save("fill", $("fill").checked));
$("hold").addEventListener("input", () => { $("hV").textContent = $("hold").value; save("hold", Math.round(Number($("hold").value) * 1000)); });
$("zoomOn").addEventListener("change", () => save("zoomOn", $("zoomOn").checked));
$("zoom").addEventListener("input", () => { $("zV").textContent = $("zoom").value; save("zoom", Number($("zoom").value)); });
$("zoomSecs").addEventListener("input", () => { $("zsV").textContent = $("zoomSecs").value; save("zoomSecs", Number($("zoomSecs").value)); });
$("zoomColor").addEventListener("input", () => save("zoomColor", $("zoomColor").value));
$("soundOn").addEventListener("change", () => save("soundOn", $("soundOn").checked));
$("vol").addEventListener("input", () => { $("vV").textContent = $("vol").value; save("vol", Number($("vol").value)); });
$("zoomOrig").addEventListener("change", () => { $("zoomColor").disabled = $("zoomOrig").checked; save("zoomOrig", $("zoomOrig").checked); });
$("zoomSound").addEventListener("change", () => save("zoomSound", $("zoomSound").value));
$("arrowAnim").addEventListener("change", () => save("arrowAnim", $("arrowAnim").value));
$("zoomFx").addEventListener("change", () => save("zoomFx", $("zoomFx").value));

// ---------- সিলেক্ট-বিন্দুর সেটিং ----------
function dotPrev() {
  const box = $("dotPrev"), sz = Math.max(4, Math.min(60, Number(cfg.dotSize) || 14)), c = cfg.dotColor || "#e6ff00";
  const n = parseInt(c.slice(1), 16), rgb = ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255), ring = cfg.dotShape === "ring";
  box.style.opacity = cfg.dotOn === false ? 0.25 : 1;
  box.innerHTML = '<div style="position:absolute;left:50%;top:50%;width:' + sz + "px;height:" + sz + "px;margin:" + (-sz / 2) + "px 0 0 " + (-sz / 2) + "px;border-radius:50%;box-sizing:border-box;opacity:" + (Number(cfg.dotOpacity) || 0.8) +
    ";filter:blur(" + (Number(cfg.dotBlur) || 0) + "px);" + (ring ? "border:" + Math.max(1.5, sz / 7) + "px solid rgba(" + rgb + ",.95);" : "background:rgba(" + rgb + ",.95);") + "box-shadow:0 0 " + (3 + sz / 3) + "px rgba(" + rgb + ',.55)"></div>';
}
$("dotOn").addEventListener("change", () => { save("dotOn", $("dotOn").checked); dotPrev(); });
$("dotSize").addEventListener("input", () => { $("dszV").textContent = $("dotSize").value; save("dotSize", Number($("dotSize").value)); dotPrev(); });
$("dotBlur").addEventListener("input", () => { $("dblV").textContent = $("dotBlur").value; save("dotBlur", Number($("dotBlur").value)); dotPrev(); });
$("dotOpacity").addEventListener("input", () => { $("dopV").textContent = $("dotOpacity").value; save("dotOpacity", Number($("dotOpacity").value)); dotPrev(); });
$("dotShape").addEventListener("change", () => { save("dotShape", $("dotShape").value); dotPrev(); });
$("dotColor").addEventListener("input", () => { save("dotColor", $("dotColor").value); dotPrev(); });
$("aimMs").addEventListener("input", () => { $("amV").textContent = $("aimMs").value; save("aimMs", Number($("aimMs").value)); });
$("zoomOff").addEventListener("input", () => { $("zoV").textContent = $("zoomOff").value; save("zoomOff", Number($("zoomOff").value)); });
$("dotAfter").addEventListener("input", () => { $("dafV").textContent = $("dotAfter").value; save("dotAfter", Number($("dotAfter").value)); });
$("zbWidth").addEventListener("input", () => { $("zbV").textContent = $("zbWidth").value; save("zbWidth", Number($("zbWidth").value)); zbPrev(); });
$("curtainOn").addEventListener("change", () => save("curtainOn", $("curtainOn").checked));
$("curtainDir").addEventListener("change", () => save("curtainDir", $("curtainDir").value));
$("wipeGap").addEventListener("input", () => { $("cdV").textContent = $("wipeGap").value; save("wipeGap", Number($("wipeGap").value)); });
$("wipeSecs").addEventListener("input", () => { $("csV").textContent = $("wipeSecs").value; save("wipeSecs", Number($("wipeSecs").value)); });
$("curtainStyle").addEventListener("change", () => save("curtainStyle", $("curtainStyle").value));
$("curtainSnd").addEventListener("change", () => save("curtainSnd", $("curtainSnd").value));

// ---------- নিজের সাউন্ড (গ্যালারি/ফাইল থেকে যোগ; সবসময় সেভ থাকে) ----------
// customSounds = তালিকা (আইডি, নাম, সময়, সাইজ); smsnd_<আইডি> = ফাইলের ডেটা। প্লে করে ওভারলে/কনটেন্ট স্ক্রিপ্ট।
const MAXSND = 6 * 1024 * 1024, MAXCNT = 20, MAXTOTAL = 30 * 1024 * 1024;
const IS_EXT = typeof chrome !== "undefined" && !!(chrome.runtime && chrome.runtime.id) && typeof smchrome === "undefined";
const IN_TAB = location.search.indexOf("tab=1") >= 0;
let sndCtx = null, sndSrc = null;
function mySounds() { return Array.isArray(cfg.customSounds) ? cfg.customSounds : []; }
function sndMsg(t, bad) { const m = $("sndMsg"); if (m) { m.textContent = t; m.style.color = bad ? "#ff8a8a" : "#9fe3b0"; } }
function dataToBuf(u) { const bin = atob(u.slice(u.indexOf(",") + 1)), b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b.buffer; }
function readFile(f) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(f); }); }

function renderSounds() {
  const list = mySounds();
  [["zoomSound", "random"], ["curtainSnd", "match"]].forEach((p) => {
    const s = $(p[0]), old = s.querySelector("optgroup"); if (old) old.remove();
    if (list.length) {
      const g = document.createElement("optgroup"); g.label = "🎵 আমার যোগ করা সাউন্ড";
      list.forEach((x) => { const o = document.createElement("option"); o.value = "c:" + x.id; o.textContent = x.name; g.appendChild(o); });
      s.appendChild(g);
    }
    s.value = String(cfg[p[0]]);
    if (s.value !== String(cfg[p[0]])) { s.value = p[1]; save(p[0], p[1]); } // মুছে ফেলা সাউন্ড বাছা থাকলে ডিফল্টে ফিরবে
  });
  const box = $("mySnd"); box.innerHTML = "";
  if (!list.length) { const e = document.createElement("div"); e.className = "small"; e.textContent = "এখনো কোনো সাউন্ড যোগ করা হয়নি।"; box.appendChild(e); return; }
  list.forEach((x) => {
    const row = document.createElement("div"); row.className = "snd";
    const nm = document.createElement("span"); nm.textContent = x.name + (x.dur ? " (" + x.dur + " সে.)" : ""); nm.title = x.name;
    const pl = document.createElement("i"); pl.textContent = "▶"; pl.title = "শুনে দেখো"; pl.onclick = () => playMy(x.id);
    const dl = document.createElement("i"); dl.textContent = "🗑"; dl.title = "মুছে ফেলো"; dl.onclick = () => delMy(x.id);
    row.appendChild(nm); row.appendChild(pl); row.appendChild(dl); box.appendChild(row);
  });
}

function playMy(id) {
  const k = "smsnd_" + id, q = {}; q[k] = "";
  smchrome.storage.local.get(q, async (r) => {
    const u = r && r[k]; if (!u) { sndMsg("সাউন্ডের ডেটা পাওয়া গেল না", true); return; }
    try {
      if (!sndCtx) sndCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (sndCtx.state === "suspended") await sndCtx.resume();
      const ab = await sndCtx.decodeAudioData(dataToBuf(u));
      if (sndSrc) { try { sndSrc.stop(); } catch (_) {} }
      const s = sndCtx.createBufferSource(), g = sndCtx.createGain();
      s.buffer = ab; g.gain.value = Math.max(0, Math.min(1, Number(cfg.vol)));
      s.connect(g); g.connect(sndCtx.destination); s.start(); s.stop(sndCtx.currentTime + Math.min(ab.duration, 10)); sndSrc = s;
    } catch (_) { sndMsg("এই সাউন্ডটা চালানো গেল না", true); }
  });
}

function delMy(id) {
  save("customSounds", mySounds().filter((x) => x.id !== id));
  save("smsnd_" + id, "");
  try { if (smchrome.storage.local.remove) smchrome.storage.local.remove("smsnd_" + id); } catch (_) {}
  renderSounds(); sndMsg("মুছে ফেলা হয়েছে", false);
}

function addSounds(targetId) {
  if (IS_EXT && !IN_TAB) { // এক্সটেনশন পপআপ ফাইল বাছাইয়ের সময় বন্ধ হয়ে যেতে পারে, তাই আলাদা ট্যাবে খুলি
    try { chrome.tabs.create({ url: chrome.runtime.getURL("popup.html?tab=1") }); window.close(); return; } catch (_) {}
  }
  const inp = document.createElement("input"); inp.type = "file"; inp.multiple = true;
  inp.accept = "audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.opus,.weba";
  inp.onchange = async () => {
    const files = Array.from(inp.files || []); let last = null, ok = 0; const bad = [];
    for (const f of files) {
      const used = mySounds().reduce((n, x) => n + (x.size || 0), 0);
      if (mySounds().length >= MAXCNT) { bad.push("সর্বোচ্চ " + MAXCNT + "টা সাউন্ড রাখা যায়"); break; }
      if (f.size > MAXSND) { bad.push(f.name + " (৬ MB এর বেশি)"); continue; }
      if (used + f.size > MAXTOTAL) { bad.push(f.name + " (মোট জায়গা শেষ — আগে কিছু মুছো)"); continue; }
      try {
        const u = await readFile(f);
        const ab = await new OfflineAudioContext(2, 1, 48000).decodeAudioData(dataToBuf(u)); // চালানো যায় কি না যাচাই
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        save("smsnd_" + id, u);
        save("customSounds", mySounds().concat([{ id: id, name: f.name.replace(/\.[^.]+$/, "").slice(0, 40), dur: Math.round(ab.duration * 10) / 10, size: f.size }]));
        last = id; ok++;
      } catch (_) { bad.push(f.name + " (চালানো গেল না)"); }
    }
    if (last && targetId) save(targetId, "c:" + last);
    renderSounds();
    if (ok) sndMsg(ok + "টা সাউন্ড যোগ হয়েছে" + (bad.length ? " — বাদ: " + bad.join(", ") : "") + ". এখন থেকে সবসময় সেভ থাকবে।", false);
    else if (bad.length) sndMsg("যোগ হয়নি: " + bad.join(", "), true);
  };
  inp.click();
}
document.querySelectorAll(".addsnd").forEach((b) => { b.onclick = () => addSounds(b.getAttribute("data-for")); });
if (IN_TAB) sndMsg("এই ট্যাবে \"নতুন সাউন্ড যোগ করো\" বাটনে চেপে ফাইল বাছো।", false);
