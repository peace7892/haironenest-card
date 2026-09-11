// 상담 카드 저장 규칙. 화면과 무관한 순수 함수만 둔다.
// 브라우저에서는 <script src="store.js">로 읽어 전역 Store를 쓰고, 테스트에서는 require로 읽는다.
// 모든 함수는 기존 state를 바꾸지 않고 새 state를 돌려준다.
const Store = (() => {
  const emptyProfile = () => ({ talk: '', hair: '' });

  function createState() {
    return { nextId: 1, customers: [], visits: [], today: { date: '', customerIds: [] } };
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
        today: { ...state.today, customerIds: state.today.customerIds.filter(id => id !== customerId) },
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
        today: { ...state.today, customerIds: state.today.customerIds.filter(id => id !== customerId) },
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
    const visit = { id: state.nextId, customerId, ...visitFields(fields), createdAt: now, history: [] };
    return {
      state: { ...state, nextId: state.nextId + 1, visits: [...state.visits, visit] },
      visit,
    };
  }

  function editVisit(state, visitId, fields, now) {
    const clean = visitFields(fields);
    const target = state.visits.find(v => v.id === visitId);
    if (!target) throw new Error('방문 기록을 찾을 수 없습니다');
    const updated = { ...target, ...clean, history: [...target.history, { done: target.done, next: target.next, replacedAt: now }] };
    return {
      state: { ...state, visits: state.visits.map(v => (v.id === visitId ? updated : v)) },
      visit: updated,
    };
  }

  function visitsOf(state, customerId) {
    return state.visits
      .filter(v => v.customerId === customerId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.id - a.id));
  }

  // ---- 오늘 명단 ----------------------------------------------------------

  function markToday(state, customerId, date) {
    requireCustomer(state, customerId);
    const ids = state.today.date === date ? state.today.customerIds : [];
    if (ids.includes(customerId)) return { state };
    return { state: { ...state, today: { date, customerIds: [...ids, customerId] } } };
  }

  function todayList(state, date) {
    if (state.today.date !== date) return [];
    const live = (id) => { const c = state.customers.find(x => x.id === id); return c && !c.deletedAt; };
    return state.today.customerIds.filter(live).map(id => {
      const customer = state.customers.find(c => c.id === id);
      const visits = visitsOf(state, id);
      const todays = visits.filter(v => v.createdAt.startsWith(date));
      const previous = visits.find(v => !v.createdAt.startsWith(date));
      return { customer, recorded: todays.length > 0, lastNext: previous ? previous.next : '' };
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
    const visits = [...(p.visits ?? []), ...fromMemos];
    const today = p.today && Array.isArray(p.today.customerIds) ? p.today : { date: '', customerIds: [] };
    return { nextId: p.nextId ?? 1, customers, visits, today };
  }

  return { createState, addCustomer, editCustomer, deleteCustomer, restoreCustomer, purgeCustomer, deletedCustomers, maskPhone, findCustomers, setProfile, addVisit, editVisit, visitsOf, markToday, todayList, serialize, deserialize };
})();

if (typeof module !== 'undefined') module.exports = Store;
