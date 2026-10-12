package spot.fomo.app

import android.app.Activity
import android.content.pm.ActivityInfo
import android.graphics.Bitmap
import android.graphics.Color
import android.view.View
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.widget.FrameLayout
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

/**
 * The standard fullscreen button of `<video controls>` (and requestFullscreen() on a video): WebChromeClient.onShowCustomView hands us the
 * view that plays the video. It goes over the whole window on a black host (decor view), the system bars are hidden, the screen may rotate
 * (sensor, also when the system rotation is locked: a video is watched sideways), and everything is put back on hide / pause / destroy.
 * Back exits it first (BackPolicy.Step.EXIT_VIDEO). The page learns about the capability from FomoApp.appFeatures().videoFullscreen.
 */
class VideoFullscreen(private val activity: Activity, private val keepBarsHidden: () -> Boolean) {

    private var host: FrameLayout? = null
    private var callback: WebChromeClient.CustomViewCallback? = null
    private var orientationBefore = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED

    val isShown: Boolean get() = host != null

    /** Returns false (and tells the WebView to forget the view) when it cannot be shown, e.g. while the app lock is up. */
    fun show(view: View, cb: WebChromeClient.CustomViewCallback, locked: Boolean): Boolean {
        if (host != null) {
            cb.onCustomViewHidden() // one at a time
            return false
        }
        if (locked) {
            cb.onCustomViewHidden()
            return false
        }
        val h = FrameLayout(activity).apply {
            setBackgroundColor(Color.BLACK)
            keepScreenOn = true
            addView(view, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        }
        (activity.window.decorView as ViewGroup).addView(h, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        host = h
        callback = cb
        orientationBefore = activity.requestedOrientation
        activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR
        bars(hidden = true)
        return true
    }

    /** Takes the video view out and restores orientation and bars; safe to call when nothing is shown. */
    fun hide() {
        val h = host ?: return
        host = null
        val cb = callback
        callback = null
        (h.parent as? ViewGroup)?.removeView(h)
        h.removeAllViews()
        activity.requestedOrientation = orientationBefore
        bars(hidden = keepBarsHidden())
        try {
            cb?.onCustomViewHidden()
        } catch (e: Exception) {
            // WebView already gone
        }
    }

    private fun bars(hidden: Boolean) {
        val controller: WindowInsetsControllerCompat = WindowCompat.getInsetsController(activity.window, activity.window.decorView)
        if (hidden) {
            controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            controller.hide(WindowInsetsCompat.Type.systemBars())
        } else {
            controller.show(WindowInsetsCompat.Type.systemBars())
        }
    }

    /** A 1x1 transparent poster: some WebView versions crash on a null default video poster. */
    fun poster(): Bitmap = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888)
}
