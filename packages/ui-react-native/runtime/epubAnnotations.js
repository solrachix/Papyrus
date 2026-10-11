(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PapyrusEpubAnnotations = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  function validAnchor(anchor) {
    return anchor && anchor.version === 1 && anchor.kind === 'epub-cfi' &&
      typeof anchor.cfiRange === 'string' && anchor.cfiRange.length <= 4096 && /^epubcfi\([^\n<>]+\)$/.test(anchor.cfiRange) &&
      typeof anchor.href === 'string' && !/^(javascript|data):/i.test(anchor.href) &&
      typeof anchor.quote === 'string' && anchor.quote.length > 0 && anchor.quote.length <= 100000;
  }
  function simplifyPath(points, tolerance, maxPoints) {
    if (!Array.isArray(points) || points.length <= 2) return Array.isArray(points) ? points.slice() : [];
    tolerance = Number.isFinite(tolerance) ? Math.max(0, tolerance) : 1.5;
    maxPoints = Number.isSafeInteger(maxPoints) ? Math.max(2, maxPoints) : 512;
    var keep = new Uint8Array(points.length); keep[0] = 1; keep[points.length - 1] = 1;
    var stack = [[0, points.length - 1]], toleranceSquared = tolerance * tolerance;
    while (stack.length) {
      var interval = stack.pop(), first = interval[0], last = interval[1], a = points[first], b = points[last];
      var dx = b.x - a.x, dy = b.y - a.y, lengthSquared = dx * dx + dy * dy, maxDistance = toleranceSquared, split = -1;
      for (var i = first + 1; i < last; i++) {
        var p = points[i], ratio = lengthSquared ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared)) : 0;
        var px = a.x + ratio * dx, py = a.y + ratio * dy, ox = p.x - px, oy = p.y - py, distance = ox * ox + oy * oy;
        if (distance > maxDistance) { maxDistance = distance; split = i; }
      }
      if (split >= 0) { keep[split] = 1; stack.push([first, split], [split, last]); }
    }
    var result = []; for (var j = 0; j < points.length; j++) if (keep[j]) result.push(points[j]);
    if (result.length <= maxPoints) return result;
    var capped = []; for (var k = 0; k < maxPoints; k++) capped.push(result[Math.round(k * (result.length - 1) / (maxPoints - 1))]);
    return capped;
  }
  function compactGesturePoints(points, maxPoints) {
    if (!Array.isArray(points)) return [];
    maxPoints = Number.isSafeInteger(maxPoints) ? Math.max(2, maxPoints) : 1024;
    if (points.length <= maxPoints) return points.slice();
    var compacted = [];
    for (var i = 0; i < maxPoints; i++) compacted.push(points[Math.round(i * (points.length - 1) / (maxPoints - 1))]);
    return compacted;
  }
  function densifyPath(points, maxStep, maxPoints) {
    if (!Array.isArray(points) || !points.length) return [];
    if (points.length === 1) return points.slice();
    maxStep = Number.isFinite(maxStep) ? Math.max(1, maxStep) : 12;
    maxPoints = Number.isSafeInteger(maxPoints) ? Math.max(2, maxPoints) : 512;
    var cumulative = [0], total = 0;
    for (var i = 1; i < points.length; i++) {
      if (![points[i-1].x,points[i-1].y,points[i].x,points[i].y].every(Number.isFinite)) return [];
      total += Math.hypot(points[i].x-points[i-1].x, points[i].y-points[i-1].y);
      cumulative.push(total);
    }
    if (!total) return [points[0], points[points.length-1]];
    var intervals = Math.min(maxPoints-1, Math.max(1, Math.ceil(total/maxStep))), result = [], segment = 1;
    for (var sample = 0; sample <= intervals; sample++) {
      var distance = total*sample/intervals;
      while (segment < cumulative.length-1 && cumulative[segment] < distance) segment++;
      var start = points[segment-1], end = points[segment], span = cumulative[segment]-cumulative[segment-1];
      var ratio = span ? (distance-cumulative[segment-1])/span : 0;
      result.push({x:start.x+(end.x-start.x)*ratio,y:start.y+(end.y-start.y)*ratio});
    }
    return result;
  }
  function createSpatialIndex(entries, cellSize) {
    cellSize = Number.isFinite(cellSize) ? Math.max(8, cellSize) : 64;
    var cells = new Map();
    entries.forEach(function(entry) {
      var left = Math.floor(entry.left / cellSize), right = Math.floor(entry.right / cellSize);
      var top = Math.floor(entry.top / cellSize), bottom = Math.floor(entry.bottom / cellSize);
      for (var x = left; x <= right; x++) for (var y = top; y <= bottom; y++) {
        var key = x + ':' + y, bucket = cells.get(key); if (!bucket) { bucket = []; cells.set(key, bucket); } bucket.push(entry);
      }
    });
    return {cells:cells,cellSize:cellSize};
  }
  function queryNearestTextRect(index, x, y, maxDistance) {
    if (!index || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(maxDistance) || maxDistance < 0) return null;
    var size = index.cellSize, minX = Math.floor((x-maxDistance)/size), maxX = Math.floor((x+maxDistance)/size);
    var minY = Math.floor((y-maxDistance)/size), maxY = Math.floor((y+maxDistance)/size), seen = new Set(), best = null;
    for (var cx=minX; cx<=maxX; cx++) for (var cy=minY; cy<=maxY; cy++) {
      var bucket = index.cells.get(cx+':'+cy); if (!bucket) continue;
      bucket.forEach(function(entry) {
        if (seen.has(entry)) return; seen.add(entry);
        var nearestX = Math.max(entry.left,Math.min(entry.right,x)), nearestY = Math.max(entry.top,Math.min(entry.bottom,y));
        var dx=x-nearestX,dy=y-nearestY,distance=Math.sqrt(dx*dx+dy*dy);
        if (distance<=maxDistance && (!best || distance<best.distance)) best={entry:entry,distance:distance,x:nearestX,y:nearestY};
      });
    }
    return best;
  }
  function textNodes(document) {
    var walker = document.createTreeWalker(document.body, 4);
    var nodes = [], text = '', node;
    while ((node = walker.nextNode())) {
      if (node.parentElement.closest('script,style,[data-papyrus-overlay]')) continue;
      nodes.push({node:node, start:text.length}); text += node.textContent;
    }
    return {nodes:nodes,text:text};
  }
  function recoverRange(document, anchor) {
    var source = textNodes(document), match = null, start = source.text.indexOf(anchor.quote);
    while (start >= 0) {
      var end = start + anchor.quote.length;
      if ((!anchor.prefix || source.text.slice(Math.max(0,start-anchor.prefix.length),start) === anchor.prefix) &&
          (!anchor.suffix || source.text.slice(end,end+anchor.suffix.length) === anchor.suffix)) {
        if (match) return null; match = {start:start,end:end};
      }
      start = source.text.indexOf(anchor.quote,start+1);
    }
    if (!match) return null;
    var range = document.createRange();
    var first = source.nodes.find(function(n){return n.start+n.node.length > match.start;});
    var last = source.nodes.find(function(n){return n.start+n.node.length >= match.end;});
    if (!first || !last) return null;
    range.setStart(first.node,match.start-first.start); range.setEnd(last.node,match.end-last.start);
    return range;
  }
  function resolveRange(contents, anchor) {
    if (!validAnchor(anchor)) return null;
    try { var range = contents.range(anchor.cfiRange); if (range && range.toString() === anchor.quote) return range; } catch (_) {}
    return recoverRange(contents.document,anchor);
  }
  function selection(contents, cfiRange, href, documentId) {
    var range;
    try { range = contents.range(cfiRange); } catch (_) { return null; }
    if (!range || !range.toString()) return null;
    var before = contents.document.createRange(); before.selectNodeContents(contents.document.body); before.setEnd(range.startContainer,range.startOffset);
    var after = contents.document.createRange(); after.selectNodeContents(contents.document.body); after.setStart(range.endContainer,range.endOffset);
    var anchor = {version:1,kind:'epub-cfi',cfiRange:cfiRange,href:href,spineIndex:contents.sectionIndex,documentId:documentId,quote:range.toString(),prefix:before.toString().slice(-48),suffix:after.toString().slice(0,48)};
    return validAnchor(anchor) ? anchor : null;
  }
  function install(contents, options) {
    var doc = contents.document, win = contents.window, alive = true, frame = 0;
    var overlay = doc.createElement('div'); overlay.dataset.papyrusOverlay = 'annotations';
    overlay.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:0;pointer-events:none;z-index:3';
    var originalPosition=doc.body.style.position;
    if(win.getComputedStyle(doc.body).position==='static')doc.body.style.position='relative';
    doc.body.appendChild(overlay);
    var registry = new Map(), hitRegions = [];
    var inkRegistry = new Map(), rangeCache = new Map(), spatialIndex = null, activeGesture = null, inkConfig = {enabled:false,preset:'ink'};
    var inkSvg = doc.createElementNS('http://www.w3.org/2000/svg','svg');
    inkSvg.setAttribute('data-papyrus-ink-overlay','');
    inkSvg.style.cssText = 'position:absolute;left:0;top:0;overflow:visible;pointer-events:none;z-index:1';
    overlay.appendChild(inkSvg);
    var inkCanvas = doc.createElement('canvas');
    inkCanvas.dataset.papyrusInkCapture = '';
    inkCanvas.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;z-index:2147483000;background:transparent;pointer-events:none;touch-action:none';
    doc.body.appendChild(inkCanvas);
    var inkContext = null; try { if(typeof win.CanvasRenderingContext2D==='function')inkContext = inkCanvas.getContext('2d'); } catch (_) {}
    function resizeCanvas() {
      var bodyRect=doc.body.getBoundingClientRect(), ratio = Math.max(1,Math.min(3,win.devicePixelRatio || 1));
      var width=Math.max(1,Math.min(4096,doc.body.clientWidth||bodyRect.width||Math.min(4096,win.innerWidth||1)));
      var height=Math.max(1,Math.min(4096,doc.body.clientHeight||bodyRect.height||Math.min(4096,win.innerHeight||1)));
      inkCanvas.style.width=width+'px';inkCanvas.style.height=height+'px';
      inkCanvas.width = Math.round(width*ratio); inkCanvas.height = Math.round(height*ratio);
      if (inkContext) { inkContext.setTransform(ratio,0,0,ratio,0,0); inkContext.clearRect(0,0,width,height); }
    }
    function collectTextRects() {
      var walker = doc.createTreeWalker(doc.body,4), node, entries=[];
      while ((node=walker.nextNode())) {
        var parent=node.parentElement;
        if (!parent || parent.closest('script,style,noscript,textarea,[data-papyrus-overlay],[data-papyrus-ink-capture]')) continue;
        var text=node.nodeValue || '', style=win.getComputedStyle(parent), computed=parseFloat(style.lineHeight);
        for (var start=0; start<text.length;) {
          var end=Math.min(text.length,start+24), last=text.charCodeAt(end-1), next=text.charCodeAt(end);
          if(end<text.length&&last>=0xD800&&last<=0xDBFF&&next>=0xDC00&&next<=0xDFFF)end++;
          var range=doc.createRange(); range.setStart(node,start); range.setEnd(node,end);
          var rects=[]; try { rects=Array.from(range.getClientRects()); } catch (_) {}
          rects.forEach(function(rect) {
            if (!(rect.width>0 && rect.height>0)) return;
            entries.push({left:rect.left+win.scrollX,top:rect.top+win.scrollY,right:rect.right+win.scrollX,bottom:rect.bottom+win.scrollY,width:rect.width,height:rect.height,
              node:node,start:start,end:end,lineHeight:Number.isFinite(computed)&&computed>0?computed:rect.height});
          });
          start=end;
        }
      }
      return entries;
    }
    function rebuildSpatialIndex() { spatialIndex=createSpatialIndex(collectTextRects(),64); rangeCache.clear(); }
    function inkViewportExtent() {
      var root=doc.documentElement,body=doc.body,bodyRect=body.getBoundingClientRect();
      var width=root.clientWidth||body.clientWidth||bodyRect.width||win.innerWidth||1;
      var height=root.clientHeight||body.clientHeight||bodyRect.height||win.innerHeight||1;
      return Math.max(1,Math.min(4096,width),Math.min(4096,height));
    }
    function inkStrokeWidthPx(width,preset) {
      var scale=preset==='highlight'?0.8:preset==='underline'?0.1:0.15;
      return Math.max(1,Math.min(24,(Number.isFinite(width)?width:0.006)*inkViewportExtent()*scale));
    }
    function closestGlyph(entry,x,y,maxDistance) {
      var source=(entry.node.nodeValue || '').slice(entry.start,entry.end), best=null, offset=0;
      for (var glyph of source) {
        var range=doc.createRange(); range.setStart(entry.node,entry.start+offset); range.setEnd(entry.node,entry.start+offset+glyph.length); offset+=glyph.length;
        var rects=[]; try { rects=Array.from(range.getClientRects()); } catch (_) {}
        rects.forEach(function(rect) {
          if (!(rect.width>0 && rect.height>0)) return;
          var nx=Math.max(rect.left+win.scrollX,Math.min(rect.right+win.scrollX,x)), ny=Math.max(rect.top+win.scrollY,Math.min(rect.bottom+win.scrollY,y));
          var dx=x-nx,dy=y-ny,distance=Math.sqrt(dx*dx+dy*dy);
          if (distance<=maxDistance && (!best || distance<best.distance)) best={range:range,rect:rect,distance:distance};
        });
      }
      if (!best || typeof contents.cfiFromRange!=='function') return null;
      var quote=best.range.toString(), cfiRange; try { cfiRange=contents.cfiFromRange(best.range); } catch (_) { return null; }
      if (!quote || typeof cfiRange!=='string' || !/^epubcfi\([^\n<>]+\)$/.test(cfiRange)) return null;
      var lineHeight=Math.max(1,entry.lineHeight || best.rect.height), px=x-(best.rect.left+win.scrollX), py=y-(best.rect.top+win.scrollY);
      return {cfiRange:cfiRange,quote:quote,x:Math.max(-3,Math.min(3,px/lineHeight)),y:Math.max(-3,Math.min(3,py/lineHeight))};
    }
    function renderInkAnnotation(annotation,keep,bodyRect) {
      var baseRect=bodyRect || doc.body.getBoundingClientRect() || {left:0,top:0};
      var data=annotation.epubInk;
      if (!data || data.version!==1 || data.kind!=='epub-ink' || !Array.isArray(data.segments)) return;
      keep.add(annotation.id);
      var group=inkRegistry.get(annotation.id);
      if (!group) { group=doc.createElementNS('http://www.w3.org/2000/svg','g'); group.setAttribute('data-epub-ink-id',annotation.id); inkSvg.appendChild(group); inkRegistry.set(annotation.id,group); }
      group.replaceChildren();
      var color=/^#[0-9a-f]{6}$/i.test(annotation.color)?annotation.color:'#2563eb';
      var opacity=Number.isFinite(annotation.opacity)?Math.max(0,Math.min(1,annotation.opacity)):1;
      var preset=['ink','highlight','underline'].indexOf(data.preset)>=0?data.preset:'ink';
      var stroke=inkStrokeWidthPx(annotation.strokeWidth,preset);
      data.segments.forEach(function(segment) {
        if (segment.href!==options.href || !Array.isArray(segment.points)) return;
        var paths=[], current=[];
        segment.points.forEach(function(point) {
          var range=rangeCache.get(point.cfiRange);
          if (!range) { try { range=contents.range(point.cfiRange); } catch (_) { range=null; } if (range) rangeCache.set(point.cfiRange,range); }
          if (!range || range.toString()!==point.quote) { if(current.length>1)paths.push(current);current=[];return; }
          var rect; try { rect=range.getBoundingClientRect(); } catch (_) { rect=null; }
          if (!rect || !(rect.width>0 && rect.height>0)) { if(current.length>1)paths.push(current);current=[];return; }
          var lineHeight=Math.max(1,rect.height), x=rect.left-baseRect.left+point.x*lineHeight, y=rect.top-baseRect.top+point.y*lineHeight;
          var previous=current[current.length-1], jumpLimit=Math.max(24,lineHeight*2.5);
          if (previous && Math.hypot(x-previous.x,y-previous.y)>jumpLimit) { if(current.length>1)paths.push(current);current=[]; }
          current.push({x:x,y:y,lineHeight:lineHeight});
        });
        if(current.length>1)paths.push(current);
        paths.forEach(function(points) {
          var d='M '+points[0].x.toFixed(1)+' '+points[0].y.toFixed(1);
          for(var i=1;i<points.length;i++){var prev=points[i-1],point=points[i],mx=(prev.x+point.x)/2,my=(prev.y+point.y)/2;d+=' Q '+prev.x.toFixed(1)+' '+prev.y.toFixed(1)+' '+mx.toFixed(1)+' '+my.toFixed(1);}
          var last=points[points.length-1];d+=' L '+last.x.toFixed(1)+' '+last.y.toFixed(1);
          var path=doc.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',d);path.setAttribute('fill','none');path.setAttribute('stroke',color);path.setAttribute('stroke-width',String(stroke));path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');path.setAttribute('opacity',String(opacity));group.appendChild(path);
        });
      });
    }
    function clearPreview() {
      if(inkContext)inkContext.clearRect(0,0,inkCanvas.width,inkCanvas.height);
      inkSvg.querySelectorAll('[data-papyrus-ink-preview]').forEach(function(path){path.remove();});
    }
    function createPreviewPath(x,y) {
      var path=doc.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('data-papyrus-ink-preview','');path.setAttribute('d','M '+x.toFixed(1)+' '+y.toFixed(1));path.setAttribute('fill','none');
      path.setAttribute('stroke',inkConfig.color);path.setAttribute('stroke-width',String(inkStrokeWidthPx(inkConfig.strokeWidth,inkConfig.preset)));
      path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');path.setAttribute('opacity',String(inkConfig.opacity));
      path.style.pointerEvents='none';inkSvg.appendChild(path);return path;
    }
    function updatePreviewPath(clientX,clientY) {
      var bodyRect=doc.body.getBoundingClientRect(),x=clientX-bodyRect.left,y=clientY-bodyRect.top;
      var gesture=activeGesture;
      if(!gesture.previewPath||gesture.previewPathPoints>=32){
        gesture.previewPath=createPreviewPath(gesture.previewLast?gesture.previewLast.x:x,gesture.previewLast?gesture.previewLast.y:y);
        gesture.previewPathPoints=1;
      }
      var pathData=gesture.previewPath.getAttribute('d')||'';
      gesture.previewPath.setAttribute('d',pathData+' L '+x.toFixed(1)+' '+y.toFixed(1));
      gesture.previewPathPoints++;
      gesture.previewLast={x:x,y:y};
    }
    function cancelGesture() {
      var gesture=activeGesture; activeGesture=null; clearPreview();
      if(gesture)try{inkCanvas.releasePointerCapture(gesture.pointerId);}catch(_){}
    }
    function commitGesture() {
      var gesture=activeGesture; activeGesture=null; clearPreview();
      if(!gesture || !alive || !options.isCurrent() || !inkConfig.enabled || !spatialIndex) return;
      var simplified=simplifyPath(gesture.points,1.5,512), anchorSamples=densifyPath(simplified,12,512), segments=[], current=[];
      anchorSamples.forEach(function(point) {
        var coarse=queryNearestTextRect(spatialIndex,point.x,point.y,28);
        var cutoff=coarse?Math.max(12,Math.min(28,0.8*coarse.entry.lineHeight)):12;
        var anchored=coarse && closestGlyph(coarse.entry,point.x,point.y,cutoff);
        if(!anchored){if(current.length>1)segments.push({href:options.href,spineIndex:options.spineIndex,points:current});current=[];return;}
        current.push(anchored);
      });
      if(current.length>1)segments.push({href:options.href,spineIndex:options.spineIndex,points:current});
      segments=segments.slice(0,64);
      var pointCount=segments.reduce(function(total,segment){return total+segment.points.length;},0);
      if(!pointCount)return;
      var width=Math.max(1,doc.documentElement.scrollWidth,win.innerWidth),height=Math.max(1,doc.documentElement.scrollHeight,win.innerHeight);
      var normalized=simplified.map(function(p){return {x:Math.max(0,Math.min(1,p.x/width)),y:Math.max(0,Math.min(1,p.y/height))};});
      var minX=Math.min.apply(null,normalized.map(function(p){return p.x;})),maxX=Math.max.apply(null,normalized.map(function(p){return p.x;}));
      var minY=Math.min.apply(null,normalized.map(function(p){return p.y;})),maxY=Math.max.apply(null,normalized.map(function(p){return p.y;}));
      var first=segments[0].points[0], href=segments[0].href, documentId=typeof options.documentId==='function'?options.documentId():options.documentId;
      var annotation={id:'epub-ink-'+Date.now()+'-'+Math.random().toString(36).slice(2,9),type:'ink',pageIndex:(options.spineIndex||0)+1,
        rect:{x:minX,y:minY,width:Math.min(1-minX,Math.max(0.001,maxX-minX)),height:Math.min(1-minY,Math.max(0.001,maxY-minY))},path:normalized,color:inkConfig.color,opacity:inkConfig.opacity,strokeWidth:inkConfig.strokeWidth,createdAt:Date.now(),content:first.quote,
        anchor:{version:1,kind:'epub-cfi',cfiRange:first.cfiRange,href:href,spineIndex:options.spineIndex,documentId:documentId,quote:first.quote},
        epubInk:{version:1,kind:'epub-ink',documentId:documentId,preset:inkConfig.preset,segments:segments}};
      if(typeof options.onInkCommit==='function')options.onInkCommit(annotation);
    }
    function pointerDown(event) {
      if(!inkConfig.enabled || !alive || !options.isCurrent() || event.button!==undefined && event.button!==0)return;
      if(activeGesture){cancelGesture();return;}
      event.preventDefault();event.stopPropagation();
      activeGesture={pointerId:event.pointerId,points:[{x:event.clientX+win.scrollX,y:event.clientY+win.scrollY}],last:{x:event.clientX,y:event.clientY},previewPath:null,previewPathPoints:0,previewLast:null};
      updatePreviewPath(event.clientX,event.clientY);
      try{inkCanvas.setPointerCapture(event.pointerId);}catch(_){}
    }
    function pointerMove(event) {
      if(!activeGesture || activeGesture.pointerId!==event.pointerId)return;
      if(!options.isCurrent()||!inkConfig.enabled){cancelGesture();return;}
      event.preventDefault();event.stopPropagation();
      var point={x:event.clientX+win.scrollX,y:event.clientY+win.scrollY};activeGesture.points.push(point);
      if(activeGesture.points.length>2048)activeGesture.points=compactGesturePoints(activeGesture.points,1024);
      if(inkContext){inkContext.beginPath();inkContext.moveTo(activeGesture.last.x,activeGesture.last.y);inkContext.lineTo(event.clientX,event.clientY);inkContext.strokeStyle=inkConfig.color;inkContext.globalAlpha=inkConfig.opacity;inkContext.lineWidth=inkStrokeWidthPx(inkConfig.strokeWidth,inkConfig.preset);inkContext.lineCap='round';inkContext.lineJoin='round';inkContext.stroke();}
      updatePreviewPath(event.clientX,event.clientY);
      activeGesture.last={x:event.clientX,y:event.clientY};
    }
    function pointerUp(event) {if(!activeGesture || activeGesture.pointerId!==event.pointerId)return;event.preventDefault();event.stopPropagation();var end={x:event.clientX+win.scrollX,y:event.clientY+win.scrollY},last=activeGesture.points[activeGesture.points.length-1];if(Math.hypot(end.x-last.x,end.y-last.y)>0.5){activeGesture.points.push(end);updatePreviewPath(event.clientX,event.clientY);}commitGesture();}
    function pointerCancel(event) {if(activeGesture && (event.pointerId===undefined || activeGesture.pointerId===event.pointerId))cancelGesture();}
    resizeCanvas();rebuildSpatialIndex();
    inkCanvas.addEventListener('pointerdown',pointerDown);inkCanvas.addEventListener('pointermove',pointerMove);inkCanvas.addEventListener('pointerup',pointerUp);inkCanvas.addEventListener('pointercancel',pointerCancel);inkCanvas.addEventListener('lostpointercapture',pointerCancel);
    win.addEventListener('blur',pointerCancel);win.addEventListener('resize',resizeCanvas);
    function render() {
      frame = 0; if (!alive || !options.isCurrent()) return;
      var keep = new Set(), keepInk = new Set(), noteGroups = new Map();
      hitRegions = [];
      var bodyRect=doc.body.getBoundingClientRect() || {left:0,top:0};
      inkSvg.setAttribute('width',String(Math.max(doc.documentElement.scrollWidth,win.innerWidth)));
      inkSvg.setAttribute('height',String(Math.max(doc.documentElement.scrollHeight,win.innerHeight)));
      options.annotations().forEach(function(annotation) {
        var anchor = annotation.anchor;
        if (!validAnchor(anchor) || anchor.href !== options.href || anchor.documentId && options.documentId && anchor.documentId !== options.documentId) return;
        if(annotation.type==='ink' && annotation.epubInk){renderInkAnnotation(annotation,keepInk,bodyRect);return;}
        var range = resolveRange(contents,anchor); if (!range) return;
        var rects = Array.from(range.getClientRects()).filter(function(r){return r.width>0 && r.height>0;});
        if (!rects.length) return;
        keep.add(annotation.id);
        var group = registry.get(annotation.id);
        if (!group) { group = doc.createElement('div'); group.dataset.annotationId = annotation.id; overlay.appendChild(group); registry.set(annotation.id,group); if (!doc.defaultView.matchMedia || !doc.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches) { if (typeof group.animate === 'function') group.animate([{opacity:0},{opacity:1}],{duration:180,easing:'ease-out'}); } }
        group.replaceChildren();
        hitRegions.push({id:annotation.id,rects:rects});
        var color = /^#[0-9a-f]{6}$/i.test(annotation.color) ? annotation.color : '#FFC928';
        var style = annotation.markupStyle || annotation.type;
        var opacity = Number.isFinite(annotation.opacity) ? Math.max(0,Math.min(1,annotation.opacity)) : 0.35;
        if(style === 'highlight')opacity=Math.min(0.35,opacity);
        rects.forEach(function(rect) {
          var mark = doc.createElement('div');
          var bodyRect=doc.body.getBoundingClientRect();
          var height = style === 'highlight' ? rect.height : 2;
          var y = style === 'strikeout' ? rect.top+rect.height/2 : style === 'underline' ? rect.bottom-2 : rect.top;
          mark.style.cssText = 'position:absolute;pointer-events:none;left:'+(rect.left-bodyRect.left)+'px;top:'+(y-bodyRect.top)+'px;width:'+rect.width+'px;height:'+height+'px;background:'+color+';opacity:'+opacity;
          if (['highlight','underline','strikeout'].includes(style)) group.appendChild(mark);
        });
        var hasNote = annotation.noteContent !== undefined || annotation.type === 'comment' || annotation.type === 'text';
        if (hasNote) {
          var last = rects[rects.length-1], button = doc.createElement('button');
          button.textContent = '●'; button.setAttribute('aria-label',options.labels().comment || '');
          var pageWidth=Math.max(44, options.pageWidth ? options.pageWidth() : win.innerWidth);
          var bodyRect=doc.body.getBoundingClientRect(), column=Math.max(0,Math.floor((last.left-bodyRect.left)/pageWidth));
          button.style.cssText = 'position:absolute;pointer-events:auto;border:0;background:transparent;color:'+color+';width:44px;height:44px;left:'+((column+1)*pageWidth-44)+'px;top:'+(Math.floor(last.top/44)*44-doc.body.getBoundingClientRect().top)+'px';
          var key = column+":"+Math.floor(last.top/44);
          var neighbors=noteGroups.get(key);
          if(!neighbors){neighbors={button:button,ids:[]};noteGroups.set(key,neighbors);group.appendChild(button);}
          neighbors.ids.push(annotation.id);
        }
      });
      noteGroups.forEach(function(group){
        group.button.textContent=group.ids.length>1?String(group.ids.length):'●';
        group.button.addEventListener('click',function(e){e.stopPropagation();if(options.isCurrent())options.onTap(group.ids[0],group.ids);});
      });
      registry.forEach(function(group,id){if (!keep.has(id)) {group.remove();registry.delete(id);}});
      inkRegistry.forEach(function(group,id){if (!keepInk.has(id)) {group.remove();inkRegistry.delete(id);}});
    }
    function schedule() { if (alive && !frame) frame = win.requestAnimationFrame(render); }
    function rebuildAndSchedule(){if(!alive)return;rebuildSpatialIndex();schedule();}
    function handleResize(){resizeCanvas();rebuildAndSchedule();}
    function handleDocumentLoad(){rebuildAndSchedule();}
    function tapMarkup(event) {
      if(!alive || !options.isCurrent() || String(win.getSelection() || '').length || event.target.closest('[data-papyrus-overlay]'))return;
      var hit=hitRegions.find(function(item){return item.rects.some(function(r){return event.clientX>=r.left && event.clientX<=r.right && event.clientY>=r.top && event.clientY<=r.bottom;});});
      if(hit) {event.stopPropagation();options.onTap(hit.id);}
    }
    doc.addEventListener('click',tapMarkup);
    var observer = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(rebuildAndSchedule) : null;
    if (observer) observer.observe(doc.body);
    win.addEventListener('resize',handleResize);win.addEventListener('scroll',schedule); doc.addEventListener('load',handleDocumentLoad,true);
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function(){if(alive){rebuildSpatialIndex();schedule();}});
    schedule();
    return {schedule:schedule, setInkMode:function(config){var preset=['ink','highlight','underline'].indexOf(config?.preset)>=0?config.preset:'ink';inkConfig={enabled:!!config?.enabled,preset:preset,color:/^#[0-9a-f]{6}$/i.test(config?.color)?config.color:'#2563eb',opacity:Number.isFinite(config?.opacity)?Math.max(0,Math.min(1,config.opacity)):1,strokeWidth:Number.isFinite(config?.strokeWidth)?Math.max(0.0025,Math.min(0.02,config.strokeWidth)):0.006};inkCanvas.style.pointerEvents=inkConfig.enabled?'auto':'none';if(!inkConfig.enabled)cancelGesture();}, invalidateLayout:rebuildAndSchedule, hit:function(x,y){return hitRegions.some(function(item){return item.rects.some(function(r){return x>=r.left && x<=r.right && y>=r.top && y<=r.bottom;});});}, range:function(anchor){return resolveRange(contents,anchor);}, destroy:function(){alive=false;cancelGesture();if(frame)win.cancelAnimationFrame(frame);if(observer)observer.disconnect();win.removeEventListener('resize',handleResize);win.removeEventListener('scroll',schedule);win.removeEventListener('blur',pointerCancel);doc.removeEventListener('load',handleDocumentLoad,true);doc.removeEventListener('click',tapMarkup);inkCanvas.removeEventListener('pointerdown',pointerDown);inkCanvas.removeEventListener('pointermove',pointerMove);inkCanvas.removeEventListener('pointerup',pointerUp);inkCanvas.removeEventListener('pointercancel',pointerCancel);inkCanvas.removeEventListener('lostpointercapture',pointerCancel);inkCanvas.remove();overlay.remove();doc.body.style.position=originalPosition;registry.clear();inkRegistry.clear();rangeCache.clear();}};
  }
  return {validAnchor:validAnchor,simplifyPath:simplifyPath,compactGesturePoints:compactGesturePoints,densifyPath:densifyPath,createSpatialIndex:createSpatialIndex,queryNearestTextRect:queryNearestTextRect,recoverRange:recoverRange,resolveRange:resolveRange,selection:selection,install:install};
});
