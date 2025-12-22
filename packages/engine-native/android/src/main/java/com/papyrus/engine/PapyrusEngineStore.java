package com.papyrus.engine;

import android.content.Context;
import android.os.ParcelFileDescriptor;

import com.shockwave.pdfium.PdfDocument;
import com.shockwave.pdfium.PdfiumCore;

import java.io.File;
import java.io.IOException;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

final class PapyrusEngineStore {
  static final class EngineState {
    final PdfiumCore pdfium;
    PdfDocument document;
    ParcelFileDescriptor fileDescriptor;
    String sourcePath;

    EngineState(PdfiumCore pdfium) {
      this.pdfium = pdfium;
    }
  }

  private static final Map<String, EngineState> ENGINES = new ConcurrentHashMap<>();

  static String createEngine(Context context) {
    String engineId = UUID.randomUUID().toString();
    ENGINES.put(engineId, new EngineState(new PdfiumCore(context)));
    return engineId;
  }

  static EngineState getEngine(String engineId) {
    return ENGINES.get(engineId);
  }

  static void destroyEngine(String engineId) {
    EngineState state = ENGINES.remove(engineId);
    if (state == null) return;
    if (state.document != null) {
      state.pdfium.closeDocument(state.document);
      state.document = null;
    }
    if (state.fileDescriptor != null) {
      try {
        state.fileDescriptor.close();
      } catch (IOException ignored) {
      }
      state.fileDescriptor = null;
    }
  }

  static void setDocument(EngineState state, PdfDocument document, ParcelFileDescriptor fd, String sourcePath) {
    if (state.document != null) {
      state.pdfium.closeDocument(state.document);
    }
    if (state.fileDescriptor != null) {
      try {
        state.fileDescriptor.close();
      } catch (IOException ignored) {
      }
    }
    state.document = document;
    state.fileDescriptor = fd;
    state.sourcePath = sourcePath;
  }
}
