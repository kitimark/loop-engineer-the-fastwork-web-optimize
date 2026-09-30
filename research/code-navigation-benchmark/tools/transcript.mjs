#!/usr/bin/env node
// Summarise a helper agent's JSONL transcript: tool calls by name, tokens, wall time, final answer JSON.
//   node transcript.mjs <file.jsonl|agentId> [--dir <tasks dir>]
// Wall time = first record timestamp -> last assistant record timestamp. Tokens are summed over
// assistant messages (input incl. cache reads/creation, and output); `ctxPeak` = largest single-request context.
import fs from 'node:fs';
import path from 'node:path';

export function summarise(file) {
  const recs = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const seen = new Set();
  const tools = []; let input = 0, cacheRead = 0, cacheCreate = 0, output = 0, ctxPeak = 0, turns = 0;
  let firstTs = null, lastTs = null; const texts = [];
  const resultChars = {};
  for (const r of recs) {
    if (r.timestamp) { firstTs ??= r.timestamp; }
    const m = r.message;
    if (r.type === 'assistant' && m) {
      lastTs = r.timestamp || lastTs;
      if (m.id && !seen.has(m.id) && m.usage) {
        seen.add(m.id); turns++;
        const u = m.usage;
        input += u.input_tokens || 0; cacheRead += u.cache_read_input_tokens || 0; cacheCreate += u.cache_creation_input_tokens || 0;
        output += u.output_tokens || 0;
        ctxPeak = Math.max(ctxPeak, (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0));
      } else if (m.id && m.usage && seen.has(m.id)) {
        // streamed duplicate of the same message: output tokens grow; keep the max
      }
      for (const c of m.content || []) {
        if (c.type === 'tool_use' && c.name === 'SubagentHandback') { texts.push(c.input?.message || ''); continue; }
        if (c.type === 'tool_use') tools.push({ id: c.id, name: c.name, input: c.input, ts: r.timestamp });
        if (c.type === 'text' && c.text.trim()) texts.push(c.text);
      }
    }
    if (r.type === 'user' && Array.isArray(m?.content)) {
      for (const c of m.content) if (c.type === 'tool_result') {
        const txt = typeof c.content === 'string' ? c.content : (c.content || []).map((x) => x.text || '').join('');
        resultChars[c.tool_use_id] = { chars: txt.length, ts: r.timestamp, isError: !!c.is_error };
      }
    }
  }
  const finalText = [...texts].reverse().find((t) => /```json/.test(t)) || texts.at(-1) || '';
  const handbackPlaceholder = texts.length > 0 && !/```json/.test(texts.at(-1)) && /```json/.test(finalText);
  for (const t of tools) { const res = resultChars[t.id]; if (res) { t.resultChars = res.chars; t.ms = Date.parse(res.ts) - Date.parse(t.ts); t.isError = res.isError; } }
  const byName = {};
  for (const t of tools) byName[t.name] = (byName[t.name] || 0) + 1;
  const serena = tools.filter((t) => t.name.startsWith('mcp__serena__') && !/initial_instructions|memor/.test(t.name));
  const allAnswers = texts.flatMap((t) => [...t.matchAll(/```json\s*([\s\S]*?)```/g)].map((x) => { try { return JSON.parse(x[1]); } catch { return null; } })).filter(Boolean);
  const m = [...finalText.matchAll(/```json\s*([\s\S]*?)```/g)].pop();
  let answer = null; try { answer = m ? JSON.parse(m[1]) : null; } catch (e) { answer = { parseError: String(e), raw: m[1] }; }
  return {
    wallSec: firstTs && lastTs ? Math.round((Date.parse(lastTs) - Date.parse(firstTs)) / 100) / 10 : null,
    start: firstTs, end: lastTs, turns,
    tokens: { input, cacheRead, cacheCreate, output, total: input + cacheRead + cacheCreate + output, ctxPeak },
    toolCalls: tools.filter((t) => t.name !== 'ToolSearch').length, toolSearch: byName.ToolSearch || 0, byName,
    serenaCalls: serena.length,
    serenaResultChars: serena.reduce((a, t) => a + (t.resultChars || 0), 0),
    serenaMs: serena.reduce((a, t) => a + (t.ms || 0), 0),
    textResultChars: tools.filter((t) => !t.name.startsWith('mcp__') && t.name !== 'ToolSearch').reduce((a, t) => a + (t.resultChars || 0), 0),
    calls: tools.map((t) => ({ name: t.name.replace('mcp__serena__', 'serena.'), ms: t.ms, chars: t.resultChars, err: t.isError || undefined,
      arg: JSON.stringify(t.input).slice(0, 160) })),
    answer, allAnswers, finalText, handbackPlaceholder,
  };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  let f = process.argv[2];
  if (!fs.existsSync(f)) f = path.join(process.env.NAV_BENCH_TASKS || '.', `${f}.output`);
  const s = summarise(f);
  const { finalText, calls, ...rest } = s;
  console.log(JSON.stringify(rest, null, 1));
  if (process.argv.includes('--calls')) for (const c of calls) console.log(`  ${c.name} ${c.ms}ms ${c.chars}ch ${c.arg}`);
}
