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
