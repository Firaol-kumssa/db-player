// End-to-end checks for <db-player> in real Chrome. Run: BASE=http://localhost:8080 node tests/e2e.mjs
// Needs: docker compose up, npm i, and Google Chrome installed.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:8080';
const PAGES = ['/demo/blank.html', '/pages/concept-with-navigation.html'];
const results = [];
const check = (page, name, ok, info = '') => {
  results.push({ page, name, ok: !!ok, info });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${page}  ${name}${info ? `  (${info})` : ''}`);
};

const P = 'db-player';

const browser = await chromium.launch({ channel: 'chrome', headless: true });

for (const path of PAGES) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await page.goto(BASE + path, { waitUntil: 'load' });
  await page.locator(`${P} .b-play .lbl`).filter({ hasText: /\S/ }).waitFor();
  await page.waitForFunction(() => document.querySelector('db-player').shadowRoot.querySelector('video.main').readyState >= 1);

  // 1. Tab through every control
  const want = await page.evaluate(() => [...document.querySelector('db-player').shadowRoot
    .querySelectorAll('.b-lang, video.main, input.seek, .bar button, .b-off')].filter((e) => e.offsetParent || e.tagName === 'VIDEO').map((e) => e.className));
  await page.locator(`${P} video.main`).focus();
  const seen = new Set();
  for (let i = 0; i < 40 && seen.size < want.length; i++) {
    const cls = await page.evaluate(() => {
      let a = document.activeElement; while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
      return a && a.getRootNode() !== document ? a.className : null;
    });
    if (cls != null) seen.add(cls);
    await page.keyboard.press('Tab');
  }
  const missed = want.filter((c) => !seen.has(c));
  check(path, 'Tab reaches every control', !missed.length, missed.length ? `missed: ${missed.join(', ')}` : `${want.length} controls`);

  // 1b. Targets at least 44 × 44 CSS px (Savanna's root font is 14 px, so rem alone is not enough)
  const small = await page.evaluate(() => [...document.querySelector('db-player').shadowRoot.querySelectorAll('button, input.seek')]
    .filter((b) => b.offsetParent && !b.closest('.lines')).map((b) => { const r = b.getBoundingClientRect(); return { c: b.className || b.textContent.trim().slice(0, 12), w: r.width, h: r.height }; })
    .filter((x) => x.h < 43.5 || (x.w < 43.5 && x.c !== 'seek')));
  check(path, 'Every control is at least 44 × 44 px', !small.length, small.map((x) => `${x.c} ${x.w.toFixed(0)}×${x.h.toFixed(0)}`).join(', '));

  // 2. K on the video plays
  await page.locator(`${P} video.main`).focus();
  await page.keyboard.press('k');
  await page.waitForTimeout(800);
  const playing = await page.evaluate(() => { const v = document.querySelector('db-player').shadowRoot.querySelector('video.main'); return !v.paused && v.currentTime > 0; });
  check(path, 'K on the video plays', playing);
  await page.keyboard.press('k');

  // 3. Transcript line jumps to ~10 s
  await page.locator(`${P} .b-tr`).click();
  const line = page.locator(`${P} .lines button`).filter({ hasText: '0:10' }).first();
  await line.click();
  await page.waitForTimeout(300);
  const t = await page.evaluate(() => document.querySelector('db-player').shadowRoot.querySelector('video.main').currentTime);
  check(path, 'Transcript line 0:10 seeks to ≈10 s', Math.abs(t - 10.4) < 0.6, `currentTime=${t.toFixed(2)}`);
  const cur = await page.locator(`${P} .lines button[aria-current=true]`).count();
  check(path, 'Current transcript line has aria-current', cur === 1);
  await page.locator(`${P} .b-tr`).click();

  // 4. Audio description pauses at slide 2 and resumes
  await page.locator(`${P} .b-ad`).click();
  await page.evaluate(() => { const v = document.querySelector('db-player').shadowRoot.querySelector('video.main'); v.currentTime = 9.5; });
  await page.locator(`${P} .b-play`).click();
  const paused = await page.waitForFunction(() => {
    const r = document.querySelector('db-player').shadowRoot; const v = r.querySelector('video.main');
    return v.paused && !r.querySelector('.adtext').hidden && v.currentTime > 9.9 ? { t: v.currentTime, text: r.querySelector('.adtext').textContent } : false;
  }, null, { timeout: 8000 }).then((h) => h.jsonValue()).catch(() => null);
  check(path, 'AD pauses at slide-2 description', paused && /ስላይድ 2/.test(paused.text), paused ? `at ${paused.t.toFixed(2)} s` : 'did not pause');
  const resumed = await page.waitForFunction(() => {
    const v = document.querySelector('db-player').shadowRoot.querySelector('video.main'); return !v.paused && v.currentTime > 11;
  }, null, { timeout: 15000 }).then(() => true).catch(() => false);
  check(path, 'AD resumes playback after the description', resumed);
  await page.evaluate(() => document.querySelector('db-player').shadowRoot.querySelector('video.main').pause());
  await page.locator(`${P} .b-ad`).click();

  // 5. Caption size + "below", persisted across reload
  await page.locator(`${P} .b-ccset`).click();
  await page.locator(`${P} #f-size`).selectOption('xl');
  await page.locator(`${P} #f-pos`).selectOption('below');
  await page.keyboard.press('Escape');
  await page.reload({ waitUntil: 'load' });
  await page.locator(`${P} .b-play .lbl`).filter({ hasText: /\S/ }).waitFor();
  const st = await page.evaluate(() => {
    const r = document.querySelector('db-player').shadowRoot;
    return { size: r.querySelector('#f-size').value, pos: r.querySelector('#f-pos').value, below: !r.querySelector('.capbelow').hidden,
      cssSize: r.querySelector('.wrap').style.getPropertyValue('--cap-size') };
  });
  check(path, 'Caption size + "below" persist after reload', st.size === 'xl' && st.pos === 'below' && st.below && st.cssSize === '2.25rem', JSON.stringify(st));

  // 6. Dialogs close with Escape and return focus to the opener
  for (const [btn, dlg] of [['.b-ccset', '.d-set'], ['.b-help', '.d-help']]) {
    await page.locator(`${P} ${btn}`).focus();
    await page.keyboard.press('Enter');
    const open = await page.evaluate((d) => document.querySelector('db-player').shadowRoot.querySelector(d).open, dlg);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    const back = await page.evaluate((b) => {
      let a = document.activeElement; while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
      return a && a.matches(b);
    }, btn);
    const closed = await page.evaluate((d) => !document.querySelector('db-player').shadowRoot.querySelector(d).open, dlg);
    check(path, `${dlg} opens, Escape closes, focus returns to ${btn}`, open && closed && back);
  }

  // 6b. Quiet mode: one last announcement, then the live region stays silent
  const sr = () => page.evaluate(() => document.querySelector('db-player').shadowRoot.querySelector('.sr').textContent);
  await page.locator(`${P} .b-quiet`).click();
  await page.waitForTimeout(200);
  const qOn = await page.locator(`${P} .b-quiet`).getAttribute('aria-pressed');
  const first = await sr();
  await page.locator(`${P} .b-cc`).click();
  await page.waitForTimeout(200);
  const after = await sr();
  await page.locator(`${P} .b-cc`).click();
  await page.locator(`${P} .b-quiet`).click();
  check(path, 'Quiet mode silences the player\'s announcements', qOn === 'true' && first && after === first, `pressed=${qOn}, live region kept "${first.slice(0, 25)}…"`);

  // 6c. Page-wide language switch (module/page-i18n.js, top right): page + player Amharic -> English, remembered, and back
  const ui = () => page.evaluate(() => { const r = document.querySelector('db-player').shadowRoot;
    const sw = document.querySelector('#db-page-lang'); const box = sw.getBoundingClientRect();
    return { html: document.documentElement.lang, lang: r.querySelector('.wrap').lang, play: r.querySelector('.b-play .lbl').textContent, sw: sw.querySelector('span').textContent, // visible label only
      swLang: sw.lang, big: box.width >= 44 && box.height >= 44, ownHidden: getComputedStyle(r.querySelector('.langrow')).display === 'none',
      cap: r.querySelector('#f-lang').value, line: r.querySelector('.lines button')?.lang }; });
  const am = await ui();
  await page.locator('#db-page-lang').click();
  await page.waitForFunction(() => document.querySelector('db-player').shadowRoot.querySelector('.lines button')?.lang === 'en');
  const en = await ui();
  await page.reload({ waitUntil: 'load' });
  await page.locator(`${P} .b-play .lbl`).filter({ hasText: /\S/ }).waitFor();
  await page.locator('#db-page-lang').waitFor();
  await page.waitForTimeout(300);
  const kept = await ui();
  check(path, 'Page language switch: Amharic → English (page + player), remembered after reload',
    am.html === 'am' && en.html === 'en' && kept.html === 'en' && am.big && am.ownHidden && am.lang === 'am' && am.sw === 'English' && am.swLang === 'en' && en.lang === 'en' && en.play === 'Play' && en.sw === 'አማርኛ' && en.cap === 'en' && en.line === 'en' && kept.lang === 'en',
    `${am.play} → ${en.play}; captions ${am.cap} → ${en.cap}; after reload ${kept.lang}`);
  await page.locator('#db-page-lang').click();
  await page.waitForTimeout(300);
  const back = await ui();
  const heard = await page.locator('#db-page-lang').ariaSnapshot();
  check(path, 'Page language switch tells screen readers what it does', /English \(የገጹን ቋንቋ ቀይር\)|አማርኛ \(change page language\)/.test(heard), heard.trim());
  check(path, 'Page language switch: back to Amharic', back.html === 'am' && back.lang === 'am' && back.cap === 'am' && back.sw === 'English', back.play);

  // reset prefs for the next page
  await page.evaluate(() => { localStorage.removeItem('db-player:prefs'); localStorage.removeItem('db-page-lang'); });

  // 7. 320 px reflow
  await page.setViewportSize({ width: 320, height: 640 });
  await page.waitForTimeout(300);
  const rf = await page.evaluate(() => {
    const el = document.querySelector('db-player'); const r = el.getBoundingClientRect();
    const over = [...el.shadowRoot.querySelectorAll('*')].filter((e) => { const b = e.getBoundingClientRect(); return b.width && b.right > 320.5; }).map((e) => e.className || e.tagName);
    return { sw: document.documentElement.scrollWidth, left: r.left, right: r.right, over };
  });
  // On the Savanna page the starter's own header (.curriculum-switcher) is wider than 320 px; that is reported, not fixed.
  check(path, '320 px: document scrollWidth = 320', rf.sw === 320, `scrollWidth=${rf.sw}${rf.sw > 320 && path.includes('pages/') ? ' — Savanna header, not db-player' : ''}`);
  check(path, '320 px: nothing in the player overflows', !rf.over.length && rf.right <= 320.5, rf.over.length ? `overflow: ${rf.over.slice(0, 5).join(', ')}` : `player ${rf.left.toFixed(0)}–${rf.right.toFixed(0)} px`);

  // 8. 200% zoom ≈ 1280×800 window at 200% = 640×400 CSS px
  await page.setViewportSize({ width: 640, height: 400 });
  await page.waitForTimeout(300);
  const zm = await page.evaluate(() => {
    const el = document.querySelector('db-player'); const host = el.getBoundingClientRect();
    return [...el.shadowRoot.querySelectorAll('.bar button, .b-off, .seek')].filter((b) => b.offsetParent).map((b) => {
      const r = b.getBoundingClientRect();
      return { c: b.className, cut: r.left < host.left - 0.5 || r.right > host.right + 0.5 || r.right > 640.5 || b.scrollWidth > b.clientWidth + 1 };
    }).filter((x) => x.cut).map((x) => x.c);
  });
  check(path, '200% zoom (640 CSS px): no control cut off', !zm.length, zm.join(', '));

  const own = errors.filter((e) => /db-player|i18n|module\/|media\//i.test(e));
  check(path, 'No console errors from db-player', !own.length, own.join(' | ') || (errors.length ? `${errors.length} other (host) errors ignored` : 'none'));
  if (errors.length) console.log('  console errors on page:', errors.slice(0, 5));
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
