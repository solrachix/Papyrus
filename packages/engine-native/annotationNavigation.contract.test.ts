import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const read=(file:string)=>readFileSync(new URL(file,import.meta.url),'utf8');
describe('explicit annotation navigation',()=>{
 it('preserves document identity when routing the native PDF viewer',()=>{const viewer=read('../ui-react-native/components/Viewer.tsx');expect(viewer).toContain('<NativePdfDocumentViewer engine={engine} documentId={documentId}');});
 it('exports the transient request on both managers',()=>{
  expect(read('./ios/PapyrusPdfDocumentViewManager.m')).toContain('RCT_EXPORT_VIEW_PROPERTY(annotationNavigationRequest, NSDictionary)');
  expect(read('./android/src/main/java/com/papyrus/engine/PapyrusPdfViewerViewManager.java')).toContain('@ReactProp(name = "annotationNavigationRequest")');
 });
 it('navigates to PDF geometry without changing selections or annotations',()=>{
  const source=read('./ios/PapyrusPdfDocumentView.m');
  const method=source.slice(source.indexOf('- (void)setAnnotationNavigationRequest:'),source.indexOf('- (void)setSelectedAnnotationId:'));
  expect(method).toContain('goToRect:rect onPage:page');expect(method).toContain('self.pdfView.document != document');
  expect(method).not.toContain('currentSelection');expect(method).not.toContain('highlightedSelections');expect(method).not.toContain('addAnnotation');
  const android=read('./android/src/main/java/com/papyrus/engine/PapyrusPdfViewerView.java');
  expect(android).toContain('frame.height * clamp(y, 0f, 1f)');expect(android).toContain('generation != annotationNavigationGeneration');
 });
});
