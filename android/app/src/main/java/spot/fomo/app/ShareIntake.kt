package spot.fomo.app

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.IntentCompat

/** What the system Share sheet handed to the app ("Share to FOMO"). */
class SharedContent(val text: String, val title: String, val files: List<FilePayload>) {
    val isEmpty: Boolean get() = text.isBlank() && title.isBlank() && files.isEmpty()
}

object ShareIntake {
    const val MAX_FILES = 5
    private const val MAX_TOTAL_BYTES = 16 * 1024 * 1024
    private const val MAX_TEXT = 8000

    fun isShare(intent: Intent?): Boolean =
        intent?.action == Intent.ACTION_SEND || intent?.action == Intent.ACTION_SEND_MULTIPLE

    /** Reads the text and the shared files (capped in count and size). Must run off the main thread. */
    fun read(context: Context, intent: Intent): SharedContent {
        val text = (intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString() ?: "").take(MAX_TEXT)
        val title = (intent.getCharSequenceExtra(Intent.EXTRA_SUBJECT)?.toString()
            ?: intent.getCharSequenceExtra(Intent.EXTRA_TITLE)?.toString() ?: "").take(300)

        val uris = ArrayList<Uri>()
        if (intent.action == Intent.ACTION_SEND_MULTIPLE) {
            IntentCompat.getParcelableArrayListExtra(intent, Intent.EXTRA_STREAM, Uri::class.java)?.let { uris.addAll(it) }
        } else {
            IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java)?.let { uris.add(it) }
        }

        val files = ArrayList<FilePayload>()
        var total = 0
        for (uri in uris.take(MAX_FILES)) {
            // Media.read accepts content:// only and enforces the per-file limit
            val f = Media.read(context, uri, intent.type?.takeIf { uris.size == 1 && !it.contains('*') }) ?: continue
            if (total + f.bytes.size > MAX_TOTAL_BYTES) break
            total += f.bytes.size
            files.add(f)
        }
        return SharedContent(text, title, files)
    }
}
