package spot.fomo.app

import java.io.ByteArrayOutputStream
import java.util.Locale

/**
 * Pure rules of "save a file the page produced into Downloads" (FomoApp.saveFile*, blob:/data: downloads): file-name hygiene,
 * MIME normalisation, what is refused, de-duplication and data: URL parsing. No Android classes, so SaveFilePolicyTest runs on the JVM.
 * The web side has the same name rules in src/lib/native-app.ts (sanitizeSaveName); the app is the one that really enforces them.
 */
object SaveFilePolicy {

    /** One file at most (decoded). A chart CSV is a few MB; anything near this is not something the site produces. */
    const val MAX_BYTES = 64L * 1024 * 1024

    /** Longest file name kept (extension included). */
    const val MAX_NAME = 100

    const val DEFAULT_MIME = "application/octet-stream"

    /** Never written, whatever the page asks: installable / runnable payloads. The site has no reason to produce them. */
    private val BLOCKED_EXT = setOf(
        "apk", "xapk", "apks", "aab", "dex", "jar", "exe", "msi", "bat", "cmd", "com", "scr", "ps1", "vbs", "sh", "so",
    )

    private val EXT_BY_MIME = mapOf(
        "text/csv" to "csv",
        "text/plain" to "txt",
        "text/html" to "html",
        "application/json" to "json",
        "image/png" to "png",
        "image/jpeg" to "jpg",
        "image/webp" to "webp",
        "image/gif" to "gif",
        "image/svg+xml" to "svg",
        "application/pdf" to "pdf",
        "application/zip" to "zip",
    )

    private val MIME_RE = Regex("^[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*$")

    /** "text/csv;charset=utf-8" -> "text/csv"; anything that is not a MIME type -> application/octet-stream. */
    fun normalizeMime(raw: String?): String {
        val m = raw?.substringBefore(';')?.trim()?.lowercase(Locale.ROOT).orEmpty()
        return if (m.length <= 100 && MIME_RE.matches(m)) m else DEFAULT_MIME
    }

    fun extensionOf(name: String): String {
        val i = name.lastIndexOf('.')
        return if (i <= 0 || i == name.length - 1) "" else name.substring(i + 1).lowercase(Locale.ROOT)
    }

    fun isBlocked(name: String): Boolean = extensionOf(name) in BLOCKED_EXT

    /**
     * A name that is safe to create in Downloads: last path segment only, no control / reserved characters, no leading dots or
     * trailing dots / spaces, at most [MAX_NAME] characters with the extension kept, and an extension from the MIME type when
     * the name has none. Empty or hopeless input becomes "download[.ext]".
     */
    fun sanitizeName(raw: String?, mime: String? = null): String {
        var n = (raw ?: "").substringAfterLast('/').substringAfterLast('\\')
        n = buildString {
            for (c in n) {
                when {
                    c.code < 0x20 || c.code == 0x7f -> Unit
                    c in "<>:\"|?*" -> append('_')
                    else -> append(c)
                }
            }
        }
        n = n.trim().trimStart('.').trimEnd('.', ' ')
        val mimeExt = EXT_BY_MIME[normalizeMime(mime)]
        if (n.isEmpty()) n = "download"
        if (extensionOf(n).isEmpty() && mimeExt != null) n = "${n.trimEnd('.')}.$mimeExt"
        if (n.length > MAX_NAME) {
            val ext = extensionOf(n).take(10)
            val dot = if (ext.isEmpty()) "" else ".$ext"
            val stem = n.substring(0, n.length - (if (extensionOf(n).isEmpty()) 0 else extensionOf(n).length + 1))
            n = stem.take(MAX_NAME - dot.length).trimEnd('.', ' ') + dot
        }
        return n
    }

    /** "name.csv" -> "name (1).csv", "name (2).csv" ... until [exists] says it is free (99 tries, then a numeric tail). */
    fun uniqueName(name: String, exists: (String) -> Boolean): String {
        if (!exists(name)) return name
        val ext = extensionOf(name)
        val stem = if (ext.isEmpty()) name else name.substring(0, name.length - ext.length - 1)
        val dot = if (ext.isEmpty()) "" else ".$ext"
        for (i in 1..99) {
            val c = "$stem ($i)$dot"
            if (!exists(c)) return c
        }
        return "$stem (${System.currentTimeMillis()})$dot"
    }

    /** A parsed `data:` URL. [payload] is still encoded (base64 text, or percent-encoded text when [base64] is false). */
    class DataUrl(val mime: String, val base64: Boolean, val payload: String)

    /** `data:[<mime>][;charset=..][;base64],<payload>` -> parts, or null when it is not a well-formed data: URL. */
    fun parseDataUrl(url: String?): DataUrl? {
        if (url == null || url.length < 6 || !url.startsWith("data:", ignoreCase = true)) return null
        val comma = url.indexOf(',')
        if (comma < 0) return null
        val header = url.substring(5, comma)
        val parts = header.split(';').map { it.trim() }
        val base64 = parts.drop(1).any { it.equals("base64", ignoreCase = true) }
        val mime = normalizeMime(parts.firstOrNull().orEmpty().ifEmpty { "text/plain" })
        return DataUrl(mime, base64, url.substring(comma + 1))
    }

    /** Percent-decoding to raw bytes ("%C3%A9" -> two bytes). '+' stays '+' (this is not a form encoding). Null on a broken escape. */
    fun percentDecode(s: String): ByteArray? {
        val out = ByteArrayOutputStream(s.length)
        val run = StringBuilder()
        fun flush() {
            if (run.isNotEmpty()) {
                val b = run.toString().toByteArray(Charsets.UTF_8)
                out.write(b, 0, b.size)
                run.setLength(0)
            }
        }
        var i = 0
        while (i < s.length) {
            val c = s[i]
            if (c == '%') {
                if (i + 2 >= s.length) return null
                val hi = Character.digit(s[i + 1], 16)
                val lo = Character.digit(s[i + 2], 16)
                if (hi < 0 || lo < 0) return null
                flush()
                out.write(hi * 16 + lo)
                i += 3
            } else {
                run.append(c)
                i++
            }
        }
        flush()
        return out.toByteArray()
    }

    /** The file name out of a Content-Disposition header (`filename="a.csv"`, `filename*=UTF-8''a%20b.csv`), or null. */
    fun nameFromDisposition(disposition: String?): String? {
        if (disposition.isNullOrBlank()) return null
        Regex("filename\\*\\s*=\\s*[^']*'[^']*'([^;]+)", RegexOption.IGNORE_CASE).find(disposition)?.let {
            percentDecode(it.groupValues[1].trim())?.toString(Charsets.UTF_8)?.let { s -> if (s.isNotBlank()) return s }
        }
        Regex("filename\\s*=\\s*\"([^\"]*)\"", RegexOption.IGNORE_CASE).find(disposition)?.let {
            if (it.groupValues[1].isNotBlank()) return it.groupValues[1]
        }
        Regex("filename\\s*=\\s*([^;\\s]+)", RegexOption.IGNORE_CASE).find(disposition)?.let { return it.groupValues[1] }
        return null
    }
}
