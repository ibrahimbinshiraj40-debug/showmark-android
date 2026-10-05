// ShowMark Android — সেটিং পেজের বাড়তি অংশ: চালু/বন্ধ প্যানেল, ফোনের বাড়তি অপশন
(function () {
  var B = window.AndroidBridge, $ = function (id) { return document.getElementById(id); };

  // ডেস্কটপ-সংক্রান্ত "হোল্ড সময়" স্লাইডার ফোনে লাগে না
  var h = $("hold"); if (h) { if (h.previousElementSibling) h.previousElementSibling.style.display = "none"; h.style.display = "none"; }

  // বাড়তি অপশন
  smchrome.storage.local.get({ zoomKeep: false, showBubble: true, bubbleAlpha: 0.9 }, function (r) {
    $("zoomKeep").checked = !!r.zoomKeep;
    $("showBubble").checked = r.showBubble !== false;
    $("bubbleAlpha").value = r.bubbleAlpha; $("baV").textContent = r.bubbleAlpha;
  });
  $("zoomKeep").addEventListener("change", function () { smchrome.storage.local.set({ zoomKeep: $("zoomKeep").checked }); });
  $("showBubble").addEventListener("change", function () { smchrome.storage.local.set({ showBubble: $("showBubble").checked }); });
  $("bubbleAlpha").addEventListener("input", function () { $("baV").textContent = $("bubbleAlpha").value; smchrome.storage.local.set({ bubbleAlpha: Number($("bubbleAlpha").value) }); });

  // চালু/বন্ধ প্যানেল
  var last = "";
  function refresh() {
    var s = {}; try { s = JSON.parse(B.status()); } catch (e) {}
    var key = JSON.stringify(s); if (key === last) return; last = key;
    var msg = $("svcMsg"), btn = $("svcBtn");
    if (!s.overlay) {
      msg.textContent = "ধাপ ১: অন্য অ্যাপের ওপর আঁকার অনুমতি দাও (খুলে ShowMark এর পাশের সুইচ চালু করে ফিরে এসো)।";
      btn.className = ""; btn.textContent = "অনুমতি দাও"; btn.onclick = function () { B.requestOverlayPermission(); };
    } else if (!s.running) {
      msg.textContent = "ধাপ ২: চালু করলে ফোন স্ক্রিন শেয়ারের অনুমতি চাইবে। জুমের জন্য এটা লাগে — \"সম্পূর্ণ স্ক্রিন\" (Entire screen) বেছে নিও।";
      btn.className = "go"; btn.textContent = "▶ ShowMark চালু করো"; btn.onclick = function () { B.startShowMark(); };
    } else {
      msg.textContent = "✨ চালু আছে। যেকোনো অ্যাপে গিয়ে ভাসমান ✨ বাটন চাপো।";
      btn.className = "stop"; btn.textContent = "⏹ বন্ধ করো"; btn.onclick = function () { B.stopShowMark(); };
    }
  }
  refresh(); setInterval(refresh, 800);
})();
