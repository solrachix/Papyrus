import {createRequire} from 'node:module';
import {describe,it,expect} from 'vitest';
const annotations = createRequire(import.meta.url)('./epubAnnotations.js');
const anchor = {version:1,kind:'epub-cfi',cfiRange:'epubcfi(/6/2!/4/2:0)',href:'chapter.xhtml',quote:'word'};
describe('EPUB ink geometry primitives',()=>{
 it('simplifies a noisy gesture with a stable vertex cap and preserves endpoints',()=>{
  const noisy=Array.from({length:2400},(_,index)=>({x:index/10,y:Math.sin(index/9)*0.03}));
  const result=annotations.simplifyPath(noisy,0.75,512);
  expect(result.length).toBeLessThanOrEqual(512);
  expect(result[0]).toEqual(noisy[0]);expect(result.at(-1)).toEqual(noisy.at(-1));
 });
 it('bounds exceptionally long raw gestures before the quadratic simplifier',()=>{
  const raw=Array.from({length:5000},(_,index)=>({x:index,y:Math.sin(index/12)}));
  const bounded=annotations.compactGesturePoints(raw,1024);
  expect(bounded).toHaveLength(1024);
  expect(bounded[0]).toEqual(raw[0]);expect(bounded.at(-1)).toEqual(raw.at(-1));
 });
 it('adds bounded anchors along a simplified stroke so reflow keeps long lines connected',()=>{
  const points=annotations.densifyPath([{x:0,y:4},{x:300,y:4}],12,512);
  expect(points.length).toBeGreaterThan(20);expect(points.length).toBeLessThanOrEqual(27);
  expect(points[0]).toEqual({x:0,y:4});expect(points.at(-1)).toEqual({x:300,y:4});
  expect(points.slice(1).every((point:any,index:number)=>Math.hypot(point.x-points[index].x,point.y-points[index].y)<=12.001)).toBe(true);
 });
 it('queries the local grid cells and enforces the anchor-distance cutoff',()=>{
  const entries=Array.from({length:5000},(_,index)=>({left:(index%100)*80,top:Math.floor(index/100)*48,right:(index%100)*80+36,bottom:Math.floor(index/100)*48+16,width:36,height:16,id:index}));
  const index=annotations.createSpatialIndex(entries,64);
  expect(annotations.queryNearestTextRect(index,242,23,12)?.entry.id).toBe(3);
  expect(annotations.queryNearestTextRect(index,242,23,12)?.distance).toBe(7);
  expect(annotations.queryNearestTextRect(index,242,23,2)).toBeNull();
  expect(annotations.queryNearestTextRect(index,10000,10000,28)).toBeNull();
 });
});
describe('EPUB contextual anchors',()=>{
 it('rejects malformed CFI and unsafe hrefs',()=>{expect(annotations.validAnchor(anchor)).toBe(true);expect(annotations.validAnchor({...anchor,cfiRange:'bad'})).toBe(false);expect(annotations.validAnchor({...anchor,href:'javascript:alert(1)'})).toBe(false);});
 it('recovers uniquely in chapter text preserving UTF16 and excludes overlays',()=>{document.body.innerHTML='<p>A 😀 word end</p><div data-papyrus-overlay>word</div>';expect(annotations.recoverRange(document,anchor)?.toString()).toBe('word');});
 it('leaves ambiguous quotes unresolved unless context distinguishes them',()=>{document.body.innerHTML='<p>one word two word end</p>';expect(annotations.recoverRange(document,anchor)).toBeNull();expect(annotations.recoverRange(document,{...anchor,prefix:'two '})?.toString()).toBe('word');});
 it('verifies exact CFI quote before controlled recovery',()=>{document.body.innerHTML='<p>other word</p>';const bad=document.createRange();bad.selectNodeContents(document.body);expect(annotations.resolveRange({document,range:()=>bad},anchor)?.toString()).toBe('word');});
});

it('captures finger or pencil input only in EPUB ink mode and cancels incomplete gestures',()=>{
 document.body.innerHTML='<p>'+('word'.repeat(100))+'</p>';
 const originalCreateRange=document.createRange.bind(document),originalRAF=window.requestAnimationFrame,originalInnerWidth=window.innerWidth,originalInnerHeight=window.innerHeight;
 Object.defineProperty(window,'innerWidth',{configurable:true,value:412});Object.defineProperty(window,'innerHeight',{configurable:true,value:839});Object.defineProperty(document.body,'clientWidth',{configurable:true,value:412});Object.defineProperty(document.body,'clientHeight',{configurable:true,value:839});
 let rangeCalls=0;document.createRange=()=>{rangeCalls++;const range=originalCreateRange();const bounds=()=>({left:10+range.startOffset*10,right:10+range.endOffset*10,top:10,bottom:26,width:Math.max(1,(range.endOffset-range.startOffset)*10),height:16});Object.defineProperty(range,'getClientRects',{value:()=>[bounds()]});Object.defineProperty(range,'getBoundingClientRect',{value:bounds});return range;};
 let queue:FrameRequestCallback[]=[];window.requestAnimationFrame=cb=>{queue.push(cb);return queue.length;};
 const commits:any[]=[];let cfiCalls=0,current=true;const contents={document,window,sectionIndex:0,range:(cfi:string)=>{const offset=Number(cfi.match(/:(\d+)\)$/)?.[1]||0),node=document.querySelector('p')!.firstChild!,range=document.createRange();range.setStart(node,offset);range.setEnd(node,Math.min(offset+1,node.textContent!.length));return range;},cfiFromRange:(range:Range)=>{cfiCalls++;return `epubcfi(/6/2!/4/2:${range.startOffset})`;}};
 const renderer=annotations.install(contents,{href:'chapter.xhtml',spineIndex:0,documentId:'file1',isCurrent:()=>current,pageWidth:()=>400,annotations:()=>commits,labels:()=>({}),onTap:()=>{},onInkCommit:(annotation:any)=>commits.push(annotation)});
 const flush=()=>{const tasks=queue;queue=[];tasks.forEach(cb=>cb(0));};
 const canvas=document.querySelector('[data-papyrus-ink-capture]') as HTMLCanvasElement;
 expect(canvas.style.width).toBe('412px');expect(canvas.style.height).toBe('839px');expect(canvas.width).toBeLessThanOrEqual(1236);
 const event=(name:string,x:number,y:number,pointerId=1)=>{const input=new MouseEvent(name,{bubbles:true,cancelable:true,button:0,clientX:x,clientY:y});Object.defineProperty(input,'pointerId',{value:pointerId});canvas.dispatchEvent(input);};
 renderer.setInkMode({enabled:true,color:'#2563eb',opacity:1,strokeWidth:.006});event('pointerdown',12,14);event('pointermove',22,14);expect(cfiCalls).toBe(0);event('pointerup',32,14);
 expect(commits).toHaveLength(1);expect(commits[0]).toMatchObject({type:'ink',anchor:{kind:'epub-cfi',href:'chapter.xhtml',documentId:'file1'},epubInk:{kind:'epub-ink',segments:[{href:'chapter.xhtml'}]}});expect(commits[0].epubInk.segments[0].points.length).toBeGreaterThanOrEqual(2);
 renderer.schedule();flush();expect(document.querySelectorAll('[data-epub-ink-id] path')).toHaveLength(1);
 const rangesBeforeLongStroke=rangeCalls,cfiBeforeLongStroke=cfiCalls;event('pointerdown',12,14);event('pointermove',162,14);expect(cfiCalls).toBe(cfiBeforeLongStroke);event('pointerup',312,14);
 expect(commits).toHaveLength(2);expect(commits[1].epubInk.segments[0].points.length).toBeGreaterThan(20);expect(cfiCalls-cfiBeforeLongStroke).toBeLessThanOrEqual(27);
 expect(rangeCalls-rangesBeforeLongStroke).toBeLessThan(800);renderer.schedule();flush();expect(document.querySelectorAll('[data-epub-ink-id] path')).toHaveLength(2);
 event('pointerdown',12,14);event('pointermove',22,14);canvas.dispatchEvent(new Event('pointercancel',{bubbles:true}));expect(commits).toHaveLength(2);
 event('pointerdown',12,14,1);event('pointermove',22,14,1);event('pointerdown',24,14,2);event('pointerup',32,14,1);expect(commits).toHaveLength(2);
 event('pointerdown',12,14);event('pointermove',22,14);renderer.setInkMode({enabled:false});event('pointerup',32,14);expect(commits).toHaveLength(2);
 renderer.setInkMode({enabled:true,color:'#2563eb',opacity:1,strokeWidth:.006});event('pointerdown',12,14);event('pointermove',22,14);current=false;event('pointermove',24,14);event('pointerup',32,14);expect(commits).toHaveLength(2);
 current=true;event('pointerdown',12,14);event('pointermove',22,14);renderer.destroy();event('pointerup',32,14);expect(commits).toHaveLength(2);expect(document.querySelector('[data-papyrus-ink-capture]')).toBeNull();
 window.requestAnimationFrame=originalRAF;document.createRange=originalCreateRange;Object.defineProperty(window,'innerWidth',{configurable:true,value:originalInnerWidth});Object.defineProperty(window,'innerHeight',{configurable:true,value:originalInnerHeight});delete (document.body as any).clientWidth;delete (document.body as any).clientHeight;
});

it('shows an SVG preview before release and commits ink, highlighter, and underline presets',()=>{
 document.body.innerHTML='<p>'+('word'.repeat(100))+'</p>';
 const originalCreateRange=document.createRange.bind(document),originalRAF=window.requestAnimationFrame;
 const originalWidth=Object.getOwnPropertyDescriptor(window,'innerWidth');
 const originalBodyWidth=Object.getOwnPropertyDescriptor(document.body,'clientWidth'),originalBodyHeight=Object.getOwnPropertyDescriptor(document.body,'clientHeight');
 let renderer:any;
 try {
  Object.defineProperty(window,'innerWidth',{configurable:true,value:2785944});
  Object.defineProperty(document.body,'clientWidth',{configurable:true,value:412});Object.defineProperty(document.body,'clientHeight',{configurable:true,value:839});
  document.createRange=()=>{const range=originalCreateRange(),bounds=()=>({left:10+range.startOffset*10,right:10+range.endOffset*10,top:10,bottom:26,width:Math.max(1,(range.endOffset-range.startOffset)*10),height:16});Object.defineProperty(range,'getClientRects',{configurable:true,value:()=>[bounds()]});Object.defineProperty(range,'getBoundingClientRect',{configurable:true,value:bounds});return range;};
  let queue:FrameRequestCallback[]=[];window.requestAnimationFrame=cb=>{queue.push(cb);return queue.length;};const flush=()=>{const tasks=queue;queue=[];tasks.forEach(cb=>cb(0));};
  const commits:any[]=[],node=document.querySelector('p')!.firstChild!;
  const contents={document,window,sectionIndex:0,range:(cfi:string)=>{const offset=Number(cfi.match(/:(\d+)\)$/)?.[1]||0),range=document.createRange();range.setStart(node,offset);range.setEnd(node,Math.min(offset+1,node.textContent!.length));return range;},cfiFromRange:(range:Range)=>`epubcfi(/6/2!/4/2:${range.startOffset})`};
  renderer=annotations.install(contents,{href:'chapter.xhtml',spineIndex:0,documentId:'file1',isCurrent:()=>true,annotations:()=>commits,labels:()=>({}),onTap:()=>{},onInkCommit:(annotation:any)=>commits.push(annotation)});
  const canvas=document.querySelector('[data-papyrus-ink-capture]') as HTMLCanvasElement;
  const event=(name:string,x:number,y:number)=>{const input=new MouseEvent(name,{bubbles:true,cancelable:true,button:0,clientX:x,clientY:y});Object.defineProperty(input,'pointerId',{value:9});canvas.dispatchEvent(input);};
  const modes=[{preset:'ink',opacity:1,strokeWidth:.004},{preset:'highlight',opacity:.28,strokeWidth:.016},{preset:'underline',opacity:.92,strokeWidth:.006}] as const;
  const expectedWidths=[1,10.739,1];
  modes.forEach((mode,index)=>{
   renderer.setInkMode({enabled:true,...mode,color:'#fbbf24'});event('pointerdown',12,14);event('pointermove',22,14);
   const preview=document.querySelector('[data-papyrus-ink-preview]');expect(preview?.getAttribute('d')).toContain('L');expect(commits).toHaveLength(index);
   expect(preview?.getAttribute('stroke')).toBe('#fbbf24');expect(Number(preview?.getAttribute('opacity'))).toBe(mode.opacity);expect(Number(preview?.getAttribute('stroke-width'))).toBeCloseTo(expectedWidths[index],3);
   event('pointerup',32,14);expect(document.querySelector('[data-papyrus-ink-preview]')).toBeNull();
   expect(commits[index]).toMatchObject({opacity:mode.opacity,strokeWidth:mode.strokeWidth,epubInk:{preset:mode.preset}});
   renderer.schedule();flush();expect(Number(document.querySelectorAll('[data-epub-ink-id] path')[index]?.getAttribute('stroke-width'))).toBeCloseTo(expectedWidths[index],3);
  });
  Object.defineProperty(document.body,'clientHeight',{configurable:true,value:2200});
  [{preset:'ink',opacity:1,strokeWidth:.004},{preset:'underline',opacity:.92,strokeWidth:.006}].forEach((mode,index)=>{
   renderer.setInkMode({enabled:true,...mode,color:'#fbbf24'});event('pointerdown',12,14);event('pointermove',22,14);
   expect(Number(document.querySelector('[data-papyrus-ink-preview]')?.getAttribute('stroke-width'))).toBeCloseTo(1.32,3);
   event('pointerup',32,14);renderer.schedule();flush();expect(Number(document.querySelectorAll('[data-epub-ink-id] path')[3+index]?.getAttribute('stroke-width'))).toBeCloseTo(1.32,3);
  });
 } finally {
  renderer?.destroy();window.requestAnimationFrame=originalRAF;document.createRange=originalCreateRange;
  if(originalWidth)Object.defineProperty(window,'innerWidth',originalWidth);else delete (window as any).innerWidth;
  if(originalBodyWidth)Object.defineProperty(document.body,'clientWidth',originalBodyWidth);else delete (document.body as any).clientWidth;
  if(originalBodyHeight)Object.defineProperty(document.body,'clientHeight',originalBodyHeight);else delete (document.body as any).clientHeight;
 }
});

it('keeps the live preview aligned to the iframe viewport when the EPUB body is shifted',()=>{
 document.body.innerHTML='<p>word word word</p>';
 const originalRAF=window.requestAnimationFrame;
 const originalWidth=Object.getOwnPropertyDescriptor(window,'innerWidth');
 const originalHeight=Object.getOwnPropertyDescriptor(window,'innerHeight');
 const originalBodyWidth=Object.getOwnPropertyDescriptor(document.body,'clientWidth');
 const originalBodyHeight=Object.getOwnPropertyDescriptor(document.body,'clientHeight');
 const originalBodyRect=document.body.getBoundingClientRect.bind(document.body);
 let renderer:any;
 try {
  Object.defineProperty(window,'innerWidth',{configurable:true,value:390});
  Object.defineProperty(window,'innerHeight',{configurable:true,value:844});
  Object.defineProperty(document.body,'clientWidth',{configurable:true,value:900});
  Object.defineProperty(document.body,'clientHeight',{configurable:true,value:2200});
  document.body.getBoundingClientRect=()=>({left:100,top:200,right:1000,bottom:2400,width:900,height:2200,toJSON:()=>({})}) as DOMRect;
  window.requestAnimationFrame=()=>1;
  renderer=annotations.install({document,window,sectionIndex:0},{
   href:'chapter.xhtml',spineIndex:0,isCurrent:()=>true,annotations:()=>[],labels:()=>({}),onTap:()=>{},
  });
  const canvas=document.querySelector('[data-papyrus-ink-capture]') as HTMLCanvasElement;
  expect(canvas.style.width).toBe('390px');
  expect(canvas.style.height).toBe('844px');
  renderer.setInkMode({enabled:true,preset:'ink',color:'#2563eb',opacity:1,strokeWidth:.006});
  const event=(name:string,x:number,y:number)=>{
   const input=new MouseEvent(name,{bubbles:true,cancelable:true,button:0,clientX:x,clientY:y});
   Object.defineProperty(input,'pointerId',{value:7});
   canvas.dispatchEvent(input);
  };
  event('pointerdown',18,29);
  event('pointermove',23,31);
  const preview=document.querySelector('[data-papyrus-ink-preview]') as SVGPathElement|null;
  expect(preview).not.toBeNull();
  expect(preview?.closest('[data-papyrus-ink-preview-overlay]')?.getAttribute('width')).toBe('390');
  expect(preview?.closest('[data-papyrus-ink-preview-overlay]')?.getAttribute('height')).toBe('844');
  expect(preview?.getAttribute('d')).toContain('M 18.0 29.0 L 23.0 31.0');
 } finally {
  renderer?.destroy();
  window.requestAnimationFrame=originalRAF;
  document.body.getBoundingClientRect=originalBodyRect;
  if(originalWidth)Object.defineProperty(window,'innerWidth',originalWidth);else delete (window as any).innerWidth;
  if(originalHeight)Object.defineProperty(window,'innerHeight',originalHeight);else delete (window as any).innerHeight;
  if(originalBodyWidth)Object.defineProperty(document.body,'clientWidth',originalBodyWidth);else delete (document.body as any).clientWidth;
  if(originalBodyHeight)Object.defineProperty(document.body,'clientHeight',originalBodyHeight);else delete (document.body as any).clientHeight;
 }
});

it('restores serialized EPUB ink and splits lines that separate after an extreme reflow',()=>{
 document.body.innerHTML='<p>anchor</p>';let queue:FrameRequestCallback[]=[];const originalRAF=window.requestAnimationFrame;window.requestAnimationFrame=cb=>{queue.push(cb);return queue.length;};
 const initial=[10,20,30,40,50,60],afterReflow=[10,20,300,310,320,330];let layout=initial;
 const annotation=JSON.parse(JSON.stringify({id:'ink-reflow',type:'ink',pageIndex:1,rect:{x:.1,y:.1,width:.2,height:.1},path:[{x:.1,y:.1},{x:.3,y:.2}],color:'#2563eb',opacity:1,strokeWidth:.006,createdAt:1,anchor:{version:1,kind:'epub-cfi',cfiRange:'epubcfi(/6/2!/4/2:0)',href:'chapter.xhtml',quote:'a'},epubInk:{version:1,kind:'epub-ink',segments:[{href:'chapter.xhtml',points:initial.map((_,i)=>({cfiRange:`epubcfi(/6/2!/4/2:${i})`,quote:String(i),x:0,y:0}))}]}}));
 const contents={document,window,sectionIndex:0,range:(cfi:string)=>{const i=Number(cfi.match(/:(\d+)\)$/)?.[1]||0),x=layout[i];return {toString:()=>String(i),getBoundingClientRect:()=>({left:x,right:x+5,top:20,bottom:36,width:5,height:16})};}};
 const renderer=annotations.install(contents,{href:'chapter.xhtml',documentId:()=>undefined,isCurrent:()=>true,annotations:()=>[annotation],labels:()=>({}),onTap:()=>{}});const flush=()=>{const tasks=queue;queue=[];tasks.forEach(cb=>cb(0));};flush();
 expect(document.querySelectorAll('[data-epub-ink-id] path')).toHaveLength(1);layout=afterReflow;renderer.invalidateLayout();flush();expect(document.querySelectorAll('[data-epub-ink-id] path')).toHaveLength(2);
 renderer.destroy();window.requestAnimationFrame=originalRAF;
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
