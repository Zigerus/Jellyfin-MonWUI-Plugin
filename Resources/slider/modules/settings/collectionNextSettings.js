// Fork Zigerus (4.0.0.96): the "Next in the Collection" settings, a group under Next Up Episodes in the Home Rows tab's
// "Recently Added & Continue Watching" section (approved on the canvas board "Lumen: Next in the Collection row"):
// the switch (with a New badge and one line on what it does), "Only collections watched within" 3 months / 1 year /
// Any time, and the card count. The window is a segmented control writing one hidden field, collectionNextWindow.
import { createCheckbox, createNumberInput } from "./shared.js";
import { normalizeCollectionNextWindow } from "../config.js";

const STYLE_ID = "jms-collection-next-settings-css";

// Selectors start with "html body #settings-modal" so they outrank the Lumen settings sheet's generic button rules
// (known-quirks 2026-11-07, MonWUI tag rows); !important only on colours.
const CSS = `
html body #settings-modal .cnx-settings { --cnx-on: var(--settings-accent, #29c4d4); --cnx-on-text: #0a0a0f; --cnx-line: var(--settings-border, rgba(127,127,127,.2)); --cnx-line-strong: var(--settings-border-strong, rgba(127,127,127,.35)); --cnx-muted: var(--settings-muted, rgba(127,127,127,.9)); margin: 6px 0 10px; padding: 2px 0 2px 18px; border-left: 2px solid var(--cnx-on); }
html body #settings-modal .cnx-settings .cnx-new { display: inline-block; margin-left: 10px; padding: 2px 8px; border: 1px solid var(--cnx-on); border-radius: 999px; color: var(--cnx-on) !important; font: 500 11px/1.2 var(--lumen-mono, ui-monospace, Menlo, monospace); letter-spacing: .12em; text-transform: uppercase; vertical-align: middle; }
html body #settings-modal .cnx-settings .cnx-desc { display: block; margin: 4px 0 0; color: var(--cnx-muted) !important; font-size: 14px; line-height: 1.4; }
html body #settings-modal .cnx-settings .setting-item > label { flex-wrap: wrap; align-items: center; }
html body #settings-modal .cnx-settings .setting-item > label > .cnx-desc { flex-basis: 100%; }
html body #settings-modal .cnx-settings .cnx-window { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding: 12px 0; border-top: 1px solid var(--cnx-line); border-bottom: 1px solid var(--cnx-line); }
html body #settings-modal .cnx-settings .cnx-window-text { min-width: 0; }
html body #settings-modal .cnx-settings .cnx-seg { display: inline-flex; padding: 3px; border-radius: 999px; border: 1px solid var(--cnx-line-strong); }
html body #settings-modal .cnx-settings button.cnx-seg-btn { margin: 0; padding: 8px 16px; min-width: 0; min-height: 0; border: 0; border-radius: 999px; background: none; color: var(--cnx-muted) !important; font: 400 14px/1 var(--settings-font, inherit); cursor: pointer; box-shadow: none; }
html body #settings-modal .cnx-settings button.cnx-seg-btn[aria-pressed="true"] { background: var(--cnx-on); color: var(--cnx-on-text) !important; font-weight: 500; }
html body #settings-modal .cnx-settings button.cnx-seg-btn:focus-visible { outline: 2px solid var(--cnx-on); outline-offset: 2px; }
`;

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  (document.head || document.documentElement).appendChild(style);
}

function text(tag, cls, value) {
  const el = document.createElement(tag);
  el.className = cls;
  el.textContent = value;
  return el;
}

export function createCollectionNextSettings(config, labels) {
  ensureStyles();
  const wrap = document.createElement("div");
  wrap.className = "cnx-settings";

  const enable = createCheckbox(
    "enableCollectionNextRow",
    labels?.enableCollectionNextRow || "Enable Next in the Collection Cards",
    config.enableCollectionNextRow !== false
  );
  const enableLabel = enable.querySelector("label");
  if (enableLabel) {
    enableLabel.appendChild(text("span", "cnx-new", labels?.collectionNextNewBadge || "New"));
    enableLabel.appendChild(text("span", "cnx-desc", labels?.collectionNextDesc || "The next film from each film series you've started."));
  }
  wrap.appendChild(enable);

  const current = normalizeCollectionNextWindow(config.collectionNextWindow);
  const windowRow = document.createElement("div");
  windowRow.className = "cnx-window";
  const windowText = document.createElement("div");
  windowText.className = "cnx-window-text";
  windowText.appendChild(text("label", "cnx-window-label", labels?.collectionNextWindow || "Only collections watched within"));
  windowText.appendChild(text("span", "cnx-desc", labels?.collectionNextWindowDesc || "Older ones stay off the row until you watch one again."));
  const hidden = document.createElement("input");
  hidden.type = "hidden";
  hidden.name = "collectionNextWindow";
  hidden.id = "collectionNextWindow";
  hidden.value = current;
  const seg = document.createElement("div");
  seg.className = "cnx-seg";
  seg.setAttribute("role", "group");
  seg.setAttribute("aria-label", labels?.collectionNextWindow || "Only collections watched within");
  const options = [
    ["3m", labels?.collectionNextWindow3m || "3 months"],
    ["1y", labels?.collectionNextWindow1y || "1 year"],
    ["any", labels?.collectionNextWindowAny || "Any time"],
  ];
  for (const [value, label] of options) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cnx-seg-btn";
    b.dataset.value = value;
    b.textContent = label;
    b.setAttribute("aria-pressed", value === current ? "true" : "false");
    b.addEventListener("click", () => {
      hidden.value = value;
      seg.querySelectorAll("button.cnx-seg-btn").forEach((x) => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
    });
    seg.appendChild(b);
  }
  windowRow.append(windowText, seg, hidden);
  wrap.appendChild(windowRow);

  const count = createNumberInput(
    "collectionNextCardCount",
    labels?.collectionNextCardCount || "Next in the Collection Card Count",
    Number.isFinite(config.collectionNextCardCount) ? config.collectionNextCardCount : 20,
    1,
    30
  );
  wrap.appendChild(count);

  const enableCb = enable.querySelector('input[type="checkbox"]');
  const sync = () => {
    const on = !!enableCb?.checked;
    windowRow.style.display = on ? "" : "none";
    count.style.display = on ? "" : "none";
  };
  sync();
  enable.addEventListener("change", sync, { passive: true });
  return { wrap, enableCb, sync };
}
