import PageHeader from '@/components/PageHeader';
import { itemRows } from '@/lib/helpers';
import PosClient from './PosClient';

export default async function ManagerPosPage() {
  const items = await itemRows(true);

  return (
    <>
      <PageHeader title="POS Billing" />
      <PosClient items={items} />
    </>
  );
}
