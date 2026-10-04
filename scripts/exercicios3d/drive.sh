#!/usr/bin/env bash
# Guarda UM exercício pronto no Drive da bertoldo.code, pronto pra virar vídeo depois (pedido do Weslley 04/10/2026:
# "salvar todos os movimentos/exercícios no drive … para futuramente usarmos pra fazer os vídeos" — packs de vídeo
# à venda): a cena .blend com o movimento e as texturas embutidas, o GLB do app, a ficha e a foto.
#   ./drive.sh <uuid>          (remoto do rclone "gdrive:" = bertoldo.code; pasta "Physiq - Exercícios 3D")
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
UUID="${1:?uuid}"
FICHA="$AQUI/fichas/$UUID.json"
NOME="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["nome"])' "$FICHA")"
CENA="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["cena"])' "$FICHA")"
RAIZ="gdrive:Physiq - Exercícios 3D"
DEST="$RAIZ/exercicios/$NOME"
GLB="$(ls -1 "$AQUI/../../public/exercicios3d/$UUID"-*.glb | tail -1)"
FOTO="${GLB%.glb}.webp"

LEIA="$(mktemp)"
trap 'rm -f "$LEIA"' EXIT
cat > "$LEIA" <<'TXT'
Physiq — exercícios 3D (fonte pros vídeos)

Cada pasta em "exercicios/" tem:
- <cena>.blend: cena pronta pra render no Blender 5.2 (boneco com anatomia, músculo alvo em vermelho, auxiliares
  em vermelho claro, equipamento, luz e câmera). Quadros 0–24 = a ida do movimento (16 qps = 1,5 s); a volta é a
  mesma sequência ao contrário. Render configurado em 1920×1280, Cycles, 24 amostras (mudar à vontade).
- <uuid>-<versão>.glb: o movimento que o app usa (só esqueleto + equipamento).
- ficha.json: grupo, subgrupos, músculos, cinesiologia e referências do exercício.
- <uuid>-<versão>.webp: a foto parada do app.
Gerado pela fábrica do repo physiqcalc (scripts/exercicios3d).
TXT
rclone copyto "$LEIA" "$RAIZ/LEIA-ME.txt" 2>/dev/null
rclone copyto "$AQUI/build/exercicios/$CENA.blend" "$DEST/$CENA.blend" 2>/dev/null
rclone copyto "$GLB" "$DEST/$(basename "$GLB")" 2>/dev/null
rclone copyto "$FOTO" "$DEST/$(basename "$FOTO")" 2>/dev/null
rclone copyto "$FICHA" "$DEST/ficha.json" 2>/dev/null
rclone ls "$DEST" 2>/dev/null
