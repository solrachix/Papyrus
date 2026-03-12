#include "papyrus_outline_loader.h"

#include <cstdlib>
#include <cstring>
#include <iostream>
#include <string>
#include <unordered_map>

namespace {

using PdfiumSymbol = OutlineLoaderDeps::PdfiumSymbol;

struct FakeLoaderEnv {
  void *library_handle = reinterpret_cast<void *>(0x1);
  int dlopen_calls = 0;
  int dlsym_calls = 0;
  int dlclose_calls = 0;
  std::unordered_map<std::string, PdfiumSymbol> symbols;
};

FPDF_DOCUMENT FakeLoadDocument(const char *, const char *) {
  return nullptr;
}

void FakeCloseDocument(FPDF_DOCUMENT) {}

FPDF_BOOKMARK FakeBookmarkGetFirstChild(FPDF_DOCUMENT, FPDF_BOOKMARK) {
  return nullptr;
}

FPDF_BOOKMARK FakeBookmarkGetNextSibling(FPDF_DOCUMENT, FPDF_BOOKMARK) {
  return nullptr;
}

unsigned long FakeBookmarkGetTitle(FPDF_BOOKMARK, void *, unsigned long) {
  return 0;
}

FPDF_DEST FakeBookmarkGetDest(FPDF_DOCUMENT, FPDF_BOOKMARK) {
  return nullptr;
}

int FakeDestGetPageIndex(FPDF_DOCUMENT, FPDF_DEST) {
  return -1;
}

template <typename FnType>
PdfiumSymbol ToPdfiumSymbol(FnType fn) {
  PdfiumSymbol symbol = nullptr;
  static_assert(sizeof(symbol) == sizeof(fn),
                "Expected function pointers to share the same size");
  std::memcpy(&symbol, &fn, sizeof(symbol));
  return symbol;
}

PdfiumOutlineFns MakeCompleteOutlineFns() {
  PdfiumOutlineFns fns = {};
  fns.loadDocument = &FakeLoadDocument;
  fns.closeDocument = &FakeCloseDocument;
  fns.bookmarkGetFirstChild = &FakeBookmarkGetFirstChild;
  fns.bookmarkGetNextSibling = &FakeBookmarkGetNextSibling;
  fns.bookmarkGetTitle = &FakeBookmarkGetTitle;
  fns.bookmarkGetDest = &FakeBookmarkGetDest;
  fns.destGetPageIndex = &FakeDestGetPageIndex;
  return fns;
}

FakeLoaderEnv *GetEnv(void *user_data) {
  return static_cast<FakeLoaderEnv *>(user_data);
}

void *FakeDlopen(void *user_data, const char *, int) {
  FakeLoaderEnv *env = GetEnv(user_data);
  env->dlopen_calls += 1;
  return env->library_handle;
}

PdfiumSymbol FakeDlsym(void *user_data, void *, const char *symbol_name) {
  FakeLoaderEnv *env = GetEnv(user_data);
  env->dlsym_calls += 1;

  const auto it = env->symbols.find(symbol_name);
  if (it == env->symbols.end()) {
    return nullptr;
  }

  return it->second;
}

int FakeDlclose(void *user_data, void *) {
  FakeLoaderEnv *env = GetEnv(user_data);
  env->dlclose_calls += 1;
  return 0;
}

OutlineLoaderDeps MakeDeps(FakeLoaderEnv *env) {
  OutlineLoaderDeps deps = {};
  deps.user_data = env;
  deps.dlopen_fn = &FakeDlopen;
  deps.dlsym_fn = &FakeDlsym;
  deps.dlclose_fn = &FakeDlclose;
  deps.library_name = "libmodpdfium.so";
  deps.dlopen_flags = 0;
  return deps;
}

void InstallSymbols(FakeLoaderEnv *env, const PdfiumOutlineFns &fns) {
  env->symbols["FPDF_LoadDocument"] = ToPdfiumSymbol(fns.loadDocument);
  env->symbols["FPDF_CloseDocument"] = ToPdfiumSymbol(fns.closeDocument);
  env->symbols["FPDFBookmark_GetFirstChild"] = ToPdfiumSymbol(fns.bookmarkGetFirstChild);
  env->symbols["FPDFBookmark_GetNextSibling"] = ToPdfiumSymbol(fns.bookmarkGetNextSibling);
  env->symbols["FPDFBookmark_GetTitle"] = ToPdfiumSymbol(fns.bookmarkGetTitle);
  env->symbols["FPDFBookmark_GetDest"] = ToPdfiumSymbol(fns.bookmarkGetDest);
  env->symbols["FPDFDest_GetPageIndex"] = ToPdfiumSymbol(fns.destGetPageIndex);
}

[[noreturn]] void Fail(const char *expression, const char *file, int line) {
  std::cerr << file << ":" << line << ": assertion failed: " << expression << std::endl;
  std::exit(1);
}

#define EXPECT_TRUE(condition) \
  do { \
    if (!(condition)) { \
      Fail(#condition, __FILE__, __LINE__); \
    } \
  } while (false)

#define EXPECT_FALSE(condition) EXPECT_TRUE(!(condition))

#define EXPECT_EQ(expected, actual) \
  do { \
    const auto expected_value = (expected); \
    const auto actual_value = (actual); \
    if (!(expected_value == actual_value)) { \
      std::cerr << __FILE__ << ":" << __LINE__ \
                << ": expected equality for " << #expected << " and " << #actual << std::endl; \
      std::exit(1); \
    } \
  } while (false)

void TestFullSymbolTableReturnsSupported() {
  FakeLoaderEnv env = {};
  const PdfiumOutlineFns complete_fns = MakeCompleteOutlineFns();
  InstallSymbols(&env, complete_fns);

  OutlineLoaderState state = {};
  const OutlineLoaderDeps deps = MakeDeps(&env);

  const OutlineLoadAttemptResult result = EnsureOutlinePdfiumLoaded(&state, &deps);

  EXPECT_TRUE(result.loaded);
  EXPECT_FALSE(result.transitioned_to_unsupported);
  EXPECT_EQ(OutlineLoadState::kSupported, state.load_state);
  EXPECT_TRUE(state.handle != nullptr);
  EXPECT_TRUE(HasCompleteOutlineFns(state.fns));
  EXPECT_EQ(1, env.dlopen_calls);
  EXPECT_EQ(7, env.dlsym_calls);
  EXPECT_EQ(0, env.dlclose_calls);
}

void TestMissingLibraryReturnsUnsupported() {
  FakeLoaderEnv env = {};
  env.library_handle = nullptr;

  OutlineLoaderState state = {};
  const OutlineLoaderDeps deps = MakeDeps(&env);

  const OutlineLoadAttemptResult result = EnsureOutlinePdfiumLoaded(&state, &deps);

  EXPECT_FALSE(result.loaded);
  EXPECT_TRUE(result.transitioned_to_unsupported);
  EXPECT_EQ(OutlineLoadState::kUnsupported, state.load_state);
  EXPECT_TRUE(state.handle == nullptr);
  EXPECT_FALSE(HasCompleteOutlineFns(state.fns));
  EXPECT_EQ(1, env.dlopen_calls);
  EXPECT_EQ(0, env.dlsym_calls);
  EXPECT_EQ(0, env.dlclose_calls);
}

void TestMissingSymbolReturnsUnsupportedAndClosesHandle() {
  FakeLoaderEnv env = {};
  const PdfiumOutlineFns partial_fns = MakeCompleteOutlineFns();
  InstallSymbols(&env, partial_fns);
  env.symbols.erase("FPDFBookmark_GetDest");

  OutlineLoaderState state = {};
  const OutlineLoaderDeps deps = MakeDeps(&env);

  const OutlineLoadAttemptResult result = EnsureOutlinePdfiumLoaded(&state, &deps);

  EXPECT_FALSE(result.loaded);
  EXPECT_TRUE(result.transitioned_to_unsupported);
  EXPECT_EQ(OutlineLoadState::kUnsupported, state.load_state);
  EXPECT_TRUE(state.handle == nullptr);
  EXPECT_FALSE(HasCompleteOutlineFns(state.fns));
  EXPECT_EQ(1, env.dlopen_calls);
  EXPECT_EQ(7, env.dlsym_calls);
  EXPECT_EQ(1, env.dlclose_calls);
}

void TestRepeatedCallsAfterFailureStayUnsupported() {
  FakeLoaderEnv env = {};
  const PdfiumOutlineFns partial_fns = MakeCompleteOutlineFns();
  InstallSymbols(&env, partial_fns);
  env.symbols.erase("FPDFDest_GetPageIndex");

  OutlineLoaderState state = {};
  const OutlineLoaderDeps deps = MakeDeps(&env);

  const OutlineLoadAttemptResult first = EnsureOutlinePdfiumLoaded(&state, &deps);
  EXPECT_FALSE(first.loaded);
  EXPECT_TRUE(first.transitioned_to_unsupported);
  EXPECT_EQ(OutlineLoadState::kUnsupported, state.load_state);
  EXPECT_TRUE(state.handle == nullptr);
  EXPECT_FALSE(HasCompleteOutlineFns(state.fns));
  EXPECT_EQ(1, env.dlopen_calls);
  EXPECT_EQ(7, env.dlsym_calls);
  EXPECT_EQ(1, env.dlclose_calls);

  const OutlineLoadAttemptResult second = EnsureOutlinePdfiumLoaded(&state, &deps);
  EXPECT_FALSE(second.loaded);
  EXPECT_FALSE(second.transitioned_to_unsupported);
  EXPECT_EQ(OutlineLoadState::kUnsupported, state.load_state);
  EXPECT_TRUE(state.handle == nullptr);
  EXPECT_FALSE(HasCompleteOutlineFns(state.fns));
  EXPECT_EQ(1, env.dlopen_calls);
  EXPECT_EQ(7, env.dlsym_calls);
  EXPECT_EQ(1, env.dlclose_calls);
}

}  // namespace

int main() {
  TestFullSymbolTableReturnsSupported();
  TestMissingLibraryReturnsUnsupported();
  TestMissingSymbolReturnsUnsupportedAndClosesHandle();
  TestRepeatedCallsAfterFailureStayUnsupported();
  return 0;
}
