// Instruments' ConditionInducer service (Xcode > Devices > Device Conditions), over a DtxConnection (incident I-199,
// tools/thermal.mjs). Ported from appium-ios packages/remotexpc/src/services/ios/dvt/instruments/condition-inducer.ts
// (Apache-2.0, commit bd9ba5fd86b87035b15023ae46d3bcec928266b5); the group fields (isActive, activeProfile) follow go-ios
// ios/instruments/devicestate.go (MIT, commit 273d3e06e803fb6ee95e4df914d8be82c5ee4bb0). See tools/NOTICE.
//   availableConditionInducers                          -> [group {identifier, name, isActive, activeProfile, profiles}]
//   enableConditionWithIdentifier:profileIdentifier:    (group id, profile id) -> true
//   disableActiveCondition                              -> true, or an NSError when none is active
// One condition at a time per device. go-ios devicestate.go (Enable's comment): the device ends a condition when the
// DTX connection that set it closes.
import { AUX } from './dtx.mjs';
import { isNSError, errorText } from './nskeyed.mjs';

export const SERVICE = 'com.apple.instruments.server.services.ConditionInducer';
/** Thermal enables can take long (go-ios uses a 120 s timeout). */
export const ENABLE_TIMEOUT_MS = 120000;
export const ALIASES = Object.freeze(['fair', 'serious', 'critical']);

/** Normalized groups (pure): [{ identifier, name, isActive, activeProfile, profiles: [{ identifier, name, description }] }]. */
export function normalizeGroups(raw) {
  if (!Array.isArray(raw)) throw new Error(`availableConditionInducers: unexpected reply ${JSON.stringify(raw)?.slice(0, 200)}`);
  return raw.map((g) => ({
    identifier: String(g?.identifier ?? ''),
    name: g?.name ?? null,
    isActive: g?.isActive === true,
    activeProfile: g?.activeProfile || null,
    profiles: (Array.isArray(g?.profiles) ? g.profiles : []).map((p) => ({ identifier: String(p?.identifier ?? ''), name: p?.name ?? null, description: p?.description ?? null })),
  }));
}

/** The active condition { group, profile } (ids), or null (pure). */
export function activeOf(groups) {
  const g = groups.find((x) => x.isActive);
  return g ? { group: g.identifier, profile: g.activeProfile } : null;
}

/**
 * The { group, profile } for a wanted name (pure): an exact profile identifier, or an alias fair|serious|critical
 * that names exactly one profile of a thermal group (identifier or name contains the word). Throws with the choices.
 */
export function resolveProfile(groups, wanted) {
  const w = String(wanted ?? '').trim();
  if (!w) throw Object.assign(new Error('set needs a profile: fair, serious, critical or an exact profile identifier (node tools/thermal.mjs list)'), { usage: true });
  for (const g of groups) for (const p of g.profiles) if (p.identifier === w) return { group: g.identifier, profile: p.identifier };
  const thermal = groups.filter((g) => /thermal/i.test(`${g.identifier} ${g.name ?? ''}`));
  if (ALIASES.includes(w.toLowerCase())) {
    const re = new RegExp(w, 'i');
    const hits = thermal.flatMap((g) => g.profiles.filter((p) => re.test(`${p.identifier} ${p.name ?? ''}`)).map((p) => ({ group: g.identifier, profile: p.identifier })));
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) throw new Error(`"${w}" names ${hits.length} thermal profiles (${hits.map((h) => h.profile).join(', ')}): pass the exact identifier`);
  }
  const all = (thermal.length ? thermal : groups).flatMap((g) => g.profiles.map((p) => p.identifier));
  throw new Error(`no condition profile "${w}"; ${thermal.length ? 'thermal' : 'available'} profiles: ${all.join(', ') || '(none)'}`);
}

/** The ConditionInducer on an open DtxConnection. */
export class ConditionInducer {
  constructor(conn) { this.conn = conn; this.code = null; }
  async open() { if (this.code === null) this.code = await this.conn.channel(SERVICE); return this; }
  async list({ timeoutMs = 30000 } = {}) {
    await this.open();
    return normalizeGroups(await this.conn.call(this.code, 'availableConditionInducers', [], { timeoutMs }));
  }
  /** Enable a { group, profile }; resolves when the device confirms (true). */
  async enable({ group, profile }, { timeoutMs = ENABLE_TIMEOUT_MS } = {}) {
    await this.open();
    const r = await this.conn.call(this.code, 'enableConditionWithIdentifier:profileIdentifier:', [{ type: AUX.OBJECT, value: group }, { type: AUX.OBJECT, value: profile }], { timeoutMs });
    if (r !== true) throw new Error(`enable ${group}/${profile} refused: ${isNSError(r) ? errorText(r) : JSON.stringify(r)}`);
  }
  /** 'cleared' (a condition was on), or 'none' (the device answered with an NSError). I-233: an NSError does NOT prove that
   *  nothing is active: on our phone it came while `list` showed Xcode's condition ACTIVE (10-07 03:09Z, OBSERVED; the
   *  service seems to disable only a condition this connection set); the error's text is kept in `this.noneWhy`, and
   *  callers re-read `list` to tell "none" from "held by another client" (thermal.mjs clear). */
  async disable({ timeoutMs = 30000 } = {}) {
    await this.open();
    let r;
    this.noneWhy = null;
    try { r = await this.conn.call(this.code, 'disableActiveCondition', [], { timeoutMs }); } catch (e) { if (e.nserror) { this.noneWhy = e.message; return 'none'; } throw e; }
    if (r === true) return 'cleared';
    if (isNSError(r)) { this.noneWhy = errorText(r); return 'none'; }
    throw new Error(`disableActiveCondition: unexpected reply ${JSON.stringify(r)?.slice(0, 200)}`);
  }
}

/**
 * `thermal.mjs set`'s hold: print the SET line (announce), then wait for its end: a signal (SIGINT/SIGTERM/SIGHUP ->
 * {why: sig}), the hold elapsing ({why: "<n> s elapsed"}) or the connection closing ({lost: err}).
 * The handlers go in BEFORE announce() (I-234): the SET write reaches a reader at once, and a SIGTERM sent on reading it
 * that arrived before the handlers existed got Node's default action (killed, exit null, the condition left on).
 */
export function holdUntilEnd({ holdSec = 0, conn = null, announce = () => {} } = {}) {
  const end = new Promise((resolve) => {
    const timer = holdSec ? setTimeout(() => resolve({ why: `${holdSec} s elapsed` }), holdSec * 1000) : null;
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(sig, () => { if (timer) clearTimeout(timer); resolve({ why: sig }); });
    conn?.once('close', (e) => { if (timer) clearTimeout(timer); resolve({ lost: e }); });
  });
  announce();
  return end;
}
