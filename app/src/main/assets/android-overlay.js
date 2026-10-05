// ShowMark Android — আঙুলের টাচকে "মাউস ইভেন্ট" বানিয়ে overlay.js কে পাঠায়।
// mode: 0 = বন্ধ (Kotlin উইন্ডোটাই টাচ-ভেদ করে রাখে, নিচের অ্যাপ চলে), 1 = জুম (ডান বাটনের মতো), 2 = আঁকা (বাম বাটনের মতো)
(function () {
  var B = window.AndroidBridge;
  window.__smMode = 0;
  var cur = null;

  // ---- জুমের সময় আঙুল নিচে, বিন্দু ওপরে (ছবি এডিটরের ইরেজারের মতো) ----
  var OFF = 110; // আঙুল থেকে বিন্দু কত px ওপরে (সেটিং থেকে বদলায়, ০ = বন্ধ)
  try {
    smchrome.storage.local.get({ zoomOff: 110 }, function (r) { var v = Number(r.zoomOff); OFF = isNaN(v) ? 110 : Math.max(0, v); });
    smchrome.storage.onChanged.addListener(function (ch) { if (ch.zoomOff) { var v = Number(ch.zoomOff.newValue); OFF = isNaN(v) ? 110 : Math.max(0, v); } });
  } catch (err) {}
  // আঙুলের জায়গা -> আসল বিন্দুর জায়গা। স্ক্রিনের নিচের দিকে অফসেট কমে আসে, যাতে একদম নিচের অংশও সিলেক্ট করা যায়।
  function mapY(y) {
    if (!OFF) return y;
    var H = window.innerHeight || 1, f = Math.max(0, Math.min(1, (H - y) / OFF));
    return Math.max(0, y - OFF * f);
  }
  var hd = null; // হ্যান্ডেল UI
  function hdMake() {
    var w = document.createElement("div");
    w.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none;display:none";
    w.innerHTML =
      '<div class="ln" style="position:absolute;width:2px;margin-left:-1px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.45);transform-origin:0 0"></div>' +
      '<div class="tg" style="position:absolute;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;border:2px solid #fff;box-sizing:border-box;box-shadow:0 0 0 1px rgba(0,0,0,.6);background:rgba(255,230,0,.9)"></div>' +
      '<div class="fg" style="position:absolute;width:52px;height:52px;margin:-26px 0 0 -26px;border-radius:50%;background:rgba(255,255,255,.92);box-shadow:0 2px 10px rgba(0,0,0,.55)"></div>';
    document.body.appendChild(w);
    return { w: w, ln: w.querySelector(".ln"), tg: w.querySelector(".tg"), fg: w.querySelector(".fg") };
  }
  function hdPlace(fx, fy, tx, ty) {
    if (!hd) return;
    var len = Math.max(0, fy - ty);
    hd.ln.style.left = fx + "px"; hd.ln.style.top = ty + "px"; hd.ln.style.height = len + "px";
    hd.tg.style.left = tx + "px"; hd.tg.style.top = ty + "px";
    hd.fg.style.left = fx + "px"; hd.fg.style.top = fy + "px";
  }
  function hdHide() { if (hd) hd.w.style.display = "none"; }
  // overlay.js স্ক্রিনশট তোলা শেষ হলে এটা ডাকে (আগে দেখালে হ্যান্ডেলটাই জুমের ছবিতে উঠে যেত)
  window.__smHandleShow = function () {
    if (!cur || !cur.off) return;
    if (!hd) hd = hdMake();
    hd.w.style.display = "block";
    hdPlace(cur.lx, cur.ly, cur.lx, mapY(cur.ly));
  };

  function send(type, button, x, y, buttons) {
    window.__smMouse({ type: type, button: button, x: x, y: y, buttons: buttons, ctrlKey: false });
  }
  function finishCur(e, cancel) {
    if (!cur) return;
    var c = cur; cur = null; clearTimeout(c.timer);
    hdHide();
    var x = e ? e.clientX : c.lx, y = e ? e.clientY : c.ly;
    if (c.off) y = mapY(y);
    if (!c.live && c.pend && !cancel) send("move", 0, c.pend[0], c.pend[1], c.bit);
    send("up", c.btn, x, y, 0);
    try { B.gestureEnd(!!c.moved && !cancel); } catch (err) {}
  }
  window.__smSetMode = function (m) { if (cur) finishCur(null, true); window.__smMode = m; };

  function onDown(e) {
    if (!window.__smMode || cur) return;
    e.preventDefault();
    var zoom = window.__smMode === 1;
    cur = { id: e.pointerId, btn: zoom ? 2 : 0, bit: zoom ? 2 : 1, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, pend: null, live: false, timer: 0, off: zoom && OFF > 0 };
    send("down", cur.btn, e.clientX, cur.off ? mapY(e.clientY) : e.clientY, cur.bit);
    // শুরুর ~৮০ms এর নড়াচড়া ধরে রাখি, নইলে overlay.js ভাবে "ধরে রাখার আগেই টেনেছে" আর বাতিল করে দেয়
    cur.timer = setTimeout(function () {
      if (!cur) return;
      cur.live = true;
      if (cur.pend) { send("move", 0, cur.pend[0], cur.pend[1], cur.bit); cur.pend = null; }
    }, 80);
  }
  function onMove(e) {
    if (!cur || e.pointerId !== cur.id) return;
    e.preventDefault();
    cur.lx = e.clientX; cur.ly = e.clientY;
    if (Math.hypot(e.clientX - cur.sx, e.clientY - cur.sy) > 14) cur.moved = true;
    var ty = cur.off ? mapY(e.clientY) : e.clientY;
    if (cur.off && hd && hd.w.style.display === "block") hdPlace(e.clientX, e.clientY, e.clientX, ty);
    if (!cur.live) { cur.pend = [e.clientX, ty]; return; }
    send("move", 0, e.clientX, ty, cur.bit);
  }
  function onUp(e) { if (!cur || e.pointerId !== cur.id) return; e.preventDefault(); finishCur(e, false); }
  function onCancel(e) { if (!cur || e.pointerId !== cur.id) return; finishCur(e, true); }

  var o = { capture: true, passive: false };
  window.addEventListener("pointerdown", onDown, o);
  window.addEventListener("pointermove", onMove, o);
  window.addEventListener("pointerup", onUp, o);
  window.addEventListener("pointercancel", onCancel, o);
  window.addEventListener("contextmenu", function (e) { e.preventDefault(); }, true);
})();
