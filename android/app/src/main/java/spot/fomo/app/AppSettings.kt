package spot.fomo.app

import android.content.Context
import android.content.SharedPreferences

/** Typed access to the app settings (SharedPreferences "app_settings"). */
object AppSettings {
    fun prefs(context: Context): SharedPreferences =
        context.applicationContext.getSharedPreferences(SettingsSpec.PREFS_NAME, Context.MODE_PRIVATE)

    fun lockEnabled(context: Context): Boolean =
        prefs(context).getBoolean(SettingsSpec.KEY_LOCK_ENABLED, SettingsSpec.DEFAULT_LOCK_ENABLED)

    fun setLockEnabled(context: Context, enabled: Boolean) {
        prefs(context).edit().putBoolean(SettingsSpec.KEY_LOCK_ENABLED, enabled).apply()
    }

    fun lockTimeoutMinutes(context: Context): Int =
        LockPolicy.parseTimeoutMinutes(prefs(context).getString(SettingsSpec.KEY_LOCK_TIMEOUT, SettingsSpec.DEFAULT_LOCK_TIMEOUT))

    fun hideContent(context: Context): Boolean =
        prefs(context).getBoolean(SettingsSpec.KEY_HIDE_CONTENT, SettingsSpec.DEFAULT_HIDE_CONTENT)

    fun pullToRefresh(context: Context): Boolean =
        prefs(context).getBoolean(SettingsSpec.KEY_PULL_TO_REFRESH, SettingsSpec.DEFAULT_PULL_TO_REFRESH)

    fun keepScreenOnInTerminal(context: Context): Boolean =
        prefs(context).getBoolean(SettingsSpec.KEY_KEEP_SCREEN_ON, SettingsSpec.DEFAULT_KEEP_SCREEN_ON)

    fun haptic(context: Context): Boolean =
        prefs(context).getBoolean(SettingsSpec.KEY_HAPTIC, SettingsSpec.DEFAULT_HAPTIC)
}
