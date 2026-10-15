// Set light/dark before first paint so the page does not flash. External file
// (not inline) so the Content-Security-Policy can forbid inline scripts.
(function () {
  try {
    var preference = localStorage.getItem("dbx-theme");
    var dark =
      preference === "dark" ||
      ((!preference || preference === "system") && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.mode = dark ? "dark" : "light";
  } catch (error) {
    document.documentElement.dataset.mode = "light";
  }
})();
