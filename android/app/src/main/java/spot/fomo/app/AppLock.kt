package spot.fomo.app

import android.app.Activity
import android.app.Application
import android.content.Context
import android.os.Bundle
import android.os.SystemClock
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Process-wide state of the app lock (biometrics / device PIN). The decision logic is in [LockPolicy]; the UI is
 * [LockController]; the prompt is [Authenticator].
 *
 *  - Cold start (or process death): the app starts locked when the lock is switched on and the device can authenticate.
 *  - Leaving: when the LAST started activity of the app stops (not for a configuration change, not in onPause), the
 *    monotonic time is remembered. Coming back, [LockPolicy.shouldLock] compares it with the configured timeout.
 *  - Moving between our own activities (the page and the settings screen) never reaches zero started activities, so it
 *    is not "leaving".
 *  - If the device loses its screen lock while the app lock is on, the lock cannot be asked for any more: it is switched
 *    off ([disableBecauseUnavailable]) instead of trapping the owner outside.
 *
 * Everything runs on the main thread (lifecycle callbacks and UI), except [isLocked] which is safe to read from anywhere.
 */
object AppLock {
    private val listeners = CopyOnWriteArrayList<() -> Unit>()
    private var appContext: Context? = null
    private var startedActivities = 0
    private var backgroundAt: Long? = null
    private var externalFlowUntil = 0L

    @Volatile
    var isLocked: Boolean = false
        private set

    /** Called once from Application.onCreate. */
    fun init(app: Application) {
        appContext = app.applicationContext
        isLocked = enforced()
        app.registerActivityLifecycleCallbacks(object : Application.ActivityLifecycleCallbacks {
            override fun onActivityStarted(activity: Activity) {
                startedActivities++
                if (startedActivities == 1) {
                    onForeground(SystemClock.elapsedRealtime())
                }
            }

            override fun onActivityStopped(activity: Activity) {
                if (startedActivities > 0) startedActivities--
                // A rotation of a non-self-handling activity is stop + start of the same screen, not leaving the app.
                if (startedActivities == 0 && !activity.isChangingConfigurations) {
                    backgroundAt = SystemClock.elapsedRealtime()
                }
            }

            override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}
            override fun onActivityResumed(activity: Activity) {}
            override fun onActivityPaused(activity: Activity) {}
            override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
            override fun onActivityDestroyed(activity: Activity) {}
        })
    }

    /** Is the lock switched on AND can the device actually ask for the credential? */
    fun enforced(): Boolean {
        val c = appContext ?: return false
        return AppSettings.lockEnabled(c) && Authenticator.isAvailable(c)
    }

    /** The app is about to send the user through a system screen (file chooser, camera, PIN screen) and will get them back. */
    fun beginExternalFlow() {
        externalFlowUntil = SystemClock.elapsedRealtime() + LockPolicy.EXTERNAL_FLOW_MARK_MS
    }

    private fun onForeground(now: Long) {
        val bg = backgroundAt ?: return // first start of the process, or a configuration change: nothing to decide
        backgroundAt = null
        val c = appContext ?: return
        val external = now <= externalFlowUntil
        externalFlowUntil = 0L
        if (isLocked) return
        val lock = LockPolicy.shouldLock(
            enabled = enforced(),
            backgroundAtMs = bg,
            nowMs = now,
            timeoutMs = LockPolicy.timeoutMs(AppSettings.lockTimeoutMinutes(c)),
            externalFlow = external,
        )
        if (lock) setLocked(true)
    }

    /** Successful authentication (also right after the owner switched the lock on). */
    fun unlock() {
        backgroundAt = null
        externalFlowUntil = 0L
        setLocked(false)
    }

    /** The lock was switched off (after authentication) or can no longer be enforced. */
    fun onSettingChanged() {
        if (!enforced()) setLocked(false)
    }

    /** The prompt reported that the device has no screen lock / biometrics any more: stop locking instead of trapping the user. */
    fun disableBecauseUnavailable() {
        appContext?.let { AppSettings.setLockEnabled(it, false) }
        unlock()
    }

    private fun setLocked(value: Boolean) {
        if (isLocked == value) return
        isLocked = value
        listeners.forEach { it() }
    }

    fun addListener(l: () -> Unit) {
        if (!listeners.contains(l)) listeners.add(l)
    }

    fun removeListener(l: () -> Unit) {
        listeners.remove(l)
    }
}
