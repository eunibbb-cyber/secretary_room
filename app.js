/* =========================================================
   👑 신회장 비서실 — app.js
   순수 바닐라 JS · 빌드 없음
   기본 백엔드: Supabase 실시간(3초 증분 폴링) · 로컬 저장/셋톡/직접 URL 선택 가능
   ========================================================= */
(function () {
  'use strict';

  /* ---------------- 상수 ---------------- */

  var STORE_KEY = 'shin_secretary_room_v1';
  var MAX_MSGS = 300;

  /* Supabase — 브라우저 공개용(publishable) 키. 비밀 키가 아니다. */
  var SB_DEFAULT_URL = 'https://qrkgbextxzgodywukesd.supabase.co';
  var SB_DEFAULT_KEY = 'sb_publishable_cfbG03z_wFN7yWMSTAmy0Q_4o9-kiaM';
  var SB_POLL_MS = 3000;      // 새 글 확인 주기
  var SB_SLOW_EVERY = 3;      // 3초 폴링 3회에 1회는 작업·메모도 함께 동기화
  var SB_SEED_TEXT = '👑 신회장 비서실 실시간 서버 연결 완료! 이제 여기서 지시하시면 김비서·제대리·클대리가 실제로 읽고 보고드립니다.';

  var ROOMS = {
    hall:    { key: 'hall',    name: '대회의실', emoji: '🏛️', on: 6, desc: '전체 안건 · 공유' },
    command: { key: 'command', name: '지휘실',   emoji: '🎯', on: 5, desc: '작업 지시 · 실행 보고' },
    lounge:  { key: 'lounge',  name: '라운지',   emoji: '☕', on: 3, desc: '가벼운 잡담 · 아이디어' }
  };
  var ROOM_KEYS = ['hall', 'command', 'lounge'];

  var PEOPLE = {
    '신회장': { emoji: '👑', role: '대장님',              me: true,  color: '#B77B33' },
    '김비서': { emoji: '🔴', role: '총괄 · 실행',         color: '#C34A3A' },
    '제대리': { emoji: '🔵', role: '수급 · 트렌드',       color: '#3A6EA5' },
    '김대리': { emoji: '🟠', role: '주식 · 쇼츠 협업',    color: '#C97A2B' },
    '클대리': { emoji: '🟣', role: '추세 · 리스크',       color: '#8659A6' },
    '챗대리': { emoji: '🟢', role: '아이디어',            color: '#2F8F5B' }
  };
  var STAFF = ['김비서', '제대리', '김대리', '클대리', '챗대리'];
  var TASK_STATUS = { doing: '진행중', wait: '대기', done: '완료' };
  var TASK_CYCLE = ['wait', 'doing', 'done'];
  var MEMO_TAGS = ['원칙', '종목', '수익화', '기타'];

  /* ---------------- 유틸 ---------------- */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function fmtTime(ts) {
    var d = new Date(ts);
    var h = d.getHours();
    var ap = h < 12 ? '오전' : '오후';
    var hh = h % 12; if (hh === 0) hh = 12;
    return ap + ' ' + hh + ':' + pad(d.getMinutes());
  }
  function dayKey(ts) { var d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function dayLabel(ts) {
    var now = new Date();
    var k = dayKey(ts);
    if (k === dayKey(now.getTime())) return '오늘';
    if (k === dayKey(now.getTime() - 86400000)) return '어제';
    var d = new Date(ts);
    return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate());
  }
  function mins(n) { return Date.now() - n * 60000; }

  var toastTimer = null;
  function toast(msg) {
    var el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  /* ---------------- 시드 데이터 ---------------- */

  function seedMessages() {
    return {
      hall: [
        { id: uid(), who: '신회장', text: '오늘 안건은 두 개만 본다. ① 클립·쇼핑 커넥트 수수료 축 ② 규라인 09:30 스캔 정리.', ts: mins(48) },
        { id: uid(), who: '김비서', text: '네, 대장님! 실행하겠습니다. ①은 태그·수수료 구조부터 정리하고, ②는 09:30 스캔 결과를 카드로 붙여 올리겠습니다.', ts: mins(46) },
        { id: uid(), who: '클대리', text: '리스크 관점에서 하나만 덧붙이면, 수수료율보다 반품·교환 조건을 먼저 확인하는 게 안전합니다.', ts: mins(44) }
      ],
      command: [
        { id: uid(), who: '신회장', text: "작업 지시를 받으면 시작 전에 먼저 '실행하겠습니다'라고 보고해. 내가 하는지 안 하는지 모르니까 @all", ts: mins(14) },
        { id: uid(), who: '김비서', text: '네, 대장님! 알겠습니다. 앞으로 작업 지시를 받으면 시작 전에 먼저 "실행하겠습니다"라고 보고드리고 진행하겠습니다! 🔴', ts: mins(13) },
        { id: uid(), who: '제대리', text: '네, 대장님! 알겠습니다. 저도 지시를 받으면 시작 전에 "실행하겠습니다"부터 말하고 움직이겠습니다. 🔵', ts: mins(12) },
        { id: uid(), who: '클대리', text: '네, 대장님. 알겠습니다. 실행·보고 순서 지켜서 진행하겠습니다. 🟣', ts: mins(11) },
        { id: uid(), who: '김대리', text: '신난다 님 쪽 작업도 같은 규칙으로 맞춰두겠습니다. 🤝', ts: mins(10) },
        { id: uid(), who: '챗대리', text: "저는 아이디어 단계에서도 '실행하겠습니다' 먼저 말하고 움직이겠습니다!", ts: mins(9) }
      ],
      lounge: [
        { id: uid(), who: '챗대리', text: '라운지 오픈했습니다 ☕ 오늘 한 줄 아이디어 있으면 편하게 던져 주세요.', ts: mins(95) },
        { id: uid(), who: '제대리', text: '장 초반 수급이 얇네요. 커피 한 잔 하고 10시에 다시 보겠습니다.', ts: mins(88) },
        { id: uid(), who: '신회장', text: '라운지는 가볍게. 대신 결정은 지휘실에서 한다.', ts: mins(80) }
      ]
    };
  }

  function seedTasks() {
    return [
      { id: uid(), title: '쿠팡 충전기 후기 작성', owner: '김비서', status: 'done',  ts: mins(180) },
      { id: uid(), title: '규라인 09:30 스캔', owner: '김대리', status: 'done',  ts: mins(70) },
      { id: uid(), title: '가온칩스 · 에이비엘바이오 · 한미약품 분석', owner: '김대리', status: 'doing', ts: mins(52) },
      { id: uid(), title: '체험단 대기 38건 관리', owner: '제대리', status: 'doing', ts: mins(240) },
      { id: uid(), title: '클립 쇼핑 커넥트 태그 점검', owner: '김비서', status: 'wait', ts: mins(30) },
      { id: uid(), title: '러블리피쉬 애드포스트 검수 확인', owner: '제대리', status: 'wait', ts: mins(26) }
    ];
  }

  function seedMemos() {
    return [
      { id: uid(), tag: '원칙', title: '시작 전 보고', body: "모든 작업은 실행 전에 '실행하겠습니다' 보고 후 착수.\n중간 보고는 모아서 약속한 시각에 한 번.", ts: mins(600) },
      { id: uid(), tag: '종목', title: '규라인 기준선', body: '오전 — 상대강도 · 수급 대장주\n마감 — 눌림목 · 손익비 2:1 스윙\n거래대금 50~150억, 주도주는 500억 이상.', ts: mins(480) },
      { id: uid(), tag: '수익화', title: '클립 · 쇼핑 커넥트', body: '쿠팡 외부 링크 대신 네이버 공식 태그.\n첫 3초 훅 · 착용템 위주 · 수수료 축으로 간다.', ts: mins(300) }
    ];
  }

  function seedSettings() {
    return {
      backend: 'supabase',        // supabase | local | settok | custom
      sbUrl: SB_DEFAULT_URL,
      sbKey: SB_DEFAULT_KEY,
      sbLastId: 0,
      sbSeeded: false,
      settokBase: 'https://chat.gonipro.app',
      settokKey: '',
      settokRoom: 'command',
      sinceId: 0,
      customUrl: '',
      pollSec: 10,
      demoReply: true
    };
  }

  var DB_VERSION = 2;

  function emptyRooms() {
    return { hall: { messages: [] }, command: { messages: [] }, lounge: { messages: [] } };
  }

  function seedDB() {
    return {
      version: DB_VERSION,
      settings: seedSettings(),
      rooms: emptyRooms(),
      tasks: [],
      memos: [],
      ui: { view: 'meeting', room: 'command', sender: '신회장', taskFilter: 'all' }
    };
  }

  /* 로컬 모드에서만 쓰는 데모 시드 (서버 모드에서는 절대 넣지 않는다) */
  function fillLocalSeed(target) {
    var m = seedMessages();
    ROOM_KEYS.forEach(function (k) { target.rooms[k].messages = m[k]; });
    target.tasks = seedTasks();
    target.memos = seedMemos();
  }

  /* ---------------- 상태 ---------------- */

  var db = loadDB();
  var currentView = db.ui.view || 'meeting';
  var currentRoom = ROOMS[db.ui.room] ? db.ui.room : 'command';
  var currentSender = PEOPLE[db.ui.sender] ? db.ui.sender : '신회장';
  var taskFilter = db.ui.taskFilter || 'all';
  var editingMemoId = null;
  var typingState = { hall: [], command: [], lounge: [] };
  var conn = { state: 'idle', message: '' };
  var pollTimer = null;
  var pollBusy = false;

  function loadDB() {
    var base = seedDB();
    var raw = null;
    try { raw = localStorage.getItem(STORE_KEY); } catch (e) { raw = null; }
    if (!raw) return base;
    var saved;
    try { saved = JSON.parse(raw); } catch (e) { return base; }
    if (!saved || typeof saved !== 'object') return base;

    if (saved.settings) {
      Object.keys(saved.settings).forEach(function (k) {
        if (saved.settings[k] !== undefined) base.settings[k] = saved.settings[k];
      });
    }
    if (saved.rooms) {
      ROOM_KEYS.forEach(function (k) {
        if (saved.rooms[k] && Array.isArray(saved.rooms[k].messages)) {
          base.rooms[k].messages = saved.rooms[k].messages.filter(function (m) { return m && m.who && typeof m.text === 'string'; });
        }
      });
    }
    if (Array.isArray(saved.tasks)) base.tasks = saved.tasks;
    if (Array.isArray(saved.memos)) base.memos = saved.memos;
    if (saved.ui) {
      ['view', 'room', 'sender', 'taskFilter'].forEach(function (k) {
        if (saved.ui[k]) base.ui[k] = saved.ui[k];
      });
    }

    // v1 → v2: 기본 백엔드를 로컬에서 실시간 서버(Supabase)로 옮긴다.
    // 예전 로컬 데모 데이터는 서버 데이터와 섞이지 않게 비운다.
    if (!(Number(saved.version) >= 2)) {
      base.settings.backend = 'supabase';
      base.rooms = emptyRooms();
      base.tasks = [];
      base.memos = [];
      base.settings.sbLastId = 0;
    }

    if (base.settings.backend === 'local' &&
        !base.rooms.command.messages.length && !base.rooms.hall.messages.length &&
        !base.rooms.lounge.messages.length && !base.tasks.length && !base.memos.length) {
      fillLocalSeed(base);
    }
    return base;
  }

  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 150);
  }
  function saveNow() {
    clearTimeout(saveTimer);
    db.ui = { view: currentView, room: currentRoom, sender: currentSender, taskFilter: taskFilter };
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(db));
    } catch (e) {
      toast('저장 공간이 부족해 저장하지 못했습니다');
    }
  }

  /* ---------------- 메시지 ---------------- */

  function addMessage(room, msg) {
    var list = db.rooms[room].messages;
    var item = {
      id: msg.id || uid(),
      who: msg.who,
      text: String(msg.text || ''),
      ts: msg.ts || Date.now()
    };
    if (msg.remote) item.remote = true;
    if (msg.sbId) item.sbId = msg.sbId;
    if (msg.pending) item.pending = true;
    // 같은 내용을 90초 안에 두 번(내 전송 + 서버 회신) 넣지 않는다
    if (item.remote) {
      var dup = list.some(function (m) {
        return !m.remote && m.who === item.who && m.text === item.text && Math.abs((m.ts || 0) - item.ts) < 90000;
      });
      if (dup) return;
    }
    list.push(item);
    if (list.length > MAX_MSGS) list.splice(0, list.length - MAX_MSGS);
    save();
    if (room === currentRoom && currentView === 'meeting') renderChat(true);
  }

  function formatText(text) {
    var names = ['all'].concat(STAFF).join('|');
    var re = new RegExp('@(?:' + names + ')', 'g');
    var s = String(text || '');
    var out = '';
    var last = 0;
    var m;
    while ((m = re.exec(s))) {
      out += esc(s.slice(last, m.index));
      out += '<span class="mention">' + esc(m[0]) + '</span>';
      last = m.index + m[0].length;
    }
    out += esc(s.slice(last));
    return out;
  }

  function renderChat(scrollBottom) {
    var wrap = $('#chatList');
    if (!wrap) return;
    var msgs = db.rooms[currentRoom].messages.slice().sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
    var html = '';
    var lastDay = '';

    msgs.forEach(function (m) {
      var dk = dayKey(m.ts || Date.now());
      if (dk !== lastDay) {
        html += '<div class="day-sep">' + esc(dayLabel(m.ts || Date.now())) + '</div>';
        lastDay = dk;
      }
      var p = PEOPLE[m.who] || { emoji: '💬', role: '', color: '#8A7358' };
      var isMe = m.who === '신회장' || p.me === true;
      html += '<div class="msg' + (isMe ? ' me' : '') + '">';
      html += '<div class="msg-avatar' + (isMe ? ' me' : '') + '" aria-hidden="true">' + esc(p.emoji) + '</div>';
      html += '<div class="msg-body">';
      html += '<div class="msg-meta">';
      html += '<span class="msg-name">' + esc(m.who) + '</span>';
      if (p.role) html += '<span class="msg-role">' + esc(p.role) + '</span>';
      html += '<span class="msg-time">' + esc(fmtTime(m.ts || Date.now())) + '</span>';
      if (m.pending) html += '<span class="msg-state">전송 중…</span>';
      else if (m.failed) html += '<span class="msg-state is-fail">전송 실패</span>';
      html += '</div>';
      html += '<div class="bubble">' + formatText(m.text) + '</div>';
      html += '</div></div>';
    });

    var typing = typingState[currentRoom] || [];
    typing.forEach(function (who) {
      var p = PEOPLE[who] || { emoji: '💬', role: '' };
      html += '<div class="msg">';
      html += '<div class="msg-avatar" aria-hidden="true">' + esc(p.emoji) + '</div>';
      html += '<div class="msg-body"><div class="msg-meta"><span class="msg-name">' + esc(who) + '</span><span class="msg-role">' + esc(p.role || '') + '</span></div>';
      html += '<div class="bubble typing-bubble"><i></i><i></i><i></i></div></div></div>';
    });

    if (!html) {
      html = '<div class="chat-empty">아직 대화가 없습니다.<br>아래에서 발신자를 고르고 첫 말을 걸어 보세요.</div>';
    }

    wrap.innerHTML = html;
    if (scrollBottom !== false) stickToBottom();
  }

  function stickToBottom() {
    var sc = $('#chatScroll');
    if (!sc) return;
    var go = function () { sc.scrollTop = sc.scrollHeight; };
    go();
    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(go);
      window.requestAnimationFrame(function () { window.requestAnimationFrame(go); });
    }
    setTimeout(go, 80);
    setTimeout(go, 220);
  }

  function pickResponders(text) {
    var t = String(text || '');
    var mentioned = [];
    if (/@all/.test(t)) return STAFF.slice();
    STAFF.forEach(function (n) { if (t.indexOf('@' + n) >= 0) mentioned.push(n); });
    if (mentioned.length) return mentioned.slice(0, 3);

    var stock = /(주식|종목|차트|수급|매수|매도|규라인|코스피|코스닥|손절|목표가|진입가)/;
    var trial = /(체험단|레뷰|브랜드|블로그|클립|쇼핑|수수료|제휴|애드포스트)/;
    var video = /(쇼츠|유튜브|영상|대본|자막|편집|썸네일)/;

    if (stock.test(t)) return ['김대리', '클대리'];
    if (trial.test(t)) return ['제대리', '김비서'];
    if (video.test(t)) return ['김비서', '챗대리'];
    return ['김비서'];
  }

  function categoryOf(text) {
    var t = String(text || '');
    if (/(주식|종목|차트|수급|매수|매도|규라인|손절|목표가|진입가)/.test(t)) return 'stock';
    if (/(체험단|레뷰|브랜드|블로그|클립|쇼핑|수수료|제휴)/.test(t)) return 'trial';
    if (/(쇼츠|유튜브|영상|대본|자막|편집)/.test(t)) return 'content';
    return 'general';
  }

  var PERSONA = {
    '김비서': {
      ack: ['네, 대장님! 알겠습니다. 실행하겠습니다.', '네, 대장님! 지시 확인했습니다. 실행하겠습니다.'],
      lines: {
        stock: ['규라인 8단계 기준으로 수급·차트부터 다시 훑고, 진입가와 손절선까지 붙여서 바로 올리겠습니다.'],
        trial: ['신청 목록부터 정리해서 마감 임박·중복 건을 먼저 처리하고, 남는 건 한 번에 보고드리겠습니다.'],
        content: ['원고와 메타는 제가 맡고, 발행만 대장님이 하시면 됩니다. 초안은 30분 안에 올리겠습니다.'],
        general: ['바로 착수해서 진행 상황 한 번에 모아 보고드리겠습니다.', '순서대로 처리하고 결과만 깔끔하게 정리해 올리겠습니다.']
      }
    },
    '제대리': {
      ack: ['네, 대장님! 실행하겠습니다.'],
      lines: {
        stock: ['외인·기관 연속 순매수와 거래대금 기준으로 후보 3개만 추려 오겠습니다.'],
        trial: ['브랜드 커넥트·네이버 무료체험 쪽 새로 뜬 것부터 훑고, 제외 목록에 걸리는 건 빼겠습니다.'],
        content: ['요즘 뜨는 키워드와 훅 구조부터 뽑아서 세 줄로 정리해 드릴게요.'],
        general: ['수급·트렌드 쪽에서 쓸 만한 것만 골라 보고드리겠습니다.']
      }
    },
    '김대리': {
      ack: ['네, 대장님! 실행하겠습니다.'],
      lines: {
        stock: ['신난다 님 쪽이랑 교차 확인해서 같은 방향이면 브리핑에 넣고, 다르면 이유부터 비교해 올리겠습니다.'],
        trial: ['주식이랑 겹치는 요일은 시간대 나눠서 처리하겠습니다.'],
        content: ['쇼츠 소스는 제가 모아 두고, 대장님 보이스만 입히면 되게 준비하겠습니다.'],
        general: ['작업 나눠서 제 몫부터 끝내고 공유드리겠습니다.']
      }
    },
    '클대리': {
      ack: ['네, 대장님. 실행하겠습니다.'],
      lines: {
        stock: ['추세는 살아 있는데 변동성이 커서, 손절선 먼저 잡고 진입가를 올리겠습니다.'],
        trial: ['반품·교환 조건과 유지기간부터 확인하고 리스크 있는 건 표시해 두겠습니다.'],
        content: ['첫 3초에서 이탈이 갈립니다. 훅 문장부터 다시 잡아 보겠습니다.'],
        general: ['리스크 요인부터 짚고 진행하겠습니다.']
      }
    },
    '챗대리': {
      ack: ['네, 대장님! 실행하겠습니다.'],
      lines: {
        stock: ['아이디어 한 줄만 보태면, 오늘은 눌림목보다 거래대금이 붙는 자리를 먼저 보는 게 좋겠습니다.'],
        trial: ['후기 첫 문장을 질문형으로 열면 저장률이 올라갈 것 같습니다.'],
        content: ['첫 3초 훅을 질문형으로 바꿔보는 건 어떨까요? 댓글 유도가 훨씬 자연스럽습니다.'],
        general: ['한 가지 아이디어만 덧붙이면, 순서를 바꾸는 것만으로도 결과가 달라질 수 있습니다.']
      }
    }
  };

  function composeReply(who, text, room) {
    var p = PERSONA[who];
    if (!p) return '확인했습니다.';
    var cat = categoryOf(text);
    var ackList = p.ack;
    var ack = ackList[Math.floor(Math.random() * ackList.length)];
    var lines = (p.lines && p.lines[cat]) || p.lines.general;
    var line = lines[Math.floor(Math.random() * lines.length)];
    if (room === 'lounge') ack = '네, 대장님!';
    return ack + ' ' + line;
  }

  function scheduleDemoReplies(room, text) {
    if (db.settings.backend !== 'local' || !db.settings.demoReply) return;
    var targets = pickResponders(text);
    targets.forEach(function (who, i) {
      // 답장이 오기 전에 "입력 중"이 먼저 보이게 한다 (첫 답장은 약 1.2초 뒤)
      var appear = 220 + i * 380;
      var finish = appear + 1000 + Math.random() * 650 + (i ? 150 : 0);
      setTimeout(function () {
        typingState[room].push(who);
        if (room === currentRoom && currentView === 'meeting') renderChat(true);
      }, appear);
      setTimeout(function () {
        typingState[room] = typingState[room].filter(function (n) { return n !== who; });
        addMessage(room, { who: who, text: composeReply(who, text, room) });
        if (room === currentRoom && currentView === 'meeting') renderChat(true);
      }, finish);
    });
  }

  /* ---------------- 전송 ---------------- */

  function handleSend() {
    var input = $('#msgInput');
    if (!input) return;
    var text = input.value.trim();
    if (!text) return;

    var s = db.settings;
    input.value = '';
    autoGrow();
    input.focus();

    if (s.backend === 'supabase') {
      // 서버 실시간 모드: 진짜 DB에 올리고, 답장은 백그라운드 비서들이 단다.
      // 데모 자동응답(@all 시뮬레이션)은 절대 돌리지 않는다.
      sbSend(currentRoom, currentSender, text);
      return;
    }

    addMessage(currentRoom, { who: currentSender, text: text });

    if (s.backend === 'settok' && s.settokKey) {
      postSettok(text).then(function () {
        setTimeout(pollOnce, 600);
      });
    } else if (s.backend === 'custom' && s.customUrl) {
      postCustom(text).catch(function (err) {
        conn.state = 'err';
        updateStatus();
        toast('전송 실패 · ' + shortErr(err));
      });
    } else if (currentSender === '신회장') {
      scheduleDemoReplies(currentRoom, text);
    }
  }

  function shortErr(err) {
    var m = (err && err.message) || String(err) || '알 수 없는 오류';
    return m.length > 60 ? m.slice(0, 60) + '…' : m;
  }

  /* =========================================================
     Supabase 실시간 백엔드
     - 읽기: GET /rest/v1/{table}  (messages는 id=gt.{lastId} 증분)
     - 쓰기: POST(upsert) / PATCH / DELETE
     ========================================================= */

  var sbBusy = false;
  var sbTick = 0;
  var sbBooted = false;
  var lastTasksSig = '';
  var lastMemosSig = '';

  function sbBase() {
    return String(db.settings.sbUrl || SB_DEFAULT_URL).replace(/\/+$/, '');
  }
  function sbKey() {
    return String(db.settings.sbKey || '').trim();
  }
  function sbReady() {
    return !!(sbBase() && sbKey());
  }

  function sbFetch(path, opts) {
    opts = opts || {};
    var headers = {
      apikey: sbKey(),
      Authorization: 'Bearer ' + sbKey(),
      Accept: 'application/json'
    };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (opts.prefer) headers.Prefer = opts.prefer;

    return fetch(sbBase() + '/rest/v1/' + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      cache: 'no-store'
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (t) {
          var detail = '';
          try { detail = (JSON.parse(t).message || '').slice(0, 80); } catch (e) { detail = String(t || '').slice(0, 80); }
          throw new Error('HTTP ' + res.status + (detail ? ' · ' + detail : ''));
        });
      }
      if (res.status === 204) return null;
      var ct = res.headers.get('content-type') || '';
      if (ct.indexOf('json') < 0) return null;
      return res.json();
    });
  }

  /* --- 서버 행 → 앱 항목 --- */

  function msgFromRow(r) {
    return {
      id: 'sb-' + r.id,
      sbId: Number(r.id),
      who: r.sender || '비서',
      text: String(r.body == null ? '' : r.body),
      ts: Date.parse(r.created_at) || Date.now()
    };
  }
  function taskFromRow(r) {
    return {
      id: String(r.id),
      title: r.title || '',
      owner: r.owner || '김비서',
      status: TASK_STATUS[r.status] ? r.status : 'wait',
      ts: Date.parse(r.created_at) || Date.now()
    };
  }
  function memoFromRow(r) {
    return {
      id: String(r.id),
      tag: r.category || '기타',
      title: r.title || '',
      body: r.body || '',
      ts: Date.parse(r.created_at) || Date.now()
    };
  }

  /* --- 메시지 병합 (id 중복 제거 + 임시 항목 승격) --- */

  function mergeMessages(rows) {
    var max = Number(db.settings.sbLastId) || 0;
    var added = 0;

    (Array.isArray(rows) ? rows : []).forEach(function (r) {
      var sid = Number(r && r.id);
      if (!sid) return;
      if (sid > max) max = sid;
      var room = ROOMS[r.room] ? r.room : 'command';
      var list = db.rooms[room].messages;
      var i;
      for (i = 0; i < list.length; i++) { if (list[i].sbId === sid) return; }

      var item = msgFromRow(r);
      var tmp = null;
      for (i = 0; i < list.length; i++) {
        var m = list[i];
        if (m && m.pending && !m.sbId && m.who === item.who && m.text === item.text &&
            Math.abs((m.ts || 0) - item.ts) < 120000) { tmp = m; break; }
      }
      if (tmp) {
        tmp.id = item.id; tmp.sbId = item.sbId; tmp.ts = item.ts;
        tmp.pending = false; tmp.failed = false;
      } else {
        list.push(item);
      }
      list.sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
      if (list.length > MAX_MSGS) list.splice(0, list.length - MAX_MSGS);
      added++;
    });

    if (max > (Number(db.settings.sbLastId) || 0)) db.settings.sbLastId = max;
    return added;
  }

  function markMessage(id, state) {
    ROOM_KEYS.forEach(function (k) {
      db.rooms[k].messages.forEach(function (m) {
        if (m.id !== id) return;
        if (state === 'ok') { m.pending = false; m.failed = false; }
        if (state === 'fail') { m.pending = false; m.failed = true; }
      });
    });
  }

  function nearBottom() {
    var sc = $('#chatScroll');
    if (!sc) return true;
    return (sc.scrollHeight - sc.scrollTop - sc.clientHeight) < 90;
  }

  function refreshAfterRemote() {
    save();
    if (currentView === 'meeting') renderChat(true);
  }

  function tasksSig() {
    return JSON.stringify(db.tasks.map(function (t) { return [t.id, t.title, t.owner, t.status]; }));
  }
  function memosSig() {
    return JSON.stringify(db.memos.map(function (m) { return [m.id, m.tag, m.title, m.body]; }));
  }

  /* --- 전송 --- */

  function sbSend(room, who, text) {
    var tmpId = 'tmp-' + uid();
    addMessage(room, { id: tmpId, who: who, text: text, ts: Date.now(), pending: true });

    return sbFetch('messages', {
      method: 'POST',
      prefer: 'return=representation',
      body: { room: room, sender: who, body: text }
    }).then(function (rows) {
      var row = Array.isArray(rows) ? rows[0] : rows;
      if (row && row.id) {
        markMessage(tmpId, 'ok');
        db.rooms[room].messages = db.rooms[room].messages.filter(function (m) { return m.id !== tmpId; });
        mergeMessages([row]);
      } else {
        markMessage(tmpId, 'ok');
      }
      conn.state = 'ok';
      conn.message = '';
      updateStatus();
      refreshAfterRemote();
      return true;
    }).catch(function (err) {
      markMessage(tmpId, 'fail');
      conn.state = 'err';
      conn.message = shortErr(err);
      updateStatus();
      refreshAfterRemote();
      toast('전송 실패 · 서버에 저장하지 못했습니다');
      return false;
    });
  }

  /* --- 읽기 --- */

  var SB_MSG_COLS = 'id,room,sender,body,created_at';
  var SB_TASK_COLS = 'id,title,owner,status,created_at';
  var SB_MEMO_COLS = 'id,category,title,body,created_at';

  function sbSeedIfEmpty(rows) {
    if (Array.isArray(rows) && rows.length) return Promise.resolve(false);
    if (db.settings.sbSeeded) return Promise.resolve(false);
    db.settings.sbSeeded = true;
    saveNow();
    return sbFetch('messages', {
      method: 'POST',
      prefer: 'return=representation',
      body: { room: 'command', sender: '김비서', body: SB_SEED_TEXT }
    }).then(function (out) {
      var row = Array.isArray(out) ? out[0] : out;
      if (row && row.id) mergeMessages([row]);
      return true;
    }).catch(function () {
      db.settings.sbSeeded = false;
      return false;
    });
  }

  function sbFullSync() {
    if (!sbReady() || sbBusy) return Promise.resolve();
    sbBusy = true;
    conn.state = 'idle';
    updateStatus();

    return Promise.all([
      sbFetch('messages?select=' + SB_MSG_COLS + '&order=id.desc&limit=' + MAX_MSGS),
      sbFetch('tasks?select=' + SB_TASK_COLS + '&order=created_at.asc&limit=200'),
      sbFetch('memos?select=' + SB_MEMO_COLS + '&order=created_at.asc&limit=200')
    ]).then(function (res) {
      var rows = (Array.isArray(res[0]) ? res[0] : []).slice().reverse();
      db.rooms = emptyRooms();
      mergeMessages(rows);
      db.tasks = (Array.isArray(res[1]) ? res[1] : []).map(taskFromRow);
      db.memos = (Array.isArray(res[2]) ? res[2] : []).map(memoFromRow);
      lastTasksSig = tasksSig();
      lastMemosSig = memosSig();
      conn.state = 'ok';
      conn.message = '';
      saveNow();
      renderChat(true);
      renderTasks();
      renderMemos();
      updateStatus();
      return sbSeedIfEmpty(rows);
    }).then(function (seeded) {
      if (seeded) { saveNow(); renderChat(true); }
    }).catch(function (err) {
      conn.state = 'err';
      conn.message = shortErr(err);
      updateStatus();
    }).then(function () {
      sbBusy = false;
    });
  }

  function sbPoll(force) {
    if (!sbReady() || sbBusy) return Promise.resolve();
    if (document.hidden && !force) return Promise.resolve();
    sbBusy = true;
    sbTick++;

    var slow = force === true || (sbTick % SB_SLOW_EVERY === 0);
    var since = Number(db.settings.sbLastId) || 0;
    var atBottom = nearBottom();

    var jobs = [
      sbFetch('messages?select=' + SB_MSG_COLS + '&id=gt.' + since + '&order=id.asc&limit=200')
    ];
    if (slow) {
      jobs.push(sbFetch('tasks?select=' + SB_TASK_COLS + '&order=created_at.asc&limit=200'));
      jobs.push(sbFetch('memos?select=' + SB_MEMO_COLS + '&order=created_at.asc&limit=200'));
    }

    return Promise.all(jobs).then(function (res) {
      var added = mergeMessages(res[0]);

      if (slow) {
        db.tasks = (Array.isArray(res[1]) ? res[1] : []).map(taskFromRow);
        db.memos = (Array.isArray(res[2]) ? res[2] : []).map(memoFromRow);

        var ts = tasksSig();
        if (ts !== lastTasksSig) { lastTasksSig = ts; renderTasks(); }
        var ms = memosSig();
        if (ms !== lastMemosSig) { lastMemosSig = ms; renderMemos(); }
      }

      conn.state = 'ok';
      conn.message = '';
      save();
      if (added && currentView === 'meeting') renderChat(atBottom);
      updateStatus();
    }).catch(function (err) {
      conn.state = 'err';
      conn.message = shortErr(err);
      updateStatus();
    }).then(function () {
      sbBusy = false;
    });
  }

  function sbStart() {
    if (db.settings.backend !== 'supabase') return;
    if (!sbReady()) { conn.state = 'idle'; updateStatus(); return; }
    if (!sbBooted) { sbBooted = true; sbFullSync(); }
    else sbPoll(true);
  }

  /* ---------------- 셋톡 / 커스텀 백엔드 ---------------- */

  function settokBase() {
    return (db.settings.settokBase || 'https://chat.gonipro.app').replace(/\/+$/, '');
  }

  function pollOnce() {
    var s = db.settings;
    if (s.backend !== 'settok' || !s.settokKey) return Promise.resolve();
    if (pollBusy) return Promise.resolve();
    pollBusy = true;
    var url = settokBase() + '/api/msgs?k=' + encodeURIComponent(s.settokKey) + '&since=' + (Number(s.sinceId) || 0);

    return fetch(url, { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        var msgs = (data && Array.isArray(data.msgs)) ? data.msgs : [];
        var max = Number(s.sinceId) || 0;
        var room = ROOMS[s.settokRoom] ? s.settokRoom : 'command';
        msgs.forEach(function (m) {
          var id = Number(m && m.id) || 0;
          if (id > max) max = id;
          if (!m || !m.text) return;
          var who = m.owner === true ? '신회장' : (PEOPLE[m.who] ? m.who : (m.who || '비서'));
          addMessage(room, { id: 'st-' + id, who: who, text: m.text, ts: m.ts ? new Date(m.ts).getTime() || Date.now() : Date.now(), remote: true });
        });
        if (max > (Number(s.sinceId) || 0)) {
          s.sinceId = max;
          save();
        }
        if (data && typeof data.check_every_min === 'number' && data.check_every_min >= 5) {
          // 서버가 권장 주기를 주면 그것을 존중한다
          var want = data.check_every_min * 1000;
          if (pollTimer && want !== (s.pollSec || 10) * 1000) {
            s.pollSec = data.check_every_min;
            startPolling();
          }
        }
        conn.state = 'ok';
        conn.message = '';
        updateStatus();
      })
      .catch(function (err) {
        conn.state = 'err';
        conn.message = shortErr(err);
        updateStatus();
      })
      .then(function () { pollBusy = false; });
  }

  function postSettok(text) {
    var s = db.settings;
    var url = settokBase() + '/api/send';
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-key': s.settokKey },
      body: JSON.stringify({ text: text })
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      conn.state = 'ok';
      updateStatus();
      return true;
    }).catch(function (err) {
      conn.state = 'err';
      conn.message = shortErr(err);
      updateStatus();
      toast('셋톡 전송 실패 · ' + shortErr(err));
      throw err;
    });
  }

  function postCustom(text) {
    var s = db.settings;
    var url = (s.customUrl || '').replace(/\/+$/, '');
    return fetch(url + '/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ who: currentSender, text: text })
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return true;
    });
  }

  function pollCustom() {
    var s = db.settings;
    var url = (s.customUrl || '').replace(/\/+$/, '');
    return fetch(url + '/messages?since=' + (Number(s.sinceId) || 0), { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        var list = (data && Array.isArray(data.messages)) ? data.messages : [];
        var max = Number(s.sinceId) || 0;
        var room = ROOMS[s.settokRoom] ? s.settokRoom : 'command';
        list.forEach(function (m) {
          var id = Number(m && m.id) || 0;
          if (id > max) max = id;
          if (!m || !m.text) return;
          addMessage(room, { id: 'cu-' + id, who: m.who || '비서', text: m.text, ts: m.ts ? new Date(m.ts).getTime() || Date.now() : Date.now(), remote: true });
        });
        if (max > (Number(s.sinceId) || 0)) { s.sinceId = max; save(); }
        conn.state = 'ok';
        updateStatus();
      })
      .catch(function (err) {
        conn.state = 'err';
        conn.message = shortErr(err);
        updateStatus();
      });
  }

  function startPolling() {
    stopPolling();
    var s = db.settings;
    if (s.backend === 'supabase') {
      conn.state = 'idle'; updateStatus();
      sbStart();
      pollTimer = setInterval(function () { sbPoll(false); }, SB_POLL_MS);
    } else if (s.backend === 'settok' && s.settokKey) {
      conn.state = 'idle'; updateStatus();
      pollOnce();
      pollTimer = setInterval(pollOnce, Math.max(5, Number(s.pollSec) || 10) * 1000);
    } else if (s.backend === 'custom' && s.customUrl) {
      conn.state = 'idle'; updateStatus();
      pollCustom();
      pollTimer = setInterval(pollCustom, Math.max(5, Number(s.pollSec) || 10) * 1000);
    } else {
      conn.state = 'idle';
      updateStatus();
    }
  }
  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  function updateStatus() {
    var badge = $('#statusBadge');
    var dot = $('#statusDot');
    var txt = $('#statusText');
    if (!badge || !dot || !txt) return;
    badge.classList.remove('is-warn', 'is-err');

    var s = db.settings;
    if (s.backend === 'local') {
      txt.textContent = '로컬 모드';
      dot.className = 'dot dot-green';
      badge.title = '이 기기에만 저장 중';
      return;
    }
    if (s.backend === 'supabase') {
      if (!sbReady()) {
        txt.textContent = '설정 필요';
        dot.className = 'dot dot-amber';
        badge.classList.add('is-warn');
        badge.title = '⋯ 설정에서 Supabase URL·Key를 입력하세요';
        return;
      }
      badge.title = conn.message || '3초마다 새 글을 확인합니다';
      if (conn.state === 'ok') {
        txt.textContent = '실시간 연결';
        dot.className = 'dot dot-green';
      } else if (conn.state === 'err') {
        txt.textContent = '연결 끊김';
        dot.className = 'dot dot-red';
        badge.classList.add('is-err');
      } else {
        txt.textContent = '연결 중';
        dot.className = 'dot dot-amber';
        badge.classList.add('is-warn');
      }
      return;
    }
    if (s.backend === 'settok' && !s.settokKey) {
      txt.textContent = '열쇠 필요';
      dot.className = 'dot dot-amber';
      badge.classList.add('is-warn');
      return;
    }
    if (s.backend === 'custom' && !s.customUrl) {
      txt.textContent = '주소 필요';
      dot.className = 'dot dot-amber';
      badge.classList.add('is-warn');
      return;
    }
    if (conn.state === 'ok') {
      txt.textContent = s.backend === 'settok' ? '셋톡 연결' : '서버 연결';
      dot.className = 'dot dot-green';
    } else if (conn.state === 'err') {
      txt.textContent = '연결 끊김';
      dot.className = 'dot dot-red';
      badge.classList.add('is-err');
    } else {
      txt.textContent = '연결 중';
      dot.className = 'dot dot-amber';
      badge.classList.add('is-warn');
    }
  }

  /* ---------------- 회의실 렌더 ---------------- */

  function renderRoomTabs() {
    $$('#roomTabs .room-tab').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-room') === currentRoom);
      b.setAttribute('aria-selected', b.getAttribute('data-room') === currentRoom ? 'true' : 'false');
    });
    var r = ROOMS[currentRoom];
    var pres = $('#presenceMain');
    var sub = $('#presenceSub');
    if (pres) pres.textContent = r.emoji + ' ' + r.name + ' · ON ' + r.on + '명';
    if (sub) sub.textContent = r.desc;
  }

  function renderSenderChips() {
    var wrap = $('#senderChips');
    if (!wrap) return;
    var html = ['신회장'].concat(STAFF).map(function (name) {
      var p = PEOPLE[name];
      var label = name === '신회장' ? '👑 신회장(대장님)' : p.emoji + ' ' + name;
      return '<button type="button" class="chip' + (name === currentSender ? ' active' : '') + '" data-sender="' + esc(name) + '">' + esc(label) + '</button>';
    }).join('');
    wrap.innerHTML = html;
    var input = $('#msgInput');
    if (input) {
      input.placeholder = currentSender === '신회장'
        ? '대장님 지시를 입력하세요…'
        : currentSender + '로 말하기…';
    }
  }

  function renderMentionChips() {
    var wrap = $('#mentionChips');
    if (!wrap) return;
    var all = ['all'].concat(STAFF);
    wrap.innerHTML = all.map(function (n) {
      return '<button type="button" class="chip mention-chip" data-mention="@' + esc(n) + '">@' + esc(n) + '</button>';
    }).join('');
  }

  /* ---------------- 작업실 ---------------- */

  function renderTasks() {
    var listEl = $('#taskList');
    var sumEl = $('#taskSummary');
    var filterEl = $('#taskFilter');
    if (!listEl) return;

    var counts = { all: db.tasks.length, doing: 0, wait: 0, done: 0 };
    db.tasks.forEach(function (t) { if (counts[t.status] !== undefined) counts[t.status]++; });

    if (sumEl) sumEl.textContent = '진행 ' + counts.doing + ' · 대기 ' + counts.wait + ' · 완료 ' + counts.done;

    if (filterEl) {
      var fdefs = [['all', '전체'], ['doing', '진행중'], ['wait', '대기'], ['done', '완료']];
      filterEl.innerHTML = fdefs.map(function (f) {
        return '<button type="button" class="chip' + (taskFilter === f[0] ? ' active' : '') + '" data-filter="' + f[0] + '">' + f[1] + ' ' + counts[f[0]] + '</button>';
      }).join('');
    }

    var items = db.tasks.filter(function (t) { return taskFilter === 'all' || t.status === taskFilter; });
    items.sort(function (a, b) {
      var order = { doing: 0, wait: 1, done: 2 };
      var d = (order[a.status] || 0) - (order[b.status] || 0);
      return d !== 0 ? d : (b.ts || 0) - (a.ts || 0);
    });

    if (!items.length) {
      listEl.innerHTML = '<div class="empty-state">이 상태의 작업이 없습니다.<br>오른쪽 위 <b>+ 새 작업 지시</b>로 추가해 보세요.</div>';
      return;
    }

    listEl.innerHTML = items.map(function (t) {
      var p = PEOPLE[t.owner] || { emoji: '💬' };
      var done = t.status === 'done';
      return '<div class="task-card' + (done ? ' done' : '') + '" data-id="' + esc(t.id) + '">' +
        '<button type="button" class="task-check" data-act="toggle" aria-label="완료 전환">✓</button>' +
        '<div class="task-main">' +
          '<div class="task-title">' + esc(t.title) + '</div>' +
          '<div class="task-meta"><span class="task-owner">' + esc(p.emoji + ' ' + t.owner) + '</span><span class="task-time">' + esc(fmtTime(t.ts || Date.now())) + '</span></div>' +
        '</div>' +
        '<div class="task-side">' +
          '<button type="button" class="pill ' + esc(t.status) + '" data-act="status">' + esc(TASK_STATUS[t.status] || t.status) + '</button>' +
          '<button type="button" class="task-del" data-act="del" aria-label="삭제">✕</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function addTask(title, owner, status) {
    var task = { id: uid(), title: title, owner: owner, status: status, ts: Date.now() };
    db.tasks.push(task);
    save();
    renderTasks();
    lastTasksSig = tasksSig();

    if (db.settings.backend === 'supabase') {
      sbFetch('tasks', {
        method: 'POST',
        prefer: 'return=representation,resolution=merge-duplicates',
        body: { id: task.id, title: task.title, owner: task.owner, status: task.status }
      }).then(function () {
        conn.state = 'ok';
        updateStatus();
      }).catch(function (err) {
        db.tasks = db.tasks.filter(function (t) { return t.id !== task.id; });
        save();
        renderTasks();
        conn.state = 'err';
        updateStatus();
        toast('작업 저장 실패 · ' + shortErr(err));
      });
    }
  }

  function updateTaskStatus(task, status) {
    task.status = status;
    save();
    renderTasks();
    lastTasksSig = tasksSig();

    if (db.settings.backend !== 'supabase') return;
    sbFetch('tasks?id=eq.' + encodeURIComponent(task.id), {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: { status: status }
    }).then(function () {
      conn.state = 'ok';
      updateStatus();
    }).catch(function (err) {
      conn.state = 'err';
      updateStatus();
      toast('작업 상태 저장 실패 · ' + shortErr(err));
    });
  }

  function deleteTask(task) {
    db.tasks = db.tasks.filter(function (t) { return t.id !== task.id; });
    save();
    renderTasks();
    lastTasksSig = tasksSig();

    if (db.settings.backend !== 'supabase') return;
    sbFetch('tasks?id=eq.' + encodeURIComponent(task.id), {
      method: 'DELETE',
      prefer: 'return=minimal'
    }).then(function () {
      conn.state = 'ok';
      updateStatus();
    }).catch(function (err) {
      conn.state = 'err';
      updateStatus();
      toast('작업 삭제 실패 · ' + shortErr(err));
    });
  }

  /* ---------------- 비서현황 ---------------- */

  function renderStaff() {
    var wrap = $('#staffList');
    if (!wrap) return;
    var rows = [
      { name: '신회장', role: '대장님', status: '지휘', activity: '오늘 지시 3건 · 결정 2건 · 최종 승인 대기 1건', quote: '작업은 짧게, 보고는 한 번에.', leader: true },
      { name: '김비서', role: '총괄 · 실행', status: '활동중', activity: '규라인 09:30 스캔 정리 · 클립·쇼핑 커넥트 태그 점검' },
      { name: '제대리', role: '수급 · 트렌드', status: '활동중', activity: '체험단 신규 스캔 · 브랜드 커넥트 발표 확인' },
      { name: '김대리', role: '주식 · 쇼츠 협업', status: '활동중', activity: '가온칩스 · 에이비엘바이오 · 한미약품 분석 카드 작성' },
      { name: '클대리', role: '추세 · 리스크', status: '활동중', activity: '추세·리스크 점검, 손절선 재설정' },
      { name: '챗대리', role: '아이디어', status: '대기', activity: '쇼츠 훅 아이디어 3개 대기 · 업로드 아이디어 회신 대기' }
    ];
    wrap.innerHTML = rows.map(function (r) {
      var p = PEOPLE[r.name] || { emoji: '👑' };
      var idle = r.status === '대기';
      return '<div class="staff-card' + (r.leader ? ' leader' : '') + '">' +
        '<div class="staff-avatar">' + esc(p.emoji) + (idle ? '' : '<span class="online"></span>') + '</div>' +
        '<div class="staff-info">' +
          '<div class="staff-top"><span class="staff-name">' + esc(r.name) + '</span>' +
            '<span class="staff-role">' + esc(r.role) + '</span>' +
            '<span class="staff-badge' + (idle ? ' idle' : '') + '">' + esc(r.status) + '</span></div>' +
          '<p class="staff-activity">' + esc(r.activity) + '</p>' +
          (r.quote ? '<p class="staff-quote">“' + esc(r.quote) + '”</p>' : '') +
        '</div>' +
        (r.leader ? '' : '<div class="staff-actions"><button type="button" class="staff-cmd" data-cmd="' + esc(r.name) + '">지시</button></div>') +
      '</div>';
    }).join('');
  }

  /* ---------------- 메모 ---------------- */

  function renderMemos() {
    var wrap = $('#memoList');
    var sum = $('#memoSummary');
    if (!wrap) return;
    var memos = db.memos.slice().sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    if (sum) {
      sum.textContent = memos.length + '개 저장됨 · ' +
        (db.settings.backend === 'supabase' ? '실시간 서버 공유' :
         db.settings.backend === 'local' ? '이 기기에 보관' : '서버 연결');
    }

    if (!memos.length) {
      wrap.innerHTML = '<div class="empty-state">저장된 메모가 없습니다.<br>핵심 원칙·종목 기준선·수익화 메모를 카드로 남겨 두세요.</div>';
      return;
    }

    wrap.innerHTML = memos.map(function (m) {
      return '<div class="memo-card" data-tag="' + esc(m.tag) + '" data-id="' + esc(m.id) + '">' +
        '<div class="memo-head"><span class="memo-tag">' + esc(m.tag) + '</span><span class="memo-title">' + esc(m.title) + '</span></div>' +
        '<p class="memo-body">' + esc(m.body) + '</p>' +
        '<div class="memo-foot"><button type="button" data-act="edit">수정</button><button type="button" class="del" data-act="del">삭제</button></div>' +
      '</div>';
    }).join('');
  }

  function openMemoForm(memo) {
    var form = $('#memoForm');
    if (!form) return;
    form.hidden = false;
    editingMemoId = memo ? memo.id : null;
    $('#memoTag').value = memo ? memo.tag : '원칙';
    $('#memoTitle').value = memo ? memo.title : '';
    $('#memoBody').value = memo ? memo.body : '';
    $('#memoSubmit').textContent = memo ? '수정 저장' : '저장';
    $('#memoTitle').focus();
    form.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function closeMemoForm() {
    var form = $('#memoForm');
    if (!form) return;
    form.hidden = true;
    editingMemoId = null;
    $('#memoForm').reset();
    $('#memoSubmit').textContent = '저장';
  }

  function sbSaveMemo(memo) {
    if (db.settings.backend !== 'supabase') return;
    sbFetch('memos', {
      method: 'POST',
      prefer: 'return=representation,resolution=merge-duplicates',
      body: { id: memo.id, category: memo.tag, title: memo.title, body: memo.body }
    }).then(function () {
      conn.state = 'ok';
      updateStatus();
    }).catch(function (err) {
      conn.state = 'err';
      updateStatus();
      toast('메모 저장 실패 · ' + shortErr(err));
    });
  }

  function sbDeleteMemo(id) {
    if (db.settings.backend !== 'supabase') return;
    sbFetch('memos?id=eq.' + encodeURIComponent(id), {
      method: 'DELETE',
      prefer: 'return=minimal'
    }).then(function () {
      conn.state = 'ok';
      updateStatus();
    }).catch(function (err) {
      conn.state = 'err';
      updateStatus();
      toast('메모 삭제 실패 · ' + shortErr(err));
    });
  }

  /* ---------------- 뷰 전환 ---------------- */

  function switchView(view) {
    if (['meeting', 'tasks', 'staff', 'memo'].indexOf(view) < 0) view = 'meeting';
    currentView = view;
    $$('#tabbar .tab').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-view') === view); });
    $$('.view').forEach(function (v) { v.classList.remove('active'); });
    var target = $('#view-' + view);
    if (target) target.classList.add('active');
    if (view === 'meeting') {
      renderChat(true);
      setTimeout(autoGrow, 20);
    }
    save();
  }

  function switchRoom(room) {
    if (!ROOMS[room]) return;
    currentRoom = room;
    renderRoomTabs();
    renderChat(true);
    save();
  }

  /* ---------------- 설정 시트 ---------------- */

  function openSheet() {
    var s = db.settings;
    $('#sbUrl').value = s.sbUrl || SB_DEFAULT_URL;
    $('#sbKey').value = s.sbKey || SB_DEFAULT_KEY;
    $('#settokBase').value = s.settokBase || 'https://chat.gonipro.app';
    $('#settokKey').value = s.settokKey || '';
    $('#settokRoom').value = ROOMS[s.settokRoom] ? s.settokRoom : 'command';
    $('#pollSec').value = s.pollSec || 10;
    $('#customUrl').value = s.customUrl || '';
    $('#demoReply').checked = s.demoReply !== false;
    setBackendSeg(s.backend);
    var res = $('#connResult');
    res.hidden = true;
    res.className = 'hint conn-result';
    res.textContent = '';
    $('#modal').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeSheet() {
    $('#modal').hidden = true;
    document.body.style.overflow = '';
  }

  var HINTS = {
    supabase: '실시간 서버(Supabase)와 연결합니다. 새 글을 3초마다 확인하고, 화면으로 돌아오면 바로 동기화합니다.',
    local: '이 기기 브라우저(localStorage)에만 저장합니다. 서버 없이도 동작하지만 비서들이 읽을 수 없습니다.',
    settok: '셋톡(chat.gonipro.app) 방과 직접 연결합니다. 열쇠는 이 브라우저에만 저장됩니다.',
    custom: '직접 만든 백엔드(프록시)와 연결합니다. 간단한 REST 규격만 맞추면 됩니다.'
  };

  function setBackendSeg(backend) {
    if (['supabase', 'local', 'settok', 'custom'].indexOf(backend) < 0) backend = 'supabase';
    $$('#backendSeg button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-backend') === backend);
    });
    $('#panelSupabase').hidden = backend !== 'supabase';
    $('#panelSettok').hidden = backend !== 'settok';
    $('#panelCustom').hidden = backend !== 'custom';
    $('#backendHint').textContent = HINTS[backend];
    $('#backendSeg').setAttribute('data-value', backend);
  }

  function selectedBackend() {
    return $('#backendSeg').getAttribute('data-value') || 'supabase';
  }

  function readFormSettings() {
    return {
      backend: selectedBackend(),
      sbUrl: $('#sbUrl').value.trim().replace(/\/+$/, '') || SB_DEFAULT_URL,
      sbKey: $('#sbKey').value.trim(),
      settokBase: $('#settokBase').value.trim() || 'https://chat.gonipro.app',
      settokKey: $('#settokKey').value.trim(),
      settokRoom: $('#settokRoom').value || 'command',
      customUrl: $('#customUrl').value.trim(),
      pollSec: Math.max(5, Math.min(120, Number($('#pollSec').value) || 10)),
      demoReply: $('#demoReply').checked
    };
  }

  function showConnResult(ok, msg) {
    var el = $('#connResult');
    el.hidden = false;
    el.className = 'hint conn-result ' + (ok ? 'ok' : 'err');
    el.textContent = msg;
  }

  function testConnection() {
    var f = readFormSettings();
    showConnResult(true, '확인 중…');
    if (f.backend === 'local') {
      showConnResult(true, '로컬 모드 — 저장소 정상. 바로 사용할 수 있습니다.');
      return;
    }
    if (f.backend === 'supabase') {
      if (!f.sbKey) { showConnResult(false, 'Publishable Key를 먼저 입력해 주세요.'); return; }
      var probe = function (path) {
        return fetch(f.sbUrl + '/rest/v1/' + path, {
          headers: { apikey: f.sbKey, Authorization: 'Bearer ' + f.sbKey, Accept: 'application/json', Prefer: 'count=exact' },
          cache: 'no-store'
        });
      };
      Promise.all([probe('messages?select=id&limit=1'), probe('tasks?select=id&limit=1'), probe('memos?select=id&limit=1')])
        .then(function (rs) {
          var bad = rs.filter(function (r) { return !r.ok; })[0];
          if (bad) throw new Error('HTTP ' + bad.status);
          var counts = rs.map(function (r) {
            var cr = r.headers.get('content-range') || '';
            var m = cr.match(/\/(\d+)$/);
            return m ? m[1] : '?';
          });
          showConnResult(true, '연결 성공 · 메시지 ' + counts[0] + ' · 작업 ' + counts[1] + ' · 메모 ' + counts[2] + '건');
        })
        .catch(function (e) {
          showConnResult(false, '연결 실패 · ' + shortErr(e) + '\nURL·Key를 확인해 주세요.');
        });
      return;
    }
    if (f.backend === 'settok') {
      if (!f.settokKey) { showConnResult(false, '열쇠(k)를 먼저 입력해 주세요.'); return; }
      var url = (f.settokBase || '').replace(/\/+$/, '') + '/api/msgs?k=' + encodeURIComponent(f.settokKey) + '&since=0';
      fetch(url, { cache: 'no-store' })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function (d) {
          var n = (d && Array.isArray(d.msgs)) ? d.msgs.length : 0;
          showConnResult(true, '연결 성공 · 메시지 ' + n + '건을 읽었습니다.' + (d && d.brain === false ? '\n뇌 공유 꺼짐(brain.on=false) 상태입니다.' : ''));
        })
        .catch(function (e) {
          showConnResult(false, '연결 실패 · ' + shortErr(e) + '\n브라우저 직접 호출이 막혀 있으면(CORS) 직접 URL(프록시)을 쓰세요.');
        });
      return;
    }
    if (!f.customUrl) { showConnResult(false, '백엔드 URL을 입력해 주세요.'); return; }
    fetch(f.customUrl.replace(/\/+$/, '') + '/messages?since=0', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function () { showConnResult(true, '연결 성공 · 백엔드가 응답했습니다.'); })
      .catch(function (e) { showConnResult(false, '연결 실패 · ' + shortErr(e)); });
  }

  function saveSettings() {
    var f = readFormSettings();
    var prev = db.settings.backend;
    var prevUrl = String(db.settings.sbUrl || '');
    var prevKey = String(db.settings.sbKey || '');
    db.settings.backend = f.backend;
    db.settings.sbUrl = f.sbUrl;
    db.settings.sbKey = f.sbKey;
    db.settings.settokBase = f.settokBase;
    db.settings.settokKey = f.settokKey;
    db.settings.settokRoom = f.settokRoom;
    db.settings.pollSec = f.pollSec;
    db.settings.customUrl = f.customUrl;
    db.settings.demoReply = f.demoReply;
    db.settings.sinceId = 0;

    var targetChanged = prev === 'supabase' && (prevUrl !== f.sbUrl || prevKey !== f.sbKey);
    if (prev !== f.backend || targetChanged) {
      // 백엔드/서버 주소가 바뀌면 캐시와 마지막 id를 그 서버 기준으로 다시 잡는다.
      db.rooms = emptyRooms();
      db.tasks = [];
      db.memos = [];
      db.settings.sbLastId = 0;
      db.settings.sbSeeded = false;
      sbBooted = false;
      lastTasksSig = '';
      lastMemosSig = '';
      if (f.backend === 'local') fillLocalSeed(db);
    }
    saveNow();
    renderAll();
    startPolling();
    switchView(currentView);
    closeSheet();

    if (f.backend === 'supabase') toast(f.sbKey ? '실시간 서버 연결을 시작합니다' : 'Key를 입력하면 연결됩니다');
    else if (f.backend === 'local') toast('로컬 모드로 저장했습니다');
    else if (f.backend === 'settok') toast(f.settokKey ? '셋톡 연결을 시작합니다' : '열쇠를 입력하면 연결됩니다');
    else toast(f.customUrl ? '백엔드 연결을 시작합니다' : 'URL을 입력하면 연결됩니다');
  }

  function exportData() {
    try {
      var blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      var d = new Date();
      a.href = url;
      a.download = '신회장-비서실-백업-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
      toast('백업 파일을 내려받았습니다');
    } catch (e) {
      toast('내보내기에 실패했습니다');
    }
  }

  function resetAll() {
    var server = db.settings.backend === 'supabase';
    var ask = server
      ? '이 기기에 쌓인 화면 캐시를 비우고 서버에서 다시 불러옵니다. 서버의 대화·작업·메모는 지워지지 않습니다. 계속할까요?'
      : '회의실 대화·작업·메모를 모두 지우고 처음 상태로 돌아갑니다. 계속할까요?';
    if (!window.confirm(ask)) return;
    try { localStorage.removeItem(STORE_KEY); } catch (e) {}
    stopPolling();
    db = seedDB();
    currentView = 'meeting';
    currentRoom = 'command';
    currentSender = '신회장';
    taskFilter = 'all';
    typingState = { hall: [], command: [], lounge: [] };
    conn = { state: 'idle', message: '' };
    sbBooted = false;
    lastTasksSig = '';
    lastMemosSig = '';
    renderAll();
    switchView('meeting');
    switchRoom('command');
    startPolling();
    closeSheet();
    toast('처음 상태로 되돌렸습니다');
  }

  /* ---------------- 입력 보조 ---------------- */

  function autoGrow() {
    var el = $('#msgInput');
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 112) + 'px';
  }

  function insertAtCaret(text) {
    var el = $('#msgInput');
    if (!el) return;
    var start = typeof el.selectionStart === 'number' ? el.selectionStart : el.value.length;
    var end = typeof el.selectionEnd === 'number' ? el.selectionEnd : el.value.length;
    var before = el.value.slice(0, start);
    var after = el.value.slice(end);
    var pad = before && !/\s$/.test(before) ? ' ' : '';
    el.value = before + pad + text + ' ' + after;
    var pos = (before + pad + text + ' ').length;
    el.focus();
    try { el.setSelectionRange(pos, pos); } catch (e) {}
    autoGrow();
  }

  function commandTo(name) {
    currentSender = '신회장';
    switchView('meeting');
    switchRoom('command');
    renderSenderChips();
    insertAtCaret('@' + name + ' ');
    var input = $('#msgInput');
    if (input) input.focus();
  }

  /* ---------------- 렌더 전체 ---------------- */

  function renderAll() {
    renderRoomTabs();
    renderChat(true);
    renderSenderChips();
    renderMentionChips();
    renderTasks();
    renderStaff();
    renderMemos();
    updateStatus();
    $$('#tabbar .tab').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-view') === currentView); });
    $$('.view').forEach(function (v) { v.classList.toggle('active', v.id === 'view-' + currentView); });
  }

  /* ---------------- 이벤트 ---------------- */

  function bind() {
    $('#tabbar').addEventListener('click', function (e) {
      var b = e.target.closest('.tab');
      if (b) switchView(b.getAttribute('data-view'));
    });

    $('#roomTabs').addEventListener('click', function (e) {
      var b = e.target.closest('.room-tab');
      if (b) switchRoom(b.getAttribute('data-room'));
    });

    $('#senderChips').addEventListener('click', function (e) {
      var b = e.target.closest('[data-sender]');
      if (!b) return;
      currentSender = b.getAttribute('data-sender');
      renderSenderChips();
      var input = $('#msgInput');
      if (input) input.focus();
      if (db.settings.backend === 'settok' && db.settings.settokKey && currentSender !== '신회장') {
        toast('셋톡은 저장된 열쇠 주인 이름으로 전송됩니다');
      }
    });

    $('#mentionChips').addEventListener('click', function (e) {
      var b = e.target.closest('[data-mention]');
      if (b) insertAtCaret(b.getAttribute('data-mention'));
    });

    $('#sendBtn').addEventListener('click', handleSend);

    var input = $('#msgInput');
    input.addEventListener('input', autoGrow);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        handleSend();
      }
    });

    $('#addTaskBtn').addEventListener('click', function () {
      var form = $('#taskForm');
      form.hidden = !form.hidden;
      if (!form.hidden) $('#taskTitle').focus();
    });
    $('#cancelTaskBtn').addEventListener('click', function () {
      $('#taskForm').reset();
      $('#taskForm').hidden = true;
    });
    $('#taskForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var title = $('#taskTitle').value.trim();
      if (!title) { toast('작업 내용을 입력해 주세요'); return; }
      addTask(title, $('#taskOwner').value, $('#taskStatus').value);
      $('#taskForm').reset();
      $('#taskForm').hidden = true;
      toast('작업을 등록했습니다');
    });

    $('#taskFilter').addEventListener('click', function (e) {
      var b = e.target.closest('[data-filter]');
      if (!b) return;
      taskFilter = b.getAttribute('data-filter');
      renderTasks();
      save();
    });

    $('#taskList').addEventListener('click', function (e) {
      var card = e.target.closest('.task-card');
      if (!card) return;
      var id = card.getAttribute('data-id');
      var act = e.target.closest('[data-act]');
      if (!act) return;
      var task = db.tasks.filter(function (t) { return t.id === id; })[0];
      if (!task) return;
      var kind = act.getAttribute('data-act');
      if (kind === 'toggle') {
        updateTaskStatus(task, task.status === 'done' ? 'doing' : 'done');
      } else if (kind === 'status') {
        var i = TASK_CYCLE.indexOf(task.status);
        updateTaskStatus(task, TASK_CYCLE[(i + 1) % TASK_CYCLE.length]);
      } else if (kind === 'del') {
        if (!window.confirm('이 작업을 지울까요?')) return;
        deleteTask(task);
      }
      return;
    });

    $('#staffList').addEventListener('click', function (e) {
      var b = e.target.closest('[data-cmd]');
      if (b) commandTo(b.getAttribute('data-cmd'));
    });

    $('#addMemoBtn').addEventListener('click', function () {
      var form = $('#memoForm');
      if (!form.hidden && !editingMemoId) { form.hidden = true; return; }
      openMemoForm(null);
    });
    $('#cancelMemoBtn').addEventListener('click', closeMemoForm);

    $('#memoForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var title = $('#memoTitle').value.trim();
      var body = $('#memoBody').value.trim();
      var tag = $('#memoTag').value;
      if (!title) { toast('제목을 입력해 주세요'); return; }
      if (!body) { toast('내용을 입력해 주세요'); return; }
      if (editingMemoId) {
        var edited = null;
        db.memos.forEach(function (m) {
          if (m.id === editingMemoId) { m.title = title; m.body = body; m.tag = tag; edited = m; }
        });
        if (edited) sbSaveMemo(edited);
        toast('메모를 수정했습니다');
      } else {
        var memo = { id: uid(), tag: tag, title: title, body: body, ts: Date.now() };
        db.memos.push(memo);
        sbSaveMemo(memo);
        toast('메모를 저장했습니다');
      }
      save();
      lastMemosSig = memosSig();
      closeMemoForm();
      renderMemos();
    });

    $('#memoList').addEventListener('click', function (e) {
      var card = e.target.closest('.memo-card');
      if (!card) return;
      var id = card.getAttribute('data-id');
      var act = e.target.closest('[data-act]');
      if (!act) return;
      var memo = db.memos.filter(function (m) { return m.id === id; })[0];
      if (!memo) return;
      if (act.getAttribute('data-act') === 'edit') {
        openMemoForm(memo);
      } else if (act.getAttribute('data-act') === 'del') {
        if (!window.confirm('이 메모를 지울까요?')) return;
        db.memos = db.memos.filter(function (m) { return m.id !== id; });
        sbDeleteMemo(id);
        save();
        lastMemosSig = memosSig();
        renderMemos();
        toast('메모를 지웠습니다');
      }
    });

    $('#menuBtn').addEventListener('click', openSheet);
    $('#closeModalBtn').addEventListener('click', closeSheet);
    $('#modal').addEventListener('click', function (e) {
      if (e.target === $('#modal')) closeSheet();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('#modal').hidden) closeSheet();
    });

    $('#backendSeg').addEventListener('click', function (e) {
      var b = e.target.closest('[data-backend]');
      if (b) setBackendSeg(b.getAttribute('data-backend'));
    });

    $('#testConnBtn').addEventListener('click', testConnection);
    $('#saveSettingsBtn').addEventListener('click', saveSettings);
    $('#exportBtn').addEventListener('click', exportData);
    $('#resetBtn').addEventListener('click', resetAll);

    window.addEventListener('pagehide', saveNow);
    window.addEventListener('beforeunload', saveNow);
    window.addEventListener('load', function () {
      if (currentView === 'meeting') stickToBottom();
    });
    window.addEventListener('resize', function () {
      if (currentView === 'meeting') stickToBottom();
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        stopPolling();
      } else {
        resumeSync();
      }
    });
    window.addEventListener('focus', function () {
      if (!document.hidden) resumeSync();
    });
    window.addEventListener('online', resumeSync);
  }

  /* ---------------- 시작 ---------------- */

  function resumeSync() {
    if (db.settings.backend !== 'supabase') {
      if (!pollTimer) startPolling();
      return;
    }
    if (!sbReady()) { updateStatus(); return; }
    if (!pollTimer) startPolling();
    sbPoll(true);
  }

  function init() {
    bind();
    renderAll();
    switchView(currentView);
    switchRoom(currentRoom);
    setTimeout(autoGrow, 30);
    setTimeout(function () { if (currentView === 'meeting') stickToBottom(); }, 300);
    startPolling();
    saveNow();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
