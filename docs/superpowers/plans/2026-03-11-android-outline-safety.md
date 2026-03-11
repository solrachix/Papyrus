# Android Outline Safety Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Android outline support fail closed in `@papyrus-sdk/engine-native` so unsupported PDFium builds return no outline instead of crashing the app process.

**Architecture:** Split the fix into a Java capability contract and a native loader-state machine. Java will expose a testable availability helper and gate outline JNI calls up front, while native code will move PDFium outline symbol loading into an explicit `supported`/`unsupported` helper that can be tested on the host with injected resolvers. Final verification will compile both Android example consumers that depend on the shared `PapyrusOutline` contract.

**Tech Stack:** Java, Kotlin/Expo module compatibility, C++17, Android JNI, CMake, Gradle, JUnit 4

---

## Chunk 1: Android Outline Safety

### Task 1: Add Java availability seam and failing unit tests

**Files:**
- Modify: `packages/engine-native/android/build.gradle`
- Modify: `packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusOutline.java`
- Create: `packages/engine-native/android/src/test/java/com/papyrus/engine/PapyrusOutlineTest.java`
- Spec: `docs/superpowers/specs/2026-03-11-android-outline-safety-design.md`

- [ ] **Step 1: Add JUnit support for Android unit tests**

Update `packages/engine-native/android/build.gradle` to add the minimal JVM unit test dependency required by the new test class.

```gradle
dependencies {
  implementation 'com.facebook.react:react-android'
  implementation('io.github.oothp:pdfium-android:1.9.5-beta01') {
    exclude group: 'com.android.support'
  }
  testImplementation 'junit:junit:4.13.2'
}
```

- [ ] **Step 2: Write the failing Java unit tests**

Create `packages/engine-native/android/src/test/java/com/papyrus/engine/PapyrusOutlineTest.java` covering the availability helper contract.

```java
package com.papyrus.engine;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class PapyrusOutlineTest {
  @Test
  public void computeAvailabilityReturnsTrueWhenLoaderAndProbeSucceed() {
    boolean available = PapyrusOutline.computeAvailability(() -> {}, () -> true);
    assertTrue(available);
  }

  @Test
  public void computeAvailabilityReturnsFalseWhenProbeReturnsFalse() {
    boolean available = PapyrusOutline.computeAvailability(() -> {}, () -> false);
    assertFalse(available);
  }

  @Test
  public void computeAvailabilityReturnsFalseWhenProbeThrows() {
    boolean available = PapyrusOutline.computeAvailability(() -> {}, () -> {
      throw new UnsatisfiedLinkError("missing probe");
    });
    assertFalse(available);
  }

  @Test
  public void computeAvailabilityReturnsFalseWhenLibraryLoadThrows() {
    boolean available = PapyrusOutline.computeAvailability(() -> {
      throw new UnsatisfiedLinkError("missing lib");
    }, () -> true);
    assertFalse(available);
  }
}
```

- [ ] **Step 3: Run the unit test task to verify it fails**

Run: `.\gradlew.bat :papyrus_engine_native:testDebugUnitTest --tests com.papyrus.engine.PapyrusOutlineTest`

Working directory: `examples/mobile/android`

Expected: FAIL because `PapyrusOutline.computeAvailability(...)` does not exist yet.

- [ ] **Step 4: Implement the minimal Java seam**

Update `packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusOutline.java` to add:

- a package-private `LibraryLoader` functional interface
- a package-private `OutlineSupportProbe` functional interface
- a package-private static `computeAvailability(LibraryLoader, OutlineSupportProbe)` helper
- static initialization that calls the helper with `System.loadLibrary("papyrus_text")` and `PapyrusOutline::nativeIsOutlineSupported`
- a new native declaration `nativeIsOutlineSupported()`

Implementation sketch:

```java
package com.papyrus.engine;

final class PapyrusOutline {
  interface LibraryLoader {
    void load() throws Throwable;
  }

  interface OutlineSupportProbe {
    boolean isSupported() throws Throwable;
  }

  static final boolean AVAILABLE;

  static {
    AVAILABLE = computeAvailability(
        () -> System.loadLibrary("papyrus_text"),
        PapyrusOutline::nativeIsOutlineSupported);
  }

  static boolean computeAvailability(LibraryLoader loader, OutlineSupportProbe probe) {
    try {
      loader.load();
      return probe.isSupported();
    } catch (Throwable ignored) {
      return false;
    }
  }

  static native boolean nativeIsOutlineSupported();
  static native PapyrusOutlineItem[] nativeGetOutline(long docPtr);
  static native PapyrusOutlineItem[] nativeGetOutlineFile(String filePath);
}
```

- [ ] **Step 5: Run the unit test task to verify it passes**

Run: `.\gradlew.bat :papyrus_engine_native:testDebugUnitTest --tests com.papyrus.engine.PapyrusOutlineTest`

Working directory: `examples/mobile/android`

Expected: PASS with 4 tests passing.

- [ ] **Step 6: Commit the Java seam**

```bash
git add packages/engine-native/android/build.gradle packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusOutline.java packages/engine-native/android/src/test/java/com/papyrus/engine/PapyrusOutlineTest.java
git commit -m "test: add outline availability contract coverage"
```

### Task 2: Extract native outline loader helper and cover failure caching

**Files:**
- Create: `packages/engine-native/android/src/main/cpp/papyrus_outline_loader.h`
- Create: `packages/engine-native/android/src/main/cpp/papyrus_outline_loader.cpp`
- Create: `packages/engine-native/android/src/main/cpp/papyrus_outline_loader_test.cpp`
- Modify: `packages/engine-native/android/src/main/cpp/papyrus_outline.cpp`
- Modify: `packages/engine-native/android/src/main/cpp/CMakeLists.txt`
- Spec: `docs/superpowers/specs/2026-03-11-android-outline-safety-design.md`

- [ ] **Step 1: Write the failing host-side native tests**

Create `packages/engine-native/android/src/main/cpp/papyrus_outline_loader_test.cpp` with a tiny self-contained test harness using injected fake resolvers.

Coverage to encode:

```cpp
int main() {
  TestFullSymbolTableReturnsSupported();
  TestMissingLibraryReturnsUnsupported();
  TestMissingSymbolReturnsUnsupportedAndClosesHandle();
  TestRepeatedCallsAfterFailureStayUnsupported();
  return 0;
}
```

Each test should assert against:

- returned load state
- whether function pointers were cleared on failure
- whether `dlclose` was called when a partial load failed
- whether a second call after failure avoids reusing partial state

- [ ] **Step 2: Run the host test build to verify it fails**

Run: `cmake -S packages/engine-native/android/src/main/cpp -B tmp/papyrus-outline-tests -DPAPYRUS_OUTLINE_HOST_TESTS=ON`

Run: `cmake --build tmp/papyrus-outline-tests --config Debug`

Run: `ctest --test-dir tmp/papyrus-outline-tests -C Debug --output-on-failure`

Expected: FAIL because the extracted loader helper and test target do not exist yet.

- [ ] **Step 3: Implement the native loader helper**

Create `packages/engine-native/android/src/main/cpp/papyrus_outline_loader.h` and `.cpp` with:

- `enum class OutlineLoadState { kUninitialized, kSupported, kUnsupported };`
- a `PdfiumOutlineFns` struct containing only outline-related PDFium pointers
- a `OutlineLoaderDeps` struct containing `dlopen`, `dlsym`, and `dlclose` callbacks
- a `OutlineLoaderState` struct containing handle, function table, and load state
- a `OutlineLoadAttemptResult` struct containing `loaded` and `transitioned_to_unsupported`
- `OutlineLoadAttemptResult EnsureOutlinePdfiumLoaded(OutlineLoaderState*, const OutlineLoaderDeps*)`
- `void ResetOutlineLoaderState(OutlineLoaderState*, const OutlineLoaderDeps*)`
- `bool HasCompleteOutlineFns(const PdfiumOutlineFns&)`

Implementation rules:

- the helper must not include JNI or Android logging headers
- on any failure it must clear the function table, close the handle if present, and set state to `kUnsupported`
- once state is `kUnsupported`, later calls must return `false` immediately

- [ ] **Step 4: Wire the helper into the Android JNI source**

Update `packages/engine-native/android/src/main/cpp/papyrus_outline.cpp` to:

- replace the ad hoc globals with `OutlineLoaderState`
- provide real `dlopen`/`dlsym`/`dlclose` adapters
- keep Android logging in this file only
- delegate all loader work to `EnsureOutlinePdfiumLoaded(...)`
- log only when the loader transitions into `kUnsupported`, not on every later cached failure
- preserve the existing outline-building logic once loading succeeds

Implementation sketch:

```cpp
static OutlineLoaderState g_outlineLoader = {};

static bool LoadPdfium() {
  const OutlineLoadAttemptResult result =
      EnsureOutlinePdfiumLoaded(&g_outlineLoader, &kOutlineLoaderDeps);
  if (!result.loaded && result.transitioned_to_unsupported) {
    LOGE("Failed to load required PDFium symbols for outline");
  }
  return result.loaded;
}
```

- [ ] **Step 5: Update CMake to support Android build and host tests**

Update `packages/engine-native/android/src/main/cpp/CMakeLists.txt` so that:

- Android builds compile `papyrus_text` with `papyrus_outline_loader.cpp`
- host tests can be enabled with `PAPYRUS_OUTLINE_HOST_TESTS=ON`
- host configure/build does not compile `papyrus_outline.cpp` or link Android-only libraries
- `ctest` discovers the host test executable

Sketch:

```cmake
option(PAPYRUS_OUTLINE_HOST_TESTS "Build host tests for outline loader" OFF)

if(ANDROID)
  add_library(papyrus_text SHARED
    papyrus_text_search.cpp
    papyrus_outline.cpp
    papyrus_outline_loader.cpp
  )

  find_library(log-lib log)
  find_library(android-lib android)
  find_library(dl-lib dl)

  target_link_libraries(papyrus_text
    ${log-lib}
    ${android-lib}
    ${dl-lib}
  )
endif()

if(PAPYRUS_OUTLINE_HOST_TESTS)
  enable_testing()
  add_executable(papyrus_outline_loader_test
    papyrus_outline_loader.cpp
    papyrus_outline_loader_test.cpp
  )
  add_test(NAME papyrus_outline_loader_test COMMAND papyrus_outline_loader_test)
endif()
```

- [ ] **Step 6: Run the host test build to verify it passes**

Run: `cmake -S packages/engine-native/android/src/main/cpp -B tmp/papyrus-outline-tests -DPAPYRUS_OUTLINE_HOST_TESTS=ON`

Run: `cmake --build tmp/papyrus-outline-tests --config Debug`

Run: `ctest --test-dir tmp/papyrus-outline-tests -C Debug --output-on-failure`

Expected: PASS with the outline loader host tests succeeding.

- [ ] **Step 7: Commit the native loader helper**

```bash
git add packages/engine-native/android/src/main/cpp/CMakeLists.txt packages/engine-native/android/src/main/cpp/papyrus_outline.cpp packages/engine-native/android/src/main/cpp/papyrus_outline_loader.h packages/engine-native/android/src/main/cpp/papyrus_outline_loader.cpp packages/engine-native/android/src/main/cpp/papyrus_outline_loader_test.cpp
git commit -m "fix: harden android outline loader state"
```

### Task 3: Add the native probe and verify both Android consumers still build

**Files:**
- Modify: `packages/engine-native/android/src/main/cpp/papyrus_outline.cpp`
- Modify: `packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusOutline.java`
- Verify: exported symbol in built `libpapyrus_text.so`
- Verify: `examples/mobile/android`
- Verify: `examples/mobile-expo/android`
- Spec: `docs/superpowers/specs/2026-03-11-android-outline-safety-design.md`

- [ ] **Step 1: Write the failing integration expectation**

Use a symbol-export smoke check as the red-phase verification for the new JNI entry point.

1. Build the Android library:
   `.\gradlew.bat :papyrus_engine_native:assembleDebug`
2. Locate the generated `libpapyrus_text.so` under `packages/engine-native/android/build/intermediates/cxx/Debug/**/obj/**/libpapyrus_text.so`
3. Inspect its exported symbols with the NDK LLVM tool:

```powershell
$so = Get-ChildItem -Path '..\..\..\packages\engine-native\android\build\intermediates\cxx' -Recurse -Filter 'libpapyrus_text.so' |
  Select-Object -First 1 -ExpandProperty FullName
$ndkRoot = if ($env:ANDROID_NDK_ROOT) { $env:ANDROID_NDK_ROOT } else { Join-Path $env:ANDROID_SDK_ROOT 'ndk\26.1.10909125' }
$llvmReadobj = Join-Path $ndkRoot 'toolchains\llvm\prebuilt\windows-x86_64\bin\llvm-readobj.exe'
& $llvmReadobj --dyn-symbols $so | Select-String 'Java_com_papyrus_engine_PapyrusOutline_nativeIsOutlineSupported'
```

Working directory: `examples/mobile/android`

Expected: the symbol check returns no match until `nativeIsOutlineSupported()` is implemented and exported from `papyrus_outline.cpp`.

- [ ] **Step 2: Implement the native support probe**

Update `packages/engine-native/android/src/main/cpp/papyrus_outline.cpp` to export:

```cpp
extern "C" JNIEXPORT jboolean JNICALL
Java_com_papyrus_engine_PapyrusOutline_nativeIsOutlineSupported(JNIEnv *, jclass) {
  return LoadPdfium() ? JNI_TRUE : JNI_FALSE;
}
```

Guard both `nativeGetOutline()` and `nativeGetOutlineFile()` by the same `LoadPdfium()` path so they return `nullptr` immediately when outline support is unavailable.

- [ ] **Step 3: Run the Java unit test task to verify it stays green**

Run: `.\gradlew.bat :papyrus_engine_native:testDebugUnitTest --tests com.papyrus.engine.PapyrusOutlineTest`

Working directory: `examples/mobile/android`

Expected: PASS with the availability-helper tests still green after the native declaration is wired.

- [ ] **Step 4: Re-run the JNI export smoke check**

Run:

```powershell
$so = Get-ChildItem -Path '..\..\..\packages\engine-native\android\build\intermediates\cxx' -Recurse -Filter 'libpapyrus_text.so' |
  Select-Object -First 1 -ExpandProperty FullName
$ndkRoot = if ($env:ANDROID_NDK_ROOT) { $env:ANDROID_NDK_ROOT } elseif ($env:ANDROID_SDK_ROOT) { Join-Path $env:ANDROID_SDK_ROOT 'ndk\26.1.10909125' } else { throw 'Set ANDROID_NDK_ROOT or ANDROID_SDK_ROOT before running the symbol check.' }
$llvmReadobj = Join-Path $ndkRoot 'toolchains\llvm\prebuilt\windows-x86_64\bin\llvm-readobj.exe'
& $llvmReadobj --dyn-symbols $so | Select-String 'Java_com_papyrus_engine_PapyrusOutline_nativeIsOutlineSupported'
```

Working directory: `examples/mobile/android`

Expected: one exported symbol match for `Java_com_papyrus_engine_PapyrusOutline_nativeIsOutlineSupported`.

- [ ] **Step 5: Compile the React Native example app**

Run: `.\gradlew.bat :app:assembleDebug`

Working directory: `examples/mobile/android`

Expected: PASS, including successful compilation of `:papyrus_engine_native`.

- [ ] **Step 6: Compile the Expo example app**

Run: `.\gradlew.bat :app:assembleDebug`

Working directory: `examples/mobile-expo/android`

Expected: PASS, proving the shared `PapyrusOutline.AVAILABLE` contract still compiles for the Kotlin consumer.

- [ ] **Step 7: Commit the probe integration**

```bash
git add packages/engine-native/android/src/main/cpp/papyrus_outline.cpp packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusOutline.java
git commit -m "fix: gate android outline access by native support probe"
```

### Task 4: Final verification and handoff

**Files:**
- Verify only

- [ ] **Step 1: Re-run the full verification set**

Run these commands fresh:

1. `.\gradlew.bat :papyrus_engine_native:testDebugUnitTest`
   Working directory: `examples/mobile/android`
2. `cmake -S packages/engine-native/android/src/main/cpp -B tmp/papyrus-outline-tests -DPAPYRUS_OUTLINE_HOST_TESTS=ON`
   Working directory: repo root
3. `cmake --build tmp/papyrus-outline-tests --config Debug`
   Working directory: repo root
4. `ctest --test-dir tmp/papyrus-outline-tests -C Debug --output-on-failure`
   Working directory: repo root
5. `.\gradlew.bat :papyrus_engine_native:assembleDebug`
   Working directory: `examples/mobile/android`
6. 
   ```powershell
   $so = Get-ChildItem -Path '..\..\..\packages\engine-native\android\build\intermediates\cxx' -Recurse -Filter 'libpapyrus_text.so' |
     Select-Object -First 1 -ExpandProperty FullName
   $ndkRoot = if ($env:ANDROID_NDK_ROOT) { $env:ANDROID_NDK_ROOT } elseif ($env:ANDROID_SDK_ROOT) { Join-Path $env:ANDROID_SDK_ROOT 'ndk\26.1.10909125' } else { throw 'Set ANDROID_NDK_ROOT or ANDROID_SDK_ROOT before running the symbol check.' }
   $llvmReadobj = Join-Path $ndkRoot 'toolchains\llvm\prebuilt\windows-x86_64\bin\llvm-readobj.exe'
   & $llvmReadobj --dyn-symbols $so | Select-String 'Java_com_papyrus_engine_PapyrusOutline_nativeIsOutlineSupported'
   ```
   Working directory: `examples/mobile/android`
7. `.\gradlew.bat :app:assembleDebug`
   Working directory: `examples/mobile/android`
8. `.\gradlew.bat :app:assembleDebug`
   Working directory: `examples/mobile-expo/android`

Expected: all commands exit successfully.

- [ ] **Step 2: Review the diff for scope**

Run: `git diff --stat d471b67..HEAD -- packages/engine-native/android docs/superpowers/specs/2026-03-11-android-outline-safety-design.md docs/superpowers/plans/2026-03-11-android-outline-safety.md`

Here, `d471b67` is the spec-approval commit created before implementation starts.

Expected: only Android outline availability, tests, and supporting build/test files are included.

- [ ] **Step 3: Prepare branch completion**

After verification, use `superpowers:requesting-code-review` or the repo's review workflow, then finish with `superpowers:finishing-a-development-branch`.
