/*! db-player — accessible lesson video player (DIGITAL BRIDGE Accessibility Hackathon 2026, Track 2). MIT. */
(() => {
  'use strict';
  if (!('customElements' in window) || customElements.get('db-player')) return;

  const SCRIPT_SRC = (document.currentScript && document.currentScript.src) || location.href;
  const BASE = new URL('.', SCRIPT_SRC).href;
  const STORE = 'db-player:prefs';
  const CACHE = 'db-player-offline-v1';
  const SIZES = { s: '1rem', m: '1.375rem', l: '1.75rem', xl: '2.25rem' };
  const COLORS = { white: ['#ffffff', '0,0,0'], yellow: ['#ffeb3b', '0,0,0'], black: ['#000000', '255,255,255'] };
  const SPEEDS = [1, 1.25, 1.5, 0.75, 0.5];
  const SIGN_SIZES = { s: '28%', m: '38%', l: '50%' };
  const LANG_KEYS = { am: 'langAm', en: 'langEn' };
  const VOICE_LANG = { am: 'am-ET', en: 'en-US' };

  const stringCache = {};
  const loadStrings = (lang) =>
    stringCache[lang] ||
    (stringCache[lang] = fetch(new URL(`i18n/${lang}.json`, BASE)).then((r) => {
      if (!r.ok) throw new Error(`i18n ${lang}: ${r.status}`);
      return r.json();
    }));

  // ---------- pure helpers (unit tested) ----------
  const parseTime = (s) => s.trim().split(':').reduce((acc, x) => acc * 60 + parseFloat(x.replace(',', '.')), 0);
  function parseVTT(text) {
    const cues = [];
    for (const block of String(text).replace(/\r/g, '').split(/\n{2,}/)) {
      const lines = block.split('\n').filter((l) => l.trim() !== '');
      const i = lines.findIndex((l) => l.includes('-->'));
      if (i < 0) continue;
      const [a, rest] = lines[i].split('-->');
      cues.push({
        start: parseTime(a),
        end: parseTime(rest.trim().split(/\s+/)[0]),
        text: lines.slice(i + 1).join('\n').replace(/<[^>]+>/g, ''),
      });
    }
    return cues;
  }
  const cueIndexAt = (cues, t) => cues.findIndex((c) => t >= c.start && t < c.end);
  const fmt = (t) => {
    t = Math.max(0, Math.floor(Number.isFinite(t) ? t : 0));
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  };
  const fill = (s, vars = {}) => String(s ?? '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
  const langOf = (url) => ((url.match(/\.([a-z]{2,3})\.vtt(?:[?#].*)?$/i) || [])[1] || 'und').toLowerCase();
  const list = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
  const readPrefs = () => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } };
  const writePrefs = (p) => { try { localStorage.setItem(STORE, JSON.stringify(p)); } catch { /* private mode */ } };

  const CSS = `
:host{display:block;font-family:var(--bs-body-font-family,system-ui,"Noto Sans Ethiopic","Kefa",sans-serif);color:var(--bs-body-color,#1a1a1a);line-height:1.5;--p:var(--bs-primary,#002b56);margin-block:1rem}
@supports (color:color-mix(in srgb,red,blue)){:host{--p:color-mix(in srgb,var(--bs-primary,#002b56) 80%,#000)}}
:host([hidden]){display:none}
.wrap[lang=am]{line-height:1.7}
*{box-sizing:border-box}
.stage{position:relative;background:#000;border-radius:.5rem;overflow:hidden}
video.main{display:block;width:100%;aspect-ratio:16/9;max-height:70vh;background:#000}
video.main:focus-visible{outline:3px solid #f5a300;outline-offset:-3px}
.cap{position:absolute;inset-inline:5%;bottom:6%;text-align:center;pointer-events:none;white-space:pre-line;font-size:var(--cap-size,1.375rem);line-height:1.5}
.cap span{color:var(--cap-fg,#fff);background:rgba(var(--cap-bg,0,0,0),var(--cap-op,.9));padding:.15em .45em;border-radius:.25em;box-decoration-break:clone;-webkit-box-decoration-break:clone}
.cap.top{bottom:auto;top:6%}
.capbelow{background:#000;text-align:center;white-space:pre-line;padding:.5rem;font-size:var(--cap-size,1.375rem);min-height:2.5em;border-radius:0 0 .5rem .5rem}
.capbelow span{color:var(--cap-fg,#fff);background:rgba(var(--cap-bg,0,0,0),1);padding:.15em .45em}
.sign{position:absolute;width:var(--sign-w,38%);border:2px solid #fff;background:#000;border-radius:.375rem;overflow:hidden}
.sign video{display:block;width:100%}
.sign.tl{top:.5rem;inset-inline-start:.5rem}.sign.tr{top:.5rem;inset-inline-end:.5rem}
.sign.bl{bottom:.5rem;inset-inline-start:.5rem}.sign.br{bottom:.5rem;inset-inline-end:.5rem}
.adtext{margin:.5rem 0 0;padding:.5rem .75rem;border-inline-start:.25rem solid #f5a300;background:#fff8e1;color:#1a1a1a}
.seekrow{display:flex;align-items:center;gap:.75rem;margin-top:.5rem}
.seek{flex:1;min-height:2.75rem;accent-color:var(--p);min-width:6rem}
.time{font-variant-numeric:tabular-nums;white-space:nowrap}
.bar,.signtools{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.5rem}
button,select{font:inherit;font-size:1rem}
button{min-height:2.75rem;min-width:2.75rem;padding:.5rem .8rem;border-radius:.375rem;border:2px solid var(--p);background:#fff;color:var(--p);cursor:pointer;line-height:1.3}
button.primary,button[aria-pressed=true]{background:var(--p);color:#fff}
button:hover{text-decoration:underline}
:focus-visible{outline:3px solid #f5a300;outline-offset:2px}
.ico{display:inline-block;min-width:1em}
.panel{margin-top:.75rem;padding:.75rem;border:1px solid #8a8a8a;border-radius:.5rem}
.panel p{margin:0 0 .5rem}
.offline{margin-top:.75rem}
.offline p{margin:.5rem 0 0}
.offline a{color:var(--p);font-weight:600;display:inline-block;margin-top:.5rem;min-height:1.5rem}
.err{color:#b00020;font-weight:600;margin:.5rem 0 0}
.tr h3,dialog h3{font-size:1.25rem;margin:0 0 .5rem}
.lines{list-style:none;margin:.5rem 0 0;padding:0;max-height:18rem;overflow:auto;border:1px solid #8a8a8a;border-radius:.375rem}
.lines button{display:flex;gap:.75rem;width:100%;text-align:start;border:0;border-radius:0;border-bottom:1px solid #ddd;background:#fff;color:#1a1a1a;font-weight:400}
.lines button .t{color:#555;font-variant-numeric:tabular-nums;min-width:3rem}
.lines button[aria-current=true]{background:#fff3cd;box-shadow:inset .25rem 0 0 #f5a300}
dialog{max-width:min(32rem,92vw);border:0;border-radius:.75rem;padding:1.25rem;color:#1a1a1a;background:#fff}
dialog::backdrop{background:rgba(0,0,0,.55)}
dialog label{display:block;font-weight:600;margin-top:.75rem}
dialog select{width:100%;min-height:2.75rem;padding:.25rem .5rem;border:2px solid #555;border-radius:.375rem;background:#fff;color:#1a1a1a}
dialog .actions{margin-top:1rem;display:flex;justify-content:flex-end}
dl{display:grid;grid-template-columns:auto 1fr;gap:.5rem 1rem;margin:0}
dt{font-weight:700}dd{margin:0}
.preview{margin-top:1rem;padding:.75rem;background:#333;text-align:center;border-radius:.375rem;font-size:var(--cap-size,1.375rem)}
.preview span{color:var(--cap-fg,#fff);background:rgba(var(--cap-bg,0,0,0),var(--cap-op,.9));padding:.15em .45em}
.sr{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
[hidden]{display:none!important}
:host(:fullscreen){background:#000;color:#fff;overflow:auto;padding:1rem}
:host(:fullscreen) video.main{max-height:80vh}
:host(:fullscreen) .tr,:host(:fullscreen) .offline,:host(:fullscreen) .panel{color:#fff}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important;scroll-behavior:auto!important}}
`;

  const HTML = `
<div class="wrap" role="region" data-label="player">
  <div class="stage">
    <video class="main" playsinline preload="metadata" tabindex="0" data-label="video"></video>
    <div class="cap" hidden></div>
    <div class="sign br" hidden><video class="signv" muted playsinline preload="metadata" aria-hidden="true" tabindex="-1"></video></div>
  </div>
  <div class="capbelow" hidden></div>
  <p class="adtext" hidden></p>
  <p class="err" role="alert" hidden></p>
  <div class="seekrow">
    <input type="range" class="seek" min="0" max="1000" step="1" value="0" data-label="seek">
    <span class="time" aria-hidden="true">0:00 / 0:00</span>
  </div>
  <div class="bar" role="group" data-label="controls">
    <button type="button" class="b-play primary"><span class="ico" aria-hidden="true">▶</span> <span class="lbl"></span></button>
    <button type="button" class="b-back"><span class="ico" aria-hidden="true">↺</span> <span data-t="back"></span></button>
    <button type="button" class="b-fwd"><span class="ico" aria-hidden="true">↻</span> <span data-t="forward"></span></button>
    <button type="button" class="b-speed"></button>
    <button type="button" class="b-cc" aria-pressed="true"><span class="ico" aria-hidden="true">CC</span> <span data-t="captions"></span></button>
    <button type="button" class="b-ccset" aria-haspopup="dialog"><span data-t="captionSettings"></span></button>
    <button type="button" class="b-tr" aria-expanded="false"><span data-t="transcript"></span></button>
    <button type="button" class="b-ad" aria-pressed="false"><span class="ico" aria-hidden="true">AD</span> <span data-t="ad"></span></button>
    <button type="button" class="b-sign"><span data-t="sign"></span></button>
    <button type="button" class="b-fs"></button>
    <button type="button" class="b-help" aria-haspopup="dialog"><span data-t="help"></span></button>
  </div>
  <div class="signtools" role="group" data-label="signTools" hidden>
    <button type="button" data-pos="tl"></button><button type="button" data-pos="tr"></button>
    <button type="button" data-pos="bl"></button><button type="button" data-pos="br"></button>
    <button type="button" class="b-larger" data-t="larger"></button><button type="button" class="b-smaller" data-t="smaller"></button>
  </div>
  <div class="panel nosign" hidden>
    <p data-t="noSign"></p>
    <button type="button" class="b-req" data-t="requestSign"></button>
  </div>
  <div class="offline">
    <button type="button" class="b-off"></button>
    <p class="offmsg" hidden></p>
    <a class="offlink" hidden data-t="offlineOpen"></a>
  </div>
  <section class="panel tr" hidden>
    <h3 class="trh" data-t="transcript"></h3>
    <p class="hint" data-t="transcriptHint"></p>
    <button type="button" class="b-dl" data-t="download"></button>
    <ol class="lines"></ol>
  </section>
  <div class="sr" role="status" aria-live="polite"></div>
  <dialog class="d-set">
    <form method="dialog">
      <h3 class="dsh" data-t="captionSettings"></h3>
      <label for="f-lang" data-t="captionLanguage"></label><select id="f-lang" name="capLang"></select>
      <label for="f-size" data-t="size"></label>
      <select id="f-size" name="size"><option value="s" data-t="sizeS"></option><option value="m" data-t="sizeM"></option><option value="l" data-t="sizeL"></option><option value="xl" data-t="sizeXL"></option></select>
      <label for="f-color" data-t="color"></label>
      <select id="f-color" name="color"><option value="white" data-t="colorWhite"></option><option value="yellow" data-t="colorYellow"></option><option value="black" data-t="colorBlack"></option></select>
      <label for="f-bg" data-t="background"></label>
      <select id="f-bg" name="bg"><option value="solid" data-t="bgSolid"></option><option value="soft" data-t="bgSoft"></option></select>
      <label for="f-pos" data-t="position"></label>
      <select id="f-pos" name="pos"><option value="bottom" data-t="posBottom"></option><option value="top" data-t="posTop"></option><option value="below" data-t="posBelow"></option></select>
      <div class="preview" aria-hidden="true"><span>Aa · አማርኛ</span></div>
      <div class="actions"><button value="close" class="primary" data-t="close"></button></div>
    </form>
  </dialog>
  <dialog class="d-help">
    <h3 class="dhh" data-t="helpTitle"></h3>
    <dl>
      <dt data-t="keyPlayName"></dt><dd data-t="keyPlay"></dd>
      <dt data-t="keyArrowsName"></dt><dd data-t="keyArrows"></dd>
      <dt data-t="keyTabName"></dt><dd data-t="keyTab"></dd>
      <dt data-t="keyEnterName"></dt><dd data-t="keyEnter"></dd>
      <dt data-t="keyEscName"></dt><dd data-t="keyEsc"></dd>
    </dl>
    <form method="dialog" class="actions"><button value="close" class="primary" data-t="close"></button></form>
  </dialog>
</div>`;

  let uid = 0;

  class DbPlayer extends HTMLElement {
    static get observedAttributes() { return ['lang']; }

    constructor() {
      super();
      this.prefs = Object.assign({ captions: true, capLang: '', size: 'm', color: 'white', bg: 'solid', pos: 'bottom',
        rate: 1, ad: false, signOn: true, signPos: 'br', signSize: 'm' }, readPrefs());
      this.t = {};
      this.cues = [];
      this.lastProgress = -1;
      this.adBusy = false;
      this.adLast = null;
    }

    get uiLang() { return this.getAttribute('lang') === 'en' ? 'en' : 'am'; }
    $(s) { return this.shadowRoot.querySelector(s); }
    $$(s) { return [...this.shadowRoot.querySelectorAll(s)]; }
    emit(name, detail = {}) { this.dispatchEvent(new CustomEvent(`db-player:${name}`, { bubbles: true, composed: true, detail })); }
    say(msg) { const sr = this.$('.sr'); sr.textContent = ''; setTimeout(() => { sr.textContent = msg; }, 50); }

    async connectedCallback() {
      if (this.shadowRoot) return;
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>${CSS}</style>${HTML}`;
      const id = `dbp${++uid}`;
      // unique ids for aria wiring inside this shadow root
      this.$('.tr').id = `${id}-tr`; this.$('.trh').id = `${id}-trh`; this.$('.tr').setAttribute('aria-labelledby', `${id}-trh`);
      this.$('.hint').id = `${id}-hint`; this.$('.lines').setAttribute('aria-describedby', `${id}-hint`);
      this.$('.b-tr').setAttribute('aria-controls', `${id}-tr`);
      this.$('.dsh').id = `${id}-dsh`; this.$('.d-set').setAttribute('aria-labelledby', `${id}-dsh`);
      this.$('.dhh').id = `${id}-dhh`; this.$('.d-help').setAttribute('aria-labelledby', `${id}-dhh`);
      this.$('.nosign').id = `${id}-ns`;
      await this.loadText();
      this.setupMedia();
      this.bind();
      this.applyPrefs(false);
      this.measureOffline();
    }

    async attributeChangedCallback(name, oldV, newV) {
      if (name === 'lang' && this.shadowRoot && oldV !== newV) { await this.loadText(); this.setupAD(); }
    }

    async loadText() {
      try { this.t = await loadStrings(this.uiLang); } catch (e) { this.t = await loadStrings('en').catch(() => ({})); }
      const t = this.t, wrap = this.$('.wrap');
      wrap.setAttribute('lang', this.uiLang);
      wrap.setAttribute('dir', t.dir || 'ltr');
      this.$$('[data-t]').forEach((el) => { el.textContent = t[el.dataset.t] ?? ''; });
      this.$$('[data-label]').forEach((el) => el.setAttribute('aria-label', t[el.dataset.label] ?? ''));
      this.$$('.signtools [data-pos]').forEach((b) => { b.textContent = fill(t.moveTo, { pos: t[b.dataset.pos] }); });
      this.$('.b-req').setAttribute('lang', this.uiLang);
      this.fillLangSelect();
      this.refreshLabels();
    }

    refreshLabels() {
      const t = this.t, v = this.$('video.main');
      const playing = v && !v.paused && !v.ended;
      this.$('.b-play .lbl').textContent = playing ? t.pause : t.play;
      this.$('.b-play .ico').textContent = playing ? '❚❚' : '▶';
      this.$('.b-speed').textContent = fill(t.speed, { rate: this.prefs.rate });
      this.$('.b-fs').textContent = document.fullscreenElement === this ? t.exitFullscreen : t.fullscreen;
      this.$('.b-fs').hidden = !document.fullscreenEnabled;
      this.updateTime();
      this.updateOfflineLabel();
    }

    fillLangSelect() {
      const sel = this.$('#f-lang');
      if (!sel) return;
      sel.innerHTML = '';
      for (const url of list(this.getAttribute('captions'))) {
        const l = langOf(url), o = document.createElement('option');
        o.value = l; o.textContent = this.t[LANG_KEYS[l]] || l; o.lang = l;
        sel.append(o);
      }
    }

    // ---------- media ----------
    setupMedia() {
      const v = this.$('video.main');
      const src = this.getAttribute('src');
      const abs = (u) => new URL(u, document.baseURI).href;
      if (src && new URL(abs(src)).origin !== location.origin) v.crossOrigin = 'anonymous';
      if (this.getAttribute('poster')) v.poster = this.getAttribute('poster');
      v.src = src || '';
      this.capFiles = list(this.getAttribute('captions'));
      this.adFiles = list(this.getAttribute('describe'));
      const langs = this.capFiles.map(langOf);
      if (!this.prefs.capLang || !langs.includes(this.prefs.capLang)) this.prefs.capLang = langs.includes(this.uiLang) ? this.uiLang : (langs[0] || '');
      for (const [kind, files] of [['captions', this.capFiles], ['descriptions', this.adFiles]]) {
        for (const f of files) {
          const tr = document.createElement('track');
          tr.kind = kind; tr.src = f; tr.srclang = langOf(f); tr.label = `${kind}-${langOf(f)}`;
          v.append(tr);
          tr.track.mode = 'hidden'; // we draw cues ourselves so learners can restyle them
          tr.track.addEventListener('cuechange', () => (kind === 'captions' ? this.drawCaption() : this.onAD(tr.track)));
        }
      }
      const sign = this.getAttribute('sign');
      this.hasSign = !!sign;
      if (this.hasSign) { const sv = this.$('.signv'); sv.src = sign; }
      this.loadTranscript();
    }

    captionTrack() {
      return [...this.$('video.main').textTracks].find((tt) => tt.kind === 'captions' && tt.language === this.prefs.capLang);
    }

    drawCaption() {
      const tt = this.captionTrack();
      const text = tt && tt.activeCues ? [...tt.activeCues].map((c) => c.text.replace(/<[^>]+>/g, '')).join('\n') : '';
      const below = this.prefs.pos === 'below';
      const over = this.$('.cap'), under = this.$('.capbelow');
      const target = below ? under : over;
      (below ? over : under).hidden = true;
      target.innerHTML = '';
      if (text && this.prefs.captions) {
        const span = document.createElement('span');
        span.textContent = text; span.lang = this.prefs.capLang;
        target.append(span);
      }
      target.hidden = below ? !this.prefs.captions : !(text && this.prefs.captions);
    }

    async loadTranscript() {
      const file = this.capFiles.find((f) => langOf(f) === this.prefs.capLang) || this.capFiles[0];
      const ol = this.$('.lines');
      ol.innerHTML = '';
      this.cues = [];
      if (!file) return;
      try {
        const res = await fetch(new URL(file, document.baseURI));
        this.cues = parseVTT(await res.text());
      } catch { return; }
      this.cues.forEach((c, i) => {
        const li = document.createElement('li'), b = document.createElement('button');
        b.type = 'button'; b.dataset.i = i; b.lang = this.prefs.capLang;
        const ts = document.createElement('span'); ts.className = 't'; ts.textContent = fmt(c.start); ts.lang = 'en';
        const tx = document.createElement('span'); tx.textContent = c.text;
        b.append(ts, tx); li.append(b); ol.append(li);
      });
    }

    highlightTranscript(t) {
      const i = cueIndexAt(this.cues, t);
      if (i === this.curLine) return;
      this.curLine = i;
      this.$$('.lines button').forEach((b) => b.removeAttribute('aria-current'));
      const b = this.$(`.lines button[data-i="${i}"]`);
      if (!b) return;
      b.setAttribute('aria-current', 'true');
      const ol = this.$('.lines');
      if (!this.$('.tr').hidden && this.shadowRoot.activeElement?.closest?.('.lines') == null) {
        ol.scrollTop = b.offsetTop - ol.offsetTop - ol.clientHeight / 3;
      }
    }

    downloadTranscript() {
      const text = this.cues.map((c) => `[${fmt(c.start)}] ${c.text}`).join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
      a.download = `transcript.${this.prefs.capLang || 'txt'}.txt`;
      this.shadowRoot.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }

    updateTime() {
      const v = this.$('video.main');
      if (!v) return;
      const cur = fmt(v.currentTime), tot = fmt(v.duration);
      this.$('.time').textContent = `${cur} / ${tot}`;
      const seek = this.$('.seek');
      if (this.shadowRoot.activeElement !== seek && v.duration) seek.value = Math.round((v.currentTime / v.duration) * 1000);
      seek.setAttribute('aria-valuetext', fill(this.t.time, { current: cur, total: tot }));
    }

    // ---------- audio description ----------
    setupAD() { this.adVoices = null; }
    voiceFor(lang) {
      if (!('speechSynthesis' in window)) return null;
      const want = VOICE_LANG[lang] || lang;
      return speechSynthesis.getVoices().find((vo) => vo.lang.replace('_', '-').toLowerCase().startsWith(want.slice(0, 2).toLowerCase())) || null;
    }
    onAD(track) {
      if (!this.prefs.ad || this.adBusy || track.language !== this.uiLang || !track.activeCues || !track.activeCues.length) return;
      const cue = track.activeCues[0];
      const key = `${cue.startTime}`;
      if (this.adLast === key) return;
      this.adLast = key;
      this.readDescription(cue.text);
    }
    readDescription(text) {
      const v = this.$('video.main');
      const resume = !v.paused;
      this.adBusy = true;
      v.pause();
      const box = this.$('.adtext');
      box.textContent = text; box.lang = this.uiLang; box.hidden = false;
      const done = () => { if (!this.adBusy) return; this.adBusy = false; if (resume) v.play().catch(() => {}); };
      const words = text.split(/\s+/).length;
      const voice = this.voiceFor(this.uiLang);
      if (voice) {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = VOICE_LANG[this.uiLang]; u.voice = voice;
        u.onend = done; u.onerror = done;
        speechSynthesis.cancel(); speechSynthesis.speak(u);
        setTimeout(done, Math.max(5000, words * 900)); // safety net if onend never fires
      } else {
        this.say(text); // screen reader users hear it through the live region
        setTimeout(done, Math.max(3000, words * 600));
      }
    }

    // ---------- prefs ----------
    applyPrefs(announce = true) {
      const p = this.prefs, host = this.$('.wrap');
      const [fg, bg] = COLORS[p.color] || COLORS.white;
      host.style.setProperty('--cap-size', SIZES[p.size] || SIZES.m);
      host.style.setProperty('--cap-fg', fg);
      host.style.setProperty('--cap-bg', bg);
      host.style.setProperty('--cap-op', p.bg === 'soft' ? '.6' : '1');
      this.$('.cap').classList.toggle('top', p.pos === 'top');
      this.$('.b-cc').setAttribute('aria-pressed', String(!!p.captions));
      this.$('.b-ad').setAttribute('aria-pressed', String(!!p.ad));
      this.$('video.main').playbackRate = p.rate;
      for (const [k, sel] of [['capLang', '#f-lang'], ['size', '#f-size'], ['color', '#f-color'], ['bg', '#f-bg'], ['pos', '#f-pos']]) this.$(sel).value = p[k];
      // sign window
      const sign = this.$('.sign');
      sign.className = `sign ${p.signPos}`;
      sign.style.setProperty('--sign-w', SIGN_SIZES[p.signSize] || SIGN_SIZES.m);
      const bs = this.$('.b-sign');
      if (this.hasSign) {
        bs.setAttribute('aria-pressed', String(!!p.signOn));
        sign.hidden = !p.signOn;
        this.$('.signtools').hidden = !p.signOn;
        this.$$('.signtools [data-pos]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pos === p.signPos)));
      } else {
        bs.setAttribute('aria-expanded', String(!this.$('.nosign').hidden));
        bs.setAttribute('aria-controls', this.$('.nosign').id);
      }
      this.drawCaption();
      this.refreshLabels();
      writePrefs(p);
      if (announce) this.emit('prefs', { captionSize: p.size, captionColor: p.color, captionBackground: p.bg, captionPosition: p.pos,
        captionLanguage: p.capLang, signPosition: p.signPos, signSize: p.signSize });
    }

    // ---------- offline pack ----------
    offlineUrls() {
      const abs = (u) => new URL(u, document.baseURI).href;
      const src = this.getAttribute('src') || '';
      const audio = this.getAttribute('offline-audio') || src.replace(/\.mp4(\?.*)?$/i, '-low.mp3');
      return {
        audio: abs(audio),
        vtts: this.capFiles.map(abs),
        files: [abs(audio), ...this.capFiles.map(abs), new URL('offline.html', BASE).href,
          new URL('i18n/am.json', BASE).href, new URL('i18n/en.json', BASE).href],
      };
    }
    async measureOffline() {
      try {
        const sizes = await Promise.all(this.offlineUrls().files.map((u) => fetch(u, { method: 'HEAD' }).then((r) => Number(r.headers.get('content-length')) || 0)));
        const bytes = sizes.reduce((a, b) => a + b, 0);
        this.offlineMB = bytes ? (bytes / 1048576).toFixed(1) : null;
      } catch { this.offlineMB = null; }
      this.updateOfflineLabel();
    }
    updateOfflineLabel() {
      const b = this.$('.b-off');
      if (b) b.textContent = this.offlineMB ? fill(this.t.offline, { size: this.offlineMB }) : (this.t.offlineUnknown || '');
    }
    async saveOffline() {
      const msg = this.$('.offmsg'), link = this.$('.offlink');
      const show = (text) => { msg.textContent = text; msg.hidden = false; this.say(text); };
      if (!window.isSecureContext || !('serviceWorker' in navigator) || !('caches' in window)) return show(this.t.offlineNeedsHttps);
      show(this.t.offlineSaving);
      try {
        await navigator.serviceWorker.register(new URL('sw.js', BASE).href, { scope: BASE });
        const { files, audio, vtts } = this.offlineUrls();
        const cache = await caches.open(CACHE);
        await cache.addAll(files);
        const q = new URLSearchParams({ audio, vtt: vtts.join(','), lang: this.uiLang, title: this.getAttribute('lesson-title') || document.title, back: location.href });
        link.href = `${new URL('offline.html', BASE).href}?${q}`;
        link.hidden = false;
        show(this.t.offlineDone);
        this.emit('offline', { bytes: this.offlineMB });
      } catch (e) { show(this.t.offlineFailed); }
    }

    // ---------- events ----------
    bind() {
      const v = this.$('video.main');
      const toggle = () => (v.paused || v.ended ? v.play().catch(() => {}) : v.pause());
      const seekBy = (d) => { v.currentTime = Math.min(Math.max(0, v.currentTime + d), v.duration || 0); };
      this.$('.b-play').addEventListener('click', toggle);
      this.$('.b-back').addEventListener('click', () => seekBy(-10));
      this.$('.b-fwd').addEventListener('click', () => seekBy(10));
      this.$('.b-speed').addEventListener('click', () => {
        this.prefs.rate = SPEEDS[(SPEEDS.indexOf(this.prefs.rate) + 1) % SPEEDS.length];
        this.applyPrefs(); this.say(fill(this.t.speedChanged, { rate: this.prefs.rate }));
      });
      this.$('.b-cc').addEventListener('click', () => {
        this.prefs.captions = !this.prefs.captions; this.applyPrefs();
        this.say(this.prefs.captions ? this.t.captionsOn : this.t.captionsOff);
      });
      this.$('.b-ad').addEventListener('click', () => {
        this.prefs.ad = !this.prefs.ad; this.adLast = null; this.applyPrefs();
        let m = this.prefs.ad ? this.t.adOn : this.t.adOff;
        if (this.prefs.ad && !this.voiceFor(this.uiLang)) m += ` ${this.t.adNoVoice}`;
        if (!this.prefs.ad) { this.$('.adtext').hidden = true; if ('speechSynthesis' in window) speechSynthesis.cancel(); }
        this.say(m);
      });
      this.$('.b-tr').addEventListener('click', (e) => {
        const tr = this.$('.tr'); tr.hidden = !tr.hidden;
        e.currentTarget.setAttribute('aria-expanded', String(!tr.hidden));
        if (!tr.hidden) this.$('.trh').setAttribute('tabindex', '-1'), this.$('.trh').focus();
      });
      this.$('.lines').addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        v.currentTime = this.cues[+b.dataset.i].start + 0.01;
        this.highlightTranscript(v.currentTime);
      });
      this.$('.b-dl').addEventListener('click', () => this.downloadTranscript());
      this.$('.b-sign').addEventListener('click', () => {
        if (this.hasSign) {
          this.prefs.signOn = !this.prefs.signOn; this.applyPrefs();
          this.say(this.prefs.signOn ? this.t.signOn : this.t.signOff);
        } else {
          const ns = this.$('.nosign'); ns.hidden = !ns.hidden; this.applyPrefs(false);
          if (!ns.hidden) this.say(this.t.noSign);
        }
      });
      this.$('.b-req').addEventListener('click', () => {
        this.emit('sign-request', { lesson: this.getAttribute('src'), language: this.uiLang });
        this.say(this.t.signRequested);
        const p = this.$('.nosign p'); p.textContent = `${this.t.noSign} ${this.t.signRequested}`;
      });
      this.$('.signtools').addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        const order = ['s', 'm', 'l'];
        if (b.dataset.pos) { this.prefs.signPos = b.dataset.pos; this.say(fill(this.t.signMoved, { pos: this.t[b.dataset.pos] })); }
        else {
          const i = order.indexOf(this.prefs.signSize) + (b.classList.contains('b-larger') ? 1 : -1);
          this.prefs.signSize = order[Math.min(2, Math.max(0, i))];
          this.say(fill(this.t.signSized, { size: this.t[{ s: 'sizeS', m: 'sizeM', l: 'sizeL' }[this.prefs.signSize]] }));
        }
        this.applyPrefs();
      });
      // dialogs: real <dialog>, focus returns to the opener
      const openDialog = (d, opener) => { d.showModal(); d.addEventListener('close', () => opener.focus(), { once: true }); };
      this.$('.b-ccset').addEventListener('click', (e) => openDialog(this.$('.d-set'), e.currentTarget));
      this.$('.b-help').addEventListener('click', (e) => openDialog(this.$('.d-help'), e.currentTarget));
      this.$('.d-set form').addEventListener('change', (e) => {
        const f = e.target; this.prefs[f.name] = f.value;
        if (f.name === 'capLang') this.loadTranscript();
        this.applyPrefs();
        const opt = (id) => this.$(id).selectedOptions[0]?.textContent || '';
        this.say(fill(this.t.settingsSaved, { size: opt('#f-size'), color: opt('#f-color'), position: opt('#f-pos') }));
      });
      this.$('.b-fs').addEventListener('click', () => (document.fullscreenElement === this ? document.exitFullscreen() : this.requestFullscreen().catch(() => {})));
      document.addEventListener('fullscreenchange', () => { this.refreshLabels(); if (document.fullscreenElement === this) this.$('.b-fs').focus(); });
      this.$('.b-off').addEventListener('click', () => this.saveOffline());
      this.$('.seek').addEventListener('input', (e) => { if (v.duration) v.currentTime = (e.target.value / 1000) * v.duration; this.updateTime(); });

      // keyboard: active only while focus is inside this player (WCAG 2.1.4)
      this.$('.wrap').addEventListener('keydown', (e) => {
        if (e.target.closest('dialog,select,input') || e.altKey || e.ctrlKey || e.metaKey) return;
        const onVideo = e.target === v;
        if (e.key === 'k' || e.key === 'K' || (onVideo && e.key === ' ')) { e.preventDefault(); toggle(); }
        else if (onVideo && e.key === 'ArrowLeft') { e.preventDefault(); seekBy(-5); }
        else if (onVideo && e.key === 'ArrowRight') { e.preventDefault(); seekBy(5); }
      });

      // media state
      v.addEventListener('play', () => { this.refreshLabels(); this.$('.adtext').hidden = true; if (this.hasSign && this.prefs.signOn) this.syncSign(true); });
      v.addEventListener('pause', () => { this.refreshLabels(); this.$('.signv').pause(); });
      v.addEventListener('seeked', () => { this.syncSign(false); this.adLast = null; this.highlightTranscript(v.currentTime); });
      v.addEventListener('ratechange', () => { this.$('.signv').playbackRate = v.playbackRate; });
      v.addEventListener('loadedmetadata', () => this.updateTime());
      v.addEventListener('timeupdate', () => {
        this.updateTime(); this.highlightTranscript(v.currentTime);
        const s = Math.floor(v.currentTime);
        if (s % 5 === 0 && s !== this.lastProgress) {
          this.lastProgress = s;
          this.emit('progress', { seconds: s, percent: v.duration ? Math.round((v.currentTime / v.duration) * 100) : 0 });
        }
      });
      v.addEventListener('ended', () => { this.refreshLabels(); this.say(this.t.complete); this.emit('complete', {}); });
      v.addEventListener('error', () => { const er = this.$('.err'); er.textContent = this.t.error; er.hidden = false; });
      if ('speechSynthesis' in window) speechSynthesis.addEventListener?.('voiceschanged', () => {});
      this.driftTimer = setInterval(() => this.syncSign(false), 1000);
    }

    syncSign(play) {
      if (!this.hasSign) return;
      const v = this.$('video.main'), sv = this.$('.signv');
      if (Math.abs(sv.currentTime - v.currentTime) > 0.3) sv.currentTime = v.currentTime;
      sv.playbackRate = v.playbackRate;
      if (play && sv.paused) sv.play().catch(() => {});
    }

    disconnectedCallback() { clearInterval(this.driftTimer); }
  }

  DbPlayer.parseVTT = parseVTT;
  DbPlayer.cueIndexAt = cueIndexAt;
  DbPlayer.fmt = fmt;
  DbPlayer.langOf = langOf;
  customElements.define('db-player', DbPlayer);
})();
