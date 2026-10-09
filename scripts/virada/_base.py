"""Physiq — base dos scripts da virada (scripts/virada/0N_*.py): acesso aos 2 bancos sem segredo no repositório.

  Banco do Treino (uxwpwdbbnlticxgtzcsb): psql pelo pooler de sessão com a senha em ~/.pgpass (TREINO_CONN sobrescreve).
  Banco principal (hkxvtsbwctxkrqzkkdoz): SQL pela Management API (PAT em ~/.pc-pat; a API exige User-Agent) e Auth pela
  API admin do GoTrue com a chave de servidor (secret "servidor_2026_10", lida na hora pela Management API — nunca gravada em
  arquivo; a service_role legada do Treino foi desligada em 04/10/2026 e a do principal sai na hml-16).

Os scripts são idempotentes, têm --dry-run e escrevem um relatório JSON. O staging só mexe em contas de teste (P26).
"""
from __future__ import annotations

import datetime as dt
import json
import os
import re
import subprocess
import urllib.error
import urllib.request
from functools import lru_cache
from pathlib import Path

TREINO_REF = "uxwpwdbbnlticxgtzcsb"
PRINCIPAL_REF = "hkxvtsbwctxkrqzkkdoz"
PRINCIPAL_URL = f"https://{PRINCIPAL_REF}.supabase.co"
UA = "physiq-unificado/1.0 (scripts/virada)"
TREINO_CONN = os.environ.get(
    "TREINO_CONN",
    "host=aws-1-us-east-1.pooler.supabase.com port=5432 dbname=postgres user=postgres.uxwpwdbbnlticxgtzcsb sslmode=require",
)
SCHEMAS = ("public", "staging")
_EMAIL_TESTE = re.compile(r"^[a-z0-9._+-]*teste[a-z0-9._+-]*@physiq(calc|nutri)\.app$")


def email_de_teste(email: str | None) -> bool:
    """A mesma regra da trocar-token e do pos-login (P26)."""
    e = (email or "").strip().lower()
    return e == "teste@teste.com" or bool(_EMAIL_TESTE.match(e))


def hoje_sp() -> str:
    return dt.datetime.now(dt.timezone(dt.timedelta(hours=-3))).date().isoformat()


def lit(valor) -> str:
    """Literal SQL seguro (texto entre aspas simples, com as aspas dobradas)."""
    if valor is None:
        return "null"
    if isinstance(valor, bool):
        return "true" if valor else "false"
    if isinstance(valor, (int, float)):
        return str(valor)
    if isinstance(valor, (list, tuple)):
        return "array[" + ",".join(lit(v) for v in valor) + "]::text[]" if valor else "array[]::text[]"
    return "'" + str(valor).replace("'", "''") + "'"


def pat() -> str:
    return Path.home().joinpath(".pc-pat").read_text(encoding="utf-8").strip()


def http(metodo: str, url: str, corpo=None, cab: dict | None = None, timeout: int = 120) -> tuple[int, object]:
    dados = None if corpo is None else json.dumps(corpo).encode("utf-8")
    h = {"User-Agent": UA}
    if corpo is not None:
        h["Content-Type"] = "application/json"
    h.update(cab or {})
    req = urllib.request.Request(url, data=dados, method=metodo, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            txt = r.read().decode("utf-8", "replace")
            status = r.status
    except urllib.error.HTTPError as e:
        txt = e.read().decode("utf-8", "replace")
        status = e.code
    try:
        return status, (json.loads(txt) if txt else None)
    except json.JSONDecodeError:
        return status, txt


def sql_principal(query: str) -> list:
    st, r = http("POST", f"https://api.supabase.com/v1/projects/{PRINCIPAL_REF}/database/query", {"query": query},
                 {"Authorization": f"Bearer {pat()}"}, timeout=300)
    if st not in (200, 201):
        raise RuntimeError(f"SQL principal HTTP {st}: {str(r)[:800]}")
    return r or []


def sql_treino(query: str) -> list:
    """SELECT no Banco do Treino → lista de dicts."""
    q = f"select coalesce(json_agg(_linha), '[]'::json) from ({query}) _linha"
    env = dict(os.environ, PATH=f"{Path.home()}/.local/bin:{os.environ.get('PATH', '')}")
    r = subprocess.run(["psql", TREINO_CONN, "-v", "ON_ERROR_STOP=1", "-Atc", q], capture_output=True, text=True, env=env, timeout=300)
    if r.returncode != 0:
        raise RuntimeError(f"psql: {r.stderr[:800]}")
    return json.loads(r.stdout.strip() or "[]")


def exec_treino(comando: str) -> str:
    env = dict(os.environ, PATH=f"{Path.home()}/.local/bin:{os.environ.get('PATH', '')}")
    r = subprocess.run(["psql", TREINO_CONN, "-v", "ON_ERROR_STOP=1", "-1", "-Atc", comando], capture_output=True, text=True, env=env, timeout=300)
    if r.returncode != 0:
        raise RuntimeError(f"psql: {r.stderr[:800]}")
    return r.stdout.strip()


# hml-16 (H-35): a chave de servidor dos scripts é a secret "servidor_2026_10" de cada projeto, no lugar das service_role legadas
# (JWT); a secret "default" fica só com as funções e o painel.
CHAVE_SERVIDOR = "servidor_2026_10"


@lru_cache(maxsize=None)
def chave_servidor(ref: str) -> str:
    st, lista = http("GET", f"https://api.supabase.com/v1/projects/{ref}/api-keys?reveal=true", cab={"Authorization": f"Bearer {pat()}"})
    if st != 200:
        raise RuntimeError(f"api-keys de {ref}: HTTP {st}")
    for k in lista:
        if k.get("type") == "secret" and k.get("name") == CHAVE_SERVIDOR and k.get("api_key"):
            return k["api_key"]
    raise RuntimeError(f"não achei a chave secret {CHAVE_SERVIDOR!r} no projeto {ref} (criar: POST /v1/projects/{ref}/api-keys "
                       f'{{"type": "secret", "name": "{CHAVE_SERVIDOR}"}})')


def _service_principal() -> str:
    return chave_servidor(PRINCIPAL_REF)


def admin_principal(metodo: str, caminho: str, corpo=None) -> tuple[int, object]:
    """API admin do GoTrue do principal (criar usuário sem senha e sem e-mail, juntar app_metadata)."""
    chave = _service_principal()
    return http(metodo, f"{PRINCIPAL_URL}/auth/v1/admin/{caminho.lstrip('/')}", corpo, {"apikey": chave, "Authorization": f"Bearer {chave}"})


def salvar_json(caminho: str | Path, dados) -> None:
    p = Path(caminho).expanduser()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(dados, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    os.chmod(p, 0o600)
