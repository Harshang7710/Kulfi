(function () {
  const money = (value) => Number(value || 0).toFixed(2);

  function initPosBilling() {
    const form = document.querySelector('[data-pos-form]');
    if (!form) return;

    const totalInput = form.querySelector('[data-total-amount]');
    const cashInput = form.querySelector('[data-cash-amount]');
    const onlineInput = form.querySelector('[data-online-amount]');
    let lastEdited = 'cash';

    const total = () => Number(totalInput.value || 0);
    const setPayment = (cash, online) => {
      cashInput.value = money(Math.max(0, cash));
      onlineInput.value = money(Math.max(0, online));
    };
    const balanceFromCash = () => setPayment(Number(cashInput.value || 0), total() - Number(cashInput.value || 0));
    const balanceFromOnline = () => setPayment(total() - Number(onlineInput.value || 0), Number(onlineInput.value || 0));

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
    });
    recalc();
  }

  document.addEventListener('DOMContentLoaded', initPosBilling);
}());
