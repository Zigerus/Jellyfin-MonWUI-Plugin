import { showNotification } from "../player/ui/notification.js";
import { createCheckbox, createSection } from "../settings/shared.js";
import {
  getArrSettings,
  getRadarr4KOptions,
  getRadarrOptions,
  getSonarr4KOptions,
  getSonarrOptions,
  saveArrSettings,
  testRadarr4KConnection,
  testRadarrConnection,
  testSonarr4KConnection,
  testSonarrConnection
} from "../arr/api.js";
import { getSerrSettings, saveSerrSettings, testSerrConnection } from "./api.js";

function text(value, fallback = "") {
  const out = String(value ?? "").trim();
  return out || fallback;
}

function L(labels, key, fallback) {
  const value = labels?.[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

const SONARR_FIELDS = {
  quality: "arrSonarrQualityProfileId",
  root: "arrSonarrRootFolderPath",
  language: "arrSonarrLanguageProfileId"
};

const SONARR_4K_FIELDS = {
  quality: "arrSonarr4KQualityProfileId",
  root: "arrSonarr4KRootFolderPath",
  language: "arrSonarr4KLanguageProfileId"
};

const RADARR_FIELDS = {
  quality: "arrRadarrQualityProfileId",
  root: "arrRadarrRootFolderPath"
};

const RADARR_4K_FIELDS = {
  quality: "arrRadarr4KQualityProfileId",
  root: "arrRadarr4KRootFolderPath"
};

function createInput(name, label, value = "", { type = "text", placeholder = "" } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "input-container";

  const lab = document.createElement("label");
  lab.htmlFor = name;
  lab.textContent = label;

  const input = document.createElement("input");
  input.id = name;
  input.name = name;
  input.type = type;
  input.value = value || "";
  input.placeholder = placeholder;
  input.autocomplete = "off";
  input.spellcheck = false;

  wrap.append(lab, input);
  return wrap;
}

function createSelect(name, label, options = []) {
  const wrap = document.createElement("div");
  wrap.className = "input-container";

  const lab = document.createElement("label");
  lab.htmlFor = name;
  lab.textContent = label;

  const select = document.createElement("select");
  select.id = name;
  select.name = name;
  select.dataset.pendingValue = "";

  for (const option of options) {
    const opt = document.createElement("option");
    opt.value = String(option.value ?? "");
    opt.textContent = option.label ?? String(option.value ?? "");
    select.appendChild(opt);
  }

  wrap.append(lab, select);
  return wrap;
}

function mark4KField(node) {
  if (node) node.setAttribute("data-arr-4k-field", "1");
  return node;
}

function setValues(panel, settings = {}) {
  const set = (name, value) => {
    const el = panel.querySelector(`[name="${name}"]`);
    if (!el) return;
    if (el.type === "checkbox") el.checked = value === true;
    else if (el.tagName === "SELECT") {
      const clean = value ?? "";
      el.dataset.pendingValue = String(clean);
      if (clean && !Array.from(el.options).some((option) => option.value === String(clean))) {
        const opt = document.createElement("option");
        opt.value = String(clean);
        opt.textContent = String(clean);
        el.appendChild(opt);
      }
      el.value = clean;
    } else el.value = value ?? "";
  };

  set("serrEnabled", settings.enabled === true);
  set("serrBaseUrl", settings.baseUrl || "");
  set("serrApiKey", settings.apiKey || "");
  set("serrDefaultLanguage", settings.defaultLanguage || "en");
  set("serrRequestAsJellyfinUser", settings.requestAsJellyfinUser !== false);
  set("serrEnable4KRequests", settings.enable4KRequests === true);
  set("serrConfirmRequests", settings.enable4KRequests === true || settings.confirmRequests !== false);
  set("serrShowMissingSearchButton", settings.showMissingSearchButton !== false);
  set("serrEnableNotifications", settings.enableNotifications !== false);
  sync4KControls(panel);
}

function setArrValues(panel, settings = {}) {
  const set = (name, value) => {
    const el = panel.querySelector(`[name="${name}"]`);
    if (!el) return;
    if (el.type === "checkbox") el.checked = value === true;
    else el.value = value ?? "";
  };

  set("arrEnabled", settings.enabled === true);
  set("arrSonarrEnabled", settings.sonarrEnabled === true);
  set("arrSonarrBaseUrl", settings.sonarrBaseUrl || "");
  set("arrSonarrApiKey", settings.sonarrApiKey || "");
  set("arrSonarrRootFolderPath", settings.sonarrRootFolderPath || "");
  set("arrSonarrQualityProfileId", settings.sonarrQualityProfileId || "");
  set("arrSonarrLanguageProfileId", settings.sonarrLanguageProfileId || "");
  set("arrSonarrSeasonFolder", settings.sonarrSeasonFolder !== false);
  set("arrSonarrSearchOnRequest", settings.sonarrSearchOnRequest !== false);
  set("arrSonarr4KEnabled", settings.sonarr4KEnabled === true);
  set("arrSonarr4KBaseUrl", settings.sonarr4KBaseUrl || "");
  set("arrSonarr4KApiKey", settings.sonarr4KApiKey || "");
  set("arrSonarr4KRootFolderPath", settings.sonarr4KRootFolderPath || "");
  set("arrSonarr4KQualityProfileId", settings.sonarr4KQualityProfileId || "");
  set("arrSonarr4KLanguageProfileId", settings.sonarr4KLanguageProfileId || "");
  set("arrSonarr4KSeasonFolder", settings.sonarr4KSeasonFolder !== false);
  set("arrSonarr4KSearchOnRequest", settings.sonarr4KSearchOnRequest !== false);
  set("arrRadarrEnabled", settings.radarrEnabled === true);
  set("arrRadarrBaseUrl", settings.radarrBaseUrl || "");
  set("arrRadarrApiKey", settings.radarrApiKey || "");
  set("arrRadarrRootFolderPath", settings.radarrRootFolderPath || "");
  set("arrRadarrQualityProfileId", settings.radarrQualityProfileId || "");
  set("arrRadarrSearchOnRequest", settings.radarrSearchOnRequest !== false);
  set("arrRadarr4KEnabled", settings.radarr4KEnabled === true);
  set("arrRadarr4KBaseUrl", settings.radarr4KBaseUrl || "");
  set("arrRadarr4KApiKey", settings.radarr4KApiKey || "");
  set("arrRadarr4KRootFolderPath", settings.radarr4KRootFolderPath || "");
  set("arrRadarr4KQualityProfileId", settings.radarr4KQualityProfileId || "");
  set("arrRadarr4KSearchOnRequest", settings.radarr4KSearchOnRequest !== false);
  sync4KControls(panel);
}

function setSelectOptions(select, options, currentValue = "") {
  if (!select) return;
  const cleanCurrent = text(currentValue || select.value || select.dataset.pendingValue || "");
  select.innerHTML = "";
  for (const option of options) {
    const opt = document.createElement("option");
    opt.value = String(option.value ?? "");
    opt.textContent = option.label ?? String(option.value ?? "");
    select.appendChild(opt);
  }
  const values = new Set(Array.from(select.options).map((option) => option.value));
  if (cleanCurrent && !values.has(cleanCurrent)) {
    const opt = document.createElement("option");
    opt.value = cleanCurrent;
    opt.textContent = cleanCurrent;
    select.appendChild(opt);
  }
  select.value = cleanCurrent && values.has(cleanCurrent) || cleanCurrent ? cleanCurrent : "";
  select.dataset.pendingValue = select.value;
}

function formatBytes(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let size = n;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

function applySonarrOptions(panel, options = {}, labels = {}, fieldNames = SONARR_FIELDS) {
  const names = { ...SONARR_FIELDS, ...(fieldNames || {}) };
  const qualityProfiles = Array.isArray(options?.qualityProfiles) ? options.qualityProfiles : [];
  const rootFolders = Array.isArray(options?.rootFolders) ? options.rootFolders : [];
  const languageProfiles = Array.isArray(options?.languageProfiles) ? options.languageProfiles : [];

  setSelectOptions(
    panel.querySelector(`[name="${names.quality}"]`),
    [
      { value: "", label: L(labels, "arrSelectQualityProfile", "Kalite profili seç") },
      ...qualityProfiles
        .filter((profile) => Number(profile?.id) > 0)
        .map((profile) => ({ value: String(profile.id), label: text(profile.name, `#${profile.id}`) }))
    ],
    panel.querySelector(`[name="${names.quality}"]`)?.value
  );

  setSelectOptions(
    panel.querySelector(`[name="${names.root}"]`),
    [
      { value: "", label: L(labels, "arrSelectRootFolder", "Dizin seç") },
      ...rootFolders
        .filter((folder) => text(folder?.path))
        .map((folder) => {
          const free = formatBytes(folder?.freeSpace);
          return {
            value: folder.path,
            label: free ? `${folder.path} (${free})` : folder.path
          };
        })
    ],
    panel.querySelector(`[name="${names.root}"]`)?.value
  );

  setSelectOptions(
    panel.querySelector(`[name="${names.language}"]`),
    [
      { value: "", label: L(labels, "arrLanguageProfileNone", "Yok / Sonarr v4") },
      ...languageProfiles
        .filter((profile) => Number(profile?.id) > 0)
        .map((profile) => ({ value: String(profile.id), label: text(profile.name, `#${profile.id}`) }))
    ],
    panel.querySelector(`[name="${names.language}"]`)?.value
  );
}

async function refreshSonarrOptions(panel, labels, { is4K = false } = {}) {
  const data = await (is4K ? getSonarr4KOptions() : getSonarrOptions());
  applySonarrOptions(panel, data?.options || {}, labels, is4K ? SONARR_4K_FIELDS : SONARR_FIELDS);
  return data?.options || {};
}

function applyRadarrOptions(panel, options = {}, labels = {}, fieldNames = RADARR_FIELDS) {
  const names = { ...RADARR_FIELDS, ...(fieldNames || {}) };
  const qualityProfiles = Array.isArray(options?.qualityProfiles) ? options.qualityProfiles : [];
  const rootFolders = Array.isArray(options?.rootFolders) ? options.rootFolders : [];

  setSelectOptions(
    panel.querySelector(`[name="${names.quality}"]`),
    [
      { value: "", label: L(labels, "arrSelectQualityProfile", "Kalite profili seç") },
      ...qualityProfiles
        .filter((profile) => Number(profile?.id) > 0)
        .map((profile) => ({ value: String(profile.id), label: text(profile.name, `#${profile.id}`) }))
    ],
    panel.querySelector(`[name="${names.quality}"]`)?.value
  );

  setSelectOptions(
    panel.querySelector(`[name="${names.root}"]`),
    [
      { value: "", label: L(labels, "arrSelectRootFolder", "Dizin seç") },
      ...rootFolders
        .filter((folder) => text(folder?.path))
        .map((folder) => {
          const free = formatBytes(folder?.freeSpace);
          return {
            value: folder.path,
            label: free ? `${folder.path} (${free})` : folder.path
          };
        })
    ],
    panel.querySelector(`[name="${names.root}"]`)?.value
  );
}

async function refreshRadarrOptions(panel, labels, { is4K = false } = {}) {
  const data = await (is4K ? getRadarr4KOptions() : getRadarrOptions());
  applyRadarrOptions(panel, data?.options || {}, labels, is4K ? RADARR_4K_FIELDS : RADARR_FIELDS);
  return data?.options || {};
}

function readValues(panel) {
  const value = (name) => panel.querySelector(`[name="${name}"]`)?.value ?? "";
  const checked = (name) => panel.querySelector(`[name="${name}"]`)?.checked === true;
  const enable4KRequests = checked("serrEnable4KRequests");
  return {
    enabled: checked("serrEnabled"),
    baseUrl: text(value("serrBaseUrl")),
    apiKey: text(value("serrApiKey")),
    defaultLanguage: text(value("serrDefaultLanguage"), "en"),
    requestAsJellyfinUser: checked("serrRequestAsJellyfinUser"),
    confirmRequests: enable4KRequests ? true : checked("serrConfirmRequests"),
    showMissingSearchButton: checked("serrShowMissingSearchButton"),
    enableNotifications: checked("serrEnableNotifications"),
    enable4KRequests
  };
}

function readArrValues(panel) {
  const value = (name) => panel.querySelector(`[name="${name}"]`)?.value ?? "";
  const checked = (name) => panel.querySelector(`[name="${name}"]`)?.checked === true;
  const number = (name) => {
    const n = Number(value(name));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  };
  const radarrEnabled = checked("arrRadarrEnabled");
  const sonarrEnabled = checked("arrSonarrEnabled");
  const radarr4KEnabled = checked("arrRadarr4KEnabled");
  const sonarr4KEnabled = checked("arrSonarr4KEnabled");
  const arrEnabledControl = panel.querySelector('[name="arrEnabled"]');
  return {
    enabled: arrEnabledControl ? checked("arrEnabled") : (radarrEnabled || sonarrEnabled || radarr4KEnabled || sonarr4KEnabled),
    sonarrEnabled,
    sonarrBaseUrl: text(value("arrSonarrBaseUrl")),
    sonarrApiKey: text(value("arrSonarrApiKey")),
    sonarrRootFolderPath: text(value("arrSonarrRootFolderPath")),
    sonarrQualityProfileId: number("arrSonarrQualityProfileId"),
    sonarrLanguageProfileId: number("arrSonarrLanguageProfileId"),
    sonarrSeasonFolder: checked("arrSonarrSeasonFolder"),
    sonarrSearchOnRequest: checked("arrSonarrSearchOnRequest"),
    sonarr4KEnabled,
    sonarr4KBaseUrl: text(value("arrSonarr4KBaseUrl")),
    sonarr4KApiKey: text(value("arrSonarr4KApiKey")),
    sonarr4KRootFolderPath: text(value("arrSonarr4KRootFolderPath")),
    sonarr4KQualityProfileId: number("arrSonarr4KQualityProfileId"),
    sonarr4KLanguageProfileId: number("arrSonarr4KLanguageProfileId"),
    sonarr4KSeasonFolder: checked("arrSonarr4KSeasonFolder"),
    sonarr4KSearchOnRequest: checked("arrSonarr4KSearchOnRequest"),
    radarrEnabled,
    radarrBaseUrl: text(value("arrRadarrBaseUrl")),
    radarrApiKey: text(value("arrRadarrApiKey")),
    radarrRootFolderPath: text(value("arrRadarrRootFolderPath")),
    radarrQualityProfileId: number("arrRadarrQualityProfileId"),
    radarrSearchOnRequest: checked("arrRadarrSearchOnRequest"),
    radarr4KEnabled,
    radarr4KBaseUrl: text(value("arrRadarr4KBaseUrl")),
    radarr4KApiKey: text(value("arrRadarr4KApiKey")),
    radarr4KRootFolderPath: text(value("arrRadarr4KRootFolderPath")),
    radarr4KQualityProfileId: number("arrRadarr4KQualityProfileId"),
    radarr4KSearchOnRequest: checked("arrRadarr4KSearchOnRequest")
  };
}

function sync4KControls(panel) {
  if (!panel) return;
  const enable4K = panel.querySelector('[name="serrEnable4KRequests"]')?.checked === true;
  const confirm = panel.querySelector('[name="serrConfirmRequests"]');
  if (confirm) {
    if (enable4K) confirm.checked = true;
    confirm.disabled = enable4K;
    confirm.closest?.(".setting-item")?.classList?.toggle?.("disabled", enable4K);
  }

  panel.querySelectorAll("[data-arr-4k-field]").forEach((wrap) => {
    wrap.style.opacity = enable4K ? "1" : "0.55";
    wrap.querySelectorAll("input,select,button").forEach((el) => {
      el.disabled = !enable4K;
    });
  });
  panel.querySelectorAll("[data-arr-4k-action]").forEach((el) => {
    el.disabled = !enable4K;
  });
}

function setBusy(panel, isBusy) {
  panel.querySelectorAll("input,button,select").forEach((el) => {
    el.disabled = isBusy;
  });
  if (!isBusy) sync4KControls(panel);
}

export function createSerrPanel(config, labels) {
  const panel = document.createElement("div");
  panel.id = "serr-panel";
  panel.className = "settings-panel";

  const section = createSection(L(labels, "serrSettingsTab", "Seerr & Arr Entegrasyonu"));

  section.appendChild(createCheckbox(
    "serrEnabled",
    L(labels, "serrEnabled", "Seerr entegrasyonunu etkinleştir"),
    false
  ));
  section.appendChild(createCheckbox(
    "arrRadarrEnabled",
    L(labels, "arrRadarrEnabled", "Radarr'ı etkinleştir"),
    false
  ));
  section.appendChild(createCheckbox(
    "arrSonarrEnabled",
    L(labels, "arrSonarrEnabled", "Sonarr'ı etkinleştir"),
    false
  ));
  section.appendChild(createCheckbox(
    "serrEnable4KRequests",
    L(labels, "serrEnable4KRequests", "4K istekleri etkinleştir"),
    false
  ));
  section.appendChild(createCheckbox(
    "serrConfirmRequests",
    L(labels, "serrConfirmRequests", "İstek göndermeden önce onay modalı göster"),
    true
  ));
  section.appendChild(createInput(
    "serrBaseUrl",
    L(labels, "serrBaseUrl", "Seerr URL"),
    "",
    { placeholder: "http://localhost:5055" }
  ));
  section.appendChild(createInput(
    "serrApiKey",
    L(labels, "serrApiKey", "Seerr API anahtarı"),
    "",
    { type: "password", placeholder: L(labels, "serrApiKeyPlaceholder", "Seerr ayarlarındaki API anahtarı") }
  ));
  section.appendChild(createInput(
    "serrDefaultLanguage",
    L(labels, "serrDefaultLanguage", "Seerr arama dili"),
    "en",
    { placeholder: "tr, en, en-US" }
  ));
  section.appendChild(createCheckbox(
    "serrRequestAsJellyfinUser",
    L(labels, "serrRequestAsJellyfinUser", "Seerr kullanıcısını Jellyfin kullanıcı ID'si ile eşleştirmeyi dene"),
    true
  ));
  section.appendChild(createCheckbox(
    "serrShowMissingSearchButton",
    L(labels, "serrShowMissingSearchButton", "Jellyfin aramasında Seerr butonunu göster"),
    true
  ));
  section.appendChild(createCheckbox(
    "serrEnableNotifications",
    L(labels, "serrEnableNotifications", "Seerr isteklerini bildirim panelinde göster"),
    true
  ));

  const hint = document.createElement("div");
  hint.className = "description-text";
  hint.textContent = L(
    labels,
    "serrSettingsHint",
    "Admin kullanıcıların istekleri doğrudan Seerr'e gönderilir. Diğer kullanıcıların istekleri önce MonWUI bildirimlerinde admin onayına düşer."
  );
  section.appendChild(hint);

  const actions = document.createElement("div");
  actions.className = "setting-item";
  const testBtn = document.createElement("button");
  testBtn.type = "button";
  testBtn.className = "monwui-serr-test-btn";
  testBtn.textContent = L(labels, "serrTestConnection", "Bağlantıyı Test Et");
  testBtn.addEventListener("click", async () => {
    const old = testBtn.textContent;
    try {
      setBusy(panel, true);
      await saveSerrSettings(readValues(panel));
      testBtn.textContent = L(labels, "serrTesting", "Test ediliyor...");
      await testSerrConnection();
      showNotification(
        `<i class="fas fa-check" style="margin-right:8px;"></i>${L(labels, "serrConnectionOk", "Seerr bağlantısı başarılı.")}`,
        2800,
        "success"
      );
    } catch (error) {
      showNotification(
        `<i class="fas fa-triangle-exclamation" style="margin-right:8px;"></i>${error?.message || L(labels, "serrConnectionFailed", "Seerr bağlantısı başarısız.")}`,
        4200,
        "error"
      );
    } finally {
      testBtn.textContent = old;
      setBusy(panel, false);
    }
  });
  actions.appendChild(testBtn);
  section.appendChild(actions);

  panel.appendChild(section);

  const arrSection = createSection(L(labels, "arrSettingsSection", "Arr Fallback"));

  const sonarrHeading = document.createElement("div");
  sonarrHeading.className = "description-text";
  sonarrHeading.textContent = L(labels, "arrSonarrSection", "Sonarr");
  arrSection.appendChild(sonarrHeading);
  arrSection.appendChild(createInput(
    "arrSonarrBaseUrl",
    L(labels, "arrSonarrBaseUrl", "Sonarr URL"),
    "",
    { placeholder: "http://localhost:8989" }
  ));
  arrSection.appendChild(createInput(
    "arrSonarrApiKey",
    L(labels, "arrSonarrApiKey", "Sonarr API anahtarı"),
    "",
    { type: "password", placeholder: L(labels, "arrApiKeyPlaceholder", "Sonarr ayarlarındaki API anahtarı") }
  ));
  arrSection.appendChild(createSelect(
    "arrSonarrRootFolderPath",
    L(labels, "arrSonarrRootFolderPath", "Sonarr root folder path"),
    [{ value: "", label: L(labels, "arrSelectRootFolder", "Dizin seçmek için bağlantıyı test et") }]
  ));
  arrSection.appendChild(createSelect(
    "arrSonarrQualityProfileId",
    L(labels, "arrSonarrQualityProfileId", "Sonarr quality profile ID"),
    [{ value: "", label: L(labels, "arrSelectQualityProfile", "Kalite seçmek için bağlantıyı test et") }]
  ));
  arrSection.appendChild(createSelect(
    "arrSonarrLanguageProfileId",
    L(labels, "arrSonarrLanguageProfileId", "Sonarr language profile ID"),
    [{ value: "", label: L(labels, "arrLanguageProfileNone", "Yok / Sonarr v4") }]
  ));
  arrSection.appendChild(createCheckbox(
    "arrSonarrSeasonFolder",
    L(labels, "arrSonarrSeasonFolder", "Sonarr'da season folder kullan"),
    true
  ));
  arrSection.appendChild(createCheckbox(
    "arrSonarrSearchOnRequest",
    L(labels, "arrSonarrSearchOnRequest", "Fallback isteğinde bölümü hemen ara"),
    true
  ));

  const arrActions = document.createElement("div");
  arrActions.className = "setting-item";
  const arrTestBtn = document.createElement("button");
  arrTestBtn.type = "button";
  arrTestBtn.className = "monwui-arr-test-btn";
  arrTestBtn.textContent = L(labels, "arrTestConnection", "Sonarr Bağlantısını Test Et");
  arrTestBtn.addEventListener("click", async () => {
    const old = arrTestBtn.textContent;
    try {
      setBusy(panel, true);
      await saveArrSettings(readArrValues(panel));
      arrTestBtn.textContent = L(labels, "serrTesting", "Test ediliyor...");
      const data = await testSonarrConnection();
      applySonarrOptions(panel, data?.options || {}, labels);
      showNotification(
        `<i class="fas fa-check" style="margin-right:8px;"></i>${L(labels, "arrConnectionOk", "Sonarr bağlantısı başarılı.")}`,
        2800,
        "success"
      );
    } catch (error) {
      showNotification(
        `<i class="fas fa-triangle-exclamation" style="margin-right:8px;"></i>${error?.message || L(labels, "arrConnectionFailed", "Sonarr bağlantısı başarısız.")}`,
        4200,
        "error"
      );
    } finally {
      arrTestBtn.textContent = old;
      setBusy(panel, false);
    }
  });
  arrActions.appendChild(arrTestBtn);
  arrSection.appendChild(arrActions);

  const radarrHeading = document.createElement("div");
  radarrHeading.className = "description-text";
  radarrHeading.textContent = L(labels, "arrRadarrSection", "Radarr");
  arrSection.appendChild(radarrHeading);

  arrSection.appendChild(createInput(
    "arrRadarrBaseUrl",
    L(labels, "arrRadarrBaseUrl", "Radarr URL"),
    "",
    { placeholder: "http://localhost:7878" }
  ));
  arrSection.appendChild(createInput(
    "arrRadarrApiKey",
    L(labels, "arrRadarrApiKey", "Radarr API anahtarı"),
    "",
    { type: "password", placeholder: L(labels, "arrRadarrApiKeyPlaceholder", "Radarr ayarlarındaki API anahtarı") }
  ));
  arrSection.appendChild(createSelect(
    "arrRadarrRootFolderPath",
    L(labels, "arrRadarrRootFolderPath", "Radarr root folder path"),
    [{ value: "", label: L(labels, "arrSelectRootFolder", "Dizin seçmek için bağlantıyı test et") }]
  ));
  arrSection.appendChild(createSelect(
    "arrRadarrQualityProfileId",
    L(labels, "arrRadarrQualityProfileId", "Radarr quality profile ID"),
    [{ value: "", label: L(labels, "arrSelectQualityProfile", "Kalite seçmek için bağlantıyı test et") }]
  ));
  arrSection.appendChild(createCheckbox(
    "arrRadarrSearchOnRequest",
    L(labels, "arrRadarrSearchOnRequest", "Fallback isteğinde filmi hemen ara"),
    true
  ));

  const radarrActions = document.createElement("div");
  radarrActions.className = "setting-item";
  const radarrTestBtn = document.createElement("button");
  radarrTestBtn.type = "button";
  radarrTestBtn.className = "monwui-arr-radarr-test-btn";
  radarrTestBtn.textContent = L(labels, "arrRadarrTestConnection", "Radarr Bağlantısını Test Et");
  radarrTestBtn.addEventListener("click", async () => {
    const old = radarrTestBtn.textContent;
    try {
      setBusy(panel, true);
      await saveArrSettings(readArrValues(panel));
      radarrTestBtn.textContent = L(labels, "serrTesting", "Test ediliyor...");
      const data = await testRadarrConnection();
      applyRadarrOptions(panel, data?.options || {}, labels);
      showNotification(
        `<i class="fas fa-check" style="margin-right:8px;"></i>${L(labels, "arrRadarrConnectionOk", "Radarr bağlantısı başarılı.")}`,
        2800,
        "success"
      );
    } catch (error) {
      showNotification(
        `<i class="fas fa-triangle-exclamation" style="margin-right:8px;"></i>${error?.message || L(labels, "arrRadarrConnectionFailed", "Radarr bağlantısı başarısız.")}`,
        4200,
        "error"
      );
    } finally {
      radarrTestBtn.textContent = old;
      setBusy(panel, false);
    }
  });
  radarrActions.appendChild(radarrTestBtn);
  arrSection.appendChild(radarrActions);

  const arr4KHeading = document.createElement("div");
  arr4KHeading.className = "description-text";
  arr4KHeading.textContent = L(labels, "arr4KSettingsSection", "4K Arr Fallback");
  arrSection.appendChild(mark4KField(arr4KHeading));

  const sonarr4KHeading = document.createElement("div");
  sonarr4KHeading.className = "description-text";
  sonarr4KHeading.textContent = L(labels, "arrSonarr4KSection", "4K Sonarr");
  arrSection.appendChild(mark4KField(sonarr4KHeading));
  arrSection.appendChild(mark4KField(createCheckbox(
    "arrSonarr4KEnabled",
    L(labels, "arrSonarr4KEnabled", "4K Sonarr'ı etkinleştir"),
    false
  )));
  arrSection.appendChild(mark4KField(createInput(
    "arrSonarr4KBaseUrl",
    L(labels, "arrSonarr4KBaseUrl", "4K Sonarr URL"),
    "",
    { placeholder: "http://localhost:8990" }
  )));
  arrSection.appendChild(mark4KField(createInput(
    "arrSonarr4KApiKey",
    L(labels, "arrSonarr4KApiKey", "4K Sonarr API anahtarı"),
    "",
    { type: "password", placeholder: L(labels, "arrApiKeyPlaceholder", "Sonarr ayarlarındaki API anahtarı") }
  )));
  arrSection.appendChild(mark4KField(createSelect(
    "arrSonarr4KRootFolderPath",
    L(labels, "arrSonarr4KRootFolderPath", "4K Sonarr root folder path"),
    [{ value: "", label: L(labels, "arrSelectRootFolder", "Dizin seçmek için bağlantıyı test et") }]
  )));
  arrSection.appendChild(mark4KField(createSelect(
    "arrSonarr4KQualityProfileId",
    L(labels, "arrSonarr4KQualityProfileId", "4K Sonarr quality profile ID"),
    [{ value: "", label: L(labels, "arrSelectQualityProfile", "Kalite seçmek için bağlantıyı test et") }]
  )));
  arrSection.appendChild(mark4KField(createSelect(
    "arrSonarr4KLanguageProfileId",
    L(labels, "arrSonarr4KLanguageProfileId", "4K Sonarr language profile ID"),
    [{ value: "", label: L(labels, "arrLanguageProfileNone", "Yok / Sonarr v4") }]
  )));
  arrSection.appendChild(mark4KField(createCheckbox(
    "arrSonarr4KSeasonFolder",
    L(labels, "arrSonarr4KSeasonFolder", "4K Sonarr'da season folder kullan"),
    true
  )));
  arrSection.appendChild(mark4KField(createCheckbox(
    "arrSonarr4KSearchOnRequest",
    L(labels, "arrSonarr4KSearchOnRequest", "4K fallback isteğinde bölümü hemen ara"),
    true
  )));

  const sonarr4KActions = document.createElement("div");
  sonarr4KActions.className = "setting-item";
  sonarr4KActions.setAttribute("data-arr-4k-field", "1");
  const sonarr4KTestBtn = document.createElement("button");
  sonarr4KTestBtn.type = "button";
  sonarr4KTestBtn.className = "monwui-arr-4k-test-btn";
  sonarr4KTestBtn.setAttribute("data-arr-4k-action", "1");
  sonarr4KTestBtn.textContent = L(labels, "arrSonarr4KTestConnection", "4K Sonarr Bağlantısını Test Et");
  sonarr4KTestBtn.addEventListener("click", async () => {
    const old = sonarr4KTestBtn.textContent;
    try {
      setBusy(panel, true);
      await saveArrSettings(readArrValues(panel));
      sonarr4KTestBtn.textContent = L(labels, "serrTesting", "Test ediliyor...");
      const data = await testSonarr4KConnection();
      applySonarrOptions(panel, data?.options || {}, labels, SONARR_4K_FIELDS);
      showNotification(
        `<i class="fas fa-check" style="margin-right:8px;"></i>${L(labels, "arrSonarr4KConnectionOk", "4K Sonarr bağlantısı başarılı.")}`,
        2800,
        "success"
      );
    } catch (error) {
      showNotification(
        `<i class="fas fa-triangle-exclamation" style="margin-right:8px;"></i>${error?.message || L(labels, "arrSonarr4KConnectionFailed", "4K Sonarr bağlantısı başarısız.")}`,
        4200,
        "error"
      );
    } finally {
      sonarr4KTestBtn.textContent = old;
      setBusy(panel, false);
    }
  });
  sonarr4KActions.appendChild(sonarr4KTestBtn);
  arrSection.appendChild(sonarr4KActions);

  const radarr4KHeading = document.createElement("div");
  radarr4KHeading.className = "description-text";
  radarr4KHeading.textContent = L(labels, "arrRadarr4KSection", "4K Radarr");
  arrSection.appendChild(mark4KField(radarr4KHeading));
  arrSection.appendChild(mark4KField(createCheckbox(
    "arrRadarr4KEnabled",
    L(labels, "arrRadarr4KEnabled", "4K Radarr'ı etkinleştir"),
    false
  )));
  arrSection.appendChild(mark4KField(createInput(
    "arrRadarr4KBaseUrl",
    L(labels, "arrRadarr4KBaseUrl", "4K Radarr URL"),
    "",
    { placeholder: "http://localhost:7879" }
  )));
  arrSection.appendChild(mark4KField(createInput(
    "arrRadarr4KApiKey",
    L(labels, "arrRadarr4KApiKey", "4K Radarr API anahtarı"),
    "",
    { type: "password", placeholder: L(labels, "arrRadarrApiKeyPlaceholder", "Radarr ayarlarındaki API anahtarı") }
  )));
  arrSection.appendChild(mark4KField(createSelect(
    "arrRadarr4KRootFolderPath",
    L(labels, "arrRadarr4KRootFolderPath", "4K Radarr root folder path"),
    [{ value: "", label: L(labels, "arrSelectRootFolder", "Dizin seçmek için bağlantıyı test et") }]
  )));
  arrSection.appendChild(mark4KField(createSelect(
    "arrRadarr4KQualityProfileId",
    L(labels, "arrRadarr4KQualityProfileId", "4K Radarr quality profile ID"),
    [{ value: "", label: L(labels, "arrSelectQualityProfile", "Kalite seçmek için bağlantıyı test et") }]
  )));
  arrSection.appendChild(mark4KField(createCheckbox(
    "arrRadarr4KSearchOnRequest",
    L(labels, "arrRadarr4KSearchOnRequest", "4K fallback isteğinde filmi hemen ara"),
    true
  )));

  const radarr4KActions = document.createElement("div");
  radarr4KActions.className = "setting-item";
  radarr4KActions.setAttribute("data-arr-4k-field", "1");
  const radarr4KTestBtn = document.createElement("button");
  radarr4KTestBtn.type = "button";
  radarr4KTestBtn.className = "monwui-arr-radarr-4k-test-btn";
  radarr4KTestBtn.setAttribute("data-arr-4k-action", "1");
  radarr4KTestBtn.textContent = L(labels, "arrRadarr4KTestConnection", "4K Radarr Bağlantısını Test Et");
  radarr4KTestBtn.addEventListener("click", async () => {
    const old = radarr4KTestBtn.textContent;
    try {
      setBusy(panel, true);
      await saveArrSettings(readArrValues(panel));
      radarr4KTestBtn.textContent = L(labels, "serrTesting", "Test ediliyor...");
      const data = await testRadarr4KConnection();
      applyRadarrOptions(panel, data?.options || {}, labels, RADARR_4K_FIELDS);
      showNotification(
        `<i class="fas fa-check" style="margin-right:8px;"></i>${L(labels, "arrRadarr4KConnectionOk", "4K Radarr bağlantısı başarılı.")}`,
        2800,
        "success"
      );
    } catch (error) {
      showNotification(
        `<i class="fas fa-triangle-exclamation" style="margin-right:8px;"></i>${error?.message || L(labels, "arrRadarr4KConnectionFailed", "4K Radarr bağlantısı başarısız.")}`,
        4200,
        "error"
      );
    } finally {
      radarr4KTestBtn.textContent = old;
      setBusy(panel, false);
    }
  });
  radarr4KActions.appendChild(radarr4KTestBtn);
  arrSection.appendChild(radarr4KActions);

  const arrHint = document.createElement("div");
  arrHint.className = "description-text";
  arrHint.textContent = L(
    labels,
    "arrSettingsHint",
    "Tek bölüm Seerr tarafından talep edilemezse Sonarr'a, film Seerr'de mevcut görünüp Jellyfin'de yoksa Radarr'a gönderilir."
  );
  arrSection.appendChild(arrHint);
  panel.appendChild(arrSection);

  panel.querySelector('[name="serrEnable4KRequests"]')?.addEventListener("change", () => sync4KControls(panel));
  panel.querySelector('[name="serrConfirmRequests"]')?.addEventListener("change", () => sync4KControls(panel));
  sync4KControls(panel);

  panel.__monwuiSave = async () => {
    await saveSerrSettings(readValues(panel));
    await saveArrSettings(readArrValues(panel));
  };

  panel.__monwuiLoad = async () => {
    const [serrData, arrData] = await Promise.all([
      getSerrSettings().catch(() => null),
      getArrSettings().catch(() => null)
    ]);
    if (serrData?.settings) setValues(panel, serrData.settings);
    if (arrData?.settings) setArrValues(panel, arrData.settings);
    const arrSettings = arrData?.settings || {};
    await Promise.all([
      text(arrSettings?.sonarrBaseUrl) && text(arrSettings?.sonarrApiKey)
        ? refreshSonarrOptions(panel, labels).catch(() => {})
        : Promise.resolve(),
      text(arrSettings?.radarrBaseUrl) && text(arrSettings?.radarrApiKey)
        ? refreshRadarrOptions(panel, labels).catch(() => {})
        : Promise.resolve(),
      text(arrSettings?.sonarr4KBaseUrl) && text(arrSettings?.sonarr4KApiKey)
        ? refreshSonarrOptions(panel, labels, { is4K: true }).catch(() => {})
        : Promise.resolve(),
      text(arrSettings?.radarr4KBaseUrl) && text(arrSettings?.radarr4KApiKey)
        ? refreshRadarrOptions(panel, labels, { is4K: true }).catch(() => {})
        : Promise.resolve()
    ]);
    if (arrData?.settings) setArrValues(panel, arrData.settings);
    sync4KControls(panel);
  };

  setTimeout(() => {
    panel.__monwuiLoad?.().catch(() => {});
  }, 0);

  return panel;
}
