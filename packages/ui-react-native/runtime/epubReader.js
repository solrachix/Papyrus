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
  // Chapter-scroll renders one spine item at a time. A vertical drag that
  // starts at a chapter edge and pulls past it continues into the neighbour.
  var CHAPTER_PULL_DISTANCE=96;
  function chapterPull(start,point,state){
    if(!start || !point || !state || mode(state.mode)!=='chapter-scroll' || state.selected || state.interactive || state.multitouch || !state.edge)return null;
    var dx=point.x-start.x,dy=point.y-start.y;
    if(Math.abs(dy)<12 || Math.abs(dy)<=Math.abs(dx)*1.5)return null;
    var direction=dy<0 && state.edge.bottom?'next':dy>0 && state.edge.top?'prev':null;
    if(!direction)return null;
    return {direction:direction,progress:Math.min(1,Math.abs(dy)/CHAPTER_PULL_DISTANCE)};
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
  function installResizeAnchor(manager,readCfi,keepLayoutOnHeightChange){
    var original=manager.resize,anchor=null;
    function resize(width,height,target){
      // Scrolled chapters lay out by width only. A height-only change (a
      // status bar, the keyboard, a dialog) must not clear and redisplay the
      // whole chapter, which flashes it from the top before restoring.
      if(keepLayoutOnHeightChange && keepLayoutOnHeightChange() && this && this.stage && typeof this.stage.size==='function' && this._stageSize){
        var next=this.stage.size(width,height);
        if(next && next.width===this._stageSize.width){
          this._stageSize=next;
          if(this.viewSettings)this.viewSettings.height=next.height;
          if(typeof this.bounds==='function')this._bounds=this.bounds();
          return;
        }
      }
      if(validCfi(target))anchor=target;
      if(!anchor){var current=readCfi();if(validCfi(current))anchor=current;}
      // epub.js accepts a logical target as its third argument. Keep it across
      // keyboard/dialog reflows instead of adopting each new viewport start.
      return original.call(this,width,height,anchor || target);
    }
    manager.resize=resize;
    return {cfi:function(){return anchor;},invalidate:function(){anchor=null;},destroy:function(){if(manager.resize===resize)manager.resize=original;anchor=null;}};
  }
  // Bounding rect of a chapter selection in the WebView viewport. The range
  // rect is relative to the chapter iframe; the iframe rect already includes
  // the manager container scroll (paged columns and chapter-scroll alike).
  function selectionRect(range,frame){
    if(!range || typeof range.getBoundingClientRect!=='function')return null;
    var r=range.getBoundingClientRect();
    if(!r || !(r.width>0 || r.height>0))return null;
    var f=frame && typeof frame.getBoundingClientRect==='function'?frame.getBoundingClientRect():null;
    var x=(f?f.left:0)+r.left,y=(f?f.top:0)+r.top;
    if(![x,y,r.width,r.height].every(Number.isFinite))return null;
    return {x:Math.round(x),y:Math.round(y),width:Math.round(r.width),height:Math.round(r.height)};
  }
  // Reader typography. Every rule skips the annotation layer so highlights,
  // ink and note buttons keep their own geometry and fonts.
  var TYPE_FONTS={serif:'Georgia, "Iowan Old Style", "Times New Roman", "Noto Serif", serif',sans:'-apple-system, Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',mono:'ui-monospace, Menlo, "Roboto Mono", "DejaVu Sans Mono", monospace'};
  var TYPE_MARGINS={narrow:'0.5em',medium:'1.5em',wide:'3em'};
  var NOT_OVERLAY=':not([data-papyrus-overlay]):not([data-papyrus-overlay] *)';
  function typography(value){
    var v=value||{},line=Number(v.lineHeight);
    return {fontFamily:TYPE_FONTS[v.fontFamily]?v.fontFamily:'original',lineHeight:Number.isFinite(line)&&line>=1&&line<=2.5?Math.round(line*100)/100:null,
      margin:TYPE_MARGINS[v.margin]?v.margin:'original',textAlign:v.textAlign==='justify'||v.textAlign==='left'?v.textAlign:'original'};
  }
  function typographyCss(value){
    var t=typography(value),css='';
    if(t.fontFamily!=='original'){
      // Code keeps a monospace face unless the reader chose monospace anyway.
      css+='html, body, body *'+NOT_OVERLAY+':not(code):not(pre):not(kbd):not(samp):not(code *):not(pre *) { font-family: '+TYPE_FONTS[t.fontFamily]+' !important; }';
    }
    if(t.lineHeight!==null)css+=' body, body *'+NOT_OVERLAY+' { line-height: '+t.lineHeight+' !important; }';
    if(t.margin!=='original')css+=' body > *'+NOT_OVERLAY+':not(img):not(svg):not(hr) { margin-left: '+TYPE_MARGINS[t.margin]+' !important; margin-right: '+TYPE_MARGINS[t.margin]+' !important; }';
    if(t.textAlign!=='original'){
      css+=' body p, body li, body blockquote, body dd, body div'+NOT_OVERLAY+' { text-align: '+t.textAlign+' !important; }';
      if(t.textAlign==='justify')css+=' body p { -webkit-hyphens: auto; hyphens: auto; }';
    }
    return css.trim();
  }
  function install(contents,config){
    var doc=contents.document,win=contents.window,start=null,blocked=false,edge=null,pull=null;
    function point(e){var t=e.changedTouches&&e.changedTouches[0]||e.touches&&e.touches[0];return t?{x:t.clientX,y:t.clientY,time:Date.now()}:null;}
    function selected(){return Boolean(String(win.getSelection()||'').trim()) || config.blocked();}
    function interactive(target){return Boolean(target && target.closest && target.closest('a,button,input,textarea,select,[contenteditable="true"],[data-papyrus-overlay],[data-papyrus-ink-capture]'));}
    function showPull(next){if(next===pull || next && pull && next.direction===pull.direction && next.progress===pull.progress)return;pull=next;if(config.pull)config.pull(next);}
    function begin(e){start=point(e);blocked=e.touches.length!==1 || selected() || interactive(e.target);edge=!blocked && config.mode()==='chapter-scroll' && config.edge?config.edge():null;showPull(null);}
    function pullAt(finish){return config.current()?chapterPull(start,finish,{mode:config.mode(),edge:edge,selected:selected(),interactive:blocked,multitouch:blocked}):null;}
    function invalidateScroll(finish){if(config.current() && start && finish && config.mode()==='chapter-scroll' && !blocked && !selected() && Math.abs(finish.y-start.y)>12 && Math.abs(finish.y-start.y)>Math.abs(finish.x-start.x) && config.interact)config.interact();}
    function move(e){if(e.touches.length!==1)blocked=true;var finish=point(e);invalidateScroll(finish);showPull(blocked?null:pullAt(finish));}
    function end(e){var finish=point(e);invalidateScroll(finish);var chapter=blocked?null:pullAt(finish);showPull(null);var action=gesture(start,finish,{mode:config.mode(),rtl:config.rtl(),selected:selected(),interactive:blocked||interactive(e.target)||Boolean(config.annotationHit && config.annotationHit(point(e))),multitouch:blocked});start=null;edge=null;if(!config.current())return;if(chapter && chapter.progress>=1)config.turn(chapter.direction==='next'?1:-1,'chapter-pull');else if(action==='tap')config.tap();else if(action)config.turn(action==='next'?1:-1);}
    function cancel(){start=null;blocked=true;edge=null;showPull(null);}
    function link(e){if(config.current() && e.target?.closest?.('a') && config.interact)config.interact();}
    doc.addEventListener('touchstart',begin,{passive:true});doc.addEventListener('touchmove',move,{passive:true});doc.addEventListener('touchend',end,{passive:true});doc.addEventListener('touchcancel',cancel,{passive:true});doc.addEventListener('click',link);
    return function(){showPull(null);doc.removeEventListener('touchstart',begin);doc.removeEventListener('touchmove',move);doc.removeEventListener('touchend',end);doc.removeEventListener('touchcancel',cancel);doc.removeEventListener('click',link);};
  }
  root.PapyrusEpubReader={mode:mode,validCfi:validCfi,options:options,gesture:gesture,chapterPull:chapterPull,location:location,installResizeAnchor:installResizeAnchor,selectionRect:selectionRect,typography:typography,typographyCss:typographyCss,install:install};
})(typeof window==='undefined'?globalThis:window);
