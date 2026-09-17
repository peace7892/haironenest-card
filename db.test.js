const { test } = require('node:test');
const assert = require('node:assert/strict');
global.Store = require('./store.js');
const DB = require('./db.js');
const { createState, addCustomer, addVisit, chargePass, markToday, setSettings, editVisit, purgeVisit } = global.Store;

test('바뀐 게 없으면 서버에 보낼 것도 없다', () => {
  const s = createState();
  assert.deepEqual(DB.diff(s, s), []);
});

test('고객을 만들면 고객 표에 한 줄 올리고, nextId가 바뀌어 설정도 올린다', () => {
  const s0 = createState();
  const { state: s1 } = addCustomer(s0, { name: '김OO', phone: '010-1111-0001', isLegacy: true });
  const ops = DB.diff(s0, s1);
  const cust = ops.find(o => o.table === 'card_customers');
  assert.equal(cust.upsert.length, 1);
  assert.equal(cust.upsert[0].phone, '01011110001');
  assert.equal(cust.upsert[0].is_legacy, true);
  assert.equal(ops.find(o => o.table === 'card_settings').upsert[0].data.nextId, 2);
});

test('방문 기록을 고치면 그 줄만 올라가고, 완전히 지우면 지우기 명령이 나간다', () => {
  let { state: s, customer } = addCustomer(createState(), { name: '김OO', phone: '01011110001' });
  let visit;
  ({ state: s, visit } = addVisit(s, customer.id, { done: '커트', kinds: ['커트'] }, '2026-09-19T11:00:00'));
  const { state: s2 } = editVisit(s, visit.id, { done: '커트, 앞머리', next: '', kinds: ['커트'] }, '2026-09-19T12:00:00');
  const ops = DB.diff(s, s2);
  assert.deepEqual(ops.map(o => o.table), ['card_visits']);
  assert.equal(ops[0].upsert[0].done, '커트, 앞머리');
  assert.equal(ops[0].upsert[0].history.length, 1);
  const { state: s3 } = purgeVisit(s2, visit.id);
  assert.deepEqual(DB.diff(s2, s3), [{ table: 'card_visits', delete: [visit.id] }]);
});

test('오늘 명단·정액권·설정은 각자 표로 간다', () => {
  let { state: s, customer } = addCustomer(createState(), { name: '김OO', phone: '01011110001' });
  const base = s;
  ({ state: s } = markToday(s, customer.id, '2026-09-19', '10:00'));
  ({ state: s } = chargePass(s, customer.id, { amount: '150000', note: '' }, '2026-09-19T10:00:00'));
  ({ state: s } = setSettings(s, { head: '안녕하세요' }));
  const tables = DB.diff(base, s).map(o => o.table).sort();
  assert.deepEqual(tables, ['card_passes', 'card_settings', 'card_today']);
  const today = DB.diff(base, s).find(o => o.table === 'card_today').upsert[0];
  assert.equal(today.date, '2026-09-19');
  assert.equal(today.entries[0].customerId, customer.id);
});

test('표에서 읽은 줄을 조립하면 앱 상태가 되고, 다시 diff하면 보낼 게 없다', () => {
  let { state: s, customer } = addCustomer(createState(), { name: '김OO', phone: '01011110001', isLegacy: true });
  ({ state: s } = addVisit(s, customer.id, { done: '커트', kinds: ['커트'] }, '2026-09-19T11:00:00'));
  ({ state: s } = markToday(s, customer.id, '2026-09-19', '10:00'));
  const ops = DB.diff({ ...createState(), settings: null }, s);
  const rows = {};
  for (const op of ops) rows[op.table] = [...(rows[op.table] ?? []), ...(op.upsert ?? [])];
  const back = DB.assemble(rows, '2026-09-19');
  assert.deepEqual(back, s);
  assert.deepEqual(DB.diff(s, back), []);
});

test('표가 비어 있으면 빈 상태로 시작하고, nextId는 가장 큰 id보다 크다', () => {
  const empty = DB.assemble({}, '2026-09-19');
  assert.deepEqual(empty, createState());
  const withRows = DB.assemble({ card_customers: [{ id: 7, name: '김OO', phone: '', profile: { talk: '', hair: '' }, profile_history: [] }] }, '2026-09-19');
  assert.equal(withRows.nextId, 8);
});
