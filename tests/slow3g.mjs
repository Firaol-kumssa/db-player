// Load time and bytes for demo/blank.html on emulated Slow 3G (400 kbps down/up, 400 ms latency), cold cache,
// measured until <db-player> has rendered its controls. Run: BASE=http://localhost:8080 npm run slow3g
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:8080';
const RUNS = Number(process.env.RUNS || 3);
const browser = await chromium.launch({ channel: 'chrome' });
const out = [];

for (let i = 0; i < RUNS; i++) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: 400, downloadThroughput: (400 * 1000) / 8, uploadThroughput: (400 * 1000) / 8,
  });
  const reqs = new Map();
  let bytes = 0;
  let stop = false;
  cdp.on('Network.requestWillBeSent', (e) => reqs.set(e.requestId, e.request.url));
  cdp.on('Network.loadingFinished', (e) => { if (!stop) bytes += e.encodedDataLength; });
  const t0 = Date.now();
  await page.goto(`${BASE}/demo/blank.html`, { waitUntil: 'commit' });
  await page.waitForFunction(() => {
    const r = document.querySelector('db-player')?.shadowRoot;
    return r && r.querySelector('.b-play .lbl')?.textContent.trim() && r.querySelector('video.main').readyState >= 1;
  }, null, { timeout: 120000, polling: 50 });
  const ms = Date.now() - t0;
  stop = true;
  out.push({ ms, kb: bytes / 1024, requests: reqs.size });
  console.log(`run ${i + 1}: ${(ms / 1000).toFixed(2)} s, ${(bytes / 1024).toFixed(1)} KB, ${reqs.size} requests`);
  await ctx.close();
}
await browser.close();
const med = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
console.log(`median: ${(med(out.map((r) => r.ms)) / 1000).toFixed(2)} s, ${med(out.map((r) => r.kb)).toFixed(1)} KB transferred until the player is rendered (controls + video metadata)`);
