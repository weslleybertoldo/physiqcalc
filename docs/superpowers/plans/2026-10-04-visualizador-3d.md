# Physiq — Visualizador 3D · Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Modo:** `Skill-wbs-local-stg-prod-ate-o-fim` (pedido dele 04/10 ~02:10) — sem gates humanos; validação minha,
> automatizada, com evidência (prints nas 3 etapas). Esteira técnica = `skill-wbs-deploy-local-staging-prod-pessoal`.

**Goal:** ficha do exercício abre num boneco 3D (girar/zoom) com músculo alvo/auxiliares, no app do aluno e no site
do profissional, tudo dentro do app; 2 pilotos primeiro, depois os 140 restantes em lotes.

**Architecture:** fábrica Blender (`scripts/exercicios3d/`) gera 1 boneco comprimido + mapa de músculos + por
exercício só animação/equipamento/foto; o app carrega three.js sob demanda (`src/lib/visualizador3d/`) e pinta os
músculos por shader a partir do manifesto (`src/lib/exercicios3dManifest.json`).

**Tech Stack:** Blender 5.2.2 + MPFB 2.0.17 (assets CC0), Python 3.12 (.venv numpy/scipy/pillow), three.js 0.186,
gltf-transform (meshopt + KTX2/toktx), React 19 + Vite 5 + vitest, Playwright (Chromium/SwiftShader), Capacitor 8.

**Spec:** `Physiq - Visualizador 3D - desenho aprovado - 2026-10-04.md` (mesma pasta) + `Revisao da spec - 2026-10-04.md`.

---

## Mapa de arquivos

| Caminho (repo `~/projetos/physiqcalc`) | Responsabilidade |
|---|---|
| `scripts/exercicios3d/README.md` | como instalar/rodar a fábrica (Blender portátil, MPFB, assets CC0, .venv, toktx) |
| `scripts/exercicios3d/lib/*.py` | boneco3d, anatomia3d, anatomia_tex, musculos_def, cabelo3d, poses3d, pegada3d, equip3d, checagem3d (vindos de `~/projetos/physiqcalc-scratch/gif_3d/`, caminhos relativos ao repo) |
| `scripts/exercicios3d/cenas/<slug>.py` | 1 por exercício: `montar(bon)` → equipamentos + restrições; `pose(t)`; `ZONAS` de apoio |
| `scripts/exercicios3d/fichas/<uuid>.json` | ficha: nome, grupo, subgrupos, alvos, auxiliares, equipamento, câmera, checagens, referência |
| `scripts/exercicios3d/exportar_boneco.py` | Blender: boneco + assar cor sem vermelho/normal + mapa de ids → GLB/PNG |
| `scripts/exercicios3d/exportar_exercicio.py` | Blender: cena → checagem completa (falhou = exit 1) → GLB só animação+equipamento |
| `scripts/exercicios3d/comprimir.sh` | gltf-transform: meshopt + KTX2 (fallback WEBP) |
| `scripts/exercicios3d/pack.py` + `test_pack.py` | fichas + arquivos → `src/lib/exercicios3dManifest.json` |
| `scripts/exercicios3d/bancada/` | página de bancada (esbuild) que usa `src/lib/visualizador3d` — prints, fotos paradas, checagem visual |
| `scripts/exercicios3d/foto.py` | Playwright na bancada → `public/exercicios3d/<uuid>-<v>.webp` + prints de checagem |
| `public/exercicios3d/` | `boneco-<v>.glb`, `musculos-<v>.png`, `<uuid>-<v>.glb`, `<uuid>-<v>.webp`, transcoder basis |
| `src/lib/visualizador3d/{motor,boneco,exercicio,cores,qualidade}.ts` | motor three.js (sem React) |
| `src/lib/exercicios3d.ts` (+ `.test.ts`) | `entrada3d(id)`, `fotoDoExercicio(id, imagem_url)` |
| `src/treino/ui/Visualizador3D.tsx` (+ `.test.tsx`) | componente React (foto → 3D, botões, legenda, fallback) |
| `src/treino/ui/SheetFicha.tsx`, `MiniaturaGif.tsx` (+ 6 chamadores), `src/app-aluno/perfil/TreinosProntos.tsx` | integração aluno (W2) |
| `src/painel/treinos/FolhaExercicio.tsx` | integração profissional (W3) |
| `vite.config.ts` | PWA: `**/exercicios3d/**` fora do precache + runtime cache |

---

## W1 — Fábrica no repo + pilotos (worktree `~/projetos/physiqcalc-w3d1`, branch `feat/exercicios3d-fabrica`)

### Task 1.1: worktree e base
- [ ] `cd ~/projetos/physiqcalc && git fetch origin && git worktree list && gh pr list --state open` (anti-sobrescrita)
- [ ] `git worktree add -b feat/exercicios3d-fabrica ~/projetos/physiqcalc-w3d1 origin/main`
- [ ] copiar `.env*` do repo principal (se existirem) e `npm ci` no worktree; `npx vitest run` verde antes de mexer.

### Task 1.2: trazer a fábrica pro repo
**Files:** Create `scripts/exercicios3d/lib/*.py`, `scripts/exercicios3d/README.md`, `scripts/exercicios3d/config.py`
- [ ] Copiar de `~/projetos/physiqcalc-scratch/gif_3d/`: `boneco3d.py poses3d.py equip3d.py anatomia3d.py anatomia_tex.py musculos_def.py cabelo3d.py pegada3d.py checagem3d.py` → `scripts/exercicios3d/lib/`.
- [ ] `config.py`: `AQUI = os.path.dirname(os.path.abspath(__file__))`; `LIB = AQUI/lib`; `TEX = AQUI/tex` (gerado, no `.gitignore`); `SAIDA = <repo>/public/exercicios3d`; `BLENDER = os.environ.get("BLENDER", os.path.expanduser("~/.local/blender/blender-5.2.2-linux-x64/blender"))`; `VENV_PY = os.environ.get("EX3D_PY", os.path.expanduser("~/projetos/physiqcalc-scratch/gif_3d/.venv/bin/python"))`.
- [ ] Trocar os caminhos fixos `/home/bertoldo/projetos/physiqcalc-scratch/gif_3d` (em `anatomia3d.py` `AQUI`, nas cenas e no `sys.path`) por `config`.
- [ ] `.gitignore`: `scripts/exercicios3d/tex/`, `scripts/exercicios3d/**/__pycache__/`.
- [ ] Gerar a textura base: `cd scripts/exercicios3d && $BLENDER -b -P lib/../exportar_malha.py` (copiar `exportar_malha.py` também) e `$VENV_PY lib/anatomia_tex.py base` → `tex/anat_*.png`, `tex/anat_grupo.npy`.
- [ ] Prova: `$BLENDER -b -P ver_anatomia.py -- /tmp/x 300 400 4` imprime "ANATOMIA pronta" (copiar `ver_anatomia.py` pra `scripts/exercicios3d/`).
- [ ] Commit `feat(exercicios3d): fábrica do boneco 3D no repo`.

### Task 1.3: mapa de músculos (ids)
**Files:** Modify `scripts/exercicios3d/lib/anatomia_tex.py` (novo modo `ids`); Create `scripts/exercicios3d/musculos_ids.json`
- [ ] Modo `ids`: lê `tex/anat_grupo.npy` (grupo por texel) e grava `public/exercicios3d/musculos-<v>.png` RGB8: R = id do músculo (0 = pele), G = canal de fibra (B de `anat_linhas.png`), B = 0; e `musculos_ids.json` = `{nome: id}` na ordem de `musculos_def.py` (estável: só acrescenta no fim).
- [ ] Teste (pytest simples em `scripts/exercicios3d/test_ids.py`): ids únicos, `quadriceps`/`gluteo`/`biceps`/`antebraco`/`adutores`/`posterior`/`lombar` presentes, PNG 2048×2048.

### Task 1.4: exportar o boneco
**Files:** Create `scripts/exercicios3d/exportar_boneco.py` (base: `gif_3d/exportar_glb.py`, parte 3–4)
- [ ] Boneco = `b3.Boneco()` + `an.corpo_atletico` + cabelo short02 + sobrancelhas + `an.visual_v4(bon, alvos=[], secundarios=[])` (SEM vermelho).
- [ ] Repouso → assar `DIFFUSE/COLOR` (16 amostras) e `NORMAL/TANGENT` (4) da cópia alta (Suave 3 + Relevo) na leve (Suave 1, Relevo off), cage 0,015, raio 0,03, margem 16 — igual ao teste.
- [ ] Material exportável (cor + normal), cabelo/sobrancelha cinza com alfa (`cinza_com_alfa`), sem animação; exporta `boneco-raw.glb` (sem compressão) — a compressão é a Task 1.6.
- [ ] Imprimir vértices/triângulos e tamanho; conferir com Read o `boneco_cor.png` (sem vermelho).

### Task 1.5: checagem completa (itens 1–8 da spec)
**Files:** Modify `scripts/exercicios3d/lib/checagem3d.py`; Create `scripts/exercicios3d/lib/limites.py`
- [ ] `limites.py`: amplitude por articulação (graus, com a fonte em comentário — Norkin & White, *Measurement of Joint Motion*; AAOS): joelho flex 0–150; cotovelo 0–150; ombro flex 0–180 / abd 0–180; quadril flex 0–125; coluna (Spine*) flex ≤ 60 somada; pescoço flex/ext ±50; punho flex 80 / ext 70 / desvio radial 20 / ulnar 30.
- [ ] `ck.juntas(rig)` → lista de violações por quadro (ângulo entre ossos pai/filho no eixo da articulação).
- [ ] `ck.pes(bon, chao_z=0, zonas)` → planta (vértices do grupo do pé com normal pra baixo) a 0±5 mm nos quadros de apoio; `ck.escorregou(prev, atual)` tornozelo ≤ 5 mm.
- [ ] `ck.corpo_x_corpo(bon)` → BVH por grupo de vértices (braço×tronco, antebraço×braço fora do vinco, coxa×coxa, perna×perna); penetração ≤ 2 mm.
- [ ] `ck.zonas(bon, equipamentos, ZONAS)` → zonas de apoio encostam (0–5 mm); fora delas folga ≥ 3 mm (o `quadro()` de hoje).
- [ ] `ck.rigidez(equipamentos, ref)` → distâncias entre pontos-chave constantes (≤ 2 mm).
- [ ] `ck.angulos_chave(rig, ficha["checagens"], t)` → cada ângulo-chave dentro da tolerância.
- [ ] `ck.resumo()` falha (exit 1) se qualquer item falhar; relatório por quadro em `scripts/exercicios3d/relatorios/<slug>.txt` (versionado).

### Task 1.6: exportar exercício + compressão
**Files:** Create `scripts/exercicios3d/exportar_exercicio.py`, `scripts/exercicios3d/comprimir.sh`, `scripts/exercicios3d/cenas/agachamento_livre_com_barra.py`, `scripts/exercicios3d/cenas/rosca_direta_com_barra.py`, `scripts/exercicios3d/fichas/f06e45bc-a6c7-4939-92d1-3d6fafa4a534.json`, `scripts/exercicios3d/fichas/4f141bfc-a902-406b-bc41-98076648c4ae.json`
- [ ] Cenas: extrair de `gif_3d/agachamento3d.py` e `gif_3d/rosca3d.py` só `montar(bon)` (IK, barra, pegada) e `pose(t)`; sem render.
- [ ] `exportar_exercicio.py -- <uuid>`: monta, roda a checagem em 25 quadros (`t=suave(k/24)`), captura poses (`rig.convert_space` POSE→LOCAL + quaternion contínuo), keyframes, apaga a MALHA do corpo/cabelo/olhos, exporta só armature + equipamento (`export_animation_mode="ACTIVE_ACTIONS"`) → `public/exercicios3d/<uuid>-raw.glb`.
- [ ] `comprimir.sh`: `npx -y @gltf-transform/cli@4 meshopt in out` e, pro boneco, `npx -y @gltf-transform/cli@4 etc1s`/`uastc` (normal map em UASTC) — precisa do `toktx` (KTX-Software .deb do GitHub `KhronosGroup/KTX-Software` releases, instalar em `~/.local`); sem `toktx` → `webp`. Versão `<v>` = `date +%s` gravada no nome.
- [ ] Copiar `three/examples/jsm/libs/basis/basis_transcoder.{js,wasm}` pra `public/exercicios3d/basis/`.
- [ ] Medir: boneco ≤ 5 MB, exercício ≤ 60 KB (barra).

### Task 1.7: motor + bancada + fotos
**Files:** Create `src/lib/visualizador3d/{motor,boneco,exercicio,cores,qualidade}.ts`, `scripts/exercicios3d/bancada/{index.html,bancada.ts}`, `scripts/exercicios3d/foto.py`
- [ ] `motor.ts` = o `viewer.js` do teste (`~/projetos/physiqcalc-scratch/viewer3d/viewer.js`) em TS, sem DOM de botões: `criarMotor(canvas, { fundo }) → { carregar(entrada, abort), vista(az), tocar(b), fundo(f), tamanho(), destruir() }`; GLTFLoader com `setMeshoptDecoder` e `KTX2Loader` (`/exercicios3d/basis/`).
- [ ] `cores.ts`: `onBeforeCompile` no material `boneco_pele`: uniforms `uMapa` (NearestFilter, sem mipmap), `uTabela` (DataTexture 256×1 RGBA: alvo/aux), `uPele` = 0.40 (linear); fragment: `cor = base * (corMusculo / uPele)`; alvo × `(1 - 0.25 * fibra)`.
- [ ] `qualidade.ts`: média de FPS nos 2 primeiros s; < 30 → `setPixelRatio(1.5)` → `1` e `shadow.mapSize` 1024.
- [ ] Bancada (esbuild) com os parâmetros de print do teste (`t, az, el, dist, fundo, cheia`) e `data-3d="pronto"`.
- [ ] `foto.py <uuid>`: Playwright (DPR 2, 600×400, fundo escuro, t=0, câmera da ficha) → `public/exercicios3d/<uuid>-<v>.webp`; prints de checagem (frente/lado/costas/cima + closes mãos/pés em t=0/0,5/1) em `scripts/exercicios3d/relatorios/<slug>/` — conferir TODOS com Read.

### Task 1.8: manifesto
**Files:** Create `scripts/exercicios3d/pack.py`, `scripts/exercicios3d/test_pack.py`, `src/lib/exercicios3dManifest.json`
- [ ] `pack.py`: para cada ficha com `<uuid>-<v>.glb` e `.webp` em `public/exercicios3d/`: `{uuid: {v, movimento: "/exercicios3d/<uuid>-<v>.glb", foto: "/exercicios3d/<uuid>-<v>.webp", bytes, alvos, auxiliares, camera, ida_s: 1.5}}` + chave `_boneco: {glb, mapa, v}`.
- [ ] `test_pack.py` (pytest): ficha sem arquivo não entra; ids de músculo inexistentes falham; caminhos começam com `/exercicios3d/`.

### Task 1.9: validação W1 + esteira
- [ ] Bancada local com os 2 pilotos: prints (escuro/claro, frente/lado/costas, zoom) conferidos; checagem verde nos 2.
- [ ] Postar no Validação/Physiq (`remoto_validacao("Physiq", texto, [prints])`) — sem esperar OK (modo até o fim).
- [ ] `npx vitest run` + `npm run build` verdes; commit; PR; merge (1 PR por vez — CI de release faz bump); conferir run + bump.
- [ ] W1 não muda tela: staging/prod = o build passa e os arquivos em `public/exercicios3d/` respondem 200 no Vercel.

## W2 — Visualizador no app do aluno (plano detalhado próprio antes de começar — `writing-plans`)
Escopo: `src/lib/exercicios3d.ts` (+ testes: 3D × GIF × ícone, fundo guardado), `Visualizador3D.tsx` (+ teste
de componente com motor mockado), `SheetFicha.tsx`, `MiniaturaGif` com `exercicioId` + 6 chamadores,
`TreinosProntos.tsx` (`fotoDoExercicio`), `vite.config.ts` (PWA), prints nas 3 etapas (local/staging/prod), APK
release + versionCode maior, medir RAM/fluidez no celular (adb, se o aparelho estiver disponível).

## W3 — Site do profissional (plano detalhado próprio)
`FolhaExercicio.tsx` (troca a prévia `<img>` pelo `Visualizador3D` quando há entrada, inclusive `somenteLeitura`),
miniaturas do editor/Biblioteca já cobertas na W2; prints nas 3 etapas.

## W4+ — Lotes de ~10 exercícios (procedimento repetido)
Por exercício: cena `cenas/<slug>.py` + ficha `fichas/<uuid>.json` (grupos/subgrupos padrão do catálogo, alvos,
auxiliares, checagens com referência de biomecânica) → `exportar_exercicio.py` (checagem verde) → `foto.py` (prints
conferidos) → `remoto_validacao("Physiq", …)` → `pack.py`. Por lote: tirar do `public/exercicios/` e do
`exerciciosManifest.json` os webp dos exercícios que ganharam 3D (Storage fica), PR → merge → release. Ordem: os
mais usados nos treinos prontos primeiro (`scripts/conteudo/treinos_prontos.json`), máquinas por último.

## Self-review (feito)
- Cobertura da spec: §2 UX → W2/W3; §3.1 → Tasks 1.2–1.8; §3.2 → 1.7 + W2; §3.3 → 1.8 + W4; §4 → 1.5; §5 → W2; §6 →
  1.8/1.9/W2; §7 → W1–W4; §7b → cabeçalho + W4 (Storage fica).
- Nomes consistentes: `fotoDoExercicio`, `entrada3d`, `exercicioId`, `criarMotor`, `boneco_pele`, `musculos-<v>.png`.
- W2/W3 sem código aqui de propósito: cada W ganha o seu plano detalhado no início (escopo separado).
