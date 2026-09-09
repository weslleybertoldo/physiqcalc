"""Grade 2x2 em tamanho real (600x400 por frame): python3 grid4.py GIF SAIDA.png f0 f1 f2 f3"""
import sys
from PIL import Image
im = Image.open(sys.argv[1]); fr = [int(x) for x in sys.argv[3:7]]
g = Image.new("RGB", (1200, 800), (13, 13, 13))
for n, i in enumerate(fr):
    im.seek(min(i, im.n_frames - 1)); g.paste(im.convert("RGB"), ((n % 2) * 600, (n // 2) * 400))
g.save(sys.argv[2])
