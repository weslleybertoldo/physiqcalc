# Fábrica dos exercícios 3D (Physiq)

Gera o boneco 3D único do app e, por exercício, o movimento + equipamento + foto parada que o visualizador da
ficha toca (`src/lib/visualizador3d/`). Tudo roda no PC (WSL/Linux), por script, sem abrir a tela do Blender.

Desenho aprovado: `docs/superpowers/specs/2026-10-04-visualizador-3d-design.md`.

## Instalar (1 vez)

```bash
# Blender 5.2.2 portátil (conferir o sha256 antes de abrir)
mkdir -p ~/.local/blender && cd ~/.local/blender
curl -sSO https://download.blender.org/release/Blender5.2/blender-5.2.2-linux-x64.tar.xz
curl -s https://download.blender.org/release/Blender5.2/blender-5.2.2.sha256 | grep linux-x64 | sha256sum -c && tar -xf blender-5.2.2-linux-x64.tar.xz

# MPFB 2.0.17 (MakeHuman pro Blender; código GPL, assets CC0)
curl -sSL -o mpfb-2.0.17.zip "https://extensions.blender.org/download/sha256:4f0a879d64a39bf646fbf5f53601ac678855da329d650617dca5737548239a87/add-on-mpfb-v2.0.17.zip?repository=%2Fapi%2Fv1%2Fextensions%2F&blender_version_min=4.2.0"
./blender-5.2.2-linux-x64/blender -b --command extension install-file -r user_default -e mpfb-2.0.17.zip

# Assets CC0 do MakeHuman (cabelo, sobrancelhas…) na pasta de dados do usuário do MPFB
curl -sSLO https://files.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip
unzip -q makehuman_system_assets_cc0.zip -d ~/.config/blender/5.2/extensions/.user/user_default/mpfb/data/

# Python das texturas (fora do Blender)
cd <repo>/scripts/exercicios3d && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

Variáveis (opcionais): `BLENDER` (padrão `~/.local/blender/blender-5.2.2-linux-x64/blender`) e `EX3D_PY`
(padrão `scripts/exercicios3d/.venv/bin/python`). Caminhos em `lib/config.py`.

## Gerar as texturas da anatomia (1 vez, ou ao mexer em `lib/musculos_def.py`)

```bash
cd scripts/exercicios3d
$BLENDER -b -P exportar_malha.py -- tex/malha.npz     # malha de repouso do corpo atlético (~3 s)
.venv/bin/python lib/anatomia_tex.py base              # tex/anat_*.png + tex/anat_grupo.npy (~30 s)
$BLENDER -b -P ver_anatomia.py -- /tmp/anat 300 400 4  # prova: "ANATOMIA pronta" + frente/costas/lado
```

`tex/` é gerado e fica fora do git. As máscaras de músculo (`tex/alvo_*.png`) saem sozinhas quando uma cena pede.

## Peças

| Arquivo | O que faz |
|---|---|
| `lib/boneco3d.py` | boneco MakeHuman (MPFB) com o esqueleto do Mixamo, estúdio de luz, câmera, render |
| `lib/anatomia3d.py` | corpo atlético + músculos por textura + relevo (visual v4) + alvo/auxiliares em vermelho |
| `lib/anatomia_tex.py` + `lib/musculos_def.py` | desenha os músculos na textura do corpo (roda no `.venv`) |
| `lib/cabelo3d.py` | cabelo curto e sobrancelhas (assets CC0) em cinza |
| `lib/poses3d.py` | IK, giro de osso no mundo, dedos, utilidades de pose |
| `lib/pegada3d.py` | mão fechando em volta da barra com ângulos medidos de pegada real |
| `lib/polegar3d.py` | polegar dando a volta na barra (modo opcional `polegar_modo="volta"`, só exercícios novos): eixos anatômicos, pele por LBS, busca — testes em `test_polegar.py` |
| `lib/equip3d.py` | barra, anilhas, caixas e tubos dos equipamentos; polia (`polia()`: estação de cabo com torre, roldana e o cabo que gira e estica até o engate — marca `anima_escala`, a única peça com escala no GLB; acessório `barra_polia()` + `por_acessorio()`; `polia(gira=True)`: o garfo da roldana gira em volta do cabo que desce e fica virado pro cabo na diagonal, até ±90° — `PoliaGiratoria`; acessórios `corda_polia()` e `puxador_polia()`, o puxador D com pegador, aro e engate); `apoio_nordico()`: prancha da flexão nórdica (almofada dos joelhos numa chapa no chão e 2 rolos em cima dos calcanhares num poste entre as pernas — almofada e rolos são apoio, a estrutura não encosta); `cadeira_joelho()`: a 1ª MÁQUINA, cadeira extensora/flexora sentada montada em volta do corpo (eixo da alavanca nos 2 joelhos, assento e encosto a 100°, rolo na frente da canela — ou atrás, com a `almofada` das coxas (ou o `rolo_coxa`: um rolo por cima delas, logo acima dos joelhos, preso num braço que sai do alto da torre do eixo — o que a Cadeira Flexora usa), na flexora —, pegadores do lado do assento, torre do eixo e pilha em carenagem); `CadeiraJoelho.girar()` gira a alavanca e o rolo juntos em volta do eixo; assento, encosto, rolo e almofada são apoio; `cadeira_quadril()`: cadeira abdutora/adutora sentada (2 braços, cada um girando em volta da vertical do quadril do mesmo lado, com a almofada do joelho — por fora na abdutora, `almofada="dentro"` na adutora — e o apoio do pé); `CadeiraQuadril.girar()` abre ou fecha os 2 braços (`poste_alinhado=True`, na adutora: o poste de cada braço sai com as faces viradas pra coxa, que já é montada aberta); assento, encosto, almofadas e apoios dos pés são apoio. Medida da técnica `coxa_abertura` (`lib/tecnica3d.py`): o quanto cada coxa abre pro lado, vista de cima |
| `lib/checagem3d.py` | checagem de realismo em todos os quadros (mãos, pés, juntas, colisões, equipamento); `checagens.eixos` da ficha: o eixo da máquina passa pela junta que trabalha (distância do centro do joelho até a reta do eixo da alavanca, todo quadro) |

## Licença dos assets
Só assets nossos ou CC0 (MakeHuman/MPFB) e código aberto (Blender, three.js). Nada de mídia de terceiros:
os exercícios também viram vídeos à venda no futuro.
