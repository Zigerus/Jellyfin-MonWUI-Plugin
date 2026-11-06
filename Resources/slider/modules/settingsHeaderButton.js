import { getConfig } from "./config.js";
import { faIconHtml } from "./faIcons.js";
import { applyHeaderIconButtonMode, findHeaderMountTarget } from "./headerCompat.js";
import { openSettings } from "./settingsLoader.js";

// A gear in the Jellyfin header, next to the notifications bell, that opens MonWUI's
// settings. The gear in the hero's provider strip stays; this one is for themes that hide
// that strip and for pages without the slider. Same mount path as the bell (headerCompat),
// same "Show settings link" option (config.showSettingsLink). F2 keeps working.

const SETTINGS_HEADER_LEGACY_CLASS = "headerSyncButton syncButton headerButton headerButtonRight paper-icon-button-light";

let __settingsBtn = null;
let __settingsHeaderObs = null;

function buildSettingsButton() {
  const config = getConfig();
  const label = config?.languageLabels?.settingsLink || "Settings";
  const btn = document.createElement("button");
  btn.id = "jfSettingsBtn";
  btn.type = "button";
  btn.setAttribute("aria-label", label);
  btn.title = label;
  btn.setAttribute("aria-haspopup", "dialog");
  btn.innerHTML = faIconHtml("fa-solid fa-gear", "jf-settings-icon");
  btn.addEventListener("click", (event) => {
    event.preventDefault();
    void openSettings("monwui");
  });
  return btn;
}

function ensureSettingsButtonIn(el, mode = "legacy") {
  if (!el) return false;
  if (!__settingsBtn) __settingsBtn = buildSettingsButton();
  applyHeaderIconButtonMode(__settingsBtn, mode, {
    legacyClassName: SETTINGS_HEADER_LEGACY_CLASS,
  });
  const bell = el.querySelector("#jfNotifBtn");
  const placed = __settingsBtn.parentElement === el
    && (bell ? __settingsBtn.previousElementSibling === bell : __settingsBtn === el.firstElementChild);
  if (placed) return true;
  const anchor = bell ? bell.nextSibling : el.firstChild;
  try { el.insertBefore(__settingsBtn, anchor); } catch { el.appendChild(__settingsBtn); }
  return true;
}

function mountSettingsButton() {
  const host = findHeaderMountTarget({ variant: "actions" });
  if (!host.element) return;
  ensureSettingsButtonIn(host.element, host.mode);
}

function startSettingsHeaderSentinel() {
  if (__settingsHeaderObs) return;
  const mount = () => {
    const target = document.querySelector(".skinHeader") || document.body;
    if (!target) return;
    mountSettingsButton();
    if (__settingsHeaderObs) __settingsHeaderObs.disconnect();
    __settingsHeaderObs = new MutationObserver(() => {
      const host = findHeaderMountTarget({ variant: "actions" });
      if (!host.element) return;
      if (!__settingsBtn || !host.element.contains(__settingsBtn)) {
        ensureSettingsButtonIn(host.element, host.mode);
      }
    });
    __settingsHeaderObs.observe(target, { childList: true, subtree: true });
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) mountSettingsButton();
  });
}

export function initSettingsHeaderButton() {
  if (typeof document === "undefined") return;
  const config = getConfig();
  if (config?.showSettingsLink === false) {
    document.getElementById("jfSettingsBtn")?.remove();
    return;
  }
  startSettingsHeaderSentinel();
}
