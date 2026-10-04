#!/usr/bin/env bash
# Comprime os GLB da fábrica pro app (gltf-transform 4): animação sem quadro repetido, geometria e animação com
# meshopt; texturas do boneco em KTX2 (cor ETC1S, relevo UASTC: ~4× menos memória de vídeo que PNG/WEBP
# decodificado). Sem o toktx (KTX-Software) as texturas vão em WEBP.
#   ./comprimir.sh boneco <v>              build/boneco/boneco-raw.glb      → public/exercicios3d/boneco-<v>.glb
#   ./comprimir.sh exercicio <uuid> <v>    build/exercicios/<uuid>-raw.glb  → public/exercicios3d/<uuid>-<v>.glb
# toktx: KTX_HOME (padrão ~/.local/ktx/KTX-Software-4.4.2-Linux-x86_64, release do GitHub KhronosGroup/KTX-Software).
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
SAIDA="$AQUI/../../public/exercicios3d"
GT=(npx -y @gltf-transform/cli@4)
KTX_HOME="${KTX_HOME:-$HOME/.local/ktx/KTX-Software-4.4.2-Linux-x86_64}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$SAIDA"

tipo="${1:?boneco|exercicio}"
case "$tipo" in
  boneco)
    v="${2:?versão}"; ent="$AQUI/build/boneco/boneco-raw.glb"; sai="$SAIDA/boneco-$v.glb" ;;
  exercicio)
    uuid="${2:?uuid}"; v="${3:?versão}"; ent="$AQUI/build/exercicios/$uuid-raw.glb"; sai="$SAIDA/$uuid-$v.glb" ;;
  *) echo "uso: $0 boneco <v> | exercicio <uuid> <v>" >&2; exit 2 ;;
esac

"${GT[@]}" resample "$ent" "$TMP/1.glb"
"${GT[@]}" prune "$TMP/1.glb" "$TMP/2.glb"
if [ "$tipo" = boneco ]; then
  if [ -x "$KTX_HOME/bin/toktx" ]; then
    export PATH="$KTX_HOME/bin:$PATH" LD_LIBRARY_PATH="$KTX_HOME/lib:${LD_LIBRARY_PATH:-}"
    "${GT[@]}" uastc "$TMP/2.glb" "$TMP/3.glb" --slots "normalTexture" --level 2 --rdo 1
    "${GT[@]}" etc1s "$TMP/3.glb" "$TMP/2.glb" --slots "baseColorTexture" --quality 255
  else
    echo "toktx não achado em $KTX_HOME — texturas em WEBP" >&2
    "${GT[@]}" webp "$TMP/2.glb" "$TMP/3.glb" && mv "$TMP/3.glb" "$TMP/2.glb"
  fi
fi
"${GT[@]}" meshopt "$TMP/2.glb" "$sai" --level medium
echo "OK $sai $(( $(stat -c %s "$sai") / 1024 )) KB (antes $(( $(stat -c %s "$ent") / 1024 )) KB)"
