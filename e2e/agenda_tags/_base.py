"""Physiq W2 (tags da agenda, 02/10/2026) — base dos testes de ponta a ponta do Painel › Agenda com TAGS e dos calendários iniciais.
Reaproveita a base da W1 (conta_unica: saúde do Banco do Treino, função COMO o JWT numa transação desfeita, sessão por link mágico)
e a da W5 (login por e-mail e senha no principal, troca de token, espelho, o navegador do Caso).

Contas de TESTE (staging; só *.teste.claude@physiqnutri.app — P26; senhas em ~/.physiq-teste-<nome>, criadas por massa.py):
  w2t-ambos     w2t.ambos.teste.claude@physiqnutri.app     "Ana Ambos W2" — dono + personal + nutricionista (o caso dele: a conta
                Treino + Nutrição com 1 profissional só) da "Studio Ambos W2"
  w2t-personal  w2t.personal.teste.claude@physiqnutri.app  "Paulo Personal W2" — dono + personal (só treino) da "Treino Paulo W2"
  w2t-aluno     w2t.aluno.teste.claude@physiqnutri.app     "Bia Aluna W2" — aluna com login na Studio Ambos (personal e nutri = Ana)
Sem segredo no repo: chaves pela Management API (~/.pc-pat).
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
_ESPEC = importlib.util.spec_from_file_location("_base_conta_unica", Path(__file__).parent.parent / "conta_unica" / "_base.py")
BC = importlib.util.module_from_spec(_ESPEC)
sys.modules["_base_conta_unica"] = BC
_ESPEC.loader.exec_module(BC)  # type: ignore[union-attr]
B5 = BC.B5

p = B5.p
ESTADO, CONTAS = B5.ESTADO, B5.CONTAS
http, service, anon, sql_principal = B5.http, B5.service, B5.anon, B5.sql_principal
PRINCIPAL_REF, PRINCIPAL_URL, TREINO_REF, API_P = B5.PRINCIPAL_REF, B5.PRINCIPAL_URL, B5.TREINO_REF, B5.API_P
saude_ok, como, rpc_token, sessao_magica = BC.saude_ok, BC.como, BC.rpc_token, BC.sessao_magica

AMBOS, PERSONAL, ALUNO = "w2t-ambos", "w2t-personal", "w2t-aluno"
EMAIL = {AMBOS: "w2t.ambos.teste.claude@physiqnutri.app", PERSONAL: "w2t.personal.teste.claude@physiqnutri.app",
         ALUNO: "w2t.aluno.teste.claude@physiqnutri.app"}
NOMES = {AMBOS: "Ana Ambos W2", PERSONAL: "Paulo Personal W2", ALUNO: "Bia Aluna W2"}
for _k in (AMBOS, PERSONAL, ALUNO):
    CONTAS[_k] = (EMAIL[_k], B5.senha_de(_k))
CONTA_AMBOS, CONTA_PERSONAL = "Studio Ambos W2", "Treino Paulo W2"
# a equipe da W13 no staging (o dono vendo as tags da equipe): Lucas dono + personal, Camila nutricionista
W13 = {"lucas": "w13.dono.teste.claude@physiqnutri.app", "camila": "w13.nutri.teste.claude@physiqnutri.app"}

PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "conta-unica-agenda" / "w2"
B5.PRINTS = PRINTS
SCRATCH = Path.home() / "projetos" / "physiqcalc-scratch" / "conta-unica-agenda" / "w2"
IDS = SCRATCH / "massa_ids.json"
DOWNLOADS = SCRATCH / "downloads"
TAG_BASE = {"treino": ("Treino", "#a78bfa"), "nutricao": ("Nutrição", "#34d399"), "geral": ("Geral", "#94a3b8")}


def schema() -> str:
    return ESTADO["schema"]


def q(valor) -> str:
    """Literal SQL de texto."""
    return "null" if valor is None else "'" + str(valor).replace("'", "''") + "'"


def uid(conta: str) -> str | None:
    email = EMAIL.get(conta) or W13.get(conta) or CONTAS[conta][0]
    r = sql_principal(f"select id::text as id from auth.users where lower(email) = {q(email)}")
    return r[0]["id"] if r else None


def ids() -> dict:
    return json.loads(IDS.read_text(encoding="utf-8"))


def token(conta: str) -> str:
    return B5.sessao(conta)["access_token"]


def rest(tok: str, caminho: str, metodo: str = "GET", corpo=None, schema_: str | None = None) -> tuple[int, object]:
    """A REST do principal COMO a pessoa (o caminho do app: RLS de verdade)."""
    s = schema_ or schema()
    cab = {"apikey": anon(PRINCIPAL_REF), "Authorization": f"Bearer {tok}", "Accept-Profile": s, "Content-Profile": s, "Prefer": "return=representation"}
    st, r, _ = http(metodo, f"{PRINCIPAL_URL}/rest/v1/{caminho}", corpo, cab, timeout=90)
    return st, r


def tags_de(prof: str, vivas: bool = True) -> list[dict]:
    return sql_principal(f"""select id::text, nome, cor, area, base, ordem, deleted_at from {schema()}.agenda_tags
                             where profissional_id = {q(prof)} {'and deleted_at is null' if vivas else ''} order by ordem, created_at""")


def base_de(prof: str, area: str) -> str | None:
    r = sql_principal(f"select id::text from {schema()}.agenda_tags where profissional_id = {q(prof)} and base and area = {q(area)}")
    return r[0]["id"] if r else None


def baixar(pg, clicar, nome: str) -> Path | None:
    DOWNLOADS.mkdir(parents=True, exist_ok=True)
    try:
        with pg.expect_download(timeout=60000) as d:
            clicar()
        destino = DOWNLOADS / f"{nome}_{d.value.suggested_filename}"
        d.value.save_as(str(destino))
        return destino
    except Exception as e:  # noqa: BLE001
        print(f"   download falhou: {e}", flush=True)
        return None
