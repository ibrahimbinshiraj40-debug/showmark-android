package com.ibrahim.showmark

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.widget.Toast
import org.json.JSONObject

/** সেটিং স্ক্রিন (settings.html একটা WebView তে) + অনুমতি চাওয়া + সার্ভিস চালু/বন্ধ। */
class MainActivity : Activity() {

    private lateinit var web: WebView
    private var fileCb: ValueCallback<Array<Uri>>? = null

    private val REQ_FILE = 77
    private val REQ_PROJ = 78

    private val host = object : BridgeHost {
        override fun runJs(code: String) {
            web.post { web.evaluateJavascript(code, null) }
        }

        override fun status(): String {
            val o = JSONObject()
            o.put("overlay", Settings.canDrawOverlays(this@MainActivity))
            o.put("running", OverlayService.running)
            return o.toString()
        }

        override fun requestOverlayPermission() {
            runOnUiThread { openOverlaySettings() }
        }

        override fun startShowMark() {
            runOnUiThread {
                if (!Settings.canDrawOverlays(this@MainActivity)) {
                    openOverlaySettings()
                } else {
                    val mpm = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
                    startActivityForResult(mpm.createScreenCaptureIntent(), REQ_PROJ)
                }
            }
        }

        override fun stopShowMark() {
            runOnUiThread {
                val i = Intent(this@MainActivity, OverlayService::class.java)
                i.action = OverlayService.ACTION_STOP
                startService(i)
            }
        }
    }

    private fun openOverlaySettings() {
        try {
            val i = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName"))
            startActivity(i)
        } catch (e: Exception) {
            Toast.makeText(this, "সেটিং খোলা গেল না — ফোনের সেটিং > অ্যাপ > ShowMark > অন্য অ্যাপের ওপর দেখানো চালু করো", Toast.LENGTH_LONG).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Store.init(this)
        window.statusBarColor = Color.parseColor("#10131F")
        window.navigationBarColor = Color.parseColor("#10131F")

        web = WebView(this)
        web.setBackgroundColor(Color.parseColor("#10131F"))
        web.settings.javaScriptEnabled = true
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams
            ): Boolean {
                fileCb?.onReceiveValue(null)
                fileCb = callback
                return try {
                    startActivityForResult(params.createIntent(), REQ_FILE)
                    true
                } catch (e: Exception) {
                    fileCb = null
                    callback.onReceiveValue(null)
                    false
                }
            }
        }
        web.addJavascriptInterface(Bridge(host), "AndroidBridge")
        setContentView(web)
        web.loadUrl("file:///android_asset/settings.html")

        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission("android.permission.POST_NOTIFICATIONS") != android.content.pm.PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf("android.permission.POST_NOTIFICATIONS"), 5)
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQ_FILE) {
            val cb = fileCb
            fileCb = null
            cb?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data))
        } else if (requestCode == REQ_PROJ) {
            if (resultCode == RESULT_OK && data != null) {
                val i = Intent(this, OverlayService::class.java)
                i.action = OverlayService.ACTION_START
                i.putExtra("code", resultCode)
                i.putExtra("data", data)
                startForegroundService(i)
                Toast.makeText(this, "ShowMark চালু হচ্ছে… যেকোনো অ্যাপে গিয়ে ✨ বাটন চাপো", Toast.LENGTH_LONG).show()
            } else {
                Toast.makeText(this, "স্ক্রিন শেয়ারের অনুমতি না দিলে জুম কাজ করবে না", Toast.LENGTH_LONG).show()
            }
        }
    }

    override fun onDestroy() {
        try { web.destroy() } catch (e: Exception) { }
        super.onDestroy()
    }
}
