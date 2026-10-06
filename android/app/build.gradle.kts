plugins {
    alias(libs.plugins.android.application)
}

// ---- release/signing inputs (all optional; nothing secret lives in the repo) ---------------------------------------
fun prop(name: String): String? = (findProperty(name) as String?)?.takeIf { it.isNotBlank() }

val releaseBaseUrl = "https://fomo.spot"
// Only the DEBUG build may point somewhere else, and only at an https origin (cleartext is disabled).
val debugBaseUrl = prop("fomo.debugBaseUrl")?.takeIf { it.startsWith("https://") } ?: releaseBaseUrl

val keystorePath = System.getenv("ANDROID_KEYSTORE_PATH")?.takeIf { it.isNotBlank() } ?: prop("fomo.keystore")
val keystorePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")?.takeIf { it.isNotBlank() } ?: prop("fomo.keystorePassword")
val signingKeyAlias = System.getenv("ANDROID_KEY_ALIAS")?.takeIf { it.isNotBlank() } ?: prop("fomo.keyAlias")
val signingKeyPassword = System.getenv("ANDROID_KEY_PASSWORD")?.takeIf { it.isNotBlank() } ?: prop("fomo.keyPassword")
val canSignRelease = keystorePath != null && file(keystorePath).exists() &&
    keystorePassword != null && signingKeyAlias != null && signingKeyPassword != null

android {
    namespace = "spot.fomo.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "spot.fomo.app"
        minSdk = 24
        targetSdk = 35
        // Bump BOTH together with public/app/version.json on the site when you publish a new APK.
        versionCode = 1
        versionName = "1.0.0"
    }

    signingConfigs {
        if (canSignRelease) {
            create("release") {
                storeFile = file(keystorePath!!)
                storePassword = keystorePassword
                keyAlias = signingKeyAlias
                keyPassword = signingKeyPassword
            }
        }
    }

    buildTypes {
        debug {
            buildConfigField("String", "BASE_URL", "\"$debugBaseUrl\"")
        }
        release {
            buildConfigField("String", "BASE_URL", "\"$releaseBaseUrl\"")
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // Without a keystore the release APK stays unsigned (app-release-unsigned.apk) — it cannot be installed.
            signingConfigs.findByName("release")?.let { signingConfig = it }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        buildConfig = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.webkit)
    implementation(libs.androidx.swiperefreshlayout)
    implementation(libs.androidx.core.splashscreen)
    implementation(libs.androidx.browser)

    // Push (stage 2). Works only with app/google-services.json; without it the app runs, just without push.
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging)

    testImplementation(libs.junit)
}

// Apply the Google Services plugin ONLY when the Firebase client config is present, so the project builds without it.
if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}
