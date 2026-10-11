import {validateAnnotationAnchor,validateEpubInkData} from '@papyrus-sdk/core';
import type {Annotation,AnnotationAnchor} from '@papyrus-sdk/types';
import type {EpubInkPreset} from '@papyrus-sdk/types';
export type EpubAnnotationEvent = {kind:'tap';id:string;ids?:string[]} | {kind:'selection';session:string;text:string;pageIndex:number;anchor:AnnotationAnchor} | {kind:'ink';session:string;annotation:Annotation};
const EPUB_INK_PRESETS: readonly EpubInkPreset[] = ['ink','highlight','underline'];
export function resolveEpubInkMode(input:{documentType:string;isLoaded:boolean;activeTool:string;preset:string;color:string;opacity:number;strokeWidth:number}) {
 if(!input.isLoaded||input.documentType!=='epub')return null;
 const preset=EPUB_INK_PRESETS.includes(input.preset as EpubInkPreset)?input.preset as EpubInkPreset:'ink';
 return {enabled:input.activeTool==='ink'&&EPUB_INK_PRESETS.includes(input.preset as EpubInkPreset),preset,color:input.color,opacity:input.opacity,strokeWidth:input.strokeWidth};
}
export function parseEpubAnnotationEvent(raw:string,session:string,documentId?:string):EpubAnnotationEvent|null {
 if(!session || raw.length>750000) return null;
 let message:any;try{message=JSON.parse(raw);}catch{return null;}
 const p=message?.payload;
 if(message?.type!=='event'||!p||p.documentSessionId!==session)return null;
 if(message.name==='EPUB_ANNOTATION_TAP') return typeof p.id==='string'&&p.id.length<=256?{kind:'tap',id:p.id,ids:Array.isArray(p.ids) && p.ids.length<=100 && p.ids.every((id:unknown)=>typeof id==='string' && id.length<=256)?p.ids:undefined}:null;
 if(message.name==='EPUB_INK_CREATED'){
  const a=p.annotation,sidecar=a?.epubInk,first=sidecar?.segments?.[0],point=first?.points?.[0];
  if(!a||a.type!=='ink'||typeof a.id!=='string'||!a.id||a.id.length>256||!Number.isSafeInteger(a.pageIndex)||a.pageIndex<1||!validateAnnotationAnchor(a.anchor)||a.anchor.kind!=='epub-cfi'||!validateEpubInkData(sidecar)||!point||a.anchor.cfiRange!==point.cfiRange||a.anchor.quote!==point.quote||a.anchor.href!==first.href||documentId&&(sidecar.documentId&&sidecar.documentId!==documentId||a.anchor.documentId&&a.anchor.documentId!==documentId)||sidecar.documentId&&a.anchor.documentId&&sidecar.documentId!==a.anchor.documentId)return null;
  const rect=a.rect,path=a.path;
  if(!rect||![rect.x,rect.y,rect.width,rect.height].every((n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1)||rect.x+rect.width>1.000001||rect.y+rect.height>1.000001||!Array.isArray(path)||path.length<2||path.length>512||path.some((p:any)=>!p||![p.x,p.y].every((n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1))||typeof a.color!=='string'||!/^#[0-9a-f]{6}$/i.test(a.color)||!Number.isFinite(a.createdAt)||(a.opacity!==undefined&&(!Number.isFinite(a.opacity)||a.opacity<0||a.opacity>1))||(a.strokeWidth!==undefined&&(!Number.isFinite(a.strokeWidth)||a.strokeWidth<0.0025||a.strokeWidth>0.02)))return null;
  return {kind:'ink',session,annotation:a as Annotation};
 }
 if(message.name!=='EPUB_TEXT_SELECTED'||!validateAnnotationAnchor(p.anchor)||p.anchor.kind!=='epub-cfi'||p.text!==p.anchor.quote||!Number.isSafeInteger(p.pageIndex)||p.pageIndex<1)return null;
 if(documentId&&p.anchor.documentId&&p.anchor.documentId!==documentId)return null;
 return {kind:'selection',session,text:p.text,pageIndex:p.pageIndex,anchor:{...p.anchor,documentId:documentId??p.anchor.documentId}};
}
