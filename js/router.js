import Logger from "./logger.js";
const pages = ["home","studio","captions","ideas","settings"];
export function navigate(page) {
  const safe = pages.includes(page) ? page : "home";
  document.querySelectorAll("[data-page]").forEach(b => b.classList.toggle("active", b.dataset.page === safe));
  document.dispatchEvent(new CustomEvent("clipforge:navigate", { detail: { page: safe } }));
  Logger.info("Navigated", safe);
}
