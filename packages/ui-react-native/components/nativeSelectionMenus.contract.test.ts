import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const read=(p:string)=>readFileSync(p,'utf8');
const native='packages/engine-native/';
const ui='packages/ui-react-native/components/';
describe('one native text-selection menu per renderer',()=>{
 it('PDF Android has a floating menu, a cancellable long press and annotation intents',()=>{
  const s=read(native+'android/src/main/java/com/papyrus/engine/PapyrusPdfViewerView.java');
  expect(s).toContain('ActionMode.TYPE_FLOATING');
  expect(s).toContain('cancelPendingLongPress');
  expect(s).toContain('ViewConfiguration.getLongPressTimeout()');
  expect(s).toContain('onAnnotateSelection');
  expect(read(ui+'DedicatedAndroidPdfViewer.tsx')).not.toContain('selectionToolbar');
 });
 it('EPUB uses WebView native menu and chapter CFI snapshots rather than callback text',()=>{
  const s=read(ui+'WebViewViewer.tsx');
  expect(s).toContain('menuItems={');
  expect(s).toContain('onCustomMenuSelection={');
  expect(s).not.toContain('styles.selectionActions');
  expect(s).toContain('EPUB_SELECTION_ACTION');
  expect(s).not.toContain('nativeEvent.selectedText');
 });
 it('TXT localizes Copy and rejects stale typography results',()=>{
  const s=read(native+'android/src/main/java/com/papyrus/engine/PapyrusTextDocumentView.java');
  expect(s).toContain('android.R.id.copy');
  expect(s).toContain('TextClassifier.NO_OP');
  expect(s).toContain('textView.getTextMetricsParams().equals(params)');
  expect(read(ui+'NativeTextDocumentViewer.tsx')).toContain('copy: t.copy');
 });
 it('PDF iOS selects a visible word on long press using public PDFKit API',()=>{
  const s=read(native+'ios/PapyrusPdfDocumentView.m');
  expect(s).toContain('handleDocumentLongPress:');
  expect(s).toContain('setCurrentSelection:selection animate:NO');
 });
});
