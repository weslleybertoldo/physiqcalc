#!/usr/bin/env python3
"""Publica o catálogo-alvo no PhysiqCalc:
  1. resolve ids completos dos exercícios existentes (prefixo → uuid) e gera uuid pros novos
  2. sobe cada GIF nos buckets `exercicios` (public) e `exercicios-staging` (staging) como <id>.gif
  3. UPDATE (existentes) / INSERT (novos) em public.tb_exercicios e staging.tb_exercicios
     com nome corrigido, subgrupo, dica e imagem_url
  4. imprime o resumo + verificação

  python3 publicar.py /tmp/gif_supino/out [--dry]
"""
import json
import os
import sys
import time
import urllib.request
import uuid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from catalogo import D, E  # noqa: E402
from gerar_todos import slug  # noqa: E402

PAT = os.environ["SUPABASE_PAT"]  # PAT da conta pessoal (nunca no repo)
REF = "uxwpwdbbnlticxgtzcsb"
SUPA = f"https://{REF}.supabase.co"
SR = os.environ["SUPABASE_SERVICE_ROLE"]  # service_role do projeto (nunca no repo)
OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/gif_supino/out"
DRY = "--dry" in sys.argv
BUCKETS = {"public": "exercicios", "staging": "exercicios-staging"}


def sql(query):
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{REF}/database/query",
        data=json.dumps({"query": query}).encode(),
        headers={"Authorization": f"Bearer {PAT}", "Content-Type": "application/json", "User-Agent": "supabase-cli/2.0"},
    )
    return json.loads(urllib.request.urlopen(req).read().decode())


def lit(s):
    """literal SQL seguro (dollar-quoting)"""
    if s is None:
        return "NULL"
    return "$q$" + s + "$q$"


def upload(bucket, path, data):
    req = urllib.request.Request(
        f"{SUPA}/storage/v1/object/{bucket}/{path}", data=data, method="POST",
        headers={"Authorization": f"Bearer {SR}", "apikey": SR, "Content-Type": "image/gif", "x-upsert": "true"},
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.status


# 1) ids
existentes = {r["id"][:8]: r for r in sql("select id, nome, imagem_url from public.tb_exercicios")}
staging_ids = {r["id"] for r in sql("select id from staging.tb_exercicios")}
for e in E:
    if e["id"]:
        row = existentes.get(e["id"])
        if not row:
            raise SystemExit(f"id não encontrado: {e['id']} {e['nome']}")
        e["uuid"] = row["id"]
    else:
        e["uuid"] = str(uuid.uuid4())
    e["arquivo"] = os.path.join(OUT, slug(e["nome"]) + ".gif")
    if not os.path.exists(e["arquivo"]):
        raise SystemExit(f"gif faltando: {e['arquivo']}")

v = int(time.time())
novos, atualizados = 0, 0
for e in E:
    data = open(e["arquivo"], "rb").read()
    urls = {}
    for schema, bucket in BUCKETS.items():
        path = f"{e['uuid']}.gif"
        if not DRY:
            st = upload(bucket, path, data)
            if st not in (200, 201):
                raise SystemExit(f"upload falhou {bucket}/{path}: {st}")
        urls[schema] = f"{SUPA}/storage/v1/object/public/{bucket}/{path}?v={v}"

    for schema in ("public", "staging"):
        existe = (e["id"] is not None) and (schema == "public" or e["uuid"] in staging_ids)
        if existe:
            q = (f"update {schema}.tb_exercicios set nome={lit(e['nome'])}, subgrupo={lit(e['sub'])}, dica={lit(e['dica'])}, "
                 f"imagem_url={lit(urls[schema])} where id='{e['uuid']}' returning id")
        else:
            q = (f"insert into {schema}.tb_exercicios (id, nome, grupo_muscular, emoji, tipo, subgrupo, dica, imagem_url) values "
                 f"('{e['uuid']}', {lit(e['nome'])}, {lit(e['grupo'])}, {lit(e['emoji'])}, {lit(e['tipo'])}, {lit(e['sub'])}, {lit(e['dica'])}, {lit(urls[schema])}) "
                 f"on conflict (id) do update set nome=excluded.nome, subgrupo=excluded.subgrupo, dica=excluded.dica, imagem_url=excluded.imagem_url returning id")
        if not DRY:
            r = sql(q)
            if not r:
                raise SystemExit(f"sem retorno em {schema} para {e['nome']}")
    if e["id"]:
        atualizados += 1
    else:
        novos += 1
    print(("DRY " if DRY else "ok  ") + f"{e['nome']:45s} {e['uuid'][:8]} {'novo' if not e['id'] else 'upd '}")

# Agachamento na Máquina: mantém o GIF do Weslley, só subgrupo/dica
sub, dica = D["Agachamento na Máquina"]
for schema in ("public", "staging"):
    if not DRY:
        sql(f"update {schema}.tb_exercicios set subgrupo={lit(sub)}, dica={lit(dica)} where id::text like 'd06298a4%' returning id")
print("ok   Agachamento na Máquina (só subgrupo/dica; GIF existente mantido)")

print(f"\natualizados={atualizados} novos={novos}")
if not DRY:
    print("verificação:", sql(
        "select 'public' s, count(*) n, count(imagem_url) img, count(dica) dica, count(subgrupo) sub from public.tb_exercicios "
        "union all select 'staging', count(*), count(imagem_url), count(dica), count(subgrupo) from staging.tb_exercicios"))
    print("objetos:", sql("select bucket_id, count(*) from storage.objects where bucket_id like 'exercicios%' group by 1"))
