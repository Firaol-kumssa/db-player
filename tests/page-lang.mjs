// Stress test for the page-wide language switch (module/page-i18n.js) on the Savanna page.
// Run: BASE=http://localhost:8080 npm run test:page-lang
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:8080';
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1674, height: 840 } });
const pg = await ctx.newPage();
const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
let fails = 0;
const check = (name, ok, info = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`); };
const visibleEnglish = () => pg.evaluate(() => {
  const vis = (e) => { for (let x = e; x; x = x.parentElement) { const s = getComputedStyle(x); if (s.display === 'none' || s.visibility === 'hidden') return false; } return true; };
  const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) { const t = n.nodeValue.trim(); if (t && /[A-Za-z]{2,}/.test(t) && !/[ሀ-፿]/.test(t) && !n.parentElement.closest('script,style,db-player,#db-page-lang-wrap') && vis(n.parentElement)) out.push(t); }
  return out;
});
await pg.goto(`${BASE}/pages/concept-with-navigation.html`, { waitUntil: 'networkidle' });
await pg.evaluate(() => localStorage.clear()); await pg.reload({ waitUntil: 'networkidle' });
await pg.locator('#db-page-lang').waitFor(); await pg.waitForTimeout(400);

const left = await visibleEnglish();
check('Amharic: only course codes stay in English', left.every((t) => /^VA-\d$/.test(t)), left.join(' | ') || 'none');
await pg.keyboard.press('Tab'); let tabs = 1;
while (tabs < 30 && !(await pg.evaluate(() => document.activeElement?.id === 'db-page-lang'))) { await pg.keyboard.press('Tab'); tabs++; }
check('Keyboard: the switch is reached early with Tab', tabs <= 5, `${tabs} Tab presses`);
await pg.keyboard.press('Enter'); await pg.waitForTimeout(400);
const en = await pg.evaluate(() => ({ html: document.documentElement.lang, am: /[ሀ-፿]/.test(document.body.innerText.replace(/አማርኛ|ALX · Savanna/g, '')) }));
check('Enter switches the whole page to English', en.html === 'en' && !en.am, JSON.stringify(en));
await pg.mouse.wheel(0, 2500); await pg.waitForTimeout(400);
const vis = await pg.evaluate(() => { const r = document.querySelector('#db-page-lang').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('#db-page-lang') != null; });
check('The switch stays visible and on top while scrolling', vis);
await pg.keyboard.press('Space'); await pg.waitForTimeout(400);
check('Space switches back to Amharic', await pg.evaluate(() => document.documentElement.lang === 'am'));
await pg.evaluate(() => { const d = document.createElement('div'); d.id = 'late'; d.innerHTML = '<button>Mark as complete</button> <span>Continue this course</span>'; document.querySelector('.savanna-styles').append(d); });
await pg.waitForTimeout(200);
check('Content the host adds later is translated', /[ሀ-፿]/.test(await pg.locator('#late').textContent()) && !/Mark/.test(await pg.locator('#late').textContent()));
await pg.evaluate(() => { document.querySelector('#curriculum_navigation_content h1 span').textContent = 'Why Become a VA?'; });
await pg.waitForTimeout(200);
check('Text the host rewrites is translated again', (await pg.locator('#curriculum_navigation_content h1 span').textContent()) === 'ለምን ቨርቹዋል ረዳት መሆን?');
await pg.evaluate(() => { document.querySelector('.header').innerHTML = '<span>alx</span>'; });
await pg.waitForTimeout(200);
check('The switch puts itself back if the header is rebuilt', await pg.evaluate(() => !!document.querySelector('.header #db-page-lang')));
await pg.locator('#db-page-lang').click(); await pg.waitForTimeout(300);
const back = await pg.evaluate(() => ({ late: document.querySelector('#late').textContent, h1: document.querySelector('#curriculum_navigation_content h1 span').textContent }));
check('English restores the host\'s latest original text', back.late === 'Mark as complete Continue this course' && back.h1 === 'Why Become a VA?', JSON.stringify(back));
for (let i = 0; i < 10; i++) await pg.locator('#db-page-lang').click();
await pg.waitForTimeout(300);
check('Ten fast toggles: no errors', !errs.length, errs.join(' | ') || 'none');
await b.close();
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
