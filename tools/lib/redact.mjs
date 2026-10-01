// Scrub the user's account and device identifiers from text that the finger-simulation tools print or save
// (Hard rule 12: they stay on this machine; an agent's terminal output leaves it). Used for every error message
// and log tail of `iphone.mjs wda` and `iphone.mjs gesture`, WDA error bodies, and the strings a gesture run
// saves. Local files outside the repo (~/.cache/fw-wda/config.json, build.log, runner.log) keep the real values:
// xcodebuild needs them, and they are read there, not printed.
//
// Two layers: the values we know (config.json: team, UDID, runner bundle id, device name; matched
// case-insensitively, also the team inside a lower-cased bundle id) and shapes that are ids whatever their
// value, as xcodebuild and WDA print them:
//   UDID (00008130-001234567890ABCD; 40-hex legacy), CoreDevice/any UUID, a *.WebDriverAgentRunner bundle id,
//   a 10-character team id (upper-case letters and digits, both present), "name:<device>" in xcodebuild
//   destination lists, "<Someone>'s iPhone/iPad", an e-mail address (Apple Account), and the person's name in a
//   signing identity ("Apple Development: <name> (<team>)").

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const PATTERNS = [
  [/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '<email>'],
  [/\b(Apple Development|Apple Distribution|iPhone Developer|iPhone Distribution|Developer ID Application):\s*[^(\n"']+?\s*\(/g, '$1: <name> ('],
  [/\b[A-Za-z0-9][A-Za-z0-9-]*(\.[A-Za-z0-9-]+)*\.WebDriverAgentRunner(\.xctrunner)?\b/g, '<runner-bundle-id>$2'],
  [/\b[0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}\b/g, '<udid>'],
  [/\b[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\b/g, '<uuid>'],
  [/\b[0-9a-fA-F]{40}\b/g, '<udid>'],
  [/\bname:[^,}\n]*[^,}\n ]/g, 'name:<device>'],
  [/\b[\p{L}\p{N}_.-]+(?:[ ][\p{L}\p{N}_.-]+)?['’]s (iPhone|iPad|iPod|Mac|MacBook)\b[\p{L}\p{N} ]*/gu, '<device-name>'],
  [/\b(?=[A-Z0-9]{10}\b)(?=[A-Z0-9]*[0-9])(?=[A-Z0-9]*[A-Z])[A-Z0-9]{10}\b/g, '<team>'],
];

/**
 * Replace known ids ({team, udid, bundleId, deviceName}, e.g. wda-runner's config) and id-shaped strings.
 * Any value: non-strings are returned unchanged.
 */
export function redact(text, known = {}) {
  if (typeof text !== 'string' || !text) return text;
  let s = text;
  const pairs = [[known.bundleId, '<runner-bundle-id>'], [known.deviceName, '<device-name>'], [known.udid, '<udid>'], [known.team, '<team>']];
  for (const [v, ph] of pairs) if (v && String(v).length >= 4) s = s.replace(new RegExp(esc(v), 'gi'), ph);
  if (known.udid) s = s.replace(new RegExp(esc(String(known.udid).replace(/-/g, '')), 'gi'), '<udid>');
  for (const [re, ph] of PATTERNS) s = s.replace(re, ph);
  return s;
}
