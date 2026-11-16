# WCAG 2.2 AA conformance report: db-player

Scope: the `<db-player>` module only (not the Savanna host page). Version 1.1, 15 November 2026.

| WCAG 2.2 AA criterion | Supports / Partly / Does not | Notes |
|---|---|---|
| 1.1.1 Non-text content | Supports | Icons are `aria-hidden` next to visible text. The poster is decorative. |
| 1.2.1 Audio-only and video-only | Supports | The transcript covers all spoken content. |
| 1.2.2 Captions (prerecorded) | Supports | Amharic and English captions, written from the narration script, including sound cues ([music]). |
| 1.2.3 Audio description or media alternative | Supports | Description track and the transcript. |
| 1.2.5 Audio description (prerecorded) | Partly | Spoken with speechSynthesis. Phones with no Amharic voice show the text and send it to the screen reader instead. |
| 1.3.1 Info and relationships | Supports | Real buttons, labels, headings, lists and `role="group"` with names. |
| 1.3.2 Meaningful sequence | Supports | DOM order matches visual order. |
| 1.4.1 Use of colour | Supports | Pressed state uses `aria-pressed` plus a fill change, and the current transcript line has a side bar. |
| 1.4.2 Audio control | Supports | No autoplay. |
| 1.4.3 Contrast (minimum) | Supports | The player takes Savanna's theme, but the brand red `#db3e3e` (4.40:1) is never used for text. Text and filled buttons use a 30% darker shade, `#992b2b`: 7.68:1 on white, 7.28:1 on the hover background. Other text is 7:1 or more, which also meets 1.4.6 (AAA). Without `color-mix` the fallback is navy `#002b56`. axe color-contrast: 0 issues in the player on both pages. |
| 1.4.4 Resize text | Supports | rem units, tested at 200%. |
| 1.4.10 Reflow | Supports | No sideways scroll at 320 px: on `demo/blank.html` the scrollWidth is 320. On Savanna the player sits within 25–296 px, but the page is 480 px wide because of Savanna's own header (a host issue). The "below the video" caption position helps here. |
| 1.4.11 Non-text contrast | Supports | Button borders use the exact host red: 4.40:1 on white (3:1 needed). Select borders `#6c757d` are 4.69:1. The 3 px focus outline uses the dark shade (7.68:1); on the video it is `#f5a300` on black. |
| 1.4.12 Text spacing | Supports | No fixed heights on text containers. |
| 1.4.13 Content on hover or focus | Supports | No hover-only content. |
| 2.1.1 Keyboard | Supports | Every function is a button, select or range input. Tested with Tab only (automated). |
| 2.1.2 No keyboard trap | Supports | Dialogs close with Escape. Full screen exits with Escape. |
| 2.1.4 Character key shortcuts | Supports | K, Space and arrows work only while focus is inside the player. |
| 2.2.2 Pause, stop, hide | Supports | Nothing moves by itself. Audio description pauses the video. |
| 2.4.3 Focus order | Supports | Video, position slider, controls, panels. |
| 2.4.6 Headings and labels | Supports | The panel and dialog headings are `<h2>`, so they don't skip a level under the page's `<h1>` (axe heading-order: 0 issues in the player). |
| 2.4.7 Focus visible | Supports | `:focus-visible` with a 3 px outline, 2 px offset. |
| 2.4.11 Focus not obscured (minimum) | Supports | No sticky elements. |
| 2.5.7 Dragging movements | Supports | Sign window: position and size buttons only. The seek slider also works with arrow keys and the ±10 s buttons. |
| 2.5.8 Target size (minimum) | Supports | All controls are at least 44 × 44 CSS px (`max(2.75rem, 44px)`, because Savanna's root font is 14 px). The e2e test checks this on both pages. |
| 3.1.1 Language of page | Supports | `lang` on the component root. |
| 3.1.2 Language of parts | Supports | Captions and transcript lines carry their own `lang`. The language button is labelled in the target language and has `lang` set to match ("English" `lang=en`, "አማርኛ" `lang=am`). |
| 3.2.1 / 3.2.2 On focus, on input | Supports | Settings apply on change, with no context change, and are announced. |
| 3.2.6 Consistent help | Supports | Keyboard help is always in the same place. |
| 3.3.1 Error identification | Supports | Video load errors are shown in words (`role="alert"`). |
| 4.1.2 Name, role, value | Supports | Native elements, `aria-pressed`, `aria-expanded`, and `aria-valuetext` on the slider ("1:05 of 0:55" style). |
| 4.1.3 Status messages | Supports | One polite live region for setting changes, speed, completion and the offline status. Learners who find this too talkative can turn on Quiet mode; errors still use `role="alert"`. |

## Who tested, how, and what they could not do

- Automated (15 November 2026, Chrome 157 via Playwright, on `demo/blank.html` and the Savanna page; `npm run test:e2e`), 33 of 34 checks pass:
  - Tab reaches all 16 controls.
  - The Amharic/English switch works and is remembered.
  - Quiet mode silences the player's own announcements.
  - Every control is at least 44 × 44 px.
  - K plays the video.
  - A transcript line seeks to the right time.
  - Audio description pauses the video and resumes it.
  - Caption settings persist after a reload.
  - Both dialogs close with Escape and return focus to their opener.
  - At 320 px, nothing in the player overflows.
  - At 200% zoom (640 CSS px), no control is cut off.
  - No console errors.
  - The one failure is Savanna's own header at 320 px (see 1.4.10).
- axe-core 4.14, WCAG 2.0/2.1/2.2 A and AA, open shadow DOM included (`npm run axe`): **0 violations in db-player** on both pages. The blank page has 0 violations in total. The Savanna page has 6 rule violations, all in the starter's markup (listed in the README). The strict run (`STRICT=1 npm run axe`: AAA plus best-practice) also finds **0 issues in db-player**.
- Unit tests: 10 of 10 pass (`npm test`).
- TalkBack on Android: _TODO: device, Android version, result (phone test over a cloudflared tunnel)_.
- NVDA on Windows: _not tested_.
- Co-designer: _TODO: who (role only), device, screen reader or settings, what they could not do_.
- Amharic interface text and captions: _TODO: check by a native speaker_.
- Known gaps: no Ethiopian Sign Language video yet, Amharic text-to-speech depends on the phone's installed voices, and the offline pack needs HTTPS.
