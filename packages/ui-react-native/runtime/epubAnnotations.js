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
    function render() {
      frame = 0; if (!alive || !options.isCurrent()) return;
      var keep = new Set(), noteGroups = new Map();
      hitRegions = [];
      options.annotations().forEach(function(annotation) {
        var anchor = annotation.anchor;
        if (!validAnchor(anchor) || anchor.href !== options.href || anchor.documentId && options.documentId && anchor.documentId !== options.documentId) return;
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
          button.style.cssText = 'position:absolute;pointer-events:auto;border:0;background:transparent;color:'+color+';width:44px;height:44px;left:'+Math.max(0,Math.min(doc.documentElement.clientWidth-44,last.right-doc.body.getBoundingClientRect().left))+'px;top:'+(Math.floor(last.top/44)*44-doc.body.getBoundingClientRect().top)+'px';
          var key = Math.floor(last.top/44);
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
    }
    function schedule() { if (alive && !frame) frame = win.requestAnimationFrame(render); }
    function tapMarkup(event) {
      if(!alive || !options.isCurrent() || String(win.getSelection() || '').length || event.target.closest('[data-papyrus-overlay]'))return;
      var hit=hitRegions.find(function(item){return item.rects.some(function(r){return event.clientX>=r.left && event.clientX<=r.right && event.clientY>=r.top && event.clientY<=r.bottom;});});
      if(hit) {event.stopPropagation();options.onTap(hit.id);}
    }
    doc.addEventListener('click',tapMarkup);
    var observer = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(schedule) : null;
    if (observer) observer.observe(doc.body);
    win.addEventListener('resize',schedule); doc.addEventListener('load',schedule,true);
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(schedule);
    schedule();
    return {schedule:schedule, range:function(anchor){return resolveRange(contents,anchor);}, destroy:function(){alive=false;if(frame)win.cancelAnimationFrame(frame);if(observer)observer.disconnect();win.removeEventListener('resize',schedule);doc.removeEventListener('load',schedule,true);doc.removeEventListener('click',tapMarkup);overlay.remove();doc.body.style.position=originalPosition;registry.clear();}};
  }
  return {validAnchor:validAnchor,recoverRange:recoverRange,resolveRange:resolveRange,selection:selection,install:install};
});
