package spot.fomo.app

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.webkit.MimeTypeMap
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.OutputStream
import java.util.UUID

/**
 * Writes a file the page produced (CSV of candles, chart PNG ...) into the user's Downloads.
 *
 *  - Android 10+: MediaStore.Downloads with IS_PENDING (the file is invisible until it is complete), needs no permission.
 *  - Android 7-9: the app's own external Downloads folder (Android/data/<package>/files/Download), as DownloadManager downloads do here
 *    (the public folder would need WRITE_EXTERNAL_STORAGE).
 *
 * Files arrive in chunks ([begin] / [write] / [finish]) so a multi-megabyte CSV never has to cross the WebView bridge as one string;
 * [saveBytes] is the one-shot form. Thread-safe (bridge calls come from a background thread).
 */
class FileSaver(private val context: Context) {

    /** [code] is "ok" or a short error code; [name] the final file name; [token] the open session (begin only). */
    class Result(val code: String, val name: String = "", val token: String = "") {
        val ok get() = code == "ok"
    }

    private class Session(val out: OutputStream, val uri: Uri?, val file: File?, var name: String, val mime: String) {
        var written = 0L
        val started = System.currentTimeMillis()
    }

    private val sessions = HashMap<String, Session>()

    /** True when the file ends up in the public Downloads folder (Android 10+); false = the app's own Downloads folder. */
    val publicFolder: Boolean get() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q

    @Synchronized
    fun begin(rawName: String?, rawMime: String?): Result {
        purgeStale()
        if (sessions.size >= MAX_SESSIONS) return Result("busy")
        var mime = SaveFilePolicy.normalizeMime(rawMime)
        val name = SaveFilePolicy.sanitizeName(rawName, mime)
        if (SaveFilePolicy.isBlocked(name)) return Result("blocked_type")
        if (mime == SaveFilePolicy.DEFAULT_MIME) {
            MimeTypeMap.getSingleton().getMimeTypeFromExtension(SaveFilePolicy.extensionOf(name))?.let { mime = it }
        }
        return try {
            val s = if (publicFolder) openMediaStore(name, mime) else openAppFolder(name, mime)
            val token = UUID.randomUUID().toString()
            sessions[token] = s
            Result("ok", s.name, token)
        } catch (e: IOException) {
            Result("io")
        } catch (e: RuntimeException) { // SecurityException / IllegalStateException from the provider
            Result("io")
        }
    }

    /** Appends one base64 chunk (length a multiple of 4, so every chunk decodes on its own). On any error the session is dropped and the half file deleted. */
    @Synchronized
    fun write(token: String?, base64: String?): Result {
        val s = sessions[token ?: ""] ?: return Result("no_session")
        if (base64.isNullOrEmpty()) return Result("ok", s.name)
        if (base64.length % 4 != 0) {
            discard(token!!, s)
            return Result("bad_chunk")
        }
        return try {
            val bytes = Base64.decode(base64, Base64.DEFAULT)
            if (s.written + bytes.size > SaveFilePolicy.MAX_BYTES) {
                discard(token!!, s)
                return Result("too_large")
            }
            s.out.write(bytes)
            s.written += bytes.size
            Result("ok", s.name)
        } catch (e: IllegalArgumentException) {
            discard(token!!, s)
            Result("bad_chunk")
        } catch (e: IOException) {
            discard(token!!, s)
            Result("io")
        }
    }

    /** Closes the file and makes it visible. [Result.name] is the name it really got (MediaStore may add " (1)"). */
    @Synchronized
    fun finish(token: String?): Result {
        val s = sessions.remove(token ?: "") ?: return Result("no_session")
        return try {
            s.out.flush()
            s.out.close()
            var name = s.name
            if (s.uri != null) {
                val resolver = context.contentResolver
                resolver.update(s.uri, ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }, null, null)
                resolver.query(s.uri, arrayOf(MediaStore.MediaColumns.DISPLAY_NAME), null, null, null)?.use { c ->
                    if (c.moveToFirst()) c.getString(0)?.takeIf { it.isNotBlank() }?.let { name = it }
                }
            }
            Result("ok", name)
        } catch (e: IOException) {
            removePartial(s)
            Result("io")
        } catch (e: RuntimeException) {
            removePartial(s)
            Result("io")
        }
    }

    /** Drops an open session and deletes what was written (the page gave up, or its read failed half way). */
    @Synchronized
    fun abort(token: String?) {
        val s = sessions.remove(token ?: "") ?: return
        removePartial(s)
    }

    /** The whole file at once (small files, data: URLs). */
    fun saveBytes(rawName: String?, rawMime: String?, bytes: ByteArray): Result {
        if (bytes.size > SaveFilePolicy.MAX_BYTES) return Result("too_large")
        val b = begin(rawName, rawMime)
        if (!b.ok) return b
        val s = synchronized(this) { sessions[b.token] } ?: return Result("no_session")
        return try {
            synchronized(this) { s.out.write(bytes); s.written += bytes.size }
            finish(b.token)
        } catch (e: IOException) {
            abort(b.token)
            Result("io")
        }
    }

    /** Base64 text -> [saveBytes]; "bad_base64" when it does not decode. */
    fun saveBase64(rawName: String?, rawMime: String?, base64: String): Result {
        val bytes = try {
            Base64.decode(base64, Base64.DEFAULT)
        } catch (e: IllegalArgumentException) {
            return Result("bad_base64")
        }
        return saveBytes(rawName, rawMime, bytes)
    }

    // ---- storage ----------------------------------------------------------------------------------------------------

    private fun openMediaStore(name: String, mime: String): Session {
        val values = ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, name)
            put(MediaStore.Downloads.MIME_TYPE, mime)
            put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
            put(MediaStore.Downloads.IS_PENDING, 1)
        }
        val resolver = context.contentResolver
        val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: throw IOException("insert returned null")
        val out = try {
            resolver.openOutputStream(uri) ?: throw IOException("no output stream")
        } catch (e: Exception) {
            runCatching { resolver.delete(uri, null, null) }
            throw if (e is IOException) e else IOException(e)
        }
        return Session(out, uri, null, name, mime)
    }

    private fun openAppFolder(name: String, mime: String): Session {
        val dir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: throw IOException("no external storage")
        if (!dir.exists() && !dir.mkdirs()) throw IOException("cannot create $dir")
        val unique = SaveFilePolicy.uniqueName(name) { File(dir, it).exists() }
        val file = File(dir, unique)
        return Session(FileOutputStream(file), null, file, unique, mime)
    }

    private fun discard(token: String, s: Session) {
        sessions.remove(token)
        removePartial(s)
    }

    private fun removePartial(s: Session) {
        runCatching { s.out.close() }
        runCatching {
            if (s.uri != null) context.contentResolver.delete(s.uri, null, null)
            s.file?.delete()
        }
    }

    /** A page that opened a file and never finished it (navigated away, crashed) must not leave a pending file behind. */
    private fun purgeStale() {
        val now = System.currentTimeMillis()
        val old = sessions.filterValues { now - it.started > STALE_MS }.keys.toList()
        for (t in old) sessions.remove(t)?.let { removePartial(it) }
    }

    companion object {
        private const val MAX_SESSIONS = 4
        private const val STALE_MS = 3 * 60 * 1000L
    }
}
