import {createRequire} from 'node:module';
import {describe,it,expect} from 'vitest';
const annotations = createRequire(import.meta.url)('./epubAnnotations.js');
const anchor = {version:1,kind:'epub-cfi',cfiRange:'epubcfi(/6/2!/4/2:0)',href:'chapter.xhtml',quote:'word'};
describe('EPUB contextual anchors',()=>{
 it('rejects malformed CFI and unsafe hrefs',()=>{expect(annotations.validAnchor(anchor)).toBe(true);expect(annotations.validAnchor({...anchor,cfiRange:'bad'})).toBe(false);expect(annotations.validAnchor({...anchor,href:'javascript:alert(1)'})).toBe(false);});
 it('recovers uniquely in chapter text preserving UTF16 and excludes overlays',()=>{document.body.innerHTML='<p>A 😀 word end</p><div data-papyrus-overlay>word</div>';expect(annotations.recoverRange(document,anchor)?.toString()).toBe('word');});
 it('leaves ambiguous quotes unresolved unless context distinguishes them',()=>{document.body.innerHTML='<p>one word two word end</p>';expect(annotations.recoverRange(document,anchor)).toBeNull();expect(annotations.recoverRange(document,{...anchor,prefix:'two '})?.toString()).toBe('word');});
 it('verifies exact CFI quote before controlled recovery',()=>{document.body.innerHTML='<p>other word</p>';const bad=document.createRange();bad.selectNodeContents(document.body);expect(annotations.resolveRange({document,range:()=>bad},anchor)?.toString()).toBe('word');});
});

it('renders true strikeout, grouped notes and reconciles 120 stable IDs after reflow',()=>{
 document.body.innerHTML='<p>word</p>';
 const range=document.createRange();range.selectNodeContents(document.querySelector('p')!);
 let top=20;Object.defineProperty(range,'getClientRects',{value:()=>[{left:10,right:50,top,bottom:top+20,width:40,height:20}]});
 let queue:FrameRequestCallback[]=[];
 const originalRAF=window.requestAnimationFrame;window.requestAnimationFrame=cb=>{queue.push(cb);return queue.length;};
 let snapshot=Array.from({length:120},(_,i)=>({id:`n${i}`,anchor,color:'#ff0000',opacity:1,markupStyle:'strikeout',noteContent:`note ${i}`}));
 const taps:string[]=[];
 const renderer=annotations.install({document,window,range:()=>range},{href:'chapter.xhtml',documentId:undefined,pageWidth:()=>1024,annotations:()=>snapshot,labels:()=>({comment:'Nota'}),isCurrent:()=>true,onTap:(id:string)=>taps.push(id)});
 const flush=()=>{const tasks=queue;queue=[];tasks.forEach(cb=>cb(0));};flush();
 expect(document.querySelectorAll('[data-annotation-id]')).toHaveLength(120);
 expect(document.querySelectorAll('[data-papyrus-overlay] button')).toHaveLength(1);
 const group=document.querySelector('[data-annotation-id="n0"]')!;
 expect((group.firstChild as HTMLElement).style.top).toBe('30px');
 expect((group.lastChild as HTMLElement).style.left).toBe('980px');
 snapshot=snapshot.map(item=>({...item,markupStyle:'highlight'}));renderer.schedule();flush();
 expect(Number((group.firstChild as HTMLElement).style.opacity)).toBeLessThanOrEqual(0.35);
 snapshot=snapshot.map(item=>({...item,markupStyle:'strikeout'}));renderer.schedule();flush();
 expect((group.lastChild as HTMLElement).textContent).toBe('120');
 (group.lastChild as HTMLElement).click();expect(taps).toEqual(['n0']);
 top=80;renderer.schedule();flush();expect(document.querySelector('[data-annotation-id="n0"]')).toBe(group);expect((group.firstChild as HTMLElement).style.top).toBe('90px');
 snapshot=[];renderer.schedule();flush();expect(document.querySelectorAll('[data-annotation-id]')).toHaveLength(0);
 renderer.destroy();expect(document.querySelector('[data-papyrus-overlay]')).toBeNull();window.requestAnimationFrame=originalRAF;
});
