"""Gera só os GIFs cujo nome está na lista (1 por linha em stdin ou argumentos): python3 gerar_lista.py OUT < nomes.txt"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))  # catalogo.py
import gerar_v2 as G
from catalogo import E
from PIL import Image
out = sys.argv[1]; nomes = [l.strip() for l in sys.stdin if l.strip()]
for e in E:
    if e["nome"] not in nomes: continue
    sc_def = G.SCENES[e["nome"]]
    frames = [G.frame(e["nome"], e, sc_def, i / G.FRAMES) for i in range(G.FRAMES)]
    pal = [f.quantize(colors=160, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE) for f in frames]
    path = os.path.join(out, G.slug(e["nome"]) + ".gif")
    pal[0].save(path, save_all=True, append_images=pal[1:], duration=G.DUR, loop=0, optimize=True, disposal=1)
    print(f"ok {e['nome']:45s} {os.path.getsize(path)//1024:4d} KB")
