import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {parseEpubAnnotationEvent} from './epubAnnotationEvents';
const payload={documentSessionId:'s1',pageIndex:1,text:'word',anchor:{version:1,kind:'epub-cfi',cfiRange:'epubcfi(/6/2!/4/2:0)',href:'one.xhtml',quote:'word',documentId:'file1'}};
const event=(p=payload)=>JSON.stringify({type:'event',name:'EPUB_TEXT_SELECTED',payload:p});
describe('EPUB session boundary',()=>{
 it('accepts matching selection and stable identity',()=>expect(parseEpubAnnotationEvent(event(),'s1','file1')?.kind).toBe('selection'));
 it('rejects stale session and wrong file',()=>{expect(parseEpubAnnotationEvent(event(),'s2','file1')).toBeNull();expect(parseEpubAnnotationEvent(event(),'s1','file2')).toBeNull();});
 it('rejects malformed anchors and uncorrelated selection text',()=>{expect(parseEpubAnnotationEvent(event({...payload,text:'other'}),'s1')).toBeNull();expect(parseEpubAnnotationEvent('{','s1')).toBeNull();});
});

describe('EPUB reader recovery contracts', () => {
 it('captures a CFI from selectionchange when rendition selected is missed', () => {
  const source=readFileSync(resolve(__dirname,'../runtime/runtime.js'),'utf8');
  const bundled=readFileSync(resolve(__dirname,'../runtime/index.html'),'utf8');
  for(const runtime of [source,bundled]) {
   expect(runtime).toContain("selectionDocument.addEventListener('selectionchange', handleSelectionChange)");
   expect(runtime).toContain("contents.cfiFromRange(range)");
   expect(runtime).toContain("setTimeout(reportSelection, 250)");
   expect(runtime).toContain("if (selectionTimer !== null) clearTimeout(selectionTimer)");
   expect(runtime).toContain("const selectedText = event?.target?.ownerDocument");
  }
 });
 it('does not permanently hide the chrome after scrolling within a WebView', () => {
  const viewer=readFileSync(resolve(__dirname,'Viewer.tsx'),'utf8');
  expect(viewer).toContain('setMobileChromeVisible(true, "scroll.webview.recover")');
 });
});
