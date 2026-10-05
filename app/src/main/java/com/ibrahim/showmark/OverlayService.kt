package com.ibrahim.showmark

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.Icon
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.Looper
import android.util.Base64
import android.util.DisplayMetrics
import android.view.ContextThemeWrapper
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.webkit.WebView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import org.json.JSONObject
import java.io.ByteArrayOutputStream

/**
 * ShowMark Android এর প্রাণ:
 *  - পুরো স্ক্রিন জুড়ে একটা স্বচ্ছ WebView (overlay.html) — সাধারণ সময় টাচ-ভেদ, জুম/আঁকা মোডে টাচ ধরে
 *  - একটা ভাসমান ✨ বাটন (টানা যায়) যা মেনু খোলে
 *  - MediaProjection দিয়ে স্ক্রিনের ছবি তোলা (জুম বক্সের জন্য)
 */
class OverlayService : Service() {

    companion object {
        const val ACTION_START = "com.ibrahim.showmark.START"
        const val ACTION_STOP = "com.ibrahim.showmark.STOP"
        const val ACTION_ZOOM = "com.ibrahim.showmark.ZOOM"
        const val ACTION_DRAW = "com.ibrahim.showmark.DRAW"
        const val ACTION_CLEAR = "com.ibrahim.showmark.CLEAR"
        private const val CHANNEL = "showmark"
        private const val NOTIF_ID = 11
        private const val COL_IDLE = "#6D28D9"
        private const val COL_ZOOM = "#16A34A"
        private const val COL_DRAW = "#E11D1D"
        private const val COL_MENU = "#1F2547"

        @Volatile
        var running = false
    }

    private val main = Handler(Looper.getMainLooper())
    private lateinit var wm: WindowManager
    private val capThread = HandlerThread("showmark-capture")
    private lateinit var capHandler: Handler

    // ওভারলে WebView
    private var web: WebView? = null
    private var webLp: WindowManager.LayoutParams? = null
    private val flagsNoTouch = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
            WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
            WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
            WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED
    private var mode = 0 // 0 বন্ধ, 1 জুম, 2 আঁকা

    // স্ক্রিন ক্যাপচার
    private var projection: MediaProjection? = null
    private var display: VirtualDisplay? = null
    private var reader: ImageReader? = null
    private val imgLock = Object()
    private var lastImage: Image? = null
    @Volatile
    private var frameSeq = 0
    private var capW = 0
    private var capH = 0
    private var capDpi = 0

    // ভাসমান বাটন
    private var bubbleRoot: LinearLayout? = null
    private var bubbleLp: WindowManager.LayoutParams? = null
    private var mainBtn: TextView? = null
    private var menu: LinearLayout? = null
    private var menuOpen = false

    private val storeListener: (JSONObject) -> Unit = { ch -> main.post { onSettingsChanged(ch) } }

    private val overlayHost = object : BridgeHost {
        override fun runJs(code: String) {
            main.post { web?.evaluateJavascript(code, null) }
        }

        override fun onCapture(id: Int) {
            doCapture(id)
        }

        override fun onGestureEnd(moved: Boolean) {
            main.post {
                if (mode == 1 && moved && !Store.getBool("zoomKeep", false)) setMode(0)
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        capThread.start()
        capHandler = Handler(capThread.looper)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                if (!running) startAll(intent)
            }
            ACTION_STOP -> stopSelf()
            ACTION_ZOOM -> if (running) setMode(if (mode == 1) 0 else 1) else stopSelf()
            ACTION_DRAW -> if (running) setMode(if (mode == 2) 0 else 2) else stopSelf()
            ACTION_CLEAR -> if (running) web?.evaluateJavascript("__smClear()", null) else stopSelf()
            else -> if (!running) stopSelf()
        }
        return START_NOT_STICKY
    }

    // ---------------------------------------------------------------- শুরু
    private fun startAll(intent: Intent) {
        Store.init(this)
        createChannel()
        val n = buildNotification()
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        } else {
            startForeground(NOTIF_ID, n)
        }
        try {
            val code = intent.getIntExtra("code", 0)
            @Suppress("DEPRECATION")
            val data = intent.getParcelableExtra<Intent>("data")
            if (data == null) {
                stopSelf()
                return
            }
            val mpm = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            val mp = mpm.getMediaProjection(code, data)
            projection = mp
            mp.registerCallback(object : MediaProjection.Callback() {
                override fun onStop() {
                    main.post { stopSelf() }
                }
            }, main)
            setupCapture()
            setupOverlay()
            setupBubble()
            Store.addListener(storeListener)
            running = true
        } catch (e: Exception) {
            Toast.makeText(this, "ShowMark চালু করা গেল না: " + e.message, Toast.LENGTH_LONG).show()
            stopSelf()
        }
    }

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    @Suppress("DEPRECATION")
    private fun realSize(): IntArray {
        val dm = DisplayMetrics()
        wm.defaultDisplay.getRealMetrics(dm)
        return intArrayOf(dm.widthPixels, dm.heightPixels, dm.densityDpi)
    }

    // ---------------------------------------------------------------- স্ক্রিন ক্যাপচার
    private fun newReader(w: Int, h: Int): ImageReader {
        val r = ImageReader.newInstance(w, h, PixelFormat.RGBA_8888, 3)
        r.setOnImageAvailableListener(ImageReader.OnImageAvailableListener { rd ->
            try {
                val img = rd.acquireLatestImage()
                if (img != null) {
                    synchronized(imgLock) {
                        lastImage?.close()
                        lastImage = img
                        frameSeq++
                    }
                }
            } catch (e: Exception) { }
        }, capHandler)
        return r
    }

    private fun setupCapture() {
        val s = realSize()
        capW = s[0]; capH = s[1]; capDpi = s[2]
        val r = newReader(capW, capH)
        reader = r
        display = projection!!.createVirtualDisplay(
            "showmark", capW, capH, capDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, r.surface, null, null
        )
    }

    /** স্ক্রিন ঘোরালে মাপ নতুন করে ঠিক করি। */
    private fun relayout() {
        if (!running) return
        val s = realSize()
        if (s[0] == capW && s[1] == capH && s[2] == capDpi) return
        capW = s[0]; capH = s[1]; capDpi = s[2]
        val old = reader
        val nr = newReader(capW, capH)
        reader = nr
        try {
            display?.resize(capW, capH, capDpi)
            display?.surface = nr.surface
        } catch (e: Exception) { }
        synchronized(imgLock) {
            lastImage?.close()
            lastImage = null
        }
        try { old?.close() } catch (e: Exception) { }
        val lp = webLp
        val w = web
        if (lp != null && w != null) {
            lp.width = capW
            lp.height = capH
            try { wm.updateViewLayout(w, lp) } catch (e: Exception) { }
        }
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        main.postDelayed({ relayout() }, 300)
    }

    /** JS স্ক্রিনশট চাইলে: বাটন লুকাই, নতুন ফ্রেম আসা পর্যন্ত একটু অপেক্ষা, তারপর JPEG করে ফেরত। */
    private fun doCapture(id: Int) {
        main.post { bubbleRoot?.visibility = View.INVISIBLE }
        val seq0 = frameSeq
        Thread {
            var waited = 0
            while (frameSeq == seq0 && waited < 300) {
                try { Thread.sleep(15) } catch (e: InterruptedException) { }
                waited += 15
            }
            try { Thread.sleep(40) } catch (e: InterruptedException) { }
            val url = grab()
            main.post {
                applyBubbleLook()
                web?.evaluateJavascript("__smCb(" + id + "," + JSONObject.quote(url) + ")", null)
            }
        }.start()
    }

    private fun grab(): String {
        synchronized(imgLock) {
            val img = lastImage ?: return ""
            return try {
                val plane = img.planes[0]
                val pw = img.width
                val ph = img.height
                val bw = plane.rowStride / plane.pixelStride
                val buf = plane.buffer
                buf.rewind()
                val bmp = Bitmap.createBitmap(bw, ph, Bitmap.Config.ARGB_8888)
                bmp.copyPixelsFromBuffer(buf)
                val out = if (bw != pw) Bitmap.createBitmap(bmp, 0, 0, pw, ph) else bmp
                val bos = ByteArrayOutputStream()
                out.compress(Bitmap.CompressFormat.JPEG, 92, bos)
                if (out !== bmp) out.recycle()
                bmp.recycle()
                "data:image/jpeg;base64," + Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP)
            } catch (e: Exception) {
                ""
            }
        }
    }

    // ---------------------------------------------------------------- ওভারলে (স্বচ্ছ WebView)
    private fun setupOverlay() {
        val wv = WebView(ContextThemeWrapper(applicationContext, android.R.style.Theme_DeviceDefault))
        wv.setBackgroundColor(Color.TRANSPARENT)
        wv.isHorizontalScrollBarEnabled = false
        wv.isVerticalScrollBarEnabled = false
        wv.overScrollMode = View.OVER_SCROLL_NEVER
        wv.isLongClickable = false
        wv.setOnLongClickListener { true }
        wv.isHapticFeedbackEnabled = false
        val st = wv.settings
        st.javaScriptEnabled = true
        st.mediaPlaybackRequiresUserGesture = false
        st.textZoom = 100
        wv.addJavascriptInterface(Bridge(overlayHost), "AndroidBridge")
        wv.loadUrl("file:///android_asset/overlay.html")

        val lp = WindowManager.LayoutParams(
            capW, capH, WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY, flagsNoTouch, PixelFormat.TRANSLUCENT
        )
        lp.gravity = Gravity.TOP or Gravity.START
        if (Build.VERSION.SDK_INT >= 30) {
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
        } else if (Build.VERSION.SDK_INT >= 28) {
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
        }
        wm.addView(wv, lp)
        web = wv
        webLp = lp
    }

    private fun setMode(m: Int) {
        mode = m
        val lp = webLp
        val w = web
        if (lp != null && w != null) {
            lp.flags = if (m == 0) flagsNoTouch else (flagsNoTouch and WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE.inv())
            try { wm.updateViewLayout(w, lp) } catch (e: Exception) { }
        }
        web?.evaluateJavascript("__smSetMode(" + m + ")", null)
        if (m != 0) collapseMenu()
        refreshBubble()
    }

    // ---------------------------------------------------------------- ভাসমান বাটন
    private fun circle(color: String): GradientDrawable {
        val g = GradientDrawable()
        g.shape = GradientDrawable.OVAL
        g.setColor(Color.parseColor(color))
        g.setStroke(dp(2), Color.parseColor("#66FFFFFF"))
        return g
    }

    private fun mkBtn(label: String, color: String, size: Int): TextView {
        val t = TextView(this)
        t.text = label
        t.textSize = 20f
        t.gravity = Gravity.CENTER
        t.setTextColor(Color.WHITE)
        t.background = circle(color)
        val lp = LinearLayout.LayoutParams(size, size)
        lp.topMargin = dp(6)
        t.layoutParams = lp
        return t
    }

    private inner class Drag : View.OnTouchListener {
        var sx = 0
        var sy = 0
        var tx = 0f
        var ty = 0f
        var moved = false

        override fun onTouch(v: View, e: MotionEvent): Boolean {
            val lp = bubbleLp ?: return false
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    sx = lp.x; sy = lp.y; tx = e.rawX; ty = e.rawY; moved = false
                    return true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = e.rawX - tx
                    val dy = e.rawY - ty
                    if (!moved && Math.hypot(dx.toDouble(), dy.toDouble()) > dp(8)) moved = true
                    if (moved) {
                        lp.x = (sx + dx.toInt()).coerceIn(0, maxOf(0, capW - dp(50)))
                        lp.y = (sy + dy.toInt()).coerceIn(0, maxOf(0, capH - dp(50)))
                        updateBubble()
                    }
                    return true
                }
                MotionEvent.ACTION_UP -> {
                    if (moved) {
                        val m = JSONObject()
                        m.put("bubbleX", lp.x)
                        m.put("bubbleY", lp.y)
                        Store.set(m)
                    } else {
                        onBubbleTap()
                    }
                    return true
                }
            }
            return false
        }
    }

    private fun setupBubble() {
        val size = dp(50)
        val root = LinearLayout(this)
        root.orientation = LinearLayout.VERTICAL
        root.gravity = Gravity.CENTER_HORIZONTAL

        val mb = mkBtn("✨", COL_IDLE, size)
        (mb.layoutParams as LinearLayout.LayoutParams).topMargin = 0
        mb.setOnTouchListener(Drag())
        root.addView(mb)

        val mn = LinearLayout(this)
        mn.orientation = LinearLayout.VERTICAL
        mn.visibility = View.GONE
        val s2 = dp(44)

        val bZoom = mkBtn("🔍", COL_ZOOM, s2)
        bZoom.setOnClickListener { setMode(1) }
        val bDraw = mkBtn("✏️", COL_DRAW, s2)
        bDraw.setOnClickListener { setMode(2) }
        val bClear = mkBtn("🧹", COL_MENU, s2)
        bClear.setOnClickListener { web?.evaluateJavascript("__smClear()", null) }
        val bSet = mkBtn("⚙️", COL_MENU, s2)
        bSet.setOnClickListener {
            collapseMenu()
            val i = Intent(this, MainActivity::class.java)
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            startActivity(i)
        }
        val bStop = mkBtn("✕", COL_MENU, s2)
        bStop.setOnClickListener { stopSelf() }
        mn.addView(bZoom); mn.addView(bDraw); mn.addView(bClear); mn.addView(bSet); mn.addView(bStop)
        root.addView(mn)

        val lp = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                    WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        )
        lp.gravity = Gravity.TOP or Gravity.START
        lp.x = Store.getDouble("bubbleX", (capW - dp(60)).toDouble()).toInt().coerceIn(0, maxOf(0, capW - dp(50)))
        lp.y = Store.getDouble("bubbleY", (capH / 3).toDouble()).toInt().coerceIn(0, maxOf(0, capH - dp(50)))
        wm.addView(root, lp)

        bubbleRoot = root
        bubbleLp = lp
        mainBtn = mb
        menu = mn
        applyBubbleLook()
    }

    private fun updateBubble() {
        val r = bubbleRoot
        val lp = bubbleLp
        if (r != null && lp != null) {
            try { wm.updateViewLayout(r, lp) } catch (e: Exception) { }
        }
    }

    private fun applyBubbleLook() {
        val r = bubbleRoot ?: return
        r.visibility = if (Store.getBool("showBubble", true)) View.VISIBLE else View.GONE
        r.alpha = Store.getDouble("bubbleAlpha", 0.9).toFloat().coerceIn(0.2f, 1f)
    }

    private fun refreshBubble() {
        val b = mainBtn ?: return
        when (mode) {
            1 -> { b.text = "🔍"; b.background = circle(COL_ZOOM) }
            2 -> { b.text = "✏️"; b.background = circle(COL_DRAW) }
            else -> { b.text = "✨"; b.background = circle(COL_IDLE) }
        }
    }

    private fun onBubbleTap() {
        if (mode != 0) {
            setMode(0)
        } else {
            toggleMenu()
        }
    }

    private fun toggleMenu() {
        val mn = menu ?: return
        val lp = bubbleLp ?: return
        menuOpen = !menuOpen
        mn.visibility = if (menuOpen) View.VISIBLE else View.GONE
        if (menuOpen) {
            val total = dp(50) + 5 * (dp(44) + dp(6))
            if (lp.y + total > capH - dp(8)) lp.y = maxOf(0, capH - total - dp(8))
        }
        updateBubble()
    }

    private fun collapseMenu() {
        if (!menuOpen) return
        menuOpen = false
        menu?.visibility = View.GONE
        updateBubble()
    }

    // ---------------------------------------------------------------- সেটিং বদলালে
    private fun onSettingsChanged(ch: JSONObject) {
        applyBubbleLook()
        val out = JSONObject()
        val keys = ch.keys()
        while (keys.hasNext()) {
            val k = keys.next()
            if (k == "tool" || k.startsWith("smsnd_") || k == "bubbleX" || k == "bubbleY") continue
            out.put(k, ch.get(k))
        }
        if (out.length() > 0) {
            web?.evaluateJavascript("__smChanged(" + JSONObject.quote(out.toString()) + ")", null)
        }
    }

    // ---------------------------------------------------------------- নোটিফিকেশন
    private fun createChannel() {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "ShowMark", NotificationManager.IMPORTANCE_LOW))
    }

    private fun actionIntent(action: String, req: Int): PendingIntent {
        val i = Intent(this, OverlayService::class.java)
        i.action = action
        return PendingIntent.getService(this, req, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    private fun buildNotification(): Notification {
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val ic = Icon.createWithResource(this, R.drawable.ic_stat)
        val b = Notification.Builder(this, CHANNEL)
        b.setSmallIcon(R.drawable.ic_stat)
        b.setContentTitle("ShowMark চালু আছে")
        b.setContentText("জুম / আঁকা চালু করতে নিচের বাটন চাপো")
        b.setContentIntent(open)
        b.setOngoing(true)
        b.addAction(Notification.Action.Builder(ic, "🔍 জুম", actionIntent(ACTION_ZOOM, 1)).build())
        b.addAction(Notification.Action.Builder(ic, "✏️ আঁকা", actionIntent(ACTION_DRAW, 2)).build())
        b.addAction(Notification.Action.Builder(ic, "🧹 মুছো", actionIntent(ACTION_CLEAR, 3)).build())
        return b.build()
    }

    // ---------------------------------------------------------------- বন্ধ
    override fun onDestroy() {
        running = false
        Store.removeListener(storeListener)
        try { bubbleRoot?.let { wm.removeView(it) } } catch (e: Exception) { }
        try { web?.let { wm.removeView(it); it.destroy() } } catch (e: Exception) { }
        synchronized(imgLock) {
            lastImage?.close()
            lastImage = null
        }
        try { display?.release() } catch (e: Exception) { }
        try { reader?.close() } catch (e: Exception) { }
        try { projection?.stop() } catch (e: Exception) { }
        capThread.quitSafely()
        super.onDestroy()
    }
}
