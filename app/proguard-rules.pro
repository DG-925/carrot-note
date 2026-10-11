# kotlinx.serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers @kotlinx.serialization.Serializable class com.carrotnote.app.** {
    *** Companion;
    *** INSTANCE;
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.carrotnote.app.**$$serializer { *; }
-keepclasseswithmembers class com.carrotnote.app.** {
    kotlinx.serialization.KSerializer serializer(...);
}
