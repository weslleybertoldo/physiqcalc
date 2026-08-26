# GIFs v2 (motor 3D) + comparativo

Motor aprovado em 26/08/2026 (ver memoria "retomar-physiqcalc-gifs-catalogo").

- rig3d_lib.py: Camera/Scene (projecao ortografica 3/4, painter por profundidade, autofit), Body (pose por angulos elev/az, stances stand/seat/supine/prone/kneel), draw_body (capa do deltoide, musculo alvo por regiao), equipamentos.
- catalogo3d.py: cena por exercicio (camera, musculos, pose A/B, equipamento). Nomes/ids/dicas vem de ../catalogo.py.
- gerar_v2.py OUT [filtro]: gera GIFs (24f x 80ms) + contato-NN.png.
- sheet.py PASTA SAIDA: folha de contato de uma pasta.
- comparar_server.py OUT PORTA: HTML atual x novo com escolha (POST /escolha -> OUT/escolhas.json). Precisa SUPABASE_PAT so na 1a subida (cacheia atuais.json).
- publicar_escolhidos.py OUT: publica SO os "novo" (Storage exercicios + exercicios-staging, imagem_url c/ ?v=). Env: SUPABASE_PAT, SUPABASE_SERVICE_ROLE.
- escolhas-2026-08-26.json: 56 novo / 20 atual (escolha do Weslley).

Uso: cd scripts/gifs_catalogo/v2 && python3 gerar_v2.py /tmp/v2out && SUPABASE_PAT=... python3 comparar_server.py /tmp/v2out 8090
