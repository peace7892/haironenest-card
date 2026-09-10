// 상담 카드 저장 규칙. 화면과 무관한 순수 함수만 둔다.
// 브라우저에서는 <script src="store.js">로 읽어 전역 Store를 쓰고, 테스트에서는 require로 읽는다.
// 모든 함수는 기존 state를 바꾸지 않고 새 state를 돌려준다.
const Store = (() => {
  const emptyProfile = () => ({ talk: '', hair: '' });

  function createState() {
    return { nextId: 1, customers: [], visits: [], today: { date: '', customerIds: [] } };
  }

  // ---- 고객 --------------------------------------------------------------

  function addCustomer(state, { name, last4 }) {
    const trimmed = (name ?? '').trim();
    if (!trimmed) throw new Error('이름을 입력하세요');
    const digits = (last4 ?? '').trim();
    if (digits && !/^\d{4}$/.test(digits)) throw new Error('전화번호 뒤 4자리는 숫자 4개로 적으세요');
    const customer = { id: state.nextId, name: trimmed, last4: digits, profile: emptyProfile(), profileHistory: [] };
    return {
      state: { ...state, nextId: state.nextId + 1, customers: [...state.customers, customer] },
      customer,
    };
  }

  function findCustomers(state, query) {
    const q = (query ?? '').trim();
    if (!q) return state.customers;
    return state.customers.filter(c => c.name.includes(q) || (c.last4 && c.last4.includes(q)));
  }

  function requireCustomer(state, customerId) {
    const c = state.customers.find(x => x.id === customerId);
    if (!c) throw new Error('고객을 찾을 수 없습니다');
    return c;
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
    return state.today.customerIds.map(id => {
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
    const customers = p.customers.map(c => ({ ...c, profile: c.profile ?? emptyProfile(), profileHistory: c.profileHistory ?? [] }));
    const fromMemos = (p.memos ?? []).map(m => ({
      id: m.id, customerId: m.customerId, done: m.text, next: '', createdAt: m.createdAt,
      history: (m.history ?? []).map(h => ({ done: h.text, next: '', replacedAt: h.replacedAt })),
    }));
    const visits = [...(p.visits ?? []), ...fromMemos];
    const today = p.today && Array.isArray(p.today.customerIds) ? p.today : { date: '', customerIds: [] };
    return { nextId: p.nextId ?? 1, customers, visits, today };
  }

  return { createState, addCustomer, findCustomers, setProfile, addVisit, editVisit, visitsOf, markToday, todayList, serialize, deserialize };
})();

if (typeof module !== 'undefined') module.exports = Store;
