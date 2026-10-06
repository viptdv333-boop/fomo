package spot.fomo.app

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.widget.Toolbar
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

/**
 * The native settings screen (security, notifications, behaviour, updates and data). Light or dark with the system,
 * edge-to-edge, a toolbar with a back arrow. The list itself is [SettingsFragment].
 *
 * It takes part in the app lock like the page does: if the app locks while this screen is open (the owner left for a
 * while), the lock overlay covers it too.
 */
class SettingsActivity : AppCompatActivity() {

    lateinit var authenticator: Authenticator
        private set
    private lateinit var lock: LockController

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_settings)

        val root = findViewById<View>(R.id.settings_root)
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }

        setSupportActionBar(findViewById<Toolbar>(R.id.settings_toolbar))
        supportActionBar?.setDisplayHomeAsUpEnabled(true)

        if (savedInstanceState == null) {
            supportFragmentManager.beginTransaction().replace(R.id.settings_container, SettingsFragment()).commit()
        }

        authenticator = Authenticator(this)
        lock = LockController(this, root, authenticator, savedInstanceState != null) { }
    }

    override fun onResume() {
        super.onResume()
        SecureWindow.update(this)
        lock.onResume()
    }

    override fun onPause() {
        SecureWindow.update(this, pausing = true)
        super.onPause()
    }

    override fun onDestroy() {
        lock.onDestroy()
        super.onDestroy()
    }

    override fun onSupportNavigateUp(): Boolean {
        finish()
        return true
    }

    companion object {
        fun open(context: Context) {
            context.startActivity(Intent(context, SettingsActivity::class.java))
        }
    }
}
