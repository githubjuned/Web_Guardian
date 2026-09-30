import { Link } from 'react-router-dom';
import { Logo } from './Logo';
import { API_BASE } from '../services/api';

export function Footer() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="container-page flex flex-col gap-6 py-10 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <Logo />
          <p className="max-w-md text-sm text-fg-muted">
            Autonomous AI website QA agent. Tests, explains, fixes and verifies — built for the Build To Ship hackathon.
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-fg-muted">
          <Link to="/audit" className="hover:text-fg">
            Start an audit
          </Link>
          <Link to="/audits" className="hover:text-fg">
            Recent audits
          </Link>
          <a href="https://github.com/githubjuned/web_guardian" className="hover:text-fg">
            GitHub
          </a>
          <a href={`${API_BASE}/api/health`} className="hover:text-fg">
            API status
          </a>
        </nav>
      </div>
      <p className="container-page pb-8 text-xs text-fg-subtle">
        Only audit websites you own or are authorised to test. Powered by Playwright, axe-core, Lighthouse and Google Gemini.
      </p>
    </footer>
  );
}
