# Caminhos da fábrica 3D, todos relativos a scripts/exercicios3d/ (Blender e Python do .venv por variável de ambiente).
import os

LIB = os.path.dirname(os.path.abspath(__file__))
AQUI = os.path.dirname(LIB)                                   # scripts/exercicios3d
REPO = os.path.dirname(os.path.dirname(AQUI))
TEX = os.path.join(AQUI, "tex")                               # texturas geradas (fora do git)
SAIDA = os.path.join(REPO, "public", "exercicios3d")          # o que vai pro app
RELATORIOS = os.path.join(AQUI, "relatorios")                 # checagem e prints de cada exercício (versionado)
BLENDER = os.environ.get("BLENDER", os.path.expanduser("~/.local/blender/blender-5.2.2-linux-x64/blender"))
VENV_PY = os.environ.get("EX3D_PY", os.path.join(AQUI, ".venv", "bin", "python"))
