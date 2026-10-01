"""Physiq W19 — base dos testes de ponta a ponta do Painel › Financeiro (Resumo, Mensalidades, Lançamentos, Recibos, Categorias) e do
recibo novo da aba Financeiro do aluno. Reaproveita a base da W18/W17/…/W13 (a "Consultoria Ferreira W13": Lucas dono + personal,
Camila nutricionista, Bruno 2º personal, Rafael Moura aluno com login) e as contas da W6 para o comprovante do Pix:

  prof2         prof2.teste.claude@physiqcalc.app      professor do Calc (conta "Rafael Lima", legado_calc) — confirma o Pix aqui
  aluno2        aluno2.teste.claude@physiqcalc.app     aluno do prof2 — manda o comprovante (pagamentos-aluno, como o app)
  nutri-legado  nutri.teste.claude@physiqnutri.app     dona da "Nutri Teste Claude" (legado_nutri) — o site antigo lado a lado

Só contas *.teste.claude@… (P26); nenhuma cobrança no Mercado Pago, nenhum e-mail ou WhatsApp para pessoa real.
Sem segredo no repo: chaves pela Management API (~/.pc-pat), senhas das contas de TESTE em ~/.physiq-teste-<nome>.
"""
from __future__ import annotations

import base64
import importlib.util
import sys
import time
import urllib.request
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
http, service, anon, uid = B18.http, B18.service, B18.anon, B18.uid
PRINCIPAL_REF, PRINCIPAL_URL, API_P = B18.PRINCIPAL_REF, B18.PRINCIPAL_URL, B18.API_P
conta_de, NOME_CONTA, conta_w13, rafael = B18.conta_de, B18.NOME_CONTA, B18.conta_w13, B18.rafael
saude_ok, esperar, json_arquivo, ler_json = B18.saude_ok, B18.esperar, B18.json_arquivo, B18.ler_json
rest = B18.rest

PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "w19"
for _b in (B18, B17, B16, B15, B14, B13, B5, B13.B12, B13.B12.B11, B13.B12.B10, B13.B12.B8, B13.B12.B7):
    _b.PRINTS = PRINTS
SCRATCH = Path.home() / "projetos" / "physiqcalc-scratch" / "w19"
DOWNLOADS = SCRATCH / "downloads"

CONTAS.setdefault("prof2", ("prof2.teste.claude@physiqcalc.app", B5.ADMIN["SENHA"]))
CONTAS.setdefault("aluno2", ("aluno2.teste.claude@physiqcalc.app", B5.ADMIN["SENHA"]))
MARCA = "massa W19"
ORIGEM = "massa_w19"
# PNG 1×1 (o "comprovante" dos testes — o mesmo da W6)
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")

_tokens: dict[str, tuple[float, dict]] = {}


def sessao(conta: str) -> dict:
    """Sessão do principal da conta de TESTE (reaproveitada por 30 min — poupa o Auth e o limite de tentativas)."""
    agora = time.time()
    t = _tokens.get(conta)
    if t and agora - t[0] < 1800:
        return t[1]
    s = B5.sessao(conta)
    _tokens[conta] = (agora, s)
    return s


def token(conta: str) -> str:
    return sessao(conta)["access_token"]


def schema() -> str:
    return ESTADO["schema"]


def pag(conta: str, acao: str, corpo: dict | None = None) -> tuple[int, dict]:
    st, r = B5.funcao(token(conta), "pagamentos-aluno", {"acao": acao, **(corpo or {})})
    return st, (r if isinstance(r, dict) else {"_bruto": r})


def bucket_comprovantes() -> str:
    return "comprovantes-staging" if schema() == "staging" else "comprovantes"


def subir_comprovante(conta: str, paciente_id: str) -> str:
    """O caminho do app: URL assinada da pagamentos-aluno → PUT do arquivo (como o uploadToSignedUrl do supabase-js)."""
    st, r = pag(conta, "aluno_upload", {"paciente_id": paciente_id, "tipo": "image/png", "tamanho": len(PNG)})
    assert st == 200 and r.get("url"), (st, r)
    url = r["url"] if r["url"].startswith("http") else f"{PRINCIPAL_URL}/storage/v1{r['url']}"
    req = urllib.request.Request(url, data=PNG, method="PUT", headers={"Content-Type": "image/png", "x-upsert": "false", "User-Agent": "physiq-e2e-w19"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        assert resp.status in (200, 201), resp.status
    return r["caminho"]


def subir_comprovante_servico(caminho: str) -> None:
    """Massa: o arquivo do comprovante direto no bucket (service_role) — o "Ver comprovante" abre."""
    sp = service(PRINCIPAL_REF)
    req = urllib.request.Request(f"{PRINCIPAL_URL}/storage/v1/object/{bucket_comprovantes()}/{caminho}", data=PNG, method="POST",
                                 headers={"Content-Type": "image/png", "x-upsert": "true", "apikey": sp, "Authorization": f"Bearer {sp}", "User-Agent": "physiq-e2e-w19"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        assert resp.status in (200, 201), resp.status


def apagar_comprovantes(caminhos: list[str]) -> None:
    if not caminhos:
        return
    sp = service(PRINCIPAL_REF)
    st, r, _ = http("DELETE", f"{PRINCIPAL_URL}/storage/v1/object/{bucket_comprovantes()}", {"prefixes": caminhos},
                    {"apikey": sp, "Authorization": f"Bearer {sp}"}, timeout=60)
    assert st == 200, ("apagar comprovantes", st, r)


def matricula(conta: str) -> dict:
    return sql_principal(f"""select p.id::text as id, p.treino_user_id::text as treino_user_id, p.conta_id::text as conta_id
                               from {schema()}.pacientes p join auth.users u on u.id = p.user_id
                              where lower(u.email) = '{CONTAS[conta][0]}' and p.deleted_at is null order by p.created_at limit 1""")[0]


def conta_do_dono(conta: str) -> str:
    return sql_principal(f"""select c.id::text as id from {schema()}.contas c join auth.users u on u.id = c.dono_id
                              where lower(u.email) = '{CONTAS[conta][0]}' order by c.criado_em limit 1""")[0]["id"]


def textos_pdf(arq: Path) -> list[str]:
    """O texto que o jsPDF escreveu (operadores "(...) Tj"; o jsPDF não comprime por padrão)."""
    bruto = arq.read_bytes().decode("latin-1")
    import re
    return [t[1:-1].replace("\\(", "(").replace("\\)", ")") for t in re.findall(r"\((?:\\.|[^\\)])*\)(?=\s*Tj)", bruto)]


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
