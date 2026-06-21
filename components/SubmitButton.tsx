'use client';

import { useFormStatus } from 'react-dom';
import type { ReactNode } from 'react';

/**
 * Submit button for forms using a Server Action `action` prop. These forms POST
 * via fetch (no native browser navigation), so without this the button just sits
 * there looking unresponsive for the round trip. Must be a child of the <form> —
 * useFormStatus reads pending state from React context provided by that <form>,
 * not from the DOM `form="..."` attribute, so it won't work on buttons wired to
 * a form they aren't nested inside (see EditableItemRow for that case instead).
 */
export default function SubmitButton({
  children,
  pendingText,
  className = 'btn primary'
}: {
  children: ReactNode;
  pendingText?: ReactNode;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending && <span className="btn-spinner" aria-hidden="true" />}
      {pending ? (pendingText ?? children) : children}
    </button>
  );
}
