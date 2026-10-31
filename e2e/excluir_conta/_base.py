"""Physiq — E2E do "Excluir minha conta" que tem que funcionar sempre (agente F, 31/10/2026). Base dos testes.

Os 2 defeitos (achados pelo agente E na limpeza das contas de teste, 31/10):
  1. aluno com 2 matrículas VIVAS com o mesmo e-mail (o aluno do app que entrou na lista de um profissional: a do app fica inativa,
     mas viva) → o hard delete do login passa pelo "on delete set null" do pacientes.user_id e o gatilho pacientes_unicos_email_cpf
     vê as 2 como pessoas diferentes → paciente_email_repetido → 500 e o login fica;
  2. quem já foi membro de equipe (linha "removido" em conta_membros) pelo caminho do ALUNO → o "set null" do conta_membros.user_id
     quebra o CHECK conta_membros_pessoa_ou_convite → 500 e o login fica.

Contas: SÓ temporárias `f<rodada>.<papel>.teste.claude@physiqcalc.com.br` (a regra de conta de teste desde 31/10:
`*teste*@physiqcalc.com.br` — e2e/CONTAS_DE_TESTE.md), criadas pela API admin do Auth (email_confirm: true — não manda e-mail) e
apagadas no fim pelo PRÓPRIO "Excluir minha conta". Senha aleatória em ~/.physiq-teste-f-<rodada>-<papel> (600), nunca impressa.
SQL: SÓ LEITURA (`set transaction read only` na frente — escrita vira erro do Postgres). Tudo o que muda dado vai pelos caminhos do
app: o Auth admin, as RPCs como a pessoa (PostgREST com o JWT dela) e as funções (pos-login, vincular-aluno, trocar-token,
excluir-minha-conta).
"""
from __future__ import annotations

import json
import re
import secrets
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True  # o _comum da w02 não deixa __pycache__ na árvore
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "w02"))
import _comum as C  # noqa: E402

PRINCIPAL_URL, TREINO_URL, PRINCIPAL_REF, TREINO_REF = C.PRINCIPAL_URL, C.TREINO_URL, C.PRINCIPAL_REF, C.TREINO_REF
API_T = "https://api.physiqcalc.com.br"
ORIGEM = {"staging": "https://physiqcalc-staging.vercel.app", "public": "https://physiqcalc.com.br"}
ESTADO_DIR = Path.home() / "projetos" / "physiqcalc-scratch" / "excluir-conta" / "e2e"
# só as MINHAS contas temporárias: f<rodada>.<papel>.teste.claude@physiqcalc.com.br
RE_MINHA = re.compile(r"^f[0-9]+[a-z]?\.[a-z0-9]+\.teste\.claude@physiqcalc\.com\.br$")
RE_TESTE = re.compile(r"^[a-z0-9._+-]*teste[a-z0-9._+-]*@physiqcalc\.com\.br$")  # a regra do app (src/nucleo/contasTeste.ts)
p = C.Placar()


def email_de(rodada: str, papel: str) -> str:
    e = f"{rodada}.{papel}.teste.claude@physiqcalc.com.br".lower()
    if not (RE_MINHA.match(e) and RE_TESTE.match(e)):
        raise SystemExit(f"não é conta temporária do F: {e}")
    return e


def senha(rodada: str, papel: str) -> str:
    arq = Path.home() / f".physiq-teste-f-{rodada}-{papel}"
    if not arq.exists():
        arq.write_text(secrets.token_urlsafe(18), encoding="utf-8")
    arq.chmod(0o600)
    return arq.read_text(encoding="utf-8").strip()


def apagar_senha(rodada: str, papel: str) -> None:
    (Path.home() / f".physiq-teste-f-{rodada}-{papel}").unlink(missing_ok=True)


# ───────────────────────── SQL só leitura ─────────────────────────
def ro(query: str) -> list:
    return C.sql_principal("set transaction read only; " + query)


def ro_treino(query: str) -> list:
    return C.sql_mgmt(TREINO_REF, "set transaction read only; " + query)


def um(query: str) -> dict:
    r = ro(query)
    return r[0] if r else {}


# ───────────────────────── Auth (API admin) e sessões ─────────────────────────
def _admin() -> dict:
    sp = C.service(PRINCIPAL_REF)
    return {"apikey": sp, "Authorization": f"Bearer {sp}"}


def login_por_email(email: str) -> dict | None:
    r = ro(f"select id::text as id, deleted_at is not null as soft from auth.users where lower(email) = '{email}'")
    return r[0] if r else None


def criar_login(rodada: str, papel: str, nome: str) -> str:
    """Cria o login temporário (ou reaproveita o MEU de uma rodada anterior desta mesma rodada) — nunca outro."""
    email = email_de(rodada, papel)
    achado = login_por_email(email)
    if achado:
        if achado["soft"]:
            raise SystemExit(f"{email} já foi excluído (soft) — use outra rodada")
        st, r, _ = C.http("PUT", f"{PRINCIPAL_URL}/auth/v1/admin/users/{achado['id']}", {"password": senha(rodada, papel), "email_confirm": True}, _admin())
        assert st == 200, (st, str(r)[:200])
        return achado["id"]
    st, r, _ = C.http("POST", f"{PRINCIPAL_URL}/auth/v1/admin/users",
                      {"email": email, "password": senha(rodada, papel), "email_confirm": True, "user_metadata": {"full_name": nome}}, _admin())
    assert st == 200 and isinstance(r, dict) and r.get("id"), (st, str(r)[:200])
    return r["id"]


def sessao(rodada: str, papel: str) -> dict:
    """Login por e-mail e senha (como servidor: o captcha do Auth não vale para a chave de servidor — o mesmo dos E2E da W28)."""
    email = email_de(rodada, papel)
    for tentativa in range(4):
        try:
            s = C.login_senha(PRINCIPAL_URL, C.anon(PRINCIPAL_REF), email, senha(rodada, papel))
            if s.get("access_token"):
                return s
        except RuntimeError as e:
            if "429" not in str(e) and "522" not in str(e):
                raise
        time.sleep(5 * (tentativa + 1))
    raise RuntimeError(f"sem sessão para {email}")


def sair_local(token: str) -> int:
    st, _, _ = C.http("POST", f"{PRINCIPAL_URL}/auth/v1/logout?scope=local", {}, {"apikey": C.anon(PRINCIPAL_REF), "Authorization": f"Bearer {token}"})
    return st


# ───────────────────────── o app (como a pessoa) ─────────────────────────
def rpc(token: str, schema: str, fn: str, args: dict | None = None) -> tuple[int, object]:
    st, r, _ = C.http("POST", f"{PRINCIPAL_URL}/rest/v1/rpc/{fn}", args or {},
                      {"apikey": C.anon(PRINCIPAL_REF), "Authorization": f"Bearer {token}", "Content-Profile": schema, "Accept-Profile": schema})
    return st, r


def funcao(token: str, schema: str, nome: str, corpo: dict, timeout: int = 150) -> tuple[int, dict]:
    st, r, _ = C.http("POST", f"{PRINCIPAL_URL}/functions/v1/{nome}", corpo,
                      {"apikey": C.anon(PRINCIPAL_REF), "Authorization": f"Bearer {token}", "x-schema": schema, "Origin": ORIGEM[schema]},
                      timeout=timeout)
    return st, (r if isinstance(r, dict) else {"_texto": str(r)[:300]})


def trocar_token(token: str, schema: str) -> tuple[int, dict]:
    """A troca de token do app (o login do principal → a sessão do Banco do Treino): cria o login e o vínculo de lá."""
    st, r, _ = C.http("POST", f"{API_T}/functions/v1/trocar-token", {}, {"Authorization": f"Bearer {token}", "x-schema": schema,
                      "Origin": ORIGEM[schema]}, timeout=90)
    return st, (r if isinstance(r, dict) else {})


def saude(schema: str) -> bool:
    """/health dos 2 projetos (o Treino é uma VM pequena: travou em 10/10 com carga) — lento ou ruim → para."""
    ok = True
    for ref in (PRINCIPAL_REF, TREINO_REF):
        t0 = time.time()
        st, r, _ = C.http("GET", f"https://api.supabase.com/v1/projects/{ref}/health?services=db&services=auth&services=rest", None,
                          {"Authorization": f"Bearer {C.pat()}"}, timeout=30)
        dt_ = time.time() - t0
        bom = st == 200 and isinstance(r, list) and all(x.get("status") == "ACTIVE_HEALTHY" for x in r) and dt_ < 10
        print(f"   /health {ref[:6]}: {st} {[x.get('status') for x in r] if isinstance(r, list) else r} em {dt_:.1f} s", flush=True)
        ok = ok and bom
    return ok


# ───────────────────────── estado da rodada (ids, nunca segredo) ─────────────────────────
def arquivo_estado(schema: str, rodada: str) -> Path:
    return ESTADO_DIR / f"{schema}_{rodada}.json"


def ler_estado(schema: str, rodada: str) -> dict:
    a = arquivo_estado(schema, rodada)
    return json.loads(a.read_text(encoding="utf-8")) if a.exists() else {}


def gravar_estado(schema: str, rodada: str, est: dict) -> None:
    a = arquivo_estado(schema, rodada)
    a.parent.mkdir(parents=True, exist_ok=True)
    a.write_text(json.dumps(est, ensure_ascii=False, indent=1, default=str), encoding="utf-8")


def json_arquivo(caminho: Path, dados) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text(json.dumps(dados, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
