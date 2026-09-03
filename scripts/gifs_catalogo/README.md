# Gerador de GIFs + metadados do catálogo de exercícios

Ilustrações vetoriais animadas (Pillow, 600×400, 24 frames × 80 ms ≈ 1,9 s) no visual do app, mais subgrupo e dica de execução (com referência) por exercício.

- `rig.py` — boneco 2D por ângulos + props (banco, assento, torre/pilha, alavanca, cabo, barra, halter, pads).
- `catalogo.py` — catálogo-alvo: pose A/B, props, subgrupo e dica de cada exercício (`id` = prefixo do uuid existente; `None` = novo).
- `gerar_todos.py OUT [filtro]` — gera os GIFs + folhas de contato (`contato-NN.png`) para revisão.
- `publicar.py OUT [--dry]` — sobe os GIFs nos buckets `exercicios`/`exercicios-staging` (`<id>.gif`) e faz UPDATE/INSERT em `public`/`staging.tb_exercicios`.
- `v2/` — motor 3D (v2) + comparativo; ver `v2/README.md`.

Env obrigatórias para publicar: `SUPABASE_PAT` (Management API) e `SUPABASE_SERVICE_ROLE` (Storage). Nunca commitar chaves.

Publicado em 26/08/2026: 77 exercícios (48 existentes + 29 novos) com GIF, subgrupo e dica em public e staging.

## Imagens embutidas no app (WebP) — `scripts/exercicios_pack.py`

Desde 03/09/2026 as imagens dos exercícios vêm **dentro do app**: `public/exercicios/<uuid>-<v>.webp`
(WebP animado sem perda, ~35% menor que o GIF) + `src/lib/exerciciosManifest.json` (`{uuid: {v, bytes}}`).
`src/lib/imagemExercicio.ts` (`resolverImagem`) usa o arquivo local quando o `?v=` da `imagem_url` bate com o
manifest; senão cai na URL do Storage (exercício novo ou GIF trocado depois do build).

Fluxo ao aprovar um GIF novo/alterado (gerador ou upload no admin):

1. `python3 scripts/exercicios_pack.py` — baixa os GIFs de `public.tb_exercicios`, converte com o `gif2webp`
   oficial (baixado em `~/.cache/libwebp-1.5.0/` se não estiver no PATH), grava os `.webp` e o manifest.
2. `python3 scripts/exercicios_pack.py --publicar-existentes` — sobe `<uuid>.webp` nos 2 buckets (cache 1 ano)
   e troca `imagem_url` em `public` e `staging` pra `.webp?v=<v>` (backup das URLs antigas em `/tmp/`).
3. Commit de `public/exercicios/` + `src/lib/exerciciosManifest.json` → a próxima release embute; até lá o app
   usa a URL da rede automaticamente.

`--filtro <nome>` converte só alguns (mantém o resto do manifest); `--lossy 90` usa o modo mixed (um pouco menor, com perda).
