// axe-core accessibility scan (WCAG 2.0/2.1/2.2 A + AA), including open shadow DOM.
// Run: BASE=http://localhost:8080 npm run axe        (needs docker compose up and Google Chrome)
// Splits results into issues inside <db-player> (ours) and issues in the host page (Savanna's).
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';

const BASE = process.env.BASE || 'http://localhost:8080';
const PAGES = ['/demo/blank.html', '/pages/concept-with-navigation.html'];
const browser = await chromium.launch({ channel: 'chrome' });
let ourSerious = 0;

for (const path of PAGES) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  await page.locator('db-player .b-play .lbl').filter({ hasText: /\S/ }).waitFor();
  // open the transcript and the no-sign panel so their contents are scanned too
  await page.locator('db-player .b-tr').click();
  await page.locator('db-player .b-sign').click();
  const { violations, passes } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  console.log(`\n== ${path}: ${passes.length} rules passed, ${violations.length} rules with violations`);
  for (const v of violations) {
    const ours = v.nodes.filter((n) => n.target.length > 1 || String(n.target[0]).startsWith('db-player'));
    const host = v.nodes.length - ours.length;
    if (ours.length && ['critical', 'serious'].includes(v.impact)) ourSerious += ours.length;
    console.log(`  [${v.impact}] ${v.id}: ${v.help} — db-player: ${ours.length}, host page: ${host}`);
    for (const n of ours.slice(0, 5)) console.log(`      ours: ${JSON.stringify(n.target)} ${n.failureSummary?.split('\n')[1] || ''}`);
  }
  await ctx.close();
}
await browser.close();
console.log(`\nCritical/serious issues inside db-player: ${ourSerious}`);
process.exit(ourSerious ? 1 : 0);
