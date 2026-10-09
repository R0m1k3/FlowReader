// Applies the saved theme before first paint (kept out of index.html so the
// Content-Security-Policy can forbid inline scripts).
(function () {
  try {
    var t = localStorage.getItem('theme');
    if (!t) t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    var root = document.documentElement;
    if (t === 'dark') root.classList.add('dark');
    if (t === 'sepia') root.classList.add('sepia');
    root.style.colorScheme = t === 'dark' ? 'dark' : 'light';
  } catch (e) {}
})();
