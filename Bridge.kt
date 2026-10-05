package com.ibrahim.showmark

import android.webkit.JavascriptInterface
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** WebView ও Kotlin এর মধ্যে সেতু। অ্যাক্টিভিটি/সার্ভিস এই হোস্ট ইন্টারফেসের দরকারি অংশ বানায়। */
interface BridgeHost {
    fun runJs(code: String) {}
    fun onCapture(id: Int) {}
    fun onGestureEnd(moved: Boolean) {}
    fun status(): String = "{}"
    fun requestOverlayPermission() {}
    fun startShowMark() {}
    fun stopShowMark() {}
}

class Bridge(private val host: BridgeHost) {

    @JavascriptInterface
    fun getSettings(): String = Store.snapshot()

    @JavascriptInterface
    fun setSettings(json: String) {
        try { Store.set(JSONObject(json)) } catch (e: Exception) { }
    }

    @JavascriptInterface
    fun getBlob(key: String): String = Store.getBlob(key)

    @JavascriptInterface
    fun setBlob(key: String, value: String) {
        Store.setBlob(key, value)
    }

    @JavascriptInterface
    fun removeKey(key: String) {
        if (key.startsWith("smsnd_")) Store.setBlob(key, "") else Store.remove(key)
    }

    @JavascriptInterface
    fun capture(id: Int) {
        host.onCapture(id)
    }

    @JavascriptInterface
    fun gestureEnd(moved: Boolean) {
        host.onGestureEnd(moved)
    }

    @JavascriptInterface
    fun status(): String = host.status()

    @JavascriptInterface
    fun requestOverlayPermission() {
        host.requestOverlayPermission()
    }

    @JavascriptInterface
    fun startShowMark() {
        host.startShowMark()
    }

    @JavascriptInterface
    fun stopShowMark() {
        host.stopShowMark()
    }

    /** হাতের লেখা চেনা (Google Input Tools — ইন্টারনেট লাগে)। */
    @JavascriptInterface
    fun recognize(id: Int, json: String) {
        Thread {
            val result = recognizeNet(json)
            host.runJs("__smCb(" + id + "," + JSONObject.quote(result) + ")")
        }.start()
    }

    private fun recognizeNet(msg: String): String {
        return try {
            val m = JSONObject(msg)
            val guide = JSONObject()
            guide.put("writing_area_width", m.optInt("w", 100))
            guide.put("writing_area_height", m.optInt("h", 100))
            val req = JSONObject()
            req.put("writing_guide", guide)
            req.put("ink", m.get("ink"))
            req.put("language", m.optString("lang", "en"))
            val body = JSONObject()
            body.put("options", "enable_pre_space")
            body.put("requests", JSONArray().put(req))

            val conn = URL("https://inputtools.google.com/request?ime=handwriting&app=mobilesearch&cs=1&oe=UTF-8")
                .openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json")
            conn.doOutput = true
            conn.connectTimeout = 8000
            conn.readTimeout = 8000
            conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            val txt = conn.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }

            val j = JSONArray(txt)
            val out = JSONObject()
            out.put("text", "")
            out.put("cands", JSONArray())
            if (j.optString(0) == "SUCCESS") {
                val c = j.getJSONArray(1).getJSONArray(0).getJSONArray(1)
                out.put("text", if (c.length() > 0) c.getString(0).trim() else "")
                out.put("cands", c)
            }
            out.toString()
        } catch (e: Exception) {
            val err = JSONObject()
            err.put("error", e.toString())
            err.toString()
        }
    }
}
