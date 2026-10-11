// preview only: inline the cap-area tokens so rsvg-convert can draw the SVGs (no browser)
import fs from 'node:fs';
const T = { paper: '#f1f4f2', 'paper-2': '#e4eae6', ink: '#17221e', 'ink-soft': '#4a5a54', grid: '#d3ddd8', signal: '#2743c9', late: '#c9472a', warn: '#b98a12', you: '#b5651d', lead: '#0f7c80', agents: '#6a4fb3', sheet: '#ffffff' };
const css = `text{font-family:'JetBrains Mono',Menlo,monospace;fill:#4a5a54}.ttl{font-family:'Avenir Next',sans-serif;font-weight:700;fill:#17221e}.sub{font-family:Georgia,serif;fill:#4a5a54}.ink{fill:#17221e}.bold{font-weight:600}.sig{fill:#2743c9}`;
for (let n = 0; n <= 11; n++) {
  let s = fs.readFileSync(`figs-out/team-${n}.svg`, 'utf8');
  s = s.replace(/var\(--([a-z0-9-]+)\)/g, (_, k) => T[k] || (console.error('missing', k), '#f0f'));
  s = s.replace(/(<svg[^>]*>)/, `$1<style>${css}</style><rect width="1200" height="560" fill="#ffffff"/>`);
  fs.writeFileSync(`preview/team-${n}.svg`, s);
}
