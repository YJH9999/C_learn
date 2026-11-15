/* =============================================================================
   kb-paper.js · 试卷记录 + 离线作答附件（三站共用）
   -----------------------------------------------------------------------------
   · 每份组好的卷子都会存一条记录（题目 id 顺序 / 作答 / 对错 / 分数 / 时间）
   · 交卷后仍可回来「继续作答 / 查看成绩 / 重做」
   · 组卷后可选「线上做题 / 离线做题」：离线会把卷子打印出来手写，做完传回
       - 首次上传离线答案时，按考试用时的 60% 计入本站学习时长（每份卷只计一次）
       - 图片：压到长边 1400 / JPEG 0.72，随记录一起同步
       - PDF ：原件存 IndexedDB（本机）；≤700KB 时另存一份 dataURL 以便同步
   · 存储键：<前缀>papers（gs_papers / xd_papers / c_papers），由 sync.js 自动带
   ============================================================================= */
(function(){
  'use strict';
  var S = document.currentScript || (function(){
    var ss=document.getElementsByTagName('script');
    for(var i=ss.length-1;i>=0;i--) if(/kb-paper\.js/.test(ss[i].src)) return ss[i];
    return null;
  })();
  var SITE = (S && S.getAttribute('data-site')) || 'gs';
  var PREFIX = {'gs':'gs_','xd':'xd_','c':'c_'}[SITE] || (SITE+'_');
  var KEY = PREFIX + 'papers';
  var MAXN = 20;                              // 最多保留 20 份
  var MAX_BYTES = 1.2 * 1024 * 1024;          // localStorage 安全线（三站同源共用配额）
  var PDF_SYNC_MAX = 700 * 1024;              // PDF 超过这个大小只留在本机
  var CREDIT_RATIO = 0.6;                     // 离线做题：按考试用时的 60% 计入学习时长

  function ls(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function lsSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }
  function jget(k,d){ try{ var s=ls(k); return s?JSON.parse(s):d; }catch(e){ return d; } }
  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  /* ---------- 记录读写 ---------- */
  function list(){ var a=jget(KEY,[]); return Array.isArray(a)?a:[]; }
  function uid(){ return 'p'+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
  function get(id){ var a=list(); for(var i=0;i<a.length;i++) if(a[i].id===id) return a[i]; return null; }

  function trimBytes(arr){
    var s = JSON.stringify(arr);
    if(s.length <= MAX_BYTES) return arr;
    for(var i=arr.length-1; i>=0 && JSON.stringify(arr).length > MAX_BYTES; i--){
      (arr[i].att||[]).forEach(function(a){ if(a.data){ a.data=''; a.localOnly=1; } });
    }
    while(arr.length > 1 && JSON.stringify(arr).length > MAX_BYTES) arr.pop();
    return arr;
  }

  function saveAll(arr){
    arr.sort(function(a,b){ return (b.upd||b.ts||0) - (a.upd||a.ts||0); });
    while(arr.length > MAXN) arr.pop();
    trimBytes(arr);
    try{ lsSet(KEY, JSON.stringify(arr)); }catch(e){
      // 配额爆了：把附件数据全去掉再试一次
      arr.forEach(function(r){ (r.att||[]).forEach(function(a){ if(a.data){ a.data=''; a.localOnly=1; } }); });
      try{ lsSet(KEY, JSON.stringify(arr)); }catch(e2){}
    }
  }

  function put(rec){
    if(!rec || !rec.id) return null;
    var arr = list(), hit = -1;
    for(var i=0;i<arr.length;i++) if(arr[i].id===rec.id){ hit=i; break; }
    rec.upd = Date.now();
    if(hit>=0) arr[hit] = rec; else arr.unshift(rec);
    saveAll(arr);
    return rec;
  }
  function del(id){
    var arr = list().filter(function(r){ return r.id!==id; });
    saveAll(arr);
    idbDelPrefix(id+'#');
  }

  /* ---------- IndexedDB：PDF 原件 ---------- */
  var DB = null, DB_NAME = 'kb-offline', STORE = 'f';
  function once(cb){
    var hit = false;
    var fn = function(v){ if(hit) return; hit = true; clearTimeout(fn._t); cb(v); };
    fn._t = setTimeout(function(){ fn(null); }, 2500);   // IDB 被禁用/挂起时不阻塞流程
    return fn;
  }
  function idb(cb){
    if(DB) return cb(DB);
    if(!window.indexedDB) return cb(null);
    var done = once(cb);
    var req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = function(){
      var db=req.result; if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = function(){ DB=req.result; done(DB); };
    req.onerror = function(){ done(null); };
  }
  function idbPut(k, blob, cb){
    var fin = cb ? once(cb) : function(){};
    idb(function(db){
      if(!db) return fin();
      try{
        var tx=db.transaction(STORE,'readwrite');
        tx.objectStore(STORE).put(blob,k);
        tx.oncomplete=function(){ fin(); };
        tx.onerror=function(){ fin(); };
        tx.onabort=function(){ fin(); };
      }catch(e){ fin(); }
    });
  }
  function idbGet(k, cb){
    var fin = once(cb);
    idb(function(db){
      if(!db) return fin(null);
      try{
        var tx=db.transaction(STORE,'readonly'), rq=tx.objectStore(STORE).get(k);
        rq.onsuccess=function(){ fin(rq.result||null); };
        rq.onerror=function(){ fin(null); };
      }catch(e){ fin(null); }
    });
  }
  function idbDelPrefix(p){
    idb(function(db){
      if(!db) return;
      try{
        var tx=db.transaction(STORE,'readwrite'), st=tx.objectStore(STORE);
        var rq=st.openKeyCursor();
        rq.onsuccess=function(){
          var c=rq.result; if(!c) return;
          if(String(c.key).indexOf(p)===0) st.delete(c.key);
          c.continue();
        };
      }catch(e){}
    });
  }

  /* ---------- 图片压缩 ---------- */
  function compress(file, cb){
    var fr = new FileReader();
    fr.onload = function(){
      var img = new Image();
      img.onload = function(){
        var max = 1400;
        var w = img.width, h = img.height;
        if(w>max || h>max){ var k=Math.min(max/w, max/h); w=Math.round(w*k); h=Math.round(h*k); }
        var cv = document.createElement('canvas'); cv.width=w; cv.height=h;
        cv.getContext('2d').drawImage(img,0,0,w,h);
        var q = 0.72, url = '';
        try{ url = cv.toDataURL('image/jpeg', q); }catch(e){ return cb(''); }
        while(url.length > 420*1024 && q > 0.42){
          q -= 0.1;
          try{ url = cv.toDataURL('image/jpeg', q); }catch(e){ break; }
        }
        cb(url, w, h);
      };
      img.onerror = function(){ cb(''); };
      img.src = fr.result;
    };
    fr.onerror = function(){ cb(''); };
    fr.readAsDataURL(file);
  }

  /* ---------- 离线做题：把考试时长折算进学习统计 ---------- */
  function credit(rec){
    if(!rec || !rec.estSec || rec.credited) return 0;
    var sec = Math.round(rec.estSec * CREDIT_RATIO);
    if(sec <= 0) return 0;
    rec.credited = sec;
    rec.creditAt = Date.now();
    if(window.KBStats && window.KBStats.addTime) window.KBStats.addTime(sec);
    return sec;
  }

  /* ---------- 附件：上传 / 查看 / 删除 ---------- */
  function addFiles(id, files, cb){
    var rec = get(id);
    if(!rec) return cb && cb('记录不存在');
    rec.att = rec.att || [];
    var before = rec.att.length;
    var arr = [].slice.call(files||[]), i = 0, errs = [];
    (function next(){
      if(i >= arr.length){
        var got = rec.att.length > before ? credit(rec) : 0;
        put(rec);
        return cb && cb(errs.length?errs.join('\n'):'', got);
      }
      var f = arr[i++];
      if(/^image\//.test(f.type)){
        compress(f, function(url){
          if(!url){ errs.push(f.name+'：图片读取失败'); return next(); }
          rec.att.push({kind:'img', name:f.name, size:url.length, data:url, ts:Date.now()});
          next();
        });
      }else if(/pdf/i.test(f.type) || /\.pdf$/i.test(f.name)){
        var fr = new FileReader();
        fr.onload = function(){
          var data = String(fr.result);          // data:application/pdf;base64,…
          var idx = rec.att.length;
          var keep = f.size <= PDF_SYNC_MAX;     // 小文件连内容一起同步
          var a = {kind:'pdf', name:f.name, size:f.size, data: keep?data:'', local:1,
                   key:id+'#'+idx, ts:Date.now()};
          rec.att.push(a);
          var blob = dataURLtoBlob(data);
          if(blob){
            idbPut(a.key, blob, function(){ next(); });
          }else{
            if(!keep){ a.localOnly = 1; }
            next();
          }
        };
        fr.onerror = function(){ errs.push(f.name+'：PDF 读取失败'); next(); };
        fr.readAsDataURL(f);
      }else{
        errs.push(f.name+'：只支持图片或 PDF');
        next();
      }
    })();
  }

  function openBlob(blob){
    if(!blob) return alert('文件不在本机了（可能换过浏览器或清理过缓存）');
    var url = URL.createObjectURL(blob);
    var w = window.open(url, '_blank');
    if(!w) alert('新窗口被拦截了，请允许弹出窗口后再试');
    setTimeout(function(){ URL.revokeObjectURL(url); }, 60000);
  }
  function dataURLtoBlob(d){
    try{
      var p = d.split(','), mime = (p[0].match(/:(.*?);/)||[])[1] || 'application/octet-stream';
      var bin = atob(p[1]), n = bin.length, u8 = new Uint8Array(n);
      for(var i=0;i<n;i++) u8[i] = bin.charCodeAt(i);
      return new Blob([u8], {type:mime});
    }catch(e){ return null; }
  }
  function view(rec, idx){
    var a = rec.att && rec.att[idx];
    if(!a) return;
    if(a.kind==='img'){ if(a.data) openBlob(dataURLtoBlob(a.data)); else alert('这张图不在本机了'); return; }
    if(a.data){ openBlob(dataURLtoBlob(a.data)); return; }
    idbGet(a.key || (rec.id+'#'+idx), function(b){ openBlob(b); });
  }
  function delAtt(rec, idx){
    if(!rec.att) return;
    var a = rec.att[idx];
    if(a && a.key) idbDelPrefix(a.key);
    rec.att.splice(idx,1);
    put(rec);
  }

  /* ---------- 样式 ---------- */
  function style(){
    if(document.getElementById('kbp2-style')) return;
    var st = document.createElement('style');
    st.id = 'kbp2-style';
    st.textContent =
      '.kbp2{display:flex;flex-direction:column;gap:9px}\n'+
      '.kbp2-empty{font-size:12.5px;color:var(--ink3,var(--fg-3,#98989f));margin:2px 0 6px}\n'+
      '.kbp2-item{border:1px solid var(--line,var(--line-2,#e8e8ec));border-radius:12px;padding:10px 13px;\n'+
      '  background:var(--panel2,var(--panel-2,#f8f8fa));transition:.15s}\n'+
      '.kbp2-item:hover{border-color:var(--acc,var(--ac,#3b82f6))}\n'+
      '.kbp2-h{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}\n'+
      '.kbp2-h b{font:600 13px/1.5 inherit;color:var(--hi,var(--ink,#1c1c1e))}\n'+
      '.kbp2-h time{font-size:11px;color:var(--ink3,var(--fg-3,#98989f));margin-left:auto}\n'+
      '.kbp2-m{font-size:11.5px;color:var(--ink2,var(--fg-2,#6e6e73));margin:3px 0 7px;line-height:1.6}\n'+
      '.kbp2-m em{font-style:normal;color:var(--acc,var(--ac,#3b82f6));font-weight:600}\n'+
      '.kbp2-a{display:flex;gap:6px;flex-wrap:wrap}\n'+
      '.kbp2-a button{border:1px solid var(--line,var(--line-2,#e2e2e6));background:var(--panel-solid,var(--panel,#fff));\n'+
      '  color:var(--ink2,var(--fg-2,#6e6e73));border-radius:8px;padding:5px 10px;font:600 11.5px inherit;cursor:pointer}\n'+
      '.kbp2-a button:hover{border-color:var(--acc,var(--ac,#3b82f6));color:var(--acc,var(--ac,#3b82f6))}\n'+
      '.kbp2-a button.pri{background:var(--acc,var(--ac,#3b82f6));border-color:var(--acc,var(--ac,#3b82f6));color:#fff}\n'+
      '.kbp2-a button.pri:hover{color:#fff;filter:brightness(1.06)}\n'+
      '.kbp2-a button.dan:hover{border-color:#eb4d3d;color:#eb4d3d}\n'+
      '.kbp2-tag{display:inline-block;font-size:10.5px;padding:0 6px;border-radius:5px;\n'+
      '  background:var(--acc-soft,rgba(59,130,246,.12));color:var(--acc,var(--ac,#3b82f6));margin-left:5px;line-height:1.7}\n'+
      /* 附件弹窗 */
      '#kbp2-mask{position:fixed;inset:0;background:rgba(0,0,0,.36);z-index:140;display:none}\n'+
      '#kbp2-mask.on{display:block}\n'+
      '#kbp2-card{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:141;width:430px;max-width:93vw;\n'+
      '  max-height:86vh;overflow-y:auto;background:var(--panel-solid,var(--panel,#fff));color:var(--hi,var(--ink,#1c1c1e));\n'+
      '  border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,.3);padding:18px;display:none;\n'+
      '  font:13px/1.6 "PingFang SC","Microsoft YaHei",-apple-system,sans-serif}\n'+
      '#kbp2-card.on{display:block}\n'+
      '#kbp2-card h4{margin:0 0 3px;font:700 15px/1.4 inherit}\n'+
      '.kbp2-sub{font-size:11.5px;color:var(--ink2,var(--fg-2,#6e6e73));margin:0 0 12px;line-height:1.65}\n'+
      '.kbp2-list{display:flex;flex-direction:column;gap:8px;margin-bottom:11px}\n'+
      '.kbp2-row{display:flex;align-items:center;gap:9px;border:1px solid var(--line,var(--line-2,#e8e8ec));\n'+
      '  border-radius:10px;padding:7px 9px;background:var(--panel2,var(--panel-2,#f8f8fa))}\n'+
      '.kbp2-row img{width:44px;height:44px;object-fit:cover;border-radius:7px;flex:none;cursor:pointer;border:0;background:#ddd}\n'+
      '.kbp2-ic{width:44px;height:44px;border-radius:7px;flex:none;display:grid;place-items:center;\n'+
      '  background:var(--acc-soft,rgba(239,68,68,.12));color:#e0453a;font:700 10.5px/1 inherit}\n'+
      '.kbp2-fi{flex:1;min-width:0}\n'+
      '.kbp2-fi b{display:block;font:600 12px/1.4 inherit;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n'+
      '.kbp2-fi span{font-size:10.5px;color:var(--ink3,var(--fg-3,#98989f))}\n'+
      '.kbp2-x{border:0;background:transparent;color:var(--ink3,var(--fg-3,#98989f));cursor:pointer;font-size:15px;padding:2px 4px}\n'+
      '.kbp2-x:hover{color:#eb4d3d}\n'+
      '.kbp2-up{display:flex;gap:8px;margin-top:4px}\n'+
      '.kbp2-up button{flex:1;border:1px dashed var(--line,var(--line-2,#d8d8dd));border-radius:10px;\n'+
      '  background:transparent;color:var(--ink2,var(--fg-2,#6e6e73));padding:9px 0;font:600 12px inherit;cursor:pointer}\n'+
      '.kbp2-up button:hover{border-color:var(--acc,var(--ac,#3b82f6));color:var(--acc,var(--ac,#3b82f6))}\n'+
      '.kbp2-note{font-size:10.5px;color:var(--ink3,var(--fg-3,#98989f));line-height:1.7;margin:9px 0 0;\n'+
      '  border-top:1px dashed var(--line,var(--line-2,#e8e8ec));padding-top:8px}\n'+
      '.kbp2-close{width:100%;margin-top:11px;border:1px solid var(--line,var(--line-2,#e2e2e6));border-radius:10px;\n'+
      '  background:var(--panel2,var(--panel-2,#f6f6f8));color:inherit;padding:9px 0;font:600 12.5px inherit;cursor:pointer}\n'+
      /* 作答方式选择 */
      '.kbm-opt{border:1px solid var(--line,var(--line-2,#e8e8ec));border-radius:12px;padding:11px 13px;\n'+
      '  margin:0 0 9px;cursor:pointer;background:var(--panel2,var(--panel-2,#f8f8fa));transition:.15s}\n'+
      '.kbm-opt:hover,.kbm-opt:focus-visible{border-color:var(--acc,var(--ac,#3b82f6));\n'+
      '  background:var(--acc-soft,rgba(59,130,246,.08));outline:none}\n'+
      '.kbm-opt b{display:block;font:700 13.5px/1.5 inherit;margin-bottom:3px}\n'+
      '.kbm-opt span{font-size:11.5px;color:var(--ink2,var(--fg-2,#6e6e73));line-height:1.65}\n'+
      '.kbm-print{display:flex;align-items:center;gap:10px;margin:0 0 11px}\n'+
      '.kbm-print button{flex:1;border:1px solid var(--acc,var(--ac,#3b82f6));border-radius:10px;\n'+
      '  background:var(--acc,var(--ac,#3b82f6));color:#fff;padding:9px 0;font:600 12.5px inherit;cursor:pointer}\n'+
      '.kbm-print button:hover{filter:brightness(1.06)}\n'+
      '.kbm-print span{font-size:10.5px;color:var(--ink3,var(--fg-3,#98989f));flex:none;max-width:96px;line-height:1.5}\n'+
      '.kbm-steps{display:flex;gap:6px;margin:0 0 12px;font-size:10.5px;color:var(--ink3,var(--fg-3,#98989f))}\n'+
      '.kbm-steps i{font-style:normal;flex:1;border:1px solid var(--line,var(--line-2,#e8e8ec));\n'+
      '  border-radius:8px;padding:6px 4px;text-align:center;background:var(--panel2,var(--panel-2,#f8f8fa))}\n'+
      '.kbp2-credit{margin:10px 0 0;padding:7px 10px;border-radius:9px;line-height:1.6;\n'+
      '  background:var(--acc-soft,rgba(59,130,246,.12));color:var(--acc,var(--ac,#3b82f6));\n'+
      '  font-size:11.5px;font-weight:600}\n'+
      '.kbp2-tag.off{background:rgba(240,168,32,.16);color:#b8770a}\n'+
      '#kbp2-toast{position:fixed;left:50%;bottom:38px;transform:translate(-50%,14px);z-index:150;\n'+
      '  background:rgba(22,22,26,.93);color:#fff;padding:9px 16px;border-radius:10px;max-width:86vw;\n'+
      '  text-align:center;opacity:0;pointer-events:none;transition:.25s;\n'+
      '  font:600 12.5px/1.55 "PingFang SC","Microsoft YaHei",-apple-system,sans-serif;\n'+
      '  box-shadow:0 10px 30px rgba(0,0,0,.25)}\n'+
      '#kbp2-toast.on{opacity:1;transform:translate(-50%,0)}\n'+
      '@media print{#kbp2-mask,#kbp2-card,#kbp2-toast{display:none!important}}\n';
    document.head.appendChild(st);
  }

  /* ---------- 历史卷列表 ---------- */
  function when(ts){
    if(!ts) return '';
    var d = new Date(ts), n = new Date();
    var sameDay = d.toDateString() === n.toDateString();
    var hm = ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2);
    if(sameDay) return '今天 '+hm;
    return (d.getMonth()+1)+'/'+d.getDate()+' '+hm;
  }
  function fmtSize(n){
    if(!n) return '';
    return n>1024*1024 ? (n/1048576).toFixed(1)+'MB' : Math.round(n/1024)+'KB';
  }

  function render(host, opts){
    if(!host) return;
    opts = opts || {};
    style();
    var arr = list();
    if(!arr.length){
      host.innerHTML = '<p class="kbp2-empty">还没有试卷记录——组一份卷子，答完（或中途退出）都会自动存在这里。</p>';
      return;
    }
    host.innerHTML = '<div class="kbp2">' + arr.map(function(r){
      var n = (r.qs||[]).length;
      var attN = (r.att||[]).length;
      var doneN = Object.keys(r.ans||{}).length;
      var tail = r.done
        ? ('得分 <em>'+r.score+'</em> / '+(r.total||'—'))
        : (r.mode==='offline' ? '线下作答' : ('已答 <em>'+doneN+'</em> / '+n));
      return '<div class="kbp2-item" data-id="'+r.id+'">'+
        '<div class="kbp2-h"><b>'+esc(r.title||'模拟试卷')+'</b>'+
          (r.mode==='offline'
            ? '<span class="kbp2-tag off">离线</span>'
            : (r.done?'<span class="kbp2-tag">已交卷</span>':'<span class="kbp2-tag">进行中</span>'))+
          (attN?'<span class="kbp2-tag">作答 '+attN+'</span>':'')+
          '<time>'+when(r.upd||r.ts)+'</time></div>'+
        '<div class="kbp2-m">'+n+' 题 · 满分 '+(r.total||'—')+' 分 · '+tail+
          (r.secs?' · 用时 '+Math.floor(r.secs/60)+' 分':'')+
          (r.credited?' · 已计入 '+(Math.round(r.credited/60))+' 分钟学习时长':'')+'</div>'+
        '<div class="kbp2-a">'+
          '<button data-act="open" class="pri">'+(r.done?'查看卷面':'继续作答')+'</button>'+
          (r.done?'<button data-act="redo">重做</button>':'')+
          '<button data-act="att">离线答案'+(attN?'（'+attN+'）':'')+'</button>'+
          '<button data-act="del" class="dan">删除</button>'+
        '</div></div>';
    }).join('') + '</div>';

    host.onclick = function(e){
      var b = e.target.closest('[data-act]');
      if(!b) return;
      var item = b.closest('.kbp2-item');
      var rec = item && get(item.dataset.id);
      if(!rec) return;
      var act = b.dataset.act;
      if(act==='del'){
        if(!confirm('删除这条试卷记录？（含离线答案附件）')) return;
        del(rec.id); render(host, opts);
      }else if(act==='att'){
        openAtt(rec, function(){ render(host, opts); }, opts.attOpts ? opts.attOpts(rec) : {});
      }else if(opts.onOpen){
        opts.onOpen(rec, act);
      }
    };
  }

  /* ---------- 弹窗骨架 / 轻提示 ---------- */
  var cur = null, curReload = null, curOpts = {}, maskClick = null;
  function ensureCard(){
    style();
    var mask = document.getElementById('kbp2-mask');
    if(!mask){
      mask = document.createElement('div'); mask.id='kbp2-mask';
      mask.onclick = function(){ if(maskClick) maskClick(); };
      document.body.appendChild(mask);
      var card = document.createElement('div'); card.id='kbp2-card';
      card.onclick = function(e){ e.stopPropagation(); };
      document.body.appendChild(card);
      var tt = document.createElement('div'); tt.id='kbp2-toast';
      document.body.appendChild(tt);
      document.addEventListener('keydown', function(e){
        if(e.key==='Escape' && maskClick) maskClick();
      });
    }
    return document.getElementById('kbp2-card');
  }
  function showCard(){
    if(window.KBSync && window.KBSync.close) window.KBSync.close();   // 别让同步弹窗压在后面
    var c = ensureCard();
    document.getElementById('kbp2-mask').classList.add('on');
    c.classList.add('on');
    return c;
  }
  function closeAtt(){
    var m=document.getElementById('kbp2-mask'), c=document.getElementById('kbp2-card');
    if(m) m.classList.remove('on');
    if(c) c.classList.remove('on');
    maskClick = null;
  }
  function toast(msg){
    style();
    var t = document.getElementById('kbp2-toast');
    if(!t){ t=document.createElement('div'); t.id='kbp2-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toast._t);
    toast._t = setTimeout(function(){ t.classList.remove('on'); }, 4200);
  }

  /* ---------- 组卷后：线上 / 离线 作答方式 ---------- */
  function chooseMode(opts){
    opts = opts || {};
    curOpts = opts;
    var est = Math.round((opts.estSec||0)/60);
    var will = Math.round((opts.estSec||0)*CREDIT_RATIO/60);
    var card = showCard();
    maskClick = cancel;
    card.innerHTML =
      '<h4>这份卷子怎么答？</h4>'+
      '<p class="kbp2-sub">'+(opts.n?('共 '+opts.n+' 题'):'')+
        (opts.total?(' · 满分 '+opts.total+' 分'):'')+
        (est?(' · 预计考试用时约 '+est+' 分钟'):'')+'</p>'+
      '<div class="kbm-opt" data-m="online" tabindex="0" role="button">'+
        '<b>线上做题</b><span>在页面上直接作答，逐题即时判分、用时自动记录；中途关掉也能从历史试卷接着做。</span></div>'+
      '<div class="kbm-opt" data-m="offline" tabindex="0" role="button">'+
        '<b>离线做题</b><span>打印空白卷手写作答，做完拍照或导入 PDF 交回'+
        (will?('；上传后按考试用时的 60%（约 '+will+' 分钟）计入本站学习时长'):'')+'。</span></div>'+
      '<button class="kbp2-close" id="kbm-cancel" type="button">取消</button>';

    card.querySelectorAll('.kbm-opt').forEach(function(el){
      el.onclick = function(){
        if(el.dataset.m==='online'){
          closeAtt();
          if(opts.rec){ opts.rec.mode='online'; if(opts.estSec) opts.rec.estSec=opts.estSec; put(opts.rec); }
          if(opts.onOnline) opts.onOnline();
        }else{
          startOffline();
        }
      };
      el.onkeydown = function(e){ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); el.click(); } };
    });
    card.querySelector('#kbm-cancel').onclick = cancel;

    function cancel(){
      closeAtt();
      if(opts.rec && !Object.keys(opts.rec.ans||{}).length && !(opts.rec.att||[]).length){
        del(opts.rec.id);
      }
      if(opts.onCancel) opts.onCancel();
    }
  }
  function startOffline(){
    var o = curOpts || {};
    var rec = o.rec;
    if(rec){
      rec.mode = 'offline';
      if(o.estSec) rec.estSec = o.estSec;
      put(rec);
      cur = rec;
    }
    curReload = function(){ if(o.onReload) o.onReload(); else if(o.onOffline) o.onOffline(); };
    showCard();
    maskClick = closeAtt;
    paintAtt();
    if(o.onOffline) o.onOffline();     // 让站点回到组卷页并把这条记录画出来
  }

  /* ---------- 离线答案弹窗 ---------- */
  function openAtt(rec, reload, opts){
    cur = rec; curReload = reload; curOpts = opts || {};
    if(curOpts.estSec && !rec.estSec) rec.estSec = curOpts.estSec;
    showCard();
    maskClick = closeAtt;
    paintAtt();
  }
  function attRow(a, i){
    return '<div class="kbp2-row">'+
      (a.kind==='img' && a.data
        ? '<img src="'+a.data+'" data-open="'+i+'" alt="">'
        : '<div class="kbp2-ic">PDF</div>')+
      '<div class="kbp2-fi"><b>'+esc(a.name||(a.kind==='img'?'作答照片':'作答文件'))+'</b>'+
        '<span>'+fmtSize(a.size)+(a.kind==='pdf'&&!a.data?' · 仅本机':' · 已同步')+'</span></div>'+
      '<button class="kbp2-x" data-view="'+i+'" title="打开">↗</button>'+
      '<button class="kbp2-x" data-del="'+i+'" title="删除">×</button>'+
    '</div>';
  }
  function paintAtt(){
    var card = document.getElementById('kbp2-card');
    if(!card || !cur) return;
    var att = cur.att || [];
    var offline = cur.mode === 'offline';
    var willMin = Math.round((cur.estSec||0)*CREDIT_RATIO/60);
    card.innerHTML =
      '<h4>'+(offline?'离线做题':'离线作答')+' · '+esc(cur.title||'模拟试卷')+'</h4>'+
      '<p class="kbp2-sub">'+(offline
        ? '打印空白卷手写作答，做完拍照或导入 PDF 交回。'+(willMin?('首次上传后按考试用时的 60%（约 '+willMin+' 分钟）计入本站学习时长。'):'')
        : '把这份卷子的作答拍照或导出 PDF 传到这里，作为离线作答记录。')+'</p>'+
      (offline && curOpts.printBlank
        ? '<div class="kbm-print"><button id="kbp2-print" type="button">🖨 打印空白卷</button><span>A4 单面</span></div>'
        : '')+
      '<div class="kbp2-list">'+
        (att.length ? att.map(attRow).join('')
          : '<p class="kbp2-empty" style="margin:0">还没有上传作答，下面传一张就行。</p>')+
      '</div>'+
      (cur.credited
        ? '<p class="kbp2-credit">✓ 已按考试用时的 60% 计入学习时长 · '+Math.round(cur.credited/60)+' 分钟</p>'
        : '')+
      '<div class="kbp2-up">'+
        '<button id="kbp2-pickimg" type="button">＋ 上传作答照片</button>'+
        '<button id="kbp2-pickpdf" type="button">＋ 导入 PDF</button>'+
      '</div>'+
      '<p class="kbp2-note">支持多选。照片自动压到长边 1400px 便于同步；单个 PDF 超过 700KB 时原件只存本机（建议先压缩）。</p>'+
      '<button class="kbp2-close" id="kbp2-done" type="button">完成</button>'+
      '<input type="file" id="kbp2-fimg" accept="image/*" multiple hidden>'+
      '<input type="file" id="kbp2-fpdf" accept="application/pdf,.pdf" multiple hidden>';

    var pr = card.querySelector('#kbp2-print');
    if(pr) pr.onclick = function(){ if(curOpts.printBlank) curOpts.printBlank(); };
    card.querySelector('#kbp2-done').onclick = closeAtt;
    card.querySelector('#kbp2-pickimg').onclick = function(){ card.querySelector('#kbp2-fimg').click(); };
    card.querySelector('#kbp2-pickpdf').onclick = function(){ card.querySelector('#kbp2-fpdf').click(); };
    ['#kbp2-fimg','#kbp2-fpdf'].forEach(function(sel){
      var inp = card.querySelector(sel);
      inp.onchange = function(){
        if(!inp.files || !inp.files.length) return;
        var files = inp.files;
        card.querySelector('.kbp2-sub').textContent = '正在处理，请稍候…';
        addFiles(cur.id, files, function(err, credited){
          cur = get(cur.id) || cur;
          paintAtt();
          if(curReload) curReload();
          if(credited) toast('已计入学习时长 '+Math.round(credited/60)+' 分钟（考试用时的 60%）');
          if(err) alert(err);
          if(window.KBStats) window.KBStats.refresh();
        });
        inp.value = '';
      };
    });
    card.querySelectorAll('[data-view]').forEach(function(b){
      b.onclick = function(){ view(cur, +b.dataset.view); };
    });
    card.querySelectorAll('[data-del]').forEach(function(b){
      b.onclick = function(){
        if(!confirm('删除这个附件？')) return;
        delAtt(cur, +b.dataset.del);
        cur = get(cur.id) || cur;
        paintAtt();
        if(curReload) curReload();
      };
    });
    card.querySelectorAll('[data-open]').forEach(function(el){
      el.onclick = function(){ view(cur, +el.dataset.open); };
    });
  }

  window.KBPaper = {
    site: SITE,
    key: KEY,
    list: list,
    get: get,
    put: put,
    del: del,
    uid: uid,
    render: render,
    addFiles: addFiles,
    openAtt: openAtt,
    chooseMode: chooseMode,
    toast: toast,
    credit: credit,
    size: function(){ return (ls(KEY)||'').length; }
  };
})();
