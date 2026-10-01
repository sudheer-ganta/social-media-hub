// Applies the saved (or system) theme before first paint, so a dark-mode user
// never sees a flash of the light theme.
//
// This is a separate file, not an inline <script>, so the Content-Security-Policy
// can say `script-src 'self'` with no `'unsafe-inline'` and no per-build hash.
(function () {
  try {
    var stored = localStorage.getItem("sch-theme");
    var system = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
    var theme = stored === "light" || stored === "dark" ? stored : system;
    document.documentElement.classList.add(theme);
  } catch (e) {}
})();
