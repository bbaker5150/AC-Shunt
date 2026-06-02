/**
 * Persists previously used session form values (per-field) in localStorage
 * for HTML datalist style suggestions — similar to browser autofill.
 */
const STORAGE_KEY = "acshunt_session_field_history_v1";
const MAX_ITEMS_PER_FIELD = 30;
const MAX_NOTE_LEN = 160;

function loadMap() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveMap(map) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * @param {string} fieldKey
 * @returns {string[]}
 */
export function getHistoryForField(fieldKey) {
  const map = loadMap();
  const list = map[fieldKey];
  return Array.isArray(list) ? list.filter((s) => typeof s === "string" && s.length) : [];
}

function pushValue(fieldKey, value) {
  if (value == null) return;
  let s = String(value).trim();
  if (!s) return;
  if (fieldKey === "notes" && s.length > MAX_NOTE_LEN) {
    s = s.slice(0, MAX_NOTE_LEN);
  }
  const map = loadMap();
  const prev = Array.isArray(map[fieldKey]) ? map[fieldKey] : [];
  const next = [s, ...prev.filter((x) => x !== s)].slice(0, MAX_ITEMS_PER_FIELD);
  map[fieldKey] = next;
  saveMap(map);
}

const FORM_FIELD_KEYS = [
  "sessionName",
  "testInstrument",
  "testInstrumentSerial",
  "standardInstrumentModel",
  "standardInstrumentSerial",
  "standardTvcSerial",
  "testTvcSerial",
  "temperature",
  "humidity",
  "notes",
];

/**
 * @param {Record<string, string>} formData
 */
export function recordSessionFormHistory(formData) {
  for (const key of FORM_FIELD_KEYS) {
    if (Object.prototype.hasOwnProperty.call(formData, key)) {
      pushValue(key, formData[key]);
    }
  }
}

/**
 * Merge history, optional correction-db serials, and dedupe (history first).
 * @param {string[]} history
 * @param {string[]} [extras]
 * @returns {string[]}
 */
export function mergeSuggestions(history, extras = []) {
  const out = [];
  const seen = new Set();
  for (const s of history) {
    if (!s || !String(s).trim()) continue;
    const t = String(s).trim();
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  for (const s of extras) {
    if (s == null) continue;
    const t = String(s).trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}
