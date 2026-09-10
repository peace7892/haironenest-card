// 화면 연결. 규칙은 전부 store.js에 있고, 여기서는 그리기와 이벤트만 다룬다.
(() => {
  const KEY = 'haironenest-card:v1';
  let state = Store.deserialize(localStorage.getItem(KEY));
  let view = { kind: 'today' }; // { kind: 'today' } | { kind: 'card', id }
  let editingVisitId = null;
  let editingProfile = false;
  let editingIdentity = false;

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
  function openCard(id) { view = { kind: 'card', id }; editingVisitId = null; editingProfile = false; editingIdentity = false; commit(Store.markToday(state, id, today()).state); render(); }

  // ---- 왼쪽: 고객 목록 ----------------------------------------------------
  function renderCustomers() {
    const list = $('#customer-list');
    const found = Store.findCustomers(state, $('#search').value);
    const activeId = view.kind === 'card' ? view.id : null;
    if (found.length === 0) {
      list.innerHTML = `<li class="empty">${state.customers.length === 0 ? '아직 고객이 없습니다.' : '찾는 고객이 없습니다.'}</li>`;
      return;
    }
    const todayIds = state.today.date === today() ? state.today.customerIds : [];
    list.innerHTML = found.map((c) => `
      <li data-id="${c.id}" class="${c.id === activeId ? 'active' : ''}">
        <span>${esc(c.name)} <small>${esc(Store.maskPhone(c.phone))}</small></span>
        ${todayIds.includes(c.id) ? '<small>오늘</small>' : `<button type="button" class="small secondary" data-today="${c.id}">오늘</button>`}
      </li>`).join('');
  }

  // ---- 오른쪽: 오늘 명단 ---------------------------------------------------
  function renderToday() {
    const list = Store.todayList(state, today());
    const done = list.filter((t) => t.recorded).length;
    const items = list.length === 0
      ? '<div class="empty">아침에 핸드SOS 예약 명단을 보며, 왼쪽에서 고객을 찾아 [오늘]을 누르세요. 없는 고객은 새로 만듭니다.<br>명단에 없던 고객이 와서 카드를 열면 자동으로 여기에 들어옵니다.</div>'
      : list.map((t) => `
        <div class="today-item" data-open="${t.customer.id}">
          <div class="name">${esc(t.customer.name)} <small style="color:var(--muted);font-weight:normal">${esc(Store.maskPhone(t.customer.phone))}</small></div>
          <span class="status ${t.recorded ? 'done' : 'todo'}">${t.recorded ? '기록 남김' : '아직 안 적음'}</span>
          <div class="sub">${esc([t.customer.profile.hair, t.customer.profile.talk].filter(Boolean).join(' · ')) || '<i>고정 정보 없음</i>'}</div>
          <div class="sub">${t.lastNext ? '지난번 다음 방향: ' + esc(t.lastNext) : '지난 방문 기록 없음'}</div>
        </div>`).join('');
    return `
      <h2 class="card-title">오늘 <small>${today().replace(/-/g, '.')} · ${list.length}명 중 ${done}명 기록 남김</small></h2>
      ${items}`;
  }

  // ---- 오른쪽: 고객 카드 ---------------------------------------------------
  function renderCard(c) {
    const visits = Store.visitsOf(state, c.id);
    const latestNext = visits.find((v) => v.next)?.next;
    return `
      ${renderIdentity(c, visits.length)}
      ${renderProfile(c)}
      ${latestNext ? `<div class="next-big"><b>지난번에 다음에 하기로 한 것</b><p>${esc(latestNext)}</p></div>` : ''}
      <form id="visit-form">
        <label>오늘 시술 내용과 그 이유 (필수)</label>
        <textarea id="visit-done" placeholder="예: 탑 볼륨 부족해서 언더에서 무게 뺌. 아침에 5분밖에 못 쓴다고 해서 드라이 없이 되는 라인으로"></textarea>
        <label>다음에 하기로 한 방향 (비워도 됨)</label>
        <textarea id="visit-next" style="min-height:60px" placeholder="예: 다음엔 길이 유지하고 볼륨펌 상담"></textarea>
        <div class="row" style="margin-top:8px"><div class="msg" id="visit-msg"></div><button type="submit">방문 기록 저장</button></div>
      </form>
      <h3>지난 방문</h3>
      ${visits.length === 0 ? '<div class="empty">아직 기록이 없습니다.</div>' : visits.map(renderVisit).join('')}`;
  }

  const fmtPhone = (p) => (p.length === 11 ? `${p.slice(0, 3)}-${p.slice(3, 7)}-${p.slice(7)}` : p.length === 10 ? `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}` : p);

  function renderIdentity(c, visitCount) {
    if (editingIdentity) {
      return `
        <div class="identity">
          <div><label style="margin-top:0">이름</label><input type="text" id="id-name" value="${esc(c.name)}"></div>
          <div><label style="margin-top:0">전화번호</label><input type="text" id="id-phone" inputmode="tel" value="${esc(fmtPhone(c.phone))}" placeholder="010-1234-5678"></div>
          <button type="button" class="secondary" data-action="cancel-identity">취소</button>
          <button type="button" data-action="save-identity">저장</button>
        </div>
        <div class="msg" id="identity-msg"></div>`;
    }
    const phoneText = !c.phone ? '번호 없음' : c.phone.length <= 4 ? `뒤 4자리만 있음 ${esc(c.phone)}` : esc(fmtPhone(c.phone));
    return `
      <h2 class="card-title">${esc(c.name)} <small>${phoneText} · 지난 방문 ${visitCount}건</small>
        <button type="button" class="link" data-action="edit-identity">이름·번호 고치기</button></h2>`;
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
        <div class="meta"><span>${fmt(v.createdAt)}</span><button type="button" class="link" data-action="edit" data-id="${v.id}">고치기</button></div>
        <div class="field"><b>시술 내용과 이유</b><p>${esc(v.done)}</p></div>
        ${v.next ? `<div class="field"><b>다음 방향</b><p>${esc(v.next)}</p></div>` : ''}
        ${history}
      </div>`;
  }

  function render() {
    renderCustomers();
    const card = $('#card');
    if (view.kind === 'card' && customerOf(view.id)) card.innerHTML = renderCard(customerOf(view.id));
    else { view = { kind: 'today' }; card.innerHTML = renderToday(); }
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
      const { state: next, customer } = Store.addCustomer(state, { name: $('#new-name').value, phone: $('#new-phone').value });
      commit(next);
      $('#new-name').value = ''; $('#new-phone').value = ''; $('#search').value = '';
      showMsg($('#new-msg'), `${customer.name} 카드를 만들었습니다`, 'ok');
      openCard(customer.id);
      editingProfile = true; render();
    } catch (err) { showMsg($('#new-msg'), err.message, 'error'); }
  });

  $('#card').addEventListener('click', (e) => {
    const open = e.target.closest('[data-open]');
    if (open) { openCard(Number(open.dataset.open)); return; }
    const btn = e.target.closest('button[data-action]');
    if (!btn || view.kind !== 'card') return;
    const a = btn.dataset.action;
    try {
      if (a === 'edit-identity') { editingIdentity = true; render(); $('#id-name').focus(); }
      else if (a === 'cancel-identity') { editingIdentity = false; render(); }
      else if (a === 'save-identity') {
        commit(Store.editCustomer(state, view.id, { name: $('#id-name').value, phone: $('#id-phone').value }).state);
        editingIdentity = false; render();
      }
      else if (a === 'edit-profile') { editingProfile = true; render(); $('#profile-talk').focus(); }
      else if (a === 'cancel-profile') { editingProfile = false; render(); }
      else if (a === 'save-profile') {
        commit(Store.setProfile(state, view.id, { talk: $('#profile-talk').value, hair: $('#profile-hair').value }, now()).state);
        editingProfile = false; render();
      }
      else if (a === 'edit') { editingVisitId = Number(btn.dataset.id); render(); $('#edit-done').focus(); }
      else if (a === 'cancel-edit') { editingVisitId = null; render(); }
      else if (a === 'save-edit') {
        commit(Store.editVisit(state, Number(btn.dataset.id), { done: $('#edit-done').value, next: $('#edit-next').value }, now()).state);
        editingVisitId = null; render();
      }
    } catch (err) { showMsg($('#identity-msg') || $('#edit-msg') || $('#profile-msg'), err.message, 'error'); }
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
    commit(loaded);
    view = { kind: 'today' };
    render();
    e.target.value = '';
  });

  render();
})();
