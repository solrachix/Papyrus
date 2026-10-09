import {validateAnnotationAnchor} from '@papyrus-sdk/core';
import type {AnnotationAnchor} from '@papyrus-sdk/types';
export type EpubAnnotationEvent = {kind:'tap';id:string;ids?:string[]} | {kind:'selection';session:string;text:string;pageIndex:number;anchor:AnnotationAnchor};
export function parseEpubAnnotationEvent(raw:string,session:string,documentId?:string):EpubAnnotationEvent|null {
 if(!session || raw.length>200000) return null;
 let message:any;try{message=JSON.parse(raw);}catch{return null;}
 const p=message?.payload;
 if(message?.type!=='event'||!p||p.documentSessionId!==session)return null;
 if(message.name==='EPUB_ANNOTATION_TAP') return typeof p.id==='string'&&p.id.length<=256?{kind:'tap',id:p.id,ids:Array.isArray(p.ids) && p.ids.length<=100 && p.ids.every((id:unknown)=>typeof id==='string' && id.length<=256)?p.ids:undefined}:null;
 if(message.name!=='EPUB_TEXT_SELECTED'||!validateAnnotationAnchor(p.anchor)||p.anchor.kind!=='epub-cfi'||p.text!==p.anchor.quote||!Number.isSafeInteger(p.pageIndex)||p.pageIndex<1)return null;
 if(documentId&&p.anchor.documentId&&p.anchor.documentId!==documentId)return null;
 return {kind:'selection',session,text:p.text,pageIndex:p.pageIndex,anchor:{...p.anchor,documentId:documentId??p.anchor.documentId}};
}
