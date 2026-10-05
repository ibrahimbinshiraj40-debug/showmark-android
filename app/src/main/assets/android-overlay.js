// ShowMark Android — আঙুলের টাচকে "মাউস ইভেন্ট" বানিয়ে overlay.js কে পাঠায়।
// mode: 0 = বন্ধ (Kotlin উইন্ডোটাই টাচ-ভেদ করে রাখে, নিচের অ্যাপ চলে), 1 = জুম (ডান বাটনের মতো), 2 = আঁকা (বাম বাটনের মতো)
(function () {
  var B = window.AndroidBridge;
  window.__smMode = 0;
  window.__smNoDot = true; // ফোনে নিজস্ব বিন্দু+দাগ আছে, তাই overlay.js এর হলুদ বিন্দু দেখানো বন্ধ
  var cur = null;

  // ---- জুমের সময় আঙুল নিচে, বিন্দু ওপরে (ছবি এডিটরের ইরেজারের মতো) ----
  var AIM_MS = 300;   // বিন্দু এক জায়গায় এতক্ষণ (ms) ধরে রাখলে লাল হয়ে সিলেক্ট শুরু হয় (সেটিং থেকে বদলায়)
  var OFF = 110; // আঙুল থেকে বিন্দু কত px ওপরে (সেটিং থেকে বদলায়, ০ = বন্ধ)
  try {
    smchrome.storage.local.get({ zoomOff: 110, aimMs: 300 }, function (r) {
      var v = Number(r.zoomOff); OFF = isNaN(v) ? 110 : Math.max(0, v);
      var a = Number(r.aimMs); AIM_MS = isNaN(a) ? 300 : Math.max(50, a);
    });
    smchrome.storage.onChanged.addListener(function (ch) {
      if (ch.zoomOff) { var v = Number(ch.zoomOff.newValue); OFF = isNaN(v) ? 110 : Math.max(0, v); }
      if (ch.aimMs) { var a = Number(ch.aimMs.newValue); AIM_MS = isNaN(a) ? 300 : Math.max(50, a); }
    });
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
  var lastX = null, lastY = null; // হ্যান্ডেলের শেষ জায়গা (🔍 চাপলে ওখানেই আসে; প্রথমবার স্ক্রিনের মাঝামাঝি)
  function hdShowAt(fx, fy) {
    if (!hd) hd = hdMake();
    hd.w.style.display = "block";
    hdPlace(fx, fy, fx, mapY(fy));
  }
  function hdIdle() {
    if (lastX === null) { lastX = (window.innerWidth || 360) / 2; lastY = (window.innerHeight || 640) * 0.62; }
    hdShowAt(lastX, lastY); hdColor(false);
  }
  // overlay.js: ধরে রাখা পূর্ণ হলে স্ক্রিনশটের আগে হ্যান্ডেল লুকায়, ছবি তোলা শেষ হলে আবার দেখায়
  // (হ্যান্ডেল দেখা অবস্থায় ছবি তুললে সেটাই জুমের ছবিতে উঠে যেত)
  window.__smHandleHide = hdHide;
  window.__smHandleShow = function () {
    if (!cur || !cur.off) return;
    hdShowAt(cur.lx, cur.ly);
  };

  function hdColor(red) { if (hd) hd.tg.style.background = red ? "#ff1f1f" : "rgba(255,230,0,.95)"; }
  
  var AIM_TOL = 10;   // এর চেয়ে কম নড়লে "স্থির" ধরা হয় (px)

  function send(type, button, x, y, buttons) {
    window.__smMouse({ type: type, button: button, x: x, y: y, buttons: buttons, ctrlKey: false });
  }
  // বিন্দু লাল হলো: এখান থেকে সিলেক্ট শুরু (overlay.js কে "ডান বাটন চাপা" ইভেন্ট পাঠাই)
  function startSel() {
    if (!cur || cur.phase === "sel") return;
    cur.phase = "sel";
    cur.sx = cur.lx; cur.sy = cur.ly; cur.moved = false;
    hdColor(true);
    send("down", cur.btn, cur.lx, cur.off ? mapY(cur.ly) : cur.ly, cur.bit);
    // শুরুর ~৮০ms এর নড়াচড়া ধরে রাখি, নইলে overlay.js ভাবে "ধরে রাখার আগেই টেনেছে" আর বাতিল করে দেয়
    cur.timer = setTimeout(function () {
      if (!cur) return;
      cur.live = true;
      if (cur.pend) { send("move", 0, cur.pend[0], cur.pend[1], cur.bit); cur.pend = null; }
    }, 80);
  }
  function finishCur(e, cancel) {
    if (!cur) return;
    var c = cur; cur = null; clearTimeout(c.timer); clearTimeout(c.aim);
    hdHide();
    if (c.off) { lastX = c.lx; lastY = c.ly; }
    if (c.phase === "aim") { // বিন্দু লাল হওয়ার আগেই আঙুল তুলেছে: শুধু বিন্দুর জায়গা বদলেছে, জুম নয়
      if (c.off && window.__smMode === 1) hdIdle();
      try { B.gestureEnd(false); } catch (err) {}
      return;
    }
    var x = e ? e.clientX : c.lx, y = e ? e.clientY : c.ly;
    if (c.off) y = mapY(y);
    if (!c.live && c.pend && !cancel) send("move", 0, c.pend[0], c.pend[1], c.bit);
    send("up", c.btn, x, y, 0);
    // জুম হলে মোড নিজেই বন্ধ হয় (হ্যান্ডেলও চলে যায়); না হলে 🔍 মোডেই থাকে, তাই বিন্দু আবার হলুদ হয়ে ফেরে
    if (c.off && window.__smMode === 1 && (!c.moved || cancel)) hdIdle();
    try { B.gestureEnd(!!c.moved && !cancel); } catch (err) {}
  }
  window.__smSetMode = function (m) {
    if (cur) finishCur(null, true);
    window.__smMode = m;
    if (m === 1 && OFF > 0) hdIdle(); else hdHide(); // 🔍 চাপার সাথে সাথেই বিন্দু + দাগ এসে যায়, জুম হওয়া পর্যন্ত থাকে
  };

  function onDown(e) {
    if (!window.__smMode || cur) return;
    e.preventDefault();
    var zoom = window.__smMode === 1;
    cur = { id: e.pointerId, btn: zoom ? 2 : 0, bit: zoom ? 2 : 1, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, pend: null, live: false, timer: 0, aim: 0, off: zoom && OFF > 0, phase: "sel" };
    if (cur.off) {
      // জুম মোড: আগে বিন্দু সরিয়ে ঠিক জায়গায় আনা (aim), এক জায়গায় ০.১৫ সেকেন্ড স্থির থাকলে লাল হয়ে সিলেক্ট শুরু (sel)
      cur.phase = "aim"; cur.ax = e.clientX; cur.ay = e.clientY;
      hdShowAt(e.clientX, e.clientY); hdColor(false);
      cur.aim = setTimeout(startSel, AIM_MS);
    } else {
      cur.phase = "aim"; startSel();
    }
  }
  function onMove(e) {
    if (!cur || e.pointerId !== cur.id) return;
    e.preventDefault();
    cur.lx = e.clientX; cur.ly = e.clientY;
    var ty = cur.off ? mapY(e.clientY) : e.clientY;
    if (cur.off && hd && hd.w.style.display === "block") hdPlace(e.clientX, e.clientY, e.clientX, ty);
    if (cur.phase === "aim") {
      // এখনো বিন্দু সরানো হচ্ছে: নড়তে থাকলে টাইমার আবার গোড়া থেকে
      if (Math.hypot(e.clientX - cur.ax, e.clientY - cur.ay) > AIM_TOL) {
        cur.ax = e.clientX; cur.ay = e.clientY;
        clearTimeout(cur.aim); cur.aim = setTimeout(startSel, AIM_MS);
      }
      return;
    }
    if (Math.hypot(e.clientX - cur.sx, e.clientY - cur.sy) > 14) cur.moved = true;
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
