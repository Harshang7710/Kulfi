'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function Notice() {
  const searchParams = useSearchParams();
  const [dismissed, setDismissed] = useState(false);

  const ok = searchParams.get('ok');
  const err = searchParams.get('err');
  const notice = ok ? { type: 'success', message: ok } : err ? { type: 'error', message: err } : null;

  if (!notice || dismissed) return null;

  return (
    <div className={`notice ${notice.type}`} role="alert">
      <span>{notice.message}</span>
      <button type="button" className="notice-close" onClick={() => setDismissed(true)} aria-label="Dismiss notification">
        &times;
      </button>
    </div>
  );
}
