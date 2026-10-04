// Verdict of one thermal-gate read (pure function, no device; self-test: selftest.mjs).
// Profiles: 'real-serious' (condition B, state Serious not induced, the original default), 'real-fair' (condition A,
// --expect fair) and 'xcode-serious' (user T-162 #3, 2026-10-04: Xcode's Device Conditions "Serious" is the default
// test profile, no heat pre-warm; --accept-induced).
// Exit codes: 0 PASS; 1 no read; 2 too cool; 3 ceiling (Critical or battery >= maxC; kept in every profile); 4 induced by
// Xcode (not accepted); 5 Serious during a Fair check; 6 timer grid disagrees with the state; 7 xcode-serious wanted but
// the Serious state is real heat (Is Induced = No): a different profile, never pooled (name it in the ticket).
// Parse one `xctrace export` of the device-thermal-state-intervals table (pure; self-test: selftest.mjs).
// Columns: start, duration, end, thermal-state, track-label, is-induced, narrative. xctrace writes a repeated value once
// (`<thermal-state id="4" fmt="Serious">`) and later as `<thermal-state ref="4"/>`, so cells resolve through the ids.
// Under Xcode's Device Conditions it writes two rows per interval: track "Current" (the state the device reports,
// is-induced No) and track "Induced" (is-induced Yes, its state a ref to the Current row's): fixtures/induced-serious-2rows.xml,
// captured 2026-10-04 22:10Z (iphone-runner). Rules: state = the Current-track rows' resolved state (all rows when no row
// has a track label); "state changed" compares those resolved states only; an unresolvable state cell is an error,
// never a guess; induced = Yes when any row says Yes, No when rows say only No, null when no row has the cell.
export function parseThermalRows(xml) {
  const ids = new Map();
  for (const m of String(xml).matchAll(/<[\w-]+ id="(\d+)" fmt="([^"]*)"/g)) ids.set(m[1], m[2]);
  const cell = (row, tag) => {
    const m = row.match(new RegExp(`<${tag} (?:id="\\d+" fmt="([^"]*)"|ref="(\\d+)")`));
    if (!m) return { has: false, v: null };
    return { has: true, v: m[1] !== undefined ? m[1] : ids.get(m[2]) ?? null };
  };
  // the column cells come before the narrative, which repeats a thermal-state inside itself: read each row up to it
  const rows = [...String(xml).matchAll(/<row>([\s\S]*?)<\/row>/g)].map((m) => {
    const r = m[1].split('<narrative')[0];
    return { state: cell(r, 'thermal-state'), track: cell(r, 'string').v, induced: cell(r, 'boolean').v };
  });
  const labelled = rows.some((r) => r.track);
  const cur = labelled ? rows.filter((r) => r.track === 'Current') : rows;
  const inducedVals = rows.map((r) => r.induced).filter(Boolean);
  const induced = inducedVals.includes('Yes') ? 'Yes' : inducedVals.length ? 'No' : null;
  const out = (state, err = null) => ({ state, induced, rows: rows.length, err });
  if (!rows.length) return out(null, 'no thermal state row');
  if (!cur.length) return out(null, `no Current-track row (${rows.length} rows)`);
  if (cur.some((r) => !r.state.v)) return out(null, `unresolvable thermal-state cell (${rows.length} rows)`);
  const state = cur[cur.length - 1].state.v;
  if (!/^(Nominal|Fair|Serious|Critical)$/.test(state)) return out(null, `unknown thermal state "${state}"`);
  if (cur.some((r) => r.state.v !== state)) return out(state, `state changed during the read (${cur.length} Current rows)`);
  return out(state);
}

export function gateVerdict({ err = null, state = null, induced = null, battC = null, maxC = 44, expect = 'serious', acceptInduced = false, timer = null }) {
  const profile = expect === 'fair' ? 'real-fair' : acceptInduced ? 'xcode-serious' : 'real-serious';
  const out = (code, why = '') => ({ code, why, profile });
  if (err || !state) return out(1, err || 'no thermal state row');
  if (state === 'Critical' || (battC ?? 0) >= maxC) return out(3, `ceiling (${state === 'Critical' ? 'Critical' : `batt >= ${maxC} C`})`);
  if (acceptInduced && expect === 'serious') {
    if (state !== 'Serious') return out(2, `too cool (${state})`);
    if (induced !== 'Yes') return out(7, 'Serious is real heat, not the Xcode condition (profile real-serious, not xcode-serious)');
    // the timer grid is recorded, not judged: whether an induced Serious also moves WebKit's timers is UNRESOLVED
    return out(0);
  }
  if (induced === 'Yes') return out(4, 'induced by Xcode');
  if (expect === 'serious' && state !== 'Serious') return out(2, `too cool (${state})`);
  if (expect === 'fair' && state === 'Serious') return out(5, 'too hot for a Fair check (Serious)');
  if (timer && ((state === 'Serious') !== (timer.median >= 25))) return out(6, `timer grid ${timer.median} ms disagrees with ${state} (LPM? page hidden?)`);
  return out(0);
}
