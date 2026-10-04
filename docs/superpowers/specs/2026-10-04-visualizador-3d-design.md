# Physiq — Visualizador 3D dos exercícios (desenho aprovado)

> Data: 04/10/2026 · Projeto pessoal (Physiq = repo `weslleybertoldo/physiqcalc`, React 19 + Vite 5 + Tailwind 4, APK Capacitor 8)
> Origem: brainstorming de 04/10/2026 00:33–02:10, depois do teste no celular. Entra no repo (`docs/superpowers/specs/2026-10-04-visualizador-3d-design.md`) na W1.

## 0. Resumo

Ao tocar num exercício, a ficha abre direto num **boneco 3D fazendo o movimento**, que gira, dá zoom e mostra o
**músculo alvo** (vermelho) e os **auxiliares** (vermelho claro). Um boneco só serve pros 142 exercícios; cada
exercício guarda só o movimento, o equipamento e uma foto parada. Tudo vai dentro do app (abre sem internet).
Acaba a render de vídeo: o trabalho por exercício passa a ser montar o movimento certo e passar na checagem completa.

## 1. Pedido e decisões (dele — não reperguntar)

- Pedido (04/10 00:28): *"quando clicar no exercício ser um elemento 3D onde eu poderia girar o personagem para
  visualizar os outros ângulos, dar zoom e afastar"* → (00:33) *"Vamos alinhar o visualizador 3D"*.
- Testou o link do agachamento em 3D × vídeo 1920 e escolheu **seguir com o 3D** ("1").
- Decisões:
  1. **A ficha já abre no 3D**; a foto parada aparece só enquanto carrega ("1").
  2. **App do aluno e site do profissional**, o mesmo visualizador ("1").
  3. **Controles do teste**: girar, zoom, Pausar/Tocar, Frente/Lado/Costas, Tela cheia; legenda alvo/auxiliares sempre ("1").
  4. **Tudo dentro do app** ("1").
  5. **Fundo**: *"deixa a opção no app também, já abre no escuro, com opção de ver no claro"*.
  6. **three.js direto** ("1"), sem React Three Fiber e sem `<model-viewer>`.
  7. Partes 1–5 deste desenho aprovadas uma a uma ("1" em cada).
  8. **Checagem completa do corpo e dos equipamentos** (dele, ao aprovar a parte 5): *"na checagem inclui a validação
     completa do corpo e dos elementos correto? Para que fique real? Posição dos membros (mãos, pés, etc, equipamentos)"*.
- Decisões anteriores que continuam: boneco nosso (MakeHuman/MPFB + anatomia por código, nada pago); relevo suave
  (`an.visual_v4`, força 0,017); alvo vermelho + auxiliares vermelho claro; legenda "músculo alvo" / "músculos auxiliares";
  cabelo curto, sem short; os 142 exercícios do catálogo; validar cada exercício no grupo Validação, tópico Physiq.
- Cancelado: vídeos em 1920 (*"Não faz mais nenhum exercício em 1920"*).

## 2. Como fica pra quem usa

- **Ficha do exercício** (aluno: `SheetFicha`; profissional: ficha da Biblioteca): a caixa 3:2 abre com a foto
  parada do exercício e, quando o 3D fica pronto (meta ~1 s com tudo dentro do app; aceite: `data-3d="pronto"` em
  ≤ 3 s no navegador de teste e ≤ 2 s no celular dele), troca pro boneco fazendo o
  movimento em ida e volta contínua (desce/sobe), no ângulo inicial definido pro exercício.
- **Gestos**: arrastar gira em volta do boneco; pinça (dois dedos) aproxima/afasta; sem arrastar de lado (pan).
  A câmera não passa pra baixo do chão.
- **Botões** (embaixo da caixa): Pausar/Tocar · Frente · Lado · Costas · Tela cheia · Fundo (escuro ↔ claro).
  O fundo abre **escuro** (#0f0f12, a cor da caixa da ficha); a escolha fica guardada no aparelho.
- **Legenda** fixa: ● músculo alvo (vermelho) · ● músculos auxiliares (vermelho claro).
- **Miniatura na lista** (`MiniaturaGif` e afins): exercício com 3D usa a foto parada nova.
- **Exercício ainda sem 3D**: fica igual hoje (GIF antigo, local primeiro, ou o ícone).
- **Aparelho sem 3D** (WebGL indisponível, erro ao carregar, contexto perdido): fica a foto parada + aviso
  pequeno "3D indisponível neste aparelho".

## 3. Peças

### 3.1 Fábrica (Blender, no PC) — `scripts/exercicios3d/`
Os scripts de hoje (`~/projetos/physiqcalc-scratch/gif_3d/`) entram no repo, limpos:
- `boneco3d.py`, `anatomia3d.py`, `anatomia_tex.py`, `musculos_def.py`, `cabelo3d.py`, `poses3d.py`,
  `pegada3d.py`, `equip3d.py`, `checagem3d.py` (ampliado — seção 4), cenas `cenas/<slug>.py` (uma por exercício:
  a função `pose(t)` e o equipamento), `exportar_glb.py` (a base do teste).
- Saídas (em `public/exercicios3d/`, embutidas no APK):
  - `boneco-<v>.glb` — **1 vez**: malha leve (subdivisão 1, ~107 mil triângulos), esqueleto Mixamo do MPFB,
    cabelo, sobrancelhas, olhos; textura de **cor sem vermelho** (pele + sombras/oclusão assadas da malha com
    relevo) e **normal map** (relevo), 2048², **KTX2/Basis** (memória de vídeo ~4× menor que WEBP/PNG decodificado —
    pergunta dele sobre RAM, 04/10 ~02:15); geometria comprimida (meshopt). Meta: ≤ 3,5 MB; aceite ≤ 5 MB
    (medido na W1; o teste sem compressão deu 7,8 MB). Se o KTX2 não passar na checagem visual, volta pro WEBP.
  - `musculos-<v>.png` — **mapa dos músculos** (1 id por texel, 2048², sem filtro) + canal das fibras.
  - `<uuid>-<v>.glb` — **por exercício**: só a animação do esqueleto (25 quadros de ida, ping-pong no app) + o
    equipamento e a animação dele. Sem o corpo. Meta: ≤ 60 KB (barra) / ≤ 300 KB (máquina).
  - `<uuid>-<v>.webp` — **foto parada** 600×400 tirada do PRÓPRIO visualizador (fundo escuro, ângulo inicial,
    t=0): a troca foto → 3D não pula.
- `scripts/exercicios3d/fichas/<uuid>.json` — a **ficha do exercício** (seção 3.3).
- `scripts/exercicios3d/pack.py` — gera `src/lib/exercicios3dManifest.json` a partir das fichas + arquivos
  (mesmo papel do `scripts/exercicios_pack.py` dos webp).

### 3.2 App — visualizador único
- `src/lib/visualizador3d/` (three.js, carregado por `import()` só quando uma ficha com 3D abre):
  - `motor.ts` — renderer (sRGB, sem tone mapping, pixel ratio ≤ 3), cena, luzes do "estúdio forte" (principal com
    sombra PCF suave + preenche + 2 recortes + ambiente RoomEnvironment), chão que só recebe sombra, câmera e
    `OrbitControls` (sem pan, limite do chão), vistas Frente/Lado/Costas, loop só com a ficha aberta.
  - `boneco.ts` — guarda só o **arquivo** do `boneco-<v>.glb` (ArrayBuffer, ~3–5 MB) entre fichas; o boneco
    decodificado (malha + texturas na placa) é liberado ao fechar a ficha. RAM: ~100–200 MB a mais só com a ficha
    3D aberta (mais em tela cheia); medir no celular na W2.
  - `exercicio.ts` — carrega o `<uuid>-<v>.glb`, junta o equipamento, toca a animação em `LoopPingPong`.
  - `cores.ts` — pinta os músculos na hora: o material do corpo lê o `musculos-<v>.png` (id) e uma tabela de
    256 cores (alvo = vermelho #DB2B26 aprox.; auxiliar = vermelho claro; resto = sem mudança) via
    `onBeforeCompile`; fibras escurecem só no alvo (como no Blender).
  - `qualidade.ts` — mede o FPS nos 2 primeiros segundos; abaixo de 30 → pixel ratio 1,5 → 1 e sombra 1024.
- `src/treino/ui/Visualizador3D.tsx` — componente React: caixa 3:2 com a foto até o `pronto`, botões, legenda,
  aviso de indisponível; cancela o carregamento se a ficha fechar (AbortController); ao desmontar, libera tudo da
  placa (renderer, malhas, texturas, sombra) — fica só o arquivo do boneco em memória.
- Integração: `SheetFicha.tsx` (aluno) e `FolhaExercicio.tsx` (profissional; hoje mostra a prévia `<img>` na
  linha ~141, inclusive no modo `somenteLeitura` do catálogo) trocam a imagem pelo `Visualizador3D` quando o
  exercício tem entrada no manifesto; sem entrada → comportamento atual.
- Foto parada nas listas: uma função única `fotoDoExercicio(id, imagem_url)` (em `src/lib/exercicios3d.ts`) devolve
  a foto do 3D quando há entrada, senão o `resolverImagem(imagem_url)` de hoje. Precisa do **id** (o manifesto é por
  uuid e os 61 exercícios sem GIF não têm URL): `MiniaturaGif` ganha a prop `exercicioId` e todos os chamadores
  passam o id — `painel/treinos/Biblioteca.tsx`, `treino/editor/LinhaExercicioEditor.tsx`, `treino/editor/folhas.tsx`,
  `treino/ui/LinhaExercicio.tsx`, `treino/ui/SheetMeuTreino.tsx`, `treino/ui/TrocarExercicio.tsx` — e o
  `app-aluno/perfil/TreinosProntos.tsx` (usa `resolverImagem` direto num `<img>`) passa a usar `fotoDoExercicio`.
- Canvas com `touch-action: none` (girar na vertical não rola a ficha; rolar é fora da caixa). A ficha é um Radix
  Dialog (`ui/premium/Sheet.tsx`), sem gesto de arrastar pra fechar — sem conflito.
- **Cor do músculo na hora**: a cor assada é `pele × sombra` (pele = cinza constante 0,40 linear), então o shader
  faz `cor = base × (corMusculo / pele)` (mantém sombra/oclusão/relevo) e, só no alvo, `× (1 − 0,25 × fibra)`.
- PWA (`vite.config.ts`): `**/exercicios3d/**` fora do precache (igual `exercicios/`) e cache em tempo de uso
  (CacheFirst, `exercicios3d-local-cache`); o chunk do three.js (~650 KB, ~170 KB gzip) entra no precache.

### 3.3 Dados
- `src/lib/exercicios3dManifest.json` (gerado): `uuid → { v, movimento, foto, bytes, alvos[], auxiliares[],
  camera: { az, el, dist }, ida_s }`. Fica dentro do app; **nada muda no banco**.
- Ficha do exercício (`fichas/<uuid>.json`, revisada por ele no Validação): nome, grupo e subgrupos (padrão do
  catálogo), `alvos`/`auxiliares` (ids do mapa de músculos), equipamento, câmera inicial, **checagens do
  movimento** (ângulos-chave com tolerância, zonas de apoio — seção 4) e a referência de biomecânica com a fonte.
- Exercício novo com 3D chega junto com uma **versão nova do app** (lote → release). O GIF antigo daquele
  exercício sai do `public/exercicios/` no mesmo lote.

## 4. Checagem completa (antes de cada exercício entrar)
Roda no Blender, em TODOS os quadros (`checagem3d.py`, modo `checar`), e só exporta com tudo verde. Itens:
1. **Mãos** — pele encostando no equipamento (sem vão > 2 mm, sem entrar > aperto), envolvimento ≥ 200°, punho
   dentro do limite natural (desvio ≤ ~55°; já existe).
2. **Pés** — planta apoiada no chão/plataforma (0 ± 5 mm) nos quadros de apoio; tornozelo não escorrega entre
   quadros (≤ 5 mm); calcanhar não sobe quando não deve.
3. **Juntas** — joelho, cotovelo, ombro, quadril, coluna, pescoço e punho dentro da amplitude humana normal
   (tabela de referência — Norkin & White / AAOS — fechada na W1 com a fonte).
4. **Corpo × corpo** — nenhuma parte atravessa outra (braço × tronco, antebraço × braço fora do vinco do
   cotovelo, coxa × coxa, perna × perna), tolerância 2 mm.
5. **Corpo × equipamento** — nada atravessa (folga ≥ 3 mm), exceto as **zonas de apoio** da ficha (costas no
   banco, quadril no assento, pés na plataforma, barra nas costas), que têm que encostar (0–5 mm).
6. **Equipamento** — peças rígidas (barra não estica, anilha presa), peça móvel só no trilho/pivô (≤ 2 mm).
7. **Movimento** — amplitude e ângulos-chave do começo/fim dentro da tolerância da ficha (ex.: agachamento: coxa
   ≤ 5° da horizontal embaixo; joelho na linha do pé), sem salto entre quadros.
8. **Visual** — prints de frente, lado, costas e de cima + closes de mãos e pés no começo, meio e fim, tirados do
   PRÓPRIO visualizador; conferidos por mim (Read) antes de mandar; depois ele valida no Validação/Physiq.

## 5. Erros e casos-limite
- Sem WebGL / falha no carregamento / contexto perdido → foto parada + aviso; erro só no console (sem dado pessoal).
- Exercício sem entrada no manifesto → GIF atual ou ícone.
- Ficha fechada no meio do carregamento → cancela sem erro.
- App em segundo plano → o loop para sozinho (requestAnimationFrame).
- Fundo guardado em `localStorage` (`physiq.fundo3d`), com try/catch; sem acesso → escuro.

## 6. Testes
- **Unit (vitest)**: escolha 3D × GIF × ícone pelo manifesto; fundo padrão e guardado; regra da qualidade adaptativa.
- **Componente**: `SheetFicha` mostra o 3D com entrada e o GIF sem entrada (motor mockado); foto até o `pronto`.
- **Navegador de teste** (Playwright + Chromium com SwiftShader, como no teste de 04/10): abre a ficha local, espera
  `data-3d="pronto"`, prints dos pilotos em escuro/claro e tela cheia.
- **Fábrica**: relatório do `checar` por exercício (seção 4) + prints conferidos.
- **Celular de verdade**: APK de staging — tempo até o 3D aparecer e fluidez.

## 7. Entrega por partes (worktrees, esteira pessoal local → staging → prod com OK dele)
- **W1 — Fábrica no repo + pilotos** (~1–1,5 dia): scripts em `scripts/exercicios3d/`, boneco único comprimido,
  mapa dos músculos, checagem ampliada (itens 1–8), export do **Agachamento Livre com Barra**
  (`f06e45bc-a6c7-4939-92d1-3d6fafa4a534`) e da **Rosca Direta com Barra** (`4f141bfc-a902-406b-bc41-98076648c4ae`),
  fichas + manifesto. Não muda tela do app.
- **W2 — Visualizador no app do aluno** (~1 dia): `src/lib/visualizador3d/`, `Visualizador3D.tsx`, `SheetFicha`,
  miniaturas, PWA; release do APK com os 2 pilotos.
- **W3 — Site do profissional** (~0,5 dia): ficha da Biblioteca + miniaturas do editor.
- **W4+ — Os outros 140 em lotes de ~10** (~1 h por exercício): cena + ficha + checagem + prints + validação dele;
  cada lote = versão nova do app (tira os GIFs antigos dos que entraram).

## 7b. Fronteiras de execução (modo "até o fim", pedido dele 04/10 ~02:10)
- ✅ **Pode sozinho**: scripts da fábrica, arquivos 3D, código do app, testes, worktree/PR/merge, staging e
  produção pela esteira pessoal com validação automatizada e evidência (prints nas 3 etapas), postar cada exercício
  no Validação/Physiq.
- ⚠️ **Pergunta antes**: apagar arquivo do Storage (os GIFs antigos ficam lá — APK antigo e `imagem_url` ainda
  usam), mudar o banco, mexer em conta/dado de cliente real.
- 🚫 **Nunca**: render em 1920; mídia/texto de terceiros (SmartWorkout, Personal Fit); comprar asset; commitar
  segredo; publicar sem a checagem completa verde.

## 8. Fora do escopo
- Vídeos/GIFs novos e qualquer render em 1920 agora. O Drive ficou assim (dele, 04/10): *"Lembra de salvar todos
  os movimentos/exercícios no drive do bertoldo.code@gmail.com para futuramente usarmos pra fazer os vídeos"* +
  *"Futuramente vamos criar 2 packs de vídeos para vender"* → cada exercício pronto vai pro Drive pronto pra render
  (cena `.blend` com o movimento e as texturas embutidas + GLB do movimento + ficha + foto); os vídeos saem depois,
  de uma vez, quando o formato dos packs estiver definido.
- React Three Fiber, `<model-viewer>`, baixar 3D pela internet fora de uma versão do app, mudanças no banco.
- Animações do Mixamo: só se servirem num lote (exercício sem equipamento), sempre passando pela checagem.

## 9. Riscos
- **Borda do mapa de músculos** serrilhada em zoom extremo (id sem filtro) → as bordas caem nos vales escuros; se
  aparecer, máscara suave por exercício (+~0,5 MB).
- **Pele esticada** no ombro em poses extremas (visto no zoom do teste) → conferir nos prints; ajustar pesos/pose.
- **Celular fraco** (107 mil triângulos com esqueleto + sombra) → qualidade adaptativa; se faltar, malha sem
  subdivisão (~27 mil triângulos) nesses aparelhos.
- **Máquinas** (leg press, Smith, polias) dão mais trabalho de modelagem e de checagem que barra/halter.
- **Tamanho do APK**: +15–20 MB de 3D, −29 MB de GIFs conforme os exercícios entram.

## 10. Referências
- Teste de 04/10: `~/projetos/physiqcalc-scratch/viewer3d/` (`exportar_glb.py` em `gif_3d/`, `viewer.js`,
  `prints.py`, `comparar.py`); GLB 7,8 MB sem compressão; carregou em 0,4–0,7 s.
- Plano de retorno: `~/Desktop/Plano de Retorno Pessoal/Physiq/Physiq - GIFs 3D dos exercicios com personagem detalhado no WSL - 2026-10-03.md` (seção 12).
- Código atual de imagem: `src/lib/imagemExercicio.ts` + `src/lib/exerciciosManifest.json` (81 webp, 30,5 MB),
  `src/treino/ui/SheetFicha.tsx`, `src/treino/ui/MiniaturaGif.tsx`, `src/painel/treinos/FolhaExercicio.tsx`.
