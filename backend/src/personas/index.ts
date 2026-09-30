import type { Persona } from '@webguardian/shared';

export interface PersonaInfo {
  id: Persona;
  name: string;
  description: string;
  detectors: string[];
}

export const PERSONAS_INFO: PersonaInfo[] = [
  {
    id: 'keyboard',
    name: 'Keyboard-only user',
    description: 'Navigates with Tab, Shift+Tab, Enter and Escape only. Detects focus traps and invisible focus.',
    detectors: ['WebGuardian keyboard persona'],
  },
  {
    id: 'screen-reader',
    name: 'Screen-reader user',
    description: 'Relies on the accessibility tree: names, labels, headings, landmarks and image descriptions.',
    detectors: ['axe-core'],
  },
  {
    id: 'low-vision',
    name: 'Low-vision user',
    description: 'Needs sufficient colour contrast and clear visual hierarchy.',
    detectors: ['axe-core (color-contrast)'],
  },
  {
    id: 'slow-device',
    name: 'Slow device / network user',
    description: 'Uses a phone on a slow connection. Measures page weight, image sizes, mobile layout and Lighthouse metrics.',
    detectors: ['Resource Timing API', 'Mobile viewport emulation', 'Lighthouse'],
  },
  {
    id: 'first-time-visitor',
    name: 'First-time visitor / SEO',
    description: 'Arrives from search. Checks title, meta description, H1, metadata, broken links and errors.',
    detectors: ['DOM inspection', 'HTTP link checker', 'Playwright error monitoring'],
  },
];
