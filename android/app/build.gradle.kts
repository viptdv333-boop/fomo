import com.android.build.api.artifact.SingleArtifact
import com.android.build.api.variant.BuildConfigField
import com.google.gms.googleservices.GoogleServicesPlugin.MissingGoogleServicesStrategy

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.google.services)
}

// ---- release/signing inputs (all optional; nothing secret lives in the repo) ---------------------------------------
fun prop(name: String): String? = (findProperty(name) as String?)?.takeIf { it.isNotBlank() }

// Two sites, one codebase (product flavors, dimension "site"):
//   fomo     -> spot.fomo.app      https://fomo.spot            "FOMO"          FOMO.apk
//   terminal -> spot.fomo.terminal https://terminal.fomo.spot   "FOMO Terminal" FOMO-Terminal.apk
val fomoBaseUrl = "https://fomo.spot"
val terminalBaseUrl = "https://terminal.fomo.spot"
// Only the DEBUG build may point somewhere else, and only at an https origin (cleartext is disabled).
// fomo.debugBaseUrl -> the fomo flavor, fomo.terminalDebugBaseUrl -> the terminal flavor.
val fomoDebugBaseUrl = prop("fomo.debugBaseUrl")?.takeIf { it.startsWith("https://") } ?: fomoBaseUrl
val terminalDebugBaseUrl = prop("fomo.terminalDebugBaseUrl")?.takeIf { it.startsWith("https://") } ?: terminalBaseUrl

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
        minSdk = 24
        targetSdk = 35
    }

    flavorDimensions += "site"
    productFlavors {
        create("fomo") {
            dimension = "site"
            applicationId = "spot.fomo.app"
            // Bump BOTH together with public/app/version.json on the site when you publish a new APK.
            versionCode = 1
            versionName = "1.0.0"
            // BASE_URL itself is set per variant (androidComponents.onVariants below), because debug may override it.
            buildConfigField("String", "UPDATE_PATH", "\"/app/version.json\"")
            buildConfigField("boolean", "SHARE_ENABLED", "true")
            manifestPlaceholders["siteHost"] = "fomo.spot"
        }
        create("terminal") {
            dimension = "site"
            applicationId = "spot.fomo.terminal"
            // Bump BOTH together with public/app/terminal-version.json when you publish a new FOMO-Terminal.apk.
            versionCode = 1
            versionName = "1.0.0"
            buildConfigField("String", "UPDATE_PATH", "\"/app/terminal-version.json\"")
            // no /share page on the terminal site (and no SEND intent filters, see src/fomo/AndroidManifest.xml)
            buildConfigField("boolean", "SHARE_ENABLED", "false")
            manifestPlaceholders["siteHost"] = "terminal.fomo.spot"
        }
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
        }
        release {
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

androidComponents {
    onVariants { variant ->
        val terminal = variant.flavorName == "terminal"
        val debug = variant.buildType == "debug"
        val baseUrl = when {
            terminal && debug -> terminalDebugBaseUrl
            terminal -> terminalBaseUrl
            debug -> fomoDebugBaseUrl
            else -> fomoBaseUrl
        }
        variant.buildConfigFields?.put("BASE_URL", BuildConfigField("String", "\"$baseUrl\"", "site origin of this flavor"))

        // AGP 9 has no public API to rename the APK itself (it stays app-<flavor>-<buildType>.apk), so a copy task right after
        // assemble<Variant> puts a named copy into build/outputs/named-apk/<variant>/:
        // FOMO.apk / FOMO-Terminal.apk (release; FOMO-unsigned.apk when no keystore is configured), FOMO-debug.apk / FOMO-Terminal-debug.apk.
        val stem = if (terminal) "FOMO-Terminal" else "FOMO"
        val suffix = when {
            debug -> "-debug"
            canSignRelease -> ""
            else -> "-unsigned"
        }
        val variantName = variant.name
        val copyNamed = tasks.register<Copy>("copyNamedApk${variantName.replaceFirstChar { it.uppercase() }}") {
            from(variant.artifacts.get(SingleArtifact.APK)) { include("*.apk") }
            rename { "$stem$suffix.apk" }
            into(layout.buildDirectory.dir("outputs/named-apk/$variantName"))
        }
        tasks.matching { it.name == "assemble${variantName.replaceFirstChar { c -> c.uppercase() }}" }
            .configureEach { finalizedBy(copyNamed) }
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.webkit)
    implementation(libs.androidx.swiperefreshlayout)
    implementation(libs.androidx.core.splashscreen)
    implementation(libs.androidx.browser)
    implementation(libs.androidx.biometric)
    implementation(libs.androidx.preference)

    // Push (stage 2). Works only with src/<flavor>/google-services.json; without it the app runs, just without push.
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging)

    testImplementation(libs.junit)
}

// Firebase client config is per flavor: src/fomo/google-services.json (project fomo3-c2798, spot.fomo.app) and
// src/terminal/google-services.json (the SAME Firebase project fomo3-c2798, app spot.fomo.terminal; added by the owner). A flavor without its
// file is still built: the plugin skips it (IGNORE), Firebase is then not initialised and the app runs without push.
googleServices {
    missingGoogleServicesStrategy = MissingGoogleServicesStrategy.IGNORE
}
