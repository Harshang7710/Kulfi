(function () {
  const money = (value) => Number(value || 0).toFixed(2);
  const draftKey = 'kulfi-pos-drafts-v1';

  function initPosBilling() {
    const form = document.querySelector('[data-pos-form]');
    if (!form) return;

    const totalInput = form.querySelector('[data-total-amount]');
    const cashInput = form.querySelector('[data-cash-amount]');
    const onlineInput = form.querySelector('[data-online-amount]');
    const draftSelect = form.querySelector('[data-draft-select]');
    const cartPreview = form.querySelector('[data-cart-preview]');
    const cartTotal = form.querySelector('[data-cart-total]');
    const paymentMethodInput = form.querySelector('[data-payment-method]');
    let lastEdited = '';
    let activeDraftId = '';

    const total = () => Number(totalInput.value || 0);
    const setPayment = (cash, online) => {
      cashInput.value = money(Math.max(0, cash));
      onlineInput.value = money(Math.max(0, online));
    };
    const markPaymentMode = (mode) => {
      if (paymentMethodInput) paymentMethodInput.value = mode || '';
      form.querySelectorAll('[data-pay-mode]').forEach((button) => {
        button.classList.toggle('active', button.dataset.payMode === mode);
      });
    };
    const readDrafts = () => {
      try { return JSON.parse(localStorage.getItem(draftKey) || '[]'); } catch { return []; }
    };
    const writeDrafts = (drafts) => localStorage.setItem(draftKey, JSON.stringify(drafts));

    const selectedLines = () => Array.from(form.querySelectorAll('.item-row')).map((row) => {
      const qty = Number(row.querySelector('.sale-qty')?.value || 0);
      const price = Number(row.dataset.price || 0);
      const free = row.querySelector('.free-toggle')?.checked;
      const name = row.querySelector('h3')?.textContent?.trim() || 'Item';
      const image = row.querySelector('.product-media img')?.getAttribute('src') || '';
      const lineTotal = free ? 0 : qty * price;
      return { row, qty, price, free, name, image, lineTotal };
    }).filter((line) => line.qty > 0);

    const renderCartPreview = (lines, billTotal) => {
      if (cartPreview) {
        cartPreview.innerHTML = lines.length ? lines.map((line) => `<div class="cart-line">${line.image ? `<img src="${line.image}" alt="">` : '<span class="cart-emoji">🍦</span>'}<span>${line.name}<small>${line.qty} ${line.free ? 'free' : `× ₹${money(line.price)}`}</small></span><strong>₹${money(line.lineTotal)}</strong></div>`).join('') : '<p class="empty">No items added yet.</p>';
      }
      if (cartTotal) cartTotal.textContent = `₹${money(billTotal)}`;
    };

    const recalc = () => {
      let billTotal = 0;
      const lines = selectedLines();
      form.querySelectorAll('.item-row').forEach((row) => {
        const qty = Number(row.querySelector('.sale-qty')?.value || 0);
        const price = Number(row.dataset.price || 0);
        const free = row.querySelector('.free-toggle')?.checked;
        const lineTotal = free ? 0 : qty * price;
        row.classList.toggle('selected', qty > 0);
        const display = row.querySelector('[data-qty-display]');
        if (display) display.textContent = String(qty);
        const line = row.querySelector('.line-total');
        if (line) line.textContent = `₹${money(lineTotal)}`;
        billTotal += lineTotal;
      });
      totalInput.value = money(billTotal);
      renderCartPreview(lines, billTotal);
    };

    const captureDraft = () => ({
      id: activeDraftId || `draft-${Date.now()}`,
      name: `Draft ${readDrafts().length + 1}`,
      updatedAt: new Date().toISOString(),
      lastEdited,
      fields: Array.from(form.elements).reduce((acc, el) => {
        if (!el.name || el.name.startsWith('transfer_') || el.name === 'itemId') return acc;
        acc[el.name] = el.type === 'checkbox' ? el.checked : el.value;
        return acc;
      }, {})
    });

    const renderDraftSelect = () => {
      const drafts = readDrafts();
      if (!draftSelect) return;
      draftSelect.innerHTML = drafts.map((draft) => `<option value="${draft.id}">${draft.name} · ${new Date(draft.updatedAt).toLocaleTimeString()}</option>`).join('');
      draftSelect.value = activeDraftId;
    };

    const saveDraft = () => {
      const draft = captureDraft();
      activeDraftId = draft.id;
      const drafts = readDrafts().filter((existing) => existing.id !== draft.id);
      drafts.unshift(draft);
      writeDrafts(drafts.slice(0, 12));
      renderDraftSelect();
    };

    const clearBill = () => {
      form.querySelectorAll('input, textarea').forEach((el) => {
        if (el.name?.startsWith('transfer_')) return;
        if (el.type === 'checkbox') el.checked = false;
        else if (!el.readOnly) el.value = el.matches('[data-cash-amount],[data-online-amount],.sale-qty') ? '0' : '';
      });
      lastEdited = '';
      markPaymentMode('');
      recalc();
    };

    const loadDraft = (draftId) => {
      const draft = readDrafts().find((row) => row.id === draftId);
      if (!draft) return;
      activeDraftId = draft.id;
      lastEdited = draft.lastEdited || 'cash';
      clearBill();
      Object.entries(draft.fields || {}).forEach(([name, value]) => {
        const el = form.elements[name];
        if (!el) return;
        if (el.type === 'checkbox') el.checked = Boolean(value);
        else el.value = value;
      });
      markPaymentMode(paymentMethodInput?.value || lastEdited || '');
      recalc();
      renderDraftSelect();
    };

    form.addEventListener('click', (event) => {
      const stepper = event.target.closest('[data-qty-step]');
      if (stepper) {
        const input = stepper.closest('.item-row')?.querySelector('.sale-qty');
        if (!input) return;
        const next = Number(input.value || 0) + Number(stepper.dataset.qtyStep || 0);
        const min = Number(input.min || 0);
        const max = Number(input.max || next);
        input.value = Math.min(max, Math.max(min, next));
        recalc();
      }
      const mode = event.target.closest('[data-pay-mode]')?.dataset.payMode;
      if (mode === 'cash') {
        lastEdited = 'cash';
        markPaymentMode('cash');
        setPayment(total(), 0);
      }
      if (mode === 'online') {
        lastEdited = 'online';
        markPaymentMode('online');
        setPayment(0, total());
      }
      if (event.target.closest('[data-draft-delete]')) {
        const activeSlot = form.querySelector('[data-draft-slot].active')?.dataset.draftSlot || '1';
        activeDraftId = `draft-slot-${activeSlot}`;
        writeDrafts(readDrafts().filter((draft) => draft.id !== activeDraftId));
        clearBill();
        renderDraftSelect();
      }
      const slot = event.target.closest('[data-draft-slot]');
      if (slot) {
        saveDraft();
        const slotId = `draft-slot-${slot.dataset.draftSlot}`;
        const existing = readDrafts().find((draft) => draft.id === slotId);
        form.querySelectorAll('[data-draft-slot]').forEach((button) => button.classList.toggle('active', button === slot));
        activeDraftId = slotId;
        if (existing) loadDraft(slotId);
        else clearBill();
      }
    });

    form.addEventListener('input', (event) => {
      if (event.target.matches('.sale-qty')) recalc();
      if (event.target.matches('[data-cash-amount]')) {
        lastEdited = 'cash';
        markPaymentMode('cash');
      }
      if (event.target.matches('[data-online-amount]')) {
        lastEdited = 'online';
        markPaymentMode('online');
      }
    });
    form.addEventListener('change', (event) => {
      if (event.target.matches('.free-toggle')) recalc();
      if (event.target.matches('[data-payment-method]')) markPaymentMode(event.target.value);
      if (event.target.matches('[data-draft-select]')) loadDraft(event.target.value);
    });

    const applyProductFilters = () => {
      const query = (form.querySelector('[data-product-search]')?.value || '').trim().toLowerCase();
      const stock = form.querySelector('[data-stock-filter]')?.value || 'all';
      form.querySelectorAll('.item-row').forEach((row) => {
        const matchesSearch = !query || (row.dataset.productName || '').includes(query);
        const matchesStock = stock === 'all' || row.dataset.stockStatus === stock;
        row.hidden = !(matchesSearch && matchesStock);
      });
    };
    form.addEventListener('input', (event) => { if (event.target.matches('[data-product-search]')) applyProductFilters(); });
    form.addEventListener('change', (event) => { if (event.target.matches('[data-stock-filter]')) applyProductFilters(); });
    form.querySelector('[data-product-reset]')?.addEventListener('click', () => {
      const search = form.querySelector('[data-product-search]');
      const stock = form.querySelector('[data-stock-filter]');
      if (search) search.value = '';
      if (stock) stock.value = 'all';
      applyProductFilters();
    });

    form.addEventListener('submit', (event) => {
      if (!paymentMethodInput?.value) {
        event.preventDefault();
        alert('Please select Cash or Online before saving the bill.');
        return;
      }
      writeDrafts(readDrafts().filter((draft) => draft.id !== activeDraftId));
    });

    activeDraftId = 'draft-slot-1';
    if (readDrafts().some((draft) => draft.id === activeDraftId)) loadDraft(activeDraftId);
    else renderDraftSelect();
    markPaymentMode(paymentMethodInput?.value || '');
    recalc();
    applyProductFilters();
  }

  function initImageUploads() {
    document.querySelectorAll('[data-image-upload-form]').forEach((form) => {
      const input = form.querySelector('[data-image-upload]');
      const hidden = form.querySelector('[data-image-data]');
      if (!input || !hidden) return;
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (!file) {
          hidden.value = '';
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const image = new Image();
          image.onload = () => {
            const canvas = document.createElement('canvas');
            const maxSide = 320;
            const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
            canvas.width = Math.max(1, Math.round(image.width * scale));
            canvas.height = Math.max(1, Math.round(image.height * scale));
            canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
            hidden.value = canvas.toDataURL('image/webp', 0.78);
          };
          image.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initPosBilling();
    initImageUploads();
  });
}());
