// Scrub the user's account and device identifiers from text that the finger-simulation tools print or save
// (Hard rule 12: they stay on this machine; an agent's terminal output leaves it). Used for every error message
// and log tail of `iphone.mjs wda` and `iphone.mjs gesture`, WDA error bodies, and the strings a gesture run
// saves. Local files outside the repo (~/.cache/fw-wda/config.json, build.log, runner.log) keep the real values:
// xcodebuild needs them, and they are read there, not printed.
//
// Two layers: the values we know (config.json: team, UDID, runner bundle id matched case-insensitively, also
// the team inside a lower-cased bundle id; the device name case-sensitively, and not at all when it is a
// generic model name like "iPhone") and shapes that are ids whatever their value, as xcodebuild and WDA print them:
//   UDID (00008130-001234567890ABCD; 40-hex legacy), CoreDevice/any UUID, a *.WebDriverAgentRunner bundle id,
//   a 10-character team id (upper-case letters and digits, both present), "name:<device>" in xcodebuild
//   destination lists, "<Someone>'s iPhone/iPad", an e-mail address (Apple Account), the person's name in a
//   signing identity ("Apple Development: <name> (<team>)"), a labelled ECID / UniqueChipID or serial number,
//   and an unlabelled 11-12 character serial number.

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// a person's name word: "Mark", "Anna-Lena", "O'Brien", or a caseless script ("ส้มโอ"); not a digit-bearing token
// (v11, H1c, V13), a single letter (C, B) or V plus one letter (Vc), the study's build names (I-228)
const NAME_WORD = "(?:(?:\\p{Lu}['’])?(?!V\\p{Ll}['’]s )\\p{Lu}\\p{Ll}[\\p{L}\\p{M}-]*|\\p{Lo}[\\p{Lo}\\p{M}]*)";

export const PATTERNS = [
  // labelled hardware ids (ideviceinfo, xcodebuild/devicectl dumps): ECID / UniqueChipID, serial number (review-gesture-2)
  [/\b(ECID|UniqueChipID|ChipID|ecid)(["']?\s*[:=]\s*["']?)(0x)?[0-9A-Fa-f]{6,20}\b/g, '$1$2<ecid>'],
  [/\b(SerialNumber|serialNumber|Serial Number|serial number|serial)(["']?\s*[:=]\s*["']?)[A-Za-z0-9]{8,14}\b/g, '$1$2<serial>'],
  [/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '<email>'],
  [/\b(Apple Development|Apple Distribution|iPhone Developer|iPhone Distribution|Developer ID Application):\s*[^(\n"']+?\s*\(/g, '$1: <name> ('],
  [/\b[A-Za-z0-9][A-Za-z0-9-]*(\.[A-Za-z0-9-]+)*\.WebDriverAgentRunner(\.xctrunner)?\b/g, '<runner-bundle-id>$2'],
  [/\b[0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}\b/g, '<udid>'],
  [/\b[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\b/g, '<uuid>'],
  [/\b[0-9a-fA-F]{40}\b/g, '<udid>'],
  [/\bname:[^,}\n]*[^,}\n ]/g, 'name:<device>'],
  // "<Name>'s iPhone" (I-228, I-139): one or two name words, each capitalised (a cased script) or caseless (Thai);
  // a build or version token (v11, C, Vc, H1c, P1) or lower-case prose ("phone test's Mac") is no name, and only
  // the name is replaced: the words after "iPhone" stay
  [new RegExp(`(?<![\\p{L}\\p{N}_.'’-])(?:${NAME_WORD} )?${NAME_WORD}['’]s (?:iPhone|iPad|iPod|MacBook|Mac)\\b`, 'gu'), '<device-name>'],
  [/\b(?=[A-Z0-9]{10}\b)(?=[A-Z0-9]*[0-9])(?=[A-Z0-9]*[A-Z])[A-Z0-9]{10}\b/g, '<team>'],
  // an unlabelled Apple serial number (11-12 upper-case letters and digits, both present)
  [/\b(?=[A-Z0-9]{11,12}\b)(?=[A-Z0-9]*[0-9])(?=[A-Z0-9]*[A-Z])[A-Z0-9]{11,12}\b/g, '<serial>'],
];

/** A device name that identifies no one (the factory default "iPhone", "iPhone 15 Pro Max", "iPad"): not
 *  replaced, or every mention of the model in a message would be scrubbed too. */
export const GENERIC_DEVICE_NAME = /^(iPhone|iPad|iPod( touch)?)( \d+)?( (Pro|Max|Plus|mini|Air|SE|e))*$/;

/**
 * Replace known ids ({team, udid, bundleId, deviceName}, e.g. wda-runner's config) and id-shaped strings.
 * Any value: non-strings are returned unchanged.
 */
export function redact(text, known = {}) {
  if (typeof text !== 'string' || !text) return text;
  let s = text;
  // ids: case-insensitively (a lower-cased team inside a bundle id); the device name, free text the user chose:
  // case-sensitively and only when it is not a generic model name (review-gesture-2)
  const name = known.deviceName && !GENERIC_DEVICE_NAME.test(String(known.deviceName).trim()) ? known.deviceName : null;
  const pairs = [[known.bundleId, '<runner-bundle-id>', 'gi'], [name, '<device-name>', 'g'], [known.udid, '<udid>', 'gi'], [known.team, '<team>', 'gi']];
  for (const [v, ph, fl] of pairs) if (v && String(v).length >= 4) s = s.replace(new RegExp(esc(v), fl), ph);
  if (known.udid) s = s.replace(new RegExp(esc(String(known.udid).replace(/-/g, '')), 'gi'), '<udid>');
  for (const [re, ph] of PATTERNS) s = s.replace(re, ph);
  return s;
}
