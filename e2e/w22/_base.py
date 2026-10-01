"""Physiq W22 — base dos testes de ponta a ponta do Painel › Mensagens (WhatsApp). Reaproveita a base da W21/W20/…/W13 e as contas de
TESTE de lá:

  prof2         prof2.teste.claude@physiqcalc.app      o PERSONAL de conta só Treino ("Rafael Lima", legado_calc) — o "pronto quando"
                                                       (vê a tela inteira, pede a conexão e o QR aparece)
  w13-dono      "Lucas Ferreira"  dono + personal da "Consultoria Ferreira W13" — vê a fila da EQUIPE (P1) e recebe a mensalidade
  w13-personal2 "Bruno Lima"      2º personal da W13 — só a fila dele; manda o aniversário dos alunos dele
  w13-nutri     "Camila Rocha"    nutricionista da W13 — não vê a fila do Bruno
  nutri-legado  nutri.teste.claude@physiqnutri.app     a nutri do site antigo lado a lado (mesma instância, histórico e textos)

🚨 O WhatsApp manda DE VERDADE: o agente no Moto G7 de casa envia tudo que estiver PENDENTE na fila de instância CONECTADA, nos 2
schemas. Aqui: (1) antes de tudo, as instâncias são contadas por status e nenhuma conta usada pode estar conectada de verdade; (2) a
prova do enfileirador roda em TRANSAÇÃO DESFEITA (a instância "conectada" e os alunos fictícios só existem dentro dela — o agente lê o
que está gravado e nunca vê nada); (3) o que fica gravado para as telas é só histórico já resolvido (enviada/falhou) de conta de
teste SEM instância conectada, com telefone fictício (+55 00 9…), e é apagado no fim. Nunca conecta, desconecta nem manda teste nas
contas do Weslley. Sem segredo no repo: chaves pela Management API (~/.pc-pat), senhas das contas de TESTE em ~/.physiq-teste-<nome>.
"""
from __future__ import annotations

import importlib.util
import json
import re
import sys
from pathlib import Path

sys.dont_write_bytecode = True
_ESPEC = importlib.util.spec_from_file_location("_base_w21", Path(__file__).parent.parent / "w21" / "_base.py")
B21 = importlib.util.module_from_spec(_ESPEC)
sys.modules["_base_w21"] = B21
_ESPEC.loader.exec_module(B21)  # type: ignore[union-attr]
B20, B19, B18, B13, B5 = B21.B20, B21.B19, B21.B18, B21.B13, B21.B5

p = B21.p
ESTADO, CONTAS, EMAIL, NOMES = B21.ESTADO, B21.CONTAS, B21.EMAIL, B21.NOMES
sql_principal, saude_ok, esperar, http, anon, uid = B21.sql_principal, B21.saude_ok, B21.esperar, B21.http, B21.anon, B21.uid
PRINCIPAL_REF, PRINCIPAL_URL = B21.PRINCIPAL_REF, B21.PRINCIPAL_URL
sessao, token, q = B21.sessao, B21.token, B21.q
rest, rpc, contar, carimbo = B21.rest, B21.rpc, B21.contar, B21.carimbo
conta_de, NOME_CONTA, conta_prof2, conta_nutri_legado = B21.conta_de, B21.NOME_CONTA, B21.conta_prof2, B21.conta_nutri_legado

PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "w22"
for _b in (B21, B20, B19, B18, B18.B17, B18.B16, B18.B15, B18.B14, B13, B5, B13.B12, B13.B12.B11, B13.B12.B10, B13.B12.B8, B13.B12.B7):
    _b.PRINTS = PRINTS
SCRATCH = Path.home() / "projetos" / "physiqcalc-scratch" / "w22"
MARCA = "W22 E2E"
# telefone fictício (DDD 00 não existe): o agente nunca acharia WhatsApp nele — e ainda assim nada daqui fica pendente em instância conectada
FONE = "+55009000001{:02d}"

# as contas do Weslley (nenhuma é *.teste.claude@) e as de prova ficam intocadas: só conta de teste passa pela trava abaixo
PROVA = ("prova.teste.claude", "w7b.prod.teste.claude")


def schema() -> str:
    return ESTADO["schema"]


def email_de(conta: str) -> str:
    return CONTAS[conta][0].lower()


def conta_de_teste(conta: str) -> bool:
    e = email_de(conta)
    return "teste.claude@" in e and not e.startswith(PROVA)


def instancias_por_status(S: str | None = None) -> dict:
    """Só contagens e ids curtos (nunca número): o 1º passo de todo bloco de teste."""
    sch = [S] if S else ["public", "staging"]
    saida: dict = {}
    for s in sch:
        r = sql_principal(f"select status, count(*)::int n, array_agg(left(nutricionista_id::text, 8) order by nutricionista_id) donos "
                          f"from {s}.whatsapp_instancias group by status order by status")
        saida[s] = {x["status"]: {"n": x["n"], "donos": x["donos"]} for x in r}
    return saida


def conectadas(S: str) -> set[str]:
    r = sql_principal(f"select nutricionista_id::text id from {S}.whatsapp_instancias where status = 'conectado'")
    return {x["id"] for x in r}


def garantir_seguro(contas: list[str]) -> None:
    """Para tudo se alguma conta usada não for de teste ou estiver conectada DE VERDADE (aí qualquer pendente sairia pro WhatsApp)."""
    S = schema()
    ligadas = conectadas(S)
    for c in contas:
        assert conta_de_teste(c), f"conta não é de teste: {c}"
        u = uid(c)
        assert u, f"conta sem usuário: {c}"
        assert u not in ligadas, f"PAROU: a instância de {c} está CONECTADA de verdade em {S}"


def pendentes_de(S: str, uids: list[str]) -> int:
    lista = ",".join(q(u) for u in uids)
    return sql_principal(f"select count(*)::int n from {S}.mensagens_whatsapp where status in ('pendente','enviando') and nutricionista_id in ({lista})")[0]["n"]


def desfeito(sql: str) -> dict:
    """Roda um bloco que termina em raise exception 'RESULTADO %' (transação DESFEITA) e devolve o jsonb do resultado."""
    import urllib.error
    import urllib.request

    pat = (Path.home() / ".pc-pat").read_text().strip()
    req = urllib.request.Request(f"https://api.supabase.com/v1/projects/{PRINCIPAL_REF}/database/query", data=json.dumps({"query": sql}).encode(),
                                 method="POST", headers={"Authorization": f"Bearer {pat}", "Content-Type": "application/json", "User-Agent": "physiq-unificado/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=240) as r:
            raise AssertionError(f"o bloco não desfez (sem RESULTADO): {r.read().decode()[:400]}")
    except urllib.error.HTTPError as e:
        corpo = e.read().decode()
    try:
        msg = json.loads(corpo).get("message", corpo)
    except Exception:  # noqa: BLE001
        msg = corpo
    m = re.search(r"RESULTADO (\{.*\})", msg, re.S)
    assert m, f"erro no bloco: {msg[:3000]}"
    return json.loads(m.group(1))
