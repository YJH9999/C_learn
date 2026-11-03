/* ============================================================
   C 语言备考中心 · exam_app.js
   三个版块：理论复习 / 理论模拟（组卷判分）/ 编程模拟（在线运行）
   数据：assets/exam/{review_data,theory_bank,prog_bank}.json
   依赖：style.css 设计令牌 + assets/jscpp.js（JSCPP 在线运行）
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
}
var h0=(location.hash||'').replace('#','');
showView(['review','theory','prog'].indexOf(h0)>=0?h0:'review');
window.addEventListener('hashchange',function(){
  var h=(location.hash||'').replace('#','');
  if(['review','theory','prog'].indexOf(h)>=0 &&
     !$('#view-'+h).classList.contains('on')) showView(h);
});

/* ============================================================
   版块一：理论复习
   ============================================================ */
function renderReview(data){
  var nav=$('#rev-nav'), body=$('#rev-body');
  nav.innerHTML='<input class="ex-filter" id="rev-q" type="search" placeholder="筛选要点…" autocomplete="off">'
    +CH.map(function(c){
      var sec=data.filter(function(x){return x.ch===c.id})[0];
      var n=sec?sec.points.length:0;
      return '<a href="#sec-'+c.id+'" class="ex-nav" data-ch="'+c.id+'">'
        +'<span>'+esc(c.name)+'</span><b>'+(n||'')+'</b></a>';
    }).join('');
  nav.addEventListener('click',function(e){
    var a=e.target.closest('.ex-nav');
    if(!a) return;
    e.preventDefault();
    var el=document.getElementById('sec-'+a.dataset.ch);
    if(el){ el.scrollIntoView({block:'start'}); markNav(a.dataset.ch); }
  });
  body.innerHTML=data.map(function(sec){
    return '<section class="rev-ch" id="sec-'+sec.ch+'">'
      +'<h2>'+esc(sec.name)+'<span class="rev-cnt">'+sec.points.length+' 个要点</span></h2>'
      +sec.points.map(function(p,i){
        return '<article class="rev-pt"><h3><i>'+String(i+1).padStart(2,'0')+'</i>'+inl(p.t)+'</h3>'
          +(p.d?'<p>'+inl(p.d)+'</p>':'')
          +(p.code?'<pre class="ex-code">'+esc(p.code)+'</pre>':'')
          +'</article>';
      }).join('')
      +'</section>';
  }).join('')||'<div class="ex-empty">暂无数据</div>';
  /* 要点筛选 */
  var fq=$('#rev-q');
  fq.addEventListener('input',function(){
    var k=norm(fq.value);
    $$('.rev-pt',body).forEach(function(p){
      p.style.display = (!k || norm(p.textContent).indexOf(k)>=0) ? '' : 'none';
    });
    $$('.rev-ch',body).forEach(function(sec){
      var vis=$$('.rev-pt',sec).some(function(p){return p.style.display!=='none'});
      sec.style.display = vis?'':'none';
    });
  });
}
function markNav(ch){
  $$('.ex-nav').forEach(function(a){ a.classList.toggle('cur',a.dataset.ch===ch); });
}

/* ============================================================
   版块二：理论模拟
   ============================================================ */
var TH={stage:'setup', paper:null};

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
function renderTheorySetup(bank){
  TH.stage='setup';
  var last=lget('ex-th-last',null);
  var wrong=lget('ex-th-wrong',[]);
  var byType={}; bank.forEach(function(q){ byType[q.type]=(byType[q.type]||0)+1; });
  $('#th-stage').innerHTML=
    (last?'<div class="ex-banner">上次成绩：<b>'+last.score+'/'+last.total+'</b>'
      +'（'+last.pct+'%） · '+esc(last.date)
      +'　<button class="btn btn-sm" id="th-review-last">查看卷面</button></div>':'')
    +(wrong.length?'<div class="ex-banner warn">待巩固错题 <b>'+wrong.length+'</b> 道'
      +'　<button class="btn btn-sm btn-primary" id="th-redo">错题重做</button></div>':'')
    +'<div class="ex-panel"><h2><span class="no">壹</span>选择范围</h2>'
    +'<div class="ex-line"><b>章节</b>'
    +'<button class="btn btn-sm" data-sel="all">全选</button>'
    +'<button class="btn btn-sm" data-sel="none">清空</button>'
    +'<button class="btn btn-sm" data-sel="inv">反选</button>'
    +'</div>'+chChecks('th')+''
    +'<div class="ex-line"><b>题型</b>'
    +['single','judge','fill','read'].map(function(t){
        return '<label class="ex-chk"><input type="checkbox" class="th-type" value="'+t+'" checked>'
          +TYPE_NAME[t]+'<i>('+(byType[t]||0)+')</i></label>';
      }).join('')
    +'<button class="btn btn-sm" data-sel="tall" style="margin-left:auto">全选</button></div>'
    +'<div class="ex-line"><b>题量</b><input type="number" id="th-num" value="25" min="1" max="260" class="ex-num">'
    +'<button class="btn btn-sm preset" data-n="10">速测 10</button>'
    +'<button class="btn btn-sm preset" data-n="25">标准 25</button>'
    +'<button class="btn btn-sm preset" data-n="50">强化 50</button>'
    +'<button class="btn btn-sm preset" data-n="full">全真模拟</button></div>'
    +'<div class="ex-line" style="justify-content:flex-end">'
    +'<button class="btn btn-primary" id="th-gen">生成试卷</button></div>'
    +'</div>';
  /* 事件 */
  $$('#th-stage [data-sel]').forEach(function(b){
    b.addEventListener('click',function(){
      var m=b.dataset.sel;
      if(m==='tall'){ $$('.th-type').forEach(function(c){c.checked=true}); return; }
      $$('#th-stage [data-for="th"]').forEach(function(c){
        c.checked = m==='all'?true : m==='none'?false : !c.checked;
      });
    });
  });
  $$('#th-stage .preset').forEach(function(b){
    b.addEventListener('click',function(){
      var n=b.dataset.n;
      if(n==='full'){ genTheory(bank,'full'); return; }
      $('#th-num').value=n;
    });
  });
  $('#th-review-last') && $('#th-review-last').addEventListener('click',function(){
    if(TH.lastPaper) renderTheoryResult(TH.lastPaper, TH.lastResult, true);
  });
  $('#th-redo') && $('#th-redo').addEventListener('click',function(){
    genTheory(bank, null, lget('ex-th-wrong',[]));
  });
  $('#th-gen').addEventListener('click',function(){ genTheory(bank,null,null); });
}

/* ---- 抽题 ---- */
function pickQuestions(bank,chs,types,num){
  var pool=bank.filter(function(q){
    return chs.indexOf(q.ch)>=0 && types.indexOf(q.type)>=0;
  });
  if(!pool.length) return null;
  /* 按 type 配额均匀抽：先每类型按比例分配，不足则并回公共池 */
  var byType={}; types.forEach(function(t){ byType[t]=shuffle(pool.filter(function(q){return q.type===t})); });
  var per=Math.max(1,Math.floor(num/types.length));
  var picked=[];
  types.forEach(function(t){ picked=picked.concat(byType[t].slice(0,per)); });
  if(picked.length<num){
    var used={}; picked.forEach(function(q){ used[q.id]=1; });
    var rest=shuffle(pool.filter(function(q){return !used[q.id]}));
    picked=picked.concat(rest.slice(0,num-picked.length));
  }
  picked=shuffle(picked).slice(0,num);
  /* id 顺序稳定输出 */
  picked.sort(function(a,b){ return a.id<b.id?-1:1; });
  return picked;
}
function genTheory(bank, mode, fixedIds){
  /* result/other 视图下再次组卷时，先重建组卷面板（供读章节/题量） */
  if(!$('#th-stage [data-for="th"]') && !fixedIds) renderTheorySetup(bank);
  var qs;
  if(fixedIds && fixedIds.length){
    qs=bank.filter(function(q){ return fixedIds.indexOf(q.id)>=0; });
    qs=shuffle(qs);
  }else if(mode==='full'){
    /* 全真模拟：20 单选 + 5 判断 + 5 填空 + 3 阅读 */
    var chs=selChs(), pool=bank.filter(function(q){return chs.indexOf(q.ch)>=0;});
    if(!pool.length){ alert('请至少选择一个章节'); return; }
    qs=[];
    [['single',20],['judge',5],['fill',5],['read',3]].forEach(function(it){
      var t=it[0], n=it[1];
      var sub=shuffle(pool.filter(function(q){return q.type===t})).slice(0,n);
      qs=qs.concat(sub);
    });
    if(!qs.length){ alert('所选章节暂无题目'); return; }
  }else{
    var num=Math.max(1,Math.min(260,+($('#th-num').value)||25));
    var types=$$('.th-type').filter(function(c){return c.checked}).map(function(c){return c.value});
    var chs=selChs();
    if(!types.length){ alert('请至少选择一种题型'); return; }
    if(!chs.length){ alert('请至少选择一个章节'); return; }
    qs=pickQuestions(bank,chs,types,num);
    if(!qs){ alert('所选范围内暂无题目，请调整章节或题型'); return; }
  }
  TH.paper={qs:qs, t0:Date.now()};
  TH.stage='paper';
  renderTheoryPaper();
}
function selChs(){
  return $$('#th-stage [data-for="th"]').filter(function(c){return c.checked}).map(function(c){return c.value});
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
    +'<button class="btn btn-sm" id="th-abort">放弃本卷</button>'
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
  }
  var timer=setInterval(function(){
    if(TH.stage!=='paper'){ clearInterval(timer); return; }
    var s=Math.floor((Date.now()-p.t0)/1000);
    $('#th-time') && ($('#th-time').textContent=Math.floor(s/60)+':'+String(s%60).padStart(2,'0'));
  },1000);
  $('#th-abort').addEventListener('click',function(){
    if(confirm('放弃本次作答？')) renderTheorySetup(DATA.theory);
  });
  $('#th-submit').addEventListener('click',function(){
    var un=p.qs.length - (+$('#th-done').textContent);
    if(un>0 && !confirm('还有 '+un+' 题未作答，确定交卷？')) return;
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
function gradeTheory(){
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
  TH.lastPaper=p; TH.lastResult=result;
  try{localStorage.setItem('ex-th-last',JSON.stringify({
    score:score,total:total,pct:pct,
    date:new Date().toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})
  }))}catch(e){}
  /* 错题并入 localStorage（去重，保留最近 120 道） */
  var wrong=lget('ex-th-wrong',[]);
  results.forEach(function(r){
    if(!r.ok && wrong.indexOf(r.q.id)<0) wrong.push(r.q.id);
    if(r.ok){ var ix=wrong.indexOf(r.q.id); if(ix>=0) wrong.splice(ix,1); }
  });
  lstore('ex-th-wrong',wrong.slice(-120));
  renderTheoryResult(p,result,false);
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
  var rb=$('#th-redo2');
  rb && rb.addEventListener('click',function(){ genTheory(DATA.theory,null,wrongIds); });
  window.scrollTo(0,0);
}

/* ============================================================
   版块三：编程模拟
   ============================================================ */
var PG={qs:null};
function renderProg(bank){
  if(PG.qs){ renderProgList(PG.qs); return; }
  var chs={};
  bank.forEach(function(q){ chs[q.ch]=(chs[q.ch]||0)+1; });
  $('#pg-stage').innerHTML=
    '<div class="ex-panel"><h2><span class="no">壹</span>选择范围</h2>'
    +'<div class="ex-line"><b>章节</b>'
    +'<button class="btn btn-sm" id="pg-all">全选</button>'
    +'<button class="btn btn-sm" id="pg-none">清空</button></div>'
    +'<div class="ex-chgrid">'+Object.keys(chs).sort().map(function(ch){
        return '<label class="ex-chk"><input type="checkbox" class="pg-ch" value="'+ch+'" checked>'
          +esc(CHMAP[ch]||ch)+'<i>('+chs[ch]+')</i></label>';
      }).join('')+'</div>'
    +'<div class="ex-line"><b>难度</b><select id="pg-level" class="ex-num">'
    +'<option value="">全部难度</option><option value="1">★ 基础</option>'
    +'<option value="2">★★ 中等</option><option value="3">★★★ 提高</option></select>'
    +'<b style="margin-left:14px">数量</b><input type="number" id="pg-num" class="ex-num" value="5" min="1" max="54">'
    +'<button class="btn btn-sm preset" data-n="3">速练 3</button>'
    +'<button class="btn btn-sm preset" data-n="5">标准 5</button>'
    +'<button class="btn btn-sm preset" data-n="10">强化 10</button></div>'
    +'<div class="ex-line" style="justify-content:flex-end">'
    +'<button class="btn btn-primary" id="pg-gen">开始练习</button></div></div>';
  $('#pg-all').addEventListener('click',function(){ $$('.pg-ch').forEach(function(c){c.checked=true}); });
  $('#pg-none').addEventListener('click',function(){ $$('.pg-ch').forEach(function(c){c.checked=false}); });
  $$('#pg-stage .preset').forEach(function(b){
    b.addEventListener('click',function(){ $('#pg-num').value=b.dataset.n; });
  });
  $('#pg-gen').addEventListener('click',function(){
    var chs2=$$('.pg-ch').filter(function(c){return c.checked}).map(function(c){return c.value});
    if(!chs2.length){ alert('请至少选择一个章节'); return; }
    var lv=$('#pg-level').value;
    var pool=bank.filter(function(q){
      return chs2.indexOf(q.ch)>=0 && (!lv || +q.level===+lv);
    });
    if(!pool.length){ alert('所选范围内暂无题目'); return; }
    var num=Math.max(1,Math.min(pool.length,+($('#pg-num').value)||5));
    /* 优先抽可在线运行的题，不足时再补不支持的 */
    var run=shuffle(pool.filter(function(q){return q.jscpp!==false}));
    var nor=shuffle(pool.filter(function(q){return q.jscpp===false}));
    PG.qs=run.slice(0,num).concat(nor.slice(0,Math.max(0,num-run.length)));
    renderProgList(PG.qs);
  });
}
function renderProgList(qs){
  $('#pg-stage').innerHTML=
    '<div class="ex-paperbar"><span>本组 <b>'+qs.length+'</b> 题 · 在线运行由内置解释器驱动（教学级，支持 scanf 输入）</span>'
    +'<button class="btn btn-sm" id="pg-reset">重新选题</button></div>'
    +qs.map(function(q,i){ return progCard(q,i); }).join('');
  $('#pg-reset').addEventListener('click',function(){
    PG.qs=null; renderProg(DATA.prog);
  });
  /* 绑定运行与载入答案（仅可运行题有编辑器） */
  $$('#pg-stage .ex-pcard').forEach(function(card){
    var runBtn=card.querySelector('.pg-run');
    var out=card.querySelector('.pg-out');
    var ta=card.querySelector('.pg-code');
    var inp=card.querySelector('.pg-in');
    if(runBtn){
      var doRun=function(){
        var code=ta.value;
        if(!code.trim()){ out.hidden=false; out.textContent='（请先在编辑器中输入代码）'; return; }
        runCode(code, inp.value, out, runBtn);
      };
      runBtn.addEventListener('click',doRun);
      card.querySelector('.pg-load').addEventListener('click',function(){
        var ans=card.querySelector('.pg-anscode').textContent;
        ta.value=ans;
        out.hidden=false; out.textContent='已把参考答案载入编辑器，点「▶ 运行」执行。';
      });
    }
  });
  window.scrollTo(0,0);
}
function progCard(q,i){
  var runnable = q.jscpp!==false;
  var h='<article class="ex-pcard" data-i="'+i+'">'
    +'<div class="ex-qh"><b>'+(i+1)+'</b><span class="ex-title">'+esc(q.title)+'</span>'
    +'<span class="ex-tag c">'+esc(CHMAP[q.ch]||q.ch)+'</span>'
    +'<span class="ex-tag t">'+LEVEL_NAME[q.level]+'</span>'
    +'<span class="ex-tag s">'+esc(q.src||'')+'</span></div>'
    +'<div class="ex-stem">'+inl(q.stem)+'</div>'
    +(q.hint?'<details class="ex-det"><summary>💡 查看思路提示</summary><p>'+inl(q.hint)+'</p></details>':'');
  if(runnable){
    h+='<div class="pg-edlabel">我的代码（C）</div>'
      +'<textarea class="pg-code" rows="10" spellcheck="false"></textarea>'
      +'<div class="pg-edlabel">输入数据（stdin）—— 程序有 scanf 时在此填入，多行用换行分隔</div>'
      +'<textarea class="pg-in" rows="2" spellcheck="false"></textarea>'
      +'<div class="ex-line" style="padding:10px 0 0">'
      +'<button class="btn btn-primary pg-run">▶ 运行</button>'
      +'<pre class="pg-out" hidden></pre></div>';
  }else{
    h+='<div class="ex-banner warn" style="margin-top:12px">此题涉及内置解释器不支持的结构'
      +'（如 <code>%lf</code>、结构体、<code>fgets</code> 等），请把参考答案复制到本地编译器（gcc / VS）运行验证。</div>';
  }
  h+='<details class="ex-det ans"><summary>📁 参考答案与讲评</summary>'
    +'<pre class="ex-code pg-anscode">'+esc(q.answer)+'</pre>'
    +(runnable?'<div class="ex-line"><button class="btn btn-sm pg-load">载入答案到编辑器</button></div>':'')
    +'<div class="ex-exp"><b>讲评</b>'+inl(q.explanation||'')+'</div></details>'
    +'</article>';
  return h;
}

/* ============================================================
   JSCPP 在线运行（与主站一键运行同引擎）
   ============================================================ */
var LOAD_TIMEOUT=30000, RUN_TIMEOUT=15000, _runWURL=null;
function runWorkerSrc(){ return [
  "var CDNS=['assets/jscpp.js',",
  "  'https://cdn.jsdelivr.net/gh/felixhao28/JSCPP@gh-pages/dist/JSCPP.es5.min.js',",
  "  'https://fastly.jsdelivr.net/gh/felixhao28/JSCPP@gh-pages/dist/JSCPP.es5.min.js'];",
  "(function load(i){",
  "  if(i>=CDNS.length){ self.postMessage({err:-1,msg:'运行引擎加载失败，请检查网络后重试'}); return; }",
  "  try{ importScripts(CDNS[i]); }catch(e){ load(i+1); return; }",
  "  self.postMessage({type:'ready'});",
  "})(0);"
].join('\n'); }
function runCode(code,input,out,btn){
  if(btn._rw){ btn._rw.terminate(); btn._rw=null; }
  if(!_runWURL) _runWURL=URL.createObjectURL(new Blob([runWorkerSrc()],{type:'text/javascript'}));
  var w=new Worker(_runWURL); btn._rw=w;
  var done=false, buf='';
  out.hidden=false;
  out.textContent='⏳ 正在加载运行引擎…（约 600KB，仅首次需等待）';
  btn.disabled=true;
  var finish=function(t){ if(done)return; done=true; clearTimeout(timer); w.terminate();
    out.textContent=t; btn.disabled=false; };
  var timer=setTimeout(function(){ finish('⏰ 引擎加载超时，请检查网络后重试。'); },LOAD_TIMEOUT);
  var armed=false;
  function armRun(){
    if(armed)return; armed=true; clearTimeout(timer);
    timer=setTimeout(function(){ finish('⏰ 运行超过 15 秒，可能存在死循环，已终止。'); },RUN_TIMEOUT);
  }
  w.onmessage=function(msg){
    var d=msg.data||{};
    if(d&&d.type==='ready'){ armRun(); if(!buf) out.textContent='⏳ 正在运行…'; return; }
    if(d&&d.type==='stdio.write'){ buf+=d.data; return; }
    if(!done && d.err===-1 && d.id===undefined){ finish('✕ '+(d.msg||'运行引擎加载失败')); return; }
    if(d.id===undefined) return;
    armRun();
    if(d.err){ finish((buf?buf+'\n':'')+'✕ 运行出错：'+(d.msg||'未知错误')); return; }
    var t=buf||'（无输出）';
    if(d.data===0) t+='\n\n[程序正常结束，返回码 0]';
    else if(d.data!==undefined) t+='\n\n[程序结束，返回码 '+d.data+']';
    finish(t);
  };
  w.onerror=function(e){ finish((buf?buf+'\n':'')+'✕ 运行出错：'+(e.message||'未知错误')); };
  w.postMessage([1,'run',code,input,{unsigned_overflow:'warn'}]);
}

/* ---------- 回到顶部 ---------- */
var topBtn=$('#topbtn');
window.addEventListener('scroll',function(){
  topBtn.classList.toggle('on',window.scrollY>500);
},{passive:true});
topBtn.addEventListener('click',function(){ window.scrollTo({top:0}); });

})();
