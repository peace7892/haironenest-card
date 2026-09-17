// 상담 카드 저장 규칙. 화면과 무관한 순수 함수만 둔다.
// 브라우저에서는 <script src="store.js">로 읽어 전역 Store를 쓰고, 테스트에서는 require로 읽는다.
// 모든 함수는 기존 state를 바꾸지 않고 새 state를 돌려준다.
const Store = (() => {
  const emptyProfile = () => ({ talk: '', hair: '' });
  const KINDS = ['커트', '펌', '염색', '클리닉', '기타'];

  function createState() {
    return { nextId: 1, customers: [], visits: [], passes: [], settings: defaultSettings(), today: { date: '', entries: [] }, dailyCounts: {} };
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

  function addCustomer(state, { name, phone, referrer, isLegacy }) {
    const trimmed = (name ?? '').trim();
    if (!trimmed) throw new Error('이름을 입력하세요');
    const clean = cleanPhone(phone);
    assertPhoneFree(state, clean);
    const customer = { id: state.nextId, name: trimmed, phone: clean, referrer: (referrer ?? '').trim(), isLegacy: !!isLegacy, profile: emptyProfile(), profileHistory: [], deletedAt: null };
    return {
      state: { ...state, nextId: state.nextId + 1, customers: [...state.customers, customer] },
      customer,
    };
  }

  function editCustomer(state, customerId, { name, phone, referrer, isLegacy }) {
    const c = requireCustomer(state, customerId);
    const trimmed = (name ?? '').trim();
    if (!trimmed) throw new Error('이름을 입력하세요');
    const clean = cleanPhone(phone);
    assertPhoneFree(state, clean, customerId);
    const updated = { ...c, name: trimmed, phone: clean, referrer: (referrer ?? '').trim(), isLegacy: isLegacy === undefined ? !!c.isLegacy : !!isLegacy };
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
        passes: state.passes.filter(x => x.customerId !== customerId),
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

  function visitFields({ done, next, kinds }) {
    const d = (done ?? '').trim();
    if (!d) throw new Error('오늘 시술 내용을 입력하세요');
    const ks = Array.isArray(kinds) ? kinds : [];
    const bad = ks.find(k => !KINDS.includes(k));
    if (bad) throw new Error(`시술 종류는 ${KINDS.join('·')} 중에서 고르세요`);
    return { done: d, next: (next ?? '').trim(), kinds: [...new Set(ks)] };
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

  // ---- 정액권 (금액권) -----------------------------------------------------
  // 충전(+)과 사용(-)을 쌓고 그 합이 잔액이다. 횟수권은 쓰지 않는다.
  // 돈 계산의 원본은 핸드SOS다. 여기 숫자는 시술 중에 카드만 보고도 알려고 두는 것이다.

  const formatWon = (n) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}원`;

  // '150000' '150,000' '150000원' '15만'을 모두 받는다.
  function cleanAmount(v) {
    const raw = String(v ?? '').trim().replace(/[\s,원]/g, '');
    if (!raw) throw new Error('금액을 적으세요');
    const man = /^(\d+)만$/.exec(raw);
    const n = man ? Number(man[1]) * 10000 : (/^\d+$/.test(raw) ? Number(raw) : NaN);
    if (!Number.isInteger(n) || n <= 0) throw new Error('금액은 숫자로 적으세요 (예: 150000 또는 15만)');
    return n;
  }

  const passesOf = (state, customerId) => state.passes.filter(p => p.customerId === customerId);

  // 최신순. 같은 시각이면 나중에 넣은 것이 위로.
  function passEntriesOf(state, customerId) {
    return passesOf(state, customerId).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : b.id - a.id));
  }

  function passBalance(state, customerId) {
    return passesOf(state, customerId).reduce((sum, p) => sum + (p.kind === 'charge' ? p.amount : -p.amount), 0);
  }

  function passSummary(state, customerId) {
    const list = passEntriesOf(state, customerId);
    return {
      balance: passBalance(state, customerId),
      charged: list.filter(p => p.kind === 'charge').reduce((s, p) => s + p.amount, 0),
      used: list.filter(p => p.kind === 'use').reduce((s, p) => s + p.amount, 0),
      count: list.length,
      lastAt: list.length ? list[0].at : '',
    };
  }

  function addPass(state, customerId, kind, { amount, note, visitId }, now) {
    requireCustomer(state, customerId);
    const won = cleanAmount(amount);
    if (kind === 'use') {
      const left = passBalance(state, customerId);
      if (won > left) throw new Error(`정액권 잔액(${formatWon(left)})보다 많습니다`);
    }
    const entry = { id: state.nextId, customerId, kind, amount: won, note: (note ?? '').trim(), at: now, visitId: visitId ?? null };
    return { state: { ...state, nextId: state.nextId + 1, passes: [...state.passes, entry] }, entry };
  }

  const chargePass = (state, customerId, fields, now) => addPass(state, customerId, 'charge', fields, now);
  const usePass = (state, customerId, fields, now) => addPass(state, customerId, 'use', fields, now);

  // 정액권 내역은 한 줄짜리 숫자라 바로 지운다. 잔액이 눈앞에서 바뀌므로 실수를 곧바로 안다.
  function deletePass(state, entryId) {
    if (!state.passes.some(p => p.id === entryId)) throw new Error('정액권 내역을 찾을 수 없습니다');
    return { state: { ...state, passes: state.passes.filter(p => p.id !== entryId) } };
  }

  // ---- 정액권 안내문 -------------------------------------------------------
  // 원장님이 쓰시던 안내문 아티팩트의 문장을 그대로 옮겼다. 손님이 받는 문자라
  // 줄 순서와 띄어쓰기('230,000 원'처럼 원 앞 한 칸)까지 건드리지 않는다.

  const comma = (n) => String(Math.trunc(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  const defaultSettings = () => ({ head: '정액권 안내드려요', tail: '입니다 : D', products: [] });

  const noticeItems = (items) => (items ?? []).filter(it => (it.name ?? '').trim() || Number(it.amount));
  const noticeUsed = (items) => noticeItems(items).reduce((sum, it) => sum + (Number(it.amount) || 0), 0);

  function noticeRemain({ prev, items, topup }) {
    return (Number(prev) || 0) + (topup ? (Number(topup.amount) || 0) : 0) - noticeUsed(items);
  }

  function buildNotice({ head, tail, prev, items, topup }) {
    const rows = noticeItems(items);
    const L = [];
    L.push(`* ${(head ?? '').trim() || '정액권 안내드려요'} *`);
    L.push('');
    L.push(`- 잔여 정액금 ${comma(prev)}원`);
    if (topup) {
      L.push(`- ${(topup.name ?? '').trim() || '정액권'} ${comma(topup.amount)}원`);
      if ((topup.terms ?? '').trim()) L.push(`(${topup.terms.trim()})`);
      if ((topup.gift ?? '').trim()) L.push(`- ${topup.gift.trim()} 선물`);
    }
    L.push('');
    L.push('* 시술내역 *');
    if (rows.length === 0) L.push('(시술 항목을 적어 주세요)');
    else if (rows.length === 1) L.push(`${rows[0].name} ${comma(rows[0].amount)} 원 사용하셔서`);
    else {
      rows.forEach(it => L.push(`${it.name} ${comma(it.amount)} 원`));
      L.push(`합계 ${comma(noticeUsed(rows))} 원 사용하셔서`);
    }
    L.push('');
    L.push(`남은 정액권은 ${comma(noticeRemain({ prev, items: rows, topup }))}원${tail ?? ''}`);
    return L.join('\n');
  }

  function setSettings(state, patch) {
    return { state: { ...state, settings: { ...state.settings, ...patch } } };
  }

  // 한 번 쓴 정액권 상품을 기억해 두었다가, 다음에 이름만 고르면 나머지가 채워지게 한다.
  function rememberProduct(state, { name, amount, terms, gift }) {
    const n = (name ?? '').trim();
    if (!n) return { state };
    const item = { name: n, amount: Number(amount) || 0, terms: (terms ?? '').trim(), gift: (gift ?? '').trim() };
    const has = state.settings.products.some(p => p.name === n);
    const products = has ? state.settings.products.map(p => (p.name === n ? item : p)) : [...state.settings.products, item];
    return { state: { ...state, settings: { ...state.settings, products } } };
  }

  const findProduct = (state, name) => state.settings.products.find(p => p.name === (name ?? '').trim()) ?? null;

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
      return { order: idx + 1, at: e.at, customer, recorded: todays.length > 0, lastNext: previous ? previous.next : '', balance: passBalance(state, e.customerId), ...cycle };
    });
  }

  // ---- V2: 핸드SOS 인원, 월별 집계, 정착률, 주기 초과, 주간 기록률 ----------

  function setDailyCount(state, date, count) {
    const n = Number(count);
    if (!Number.isInteger(n) || n < 0) throw new Error('인원은 0 이상의 숫자로 적으세요');
    return { state: { ...state, dailyCounts: { ...(state.dailyCounts ?? {}), [date]: n } } };
  }
  function dailyCount(state, date) {
    const v = (state.dailyCounts ?? {})[date];
    return Number.isInteger(v) ? v : null;
  }

  const liveCustomers = (state) => state.customers.filter(c => !c.deletedAt);
  const ascVisits = (state, customerId) => [...visitsOf(state, customerId)].reverse(); // 오래된 것부터
  const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;

  // 한 달의 방문 건수·고객 수·신규·재방문·시술별·회차별
  function monthlyStats(state, month) {
    const kinds = Object.fromEntries(KINDS.map(k => [k, 0]));
    kinds['미분류'] = 0;
    let visits = 0, customers = 0, newCustomers = 0;
    const rounds = { first: 0, two3: 0, fourPlus: 0, legacy: 0 };
    for (const c of liveCustomers(state)) {
      const all = ascVisits(state, c.id);
      const inMonth = all.filter(v => v.createdAt.startsWith(month));
      if (inMonth.length === 0) continue;
      customers += 1;
      visits += inMonth.length;
      for (const v of inMonth) {
        if (!v.kinds || v.kinds.length === 0) kinds['미분류'] += 1;
        else for (const k of v.kinds) kinds[k] = (kinds[k] ?? 0) + 1;
      }
      if (!c.isLegacy && all[0].createdAt.startsWith(month)) newCustomers += 1;
      if (c.isLegacy) rounds.legacy += 1;
      else {
        const round = all.indexOf(inMonth[inMonth.length - 1]) + 1; // 그 달 마지막 방문이 몇 번째인지
        if (round === 1) rounds.first += 1; else if (round <= 3) rounds.two3 += 1; else rounds.fourPlus += 1;
      }
    }
    const returning = customers - newCustomers;
    return {
      month, visits, customers, newCustomers, returning,
      perCustomer: customers ? Math.round((visits / customers) * 100) / 100 : 0,
      returningRatio: customers ? Math.round((returning / customers) * 100) / 100 : 0,
      kinds, rounds,
    };
  }

  // 처음 온 달별로, days 안에 두 번째 방문이 있었던 비율 (예전 고객 제외)
  function retention(state, { days = 150, today }) {
    const byMonth = {};
    for (const c of liveCustomers(state)) {
      if (c.isLegacy) continue;
      const all = ascVisits(state, c.id);
      if (all.length === 0) continue;
      const first = all[0].createdAt.slice(0, 10);
      const month = first.slice(0, 7);
      const row = byMonth[month] ?? (byMonth[month] = { month, total: 0, returned: 0 });
      row.total += 1;
      if (all.length > 1 && daysBetween(first, all[1].createdAt.slice(0, 10)) <= days) row.returned += 1;
    }
    return Object.values(byMonth).sort((a, b) => (a.month < b.month ? -1 : 1)).map(r => {
      const end = new Date(r.month + '-01T00:00:00');
      end.setMonth(end.getMonth() + 1); end.setDate(0); // 그 달 말일
      end.setDate(end.getDate() + days);
      return { ...r, pending: today < iso(end), rate: r.total ? Math.round((r.returned / r.total) * 100) / 100 : 0 };
    });
  }

  // 평소 주기의 factor배를 넘겼는데 안 온 고객. 방문이 한 번뿐이면 평소 주기가 없어 제외
  function overdueCustomers(state, today, factor = 1.5) {
    const out = [];
    for (const c of liveCustomers(state)) {
      const cyc = visitCycle(state, c.id, today);
      if (cyc.average === null || cyc.sinceLast === null) continue;
      if (cyc.sinceLast > cyc.average * factor) out.push({ customer: c, lastDate: cyc.lastDate, average: cyc.average, sinceLast: cyc.sinceLast });
    }
    return out.sort((a, b) => b.sinceLast - a.sinceLast);
  }

  // 이번 주(월~일) 카드 기록 건수와 핸드SOS 인원 합
  function weeklyRecordRate(state, today) {
    const d = new Date(today + 'T00:00:00');
    const mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const from = iso(mon), to = iso(sun);
    let recorded = 0;
    for (const c of liveCustomers(state)) for (const v of visitsOf(state, c.id)) {
      const day = v.createdAt.slice(0, 10);
      if (day >= from && day <= to) recorded += 1;
    }
    let handsos = null;
    for (const [day, n] of Object.entries(state.dailyCounts ?? {})) {
      if (day >= from && day <= to && Number.isInteger(n)) handsos = (handsos ?? 0) + n;
    }
    return { from, to, recorded, handsos };
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
      ...c, phone: c.phone ?? last4 ?? '', referrer: c.referrer ?? '', isLegacy: !!c.isLegacy, profile: c.profile ?? emptyProfile(), profileHistory: c.profileHistory ?? [], deletedAt: c.deletedAt ?? null,
    }));
    const fromMemos = (p.memos ?? []).map(m => ({
      id: m.id, customerId: m.customerId, done: m.text, next: '', createdAt: m.createdAt,
      history: (m.history ?? []).map(h => ({ done: h.text, next: '', replacedAt: h.replacedAt })),
    }));
    const visits = [...(p.visits ?? []), ...fromMemos].map(v => ({ ...v, deletedAt: v.deletedAt ?? null, kinds: Array.isArray(v.kinds) ? v.kinds.filter(k => KINDS.includes(k)) : [] }));
    const today = migrateToday(p.today);
    const settings = migrateSettings(p.settings);
    const passes = (p.passes ?? []).filter(x => x && typeof x.customerId === 'number' && (x.kind === 'charge' || x.kind === 'use'))
      .map(x => ({ id: x.id, customerId: x.customerId, kind: x.kind, amount: Number(x.amount) || 0, note: x.note ?? '', at: x.at ?? '', visitId: x.visitId ?? null }));
    const dailyCounts = (p.dailyCounts && typeof p.dailyCounts === 'object' && !Array.isArray(p.dailyCounts)) ? p.dailyCounts : {};
    return { nextId: p.nextId ?? 1, customers, visits, passes, settings, today, dailyCounts };
  }

  function migrateSettings(v) {
    const d = defaultSettings();
    if (!v || typeof v !== 'object') return d;
    return {
      head: typeof v.head === 'string' ? v.head : d.head,
      tail: typeof v.tail === 'string' ? v.tail : d.tail,
      products: (Array.isArray(v.products) ? v.products : []).filter(p => p && p.name).map(p => ({
        name: String(p.name), amount: Number(p.amount) || 0, terms: String(p.terms ?? ''), gift: String(p.gift ?? ''),
      })),
    };
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

  return { KINDS, setDailyCount, dailyCount, monthlyStats, retention, overdueCustomers, weeklyRecordRate, createState, timeSlots, formatWon, comma, buildNotice, noticeRemain, noticeUsed, setSettings, rememberProduct, findProduct, cleanAmount, chargePass, usePass, deletePass, passEntriesOf, passBalance, passSummary, visitsWithGaps, visitCycle, addCustomer, editCustomer, deleteCustomer, restoreCustomer, purgeCustomer, deletedCustomers, maskPhone, findCustomers, setProfile, addVisit, editVisit, deleteVisit, restoreVisit, purgeVisit, deletedVisitsOf, sweepDeletedVisits, daysLeftInTrash, visitsOf, markToday, setTodayTime, unmarkToday, todayList, serialize, deserialize };
})();

if (typeof module !== 'undefined') module.exports = Store;
