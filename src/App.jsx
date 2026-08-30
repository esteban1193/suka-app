import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import {
  fetchActivities, fetchCategories, fetchStartDate, updateStartDate,
  insertActivity, insertActivities, updateActivityFields, deleteActivityById,
  insertCategory, updateCategory, deleteCategoryByKey, reassignEventsCategory,
  syncActivities, syncCategories, uploadMedia,
} from "./lib/activitiesApi";
// xlsx is ~500KB — loaded on demand (only when the template/import buttons are used)
// instead of in the main bundle, via dynamic import() inside the functions that need it.

/* =====================
   Constants & Helpers
   ===================== */
const SLOT_MIN = 15;
const SLOT_PX = 20; // each 15-min slot height (px) — half of the old 30-min/40px, so existing event box heights are unchanged

const generateTimeSlots = () => {
  const slots = [];
  let start = 10 * 60 + 30; // 10:30
  const end = 23 * 60; // 23:00
  while (start < end) {
    const h = Math.floor(start / 60).toString().padStart(2, "0");
    const m = (start % 60).toString().padStart(2, "0");
    slots.push(`${h}:${m}`);
    start += SLOT_MIN;
  }
  return slots;
};
const timeSlots = generateTimeSlots();

const DURATIONS = [30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180]; // 15-min steps, capped at 3 hours

const DEFAULT_CATEGORIES = [
  { key: "general", name: "כללי", color: "#60a5fa" },
  { key: "music", name: "מוזיקה", color: "#34d399" },
  { key: "teaching", name: "הוראה", color: "#fbbf24" },
  { key: "logistics", name: "לוגיסטיקה", color: "#f87171" },
  { key: "other", name: "אחר", color: "#a78bfa" },
];

const STORAGE_KEY = "interactiveScheduler_v2";

const AUDIENCES = [
  { key: "children", name: "ילדים", color: "#38bdf8" },
  { key: "families", name: "משפחות", color: "#fb923c" },
  { key: "adults", name: "מבוגרים", color: "#a3a3a3" },
];
const audienceLabel = (key) => AUDIENCES.find((a) => a.key === key)?.name || key;

// Tailwind's JIT scanner needs full literal class names in the source, so this can't be
// built with a template string like `grid-cols-${n}`.
const GRID_COLS_CLASS = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3" };

const PRICE_GROUPS = [
  { key: "none", label: "ללא מחיר", test: (p) => !p || p <= 0 },
  { key: "low", label: "עד 300 ₪", test: (p) => p > 0 && p <= 300 },
  { key: "mid", label: "301–800 ₪", test: (p) => p > 300 && p <= 800 },
  { key: "high", label: "מעל 800 ₪", test: (p) => p > 800 },
];


const SHOW_PRICES_KEY = "suka_showPrices";
const HOLIDAYS_IL = {
  // 2024 (examples)
  "2024-10-02": "ראש השנה (א׳)",
  "2024-10-03": "ראש השנה (ב׳)",
  "2024-10-11": "ערב יום כיפור",
  "2024-10-12": "יום כיפור",
  "2024-10-16": "ערב סוכות",
  "2024-10-17": "חג סוכות (א׳)",
  "2024-10-24": "הושענא רבה",
  "2024-10-25": "שמיני עצרת / שמחת תורה",
  // 2025 (כולל הדוגמאות שביקשת)
  "2025-04-12": "ערב פסח",
  "2025-04-13": "פסח (א׳)",
  "2025-04-20": "שביעי של פסח",
  "2025-06-02": "ערב שבועות",
  "2025-06-03": "שבועות",
  "2025-10-06": "ערב סוכות",
  "2025-10-07": "חג סוכות (א׳)",
  "2025-10-08": "חוה״מ סוכות",
  "2025-10-09": "חוה״מ סוכות",
  "2025-10-10": "חוה״מ סוכות",
  "2025-10-11": "חוה״מ סוכות",
  "2025-10-12": "חוה״מ סוכות",
  "2025-10-13": "הושענא רבה (ערב שמיני עצרת)",
  "2025-10-14": "שמיני עצרת / שמחת תורה",
  // 2026
  "2026-04-01": "ערב פסח",
  "2026-04-02": "פסח (א׳)",
  "2026-04-08": "שביעי של פסח",
  "2026-05-21": "ערב שבועות",
  "2026-05-22": "שבועות",
  "2026-09-11": "ערב ראש השנה",
  "2026-09-12": "ראש השנה (א׳)",
  "2026-09-13": "ראש השנה (ב׳)",
  "2026-09-20": "ערב יום כיפור",
  "2026-09-21": "יום כיפור",
  "2026-09-25": "ערב סוכות",
  "2026-09-26": "חג סוכות (א׳)",
  "2026-09-27": "חוה״מ סוכות",
  "2026-09-28": "חוה״מ סוכות",
  "2026-09-29": "חוה״מ סוכות",
  "2026-09-30": "חוה״מ סוכות",
  "2026-10-01": "חוה״מ סוכות",
  "2026-10-02": "הושענא רבה",
  "2026-10-03": "שמיני עצרת / שמחת תורה",
  // 2027
  "2027-04-21": "ערב פסח",
  "2027-04-22": "פסח (א׳)",
  "2027-04-28": "שביעי של פסח",
  "2027-06-10": "ערב שבועות",
  "2027-06-11": "שבועות",
  "2027-10-01": "ערב ראש השנה",
  "2027-10-02": "ראש השנה (א׳)",
  "2027-10-03": "ראש השנה (ב׳)",
  "2027-10-10": "ערב יום כיפור",
  "2027-10-11": "יום כיפור",
  "2027-10-15": "ערב סוכות",
  "2027-10-16": "חג סוכות (א׳)",
  "2027-10-17": "חוה״מ סוכות",
  "2027-10-18": "חוה״מ סוכות",
  "2027-10-19": "חוה״מ סוכות",
  "2027-10-20": "חוה״מ סוכות",
  "2027-10-21": "חוה״מ סוכות",
  "2027-10-22": "הושענא רבה",
  "2027-10-23": "שמיני עצרת / שמחת תורה",
};
const getHolidayLabel = (dateKey) => HOLIDAYS_IL[dateKey] || null;

// Column names for the schedule import/template spreadsheet — single source of truth so the
// template writer and the row parser can never drift apart on header text.
const IMPORT_COL = {
  title: "כותרת",
  date: "תאריך (DD/MM/YYYY)",
  time: "שעה (HH:MM)",
  duration: "משך בדקות",
  category: "קטגוריה",
  audiences: "קהל יעד",
  cost1Label: "רכיב עלות 1", cost1Amount: "סכום 1",
  cost2Label: "רכיב עלות 2", cost2Amount: "סכום 2",
  cost3Label: "רכיב עלות 3", cost3Amount: "סכום 3",
  description: "תיאור",
  contact: "איש קשר",
  phone: "טלפון",
  organization: "ארגון",
  confirmed: "סופי (כן/לא)",
};

// Accepts either a real Excel date cell (parsed as a JS Date when the workbook is read with
// cellDates:true) or a plain DD/MM/YYYY-ish text string; returns a "YYYY-MM-DD" key matching
// the `days` array, or null if unparseable.
const parseImportDate = (v) => {
  if (v instanceof Date && !isNaN(v.getTime())) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const str = String(v || "").trim();
  if (!str) return null;
  const m = str.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (!m) return null;
  let [, d, mo, y] = m;
  if (y.length === 2) y = `20${y}`;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
};

function AudienceBadges({ audiences }) {
  if (!Array.isArray(audiences) || audiences.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {audiences.map((k) => (
        <span key={k} className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/70 border border-gray-400">
          {audienceLabel(k)}
        </span>
      ))}
    </div>
  );
}

const CHART_PALETTE = ["#60a5fa", "#34d399", "#fbbf24", "#f87171", "#a78bfa", "#f472b6", "#38bdf8", "#facc15", "#4ade80", "#fb923c"];
const colorForIndex = (i) => CHART_PALETTE[i % CHART_PALETTE.length];

// data: [{ label, value, color }] — renders a CSS conic-gradient pie (no charting library needed)
function PieChart({ data }) {
  const clean = data.filter((d) => d.value > 0);
  const total = clean.reduce((s, d) => s + d.value, 0);
  if (total <= 0) {
    return <div className="text-xs text-gray-500">אין נתונים להצגה</div>;
  }
  let cursor = 0;
  const stops = clean
    .map((d) => {
      const start = cursor;
      cursor += (d.value / total) * 100;
      return `${d.color} ${start}% ${cursor}%`;
    })
    .join(", ");

  return (
    <div className="flex items-center gap-4">
      <div
        className="rounded-full shrink-0"
        style={{ width: 120, height: 120, background: `conic-gradient(${stops})` }}
      />
      <ul className="text-xs space-y-1 flex-1 min-w-0">
        {clean.map((d) => (
          <li key={d.label} className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded shrink-0" style={{ background: d.color }} />
            <span className="flex-1 truncate" title={d.label}>{d.label}</span>
            <span className="text-gray-600 shrink-0">{Math.round((d.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AudienceCheckboxes({ selected, onChange }) {
  const list = Array.isArray(selected) ? selected : [];
  return (
    <div className="flex flex-wrap gap-3">
      {AUDIENCES.map((a) => (
        <label key={a.key} className="text-xs flex items-center gap-1">
          <input
            type="checkbox"
            checked={list.includes(a.key)}
            onChange={(e) => {
              const set = new Set(list);
              if (e.target.checked) set.add(a.key);
              else set.delete(a.key);
              onChange(Array.from(set));
            }}
          />
          {a.name}
        </label>
      ))}
    </div>
  );
}


const safeNumber = (v) => (v === "" || v == null || isNaN(Number(v)) ? "" : Number(v));
const slotIndex = (time) => timeSlots.indexOf(time);
// Pure slot-overlap check, reused by both hasConflict (against live state) and the
// schedule importer (which also needs to check newly-imported rows against each other).
const timeRangeConflicts = (candidate, list) => {
  const startIdx = slotIndex(candidate.time);
  const blocks = Math.ceil(candidate.duration / SLOT_MIN);
  const endIdx = startIdx + blocks;
  return list.some((e) => {
    if (e.id === candidate.id) return false;
    if (!e.placed || e.dayIndex !== candidate.dayIndex) return false;
    const s2 = slotIndex(e.time);
    const e2 = s2 + Math.ceil(e.duration / SLOT_MIN);
    return startIdx < e2 && s2 < endIdx;
  });
};
// Total cost of an event: sum of its cost components, falling back to the legacy single `price`
// field for events saved before cost items existed.
const VAT_RATE = 0.18; // Israel standard VAT — update here if the rate changes

// Safely evaluate a cost item's amount field, which may be a plain number or a simple
// arithmetic formula (e.g. "3000*1.18", optionally prefixed with "="). Only digits,
// whitespace and + - * / ( ) . are allowed — anything else is rejected instead of
// being passed to eval()/Function() unchecked.
const evalFormula = (raw) => {
  if (raw == null) return 0;
  let expr = String(raw).trim();
  if (expr === "") return 0;
  if (expr.startsWith("=")) expr = expr.slice(1).trim();
  if (!/^[0-9+\-*/(). \s]*$/.test(expr)) return NaN;
  try {
    const result = Function(`"use strict"; return (${expr || 0});`)();
    return typeof result === "number" && isFinite(result) ? result : NaN;
  } catch {
    return NaN;
  }
};

// Resolves one cost item to its final ₪ amount: the formula result, plus VAT if the
// item's "כולל מע\"מ+" checkbox is on.
const resolveAmount = (item) => {
  const base = evalFormula(item?.amount);
  if (isNaN(base)) return 0;
  return item?.vat ? base * (1 + VAT_RATE) : base;
};

const eventTotal = (e) => {
  if (Array.isArray(e.costItems) && e.costItems.length > 0) {
    return e.costItems.reduce((sum, ci) => sum + resolveAmount(ci), 0);
  }
  return typeof e.price === "number" ? e.price : 0;
};
// One-time upgrade for events saved before cost items existed: turn a legacy single `price`
// into a proper cost line item so it's visible/editable in the cost breakdown editor.
const migrateEvent = (e) => {
  let out = e;
  if (!(Array.isArray(out.costItems) && out.costItems.length > 0)) {
    if (typeof out.price === "number" && out.price > 0) {
      out = { ...out, costItems: [{ id: `${out.id}-legacy-price`, label: "מחיר", amount: String(out.price), vat: false }] };
    } else if (!Array.isArray(out.costItems)) {
      out = { ...out, costItems: [] };
    }
  }
  // Brief window where images/videos were single fields (imageUrl/videoUrl) instead of arrays —
  // promotes any such legacy value so an old exported JSON from that time still imports cleanly.
  if (!Array.isArray(out.images)) {
    out = { ...out, images: out.imageUrl ? [{ id: `${out.id}-legacy-image`, url: out.imageUrl, forWebsite: false, forSocial: false }] : [] };
  }
  if (!Array.isArray(out.videos)) {
    out = { ...out, videos: out.videoUrl ? [{ id: `${out.id}-legacy-video`, url: out.videoUrl, forWebsite: false, forSocial: false }] : [] };
  }
  return out;
};
const normalizeOrg = (s) => (s && s.trim()) ? s.trim() : "ללא ארגון";
const triggerJsonDownload = (payload, filename) => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
const formatTimestampForFilename = (d) => {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
};
const durationLabel = (m) => {
  if (m < 60) return `${m} דק'`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  const hoursPart = h === 1 ? "שעה" : `${h} שעות`;
  return rem === 0 ? hoursPart : `${hoursPart} ו-${rem} דק'`;
};

function CostItemsEditor({ items, onChange }) {
  const list = Array.isArray(items) ? items : [];
  const total = list.reduce((sum, ci) => sum + resolveAmount(ci), 0);

  const updateItem = (id, patch) => onChange(list.map((ci) => (ci.id === id ? { ...ci, ...patch } : ci)));
  const removeItem = (id) => onChange(list.filter((ci) => ci.id !== id));
  const addItem = () => onChange([...list, { id: Date.now() + Math.random(), label: "", amount: "", vat: false }]);

  return (
    <div>
      {list.map((ci) => {
        const resolved = resolveAmount(ci);
        const invalid = isNaN(evalFormula(ci.amount));
        return (
          <div key={ci.id} className="border rounded p-1.5 mb-1.5">
            <div className="flex items-center gap-1 mb-1">
              <input
                type="text"
                placeholder="רכיב (למשל: אמן)"
                className="border p-1 flex-1 text-sm"
                value={ci.label}
                onChange={(e) => updateItem(ci.id, { label: e.target.value })}
              />
              <button type="button" className="text-red-600 text-xs px-1" onClick={() => removeItem(ci.id)} title="הסר רכיב">✕</button>
            </div>
            <div className="flex items-center gap-1">
              <input
                type="text"
                placeholder="1500 או =3000*1.18"
                className={`border p-1 flex-1 text-sm ${invalid ? "border-red-500" : ""}`}
                value={ci.amount}
                onChange={(e) => updateItem(ci.id, { amount: e.target.value })}
                dir="ltr"
              />
              <label className="text-[11px] flex items-center gap-1 whitespace-nowrap" title={`מוסיף ${Math.round(VAT_RATE * 100)}% על הסכום שהוזן`}>
                <input type="checkbox" checked={!!ci.vat} onChange={(e) => updateItem(ci.id, { vat: e.target.checked })} />
                {`+ מע"מ (${Math.round(VAT_RATE * 100)}%)`}
              </label>
            </div>
            <div className={`text-[11px] mt-0.5 ${invalid ? "text-red-600" : "text-gray-600"}`}>
              {invalid ? "נוסחה לא תקינה" : `= ₪${resolved.toLocaleString()}`}
            </div>
          </div>
        );
      })}
      <button type="button" className="text-xs border rounded px-2 py-1 mb-1" onClick={addItem}>+ הוסף רכיב</button>
      <div className="text-sm font-semibold mt-1">סה"כ: ₪{total.toLocaleString()}</div>
    </div>
  );
}

// Shared "for website / for social" tag checkboxes, used by both images and videos — not
// mutually exclusive, since the same file can serve both purposes.
// Soft aspect-ratio guidance only — no cropping. Website content generally reads better wide
// (banner-style), social feeds better square/portrait. If an uploaded image's actual shape
// (captured at upload time, see readImageDimensions) doesn't roughly match a role it's tagged
// for, a warning is shown so the source photo can be prepared/cropped before using it there.
const RATIO_GUIDANCE = {
  forWebsite: { min: 1.3, max: 2.2, label: "מומלץ תמונה רחבה (יחס כ-16:9)", tooNarrow: "אנכית/צרה מדי", tooWide: "רחבה מדי" },
  forSocial: { min: 0.75, max: 1.05, label: "מומלץ תמונה מרובעת או פורטרט (יחס כ-1:1 עד 4:5)", tooNarrow: "אנכית מדי", tooWide: "רחבה מדי" },
};

function ratioWarning(item, role) {
  if (!item.width || !item.height) return null;
  const ratio = item.width / item.height;
  const g = RATIO_GUIDANCE[role];
  if (ratio >= g.min && ratio <= g.max) return null;
  return ratio > g.max ? g.tooWide : g.tooNarrow;
}

function readImageDimensions(file) {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(objectUrl);
    };
    img.onerror = () => {
      resolve({ width: null, height: null });
      URL.revokeObjectURL(objectUrl);
    };
    img.src = objectUrl;
  });
}

function MediaRoleCheckboxes({ item, onChange }) {
  const websiteWarning = item.forWebsite && ratioWarning(item, "forWebsite");
  const socialWarning = item.forSocial && ratioWarning(item, "forSocial");
  return (
    <div className="text-[11px] mt-1">
      <div className="flex gap-3">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={!!item.forWebsite} onChange={(e) => onChange({ ...item, forWebsite: e.target.checked })} />
          לאתר
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={!!item.forSocial} onChange={(e) => onChange({ ...item, forSocial: e.target.checked })} />
          לרשתות חברתיות
        </label>
      </div>
      {websiteWarning && <div className="text-amber-700 mt-0.5">⚠ {websiteWarning} לאתר — {RATIO_GUIDANCE.forWebsite.label}</div>}
      {socialWarning && <div className="text-amber-700 mt-0.5">⚠ {socialWarning} לרשתות — {RATIO_GUIDANCE.forSocial.label}</div>}
    </div>
  );
}

// Multiple images per activity, each uploaded separately and taggable for website/social use.
function ImagesEditor({ items, onChange }) {
  const list = Array.isArray(items) ? items : [];
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const updateItem = (id, patch) => onChange(list.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const removeItem = (id) => onChange(list.filter((it) => it.id !== id));

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const [url, dims] = await Promise.all([uploadMedia("activity-images", file), readImageDimensions(file)]);
      onChange([...list, { id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, url, forWebsite: false, forSocial: false, width: dims.width, height: dims.height, credit: "" }]);
    } catch (err) {
      setError("שגיאה בהעלאת התמונה: " + err.message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {list.map((item) => (
          <div key={item.id} className="border rounded p-1.5 w-32">
            <div className="relative">
              <img src={item.url} alt="" className="w-full h-20 object-cover rounded" />
              <button
                type="button"
                className="absolute -top-1.5 -right-1.5 bg-red-600 text-white rounded-full w-5 h-5 text-xs leading-5"
                onClick={() => removeItem(item.id)}
                title="הסר תמונה"
              >
                ✕
              </button>
            </div>
            <MediaRoleCheckboxes item={item} onChange={(patch) => updateItem(item.id, patch)} />
            <input
              type="text"
              className="border rounded text-[10px] px-1 py-0.5 w-full mt-1"
              placeholder="קרדיט לצילום"
              title="קרדיט לצלם/ת — יוצג בעיקר באתר"
              value={item.credit || ""}
              onChange={(e) => updateItem(item.id, { credit: e.target.value })}
            />
          </div>
        ))}
      </div>
      <input type="file" accept="image/*" onChange={handleFile} disabled={uploading} className="text-xs block" />
      <div className="text-[10px] text-gray-500 mt-1">💡 {RATIO_GUIDANCE.forWebsite.label} · {RATIO_GUIDANCE.forSocial.label}</div>
      {uploading && <div className="text-xs text-gray-500 mt-1">מעלה...</div>}
      {error && <div className="text-xs text-red-600 mt-1">{error}</div>}
    </div>
  );
}

// Multiple videos per activity — each entry is either a pasted URL (YouTube etc., avoids using
// storage) or an uploaded file, tagged the same way as images.
function VideosEditor({ items, onChange }) {
  const list = Array.isArray(items) ? items : [];
  const [urlInput, setUrlInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const updateItem = (id, patch) => onChange(list.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const removeItem = (id) => onChange(list.filter((it) => it.id !== id));

  const addUrl = () => {
    if (!urlInput.trim()) return;
    onChange([...list, { id: `vid-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, url: urlInput.trim(), forWebsite: false, forSocial: false }]);
    setUrlInput("");
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const url = await uploadMedia("activity-videos", file);
      onChange([...list, { id: `vid-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, url, forWebsite: false, forSocial: false }]);
    } catch (err) {
      setError("שגיאה בהעלאת הוידאו: " + err.message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div>
      {list.map((item) => (
        <div key={item.id} className="border rounded p-1.5 mb-1.5">
          <div className="flex items-center gap-1">
            <a href={item.url} target="_blank" rel="noreferrer" className="text-xs text-blue-700 truncate flex-1" dir="ltr" title={item.url}>
              {item.url}
            </a>
            <button type="button" className="text-red-600 text-xs px-1" onClick={() => removeItem(item.id)} title="הסר">✕</button>
          </div>
          <MediaRoleCheckboxes item={item} onChange={(patch) => updateItem(item.id, patch)} />
        </div>
      ))}
      <div className="flex items-center gap-1 mb-1">
        <input
          type="text"
          placeholder="קישור לוידאו (יוטיוב וכו')"
          className="border p-1 flex-1 text-sm"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          dir="ltr"
        />
        <button type="button" className="text-xs border rounded px-2 py-1" onClick={addUrl}>+ הוסף</button>
      </div>
      <div className="text-xs text-gray-500 mb-1">או העלאת קובץ וידאו (קבצים גדולים עלולים להיכשל בהעלאה):</div>
      <input type="file" accept="video/*" onChange={handleFile} disabled={uploading} className="text-xs block" />
      {uploading && <div className="text-xs text-gray-500 mt-1">מעלה...</div>}
      {error && <div className="text-xs text-red-600 mt-1">{error}</div>}
    </div>
  );
}

function TechRiderEditor({ textValue, fileUrl, onTextChange, onFileChange }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const handleFile = async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const url = await uploadMedia("activity-riders", file);
      onFileChange(url);
    } catch (e) {
      setError("שגיאה בהעלאת הקובץ: " + e.message);
    } finally {
      setUploading(false);
      ev.target.value = "";
    }
  };

  return (
    <div>
      <textarea
        className="border p-1 w-full h-24 mb-2 text-sm"
        placeholder="הכנס טקסט מפרט טכני..."
        value={textValue}
        onChange={(e) => onTextChange(e.target.value)}
        dir="rtl"
      />
      {fileUrl ? (
        <div className="flex items-center gap-2 text-sm mb-1">
          <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">📄 פתח קובץ</a>
          <button type="button" className="text-red-500 text-xs border rounded px-1" onClick={() => onFileChange("")}>הסר</button>
        </div>
      ) : (
        <div>
          <div className="text-xs text-gray-500 mb-1">העלה PDF או Word:</div>
          <input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={handleFile} disabled={uploading} className="text-xs block" />
          {uploading && <div className="text-xs text-gray-500 mt-1">מעלה...</div>}
        </div>
      )}
      {error && <div className="text-xs text-red-600 mt-1">{error}</div>}
    </div>
  );
}

const CHECKER_BG = {
  backgroundImage: "linear-gradient(45deg,#bbb 25%,transparent 25%),linear-gradient(-45deg,#bbb 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#bbb 75%),linear-gradient(-45deg,transparent 75%,#bbb 75%)",
  backgroundSize: "10px 10px",
  backgroundPosition: "0 0,0 5px,5px -5px,-5px 0",
  backgroundColor: "#fff",
};

function LogoEditor({ url, onChange }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const handleFile = async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const uploaded = await uploadMedia("activity-images", file);
      onChange(uploaded);
    } catch (err) {
      setError("שגיאה בהעלאת הלוגו: " + err.message);
    } finally {
      setUploading(false);
      ev.target.value = "";
    }
  };

  return (
    <div>
      {url ? (
        <div className="flex items-start gap-3 mb-2">
          <div className="rounded border p-1 w-24 h-24 flex items-center justify-center" style={CHECKER_BG}>
            <img src={url} alt="לוגו" className="max-w-full max-h-full object-contain" />
          </div>
          <button type="button" className="text-red-500 text-xs border rounded px-2 py-1 mt-1" onClick={() => onChange("")}>הסר לוגו</button>
        </div>
      ) : (
        <div>
          <input type="file" accept="image/png,image/svg+xml,image/*" onChange={handleFile} disabled={uploading} className="text-xs block" />
          <div className="text-[10px] text-gray-500 mt-1">מומלץ: PNG עם רקע שקוף</div>
          {uploading && <div className="text-xs text-gray-500 mt-1">מעלה...</div>}
        </div>
      )}
      {error && <div className="text-xs text-red-600 mt-1">{error}</div>}
    </div>
  );
}

/** Calculate time from Y position inside day column */
const timeFromClientY = (container, clientY) => {
  const rect = container.getBoundingClientRect();
  const y = Math.max(0, Math.min(clientY - rect.top, timeSlots.length * SLOT_PX - 1));
  const idx = Math.floor(y / SLOT_PX);
  return timeSlots[idx];
};

/* =====================
   Component
   ===================== */
export default function InteractiveSchedule({ session, onSignOut }) {
  // UI-only cost privacy: costs/totals are hidden from every signed-in collaborator except this
  // one account. Not a real security boundary — anyone with their own valid session token could
  // still read cost_items straight from the Supabase API — just keeps the numbers out of the
  // interface for everyone but the intended owner.
  const isOwner = session?.user?.email === "esteban@gottfrieds.com";
  const [events, setEvents] = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [newEvent, setNewEvent] = useState({
    confirmed: false,
    dataComplete: false,
    title: "",
    duration: 30,
    costItems: [],
    categoryKey: "general",
    audiences: [],
    description: "",
    summary: "",
    contact: "",
    phone: "",
    organization: "",
    images: [],
    videos: [],
    techRiderText: "",
    techRiderUrl: "",
    logoUrl: "",
  });
  const [draggedEventId, setDraggedEventId] = useState(null);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [conflictMsg, setConflictMsg] = useState("");
  // Transient "saved" confirmation for every cloud write — separate from conflictMsg (which is
  // reused for errors/import summaries and doesn't auto-clear). Added to diagnose a bug where an
  // uploaded image appeared locally but wasn't actually persisted to Supabase: since edit happens
  // inside a full-screen modal (z-50) and conflictMsg only rendered inline in the toolbar
  // underneath it, any error fired while a modal was open was invisible until the modal closed.
  const [cloudFlash, setCloudFlash] = useState(null); // { type: "ok" | "err", msg: string } | null
  const cloudFlashTimerRef = useRef(null);
  const [startDate, setStartDate] = useState(() => {
    const today = new Date("2026-09-25");
    const y = today.getFullYear();
    const m = (today.getMonth() + 1).toString().padStart(2, "0");
    const d = today.getDate().toString().padStart(2, "0");
    return `${y}-${m}-${d}`;
  });
  const [importText, setImportText] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterOrg, setFilterOrg] = useState("all");
  const [filterConfirmed, setFilterConfirmed] = useState("all"); // all | yes | no
  const [filterAudience, setFilterAudience] = useState("all");
  const [sidebarTab, setSidebarTab] = useState("notes"); // "notes" | "library"
  const [libraryGroupBy, setLibraryGroupBy] = useState("category"); // "category" | "audience" | "price"
  const [zoomDay, setZoomDay] = useState(null); // number | null
  const [sumPlacedOnly, setSumPlacedOnly] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [dayColWidthPx, setDayColWidthPx] = useState(176); // adjustable day column width
  const [sidebarWidthPx, setSidebarWidthPx] = useState(320); // resizable sidebar
  const [sidebarPos, setSidebarPos] = useState("left"); // "left" | "right"
  const [notesBankOpen, setNotesBankOpen] = useState(true);
  const [notesBankWidthPx, setNotesBankWidthPx] = useState(320);
  const [notesBankColumns, setNotesBankColumns] = useState(1); // 1 | 2 | 3
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTotalsModal, setShowTotalsModal] = useState(false);
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);
  const [showDuplicatesModal, setShowDuplicatesModal] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState("מתחבר...");
  const [lastRealtimeEvent, setLastRealtimeEvent] = useState("");
  const [backupInProgress, setBackupInProgress] = useState(false);
  const [duplicateIdsToDelete, setDuplicateIdsToDelete] = useState(() => new Set());
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);
  const [autoBackupIntervalMin, setAutoBackupIntervalMin] = useState(10);
  const [lastBackupAt, setLastBackupAt] = useState("");

  // Dual-screen mode: this window is a popped-out notes bank if opened with ?popout=bank
  const isPopout = new URLSearchParams(window.location.search).get("popout") === "bank";
  // The event currently "armed" for placement from the other window (or this one) — click a
  // card to arm it, then click a day/slot to place it, since real drag-and-drop can't cross a
  // browser-window boundary. Synced between windows via BroadcastChannel (see effect below).
  const [armedEventId, setArmedEventId] = useState(null);
  const bcRef = useRef(null);
  useEffect(() => {
    const bc = new BroadcastChannel("suka-app-bank-sync");
    bcRef.current = bc;
    bc.onmessage = (ev) => {
      if (ev.data?.type === "arm") setArmedEventId(ev.data.id);
      else if (ev.data?.type === "clear-armed") setArmedEventId(null);
    };
    return () => bc.close();
  }, []);
  const broadcastArm = (msg) => bcRef.current?.postMessage(msg);
  const armEvent = (id) => {
    setArmedEventId((prev) => {
      const next = prev === id ? null : id;
      broadcastArm({ type: next ? "arm" : "clear-armed", id: next });
      return next;
    });
  };
  const armedEvent = armedEventId ? events.find((e) => e.id === armedEventId) : null;
  const openBankPopout = () => {
    const url = new URL(window.location.href);
    url.search = "?popout=bank";
    window.open(url.toString(), "suka-notes-bank", "width=460,height=900,left=80,top=80");
  };

  // Always-current snapshot for the auto-backup timer (see effect below) — the interval is
  // only re-armed when the interval length changes, not on every keystroke, so its callback
  // must read state via a ref rather than closing over startDate/events/categories directly.
  const backupStateRef = useRef({ startDate, events, categories });
  useEffect(() => {
    backupStateRef.current = { startDate, events, categories };
  }, [startDate, events, categories]);
  const lastBackupSignatureRef = useRef(null);

  const performAutoBackup = () => {
    const payload = backupStateRef.current;
    const signature = JSON.stringify(payload);
    if (signature === lastBackupSignatureRef.current) return; // nothing changed since last backup
    lastBackupSignatureRef.current = signature;
    triggerJsonDownload(payload, `schedule-backup-${formatTimestampForFilename(new Date())}.json`);
    setLastBackupAt(new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }));
  };

  useEffect(() => {
    if (!autoBackupEnabled) return;
    const id = setInterval(performAutoBackup, autoBackupIntervalMin * 60 * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoBackupEnabled, autoBackupIntervalMin]);

  // resizer refs (sidebar)
  const isResizingSidebar = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

  // resizer refs (notes bank)
  const isResizingNotesBank = useRef(false);
  const notesStartX = useRef(0);
  const notesStartW = useRef(0);

  // See the UI-prefs auto-save effect below — skips writing on the effect's very first
  // invocation (fires with default state before the localStorage load effect has applied).
  const isFirstAutoSaveRun = useRef(true);

  // startDate still uses a "watch and save" effect (see below) since it's a single settings
  // value, not a per-row table — this guard skips its first run (default state, before the
  // initial cloud load lands) the same way the UI-prefs auto-save effect does.
  const suppressStartDateSaveRef = useRef(false);
  const isFirstStartDateSyncRun = useRef(true);

  // Cloud writes to `activities`/`categories` are now targeted per action (insertActivity,
  // updateActivityFields, deleteActivityById, etc. — see each mutation function below) rather
  // than a blanket "watch state and save everything" effect, so two people editing at once never
  // clobber each other's unrelated changes. This counter tracks how many such writes are
  // currently in flight; while > 0, an incoming Realtime event is ignored instead of refetching
  // and overwriting local state, which would otherwise revert a not-yet-saved local edit.
  const pendingWritesRef = useRef(0);
  const flashCloudStatus = (type, msg) => {
    clearTimeout(cloudFlashTimerRef.current);
    setCloudFlash({ type, msg });
    // Success auto-clears quickly; errors stay until manually dismissed — an auto-dismissing
    // error is easy to miss if you're not looking at the screen the instant a write fails
    // (e.g. right after adding an event), which is exactly what let a failed insert go unnoticed
    // once before.
    if (type === "ok") {
      cloudFlashTimerRef.current = setTimeout(() => setCloudFlash(null), 3000);
    }
  };

  const runCloudWrite = (fn) => {
    pendingWritesRef.current += 1;
    Promise.resolve()
      .then(fn)
      .then(() => {
        flashCloudStatus("ok", "✓ נשמר בענן");
      })
      .catch((err) => {
        console.error(err);
        const msg = "שגיאה בשמירה לענן: " + err.message;
        setConflictMsg(msg);
        flashCloudStatus("err", msg);
      })
      .finally(() => {
        pendingWritesRef.current -= 1;
      });
  };

  // ===== Resize event (change duration by dragging bottom edge) =====
  const [resizingInfo, setResizingInfo] = useState(null); // { id, startY, originalBlocks, startIdx, dayIndex }
  const [showPrices, setShowPrices] = useState(true);
  // Persist showPrices in localStorage (independent key so it won't break existing storage)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SHOW_PRICES_KEY);
      if (saved !== null) setShowPrices(saved === "1");
    } catch (e) {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SHOW_PRICES_KEY, showPrices ? "1" : "0");
    } catch (e) {}
  }, [showPrices]);


  const computeMaxBlocks = (info) => {
    // Can't extend beyond next event on same day, nor beyond end-of-day.
    let maxEndIdx = timeSlots.length;
    events.forEach((ev) => {
      if (!ev.placed || ev.dayIndex !== info.dayIndex || ev.id === info.id) return;
      const s2 = slotIndex(ev.time);
      if (s2 >= info.startIdx) {
        maxEndIdx = Math.min(maxEndIdx, s2);
      }
    });
    const maxBlocks = Math.max(1, maxEndIdx - info.startIdx);
    return maxBlocks;
  };

  const startResize = (eventObj, clientY) => {
    const startIdx = slotIndex(eventObj.time);
    const originalBlocks = Math.ceil((eventObj.duration || 30) / SLOT_MIN);
    setResizingInfo({
      id: eventObj.id,
      startY: clientY,
      originalBlocks,
      startIdx,
      dayIndex: eventObj.dayIndex,
    });
    document.body.style.userSelect = "none";
    document.body.style.cursor = "ns-resize";
  };

  useEffect(() => {
    const onMove = (e) => {
      if (!resizingInfo) return;
      const dy = e.clientY - resizingInfo.startY;
      let deltaBlocks = Math.round(dy / SLOT_PX);
      let newBlocks = Math.max(1, resizingInfo.originalBlocks + deltaBlocks);
      const maxBlocks = computeMaxBlocks(resizingInfo);
      if (newBlocks > maxBlocks) newBlocks = maxBlocks;
      const newDuration = newBlocks * SLOT_MIN;
      setEvents((prev) => prev.map((ev) => (ev.id === resizingInfo.id ? { ...ev, duration: newDuration } : ev)));
    };
    const onUp = () => {
      if (!resizingInfo) return;
      const finalEvent = events.find((e) => e.id === resizingInfo.id);
      if (finalEvent) runCloudWrite(() => updateActivityFields(resizingInfo.id, { duration: finalEvent.duration }));
      setResizingInfo(null);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [resizingInfo, events]);

  
  // This window's own UI prefs only (panel widths, filters, column layout) — personal to this
  // browser, loaded from localStorage. The actual schedule data (events/categories/startDate)
  // now lives in Supabase; see the cloud load/sync effects below.
  const applyPersistedState = (data) => {
    if (!data || typeof data !== "object") return;
    if (typeof data.sidebarWidthPx === "number") setSidebarWidthPx(data.sidebarWidthPx);
    if (data.sidebarPos === "left" || data.sidebarPos === "right") setSidebarPos(data.sidebarPos);
    if (typeof data.notesBankOpen === "boolean") setNotesBankOpen(data.notesBankOpen);
    if (typeof data.notesBankWidthPx === "number") setNotesBankWidthPx(data.notesBankWidthPx);
    if ([1, 2, 3].includes(data.notesBankColumns)) setNotesBankColumns(data.notesBankColumns);
    if (typeof data.autoBackupEnabled === "boolean") setAutoBackupEnabled(data.autoBackupEnabled);
    if ([5, 10, 15, 30].includes(data.autoBackupIntervalMin)) setAutoBackupIntervalMin(data.autoBackupIntervalMin);
    if (typeof data.dayColWidthPx === "number") setDayColWidthPx(data.dayColWidthPx);
    if (typeof data.sumPlacedOnly === "boolean") setSumPlacedOnly(data.sumPlacedOnly);
    if (typeof data.filterCategory === "string") setFilterCategory(data.filterCategory);
    if (typeof data.filterOrg === "string") setFilterOrg(data.filterOrg);
    if (typeof data.filterConfirmed === "string") setFilterConfirmed(data.filterConfirmed);
    if (typeof data.filterAudience === "string") setFilterAudience(data.filterAudience);
    if (typeof data.searchText === "string") setSearchText(data.searchText);
  };

  // ===== Load this window's UI prefs (once) =====
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) applyPersistedState(JSON.parse(raw));
    } catch (e) {
      console.warn("Failed to load saved UI prefs:", e);
    }
  }, []);

  // ===== Cloud: load schedule data from Supabase (once), then keep it live via Realtime =====
  useEffect(() => {
    (async () => {
      try {
        const [acts, cats, sDate] = await Promise.all([fetchActivities(), fetchCategories(), fetchStartDate()]);
        setEvents(acts.map(migrateEvent));
        setCategories(cats.length > 0 ? cats : DEFAULT_CATEGORIES);
        suppressStartDateSaveRef.current = true;
        setStartDate(sDate);
      } catch (err) {
        console.error(err);
        setConflictMsg("שגיאה בטעינת הנתונים מהענן: " + err.message);
      }
    })();
  }, []);

  // Realtime via "Broadcast from Database": a Postgres trigger (see supabase/003_broadcast_realtime.sql)
  // explicitly broadcasts on every activities/categories write, rather than relying on the
  // classic postgres_changes/logical-replication feed (which connected successfully but never
  // actually delivered an event to any client, for reasons not yet root-caused). Both tables
  // broadcast to the same "schedule-changes" topic; the payload's table name says which to refetch.
  useEffect(() => {
    const channel = supabase
      .channel("schedule-changes", { config: { private: true } })
      .on("broadcast", { event: "*" }, async (msg) => {
        const table = msg.payload?.table;
        setLastRealtimeEvent(`${msg.payload?.operation ?? msg.event} ${table ?? ""} @ ${new Date().toLocaleTimeString("he-IL")}`);
        if (pendingWritesRef.current > 0) return; // a local change is still saving — don't clobber it
        try {
          if (table === "categories") {
            const fresh = await fetchCategories();
            setCategories(fresh.length > 0 ? fresh : DEFAULT_CATEGORIES);
          } else {
            const fresh = await fetchActivities();
            setEvents(fresh.map(migrateEvent));
          }
        } catch (err) {
          console.error("Failed to refresh after realtime broadcast:", err);
        }
      })
      .subscribe((status) => setRealtimeStatus(status));
    return () => { supabase.removeChannel(channel); };
  }, []);

  const catByKey = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.key, c])),
    [categories]
  );

  const orgOptions = useMemo(() => {
    const set = new Set();
    events.forEach((e) => set.add(normalizeOrg(e.organization)));
    return Array.from(set).sort((a,b)=>a.localeCompare(b,'he'));
  }, [events]);

  const days = useMemo(() => {
    const base = new Date(startDate);
    if (isNaN(base.getTime())) return [];
    return Array.from({ length: 9 }, (_, i) => {
      const dt = new Date(base);
      dt.setDate(base.getDate() + i);
      const weekdayLong = dt.toLocaleDateString("he-IL", { weekday: "long" }); // e.g., "יום שני"
      const dateShort = dt.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" }); // e.g., "27/06"
      const dateKey = dt.toISOString().slice(0, 10);
      return { labelTop: weekdayLong, labelBottom: dateShort, dateKey };
    });
  }, [startDate]);

  const hasConflict = (candidate) => {
    if (candidate.dayIndex == null || !candidate.time) return false;
    return timeRangeConflicts(candidate, events);
  };

  const addEvent = () => {
    if (!newEvent.title.trim()) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const created = { ...newEvent, id, placed: false, confirmed: !!newEvent.confirmed, dataComplete: !!newEvent.dataComplete };
    setEvents((prev) => [...prev, created]);
    runCloudWrite(() => insertActivity(created));
    setNewEvent({
      confirmed: false,
      dataComplete: false,
      title: "",
      duration: 30,
      costItems: [],
      categoryKey: newEvent.categoryKey,
      audiences: [],
      description: "",
      summary: "",
      contact: "",
      phone: "",
      organization: "",
      contactPhone: "",
      images: [],
      videos: [],
      techRiderText: "",
      techRiderUrl: "",
    });
  };

  const placeEventExact = (dayIndex, time, idToPlace, copy = false) => {
    setConflictMsg("");
    const evToPlace = idToPlace
      ? events.find((e) => e.id === idToPlace)
      : events.find((e) => !e.placed);
    if (!evToPlace) return;
    const candidate = { ...evToPlace, dayIndex, time, placed: true };
    if (hasConflict(candidate)) {
      setConflictMsg(`התנגשות: כבר יש אירוע בזמן הזה ביום ${dayIndex + 1}.`);
      return;
    }
    if (copy) {
      const clone = { ...candidate, id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}` };
      setEvents((prev) => [...prev, clone]);
      runCloudWrite(() => insertActivity(clone));
    } else {
      setEvents((prev) => prev.map((e) => (e.id === evToPlace.id ? candidate : e)));
      runCloudWrite(() => updateActivityFields(evToPlace.id, { dayIndex, time, placed: true }));
    }
  };

  // absolute position & height
  const boxStyleFor = (e) => {
    const startIdx = slotIndex(e.time);
    const blocks = Math.ceil(e.duration / SLOT_MIN);
    return {
      position: "absolute",
      top: startIdx * SLOT_PX,
      height: blocks * SLOT_PX - 2,
      left: 4,
      right: 4,
      borderRadius: 8,
    };
  };

  // search + filters
  const searchMatch = (e) => {
    const q = searchText.trim().toLowerCase();
    if (!q) return true;
    return [e.title, e.contact, e.contactPhone, e.description, e.organization]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  };
  const matchCategory = (e) => filterCategory === "all" || e.categoryKey === filterCategory;
  const matchOrg = (e) => filterOrg === "all" || normalizeOrg(e.organization) === filterOrg;
  const matchConfirmed = (e) => filterConfirmed === "all" || (filterConfirmed === "yes" && !!e.confirmed) || (filterConfirmed === "no" && !e.confirmed);
  const matchAudience = (e) => filterAudience === "all" || (Array.isArray(e.audiences) && e.audiences.includes(filterAudience));
  const visibleEventsFilter = (e) => matchCategory(e) && matchOrg(e) && matchConfirmed(e) && matchAudience(e) && searchMatch(e);

  // Titles that already have a placed (scheduled) copy — used to flag likely duplicate
  // unplaced notes in the bank (e.g. leftover from the earlier data-recovery import) so they
  // can be reviewed and deleted manually, rather than auto-deleting anything automatically.
  const placedTitles = useMemo(() => {
    const set = new Set();
    events.forEach((e) => { if (e.placed && e.title?.trim()) set.add(e.title.trim()); });
    return set;
  }, [events]);
  const looksLikeDuplicate = (e) => !e.placed && e.title?.trim() && placedTitles.has(e.title.trim());

  // General duplicate-review groups: ALL events (placed or not) sharing an exact (trimmed)
  // title, grouped together for manual review — used by the duplicate-cleanup modal. Deletion
  // is always an explicit, reviewed choice; nothing here deletes anything automatically.
  const buildDuplicateGroups = () => {
    const byTitle = new Map();
    events.forEach((e) => {
      const key = e.title?.trim();
      if (!key) return;
      if (!byTitle.has(key)) byTitle.set(key, []);
      byTitle.get(key).push(e);
    });
    return Array.from(byTitle.entries())
      .filter(([, items]) => items.length > 1)
      .map(([title, items]) => ({ title, items }));
  };

  // Library view: every event (placed + unplaced) that passes the current filters, grouped by category/audience/price
  const buildLibraryGroups = () => {
    const filtered = events.filter(visibleEventsFilter);
    if (libraryGroupBy === "audience") {
      const groups = AUDIENCES.map((a) => ({
        key: a.key,
        label: a.name,
        color: a.color,
        items: filtered.filter((e) => Array.isArray(e.audiences) && e.audiences.includes(a.key)),
      }));
      groups.push({
        key: "none",
        label: "ללא קהל מוגדר",
        color: "#d1d5db",
        items: filtered.filter((e) => !Array.isArray(e.audiences) || e.audiences.length === 0),
      });
      return groups;
    }
    if (libraryGroupBy === "price") {
      return PRICE_GROUPS.map((g) => ({
        key: g.key,
        label: g.label,
        color: "#d1d5db",
        items: filtered.filter((e) => g.test(eventTotal(e))),
      }));
    }
    return categories.map((c) => ({
      key: c.key,
      label: c.name,
      color: c.color,
      items: filtered.filter((e) => (e.categoryKey || "general") === c.key),
    }));
  };


  // ===== Auto-save this window's UI prefs to localStorage on changes =====
  useEffect(() => {
    if (isFirstAutoSaveRun.current) {
      // Skip the very first invocation: it fires with default state, before the "load UI
      // prefs" effect's setters have actually reached a render.
      isFirstAutoSaveRun.current = false;
      return;
    }
    try {
      const payload = {
        sidebarWidthPx,
        sidebarPos,
        notesBankOpen,
        notesBankWidthPx,
        notesBankColumns,
        autoBackupEnabled,
        autoBackupIntervalMin,
        dayColWidthPx,
        sumPlacedOnly,
        filterCategory,
        filterOrg,
        filterConfirmed,
        filterAudience,
        searchText,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn("Failed to save UI prefs:", e);
    }
  }, [sidebarWidthPx, sidebarPos, notesBankOpen, notesBankWidthPx, notesBankColumns, autoBackupEnabled, autoBackupIntervalMin, dayColWidthPx, sumPlacedOnly, filterCategory, filterOrg, filterConfirmed, filterAudience, searchText]);

  // Note: there is deliberately no "watch events/categories and save everything" effect here —
  // each add/edit/delete/place action below calls a targeted per-row Supabase function directly
  // (insertActivity, updateActivityFields, deleteActivityById, etc.) via runCloudWrite, so two
  // people editing at the same time never clobber each other's unrelated changes. syncActivities/
  // syncCategories (full-table reconciliation) are used only by the explicit JSON import/paste
  // actions further down, where replacing the whole dataset really is the intent.

  useEffect(() => {
    if (isFirstStartDateSyncRun.current) { isFirstStartDateSyncRun.current = false; return; }
    if (suppressStartDateSaveRef.current) { suppressStartDateSaveRef.current = false; return; }
    updateStartDate(startDate).catch((err) => {
      console.error(err);
      setConflictMsg("שגיאה בשמירת תאריך ההתחלה לענן: " + err.message);
    });
  }, [startDate]);


  // Export
  const exportJSON = () => {
    triggerJsonDownload({ startDate, events, categories }, "schedule.json");
  };

  
  
  
  const exportCSV = () => {
    // כותרות בעברית
    // Cost columns are omitted entirely for anyone but the owner account — see isOwner.
    const headers = [
      "כותרת","תאריך","מס׳ יום","שעה","משך (דק׳)","קטגוריה","קהל יעד",
      ...(isOwner ? ["עלות כוללת","פירוט עלות"] : []),
      "תיאור","איש קשר","טלפון","ארגון","נעוץ","סופי"
    ];

    // הכנה לשורות
    const rows = events.map((e) => {
      const date = e.dayIndex != null ? days[e.dayIndex]?.dateKey || "" : "";
      const catName = (catByKey[e.categoryKey]?.name) || "כללי";
      const audienceNames = (Array.isArray(e.audiences) ? e.audiences : []).map(audienceLabel).join("; ");
      const costBreakdown = (Array.isArray(e.costItems) ? e.costItems : [])
        .filter((ci) => ci.label || ci.amount)
        .map((ci) => `${ci.label || "רכיב"}: ₪${resolveAmount(ci)}${ci.vat ? " (כולל מע\"מ)" : ""}`)
        .join("; ");
      return [
        e.title ?? "",
        date,
        e.dayIndex ?? "",
        e.time ?? "",
        e.duration ?? "",
        catName,
        audienceNames,
        ...(isOwner ? [eventTotal(e), costBreakdown] : []),
        e.description ?? "",
        e.contact ?? "",
        (e.contactPhone || e.phone || ""),
        e.organization ?? "",
        e.placed ? 1 : 0,
        e.confirmed ? "כן" : "לא",
      ];
    });

    // פונקציית ציטוט בטוחה ל-CSV (ללא רג'קסים)
    const needsQuote = (s) => s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r");
    const quoteCell = (val) => {
      const s = String(val ?? "");
      return needsQuote(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const csv = [headers, ...rows]
      .map((arr) => arr.map(quoteCell).join(","))
      .join("\n");

    // הוספת BOM אמיתי ל-UTF-8 כדי למנוע ג'יבריש באקסל
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "schedule.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Full offline backup: a single .zip download containing a real .xlsx export (every field,
  // including summary/media links) plus every uploaded photo as an actual file, organized by
  // event. Videos are left as links in the spreadsheet rather than downloaded, since they can be
  // large and are often external URLs anyway.
  const exportFullBackup = async () => {
    setBackupInProgress(true);
    setConflictMsg("מכין גיבוי מלא, נא להמתין...");
    try {
      const [XLSX, JSZipModule] = await Promise.all([import("xlsx"), import("jszip")]);
      const JSZip = JSZipModule.default;
      const zip = new JSZip();

      const safeName = (s) => String(s || "").replace(/[\\/:*?"<>|]/g, "_").slice(0, 40) || "ללא_כותרת";

      // Cost columns are omitted entirely for anyone but the owner account — see isOwner.
      const headers = [
        "כותרת", "תאריך", "מס׳ יום", "שעה", "משך (דק׳)", "קטגוריה", "קהל יעד",
        ...(isOwner ? ["עלות כוללת", "פירוט עלות"] : []),
        "תיאור", "תקציר", "איש קשר", "טלפון", "ארגון", "נעוץ", "סופי", "קישורי וידאו", "קבצי תמונה מצורפים",
      ];

      const rows = [];
      let imageCount = 0;
      for (const e of events) {
        const date = e.dayIndex != null ? days[e.dayIndex]?.dateKey || "" : "";
        const catName = catByKey[e.categoryKey]?.name || "כללי";
        const audienceNames = (Array.isArray(e.audiences) ? e.audiences : []).map(audienceLabel).join("; ");
        const costBreakdown = (Array.isArray(e.costItems) ? e.costItems : [])
          .filter((ci) => ci.label || ci.amount)
          .map((ci) => `${ci.label || "רכיב"}: ₪${resolveAmount(ci)}${ci.vat ? " (כולל מע\"מ)" : ""}`)
          .join("; ");
        const videoLinks = (Array.isArray(e.videos) ? e.videos : []).map((v) => v.url).join("; ");

        const imageFileNames = [];
        const images = Array.isArray(e.images) ? e.images : [];
        for (let i = 0; i < images.length; i++) {
          const img = images[i];
          try {
            const resp = await fetch(img.url);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const blob = await resp.blob();
            const ext = (img.url.split(".").pop() || "jpg").split("?")[0];
            const fileName = `${safeName(e.title)}_${i + 1}.${ext}`;
            zip.file(`images/${safeName(e.title)}_${e.id}/${fileName}`, blob);
            imageFileNames.push(fileName);
            imageCount++;
          } catch (err) {
            console.error("Failed to fetch image for backup:", img.url, err);
            imageFileNames.push(`(שגיאה בהורדה: ${img.url})`);
          }
        }

        rows.push([
          e.title ?? "", date, e.dayIndex != null ? e.dayIndex + 1 : "", e.time ?? "", e.duration ?? "",
          catName, audienceNames,
          ...(isOwner ? [eventTotal(e), costBreakdown] : []),
          e.description ?? "", e.summary ?? "", e.contact ?? "", (e.contactPhone || e.phone || ""),
          e.organization ?? "", e.placed ? 1 : 0, e.confirmed ? "כן" : "לא",
          videoLinks, imageFileNames.join("; "),
        ]);
      }

      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      ws["!cols"] = headers.map(() => ({ wch: 18 }));
      const wb = XLSX.utils.book_new();
      wb.Workbook = { Views: [{ RTL: true }] };
      XLSX.utils.book_append_sheet(wb, ws, "לוח פעילויות");
      const xlsxData = XLSX.write(wb, { type: "array", bookType: "xlsx" });
      zip.file("לוח_פעילויות.xlsx", xlsxData);

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `suka-backup-${formatTimestampForFilename(new Date())}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setConflictMsg(`הגיבוי המלא ירד בהצלחה: ${events.length} אירועים, ${imageCount} תמונות.`);
    } catch (err) {
      console.error(err);
      setConflictMsg("שגיאה ביצירת הגיבוי המלא: " + err.message);
    } finally {
      setBackupInProgress(false);
    }
  };

  // Import (paste)
  const importJSON = () => {
    try {
      const data = JSON.parse(importText);
      if (data && Array.isArray(data.events) && typeof data.startDate === "string") {
        setStartDate(data.startDate);
        const migrated = data.events.map(migrateEvent);
        setEvents(migrated);
        runCloudWrite(() => syncActivities(migrated));
        if (Array.isArray(data.categories)) {
          setCategories(data.categories);
          runCloudWrite(() => syncCategories(data.categories));
        }
        setConflictMsg(`ייבוא הושלם: נטענו ${data.events.length} אירועים. שים/י לב: ייבוא JSON מחליף את כל הלוח הקיים בענן.`);
      } else {
        setConflictMsg("פורמט ייבוא לא תקין.");
      }
    } catch (e) {
      setConflictMsg("שגיאה בפענוח JSON.");
    }
  };

  // Import (file)
  const onImportFile = (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (data && Array.isArray(data.events) && typeof data.startDate === "string") {
          setStartDate(data.startDate);
          const migrated = data.events.map(migrateEvent);
          setEvents(migrated);
          runCloudWrite(() => syncActivities(migrated));
          if (Array.isArray(data.categories)) {
            setCategories(data.categories);
            runCloudWrite(() => syncCategories(data.categories));
          }
          setConflictMsg(`ייבוא מהקובץ הצליח: ${data.events.length} אירועים נטענו. שים/י לב: ייבוא JSON מחליף את כל הלוח הקיים בענן.`);
        } else {
          setConflictMsg("קובץ JSON לא תואם לפורמט צפוי.");
        }
      } catch (err) {
        setConflictMsg("שגיאה בקריאת הקובץ (JSON לא תקין).");
      }
      ev.target.value = ""; // allow importing same file again
    };
    reader.onerror = () => {
      setConflictMsg("שגיאה בקריאת הקובץ.");
      ev.target.value = "";
    };
    reader.readAsText(file, "utf-8");
  };

  // Import (Excel / CSV schedule template) — adds new events, does not replace the current schedule
  const downloadScheduleTemplate = async () => {
    const XLSX = await import("xlsx");
    const headers = Object.values(IMPORT_COL);
    const example = [
      "הופעת זמר", "07/10/2026", "20:00", 90, "מוזיקה", "משפחות;מבוגרים",
      "אמן", 3000, "הגברה", 500, "", "",
      "ערב שירה בסוכה", "ישראל ישראלי", "050-1234567", "עמותת דוגמה", "לא",
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    ws["!cols"] = headers.map(() => ({ wch: 18 }));

    const infoWs = XLSX.utils.aoa_to_sheet([
      ["הוראות מילוי"],
      ["- שורה 1 היא כותרות העמודות, אין לשנות אותן."],
      ["- שורה 2 היא דוגמה — אפשר למחוק אותה ולהזין נתונים מתחת לכותרות."],
      ["- תאריך ושעה הם אופציונליים: אם ריקים, האירוע ייכנס כפתק ממתין (לא ממוקם בלוח)."],
      ["- יש להזין תאריך ושעה כטקסט רגיל בפורמט המוצג בדוגמה, לא כתאריך/שעה מעוצבים של אקסל."],
      ["- שעה חייבת להיות אחד מרבעי השעה שבין 10:30 ל-23:00 (למשל 20:00, 20:15, 20:30 או 20:45)."],
      [`- קהל יעד: אפשר לרשום כמה קהלים מופרדים ב-; מתוך: ${AUDIENCES.map((a) => a.name).join(", ")}`],
      ["- ניתן להזין עד 3 רכיבי עלות; אפשר להוסיף עוד רכיבים בתוך האפליקציה אחרי הייבוא."],
      [],
      ["קטגוריות זמינות כרגע (יש להעתיק בדיוק, אחרת האירוע יסומן \"כללי\"):"],
      ...categories.map((c) => [c.name]),
    ]);
    infoWs["!cols"] = [{ wch: 70 }];

    const wb = XLSX.utils.book_new();
    wb.Workbook = { Views: [{ RTL: true }] };
    XLSX.utils.book_append_sheet(wb, ws, "לוח פעילויות");
    XLSX.utils.book_append_sheet(wb, infoWs, "הוראות וקטגוריות");
    XLSX.writeFile(wb, "תבנית_ייבוא_פעילויות.xlsx");
  };

  const importRowsAsEvents = (rows) => {
    const summary = { added: 0, placed: 0, unplaced: 0, unknownCategory: 0 };
    const newEvents = [];
    rows
      .filter((r) => String(r[IMPORT_COL.title] || "").trim())
      .forEach((r, idx) => {
        const title = String(r[IMPORT_COL.title] || "").trim();
        const durationRaw = Number(r[IMPORT_COL.duration]);
        const duration = durationRaw > 0 ? Math.max(30, Math.round(durationRaw / 30) * 30) : 30;

        const catNameRaw = String(r[IMPORT_COL.category] || "").trim();
        const matchedCat = categories.find((c) => c.name === catNameRaw);
        if (catNameRaw && !matchedCat) summary.unknownCategory++;
        const categoryKey = matchedCat ? matchedCat.key : "general";

        const audiencesRaw = String(r[IMPORT_COL.audiences] || "").split(/[;,]/).map((s) => s.trim()).filter(Boolean);
        const audiences = AUDIENCES.filter((a) => audiencesRaw.includes(a.name)).map((a) => a.key);

        const costItems = [];
        [1, 2, 3].forEach((i) => {
          const label = String(r[IMPORT_COL[`cost${i}Label`]] || "").trim();
          const amount = String(r[IMPORT_COL[`cost${i}Amount`]] || "").trim();
          if (label || amount) costItems.push({ id: `imp-${Date.now()}-${idx}-${i}`, label, amount, vat: false });
        });

        const dateKey = parseImportDate(r[IMPORT_COL.date]);
        const dayIndex = dateKey ? days.findIndex((d) => d.dateKey === dateKey) : -1;
        const time = String(r[IMPORT_COL.time] || "").trim();
        const validTime = timeSlots.includes(time);

        const base = {
          id: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 10)}`,
          title,
          duration,
          categoryKey,
          audiences,
          costItems,
          description: String(r[IMPORT_COL.description] || ""),
          contact: String(r[IMPORT_COL.contact] || ""),
          contactPhone: String(r[IMPORT_COL.phone] || ""),
          organization: String(r[IMPORT_COL.organization] || ""),
          confirmed: /^כן$/.test(String(r[IMPORT_COL.confirmed] || "").trim()),
        };

        if (dayIndex >= 0 && validTime) {
          const candidate = { ...base, placed: true, dayIndex, time };
          if (!timeRangeConflicts(candidate, [...events, ...newEvents])) {
            summary.placed++;
            newEvents.push(candidate);
            return;
          }
        }
        summary.unplaced++;
        newEvents.push({ ...base, placed: false });
      });
    summary.added = newEvents.length;
    return { newEvents, summary };
  };

  const importScheduleFile = async (file) => {
    try {
      const XLSX = await import("xlsx");
      const isCsv = /\.csv$/i.test(file.name);
      // raw:true for CSV — otherwise SheetJS auto-converts date/time-looking text (e.g.
      // "07/10/2026", "20:00") into Excel serial numbers, which parseImportDate can't read.
      const workbook = isCsv
        ? XLSX.read(await file.text(), { type: "string", raw: true })
        : XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      const { newEvents, summary } = importRowsAsEvents(rows);
      if (newEvents.length === 0) {
        setConflictMsg("לא נמצאו שורות עם כותרת בקובץ שיובא.");
        return;
      }
      setEvents((prev) => [...prev, ...newEvents]);
      runCloudWrite(() => insertActivities(newEvents));
      setConflictMsg(
        `יובאו ${summary.added} אירועים (${summary.placed} מוקמו בלוח, ${summary.unplaced} נוספו כפתקים ממתינים)` +
        (summary.unknownCategory ? `, ${summary.unknownCategory} עם קטגוריה לא מזוהה (סומנו "כללי")` : "") + "."
      );
    } catch (err) {
      console.error(err);
      setConflictMsg("שגיאה בקריאת קובץ האקסל/CSV. יש לוודא שהשתמשת בתבנית שסופקה.");
    }
  };

  const onImportScheduleFile = (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    importScheduleFile(file);
    ev.target.value = "";
  };

  const printPDF = () => window.print();

  // totals
  const dayTotal = (dayIndex) =>
    events
      .filter((e) => (sumPlacedOnly ? e.placed : true) && e.dayIndex === dayIndex)
      .reduce((acc, e) => acc + eventTotal(e), 0);

  const categoryTotals = useMemo(() => {
    const map = Object.fromEntries(categories.map((c) => [c.key, 0]));
    events.forEach((e) => {
      if (!sumPlacedOnly || e.placed) {
        const p = eventTotal(e);
        const key = e.categoryKey ?? "general";
        map[key] = (map[key] || 0) + p;
      }
    });
    return map;
  }, [events, sumPlacedOnly, categories]);

  const orgTotals = useMemo(() => {
    const map = {};
    events.forEach((e) => {
      if (!sumPlacedOnly || e.placed) {
        const p = eventTotal(e);
        const org = normalizeOrg(e.organization);
        map[org] = (map[org] || 0) + p;
      }
    });
    return map;
  }, [events, sumPlacedOnly]);
  const categoriesGrandTotal = useMemo(() => Object.values(categoryTotals).reduce((a, b) => a + (b || 0), 0), [categoryTotals]);
  const orgGrandTotal = useMemo(() => Object.values(orgTotals).reduce((a, b) => a + (b || 0), 0), [orgTotals]);


  const selectedEvent = events.find((e) => e.id === selectedEventId) || null;

  const updateSelectedEvent = (patch) => {
    if (!selectedEvent) return;
    const candidate = { ...selectedEvent, ...patch };
    if (candidate.placed && hasConflict(candidate)) {
      setConflictMsg("לא ניתן לעדכן – יש חפיפה עם אירוע אחר.");
      return;
    }
    setEvents((prev) => prev.map((e) => (e.id === selectedEvent.id ? candidate : e)));
    runCloudWrite(() => updateActivityFields(selectedEvent.id, patch));
  };

  const deleteEvent = (id) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    if (selectedEventId === id) setSelectedEventId(null);
    runCloudWrite(() => deleteActivityById(id));
  };
  const toggleConfirmed = (id) => {
    const current = events.find((e) => e.id === id);
    if (!current) return;
    const nextConfirmed = !current.confirmed;
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, confirmed: nextConfirmed } : e)));
    runCloudWrite(() => updateActivityFields(id, { confirmed: nextConfirmed }));
  };
  const toggleDataComplete = (id) => {
    const current = events.find((e) => e.id === id);
    if (!current) return;
    const next = !current.dataComplete;
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, dataComplete: next } : e)));
    runCloudWrite(() => updateActivityFields(id, { dataComplete: next }));
  };
  const sendToBank = (id) => {
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, placed: false, dayIndex: null, time: null } : e)));
    runCloudWrite(() => updateActivityFields(id, { placed: false, dayIndex: null, time: null }));
  };


  // sidebar resizer handlers
  const onResizeStart = (e) => {
    isResizingSidebar.current = true;
    startX.current = e.clientX;
    startW.current = sidebarWidthPx;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  };
  useEffect(() => {
    const onMove = (e) => {
      if (!isResizingSidebar.current) return;
      const dx = e.clientX - startX.current;
      const dir = sidebarPos === "left" ? 1 : -1; // dragging to right expands when left; opposite when right
      const newW = Math.max(240, Math.min(520, startW.current + dir * dx));
      setSidebarWidthPx(newW);
    };
    const onUp = () => {
      if (!isResizingSidebar.current) return;
      isResizingSidebar.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [sidebarPos, sidebarWidthPx]);

  // notes bank resizer handlers — the panel sits at the far right of the layout,
  // so dragging its left-edge handle left (negative dx) grows it
  const onNotesResizeStart = (e) => {
    isResizingNotesBank.current = true;
    notesStartX.current = e.clientX;
    notesStartW.current = notesBankWidthPx;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  };
  useEffect(() => {
    const onMove = (e) => {
      if (!isResizingNotesBank.current) return;
      const dx = e.clientX - notesStartX.current;
      const newW = Math.max(240, Math.min(1100, notesStartW.current - dx));
      setNotesBankWidthPx(newW);
    };
    const onUp = () => {
      if (!isResizingNotesBank.current) return;
      isResizingNotesBank.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [notesBankWidthPx]);

  /* =====================
     UI
     ===================== */
  const isSidebarLeft = sidebarPos === "left";

  // Shared between the normal layout's notes-bank <aside> and the popped-out bank window
  // (?popout=bank) so the tab/library/card markup only exists once.
  const notesBankTabs = (
    <>
      <div className="flex items-center gap-2 mb-2">
        <button
          type="button"
          className={`text-sm px-2 py-1 rounded border ${sidebarTab === "notes" ? "bg-gray-800 text-white" : "bg-white"}`}
          onClick={() => setSidebarTab("notes")}
        >
          פתקים ממתינים
        </button>
        <button
          type="button"
          className={`text-sm px-2 py-1 rounded border ${sidebarTab === "library" ? "bg-gray-800 text-white" : "bg-white"}`}
          onClick={() => setSidebarTab("library")}
        >
          כל הפעילויות
        </button>
      </div>

      <div className="flex items-center gap-2 mb-2 text-xs">
        <span className="text-gray-600">עמודות:</span>
        {[1, 2, 3].map((n) => (
          <button
            key={n}
            type="button"
            className={`px-2 py-0.5 rounded border ${notesBankColumns === n ? "bg-gray-800 text-white" : "bg-white"}`}
            onClick={() => setNotesBankColumns(n)}
          >
            {n}
          </button>
        ))}
      </div>

      {sidebarTab === "notes" ? (
        <>
          {events.filter((e) => !e.placed && visibleEventsFilter(e)).length === 0 && (
            <div className="text-xs text-gray-500">אין פתקים ממתינים (או שלא נמצאו בחיפוש/פילטרים)</div>
          )}
          <div className={`grid gap-2 ${GRID_COLS_CLASS[notesBankColumns] || "grid-cols-1"}`}>
          {events.filter((e) => !e.placed).filter(visibleEventsFilter).map((e) => (
            <div
              key={e.id}
              className={`p-2 rounded mb-2 relative text-right cursor-pointer ${armedEventId === e.id ? "ring-2 ring-amber-500" : ""} ${looksLikeDuplicate(e) ? "ring-2 ring-red-500" : ""}`}
              style={{ background: catByKey[e.categoryKey]?.color || "#93c5fd" }}
              draggable
              onDragStart={(ev) => {
                ev.dataTransfer.setData("text/event-id", String(e.id));
                ev.dataTransfer.effectAllowed = "copyMove";
                setDraggedEventId(e.id);
              }}
              onDragEnd={() => setDraggedEventId(null)}
              onClick={() => armEvent(e.id)}
              title="לחצ/י כדי לסמן למיקום, ואז לחצ/י על משבצת בלוח (גם בחלון אחר)"
              dir="rtl"
            >
              <div className="absolute top-1 left-1">
                <button
                  type="button"
                  className="w-4 h-4 rounded-full border flex items-center justify-center text-[10px]"
                  style={{ background: e.confirmed ? "#16a34a" : "white", color: e.confirmed ? "white" : "#16a34a", borderColor: "#16a34a" }}
                  title={e.confirmed ? "אירוע סופי (לחץ לביטול)" : "סמן כסופי"}
                  onClick={(ev) => { ev.stopPropagation(); toggleConfirmed(e.id); }}
                >
                  {e.confirmed ? "✓" : ""}
                </button>
              </div>
              <div className="absolute top-1 right-1 flex gap-1">
                <button className="bg-white/80 rounded px-1 text-[10px]" onClick={(ev) => { ev.stopPropagation(); setSelectedEventId(e.id); }} title="עריכה">✎</button>
                <button className="bg-white/80 rounded px-1 text-[10px] text-red-600" onClick={(ev) => { ev.stopPropagation(); deleteEvent(e.id); }} title="מחיקה">✕</button>
              </div>
              <div className="mt-5 text-base font-bold leading-5">{e.title || "ללא כותרת"}</div>
              <div className="text-xs text-gray-800 mt-1">משך: {e.duration} דק' {isOwner && showPrices && eventTotal(e) > 0 ? `• ₪${eventTotal(e)}` : ""}</div>
              {e.organization && <div className="text-xs mt-1">ארגון: {e.organization}</div>}
              {looksLikeDuplicate(e) && (
                <div className="text-[11px] text-red-700 font-semibold mt-1">⚠ כבר מתוזמן בלוח — כפילות אפשרית</div>
              )}
              <AudienceBadges audiences={e.audiences} />
            </div>
          ))}
          </div>
        </>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-gray-600">{events.filter(visibleEventsFilter).length} פעילויות</div>
            <select className="border p-1 text-xs" value={libraryGroupBy} onChange={(e) => setLibraryGroupBy(e.target.value)}>
              <option value="category">קבץ לפי קטגוריה</option>
              <option value="audience">קבץ לפי קהל יעד</option>
              <option value="price">קבץ לפי מחיר</option>
            </select>
          </div>
          {events.filter(visibleEventsFilter).length === 0 && (
            <div className="text-xs text-gray-500">לא נמצאו פעילויות (בדוק/י את הפילטרים)</div>
          )}
          {buildLibraryGroups().map((group) => group.items.length > 0 && (
            <div key={group.key} className="mb-3">
              <div className="text-xs font-semibold mb-1 flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: group.color }} />
                {group.label} ({group.items.length})
              </div>
              <div className={`grid gap-2 ${GRID_COLS_CLASS[notesBankColumns] || "grid-cols-1"}`}>
              {group.items.map((e) => (
                <div
                  key={e.id}
                  className={`p-2 rounded mb-2 relative text-right cursor-pointer ${armedEventId === e.id ? "ring-2 ring-amber-500" : ""}`}
                  style={{ background: catByKey[e.categoryKey]?.color || "#93c5fd" }}
                  draggable
                  onDragStart={(ev) => {
                    ev.dataTransfer.setData("text/event-id", String(e.id));
                    ev.dataTransfer.effectAllowed = "copyMove";
                    setDraggedEventId(e.id);
                  }}
                  onDragEnd={() => setDraggedEventId(null)}
                  onClick={() => armEvent(e.id)}
                  dir="rtl"
                  title="גרור/י ליומן כדי למקם או להזיז, או לחצ/י כדי לסמן למיקום מחלון אחר"
                >
                  <div className="absolute top-1 left-1">
                    <button
                      type="button"
                      className="w-4 h-4 rounded-full border flex items-center justify-center text-[10px]"
                      style={{ background: e.confirmed ? "#16a34a" : "white", color: e.confirmed ? "white" : "#16a34a", borderColor: "#16a34a" }}
                      title={e.confirmed ? "אירוע סופי (לחץ לביטול)" : "סמן כסופי"}
                      onClick={(ev) => { ev.stopPropagation(); toggleConfirmed(e.id); }}
                    >
                      {e.confirmed ? "✓" : ""}
                    </button>
                  </div>
                  <div className="absolute top-1 right-1 flex gap-1">
                    <button className="bg-white/80 rounded px-1 text-[10px]" onClick={(ev) => { ev.stopPropagation(); setSelectedEventId(e.id); }} title="עריכה">✎</button>
                    <button className="bg-white/80 rounded px-1 text-[10px] text-red-600" onClick={(ev) => { ev.stopPropagation(); deleteEvent(e.id); }} title="מחיקה">✕</button>
                  </div>
                  <div className="mt-5 text-base font-bold leading-5">{e.title || "ללא כותרת"}</div>
                  <div className="text-xs text-gray-800 mt-1">משך: {e.duration} דק' {isOwner && showPrices && eventTotal(e) > 0 ? `• ₪${eventTotal(e)}` : ""}</div>
                  <div className="text-[11px] text-gray-700 mt-1">
                    {e.placed && e.dayIndex != null && e.time ? `ממוקם: יום ${e.dayIndex + 1} • ${e.time}` : "לא ממוקם"}
                  </div>
                  {e.organization && <div className="text-xs mt-1">ארגון: {e.organization}</div>}
                  <AudienceBadges audiences={e.audiences} />
                </div>
              ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );

  // Shared between the docked layout and the popped-out bank window, so editing an event
  // always has every field available, regardless of which window it was opened from.
  const editEventModal = selectedEvent && (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center p-6 z-50 print:hidden overflow-auto" onClick={() => setSelectedEventId(null)}>
      <div className="bg-white rounded-xl shadow-xl w-[480px] max-w-full" onClick={(e) => e.stopPropagation()} dir="rtl">
        <div className="flex items-center justify-between border-b p-3">
          <div className="font-bold">עריכת אירוע</div>
          <button className="px-3 py-1" onClick={() => setSelectedEventId(null)}>סגור ✕</button>
        </div>
        <div className="max-h-[80vh] overflow-auto p-4">
          <label className="block text-sm mb-1">שם האירוע</label>
          <input type="text" className="border p-1 w-full mb-2" value={selectedEvent.title} onChange={(e) => updateSelectedEvent({ title: e.target.value })} />

          <label className="block text-sm mb-1">משך</label>
          <select className="border p-1 w-full mb-2" value={selectedEvent.duration} onChange={(e) => updateSelectedEvent({ duration: Number(e.target.value) })}>
            {DURATIONS.map((m) => (<option key={m} value={m}>{durationLabel(m)}</option>))}
          </select>

          {isOwner && (
            <>
              <label className="block text-sm mb-1">עלות (רכיבים)</label>
              <div className="mb-2">
                <CostItemsEditor items={selectedEvent.costItems} onChange={(costItems) => updateSelectedEvent({ costItems })} />
              </div>
            </>
          )}

          <label className="block text-sm mb-1">לוגו <span className="text-gray-400 font-normal">(PNG שקוף מומלץ)</span></label>
          <div className="mb-2">
            <LogoEditor url={selectedEvent.logoUrl || ""} onChange={(logoUrl) => updateSelectedEvent({ logoUrl })} />
          </div>

          <label className="block text-sm mb-1">תמונות</label>
          <div className="mb-2">
            <ImagesEditor items={selectedEvent.images} onChange={(images) => updateSelectedEvent({ images })} />
          </div>

          <label className="block text-sm mb-1">וידאו</label>
          <div className="mb-2">
            <VideosEditor items={selectedEvent.videos} onChange={(videos) => updateSelectedEvent({ videos })} />
          </div>

          <label className="block text-sm mb-1">מפרט טכני (ריידר)</label>
          <div className="mb-2">
            <TechRiderEditor
              textValue={selectedEvent.techRiderText || ""}
              fileUrl={selectedEvent.techRiderUrl || ""}
              onTextChange={(v) => updateSelectedEvent({ techRiderText: v })}
              onFileChange={(v) => updateSelectedEvent({ techRiderUrl: v })}
            />
          </div>

          <label className="block text-sm mb-1">איש קשר</label>
          <input type="text" className="border p-1 w-full mb-2" value={selectedEvent.contact || ""} onChange={(e) => updateSelectedEvent({ contact: e.target.value })} />

          <label className="block text-sm mb-1">טלפון איש קשר</label>
          <input type="tel" className="border p-1 w-full mb-2" value={selectedEvent.contactPhone || ""} onChange={(e) => updateSelectedEvent({ contactPhone: e.target.value })} />

          <label className="block text-sm mb-1">ארגון</label>
          <input type="text" className="border p-1 w-full mb-2" value={selectedEvent.organization || ""} onChange={(e) => updateSelectedEvent({ organization: e.target.value })} />

          <label className="block text-sm mb-1">תיאור</label>
          <textarea className="border p-1 w-full h-20 mb-3" value={selectedEvent.description || ""} onChange={(e) => updateSelectedEvent({ description: e.target.value })} />

          <label className="block text-sm mb-1">תקציר <span className="text-gray-400 font-normal">(לניהול אירועים באתר)</span></label>
          <textarea className="border p-1 w-full h-14 mb-3" value={selectedEvent.summary || ""} onChange={(e) => updateSelectedEvent({ summary: e.target.value })} />

          <label className="block text-sm mb-1">קטגוריה</label>
          <select className="border p-1 w-full mb-3" value={selectedEvent.categoryKey || "general"} onChange={(e) => updateSelectedEvent({ categoryKey: e.target.value })}>
            {categories.map((c) => (<option key={c.key} value={c.key}>{c.name}</option>))}
          </select>

          <label className="block text-sm mb-1">קהל יעד</label>
          <div className="mb-3">
            <AudienceCheckboxes selected={selectedEvent.audiences} onChange={(audiences) => updateSelectedEvent({ audiences })} />
          </div>

          <div className="text-xs text-gray-600 mb-3">
            {selectedEvent.placed && selectedEvent.dayIndex != null && selectedEvent.time ? `ממוקם: יום ${selectedEvent.dayIndex + 1} • ${selectedEvent.time}` : "עדיין לא ננעץ בלוח"}
          </div>

          <label className="flex items-center gap-2 mb-3 cursor-pointer select-none">
            <input
              type="checkbox"
              className="w-4 h-4 accent-green-600"
              checked={!!selectedEvent.dataComplete}
              onChange={() => toggleDataComplete(selectedEvent.id)}
            />
            <span className="text-sm font-medium">✅ כל הפרטים הוזנו</span>
          </label>

          <div className="flex flex-wrap gap-2">
            <button className="bg-indigo-600 text-white px-3 py-1 rounded" onClick={() => setSelectedEventId(null)}>סיום עריכה</button>
            {selectedEvent.placed && (
              <button className="bg-amber-600 text-white px-3 py-1 rounded" onClick={() => sendToBank(selectedEvent.id)}>📥 החזר לבנק</button>
            )}
            <button className="bg-red-600 text-white px-3 py-1 rounded" onClick={() => deleteEvent(selectedEvent.id)}>מחק אירוע</button>
          </div>
        </div>
      </div>
    </div>
  );

  if (isPopout) {
    return (
      <div className="p-3" dir="rtl">
        {cloudFlash && (
          <div
            className={`fixed top-4 left-1/2 -translate-x-1/2 z-[200] text-xl font-bold px-8 py-4 rounded-2xl shadow-2xl border-2 flex items-center gap-3 ${
              cloudFlash.type === "ok" ? "bg-green-100 text-green-900 border-green-400" : "bg-red-100 text-red-900 border-red-400"
            }`}
          >
            <span>{cloudFlash.msg}</span>
            {cloudFlash.type === "err" && (
              <button className="font-bold px-1" onClick={() => setCloudFlash(null)} title="סגור">✕</button>
            )}
          </div>
        )}
        <div className="flex items-center justify-between mb-2">
          <h1 className="font-bold text-lg">בנק פתקים — {startDate}</h1>
          <a href={window.location.pathname} className="text-xs border rounded px-2 py-1">↩ תצוגה מלאה</a>
        </div>
        <div
          className={`text-xs border rounded px-2 py-1 mb-2 inline-block ${realtimeStatus === "SUBSCRIBED" ? "bg-green-50 text-green-700 border-green-300" : "bg-red-50 text-red-700 border-red-300"}`}
          title={lastRealtimeEvent ? `עדכון אחרון: ${lastRealtimeEvent}` : "עדיין לא התקבל עדכון בזמן אמת"}
        >
          🔌 {realtimeStatus}{lastRealtimeEvent ? ` · ${lastRealtimeEvent}` : ""} · {events.length} אירועים בזיכרון
        </div>
        {armedEvent && (
          <div className="flex items-center justify-between gap-2 bg-amber-50 border border-amber-400 text-amber-900 text-xs rounded px-2 py-1.5 mb-2">
            <span>📌 מסומן: <b>{armedEvent.title || "ללא כותרת"}</b> — עברו לחלון הלוח ולחצו על משבצת</span>
            <button className="border border-amber-500 rounded px-1.5" onClick={() => { setArmedEventId(null); broadcastArm({ type: "clear-armed" }); }}>ביטול</button>
          </div>
        )}
        {notesBankTabs}
        {editEventModal}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3 print:block print-page">
      {/* Cloud save status toast — fixed + high z-index so it's visible even while the edit modal
          (or any other modal, all z-50) is open on top of it. See cloudFlash/flashCloudStatus. */}
      {cloudFlash && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-[200] text-xl font-bold px-8 py-4 rounded-2xl shadow-2xl border-2 print:hidden flex items-center gap-3 ${
            cloudFlash.type === "ok" ? "bg-green-100 text-green-900 border-green-400" : "bg-red-100 text-red-900 border-red-400"
          }`}
        >
          <span>{cloudFlash.msg}</span>
          {cloudFlash.type === "err" && (
            <button className="font-bold px-1" onClick={() => setCloudFlash(null)} title="סגור">✕</button>
          )}
        </div>
      )}
      {/* Top Bar */}
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <label className="text-sm">תאריך התחלה:
          <input type="date" className="border p-1 ml-2" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label className="text-sm flex items-center gap-2">
          <input type="checkbox" checked={sumPlacedOnly} onChange={(e) => setSumPlacedOnly(e.target.checked)} />
          חשב סכומים רק לאירועים שננעצו
        </label>
        <label className="text-sm flex items-center gap-2">
          קטגוריה לתצוגה:
          <select className="border p-1" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="all">הכל</option>
            {categories.map((c) => (
              <option key={c.key} value={c.key}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="text-sm flex items-center gap-2">
          ארגון לתצוגה:
          <select className="border p-1" value={filterOrg} onChange={(e) => setFilterOrg(e.target.value)}>
            <option value="all">הכל</option>
            {orgOptions.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </label>
        <label className="text-sm flex items-center gap-2">
          סטטוס:
          <select className="border p-1" value={filterConfirmed} onChange={(e) => setFilterConfirmed(e.target.value)}>
            <option value="all">הכל</option>
            <option value="yes">סופיים</option>
            <option value="no">לא סופיים</option>
          </select>
        </label>
        <label className="text-sm flex items-center gap-2">
          קהל יעד:
          <select className="border p-1" value={filterAudience} onChange={(e) => setFilterAudience(e.target.value)}>
            <option value="all">הכל</option>
            {AUDIENCES.map((a) => (
              <option key={a.key} value={a.key}>{a.name}</option>
            ))}
          </select>
        </label>
        <label className="text-sm flex items-center gap-2">
          חיפוש:
          <input type="text" className="border p-1" placeholder="שם / איש קשר / ארגון / תיאור" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
          {searchText && <button className="text-xs border rounded px-2 py-1" onClick={() => setSearchText("")}>נקה</button>}
        </label>

        {/* Day width control */}
        <label className="text-sm flex items-center gap-2">
          רוחב יום (px):
          <input
            type="range"
            min={120}
            max={280}
            step={4}
            value={dayColWidthPx}
            onChange={(e) => setDayColWidthPx(Number(e.target.value))}
          />
          <span className="text-xs text-gray-600">{dayColWidthPx}px</span>
        </label>

        {/* Sidebar position */}
        <label className="text-sm flex items-center gap-2">
          מיקום סיידבר:
          <select className="border p-1" value={sidebarPos} onChange={(e) => setSidebarPos(e.target.value)}>
            <option value="left">שמאל</option>
            <option value="right">ימין</option>
          </select>
        </label>

        {isOwner && (
          <label className="text-sm flex items-center gap-2 print:hidden">
            <input
              type="checkbox"
              checked={showPrices}
              onChange={(e) => setShowPrices(e.target.checked)}
            />
            הצג מחירים בפתקים / בהדפסה
          </label>
        )}
        <button className="bg-gray-800 text-white px-3 py-1 rounded" onClick={printPDF}>הדפס / ייצא PDF</button>
        <button className="bg-gray-700 text-white px-3 py-1 rounded" onClick={exportCSV}>ייצא CSV</button>
        <button className="px-3 py-1 rounded border" title="נקה את הנתונים השמורים בדפדפן" onClick={() => { localStorage.removeItem(STORAGE_KEY); }}>נקה שמירה מקומית</button>
        <div className="text-sm font-medium text-gray-700 bg-gray-100 border rounded px-2 py-1" title="אירועים ממוקמים בלוח מתוך סך הכל">
          📅 {events.filter((e) => e.placed).length} מתוזמנים ({events.length} סה״כ)
        </div>
        <div
          className={`text-xs border rounded px-2 py-1 ${realtimeStatus === "SUBSCRIBED" ? "bg-green-50 text-green-700 border-green-300" : "bg-red-50 text-red-700 border-red-300"}`}
          title={lastRealtimeEvent ? `עדכון אחרון: ${lastRealtimeEvent}` : "עדיין לא התקבל עדכון בזמן אמת"}
        >
          🔌 {realtimeStatus}{lastRealtimeEvent ? ` · ${lastRealtimeEvent}` : ""}
        </div>
        {session?.user?.email && (
          <div className="text-xs text-gray-600 flex items-center gap-2 mr-auto">
            <span>מחובר/ת: {session.user.email}</span>
            <button className="border rounded px-2 py-1" onClick={onSignOut}>יציאה</button>
          </div>
        )}
        {conflictMsg && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 px-2 py-1 rounded">{conflictMsg}</div>
        )}
      </div>

      {/* Main two-column layout with draggable splitter */}
      <div className="w-full flex gap-0 select-none" dir="ltr">
        {/* Sidebar */}
        <aside
          className="shrink-0 print:hidden"
          style={{ width: sidebarWidthPx, minWidth: 240, order: isSidebarLeft ? 0 : 2 }}
          dir="rtl"
        >
          <div className="sticky top-4 space-y-4 p-2">
            <div className="flex gap-2">
              <button className="bg-green-600 text-white px-3 py-2 rounded flex-1" onClick={() => setShowAddModal(true)}>+ הוסף אירוע</button>
              {isOwner && (
                <button className="bg-gray-800 text-white px-3 py-2 rounded flex-1" onClick={() => setShowTotalsModal(true)}>📊 סיכומים</button>
              )}
            </div>

            {/* Export / Import */}
            <div className="p-3 rounded border">
              <div className="font-bold mb-2">ייצוא / ייבוא</div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <button className="bg-gray-800 text-white px-3 py-1 rounded w-full" onClick={exportJSON}>ייצא JSON</button>
                <button className="bg-gray-700 text-white px-3 py-1 rounded w-full" onClick={exportCSV}>ייצא CSV</button>
              </div>
              <button
                className="bg-indigo-700 text-white px-3 py-1 rounded w-full mb-2 disabled:opacity-60"
                onClick={exportFullBackup}
                disabled={backupInProgress}
              >
                {backupInProgress ? "מכין גיבוי..." : "📦 גיבוי מלא (אקסל + תמונות)"}
              </button>

              {/* File import */}
              <label className="text-sm mb-2 block">ייבוא מקובץ JSON:</label>
              <input type="file" accept="application/json,.json" onChange={onImportFile} className="mb-3" />

              {/* Paste import */}
              <label className="text-sm mb-1 block">או הדבק כאן JSON ולחץ ייבוא:</label>
              <textarea className="border p-2 w-full h-24 mb-2" placeholder='הדבק כאן JSON של לוח כדי לייבא' value={importText} onChange={(e) => setImportText(e.target.value)} />
              <button className="bg-gray-600 text-white px-3 py-1 rounded w-full" onClick={importJSON}>ייבא JSON מהטקסט</button>

              <div className="text-xs text-gray-600 mt-2">טיפ: בזמן גרירה אפשר ללחוץ ALT כדי <span className="font-medium">להעתיק</span> במקום להזיז.</div>
            </div>

            {/* Auto backup */}
            <div className="p-3 rounded border">
              <div className="font-bold mb-2">גיבוי אוטומטי</div>
              <label className="text-sm flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  checked={autoBackupEnabled}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setAutoBackupEnabled(on);
                    if (on) performAutoBackup();
                  }}
                />
                הורד קובץ גיבוי (JSON) אוטומטית כל
              </label>
              <select
                className="border p-1 mb-2"
                value={autoBackupIntervalMin}
                disabled={!autoBackupEnabled}
                onChange={(e) => setAutoBackupIntervalMin(Number(e.target.value))}
              >
                <option value={5}>5 דקות</option>
                <option value={10}>10 דקות</option>
                <option value={15}>15 דקות</option>
                <option value={30}>30 דקות</option>
              </select>
              {lastBackupAt && <div className="text-xs text-gray-600">גיבוי אחרון: {lastBackupAt}</div>}
              <div className="text-xs text-gray-500 mt-1">הקובץ יורד לתיקיית ההורדות של הדפדפן; מדלג אם שום דבר לא השתנה מאז הגיבוי הקודם. בחלק מהדפדפנים ייתכן שיוצג אישור להורדות חוזרות.</div>
            </div>

            {/* Excel / CSV schedule import */}
            <div className="p-3 rounded border">
              <div className="font-bold mb-2">ייבוא לוח מאקסל / CSV</div>
              <div className="text-xs text-gray-600 mb-2">מוסיף אירועים חדשים לתכנית הקיימת (לא מוחק כלום). מומלץ להתחיל מהתבנית.</div>
              <button className="bg-emerald-700 text-white px-3 py-1 rounded w-full mb-2" onClick={downloadScheduleTemplate}>⬇ הורד תבנית (Excel)</button>
              <label className="text-sm mb-1 block">ייבוא קובץ (.xlsx או .csv):</label>
              <input type="file" accept=".xlsx,.xls,.csv" onChange={onImportScheduleFile} />
            </div>

            {/* Category manager */}
            <button className="bg-gray-800 text-white px-3 py-2 rounded w-full" onClick={() => setShowCategoriesModal(true)}>🏷️ ניהול קטגוריות</button>
            <button className="bg-red-700 text-white px-3 py-2 rounded w-full" onClick={() => { setDuplicateIdsToDelete(new Set()); setShowDuplicatesModal(true); }}>🧹 בדיקת כפילויות</button>
          </div>
        </aside>

        {/* Resizer handle */}
        <div
          onMouseDown={onResizeStart}
          style={{ cursor: "col-resize", width: 6, background: "#e5e7eb", order: 1 }}
          className="print:hidden hover:bg-gray-400 transition-colors"
          title="גרור כדי לשנות רוחב סיידבר"
        />

        {/* Schedule area */}
        <main className="flex-1 overflow-x-auto print-main" style={{ order: isSidebarLeft ? 2 : 0 }} dir="rtl">
          {armedEvent && (
            <div className="flex items-center justify-between gap-2 bg-amber-50 border border-amber-400 text-amber-900 text-sm rounded px-3 py-2 mb-2 print:hidden" dir="rtl">
              <span>📌 מוכן למיקום: <b>{armedEvent.title || "ללא כותרת"}</b> — לחצ/י על משבצת בלוח כדי למקם</span>
              <button className="text-xs border border-amber-500 rounded px-2 py-1" onClick={() => { setArmedEventId(null); broadcastArm({ type: "clear-armed" }); }}>ביטול</button>
            </div>
          )}
          {/* Day headers */}
          <div className="grid grid-headers print-grid" style={{ gridTemplateColumns: `6rem repeat(${days.length}, ${dayColWidthPx}px)` }} dir="rtl">
            <div className="p-2 text-right text-sm font-bold bg-gray-50 border">שעה</div>
            {days.map((d, idx) => (
              <div key={d.dateKey} className="p-2 text-center bg-gray-50 border">
                <button className="font-bold underline underline-offset-4 hover:no-underline" onClick={() => setZoomDay(idx)} title="תקריב ליום זה">
                  {d.labelTop}
                </button>
                <div className="text-xs text-gray-600">{d.labelBottom}</div>
                {getHolidayLabel(d.dateKey) && (
                  <div className="text-[11px] text-rose-700 mt-0.5">{getHolidayLabel(d.dateKey)}</div>
                )}
                {isOwner && showPrices && (<div className="text-xs mt-1">סה"כ: <span className="font-medium">₪{dayTotal(idx).toLocaleString()}</span></div>)}
              </div>
            ))}
          </div>

          {/* Grid body */}
          <div className="grid grid-body border border-gray-300 bg-white print-grid" style={{ gridTemplateColumns: `6rem repeat(${days.length}, ${dayColWidthPx}px)` }} dir="rtl">
            {/* Hours column */}
            <div className="relative border-l border-gray-300">
              <div style={{ height: timeSlots.length * SLOT_PX }} className="relative">
                {timeSlots.map((t, i) => (
                  <div key={t} className="absolute right-0 pr-2 text-xs text-gray-700" style={{ top: i * SLOT_PX - 7 }}>
                    {t}
                  </div>
                ))}
              </div>
            </div>

            {/* Day columns */}
            {days.map((_, dayIndex) => (
              <div
                key={dayIndex}
                className="relative border-l border-gray-300 cursor-pointer"
                style={{ height: timeSlots.length * SLOT_PX, backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.08) 1px, transparent 1px)`, backgroundSize: `100% ${SLOT_PX}px` }}
                onClick={(ev) => {
                  const time = timeFromClientY(ev.currentTarget, ev.clientY);
                  if (armedEventId) {
                    placeEventExact(dayIndex, time, armedEventId);
                    setArmedEventId(null);
                    broadcastArm({ type: "clear-armed" });
                  } else {
                    placeEventExact(dayIndex, time);
                  }
                }}
                onDragOver={(ev) => {
                  ev.preventDefault();
                  ev.dataTransfer.dropEffect = ev.altKey ? "copy" : "move";
                }}
                onDrop={(ev) => {
                  ev.preventDefault();
                  const idStr = ev.dataTransfer.getData("text/event-id");
                  const id = idStr || draggedEventId;
                  if (id == null) return;
                  const time = timeFromClientY(ev.currentTarget, ev.clientY);
                  placeEventExact(dayIndex, time, id, !!ev.altKey);
                  setDraggedEventId(null);
                }}
              >
                {/* Placed events */}
                {events
                  .filter((e) => e.placed && e.dayIndex === dayIndex)
                  .filter(visibleEventsFilter)
                  .map((e) => (
                    <div
                      key={e.id}
                      className={`shadow-sm text-xs text-right ${selectedEventId === e.id ? "ring-2 ring-indigo-500" : ""} ${e.confirmed ? "ring-1 ring-emerald-600" : ""}`}
                      style={{ ...boxStyleFor(e), background: catByKey[e.categoryKey]?.color ?? "#93c5fd" }}
                      onClick={(event) => { event.stopPropagation(); setSelectedEventId(e.id); }}
                      draggable
                      onDragStart={(ev) => {
                        ev.dataTransfer.setData("text/event-id", String(e.id));
                        ev.dataTransfer.effectAllowed = "copyMove";
                        setDraggedEventId(e.id);
                      }}
                      onDragEnd={() => setDraggedEventId(null)}
                      dir="rtl"
                    >
                      
                      <div className="absolute top-1 left-1 z-10">
                        <button
                          type="button"
                          className="w-4 h-4 rounded-full border flex items-center justify-center text-[10px]"
                          style={{ background: e.confirmed ? "#16a34a" : "white", color: e.confirmed ? "white" : "#16a34a", borderColor: "#16a34a" }}
                          title={e.confirmed ? "אירוע סופי (לחץ לביטול)" : "סמן כסופי"}
                          onClick={(ev) => { ev.stopPropagation(); toggleConfirmed(e.id); }}
                        >
                          {e.confirmed ? "✓" : ""}
                        </button>
                      </div>
<div className="absolute top-1 right-1 flex gap-1">
                        <button title="החזר לבנק" className="bg-white/80 rounded px-1 text-[10px]" onClick={(ev) => { ev.stopPropagation(); sendToBank(e.id); }}>📥</button>
                        <button title="עריכה" className="bg-white/80 rounded px-1 text-[10px]" onClick={(ev) => { ev.stopPropagation(); setSelectedEventId(e.id); }}>✎</button>
                        <button title="מחיקה" className="bg-white/80 rounded px-1 text-[10px] text-red-600" onClick={(ev) => { ev.stopPropagation(); deleteEvent(e.id); }}>✕</button>
                      </div>
                      <div className={"px-2 pt-5 font-semibold text-[13px] " + (e.duration > 60 ? "" : "truncate")} style={e.duration > 60 ? { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } : undefined}>{e.title || "ללא כותרת"}</div>
                      {((Array.isArray(e.images) && e.images.length > 0) || (Array.isArray(e.videos) && e.videos.length > 0) || e.techRiderText || e.techRiderUrl || e.logoUrl) ? (
                        <div className="px-2 text-[10px] leading-none">
                          {Array.isArray(e.images) && e.images.length > 0 && <span title={`${e.images.length} תמונות מצורפות`}>🖼️</span>}
                          {Array.isArray(e.videos) && e.videos.length > 0 && <span title={`${e.videos.length} סרטונים מצורפים`}> 🎬</span>}
                          {e.logoUrl && <span title="לוגו מצורף"> 🏷️</span>}
                          {(e.techRiderText || e.techRiderUrl) && <span title="מפרט טכני מצורף"> 📄</span>}
                          {e.dataComplete && <span title="כל הפרטים הוזנו"> ✅</span>}
                        </div>
                      ) : null}
                      {e.organization && (
                        <div className="absolute bottom-5 right-2 text-[10px] opacity-85 truncate max-w-[10rem]">ארגון: {e.organization}</div>
                      )}
                      <div className="absolute bottom-1 right-2 text-[10px] opacity-85">
                        {e.time} • {e.duration} דק' {isOwner && showPrices && eventTotal(e) > 0 ? `• ₪${eventTotal(e)}` : ""}
                      </div>
                      {/* Resize handle */}
                      <div
                        className="absolute left-2 right-2 h-2 bottom-0 cursor-ns-resize bg-black/20 rounded"
                        onMouseDown={(ev) => startResize(e, ev.clientY)}
                        onDragStart={(ev) => ev.preventDefault()}
                        title="גרור לשינוי משך"
                      />
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </main>

        {/* Notes bank (right side) */}
        {notesBankOpen ? (
          <>
            <div
              onMouseDown={onNotesResizeStart}
              style={{ cursor: "col-resize", width: 6, background: "#e5e7eb", order: 3 }}
              className="print:hidden hover:bg-gray-400 transition-colors"
              title="גרור כדי לשנות רוחב בנק הפתקים"
            />
            <aside
              className="shrink-0 print:hidden"
              style={{ width: notesBankWidthPx, minWidth: 240, order: 4 }}
              dir="rtl"
            >
              <div className="sticky top-4 p-2">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="font-bold">בנק פתקים</h2>
                  <div className="flex gap-1">
                    <button className="text-xs border rounded px-2 py-1" onClick={openBankPopout} title="פתח את הבנק בחלון נפרד — אפשר לגרור למסך שני">🖥 חלון נפרד</button>
                    <button className="text-xs border rounded px-2 py-1" onClick={() => setNotesBankOpen(false)} title="סגור את בנק הפתקים">✕ סגור</button>
                  </div>
                </div>

                {armedEvent && (
                  <div className="flex items-center justify-between gap-2 bg-amber-50 border border-amber-400 text-amber-900 text-xs rounded px-2 py-1.5 mb-2" dir="rtl">
                    <span>📌 מסומן: <b>{armedEvent.title || "ללא כותרת"}</b> — לחצ/י על משבצת בלוח</span>
                    <button className="border border-amber-500 rounded px-1.5" onClick={() => { setArmedEventId(null); broadcastArm({ type: "clear-armed" }); }}>ביטול</button>
                  </div>
                )}

                {notesBankTabs}
              </div>
            </aside>
          </>
        ) : (
          <button
            type="button"
            className="print:hidden self-start mt-4 border rounded px-2 py-1 text-xs bg-white h-fit"
            style={{ order: 3 }}
            onClick={() => setNotesBankOpen(true)}
            title="פתח את בנק הפתקים"
          >
            📋 בנק פתקים
          </button>
        )}
      </div>

      {/* Add Event modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center p-6 z-50 print:hidden overflow-auto" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-[480px] max-w-full" onClick={(e) => e.stopPropagation()} dir="rtl">
            <div className="flex items-center justify-between border-b p-3">
              <div className="font-bold">הוסף אירוע חדש</div>
              <button className="px-3 py-1" onClick={() => setShowAddModal(false)}>סגור ✕</button>
            </div>
            <div className="max-h-[80vh] overflow-auto p-4">
              <input type="text" placeholder="שם האירוע" className="border p-1 mb-2 w-full" value={newEvent.title} onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })} />
              <select className="border p-1 mb-2 w-full" value={newEvent.duration} onChange={(e) => setNewEvent({ ...newEvent, duration: Number(e.target.value) })}>
                {DURATIONS.map((m) => (
                  <option key={m} value={m}>{durationLabel(m)}</option>
                ))}
              </select>
              <input type="text" placeholder="איש קשר" className="border p-1 mb-2 w-full" value={newEvent.contact} onChange={(e) => setNewEvent({ ...newEvent, contact: e.target.value })} />
              <input type="tel" placeholder="טלפון איש קשר" className="border p-1 mb-2 w-full" value={newEvent.contactPhone || ""} onChange={(e) => setNewEvent({ ...newEvent, contactPhone: e.target.value })} />
              <input type="text" placeholder="ארגון" className="border p-1 mb-2 w-full" value={newEvent.organization} onChange={(e) => setNewEvent({ ...newEvent, organization: e.target.value })} />
              <textarea placeholder="תיאור" className="border p-1 mb-2 w-full h-16" value={newEvent.description} onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })} />
              <textarea placeholder="תקציר (לניהול אירועים באתר)" className="border p-1 mb-2 w-full h-12" value={newEvent.summary} onChange={(e) => setNewEvent({ ...newEvent, summary: e.target.value })} />
              <select className="border p-1 mb-2 w-full" value={newEvent.categoryKey} onChange={(e) => setNewEvent({ ...newEvent, categoryKey: e.target.value })}>
                {categories.map((c) => (<option key={c.key} value={c.key}>{c.name}</option>))}
              </select>
              <div className="text-xs mb-1 text-gray-600">קהל יעד:</div>
              <div className="mb-2">
                <AudienceCheckboxes selected={newEvent.audiences} onChange={(audiences) => setNewEvent({ ...newEvent, audiences })} />
              </div>
              {isOwner && (
                <>
                  <div className="text-xs mb-1 text-gray-600">עלות (רכיבים):</div>
                  <div className="mb-2">
                    <CostItemsEditor items={newEvent.costItems} onChange={(costItems) => setNewEvent({ ...newEvent, costItems })} />
                  </div>
                </>
              )}
              <div className="text-xs mb-1 text-gray-600">תמונות:</div>
              <div className="mb-2">
                <ImagesEditor items={newEvent.images} onChange={(images) => setNewEvent({ ...newEvent, images })} />
              </div>
              <div className="text-xs mb-1 text-gray-600">וידאו:</div>
              <div className="mb-2">
                <VideosEditor items={newEvent.videos} onChange={(videos) => setNewEvent({ ...newEvent, videos })} />
              </div>
              <button
                className="bg-green-600 text-white px-3 py-1 rounded w-full"
                onClick={() => { addEvent(); setShowAddModal(false); }}
              >
                הוסף פתק
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Event modal */}
      {editEventModal}

      {/* Totals modal */}
      {isOwner && showTotalsModal && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center p-6 z-50 print:hidden overflow-auto" onClick={() => setShowTotalsModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-[520px] max-w-full" onClick={(e) => e.stopPropagation()} dir="rtl">
            <div className="flex items-center justify-between border-b p-3">
              <div className="font-bold">סיכומים</div>
              <button className="px-3 py-1" onClick={() => setShowTotalsModal(false)}>סגור ✕</button>
            </div>
            <div className="max-h-[80vh] overflow-auto p-4 space-y-4">
              <label className="text-sm flex items-center gap-2">
                <input type="checkbox" checked={sumPlacedOnly} onChange={(e) => setSumPlacedOnly(e.target.checked)} />
                חשב סכומים רק לאירועים שננעצו
              </label>

              <div className="p-3 rounded border">
                <div className="font-bold mb-2">סיכומי קטגוריות {sumPlacedOnly ? "(נעוצים בלבד)" : "(כולל פתקים)"}</div>
                <div className="mb-3">
                  <PieChart data={categories.map((c) => ({ label: c.name, value: categoryTotals[c.key] || 0, color: c.color }))} />
                </div>
                <ul className="text-sm space-y-1">
                  {categories.map((c) => (
                    <li key={c.key} className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <span className="inline-block w-3 h-3 rounded" style={{ background: c.color }} />
                        {c.name}
                      </span>
                      <span>₪{(categoryTotals[c.key] || 0).toLocaleString()}</span>
                    </li>
                  ))}
                  <li className="flex items-center justify-between border-t pt-1 mt-2 font-semibold">
                    <span>סה״כ</span>
                    <span>₪{categoriesGrandTotal.toLocaleString()}</span>
                  </li>
                </ul>
              </div>

              <div className="p-3 rounded border">
                <div className="font-bold mb-2">סיכומי ארגונים {sumPlacedOnly ? "(נעוצים בלבד)" : "(כולל פתקים)"}</div>
                <div className="mb-3">
                  <PieChart data={Object.entries(orgTotals).map(([org, sum], i) => ({ label: org, value: sum, color: colorForIndex(i) }))} />
                </div>
                <ul className="text-sm space-y-1">
                  {Object.entries(orgTotals).map(([org, sum]) => (
                    <li key={org} className="flex items-center justify-between">
                      <span className="truncate max-w-[12rem]" title={org}>{org}</span>
                      <span>₪{sum.toLocaleString()}</span>
                    </li>
                  ))}
                  <li className="flex items-center justify-between border-t pt-1 mt-2 font-semibold">
                    <span>סה״כ</span>
                    <span>₪{orgGrandTotal.toLocaleString()}</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Categories modal */}
      {showCategoriesModal && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center p-6 z-50 print:hidden overflow-auto" onClick={() => setShowCategoriesModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-[480px] max-w-full" onClick={(e) => e.stopPropagation()} dir="rtl">
            <div className="flex items-center justify-between border-b p-3">
              <div className="font-bold">ניהול קטגוריות</div>
              <button className="px-3 py-1" onClick={() => setShowCategoriesModal(false)}>סגור ✕</button>
            </div>
            <div className="max-h-[80vh] overflow-auto p-4">
              <div className="space-y-2">
                {categories.map((c) => (
                  <div key={c.key} className="flex items-center gap-2">
                    <input
                      className="border p-1 flex-1"
                      value={c.name}
                      onChange={(e) => {
                        const name = e.target.value;
                        setCategories((prev) => prev.map((x) => x.key === c.key ? { ...x, name } : x));
                        runCloudWrite(() => updateCategory(c.key, { name }));
                      }}
                    />
                    <input
                      type="color"
                      className="w-10 h-8 p-0 border rounded"
                      value={c.color}
                      onChange={(e) => {
                        const color = e.target.value;
                        setCategories((prev) => prev.map((x) => x.key === c.key ? { ...x, color } : x));
                        runCloudWrite(() => updateCategory(c.key, { color }));
                      }}
                    />
                    <button
                      className="px-2 py-1 text-red-700 border rounded"
                      onClick={() => {
                        setEvents((prev) => prev.map((e) => (e.categoryKey === c.key ? { ...e, categoryKey: "general" } : e)));
                        setCategories((prev) => prev.filter((x) => x.key !== c.key));
                        runCloudWrite(async () => {
                          await reassignEventsCategory(c.key, "general");
                          await deleteCategoryByKey(c.key);
                        });
                      }}
                      disabled={c.key === "general"}
                    >
                      מחק
                    </button>
                  </div>
                ))}
              </div>
              <button
                className="mt-3 bg-emerald-600 text-white px-3 py-1 rounded"
                onClick={() => {
                  const key = `cat_${Math.random().toString(36).slice(2, 7)}`;
                  const newCat = { key, name: "קטגוריה חדשה", color: "#93c5fd" };
                  setCategories((prev) => [...prev, newCat]);
                  runCloudWrite(() => insertCategory(newCat));
                }}
              >
                הוסף קטגוריה
              </button>
              <div className="text-xs text-gray-500 mt-1">מחיקת קטגוריה מעבירה את האירועים שלה ל"כללי".</div>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate-cleanup modal */}
      {showDuplicatesModal && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center p-6 z-50 print:hidden overflow-auto" onClick={() => setShowDuplicatesModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-[640px] max-w-full" onClick={(e) => e.stopPropagation()} dir="rtl">
            <div className="flex items-center justify-between border-b p-3">
              <div className="font-bold">בדיקת כפילויות</div>
              <button className="px-3 py-1" onClick={() => setShowDuplicatesModal(false)}>סגור ✕</button>
            </div>
            <div className="max-h-[80vh] overflow-auto p-4">
              <div className="text-xs text-gray-600 mb-3">
                אירועים המופיעים כאן חולקים כותרת זהה. סמן/י את ההעתקים שברצונך למחוק (לא נמחק כלום עד שתלחצ/י על הכפתור בתחתית).
              </div>
              {(() => {
                const groups = buildDuplicateGroups();
                if (groups.length === 0) {
                  return <div className="text-sm text-gray-500">לא נמצאו כפילויות לפי כותרת זהה. 🎉</div>;
                }
                return groups.map((group) => (
                  <div key={group.title} className="mb-4 border rounded p-2">
                    <div className="font-semibold text-sm mb-2">{group.title} ({group.items.length} עותקים)</div>
                    {group.items.map((e) => (
                      <label key={e.id} className="flex items-center gap-2 text-xs py-1 border-t first:border-t-0 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={duplicateIdsToDelete.has(e.id)}
                          onChange={(ev) => {
                            setDuplicateIdsToDelete((prev) => {
                              const next = new Set(prev);
                              if (ev.target.checked) next.add(e.id); else next.delete(e.id);
                              return next;
                            });
                          }}
                        />
                        <span className="flex-1">
                          {e.placed && e.dayIndex != null && e.time ? `ממוקם: יום ${e.dayIndex + 1} • ${e.time}` : "לא ממוקם"}
                          {e.organization ? ` • ${e.organization}` : ""}
                          {" • "}{catByKey[e.categoryKey]?.name || e.categoryKey}
                        </span>
                      </label>
                    ))}
                  </div>
                ));
              })()}
            </div>
            {duplicateIdsToDelete.size > 0 && (
              <div className="border-t p-3 flex items-center justify-between">
                <span className="text-sm">{duplicateIdsToDelete.size} מסומנים למחיקה</span>
                <button
                  className="bg-red-700 text-white px-3 py-1 rounded"
                  onClick={() => {
                    duplicateIdsToDelete.forEach((id) => deleteEvent(id));
                    setDuplicateIdsToDelete(new Set());
                  }}
                >
                  מחק את המסומנים
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Zoom modal: single-day canvas with absolute events + resize handle */}
      {zoomDay != null && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center p-6 z-50 print:hidden" onClick={() => setZoomDay(null)}>
          <div className="bg-white rounded-xl shadow-xl w-[980px] max-w-full overflow-hidden" onClick={(e) => e.stopPropagation()} dir="rtl">
            <div className="flex items-center justify-between border-b p-3">
              <div className="font-bold">תקריב • {days[zoomDay]?.labelTop} – {days[zoomDay]?.labelBottom}</div>
              <button className="px-3 py-1" onClick={() => setZoomDay(null)}>סגור ✕</button>
            </div>
            <div className="max-h-[75vh] overflow-auto p-3">
              <div className="grid" style={{ gridTemplateColumns: "6rem 1fr" }} dir="rtl">
                {/* Hours gutter */}
                <div className="relative border-l border-gray-300">
                  <div style={{ height: timeSlots.length * SLOT_PX }} className="relative">
                    {timeSlots.map((t, i) => (
                      <div key={t} className="absolute right-0 pr-2 text-xs text-gray-700" style={{ top: i * SLOT_PX - 7 }}>
                        {t}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Day canvas */}
                <div
                  className="relative border-l border-gray-300 cursor-pointer"
                  style={{ height: timeSlots.length * SLOT_PX, backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.08) 1px, transparent 1px)`, backgroundSize: `100% ${SLOT_PX}px` }}
                  onClick={(ev) => {
                    const time = timeFromClientY(ev.currentTarget, ev.clientY);
                    if (armedEventId) {
                      placeEventExact(zoomDay, time, armedEventId);
                      setArmedEventId(null);
                      broadcastArm({ type: "clear-armed" });
                    } else {
                      placeEventExact(zoomDay, time);
                    }
                  }}
                  onDragOver={(ev) => {
                    ev.preventDefault();
                    ev.dataTransfer.dropEffect = ev.altKey ? "copy" : "move";
                  }}
                  onDrop={(ev) => {
                    ev.preventDefault();
                    const idStr = ev.dataTransfer.getData("text/event-id");
                    const id = idStr || draggedEventId;
                    if (id == null) return;
                    const time = timeFromClientY(ev.currentTarget, ev.clientY);
                    placeEventExact(zoomDay, time, id, !!ev.altKey);
                    setDraggedEventId(null);
                  }}
                >
                  {events
                    .filter((e) => e.placed && e.dayIndex === zoomDay)
                    .filter(visibleEventsFilter)
                    .map((e) => (
                      <div
                        key={e.id}
                        className={`shadow-sm text-xs text-right ${selectedEventId === e.id ? "ring-2 ring-indigo-500" : ""} ${e.confirmed ? "ring-1 ring-emerald-600" : ""}`}
                        style={{ ...boxStyleFor(e), background: catByKey[e.categoryKey]?.color ?? "#93c5fd" }}
                        onClick={(event) => { event.stopPropagation(); setSelectedEventId(e.id); }}
                        draggable
                        onDragStart={(ev) => {
                          ev.dataTransfer.setData("text/event-id", String(e.id));
                          ev.dataTransfer.effectAllowed = "copyMove";
                          setDraggedEventId(e.id);
                        }}
                        onDragEnd={() => setDraggedEventId(null)}
                        dir="rtl"
                      >
                        
                      <div className="absolute top-1 left-1 z-10">
                        <button
                          type="button"
                          className="w-4 h-4 rounded-full border flex items-center justify-center text-[10px]"
                          style={{ background: e.confirmed ? "#16a34a" : "white", color: e.confirmed ? "white" : "#16a34a", borderColor: "#16a34a" }}
                          title={e.confirmed ? "אירוע סופי (לחץ לביטול)" : "סמן כסופי"}
                          onClick={(ev) => { ev.stopPropagation(); toggleConfirmed(e.id); }}
                        >
                          {e.confirmed ? "✓" : ""}
                        </button>
                      </div>
<div className="absolute top-1 right-1 flex gap-1">
                          <button title="החזר לבנק" className="bg-white/80 rounded px-1 text-[10px]" onClick={(ev) => { ev.stopPropagation(); sendToBank(e.id); }}>📥</button>
                          <button title="עריכה" className="bg-white/80 rounded px-1 text-[10px]" onClick={(ev) => { ev.stopPropagation(); setSelectedEventId(e.id); }}>✎</button>
                          <button title="מחיקה" className="bg-white/80 rounded px-1 text-[10px] text-red-600" onClick={(ev) => { ev.stopPropagation(); deleteEvent(e.id); }}>✕</button>
                        </div>
                        <div className={"px-2 pt-5 font-semibold text-[13px] " + (e.duration > 60 ? "" : "truncate")} style={e.duration > 60 ? { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } : undefined}>{e.title || "ללא כותרת"}</div>
                      {((Array.isArray(e.images) && e.images.length > 0) || (Array.isArray(e.videos) && e.videos.length > 0) || e.techRiderText || e.techRiderUrl || e.logoUrl) ? (
                        <div className="px-2 text-[10px] leading-none">
                          {Array.isArray(e.images) && e.images.length > 0 && <span title={`${e.images.length} תמונות מצורפות`}>🖼️</span>}
                          {Array.isArray(e.videos) && e.videos.length > 0 && <span title={`${e.videos.length} סרטונים מצורפים`}> 🎬</span>}
                          {e.logoUrl && <span title="לוגו מצורף"> 🏷️</span>}
                          {(e.techRiderText || e.techRiderUrl) && <span title="מפרט טכני מצורף"> 📄</span>}
                          {e.dataComplete && <span title="כל הפרטים הוזנו"> ✅</span>}
                        </div>
                      ) : null}
                        {e.organization && (
                          <div className="absolute bottom-5 right-2 text-[10px] opacity-85 truncate max-w-[12rem]">ארגון: {e.organization}</div>
                        )}
                        <div className="absolute bottom-1 right-2 text-[10px] opacity-85">
                          {e.time} • {e.duration} דק' {isOwner && showPrices && eventTotal(e) > 0 ? `• ₪${eventTotal(e)}` : ""}
                        </div>
                        {/* Resize handle */}
                        <div
                          className="absolute left-2 right-2 h-2 bottom-0 cursor-ns-resize bg-black/20 rounded"
                          onMouseDown={(ev) => startResize(e, ev.clientY)}
                          onDragStart={(ev) => ev.preventDefault()}
                          title="גרור לשינוי משך"
                        />
                      </div>
                    ))}
                </div>
              </div>
              {isOwner && showPrices && (<div className="text-right mt-3 font-medium">סה"כ יום: ₪{dayTotal(zoomDay).toLocaleString()}</div>)}
            </div>
          </div>
        </div>
      )}

      {/* print styles */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          html, body { width: 100%; margin: 0; padding: 0; }
          .print-page { padding: 0 !important; }
          .print-main { overflow: visible !important; }
          .print-grid { grid-template-columns: 6rem repeat(9, 1fr) !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

          .print:hidden { display: none !important; }
          .print:block { display: block !important; }
          table { page-break-inside: avoid; }
          th, td { font-size: 10px; padding: 4px; }
        }
      `}</style>
    </div>
  );
}
