#!/usr/bin/env python3
"""Publica SÓ os exercícios marcados como "novo" em escolhas.json:
upload v2out/<slug>.gif → buckets exercicios (public) e exercicios-staging como <uuid>.gif (upsert)
e UPDATE imagem_url (com ?v=<ts>) em public e staging. Os "atual" não são tocados.
  SUPABASE_PAT=... SUPABASE_SERVICE_ROLE=... python3 publicar_escolhidos.py v2out [--dry]"""
import json, os, sys, time, urllib.request, re, unicodedata

PAT = os.environ["SUPABASE_PAT"]; SR = os.environ["SUPABASE_SERVICE_ROLE"]
REF = "uxwpwdbbnlticxgtzcsb"; SUPA = f"https://{REF}.supabase.co"
OUT = sys.argv[1]; DRY = "--dry" in sys.argv
BUCKETS = {"public": "exercicios", "staging": "exercicios-staging"}


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")

def sql(q):
    req = urllib.request.Request(f"https://api.supabase.com/v1/projects/{REF}/database/query", data=json.dumps({"query": q}).encode(),
                                 headers={"Authorization": f"Bearer {PAT}", "Content-Type": "application/json", "User-Agent": "supabase-cli/2.0"})
    return json.loads(urllib.request.urlopen(req).read().decode())

def upload(bucket, path, data):
    req = urllib.request.Request(f"{SUPA}/storage/v1/object/{bucket}/{path}", data=data, method="POST",
                                 headers={"Authorization": f"Bearer {SR}", "apikey": SR, "Content-Type": "image/gif", "x-upsert": "true"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.status


esc = json.load(open(os.path.join(OUT, "escolhas.json")))
atuais = json.load(open(os.path.join(OUT, "atuais.json")))
# validação
faltam = [n for n in esc if n not in atuais]
assert not faltam, f"nomes sem linha no catálogo: {faltam}"
novos = [n for n, v in esc.items() if v == "novo"]
for n in novos:
    assert os.path.exists(os.path.join(OUT, slug(n) + ".gif")), f"gif faltando: {n}"
antes_atual = {n: sql(f"select imagem_url from public.tb_exercicios where id='{atuais[n]['id']}'")[0]["imagem_url"] for n, v in esc.items() if v == "atual"}
print(f"validação OK: {len(esc)} decididos, {len(novos)} novo, {len(esc)-len(novos)} atual")

v = int(time.time())
for n in novos:
    uid = atuais[n]["id"]; data = open(os.path.join(OUT, slug(n) + ".gif"), "rb").read()
    for schema, bucket in BUCKETS.items():
        path = f"{uid}.gif"
        url = f"{SUPA}/storage/v1/object/public/{bucket}/{path}?v={v}"
        if not DRY:
            st = upload(bucket, path, data)
            assert st in (200, 201), f"upload {bucket}/{path} -> {st}"
            r = sql(f"update {schema}.tb_exercicios set imagem_url='{url}' where id='{uid}' returning id")
            assert r, f"update sem linha em {schema}: {n}"
    print(("DRY " if DRY else "ok  ") + f"{n:45s} {uid[:8]} {len(data)//1024} KB")

if not DRY:
    depois_atual = {n: sql(f"select imagem_url from public.tb_exercicios where id='{atuais[n]['id']}'")[0]["imagem_url"] for n in antes_atual}
    intocados = all(antes_atual[n] == depois_atual[n] for n in antes_atual)
    print("atuais intocados:", intocados)
    chk = sql(f"select count(*) n from public.tb_exercicios where imagem_url like '%?v={v}'")[0]["n"]
    chk2 = sql(f"select count(*) n from staging.tb_exercicios where imagem_url like '%?v={v}'")[0]["n"]
    print(f"linhas com v={v}: public={chk} staging={chk2} (esperado {len(novos)})")
