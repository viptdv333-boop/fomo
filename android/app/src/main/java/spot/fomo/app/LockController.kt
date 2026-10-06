package spot.fomo.app

import android.app.Activity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.lifecycle.Lifecycle

/**
 * The lock screen of one activity: an opaque full-screen overlay (logo, «Приложение заблокировано», «Разблокировать»)
 * added on top of the activity content, shown while [AppLock.isLocked]. While it is shown the real content is hidden from
 * accessibility services and cannot take focus, Back sends the app to the background, and the window is FLAG_SECURE
 * (see [SecureWindow]) so the recents thumbnail shows nothing.
 *
 * MainActivity and SettingsActivity each own one; create it in onCreate after setContentView and the other back-press
 * callbacks (this one must be the most recently added to take precedence), forward onResume and onDestroy.
 *
 * [onChanged] runs whenever the locked state flips (MainActivity uses it to run deferred deep links after unlock).
 */
class LockController(
    private val activity: AppCompatActivity,
    private val contentRoot: View,
    private val authenticator: Authenticator,
    restored: Boolean,
    private val onChanged: (locked: Boolean) -> Unit,
) {
    private val overlay: View
    private val status: TextView
    private var shownLocked = false

    /** After a recreation (rotation of the settings screen) a prompt may already be on screen: do not stack another one. */
    private var skipAutoPrompt = restored

    private val listener: () -> Unit = { sync() }

    private val back = object : OnBackPressedCallback(false) {
        override fun handleOnBackPressed() {
            activity.moveTaskToBack(true)
        }
    }

    init {
        val content = activity.findViewById<ViewGroup>(android.R.id.content)
        overlay = LayoutInflater.from(activity).inflate(R.layout.view_lock, content, false)
        status = overlay.findViewById(R.id.lock_status)
        overlay.findViewById<View>(R.id.lock_unlock).setOnClickListener { requestUnlock() }
        content.addView(overlay)
        activity.onBackPressedDispatcher.addCallback(activity, back)
        AppLock.addListener(listener)
        sync()
    }

    fun onResume() {
        sync()
        if (!AppLock.isLocked) return
        if (skipAutoPrompt) {
            skipAutoPrompt = false
            return
        }
        // let the activity finish resuming (and the splash leave) before the system prompt appears
        overlay.post {
            if (activity.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) requestUnlock()
        }
    }

    fun onDestroy() {
        AppLock.removeListener(listener)
    }

    /** Shows the system prompt (fingerprint / face / device PIN) if the app is locked and none is on screen. */
    fun requestUnlock() {
        if (!AppLock.isLocked || authenticator.busy || activity.isFinishing || activity.isDestroyed) return
        status.visibility = View.GONE
        authenticator.authenticate(
            title = activity.getString(R.string.lock_prompt_title),
            subtitle = activity.getString(R.string.lock_prompt_subtitle),
            cancelText = activity.getString(R.string.cancel),
            credentialText = activity.getString(R.string.lock_use_pin),
        ) { result, message ->
            when (result) {
                AuthResult.SUCCESS -> AppLock.unlock()
                AuthResult.CANCELLED -> Unit // stay locked; the button asks again
                AuthResult.LOCKED_OUT -> showStatus(message ?: activity.getString(R.string.lock_locked_out))
                AuthResult.UNAVAILABLE -> {
                    AppLock.disableBecauseUnavailable()
                    Toast.makeText(activity, R.string.lock_unavailable_disabled, Toast.LENGTH_LONG).show()
                }
                AuthResult.ERROR -> showStatus(message ?: activity.getString(R.string.lock_error))
            }
        }
    }

    private fun showStatus(text: String) {
        status.text = text
        status.visibility = View.VISIBLE
    }

    private fun sync() {
        val locked = AppLock.isLocked
        overlay.visibility = if (locked) View.VISIBLE else View.GONE
        contentRoot.importantForAccessibility =
            if (locked) View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS else View.IMPORTANT_FOR_ACCESSIBILITY_AUTO
        (contentRoot as? ViewGroup)?.descendantFocusability =
            if (locked) ViewGroup.FOCUS_BLOCK_DESCENDANTS else ViewGroup.FOCUS_BEFORE_DESCENDANTS
        back.isEnabled = locked
        if (locked) {
            contentRoot.clearFocus()
            WindowCompat.getInsetsController(activity.window, overlay).hide(WindowInsetsCompat.Type.ime())
        }
        SecureWindow.update(activity)
        if (locked != shownLocked) {
            shownLocked = locked
            if (!locked) status.visibility = View.GONE
            onChanged(locked)
        }
    }
}

/** FLAG_SECURE: no screenshots, screen recording or recents thumbnail. */
object SecureWindow {
    /**
     * Secure when the owner asked to hide the content, while the app is locked, and — with the lock switched on — also
     * while the activity is paused: the recents thumbnail is taken as the app leaves, before any timeout could have locked it.
     */
    fun update(activity: Activity, pausing: Boolean = false) {
        val secure = AppSettings.hideContent(activity) || AppLock.isLocked || (pausing && AppSettings.lockEnabled(activity))
        val window = activity.window
        if (secure) {
            window.addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE)
        } else {
            window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE)
        }
    }
}
