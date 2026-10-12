#!/usr/bin/env python3
"""Physiq W2 — E2E de TELA do Mercado Pago DO PERSONAL (Task 19 do plano da W2), com o Edge e as contas de TESTE do STAGING, em série, com
a guarda de /health dos 2 projetos antes de cada conta que entra. O painel a 1280 e a 390 (os "-390"); o app do aluno a 390 × 844.
Passos (a massa é a conta do prof2 — "Rafael Lima" — com o aluno2; a ordem de execução é a da lista abaixo: a volta roda ANTES do conectado
porque o destaque do ?mp=conectar fica no botão Conectar, que só existe com a conta desconectada):
  1 recebimento  o dono em Configurações › Recebimento vê "Mercado Pago (sua conta)"; escolhe → "Desconectado", "Conectar com o Mercado
                 Pago" e o "Salvar a forma" esperando a conexão ("Conecte o Mercado Pago primeiro."); o jeito 2 medido na rede: nenhum pedido
                 do navegador a /rest/v1/(contas|recebimento_chaves|recebimento_integracoes|mp_conexoes) — nos passos 1 a 4
  2 conectar     "Conectar com o Mercado Pago" → a navegação para auth.mercadopago.com(.br) é INTERCEPTADA (page.route) e ABORTADA: a URL é
                 conferida (o client, o redirect da mp-conectar-retorno do ambiente, o state de 43, S256) e nunca impressa; a página do MP
                 nunca abre (o print é o do app, que fica onde estava); no banco, a conexão nasceu com o redirect próprio, sem uso
  4 volta        ?mp=negado → o texto e a busca limpa; ?mp=conectar → só o destaque do botão (nenhum pedido de conectar/confirmar à função);
                 ?mp=confirmar&c=<uuid inventado> → 1 pergunta à função e "Esse link de conexão já foi usado ou não vale mais" (I8: a
                 confirmação de verdade é provada no api.py --local e no Vitest da Task 15); ?mp=confirmar&c=lixo → o mesmo texto SEM pedido
  3 conectado    a conexão simulada pelo SQL do servidor (o e2e/w2/api.py --conexao-sql: o upsert do prof_mp_simular_conexao — o master de
                 teste não é master no Auth, hml-02/H-04) + "Salvar a forma" → o chip "Conectado", o apelido "TESTE (simulada)" e a forma
                 MERCADO PAGO (SUA CONTA)
  5 app_pix      o aluno: "Pagar" → o Pix do MP (o QR; no staging, com o sandbox fora do ar, o Pix simulado da função) → "Simular aprovação
                 (teste)" → pago (no banco: paga, forma mp, o collector da conta)
  6 app_cartao   o Brick abre com data-brick-chave="conta" (a chave pública do vendedor; nada é pago aqui — o cartão é provado no api.py)
  7 erro         a integração em erro (SQL): o dono vê "Conexão caiu" + "Conectar de novo"; o aluno vê "indisponível" ao tocar em Pagar
  8 desconectar  com uma automática pendente (simulada, da rodada): as 2 confirmações do app → o chip PIX NA CHAVE (ou POR FORA, sem chave)
  9 master       master › Integrações (a w27-master, master SÓ no staging.profiles durante a rodada): "Mercado Pago do personal" na linha
                 da conta com a situação, o KPI "MP do personal" e o "Desligar" com as 2 confirmações (o 1º OK e o das automáticas)
--loja: o localhost serve o build da loja — os passos 5 a 7 (o aluno paga o PROFISSIONAL igual na versão da Google Play; a conexão vem
pelo SQL do servidor) e o conectar do APK (7c): um contexto com o Capacitor em modo app (window.CapacitorCustomPlatform "android" — os
plugins nas versões web): "Conectar de novo" pede origem "apk", a função responde a URL do SITE (no_site) e o app abre o SITE no navegador
(?mp=conectar) — nunca a autorização do MP; "Conecte no navegador que abriu e volte ao app."
--porta: a do vite preview no --base local — 5173 (padrão) ou 8080, as ÚNICAS do localhost que o CORS das funções aceita. A 8080 costuma
ser da outra sessão.
--base prod: SÓ LEITURA (a Guarda da hml-17 no navegador, com a prof_recebimento como leitura; nenhum SQL, nada clica em salvar): o dono de
teste (admin.teste) abre Recebimento — a opção "Mercado Pago (sua conta)" aparece IGUAL ao que o servidor diz (sem a W2 no public: não
aparece) — e Integrações só se a conta for master (não é: hml-02/H-04); o aluno de teste (teste@teste.com) abre Pagamentos.
Desfazer: o do e2e/w2/api.py (a foto da matrícula do aluno2, da conta do prof2, das flags, das automáticas e do papel do master de teste
ANTES de mexer, em ~/projetos/physiqcalc-scratch/w2/api-estado.json; a rodada só começa SEM integração do MP e sem automática viva na
conta) + as marcas desta rodada em …/w2/telas-estado.json (o plano do PROFISSIONAL da conta — o painel travado é liberado só durante a
rodada — e o papel da w27-master); no fim, ou na próxima rodada / --limpar, tudo volta e é conferido campo a campo (as automáticas da
rodada saem ANTES do modo: a guarda contas_guard_mp).
Precisa: a W2 no staging e as funções publicadas (a rodada confere antes de mexer, só lendo: a W2, as flags, as 6 funções com o verify_jwt,
a credencial de TESTE do MP e — a conexão simulada vai por SQL — a MP_TOKENS_CHAVE do cofre = a das funções e o ~/.physiq-mp-test = o
MP_ACCESS_TOKEN_TEST delas, pelos digests); ~/.pc-pat e as senhas das contas de TESTE.
Nada de segredo, token, e-mail de pessoa real ou a página do MP na saída ou nos prints: a URL do MP só como "host + conferências"; o QR e
o copia e cola do Pix (que levam o nome do recebedor da credencial de TESTE) saem borrados; na produção, as listas também.
Uso: python3 e2e/w2/telas.py --base local|staging|prod [--loja] [--porta 5173] [--canal msedge] [--sinal ARQ] [--seco | --limpar]
  --seco    nada vai ao banco nem à API (a rede deste processo só fala com o build servido; no Edge, a API e o Mercado Pago são barrados): as
            funções puras, o roteiro contra o código (cada data-* dos seletores e cada texto esperado), as contas (sem login), a porta no
            CORS, o build servido (health.json: schema e canal), a /entrar no Edge, a interceptação da autorização do MP numa página de
            mentira, os botões do bloco do MP a 390 com o CSS do build e, no --loja, o Capacitor em modo app no build da loja
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
# o teto de logins da w27-master é de cada agente (a base da hml-18 lê o registro na carga): o desta frente fica na pasta da W2
os.environ.setdefault("HML18_MASTER_REGISTRO", str(SCRATCH / "w2" / "master_logins.txt"))


def _carregar(nome: str, caminho: Path):
    if nome in sys.modules:
        return sys.modules[nome]
    espec = importlib.util.spec_from_file_location(nome, caminho)
    mod = importlib.util.module_from_spec(espec)
    sys.modules[nome] = mod
    espec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


# A ordem importa (o molde do e2e/w1/telas.py): a base da W6 primeiro (ela carrega a da W5 e o _comum da W2); a da hml-18 (→ hml-17 →
# hml-09) reaproveita os mesmos módulos; o api.py da W2 importa "_base" = esta base da W6.
W6 = _carregar("_base_w06", E2E / "w06" / "_base.py")
sys.modules.setdefault("_base", W6)
B = _carregar("_base_hml18", E2E / "hml18" / "_base.py")
API = _carregar("_w2_api", AQUI / "api.py")
API.carregar_base()
assert B.B5 is W6.B5 and API.B is W6, "a base da W5 e a da W6 têm de ser as mesmas nas 3 bases"
B17 = B.B17

S = API.S
DONO, ALUNO, MASTER = API.DONO, API.ALUNO, "w27-master"
DONO_PROD, ALUNO_PROD = "master", "aluno-calc"  # as contas de TESTE da produção (e2e/w07/smoke_prod.py): admin.teste e teste@teste.com
PORTAS_DAS_FUNCOES = (5173, 8080)
ESTADO_ARQ = SCRATCH / "w2" / "telas-estado.json"
ROTA_RECEBIMENTO = "/painel/configuracoes/recebimento"
POR_PAGINA_MASTER = 20  # master › Integrações: 20 contas por página do banco (hml-14d)
HOSTS_DO_MP = {"auth.mercadopago.com", "auth.mercadopago.com.br"}
APELIDO_SIMULADA = "TESTE (simulada)"  # o apelido da conexão simulada (prof_mp_simular_conexao e o comando_simular_sql do api.py)

OPCAO_MP_CONTA = "Mercado Pago (sua conta)"
CONECTAR = "Conectar com o Mercado Pago"
CONECTAR_DE_NOVO = "Conectar de novo"
SALVAR_DICA = "Conecte o Mercado Pago primeiro."
PRONTO_MP = "Pronto: seus alunos pagam pelo seu Mercado Pago."
TEXTO_NEGADO = "Você não autorizou o Physiq no Mercado Pago. Toque em Conectar para tentar de novo."
TEXTO_INVALIDO = "Esse link de conexão já foi usado ou não vale mais. Toque em Conectar de novo."
NO_NAVEGADOR = "Conecte no navegador que abriu e volte ao app."
DESCONECTAR_TITULO = "Desconectar o Mercado Pago?"
DESLIGAR_AUTOMATICAS = "Desligar as cobranças automáticas de 1 aluno?"
DESCONECTADO_1 = "Mercado Pago desconectado. 1 cobrança automática desligada — cada aluno recebeu um aviso."
INDISPONIVEL = "O pagamento pelo app está indisponível agora. Avise o seu profissional."
SIMULAR = "Simular aprovação (teste)"
APROVACAO_SIMULADA = "Aprovação simulada (ambiente de teste)."
KPI_MP_CONTA = "MP do personal"
ROTULO_MODO = {"pix_manual": "PIX NA CHAVE", "nenhum": "POR FORA", "mercadopago_conta": "MERCADO PAGO (SUA CONTA)"}  # _shared/recebimento-regras.ts
ROTULO_RECEBIMENTO = {"pix_manual": "Pix manual", "nenhum": "Não cobra pelo app"}  # src/master/regras.ts (o aviso do Desligar)
# o que o roteiro espera ler na tela, no arquivo de onde vem (o --seco confere antes de qualquer rodada)
TEXTOS_NO_CODIGO = (
    (OPCAO_MP_CONTA, "src/painel/configuracoes/Recebimento.tsx"),
    (CONECTAR, "src/painel/configuracoes/Recebimento.tsx"),
    (CONECTAR_DE_NOVO, "src/painel/configuracoes/Recebimento.tsx"),
    (SALVAR_DICA, "src/painel/configuracoes/Recebimento.tsx"),
    (PRONTO_MP, "src/painel/configuracoes/Recebimento.tsx"),
    (NO_NAVEGADOR, "src/painel/configuracoes/Recebimento.tsx"),
    (DESCONECTAR_TITULO, "src/painel/configuracoes/Recebimento.tsx"),
    ("Desligar as cobranças automáticas de ${n === 1 ? \"1 aluno\"", "src/painel/configuracoes/Recebimento.tsx"),
    ("Mercado Pago desconectado. ${n === 1 ? \"1 cobrança automática desligada\"", "src/painel/configuracoes/Recebimento.tsx"),
    (TEXTO_NEGADO, "supabase-principal/functions/_shared/mp-conta-regras.ts"),
    (TEXTO_INVALIDO, "supabase-principal/functions/_shared/mp-conta-regras.ts"),
    ('titulo: "Desconectado"', "supabase-principal/functions/_shared/mp-conta-regras.ts"),
    ('titulo: "Conexão caiu"', "supabase-principal/functions/_shared/mp-conta-regras.ts"),
    ('titulo: "Conectado"', "supabase-principal/functions/_shared/mp-conta-regras.ts"),
    ('pix_manual: "PIX NA CHAVE"', "supabase-principal/functions/_shared/recebimento-regras.ts"),
    ('mercadopago_conta: "MERCADO PAGO (SUA CONTA)"', "supabase-principal/functions/_shared/recebimento-regras.ts"),
    (f'mp_apelido: "{APELIDO_SIMULADA}"', "supabase-principal/functions/pagamentos-aluno/index.ts"),
    (INDISPONIVEL, "src/financeiro/regras.ts"),
    (SIMULAR, "src/app-aluno/perfil/pagamentos/PagarMercadoPago.tsx"),
    (APROVACAO_SIMULADA, "src/app-aluno/perfil/pagamentos/PagarMercadoPago.tsx"),
    ('data-brick-chave={chavePublica ? "conta" : "physiq"}', "src/painel/configuracoes/plano/CartaoPagamento.tsx"),
    (f'titulo="{KPI_MP_CONTA}"', "src/master/paginas/Integracoes.tsx"),
    ('mercadopago_conta: "Mercado Pago do personal"', "src/master/regras.ts"),
    ('pix_manual: "Pix manual", nenhum: "Não cobra pelo app"', "src/master/regras.ts"),
    ("Recebimento: ${ROTULO_RECEBIMENTO[modo]}.", "src/master/paginas/Integracoes.tsx"),
    ('passo: "automaticas"', "src/master/regras.ts"),
)
# os data-* que não moram no src/ (vêm das bibliotecas — o sonner e o Radix — ou das páginas de mentira do --seco)
ATRIBUTOS_DE_FORA = {"data-sonner-toast", "data-sonner-toaster", "data-state", "data-alvo", "data-antes", "data-largo", "data-conectar",
                     "data-reconectar", "data-desconectar", "data-ir-ao-mp"}

# Jeito 2 medido: as 4 tabelas do Recebimento e do MP da conta na API REST (o \b separa "contas" de "conta_membros")
REST_DO_RECEBIMENTO = re.compile(r"/rest/v1/(contas|recebimento_chaves|recebimento_integracoes|mp_conexoes)\b")
# a autorização do MP (o Conectar do site navega na MESMA aba): no navegador do teste ela é interceptada e abortada
PAGINA_DO_MP = re.compile(r"^https?://auth\.mercadopago\.com(\.br)?(:\d+)?/", re.I)
# no contexto em modo app (--loja, 7c): o SITE que o app abre por cima de si (o Browser.open — na versão web, um window.open) recebe uma
# página vazia (só a url importa)
SITES_DO_PHYSIQ = re.compile(r"^https://(physiqcalc\.com\.br|physiqcalc-staging\.vercel\.app)/", re.I)
# o --seco barra no Edge a API (os 2 domínios próprios e o supabase) e o Mercado Pago — o site servido passa
API_E_FORA = re.compile(r"^https?://(api(-principal)?\.physiqcalc\.com\.br|([a-z0-9-]+\.)*supabase\.(co|com)|"
                        r"([a-z0-9-]+\.)*mercadopago\.com(\.br)?|([a-z0-9-]+\.)*mercadolibre\.com|([a-z0-9-]+\.)*mlstatic\.com)(:\d+)?/", re.I)
# o Capacitor em modo app (o build da loja no navegador): os plugins ficam nas versões web (o window.open no lugar do navegador do APK);
# o atualizador do APK (só no app) pergunta ao GitHub pela versão nova — no teste, 404 (nenhuma janela de "Nova versão" por cima da tela)
CAPACITOR_APP = "window.CapacitorCustomPlatform = { name: 'android', plugins: {} };"
GITHUB = re.compile(r"^https://api\.github\.com/")
_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
CTX: dict = {"prints": [], "urls_mp": [], "rede": [], "acoes": []}


class Parou(Exception):
    """A guarda de /health mandou parar: nada mais roda (o desfazer roda no finally)."""


# ───────────────────────── funções puras ─────────────────────────

def limpo(t: str | None) -> str:
    return re.sub(r"\s+", " ", t or "").strip()


def reais(v: float | int) -> str:
    """O reais() da tela (src/financeiro/regras.ts): "R$ 10,00", "R$ 1.000,00"."""
    s = f"{float(v):,.2f}"
    return "R$ " + s.replace(",", "_").replace(".", ",").replace("_", ".")


def host(url: str | None) -> str:
    return urlparse(url or "").hostname or "-"


def uuid_ok(v: object) -> bool:
    return isinstance(v, str) and bool(_UUID.match(v))


def pagina_da_lista(posicao: int, por_pagina: int = POR_PAGINA_MASTER) -> int:
    """A página (1, 2, …) de quem está na posição (1, 2, …) de uma lista paginada."""
    return (max(1, posicao) - 1) // por_pagina + 1


def painel_travado(c: dict | None, hoje: str) -> bool:
    """A trava do painel pelo plano do PROFISSIONAL (situacaoEfetiva + travaDoPainel de src/nucleo/cobranca/regras.ts; a GatePlano
    pula a cobrança legada e a conta do app) — a mesma do e2e/w1/telas.py."""
    if not c or c.get("cobranca_legada") or c.get("origem") == "app" or c.get("situacao") == "isenta":
        return False
    if c.get("situacao") in ("suspensa", "cancelada"):
        return True
    if c.get("vence_em"):
        fim = dt.date.fromisoformat(c["vence_em"][:10]) + dt.timedelta(days=max(0, c.get("tolerancia_dias") or 0))
        if fim.isoformat() >= hoje:
            return False
    return not (c.get("teste_ate") and c["teste_ate"][:10] >= hoje)


def conferir_url_do_mp(url: str | None, redirect: str, conhecidos: set[str]) -> dict:
    """A autorização do MP que o Conectar abriu → as conferências (booleanas — a url, o state e o desafio nunca vão para a saída): https,
    host do MP, /authorization, o client (o da aplicação, ou só dígitos se não houver o arquivo dela), response_type code, platform_id mp,
    o redirect da mp-conectar-retorno do ambiente, o state de 43 (uso único) e o PKCE S256 (desafio de 43)."""
    u = urlparse(url or "")
    q = {k: v[0] for k, v in parse_qs(u.query).items()}
    cid = q.get("client_id", "")
    return {
        "https": u.scheme == "https", "host": (u.hostname or "") in HOSTS_DO_MP, "caminho": u.path == "/authorization",
        "client": cid in conhecidos if conhecidos else bool(re.fullmatch(r"\d{10,20}", cid)),
        "response_type": q.get("response_type") == "code", "platform_id": q.get("platform_id") == "mp",
        "redirect": q.get("redirect_uri") == redirect, "state": bool(API.ESTADO_RX.fullmatch(q.get("state", ""))),
        "s256": q.get("code_challenge_method") == "S256", "desafio": len(q.get("code_challenge", "")) == 43,
    }


def url_do_site_no_app(url: str | None) -> bool:
    """O conectar do APK abre o SITE (Configurações › Recebimento ?mp=conectar) — a URL que a função devolve com no_site (decisão 6)."""
    return url == f"{API.VOLTA_SITE}?mp=conectar"


def chave_de_teste(v: object) -> bool:
    """A chave pública de TESTE do MP no formato que a conexão simulada aceita (o filtro do prof_mp_simular_conexao e do
    comando_simular_sql do api.py) — o valor nunca vai para a saída."""
    return isinstance(v, str) and bool(re.fullmatch(r"TEST-[A-Za-z0-9-]{8,72}", v))


def acao_de(post_data: str | None) -> str | None:
    """A ação de um pedido à pagamentos-aluno (o corpo { acao })."""
    try:
        b = json.loads(post_data or "{}")
    except (TypeError, ValueError):
        return None
    return b.get("acao") if isinstance(b, dict) else None


def contar_acoes(lista: list[str], *acoes: str) -> int:
    return sum(1 for a in lista if a in acoes)


# ───────────────────────── a produção: a Guarda com a leitura da W2 ─────────────────────────

class GuardaW2(B17.Guarda):
    """A Guarda da hml-17 (produção SÓ LEITURA: o navegador aborta toda escrita) com a leitura do Recebimento pela função: a
    prof_recebimento só lê. O resto da pagamentos-aluno fora das leituras de antes continua barrado (salvar, conectar, confirmar,
    desconectar, os aluno_mp_*); as barradas dela ficam com a ação, para a conferência do fim."""

    LEITURAS_W2 = {"prof_recebimento"}

    def __init__(self) -> None:
        super().__init__()
        self.barradas_pagamentos: list[str] = []

    def escrita(self, req) -> bool:
        tipo, nome = B17.alvo(req.url)
        if (tipo == "fn" and nome == "pagamentos-aluno" and req.method not in ("GET", "HEAD", "OPTIONS")
                and urlparse(req.url).hostname in (B17.API_P_HOST, B17.API_T_HOST)):
            acao = B17.acao_do_corpo(req)
            if acao in self.LEITURAS_W2:
                return False
            grava = super().escrita(req)
            if grava:
                self.barradas_pagamentos.append(str(acao))
            return grava
        return super().escrita(req)


class PlacarPeloR:
    """O placar do e2e/w2/api.py (o p.check do ambiente e do desfazer) entrando no placar DESTA rodada."""

    def __init__(self, R) -> None:
        self.R = R

    def check(self, ok: object, texto: str) -> bool:
        return self.R.ok(ok, texto)

    def fim(self) -> int:
        return 0


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
    """A w27-master vira master SÓ no staging.profiles (o dar_master do e2e/w1/telas.py — hml-02/H-04: nunca no Auth), com a foto do
    papel de antes no arquivo de estado ANTES de mexer."""
    assert S == "staging", "master de teste só no staging (hml-02/H-04)"
    uid = W6.B5.uid(MASTER)
    papel = papel_do_master(uid) if uid else None
    if not uid or papel is None:
        R.ok(False, f"9. a {MASTER} sem login ou sem perfil no {S}.profiles ({bool(uid)})")
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


def conta_do_aluno() -> str | None:
    email = W6.B5.CONTAS[ALUNO][0].lower()
    r = API.um(f"""select p.conta_id::text as c from {S}.pacientes p join auth.users u on u.id = p.user_id
                    where lower(u.email) = {API.lit(email)} and p.deleted_at is null order by p.ativo desc, p.created_at limit 1""")
    return (r or {}).get("c")


def sessao_unica(conta: str) -> None:
    """As ações pela função (o api.py) usam a MESMA sessão do navegador (a dos Logins): o logout local do fim fecha as duas."""
    W6._tokens[conta] = (time.time(), CTX["logins"].token(conta))


def funcoes_da_w2(R) -> bool:
    """ANTES de mexer no banco, só lendo: o ambiente do e2e/w2/api.py (a W2 no staging, as 2 flags, as 6 funções publicadas com o
    verify_jwt certo, a credencial de TESTE do MP e — a conexão simulada vai por SQL — a MP_TOKENS_CHAVE do cofre e o token de TESTE
    iguais aos das funções, pelos digests) e a pagamentos-aluno publicada com o Recebimento da W2 (prof_recebimento como o dono, com a
    MESMA sessão do navegador)."""
    API.CTX.update(local=False, conexao_sql=True)
    pronto = API.ambiente(["simulada"])
    conta = conta_do_aluno()
    sessao_unica(DONO)
    st, rec = API.pedir(DONO, "prof_recebimento", {"conta_id": conta})
    ok_rec = R.ok(st == 200 and isinstance(rec.get("mercadopago_conta"), dict),
                  f"a pagamentos-aluno publicada tem o Recebimento da W2 (prof_recebimento: {st} {rec.get('erro') or ''})")
    if not (pronto and ok_rec):
        R.linha("   o ambiente não está pronto (acima) — publique/configure antes (as Tasks 14 e 21 do plano): nada foi mexido no banco")
    return bool(pronto and ok_rec)


def preparar(R) -> bool:
    """O ponto de partida do e2e/w2/api.py (a foto ANTES de mexer; a rodada só começa sem integração do MP e sem automática viva; as
    mensalidades de antes escondidas; R$ 10,00 que venceu ontem; Pix na chave; a flag do MP da conta ligada; a barreira) + as marcas desta
    rodada no arquivo de estado dela (o plano do PROFISSIONAL da conta; o painel travado é liberado só durante a rodada)."""
    API.CTX.update(local=False, conexao_sql=True)
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
    m = API.um(f"""select p.mensalidade_valor::float as v, c.recebimento_modo as modo
                     from {S}.pacientes p join {S}.contas c on c.id = p.conta_id where p.id = '{pac}'""")
    return R.ok(m["v"] == 10.0 and m["modo"] == "pix_manual" and API.linha_integracao() is None,
                f"preparo: o {ALUNO} com R$ 10,00 a pagar, a conta no Pix na chave e sem integração do MP (estado em {API.ESTADO_ARQ.name} e "
                f"{ESTADO_ARQ.name}) ({m})")


def desfazer(R, api_est: dict | None, telas_est: dict | None) -> None:
    R.linha("\n── desfazer: o da W2 (as automáticas da rodada ANTES do modo, a integração do MP, as conexões, as cobranças, os avisos, os eventos) "
            "+ o plano do profissional e o papel da w27-master")
    try:
        if telas_est:
            devolver_master(telas_est)
            devolver_plano_da_conta(telas_est)
        plano = plano_da_conta(telas_est["conta"]) if telas_est and telas_est.get("plano_conta") else None
        papel = papel_do_master(telas_est["master"]["uid"]) if telas_est and telas_est.get("master") else None
    except Exception as e:  # noqa: BLE001
        R.ok(False, f"a limpeza das marcas da tela quebrou ({e!r}) — o estado ficou em {ESTADO_ARQ}: rode  "
                    f"python3 e2e/w2/telas.py --base local --limpar"[:500])
        return
    if api_est:
        API.desfazer(api_est)  # o ✅/❌ campo a campo entra neste placar (PlacarPeloR); se quebrar, o api-estado.json fica
    difs: list[str] = []
    if telas_est and telas_est.get("plano_conta") and plano != telas_est["plano_conta"]:
        difs.append(f"o plano da conta: {telas_est['plano_conta']} → {plano}")
    if telas_est and telas_est.get("master") and telas_est["master"].get("papel") != papel:
        difs.append(f"o papel da {MASTER}: {telas_est['master'].get('papel')} → {papel}")
    if telas_est:
        R.ok(not difs, f"o plano do profissional e o papel da {MASTER} voltaram à foto de antes ({'; '.join(difs) or 'igual'})")
    if not API.ESTADO_ARQ.exists():
        ESTADO_ARQ.unlink(missing_ok=True)


def esconder_e_reler() -> None:
    """As mensalidades e os Pix do MP da rodada saem (o aluno volta a ter R$ 10,00 a pagar) — o esconder do api.py."""
    API.esconder()


def garantir_conectada(R, rotulo: str) -> bool:
    """A conta do prof2 conectada (a conexão simulada pelo SQL do servidor — o api.py --conexao-sql) e no MP da conta."""
    i = API.linha_integracao() or {}
    if i.get("status") == "ativa" and API.modo() == "mercadopago_conta":
        return True
    try:
        API.garantir_simulada(ligar=True)
    except Exception as e:  # noqa: BLE001
        return R.ok(False, f"{rotulo}. a conexão simulada não gravou: {type(e).__name__}: {str(e)[:200]}")
    R.linha(f"   ({rotulo}. a conta foi conectada pelo SQL do servidor e ligada no MP da conta — o atalho do api.py --conexao-sql)")
    i = API.linha_integracao() or {}
    return R.ok(i.get("status") == "ativa" and API.modo() == "mercadopago_conta" and chave_de_teste(i.get("mp_public_key")),
                f"{rotulo}. a conta conectada, no MP da conta e com a chave pública de TESTE ({i.get('status')} · "
                f"chave {'TEST-…' if chave_de_teste(i.get('mp_public_key')) else 'ausente'})")


def pagina_da_conta(conta: str) -> int:
    """A página da conta em master › Integrações (a ordem da master_integracoes: a conta do app primeiro, o nome, o id)."""
    r = API.um(f"""select rn from (select id, row_number() over (order by (origem = 'app') desc, lower(nome), id) as rn from {S}.contas) x
                    where id = '{conta}'""")
    return pagina_da_lista(r["rn"] if r else 1)


# ───────────────────────── o navegador ─────────────────────────

# O alvo do print à vista: o meio da parte dele que está na tela é ele mesmo (ou um filho) — não a barra de baixo do celular
# ([data-tabbar], fixa), o topo do app ou outra coisa por cima. Um aviso do sonner por cima não conta (é a prova do passo e some sozinho).
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
# caixa com borda dos 2 lados (a do MP da conta) — e o rótulo não passa da borda do próprio botão (o do e2e/w1/telas.py).
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
# o que pode levar dado da credencial de TESTE (o nome do recebedor no Pix): borrado em TODO print — também no da falha
BORRAR_SEMPRE = "[data-mp-pix-copia-cola], [data-mp-pix-qr]"
CHIP_DA_FORMA = "[data-secao='recebimento-modo'] [data-chip]:not([data-mp-situacao])"


def enquadrar(pg, alvo: str) -> str | None:
    """Rola o alvo para o MEIO da tela antes do print (o do e2e/w1/telas.py) → None se ele ficou à vista, senão o que está por cima."""
    loc = pg.locator(alvo).first
    try:
        loc.evaluate("e => e.scrollIntoView({ block: 'center', inline: 'nearest' })", timeout=5000)
        pg.wait_for_timeout(150)
        return loc.evaluate(JS_A_VISTA, timeout=5000)
    except Exception as e:  # noqa: BLE001 — o alvo sumiu no meio
        return f"o alvo sumiu ({type(e).__name__})"


class Tela(B.Celular):
    """O Celular da hml-18 (o Edge em modo celular, a sessão antes do 1º documento, o `legal` desligado só no navegador, o diálogo
    nativo contado) com o print de nome fixo, a medida da largura e os botões dentro do cartão (o molde do e2e/w1/telas.py). A
    autorização do Mercado Pago nunca abre: a navegação para ela é interceptada (a url guardada em CTX["urls_mp"]) e abortada.
    app=True (--loja, 7c): o Capacitor em modo app antes do 1º documento e o SITE que o app abre por cima de si vira uma página vazia."""

    def __init__(self, nav, base: str, R, rotulo: str, largura: int = 390, guarda: B17.Guarda | None = None, app: bool = False) -> None:
        super().__init__(nav, base, 390, guarda=guarda)
        self.R, self.rotulo = R, rotulo
        self.acoes: list[str] = []
        self.rede: list[str] = []
        self.sites_abertos: list[str] = []
        self.ctx.route(PAGINA_DO_MP, self._autorizacao_do_mp)
        if app:
            self.ctx.add_init_script(CAPACITOR_APP)
            self.ctx.route(SITES_DO_PHYSIQ, self._site_por_cima)
            self.ctx.route(GITHUB, lambda route, _req=None: route.fulfill(status=404, content_type="application/json", body="{}"))
        self.pg.on("request", self._vigiar)
        if largura != 390:
            self.largura_(largura)

    def _autorizacao_do_mp(self, route, _req=None) -> None:
        CTX["urls_mp"].append(route.request.url)
        try:
            route.abort("aborted")
        except Exception:  # noqa: BLE001 — a página fechou no meio
            pass

    def _site_por_cima(self, route, _req=None) -> None:
        self.sites_abertos.append(route.request.url)
        try:
            route.fulfill(status=200, content_type="text/html; charset=utf-8",
                          body="<!doctype html><meta charset=utf-8><title>Physiq (E2E)</title><p>O site aberto por cima do app (E2E).</p>")
        except Exception:  # noqa: BLE001
            pass

    def _vigiar(self, req) -> None:
        """Jeito 2 medido (as tabelas do Recebimento na API REST) e as ações da pagamentos-aluno, na ordem (só o nome da ação)."""
        try:
            if REST_DO_RECEBIMENTO.search(req.url):
                self.rede.append(f"{req.method} {urlparse(req.url).path}")
                CTX["rede"].append(f"{req.method} {urlparse(req.url).path}")
            if req.method == "POST" and "/functions/v1/pagamentos-aluno" in req.url:
                a = acao_de(req.post_data)
                self.acoes.append(str(a))
                CTX["acoes"].append(str(a))
        except Exception:  # noqa: BLE001
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

    def atributo(self, seletor: str, nome: str) -> str | None:
        try:
            loc = self.pg.locator(seletor)
            return loc.first.get_attribute(nome, timeout=3000) if loc.count() else None
        except Exception:  # noqa: BLE001
            return None

    def clicar(self, seletor: str, timeout: float = 15_000) -> None:
        self.pg.locator(seletor).first.click(timeout=timeout)

    def painel_aberto(self) -> bool:
        return self.pg.locator("[role=dialog][data-state=open]").count() > 0

    def titulo_do_painel(self) -> str:
        return self.texto("[role=dialog][data-state=open] h2")

    def fechar_paineis(self) -> bool:
        for _ in range(3):
            if not self.painel_aberto():
                return True
            self.pg.keyboard.press("Escape")
            self.esperar(lambda: not self.painel_aberto(), 5)
        return not self.painel_aberto()

    def toasts(self) -> str:
        return self.textos("[data-sonner-toast]")

    def foto(self, nome: str, alvo: str | None = None, borrar: str | None = None, botoes: str | None = None) -> str:
        """O print em <pasta>/<nome>.png com o elemento à vista; antes, a medida: nada passa da largura (scrollWidth da página).
        borrar: o seletor do que sai borrado além do Pix (BORRAR_SEMPRE). botoes: a raiz da tela em que cada botão fica dentro do
        cartão — conferido a 390 (JS_BOTOES_FORA). A página do MP NUNCA é impressa (o host é conferido antes)."""
        if host(self.pg.url) in HOSTS_DO_MP or "mercadopago" in host(self.pg.url):
            self.R.ok(False, f"   print {nome}: a aba está numa página do Mercado Pago — o print NÃO foi tirado")
            return ""
        fora = None
        if botoes and self.largura == 390:
            try:
                fora = self.pg.locator(botoes).first.evaluate(JS_BOTOES_FORA, timeout=5000)
            except Exception as e:  # noqa: BLE001 — a raiz sumiu no meio
                fora = [f"a raiz {botoes} sumiu ({type(e).__name__})"]
        if alvo:
            enquadrar(self.pg, alvo)
        borrar = f"{BORRAR_SEMPRE}, {borrar}" if borrar else BORRAR_SEMPRE
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
            if "mercadopago" in host(self.pg.url):
                return
            pasta: Path = CTX["pasta"] / "falhas"
            pasta.mkdir(parents=True, exist_ok=True)
            try:  # o Pix sai borrado também no print da falha
                self.pg.add_style_tag(content=f"{BORRAR_SEMPRE} {{ filter: blur(7px) !important; }}")
            except Exception:  # noqa: BLE001
                pass
            self.pg.screenshot(path=str(pasta / f"{nome}_{self.rotulo.replace(' ', '_')}.png"))
            self.R.linha(f"   diagnóstico [{self.rotulo}]: {self.caminho()} · erros de página {self.erros[-3:]}")
        except Exception:  # noqa: BLE001
            pass

    def encerrar(self, logins=None, tolerar: re.Pattern | None = None) -> None:
        graves = [e for e in self.erros if "ResizeObserver" not in e and not (tolerar and tolerar.search(e))]
        self.R.ok(not graves and not self.dialogos, f"[{self.rotulo}] sem erro de página nem diálogo nativo ({graves[:2]} {self.dialogos[:2]})")
        self.fim(logins)


def confirmar_no_app(t: Tela, espera: float = 10.0) -> str | None:
    """A confirmação do APP (src/ui/premium/Confirmar.tsx — hml-18a, nunca o window.confirm): lê o título, toca no verbo da ação e espera
    sair. → o título (None se não abriu)."""
    ok = t.pg.locator("[role=alertdialog][data-state=open] [data-confirmar-ok]").first
    try:
        ok.wait_for(state="visible", timeout=int(espera * 1000))
    except Exception:  # noqa: BLE001
        return None
    titulo = t.texto("[role=alertdialog][data-state=open] h2")
    ok.click()
    try:
        t.pg.locator("[role=alertdialog]").first.wait_for(state="detached", timeout=5000)
    except Exception:  # noqa: BLE001
        pass
    return titulo


def painel(R, rota: str) -> Tela:
    """O painel do dono (prof2), aberto 1 vez na rodada (a 1280); as próximas chamadas só navegam."""
    t = CTX.get("painel")
    if t is None:
        guarda()
        t = Tela(CTX["nav"], CTX["base"], R, "painel do dono", 1280)
        CTX["painel"] = t
        t.entrar(CTX["logins"], DONO, rota)
    else:
        if t.largura != 1280:
            t.largura_(1280)
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
        sessao_unica(ALUNO)
    else:
        t.ir(rota)
    return t


def escolher_mp(t: Tela) -> bool:
    """Recebimento aberto: escolhe "Mercado Pago (sua conta)" (se ainda não for a forma na tela) e espera o bloco do MP da conta."""
    opcao = "[data-opcoes='recebimento-modo'] [data-opcao='mercadopago_conta']"
    if not t.esperar(lambda: t.tem(opcao), 60):
        return False
    if t.atributo(opcao, "aria-checked") != "true":
        t.clicar(opcao)
    return t.esperar(lambda: t.tem("[data-recebimento-mp-conta] [data-mp-situacao]"), 20)


def abrir_pagar(t: Tela, R, rotulo: str) -> bool:
    """Pagamentos do aluno → "Pagar R$ 10,00" → a folha do Mercado Pago."""
    valor = reais(API.um(f"select mensalidade_valor::float as v from {S}.pacientes where id = '{CTX['pac']}'")["v"])
    ok = R.ok(t.esperar(lambda: t.tem("[data-mensalidade-aluno] [data-pagar-mensalidade]"), 60),
              f"{rotulo}. Pagamentos abre com a mensalidade e o Pagar ({'loja' if CTX['loja'] else 'site'})")
    if not ok:
        return False
    botao, linha = t.texto("[data-pagar-mensalidade]"), t.texto("[data-linha-mensalidade]")
    R.ok(botao == f"Pagar {valor}" and linha.endswith("Pix ou cartão"), f"{rotulo}. '{botao}' · '… {linha[-20:]}' (Pagar {valor} · Pix ou cartão)")
    t.clicar("[data-pagar-mensalidade]")
    return R.ok(t.esperar(lambda: t.tem("[data-pagar-mp]"), 20), f"{rotulo}. a folha do Mercado Pago abre ({t.titulo_do_painel()!r})")


# ───────────────────────── os passos ─────────────────────────

def passo_recebimento(R) -> None:
    R.linha("\n── 1. Configurações › Recebimento: 'Mercado Pago (sua conta)' e o jeito 2 medido na rede")
    t = painel(R, ROTA_RECEBIMENTO)
    opcao = "[data-opcoes='recebimento-modo'] [data-opcao='mercadopago_conta']"
    R.ok(t.esperar(lambda: t.tem(opcao), 60), "1. o dono abre Configurações › Recebimento e a opção do MP da conta aparece (a flag ligada no staging)")
    R.ok(OPCAO_MP_CONTA in t.texto(opcao), f"1. a opção: '{OPCAO_MP_CONTA}' ({t.texto(opcao)[:80]!r})")
    marcada = t.atributo("[data-opcoes='recebimento-modo'] [data-opcao='pix_manual']", "aria-checked")
    R.ok(marcada == "true" and t.texto(CHIP_DA_FORMA).upper() == ROTULO_MODO["pix_manual"],
         f"1. a forma de partida: Pix na chave (aria-checked {marcada} · chip {t.texto(CHIP_DA_FORMA)!r})")
    R.ok(not t.tem("[data-opcoes='recebimento-modo'] [data-opcao='mercadopago']"), "1. o Mercado Pago do Physiq não aparece para o dono (só o master liga)")
    if not escolher_mp(t):
        R.ok(False, "1. escolher a opção não mostrou o bloco do Mercado Pago da conta")
        return
    chip = t.atributo("[data-mp-situacao]", "data-mp-situacao")
    R.ok(chip == "desconectado" and t.texto("[data-mp-conectar]") == CONECTAR,
         f"1. o bloco: 'Desconectado' e '{CONECTAR}' ({chip} · {t.texto('[data-mp-conectar]')!r})")
    salvar = t.pg.locator("[data-recebimento-salvar-modo]").first
    R.ok(t.texto("[data-mp-salvar-dica]") == SALVAR_DICA and salvar.is_disabled(),
         f"1. '{SALVAR_DICA}' e o 'Salvar a forma' desligado até conectar ({t.texto('[data-mp-salvar-dica]')!r})")
    t.fotos("1_recebimento", "[data-recebimento-mp-conta]", botoes=RAIZ_RECEBIMENTO)
    R.ok(t.rede == [], f"1. jeito 2: nenhuma chamada do navegador a contas/recebimento_chaves/recebimento_integracoes/mp_conexoes ({t.rede})")


def passo_conectar(R) -> None:
    R.linha("\n── 2. 'Conectar com o Mercado Pago': a navegação para a autorização do MP é interceptada e abortada (a URL conferida, nunca a página)")
    t = painel(R, ROTA_RECEBIMENTO)
    if not escolher_mp(t) or not t.tem("[data-mp-conectar]"):
        R.ok(False, "2. sem o botão Conectar na tela")
        return
    n0 = len(CTX["urls_mp"])
    antes = contar_acoes(t.acoes, "prof_mp_conectar")
    t.clicar("[data-mp-conectar]")
    t.esperar(lambda: len(CTX["urls_mp"]) > n0, 30)
    urls = CTX["urls_mp"][n0:]
    url = urls[0] if urls else None
    R.ok(contar_acoes(t.acoes, "prof_mp_conectar") == antes + 1, "2. o Conectar pediu a URL à função (prof_mp_conectar, 1 vez)")
    if not url:
        R.ok(False, f"2. a navegação para a autorização do MP não aconteceu em 30 s (toasts {t.toasts()[:120]!r})")
        return
    c = conferir_url_do_mp(url, API.REDIRECT_PROPRIO, API.clientes_conhecidos())
    R.ok(all(c.values()), f"2. a autorização do MP: {host(url)} — {', '.join(k for k, v in c.items() if v)} "
                          f"{'(falhou: ' + ', '.join(k for k, v in c.items() if not v) + ')' if not all(c.values()) else ''}")
    t.pg.wait_for_timeout(1500)
    R.ok(host(t.pg.url) == host(CTX["base"]) and t.caminho() == ROTA_RECEBIMENTO,
         f"2. a navegação foi abortada: a aba continua no app ({host(t.pg.url)}{t.caminho()}) — a página do MP nunca abriu")
    con = API.um(f"""select count(*)::int as n, bool_and(redirect_uri = {API.lit(API.REDIRECT_PROPRIO)} and usado_em is null) as ok
                       from {S}.mp_conexoes where conta_id = '{CTX['conta']}' and criado_em >= {API.lit(API.CTX['t0'])}::timestamptz""")
    R.ok(con["n"] >= 1 and con["ok"], f"no banco: a conexão nasceu com o redirect próprio, ainda sem uso ({con})")
    t.fotos("2_conectar", "[data-recebimento-mp-conta]", botoes=RAIZ_RECEBIMENTO)
    R.ok(t.rede == [], f"2. jeito 2 (passos 1 e 2): nenhuma chamada do navegador às tabelas ({t.rede})")


def passo_volta(R) -> None:
    R.linha("\n── 4. a volta do Mercado Pago na tela: negado, conectar (o destaque), confirmar com o id inventado e com lixo")
    t = painel(R, f"{ROTA_RECEBIMENTO}?mp=negado")
    R.ok(t.esperar(lambda: t.texto("[data-mp-retorno='negado']") == TEXTO_NEGADO, 45),
         f"4a. ?mp=negado → '{TEXTO_NEGADO[:46]}…' ({t.texto('[data-mp-retorno]')[:70]!r})")
    R.ok(t.esperar(lambda: urlparse(t.pg.url).query == "", 15), f"4a. a busca some do endereço ({t.caminho()}{'?…' if urlparse(t.pg.url).query else ''})")
    t.fotos("4a_volta_negado", "[data-recebimento-mp-conta]", botoes=RAIZ_RECEBIMENTO)

    antes, n_mp = list(t.acoes), len(CTX["urls_mp"])
    t.ir(f"{ROTA_RECEBIMENTO}?mp=conectar")
    R.ok(t.esperar(lambda: t.tem("[data-mp-conectar][data-mp-conectar-destaque]"), 45),
         "4b. ?mp=conectar → o MP da conta escolhido e o botão Conectar em destaque")
    t.pg.wait_for_timeout(2500)
    novas = t.acoes[len(antes):]
    R.ok(not contar_acoes(novas, "prof_mp_conectar", "prof_mp_confirmar") and len(CTX["urls_mp"]) == n_mp,
         f"4b. ?mp=conectar não começa nada sozinho: nenhum conectar/confirmar à função nem ida ao MP "
         f"({[a for a in novas if a != 'prof_recebimento']})")
    R.ok(urlparse(t.pg.url).query == "", "4b. a busca some do endereço")
    t.foto("4b_volta_conectar", "[data-mp-conectar]", botoes=RAIZ_RECEBIMENTO)

    antes = list(t.acoes)
    t.ir(f"{ROTA_RECEBIMENTO}?mp=confirmar&c={uuid.uuid4()}")
    R.ok(t.esperar(lambda: t.texto("[data-mp-retorno]") == TEXTO_INVALIDO, 45),
         f"4c. ?mp=confirmar&c=<uuid inventado> → '{TEXTO_INVALIDO[:50]}…' ({t.atributo('[data-mp-retorno]', 'data-mp-retorno')} · "
         f"{t.texto('[data-mp-retorno]')[:60]!r})")
    novas = t.acoes[len(antes):]
    R.ok(contar_acoes(novas, "prof_mp_confirmar") == 1 and not t.tem("[role=alertdialog][data-state=open]"),
         f"4c. 1 pergunta à função (prof_mp_confirmar sem confirmar) e nenhuma confirmação aberta ({contar_acoes(novas, 'prof_mp_confirmar')})")
    R.ok(urlparse(t.pg.url).query == "", "4c. a busca some do endereço")

    antes = list(t.acoes)
    t.ir(f"{ROTA_RECEBIMENTO}?mp=confirmar&c=lixo")
    R.ok(t.esperar(lambda: t.texto("[data-mp-retorno='invalido']") == TEXTO_INVALIDO, 45),
         f"4d. ?mp=confirmar&c=lixo → o mesmo texto ({t.texto('[data-mp-retorno]')[:60]!r})")
    t.pg.wait_for_timeout(2000)
    novas = t.acoes[len(antes):]
    R.ok(not contar_acoes(novas, "prof_mp_confirmar", "prof_mp_conectar"), f"4d. sem nenhum pedido de confirmar à função ({novas})")
    t.fotos("4d_volta_invalido", "[data-recebimento-mp-conta]", botoes=RAIZ_RECEBIMENTO)
    con = API.um(f"""select count(*)::int as n from {S}.recebimento_integracoes where conta_id = '{CTX['conta']}' and provedor = 'mercadopago'""")
    R.ok(con["n"] == 0 and API.modo() == "pix_manual", f"no banco: nada foi conectado pelas voltas (integrações {con['n']} · forma {API.modo()})")
    R.ok(CTX["rede"] == [], f"4. jeito 2 (passos 1, 2 e 4): nenhuma chamada do navegador às tabelas ({CTX['rede']})")


def passo_conectado(R) -> None:
    R.linha("\n── 3. a conexão simulada (o SQL do servidor) + 'Salvar a forma': 'Conectado', o apelido e a forma MP da conta")
    try:
        g = API.garantir_simulada(ligar=False)
    except Exception as e:  # noqa: BLE001
        R.ok(False, f"3. a conexão simulada não gravou: {type(e).__name__}: {str(e)[:200]}")
        return
    i = g.get("integracao") or {}
    R.ok(i.get("status") == "ativa" and i.get("mp_apelido") == APELIDO_SIMULADA and API.modo() == "pix_manual",
         f"no banco: a conta conectada (simulada, {i.get('mp_origem')}) e a forma ainda no Pix ({i.get('status')} · {API.modo()})")
    R.ok(chave_de_teste(i.get("mp_public_key")),
         "no banco: a conexão simulada com a chave pública de TESTE (TEST-…) — sem ela o aluno só vê o Pix (decisão 14); o valor não aparece")
    t = painel(R, ROTA_RECEBIMENTO)
    if not escolher_mp(t):
        R.ok(False, "3. o bloco do MP da conta não abriu")
        return
    R.ok(t.esperar(lambda: t.atributo("[data-mp-situacao]", "data-mp-situacao") == "conectado", 30)
         and t.texto("[data-mp-situacao]").upper() == "CONECTADO" and APELIDO_SIMULADA in t.texto("[data-mp-texto]"),
         f"3. o chip 'Conectado' e o apelido '{APELIDO_SIMULADA}' ({t.texto('[data-mp-situacao]')!r} · {t.texto('[data-mp-texto]')[:90]!r})")
    R.ok(not t.tem("[data-mp-so-pix]") and t.tem("[data-mp-desconectar]") and not t.tem("[data-mp-conectar]"),
         "3. com a chave pública: sem o 'só Pix'; o 'Desconectar' no lugar do Conectar")
    t.clicar("[data-recebimento-salvar-modo]")
    R.ok(t.esperar(lambda: PRONTO_MP in t.toasts() and t.texto(CHIP_DA_FORMA).upper() == ROTULO_MODO["mercadopago_conta"], 45),
         f"3. 'Salvar a forma' → '{PRONTO_MP}' e a forma {ROTULO_MODO['mercadopago_conta']} ({t.texto(CHIP_DA_FORMA)!r} · {t.toasts()[:90]!r})")
    R.ok(API.modo() == "mercadopago_conta", f"no banco: a forma é o MP da conta ({API.modo()})")
    t.fotos("3_conectado", "[data-recebimento-mp-conta]", botoes=RAIZ_RECEBIMENTO)
    R.ok(CTX["rede"] == [], f"3. jeito 2 (passos 1 a 4): nenhuma chamada do navegador às tabelas ({CTX['rede']})")


def passo_app_pix(R) -> None:
    R.linha("\n── 5. o aluno paga pelo MP do personal: Pagar → o Pix (QR) → 'Simular aprovação (teste)' → pago")
    if not garantir_conectada(R, "5"):
        return
    integ = API.linha_integracao() or {}
    t = app_do_aluno(R)
    if not abrir_pagar(t, R, "5"):
        return
    R.ok(t.tem("[data-mp-gerar-pix]") and t.tem("[data-mp-cartao]") and not t.tem("[data-mp-indisponivel]"),
         f"5. a folha: o Pix e o cartão (a chave do vendedor) ({t.texto('[data-mp-gerar-pix]')!r} · {t.texto('[data-mp-cartao]')!r})")
    t.clicar("[data-mp-gerar-pix]")
    if not R.ok(t.esperar(lambda: t.tem("[data-mp-pix-aberto]"), 45), f"5. o Pix do MP abre (toasts {t.toasts()[:100]!r})"):
        return
    c = t.atributo("[data-mp-pix-aberto]", "data-mp-pix-aberto")
    linha = API.cobranca(c) if uuid_ok(c) else {}
    simulado = str(linha.get("mp_payment_id") or "").startswith("sim-")
    R.ok(t.tem("[data-mp-pix-qr]") or simulado,
         f"5. o QR do Pix ({'o QR do MP' if t.tem('[data-mp-pix-qr]') else 'o Pix SIMULADO do staging: o sandbox do MP respondeu 5xx'})")
    R.ok(linha.get("forma") == "mp" and linha.get("status") == "aguardando_confirmacao" and integ.get("mp_user_id") is not None
         and str(linha.get("mp_collector_id")) == str(integ.get("mp_user_id")),
         f"no banco: o Pix aguardando, forma mp, NA CONTA do personal (o collector = o da integração) ({linha.get('status')} · "
         f"collector {'igual' if str(linha.get('mp_collector_id')) == str(integ.get('mp_user_id')) else 'diferente'})")
    if linha.get("mp_payment_id") and not simulado:
        API.anotar_criado_no_mp("payment", linha["mp_payment_id"])  # o desfazer do api.py cancela no sandbox
    t.foto("5_app_pix", "[data-mp-pix-aberto]")
    R.ok(t.texto("[data-mp-simular]") == SIMULAR, f"5. o '{SIMULAR}' (o staging) ({t.texto('[data-mp-simular]')!r})")
    t.clicar("[data-mp-simular]")
    R.ok(t.esperar(lambda: APROVACAO_SIMULADA in t.toasts(), 30), f"5. '{APROVACAO_SIMULADA}' ({t.toasts()[:90]!r})")
    pago = API.cobranca(c) if uuid_ok(c) else {}
    R.ok(pago.get("status") == "paga" and bool(API.pago_ate()), f"no banco: a cobrança paga e a mensalidade coberta ({pago.get('status')} · até {API.pago_ate()})")
    t.fechar_paineis()
    t = app_do_aluno(R)
    R.ok(t.esperar(lambda: t.tem("[data-mensalidade-aluno]") and not t.tem("[data-pagar-mensalidade]"), 60),
         f"5. de volta a Pagamentos: em dia, sem o Pagar ({t.texto('[data-linha-mensalidade]')[:60]!r})")
    t.foto("5b_app_pago", "[data-mensalidade-aluno]")


def passo_app_cartao(R) -> None:
    R.linha("\n── 6. o cartão abre com a chave do vendedor (data-brick-chave='conta'); nada é pago aqui")
    if not garantir_conectada(R, "6"):
        return
    esconder_e_reler()
    t = app_do_aluno(R)
    if not abrir_pagar(t, R, "6"):
        return
    if not R.ok(t.tem("[data-mp-cartao]"), "6. o 'Pagar com cartão' (a conexão tem a chave pública)"):
        return
    t.clicar("[data-mp-cartao]")
    R.ok(t.esperar(lambda: t.tem("[data-cartao-mp='avista'] [data-brick-mp]"), 20), "6. o painel do cartão abre com o Brick")
    chave = t.atributo("[data-cartao-mp='avista'] [data-brick-mp]", "data-brick-chave")
    R.ok(chave == "conta", f"6. o Brick nasce com a chave DO VENDEDOR (data-brick-chave '{chave}' — o valor nunca na tela)")
    brick = t.esperar(lambda: t.pg.locator("[data-brick-mp] iframe").count() > 0, 25)
    R.linha(f"   o formulário do cartão (Brick do Mercado Pago) {'carregou' if brick else 'não carregou em 25 s'} — informativo")
    t.foto("6_app_cartao", "[data-cartao-mp='avista']")
    R.ok(t.fechar_paineis(), "6. o cartão e a folha fecham sem pagar")
    n = API.um(f"""select count(*)::int as n from {S}.cobrancas where paciente_id = '{CTX['pac']}' and metodo = 'cartao'
                    and created_at >= {API.lit(API.CTX['t0'])}::timestamptz""")["n"]
    R.ok(n == 0, f"no banco: nenhuma cobrança de cartão nasceu ({n})")


def passo_erro(R) -> None:
    R.linha("\n── 7. a conexão em erro: o dono vê 'Conexão caiu' + 'Conectar de novo'; o aluno, 'indisponível'")
    if not garantir_conectada(R, "7"):
        return
    esconder_e_reler()
    API.sql(f"""update {S}.recebimento_integracoes set status = 'erro', mp_erro = 'acesso_recusado'
                 where conta_id = '{CTX['conta']}' and provedor = 'mercadopago'""")
    try:
        t = painel(R, ROTA_RECEBIMENTO)
        R.ok(t.esperar(lambda: t.atributo("[data-mp-situacao]", "data-mp-situacao") == "caiu", 45)
             and t.texto("[data-mp-situacao]").upper() == "CONEXÃO CAIU" and t.texto("[data-mp-reconectar]") == CONECTAR_DE_NOVO,
             f"7. o dono: 'Conexão caiu' e '{CONECTAR_DE_NOVO}' ({t.texto('[data-mp-situacao]')!r} · {t.texto('[data-mp-reconectar]')!r})")
        R.ok(t.tem("[data-mp-desconectar]"), "7. o 'Desconectar' também (a conexão caída sai)")
        t.fotos("7_erro_dono", "[data-recebimento-mp-conta]", botoes=RAIZ_RECEBIMENTO)
        a = app_do_aluno(R)
        if abrir_pagar(a, R, "7"):
            R.ok(a.esperar(lambda: a.texto("[data-mp-indisponivel]") == INDISPONIVEL, 15)
                 and not a.tem("[data-mp-gerar-pix]") and not a.tem("[data-mp-cartao]"),
                 f"7. o aluno: só o aviso '{INDISPONIVEL[:40]}…' — sem Pix nem cartão ({a.texto('[data-mp-indisponivel]')!r})")
            a.foto("7b_erro_aluno", "[data-mp-indisponivel]")
            a.fechar_paineis()
        if CTX["loja"]:
            passo_conectar_apk(R)
    finally:
        API.sql(f"""update {S}.recebimento_integracoes set status = 'ativa', mp_erro = null
                     where conta_id = '{CTX['conta']}' and provedor = 'mercadopago' and status = 'erro'""")


def passo_conectar_apk(R) -> None:
    """--loja (7c): o build da loja com o Capacitor em modo app — "Conectar de novo" pede origem apk; a função devolve a URL do SITE
    (no_site) e o app abre o SITE (?mp=conectar) por cima de si, nunca a autorização do MP."""
    R.linha("\n── 7c. o conectar do APK (o build da loja com o Capacitor em modo app): o SITE no navegador, nunca a autorização do MP")
    guarda()
    t = Tela(CTX["nav"], CTX["base"], R, "painel do dono no app", 390, app=True)
    try:
        t.entrar(CTX["logins"], DONO, ROTA_RECEBIMENTO)
        if not R.ok(t.esperar(lambda: t.tem("[data-mp-reconectar]"), 60), "7c. o Recebimento no modo app com 'Conectar de novo'"):
            return
        nativo = t.pg.evaluate("() => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())")
        R.ok(nativo is True, f"7c. o Capacitor em modo app (isNativePlatform {nativo})")
        n0 = len(CTX["urls_mp"])
        with t.pg.expect_response(lambda r: "/functions/v1/pagamentos-aluno" in r.url and acao_de(r.request.post_data) == "prof_mp_conectar",
                                  timeout=45_000) as info:
            t.clicar("[data-mp-reconectar]")
        resp = info.value
        try:
            pedido = json.loads(resp.request.post_data or "{}")
            corpo = resp.json()
        except Exception:  # noqa: BLE001
            pedido, corpo = {}, {}
        R.ok(pedido.get("origem") == "apk" and resp.status == 200 and corpo.get("no_site") is True and url_do_site_no_app(corpo.get("url")),
             f"7c. o pedido com origem apk → a URL do SITE com ?mp=conectar e no_site ({resp.status} · origem {pedido.get('origem')} · "
             f"no_site {corpo.get('no_site')} · {host(corpo.get('url'))})")
        R.ok(t.esperar(lambda: bool(t.sites_abertos), 20) and url_do_site_no_app(t.sites_abertos[0] if t.sites_abertos else None),
             f"7c. o app abriu o SITE por cima de si (Browser.open) — {host(t.sites_abertos[0]) if t.sites_abertos else 'nada'}")
        R.ok(len(CTX["urls_mp"]) == n0, "7c. nenhuma ida à autorização do MP pelo app")
        for pg in list(t.ctx.pages)[1:]:
            try:
                pg.close()
            except Exception:  # noqa: BLE001
                pass
        R.ok(t.esperar(lambda: t.texto("[data-mp-no-navegador]") == NO_NAVEGADOR, 15), f"7c. '{NO_NAVEGADOR}' ({t.texto('[data-mp-no-navegador]')!r})")
        n = API.um(f"""select count(*)::int as n from {S}.mp_conexoes where conta_id = '{CTX['conta']}'
                        and criado_em >= {API.lit(API.CTX['t0'])}::timestamptz""")["n"]
        R.ok(n == 0, f"no banco: o conectar do app não criou conexão — ela nasce no site (decisão 6) ({n})")
        t.foto("7c_conectar_apk", "[data-recebimento-mp-conta]", botoes=RAIZ_RECEBIMENTO)
    except Exception:
        t.diagnostico("conectar_apk")
        raise
    finally:
        # no modo app, os plugins sem a versão web (atualizador, notificações) podem reclamar no console: só os "not implemented" são tolerados
        t.encerrar(CTX["logins"], tolerar=re.compile(r"not implemented on android|is not implemented", re.I))


def passo_desconectar(R) -> None:
    R.linha("\n── 8. 'Desconectar' com uma automática pendente: as 2 confirmações do app → o chip PIX NA CHAVE")
    if not garantir_conectada(R, "8"):
        return
    collector = (API.linha_integracao() or {}).get("mp_user_id")
    aid = API.inserir_assinatura(f"sim-w2tela-{secrets.token_hex(6)}", "pending", collector, {"simulada": True, "teste_w2_telas": True})
    esperado = "pix_manual" if API.chave_ativa() else "nenhum"
    t = painel(R, ROTA_RECEBIMENTO)
    if not R.ok(t.esperar(lambda: t.tem("[data-recebimento-mp-conta] [data-mp-desconectar]"), 45), "8. o 'Desconectar' no bloco do MP da conta"):
        return
    t.clicar("[data-mp-desconectar]")
    t1 = confirmar_no_app(t)
    R.ok(t1 == DESCONECTAR_TITULO, f"8. a 1ª confirmação do app: '{DESCONECTAR_TITULO}' ({t1!r})")
    t2 = confirmar_no_app(t, 30)
    R.ok(t2 == DESLIGAR_AUTOMATICAS, f"8. a 2ª (a automática viva → 409): '{DESLIGAR_AUTOMATICAS}' ({t2!r})")
    R.ok(t.esperar(lambda: DESCONECTADO_1 in t.toasts(), 45), f"8. '{DESCONECTADO_1[:60]}…' ({t.toasts()[:120]!r})")
    R.ok(t.esperar(lambda: t.texto(CHIP_DA_FORMA).upper() == ROTULO_MODO[esperado], 30),
         f"8. o chip da forma: {ROTULO_MODO[esperado]} ({t.texto(CHIP_DA_FORMA)!r})")
    i = API.linha_integracao() or {}
    R.ok(API.modo() == esperado and i.get("status") == "desconectada" and API.assinatura(aid).get("status") == "cancelled",
         f"no banco: a forma {esperado}, a integração desconectada e a automática cancelada ({API.modo()} · {i.get('status')} · "
         f"{API.assinatura(aid).get('status')})")
    R.ok(API.avisos("geral", "forma de receber")["aluno"] >= 1, "no banco: o aluno avisado da troca")
    t.fotos("8_desconectado", "[data-secao='recebimento-modo']", botoes=RAIZ_RECEBIMENTO)


def passo_master(R) -> None:
    R.linha("\n── 9. master › Integrações: o MP do personal na linha da conta, o KPI e o 'Desligar' com as 2 confirmações")
    if not garantir_conectada(R, "9"):
        return
    conta = CTX["conta"]
    collector = (API.linha_integracao() or {}).get("mp_user_id")
    aid = API.inserir_assinatura(f"sim-w2tela-{secrets.token_hex(6)}", "authorized", collector, {"simulada": True, "teste_w2_telas": True})
    pagina = pagina_da_conta(conta)
    esperado = "pix_manual" if API.chave_ativa() else "nenhum"
    if not dar_master(R):
        return
    t = None
    try:
        guarda()
        t = Tela(CTX["nav"], CTX["base"], R, "master", 1280)
        t.entrar(CTX["logins"], MASTER, f"/master/integracoes?pagina={pagina}")
        linha = f"[data-mp-conta-da-conta='{conta}']"
        R.ok(t.esperar(lambda: t.tem(linha), 60), f"9. master › Integrações (página {pagina}): a conta do {DONO} no MP do personal")
        R.ok(t.atributo(linha, "data-mp-conta-situacao") == "conectado" and APELIDO_SIMULADA in t.texto(linha) and "Conectado" in t.texto(linha),
             f"9. a linha: '{APELIDO_SIMULADA} · Conectado' ({t.texto(linha)!r})")
        sel = t.pg.locator("select[data-recebimento] option[value='mercadopago_conta']")
        R.ok(sel.count() >= 1 and "Mercado Pago do personal" in limpo(sel.first.inner_text()), "9. o select fala 'Mercado Pago do personal'")
        kpi = f"[data-kpi='{KPI_MP_CONTA}'] [data-kpi-valor]"
        R.ok(t.esperar(lambda: t.texto(kpi).isdigit() and int(t.texto(kpi)) >= 1, 30), f"9. o KPI '{KPI_MP_CONTA}' conta a conta ({t.texto(kpi)!r})")
        outras = f"[data-lista='master-integracoes'] [data-item]:not(:has({linha})) *"  # o nome das outras contas sai borrado
        t.fotos("9_master_integracoes", linha, borrar=outras)
        t.clicar(f"[data-desligar-mp-conta='{conta}']")
        p1 = t.tem("[role=alertdialog][data-state=open] [data-master-confirmar='desligar-mp-conta']") or \
            t.esperar(lambda: t.tem("[data-master-confirmar='desligar-mp-conta']"), 10)
        t1 = confirmar_no_app(t)
        R.ok(p1 and bool(t1) and t1.startswith("Desligar o Mercado Pago do personal de"), f"9. o 1º OK: {t1!r}")
        p2 = t.esperar(lambda: t.tem("[role=alertdialog][data-state=open] [data-master-confirmar='automaticas']"), 30)
        t2 = confirmar_no_app(t)
        R.ok(p2 and bool(t2) and t2.startswith("Desligar as cobranças automáticas"), f"9. o 2º OK (a automática viva → 409): {t2!r}")
        toast = f"Recebimento: {ROTULO_RECEBIMENTO[esperado]}."
        R.ok(t.esperar(lambda: toast in t.toasts(), 45), f"9. desligado: '{toast}' ({t.toasts()[:140]!r})")
        i = API.linha_integracao() or {}
        R.ok(API.modo() == esperado and i.get("status") == "desconectada" and API.assinatura(aid).get("status") == "cancelled",
             f"no banco: a forma {esperado}, a integração desconectada e a automática cancelada ({API.modo()} · {i.get('status')} · "
             f"{API.assinatura(aid).get('status')})")
        R.ok(t.esperar(lambda: not t.tem(linha), 20), "9. a linha da conta sem o MP do personal nem o 'Desligar'")
    except Exception:
        if t is not None:
            t.diagnostico("master")
        raise
    finally:
        devolver_master(CTX["est"])
        if t is not None:
            t.encerrar(CTX["logins"])  # a sessão MAIS NOVA da w27-master volta para o arquivo da hml-18 (o app renova o refresh)


PASSOS = (("recebimento", passo_recebimento), ("conectar", passo_conectar), ("volta", passo_volta), ("conectado", passo_conectado),
          ("app_pix", passo_app_pix), ("app_cartao", passo_app_cartao), ("erro", passo_erro), ("desconectar", passo_desconectar),
          ("master", passo_master))
PASSOS_LOJA = (("app_pix", passo_app_pix), ("app_cartao", passo_app_cartao), ("erro", passo_erro))


# ───────────────────────── produção (SÓ LEITURA) ─────────────────────────

def eh_acao(resp, acao: str) -> bool:
    req = resp.request
    return "/functions/v1/pagamentos-aluno" in resp.url and req.method == "POST" and B17.acao_do_corpo(req) == acao


def rodada_prod(R, a, base: str) -> int:
    """SÓ LEITURA: a Guarda no navegador; nenhum SQL; nenhum clique que grava. As contas de TESTE da produção (e2e/w07/smoke_prod.py)."""
    if not saude_dos_2():
        R.linha("   um dos 2 bancos não está saudável — parar (regra de 10/10)")
        return 2
    CTX["logins"] = B.Logins("w2/telas.py prod")
    g = GuardaW2()
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
            disponivel = bool((rec.get("mercadopago_conta") or {}).get("disponivel"))
            R.ok(t.esperar(lambda: t.tem("[data-opcoes='recebimento-modo']"), 60) and bool(rec),
                 "p1. Recebimento abre pela função (prof_recebimento — a leitura do jeito 2)")
            tem_mp = t.tem("[data-opcoes='recebimento-modo'] [data-opcao='mercadopago_conta']")
            R.ok(tem_mp == disponivel or (rec.get("conta") or {}).get("modo") == "mercadopago_conta",
                 f"p1. a opção '{OPCAO_MP_CONTA}' {'aparece' if tem_mp else 'fica escondida'} — igual ao servidor (disponível {disponivel} · "
                 f"master {master}{' · sem a W2 no public: a chave nem vem' if 'mercadopago_conta' not in rec else ''})")
            t.fotos("p1_recebimento", "[data-secao='recebimento-modo']", borrar=borrar_prod, botoes=RAIZ_RECEBIMENTO)
            if master:
                t.ir("/master/integracoes")
                R.ok(t.esperar(lambda: t.tem(f"[data-kpi='{KPI_MP_CONTA}']"), 60), f"p2. master › Integrações: o KPI '{KPI_MP_CONTA}'")
                t.fotos("p2_master_integracoes", f"[data-kpi='{KPI_MP_CONTA}']", borrar=B.BORRAR_LISTAS)
            else:
                R.linha("   p2. master › Integrações: fora (sem master de teste na produção — hml-02/H-04)")
            R.ok(t.rede == [], f"p1. jeito 2: nenhuma chamada do navegador às tabelas do Recebimento ({t.rede})")
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
            R.ok(not g.barradas_pagamentos and not CTX["urls_mp"],
                 f"nada da pagamentos-aluno tentou gravar e ninguém foi ao MP (barradas: {g.barradas_pagamentos}; a Guarda barrou "
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
    """--seco: a rede DESTE processo só fala com o build servido — qualquer outro host (o banco pela Management API, o Auth, as funções,
    o MP) levanta erro e fica contado."""
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


def url_do_mp_de_mentira(**troca) -> str:
    """Uma autorização do MP como a função monta (os valores são de mentira; o client é o conhecido, se houver)."""
    conhecidos = sorted(API.clientes_conhecidos())
    q = {"client_id": conhecidos[0] if conhecidos else "1234567890123456", "response_type": "code", "platform_id": "mp",
         "redirect_uri": API.REDIRECT_PROPRIO, "state": "s" * 43, "code_challenge": "d" * 43, "code_challenge_method": "S256"}
    base = troca.pop("_base", "https://auth.mercadopago.com/authorization")
    q.update(troca)
    return f"{base}?{urlencode({k: v for k, v in q.items() if v is not None})}"


def autoteste(R) -> None:
    """As funções puras e as medidas do roteiro (nada de rede)."""
    api = "https://api-principal.physiqcalc.com.br"
    casos = (("/rest/v1/contas?select=id", True), ("/rest/v1/recebimento_chaves?conta_id=eq.x", True),
             ("/rest/v1/recebimento_integracoes?x=1", True), ("/rest/v1/mp_conexoes?x=1", True), ("/rest/v1/conta_membros?x=1", False),
             ("/rest/v1/rpc/minha_situacao", False), ("/functions/v1/pagamentos-aluno", False))
    R.ok(all(bool(REST_DO_RECEBIMENTO.search(api + u)) is e for u, e in casos),
         "seco: a medida do jeito 2 pega só contas, recebimento_chaves, recebimento_integracoes e mp_conexoes na API REST")
    urls = (("https://auth.mercadopago.com/authorization?x=1", True), ("https://auth.mercadopago.com.br/authorization", True),
            ("https://www.mercadopago.com/x", False), ("https://auth.mercadopago.com.golpe.io/x", False), ("about:blank", False))
    R.ok(all(bool(PAGINA_DO_MP.match(u)) is e for u, e in urls), "seco: a interceptação pega só a autorização do MP (.com e .com.br)")
    boa = conferir_url_do_mp(url_do_mp_de_mentira(), API.REDIRECT_PROPRIO, API.clientes_conhecidos())
    ruins = {
        "redirect de teste": url_do_mp_de_mentira(redirect_uri=API.REDIRECT_TESTE),
        "state curto": url_do_mp_de_mentira(state="curto"),
        "sem S256": url_do_mp_de_mentira(code_challenge_method="plain"),
        "client errado": url_do_mp_de_mentira(client_id="0"),
        "host falso": url_do_mp_de_mentira(_base="https://auth.mercadopago.com.golpe.io/authorization"),
        "http": url_do_mp_de_mentira(_base="http://auth.mercadopago.com/authorization"),
        "outro caminho": url_do_mp_de_mentira(_base="https://auth.mercadopago.com/logout"),
    }
    pegos = [n for n, u in ruins.items() if all(conferir_url_do_mp(u, API.REDIRECT_PROPRIO, API.clientes_conhecidos()).values())]
    R.ok(all(boa.values()) and not pegos, f"seco: a conferência da URL do MP aceita a certa e recusa as 7 erradas ({pegos or 'todas recusadas'})")
    R.ok(url_do_site_no_app(f"{API.VOLTA_SITE}?mp=conectar") and not url_do_site_no_app(url_do_mp_de_mentira())
         and not url_do_site_no_app("https://physiqcalc-staging.vercel.app.golpe.io/painel/configuracoes/recebimento?mp=conectar"),
         "seco: o conectar do APK só vale com a URL do SITE (?mp=conectar) — nunca a do MP")
    R.ok(chave_de_teste("TEST-" + "a1b2c3d4-" * 3) and not chave_de_teste("APP_USR-" + "a" * 20) and not chave_de_teste(None),
         "seco: a chave pública da conexão simulada só vale de TESTE (TEST-…; a de produção APP_USR- não)")
    R.ok(acao_de('{"acao": "prof_mp_confirmar", "conexao_id": "x"}') == "prof_mp_confirmar" and acao_de("lixo") is None
         and contar_acoes(["prof_recebimento", "prof_mp_confirmar", "prof_mp_conectar"], "prof_mp_confirmar", "prof_mp_conectar") == 2,
         "seco: a ação de cada pedido à pagamentos-aluno (o corpo { acao })")
    R.ok([pagina_da_lista(n) for n in (1, 20, 21, 40, 41)] == [1, 1, 2, 2, 3], "seco: a página da conta na lista do master (20 por página)")
    R.ok((reais(10), reais(1000)) == ("R$ 10,00", "R$ 1.000,00"), "seco: os reais da tela")
    g = GuardaW2()
    fn = f"{api}/functions/v1/pagamentos-aluno"
    pedidos = ((_Pedido("POST", fn, {"acao": "prof_recebimento"}), False), (_Pedido("POST", fn, {"acao": "aluno_status"}), False),
               (_Pedido("POST", fn, {"acao": "prof_recebimento_salvar"}), True), (_Pedido("POST", fn, {"acao": "prof_mp_conectar"}), True),
               (_Pedido("POST", fn, {"acao": "prof_mp_confirmar"}), True), (_Pedido("POST", fn, {"acao": "prof_mp_desconectar"}), True),
               (_Pedido("POST", fn, {"acao": "aluno_mp_pix"}), True), (_Pedido("OPTIONS", fn), False),
               (_Pedido("PATCH", f"{api}/rest/v1/contas?id=eq.x", {"recebimento_modo": "x"}), True),
               (_Pedido("GET", f"{api}/functions/v1/mp-conectar-retorno/public?state=x"), False))
    R.ok(all(g.escrita(p) is e for p, e in pedidos)
         and g.barradas_pagamentos == ["prof_recebimento_salvar", "prof_mp_conectar", "prof_mp_confirmar", "prof_mp_desconectar", "aluno_mp_pix"],
         "seco: a Guarda da produção deixa a prof_recebimento (leitura) e barra salvar, conectar, confirmar, desconectar, o Pix e a tabela")
    R.ok(painel_travado({"situacao": "ativa", "vence_em": "2026-01-01", "teste_ate": None}, "2026-10-12")
         and not painel_travado({"situacao": "ativa", "vence_em": "2026-12-01"}, "2026-10-12"), "seco: a trava do painel do profissional")
    est = {"paciente": "p1", "conta_id": "c1", "t0": "2026-10-12 03:00", "aluno_uid": "a1", "dono_uid": "d1", "assinaturas": [],
           "conta": {"modo": "pix_manual", "bloquear": False}, "vivas": [], "flags": {}, "jobs": {},
           "pacientes": {"plano_aluno_id": None, "plano_modalidade": None, "plano_valor_negociado": None, "mensalidade_valor": "10",
                         "mensalidade_desde": None, "cobranca_pausada": False}}
    cmds = API.comandos_do_desfazer(est)
    i_ass = next(i for i, c in enumerate(cmds) if c.startswith(f"delete from {S}.aluno_assinaturas"))
    i_modo = next(i for i, c in enumerate(cmds) if "recebimento_modo" in c)
    R.ok(i_ass < i_modo and any("recebimento_integracoes" in c for c in cmds) and any("mp_conexoes" in c for c in cmds),
         "seco: o desfazer (o do api.py) tira as automáticas da rodada ANTES do modo e apaga a integração e as conexões da rodada")


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


def interceptacao_no_edge(R, nav, base: str) -> None:
    """--seco: a interceptação de verdade (a mesma rota da Tela) numa página de mentira do build servido: o botão faz o que o Conectar faz
    (window.location.assign na autorização do MP) → a navegação é abortada, a URL fica guardada e a aba continua onde estava."""
    ctx = nav.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    urls: list[str] = []
    pagina = ("<!doctype html><meta charset=utf-8><body><button data-ir-ao-mp>Conectar</button><script>document.querySelector('button')"
              ".addEventListener('click', () => window.location.assign(" + json.dumps(url_do_mp_de_mentira()) + "));</script></body>")
    try:
        ctx.route(base + "/__w2_mp", lambda route, _req=None: route.fulfill(status=200, content_type="text/html; charset=utf-8", body=pagina))

        def interceptar(route, _req=None) -> None:
            urls.append(route.request.url)
            route.abort("aborted")

        ctx.route(PAGINA_DO_MP, interceptar)
        pg = ctx.new_page()
        pg.goto(base + "/__w2_mp", wait_until="load", timeout=60_000)
        pg.click("[data-ir-ao-mp]")
        t0 = time.time()
        while time.time() - t0 < 10 and not urls:
            pg.wait_for_timeout(200)
        pg.wait_for_timeout(800)
        ficou = urlparse(pg.url).path == "/__w2_mp" and pg.locator("[data-ir-ao-mp]").count() == 1
    except Exception as e:  # noqa: BLE001
        R.ok(False, f"seco: a página da interceptação não abriu ({type(e).__name__}: {str(e)[:160]})")
        return
    finally:
        ctx.close()
    c = conferir_url_do_mp(urls[0] if urls else None, API.REDIRECT_PROPRIO, API.clientes_conhecidos())
    R.ok(len(urls) == 1 and all(c.values()) and ficou,
         f"seco: no Edge, a ida à autorização do MP é interceptada e abortada — a URL guardada e conferida, a aba continua no app "
         f"({len(urls)} interceptada(s) · ficou {ficou})")


def botoes_no_edge(R, nav, base: str) -> None:
    """--seco: a checagem do botão dentro do cartão (JS_BOTOES_FORA) com o CSS do BUILD SERVIDO, a 390 × 844, numa página de mentira com
    o bloco do MP da conta na mesma largura (o px-4 do painel, o cartão p-5 e a caixa px-3.5): o botão nowrap de rótulo longo passa da
    caixa e é pego; com as classes do BOTAO_LONGO do Recebimento.tsx, o "Conectar com o Mercado Pago", o "Conectar de novo" e o
    "Desconectar" ficam dentro, com pelo menos 44 px de altura; o rótulo que passa da borda do próprio botão (w-full) também é pego."""
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
    longo = "Conectar com o Mercado Pago da sua conta agora mesmo (abre a autorização)"
    botoes = (("data-antes", "self-start", longo), ("data-conectar", m.group(1), CONECTAR), ("data-reconectar", m.group(1), CONECTAR_DE_NOVO),
              ("data-desconectar", m.group(1), "Desconectar"), ("data-largo", "w-full", longo))
    pagina = ("<!doctype html><html lang='pt-BR'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'>"
              + "".join(f"<link rel='stylesheet' href='{x}'>" for x in estilos)
              + "</head><body><div id='raiz' class='px-4 pt-4'><div data-cartao class='pq-cartao p-5'>"
              + "<div class='flex flex-col gap-2.5 rounded-2xl border border-linha bg-superficie px-3.5 py-3'><div class='flex flex-wrap gap-2'>"
              + "".join(f"<button type='button' class='pq-botao pq-botao-w {c}' {a}>{icone}{t}</button>" for a, c, t in botoes)
              + "</div></div></div></div></body></html>")
    ctx = nav.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    try:
        ctx.route(base + "/__w2_botoes", lambda route, _req=None: route.fulfill(status=200, content_type="text/html; charset=utf-8", body=pagina))
        pg = ctx.new_page()
        pg.goto(base + "/__w2_botoes", wait_until="load", timeout=60_000)
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
         f"seco: a 390, com o CSS do build ({len(estilos)} folha(s)), o botão nowrap que passa da caixa e o rótulo que passa do botão são pegos; "
         f"os 3 do bloco do MP com o BOTAO_LONGO ficam dentro ({'; '.join(fora) or 'nada pego'})")
    R.ok(all(alturas.get(a, 0) >= 44 for a in ("data-conectar", "data-reconectar", "data-desconectar")),
         f"seco: os botões do bloco do MP com pelo menos 44 px de altura (o toque) (alturas {alturas})")


def app_no_edge(R, nav, base: str) -> None:
    """--seco --loja: o build da loja com o Capacitor em modo app (o 7c): a /entrar abre sem erro de página, o Capacitor diz que é o app
    (isNativePlatform, android) e o SITE aberto por cima (o window.open da versão web do Browser.open) cai na página vazia — com a API e o
    MP barrados."""
    ctx = nav.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    erros: list[str] = []
    abertos: list[str] = []
    try:
        ctx.add_init_script(CAPACITOR_APP)
        ctx.route(API_E_FORA, lambda route, _req=None: route.abort())

        def site(route, _req=None) -> None:
            abertos.append(route.request.url)
            route.fulfill(status=200, content_type="text/html; charset=utf-8", body="<!doctype html><p>site (E2E)</p>")

        ctx.route(SITES_DO_PHYSIQ, site)
        ctx.route(GITHUB, lambda route, _req=None: route.fulfill(status=404, content_type="application/json", body="{}"))
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: erros.append(str(e)[:160]))
        pg.goto(base + "/entrar", wait_until="domcontentloaded", timeout=60_000)
        t0 = time.time()
        while time.time() - t0 < 45 and not pg.locator("[data-entrar-google], [data-entrada-staging]").count():
            pg.wait_for_timeout(300)
        nativo = pg.evaluate("() => [!!(window.Capacitor && window.Capacitor.isNativePlatform()), window.Capacitor && window.Capacitor.getPlatform()]")
        with ctx.expect_page(timeout=15_000) as nova:
            pg.evaluate(f"() => window.open({json.dumps(API.VOLTA_SITE + '?mp=conectar')}, '_blank')")
        nova.value.wait_for_load_state("domcontentloaded", timeout=15_000)
    except Exception as e:  # noqa: BLE001
        R.ok(False, f"seco: o build da loja em modo app não abriu ({type(e).__name__}: {str(e)[:160]})")
        return
    finally:
        ctx.close()
    graves = [e for e in erros if not re.search(r"not implemented|ResizeObserver", e, re.I)]
    R.ok(nativo == [True, "android"] and not graves and len(abertos) == 1 and url_do_site_no_app(abertos[0]),
         f"seco: o build da loja com o Capacitor em modo app — isNativePlatform {nativo}, erros de página {graves[:2]}, o site por cima "
         f"na página vazia ({len(abertos)})")


def seco(R, a, base: str, producao: bool) -> int:
    R.linha(f"── W2 telas --seco ({base}{' · build da loja' if a.loja else ''}): nada vai ao banco nem à API")
    permitidos = {"localhost", "127.0.0.1", "::1"} | ({host(base)} if a.base != "local" else set())
    barrados = travar_rede(permitidos)
    autoteste(R)
    roteiro_no_codigo(R)
    contas = (DONO_PROD, ALUNO_PROD) if producao else ((DONO, ALUNO) if a.loja else (DONO, ALUNO, MASTER))
    for conta in contas:
        email, senha = W6.B5.CONTAS.get(conta, ("", ""))
        teste = bool(email) and (B.C.eh_email_de_teste(email) or W6.B5.email_de_teste(email)) and "revisao" not in email.lower()
        R.ok(teste and bool(senha), f"seco: a conta de TESTE {conta} com e-mail de teste e a senha no arquivo (sem login)")
    if not producao:
        arq = Path.home() / ".physiq-mp-public-test"
        R.ok(arq.exists() and chave_de_teste(arq.read_text(encoding="utf-8").strip()),
             "seco: a chave pública de TESTE do MP em ~ no formato TEST-… (a conexão simulada a grava — sem ela o passo 6 não tem cartão; o valor "
             "não aparece)")
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
            interceptacao_no_edge(R, nav, base)
            botoes_no_edge(R, nav, base)
            if a.loja:
                app_no_edge(R, nav, base)
        finally:
            nav.close()
    R.ok(entrou and faixa == (not producao),
         f"seco: o Edge ({a.canal}) abre a /entrar do build {'com' if faixa else 'sem'} a faixa 'Ambiente de teste', com a API e o MP "
         f"barrados no navegador ({len(barrados_nav)} pedido(s) barrado(s): {sorted(set(barrados_nav))})")
    R.ok(not barrados, f"seco: nenhum pedido deste processo saiu para o banco ou a API ({sorted(set(barrados))})")
    return R.fim()


# ───────────────────────── main ─────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser(description="Physiq W2 — E2E de tela do Mercado Pago do personal (Recebimento, app do aluno no site e na loja, master)")
    ap.add_argument("--base", required=True, choices=("local", "staging", "prod"),
                    help="local (o vite preview do build de staging em http://localhost:<porta>) | staging | prod (SÓ LEITURA)")
    ap.add_argument("--loja", action="store_true", help="o localhost está servindo o build da loja (VITE_DISTRIBUICAO=play): os passos 5 a 7 e o 7c")
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
    B.SAIDA = SCRATCH / "w2"
    R = B.Rodada(f"w2_telas_{prefixo}{'_loja' if a.loja else ''}{'_seco' if a.seco else ''}")
    API.p = PlacarPeloR(R)
    CTX.update(base=base, loja=a.loja, pasta=SCRATCH / "prints" / "w2" / prefixo / ("loja" if a.loja else ""))
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
    CTX["logins"] = B.Logins(f"w2/telas.py {prefixo}")
    api_pend, telas_pend = _ler_json(API.ESTADO_ARQ), _ler_json(ESTADO_ARQ)
    if api_pend or telas_pend:
        R.linha(f"   a rodada anterior (do api.py ou desta) não terminou ({API.ESTADO_ARQ.name} · {ESTADO_ARQ.name}): desfazendo antes")
        desfazer(R, api_pend, telas_pend)
        if API.ESTADO_ARQ.exists() or ESTADO_ARQ.exists():
            return R.fim()
    if a.limpar:
        if not (api_pend or telas_pend):
            r = API.um(f"""select (select count(*) from {S}.planos_aluno where nome like {API.lit(API.PREFIXO + ' %')})::int as planos,
                                  (select count(*) from {S}.aluno_assinaturas where mp_preapproval_id like 'sim-w2tela-%'
                                     and status in ('authorized', 'pending', 'paused'))::int as automaticas""")
            R.ok(not any(r.values()), f"nenhuma rodada pendente e nada '{API.PREFIXO} …' / automática 'sim-w2tela-…' viva sobrando no {S} ({r})")
        return R.fim()
    if sinal and not sinal.exists():
        R.linha(f"   sem o sinal {sinal} (a trava do banco do staging): a rodada não começa")
        return 3
    passos = PASSOS_LOJA if a.loja else PASSOS
    R.linha(f"── W2 telas ({prefixo}{' · build da loja' if a.loja else ''} · {base}): {', '.join(n for n, _ in passos)} · prints em {CTX['pasta']}")
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    with sync_playwright() as pw:
        nav = pw.chromium.launch(channel=a.canal, args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"])
        CTX["nav"] = nav
        try:
            if B.conferir_build(R, nav, base, producao) and conferir_canal(R, base, a.loja) and funcoes_da_w2(R) and preparar(R):
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
    R.linha(f"\nidas à autorização do MP interceptadas: {len(CTX['urls_mp'])} (o site: só a do passo 2; a loja: nenhuma)")
    R.linha(f"\nprints ({len(CTX['prints'])}):\n" + "\n".join(f"   {x}" for x in CTX["prints"]))
    r = R.fim()
    if CTX.get("interrompida"):
        R.linha(f"   rodada INTERROMPIDA antes de '{CTX['interrompida']}' (o sinal sumiu): a massa foi desfeita — rode de novo com o sinal")
        return 3
    return r


if __name__ == "__main__":
    raise SystemExit(main())
