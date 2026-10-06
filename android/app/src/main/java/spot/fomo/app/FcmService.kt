package spot.fomo.app

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Receives Firebase messages. The server (src/lib/fcm.ts) sends notification+data messages:
 *  - app in the background: the system shows the notification itself (channel_id is in the payload), a tap opens
 *    MainActivity with data.link as an intent extra;
 *  - app in the foreground (or a data-only message): onMessageReceived builds the notification here.
 */
class FcmService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        PushBridge.onNewToken(applicationContext, token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        val channel = Notifications.channelFor(data)
        // With the app open the site already shows new chat messages (sockets + bell); alerts and reminders still pop up.
        if (FomoApplication.appVisible && channel == Notifications.CH_MESSAGES) return

        val title = message.notification?.title ?: data["title"] ?: ""
        val body = message.notification?.body ?: data["body"] ?: ""
        if (title.isBlank() && body.isBlank()) return
        Notifications.show(applicationContext, title, body, channel, data["link"], data["tag"])
    }
}
