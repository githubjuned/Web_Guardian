import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Github, Menu, X } from 'lucide-react';
import { Logo } from './Logo';

const links = [
  { to: '/#how-it-works', label: 'How it works' },
  { to: '/#personas', label: 'Personas' },
  { to: '/#features', label: 'Features' },
  { to: '/audits', label: 'Recent audits' },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ink-900/80 backdrop-blur-xl">
      <nav className="container-page flex h-16 items-center gap-6" aria-label="Main">
        <Link to="/" className="rounded-lg" aria-label="WebGuardian AI home">
          <Logo />
        </Link>
        <ul className="ml-auto hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <li key={l.to}>
              <NavLink to={l.to} className="btn-ghost px-3 py-2">
                {l.label}
              </NavLink>
            </li>
          ))}
          <li>
            <a href="https://github.com/githubjuned/web_guardian" className="btn-ghost px-3 py-2" aria-label="GitHub repository">
              <Github className="h-4 w-4" aria-hidden="true" />
            </a>
          </li>
        </ul>
        <Link to="/audit" className="btn-primary hidden md:inline-flex">
          Audit your website
        </Link>
        <button
          type="button"
          className="btn-ghost ml-auto p-2 md:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
        </button>
      </nav>
      {open && (
        <div id="mobile-menu" className="border-t border-line md:hidden">
          <ul className="container-page flex flex-col gap-1 py-3">
            {links.map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="btn-ghost w-full justify-start" onClick={() => setOpen(false)}>
                  {l.label}
                </Link>
              </li>
            ))}
            <li>
              <Link to="/audit" className="btn-primary mt-2 w-full" onClick={() => setOpen(false)}>
                Audit your website
              </Link>
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}
