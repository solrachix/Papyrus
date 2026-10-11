import {describe,it,expect} from 'vitest';
import {parseEpubReadingLocation} from './epubReadingLocation';
const location={version:1,cfi:'epubcfi(/6/2!/4/2:0)',href:'one.xhtml',chapter:1,chapterCount:2,visualPage:2,visualPageCount:8,progress:0.1,mode:'paged',atStart:false,atEnd:false};
describe('EPUB location boundary',()=>{
 it('accepts logical location and rejects corrupted progress/page coordinates',()=>{expect(parseEpubReadingLocation(location)).toEqual(location);for(const patch of [{progress:NaN},{progress:2},{chapter:-1},{visualPage:20},{mode:'continuous'},{cfi:'epubcfi(<bad>)'}])expect(parseEpubReadingLocation({...location,...patch})).toBeNull();});
 it('accepts chapter-scroll without fabricated visual pages',()=>expect(parseEpubReadingLocation({...location,mode:'chapter-scroll',visualPage:null,visualPageCount:null})).not.toBeNull());
});
