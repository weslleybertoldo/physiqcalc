# GIFs v2/v3 (motor 3D) + comparativo + publicação

Motor aprovado em 26/08/2026; cenas refeitas em 08–09/09/2026 após validação GIF a GIF com o Weslley
(detalhe e regras na memória `retomar-physiqcalc-gifs-catalogo`).

## Arquivos
- `rig3d_lib.py` — Camera/Scene (projeção ortográfica 3/4, painter por profundidade, caixas longas fatiadas,
  autofit), Body (pose por ângulos elev/az, stances stand/seat/supine/prone/kneel), draw_body, equipamentos.
- `catalogo3d.py` — cenas originais (26/08). `cenas_v3.py` — cenas refeitas (sobrescrevem as originais) + helpers:
  `press_hands` (empurrar em linha reta por IK), `rigid` (barra rígida grossa), `arc_hand`/`arc` (mão presa a um
  arco de raio constante em volta do pivô → barra não muda de tamanho), `perna_para_pe`/`leg_ik` (pé fixo no chão
  ou plataforma), `bench_along` (banco/encosto alinhado ao tronco). Nomes/ids/subgrupo/dica vêm de `../catalogo.py`.
- `gerar_v2.py OUT [filtro]` — gera GIFs (24f × 80 ms) + `contato-NN.png`. `gerar_lista.py OUT < nomes.txt` — só os da lista.
- `sheet4.py`, `strip24.py`, `grid4.py` — folhas de revisão (4 frames a 400×267 · 24 frames · 2×2 em tamanho real).
  ⚠️ Bugs de sobreposição só aparecem em tamanho real — revisar com `grid4.py` (e zoom) antes de entregar.
- `comparar_v3.py OUT PORTA` — HTML atual × novo com escolha por exercício (só errados + novos; `SO_PENDENTES=1`
  esconde os já decididos; motivo da troca por card). Escolhas em `OUT/escolhas.json`; exercícios novos com id
  fixo em `OUT/novos.json`. Precisa `SUPABASE_PAT` na 1ª subida (cacheia `atuais.json`).
- `publicar_v3.py ESCOLHAS.json [--dry] [--reapontar]` — publica SÓ os "novo": gif→webp (`gif2webp` via
  `../../exercicios_pack.py`), upload `<uuid>.webp` nos buckets `exercicios` + `exercicios-staging`, `imagem_url`
  `…webp?v=<v>` em public E staging; exercício novo = INSERT (id do `novos.json`); `--reapontar` troca as referências
  dos exercícios pessoais do Weslley pelos do catálogo (backup em `backup_reapontar_<v>.json`). Guarda os `.webp`
  em `webp/` pra commitar em `public/exercicios` + `src/lib/exerciciosManifest.json`.
- `escolhas-2026-09-0*-lote*.json` — lotes publicados em 08–09/09 (54 GIFs novos + 3 exercícios novos).
- `escolhas-2026-08-26.json` / `comparar_server.py` / `publicar_escolhidos.py` — rodada de 26/08 (histórico).

## Regras de cena aprendidas com o Weslley (manter)
- Supino = empurrar em LINHA RETA com cotovelos ~45° (não arco de crucifixo); barras da máquina grossas e de
  comprimento fixo; só braços e pesos se mexem. Máquina deitado = Smith (barra em trilhos).
- Deitados: câmera `supino`; tronco inclinado usa `bench_along` (não `seat(back_angle)`, que engole a cabeça).
- Pilha da polia junto à coluna; torre nunca entre a câmera e o corpo; rolo da flexora ATRÁS das pernas.
- Braço atrás do tronco fica atrás de verdade (faixa de z-fight de 6 un.). Ângulo `az` nunca cruza ±180 entre
  A e B (o membro dá a volta) — usar valores contínuos ou IK por alvo de mão.
- Só avançar pro próximo exercício com movimento + elementos fazendo sentido (checar numericamente: barra
  constante, pé parado, mãos juntas).

Uso: `cd scripts/gifs_catalogo/v2 && python3 gerar_v2.py /tmp/v3out && SUPABASE_PAT=... python3 comparar_v3.py /tmp/v3out 8090`
