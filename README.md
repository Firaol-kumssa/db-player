# db-player — Track 2: Accessible learning media

Team: Firaol Kumssa (solo). Co-designer: _TODO: name and role after the phone test_.

## What it does

`<db-player>` is one script that turns a lesson video into something every learner can use: captions they can restyle, a transcript they can click and download, audio description, a sign-language window, and a small offline pack. Amharic comes first and is complete; English is second. It plugs into any page with one tag and talks to the host only through events.

## The main task we tested

"A Deaf or blind learner on a low-cost Android phone watches the lesson in Amharic with captions they can restyle, a transcript, and audio description, using keyboard, TalkBack or touch, with nobody helping."

## Run it

```bash
./scripts/setup-savanna.sh      # clones the starter into ./savanna and mounts the player
docker compose up -d            # web on :8080, Level 2 API on :8081
```

- Inside Savanna: http://localhost:8080/pages/concept-with-navigation.html
- Outside Savanna (no Bootstrap, no Savanna CSS): http://localhost:8080/demo/blank.html
- API docs (Swagger UI): http://localhost:8081/docs
- On a phone (needed for offline and speech features): `cloudflared tunnel --url http://localhost:8080`, then open the HTTPS address.
- Port 8080 taken? `WEB_PORT=8090 docker compose up -d` (and `API_PORT=` for the API).

nginx serves the untouched Savanna starter as the site root and our `module/`, `media/` and `demo/` folders beside it (`/srv/...` in the container), so the only change to Savanna's files is the one `<db-player>` block that `scripts/mount_player.py` adds directly under the banner image in `#curriculum_navigation_content .savanna-styles`. `savanna/` is not committed. `setup-savanna.sh` recreates it.

## Install, Level 1

```html
<script src="https://your-host/module/db-player.js" defer></script>
<db-player
  src="/media/lesson.mp4"
  poster="/media/poster.png"
  captions="/media/lesson.am.vtt,/media/lesson.en.vtt"
  describe="/media/lesson.ad.am.vtt,/media/lesson.ad.en.vtt"
  sign="/media/lesson.ethsl.mp4"
  offline-audio="/media/lesson-low.mp3"
  lesson-title="Lesson title"
  lang="am"></db-player>
```

| Attribute | Meaning |
|---|---|
| `src` | Lesson video (MP4) |
| `captions` | Comma list of WebVTT files. Language is read from the name: `lesson.am.vtt` |
| `describe` | Comma list of audio-description WebVTT files, one per language |
| `sign` | Sign-language video. Empty = the player says honestly there is none yet and offers "Ask for a sign-language video" |
| `offline-audio` | Low-bitrate audio for the offline pack (default: `src` with `-low.mp3`) |
| `lang` | `am` (default) or `en`. The starting interface language; the learner can change it with the language button, and their choice is remembered |
| `poster`, `lesson-title` | Optional |

**Theming.** All the player's CSS lives in a shadow root, so it doesn't restyle the host page and the host doesn't restyle it. It reads the host's look through CSS variables, which pass into the shadow root:

| Variable | Used for | Fallback |
|---|---|---|
| `--savanna-theme-primary`, then `--bs-primary` | Accent, used only for decoration: button borders, panel bars, the current transcript line | `#002b56` |
| `--db-player-primary` | Text and filled-button colour. Set it if your brand colour is too light | 30% darker than the accent (`color-mix`), or `#002b56` |
| `--bs-body-font-family` | Font (Ethiopic fonts are added after it for Amharic) | `system-ui` |
| `--bs-border-color`, `--bs-border-radius`, `--bs-border-radius-lg` | Panel and list lines, corners | `#dee2e6`, `.375rem`, `.5rem` |
| `--bs-body-bg`, `--bs-tertiary-bg`, `--bs-primary-bg-subtle` | Button, panel and hover backgrounds | `#fff`, `#f8f9fa`, `#e8eef5` |

Text colour is inherited from the host (on Savanna, the lesson's navy). Targets are `max(2.75rem, 44px)`, because Savanna's root font size is 14 px and `2.75rem` alone would be only 38.5 px there.

| Event (bubbles, composed) | Detail |
|---|---|
| `db-player:progress` | `{ seconds, percent }` every 5 s of playback |
| `db-player:complete` | `{}` |
| `db-player:prefs` | `{ captionSize, captionColor, captionBackground, captionPosition, captionLanguage, signPosition, signSize }` |
| `db-player:sign-request` | `{ lesson, language }`: the learner asked for a sign-language video |
| `db-player:offline` | `{ bytes }`: the offline pack was saved |

```js
document.addEventListener('db-player:complete', () => markLessonDone());
```

### What the learner gets

- Real `<button>` controls with visible names: Play/Pause, Back 10 s, Forward 10 s, Speed, Captions, Caption settings, Transcript, Audio description, Sign language, Full screen, Keyboard help. Controls never hide.
- Keyboard: K or Space (on the video) plays and pauses, the arrows move 5 s, Tab moves between controls and Escape closes dialogs. Shortcuts work only while focus is inside the player (WCAG 2.1.4). They are listed in a real `<dialog>`.
- Captions: the VTT tracks are set to `mode = 'hidden'`, and the player reads `cuechange` and draws cues itself. The learner chooses size (4), colours (3), background (solid or see-through) and position (top, bottom, or **below the video**, which is best at 200% zoom on a phone). The choice is remembered and announced.
- Transcript: built from the same VTT. Every line is a button that jumps to its time, the current line is marked `aria-current`, and the whole transcript downloads as text.
- Language: a button above the video, labelled in the other language ("English" or "አማርኛ", with its own `lang` so screen readers pronounce it correctly), switches every label, the captions, the transcript and the audio description between Amharic and English. The choice is saved in `localStorage` and survives a reload. If the host page changes its `lang` attribute later, the host wins.
- Quiet mode: a toggle button that makes the player stop speaking (no audio-description voice) and stop sending announcements such as "Captions on" to the screen reader. It gives one last announcement first, and errors are still announced. A web page can't switch TalkBack itself off: on Android, hold both volume keys for 3 seconds (if the TalkBack shortcut is on) or go to Settings › Accessibility › TalkBack.
- Audio description: when switched on, the video pauses at each description, reads it with `speechSynthesis` (am-ET), then resumes. If the phone has no Amharic voice, the text is shown on screen and sent to the screen reader through a live region.
- Sign language: a second `<video>` kept in sync on play, pause, seeking and rate change, with drift corrected once a second. It moves with four position buttons and resizes with Larger/Smaller. No dragging.
- Offline: "Download for offline (0.3 MB)" shows the size before the learner taps. A service worker then keeps the low-bitrate audio, the captions and a light lesson page (`module/offline.html`).

## Install, Level 2

A small HTTP API (`api/server.mjs`, Node 20+, no dependencies) runs as the `api` service on port 8081. The contract is in [openapi.yaml](openapi.yaml), and Swagger UI is at `/docs`. Errors are JSON with a plain-language `error` message. The lesson id of the test clip is `future-of-va-work`.

| Call | Returns |
|---|---|
| `GET /api/v1/lessons/{id}` | Metadata and the list of caption and description tracks |
| `GET /api/v1/lessons/{id}/transcript?lang=am` | Plain-text transcript, `[m:ss] line` (add `&format=vtt` for the raw VTT) |
| `GET /api/v1/lessons/{id}/offline-pack` | The low-bitrate narration as one MP3 (324 KB) |
| `POST /api/v1/lessons/{id}/captions?lang=om` | Upload a VTT. `201`, or `400` with the reason (no `WEBVTT` line, a bad time, end before start, an empty cue, not UTF-8). `413` over 512 KB, `415` if not `text/vtt` |

Unknown lesson ids, and languages with no captions, return `404`. Uploaded files go to `api/uploads/` (never into `media/`), and later calls see them.

**Webhook:** set `CAPTION_WEBHOOK_URL` in `.env`. After every successful caption upload, the API POSTs this JSON (5 s timeout; the `201` reports whether it was delivered):

```json
{ "event": "captions.uploaded", "lesson": "future-of-va-work", "lang": "om", "cues": 2, "at": "2026-11-15T20:54:10.788Z" }
```

Paste-ready:

```bash
curl -s http://localhost:8081/api/v1/lessons/future-of-va-work

curl -s "http://localhost:8081/api/v1/lessons/future-of-va-work/transcript?lang=am"

curl -s -o future-of-va-work.mp3 http://localhost:8081/api/v1/lessons/future-of-va-work/offline-pack

printf 'WEBVTT\n\n00:00:00.200 --> 00:00:02.800\n[muuziqaa laafaa]\n' | curl -s -X POST -H 'Content-Type: text/vtt' --data-binary @- "http://localhost:8081/api/v1/lessons/future-of-va-work/captions?lang=om"
```

Not built at Level 2: authentication on the upload (anyone who can reach port 8081 can upload, so keep it behind the host's login before production), and a zip pack (the offline pack is the single MP3).

## Install, Level 3

Not attempted.

## Languages

All text lives in `module/i18n/am.json` and `en.json` (identical keys, checked by a test). To add Afaan Oromo, copy `en.json` to `om.json`, translate it, and set `lang="om"`. The CSS uses logical properties (`inset-inline-start`), and the `dir` key in each JSON file supports right-to-left languages such as Arabic. Amharic text gets line-height 1.7.

## The test lesson and the caption pipeline

We didn't record anything. `tools/make_lesson.py` builds the clip from `tools/lesson.json`, a 7-slide summary of the Savanna lesson "the future of virtual-assistant work":

1. It draws the slides with Pillow (Ethiopic font, no burned-in captions).
2. It narrates each sentence in Amharic with text-to-speech: `edge-tts` (`am-ET-MekdesNeural`, free) or Addis AI (`ADDIS_AI_API_KEY` and `ADDIS_TTS_URL` in `.env`).
3. It measures each clip and writes `lesson.am.vtt` and `lesson.en.vtt` from the same script, using the exact audio timings.
4. It writes the audio-description tracks and the low-bitrate MP3.

```bash
pip3 install edge-tts pillow && python3 tools/make_lesson.py      # Amharic narration
python3 tools/make_lesson.py --tts none                           # no network: silent slides
# macOS/Homebrew Python refuses global pip installs, so use a venv:
python3 -m venv .venv && .venv/bin/pip install edge-tts pillow && PATH="$PWD/.venv/bin:$PATH" .venv/bin/python3 tools/make_lesson.py
```

**The clip in `media/` was built with `TTS engine: edge`** (`am-ET-MekdesNeural`, recorded in `media/lesson.meta.json`). It is 55.2 s of H.264 video plus AAC audio (mean −25 dB, so it is real speech, not silence). We checked frames at 2 s, 12 s and 40 s, and the Ethiopic titles render with no missing-glyph boxes (font: macOS `KefaIII.ttf`; Noto Sans Ethiopic on Linux). Addis AI was not needed, and `tts_addis()` has not been tried against the live service.

Because the captions are written from the script, they match the narration word for word. For lessons that already exist, the pipeline would run speech-to-text first (Addis AI `/api/v2/stt`), then have a person correct the lines and times, then export to VTT. That editor page is **not built** yet. Amharic speech recognition quality has not been measured.

**Honest note:** the narration voice is synthetic test content. There is no Ethiopian Sign Language video yet, so the player shows its "no sign video yet" state, which is the case most lessons will be in.

## Offline and slow connection

| Item | Size |
|---|---|
| `db-player.js` | 33 KB (9.7 KB gzipped), no framework, no dependencies |
| Language files | 5.0 KB (am) + 3.4 KB (en) |
| Test video (854×480, 12 fps, 55 s, narrated) | 390 KB |
| Offline pack (48 kbps MP3, captions, offline page, language files) | 337 KB, shown as "0.3 MB" on the button |

**Measured on emulated Slow 3G** (Chrome 157 via Playwright and CDP `Network.emulateNetworkConditions`: 400 kbps down and up, 400 ms latency, cache off, 412 px phone viewport): `demo/blank.html` takes **4.34 s and 44.8 KB transferred** (16 requests, median of 3 identical runs), counted until `<db-player>` has drawn its controls and the video metadata has loaded. The rest of the video only downloads when the learner presses Play (`preload="metadata"`, no autoplay). Rerun: `BASE=http://localhost:8080 npm run slow3g` (output in `tests/results/slow3g.txt`).

## Data and privacy

Nothing leaves the device. Caption, sign-window and speed choices are kept in this browser's `localStorage` under `db-player:prefs`. Clear them by clearing site data. The offline pack lives in Cache Storage `db-player-offline-v1`. No account, no tracking and no third party. The host gets only the events above and decides what to do with them.

## Cost to run

Static files only. For 3,000 learners, any static host or the existing Savanna CDN is enough: about $0–5 a month. Text-to-speech and speech-to-text run once per lesson at build time, not per learner.

## Tests

```bash
npm install                                   # dev tools only: Playwright, axe-core
npm test                                      # 10 unit tests: VTT parsing, cue lookup, i18n keys, API caption validator
BASE=http://localhost:8080 npm run test:e2e   # real Chrome, both pages (needs docker compose up and Google Chrome)
BASE=http://localhost:8080 npm run axe        # axe-core, WCAG 2.0–2.2 A/AA, shadow DOM included
STRICT=1 BASE=http://localhost:8080 npm run axe   # also AAA and axe best-practice rules
BASE=http://localhost:8080 npm run slow3g     # Slow 3G load time and KB
```

Results from 15 November 2026 are saved in `tests/results/`.

**End-to-end (`tests/e2e.mjs`), 33 of 34 checks pass**, on both `demo/blank.html` and the Savanna page:

- No console errors from db-player.
- Tab reaches all 16 controls.
- The language button switches to English (labels, captions, transcript), the choice survives a reload, and the button switches back.
- Quiet mode makes one last announcement, then the live region stays silent.
- Every control is at least 44 × 44 px.
- K on the video plays it.
- The transcript line "0:10" seeks to 10.41 s and is marked `aria-current`.
- With audio description on, the video pauses at 10.06 s on "ስላይድ 2 ከ7…" and plays again afterwards.
- Caption size XL and position "below" are still set after a reload.
- Both dialogs open, close with Escape, and return focus to their opener.
- At 320 px, nothing in the player overflows.
- At 200% zoom (640 CSS px), no control is cut off.
- **The one failure:** on the Savanna page at 320 px, `document.scrollWidth` is 480, not 320. The cause is Savanna's own header (`.curriculum-switcher`, `.btn-group`, 411 px wide). The player itself sits at 25–296 px. On `demo/blank.html` the scrollWidth is exactly 320.

**axe-core 4.14** (`tests/axe.mjs`, run through Playwright because `npx @axe-core/cli` currently fails: its ChromeDriver 152 does not match Chrome 157):

| Page | db-player | Host page |
|---|---|---|
| `demo/blank.html` | 0 violations | 0 violations |
| `pages/concept-with-navigation.html` | 0 violations (145 nodes in the shadow root checked) | 6 rules, listed below |

**Strict scan** (`STRICT=1`: AA plus AAA, including 7:1 contrast, plus axe best-practice rules): **0 issues in db-player on both pages**; the blank page has 0 issues in total. Two things were fixed to get there: the text shade went from 6.3:1 to 7.7:1, and the panel and dialog headings changed from `<h3>` to `<h2>`, so they don't skip a level under the page's `<h1>`. On the Savanna page the strict scan also lists the starter's AAA contrast (10 nodes), its heading order (`<h1>` followed by `<h4>`) and content outside landmarks (9 nodes).

**Issues that belong to the Savanna starter** (reported, not fixed, because we don't edit starter files):

| Impact | Rule | Where |
|---|---|---|
| critical | `aria-allowed-attr` | `.flex-shrink-0` in the header uses an ARIA attribute its role doesn't allow |
| serious | `aria-hidden-focus` | 7 heading anchors (`a.anchor[aria-hidden=true]`, e.g. `#what-is-shaping-the-future-of-va-work`) are focusable |
| serious | `aria-progressbar-name` | `.progress-bar` has no accessible name |
| serious | `color-contrast` | 7 nodes: the current sidebar item and the `href="#"` links in the lesson lists |
| serious | `link-name` | `.logo-container` link has no text |
| serious | `list` | `#sidebar > .px-2`: a `<ul>` with non-`<li>` children |
| — | reflow | Header is 480 px wide at a 320 px viewport (WCAG 1.4.10) |
| — | 404 | `/favicon_alx.ico` |

**Contrast on Savanna:** Savanna's red `#db3e3e` is only 4.40:1 on white, so the player uses it only for decoration: 1 px button borders (non-text, which needs 3:1), panel bars and the marker on the current transcript line. Text, filled buttons and the focus outline use `color-mix(in srgb, <red> 70%, #000)`, which gives `#992b2b`. That passes even the AAA level (7:1). Browsers without `color-mix` use navy `#002b56` instead. Measured on the Savanna page:

| Pair | Ratio |
|---|---|
| Button text / white, white / filled button, focus outline / white | 7.68:1 |
| Button text on hover background (`#f8f9fa`) | 7.28:1 |
| Time stamp on the current transcript line | 10.01:1 |
| Button border (exact red) / white | 4.40:1 (non-text) |
| Select border / white | 4.69:1 (non-text) |

Before and after screenshots at 1280 px and 412 px are in `tests/results/theme/` (`TAG=after node tests/screens.mjs`).

## Finished and not finished

Finished:

- The player, with restylable captions and the transcript (seek and download).
- Audio description.
- The sign window (synced, with position and size buttons) and the no-sign state.
- The offline pack.
- Complete Amharic.
- The blank and Savanna mounts.
- Docker Compose (web and API).
- The narrated lesson clip (edge-tts) and its generator.
- Unit tests, a Chrome end-to-end test, the axe scan and the Slow 3G measurement, all scripted and rerunnable.
- The Level 2 API with `openapi.yaml`, Swagger UI and the caption-upload webhook.

Not finished:

- The caption editor page (STT, then human correction, then VTT).
- Authentication on the upload API.
- A zip offline pack.
- The career gateway (job card and certificate).
- Open Badges.
- Level 3.
- An Ethiopian Sign Language video.
- A check of the Amharic by a native speaker. _TODO_
- **A test with the co-designer on a real phone with TalkBack.** _TODO_
- Tests with NVDA and VoiceOver.

## Libraries and their licences

The module and the API have no runtime libraries. Build tools: Python Pillow (HPND), FFmpeg (LGPL/GPL), edge-tts (LGPL-3.0, optional). Test tools (dev only): Playwright (Apache-2.0), axe-core and @axe-core/playwright (MPL-2.0). The API's `/docs` page loads Swagger UI (Apache-2.0) from unpkg.

**Code licence: MIT** ([LICENSE](LICENSE), copyright Firaol Kumssa). _To confirm with ALX: MIT is used until the open licence named at kick-off is confirmed._ This licence covers our code (`module/`, `api/`, `tools/`, `scripts/`, `tests/`, `demo/`) and the generated lesson media. The Savanna starter in `savanna/` is ALX's own and keeps ALX's terms.
