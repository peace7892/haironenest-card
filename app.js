// 화면 연결. 규칙은 전부 store.js에 있고, 여기서는 그리기와 이벤트만 다룬다.
(() => {
  const KEY = 'haironenest-card:v1';
  let state = Store.deserialize(localStorage.getItem(KEY));
  let view = { kind: 'today' }; // { kind: 'today' } | { kind: 'card', id }
  let editingVisitId = null;
  let editingProfile = false;
  let editingIdentity = false;
  let trashOpen = false;
  let visitTrashOpen = false;
  let passForm = null;   // null | 'charge' | 'use'
  let passOpen = false;
  let noticeOpen = false;

  const $ = (sel) => document.querySelector(sel);
  const pad = (n) => String(n).padStart(2, '0');
  const now = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
  const today = () => now().slice(0, 10);
  const fmt = (iso) => `${iso.slice(0, 4)}.${iso.slice(5, 7)}.${iso.slice(8, 10)} ${iso.slice(11, 16)}`;
  const esc = (s) => (s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const customerOf = (id) => state.customers.find((c) => c.id === id);

  function commit(next) {
    state = next;
    localStorage.setItem(KEY, Store.serialize(state));
  }
  function showMsg(el, text, kind) { if (el) { el.textContent = text; el.className = `msg ${kind}`; } }
  function openCard(id) { view = { kind: 'card', id }; editingVisitId = null; editingProfile = false; editingIdentity = false; passForm = null; passOpen = false; noticeOpen = false; commit(Store.markToday(state, id, today()).state); render(); }

  // ---- 왼쪽: 고객 목록 ----------------------------------------------------
  function renderCustomers() {
    const list = $('#customer-list');
    const found = Store.findCustomers(state, $('#search').value);
    const activeId = view.kind === 'card' ? view.id : null;
    if (found.length === 0) {
      list.innerHTML = `<li class="empty">${state.customers.length === 0 ? '아직 고객이 없습니다.' : '찾는 고객이 없습니다.'}</li>`;
      return;
    }
    const todayIds = state.today.date === today() ? state.today.entries.map((e) => e.customerId) : [];
    list.innerHTML = found.map((c) => `
      <li data-id="${c.id}" class="${c.id === activeId ? 'active' : ''}">
        <span>${esc(c.name)} <small>${esc(Store.maskPhone(c.phone))}</small></span>
        ${todayIds.includes(c.id) ? '<small>오늘</small>' : `<button type="button" class="small secondary" data-today="${c.id}">오늘</button>`}
      </li>`).join('');
  }

  // 예약 시간 고르는 칸. 영업시간 밖 시간이 이미 적혀 있으면(옛 기록) 그 시간도 후보에 끼워 준다.
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
          <label style="margin-top:0">오늘 시술</label>
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
    return {
      head: $('#notice-head').value,
      tail: $('#notice-tail').value,
      prev: Store.passBalance(state, view.id),
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
  function cycleText(cy) {
    if (cy.sinceLast === null) return '첫 방문';
    const last = cy.lastDate.replace(/-/g, '.');
    return `<b>${cy.sinceLast}일 만</b> · 지난 방문 ${last}${cy.average ? ` · 보통 ${cy.average}일마다` : ''}`;
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

  // ---- 오른쪽: 오늘 명단 ---------------------------------------------------
  function renderToday() {
    const list = Store.todayList(state, today());
    const done = list.filter((t) => t.recorded).length;
    const items = list.length === 0
      ? '<div class="empty">위 칸에 예약 시간과 이름을 넣어 오늘 올 고객을 쭉 올려두세요.<br>손님이 다녀가면 그 줄을 눌러 기록을 남깁니다.</div>'
      : list.map((t) => `
        <div class="today-item" data-open="${t.customer.id}">
          <div class="no">${t.order}</div>
          <div class="when"><select class="at" data-at="${t.customer.id}" title="예약 시간">${timeOptions(t.at)}</select></div>
          <div class="who">
            <div class="name">${esc(t.customer.name)} <small style="color:var(--muted);font-weight:normal">${esc(Store.maskPhone(t.customer.phone))}</small></div>
            <div class="cycle">${cycleText(t)}</div>
            <div class="sub">${esc([t.customer.profile.hair, t.customer.profile.talk].filter(Boolean).join(' · ')) || '<i>고정 정보 없음</i>'}</div>
            ${t.lastNext ? `<div class="sub">지난번 다음 방향: ${esc(t.lastNext)}</div>` : ''}
          </div>
          <div class="right">
            <span class="status ${t.recorded ? 'done' : 'todo'}">${t.recorded ? '기록 남김' : '아직 안 적음'}</span>
            ${t.balance > 0 ? `<span class="status pass">정액권 ${Store.formatWon(t.balance)}</span>` : ''}
            <button type="button" class="link small" data-drop="${t.customer.id}">명단에서 빼기</button>
          </div>
        </div>`).join('');
    return `
      <h2 class="card-title">오늘 <small>${today().replace(/-/g, '.')} · ${list.length}명 중 ${done}명 기록 남김</small></h2>
      <div class="add-today">
        <div class="row">
          <select class="at" id="add-at" title="예약 시간 (안 골라도 됩니다)">${timeOptions('')}</select>
          <input type="text" id="add-name" placeholder="이름이나 전화번호를 치면 아래에 뜹니다" autocomplete="off">
        </div>
        <div id="add-hits"></div>
      </div>
      <div class="msg" id="today-msg"></div>
      ${items}`;
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
      render();
      $('#add-at').focus();
    } catch (err) { showMsg($('#today-msg'), err.message, 'error'); }
  }

  // ---- 오른쪽: 고객 카드 ---------------------------------------------------
  function renderCard(c) {
    const visits = Store.visitsWithGaps(state, c.id);
    const latestNext = visits.find((v) => v.next)?.next;
    return `
      ${renderIdentity(c, visits.length)}
      <div class="cycle big">${cycleText(Store.visitCycle(state, c.id, today()))}</div>
      ${renderPass(c)}
      ${renderProfile(c)}
      ${latestNext ? `<div class="next-big"><b>지난번에 다음에 하기로 한 것</b><p>${esc(latestNext)}</p></div>` : ''}
      <form id="visit-form">
        <label>오늘 시술 내용과 그 이유 (필수)</label>
        <textarea id="visit-done" placeholder="예: 탑 볼륨 부족해서 언더에서 무게 뺌. 아침에 5분밖에 못 쓴다고 해서 드라이 없이 되는 라인으로"></textarea>
        <label>다음에 하기로 한 방향 (비워도 됨)</label>
        <textarea id="visit-next" style="min-height:60px" placeholder="예: 다음엔 길이 유지하고 볼륨펌 상담"></textarea>
          <div class="row" style="margin-top:8px"><div class="msg" id="visit-msg"></div><button type="submit">방문 기록 저장</button></div>
      </form>
      ${renderNotice(c)}
      <h3>지난 방문</h3>
      ${visits.length === 0 ? '<div class="empty">아직 기록이 없습니다.</div>' : visits.map(renderVisit).join('')}
      ${renderDeletedVisits(c)}`;
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

  function renderIdentity(c, visitCount) {
    if (editingIdentity) {
      return `
        <div class="identity">
          <div><label style="margin-top:0">이름</label><input type="text" id="id-name" value="${esc(c.name)}"></div>
          <div><label style="margin-top:0">전화번호</label><input type="text" id="id-phone" inputmode="tel" value="${esc(fmtPhone(c.phone))}" placeholder="010-1234-5678"></div>
          <div><label style="margin-top:0">소개해 준 분</label><input type="text" id="id-referrer" value="${esc(c.referrer)}" placeholder="없으면 비움"></div>
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
      <h2 class="card-title">${esc(c.name)} <small>${phoneText} · 지난 방문 ${visitCount}건</small>
        <button type="button" class="link" data-action="edit-identity">이름·번호·소개 고치기</button></h2>
      <div class="referrer">${c.referrer ? '소개: ' + esc(c.referrer) : '<i>소개해 준 분 없음</i>'}</div>`;
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
    const history = c.profileHistory.length === 0 ? '' : `
      <details><summary>고치기 전 고정 정보 ${c.profileHistory.length}건</summary>
        <div class="history">${[...c.profileHistory].reverse().map((h) => `<p><small>${fmt(h.replacedAt)}까지</small><br>${esc(h.talk) || '—'}<br>${esc(h.hair) || '—'}</p>`).join('')}</div>
      </details>`;
    return `
      <div class="profile">
        <div class="grid">
          <div class="item"><b>고객이 한 말 · 생활 습관 · 직업이나 상황</b><p>${esc(p.talk) || '<i style="color:var(--muted)">아직 없음</i>'}</p></div>
          <div class="item"><b>얼굴형 · 모질 · 두상</b><p>${esc(p.hair) || '<i style="color:var(--muted)">아직 없음</i>'}</p></div>
        </div>
        <div class="row" style="margin-top:10px"><span></span><button type="button" class="link" data-action="edit-profile">고정 정보 ${p.talk || p.hair ? '고치기' : '적기'}</button></div>
        ${history}
      </div>`;
  }

  function renderVisit(v) {
    if (v.id === editingVisitId) {
      return `
        <div class="visit">
          <div class="meta"><span>${fmt(v.createdAt)}</span><span>고치는 중</span></div>
          <label style="margin-top:0">오늘 시술 내용과 그 이유</label><textarea id="edit-done">${esc(v.done)}</textarea>
          <label>다음에 하기로 한 방향</label><textarea id="edit-next" style="min-height:60px">${esc(v.next)}</textarea>
          <div class="row" style="margin-top:8px"><div class="msg" id="edit-msg"></div>
            <button type="button" class="secondary" data-action="cancel-edit">취소</button>
            <button type="button" data-action="save-edit" data-id="${v.id}">고친 내용 저장</button></div>
        </div>`;
    }
    const history = v.history.length === 0 ? '' : `
      <details><summary>고치기 전 내용 ${v.history.length}건</summary>
        <div class="history">${[...v.history].reverse().map((h) => `<p><small>${fmt(h.replacedAt)}까지</small><br>${esc(h.done)}${h.next ? '<br>다음: ' + esc(h.next) : ''}</p>`).join('')}</div>
      </details>`;
    return `
      <div class="visit">
        <div class="meta"><span>${fmt(v.createdAt)}${v.sincePrev === null ? ' · 첫 방문' : ` · 이전 방문에서 ${v.sincePrev}일 만`}</span>
          <span class="acts">
            <button type="button" class="link" data-action="edit" data-id="${v.id}">고치기</button>
            <button type="button" class="link danger" data-action="del-visit" data-id="${v.id}">지우기</button>
          </span></div>
        <div class="field"><b>시술 내용과 이유</b><p>${esc(v.done)}</p></div>
        ${v.next ? `<div class="field"><b>다음 방향</b><p>${esc(v.next)}</p></div>` : ''}
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
    renderCustomers();
    renderTrash();
    const card = $('#card');
    if (view.kind === 'card' && customerOf(view.id)) { card.innerHTML = renderCard(customerOf(view.id)); setupNotice(); }
    else { view = { kind: 'today' }; card.innerHTML = renderToday(); renderAddHits(); }
  }

  // ---- 이벤트 --------------------------------------------------------------
  $('#home').addEventListener('click', () => { view = { kind: 'today' }; render(); });
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
      const { state: next, customer } = Store.addCustomer(state, { name: $('#new-name').value, phone: $('#new-phone').value, referrer: $('#new-referrer').value });
      commit(next);
      $('#new-name').value = ''; $('#new-phone').value = ''; $('#new-referrer').value = ''; $('#search').value = '';
      showMsg($('#new-msg'), `${customer.name} 카드를 만들었습니다`, 'ok');
      openCard(customer.id);
      editingProfile = true; render();
    } catch (err) { showMsg($('#new-msg'), err.message, 'error'); }
  });

  $('#card').addEventListener('click', (e) => {
    // 시간 칸을 누른 것뿐인데 카드가 열려버리면 안 된다
    if (e.target.closest('input, textarea, select')) return;

    const drop = e.target.closest('button[data-drop]');
    if (drop) { commit(Store.unmarkToday(state, Number(drop.dataset.drop), today()).state); render(); return; }
    const add = e.target.closest('button[data-add]');
    if (add) { addToToday(Number(add.dataset.add)); return; }
    const addNew = e.target.closest('button[data-add-new]');
    if (addNew) { addToToday(null, $('#add-name').value.trim()); return; }

    const open = e.target.closest('[data-open]');
    if (open) { openCard(Number(open.dataset.open)); return; }
    const btn = e.target.closest('button[data-action]');
    if (!btn || view.kind !== 'card') return;
    const a = btn.dataset.action;
    try {
      if (a === 'edit-identity') { editingIdentity = true; render(); $('#id-name').focus(); }
      else if (a === 'cancel-identity') { editingIdentity = false; render(); }
      else if (a === 'save-identity') {
        commit(Store.editCustomer(state, view.id, { name: $('#id-name').value, phone: $('#id-phone').value, referrer: $('#id-referrer').value }).state);
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
          if (a === 'notice-apply') {
            if (f.topup) {
              next = Store.chargePass(next, view.id, { amount: f.topup.amount, note: f.topup.name || '정액권 충전' }, now()).state;
              next = Store.rememberProduct(next, f.topup).state;
            }
            if (used) {
              const what = f.items.map((it) => it.name).filter(Boolean).join(' · ') || '시술';
              next = Store.usePass(next, view.id, { amount: used, note: what }, now()).state;
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
      else if (a === 'save-edit') {
        commit(Store.editVisit(state, Number(btn.dataset.id), { done: $('#edit-done').value, next: $('#edit-next').value }, now()).state);
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
    if (e.target.id === 'add-name') { renderAddHits(); return; }
    if (e.target.closest('.notice')) refreshNotice();
  });

  // 시간 → Tab → 이름 → Enter 로 한 명씩 빠르게 올린다
  $('#card').addEventListener('keydown', (e) => {
    if (e.target.id !== 'add-name' || e.key !== 'Enter') return;
    e.preventDefault();
    const first = $('#add-hits button[data-add]') || $('#add-hits button[data-add-new]');
    if (first) first.click();
  });

  $('#card').addEventListener('change', (e) => {
    if (e.target.id === 'notice-topup-on') { $('#notice-topup').hidden = !e.target.checked; refreshNotice(); return; }
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

  // 명단에 올린 뒤 시간을 고치면 줄 순서도 따라 바뀐다
  $('#card').addEventListener('change', (e) => {
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

  $('#card').addEventListener('submit', (e) => {
    if (e.target.id !== 'visit-form') return;
    e.preventDefault();
    try {
      commit(Store.addVisit(state, view.id, { done: $('#visit-done').value, next: $('#visit-next').value }, now()).state);
      render();
      showMsg($('#visit-msg'), '저장했습니다', 'ok');
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
    if (loaded.customers.length === 0 && state.customers.length > 0 && !confirm('불러올 파일에 고객이 없습니다. 지금 기록을 비우고 이 파일로 바꿀까요?')) { e.target.value = ''; return; }
    if (state.customers.length > 0 && !confirm(`지금 기록(고객 ${state.customers.length}명)을 이 파일의 내용(고객 ${loaded.customers.length}명)으로 바꿉니다. 계속할까요?`)) { e.target.value = ''; return; }
    commit(Store.sweepDeletedVisits(loaded, now()).state);
    view = { kind: 'today' };
    render();
    e.target.value = '';
  });

  // 앱을 열 때 한 번: 지운 지 일주일이 지난 방문 기록을 치운다.
  const swept = Store.sweepDeletedVisits(state, now());
  if (swept.removed > 0) commit(swept.state);

  render();
})();
