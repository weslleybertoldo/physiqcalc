#!/usr/bin/env python3
"""Physiq W1 — E2E de TELA da InfinitePay (Task 18 do plano da W1), com o Edge e as contas de TESTE do STAGING, em série, com a guarda de
/health dos 2 projetos antes de cada conta que entra. O painel a 1280 e a 390 (os "-390"); o app do aluno a 390 × 844.
Passos (em ordem; a massa é a conta do prof2 — "Rafael Lima" — com o aluno2):
  1 recebimento   o dono em Configurações › Recebimento: a tela NÃO pede nada ao banco (nenhuma chamada a /rest/v1/recebimento_chaves nem
                  /rest/v1/contas — o jeito 2 medido na rede, nos passos 1 e 2); chave Pix: adicionar, ligar, excluir (com a confirmação
                  do app) e a chave que estava ligada antes, ligada de novo; no print a 390, cada botão da tela dentro do cartão
  2 infinitepay   escolher InfinitePay, colar a InfiniteTag de teste com $, "Testar" abre uma aba da InfinitePay (a url é conferida; a aba é
                  fechada sem pagar), "Salvar a forma" → o chip INFINITEPAY; no print a 390, cada botão dentro do cartão (o "Testar"
                  passou da borda em 11/10)
  3 planos        Financeiro › Planos: "Período todo (Pix ou cartão até 12×)" no plano com à vista e cartão parcelado (P-B), uma vez só no
                  cartão; no painel do plano (Editar, sem salvar) o à vista com esse nome e o cartão parcelado "não aceita"
  4 app_pagar     o aluno em Pagamentos: "Pagar R$ 10,00" → a folha da InfinitePay → a aba da InfinitePay (conferida e fechada) →
                  "Aguardando a confirmação"; "Conferir pagamento" → "Ainda não chegou…" DENTRO da folha, acima do botão, e nada por
                  cima dele — nem toast (a API de verdade: não pago); fora da folha, "Continuar o pagamento" e o cartão "em andamento"
  5 app_volta     a volta da página (/perfil/pagamentos?order_nsu=<o pedido do link, <id>-1>&transaction_nsu=…): "Recebemos a volta…" e a
                  busca limpa (no banco: o aviso da volta na caixa, não pago)
  6 app_pago      a tentativa marcada paga NO BANCO (o resultado da baixa — o caminho da baixa é provado no api.py --local): "Pix
                  (InfinitePay) · pago em …" e "Ver o recibo da InfinitePay" no detalhe
  7 ficha         a ficha do aluno no painel: "InfinitePay (Pix e cartão, confirmação automática)" e o recibo na linha da cobrança
  8 master        master › Integrações: a InfiniteTag da conta e o "Desligar" (confirmação do app → volta ao Pix ou a não cobrar). O master
                  de teste do staging é a w27-master (o molde da hml-14 e da W27): o papel 'master' em staging.profiles SÓ durante a
                  rodada — a foto do papel de antes vai para o arquivo de estado e o desfazer devolve
--loja: o localhost serve o build da loja — só os passos 4 a 6 (o aluno paga o PROFISSIONAL igual na versão da Google Play); a conta vai
para a InfinitePay pelo banco (o atalho do api.py: o caminho pela tela é o passo 2 do site).
--porta: a do vite preview no --base local — 5173 (padrão) ou 8080, as ÚNICAS do localhost que o CORS das funções aceita (origemPermitida
do principal e o trocar-token do Treino): em outra porta, toda chamada do navegador às funções cai. A 8080 costuma ser da outra sessão.
--base prod: SÓ LEITURA (nada clica em salvar, nada é gravado; a Guarda da hml-17 no navegador, com a prof_recebimento como leitura): o dono
de teste (admin.teste) abre Recebimento — a opção InfinitePay aparece IGUAL ao que o servidor diz (a flag desligada esconde dos personais;
o master sempre vê) — e Integrações só se a conta for master (na produção não há master de teste: hml-02/H-04); o aluno de teste
(teste@teste.com) abre Pagamentos. As contas e senhas do e2e/w07/smoke_prod.py. Prints em …/prints/w1/prod/ (listas e chaves borradas).
A página da InfinitePay nunca abre no navegador do teste: o pedido da aba a *.infinitepay.io recebe uma página vazia (só a url importa —
conferida e nunca impressa, porque leva a InfiniteTag). A InfiniteTag de teste não vai para a saída (trocada por <InfiniteTag>) nem para os
prints (borrada em todos, também nos da falha). A saída do e2e/w1/api.py troca igual (o PlacarSemTag).
Desfazer: o do e2e/w1/api.py (a foto da matrícula, da conta e da flag ANTES de mexer, em ~/projetos/physiqcalc-scratch/w1/api-estado.json)
+ as marcas desta rodada em …/w1/telas-estado.json (o plano do PROFISSIONAL da conta — o painel travado é liberado só durante a rodada — e o
papel da w27-master); no fim, ou na próxima rodada / --limpar, tudo volta e é conferido campo a campo.
Precisa: a W1 no staging e as 2 funções publicadas (a rodada confere antes de mexer no banco, só lendo: a prof_recebimento como o dono e o
GET do webhook — sem elas, não começa); a InfiniteTag de teste em ~/.physiq-infinitetag-teste (sem ela, os passos 2, 3, 4 e 8 ficam ❌
"falta a InfiniteTag"); ~/.pc-pat e as senhas das contas de TESTE.
Uso: python3 e2e/w1/telas.py --base local|staging|prod [--loja] [--porta 5173] [--canal msedge] [--sinal ARQ] [--seco | --limpar]
  --seco    nada vai ao banco nem à API (a rede deste processo só fala com o build servido; no Edge, os pedidos à API e à InfinitePay são
            barrados): o roteiro contra o código (cada data-* dos seletores e cada texto esperado), as funções puras, as contas e a
            InfiniteTag (sem login), a porta no CORS, o build servido (health.json: schema e canal), a /entrar no Edge e, com o CSS do
            build, a checagem do botão dentro do cartão a 390 (o "Testar" e o "Ativar" do Recebimento quebram a linha) e a do botão
            livre (o toast por cima do botão de baixo da folha é pego)
  --limpar  só desfaz uma rodada que caiu no meio (pelos 2 arquivos de estado)
  --sinal   o arquivo-sinal da trava do banco do staging (dividido entre sessões): sem ele a rodada não começa; se ele sumir no meio, a
            rodada para ANTES do próximo passo, desfaz a massa e sai com 3
"""
from __future__ import annotations

import argparse
import datetime as dt
import importlib.util
import json
import os
import re
import secrets
import subprocess
import sys
import time
import urllib.request
import uuid
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse

sys.dont_write_bytecode = True
AQUI = Path(__file__).resolve().parent
E2E = AQUI.parent
REPO = E2E.parent
SCRATCH = Path.home() / "projetos" / "physiqcalc-scratch"
# o teto de logins da w27-master é de cada agente (a base da hml-18 lê o registro na carga): o desta frente fica na pasta da W1
os.environ.setdefault("HML18_MASTER_REGISTRO", str(SCRATCH / "w1" / "master_logins.txt"))


def _carregar(nome: str, caminho: Path):
    if nome in sys.modules:
        return sys.modules[nome]
    espec = importlib.util.spec_from_file_location(nome, caminho)
    mod = importlib.util.module_from_spec(espec)
    sys.modules[nome] = mod
    espec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


# A ordem importa (o molde do e2e/wp/telas.py): a base da W6 primeiro (ela carrega a da W5 e o _comum da W2); a da hml-18 (→ hml-17 →
# hml-09) reaproveita os mesmos módulos; o api.py da W1 importa "_base" = esta base da W6.
W6 = _carregar("_base_w06", E2E / "w06" / "_base.py")
sys.modules.setdefault("_base", W6)
B = _carregar("_base_hml18", E2E / "hml18" / "_base.py")
API = _carregar("_w1_api", AQUI / "api.py")
API.carregar_base()
assert B.B5 is W6.B5 and API.B is W6, "a base da W5 e a da W6 têm de ser as mesmas nas 3 bases"
B17 = B.B17

S = API.S
DONO, ALUNO, MASTER = API.DONO, API.ALUNO, "w27-master"
DONO_PROD, ALUNO_PROD = "master", "aluno-calc"  # as contas de TESTE da produção (e2e/w07/smoke_prod.py): admin.teste e teste@teste.com
PORTAS_DAS_FUNCOES = (5173, 8080)
ESTADO_ARQ = SCRATCH / "w1" / "telas-estado.json"
ROTA_RECEBIMENTO = "/painel/configuracoes/recebimento"
POR_PAGINA_MASTER = 20  # master › Integrações: 20 contas por página do banco (hml-14d)

PERIODO_TODO = "Período todo (Pix ou cartão até 12×)"
MODO_TEXTO_IP = "InfinitePay (Pix e cartão, confirmação automática)"
AGUARDANDO = "Aguardando a confirmação da InfinitePay…"
AINDA_NAO = "Ainda não chegou a confirmação da InfinitePay"
VOLTA = "Recebemos a volta da InfinitePay"
CONTINUAR = "Continuar o pagamento"
EM_ANDAMENTO = "Pagamento na InfinitePay em andamento"
RECIBO = "Ver o recibo da InfinitePay"
PIX_IP = "Pix (InfinitePay)"
PRONTO_IP = "Pronto: seus alunos pagam pela InfinitePay."
ROTULO_RECEBIMENTO = {"pix_manual": "Pix manual", "nenhum": "Não cobra pelo app"}  # src/master/regras.ts (o toast do Desligar)
# o que o roteiro espera ler na tela, no arquivo de onde vem (o --seco confere antes de qualquer rodada)
TEXTOS_NO_CODIGO = (
    (PERIODO_TODO, "supabase-principal/functions/_shared/planos-regras.ts"),
    ('mensal: "Mês a mês"', "supabase-principal/functions/_shared/planos-regras.ts"),
    ("(o seu recebimento não aceita)", "src/painel/financeiro/PlanoDialog.tsx"),
    ('infinitepay: "INFINITEPAY"', "supabase-principal/functions/_shared/recebimento-regras.ts"),
    (PRONTO_IP, "src/painel/configuracoes/Recebimento.tsx"),
    ("Nova chave Pix", "src/components/admin/RecebimentoPixDialog.tsx"),
    ("Chave excluída.", "src/components/admin/RecebimentosLista.tsx"),
    ("Pagar ${reais(valor)} com Pix ou cartão", "src/app-aluno/perfil/pagamentos/PagarInfinitePay.tsx"),
    (AGUARDANDO, "src/app-aluno/perfil/pagamentos/PagarInfinitePay.tsx"),
    (AINDA_NAO, "src/app-aluno/perfil/pagamentos/PagarInfinitePay.tsx"),
    (VOLTA, "src/app-aluno/perfil/Pagamentos.tsx"),
    (CONTINUAR, "src/app-aluno/perfil/Pagamentos.tsx"),
    (EM_ANDAMENTO, "src/app-aluno/perfil/Pagamentos.tsx"),
    (RECIBO, "src/app-aluno/perfil/Pagamentos.tsx"),
    (': "Pagar a mensalidade"', "src/financeiro/regras.ts"),
    ('return "Pix ou cartão"', "src/financeiro/regras.ts"),
    (PIX_IP, "src/financeiro/regras.ts"),
    (MODO_TEXTO_IP, "src/financeiro/ui/FinanceiroDoAluno.tsx"),
    ('marca="recibo-ip"', "src/financeiro/ui/FinanceiroDoAluno.tsx"),
    ('pix_manual: "Pix manual", nenhum: "Não cobra pelo app"', "src/master/regras.ts"),
    ("Recebimento: ${ROTULO_RECEBIMENTO[modo]}.", "src/master/paginas/Integracoes.tsx"),
)
# os data-* que não moram no src/ (vêm das bibliotecas: o sonner e o Radix)
ATRIBUTOS_DE_FORA = {"data-sonner-toast", "data-sonner-toaster", "data-state", "data-alvo"}  # data-alvo: a página de mentira do --seco

# Jeito 2 medido: as 2 tabelas do Recebimento na API REST (o \b separa "contas" de "conta_membros")
REST_DO_RECEBIMENTO = re.compile(r"/rest/v1/(recebimento_chaves|contas)\b")
# a página da InfinitePay (o checkout e o recibo): no navegador do teste ela recebe uma página vazia
PAGINA_DA_INFINITEPAY = re.compile(r"^https://([a-z0-9-]+\.)*(infinitepay\.io|infinitepay\.com\.br)/", re.I)
# o --seco barra no Edge a API (os 2 domínios próprios e o supabase) e a InfinitePay — o site servido passa
API_E_FORA = re.compile(r"^https?://(api(-principal)?\.physiqcalc\.com\.br|([a-z0-9-]+\.)*supabase\.(co|com)|"
                        r"([a-z0-9-]+\.)*infinitepay\.(io|com\.br))(:\d+)?/", re.I)
# o pedido de cada link (I4): `<cobranca_id>-<n>` (o PEDIDO_DO_LINK de _shared/infinitepay-regras.ts)
PEDIDO_DO_LINK = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[1-9][0-9]{0,3}$")
_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
CTX: dict = {"prints": []}


class Parou(Exception):
    """A guarda de /health mandou parar: nada mais roda (o desfazer roda no finally)."""


# ───────────────────────── funções puras ─────────────────────────

def limpo(t: str | None) -> str:
    return re.sub(r"\s+", " ", t or "").strip()


def reais(v: float | int) -> str:
    """O reais() da tela (src/financeiro/regras.ts): "R$ 10,00", "R$ 1.000,00"."""
    s = f"{float(v):,.2f}"
    return "R$ " + s.replace(",", "_").replace(".", ",").replace("_", ".")


def sem_tag(texto: str, tag: str | None) -> str:
    """A InfiniteTag de teste é dado pessoal (do Weslley): nunca na saída — nem dentro de uma url ou de um erro."""
    return re.sub(re.escape(tag), "<InfiniteTag>", texto, flags=re.I) if tag else texto


def host(url: str | None) -> str:
    return urlparse(url or "").hostname or "-"


def uuid_ok(v: object) -> bool:
    return isinstance(v, str) and bool(_UUID.match(v))


def url_da_volta(cobranca: str, nsu: str, n: int = 1) -> str:
    """A volta da página da InfinitePay (o redirect_url com a busca que ela acrescenta), para o link n da cobrança."""
    q = {"order_nsu": f"{cobranca}-{n}", "transaction_nsu": nsu, "slug": "e2e-volta", "capture_method": "pix",
         "receipt_url": "https://recibo.infinitepay.io/e2e-volta"}
    return "/perfil/pagamentos?" + urlencode(q)


def pagina_da_lista(posicao: int, por_pagina: int = POR_PAGINA_MASTER) -> int:
    """A página (1, 2, …) de quem está na posição (1, 2, …) de uma lista paginada."""
    return (max(1, posicao) - 1) // por_pagina + 1


def painel_travado(c: dict | None, hoje: str) -> bool:
    """A trava do painel pelo plano do PROFISSIONAL (situacaoEfetiva + travaDoPainel de src/nucleo/cobranca/regras.ts; a GatePlano
    pula a cobrança legada e a conta do app) — a mesma do e2e/wp/telas.py."""
    if not c or c.get("cobranca_legada") or c.get("origem") == "app" or c.get("situacao") == "isenta":
        return False
    if c.get("situacao") in ("suspensa", "cancelada"):
        return True
    if c.get("vence_em"):
        fim = dt.date.fromisoformat(c["vence_em"][:10]) + dt.timedelta(days=max(0, c.get("tolerancia_dias") or 0))
        if fim.isoformat() >= hoje:
            return False
    return not (c.get("teste_ate") and c["teste_ate"][:10] >= hoje)


class RodadaW1(B.Rodada):
    """A Rodada da hml-18 (o placar e a cópia da saída) que troca a InfiniteTag de teste por <InfiniteTag> em tudo o que sai."""

    tag: str | None = None

    def linha(self, texto: str) -> None:
        super().linha(sem_tag(texto, self.tag))

    def ok(self, cond: object, texto: str, parar: bool | None = None) -> bool:
        return super().ok(cond, sem_tag(texto, self.tag), parar)


class GuardaW1(B17.Guarda):
    """A Guarda da hml-17 (produção SÓ LEITURA: o navegador aborta toda escrita) com a leitura nova da W1: a prof_recebimento
    (Configurações › Recebimento pela função — jeito 2) só lê. O resto da pagamentos-aluno fora das leituras de antes continua barrado
    (salvar, testar, chaves, aluno_ip_*); as barradas dela ficam com a ação, para a conferência do fim."""

    LEITURAS_W1 = {"prof_recebimento"}

    def __init__(self) -> None:
        super().__init__()
        self.barradas_pagamentos: list[str] = []

    def escrita(self, req) -> bool:
        tipo, nome = B17.alvo(req.url)
        if (tipo == "fn" and nome == "pagamentos-aluno" and req.method not in ("GET", "HEAD", "OPTIONS")
                and urlparse(req.url).hostname in (B17.API_P_HOST, B17.API_T_HOST)):
            acao = B17.acao_do_corpo(req)
            if acao in self.LEITURAS_W1:
                return False
            grava = super().escrita(req)
            if grava:
                self.barradas_pagamentos.append(str(acao))
            return grava
        return super().escrita(req)


# ───────────────────────── a guarda e o banco ─────────────────────────

def saude_dos_2() -> bool:
    """/health do Treino e do principal pela Management API (db, auth, rest): UNHEALTHY, sem resposta ou lento (≥ 10 s) → parar."""
    ok = True
    for nome, ref in (("Treino", W6.TREINO_REF), ("principal", W6.PRINCIPAL_REF)):
        t0 = time.time()
        try:
            st, r, _ = W6.http("GET", f"https://api.supabase.com/v1/projects/{ref}/health?services=db&services=auth&services=rest", None,
                               {"Authorization": f"Bearer {W6.ler('.pc-pat')}"}, timeout=30)
        except Exception as e:  # noqa: BLE001
            st, r = type(e).__name__, None
        dt_ = time.time() - t0
        bom = st == 200 and isinstance(r, list) and bool(r) and all(x.get("status") == "ACTIVE_HEALTHY" for x in r) and dt_ < 10
        estado = [(x.get("name"), x.get("status")) for x in r] if isinstance(r, list) else r
        print(f"   /health do {nome}: {st} {estado} em {dt_:.1f} s", flush=True)
        ok = ok and bom
    return ok


def guarda() -> None:
    if not saude_dos_2():
        raise Parou("um dos 2 bancos não está saudável — parar (regra de 10/10)")


def guardar_estado(est: dict) -> None:
    ESTADO_ARQ.parent.mkdir(parents=True, exist_ok=True)
    ESTADO_ARQ.write_text(json.dumps(est, ensure_ascii=False, indent=1), encoding="utf-8")
    ESTADO_ARQ.chmod(0o600)


def _ler_json(arq: Path) -> dict | None:
    if not arq.exists():
        return None
    try:
        return json.loads(arq.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise RuntimeError(f"o arquivo de estado {arq} não abre ({e}): conferir à mão antes de rodar de novo") from e


def plano_da_conta(conta: str) -> dict | None:
    """Os campos do plano do PROFISSIONAL (o que a trava do painel lê)."""
    return API.um(f"""select situacao, vence_em::text as vence_em, teste_ate::text as teste_ate, tolerancia_dias, cobranca_legada, origem
                        from {S}.contas where id = '{conta}'""")


def devolver_plano_da_conta(est: dict) -> None:
    pc = est.get("plano_conta")
    if not pc:
        return
    sit, vence, teste = API.lit(pc["situacao"]), API.lit(pc["vence_em"]), API.lit(pc["teste_ate"])
    API.sql(f"""update {S}.contas set situacao = {sit}, vence_em = {vence}::date, teste_ate = {teste}::date
                 where id = '{est['conta']}' and (situacao is distinct from {sit} or vence_em is distinct from {vence}::date
                   or teste_ate is distinct from {teste}::date)""")


def papel_do_master(uid: str) -> str | None:
    r = API.um(f"select role from {S}.profiles where id = '{uid}'")
    return r["role"] if r else None


def dar_master(R) -> bool:
    """A w27-master vira master SÓ no staging.profiles (o dar_master do e2e/w27/_base.py — hml-02/H-04: nunca no Auth), com a foto do
    papel de antes no arquivo de estado ANTES de mexer."""
    assert S == "staging", "master de teste só no staging (hml-02/H-04)"
    uid = W6.B5.uid(MASTER)
    papel = papel_do_master(uid) if uid else None
    if not uid or papel is None:
        R.ok(False, f"8. a {MASTER} sem login ou sem perfil no {S}.profiles ({bool(uid)})")
        return False
    est = CTX["est"]
    if not est.get("master"):
        est["master"] = {"uid": uid, "papel": papel}
        guardar_estado(est)
    API.sql(f"update {S}.profiles set role = 'master' where id = '{uid}' and role is distinct from 'master'")
    return True


def devolver_master(est: dict) -> None:
    m = est.get("master")
    if not m or m.get("papel") in (None, "master"):
        return
    API.sql(f"update {S}.profiles set role = {API.lit(m['papel'])} where id = '{m['uid']}' and role = 'master'")


def funcoes_da_w1(R) -> bool:
    """As 2 funções da W1 PUBLICADAS no staging (a tela local fala com elas), conferidas só lendo e ANTES de mexer no banco: a
    pagamentos-aluno conhece a prof_recebimento (como o dono, com a MESMA sessão do navegador — o logout do fim fecha as duas) e o
    infinitepay-webhook-aluno responde ao GET (ignorado_metodo). Sem elas a tela cai no passo 1 — a rodada não começa."""
    API.CTX.update(local=False)
    email = W6.B5.CONTAS[ALUNO][0].lower()
    r = API.um(f"""select p.conta_id::text as c from {S}.pacientes p join auth.users u on u.id = p.user_id
                    where lower(u.email) = {API.lit(email)} and p.deleted_at is null order by p.ativo desc, p.created_at limit 1""")
    W6._tokens[DONO] = (time.time(), CTX["logins"].token(DONO))
    st, rec = API.pedir(DONO, "prof_recebimento", {"conta_id": (r or {}).get("c")})
    ok_pag = R.ok(st == 200 and isinstance(rec.get("infinitepay"), dict) and isinstance(rec.get("chaves"), list),
                  f"a pagamentos-aluno publicada tem as ações da W1 (prof_recebimento: {st} {rec.get('erro') or ''})")
    st, wr, _ = API.webhook(None, metodo="GET")
    ok_web = R.ok(st == 200 and wr.get("resultado") == "ignorado_metodo",
                  f"o infinitepay-webhook-aluno publicado responde (GET: {st} {wr.get('resultado') or ''})")
    if not (ok_pag and ok_web):
        R.linha("   publique as 2 funções do HEAD no staging antes (a Task 12 do plano) — nada foi mexido no banco")
    return ok_pag and ok_web


def preparar(R) -> bool:
    """O ponto de partida do e2e/w1/api.py (a foto da matrícula do aluno2, da conta do prof2 e da flag ANTES de mexer; as mensalidades
    de antes escondidas; R$ 10,00 que venceu ontem; Pix na chave; a flag ligada) + as marcas desta rodada no arquivo de estado dela (o
    plano do PROFISSIONAL da conta; o painel travado é liberado só durante a rodada)."""
    API.CTX.update(local=False, tag=CTX.get("tag"))
    try:
        API.preparar()
    except Exception as e:  # noqa: BLE001
        R.ok(False, f"preparo: {type(e).__name__}: {str(e)[:300]}")
        return False
    conta, pac = API.CTX["conta"], API.CTX["pac"]
    est = {"t0": API.CTX["t0"], "conta": conta, "plano_conta": plano_da_conta(conta), "master": None}
    guardar_estado(est)  # se a rodada cair no meio, a próxima (ou --limpar) desfaz por este arquivo e pelo do api.py
    treino = API.um(f"select treino_user_id::text as t from {S}.pacientes where id = '{pac}'")["t"]
    CTX.update(est=est, conta=conta, pac=pac, treino=treino)
    if painel_travado(est["plano_conta"], W6.hoje()):
        API.sql(f"update {S}.contas set situacao = 'ativa', vence_em = {API.lit(W6.dias(30))}::date where id = '{conta}'")
        R.linha(f"   o painel do {DONO} estava travado (o plano do profissional da conta de TESTE: {est['plano_conta']}): liberado só durante a rodada")
    m = API.um(f"""select p.mensalidade_valor::float as v, p.mensalidade_pago_ate::text as ate, c.recebimento_modo as modo
                     from {S}.pacientes p join {S}.contas c on c.id = p.conta_id where p.id = '{pac}'""")
    return R.ok(m["v"] == 10.0 and m["modo"] == "pix_manual",
                f"preparo: o {ALUNO} com R$ 10,00 a pagar, a conta no Pix na chave e a flag ligada (estado em {API.ESTADO_ARQ.name} e "
                f"{ESTADO_ARQ.name}) ({m})")


def sobras(api_est: dict) -> dict:
    return API.um(f"""select (select count(*) from {S}.cobrancas where paciente_id = '{api_est['paciente']}'
                               and created_at >= {API.lit(api_est['t0'])}::timestamptz)::int as cobrancas,
                             (select count(*) from {S}.planos_aluno where nome like {API.lit(API.PREFIXO + ' %')})::int as planos,
                             (select count(*) from {S}.recebimento_chaves where chave like 'w1e2e%@teste.com')::int as chaves""")


def desfazer(R, api_est: dict | None, telas_est: dict | None) -> None:
    R.linha("\n── desfazer: sai o que a rodada criou; a matrícula, a conta (forma, bloqueio, chaves, InfiniteTag, plano do profissional), a flag "
            "e o papel da w27-master voltam à foto de antes")
    try:
        if telas_est:
            devolver_master(telas_est)
            devolver_plano_da_conta(telas_est)
        if api_est:
            API.limpar(api_est)
        agora = API.foto(api_est["paciente"], API.conta_do_estado(api_est)) if api_est else None
        sobra = sobras(api_est) if api_est else {}
        plano = plano_da_conta(telas_est["conta"]) if telas_est and telas_est.get("plano_conta") else None
        papel = papel_do_master(telas_est["master"]["uid"]) if telas_est and telas_est.get("master") else None
    except Exception as e:  # noqa: BLE001
        R.ok(False, f"a limpeza quebrou ({e!r}) — o estado ficou em {API.ESTADO_ARQ} e {ESTADO_ARQ}: rode  "
                    f"python3 e2e/w1/telas.py --base local --limpar"[:500])
        return
    difs: list[str] = []
    if api_est and agora is not None:
        chaves = ("pacientes", "conta", "chaves", "integracao", "flag", "vivas", "assinaturas", "rodada")
        difs += [f"{k}: {api_est.get(k)!r} → {agora[k]!r}" for k in chaves if api_est.get(k) != agora[k]]
    if telas_est and telas_est.get("plano_conta") and plano != telas_est["plano_conta"]:
        difs.append(f"o plano da conta: {telas_est['plano_conta']} → {plano}")
    if telas_est and telas_est.get("master") and telas_est["master"].get("papel") != papel:
        difs.append(f"o papel da {MASTER}: {telas_est['master'].get('papel')} → {papel}")
    R.ok(not difs and not any(sobra.values()),
         f"tudo voltou à foto de antes e nada da rodada ficou ({'; '.join(difs) or 'igual'} · sobras {sobra})")
    API.ESTADO_ARQ.unlink(missing_ok=True)
    ESTADO_ARQ.unlink(missing_ok=True)


def garantir_infinitepay(R, rotulo: str) -> bool:
    """A conta na InfinitePay com a InfiniteTag de teste: no site o passo 2 já fez pela tela; senão (a loja, ou o passo 2 falhou), o
    atalho do api.py pelo banco."""
    if not CTX.get("tag"):
        R.ok(False, f"{rotulo}. falta a InfiniteTag de teste (~/.physiq-infinitetag-teste — está no cofre) — pulei")
        return False
    if API.um(f"select recebimento_modo as m from {S}.contas where id = '{CTX['conta']}'")["m"] != "infinitepay":
        API.ligar_infinitepay()
        R.linha(f"   ({rotulo}. a conta foi para a InfinitePay pelo banco — o atalho do api.py; o caminho pela tela é o passo 2 do site)")
    return True


def valor_da_mensalidade() -> float:
    return API.um(f"select mensalidade_valor::float as v from {S}.pacientes where id = '{CTX['pac']}'")["v"]


def marcar_paga_no_banco(c: str) -> None:
    """O resultado de uma baixa (só para a tela do passo 6): o caminho de verdade da baixa é o do api.py --local."""
    API.sql(f"""update {S}.cobrancas set status = 'paga', pago_em = now(), metodo = 'pix', ip_meio = 'pix', ip_transaction_nsu = 'E2E-TELA-' || substr(md5(random()::text), 1, 8),
                ip_recibo_url = 'https://recibo.infinitepay.io/e2e-tela' where id = '{c}'""")
    API.sql(f"select {S}.mensalidade_recalcular('{CTX['pac']}')")


def pagina_da_conta(conta: str) -> int:
    """A página da conta em master › Integrações (a ordem da master_integracoes: a conta do app primeiro, o nome, o id)."""
    r = API.um(f"""select rn from (select id, row_number() over (order by (origem = 'app') desc, lower(nome), id) as rn from {S}.contas) x
                    where id = '{conta}'""")
    return pagina_da_lista(r["rn"] if r else 1)


# ───────────────────────── o navegador ─────────────────────────

# O alvo do print à vista: o meio da parte dele que está na tela é ele mesmo (ou um filho) — não a barra de baixo do celular
# ([data-tabbar], fixa), o topo do app ou outra coisa por cima. Um aviso do sonner por cima não conta (é a prova do passo e some sozinho).
# → None (à vista) ou o que está por cima / 'fora da tela'.
JS_A_VISTA = r"""(e) => {
  const r = e.getBoundingClientRect();
  const x0 = Math.max(r.left, 0), x1 = Math.min(r.right, innerWidth), y0 = Math.max(r.top, 0), y1 = Math.min(r.bottom, innerHeight);
  if (x1 - x0 < 1 || y1 - y0 < 1) return 'fora da tela';
  const p = document.elementFromPoint((x0 + x1) / 2, (y0 + y1) / 2);
  if (!p || p === e || e.contains(p) || p.closest('[data-sonner-toaster]')) return null;
  if (p.closest('[data-tabbar]')) return 'a barra de baixo [data-tabbar]';
  return p.tagName.toLowerCase() + '[' + [...p.attributes].map(a => a.name).filter(n => n.startsWith('data-')).slice(0, 2).join(',') + ']';
}"""


# Cada botão da tela DENTRO do cartão (a 390): a caixa do botão fica dentro da caixa mais perto dele — o cartão ([data-cartao]) ou uma
# caixa com borda dos 2 lados (a da InfinitePay, o item da chave Pix) — e o rótulo não passa da borda do próprio botão. Em 11/10 o "Testar
# (abre a sua página, sem cobrar)" passou da borda do cartão a 390 (o pq-botao é nowrap com 44 px fixos) e a medida da largura da página não
# pegou: o botão não passava da TELA. → a lista do que passa (vazia = tudo dentro).
JS_BOTOES_FORA = r"""(raiz) => {
  const fora = [];
  for (const b of raiz.querySelectorAll('button, [role=button], a.pq-botao')) {
    const r = b.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    let c = b.parentElement;
    while (c && c !== raiz && !c.hasAttribute('data-cartao')) {
      const s = getComputedStyle(c);
      if (parseFloat(s.borderLeftWidth) > 0 && parseFloat(s.borderRightWidth) > 0) break;
      c = c.parentElement;
    }
    const k = (c || raiz).getBoundingClientRect();
    const passa = Math.max(k.left - r.left, r.right - k.right, k.top - r.top, r.bottom - k.bottom);
    const rotulo = b.scrollWidth - b.clientWidth;
    if (passa > 0.5 || rotulo > 1) {
      const nome = b.getAttributeNames().find((n) => n.startsWith('data-') && n !== 'data-state') || (b.textContent || '').trim().slice(0, 40);
      fora.push(passa > 0.5 ? nome + ' passa ' + passa.toFixed(1) + ' px da caixa' : nome + ': o rótulo passa ' + rotulo + ' px da borda do botão');
    }
  }
  return fora;
}"""
RAIZ_RECEBIMENTO = "[data-config-aba='recebimento']"
# o que mostra a InfiniteTag na tela (o campo do Recebimento e a da conta no master): borrado em TODO print — também no da falha
BORRAR_TAG = "[data-infinitetag], [data-infinitetag-da-conta]"
# O botão LIVRE: nenhum aviso (toast) por cima dele e o meio dele é ele mesmo — sem a folga do JS_A_VISTA para o sonner. Em 11/10 o "Ainda
# não chegou…" saía em toast por cima do "Conferir pagamento" que ele mandava apertar. → None (livre) ou o que está por cima.
JS_NADA_POR_CIMA = r"""(e) => {
  const r = e.getBoundingClientRect();
  for (const t of document.querySelectorAll('[data-sonner-toast]')) {
    const q = t.getBoundingClientRect();
    if (q.width > 0 && q.height > 0 && q.left < r.right && r.left < q.right && q.top < r.bottom && r.top < q.bottom)
      return 'o aviso (toast) "' + (t.textContent || '').trim().slice(0, 60) + '"';
  }
  const x0 = Math.max(r.left, 0), x1 = Math.min(r.right, innerWidth), y0 = Math.max(r.top, 0), y1 = Math.min(r.bottom, innerHeight);
  if (x1 - x0 < 1 || y1 - y0 < 1) return 'fora da tela';
  const p = document.elementFromPoint((x0 + x1) / 2, (y0 + y1) / 2);
  return !p || p === e || e.contains(p) ? null : p.tagName.toLowerCase();
}"""


def enquadrar(pg, alvo: str) -> str | None:
    """Rola o alvo para o MEIO da tela antes do print (o do e2e/hml18/largura.py) → None se ele ficou à vista, senão o que está por cima.
    O scroll_into_view_if_needed não servia: ele só rola quando o alvo está fora da tela — o que já está nela, por baixo da barra de baixo
    fixa do celular, ficava lá (o 8_master_integracoes-390 de 11/10)."""
    loc = pg.locator(alvo).first
    try:
        loc.evaluate("e => e.scrollIntoView({ block: 'center', inline: 'nearest' })", timeout=5000)
        pg.wait_for_timeout(150)
        return loc.evaluate(JS_A_VISTA, timeout=5000)
    except Exception as e:  # noqa: BLE001 — o alvo sumiu no meio
        return f"o alvo sumiu ({type(e).__name__})"


def enquadramento_no_edge(R, nav) -> None:
    """--seco: uma página de mentira a 390 × 844 com a barra de baixo fixa (120 px) e o alvo JÁ dentro da tela, mas por baixo dela (o caso do
    8_master_integracoes-390 de 11/10: na volta de 1280 para 390 a linha da conta caiu atrás da barra e o scroll "se precisar" não rolou)."""
    ctx = nav.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    try:
        pg = ctx.new_page()
        pg.set_content("<meta name='viewport' content='width=device-width, initial-scale=1'><body style='margin:0'>"
                       "<div style='height:760px'></div><div data-alvo style='height:60px'>o alvo</div><div style='height:1500px'></div>"
                       "<nav data-tabbar style='position:fixed;left:0;right:0;bottom:0;height:120px;background:#111'><a href='#'>Início</a></nav>"
                       "</body>")
        por_cima = enquadrar(pg, "[data-alvo]")
    finally:
        ctx.close()
    R.ok(por_cima is None, f"seco: o print põe o alvo à vista, fora de baixo da barra de baixo do celular ({por_cima or 'à vista'})")


def nada_por_cima_no_edge(R, nav) -> None:
    """--seco: a checagem do botão livre (JS_NADA_POR_CIMA) numa página de mentira a 390 × 844 — o caso do 4_app_aguardando de 11/10: o
    aviso (toast) embaixo da tela, por cima do botão de baixo da folha, é pego; sem ele, o botão fica livre."""
    ctx = nav.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    try:
        pg = ctx.new_page()
        pg.set_content("<meta name='viewport' content='width=device-width, initial-scale=1'><body style='margin:0'>"
                       "<div style='position:fixed;left:0;right:0;bottom:0;height:260px;background:#111'>"
                       "<button id='conferir' style='position:absolute;left:20px;right:20px;bottom:60px;height:44px'>Conferir pagamento</button></div>"
                       "<ol><li data-sonner-toast style='position:fixed;left:16px;right:16px;bottom:40px;height:90px;background:#222;color:#fff'>"
                       "Ainda não chegou a confirmação da InfinitePay</li></ol></body>")
        com = pg.locator("#conferir").evaluate(JS_NADA_POR_CIMA)
        pg.evaluate("document.querySelector('li').remove()")
        sem = pg.locator("#conferir").evaluate(JS_NADA_POR_CIMA)
    finally:
        ctx.close()
    R.ok(bool(com) and "toast" in str(com) and sem is None,
         f"seco: o aviso (toast) por cima do botão de baixo da folha é pego ({com}); sem ele, o botão fica livre ({sem or 'livre'})")


def botoes_no_edge(R, nav, base: str) -> None:
    """--seco: a checagem do botão dentro do cartão (JS_BOTOES_FORA) com o CSS do BUILD SERVIDO, a 390 × 844, numa página de mentira com a
    caixa da InfiniteTag do Recebimento na mesma largura (o px-4 do painel, o cartão p-5 e a caixa px-3.5): o botão de rótulo longo como era
    em 11/10 (só o pq-botao: nowrap e 44 px) passa da caixa e é pego; com as classes do BOTAO_LONGO do Recebimento.tsx, o "Testar" e o
    "Ativar" quebram a linha dentro da caixa, com a altura mínima de 44 px do toque; o rótulo que passa da borda do próprio botão (w-full)
    também é pego. O "Ativar" só aparece com o erro do checkout desligado — a rodada com banco não chega nele."""
    m = re.search(r'const BOTAO_LONGO = "([^"]+)"', (REPO / "src" / "painel" / "configuracoes" / "Recebimento.tsx").read_text(encoding="utf-8"))
    if not m:
        R.ok(False, "seco: o BOTAO_LONGO (as classes do botão de rótulo longo) não está no Recebimento.tsx")
        return
    try:
        with urllib.request.urlopen(base + "/", timeout=15) as r:
            estilos = re.findall(r'<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"', r.read().decode("utf-8"))
    except Exception as e:  # noqa: BLE001
        R.ok(False, f"seco: o index.html do build servido não abriu ({type(e).__name__}: {str(e)[:160]})")
        return
    icone = "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor'><path d='M15 3h6v6M10 14 21 3'/></svg>"
    testar, ativar = "Testar (abre a sua página, sem cobrar)", "Ativar o checkout externo na InfinitePay"
    botoes = (("data-antes", "self-start", testar), ("data-testar", m.group(1), testar), ("data-ativar", m.group(1), ativar),
              ("data-largo", "w-full", ativar))
    pagina = ("<!doctype html><html lang='pt-BR'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'>"
              + "".join(f"<link rel='stylesheet' href='{x}'>" for x in estilos)
              + "</head><body><div id='raiz' class='px-4 pt-4'><div data-cartao class='pq-cartao p-5'>"
              + "<div class='flex flex-col gap-2 rounded-2xl border border-linha bg-superficie px-3.5 py-3'>"
              + "".join(f"<button type='button' class='pq-botao pq-botao-g {c}' {a}>{icone}{t}</button>" for a, c, t in botoes)
              + "</div></div></div></body></html>")
    ctx = nav.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    try:
        ctx.route(base + "/__w1_botoes", lambda route, _req=None: route.fulfill(status=200, content_type="text/html; charset=utf-8", body=pagina))
        pg = ctx.new_page()
        pg.goto(base + "/__w1_botoes", wait_until="load", timeout=60_000)
        pg.evaluate("document.fonts.ready.then(() => true)")
        fora = pg.locator("#raiz").evaluate(JS_BOTOES_FORA)
        alturas = dict(pg.evaluate("[...document.querySelectorAll('button')].map((b) => [b.getAttributeNames().find((n) => n.startsWith('data-')), "
                                   "Math.round(b.getBoundingClientRect().height)])"))
    except Exception as e:  # noqa: BLE001
        R.ok(False, f"seco: a página dos botões a 390 não abriu ({type(e).__name__}: {str(e)[:160]})")
        return
    finally:
        ctx.close()
    pegos = {x.split(" ")[0].rstrip(":") for x in fora}
    R.ok(bool(estilos) and pegos == {"data-antes", "data-largo"},
         f"seco: a 390, com o CSS do build ({len(estilos)} folha(s)), o botão nowrap que passa do cartão e o rótulo que passa do botão são pegos; o "
         f"'Testar' e o 'Ativar' com o BOTAO_LONGO ficam dentro ({'; '.join(fora) or 'nada pego'})")
    R.ok(all(alturas.get(a, 0) >= 44 for a in ("data-testar", "data-ativar")) and alturas.get("data-ativar", 0) > 44,
         f"seco: o 'Testar' e o 'Ativar' quebram a linha e ficam com pelo menos 44 px de altura (o toque) (alturas {alturas})")


class Tela(B.Celular):
    """O Celular da hml-18 (o Edge em modo celular, a sessão antes do 1º documento, o `legal` desligado só no navegador, o diálogo
    nativo contado) com o print de nome fixo e a medida da largura (o molde do e2e/wp/telas.py). A 1280 o painel abre no layout de
    computador (o mesmo contexto, set_viewport_size). A página da InfinitePay nunca abre: o pedido da aba recebe uma página vazia."""

    def __init__(self, nav, base: str, R, rotulo: str, largura: int = 390, guarda: B17.Guarda | None = None) -> None:
        super().__init__(nav, base, 390, guarda=guarda)
        self.R, self.rotulo = R, rotulo
        self.paginas_de_fora = 0
        self.ctx.route(PAGINA_DA_INFINITEPAY, self._pagina_de_fora)
        if largura != 390:
            self.largura_(largura)

    def _pagina_de_fora(self, route, _req=None) -> None:
        self.paginas_de_fora += 1
        try:
            route.fulfill(status=200, content_type="text/html; charset=utf-8",
                          body="<!doctype html><meta charset=utf-8><title>InfinitePay (E2E)</title><p>A página da InfinitePay não abre no E2E.</p>")
        except Exception:  # noqa: BLE001 — a aba fechou no meio
            pass

    def largura_(self, largura: int) -> None:
        self.tamanho(largura)
        self.pg.wait_for_timeout(900)

    def texto(self, seletor: str) -> str:
        try:
            loc = self.pg.locator(seletor)
            return limpo(loc.first.inner_text(timeout=5000)) if loc.count() else ""
        except Exception:  # noqa: BLE001 — navegando
            return ""

    def textos(self, seletor: str) -> str:
        try:
            return limpo(" | ".join(self.pg.locator(seletor).all_inner_texts()))
        except Exception:  # noqa: BLE001
            return ""

    def clicar(self, seletor: str, timeout: float = 15_000) -> None:
        self.pg.locator(seletor).first.click(timeout=timeout)

    def painel_aberto(self) -> bool:
        return self.pg.locator("[role=dialog][data-state=open]").count() > 0

    def titulo_do_painel(self) -> str:
        return self.texto("[role=dialog][data-state=open] h2")

    def fechar_painel(self) -> bool:
        self.pg.keyboard.press("Escape")
        return self.esperar(lambda: not self.painel_aberto(), 10)

    def toasts(self) -> str:
        return self.textos("[data-sonner-toast]")

    def foto(self, nome: str, alvo: str | None = None, borrar: str | None = None, botoes: str | None = None) -> str:
        """O print em <pasta>/<nome>.png com o elemento à vista; antes, a medida: nada passa da largura (scrollWidth da página).
        borrar: o seletor do que sai borrado além da InfiniteTag (BORRAR_TAG, sempre): na produção, as listas e as chaves.
        botoes: a raiz da tela em que cada botão fica dentro do cartão — conferido a 390 (JS_BOTOES_FORA)."""
        fora = None
        if botoes and self.largura == 390:
            try:
                fora = self.pg.locator(botoes).first.evaluate(JS_BOTOES_FORA, timeout=5000)
            except Exception as e:  # noqa: BLE001 — a raiz sumiu no meio
                fora = [f"a raiz {botoes} sumiu ({type(e).__name__})"]
        if alvo:
            enquadrar(self.pg, alvo)
        borrar = f"{BORRAR_TAG}, {borrar}" if borrar else BORRAR_TAG
        try:
            self.pg.add_style_tag(content=f"{borrar} {{ filter: blur(7px) !important; }}")
        except Exception:  # noqa: BLE001
            pass
        self.pg.wait_for_timeout(700)
        try:
            m = self.pg.evaluate(B.JS_LARGURA)
        except Exception as e:  # noqa: BLE001
            m = {"passa": None, "raizes": [type(e).__name__]}
        por_cima = None
        if alvo:
            try:
                por_cima = self.pg.locator(alvo).first.evaluate(JS_A_VISTA, timeout=5000)
            except Exception as e:  # noqa: BLE001
                por_cima = f"o alvo sumiu ({type(e).__name__})"
        pasta: Path = CTX["pasta"]
        pasta.mkdir(parents=True, exist_ok=True)
        arq = pasta / f"{nome}.png"
        for tentativa in range(3):
            try:
                self.pg.screenshot(path=str(arq))
                break
            except Exception as e:  # noqa: BLE001
                if "Unable to capture screenshot" not in str(e) or tentativa == 2:
                    raise
                self.pg.wait_for_timeout(1500)
        passa = m.get("passa")
        raizes = "; " + ", ".join(m.get("raizes") or [])[:220] if passa else ""
        vista = "" if not alvo else ("; o alvo à vista" if por_cima is None else f"; o alvo por baixo de {por_cima}")
        self.R.ok(passa is not None and passa <= 0 and por_cima is None,
                  f"   print {arq.name} ({self.largura} px): nada passa da largura (passa {passa} px{raizes}){vista}")
        if fora is not None:
            self.R.ok(not fora, f"   print {arq.name}: cada botão da tela dentro do cartão ({'; '.join(fora)[:300] or 'todos dentro'})")
        CTX["prints"].append(str(arq))
        return str(arq)

    def fotos(self, nome: str, alvo: str | None = None, borrar: str | None = None, botoes: str | None = None) -> None:
        """A mesma tela no computador (1280: <nome>.png) e no celular (390: <nome>-390.png); volta para a largura de antes."""
        antes = self.largura
        for largura, sufixo in ((1280, ""), (390, "-390")):
            if self.largura != largura:
                self.largura_(largura)
            self.foto(nome + sufixo, alvo, borrar, botoes)
        if self.largura != antes:
            self.largura_(antes)

    def diagnostico(self, nome: str) -> None:
        try:
            pasta: Path = CTX["pasta"] / "falhas"
            pasta.mkdir(parents=True, exist_ok=True)
            try:  # a InfiniteTag sai borrada também no print da falha (a tela pode ter parado com ela à vista)
                self.pg.add_style_tag(content=f"{BORRAR_TAG} {{ filter: blur(7px) !important; }}")
            except Exception:  # noqa: BLE001
                pass
            self.pg.screenshot(path=str(pasta / f"{nome}_{self.rotulo.replace(' ', '_')}.png"))
            self.R.linha(f"   diagnóstico [{self.rotulo}]: {self.caminho()} · erros de página {self.erros[-3:]}")
        except Exception:  # noqa: BLE001
            pass

    def encerrar(self, logins=None) -> None:
        graves = [e for e in self.erros if "ResizeObserver" not in e]
        self.R.ok(not graves and not self.dialogos, f"[{self.rotulo}] sem erro de página nem diálogo nativo ({graves[:2]} {self.dialogos[:2]})")
        self.fim(logins)


def vigiar_rede(t: Tela) -> list[str]:
    """Jeito 2 medido: cada pedido do navegador à API REST das 2 tabelas do Recebimento vira uma linha "MÉTODO caminho" (sem a busca)."""
    vistos: list[str] = []
    t.pg.on("request", lambda req: vistos.append(f"{req.method} {urlparse(req.url).path}") if REST_DO_RECEBIMENTO.search(req.url) else None)
    return vistos


def aba_da_infinitepay(t: Tela, clicar_em: str) -> str | None:
    """Clica e espera a aba nova. A reservada nasce about:blank e só vai para a InfinitePay depois da resposta do servidor: espera a url
    da InfinitePay (no commit — a página é a vazia do teste), confere e FECHA sem pagar (nunca print da página de fora). → a url."""
    with t.pg.context.expect_page(timeout=30_000) as nova:
        t.clicar(clicar_em)
    pg = nova.value
    url = None
    try:
        pg.wait_for_url(API.HOST_IP, wait_until="commit", timeout=60_000)
        url = pg.url
    except Exception:  # noqa: BLE001 — o servidor recusou e a tela fechou a aba, ou passou do tempo
        url = None
    finally:
        try:
            pg.close()
        except Exception:  # noqa: BLE001
            pass
    return url if url and API.HOST_IP.match(url) else None


def confirmar_no_app(t: Tela, espera: float = 10.0) -> bool:
    """A confirmação do APP (src/ui/premium/Confirmar.tsx — hml-18a, nunca o window.confirm): toca no verbo da ação e espera sair."""
    ok = t.pg.locator("[role=alertdialog][data-state=open] [data-confirmar-ok]").first
    try:
        ok.wait_for(state="visible", timeout=int(espera * 1000))
    except Exception:  # noqa: BLE001
        return False
    ok.click()
    try:
        t.pg.locator("[role=alertdialog]").first.wait_for(state="detached", timeout=5000)
    except Exception:  # noqa: BLE001
        pass
    return True


def painel(R, rota: str, antes=None) -> Tela:
    """O painel do dono (prof2), aberto 1 vez na rodada (a 1280); as próximas chamadas só navegam. antes(t): antes de navegar."""
    t = CTX.get("painel")
    if t is None:
        guarda()
        t = Tela(CTX["nav"], CTX["base"], R, "painel do dono", 1280)
        CTX["painel"] = t
        if antes:
            antes(t)
        t.entrar(CTX["logins"], DONO, rota)
    else:
        if t.largura != 1280:
            t.largura_(1280)
        if antes:
            antes(t)
        t.ir(rota)
    return t


def app_do_aluno(R, rota: str = "/perfil/pagamentos") -> Tela:
    """O app do aluno (aluno2) a 390, aberto 1 vez na rodada; as próximas chamadas navegam (recarregam a tela)."""
    t = CTX.get("aluno")
    if t is None:
        guarda()
        t = Tela(CTX["nav"], CTX["base"], R, "app do aluno", 390)
        CTX["aluno"] = t
        t.entrar(CTX["logins"], ALUNO, rota)
    else:
        t.ir(rota)
    return t


def ficha() -> str:
    return f"/painel/alunos/{CTX['treino'] or CTX['pac']}/financeiro"


# ───────────────────────── os passos ─────────────────────────

def passo_recebimento(R) -> None:
    R.linha("\n── 1. Configurações › Recebimento: o jeito 2 medido na rede + chave Pix (adicionar, ligar, excluir)")
    conta = CTX["conta"]
    t = painel(R, ROTA_RECEBIMENTO, antes=lambda x: CTX.update(rede=vigiar_rede(x)))
    R.ok(t.esperar(lambda: t.tem("[data-opcoes='recebimento-modo'] [data-opcao='pix_manual']") and t.tem("[data-recebimentos-lista]"), 60),
         "1. o dono abre Configurações › Recebimento (a forma e as chaves Pix)")
    marcada = t.pg.locator("[data-opcoes='recebimento-modo'] [data-opcao='pix_manual']").first.get_attribute("aria-checked")
    R.ok(marcada == "true", f"1. a forma de partida: Pix na chave (aria-checked {marcada})")
    R.ok(t.tem("[data-opcoes='recebimento-modo'] [data-opcao='infinitepay']"), "1. a opção InfinitePay aparece (a flag ligada no staging)")
    antes = API.sql(f"select id::text as id, ativa from {S}.recebimento_chaves where conta_id = '{conta}' order by criado_em, id")
    email = f"w1e2e{secrets.token_hex(3)}@teste.com"  # o desfazer do api.py apaga as 'w1e2e…@teste.com'
    t.clicar("[data-btn-adicionar-recebimento]")
    R.ok(t.esperar(lambda: t.tem("[data-dialog-recebimento] [data-pix-chave]"), 20) and t.titulo_do_painel() == "Nova chave Pix",
         f"1. 'Adicionar chave Pix' abre o painel ({t.titulo_do_painel()!r})")
    t.pg.wait_for_timeout(400)  # o efeito que zera o formulário ao abrir roda antes de digitar
    t.pg.select_option("[data-pix-tipo]", "email")
    t.pg.fill("[data-pix-chave]", email)
    t.pg.fill("[data-pix-favorecido]", "W1 Teste")
    t.clicar("[data-btn-salvar-pix]")
    item = f"[data-recebimentos-lista] [data-recebimento-item]:has-text('{email}')"
    R.ok(t.esperar(lambda: t.pg.locator(item).count() == 1 and not t.painel_aberto(), 30),
         f"1. adicionar: a chave nova aparece na lista ({t.toasts()[:90]!r})")
    nova = API.um(f"select id::text as id, ativa from {S}.recebimento_chaves where conta_id = '{conta}' and chave = {API.lit(email)}")
    R.ok(bool(nova), f"no banco: a chave nova na conta, pela função (nasce {'ligada' if nova and nova['ativa'] else 'desligada'})")
    if not nova:
        return
    switch = t.pg.locator(item).locator("[data-recebimento-switch]").first

    def ligada() -> bool:
        return t.pg.locator(f"{item}[data-recebimento-ativo]").count() == 1

    if nova["ativa"]:  # sem nenhuma ligada antes, ela nasce ligada: desliga primeiro, para o ligar ser pelo switch
        switch.click()
        t.esperar(lambda: not ligada(), 30)
    switch.click()
    R.ok(t.esperar(lambda: ligada() and t.pg.locator("[data-recebimento-item][data-recebimento-ativo]").count() == 1, 30),
         f"1. ligar: a chave nova ligada e só ela — 1 por conta ({t.toasts()[:90]!r})")
    ligadas = [x["id"] for x in API.sql(f"select id::text as id from {S}.recebimento_chaves where conta_id = '{conta}' and ativa")]
    R.ok(ligadas == [nova["id"]], f"no banco: só a chave nova ligada ({len(ligadas)} ligada(s))")
    t.fotos("1_recebimento", item, botoes=RAIZ_RECEBIMENTO)
    t.pg.locator(item).locator("[data-btn-excluir-recebimento]").first.click()
    R.ok(confirmar_no_app(t), "1. excluir: a confirmação do app (hml-18a) → Excluir")
    R.ok(t.esperar(lambda: t.pg.locator(item).count() == 0, 30), f"1. excluída: a chave some da lista ({t.toasts()[:90]!r})")
    n = API.um(f"select count(*)::int as n from {S}.recebimento_chaves where chave = {API.lit(email)}")["n"]
    R.ok(n == 0, f"no banco: a chave saiu ({n})")
    i0 = next((i for i, x in enumerate(antes) if x["ativa"]), None)
    if i0 is not None:  # a lista é por criado_em (prof_recebimento): a de antes está na mesma posição
        itens = t.pg.locator("[data-recebimentos-lista] [data-recebimento-item]")
        itens.nth(i0).locator("[data-recebimento-switch]").click()
        R.ok(t.esperar(lambda: itens.nth(i0).get_attribute("data-recebimento-ativo", timeout=2000) is not None, 30),
             "1. a chave que estava ligada antes, ligada de novo pelo switch")
        ligadas = [x["id"] for x in API.sql(f"select id::text as id from {S}.recebimento_chaves where conta_id = '{conta}' and ativa")]
        R.ok(ligadas == [antes[i0]["id"]], f"no banco: a de antes é a ligada de novo ({len(ligadas)} ligada(s))")
    R.ok(CTX["rede"] == [], f"1. jeito 2: nenhuma chamada do navegador a recebimento_chaves/contas ({CTX['rede']})")


def passo_infinitepay(R) -> None:
    R.linha("\n── 2. a InfinitePay: a InfiniteTag de teste, 'Testar' (a aba da InfinitePay, fechada sem pagar) e 'Salvar a forma'")
    tag = CTX.get("tag")
    if not tag:
        R.ok(False, "2. falta a InfiniteTag de teste (~/.physiq-infinitetag-teste — está no cofre) — pulei")
        return
    t = painel(R, ROTA_RECEBIMENTO)
    opcao = "[data-opcoes='recebimento-modo'] [data-opcao='infinitepay']"
    R.ok(t.esperar(lambda: t.tem(opcao), 60), "2. a opção InfinitePay na forma")
    t.clicar(opcao)
    R.ok(t.esperar(lambda: t.tem("[data-recebimento-infinitepay] [data-infinitetag]") and t.tem("[data-infinitepay-testar]"), 10),
         "2. escolher InfinitePay mostra o campo da InfiniteTag e o 'Testar'")
    t.pg.fill("[data-infinitetag]", f"${tag}")
    url = aba_da_infinitepay(t, "[data-infinitepay-testar]")
    R.ok(bool(url), f"2. 'Testar' abre uma aba da InfinitePay ({host(url)}) — conferida pela url e fechada sem pagar")
    R.ok(not t.tem("[data-infinitetag-erro]"), f"2. sem erro embaixo do campo ({t.texto('[data-infinitetag-erro]')!r})")
    t.clicar("[data-recebimento-salvar-modo]")
    chip = "[data-secao='recebimento-modo'] [data-chip]"
    R.ok(t.esperar(lambda: t.texto(chip) == "INFINITEPAY", 60), f"2. 'Salvar a forma' → o chip INFINITEPAY ({t.texto(chip)!r} · {t.toasts()[:90]!r})")
    co = API.um(f"""select c.recebimento_modo as modo, i.infinitepay_handle as handle from {S}.contas c
                     left join {S}.recebimento_integracoes i on i.conta_id = c.id and i.provedor = 'infinitepay' where c.id = '{CTX['conta']}'""")
    R.ok(bool(co) and co["modo"] == "infinitepay" and co["handle"] == tag,
         f"no banco: a conta na InfinitePay com a InfiniteTag de teste (forma {co and co['modo']})")
    t.fotos("2_recebimento_infinitepay", "[data-recebimento-infinitepay]", borrar="[data-infinitetag]", botoes=RAIZ_RECEBIMENTO)
    R.ok(CTX.get("rede") == [], f"2. jeito 2 (passos 1 e 2): nenhuma chamada do navegador a recebimento_chaves/contas ({CTX.get('rede')})")


def passo_planos(R) -> None:
    R.linha(f"\n── 3. Financeiro › Planos (P-B): na InfinitePay, à vista e cartão parcelado = '{PERIODO_TODO}'")
    if not garantir_infinitepay(R, "3"):
        return
    nome = f"{API.PREFIXO} tela {secrets.token_hex(3)}"  # o desfazer do api.py apaga os planos "W1 e2e …"
    pl = API.um(f"""insert into {S}.planos_aluno (conta_id, nome, valor, meses, modalidades, max_parcelas_cartao)
                    values ('{CTX['conta']}', {API.lit(nome)}, 120, 12, array['avista', 'cartao_parcelado', 'mensal'], 3) returning id::text as id""")
    card = f"[data-plano-card='{pl['id']}']"
    t = painel(R, "/painel/financeiro?aba=planos")
    R.ok(t.esperar(lambda: t.tem(card), 60), "3. o plano de teste na lista (12 meses, R$ 120: à vista, cartão parcelado até 3× e mês a mês — "
                                             "um plano de antes da InfinitePay)")
    txt = t.texto(card)
    R.ok(txt.count(PERIODO_TODO) == 1 and "Mês a mês" in txt and "À vista" not in txt and "Cartão parcelado" not in txt,
         f"3. o cartão do plano: '{PERIODO_TODO}' uma vez só (à vista e cartão parcelado dizem o mesmo) e 'Mês a mês' ({txt[:170]!r})")
    t.fotos("3_planos_periodo_todo", card)
    t.clicar(f"[data-editar-plano='{pl['id']}']")
    if not t.esperar(lambda: t.tem("[data-form-plano] [data-plano-modalidades]"), 20):
        R.ok(False, "3. 'Editar' não abriu o painel do plano")
        return
    rot = {m: t.texto(f"[data-plano-modalidades] label:has([data-plano-modalidade='{m}'])") for m in ("avista", "cartao_parcelado", "mensal")}
    R.ok(rot == {"avista": PERIODO_TODO, "cartao_parcelado": "Cartão parcelado (o seu recebimento não aceita)", "mensal": "Mês a mês"},
         f"3. o painel do plano: o à vista é o '{PERIODO_TODO}'; o cartão parcelado fica com o nome de sempre e 'não aceita' ({rot})")
    t.foto("3b_plano_dialogo", "[data-plano-modalidades]")
    R.ok(t.fechar_painel(), "3. o painel do plano fecha sem salvar")


def passo_app_pagar(R) -> None:
    R.linha("\n── 4. o app do aluno › Pagamentos: Pagar → a folha da InfinitePay → a aba da InfinitePay → aguardando → conferir")
    if not garantir_infinitepay(R, "4"):
        return
    valor = reais(valor_da_mensalidade())
    t = app_do_aluno(R)
    R.ok(t.esperar(lambda: t.tem("[data-mensalidade-aluno] [data-pagar-mensalidade]"), 60), "4. Pagamentos abre com a mensalidade e o Pagar")
    botao, linha = t.texto("[data-pagar-mensalidade]"), t.texto("[data-linha-mensalidade]")
    R.ok(botao == f"Pagar {valor}", f"4. o botão: 'Pagar {valor}' ({botao!r} · {'loja' if CTX['loja'] else 'site'})")
    R.ok(linha.endswith("Pix ou cartão"), f"4. a linha da mensalidade: '… · Pix ou cartão' ({linha!r})")
    t.clicar("[data-pagar-mensalidade]")
    R.ok(t.esperar(lambda: t.tem("[data-pagar-ip] [data-ip-pagar]"), 20), "4. a folha da InfinitePay abre (sem comprovante)")
    R.ok(t.titulo_do_painel() == "Pagar a mensalidade" and t.texto("[data-ip-pagar]") == f"Pagar {valor} com Pix ou cartão",
         f"4. a folha: 'Pagar a mensalidade' e 'Pagar {valor} com Pix ou cartão' ({t.titulo_do_painel()!r} · {t.texto('[data-ip-pagar]')!r})")
    url = aba_da_infinitepay(t, "[data-ip-pagar]")
    R.ok(bool(url), f"4. 'Pagar' abre a aba da InfinitePay ({host(url)}) — conferida pela url e fechada sem pagar")
    R.ok(t.esperar(lambda: t.tem("[data-ip-aguardando]"), 30), f"4. a folha: '{AGUARDANDO}'")
    c = t.pg.locator("[data-ip-aguardando]").first.get_attribute("data-ip-aguardando") if t.tem("[data-ip-aguardando]") else None
    if not uuid_ok(c):
        R.ok(False, f"4. sem a tentativa na folha ({c!r}) — os passos 5 e 6 ficam de fora")
        return
    CTX["tentativa"] = c
    R.ok(AGUARDANDO in t.texto(f"[data-ip-aguardando='{c}']"), f"4. '{AGUARDANDO}' na folha ({t.texto('[data-ip-aguardando]')[:80]!r})")
    lc = API.um(f"""select c.forma, c.status, c.valor::float as valor,
                           (select l.pedido from {S}.infinitepay_links l where l.cobranca_id = c.id order by l.n limit 1) as pedido
                      from {S}.cobrancas c where c.id = '{c}'""")
    R.ok(lc == {"forma": "infinitepay", "status": "aguardando_confirmacao", "valor": valor_da_mensalidade(), "pedido": f"{c}-1"},
         f"no banco: a tentativa (InfinitePay, aguardando, {valor}) e o link 1 com o pedido <id>-1 ({lc and {k: lc[k] for k in ('forma', 'status', 'valor')}})")
    t.clicar("[data-ip-conferir]")
    R.ok(t.esperar(lambda: AINDA_NAO in t.texto("[data-ip-aguardando] [data-ip-aviso]"), 30),
         f"4. 'Conferir pagamento' → '{AINDA_NAO}…' na folha, acima do botão (a API de verdade: não pago) "
         f"({t.texto('[data-ip-aviso]')[:100]!r} · toasts {t.toasts()[:60]!r})")
    try:
        por_cima = t.pg.locator("[data-ip-conferir]").first.evaluate(JS_NADA_POR_CIMA, timeout=5000)
    except Exception as e:  # noqa: BLE001
        por_cima = f"o botão sumiu ({type(e).__name__})"
    R.ok(por_cima is None, f"4. nada por cima do 'Conferir pagamento' — nem aviso (toast) ({por_cima or 'livre'})")
    t.foto("4_app_aguardando", "[data-ip-aguardando]")
    R.ok(t.fechar_painel(), "4. a folha fecha")
    # a lista de Pagamentos é a do aluno_status (a folha não a relê): o aluno que volta à tela vê a tentativa aberta
    t = app_do_aluno(R)
    cartao_ip = f"[data-pagamento-ip='{c}']"
    R.ok(t.esperar(lambda: t.texto("[data-pagar-mensalidade]") == CONTINUAR and t.tem(cartao_ip), 60),
         f"4. de volta a Pagamentos: '{CONTINUAR}' no lugar do Pagar ({t.texto('[data-pagar-mensalidade]')!r})")
    R.ok(EM_ANDAMENTO in t.texto(cartao_ip), f"4. o cartão '{EM_ANDAMENTO}' fora do histórico ({t.texto(cartao_ip)[:90]!r})")
    t.foto("4b_app_continuar", cartao_ip)


def passo_app_volta(R) -> None:
    R.linha("\n── 5. a volta da página da InfinitePay (order_nsu + transaction_nsu na busca): aluno_ip_volta")
    c = CTX.get("tentativa")
    if not c:
        R.ok(False, "5. sem a tentativa do passo 4 — pulei")
        return
    nsu = f"E2E-VOLTA-{secrets.token_hex(4)}"
    t = app_do_aluno(R, url_da_volta(c, nsu))
    R.ok(t.esperar(lambda: VOLTA in t.toasts(), 45), f"5. '{VOLTA}. A confirmação aparece aqui em instantes.' ({t.toasts()[:110]!r})")
    t.foto("5_app_volta")
    R.ok(t.esperar(lambda: "order_nsu" not in t.pg.url and "transaction_nsu" not in t.pg.url, 15),
         f"5. a busca da volta some do endereço ({urlparse(t.pg.url).path}{'?…' if urlparse(t.pg.url).query else ''})")
    av = API.um(f"""select a.origem, a.conferido_em is not null as fechado, a.resultado,
                           (select status from {S}.cobrancas where id = '{c}') as status
                      from {S}.infinitepay_avisos a where a.cobranca_id = '{c}' and a.transaction_nsu = {API.lit(nsu)}""")
    R.ok(bool(av) and av["origem"] == "volta" and not av["fechado"] and av["resultado"] is None and av["status"] == "aguardando_confirmacao",
         f"no banco: o aviso da volta na caixa, conferido como não pago e reagendado (I1); a tentativa aguardando ({av})")


def passo_app_pago(R) -> None:
    R.linha("\n── 6. a tentativa paga (no banco — o resultado da baixa): o histórico e o recibo da InfinitePay no detalhe")
    c = CTX.get("tentativa")
    if not c:
        R.ok(False, "6. sem a tentativa do passo 4 — pulei")
        return
    marcar_paga_no_banco(c)
    t = app_do_aluno(R)
    linha = f"[data-historico-pagamentos] [data-cobranca='{c}']"
    R.ok(t.esperar(lambda: t.tem(linha), 60), "6. a tentativa paga entra no histórico")
    det = t.texto(f"{linha} [data-cobranca-detalhe]")
    R.ok(det.startswith(f"{PIX_IP} · pago em "), f"6. o histórico: '{PIX_IP} · pago em …' ({det!r})")
    R.ok(not t.tem("[data-pagamento-ip]") and t.texto("[data-pagar-mensalidade]") != CONTINUAR,
         f"6. sem o '{EM_ANDAMENTO}' e sem o '{CONTINUAR}'")
    t.clicar(f"{linha} [data-cobranca-abrir]")
    detalhe = f"[data-detalhe-cobranca='{c}']"
    R.ok(t.esperar(lambda: t.tem(f"{detalhe} [data-recibo-infinitepay]"), 20), f"6. o detalhe abre com '{RECIBO}'")
    R.ok(PIX_IP in t.texto(f"{detalhe} dl") and t.texto("[data-recibo-infinitepay]") == RECIBO,
         f"6. o detalhe: a forma '{PIX_IP}' e o botão '{RECIBO}' ({t.texto(f'{detalhe} dl')[:120]!r})")
    t.foto("6_app_pago_recibo", detalhe)
    R.ok(t.fechar_painel(), "6. o detalhe fecha (o recibo não é aberto: o endereço é o de teste)")


def passo_ficha(R) -> None:
    R.linha("\n── 7. a ficha do aluno no painel: a forma InfinitePay e o recibo na linha da cobrança")
    c = CTX.get("tentativa")
    t = painel(R, ficha())
    R.ok(t.esperar(lambda: MODO_TEXTO_IP in t.texto("[data-mensalidade-situacao]"), 60),
         f"7. a ficha: '{MODO_TEXTO_IP}' ({t.texto('[data-mensalidade-situacao]')[-90:]!r})")
    alvo = "[data-mensalidade-situacao]"
    if c:
        alvo = f"[data-cobranca='{c}']"
        R.ok(t.esperar(lambda: t.tem(f"{alvo} [data-acao-cobranca='recibo-ip']"), 30) and PIX_IP in t.texto(alvo),
             f"7. a linha da cobrança: '{PIX_IP}' e o botão do recibo da InfinitePay ({t.texto(alvo)[:110]!r})")
    else:
        R.ok(False, "7. sem a tentativa do passo 4: a linha com o recibo ficou de fora")
    t.fotos("7_ficha_infinitepay", alvo)


def passo_master(R) -> None:
    R.linha("\n── 8. master › Integrações: a InfiniteTag da conta e o 'Desligar' (a confirmação do app)")
    if not garantir_infinitepay(R, "8"):
        return
    conta = CTX["conta"]
    pagina = pagina_da_conta(conta)
    if not dar_master(R):
        return
    t = None
    try:
        guarda()
        t = Tela(CTX["nav"], CTX["base"], R, "master", 1280)
        t.entrar(CTX["logins"], MASTER, f"/master/integracoes?pagina={pagina}")
        tag_sel = f"[data-infinitetag-da-conta='{conta}']"
        R.ok(t.esperar(lambda: t.tem(tag_sel), 60), f"8. master › Integrações (página {pagina}): a conta do {DONO} na InfinitePay")
        R.ok(t.texto(tag_sel) == f"${CTX['tag']}", "8. a InfiniteTag da conta é a salva no passo 2 (borrada no print)")
        kpi = "[data-kpi='InfinitePay'] [data-kpi-valor]"
        R.ok(t.esperar(lambda: t.texto(kpi).isdigit() and int(t.texto(kpi)) >= 1, 30), f"8. o KPI 'InfinitePay' conta a conta ({t.texto(kpi)!r})")
        outras = f"[data-lista='master-integracoes'] [data-item]:not(:has({tag_sel})) *"  # o nome das outras contas sai borrado
        t.fotos("8_master_integracoes", tag_sel, borrar=f"{tag_sel}, {outras}")
        tem_chave = bool(API.um(f"select 1 as ok from {S}.recebimento_chaves where conta_id = '{conta}' and ativa limit 1"))
        esperado = "pix_manual" if tem_chave else "nenhum"
        t.clicar(f"[data-desligar-infinitepay='{conta}']")
        R.ok(confirmar_no_app(t), "8. 'Desligar': a confirmação do app (hml-18a) → Desligar")
        toast = f"Recebimento: {ROTULO_RECEBIMENTO[esperado]}."
        R.ok(t.esperar(lambda: toast in t.toasts(), 30), f"8. desligada: '{toast}' ({t.toasts()[:90]!r})")
        modo = API.um(f"select recebimento_modo as m from {S}.contas where id = '{conta}'")["m"]
        R.ok(modo == esperado, f"no banco: a conta {'voltou ao Pix na chave ligada' if tem_chave else 'sem chave ligada: não cobra pelo app'} ({modo})")
        R.ok(t.esperar(lambda: not t.tem(tag_sel), 20), "8. a linha da conta sem a InfiniteTag nem o 'Desligar'")
    except Exception:
        if t is not None:
            t.diagnostico("master")
        raise
    finally:
        devolver_master(CTX["est"])
        if t is not None:
            t.encerrar(CTX["logins"])  # a sessão MAIS NOVA da w27-master volta para o arquivo da hml-18 (o app renova o refresh)


PASSOS = (("recebimento", passo_recebimento), ("infinitepay", passo_infinitepay), ("planos", passo_planos), ("app_pagar", passo_app_pagar),
          ("app_volta", passo_app_volta), ("app_pago", passo_app_pago), ("ficha", passo_ficha), ("master", passo_master))
PASSOS_LOJA = (("app_pagar", passo_app_pagar), ("app_volta", passo_app_volta), ("app_pago", passo_app_pago))


# ───────────────────────── produção (SÓ LEITURA) ─────────────────────────

def eh_acao(resp, acao: str) -> bool:
    req = resp.request
    return "/functions/v1/pagamentos-aluno" in resp.url and req.method == "POST" and B17.acao_do_corpo(req) == acao


def rodada_prod(R, a, base: str) -> int:
    """SÓ LEITURA: a Guarda no navegador; nenhum SQL; nenhum clique que grava. As contas de TESTE da produção (e2e/w07/smoke_prod.py)."""
    if not saude_dos_2():
        R.linha("   um dos 2 bancos não está saudável — parar (regra de 10/10)")
        return 2
    CTX["logins"] = B.Logins("w1/telas.py prod")
    g = GuardaW1()
    borrar_prod = (f"{B.BORRAR_LISTAS}, [data-recebimentos-lista] [data-recebimento-item] *, "
                   "[data-secao='recebimento-pendentes'] [data-comprovante-pendente] *, [data-link-financeiro-aluno]")
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    with sync_playwright() as pw:
        nav = pw.chromium.launch(channel=a.canal, args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"])
        CTX["nav"] = nav
        try:
            if not B.conferir_build(R, nav, base, True):
                return R.fim()
            R.linha(f"\n── p1. o dono de teste ({DONO_PROD}) em Configurações › Recebimento — só lendo")
            t = Tela(nav, base, R, "recebimento (prod)", 1280, guarda=g)
            CTX["painel"] = t
            try:
                with t.pg.expect_response(lambda r: eh_acao(r, "prof_recebimento"), timeout=90_000) as resp:
                    t.entrar(CTX["logins"], DONO_PROD, ROTA_RECEBIMENTO)
                rec = resp.value.json() if resp.value.ok else {}
            except Exception as e:  # noqa: BLE001
                rec = {}
                R.linha(f"   a prof_recebimento não respondeu ({type(e).__name__})")
            master = bool(rec.get("master"))
            disponivel = bool((rec.get("infinitepay") or {}).get("disponivel"))
            R.ok(t.esperar(lambda: t.tem("[data-opcoes='recebimento-modo']"), 60) and bool(rec),
                 "p1. Recebimento abre pela função (prof_recebimento — a leitura do jeito 2)")
            tem_ip = t.tem("[data-opcoes='recebimento-modo'] [data-opcao='infinitepay']")
            R.ok(tem_ip == disponivel, f"p1. a opção InfinitePay {'aparece' if tem_ip else 'fica escondida'} — igual ao servidor "
                                       f"(disponível {disponivel} · master {master})")
            if master:
                R.ok(tem_ip, "p1. o master vê a InfinitePay (a flag desligada não segura o master)")
            else:
                R.linha("   (a conta de teste não é master na produção — hml-02/H-04: o que vale é a flag esconder a opção dos personais)")
            t.fotos("p1_recebimento", "[data-secao='recebimento-modo']", borrar=borrar_prod, botoes=RAIZ_RECEBIMENTO)
            if master:
                t.ir("/master/integracoes")
                R.ok(t.esperar(lambda: t.tem("[data-kpi='InfinitePay']"), 60), "p2. master › Integrações: o KPI InfinitePay")
                t.fotos("p2_master_integracoes", "[data-kpi='InfinitePay']", borrar=B.BORRAR_LISTAS)
            else:
                R.linha("   p2. master › Integrações: fora (sem master de teste na produção)")
            t.encerrar()
            CTX["painel"] = None
            R.linha(f"\n── p3. o aluno de teste ({ALUNO_PROD}) em Pagamentos — só lendo")
            guarda()
            al = Tela(nav, base, R, "app do aluno (prod)", 390, guarda=g)
            CTX["aluno"] = al
            al.entrar(CTX["logins"], ALUNO_PROD, "/perfil/pagamentos")
            R.ok(al.esperar(lambda: al.tem("[data-pagina-pagamentos]") and (al.tem("[data-matricula-pagamentos]") or "Nenhum pagamento" in al.texto("body")), 60),
                 "p3. Pagamentos abre para o aluno de teste")
            al.foto("p3_app_pagamentos", borrar=B.BORRAR_LISTAS)
            al.encerrar()
            CTX["aluno"] = None
            R.ok(not g.barradas_pagamentos, f"nada da pagamentos-aluno tentou gravar (barradas: {g.barradas_pagamentos}; a Guarda barrou "
                                            f"{len(g.bloqueadas)} no total: {g.bloqueadas[:4]})")
        except Parou as e:
            R.ok(False, str(e))
        except Exception as e:  # noqa: BLE001
            R.ok(False, f"[prod] quebrou: {type(e).__name__}: {str(e)[:300]}")
            for chave in ("painel", "aluno"):
                if CTX.get(chave) is not None:
                    CTX[chave].diagnostico("prod")
        finally:
            for chave in ("painel", "aluno"):
                if CTX.get(chave) is not None:
                    CTX[chave].encerrar()
            CTX["logins"].fechar(R)
            nav.close()
    R.linha(f"\nprints ({len(CTX['prints'])}):\n" + "\n".join(f"   {x}" for x in CTX["prints"]))
    return R.fim()


# ───────────────────────── o --seco (sem banco) ─────────────────────────

def travar_rede(permitidos: set[str]) -> list[str]:
    """--seco: a rede DESTE processo só fala com o build servido — qualquer outro host (o banco pela Management API, o Auth, as funções)
    levanta erro e fica contado."""
    barrados: list[str] = []
    original = urllib.request.OpenerDirector.open

    def abrir(self, fullurl, *args, **kwargs):
        url = fullurl.full_url if isinstance(fullurl, urllib.request.Request) else str(fullurl)
        h = urlparse(url).hostname or ""
        if h not in permitidos:
            barrados.append(h)
            raise RuntimeError(f"--seco: pedido barrado para {h} (o seco não toca o banco nem a API)")
        return original(self, fullurl, *args, **kwargs)

    urllib.request.OpenerDirector.open = abrir  # type: ignore[method-assign]
    return barrados


class _Pedido:
    """Um pedido de mentira para a Guarda (url, método e corpo)."""

    def __init__(self, metodo: str, url: str, corpo: dict | None = None) -> None:
        self.method, self.url, self.post_data = metodo, url, json.dumps(corpo) if corpo is not None else None


def autoteste(R) -> None:
    """As funções puras e as medidas do roteiro (nada de rede)."""
    api = "https://api-principal.physiqcalc.com.br"
    casos = (("/rest/v1/contas?select=id", True), ("/rest/v1/recebimento_chaves?conta_id=eq.x", True), ("/rest/v1/conta_membros?x=1", False),
             ("/rest/v1/rpc/minha_situacao", False), ("/functions/v1/pagamentos-aluno", False))
    R.ok(all(bool(REST_DO_RECEBIMENTO.search(api + u)) is e for u, e in casos), "seco: a medida do jeito 2 pega só recebimento_chaves e contas na API REST")
    urls = (("https://checkout.infinitepay.io/x?lenc=1", True), ("https://recibo.infinitepay.io/e2e", True), ("http://checkout.infinitepay.io/x", False),
            ("https://infinitepay.io.golpe.com/x", False), ("about:blank", False))
    R.ok(all(bool(API.HOST_IP.match(u)) is e and bool(PAGINA_DA_INFINITEPAY.match(u)) is e for u, e in urls),
         "seco: a aba só vale com https num domínio da InfinitePay (e é ela que recebe a página vazia no navegador)")
    c = str(uuid.uuid4())
    v = url_da_volta(c, "E2E-VOLTA-1")
    q = parse_qs(urlparse(v).query)
    R.ok(urlparse(v).path == "/perfil/pagamentos" and q.get("order_nsu") == [f"{c}-1"] and bool(PEDIDO_DO_LINK.match(q["order_nsu"][0]))
         and q.get("transaction_nsu") == ["E2E-VOLTA-1"] and q.get("receipt_url") == ["https://recibo.infinitepay.io/e2e-volta"],
         "seco: a volta da página leva o pedido do link 1 (<id>-1), o NSU e o recibo na busca de /perfil/pagamentos")
    R.ok([pagina_da_lista(n) for n in (1, 20, 21, 40, 41)] == [1, 1, 2, 2, 3], "seco: a página da conta na lista do master (20 por página)")
    R.ok((reais(10), reais(1000), reais(83.33)) == ("R$ 10,00", "R$ 1.000,00", "R$ 83,33"), "seco: os reais da tela")
    R.ok(sem_tag("x https://checkout.infinitepay.io/Fulano.Teste?l=1 $fulano.teste", "fulano.teste")
         == "x https://checkout.infinitepay.io/<InfiniteTag>?l=1 $<InfiniteTag>", "seco: a InfiniteTag sai da saída (também dentro da url)")
    g = GuardaW1()
    fn = f"{api}/functions/v1/pagamentos-aluno"
    pedidos = ((_Pedido("POST", fn, {"acao": "prof_recebimento"}), False), (_Pedido("POST", fn, {"acao": "aluno_status"}), False),
               (_Pedido("POST", fn, {"acao": "prof_recebimento_salvar"}), True), (_Pedido("POST", fn, {"acao": "prof_ip_testar"}), True),
               (_Pedido("POST", fn, {"acao": "aluno_ip_link"}), True), (_Pedido("POST", fn, {"acao": "aluno_ip_conferir"}), True),
               (_Pedido("OPTIONS", fn), False), (_Pedido("PATCH", f"{api}/rest/v1/contas?id=eq.x", {"recebimento_modo": "x"}), True))
    R.ok(all(g.escrita(p) is e for p, e in pedidos) and g.barradas_pagamentos == ["prof_recebimento_salvar", "prof_ip_testar", "aluno_ip_link", "aluno_ip_conferir"],
         "seco: a Guarda da produção deixa a prof_recebimento (leitura) e barra salvar, testar, aluno_ip_* e a tabela")
    R.ok(painel_travado({"situacao": "ativa", "vence_em": "2026-01-01", "teste_ate": None}, "2026-10-11")
         and not painel_travado({"situacao": "ativa", "vence_em": "2026-12-01"}, "2026-10-11"), "seco: a trava do painel do profissional")


def atributos_do_roteiro() -> set[str]:
    return set(re.findall(r"\[(data-[a-z0-9-]+)", Path(__file__).read_text(encoding="utf-8"))) - ATRIBUTOS_DE_FORA


def roteiro_no_codigo(R) -> None:
    """Cada data-* dos seletores existe no src/ e cada texto esperado está no arquivo de onde a tela o tira."""
    arquivos = [x for x in (REPO / "src").rglob("*") if x.suffix in (".ts", ".tsx") and ".test." not in x.name]
    corpo = "\n".join(x.read_text(encoding="utf-8", errors="replace") for x in arquivos)
    attrs = atributos_do_roteiro()
    faltam = sorted(x for x in attrs if not re.search(re.escape(x) + r"(?![a-z0-9-])", corpo))
    R.ok(not faltam, f"seco: cada data-* dos seletores do roteiro existe no src/ ({len(attrs)} atributos; faltam {faltam})")
    faltam_t = [f"{t!r} em {arq}" for t, arq in TEXTOS_NO_CODIGO
                if not (REPO / arq).exists() or t not in (REPO / arq).read_text(encoding="utf-8")]
    R.ok(not faltam_t, f"seco: cada texto que o roteiro espera está no código ({len(TEXTOS_NO_CODIGO)} textos; faltam {faltam_t})")


def portas_do_cors() -> tuple[set[int], set[int]]:
    """As portas do localhost que o CORS aceita: a origemPermitida do principal e o trocar-token do Treino."""
    login = (REPO / "supabase-principal" / "functions" / "_shared" / "login-regras.ts").read_text(encoding="utf-8")
    m = re.search(r"localhost:\(([0-9|]+)\)", login)
    troca = (REPO / "supabase" / "functions" / "trocar-token" / "index.ts").read_text(encoding="utf-8")
    return ({int(x) for x in m.group(1).split("|")} if m else set()), {int(x) for x in re.findall(r'"http://localhost:(\d+)"', troca)}


def conferir_canal(R, base: str, loja: bool) -> bool:
    """O health.json do build servido diz o canal: "play" no build da loja, "site" no do site."""
    d = B.ler_saude(base)
    esperado = "play" if loja else "site"
    return R.ok(d.get("distribuicao") == esperado, f"o build servido é o {'da loja' if loja else 'do site'} (health.json: distribuicao {d.get('distribuicao')})")


def seco(R, a, base: str, producao: bool) -> int:
    R.linha(f"── W1 telas --seco ({base}{' · build da loja' if a.loja else ''}): nada vai ao banco nem à API")
    permitidos = {"localhost", "127.0.0.1", "::1"} | ({host(base)} if a.base != "local" else set())
    barrados = travar_rede(permitidos)
    autoteste(R)
    roteiro_no_codigo(R)
    R.ok(bool(CTX.get("tag")), "seco: a InfiniteTag de teste em ~/.physiq-infinitetag-teste (o valor não vai para a saída)")
    contas = (DONO_PROD, ALUNO_PROD) if producao else ((ALUNO,) if a.loja else (DONO, ALUNO, MASTER))
    for conta in contas:
        email, senha = W6.B5.CONTAS.get(conta, ("", ""))
        teste = bool(email) and (B.C.eh_email_de_teste(email) or W6.B5.email_de_teste(email)) and "revisao" not in email.lower()
        R.ok(teste and bool(senha), f"seco: a conta de TESTE {conta} com e-mail de teste e a senha no arquivo (sem login)")
    if a.base == "local":
        p, t = portas_do_cors()
        R.ok(a.porta in p and a.porta in t, f"seco: a porta {a.porta} está no CORS das funções (origemPermitida {sorted(p)} · trocar-token {sorted(t)})")
    saude = B.ler_saude(base)
    commit = subprocess.run(["git", "-C", str(REPO), "rev-parse", "--short", "HEAD"], capture_output=True, text=True, timeout=10).stdout.strip()
    R.ok(saude.get("app") == "physiq" and saude.get("schema") == ("public" if producao else "staging"),
         f"seco: o build servido em {base} responde o health.json (schema {saude.get('schema')} · versão {saude.get('versao')} · commit "
         f"{saude.get('commit')}; o HEAD é {commit})")
    if not producao:
        conferir_canal(R, base, a.loja)
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    barrados_nav: list[str] = []

    def barrar(route, _req=None) -> None:
        barrados_nav.append(host(route.request.url))
        route.abort()

    entrou = faixa = False
    with sync_playwright() as pw:
        nav = pw.chromium.launch(channel=a.canal, args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"])
        try:
            ctx = nav.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
            ctx.route(API_E_FORA, barrar)
            pg = ctx.new_page()
            try:
                pg.goto(base + "/entrar", wait_until="domcontentloaded", timeout=60_000)
                t0 = time.time()
                while time.time() - t0 < 45 and not pg.locator("[data-entrar-google], [data-entrada-staging]").count():
                    pg.wait_for_timeout(300)
                entrou = pg.locator("[data-entrar-google], [data-entrada-staging]").count() > 0
                faixa = pg.locator("[data-entrada-staging]").count() > 0
            except Exception as e:  # noqa: BLE001
                R.linha(f"   a /entrar não abriu: {type(e).__name__}: {str(e)[:160]}")
            ctx.close()
            enquadramento_no_edge(R, nav)
            nada_por_cima_no_edge(R, nav)
            botoes_no_edge(R, nav, base)
        finally:
            nav.close()
    R.ok(entrou and faixa == (not producao),
         f"seco: o Edge ({a.canal}) abre a /entrar do build {'com' if faixa else 'sem'} a faixa 'Ambiente de teste', com a API e a "
         f"InfinitePay barradas no navegador ({len(barrados_nav)} pedido(s) barrado(s): {sorted(set(barrados_nav))})")
    R.ok(not barrados, f"seco: nenhum pedido deste processo saiu para o banco ou a API ({sorted(set(barrados))})")
    return R.fim()


# ───────────────────────── main ─────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser(description="Physiq W1 — E2E de tela da InfinitePay (Recebimento, Planos, app do aluno no site e na loja, ficha, master)")
    ap.add_argument("--base", required=True, choices=("local", "staging", "prod"),
                    help="local (o vite preview do build de staging em http://localhost:<porta>) | staging | prod (SÓ LEITURA)")
    ap.add_argument("--loja", action="store_true", help="o localhost está servindo o build da loja (VITE_DISTRIBUICAO=play): só os passos 4 a 6")
    ap.add_argument("--porta", type=int, default=5173, choices=PORTAS_DAS_FUNCOES,
                    help="a porta do vite preview no --base local (o CORS das funções só aceita 5173 e 8080 do localhost)")
    ap.add_argument("--canal", default="msedge", choices=("msedge", "chromium", "chrome"))
    ap.add_argument("--sinal", default=None, help="arquivo-sinal da trava do banco do staging: sem ele não começa; sumiu → para antes do próximo passo")
    modo = ap.add_mutually_exclusive_group()
    modo.add_argument("--seco", action="store_true", help="sem banco nem API: o roteiro contra o código, as contas, a porta, o build servido e o Edge")
    modo.add_argument("--limpar", action="store_true", help="só desfaz uma rodada que caiu no meio (pelos 2 arquivos de estado)")
    a = ap.parse_args()
    if a.loja and a.base != "local":
        ap.error("--loja só no --base local (o staging e a produção servem o build do site)")
    base, prefixo, producao = B.resolver_base(f"http://localhost:{a.porta}" if a.base == "local" else a.base)
    B.SAIDA = SCRATCH / "w1"
    R = RodadaW1(f"w1_telas_{prefixo}{'_loja' if a.loja else ''}{'_seco' if a.seco else ''}")
    R.tag = API.tag_de_teste()
    CTX.update(base=base, loja=a.loja, tag=R.tag, pasta=SCRATCH / "prints" / "w1" / prefixo / ("loja" if a.loja else ""))
    if a.seco:
        return seco(R, a, base, producao)
    if producao:
        if a.limpar:
            R.ok(False, "a produção é SÓ LEITURA: não há o que desfazer")
            return R.fim()
        return rodada_prod(R, a, base)
    sinal = Path(a.sinal).expanduser() if a.sinal else None
    if not saude_dos_2():
        R.linha("   um dos 2 bancos não está saudável — parar (regra de 10/10)")
        return 2
    CTX["logins"] = B.Logins(f"w1/telas.py {prefixo}")
    api_pend, telas_pend = _ler_json(API.ESTADO_ARQ), _ler_json(ESTADO_ARQ)
    if api_pend or telas_pend:
        R.linha(f"   a rodada anterior (do api.py ou desta) não terminou ({API.ESTADO_ARQ.name} · {ESTADO_ARQ.name}): desfazendo antes")
        desfazer(R, api_pend, telas_pend)
        if API.ESTADO_ARQ.exists() or ESTADO_ARQ.exists():
            return R.fim()
    if a.limpar:
        if not (api_pend or telas_pend):
            r = API.um(f"""select (select count(*) from {S}.planos_aluno where nome like {API.lit(API.PREFIXO + ' %')})::int as planos,
                                  (select count(*) from {S}.recebimento_chaves where chave like 'w1e2e%@teste.com')::int as chaves""")
            R.ok(not any(r.values()), f"nenhuma rodada pendente e nada '{API.PREFIXO} …' / 'w1e2e…' sobrando no {S} ({r})")
        return R.fim()
    if sinal and not sinal.exists():
        R.linha(f"   sem o sinal {sinal} (a trava do banco do staging): a rodada não começa")
        return 3
    passos = PASSOS_LOJA if a.loja else PASSOS
    R.linha(f"── W1 telas ({prefixo}{' · build da loja' if a.loja else ''} · {base}): {', '.join(n for n, _ in passos)} · prints em {CTX['pasta']}")
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    with sync_playwright() as pw:
        nav = pw.chromium.launch(channel=a.canal, args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"])
        CTX["nav"] = nav
        try:
            if B.conferir_build(R, nav, base, producao) and conferir_canal(R, base, a.loja) and funcoes_da_w1(R) and preparar(R):
                for nome, fn in passos:
                    if sinal and not sinal.exists():
                        R.linha(f"\n⏸️  o sinal {sinal.name} sumiu (o banco do staging voltou para a outra sessão): parei antes do passo '{nome}'")
                        CTX["interrompida"] = nome
                        break
                    t0 = time.time()
                    try:
                        fn(R)
                    except Parou as e:
                        R.ok(False, f"[{nome}] {e}")
                        break
                    except Exception as e:  # noqa: BLE001
                        R.ok(False, f"[{nome}] quebrou: {type(e).__name__}: {str(e)[:300]}")
                        for t in (CTX.get("painel"), CTX.get("aluno")):
                            if t is not None:
                                t.diagnostico(nome)
                    R.linha(f"   ({time.time() - t0:.0f} s)")
        finally:
            for chave in ("painel", "aluno"):
                if CTX.get(chave) is not None:
                    CTX[chave].encerrar()
            if API.CTX.get("estado") or CTX.get("est"):
                desfazer(R, API.CTX.get("estado"), CTX.get("est"))
            CTX["logins"].fechar(R)
            nav.close()
    R.linha(f"\nprints ({len(CTX['prints'])}):\n" + "\n".join(f"   {x}" for x in CTX["prints"]))
    r = R.fim()
    if CTX.get("interrompida"):
        R.linha(f"   rodada INTERROMPIDA antes de '{CTX['interrompida']}' (o sinal sumiu): a massa foi desfeita — rode de novo com o sinal")
        return 3
    return r


if __name__ == "__main__":
    raise SystemExit(main())
