#!/usr/bin/env python3
"""Physiq H3 — publica os ícones e a logo dos e-mails (supabase-principal/email/v1/*.png) no bucket público "email" do banco
principal (criado pela migração 20261001150000_h3_email_icones.sql). Idempotente: arquivo que já está lá igual (mesmo tamanho
e image/png na URL pública) é pulado; o resto sobe com x-upsert.

Uso:
  python3 scripts/email/publicar_icones_email.py --dry-run   # só mostra o que faria
  python3 scripts/email/publicar_icones_email.py             # publica e confere a URL pública de cada um

URL pública (a que o molde usa): https://api-principal.physiqcalc.com.br/storage/v1/object/public/email/v1/<arquivo>.png
Credenciais: PAT pessoal em ~/.pc-pat → a chave de servidor (secret "servidor_2026_10"; a service_role legada sai na hml-16)
pela Management API (nunca gravada em arquivo). A Management API exige User-Agent.
"""
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

REF = os.environ.get("PRINCIPAL_REF") or "hkxvtsbwctxkrqzkkdoz"
UA = "physiq-unificado/1.0 (publicar_icones_email)"
PASTA = Path(__file__).resolve().parent.parent.parent / "supabase-principal" / "email" / "v1"
ORIGEM = f"https://{REF}.supabase.co"
PUBLICO = "https://api-principal.physiqcalc.com.br/storage/v1/object/public/email/v1"
CACHE = "max-age=604800"
CHAVE_SERVIDOR = "servidor_2026_10"  # a chave de servidor dos scripts (hml-16, H-35); a secret "default" fica só com as funções


def pedir(metodo: str, url: str, corpo: bytes | None = None, cab: dict | None = None) -> tuple[int, bytes, dict]:
    req = urllib.request.Request(url, data=corpo, method=metodo, headers={"User-Agent": UA, **(cab or {})})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read(), dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read(), dict(e.headers)


def chave_servidor() -> str:
    pat = Path.home().joinpath(".pc-pat").read_text(encoding="utf-8").strip()
    st, corpo, _ = pedir("GET", f"https://api.supabase.com/v1/projects/{REF}/api-keys?reveal=true", cab={"Authorization": f"Bearer {pat}"})
    if st != 200:
        raise SystemExit(f"api-keys: HTTP {st} {corpo[:300]!r}")
    for k in json.loads(corpo):
        if k.get("type") == "secret" and k.get("name") == CHAVE_SERVIDOR and k.get("api_key"):
            return k["api_key"]
    raise SystemExit(f"não achei a chave secret {CHAVE_SERVIDOR!r} no projeto {REF} (criar: POST /v1/projects/{REF}/api-keys "
                     f'{{"type": "secret", "name": "{CHAVE_SERVIDOR}"}})')


def publico_igual(nome: str, tamanho: int) -> bool:
    st, _, cab = pedir("HEAD", f"{PUBLICO}/{nome}")
    cab = {k.lower(): v for k, v in cab.items()}
    return st == 200 and cab.get("content-type", "").startswith("image/png") and cab.get("content-length") == str(tamanho)


def main() -> None:
    dry = "--dry-run" in sys.argv[1:]
    arquivos = sorted(PASTA.glob("*.png"))
    if not arquivos:
        raise SystemExit(f"nenhum PNG em {PASTA}")
    chave = None if dry else chave_servidor()
    subiu = pulou = 0
    for arq in arquivos:
        dados = arq.read_bytes()
        if publico_igual(arq.name, len(dados)):
            print(f"igual   {arq.name} ({len(dados)} B)")
            pulou += 1
            continue
        if dry:
            print(f"subiria {arq.name} ({len(dados)} B)")
            continue
        st, corpo, _ = pedir("POST", f"{ORIGEM}/storage/v1/object/email/v1/{arq.name}", dados, {
            "Authorization": f"Bearer {chave}", "apikey": chave, "Content-Type": "image/png", "x-upsert": "true", "cache-control": CACHE,
        })
        if st not in (200, 201):
            raise SystemExit(f"{arq.name}: HTTP {st} {corpo[:300]!r}")
        if not publico_igual(arq.name, len(dados)):
            raise SystemExit(f"{arq.name}: subiu, mas a URL pública não devolve o PNG igual")
        print(f"subiu   {arq.name} ({len(dados)} B) → {PUBLICO}/{arq.name}")
        subiu += 1
    print(f"{'(dry-run) ' if dry else ''}{len(arquivos)} arquivos · {subiu} publicados · {pulou} já iguais")


if __name__ == "__main__":
    main()
