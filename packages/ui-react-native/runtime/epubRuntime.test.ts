import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {describe,it,expect,vi} from 'vitest';

function runtime() {
 const dom=new JSDOM('<div id="viewer"></div>',{runScripts:'outside-only'});
 const messages:any[]=[], renditions:any[]=[];
 (dom.window as any).ReactNativeWebView={postMessage:(raw:string)=>messages.push(JSON.parse(raw))};
 const book:any={ready:Promise.resolve(),spine:{items:[{href:'a.xhtml'},{href:'b.xhtml'}]},loaded:{navigation:Promise.resolve({toc:[]})},destroy:vi.fn(),renderTo:vi.fn((_viewer,options)=>{
  const events:any={};
  const r:any={options,hooks:{content:{register:vi.fn()},unloaded:{register:vi.fn()}},on:(name:string,fn:any)=>events[name]=fn,themes:{fontSize:vi.fn()},destroy:vi.fn(),display:vi.fn(async()=>{}),next:vi.fn(async()=>{}),prev:vi.fn(async()=>{}),emit:(name:string,data:any)=>events[name]?.(data)};
  renditions.push(r);return r;
 })};
 (dom.window as any).ePub=()=>book;
 dom.window.eval(readFileSync('packages/ui-react-native/runtime/runtime.js','utf8'));
 const send=async(id:string,kind:string,payload:any)=>{
  dom.window.dispatchEvent(new dom.window.MessageEvent('message',{data:JSON.stringify({id,kind,payload})}));
  for(let n=0;n<100;n++){const result=messages.find(m=>m.type==='response'&&m.id===id);if(result)return result;await new Promise(r=>setTimeout(r,1));}
  throw new Error('No response: '+id);
 };
 return {send,messages,renditions,book,dom};
}
describe('EPUB runtime bridge',()=>{
 it('loads paginated by default and emits visual location within the same chapter',async()=>{
  const r=runtime();expect((await r.send('load','load',{type:'epub',documentSessionId:'s',source:{kind:'base64',data:'AA=='}})).ok).toBe(true);
  expect(r.renditions[0].options.flow).toBe('paginated');
  r.renditions[0].emit('relocated',{start:{index:0,href:'a.xhtml',cfi:'epubcfi(/6/2!/4/2:10)',displayed:{page:2,total:8}}});
  expect(r.messages).toContainEqual(expect.objectContaining({name:'EPUB_LOCATION',payload:expect.objectContaining({location:expect.objectContaining({visualPage:2,chapter:1})})}));
 });
 it('rebuilds chapter scroll at the current CFI and rejects a stale session',async()=>{
  const r=runtime();await r.send('load','load',{type:'epub',documentSessionId:'s',source:{kind:'base64',data:'AA=='}});
  const cfi='epubcfi(/6/2!/4/2:10)';r.renditions[0].emit('relocated',{start:{index:0,cfi,displayed:{page:2,total:8}}});
  expect((await r.send('mode','set-epub-view-mode',{epubMode:'chapter-scroll',documentSessionId:'s'})).ok).toBe(true);
  expect(r.renditions[1].options.flow).toBe('scrolled-doc');expect(r.renditions[1].display).toHaveBeenCalledWith(cfi);
  expect((await r.send('old','epub-go-to-location',{cfi,documentSessionId:'old'})).ok).toBe(false);
 });
 it('serializes rapid mode changes and restores on the rebuilt rendition',async()=>{
  const r=runtime();await r.send('load','load',{type:'epub',documentSessionId:'s',source:{kind:'base64',data:'AA=='}});
  const cfi='epubcfi(/6/2!/4/2:10)';
  await Promise.all([r.send('scroll','set-epub-view-mode',{epubMode:'chapter-scroll',documentSessionId:'s'}),r.send('paged','set-epub-view-mode',{epubMode:'paged',documentSessionId:'s'}),r.send('restore','epub-go-to-location',{cfi,documentSessionId:'s'})]);
  expect(r.renditions.at(-1).options.flow).toBe('paginated');
  expect(r.renditions.at(-1).display).toHaveBeenCalledWith(cfi);
 });
 it('keeps TXT zoom independent of EPUB state',async()=>{const r=runtime();await r.send('load','load',{type:'text',source:{kind:'text',text:'sample'}});expect((await r.send('zoom','set-zoom',{zoom:1.2})).ok).toBe(true);});
});
