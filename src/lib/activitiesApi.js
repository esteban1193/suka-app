import { supabase } from "./supabaseClient";

// Uploads a file to the given bucket ("activity-images" or "activity-videos") and returns its
// public URL. Filenames are randomized to avoid collisions between different activities.
export async function uploadMedia(bucket, file) {
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file);
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

// DB row (snake_case) -> app event shape (camelCase) — matches the shape App.jsx already uses
export function rowToEvent(row) {
  return {
    id: row.id,
    title: row.title,
    duration: row.duration,
    categoryKey: row.category_key,
    audiences: row.audiences || [],
    costItems: row.cost_items || [],
    description: row.description,
    summary: row.summary,
    contact: row.contact,
    contactPhone: row.contact_phone,
    organization: row.organization,
    confirmed: row.confirmed,
    dataComplete: row.data_complete || false,
    placed: row.placed,
    dayIndex: row.day_index,
    time: row.time,
    images: row.images || [],
    videos: row.videos || [],
    techRiderText: row.tech_rider_text || "",
    techRiderUrl: row.tech_rider_url || "",
    logoUrl: row.logo_url || "",
  };
}

const FIELD_MAP = {
  title: "title",
  duration: "duration",
  categoryKey: "category_key",
  audiences: "audiences",
  costItems: "cost_items",
  description: "description",
  summary: "summary",
  contact: "contact",
  contactPhone: "contact_phone",
  organization: "organization",
  confirmed: "confirmed",
  dataComplete: "data_complete",
  placed: "placed",
  dayIndex: "day_index",
  time: "time",
  images: "images",
  videos: "videos",
  techRiderText: "tech_rider_text",
  techRiderUrl: "tech_rider_url",
  logoUrl: "logo_url",
};

// Columns that are NOT NULL in the schema, with the same default the column itself uses.
// Needed because Postgres only applies a column's DEFAULT when a field is omitted from the
// statement — an explicit `null` (which older/imported events can genuinely have, not just
// `undefined`) bypasses the default and hits the NOT NULL constraint directly.
const NOT_NULL_DEFAULTS = {
  title: "",
  duration: 30,
  categoryKey: "general",
  audiences: [],
  costItems: [],
  description: "",
  summary: "",
  contact: "",
  contactPhone: "",
  organization: "",
  confirmed: false,
  dataComplete: false,
  placed: false,
  images: [],
  videos: [],
  techRiderText: "",
  techRiderUrl: "",
  logoUrl: "",
};

// app event shape -> full DB row (every column, with defaults applied) — for INSERT, where every
// NOT NULL column must be satisfied.
function eventToRow(event) {
  const row = { id: event.id };
  Object.entries(FIELD_MAP).forEach(([appKey, column]) => {
    const raw = event[appKey];
    if (raw === undefined) {
      if (appKey in NOT_NULL_DEFAULTS) row[column] = NOT_NULL_DEFAULTS[appKey];
      return;
    }
    row[column] = raw === null && appKey in NOT_NULL_DEFAULTS ? NOT_NULL_DEFAULTS[appKey] : raw;
  });
  return row;
}

// partial app patch -> partial DB row — for UPDATE, where only the fields actually being
// changed should be included (anything omitted here is left untouched in the database,
// rather than being reset to a default).
function patchToRow(patch) {
  const row = {};
  Object.entries(patch).forEach(([appKey, value]) => {
    const column = FIELD_MAP[appKey];
    if (!column) return;
    row[column] = value === undefined && appKey in NOT_NULL_DEFAULTS ? NOT_NULL_DEFAULTS[appKey] : value;
  });
  return row;
}

export async function fetchActivities() {
  const { data, error } = await supabase.from("activities").select("*").order("created_at");
  if (error) throw error;
  return data.map(rowToEvent);
}

export async function fetchCategories() {
  const { data, error } = await supabase.from("categories").select("*").order("key");
  if (error) throw error;
  return data;
}

export async function fetchStartDate() {
  const { data, error } = await supabase.from("app_settings").select("start_date").eq("id", true).single();
  if (error) throw error;
  return data.start_date;
}

export async function updateStartDate(startDate) {
  const { error } = await supabase.from("app_settings").update({ start_date: startDate }).eq("id", true);
  if (error) throw error;
}

// ===== Targeted per-row activity writes (safe for concurrent multi-user editing — each action
// only ever touches the one row it actually changed, never anyone else's) =====

export async function insertActivity(event) {
  // .select("id") forces PostgREST to return the row it actually created — belt-and-suspenders
  // alongside the `error` check, so a "succeeded but nothing was actually inserted" case (however
  // it might happen) is caught here instead of surfacing later as a confusing "row not found" on
  // some unrelated future edit to this same event.
  const { data, error } = await supabase.from("activities").insert(eventToRow(event)).select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error(`ההוספה לא אושרה על ידי השרת (id=${event.id}) — ייתכן שהאירוע לא נשמר בפועל.`);
  }
}

export async function insertActivities(events) {
  if (events.length === 0) return;
  const { data, error } = await supabase.from("activities").insert(events.map(eventToRow)).select("id");
  if (error) throw error;
  if (!data || data.length !== events.length) {
    throw new Error(`רק ${data?.length ?? 0} מתוך ${events.length} אירועים נשמרו בפועל בענן.`);
  }
}

export async function updateActivityFields(id, patch) {
  // .select("id") forces PostgREST to return the rows it actually touched. Without it, an
  // .eq("id", id) that matches zero rows (e.g. a locally-held id that no longer exists in the
  // table, such as after a past duplicate/re-import incident) succeeds silently with no error —
  // the write looks fine to the caller but nothing was actually saved.
  const { data, error } = await supabase.from("activities").update(patchToRow(patch)).eq("id", id).select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error(`לא נמצאה בענן שורה עם id=${id} — הפעולה לא נשמרה (ה-id המקומי כנראה לא תואם למסד הנתונים).`);
  }
}

export async function deleteActivityById(id) {
  const { error } = await supabase.from("activities").delete().eq("id", id);
  if (error) throw error;
}

// ===== Targeted per-row category writes =====

export async function insertCategory(category) {
  const { error } = await supabase.from("categories").insert(category);
  if (error) throw error;
}

export async function updateCategory(key, patch) {
  const { error } = await supabase.from("categories").update(patch).eq("key", key);
  if (error) throw error;
}

export async function deleteCategoryByKey(key) {
  const { error } = await supabase.from("categories").delete().eq("key", key);
  if (error) throw error;
}

// Bulk-reassigns every activity currently on `fromKey` to `toKey` in one statement — used when
// deleting a category (matches the app's existing "reassign to כללי" behavior).
export async function reassignEventsCategory(fromKey, toKey) {
  const { error } = await supabase.from("activities").update({ category_key: toKey }).eq("category_key", fromKey);
  if (error) throw error;
}

// ===== Full-table reconciliation — ONLY for explicit "replace everything" actions (JSON
// import/paste), where overwriting the whole table really is the intent. Do not use this for
// regular add/edit/delete actions — see per-row functions above, which are safe under
// concurrent multi-user editing; this reconciliation pattern is not (a snapshot from one
// browser can silently delete/overwrite another user's concurrent changes). =====

export async function syncActivities(events) {
  const byId = new Map();
  events.forEach((e) => byId.set(e.id, e));
  const deduped = Array.from(byId.values());

  const { data: existing, error: fetchError } = await supabase.from("activities").select("id");
  if (fetchError) throw fetchError;
  const keepIds = new Set(deduped.map((e) => e.id));
  const toDelete = (existing || []).map((r) => r.id).filter((id) => !keepIds.has(id));
  if (toDelete.length > 0) {
    const { error: deleteError } = await supabase.from("activities").delete().in("id", toDelete);
    if (deleteError) throw deleteError;
  }
  if (deduped.length > 0) {
    const { error: upsertError } = await supabase.from("activities").upsert(deduped.map(eventToRow));
    if (upsertError) throw upsertError;
  }
}

export async function syncCategories(categories) {
  const { data: existing, error: fetchError } = await supabase.from("categories").select("key");
  if (fetchError) throw fetchError;
  const keepKeys = new Set(categories.map((c) => c.key));
  const toDelete = (existing || []).map((r) => r.key).filter((key) => !keepKeys.has(key));
  if (toDelete.length > 0) {
    const { error: deleteError } = await supabase.from("categories").delete().in("key", toDelete);
    if (deleteError) throw deleteError;
  }
  if (categories.length > 0) {
    const { error: upsertError } = await supabase.from("categories").upsert(categories);
    if (upsertError) throw upsertError;
  }
}
