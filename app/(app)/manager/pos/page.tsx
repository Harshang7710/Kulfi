import PageHeader from '@/components/PageHeader';
import { itemRows } from '@/lib/helpers';
import type { ItemRow } from '@/lib/types';
import PosClient from './PosClient';

export default async function ManagerPosPage() {
  // Client components must receive plain serializable data, not MongoDB ObjectId/Date instances.
  const items = JSON.parse(JSON.stringify(await itemRows(true))) as ItemRow[];

  return (
    <>
      <PageHeader title="POS Billing" />
      <PosClient items={items} />
    </>
  );
}
