// ShowMark Android — overlay.js / settings.js এর জন্য "smchrome" API (ডেস্কটপের preload.js এর মতোই কাজ)
// সেটিং Kotlin এর Store এ সংরক্ষিত হয়; সাউন্ডের বড় ডেটা আলাদা ফাইলে (smsnd_*)।
(function () {
  var B = window.AndroidBridge;
  var isOverlay = location.pathname.indexOf("overlay.html") >= 0;
  var changeCbs = [], mouseCbs = [], clearCbs = [], pend = {}, seq = 0;
  function parse(s, d) { try { return JSON.parse(s); } catch (e) { return d; } }

  // Kotlin থেকে ফল ফেরত আসার পথ (স্ক্রিনশট, হাতের লেখা চেনা)
  window.__smCb = function (id, payload) { var f = pend[id]; delete pend[id]; if (f) { try { f(payload); } catch (e) {} } };
  // অন্য জায়গায় (সেটিং পেজ) সেটিং বদলালে এখানে আসে
  window.__smChanged = function (json) {
    var o = parse(json, {}), ch = {};
    for (var k in o) { if (isOverlay && k === "tool") continue; ch[k] = { newValue: o[k] }; }
    changeCbs.forEach(function (f) { try { f(ch); } catch (e) {} });
  };
  window.__smClear = function () { clearCbs.forEach(function (f) { try { f(); } catch (e) {} }); };
  window.__smMouse = function (m) { mouseCbs.forEach(function (f) { try { f(m); } catch (e) {} }); };

  window.smchrome = {
    storage: {
      local: {
        get: function (defs, cb) {
          var st = parse(B.getSettings(), {});
          Object.keys(defs || {}).forEach(function (k) { if (k.indexOf("smsnd_") === 0) st[k] = B.getBlob(k); });
          var r = Object.assign({}, defs, st);
          if (isOverlay) { r.tool = "auto"; r.hold = 60; } // ধরে রাখার সময় android-overlay.js নিজে দেখে (বিন্দু লাল হওয়ার সময়), তাই এখানে সবচেয়ে কম
          cb(r);
        },
        set: function (obj) {
          var small = {}, has = false;
          Object.keys(obj).forEach(function (k) {
            if (k.indexOf("smsnd_") === 0) B.setBlob(k, String(obj[k] || ""));
            else { small[k] = obj[k]; has = true; }
          });
          if (has) B.setSettings(JSON.stringify(small));
        },
        remove: function (k) { B.removeKey(k); }
      },
      onChanged: { addListener: function (f) { changeCbs.push(f); } }
    },
    runtime: {
      lastError: undefined,
      sendMessage: function (msg, cb) {
        var done = function (r) { try { cb && cb(r); } catch (e) {} };
        if (!msg) return done(undefined);
        if (msg.type === "capture") {
          var id = ++seq; pend[id] = function (u) { done(u ? { url: u } : { error: "fail" }); }; B.capture(id);
        } else if (msg.type === "recognize") {
          var id2 = ++seq; pend[id2] = function (p) { done(parse(p, { error: "bad" })); }; B.recognize(id2, JSON.stringify(msg));
        } else done(undefined);
      }
    },
    overlay: {
      onMouse: function (f) { mouseCbs.push(f); },
      onClear: function (f) { clearCbs.push(f); },
      setInteractive: function () {}
    }
  };
})();
