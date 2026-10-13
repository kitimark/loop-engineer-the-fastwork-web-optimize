# Licensing

This study uses different licences for different parts. `REUSE.toml` lists them per path in the machine-readable
[REUSE](https://reuse.software/) format; the licence texts are in `LICENSES/`.

| Part | Licence |
|---|---|
| Code: `tools/`, `tests/`, `.githooks/`, `.claude/`, scripts anywhere (`*.mjs`, `*.js`, `*.py`, `*.sh`), `package.json` | MIT (`LICENSE`) |
| Text: research and fix write-ups, `memory/`, the console record and the chat export | CC BY 4.0 |
| Fastwork's material: the frozen copy of their homepage (`site/`, `site-pretty/`, a GitHub Release file), the lines of their code inside `fixes/*/patch.diff`, and pictures and recordings of their page (proposal pictures, `out/` media, `research/team-article/capture/v8/media/`) | Not licensed by this project: Fastwork's, published with their permission (`LICENSES/LicenseRef-Fastwork-Permission.txt`) |
| Third-party code | its own licence: gifenc (MIT, Matt DesLauriers), the Lighthouse BenchmarkIndex copy (BSD-3-Clause, The Chromium Authors) |

In a patch, the lines we added are MIT and the quoted Fastwork lines are not ours. Reusing Fastwork's material outside this
study needs Fastwork's own permission. This study is personal and educational and is not affiliated with Fastwork.
