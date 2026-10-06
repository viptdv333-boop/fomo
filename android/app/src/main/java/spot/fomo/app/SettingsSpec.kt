package spot.fomo.app

/**
 * Keys and defaults of the native settings screen (res/xml/settings.xml uses the same keys and defaults; SettingsSpecTest
 * checks that the two stay in sync). Pure Kotlin on purpose. Nothing secret is ever stored here.
 */
object SettingsSpec {
    const val PREFS_NAME = "app_settings"

    const val KEY_LOCK_ENABLED = "lock_enabled"
    const val KEY_LOCK_TIMEOUT = "lock_timeout"
    const val KEY_HIDE_CONTENT = "hide_content"
    const val KEY_PULL_TO_REFRESH = "pull_to_refresh"
    const val KEY_KEEP_SCREEN_ON = "keep_screen_on_terminal"
    const val KEY_HAPTIC = "haptic_feedback"

    const val DEFAULT_LOCK_ENABLED = false
    const val DEFAULT_LOCK_TIMEOUT = "15" // minutes, see LockPolicy.TIMEOUT_MINUTES
    const val DEFAULT_HIDE_CONTENT = false
    const val DEFAULT_PULL_TO_REFRESH = true
    const val DEFAULT_KEEP_SCREEN_ON = false // opt-in: a screen that never sleeps is a battery decision
    const val DEFAULT_HAPTIC = true
}
