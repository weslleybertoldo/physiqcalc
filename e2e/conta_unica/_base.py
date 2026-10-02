"""Physiq W1 (conta única, 02/10/2026) — base dos testes de ponta a ponta da junção das 2 contas de um profissional
(scripts/conta_unica/juntar_contas.py). Reaproveita a base da W5 (sessão por e-mail e senha no principal pelo cab_login — o captcha
global da W28 —, troca de token, espelho, o navegador do Caso) e o padrão da W16b (função COMO o JWT, numa transação desfeita).

Contas de TESTE (staging; só *.teste.claude@physiqnutri.app — P26; senhas em ~/.physiq-teste-<nome>, criadas por massa.py):
  w1u-prof   w1u.prof.teste.claude@physiqnutri.app   "Pedro Único W1" — o papel do profissional das 2 contas: dono + personal da
             "Calc Único W1" (legado_calc, Só Treino, isenta, faixa livre) e dono + nutricionista da "Nutri Único W1" (legado_nutri,
             Só Nutrição, isenta, faixa livre)
  w1u-aluno  w1u.aluno.teste.claude@physiqnutri.app  "Alice Única W1" — aluna com login matriculada nas 2 (o caso P7)
Sem segredo no repo: chaves pela Management API (~/.pc-pat).
"""
from __future__ import annotations

import importlib.util
import json
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
_ESPEC = importlib.util.spec_from_file_location("_base_w05", Path(__file__).parent.parent / "w05" / "_base.py")
B5 = importlib.util.module_from_spec(_ESPEC)
sys.modules["_base_w05"] = B5
_ESPEC.loader.exec_module(B5)  # type: ignore[union-attr]

p = B5.p
ESTADO, CONTAS = B5.ESTADO, B5.CONTAS
http, service, anon = B5.http, B5.service, B5.anon
sql_principal, sql_treino, exec_treino = B5.sql_principal, B5.sql_treino, B5.exec_treino
PRINCIPAL_REF, PRINCIPAL_URL, TREINO_REF, API_P = B5.PRINCIPAL_REF, B5.PRINCIPAL_URL, B5.TREINO_REF, B5.API_P
Caso = B5.Caso

PROF, ALUNO = "w1u-prof", "w1u-aluno"
EMAIL = {PROF: "w1u.prof.teste.claude@physiqnutri.app", ALUNO: "w1u.aluno.teste.claude@physiqnutri.app"}
NOMES = {PROF: "Pedro Único W1", ALUNO: "Alice Única W1"}
for _k in (PROF, ALUNO):
    CONTAS[_k] = (EMAIL[_k], B5.senha_de(_k))
CONTA_CALC, CONTA_NUTRI = "Calc Único W1", "Nutri Único W1"
COD_CALC, COD_NUTRI = "PROF-W1U-CALC", "PROF-W1U-NUTRI"
PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "conta-unica-agenda" / "w1"
B5.PRINTS = PRINTS
SCRATCH = Path.home() / "projetos" / "physiqcalc-scratch" / "conta-unica-agenda" / "w1"
IDS = SCRATCH / "massa_ids.json"


def schema() -> str:
    return ESTADO["schema"]


def q(valor) -> str:
    """Literal SQL de texto."""
    return "null" if valor is None else "'" + str(valor).replace("'", "''") + "'"


def saude_ok(rotulo: str) -> None:
    """/health do Banco do Treino (VM Nano) antes de cada bloco: UNHEALTHY ou lento (> 10 s) → PARA (sem reiniciar nada)."""
    t0 = time.time()
    st, r, _ = http("GET", f"https://api.supabase.com/v1/projects/{TREINO_REF}/health?services=db&services=auth&services=rest",
                    cab={"Authorization": f"Bearer {_pat()}"}, timeout=30)
    dt_ = time.time() - t0
    ok = st == 200 and isinstance(r, list) and all(x.get("healthy") for x in r)
    print(f"   /health do Treino antes de {rotulo}: {'ok' if ok else r} ({dt_:.1f} s)", flush=True)
    if not ok or dt_ > 10:
        raise SystemExit(f"Banco do Treino UNHEALTHY ou lento antes de {rotulo} — parei (não reinicio nada)")


def _pat() -> str:
    return (Path.home() / ".pc-pat").read_text(encoding="utf-8").strip()


def uid(conta: str) -> str | None:
    r = sql_principal(f"select id::text as id from auth.users where lower(email) = {q(EMAIL.get(conta, CONTAS[conta][0]))}")
    return r[0]["id"] if r else None


def ids() -> dict:
    return json.loads(IDS.read_text(encoding="utf-8"))


def _resultado(query: str) -> dict:
    """Manda o bloco pela Management API e tira o JSON da exceção W1_RESULTADO (o bloco é desfeito: nada fica gravado)."""
    st, r, _ = http("POST", f"https://api.supabase.com/v1/projects/{PRINCIPAL_REF}/database/query", {"query": query},
                    {"Authorization": f"Bearer {_pat()}"}, timeout=180)
    txt = r.get("message", "") if isinstance(r, dict) else str(r)
    i = txt.find("W1_RESULTADO ")
    if i < 0:
        raise RuntimeError(f"o bloco não devolveu resultado (HTTP {st}): {str(r)[:1200]}")
    obj, _ = json.JSONDecoder().raw_decode(txt[i + len("W1_RESULTADO "):])
    return obj


def como(user_id: str, schema_: str, fn_sql: str) -> object:
    """Chama uma função COMO a pessoa (role authenticated + request.jwt.claims, igual ao PostgREST), numa transação DESFEITA:
    nenhuma sessão nasce, nada fica gravado (o jeito de conferir as contas reais em produção só lendo)."""
    u = sql_principal(f"select email, coalesce(raw_app_meta_data, '{{}}'::jsonb) as app from auth.users where id = {q(user_id)}::uuid")
    if not u:
        raise RuntimeError(f"login {user_id} não existe")
    # as claims do JWT de verdade (o papel de master mora em app_metadata.role — eh_master() lê dali)
    claims = json.dumps({"sub": user_id, "role": "authenticated", "aud": "authenticated", "email": u[0]["email"], "app_metadata": u[0]["app"]})
    sql = f"""do $w1c$ declare r jsonb; begin
      perform set_config('request.jwt.claims', {q(claims)}, true);
      perform set_config('request.jwt.claim.sub', {q(user_id)}, true);
      perform set_config('role', 'authenticated', true);
      execute 'select to_jsonb(x) from (select ' || {q(fn_sql.replace('{s}', schema_))} || ' as v) x' into r;
      raise exception 'W1_RESULTADO %', (r -> 'v')::text;
    end $w1c$;"""
    return _resultado(sql)


def rpc_token(token: str, fn: str, args: dict | None = None, schema_: str | None = None) -> tuple[int, object]:
    """Função do principal pelo PostgREST com o JWT da pessoa (o caminho do app)."""
    s = schema_ or schema()
    st, r, _ = http("POST", f"{PRINCIPAL_URL}/rest/v1/rpc/{fn}", args or {},
                    {"apikey": anon(PRINCIPAL_REF), "Authorization": f"Bearer {token}", "Content-Profile": s, "Accept-Profile": s}, timeout=90)
    return st, r


def sessao_magica(email: str) -> dict:
    """Sessão SEM senha e SEM e-mail: link mágico gerado pela API admin (service role) e verificado na hora (só para leitura/prints)."""
    sp = service(PRINCIPAL_REF)
    st, r, _ = http("POST", f"{PRINCIPAL_URL}/auth/v1/admin/generate_link", {"type": "magiclink", "email": email},
                    {"apikey": sp, "Authorization": f"Bearer {sp}"})
    assert st == 200 and isinstance(r, dict), (st, str(r)[:200])
    th = r.get("hashed_token") or (r.get("properties") or {}).get("hashed_token")
    st, s, _ = http("POST", f"{PRINCIPAL_URL}/auth/v1/verify", {"type": "magiclink", "token_hash": th}, {"apikey": anon(PRINCIPAL_REF)})
    assert st == 200 and isinstance(s, dict) and s.get("access_token"), (st, str(s)[:200])
    return s


def processar_espelho(rodadas: int = 6) -> list[dict]:
    return B5.processar_espelho(rodadas)
