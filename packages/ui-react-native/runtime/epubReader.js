(function(root){
  function mode(value){return value==='chapter-scroll'?'chapter-scroll':'paged';}
  function validCfi(value){return typeof value==='string' && value.length<=4096 && /^epubcfi\([^\n<>]+\)$/.test(value);}
  function options(value){return {manager:'default',flow:mode(value)==='paged'?'paginated':'scrolled-doc',spread:'none',width:'100%',height:'100%',allowScriptedContent:false};}
  function gesture(start,end,state){
    if(!start || !end || state.selected || state.interactive || state.multitouch)return null;
    var dx=end.x-start.x,dy=end.y-start.y,elapsed=end.time-start.time;
    if(state.mode==='paged' && Math.abs(dx)>=48 && Math.abs(dx)>Math.abs(dy)*1.5 && elapsed>=0 && elapsed<1500)return (dx<0)!==Boolean(state.rtl)?'next':'prev';
    if(elapsed>=0 && elapsed<450 && Math.hypot(dx,dy)<=12)return 'tap';
    return null;
  }
  function location(raw,count,readingMode,geometry){
    var start=raw && raw.start;if(!start || !validCfi(start.cfi))return null;
    var displayed=start.displayed||{},chapter=Math.max(1,(Number(start.index)||0)+1);
    var visualPage=mode(readingMode)==='paged' && Number.isFinite(displayed.page)?displayed.page:null;
    var total=mode(readingMode)==='paged' && Number.isFinite(displayed.total)?displayed.total:null;
    var atStart=Boolean(raw.atStart),atEnd=Boolean(raw.atEnd);
    // Chromium may round a column offset down by a fraction of a CSS pixel.
    // Keep epub.js authoritative outside a 1px boundary, and for RTL layouts.
    if(visualPage!==null && total>0 && geometry && geometry.direction==='ltr' && geometry.pageWidth>0 && Number.isFinite(geometry.offset)){
      var boundary=Math.round(geometry.offset/geometry.pageWidth);
      if(Math.abs(geometry.offset-boundary*geometry.pageWidth)<=1){
        visualPage=Math.min(total,Math.max(1,boundary+1));
        atStart=chapter===(geometry.firstIndex ?? 0)+1 && visualPage===1;
        atEnd=chapter===(geometry.lastIndex ?? count-1)+1 && visualPage===total;
      }
    }
    var fraction=total?Math.max(0,(visualPage-1)/total):0;
    return {version:1,cfi:start.cfi,href:start.href||'',chapter:chapter,chapterCount:count,visualPage:visualPage,visualPageCount:total,progress:Math.min(1,Math.max(0,(chapter-1+fraction)/Math.max(1,count))),mode:mode(readingMode),atStart:atStart,atEnd:atEnd};
  }
  function installResizeAnchor(manager,readCfi){
    var original=manager.resize,anchor=null;
    function resize(width,height,target){
      if(validCfi(target))anchor=target;
      if(!anchor){var current=readCfi();if(validCfi(current))anchor=current;}
      // epub.js accepts a logical target as its third argument. Keep it across
      // keyboard/dialog reflows instead of adopting each new viewport start.
      return original.call(this,width,height,anchor || target);
    }
    manager.resize=resize;
    return {cfi:function(){return anchor;},invalidate:function(){anchor=null;},destroy:function(){if(manager.resize===resize)manager.resize=original;anchor=null;}};
  }
  function install(contents,config){
    var doc=contents.document,win=contents.window,start=null,blocked=false;
    function point(e){var t=e.changedTouches&&e.changedTouches[0]||e.touches&&e.touches[0];return t?{x:t.clientX,y:t.clientY,time:Date.now()}:null;}
    function selected(){return Boolean(String(win.getSelection()||'').trim()) || config.blocked();}
    function interactive(target){return Boolean(target && target.closest && target.closest('a,button,input,textarea,select,[contenteditable="true"],[data-papyrus-overlay]'));}
    function begin(e){start=point(e);blocked=e.touches.length!==1 || selected() || interactive(e.target);}
    function invalidateScroll(finish){if(config.current() && start && finish && config.mode()==='chapter-scroll' && !blocked && !selected() && Math.abs(finish.y-start.y)>12 && Math.abs(finish.y-start.y)>Math.abs(finish.x-start.x) && config.interact)config.interact();}
    function move(e){if(e.touches.length!==1)blocked=true;invalidateScroll(point(e));}
    function end(e){var finish=point(e);invalidateScroll(finish);var action=gesture(start,finish,{mode:config.mode(),rtl:config.rtl(),selected:selected(),interactive:blocked||interactive(e.target)||Boolean(config.annotationHit && config.annotationHit(point(e))),multitouch:blocked});start=null;if(!config.current())return;if(action==='tap')config.tap();else if(action)config.turn(action==='next'?1:-1);}
    function cancel(){start=null;blocked=true;}
    function link(e){if(config.current() && e.target?.closest?.('a') && config.interact)config.interact();}
    doc.addEventListener('touchstart',begin,{passive:true});doc.addEventListener('touchmove',move,{passive:true});doc.addEventListener('touchend',end,{passive:true});doc.addEventListener('touchcancel',cancel,{passive:true});doc.addEventListener('click',link);
    return function(){doc.removeEventListener('touchstart',begin);doc.removeEventListener('touchmove',move);doc.removeEventListener('touchend',end);doc.removeEventListener('touchcancel',cancel);doc.removeEventListener('click',link);};
  }
  root.PapyrusEpubReader={mode:mode,validCfi:validCfi,options:options,gesture:gesture,location:location,installResizeAnchor:installResizeAnchor,install:install};
})(typeof window==='undefined'?globalThis:window);
