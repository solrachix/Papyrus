import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {describe,it,expect} from 'vitest';
const source=readFileSync('packages/ui-react-native/runtime/runtime.js','utf8');
function fixture() {
 const messages:any[]=[];
 const dom=new JSDOM('<div id="viewer"></div>',{runScripts:'outside-only'});
 dom.window.ReactNativeWebView={postMessage:(raw:string)=>messages.push(JSON.parse(raw))} as never;
 // Expose only the setup boundary in the test copy; execute the production handler.
 dom.window.eval(source.replace("sendMessage({ type: 'ready' });",`
 window.seedMenu=(session,payload,contents)=>{documentSessionId=session;nativeMenuSelection={payload,contents};};`));
 const chapter=new JSDOM('<p>one word and a phrase</p>');
 const text=chapter.window.document.querySelector('p')!.firstChild!;
 const range=chapter.window.document.createRange();range.setStart(text,4);range.setEnd(text,8);
 chapter.window.getSelection()!.addRange(range);
 const payload={documentSessionId:'current',text:'word',pageIndex:1,
  anchor:{kind:'epub-cfi',version:1,cfiRange:'epubcfi(/6/2!/4/2:4)',href:'one.xhtml',quote:'word'}};
 (dom.window as any).seedMenu('current',payload,{document:chapter.window.document,window:chapter.window});
 const send=(key:string,session='current')=>dom.window.dispatchEvent(new dom.window.MessageEvent('message',
  {data:JSON.stringify({type:'epub-selection-action',id:'selection-menu',key,documentSessionId:session})}));
 return {messages,chapter,send,dom};
}
describe('native EPUB menu dispatch',()=>{
 it('uses the chapter CFI snapshot even when root selection is empty',()=>{
  const f=fixture();expect(f.dom.window.getSelection()!.toString()).toBe('');f.send('highlight');
  expect(f.messages).toContainEqual(expect.objectContaining({name:'EPUB_SELECTION_ACTION',payload:expect.objectContaining({action:'highlight',text:'word',anchor:expect.objectContaining({href:'one.xhtml'})})}));
  expect(f.chapter.window.getSelection()!.toString()).toBe('');
 });
 it('rejects stale document sessions and unknown actions',()=>{
  const f=fixture();f.send('copy','old');f.send('deleteDocument');expect(f.messages).toHaveLength(0);
  expect(f.chapter.window.getSelection()!.toString()).toBe('word');
 });
 it('selects all inside the chapter, without annotating the previous word',()=>{
  const f=fixture();f.send('selectAll');expect(f.chapter.window.getSelection()!.toString()).toBe('one word and a phrase');expect(f.messages).toHaveLength(0);
 });
 it('consumes each action once',()=>{
  const f=fixture();f.send('comment');f.send('comment');expect(f.messages).toHaveLength(1);
 });
});
