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
  function location(raw,count,readingMode){
    var start=raw && raw.start;if(!start || !validCfi(start.cfi))return null;
    var displayed=start.displayed||{},chapter=Math.max(1,(Number(start.index)||0)+1);
    var visualPage=mode(readingMode)==='paged' && Number.isFinite(displayed.page)?displayed.page:null;
    var total=mode(readingMode)==='paged' && Number.isFinite(displayed.total)?displayed.total:null;
    var fraction=total?Math.max(0,(visualPage-1)/total):0;
    return {version:1,cfi:start.cfi,href:start.href||'',chapter:chapter,chapterCount:count,visualPage:visualPage,visualPageCount:total,progress:Math.min(1,Math.max(0,(chapter-1+fraction)/Math.max(1,count))),mode:mode(readingMode),atStart:Boolean(raw.atStart),atEnd:Boolean(raw.atEnd)};
  }
  function install(contents,config){
    var doc=contents.document,win=contents.window,start=null,blocked=false;
    function point(e){var t=e.changedTouches&&e.changedTouches[0]||e.touches&&e.touches[0];return t?{x:t.clientX,y:t.clientY,time:Date.now()}:null;}
    function selected(){return Boolean(String(win.getSelection()||'').trim()) || config.blocked();}
    function interactive(target){return Boolean(target && target.closest && target.closest('a,button,input,textarea,select,[contenteditable="true"],[data-papyrus-overlay]'));}
    function begin(e){start=point(e);blocked=e.touches.length!==1 || selected() || interactive(e.target);}
    function move(e){if(e.touches.length!==1)blocked=true;}
    function end(e){var action=gesture(start,point(e),{mode:config.mode(),rtl:config.rtl(),selected:selected(),interactive:blocked||interactive(e.target)||Boolean(config.annotationHit && config.annotationHit(point(e))),multitouch:blocked});start=null;if(!config.current())return;if(action==='tap')config.tap();else if(action)config.turn(action==='next'?1:-1);}
    function cancel(){start=null;blocked=true;}
    doc.addEventListener('touchstart',begin,{passive:true});doc.addEventListener('touchmove',move,{passive:true});doc.addEventListener('touchend',end,{passive:true});doc.addEventListener('touchcancel',cancel,{passive:true});
    return function(){doc.removeEventListener('touchstart',begin);doc.removeEventListener('touchmove',move);doc.removeEventListener('touchend',end);doc.removeEventListener('touchcancel',cancel);};
  }
  root.PapyrusEpubReader={mode:mode,validCfi:validCfi,options:options,gesture:gesture,location:location,install:install};
})(typeof window==='undefined'?globalThis:window);
