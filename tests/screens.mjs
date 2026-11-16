// Screenshots of both pages at 1280 px and 412 px. Run: BASE=http://localhost:8080 TAG=after node tests/screens.mjs
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:8080', TAG = process.env.TAG || 'shot';
const OUT = new URL('./results/theme/', import.meta.url).pathname;
const b = await chromium.launch({ channel: 'chrome' });
for (const [name, path] of [['savanna', '/pages/concept-with-navigation.html'], ['blank', '/demo/blank.html']]) {
  for (const w of [1280, 412]) {
    const ctx = await b.newContext({ viewport: { width: w, height: w > 600 ? 1000 : 1400 } });
    const pg = await ctx.newPage();
    await pg.goto(BASE + path, { waitUntil: 'networkidle' });
    await pg.locator('db-player .b-play .lbl').filter({ hasText: /\S/ }).waitFor();
    await pg.locator('db-player .b-tr').click();          // show the transcript panel too
    await pg.locator('db-player .b-play').focus();        // show the focus ring
    await pg.keyboard.press('Shift+Tab'); await pg.keyboard.press('Tab');
    await pg.evaluate(() => { const e = document.querySelector('db-player'); window.scrollTo(0, e.getBoundingClientRect().top + scrollY - 160); });
    await pg.mouse.move(0, 0);
    await pg.screenshot({ path: `${OUT}${TAG}-${name}-${w}.png` });
    if (name === 'savanna') {
      await pg.locator('db-player .b-ccset').click();
      await pg.screenshot({ path: `${OUT}${TAG}-${name}-${w}-dialog.png` });
    }
    await ctx.close();
  }
}
await b.close();
console.log('saved to', OUT);
