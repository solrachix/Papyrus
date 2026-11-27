package com.papyrus.engine;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.pdf.PdfRenderer;
import android.net.Uri;
import android.os.ParcelFileDescriptor;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/**
 * Draws one page of a PDF, or the cover image of an EPUB, into an image file.
 *
 * It opens the document, renders, and closes everything before returning: no
 * engine, view or cache outlives the call. PDFs go through the platform's
 * PdfRenderer, so a thumbnail never touches the reader's pdfium document.
 * Only local sources are accepted: a thumbnail must not trigger a download.
 */
final class PapyrusThumbnail {
  static final class Result {
    final String path;
    final int width;
    final int height;

    Result(String path, int width, int height) {
      this.path = path;
      this.width = width;
      this.height = height;
    }
  }

  private PapyrusThumbnail() {}

  static Result generate(Context context, String sourceUri, String type, int pageIndex, int maxWidth, String format, int quality, String outputPath) throws IOException {
    if (sourceUri == null || sourceUri.isEmpty()) throw new IllegalArgumentException("uri is required");
    int width = Math.max(32, Math.min(maxWidth <= 0 ? 480 : maxWidth, 2048));
    boolean png = "png".equalsIgnoreCase(format);
    String kind = kindOf(sourceUri, type);
    Bitmap bitmap = null;
    try {
      if ("pdf".equals(kind)) bitmap = renderPdf(context, sourceUri, Math.max(0, pageIndex), width);
      else if ("epub".equals(kind)) bitmap = renderEpubCover(sourceUri, width);
      else throw new IllegalArgumentException("unsupported document type");

      File destination = outputPath != null && !outputPath.isEmpty()
          ? new File(stripFileScheme(outputPath))
          : File.createTempFile("thumbnail-", png ? ".png" : ".jpg", ensureDirectory(new File(context.getCacheDir(), "papyrus-thumbnails")));
      File parent = destination.getParentFile();
      if (parent != null) ensureDirectory(parent);
      // Written aside and renamed: a half-written file is never read as an image.
      File partial = new File(destination.getPath() + ".part");
      try (FileOutputStream out = new FileOutputStream(partial)) {
        Bitmap.CompressFormat encoder = png ? Bitmap.CompressFormat.PNG : Bitmap.CompressFormat.JPEG;
        if (!bitmap.compress(encoder, Math.max(1, Math.min(quality <= 0 ? 85 : quality, 100)), out)) {
          throw new IOException("could not encode the thumbnail");
        }
      }
      if (!partial.renameTo(destination)) {
        partial.delete();
        throw new IOException("could not store the thumbnail");
      }
      return new Result(destination.getAbsolutePath(), bitmap.getWidth(), bitmap.getHeight());
    } finally {
      if (bitmap != null) bitmap.recycle();
    }
  }

  private static File ensureDirectory(File directory) throws IOException {
    if (!directory.isDirectory() && !directory.mkdirs() && !directory.isDirectory()) {
      throw new IOException("could not create " + directory);
    }
    return directory;
  }

  private static String stripFileScheme(String value) {
    return value.startsWith("file://") ? Uri.parse(value).getPath() : value;
  }

  static String kindOf(String sourceUri, String type) {
    String declared = type == null ? "" : type.toLowerCase();
    String path = sourceUri.toLowerCase();
    int query = path.indexOf('?');
    if (query >= 0) path = path.substring(0, query);
    if (declared.contains("pdf") || path.endsWith(".pdf")) return "pdf";
    if (declared.contains("epub") || path.endsWith(".epub")) return "epub";
    return "unknown";
  }

  private static ParcelFileDescriptor openDescriptor(Context context, String sourceUri) throws IOException {
    if (sourceUri.startsWith("content://")) {
      ParcelFileDescriptor descriptor = context.getContentResolver().openFileDescriptor(Uri.parse(sourceUri), "r");
      if (descriptor == null) throw new IOException("could not open the document");
      return descriptor;
    }
    if (sourceUri.startsWith("file://") || sourceUri.startsWith("/")) {
      return ParcelFileDescriptor.open(new File(stripFileScheme(sourceUri)), ParcelFileDescriptor.MODE_READ_ONLY);
    }
    throw new IllegalArgumentException("the document must be a local file");
  }

  private static Bitmap renderPdf(Context context, String sourceUri, int pageIndex, int maxWidth) throws IOException {
    try (ParcelFileDescriptor descriptor = openDescriptor(context, sourceUri);
        PdfRenderer renderer = new PdfRenderer(descriptor)) {
      if (renderer.getPageCount() < 1) throw new IOException("the document has no pages");
      try (PdfRenderer.Page page = renderer.openPage(Math.min(pageIndex, renderer.getPageCount() - 1))) {
        float scale = maxWidth / (float) Math.max(1, page.getWidth());
        int width = Math.max(1, Math.round(page.getWidth() * scale));
        int height = Math.max(1, Math.round(page.getHeight() * scale));
        Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        // PDF pages are transparent where nothing is drawn.
        bitmap.eraseColor(Color.WHITE);
        page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
        return bitmap;
      }
    }
  }

  private static String readEntry(ZipFile zip, String name) throws IOException {
    ZipEntry entry = zip.getEntry(name);
    if (entry == null) return null;
    StringBuilder text = new StringBuilder();
    try (BufferedReader reader = new BufferedReader(new InputStreamReader(zip.getInputStream(entry), StandardCharsets.UTF_8))) {
      char[] buffer = new char[8192];
      int read;
      while ((read = reader.read(buffer)) > 0) text.append(buffer, 0, read);
    }
    return text.toString();
  }

  private static String attribute(String tag, String name) {
    Matcher matcher = Pattern.compile("\\b" + name + "\\s*=\\s*[\"']([^\"']*)[\"']").matcher(tag);
    return matcher.find() ? matcher.group(1) : null;
  }

  private static List<String> tags(String xml, String name) {
    List<String> found = new ArrayList<>();
    Matcher matcher = Pattern.compile("<" + name + "\\b[^>]*>").matcher(xml);
    while (matcher.find()) found.add(matcher.group());
    return found;
  }

  /** The cover image named by the EPUB package (EPUB 3 `cover-image`, EPUB 2 `meta name="cover"`). */
  static String epubCoverEntry(String opfPath, String opf) {
    String coverId = null;
    for (String meta : tags(opf, "meta")) {
      if ("cover".equals(attribute(meta, "name"))) coverId = attribute(meta, "content");
    }
    String href = null;
    List<String> items = tags(opf, "item");
    for (String item : items) {
      String properties = attribute(item, "properties");
      if (properties != null && (" " + properties + " ").contains(" cover-image ")) href = attribute(item, "href");
    }
    if (href == null && coverId != null) {
      for (String item : items) {
        if (coverId.equals(attribute(item, "id"))) href = attribute(item, "href");
      }
    }
    if (href == null) {
      for (String item : items) {
        String mediaType = attribute(item, "media-type");
        String id = attribute(item, "id");
        if (mediaType != null && mediaType.startsWith("image/") && id != null && id.toLowerCase().contains("cover")) {
          href = attribute(item, "href");
          break;
        }
      }
    }
    if (href == null) return null;
    int slash = opfPath.lastIndexOf('/');
    String base = slash >= 0 ? opfPath.substring(0, slash + 1) : "";
    String normalized = new File("/" + base + Uri.decode(href)).toURI().normalize().getPath();
    return normalized.startsWith("/") ? normalized.substring(1) : normalized;
  }

  private static Bitmap renderEpubCover(String sourceUri, int maxWidth) throws IOException {
    if (!(sourceUri.startsWith("file://") || sourceUri.startsWith("/"))) {
      throw new IllegalArgumentException("the document must be a local file");
    }
    try (ZipFile zip = new ZipFile(new File(stripFileScheme(sourceUri)))) {
      String container = readEntry(zip, "META-INF/container.xml");
      if (container == null) throw new IOException("not an EPUB");
      Matcher rootfile = Pattern.compile("full-path\\s*=\\s*[\"']([^\"']+)[\"']").matcher(container);
      if (!rootfile.find()) throw new IOException("EPUB without a package file");
      String opfPath = rootfile.group(1);
      String opf = readEntry(zip, opfPath);
      if (opf == null) throw new IOException("EPUB without a package file");
      String coverName = epubCoverEntry(opfPath, opf);
      ZipEntry cover = coverName == null ? null : zip.getEntry(coverName);
      if (cover == null) throw new IOException("EPUB without a cover image");

      BitmapFactory.Options bounds = new BitmapFactory.Options();
      bounds.inJustDecodeBounds = true;
      try (InputStream stream = zip.getInputStream(cover)) {
        BitmapFactory.decodeStream(stream, null, bounds);
      }
      if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw new IOException("EPUB cover image is not readable");
      BitmapFactory.Options options = new BitmapFactory.Options();
      options.inSampleSize = 1;
      while (bounds.outWidth / (options.inSampleSize * 2) >= maxWidth) options.inSampleSize *= 2;
      Bitmap decoded;
      try (InputStream stream = zip.getInputStream(cover)) {
        decoded = BitmapFactory.decodeStream(stream, null, options);
      }
      if (decoded == null) throw new IOException("EPUB cover image is not readable");
      if (decoded.getWidth() <= maxWidth) return decoded;
      float scale = maxWidth / (float) decoded.getWidth();
      Bitmap scaled = Bitmap.createScaledBitmap(decoded, maxWidth, Math.max(1, Math.round(decoded.getHeight() * scale)), true);
      if (scaled != decoded) decoded.recycle();
      return scaled;
    }
  }
}
