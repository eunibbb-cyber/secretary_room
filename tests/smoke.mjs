/* 👑 신회장 비서실 — Supabase 연결 스모크 테스트
   실행: node tests/smoke.mjs
   - 앱이 쓰는 것과 같은 REST 경로를 그대로 호출해 읽기/쓰기/증분조회/삭제를 확인한다.
   - 스스로 만든 행만 지운다. 기존 대화·작업·메모는 건드리지 않는다.
   - 환경변수로 다른 프로젝트를 쓸 수 있다: SUPABASE_URL, SUPABASE_KEY
*/
const URL_BASE = (process.env.SUPABASE_URL || 'https://qrkgbextxzgodywukesd.supabase.co').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_KEY || 'sb_publishable_cfbG03z_wFN7yWMSTAmy0Q_4o9-kiaM';
const REST = URL_BASE + '/rest/v1/';

const stamp = Date.now().toString(36);
const taskId = 'smoke-task-' + stamp;
const memoId = 'smoke-memo-' + stamp;
const body = '스모크 테스트 ' + stamp;

let pass = 0;
let fail = 0;

function check(name, ok, extra = '') {
  if (ok) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (extra ? '  — ' + extra : '')); }
}

async function api(path, opts = {}) {
  const res = await fetch(REST + path, {
    method: opts.method || 'GET',
    headers: {
      apikey: KEY,
      Authorization: 'Bearer ' + KEY,
      Accept: 'application/json',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.prefer ? { Prefer: opts.prefer } : {})
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: 'no-store'
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  return { ok: res.ok, status: res.status, data, range: res.headers.get('content-range') };
}

async function main() {
  const tables = ['messages', 'tasks', 'memos'];
  for (const t of tables) {
    const r = await api(t + '?select=id&limit=1', { prefer: 'count=exact' });
    check('읽기 · ' + t, r.ok, 'HTTP ' + r.status);
  }

  // 메시지: 삽입 → 증분 조회(id=gt) → 삭제
  const ins = await api('messages', {
    method: 'POST',
    prefer: 'return=representation',
    body: { room: 'command', sender: '김비서', body: body }
  });
  const row = Array.isArray(ins.data) ? ins.data[0] : null;
  check('메시지 저장(POST /messages)', ins.ok && row && row.id > 0, 'HTTP ' + ins.status);

  if (row) {
    const inc = await api('messages?select=id,room,sender,body,created_at&id=gt.' + (row.id - 1) + '&order=id.asc&limit=5');
    check('증분 조회(id=gt.{lastId})', inc.ok && inc.data.some((m) => m.id === row.id), 'HTTP ' + inc.status);
    const del = await api('messages?id=eq.' + row.id, { method: 'DELETE', prefer: 'return=minimal' });
    check('메시지 삭제(DELETE)', del.ok || del.status === 204, 'HTTP ' + del.status);
  }

  // 작업: upsert → PATCH → DELETE
  const up = await api('tasks', {
    method: 'POST',
    prefer: 'return=representation,resolution=merge-duplicates',
    body: { id: taskId, title: '스모크 ' + stamp, owner: '김비서', status: 'doing' }
  });
  check('작업 저장(POST upsert)', up.ok, 'HTTP ' + up.status);

  const patched = await api('tasks?id=eq.' + taskId, { method: 'PATCH', prefer: 'return=representation', body: { status: 'done' } });
  check('작업 상태 변경(PATCH)', patched.ok && Array.isArray(patched.data) && patched.data[0] && patched.data[0].status === 'done',
    'HTTP ' + patched.status);

  const tdel = await api('tasks?id=eq.' + taskId, { method: 'DELETE', prefer: 'return=minimal' });
  check('작업 삭제(DELETE)', tdel.ok || tdel.status === 204, 'HTTP ' + tdel.status);

  // 메모: upsert → PATCH → DELETE
  const mup = await api('memos', {
    method: 'POST',
    prefer: 'return=representation,resolution=merge-duplicates',
    body: { id: memoId, category: '기타', title: '스모크 ' + stamp, body: '본문' }
  });
  check('메모 저장(POST upsert)', mup.ok, 'HTTP ' + mup.status);

  const mpatched = await api('memos?id=eq.' + memoId, { method: 'PATCH', prefer: 'return=representation', body: { body: '수정 본문' } });
  check('메모 수정(PATCH)', mpatched.ok && mpatched.data[0] && mpatched.data[0].body === '수정 본문', 'HTTP ' + mpatched.status);

  const mdel = await api('memos?id=eq.' + memoId, { method: 'DELETE', prefer: 'return=minimal' });
  check('메모 삭제(DELETE)', mdel.ok || mdel.status === 204, 'HTTP ' + mdel.status);

  console.log('\n' + pass + '/' + (pass + fail) + ' passed');
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error('스모크 테스트 실패:', e && e.message ? e.message : e);
  process.exit(1);
});
