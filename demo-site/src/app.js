/* Brewly site scripts */

// Cookie consent banner
(function () {
  var banner = document.getElementById('cookie-banner');
  if (!banner) return;
  if (localStorage.getItem('brewly-consent')) {
    banner.remove();
    return;
  }
  banner.hidden = false;

  // Keep keyboard focus inside the banner until the visitor makes a choice
  var focusable = banner.querySelectorAll('a, [tabindex="0"]');
  var current = -1;
  document.addEventListener('keydown', function (event) {
    if (!document.body.contains(banner)) return;
    if (event.key === 'Tab') {
      event.preventDefault();
      current = event.shiftKey ? (current - 1 + focusable.length) % focusable.length : (current + 1) % focusable.length;
      focusable[current].focus();
    }
  });

  banner.querySelectorAll('[data-consent]').forEach(function (choice) {
    choice.addEventListener('click', function () {
      localStorage.setItem('brewly-consent', choice.getAttribute('data-consent'));
      banner.remove();
    });
  });
})();

// Live chat widget
window.addEventListener('load', function () {
  initChatWidget({ position: 'bottom-right' });
});
