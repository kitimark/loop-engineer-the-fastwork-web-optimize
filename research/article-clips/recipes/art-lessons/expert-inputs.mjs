// Inputs for the expert-user scenario: phone hold time per phone check (holds.log ledger, field `block`),
// proposal decision latency (console proposals: proposedAt -> first decision), agent-hours by role prefix.
// Numbers only. Writes expert-inputs.json.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
const here = new URL('.', import.meta.url).pathname;
const G = '.git/fastwork-mirror';
const H = readFileSync(G + '/locks/holds.log', 'utf8').trim().split('\n').map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(x => x && x.resource === 'iphone' && x.ledger);
const blocks = {}; for (const h of H) { const k = h.block || '(no block mark)'; const b = blocks[k] = blocks[k] || { holds: 0, heldMin: 0, runMin: 0, coolMin: 0, userMin: 0 }; b.holds++; b.heldMin += h.durationSec / 60; b.runMin += h.runSec / 60; b.coolMin += h.coolingSec / 60; b.userMin += h.userWaitSec / 60; }
for (const b of Object.values(blocks)) for (const k of Object.keys(b)) b[k] = Math.round(b[k]);
const lat = []; for (const f of readdirSync(G + '/console/proposals').filter(f => /^PR-\d+\.json$/.test(f))) { const o = JSON.parse(readFileSync(G + '/console/proposals/' + f, 'utf8')); const d = (o.decisions || [])[0]; if (d?.at) { const h = (Date.parse(d.at) - Date.parse(o.proposedAt || o.createdAt)) / 36e5; if (h >= 0) lat.push(h); } }
lat.sort((a, b) => a - b); const q = p => Math.round(lat[Math.floor(lat.length * p)] * 100) / 100;
const A = JSON.parse(readFileSync(here + 'agent-effort.json', 'utf8')); const roles = {};
for (const [k, v] of Object.entries(A)) { const p = k.startsWith('session:') ? 'lead session' : /^iphone-runner/.test(k) ? 'iphone-runner' : /^agent-/.test(k) ? 'unnamed' : (k.match(/^[a-z]+(?=-)/) || [k])[0]; const r = roles[p] = roles[p] || { agents: 0, h: 0, usd: 0 }; r.agents++; r.h += v.activeH; r.usd += v.usd; }
for (const r of Object.values(roles)) r.h = Math.round(r.h);
const out = { phoneBlocks: blocks, proposalDecisionH: { n: lat.length, p25: q(0.25), median: q(0.5), p75: q(0.75), sum: Math.round(lat.reduce((a, b) => a + b, 0)) }, roles };
writeFileSync(here + 'expert-inputs.json', JSON.stringify(out, null, 1)); console.log(JSON.stringify(out.proposalDecisionH));
