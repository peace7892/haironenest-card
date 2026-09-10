const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createState, addCustomer, findCustomers, setProfile, addVisit, editVisit, visitsOf, markToday, todayList, serialize, deserialize } = require('./store.js');

test('이름과 뒤 4자리로 고객을 만든다', () => {
  const s0 = createState();
  const { state, customer } = addCustomer(s0, { name: '김OO', last4: '1234' });
  assert.equal(customer.name, '김OO');
  assert.equal(customer.last4, '1234');
  assert.equal(state.customers.length, 1);
  assert.equal(s0.customers.length, 0, '원래 상태는 바뀌지 않는다');
});

test('이름이 비어 있으면 고객을 만들지 않는다', () => {
  assert.throws(() => addCustomer(createState(), { name: '  ', last4: '1234' }), /이름/);
});

test('뒤 4자리는 비워도 되지만, 적으면 숫자 4개여야 한다', () => {
  const ok = addCustomer(createState(), { name: '이OO', last4: '' });
  assert.equal(ok.customer.last4, '');
  assert.throws(() => addCustomer(createState(), { name: '이OO', last4: '12a' }), /4자리/);
});

test('이름 일부로 고객을 찾고, 없는 이름이면 빈 목록', () => {
  let { state } = addCustomer(createState(), { name: '김OO', last4: '1234' });
  ({ state } = addCustomer(state, { name: '김OO', last4: '5678' }));
  ({ state } = addCustomer(state, { name: '이OO', last4: '9999' }));
  assert.deepEqual(findCustomers(state, '김').map(c => c.last4), ['1234', '5678']);
  assert.deepEqual(findCustomers(state, '5678').map(c => c.name), ['김OO'], '뒤 4자리로도 찾는다');
  assert.deepEqual(findCustomers(state, '박'), []);
});


test('저장했다가 꺼내면 같은 상태가 돌아온다', () => {
  const { state } = addCustomer(createState(), { name: '김OO', last4: '1234' });
  const restored = deserialize(serialize(state));
  assert.deepEqual(restored, state);
});

test('저장된 것이 없거나 깨져 있으면 빈 상태로 시작한다', () => {
  assert.deepEqual(deserialize(null), createState());
  assert.deepEqual(deserialize(''), createState());
  assert.deepEqual(deserialize('{not json'), createState());
});

function twoCustomers() {
  let { state, customer: kim } = addCustomer(createState(), { name: '김OO', last4: '1234' });
  let lee;
  ({ state, customer: lee } = addCustomer(state, { name: '이OO', last4: '5678' }));
  return { state, kim, lee };
}

test('새 고객의 고정 정보 두 칸은 비어 있다', () => {
  const { kim } = twoCustomers();
  assert.deepEqual(kim.profile, { talk: '', hair: '' });
});

test('고정 정보를 적고, 고치면 이전 내용이 이력에 남는다', () => {
  let { state, kim } = twoCustomers();
  ({ state } = setProfile(state, kim.id, { talk: '아침에 5분밖에 못 씀', hair: '가는 모질' }, '2026-09-11T09:00:00'));
  ({ state } = setProfile(state, kim.id, { talk: '아침에 5분밖에 못 씀. 직장 옮김', hair: '가는 모질' }, '2026-09-12T09:00:00'));
  const c = state.customers.find(x => x.id === kim.id);
  assert.equal(c.profile.talk, '아침에 5분밖에 못 씀. 직장 옮김');
  assert.deepEqual(c.profileHistory, [{ talk: '아침에 5분밖에 못 씀', hair: '가는 모질', replacedAt: '2026-09-12T09:00:00' }]);
});

test('고정 정보를 처음 적을 때(빈 상태에서)는 이력을 남기지 않는다', () => {
  let { state, kim } = twoCustomers();
  ({ state } = setProfile(state, kim.id, { talk: 'a', hair: '' }, '2026-09-11T09:00:00'));
  assert.deepEqual(state.customers.find(x => x.id === kim.id).profileHistory, []);
});

test('방문 기록은 시술 내용이 필수이고 다음 방향은 비워도 된다', () => {
  let { state, kim } = twoCustomers();
  let visit;
  ({ state, visit } = addVisit(state, kim.id, { done: '탑 볼륨, 언더 무게 뺌', next: '' }, '2026-09-11T10:00:00'));
  assert.equal(visit.next, '');
  assert.throws(() => addVisit(state, kim.id, { done: ' ', next: '길이 유지' }, '2026-09-11T10:00:00'), /시술/);
});

test('방문 기록은 고객별로 최신순', () => {
  let { state, kim, lee } = twoCustomers();
  ({ state } = addVisit(state, kim.id, { done: '첫째', next: '' }, '2026-09-11T10:00:00'));
  ({ state } = addVisit(state, kim.id, { done: '둘째', next: '길이 유지' }, '2026-09-12T10:00:00'));
  ({ state } = addVisit(state, lee.id, { done: '단발', next: '' }, '2026-09-12T11:00:00'));
  assert.deepEqual(visitsOf(state, kim.id).map(v => v.done), ['둘째', '첫째']);
  assert.deepEqual(visitsOf(state, lee.id).map(v => v.done), ['단발']);
});

test('방문 기록을 고치면 이전 두 칸이 이력에 남는다', () => {
  let { state, kim } = twoCustomers();
  let visit;
  ({ state, visit } = addVisit(state, kim.id, { done: '탑 볼륨', next: '' }, '2026-09-11T10:00:00'));
  ({ state } = editVisit(state, visit.id, { done: '탑 볼륨, 언더 무게 뺌', next: '길이 유지' }, '2026-09-11T20:00:00'));
  const [v] = visitsOf(state, kim.id);
  assert.equal(v.done, '탑 볼륨, 언더 무게 뺌');
  assert.equal(v.next, '길이 유지');
  assert.deepEqual(v.history, [{ done: '탑 볼륨', next: '', replacedAt: '2026-09-11T20:00:00' }]);
});

test('오늘 명단에 올리면 한 번만 들어가고, 날짜가 바뀌면 명단이 새로 시작된다', () => {
  let { state, kim, lee } = twoCustomers();
  ({ state } = markToday(state, kim.id, '2026-09-11'));
  ({ state } = markToday(state, kim.id, '2026-09-11'));
  ({ state } = markToday(state, lee.id, '2026-09-11'));
  assert.deepEqual(todayList(state, '2026-09-11').map(t => t.customer.id), [kim.id, lee.id]);
  ({ state } = markToday(state, lee.id, '2026-09-12'));
  assert.deepEqual(todayList(state, '2026-09-12').map(t => t.customer.id), [lee.id]);
});

test('오늘 명단은 오늘 방문 기록을 남겼는지와 지난번 다음 방향을 함께 준다', () => {
  let { state, kim, lee } = twoCustomers();
  ({ state } = addVisit(state, kim.id, { done: '지난번', next: '다음엔 볼륨펌' }, '2026-05-01T10:00:00'));
  ({ state } = markToday(state, kim.id, '2026-09-11'));
  ({ state } = markToday(state, lee.id, '2026-09-11'));
  ({ state } = addVisit(state, kim.id, { done: '오늘 볼륨펌', next: '' }, '2026-09-11T14:00:00'));
  const list = todayList(state, '2026-09-11');
  assert.equal(list[0].recorded, true);
  assert.equal(list[0].lastNext, '다음엔 볼륨펌', '오늘 것 말고 지난번 다음 방향');
  assert.equal(list[1].recorded, false);
  assert.equal(list[1].lastNext, '');
});

test('이전 버전(자유 메모 한 칸) 저장 데이터를 열면 방문 기록으로 옮겨진다', () => {
  const old = JSON.stringify({ nextId: 4, customers: [{ id: 1, name: '김OO', last4: '1234' }],
    memos: [{ id: 2, customerId: 1, text: '옛 메모', createdAt: '2026-09-10T10:00:00', history: [{ text: '더 옛', replacedAt: '2026-09-10T11:00:00' }] }] });
  const state = deserialize(old);
  const [v] = visitsOf(state, 1);
  assert.equal(v.done, '옛 메모');
  assert.deepEqual(v.history, [{ done: '더 옛', next: '', replacedAt: '2026-09-10T11:00:00' }]);
  assert.deepEqual(state.customers[0].profile, { talk: '', hair: '' });
  assert.deepEqual(deserialize(serialize(state)), state);
});
