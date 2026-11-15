/* =============================================================================
   kb-profile.js · 右上角个人信息面板
   —— 头像 / 昵称 / 使用时长 / 做题数 / 错题数 / 正确率
   —— 全部数据存 localStorage：未登录也在统计，登录同步后自动进 Gist
   —— 依赖：sync.js（若存在则共用同一套同步机制）
   ============================================================================= */
(function(){
  var S = document.currentScript || (function(){
    var ss=document.getElementsByTagName('script');
    for(var i=ss.length-1;i>=0;i--) if(/profile\.js/.test(ss[i].src)) return ss[i];
    return null;
  })();
  var SITE = (S && S.getAttribute('data-site')) || 'gs';
  var SITE_NAME = {'gs':'高数','xd':'线代','c':'C 语言'}[SITE] || SITE;
  var STAT_KEY = SITE + '_stat';          // gs_stat / xd_stat / c_stat（同步会自动带上）
  var PROF_KEY = 'kb-prof';               // 三站共用：头像/昵称
  var WRONG_KEY = {'gs':'gs_wrong','xd':'xd_wrong','c':'ex-th-wrong'}[SITE];
  var ALL_STAT = ['gs_stat','xd_stat','c_stat'];
  var ALL_WRONG = {'gs':'gs_wrong','xd':'xd_wrong','c':'ex-th-wrong'};
  var FLUSH = 60000;                      // 每 60s 落盘一次，避免频繁触发同步

  function ls(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function lsSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }
  function jget(k,d){ try{ var s=ls(k); return s?JSON.parse(s):d; }catch(e){ return d; } }

  var prof = jget(PROF_KEY, {name:'', av:'', color:'#3b82f6', emoji:'🐳'});
  var stat = jget(STAT_KEY, {t:0,n:0,ok:0,d:{}});
  if(!stat.d) stat.d = {};
  var dirty = false, btn=null, panel=null, tick=null;

  function today(){ var d=new Date(); return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
  function dget(){ var k=today(); if(!stat.d[k]) stat.d[k]={t:0,n:0,ok:0}; return stat.d[k]; }
  function pruneDays(){
    var ks=Object.keys(stat.d).sort();
    while(ks.length>120){ delete stat.d[ks.shift()]; }
  }
  function flush(){
    if(!dirty) return;
    pruneDays();
    stat.upd = Date.now();
    lsSet(STAT_KEY, JSON.stringify(stat));
    dirty=false;
  }

  /* ---------- 计时：只算可见时间 ---------- */
  function startTimer(){
    if(tick) clearInterval(tick);
    tick = setInterval(function(){
      if(document.visibilityState!=='visible') return;
      stat.t += 10; dget().t += 10; dirty = true;
    }, 10000);
    setInterval(flush, FLUSH);
    document.addEventListener('visibilitychange', function(){
      if(document.visibilityState==='hidden') flush();
    });
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
  }

  /* ---------- 对外接口：做题计数 ---------- */
  window.KBStats = {
    answer: function(ok){
      stat.n += 1; dget().n += 1;
      if(ok){ stat.ok += 1; dget().ok += 1; }
      dirty = true;
      if(btn) renderStats();
    },
    batch: function(answered, ok){
      stat.n += answered||0; dget().n += answered||0;
      stat.ok += ok||0; dget().ok += ok||0;
      dirty = true;
      if(btn) renderStats();
    },
    refresh: function(){ if(btn) renderStats(); },
    flush: flush
  };

  /* ---------- 格式化 ---------- */
  function fmtTime(sec){
    if(sec<60) return '不到 1 分钟';
    var m = Math.round(sec/60);
    if(m<60) return m+' 分钟';
    var h = Math.floor(m/60), mm = m%60;
    return mm? h+' 小时 '+mm+' 分' : h+' 小时';
  }
  function pct(ok,n){ return n? Math.round(ok/n*100)+'%' : '—'; }
  function wrongCount(site){
    var a = jget(ALL_WRONG[site], []);
    return Array.isArray(a) ? a.length : 0;
  }
  function sumAll(){
    var o={t:0,n:0,ok:0,w:0};
    ALL_STAT.forEach(function(k){
      var s=jget(k,null); if(!s) return;
      o.t += s.t||0; o.n += s.n||0; o.ok += s.ok||0;
    });
    Object.keys(ALL_WRONG).forEach(function(site){ o.w += wrongCount(site); });
    return o;
  }

  /* ---------- UI ---------- */
  function avatarHTML(size){
    var s = size+'px';
    if(prof.av) return '<img src="'+prof.av+'" alt="" style="width:'+s+';height:'+s+';border-radius:50%;object-fit:cover;display:block">';
    return '<span style="width:'+s+';height:'+s+';border-radius:50%;background:'+(prof.color||'#3b82f6')+
      ';color:#fff;display:flex;align-items:center;justify-content:center;font-size:'+Math.round(size*0.5)+
      'px;line-height:1">'+(prof.emoji||((prof.name||'?').slice(0,1))) +'</span>';
  }

  function buildStyle(){
    var st=document.createElement('style');
    st.textContent =
      '.kbp{position:relative;display:flex;align-items:center}\n'+
      '#kbp-btn{width:28px;height:28px;border-radius:50%;border:1px solid var(--line,var(--line2,#e2e2e6));\n'+
      '  background:var(--panel2,var(--panel-2,#f2f2f7));cursor:pointer;padding:0;overflow:hidden;flex:none;\n'+
      '  display:flex;align-items:center;justify-content:center}\n'+
      '#kbp-btn:hover{border-color:var(--acc,var(--ac,#3b82f6))}\n'+
      '#kbp-panel{position:absolute;right:0;top:calc(100% + 8px);width:308px;z-index:118;\n'+
      '  background:var(--panel-solid,var(--panel,#fff));color:var(--hi,var(--ink,#1c1c1e));\n'+
      '  border:1px solid var(--line,var(--line-2,#e8e8ec));border-radius:14px;\n'+
      '  box-shadow:0 18px 50px rgba(0,0,0,.18);padding:14px;display:none;\n'+
      '  font:12.5px/1.6 "PingFang SC","Microsoft YaHei",-apple-system,sans-serif}\n'+
      '#kbp-panel.on{display:block}\n'+
      '.kbp-head{display:flex;gap:11px;align-items:center}\n'+
      '.kbp-avwrap{position:relative;cursor:pointer;flex:none}\n'+
      '.kbp-avwrap:hover:after{content:"换头像";position:absolute;inset:0;border-radius:50%;background:rgba(0,0,0,.45);\n'+
      '  color:#fff;font-size:9.5px;display:flex;align-items:center;justify-content:center}\n'+
      '.kbp-name{flex:1;min-width:0}\n'+
      '.kbp-nick{width:100%;box-sizing:border-box;background:transparent;border:1px solid transparent;border-radius:7px;\n'+
      '  padding:2px 5px;margin-left:-5px;font:600 14px inherit;color:inherit}\n'+
      '.kbp-nick:hover{border-color:var(--line,var(--line-2,#e6e6ea))}\n'+
      '.kbp-nick:focus{outline:none;border-color:var(--acc,var(--ac,#3b82f6));background:var(--panel2,var(--panel-2,#f6f6f8))}\n'+
      '.kbp-sub{font-size:11px;color:var(--ink2,var(--fg-2,#8e8e93));margin-top:1px}\n'+
      '.kbp-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0 4px}\n'+
      '.kbp-cell{background:var(--panel2,var(--panel-2,#f6f6f8));border-radius:10px;padding:8px 10px}\n'+
      '.kbp-k{font-size:10.5px;color:var(--ink2,var(--fg-2,#8e8e93))}\n'+
      '.kbp-v{font:600 16px/1.3 inherit;letter-spacing:-.2px}\n'+
      '.kbp-v small{font:500 10.5px inherit;color:var(--ink3,var(--fg-3,#98989f));margin-left:3px;letter-spacing:0}\n'+
      '.kbp-today{font-size:10.5px;color:var(--ink3,var(--fg-3,#98989f));margin:6px 0 10px;line-height:1.7}\n'+
      '.kbp-foot{display:flex;gap:7px;border-top:1px dashed var(--line,var(--line-2,#e8e8ec));padding-top:10px}\n'+
      '.kbp-btn2{flex:1;border:1px solid var(--line,var(--line-2,#e2e2e6));border-radius:9px;background:var(--panel2,var(--panel-2,#f6f6f8));\n'+
      '  padding:7px 0;font:600 11.5px inherit;cursor:pointer;color:inherit}\n'+
      '.kbp-btn2:hover{border-color:var(--acc,var(--ac,#3b82f6));color:var(--acc,var(--ac,#3b82f6))}\n'+
      '.kbp-swatches{display:flex;gap:6px;margin:9px 0 0}\n'+
      '.kbp-sw{width:18px;height:18px;border-radius:50%;border:2px solid transparent;cursor:pointer}\n'+
      '.kbp-sw.on{border-color:var(--hi,var(--ink,#1c1c1e))}\n'+
      '.kbp-emojis{display:flex;gap:5px;margin-top:7px;flex-wrap:wrap}\n'+
      '.kbp-em{width:24px;height:24px;border-radius:7px;border:1px solid transparent;background:transparent;\n'+
      '  cursor:pointer;font-size:14px;line-height:1;padding:0}\n'+
      '.kbp-em:hover{border-color:var(--line,var(--line-2,#e2e2e6))}\n'+
      '.kbp-em.on{border-color:var(--acc,var(--ac,#3b82f6));background:var(--panel2,var(--panel-2,#f6f6f8))}\n'+
      '.kbp-hide{display:none}\n';
    document.head.appendChild(st);
  }

  function renderStats(){
    if(!panel) return;
    var el = panel.querySelector('#kbp-stats');
    if(!el) return;
    var td = stat.d[today()] || {t:0,n:0,ok:0};
    var all = sumAll();
    el.innerHTML =
      '<div class="kbp-grid">'+
        '<div class="kbp-cell"><div class="kbp-k">使用时长 · 本站</div><div class="kbp-v">'+fmtTime(stat.t)+'</div></div>'+
        '<div class="kbp-cell"><div class="kbp-k">做题 · 本站</div><div class="kbp-v">'+stat.n+'<small>题</small></div></div>'+
        '<div class="kbp-cell"><div class="kbp-k">错题 · 本站</div><div class="kbp-v">'+wrongCount(SITE)+'<small>道</small></div></div>'+
        '<div class="kbp-cell"><div class="kbp-k">正确率 · 本站</div><div class="kbp-v">'+pct(stat.ok,stat.n)+'</div></div>'+
      '</div>'+
      '<div class="kbp-today">今日：'+fmtTime(td.t)+' · '+(td.n||0)+' 题 · '+pct(td.ok||0,td.n||0)+
        '<br>三站合计：'+fmtTime(all.t)+' · '+all.n+' 题'+(all.w?' · 错题 '+all.w+' 道':'')+' · '+pct(all.ok,all.n)+'</div>';
  }

  function renderHead(){
    if(!panel) return;
    var u = (window.KBSync && KBSync.state && KBSync.state.user) || '';
    panel.querySelector('#kbp-avwrap').innerHTML = avatarHTML(46);
    var nick = panel.querySelector('#kbp-nick');
    if(nick && nick.value !== (prof.name||'')) nick.value = prof.name||'';
    nick && (nick.placeholder = '点这里改昵称');
    var sub = panel.querySelector('#kbp-sub');
    if(sub) sub.textContent = u ? ('@'+u+' · 已登录同步') : ('未登录 · 数据只在这台设备（'+SITE_NAME+'站）');
    if(btn) btn.innerHTML = avatarHTML(26).replace('width:26px;height:26px','width:26px;height:26px');
  }

  function buildUI(){
    buildStyle();
    var tools = document.querySelector('header .tools') || document.querySelector('.tools');
    if(!tools) return;

    var wrap=document.createElement('div');
    wrap.className='kbp';
    wrap.innerHTML='<button id="kbp-btn" type="button" title="个人中心"></button>';
    tools.appendChild(wrap);
    btn = wrap.querySelector('#kbp-btn');

    panel=document.createElement('div');
    panel.id='kbp-panel';
    panel.innerHTML =
      '<div class="kbp-head">'+
        '<div class="kbp-avwrap" id="kbp-avwrap" title="点击上传头像"></div>'+
        '<div class="kbp-name">'+
          '<input class="kbp-nick" id="kbp-nick" maxlength="16" spellcheck="false">'+
          '<div class="kbp-sub" id="kbp-sub"></div>'+
        '</div>'+
      '</div>'+
      '<div class="kbp-swatches" id="kbp-swatches"></div>'+
      '<div class="kbp-emojis" id="kbp-emojis"></div>'+
      '<div id="kbp-stats"></div>'+
      '<div class="kbp-foot">'+
        '<button class="kbp-btn2" id="kbp-sync" type="button">同步设置</button>'+
        '<button class="kbp-btn2" id="kbp-reset" type="button">重置统计</button>'+
      '</div>'+
      '<input type="file" id="kbp-file" accept="image/*" class="kbp-hide">';
    wrap.appendChild(panel);

    // 颜色
    var colors=['#3b82f6','#6366f1','#8b5cf6','#ec4899','#ef4444','#f59e0b','#10b981','#14b8a6','#64748b'];
    var sw=panel.querySelector('#kbp-swatches');
    sw.innerHTML = colors.map(function(c){
      return '<span class="kbp-sw'+(prof.color===c?' on':'')+'" data-c="'+c+'" style="background:'+c+'"></span>';
    }).join('');
    sw.addEventListener('click', function(e){
      var t=e.target.closest('.kbp-sw'); if(!t) return;
      prof.color=t.dataset.c; prof.av=''; saveProf();
      sw.querySelectorAll('.kbp-sw').forEach(function(x){ x.classList.toggle('on', x===t); });
      renderHead();
    });

    // emoji
    var emojis=['🐳','📘','🧮','🔭','🌱','⚡️','🎯','🧠','🌙'];
    var em=panel.querySelector('#kbp-emojis');
    em.innerHTML = emojis.map(function(c){
      return '<button class="kbp-em'+(prof.emoji===c?' on':'')+'" data-e="'+c+'" type="button">'+c+'</button>';
    }).join('');
    em.addEventListener('click', function(e){
      var t=e.target.closest('.kbp-em'); if(!t) return;
      prof.emoji=t.dataset.e; prof.av=''; saveProf();
      em.querySelectorAll('.kbp-em').forEach(function(x){ x.classList.toggle('on', x===t); });
      renderHead();
    });

    // 上传头像
    var file=panel.querySelector('#kbp-file');
    panel.querySelector('#kbp-avwrap').addEventListener('click', function(){ file.click(); });
    file.addEventListener('change', function(){
      var f=file.files && file.files[0]; if(!f) return;
      var fr=new FileReader();
      fr.onload=function(){
        var img=new Image();
        img.onload=function(){
          var S2=160, cv=document.createElement('canvas'); cv.width=S2; cv.height=S2;
          var ctx=cv.getContext('2d');
          var side=Math.min(img.width, img.height);
          ctx.drawImage(img, (img.width-side)/2, (img.height-side)/2, side, side, 0, 0, S2, S2);
          try{ prof.av = cv.toDataURL('image/jpeg', 0.82); }catch(e){ return; }
          saveProf(); renderHead();
        };
        img.src=fr.result;
      };
      fr.readAsDataURL(f);
      file.value='';
    });

    // 昵称
    var nick=panel.querySelector('#kbp-nick');
    nick.addEventListener('change', function(){ prof.name=nick.value.trim().slice(0,16); saveProf(); renderHead(); });
    nick.addEventListener('keydown', function(e){ if(e.key==='Enter'){ nick.blur(); } });

    // 同步设置 / 重置
    panel.querySelector('#kbp-sync').addEventListener('click', function(){
      if(window.KBSync){ closePanel(); var b=document.getElementById('kb-sync-btn'); b && b.click(); }
      else alert('同步模块未加载（sync.js 不存在或加载失败）');
    });
    panel.querySelector('#kbp-reset').addEventListener('click', function(){
      if(!confirm('重置本机的使用时长与做题统计？（云端数据会在下次同步时被覆盖）')) return;
      stat={t:0,n:0,ok:0,d:{},upd:Date.now()};
      dirty=true; flush(); renderStats();
    });

    btn.addEventListener('click', function(e){
      e.stopPropagation();
      var on=panel.classList.toggle('on');
      if(on){ renderHead(); renderStats(); }
    });
    document.addEventListener('click', function(e){
      if(!panel.classList.contains('on')) return;
      if(wrap.contains(e.target)) return;
      closePanel();
    });
    document.addEventListener('keydown', function(e){ if(e.key==='Escape') closePanel(); });

    renderHead(); renderStats();
  }

  function closePanel(){ panel && panel.classList.remove('on'); }

  function saveProf(){
    lsSet(PROF_KEY, JSON.stringify(prof));
    // 主动触发一次同步（sync.js 的 hook 已监听 localStorage.setItem）
  }

  function boot(){
    buildUI();
    startTimer();
    if(/[?&]me=1(&|$)/.test(location.search) && btn) setTimeout(function(){ btn.click(); }, 300);
    // 同步面板登录状态变化时刷新副标题
    setInterval(function(){ if(panel && panel.classList.contains('on')) renderHead(); }, 3000);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
