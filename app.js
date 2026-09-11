// 화면 연결. 규칙은 전부 store.js에 있고, 여기서는 그리기와 이벤트만 다룬다.
(() => {
  const KEY = 'haironenest-card:v1';
  let state = Store.deserialize(localStorage.getItem(KEY));
  let view = { kind: 'today' }; // { kind: 'today' } | { kind: 'card', id }
  let editingVisitId = null;
  let editingProfile = false;
  let editingIdentity = false;
  let trashOpen = false;

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
    const todayIds = state.today.date === today() ? state.today.entries.map((e) => e.customerId) : [];
    list.innerHTML = found.map((c) => `
      <li data-id="${c.id}" class="${c.id === activeId ? 'active' : ''}">
        <span>${esc(c.name)} <small>${esc(Store.maskPhone(c.phone))}</small></span>
        ${todayIds.includes(c.id) ? '<small>오늘</small>' : `<button type="button" class="small secondary" data-today="${c.id}">오늘</button>`}
      </li>`).join('');
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
          <div class="when"><input type="text" class="at" inputmode="numeric" data-at="${t.customer.id}" value="${esc(t.at)}" placeholder="--:--" title="예약 시간. 1400처럼 치면 14:00이 됩니다"></div>
          <div class="name">${esc(t.customer.name)} <small style="color:var(--muted);font-weight:normal">${esc(Store.maskPhone(t.customer.phone))}</small></div>
          <div class="sub">${esc([t.customer.profile.hair, t.customer.profile.talk].filter(Boolean).join(' · ')) || '<i>고정 정보 없음</i>'}</div>
          <div class="sub">${t.lastNext ? '지난번 다음 방향: ' + esc(t.lastNext) : '지난 방문 기록 없음'}</div>
          <div class="right">
            <span class="status ${t.recorded ? 'done' : 'todo'}">${t.recorded ? '기록 남김' : '아직 안 적음'}</span>
            <button type="button" class="link small" data-drop="${t.customer.id}">명단에서 빼기</button>
          </div>
        </div>`).join('');
    return `
      <h2 class="card-title">오늘 <small>${today().replace(/-/g, '.')} · ${list.length}명 중 ${done}명 기록 남김</small></h2>
      <div class="add-today">
        <div class="row">
          <input type="text" class="at" id="add-at" inputmode="numeric" placeholder="10:00" autocomplete="off" title="예약 시간. 1400처럼 치면 14:00이 됩니다. 비워도 됩니다">
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
        <div class="meta"><span>${fmt(v.createdAt)}</span><button type="button" class="link" data-action="edit" data-id="${v.id}">고치기</button></div>
        <div class="field"><b>시술 내용과 이유</b><p>${esc(v.done)}</p></div>
        ${v.next ? `<div class="field"><b>다음 방향</b><p>${esc(v.next)}</p></div>` : ''}
        ${history}
      </div>`;
  }

  function render() {
    renderCustomers();
    renderTrash();
    const card = $('#card');
    if (view.kind === 'card' && customerOf(view.id)) card.innerHTML = renderCard(customerOf(view.id));
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
    if (e.target.closest('input, textarea')) return;

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
      else if (a === 'edit') { editingVisitId = Number(btn.dataset.id); render(); $('#edit-done').focus(); }
      else if (a === 'cancel-edit') { editingVisitId = null; render(); }
      else if (a === 'save-edit') {
        commit(Store.editVisit(state, Number(btn.dataset.id), { done: $('#edit-done').value, next: $('#edit-next').value }, now()).state);
        editingVisitId = null; render();
      }
    } catch (err) { showMsg($('#identity-msg') || $('#edit-msg') || $('#profile-msg'), err.message, 'error'); }
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

  $('#card').addEventListener('input', (e) => {
    if (e.target.id === 'add-name') renderAddHits();
  });

  // 시간 → Tab → 이름 → Enter 로 한 명씩 빠르게 올린다
  $('#card').addEventListener('keydown', (e) => {
    if (e.target.id !== 'add-name' || e.key !== 'Enter') return;
    e.preventDefault();
    const first = $('#add-hits button[data-add]') || $('#add-hits button[data-add-new]');
    if (first) first.click();
  });

  // 명단에 올린 뒤 시간을 고치면 줄 순서도 따라 바뀐다
  $('#card').addEventListener('change', (e) => {
    const at = e.target.closest('input[data-at]');
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
    commit(loaded);
    view = { kind: 'today' };
    render();
    e.target.value = '';
  });

  render();
})();
