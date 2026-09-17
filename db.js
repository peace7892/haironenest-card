// 서버 저장 층. 상태(state) 전체를 알고, 바뀐 줄만 Supabase 표에 넣고 뺀다.
// 규칙(store.js)과 화면(app.js)은 서버를 모른다. 여기만 안다.
// 표 5개: card_customers, card_visits, card_passes, card_today, card_settings
const DB = (() => {
  let client = null;

  // ---- 줄 모양 바꾸기: 앱(camelCase) ↔ 표(snake_case) ----------------------
  const toRow = {
    customers: (c) => ({ id: c.id, name: c.name, phone: c.phone ?? '', referrer: c.referrer ?? '', is_legacy: !!c.isLegacy,
      profile: c.profile, profile_history: c.profileHistory ?? [], deleted_at: c.deletedAt ?? null }),
    visits: (v) => ({ id: v.id, customer_id: v.customerId, done: v.done, next: v.next ?? '', kinds: v.kinds ?? [],
      history: v.history ?? [], created_at: v.createdAt, deleted_at: v.deletedAt ?? null }),
    passes: (p) => ({ id: p.id, customer_id: p.customerId, kind: p.kind, amount: p.amount, note: p.note ?? '', at: p.at ?? '', visit_id: p.visitId ?? null }),
  };
  const fromRow = {
    customers: (r) => ({ id: r.id, name: r.name, phone: r.phone ?? '', referrer: r.referrer ?? '', isLegacy: !!r.is_legacy,
      profile: r.profile ?? { talk: '', hair: '' }, profileHistory: r.profile_history ?? [], deletedAt: r.deleted_at ?? null }),
    visits: (r) => ({ id: r.id, customerId: r.customer_id, done: r.done, next: r.next ?? '', kinds: r.kinds ?? [],
      history: r.history ?? [], createdAt: r.created_at, deletedAt: r.deleted_at ?? null }),
    passes: (r) => ({ id: r.id, customerId: r.customer_id, kind: r.kind, amount: r.amount, note: r.note ?? '', at: r.at ?? '', visitId: r.visit_id ?? null }),
  };
  const TABLE = { customers: 'card_customers', visits: 'card_visits', passes: 'card_passes' };
  // 키 순서가 달라도 같은 내용이면 같다고 본다.
  const stable = (x) => Array.isArray(x) ? '[' + x.map(stable).join(',') + ']'
    : (x && typeof x === 'object') ? '{' + Object.keys(x).sort().map((k) => JSON.stringify(k) + ':' + stable(x[k])).join(',') + '}'
    : JSON.stringify(x);
  const same = (a, b) => stable(a) === stable(b);

  // 두 상태를 비교해 "무엇을 올리고(upsert) 무엇을 지울지(delete)"를 표별로 계산한다. 순수 함수라 테스트한다.
  function diff(prev, next) {
    const ops = [];
    for (const key of ['customers', 'visits', 'passes']) {
      const before = new Map((prev[key] ?? []).map((x) => [x.id, x]));
      const after = new Map((next[key] ?? []).map((x) => [x.id, x]));
      const upsert = [];
      for (const [id, x] of after) if (!before.has(id) || !same(before.get(id), x)) upsert.push(toRow[key](x));
      const del = [...before.keys()].filter((id) => !after.has(id));
      if (upsert.length) ops.push({ table: TABLE[key], upsert });
      if (del.length) ops.push({ table: TABLE[key], delete: del });
    }
    if (next.today && next.today.date && !same(prev.today, next.today)) {
      ops.push({ table: 'card_today', upsert: [{ date: next.today.date, entries: next.today.entries ?? [] }] });
    }
    if (!same(prev.settings, next.settings) || prev.nextId !== next.nextId) {
      ops.push({ table: 'card_settings', upsert: [{ id: 1, data: { ...(next.settings ?? {}), nextId: next.nextId } }] });
    }
    return ops;
  }

  // 표에서 읽어 온 줄들을 앱 상태로 조립한다. 순수 함수.
  function assemble(rows, todayDate) {
    const settingsRow = (rows.card_settings ?? [])[0];
    const data = settingsRow ? { ...settingsRow.data } : {};
    const nextIdSaved = data.nextId; delete data.nextId;
    const customers = (rows.card_customers ?? []).map(fromRow.customers);
    const visits = (rows.card_visits ?? []).map(fromRow.visits);
    const passes = (rows.card_passes ?? []).map(fromRow.passes);
    const maxId = Math.max(0, ...customers.map((x) => x.id), ...visits.map((x) => x.id), ...passes.map((x) => x.id));
    const todayRow = (rows.card_today ?? []).find((t) => t.date === todayDate);
    const raw = {
      nextId: Math.max(Number.isInteger(nextIdSaved) ? nextIdSaved : 1, maxId + 1),
      customers, visits, passes, settings: data,
      today: todayRow ? { date: todayRow.date, entries: todayRow.entries ?? [] } : { date: '', entries: [] },
    };
    // 옛 데이터·빈 값은 store의 이전(migrate) 규칙으로 한 번 더 다듬는다.
    return Store.deserialize(JSON.stringify(raw));
  }

  // ---- 실제 서버 ----------------------------------------------------------
  function init(config, supabaseLib) {
    client = supabaseLib.createClient(config.SUPABASE_URL, config.SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
    return client;
  }
  async function session() { const { data } = await client.auth.getSession(); return data.session; }
  async function login(email, password) {
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message.includes('Invalid') ? '비밀번호가 맞지 않습니다' : error.message);
  }
  async function logout() { await client.auth.signOut(); }

  async function fetchAll(table) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await client.from(table).select('*').range(from, from + 999);
      if (error) throw new Error(`${table} 읽기 실패: ${error.message}`);
      out.push(...data);
      if (data.length < 1000) break;
    }
    return out;
  }
  async function load(todayDate) {
    const names = ['card_customers', 'card_visits', 'card_passes', 'card_today', 'card_settings'];
    const lists = await Promise.all(names.map(fetchAll));
    return assemble(Object.fromEntries(names.map((n, i) => [n, lists[i]])), todayDate);
  }
  async function apply(ops) {
    for (const op of ops) {
      if (op.upsert) {
        const { error } = await client.from(op.table).upsert(op.upsert);
        if (error) throw new Error(`${op.table} 저장 실패: ${error.message}`);
      }
      if (op.delete) {
        const { error } = await client.from(op.table).delete().in('id', op.delete);
        if (error) throw new Error(`${op.table} 지우기 실패: ${error.message}`);
      }
    }
  }
  function save(prev, next) { return apply(diff(prev, next)); }

  // 백업 파일 전체를 서버로 옮긴다: 표를 비우고 다시 넣는다.
  async function replaceAll(state) {
    for (const t of ['card_visits', 'card_passes', 'card_customers']) {
      const { error } = await client.from(t).delete().gte('id', 0);
      if (error) throw new Error(`${t} 비우기 실패: ${error.message}`);
    }
    for (const t of ['card_today']) {
      const { error } = await client.from(t).delete().neq('date', '');
      if (error) throw new Error(`${t} 비우기 실패: ${error.message}`);
    }
    const empty = Store.createState();
    empty.settings = null; // settings도 반드시 올리게
    await apply(diff(empty, state));
  }

  return { diff, assemble, init, session, login, logout, load, save, replaceAll };
})();

if (typeof module !== 'undefined') module.exports = DB;
