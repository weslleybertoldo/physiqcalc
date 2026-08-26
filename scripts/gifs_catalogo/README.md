# Gerador de GIFs + metadados do catálogo de exercícios

Ilustrações vetoriais animadas (Pillow, 600×400, 24 frames × 80 ms ≈ 1,9 s) no visual do app, mais subgrupo e dica de execução (com referência) por exercício.

- `rig.py` — boneco 2D por ângulos + props (banco, assento, torre/pilha, alavanca, cabo, barra, halter, pads).
- `catalogo.py` — catálogo-alvo: pose A/B, props, subgrupo e dica de cada exercício (`id` = prefixo do uuid existente; `None` = novo).
- `gerar_todos.py OUT [filtro]` — gera os GIFs + folhas de contato (`contato-NN.png`) para revisão.
- `publicar.py OUT [--dry]` — sobe os GIFs nos buckets `exercicios`/`exercicios-staging` (`<id>.gif`) e faz UPDATE/INSERT em `public`/`staging.tb_exercicios`.

Env obrigatórias para publicar: `SUPABASE_PAT` (Management API) e `SUPABASE_SERVICE_ROLE` (Storage). Nunca commitar chaves.

Publicado em 26/08/2026: 77 exercícios (48 existentes + 29 novos) com GIF, subgrupo e dica em public e staging.
