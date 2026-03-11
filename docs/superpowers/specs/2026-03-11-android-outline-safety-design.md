# Android Outline Safety Design

## Summary

Fix the Android outline crash in `@papyrus-sdk/engine-native` by making outline support an explicit runtime capability instead of inferring it from `System.loadLibrary("papyrus_text")`.

The implementation must ensure that:

- Missing PDFium outline symbols never lead to a JNI call that can dereference an invalid function pointer.
- Unsupported builds fail closed and return no outline data.
- Java can query support safely before calling `nativeGetOutline()` or `nativeGetOutlineFile()`.

## Problem

`PapyrusNativeEngineModule.getOutline()` currently treats `PapyrusOutline.AVAILABLE` as "outline is usable on this build". That is incorrect.

Today, `PapyrusOutline.AVAILABLE` only confirms that `libpapyrus_text.so` loaded. The native outline loader in `papyrus_outline.cpp` then attempts to resolve PDFium symbols dynamically from `libmodpdfium.so`.

If one or more required symbols are missing:

- `LoadPdfium()` logs the failure and returns `false`
- but it also leaves the native cache in an inconsistent state
- future calls can treat outline support as available even though the symbol table is incomplete
- JNI can then call through null or invalid function pointers
- Android terminates the process with `SIGSEGV`

This failure cannot be contained by Java or JS `try/catch` once execution has crossed into unsafe native code.

## Goals

- Prevent process crashes when outline support is unavailable in a given Android build.
- Expose outline support as an explicit, queryable native capability.
- Preserve the existing user-facing behavior of returning an empty outline when the feature is unavailable.
- Keep the fix local to the Android native engine package.

## Non-Goals

- Changing the JS API for outline consumers.
- Adding new outline functionality beyond safe capability detection.
- Refactoring text search or text selection in the same change.

## Approaches Considered

### 1. Recommended: Explicit capability probe plus fail-closed native cache

Add a native `nativeIsOutlineSupported()` probe and make `PapyrusOutline.AVAILABLE` depend on that probe, not just on successful JNI library loading.

Pros:

- Fixes the root cause.
- Gives Java a truthful capability signal.
- Prevents entry into unsafe JNI paths.
- Keeps app behavior simple: unsupported outline returns empty data.

Cons:

- Adds a small JNI API surface change.

### 2. Fix native cache only

Make `LoadPdfium()` fail closed, but leave `PapyrusOutline.AVAILABLE` as a pure library-load flag.

Pros:

- Smaller patch.

Cons:

- Java still has a misleading availability contract.
- The module would still attempt JNI calls that are known to be unsupported.

### 3. Build-time or packaging validation

Reject builds where required outline symbols are missing.

Pros:

- Strong guarantee at packaging time.

Cons:

- Higher scope and more infrastructure work than needed for this bugfix.
- Does not improve runtime capability reporting.

## Recommended Design

### Native state model

Replace the boolean cache in `papyrus_outline.cpp` with an explicit load state:

- `uninitialized`
- `supported`
- `unsupported`

`LoadPdfium()` will:

1. Return immediately when the state is already `supported` or `unsupported`.
2. Attempt `dlopen("libmodpdfium.so")`.
3. Resolve all required outline-related PDFium symbols.
4. Mark the state as `supported` only if every symbol is available.
5. On any failure:
   - clear the resolved function table
   - close and clear the library handle if it was opened
   - mark the state as `unsupported`
   - return `false`

This makes failure deterministic and repeat-safe. Once a build is determined to lack outline support, every later call returns `false` without touching partial state.

### Native capability probe

Add a JNI function:

- `PapyrusOutline.nativeIsOutlineSupported()`

Behavior:

- returns `true` only when `LoadPdfium()` succeeds with a complete symbol table
- returns `false` on missing library or missing symbols
- never enters outline-building logic

### Java availability contract

Update `PapyrusOutline.java` so `AVAILABLE` means:

- the JNI library loaded successfully, and
- outline support is confirmed by the native probe

Static initialization flow:

1. attempt `System.loadLibrary("papyrus_text")`
2. if loading fails, set `AVAILABLE = false`
3. if loading succeeds, call `nativeIsOutlineSupported()`
4. if the probe throws or returns `false`, set `AVAILABLE = false`

This gives Java a truthful, fail-closed capability signal.

To make this behavior testable in a plain JVM unit test, `PapyrusOutline.java` will add a package-private helper that computes availability from injected collaborators:

- a library loader function
- an outline-support probe function

The static initializer will call that helper with the real JNI loader and native probe. Unit tests will call the helper with fakes, so the production API stays unchanged while the fail-closed contract becomes executable.

### Module behavior

`PapyrusNativeEngineModule.getOutline()` keeps its current external contract:

- if there is no engine or no document, resolve `[]`
- if `PapyrusOutline.AVAILABLE` is `false`, resolve `[]`
- if a native call returns `null`, resolve `[]`
- if a Java exception occurs, resolve `[]`

The important change is that unsupported builds never call the unsafe outline JNI entry points.

The Kotlin Expo module already reads `PapyrusOutline.AVAILABLE`, so no separate capability implementation is needed there. The verification plan must still compile the Expo example to ensure the shared Java contract remains source-compatible for both consumers.

## Data Flow

### Supported build

1. Java loads `papyrus_text`.
2. Java calls `nativeIsOutlineSupported()`.
3. Native outline loader resolves every required PDFium symbol.
4. `AVAILABLE` becomes `true`.
5. `getOutline()` may call `nativeGetOutline()` or `nativeGetOutlineFile()`.

### Unsupported build

1. Java loads `papyrus_text`.
2. Java calls `nativeIsOutlineSupported()`.
3. Native outline loader detects a missing library or symbol.
4. Native state becomes `unsupported`.
5. `AVAILABLE` becomes `false`.
6. `getOutline()` resolves an empty array without entering outline JNI.

## Error Handling

- Missing `libmodpdfium.so`: log once, mark `unsupported`, return `false`.
- Missing required symbols: log once, clear partial state, mark `unsupported`, return `false`.
- Null document pointer or file path: return `null` from native outline getters as today.
- Java static initialization failure: swallow and set `AVAILABLE = false`.

The failure mode must always be "no outline" rather than "process crash".

## Testing Strategy

The implementation will add two executable regression layers plus consumer compile verification.

### 1. Java unit coverage for the fail-closed contract

Add a JVM unit test for the new package-private availability helper in `PapyrusOutline.java`.

The test matrix must cover:

- library load succeeds and probe returns `true` -> availability is `true`
- library load succeeds and probe returns `false` -> availability is `false`
- library load succeeds and probe throws -> availability is `false`
- library load throws -> availability is `false`

This avoids real JNI loading in the test while still locking in the exact contract used by the static initializer.

Expected verification task:

- `examples/mobile/android/gradlew.bat :papyrus_engine_native:testDebugUnitTest`

### 2. Native loader-state regression coverage

Extract the PDFium outline loader state machine into a small helper that does not depend on JNI object handling and that accepts injectable resolver callbacks for:

- `dlopen`
- `dlsym`
- `dlclose`

Add a focused host-side native test for that helper covering:

- full symbol table -> `supported`
- missing library -> `unsupported`
- missing symbol -> `unsupported`
- repeated calls after failure stay `unsupported` and do not reuse partial state

The helper must also expose cleanup behavior so the test can verify that a partial load clears the function table and closes any opened handle.

Expected verification command sequence:

- `cmake -S packages/engine-native/android/src/main/cpp -B tmp/papyrus-outline-tests -DPAPYRUS_OUTLINE_HOST_TESTS=ON`
- `cmake --build tmp/papyrus-outline-tests --config Debug`
- `ctest --test-dir tmp/papyrus-outline-tests -C Debug --output-on-failure`

### 3. Consumer compile verification

Run Android builds for both example consumers to ensure the shared `PapyrusOutline` contract still compiles in the React Native and Expo paths.

Expected verification tasks:

- `examples/mobile/android/gradlew.bat :app:assembleDebug`
- `examples/mobile-expo/android/gradlew.bat :app:assembleDebug`

### 4. Structural acceptance criteria

In addition to executable tests, the final patch must still satisfy these source-level invariants:

- a distinct `unsupported` state exists
- failure clears the function table
- failure closes and clears the library handle
- every public JNI outline entry point checks `LoadPdfium()` before using function pointers
- `nativeIsOutlineSupported()` does not call outline-building logic

If the local environment cannot execute some verification commands, report that explicitly and keep completion claims limited to the commands that did run successfully.

## Implementation Boundaries

- Modify only the Android outline-native and outline-Java integration points required for this fix.
- Do not change consumer-facing JS code in this patch.
- Do not broaden the patch into other optional native capabilities unless verification shows a shared defect that directly blocks this fix. `PapyrusTextSearch` and `PapyrusTextSelect` may still use the older availability pattern, but they are out of scope here because the confirmed crash path being fixed is outline-specific.
