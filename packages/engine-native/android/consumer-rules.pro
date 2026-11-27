# The engine reaches three private members of pdfium-android by reflection
# (the library exposes no public way to close a page or to hand its native
# document to our own JNI). Without these rules R8 renames them in a minified
# app and the lookups fail silently: pages would stay open until the document
# closes, and outline/text search through the native pointer would be off.
-keepclassmembers class com.shockwave.pdfium.PdfDocument {
    long mNativeDocPtr;
    java.util.Map mNativePagesPtr;
}
-keepclassmembers class com.shockwave.pdfium.PdfiumCore {
    private native void nativeClosePage(long);
    *** getPageText(...);
}
