# PDF memory benchmark (Android)

Exercises the PDF engine without the reader UI: load, lay out every page, draw 40 pages, suspend, resume, close, repeated. No account, no reading session.

1. `python3 generate_pdfs.py` (needs PyMuPDF and Pillow) writes text PDFs of 50, 300, 1,000 and 3,000 pages and "scanned" PDFs (one full-page JPEG per page) of 100 and 300 pages.
2. Copy `PdfMemoryBenchReceiver.java.txt` into a **debug** source set of a host app as `com/papyrus/engine/PdfMemoryBenchReceiver.java` (same package: it uses the engine store directly), register it as an exported receiver in the debug manifest, and add `compileOnly 'io.github.oothp:pdfium-android:<version>'` to the app.
3. `adb push *.pdf /data/local/tmp/pdfbench/`, open the app, then:

```
adb shell am broadcast -n <package>/com.papyrus.engine.PdfMemoryBenchReceiver \
  --es path /data/local/tmp/pdfbench/texto-1000.pdf --es mode new --ei read 40 --ei opens 3
adb logcat -s PDFBENCH
```

`--es mode legacy` reproduces the behaviour before the page lifecycle fix (every page opened and never closed) in the same build.

## Results (Poco X5, native heap above the app's baseline, first open)

| Document | After layout (before → after) | After drawing 40 pages | After closing twice |
| --- | --- | --- | --- |
| Text, 50 pages | +4 → 0 MB | +6 → +2 MB | +4 → 0 MB |
| Text, 300 pages | +23 → +2 MB | +25 → +3 MB | +4 → 0 MB |
| Text, 1,000 pages | +75 → +5 MB | +71 → +7 MB | −3 → 0 MB |
| Text, 3,000 pages | +228 → +17 MB | +227 → +18 MB | +2 → 0 MB |
| Scanned, 100 pages (115 MB) | +126 → 0 MB | +218 → +48 MB | +93 → −17 MB |
| Scanned, 300 pages (344 MB) | +377 → +1 MB | +460 → +53 MB | +83 → −12 MB |

Layout time for 3,000 pages: 2,001 ms → 116 ms. Suspending returns to the baseline; resuming takes 2–32 ms.
