import {createRequire} from 'node:module';
import {performance} from 'node:perf_hooks';

const require=createRequire(import.meta.url);
const geometry=require('./epubAnnotations.js');
const fragments=Array.from({length:5000},(_,id)=>{
  const column=id%100,row=Math.floor(id/100),left=column*80,top=row*48;
  return {id,left,top,right:left+36,bottom:top+16,width:36,height:16,lineHeight:20};
});
const samples=Array.from({length:1000},(_,i)=>{
  const entry=fragments[(i*7919)%fragments.length];
  return {x:entry.left+18,y:entry.top+8+((i%3)-1)*2};
});
const startIndex=performance.now();
const index=geometry.createSpatialIndex(fragments,64);
const indexBuildMs=performance.now()-startIndex;
const median=values=>values.slice().sort((a,b)=>a-b)[Math.floor(values.length/2)];
const runs=[];
for(const rawCount of [500,1000]){
  const raw=samples.slice(0,rawCount);
  let simplifyMs=0,lookupRuns=[],storedPoints=0,acceptedAnchors=0,totalGridCandidates=0,maxGridCandidates=0;
  for(let run=0;run<7;run++){
    const startSimplify=performance.now();
    const simplified=geometry.simplifyPath(raw,1.5,512);
    simplifyMs+=performance.now()-startSimplify;
    const startLookup=performance.now();let accepted=0;
    for(const point of simplified){
      const result=geometry.queryNearestTextRect(index,point.x,point.y,28);
      if(result)accepted++;
    }
    lookupRuns.push(performance.now()-startLookup);
    let candidateTotal=0,candidateMax=0;
    for(const point of simplified){
      const cells=new Set(),size=index.cellSize,minX=Math.floor((point.x-28)/size),maxX=Math.floor((point.x+28)/size),minY=Math.floor((point.y-28)/size),maxY=Math.floor((point.y+28)/size);
      for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++)for(const candidate of index.cells.get(`${x}:${y}`)||[])cells.add(candidate);
      candidateTotal+=cells.size;candidateMax=Math.max(candidateMax,cells.size);
    }
    storedPoints=simplified.length;acceptedAnchors=accepted;totalGridCandidates=candidateTotal;maxGridCandidates=candidateMax;
  }
  runs.push({rawSamples:rawCount,simplifiedSamples:storedPoints,meanSimplificationMs:Number((simplifyMs/7).toFixed(3)),medianLookupMs:Number(median(lookupRuns).toFixed(3)),medianLookupUsPerPoint:Number((median(lookupRuns)*1000/Math.max(1,storedPoints)).toFixed(2)),acceptedAnchors,totalGridCandidates,maxGridCandidates,fullScanCandidates:storedPoints*fragments.length,syntheticCfiResolutionCountAfterPointerUp:acceptedAnchors});
}
console.log(JSON.stringify({fixture:'synthetic regular grid; 5,000 text fragments; no DOM layout or real CFI parser',indexBuildMs:Number(indexBuildMs.toFixed(3)),cellCount:index.cells.size,runs},null,2));
