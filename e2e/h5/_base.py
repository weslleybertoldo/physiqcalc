"""Physiq H5 — base dos testes de ponta a ponta dos ajustes da revisão final (agenda "sem trava", /c/ com CPF e apelido, ✓ das metas,
editor do plano, atalho do diário, fotos de evolução, % de gordura no gráfico, modo só leitura, aviso de Pix sem duplicar, textos).
Reaproveita a base da W20 (→ W19 → W18 → … → W13: a "Consultoria Ferreira W13" — Lucas dono + personal, Camila nutricionista,
Bruno 2º personal, Rafael Moura aluno com login) e o `desfeito` da W24 (bloco SQL numa transação DESFEITA).

Só contas *.teste.claude@… (P26); nenhuma mensagem a pessoa real: a prova do WhatsApp roda numa transação desfeita, com a
instância "conectada" só dentro dela e número fictício (+5500…) — o agente do Moto G7 nunca vê a fila.
Sem segredo no repo: chaves pela Management API (~/.pc-pat), senhas das contas de TESTE em ~/.physiq-teste-<nome>.
"""
from __future__ import annotations

import importlib.util
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.dont_write_bytecode = True
_ESPEC = importlib.util.spec_from_file_location("_base_w20", Path(__file__).parent.parent / "w20" / "_base.py")
B20 = importlib.util.module_from_spec(_ESPEC)
sys.modules["_base_w20"] = B20
_ESPEC.loader.exec_module(B20)  # type: ignore[union-attr]
B19, B18, B17, B16, B15, B14, B13, B5 = B20.B19, B20.B18, B20.B17, B20.B16, B20.B15, B20.B14, B20.B13, B20.B5

p = B20.p
ESTADO, CONTAS, EMAIL, NOMES = B20.ESTADO, B20.CONTAS, B20.EMAIL, B20.NOMES
Caso, sql_principal, sql_treino, saude_treino = B20.Caso, B20.sql_principal, B20.sql_treino, B20.saude_treino
http, service, anon, uid, sessao, token = B20.http, B20.service, B20.anon, B20.uid, B20.sessao, B20.token
PRINCIPAL_REF, PRINCIPAL_URL, API_P = B20.PRINCIPAL_REF, B20.PRINCIPAL_URL, B20.API_P
conta_de, NOME_CONTA = B20.conta_de, B20.NOME_CONTA
saude_ok, esperar, json_arquivo, ler_json = B20.saude_ok, B20.esperar, B20.json_arquivo, B20.ler_json
rpc_como, funcao_como, hoje, sp = B20.rpc_como, B20.funcao_como, B20.hoje, B20.sp

PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "h5"
for _b in (B20, B19, B18, B17, B16, B15, B14, B13, B5, B13.B12, B13.B12.B11, B13.B12.B10, B13.B12.B8, B13.B12.B7):
    _b.PRINTS = PRINTS
SCRATCH = Path.home() / "projetos" / "physiqcalc-scratch" / "h5"
DOWNLOADS = SCRATCH / "downloads"
B20.DOWNLOADS = DOWNLOADS
B19.DOWNLOADS = DOWNLOADS
MARCA = "H5"


def schema() -> str:
    return ESTADO["schema"]


def bucket_do_ambiente(nome: str) -> str:
    """hml-02b (H-14): no staging os buckets de dado de saúde têm versão própria "-staging"."""
    return f"{nome}-staging" if schema() == "staging" else nome


def q(v) -> str:
    """Literal SQL seguro (dólar-cotado) — só para os valores dos testes."""
    if v is None:
        return "null"
    return f"$v${v}$v$"


def conta_w13() -> str:
    c = conta_de("w13-dono", NOME_CONTA)
    assert c, "Consultoria Ferreira W13 não achada (rode a massa da W13 no staging)"
    return c


def rafael(conta_id: str) -> dict:
    r = sql_principal(f"""select id::text, user_id::text, nutricionista_id::text, personal_id::text, email, cpf from {schema()}.pacientes
                          where conta_id = '{conta_id}' and nome = 'Rafael Moura' and deleted_at is null order by created_at limit 1""")
    assert r, "Rafael Moura não achado na Consultoria Ferreira W13"
    return r[0]


def desfeito(sql_do_bloco: str) -> dict:
    """Roda um bloco DO … raise exception 'RESULTADO %', jsonb (transação DESFEITA — nada fica gravado) e devolve o jsonb."""
    pat = (Path.home() / ".pc-pat").read_text(encoding="utf-8").strip()
    req = urllib.request.Request(f"https://api.supabase.com/v1/projects/{PRINCIPAL_REF}/database/query", data=json.dumps({"query": sql_do_bloco}).encode(),
                                 method="POST", headers={"Authorization": f"Bearer {pat}", "Content-Type": "application/json", "User-Agent": "physiq-unificado/1.0 (e2e-h5)"})
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
    if not m:
        raise RuntimeError(f"bloco sem RESULTADO: {str(msg)[:900]}")
    return json.loads(m.group(1))


def rpc_servico(funcao: str, args: dict) -> tuple[int, object]:
    """Função do principal como o SERVIDOR (o que a função alunos faz no /c/, depois do captcha)."""
    sk = service(PRINCIPAL_REF)
    st, r, _ = http("POST", f"{PRINCIPAL_URL}/rest/v1/rpc/{funcao}", args,
                    {"apikey": sk, "Authorization": f"Bearer {sk}", "Content-Profile": schema(), "Accept-Profile": schema()}, timeout=90)
    return st, r


def alunos_publico(acao: str, corpo: dict, origem: str = "https://physiqcalc-staging.vercel.app") -> tuple[int, dict]:
    """A função alunos SEM login (a /c/:codigo)."""
    a = anon(PRINCIPAL_REF)
    st, r, _ = http("POST", f"{PRINCIPAL_URL}/functions/v1/alunos", {"acao": acao, **corpo},
                    {"apikey": a, "Authorization": f"Bearer {a}", "x-schema": schema(), "Origin": origem}, timeout=90)
    return st, (r if isinstance(r, dict) else {"bruto": r})


def captcha(ligado: bool) -> None:
    """O Chromium automatizado cai no desafio do Turnstile: no STAGING, só durante um envio do /c/, o captcha fica desligado (W13/W16b)."""
    assert schema() == "staging", "o captcha só é mexido no staging"
    sql_principal(f"""update staging.app_config set valor = jsonb_set(valor, '{{captcha}}', '{str(ligado).lower()}'::jsonb) where chave = 'login_limite'""")


def pausa(s: float) -> None:
    time.sleep(s)
