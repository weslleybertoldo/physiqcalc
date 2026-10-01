"""Physiq W16b — base dos testes de ponta a ponta da trava de e-mail/CPF repetido entre alunos (pacientes) e da reprodução da
desativação de 01/10 00:10:58 UTC. Reaproveita a base da W16 (que já traz W15/W14/W13 e a W5: sessão por senha, RPC como a pessoa,
funções do principal, Playwright com contexto limpo).

Contas de TESTE da W16b (staging; SÓ *.teste.claude@physiqnutri.app — P26; senhas em ~/.physiq-teste-<nome>):
  w16b-app       w16b.app.teste.claude@physiqnutri.app       "Wagner App W16b" — aluno do app sem profissional (o papel da
                                                              matrícula do app desativada em produção)
  w16b-paciente  w16b.paciente.teste.claude@physiqnutri.app  "Bruna Paciente W16b" — login criado pela nutri no site antigo
                                                              (o papel do OUTRO login, dono do paciente que recebeu o e-mail)
  nutri-legado   nutri.teste.claude@physiqnutri.app           nutricionista do site antigo (conta legado_nutri no staging)
A "Consultoria Ferreira W13" (Lucas dono + personal, Camila nutri) é a conta das telas do painel (Novo aluno, Dados, convite, /c/).
Sem segredo no repo: chaves pela Management API (~/.pc-pat).
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
_ESPEC = importlib.util.spec_from_file_location("_base_w16", Path(__file__).parent.parent / "w16" / "_base.py")
B16 = importlib.util.module_from_spec(_ESPEC)
sys.modules["_base_w16"] = B16
_ESPEC.loader.exec_module(B16)  # type: ignore[union-attr]
B15, B14, B13, B5 = B16.B15, B16.B14, B16.B13, B16.B5

p = B16.p
ESTADO, CONTAS, EMAIL, NOMES = B16.ESTADO, B16.CONTAS, B16.EMAIL, B16.NOMES
Caso, sql_principal, sql_treino, saude_treino = B16.Caso, B16.sql_principal, B16.sql_treino, B16.saude_treino
http, service, anon, rpc, uid, sessao, token = B16.http, B16.service, B16.anon, B16.rpc, B16.uid, B16.sessao, B16.token
PRINCIPAL_REF, PRINCIPAL_URL, API_P, API_T, TREINO_REF = B16.PRINCIPAL_REF, B16.PRINCIPAL_URL, B16.API_P, B16.API_T, B16.TREINO_REF
conta_de, NOME_CONTA, conta_w13 = B16.conta_de, B16.NOME_CONTA, B16.conta_w13
saude_ok, esperar, json_arquivo = B16.saude_ok, B16.esperar, B16.json_arquivo
PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "w16b"
for _b in (B16, B15, B14, B13, B5, B13.B12, B13.B12.B11, B13.B12.B10, B13.B12.B8, B13.B12.B7):
    _b.PRINTS = PRINTS
SCRATCH = Path.home() / "projetos" / "physiqcalc-scratch" / "w16b"

EMAIL.update({
    "w16b-app": "w16b.app.teste.claude@physiqnutri.app",
    "w16b-paciente": "w16b.paciente.teste.claude@physiqnutri.app",
})
NOMES.update({"w16b-app": "Wagner App W16b", "w16b-paciente": "Bruna Paciente W16b"})
for _k in ("w16b-app", "w16b-paciente"):
    CONTAS[_k] = (EMAIL[_k], B5.senha_de(_k))
NUTRI_LEGADO = "nutri-legado"  # nutri.teste.claude@physiqnutri.app (CONTAS da W5)

# códigos de erro da trava (o gatilho do banco e as funções devolvem estes textos — o site antigo do Nutri usa os mesmos na H1)
ERRO_EMAIL = "paciente_email_repetido"
ERRO_CPF = "paciente_cpf_repetido"


def schema() -> str:
    return ESTADO["schema"]


def rest_como(conta_ou_token: str, metodo: str, caminho: str, corpo=None, prefer: str = "return=representation") -> tuple[int, object]:
    """PostgREST do principal COMO a pessoa (é assim que o site antigo do Nutri grava: direto na tabela)."""
    tok = sessao(conta_ou_token)["access_token"] if conta_ou_token in CONTAS else conta_ou_token
    cab = {"apikey": anon(PRINCIPAL_REF), "Authorization": f"Bearer {tok}", "Accept-Profile": schema(), "Content-Profile": schema(),
           "Prefer": prefer, "Referer": "https://physiqnutri-staging.vercel.app/"}
    st, r, _ = http(metodo, f"{PRINCIPAL_URL}/rest/v1/{caminho}", corpo, cab)
    return st, r


def _resultado(query: str) -> dict:
    """Manda o bloco pela Management API e tira o JSON da exceção W16B_RESULTADO (sem cortar a mensagem, como o sql_principal faz)."""
    st, r, _ = http("POST", f"https://api.supabase.com/v1/projects/{PRINCIPAL_REF}/database/query", {"query": query},
                    {"Authorization": f"Bearer {_pat()}"}, timeout=180)
    txt = r.get("message", "") if isinstance(r, dict) else str(r)  # o corpo do erro já vem decodificado (dict)
    i = txt.find("W16B_RESULTADO ")
    if i < 0:
        raise RuntimeError(f"o bloco não devolveu resultado (HTTP {st}): {str(r)[:1500]}")
    obj, _ = json.JSONDecoder().raw_decode(txt[i + len("W16B_RESULTADO "):])
    return obj


def _pat() -> str:
    return (Path.home() / ".pc-pat").read_text(encoding="utf-8").strip()


def como_claims(claims: dict, corpo_sql: str) -> dict:
    """Roda um bloco PL/pgSQL COMO um JWT (role authenticated + request.jwt.claims), igual ao PostgREST, numa transação DESFEITA:
    o resultado volta na mensagem da exceção (nada fica gravado). `corpo_sql` monta `r jsonb`."""
    sql = f"""do $w16b$ declare r jsonb := '{{}}'::jsonb; begin
      perform set_config('request.jwt.claims', '{json.dumps(claims)}', true);
      perform set_config('role', 'authenticated', true);
      {corpo_sql}
      raise exception 'W16B_RESULTADO %', r::text;
    end $w16b$;"""
    return _resultado(sql)


def dryrun(corpo_sql: str) -> dict:
    """Bloco PL/pgSQL como `postgres` (dono), numa transação DESFEITA; `corpo_sql` monta `r jsonb`."""
    return _resultado(f"do $w16b$ declare r jsonb := '{{}}'::jsonb; begin {corpo_sql} raise exception 'W16B_RESULTADO %', r::text; end $w16b$;")
