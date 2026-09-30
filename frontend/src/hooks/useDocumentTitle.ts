import { useEffect } from 'react';

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · WebGuardian AI` : 'WebGuardian AI — Autonomous AI Website QA Agent';
  }, [title]);
}
