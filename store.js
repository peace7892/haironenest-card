// 상담 카드 저장 규칙. 화면과 무관한 순수 함수만 둔다.
// 브라우저에서는 <script src="store.js">로 읽어 전역 Store를 쓰고, 테스트에서는 require로 읽는다.
// 모든 함수는 기존 state를 바꾸지 않고 새 state를 돌려준다.
const Store = (() => {
  const emptyProfile = () => ({ talk: '', hair: '' });

  function createState() {
    return { nextId: 1, customers: [], visits: [], today: { date: '', entries: [] } };
  }

  // ---- 고객 --------------------------------------------------------------

  const digitsOnly = (v) => (v ?? '').replace(/\D/g, '');

  function cleanPhone(phone) {
    const d = digitsOnly(phone);
    if (d && !/^\d{10,11}$/.test(d)) throw new Error('전화번호는 숫자 10~11자리로 적으세요 (예: 010-1234-5678)');
    return d;
  }

  // 지운 고객(deletedAt)은 목록·검색·번호 중복 검사에서 모두 빠진다.
  // 그래야 지운 고객과 같은 번호로 새 고객을 만들 수 있다.
  const activeCustomers = (state) => state.customers.filter(c => !c.deletedAt);

  function phoneClash(state, phone, exceptId) {
    if (!phone) return null;
    return activeCustomers(state).find(c => c.phone === phone && c.id !== exceptId) ?? null;
  }

  function assertPhoneFree(state, phone, exceptId) {
    const dup = phoneClash(state, phone, exceptId);
    if (dup) throw new Error(`이미 같은 번호의 고객이 있습니다: ${dup.name}`);
  }

  function addCustomer(state, { name, phone, referrer }) {
    const trimmed = (name ?? '').trim();
    if (!trimmed) throw new Error('이름을 입력하세요');
    const clean = cleanPhone(phone);
    assertPhoneFree(state, clean);
    const customer = { id: state.nextId, name: trimmed, phone: clean, referrer: (referrer ?? '').trim(), profile: emptyProfile(), profileHistory: [], deletedAt: null };
    return {
      state: { ...state, nextId: state.nextId + 1, customers: [...state.customers, customer] },
      customer,
    };
  }

  function editCustomer(state, customerId, { name, phone, referrer }) {
    const c = requireCustomer(state, customerId);
    const trimmed = (name ?? '').trim();
    if (!trimmed) throw new Error('이름을 입력하세요');
    const clean = cleanPhone(phone);
    assertPhoneFree(state, clean, customerId);
    const updated = { ...c, name: trimmed, phone: clean, referrer: (referrer ?? '').trim() };
    return {
      state: { ...state, customers: state.customers.map(x => (x.id === customerId ? updated : x)) },
      customer: updated,
    };
  }

  // 목록·명단에서 보일 때: 앞 3자리와 뒤 4자리만. 옛 뒤 4자리 데이터는 ****-1234
  function maskPhone(phone) {
    if (!phone) return '';
    if (phone.length <= 4) return `****-${phone}`;
    const head = phone.slice(0, 3);
    const tail = phone.slice(-4);
    return `${head}-${'*'.repeat(phone.length - 7)}-${tail}`;
  }

  function findCustomers(state, query) {
    const q = (query ?? '').trim();
    const live = activeCustomers(state);
    if (!q) return live;
    const qd = digitsOnly(q);
    return live.filter(c => c.name.includes(q) || (qd && c.phone && c.phone.includes(qd)));
  }

  function findAny(state, customerId) {
    const c = state.customers.find(x => x.id === customerId);
    if (!c) throw new Error('고객을 찾을 수 없습니다');
    return c;
  }

  // 고치기·방문 기록처럼 살아 있는 고객에게만 해야 하는 일은 이걸 쓴다.
  function requireCustomer(state, customerId) {
    const c = findAny(state, customerId);
    if (c.deletedAt) throw new Error('지운 고객입니다. 먼저 되살리세요');
    return c;
  }

  // ---- 지우기 -------------------------------------------------------------
  // 두 단계로 나눈다. deleteCustomer는 목록에서 감추기만 해서 되살릴 수 있고,
  // purgeCustomer는 고객과 그 방문 기록을 정말로 없애 되살릴 수 없다.

  function deleteCustomer(state, customerId, now) {
    const c = requireCustomer(state, customerId);
    const updated = { ...c, deletedAt: now };
    return {
      state: {
        ...state,
        customers: state.customers.map(x => (x.id === customerId ? updated : x)),
        today: { ...state.today, entries: state.today.entries.filter(e => e.customerId !== customerId) },
      },
      customer: updated,
    };
  }

  function restoreCustomer(state, customerId) {
    const c = findAny(state, customerId);
    if (!c.deletedAt) return { state, customer: c };
    const clash = phoneClash(state, c.phone, customerId);
    if (clash) throw new Error(`같은 번호를 쓰는 고객(${clash.name})이 있어 되살릴 수 없습니다`);
    const updated = { ...c, deletedAt: null };
    return {
      state: { ...state, customers: state.customers.map(x => (x.id === customerId ? updated : x)) },
      customer: updated,
    };
  }

  function purgeCustomer(state, customerId) {
    findAny(state, customerId);
    return {
      state: {
        ...state,
        customers: state.customers.filter(x => x.id !== customerId),
        visits: state.visits.filter(v => v.customerId !== customerId),
        today: { ...state.today, entries: state.today.entries.filter(e => e.customerId !== customerId) },
      },
    };
  }

  // 지운 고객 목록. 최근에 지운 것이 위로 온다.
  function deletedCustomers(state) {
    return state.customers
      .filter(c => c.deletedAt)
      .sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : a.deletedAt > b.deletedAt ? -1 : b.id - a.id));
  }

  // 고정 정보(고객이 한 말·생활·직업 / 얼굴형·모질·두상). 고치면 이전 내용이 이력에 남는다.
  function setProfile(state, customerId, { talk, hair }, now) {
    const c = requireCustomer(state, customerId);
    const next = { talk: (talk ?? '').trim(), hair: (hair ?? '').trim() };
    const wasEmpty = !c.profile.talk && !c.profile.hair;
    const unchanged = c.profile.talk === next.talk && c.profile.hair === next.hair;
    const history = wasEmpty || unchanged ? c.profileHistory : [...c.profileHistory, { ...c.profile, replacedAt: now }];
    const updated = { ...c, profile: next, profileHistory: history };
    return {
      state: { ...state, customers: state.customers.map(x => (x.id === customerId ? updated : x)) },
      customer: updated,
    };
  }

  // ---- 방문 기록 (오늘 시술과 이유 / 다음 방향) -----------------------------

  function visitFields({ done, next }) {
    const d = (done ?? '').trim();
    if (!d) throw new Error('오늘 시술 내용을 입력하세요');
    return { done: d, next: (next ?? '').trim() };
  }

  function addVisit(state, customerId, fields, now) {
    requireCustomer(state, customerId);
    const visit = { id: state.nextId, customerId, ...visitFields(fields), createdAt: now, history: [], deletedAt: null };
    return {
      state: { ...state, nextId: state.nextId + 1, visits: [...state.visits, visit] },
      visit,
    };
  }

  function editVisit(state, visitId, fields, now) {
    const clean = visitFields(fields);
    const target = state.visits.find(v => v.id === visitId);
    if (!target) throw new Error('방문 기록을 찾을 수 없습니다');
    if (target.deletedAt) throw new Error('지운 기록입니다. 먼저 되살리세요');
    const updated = { ...target, ...clean, history: [...target.history, { done: target.done, next: target.next, replacedAt: now }] };
    return {
      state: { ...state, visits: state.visits.map(v => (v.id === visitId ? updated : v)) },
      visit: updated,
    };
  }

  // 지운 기록은 여기서 빠지므로, 방문 목록과 주기 계산이 모두 알아서 따라간다.
  function visitsOf(state, customerId) {
    return state.visits
      .filter(v => v.customerId === customerId && !v.deletedAt)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.id - a.id));
  }

  // ---- 방문 기록 지우기 ----------------------------------------------------
  // 고객 지우기와 같은 두 단계. [지우기]는 감추기만 하고, [완전히 지우기]라야 없앤다.

  function requireVisit(state, visitId) {
    const v = state.visits.find(x => x.id === visitId);
    if (!v) throw new Error('방문 기록을 찾을 수 없습니다');
    return v;
  }

  function deleteVisit(state, visitId, now) {
    const v = requireVisit(state, visitId);
    if (v.deletedAt) return { state, visit: v };
    const updated = { ...v, deletedAt: now };
    return {
      state: { ...state, visits: state.visits.map(x => (x.id === visitId ? updated : x)) },
      visit: updated,
    };
  }

  function restoreVisit(state, visitId) {
    const v = requireVisit(state, visitId);
    if (!v.deletedAt) return { state, visit: v };
    const updated = { ...v, deletedAt: null };
    return {
      state: { ...state, visits: state.visits.map(x => (x.id === visitId ? updated : x)) },
      visit: updated,
    };
  }

  function purgeVisit(state, visitId) {
    requireVisit(state, visitId);
    return { state: { ...state, visits: state.visits.filter(x => x.id !== visitId) } };
  }

  // 그 고객의 지운 기록. 최근에 지운 것이 위로.
  function deletedVisitsOf(state, customerId) {
    return state.visits
      .filter(v => v.customerId === customerId && v.deletedAt)
      .sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : a.deletedAt > b.deletedAt ? -1 : b.id - a.id));
  }

  // 지운 기록을 보관하는 기간. 이 날수가 지나면 저절로 없어진다. 바꾸려면 이 한 줄만 고친다.
  const TRASH_DAYS = 7;

  // 지운 지 TRASH_DAYS가 지난 방문 기록을 없앤다. 앱을 열 때 한 번 돈다.
  // 지운 고객은 건드리지 않는다. 고객 하나에는 몇 해치 기록이 딸려 있어서
  // 저절로 없애기에는 무게가 다르다.
  function sweepDeletedVisits(state, now) {
    const kept = state.visits.filter(v => !v.deletedAt || daysBetween(v.deletedAt, now) < TRASH_DAYS);
    const removed = state.visits.length - kept.length;
    return removed === 0 ? { state, removed: 0 } : { state: { ...state, visits: kept }, removed };
  }

  // 저절로 사라지기까지 남은 날. 지운 기록이 아니면 null.
  function daysLeftInTrash(visit, now) {
    if (!visit || !visit.deletedAt) return null;
    return Math.max(0, TRASH_DAYS - daysBetween(visit.deletedAt, now));
  }

  // ---- 방문 주기 ----------------------------------------------------------
  // 날짜만 보고 센다. 같은 날 두 번 와도 0일, 시각은 따지지 않는다.

  const dayNumber = (iso) => {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  };
  const daysBetween = (from, to) => dayNumber(to) - dayNumber(from);

  // 최신순 방문 기록에 '이전 방문에서 며칠 만'(sincePrev)을 붙인다. 맨 처음 방문은 null.
  function visitsWithGaps(state, customerId) {
    const desc = visitsOf(state, customerId);
    return desc.map((v, i) => ({ ...v, sincePrev: desc[i + 1] ? daysBetween(desc[i + 1].createdAt, v.createdAt) : null }));
  }

  // date(오늘) 기준 한 줄 요약.
  // lastDate·sinceLast는 오늘 것을 뺀 '지난번'을 가리켜서, 오늘 기록을 남겨도 값이 흔들리지 않는다.
  function visitCycle(state, customerId, date) {
    const desc = visitsOf(state, customerId);
    const before = desc.filter(v => v.createdAt.slice(0, 10) < date);
    const gaps = [];
    for (let i = 0; i < desc.length - 1; i++) gaps.push(daysBetween(desc[i + 1].createdAt, desc[i].createdAt));
    return {
      count: desc.length,
      lastDate: before.length ? before[0].createdAt.slice(0, 10) : '',
      sinceLast: before.length ? daysBetween(before[0].createdAt, date) : null,
      average: gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null,
    };
  }

  // ---- 오늘 명단 ----------------------------------------------------------

  // 명단 한 줄은 { customerId, at }. at은 'HH:MM'이거나 ''(시간 안 정함).
  // 시간을 적은 사람이 시간순으로 앞에 오고, 안 적은 사람은 올린 순서대로 뒤에 붙는다.

  const pad2 = (n) => String(n).padStart(2, '0');

  // 예약 시간 후보. 영업시간이 바뀌면 이 세 줄만 고치면 명단의 고르는 칸이 따라 바뀐다.
  const OPEN_MIN = 10 * 60;   // 오전 10시부터
  const CLOSE_MIN = 19 * 60;  // 마지막 예약 19시
  const STEP_MIN = 30;        // 30분 간격

  function timeSlots() {
    const out = [];
    for (let m = OPEN_MIN; m <= CLOSE_MIN; m += STEP_MIN) out.push(`${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`);
    return out;
  }

  // '10:00' '9:30' '930' '1030' '10' 을 모두 받아 'HH:MM'으로 맞춘다. 빈 값은 빈 값 그대로.
  function cleanTime(at) {
    const raw = (at ?? '').trim();
    if (!raw) return '';
    const d = raw.replace(/\D/g, '');
    let h, m;
    if (/^\d{1,2}$/.test(d)) { h = Number(d); m = 0; }
    else if (/^\d{3}$/.test(d)) { h = Number(d.slice(0, 1)); m = Number(d.slice(1)); }
    else if (/^\d{4}$/.test(d)) { h = Number(d.slice(0, 2)); m = Number(d.slice(2)); }
    else throw new Error('시간은 10:00 처럼 적으세요');
    if (h > 23 || m > 59) throw new Error('시간은 10:00 처럼 적으세요');
    return `${pad2(h)}:${pad2(m)}`;
  }

  const entriesOn = (state, date) => (state.today.date === date ? state.today.entries : []);

  // 이미 명단에 있으면 시간만 채운다(비워 부르면 적어둔 시간을 지우지 않는다).
  function markToday(state, customerId, date, at) {
    requireCustomer(state, customerId);
    const time = cleanTime(at);
    const entries = entriesOn(state, date);
    const already = entries.some(e => e.customerId === customerId);
    const next = already
      ? entries.map(e => (e.customerId === customerId ? { ...e, at: time || e.at } : e))
      : [...entries, { customerId, at: time }];
    return { state: { ...state, today: { date, entries: next } } };
  }

  function setTodayTime(state, customerId, date, at) {
    const time = cleanTime(at);
    const entries = entriesOn(state, date);
    if (!entries.some(e => e.customerId === customerId)) return { state };
    return { state: { ...state, today: { date, entries: entries.map(e => (e.customerId === customerId ? { ...e, at: time } : e)) } } };
  }

  // 예약이 취소되거나 잘못 올린 사람을 명단에서만 뺀다. 고객과 기록은 그대로다.
  function unmarkToday(state, customerId, date) {
    const entries = entriesOn(state, date);
    return { state: { ...state, today: { date, entries: entries.filter(e => e.customerId !== customerId) } } };
  }

  function todayList(state, date) {
    if (state.today.date !== date) return [];
    const live = state.today.entries.filter(e => {
      const c = state.customers.find(x => x.id === e.customerId);
      return c && !c.deletedAt;
    });
    const byTime = live
      .map((e, i) => ({ e, i }))
      .sort((a, b) => {
        if (a.e.at && b.e.at) return a.e.at < b.e.at ? -1 : a.e.at > b.e.at ? 1 : a.i - b.i;
        if (a.e.at) return -1;
        if (b.e.at) return 1;
        return a.i - b.i;
      });
    return byTime.map(({ e }, idx) => {
      const customer = state.customers.find(c => c.id === e.customerId);
      const visits = visitsOf(state, e.customerId);
      const todays = visits.filter(v => v.createdAt.startsWith(date));
      const previous = visits.find(v => !v.createdAt.startsWith(date));
      const cycle = visitCycle(state, e.customerId, date);
      return { order: idx + 1, at: e.at, customer, recorded: todays.length > 0, lastNext: previous ? previous.next : '', ...cycle };
    });
  }

  // ---- 저장 ---------------------------------------------------------------

  function serialize(state) {
    return JSON.stringify(state);
  }

  function deserialize(raw) {
    if (!raw) return createState();
    let parsed;
    try { parsed = JSON.parse(raw); } catch { return createState(); }
    if (!parsed || !Array.isArray(parsed.customers)) return createState();
    return migrate(parsed);
  }

  // 이전 버전(자유 메모 한 칸: memos[].text)을 방문 기록(visits[].done)으로 옮긴다.
  function migrate(p) {
    const customers = p.customers.map(({ last4, ...c }) => ({
      ...c, phone: c.phone ?? last4 ?? '', referrer: c.referrer ?? '', profile: c.profile ?? emptyProfile(), profileHistory: c.profileHistory ?? [], deletedAt: c.deletedAt ?? null,
    }));
    const fromMemos = (p.memos ?? []).map(m => ({
      id: m.id, customerId: m.customerId, done: m.text, next: '', createdAt: m.createdAt,
      history: (m.history ?? []).map(h => ({ done: h.text, next: '', replacedAt: h.replacedAt })),
    }));
    const visits = [...(p.visits ?? []), ...fromMemos].map(v => ({ ...v, deletedAt: v.deletedAt ?? null }));
    const today = migrateToday(p.today);
    return { nextId: p.nextId ?? 1, customers, visits, today };
  }

  // 옛 백업은 오늘 명단이 번호 목록(customerIds)이었다. 시간 없는 줄로 옮긴다.
  function migrateToday(t) {
    if (!t || typeof t.date !== 'string') return { date: '', entries: [] };
    if (Array.isArray(t.entries)) {
      return { date: t.date, entries: t.entries.filter(e => e && typeof e.customerId === 'number').map(e => ({ customerId: e.customerId, at: e.at ?? '' })) };
    }
    if (Array.isArray(t.customerIds)) {
      return { date: t.date, entries: t.customerIds.map(id => ({ customerId: id, at: '' })) };
    }
    return { date: '', entries: [] };
  }

  return { createState, timeSlots, visitsWithGaps, visitCycle, addCustomer, editCustomer, deleteCustomer, restoreCustomer, purgeCustomer, deletedCustomers, maskPhone, findCustomers, setProfile, addVisit, editVisit, deleteVisit, restoreVisit, purgeVisit, deletedVisitsOf, sweepDeletedVisits, daysLeftInTrash, visitsOf, markToday, setTodayTime, unmarkToday, todayList, serialize, deserialize };
})();

if (typeof module !== 'undefined') module.exports = Store;
