# Mapa dos músculos do app: ids estáveis e PNG que o visualizador lê (R = id, G = fibra).
# .venv/bin/python -m pytest -q test_ids.py
import glob, json, os

import numpy as np
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
SAIDA = os.path.join(AQUI, "..", "..", "public", "exercicios3d")
IDS = json.load(open(os.path.join(AQUI, "musculos_ids.json")))
USADOS_NOS_PILOTOS = ("quadriceps", "gluteo", "biceps", "antebraco", "adutores", "posterior", "lombar")


def _mapa():
    achados = glob.glob(os.path.join(SAIDA, "musculos-*.png"))
    assert len(achados) == 1, "tem que haver um mapa só (versão antiga sobrando?): %s" % achados
    return Image.open(achados[0])


def test_ids_unicos_e_no_canal_r():
    valores = list(IDS.values())
    assert len(valores) == len(set(valores))
    assert all(isinstance(v, int) and 1 <= v <= 255 for v in valores)


def test_musculos_dos_pilotos_existem():
    for nome in USADOS_NOS_PILOTOS:
        assert nome in IDS, nome


def test_png_2048_com_ids_conhecidos():
    img = _mapa()
    assert img.size == (2048, 2048) and img.mode == "RGB"
    r = np.asarray(img)[..., 0]
    presentes = set(np.unique(r).tolist())
    assert presentes <= {0} | set(IDS.values())
    for nome in USADOS_NOS_PILOTOS:
        assert IDS[nome] in presentes, nome
