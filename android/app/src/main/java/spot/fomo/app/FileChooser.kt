package spot.fomo.app

import android.Manifest
import android.app.Activity
import android.content.ClipData
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.MediaStore
import android.webkit.MimeTypeMap
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.widget.Toast
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import java.io.File

/**
 * <input type="file"> support (WebChromeClient.onShowFileChooser): one system chooser that offers the camera (photo into a
 * FileProvider temp file), the gallery / document picker (images, video, files — accept= honoured, multiple allowed).
 * The CAMERA permission is asked for only at the moment a chooser that can use the camera is about to open.
 *
 * MainActivity owns the ActivityResult launchers (they must be registered before the activity starts) and calls
 * [onCameraPermissionResult] / [onResult].
 */
class FileChooser(private val activity: MainActivity) {
    private var callback: ValueCallback<Array<Uri>>? = null
    private var params: WebChromeClient.FileChooserParams? = null
    private var cameraFile: File? = null

    fun show(cb: ValueCallback<Array<Uri>>, p: WebChromeClient.FileChooserParams): Boolean {
        cancel()
        callback = cb
        params = p
        val cameraUseful = acceptsImages(p)
        val hasCamera = ContextCompat.checkSelfPermission(activity, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        if (cameraUseful && !hasCamera) {
            // continue in onCameraPermissionResult(); a refusal still opens the chooser, just without the camera entry
            activity.requestCameraForChooser()
        } else {
            launch(cameraUseful && hasCamera)
        }
        return true
    }

    fun onCameraPermissionResult(granted: Boolean) {
        if (callback == null) return
        if (!granted) Toast.makeText(activity, R.string.camera_denied, Toast.LENGTH_SHORT).show()
        launch(granted)
    }

    fun onResult(resultCode: Int, data: Intent?) {
        val cb = callback ?: return
        callback = null
        var result: Array<Uri>? = null
        if (resultCode == Activity.RESULT_OK) {
            val list = ArrayList<Uri>()
            val clip = data?.clipData
            if (clip != null) {
                for (i in 0 until clip.itemCount) clip.getItemAt(i).uri?.let { list.add(it) }
            }
            data?.data?.let { if (!list.contains(it)) list.add(it) }
            if (list.isEmpty()) {
                // the camera app writes the photo to our temp file and often returns no data at all
                cameraFile?.takeIf { it.exists() && it.length() > 0 }?.let { list.add(uriFor(it)) }
            }
            if (list.isNotEmpty()) result = list.toTypedArray()
        }
        if (result == null || !isCameraUri(result)) cameraFile?.let { if (it.length() == 0L) it.delete() }
        cameraFile = null
        cb.onReceiveValue(result)
    }

    /** The page went away or a new chooser is opening: the old callback must still be answered (with "nothing"). */
    fun cancel() {
        callback?.onReceiveValue(null)
        callback = null
        cameraFile = null
    }

    private fun isCameraUri(uris: Array<Uri>): Boolean = cameraFile?.let { f -> uris.any { it == uriFor(f) } } ?: false

    private fun launch(withCamera: Boolean) {
        val p = params ?: return
        val camera = if (withCamera) cameraIntent() else null

        // <input capture>: straight into the camera, no chooser
        if (p.isCaptureEnabled && camera != null && acceptsOnlyImages(p)) {
            start(camera)
            return
        }

        val mimes = acceptedMimeTypes(p)
        val content = Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE)
        when {
            mimes.size == 1 -> content.type = mimes[0]
            mimes.size > 1 -> {
                content.type = "*/*"
                content.putExtra(Intent.EXTRA_MIME_TYPES, mimes.toTypedArray())
            }
            else -> content.type = "*/*"
        }
        content.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, p.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE)

        val title = p.title?.toString()?.takeIf { it.isNotBlank() } ?: activity.getString(R.string.chooser_title)
        val chooser = Intent.createChooser(content, title)
        if (camera != null) chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, arrayOf(camera))
        start(chooser)
    }

    private fun start(intent: Intent) {
        try {
            activity.launchFileChooser(intent)
        } catch (e: Exception) {
            onResult(Activity.RESULT_CANCELED, null)
        }
    }

    private fun cameraIntent(): Intent? {
        val capture = Intent(MediaStore.ACTION_IMAGE_CAPTURE)
        if (capture.resolveActivity(activity.packageManager) == null) return null
        return try {
            val dir = File(activity.cacheDir, "captures").apply { mkdirs() }
            // temp photos from earlier sessions are not needed any more
            dir.listFiles()?.forEach { if (System.currentTimeMillis() - it.lastModified() > 24 * 3600 * 1000L) it.delete() }
            val file = File.createTempFile("IMG_", ".jpg", dir)
            cameraFile = file
            val uri = uriFor(file)
            capture.putExtra(MediaStore.EXTRA_OUTPUT, uri)
            capture.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
            capture.clipData = ClipData.newRawUri("", uri)
            capture
        } catch (e: Exception) {
            null
        }
    }

    private fun uriFor(file: File): Uri = FileProvider.getUriForFile(activity, activity.packageName + ".fileprovider", file)

    /** An accept attribute such as image-wildcard plus .pdf becomes a MIME list; extensions are mapped to MIME types, unknown ones dropped. */
    private fun acceptedMimeTypes(p: WebChromeClient.FileChooserParams): List<String> {
        val out = LinkedHashSet<String>()
        for (raw in p.acceptTypes ?: emptyArray()) {
            for (part in raw.split(',')) {
                val t = part.trim().lowercase()
                when {
                    t.isEmpty() -> Unit
                    t.contains('/') -> out.add(t)
                    t.startsWith(".") -> MimeTypeMap.getSingleton().getMimeTypeFromExtension(t.substring(1))?.let { out.add(it) }
                }
            }
        }
        if (out.contains("*/*")) return emptyList()
        return out.toList()
    }

    private fun acceptsImages(p: WebChromeClient.FileChooserParams): Boolean {
        val m = acceptedMimeTypes(p)
        return m.isEmpty() || m.any { it.startsWith("image/") }
    }

    private fun acceptsOnlyImages(p: WebChromeClient.FileChooserParams): Boolean {
        val m = acceptedMimeTypes(p)
        return m.isNotEmpty() && m.all { it.startsWith("image/") }
    }
}
