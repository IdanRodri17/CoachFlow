"""CoachFlow icon set: volt italic "CF" on ink, Barlow Condensed.

Usage (from the repo root; needs Pillow):
  python -I docs/release/icons/make_icons.py \
    node_modules/@expo-google-fonts/barlow-condensed/800ExtraBold_Italic/BarlowCondensed_800ExtraBold_Italic.ttf \
    <out_dir>
Candidate only: on approval, copy the PNGs into assets/ and wire app.json.

Writes icon.png (iOS, 1024, no alpha), android-icon-foreground.png,
android-icon-monochrome.png (1024, transparent, inside the adaptive safe
zone), splash-icon.png, notification-icon.png (96, white on transparent)
and preview.png (how each one looks once masked).
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

INK = (19, 20, 22)       # #131416
VOLT = (213, 242, 75)    # #D5F24B
WHITE = (255, 255, 255)
TEXT = "CF"


def glyph(size, height_frac, color, bg=None, mode="RGBA"):
    """Draw TEXT centred on a size×size canvas, its ink box height_frac tall."""
    img = Image.new(mode, (size, size), bg if bg else (0, 0, 0, 0))
    # Find the font size whose ink box is height_frac of the canvas.
    target = size * height_frac
    fs = int(target)
    for _ in range(4):
        f = ImageFont.truetype(FONT, fs)
        l, t, r, b = f.getbbox(TEXT)
        fs = int(fs * target / (b - t))
    f = ImageFont.truetype(FONT, fs)
    l, t, r, b = f.getbbox(TEXT)
    x = (size - (r - l)) / 2 - l
    y = (size - (b - t)) / 2 - t
    ImageDraw.Draw(img).text((x, y), TEXT, font=f, fill=color)
    return img


def rounded_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size - 1, size - 1), radius, fill=255)
    return m


def circle_mask(size):
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).ellipse((0, 0, size - 1, size - 1), fill=255)
    return m


FONT, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)

# iOS: full bleed, no transparency (App Store rejects alpha in the 1024 icon).
ios = glyph(1024, 0.50, VOLT, bg=INK, mode="RGB")
ios.save(os.path.join(OUT, "icon.png"))

# Android adaptive: 108dp canvas, 66dp safe circle → keep the ink box ~36%
# tall so the widest letters stay inside the circle on every launcher mask.
fg = glyph(1024, 0.36, VOLT)
fg.save(os.path.join(OUT, "android-icon-foreground.png"))
glyph(1024, 0.36, WHITE).save(os.path.join(OUT, "android-icon-monochrome.png"))

# Splash: the image sits centred on an ink background (app.json).
glyph(1024, 0.40, VOLT).save(os.path.join(OUT, "splash-icon.png"))

# Android notification small icon: white silhouette, transparent.
glyph(96, 0.55, WHITE).save(os.path.join(OUT, "notification-icon.png"))

# Preview sheet: iOS squircle-ish, Android circle mask, splash on a phone.
S = 360
sheet = Image.new("RGB", (S * 3 + 160, S + 260), (244, 244, 240))
d = ImageDraw.Draw(sheet)
ios_s = ios.resize((S, S), Image.LANCZOS)
sheet.paste(ios_s, (40, 40), rounded_mask(S, int(S * 0.225)))
and_bg = Image.new("RGB", (1024, 1024), INK)
and_bg.paste(fg, (0, 0), fg)
# Launchers show the middle 72/108 of the canvas, then mask it.
crop = int(1024 * (18 / 108))
and_vis = and_bg.crop((crop, crop, 1024 - crop, 1024 - crop)).resize((S, S), Image.LANCZOS)
sheet.paste(and_vis, (80 + S, 40), circle_mask(S))
phone = Image.new("RGB", (int(S * 0.5), S), INK)
sp = Image.open(os.path.join(OUT, "splash-icon.png")).resize((int(S * 0.4), int(S * 0.4)), Image.LANCZOS)
phone.paste(sp, ((phone.width - sp.width) // 2, (S - sp.height) // 2), sp)
sheet.paste(phone, (120 + 2 * S + (S - phone.width) // 2, 40))
small = ios.resize((120, 120), Image.LANCZOS)
sheet.paste(small, (40, S + 80), rounded_mask(120, 27))
small2 = and_vis.resize((120, 120), Image.LANCZOS)
sheet.paste(small2, (200, S + 80), circle_mask(120))
mono = Image.new("RGB", (120, 120), (60, 64, 58))
m = glyph(1024, 0.36, WHITE).crop((crop, crop, 1024 - crop, 1024 - crop)).resize((120, 120), Image.LANCZOS)
mono.paste(m, (0, 0), m)
sheet.paste(mono, (360, S + 80), circle_mask(120))
n = Image.open(os.path.join(OUT, "notification-icon.png"))
nb = Image.new("RGB", (96, 96), (60, 64, 58))
nb.paste(n, (0, 0), n)
sheet.paste(nb, (520, S + 92))
sheet.save(os.path.join(OUT, "preview.png"))
print("ok", OUT)
