'use client';

import { useEffect } from 'react';

export default function AppError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="login-page" id="main">
      <section className="login-card error-page">
        <p className="error-code">500</p>
        <h1>Something went wrong</h1>
        <p>The application could not complete that request. Please try again.</p>
        <button className="btn primary" type="button" onClick={reset}>
          Try again
        </button>
      </section>
    </main>
  );
}
