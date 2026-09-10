// 화면 연결. 규칙은 전부 store.js에 있고, 여기서는 그리기와 이벤트만 다룬다.
(() => {
  const KEY = 'haironenest-card:v1';
  let state = Store.deserialize(localStorage.getItem(KEY));
  let selectedId = null;
  let editingMemoId = null;

  const $ = (sel) => document.querySelector(sel);
  const now = () => new Date().toISOString();
  const fmt = (iso) => {
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function commit(next) {
    state = next;
    localStorage.setItem(KEY, Store.serialize(state));
  }

  function showMsg(el, text, kind) {
    el.textContent = text;
    el.className = `msg ${kind}`;
  }

  function renderCustomers() {
    const list = $('#customer-list');
    const found = Store.findCustomers(state, $('#search').value);
    if (found.length === 0) {
      list.innerHTML = `<li class="empty">${state.customers.length === 0 ? '아직 고객이 없습니다.' : '찾는 고객이 없습니다.'}</li>`;
      return;
    }
    list.innerHTML = found
      .map((c) => `<li data-id="${c.id}" class="${c.id === selectedId ? 'active' : ''}"><span>${esc(c.name)}</span><small>${esc(c.last4)}</small></li>`)
      .join('');
  }

  function renderCard() {
    const card = $('#card');
    const customer = state.customers.find((c) => c.id === selectedId);
    if (!customer) {
      card.innerHTML = '<div class="empty">왼쪽에서 고객을 고르거나 새 고객을 만드세요.</div>';
      return;
    }
    const memos = Store.memosOf(state, customer.id);
    card.innerHTML = `
      <h2 class="card-title">${esc(customer.name)}</h2>
      <p class="card-sub">${customer.last4 ? '뒤 4자리 ' + esc(customer.last4) + ' · ' : ''}지난 상담 ${memos.length}건</p>
      <form id="memo-form">
        <textarea id="memo-text" placeholder="오늘 상담 — 시술 내용, 고객이 한 말, 다음 방향을 편하게 적으세요"></textarea>
        <div class="row" style="margin-top:8px"><div class="msg" id="memo-msg"></div><button type="submit">저장</button></div>
      </form>
      <h3>지난 상담</h3>
      ${memos.length === 0 ? '<div class="empty">아직 기록이 없습니다.</div>' : memos.map(renderMemo).join('')}
    `;
    $('#memo-text').focus();
  }

  function renderMemo(m) {
    if (m.id === editingMemoId) {
      return `
        <div class="memo" data-memo="${m.id}">
          <div class="meta"><span>${fmt(m.createdAt)}</span><span>고치는 중</span></div>
          <textarea id="edit-text">${esc(m.text)}</textarea>
          <div class="row" style="margin-top:8px">
            <div class="msg" id="edit-msg"></div>
            <button type="button" class="secondary" data-action="cancel-edit">취소</button>
            <button type="button" data-action="save-edit" data-id="${m.id}">고친 내용 저장</button>
          </div>
        </div>`;
    }
    const history = m.history.length === 0 ? '' : `
      <details><summary>고치기 전 내용 ${m.history.length}건</summary>
        <div class="history">${[...m.history].reverse().map((h) => `<p><small>${fmt(h.replacedAt)}까지</small><br>${esc(h.text)}</p>`).join('')}</div>
      </details>`;
    return `
      <div class="memo" data-memo="${m.id}">
        <div class="meta"><span>${fmt(m.createdAt)}</span><button type="button" class="link" data-action="edit" data-id="${m.id}">고치기</button></div>
        <p class="text">${esc(m.text)}</p>
        ${history}
      </div>`;
  }

  function render() {
    renderCustomers();
    renderCard();
  }

  // 검색
  $('#search').addEventListener('input', renderCustomers);

  // 고객 선택
  $('#customer-list').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    selectedId = Number(li.dataset.id);
    editingMemoId = null;
    render();
  });

  // 새 고객
  $('#new-customer-form').addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      const { state: next, customer } = Store.addCustomer(state, { name: $('#new-name').value, last4: $('#new-last4').value });
      commit(next);
      selectedId = customer.id;
      editingMemoId = null;
      $('#new-name').value = '';
      $('#new-last4').value = '';
      $('#search').value = '';
      showMsg($('#new-msg'), `${customer.name} 카드를 만들었습니다`, 'ok');
      render();
    } catch (err) {
      showMsg($('#new-msg'), err.message, 'error');
    }
  });

  // 카드 안 동작: 메모 저장 / 고치기 / 고친 내용 저장 / 취소
  $('#card').addEventListener('submit', (e) => {
    if (e.target.id !== 'memo-form') return;
    e.preventDefault();
    try {
      const { state: next } = Store.addMemo(state, selectedId, $('#memo-text').value, now());
      commit(next);
      render();
      showMsg($('#memo-msg'), '저장했습니다', 'ok');
    } catch (err) {
      showMsg($('#memo-msg'), err.message, 'error');
    }
  });

  $('#card').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'edit') {
      editingMemoId = Number(btn.dataset.id);
      renderCard();
      $('#edit-text').focus();
    } else if (action === 'cancel-edit') {
      editingMemoId = null;
      renderCard();
    } else if (action === 'save-edit') {
      try {
        const { state: next } = Store.editMemo(state, Number(btn.dataset.id), $('#edit-text').value, now());
        commit(next);
        editingMemoId = null;
        renderCard();
      } catch (err) {
        showMsg($('#edit-msg'), err.message, 'error');
      }
    }
  });

  render();
})();
