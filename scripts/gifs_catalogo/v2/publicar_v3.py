#!/usr/bin/env python3
"""Publica os GIFs escolhidos como "novo" (lote aprovado pelo Weslley) no PhysiqCalc:
  gif → webp (gif2webp oficial, sem perda) → upload <uuid>.webp nos buckets `exercicios` (public) e
  `exercicios-staging` → UPDATE imagem_url (…webp?v=<v>) em public E staging.
  Exercícios NOVOS (out/novos.json): INSERT em public+staging.tb_exercicios (id fixo do novos.json).
  --reapontar: troca as referências dos exercícios PESSOAIS do Weslley pelos do catálogo (backup antes).
  Guarda os .webp em webp/<uuid>-<v>.webp (pra commitar em public/exercicios + manifest depois).

  SUPABASE_PAT=... python3 publicar_v3.py aprovados/escolhas-2026-09-08-lote1.json [--dry] [--reapontar]
"""
import json, os, re, sys, time, unicodedata
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))  # scripts/ (exercicios_pack.py)
from exercicios_pack import gif_para_webp, upload, sql, service_role, SB, BUCKETS  # noqa: E402

AQUI = os.path.dirname(os.path.abspath(__file__))
ESC = sys.argv[1]
DRY = "--dry" in sys.argv
REAPONTAR = "--reapontar" in sys.argv
WESLLEY = "371769a8-a37d-4737-b52a-23611f5865a8"
# pessoal (tb_exercicios_usuario.id) → catálogo (tb_exercicios.id); os novos entram pelo novos.json
PESSOAL_PARA_CATALOGO_FIXOS = {
    "638aef7a-9d2d-41fb-895e-c3db8744144e": ("Barra fixa", "Barra Fixa"),
    "46db965d-3388-4b79-95a1-3c78b2b72317": ("Flexão Nórdica", "Flexão Nórdica"),
}
PESSOAL_NOVOS = {  # pessoal → nome do exercício novo (id em novos.json)
    "f0bc53c6-8beb-44b4-8748-b7157b275fb1": "Abdominal Bicicleta",
    "a2c32055-2b46-4a1a-8a35-9ce4a43d1800": "Abdominal Oblíquo com Pé no Banco",
    "f81b528c-aaae-41eb-bb45-a3bdd1c13a11": "Remada Baixa na Máquina",
}


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def q(s):  # escape simples pra literal SQL
    return s.replace("'", "''")


esc = json.load(open(ESC))
atuais = json.load(open(os.path.join(AQUI, "out", "atuais.json")))
novos = json.load(open(os.path.join(AQUI, "out", "novos.json")))
escolhidos = [n for n, v in esc.items() if v == "novo"]
gifs_dir = os.path.join(AQUI, "aprovados")
for n in escolhidos:
    assert os.path.exists(os.path.join(gifs_dir, slug(n) + ".gif")), f"gif faltando: {n}"
    assert n in atuais or n in novos, f"sem id: {n}"
print(f"{len(escolhidos)} escolhidos 'novo' ({sum(1 for n in escolhidos if n in novos)} exercícios novos) · dry={DRY}")

v = str(int(time.time()))
os.makedirs(os.path.join(AQUI, "webp"), exist_ok=True)

# backup das URLs atuais (public+staging) — persistido fora do /tmp
bk = {s: sql(f"select id, nome, imagem_url from {s}.tb_exercicios order by nome") for s in ("public", "staging")}
json.dump(bk, open(os.path.join(AQUI, f"backup_urls_{v}.json"), "w"), ensure_ascii=False, indent=1)
print("backup URLs:", f"backup_urls_{v}.json")

sr = None if DRY else service_role()
convertidos = []
for n in escolhidos:
    uid = (atuais.get(n) or novos[n])["id"].lower()
    data = open(os.path.join(gifs_dir, slug(n) + ".gif"), "rb").read()
    webp, nframes, size = gif_para_webp(data)
    with open(os.path.join(AQUI, "webp", f"{uid}-{v}.webp"), "wb") as fh:
        fh.write(webp)
    convertidos.append((n, uid, webp))
    print(f"  {n:42s} {uid[:8]} gif {len(data)//1024:4d} KB → webp {len(webp)//1024:3d} KB {nframes}f {size}")

if DRY:
    print("DRY: nada subiu; nada gravado no banco")
else:
    for n, uid, webp in convertidos:
        for bucket in BUCKETS.values():
            st = upload(sr, bucket, f"{uid}.webp", webp)
            assert st in (200, 201), f"upload {bucket}/{uid}.webp -> {st}"
    print(f"upload ok: {len(convertidos)} × {len(BUCKETS)} buckets")
    for n, uid, _ in convertidos:
        for schema, bucket in BUCKETS.items():
            url = f"{SB}/storage/v1/object/public/{bucket}/{uid}.webp?v={v}"
            if n in novos:
                e = novos[n]
                r = sql(f"insert into {schema}.tb_exercicios (id, nome, grupo_muscular, emoji, tipo, imagem_url, subgrupo, dica) values "
                        f"('{uid}', '{q(e['nome'])}', '{q(e['grupo_muscular'])}', '{q(e['emoji'])}', '{q(e.get('tipo') or 'musculacao')}', '{url}', '{q(e['subgrupo'])}', '{q(e['dica'])}') "
                        f"on conflict (id) do update set nome = excluded.nome, imagem_url = excluded.imagem_url, subgrupo = excluded.subgrupo, dica = excluded.dica returning id")
            else:
                r = sql(f"update {schema}.tb_exercicios set imagem_url = '{url}' where id = '{uid}' returning id")
            assert r, f"sem linha em {schema}: {n}"
    chk = {s: sql(f"select count(*) n from {s}.tb_exercicios where imagem_url like '%?v={v}'")[0]["n"] for s in ("public", "staging")}
    print(f"imagem_url com v={v}: {chk} (esperado {len(convertidos)} cada)")

# ── reapontar exercícios pessoais do Weslley → catálogo ──────────────────────
if REAPONTAR:
    mapa = {}
    nomes_cat = {r["nome"]: r["id"] for r in bk["public"]}
    for pid, (nome_p, nome_c) in PESSOAL_PARA_CATALOGO_FIXOS.items():
        mapa[pid] = (nome_p, nomes_cat[nome_c])
    for pid, nome_novo in PESSOAL_NOVOS.items():
        if nome_novo in escolhidos:   # só se o exercício novo foi publicado agora (ou já existe no catálogo)
            mapa[pid] = (nome_novo, novos[nome_novo]["id"])
    print("\nreapontar:", {k[:8]: (a, b[:8]) for k, (a, b) in mapa.items()})
    backup_rows = {}
    for pid, (nome_p, cid) in mapa.items():
        backup_rows[pid] = {
            "grupos": sql(f"select * from public.tb_grupos_exercicios_usuario where exercicio_usuario_id='{pid}'"),
            "series": sql(f"select * from public.tb_treino_series where exercicio_usuario_id='{pid}'"),
            "pesos": sql(f"select * from public.tb_academia_pesos where exercicio_usuario_id='{pid}'"),
            "ordem": sql(f"select * from public.exercicio_ordem_usuario where exercicio_id='{pid}'"),
            "subst": sql(f"select * from public.exercicio_substituicao_usuario where exercicio_novo_usuario_id='{pid}'"),
            "coment": sql(f"select * from public.tb_exercicio_comentarios where exercicio_usuario_id='{pid}'"),
        }
        # colisões com chaves únicas (séries mesmo dia/slot/nº; ordem mesmo grupo; comentário mesmo user)
        col_series = sql(f"select count(*) n from public.tb_treino_series a join public.tb_treino_series b on a.user_id=b.user_id and a.data_treino=b.data_treino and a.slot_idx=b.slot_idx and a.numero_serie=b.numero_serie where a.exercicio_usuario_id='{pid}' and b.exercicio_id='{cid}'")[0]["n"]
        col_ordem = sql(f"select count(*) n from public.exercicio_ordem_usuario a join public.exercicio_ordem_usuario b on a.user_id=b.user_id and a.grupo_id=b.grupo_id where a.exercicio_id='{pid}' and b.exercicio_id='{cid}'")[0]["n"]
        col_com = sql(f"select count(*) n from public.tb_exercicio_comentarios a join public.tb_exercicio_comentarios b on a.user_id=b.user_id where a.exercicio_usuario_id='{pid}' and b.exercicio_id='{cid}'")[0]["n"]
        cnt = {k: len(vv) for k, vv in backup_rows[pid].items()}
        print(f"  {nome_p:34s} {pid[:8]} → {cid[:8]}  linhas={cnt}  colisões: series={col_series} ordem={col_ordem} coment={col_com}")
        assert col_series == 0 and col_ordem == 0 and col_com == 0, "colisão de chave única — resolver antes"
    json.dump(backup_rows, open(os.path.join(AQUI, f"backup_reapontar_{v}.json"), "w"), ensure_ascii=False, indent=1, default=str)
    if not DRY:
        for pid, (nome_p, cid) in mapa.items():
            r1 = sql(f"update public.tb_grupos_exercicios_usuario set exercicio_id='{cid}', exercicio_usuario_id=null where exercicio_usuario_id='{pid}' returning id")
            r2 = sql(f"update public.tb_treino_series set exercicio_id='{cid}', exercicio_usuario_id=null where exercicio_usuario_id='{pid}' returning id")
            r3 = sql(f"update public.tb_academia_pesos set exercicio_id='{cid}', exercicio_usuario_id=null where exercicio_usuario_id='{pid}' returning id")
            r4 = sql(f"update public.exercicio_ordem_usuario set exercicio_id='{cid}' where exercicio_id='{pid}' returning id")
            r5 = sql(f"update public.exercicio_substituicao_usuario set exercicio_novo_id='{cid}', exercicio_novo_usuario_id=null where exercicio_novo_usuario_id='{pid}' returning id")
            r6 = sql(f"update public.tb_exercicio_comentarios set exercicio_id='{cid}', exercicio_usuario_id=null where exercicio_usuario_id='{pid}' returning id")
            print(f"  ok {nome_p:34s} grupos={len(r1)} series={len(r2)} pesos={len(r3)} ordem={len(r4)} subst={len(r5)} coment={len(r6)}")
        resto = sql(f"select count(*) n from public.tb_treino_series where exercicio_usuario_id in ({','.join(repr(k) for k in mapa)})")[0]["n"]
        print("séries ainda apontando pro pessoal (esperado 0):", resto)
    else:
        print("DRY: reapontamento não executado")
