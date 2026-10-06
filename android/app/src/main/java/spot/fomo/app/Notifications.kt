package spot.fomo.app

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

/** Notification channels («Сообщения», «Алерты терминала», «Календарь», «Прочее») and showing a push as a notification. */
object Notifications {
    const val CH_MESSAGES = "messages"
    const val CH_TERMINAL = "terminal"
    const val CH_CALENDAR = "calendar"
    const val CH_GENERAL = "general"

    /** Intent extra carrying the same-origin path to open when the notification is tapped (FCM puts data keys there too). */
    const val EXTRA_LINK = "link"

    /** Every channel id the app owns, in the order of the settings screen. */
    val ALL_CHANNELS = listOf(CH_MESSAGES, CH_TERMINAL, CH_CALENDAR, CH_GENERAL)

    /**
     * Creates the channels (safe to call on every start).
     *
     * IMPORTANT: Android treats a channel as owned by the user after the first creation. Calling this again with another
     * importance, sound or vibration changes NOTHING on phones that already have the channel (only the name and the
     * description are updated). The owner picks the melody, vibration and importance per channel in the system screen
     * (Settings -> «Уведомления» of the app, opened from the app settings). To really change a default for everybody a
     * NEW channel id would be needed — so keep these ids stable and never rename them.
     */
    fun createChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        val soundAttrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        fun channel(id: String, name: Int, desc: Int, importance: Int) {
            val c = NotificationChannel(id, context.getString(name), importance)
            c.description = context.getString(desc)
            c.setSound(sound, soundAttrs) // the default notification melody, changeable per channel by the owner
            c.enableVibration(true)
            c.setShowBadge(true)
            nm.createNotificationChannel(c)
        }
        channel(CH_MESSAGES, R.string.channel_messages, R.string.channel_messages_desc, NotificationManager.IMPORTANCE_HIGH)
        channel(CH_TERMINAL, R.string.channel_terminal, R.string.channel_terminal_desc, NotificationManager.IMPORTANCE_HIGH)
        channel(CH_CALENDAR, R.string.channel_calendar, R.string.channel_calendar_desc, NotificationManager.IMPORTANCE_DEFAULT)
        channel(CH_GENERAL, R.string.channel_general, R.string.channel_general_desc, NotificationManager.IMPORTANCE_DEFAULT)
    }

    /** Server sends data.channel (see src/lib/fcm.ts androidChannelFor); fall back to the event/type for older payloads. */
    fun channelFor(data: Map<String, String>): String {
        val declared = data["channel"]
        if (declared != null && declared in setOf(CH_MESSAGES, CH_TERMINAL, CH_CALENDAR, CH_GENERAL)) return declared
        return when (data["event"] ?: data["type"]) {
            "dm", "chat_room_message", "room_join", "mention", "quote_me", "new_message", "chat_mention", "chat_reply" -> CH_MESSAGES
            "price_alert", "line_alert" -> CH_TERMINAL
            "calendar_reminder" -> CH_CALENDAR
            else -> CH_GENERAL
        }
    }

    fun show(context: Context, title: String, body: String, channel: String, link: String?, tag: String?) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return

        val open = Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val safeLink = UrlPolicy.sameOriginPath(link)
        if (safeLink != null) open.putExtra(EXTRA_LINK, safeLink)
        val requestCode = ((tag ?: "") + (safeLink ?: "") + channel).hashCode()
        val pending = PendingIntent.getActivity(context, requestCode, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

        val n = NotificationCompat.Builder(context, channel)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(ContextCompat.getColor(context, R.color.fomo_green))
            .setContentTitle(title.ifBlank { context.getString(R.string.app_name) })
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(pending)
            .setPriority(if (channel == CH_MESSAGES || channel == CH_TERMINAL) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(if (channel == CH_MESSAGES) NotificationCompat.CATEGORY_MESSAGE else NotificationCompat.CATEGORY_EVENT)
            // Android 7.x has no channels: sound and vibration come from here. On 8+ the channel decides and this is ignored.
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .build()

        try {
            // same tag = the newer notification replaces the older one (the server collapses by tag too)
            NotificationManagerCompat.from(context).notify(tag, 1, n)
        } catch (e: SecurityException) {
            // permission revoked between the check and the call
        }
    }

    /** «Тестовое уведомление» from the settings screen: a local notification on the terminal-alerts channel. */
    fun showTest(context: Context) {
        show(
            context,
            context.getString(R.string.test_notification_title),
            context.getString(R.string.test_notification_body),
            CH_TERMINAL,
            "/profile?tab=notifications",
            "fomo-test",
        )
    }
}
