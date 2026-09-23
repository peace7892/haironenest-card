// 화면 연결. 규칙은 전부 store.js에 있고, 여기서는 그리기와 이벤트만 다룬다.
(() => {
  const KEY = 'haironenest-card:v1';
  // ?local=1 이면 서버 대신 이 브라우저 저장소를 쓴다 (시험용·비상용).
  const USE_LOCAL = new URLSearchParams(location.search).has('local');
  let state = Store.createState();
  let view = { kind: 'today' }; // { kind: 'today' } | { kind: 'card', id } | { kind: 'monthly', month }
  let editingVisitId = null;
  let editingProfile = false;
  let editingIdentity = false;
  let trashOpen = false;
  let visitTrashOpen = false;
  let passForm = null;   // null | 'charge' | 'use'
  let passOpen = false;
  let noticeOpen = false;
  let cardTab = 'today';   // 'today' | 'history'

  const $ = (sel) => document.querySelector(sel);
  const pad = (n) => String(n).padStart(2, '0');
  const now = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
  const today = () => now().slice(0, 10);
  const fmt = (iso) => `${iso.slice(0, 4)}.${iso.slice(5, 7)}.${iso.slice(8, 10)} ${iso.slice(11, 16)}`;
  const esc = (s) => (s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const customerOf = (id) => state.customers.find((c) => c.id === id);

  // ---- 저장소: 서버(DB) 또는 브라우저(Local) — 같은 모양 ------------------
  const Local = {
    async session() { return true; },
    async login() {}, async logout() {},
    async load() { return Store.deserialize(localStorage.getItem(KEY)); },
    async save(prev, next) { localStorage.setItem(KEY, Store.serialize(next)); },
    async replaceAll(next) { localStorage.setItem(KEY, Store.serialize(next)); },
  };
  const storage = USE_LOCAL ? Local : DB;
  let pendingSaves = 0;
  function showSync(text, kind) { const el = $('#sync'); el.textContent = text; el.className = `sync ${kind ?? ''}`; el.hidden = !text; }

  function commit(next) {
    const prev = state;
    state = next;
    pendingSaves += 1; showSync('저장 중…');
    storage.save(prev, next)
      .then(() => { pendingSaves -= 1; if (pendingSaves === 0) showSync(''); })
      .catch((err) => { pendingSaves -= 1; showSync(`서버 저장 실패: ${err.message} — 인터넷을 확인하고 새로고침하세요`, 'error'); });
  }
  // ---- 적다 만 글 (임시 보관) ---------------------------------------------
  // 상담하며 조각조각 채우는 동안 화면을 다시 그려도, 다른 카드에 갔다 와도, 새로고침해도 남는다.
  // 서버에는 [방문 기록 저장]을 눌렀을 때만 간다. 이 컴퓨터 브라우저 안에만 둔다.
  const DRAFT_KEY = 'haironenest-card:drafts';
  let drafts = (() => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY)) || {}; } catch { return {}; } })();
  function persistDrafts() { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts)); } catch {} }
  const draftOf = (id) => drafts[id] ?? null;
  function saveDraft() {
    if (view.kind !== 'card' || !$('#visit-form')) return;
    const d = { date: $('#visit-date').value, done: $('#visit-done').value, kinds: readChips('visit-kind'), next: $('#visit-next').value };
    if (!d.done.trim() && !d.next.trim() && d.kinds.length === 0) delete drafts[view.id];
    else drafts[view.id] = d;
    persistDrafts();
  }
  function clearDraft(id) { delete drafts[id]; persistDrafts(); }

  // 적다 만 글이 있는 카드도 '고치는 중'이다. 창을 다시 잡아도 서버에서 다시 읽어 덮지 않는다.
  const isEditing = () => editingVisitId !== null || editingProfile || editingIdentity || passForm !== null || noticeOpen || (view.kind === 'card' && !!drafts[view.id]);
  function showMsg(el, text, kind) { if (el) { el.textContent = text; el.className = `msg ${kind}`; } }
  // 카드를 여는 것과 오늘 명단에 올리는 것은 다른 일이다. 지난 기록을 뒤늦게 적으려고
  // 왼쪽에서 연 고객이 오늘 명단에 끼면 안 되니, 명단에 올리는 길은 오른쪽 위 칸과 [오늘] 버튼뿐이다.
  function openCard(id) { view = { kind: 'card', id }; editingVisitId = null; editingProfile = false; editingIdentity = false; passForm = null; passOpen = false; noticeOpen = false; cardTab = 'today'; render(); }

  // ---- 왼쪽: 고객 목록 ----------------------------------------------------
  function renderCustomers() {
    const list = $('#customer-list');
    const q = $('#search').value.trim();
    const activeId = view.kind === 'card' ? view.id : null;
    if (!q) {
      list.innerHTML = `<li class="empty">이름이나 전화번호를 치면 여기에 뜹니다.<br><small>고객 ${state.customers.filter((c) => !c.deletedAt).length}명</small></li>`;
      return;
    }
    const found = Store.findCustomers(state, q);
    if (found.length === 0) { list.innerHTML = '<li class="empty">찾는 고객이 없습니다.</li>'; return; }
    const todayIds = state.today.date === today() ? state.today.entries.map((e) => e.customerId) : [];
    list.innerHTML = found.map((c) => `
      <li data-id="${c.id}" class="${c.id === activeId ? 'active' : ''}">
        <span>${esc(c.name)} <small>${esc(Store.maskPhone(c.phone))}</small></span>
        ${todayIds.includes(c.id) ? '<small>오늘</small>' : `<button type="button" class="small secondary" data-today="${c.id}">오늘</button>`}
      </li>`).join('');
  }

  function timeOptions(selected) {
    const slots = Store.timeSlots();
    const all = slots.includes(selected) || !selected ? slots : [...slots, selected].sort();
    return `<option value="">시간 없음</option>` +
      all.map((t) => `<option value="${t}"${t === selected ? ' selected' : ''}>${t}</option>`).join('');
  }

  // 지운 기록이 저절로 없어지기까지 남은 날.
  function leftText(left) {
    if (left === null) return '';
    return left === 0 ? '오늘 사라짐' : `${left}일 뒤 사라짐`;
  }

  // 정액권 상자. 잔액과 [충전]·[사용], 그리고 접어둔 내역.
  function renderPass(c) {
    const sum = Store.passSummary(state, c.id);
    const won = Store.formatWon;
    const form = passForm === null ? '' : `
      <div class="pass-form">
        <div class="row">
          <input type="text" id="pass-amount" inputmode="numeric" placeholder="${passForm === 'charge' ? '충전할 금액 (예: 30만)' : '쓸 금액 (예: 50000)'}" autocomplete="off">
          <input type="text" id="pass-note" placeholder="메모 (비워도 됨)" autocomplete="off">
          <button type="button" class="secondary" data-action="pass-cancel">취소</button>
          <button type="button" data-action="pass-save">${passForm === 'charge' ? '충전' : '사용'}</button>
        </div>
        <div class="msg" id="pass-msg"></div>
      </div>`;
    const list = Store.passEntriesOf(state, c.id);
    return `
      <div class="pass">
        <div class="row">
          <div><b>정액권</b> <span class="amount ${sum.balance > 0 ? 'has' : ''}">${won(sum.balance)}</span></div>
          <button type="button" class="small secondary" data-action="pass-charge">충전</button>
          <button type="button" class="small secondary" data-action="pass-use">사용</button>
        </div>
        ${form}
        <p class="note">돈 계산의 원본은 핸드SOS입니다. 여기 숫자는 시술 중에 보려고 옮겨 적는 것입니다.</p>
        ${sum.count === 0 ? '' : `
          <details class="pass-list" ${passOpen ? 'open' : ''}>
            <summary>내역 ${sum.count}건 · 넣은 돈 ${won(sum.charged)} · 쓴 돈 ${won(sum.used)}</summary>
            ${list.map((e) => `
              <div class="pass-row">
                <span class="when">${fmt(e.at)}</span>
                <span class="kind ${e.kind}">${e.kind === 'charge' ? '충전' : '사용'}</span>
                <span class="won ${e.kind}">${e.kind === 'charge' ? '+' : '-'}${won(e.amount)}</span>
                <span class="memo">${esc(e.note)}</span>
                <button type="button" class="link danger" data-action="pass-del" data-id="${e.id}">지우기</button>
              </div>`).join('')}
          </details>`}
      </div>`;
  }

  // ---- 정액권 안내문 만들기 ------------------------------------------------
  // 손님에게 보낼 문자를 여기서 만들어 복사한다. 고객 이름과 잔액은 이미 카드에
  // 있으니 다시 적지 않는다. 글자를 칠 때마다 카드 전체를 다시 그리면 커서가
  // 날아가므로, 아래 refreshNotice가 미리보기와 합계만 바꾼다.

  const digitsOf = (v) => Number(String(v ?? '').replace(/[^\d]/g, '')) || 0;

  function renderNotice(c) {
    const st = state.settings;
    const bal = Store.passBalance(state, c.id);
    return `
      <details class="notice" ${noticeOpen ? 'open' : ''}>
        <summary>정액권 안내문 만들기 <small>잔액 ${Store.formatWon(bal)}</small></summary>
        <div class="notice-body">
          <div class="date-row">
            <label style="margin:0">시술·사용 날짜</label>
            <input type="date" id="notice-date" value="${today()}" max="${today()}">
            <small>문자에 적히고, 정액권 내역에도 이 날짜로 남습니다</small>
          </div>
          <label style="margin-top:0">지금 남은 잔액 (시술 전, 핸드SOS 기준)</label>
          <div class="row">
            <input type="text" id="notice-prev" class="won" inputmode="numeric" value="${bal > 0 ? Store.comma(bal) : ''}" placeholder="예: 300000 (카드 만들기 전에 끊은 정액권이면 여기 적으세요)" autocomplete="off">
          </div>
          <p class="hint">카드가 아는 잔액은 ${Store.formatWon(bal)}입니다. 다르게 적으면 [복사하고 정액권에 반영]할 때 카드 잔액을 이 금액에 맞춘 뒤 오늘 시술을 뺍니다.</p>
          <label>오늘 시술</label>
          <div id="notice-items"></div>
          <button type="button" class="secondary small" data-action="notice-add">+ 시술 한 줄 더</button>

          <label class="check"><input type="checkbox" id="notice-topup-on"> 정액권 충전 안내 넣기</label>
          <div id="notice-topup" hidden>
            <div class="row">
              <input type="text" id="notice-topup-name" list="product-list" placeholder="정액권 이름 (예: Gold 예약권)" autocomplete="off">
              <input type="text" id="notice-topup-amt" class="won" inputmode="numeric" placeholder="결제 금액" autocomplete="off">
            </div>
            <input type="text" id="notice-topup-terms" placeholder="괄호 안 조건 (예: 사용기한:~18개월 / 우선예약권:소진시까지)" autocomplete="off">
            <input type="text" id="notice-topup-gift" placeholder="함께 드리는 선물 (비워도 됨)" autocomplete="off">
            ${st.products.length ? `<p class="hint">이름 칸에서 ${esc(st.products.map((p) => p.name).join(' · '))} 중 하나를 고르면 금액·조건·선물이 저절로 채워집니다.</p>` : ''}
          </div>
          <datalist id="product-list">${st.products.map((p) => `<option value="${esc(p.name)}"></option>`).join('')}</datalist>

          <details class="tpl">
            <summary>머리말 · 맺음말 바꾸기</summary>
            <input type="text" id="notice-head" value="${esc(st.head)}" placeholder="맨 윗줄 (양옆 * 는 자동)">
            <input type="text" id="notice-tail" value="${esc(st.tail)}" placeholder="마지막 줄 금액 뒤에 붙는 말">
          </details>

          <div class="notice-total"><span>남은 정액권</span><b id="notice-total">${Store.formatWon(bal)}</b></div>
          <pre class="preview" id="notice-preview"></pre>
          <div class="row">
            <div class="msg" id="notice-msg"></div>
            <button type="button" class="secondary" data-action="notice-copy">복사만</button>
            <button type="button" data-action="notice-apply">복사하고 정액권에 반영</button>
          </div>
        </div>
      </details>`;
  }

  function noticeRow(name = '', amount = '') {
    const row = document.createElement('div');
    row.className = 'row notice-item';
    row.innerHTML = `
      <input type="text" class="it-name" list="service-list" placeholder="시술명" autocomplete="off" value="${esc(name)}">
      <input type="text" class="it-amt won" inputmode="numeric" placeholder="금액" autocomplete="off" value="${esc(amount)}">
      <button type="button" class="secondary small" data-action="notice-row-del">×</button>`;
    return row;
  }

  function readNotice() {
    const items = [...document.querySelectorAll('.notice-item')].map((r) => ({
      name: r.querySelector('.it-name').value.trim(),
      amount: digitsOf(r.querySelector('.it-amt').value),
    }));
    const on = $('#notice-topup-on').checked;
    const tName = $('#notice-topup-name').value.trim();
    const tAmt = digitsOf($('#notice-topup-amt').value);
    const prevRaw = $('#notice-prev') ? $('#notice-prev').value.trim() : '';
    return {
      head: $('#notice-head').value,
      tail: $('#notice-tail').value,
      date: $('#notice-date') ? $('#notice-date').value : today(),
      prev: prevRaw === '' ? Store.passBalance(state, view.id) : Number(digitsOf(prevRaw)) || 0,
      prevTyped: prevRaw !== '',
      items,
      // 스위치를 켰어도 이름·금액이 둘 다 비면 빈 줄을 내보내지 않는다
      topup: on && (tName || tAmt)
        ? { name: tName, amount: tAmt, terms: $('#notice-topup-terms').value, gift: $('#notice-topup-gift').value }
        : null,
    };
  }

  function refreshNotice() {
    if (!$('#notice-preview')) return;
    const f = readNotice();
    const remain = Store.noticeRemain(f);
    const total = $('#notice-total');
    total.textContent = Store.formatWon(remain);
    total.classList.toggle('short', remain < 0);
    $('#notice-preview').textContent = Store.buildNotice(f);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(() => true, () => legacyCopy(text));
    }
    return Promise.resolve(legacyCopy(text));
  }
  // file:// 로 연 화면에서는 위 방법이 막히기도 한다. 그때 쓰는 옛 방식.
  function legacyCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch { return false; }
  }

  // 며칠 만의 방문인지 한 줄로. 아직 온 적이 없으면 '첫 방문'.
  // short: 오른쪽 명단 줄처럼 좁은 자리용. 날짜는 빼고 며칠 만인지와 평균만.
  function cycleText(cy, short) {
    if (cy.sinceLast === null) return '첫 방문';
    const last = cy.lastDate.replace(/-/g, '.');
    const avg = cy.average ? ` · 보통 ${cy.average}일마다` : '';
    return short ? `<b>${cy.sinceLast}일 만</b>${avg}` : `<b>${cy.sinceLast}일 만</b> · 지난 방문 ${last}${avg}`;
  }

  // ---- 왼쪽 아래: 지운 고객 (되살리기 / 완전히 지우기) ----------------------
  function renderTrash() {
    const box = $('#trash');
    const gone = Store.deletedCustomers(state);
    if (gone.length === 0) { box.innerHTML = ''; return; }
    box.innerHTML = `
      <details class="trash" ${trashOpen ? 'open' : ''}>
        <summary>지운 고객 ${gone.length}명</summary>
        <p class="note">되살리면 방문 기록까지 그대로 돌아옵니다.</p>
        <ul class="list">
          ${gone.map((c) => `
            <li>
              <span>${esc(c.name)} <small>${esc(Store.maskPhone(c.phone))}</small></span>
              <span class="actions">
                <button type="button" class="small secondary" data-restore="${c.id}">되살리기</button>
                <button type="button" class="small danger" data-purge="${c.id}">완전히 지우기</button>
              </span>
            </li>`).join('')}
        </ul>
        <div class="msg" id="trash-msg"></div>
      </details>`;
  }

  // ---- 오른쪽: 오늘 명단 (카드를 열어도 그대로 있다) --------------------
  function renderTodayPanel() {
    const list = Store.todayList(state, today());
    const done = list.filter((t) => t.recorded).length;
    const activeId = view.kind === 'card' ? view.id : null;
    const items = list.length === 0
      ? '<div class="empty">위 칸에 예약 시간과 이름을 넣어 오늘 올 고객을 쭉 올려두세요.<br>손님이 다녀가면 그 줄을 눌러 기록을 남깁니다.</div>'
      : list.map((t) => `
        <div class="today-item ${t.customer.id === activeId ? 'active' : ''}" data-open="${t.customer.id}">
          <div class="no">${t.order}</div>
          <div class="when"><select class="at" data-at="${t.customer.id}" title="예약 시간">${timeOptions(t.at)}</select></div>
          <div class="who">
            <div class="name">${esc(t.customer.name)}</div>
            <div class="cycle" title="${cycleText(t).replace(/<[^>]+>/g, '')}">${cycleText(t, true)}${t.balance > 0 ? ` · <span class="status pass">정액권 ${Store.formatWon(t.balance)}</span>` : ''}</div>
          </div>
          <div class="right">
            <span class="status ${t.recorded ? 'done' : 'todo'}">${t.recorded ? '기록 남김' : '아직 안 적음'}</span>
            <button type="button" class="link small" data-drop="${t.customer.id}" title="명단에서 빼기">빼기</button>
          </div>
        </div>`).join('');
    // 카드 쪽에서 저장해 다시 그려도, 오른쪽에 치던 이름과 고른 시간은 그대로 둔다.
    const keepAt = $('#add-at')?.value ?? '';
    const keepName = $('#add-name')?.value ?? '';
    $('#today').innerHTML = `
      <h2 class="card-title">오늘 <small>${today().replace(/-/g, '.')} · ${list.length}명 중 ${done}명 기록 남김</small></h2>
      <div class="add-today">
        <div class="row">
          <select class="at" id="add-at" title="예약 시간 (안 골라도 됩니다)">${timeOptions('')}</select>
          <input type="text" id="add-name" placeholder="이름이나 번호" autocomplete="off">
        </div>
        <div id="add-hits"></div>
      </div>
      <div class="msg" id="today-msg"></div>
      ${items}`;
    $('#add-at').value = keepAt;
    $('#add-name').value = keepName;
  }

  // 가운데에 아무 카드도 안 열렸을 때: 이번 달 한 줄과 안내.
  function renderCenterEmpty() {
    return `${renderDashLine()}<div class="card-empty">오른쪽 오늘 명단에서 고객을 누르면 여기에 카드가 열립니다.<br>명단에 없는 고객은 왼쪽에서 이름으로 찾으세요.</div>`;
  }

  // 이름을 칠 때마다 후보만 다시 그린다. 화면 전체를 다시 그리면 글자를 치던 자리가 날아간다.
  function renderAddHits() {
    const box = $('#add-hits');
    if (!box) return;
    const q = $('#add-name').value.trim();
    if (!q) { box.innerHTML = '<div class="hint">아침에 예약 명단을 보며 시간과 이름을 넣으세요. 시간은 비워도 되고, 나중에 고칠 수 있습니다.</div>'; return; }
    const onList = new Set(Store.todayList(state, today()).map((t) => t.customer.id));
    const hits = Store.findCustomers(state, q).filter((c) => !onList.has(c.id)).slice(0, 8);
    const looksLikeName = /[^\d\s-]/.test(q);
    box.innerHTML = `
      <div class="hits">
        ${hits.map((c) => `<button type="button" class="secondary small" data-add="${c.id}">${esc(c.name)} <small>${esc(Store.maskPhone(c.phone))}</small></button>`).join('')}
        ${looksLikeName ? `<button type="button" class="small" data-add-new="1">+ ${esc(q)} 새 고객으로 올리기</button>` : ''}
      </div>
      ${hits.length === 0 && !looksLikeName ? '<div class="hint">그 번호를 쓰는 고객이 없습니다. 이름으로 찾아보세요.</div>' : ''}`;
  }

  // 명단에 한 명 올리기. newName을 주면 그 이름으로 새 고객을 만들어 올린다.
  function addToToday(customerId, newName) {
    const at = $('#add-at').value;
    try {
      let next = state;
      let id = customerId;
      if (newName) {
        const made = Store.addCustomer(state, { name: newName, phone: '', referrer: '' });
        next = made.state; id = made.customer.id;
      }
      commit(Store.markToday(next, id, today(), at).state);
      $('#add-at').value = ''; $('#add-name').value = '';   // 올렸으니 칸을 비운다
      render();
      $('#add-at').focus();
    } catch (err) { showMsg($('#today-msg'), err.message, 'error'); }
  }

  // ---- 가운데: 고객 카드 ---------------------------------------------------
  // 위에서 아래로: [오늘] [지난 방문] 탭 → 누구인지 한 줄 → 기억할 것 한 줄 → 오늘 적기.
  // 지난 방문은 탭 뒤에 두어 카드가 길어지지 않는다.
  function renderCard(c) {
    const visits = Store.visitsWithGaps(state, c.id);
    return `
      <div class="tabs">
        <button type="button" data-tab="today" class="${cardTab === 'today' ? 'on' : ''}">오늘</button>
        <button type="button" data-tab="history" class="${cardTab === 'history' ? 'on' : ''}">지난 방문 ${visits.length}건</button>
      </div>
      ${renderIdentity(c, Store.visitCycle(state, c.id, today()))}
      ${cardTab === 'history' ? renderHistoryTab(c, visits) : renderTodayTab(c, visits)}`;
  }

  function renderTodayTab(c, visits) {
    // '지난번'은 오늘 것을 뺀 직전 방문. 오늘 기록을 남겨도 이 줄은 흔들리지 않는다.
    const prev = visits.find((v) => !v.createdAt.startsWith(today()));
    const d = draftOf(c.id);   // 적다 만 글이 있으면 칸에 그대로 채워 둔다
    return `
      ${renderMemo(c, prev)}
      <form id="visit-form">
        <div class="date-row">
          <label style="margin:0">날짜</label>
          <input type="date" id="visit-date" value="${d?.date || today()}" max="${today()}">
          <small>못 적고 지나간 날 것은 날짜를 그날로 바꿔 적으세요</small>
        </div>
        <label style="margin-top:0">오늘 시술 내용과 그 이유 (필수)</label>
        <textarea id="visit-done" placeholder="예: 탑 볼륨 부족해서 언더에서 무게 뺌. 아침에 5분밖에 못 쓴다고 해서 드라이 없이 되는 라인으로">${esc(d?.done ?? '')}</textarea>
        <label>시술 종류 (여러 개 가능, 안 골라도 됨)</label>
        ${renderChips('visit-kind', d?.kinds ?? [])}
        <label>다음에 하기로 한 방향 (비워도 됨)</label>
        <textarea id="visit-next" style="min-height:60px" placeholder="예: 다음엔 길이 유지하고 볼륨펌 상담">${esc(d?.next ?? '')}</textarea>
        <div class="row" style="margin-top:8px">
          <div class="msg ${d ? 'draft' : ''}" id="visit-msg">${d ? '적다 만 글입니다. 아직 저장 안 됨 · <button type="button" class="link" data-action="discard-draft">지우고 새로 적기</button>' : ''}</div>
          <button type="submit">방문 기록 저장</button></div>
      </form>
      ${renderPass(c)}
      ${renderNotice(c)}`;
  }

  function renderHistoryTab(c, visits) {
    return `
      ${visits.length === 0 ? '<div class="empty">아직 기록이 없습니다.</div>' : visits.map(renderVisit).join('')}
      ${renderDeletedVisits(c)}`;
  }

  const fmtDay = (iso) => iso.slice(0, 10).replace(/-/g, '.');
  const shorten = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s);

  // 기억할 것 한 줄(고정 정보를 합친 것) + 지난번 시술 한 줄. 고칠 때만 두 칸으로 펼쳐진다.
  function renderMemo(c, prev) {
    if (editingProfile) return renderProfile(c);
    const p = c.profile;
    const memo = [p.hair, p.talk].filter(Boolean).join(' · ');
    const kinds = prev && (prev.kinds ?? []).length ? `<span class="kinds-inline">${prev.kinds.map((k) => `<span>${esc(k)}</span>`).join('')}</span>` : '';
    // 지난번 시술은 앞 세 조각만. 전체는 [지난 방문] 탭에 있다. 이름표가 있으면 굵게.
    const items = prev ? noteItems(prev.done) : [];
    const labeled = items.some((it) => it.label);
    const piece = (it) => (it.label ? `<b>${esc(it.label)}</b> ` : '') + esc(shorten(it.label ? dots(it.text) : it.text, 60));
    const gist = items.slice(0, 3).map(piece).join(labeled ? ' &nbsp; ' : ' · ') + (items.length > 3 ? `${labeled ? ' &nbsp; ' : ' · '}외 ${items.length - 3}개` : '');
    const last = prev
      ? `${fmtDay(prev.createdAt)} · ${kinds}${gist}${prev.next ? ` → 다음: ${esc(shorten(Store.noteTidy(prev.next), 60))}` : ''}`
      : '<i>첫 방문 — 오늘이 첫 기록입니다</i>';
    const history = c.profileHistory.length === 0 ? '' : `
      <details><summary>고치기 전 메모 ${c.profileHistory.length}건</summary>
        <div class="history">${[...c.profileHistory].reverse().map((h) => `<p><small>${fmt(h.replacedAt)}까지</small><br>${esc([h.hair, h.talk].filter(Boolean).join(' · ')) || '—'}</p>`).join('')}</div>
      </details>`;
    return `
      <div class="remember">
        <div class="line"><span class="k">메모</span><span class="v">${esc(memo) || '<i>아직 없음</i>'}</span>
          <button type="button" class="link" data-action="edit-profile">${memo ? '고치기' : '적기'}</button></div>
        <div class="line"><span class="k">지난번</span><span class="v">${last}</span></div>
        ${history}
      </div>`;
  }

  // 실수로 두 번 적은 기록을 치우는 자리. 지운 게 없으면 아예 안 보인다.
  function renderDeletedVisits(c) {
    const gone = Store.deletedVisitsOf(state, c.id);
    if (gone.length === 0) return '';
    return `
      <details class="trash" ${visitTrashOpen ? 'open' : ''}>
        <summary>지운 기록 ${gone.length}건</summary>
        <p class="note">지운 지 일주일이 지나면 저절로 없어집니다. 되살리면 방문 목록과 주기 계산에 다시 들어갑니다.</p>
        ${gone.map((v) => `
          <div class="visit">
            <div class="meta"><span>${fmt(v.createdAt)} · <b class="left">${leftText(Store.daysLeftInTrash(v, now()))}</b></span>
              <span class="acts">
                <button type="button" class="small secondary" data-action="restore-visit" data-id="${v.id}">되살리기</button>
                <button type="button" class="small danger" data-action="purge-visit" data-id="${v.id}">완전히 지우기</button>
              </span></div>
            <div class="field"><p>${esc(v.done)}</p></div>
          </div>`).join('')}
        <div class="msg" id="visit-trash-msg"></div>
      </details>`;
  }

  const fmtPhone = (p) => (p.length === 11 ? `${p.slice(0, 3)}-${p.slice(3, 7)}-${p.slice(7)}` : p.length === 10 ? `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}` : p);

  function renderIdentity(c, cycle) {
    if (editingIdentity) {
      return `
        <div class="identity">
          <div><label style="margin-top:0">이름</label><input type="text" id="id-name" value="${esc(c.name)}"></div>
          <div><label style="margin-top:0">전화번호</label><input type="text" id="id-phone" inputmode="tel" value="${esc(fmtPhone(c.phone))}" placeholder="010-1234-5678"></div>
          <div><label style="margin-top:0">소개해 준 분</label><input type="text" id="id-referrer" value="${esc(c.referrer)}" placeholder="없으면 비움"></div>
          <label style="margin:0;display:flex;gap:6px;align-items:center;font-size:14px;align-self:center"><input type="checkbox" id="id-legacy" ${c.isLegacy ? 'checked' : ''}> 예전부터 오던 고객</label>
          <button type="button" class="secondary" data-action="cancel-identity">취소</button>
          <button type="button" data-action="save-identity">저장</button>
        </div>
        <div class="row" style="margin-top:4px">
          <div class="msg" id="identity-msg"></div>
          <button type="button" class="link danger" data-action="delete-customer">이 고객 지우기</button>
        </div>`;
    }
    const phoneText = !c.phone ? '번호 없음' : c.phone.length <= 4 ? `뒤 4자리만 있음 ${esc(c.phone)}` : esc(fmtPhone(c.phone));
    return `
      <div class="head-line">
        <span class="name">${esc(c.name)}</span>
        <span class="phone">${phoneText}</span>
        <span class="ref">${c.referrer ? '소개: ' + esc(c.referrer) : '소개 없음'}${c.isLegacy ? ' · 예전부터 오던 고객' : ''}</span>
        <button type="button" class="link" data-action="edit-identity">고치기</button>
        <span class="cycle">${cycleText(cycle)}</span>
      </div>`;
  }

  function renderProfile(c) {
    const p = c.profile;
    if (editingProfile) {
      return `
        <div class="profile">
          <div class="grid">
            <div><label style="margin-top:0">고객이 한 말 · 생활 습관 · 직업이나 상황</label><textarea id="profile-talk">${esc(p.talk)}</textarea></div>
            <div><label style="margin-top:0">얼굴형 · 모질 · 두상</label><textarea id="profile-hair">${esc(p.hair)}</textarea></div>
          </div>
          <div class="row" style="margin-top:8px"><div class="msg" id="profile-msg"></div>
            <button type="button" class="secondary" data-action="cancel-profile">취소</button>
            <button type="button" data-action="save-profile">고정 정보 저장</button></div>
        </div>`;
    }
    return '';
  }

  function renderChips(name, selected) {
    return `<div class="chips">${Store.KINDS.map((k) => `<label><input type="checkbox" name="${name}" value="${k}" ${selected.includes(k) ? 'checked' : ''}> ${k}</label>`).join('')}</div>`;
  }
  const readChips = (name) => [...document.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value);

  // 저장은 그대로, 보여줄 때만 항목으로. 조각마다 앞의 이름표(시술·고민·다음…)를 떼고 끝말을 차트 말투로.
  // 이름표가 하나라도 있으면 왼쪽 이름표·오른쪽 내용의 표로, 없으면 점 목록, 한 조각이면 문장 그대로.
  const noteItems = (text) => Store.noteLines(text).map((it) => { const { label, text: t } = Store.noteLabel(it); return { label, text: Store.noteTidy(t) }; });
  const dots = (s) => s.replace(/,\s+/g, ' · ');   // 이름표 줄 안의 "가, 나, 다"는 "가 · 나 · 다"로
  function renderLines(text) {
    const items = noteItems(text);
    if (items.length === 0) return '<p class="text"></p>';
    if (items.some((it) => it.label)) {
      return `<div class="chart text">${items.map((it) => `<span class="lb">${esc(it.label ?? '')}</span><span class="tx">${esc(it.label ? dots(it.text) : it.text)}</span>`).join('')}</div>`;
    }
    if (items.length === 1) return `<p class="text">${esc(items[0].text)}</p>`;
    return `<ul class="lines text">${items.map((it) => `<li>${esc(it.text)}</li>`).join('')}</ul>`;
  }

  function renderVisit(v) {
    if (v.id === editingVisitId) {
      return `
        <div class="visit">
          <div class="meta"><span class="date-row"><label style="margin:0">날짜</label><input type="date" id="edit-date" value="${v.createdAt.slice(0, 10)}" max="${today()}"> ${v.createdAt.slice(11, 16)}</span><span>고치는 중</span></div>
          <label style="margin-top:0">오늘 시술 내용과 그 이유</label><textarea id="edit-done">${esc(v.done)}</textarea>
          <label>시술 종류</label>${renderChips('edit-kind', v.kinds ?? [])}
          <label>다음에 하기로 한 방향</label><textarea id="edit-next" style="min-height:60px">${esc(v.next)}</textarea>
          <div class="row" style="margin-top:8px"><div class="msg" id="edit-msg"></div>
            <button type="button" class="secondary" data-action="cancel-edit">취소</button>
            <button type="button" data-action="save-edit" data-id="${v.id}">고친 내용 저장</button></div>
        </div>`;
    }
    const history = v.history.length === 0 ? '' : `
      <details><summary>고치기 전 내용 ${v.history.length}건</summary>
        <div class="history">${[...v.history].reverse().map((h) => `<p><small>${fmt(h.replacedAt)}까지${h.createdAt ? ` · 그때 날짜 ${fmtDay(h.createdAt)}` : ''}</small><br>${esc(h.done)}${h.next ? '<br>다음: ' + esc(h.next) : ''}</p>`).join('')}</div>
      </details>`;
    return `
      <div class="visit">
        <div class="meta"><span>${fmt(v.createdAt)}${v.sincePrev === null ? ' · 첫 방문' : ` · 이전 방문에서 ${v.sincePrev}일 만`}</span>
          <span class="acts">
            <button type="button" class="link" data-action="edit" data-id="${v.id}">고치기</button>
            <button type="button" class="link danger" data-action="del-visit" data-id="${v.id}">지우기</button>
          </span></div>
        <div class="field"><b>시술 내용과 이유${(v.kinds ?? []).length ? `<span class="kinds-inline">${v.kinds.map((k) => `<span>${esc(k)}</span>`).join('')}</span>` : ''}</b>${renderLines(v.done)}</div>
        ${v.next ? `<div class="field"><b>다음 방향</b>${renderLines(v.next)}</div>` : ''}
        ${history}
      </div>`;
  }

  // 안내문 칸을 그린 직후 첫 줄과 미리보기를 채운다.
  function setupNotice() {
    const box = $('#notice-items');
    if (!box) return;
    if (!box.firstElementChild) box.appendChild(noticeRow());
    refreshNotice();
  }

  function render() {
    if (view.kind === 'card' && !customerOf(view.id)) view = { kind: 'today' };
    for (const id of Object.keys(drafts)) if (!customerOf(Number(id))) clearDraft(id);
    renderCustomers();
    renderTrash();
    renderTodayPanel();
    renderAddHits();
    const card = $('#card');
    $('#nav-today').classList.toggle('active', view.kind === 'today');
    $('#nav-monthly').classList.toggle('active', view.kind === 'monthly');
    if (view.kind === 'card') { card.innerHTML = renderCard(customerOf(view.id)); setupNotice(); }
    else if (view.kind === 'monthly') { card.innerHTML = renderMonthly(view.month ?? today().slice(0, 7)); }
    else card.innerHTML = renderCenterEmpty();
  }

  // ---- 대시보드 -----------------------------------------------------------
  const monthLabel = (m) => `${m.slice(0, 4)}년 ${Number(m.slice(5, 7))}월`;
  const prevMonth = (m) => { const d = new Date(m + '-01T00:00:00'); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
  const nextMonth = (m) => { const d = new Date(m + '-01T00:00:00'); d.setMonth(d.getMonth() + 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
  const topKind = (kinds) => { const e = Object.entries(kinds).filter(([k]) => k !== '미분류').sort((a, b) => b[1] - a[1])[0]; return e && e[1] > 0 ? `${e[0]} ${e[1]}` : '—'; };

  // 오늘 화면 맨 위 한 줄. 누르면 월별로 간다.
  function renderDashLine() {
    const m = Store.monthlyStats(state, today().slice(0, 7));
    const over = Store.overdueCustomers(state, today(), state.settings.overdueFactor ?? 1.5).length;
    return `
      <div class="dash">
        <div class="tile" data-monthly="1"><b>이번 달 신규</b><span>${m.newCustomers}</span><small>명</small></div>
        <div class="tile" data-monthly="1"><b>이번 달 재방문</b><span>${m.returning}</span><small>명 · 방문 ${m.visits}건</small></div>
        <div class="tile" data-monthly="1"><b>가장 많이 한 시술</b><span style="font-size:17px">${esc(topKind(m.kinds))}</span></div>
        <div class="tile" data-monthly="1"><b>오래 안 온 고객</b><span>${over}</span><small>명 · 평소 주기 넘김</small></div>
      </div>`;
  }

  function renderMonthly(month) {
    const m = Store.monthlyStats(state, month);
    const p = Store.monthlyStats(state, prevMonth(month));
    const cell = (a, b) => `<td class="num">${a}</td><td class="num" style="color:var(--muted)">${b}</td>`;
    const kindsRows = Object.entries(m.kinds).map(([k, n]) => `<tr><td>${esc(k)}</td>${cell(n, p.kinds[k] ?? 0)}</tr>`).join('');
    const ret = Store.retention(state, { days: state.settings.retentionDays ?? 150, today: today() });
    const over = Store.overdueCustomers(state, today(), state.settings.overdueFactor ?? 1.5);
    const isFuture = month >= today().slice(0, 7);
    return `
      <div class="monthly">
        <h2 class="card-title">월별 <small>기록은 매일 쌓이고, 여기서는 달 단위로 봅니다</small></h2>
        <div class="month-pick">
          <button type="button" class="small secondary" data-month="${prevMonth(month)}">◀</button>
          <b style="font-size:18px">${monthLabel(month)}</b>
          <button type="button" class="small secondary" data-month="${nextMonth(month)}" ${isFuture ? 'disabled' : ''}>▶</button>
          <span style="color:var(--muted);font-size:13px;margin-left:6px">오른쪽 회색 숫자는 지난달(${monthLabel(prevMonth(month))})</span>
        </div>
        <h3>이 달</h3>
        <table>
          <tr><th>항목</th><th style="text-align:right">이 달</th><th style="text-align:right">지난달</th></tr>
          <tr><td>방문 건수 (실제로 한 시술 횟수)</td>${cell(m.visits, p.visits)}</tr>
          <tr><td>방문 고객 수 (한 번이라도 온 사람)</td>${cell(m.customers, p.customers)}</tr>
          <tr><td>&nbsp;&nbsp;신규 고객</td>${cell(m.newCustomers, p.newCustomers)}</tr>
          <tr><td>&nbsp;&nbsp;재방문 고객</td>${cell(m.returning, p.returning)}</tr>
          <tr><td>1인당 방문 횟수</td>${cell(m.perCustomer, p.perCustomer)}</tr>
          <tr><td>재방문 고객 비율 (그 달 구성)</td>${cell(Math.round(m.returningRatio * 100) + '%', Math.round(p.returningRatio * 100) + '%')}</tr>
        </table>
        <h3>시술별 카운팅 (건수)</h3>
        <table><tr><th>시술</th><th style="text-align:right">이 달</th><th style="text-align:right">지난달</th></tr>${kindsRows}</table>
        <h3>회차 분포 (이 달 온 고객이 몇 번째 방문인지)</h3>
        <table>
          <tr><th>회차</th><th style="text-align:right">이 달</th><th style="text-align:right">지난달</th></tr>
          <tr><td>1회차 (처음)</td>${cell(m.rounds.first, p.rounds.first)}</tr>
          <tr><td>2~3회차</td>${cell(m.rounds.two3, p.rounds.two3)}</tr>
          <tr><td>4회차 이상 (단골)</td>${cell(m.rounds.fourPlus, p.rounds.fourPlus)}</tr>
          <tr><td>예전부터 오던 고객</td>${cell(m.rounds.legacy, p.rounds.legacy)}</tr>
        </table>
        <h3>신규 정착률 <small style="font-weight:normal;color:var(--muted)">처음 온 달별로, ${state.settings.retentionDays ?? 150}일 안에 두 번째 방문한 비율</small></h3>
        ${ret.length === 0 ? '<div class="empty">아직 신규 고객 기록이 없습니다.</div>' : `<table>
          <tr><th>처음 온 달</th><th style="text-align:right">신규</th><th style="text-align:right">돌아옴</th><th style="text-align:right">정착률</th><th>상태</th></tr>
          ${ret.slice().reverse().map((r) => `<tr><td>${monthLabel(r.month)}</td><td class="num">${r.total}</td><td class="num">${r.returned}</td><td class="num">${Math.round(r.rate * 100)}%</td><td style="color:var(--muted)">${r.pending ? '집계 중' : '확정'}</td></tr>`).join('')}
        </table>`}
        <h3>평소 주기보다 오래 안 온 고객 <small style="font-weight:normal;color:var(--muted)">평소 주기의 ${state.settings.overdueFactor ?? 1.5}배를 넘김 · ${over.length}명</small></h3>
        ${over.length === 0 ? '<div class="empty">지금은 없습니다.</div>' : `<table>
          <tr><th>고객</th><th style="text-align:right">지난 방문</th><th style="text-align:right">평소 주기</th><th style="text-align:right">지난 지</th></tr>
          ${over.map((o) => `<tr style="cursor:pointer" data-open="${o.customer.id}"><td>${esc(o.customer.name)} <small style="color:var(--muted)">${esc(Store.maskPhone(o.customer.phone))}</small></td><td class="num">${o.lastDate.replace(/-/g, '.')}</td><td class="num">${o.average}일</td><td class="num">${o.sinceLast}일</td></tr>`).join('')}
        </table>`}
      </div>`;
  }

  // ---- 이벤트 --------------------------------------------------------------
  $('#home').addEventListener('click', () => { view = { kind: 'today' }; render(); });
  $('#nav-today').addEventListener('click', () => { view = { kind: 'today' }; render(); });
  $('#nav-monthly').addEventListener('click', () => { view = { kind: 'monthly', month: today().slice(0, 7) }; render(); });
  $('#logout').addEventListener('click', async () => { await storage.logout(); location.reload(); });
  $('#search').addEventListener('input', renderCustomers);

  $('#customer-list').addEventListener('click', (e) => {
    const todayBtn = e.target.closest('button[data-today]');
    if (todayBtn) { commit(Store.markToday(state, Number(todayBtn.dataset.today), today()).state); render(); return; }
    const li = e.target.closest('li[data-id]');
    if (li) openCard(Number(li.dataset.id));
  });

  $('#new-customer-form').addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      const { state: next, customer } = Store.addCustomer(state, { name: $('#new-name').value, phone: $('#new-phone').value, referrer: $('#new-referrer').value, isLegacy: $('#new-legacy').checked });
      commit(next);
      $('#new-name').value = ''; $('#new-phone').value = ''; $('#new-referrer').value = ''; $('#new-legacy').checked = false; $('#search').value = '';
      showMsg($('#new-msg'), `${customer.name} 카드를 만들었습니다`, 'ok');
      openCard(customer.id);
      editingProfile = true; render();
    } catch (err) { showMsg($('#new-msg'), err.message, 'error'); }
  });

  // 오른쪽 오늘 명단
  $('#today').addEventListener('click', (e) => {
    // 시간 칸을 누른 것뿐인데 카드가 열려버리면 안 된다
    if (e.target.closest('input, select')) return;
    const drop = e.target.closest('button[data-drop]');
    if (drop) { commit(Store.unmarkToday(state, Number(drop.dataset.drop), today()).state); render(); return; }
    const add = e.target.closest('button[data-add]');
    if (add) { addToToday(Number(add.dataset.add)); return; }
    const addNew = e.target.closest('button[data-add-new]');
    if (addNew) { addToToday(null, $('#add-name').value.trim()); return; }
    const open = e.target.closest('[data-open]');
    if (open) openCard(Number(open.dataset.open));
  });
  $('#today').addEventListener('input', (e) => { if (e.target.id === 'add-name') renderAddHits(); });
  // 시간 → Tab → 이름 → Enter 로 한 명씩 빠르게 올린다
  $('#today').addEventListener('keydown', (e) => {
    if (e.target.id !== 'add-name' || e.key !== 'Enter') return;
    e.preventDefault();
    const first = $('#add-hits button[data-add]') || $('#add-hits button[data-add-new]');
    if (first) first.click();
  });
  // 명단에 올린 뒤 시간을 고치면 줄 순서도 따라 바뀐다
  $('#today').addEventListener('change', (e) => {
    const at = e.target.closest('[data-at]');
    if (!at) return;
    const id = Number(at.dataset.at);
    try {
      commit(Store.setTodayTime(state, id, today(), at.value).state);
      render();
    } catch (err) {
      const kept = Store.todayList(state, today()).find((t) => t.customer.id === id);
      at.value = kept ? kept.at : '';
      showMsg($('#today-msg'), err.message, 'error');
    }
  });

  // 가운데 카드 (월별 화면의 고객 줄·달 넘기기도 여기)
  $('#card').addEventListener('click', (e) => {
    if (e.target.closest('input, textarea, select')) return;
    const open = e.target.closest('[data-open]');
    if (open) { openCard(Number(open.dataset.open)); return; }
    const tab = e.target.closest('button[data-tab]');
    if (tab && view.kind === 'card') { cardTab = tab.dataset.tab; render(); return; }
    if (e.target.closest('[data-monthly]')) { view = { kind: 'monthly', month: today().slice(0, 7) }; render(); return; }
    const mv = e.target.closest('button[data-month]');
    if (mv) { view = { kind: 'monthly', month: mv.dataset.month }; render(); return; }
    const btn = e.target.closest('button[data-action]');
    if (!btn || view.kind !== 'card') return;
    const a = btn.dataset.action;
    try {
      if (a === 'edit-identity') { editingIdentity = true; render(); $('#id-name').focus(); }
      else if (a === 'cancel-identity') { editingIdentity = false; render(); }
      else if (a === 'save-identity') {
        commit(Store.editCustomer(state, view.id, { name: $('#id-name').value, phone: $('#id-phone').value, referrer: $('#id-referrer').value, isLegacy: $('#id-legacy').checked }).state);
        editingIdentity = false; render();
      }
      else if (a === 'delete-customer') {
        const c = customerOf(view.id);
        const n = Store.visitsOf(state, view.id).length;
        if (!confirm(`${c.name} 고객을 목록에서 지웁니다.\n\n방문 기록 ${n}건도 함께 감춰집니다.\n왼쪽 아래 [지운 고객]에서 되살릴 수 있습니다.\n\n지울까요?`)) return;
        commit(Store.deleteCustomer(state, view.id, now()).state);
        editingIdentity = false; trashOpen = true; view = { kind: 'today' }; render();
      }
      else if (a === 'edit-profile') { editingProfile = true; render(); $('#profile-talk').focus(); }
      else if (a === 'cancel-profile') { editingProfile = false; render(); }
      else if (a === 'save-profile') {
        commit(Store.setProfile(state, view.id, { talk: $('#profile-talk').value, hair: $('#profile-hair').value }, now()).state);
        editingProfile = false; render();
      }
      else if (a === 'notice-add') {
        $('#notice-items').appendChild(noticeRow());
        $('#notice-items').lastElementChild.querySelector('.it-name').focus();
        refreshNotice();
      }
      else if (a === 'notice-row-del') {
        btn.closest('.notice-item').remove();
        if (!document.querySelector('.notice-item')) $('#notice-items').appendChild(noticeRow());
        refreshNotice();
      }
      else if (a === 'notice-copy' || a === 'notice-apply') {
        const f = readNotice();
        const used = Store.noticeUsed(f.items);
        if (!used && !f.topup) { showMsg($('#notice-msg'), '오늘 시술이나 충전 내역을 먼저 적으세요', 'error'); return; }

        // 반영은 저장까지 하므로 먼저 계산해 본다. 잔액이 모자라면 여기서 막혀
        // 문자만 나가고 숫자는 안 맞는 일이 생기지 않는다.
        let next = state;
        try {
          // 문자에 적는 날짜로 정액권 내역도 남긴다. 시각은 지금 것 (뒤 날짜는 cleanDate가 막는다).
          const day = Store.cleanDate(f.date, now());
          const at = day ? day + now().slice(10) : now();
          if (a === 'notice-apply') {
            // 원장이 적은 잔액이 카드 잔액과 다르면 먼저 그 금액으로 맞춘다 (차이만큼 내역 한 줄).
            if (f.prevTyped) next = Store.setPassBalance(next, view.id, f.prev, at).state;
            if (f.topup) {
              next = Store.chargePass(next, view.id, { amount: f.topup.amount, note: f.topup.name || '정액권 충전' }, at).state;
              next = Store.rememberProduct(next, f.topup).state;
            }
            if (used) {
              const what = f.items.map((it) => it.name).filter(Boolean).join(' · ') || '시술';
              next = Store.usePass(next, view.id, { amount: used, note: what }, at).state;
            }
          }
        } catch (err) { showMsg($('#notice-msg'), err.message, 'error'); return; }
        const text = Store.buildNotice(f);
        commit(next);
        const remain = Store.passBalance(state, view.id);
        copyText(text).then((ok) => {
          if (a === 'notice-copy') { noticeOpen = true; render(); }
          showMsg($('#notice-msg'),
            ok ? (a === 'notice-apply' ? `복사했습니다 · 잔액 ${Store.formatWon(remain)}` : '복사했습니다')
               : '자동 복사가 막혔습니다. 아래 글을 직접 복사하세요',
            ok ? 'ok' : 'error');
        });
        if (a === 'notice-apply') { noticeOpen = true; render(); showMsg($('#notice-msg'), `정액권에 반영했습니다 · 잔액 ${Store.formatWon(remain)}`, 'ok'); }
      }
      else if (a === 'pass-charge' || a === 'pass-use') {
        passForm = a === 'pass-charge' ? 'charge' : 'use'; render(); $('#pass-amount').focus();
      }
      else if (a === 'pass-cancel') { passForm = null; render(); }
      else if (a === 'pass-save') {
        const fields = { amount: $('#pass-amount').value, note: $('#pass-note').value };
        const put = passForm === 'charge' ? Store.chargePass : Store.usePass;
        commit(put(state, view.id, fields, now()).state);
        passForm = null; passOpen = true; render();
      }
      else if (a === 'pass-del') {
        const e = Store.passEntriesOf(state, view.id).find((x) => x.id === Number(btn.dataset.id));
        const label = `${e.kind === 'charge' ? '충전' : '사용'} ${e.kind === 'charge' ? '+' : '-'}${Store.formatWon(e.amount)}`;
        if (!confirm(`${fmt(e.at)} 정액권 내역을 지웁니다.\n\n${label}${e.note ? ' · ' + e.note : ''}\n\n지우면 잔액이 바로 바뀝니다. 되돌릴 수 없습니다.\n\n지울까요?`)) return;
        commit(Store.deletePass(state, e.id).state);
        passOpen = true; render();
      }
      else if (a === 'del-visit') {
        const v = Store.visitsOf(state, view.id).find((x) => x.id === Number(btn.dataset.id));
        const head = v.done.length > 40 ? v.done.slice(0, 40) + '…' : v.done;
        const linked = Store.passEntriesOf(state, view.id).filter((x) => x.visitId === v.id);
        const note = linked.length
          ? `\n\n이 방문과 함께 넣은 정액권 차감 ${Store.formatWon(linked.reduce((n, x) => n + x.amount, 0))}은 그대로 남습니다.\n필요하면 정액권 내역에서 따로 지우세요.`
          : '';
        if (!confirm(`${fmt(v.createdAt)} 방문 기록을 지웁니다.\n\n${head}${note}\n\n[지난 방문] 아래 [지운 기록]에서 되살릴 수 있습니다.\n\n지울까요?`)) return;
        commit(Store.deleteVisit(state, v.id, now()).state);
        visitTrashOpen = true; editingVisitId = null; render();
      }
      else if (a === 'restore-visit') {
        commit(Store.restoreVisit(state, Number(btn.dataset.id)).state);
        visitTrashOpen = true; render();
      }
      else if (a === 'purge-visit') {
        const v = Store.deletedVisitsOf(state, view.id).find((x) => x.id === Number(btn.dataset.id));
        const head = v.done.length > 40 ? v.done.slice(0, 40) + '…' : v.done;
        if (!confirm(`${fmt(v.createdAt)} 기록을 완전히 지웁니다.\n\n${head}\n\n이건 되돌릴 수 없습니다.\n\n계속할까요?`)) return;
        if (!confirm('마지막 확인입니다.\n\n이 기록이 영영 사라집니다.')) return;
        commit(Store.purgeVisit(state, v.id).state);
        visitTrashOpen = true; render();
      }
      else if (a === 'edit') { editingVisitId = Number(btn.dataset.id); render(); $('#edit-done').focus(); }
      else if (a === 'cancel-edit') { editingVisitId = null; render(); }
      else if (a === 'discard-draft') { clearDraft(view.id); render(); }
      else if (a === 'save-edit') {
        commit(Store.editVisit(state, Number(btn.dataset.id), { done: $('#edit-done').value, next: $('#edit-next').value, kinds: readChips('edit-kind'), date: $('#edit-date').value }, now()).state);
        editingVisitId = null; render();
      }
    } catch (err) { showMsg($('#pass-msg') || $('#identity-msg') || $('#edit-msg') || $('#profile-msg') || $('#visit-trash-msg'), err.message, 'error'); }
  });

  $('#trash').addEventListener('click', (e) => {
    if (e.target.closest('summary')) { trashOpen = !trashOpen; return; }

    const restore = e.target.closest('button[data-restore]');
    if (restore) {
      try {
        const { state: next, customer } = Store.restoreCustomer(state, Number(restore.dataset.restore));
        commit(next); trashOpen = true; render();
        showMsg($('#trash-msg'), `${customer.name} 고객을 되살렸습니다`, 'ok');
      } catch (err) { showMsg($('#trash-msg'), err.message, 'error'); }
      return;
    }

    // 완전히 지우기는 되돌릴 수 없으므로 두 번 묻는다.
    const purge = e.target.closest('button[data-purge]');
    if (purge) {
      const id = Number(purge.dataset.purge);
      const c = customerOf(id);
      const n = Store.visitsOf(state, id).length;
      if (!confirm(`${c.name} 고객과 방문 기록 ${n}건을 완전히 지웁니다.\n\n이건 되돌릴 수 없습니다.\n\n계속할까요?`)) return;
      if (!confirm(`마지막 확인입니다.\n\n${c.name} 고객의 기록이 영영 사라집니다.`)) return;
      commit(Store.purgeCustomer(state, id).state);
      trashOpen = true;
      if (view.kind === 'card' && view.id === id) view = { kind: 'today' };
      render();
    }
  });

  $('#card').addEventListener('click', (e) => {
    if (e.target.closest('details.trash summary')) visitTrashOpen = !visitTrashOpen;
    if (e.target.closest('details.pass-list summary')) passOpen = !passOpen;
    if (e.target.closest('details.notice > summary')) {
      noticeOpen = !noticeOpen;
      if (noticeOpen) setTimeout(setupNotice, 0);
    }
  });

  $('#card').addEventListener('input', (e) => {
    if (e.target.closest('#visit-form')) { saveDraft(); return; }
    if (e.target.closest('.notice')) refreshNotice();
  });

  $('#card').addEventListener('change', (e) => {
    if (e.target.closest('#visit-form')) { saveDraft(); return; }   // 칩·날짜
    if (e.target.id === 'notice-topup-on') { $('#notice-topup').hidden = !e.target.checked; refreshNotice(); return; }
    if (e.target.id === 'notice-date') { refreshNotice(); return; }
    // 다시 그리지 않는다. 그리면 지금 치던 칸에서 커서가 날아간다.
    if (e.target.id === 'notice-head' || e.target.id === 'notice-tail') {
      commit(Store.setSettings(state, { head: $('#notice-head').value, tail: $('#notice-tail').value }).state);
      return;
    }
    // 기억해 둔 상품을 고르면 금액·조건·선물을 채워 준다
    if (e.target.id === 'notice-topup-name') {
      const p = Store.findProduct(state, e.target.value);
      if (p) {
        $('#notice-topup-amt').value = Store.comma(p.amount);
        $('#notice-topup-terms').value = p.terms;
        $('#notice-topup-gift').value = p.gift;
      }
      refreshNotice();
      return;
    }
    // 금액 칸은 손을 뗄 때 쉼표를 찍는다. 글자 치는 중에 찍으면 커서가 튄다.
    if (e.target.classList.contains('won')) {
      const n = digitsOf(e.target.value);
      e.target.value = n ? Store.comma(n) : '';
      refreshNotice();
      return;
    }
  });

  $('#card').addEventListener('submit', (e) => {
    if (e.target.id !== 'visit-form') return;
    e.preventDefault();
    try {
      const date = $('#visit-date').value;
      commit(Store.addVisit(state, view.id, { done: $('#visit-done').value, next: $('#visit-next').value, kinds: readChips('visit-kind'), date }, now()).state);
      clearDraft(view.id);   // 저장됐으니 임시 글은 비운다
      render();
      showMsg($('#visit-msg'), date && date !== today() ? `${fmtDay(date)} 기록으로 저장했습니다. [지난 방문]에 있습니다` : '저장했습니다', 'ok');
    } catch (err) { showMsg($('#visit-msg'), err.message, 'error'); }
  });

  // ---- 파일 백업 -----------------------------------------------------------
  $('#export').addEventListener('click', () => {
    const blob = new Blob([Store.serialize(state)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `상담카드-백업-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $('#import').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const loaded = Store.deserialize(text);
    const summary = (st) => `고객 ${st.customers.length}명 · 방문 기록 ${st.visits.length}건 · 정액권 잔액 합계 ${Store.formatWon(st.customers.reduce((a, c) => a + Store.passBalance(st, c.id), 0))}`;
    if (loaded.customers.length === 0 && state.customers.length > 0 && !confirm('이 백업 파일에는 고객이 없습니다. 지금 서버 기록을 비우고 이 파일로 되돌릴까요?')) { e.target.value = ''; return; }
    if (state.customers.length > 0 && !confirm(`지금 서버 기록(${summary(state)})을\n이 백업 파일의 내용(${summary(loaded)})으로 통째로 되돌립니다.\n지금 기록 중 백업 이후에 적은 것은 사라집니다.\n\n계속할까요?`)) { e.target.value = ''; return; }
    e.target.value = '';
    showSync('백업 파일로 되돌리는 중…');
    try {
      const cleaned = Store.sweepDeletedVisits(loaded, now()).state;
      await storage.replaceAll(cleaned);
      state = await storage.load(today());
      view = { kind: 'today' }; render();
      showSync('');
      alert(`되돌렸습니다.\n\n백업 파일: ${summary(cleaned)}\n서버: ${summary(state)}\n\n두 줄이 같으면 잘 된 것입니다.`);
    } catch (err) { showSync(`되돌리기 실패: ${err.message}`, 'error'); }
  });

  // ---- 시작: 로그인 → 서버에서 읽기 → 그리기 -------------------------------
  async function boot() {
    if (USE_LOCAL) { $('#subtitle').textContent = '시험 모드 · 이 브라우저에만 저장됩니다'; $('#logout').hidden = true; }
    else DB.init(CONFIG, window.supabase);
    if (!(await storage.session())) { $('#login').hidden = false; $('#login-password').focus(); return; }
    await start();
  }
  async function start() {
    $('#login').hidden = true;
    showSync('불러오는 중…');
    try {
      state = await storage.load(today());
      showSync('');
    } catch (err) { showSync(`불러오기 실패: ${err.message}`, 'error'); return; }
    // 지운 지 일주일이 지난 방문 기록을 치운다.
    const swept = Store.sweepDeletedVisits(state, now());
    if (swept.removed > 0) commit(swept.state);
    render();
  }
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await storage.login(CONFIG.LOGIN_EMAIL, $('#login-password').value); await start(); }
    catch (err) { showMsg($('#login-msg'), err.message, 'error'); }
  });
  // 다른 컴퓨터에서 고친 뒤 이 창을 다시 잡으면 서버에서 다시 읽는다 (고치는 중이면 건너뜀).
  window.addEventListener('focus', async () => {
    if (USE_LOCAL || $('#login').hidden === false || isEditing() || pendingSaves > 0) return;
    try { const fresh = await storage.load(today()); state = fresh; render(); } catch {}
  });
  boot();
})();
