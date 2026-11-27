/* 信息提示工具
   流程：先挑一张提示卡 → （需要角色时）用「角色」按钮挑角色 → 全屏大字递给玩家。
   角色可以从顶部按钮预先选好，所有提示卡共用同一个角色，切角色时展示页当场跟着变。 */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };

  /* ---------- 提示卡 ---------- */
  var PHRASES = [
    { id: 'you-are', label: '你是', slot: 'role', tpl: '你是 <b>__</b>' },
    { id: 'this-is', label: '这名玩家是', slot: 'role', tpl: '这名玩家是 <b>__</b>' },
    { id: 'affect', label: '该角色的技能作用于你', slot: 'role', tpl: '<b>__</b> 的技能作用于你' },
    { id: 'absent', label: '这些角色不在场', slot: 'roles', tpl: '这些角色不在场：<b>__</b>' },
    { id: 'nominate', label: '你昨天提名了吗' },
    { id: 'vote', label: '你昨天投票了吗' },
    { id: 'choose', label: '做出你的选择' },
    { id: 'ability', label: '你要使用你的能力吗' },
    { id: 'demon', label: '他是恶魔' },
    { id: 'minions', label: '他们是你的爪牙' }
  ];

  var TEAM_NAME = {
    townsfolk: '镇民', outsider: '外来者', minion: '爪牙', demon: '恶魔',
    traveler: '旅行者', fabled: '传奇'
  };
  var TEAM_ORDER = { townsfolk: 0, outsider: 1, minion: 2, demon: 3, traveler: 4, fabled: 5 };

  var roles = [];        // 全部角色
  var pool = [];         // 按当前剧本筛过的角色
  var pickedRoles = [];  // 顶栏选中的角色（单选用 1 个，多选用多个）
  var activePhrase = null;
  var pickerMode = 'single';   // single | multi
  var pickerIntent = 'chip';   // chip（只设角色）| phrase（选完直接展示）| change（展示页换角色）

  /* 从魔典带过来的剧本信息 */
  var query = new URLSearchParams(location.search);
  var onlyEdition = (query.get('edition') || '').toLowerCase();
  var onlyRoles = (query.get('roles') || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
  var scriptName = query.get('name') || '';
  var embedded = (function () { try { return window.self !== window.top; } catch (e) { return true; } })();

  /* ---------- 数据 ---------- */
  function loadRoles() {
    return fetch('/ct-role-data.json', { cache: 'force-cache' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var list = (d && d.data && d.data.role) || [];
        roles = list
          .filter(function (r) { return r && r.name && r.team !== 'fabled'; })
          .map(function (r) {
            return {
              id: r.id,
              name: r.name,
              team: r.team || '',
              edition: r.edition || '',
              ability: r.ability || '',
              image: String(r.image || '').replace(/^\/oss\//, '/gs/oss/')
            };
          })
          .sort(function (a, b) { return a.name.localeCompare(b.name, 'zh'); });
        buildPool();
      })
      .catch(function () { roles = []; pool = []; });
  }

  function buildPool() {
    if (onlyRoles.length) {
      var byId = {};
      roles.forEach(function (r) { byId[r.id] = r; });
      pool = onlyRoles.map(function (id) { return byId[id]; }).filter(Boolean);
      if (!pool.length) pool = roles.slice();
      return;
    }
    if (onlyEdition && onlyEdition !== 'custom') {
      var subset = roles.filter(function (r) { return (r.edition || '') === onlyEdition; });
      pool = subset.length ? subset : roles.slice();
      return;
    }
    pool = roles.slice();
  }

  /* ---------- 顶栏：角色按钮 ---------- */
  function renderRoleChip() {
    var v = $('#roleChipValue');
    if (!pickedRoles.length) {
      v.textContent = '未选择';
      v.classList.remove('on');
      return;
    }
    v.classList.add('on');
    v.textContent = pickedRoles.map(function (r) { return r.name; }).join('、');
  }

  function setPicked(list) {
    pickedRoles = list || [];
    renderRoleChip();
  }

  /* ---------- 提示卡 ---------- */
  function renderGrid() {
    var box = $('#grid');
    box.innerHTML = '';
    PHRASES.forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'x-card' + (p.slot === 'roles' ? ' wide' : '');
      var hint = p.slot === 'role' ? '需要角色' : (p.slot === 'roles' ? '可选多个角色' : '');
      b.innerHTML = p.label + (hint ? '<span class="tpl">' + hint + '</span>' : '');
      b.addEventListener('click', function () { tapCard(p); });
      box.appendChild(b);
    });
  }

  function tapCard(p) {
    activePhrase = p;
    if (!p.slot) { showPhrase(p); return; }

    var need = p.slot === 'roles' ? 'multi' : 'single';
    var enough = pickedRoles.length > 0 && (need === 'single' || pickedRoles.length > 1);
    if (enough) { showPhrase(p); return; }

    // 没选角色：打开选择器，选完直接展示这张卡
    openPicker(need, 'phrase');
  }

  /* ---------- 选择器 ---------- */
  function openPicker(mode, intent) {
    pickerMode = mode;
    pickerIntent = intent;

    $('#search').value = '';
    $('#pickOk').disabled = true;
    $('#pickOk').textContent = mode === 'multi' ? '确定（可多选）' : '确定';
    renderRoles('');
    $('#sheet').hidden = false;
    $('#back').hidden = false;
    setClose(false);
    setTimeout(function () { try { $('#search').focus(); } catch (e) { /* noop */ } }, 60);
  }

  function renderRoles(filter) {
    var box = $('#roles');
    var kw = String(filter || '').trim();
    box.innerHTML = '';
    pool.slice().sort(function (a, b) {
      var da = TEAM_ORDER[a.team] == null ? 9 : TEAM_ORDER[a.team];
      var db = TEAM_ORDER[b.team] == null ? 9 : TEAM_ORDER[b.team];
      if (da !== db) return da - db;
      return a.name.localeCompare(b.name, 'zh');
    }).forEach(function (r) {
      if (kw && r.name.indexOf(kw) < 0 && r.id.indexOf(kw) < 0) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'x-role team-' + r.team + (pickedRoles.indexOf(r) >= 0 ? ' on' : '');
      b.innerHTML = (r.image ? '<img src="' + r.image + '" alt="" loading="lazy">' : '') + '<span>' + r.name + '</span>';
      b.addEventListener('click', function () { tapRole(r, b); });
      box.appendChild(b);
    });
    if (!box.children.length) {
      box.innerHTML = '<p style="grid-column:1/-1;color:#7d7264;font-size:13px;padding:12px 4px">没有匹配的角色</p>';
    }
  }

  function tapRole(r, el) {
    if (pickerMode === 'multi') {
      var i = pickedRoles.indexOf(r);
      if (i >= 0) { pickedRoles.splice(i, 1); el.classList.remove('on'); }
      else { pickedRoles.push(r); el.classList.add('on'); }
      $('#pickOk').disabled = !pickedRoles.length;
      $('#pickOk').textContent = pickedRoles.length ? ('确定（已选 ' + pickedRoles.length + ' 个）') : '确定';
      renderRoleChip();
      return;
    }
    // 单选：点一下就定了
    setPicked([r]);
    finishPick();
  }

  function finishPick() {
    var intent = pickerIntent;
    closeSheet(true);
    if (intent === 'phrase' && activePhrase) { showPhrase(activePhrase); return; }
    if (intent === 'change' && activePhrase) { showPhrase(activePhrase); return; }
    // chip：只更新顶栏，回首页
    setClose(true);
  }

  function closeSheet(keepCloseHidden) {
    $('#sheet').hidden = true;
    if (!keepCloseHidden && $('#show').hidden) setClose(true);
  }

  /* ---------- 展示 ---------- */
  function phraseText(p) {
    if (p.slot === 'roles') return p.tpl.replace('__', pickedRoles.map(function (r) { return r.name; }).join('、'));
    if (p.slot === 'role') return p.tpl.replace('__', pickedRoles.length ? pickedRoles[0].name : '');
    return p.label;
  }

  function showPhrase(p) {
    activePhrase = p;
    $('#showText').innerHTML = phraseText(p);
    $('#sheet').hidden = true;
    $('#show').hidden = false;
    $('#back').hidden = false;

    var needRole = p.slot === 'role' || p.slot === 'roles';
    $('#btnChangeRole').hidden = !needRole;
    if (navigator.vibrate) { try { navigator.vibrate(14); } catch (e) { /* noop */ } }
  }

  function closeShow() {
    $('#show').hidden = true;
    activePhrase = null;
    if ($('#sheet').hidden) { $('#back').hidden = true; setClose(true); }
  }

  /* ---------- 内嵌关闭 ---------- */
  function setClose(visible) {
    var b = document.getElementById('x-close');
    if (b) b.style.display = visible ? '' : 'none';
  }

  function addEmbeddedClose() {
    if (!embedded || document.getElementById('x-close')) return;
    var b = document.createElement('button');
    b.id = 'x-close';
    b.type = 'button';
    b.className = 'x-close';
    b.textContent = '关闭';
    b.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      try { window.parent.postMessage('xrh-close', '*'); } catch (err) { /* noop */ }
    });
    document.body.appendChild(b);
  }

  /* ---------- 事件 ---------- */
  $('#roleChip').addEventListener('click', function () { openPicker('single', 'chip'); });
  $('#search').addEventListener('input', function (e) { renderRoles(e.target.value); });
  $('#pickCancel').addEventListener('click', function () { closeSheet(); });
  $('#pickOk').addEventListener('click', function () {
    if (!pickedRoles.length) return;
    finishPick();
  });

  $('#btnChangeRole').addEventListener('click', function (e) {
    e.stopPropagation();
    openPicker(activePhrase && activePhrase.slot === 'roles' ? 'multi' : 'single', 'change');
  });
  $('#btnShowBack').addEventListener('click', function (e) { e.stopPropagation(); closeShow(); });
  $('#show').addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('.x-show-btn')) return;
    closeShow();
  });

  $('#back').addEventListener('click', function () {
    if (!$('#show').hidden) { closeShow(); return; }
    closeSheet();
  });

  window.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!$('#show').hidden) { closeShow(); return; }
    if (!$('#sheet').hidden) { closeSheet(); return; }
    try { if (embedded) window.parent.postMessage('xrh-close', '*'); } catch (err) { /* noop */ }
  });

  /* ---------- 启动 ---------- */
  renderGrid();
  renderRoleChip();
  addEmbeddedClose();
  loadRoles().then(function () {
    var sub = document.querySelector('.x-sub');
    if (!sub) return;
    var label = scriptName;
    if (!label && onlyEdition) {
      var map = { tb: '暗流涌动', bmr: '黯月初升', snv: '梦殒春宵', hdcs: '华灯初上', exp: '实验性角色', syyl: '山雨欲来', ngj: '无上愉悦', luf: '窃窃私语' };
      label = map[onlyEdition] || '';
    }
    sub.textContent = label ? ('当前剧本：' + label + ' · 点提示卡') : '点一张提示卡，再把屏幕递给玩家';
  });
})();
