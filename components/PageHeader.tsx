import { Suspense } from 'react';
import Notice from './Notice';

export default async function PageHeader({ title: _title }: { title: string }) {
  return (
    <Suspense fallback={null}>
      <Notice />
    </Suspense>
  );
}
