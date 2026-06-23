'use client';

import { useMemo, useState } from 'react';
import { money } from '@/lib/format';
import type { ReportRow } from '@/lib/types';

type SalesReportRow = Omit<ReportRow, 'createdAt'> & { createdAt: string };

interface BillGroup {
  billNumber: string;
  rows: SalesReportRow[];
  createdAt: string;
  managerName: string;
  type: string;
  remark: string;
  cashAmount: number;
  onlineAmount: number;
  totalQty: number;
  totalPrice: number;
}

function groupRowsByBill(rows: SalesReportRow[]): BillGroup[] {
  const billMap = new Map<string, BillGroup>();

  rows.forEach((row) => {
    const key = row.billNumber;
    const existing = billMap.get(key);

    if (existing) {
      existing.rows.push(row);
      existing.totalQty += Number(row.quantity || 0);
      existing.totalPrice += Number(row.lineTotal || 0);
      return;
    }

    billMap.set(key, {
      billNumber: row.billNumber,
      rows: [row],
      createdAt: row.createdAt,
      managerName: row.managerName,
      type: row.type,
      remark: row.remark || '',
      cashAmount: Number(row.cashAmount || 0),
      onlineAmount: Number(row.onlineAmount || 0),
      totalQty: Number(row.quantity || 0),
      totalPrice: Number(row.lineTotal || 0)
    });
  });

  return [...billMap.values()];
}

type TypeFilter = 'all' | 'sale' | 'return';

export default function SalesReportTable({ rows }: { rows: SalesReportRow[] }) {
  const allBillGroups = useMemo(() => groupRowsByBill(rows), [rows]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [expandedBills, setExpandedBills] = useState<Set<string>>(new Set());

  const billGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allBillGroups.filter((bill) => {
      const matchesType = typeFilter === 'all' || bill.type === typeFilter;
      const matchesSearch =
        !q ||
        `${bill.billNumber} ${bill.managerName}`.toLowerCase().includes(q) ||
        bill.rows.some((r) => r.itemName.toLowerCase().includes(q));
      return matchesType && matchesSearch;
    });
  }, [allBillGroups, search, typeFilter]);

  const toggleBill = (billNumber: string) => {
    setExpandedBills((current) => {
      const next = new Set(current);
      if (next.has(billNumber)) {
        next.delete(billNumber);
      } else {
        next.add(billNumber);
      }
      return next;
    });
  };

  return (
    <div className="table-wrap sales-report-wrap">
      <div className="table-toolbar">
        <label className="pos-search table-search">
          <span aria-hidden="true">🔎</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search bill number, manager, or item"
            aria-label="Search sales report"
          />
        </label>
        <label className="toolbar-select">
          Type
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}>
            <option value="all">All</option>
            <option value="sale">Sale</option>
            <option value="return">Return</option>
          </select>
        </label>
        <span className="result-count">
          {billGroups.length} of {allBillGroups.length} bills
        </span>
      </div>
      <table className="sales-report-table">
        <thead>
          <tr>
            <th aria-label="Expand bill details" className="expand-col" />
            <th>Date</th>
            <th>Bill Number</th>
            <th>Manager</th>
            <th>Type</th>
            <th>Total Qty</th>
            <th>Total Price</th>
            <th>Cash</th>
            <th>Online</th>
            <th>Remark</th>
          </tr>
        </thead>
        {billGroups.map((bill) => {
          const isExpanded = expandedBills.has(bill.billNumber);
          const detailsId = `bill-details-${bill.billNumber.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

          return (
            <tbody key={bill.billNumber} className={isExpanded ? 'bill-group is-expanded' : 'bill-group'}>
              <tr className="bill-parent-row">
                <td className="expand-col" data-label="Details">
                  <button
                    type="button"
                    className="chevron-btn"
                    aria-expanded={isExpanded}
                    aria-controls={detailsId}
                    onClick={() => toggleBill(bill.billNumber)}
                  >
                    <span className="chevron" aria-hidden="true">›</span>
                    <span className="sr-only">{isExpanded ? 'Collapse' : 'Expand'} bill {bill.billNumber}</span>
                  </button>
                </td>
                <td data-label="Date">{new Date(bill.createdAt).toLocaleString()}</td>
                <td data-label="Bill Number" className="bill-number-cell">{bill.billNumber}</td>
                <td data-label="Manager">{bill.managerName}</td>
                <td data-label="Type"><span className="report-type-pill">{bill.type}</span></td>
                <td data-label="Total Qty" className="numeric-cell">{bill.totalQty}</td>
                <td data-label="Total Price" className="numeric-cell">₹{money(bill.totalPrice)}</td>
                <td data-label="Cash" className="numeric-cell">₹{money(bill.cashAmount)}</td>
                <td data-label="Online" className="numeric-cell">₹{money(bill.onlineAmount)}</td>
                <td data-label="Remark">{bill.remark}</td>
              </tr>
              {isExpanded && (
                <tr id={detailsId} className="bill-detail-row">
                  <td colSpan={10}>
                    <div className="bill-items-panel">
                      <div className="bill-items-title">Item details</div>
                      <div className="bill-items-grid" role="table" aria-label={`Items in bill ${bill.billNumber}`}>
                        <div className="bill-items-head" role="row">
                          <span role="columnheader">Item</span>
                          <span role="columnheader">Qty</span>
                          <span role="columnheader">MRP</span>
                          <span role="columnheader">Total</span>
                          <span role="columnheader">Free</span>
                        </div>
                        {bill.rows.map((item) => (
                          <div className="bill-item-line" role="row" key={item.saleItemId}>
                            <span role="cell" data-label="Item">{item.itemName}</span>
                            <span role="cell" data-label="Qty">{item.quantity}</span>
                            <span role="cell" data-label="MRP">₹{money(item.mrp)}</span>
                            <span role="cell" data-label="Total">₹{money(item.lineTotal)}</span>
                            <span role="cell" data-label="Free">{item.isFree ? 'Yes' : 'No'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          );
        })}
        {!billGroups.length && (
          <tbody>
            <tr>
              <td colSpan={10} className="empty">
                {allBillGroups.length ? 'No bills match your search.' : 'No sales in this date range.'}
              </td>
            </tr>
          </tbody>
        )}
      </table>
    </div>
  );
}
