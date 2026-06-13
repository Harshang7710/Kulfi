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
    let lastEdited = 'cash';
    let activeDraftId = '';

    const total = () => Number(totalInput.value || 0);
    const setPayment = (cash, online) => {
      cashInput.value = money(Math.max(0, cash));
      onlineInput.value = money(Math.max(0, online));
    };
    const balanceFromCash = () => setPayment(Number(cashInput.value || 0), total() - Number(cashInput.value || 0));
    const balanceFromOnline = () => setPayment(total() - Number(onlineInput.value || 0), Number(onlineInput.value || 0));
    const readDrafts = () => {
      try { return JSON.parse(localStorage.getItem(draftKey) || '[]'); } catch { return []; }
    };
    const writeDrafts = (drafts) => localStorage.setItem(draftKey, JSON.stringify(drafts));

    const recalc = () => {
      let billTotal = 0;
      form.querySelectorAll('.item-row').forEach((row) => {
        const qty = Number(row.querySelector('.sale-qty')?.value || 0);
        const price = Number(row.dataset.price || 0);
        const free = row.querySelector('.free-toggle')?.checked;
        const lineTotal = free ? 0 : qty * price;
        row.querySelector('.line-total').textContent = `₹${money(lineTotal)}`;
        billTotal += lineTotal;
      });
      totalInput.value = money(billTotal);
      if (lastEdited === 'online') balanceFromOnline();
      else balanceFromCash();
    };

    const captureDraft = () => ({
      id: activeDraftId || `draft-${Date.now()}`,
      name: form.customerName?.value?.trim() || `Draft ${readDrafts().length + 1}`,
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
      lastEdited = 'cash';
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
      recalc();
      renderDraftSelect();
    };

    form.addEventListener('click', (event) => {
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
      }
      if (mode === 'online') {
        lastEdited = 'online';
        setPayment(0, total());
      }
      if (event.target.closest('[data-draft-save]')) saveDraft();
      if (event.target.closest('[data-draft-new]')) {
        saveDraft();
        activeDraftId = `draft-${Date.now()}`;
        clearBill();
        renderDraftSelect();
      }
      if (event.target.closest('[data-draft-delete]')) {
        writeDrafts(readDrafts().filter((draft) => draft.id !== activeDraftId));
        activeDraftId = '';
        clearBill();
        renderDraftSelect();
      }
    });

    form.addEventListener('input', (event) => {
      if (event.target.matches('.sale-qty')) recalc();
      if (event.target.matches('[data-cash-amount]')) {
        lastEdited = 'cash';
        balanceFromCash();
      }
      if (event.target.matches('[data-online-amount]')) {
        lastEdited = 'online';
        balanceFromOnline();
      }
    });
    form.addEventListener('change', (event) => {
      if (event.target.matches('.free-toggle')) recalc();
      if (event.target.matches('[data-draft-select]')) loadDraft(event.target.value);
    });
    form.addEventListener('submit', (event) => {
      const action = event.submitter?.getAttribute('formaction') || form.getAttribute('action') || '';
      if (action.includes('/manager/transfer')) {
        saveDraft();
        return;
      }
      writeDrafts(readDrafts().filter((draft) => draft.id !== activeDraftId));
    });

    activeDraftId = readDrafts()[0]?.id || `draft-${Date.now()}`;
    if (readDrafts().length) loadDraft(activeDraftId);
    else renderDraftSelect();
    recalc();
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
