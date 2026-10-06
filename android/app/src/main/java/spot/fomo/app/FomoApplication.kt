package spot.fomo.app

import android.app.Application

class FomoApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // Channels must exist before a background FCM notification message arrives, so they are created at process start.
        Notifications.createChannels(this)
    }

    companion object {
        /** True while MainActivity is on screen: then the site's own bell/sockets show new messages, no system banner. */
        @Volatile
        var appVisible: Boolean = false
    }
}
