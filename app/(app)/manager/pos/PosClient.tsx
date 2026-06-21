'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { money } from '@/lib/format';
import type { ItemRow } from '@/lib/types';
import { submitSaleAction } from './actions';

type Cart = Record<string, { qty: number; free: boolean }>;

interface PosDraft {
  id: string;
  name: string;
  updatedAt: string;
  lastEdited: 'cash' | 'online';
  cart: Cart;
  customerName: string;
  remark: string;
  cashAmount: string;
  onlineAmount: string;
}

interface CartLine {
  itemId: string;
  item: ItemRow;
  qty: number;
  free: boolean;
  lineTotal: number;
}

const DRAFT_KEY = 'kulfi-pos-drafts-v1';
const DRAFT_SLOTS = [1, 2, 3, 4, 5];

function readDrafts(): PosDraft[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem(DRAFT_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function writeDrafts(drafts: PosDraft[]) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts));
}

export default function PosClient({ items }: { items: ItemRow[] }) {
  const router = useRouter();

  const [cart, setCart] = useState<Cart>({});
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'in' | 'low'>('all');
  const [customerName, setCustomerName] = useState('');
  const [remark, setRemark] = useState('');
  const [cashAmount, setCashAmount] = useState('0.00');
  const [onlineAmount, setOnlineAmount] = useState('0.00');
  const [lastEdited, setLastEdited] = useState<'cash' | 'online'>('cash');
  const [activeDraftSlot, setActiveDraftSlot] = useState(1);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const lines = useMemo<CartLine[]>(() => {
    const result: CartLine[] = [];
    for (const [itemId, entry] of Object.entries(cart)) {
      const item = itemById.get(itemId);
      if (!item || entry.qty <= 0) continue;
      result.push({ itemId, item, qty: entry.qty, free: entry.free, lineTotal: entry.free ? 0 : entry.qty * item.mrp });
    }
    return result;
  }, [cart, itemById]);

  const billTotal = useMemo(() => lines.reduce((acc, line) => acc + line.lineTotal, 0), [lines]);
  const totalPieces = useMemo(() => lines.reduce((acc, line) => acc + line.qty, 0), [lines]);

  useEffect(() => {
    if (lastEdited === 'online') {
      setCashAmount(money(Math.max(0, billTotal - Number(onlineAmount || 0))));
    } else {
      setOnlineAmount(money(Math.max(0, billTotal - Number(cashAmount || 0))));
    }
    // Re-balance the other payment field only when the bill total changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billTotal]);

  useEffect(() => {
    const draft = readDrafts().find((d) => d.id === 'draft-slot-1');
    if (draft) applyDraft(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyDraft(draft: PosDraft) {
    setCart(draft.cart);
    setCustomerName(draft.customerName);
    setRemark(draft.remark);
    setCashAmount(draft.cashAmount);
    setOnlineAmount(draft.onlineAmount);
    setLastEdited(draft.lastEdited);
    setActiveDraftSlot(Number(draft.id.replace('draft-slot-', '')) || 1);
  }

  function clearBill() {
    setCart({});
    setCustomerName('');
    setRemark('');
    setCashAmount('0.00');
    setOnlineAmount('0.00');
    setLastEdited('cash');
  }

  function captureDraft(slot: number): PosDraft {
    return {
      id: `draft-slot-${slot}`,
      name: customerName.trim() || `Draft ${slot}`,
      updatedAt: new Date().toISOString(),
      lastEdited,
      cart,
      customerName,
      remark,
      cashAmount,
      onlineAmount
    };
  }

  function handleDraftSlotClick(slot: number) {
    if (slot === activeDraftSlot) return;
    const current = captureDraft(activeDraftSlot);
    const drafts = readDrafts().filter((d) => d.id !== current.id);
    drafts.unshift(current);
    writeDrafts(drafts.slice(0, 12));

    const existing = drafts.find((d) => d.id === `draft-slot-${slot}`);
    setActiveDraftSlot(slot);
    if (existing) applyDraft(existing);
    else clearBill();
  }

  function handleDraftClear() {
    writeDrafts(readDrafts().filter((d) => d.id !== `draft-slot-${activeDraftSlot}`));
    clearBill();
  }

  function step(itemId: string, delta: number) {
    const item = itemById.get(itemId);
    if (!item) return;
    setCart((prev) => {
      const current = prev[itemId]?.qty ?? 0;
      const next = Math.min(item.mainFridgeQty, Math.max(0, current + delta));
      if (next === 0) {
        if (!(itemId in prev)) return prev;
        const rest = { ...prev };
        delete rest[itemId];
        return rest;
      }
      return { ...prev, [itemId]: { qty: next, free: prev[itemId]?.free ?? false } };
    });
  }

  function toggleFree(itemId: string, free: boolean) {
    setCart((prev) => {
      if (!prev[itemId]) return prev;
      return { ...prev, [itemId]: { ...prev[itemId], free } };
    });
  }

  function handleCashChange(raw: string) {
    setLastEdited('cash');
    setCashAmount(raw);
    setOnlineAmount(money(Math.max(0, billTotal - Number(raw || 0))));
  }

  function handleOnlineChange(raw: string) {
    setLastEdited('online');
    setOnlineAmount(raw);
    setCashAmount(money(Math.max(0, billTotal - Number(raw || 0))));
  }

  function setAllCash() {
    setLastEdited('cash');
    setCashAmount(money(billTotal));
    setOnlineAmount(money(0));
  }

  function setAllOnline() {
    setLastEdited('online');
    setCashAmount(money(0));
    setOnlineAmount(money(billTotal));
  }

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      const haystack = `${item.name} ${item.itemCode || ''}`.toLowerCase();
      const matchesSearch = !query || haystack.includes(query);
      const status = item.mainFridgeQty > 0 ? 'in' : 'low';
      const matchesStock = stockFilter === 'all' || status === stockFilter;
      return matchesSearch && matchesStock;
    });
  }, [items, search, stockFilter]);

  async function handleSubmit() {
    setSubmitting(true);
    setNotice(null);
    const result = await submitSaleAction({
      lines: lines.map((line) => ({ itemId: line.itemId, qty: line.qty, free: line.free })),
      cashAmount: Number(cashAmount || 0),
      onlineAmount: Number(onlineAmount || 0),
      customerName,
      remark
    });
    setSubmitting(false);
    if (result.ok) {
      writeDrafts(readDrafts().filter((d) => d.id !== `draft-slot-${activeDraftSlot}`));
      clearBill();
      setNotice({ type: 'success', message: `Bill saved successfully (Bill #${result.billNumber})` });
      router.refresh();
    } else {
      setNotice({ type: 'error', message: result.error });
    }
  }

  return (
    <div className="zepto-pos pos-billing">
      {notice && (
        <div className={`notice ${notice.type}`} role="alert">
          <span>{notice.message}</span>
          <button type="button" className="notice-close" aria-label="Dismiss notification" onClick={() => setNotice(null)}>
            &times;
          </button>
        </div>
      )}
      <header className="pos-storefront">
        <label className="pos-search">
          <span aria-hidden="true">🔎</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by kulfi name or item code"
            aria-label="Search products by name or item code"
          />
        </label>
        <div className="filter-panel">
          <label>
            Stock view
            <select value={stockFilter} onChange={(e) => setStockFilter(e.target.value as 'all' | 'in' | 'low')}>
              <option value="all">All active items</option>
              <option value="in">Main Fridge available</option>
              <option value="low">Refill needed</option>
            </select>
          </label>
          <button
            className="btn secondary"
            type="button"
            onClick={() => {
              setSearch('');
              setStockFilter('all');
            }}
          >
            Reset
          </button>
        </div>
      </header>
      <section className="pos-market">
        <main className="market-body">
          <div className="product-board">
            {filteredItems.map((item) => {
              const entry = cart[item.id];
              const qty = entry?.qty ?? 0;
              return (
                <article
                  key={item.id}
                  className={`product-card ${item.mainFridgeQty <= item.lowStockThreshold ? 'low' : ''} ${qty > 0 ? 'selected' : ''}`}
                >
                  <div className="product-media">
                    {item.imageData ? (
                      <img className="item-thumb" src={item.imageData} alt={`${item.name} image`} />
                    ) : (
                      <span className="product-emoji" aria-hidden="true">
                        🍦
                      </span>
                    )}
                    <div className="product-cta">
                      {qty === 0 ? (
                        <button
                          className="add-btn"
                          type="button"
                          onClick={() => step(item.id, 1)}
                          aria-label={`Add ${item.name}`}
                        >
                          ADD
                        </button>
                      ) : (
                        <span className="zepto-counter" aria-label={`${item.name} quantity`}>
                          <button type="button" onClick={() => step(item.id, -1)} aria-label={`Decrease ${item.name} quantity`}>
                            −
                          </button>
                          <span>{qty}</span>
                          <button type="button" onClick={() => step(item.id, 1)} aria-label={`Increase ${item.name} quantity`}>
                            +
                          </button>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="product-info">
                    <h3>{item.name}</h3>
                    <div className="price-line">
                      <strong className="price-pill">₹{money(item.mrp)}</strong>
                      <span className="stock-line">{item.mainFridgeQty} pcs</span>
                    </div>
                    <label className="inline-check free-toggle">
                      <input
                        type="checkbox"
                        checked={entry?.free ?? false}
                        onChange={(e) => toggleFree(item.id, e.target.checked)}
                      />{' '}
                      Complimentary
                    </label>
                  </div>
                </article>
              );
            })}
            {!filteredItems.length && <p className="empty">No active items are available.</p>}
          </div>
        </main>
        <aside className="pos-cart">
          <header className="cart-head">
            <h2>Cart</h2>
            <span className="cart-count">{totalPieces} items</span>
          </header>
          <div className="cart-preview">
            {lines.length ? (
              lines.map((line) => (
                <div className="cart-line" key={line.itemId}>
                  {line.item.imageData ? (
                    <img src={line.item.imageData} alt="" />
                  ) : (
                    <span className="cart-emoji">🍦</span>
                  )}
                  <span>
                    {line.item.name}
                    <small>
                      {line.qty} {line.free ? 'free' : `× ₹${money(line.item.mrp)}`}
                    </small>
                  </span>
                  <strong>₹{money(line.lineTotal)}</strong>
                </div>
              ))
            ) : (
              <p className="empty">No items added yet.</p>
            )}
          </div>
          <div className="cart-total-row">
            <strong>Total</strong>
            <strong>₹{money(billTotal)}</strong>
          </div>
          <label>
            Customer Name
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Customer name" />
          </label>
          <div className="payment-split">
            <label>
              Cash
              <input type="number" min={0} step={0.01} value={cashAmount} onChange={(e) => handleCashChange(e.target.value)} />
            </label>
            <label>
              Online
              <input type="number" min={0} step={0.01} value={onlineAmount} onChange={(e) => handleOnlineChange(e.target.value)} />
            </label>
          </div>
          <div className="payment-actions">
            <button className="btn secondary" type="button" onClick={setAllCash}>
              All Cash
            </button>
            <button className="btn secondary" type="button" onClick={setAllOnline}>
              All Online
            </button>
          </div>
          <label>
            Remarks
            <textarea rows={3} value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Global bill remarks" />
          </label>
          <button className="btn primary save-bill" type="button" onClick={handleSubmit} disabled={submitting} aria-busy={submitting}>
            {submitting && <span className="btn-spinner" aria-hidden="true" />}
            {submitting ? 'Saving…' : `Save Bill · ₹${money(billTotal)}`}
          </button>
        </aside>
      </section>
      <div className={`draft-dock ${draftsOpen ? 'open' : ''}`}>
        {draftsOpen && (
          <div className="draft-panel" role="dialog" aria-label="Draft bills">
            <div className="draft-panel-head">
              <span className="draft-label">Draft bills</span>
              <button type="button" className="draft-close" onClick={() => setDraftsOpen(false)} aria-label="Close draft bills">
                ×
              </button>
            </div>
            <div className="draft-tabs">
              {DRAFT_SLOTS.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  className={`bill-tab ${slot === activeDraftSlot ? 'active' : ''}`}
                  onClick={() => handleDraftSlotClick(slot)}
                >
                  Bill {slot}
                </button>
              ))}
            </div>
            <button type="button" className="draft-clear" onClick={handleDraftClear} aria-label="Clear current draft bill">
              Clear active draft
            </button>
          </div>
        )}
        <button
          type="button"
          className="draft-fab"
          onClick={() => setDraftsOpen((open) => !open)}
          aria-expanded={draftsOpen}
          aria-label="Open draft bills"
        >
          Draft {activeDraftSlot}
        </button>
      </div>
    </div>
  );
}
