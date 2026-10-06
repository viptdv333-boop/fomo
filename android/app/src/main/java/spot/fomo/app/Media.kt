package spot.fomo.app

import android.content.ClipboardManager
import android.content.Context
import android.graphics.BitmapFactory
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Base64
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.util.Locale
import kotlin.math.max

/** One file on its way into the page: bytes plus a display name and MIME type. */
class FilePayload(val name: String, val type: String, val bytes: ByteArray) {
    /** {name,type,dataBase64} — what the site's fileFromNativePayload() (src/lib/native-app.ts) expects. */
    fun toJson(): JSONObject = JSONObject()
        .put("name", name)
        .put("type", type)
        .put("dataBase64", Base64.encodeToString(bytes, Base64.NO_WRAP))
}

/** Reading content Uris (clipboard, keyboard, share sheet) with size limits and safe naming. */
object Media {
    /** Anything bigger is rejected: base64 inflates it by a third and it all passes through one JS string. */
    const val MAX_BYTES = 8 * 1024 * 1024

    /** Raster images above this are re-encoded (downscaled JPEG) before they are sent to the page. */
    private const val SHRINK_ABOVE_BYTES = 2_500_000
    private const val MAX_IMAGE_SIDE = 2560

    val IMAGE_MIME_TYPES = arrayOf("image/png", "image/jpeg", "image/gif", "image/webp")

    private val MIME_RE = Regex("^[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*$")

    /**
     * Reads a content:// Uri. Returns null for anything that is not a content Uri (file:// would let another app point
     * us at our own private files), for unreadable or oversized data. Must be called off the main thread.
     */
    fun read(context: Context, uri: Uri, hintedType: String? = null): FilePayload? {
        if (uri.scheme != "content") return null
        return try {
            val resolver = context.contentResolver
            val type = (hintedType ?: resolver.getType(uri) ?: "application/octet-stream").lowercase(Locale.ROOT).substringBefore(';').trim()
            if (!MIME_RE.matches(type)) return null
            val bytes = resolver.openInputStream(uri)?.use { input ->
                val out = ByteArrayOutputStream()
                val buf = ByteArray(16 * 1024)
                var total = 0
                while (true) {
                    val n = input.read(buf)
                    if (n < 0) break
                    total += n
                    if (total > MAX_BYTES) return null
                    out.write(buf, 0, n)
                }
                out.toByteArray()
            } ?: return null
            if (bytes.isEmpty()) return null
            val name = displayName(context, uri, type)
            shrinkIfLarge(FilePayload(name, type, bytes))
        } catch (e: Exception) {
            null
        }
    }

    private fun displayName(context: Context, uri: Uri, type: String): String {
        var name: String? = null
        try {
            context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
                if (c.moveToFirst()) name = c.getString(0)
            }
        } catch (e: Exception) {
            // some providers refuse queries; the fallback below is enough
        }
        val raw = name ?: uri.lastPathSegment ?: "file"
        val clean = raw.substringAfterLast('/').substringAfterLast('\\').filter { it.code >= 0x20 && it.code != 0x7f }.trim().take(120)
        return clean.ifEmpty { "file" }
    }

    /** PNG/JPEG/WebP screenshots straight from a modern phone can be several MB: shrink to <= 2560 px JPEG when that helps. */
    private fun shrinkIfLarge(p: FilePayload): FilePayload {
        if (p.bytes.size <= SHRINK_ABOVE_BYTES) return p
        if (p.type != "image/png" && p.type != "image/jpeg" && p.type != "image/webp") return p
        return try {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(p.bytes, 0, p.bytes.size, bounds)
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return p
            var sample = 1
            while (max(bounds.outWidth, bounds.outHeight) / sample > MAX_IMAGE_SIDE) sample *= 2
            val bmp = BitmapFactory.decodeByteArray(p.bytes, 0, p.bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
                ?: return p
            val out = ByteArrayOutputStream()
            bmp.compress(android.graphics.Bitmap.CompressFormat.JPEG, 85, out)
            bmp.recycle()
            if (out.size() >= p.bytes.size) p else FilePayload(withExtension(p.name, "jpg"), "image/jpeg", out.toByteArray())
        } catch (e: Throwable) {
            p // OutOfMemoryError etc.: send the original rather than nothing
        }
    }

    private fun withExtension(name: String, ext: String): String {
        val dot = name.lastIndexOf('.')
        return (if (dot > 0) name.substring(0, dot) else name) + "." + ext
    }

    /** The first image on the system clipboard (a content Uri the clipboard service lets us read), or null. */
    fun clipboardImage(context: Context): FilePayload? {
        return try {
            val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            val clip = cm.primaryClip ?: return null
            for (i in 0 until clip.itemCount) {
                val uri = clip.getItemAt(i).uri ?: continue
                val type = context.contentResolver.getType(uri) ?: firstImageType(clip.description) ?: continue
                if (!type.startsWith("image/")) continue
                return read(context, uri, type)
            }
            null
        } catch (e: Exception) {
            null
        }
    }

    /** Cheap check (no data read): does the primary clip advertise an image? */
    fun clipboardHasImage(context: Context): Boolean {
        return try {
            val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            val d = cm.primaryClipDescription ?: return false
            d.hasMimeType("image/*") && (cm.primaryClip?.getItemAt(0)?.uri != null)
        } catch (e: Exception) {
            false
        }
    }

    private fun firstImageType(d: android.content.ClipDescription): String? {
        for (i in 0 until d.mimeTypeCount) if (d.getMimeType(i).startsWith("image/")) return d.getMimeType(i)
        return null
    }
}
