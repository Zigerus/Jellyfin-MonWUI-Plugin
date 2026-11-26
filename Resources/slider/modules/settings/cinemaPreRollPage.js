import { bindCheckboxKontrol, createCheckbox, createSection } from "./shared.js";

const DEFAULT_TRAILER_COUNT = 2;
const MAX_TRAILER_COUNT = 5;
const CINEMA_PREROLL_LANGUAGE_OPTIONS = Object.freeze([
  { value: "auto", label: "🌐 Auto" },
  { value: "tr-TR", label: "🇹🇷 Türkçe" },
  { value: "en-US", label: "🇺🇸 English (US)" },
  { value: "en-GB", label: "🇬🇧 English (UK)" },
  { value: "de-DE", label: "🇩🇪 Deutsch" },
  { value: "fr-FR", label: "🇫🇷 Français" },
  { value: "es-ES", label: "🇪🇸 Español" },
  { value: "it-IT", label: "🇮🇹 Italiano" },
  { value: "ru-RU", label: "🇷🇺 Русский" },
  { value: "ja-JP", label: "🇯🇵 日本語" },
  { value: "zh-CN", label: "🇨🇳 简体中文" },
  { value: "pt-PT", label: "🇵🇹 Português (Portugal)" },
  { value: "pt-BR", label: "🇧🇷 Português (Brasil)" },
  { value: "nl-NL", label: "🇳🇱 Nederlands" },
  { value: "sv-SE", label: "🇸🇪 Svenska" },
  { value: "pl-PL", label: "🇵🇱 Polski" },
  { value: "uk-UA", label: "🇺🇦 Українська" },
  { value: "ko-KR", label: "🇰🇷 한국어" },
  { value: "ar-SA", label: "🇸🇦 العربية" },
  { value: "hi-IN", label: "🇮🇳 हिन्दी" },
  { value: "fa-IR", label: "🇮🇷 فارسی" }
]);
const CINEMA_PREROLL_REGION_OPTIONS = Object.freeze([
  { value: "TR", label: "Turkey (TR)" },
  { value: "US", label: "United States (US)" },
  { value: "GB", label: "United Kingdom (GB)" },
  { value: "DE", label: "Germany (DE)" },
  { value: "FR", label: "France (FR)" },
  { value: "ES", label: "Spain (ES)" },
  { value: "IT", label: "Italy (IT)" },
  { value: "RU", label: "Russia (RU)" },
  { value: "JP", label: "Japan (JP)" },
  { value: "KR", label: "South Korea (KR)" },
  { value: "CN", label: "China (CN)" },
  { value: "IN", label: "India (IN)" },
  { value: "BR", label: "Brazil (BR)" },
  { value: "PT", label: "Portugal (PT)" },
  { value: "NL", label: "Netherlands (NL)" },
  { value: "SE", label: "Sweden (SE)" },
  { value: "PL", label: "Poland (PL)" },
  { value: "UA", label: "Ukraine (UA)" },
  { value: "MX", label: "Mexico (MX)" },
  { value: "CA", label: "Canada (CA)" },
  { value: "AU", label: "Australia (AU)" }
]);

function normalizeTrailerCount(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_TRAILER_COUNT;
  return Math.min(MAX_TRAILER_COUNT, Math.max(1, parsed));
}

function normalizeRegionMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "global") return "global";
  return "custom";
}

function normalizeFallbackMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "none" || mode === "global") return mode;
  return "custom";
}

function normalizeCustomRegion(value) {
  const region = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 2);
  return region.length === 2 ? region : "";
}

function normalizeLanguageSetting(value) {
  const raw = String(value || "").trim();
  if (!raw) return "auto";
  if (raw.toLowerCase() === "auto") return "auto";
  const exact = CINEMA_PREROLL_LANGUAGE_OPTIONS.find((entry) => entry.value === raw);
  if (exact) return exact.value;
  return "auto";
}

function inferRegionFromConfig(config = {}) {
  const languageSetting = normalizeLanguageSetting(config?.cinemaPreRollLanguage);
  const fallbackLanguage = (
    typeof navigator !== "undefined" && navigator.language
      ? navigator.language
      : "en-US"
  );
  const language = String(
    languageSetting === "auto"
      ? (config?.defaultLanguage || fallbackLanguage)
      : languageSetting
  ).replace("_", "-");
  const match = language.match(/-([A-Za-z]{2})$/);
  return normalizeCustomRegion(match?.[1]) || "TR";
}

function regionOptionsWithCurrent(currentRegion) {
  const normalized = normalizeCustomRegion(currentRegion);
  if (!normalized || CINEMA_PREROLL_REGION_OPTIONS.some((entry) => entry.value === normalized)) {
    return CINEMA_PREROLL_REGION_OPTIONS;
  }
  return [
    ...CINEMA_PREROLL_REGION_OPTIONS,
    { value: normalized, label: `${normalized} (${normalized})` }
  ];
}

function createDescriptionText(text) {
  const description = document.createElement("div");
  description.className = "description-text cinema-preroll-field-note";
  description.textContent = text;
  return description;
}

function appendDescriptionText(parent, text) {
  const value = String(text || "").trim();
  if (!value) return null;
  const description = createDescriptionText(value);
  parent.appendChild(description);
  return description;
}

export function createCinemaPreRollPanel(config, labels) {
  const panel = document.createElement("div");
  panel.id = "cinema-preroll-panel";
  panel.className = "settings-panel";

  const section = createSection(labels.cinemaPreRollTab || "Sinema Ön Gösterimleri");

  const enableCheckbox = createCheckbox(
    "cinemaPreRollEnabled",
    labels.cinemaPreRollEnabled || "Film/dizi başlamadan önce vizyondaki fragmanları oynat",
    config.cinemaPreRollEnabled === true
  );
  section.appendChild(enableCheckbox);
  appendDescriptionText(
    section,
    labels.cinemaPreRollDescription ||
      "TMDb vizyondaki içerik listesinden fragmanlar seçilir ve asıl içerikten önce sinema ön gösterimi gibi oynatılır."
  );
  appendDescriptionText(
    section,
    labels.cinemaPreRollHint ||
      "Bu özelliğin çalışabilmesi için MonWUI Ayarları sekmesinde geçerli bir TMDb API anahtarı tanımlanmış olmalıdır."
  );

  const subOptions = document.createElement("div");
  subOptions.className = "sub-options cinema-preroll-sub-options";

  const countRow = document.createElement("div");
  countRow.className = "fsetting-item";

  const countLabel = document.createElement("label");
  countLabel.className = "settings-label";
  countLabel.htmlFor = "cinemaPreRollTrailerCount";
  countLabel.textContent = labels.cinemaPreRollTrailerCount || "Oynatılacak fragman sayısı";

  const countSelect = document.createElement("select");
  countSelect.id = "cinemaPreRollTrailerCount";
  countSelect.name = "cinemaPreRollTrailerCount";
  countSelect.className = "settings-select";

  const currentCount = normalizeTrailerCount(config.cinemaPreRollTrailerCount);
  for (let value = 1; value <= MAX_TRAILER_COUNT; value += 1) {
    const option = document.createElement("option");
    option.value = String(value);
    option.textContent = `${value}`;
    option.selected = currentCount === value;
    countSelect.appendChild(option);
  }

  countRow.append(countLabel, countSelect);
  subOptions.appendChild(countRow);

  const fullscreenCheckbox = createCheckbox(
    "cinemaPreRollStartFullscreen",
    labels.cinemaPreRollStartFullscreen || "Ön gösterimleri mümkün olduğunda tam ekran başlat",
    config.cinemaPreRollStartFullscreen === true
  );
  subOptions.appendChild(fullscreenCheckbox);
  appendDescriptionText(
    subOptions,
    labels.cinemaPreRollStartFullscreenHint ||
      "Desteklenen tarayıcılarda ön gösterim oynatıcısı otomatik olarak tam ekran moduna geçmeyi dener. Bazı cihazlarda ilk dokunuş gerekebilir."
  );

  const languageRow = document.createElement("div");
  languageRow.className = "fsetting-item";

  const languageLabel = document.createElement("label");
  languageLabel.className = "settings-label";
  languageLabel.htmlFor = "cinemaPreRollLanguage";
  languageLabel.textContent =
    labels.cinemaPreRollLanguage || "TMDb dili";

  const languageSelect = document.createElement("select");
  languageSelect.id = "cinemaPreRollLanguage";
  languageSelect.name = "cinemaPreRollLanguage";
  languageSelect.className = "settings-select";

  const currentLanguage = normalizeLanguageSetting(config.cinemaPreRollLanguage);
  CINEMA_PREROLL_LANGUAGE_OPTIONS.forEach((entry) => {
    const option = document.createElement("option");
    option.value = entry.value;
    option.textContent =
      entry.value === "auto"
        ? (labels.cinemaPreRollLanguageAuto || "Otomatik - Eklenti / tarayıcı dilini kullan")
        : entry.label;
    option.selected = currentLanguage === entry.value;
    languageSelect.appendChild(option);
  });

  languageRow.append(languageLabel, languageSelect);
  subOptions.appendChild(languageRow);
  appendDescriptionText(
    subOptions,
    labels.cinemaPreRollLanguageHint ||
      "Bu alan TMDb başlık, açıklama ve fragman havuzunun dilini belirler."
  );

  const regionModeRow = document.createElement("div");
  regionModeRow.className = "fsetting-item";

  const regionModeLabel = document.createElement("label");
  regionModeLabel.className = "settings-label";
  regionModeLabel.htmlFor = "cinemaPreRollRegionMode";
  regionModeLabel.textContent =
    labels.cinemaPreRollRegionMode || "TMDb bölge modu";

  const regionModeSelect = document.createElement("select");
  regionModeSelect.id = "cinemaPreRollRegionMode";
  regionModeSelect.name = "cinemaPreRollRegionMode";
  regionModeSelect.className = "settings-select";

  const currentRegionMode = normalizeRegionMode(config.cinemaPreRollRegionMode);
  [
    {
      value: "global",
      label: labels.cinemaPreRollRegionModeGlobal || "Küresel - TMDb'ye bölge göndermeden kullan"
    },
    {
      value: "custom",
      label: labels.cinemaPreRollRegionModeCustom || "Ülke seç - Aşağıdaki ülkeyi kullan"
    }
  ].forEach((entry) => {
    const option = document.createElement("option");
    option.value = entry.value;
    option.textContent = entry.label;
    option.selected = currentRegionMode === entry.value;
    regionModeSelect.appendChild(option);
  });

  regionModeRow.append(regionModeLabel, regionModeSelect);
  subOptions.appendChild(regionModeRow);
  appendDescriptionText(
    subOptions,
    labels.cinemaPreRollRegionModeHint ||
      "Küresel modda TMDb isteğine bölge parametresi eklenmez. Ülke modunda yalnızca seçilen ülkenin vizyon ve gelecek listeleri kullanılır."
  );

  const customRegionRow = document.createElement("div");
  customRegionRow.className = "fsetting-item cinema-preroll-custom-region-row";

  const customRegionLabel = document.createElement("label");
  customRegionLabel.className = "settings-label";
  customRegionLabel.htmlFor = "cinemaPreRollCustomRegion";
  customRegionLabel.textContent =
    labels.cinemaPreRollCustomRegion || "TMDb ülkesi";

  const customRegionSelect = document.createElement("select");
  customRegionSelect.id = "cinemaPreRollCustomRegion";
  customRegionSelect.name = "cinemaPreRollCustomRegion";
  customRegionSelect.className = "settings-select";

  const currentRegion = normalizeCustomRegion(config.cinemaPreRollCustomRegion) || inferRegionFromConfig(config);
  regionOptionsWithCurrent(currentRegion).forEach((entry) => {
    const option = document.createElement("option");
    option.value = entry.value;
    option.textContent = entry.label;
    option.selected = currentRegion === entry.value;
    customRegionSelect.appendChild(option);
  });

  customRegionRow.append(customRegionLabel, customRegionSelect);
  subOptions.appendChild(customRegionRow);
  const customRegionHint = appendDescriptionText(
    subOptions,
    labels.cinemaPreRollCustomRegionHint ||
      "Ön gösterim havuzunun hangi ülkenin vizyon ve gelecek listelerinden besleneceğini seçer. Ayar değiştiğinde önbellek yeni ülkeye göre yenilenir."
  );

  const fallbackModeRow = document.createElement("div");
  fallbackModeRow.className = "fsetting-item";

  const fallbackModeLabel = document.createElement("label");
  fallbackModeLabel.className = "settings-label";
  fallbackModeLabel.htmlFor = "cinemaPreRollFallbackMode";
  fallbackModeLabel.textContent =
    labels.cinemaPreRollFallbackMode || "Eksik fragmanları tamamlama";

  const fallbackModeSelect = document.createElement("select");
  fallbackModeSelect.id = "cinemaPreRollFallbackMode";
  fallbackModeSelect.name = "cinemaPreRollFallbackMode";
  fallbackModeSelect.className = "settings-select";

  const currentFallbackMode = normalizeFallbackMode(config.cinemaPreRollFallbackMode);
  [
    {
      value: "custom",
      label: labels.cinemaPreRollFallbackModeCustom || "Seçilen ülkeyle tamamla"
    },
    {
      value: "global",
      label: labels.cinemaPreRollFallbackModeGlobal || "Global listeyle tamamla"
    },
    {
      value: "none",
      label: labels.cinemaPreRollFallbackModeNone || "Tamamlama kullanma"
    }
  ].forEach((entry) => {
    const option = document.createElement("option");
    option.value = entry.value;
    option.textContent = entry.label;
    option.selected = currentFallbackMode === entry.value;
    fallbackModeSelect.appendChild(option);
  });

  fallbackModeRow.append(fallbackModeLabel, fallbackModeSelect);
  subOptions.appendChild(fallbackModeRow);
  appendDescriptionText(
    subOptions,
    labels.cinemaPreRollFallbackModeHint ||
      "Seçilen ülke 150 fragmanlık havuzu dolduramazsa kalan adayların hangi kaynaktan alınacağını belirler."
  );

  const fallbackRegionRow = document.createElement("div");
  fallbackRegionRow.className = "fsetting-item cinema-preroll-fallback-region-row";

  const fallbackRegionLabel = document.createElement("label");
  fallbackRegionLabel.className = "settings-label";
  fallbackRegionLabel.htmlFor = "cinemaPreRollFallbackRegion";
  fallbackRegionLabel.textContent =
    labels.cinemaPreRollFallbackRegion || "Tamamlama ülkesi";

  const fallbackRegionSelect = document.createElement("select");
  fallbackRegionSelect.id = "cinemaPreRollFallbackRegion";
  fallbackRegionSelect.name = "cinemaPreRollFallbackRegion";
  fallbackRegionSelect.className = "settings-select";

  const currentFallbackRegion = normalizeCustomRegion(config.cinemaPreRollFallbackRegion) || "US";
  regionOptionsWithCurrent(currentFallbackRegion).forEach((entry) => {
    const option = document.createElement("option");
    option.value = entry.value;
    option.textContent = entry.label;
    option.selected = currentFallbackRegion === entry.value;
    fallbackRegionSelect.appendChild(option);
  });

  fallbackRegionRow.append(fallbackRegionLabel, fallbackRegionSelect);
  subOptions.appendChild(fallbackRegionRow);
  const fallbackRegionHint = appendDescriptionText(
    subOptions,
    labels.cinemaPreRollFallbackRegionHint ||
      "US yerine hangi ülkenin vizyon ve gelecek listelerinin yedek kaynak olarak kullanılacağını seçer."
  );
  section.appendChild(subOptions);

  const updateCustomRegionState = () => {
    const enabled = normalizeRegionMode(regionModeSelect.value) === "custom";
    customRegionRow.style.display = enabled ? "" : "none";
    if (customRegionHint) customRegionHint.style.display = enabled ? "" : "none";
    customRegionSelect.disabled = !enabled;
  };
  updateCustomRegionState();
  regionModeSelect.addEventListener("change", updateCustomRegionState);

  const updateFallbackRegionState = () => {
    const enabled = normalizeFallbackMode(fallbackModeSelect.value) === "custom";
    fallbackRegionRow.style.display = enabled ? "" : "none";
    if (fallbackRegionHint) fallbackRegionHint.style.display = enabled ? "" : "none";
    fallbackRegionSelect.disabled = !enabled;
  };
  updateFallbackRegionState();
  fallbackModeSelect.addEventListener("change", updateFallbackRegionState);

  bindCheckboxKontrol("#cinemaPreRollEnabled", ".cinema-preroll-sub-options");

  panel.appendChild(section);
  return panel;
}
