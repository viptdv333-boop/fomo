package spot.fomo.app

import android.content.Context
import android.os.Build
import android.util.AttributeSet
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import android.webkit.WebView
import androidx.core.view.inputmethod.EditorInfoCompat
import androidx.core.view.inputmethod.InputConnectionCompat
import androidx.core.view.inputmethod.InputContentInfoCompat

/**
 * WebView that accepts images from the keyboard (Gboard clipboard / stickers / GIFs). Chrome on Android does not
 * deliver them to web fields; here the keyboard is told the field takes image content, and the committed image is
 * handed to [onImageCommit] (MainActivity reads it and passes it to the page as a "fomo-native-paste" event).
 */
class FomoWebView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : WebView(context, attrs) {

    /** Called on the main thread with the committed content; the permission to read it is already requested. */
    var onImageCommit: ((InputContentInfoCompat) -> Unit)? = null

    override fun onCreateInputConnection(outAttrs: EditorInfo): InputConnection? {
        val connection = super.onCreateInputConnection(outAttrs) ?: return null
        // After super(): Chromium fills outAttrs itself, we only add the accepted MIME types.
        EditorInfoCompat.setContentMimeTypes(outAttrs, Media.IMAGE_MIME_TYPES)
        val listener = InputConnectionCompat.OnCommitContentListener { info, flags, _ ->
            val handler = onImageCommit
            if (handler == null) {
                false
            } else {
                val needsPermission = Build.VERSION.SDK_INT >= Build.VERSION_CODES.N_MR1 &&
                    (flags and InputConnectionCompat.INPUT_CONTENT_GRANT_READ_URI_PERMISSION) != 0
                val granted = try {
                    if (needsPermission) info.requestPermission()
                    true
                } catch (e: Exception) {
                    false
                }
                if (granted) handler(info)
                granted
            }
        }
        return InputConnectionCompat.createWrapper(connection, outAttrs, listener)
    }
}
