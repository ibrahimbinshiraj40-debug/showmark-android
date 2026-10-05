package com.ibrahim.showmark

import android.content.Context
import org.json.JSONObject
import java.io.File

/**
 * সেটিং সংরক্ষণ। ছোট সেটিং settings.json এ; বড় সাউন্ড-ডেটা (smsnd_*) আলাদা ফাইলে।
 * যা যোগ করা হয় সবসময় সেভ থাকে (অ্যাপ বন্ধ করলেও)।
 */
object Store {
    private var dir: File? = null
    private var json = JSONObject()
    private val listeners = ArrayList<(JSONObject) -> Unit>()

    @Synchronized
    fun init(c: Context) {
        if (dir != null) return
        dir = c.applicationContext.filesDir
        try {
            val f = File(dir, "settings.json")
            if (f.exists()) json = JSONObject(f.readText())
        } catch (e: Exception) {
            json = JSONObject()
        }
    }

    @Synchronized
    fun snapshot(): String = json.toString()

    @Synchronized
    fun getBool(key: String, def: Boolean): Boolean = json.optBoolean(key, def)

    @Synchronized
    fun getDouble(key: String, def: Double): Double = json.optDouble(key, def)

    fun set(changes: JSONObject) {
        val changed = JSONObject()
        synchronized(this) {
            val keys = changes.keys()
            while (keys.hasNext()) {
                val k = keys.next()
                val v = changes.get(k)
                val old: Any? = if (json.has(k)) json.get(k) else null
                if (old == null || old.toString() != v.toString()) {
                    json.put(k, v)
                    changed.put(k, v)
                }
            }
            if (changed.length() > 0) save()
        }
        if (changed.length() > 0) {
            val ls: List<(JSONObject) -> Unit> = synchronized(this) { ArrayList(listeners) }
            for (l in ls) {
                try { l(changed) } catch (e: Exception) { }
            }
        }
    }

    @Synchronized
    fun remove(key: String) {
        if (json.has(key)) {
            json.remove(key)
            save()
        }
    }

    private fun save() {
        try {
            File(dir, "settings.json").writeText(json.toString())
        } catch (e: Exception) { }
    }

    // ---- বড় সাউন্ড-ডেটা ----
    private fun blobFile(key: String): File {
        val d = File(dir, "snd")
        d.mkdirs()
        return File(d, key.replace(Regex("[^A-Za-z0-9_]"), "_") + ".txt")
    }

    fun getBlob(key: String): String {
        return try {
            val f = blobFile(key)
            if (f.exists()) f.readText() else ""
        } catch (e: Exception) {
            ""
        }
    }

    fun setBlob(key: String, value: String) {
        try {
            val f = blobFile(key)
            if (value.isEmpty()) f.delete() else f.writeText(value)
        } catch (e: Exception) { }
    }

    @Synchronized
    fun addListener(l: (JSONObject) -> Unit) {
        listeners.add(l)
    }

    @Synchronized
    fun removeListener(l: (JSONObject) -> Unit) {
        listeners.remove(l)
    }
}
