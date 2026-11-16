#!/usr/bin/env python3
"""Insert <db-player> into the Savanna lesson page, under the banner image inside
#curriculum_navigation_content .savanna-styles. Safe to run twice."""
import re, sys
from pathlib import Path

page = Path(sys.argv[1])
html = page.read_text(encoding="utf-8")
if "<db-player" in html:
    print("Already mounted."); sys.exit(0)

TAG = '''
<!-- db-player (Track 2) -->
<script src="/module/db-player.js" defer></script>
<script src="/module/page-i18n.js" defer data-dict="/module/i18n/pages/concept-with-navigation.am.json"></script>
<db-player src="/media/lesson.mp4" poster="/media/poster.png"
  captions="/media/lesson.am.vtt,/media/lesson.en.vtt"
  describe="/media/lesson.ad.am.vtt,/media/lesson.ad.en.vtt"
  sign="" lesson-title="የቨርቹዋል ረዳት ሥራ የወደፊት ዕጣ" lang="am"></db-player>
<script>
  document.addEventListener('db-player:complete', () => console.log('Lesson video finished: the host can mark progress here.'));
  document.addEventListener('db-player:sign-request', (e) => console.log('Sign-language video requested', e.detail));
</script>
'''

start = html.find('id="curriculum_navigation_content"')
if start < 0:
    sys.exit("Could not find #curriculum_navigation_content")
styles = html.find("savanna-styles", start)
if styles < 0:
    sys.exit("Could not find .savanna-styles inside it")
open_end = html.find(">", styles) + 1            # end of the .savanna-styles opening tag
img = re.compile(r"<img\b[^>]*>", re.I).search(html, open_end)
pos = open_end
if img and img.start() - open_end < 3000:      # banner image near the top of the lesson body
    pos = img.end()
    closer = re.compile(r"\s*</(p|figure|picture|a)>", re.I).match(html, pos)
    if closer:
        pos = closer.end()
html = html[:pos] + TAG + html[pos:]
page.write_text(html, encoding="utf-8")
print(f"Mounted db-player in {page} at character {pos}")
