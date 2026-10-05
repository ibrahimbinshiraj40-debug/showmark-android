// ShowMark Android — আঙুলের টাচকে "মাউস ইভেন্ট" বানিয়ে overlay.js কে পাঠায়।
// mode: 0 = বন্ধ (Kotlin উইন্ডোটাই টাচ-ভেদ করে রাখে, নিচের অ্যাপ চলে), 1 = জুম (ডান বাটনের মতো), 2 = আঁকা (বাম বাটনের মতো)
(function () {
  var B = window.AndroidBridge;
  window.__smMode = 0;
  var cur = null;

  function send(type, button, x, y, buttons) {
    window.__smMouse({ type: type, button: button, x: x, y: y, buttons: buttons, ctrlKey: false });
  }
  function finishCur(e, cancel) {
    if (!cur) return;
    var c = cur; cur = null; clearTimeout(c.timer);
    var x = e ? e.clientX : c.lx, y = e ? e.clientY : c.ly;
    if (!c.live && c.pend && !cancel) send("move", 0, c.pend[0], c.pend[1], c.bit);
    send("up", c.btn, x, y, 0);
    try { B.gestureEnd(!!c.moved && !cancel); } catch (err) {}
  }
  window.__smSetMode = function (m) { if (cur) finishCur(null, true); window.__smMode = m; };

  function onDown(e) {
    if (!window.__smMode || cur) return;
    e.preventDefault();
    var zoom = window.__smMode === 1;
    cur = { id: e.pointerId, btn: zoom ? 2 : 0, bit: zoom ? 2 : 1, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, pend: null, live: false, timer: 0 };
    send("down", cur.btn, e.clientX, e.clientY, cur.bit);
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
    if (!cur.live) { cur.pend = [e.clientX, e.clientY]; return; }
    send("move", 0, e.clientX, e.clientY, cur.bit);
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
