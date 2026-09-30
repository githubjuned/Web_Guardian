export function LogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="wg-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#60a5fa" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <path d="M32 4 8 13v17c0 15 10.4 26.6 24 30 13.6-3.4 24-15 24-30V13z" fill="url(#wg-logo)" />
      <path d="M20 32.5c3.4-5.4 7.4-8 12-8s8.6 2.6 12 8c-3.4 5.4-7.4 8-12 8s-8.6-2.6-12-8z" fill="#0b1026" />
      <circle cx="32" cy="32.5" r="4.6" fill="#fff" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="text-lg font-bold tracking-tight">
        WebGuardian <span className="gradient-text">AI</span>
      </span>
    </span>
  );
}
