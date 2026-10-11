import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {describe,it,expect} from 'vitest';
const load=()=>{const d=new JSDOM('',{runScripts:'outside-only'});d.window.eval(readFileSync('packages/ui-react-native/runtime/epubReader.js','utf8'));return (d.window as any).PapyrusEpubReader;};
describe('EPUB reading policy',()=>{
 it('defaults to real paginated default manager and one visual page',()=>{const p=load();expect(p.options('paged')).toMatchObject({manager:'default',flow:'paginated',spread:'none'});expect(p.mode()).toBe('paged');expect(p.options('chapter-scroll').flow).toBe('scrolled-doc');});
 it('recognizes one swipe with RTL reversal, excluding selection/interactivity/multitouch',()=>{const p=load(),start={x:200,y:100,time:0},end={x:40,y:108,time:200};expect(p.gesture(start,end,{mode:'paged'})).toBe('next');expect(p.gesture(start,end,{mode:'paged',rtl:true})).toBe('prev');for(const k of ['selected','interactive','multitouch'])expect(p.gesture(start,end,{mode:'paged',[k]:true})).toBe(null);expect(p.gesture(start,{x:202,y:103,time:600},{mode:'paged'})).toBe(null);expect(p.gesture(start,{x:202,y:103,time:100},{mode:'paged'})).toBe('tap');});
 it('separates chapter and visual page and never treats spine count as pages',()=>{const p=load();expect(p.location({start:{index:2,cfi:'epubcfi(/6/6!/4/2)',displayed:{page:4,total:12}}},10,'paged')).toMatchObject({chapter:3,chapterCount:10,visualPage:4,visualPageCount:12,cfi:'epubcfi(/6/6!/4/2)'});expect(p.location({start:{index:2,cfi:'epubcfi(/6/6!/4/2)'}},10,'chapter-scroll').visualPage).toBe(null);});
 it('rejects invalid location CFIs',()=>{expect(load().validCfi('javascript:bad')).toBe(false);expect(load().validCfi('epubcfi(/6/4!/4/2)')).toBe(true);});
});

describe('EPUB iframe gestures', () => {
 it('cleans listeners and excludes annotations and links from tap', () => {
  const d=new JSDOM('<p>text</p><a href="#">link</a>',{runScripts:'outside-only'});
  d.window.eval(readFileSync('packages/ui-react-native/runtime/epubReader.js','utf8'));
  const p=(d.window as any).PapyrusEpubReader;
  let taps=0,hit=true;
  const cleanup=p.install({document:d.window.document,window:d.window},{mode:()=> 'paged',rtl:()=>false,blocked:()=>false,current:()=>true,annotationHit:()=>hit,tap:()=>taps++,turn:()=>{}});
  function touch(target:Element){for(const type of ['touchstart','touchend']){const e=new d.window.Event(type,{bubbles:true});Object.defineProperties(e,{touches:{value:type==='touchend'?[]:[{clientX:30,clientY:40}]},changedTouches:{value:[{clientX:30,clientY:40}]}});target.dispatchEvent(e);}}
  touch(d.window.document.querySelector('p')!);expect(taps).toBe(0);hit=false;touch(d.window.document.querySelector('a')!);expect(taps).toBe(0);touch(d.window.document.querySelector('p')!);expect(taps).toBe(1);cleanup();touch(d.window.document.querySelector('p')!);expect(taps).toBe(1);
 });
});

describe('EPUB subpixel column boundaries',()=>{
 it('normalizes only a nearby LTR boundary and updates start/end',()=>{
  const p=load(),raw={start:{index:0,cfi:'epubcfi(/6/2!/4/12)',displayed:{page:1,total:17}},atStart:true,atEnd:false};
  expect(p.location(raw,3,'paged',{offset:411.4285888671875,pageWidth:412,direction:'ltr'})).toMatchObject({visualPage:2,atStart:false});
  expect(p.location({...raw,start:{...raw.start,index:1}},4,'paged',{offset:0,pageWidth:412,direction:'ltr',firstIndex:1,lastIndex:2})).toMatchObject({atStart:true});
  expect(p.location(raw,3,'paged',{offset:400,pageWidth:412,direction:'ltr'}).visualPage).toBe(1);
  expect(p.location(raw,3,'paged',{offset:411.5,pageWidth:412,direction:'rtl'}).visualPage).toBe(1);
  expect(p.location({...raw,start:{...raw.start,index:2,displayed:{page:16,total:17}}},3,'paged',{offset:6591.5,pageWidth:412,direction:'ltr'})).toMatchObject({visualPage:17,atEnd:true});
 });
});

describe('EPUB resize anchors',()=>{
 it('preserves a logical CFI through transient resize until real interaction',()=>{
  const p=load(),calls:any[]=[];let current='epubcfi(/6/2!/4/12/1:149)';
  const original=function(this:any,w:any,h:any,target:any){calls.push([this,w,h,target]);return 'resized';};
  const manager={resize:original};const anchor=p.installResizeAnchor(manager,()=>current);
  expect(manager.resize(412,889,undefined)).toBe('resized');
  current='epubcfi(/6/2!/4/12/1:97)';manager.resize(412,863,undefined);
  expect(calls.map(c=>c[3])).toEqual(['epubcfi(/6/2!/4/12/1:149)','epubcfi(/6/2!/4/12/1:149)']);
  expect(anchor.cfi()).toBe('epubcfi(/6/2!/4/12/1:149)');anchor.invalidate();
  current='epubcfi(/6/2!/4/22/1:149)';manager.resize(863,412,undefined);
  expect(calls.at(-1)[3]).toBe(current);expect(calls.every(c=>c[0]===manager)).toBe(true);
  anchor.destroy();expect(manager.resize).toBe(original);
 });
 it('honors explicit valid targets and does not pass invalid CFIs',()=>{
  const p=load(),calls:any[]=[];const manager={resize:(w:any,h:any,target:any)=>calls.push(target)};
  const anchor=p.installResizeAnchor(manager,()=>null);manager.resize(1,2,undefined);expect(calls[0]).toBeUndefined();
  manager.resize(1,2,'epubcfi(/6/4!/4/2)');expect(anchor.cfi()).toBe('epubcfi(/6/4!/4/2)');anchor.destroy();
 });
});

it('does not discard a resize anchor for tap, selection or note marker',()=>{
 const d=new JSDOM('<p>text</p><a href="#">link</a><button data-papyrus-overlay>note</button>',{runScripts:'outside-only'});
 d.window.eval(readFileSync('packages/ui-react-native/runtime/epubReader.js','utf8'));
 let invalidations=0,readingMode='paged';const p=(d.window as any).PapyrusEpubReader;
 const cleanup=p.install({document:d.window.document,window:d.window},{mode:()=>readingMode,rtl:()=>false,blocked:()=>false,current:()=>true,tap:()=>{},turn:()=>invalidations++,interact:()=>invalidations++});
 function touch(target:Element,y=40){for(const type of ['touchstart','touchend']){const point={clientX:30,clientY:type==='touchend'?y:40};const e=new d.window.Event(type,{bubbles:true});Object.defineProperties(e,{touches:{value:type==='touchend'?[]:[point]},changedTouches:{value:[point]}});target.dispatchEvent(e);}}
 touch(d.window.document.querySelector('p')!);touch(d.window.document.querySelector('button')!);expect(invalidations).toBe(0);
 readingMode='chapter-scroll';touch(d.window.document.querySelector('p')!,200);expect(invalidations).toBe(1);
 d.window.document.querySelector('a')!.dispatchEvent(new d.window.Event('click',{bubbles:true}));expect(invalidations).toBe(2);cleanup();
});

it('invalidates chapter-scroll before relocation and ignores stale iframe callbacks',()=>{
 const d=new JSDOM('<p>text</p><a href="#">link</a>',{runScripts:'outside-only'});
 d.window.eval(readFileSync('packages/ui-react-native/runtime/epubReader.js','utf8'));
 let invalidations=0,current=true;
 const cleanup=(d.window as any).PapyrusEpubReader.install({document:d.window.document,window:d.window},{mode:()=> 'chapter-scroll',rtl:()=>false,blocked:()=>false,current:()=>current,tap:()=>{},turn:()=>{},interact:()=>invalidations++});
 function dispatch(type:string,y:number){const point={clientX:30,clientY:y},e=new d.window.Event(type,{bubbles:true});Object.defineProperties(e,{touches:{value:type==='touchend'?[]:[point]},changedTouches:{value:[point]}});d.window.document.querySelector('p')!.dispatchEvent(e);}
 dispatch('touchstart',40);dispatch('touchmove',120);expect(invalidations).toBe(1);
 current=false;dispatch('touchend',180);d.window.document.querySelector('a')!.dispatchEvent(new d.window.Event('click',{bubbles:true}));expect(invalidations).toBe(1);cleanup();
});
