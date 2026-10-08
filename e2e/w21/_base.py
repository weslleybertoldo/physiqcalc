"""Physiq W21 — base dos testes de ponta a ponta do Painel › Pré-consulta e da página pública /f/:slug. Reaproveita a base da
W20/W19/…/W13 e as contas de TESTE de lá:

  prof2         prof2.teste.claude@physiqcalc.app      o PERSONAL de conta só Treino ("Rafael Lima", legado_calc) — monta o formulário em
                                                       branco, recebe a resposta e liga ao "Aluno Dois" (o "pronto quando" da spec)
  w13-dono      "Lucas Ferreira"  dono + personal da "Consultoria Ferreira W13" — vê os formulários da equipe, NÃO lê as respostas
                                  dos formulários da nutricionista (regra clínica da W18) e não importa
  w13-nutri     "Camila Rocha"    nutricionista da W13 — monta a partir do modelo de anamnese, liga ao Rafael Moura e importa
  w13-personal2 "Bruno Lima"      2º personal da W13 — só os dele (P1)
  w18-nutri2    nutricionista REMOVIDA da W13 — não lê mais as respostas dos formulários dela na conta
  nutri-legado  nutri.teste.claude@physiqnutri.app     dona da "Nutri Teste Claude" (legado_nutri) — o site antigo lado a lado

Só contas *.teste.claude@… (P26); quem responde ao /f/ é anônimo e usa e-mails *.teste.claude@… — nenhum e-mail, WhatsApp ou push
sai (a pré-consulta não tem efeito colateral: a RPC só grava). Sem segredo no repo: chaves pela Management API (~/.pc-pat), senhas
das contas de TESTE em ~/.physiq-teste-<nome>.
"""
from __future__ import annotations

import importlib.util
import json
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
_ESPEC = importlib.util.spec_from_file_location("_base_w20", Path(__file__).parent.parent / "w20" / "_base.py")
B20 = importlib.util.module_from_spec(_ESPEC)
sys.modules["_base_w20"] = B20
_ESPEC.loader.exec_module(B20)  # type: ignore[union-attr]
B19, B18, B13, B5 = B20.B19, B20.B18, B20.B13, B20.B5

p = B20.p
ESTADO, CONTAS, EMAIL, NOMES = B20.ESTADO, B20.CONTAS, B20.EMAIL, B20.NOMES
sql_principal, saude_ok, esperar, http, anon, uid = B20.sql_principal, B20.saude_ok, B20.esperar, B20.http, B20.anon, B20.uid
PRINCIPAL_REF, PRINCIPAL_URL = B20.PRINCIPAL_REF, B20.PRINCIPAL_URL
sessao, token, q = B20.sessao, B20.token, B20.q
conta_de, NOME_CONTA = B20.conta_de, B20.NOME_CONTA

PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "w21"
for _b in (B20, B19, B18, B18.B17, B18.B16, B18.B15, B18.B14, B13, B5, B13.B12, B13.B12.B11, B13.B12.B10, B13.B12.B8, B13.B12.B7):
    _b.PRINTS = PRINTS
SCRATCH = Path.home() / "projetos" / "physiqcalc-scratch" / "w21"
MASSA = SCRATCH / "massa_staging.json"
MARCA = "W21 E2E"
abrir_app = B13.B12.abrir

CONTAS.setdefault("prof2", ("prof2.teste.claude@physiqcalc.app", B5.ADMIN["SENHA"]))


def schema() -> str:
    return ESTADO["schema"]


def rest(conta_ou_token: str, metodo: str, tabela: str, filtro: str = "", corpo=None, prefer: str = "return=representation") -> tuple[int, object]:
    """PostgREST do banco principal COMO a pessoa (o mesmo caminho do app) — ou anônimo com conta_ou_token = ""."""
    S = schema()
    tok = token(conta_ou_token) if conta_ou_token in CONTAS else (conta_ou_token or anon(PRINCIPAL_REF))
    cab = {"apikey": anon(PRINCIPAL_REF), "Authorization": f"Bearer {tok}", "Accept-Profile": S, "Content-Profile": S, "Prefer": prefer}
    st, r, _ = http(metodo, f"{PRINCIPAL_URL}/rest/v1/{tabela}{('?' + filtro) if filtro else ''}", corpo, cab, timeout=60)
    return st, r


def rpc(conta_ou_token: str, funcao: str, args: dict) -> tuple[int, object]:
    """RPC do banco principal como a pessoa (ou anônimo com conta_ou_token = "": quem responde ao /f/)."""
    return rest(conta_ou_token, "POST", f"rpc/{funcao}", "", args, prefer="")


def versao_dos_textos() -> str:
    """hml-12 (H-30): a versão dos textos (VERSAO_TEXTOS de src/publico/legal/versao.ts) que a página /f/ manda como consentimento."""
    import re
    m = re.search(r'VERSAO_TEXTOS\s*=\s*"(\d{4}-\d{2}-\d{2})"',
                  (Path(__file__).resolve().parents[2] / "src" / "publico" / "legal" / "versao.ts").read_text(encoding="utf-8"))
    if not m:
        raise RuntimeError("VERSAO_TEXTOS não achada em src/publico/legal/versao.ts")
    return m.group(1)


def responder(slug: str, nome: str, email: str, respostas: dict, telefone: str = "") -> dict:
    """Responde ao formulário como o público (anônimo), pela RPC da página /f/ (com o consentimento da hml-12: a de 6 argumentos)."""
    st, r = rpc("", "preconsulta_responder", {"p_slug": slug, "p_nome": nome, "p_email": email, "p_telefone": telefone,
                                              "p_respostas": respostas, "p_consentimento": versao_dos_textos()})
    assert st == 200 and isinstance(r, dict) and r.get("id"), ("responder", st, r)
    return r


def contar(conta: str, tabela: str, filtro: str) -> int:
    """Linhas que a pessoa LÊ (RLS de verdade) — HEAD com count=exact."""
    S = schema()
    cab = {"apikey": anon(PRINCIPAL_REF), "Authorization": f"Bearer {token(conta)}", "Accept-Profile": S, "Prefer": "count=exact"}
    st, _r, hdr = http("HEAD", f"{PRINCIPAL_URL}/rest/v1/{tabela}?select=id&{filtro}", None, cab, timeout=60)
    assert st in (200, 206), (tabela, st)
    faixa = (hdr or {}).get("Content-Range") or (hdr or {}).get("content-range") or "*/0"
    return int(str(faixa).split("/")[-1] or 0)


def ids_visiveis(conta: str, tabela: str, filtro: str) -> list[str]:
    st, r = rest(conta, "GET", tabela, f"select=id&{filtro}")
    assert st == 200, (tabela, st, r)
    return [x["id"] for x in r]  # type: ignore[union-attr]


def conta_prof2() -> str:
    r = sql_principal(f"""select c.id::text as id from {schema()}.contas c join auth.users u on u.id = c.dono_id
                           where lower(u.email) = '{CONTAS['prof2'][0]}' order by c.criado_em limit 1""")
    assert r, "a conta do prof2 não existe"
    return r[0]["id"]


def conta_nutri_legado() -> str:
    r = sql_principal(f"""select c.id::text as id from {schema()}.contas c join auth.users u on u.id = c.dono_id
                           where lower(u.email) = '{CONTAS['nutri-legado'][0]}' and c.origem = 'legado_nutri' order by c.criado_em limit 1""")
    assert r, "a conta legado_nutri da nutri de teste não existe"
    return r[0]["id"]


def aluno(conta_id: str, nome: str) -> dict:
    r = sql_principal(f"""select id::text, personal_id::text, nutricionista_id::text, email from {schema()}.pacientes
                           where conta_id = '{conta_id}' and nome = $n${nome}$n$ and deleted_at is null order by created_at limit 1""")
    assert r, f"aluno {nome} não achado na conta {conta_id}"
    return r[0]


def massa() -> dict:
    return json.loads(MASSA.read_text(encoding="utf-8"))


def gravar_massa(d: dict) -> None:
    MASSA.parent.mkdir(parents=True, exist_ok=True)
    MASSA.write_text(json.dumps(d, ensure_ascii=False, indent=2, default=str), encoding="utf-8")


def carimbo() -> str:
    return time.strftime("%H%M%S")
