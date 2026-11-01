
(function(){
  var $=function(s){return document.querySelector(s)};
  var $$=function(s){return Array.prototype.slice.call(document.querySelectorAll(s))};
  var toc=$('.toc'), side=$('.side'), mask=$('.mask');
  var topBtn=$('#topbtn');
  var input=$('#q'), sres=$('#sres'), srch=$('.srch');

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
  function openTo(id){
    var el=toc.querySelector('.node[data-id="'+id+'"]');
    if(!el) return;
    while(el && el!==toc){
      if(el.classList.contains('node')) el.classList.add('open');
      el=el.parentElement;
    }
  }
  /* ---------- 折叠块辅助：跳转目标在 <details> 内时自动展开 ---------- */
  function ensureVisible(el){
    var d=el && el.closest ? el.closest('details') : null;
    if(d && !d.open) d.open=true;
  }

  toc.addEventListener('click',function(e){
    var tw=e.target.closest('.tw');
    if(tw){
      var n=tw.closest('.node');
      n.classList.toggle('open');
      e.preventDefault();
      return;
    }
    var a=e.target.closest('a.tx');
    if(a){
      var id=a.getAttribute('href').slice(1);
      // 跳转到该节：展开其祖先链，其余分支自动折叠
      collapseTo(id);
      var tgt=document.getElementById(id);
      ensureVisible(tgt);            // 目标在折叠块内时先展开
      setCur(id);
      if(window.innerWidth<=1024){ side.classList.remove('open'); mask.classList.remove('on'); }
      return;
    }
  });

  /* ---------- 当前项高亮 ---------- */
  var heads=$$('.main>h1,.main>h2,.main>h3,.main>h4');
  var curId=null;
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
    // 当前小节
    var y=st+130, best=heads[0];
    for(var i=0;i<heads.length;i++){
      if(heads[i].offsetTop<=y) best=heads[i]; else break;
    }
    if(best) setCur(best.id);
  }
  window.addEventListener('scroll',onScroll,{passive:true});
  onScroll();

  topBtn.addEventListener('click',function(){
    window.scrollTo(0,0);
    try{localStorage.setItem(RKEY,'0')}catch(e){}
  });

  /* ---------- 阅读进度：localStorage 自动保存 / 恢复 ---------- */
  var RKEY='c-kb-progress', saveT=null;
  try{
    var _sy=parseInt(localStorage.getItem(RKEY)||'0',10);
    if(_sy>50){
      window.addEventListener('load',function(){
        setTimeout(function(){ window.scrollTo(0,_sy); onScroll(); },60);
      });
    }
  }catch(e){}
  window.addEventListener('scroll',function(){
    if(saveT) return;
    saveT=setTimeout(function(){
      saveT=null;
      try{localStorage.setItem(RKEY,String(window.scrollY))}catch(e){}
    },250);
  },{passive:true});

  /* ---------- 搜索索引 ---------- */
  var idx=[];
  (function(){
    var cs=$$('.main>*'), cur=null;
    cs.forEach(function(el){
      if(/^H[1-4]$/.test(el.tagName)){
        cur={id:el.id,t:el.textContent.trim(),lv:+el.tagName[1],body:[]};
        idx.push(cur);
      }else if(cur){ cur.body.push(el.textContent.trim()); }
    });
    idx.forEach(function(x){ x.s=x.body.join(' ').replace(/\s+/g,' ').slice(0,200); });
  })();

  function esc(s){return s.replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function hl(s,terms){
    var e=esc(s), re=new RegExp('('+terms.map(function(t){return t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}).join('|')+')','gi');
    return e.replace(re,'<mark>$1</mark>');
  }

  var sel=-1, results=[];
  function doSearch(){
    var q=input.value.trim().toLowerCase();
    srch.classList.toggle('has',!!q);
    if(!q){
      sres.classList.remove('on'); toc.classList.remove('filtering');
      $$('.node').forEach(function(n){n.classList.remove('match')});
      return;
    }
    var terms=q.split(/\s+/).filter(Boolean);
    results=idx.filter(function(x){
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
        // 标记祖先链，保证命中项在折叠树里可见
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
    var el=document.getElementById(r.id);
    if(el){
      ensureVisible(el);           // 目标在折叠块内时先展开
      collapseTo(r.id);          // 其他分支自动折叠
      el.scrollIntoView({block:'start'});
    }
    sres.classList.remove('on');
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
        var r=results[sel]; var t=document.getElementById(r.id);
        if(t){ ensureVisible(t); collapseTo(r.id); t.scrollIntoView({block:'start'}); }
        sres.classList.remove('on');
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

  /* ---------- 代码复制 ---------- */
  $$('.codeblk').forEach(function(b){
    var btn=b.querySelector('.ccopy');
    btn.addEventListener('click',function(){
      var t=b.querySelector('pre').innerText;
      navigator.clipboard.writeText(t).then(function(){
        btn.textContent='已复制'; btn.classList.add('ok');
        setTimeout(function(){btn.textContent='复制';btn.classList.remove('ok')},1600);
      });
    });
  });

  /* ---------- 标题 → 篇徽标 ---------- */
  $$('.main>h1').forEach(function(h){
    var m=h.textContent.match(/^第\s*(\d+)\s*篇/);
    if(m){
      h.innerHTML='<span class="hpart">第 '+m[1]+' 篇</span>'+
        h.textContent.replace(/^第\s*\d+\s*篇\s*/,'');
    } else if(/^学习路线篇/.test(h.textContent)){
      h.innerHTML='<span class="hpart">路线</span>'+
        h.textContent.replace(/^学习路线篇\s*/,'');
    }
  });
})();
