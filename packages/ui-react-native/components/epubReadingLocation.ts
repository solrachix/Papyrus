import type {EpubReadingLocation} from '@papyrus-sdk/types';
export function parseEpubReadingLocation(raw: unknown): EpubReadingLocation | null {
 if (!raw || typeof raw !== 'object') return null;
 const p=raw as EpubReadingLocation;
 if(p.version!==1 || typeof p.cfi!=='string' || p.cfi.length>4096 || !/^epubcfi\([^\n<>]+\)$/.test(p.cfi) || typeof p.href!=='string' || !Number.isSafeInteger(p.chapter) || p.chapter<1 || !Number.isSafeInteger(p.chapterCount) || p.chapterCount<p.chapter || !Number.isFinite(p.progress) || p.progress<0 || p.progress>1 || typeof p.atStart!=='boolean' || typeof p.atEnd!=='boolean')return null;
 if(p.mode==='chapter-scroll')return p.visualPage===null && p.visualPageCount===null?p:null;
 if(p.mode!=='paged' || !Number.isSafeInteger(p.visualPage) || (p.visualPage??0)<1 || !Number.isSafeInteger(p.visualPageCount) || (p.visualPageCount??0)<(p.visualPage??0))return null;
 return p;
}
