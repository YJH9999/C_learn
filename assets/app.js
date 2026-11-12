(function(){
  var $=function(s){return document.querySelector(s)};
  var $$=function(s){return Array.prototype.slice.call(document.querySelectorAll(s))};
  var toc=$('.toc'), side=$('.side'), mask=$('.mask');
  var topBtn=$('#topbtn');
  var input=$('#q'), sres=$('#sres'), srch=$('.srch');
  var contentEl=$('#content');
  var MF=window.CK_MANIFEST||[], HM=window.CK_HEADMAP||{}, TT=window.CK_TITLES||{};
  var cache={}, lastIdx=-1, loadingNext=false;

  /* ================================================================
     目录折叠：默认层级由构建期决定（篇 + 章展开）；
     用户手动展开/折叠的状态存 localStorage，下次打开恢复。
     ================================================================ */
  var OKEY='c-kb-toc-open', tocT=null;
  function saveTocState(){
    clearTimeout(tocT);
    tocT=setTimeout(function(){
      var ids=$$('.node.open').map(function(n){return n.dataset.id})
        .filter(Boolean);
      try{localStorage.setItem(OKEY,JSON.stringify(ids))}catch(e){}
    },300);
  }
  function restoreTocState(){
    var ids=null;
    try{ ids=JSON.parse(localStorage.getItem(OKEY)||'null'); }catch(e){}
    if(!ids || !ids.length) return false;      // 无存档 → 用构建期默认
    $$('.node.open').forEach(function(n){n.classList.remove('open')});
    ids.forEach(function(id){
      var n=toc.querySelector('.node[data-id="'+id+'"]');
      if(n) n.classList.add('open');
    });
    return true;
  }
  new MutationObserver(saveTocState).observe(toc,{
    subtree:true, attributes:true, attributeFilter:['class']});

  function closeAll(){
    $$('.node.open').forEach(function(n){ n.classList.remove('open') });
  }
  /* 只保留当前节点的祖先链展开，其余分支全部折叠（点击跳转时调用） */
  function collapseTo(id){
    var keep=[];
    var el=toc.querySelector('.node[data-id="'+id+'"]');
    var p=el;
    while(p && p!==toc){
      if(p.classList && p.classList.contains('node')) keep.push(p);
      p=p.parentElement;
    }
    $$('.node.open').forEach(function(n){
      if(keep.indexOf(n)===-1) n.classList.remove('open');
    });
    if(el && el.querySelector(':scope > .kids')) el.classList.add('open');
    return el;
  }
  /* ---------- 折叠块辅助：跳转目标在 <details> 内时自动展开 ---------- */
  function ensureVisible(el){
    var d=el && el.closest ? el.closest('details') : null;
    if(d && !d.open) d.open=true;
  }

  /* ---------- 目录内快速筛选（仅匹配标题） ---------- */
  var tq=$('#tq');
  function filterToc(){
    var q=tq.value.trim().toLowerCase();
    toc.classList.toggle('tf-on',!!q);
    document.querySelector('.tfbox').classList.toggle('has',!!q);
    $$('.node').forEach(function(n){n.classList.remove('tmatch','tanc')});
    if(!q){ restoreTocState(); return; }
    $$('.node').forEach(function(n){
      var a=n.querySelector(':scope > .row > .tx');
      if(a && a.textContent.toLowerCase().indexOf(q)!==-1) n.classList.add('tmatch');
    });
    $$('.node.tmatch').forEach(function(n){
      var p=n.parentElement;
      while(p && p!==toc){
        if(p.classList.contains('node')){ p.classList.add('tanc','open'); }
        p=p.parentElement;
      }
    });
  }
  tq.addEventListener('input',filterToc);
  $('#tclr').addEventListener('click',function(){
    tq.value=''; filterToc(); tq.focus();
  });

  /* ================================================================
     我的收藏：标题旁星标 + 侧栏面板
     ================================================================ */
  var VKEY='c-kb-favs';
  var favbtn=$('#favbtn'), favcount=$('#favcount'),
      favpanel=$('#favpanel'), favlist=$('#favlist');
  function getFavs(){try{return JSON.parse(localStorage.getItem(VKEY)||'[]')}catch(e){return[]}}
  function setFavs(a){try{localStorage.setItem(VKEY,JSON.stringify(a))}catch(e){}}
  function toggleFav(id){
    var f=getFavs(), i=f.indexOf(id);
    if(i>=0) f.splice(i,1); else f.unshift(id);
    setFavs(f); syncFavUI();
  }
  function syncFavUI(){
    var f=getFavs();
    $$('.fav').forEach(function(b){b.classList.toggle('on',f.indexOf(b.dataset.fav)>=0)});
    favcount.textContent=f.length;
    favcount.classList.toggle('has',f.length>0);
  }
  function renderFavPanel(){
    var f=getFavs();
    if(!f.length){
      favlist.innerHTML='<div class="fp-none">还没有收藏。<br>点击标题右侧的 ★ 即可收藏薄弱知识点。</div>';
      return;
    }
    favlist.innerHTML=f.map(function(id){
      return '<a class="fv" data-id="'+id+'" href="#'+id+'">'
        +'<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.3-5.7-3.1-5.7 3.1 1.2-6.3L2.8 9.5l6.4-.8z"/></svg>'
        +(TT[id]||id)+'</a>';
    }).join('');
  }
  favbtn.addEventListener('click',function(){
    var on=side.classList.toggle('favmode');
    favbtn.classList.toggle('on',on);
    if(on) renderFavPanel();
  });
  $('#favclear').addEventListener('click',function(){ setFavs([]); syncFavUI(); renderFavPanel(); });
  favlist.addEventListener('click',function(e){
    var a=e.target.closest('.fv'); if(!a) return;
    e.preventDefault(); go(a.dataset.id);
  });

  /* ================================================================
     分章内容加载（懒加载 + 向下续载）
     ================================================================ */
  function furl(i){ return 'assets/content/' + MF[i].f; }
  function fetchChunk(i, cb){
    if(cache[i]!==undefined){ cb(cache[i]); return; }
    fetch(furl(i)).then(function(r){
      if(!r.ok) throw new Error(r.status);
      return r.text();
    }).then(function(t){ cache[i]=t; cb(t); })
      .catch(function(){
        contentEl.insertAdjacentHTML('beforeend',
          '<div class="callout c-error" style="margin:30px 0"><b>内容加载失败</b>'
          +'：本站正文按章节分文件加载，需通过 HTTP 访问（GitHub Pages、线上地址，'
          +'或本地运行 <code>python -m http.server</code>）；直接双击 index.html 无法加载。</div>');
      });
  }
  function rebindHeads(){
    heads=$$('.main h1,.main h2,.main h3,.main h4');
  }
  function afterInject(anchor, terms){
    rebindHeads();
    rebuildOutline();
    syncFavUI();
    if(anchor){
      var el=document.getElementById(anchor);
      if(el){ ensureVisible(el); el.scrollIntoView({block:'start'}); }
      else window.scrollTo(0,0);
      if(terms) markScope(el, terms);
    }
    applyFocus();
    maybeAppend();
  }
  function show(i, anchor, terms){
    fetchChunk(i, function(t){
      contentEl.innerHTML = t;
      lastIdx = i;
      var next = i+1;
      if(next < MF.length){
        fetchChunk(next, function(t2){
          if(lastIdx === i){                  // 期间未被其他跳转替换
            contentEl.insertAdjacentHTML('beforeend', t2);
            lastIdx = next;
          }
          afterInject(anchor, terms);
        });
      } else afterInject(anchor, terms);
    });
  }
  function appendNext(){
    if(loadingNext || lastIdx+1 >= MF.length) return;
    loadingNext = true;
    var i = lastIdx+1;
    fetchChunk(i, function(t){
      loadingNext = false;
      if(i === lastIdx+1){
        contentEl.insertAdjacentHTML('beforeend', t);
        lastIdx = i;
        rebindHeads(); rebuildOutline(); syncFavUI(); applyFocus();
        onScroll();
      }
    });
  }
  function maybeAppend(){
    var doc=document.documentElement;
    if(doc.scrollHeight - window.innerHeight - window.scrollY < 900) appendNext();
  }

  /* ---------- 跳转（目录 / 搜索 / 大纲 / 收藏共用） ---------- */
  function go(id, terms){
    if(HM[id]===undefined) return;
    collapseTo(id);
    setCur(id);
    var el=document.getElementById(id);
    if(el){
      ensureVisible(el); el.scrollIntoView({block:'start'});
      if(terms){ clearKw(); markScope(el, terms); }
    }
    else show(HM[id], id, terms);
    savePos(id);
    if(window.innerWidth<=1024) closeDrawer();
  }

  toc.addEventListener('click',function(e){
    var tw=e.target.closest('.tw');
    if(tw && !tw.classList.contains('sp')){
      tw.closest('.node').classList.toggle('open');
      e.preventDefault();
      return;
    }
    var a=e.target.closest('a.tx');
    if(a){
      e.preventDefault();
      /* 分支标题（有子目录）：整棵子树展开/收起，不跳转；叶子小标题才进入 */
      var node=a.closest('.node');
      if(node && node.querySelector(':scope > .kids')){
        if(node.classList.contains('open')){
          node.classList.remove('open');
        }else{
          node.classList.add('open');
          [].forEach.call(node.querySelectorAll('.node'),function(d){
            d.classList.add('open');
          });
        }
        return;
      }
      go(a.getAttribute('href').slice(1));
    }
  });

  /* ---------- 当前项高亮（滚动联动，同步目录与右栏大纲） ---------- */
  var heads=[], curId=null;
  function setCur(id){
    if(id===curId) return;
    curId=id;
    $$('.node.cur, .node.canc').forEach(function(n){n.classList.remove('cur','canc')});
    var n=toc.querySelector('.node[data-id="'+id+'"]');
    if(n){
      /* 滚动联动：自动展开祖先链并标记当前路径，保证高亮项始终可见 */
      var p=n.parentElement;
      while(p && p!==toc){
        if(p.classList && p.classList.contains('node')) p.classList.add('open','canc');
        p=p.parentElement;
      }
      n.classList.add('cur');
      var row=n.querySelector('.row');
      var tr=row.getBoundingClientRect(), sr=toc.getBoundingClientRect();
      if(tr.top<sr.top+10||tr.bottom>sr.bottom-10)
        toc.scrollTop+=tr.top-sr.top-toc.clientHeight/2;
    }
    $$('.ol.cur').forEach(function(a){a.classList.remove('cur')});
    var oa=$('#ollist .ol[data-id="'+id+'"]');
    if(oa){
      oa.classList.add('cur');
      var or=oa.getBoundingClientRect(), osr=$('#ollist').getBoundingClientRect();
      if(or.top<osr.top||or.bottom>osr.bottom)
        oa.scrollIntoView({block:'nearest'});
    }
  }

  function onScroll(){
    var st=window.scrollY;
    topBtn.classList.toggle('on',st>500);
    var y=st+130, best=null;
    for(var i=0;i<heads.length;i++){
      if(heads[i].offsetTop<=y) best=heads[i]; else break;
    }
    if(best) setCur(best.id);
    maybeAppend();
  }

  topBtn.addEventListener('click',goTop);
  function goTop(){
    window.scrollTo(0,0);
    if(lastIdx!==0) show(0,null);
    savePos('');
  }

  /* ---------- 右栏大纲（当前已加载内容的 H2/H3） ---------- */
  function rebuildOutline(){
    var box=$('#ollist'); if(!box) return;
    box.innerHTML=heads
      .filter(function(h){return h.tagName==='H2'||h.tagName==='H3'})
      .map(function(h){
        return '<a class="ol'+(h.tagName==='H3'?' lv3':'')+'" data-id="'+h.id+'" href="#'+h.id+'">'
          +h.textContent.replace(/^[\s\u200b]+/,'')+'</a>';
      }).join('') || '<div class="ol-none">加载章节后显示大纲</div>';
  }
  document.addEventListener('click',function(e){
    var ol=e.target.closest('.ol');
    if(ol){ e.preventDefault(); go(ol.dataset.id); }
  });

  /* ---------- 考点筛选（冲刺模式） ---------- */
  var fErr=$('#f-err'), fHot=$('#f-hot'), fCode=$('#f-code');
  var FKEY='c-kb-focus';
  function applyFocus(){
    var wantErr=fErr.checked, wantHot=fHot.checked, wantCode=fCode.checked;
    var any=wantErr||wantHot||wantCode;
    document.body.classList.toggle('focus-on',any);
    var fbar=document.getElementById('fbar');
    if(fbar){
      var n=(wantErr?1:0)+(wantHot?1:0)+(wantCode?1:0);
      fbar.classList.toggle('has',n>0);
      var badge=document.getElementById('fb-badge');
      if(badge) badge.textContent=n||'';
      var sum=fbar.querySelector('.fb-sum');
      if(sum) sum.classList.toggle('on',n>0);
    }
    $$('#content>.nf').forEach(function(el){el.classList.remove('nf')});
    if(!any) return;
    var kids=contentEl.children;
    for(var i=0;i<kids.length;i++){
      var el=kids[i];
      var ok=false;
      if(wantErr && el.querySelector('.rkchip.rk-error,.callout.c-error,.badge.b-error')) ok=true;
      if(wantHot && el.querySelector('.rkchip.rk-hot,.callout.c-hot,.badge.b-hot')) ok=true;
      if(wantCode && (el.classList.contains('codeblk')||el.querySelector('.codeblk'))) ok=true;
      if(!ok) el.classList.add('nf');
    }
  }
  [fErr,fHot,fCode].forEach(function(c){
    c.addEventListener('change',function(){
      try{localStorage.setItem(FKEY,JSON.stringify(
        [fErr.checked,fHot.checked,fCode.checked]))}catch(e){}
      applyFocus();
    });
  });
  (function(){
    var s=null;
    try{s=JSON.parse(localStorage.getItem(FKEY)||'null')}catch(e){}
    if(s){ fErr.checked=!!s[0]; fHot.checked=!!s[1]; fCode.checked=!!s[2]; }
  })();

  /* ---------- 阅读进度：localStorage 保存当前锚点 ---------- */
  var RKEY='c-kb-progress', saveT=null;
  function savePos(id){
    try{ localStorage.setItem(RKEY,id||''); }catch(e){}
  }
  window.addEventListener('scroll',function(){
    if(saveT) return;
    saveT=setTimeout(function(){
      saveT=null;
      if(curId) savePos(curId);
    },250);
  },{passive:true});

  /* ---------- 搜索（索引懒加载） ---------- */
  var sReady=false, pendQ=null, sel=-1, results=[], lastTerms=[];
  function ensureSearch(cb){
    if(sReady){ cb(); return; }
    if(pendQ){ pendQ.push(cb); return; }
    pendQ=[cb];
    var s=document.createElement('script');
    s.src='assets/search-index.js';
    s.onload=function(){ sReady=true; var qs=pendQ; pendQ=null; qs.forEach(function(f){f()}); };
    s.onerror=function(){ pendQ=null;
      sres.innerHTML='<div class="none">搜索索引加载失败</div>'; sres.classList.add('on'); };
    document.head.appendChild(s);
  }
  function esc(s){return s.replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function hl(s,terms){
    var e=esc(s), re=new RegExp('('+terms.map(function(t){return t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}).join('|')+')','gi');
    return e.replace(re,'<mark>$1</mark>');
  }
  function doSearch(){
    var q=input.value.trim().toLowerCase();
    srch.classList.toggle('has',!!q);
    if(!q){
      sres.classList.remove('on'); toc.classList.remove('filtering');
      $$('.node').forEach(function(n){n.classList.remove('match')});
      return;
    }
    ensureSearch(function(){ runSearch(q); });
  }
  function runSearch(q){
    var terms=q.split(/\s+/).filter(Boolean);
    lastTerms=terms;
    var IDX=window.CK_SEARCH||[];
    results=IDX.filter(function(x){
      var t=x.t.toLowerCase();
      return terms.every(function(w){return t.indexOf(w)!==-1 || x.s.toLowerCase().indexOf(w)!==-1;});
    }).slice(0,40);
    toc.classList.add('filtering');
    $$('.node').forEach(function(n){n.classList.remove('match');n.classList.remove('anc')});
    var firstMatch=null;
    results.forEach(function(r){
      var n=toc.querySelector('.node[data-id="'+r.id+'"]');
      if(n){
        n.classList.add('match');
        if(!firstMatch) firstMatch=n;
        var p=n.parentElement;
        while(p && p!==toc){
          if(p.classList.contains('node')){
            p.classList.add('anc'); p.classList.add('open');
          }
          p=p.parentElement;
        }
      }
    });
    if(firstMatch){
      var fr=firstMatch.getBoundingClientRect(), sr=toc.getBoundingClientRect();
      if(fr.top<sr.top||fr.bottom>sr.bottom)
        toc.scrollTop+=fr.top-sr.top-toc.clientHeight/2;
    }
    if(!results.length){
      sres.innerHTML='<div class="none">没有匹配的内容</div>';
    }else{
      sres.innerHTML=results.map(function(r,i){
        return '<a class="r" data-i="'+i+'" href="#'+r.id+'">'
          +'<span class="rt"><span class="lv">H'+r.lv+'</span>'+hl(r.t,terms)+'</span>'
          +'<span class="rs">'+hl(r.s||'',terms)+'</span></a>';
      }).join('');
    }
    sres.classList.add('on'); sel=-1;
  }

  var tmr;
  input.addEventListener('input',function(){ clearTimeout(tmr); tmr=setTimeout(doSearch,110); });
  input.addEventListener('focus',function(){ if(input.value.trim()) doSearch(); });
  $('.srch .clr').addEventListener('click',function(){
    input.value=''; doSearch(); input.focus();
  });
  document.addEventListener('click',function(e){
    if(!e.target.closest('.srch')) sres.classList.remove('on');
  });
  sres.addEventListener('click',function(e){
    var a=e.target.closest('.r'); if(!a) return;
    e.preventDefault();
    var r=results[+a.dataset.i];
    sres.classList.remove('on');
    go(r.id, lastTerms);
  });
  document.addEventListener('keydown',function(e){
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();input.focus();input.select();}
    if(e.key==='Escape'){ if(sres.classList.contains('on')) sres.classList.remove('on'); else {input.value='';doSearch();input.blur();} }
    if(sres.classList.contains('on')&&results.length){
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){
        e.preventDefault();
        sel=(sel+(e.key==='ArrowDown'?1:-1)+results.length)%results.length;
        $$('.sres .r').forEach(function(x,i){x.classList.toggle('sel',i===sel)});
        var el=$$('.sres .r')[sel]; if(el) el.scrollIntoView({block:'nearest'});
      }
      if(e.key==='Enter'&&sel>=0){
        e.preventDefault();
        var r=results[sel];
        sres.classList.remove('on');
        go(r.id, lastTerms);
      }
    }
  });

  /* ---------- 跳转后关键词标黄（搜索触发时） ---------- */
  function clearKw(){
    $$('#content mark.kw').forEach(function(m){
      var p=m.parentNode;
      while(m.firstChild) p.insertBefore(m.firstChild,m);
      p.removeChild(m); p.normalize();
    });
  }
  function markScope(el,terms){
    clearKw();
    if(!el||!terms||!terms.length) return;
    lastTerms=terms;
    var test=new RegExp(terms.map(function(t){return t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}).join('|'),'i');
    var gre=new RegExp('('+terms.map(function(t){return t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}).join('|')+')','gi');
    // 从 el 向后到下一个标题为止的范围内标黄
    var node=el;
    while(node){
      if(node!==el && /^H[1-4]$/.test(node.tagName)) break;
      markWithin(node);
      node=node.nextElementSibling;
    }
    function markWithin(root){
      var w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:function(t){
        if(!t.nodeValue.trim()) return 2;
        if(t.parentNode && (t.parentNode.nodeName==='MARK'||t.parentNode.nodeName==='SCRIPT'||t.parentNode.nodeName==='STYLE')) return 2;
        if(t.parentNode && t.parentNode.closest && t.parentNode.closest('pre,code,mark')) return 2;
        return test.test(t.nodeValue)?1:2;
      }});
      var nodes=[], n;
      while((n=w.nextNode())) nodes.push(n);
      nodes.forEach(function(t){
        var s=t.nodeValue, frag=document.createDocumentFragment(), last=0, m;
        gre.lastIndex=0;
        while((m=gre.exec(s))){
          if(m.index>last) frag.appendChild(document.createTextNode(s.slice(last,m.index)));
          var mk=document.createElement('mark'); mk.className='kw';
          mk.textContent=m[0]; frag.appendChild(mk);
          last=m.index+m[0].length;
        }
        if(last<s.length) frag.appendChild(document.createTextNode(s.slice(last)));
        t.parentNode.replaceChild(frag,t);
      });
    }
  }

  /* ---------- 主题（macOS 语义：默认浅色，body.dark 深色） ---------- */
  var mL=$('#m-light'), mD=$('#m-dark');
  function applyTheme(t){
    document.body.classList.toggle('dark',t==='dark');
    mL.classList.toggle('on',t==='light');
    mD.classList.toggle('on',t==='dark');
    try{localStorage.setItem('c-kb-theme',t)}catch(e){}
  }
  var saved=(function(){try{return localStorage.getItem('c-kb-theme')}catch(e){return null}})();
  if(saved!=='light' && saved!=='dark'){
    saved=(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';
  }
  applyTheme(saved);
  mL.addEventListener('click',function(){ applyTheme('light'); });
  mD.addEventListener('click',function(){ applyTheme('dark'); });

  /* ---------- 展开/收起全部 ---------- */
  var exp=$('#expall2');
  exp.addEventListener('click',function(){
    var anyClosed=!!toc.querySelector('.node:not(.open) .kids');
    if(anyClosed){ $$('.node').forEach(function(n){n.classList.add('open')}); exp.textContent='全部收起'; }
    else { closeAll(); exp.textContent='展开全部'; }
  });

  /* ---------- 移动端：抽屉 + 底部工具栏 + 右滑关闭 ---------- */
  /* 统一开关：body.drawer-open 同步控制底部工具栏隐藏，避免遮住抽屉内容 */
  function openDrawer(){
    side.classList.add('open'); mask.classList.add('on');
    document.body.classList.add('drawer-open');
  }
  function closeDrawer(){
    side.classList.remove('open'); mask.classList.remove('on');
    document.body.classList.remove('drawer-open');
  }
  function toggleDrawer(){
    if(side.classList.contains('open')) closeDrawer(); else openDrawer();
  }
  $('#mob').addEventListener('click',toggleDrawer);
  mask.addEventListener('click',closeDrawer);
  $('#mb-toc').addEventListener('click',toggleDrawer);
  $('#mb-q').addEventListener('click',function(){
    window.scrollTo({top:0,behavior:'smooth'});
    setTimeout(function(){ input.focus(); },80);
  });
  $('#mb-top').addEventListener('click',goTop);
  (function(){
    var x0=null,y0=null;
    side.addEventListener('touchstart',function(e){
      x0=e.touches[0].clientX; y0=e.touches[0].clientY;
    },{passive:true});
    side.addEventListener('touchmove',function(e){
      if(x0===null) return;
      var dx=e.touches[0].clientX-x0, dy=e.touches[0].clientY-y0;
      if(dx>64 && Math.abs(dx)>Math.abs(dy)*1.4){
        closeDrawer();
        x0=null;
      }
    },{passive:true});
    side.addEventListener('touchend',function(){ x0=null; },{passive:true});
  })();

  /* ---------- 代码复制 + 长代码展开（事件委托，动态内容生效） ---------- */
  document.addEventListener('click',function(e){
    var btn=e.target.closest('.ccopy');
    if(btn){
      var b=btn.closest('.codeblk'); if(!b) return;
      var t=b.querySelector('pre').innerText.replace(/\u200b/g,'');
      navigator.clipboard.writeText(t).then(function(){
        btn.textContent='已复制'; btn.classList.add('ok');
        setTimeout(function(){btn.textContent='复制';btn.classList.remove('ok')},1600);
      });
      return;
    }
    var ex=e.target.closest('.cexp');
    if(ex){
      var blk=ex.closest('.codeblk');
      var open=blk.classList.toggle('open');
      ex.textContent=open?'收起':'展开全部 '+blk.dataset.lines+' 行';
    }
  });

  /* ---------- 一键运行：JSCPP 浏览器内解释执行（Worker + 超时保护） ---------- */
  var LOAD_TIMEOUT=30000, RUN_TIMEOUT=15000, _runWURL=null;
  /* 引擎寻址：优先同目录 assets/jscpp.js（本地化，秒加载），失败自动回落 CDN。
     JSCPP bundle 在 Worker 环境自带 onmessage 协议：
     请求 [id,"run",code,input]；stdout → {type:"stdio.write",data}；结束 {id,err,data|msg} */
  var _engURL='';
  try{ _engURL=new URL('assets/jscpp.js',location.href).href; }catch(e){ _engURL=''; }
  function runWorkerSrc(){ return [
    "var ENG="+JSON.stringify(_engURL)+";",
    "var CDNS=['https://cdn.jsdelivr.net/gh/felixhao28/JSCPP@gh-pages/dist/JSCPP.es5.min.js',",
    "          'https://fastly.jsdelivr.net/gh/felixhao28/JSCPP@gh-pages/dist/JSCPP.es5.min.js'];",
    "if(ENG)CDNS.unshift(ENG);",
    "(function load(i){",
    "  if(i>=CDNS.length){ self.postMessage({err:-1,msg:'运行引擎加载失败，请检查网络后重试'}); return; }",
    "  try{ importScripts(CDNS[i]); }catch(e){ load(i+1); return; }",
    "  self.postMessage({type:'ready'});",
    "})(0);"
  ].join('\n'); }
  function needInput(code){ return /scanf\s*\(|cin\s*>>|gets\s*\(|fgets\s*\(|getline/.test(code); }
  function codeOf(blk){
    /* 每行是独立 block span，textContent 会丢换行，必须逐行 join */
    var cls=blk.querySelectorAll('pre code span.cl'), parts=[];
    for(var i=0;i<cls.length;i++) parts.push(cls[i].textContent);
    if(!parts.length){
      var c=blk.querySelector('pre code');
      return c?c.textContent:'';
    }
    return parts.join('\n').replace(/\u200b/g,'');
  }
  function runBoxHTML(){ return (
    '<div class="crunbox" hidden>'
    +'<div class="crunhead"><span class="crunhint">运行终端</span>'
    +'<button class="crunclose" type="button">收起</button></div>'
    +'<div class="crunsec"><span class="crunlab">输入<i>stdin</i></span>'
    +'<textarea class="crunin" rows="2" spellcheck="false" '
    +'placeholder="在此填入输入数据（空格或换行分隔），无输入可留空"></textarea></div>'
    +'<div class="crunbtns"><button class="crunrun" type="button">▶ 运行</button></div>'
    +'<div class="crunsec cout" hidden><span class="crunlab">输出<i>stdout</i></span>'
    +'<pre class="crunout"></pre></div></div>'); }
  function doRun(blk){
    var box=blk.querySelector('.crunbox'), out=box.querySelector('.crunout');
    var code=codeOf(blk), input=box.querySelector('.crunin').value;
    if(blk._rw){ blk._rw.terminate(); blk._rw=null; }
    if(!_runWURL) _runWURL=URL.createObjectURL(new Blob([runWorkerSrc()],{type:'text/javascript'}));
    var w=new Worker(_runWURL); blk._rw=w;
    var done=false, buf='';
    box.querySelector('.crunsec.cout').hidden=false;
    out.textContent='⏳ 正在加载运行引擎…（约 600KB，仅首次需等待）';
    var finish=function(t){ if(done)return; done=true; clearTimeout(timer); w.terminate();
      out.textContent=t; };
    /* 两段计时：引擎加载 30s，程序运行 15s */
    var timer=setTimeout(function(){
      finish('⏰ 引擎加载超时，请检查网络后重试。'); },LOAD_TIMEOUT);
    var armed=false;
    function armRun(){
      if(armed)return; armed=true; clearTimeout(timer);
      timer=setTimeout(function(){
        finish('⏰ 运行超过 15 秒，可能存在死循环，已终止。'); },RUN_TIMEOUT);
    }
    w.onmessage=function(msg){
      var d=msg.data||{};
      if(d&&d.type==='ready'){ armRun(); if(!buf) out.textContent='⏳ 正在运行…'; return; }
      if(d&&d.type==='stdio.write'){ buf+=d.data; return; }
      if(!done && d.err===-1 && d.id===undefined){
        finish('✕ '+(d.msg||'运行引擎加载失败')); return; }
      if(d.id===undefined) return;
      armRun();
      if(d.err){ finish((buf?buf+'\n':'')+'✕ 运行出错：'+(d.msg||'未知错误')); return; }
      var t=buf||'（无输出）';
      if(d.data===0) t+='\n\n[程序正常结束，返回码 0]';
      else if(d.data!==undefined) t+='\n\n[程序结束，返回码 '+d.data+']';
      finish(t);
    };
    w.onerror=function(e){
      finish((buf?buf+'\n':'')+'✕ 运行出错：'+(e.message||'未知错误')); };
    w.postMessage([1,'run',code,input,{unsigned_overflow:'warn'}]);
  }
  document.addEventListener('click',function(e){
    var btn=e.target.closest('.crun');
    if(!btn) return;
    var blk=btn.closest('.codeblk'); if(!blk) return;
    var box=blk.querySelector('.crunbox');
    if(!box){
      blk.insertAdjacentHTML('beforeend',runBoxHTML());
      box=blk.querySelector('.crunbox');
      box.querySelector('.crunrun').addEventListener('click',function(){ doRun(blk); });
      box.querySelector('.crunclose').addEventListener('click',function(){
        box.hidden=true; if(blk._rw){ blk._rw.terminate(); blk._rw=null; } });
      if(needInput(codeOf(blk)))
        box.querySelector('.crunin').placeholder='检测到 scanf/cin：请在此填入输入数据（每个数据一行或空格分隔）后点 ▶ 运行';
    }
    var show=box.hidden;
    box.hidden=!show;
    if(show){
      /* 展开折叠的长代码，避免渐隐遮罩盖住运行面板 */
      blk.classList.add('open');
      var ex=blk.querySelector('.cexp');
      if(ex) ex.textContent='收起';
      if(needInput(codeOf(blk)) && !box.querySelector('.crunin').value.trim()){
        box.querySelector('.crunsec.cout').hidden=true;
        box.querySelector('.crunin').focus();
      }else{
        doRun(blk);
      }
    }else if(blk._rw){ blk._rw.terminate(); blk._rw=null; }
  });

  /* ---------- 收藏星标（事件委托） ---------- */
  document.addEventListener('click',function(e){
    var f=e.target.closest('.fav');
    if(f){ e.preventDefault(); e.stopPropagation(); toggleFav(f.dataset.fav); }
  });

  /* details 展开/收起后标题可见性变化，刷新大纲与高亮数据 */
  document.addEventListener('toggle',function(e){
    if(e.target.tagName==='DETAILS') rebindHeads();
  },true);

  /* ---------- 长代码折叠初始化（覆盖动态注入的片段） ---------- */
  function initFold(root){
    var blks=(root||contentEl).querySelectorAll('.codeblk[data-lines]:not(.fold):not(.open)');
    for(var i=0;i<blks.length;i++){
      if(+blks[i].dataset.lines>22) blks[i].classList.add('fold');
    }
  }
  new MutationObserver(function(muts){
    for(var i=0;i<muts.length;i++){
      for(var j=0;j<muts[i].addedNodes.length;j++){
        var n=muts[i].addedNodes[j];
        if(n.nodeType===1) initFold(n.parentElement||contentEl);
      }
    }
  }).observe(contentEl,{childList:true,subtree:false});
  initFold();


  /* ================================================================
     导出 PDF：把「本节 / 本篇 / 全册」排成一份独立打印视图
     —— 边界由 manifest 顺序推导：一篇（n-part）从它自己的分片开始，
        到下一篇的分片之前结束；节（leaf 节点）用分片内锚点截取
     ================================================================ */
  var SITE=((document.querySelector('.brand b')||{}).textContent||document.title||'知识库').trim();

  var PRINT_CSS=[
    '@page{size:A4;margin:16mm 13mm 15mm}',
    'html,body.pdf-body{background:#fff!important}',
    'body.pdf-body{color:#1c1c1e;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.pdf-body .wrap{display:block;max-width:none;margin:0}',
    '.pdf-body .main{max-width:none;margin:0;padding:0}',
    '.pdf-body #content{max-width:none}',
    '.pdf-body h1,.pdf-body h2,.pdf-body h3,.pdf-body h4{display:block;break-after:avoid;page-break-after:avoid;break-inside:avoid}',
    '.pdf-body h1{font-size:21px;margin:0 0 .7em;padding-bottom:.5em;border-bottom:2px solid #1c1c1e}',
    '.pdf-body .pdf-chap>h2:first-child{font-size:20px;line-height:1.35;margin:0 0 .7em;'
      +'padding:0 0 .5em;border-left:0;border-bottom:2px solid #1c1c1e}',
    '.pdf-body h2{margin:1.1em 0 .6em}',
    '.pdf-body .pdf-chap{break-before:page;page-break-before:always}',
    '.pdf-body .pdf-chap:first-child{break-before:auto;page-break-before:auto}',
    '.pdf-body .callout,.pdf-body .ex,.pdf-body .fml,.pdf-body .tscroll,.pdf-body .grid,'+
      '.pdf-body details,.pdf-body .codeblk,.pdf-body tr,.pdf-body .qlist li{break-inside:avoid;page-break-inside:avoid}',
    '.pdf-body .codeblk{page-break-inside:auto}',
    '.pdf-body .fml,.pdf-body .tscroll,.pdf-body .katex-display{overflow:visible}',
    '.pdf-body .fav,.pdf-body .ex summary,.pdf-body .ldmore{display:none!important}',
    '.pdf-body details>summary{cursor:default}',
    '.pdf-body details>summary::before{display:none}',
    '.pdf-body a{color:inherit;text-decoration:none}',
    '.pdf-body table{width:100%;max-width:100%;table-layout:auto}',
    '.pdf-body th{white-space:normal}',
    '.pdf-body th,.pdf-body td{overflow-wrap:anywhere;word-break:break-word}',
    '.pdf-body p{orphans:3;widows:3}',
    '.pdf-body #content>*:first-child{margin-top:0}'
  ].join('\n');

  var pdfStage=null;
  function pdfStageEl(){
    if(pdfStage && pdfStage.parentNode===document.body) return pdfStage;
    pdfStage=document.createElement('div');
    pdfStage.id='pdf-stage';
    document.body.appendChild(pdfStage);
    return pdfStage;
  }
  function pdfToast(msg,sticky){
    var t=document.getElementById('pdf-toast');
    if(!t){ t=document.createElement('div'); t.id='pdf-toast'; document.body.appendChild(t); }
    t.textContent=msg; t.classList.add('on');
    clearTimeout(pdfToast._t);
    if(!sticky) pdfToast._t=setTimeout(function(){ t.classList.remove('on'); },1600);
  }
  function pdfToastOff(){
    var t=document.getElementById('pdf-toast'); if(t) t.classList.remove('on');
  }
  /* 取分片正文：命中内存缓存就不再联网 */
  function pdfLoad(i,cb){
    if(cache[i]!==undefined){ cb(cache[i]); return; }
    fetch(furl(i)).then(function(r){
      if(!r.ok) throw new Error(r.status);
      return r.text();
    }).then(function(t){ cache[i]=t; cb(t); })
      .catch(function(){ cb(null); });
  }
  function pdfChunks(a,b){
    var o=[];
    for(var i=a;i<=b;i++) if(MF[i]) o.push(i);
    return o;
  }
  /* 一级目录节点 = 篇（n-part）；按 manifest 顺序求出每篇覆盖的分片区间 */
  function pdfChapters(){
    var list=[], ns=toc.querySelectorAll('li.node.n-part');
    for(var i=0;i<ns.length;i++){
      var n=ns[i], id=n.dataset.id;
      if(HM[id]===undefined) continue;
      var tx=n.querySelector(':scope > .row > .tx');
      list.push({id:id, name:(tx?tx.textContent:(TT[id]||id)).trim(), start:HM[id]});
    }
    list.sort(function(a,b){ return a.start-b.start; });
    for(var j=0;j<list.length;j++){
      var e=(j<list.length-1?list[j+1].start:MF.length)-1;
      list[j].end=(e<list[j].start?list[j].start:e);
    }
    return list;
  }
  /* 当前视口所在的分片：用已挂载标题的锚点归属推断 */
  function pdfCurChunk(){
    var hs=contentEl.querySelectorAll('h1[id],h2[id]'), best=(lastIdx>=0?lastIdx:0);
    var minHM=Infinity;
    for(var i=0;i<hs.length;i++){
      var v=HM[hs[i].id];
      if(v!==undefined && v<minHM) minHM=v;
    }
    if(minHM<Infinity) best=minHM;
    for(var k=0;k<hs.length;k++){
      if(hs[k].getBoundingClientRect().top<=150 && HM[hs[k].id]!==undefined) best=Math.max(best,HM[hs[k].id]);
    }
    return best;
  }
  function pdfCurChapter(){
    var ci=pdfCurChunk(), list=pdfChapters();
    if(!list.length) return null;
    for(var i=0;i<list.length;i++)
      if(ci>=list[i].start && ci<=list[i].end) return list[i];
    var best=list[0];
    for(var j=0;j<list.length;j++) if(list[j].start<=ci) best=list[j];
    return best;
  }
  /* 二级目录节点 = 节（leaf 节点）；mid = 所在分片，slice = 分片内锚点 id */
  function pdfSections(){
    var list=[], ns=toc.querySelectorAll('li.node.leaf');
    for(var i=0;i<ns.length;i++){
      var n=ns[i], id=n.dataset.id;
      if(HM[id]===undefined) continue;
      var tx=n.querySelector('.tx');
      list.push({id:id, name:(tx?tx.textContent:(TT[id]||id)).trim(), mid:HM[id]});
    }
    return list;
  }
  /* 当前所在的节：hash 命中优先（点击链接后立即导出也正确），其次视口位置 */
  function pdfCurSection(){
    var secs=pdfSections();
    if(!secs.length) return null;
    var names={};
    secs.forEach(function(s){ names[s.id]=s; });
    var h=null;
    if(location.hash.length>1){ try{ h=decodeURIComponent(location.hash.slice(1)); }catch(e){ h=null; } }
    if(h && names[h]) return names[h];
    if(h){
      var el=contentEl.querySelector('[id="'+h+'"]'), node=el;
      while(node){
        if(/^H[12]$/.test(node.tagName) && node.id && names[node.id]) return names[node.id];
        node=node.previousElementSibling;
      }
    }
    var hs=contentEl.querySelectorAll('h1[id],h2[id]'), cur=null;
    for(var i=0;i<hs.length;i++){
      if(hs[i].getBoundingClientRect().top<=150 && names[hs[i].id]) cur=names[hs[i].id];
    }
    if(cur) return cur;
    var ci=pdfCurChunk();
    for(var j=0;j<secs.length;j++) if(secs[j].mid===ci) return secs[j];
    return secs[0];
  }
  /* 节级导出：从分片 HTML 里截取「锚点标题 → 下一个 h1/h2 之前」；无 slice 原样返回 */
  function pdfTrim(g,html){
    if(!g || !g.slice) return html;
    var d=document.createElement('div');
    d.innerHTML=html;
    var el=d.querySelector('[id="'+g.slice+'"]');
    if(!el) return html;
    var parts=[], node=el;
    while(node){
      if(node!==el && /^(H1|H2)$/.test(node.tagName)) break;
      parts.push(node.outerHTML);
      node=node.nextElementSibling;
    }
    return parts.join('');
  }
  /* 点击的瞬间就开窗（保持在用户手势内，避免被拦截），先显示占位再替换正文 */
  function pdfOpenWin(){
    var w;
    try{ w=window.open('','pdf_'+location.pathname.replace(/[^0-9a-zA-Z]/g,'_')); }catch(e){}
    if(!w) return null;
    try{
      w.document.open();
      w.document.write('<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">'
        +'<title>正在生成 PDF…</title><style>html,body{height:100%;margin:0}'
        +'body{display:grid;place-items:center;color:#6e6e73;'
        +'font:14px/1.7 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif}'
        +'b{display:block;font-size:15px;color:#1c1c1e;margin-bottom:6px;font-weight:600}'
        +'</style></head><body><div><b>正在生成 PDF…</b>内容较多时需要几秒钟，请稍候</div></body></html>');
      w.document.close();
    }catch(e){ return null; }
    return w;
  }
  function pdfPrint(w,title,inner){
    var base=location.href.replace(/[?#][\s\S]*$/,'').replace(/[^\/]*$/,'');
    var html='<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">'
      +'<title>'+esc(title)+'</title>'
      +'<base href="'+base+'">'
      +'<link rel="stylesheet" href="assets/fonts.css">'
      +'<link rel="stylesheet" href="assets/style.css">'
      +'<style>'+PRINT_CSS+'</style>'
      +'</head><body class="pdf-body"><div class="wrap"><main class="main">'
      +'<article id="content">'+inner+'</article></main></div></body></html>';
    try{
      w.document.open();
      w.document.write(html);
      w.document.close();
    }catch(e){ return; }
    var n=0, timer=setInterval(function(){
      n++;
      var ready=false;
      try{ ready=w.document.readyState==='complete'; }catch(e){ ready=true; }
      if(ready || n>60){
        clearInterval(timer);
        setTimeout(function(){
          try{ w.focus(); w.print(); }catch(e){}
        },450);
      }
    },120);
  }
  /* ---------- 下载为独立 HTML 文件 ---------- */
  function pdfCollectCss(){
    try{
      var out=[];
      for(var i=0;i<document.styleSheets.length;i++){
        var ss=document.styleSheets[i];
        try{
          var r=ss.cssRules;
          if(r) for(var j=0;j<r.length;j++) out.push(r[j].cssText);
        }catch(e){}
      }
      if(out.length) return out.join('\n');
    }catch(e){}
    return null;
  }
  function htmlDownload(title, body){
    var fin=function(css){
      var html='<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">'
        +'<meta name="viewport" content="width=device-width,initial-scale=1">'
        +'<title>'+esc(title)+'</title>'
        +'<style>'+(css||'')+'\n'+PRINT_CSS+'</style>'
        +'</head><body class="pdf-body"><div class="wrap"><main class="main">'
        +'<article id="content">'+body+'</article></main></div></body></html>';
      var blob=new Blob([html],{type:'text/html;charset=utf-8'});
      var a=document.createElement('a');
      a.href=URL.createObjectURL(blob);
      a.download=title.replace(/[\\\/:*?"<>|]/g,'_')+'.html';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function(){ URL.revokeObjectURL(a.href); },4000);
      pdfToast('HTML 文件已开始下载');
    };
    var css=pdfCollectCss();
    if(css){ fin(css); return; }
    fetch('assets/style.css').then(function(r){ return r.ok ? r.text() : ''; })
      .then(function(t){ fin(t); })
      .catch(function(){ fin(''); });
  }
  function pdfExport(groups,title,asHtml){
    if(!groups || !groups.length){ pdfToast('没有可导出的内容'); return; }
    var win=null;
    if(!asHtml){
      win=pdfOpenWin();
      if(!win){ pdfToast('浏览器拦截了弹出窗口，请允许后重试'); alert('浏览器拦截了弹出窗口。请允许本站打开弹出窗口后重试。'); return; }
    }
    var total=0;
    groups.forEach(function(g){ total+=g.idx.length; });
    var gi=0, ki=0, out=[];
    pdfToast('正在准备导出…',true);
    (function step(){
      if(gi>=groups.length){ build(); return; }
      var g=groups[gi];
      if(ki>=g.idx.length){ gi++; ki=0; step(); return; }
      var i=g.idx[ki++];
      pdfLoad(i,function(html){
        if(html==null){ pdfToast('内容加载失败，请检查网络后重试'); return; }
        out.push({g:gi, html:html});
        pdfToast('正在准备 '+out.length+' / '+total+' 段…',true);
        step();
      });
    })();
    function build(){
      pdfToast('正在排版…',true);
      setTimeout(function(){
        var st=pdfStageEl(), buf=[], acc='', cur=-1;
        out.forEach(function(o){
          if(o.g!==cur){ if(acc) buf.push(pdfTrim(groups[cur],acc)); acc=''; cur=o.g; }
          acc+=o.html;
        });
        if(acc) buf.push(pdfTrim(groups[cur],acc));
        st.innerHTML=buf.map(function(h){
          return '<section class="pdf-chap">'+h+'</section>';
        }).join('');
        /* 折叠的解答 / 示例必须展开，否则打印出来是空的 */
        var det=st.querySelectorAll('details');
        for(var i=0;i<det.length;i++) det[i].open=true;
        var favs=st.querySelectorAll('.fav');
        for(var j=0;j<favs.length;j++) favs[j].parentNode.removeChild(favs[j]);
        var body=st.innerHTML;
        st.innerHTML='';
        if(asHtml) htmlDownload(title, body); else pdfPrint(win, title, body);
        pdfToastOff();
      },60);
    }
  }
  /* ---------- 顶栏「导出」按钮 ---------- */
  var pdfBtn=$('#pdf-open'), pdfPop=$('#pdf-pop'), pdfCurName=$('#pdf-cur-name');
  var pdfFmt='print';
  try{ pdfFmt=localStorage.getItem(SITE+'-pdf-fmt')||'print'; }catch(e){}
  function pdfFmtApply(){
    var f=document.getElementById('pdf-fmt');
    if(!f) return;
    [].forEach.call(f.querySelectorAll('button'),function(b){
      b.classList.toggle('on', b.dataset.fmt===pdfFmt);
    });
  }
  if(pdfBtn && pdfPop){
    pdfBtn.addEventListener('click',function(e){
      e.stopPropagation();
      pdfPop.hidden=!pdfPop.hidden;
      if(!pdfPop.hidden){
        var fbar=document.getElementById('fbar'); if(fbar) fbar.open=false;
        var dd=document.querySelector('details.exam-dd'); if(dd) dd.open=false;
        pdfFmtApply();
        var ch=pdfCurChapter();
        if(pdfCurName) pdfCurName.textContent='导出本章'+(ch?' · '+ch.name:'');
        var sec=pdfCurSection(), secEl=document.getElementById('pdf-sec-name');
        if(secEl) secEl.textContent='导出本节'+(sec?' · '+sec.name:'');
      }
    });
    document.addEventListener('click',function(e){
      if(!e.target.closest('#pdfbar') && !pdfPop.hidden) pdfPop.hidden=true;
    });
    pdfPop.addEventListener('click',function(e){
      var fb=e.target.closest('.pdf-fmt button');
      if(fb){
        pdfFmt=fb.dataset.fmt||'print';
        try{ localStorage.setItem(SITE+'-pdf-fmt', pdfFmt); }catch(err){}
        pdfFmtApply();
        return;
      }
      var b=e.target.closest('.pdf-item'); if(!b) return;
      pdfPop.hidden=true;
      var asHtml=pdfFmt==='html';
      if(b.dataset.scope==='sec'){
        var sec=pdfCurSection();
        if(!sec){ pdfToast('没有可导出的内容'); return; }
        pdfExport([{name:sec.name, idx:[sec.mid], slice:sec.id}], SITE+' · '+sec.name, asHtml);
      }else if(b.dataset.scope==='cur'){
        var ch=pdfCurChapter();
        if(!ch){ pdfToast('没有可导出的内容'); return; }
        pdfExport([{name:ch.name, idx:pdfChunks(ch.start,ch.end)}], SITE+' · '+ch.name, asHtml);
      }else{
        var list=pdfChapters();
        pdfExport(list.map(function(c){
          return {name:c.name, idx:pdfChunks(c.start,c.end)};
        }), SITE+' · 全册', asHtml);
      }
    });
  }
  /* ---------- 侧栏每篇右侧的快捷导出 ---------- */
  (function chapterPdfButtons(){
    var list=pdfChapters();
    list.forEach(function(c){
      var n=toc.querySelector('.node[data-id="'+c.id+'"]');
      if(!n) return;
      var row=n.querySelector(':scope > .row');
      if(!row || row.querySelector('.node-pdf')) return;
      var b=document.createElement('button');
      b.type='button';
      b.className='node-pdf';
      b.title='导出 PDF：'+c.name;
      b.setAttribute('aria-label','导出 PDF：'+c.name);
      b.innerHTML='<svg viewBox="0 0 24 24" width="11" height="11" fill="none" '
        +'stroke="currentColor" stroke-width="2" stroke-linecap="round" '
        +'stroke-linejoin="round"><path d="M12 4v9m0 0l-3.6-3.6M12 13l3.6-3.6"/>'
        +'<path d="M4.5 17.5v1.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-1.5"/></svg>';
      b.addEventListener('click',function(e){
        e.preventDefault(); e.stopPropagation();
        pdfExport([{name:c.name, idx:pdfChunks(c.start,c.end)}], SITE+' · '+c.name, pdfFmt==='html');
      });
      row.appendChild(b);
    });
  })();
  /* ---------- 侧栏每一节右侧的快捷导出 ---------- */
  (function sectionPdfButtons(){
    pdfSections().forEach(function(s){
      var n=toc.querySelector('.node[data-id="'+s.id+'"]');
      if(!n) return;
      var row=n.querySelector(':scope > .row');
      if(!row || row.querySelector('.node-pdf')) return;
      var b=document.createElement('button');
      b.type='button';
      b.className='node-pdf';
      b.title='导出本节 PDF：'+s.name;
      b.setAttribute('aria-label','导出本节 PDF：'+s.name);
      b.innerHTML='<svg viewBox="0 0 24 24" width="11" height="11" fill="none" '
        +'stroke="currentColor" stroke-width="2" stroke-linecap="round" '
        +'stroke-linejoin="round"><path d="M12 4v9m0 0l-3.6-3.6M12 13l3.6-3.6"/>'
        +'<path d="M4.5 17.5v1.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-1.5"/></svg>';
      b.addEventListener('click',function(e){
        e.preventDefault(); e.stopPropagation();
        pdfExport([{name:s.name, idx:[s.mid], slice:s.id}], SITE+' · '+s.name, pdfFmt==='html');
      });
      row.appendChild(b);
    });
  })();

  /* ---------- 启动：先恢复目录/进度，再挂滚动监听 ---------- */
  (function boot(){
    restoreTocState();
    syncFavUI();
    var target=null;
    if(location.hash.length>1){
      try{ target=decodeURIComponent(location.hash.slice(1)); }catch(e){ target=null; }
    }
    if(!target){
      try{ target=localStorage.getItem(RKEY)||''; }catch(e){ target=''; }
    }
    if(target && HM[target]!==undefined){
      go(target);
    }else{
      show(0,null);
    }
  })();
  window.addEventListener('scroll',onScroll,{passive:true});
})();
