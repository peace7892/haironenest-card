const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createState, addCustomer, editCustomer, deleteCustomer, restoreCustomer, purgeCustomer, deletedCustomers, maskPhone, findCustomers, setProfile, addVisit, editVisit, visitsOf, markToday, setTodayTime, unmarkToday, todayList, serialize, deserialize } = require('./store.js');

test('이름과 전화번호로 고객을 만든다', () => {
  const s0 = createState();
  const { state, customer } = addCustomer(s0, { name: '김OO', phone: '01012341234' });
  assert.equal(customer.name, '김OO');
  assert.equal(customer.phone, '01012341234');
  assert.equal(state.customers.length, 1);
  assert.equal(s0.customers.length, 0, '원래 상태는 바뀌지 않는다');
});

test('이름이 비어 있으면 고객을 만들지 않는다', () => {
  assert.throws(() => addCustomer(createState(), { name: '  ', phone: '01012341234' }), /이름/);
});

test('이름 일부로 고객을 찾고, 없는 이름이면 빈 목록', () => {
  let { state } = addCustomer(createState(), { name: '김OO', phone: '01011111234' });
  ({ state } = addCustomer(state, { name: '김OO', phone: '01022225678' }));
  ({ state } = addCustomer(state, { name: '이OO', phone: '01033339999' }));
  assert.deepEqual(findCustomers(state, '김').map(c => c.phone.slice(-4)), ['1234', '5678']);
  assert.deepEqual(findCustomers(state, '5678').map(c => c.name), ['김OO'], '뒤 4자리로도 찾는다');
  assert.deepEqual(findCustomers(state, '박'), []);
});


test('저장했다가 꺼내면 같은 상태가 돌아온다', () => {
  const { state } = addCustomer(createState(), { name: '김OO', phone: '01012341234' });
  const restored = deserialize(serialize(state));
  assert.deepEqual(restored, state);
});

test('저장된 것이 없거나 깨져 있으면 빈 상태로 시작한다', () => {
  assert.deepEqual(deserialize(null), createState());
  assert.deepEqual(deserialize(''), createState());
  assert.deepEqual(deserialize('{not json'), createState());
});

function twoCustomers() {
  let { state, customer: kim } = addCustomer(createState(), { name: '김OO', phone: '01011111234' });
  let lee;
  ({ state, customer: lee } = addCustomer(state, { name: '이OO', phone: '01022225678' }));
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

test('전화번호는 전체를 저장하고, 숫자만 남긴다', () => {
  const { customer } = addCustomer(createState(), { name: '김OO', phone: '010-1234-5678' });
  assert.equal(customer.phone, '01012345678');
});

test('전화번호를 적으면 10~11자리 숫자여야 하고, 비워도 된다', () => {
  assert.throws(() => addCustomer(createState(), { name: '김OO', phone: '1234' }), /전화번호/);
  assert.equal(addCustomer(createState(), { name: '김OO', phone: '' }).customer.phone, '');
});

test('같은 전화번호로 두 명을 만들 수 없다', () => {
  const { state } = addCustomer(createState(), { name: '김OO', phone: '01012345678' });
  assert.throws(() => addCustomer(state, { name: '박OO', phone: '010-1234-5678' }), /이미/);
});

test('이름과 전화번호를 고칠 수 있고, 다른 고객 번호와 겹치면 거부한다', () => {
  let { state, customer: kim } = addCustomer(createState(), { name: '김OO', phone: '01012345678' });
  ({ state } = addCustomer(state, { name: '이OO', phone: '01099998888' }));
  ({ state } = editCustomer(state, kim.id, { name: '김OO(교사)', phone: '010-1111-2222' }));
  const c = state.customers.find(x => x.id === kim.id);
  assert.equal(c.name, '김OO(교사)');
  assert.equal(c.phone, '01011112222');
  assert.throws(() => editCustomer(state, kim.id, { name: '김OO', phone: '01099998888' }), /이미/);
});

test('번호 일부(뒤 4자리든 앞자리든)로 찾는다', () => {
  let { state } = addCustomer(createState(), { name: '김OO', phone: '01012345678' });
  ({ state } = addCustomer(state, { name: '이OO', phone: '01099995678' }));
  assert.equal(findCustomers(state, '5678').length, 2);
  assert.deepEqual(findCustomers(state, '9999').map(c => c.name), ['이OO']);
  assert.deepEqual(findCustomers(state, '010-1234').map(c => c.name), ['김OO']);
});

test('가린 번호는 앞 3자리와 뒤 4자리만 보인다', () => {
  assert.equal(maskPhone('01012345678'), '010-****-5678');
  assert.equal(maskPhone('0212345678'), '021-***-5678');
  assert.equal(maskPhone('1234'), '****-1234', '옛 뒤 4자리 데이터');
  assert.equal(maskPhone(''), '');
});

test('옛 데이터의 뒤 4자리(last4)는 phone으로 옮겨져 그대로 보인다', () => {
  const old = JSON.stringify({ nextId: 2, customers: [{ id: 1, name: '김OO', last4: '1234' }], memos: [] });
  const state = deserialize(old);
  assert.equal(state.customers[0].phone, '1234');
  assert.equal(state.customers[0].last4, undefined);
  assert.deepEqual(findCustomers(state, '1234').map(c => c.name), ['김OO']);
});

test('소개해 준 분을 적을 수 있고, 비워도 된다', () => {
  const { customer } = addCustomer(createState(), { name: '김OO', phone: '01012345678', referrer: ' 박OO 언니 ' });
  assert.equal(customer.referrer, '박OO 언니');
  assert.equal(addCustomer(createState(), { name: '이OO', phone: '' }).customer.referrer, '');
});

test('소개해 준 분을 나중에 고칠 수 있다', () => {
  let { state, customer } = addCustomer(createState(), { name: '김OO', phone: '01012345678' });
  ({ state } = editCustomer(state, customer.id, { name: '김OO', phone: '01012345678', referrer: '블로그 보고' }));
  assert.equal(state.customers[0].referrer, '블로그 보고');
});

test('옛 데이터에는 소개 칸이 빈 값으로 생긴다', () => {
  const state = deserialize(JSON.stringify({ nextId: 2, customers: [{ id: 1, name: '김OO', phone: '01012345678' }], visits: [] }));
  assert.equal(state.customers[0].referrer, '');
});

// ---- 고객 지우기 ---------------------------------------------------------

// 방문 기록 1건과 오늘 명단까지 올라간 고객 한 명을 만들어 둔다.
function oneWithVisit() {
  let { state, customer } = addCustomer(createState(), { name: '김OO', phone: '01011112222' });
  ({ state } = addVisit(state, customer.id, { done: '레이어드 컷' }, '2026-09-11T10:00:00'));
  ({ state } = markToday(state, customer.id, '2026-09-11'));
  return { state, id: customer.id };
}

test('지운 고객은 목록·검색·오늘 명단에서 모두 빠진다', () => {
  const { state: s0, id } = oneWithVisit();
  assert.equal(todayList(s0, '2026-09-11').length, 1);
  const { state } = deleteCustomer(s0, id, '2026-09-11T20:00:00');
  assert.deepEqual(findCustomers(state, ''), []);
  assert.deepEqual(findCustomers(state, '김'), []);
  assert.deepEqual(todayList(state, '2026-09-11'), []);
  assert.equal(s0.customers[0].deletedAt, null, '원래 상태는 바뀌지 않는다');
});

test('지워도 기록은 남아 있어서 되살리면 방문 기록까지 그대로 돌아온다', () => {
  const { state: s0, id } = oneWithVisit();
  const { state: gone } = deleteCustomer(s0, id, '2026-09-11T20:00:00');
  assert.deepEqual(deletedCustomers(gone).map(c => c.name), ['김OO']);
  const { state } = restoreCustomer(gone, id);
  assert.deepEqual(findCustomers(state, '').map(c => c.name), ['김OO']);
  assert.deepEqual(deletedCustomers(state), []);
  assert.equal(visitsOf(state, id).length, 1);
});

test('지운 고객에게는 방문 기록이나 고정 정보를 남길 수 없다', () => {
  const { state: s0, id } = oneWithVisit();
  const { state } = deleteCustomer(s0, id, '2026-09-11T20:00:00');
  assert.throws(() => addVisit(state, id, { done: '컷' }, '2026-09-12T10:00:00'), /지운 고객/);
  assert.throws(() => setProfile(state, id, { talk: 'ㄱ', hair: 'ㄴ' }, '2026-09-12T10:00:00'), /지운 고객/);
  assert.throws(() => markToday(state, id, '2026-09-12'), /지운 고객/);
});

test('지운 고객이 쓰던 번호로 새 고객을 만들 수 있다', () => {
  const { state: s0, id } = oneWithVisit();
  const { state } = deleteCustomer(s0, id, '2026-09-11T20:00:00');
  const { customer } = addCustomer(state, { name: '이OO', phone: '01011112222' });
  assert.equal(customer.name, '이OO');
});

test('같은 번호를 쓰는 고객이 있으면 되살리지 못하고 이유를 알려준다', () => {
  const { state: s0, id } = oneWithVisit();
  let { state } = deleteCustomer(s0, id, '2026-09-11T20:00:00');
  ({ state } = addCustomer(state, { name: '이OO', phone: '01011112222' }));
  assert.throws(() => restoreCustomer(state, id), /이OO.*되살릴 수 없습니다/);
});

test('완전히 지우면 고객도 방문 기록도 사라진다', () => {
  const { state: s0, id } = oneWithVisit();
  const { state: gone } = deleteCustomer(s0, id, '2026-09-11T20:00:00');
  const { state } = purgeCustomer(gone, id);
  assert.deepEqual(state.customers, []);
  assert.deepEqual(state.visits, [], '그 고객의 방문 기록도 함께 사라진다');
  assert.deepEqual(deletedCustomers(state), []);
  assert.deepEqual(state.today.entries, []);
});

test('완전히 지워도 다른 고객의 방문 기록은 건드리지 않는다', () => {
  let { state, customer: a } = addCustomer(createState(), { name: '김OO', phone: '01011112222' });
  let b;
  ({ state, customer: b } = addCustomer(state, { name: '이OO', phone: '01033334444' }));
  ({ state } = addVisit(state, a.id, { done: 'A 시술' }, '2026-09-11T10:00:00'));
  ({ state } = addVisit(state, b.id, { done: 'B 시술' }, '2026-09-11T11:00:00'));
  ({ state } = purgeCustomer(state, a.id));
  assert.deepEqual(state.customers.map(c => c.name), ['이OO']);
  assert.deepEqual(state.visits.map(v => v.done), ['B 시술']);
});

test('저장했다 꺼내도 지운 상태가 그대로 유지된다', () => {
  const { state: s0, id } = oneWithVisit();
  const { state } = deleteCustomer(s0, id, '2026-09-11T20:00:00');
  const restored = deserialize(serialize(state));
  assert.deepEqual(restored, state);
  assert.deepEqual(findCustomers(restored, ''), []);
});

test('지우기 칸이 없던 옛 백업을 불러오면 모두 살아 있는 고객이 된다', () => {
  const old = JSON.stringify({ nextId: 2, customers: [{ id: 1, name: '김OO', last4: '1234' }], memos: [], today: { date: '', customerIds: [] } });
  const state = deserialize(old);
  assert.equal(state.customers[0].deletedAt, null);
  assert.deepEqual(findCustomers(state, '').map(c => c.name), ['김OO']);
});

// ---- 오늘 명단: 예약 시간과 순서 -------------------------------------------

function threeCustomers() {
  let { state, customer: kim } = addCustomer(createState(), { name: '김OO', phone: '01011112222' });
  let lee, park;
  ({ state, customer: lee } = addCustomer(state, { name: '이OO', phone: '01033334444' }));
  ({ state, customer: park } = addCustomer(state, { name: '박OO', phone: '01055556666' }));
  return { state, kim: kim.id, lee: lee.id, park: park.id };
}
const D = '2026-09-11';
const shown = (state) => todayList(state, D).map(t => `${t.order} ${t.at || '시간없음'} ${t.customer.name}`);

test('예약 시간을 적으면 올린 순서와 상관없이 시간순으로 줄을 세운다', () => {
  let { state, kim, lee, park } = threeCustomers();
  ({ state } = markToday(state, kim, D, '14:00'));
  ({ state } = markToday(state, lee, D, '10:00'));
  ({ state } = markToday(state, park, D, '11:30'));
  assert.deepEqual(shown(state), ['1 10:00 이OO', '2 11:30 박OO', '3 14:00 김OO']);
});

test('시간을 안 적은 사람은 적은 사람 뒤에, 올린 순서대로 붙는다', () => {
  let { state, kim, lee, park } = threeCustomers();
  ({ state } = markToday(state, kim, D, ''));
  ({ state } = markToday(state, lee, D, '10:00'));
  ({ state } = markToday(state, park, D));
  assert.deepEqual(shown(state), ['1 10:00 이OO', '2 시간없음 김OO', '3 시간없음 박OO']);
});

test('시간은 930, 1030, 9:30 처럼 적어도 HH:MM으로 맞춰 준다', () => {
  let { state, kim, lee, park } = threeCustomers();
  ({ state } = markToday(state, kim, D, '930'));
  ({ state } = markToday(state, lee, D, '1030'));
  ({ state } = markToday(state, park, D, '9:05'));
  assert.deepEqual(shown(state), ['1 09:05 박OO', '2 09:30 김OO', '3 10:30 이OO']);
});

test('시간이 말이 안 되면 막고 알려준다', () => {
  const { state, kim } = threeCustomers();
  assert.throws(() => markToday(state, kim, D, '25:00'), /10:00 처럼/);
  assert.throws(() => markToday(state, kim, D, '10:99'), /10:00 처럼/);
  assert.throws(() => markToday(state, kim, D, '아무거나'), /10:00 처럼/);
});

test('명단에 올린 뒤에 시간을 고치면 줄 순서도 따라 바뀐다', () => {
  let { state, kim, lee } = threeCustomers();
  ({ state } = markToday(state, kim, D, '10:00'));
  ({ state } = markToday(state, lee, D, '11:00'));
  ({ state } = setTodayTime(state, lee, D, '09:00'));
  assert.deepEqual(shown(state), ['1 09:00 이OO', '2 10:00 김OO']);
  ({ state } = setTodayTime(state, lee, D, ''));
  assert.deepEqual(shown(state), ['1 10:00 김OO', '2 시간없음 이OO'], '시간을 지우면 뒤로 간다');
});

test('카드를 열어 명단에 다시 올라가도 적어둔 시간은 지워지지 않는다', () => {
  let { state, kim } = threeCustomers();
  ({ state } = markToday(state, kim, D, '10:00'));
  ({ state } = markToday(state, kim, D));
  assert.deepEqual(shown(state), ['1 10:00 김OO'], '한 번만 들어가고 시간도 그대로');
});

test('예약이 취소되면 명단에서만 빼고 고객과 기록은 남는다', () => {
  let { state, kim, lee } = threeCustomers();
  ({ state } = markToday(state, kim, D, '10:00'));
  ({ state } = markToday(state, lee, D, '11:00'));
  ({ state } = addVisit(state, kim, { done: '지난 시술' }, '2026-09-01T10:00:00'));
  ({ state } = unmarkToday(state, kim, D));
  assert.deepEqual(shown(state), ['1 11:00 이OO']);
  assert.equal(findCustomers(state, '김').length, 1, '고객은 그대로 있다');
  assert.equal(visitsOf(state, kim).length, 1, '방문 기록도 그대로 있다');
});

test('명단에 없는 사람을 빼거나 시간을 고쳐도 아무 일도 안 생긴다', () => {
  let { state, kim, lee } = threeCustomers();
  ({ state } = markToday(state, kim, D, '10:00'));
  const before = shown(state);
  ({ state } = unmarkToday(state, lee, D));
  ({ state } = setTodayTime(state, lee, D, '09:00'));
  assert.deepEqual(shown(state), before);
});

test('날짜가 바뀌면 어제 명단은 안 보이고 새 명단이 시작된다', () => {
  let { state, kim, lee } = threeCustomers();
  ({ state } = markToday(state, kim, D, '10:00'));
  ({ state } = markToday(state, lee, '2026-09-12', '11:00'));
  assert.deepEqual(todayList(state, D), []);
  assert.deepEqual(shown_on(state, '2026-09-12'), ['1 11:00 이OO']);
  function shown_on(st, d) { return todayList(st, d).map(t => `${t.order} ${t.at || '시간없음'} ${t.customer.name}`); }
});

test('시간 칸이 없던 옛 백업의 오늘 명단도 그대로 읽는다', () => {
  const old = JSON.stringify({
    nextId: 3,
    customers: [{ id: 1, name: '김OO', phone: '01011112222' }, { id: 2, name: '이OO', phone: '01033334444' }],
    visits: [], today: { date: D, customerIds: [2, 1] },
  });
  const state = deserialize(old);
  assert.deepEqual(shown(state), ['1 시간없음 이OO', '2 시간없음 김OO'], '올린 순서 그대로');
});

test('오늘 명단도 저장했다 꺼내면 그대로다', () => {
  let { state, kim, lee } = threeCustomers();
  ({ state } = markToday(state, kim, D, '10:00'));
  ({ state } = markToday(state, lee, D, ''));
  assert.deepEqual(deserialize(serialize(state)), state);
});
