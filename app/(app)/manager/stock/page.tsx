import PageHeader from '@/components/PageHeader';
import { itemRows, stockDisplay } from '@/lib/helpers';
import StockTable, { type StockTableRow } from './StockTable';

export default async function ManagerStockPage() {
  const rows = await itemRows(true);
  const tableRows: StockTableRow[] = rows.map((r) => {
    const display = stockDisplay(r);
    return {
      id: r.id,
      name: r.name,
      itemCode: r.itemCode || '',
      mainPieces: display.mainPieces,
      secondBoxes: display.secondBoxes,
      piecesPerBox: r.piecesPerBox,
      lowStockThreshold: r.lowStockThreshold,
      mainFridgeQty: r.mainFridgeQty
    };
  });

  return (
    <>
      <PageHeader title="Available Stock" />
      <StockTable rows={tableRows} />
    </>
  );
}
