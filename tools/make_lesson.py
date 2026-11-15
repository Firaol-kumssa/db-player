#!/usr/bin/env python3
"""Generate the test lesson clip with no recording.

Slides are drawn from tools/lesson.json, narrated in Amharic by a TTS engine,
and joined with ffmpeg. Captions are written from the same script with the exact
timings of the audio, so they are correct by construction (no burned-in text).

Usage:
  python3 tools/make_lesson.py                # auto: edge-tts, then Addis AI, then silent
  python3 tools/make_lesson.py --tts edge     # free Microsoft voice am-ET-MekdesNeural (pip install edge-tts)
  python3 tools/make_lesson.py --tts addis    # Addis AI (needs ADDIS_AI_API_KEY + ADDIS_TTS_URL in .env)
  python3 tools/make_lesson.py --tts none     # silent narration, slides + captions only

Needs: python3, Pillow, ffmpeg/ffprobe, and a font with Ethiopic script
(Noto Sans Ethiopic, Kefa on macOS, Abyssinica SIL or FreeSerif).
"""
import argparse, base64, json, os, shutil, subprocess, sys, tempfile, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LESSON = json.loads((ROOT / "tools" / "lesson.json").read_text(encoding="utf-8"))
OUT = ROOT / "media"
W, H = 854, 480

ETHIOPIC_FONTS = [
    "/usr/share/fonts/truetype/noto/NotoSansEthiopic-Bold.ttf",
    "/usr/share/fonts/truetype/noto/NotoSansEthiopic-Regular.ttf",
    "/Library/Fonts/NotoSansEthiopic-Bold.ttf",
    str(Path.home() / "Library/Fonts/NotoSansEthiopic-Bold.ttf"),
    "/System/Library/Fonts/Supplemental/Kefa.ttc",
    "/System/Library/Fonts/Supplemental/KefaIII.ttf",
    "/System/Library/Fonts/Kefa.ttc",
    "/usr/share/fonts/truetype/abyssinica/AbyssinicaSIL-Regular.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSerif.ttf",
]
LATIN_FONTS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
]


def load_env():
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"'))


def first(paths):
    for p in paths:
        if Path(p).exists():
            return p
    return None


def run(cmd):
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "default=nw=1:nk=1", str(path)], capture_output=True, text=True)
    return float(out.stdout.strip())


# ---------- TTS engines ----------
def tts_edge(text, out_mp3):
    exe = shutil.which("edge-tts")
    if not exe:
        raise RuntimeError("edge-tts not installed (pip3 install edge-tts)")
    run([exe, "--voice", os.environ.get("EDGE_VOICE", "am-ET-MekdesNeural"),
         "--text", text, "--write-media", str(out_mp3)])


def tts_addis(text, out_mp3):
    key, url = os.environ.get("ADDIS_AI_API_KEY"), os.environ.get("ADDIS_TTS_URL")
    if not key or not url:
        raise RuntimeError("set ADDIS_AI_API_KEY and ADDIS_TTS_URL in .env (see docs.addisassistant.com)")
    body = json.dumps({"text": text, "language": "am"}).encode()
    req = urllib.request.Request(url, data=body, method="POST",
                                 headers={"Content-Type": "application/json", "x-api-key": key})
    with urllib.request.urlopen(req, timeout=60) as r:
        ctype, data = r.headers.get("Content-Type", ""), r.read()
    if ctype.startswith("audio/") or ctype == "application/octet-stream":
        out_mp3.write_bytes(data)
        return
    js = json.loads(data)
    audio = js.get("audio") or js.get("audio_base64") or (js.get("data") or {}).get("audio")
    if not audio:
        raise RuntimeError(f"Unexpected Addis AI response keys: {list(js)}")
    out_mp3.write_bytes(base64.b64decode(audio))


def pick_engine(choice):
    if choice != "auto":
        return choice
    if shutil.which("edge-tts"):
        return "edge"
    if os.environ.get("ADDIS_AI_API_KEY") and os.environ.get("ADDIS_TTS_URL"):
        return "addis"
    return "none"


# ---------- slides ----------
def draw_slide(path, n, total, title_am, title_en, intro=False):
    from PIL import Image, ImageDraw, ImageFont
    eth, lat = first(ETHIOPIC_FONTS), first(LATIN_FONTS) or first(ETHIOPIC_FONTS)
    if not eth:
        sys.exit("No Ethiopic font found. Install Noto Sans Ethiopic.")
    img = Image.new("RGB", (W, H), (11, 37, 69))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 14, H], fill=(245, 163, 0))
    f_small = ImageFont.truetype(lat, 22)
    label = "ALX · Savanna" if intro else f"{n} / {total}"
    d.text((44, 36), label, font=f_small, fill=(200, 215, 235))

    def wrap(text, font, maxw):
        words, lines, cur = text.split(), [], ""
        for w in words:
            t = (cur + " " + w).strip()
            if d.textlength(t, font=font) <= maxw:
                cur = t
            else:
                lines.append(cur); cur = w
        lines.append(cur)
        return lines

    f_am, f_en = ImageFont.truetype(eth, 46), ImageFont.truetype(lat, 28)
    y = 120
    for line in wrap(title_am, f_am, W - 100):
        d.text((44, y), line, font=f_am, fill=(255, 255, 255)); y += 70  # ~1.5 line height for Ethiopic
    y += 10
    for line in wrap(title_en, f_en, W - 100):
        d.text((44, y), line, font=f_en, fill=(220, 230, 245)); y += 40
    img.save(path)


def vtt_time(t):
    h, rem = divmod(max(0.0, t), 3600)
    m, s = divmod(rem, 60)
    return f"{int(h):02d}:{int(m):02d}:{s:06.3f}"


def split_sentence(text):
    parts, cur = [], ""
    for ch in text:
        cur += ch
        if ch in "።.?!" and len(cur.strip()) > 1:
            parts.append(cur.strip()); cur = ""
    if cur.strip():
        parts.append(cur.strip())
    return parts


def cues_for(text, start, end):
    parts = split_sentence(text)
    total = sum(len(p) for p in parts) or 1
    out, t = [], start
    for p in parts:
        d = (end - start) * len(p) / total
        out.append((t, t + d, p)); t += d
    return out


def write_vtt(path, cues):
    lines = ["WEBVTT", ""]
    for i, (a, b, text) in enumerate(cues, 1):
        lines += [str(i), f"{vtt_time(a)} --> {vtt_time(b)}", text, ""]
    path.write_text("\n".join(lines), encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tts", choices=["auto", "edge", "addis", "none"], default="auto")
    args = ap.parse_args()
    load_env()
    engine = pick_engine(args.tts)
    print(f"TTS engine: {engine}")
    OUT.mkdir(exist_ok=True)
    tmp = Path(tempfile.mkdtemp())
    slides = LESSON["slides"]
    total = len(slides)

    segs = []  # (png, wav, seconds)
    intro, outro = LESSON["intro"], LESSON["outro"]

    def chime(path, secs, fade_out=True):
        run(["ffmpeg", "-y", "-f", "lavfi", "-i", f"sine=frequency=523:duration={secs}",
             "-f", "lavfi", "-i", f"sine=frequency=659:duration={secs}",
             "-filter_complex", f"amix=inputs=2,volume=0.12,afade=t=in:d=0.5,afade=t=out:st={secs-1}:d=1",
             "-ar", "44100", "-ac", "1", str(path)])

    png = tmp / "s0.png"; draw_slide(png, 0, total, slides[0]["title_am"], slides[0]["title_en"], intro=True)
    wav = tmp / "s0.wav"; chime(wav, intro["seconds"])
    segs.append((png, wav, float(intro["seconds"])))

    narr = []  # (start, end) of speech within each slide
    t = float(intro["seconds"])
    for i, s in enumerate(slides, 1):
        png = tmp / f"s{i}.png"; draw_slide(png, i, total, s["title_am"], s["title_en"])
        speech = 0.0
        raw = tmp / f"n{i}.mp3"
        if engine == "edge":
            tts_edge(s["am"], raw); speech = duration(raw)
        elif engine == "addis":
            tts_addis(s["am"], raw); speech = duration(raw)
        secs = round(max(speech + 1.2, 7.0), 2)
        wav = tmp / f"s{i}.wav"
        if speech:
            run(["ffmpeg", "-y", "-i", str(raw), "-af", f"adelay=400|400,apad=whole_dur={secs}",
                 "-ar", "44100", "-ac", "1", "-t", str(secs), str(wav)])
        else:
            run(["ffmpeg", "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", str(secs), str(wav)])
        a = t + 0.4
        b = (t + 0.4 + speech) if speech else (t + secs - 0.4)
        narr.append((t, a, b))
        segs.append((png, wav, secs)); t += secs

    png = tmp / "s99.png"; draw_slide(png, total, total, slides[-1]["title_am"], slides[-1]["title_en"])
    wav = tmp / "s99.wav"; chime(wav, outro["seconds"])
    segs.append((png, wav, float(outro["seconds"])))
    end_time = t + outro["seconds"]

    # video: concat images with durations; audio: concat wavs
    lst = tmp / "img.txt"
    lst.write_text("".join(f"file '{p}'\nduration {d}\n" for p, _, d in segs) + f"file '{segs[-1][0]}'\n")
    alst = tmp / "aud.txt"
    alst.write_text("".join(f"file '{w}'\n" for _, w, _ in segs))
    run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(alst), "-c", "pcm_s16le", str(tmp / "all.wav")])
    run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-i", str(tmp / "all.wav"),
         "-vf", "fps=12,format=yuv420p", "-c:v", "libx264", "-preset", "veryfast", "-crf", "30",
         "-c:a", "aac", "-b:a", "64k", "-t", f"{end_time:.2f}", "-movflags", "+faststart",
         str(OUT / "lesson.mp4")])
    run(["ffmpeg", "-y", "-i", str(tmp / "all.wav"), "-ac", "1", "-b:a", "48k", str(OUT / "lesson-low.mp3")])
    shutil.copy(segs[0][0], OUT / "poster.png")

    for lang in ("am", "en"):
        cues = [(0.2, intro["seconds"] - 0.2, intro[lang])]
        for (s0, a, b), s in zip(narr, slides):
            cues += cues_for(s[lang], a, b)
        cues.append((end_time - outro["seconds"] + 0.2, end_time - 0.2, outro[lang]))
        write_vtt(OUT / f"lesson.{lang}.vtt", cues)
        ad = [(0.0, 1.5, intro[f"ad_{lang}"])]
        for i, ((s0, a, b), s) in enumerate(zip(narr, slides), 1):
            if lang == "am":
                txt = f"ስላይድ {i} ከ{total}፦ በጥቁር ሰማያዊ ዳራ ላይ በነጭ ፊደል «{s['title_am']}» የሚል ርዕስ።"
            else:
                txt = f"Slide {i} of {total}: the heading “{s['title_en']}” in white on dark blue."
            ad.append((s0 + 0.05, s0 + 1.25, txt))
        write_vtt(OUT / f"lesson.ad.{lang}.vtt", ad)

    meta = {"id": LESSON["id"], "title_am": slides[0]["title_am"], "title_en": slides[0]["title_en"],
            "seconds": round(end_time, 2), "tts": engine}
    (OUT / "lesson.meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Done: {end_time:.1f}s, files in {OUT}")


if __name__ == "__main__":
    main()
