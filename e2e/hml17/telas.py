#!/usr/bin/env python3
"""Physiq hml-17 (H-38 · H-39 · H-53, 10/10/2026) — E2E de TELA com o Edge: o plano alimentar igual para os 3 perfis, os avisos no
lugar do dado errado com a API caindo e as novas tentativas (menos pedidos, aviso mais cedo, sem pedido em dobro).

Contas de TESTE (staging): w5p-nutri, w5p-personal (dono + personal), w5p-aluna (a aluna dos 2, plano de 22 itens), w7b-sozinho (aluno
do app sem profissional). A sessão entra ANTES do 1º documento (add_init_script — _base.Tela). A queda da API: route.abort em
api(-principal).physiqcalc.com.br/(rest|functions|storage); o /auth/ passa. "Fresco" = a API já fora na 1ª abertura (nada guardado);
"depois" = abriu normal antes (a situação e o cache no aparelho) e a página é aberta de novo com a API fora.

  H38-T1  nutri e personal em /painel/alunos/<aluna>/dieta: data-plano-kcal = 1.894 nos 2; cada refeição aberta sem item sem nome nem
          "Alimento removido"; o plano veio da rpc/planos_do_aluno e nenhum GET de planos_alimentares com o embed de alimentos; o personal
          "~100 % da meta" (não "abaixo"); o card Dieta do Resumo (personal) e a aluna em /dieta com o mesmo 1.894; o PDF que o
          personal baixa tem os nomes dos 22 itens e nenhum "Alimento removido"
  H39-P1  aluna /perfil com a API caindo (fresco e depois): o aviso em ≤ 6 s, sem o campo do código, Agenda "—"; a API volta + Tentar →
          os 2 profissionais e a data
  H39-P2  aluna / fresco com a API caindo: a faixa "não deu para carregar a sua conta" e o peso "erro" (nunca "vazio"); volta + Tentar
          (a faixa) → o peso com os dados
  H39-P3  controle: w7b-sozinho /perfil normal → o campo do código continua
  H39-P4  personal: Alunos › Pendentes com a API caindo → o aviso; a busca "ab" (Ctrl K) → 3 linhas "Não deu para buscar…"; volta →
          resultados
  H39-P5  visitante /c/<código de teste> com a API caindo → "Não deu para abrir o cadastro agora" (e um código que não existe, com a API
          no ar → "Link de cadastro não encontrado"); dono Configurações › Recebimento com a API caindo → aviso e contador "—"; aluna
          /perfil/agenda com a API caindo → aviso, sem "Nenhuma consulta marcada" e sem Desistir
  H53-N1  personal /painel: alunos_da_conta (o total) 1×, whatsapp_resumo 1× (com a conta), pos-login 1×
  H53-N2  personal /painel com a API caindo (depois): os avisos todos em ≤ 6 s (print aos 6 s), nenhum pedido (o mesmo método, alvo,
          query e corpo) mais de 4 vezes em 40 s — 2 consultas diferentes na mesma tabela contam separado (§1.4: "não são repetidos");
          a trocar-token fica fora (a regra de 2 tentativas da W5, §1.5 item 3) — e no máximo 70 pedidos (era 129)
  H53-N3  aluna /evolucao e nutri …/dieta com a API caindo: aviso em ≤ 6 s
  Master  (o diálogo "plano" de conta legada com a tabela caindo): o staging não tem conta legada de teste → fica o Vitest
          (src/master/contas/AcaoContaDialog.test.tsx)

Bases: --base local (o vite preview do build de STAGING em http://localhost:8080 — a porta que as funções aceitam; outra: --base
http://localhost:5173) · staging (https://physiqcalc-staging.vercel.app) · prod (https://physiqcalc.com.br, SÓ LEITURA — §5 da spec: as
contas de teste de lá — teste@teste.com (aluno), w7b-prod (aluno do app), admin.teste (personal + dono, conta só de Treino) —, a Guarda
no navegador (_base.Guarda: nenhuma escrita sai), as contagens das linhas dessas contas iguais antes e depois e os nomes das listas
borrados nos prints; casos P1 (fresco), P2, P3, P4 (Pendentes e a busca: alunos e treinos), P5 (o /c/ do admin com a API caindo — o
pedido nem sai do navegador; o normal NÃO roda na produção: a função alunos conta o cadastro_info no limite por IP — e o Recebimento)
e N2; o H-38 na produção é por API e SQL: e2e/hml17/api.py --schema public). Antes de qualquer conta, a guarda do build (a faixa
"Ambiente de teste" no staging e no local; sem ela na produção).
O aceite dos textos (hml-12) e o aviso "o Physiq mudou" fecham como nos E2E de sempre (fechar_avisos; o aceite só cresce, staging).
Prints: ~/projetos/physiqcalc-scratch/hml/hml17/prints/<base>/<base>_<caso>_<largura>.png. Saída: hml/hml17/agente/telas_<base>.txt
(só contagens, status e as kcal das contas de TESTE). Logout local das sessões que o teste abriu no fim.
Uso: python3 e2e/hml17/telas.py --base local --canal msedge [--casos T1,P1,P2,P3,P4,P5,N1,N2,N3]
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
import unicodedata
import urllib.parse
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import _base as B  # noqa: E402

C, B5 = B.C, B.B5
BASES = {"local": "http://localhost:8080", "staging": "https://physiqcalc-staging.vercel.app", "prod": "https://physiqcalc.com.br"}
HOSTS_DE_PRODUCAO = {"physiqcalc.com.br", "www.physiqcalc.com.br"}
CASOS = ("T1", "P1", "P2", "P3", "P4", "P5", "N1", "N2", "N3")
KCAL = 1894
LIMITE_AVISO_S = 6.0
# Abertura a frio fora do local (P1 "fresco"): o pacote do app vem do CDN antes da 1ª consulta. Medido no staging em 10/10:
# "fresco" 6,0–6,4 s × "depois" (app já aberto) 4,7–4,8 s — a diferença é a carga, não a espera do aviso.
FOLGA_CARGA_FRIA_S = 2.0
JANELA_S = 40.0
MAX_POR_ALVO = 4
MAX_PEDIDOS = 70
FORA_DO_LIMITE = {"fn:trocar-token"}  # a regra de 2 tentativas da W5 (sem_treino.py) — §1.5 item 3 da spec, ⚪ fora daqui
CASOS_PROD = ("P1", "P2", "P3", "P4", "P5", "N2")
# as contas de TESTE de cada base (chaves das CONTAS da W5); profissionais = quantos o Perfil da aluna mostra; busca = os grupos da
# busca global da conta do dono (a do admin de produção é só de Treino: sem Alimentos)
CONTAS_DA_BASE = {
    "staging": {"aluna": "w5p-aluna", "app": "w7b-sozinho", "dono": "w5p-personal", "profissionais": 2, "busca": ["alimentos", "alunos", "treinos"]},
    "prod": {"aluna": "aluno-calc", "app": "w7b-prod", "dono": "master", "profissionais": 1, "busca": ["alunos", "treinos"]},
}
B5.CONTAS.setdefault("w7b-prod", ("w7b.prod.teste.claude@physiqnutri.app", B5.senha_de("w7b-prod")))
BORRAR = "[data-lista] [data-item], [data-lista] [data-item] *"


class Rodada:
    def __init__(self, o, base: str, prefixo: str, producao: bool = False) -> None:
        self.o, self.base, self.prefixo, self.producao = o, base, prefixo, producao
        self.L = B.Logins()
        self.prints = B.PRINTS_RAIZ / prefixo
        self.aluna = ""
        self.provas: list[str] = []
        self.contas = CONTAS_DA_BASE["prod" if producao else "staging"]
        self.guarda = B.Guarda() if producao else None

    def tela(self, nav, nome: str, desktop: bool) -> B.Tela:
        return B.Tela(nav, self.base, self.prefixo, nome, desktop=desktop, guarda=self.guarda)

    def print(self, t: B.Tela, caso: str, borrar: str | None = None) -> str:
        if self.producao and borrar is None:
            borrar = BORRAR  # produção: as listas com nomes de alunos saem borradas
        caminho = t.print(self.prints, f"{self.prefixo}_{caso}", borrar)
        self.provas.append(caminho)
        self.o.linha(f"   print: {caminho}")
        return caminho


# ───────────────────────── utilidades ─────────────────────────
def sem_acento(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn").lower()


def num(v: str | None) -> int | None:
    try:
        return int(str(v))
    except (TypeError, ValueError):
        return None


def corpo(p: dict) -> dict:
    try:
        d = json.loads(p.get("corpo") or "{}")
        return d if isinstance(d, dict) else {}
    except json.JSONDecodeError:
        return {}


def esperar_quieto(t: B.Tela, minimo: float = 8, quieto: float = 4, maximo: float = 45) -> None:
    """Espera a rede ficar quieta (nenhum pedido novo por `quieto` s, depois de `minimo` s)."""
    inicio = time.time()
    ultimo, desde = len(t.pedidos), time.time()
    while time.time() - inicio < maximo:
        t.pg.wait_for_timeout(500)
        n = len(t.pedidos)
        if n != ultimo:
            ultimo, desde = n, time.time()
        elif time.time() - desde >= quieto and time.time() - inicio >= minimo:
            return


def entrar_normal(R: Rodada, nav, conta: str, rota: str, desktop: bool, nome: str) -> B.Tela:
    t = R.tela(nav, nome, desktop)
    t.entrar(R.L, conta, rota)
    t.caso.fechar_avisos()
    return t


def primeiro_aviso(t: B.Tela, seletor: str, timeout: float) -> float | None:
    """Segundos desde a abertura até o seletor aparecer (None = não apareceu no tempo)."""
    if t.esperar(lambda: t.tem(seletor), timeout):
        return round(time.time() - t.t0, 1)
    return None


# ───────────────────────── antes de tudo: o build ─────────────────────────
def conferir_build(o, nav, R: Rodada) -> bool:
    t = R.tela(nav, "build", False)
    try:
        t.ir("/entrar")
        abriu = t.esperar(lambda: t.tem("[data-entrar-google]") or t.tem("[data-entrada-staging]"), 60)
        if R.producao:
            return o.ok(abriu and not t.tem("[data-entrada-staging]"), "o build é o de produção (a /entrar sem a faixa 'Ambiente de teste')")
        tem = t.esperar(lambda: t.tem("[data-entrada-staging]"), 30)
        return o.ok(abriu and tem, "o build é o de staging (a faixa 'Ambiente de teste' na /entrar) — senão nada roda com conta")
    finally:
        t.fim()


# ───────────────────────── H-38 ─────────────────────────
def abrir_refeicoes(o, t: B.Tela, rotulo: str) -> tuple[int, int, int]:
    """Abre cada refeição do dia (1 por vez): (refeições, itens sem nome, "Alimento removido")."""
    sem_nome = removidos = 0
    botoes = t.pg.locator("[data-refeicao-abrir]")
    n = botoes.count()
    for i in range(n):
        botoes.nth(i).click()
        t.pg.wait_for_timeout(450)
        aberta = t.pg.locator("[data-refeicao][data-aberta]")
        if aberta.count():
            sem_nome += aberta.locator('[data-item][data-item-nome=""]').count()
            removidos += len(re.findall("Alimento removido", aberta.first.inner_text()))
    o.linha(f"   [{rotulo}] {n} refeição(ões) do dia abertas")
    return n, sem_nome, removidos


def caso_t1_painel(o, nav, R: Rodada, conta: str, desktop: bool) -> int | None:
    rotulo = f"T1 {conta} {'1280' if desktop else '390'}"
    t = entrar_normal(R, nav, conta, f"/painel/alunos/{R.aluna}/dieta", desktop, f"t1-{conta}")
    try:
        ok = t.esperar(lambda: t.tem("[data-plano-kcal]"), 45)
        kcal = num((t.attr("[data-plano-kcal]", "data-plano-kcal") or [None])[0])
        o.ok(ok and kcal == KCAL, f"{rotulo}: data-plano-kcal = {kcal} (esperado {KCAL}; antes o personal via 1.540)")
        n, sem_nome, removidos = abrir_refeicoes(o, t, rotulo)
        o.ok(n >= 1 and sem_nome == 0 and removidos == 0, f"{rotulo}: {sem_nome} item(ns) sem nome e {removidos} \"Alimento removido\" nas {n} refeições")
        rpc = t.contar("rpc", "planos_do_aluno")
        embed = [p for p in t.pedidos if p["tipo"] == "tab" and p["nome"] == "planos_alimentares" and p["metodo"] == "GET"
                 and "alimentos" in urllib.parse.unquote(p["url"])]
        o.ok(rpc >= 1 and not embed, f"{rotulo}: o plano veio da rpc/planos_do_aluno ({rpc}×) e nenhum GET planos_alimentares com alimentos ({len(embed)})")
        if conta == "w5p-personal":
            texto = t.texto("[data-editor-dieta]")
            m = re.search(r"(\d+)\s*% da meta", texto)
            pct = int(m.group(1)) if m else None
            o.ok(pct is not None and 95 <= pct <= 105 and "abaixo da meta" not in texto,
                 f"{rotulo}: \"{pct} % da meta\" e não \"abaixo da meta\" (antes: 81 % · abaixo da meta)")
        # o print com o café aberto (o topo do editor: o total, a meta e o café); no personal, outro com o lanche pré-treino aberto
        # (2 dos 3 alimentos da nutri que ele via como "Alimento removido" estão nele; o editor abre 1 refeição por vez)
        botoes = t.pg.locator("[data-refeicao-abrir]")
        if botoes.count():
            botoes.first.click()
            t.pg.wait_for_timeout(500)
        t.pg.evaluate("() => document.querySelector('[data-editor-dieta]')?.scrollIntoView({ block: 'start' })")
        R.print(t, "h38_nutri" if conta == "w5p-nutri" else "h38_personal")
        if conta == "w5p-personal":
            lanche = t.pg.locator('[data-refeicao][data-refeicao-nome*="pré-treino"] [data-refeicao-abrir]')
            if lanche.count():
                lanche.first.click()
                t.pg.wait_for_timeout(500)
                t.pg.evaluate("() => document.querySelector('[data-refeicao][data-aberta]')?.scrollIntoView({ block: 'center' })")
                aberta = t.pg.locator("[data-refeicao][data-aberta]")
                o.ok(aberta.count() == 1 and aberta.locator('[data-item][data-item-nome=""]').count() == 0,
                     f"{rotulo}: o lanche pré-treino aberto com os {aberta.locator('[data-item]').count()} itens com nome "
                     f"({aberta.first.get_attribute('data-refeicao-kcal') if aberta.count() else '?'} kcal; antes 98)")
                R.print(t, "h38_personal_lanche")
        return kcal
    finally:
        t.fim()


def nomes_do_plano(R: Rodada) -> list[str]:
    st, r = B.rpc(R.L.token("w5p-nutri"), "planos_do_aluno", {"p_aluno": R.aluna})
    plano = (r or [{}])[0] if st == 200 and isinstance(r, list) else {}
    return [i["alimento"]["nome"] for i in B.itens_do_plano(plano) if i.get("alimento")]


def caso_t1_pdf(o, nav, R: Rodada) -> None:
    t = entrar_normal(R, nav, "w5p-personal", f"/painel/alunos/{R.aluna}/dieta", True, "t1-pdf")
    try:
        t.esperar(lambda: t.tem("[data-btn-pdf-plano]"), 45)
        destino = B.SCRATCH / "agente" / "downloads" / f"{R.prefixo}_h38_personal.pdf"
        destino.parent.mkdir(parents=True, exist_ok=True)
        with t.pg.expect_download(timeout=60_000) as d:
            t.clicar("[data-btn-pdf-plano]")
        d.value.save_as(str(destino))
        destino.chmod(0o600)
        texto = subprocess.run(["pdftotext", "-layout", str(destino), "-"], capture_output=True, text=True, timeout=60).stdout
        plano = re.sub(r"\s+", " ", sem_acento(texto))
        nomes = nomes_do_plano(R)
        faltam = [n for n in nomes if sem_acento(n).split(",")[0].strip()[:14] not in plano]
        o.ok(len(nomes) == 22 and not faltam and "alimento removido" not in plano,
             f"T1 PDF do personal: {len(nomes) - len(faltam)}/{len(nomes)} nomes dos itens no texto do PDF, "
             f"{'nenhum' if 'alimento removido' not in plano else 'COM'} \"Alimento removido\"")
    finally:
        t.fim()


def caso_t1_resumo(o, nav, R: Rodada) -> None:
    t = entrar_normal(R, nav, "w5p-personal", f"/painel/alunos/{R.aluna}", True, "t1-resumo")
    try:
        ok = t.esperar(lambda: t.tem("[data-card-dieta-kcal]"), 45)
        kcal = num((t.attr("[data-card-dieta-kcal]", "data-card-dieta-kcal") or [None])[0])
        o.ok(ok and kcal == KCAL, f"T1 Resumo (personal): o card Dieta com {kcal} KCAL/DIA (esperado {KCAL})")
        esperar_quieto(t, minimo=3, quieto=2, maximo=25)  # os outros cards do Resumo terminam de carregar (o print)
        t.pg.locator("[data-card-dieta-kcal]").first.scroll_into_view_if_needed()
        R.print(t, "h38_resumo")
    finally:
        t.fim()


def caso_t1_aluna(o, nav, R: Rodada) -> None:
    t = entrar_normal(R, nav, "w5p-aluna", "/dieta", False, "t1-aluna")
    try:
        ok = t.esperar(lambda: t.tem("[data-kcal-do-dia]"), 45)
        kcal = num((t.attr("[data-kcal-do-dia]", "data-kcal-do-dia") or [None])[0])
        o.ok(ok and kcal == KCAL, f"T1 aluna /dieta: data-kcal-do-dia = {kcal} (o mesmo dos 2 do painel)")
        R.print(t, "h38_aluna")
    finally:
        t.fim()


# ───────────────────────── H-39 (aluna) ─────────────────────────
def caso_p1(o, nav, R: Rodada, forma: str) -> None:
    """Perfil com a API caindo: forma "fresco" (a API já fora na 1ª abertura) ou "depois" (abriu normal antes)."""
    t = R.tela(nav, f"p1-{forma}", False)
    aluna, n_prof = R.contas["aluna"], R.contas["profissionais"]
    try:
        if forma == "depois":
            t.entrar(R.L, aluna, "/perfil")
            t.caso.fechar_avisos()
            t.esperar(lambda: t.n("[data-profissional]") >= n_prof, 40)
            t.cair_api()
            t.ir("/perfil")
        else:
            t.cair_api()
            t.entrar(R.L, aluna, "/perfil")
        s = primeiro_aviso(t, "[data-perfil-erro]", 30)
        limite = LIMITE_AVISO_S + (FOLGA_CARGA_FRIA_S if forma == "fresco" and R.prefixo != "local" else 0)
        o.ok(s is not None and s <= limite, f"P1 ({forma}) /perfil com a API caindo: o aviso em {s} s (≤ {limite:g} s)")
        t.pg.wait_for_timeout(1500)
        agenda = t.texto("[data-perfil-agenda-valor]")
        codigo = t.n("[data-perfil-codigo]")
        o.ok(codigo == 0 and agenda == "—" and "ainda não está com um profissional" not in t.texto(),
             f"P1 ({forma}): sem o campo do código ({codigo}), Agenda \"{agenda}\", nunca \"Você ainda não está com um profissional\"")
        if forma == "fresco":
            R.print(t, "h39_perfil_falha")
        t.voltar_api()
        t.clicar("[data-perfil-erro-tentar]")
        voltou = t.esperar(lambda: t.n("[data-profissional]") >= n_prof and t.texto("[data-perfil-agenda-valor]") not in ("—", "…", ""), 30)
        o.ok(voltou, f"P1 ({forma}): a API voltou + Tentar de novo → {t.n('[data-profissional]')} profissional(is) (≥ {n_prof}) e a Agenda "
                     f"\"{t.texto('[data-perfil-agenda-valor]')}\"")
        if forma == "fresco":
            R.print(t, "h39_perfil_normal" if R.producao else "h39_perfil_volta")
    finally:
        t.fim()


def caso_p2(o, nav, R: Rodada) -> None:
    t = R.tela(nav, "p2-inicio", False)
    try:
        t.cair_api()
        t.entrar(R.L, R.contas["aluna"], "/")
        faixa = primeiro_aviso(t, "[data-faixa-conta-erro]", 30)
        o.ok(faixa is not None, f"P2 / fresco com a API caindo: a faixa \"Não deu para carregar a sua conta\" ({faixa} s)")
        peso = t.esperar(lambda: (t.attr("[data-card-peso]", "data-card-peso") or [""])[0] in ("erro", "sem-internet", "vazio"), 30)
        estado = (t.attr("[data-card-peso]", "data-card-peso") or [""])[0]
        t.pg.wait_for_timeout(2500)
        estado2 = (t.attr("[data-card-peso]", "data-card-peso") or [""])[0]
        o.ok(peso and estado == "erro" and estado2 == "erro", f"P2: o card Seu peso = \"{estado}\" → \"{estado2}\" (erro, NUNCA \"vazio\")")
        R.print(t, "h39_inicio_falha")
        t.voltar_api()
        t.clicar("[data-faixa-conta-tentar]")
        # na produção a conta de teste pode não ter pesagem: lá "vazio" (sem falha nenhuma) também vale; no staging a aluna tem 8
        validos = ("dados", "vazio") if R.producao else ("dados",)
        voltou = t.esperar(lambda: (t.attr("[data-card-peso]", "data-card-peso") or [""])[0] in validos, 60)
        o.ok(voltou and not t.tem("[data-faixa-conta-erro]"),
             f"P2: a API voltou + Tentar (a faixa) → o peso \"{(t.attr('[data-card-peso]', 'data-card-peso') or ['?'])[0]}\" "
             f"({(t.attr('[data-card-peso]', 'data-peso-valor') or ['—'])[0]} kg) e sem a faixa")
        if not R.producao:
            R.print(t, "h39_inicio_volta")
    finally:
        t.fim()


def caso_p3(o, nav, R: Rodada) -> None:
    conta = R.contas["app"]
    t = entrar_normal(R, nav, conta, "/perfil", False, "p3-controle")
    try:
        ok = t.esperar(lambda: t.tem("[data-perfil-codigo]"), 40)
        o.ok(ok and not t.tem("[data-perfil-erro]"), f"P3 controle: {conta} (sem profissional) /perfil normal → o campo do código continua, sem aviso")
        R.print(t, "h39_controle")
    finally:
        t.fim()


# ───────────────────────── H-39 (painel) ─────────────────────────
def esperar_sessao_treino(t: B.Tela, timeout: float = 40) -> bool:
    return t.esperar(lambda: t.pg.evaluate("() => Object.keys(localStorage).some((k) => /^sb-.*-auth-token$/.test(k))"), timeout)


def caso_p4(o, nav, R: Rodada) -> None:
    t = entrar_normal(R, nav, R.contas["dono"], "/painel/alunos", True, "p4-pendentes")
    try:
        t.esperar(lambda: t.tem("[data-abrir-pendentes]"), 45)
        esperar_sessao_treino(t)
        t.cair_api()
        t.zerar_pedidos()
        t.clicar("[data-abrir-pendentes]")
        s = primeiro_aviso(t, "[data-pendentes-erro]", 30)
        o.ok(s is not None and s <= LIMITE_AVISO_S and "Nada esperando" not in t.texto(),
             f"P4 Alunos › Pendentes com a API caindo: o aviso em {s} s, sem \"Nada esperando\"")
        R.print(t, "h39_pendentes")
        t.pg.keyboard.press("Escape")
        t.pg.wait_for_timeout(600)
        # a busca global (Ctrl K) "ab"
        t.pg.keyboard.press("Control+k")
        t.pg.wait_for_timeout(800)
        t.pg.keyboard.type("ab", delay=120)
        esperados = R.contas["busca"]
        tres = t.esperar(lambda: t.n("[data-busca-erro]") >= len(esperados), 30)
        quais = sorted(x or "" for x in t.attr("[data-busca-erro]", "data-busca-erro"))
        o.ok(tres and quais == esperados, f"P4 a busca \"ab\" com a API caindo: {len(quais)} linhas de erro ({quais}; esperado {esperados})")
        R.print(t, "h39_busca")
        t.voltar_api()
        for qual in ("alunos", "treinos", "alimentos"):
            loc = t.pg.locator(f'[data-busca-erro="{qual}"]')
            if loc.count():
                loc.first.click()
                t.pg.wait_for_timeout(400)
        voltou = t.esperar(lambda: t.n("[data-busca-erro]") == 0 and t.n("[cmdk-item]") > 1, 30)
        o.ok(voltou, f"P4 a API voltou + tocar nas linhas → os resultados ({t.n('[cmdk-item]')} itens na paleta, {t.n('[data-busca-erro]')} erro)")
    finally:
        t.fim()


def codigo_de_teste(conta: str) -> str | None:
    r = B.ler(f"select m.codigo_convite as c from {B.schema()}.conta_membros m join auth.users u on u.id = m.user_id "
              f"where lower(u.email) = {B.txt(B.CONTAS[conta])} and m.status = 'ativo' and m.codigo_convite is not null limit 1")
    return r[0]["c"] if r else None


def caso_p5(o, nav, R: Rodada) -> None:
    # visitante /c/<código> com a API caindo
    dono = R.contas["dono"]
    codigo = codigo_de_teste(dono)
    if not o.ok(bool(codigo), f"P5 o código de cadastro da conta de teste ({dono}) existe no {B.schema()}"):
        return
    t = R.tela(nav, "p5-cadastro", False)
    try:
        t.cair_api()
        t.ir(f"/c/{urllib.parse.quote(codigo)}")
        s = primeiro_aviso(t, "[data-cadastro-erro]", 30)
        o.ok(s is not None and "Não deu para abrir o cadastro agora" in t.texto() and "não vale mais" not in t.texto(),
             f"P5 /c/<código de teste> com a API caindo → \"Não deu para abrir o cadastro agora\" + Tentar ({s} s), nunca \"este link não vale mais\"")
        R.print(t, "h39_cadastro")
        if not R.producao:  # o cadastro_info conta no limite por IP (grava): na produção só o caso com a API caindo
            t.voltar_api()
            t.ir("/c/HML17-NAO-EXISTE-0000")
            achou = t.esperar(lambda: "Link de cadastro não encontrado" in t.texto(), 40)
            o.ok(achou and not t.tem("[data-cadastro-erro]"), "P5 controle (API no ar): um código que não existe → \"Link de cadastro não encontrado\" (o H-70 certo no caso certo)")
    finally:
        t.fim()
    # dono: Configurações › Recebimento com a API caindo
    t = entrar_normal(R, nav, dono, "/painel/configuracoes/recebimento", True, "p5-recebimento")
    try:
        t.esperar(lambda: t.tem("[data-recebimento-pendentes-contador]") or t.tem("[data-recebimento-sem-pendentes]"), 45)
        t.cair_api()
        t.ir("/painel/configuracoes/recebimento")
        s = primeiro_aviso(t, "[data-recebimento-pendentes-erro]", 30)
        contador = t.texto("[data-recebimento-pendentes-contador]")
        o.ok(s is not None and contador == "—" and "Nenhum comprovante aguardando" not in t.texto(),
             f"P5 Recebimento com a API caindo: o aviso ({s} s), o contador \"{contador}\", nunca \"Nenhum comprovante aguardando\"")
        t.pg.locator("[data-recebimento-pendentes-erro]").first.scroll_into_view_if_needed()
        R.print(t, "h39_recebimento")
    finally:
        t.fim()
    # aluna: /perfil/agenda com a API caindo (staging e local)
    if R.producao:
        return
    t = entrar_normal(R, nav, R.contas["aluna"], "/perfil/agenda", False, "p5-agenda")
    try:
        t.esperar(lambda: t.tem("[data-pagina-agenda]"), 45)
        t.cair_api()
        t.ir("/perfil/agenda")
        s = primeiro_aviso(t, '[data-pagina-agenda] [data-estado="erro"], [data-agenda-regras-erro]', 30)
        t.pg.wait_for_timeout(1500)
        desistir = t.n("[data-btn-desistir], [data-destaque-desistir]")
        o.ok(s is not None and s <= LIMITE_AVISO_S and "Nenhuma consulta marcada" not in t.texto() and desistir == 0,
             f"P5 /perfil/agenda com a API caindo: aviso em {s} s, sem \"Nenhuma consulta marcada\" e sem Desistir ({desistir})")
        R.print(t, "h39_agenda")
    finally:
        t.fim()


# ───────────────────────── H-53 ─────────────────────────
def caso_n1(o, nav, R: Rodada) -> None:
    t = R.tela(nav, "n1-repetidos", True)
    try:
        t.entrar(R.L, "w5p-personal", "/painel")
        esperar_quieto(t)
        totais = [p for p in t.pedidos if p["tipo"] == "rpc" and p["nome"] == "alunos_da_conta"
                  and corpo(p).get("p_limite") == 0 and corpo(p).get("p_offset") == 0 and not (corpo(p).get("p_filtros") or {}).get("q")]
        resumo = [p for p in t.pedidos if p["tipo"] == "rpc" and p["nome"] == "whatsapp_resumo"]
        pos = t.contar("fn", "pos-login")
        o.ok(len(totais) == 1, f"N1 /painel: alunos_da_conta (o total) {len(totais)}× (era 2× — o menu e o Dashboard)")
        o.ok(len(resumo) == 1 and all(corpo(p).get("p_conta") for p in resumo),
             f"N1 /painel: whatsapp_resumo {len(resumo)}× e com a conta (era 2× no 1º acesso: p_conta null e depois a conta)")
        o.ok(pos == 1, f"N1 /painel: pos-login {pos}× (a sessão antes do 1º documento)")
        C.json_arquivo(B.SCRATCH / "agente" / f"pedidos_{R.prefixo}_n1.json", t.por_alvo())
    finally:
        t.fim()


def caso_n2(o, nav, R: Rodada) -> None:
    t = R.tela(nav, "n2-painel-caindo", True)
    try:
        t.entrar(R.L, R.contas["dono"], "/painel")
        t.caso.fechar_avisos()
        esperar_quieto(t)
        t.cair_api()
        t.ir("/painel")
        t.pg.wait_for_timeout(int(LIMITE_AVISO_S * 1000))
        avisos6 = t.n('[data-estado="erro"]')
        carregando6 = t.n('main [data-estado="carregando"], main [aria-busy="true"]')
        R.print(t, "h53_painel_6s")
        restante = JANELA_S - (time.time() - t.t0)
        if restante > 0:
            t.pg.wait_for_timeout(int(restante * 1000))
        avisos40 = t.n('[data-estado="erro"]')
        por_alvo = t.por_alvo()
        # "alvo" = o MESMO pedido (método + tabela/rpc/função + a query e o corpo): 2 consultas diferentes na mesma tabela (o sino e o
        # aviso de membro removido em avisos; o contador e o Dashboard em respostas_preconsulta — §1.4 da spec: "não são repetidos")
        # contam separado; o limite é o da conta da §2.3 item 3 (2 × 2 = 4 pedidos por consulta de leitura)
        por_pedido: dict[str, int] = {}
        for p in t.pedidos:
            if p["tipo"] == "auth":
                continue
            k = f"{p['metodo']} {p['tipo']}:{p['nome']}" + (f"({p['acao']})" if p["acao"] else "") + f" #{p['chave']}"
            por_pedido[k] = por_pedido.get(k, 0) + 1
        acima = {k: v for k, v in por_pedido.items() if v > MAX_POR_ALVO and k.split(" ", 1)[1].split(" #")[0].split("(")[0] not in FORA_DO_LIMITE}
        total = sum(1 for p in t.pedidos if p["tipo"] != "auth")
        o.ok(avisos6 >= 1 and avisos40 == avisos6, f"N2 /painel com a API caindo: {avisos6} aviso(s) aos {LIMITE_AVISO_S:g} s e {avisos40} aos {JANELA_S:g} s "
                                                  f"(todos em ≤ {LIMITE_AVISO_S:g} s); {carregando6} ainda carregando aos {LIMITE_AVISO_S:g} s")
        o.ok(not acima, f"N2 nenhum pedido repetido mais de {MAX_POR_ALVO} vezes em {JANELA_S:g} s (o máximo: {max(por_pedido.values(), default=0)}; "
                        f"fora a trocar-token: {por_alvo.get('fn:trocar-token', 0)}×) — acima: {acima}")
        o.linha(f"   por alvo (tabela/rpc/função; 2 consultas na mesma tabela somam): {por_alvo}")
        o.ok(total <= MAX_PEDIDOS, f"N2 {total} pedidos em {JANELA_S:g} s (≤ {MAX_PEDIDOS}; era 129)")
        C.json_arquivo(B.SCRATCH / "agente" / f"pedidos_{R.prefixo}_n2.json", {"por_alvo": por_alvo, "por_pedido": por_pedido})
    finally:
        t.fim()


def caso_n3(o, nav, R: Rodada) -> None:
    for conta, rota, desktop in (("w5p-aluna", "/evolucao", False), ("w5p-nutri", f"/painel/alunos/{R.aluna}/dieta", True)):
        t = entrar_normal(R, nav, conta, rota, desktop, f"n3-{conta}")
        try:
            esperar_quieto(t, minimo=5, quieto=3, maximo=40)
            t.cair_api()
            t.ir(rota)
            s = primeiro_aviso(t, '[data-estado="erro"], [data-evolucao-aviso], [data-aba-evolucao="erro"]', 30)
            o.ok(s is not None and s <= LIMITE_AVISO_S, f"N3 {conta} {rota.replace(R.aluna, '<aluna>')} com a API caindo: aviso em {s} s (≤ {LIMITE_AVISO_S:g} s)")
        finally:
            t.fim()


# ───────────────────────── produção: as linhas das contas de teste (SÓ LEITURA) ─────────────────────────
def contagens_prod(R: Rodada) -> dict | None:
    """As linhas das contas de TESTE que as telas poderiam mexer (aceites, avisos, cadastros pendentes, eventos da conta, matrículas,
    aparelhos do push, agendamentos) — iguais antes e depois prova que nada foi gravado (SQL só leitura)."""
    emails = ", ".join(B.txt(B5.CONTAS[c][0].lower()) for c in (R.contas["aluna"], R.contas["app"], R.contas["dono"]))
    try:
        return B.ler(f"""
          with u as (select id from auth.users where lower(email) in ({emails})),
               k as (select distinct conta_id from public.conta_membros where user_id in (select id from u))
          select (select count(*) from public.aceites where user_id in (select id from u))::int as aceites,
                 (select count(*) from public.avisos where destino_user_id in (select id from u))::int as avisos,
                 (select count(*) from public.cadastros_pendentes where conta_id in (select conta_id from k))::int as cadastros_pendentes,
                 (select count(*) from public.conta_eventos where conta_id in (select conta_id from k))::int as conta_eventos,
                 (select count(*) from public.pacientes where conta_id in (select conta_id from k) or user_id in (select id from u))::int as pacientes,
                 (select count(*) from public.push_aparelhos where user_id in (select id from u))::int as push_aparelhos,
                 (select count(*) from public.agendamentos a join public.pacientes p on p.id = a.paciente_id
                   where p.conta_id in (select conta_id from k) or p.user_id in (select id from u))::int as agendamentos""")[0]
    except Exception as e:  # noqa: BLE001
        R.o.linha(f"   contagens do banco (só leitura): {type(e).__name__}: {str(e)[:160]}")
        return None


# ───────────────────────── main ─────────────────────────
def main() -> int:
    ap = argparse.ArgumentParser(description="hml-17 — E2E de tela (H-38, H-39, H-53; casos no topo)")
    ap.add_argument("--base", required=True, help="local (http://localhost:8080) | staging | prod (SÓ LEITURA) | <url> (ex.: http://localhost:5173)")
    ap.add_argument("--canal", default="msedge", choices=("msedge", "chromium", "chrome"))
    ap.add_argument("--casos", default=None, help=f"padrão: {','.join(CASOS)} (na produção: {','.join(CASOS_PROD)})")
    a = ap.parse_args()
    base = BASES.get(a.base, a.base).rstrip("/")
    host = urllib.parse.urlparse(base).hostname or ""
    producao = host in HOSTS_DE_PRODUCAO
    if a.base == "prod" and not producao:
        raise SystemExit("--base prod precisa ser a produção")
    prefixo = a.base if a.base in BASES else ("local" if host in ("localhost", "127.0.0.1") else "url")
    validos = CASOS_PROD if producao else CASOS
    casos = {c.strip().upper() for c in (a.casos or ",".join(validos)).split(",") if c.strip()}
    fora = sorted(casos - set(validos))
    if fora:
        raise SystemExit(f"casos fora desta base: {fora} (válidos: {', '.join(validos)})")
    B.usar_schema("public" if producao else "staging")
    o = C.Saida(f"telas_{prefixo}")
    R = Rodada(o, base, prefixo, producao)
    o.linha(f"base {base} · {'PRODUÇÃO, só leitura (a Guarda no navegador)' if producao else 'schema staging'} · canal {a.canal} · casos "
            f"{', '.join(c for c in validos if c in casos)}")
    antes = contagens_prod(R) if producao else None
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    with sync_playwright() as pw:

        def rodar(fn, *args) -> None:
            """Cada grupo num navegador novo; caiu no meio (o navegador do notebook) → 1 nova tentativa noutro (molde da hml-11/12/14)."""
            for tentativa in (1, 2):
                nav = pw.chromium.launch(channel=a.canal, args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"])
                try:
                    fn(o, nav, R, *args)
                    return
                except Exception as e:  # noqa: BLE001
                    caiu = any(x in str(e) for x in ("Target crashed", "Unable to capture screenshot", "has been closed"))
                    if not caiu or tentativa == 2:
                        o.ok(False, f"{fn.__name__} {' '.join(map(str, args))}: {type(e).__name__}: {str(e)[:300]}")
                        caso = B5.ESTADO.get("caso")
                        if caso:
                            caso.diagnostico()
                        return
                    o.linha(f"   ({fn.__name__}: o navegador caiu no meio — de novo, num navegador novo)")
                finally:
                    try:
                        nav.close()
                    except Exception:  # noqa: BLE001
                        pass

        try:
            ok_build = {"v": False}

            def build(o_, nav, R_) -> None:
                ok_build["v"] = conferir_build(o_, nav, R_)

            rodar(build)
            if not ok_build["v"]:
                o.ok(False, "parei antes dos casos com conta: o build não é o de staging")
            else:
                if not producao:
                    R.aluna = B.matricula_da_aluna()
                if "T1" in casos:
                    kcal: dict[str, int | None] = {}

                    def t1(o_, nav, R_, conta, desktop) -> None:
                        kcal[f"{conta}:{desktop}"] = caso_t1_painel(o_, nav, R_, conta, desktop)

                    rodar(t1, "w5p-nutri", True)
                    rodar(t1, "w5p-personal", True)
                    rodar(t1, "w5p-personal", False)
                    o.ok(kcal.get("w5p-nutri:True") == kcal.get("w5p-personal:True") == KCAL, f"T1 nutri = personal = {KCAL} kcal ({kcal})")
                    rodar(caso_t1_resumo)
                    rodar(caso_t1_aluna)
                    rodar(caso_t1_pdf)
                if "P1" in casos:
                    rodar(caso_p1, "fresco")
                    rodar(caso_p1, "depois")
                if "P2" in casos:
                    rodar(caso_p2)
                if "P3" in casos:
                    rodar(caso_p3)
                if "P4" in casos:
                    rodar(caso_p4)
                if "P5" in casos:
                    rodar(caso_p5)
                if "N1" in casos:
                    rodar(caso_n1)
                if "N2" in casos:
                    rodar(caso_n2)
                if "N3" in casos:
                    rodar(caso_n3)
        finally:
            R.L.fechar(o)
    if producao:
        depois = contagens_prod(R)
        o.linha(f"   escritas bloqueadas pelo navegador: {R.guarda.bloqueadas if R.guarda else []}")
        o.ok(antes is not None and antes == depois, f"SÓ LEITURA: as linhas das contas de teste iguais antes e depois ({antes} → {depois})")
    graves = [x for bom, x in B5.p.itens if not bom]
    o.ok(not graves, f"sem erro de página ({graves[:2]})")
    o.linha(f"\nprints ({len(R.provas)}): {R.prints}")
    C.C2.registrar_rodada(o.oks, o.oks + o.falhas)  # H-50: a rodada no e2e-rodadas.tsv (nunca derruba o teste)
    return o.fim()


if __name__ == "__main__":
    raise SystemExit(main())
