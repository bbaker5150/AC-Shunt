/**
 * Single-file session export: styled Excel workbook (ExcelJS) —
 * AC–DC summary and raw readings (long format).
 */
import axios from "axios";
import ExcelJS from "exceljs";
import { API_BASE_URL } from "../../constants/constants";

const READING_TYPES = [
  { label: "AC Open", value: "ac_open_readings" },
  { label: "DC+", value: "dc_pos_readings" },
  { label: "DC-", value: "dc_neg_readings" },
  { label: "AC Close", value: "ac_close_readings" },
];

const READING_KEY_NAMES = [
  "std_ac_open_readings",
  "std_dc_pos_readings",
  "std_dc_neg_readings",
  "std_ac_close_readings",
  "ti_ac_open_readings",
  "ti_dc_pos_readings",
  "ti_dc_neg_readings",
  "ti_ac_close_readings",
];

const FREQ_LABELS = new Map([
  [10, "10 Hz"],
  [20, "20 Hz"],
  [50, "50 Hz"],
  [60, "60 Hz"],
  [100, "100 Hz"],
  [200, "200 Hz"],
  [500, "500 Hz"],
  [1000, "1 kHz"],
  [2000, "2 kHz"],
  [5000, "5 kHz"],
  [10000, "10 kHz"],
  [20000, "20 kHz"],
  [50000, "50 kHz"],
  [100000, "100 kHz"],
]);

/* Modern neutral palette (slate / sky / warm accent) */
const HDR_FILL = "FF1E293B";
const HDR_TXT = "FFF8FAFC";
const TITLE_COLOR = "FF0F172A";
const MUTED_TEXT = "FF64748B";
const SUBHDR_UUT_BG = "FFE0F2FE";
const SUBHDR_UUT_TXT = "FF0369A1";
const SUBHDR_STD_BG = "FFFFF7ED";
const SUBHDR_STD_TXT = "FFC2410C";
const ZEBRA = "FFF8FAFC";
const BORDER = "FFE2E8F0";
const TITLE_BAND = "FFF8FAFC";
const TAB_SUMMARY = "FF475569";
const TAB_RAW = "FF6366F1";

function formatFrequency(value) {
  const n = typeof value === "string" ? Number(value) : value;
  return FREQ_LABELS.get(n) || `${n} Hz`;
}

/** Same pairing as App.js uniqueTestPoints — one row per current×frequency. */
function mergeApiPointsToUniqueTestPoints(apiPoints) {
  if (!Array.isArray(apiPoints)) return [];
  const pointMap = new Map();
  apiPoints.forEach((point) => {
    const key = `${point.current}-${point.frequency}`;
    if (!pointMap.has(key)) {
      pointMap.set(key, {
        key,
        current: point.current,
        frequency: point.frequency,
        forward: null,
        reverse: null,
      });
    }
    const entry = pointMap.get(key);
    if (point.direction === "Forward") entry.forward = point;
    else if (point.direction === "Reverse") entry.reverse = point;
  });
  return Array.from(pointMap.values());
}

/**
 * Merge F+R raw arrays for Combined. Only readings are required; results are optional
 * (export used to skip Combined entirely when results were missing).
 */
function buildCombinedReadingsAndResults(pt) {
  const { forward, reverse } = pt;
  if (!forward?.readings || !reverse?.readings) {
    return null;
  }
  const combinedReadings = {};
  READING_KEY_NAMES.forEach((key) => {
    combinedReadings[key] = [
      ...(forward.readings[key] || []),
      ...(reverse.readings[key] || []),
    ];
  });
  const combinedResults = {};
  if (forward?.results && reverse?.results) {
    READING_KEY_NAMES.forEach((key) => {
      const readings = combinedReadings[key]
        .filter((r) => r.is_stable !== false)
        .map((r) => (typeof r === "object" ? r.value : r));
      if (readings.length > 0) {
        const sum = readings.reduce((a, b) => a + b, 0);
        combinedResults[key.replace("_readings", "_avg")] = sum / readings.length;
        const stddevKey = key.replace("_readings", "_stddev");
        const sf = forward.results?.[stddevKey];
        const sr = reverse.results?.[stddevKey];
        if (typeof sf === "number" && typeof sr === "number") {
          combinedResults[stddevKey] = (sf + sr) / 2;
        }
      }
    });
    combinedResults.delta_uut_ppm = forward.results.delta_uut_ppm_avg;
  }
  return { readings: combinedReadings, results: combinedResults };
}

function getExportBundleForDirection(pt, direction) {
  if (!pt) return null;
  if (direction === "Combined") {
    return buildCombinedReadingsAndResults(pt);
  }
  const point = direction === "Forward" ? pt.forward : pt.reverse;
  if (!point?.readings) return null;
  return { readings: point.readings, results: point.results || null };
}

function calcFullyCorrectedStandard(results) {
  if (!results) return null;
  const dcPos = results.std_dc_pos_avg;
  const dcNeg = results.std_dc_neg_avg;
  const acOpen = results.std_ac_open_avg;
  const acClose = results.std_ac_close_avg;
  if (dcPos == null || dcNeg == null || acOpen == null || acClose == null)
    return null;
  const vDc = (Math.abs(dcPos) + Math.abs(dcNeg)) / 2;
  const vAc = (Math.abs(acOpen) + Math.abs(acClose)) / 2;
  const eta = results.eta_std || 1;
  const delta_std_known =
    results.delta_std_known != null ? Number(results.delta_std_known) : 0;
  const delta_std_tvc = results.delta_std != null ? Number(results.delta_std) : 0;
  const term_STD = ((vAc - vDc) * 1000000) / (eta * vDc);
  return term_STD + delta_std_known + delta_std_tvc;
}

function thinBorder() {
  return {
    top: { style: "thin", color: { argb: BORDER } },
    left: { style: "thin", color: { argb: BORDER } },
    bottom: { style: "thin", color: { argb: BORDER } },
    right: { style: "thin", color: { argb: BORDER } },
  };
}

function styleDataRow(row, isAlt, colCount) {
  row.eachCell({ includeEmpty: true }, (cell, col) => {
    if (col > colCount) return;
    cell.border = thinBorder();
    cell.font = { name: "Calibri", size: 11, color: { argb: TITLE_COLOR } };
    if (isAlt) {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: ZEBRA },
      };
    }
  });
}

function coerceSampleValue(raw) {
  if (raw === null || raw === undefined) return "";
  const n = Number(raw);
  return Number.isFinite(n) ? n : String(raw);
}

/** Local wall-clock time, easy to read in Excel (not ISO-8601). */
function formatSampleTimestamp(ts) {
  if (ts == null || ts === "") return "";
  const n = Number(ts);
  if (!Number.isFinite(n)) return "";
  const ms = n < 1e12 ? n * 1000 : n;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (x) => String(x).padStart(2, "0");
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const mon = months[d.getMonth()];
  const day = d.getDate();
  const year = d.getFullYear();
  const h = d.getHours();
  const m = d.getMinutes();
  const s = d.getSeconds();
  return `${mon} ${day}, ${year}  ${pad(h)}:${pad(m)}:${pad(s)}`;
}

function collectRawRows(uniqueTestPoints) {
  const rows = [];
  const directions = ["Forward", "Reverse", "Combined"];

  for (const pt of uniqueTestPoints) {
    const freqLabel = formatFrequency(pt.frequency);
    const currentDisp =
      pt.current != null && pt.current !== ""
        ? Number(pt.current)
        : pt.current;
    for (const dir of directions) {
      const bundle = getExportBundleForDirection(pt, dir);
      if (!bundle?.readings) continue;

      for (const inst of ["std", "ti"]) {
        const prefix = inst === "std" ? "std_" : "ti_";
        const instLabel = inst === "std" ? "Standard" : "UUT";
        for (const rt of READING_TYPES) {
          const key = `${prefix}${rt.value}`;
          const arr = bundle.readings[key] || [];
          arr.forEach((sample, i) => {
            const p =
              typeof sample === "object" && sample !== null
                ? sample
                : { value: sample, is_stable: true, timestamp: null };
            const ts = p.timestamp;
            const timeLabel =
              ts != null && ts !== "" ? formatSampleTimestamp(ts) : "";
            rows.push({
              current_a: Number.isFinite(Number(currentDisp))
                ? Number(currentDisp)
                : pt.current,
              frequency: freqLabel,
              direction: dir,
              instrument: instLabel,
              channel: rt.label,
              sample: i + 1,
              value_v: coerceSampleValue(p.value),
              stable: p.is_stable !== false ? "Yes" : "No",
              timestamp_local: timeLabel,
            });
          });
        }
      }
    }
  }
  return rows;
}

function safeFileName(name) {
  const base = name
    ? name.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "")
    : "Session";
  return base.slice(0, 80) || "Session";
}

function applyHeaderRow(row, colCount) {
  row.height = 26;
  row.eachCell({ includeEmpty: true }, (cell, col) => {
    if (col > colCount) return;
    cell.font = {
      bold: true,
      color: { argb: HDR_TXT },
      size: 10,
      name: "Calibri",
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: HDR_FILL },
    };
    cell.border = thinBorder();
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: false,
    };
  });
}

function applySectionBar(cell, label, bgArgb, fgArgb) {
  cell.value = label;
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: bgArgb },
  };
  cell.font = {
    bold: true,
    size: 11,
    color: { argb: fgArgb },
    name: "Calibri",
  };
  cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
}

/**
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export async function downloadFullSessionExcel({
  uniqueTestPoints,
  sessionName,
  sessionId,
}) {
  let points = uniqueTestPoints;
  if (sessionId) {
    try {
      const { data } = await axios.get(
        `${API_BASE_URL}/calibration_sessions/${sessionId}/test_points/`
      );
      const list = data?.test_points;
      if (Array.isArray(list) && list.length > 0) {
        points = mergeApiPointsToUniqueTestPoints(list);
      }
    } catch {
      /* use in-memory points */
    }
  }

  if (!points || points.length === 0) {
    return { ok: false, error: "No test points to export." };
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AC Shunt Calibration";
  workbook.created = new Date();

  // ----- AC–DC Summary -----
  const sumSheet = workbook.addWorksheet("AC_DC_Summary", {
    properties: { tabColor: { argb: TAB_SUMMARY } },
    views: [{ showGridLines: false, state: "frozen", ySplit: 4, activeCell: "A5" }],
  });
  sumSheet.mergeCells("A1:E1");
  const sumTitle = sumSheet.getCell("A1");
  sumTitle.value = "AC–DC difference summary (ppm)";
  sumTitle.font = {
    size: 16,
    bold: true,
    color: { argb: TITLE_COLOR },
    name: "Calibri",
  };
  sumTitle.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: TITLE_BAND },
  };
  sumTitle.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  sumTitle.border = {
    bottom: { style: "medium", color: { argb: "FFCBD5E1" } },
  };
  sumSheet.getRow(1).height = 34;
  sumSheet.getRow(2).height = 6;

  sumSheet.mergeCells("A3:E3");
  applySectionBar(
    sumSheet.getCell("A3"),
    "Test instrument (UUT)",
    SUBHDR_UUT_BG,
    SUBHDR_UUT_TXT
  );
  sumSheet.getRow(3).height = 26;

  const hdrUut = sumSheet.getRow(4);
  hdrUut.values = [
    "Current (A)",
    "Frequency",
    "Forward",
    "Reverse",
    "Combined",
  ];
  applyHeaderRow(hdrUut, 5);

  let r = 5;
  const SUM_COLS = 5;
  points.forEach((pt, idx) => {
    const row = sumSheet.getRow(r);
    const tiFwd = pt.forward?.results?.delta_uut_ppm;
    const tiRev = pt.reverse?.results?.delta_uut_ppm;
    const tiComb = pt.forward?.results?.delta_uut_ppm_avg;
    row.values = [
      Number(pt.current),
      formatFrequency(pt.frequency),
      tiFwd != null ? parseFloat(tiFwd) : null,
      tiRev != null ? parseFloat(tiRev) : null,
      tiComb != null ? parseFloat(tiComb) : null,
    ];
    row.getCell(1).numFmt = "0.###";
    row.getCell(2).alignment = { horizontal: "left" };
    [3, 4, 5].forEach((c) => {
      const cell = row.getCell(c);
      if (cell.value != null && cell.value !== "") {
        cell.numFmt = "0.000";
        cell.alignment = { horizontal: "right" };
      } else {
        cell.value = "—";
        cell.alignment = { horizontal: "center" };
      }
    });
    styleDataRow(row, idx % 2 === 1, SUM_COLS);
    r += 1;
  });

  r += 1;
  sumSheet.mergeCells(`A${r}:E${r}`);
  applySectionBar(
    sumSheet.getCell(`A${r}`),
    "Standard",
    SUBHDR_STD_BG,
    SUBHDR_STD_TXT
  );
  sumSheet.getRow(r).height = 26;
  r += 1;

  const hdrStd = sumSheet.getRow(r);
  hdrStd.values = ["Current (A)", "Frequency", "Forward", "Reverse", "Combined"];
  applyHeaderRow(hdrStd, 5);
  r += 1;

  points.forEach((pt, idx) => {
    const row = sumSheet.getRow(r);
    const stdFwd = calcFullyCorrectedStandard(pt.forward?.results);
    const stdRev = calcFullyCorrectedStandard(pt.reverse?.results);
    let stdComb = null;
    if (stdFwd != null && stdRev != null) {
      stdComb = (stdFwd + stdRev) / 2;
    }
    row.values = [
      Number(pt.current),
      formatFrequency(pt.frequency),
      stdFwd,
      stdRev,
      stdComb,
    ];
    row.getCell(1).numFmt = "0.###";
    row.getCell(2).alignment = { horizontal: "left" };
    [3, 4, 5].forEach((c) => {
      const cell = row.getCell(c);
      if (cell.value != null && cell.value !== "") {
        cell.numFmt = "0.000";
        cell.alignment = { horizontal: "right" };
      } else {
        cell.value = "—";
        cell.alignment = { horizontal: "center" };
      }
    });
    styleDataRow(row, idx % 2 === 1, SUM_COLS);
    r += 1;
  });

  [1, 2, 3, 4, 5].forEach((i) => {
    sumSheet.getColumn(i).width = i === 2 ? 16 : 14;
  });

  // ----- Raw readings -----
  const raw = workbook.addWorksheet("Raw_readings", {
    properties: { tabColor: { argb: TAB_RAW } },
  });
  const rawRows = collectRawRows(points);
  const RAW_COLS = 9;

  raw.mergeCells("A1:I1");
  const rawTitle = raw.getCell("A1");
  rawTitle.value = "Raw voltage samples";
  rawTitle.font = {
    size: 16,
    bold: true,
    color: { argb: TITLE_COLOR },
    name: "Calibri",
  };
  rawTitle.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: TITLE_BAND },
  };
  rawTitle.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  rawTitle.border = {
    bottom: { style: "medium", color: { argb: "FFCBD5E1" } },
  };
  raw.getRow(1).height = 32;

  raw.mergeCells("A2:I2");
  raw.getCell("A2").value =
    "One row per sample · Combined = Forward + Reverse concatenated · Filter on row 3 · Timestamps are local time";
  raw.getCell("A2").font = {
    size: 10,
    color: { argb: MUTED_TEXT },
    name: "Calibri",
  };
  raw.getCell("A2").alignment = { wrapText: true, vertical: "top" };
  raw.getRow(2).height = 38;

  const rawHeaders = [
    "Current (A)",
    "Frequency",
    "Direction",
    "Instrument",
    "Channel",
    "Sample #",
    "Value (V)",
    "Stable",
    "Timestamp (local)",
  ];
  const hdrRow = raw.getRow(3);
  hdrRow.values = rawHeaders;
  applyHeaderRow(hdrRow, RAW_COLS);

  const headerRowIndex = 3;
  if (rawRows.length === 0) {
    raw.mergeCells("A4:I6");
    raw.getCell("A4").value =
      "No raw samples were exported. Typical causes: readings not yet saved for this session, or the API returned test points without nested readings. Try again after data has been captured, or verify the session on the server.";
    raw.getCell("A4").alignment = { wrapText: true, vertical: "top" };
    raw.getCell("A4").font = {
      size: 11,
      color: { argb: "FFBE123C" },
      name: "Calibri",
    };
    raw.getCell("A4").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFF1F2" },
    };
    raw.getRow(4).height = 72;
  } else {
    rawRows.forEach((row, idx) => {
      const excelRow = raw.addRow([
        row.current_a,
        row.frequency,
        row.direction,
        row.instrument,
        row.channel,
        row.sample,
        row.value_v,
        row.stable,
        row.timestamp_local,
      ]);
      excelRow.getCell(1).numFmt = "0.###";
      excelRow.getCell(6).numFmt = "0";
      const vCell = excelRow.getCell(7);
      if (typeof row.value_v === "number") {
        vCell.numFmt = "0.00000000";
        vCell.alignment = { horizontal: "right" };
      }
      excelRow.getCell(2).alignment = { horizontal: "left" };
      [3, 4, 5, 8].forEach((c) => {
        excelRow.getCell(c).alignment = { horizontal: "center" };
      });
      excelRow.getCell(9).alignment = { horizontal: "left" };
      styleDataRow(excelRow, idx % 2 === 1, RAW_COLS);
    });
  }

  raw.views = [
    {
      showGridLines: false,
      state: "frozen",
      ySplit: headerRowIndex,
      activeCell: "A4",
    },
  ];
  const lastDataRow = rawRows.length === 0 ? 4 : rawRows.length + headerRowIndex;
  if (lastDataRow > headerRowIndex) {
    raw.autoFilter = {
      from: { row: headerRowIndex, column: 1 },
      to: { row: lastDataRow, column: RAW_COLS },
    };
  }

  raw.getColumn(1).width = 12;
  raw.getColumn(2).width = 12;
  raw.getColumn(3).width = 11;
  raw.getColumn(4).width = 12;
  raw.getColumn(5).width = 12;
  raw.getColumn(6).width = 10;
  raw.getColumn(7).width = 16;
  raw.getColumn(8).width = 8;
  raw.getColumn(9).width = 30;

  const buffer = await workbook.xlsx.writeBuffer();
  const ts = new Date()
    .toISOString()
    .replace(/T/, "_")
    .replace(/\..+/, "")
    .replace(/:/g, "-");
  const filename = `${safeFileName(sessionName)}_${ts}.xlsx`;

  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return { ok: true };
}
