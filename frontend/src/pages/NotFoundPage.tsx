import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export function NotFoundPage() {
  useDocumentTitle('Page not found');
  return (
    <div className="container-page py-24 text-center">
      <p className="font-mono text-sm text-brand-300">404</p>
      <h1 className="mt-2 text-3xl font-bold">This page doesn’t exist</h1>
      <p className="mt-2 text-fg-muted">Ironically, a broken link. WebGuardian would have caught it.</p>
      <Link to="/" className="btn-primary mt-8">
        Back to home
      </Link>
    </div>
  );
}
