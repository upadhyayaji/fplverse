(() => {
  const storageKey = "fplverse-theme";
  const root = document.documentElement;
  const toggles = document.querySelectorAll("[data-theme-toggle]");
  const themeMeta = document.querySelector('meta[name="theme-color"]');

  function applyTheme(theme) {
    const nextTheme = theme === "light" ? "light" : "dark";
    root.dataset.theme = nextTheme;
    if (themeMeta) themeMeta.content = nextTheme === "light" ? "#f4f3ef" : "#080811";
    toggles.forEach((toggle) => {
      const target = nextTheme === "dark" ? "light" : "dark";
      const label = toggle.querySelector("[data-theme-label]");
      toggle.setAttribute("aria-label", `Switch to ${target} mode`);
      toggle.title = `Switch to ${target} mode`;
      toggle.setAttribute("aria-pressed", String(nextTheme === "light"));
      if (label) label.textContent = target === "light" ? "Light" : "Dark";
    });
  }

  applyTheme(root.dataset.theme);
  toggles.forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const nextTheme = root.dataset.theme === "light" ? "dark" : "light";
      try { localStorage.setItem(storageKey, nextTheme); } catch (_) { /* Theme still applies for this page. */ }
      applyTheme(nextTheme);
    });
  });
})();
