/**
 * In-page helpers installed into every document the agent opens (via addInitScript).
 * They draw the "agent cursor" highlight used in live frames and evidence
 * screenshots, and build stable CSS selectors. The overlay is removed before any
 * detector inspects the DOM.
 */
export const HELPER_SCRIPT = `
// esbuild/tsx wraps named functions in __name(); define it so serialized
// page.evaluate callbacks work in the page.
globalThis.__name = globalThis.__name || ((fn) => fn);
(() => {
  if (window.__wg) return;
  const OVERLAY_ID = '__wg_overlay';
  function cssPath(el) {
    if (!(el instanceof Element)) return null;
    if (el.id) return '#' + CSS.escape(el.id);
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.body && parts.length < 4) {
      let part = node.tagName.toLowerCase();
      if (node.id) { parts.unshift('#' + CSS.escape(node.id)); break; }
      const classes = typeof node.className === 'string' ? node.className.trim().split(/\\s+/).filter(Boolean).slice(0, 2) : [];
      if (classes.length) part += '.' + classes.map((c) => CSS.escape(c)).join('.');
      const parent = node.parentElement;
      if (parent) {
        const same = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
        if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(node) + 1) + ')';
      }
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(' > ');
  }
  function clearHighlight() {
    document.getElementById(OVERLAY_ID)?.remove();
  }
  function highlight(el, label, color) {
    clearHighlight();
    if (!(el instanceof Element)) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const box = document.createElement('div');
    box.id = OVERLAY_ID;
    box.setAttribute('aria-hidden', 'true');
    const c = color || '#a855f7';
    box.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;border:3px solid ' + c +
      ';border-radius:6px;box-shadow:0 0 0 4px ' + c + '55, 0 0 24px ' + c + ';left:' + (r.left - 5) + 'px;top:' + (r.top - 5) +
      'px;width:' + (r.width + 10) + 'px;height:' + (r.height + 10) + 'px;';
    if (label) {
      const tag = document.createElement('span');
      tag.textContent = label;
      tag.style.cssText = 'position:absolute;left:-3px;top:' + (r.top < 30 ? r.height + 12 : -28) + 'px;background:' + c +
        ';color:#fff;font:600 12px/1.6 system-ui,sans-serif;padding:2px 8px;border-radius:4px;white-space:nowrap;';
      box.appendChild(tag);
    }
    document.documentElement.appendChild(box);
    return true;
  }
  window.__wg = { cssPath, highlight, clearHighlight };
})();
`;
