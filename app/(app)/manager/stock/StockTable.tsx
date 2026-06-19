'use client';

import { useMemo, useState } from 'react';

export interface StockTableRow {
  id: string;
  name: string;
  itemCode: string;
  mainPieces: number;
  secondBoxes: number;
  piecesPerBox: number;
  lowStockThreshold: number;
  mainFridgeQty: number;
}

type StatusFilter = 'all' | 'available' | 'low' | 'out';

function statusOf(r: StockTableRow): { key: Exclude<StatusFilter, 'all'>; label: string; cls: string } {
  if (r.mainFridgeQty <= 0) return { key: 'out', label: 'Out of stock', cls: 'danger' };
  if (r.mainFridgeQty <= r.lowStockThreshold) return { key: 'low', label: 'Low stock', cls: 'warn' };
  return { key: 'available', label: 'Available', cls: 'ok' };
}

export default function StockTable({ rows }: { rows: StockTableRow[] }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const matchesSearch = !q || `${r.name} ${r.itemCode || ''}`.toLowerCase().includes(q);
      const matchesStatus = status === 'all' || statusOf(r).key === status;
      return matchesSearch && matchesStatus;
    });
  }, [rows, search, status]);

  return (
    <article className="card">
      <div className="table-toolbar">
        <label className="pos-search table-search">
          <span aria-hidden="true">🔎</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by kulfi name or item code"
            aria-label="Search stock"
          />
        </label>
        <label className="toolbar-select">
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
            <option value="all">All</option>
            <option value="available">Available</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
          </select>
        </label>
        <span className="result-count">
          {filtered.length} of {rows.length}
        </span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Main Fridge total pcs</th>
              <th>Second Fridge boxes</th>
              <th>Pieces/box</th>
              <th>Low threshold</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const s = statusOf(r);
              return (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{r.mainPieces}</td>
                  <td>{r.secondBoxes}</td>
                  <td>{r.piecesPerBox}</td>
                  <td>{r.lowStockThreshold}</td>
                  <td>
                    <span className={`badge ${s.cls}`}>{s.label}</span>
                  </td>
                </tr>
              );
            })}
            {!filtered.length && (
              <tr>
                <td colSpan={6} className="empty">
                  {rows.length ? 'No items match your search.' : 'No stock available.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}
