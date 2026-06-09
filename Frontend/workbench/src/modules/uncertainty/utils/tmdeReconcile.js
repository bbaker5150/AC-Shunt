// src/modules/uncertainty/utils/tmdeReconcile.js
//
// Referential-integrity guard for a test point's TMDE instances.
//
// Each test point stores `tmdeTolerances`: per-point snapshots of the session's
// master TMDEs (`session.tmdes`), linked back by `sourceId` / `id`. The derived
// engine SUMS every instance mapped to an equation variable (additive
// composition — several deadweights summing to a load), so two failure modes
// silently corrupt a calculation by multiplying a variable's value:
//
//   1. Orphans  — an instance whose master was deleted (or re-created with a new
//      id). It no longer renders in the TMDE table (the table is keyed off the
//      live masters) yet is still summed by the math, so a phantom standard
//      keeps contributing. This is the BRG-3100 "6×" symptom: one visible row,
//      no quantity field, but the value is multiplied.
//   2. Stacking — the SAME master appearing on one point more than once, so a
//      single standard contributes its value repeatedly.
//
// `reconcileTmdeInstances` returns only the instances that map to a LIVE master,
// keeping at most one instance per master (multiplicity belongs in `quantity`,
// never in duplicate rows). DISTINCT masters mapped to one variable — the
// legitimate additive case — are preserved untouched.
//
// Pure: never mutates its inputs. A deliberate no-op for orphan pruning when the
// master list is empty/unknown, so it can't wipe a point's instances while a
// session is still loading.

/** The id of the master a per-point instance was derived from. */
export const masterIdOf = (instance) =>
  instance == null ? undefined : instance.sourceId ?? instance.id;

export const reconcileTmdeInstances = (tmdeTolerances, masterTmdes) => {
  if (!Array.isArray(tmdeTolerances)) return [];

  const validIds = new Set(
    (masterTmdes || []).map((m) => m && m.id).filter((id) => id != null),
  );
  // Only prune orphans when we actually know the master list. An empty set means
  // "masters not loaded yet" — pruning then would wrongly blank every instance.
  const knowMasters = validIds.size > 0;

  const seenMasters = new Set();
  const reconciled = [];

  for (const inst of tmdeTolerances) {
    if (!inst) continue;
    const masterId = masterIdOf(inst);

    // Orphan: the master this instance came from is gone from the session.
    if (knowMasters && !validIds.has(masterId) && !validIds.has(inst.id)) {
      continue;
    }

    // Stacking: this master is already represented on the point. Multiplicity is
    // expressed via `quantity`, so a second instance of the same master is a
    // duplicate that would double-count the value.
    const key = String(masterId ?? inst.id ?? "");
    if (key && seenMasters.has(key)) continue;
    seenMasters.add(key);

    reconciled.push(inst);
  }

  return reconciled;
};

/**
 * True when reconciliation would change the array (orphans or stacked
 * duplicates are present). Used to decide whether to persist a cleaned copy.
 */
export const tmdeInstancesNeedReconcile = (tmdeTolerances, masterTmdes) =>
  Array.isArray(tmdeTolerances) &&
  reconcileTmdeInstances(tmdeTolerances, masterTmdes).length !==
    tmdeTolerances.length;
