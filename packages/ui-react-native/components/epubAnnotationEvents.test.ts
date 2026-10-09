import {describe,it,expect} from 'vitest';
import {parseEpubAnnotationEvent} from './epubAnnotationEvents';
const payload={documentSessionId:'s1',pageIndex:1,text:'word',anchor:{version:1,kind:'epub-cfi',cfiRange:'epubcfi(/6/2!/4/2:0)',href:'one.xhtml',quote:'word',documentId:'file1'}};
const event=(p=payload)=>JSON.stringify({type:'event',name:'EPUB_TEXT_SELECTED',payload:p});
describe('EPUB session boundary',()=>{
 it('accepts matching selection and stable identity',()=>expect(parseEpubAnnotationEvent(event(),'s1','file1')?.kind).toBe('selection'));
 it('rejects stale session and wrong file',()=>{expect(parseEpubAnnotationEvent(event(),'s2','file1')).toBeNull();expect(parseEpubAnnotationEvent(event(),'s1','file2')).toBeNull();});
 it('rejects malformed anchors and uncorrelated selection text',()=>{expect(parseEpubAnnotationEvent(event({...payload,text:'other'}),'s1')).toBeNull();expect(parseEpubAnnotationEvent('{','s1')).toBeNull();});
});
