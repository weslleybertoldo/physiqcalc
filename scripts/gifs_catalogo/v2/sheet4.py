"""Folha de revisão: 4 frames (0,4,8,12) por GIF a 400x267, 3 GIFs por folha.
   python3 sheet4.py PASTA_GIFS SAIDA_PREFIXO [filtro-substring ...]"""
import glob, sys, os
from PIL import Image
pasta, pref = sys.argv[1], sys.argv[2]
filtros = [f.lower() for f in sys.argv[3:]]
gifs = sorted(g for g in glob.glob(pasta + "/*.gif") if not filtros or any(f in os.path.basename(g).lower() for f in filtros))
for s in range(0, len(gifs), 3):
    lote = gifs[s:s+3]
    sheet = Image.new("RGB", (1600, 267 * len(lote)), (13, 13, 13))
    for r, g in enumerate(lote):
        im = Image.open(g)
        for c, i in enumerate((0, 4, 8, 12)):
            im.seek(min(i, im.n_frames - 1)); sheet.paste(im.convert("RGB").resize((400, 267)), (c * 400, r * 267))
    out = f"{pref}-{s//3+1:02d}.png"; sheet.save(out); print(out, [os.path.basename(g) for g in lote])
