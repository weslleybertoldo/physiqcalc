"""Physiq W20 — base dos testes de ponta a ponta do Painel › Agenda e da Perfil › Agenda do app (confirmar, reagendar, desistir,
marcar a consulta do pacote). Reaproveita a base da W19/W18/…/W13 (a "Consultoria Ferreira W13": Lucas dono + personal, Camila
nutricionista, Bruno 2º personal, Rafael Moura aluno com login) e a nutri do site antigo (nutri.teste.claude, legado_nutri).

Só contas *.teste.claude@… (P26); nenhum e-mail para pessoa real (staging → caixa de teste do Resend) e nenhum WhatsApp (o
staging não tem nenhum WhatsApp conectado; a prova do WhatsApp é numa transação desfeita — api.py).
Sem segredo no repo: chaves pela Management API (~/.pc-pat), senhas das contas de TESTE em ~/.physiq-teste-<nome>.
"""
from __future__ import annotations

import datetime as dt
import importlib.util
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
_ESPEC = importlib.util.spec_from_file_location("_base_w19", Path(__file__).parent.parent / "w19" / "_base.py")
B19 = importlib.util.module_from_spec(_ESPEC)
sys.modules["_base_w19"] = B19
_ESPEC.loader.exec_module(B19)  # type: ignore[union-attr]
B18, B17, B16, B15, B14, B13, B5 = B19.B18, B19.B17, B19.B16, B19.B15, B19.B14, B19.B13, B19.B5

p = B19.p
ESTADO, CONTAS, EMAIL, NOMES = B19.ESTADO, B19.CONTAS, B19.EMAIL, B19.NOMES
Caso, sql_principal, sql_treino, saude_treino = B19.Caso, B19.sql_principal, B19.sql_treino, B19.saude_treino
http, service, anon, uid = B19.http, B19.service, B19.anon, B19.uid
PRINCIPAL_REF, PRINCIPAL_URL, API_P = B19.PRINCIPAL_REF, B19.PRINCIPAL_URL, B19.API_P
conta_de, NOME_CONTA = B19.conta_de, B19.NOME_CONTA
saude_ok, esperar, json_arquivo, ler_json = B19.saude_ok, B19.esperar, B19.json_arquivo, B19.ler_json
rest, sessao, token = B19.rest, B19.sessao, B19.token

PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "w20"
for _b in (B19, B18, B17, B16, B15, B14, B13, B5, B13.B12, B13.B12.B11, B13.B12.B10, B13.B12.B8, B13.B12.B7):
    _b.PRINTS = PRINTS
SCRATCH = Path.home() / "projetos" / "physiqcalc-scratch" / "w20"
DOWNLOADS = SCRATCH / "downloads"
B19.DOWNLOADS = DOWNLOADS
MASSA = SCRATCH / "massa_staging.json"
abrir_app = B13.B12.abrir


def schema() -> str:
    return ESTADO["schema"]


def hoje() -> dt.date:
    return (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).date()


def sp(d: dt.date, hhmm: str) -> str:
    """'2026-10-01' + '09:30' (São Paulo, UTC−3) → ISO em UTC."""
    h, m = (int(x) for x in hhmm.split(":"))
    return (dt.datetime(d.year, d.month, d.day, h, m, tzinfo=dt.timezone(dt.timedelta(hours=-3)))).astimezone(dt.timezone.utc).isoformat()


def q(s: str | None) -> str:
    return "null" if s is None else "'" + str(s).replace("'", "''") + "'"


def rpc_como(conta: str, funcao: str, args: dict | None = None) -> tuple[int, object]:
    """Função do banco principal COMO a pessoa (auth.uid() de verdade)."""
    S = schema()
    st, r, _ = http("POST", f"{PRINCIPAL_URL}/rest/v1/rpc/{funcao}", args or {},
                    {"apikey": anon(PRINCIPAL_REF), "Authorization": f"Bearer {token(conta)}", "Content-Profile": S, "Accept-Profile": S}, timeout=90)
    return st, r


def funcao_como(conta: str, nome: str, corpo: dict, origem: str = "https://physiqcalc-staging.vercel.app") -> tuple[int, object]:
    st, r, _ = http("POST", f"{PRINCIPAL_URL}/functions/v1/{nome}", corpo,
                    {"apikey": anon(PRINCIPAL_REF), "Authorization": f"Bearer {token(conta)}", "x-schema": schema(), "Origin": origem}, timeout=90)
    return st, r


def agendamento(id_: str) -> dict | None:
    r = sql_principal(f"select to_jsonb(a) as j from {schema()}.agendamentos a where id = '{id_}'")
    return r[0]["j"] if r else None


def massa() -> dict:
    return ler_json(MASSA)


def gravar_massa(d: dict) -> None:
    MASSA.parent.mkdir(parents=True, exist_ok=True)
    MASSA.write_text(json.dumps(d, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
