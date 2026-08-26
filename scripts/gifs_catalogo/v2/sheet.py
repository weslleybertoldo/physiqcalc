"""Folha de contato (3 frames por GIF) de uma pasta: python3 sheet.py pasta saida.png [max]"""
import glob, sys
from PIL import Image
pasta, saida = sys.argv[1], sys.argv[2]
mx = int(sys.argv[3]) if len(sys.argv) > 3 else 12
gifs = sorted(glob.glob(pasta + "/*.gif"))[:mx]
sheet = Image.new("RGB", (900, 200 * len(gifs)), (13, 13, 13))
for r, g in enumerate(gifs):
    im = Image.open(g)
    for c, i in enumerate((0, 6, 12)):
        im.seek(min(i, im.n_frames - 1)); sheet.paste(im.convert("RGB").resize((300, 200)), (c * 300, r * 200))
sheet.save(saida); print("sheet", len(gifs), saida)
