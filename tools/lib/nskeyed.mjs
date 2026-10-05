// NSKeyedArchiver encode/decode for DTX payloads (incident I-199, tools/thermal.mjs). Ported from appium-ios
// packages/remotexpc/src/services/ios/dvt/nskeyedarchiver-encoder.ts and nskeyedarchiver-decoder.ts (Apache-2.0,
// commit bd9ba5fd86b87035b15023ae46d3bcec928266b5; see tools/NOTICE), reduced to the classes DTX uses here and with
// NSError kept as an object the caller can recognise (isNSError).
//
// SPDX-License-Identifier: Apache-2.0 (port); Copyright the appium-ios contributors and this repo's authors.
import { Uid, buildBplist, parseBplist } from './bplist.mjs';

const CLASSES = {
  NSArray: ['NSArray', 'NSObject'],
  NSDictionary: ['NSDictionary', 'NSObject'],
  NSMutableData: ['NSMutableData', 'NSData', 'NSObject'],
};

/** The NSKeyedArchiver plist object for a JS value (string, number, boolean, null, Buffer, array, plain object). */
export function archive(root) {
  const objects = ['$null'];
  const classes = new Map();
  const classUid = (name) => {
    if (!classes.has(name)) { classes.set(name, objects.length); objects.push({ $classes: CLASSES[name], $classname: name }); }
    return new Uid(classes.get(name));
  };
  function put(v) {
    if (v === null || v === undefined) return 0;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') { objects.push(v); return objects.length - 1; }
    const idx = objects.length;
    objects.push(null);
    if (Buffer.isBuffer(v)) objects[idx] = { 'NS.data': v, $class: classUid('NSMutableData') };
    else if (Array.isArray(v)) { const refs = v.map((x) => new Uid(put(x))); objects[idx] = { 'NS.objects': refs, $class: classUid('NSArray') }; }
    else if (typeof v === 'object') {
      const keys = Object.keys(v);
      const k = keys.map((key) => new Uid(put(key)));
      const o = keys.map((key) => new Uid(put(v[key])));
      objects[idx] = { 'NS.keys': k, 'NS.objects': o, $class: classUid('NSDictionary') };
    } else throw new Error(`NSKeyedArchiver: unsupported type ${typeof v}`);
    return idx;
  }
  const root_ = put(root);
  return { $version: 100000, $archiver: 'NSKeyedArchiver', $top: { root: new Uid(root_) }, $objects: objects };
}

/** archive() serialized as a bplist buffer. */
export const archiveBuffer = (v) => buildBplist(archive(v));

export const isArchive = (o) => !!o && typeof o === 'object' && o.$archiver === 'NSKeyedArchiver' && Array.isArray(o.$objects);

/** A decoded NSError: { $class: 'NSError', domain, code, userInfo }. */
export const isNSError = (v) => !!v && typeof v === 'object' && (v.$class === 'NSError' || ('NSDomain' in v && 'NSCode' in v));

/** A readable line for an NSError (or anything else). */
export function errorText(v) {
  if (!isNSError(v)) return typeof v === 'string' ? v : JSON.stringify(v);
  const info = v.userInfo || v.NSUserInfo || {};
  const desc = info.NSLocalizedDescription || info.NSLocalizedFailureReason || info.NSDebugDescription || '';
  return `${v.domain ?? v.NSDomain ?? '?'} ${v.code ?? v.NSCode ?? '?'}${desc ? `: ${desc}` : ''}`;
}

/** The JS value of an NSKeyedArchiver plist object; anything else is returned unchanged. */
export function unarchive(arc) {
  if (!isArchive(arc)) return arc;
  const objs = arc.$objects;
  const memo = new Map();
  const ref = (r) => (r instanceof Uid ? r.uid : r);
  function val(i, depth = 0) {
    if (depth > 256) throw new Error('NSKeyedArchiver: nesting too deep');
    if (typeof i !== 'number' || i < 0 || i >= objs.length) return null;
    if (memo.has(i)) return memo.get(i);
    const o = objs[i];
    if (o === '$null' || o === null) return null;
    if (typeof o !== 'object' || Buffer.isBuffer(o) || o instanceof Date) return o;
    if (o instanceof Uid) return val(o.uid, depth + 1);
    const cls = o.$class instanceof Uid ? objs[o.$class.uid]?.$classname : undefined;
    const sub = (r) => (r instanceof Uid ? val(r.uid, depth + 1) : r); // a plain value (e.g. NSError's NSCode) stays
    let out;
    if (Array.isArray(o['NS.keys']) && Array.isArray(o['NS.objects'])) {
      out = {};
      memo.set(i, out);
      o['NS.keys'].forEach((k, n) => { out[String(sub(k))] = sub(o['NS.objects'][n]); });
    } else if (Array.isArray(o['NS.objects'])) {
      out = [];
      memo.set(i, out);
      for (const r of o['NS.objects']) out.push(sub(r));
    } else if ('NS.string' in o) out = String(o['NS.string']);
    else if ('NS.bytes' in o && !('NS.data' in o)) out = o['NS.bytes'];
    else if ('NS.data' in o) out = o['NS.data'];
    else if ('NS.time' in o) out = new Date(Date.UTC(2001, 0, 1) + Number(o['NS.time']) * 1000);
    else if (cls === 'NSNull') out = null;
    else if (cls === 'NSError' || ('NSDomain' in o && 'NSCode' in o)) {
      out = { $class: 'NSError', domain: sub(o.NSDomain), code: sub(o.NSCode), userInfo: o.NSUserInfo !== undefined ? sub(o.NSUserInfo) : null };
    } else {
      out = cls ? { $class: cls } : {};
      memo.set(i, out);
      for (const [k, v] of Object.entries(o)) if (k !== '$class') out[k] = v instanceof Uid ? sub(v) : v;
    }
    memo.set(i, out);
    return out;
  }
  return val(ref(arc.$top?.root));
}

/** Parse a bplist buffer and unarchive it when it is an NSKeyedArchiver archive. */
export const unarchiveBuffer = (buf) => unarchive(parseBplist(buf));
