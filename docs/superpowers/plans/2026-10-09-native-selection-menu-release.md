# Native selection menus — release preparation

## Decisions

- PDF Android: native floating ActionMode replaces the React toolbar; long press and double tap select words, existing handles extend the range. Copy uses native clipboard; annotation intents are persisted by the JS store. Define is restricted without blocking phrase selection.
- PDF iOS: shared word-selection entry for long press and double tap; public PDFKit setCurrentSelection with visible blue color. Native menu preserves system commands and localized labels.
- EPUB: one WebView native menu replaces the duplicate React toolbar. Actions use the current chapter CFI/session snapshot, not the root-frame selectedText. Stable menu item positions prevent Android actions changing meaning during handle movement. Multi-word Define shows a localized instruction; other actions remain available. Copy and Select All are implemented explicitly. WebView menuItems does not support custom icons.
- TXT: localize native Copy/Select All and add supported annotation icons. Reject obsolete PrecomputedText after a font change to avoid a native crash.

## Deferred TXT bug (explicit user decision)

**Open technical debt: Android TXT long press initially selects a full line instead of the touched word.** Reproduced on Pixel 7 API 35 with the bundled text sample. Disabling Android TextClassifier did not resolve it. Native handles and contextual menu still work. The experimental initial-word override was removed rather than released without device validation. Return to this issue separately, including UTF-16, accents, combining marks, line wrapping, first selection and handle extension. Do not mark it fixed by unit/source tests.

## Validation

- 483 focused SDK tests passed before removing the unvalidated TXT experiment; rerun recorded in release report.
- Android native suite, debug assembly and SDK builds are required before packing.
- Reviewer found positional WebView action drift and PDF long-press replacement issues; both fixed and reviewed again.
- Native Android PDF floating menu observed on Pixel. Complete EPUB annotation CRUD and physical iOS word/handle smoke remain pending.
- macOS compilation and iPhone gesture validation are required before a store release; npm tarball builds do not establish iOS runtime correctness.

## Release

Prepared versions: types 0.2.16-beta.3, core 0.2.23-beta.3, engine-native 0.2.22-beta.7, ui-react-native 0.2.35-beta.9. Publish in that dependency order. App uses freshly packed content-addressed local tarballs until registry publication is confirmed. No OTA or store build is part of this preparation. These native changes require a new compatible binary/runtime.
