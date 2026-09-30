# Brewly — intentionally flawed demo website

Brewly is a fictional coffee-subscription store used to demonstrate WebGuardian AI.
It looks like a normal, professional marketing site, but it contains **real, planted
defects in its source code**. WebGuardian must discover them with a real browser —
nothing about the scan results is hard-coded.

| # | Planted problem | Where it lives | Who it hurts |
|---|-----------------|----------------|--------------|
| 1 | Icon-only buttons (search, account, menu) with no accessible name | `index.html`, `products.html`, `contact.html` header | Screen-reader users |
| 2 | Cookie banner that intercepts <kbd>Tab</kbd> and never lets focus leave; its "buttons" are `div`s that ignore <kbd>Enter</kbd> | `app.js`, `index.html` | Keyboard-only users |
| 3 | Images without `alt` text | hero, feature icons, product images | Screen-reader users |
| 4 | Missing `<meta name="description">` | `index.html`, `contact.html` | Everyone arriving from search |
| 5 | No `<h1>` — the headline is a styled `div` | `index.html` | Screen-reader & SEO |
| 6 | Low-contrast text (`--muted: #b9afa5` on cream/white) | `styles.css` | Low-vision users |
| 7 | 5 MB, 2800px PNG hero image displayed at ~550px | `images/hero.png` | Slow devices / mobile data |
| 8 | Focus indicator removed globally (`*:focus { outline: none; }`) | `styles.css` | Keyboard users |
| 9 | Form fields with placeholder but no label | newsletter + contact form | Screen-reader users |
| 10 | Broken "Pricing" link (404) | navigation | Everyone |
| 11 | JavaScript error on load (`initChatWidget` is not defined) | `app.js` | Everyone |
| 12 | Heading levels skip from `h1` to `h4` | `products.html` | Screen-reader users |

`images/hero-optimized.jpg` is a correctly sized version of the hero that a fix can switch to.
Regenerate the images with `node demo-site/scripts/generate-images.mjs`.

Run it on its own with `node demo-site/serve.mjs` (http://localhost:4000).
