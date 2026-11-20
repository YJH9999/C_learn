/* ============================================================
   C 语言备考中心 · exam_app.js
   三个版块：理论复习 / 理论模拟（组卷判分）/ 编程模拟（在线运行）
   数据：assets/exam/{review_data,theory_bank,prog_bank}.json
   依赖：style.css 设计令牌（代码示例一律用构建期 GCC 实跑结果，前端不再执行代码）
   ============================================================ */
(function(){
'use strict';
function $(s,c){ return (c||document).querySelector(s); }
function $$(s,c){ return [].slice.call((c||document).querySelectorAll(s)); }

/* ---------- 章节（与知识库 14 章对齐） ---------- */
var CH=[
  {id:'ch1', name:'C 语言概述'},
  {id:'ch2', name:'算法与结构化程序设计'},
  {id:'ch3', name:'数据类型及其运算'},
  {id:'ch4', name:'顺序结构与输入输出'},
  {id:'ch5', name:'选择结构'},
  {id:'ch6', name:'循环结构'},
  {id:'ch7', name:'数组与字符串'},
  {id:'ch8', name:'函数'},
  {id:'ch9', name:'指针'},
  {id:'ch10',name:'结构体、共用体与枚举'},
  {id:'ch11',name:'文件'},
  {id:'ch12',name:'预处理与宏'},
  {id:'ch13',name:'位运算'},
  {id:'ch14',name:'堆内存管理'}
];
var CHMAP={}; CH.forEach(function(c){ CHMAP[c.id]=c.name; });
var TYPE_NAME={single:'单选题',judge:'判断题',fill:'填空题',read:'程序阅读'};
var LEVEL_NAME={1:'★ 基础',2:'★★ 中等',3:'★★★ 提高'};

/* ---------- 主题（与主站共用 c-kb-theme） ---------- */
var mL=$('#m-light'), mD=$('#m-dark');
function applyTheme(t){
  document.body.classList.toggle('dark',t==='dark');
  mL.classList.toggle('on',t==='light');
  mD.classList.toggle('on',t==='dark');
  try{localStorage.setItem('c-kb-theme',t)}catch(e){}
}
var saved=(function(){try{return localStorage.getItem('c-kb-theme')}catch(e){return null}})();
if(saved!=='light'&&saved!=='dark')
  saved=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';
applyTheme(saved);
mL.addEventListener('click',function(){applyTheme('light')});
mD.addEventListener('click',function(){applyTheme('dark')});

/* ---------- 工具 ---------- */
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
/* 行内渲染：`x` → <code>，**x** → <b> */
function inl(s){
  return esc(s)
    .replace(/`([^`]+)`/g,'<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>');
}
function norm(s){ return String(s||'').replace(/\s+/g,'').toLowerCase(); }
function shuffle(a){
  for(var i=a.length-1;i>0;i--){ var j=Math.floor(Math.random()*(i+1));
    var t=a[i]; a[i]=a[j]; a[j]=t; } return a;
}
function lstore(k,v){ try{localStorage.setItem(k,JSON.stringify(v))}catch(e){} }
function lget(k,d){ try{var s=localStorage.getItem(k); return s?JSON.parse(s):d}catch(e){return d} }

/* ---------- 数据惰性加载 ---------- */
var DATA={review:null, theory:null, prog:null};
var BK={kind:'theory', bound:false, loaded:{}};   /* 题库浏览状态（须先于 showView 初始化） */
var loading={};
var EXFILE={review:'review_data', theory:'theory_bank', prog:'prog_bank'};
function loadJSON(name, cb){
  if(DATA[name]){ cb(DATA[name]); return; }
  if(loading[name]){ loading[name].push(cb); return; }
  loading[name]=[cb];
  fetch('assets/exam/'+EXFILE[name]+'.json').then(function(r){
    if(!r.ok) throw new Error(r.status);
    return r.json();
  }).then(function(j){
    DATA[name]=j;
    (loading[name]||[]).forEach(function(f){ f(j); });
    loading[name]=null;
  }).catch(function(e){
    var box=$('#view-'+(name==='review'?'review':name==='theory'?'theory':'prog')+' .ex-empty');
    if(box) box.textContent='数据加载失败：'+e.message+'（需通过 HTTP 访问）';
    loading[name]=null;
  });
}

/* ---------- 视图切换 ---------- */
var tabs=$('#extabs');
tabs.addEventListener('click',function(e){
  var b=e.target.closest('button[data-view]');
  if(!b) return;
  showView(b.dataset.view);
});
function showView(v){
  $$('button[data-view]',tabs).forEach(function(b){
    b.classList.toggle('on',b.dataset.view===v);
  });
  $$('.view').forEach(function(s){ s.classList.toggle('on',s.id==='view-'+v); });
  if(location.hash!=='#'+v) history.replaceState(null,'','#'+v);
  window.scrollTo(0,0);
  if(v==='review')  loadJSON('review', renderReview);
  if(v==='theory')  loadJSON('theory', renderTheory);
  if(v==='prog')    loadJSON('prog',   renderProg);
  if(v==='bank')    loadBank();
}
var VIEWS=['review','theory','prog','bank'];
var h0=(location.hash||'').replace('#','');
showView(VIEWS.indexOf(h0)>=0?h0:'review');
window.addEventListener('hashchange',function(){
  var h=(location.hash||'').replace('#','');
  if(VIEWS.indexOf(h)>=0 &&
     !$('#view-'+h).classList.contains('on')) showView(h);
});

/* ============================================================
   版块一：理论复习
   ============================================================ */
/* ---- 要点标签芯片（重点/难点/易错/易混/偏僻） ---- */
var TAG_CLS={'重点':'imp','难点':'hard','易错':'err','易混':'mix','偏僻':'odd'};
var TAG_LIST=[['','全部'],['重点','重点'],['高频','高频'],['易错','易错'],['易混','易混'],['偏僻','偏僻']];
function tagHTML(tags){
  if(!tags||!tags.length) return '';
  return '<span class="pt-tags">'+tags.map(function(t){
    return '<span class="pt-tag tg-'+(TAG_CLS[t]||'imp')+'">'+esc(t)+'</span>';
  }).join('')+'</span>';
}
/* ---- 易混辨析块 ---- */
function confHTML(conf){
  if(!conf||!conf.length) return '';
  return '<div class="conf-box"><div class="conf-tt">⚖ 易混辨析</div>'
    +conf.map(function(c){
      return '<div class="conf-row"><b>'+inl(c.k)+'</b><span>'+inl(c.v)+'</span></div>';
    }).join('')+'</div>';
}
/* ---- 理论复习：状态 ---- */
var REV={tag:'', kw:'', open:true, obs:null};
function revHit(){ return $('#rev-hit'); }
function attr(s){ return esc(s).replace(/"/g,'&quot;'); }
function revPts(){ return $$('#rev-body .rev-pt'); }
/* 只在文本节点上包 <mark>，不动结构 */
function clearMark(root){
  $$('mark.mk',root).forEach(function(m){
    var t=document.createTextNode(m.textContent);
    m.parentNode.replaceChild(t,m);
  });
  if(root.normalize) root.normalize();
}
function markIn(el,kw){
  if(!kw) return 0;
  var walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT,null),nodes=[],n,cnt=0;
  while((n=walker.nextNode())) if(n.nodeValue && n.nodeValue.toLowerCase().indexOf(kw)>=0) nodes.push(n);
  nodes.forEach(function(node){
    var s=node.nodeValue,low=s.toLowerCase(),i=low.indexOf(kw),frag=document.createDocumentFragment(),last=0;
    while(i>=0){
      if(i>last) frag.appendChild(document.createTextNode(s.slice(last,i)));
      var m=document.createElement('mark'); m.className='mk'; m.textContent=s.slice(i,i+kw.length);
      frag.appendChild(m); cnt++; last=i+kw.length; i=low.indexOf(kw,last);
    }
    if(last<s.length) frag.appendChild(document.createTextNode(s.slice(last)));
    node.parentNode.replaceChild(frag,node);
  });
  return cnt;
}
function applyRev(){
  var body=$('#rev-body'); if(!body) return;
  var kw=REV.kw, tag=REV.tag, hits=0, vis=0;
  revPts().forEach(function(p){
    var okTag = !tag || (p.dataset.tags||'').indexOf(tag)>=0;
    var okKw  = !kw || norm(p.dataset.txt||'').indexOf(norm(kw))>=0;
    var ok=okTag&&okKw;
    p.style.display = ok?'':'none';
    if(ok) vis++;
  });
  $$('#rev-body .rev-ch').forEach(function(sec){
    var any=$$('.rev-pt',sec).some(function(p){return p.style.display!=='none'});
    sec.style.display = any?'':'none';
    sec.classList.toggle('has-hit', any && (!!kw||!!tag));
  });
  clearMark(body);
  hits = kw ? markIn(body,kw) : 0;
  if(kw||tag) revHit().textContent = vis+' 条'+(kw?(' / 命中 '+hits+' 处'):'');
  else revHit().textContent = '';
}
function marksIn(root,kw){ markIn(root,kw); }
function renderReview(data){
  var nav=$('#rev-nav'), body=$('#rev-body');
  var total=data.reduce(function(a,s){return a+s.points.length},0);
  var nErr=0,nOdd=0;
  data.forEach(function(s){ s.points.forEach(function(p){
    var t=(p.tags||[]).join(' '); if(t.indexOf('易错')>=0)nErr++; if(t.indexOf('偏僻')>=0)nOdd++;
  }); });
  nav.innerHTML='<div class="rev-tools">'
    +'<input class="ex-filter" id="rev-q" type="search" placeholder="搜索要点（/ 聚焦）" autocomplete="off">'
    +'<div class="rev-tagbar">'+TAG_LIST.map(function(t){
        return '<button type="button" class="rev-tag'+(t[0]?'':' on')+'" data-tag="'+t[0]+'">'+t[1]+'</button>';
      }).join('')+'</div>'
    +'<div class="rev-ops"><button type="button" id="rev-open">展开</button>'
    +'<button type="button" id="rev-close">收起</button>'
    +'<span id="rev-hit"></span></div>'
    +'<div class="rev-sum">'+total+' 要点 · 易错 '+nErr+' · 偏僻 '+nOdd+'</div>'
    +'</div><div class="rev-navlist">'
    +CH.map(function(c){
      var sec=data.filter(function(x){return x.ch===c.id})[0];
      var n=sec?sec.points.length:0;
      return '<a href="#sec-'+c.id+'" class="ex-nav" data-ch="'+c.id+'">'
        +'<span>'+esc(c.name)+'</span><b>'+(n||'')+'</b></a>';
    }).join('')+'</div>';

  body.innerHTML=data.map(function(sec){
    var pts=sec.points.map(function(p,i){
      var txt=[p.t,p.d].concat((p.conf||[]).map(function(c){return c.k+c.v})).join(' ');
      return '<article class="rev-pt" id="pt-'+sec.ch+'-'+i+'" data-tags="'+attr((p.tags||[]).join(' '))+'" data-txt="'+attr(txt)+'">'
        +'<h3><i>'+String(i+1).padStart(2,'0')+'</i><span class="pt-t">'+inl(p.t)+'</span>'+tagHTML(p.tags)+'</h3>'
        +(p.d?'<p>'+inl(p.d)+'</p>':'')
        +confHTML(p.conf)
        +(p.code?'<div class="ex-codewrap"><button class="ex-copy" type="button">复制</button><pre class="ex-code">'+esc(p.code)+'</pre></div>':'')
        +'</article>';
    }).join('');
    return '<section class="rev-ch" id="sec-'+sec.ch+'" data-ch="'+sec.ch+'">'
      +'<h2 class="rev-h"><button class="rev-fold" type="button" aria-expanded="true">'
      +'<span class="rev-caret">▾</span>'+esc(sec.name)+'</button>'
      +'<span class="rev-cnt">'+sec.points.length+' 个要点</span></h2>'
      +'<div class="rev-list">'+pts+'</div></section>';
  }).join('')||'<div class="ex-empty">暂无数据</div>';

  /* 章节跳转 */
  nav.addEventListener('click',function(e){
    var a=e.target.closest('.ex-nav');
    if(a){
      e.preventDefault();
      var el=document.getElementById('sec-'+a.dataset.ch);
      if(el){ el.classList.remove('folded'); el.scrollIntoView({block:'start'}); markNav(a.dataset.ch); }
      return;
    }
    var tg=e.target.closest('.rev-tag');
    if(tg){
      REV.tag=tg.dataset.tag;
      $$('.rev-tag',nav).forEach(function(b){ b.classList.toggle('on', b===tg); });
      applyRev();
      return;
    }
    var op=e.target.id;
    if(op==='rev-open'||op==='rev-close'){
      REV.open=(op==='rev-open');
      $$('#rev-body .rev-ch').forEach(function(s){ s.classList.toggle('folded',!REV.open); });
      $$('#rev-body .rev-fold').forEach(function(b){ b.setAttribute('aria-expanded',String(REV.open)); });
    }
  });
  /* 单章折叠 */
  body.addEventListener('click',function(e){
    var f=e.target.closest('.rev-fold');
    if(f){
      var sec=f.closest('.rev-ch'); sec.classList.toggle('folded');
      f.setAttribute('aria-expanded',String(!sec.classList.contains('folded')));
      return;
    }
    var cp=e.target.closest('.ex-copy');
    if(cp){
      var code=cp.parentElement.querySelector('code,pre');
      if(code&&navigator.clipboard){ navigator.clipboard.writeText(code.textContent);
        cp.textContent='已复制'; setTimeout(function(){cp.textContent='复制'},1200); }
    }
  });
  /* 搜索 */
  var fq=$('#rev-q');
  fq.addEventListener('input',function(){ REV.kw=fq.value.trim(); applyRev(); });
  document.addEventListener('keydown',function(e){
    if(e.key==='/' && document.activeElement!==fq && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)){
      e.preventDefault(); fq.focus(); fq.select();
    }
  });
  /* 滚动联动：左栏高亮当前章 */
  if(REV.obs) REV.obs.disconnect();
  if(window.IntersectionObserver){
    REV.obs=new IntersectionObserver(function(es){
      es.forEach(function(en){ if(en.isIntersecting&&en.target.dataset.ch) markNav(en.target.dataset.ch); });
    },{rootMargin:'-90px 0px -72% 0px'});
    $$('#rev-body .rev-ch').forEach(function(s){ REV.obs.observe(s); });
  }
}
function markNav(ch){
  $$('.ex-nav').forEach(function(a){ a.classList.toggle('cur',a.dataset.ch===ch); });
}

/* ============================================================
   版块二：理论模拟
   ============================================================ */
var TH={stage:'setup', paper:null, rec:null};
var SYNC_T=null;
function pad2(n){ return ('0'+n).slice(-2); }
/* ---------- 试卷记录（kb-paper.js） ---------- */
function makeRec(qs){
  if(!window.KBPaper) return;
  var d=new Date();
  TH.rec={
    id:KBPaper.uid(), ts:Date.now(),
    title:(d.getMonth()+1)+'月'+d.getDate()+'日 '+pad2(d.getHours())+':'+pad2(d.getMinutes())+' 组卷',
    n:qs.length, total:qs.length,
    qs:qs.map(function(q){ return q.id; }),
    ans:{}, done:false, score:null, secs:0
  };
  KBPaper.put(TH.rec);
}
function syncRec(){
  if(!TH.rec || !window.KBPaper || !TH.paper) return;
  var a={};
  TH.paper.qs.forEach(function(q,i){ var u=userAns(i); if(u!==null) a[q.id]=u; });
  TH.rec.ans=a;
  if(!TH.rec.done) TH.rec.secs=Math.round((Date.now()-TH.rec.ts)/1000);
  KBPaper.put(TH.rec);
}
function queueSync(){ clearTimeout(SYNC_T); SYNC_T=setTimeout(syncRec, 900); }
function openRec(rec, act){
  var bank=DATA.theory||[], map={};
  bank.forEach(function(q){ map[q.id]=q; });
  var qs=(rec.qs||[]).map(function(id){ return map[id]; }).filter(Boolean);
  if(!qs.length) return alert('题库里已找不到这份卷子的题目了（题库可能更新过）');
  if(act==='redo'){
    TH.rec=null;
    genTheory(bank, null, qs.map(function(q){ return q.id; }));
    return;
  }
  TH.paper={qs:qs, t0:rec.ts||Date.now()};
  TH.rec=rec;
  TH.stage='paper';
  renderTheoryPaper();
  setTimeout(function(){
    qs.forEach(function(q,i){
      var a=rec.ans ? rec.ans[q.id] : undefined;
      if(a===undefined || a===null) return;
      if(q.type==='single'||q.type==='judge'){
        var r=document.querySelector('input[name="q'+i+'"][value="'+a+'"]');
        if(r) r.checked=true;
      }else{
        var t=document.querySelector('[name="q'+i+'"]');
        if(t) t.value=a;
      }
    });
    var n=Object.keys(rec.ans||{}).length;
    if($('#th-done')) $('#th-done').textContent=n;
    if(rec.done) gradeTheory(true);
  },40);
}

function renderTheory(bank){
  if(TH.stage==='setup') renderTheorySetup(bank);
}

/* ---- 组卷面板 ---- */
function chChecks(idAll){
  return '<div class="ex-chgrid">'+CH.map(function(c){
    return '<label class="ex-chk"><input type="checkbox" value="'+c.id+'" checked data-for="'+idAll+'">'
      +esc(c.name)+'</label>';
  }).join('')+'</div>';
}
/* ---------- 组卷面板（对齐 GS / XD 的组卷方式） ---------- */
var TY=[
  {id:'single',name:'单选题'},
  {id:'judge', name:'判断题'},
  {id:'fill',  name:'填空题'},
  {id:'read',  name:'程序阅读'}
];
var PRESETS={
  std: {single:20,judge:5,fill:5,read:3},
  obj: {single:30,judge:20,fill:20,read:0},
  read:{single:0,judge:0,fill:0,read:10},
  mini:{single:10,judge:5,fill:5,read:1},
  err: {single:15,judge:5,fill:10,read:0},
  jn:  {single:20,judge:0,fill:15,read:0}
};
/* 江南大学机考范围：第 1~5 章（条件分支为止） */
var JN_CHS=['ch1','ch2','ch3','ch4','ch5'];
var SRC_TABS=[
  {id:'',name:'全部来源'},
  {id:'真题',name:'历年真题'},
  {id:'模拟',name:'模拟卷'},
  {id:'原创',name:'原创 / 易错辨析'},
  {id:'教材',name:'教材样例改编'},
  {id:'实验与辅导',name:'实验与辅导'},
  {id:'二级',name:'二级真题改编'},
  {id:'测试卷',name:'1-6 章测试卷'},
  {id:'老师',name:'老师解析卷'}
];
var counts=Object.assign({},PRESETS.std);
var filterChs=[], filterSrc='';

function poolOf(bank,ty){
  return bank.filter(function(q){
    return q.type===ty
      && (!filterChs.length || filterChs.indexOf(q.ch)>=0)
      && (!filterSrc || String(q.src||'').indexOf(filterSrc)>=0);
  });
}
function refreshSetup(){
  var bank=DATA.theory||[];
  $$('#th-type-row .type-cell').forEach(function(cell){
    var ty=cell.dataset.ty;
    cell.querySelector('.stepper b').textContent=counts[ty]||0;
    var n=poolOf(bank,ty).length;
    cell.querySelector('.t-avail').textContent=n;
    cell.classList.toggle('lack',(counts[ty]||0)>n);
    cell.title=(counts[ty]||0)>n?('当前范围内仅 '+n+' 题，组卷时按实际数量抽取'):('可用 '+n+' 题');
  });
  var total=0; TY.forEach(function(t){ total+=+counts[t.id]||0; });
  var per=TY.map(function(t){ return counts[t.id]?(t.name.replace('题','')+' '+counts[t.id]):''; })
             .filter(Boolean).join(' · ');
  $('#th-total').textContent=total?('本次组卷：'+total+' 题　'+per):'';
  $('#th-stat').textContent='题库共 '+bank.length+' 题 — '
    +TY.map(function(t){
        return t.name+' '+bank.filter(function(q){ return q.type===t.id; }).length;
      }).join(' · ');
}
function renderTheorySetup(bank){
  TH.stage='setup';
  bank=bank||DATA.theory||[];
  var last=lget('ex-th-last',null);
  var wrong=lget('ex-th-wrong',[]);
  var map={}; bank.forEach(function(q){ map[q.id]=q; });
  var wl=wrong.slice(-6).reverse().map(function(id,k){
    var q=map[id]; if(!q) return '';
    var st=String(q.stem||'').replace(/\s+/g,' ').slice(0,58);
    return '<div class="wl-item"><b>'+(k+1)+'</b><span class="ex-tag t">'+TYPE_NAME[q.type]+'</span>'
      +'<span class="wl-stem">'+esc(st)+'</span></div>';
  }).join('');
  $('#th-stage').innerHTML=
    (last?'<div class="ex-banner">上次成绩：<b>'+last.score+'/'+last.total+'</b>（'+last.pct+'%）· '+esc(last.date)
      +'　<button class="btn btn-sm" id="th-review-last">查看卷面</button></div>':'')
    +'<div class="panel">'
    +'<h2>快速套卷</h2>'
    +'<div class="preset-row" id="th-presets">'
      +'<button class="chip on" data-preset="std">单选 20 · 判断 5 · 填空 5 · 阅读 3<small>期末主流结构</small></button>'
      +'<button class="chip" data-preset="obj">单选 30 · 判断 20 · 填空 20<small>客观题专练</small></button>'
      +'<button class="chip" data-preset="read">程序阅读 10<small>阅读程序专项</small></button>'
      +'<button class="chip" data-preset="mini">单选 10 · 判断 5 · 填空 5 · 阅读 1<small>小卷速测</small></button>'
      +'<button class="chip" data-preset="err">易错专练 30<small>只抽易错辨析题</small></button>'
      +'<button class="chip" data-preset="jn">江南机考 20+15<small>考到第 5 章分支</small></button>'
    +'</div>'
    +'<h2>题型与题量</h2>'
    +'<div class="muted" id="th-stat" style="margin:-6px 0 10px"></div>'
    +'<div class="type-row" id="th-type-row">'
      +TY.map(function(t){
        return '<div class="type-cell" data-ty="'+t.id+'">'
          +'<div class="t-name">'+t.name+'<small>题库 <b class="t-avail">0</b></small></div>'
          +'<div class="stepper"><button data-d="-1" type="button">−</button><b>'+counts[t.id]+'</b>'
          +'<button data-d="1" type="button">＋</button></div></div>';
      }).join('')
    +'</div>'
    +'<h2>章节范围 <span class="muted">可多选，不选=全部</span></h2>'
    +'<div class="chip-row" id="th-ch-row"><button class="chip on" data-ch="">全部章节</button>'
      +CH.map(function(c,i){ return '<button class="chip" data-ch="'+c.id+'">'+(i+1)+' '+esc(c.name)+'</button>'; }).join('')
    +'</div>'
    +'<h2>题目来源</h2>'
    +'<div class="chip-row" id="th-src-row">'
      +SRC_TABS.map(function(s,i){ return '<button class="chip'+(i?'':' on')+'" data-src="'+s.id+'">'+s.name+'</button>'; }).join('')
    +'</div>'
    +'<div class="frow end"><div class="paper-total" id="th-total"></div>'
    +'<button class="btn btn-primary" id="th-gen">开始组卷</button></div>'
    +'</div>'
    +'<div class="panel"><h2>历史试卷 <span class="muted" id="th-hist-n">'
      +(window.KBPaper&&KBPaper.list().length?KBPaper.list().length+' 份':'')+'</span></h2>'
      +'<div id="th-hist"></div></div>'
    +'<div class="panel"><h2>错题待巩固 <span class="muted">'+(wrong.length?wrong.length+' 道':'')+'</span></h2>'
      +'<div class="wrong-list">'+(wl||'<div class="muted">还没有错题，交卷后答错的题会自动收进来</div>')+'</div>'
      +(wrong.length?'<div class="btnrow" style="margin-top:10px">'
        +'<button class="btn btn-sm" id="th-redo">重练错题</button>'
        +'<button class="btn btn-sm" id="th-exp-wrong">导出错题</button>'
        +'<button class="btn btn-sm btn-ghost" id="th-clear-wrong">清空错题本</button></div>':'')
    +'</div>';

  /* 快速套卷 */
  $$('#th-presets .chip').forEach(function(b){
    b.addEventListener('click',function(){
      counts=Object.assign({},PRESETS[b.dataset.preset]);
      $$('#th-presets .chip').forEach(function(x){ x.classList.toggle('on',x===b); });
      /* 易错专练：来源筛到「原创·易错辨析」；江南机考：章节锁到第 1~5 章 */
      var pi=b.dataset.preset;
      filterSrc = (pi==='err') ? '原创·易错辨析' : '';
      filterChs  = (pi==='jn') ? JN_CHS.slice() : [];
      $$('#th-src-row .chip').forEach(function(x){
        x.classList.toggle('on', filterSrc ? x.dataset.src==='原创' : !x.dataset.src);
      });
      $$('#th-ch-row .chip').forEach(function(x){
        var vv=x.dataset.ch;
        x.classList.toggle('on', vv? filterChs.indexOf(vv)>=0 : !filterChs.length);
      });
      refreshSetup();
    });
  });
  /* 题量 stepper */
  $$('#th-type-row .stepper button').forEach(function(b){
    b.addEventListener('click',function(){
      var ty=b.closest('.type-cell').dataset.ty;
      counts[ty]=Math.max(0,Math.min(100,(+counts[ty]||0)+(+b.dataset.d)));
      refreshSetup();
    });
  });
  /* 章节多选 */
  $$('#th-ch-row .chip').forEach(function(b){
    b.addEventListener('click',function(){
      var v=b.dataset.ch;
      if(!v) filterChs=[];
      else{
        var i=filterChs.indexOf(v);
        if(i>=0) filterChs.splice(i,1); else filterChs.push(v);
      }
      $$('#th-ch-row .chip').forEach(function(x){
        var vv=x.dataset.ch;
        x.classList.toggle('on', vv? filterChs.indexOf(vv)>=0 : !filterChs.length);
      });
      refreshSetup();
    });
  });
  /* 来源单选 */
  $$('#th-src-row .chip').forEach(function(b){
    b.addEventListener('click',function(){
      $$('#th-src-row .chip').forEach(function(x){ x.classList.remove('on'); });
      b.classList.add('on'); filterSrc=b.dataset.src; refreshSetup();
    });
  });
  $('#th-gen').addEventListener('click',function(){ genTheory(bank); });
  var rl=$('#th-review-last');
  if(rl) rl.addEventListener('click',function(){
    if(TH.lastPaper) renderTheoryResult(TH.lastPaper,TH.lastResult,true);
  });
  var rd=$('#th-redo'), cw=$('#th-clear-wrong'), ew=$('#th-exp-wrong');
  if(rd) rd.addEventListener('click',function(){ genTheory(bank,null,lget('ex-th-wrong',[])); });
  if(ew) ew.addEventListener('click',function(){ doPrint('wrong'); });
  if(cw) cw.addEventListener('click',function(){
    if(!confirm('清空错题本？（只影响本机这一份错题记录）')) return;
    lstore('ex-th-wrong',[]); renderTheorySetup(bank);
  });
  if(window.KBPaper) KBPaper.render($('#th-hist'),{onOpen:openRec, attOpts:function(rec){ return {estSec:estFromRec(rec)}; }});
  refreshSetup();
}

/* ---- 抽题 ---- */
/* ---- 抽题：按题型配额 + 章节 / 来源过滤，题量不足时按实际数量抽 ---- */
function pickQuestions(bank,chs,types,want){
  var out=[];
  types.forEach(function(t){
    var n=+want[t]||0; if(n<=0) return;
    var pool=bank.filter(function(q){
      return q.type===t && chs.indexOf(q.ch)>=0;
    });
    out=out.concat(shuffle(pool).slice(0,n));
  });
  return out;
}
/* ---------- 作答方式：线上做题 / 离线做题 ---------- */
var EXAM_MIN={single:1.5, judge:1.2, fill:3, read:6};   /* 每题预计分钟 */
function estSecondsC(){
  var s=0;
  (TH.paper && TH.paper.qs ? TH.paper.qs : []).forEach(function(q){ s+=(EXAM_MIN[q.type]||2); });
  return Math.round(Math.min(s,150)*60);
}
function estFromRec(rec){
  if(rec && rec.estSec) return rec.estSec;
  var map={};
  (DATA.theory||[]).forEach(function(q){ map[q.id]=q; });
  var s=0;
  ((rec&&rec.qs)||[]).forEach(function(id){ var q=map[id]; if(q) s+=(EXAM_MIN[q.type]||2); });
  return Math.round(Math.min(s,150)*60);
}
function askMode(bank){
  if(!window.KBPaper){ renderTheoryPaper(); return; }
  KBPaper.chooseMode({
    rec: TH.rec,
    estSec: estSecondsC(),
    n: TH.paper ? TH.paper.qs.length : 0,
    total: 0,
    printBlank: function(){ doPrint('blank'); },
    printAns: function(){ doPrint('sol'); },
    onOnline: function(){ renderTheoryPaper(); },
    onOffline: function(){ renderTheorySetup(bank || DATA.theory); },
    onCancel: function(){ renderTheorySetup(bank || DATA.theory); }
  });
}
function genTheory(bank, mode, fixedIds){
  bank=bank||DATA.theory||[];
  var qs;
  if(fixedIds && fixedIds.length){
    qs=bank.filter(function(q){ return fixedIds.indexOf(q.id)>=0; });
    if(!qs.length){ alert('题库里找不到这些题了'); return; }
    qs=shuffle(qs);
  }else{
    var want=(mode==='full')?PRESETS.std:counts;
    var tips=[];
    qs=[];
    TY.forEach(function(t){
      var n=+want[t.id]||0; if(n<=0) return;
      var pool=poolOf(bank,t.id);
      if(!pool.length){ tips.push(t.name+'：当前范围内没有题目'); return; }
      if(pool.length<n) tips.push(t.name+'只够 '+pool.length+' 题');
      qs=qs.concat(shuffle(pool).slice(0,n));
    });
    if(!qs.length){ alert('所选范围内没有题目，请放宽章节或来源'); return; }
    qs=shuffle(qs);
    if(tips.length) setTimeout(function(){ alert('题量提示：\n'+tips.join('\n')+'\n\n已按实际可用数量组卷。'); },80);
  }
  TH.paper={qs:qs, t0:Date.now()};
  TH.rec=null;
  makeRec(qs);
  TH.stage='paper';
  askMode(bank);
}
/* ---- 试卷作答 ---- */
function qHTML(q,i){
  var h='<article class="ex-q" data-i="'+i+'">'
    +'<div class="ex-qh"><b>'+(i+1)+'</b>'
    +'<span class="ex-tag t">'+TYPE_NAME[q.type]+'</span>'
    +'<span class="ex-tag c">'+esc(CHMAP[q.ch]||q.ch)+'</span>'
    +'<span class="ex-tag s">'+esc(q.src||'')+'</span>'
    +'<span class="ex-mark" hidden></span></div>';
  h+='<div class="ex-stem">'+inl(q.stem)+'</div>';
  if(q.code) h+='<pre class="ex-code">'+esc(q.code)+'</pre>';
  if(q.type==='single'){
    h+='<div class="ex-opts">'+q.options.map(function(o,j){
      return '<label class="ex-opt"><input type="radio" name="q'+i+'" value="'+j+'">'
        +'<i>'+String.fromCharCode(65+j)+'．</i>'+inl(o)+'</label>';
    }).join('')+'</div>';
  }else if(q.type==='judge'){
    h+='<div class="ex-opts"><label class="ex-opt"><input type="radio" name="q'+i+'" value="1"><i>√</i>正确</label>'
      +'<label class="ex-opt"><input type="radio" name="q'+i+'" value="0"><i>×</i>错误</label></div>';
  }else if(q.type==='fill'){
    h+='<input class="ex-input" type="text" name="q'+i+'" placeholder="在此填写答案（判分忽略空格与大小写）" autocomplete="off">';
  }else if(q.type==='read'){
    h+='<textarea class="ex-input ta" name="q'+i+'" rows="3" placeholder="写出程序输出（判分忽略空格差异）" spellcheck="false"></textarea>';
  }
  h+='<div class="ex-exp" hidden></div></article>';
  return h;
}
function renderTheoryPaper(){
  var p=TH.paper;
  $('#th-stage').innerHTML=
    '<div class="ex-paperbar"><span>共 <b>'+p.qs.length+'</b> 题 · 已答 <b id="th-done">0</b>'
    +' · 用时 <b id="th-time">0:00</b></span>'
    +'<button class="btn btn-sm" id="th-abort">保存并退出</button>'
    +'<button class="btn btn-sm" id="th-exp">导出试卷</button>'
    +'<button class="btn btn-sm" id="th-exp-ans">含答案版</button>'
    +'<button class="btn btn-sm" id="th-exp-my">导出我的作答</button>'
    +'<button class="btn btn-sm" id="th-peek">看答案</button>'
    +'<button class="btn btn-primary" id="th-submit">交卷</button></div>'
    +'<div class="ex-qs">'+p.qs.map(qHTML).join('')+'</div>';
  document.getElementById('th-done').textContent='0';
  $$('#th-stage input, #th-stage textarea.ex-input').forEach(function(el){
    el.addEventListener('input',updateDone);
    el.addEventListener('change',updateDone);
  });
  function updateDone(){
    var n=0;
    p.qs.forEach(function(q,i){
      if(userAns(i)!==null) n++;
    });
    $('#th-done').textContent=n;
    queueSync();
  }
  var timer=setInterval(function(){
    if(TH.stage!=='paper'){ clearInterval(timer); return; }
    var s=Math.floor((Date.now()-p.t0)/1000);
    $('#th-time') && ($('#th-time').textContent=Math.floor(s/60)+':'+String(s%60).padStart(2,'0'));
  },1000);
  $('#th-abort').addEventListener('click',function(){
    syncRec();
    renderTheorySetup(DATA.theory);
  });
  $('#th-exp').addEventListener('click',function(){ doPrint('blank'); });
  $('#th-exp-ans') && $('#th-exp-ans').addEventListener('click',function(){ doPrint('sol'); });
  $('#th-exp-my').addEventListener('click',function(){ doPrint('answers'); });
  /* 不想作答：直接看全部答案与解析（不计分、不入错题本） */
  $('#th-peek').addEventListener('click',function(){ renderTheoryPeek(p); });
  $('#th-submit').addEventListener('click',function(){
    var un=p.qs.length - (+$('#th-done').textContent);
    if(un>0 && !confirm('还有 '+un+' 题未作答（未答题目按 0 分计，交卷后显示正确答案与解析），确定交卷？')) return;
    gradeTheory();
  });
  window.scrollTo(0,0);
}
function userAns(i){
  var q=TH.paper.qs[i];
  if(q.type==='single'||q.type==='judge'){
    var r=document.querySelector('input[name="q'+i+'"]:checked');
    return r?r.value:null;
  }
  var t=document.querySelector('[name="q'+i+'"]');
  return (t&&t.value.trim())?t.value:null;
}

/* ---- 判分 ---- */
function judgeOne(q,ua){
  if(ua===null) return false;
  if(q.type==='single') return +ua===q.answer;
  if(q.type==='judge') return (ua==='1')===!!q.answer;
  /* fill / read：多答案任一命中 */
  var alts=String(q.answer).split(' | ');
  return alts.some(function(a){ return norm(a)===norm(ua); });
}
function ansText(q){
  if(q.type==='single') return String.fromCharCode(65+q.answer)+'．'+q.options[q.answer];
  if(q.type==='judge') return q.answer?'正确':'错误';
  return String(q.answer);
}
function gradeTheory(replay){
  var p=TH.paper;
  var results=p.qs.map(function(q,i){
    var ua=userAns(i);
    return {ok:judgeOne(q,ua), ua:ua, q:q};
  });
  var score=results.filter(function(r){return r.ok}).length;
  var total=results.length;
  var pct=Math.round(score/total*100);
  var secs=Math.floor((Date.now()-p.t0)/1000);
  var result={score:score,total:total,pct:pct,secs:secs,results:results};
  if(!replay && window.KBStats){
    var _ans=results.filter(function(r){return r.ua!==null}).length;
    var _ok=results.filter(function(r){return r.ok}).length;
    KBStats.batch(_ans,_ok);
  }
  TH.lastPaper=p; TH.lastResult=result;
  if(!replay){
    try{localStorage.setItem('ex-th-last',JSON.stringify({
      score:score,total:total,pct:pct,
      date:new Date().toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})
    }))}catch(e){}
    /* 错题并入 localStorage（去重，保留最近 120 道；未作答的题不算错题） */
    var wrong=lget('ex-th-wrong',[]);
    results.forEach(function(r){
      if(!r.ok && r.ua!==null && wrong.indexOf(r.q.id)<0) wrong.push(r.q.id);
      if(r.ok){ var ix=wrong.indexOf(r.q.id); if(ix>=0) wrong.splice(ix,1); }
    });
    lstore('ex-th-wrong',wrong.slice(-120));
  }
  /* 试卷记录：交卷后写回分数与用时 */
  if(!replay && TH.rec && window.KBPaper){
    TH.rec.done=true;
    TH.rec.score=score;
    TH.rec.total=total;
    TH.rec.secs=secs;
    syncRec();
  }
  renderTheoryResult(p,result,!!replay);
}
/* ---- 导出（浏览器打印 → 另存为 PDF） ---- */
function p2(n){ return ('0'+n).slice(-2); }
function sheetHead(title, sub, withRule){
  var d=new Date();
  var ds=d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate());
  return '<div class="ps-head"><h1>'+title+'</h1><p class="ps-sub">'+ds+' · '+sub+'</p>'
    +(withRule===false?'':'<p class="ps-rule">姓名＿＿＿＿＿＿　学号＿＿＿＿＿＿　得分＿＿＿＿＿＿</p>')+'</div>';
}
function psQHead(q,i){
  return '<p class="ps-no"><b>'+(i+1)+'.</b>［'+TYPE_NAME[q.type]+'］'
    +(q.src?'<span class="ps-src">［'+esc(q.src)+'］</span>':'')+'</p>';
}
function psStem(q){
  var h='<div class="ps-stem">'+inl(q.stem)+'</div>';
  if(q.code) h+='<pre class="ps-code">'+esc(q.code)+'</pre>';
  return h;
}
function psOpts(q){
  if(q.type!=='single'||!q.options) return '';
  return '<div class="ps-opts">'+q.options.map(function(o,j){
    return '<p><b>'+String.fromCharCode(65+j)+'．</b>'+inl(o)+'</p>';
  }).join('')+'</div>';
}
function buildSheet(mode){
  var host=$('#print-sheet');
  if(!host) return;
  var h='';
  if(mode==='wrong'){
    var ids=lget('ex-th-wrong',[]), bank=DATA.theory||[], map={};
    bank.forEach(function(q){ map[q.id]=q; });
    var wqs=ids.map(function(id){ return map[id]; }).filter(Boolean);
    h=sheetHead('C 语言 · 错题本','共 '+wqs.length+' 题',false);
    wqs.forEach(function(q,i){
      h+='<div class="ps-q">'+psQHead(q,i)+psStem(q)+psOpts(q)
        +'<p class="cmp">参考答案：<b>'+esc(ansText(q))+'</b></p>'
        +(q.explanation?'<div class="sol-box"><b>解析</b>'+inl(q.explanation)+'</div>':'')
        +'</div>';
    });
    if(!wqs.length) h+='<p class="ps-sub">暂无错题。</p>';
  } else if(mode==='answers'){
    var p=TH.paper;
    if(!p) return alert('还没有试卷');
    var res=p.qs.map(function(q,i){ var ua=userAns(i); return {q:q,ua:ua,ok:judgeOne(q,ua)}; });
    var sc=res.filter(function(r){ return r.ok; }).length;
    h=sheetHead('C 语言 · 作答记录','共 '+res.length+' 题 · 答对 '+sc+' 题',false);
    res.forEach(function(r,i){
      var q=r.q, mine=r.ua;
      if(mine===null||mine===undefined) mine='未作答';
      else if(q.type==='single') mine=String.fromCharCode(65+(+r.ua))+'．'+q.options[+r.ua];
      h+='<div class="ps-q">'+psQHead(q,i)+psStem(q)+psOpts(q)
        +'<p class="cmp">我的作答：<b>'+esc(mine)+'</b>'
        +(r.ok?'　<span class="ok">✓ 正确</span>'
             :'　<span class="no">✗ 错误</span>　参考答案：<b>'+esc(ansText(q))+'</b>')
        +'</p>'
        +(q.explanation?'<div class="sol-box"><b>解析</b>'+inl(q.explanation)+'</div>':'')
        +'</div>';
    });
  } else {
    var pp=TH.paper;
    if(!pp) return alert('还没有试卷');
    var isAns=(mode==='sol');
    h=sheetHead('C 语言 · 理论模拟卷'+(isAns?'（含答案）':''),'共 '+pp.qs.length+' 题',true);
    pp.qs.forEach(function(q,i){
      h+='<div class="ps-q">'+psQHead(q,i)+psStem(q)+psOpts(q);
      if(q.type==='read') h+='<div class="ps-space" style="min-height:150px"></div>';
      if(q.type==='fill') h+='<div class="ps-space" style="min-height:34px"></div>';
      h+='</div>';
    });
    if(isAns){
      h+='<h2 class="ps-sol-head">参考答案与解析</h2>';
      pp.qs.forEach(function(q,i){
        h+='<div class="ps-q"><p class="ps-no"><b>'+(i+1)+'.</b>［'+TYPE_NAME[q.type]+'］'
          +'　答案：<b>'+esc(ansText(q))+'</b></p>'
          +'<div class="ps-stem">'+inl(q.stem)+'</div>'
          +(q.explanation?'<div class="sol-box"><b>解析</b>'+inl(q.explanation)+'</div>':'')
          +'</div>';
      });
    }
  }
  host.innerHTML=h;
}
/* 打印前等 KaTeX 字体真正就绪：卷面平时 display:none，字体不会加载，
   直接 print() 会打出缺字的公式。先离屏显示（.ps-prep）触发加载，再打印。 */
var KATEX_FONTS=['KaTeX_Main','KaTeX_Math','KaTeX_AMS','KaTeX_Caligraphic','KaTeX_Fraktur',
  'KaTeX_SansSerif','KaTeX_Script','KaTeX_Size1','KaTeX_Size2','KaTeX_Size3','KaTeX_Size4','KaTeX_Typewriter'];
function printAfterFonts(){
  var wrap=document.getElementById('print-wrap');
  if(wrap) wrap.classList.add('ps-prep');
  var jobs=[];
  if(document.fonts && document.fonts.load && document.fonts.ready){
    KATEX_FONTS.forEach(function(f){ try{ jobs.push(document.fonts.load('16px "'+f+'"').catch(function(){})); }catch(e){} });
    jobs.push(document.fonts.ready);
  }
  function done(){
    if(wrap) wrap.classList.remove('ps-prep');
    try{ window.print(); }catch(e){}
  }
  Promise.all(jobs).then(function(){ return new Promise(function(r){ setTimeout(r,150); }); }).then(done).catch(done);
  if(wrap) setTimeout(function(){ wrap.classList.remove('ps-prep'); }, 30000);
  window.addEventListener('afterprint', function once(){ if(wrap) wrap.classList.remove('ps-prep'); window.removeEventListener('afterprint', once); });
}
function doPrint(mode){
  if(mode==='answers' && !TH.paper) return alert('还没有试卷');
  if(mode==='wrong' && !lget('ex-th-wrong',[]).length) return alert('错题本是空的');
  buildSheet(mode);
  printAfterFonts();
}

/* ---- 不作答直接看答案：不计分、不入错题本 ---- */
function renderTheoryPeek(p){
  TH.stage='result';
  $('#th-stage').innerHTML=
    '<div class="ex-scorecard pass"><div class="big">答案</div>'
    +'<div class="mid">未计分 · 答案速览</div>'
    +'<div class="sub">本次未作答直接查看，不计成绩、不记入错题本</div>'
    +'<div class="acts"><button class="btn btn-primary" id="th-back2">返回组卷</button></div></div>'
    +'<div class="ex-qs">'+p.qs.map(function(q,i){
      var h='<article class="ex-q graded ok" data-i="'+i+'">'
        +'<div class="ex-qh"><b>'+(i+1)+'</b>'
        +'<span class="ex-tag t">'+TYPE_NAME[q.type]+'</span>'
        +'<span class="ex-tag c">'+esc(CHMAP[q.ch]||q.ch)+'</span>'
        +'<span class="ex-mark">答案</span></div>'
        +'<div class="ex-stem">'+inl(q.stem)+'</div>';
      if(q.code) h+='<pre class="ex-code">'+esc(q.code)+'</pre>';
      if(q.type==='single'){
        h+='<div class="ex-opts">'+q.options.map(function(o,j){
          return '<label class="ex-opt'+(j===q.answer?' right':'')
            +'"><input type="radio" disabled><i>'+String.fromCharCode(65+j)+'．</i>'+inl(o)+'</label>';
        }).join('')+'</div>';
      }else{
        h+='<div class="ex-ansline">正确答案：<b class="ok">'+esc(ansText(q))+'</b></div>';
      }
      h+='<div class="ex-exp"><b>解析</b>'+inl(q.explanation||'')+'</div></article>';
      return h;
    }).join('')+'</div>';
  $('#th-back2').addEventListener('click',function(){ renderTheorySetup(DATA.theory); });
  window.scrollTo(0,0);
}
function renderTheoryResult(p,res,isReplay){
  TH.stage='result';
  var wrongIds=res.results.filter(function(r){return !r.ok}).map(function(r){return r.q.id});
  var grade=res.pct>=90?'优秀':res.pct>=75?'良好':res.pct>=60?'及格':'需加强';
  $('#th-stage').innerHTML=
    '<div class="ex-scorecard '+ (res.pct>=60?'pass':'fail') +'">'
    +'<div class="big">'+res.score+'<i>/'+res.total+'</i></div>'
    +'<div class="mid">'+res.pct+'% · '+grade+'</div>'
    +'<div class="sub">用时 '+Math.floor(res.secs/60)+' 分 '+(res.secs%60)+' 秒'
    +(isReplay?' · 历史卷面':'')+'</div>'
    +'<div class="acts">'
    +(wrongIds.length?'<button class="btn btn-primary" id="th-redo2">错题重做（'+wrongIds.length+'）</button>':'')
    +'<button class="btn" id="th-again">再抽一卷</button>'
    +'<button class="btn" id="th-exp-res">导出作答记录</button>'
    +'<button class="btn" id="th-offline">上传离线作答</button>'
    +'<button class="btn" id="th-back">返回组卷</button></div></div>'
    +'<div class="ex-qs">'+res.results.map(function(r,i){
      var q=r.q;
      var h='<article class="ex-q graded '+(r.ok?'ok':'bad')+'" data-i="'+i+'">'
        +'<div class="ex-qh"><b>'+(i+1)+'</b>'
        +'<span class="ex-tag t">'+TYPE_NAME[q.type]+'</span>'
        +'<span class="ex-tag c">'+esc(CHMAP[q.ch]||q.ch)+'</span>'
        +'<span class="ex-mark">'+(r.ok?'✓ 答对':'✕ 答错')+'</span></div>'
        +'<div class="ex-stem">'+inl(q.stem)+'</div>';
      if(q.code) h+='<pre class="ex-code">'+esc(q.code)+'</pre>';
      if(q.type==='single'){
        h+='<div class="ex-opts">'+q.options.map(function(o,j){
          var cls='ex-opt';
          if(j===q.answer) cls+=' right';
          if(!r.ok && j===+r.ua) cls+=' wrongpick';
          var chk=(+r.ua===j)?' checked':'';
          return '<label class="'+cls+'"><input type="radio" disabled'+chk+'><i>'
            +String.fromCharCode(65+j)+'．</i>'+inl(o)+'</label>';
        }).join('')+'</div>';
      }else{
        h+='<div class="ex-ansline">你的答案：<b class="'+(r.ok?'ok':'bad')+'">'
          +esc(r.ua===null?'（未作答）':r.ua)+'</b>'
          +(r.ok?'':'　正确答案：<b class="ok">'+esc(ansText(q))+'</b>')+'</div>';
      }
      h+='<div class="ex-exp"><b>解析</b>'+inl(q.explanation||'')+'</div></article>';
      return h;
    }).join('')+'</div>';
  $('#th-again').addEventListener('click',function(){
    genTheory(DATA.theory, TH.lastMode||null);
  });
  $('#th-back').addEventListener('click',function(){ renderTheorySetup(DATA.theory); });
  var er=$('#th-exp-res');
  if(er) er.addEventListener('click',function(){ doPrint('answers'); });
  var of=$('#th-offline');
  if(of) of.addEventListener('click',function(){
    if(!TH.rec) return alert('还没有试卷记录');
    if(!window.KBPaper) return alert('离线作答模块未加载');
    KBPaper.openAtt(TH.rec, function(){}, {estSec: estSecondsC()});
  });
  var rb=$('#th-redo2');
  rb && rb.addEventListener('click',function(){ genTheory(DATA.theory,null,wrongIds); });
  window.scrollTo(0,0);
}

/* ============================================================
   版块三：编程模拟
   ============================================================ */
var PG={qs:null};
/* ============================================================
   版块三：编程模拟（对齐 GS / XD 的组卷方式；不再内嵌运行器，
   答案下方直接附「输入 / 输出」示例）
   ============================================================ */
var PG={qs:null, chs:[], lv:0, n:5};

function pgPool(){
  var bank=DATA.prog||[];
  return bank.filter(function(q){
    return (!PG.chs.length || PG.chs.indexOf(q.ch)>=0) && (!PG.lv || +q.level===+PG.lv);
  });
}
function pgRefresh(){
  var n=pgPool().length;
  var total=TY_PROG.length;
  $('#pg-total').textContent='本次练习：'+Math.min(PG.n,n)+' 题'+(n<PG.n?'（范围内共 '+n+' 题）':'');
  var num=$('#pg-num'); if(num) num.textContent=PG.n;
}
var TY_PROG=[1,2,3];

function renderProg(bank){
  if(PG.qs){ renderProgList(PG.qs); return; }
  bank=bank||DATA.prog||[];
  var cnt={}; bank.forEach(function(q){ cnt[q.ch]=(cnt[q.ch]||0)+1; });
  $('#pg-stage').innerHTML=
    '<div class="panel">'
    +'<h2>快速套卷</h2>'
    +'<div class="preset-row" id="pg-presets">'
      +'<button class="chip" data-n="3">速练 3 题<small>约 20 分钟</small></button>'
      +'<button class="chip on" data-n="5">标准 5 题<small>覆盖多种题型</small></button>'
      +'<button class="chip" data-n="10">强化 10 题<small>综合训练</small></button>'
    +'</div>'
    +'<h2>题目数量</h2>'
    +'<div class="type-row"><div class="type-cell" style="flex:0 1 240px">'
      +'<div class="t-name">本次练习<small>题库共 '+bank.length+' 题</small></div>'
      +'<div class="stepper"><button data-d="-1" type="button">−</button><b id="pg-num">'+PG.n+'</b>'
      +'<button data-d="1" type="button">＋</button></div></div></div>'
    +'<h2>难度</h2>'
    +'<div class="chip-row" id="pg-lv-row">'
      +'<button class="chip on" data-lv="0">全部难度</button>'
      +'<button class="chip" data-lv="1">★ 基础</button>'
      +'<button class="chip" data-lv="2">★★ 中等</button>'
      +'<button class="chip" data-lv="3">★★★ 提高</button>'
    +'</div>'
    +'<h2>章节范围 <span class="muted">可多选，不选=全部</span></h2>'
    +'<div class="chip-row" id="pg-ch-row"><button class="chip'+(PG.chs.length?'':' on')+'" data-ch="">全部章节</button>'
      +CH.map(function(c,i){
        return cnt[c.id]
          ? '<button class="chip'+(PG.chs.indexOf(c.id)>=0?' on':'')+'" data-ch="'+c.id+'">'
            +(i+1)+' '+esc(c.name)+'<small>'+cnt[c.id]+' 题</small></button>'
          : '';
      }).join('')
    +'</div>'
    +'<div class="frow end"><div class="paper-total" id="pg-total"></div>'
    +'<button class="btn btn-primary" id="pg-gen">开始练习</button></div>'
    +'</div>';
  $$('#pg-presets .chip').forEach(function(b){
    b.addEventListener('click',function(){
      PG.n=+b.dataset.n;
      $$('#pg-presets .chip').forEach(function(x){ x.classList.toggle('on',x===b); });
      pgRefresh();
    });
  });
  $$('#pg-stage .stepper button').forEach(function(b){
    b.addEventListener('click',function(){
      PG.n=Math.max(1,Math.min(30,PG.n+(+b.dataset.d)));
      pgRefresh();
    });
  });
  $$('#pg-lv-row .chip').forEach(function(b){
    b.addEventListener('click',function(){
      PG.lv=+b.dataset.lv;
      $$('#pg-lv-row .chip').forEach(function(x){ x.classList.toggle('on',x===b); });
      pgRefresh();
    });
  });
  $$('#pg-ch-row .chip').forEach(function(b){
    b.addEventListener('click',function(){
      var v=b.dataset.ch;
      if(!v) PG.chs=[];
      else{
        var i=PG.chs.indexOf(v);
        if(i>=0) PG.chs.splice(i,1); else PG.chs.push(v);
      }
      $$('#pg-ch-row .chip').forEach(function(x){
        var vv=x.dataset.ch;
        x.classList.toggle('on', vv? PG.chs.indexOf(vv)>=0 : !PG.chs.length);
      });
      pgRefresh();
    });
  });
  $('#pg-gen').addEventListener('click',function(){
    var pool=pgPool();
    if(!pool.length){ alert('所选范围内没有题目'); return; }
    PG.qs=shuffle(pool.slice()).slice(0,Math.min(PG.n,pool.length));
    renderProgList(PG.qs);
  });
  pgRefresh();
}

function renderProgList(qs){
  $('#pg-stage').innerHTML=
    '<div class="ex-paperbar"><span>本组 <b>'+qs.length+'</b> 题 · 参考答案均经 GCC 实测，附输入 / 输出示例</span>'
    +'<button class="btn btn-sm" id="pg-reset">重新选题</button></div>'
    +qs.map(function(q,i){ return progCard(q,i); }).join('');
  $('#pg-reset').addEventListener('click',function(){
    PG.qs=null; renderProg(DATA.prog);
  });
  window.scrollTo(0,0);
}

function cioBlock(io){
  if(!io) return '';
  var ins=String(io.in||''), outs=String(io.out||'');
  return '<div class="cio" style="margin:10px 0 2px">'
    +'<div class="cio-body" style="border-top:0">'
    +(ins?'<div class="cio-l in">输入 <i>stdin</i></div><pre class="cio-pre">'+esc(ins)+'</pre>':'')
    +('<div class="cio-l out">输出 <i>stdout</i></div><pre class="cio-pre">'+esc(outs)+'</pre>')
    +'</div></div>';
}

function progCard(q,i){
  return '<article class="ex-pcard">'
    +'<div class="ex-qh"><b>'+(i+1)+'</b><span class="ex-title">'+esc(q.title)+'</span>'
    +'<span class="ex-tag c">'+esc(CHMAP[q.ch]||q.ch)+'</span>'
    +'<span class="ex-tag t">'+LEVEL_NAME[q.level]+'</span>'
    +'<span class="ex-tag s">'+esc(q.src||'')+'</span></div>'
    +'<div class="ex-stem">'+inl(q.stem)+'</div>'
    +(q.hint?'<details class="ex-det"><summary>💡 思路提示</summary><p>'+inl(q.hint)+'</p></details>':'')
    +'<details class="ex-det ans"><summary>📁 参考答案与讲评</summary>'
    +'<pre class="ex-code">'+esc(q.answer)+'</pre>'
    +cioBlock(q.io)
    +'<div class="ex-exp"><b>讲评</b>'+inl(q.explanation||'')+'</div></details>'
    +'</article>';
}

/* ---------- 回到顶部 ---------- */
var topBtn=$('#topbtn');
window.addEventListener('scroll',function(){
  topBtn.classList.toggle('on',window.scrollY>500);
},{passive:true});
topBtn.addEventListener('click',function(){ window.scrollTo({top:0}); });

/* ============================================================
   版块四：题库浏览（理论 + 编程，筛选与搜索，答案折叠）
   ============================================================ */

/* ============================================================
   版块四：题库浏览（chip 行筛选 + 搜索 + 分页 + 答案折叠，
   与 GS / XD 的题库总览保持一致）
   ============================================================ */
var BK={kind:'theory', ty:'', lv:0, ch:'', src:'', kw:'', pg:1, bound:false};
var BKSZ=30;

function bkData(){ return (BK.kind==='theory'?DATA.theory:DATA.prog)||[]; }
function bkText(q){
  return norm((q.title||'')+' '+(q.stem||'')+' '+(q.code||'')+' '
    +(q.options||[]).join(' ')+' '+(q.answer||'')+' '+(q.explanation||'')+' '+(q.hint||''));
}

function bkFilters(){
  var isT=BK.kind==='theory';
  var bank=bkData();
  $('#bk-filters').innerHTML=
    '<div class="chip-row" id="bk-kind-row">'
      +'<button class="chip'+(isT?' on':'')+'" data-kind="theory">理论题库</button>'
      +'<button class="chip'+(!isT?' on':'')+'" data-kind="prog">编程题库</button>'
      +'<span class="muted" id="bk-cnt" style="margin-left:auto;align-self:center"></span>'
    +'</div>'
    +'<div class="chip-row" id="bk-ty-row" style="margin-top:10px">'
    +(isT
      ? '<button class="chip'+(BK.ty?'':' on')+'" data-ty="">全部题型</button>'
        +TY.map(function(t){
            return '<button class="chip'+(BK.ty===t.id?' on':'')+'" data-ty="'+t.id+'">'
              +t.name.replace('题','')+'<small>'+bank.filter(function(q){return q.type===t.id}).length+'</small></button>';
          }).join('')
      : '<button class="chip'+(BK.lv?'':' on')+'" data-lv="0">全部难度</button>'
        +'<button class="chip'+(BK.lv===1?' on':'')+'" data-lv="1">★ 基础</button>'
        +'<button class="chip'+(BK.lv===2?' on':'')+'" data-lv="2">★★ 中等</button>'
        +'<button class="chip'+(BK.lv===3?' on':'')+'" data-lv="3">★★★ 提高</button>')
    +'</div>'
    +'<div class="chip-row" id="bk-ch-row" style="margin-top:10px">'
      +'<button class="chip'+(BK.ch?'':' on')+'" data-ch="">全部章节</button>'
      +CH.map(function(c,i){
          var n=bank.filter(function(q){ return q.ch===c.id; }).length;
          return n?'<button class="chip'+(BK.ch===c.id?' on':'')+'" data-ch="'+c.id+'">'
            +(i+1)+' '+esc(c.name)+'<small>'+n+'</small></button>':'';
        }).join('')
    +'</div>'
    +'<div class="chip-row" id="bk-src-row" style="margin-top:10px">'
      +SRC_TABS.map(function(s){
          return '<button class="chip'+(BK.src===s.id?' on':'')+'" data-src="'+s.id+'">'+s.name+'</button>';
        }).join('')
    +'</div>'
    +'<input class="bank-kw" id="bk-q" style="margin-top:12px" value="'+esc(BK.kw)+'"'
      +' placeholder="🔍 搜索题干 / 答案关键词（如：strcpy、数组越界、指针）" autocomplete="off">';

  $$('#bk-kind-row .chip').forEach(function(b){
    b.addEventListener('click',function(){
      if(BK.kind===b.dataset.kind) return;
      BK.kind=b.dataset.kind; BK.ty=''; BK.lv=0; BK.ch=''; BK.src=''; BK.kw=''; BK.pg=1;
      bkFilters(); bkRender();
    });
  });
  $$('#bk-ty-row .chip').forEach(function(b){
    b.addEventListener('click',function(){
      if(BK.kind==='theory') BK.ty=b.dataset.ty||''; else BK.lv=+b.dataset.lv||0;
      BK.pg=1; bkFilters(); bkRender();
    });
  });
  $$('#bk-ch-row .chip').forEach(function(b){
    b.addEventListener('click',function(){ BK.ch=b.dataset.ch||''; BK.pg=1; bkFilters(); bkRender(); });
  });
  $$('#bk-src-row .chip').forEach(function(b){
    b.addEventListener('click',function(){ BK.src=b.dataset.src||''; BK.pg=1; bkFilters(); bkRender(); });
  });
  var q=$('#bk-q');
  q.addEventListener('input',function(){ BK.kw=q.value; BK.pg=1; bkRender(); });
}

function bkFiltered(){
  var isT=BK.kind==='theory';
  var k=norm(BK.kw);
  return bkData().filter(function(q){
    if(isT){ if(BK.ty && q.type!==BK.ty) return false; }
    else{ if(BK.lv && +q.level!==BK.lv) return false; }
    if(BK.ch && q.ch!==BK.ch) return false;
    if(BK.src && String(q.src||'').indexOf(BK.src)<0) return false;
    if(k && bkText(q).indexOf(k)<0) return false;
    return true;
  });
}

function bkRender(){
  var arr=bkFiltered();
  var pages=Math.max(1,Math.ceil(arr.length/BKSZ));
  if(BK.pg>pages) BK.pg=pages;
  var start=(BK.pg-1)*BKSZ;
  var list=$('#bk-list');
  list.innerHTML=arr.length
    ? arr.slice(start,start+BKSZ).map(function(q,i){ return bankItem(q,start+i); }).join('')
    : '<div class="empty-tip">没有符合条件的题目 —— 放宽筛选或换个关键词试试</div>';
  var cnt=$('#bk-cnt');
  if(cnt) cnt.textContent=bkData().length?('显示 '+arr.length+' / '+bkData().length+' 题'):'';
  var pager=$('#bk-pager');
  pager.innerHTML=pages>1
    ?('<button class="chip" id="bk-prev"'+(BK.pg<=1?' disabled':'')+'>‹ 上一页</button>'
      +'<span class="pg-info">'+BK.pg+' / '+pages+'</span>'
      +'<button class="chip" id="bk-next"'+(BK.pg>=pages?' disabled':'')+'>下一页 ›</button>')
    :'';
  var p1=$('#bk-prev'), p2=$('#bk-next');
  if(p1) p1.addEventListener('click',function(){ BK.pg--; bkRender(); window.scrollTo({top:180,behavior:'smooth'}); });
  if(p2) p2.addEventListener('click',function(){ BK.pg++; bkRender(); window.scrollTo({top:180,behavior:'smooth'}); });
}

function bankItem(q,i){
  if(BK.kind==='theory'){
    var h='<article class="ex-q bk-it">'
      +'<div class="ex-qh"><b>'+('00'+(i+1)).slice(-3)+'</b>'
      +'<span class="ex-tag t">'+TYPE_NAME[q.type]+'</span>'
      +'<span class="ex-tag c">'+esc(CHMAP[q.ch]||q.ch)+'</span>'
      +'<span class="ex-tag s">'+esc(q.src||'')+'</span></div>'
      +'<div class="ex-stem">'+inl(q.stem)+'</div>'
      +(q.code?'<pre class="ex-code">'+esc(q.code)+'</pre>':'');
    if(q.type==='single'){
      h+='<div class="ex-opts">'+q.options.map(function(o,j){
        return '<label class="ex-opt"><input type="radio" disabled><i>'+String.fromCharCode(65+j)+'．</i>'+inl(o)+'</label>';
      }).join('')+'</div>';
    }
    return h+'<details class="ex-det ans"><summary>答案与解析</summary>'
      +'<div class="ex-ansline">正确答案：<b class="ok">'+esc(ansText(q))+'</b></div>'
      +'<div class="ex-exp"><b>解析</b>'+inl(q.explanation||'')+'</div></details></article>';
  }
  return '<article class="ex-q bk-it">'
    +'<div class="ex-qh"><b>'+('00'+(i+1)).slice(-3)+'</b>'
    +'<span class="ex-title">'+esc(q.title)+'</span>'
    +'<span class="ex-tag c">'+esc(CHMAP[q.ch]||q.ch)+'</span>'
    +'<span class="ex-tag t">'+LEVEL_NAME[q.level]+'</span>'
    +'<span class="ex-tag s">'+esc(q.src||'')+'</span></div>'
    +'<div class="ex-stem">'+inl(q.stem)+'</div>'
    +(q.hint?'<details class="ex-det"><summary>💡 思路提示</summary><p>'+inl(q.hint)+'</p></details>':'')
    +'<details class="ex-det ans"><summary>参考答案与讲评</summary>'
    +'<pre class="ex-code">'+esc(q.answer)+'</pre>'
    +cioBlock(q.io)
    +'<div class="ex-exp"><b>讲评</b>'+inl(q.explanation||'')+'</div></details></article>';
}

function loadBank(){
  if(!BK.bound){
    BK.bound=true;
    $('#bk-filters').innerHTML='<div class="empty-tip">正在加载题库…</div>';
  }
  loadJSON('theory', function(){ if(BK.kind==='theory'){ bkFilters(); bkRender(); } });
  loadJSON('prog',   function(){ if(BK.kind==='prog'){ bkFilters(); bkRender(); } });
}

})();
