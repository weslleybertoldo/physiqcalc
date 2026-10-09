"""Physiq W2 — utilitários dos testes de ponta a ponta (sem segredo no repo: chaves pela Management API com ~/.pc-pat,
senhas das contas de teste em ~/.physiq-teste-<nome>, segredo do espelho em ~/.physiq-espelho-segredo)."""
import json
import os
import subprocess
import sys
import time
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
    """As legadas pelo nome ("anon", "service_role") e as novas como "<tipo>:<nome>" ("publishable:default", "secret:…")."""
    st, lista, _ = http("GET", f"https://api.supabase.com/v1/projects/{ref}/api-keys?reveal=true", cab={"Authorization": f"Bearer {pat()}"})
    assert st == 200, (st, lista)
    return {(k["name"] if k.get("type") in (None, "legacy") else f'{k["type"]}:{k["name"]}'): k["api_key"] for k in lista}


# Troca das chaves LEGADAS (JWT): desligadas no Treino em 04/10/2026 (troca da chave vazada); no principal saem na hml-16 (H-35) →
# nos 2 projetos vão as novas: a publishable "default" no lugar da anon e a secret "servidor_2026_10" (a chave de servidor dos
# scripts e dos E2E; a secret "default" fica só com as funções e o painel) no lugar da service_role. Sem a chave, erro claro.
# As legadas seguem em chaves(ref) pelo nome ("anon", "service_role"), para as provas de que morreram.
CHAVE_PUBLICA = "publishable:default"
CHAVE_SERVIDOR = "secret:servidor_2026_10"


def _chave(ref: str, nome: str) -> str:
    valor = chaves(ref).get(nome)
    if valor:
        return valor
    tipo, rotulo = nome.split(":", 1)
    criar = f' — criar: POST /v1/projects/{ref}/api-keys {{"type": "secret", "name": "{rotulo}"}} (hml-16, H-35)' if tipo == "secret" else ""
    raise RuntimeError(f"a chave {tipo} {rotulo!r} não existe no projeto {ref} (Management API › api-keys){criar}")


def anon(ref: str) -> str:
    return _chave(ref, CHAVE_PUBLICA)


def service(ref: str) -> str:
    return _chave(ref, CHAVE_SERVIDOR)


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


def cab_login(url: str, anon_key: str) -> dict:
    """W28: com o captcha global do Auth do principal ligado, o login de TESTE por REST vai como servidor (a chave de servidor,
    service(); o GoTrue não submete o servidor ao captcha — o mesmo que a função entrar-senha faz depois de conferir o
    Turnstile). O Treino não tem captcha: segue com a chave pública."""
    if PRINCIPAL_REF in url or "api-principal." in url:
        sk = service(PRINCIPAL_REF)
        return {"apikey": sk, "Authorization": f"Bearer {sk}"}
    return {"apikey": anon_key}


def login_senha(url: str, anon_key: str, email: str, senha_: str) -> dict:
    st, s, _ = http("POST", f"{url}/auth/v1/token?grant_type=password", {"email": email, "password": senha_}, cab_login(url, anon_key))
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
        registrar_rodada(len(self.itens) - len(falhas), len(self.itens))
        return 1 if falhas else 0


# H-50 (hml-13): cada rodada fica registrada sozinha, FORA do repo (1 linha por rodada; o docs/e2e-rodadas.md recebe as linhas
# da worktree no fim dela). Nunca derruba o teste. Segredo não vai por argumento nos E2E (vem de ~/.physiq-* ou do ambiente).
REGISTRO = Path(os.environ.get("PHYSIQ_E2E_REGISTRO", str(Path.home() / "projetos/physiqcalc-scratch/e2e-rodadas.tsv")))


def registrar_rodada(ok: int, total: int) -> None:
    try:
        script = Path(sys.argv[0]).resolve()
        git = ["git", "-C", str(script.parent)]
        commit = subprocess.run(git + ["rev-parse", "--short", "HEAD"], capture_output=True, text=True, timeout=5).stdout.strip()
        branch = subprocess.run(git + ["rev-parse", "--abbrev-ref", "HEAD"], capture_output=True, text=True, timeout=5).stdout.strip()
        raiz = subprocess.run(git + ["rev-parse", "--show-toplevel"], capture_output=True, text=True, timeout=5).stdout.strip()
        rel = os.path.relpath(script, raiz) if raiz else script.name
        campos = [time.strftime("%Y-%m-%d %H:%M:%S"), branch, commit, rel, " ".join(sys.argv[1:]), f"{ok}/{total}"]
        REGISTRO.parent.mkdir(parents=True, exist_ok=True)
        with REGISTRO.open("a", encoding="utf-8") as f:
            f.write("\t".join(c.replace("\t", " ").replace("\n", " ") for c in campos) + "\n")
    except Exception:  # noqa: BLE001 — registro nunca derruba o teste
        pass
