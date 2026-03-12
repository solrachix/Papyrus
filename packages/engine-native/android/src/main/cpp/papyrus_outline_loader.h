#pragma once

using FPDF_DOCUMENT = void *;
using FPDF_BOOKMARK = void *;
using FPDF_DEST = void *;

enum class OutlineLoadState {
  kUninitialized,
  kSupported,
  kUnsupported,
};

struct PdfiumOutlineFns {
  FPDF_DOCUMENT (*loadDocument)(const char *, const char *) = nullptr;
  void (*closeDocument)(FPDF_DOCUMENT) = nullptr;
  FPDF_BOOKMARK (*bookmarkGetFirstChild)(FPDF_DOCUMENT, FPDF_BOOKMARK) = nullptr;
  FPDF_BOOKMARK (*bookmarkGetNextSibling)(FPDF_DOCUMENT, FPDF_BOOKMARK) = nullptr;
  unsigned long (*bookmarkGetTitle)(FPDF_BOOKMARK, void *, unsigned long) = nullptr;
  FPDF_DEST (*bookmarkGetDest)(FPDF_DOCUMENT, FPDF_BOOKMARK) = nullptr;
  int (*destGetPageIndex)(FPDF_DOCUMENT, FPDF_DEST) = nullptr;
};

struct OutlineLoaderDeps {
  using PdfiumSymbol = void (*)();

  void *user_data = nullptr;
  void *(*dlopen_fn)(void *user_data, const char *filename, int flags) = nullptr;
  PdfiumSymbol (*dlsym_fn)(void *user_data, void *handle, const char *symbol_name) = nullptr;
  int (*dlclose_fn)(void *user_data, void *handle) = nullptr;
  const char *library_name = nullptr;
  int dlopen_flags = 0;
};

struct OutlineLoaderState {
  void *handle = nullptr;
  PdfiumOutlineFns fns = {};
  OutlineLoadState load_state = OutlineLoadState::kUninitialized;
};

struct OutlineLoadAttemptResult {
  bool loaded = false;
  bool transitioned_to_unsupported = false;
};

bool HasCompleteOutlineFns(const PdfiumOutlineFns &fns);
OutlineLoadAttemptResult EnsureOutlinePdfiumLoaded(OutlineLoaderState *state,
                                                   const OutlineLoaderDeps *deps);
void ResetOutlineLoaderState(OutlineLoaderState *state, const OutlineLoaderDeps *deps);
