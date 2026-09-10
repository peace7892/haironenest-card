// 상담 카드 저장 규칙. 화면과 무관한 순수 함수만 둔다.
// 모든 함수는 기존 state를 바꾸지 않고 새 state를 돌려준다.

export function createState() {
  return { nextId: 1, customers: [], memos: [] };
}

export function addCustomer(state, { name, last4 }) {
  const trimmed = (name ?? '').trim();
  if (!trimmed) throw new Error('이름을 입력하세요');
  const digits = (last4 ?? '').trim();
  if (digits && !/^\d{4}$/.test(digits)) throw new Error('전화번호 뒤 4자리는 숫자 4개로 적으세요');
  const customer = { id: state.nextId, name: trimmed, last4: digits };
  return {
    state: { ...state, nextId: state.nextId + 1, customers: [...state.customers, customer] },
    customer,
  };
}

export function findCustomers(state, query) {
  const q = (query ?? '').trim();
  if (!q) return state.customers;
  return state.customers.filter(c => c.name.includes(q) || (c.last4 && c.last4.includes(q)));
}

function requireText(text) {
  const trimmed = (text ?? '').trim();
  if (!trimmed) throw new Error('메모를 입력하세요');
  return trimmed;
}

export function addMemo(state, customerId, text, now) {
  if (!state.customers.some(c => c.id === customerId)) throw new Error('고객을 찾을 수 없습니다');
  const memo = {
    id: state.nextId,
    customerId,
    text: requireText(text),
    createdAt: now,
    history: [],
  };
  return {
    state: { ...state, nextId: state.nextId + 1, memos: [...state.memos, memo] },
    memo,
  };
}

export function editMemo(state, memoId, newText, now) {
  const text = requireText(newText);
  const target = state.memos.find(m => m.id === memoId);
  if (!target) throw new Error('메모를 찾을 수 없습니다');
  const updated = { ...target, text, history: [...target.history, { text: target.text, replacedAt: now }] };
  return {
    state: { ...state, memos: state.memos.map(m => (m.id === memoId ? updated : m)) },
    memo: updated,
  };
}

export function memosOf(state, customerId) {
  return state.memos
    .filter(m => m.customerId === customerId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.id - a.id));
}

export function serialize(state) {
  return JSON.stringify(state);
}

export function deserialize(raw) {
  if (!raw) return createState();
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.customers) || !Array.isArray(parsed.memos)) return createState();
    return parsed;
  } catch {
    return createState();
  }
}
