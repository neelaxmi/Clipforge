import Logger from "./logger.js";
<<<<<<< HEAD
const pages = ["home","factory","studio","template","captions","ideas","settings"];
=======
const pages = ["home","factory","studio","captions","ideas","settings"];
>>>>>>> abb849acb7a1c17074a8051fd788953abf968401
export function navigate(page) {
  const safe = pages.includes(page) ? page : "home";
  document.querySelectorAll("[data-page]").forEach(b => b.classList.toggle("active", b.dataset.page === safe));
  document.dispatchEvent(new CustomEvent("clipforge:navigate", { detail: { page: safe } }));
  Logger.info("Navigated", safe);
}
