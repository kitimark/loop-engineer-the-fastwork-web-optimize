# Image cost: does capping image resolution make the page render smoother? (de-image-cost)

> Personal, educational study on a local mirror of https://fastwork.com/ (not affiliated with Fastwork).
> No image bytes are committed here. Only paths, sizes and counts are committed.

**Trigger:** user thread T-042 (#17, #20). The user asked whether adjusting images helps the browser engine render
more smoothly, and why. The lead's answer gave three mechanisms. The user chose the third to measure: **image
resolution**. Decode cost and memory grow with pixel count, so a 3x image costs about 2.25x what a 2x image costs.
Apple caps its images at 2x (OBSERVED).

**Setting:**
- iOS Simulator (iOS 26.5, WebKit 8624.2.5), 430×775 CSS px at DPR 3.
- Web Inspector Timeline records (Paint, Composite, Layout, RecalculateStyles, RenderingFrame) and Memory tracking.
- Baseline snapshot `b1789284481295-4ad4a84a`, served with `--vendors=local --latency 150`.
- Every run used the shared-lane functional Simulator session: `sim.mjs session --functional`, counts only.
- No iPhone, no Chrome timing and no timing A/B were run.
- **Simulator milliseconds are Mac-CPU milliseconds. They show direction and size class only, not phone timing (F-084).**
- The Mac was busy throughout (load1 10-100). Every comparison is therefore made within one session, arm against
  arm, with an A-against-A pair.

**Status words** follow CLAUDE.md: OBSERVED (our data only), CONFIRMED (a source reference agrees, cited),
UNRESOLVED.

**Tools in this folder** (no Fastwork content):
- `simprobe.mjs`: census, scroll walk, idle, decode-in-paint (`pd`) and pixel (`pix`) probes over WebKit Inspector.
- `inventory.mjs`: turns a census into the per-image table.
- `build-cap.mjs`: builds the 2x-capped overlay arm with `sips` into the gitignored `out/`.
- `summarize.mjs`: writes `results.json` (all numbers below).

## 0. Answer in plain words

1. **Many images are much bigger than the phone can show.**
   - No image has `srcset`, so the phone downloads the desktop-sized file.
   - At 430 px wide, DPR 3, 42 photos are drawn on screen. Decoded at natural size they would take 95.8 MB; a 3x
     screen needs 38.2 MB of them, and a 2x cap 21.9 MB.
   - The worst: hero covers at 2-3.4x the 3x need (peter-cover is 1200×2133 for a 159×149 box), big seller photos
     at 2-3x, and avatars at 3.6-7x (a 640×640 file in a 30 px circle).
2. **Why size can cost smoothness: WebKit sometimes decodes an image on the main thread, at full file size, inside
   the frame that first paints it** (CONFIRMED in WebKit source, §2).
   - This happens when a large image first appears on screen on a part of the page that has already painted: a
     lazy photo arriving while visible, or a hidden card being shown.
   - That decode costs time in proportion to the file's pixels, not the box it is drawn in. Most other decodes
     happen off the main thread at the drawn size, and an image that is already decoded costs almost nothing to
     paint again.
3. **Measured in the Simulator (Mac-CPU ms, OBSERVED):**
   - That first paint costs 8.6-11 ms for the biggest hero covers. With a 2x cap it costs about 1.3 ms. Across 36
     images the total falls from about 200 to 105 ms.
   - In a full scripted scroll, the cap halves the long Paint records: 11-12 → 4-6 over 2 ms, and 5-6 → 0-2 over
     4 ms. Paint time falls about 15 %.
   - The web process's decoded-image memory falls from 14-17 to 3-7 MB.
   - At rest at the top of the page it changes nothing.
4. **But images are not what makes frames slow on this page.** In one scroll, Paint is about 0.25 s in total,
   against about 8 s of Composite and 11 s of Layout. Those do not move with the cap. The cap removes a handful of
   decode spikes: a "less work" gain, not a fix for the big stalls.
5. **The cost of a 2x cap is visible softness.**
   - 46 of 50 capped photos change by more than the T2 limit, with shades up to 178/255 over 1-3 % of the screen
     each.
   - So a cap is a proposal (T3) for the user to judge.
   - A gentler version keeps 3x pixels (cap at 3x, or `srcset` with 2x/3x files). It removes most of the waste and
     should change much less (not measured); it needs its own pixel check.

## 1. Inventory: what the page loads at 430 px, DPR 3

This inventory comes from a WebKit census in the Simulator. It walks the page in 16 half-viewport steps and records
every `<img>` and CSS `url()` image: natural size, the largest box it is drawn in (transform-aware), object-fit,
attributes, and animated ancestors.

**Totals:**
- 167 `<img>` elements, 97 unique URLs.
  - 65 raster images loaded: 10.3 MB on the wire, **164.7 MB** if all were decoded at natural size.
  - 22 SVGs.
  - 11 URLs were never loaded (lazy, never reached).
- 2 CSS background images: `grain.png` (390×311, drawn at 128 px) and `dash.svg`.
- **42 raster images were drawn on screen during the walk.**
  - At natural size they decode to **95.8 MB**.
  - Drawn at 3x they need **38.2 MB**; capped at 2x, **21.9 MB**.
  - 31 are larger than a 3x screen needs, 35 larger than 2x needs, and 20 are more than twice the 3x need.
- **Responsive markup:** no `<img>` has a `srcset` or `sizes`. Every screen downloads, and may decode, the same
  file.
  - Most images are `loading=lazy decoding=async`.
  - Hero cards are `decoding=async`, with no `loading` attribute (eager).
  - The morph-panel column images are `loading=eager`.
- **Motion:** 29 images sit under an animated ancestor. These are the future-section cards, the morph column tracks
  and the #platform cards. Every one of those animations is on `transform`, `opacity` or `filter`.
  - The hero cards show no CSS animation in the census.
  - Only 4 hero covers are on screen at the top. The other hero covers and avatars are loaded but hidden until
    their card is shown.

**Mirror caveat (fidelity):**
- The live page serves AVIF `<picture>` sources for some paths (JS 3475-3486, `IE()`). `roles/` gets `-320.avif`,
  `media/avatar-alt-1` and `post-4` get `-960.avif`, and other `media/` and `platform/service-` paths get `.avif`.
- 6 of those AVIFs are missing from the mirror (404), so the mirror falls back to the larger PNG/JPEG:
  `optimized/media/post-1,2,3`, `cover-cafe`, `platform/service-thumb-bot` and `-main`.
- The roles images in the morph panel use a plain `<img>` (JS 12876) with the 1282² PNG on the live site too.
- Everything else matches the live page's files.

Columns:
- "÷ 3x need" = natural pixels ÷ pixels a 3x screen needs for the largest drawn box (object-fit cover/contain
  aware). Above 1 means the file is larger than any phone screen can show.
- "group box" = the image was loaded but not on screen in the walk; it gets the box of its group, e.g. the hero card.
- Decoded MB = w × h × 4 bytes.

<details><summary>All 65 loaded raster images (click to open)</summary>

| image (under /selling/) | format, KB | natural px | shown CSS px (max) | device px at 3x | natural ÷ 3x need | natural ÷ 2x need | decoded MB natural / at 3x / at 2x | where | moves during scroll | loading |
|---|---|---|---|---|---|---|---|---|---|---|
| hero/peter-cover.jpg | jpg, 343 | 1200×2133 | 159×149 (group box) | 477×447 | 2.5 | 3.8 | 9.76 / 1.54 / 0.69 | hero card | none seen (hero card set) | (none) |
| sellers/photographer/service-strawberry.jpg | jpg, 415 | 1320×1747 | 175×245 | 525×735 | 2.4 | 3.6 | 8.8 / 1.56 / 0.69 | profile showcase (future card) | filter+opacity+transform | lazy |
| hero/nam-cover.jpg | jpg, 379 | 1200×1866 | 159×149 (group box) | 477×447 | 2.5 | 3.8 | 8.54 / 1.35 / 0.60 | hero card | none seen (hero card set) | (none) |
| sellers/sound-composer/post-orchestra.jpg | jpg, 316 | 1600×1067 | 175×117 | 525×351 | 3.0 | 4.6 | 6.51 / 0.70 / 0.31 | profile showcase (future card) | filter+opacity+transform | lazy |
| hero/leobeer-cover.jpg | jpg, 207 | 1200×1148 | 118×111 | 354×333 | 3.4 | 5.1 | 5.26 / 0.46 / 0.20 | hero card | none seen (hero card set) | (none) |
| sellers/photographer/post-tuna-cut.jpg | jpg, 298 | 1035×1400 | 175×233 | 525×699 | 2.0 | 3.0 | 5.53 / 1.42 / 0.63 | profile showcase (future card) | filter+transform | lazy |
| sellers/photographer/post-tuna.jpg | jpg, 317 | 988×1400 | 175×245 | 525×735 | 1.9 | 2.8 | 5.28 / 1.49 / 0.66 | profile showcase (future card) | filter+opacity+transform | lazy |
| roles/graphic-designer.png | png, 429 | 1282×1282 | 130×335 | 389×1005 | 1.3 | 1.9 | 6.27 / 3.85 / 1.71 | morph panel column | transform | eager |
| sellers/photographer/post-football.jpg | jpg, 190 | 1400×846 | 175×105 | 525×315 | 2.7 | 4.0 | 4.52 / 0.64 / 0.28 | profile showcase (future card) | filter+transform | lazy |
| hero/weng-cover.jpg | jpg, 56 | 1090×994 | 118×111 | 354×333 | 3.0 | 4.5 | 4.13 / 0.46 / 0.21 | hero card | none seen (hero card set) | (none) |
| hero/pakincht-cover.jpg | jpg, 311 | 956×1194 | 159×149 (group box) | 477×447 | 2.0 | 3.0 | 4.35 / 1.08 / 0.48 | hero card | none seen (hero card set) | (none) |
| sellers/sound-composer/post-you-me-me.jpg | jpg, 93 | 850×1200 | 175×247 | 525×741 | 1.6 | 2.4 | 3.89 / 1.48 / 0.66 | profile showcase (future card) | filter+opacity+transform | lazy |
| sellers/sound-composer/cover.jpg | jpg, 94 | 1280×800 | 388×182 | 1164×546 | 1.1 | 1.6 | 3.91 / 3.23 / 1.44 | profile showcase (future card) | filter+opacity+transform | lazy/(none) |
| hero/mod-cover.jpg | jpg, 75 | 741×1047 | 159×149 | 477×447 | 1.6 | 2.3 | 2.96 / 1.23 / 0.55 | hero card | none seen (hero card set) | (none) |
| optimized/media/post-5.avif | avif, 70 | 735×893 | 85×85 | 254×254 | 2.9 | 4.3 | 2.5 / 0.30 / 0.13 | #platform | - | lazy |
| roles/architect.png | png, 317 | 1282×1282 | 130×506 (group box) | 389×1518 | 0.8 | 1.3 | 6.27 / 6.27 / 3.91 | morph panel column | - | eager |
| roles/software-engineer.png | png, 396 | 1282×1282 | 130×506 (group box) | 389×1518 | 0.8 | 1.3 | 6.27 / 6.27 / 3.91 | morph panel column | - | eager |
| roles/web-developer.png | png, 357 | 1282×1281 | 130×506 (group box) | 389×1518 | 0.8 | 1.3 | 6.26 / 6.26 / 3.91 | morph panel column | - | eager |
| roles/project-manager.png | png, 328 | 1282×1281 | 130×506 (group box) | 389×1518 | 0.8 | 1.3 | 6.26 / 6.26 / 3.91 | morph panel column | - | eager |
| sellers/photographer/avatar.jpg | jpg, 81 | 730×732 | 59×59 | 177×177 | 4.1 | 6.2 | 2.04 / 0.12 / 0.05 | profile showcase (future card) | filter+opacity+transform | lazy |
| sellers/sound-composer/post-maynila.jpg | jpg, 280 | 683×1024 | 175×263 | 525×789 | 1.3 | 1.9 | 2.67 / 1.58 / 0.70 | profile showcase (future card) | filter+opacity+transform | lazy |
| sellers/photographer/cover.jpg | jpg, 180 | 1200×669 | 388×182 | 1164×546 | 1.0 | 1.5 | 3.06 / 2.88 / 1.28 | profile showcase (future card) | filter+opacity+transform | lazy |
| media/post-4.jpg | jpg, 145 | 819×1024 | 130×346 | 389×1037 | 1.0 | 1.5 | 3.2 / 3.20 / 1.46 | morph panel column | transform | eager |
| sellers/ux-ui-designer/avatar.jpg | jpg, 66 | 640×640 | 30×30 | 90×90 | 7.1 | 10.7 | 1.56 / 0.03 / 0.01 | hero card avatar | - | (none) |
| sellers/sound-composer/avatar.jpg | jpg, 30 | 640×640 | 59×59 | 177×177 | 3.6 | 5.4 | 1.56 / 0.12 / 0.05 | profile showcase (future card) | filter+opacity+transform | lazy |
| hero/bold-cover.jpg | jpg, 75 | 656×656 | 159×149 | 477×447 | 1.4 | 2.1 | 1.64 / 0.87 / 0.39 | hero card | none seen (hero card set) | (none) |
| hero/chapavich-cover.jpg | jpg, 44 | 656×656 | 159×149 (group box) | 477×447 | 1.4 | 2.1 | 1.64 / 0.87 / 0.39 | hero card | none seen (hero card set) | (none) |
| hero/buttercup-cover.jpg | jpg, 46 | 656×656 | 159×149 (group box) | 477×447 | 1.4 | 2.1 | 1.64 / 0.87 / 0.39 | hero card | none seen (hero card set) | (none) |
| hero/slayalldeep-cover.jpg | jpg, 76 | 656×656 | 159×149 (group box) | 477×447 | 1.4 | 2.1 | 1.64 / 0.87 / 0.39 | hero card | none seen (hero card set) | (none) |
| sellers/ai-video-editor/avatar.jpg | jpg, 28 | 480×480 | 22×22 | 66×66 | 7.3 | 10.9 | 0.88 / 0.02 / 0.01 | hero card avatar | - | (none) |
| sellers/ai-automation/avatar.jpg | jpg, 33 | 480×480 | 32×32 | 96×96 | 5.0 | 7.5 | 0.88 / 0.04 / 0.02 | #future people-o face | filter+opacity+transform | lazy |
| sellers/graphic-designer/avatar.jpg | jpg, 42 | 480×480 | 32×32 | 96×96 | 5.0 | 7.5 | 0.88 / 0.04 / 0.02 | #future people-o face | filter+opacity+transform | lazy |
| sellers/web-developer/avatar.jpg | jpg, 36 | 480×480 | 32×32 | 96×96 | 5.0 | 7.5 | 0.88 / 0.04 / 0.02 | #future people-o face | filter+opacity+transform | lazy |
| media/cover-cafe.jpg | jpg, 392 | 960×539 | 130×204 | 389×611 | 0.9 | 1.3 | 1.97 / 1.97 / 1.13 | morph panel column | transform | eager |
| work/work-c.jpg | jpg, 84 | 735×893 | 130×378 | 389×1135 | 0.8 | 1.2 | 2.5 / 2.50 / 1.80 | morph panel column | transform | eager |
| media/service-kitchen.png | png, 366 | 410×512 | 96×116 | 289×349 | 1.4 | 2.1 | 0.8 / 0.40 / 0.18 | #platform profile tile; morph column | filter+opacity+transform | lazy/eager |
| commission/client-avatar-2.png | png, 25 | 349×479 | 28×28 | 84×84 | 4.2 | 6.2 | 0.64 / 0.04 / 0.02 | commission / #platform cred | - | lazy |
| commission/client-avatar-3.png | png, 24 | 320×480 | 28×28 | 84×84 | 3.8 | 5.7 | 0.59 / 0.04 / 0.02 | commission / #platform cred | filter+opacity+transform | lazy |
| commission/avatar-john.jpg | jpg, 24 | 320×480 | 29×29 | 86×86 | 3.7 | 5.6 | 0.59 / 0.04 / 0.02 | commission / #platform cred | opacity+transform | lazy |
| hero/peter-avatar.jpg | jpg, 31 | 320×480 | 30×30 (group box) | 90×90 | 3.6 | 5.3 | 0.59 / 0.05 / 0.02 | hero card | none seen (hero card set) | (none) |
| commission/client-avatar-1.png | png, 24 | 319×479 | 28×28 | 84×84 | 3.8 | 5.7 | 0.58 / 0.04 / 0.02 | commission / #platform cred | - | lazy |
| platform/features/secure/network/portrait-left.png | png, 24 | 320×480 | 59×59 | 176×176 | 1.8 | 2.7 | 0.59 / 0.18 / 0.08 | #platform secure | opacity+transform | lazy |
| platform/features/secure/network/portrait-right.png | png, 37 | 320×480 | 59×59 | 176×176 | 1.8 | 2.7 | 0.59 / 0.18 / 0.08 | #platform secure | opacity+transform | lazy |
| hero/nam-avatar.jpg | jpg, 18 | 320×427 | 30×30 (group box) | 90×90 | 3.6 | 5.3 | 0.52 / 0.04 / 0.02 | hero card | none seen (hero card set) | (none) |
| hero/weng-avatar.jpg | jpg, 19 | 320×322 | 22×22 | 66×66 | 4.8 | 7.3 | 0.39 / 0.02 / 0.01 | hero card | none seen (hero card set) | (none) |
| sellers/reviewers/r5.jpg | jpg, 17 | 320×320 | 24×24 | 73×73 | 4.4 | 6.6 | 0.39 / 0.02 / 0.01 | commission / #platform cred | filter+opacity+transform | lazy |
| hero/slayalldeep-avatar.jpg | jpg, 16 | 320×322 | 30×30 (group box) | 90×90 | 3.6 | 5.3 | 0.39 / 0.03 / 0.01 | hero card | none seen (hero card set) | (none) |
| hero/mod-avatar.jpg | jpg, 11 | 300×300 | 30×30 | 90×90 | 3.3 | 5.0 | 0.34 / 0.03 / 0.01 | hero card | none seen (hero card set) | (none) |
| hero/buttercup-avatar.jpg | jpg, 8 | 250×250 | 30×30 (group box) | 90×90 | 2.8 | 4.2 | 0.24 / 0.03 / 0.01 | hero card | none seen (hero card set) | (none) |
| hero/pakincht-avatar.jpg | jpg, 4 | 150×150 | 30×30 (group box) | 90×90 | 1.7 | 2.5 | 0.09 / 0.03 / 0.01 | hero card | none seen (hero card set) | (none) |
| hero/chapavich-avatar.jpg | jpg, 4 | 113×113 | 30×30 (group box) | 90×90 | 1.3 | 1.9 | 0.05 / 0.03 / 0.01 | hero card | none seen (hero card set) | (none) |
| media/avatar-cat.png | png, 290 | 341×512 | 130×283 | 389×850 | 0.6 | 0.9 | 0.67 / 0.67 / 0.67 | #platform profile tile; morph column | filter+opacity+transform | lazy/eager |
| media/post-2.png | png, 222 | 368×460 | 130×346 | 389×1037 | 0.4 | 0.7 | 0.65 / 0.65 / 0.65 | #platform profile tile; morph column | filter+opacity+transform | lazy/eager |
| media/post-3.png | png, 266 | 341×512 | 130×506 | 389×1518 | 0.3 | 0.5 | 0.67 / 0.67 / 0.67 | #platform profile tile; morph column | filter+opacity+transform | lazy/eager |
| optimized/platform/service-bg.avif | avif, 68 | 576×1024 | 390×311 | 1170×933 | 0.5 | 0.7 | 2.25 / 2.25 / 2.25 | #platform | - | lazy |
| optimized/external/lawyer-consult-cover-240.avif | avif, 6 | 160×240 | 85×85 | 254×254 | 0.6 | 0.9 | 0.15 / 0.15 / 0.15 | #platform | - | lazy |
| media/post-1.png | png, 253 | 368×447 | 130×346 | 389×1037 | 0.4 | 0.6 | 0.63 / 0.63 / 0.63 | morph panel column | transform | eager |
| work/work-a.jpg | jpg, 126 | 736×920 | not shown (group box) | - | ? | ? | 2.58 / ? / ? | morph panel column | - | eager |
| profile/portfolio-1.jpg | jpg, 275 | 960×540 | 130×346 | 389×1037 | 0.5 | 0.8 | 1.98 / 1.98 / 1.98 | morph panel column | transform | eager |
| media/service-cafe.png | png, 290 | 480×270 | not shown (group box) | - | ? | ? | 0.49 / ? / ? | morph panel column | - | eager |
| media/post-5.jpg | jpg, 84 | 735×893 | not shown (group box) | - | ? | ? | 2.5 / ? / ? | morph panel column | - | eager |
| work/work-e.jpg | jpg, 134 | 736×1042 | not shown (group box) | - | ? | ? | 2.93 / ? / ? | morph panel column | - | eager |
| profile/portfolio-2.jpg | jpg, 351 | 960×540 | not shown (group box) | - | ? | ? | 1.98 / ? / ? | morph panel column | - | eager |
| profile/portfolio-3.jpg | jpg, 369 | 960×540 | not shown (group box) | - | ? | ? | 1.98 / ? / ? | morph panel column | - | eager |
| work/work-f.jpg | jpg, 90 | 600×848 | not shown (group box) | - | ? | ? | 1.94 / ? / ? | morph panel column | - | eager |

</details>

Sources: census `out/image-cost/sim/census-2026-10-03T15-46-51-227Z.json` (gitignored); per-image rows in
`results.json` → `inventory.images`.

## 2. How WebKit decodes an image, and where the cost lands (vendor source)

All of the following is CONFIRMED in WebKit source at tag `WebKit-7624.4.5`, the iOS 26 family, fetched from
`github.com/WebKit/WebKit` at that tag on 2026-10-03:
- **When a decode is synchronous.** `RenderBoxModelObject.cpp` l.303-367, `decodingModeForImageDraw`, decides it at
  paint time.
  - For `<img decoding=async>` (almost every image here), and for any image larger than 500 KB decoded, the answer
    is `defaultDecodingMode()`.
  - On the first paint of a compositing layer, an element that has never painted an image decodes
    **asynchronously**. "First paint" means `graphicsLayer.repaintCount() == 0` (`RenderLayerBacking.cpp`
    l.4206-4208).
  - On every later paint, an image that is **visible in the viewport decodes synchronously, inside Paint**. An
    image outside the viewport decodes asynchronously.
  - Images at or under 500 KB decoded with no `decoding` attribute always decode synchronously.
  - "Large" means more than 500 KB decoded, or 100 KB when animated (`BitmapImageSource.cpp` l.321-325).
- **At what size.**
  - A **synchronous** decode is at **natural size**. `nativeImageAtIndexCacheIfNeeded` (`BitmapImageSource.cpp`
    l.554-583) builds `DecodingOptions{Synchronous}` with no size, and `ImageDecoderCG.cpp` l.632-652 calls
    `CGImageSourceCreateImageAtIndex`.
  - An **asynchronous** decode is at the **drawn size**: `sizeForDrawing` = source size × the drawing scale
    (`BitmapImage.cpp` l.96-101). `ImageDecoderCG.cpp` then uses `CGImageSourceCreateThumbnailAtIndex` with
    `kCGImageSourceThumbnailMaxPixelSize`, at the smaller of the natural and the drawn size.
  - `HTMLImageElement.decode()` decodes at natural size, asynchronously (`BitmapImageSource.cpp` l.355-385).
  - WebKit subsamples only images above 5 × 1024 × 1024 px of area (`BitmapImageDescriptor.cpp` l.229-255). No
    image here qualifies.
- **Reuse.** A natural-size decode serves every later draw. A sized decode serves only draws at an equal or smaller
  size (`DecodingOptions.h` l.66-81, `isCompatibleWith`).
- **One more copy.** The first time a decoded image goes into a display list for the GPU process, the web process
  copies its pixels into shared memory (`RemoteResourceCacheProxy.cpp` l.50-77, l.122-163). That copy is at the
  decoded pixel count.
- **The Timeline has no "decode" record.** `InspectorTimelineAgent.h` l.53-87 lists every record type, and none is
  for image decoding. A synchronous decode therefore shows up as a long **Paint** record. Which Paint record the
  Core Graphics pixel work lands in is UNRESOLVED from source: sync decodes set `kCGImageSourceShouldCache` but not
  `ShouldCacheImmediately` (`ImageDecoderCG.cpp` l.69-80). Our data (§3) OBSERVE it inside the first Paint.

**What this means for this page:**
- **At rest and in plain scrolling, most decodes are asynchronous at the drawn size.** Lazy images that load ahead
  of the viewport get painted into off-screen tiles first. They are not "visible in viewport", so they decode
  asynchronously, at the drawn size. That fits the earlier phone finding of Paint ≤2.6 ms
  (`research/design-engineering/style-recalc-images.md` §3).
- **The synchronous, natural-size path applies when a large image first paints while on screen, on a layer that has
  painted before.** Examples:
  - a lazy image that finishes loading after it entered the viewport;
  - a hidden card that is shown, such as a hero card cycling in or the morph panel revealing its columns;
  - a `src` change on a visible image.
  
  In those frames the full-size decode runs on the main thread inside Paint. Its cost scales with the file's
  pixels, not with the box it is drawn in. **That is where capping helps.**

## 3. Cost of a first paint: decode-in-Paint, base vs 2x-capped (Simulator, OBSERVED)

**The test (`simprobe.mjs pd`).**
- Scroll to 45 % of the page. Add a fixed `will-change: transform` box sized to the image's box, and paint it once.
- For each image:
  1. Load a fresh copy (`?r=` query) off-DOM and wait for `onload`.
  2. Append it to the box, and sum the Paint records over 3 rAF + 150 ms ("fresh").
  3. Remove it, append it again, and sum again ("decoded" control).
- This is exactly the synchronous path in §2: a large, visible image painting for the first time on an
  already-painted layer.
- Arms run in one session: base, cap2, base again (A/A). 36 images: the 30 largest by decoded MB, plus 6 small
  avatars.

**The cap2 arm.**
- 50 files are re-saved with `sips` so that the natural size is at most 2 × the largest drawn box, cover-fit. JPEG
  quality is 85; formats are unchanged.
- Images not seen on screen get their group's box: hero card 159×149, hero avatar 30×30, morph column 129.6×505.9.
- Bytes go from 7.39 to 5.54 MB. Decoded at natural size, the 50 files go from **140.8 to 33.4 MB**.
- The re-saved PNGs got *larger* on the wire (no PNG optimizer was used): the roles PNGs went from 325-440 KB to
  818-983 KB. A real fix would optimize them.

**Totals over the 36 images (Paint ms in the window):**

| arm | fresh (first paint) | decoded control |
|---|---|---|
| base | 204.8 | 19.8 |
| cap2 | **104.8** | 19.3 |
| base (A/A) | 196.1 | 19.0 |

**Per image, the largest single Paint record (ms, Mac CPU):**

| image (under `/selling/`) | natural → capped | base | cap2 | base again | decoded control |
|---|---|---|---|---|---|
| sellers/photographer/service-strawberry.jpg | 1320×1747 → 371×491 | 0.52 | 0.29 | 0.5 | ≤0.11 |
| sellers/sound-composer/post-orchestra.jpg | 1600×1067 → 351×234 | 6.75 | 0.91 | 6.43 | ≤0.1 |
| hero/leobeer-cover.jpg | 1200×1148 → 236×226 | 5.32 | 0.59 | 5 | ≤0.06 |
| sellers/photographer/post-tuna-cut.jpg | 1035×1400 → 350×473 | 6.64 | 1.07 | 5.9 | ≤0.13 |
| sellers/photographer/post-tuna.jpg | 988×1400 → 350×496 | 6.34 | 1.7 | 6.55 | ≤0.14 |
| roles/graphic-designer.png | 1282×1282 → 671×671 | 12.17 | 8.79 | 15.39 | ≤0.04 |
| sellers/photographer/post-football.jpg | 1400×846 → 350×212 | 4.55 | 0.71 | 4.49 | ≤0.09 |
| hero/weng-cover.jpg | 1090×994 → 244×223 | 3.05 | 0.53 | 3 | ≤0.12 |
| sellers/sound-composer/post-you-me-me.jpg | 850×1200 → 350×494 | 3.14 | 1.09 | 4.18 | ≤0.1 |
| sellers/sound-composer/cover.jpg | 1280×800 → 776×485 | 3.06 | 1.72 | 3 | ≤0.07 |
| hero/mod-cover.jpg | 741×1047 → 318×449 | 2.54 | 1.12 | 2.91 | ≤0.12 |
| sellers/photographer/avatar.jpg | 730×732 → 118×118 | 2.09 | 0.26 | 1.95 | ≤0.11 |
| sellers/sound-composer/post-maynila.jpg | 683×1024 → 351×526 | 3.95 | 1.55 | 4.45 | ≤0.04 |
| sellers/photographer/cover.jpg | 1200×669 → 776×433 | 3.51 | 1.97 | 3.55 | ≤0.09 |
| media/post-4.jpg | 819×1024 → 553×691 | 4.78 | 2.51 | 5.03 | ≤0.11 |
| sellers/ux-ui-designer/avatar.jpg | 640×640 → 60×60 | 1.71 | 0.2 | 1.77 | ≤0.1 |
| sellers/sound-composer/avatar.jpg | 640×640 → 118×118 | 1.62 | 0.28 | 1.67 | ≤0.07 |
| hero/bold-cover.jpg | 656×656 → 318×318 | 1.83 | 0.87 | 2.22 | ≤0.11 |
| media/cover-cafe.jpg | 960×539 → 725×407 | 8.74 | 1.96 | 4.89 | ≤0.09 |
| work/work-c.jpg | 735×893 → 623×757 | 6.38 | 5.85 | 5.37 | ≤0.06 |
| hero/chapavich-cover.jpg | 656×656 → 318×318 | 1.68 | 0.84 | 1.83 | ≤0.16 |
| hero/buttercup-cover.jpg | 656×656 → 318×318 | 1.76 | 0.73 | 1.89 | ≤0.1 |
| hero/slayalldeep-cover.jpg | 656×656 → 318×318 | 1.87 | 0.74 | 2.07 | ≤0.08 |
| hero/pakincht-cover.jpg | 956×1194 → 318×397 | 5.23 | 1.13 | 5.47 | ≤0.08 |
| hero/peter-cover.jpg | 1200×2133 → 318×565 | 8.59 | 1.26 | 10.97 | ≤0.12 |
| hero/nam-cover.jpg | 1200×1866 → 318×494 | 10.18 | 1.31 | 8.41 | ≤0.1 |
| roles/architect.png | 1282×1282 → 1012×1012 | 17.44 | 10.39 | 11.16 | ≤0.06 |
| roles/software-engineer.png | 1282×1282 → 1012×1012 | 11.6 | 11.15 | 11.95 | ≤0.11 |
| roles/web-developer.png | 1282×1281 → 1013×1012 | 11.68 | 11.09 | 12.42 | ≤0.09 |
| roles/project-manager.png | 1282×1281 → 1013×1012 | 13.45 | 11.65 | 12.13 | ≤0.09 |
| sellers/ai-video-editor/avatar.jpg | 480×480 → 44×44 | 2.48 | 0.23 | 2.37 | ≤0.13 |
| sellers/ai-automation/avatar.jpg | 480×480 → 64×64 | 2.92 | 0.27 | 2.47 | ≤0.11 |
| sellers/graphic-designer/avatar.jpg | 480×480 → 64×64 | 1.34 | 0.21 | 1.19 | ≤0.09 |
| sellers/web-developer/avatar.jpg | 480×480 → 64×64 | 1.37 | 0.22 | 1.27 | ≤0.04 |
| media/service-kitchen.png | 410×512 → 193×241 | 5.01 | 1.3 | 3.98 | ≤0.09 |
| commission/client-avatar-2.png | 349×479 → 57×78 | 1.54 | 0.28 | 1.58 | ≤0.12 |

**Reading.**
- **The cost is the decode, not the draw.** Painting the same image once it is decoded costs 0.03-0.16 ms in every
  arm. The first paint costs 1-17 ms.
- **The first-paint cost follows the file's pixel count**, at about 4 ms per decoded megapixel for JPEG on this
  Mac.
  - peter-cover: 2.56 Mpx, 8.6-11.0 ms; capped to 0.18 Mpx, 1.3 ms.
  - nam-cover: 10.2 / 8.4 ms → 1.3 ms.
  - post-orchestra: 6.6 → 0.9 ms.
  - The avatars: 1.2-2.9 → 0.2-0.3 ms.
- **The roles PNGs barely move.** The cap only takes them from 1282² to 1012² or 671², because their drawn box
  (130×506) is tall. They stay at 9-12 ms. PNG decode costs more per pixel than JPEG here.
- **One outlier:** `service-strawberry.jpg` stayed at about 0.5 ms in both arms. Its decode probably went
  asynchronous; cause unknown.
- **Base and the A/A agree within the noise of this busy Mac:** 204.8 vs 196.1 ms in total. Per image they differ
  by up to about 4 ms (cover-cafe 8.7 vs 4.9; architect 17.4 vs 11.2). The cap2 drop on the big photos (5-10x) is
  far outside that.

Data: `out/image-cost/sim/mix-2026-10-03T16-06-05-499Z.json` (gitignored) → `results.json` → `decodeInPaint`.

## 4. At rest at the top of the page (idle 18 s, Simulator, OBSERVED)

The top of the page (hero) was observed for 18 s per arm: base, cap2, cap2, base. A MutationObserver marked every
`<img>` that was added or changed `src`.

| arm | Timeline frames | Paint n | Paint ms | Paint max | Paint >2 ms | Composite ms | Composite max | frame p95 ms | img changes | max Paint after a change |
|---|---|---|---|---|---|---|---|---|---|---|
| base | 926 | 779 | 86 | 0.4 | 0 | 2570 | 24.8 | 28 | 158 | 0.3 |
| cap2 | 926 | 764 | 86 | 0.7 | 0 | 2405 | 23.6 | 31.4 | 158 | 0.3 |
| cap2 | 931 | 769 | 86 | 0.5 | 0 | 2493 | 22.8 | 30 | 158 | 0.3 |
| base | 927 | 769 | 87 | 0.4 | 0 | 2613 | 28.9 | 34.3 | 158 | 0.4 |

**Reading.**
- **At rest, capping changes nothing measurable.**
  - No Paint record is over 2 ms in any arm.
  - Paint totals are about 86 ms in 18 s in every arm.
  - Composite totals (2.4-2.6 s) differ between the two base runs by more than between base and cap2.
- **The 158 image changes in 18 s are 6 seller avatars, each re-inserted about 26 times by a looping element.** It
  is not the hero card set: no hero image changed in 18 s.
  - These avatars are already decoded, so each re-insert costs at most 0.4 ms of Paint in any arm.
  - This matches §2: an already-decoded image is cheap to paint again.

Data: `out/image-cost/sim/mix-2026-10-03T16-24-44-134Z.json` → `results.json` → `idle`.

## 5. Scrolling the whole page (walk, Simulator, OBSERVED)

**The test.**
- A rAF-paced scripted scroll, 14 px per frame from the top to the bottom (5260 px, about 18.5 s), after 6 s at
  rest.
- Timeline and Memory tracking recorded throughout.
- Arms in one session: base, cap2, cap2, base. Hold 18:04:28-18:06:40Z; pmset shows no sleep inside it (I-098).
- The Mac was in a dark wake, so the ms are even more indicative than usual. The pairs are what count.

| | base run 1 | base run 2 | cap2 run 1 | cap2 run 2 |
|---|---|---|---|---|
| Paint total ms | 288 | 283 | 250 | 240 |
| Paint records > 2 ms | 12 | 11 | 6 | 4 |
| Paint records > 4 ms | 5 | 6 | 2 | 0 |
| largest Paint ms | 6.6 | 7.1 | 10.3 | 3.4 |
| Paint ms in the 1000-2000 px band (the profile showcase photos) | 76 | 86 | 48 | 49 |
| Composite total ms | 8079 | 8048 | 7681 | 7846 |
| Layout total ms | 11001 | 10944 | 10875 | 10977 |
| frame p95 ms (Timeline RenderingFrame) | 66.3 | 65.6 | 63.8 | 63.8 |
| "Images" memory, peak MB | 13.7 | 16.8 | 6.7 | 3.4 |
| "Images" memory, mean MB | 8.5 | 10.5 | 2.5 | 1.2 |
| web process total, peak MB | 235 | 198 | 174 | 173 |

**Reading (OBSERVED, n = 2 per arm, Simulator):**
- **The cap removes most of the long Paint records in a scroll**: 11-12 down to 4-6 over 2 ms, and 5-6 down to 0-2
  over 4 ms.
  - Paint time falls about 15 % (283-288 → 240-250 ms). Most of the drop is in the band with the big seller photos.
  - One cap2 run had a single 10.3 ms Paint near the top. The roles PNGs, which the cap barely shrinks, are the
    likely source (not attributed).
- **Paint is small next to the rest.** In one scroll, Paint is about 0.25 s, against Layout at about 11 s and
  Composite at about 8 s, in every arm.
  - Composite and Layout do not move beyond the base pair's spread.
  - Frame p95 moves 66 → 64 ms, which this busy Simulator cannot tell apart from noise.
  - **Capping trims the decode spikes but does not change what dominates a frame on this page.**
- **Decoded image memory drops clearly in this metric: peak 13.7-16.8 → 3.4-6.7 MB.**
  - The "Images" category is the web process's memory tagged ImageIO/CGImage (`ResourceUsageThreadCocoa.mm`
    l.44-52, `InspectorMemoryAgent.cpp` l.139-141, CONFIRMED).
  - It does not include the GPU process's copies (§2).
  - The base peak (about 15 MB) is far below the 95.8 MB a natural-size decode of every visible image would take.
    That fits §2: most decodes are sized and asynchronous, and decoded data does not all stay resident. Why it
    stays this low is UNRESOLVED.
  - The web process total peak also fell (198-235 → 173-174 MB), but n = 2 and total memory is noisy: the earlier
    image-size A/A noise was up to 29 MB.

Data: `out/image-cost/sim/mix-2026-10-03T18-04-33-514Z.json` → `results.json` → `walk`.

## 6. Pixel impact of a 2x cap (WebKit canvas, Simulator)

**The test (`simprobe.mjs pix`).**
- For each of the 50 capped files, the page (Simulator, DPR 3) loads the original and the capped copy from the same
  origin.
- It draws each into a canvas the size of the image's largest box in device pixels, with a centred cover crop, at
  `imageSmoothingQuality` low and high. The original is drawn twice (A/A).
- It reports, per pixel, the largest channel difference and the counts over 8 and over 64 levels.
- **A/A: max 0 for all 50 images**, so every reported difference comes from the cap.

**Caveats:**
- This is a canvas draw in WebKit, not the page's own `<img>` paint and not a screenshot. Which smoothing the page's
  paint uses is UNRESOLVED; low and high give the same picture.
- The capped JPEGs were also re-encoded at quality 85. The numbers mix resampling with re-encoding, so they **likely
  overstate** what a careful resize (higher quality, or `jpegtran`-clean) would change.
- The roles PNGs reach 255 at a few pixels, probably at transparent edges (cause unknown).
- Chrome and a desktop width were not measured.

**The five numbers, largest areas first** (high smoothing; area = pixels over 8 levels ÷ 9 = CSS px; screen
430×775 = 333,250 CSS px):

| image (under `/selling/`) | natural → capped | box, device px | largest shade | area beyond A/A, CSS px | share of screen | edge or fill | static or moving |
|---|---|---|---|---|---|---|---|
| hero/pakincht-cover.jpg | 956×1194 → 318×397 | 477×447 | 120 | 10,605 (44.8 % of the image) | 3.18 % | fill (photo texture) | static (hero card) |
| sellers/sound-composer/cover.jpg | 1280×800 → 776×485 | 1164×546 | 74 | 9,571 (13.6 %) | 2.87 % | fill | in a moving card |
| sellers/sound-composer/post-maynila.jpg | 683×1024 → 351×526 | 525×789 | 116 | 8,581 (18.6 %) | 2.57 % | fill | in a moving card |
| hero/peter-cover.jpg | 1200×2133 → 318×565 | 477×447 | 161 | 7,272 (30.7 %) | 2.18 % | fill | static (hero card) |
| sellers/photographer/post-tuna-cut.jpg | 1035×1400 → 350×473 | 525×699 | 121 | 7,239 (17.8 %) | 2.17 % | fill | in a moving card |
| sellers/photographer/post-tuna.jpg | 988×1400 → 350×496 | 525×735 | 143 | 6,365 (14.8 %) | 1.91 % | fill | in a moving card |
| hero/slayalldeep-cover.jpg | 656×656 → 318×318 | 477×447 | 178 | 5,412 (22.8 %) | 1.62 % | fill | static (hero card) |
| hero/bold-cover.jpg | 656×656 → 318×318 | 477×447 | 85 | 5,349 (22.6 %) | 1.61 % | fill | static (hero card) |
| sellers/sound-composer/post-you-me-me.jpg | 850×1200 → 350×494 | 525×741 | 133 | 5,317 (12.3 %) | 1.60 % | fill | in a moving card |
| sellers/photographer/cover.jpg | 1200×669 → 776×433 | 1164×546 | 94 | 5,073 (7.2 %) | 1.52 % | fill | in a moving card |
| hero/nam-cover.jpg | 1200×1866 → 318×494 | 477×447 | 110 | 5,029 (21.2 %) | 1.51 % | fill | static (hero card) |
| sellers/photographer/service-strawberry.jpg | 1320×1747 → 371×491 | 525×735 | 122 | 4,600 (10.7 %) | 1.38 % | fill | in a moving card |
| work/work-c.jpg | 735×893 → 623×757 | 389×1135 | 86 | 4,338 (8.8 %) | 1.30 % | fill | in a moving card (morph column) |
| hero/leobeer-cover.jpg | 1200×1148 → 236×226 | 354×333 | 157 | 3,839 (29.3 %) | 1.15 % | fill | static (hero card) |

All 50 rows: `results.json` → `pixels`.

**Against the T2 numbers** (fill ≤ 64, ≤ 2,000 CSS px per element, ≤ 0.5 % of the screen):
- **46 of 50 images exceed the fill limit.** Largest shades are 51-178 for photos and 255 for the roles PNGs.
- **21 of 50 exceed 2,000 CSS px.**
- Each of the big photos alone exceeds 0.5 % of the screen.
- Only 4 small files stay at or under 64: `media/cover-cafe.jpg`, `commission/client-avatar-3.png`,
  `hero/chapavich-avatar.jpg` and `hero/peter-avatar.jpg`.
- The differences are photo texture (fill), the same kind as the earlier `fixes/image-size` result (up to 109/255
  on small avatars).

**Verdict: a 2x cap is T3, a visible change, so it can only go to the user as a proposal.** The test is
frozen-frame, and most of these images also sit in moving cards, so the motion reading is the user's anyway.

## 7. What capping would save, and the risk

**What a 2x cap saves (the 50 files of the cap2 arm):**
- **Memory.** If every file were decoded at natural size, the 50 files take 140.8 MB; capped, 33.4 MB.
  - WebKit holds the natural size only for synchronous decodes. Asynchronous decodes are already at the drawn size
    (§2), so the real saving is lower and depends on which path each image took.
  - The earlier `fixes/image-size` run could not see a memory saving in the Simulator: the A/A noise was up to
    29 MB.
  - The walk's image-memory numbers are in §5.
- **Main-thread time in the frames where a large image first paints while on screen.**
  - Simulator measurement: about 9-10 ms → 1.3 ms for the two biggest hero covers, and 5-7 ms → 0.6-1.1 ms for the
    big seller photos.
  - On the phone the absolute numbers will differ (Mac-CPU ms, F-084). The ratio, roughly proportional to decoded
    pixels, is the transferable part.
- **Wire bytes:** 7.39 → 5.54 MB with sips. A real fix would also optimize the PNGs, which sips made larger.
- **What it does not change:**
  - frames where nothing new is painted;
  - images that are already decoded (0.03-0.16 ms either way);
  - compositing, layout and style, which are the large per-frame terms on this page
    (`research/design-engineering/style-recalc-images.md` §3).

**The risk: softer photos on a 3x screen.**
- A 2x cap stores fewer pixels than a 3x phone draws, so the browser upscales by 1.5x. Fine texture (hair, fabric,
  food, text inside photos) gets softer. §6 gives the pixel numbers.
- A per-image cap at **3x** keeps every phone pixel and still removes most of the waste:
  - peter-cover 1200×2133 → 477×848;
  - 20 images are more than 2x over even the 3x need.
  
  It changes only resampling, which may still exceed the T2 numbers. It would need its own pixel check.
- **Desktop:** the same files are drawn larger at 1440 px wide. One capped file for all screens would make desktop
  softer. The proper form is `srcset`/`sizes` (or `<picture>`) with 2x/3x candidates. That is a markup change, and
  the page currently has no `srcset` at all.
- **Because capping changes pixels, it is a proposal (T3) for the user, not a landable look-alike fix.**

## 8. Platform claims in this study

| claim | status, reference |
|---|---|
| A large or `decoding=async` image that is visible, on a layer that has painted before, decodes synchronously on the main thread at natural size inside Paint | CONFIRMED, WebKit-7624.4.5 `RenderBoxModelObject.cpp` l.303-367, `RenderLayerBacking.cpp` l.4206-4208, `BitmapImageSource.cpp` l.554-583, `ImageDecoderCG.cpp` l.632-652 |
| An off-screen or first-layer-paint decode is asynchronous at the drawn size | CONFIRMED, same files; `BitmapImage.cpp` l.96-101 |
| "Large" = more than 500 KB decoded (100 KB animated) | CONFIRMED, `BitmapImageSource.cpp` l.321-325 |
| No subsampling below 5 MP | CONFIRMED, `BitmapImageDescriptor.cpp` l.229-255 |
| A natural-size decode is reused for every draw; a sized decode only for equal or smaller draws | CONFIRMED, `DecodingOptions.h` l.66-81 |
| The web process copies decoded pixels to the GPU process on first use | CONFIRMED, `RemoteResourceCacheProxy.cpp` l.50-77, l.122-163 |
| WebKit's Timeline has no decode record, so decode time shows inside Paint | CONFIRMED (record list), `InspectorTimelineAgent.h` l.53-87; where exactly the CG work lands: OBSERVED in Paint, UNRESOLVED from source |
| A first-paint decode costs about 4 ms per decoded megapixel for JPEG | OBSERVED, Simulator on a busy Mac; phone value unknown |
| The Inspector "Images" memory category is the web process's ImageIO/CGImage-tagged memory (GPU-process copies not included) | CONFIRMED, `ResourceUsageThreadCocoa.mm` l.44-52, `InspectorMemoryAgent.cpp` l.139-141 |
| Apple caps its images at 2x | OBSERVED (lead's note), not checked here |

## 9. Related work

- `research/design-engineering/style-recalc-images.md` §3: images are memory waste, REFUTED as a per-frame cost
  (phone Paint ≤2.6 ms, Chrome census 153 MB vs 39 MB). This study adds the mechanism: the one path where size
  costs main-thread time, and how big that cost is.
- `fixes/image-size` (rejected, null result): resizing to need × 1.2 gave no detectable Simulator memory saving
  (A/A noise up to 29 MB, F-134, F-135). Pixel diffs reached up to 109/255 on small avatars.
- `research/pixel-tolerance/README.md`: the T2 numbers used in §6.
