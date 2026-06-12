(function () {
  const money = (value) => Number(value || 0).toFixed(2);
  const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const draftKey = 'kulfi-pos-draft-bills-v1';

  function initPosBilling() {
    const form = document.querySelector('[data-pos-form]');
    if (!form) return;

    const totalInput = form.querySelector('[data-total-amount]');
    const cashInput = form.querySelector('[data-cash-amount]');
    const onlineInput = form.querySelector('[data-online-amount]');
    const customerInput = form.querySelector('[data-customer-name]');
    const remarkInput = form.querySelector('[data-remark]');
    const draftTabs = form.querySelector('[data-draft-tabs]');
    const cartItems = form.querySelector('[data-cart-items]');
    const cartTotal = form.querySelector('[data-cart-total]');
    const mobileCount = form.querySelector('[data-mobile-count]');
    const mobileTotal = form.querySelector('[data-mobile-total]');
    let lastEdited = 'cash';
    let activeDraftId = '';
    let drafts = [];

    const total = () => Number(totalInput.value || 0);
    const setPayment = (cash, online) => {
      cashInput.value = money(Math.max(0, cash));
      onlineInput.value = money(Math.max(0, online));
    };
    const balanceFromCash = () => setPayment(Number(cashInput.value || 0), total() - Number(cashInput.value || 0));
    const balanceFromOnline = () => setPayment(total() - Number(onlineInput.value || 0), Number(onlineInput.value || 0));

    const emptyDraft = () => ({
      id: `draft-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      label: `Bill ${drafts.length + 1}`,
      customerName: '',
      remark: '',
      cashAmount: '0.00',
      onlineAmount: '0.00',
      lastEdited: 'cash',
      items: {}
    });

    const loadDrafts = () => {
      try {
        drafts = JSON.parse(localStorage.getItem(draftKey) || '[]');
      } catch {
        drafts = [];
      }
      if (!drafts.length) drafts = [emptyDraft()];
      activeDraftId = drafts[0].id;
    };

    const saveDrafts = () => localStorage.setItem(draftKey, JSON.stringify(drafts));
    const activeDraft = () => drafts.find((draft) => draft.id === activeDraftId) || drafts[0];

    const captureDraft = () => {
      const draft = activeDraft();
      if (!draft) return;
      draft.customerName = customerInput?.value || '';
      draft.remark = remarkInput?.value || '';
      draft.cashAmount = cashInput.value || '0.00';
      draft.onlineAmount = onlineInput.value || '0.00';
      draft.lastEdited = lastEdited;
      draft.items = {};
      form.querySelectorAll('.pos-product-card').forEach((row) => {
        const qtyInput = row.querySelector('.sale-qty');
        if (!qtyInput?.name) return;
        draft.items[qtyInput.name] = {
          qty: qtyInput.value || '0',
          free: Boolean(row.querySelector('.free-toggle')?.checked)
        };
      });
      draft.label = draft.customerName || draft.label || `Bill ${drafts.indexOf(draft) + 1}`;
      saveDrafts();
      renderDraftTabs();
    };

    const applyDraft = (draft) => {
      if (!draft) return;
      customerInput.value = draft.customerName || '';
      remarkInput.value = draft.remark || '';
      cashInput.value = draft.cashAmount || '0.00';
      onlineInput.value = draft.onlineAmount || '0.00';
      lastEdited = draft.lastEdited || 'cash';
      form.querySelectorAll('.pos-product-card').forEach((row) => {
        const qtyInput = row.querySelector('.sale-qty');
        const freeInput = row.querySelector('.free-toggle');
        const saved = draft.items?.[qtyInput?.name] || { qty: '0', free: false };
        if (qtyInput) qtyInput.value = saved.qty || '0';
        if (freeInput) freeInput.checked = Boolean(saved.free);
      });
      recalc(false);
      renderDraftTabs();
    };

    function renderDraftTabs() {
      if (!draftTabs) return;
      draftTabs.innerHTML = drafts.map((draft, index) => {
        const active = draft.id === activeDraftId ? ' active' : '';
        const label = draft.customerName || draft.label || `Bill ${index + 1}`;
        return `<button class="draft-tab${active}" type="button" data-draft-id="${draft.id}"><span>${label}</span></button>`;
      }).join('');
    }

    function renderCart(lines, billTotal) {
      if (cartTotal) cartTotal.textContent = money(billTotal);
      if (mobileTotal) mobileTotal.textContent = `₹${money(billTotal)}`;
      const itemCount = lines.reduce((sum, line) => sum + line.qty, 0);
      if (mobileCount) mobileCount.innerHTML = `${itemCount} item${itemCount === 1 ? '' : 's'}<br><small>Total</small>`;
      if (!cartItems) return;
      if (!lines.length) {
        cartItems.innerHTML = '<p class="empty">No items added.</p>';
        return;
      }
      cartItems.innerHTML = lines.map((line) => `<div class="cart-line"><span class="pos-product-img placeholder">${line.image ? `<img src="${escapeHtml(line.image)}" alt="">` : '🍦'}</span><div><strong>${escapeHtml(line.name)}</strong><small>${line.free ? 'Free item' : `₹${money(line.price)} × ${line.qty}`}</small></div><strong>₹${money(line.lineTotal)}</strong></div>`).join('');
    }

    function recalc(shouldCapture = true) {
      let billTotal = 0;
      const lines = [];
      form.querySelectorAll('.pos-product-card').forEach((row) => {
        const qty = Number(row.querySelector('.sale-qty')?.value || 0);
        const price = Number(row.dataset.price || 0);
        const free = row.querySelector('.free-toggle')?.checked;
        const lineTotal = free ? 0 : qty * price;
        row.querySelector('.line-total').textContent = `₹${money(lineTotal)}`;
        row.classList.toggle('selected', qty > 0);
        if (qty > 0) {
          lines.push({
            qty,
            price,
            free,
            lineTotal,
            name: row.dataset.itemTitle || 'Kulfi item',
            image: row.dataset.itemImage || ''
          });
        }
        billTotal += lineTotal;
      });
      renderCart(lines, billTotal);
      totalInput.value = money(billTotal);
      if (lastEdited === 'online') balanceFromOnline();
      else balanceFromCash();
      if (shouldCapture) captureDraft();
    }

    form.addEventListener('click', (event) => {
      const draftTab = event.target.closest('[data-draft-id]');
      if (draftTab) {
        captureDraft();
        activeDraftId = draftTab.dataset.draftId;
        applyDraft(activeDraft());
        return;
      }
      if (event.target.closest('[data-new-draft]')) {
        captureDraft();
        const draft = emptyDraft();
        drafts.push(draft);
        activeDraftId = draft.id;
        applyDraft(draft);
        saveDrafts();
        return;
      }
      const stepper = event.target.closest('[data-qty-step]');
      if (stepper) {
        const input = stepper.parentElement.querySelector('.sale-qty');
        const next = Number(input.value || 0) + Number(stepper.dataset.qtyStep || 0);
        const min = Number(input.min || 0);
        const max = Number(input.max || next);
        input.value = Math.min(max, Math.max(min, next));
        recalc();
      }
      const mode = event.target.closest('[data-pay-mode]')?.dataset.payMode;
      if (mode === 'cash') {
        lastEdited = 'cash';
        setPayment(total(), 0);
        captureDraft();
      }
      if (mode === 'online') {
        lastEdited = 'online';
        setPayment(0, total());
        captureDraft();
      }
    });

    form.addEventListener('input', (event) => {
      if (event.target.matches('.sale-qty')) recalc();
      if (event.target.matches('[data-cash-amount]')) {
        lastEdited = 'cash';
        balanceFromCash();
        captureDraft();
      }
      if (event.target.matches('[data-online-amount]')) {
        lastEdited = 'online';
        balanceFromOnline();
        captureDraft();
      }
      if (event.target.matches('[data-customer-name], [data-remark]')) captureDraft();
    });
    form.addEventListener('input', (event) => {
      if (!event.target.matches('[data-pos-search]')) return;
      const term = event.target.value.trim().toLowerCase();
      form.querySelectorAll('[data-pos-search]').forEach((input) => {
        if (input !== event.target) input.value = event.target.value;
      });
      form.querySelectorAll('.pos-product-card').forEach((row) => {
        row.hidden = term && !String(row.dataset.itemName || '').includes(term);
      });
    });

    form.addEventListener('change', (event) => {
      if (event.target.matches('.free-toggle')) recalc();
    });
    form.addEventListener('submit', () => {
      drafts = drafts.filter((draft) => draft.id !== activeDraftId);
      saveDrafts();
    });

    loadDrafts();
    applyDraft(activeDraft());
  }

  document.addEventListener('DOMContentLoaded', initPosBilling);
}());
