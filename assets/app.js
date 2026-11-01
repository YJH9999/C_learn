(function(){
  var $=function(s){return document.querySelector(s)};
  var $$=function(s){return Array.prototype.slice.call(document.querySelectorAll(s))};
  var toc=$('.toc'), side=$('.side'), mask=$('.mask');
  var topBtn=$('#topbtn');
  var input=$('#q'), sres=$('#sres'), srch=$('.srch');
  var contentEl=$('#content');
  var MF=window.CK_MANIFEST||[], HM=window.CK_HEADMAP||{};
  var cache={}, lastIdx=-1, loadingNext=false;

  /* ---------- 目录折叠 ---------- */
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

  /* ================================================================
     分章内容加载（懒加载 + 向下续载）
     index.html 只含外壳；正文按章节存于 assets/content/*.html，
     由 CK_MANIFEST 给出顺序，CK_HEADMAP 把标题锚点映射到片段序号。
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
  function afterInject(anchor){
    rebindHeads();
    if(anchor){
      var el=document.getElementById(anchor);
      if(el){ ensureVisible(el); el.scrollIntoView({block:'start'}); }
      else window.scrollTo(0,0);
    }
    maybeAppend();
  }
  function show(i, anchor){
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
          afterInject(anchor);
        });
      } else afterInject(anchor);
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
        onScroll();
      }
    });
  }
  function maybeAppend(){
    var doc=document.documentElement;
    if(doc.scrollHeight - window.innerHeight - window.scrollY < 900) appendNext();
  }

  /* ---------- 跳转（目录 / 搜索共用） ---------- */
  function go(id){
    if(HM[id]===undefined) return;
    collapseTo(id);
    setCur(id);
    var el=document.getElementById(id);
    if(el){ ensureVisible(el); el.scrollIntoView({block:'start'}); }
    else show(HM[id], id);
    savePos(id);
    if(window.innerWidth<=1024){ side.classList.remove('open'); mask.classList.remove('on'); }
  }

  toc.addEventListener('click',function(e){
    var tw=e.target.closest('.tw');
    if(tw){
      tw.closest('.node').classList.toggle('open');
      e.preventDefault();
      return;
    }
    var a=e.target.closest('a.tx');
    if(a){ e.preventDefault(); go(a.getAttribute('href').slice(1)); }
  });

  /* ---------- 当前项高亮（滚动联动） ---------- */
  var heads=[], curId=null;
  function setCur(id){
    if(id===curId) return;
    curId=id;
    $$('.node.cur').forEach(function(n){n.classList.remove('cur')});
    var n=toc.querySelector('.node[data-id="'+id+'"]');
    if(n){
      n.classList.add('cur');
      var row=n.querySelector('.row');
      var tr=row.getBoundingClientRect(), sr=toc.getBoundingClientRect();
      if(tr.top<sr.top+10||tr.bottom>sr.bottom-10)
        toc.scrollTop+=tr.top-sr.top-toc.clientHeight/2;
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

  topBtn.addEventListener('click',function(){
    window.scrollTo(0,0);
    if(lastIdx!==0) show(0,null);
    savePos('');
  });

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
  var sReady=false, pendQ=null, sel=-1, results=[];
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
    var IDX=window.CK_SEARCH||[];
    results=IDX.filter(function(x){
      var t=x.t.toLowerCase();
      return terms.every(function(w){return t.indexOf(w)!==-1 || x.s.toLowerCase().indexOf(w)!==-1;});
    }).slice(0,40);
    // 目录联动
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
    go(r.id);
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
        go(r.id);
      }
    }
  });

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

  /* ---------- 移动端 ---------- */
  $('#mob').addEventListener('click',function(){
    side.classList.toggle('open'); mask.classList.toggle('on');
  });
  mask.addEventListener('click',function(){ side.classList.remove('open'); mask.classList.remove('on'); });

  /* ---------- 代码复制（事件委托，内容动态加载也生效） ---------- */
  document.addEventListener('click',function(e){
    var btn=e.target.closest('.ccopy'); if(!btn) return;
    var b=btn.closest('.codeblk'); if(!b) return;
    var t=b.querySelector('pre').innerText;
    navigator.clipboard.writeText(t).then(function(){
      btn.textContent='已复制'; btn.classList.add('ok');
      setTimeout(function(){btn.textContent='复制';btn.classList.remove('ok')},1600);
    });
  });

  /* ---------- 启动：先读进度，再挂滚动监听（避免覆盖进度） ---------- */
  (function boot(){
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
