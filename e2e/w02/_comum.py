"""Physiq W2 — utilitários dos testes de ponta a ponta (sem segredo no repo: chaves pela Management API com ~/.pc-pat,
senhas das contas de teste em ~/.physiq-teste-<nome>, segredo do espelho em ~/.physiq-espelho-segredo)."""
import json
import os
import subprocess
import urllib.error
import urllib.request
from functools import lru_cache
from pathlib import Path

TREINO_REF = "uxwpwdbbnlticxgtzcsb"
PRINCIPAL_REF = "hkxvtsbwctxkrqzkkdoz"
TREINO_URL = f"https://{TREINO_REF}.supabase.co"
PRINCIPAL_URL = f"https://{PRINCIPAL_REF}.supabase.co"
UA = "physiq-unificado/1.0 (e2e-w02)"
TREINO_CONN = os.environ.get(
    "TREINO_CONN",
    "host=aws-1-us-east-1.pooler.supabase.com port=5432 dbname=postgres user=postgres.uxwpwdbbnlticxgtzcsb sslmode=require",
)


def pat() -> str:
    return Path.home().joinpath(".pc-pat").read_text(encoding="utf-8").strip()


class _SemRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: D401 - devolve o 30x como veio
        return None


_ABRIR_SEM_REDIRECT = urllib.request.build_opener(_SemRedirect)


def http(metodo: str, url: str, corpo=None, cab: dict | None = None, timeout: int = 60, seguir: bool = True) -> tuple[int, object, dict]:
    """seguir=False devolve o 30x (ex.: o 302 do /auth/v1/authorize) em vez de ir atrás do Location."""
    dados = None if corpo is None else (corpo if isinstance(corpo, bytes) else json.dumps(corpo).encode("utf-8"))
    h = {"User-Agent": UA}
    if corpo is not None and not isinstance(corpo, bytes):
        h["Content-Type"] = "application/json"
    h.update(cab or {})
    req = urllib.request.Request(url, data=dados, method=metodo, headers=h)
    abrir = urllib.request.urlopen if seguir else _ABRIR_SEM_REDIRECT.open
    try:
        with abrir(req, timeout=timeout) as r:
            txt = r.read().decode("utf-8", "replace")
            status, headers = r.status, dict(r.headers)
    except urllib.error.HTTPError as e:
        txt = e.read().decode("utf-8", "replace")
        status, headers = e.code, dict(e.headers)
    try:
        return status, (json.loads(txt) if txt else None), headers
    except json.JSONDecodeError:
        return status, txt, headers


@lru_cache(maxsize=None)
def chaves(ref: str) -> dict:
    st, lista, _ = http("GET", f"https://api.supabase.com/v1/projects/{ref}/api-keys?reveal=true", cab={"Authorization": f"Bearer {pat()}"})
    assert st == 200, (st, lista)
    return {k["name"]: k["api_key"] for k in lista}


def anon(ref: str) -> str:
    return chaves(ref)["anon"]


def service(ref: str) -> str:
    return chaves(ref)["service_role"]


def sql_mgmt(ref: str, query: str) -> list:
    st, r, _ = http("POST", f"https://api.supabase.com/v1/projects/{ref}/database/query", {"query": query}, {"Authorization": f"Bearer {pat()}"}, timeout=180)
    if st not in (200, 201):
        raise RuntimeError(f"SQL {ref} HTTP {st}: {str(r)[:500]}")
    return r or []


def sql_principal(query: str) -> list:
    return sql_mgmt(PRINCIPAL_REF, query)


def sql_treino(query: str) -> list:
    """Banco do Treino pelo psql (pooler + ~/.pgpass); devolve lista de dicts (JSON por linha)."""
    q = f"select coalesce(json_agg(t), '[]'::json) from ({query}) t"
    env = dict(os.environ, PATH=f"{Path.home()}/.local/bin:{os.environ.get('PATH', '')}")
    r = subprocess.run(["psql", TREINO_CONN, "-v", "ON_ERROR_STOP=1", "-Atc", q], capture_output=True, text=True, env=env, timeout=120)
    if r.returncode != 0:
        raise RuntimeError(f"psql: {r.stderr[:500]}")
    return json.loads(r.stdout.strip() or "[]")


def exec_treino(comando: str) -> None:
    env = dict(os.environ, PATH=f"{Path.home()}/.local/bin:{os.environ.get('PATH', '')}")
    r = subprocess.run(["psql", TREINO_CONN, "-v", "ON_ERROR_STOP=1", "-Atc", comando], capture_output=True, text=True, env=env, timeout=120)
    if r.returncode != 0:
        raise RuntimeError(f"psql: {r.stderr[:500]}")


def senha(nome: str) -> str:
    return Path.home().joinpath(f".physiq-teste-{nome}").read_text(encoding="utf-8").strip()


def login_senha(url: str, anon_key: str, email: str, senha_: str) -> dict:
    st, s, _ = http("POST", f"{url}/auth/v1/token?grant_type=password", {"email": email, "password": senha_}, {"apikey": anon_key})
    if st != 200:
        raise RuntimeError(f"login {email} em {url}: HTTP {st} {s}")
    return s


def login_principal(nome: str, email: str) -> dict:
    return login_senha(PRINCIPAL_URL, anon(PRINCIPAL_REF), email, senha(nome))


def espelho_segredo() -> str:
    return Path.home().joinpath(".physiq-espelho-segredo").read_text(encoding="utf-8").strip()


class Placar:
    def __init__(self) -> None:
        self.itens: list[tuple[bool, str]] = []

    def check(self, ok: bool, texto: str) -> bool:
        self.itens.append((bool(ok), texto))
        print(("✅ " if ok else "❌ ") + texto, flush=True)
        return bool(ok)

    def fim(self) -> int:
        falhas = [t for ok, t in self.itens if not ok]
        print(f"\n{len(self.itens) - len(falhas)}/{len(self.itens)} ok" + (f" — FALHAS: {falhas}" if falhas else ""))
        return 1 if falhas else 0
