import { NextResponse, type NextRequest } from 'next/server';
import { stringify } from 'csv-stringify/sync';
import { getCurrentUser } from '@/lib/auth';
import { dateRange, reports } from '@/lib/helpers';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'owner') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const range = dateRange({
    from: request.nextUrl.searchParams.get('from') ?? undefined,
    to: request.nextUrl.searchParams.get('to') ?? undefined
  });
  const report = await reports(range, { all: true });

  const csv = stringify(
    report.rows.map((r) => ({
      dateTime: new Date(r.createdAt).toISOString(),
      billId: r.billNumber,
      managerName: r.managerName,
      customerName: r.customerName || '',
      itemId: r.itemCode,
      itemName: r.itemName,
      quantity: r.quantity,
      mrp: r.mrp,
      freeItem: r.isFree ? 'yes' : 'no',
      lineTotal: r.lineTotal,
      cashAmount: r.cashAmount,
      onlineAmount: r.onlineAmount,
      billTotal: r.totalAmount,
      remarks: r.remark || '',
      returnReference: r.originalSaleItemId || r.originalSaleId || ''
    })),
    { header: true }
  );

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="sales-report-${range.fromDate}-to-${range.toDate}.csv"`
    }
  });
}
