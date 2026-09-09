"""Filmstrip dos 24 frames (6x4, 300x200 cada): python3 strip24.py GIF SAIDA.png"""
import sys
from PIL import Image
im = Image.open(sys.argv[1]); n = im.n_frames
sheet = Image.new("RGB", (1800, 800), (13, 13, 13))
for i in range(min(n, 24)):
    im.seek(i); sheet.paste(im.convert("RGB").resize((300, 200)), ((i % 6) * 300, (i // 6) * 200))
sheet.save(sys.argv[2]); print(sys.argv[2], n, "frames")
