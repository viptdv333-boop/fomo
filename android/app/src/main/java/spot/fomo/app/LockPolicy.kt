package spot.fomo.app

/**
 * Pure decisions of the app lock (no Android classes, so they are unit-tested on the JVM: LockPolicyTest).
 *
 * "Background" is measured with SystemClock.elapsedRealtime (monotonic, keeps counting in deep sleep, immune to the user
 * changing the clock), recorded when the LAST visible activity of the app stops, never in onPause: system dialogs,
 * permission prompts and the biometric prompt itself only pause the activity and must not lock the app.
 */
object LockPolicy {
    /** Allowed values of «Запрашивать» in minutes; 0 = right after the app goes to the background. */
    val TIMEOUT_MINUTES = listOf(0, 1, 5, 15)
    const val DEFAULT_TIMEOUT_MINUTES = 1

    /**
     * Our own trips out of the app (file chooser, camera, the system PIN screen) cover the app completely, so the
     * activity stops like for a real "leave". They get at least this long before the app locks, even for «сразу».
     */
    const val EXTERNAL_FLOW_GRACE_MS = 2L * 60 * 1000

    /** How long a "we are about to launch a system screen" mark is honoured. */
    const val EXTERNAL_FLOW_MARK_MS = 5L * 60 * 1000

    /** The stored list value ("0", "1", "5", "15") to minutes; anything unknown falls back to the default. */
    fun parseTimeoutMinutes(raw: String?): Int {
        val m = raw?.trim()?.toIntOrNull() ?: return DEFAULT_TIMEOUT_MINUTES
        return if (m in TIMEOUT_MINUTES) m else DEFAULT_TIMEOUT_MINUTES
    }

    fun timeoutMs(minutes: Int): Long = minutes.coerceAtLeast(0) * 60_000L

    /**
     * Should the app lock now that it came back to the foreground?
     * @param backgroundAtMs elapsedRealtime when the app left the foreground, or null when it did not (e.g. a rotation
     * of the settings screen recreates the activity: stop + start, but that is not leaving the app)
     * @param externalFlow the app itself sent the user to a system screen before leaving
     */
    fun shouldLock(enabled: Boolean, backgroundAtMs: Long?, nowMs: Long, timeoutMs: Long, externalFlow: Boolean): Boolean {
        if (!enabled || backgroundAtMs == null) return false
        val away = nowMs - backgroundAtMs
        if (away < 0) return true // cannot happen with a monotonic clock; if it does, fail closed
        val limit = if (externalFlow) maxOf(timeoutMs, EXTERNAL_FLOW_GRACE_MS) else timeoutMs
        return away >= limit
    }
}
