(function initializeCasaHebraTheme() {
  var storageKey = "casa-hebra:theme";
  var savedTheme = null;

  try {
    savedTheme = window.localStorage.getItem(storageKey);
  } catch (_error) {
    savedTheme = null;
  }

  var theme = savedTheme === "light" || savedTheme === "dark"
    ? savedTheme
    : window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";

  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;

  var themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) {
    themeColor.setAttribute("content", theme === "dark" ? "#131210" : "#FBF8F3");
  }
})();
