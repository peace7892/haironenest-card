const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createState, addCustomer, findCustomers, addMemo, editMemo, memosOf, serialize, deserialize } = require('./store.js');

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

function twoCustomers() {
  let { state, customer: kim } = addCustomer(createState(), { name: '김OO', last4: '1234' });
  let lee;
  ({ state, customer: lee } = addCustomer(state, { name: '이OO', last4: '5678' }));
  return { state, kim, lee };
}

test('고객에게 메모를 저장하면 그 고객 카드에서만 최신순으로 보인다', () => {
  let { state, kim, lee } = twoCustomers();
  ({ state } = addMemo(state, kim.id, '탑 볼륨 부족, 언더에서 무게 뺌', '2026-09-10T10:00:00'));
  ({ state } = addMemo(state, kim.id, '앞머리 광대 가리는 각도', '2026-09-10T11:00:00'));
  ({ state } = addMemo(state, lee.id, '단발, 드라이 없이 되는 라인', '2026-09-10T12:00:00'));
  assert.deepEqual(memosOf(state, kim.id).map(m => m.text), ['앞머리 광대 가리는 각도', '탑 볼륨 부족, 언더에서 무게 뺌']);
  assert.deepEqual(memosOf(state, lee.id).map(m => m.text), ['단발, 드라이 없이 되는 라인']);
});

test('빈 메모는 저장하지 않는다', () => {
  const { state, kim } = twoCustomers();
  assert.throws(() => addMemo(state, kim.id, '   ', '2026-09-10T10:00:00'), /메모/);
});

test('없는 고객에게는 메모를 저장하지 않는다', () => {
  const { state } = twoCustomers();
  assert.throws(() => addMemo(state, 999, '메모', '2026-09-10T10:00:00'), /고객/);
});

test('메모를 고치면 새 내용이 보이고 고치기 전 내용은 이력에 남는다', () => {
  let { state, kim } = twoCustomers();
  let memo;
  ({ state, memo } = addMemo(state, kim.id, '탑 볼륨 부족', '2026-09-10T10:00:00'));
  ({ state } = editMemo(state, memo.id, '탑 볼륨 부족, 언더에서 무게 뺌', '2026-09-11T09:00:00'));
  const [latest] = memosOf(state, kim.id);
  assert.equal(latest.text, '탑 볼륨 부족, 언더에서 무게 뺌');
  assert.equal(latest.createdAt, '2026-09-10T10:00:00', '작성 시각은 그대로');
  assert.deepEqual(latest.history, [{ text: '탑 볼륨 부족', replacedAt: '2026-09-11T09:00:00' }]);
});

test('메모를 빈 내용으로 고칠 수 없다', () => {
  let { state, kim } = twoCustomers();
  let memo;
  ({ state, memo } = addMemo(state, kim.id, '탑 볼륨 부족', '2026-09-10T10:00:00'));
  assert.throws(() => editMemo(state, memo.id, '', '2026-09-11T09:00:00'), /메모/);
});

test('저장했다가 꺼내면 같은 상태가 돌아온다', () => {
  let { state, kim } = twoCustomers();
  ({ state } = addMemo(state, kim.id, '탑 볼륨 부족', '2026-09-10T10:00:00'));
  const restored = deserialize(serialize(state));
  assert.deepEqual(restored, state);
});

test('저장된 것이 없거나 깨져 있으면 빈 상태로 시작한다', () => {
  assert.deepEqual(deserialize(null), createState());
  assert.deepEqual(deserialize(''), createState());
  assert.deepEqual(deserialize('{not json'), createState());
});
