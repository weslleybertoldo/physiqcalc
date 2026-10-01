"""Physiq W24 — base dos testes de ponta a ponta do Painel › Dietas (Alimentos, Receitas e Diário alimentar) e da página pública
/d/:codigo. Reaproveita a base da W18/W17/W16/W15/W14/W13 (a "Consultoria Ferreira W13": Lucas dono + personal, Camila
nutricionista, Bruno 2º personal, Rafael Moura aluno com login, Marina e Beatriz da Camila; a w18-nutri2 REMOVIDA da equipe).

Contas de TESTE desta W (só *.teste.claude@physiqnutri.app — P26; senhas em ~/.physiq-teste-<nome>, criadas por e2e/w24/massa.py):
  w24-dono      "Helena Prado"   dona + NUTRICIONISTA da "Clínica Sabor W24" (P1: o dono-nutri vê os alunos de todas as nutris)
  w24-nutri     "Sofia Martins"  nutricionista membro (vê só os alunos dela)
  w24-personal  "Diego Ramos"    personal membro (não lê o diário)
  alunos sem login: "Ana Clara W24" (da Sofia) e "Bruna Costa W24" (da Helena)

Sem segredo no repo: chaves pela Management API (~/.pc-pat), senhas das contas de TESTE em ~/.physiq-teste-<nome>.
"""
from __future__ import annotations

import importlib.util
import json
import re
import secrets
import sys
import time
import urllib.request
import uuid
from pathlib import Path

sys.dont_write_bytecode = True
_ESPEC = importlib.util.spec_from_file_location("_base_w18", Path(__file__).parent.parent / "w18" / "_base.py")
B18 = importlib.util.module_from_spec(_ESPEC)
sys.modules["_base_w18"] = B18
_ESPEC.loader.exec_module(B18)  # type: ignore[union-attr]
B17, B16, B15, B14, B13, B5 = B18.B17, B18.B16, B18.B15, B18.B14, B18.B13, B18.B5

p = B18.p
ESTADO, CONTAS, EMAIL, NOMES = B18.ESTADO, B18.CONTAS, B18.EMAIL, B18.NOMES
Caso, sql_principal, sql_treino, saude_treino = B18.Caso, B18.sql_principal, B18.sql_treino, B18.saude_treino
http, service, anon, rpc, uid, sessao, token = B18.http, B18.service, B18.anon, B18.rpc, B18.uid, B18.sessao, B18.token
PRINCIPAL_REF, PRINCIPAL_URL, API_P, API_T, TREINO_REF = B18.PRINCIPAL_REF, B18.PRINCIPAL_URL, B18.API_P, B18.API_T, B18.TREINO_REF
conta_de, NOME_CONTA, conta_w13, rafael = B18.conta_de, B18.NOME_CONTA, B18.conta_w13, B18.rafael
saude_ok, esperar = B18.saude_ok, B18.esperar
json_arquivo, ler_json = B18.json_arquivo, B18.ler_json
NUTRI2 = B18.NUTRI2
PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "w24"
for _b in (B18, B17, B16, B15, B14, B13, B5, B13.B12, B13.B12.B11, B13.B12.B10, B13.B12.B8, B13.B12.B7):
    _b.PRINTS = PRINTS
SCRATCH = Path.home() / "projetos" / "physiqcalc-scratch" / "w24"
FOTOS = Path("/home/bertoldo/Desktop/Physiq Unificado - estrutura/Telas premium/fonte (gerador)/assets/fotos")
MARCA = "W24"
NOME_CONTA_W24 = "Clínica Sabor W24"

for _k, _e, _n in (
    ("w24-dono", "w24.dono.teste.claude@physiqnutri.app", "Helena Prado"),
    ("w24-nutri", "w24.nutri.teste.claude@physiqnutri.app", "Sofia Martins"),
    ("w24-personal", "w24.personal.teste.claude@physiqnutri.app", "Diego Ramos"),
):
    EMAIL[_k] = _e
    NOMES[_k] = _n
    CONTAS[_k] = (_e, B5.senha_de(_k))


def schema() -> str:
    return ESTADO["schema"]


def q(v) -> str:
    """Literal SQL seguro (dólar-cotado) — só para os valores dos testes."""
    if v is None:
        return "null"
    return f"$v${v}$v$"


def carimbo() -> str:
    return time.strftime("%H%M%S") + secrets.token_hex(2)


def rest(conta_ou_token: str, metodo: str, tabela: str, filtro: str = "", corpo=None, prefer: str = "return=representation") -> tuple[int, object]:
    """REST do principal COMO a pessoa (RLS de verdade)."""
    tok = sessao(conta_ou_token)["access_token"] if conta_ou_token in CONTAS else (conta_ou_token or anon(PRINCIPAL_REF))
    cab = {"apikey": anon(PRINCIPAL_REF), "Authorization": f"Bearer {tok}", "Accept-Profile": schema(), "Content-Profile": schema(), "Prefer": prefer}
    st, r, _ = http(metodo, f"{PRINCIPAL_URL}/rest/v1/{tabela}{('?' + filtro) if filtro else ''}", corpo, cab, timeout=90)
    return st, r


def rpc_anon(funcao: str, args: dict) -> tuple[int, object]:
    """Função do principal SEM login (o visitante do /d/)."""
    a = anon(PRINCIPAL_REF)
    st, r, _ = http("POST", f"{PRINCIPAL_URL}/rest/v1/rpc/{funcao}", args, {"apikey": a, "Authorization": f"Bearer {a}", "Content-Profile": schema(), "Accept-Profile": schema()})
    return st, r


def subir_foto(caminho: str, arquivo: Path, token: str | None = None) -> int:
    """Sobe a foto no bucket "diario" como o anônimo (token None) ou como a pessoa (o upload do app/link — sem upsert)."""
    a = anon(PRINCIPAL_REF)
    req = urllib.request.Request(f"{PRINCIPAL_URL}/storage/v1/object/diario/{caminho}", data=arquivo.read_bytes(), method="POST",
                                 headers={"Authorization": f"Bearer {token or a}", "apikey": a, "Content-Type": "image/jpeg", "x-upsert": "false",
                                          "User-Agent": "physiq-e2e-w24"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status
    except urllib.error.HTTPError as e:  # type: ignore[attr-defined]
        return e.code


def apagar_fotos(caminhos: list[str]) -> int:
    if not caminhos:
        return 200
    sp = service(PRINCIPAL_REF)
    st, _, _ = http("DELETE", f"{PRINCIPAL_URL}/storage/v1/object/diario", {"prefixes": caminhos}, {"apikey": sp, "Authorization": f"Bearer {sp}"}, timeout=90)
    return st


def assinar(conta_ou_token: str, caminho: str) -> int:
    """createSignedUrl COMO a pessoa (a regra do Storage): 200 = lê a foto."""
    tok = sessao(conta_ou_token)["access_token"] if conta_ou_token in CONTAS else conta_ou_token
    st, _, _ = http("POST", f"{PRINCIPAL_URL}/storage/v1/object/sign/diario/{caminho}", {"expiresIn": 60},
                    {"apikey": anon(PRINCIPAL_REF), "Authorization": f"Bearer {tok}"}, timeout=60)
    return st


def enviar_pelo_link(codigo: str, foto: Path, refeicao: str, comentario: str, data_hora_iso: str | None = None, token: str | None = None) -> tuple[int, object, str]:
    """O envio do /d/ (o MESMO do app): situação do link → sobe a foto na pasta <nutri>/<aluno>/ → diario_enviar."""
    st, link = rpc_anon("diario_link", {"p_codigo": codigo})
    if st != 200 or not isinstance(link, dict) or link.get("situacao") != "ok":
        return st, link, ""
    caminho = f"{link['nutricionista_id']}/{link['paciente_id']}/{uuid.uuid4()}.jpg"
    stu = subir_foto(caminho, foto, token)
    if stu not in (200, 201):
        return stu, {"erro": "upload"}, caminho
    args = {"p_codigo": codigo, "p_path": caminho, "p_mime": "image/jpeg", "p_tamanho": foto.stat().st_size, "p_refeicao": refeicao,
            "p_comentario": comentario, "p_data_hora": data_hora_iso or time.strftime("%Y-%m-%dT%H:%M:%S%z")}
    if token:
        a = anon(PRINCIPAL_REF)
        st2, r, _ = http("POST", f"{PRINCIPAL_URL}/rest/v1/rpc/diario_enviar", args,
                         {"apikey": a, "Authorization": f"Bearer {token}", "Content-Profile": schema(), "Accept-Profile": schema()})
    else:
        st2, r = rpc_anon("diario_enviar", args)
    if st2 != 200:
        apagar_fotos([caminho])
    return st2, r, caminho


def paciente(nome: str, conta_id: str) -> dict | None:
    r = sql_principal(f"""select id::text, user_id::text, nutricionista_id::text, link_codigo, config from {schema()}.pacientes
                          where conta_id = '{conta_id}' and nome = {q(nome)} and deleted_at is null order by created_at limit 1""")
    return r[0] if r else None


def conta_w24() -> str:
    c = conta_de("w24-dono", NOME_CONTA_W24)
    assert c, "Clínica Sabor W24 não achada (rode e2e/w24/massa.py)"
    return c


def desfeito(sql_do_bloco: str) -> dict:
    """Roda um bloco DO … raise exception 'RESULTADO %', jsonb (transação DESFEITA — nada fica gravado) e devolve o jsonb."""
    chave = (Path.home() / ".pc-pat").read_text(encoding="utf-8").strip()
    st, r, _ = http("POST", f"https://api.supabase.com/v1/projects/{PRINCIPAL_REF}/database/query", {"query": sql_do_bloco},
                    {"Authorization": f"Bearer {chave}"}, timeout=180)
    msg = r.get("message", "") if isinstance(r, dict) else str(r)
    m = re.search(r"RESULTADO (\{.*\})", msg, re.S)
    if not m:
        raise RuntimeError(f"bloco sem RESULTADO (HTTP {st}): {str(msg)[:800]}")
    return json.loads(m.group(1))


def pausa(s: float) -> None:
    time.sleep(s)
