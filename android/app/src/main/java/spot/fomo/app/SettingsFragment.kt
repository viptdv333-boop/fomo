package spot.fomo.app

import android.Manifest
import android.app.NotificationManager
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.media.RingtoneManager
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.preference.Preference
import androidx.preference.PreferenceFragmentCompat
import androidx.preference.SwitchPreferenceCompat
import java.io.File

/** The list of the native settings screen (res/xml/settings.xml). Values live in SharedPreferences "app_settings". */
class SettingsFragment : PreferenceFragmentCompat() {

    /** Preference key -> notification channel id (the ids are fixed forever, see Notifications.createChannels). */
    private val channelKeys = linkedMapOf(
        "ch_messages" to Notifications.CH_MESSAGES,
        "ch_terminal" to Notifications.CH_TERMINAL,
        "ch_calendar" to Notifications.CH_CALENDAR,
        "ch_general" to Notifications.CH_GENERAL,
    )

    private val notificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            refreshNotifications()
            if (granted) {
                PushBridge.fetchToken(requireContext())
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                !shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS)
            ) {
                // "Don't ask again": the only way left is the system screen
                openAppNotificationSettings()
            }
        }

    private val settingsActivity: SettingsActivity get() = requireActivity() as SettingsActivity

    override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
        preferenceManager.sharedPreferencesName = SettingsSpec.PREFS_NAME
        setPreferencesFromResource(R.xml.settings, rootKey)
        setupSecurity()
        setupNotifications()
        setupData()
    }

    override fun onResume() {
        super.onResume()
        refreshSecurity()
        refreshNotifications()
    }

    private fun pref(key: String): Preference = findPreference(key)!!

    // ---- security ----------------------------------------------------------------------------------------------------

    private fun setupSecurity() {
        val lock = pref(SettingsSpec.KEY_LOCK_ENABLED) as SwitchPreferenceCompat
        // Turning the lock on or off needs a successful prompt: refuse the toggle now, apply it after authentication.
        lock.setOnPreferenceChangeListener { _, newValue ->
            confirmLockChange(newValue as Boolean)
            false
        }
        pref(SettingsSpec.KEY_HIDE_CONTENT).setOnPreferenceChangeListener { _, _ ->
            // applied right after the value is stored
            view?.post { activity?.let { SecureWindow.update(it) } }
            true
        }
    }

    private fun confirmLockChange(enable: Boolean) {
        val ctx = requireContext()
        settingsActivity.authenticator.authenticate(
            title = getString(if (enable) R.string.lock_enable_title else R.string.lock_disable_title),
            subtitle = getString(R.string.lock_confirm_subtitle),
            cancelText = getString(R.string.cancel),
            credentialText = getString(R.string.lock_use_pin),
        ) { result, message ->
            if (!isAdded) return@authenticate
            when (result) {
                AuthResult.SUCCESS -> {
                    (pref(SettingsSpec.KEY_LOCK_ENABLED) as SwitchPreferenceCompat).isChecked = enable
                    if (enable) AppLock.unlock() else AppLock.onSettingChanged()
                    Toast.makeText(ctx, if (enable) R.string.lock_enabled_toast else R.string.lock_disabled_toast, Toast.LENGTH_SHORT).show()
                }
                AuthResult.CANCELLED -> Unit
                AuthResult.LOCKED_OUT, AuthResult.ERROR ->
                    Toast.makeText(ctx, message ?: getString(R.string.lock_error), Toast.LENGTH_LONG).show()
                AuthResult.UNAVAILABLE -> refreshSecurity()
            }
        }
    }

    /** The switch is usable only when the device can ask for a biometric / PIN; a lock that can no longer be asked for is cleared. */
    private fun refreshSecurity() {
        val ctx = context ?: return
        val lock = pref(SettingsSpec.KEY_LOCK_ENABLED) as SwitchPreferenceCompat
        if (Authenticator.isAvailable(ctx)) {
            lock.isEnabled = true
            lock.summary = getString(R.string.settings_lock_summary)
        } else {
            lock.isEnabled = false
            lock.summary = getString(R.string.settings_lock_unavailable)
            if (lock.isChecked) {
                lock.isChecked = false
                AppLock.onSettingChanged()
            }
        }
    }

    // ---- notifications -----------------------------------------------------------------------------------------------

    private fun setupNotifications() {
        pref("notif_permission").setOnPreferenceClickListener {
            val ctx = requireContext()
            val enabled = NotificationManagerCompat.from(ctx).areNotificationsEnabled()
            if (!enabled && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
            ) {
                notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
            } else {
                openAppNotificationSettings()
            }
            true
        }
        for ((key, id) in channelKeys) {
            pref(key).setOnPreferenceClickListener {
                openChannelSettings(id)
                true
            }
        }
        pref("notif_test").setOnPreferenceClickListener {
            sendTestNotification()
            true
        }
        pref("notif_site").setOnPreferenceClickListener {
            // MainActivity is singleTask: it comes to the front, the settings screen above it is closed
            startActivity(
                Intent(requireContext(), MainActivity::class.java)
                    .putExtra(Notifications.EXTRA_LINK, "/profile?tab=notifications")
                    .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            )
            true
        }
    }

    private fun refreshNotifications() {
        val ctx = context ?: return
        val enabled = NotificationManagerCompat.from(ctx).areNotificationsEnabled()
        pref("notif_permission").summary = getString(if (enabled) R.string.settings_notif_on else R.string.settings_notif_off)
        for ((key, id) in channelKeys) pref(key).summary = describeChannel(id)
    }

    /** "Importance: high · Sound: Pixie Dust · Vibration: on", read from the system, which owns these values. */
    private fun describeChannel(id: String): String {
        val ctx = requireContext()
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return getString(R.string.channel_summary_legacy)
        val nm = ctx.getSystemService(NotificationManager::class.java)
        val channel = nm.getNotificationChannel(id) ?: return getString(R.string.channel_summary_missing)
        if (channel.importance == NotificationManager.IMPORTANCE_NONE) return getString(R.string.channel_summary_off)
        val importance = when {
            channel.importance >= NotificationManager.IMPORTANCE_HIGH -> R.string.importance_high
            channel.importance >= NotificationManager.IMPORTANCE_DEFAULT -> R.string.importance_default
            else -> R.string.importance_low
        }
        val sound = channel.sound
        val soundText = when {
            sound == null || channel.importance < NotificationManager.IMPORTANCE_DEFAULT -> getString(R.string.sound_off)
            else -> melodyTitle(sound) ?: getString(R.string.sound_on)
        }
        val vibration = if (channel.shouldVibrate()) R.string.vibration_on else R.string.vibration_off
        return getString(R.string.channel_summary, getString(importance), soundText, getString(vibration))
    }

    private fun melodyTitle(uri: android.net.Uri): String? = try {
        RingtoneManager.getRingtone(requireContext(), uri)?.getTitle(requireContext())?.takeIf { it.isNotBlank() }?.take(40)
    } catch (e: Exception) {
        null // a custom file we may not read: "on" is enough
    }

    private fun sendTestNotification() {
        val ctx = requireContext()
        if (!NotificationManagerCompat.from(ctx).areNotificationsEnabled()) {
            Toast.makeText(ctx, R.string.settings_notif_test_disabled, Toast.LENGTH_LONG).show()
            return
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = ctx.getSystemService(NotificationManager::class.java).getNotificationChannel(Notifications.CH_TERMINAL)
            if (channel != null && channel.importance == NotificationManager.IMPORTANCE_NONE) {
                Toast.makeText(ctx, R.string.settings_notif_test_channel_off, Toast.LENGTH_LONG).show()
                return
            }
        }
        Notifications.showTest(ctx)
    }

    /** The system screen of ONE channel: here the owner picks the melody, vibration and importance. */
    private fun openChannelSettings(channelId: String) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            openAppNotificationSettings()
            return
        }
        launch(
            Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, requireContext().packageName)
                .putExtra(Settings.EXTRA_CHANNEL_ID, channelId)
        )
    }

    private fun openAppNotificationSettings() {
        launch(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, requireContext().packageName))
    }

    private fun launch(intent: Intent) {
        try {
            startActivity(intent)
        } catch (e: ActivityNotFoundException) {
            // some OEM builds lack the per-channel screen: the app-level one always exists
            try {
                startActivity(
                    Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                        .setData(android.net.Uri.fromParts("package", requireContext().packageName, null))
                )
            } catch (e2: ActivityNotFoundException) {
                // nothing to open
            }
        }
    }

    // ---- updates and data --------------------------------------------------------------------------------------------

    private fun setupData() {
        pref("app_version").summary = BuildConfig.VERSION_NAME + " (" + BuildConfig.VERSION_CODE + ")" + if (BuildConfig.DEBUG) " debug" else ""

        pref("check_update").setOnPreferenceClickListener { p ->
            p.summary = getString(R.string.settings_checking)
            UpdateChecker.checkNow { result ->
                if (!isAdded) return@checkNow
                when (result) {
                    is UpdateChecker.Result.UpToDate -> p.summary = getString(R.string.settings_up_to_date)
                    is UpdateChecker.Result.Failed -> p.summary = getString(R.string.settings_update_failed)
                    is UpdateChecker.Result.Available -> {
                        p.summary = getString(R.string.settings_update_available, result.info.versionName)
                        UpdateChecker.showDialog(requireActivity(), result.info)
                    }
                }
            }
            true
        }

        pref("clear_cache").setOnPreferenceClickListener {
            clearCache()
            true
        }

        pref("logout").setOnPreferenceClickListener {
            AlertDialog.Builder(requireActivity())
                .setTitle(R.string.settings_logout_confirm_title)
                .setMessage(R.string.settings_logout_confirm_message)
                .setPositiveButton(R.string.settings_logout_confirm_yes) { _, _ -> AccountLogout.run(requireActivity()) }
                .setNegativeButton(R.string.cancel, null)
                .show()
            true
        }

        pref("about").setOnPreferenceClickListener {
            AlertDialog.Builder(requireActivity())
                .setTitle(R.string.settings_about)
                .setMessage(getString(R.string.settings_about_message, BuildConfig.VERSION_NAME, BuildConfig.VERSION_CODE.toString(), BuildConfig.BASE_URL))
                .setPositiveButton(R.string.settings_about_site) { _, _ -> ExternalLinks.open(requireActivity(), BuildConfig.BASE_URL) }
                .setNegativeButton(R.string.settings_close, null)
                .show()
            true
        }
    }

    /** WebView HTTP cache (shared by the whole process) and the temporary camera photos. Cookies and local storage stay. */
    private fun clearCache() {
        val ctx = requireContext().applicationContext
        try {
            val web = WebView(ctx)
            web.clearCache(true)
            web.destroy()
        } catch (e: Exception) {
            // WebView unavailable (being updated): the file part below still runs
        }
        File(ctx.cacheDir, "captures").deleteRecursively()
        Toast.makeText(ctx, R.string.settings_cache_cleared, Toast.LENGTH_SHORT).show()
    }
}
