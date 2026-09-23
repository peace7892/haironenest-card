const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createState, cleanDate, noteLines, noteOutline, noteInline, noteLabel, noteTidy, NOTE_LABELS, timeSlots, formatWon, comma, buildNotice, noticeRemain, noticeUsed, setSettings, rememberProduct, findProduct, cleanAmount, chargePass, usePass, deletePass, passEntriesOf, passBalance, passSummary, visitsWithGaps, visitCycle, addCustomer, editCustomer, deleteCustomer, restoreCustomer, purgeCustomer, deletedCustomers, maskPhone, findCustomers, setProfile, addVisit, editVisit, deleteVisit, restoreVisit, purgeVisit, deletedVisitsOf, sweepDeletedVisits, daysLeftInTrash, visitsOf, markToday, setTodayTime, unmarkToday, todayList, serialize, deserialize } = require('./store.js');

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

test('못 적고 지나간 날 것은 그 날짜로 적는다 — 시각은 지금 것, 오늘 명단에는 안 센다', () => {
  let { state, kim } = twoCustomers();
  ({ state } = markToday(state, kim.id, '2026-09-20'));
  let visit;
  ({ state, visit } = addVisit(state, kim.id, { done: '지난 화요일 컷', next: '', date: '2026-09-15' }, '2026-09-20T17:42:00'));
  assert.equal(visit.createdAt, '2026-09-15T17:42:00');
  assert.equal(todayList(state, '2026-09-20')[0].recorded, false, '지난날 기록이니 오늘은 아직 안 적음');
  assert.equal(visitCycle(state, kim.id, '2026-09-20').sinceLast, 5, '주기는 그 날짜로 센다');
  ({ state, visit } = addVisit(state, kim.id, { done: '오늘 컷', next: '', date: '' }, '2026-09-20T18:00:00'));
  assert.equal(visit.createdAt, '2026-09-20T18:00:00', '날짜를 비우면 지금');
  ({ state, visit } = addVisit(state, kim.id, { done: '오늘 컷', next: '', date: '2026-09-20' }, '2026-09-20T18:10:00'));
  assert.equal(visit.createdAt, '2026-09-20T18:10:00', '오늘 날짜를 고르면 지금과 같다');
});

test('방문 기록 날짜를 옮기면 시각은 그대로, 이전 날짜가 이력에 남고, 오늘 명단은 [아직 안 적음]으로 돌아간다', () => {
  let { state, kim } = twoCustomers();
  ({ state } = markToday(state, kim.id, '2026-09-20'));
  let visit;
  ({ state, visit } = addVisit(state, kim.id, { done: '컷', next: '볼륨펌' }, '2026-09-20T10:00:00'));
  assert.equal(todayList(state, '2026-09-20')[0].recorded, true);
  ({ state, visit } = editVisit(state, visit.id, { done: '컷', next: '볼륨펌', date: '2026-09-15' }, '2026-09-20T11:00:00'));
  assert.equal(visit.createdAt, '2026-09-15T10:00:00', '날짜만 바뀌고 시각은 그대로');
  assert.deepEqual(visit.history, [{ done: '컷', next: '볼륨펌', replacedAt: '2026-09-20T11:00:00', createdAt: '2026-09-20T10:00:00' }]);
  assert.equal(todayList(state, '2026-09-20')[0].recorded, false);
  assert.equal(visitCycle(state, kim.id, '2026-09-20').sinceLast, 5);
  // 같은 날짜로 저장하거나 날짜를 비우면 안 옮긴 것: 이력에 날짜가 안 붙는다
  ({ state, visit } = editVisit(state, visit.id, { done: '컷 (레이어)', next: '볼륨펌', date: '2026-09-15' }, '2026-09-20T12:00:00'));
  assert.equal(visit.createdAt, '2026-09-15T10:00:00');
  assert.equal('createdAt' in visit.history[1], false);
  ({ state, visit } = editVisit(state, visit.id, { done: '컷 (레이어)', next: '' }, '2026-09-20T12:30:00'));
  assert.equal(visit.createdAt, '2026-09-15T10:00:00');
  // 옮긴 날짜대로 줄이 선다
  ({ state } = addVisit(state, kim.id, { done: '그 사이 방문' }, '2026-09-18T10:00:00'));
  assert.deepEqual(visitsOf(state, kim.id).map(v => v.done), ['그 사이 방문', '컷 (레이어)']);
});

test('오늘보다 뒤 날짜나 말이 안 되는 날짜에는 기록을 못 남긴다', () => {
  let { state, kim } = twoCustomers();
  const now = '2026-09-20T10:00:00';
  assert.throws(() => addVisit(state, kim.id, { done: '컷', date: '2026-09-21' }, now), /뒤 날짜/);
  assert.throws(() => addVisit(state, kim.id, { done: '컷', date: '2026-02-30' }, now), /날짜는/);
  assert.throws(() => addVisit(state, kim.id, { done: '컷', date: '20260915' }, now), /날짜는/);
  let visit;
  ({ state, visit } = addVisit(state, kim.id, { done: '컷' }, now));
  assert.throws(() => editVisit(state, visit.id, { done: '컷', date: '2026-09-21' }, now), /뒤 날짜/);
  assert.equal(state.visits[0].createdAt, now, '거절되면 아무것도 안 바뀐다');
});

test('noteLines — "/"로 끊어 적은 기록은 그 자리에서 나뉜다', () => {
  assert.deepEqual(noteLines('가슴윗기장 포워드레이어드 / 매직 후 / 파랑 한바퀴반 / 120도 5분 / C컬로 펴주고 중화'),
    ['가슴윗기장 포워드레이어드', '매직 후', '파랑 한바퀴반', '120도 5분', 'C컬로 펴주고 중화']);
  assert.deepEqual(noteLines('여성컷/앞머리 정돈'), ['여성컷', '앞머리 정돈'], '띄어쓰기 없이도');
  assert.deepEqual(noteLines('1/2바퀴 더 감음'), ['1/2바퀴 더 감음'], '숫자 사이 /는 분수라 안 나눈다');
});

test('noteLines — 말로 받아쓴 글은 문장 끝에서 나뉘고, 숫자 속 점은 안 건드린다', () => {
  const said = '가슴 윗기장 포워드 레이어드로 잘랐습니다. 매직 후에 파랑 롤로 한 바퀴 반 감았고 120도 5분 두었어요. 뿌리 쪽은 1.5바퀴 더 감음. C컬로 펴주고 중화했습니다. 옆 라인은 얼굴 따라 짧게 정돈했음.';
  assert.deepEqual(noteLines(said), [
    '가슴 윗기장 포워드 레이어드로 잘랐습니다',
    '매직 후에 파랑 롤로 한 바퀴 반 감았고 120도 5분 두었어요',
    '뿌리 쪽은 1.5바퀴 더 감음',
    'C컬로 펴주고 중화했습니다',
    '옆 라인은 얼굴 따라 짧게 정돈했음',
  ]);
  assert.deepEqual(noteLines('탑 볼륨 부족해서 언더에서 무게 뺌.다음엔 볼륨펌'), ['탑 볼륨 부족해서 언더에서 무게 뺌', '다음엔 볼륨펌'], '점 뒤에 띄어쓰기가 없어도');
  assert.deepEqual(noteLines('길이 유지, 볼륨펌 상담'), ['길이 유지, 볼륨펌 상담'], '쉼표에서는 안 나눈다');
});

test('noteLines — "~고," 뒤에 쉼표가 오면 거기서도 나뉜다. 쉼표만으로는 안 나눈다', () => {
  assert.deepEqual(noteLines('뒷머리는 상고로 라인 올려서 다듬었고, 다음번 복직하기 전에는 롤스트레이트를 권했어'),
    ['뒷머리는 상고로 라인 올려서 다듬었고', '다음번 복직하기 전에는 롤스트레이트를 권했어']);
  assert.deepEqual(noteLines('파랑 롤 한 바퀴 반 감고요, 120도 5분'), ['파랑 롤 한 바퀴 반 감고', '120도 5분'], '"고요,"도 (군말 요는 떨어진다)');
  assert.deepEqual(noteLines('파랑 롤 한 바퀴 반, 120도 5분'), ['파랑 롤 한 바퀴 반, 120도 5분']);
  assert.deepEqual(noteLines('C컬로 펴주고 중화'), ['C컬로 펴주고 중화'], '쉼표 없는 "~고 "는 그대로');
});

const STRUCTURED = [
  '오늘 시술 내용:',
  '1. 커트 및 형태',
  '• 길이를 살린 상태로 라인만 살짝 정돈',
  '• 관자놀이가 많이 가라앉은 편이라 볼륨이 관자놀이에 집중되도록 사이드뱅은 입술선에 맞춤',
  '2. 질감 처리',
  '• 라인이 날리지 않으면서도 머리가 가볍게 뜰 수 있도록 전체 슬라이싱 진행',
  '고객 반응 및 다음 시술 참고 사항:',
  '볼륨을 위해 오버존에 층을 내드렸는데 귀에 안 꽂히고 흘러내릴까 봐 조금 걱정하심',
  '다음번에는 사이드뱅을 입술선에 반드시 맞춰서 귀 뒤로 넘겨 꽂아질 수 있도록 진행할 것',
].join('\n');

test('noteOutline — 글에 제목·번호·• 표시가 이미 있으면 그 구조를 살리고 줄바꿈에서만 나눈다', () => {
  assert.deepEqual(noteOutline(STRUCTURED), [
    { kind: 'heading', level: 0, text: '오늘 시술 내용' },
    { kind: 'sub', level: 1, text: '1. 커트 및 형태' },
    { kind: 'item', level: 2, text: '길이를 살린 상태로 라인만 살짝 정돈' },
    { kind: 'item', level: 2, text: '관자놀이가 많이 가라앉은 편이라 볼륨이 관자놀이에 집중되도록 사이드뱅은 입술선에 맞춤' },
    { kind: 'sub', level: 1, text: '2. 질감 처리' },
    { kind: 'item', level: 2, text: '라인이 날리지 않으면서도 머리가 가볍게 뜰 수 있도록 전체 슬라이싱 진행' },
    { kind: 'heading', level: 0, text: '고객 반응 및 다음 시술 참고 사항' },
    { kind: 'item', level: 1, text: '볼륨을 위해 오버존에 층을 내드렸는데 귀에 안 꽂히고 흘러내릴까 봐 조금 걱정하심' },
    { kind: 'item', level: 1, text: '다음번에는 사이드뱅을 입술선에 반드시 맞춰서 귀 뒤로 넘겨 꽂아질 수 있도록 진행할 것' },
  ]);
  assert.deepEqual(noteLines(STRUCTURED).length, 5, '항목만 다섯 개, 제목은 빠진다');
  assert.equal(noteLines(STRUCTURED)[0], '길이를 살린 상태로 라인만 살짝 정돈', '• 표시는 떨어진다');
});

test('noteOutline — 표시 종류가 달라도, 제목 없이 •만 있어도 알아본다', () => {
  assert.deepEqual(noteOutline('- 여성컷\n* 앞머리 정돈\n· 드라이'), [
    { kind: 'item', level: 0, text: '여성컷' }, { kind: 'item', level: 0, text: '앞머리 정돈' }, { kind: 'item', level: 0, text: '드라이' },
  ]);
  assert.deepEqual(noteOutline('시술:\n여성컷. 앞머리 정돈'), [
    { kind: 'heading', level: 0, text: '시술' }, { kind: 'item', level: 1, text: '여성컷. 앞머리 정돈' },
  ], '구조가 있으면 문장 끝 점에서는 안 자른다');
});

test('noteOutline — 번호 줄은 뒤에 항목이 따라올 때만 작은 제목이다', () => {
  assert.deepEqual(noteOutline('시술:\n1. 여성컷\n2. 염색'), [
    { kind: 'heading', level: 0, text: '시술' }, { kind: 'item', level: 1, text: '1. 여성컷' }, { kind: 'item', level: 1, text: '2. 염색' },
  ], '번호 줄만 이어지면 항목');
  assert.deepEqual(noteOutline('1. 커트\n• 라인 정돈\n2. 펌\n• 뿌리 볼륨'), [
    { kind: 'sub', level: 0, text: '1. 커트' }, { kind: 'item', level: 1, text: '라인 정돈' },
    { kind: 'sub', level: 0, text: '2. 펌' }, { kind: 'item', level: 1, text: '뿌리 볼륨' },
  ], '제목 없이 번호 줄과 항목이면 번호 줄이 작은 제목');
});

const TYPELESS = ['민준이 머리 스타일 기록:', '', '1. 옆머리: 투블럭', '(a) 옆머리: 13mm', '(b) 구레나룻: 6mm', '2. 뒷머리: 6mm', '(a) 상고 스타일로 올려 치는 것을 선호함', '3. 앞머리: 아빠가 잘라온 앞머리 길이에 맞춰서 투블럭으로 다듬음', '', '• 특이사항: 다음번 머리할 때 펌 추천'].join('\n');

test('noteOutline — 받아쓰기 앱이 만든 번호·(a)(b) 구조: 쌍점 있는 번호 줄은 항목, 붙임 글자는 떼고 그 밑에, 빈 줄은 덩어리 경계', () => {
  assert.deepEqual(noteOutline(TYPELESS), [
    { kind: 'heading', level: 0, text: '민준이 머리 스타일 기록' },
    { kind: 'item', level: 1, text: '1. 옆머리: 투블럭' },
    { kind: 'item', level: 2, text: '옆머리: 13mm' },
    { kind: 'item', level: 2, text: '구레나룻: 6mm' },
    { kind: 'item', level: 1, text: '2. 뒷머리: 6mm' },
    { kind: 'item', level: 2, text: '상고 스타일로 올려 치는 것을 선호함' },
    { kind: 'item', level: 1, text: '3. 앞머리: 아빠가 잘라온 앞머리 길이에 맞춰서 투블럭으로 다듬음' },
    { kind: 'item', level: 1, text: '특이사항: 다음번 머리할 때 펌 추천' },
  ]);
  assert.deepEqual(noteOutline('1. 옆머리: 투블럭\n(a) 13mm\nb. 6mm\n가. 상고'), [
    { kind: 'item', level: 0, text: '1. 옆머리: 투블럭' }, { kind: 'item', level: 1, text: '13mm' }, { kind: 'item', level: 1, text: '6mm' }, { kind: 'item', level: 1, text: '상고' },
  ], '제목·표시가 없어도 (a) b. 가. 가 있으면 구조로 본다');
  assert.deepEqual(noteOutline('1. 옆머리: 투블럭\n• 13mm\n\n• 특이사항'), [
    { kind: 'item', level: 0, text: '1. 옆머리: 투블럭' }, { kind: 'item', level: 1, text: '13mm' }, { kind: 'item', level: 0, text: '특이사항' },
  ], '빈 줄 없이 이어진 •는 번호 항목 밑에, 빈 줄 뒤의 •는 제자리로');
  assert.deepEqual(noteOutline('1. 컷. 앞머리 정돈\n• 라인'), [
    { kind: 'sub', level: 0, text: '1. 컷. 앞머리 정돈' }, { kind: 'item', level: 1, text: '라인' },
  ], '"컷."처럼 한 글자 뒤 점은 붙임 글자가 아니다');
});

test('noteInline — 항목 안의 "짧은말: 내용"을 이름과 내용으로 나눈다', () => {
  assert.deepEqual(noteInline('옆머리: 13mm'), { key: '옆머리', text: '13mm' });
  assert.deepEqual(noteInline('1. 옆머리: 투블럭'), { key: '1. 옆머리', text: '투블럭' });
  assert.deepEqual(noteInline('특이사항 : 다음번 머리할 때 펌 추천'), { key: '특이사항', text: '다음번 머리할 때 펌 추천' });
  assert.deepEqual(noteInline('상고 스타일로 올려 치는 것을 선호함'), { key: null, text: '상고 스타일로 올려 치는 것을 선호함' });
  assert.deepEqual(noteInline('고객 반응 및 다음 시술 참고 사항: 볼륨'), { key: null, text: '고객 반응 및 다음 시술 참고 사항: 볼륨' }, '여덟 자를 넘으면 이름이 아니다');
  assert.deepEqual(noteInline('옆머리:'), { key: null, text: '옆머리:' }, '내용이 없으면 그대로');
});

test('noteOutline — 구조가 없는 글은 지금처럼 나눠 전부 항목이다', () => {
  assert.deepEqual(noteOutline('여성컷 / 앞머리 정돈했음. 다음엔 볼륨펌'), [
    { kind: 'item', level: 0, text: '여성컷' }, { kind: 'item', level: 0, text: '앞머리 정돈했음' }, { kind: 'item', level: 0, text: '다음엔 볼륨펌' },
  ]);
  assert.deepEqual(noteOutline('1. 여성컷\n2. 염색'), [{ kind: 'item', level: 0, text: '1. 여성컷' }, { kind: 'item', level: 0, text: '2. 염색' }], '번호만 있고 표시·제목이 없으면 구조로 안 본다');
  assert.deepEqual(noteOutline(''), []);
});

test('noteLabel — 조각 앞의 이름표(시술·고민·원인·다음…)를 알아본다', () => {
  assert.deepEqual(NOTE_LABELS, ['시술', '레시피', '고민', '원인', '다음', '요청', '상태', '주의']);
  assert.deepEqual(noteLabel('시술, 세미 투블럭, 전체 다듬기'), { label: '시술', text: '세미 투블럭, 전체 다듬기' });
  assert.deepEqual(noteLabel('다음: 복직 전 롤스트레이트 권함'), { label: '다음', text: '복직 전 롤스트레이트 권함' });
  assert.deepEqual(noteLabel('고민 가라앉음'), { label: '고민', text: '가라앉음' }, '띄어쓰기만 있어도');
  assert.deepEqual(noteLabel('원인 수영 후 덜 말려 꼬불거림'), { label: '원인', text: '수영 후 덜 말려 꼬불거림' });
  // 이름표가 아닌 것들
  assert.deepEqual(noteLabel('시술 후 두피 따가움'), { label: null, text: '시술 후 두피 따가움' }, '"시술 후"는 이름표가 아니다');
  assert.deepEqual(noteLabel('다음번 복직 전'), { label: null, text: '다음번 복직 전' });
  assert.deepEqual(noteLabel('다음에 볼륨펌 상담'), { label: null, text: '다음에 볼륨펌 상담' });
  assert.deepEqual(noteLabel('상태는 좋음'), { label: null, text: '상태는 좋음' });
  assert.deepEqual(noteLabel('원인'), { label: null, text: '원인' }, '내용이 없으면 이름표도 없다');
  assert.deepEqual(noteLabel('세미 투블럭'), { label: null, text: '세미 투블럭' });
});

test('noteTidy — 말하는 끝맺음을 차트 말투로 (보여줄 때만)', () => {
  const t = noteTidy;
  assert.equal(t('세미 투블럭 커트를 했고 전체적으로 머리를 좀 다듬었어'), '세미 투블럭 커트를 했고 전체적으로 머리를 좀 다듬었음');
  assert.equal(t('롤스트레이트를 권했어'), '롤스트레이트를 권했음');
  assert.equal(t('힘이 없어서 걱정하고 있어'), '힘이 없어서 걱정하고 있음');
  assert.equal(t('덜 말려서 생기는 현상인 듯해'), '덜 말려서 생기는 현상인 듯');
  assert.equal(t('생기는 것 같아요'), '생기는 듯');
  assert.equal(t('가슴 윗기장 포워드 레이어드로 잘랐습니다'), '가슴 윗기장 포워드 레이어드로 잘랐음');
  assert.equal(t('120도 5분 두었어요.'), '120도 5분 두었음', '끝의 점도 떼고');
  assert.equal(t('C컬로 펴주고 중화했습니다'), 'C컬로 펴주고 중화했음');
  assert.equal(t('볼륨펌을 권해'), '볼륨펌을 권함');
  assert.equal(t('볼륨펌을 권해요'), '볼륨펌을 권함');
  assert.equal(t('다듬었고'), '다듬었음', '"~고,"에서 잘린 조각');
  assert.equal(t('드라이하고'), '드라이함');
  assert.equal(t('감고요'), '감음');
  assert.equal(t('힘이 없네요'), '힘이 없음');
  assert.equal(t('권할 거예요'), '권할 것');
  assert.equal(t('수영 때문이에요'), '수영 때문임');
  assert.equal(t('양이 많아요'), '양이 많음');
  assert.equal(t('그렇게 됐어'), '그렇게 됐음');
  assert.equal(t('다음번에 파마하는 것을 권유했지'), '다음번에 파마하는 것을 권유했음', '"~했지"도');
  assert.equal(t('권유했지요'), '권유했음');
  assert.equal(t('두 가지'), '두 가지', '과거형이 아닌 "지"는 그대로');
  // 건드리면 안 되는 것
  assert.equal(t('C컬로 펴주고 중화'), 'C컬로 펴주고 중화');
  assert.equal(t('120도 5분'), '120도 5분');
  assert.equal(t('세미 투블럭'), '세미 투블럭');
  assert.equal(t('드라이 필요'), '드라이 필요', '"필요"의 요는 말투가 아니다');
  assert.equal(t('복직 전 롤스트레이트 권함'), '복직 전 롤스트레이트 권함');
  assert.equal(t('  앞머리만 정돈  '), '앞머리만 정돈');
  assert.equal(t(''), '');
});

test('noteLines — 줄바꿈에서도 나뉘고, 빈 조각은 버리고, 한 조각이면 그대로', () => {
  assert.deepEqual(noteLines('여성컷\n앞머리 정돈\n\n'), ['여성컷', '앞머리 정돈']);
  assert.deepEqual(noteLines('여성컷 / 앞머리 정돈했음. 다음엔 볼륨펌'), ['여성컷', '앞머리 정돈했음', '다음엔 볼륨펌'], '규칙이 섞여도');
  assert.deepEqual(noteLines('탑 볼륨 부족해서 언더에서 무게 뺌'), ['탑 볼륨 부족해서 언더에서 무게 뺌']);
  assert.deepEqual(noteLines(''), []);
  assert.deepEqual(noteLines(null), []);
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

// ---- 예약 시간 후보 --------------------------------------------------------

test('예약 시간 후보는 10시부터 30분 간격으로 19시까지 19개다', () => {
  const slots = timeSlots();
  assert.equal(slots.length, 19);
  assert.equal(slots[0], '10:00');
  assert.equal(slots[1], '10:30');
  assert.equal(slots[slots.length - 1], '19:00');
  assert.equal(slots.includes('12:30'), true);
  assert.equal(slots.includes('09:30'), false, '영업 전 시간은 없다');
  assert.equal(slots.includes('19:30'), false, '마지막 예약 뒤 시간은 없다');
});

// ---- 방문 주기 -------------------------------------------------------------

// 준 날짜들에 방문 기록을 남긴 고객 하나를 만든다.
function visitedOn(...dates) {
  let { state, customer } = addCustomer(createState(), { name: '김OO', phone: '01011112222' });
  for (const d of dates) ({ state } = addVisit(state, customer.id, { done: `${d} 시술` }, `${d}T14:00:00`));
  return { state, id: customer.id };
}

test('방문 기록마다 이전 방문에서 며칠 만인지 붙는다. 첫 방문은 비어 있다', () => {
  const { state, id } = visitedOn('2026-05-01', '2026-06-26', '2026-09-04');
  const got = visitsWithGaps(state, id);
  assert.deepEqual(got.map(v => v.createdAt.slice(0, 10)), ['2026-09-04', '2026-06-26', '2026-05-01'], '최신순 그대로');
  assert.deepEqual(got.map(v => v.sincePrev), [70, 56, null]);
});

test('오늘 기준으로 마지막 방문이 며칠 전인지, 보통 며칠 만에 오는지 알려준다', () => {
  const { state, id } = visitedOn('2026-05-01', '2026-06-26', '2026-09-04');
  const c = visitCycle(state, id, '2026-09-15');
  assert.equal(c.count, 3);
  assert.equal(c.lastDate, '2026-09-04');
  assert.equal(c.sinceLast, 11);
  assert.equal(c.average, 63, '56일과 70일의 평균');
});

test('오늘 기록을 남겨도 마지막 방문은 지난번을 가리킨다', () => {
  let { state, id } = visitedOn('2026-06-26', '2026-09-04');
  const before = visitCycle(state, id, '2026-09-15');
  ({ state } = addVisit(state, id, { done: '오늘 시술' }, '2026-09-15T11:00:00'));
  const after = visitCycle(state, id, '2026-09-15');
  assert.equal(after.lastDate, before.lastDate, '오늘 적었다고 마지막 방문 날짜가 오늘로 바뀌지 않는다');
  assert.equal(after.sinceLast, 11, '며칠 만에 왔는지도 그대로');
  assert.equal(after.count, 3, '방문 건수는 늘어난다');
});

test('처음 오는 고객은 며칠 만인지도 평균도 없다', () => {
  let { state, customer } = addCustomer(createState(), { name: '새손님', phone: '01099998888' });
  const c = visitCycle(state, customer.id, '2026-09-15');
  assert.equal(c.count, 0);
  assert.equal(c.sinceLast, null);
  assert.equal(c.average, null);
  assert.equal(c.lastDate, '');
  assert.deepEqual(visitsWithGaps(state, customer.id), []);
});

test('방문이 한 번뿐이면 며칠 만인지는 나오고 평균은 아직 없다', () => {
  const { state, id } = visitedOn('2026-08-01');
  const c = visitCycle(state, id, '2026-09-15');
  assert.equal(c.sinceLast, 45);
  assert.equal(c.average, null, '사이가 하나도 없으면 평균을 내지 않는다');
});

test('달을 넘고 해를 넘어도 날짜를 제대로 센다', () => {
  const { state, id } = visitedOn('2025-12-24');
  assert.equal(visitCycle(state, id, '2026-01-07').sinceLast, 14, '해를 넘는 2주');
  const feb = visitedOn('2024-02-27');
  assert.equal(visitCycle(feb.state, feb.id, '2024-03-01').sinceLast, 3, '윤년 2월 29일을 센다');
});

test('같은 날 두 번 오면 사이는 0일이다', () => {
  let { state, customer } = addCustomer(createState(), { name: '김OO', phone: '01011112222' });
  ({ state } = addVisit(state, customer.id, { done: '아침 컷' }, '2026-09-04T10:00:00'));
  ({ state } = addVisit(state, customer.id, { done: '저녁 손질' }, '2026-09-04T18:00:00'));
  assert.deepEqual(visitsWithGaps(state, customer.id).map(v => v.sincePrev), [0, null]);
});

test('오늘 명단 줄에도 며칠 만인지와 평균이 함께 온다', () => {
  let { state, customer } = addCustomer(createState(), { name: '김OO', phone: '01011112222' });
  ({ state } = addVisit(state, customer.id, { done: '5월', next: '다음엔 볼륨펌' }, '2026-05-01T14:00:00'));
  ({ state } = addVisit(state, customer.id, { done: '6월', next: '' }, '2026-06-26T14:00:00'));
  ({ state } = markToday(state, customer.id, '2026-09-15', '10:30'));
  const row = todayList(state, '2026-09-15')[0];
  assert.equal(row.at, '10:30');
  assert.equal(row.sinceLast, 81);
  assert.equal(row.lastDate, '2026-06-26');
  assert.equal(row.average, 56);
  assert.equal(row.count, 2);
  assert.equal(row.recorded, false);
});

// ---- 방문 기록 지우기 ------------------------------------------------------

// 같은 날 같은 내용을 두 번 적은 상황(실수로 두 번 저장)
function doubleEntry() {
  let { state, customer } = addCustomer(createState(), { name: '김OO', phone: '01011112222' });
  let first, second;
  ({ state, visit: first } = addVisit(state, customer.id, { done: '가슴윗기장 포워드레이어드 / 매직 후', next: '중화' }, '2026-09-15T15:26:00'));
  ({ state, visit: second } = addVisit(state, customer.id, { done: '가슴윗기장 스퀘어 포워드레이어', next: '' }, '2026-09-15T17:31:00'));
  return { state, id: customer.id, first: first.id, second: second.id };
}

test('방문 기록을 지우면 목록에서 빠지고, 지운 기록으로 옮겨진다', () => {
  const { state: s0, id, second } = doubleEntry();
  assert.equal(visitsOf(s0, id).length, 2);
  const { state } = deleteVisit(s0, second, '2026-09-15T17:40:00');
  assert.deepEqual(visitsOf(state, id).map(v => v.createdAt), ['2026-09-15T15:26:00'], '남은 한 건만 보인다');
  assert.deepEqual(deletedVisitsOf(state, id).map(v => v.id), [second]);
  assert.equal(s0.visits.find(v => v.id === second).deletedAt, null, '원래 상태는 바뀌지 않는다');
});

test('지운 기록을 되살리면 내용 그대로 목록으로 돌아온다', () => {
  const { state: s0, id, second } = doubleEntry();
  const { state: gone } = deleteVisit(s0, second, '2026-09-15T17:40:00');
  const { state } = restoreVisit(gone, second);
  assert.equal(visitsOf(state, id).length, 2);
  assert.deepEqual(deletedVisitsOf(state, id), []);
  assert.equal(visitsOf(state, id)[0].done, '가슴윗기장 스퀘어 포워드레이어');
});

test('지운 기록은 고칠 수 없다', () => {
  const { state: s0, second } = doubleEntry();
  const { state } = deleteVisit(s0, second, '2026-09-15T17:40:00');
  assert.throws(() => editVisit(state, second, { done: '고쳐보기' }, '2026-09-15T18:00:00'), /지운 기록/);
});

test('완전히 지우면 되살릴 수 없게 사라진다', () => {
  const { state: s0, id, second } = doubleEntry();
  const { state: gone } = deleteVisit(s0, second, '2026-09-15T17:40:00');
  const { state } = purgeVisit(gone, second);
  assert.equal(state.visits.length, 1);
  assert.deepEqual(deletedVisitsOf(state, id), []);
  assert.throws(() => restoreVisit(state, second), /찾을 수 없습니다/);
});

test('중복을 지우면 방문 건수와 주기가 곧바로 바로잡힌다', () => {
  let { state, customer } = addCustomer(createState(), { name: '김OO', phone: '01011112222' });
  ({ state } = addVisit(state, customer.id, { done: '5월' }, '2026-05-01T14:00:00'));
  ({ state } = addVisit(state, customer.id, { done: '9월' }, '2026-09-04T14:00:00'));
  let dup;
  ({ state, visit: dup } = addVisit(state, customer.id, { done: '9월 또 적음' }, '2026-09-04T17:00:00'));

  const before = visitCycle(state, customer.id, '2026-09-15');
  assert.equal(before.count, 3);
  assert.equal(before.average, 63, '0일짜리 중복이 평균을 끌어내린다 (126과 0의 평균)');

  ({ state } = deleteVisit(state, dup.id, '2026-09-15T18:00:00'));
  const after = visitCycle(state, customer.id, '2026-09-15');
  assert.equal(after.count, 2);
  assert.equal(after.average, 126, '중복을 지우면 평균이 제자리로');
  assert.deepEqual(visitsWithGaps(state, customer.id).map(v => v.sincePrev), [126, null]);
});

test('오늘 기록을 지우면 오늘 명단이 다시 [아직 안 적음]으로 돌아간다', () => {
  let { state, customer } = addCustomer(createState(), { name: '김OO', phone: '01011112222' });
  ({ state } = markToday(state, customer.id, '2026-09-15', '10:00'));
  let v;
  ({ state, visit: v } = addVisit(state, customer.id, { done: '오늘 시술' }, '2026-09-15T11:00:00'));
  assert.equal(todayList(state, '2026-09-15')[0].recorded, true);
  ({ state } = deleteVisit(state, v.id, '2026-09-15T12:00:00'));
  assert.equal(todayList(state, '2026-09-15')[0].recorded, false);
});

test('고객을 완전히 지우면 지운 기록까지 함께 사라진다', () => {
  const { state: s0, id, second } = doubleEntry();
  let { state } = deleteVisit(s0, second, '2026-09-15T17:40:00');
  ({ state } = purgeCustomer(state, id));
  assert.deepEqual(state.visits, []);
});

test('지운 기록도 저장했다 꺼내면 그대로다', () => {
  const { state: s0, second } = doubleEntry();
  const { state } = deleteVisit(s0, second, '2026-09-15T17:40:00');
  assert.deepEqual(deserialize(serialize(state)), state);
});

test('지움 칸이 없던 옛 백업의 방문 기록은 모두 살아 있는 것으로 읽는다', () => {
  const old = JSON.stringify({
    nextId: 3,
    customers: [{ id: 1, name: '김OO', phone: '01011112222' }],
    visits: [{ id: 2, customerId: 1, done: '옛 기록', next: '', createdAt: '2026-05-01T14:00:00', history: [] }],
    today: { date: '', customerIds: [] },
  });
  const state = deserialize(old);
  assert.equal(state.visits[0].deletedAt, null);
  assert.equal(visitsOf(state, 1).length, 1);
});

// ---- 지운 기록이 일주일 뒤 저절로 사라진다 ---------------------------------

// 지운 지 days일 지난 방문 기록 하나를 가진 상태를 만든다.
function trashedDaysAgo(days) {
  let { state, customer } = addCustomer(createState(), { name: '김OO', phone: '01011112222' });
  let v;
  ({ state, visit: v } = addVisit(state, customer.id, { done: '두 번 적은 기록' }, '2026-09-15T17:31:00'));
  ({ state } = addVisit(state, customer.id, { done: '남겨둘 기록' }, '2026-09-15T15:26:00'));
  ({ state } = deleteVisit(state, v.id, '2026-09-15T17:40:00'));
  const [y, m, d] = [2026, 9, 15 + days];
  const now = new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) + 'T09:00:00';
  return { state, id: customer.id, visitId: v.id, now };
}

test('지운 지 엿새까지는 남아 있다', () => {
  for (const days of [0, 1, 6]) {
    const { state, id, now } = trashedDaysAgo(days);
    const { state: after, removed } = sweepDeletedVisits(state, now);
    assert.equal(removed, 0, `${days}일째에는 안 없앤다`);
    assert.equal(deletedVisitsOf(after, id).length, 1);
  }
});

test('이레째부터는 저절로 없어진다', () => {
  for (const days of [7, 8, 30]) {
    const { state, id, now } = trashedDaysAgo(days);
    const { state: after, removed } = sweepDeletedVisits(state, now);
    assert.equal(removed, 1, `${days}일째에는 없앤다`);
    assert.deepEqual(deletedVisitsOf(after, id), []);
    assert.equal(visitsOf(after, id).length, 1, '안 지운 기록은 그대로 남는다');
  }
});

test('지우지 않은 기록은 아무리 오래돼도 안 건드린다', () => {
  let { state, customer } = addCustomer(createState(), { name: '김OO', phone: '01011112222' });
  ({ state } = addVisit(state, customer.id, { done: '5년 전 시술' }, '2021-05-01T14:00:00'));
  const { state: after, removed } = sweepDeletedVisits(state, '2026-09-15T09:00:00');
  assert.equal(removed, 0);
  assert.equal(visitsOf(after, customer.id).length, 1);
});

test('되살린 기록은 저절로 사라지지 않는다', () => {
  let { state, id, visitId, now } = trashedDaysAgo(30);
  ({ state } = restoreVisit(state, visitId));
  const { state: after, removed } = sweepDeletedVisits(state, now);
  assert.equal(removed, 0, '되살렸으니 없애지 않는다');
  assert.equal(visitsOf(after, id).length, 2);
});

test('사라지기까지 며칠 남았는지 알려준다', () => {
  const cases = [[0, 7], [1, 6], [6, 1], [7, 0], [20, 0]];
  for (const [days, left] of cases) {
    const { state, id, now } = trashedDaysAgo(days);
    assert.equal(daysLeftInTrash(deletedVisitsOf(state, id)[0], now), left, `${days}일째에는 ${left}일 남음`);
  }
});

test('안 지운 기록에는 남은 날이 없다', () => {
  const { state, id } = trashedDaysAgo(0);
  assert.equal(daysLeftInTrash(visitsOf(state, id)[0], '2026-09-15T09:00:00'), null);
  assert.equal(daysLeftInTrash(null, '2026-09-15T09:00:00'), null);
});

test('여러 건이 섞여 있어도 기한이 지난 것만 골라 없앤다', () => {
  let { state, customer } = addCustomer(createState(), { name: '김OO', phone: '01011112222' });
  const mk = (done, at) => { let v; ({ state, visit: v } = addVisit(state, customer.id, { done }, at)); return v.id; };
  const old1 = mk('열흘 전에 지움', '2026-08-01T10:00:00');
  const old2 = mk('여드레 전에 지움', '2026-08-02T10:00:00');
  const fresh = mk('어제 지움', '2026-08-03T10:00:00');
  mk('안 지운 것', '2026-08-04T10:00:00');
  ({ state } = deleteVisit(state, old1, '2026-09-05T10:00:00'));
  ({ state } = deleteVisit(state, old2, '2026-09-07T10:00:00'));
  ({ state } = deleteVisit(state, fresh, '2026-09-14T10:00:00'));

  const { state: after, removed } = sweepDeletedVisits(state, '2026-09-15T09:00:00');
  assert.equal(removed, 2);
  assert.deepEqual(deletedVisitsOf(after, customer.id).map(v => v.id), [fresh], '어제 지운 것만 남는다');
  assert.equal(visitsOf(after, customer.id).length, 1);
});

test('저절로 없어진 뒤에도 주기 계산은 멀쩡하다', () => {
  let { state, customer } = addCustomer(createState(), { name: '김OO', phone: '01011112222' });
  ({ state } = addVisit(state, customer.id, { done: '5월' }, '2026-05-01T14:00:00'));
  ({ state } = addVisit(state, customer.id, { done: '9월' }, '2026-09-04T14:00:00'));
  let dup;
  ({ state, visit: dup } = addVisit(state, customer.id, { done: '9월 또 적음' }, '2026-09-04T17:00:00'));
  ({ state } = deleteVisit(state, dup.id, '2026-09-04T18:00:00'));
  const { state: after } = sweepDeletedVisits(state, '2026-09-15T09:00:00');
  const c = visitCycle(after, customer.id, '2026-09-15');
  assert.equal(c.count, 2);
  assert.equal(c.average, 126);
  assert.equal(c.sinceLast, 11);
});

// ---- 정액권 (금액권) -------------------------------------------------------

function withPass() {
  let { state, customer } = addCustomer(createState(), { name: '김OO', phone: '01011112222' });
  return { state, id: customer.id };
}
const T = (n) => `2026-09-${String(n).padStart(2, '0')}T14:00:00`;

test('금액은 150000 · 150,000 · 15만 · 150000원을 모두 같은 값으로 읽는다', () => {
  for (const v of ['150000', '150,000', '15만', '150000원', ' 150,000 원 ']) assert.equal(cleanAmount(v), 150000);
  assert.equal(cleanAmount('3만'), 30000);
});

test('금액이 말이 안 되면 막고 알려준다', () => {
  for (const v of ['', '   ', '영만원', '-5000', '0', '1.5만', '만']) {
    assert.throws(() => cleanAmount(v), /금액/, `${JSON.stringify(v)}는 막아야 한다`);
  }
});

test('금액은 세 자리마다 쉼표를 찍어 보여준다', () => {
  assert.equal(formatWon(0), '0원');
  assert.equal(formatWon(5000), '5,000원');
  assert.equal(formatWon(150000), '150,000원');
  assert.equal(formatWon(1234567), '1,234,567원');
});

test('충전하면 잔액이 늘고 사용하면 준다', () => {
  let { state, id } = withPass();
  assert.equal(passBalance(state, id), 0, '아직 아무것도 없으면 0원');
  ({ state } = chargePass(state, id, { amount: '30만', note: '3월 충전' }, T(1)));
  assert.equal(passBalance(state, id), 300000);
  ({ state } = usePass(state, id, { amount: '50000' }, T(4)));
  assert.equal(passBalance(state, id), 250000);
  ({ state } = usePass(state, id, { amount: '50000' }, T(20)));
  assert.equal(passBalance(state, id), 200000);
});

test('잔액보다 많이 쓰려 하면 막고 남은 돈을 알려준다', () => {
  let { state, id } = withPass();
  ({ state } = chargePass(state, id, { amount: '150000' }, T(1)));
  assert.throws(() => usePass(state, id, { amount: '150001' }, T(4)), /150,000원.*많습니다/);
  assert.equal(passBalance(state, id), 150000, '막혔으니 잔액은 그대로');
  const ok = usePass(state, id, { amount: '150000' }, T(4));
  assert.equal(passBalance(ok.state, id), 0, '딱 맞게 쓰는 것은 된다');
});

test('내역은 최신순으로, 충전인지 사용인지와 메모를 함께 준다', () => {
  let { state, id } = withPass();
  ({ state } = chargePass(state, id, { amount: '300000', note: '3월 충전' }, T(1)));
  ({ state } = usePass(state, id, { amount: '50000', note: '컷' }, T(4)));
  ({ state } = usePass(state, id, { amount: '80000', note: '펌' }, T(20)));
  const list = passEntriesOf(state, id);
  assert.deepEqual(list.map(p => `${p.kind} ${p.amount} ${p.note}`), ['use 80000 펌', 'use 50000 컷', 'charge 300000 3월 충전']);
});

test('요약은 잔액과 지금까지 넣은 돈·쓴 돈을 함께 준다', () => {
  let { state, id } = withPass();
  ({ state } = chargePass(state, id, { amount: '300000' }, T(1)));
  ({ state } = usePass(state, id, { amount: '50000' }, T(4)));
  ({ state } = chargePass(state, id, { amount: '100000' }, T(10)));
  const sum = passSummary(state, id);
  assert.equal(sum.balance, 350000);
  assert.equal(sum.charged, 400000);
  assert.equal(sum.used, 50000);
  assert.equal(sum.count, 3);
  assert.equal(sum.lastAt, T(10));
});

test('내역 한 줄을 지우면 잔액이 곧바로 따라온다', () => {
  let { state, id } = withPass();
  ({ state } = chargePass(state, id, { amount: '300000' }, T(1)));
  let wrong;
  ({ state, entry: wrong } = usePass(state, id, { amount: '50000' }, T(4)));
  assert.equal(passBalance(state, id), 250000);
  ({ state } = deletePass(state, wrong.id));
  assert.equal(passBalance(state, id), 300000);
  assert.equal(passEntriesOf(state, id).length, 1);
  assert.throws(() => deletePass(state, wrong.id), /찾을 수 없습니다/);
});

test('방문 기록과 함께 넣은 차감은 그 방문 번호를 달고 있다', () => {
  let { state, id } = withPass();
  ({ state } = chargePass(state, id, { amount: '300000' }, T(1)));
  let v;
  ({ state, visit: v } = addVisit(state, id, { done: '볼륨펌' }, T(4)));
  let entry;
  ({ state, entry } = usePass(state, id, { amount: '80000', note: '볼륨펌', visitId: v.id }, T(4)));
  assert.equal(entry.visitId, v.id);
  assert.equal(passEntriesOf(state, id)[0].visitId, v.id);
});

test('지운 고객에게는 충전도 사용도 할 수 없다', () => {
  let { state, id } = withPass();
  ({ state } = deleteCustomer(state, id, T(5)));
  assert.throws(() => chargePass(state, id, { amount: '10000' }, T(5)), /지운 고객/);
  assert.throws(() => usePass(state, id, { amount: '10000' }, T(5)), /지운 고객/);
});

test('고객을 완전히 지우면 정액권 내역도 함께 사라진다', () => {
  let { state, id } = withPass();
  ({ state } = chargePass(state, id, { amount: '300000' }, T(1)));
  ({ state } = deleteCustomer(state, id, T(5)));
  ({ state } = purgeCustomer(state, id));
  assert.deepEqual(state.passes, []);
});

test('고객마다 잔액이 따로 센다', () => {
  let { state, customer: a } = addCustomer(createState(), { name: '김OO', phone: '01011112222' });
  let b;
  ({ state, customer: b } = addCustomer(state, { name: '이OO', phone: '01033334444' }));
  ({ state } = chargePass(state, a.id, { amount: '300000' }, T(1)));
  ({ state } = chargePass(state, b.id, { amount: '100000' }, T(1)));
  ({ state } = usePass(state, a.id, { amount: '50000' }, T(4)));
  assert.equal(passBalance(state, a.id), 250000);
  assert.equal(passBalance(state, b.id), 100000);
});

test('오늘 명단 줄에도 잔액이 함께 온다', () => {
  let { state, id } = withPass();
  ({ state } = chargePass(state, id, { amount: '300000' }, T(1)));
  ({ state } = usePass(state, id, { amount: '50000' }, T(4)));
  ({ state } = markToday(state, id, '2026-09-16', '10:30'));
  assert.equal(todayList(state, '2026-09-16')[0].balance, 250000);
});

test('정액권도 저장했다 꺼내면 그대로다', () => {
  let { state, id } = withPass();
  ({ state } = chargePass(state, id, { amount: '300000', note: '3월 충전' }, T(1)));
  ({ state } = usePass(state, id, { amount: '50000', note: '컷' }, T(4)));
  assert.deepEqual(deserialize(serialize(state)), state);
});

test('정액권 칸이 없던 옛 백업은 잔액 0원으로 시작한다', () => {
  const old = JSON.stringify({
    nextId: 3, customers: [{ id: 1, name: '김OO', phone: '01011112222' }],
    visits: [], today: { date: '', customerIds: [] },
  });
  const state = deserialize(old);
  assert.deepEqual(state.passes, []);
  assert.equal(passBalance(state, 1), 0);
});

// ---- 정액권 안내문 ---------------------------------------------------------
// 손님이 받는 문자다. 아티팩트에서 쓰던 문장과 글자 하나까지 같아야 한다.

const TPL = { head: '정액권 안내드려요', tail: '입니다 : D' };

test('충전과 시술 한 건이 있는 안내문이 쓰던 문장 그대로 나온다', () => {
  const got = buildNotice({
    ...TPL, prev: 194400,
    items: [{ name: '매직C컬', amount: 230000 }],
    topup: { name: 'Gold 예약권', amount: 2500000, terms: '사용기한:~18개월 / 우선예약권:소진시까지', gift: '1000ml 프로틴트리트먼트 & 750ml 두피트리트먼트' },
  });
  assert.equal(got, [
    '* 정액권 안내드려요 *',
    '',
    '- 잔여 정액금 194,400원',
    '- Gold 예약권 2,500,000원',
    '(사용기한:~18개월 / 우선예약권:소진시까지)',
    '- 1000ml 프로틴트리트먼트 & 750ml 두피트리트먼트 선물',
    '',
    '* 시술내역 *',
    '매직C컬 230,000 원 사용하셔서',
    '',
    '남은 정액권은 2,464,400원입니다 : D',
  ].join('\n'));
});

test('날짜를 주면 시술내역 제목에 그 날짜가 붙는다 — 언제 시술받고 언제 정액권을 썼는지', () => {
  const got = buildNotice({
    ...TPL, prev: 194400, date: '2026-09-22',
    items: [{ name: '매직C컬', amount: 230000 }],
    topup: { name: 'Gold 예약권', amount: 2500000, terms: '사용기한:~18개월 / 우선예약권:소진시까지', gift: '1000ml 프로틴트리트먼트 & 750ml 두피트리트먼트' },
  });
  assert.equal(got, [
    '* 정액권 안내드려요 *',
    '',
    '- 잔여 정액금 194,400원',
    '- Gold 예약권 2,500,000원',
    '(사용기한:~18개월 / 우선예약권:소진시까지)',
    '- 1000ml 프로틴트리트먼트 & 750ml 두피트리트먼트 선물',
    '',
    '* 시술내역 (2026.09.22) *',
    '매직C컬 230,000 원 사용하셔서',
    '',
    '남은 정액권은 2,464,400원입니다 : D',
  ].join('\n'));
  const multi = buildNotice({ ...TPL, prev: 300000, date: '2026-09-15', items: [{ name: '여성컷', amount: 30000 }, { name: '염색', amount: 80000 }], topup: null });
  assert.equal(multi.split('\n')[4], '* 시술내역 (2026.09.15) *', '여러 건이어도 제목 한 곳에만');
  const none = buildNotice({ ...TPL, prev: 300000, date: '', items: [{ name: '여성컷', amount: 30000 }], topup: null });
  assert.equal(none.split('\n')[4], '* 시술내역 *', '날짜를 비우면 예전 그대로');
});

test('cleanDate — 안내문·방문 기록이 같은 규칙으로 날짜를 본다', () => {
  const now = '2026-09-22T15:00:00';
  assert.equal(cleanDate('2026-09-15', now), '2026-09-15');
  assert.equal(cleanDate('', now), null, '비우면 null (그대로 둔다)');
  assert.throws(() => cleanDate('2026-09-23', now), /뒤 날짜/);
  assert.throws(() => cleanDate('2026-13-01', now), /날짜는/);
});

test('충전 없이 시술만 있으면 충전 줄이 빠진다', () => {
  const got = buildNotice({ ...TPL, prev: 300000, items: [{ name: '여성컷', amount: 30000 }], topup: null });
  assert.equal(got, [
    '* 정액권 안내드려요 *', '',
    '- 잔여 정액금 300,000원', '',
    '* 시술내역 *',
    '여성컷 30,000 원 사용하셔서', '',
    '남은 정액권은 270,000원입니다 : D',
  ].join('\n'));
});

test('시술이 여러 건이면 줄줄이 적고 합계 줄이 붙는다', () => {
  const got = buildNotice({
    ...TPL, prev: 300000,
    items: [{ name: '여성컷', amount: 30000 }, { name: '염색', amount: 80000 }, { name: '모발클리닉', amount: 50000 }],
    topup: null,
  });
  assert.deepEqual(got.split('\n').slice(4), [
    '* 시술내역 *',
    '여성컷 30,000 원',
    '염색 80,000 원',
    '모발클리닉 50,000 원',
    '합계 160,000 원 사용하셔서',
    '',
    '남은 정액권은 140,000원입니다 : D',
  ]);
});

test('조건이나 선물이 비어 있으면 그 줄은 아예 안 나온다', () => {
  const got = buildNotice({ ...TPL, prev: 0, items: [{ name: '여성컷', amount: 30000 }], topup: { name: '실버권', amount: 500000, terms: '', gift: '' } });
  assert.deepEqual(got.split('\n'), [
    '* 정액권 안내드려요 *', '',
    '- 잔여 정액금 0원',
    '- 실버권 500,000원', '',
    '* 시술내역 *',
    '여성컷 30,000 원 사용하셔서', '',
    '남은 정액권은 470,000원입니다 : D',
  ], '조건 줄과 선물 줄이 통째로 빠진다');
});

test('시술을 아직 안 적었으면 적으라고 안내한다', () => {
  const got = buildNotice({ ...TPL, prev: 100000, items: [], topup: null });
  assert.equal(got.includes('(시술 항목을 적어 주세요)'), true);
  assert.equal(got.includes('남은 정액권은 100,000원입니다 : D'), true);
});

test('이름이나 금액이 빈 줄은 문자에 안 들어간다', () => {
  const items = [{ name: '여성컷', amount: 30000 }, { name: '', amount: 0 }, { name: '  ', amount: '' }];
  assert.equal(noticeUsed(items), 30000);
  assert.equal(buildNotice({ ...TPL, prev: 0, items, topup: null }).includes('원 사용하셔서'), true);
  assert.equal(buildNotice({ ...TPL, prev: 0, items, topup: null }).includes('합계'), false, '한 줄뿐이면 합계를 안 쓴다');
});

test('머리말과 맺음말을 바꾸면 문자도 따라 바뀐다', () => {
  const got = buildNotice({ head: '오늘도 감사합니다', tail: ' 남았습니다.', prev: 50000, items: [{ name: '앞머리컷', amount: 10000 }], topup: null });
  assert.equal(got.split('\n')[0], '* 오늘도 감사합니다 *');
  assert.equal(got.split('\n').pop(), '남은 정액권은 40,000원 남았습니다.');
  const blank = buildNotice({ head: '   ', tail: '', prev: 0, items: [], topup: null });
  assert.equal(blank.split('\n')[0], '* 정액권 안내드려요 *', '머리말을 비우면 기본 문구로');
  assert.equal(blank.split('\n').pop(), '남은 정액권은 0원', '맺음말은 비울 수 있다');
});

test('남는 돈은 이전 잔액 + 충전 - 시술이다', () => {
  assert.equal(noticeRemain({ prev: 194400, items: [{ name: 'a', amount: 230000 }], topup: { amount: 2500000 } }), 2464400);
  assert.equal(noticeRemain({ prev: 100000, items: [{ name: 'a', amount: 30000 }], topup: null }), 70000);
  assert.equal(noticeRemain({ prev: 10000, items: [{ name: 'a', amount: 30000 }], topup: null }), -20000, '모자라면 음수로 보여 준다');
  assert.equal(noticeRemain({ prev: 0, items: [], topup: null }), 0);
});

test('세 자리마다 쉼표를 찍는다', () => {
  assert.equal(comma(0), '0');
  assert.equal(comma(2500000), '2,500,000');
  assert.equal(comma(-20000), '-20,000');
});

test('머리말·맺음말은 저장되고 백업에도 따라간다', () => {
  let state = createState();
  assert.equal(state.settings.head, '정액권 안내드려요');
  assert.equal(state.settings.tail, '입니다 : D');
  ({ state } = setSettings(state, { head: '오늘도 감사합니다' }));
  assert.equal(state.settings.head, '오늘도 감사합니다');
  assert.equal(state.settings.tail, '입니다 : D', '건드리지 않은 것은 그대로');
  assert.deepEqual(deserialize(serialize(state)).settings, state.settings);
});

test('쓴 정액권 상품을 기억했다가 이름으로 찾아 준다', () => {
  let state = createState();
  const gold = { name: 'Gold 예약권', amount: 2500000, terms: '사용기한:~18개월', gift: '트리트먼트' };
  ({ state } = rememberProduct(state, gold));
  ({ state } = rememberProduct(state, { name: '실버권', amount: 500000, terms: '', gift: '' }));
  assert.deepEqual(state.settings.products.map(p => p.name), ['Gold 예약권', '실버권']);
  assert.deepEqual(findProduct(state, 'Gold 예약권'), gold);
  assert.equal(findProduct(state, '없는권'), null);

  // 같은 이름을 다시 쓰면 늘지 않고 최신 내용으로 바뀐다
  ({ state } = rememberProduct(state, { name: 'Gold 예약권', amount: 3000000, terms: '사용기한:~24개월', gift: '' }));
  assert.equal(state.settings.products.length, 2);
  assert.equal(findProduct(state, 'Gold 예약권').amount, 3000000);

  // 이름이 비면 기억하지 않는다
  ({ state } = rememberProduct(state, { name: '  ', amount: 100 }));
  assert.equal(state.settings.products.length, 2);
});

test('설정이 없던 옛 백업도 기본 문구로 열린다', () => {
  const old = JSON.stringify({ nextId: 2, customers: [{ id: 1, name: '김OO' }], visits: [], today: { date: '', customerIds: [] } });
  const state = deserialize(old);
  assert.deepEqual(state.settings, { head: '정액권 안내드려요', tail: '입니다 : D', products: [] });
});

// ---------------------------------------------------------------- V2: 대시보드 재료
const { KINDS, monthlyStats, retention, overdueCustomers } = require('./store.js');

function v2State() {
  // 9월: 김OO(신규, 9/5·9/19 두 번), 이OO(예전 고객, 9/10), 박OO(신규 9/12), 최OO(8월 신규, 9/15 재방문), 정OO(8/1 이후 안 옴, 평소 30일)
  let s = createState();
  let kim, lee, park, choi, jung;
  ({ state: s, customer: kim } = addCustomer(s, { name: '김OO', phone: '01011110001' }));
  ({ state: s, customer: lee } = addCustomer(s, { name: '이OO', phone: '01011110002', isLegacy: true }));
  ({ state: s, customer: park } = addCustomer(s, { name: '박OO', phone: '01011110003' }));
  ({ state: s, customer: choi } = addCustomer(s, { name: '최OO', phone: '01011110004' }));
  ({ state: s, customer: jung } = addCustomer(s, { name: '정OO', phone: '01011110005' }));
  ({ state: s } = addVisit(s, kim.id, { done: '커트', kinds: ['커트'] }, '2026-09-05T11:00:00'));
  ({ state: s } = addVisit(s, kim.id, { done: '뿌리 염색', kinds: ['염색'] }, '2026-09-19T11:00:00'));
  ({ state: s } = addVisit(s, lee.id, { done: '커트+펌', kinds: ['커트', '펌'] }, '2026-09-10T11:00:00'));
  ({ state: s } = addVisit(s, park.id, { done: '커트' }, '2026-09-12T11:00:00'));
  ({ state: s } = addVisit(s, choi.id, { done: '커트', kinds: ['커트'] }, '2026-08-20T11:00:00'));
  ({ state: s } = addVisit(s, choi.id, { done: '커트', kinds: ['커트'] }, '2026-09-15T11:00:00'));
  ({ state: s } = addVisit(s, jung.id, { done: '커트', kinds: ['커트'] }, '2026-06-02T11:00:00'));
  ({ state: s } = addVisit(s, jung.id, { done: '커트', kinds: ['커트'] }, '2026-07-02T11:00:00'));
  ({ state: s } = addVisit(s, jung.id, { done: '커트', kinds: ['커트'] }, '2026-08-01T11:00:00'));
  return { s, kim, lee, park, choi, jung };
}

test('시술 종류 칩은 정해진 것만 받고, 없으면 빈 목록', () => {
  const { state, customer } = addCustomer(createState(), { name: '김OO', phone: '01011110001' });
  const { visit } = addVisit(state, customer.id, { done: '커트', kinds: ['커트', '펌'] }, '2026-09-05T11:00:00');
  assert.deepEqual(visit.kinds, ['커트', '펌']);
  assert.deepEqual(addVisit(state, customer.id, { done: '커트' }, '2026-09-05T11:00:00').visit.kinds, []);
  assert.throws(() => addVisit(state, customer.id, { done: '커트', kinds: ['마사지'] }, '2026-09-05T11:00:00'), /시술 종류/);
  assert.ok(KINDS.includes('커트') && KINDS.includes('기타'));
});

test('예전부터 오던 고객 체크는 만들 때와 고칠 때 둘 다 되고, 옛 데이터는 false', () => {
  let { state, customer } = addCustomer(createState(), { name: '이OO', phone: '01011110002', isLegacy: true });
  assert.equal(customer.isLegacy, true);
  ({ state } = editCustomer(state, customer.id, { name: '이OO', phone: '01011110002', referrer: '', isLegacy: false }));
  assert.equal(state.customers[0].isLegacy, false);
  const old = deserialize(JSON.stringify({ nextId: 2, customers: [{ id: 1, name: '김OO', phone: '01012345678' }], visits: [] }));
  assert.equal(old.customers[0].isLegacy, false);
});

test('월별 집계: 방문 건수와 방문 고객 수를 따로, 신규+재방문=고객 수, 시술별·회차별', () => {
  const { s } = v2State();
  const m = monthlyStats(s, '2026-09');
  assert.equal(m.visits, 5, '김 2 + 이 1 + 박 1 + 최 1');
  assert.equal(m.customers, 4);
  assert.equal(m.newCustomers, 2, '김·박. 이OO은 예전 고객이라 신규 아님');
  assert.equal(m.returning, 2, '이·최');
  assert.equal(m.perCustomer, 1.25);
  assert.deepEqual(m.kinds, { '커트': 3, '펌': 1, '염색': 1, '클리닉': 0, '기타': 0, '미분류': 1 });
  assert.deepEqual(m.rounds, { first: 1, two3: 2, fourPlus: 0, legacy: 1 });
  assert.equal(monthlyStats(s, '2026-05').visits, 0);
});

test('월별 집계는 지운 방문 기록과 지운 고객을 빼고 센다', () => {
  let { s, park } = v2State();
  const parkVisit = visitsOf(s, park.id)[0];
  ({ state: s } = deleteVisit(s, parkVisit.id, '2026-09-20T09:00:00'));
  assert.equal(monthlyStats(s, '2026-09').visits, 4);
  assert.equal(monthlyStats(s, '2026-09').customers, 3);
});

test('신규 정착률: 처음 온 달별로 150일 안에 두 번째 방문한 비율, 아직 기간이 안 지났으면 집계 중', () => {
  const { s } = v2State();
  const now = retention(s, { days: 150, today: '2026-09-20' });
  const sep = now.find(r => r.month === '2026-09');
  assert.deepEqual({ total: sep.total, returned: sep.returned, pending: sep.pending }, { total: 2, returned: 1, pending: true }, '김 돌아옴, 박 아직');
  assert.equal(now.find(r => r.month === '2026-08').returned, 1, '최 8/20 → 9/15');
  assert.ok(!now.some(r => r.month === '2026-07' && r.total > 0), '예전 고객 이OO은 어느 달에도 신규가 아니다');
  const later = retention(s, { days: 150, today: '2027-03-01' });
  assert.equal(later.find(r => r.month === '2026-06').pending, false);
  assert.equal(later.find(r => r.month === '2026-09').returned, 1);
});

test('주기 초과 고객: 평소 주기의 1.5배를 넘긴 고객만, 방문이 한 번뿐이면 제외', () => {
  const { s, jung } = v2State();
  const list = overdueCustomers(s, '2026-09-20', 1.5);
  assert.deepEqual(list.map(o => o.customer.id), [jung.id]);
  assert.equal(list[0].average, 30);
  assert.equal(list[0].sinceLast, 50);
  assert.equal(list[0].lastDate, '2026-08-01');
  assert.deepEqual(overdueCustomers(s, '2026-08-20', 1.5), [], '8/20엔 19일이라 아직');
});


// ---------------------------------------------------------------- 정액권 잔액 맞추기
const { setPassBalance } = require('./store.js');

test('잔액 맞추기: 카드 잔액과 다르면 그 차이만큼 충전 또는 사용 내역이 하나 생긴다', () => {
  let { state: s, customer } = addCustomer(createState(), { name: '김OO', phone: '01011110001' });
  let entry;
  ({ state: s, entry } = setPassBalance(s, customer.id, '300,000원', '2026-09-18T10:00:00'));
  assert.equal(passBalance(s, customer.id), 300000);
  assert.equal(entry.kind, 'charge');
  assert.match(entry.note, /잔액 맞춤/);
  ({ state: s, entry } = setPassBalance(s, customer.id, 250000, '2026-09-18T11:00:00'));
  assert.equal(passBalance(s, customer.id), 250000);
  assert.equal(entry.kind, 'use');
  assert.equal(entry.amount, 50000);
});

test('잔액 맞추기: 같은 금액이면 아무것도 안 생기고, 음수는 거부한다', () => {
  let { state: s, customer } = addCustomer(createState(), { name: '김OO', phone: '01011110001' });
  ({ state: s } = setPassBalance(s, customer.id, 100000, '2026-09-18T10:00:00'));
  const before = s.passes.length;
  const r = setPassBalance(s, customer.id, '100000', '2026-09-18T12:00:00');
  assert.equal(r.entry, null);
  assert.equal(r.state.passes.length, before);
  assert.throws(() => setPassBalance(s, customer.id, -1, '2026-09-18T12:00:00'), /잔액/);
});
