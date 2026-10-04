// Verdict of one thermal-gate read (pure function, no device; self-test: selftest.mjs).
// Profiles: 'real-serious' (condition B, state Serious not induced, the original default), 'real-fair' (condition A,
// --expect fair) and 'xcode-serious' (user T-162 #3, 2026-10-04: Xcode's Device Conditions "Serious" is the default
// test profile, no heat pre-warm; --accept-induced).
// Exit codes: 0 PASS; 1 no read; 2 too cool; 3 ceiling (Critical or battery >= maxC; kept in every profile); 4 induced by
// Xcode (not accepted); 5 Serious during a Fair check; 6 timer grid disagrees with the state; 7 xcode-serious wanted but
// the Serious state is real heat (Is Induced = No): a different profile, never pooled (name it in the ticket).
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
