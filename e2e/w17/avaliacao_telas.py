#!/usr/bin/env python3
"""Physiq W17 (item 3) — E2E de TELA do Perfil do aluno › Avaliação (telas 7 e 4), com a massa da W10 no staging: "Diego Almeida" na
"Consultoria Ferreira W7" (w7-personal = Lucas, dono + personal; w7-nutri = Camila, nutricionista; w10-aluno = o Diego no app).

  personal    a aba abre com o histórico ÚNICO dos 2 bancos (6 avaliações físicas + 2 antropometrias, com o autor), os cards Peso ·
              Gordura · Músculo, o gráfico do peso e as fotos; "Nova avaliação física" (formulário do Calc) grava no Treino; a
              próxima avaliação (NF7) é marcada; o Resumo mostra o card Evolução e o cabeçalho os números Peso e Gordura — os MESMOS
  nutri       ?nova=antropometria (o atalho do Fluxo de consulta) abre o formulário do Nutri; a antropometria grava no principal e
              entra no mesmo histórico; a nutri não vê "Excluir" nas avaliações físicas
  app         o Diego vê as 2 avaliações novas juntas na Evolução do app (W10) e o aviso no sino
  excluir     a nutri exclui a antropometria e o personal a avaliação física (a composição atual volta à da anterior)
  negativos   outra conta não abre a aba; o dono sem papel de nutri não exclui antropometria
  fotos       o personal sobe e exclui uma foto do mês; Comparar abre com as 2 origens
  kpi_parcial hml-26 (H-128), só leitura e 1 login: os números Peso e Gordura do cabeçalho com a leitura da parte do Treino (a treino-leitura,
              action "avaliacoes") caindo na rede (page.route → abort; nunca 5xx) — primeiro a série inteira (o número "certo"); depois,
              recarregada com as 3 primeiras leituras caindo (a do carregamento + 2 novas tentativas), "—" + "dado parcial" nos 2 e nenhum
              número, e a 3ª nova tentativa passa sozinha → o número certo (4 pedidos; nunca o número da metade da série no caminho); por
              fim, com TODAS caindo, o "—" fica com 1 + 3 pedidos e nenhum depois (sem laço) e, solta a rota + o foco, o número certo
No fim tudo volta ao que era (o perfil do Treino do Diego é guardado antes e restaurado).
--seco: sem navegador e sem rede (o socket fica bloqueado) — a rota que derruba a parte do Treino com páginas falsas, a leitura dos 2 KPIs
(parcial × número × nada × o misto), o "nunca o número da metade", o --canal no lançamento e os seletores, o texto e as 3 tentativas nas telas.

Uso: python3 e2e/w17/avaliacao_telas.py --base http://localhost:5173 --prefixo local   (staging: --base https://physiqcalc-staging.vercel.app --prefixo staging)
     [--casos personal,nutri,resumo,kpi_parcial,app,fotos,excluir,negativos] [--canal msedge]
     python3 e2e/w17/avaliacao_telas.py --seco
     Contexto limpo por caso, painel 1280 × 883 × 2 (tela 7) e app 390 × 844 × 3,4 (tela 4).
"""
from __future__ import annotations

import argparse
import json
import re
import socket
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

from playwright.sync_api import sync_playwright  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
p = B.p
DIEGO = B.DIEGO
ESTADO: dict = {}
FOTO = Path.home() / "Desktop" / "Physiq Unificado - estrutura" / "Telas premium" / "fonte (gerador)" / "assets" / "fotos" / "fisico1.jpg"
MARCA = "W17 E2E tela"
REPO = Path(__file__).resolve().parents[2]
# hml-26 (H-128): a parte do Treino é buscada de novo sozinha até 3 vezes (NOVAS_TENTATIVAS_DA_PARTE no useAvaliacaoDoAluno.ts; o --seco
# confere que é o mesmo número) — 1 + 3 pedidos no máximo por leitura da série
TENTATIVAS_DA_PARTE = 3


# ───────────────────────── hml-26 (H-128): peças puras (o --seco confere) ─────────────────────────
class FalhaDaParte:
    """Derruba a leitura da parte do Treino da série: o POST da treino-leitura com action "avaliacoes" CAI NA REDE (route.abort — nunca um
    5xx, que viraria aviso de erro ao Weslley) nas `vezes` primeiras (None = todas) e enquanto não soltar(). O preflight (OPTIONS), as
    outras ações (get, semanaAtual, volume) e as outras funções passam. Conta os que caíram e os que passaram."""

    def __init__(self, pg, vezes: int | None = None, funcao: str = "treino-leitura", acao: str = "avaliacoes") -> None:
        self.pg, self.vezes, self.acao = pg, vezes, acao
        self.padrao = re.compile(rf"/functions/v1/{re.escape(funcao)}(\?|$)")
        self.caiu = 0
        self.passou = 0
        self.solto = False
        self._f = self._pegar
        pg.route(self.padrao, self._f)

    @staticmethod
    def corpo(route) -> dict | None:
        try:
            c = route.request.post_data_json
        except Exception:  # noqa: BLE001 — o corpo que não é JSON
            return None
        return c if isinstance(c, dict) else None

    def _pegar(self, route) -> None:
        c = self.corpo(route) if route.request.method == "POST" else None
        if not c or c.get("action") != self.acao:
            route.continue_()
            return
        if not self.solto and (self.vezes is None or self.caiu < self.vezes):
            self.caiu += 1
            route.abort("failed")
            return
        self.passou += 1
        route.continue_()

    def soltar(self) -> None:
        """Daqui em diante a leitura passa (idempotente); a rota segue contando."""
        self.solto = True

    def tirar(self) -> None:
        self.solto = True
        try:
            self.pg.unroute(self.padrao, self._f)
        except Exception:  # noqa: BLE001 — a página já fechou
            pass


# os 2 números do cabeçalho, como a página está agora (o KpiPeso e o KpiGordura: o número em [data-kpi-peso|gordura]; a série incompleta em
# [data-kpi-parcial]; o texto do cartão [data-kpi-compacto])
JS_KPIS = """() => Object.fromEntries([['peso', 'Peso'], ['gordura', 'Gordura']].map(([m, r]) => {
  const n = document.querySelector(`[data-kpi-${m}]`);
  const k = document.querySelector(`[data-kpi-compacto="${r}"]`);
  return [m, { parcial: !!document.querySelector(`[data-kpi-parcial="${m}"]`), texto: k ? (k.textContent || '') : null,
    numero: n ? { valor: n.getAttribute(`data-kpi-${m}`), variacao: n.getAttribute(`data-kpi-${m}-variacao`) } : null }];
}))"""


def estado_kpi(k: dict) -> str:
    """'parcial' ("—" + "dado parcial", nenhum dígito), 'numero' (o valor, sem "dado parcial"), 'nada' (não apareceu) ou 'misto' (o defeito)."""
    texto, parcial, numero = k.get("texto") or "", bool(k.get("parcial")), k.get("numero")
    if parcial and not numero:
        return "parcial" if "—" in texto and "dado parcial" in texto and not re.search(r"\d", texto) else "misto"
    if numero and not parcial:
        return "numero" if "dado parcial" not in texto else "misto"
    return "nada" if not parcial and not numero else "misto"


def estados(kpis: dict) -> tuple[str, str]:
    return estado_kpi(kpis.get("peso") or {}), estado_kpi(kpis.get("gordura") or {})


def numeros_errados(vistos: list[dict], certo: dict) -> list[str]:
    """Os números que apareceram no caminho e NÃO são os da série inteira (o defeito do H-128: a conta com metade da série)."""
    errados: list[str] = []
    for kp in vistos:
        for m in ("peso", "gordura"):
            n = (kp.get(m) or {}).get("numero")
            if n and n != (certo.get(m) or {}).get("numero"):
                errados.append(f"{m} {n.get('valor')} ({n.get('variacao')})")
    return errados


def q(sql: str) -> list:
    return B.sql_principal(sql)


def t(sql: str) -> list:
    return B.sql_treino(sql)


def abrir(nav, nome: str, conta: str, rota: str, desktop: bool = True):
    c = B.B5.Caso(nav, ESTADO["base"], ESTADO["prefixo"], nome, desktop=desktop)
    c.entrar(conta, rota)
    c.fechar_avisos()
    return c


def esperar_aba(c, nome: str, treino_ok: bool) -> bool:
    ok = c.esperar(lambda: c.tem("[data-aba-avaliacao]"), 90)
    if ok and treino_ok:
        ok = c.esperar(lambda: c.pg.locator("[data-aba-avaliacao]").first.get_attribute("data-avaliacao-treino") == "ok", 90)
    p.check(ok, f"[{nome}] a aba Avaliação abriu{' (com a sessão do Treino)' if treino_ok else ''}")
    return ok


def itens(c) -> list[dict]:
    return c.pg.evaluate("""() => [...document.querySelectorAll('[data-avaliacao-item]')].map(e => ({
        id: e.getAttribute('data-avaliacao-item'), origem: e.getAttribute('data-avaliacao-origem'), data: e.getAttribute('data-avaliacao-data'),
        peso: e.getAttribute('data-avaliacao-peso'), autor: e.querySelector('[data-avaliacao-autor]')?.textContent || '',
        excluir: !!e.querySelector('[data-avaliacao-excluir]') }))""")


def toast(c, trecho: str, timeout: float = 45) -> str:
    alvo = c.pg.locator("[data-sonner-toast]", has_text=trecho)
    c.esperar(lambda: alvo.count() > 0, timeout)
    return alvo.first.inner_text() if alvo.count() else " | ".join(c.pg.locator("[data-sonner-toast]").all_inner_texts())


def sem_toasts(c) -> None:
    # nunca remover o nó à mão (o React do Toaster perde o lugar — NotFoundError): espera os avisos saírem sozinhos
    c.esperar(lambda: c.pg.locator("[data-sonner-toast]").count() == 0, 12)


def hoje() -> str:
    return B.B5.hoje().isoformat()


# ───────────────────────── casos ─────────────────────────


def caso_personal(nav) -> None:
    m = ESTADO["m"]
    rota = f"/painel/alunos/{DIEGO}/avaliacao"
    c = abrir(nav, "personal", "w7-personal", rota)
    try:
        if not esperar_aba(c, "personal", True):
            return
        c.esperar(lambda: len(itens(c)) >= m["n0"], 30)
        li = itens(c)
        p.check(len(li) == m["n0"], f"histórico único: {m['n0']} avaliações dos 2 bancos ({len(li)})")
        p.check([x["origem"] for x in li].count("principal") == m["an0"] and [x["origem"] for x in li].count("treino") == m["av0"],
                f"{m['av0']} do personal (Treino) + {m['an0']} da nutri (principal), juntas")
        p.check(li[0]["data"] >= li[-1]["data"], "a mais recente primeiro")
        p.check(any("Lucas Ferreira · personal" in x["autor"] for x in li) and any("Camila Rocha · nutricionista" in x["autor"] for x in li), "cada uma com o autor")
        p.check(all(x["excluir"] for x in li if x["origem"] == "treino") and not any(x["excluir"] for x in li if x["origem"] == "principal"),
                "o personal (dono sem papel de nutri) exclui as físicas e NÃO as antropometrias")
        k = c.pg.evaluate("() => Object.fromEntries([...document.querySelectorAll('[data-kpi-evolucao]')].map(e => [e.getAttribute('data-kpi-evolucao'), e.getAttribute('data-kpi-valor')]))")
        p.check(k.get("peso") == "84.2" and k.get("gordura") == "15.9", f"cards Peso e Gordura = a última avaliação ({k})")
        hp = c.pg.locator("[data-kpi-peso]").first.get_attribute("data-kpi-peso") if c.tem("[data-kpi-peso]") else None
        hg = c.pg.locator("[data-kpi-gordura]").first.get_attribute("data-kpi-gordura") if c.tem("[data-kpi-gordura]") else None
        p.check(hp == "84.2" and hg == "15.9", f"o cabeçalho mostra os mesmos Peso e Gordura ({hp}, {hg})")
        p.check(c.tem("[data-grafico-evolucao='peso']") and c.tem("[data-avaliacao-fotos-grade]"), "gráfico do peso e fotos de progresso na aba")
        c.pg.mouse.move(5, 5)
        c.print("avaliacao")
        c.pg.screenshot(path=str(B.PRINTS / f"{c.prefixo}_avaliacao_inteira.png"), full_page=True)

        # próxima avaliação (NF7)
        data = time.strftime("%Y-%m-%d", time.localtime(time.time() + 21 * 86400))
        c.pg.locator("[data-avaliacao-proxima-input]").fill(data)
        c.pg.locator("[data-avaliacao-proxima-salvar]").click()
        ok = c.esperar(lambda: (t(f"select proxima_avaliacao::text d from {S}.physiq_profiles where id = '{m['tid']}'")[0]["d"] or "") == data, 30)
        p.check(ok, f"próxima avaliação marcada no perfil do Treino ({data})")
        dd = f"{data[8:10]}/{data[5:7]}"
        p.check(c.esperar(lambda: dd in (c.pg.locator("[data-avaliacao-proxima-data]").first.inner_text() if c.tem("[data-avaliacao-proxima-data]") else ""), 30),
                f"o card mostra {dd}")
        sem_toasts(c)

        # nova avaliação física (formulário do Calc)
        c.pg.locator("[data-avaliacao-nova]").first.click()
        p.check(c.esperar(lambda: c.tem("[data-modal-avaliacao-fisica]"), 15), "'Nova avaliação física' abre o formulário do Calc")
        p.check(c.pg.locator("[data-fisica-peso]").input_value() == "84.2" and c.tem('[data-campos-avaliacao] [data-metodo="dobras_7"][aria-checked="true"]'),
                "o formulário abre com a composição atual do perfil (84,2 kg, 7 dobras), como o Calc")
        c.pg.locator("[data-fisica-peso]").fill("83,6")
        c.pg.locator("[data-fisica-observacao]").fill(MARCA)
        c.pg.wait_for_timeout(400)
        p.check(c.pg.locator("[data-fisica-resultado]").get_attribute("data-fisica-resultado") not in (None, ""), "a prévia calcula o % de gordura")
        c.pg.locator("[data-modal-avaliacao-fisica]").screenshot(path=str(B.PRINTS / f"{c.prefixo}_avaliacao_form_fisica.png"))
        c.pg.locator("[data-btn-salvar-fisica]").click()
        tx = toast(c, "Avaliação física salva")
        p.check("Avaliação física salva" in tx, f"salvou ({tx})")
        ok = c.esperar(lambda: t(f"select count(*)::int n from {S}.physiq_avaliacoes where user_id = '{m['tid']}' and observacao = '{MARCA}'")[0]["n"] == 1, 30)
        nova = t(f"select id::text, data_avaliacao::text d, peso::float p from {S}.physiq_avaliacoes where user_id = '{m['tid']}' and observacao = '{MARCA}'")
        p.check(ok and nova and nova[0]["d"] == hoje() and nova[0]["p"] == 83.6, f"no Banco do Treino: a avaliação de hoje com 83,6 kg ({nova})")
        pf = t(f"select peso::float p from {S}.physiq_profiles where id = '{m['tid']}'")[0]["p"]
        p.check(pf == 83.6, f"é a mais recente: a composição atual do perfil virou 83,6 kg ({pf})")
        ESTADO["fisica"] = nova[0]["id"] if nova else None
        p.check(c.esperar(lambda: len(itens(c)) == m["n0"] + 1 and itens(c)[0]["origem"] == "treino" and itens(c)[0]["data"] == hoje(), 30),
                "a nova entra no topo do histórico")
        av = q(f"select count(*)::int n from {S}.avisos where destino_user_id = '{m['user']}' and tipo = 'avaliacao_nova'")[0]["n"]
        p.check(av == 1, f"o aluno ganhou o aviso 'avaliação nova' no sino ({av})")
        sem_toasts(c)
        c.pg.mouse.move(5, 5)
        c.print("avaliacao_nova_fisica")
    finally:
        c.fim()


def caso_nutri(nav) -> None:
    m = ESTADO["m"]
    c = abrir(nav, "nutri", "w7-nutri", f"/painel/alunos/{DIEGO}/avaliacao?nova=antropometria")
    try:
        if not esperar_aba(c, "nutri", False):
            return
        p.check(c.esperar(lambda: c.tem("[data-modal-antropometria='nova']"), 30), "?nova=antropometria (Fluxo de consulta) abre o formulário do Nutri")
        p.check("nova" not in c.caminho(), f"o parâmetro sai da URL ({c.caminho()})")
        p.check(c.pg.locator("[data-campo-sexo]").input_value() == "masculino" and c.pg.locator("[data-campo-idade]").input_value() == "31",
                "sem gênero/nascimento no cadastro, a antropometria nasce com o sexo e a idade do perfil do Treino")
        p.check(c.pg.locator("[data-campo-peso]").input_value() in ("83,6", "83.6"), f"e com o peso do último registro ({c.pg.locator('[data-campo-peso]').input_value()})")
        c.pg.locator("[data-campo-peso]").fill("83,9")
        c.pg.locator("[data-campo-altura]").fill("178")
        c.pg.locator("[data-campo-protocolo]").select_option("pollock3")
        for chave, v in (("peitoral", "12"), ("abdominal", "20"), ("coxa", "15")):
            loc = c.pg.locator(f"[data-campo-dobra='{chave}']")
            if loc.count():
                loc.fill(v)
        c.pg.locator("[data-campo-observacao]").fill(MARCA)
        c.pg.locator("[data-circunferencias] [data-campo-circ='cintura']").fill("83")
        c.pg.wait_for_timeout(400)
        p.check((c.pg.locator("[data-previa-gordura]").first.get_attribute("data-previa-gordura") or "") != "", "a prévia calcula o % de gordura (Pollock 3)")
        c.pg.locator("[data-modal-antropometria]").screenshot(path=str(B.PRINTS / f"{c.prefixo}_avaliacao_form_antropometria.png"))
        c.pg.locator("[data-btn-salvar-antropometria]").click()
        ok = c.esperar(lambda: q(f"select count(*)::int n from {S}.antropometrias where paciente_id = '{DIEGO}' and observacao = '{MARCA}' and deleted_at is null")[0]["n"] == 1, 30)
        nova = q(f"select id::text, nutricionista_id::text n, peso::float p from {S}.antropometrias where paciente_id = '{DIEGO}' and observacao = '{MARCA}'")
        p.check(ok and nova and nova[0]["n"] == m["nutri"] and nova[0]["p"] == 83.9, f"no banco principal: a antropometria da Camila com 83,9 kg ({nova})")
        ESTADO["antropo"] = nova[0]["id"] if nova else None
        p.check(c.esperar(lambda: len(itens(c)) == m["n0"] + 2, 30), "as 2 novas no mesmo histórico (a física do personal e a antropometria)")
        li = itens(c)
        p.check(not any(x["excluir"] for x in li if x["origem"] == "treino") and any(x["excluir"] for x in li if x["origem"] == "principal"),
                "a nutri exclui as antropometrias e NÃO as avaliações físicas")
        p.check(c.esperar(lambda: c.tem("[data-avaliacao-proxima-data]"), 10) and not c.tem("[data-avaliacao-proxima-editar]"), "a nutri vê a próxima avaliação e não muda")
        sem_toasts(c)
        c.pg.mouse.move(5, 5)
        c.print("avaliacao_nutri")
        # PDF da antropometria (o do Nutri)
        B.SCRATCH.joinpath("downloads").mkdir(parents=True, exist_ok=True)
        try:
            with c.pg.expect_download(timeout=30000) as d:
                c.pg.locator(f"[data-avaliacao-pdf='principal:{ESTADO['antropo']}']").click()
            destino = B.SCRATCH / "downloads" / f"{c.prefixo}_{d.value.suggested_filename}"
            d.value.save_as(str(destino))
            p.check(destino.stat().st_size > 2000, f"PDF da antropometria baixado ({destino.name}, {destino.stat().st_size} bytes)")
        except Exception as e:  # noqa: BLE001
            p.check(False, f"PDF da antropometria: {str(e)[:120]}")
    finally:
        c.fim()


def caso_resumo(nav) -> None:
    m = ESTADO["m"]
    c = abrir(nav, "resumo", "w7-personal", f"/painel/alunos/{DIEGO}")
    try:
        ok = c.esperar(lambda: c.tem("[data-card-evolucao-numeros]"), 90)
        p.check(ok, "o Resumo mostra o card Evolução (tela 7)")
        chip = c.pg.locator("[data-card-evolucao-ultima]").first.inner_text() if c.tem("[data-card-evolucao-ultima]") else ""
        p.check(chip.replace("\n", " ").strip().upper().endswith(f"· {hoje()[8:10]}/{hoje()[5:7]}"), f"o chip da última avaliação é de hoje ({chip})")
        peso = c.pg.locator("[data-card-evolucao-numero='peso']").first.inner_text()
        prox = c.pg.locator("[data-card-evolucao-numero='proxima']").first.inner_text()
        hp = c.pg.locator("[data-kpi-peso]").first.get_attribute("data-kpi-peso") if c.tem("[data-kpi-peso]") else None
        p.check("83,9" in peso or "83,6" in peso, f"o peso do card = o da avaliação mais recente ({peso.strip()})")
        p.check(hp and (hp in ("83.6", "83.9")) and hp.replace(".", ",") in peso, f"o número Peso do cabeçalho = o do card ({hp})")
        p.check(m.get("proxima_dd", "") in prox, f"Próxima = a data marcada ({prox.strip()})")
        p.check(c.tem("[data-card-evolucao-grafico]"), "o gráfico do peso no card")
        c.pg.mouse.move(5, 5)
        c.print("resumo_evolucao")
        box = c.pg.locator("[data-card-evolucao]").first.bounding_box()
        if box:
            c.pg.screenshot(path=str(B.PRINTS / f"{c.prefixo}_card_evolucao.png"), clip={"x": box["x"] - 8, "y": box["y"] - 8, "width": box["width"] + 16, "height": box["height"] + 16})
    finally:
        c.fim()


def kpis(c) -> dict:
    try:
        return c.pg.evaluate(JS_KPIS)
    except Exception:  # noqa: BLE001 — recarregando
        return {}


def acompanhar(c, ate, timeout: float, passo: float = 0.25) -> list[dict]:
    """Lê os 2 KPIs a cada `passo` até `ate(kpis)` ou o tempo; devolve tudo o que foi visto (em ordem)."""
    vistos: list[dict] = []
    t0 = time.time()
    while time.time() - t0 < timeout:
        k = kpis(c)
        vistos.append(k)
        if ate(k):
            break
        c.pg.wait_for_timeout(passo * 1000)
    return vistos


def caso_kpi_parcial(nav) -> None:
    """hml-26 (H-128): o cabeçalho do Diego (o Resumo) com a leitura da parte do Treino caindo na rede — 1 login, só leitura."""
    c = abrir(nav, "kpi_parcial", "w7-personal", f"/painel/alunos/{DIEGO}")
    falhas: list[FalhaDaParte] = []
    try:
        # 1. a série inteira (nada cai): o número "certo" dos 2
        ok = c.esperar(lambda: estados(kpis(c)) == ("numero", "numero"), 90)
        certo = kpis(c)
        p.check(ok, f"[kpi_parcial] a série inteira: Peso e Gordura com o número ({certo.get('peso', {}).get('numero')}, "
                    f"{certo.get('gordura', {}).get('numero')})")
        if not ok:
            return
        # 2. a mesma tela recarregada com a leitura da parte do Treino caindo SÓ naquele carregamento (a dele + as 2 primeiras novas tentativas)
        f = FalhaDaParte(c.pg, vezes=TENTATIVAS_DA_PARTE)
        falhas.append(f)
        c.pg.reload(wait_until="domcontentloaded")
        vistos = acompanhar(c, lambda k: estados(k) == ("numero", "numero") and f.passou >= 1, 90)
        viu_parcial = any(estados(k) == ("parcial", "parcial") for k in vistos)
        p.check(viu_parcial, f"[kpi_parcial] a parte do Treino caiu: '—' + 'dado parcial' nos 2, nenhum número ({f.caiu} leitura(s) caída(s))")
        p.check(not any("misto" in estados(k) for k in vistos), "[kpi_parcial] nunca o número junto com o 'dado parcial'")
        errados = numeros_errados(vistos, certo)
        p.check(not errados, f"[kpi_parcial] nenhum número da metade da série no caminho ({errados[:3]})")
        final = vistos[-1] if vistos else {}
        p.check(estados(final) == ("numero", "numero") and numeros_errados([final], certo) == [],
                "[kpi_parcial] a nova tentativa passou sozinha: o número certo (o da série inteira) voltou nos 2")
        c.pg.wait_for_timeout(1500)
        p.check((f.caiu, f.passou) == (TENTATIVAS_DA_PARTE, 1),
                f"[kpi_parcial] a parte do Treino foi buscada de novo SOZINHA: {f.caiu} caídas + {f.passou} que passou (= 1 + {TENTATIVAS_DA_PARTE})")
        f.tirar()
        # 3. todas caindo: o "—" fica, 1 + 3 pedidos e nenhum depois (sem laço); solta a rota + o foco → o número certo
        g = FalhaDaParte(c.pg, vezes=None)
        falhas.append(g)
        c.pg.reload(wait_until="domcontentloaded")
        ok = c.esperar(lambda: g.caiu >= 1 + TENTATIVAS_DA_PARTE, 90)
        c.pg.wait_for_timeout(4000)
        k = kpis(c)
        p.check(ok and (g.caiu, g.passou) == (1 + TENTATIVAS_DA_PARTE, 0) and estados(k) == ("parcial", "parcial"),
                f"[kpi_parcial] com todas caindo: '—' + 'dado parcial' fica, {g.caiu} pedidos (1 + {TENTATIVAS_DA_PARTE}) e nenhum depois de 4 s")
        c.pg.mouse.move(5, 5)
        c.print("kpi_parcial")
        caixa = c.pg.locator("[data-kpis-aluno]").first.bounding_box() if c.tem("[data-kpis-aluno]") else None
        if caixa:
            c.pg.screenshot(path=str(B.PRINTS / f"{c.prefixo}_kpi_parcial_cabecalho.png"),
                            clip={"x": caixa["x"] - 8, "y": caixa["y"] - 8, "width": caixa["width"] + 16, "height": caixa["height"] + 16})
        g.soltar()
        c.pg.evaluate("() => window.dispatchEvent(new Event('visibilitychange'))")
        vistos = acompanhar(c, lambda kk: estados(kk) == ("numero", "numero"), 60)
        final = vistos[-1] if vistos else {}
        p.check(estados(final) == ("numero", "numero") and numeros_errados(vistos, certo) == [] and g.passou == 1,
                f"[kpi_parcial] solta a rota + o foco: a parte voltou ({g.passou} pedido) e o número certo nos 2")
    finally:
        for x in falhas:
            x.tirar()
        c.fim()


def caso_app(nav) -> None:
    c = abrir(nav, "app", "w10-aluno", "/evolucao", desktop=False)
    try:
        ok = c.esperar(lambda: c.tem("[data-evolucao-conteudo]"), 120)
        p.check(ok, "o app do Diego abre a Evolução")
        c.pg.wait_for_timeout(1500)
        c.pg.locator("[data-evolucao-contagem]").first.click()
        ok = c.esperar(lambda: c.tem("[data-sheet-avaliacoes]"), 20)
        txt = c.pg.locator("[data-sheet-avaliacoes]").first.inner_text() if ok else ""
        dd = f"{hoje()[8:10]}/{hoje()[5:7]}"
        p.check(txt.count(dd) >= 2, f"a tabela do app tem as 2 avaliações de hoje ({dd}: {txt.count(dd)}×) — personal e nutri juntos")
        c.print("app_evolucao_2bancos")
        c.pg.keyboard.press("Escape")
        c.pg.wait_for_timeout(500)
        c.ir("/")
        if c.esperar(lambda: c.tem("[data-sino]"), 60):
            c.pg.locator("[data-sino]").first.click()
        p.check(c.esperar(lambda: "Nova avaliação no seu histórico" in c.texto(), 30), "o Diego vê 'Nova avaliação no seu histórico' no sino")
        c.print("app_sino_avaliacao")
    finally:
        c.fim()


def caso_fotos(nav) -> None:
    m = ESTADO["m"]
    c = abrir(nav, "fotos", "w7-personal", f"/painel/alunos/{DIEGO}/avaliacao")
    try:
        if not esperar_aba(c, "fotos", True):
            return
        c.pg.locator("[data-avaliacao-comparar]").first.click()
        p.check(c.esperar(lambda: c.tem("[data-sheet-comparar]"), 15), "Comparar abre (2 datas lado a lado)")
        c.pg.wait_for_timeout(800)
        c.print("avaliacao_comparar")
        c.pg.keyboard.press("Escape")
        c.pg.wait_for_timeout(500)
        c.pg.locator("[data-avaliacao-fotos-gerenciar]").first.click()
        p.check(c.esperar(lambda: c.tem("[data-sheet-fotos]"), 15), "'Fotos' abre a lista das 2 origens")
        sess = c.pg.locator("[data-fotos-sessao]").count()
        p.check(sess >= 3, f"as sessões do personal e da nutri ({sess})")
        mes = "2026-01"
        c.pg.locator("[data-fotos-mes]").fill(mes)
        with c.pg.expect_file_chooser() as fc:
            c.pg.locator("[data-foto-mensal-subir='frente']").click()
        fc.value.set_files(str(FOTO))
        ok = c.esperar(lambda: t(f"select count(*)::int n from {S}.physiq_registros_fotos where user_id = '{m['tid']}' and mes_ref = '{mes}-01' and tipo = 'frente'")[0]["n"] == 1, 60)
        p.check(ok, "o personal sobe a foto de frente do mês (Treino)")
        c.esperar(lambda: c.pg.locator("[data-fotos-sessao]").count() == sess + 1, 30)
        c.print("avaliacao_fotos")
        alvo = t(f"select id::text from {S}.physiq_registros_fotos where user_id = '{m['tid']}' and mes_ref = '{mes}-01' and tipo = 'frente'")
        if alvo:
            c.pg.locator(f"[data-foto-excluir='treino:{alvo[0]['id']}']").first.click()
            p.check(c.confirmar_no_app(), "excluir a foto: a confirmação do app (hml-18a) → Excluir")
            ok = c.esperar(lambda: t(f"select count(*)::int n from {S}.physiq_registros_fotos where id = '{alvo[0]['id']}'")[0]["n"] == 0, 30)
            p.check(ok, "e exclui")
    finally:
        c.fim()


def caso_excluir(nav) -> None:
    m = ESTADO["m"]
    c = abrir(nav, "excluir_nutri", "w7-nutri", f"/painel/alunos/{DIEGO}/avaliacao")
    try:
        if esperar_aba(c, "excluir_nutri", False) and ESTADO.get("antropo"):
            c.pg.locator(f"[data-avaliacao-excluir='principal:{ESTADO['antropo']}']").click()
            c.esperar(lambda: c.tem("[data-btn-confirmar-excluir-avaliacao]"), 10)
            c.pg.locator("[data-btn-confirmar-excluir-avaliacao]").click()
            ok = c.esperar(lambda: q(f"select (deleted_at is not null) d from {S}.antropometrias where id = '{ESTADO['antropo']}'")[0]["d"] is True, 30)
            p.check(ok, "a nutri exclui a antropometria (vai para a Lixeira)")
            p.check(c.esperar(lambda: not any(x["id"] == f"principal:{ESTADO['antropo']}" for x in itens(c)), 20), "e ela sai do histórico")
    finally:
        c.fim()
    c = abrir(nav, "excluir_personal", "w7-personal", f"/painel/alunos/{DIEGO}/avaliacao")
    try:
        if esperar_aba(c, "excluir_personal", True) and ESTADO.get("fisica"):
            c.pg.locator(f"[data-avaliacao-excluir='treino:{ESTADO['fisica']}']").click()
            c.esperar(lambda: c.tem("[data-btn-confirmar-excluir-avaliacao]"), 10)
            c.pg.locator("[data-btn-confirmar-excluir-avaliacao]").click()
            ok = c.esperar(lambda: t(f"select count(*)::int n from {S}.physiq_avaliacoes where id = '{ESTADO['fisica']}'")[0]["n"] == 0, 30)
            p.check(ok, "o personal exclui a avaliação física")
            pf = c.esperar(lambda: t(f"select peso::float p from {S}.physiq_profiles where id = '{m['tid']}'")[0]["p"] == float(m["perfil0"]["peso"]), 30)
            p.check(pf, f"a composição atual volta à da avaliação anterior ({m['perfil0']['peso']} kg)")
            p.check(c.esperar(lambda: len(itens(c)) == m["n0"], 20), f"o histórico volta a {m['n0']}")
    finally:
        c.fim()


def caso_negativos(nav) -> None:
    c = abrir(nav, "outra_conta", "w13-nutri", f"/painel/alunos/{DIEGO}/avaliacao")
    try:
        ok = c.esperar(lambda: "Não deu para abrir" in c.texto() or "não vê" in c.texto().lower() or c.tem("[data-pagina-sem-acesso]"), 60)
        p.check(ok and not c.tem("[data-avaliacao-item]"), "outra conta não vê a avaliação do aluno")
    finally:
        c.fim()


CASOS = {"personal": caso_personal, "nutri": caso_nutri, "resumo": caso_resumo, "kpi_parcial": caso_kpi_parcial, "app": caso_app,
         "fotos": caso_fotos, "excluir": caso_excluir, "negativos": caso_negativos}


def massa() -> dict:
    user = q(f"select user_id::text u from {S}.pacientes where id = '{DIEGO}'")[0]["u"]
    tid = t(f"select treino_user_id::text t from {S}.physiq_identidades where principal_user_id = '{user}'")[0]["t"]
    perfil0 = t(f"select * from {S}.physiq_profiles where id = '{tid}'")[0]
    av0 = t(f"select count(*)::int n from {S}.physiq_avaliacoes where user_id = '{tid}'")[0]["n"]
    an0 = q(f"select count(*)::int n from {S}.antropometrias where paciente_id = '{DIEGO}' and deleted_at is null")[0]["n"]
    return {"user": user, "tid": tid, "perfil0": perfil0, "av0": av0, "an0": an0, "n0": av0 + an0, "nutri": B.uid("w7-nutri")}


def restaurar(m: dict) -> None:
    """O que o teste criou sai; o perfil do Treino do Diego volta igual (composição, próxima avaliação)."""
    t(f"delete from {S}.physiq_avaliacoes where user_id = '{m['tid']}' and observacao = '{MARCA}'")
    q(f"delete from {S}.antropometrias where paciente_id = '{DIEGO}' and observacao = '{MARCA}'")
    t(f"delete from {S}.physiq_registros_fotos where user_id = '{m['tid']}' and mes_ref = '2026-01-01'")
    q(f"delete from {S}.avisos where destino_user_id = '{m['user']}' and tipo = 'avaliacao_nova'")
    cols = [k for k in m["perfil0"] if k not in ("id", "created_at", "updated_at")]
    sets = []
    for k in cols:
        v = m["perfil0"][k]
        if v is None:
            sets.append(f"{k} = null")
        elif isinstance(v, bool):
            sets.append(f"{k} = {'true' if v else 'false'}")
        elif isinstance(v, (int, float)):
            sets.append(f"{k} = {v}")
        elif isinstance(v, (dict, list)):
            sets.append(f"{k} = $v${json.dumps(v)}$v$")
        else:
            sets.append(f"{k} = $v${v}$v$")
    t(f"update {S}.physiq_profiles set {', '.join(sets)} where id = '{m['tid']}'")


class _Pedido:
    def __init__(self, url: str, metodo: str, corpo) -> None:
        self.url, self.method, self._corpo = url, metodo, corpo

    @property
    def post_data_json(self):
        if isinstance(self._corpo, Exception):
            raise self._corpo
        return self._corpo


class _RotaFalsa:
    def __init__(self, url: str, metodo: str = "POST", corpo=None) -> None:
        self.request = _Pedido(url, metodo, corpo)
        self.seguiu, self.caiu = 0, []

    def continue_(self) -> None:
        self.seguiu += 1

    def abort(self, codigo: str = "failed") -> None:
        self.caiu.append(codigo)


class _PaginaFalsa:
    def __init__(self) -> None:
        self.rotas: list = []

    def route(self, padrao, f) -> None:
        self.rotas.append((padrao, f))

    def unroute(self, padrao, f) -> None:
        self.rotas.remove((padrao, f))


class _PlaywrightFalso:
    """O sync_playwright falso do --seco: guarda o que o lançamento do navegador recebeu."""

    def __init__(self) -> None:
        self.chromium = self
        self.lancamentos: list[dict] = []

    def launch(self, **k):
        self.lancamentos.append(k)
        return self


def _kpi(parcial: bool, texto: str | None, valor: str | None = None, variacao: str | None = None) -> dict:
    return {"parcial": parcial, "texto": texto, "numero": {"valor": valor, "variacao": variacao} if valor is not None else None}


def seco() -> int:
    """hml-26 (H-128), sem navegador e sem rede (o socket fica bloqueado): a rota que derruba a parte do Treino, a leitura dos 2 KPIs, o
    "nunca o número da metade", o --canal no lançamento e os seletores, o texto e as 3 tentativas nas telas."""
    def sem_rede(*_a, **_k):
        raise RuntimeError("--seco não usa a rede")

    socket.socket.connect = sem_rede  # type: ignore[method-assign]
    url = "https://treino.exemplo.invalid/functions/v1/treino-leitura"
    pg = _PaginaFalsa()
    f = FalhaDaParte(pg, vezes=TENTATIVAS_DA_PARTE)
    padrao, pegar = pg.rotas[0]
    p.check(padrao.search(url) and padrao.search(url + "?x=1") and not padrao.search(url + "-x")
            and not padrao.search("https://treino.exemplo.invalid/functions/v1/admin-get-user"),
            "seco: a rota pega só a treino-leitura (com ou sem ?; não a admin-get-user nem outro nome que comece igual)")
    pre = _RotaFalsa(url, "OPTIONS")
    outras = [_RotaFalsa(url, corpo={"action": a, "aluno": "x"}) for a in ("get", "semanaAtual", "volume")]
    sem_json = _RotaFalsa(url, corpo=ValueError("não é JSON"))
    leituras = [_RotaFalsa(url, corpo={"action": "avaliacoes", "aluno": "x"}) for _ in range(TENTATIVAS_DA_PARTE + 2)]
    for r in [pre, *outras, sem_json, *leituras]:
        pegar(r)
    passaram = pre.seguiu == 1 and sem_json.seguiu == 1 and all(r.seguiu == 1 and not r.caiu for r in outras)
    p.check(passaram and all(r.caiu == ["failed"] and r.seguiu == 0 for r in leituras[:TENTATIVAS_DA_PARTE])
            and all(r.seguiu == 1 and not r.caiu for r in leituras[TENTATIVAS_DA_PARTE:]) and (f.caiu, f.passou) == (TENTATIVAS_DA_PARTE, 2),
            f"seco: derruba na rede (abort, nunca 5xx) só as {TENTATIVAS_DA_PARTE} primeiras leituras da parte do Treino (action avaliacoes); depois passam; "
            "o preflight, as outras ações e o corpo que não é JSON passam direto")
    g = FalhaDaParte(pg, vezes=None)
    _, pegar_g = pg.rotas[1]
    antes = [_RotaFalsa(url, corpo={"action": "avaliacoes"}) for _ in range(6)]
    for r in antes:
        pegar_g(r)
    g.soltar()
    depois = _RotaFalsa(url, corpo={"action": "avaliacoes"})
    pegar_g(depois)
    f.tirar()
    g.tirar()
    g.tirar()
    p.check(all(r.caiu == ["failed"] for r in antes) and depois.seguiu == 1 and (g.caiu, g.passou) == (6, 1) and not pg.rotas,
            "seco: com vezes=None derruba todas até o soltar(); depois passa e conta; tirar() sai da página (idempotente)")
    certo = {"peso": _kpi(False, "Peso81,8 kg2,2 kg em 6 meses", "81.8", "-2.2"), "gordura": _kpi(False, "Gordura19,3%2,7 pontos", "19.3", "-2.7")}
    parcial = {"peso": _kpi(True, "Peso—dado parcial"), "gordura": _kpi(True, "Gordura—dado parcial")}
    metade = {"peso": _kpi(False, "Peso81,8 kg0,9 kg em 6 meses", "81.8", "-0.9"), "gordura": _kpi(False, "Gordura19,3%1,0 ponto", "19.3", "-1")}
    misto = {"peso": _kpi(True, "Peso81,8 kgdado parcial", "81.8", "-0.9"), "gordura": _kpi(True, "Gordura—dado parcial 1")}
    p.check(estados(certo) == ("numero", "numero") and estados(parcial) == ("parcial", "parcial") and estados({}) == ("nada", "nada")
            and estados(misto) == ("misto", "misto") and estado_kpi(_kpi(False, "Peso81,8 kgdado parcial", "81.8")) == "misto",
            "seco: a leitura dos KPIs — número, '—' + 'dado parcial' (sem dígito), não apareceu, e o misto (número com 'dado parcial', dígito no parcial)")
    p.check(numeros_errados([{}, parcial, certo], certo) == [] and numeros_errados([parcial, metade, certo], certo) == ["peso 81.8 (-0.9)", "gordura 19.3 (-1)"],
            "seco: 'nunca o número da metade' — o parcial e o certo passam; a conta com metade da série no caminho é pega (nos 2)")
    pw = _PlaywrightFalso()
    abrir_navegador(pw, opcoes(["--seco", "--canal", "msedge"]).canal)
    p.check(pw.lancamentos == [{"channel": "msedge", "args": ARGS_NAVEGADOR}] and opcoes(["--seco"]).canal == "chromium"
            and "kpi_parcial" in opcoes(["--seco"]).casos.split(",") and "kpi_parcial" in CASOS,
            "seco: o --canal msedge chega ao lançamento do navegador (sem ele, o chromium); o kpi_parcial está nos casos e no padrão do --casos")
    fontes = {rel: (REPO / rel).read_text(encoding="utf-8") for rel in (
        "src/painel/aluno/kpis/KpiPeso.tsx", "src/painel/aluno/kpis/KpiGordura.tsx", "src/painel/aluno/avaliacao/regras.ts",
        "src/painel/aluno/avaliacao/useAvaliacaoDoAluno.ts", "src/integrations/consultas.ts", "src/painel/aluno/avaliacao/fontes.ts",
        "src/painel/aluno/Cabecalho.tsx")}
    kp, kg = fontes["src/painel/aluno/kpis/KpiPeso.tsx"], fontes["src/painel/aluno/kpis/KpiGordura.tsx"]
    p.check('data-kpi-parcial="peso"' in kp and 'data-kpi-parcial="gordura"' in kg
            and all('valor="—" detalhe={DETALHE_KPI_PARCIAL}' in x for x in (kp, kg))
            and 'export const DETALHE_KPI_PARCIAL = "dado parcial";' in fontes["src/painel/aluno/avaliacao/regras.ts"]
            and "data-kpi-compacto={rotulo}" in (REPO / "src/ui/premium/Kpi.tsx").read_text(encoding="utf-8")
            and "data-kpis-aluno" in fontes["src/painel/aluno/Cabecalho.tsx"]
            and all(f"data-kpi-{m}={{k.valor}}" in x and f"data-kpi-{m}-variacao=" in x for m, x in (("peso", kp), ("gordura", kg))),
            "seco: os seletores do caso existem nas telas (o parcial, o número, o cartão e a caixa do cabeçalho) e o texto é 'dado parcial' com o '—'")
    hook = fontes["src/painel/aluno/avaliacao/useAvaliacaoDoAluno.ts"]
    do_app = re.search(r"\$\{[^}]*\}(/functions/v1/treino-leitura)`", fontes["src/painel/aluno/avaliacao/fontes.ts"])
    p.check(f"export const NOVAS_TENTATIVAS_DA_PARTE = {TENTATIVAS_DA_PARTE};" in hook and "retryDelay: ESPERA_NOVA_TENTATIVA_MS" in hook
            and "refetchOnWindowFocus: true" in hook and "export const ESPERA_NOVA_TENTATIVA_MS = 1000;" in fontes["src/integrations/consultas.ts"]
            and 'action: "avaliacoes"' in fontes["src/painel/aluno/avaliacao/fontes.ts"] and bool(do_app and padrao.search(do_app.group(1))),
            f"seco: as {TENTATIVAS_DA_PARTE} novas tentativas (1 s entre elas, o foco tenta de novo) são as do hook, e a rota pega a URL e a ação que o app chama")
    try:
        socket.create_connection(("127.0.0.1", 9), timeout=1)
        bloqueado = False
    except RuntimeError:
        bloqueado = True
    except OSError:
        bloqueado = False
    p.check(bloqueado, "seco: a rede fica bloqueada (nada foi ao banco nem ao site)")
    return p.fim()


ARGS_NAVEGADOR = ["--no-sandbox"]
CASOS_PADRAO = "personal,nutri,resumo,kpi_parcial,app,fotos,excluir,negativos"


def opcoes(argv: list[str] | None = None) -> argparse.Namespace:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base")
    ap.add_argument("--prefixo")
    ap.add_argument("--casos", default=CASOS_PADRAO)
    # hml-18a: o E2E de tela sempre com o Edge no notebook (o Chromium do Playwright cai nas páginas longas — hml-11/hml-16)
    ap.add_argument("--canal", default="chromium", choices=("chromium", "msedge", "chrome"))
    ap.add_argument("--seco", action="store_true", help="sem navegador e sem rede: a rota da parte do Treino, a leitura dos KPIs, o --canal e as telas")
    a = ap.parse_args(argv)
    if not a.seco and (not a.base or not a.prefixo):
        ap.error("--base e --prefixo são obrigatórios (menos no --seco)")
    return a


def abrir_navegador(pw, canal: str):
    """O navegador dos casos, no canal do --canal."""
    return pw.chromium.launch(channel=canal, args=ARGS_NAVEGADOR)


if __name__ == "__main__":
    a = opcoes()
    if a.seco:
        sys.exit(seco())
    ESTADO.update(base=a.base.rstrip("/"), prefixo=a.prefixo)
    B.saude_ok(f"avaliação — telas ({a.prefixo})")
    m = massa()
    ESTADO["m"] = m
    B.json_arquivo(B.SCRATCH / f"perfil_diego_antes_{a.prefixo}.json", m["perfil0"])
    t0 = time.time()
    try:
        with sync_playwright() as pw:
            nav = abrir_navegador(pw, a.canal)
            for nome in a.casos.split(","):
                if nome == "resumo":
                    data = t(f"select proxima_avaliacao::text d from {S}.physiq_profiles where id = '{m['tid']}'")[0]["d"]
                    m["proxima_dd"] = f"{data[8:10]}/{data[5:7]}" if data else ""
                B.saude_ok(f"o caso {nome}")
                CASOS[nome](nav)
            nav.close()
    finally:
        restaurar(m)
        av1 = t(f"select count(*)::int n from {S}.physiq_avaliacoes where user_id = '{m['tid']}'")[0]["n"]
        an1 = q(f"select count(*)::int n from {S}.antropometrias where paciente_id = '{DIEGO}' and deleted_at is null")[0]["n"]
        pf = t(f"select peso::float p, proxima_avaliacao from {S}.physiq_profiles where id = '{m['tid']}'")[0]
        p.check((av1, an1) == (m["av0"], m["an0"]) and pf["p"] == float(m["perfil0"]["peso"]) and pf["proxima_avaliacao"] == m["perfil0"]["proxima_avaliacao"],
                f"a massa voltou ao que era (físicas {av1}, antropometrias {an1}, perfil {pf})")
    rc = p.fim()
    print(f"({time.time() - t0:.0f} s)")
    sys.exit(rc)
