import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.serialization")
}

// Release signing: read from keystore.properties (local) or environment variables (CI).
val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
fun signingValue(key: String, env: String): String? =
    keystoreProps.getProperty(key) ?: System.getenv(env)

val appVersionName = System.getenv("CARROT_VERSION_NAME") ?: property("carrot.versionName") as String
// 1.2.3 -> 10203, so every higher version gets a higher versionCode.
val appVersionCode = appVersionName.split(".").map { it.filter(Char::isDigit).toIntOrNull() ?: 0 }
    .let { (it.getOrElse(0) { 0 } * 10000) + (it.getOrElse(1) { 0 } * 100) + it.getOrElse(2) { 0 } }
val apiUrl = property("carrot.apiUrl") as String
val githubRepo = property("carrot.githubRepo") as String

android {
    namespace = "com.carrotnote.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.carrotnote.app"
        // Android 5.1 and up. java.time and newer Java APIs come from core library desugaring.
        minSdk = 22
        targetSdk = 36
        versionCode = appVersionCode
        versionName = appVersionName
        buildConfigField("String", "API_URL", "\"$apiUrl\"")
        buildConfigField("String", "GITHUB_REPO", "\"$githubRepo\"")
    }

    signingConfigs {
        create("release") {
            val storePath = signingValue("storeFile", "CARROT_KEYSTORE_PATH")
            if (storePath != null) {
                storeFile = file(storePath)
                storePassword = signingValue("storePassword", "CARROT_KEYSTORE_PASSWORD")
                keyAlias = signingValue("keyAlias", "CARROT_KEY_ALIAS")
                keyPassword = signingValue("keyPassword", "CARROT_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            val release = signingConfigs.getByName("release")
            if (release.storeFile != null) signingConfig = release
        }
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
            // Optional: ./gradlew assembleDebug -Pcarrot.debugApiUrl=http://127.0.0.1:8787
            (findProperty("carrot.debugApiUrl") as String?)?.let { buildConfigField("String", "API_URL", "\"$it\"") }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        isCoreLibraryDesugaringEnabled = true
    }
    lint {
        // A call to an Android API newer than minSdk without a version check stops the build
        // (release builds run these "fatal" checks too).
        fatal += "NewApi"
        abortOnError = true
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        buildConfig = true
    }
    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.11.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.9.4")
    implementation("androidx.lifecycle:lifecycle-process:2.9.4")
    implementation("androidx.work:work-runtime-ktx:2.10.5")
    implementation("androidx.biometric:biometric:1.1.0")

    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.9.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
}
