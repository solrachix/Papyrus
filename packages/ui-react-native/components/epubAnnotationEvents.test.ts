import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {parseEpubAnnotationEvent,resolveEpubInkMode} from './epubAnnotationEvents';
import type {Annotation} from '@papyrus-sdk/types';
const payload={documentSessionId:'s1',pageIndex:1,text:'word',anchor:{version:1,kind:'epub-cfi',cfiRange:'epubcfi(/6/2!/4/2:0)',href:'one.xhtml',quote:'word',documentId:'file1'}};
const event=(p=payload)=>JSON.stringify({type:'event',name:'EPUB_TEXT_SELECTED',payload:p});
describe('EPUB session boundary',()=>{
 it('accepts matching selection and stable identity',()=>expect(parseEpubAnnotationEvent(event(),'s1','file1')?.kind).toBe('selection'));
 it('rejects stale session and wrong file',()=>{expect(parseEpubAnnotationEvent(event(),'s2','file1')).toBeNull();expect(parseEpubAnnotationEvent(event(),'s1','file2')).toBeNull();});
 it('rejects malformed anchors and uncorrelated selection text',()=>{expect(parseEpubAnnotationEvent(event({...payload,text:'other'}),'s1')).toBeNull();expect(parseEpubAnnotationEvent('{','s1')).toBeNull();});
});

it('accepts a persisted EPUB ink commit only with a valid sidecar and legacy fallback',()=>{
 const data={version:1 as const,kind:'epub-ink' as const,documentId:'file1',segments:[{href:'one.xhtml',spineIndex:0,points:[{cfiRange:payload.anchor.cfiRange,quote:'w',x:0,y:0},{cfiRange:'epubcfi(/6/2!/4/2:1)',quote:'o',x:0.2,y:0}]}]};
 const annotation:Annotation={id:'ink-one',type:'ink',pageIndex:1,rect:{x:.1,y:.1,width:.2,height:.1},path:[{x:.1,y:.1},{x:.3,y:.2}],color:'#2563eb',opacity:1,strokeWidth:.006,createdAt:1,anchor:{...payload.anchor,quote:'w'},epubInk:data};
 const raw=JSON.stringify({type:'event',name:'EPUB_INK_CREATED',payload:{documentSessionId:'s1',annotation}});
 expect(parseEpubAnnotationEvent(raw,'s1','file1')).toMatchObject({kind:'ink',annotation:{id:'ink-one',epubInk:data,path:annotation.path}});
 expect(parseEpubAnnotationEvent(raw,'s2','file1')).toBeNull();
 expect(parseEpubAnnotationEvent(' '.repeat(750001),'s1','file1')).toBeNull();
 expect(parseEpubAnnotationEvent(JSON.stringify({type:'event',name:'EPUB_INK_CREATED',payload:{documentSessionId:'s1',annotation:{...annotation,epubInk:{...data,segments:[]}}}}),'s1','file1')).toBeNull();
});

describe('EPUB reader recovery contracts', () => {
 it('captures a CFI from selectionchange when rendition selected is missed', () => {
  const source=readFileSync(resolve(__dirname,'../runtime/runtime.js'),'utf8');
  const bundled=readFileSync(resolve(__dirname,'../runtime/index.html'),'utf8');
  for(const runtime of [source,bundled]) {
   expect(runtime).toContain("selectionDocument.addEventListener('selectionchange', handleSelectionChange)");
   expect(runtime).toContain("contents.cfiFromRange(range)");
   expect(runtime).toContain("if (text) reportSelection()");
   expect(runtime).toContain("if (selectionTimer !== null) clearTimeout(selectionTimer)");
   expect(runtime).toContain("PapyrusEpubReader.install(contents");
  }
 });
 it('does not reveal explicitly hidden chrome after WebView scrolling', () => {
  const viewer=readFileSync(resolve(__dirname,'Viewer.tsx'),'utf8');
  expect(viewer).not.toContain('setMobileChromeVisible(true, "scroll.webview.recover")');
 });
});

describe('EPUB drawing presets',()=>{
 const common={documentType:'epub',isLoaded:true,color:'#fbbf24',opacity:1,strokeWidth:.006};
 it('ships the live preview and preset bridge in both runtime copies',()=>{
  const runtimes=[
   readFileSync(resolve(__dirname,'../runtime/runtime.js'),'utf8'),
   readFileSync(resolve(__dirname,'../runtime/index.html'),'utf8'),
  ];
  for(const runtime of runtimes){
   expect(runtime).toContain('data-papyrus-ink-preview');
   expect(runtime).toContain('function inkStrokeWidthPx(width,preset)');
   expect(runtime).toContain("preset:['ink','highlight','underline'].indexOf(payload.preset)>=0?payload.preset:'ink'");
   expect(runtime).toContain('preset:inkConfig.preset');
  }
 });
 it.each(['ink','highlight','underline'] as const)('enables the %s preset in the EPUB WebView',preset=>{
  expect(resolveEpubInkMode({...common,activeTool:'ink',preset})).toEqual({enabled:true,preset,color:'#fbbf24',opacity:1,strokeWidth:.006});
 });
 it('disables drawing for selection and non-EPUB documents',()=>{
  expect(resolveEpubInkMode({...common,activeTool:'select',preset:'ink'})).toMatchObject({enabled:false});
  expect(resolveEpubInkMode({...common,documentType:'pdf',activeTool:'ink',preset:'ink'})).toBeNull();
 });
});
