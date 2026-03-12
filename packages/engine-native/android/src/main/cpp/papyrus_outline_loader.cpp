#include "papyrus_outline_loader.h"

#include <cstring>

namespace {

void ClearOutlineFns(PdfiumOutlineFns *fns) {
  if (fns == nullptr) {
    return;
  }

  *fns = {};
}

void CloseHandleIfPresent(OutlineLoaderState *state, const OutlineLoaderDeps *deps) {
  if (state == nullptr || state->handle == nullptr) {
    return;
  }

  if (deps != nullptr && deps->dlclose_fn != nullptr) {
    deps->dlclose_fn(deps->user_data, state->handle);
  }

  state->handle = nullptr;
}

void TransitionToUnsupported(OutlineLoaderState *state, const OutlineLoaderDeps *deps) {
  if (state == nullptr) {
    return;
  }

  ClearOutlineFns(&state->fns);
  CloseHandleIfPresent(state, deps);
  state->load_state = OutlineLoadState::kUnsupported;
}

template <typename FnType>
FnType ResolveOutlineSymbol(const OutlineLoaderDeps *deps, void *handle, const char *symbol_name) {
  const OutlineLoaderDeps::PdfiumSymbol raw_symbol =
      deps->dlsym_fn(deps->user_data, handle, symbol_name);

  FnType resolved_symbol = nullptr;
  static_assert(sizeof(resolved_symbol) == sizeof(raw_symbol),
                "Expected function pointers to share the same size");
  std::memcpy(&resolved_symbol, &raw_symbol, sizeof(resolved_symbol));
  return resolved_symbol;
}

PdfiumOutlineFns LoadOutlineFns(void *handle, const OutlineLoaderDeps *deps) {
  PdfiumOutlineFns fns = {};
  fns.loadDocument =
      ResolveOutlineSymbol<decltype(fns.loadDocument)>(deps, handle, "FPDF_LoadDocument");
  fns.closeDocument =
      ResolveOutlineSymbol<decltype(fns.closeDocument)>(deps, handle, "FPDF_CloseDocument");
  fns.bookmarkGetFirstChild = ResolveOutlineSymbol<decltype(fns.bookmarkGetFirstChild)>(
      deps, handle, "FPDFBookmark_GetFirstChild");
  fns.bookmarkGetNextSibling = ResolveOutlineSymbol<decltype(fns.bookmarkGetNextSibling)>(
      deps, handle, "FPDFBookmark_GetNextSibling");
  fns.bookmarkGetTitle =
      ResolveOutlineSymbol<decltype(fns.bookmarkGetTitle)>(deps, handle, "FPDFBookmark_GetTitle");
  fns.bookmarkGetDest =
      ResolveOutlineSymbol<decltype(fns.bookmarkGetDest)>(deps, handle, "FPDFBookmark_GetDest");
  fns.destGetPageIndex =
      ResolveOutlineSymbol<decltype(fns.destGetPageIndex)>(deps, handle, "FPDFDest_GetPageIndex");
  return fns;
}

bool HasRequiredDeps(const OutlineLoaderDeps *deps) {
  return deps != nullptr && deps->dlopen_fn != nullptr && deps->dlsym_fn != nullptr &&
         deps->dlclose_fn != nullptr && deps->library_name != nullptr;
}

}  // namespace

bool HasCompleteOutlineFns(const PdfiumOutlineFns &fns) {
  return fns.loadDocument != nullptr && fns.closeDocument != nullptr &&
         fns.bookmarkGetFirstChild != nullptr && fns.bookmarkGetNextSibling != nullptr &&
         fns.bookmarkGetTitle != nullptr && fns.bookmarkGetDest != nullptr &&
         fns.destGetPageIndex != nullptr;
}

OutlineLoadAttemptResult EnsureOutlinePdfiumLoaded(OutlineLoaderState *state,
                                                   const OutlineLoaderDeps *deps) {
  if (state == nullptr) {
    return {};
  }

  if (state->load_state == OutlineLoadState::kSupported) {
    return {true, false};
  }

  if (state->load_state == OutlineLoadState::kUnsupported) {
    return {false, false};
  }

  if (!HasRequiredDeps(deps)) {
    TransitionToUnsupported(state, deps);
    return {false, true};
  }

  state->handle = deps->dlopen_fn(deps->user_data, deps->library_name, deps->dlopen_flags);
  if (state->handle == nullptr) {
    TransitionToUnsupported(state, deps);
    return {false, true};
  }

  state->fns = LoadOutlineFns(state->handle, deps);
  if (!HasCompleteOutlineFns(state->fns)) {
    TransitionToUnsupported(state, deps);
    return {false, true};
  }

  state->load_state = OutlineLoadState::kSupported;
  return {true, false};
}

void ResetOutlineLoaderState(OutlineLoaderState *state, const OutlineLoaderDeps *deps) {
  if (state == nullptr) {
    return;
  }

  ClearOutlineFns(&state->fns);
  CloseHandleIfPresent(state, deps);
  state->load_state = OutlineLoadState::kUninitialized;
}
