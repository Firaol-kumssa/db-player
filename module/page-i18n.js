/*! db-player page language switch — turns a whole host page between English and Amharic. MIT.
 *
 * <script src="/module/page-i18n.js" defer data-dict="/module/i18n/pages/<page>.am.json"></script>
 *
 * - Adds one "English / አማርኛ" button at the top right (inside Savanna's fixed .header when there is one).
 * - Swaps visible text, alt/title/aria-label/placeholder and document.title using the page dictionary
 *   (English text -> Amharic), and back to the original. The page's HTML files are not changed.
 * - Sets <html lang> so screen readers switch voice, and keeps every <db-player> in the same language,
 *   both ways: the player's own language button switches the page too (event db-player:lang).
 * - Remembers the choice in localStorage ("db-page-lang"). Button text comes from module/i18n/{am,en}.json.
 */
(() => {
  'use strict';
  if (window.__dbPageLang) return;
  window.__dbPageLang = true;

  const me = document.currentScript;
  const BASE = new URL('.', (me && me.src) || location.href).href;
  const DICT = me && me.dataset.dict ? new URL(me.dataset.dict, document.baseURI).href : null;
  const KEY = 'db-page-lang';
  const ATTRS = ['alt', 'title', 'aria-label', 'placeholder'];
  const SKIP = 'script,style,noscript,template,db-player,#db-page-lang-wrap,.db-page-lang-sr';

  const load = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const save = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
  const json = (u) => fetch(u).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  const norm = (s) => s.replace(/\s+/g, ' ').trim();

  let dict = {}, ui = {}, current = 'en', amTitle = null, btn, label, live;
  const origText = new Map();   // text node -> original value
  const origAttr = new Map();   // element  -> { attr: original value }
  const origTitle = document.title;

  const CSS = `
#db-page-lang-wrap{flex:none;margin-inline:.5rem 1rem;z-index:1060;line-height:1.5}
#db-page-lang-wrap.floating{position:fixed;top:.75rem;inset-inline-end:1rem}
#db-page-lang{--a:var(--savanna-theme-primary,var(--bs-primary,#002b56));--d:#002b56;
  display:inline-flex;align-items:center;gap:.4rem;min-height:44px;min-width:44px;margin:0;padding:.375rem .875rem;
  font:inherit;font-size:1rem;font-weight:500;color:var(--d);background:#fff;border:1px solid var(--a);
  border-radius:var(--bs-border-radius,.375rem);cursor:pointer;white-space:nowrap}
@supports (color:color-mix(in srgb,red,blue)){#db-page-lang{--d:color-mix(in srgb,var(--a) 70%,#000)}}
#db-page-lang:hover{background:#f8f9fa;border-color:var(--d)}
#db-page-lang:focus-visible{outline:3px solid var(--d);outline-offset:2px}
#db-page-lang svg{width:1.1em;height:1.1em;flex:none}
.db-page-lang-sr{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}`;

  function textNodes() {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement && n.nodeValue.trim() && !n.parentElement.closest(SKIP) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    const out = [];
    for (let n = w.nextNode(); n; n = w.nextNode()) out.push(n);
    return out;
  }

  function translate(lang) {
    for (const n of textNodes()) {
      if (!origText.has(n)) origText.set(n, n.nodeValue);
      const src = origText.get(n);
      const t = lang === 'am' ? dict[norm(src)] : null;
      // keep the surrounding spaces so inline words (<b>, <span>) stay separated
      const next = t ? src.match(/^\s*/)[0] + t + src.match(/\s*$/)[0] : src;
      if (n.nodeValue !== next) n.nodeValue = next;
    }
    for (const el of document.body.querySelectorAll(ATTRS.map((a) => `[${a}]`).join(','))) {
      if (el.closest(SKIP)) continue;
      if (!origAttr.has(el)) origAttr.set(el, Object.fromEntries(ATTRS.filter((a) => el.hasAttribute(a)).map((a) => [a, el.getAttribute(a)])));
      for (const [a, v] of Object.entries(origAttr.get(el))) el.setAttribute(a, (lang === 'am' && dict[norm(v)]) || v);
    }
    document.title = lang === 'am' && amTitle ? amTitle : origTitle;
  }

  function syncPlayers(lang) {
    for (const p of document.querySelectorAll('db-player')) {
      p.setAttribute('data-page-lang', '');   // the player hides its own language button: one switch for the page
      if (p.getAttribute('lang') !== lang) p.setAttribute('lang', lang);
      else if (p.uiLang && p.uiLang !== lang && typeof p.switchLang === 'function') p.switchLang(lang, false);
    }
  }

  function apply(lang, announce) {
    current = lang === 'am' ? 'am' : 'en';
    document.documentElement.lang = current;
    translate(current);
    syncPlayers(current);
    save(KEY, current);
    const t = ui[current] || {};
    label.textContent = t.switchLang || (current === 'am' ? 'English' : 'አማርኛ');
    btn.lang = current === 'am' ? 'en' : 'am';   // the button is written in the language it switches to
    if (announce && t.pageSwitched) { live.textContent = ''; setTimeout(() => { live.textContent = t.pageSwitched; }, 50); }
  }

  function build() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    const wrap = document.createElement('div');
    wrap.id = 'db-page-lang-wrap';
    btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'db-page-lang';
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/></svg><span></span>';
    label = btn.querySelector('span');
    wrap.append(btn);
    const header = document.querySelector('.header');   // Savanna's fixed top bar
    if (header) header.append(wrap); else { wrap.classList.add('floating'); document.body.prepend(wrap); }
    live = document.createElement('div');
    live.className = 'db-page-lang-sr';
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    document.body.append(live);
    btn.addEventListener('click', () => apply(current === 'am' ? 'en' : 'am', true));
    document.addEventListener('db-player:lang', (e) => { if (e.detail && e.detail.lang && e.detail.lang !== current) apply(e.detail.lang, false); });
  }

  async function init() {
    const [am, en, d] = await Promise.all([json(new URL('i18n/am.json', BASE)), json(new URL('i18n/en.json', BASE)), DICT ? json(DICT) : {}]);
    ui = { am, en };
    dict = d.text || {};
    amTitle = d.title || null;
    build();
    const player = document.querySelector('db-player');
    const start = load(KEY) || (me && me.dataset.default) || (player && player.getAttribute('lang')) || document.documentElement.lang || 'en';
    apply(String(start).toLowerCase().startsWith('am') ? 'am' : 'en', false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
