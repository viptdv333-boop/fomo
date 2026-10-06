package spot.fomo.app

import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat

enum class AuthResult {
    SUCCESS,

    /** The user closed the prompt (or the system cancelled it, e.g. the app went away). */
    CANCELLED,

    /** Too many wrong attempts: the system refuses for a while; the message carries its wording. */
    LOCKED_OUT,

    /** The device has no screen lock / enrolled biometrics (any more). */
    UNAVAILABLE,

    ERROR,
}

/**
 * Biometrics or the device PIN / pattern / password.
 *
 *  - Android 11+ (API 30): one BiometricPrompt with BIOMETRIC_STRONG | BIOMETRIC_WEAK | DEVICE_CREDENTIAL (the system
 *    prompt has its own "use PIN" path and handles lockouts).
 *  - Android 7-10 (API 24-29): DEVICE_CREDENTIAL cannot be combined with biometrics in BiometricPrompt, so the prompt asks
 *    for the biometric only and its negative button opens the system confirm-credentials screen
 *    (KeyguardManager.createConfirmDeviceCredentialIntent). Without enrolled biometrics that screen opens directly.
 *
 * One instance per activity, created in onCreate (the ActivityResult launcher and the prompt must exist before STARTED).
 * The app never sees the secret: only success or failure comes back.
 */
class Authenticator(private val activity: AppCompatActivity) {

    private var onResult: ((AuthResult, String?) -> Unit)? = null
    private var lastTitle: String = ""
    private var lastSubtitle: String? = null

    /** True from [authenticate] until a result is delivered. */
    var busy: Boolean = false
        private set

    private val credentialLauncher =
        activity.registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
            finish(if (it.resultCode == Activity.RESULT_OK) AuthResult.SUCCESS else AuthResult.CANCELLED, null)
        }

    private val prompt = BiometricPrompt(
        activity,
        ContextCompat.getMainExecutor(activity),
        object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                finish(AuthResult.SUCCESS, null)
            }

            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                val fallback = needsCredentialFallback() && isDeviceSecure(activity)
                when (errorCode) {
                    // API 24-29: the negative button is the way to the PIN; with no screen lock it is a plain "Cancel"
                    BiometricPrompt.ERROR_NEGATIVE_BUTTON -> if (fallback) launchCredential() else finish(AuthResult.CANCELLED, null)
                    BiometricPrompt.ERROR_USER_CANCELED, BiometricPrompt.ERROR_CANCELED -> finish(AuthResult.CANCELLED, null)
                    BiometricPrompt.ERROR_LOCKOUT, BiometricPrompt.ERROR_LOCKOUT_PERMANENT ->
                        if (fallback) launchCredential() else finish(AuthResult.LOCKED_OUT, errString.toString())
                    BiometricPrompt.ERROR_NO_BIOMETRICS, BiometricPrompt.ERROR_NO_DEVICE_CREDENTIAL, BiometricPrompt.ERROR_HW_NOT_PRESENT ->
                        if (fallback) launchCredential() else finish(AuthResult.UNAVAILABLE, errString.toString())
                    else -> finish(AuthResult.ERROR, errString.toString())
                }
            }
            // onAuthenticationFailed (a wrong finger): the system prompt stays open and counts the attempts itself
        },
    )

    /** Shows the prompt. [callback] gets exactly one result. A second call while busy is ignored. */
    fun authenticate(title: String, subtitle: String?, cancelText: String, credentialText: String, callback: (AuthResult, String?) -> Unit) {
        if (busy) return
        busy = true
        onResult = callback
        lastTitle = title
        lastSubtitle = subtitle
        if (!isAvailable(activity)) {
            finish(AuthResult.UNAVAILABLE, null)
            return
        }
        try {
            if (!needsCredentialFallback()) {
                prompt.authenticate(info(title, subtitle).setAllowedAuthenticators(AUTHENTICATORS_API30).build())
                return
            }
            // API 24-29
            val biometrics = BiometricManager.from(activity).canAuthenticate(BIOMETRIC_WEAK) == BiometricManager.BIOMETRIC_SUCCESS
            if (biometrics) {
                prompt.authenticate(
                    info(title, subtitle)
                        .setAllowedAuthenticators(BIOMETRIC_WEAK)
                        .setNegativeButtonText(if (isDeviceSecure(activity)) credentialText else cancelText)
                        .build()
                )
            } else {
                launchCredential()
            }
        } catch (e: Exception) {
            finish(AuthResult.ERROR, e.message)
        }
    }

    private fun info(title: String, subtitle: String?): BiometricPrompt.PromptInfo.Builder {
        val b = BiometricPrompt.PromptInfo.Builder().setTitle(title).setConfirmationRequired(false)
        if (!subtitle.isNullOrBlank()) b.setSubtitle(subtitle)
        return b
    }

    /** Closes whatever prompt is showing (the caller then gets AuthResult.CANCELLED). */
    fun cancel() {
        if (!busy) return
        try {
            prompt.cancelAuthentication()
        } catch (e: Exception) {
            // nothing is showing
        }
    }

    private fun launchCredential() {
        val km = activity.getSystemService(KeyguardManager::class.java)
        @Suppress("DEPRECATION") // still the only way to open the PIN screen on Android 7-10
        val intent: Intent? = km?.createConfirmDeviceCredentialIntent(lastTitle, lastSubtitle)
        if (intent == null) {
            finish(AuthResult.UNAVAILABLE, null)
            return
        }
        // The system PIN screen covers the app completely: that must not count as leaving the app (see AppLock grace).
        AppLock.beginExternalFlow()
        try {
            credentialLauncher.launch(intent)
        } catch (e: Exception) {
            finish(AuthResult.ERROR, e.message)
        }
    }

    private fun finish(result: AuthResult, message: String?) {
        val cb = onResult
        onResult = null
        busy = false
        cb?.invoke(result, message)
    }

    companion object {
        /** Android 11+: biometrics of either class, or the device credential, in one prompt. */
        const val AUTHENTICATORS_API30 = BIOMETRIC_STRONG or BIOMETRIC_WEAK or DEVICE_CREDENTIAL

        /** Before Android 11 the device credential cannot be combined with biometrics inside BiometricPrompt. */
        fun needsCredentialFallback(): Boolean = Build.VERSION.SDK_INT < Build.VERSION_CODES.R

        fun isDeviceSecure(context: Context): Boolean =
            context.getSystemService(KeyguardManager::class.java)?.isDeviceSecure == true

        /** Can the app ask the user for a biometric or the device PIN / pattern / password at all? */
        fun isAvailable(context: Context): Boolean {
            val bm = BiometricManager.from(context)
            return if (needsCredentialFallback()) {
                bm.canAuthenticate(BIOMETRIC_WEAK) == BiometricManager.BIOMETRIC_SUCCESS || isDeviceSecure(context)
            } else {
                bm.canAuthenticate(AUTHENTICATORS_API30) == BiometricManager.BIOMETRIC_SUCCESS
            }
        }
    }
}
