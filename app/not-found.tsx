import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="login-page" id="main">
      <section className="login-card error-page">
        <p className="error-code">404</p>
        <h1>Page not found</h1>
        <p>The page you requested does not exist or may have moved.</p>
        <Link className="btn primary" href="/">
          Return home
        </Link>
      </section>
    </main>
  );
}
