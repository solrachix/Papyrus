import type {Annotation} from '@papyrus-sdk/types';
import {createContextualAnnotation} from './annotationAnchors';
export function contextualizePdfAnnotation(annotation:Annotation,documentId?:string):Annotation {
 if(annotation.type==='ink'||!annotation.rects?.length||!annotation.content)return annotation;
 const style=annotation.type==='comment'||annotation.type==='text'?'highlight':annotation.type;
 return createContextualAnnotation({id:annotation.id,anchor:{version:1,kind:'pdf-geometry',pageIndex:annotation.pageIndex,rects:annotation.rects,quote:annotation.content,documentId},pageIndex:annotation.pageIndex,style,color:annotation.color,opacity:annotation.opacity,note:annotation.type==='comment'||annotation.type==='text'?'':undefined,now:annotation.createdAt});
}
