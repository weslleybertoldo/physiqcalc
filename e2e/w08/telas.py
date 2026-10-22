#!/usr/bin/env python3
"""Physiq W8 — E2E de TELA da aba Treino nova (tela 2), com os prints no tamanho do app (390 × 844 × 3,4 = 1326 × 2870).

Em série (o Banco do Treino é uma VM Nano), contexto limpo por caso, `/health` antes de cada um. Os fluxos de ESCRITA rodam SEM
INTERNET depois do 1º sync (P20 — ver _base.py) e conferem a subida para o staging na volta; os GIFs e fotos (no APK são
arquivos do próprio app; no site, o service worker guarda) vêm dos arquivos locais também sem internet.

Casos (na ordem):
  treino_dia       aluno do Calc: o treino do profissional no dia → séries com peso e OK (2 exercícios feitos, o 3º com 2 de 3)
                   → tela 2 (card, feitos com ✓, o atual com "Série 3 de 3" e a carga, card do descanso com o anel; hml-28: a faixa
                   Seg–Dom cabe em 390 e em 360 px) → exercício
                   aberto com as séries → ajustes do descanso (hml-28, H-169: "Pausar" → "Continuar" e a fileira dos 3 botões cabe
                   na folha em 390 e em 360 px; depois volta a "Pausar") → termina o treino → "Treino finalizado!" → compartilhar →
                   volta a internet → as séries (peso × reps), o histórico e o concluído sobem para o staging
  historico        o calendário do mês com o treino de hoje, o detalhe, compartilhar e excluir (sem internet; a exclusão sobe)
  funcoes          ficha com GIF, histórico do exercício, anotações (o ponto), academia, adicionar/tirar série, reordenar
                   arrastando (a ordem sobe), "Montar o meu" (treino e exercício próprios viram o treino do dia)
  sem_profissional aluno do app (W7b, sem profissional): "Montar o meu" e "Usar um treino pronto" (abre os treinos prontos)
  so_nutricao      negativo: aluno só de Nutrição não tem a aba Treino (a rota volta para a abertura)
  sem_internet     o aviso "Sem internet · o treino fica salvo no aparelho (N mudanças)"
--seco (hml-28): sem navegador e sem rede — o que os checks do H-169 e da faixa usam existe no código e as regras deles com as medidas da sonda.
Build de STAGING (hml-28 F5; o /health.json com "schema": "staging" = SEM PowerSync, H-14): o treino_dia prova a faixa Seg–Dom e a folha
"Descanso" (o descanso guardado no aparelho) e o resto dele fica PULADO; historico, funcoes, sem_profissional e sem_internet ficam PULADOS.
Uso: python3 e2e/w08/telas.py --base http://localhost:5173 --prefixo local [--casos a,b] [--canal msedge] | --seco
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import socket
import sys
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

p = B.p
PUBLICO = Path(__file__).resolve().parent.parent.parent / "public"
CASOS: dict[str, callable] = {}


def caso(f):
    CASOS[f.__name__.removeprefix("caso_")] = f
    return f


TIPOS = {".webp": "image/webp", ".glb": "model/gltf-binary"}


def arquivos_locais(c) -> None:
    """GIFs (public/exercicios), o 3D (public/exercicios3d: a foto .webp e o modelo .glb) e fotos (public/fotos) servidos do
    disco, com ou sem internet — como no APK (22/10/2026: sem a pasta do 3D, a miniatura e a ficha ficavam vazias sem internet)."""
    def servir(route):
        rel = route.request.url.split("://", 1)[1].split("/", 1)[1].split("?")[0]
        arq = PUBLICO / rel
        if arq.exists():
            route.fulfill(path=str(arq), content_type=TIPOS.get(arq.suffix))
        else:
            route.continue_()
    c.ctx.route("**/exercicios/**", servir)
    c.ctx.route("**/exercicios3d/**", servir)
    c.ctx.route("**/fotos/**", servir)


def fechar_linhas_abertas(c) -> None:
    for ex in B.exercicios(c):
        if B.linha(c, ex).get_attribute("data-aberto") == "1":
            B.linha(c, ex).locator("[data-exercicio-abrir]").click()
            c.pg.wait_for_timeout(250)


def series_com_peso(c, ex_id: str, peso: str, quantas: int | None = None) -> int:
    """Preenche o peso e dá OK nas séries do exercício (todas ou `quantas`). Devolve quantas recebeu OK."""
    B.abrir_exercicio(c, ex_id)
    feitas = 0
    while quantas is None or feitas < quantas:
        l = B.linha(c, ex_id)
        oks = l.locator("[data-serie-ok]")
        if oks.count() == 0:
            break
        aberta = l.locator("[data-serie]:not([data-serie-feita])").first
        if aberta.locator("input[aria-label^='Tempo']").count():  # corrida: tempo e distância
            aberta.locator("input[aria-label^='Tempo']").fill("05:30")
            aberta.locator("input[aria-label^='Distância']").fill("1")
            aberta.locator("input[aria-label^='Distância']").blur()
        else:
            campo = aberta.locator("input[aria-label^='Peso']")
            campo.fill(peso)
            campo.blur()
        c.pg.wait_for_timeout(200)
        oks.first.click()
        feitas += 1
        c.pg.wait_for_timeout(350)
        if quantas is None or feitas < quantas:
            B.pular_descanso(c)
    return feitas


# hml-28 (H-169): a fileira dos 3 botões da folha "Descanso" ([data-descanso-pausar], [data-descanso-recomecar] e
# [data-descanso-menos15-ajuste]). A borda ÚTIL = o conteúdo do pai da fileira (a raiz [data-ajustes-descanso], já dentro do px-5 do
# PainelDeslizante); o corpo da folha (o 1º ancestral que rola) não pode rolar para o lado. O scrollWidth do documento sozinho não
# acusa: a folha é fixa e o "−15 s" que passava (10,5 px em 390) caía no padding — por isso cada botão × a borda útil.
MEDIR_DESCANSO = """() => {
  const bs = ['pausar', 'recomecar', 'menos15-ajuste'].map((s) => document.querySelector(`[data-painel] [data-ajustes-descanso] [data-descanso-${s}]`));
  if (bs.some((b) => !b)) return { botoes: [] };
  const fil = bs[0].parentElement, pai = fil.parentElement, c = (x) => Math.round(x * 100) / 100;
  let corpo = pai;
  while (corpo && corpo !== document.body && getComputedStyle(corpo).overflowX === 'visible') corpo = corpo.parentElement;
  const cs = getComputedStyle(pai), r = pai.getBoundingClientRect();
  return {
    tela: innerWidth, doc: document.documentElement.scrollWidth, fileira: [fil.clientWidth, fil.scrollWidth],
    corpo: corpo && corpo !== document.body ? [corpo.clientWidth, corpo.scrollWidth] : null,
    util: [c(r.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth)), c(r.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth))],
    pausar: bs[0].textContent.trim(),
    botoes: bs.map((b) => { const q = b.getBoundingClientRect(); return [c(q.left), c(q.right)]; }),
  };
}"""


def fileira_descanso_cabe(m: dict, largura: int) -> bool:
    """Com o descanso pausado ("Continuar", o estado mais largo), os 3 botões, cada um dentro da borda útil (0,5 px de folga do
    arredondamento) e da tela; a fileira e o corpo da folha sem rolar para o lado; a tela e o documento na largura."""
    bts = m.get("botoes") or []
    return (m.get("pausar") == "Continuar" and len(bts) == 3 and m.get("corpo") is not None
            and all(b[0] >= m["util"][0] - 0.5 and b[1] <= m["util"][1] + 0.5 and b[1] <= m["tela"] for b in bts)
            and m["fileira"][1] <= m["fileira"][0] and m["corpo"][1] <= m["corpo"][0] and m["tela"] <= largura and m["doc"] <= largura)


def descanso_pausado_cabe(c) -> None:
    """hml-28 (H-169): com a folha "Descanso" aberta, toca "Pausar" (vira "Continuar") e mede a fileira em 390 × 844 e em 360 × 800;
    depois volta a 390 × 844 e toca "Continuar" (o descanso volta a correr e o caso segue como antes). Sem exceção: um botão
    desligado (o descanso já acabou) vira check falho, não derruba o caso (a limpeza do staging vem depois)."""
    sel = "[data-ajustes-descanso] [data-descanso-pausar]"
    if c.pg.locator(sel).count() == 1 and c.pg.locator(sel).is_enabled():
        c.pg.locator(sel).click()
    pausou = c.esperar(lambda: B.texto(c, sel) == "Continuar", 5)
    try:
        for largura, altura in ((390, 844), (360, 800)):
            c.pg.set_viewport_size({"width": largura, "height": altura})
            c.pg.wait_for_timeout(500)   # a troca de tamanho e o toque assentam (o botão afunda por 150 ms no toque)
            m = c.pg.evaluate(MEDIR_DESCANSO)
            p.check(pausou and fileira_descanso_cabe(m, largura),
                    f"a fileira do Descanso ({m.get('pausar')!r}) cabe em {largura} px: cada botão dentro da borda útil {m.get('util')} "
                    f"(esquerda, direita = {m.get('botoes')}); fileira e corpo client/scroll = {m.get('fileira')} {m.get('corpo')}; "
                    f"scrollWidth do documento = {m.get('doc')}")
            c.print(f"descanso_continuar_{largura}")
    finally:
        c.pg.set_viewport_size({"width": 390, "height": 844})
        c.pg.wait_for_timeout(300)
    if B.texto(c, sel) == "Continuar":
        c.pg.locator(sel).click()
    p.check(c.esperar(lambda: B.texto(c, sel) == "Pausar", 5), f"'Continuar' volta o descanso a correr ({B.texto(c, sel)!r})")


# hml-28 (achado da W, a decisão de 16/10 08:12): a faixa Seg–Dom da aba Treino (FaixaSemana.tsx, [data-faixa-semana]). Os 7 dias de 44 px +
# gap 4 = 332 px; em 360 px a página (px-[18px]) dá 324 e o "Dom" passava 8 px da borda útil. A borda ÚTIL = o conteúdo do pai da fileira
# (a <section>, sem padding: o conteúdo da página). Cabendo, os 44 px de hoje; não cabendo, os 7 encolhem por igual (sem cortar o conteúdo).
MEDIR_FAIXA = """() => {
  const dias = [...document.querySelectorAll('[data-faixa-semana] [data-dia-estado]')];
  if (dias.length !== 7) return { dias: [] };
  const fil = dias[0].parentElement, pai = fil.parentElement, cs = getComputedStyle(pai), r = pai.getBoundingClientRect();
  const c = (x) => Math.round(x * 100) / 100;
  return {
    tela: innerWidth, doc: document.documentElement.scrollWidth, fileira: [fil.clientWidth, fil.scrollWidth],
    util: [c(r.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth)), c(r.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth))],
    dias: dias.map((d) => { const q = d.getBoundingClientRect(); return [c(q.left), c(q.right), d.clientWidth, d.scrollWidth]; }),
  };
}"""


def faixa_cabe(m: dict, largura: int) -> bool:
    """Os 7 dias, cada um dentro da borda útil (0,5 px de folga do arredondamento) e sem o conteúdo sair dele; a mesma largura nos 7
    (0,5 px), nunca mais de 44 px e, cabendo (útil ≥ 332 px), os 44 px de hoje; a fileira sem rolar; a tela e o documento na largura."""
    ds = m.get("dias") or []
    if len(ds) != 7:
        return False
    ws = [d[1] - d[0] for d in ds]
    cabe_44 = m["util"][1] - m["util"][0] >= 332
    return (all(d[0] >= m["util"][0] - 0.5 and d[1] <= m["util"][1] + 0.5 and d[3] <= d[2] + 1 for d in ds)
            and max(ws) - min(ws) <= 0.5 and max(ws) <= 44.5 and (not cabe_44 or min(ws) >= 43.5)
            and m["fileira"][1] <= m["fileira"][0] and m["tela"] <= largura and m["doc"] <= largura)


def faixa_cabe_em_390_e_360(c) -> None:
    """hml-28: mede a faixa Seg–Dom em 390 × 844 e em 360 × 800 (set_viewport_size) e volta a 390 × 844 (o caso segue como antes)."""
    try:
        for largura, altura in ((390, 844), (360, 800)):
            c.pg.set_viewport_size({"width": largura, "height": altura})
            c.pg.wait_for_timeout(400)
            m = c.pg.evaluate(MEDIR_FAIXA)
            ds = m.get("dias") or []
            p.check(faixa_cabe(m, largura),
                    f"a faixa Seg–Dom cabe em {largura} px: os 7 dias dentro da borda útil {m.get('util')} (o 1º {ds[0][:2] if ds else None}, o último "
                    f"{ds[-1][:2] if ds else None}; larguras {sorted({round(d[1] - d[0], 2) for d in ds})}); fileira client/scroll = {m.get('fileira')}; "
                    f"scrollWidth do documento = {m.get('doc')}")
            if largura == 360:
                c.print("faixa_360")
    finally:
        c.pg.set_viewport_size({"width": 390, "height": 844})
        c.pg.wait_for_timeout(300)


# hml-28 F5: o build de STAGING (vite build com VITE_DB_SCHEMA=staging — o site de teste e o vite preview do dist/) fica SEM PowerSync desde a
# hml-04c (H-14, src/lib/powersync/instancia.ts: PROD e schema ≠ public → ""): nada sincroniza, o banco local do aparelho fica vazio e a aba
# Treino fica no esqueleto "Baixando o seu treino" (o primeiroSync do Treino.tsx) — sem o treino do profissional, sem séries e sem a fila que
# sobe. Nesse build o treino_dia prova o que não depende do banco local (a faixa Seg–Dom e a folha "Descanso") e o que precisa do treino no
# aparelho fica PULADO, com o motivo (fora do placar; os casos inteiros, sem login nem gravação). O /health.json só existe no build
# (vite.config.ts, apply: "build") e diz o schema; sem ele (o vite dev) ou com o public, o fluxo de sempre.
SEM_POWERSYNC = {"sim": False}
PULADOS: list[str] = []
MOTIVO_SEM_POWERSYNC = "o build de staging não tem PowerSync (H-14): sem o treino no aparelho nem a fila que sobe"
PRECISAM_DO_POWERSYNC = {
    "historico": "terminar um treino, o calendário do mês, o detalhe, compartilhar e excluir",
    "funcoes": "ficha, histórico, anotações, academia, séries, reordenar e 'Montar o meu'",
    "sem_profissional": "o vazio com 'Montar o meu' e 'Usar um treino pronto' (sem o 1º sync a aba fica no esqueleto)",
    "sem_internet": "o aviso sem internet com as mudanças esperando na fila",
}
PULADOS_DO_TREINO_DIA = (
    "o treino do profissional no dia, as miniaturas e 'Começar treino' (3 checks)",
    "as séries com peso e OK, os feitos com ✓, o atual 'Série 3 de 3' com a carga, o card '2 de N', a pílula e o card do descanso (8 checks)",
    "o exercício aberto com S1 e S2 feitas (1 check)",
    "o fim do treino: 'Treino foi concluído?', 'Treino finalizado!', compartilhar e TREINO CONCLUÍDO (5 checks)",
    "a volta da internet e a subida para o staging: a fila, as séries, o histórico e o concluído (4 checks)",
)
# o descanso como o app o guarda no aparelho quando uma série recebe OK (useDescanso.ts: LS_DESCANSO e o EstadoDescansoSalvo); a aba Treino o
# retoma ao montar ("o descanso sobrevive a recarregar"). O startedAt é o relógio da página; 3 min de descanso, correndo.
DESCANSO_SEMEADO = {"ativo": True, "startedAt": 0, "pausedRemaining": 180, "isPaused": False, "duracao": 180,
                    "exercicioNome": "Supino reto (teste E2E)", "numeroSerie": 2, "serieId": "e2e-hml28-descanso",
                    "depois": "série 3 do Supino reto (teste E2E)"}
SEMEAR_DESCANSO = "(s) => localStorage.setItem('physiq_rest_timer', JSON.stringify({ ...s, startedAt: Date.now() }))"


def build_sem_powersync(base: str) -> bool:
    """O build em `base` é o de staging (o /health.json com "schema": "staging") → sem PowerSync (H-14)."""
    try:
        with urllib.request.urlopen(f"{base.rstrip('/')}/health.json", timeout=20) as r:
            return json.loads(r.read().decode("utf-8")).get("schema") == "staging"
    except Exception:  # noqa: BLE001 — sem o arquivo (o vite dev) ou fora do ar: o fluxo de sempre
        return False


def pulado(texto: str) -> None:
    """O que o build não deixa provar: fora do placar (nem ✅ nem ❌), numa linha ⏭️ e no total do fim."""
    PULADOS.append(texto)
    print(f"⏭️ pulado: {texto}", flush=True)


def treino_dia_sem_powersync(nav, a) -> None:
    """hml-28 F5 (o build sem PowerSync): a aba no esqueleto, a faixa Seg–Dom em 390 e 360 px e a folha "Descanso" com o descanso guardado no
    aparelho (recarregar traz o cartão de volta), com os checks do H-169; o resto do treino_dia fica PULADO. Nada vai ao banco (o descanso só
    mexe no localStorage); a limpeza do staging roda no fim do mesmo jeito."""
    desde = B.agora_iso()
    c = B.Caso(nav, a.base, a.prefixo, "treino_dia", desktop=False)
    try:
        c.entrar(B.ALUNO, "/treino", zerar=True)
        c.fechar_avisos()
        abriu = c.esperar(lambda: c.tem("[data-aba-treino]") and c.pg.locator("[data-faixa-semana] [data-dia-estado]").count() == 7, 60)
        p.check(abriu, "[treino_dia] a aba Treino abriu já logada, com a faixa Seg–Dom")
        p.check("Entrar com o Google" not in c.texto() and not c.caminho().startswith("/entrar"), "[treino_dia] não caiu na tela de entrada")
        esqueleto = '[data-aba-treino] [data-estado="carregando"][aria-label="Baixando o seu treino"]'
        p.check(c.esperar(lambda: c.tem(esqueleto), 10) and not c.tem("[data-cartao-treino]") and not c.tem("[data-sem-treino-dia]"),
                "build sem PowerSync (H-14): a aba no esqueleto 'Baixando o seu treino', sem o cartão do treino (o esperado)")
        p.check(c.pg.locator("[data-dia-estado]").count() == 7, "faixa Seg–Dom com os 7 dias")
        c.print("treino_dia")
        # hml-28: em 360 px o "Dom" da faixa passava 8 px da borda útil da página; os 7 dias têm de caber em 390 e em 360 px
        faixa_cabe_em_390_e_360(c)
        # o descanso guardado no aparelho → recarregar → a aba retoma o cartão do descanso (correndo)
        c.pg.evaluate(SEMEAR_DESCANSO, DESCANSO_SEMEADO)
        c.pg.reload(wait_until="domcontentloaded")
        c.fechar_avisos()
        p.check(c.esperar(lambda: c.tem('[data-descanso="correndo"]') and c.tem("[data-descanso-ajustes]"), 30),
                f"o cartão do descanso volta ao recarregar (o descanso guardado no aparelho): '{B.texto(c, '[data-descanso-depois]')}'")
        c.print("descanso_cartao")
        c.pg.locator("[data-descanso-ajustes]").click()
        c.esperar(lambda: c.tem("[data-ajustes-descanso]"), 6)
        p.check(c.tem("[data-descanso-pausar]") and c.tem("[data-descanso-som]") and c.tem("[data-descanso-duracao]"), "ajustes do descanso: pausar, recomeçar, tempo e o som")
        cortados = c.pg.evaluate("() => [...document.querySelectorAll('[data-ajustes-descanso] button')].filter(b => b.offsetWidth && b.scrollWidth > b.clientWidth + 1).map(b => b.textContent.trim())")
        p.check(not cortados, f"os botões do descanso cabem sem cortar o texto ({cortados})")
        c.print("descanso_ajustes")
        # hml-28 (H-169): com o descanso pausado, o "−15 s" passava 10,5 px da borda útil em 390 px e saía em parte da tela em 360 px
        descanso_pausado_cabe(c)
        dur0 = B.texto(c, "[data-descanso-duracao]")
        c.pg.locator("[data-descanso-tempo-mais]").click()
        c.pg.wait_for_timeout(300)
        p.check(B.texto(c, "[data-descanso-duracao]") != dur0, f"ajustar o tempo do descanso ({dur0} → {B.texto(c, '[data-descanso-duracao]')})")
        c.pg.keyboard.press("Escape")
        c.pg.wait_for_timeout(400)
        c.pg.locator("[data-descanso-pular]").click()
        p.check(c.esperar(lambda: not c.tem("[data-descanso]"), 6) and c.pg.evaluate("() => localStorage.getItem('physiq_rest_timer')") is None,
                "'Pular' fecha o descanso (nada fica guardado no aparelho)")
        for parte in PULADOS_DO_TREINO_DIA:
            pulado(f"[treino_dia] {parte} — {MOTIVO_SEM_POWERSYNC}")
    finally:
        c.fim()
        time.sleep(2)
        B.limpar_staging(desde, "treino_dia")


@caso
def caso_treino_dia(nav, a) -> None:
    if SEM_POWERSYNC["sim"]:
        treino_dia_sem_powersync(nav, a)
        return
    desde = B.agora_iso()
    c = B.abrir_treino(nav, a.base, a.prefixo, "treino_dia")
    arquivos_locais(c)
    try:
        B.sem_internet(c)
        p.check(B.escolher_treino_do_dia(c), f"o treino do profissional ({B.GRUPO_NOME}) virou o treino de hoje")
        c.esperar(lambda: c.pg.locator('[data-miniatura="quadro"]').count() >= 3, 12)
        p.check(c.pg.locator('[data-miniatura="quadro"]').count() >= 3, "miniaturas: o 1º quadro da foto do 3D (ou do GIF), com o play")
        p.check(c.tem("[data-comecar-treino]"), "antes de começar: 'Começar treino' no card")
        c.print("treino_dia_inicio")
        exs = B.exercicios(c)
        e1, e2, e3 = exs[0], exs[1], exs[2]
        n1 = series_com_peso(c, e1, "60")
        B.pular_descanso(c)
        n2 = series_com_peso(c, e2, "24")
        B.pular_descanso(c)
        n3 = series_com_peso(c, e3, "14", quantas=2)
        p.check(n1 >= 3 and n2 >= 3 and n3 == 2, f"OK nas séries com peso ({n1} + {n2} + {n3})")
        fechar_linhas_abertas(c)
        c.pg.evaluate("window.scrollTo(0, 0)")
        c.pg.wait_for_timeout(700)
        p.check(B.linha(c, e1).get_attribute("data-exercicio-estado") == "feito" and B.linha(c, e2).get_attribute("data-exercicio-estado") == "feito",
                "os 2 primeiros com ✓ (feitos)")
        l3 = B.linha(c, e3)
        p.check(l3.get_attribute("data-exercicio-estado") == "atual" and "Série 3 de 3" in l3.inner_text(), f"o atual: 'Série 3 de 3' ({l3.locator('[data-exercicio-linha]').inner_text()})")
        p.check("14 kg" in l3.inner_text(), "o atual mostra a carga (14 kg)")
        p.check("60 kg" in B.linha(c, e1).locator("[data-exercicio-linha]").inner_text(), f"feito: '{B.linha(c, e1).locator('[data-exercicio-linha]').inner_text()}'")
        p.check(B.texto(c, "[data-treino-feitos]").startswith("2 de "), f"card: '{B.texto(c, '[data-treino-feitos]')}'")
        p.check(c.tem("[data-pilula-tempo]"), "a pílula vermelha do cronômetro")
        p.check(c.tem("[data-descanso]") and B.texto(c, "[data-descanso-depois]").startswith("Depois: série 3"), f"card do descanso: '{B.texto(c, '[data-descanso-depois]')}'")
        p.check(c.pg.locator('[data-dia-estado]').count() == 7, "faixa Seg–Dom com os 7 dias")
        c.print("treino_dia")
        # hml-28: em 360 px o "Dom" da faixa passava 8 px da borda útil da página; os 7 dias têm de caber em 390 e em 360 px
        faixa_cabe_em_390_e_360(c)
        B.abrir_exercicio(c, e3)
        c.pg.wait_for_timeout(400)
        # as séries acima do card do descanso (que flutua sobre a barra de abas)
        l3.evaluate("el => { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -64); }")  # a pílula flutuante fica acima
        c.pg.wait_for_timeout(400)
        p.check(l3.locator("[data-serie-feita]").count() == 2 and l3.locator("[data-serie-ok]").count() == 1, "exercício aberto: S1 e S2 feitas, S3 com o OK")
        c.print("exercicio_series")
        c.pg.locator("[data-descanso-ajustes]").click()
        c.esperar(lambda: c.tem("[data-ajustes-descanso]"), 6)
        p.check(c.tem("[data-descanso-pausar]") and c.tem("[data-descanso-som]") and c.tem("[data-descanso-duracao]"), "ajustes do descanso: pausar, recomeçar, tempo e o som")
        cortados = c.pg.evaluate("() => [...document.querySelectorAll('[data-ajustes-descanso] button')].filter(b => b.offsetWidth && b.scrollWidth > b.clientWidth + 1).map(b => b.textContent.trim())")
        p.check(not cortados, f"os botões do descanso cabem sem cortar o texto ({cortados})")
        c.print("descanso_ajustes")
        # hml-28 (H-169): com o descanso pausado, o "−15 s" passava 10,5 px da borda útil em 390 px e saía em parte da tela em 360 px
        descanso_pausado_cabe(c)
        dur0 = B.texto(c, "[data-descanso-duracao]")
        c.pg.locator("[data-descanso-tempo-mais]").click()
        c.pg.wait_for_timeout(300)
        p.check(B.texto(c, "[data-descanso-duracao]") != dur0, f"ajustar o tempo do descanso ({dur0} → {B.texto(c, '[data-descanso-duracao]')})")
        c.pg.keyboard.press("Escape")
        c.pg.wait_for_timeout(400)
        # termina o treino: a última série → "Treino foi concluído?"
        l3.locator("[data-serie-ok]").first.click()
        for ex in B.exercicios(c)[3:]:
            series_com_peso(c, ex, "10")
            B.pular_descanso(c)
        p.check(c.esperar(lambda: c.tem("[data-fim-texto]"), 10), "'Treino foi concluído?' quando a última série recebe OK")
        c.print("treino_pergunta_fim")
        c.pg.locator("[data-fim-sim]").click()
        p.check(c.esperar(lambda: c.tem("[data-treino-finalizado]"), 12), "'Treino finalizado!' com duração, exercícios, séries e volume")
        c.print("treino_concluido")
        c.pg.locator("[data-concluido-compartilhar]").click()
        p.check(c.esperar(lambda: c.pg.locator('[data-compartilhar-previa="1"]').count() == 1, 20), "a imagem do treino para compartilhar ou salvar na galeria")
        p.check(c.tem("[data-compartilhar-enviar]") and c.tem("[data-compartilhar-salvar]"), "Compartilhar e Salvar na galeria")
        c.print("compartilhar")
        c.pg.keyboard.press("Escape")
        c.pg.wait_for_timeout(400)
        p.check(c.esperar(lambda: c.tem("[data-treino-feito]"), 6), "card: TREINO CONCLUÍDO")
        pend = B.fila_pendente(c)
        B.sem_internet(c, False)
        p.check(B.esperar_fila_vazia(c, 120), f"com a internet de volta, a fila ({pend} mudanças) subiu")
        ok = B.esperar_staging(lambda: B.conta_staging("tb_treino_series", desde, "updated_at", f"and concluida and peso = 60 and exercicio_id = '{e1}'") >= 3, 60)
        p.check(ok, "staging: as séries do 1º exercício com 60 kg e OK")
        p.check(B.conta_staging("treino_historico", desde) == 1, "staging: o treino no histórico")
        p.check(B.conta_staging("tb_treino_concluido", desde) == 1, "staging: o treino de hoje concluído")
    finally:
        c.fim()
    time.sleep(2)
    B.limpar_staging(desde, "treino_dia")


@caso
def caso_historico(nav, a) -> None:
    """Sem internet: termina um treino rápido e abre o calendário; detalhe, compartilhar e excluir."""
    desde = B.agora_iso()
    c = B.abrir_treino(nav, a.base, a.prefixo, "historico")
    arquivos_locais(c)
    try:
        B.sem_internet(c)
        B.escolher_treino_do_dia(c)
        ex = B.exercicios(c)[0]
        B.abrir_exercicio(c, ex)
        c.pg.locator("[data-comecar-treino]").click()
        c.esperar(lambda: c.tem("[data-pilula-tempo]"), 6)
        c.pg.locator("[data-pilula-tempo]").click()
        c.esperar(lambda: c.tem("[data-cronometro-concluir]"), 6)
        c.print("cronometro_folha")
        c.pg.locator("[data-cronometro-concluir]").click()
        c.esperar(lambda: c.tem("[data-treino-finalizado]"), 10)
        c.pg.locator("[data-concluido-fechar]").click()
        c.pg.locator("[data-treino-historico]").click()
        p.check(c.esperar(lambda: c.tem("[data-historico-treinos]"), 8), "o calendário (Histórico) abre pela aba Treino")
        hoje = B.hoje().isoformat()
        p.check(c.esperar(lambda: c.pg.locator(f'[data-cal-dia="{hoje}"][data-cal-treinou="1"]').count() == 1, 10), "hoje marcado no calendário")
        p.check(c.esperar(lambda: c.pg.locator("[data-historico-item]").count() >= 1, 10), "o treino na lista do mês")
        c.print("historico")
        c.pg.locator("[data-historico-item]").first.click()
        p.check(c.esperar(lambda: c.tem("[data-historico-detalhe]"), 8), "o detalhe: duração, academia, volume e média")
        c.print("historico_detalhe")
        c.pg.locator("[data-historico-compartilhar]").click()
        p.check(c.esperar(lambda: c.tem("[data-sheet-compartilhar]"), 8), "compartilhar pelo histórico")
        c.pg.keyboard.press("Escape")
        c.pg.wait_for_timeout(500)
        if not c.tem("[data-historico-detalhe]"):
            c.pg.locator("[data-historico-item]").first.click()
            c.esperar(lambda: c.tem("[data-historico-detalhe]"), 8)
        antes = c.pg.locator("[data-historico-item]").count()
        c.pg.locator("[data-historico-excluir]").click()
        c.pg.locator("[data-historico-excluir-confirmar]").click()
        c.esperar(lambda: c.pg.locator("[data-historico-item]").count() == antes - 1, 8)
        p.check(c.pg.locator("[data-historico-item]").count() == antes - 1, "excluir tira o treino do histórico")
        c.pg.locator("[data-historico-voltar]").click()
        p.check(c.esperar(lambda: c.tem("[data-cartao-treino]"), 6), "voltar ao treino")
        B.sem_internet(c, False)
        p.check(B.esperar_fila_vazia(c, 120), "a fila subiu")
        p.check(B.esperar_staging(lambda: B.conta_staging("treino_historico", desde) == 0, 30), "staging: o treino excluído não ficou no histórico")
    finally:
        c.fim()
    time.sleep(2)
    B.limpar_staging(desde, "historico")


@caso
def caso_funcoes(nav, a) -> None:
    desde = B.agora_iso()
    c = B.abrir_treino(nav, a.base, a.prefixo, "funcoes")
    arquivos_locais(c)
    try:
        B.sem_internet(c)
        B.escolher_treino_do_dia(c)
        exs = B.exercicios(c)
        e1 = exs[0]
        # ficha com o boneco 3D (o exercício com 3D — hoje os 157 globais) ou o GIF; sem WebGL (o navegador sem tela do teste) o
        # boneco cai na foto do 3D com "3D indisponível neste aparelho" — o mesmo critério do e2e/hml15/csp.py
        B.abrir_exercicio(c, e1)
        B.linha(c, e1).locator('[data-acao-exercicio="ficha"]').click()
        p.check(c.esperar(lambda: c.tem("[data-ficha-3d][data-3d='pronto']") or c.tem("[data-ficha-3d][data-3d='indisponivel'] img")
                          or c.tem("[data-ficha-gif] img"), 45),
                f"ficha do exercício com o boneco 3D (ou a foto dele sem WebGL, ou o GIF) — "
                f"{c.pg.locator('[data-ficha-3d]').first.get_attribute('data-3d') if c.tem('[data-ficha-3d]') else 'GIF'}")
        c.print("ficha")
        c.pg.keyboard.press("Escape")
        c.pg.wait_for_timeout(300)
        # histórico do exercício
        B.linha(c, e1).locator('[data-acao-exercicio="historico"]').click()
        p.check(c.esperar(lambda: c.tem("[data-historico-exercicio]"), 8), "histórico do exercício")
        c.pg.keyboard.press("Escape")
        c.pg.wait_for_timeout(300)
        # anotações (e o pontinho)
        B.linha(c, e1).locator('[data-acao-exercicio="anotacoes"]').click()
        c.esperar(lambda: c.tem("[data-anotacao-texto]"), 8)
        c.pg.locator("[data-anotacao-texto]").fill("Cotovelos fechados — W8")
        c.pg.locator("[data-anotacao-salvar]").click()
        c.esperar(lambda: B.linha(c, e1).locator('[data-acao-exercicio="anotacoes"] [aria-label="tem anotação"]').count() == 1, 6)
        p.check(B.linha(c, e1).locator('[data-acao-exercicio="anotacoes"] [aria-label="tem anotação"]').count() == 1, "anotação salva (o ponto em 'Anotações')")
        # adicionar e tirar série
        n0 = B.linha(c, e1).locator("[data-serie]").count()
        B.linha(c, e1).locator("[data-adicionar-serie]").click()
        c.pg.wait_for_timeout(500)
        p.check(B.linha(c, e1).locator("[data-serie]").count() == n0 + 1, f"adicionar série ({n0} → {n0 + 1})")
        B.linha(c, e1).locator("[data-serie-tirar]").last.click()
        c.pg.wait_for_timeout(500)
        p.check(B.linha(c, e1).locator("[data-serie]").count() == n0, "tirar série")
        # academia
        c.pg.locator("[data-treino-academia]").first.click()
        p.check(c.esperar(lambda: c.tem("[data-sheet-academia]"), 6), "a academia abre pelo card (cargas por academia)")
        c.pg.keyboard.press("Escape")
        c.pg.wait_for_timeout(300)
        # reordenar arrastando
        c.pg.locator("[data-treino-opcoes]").first.click()
        c.esperar(lambda: c.tem("[data-opcoes-treino]"), 6)
        c.pg.get_by_text("Reordenar exercícios").click()
        p.check(c.esperar(lambda: c.tem("[data-reordenando]"), 6), "modo reordenar com as alças")
        ordem0 = B.exercicios(c)
        alca = c.pg.locator(f'[data-arrastavel="{ordem0[0]}"] [data-alca-arrastar]')
        alca.scroll_into_view_if_needed()
        c.pg.evaluate("window.scrollBy(0, -120)")
        c.pg.wait_for_timeout(300)
        alvo = c.pg.locator(f'[data-arrastavel="{ordem0[1]}"]')
        b1, b2 = alca.bounding_box(), alvo.bounding_box()
        x, y = b1["x"] + b1["width"] / 2, b1["y"] + b1["height"] / 2
        ty = b2["y"] + b2["height"] * 0.8
        c.pg.mouse.move(x, y)
        c.pg.mouse.down()
        c.pg.wait_for_timeout(200)
        for i in range(1, 21):
            c.pg.mouse.move(x, y + (ty - y) * i / 20)
            c.pg.wait_for_timeout(40)
        c.pg.wait_for_timeout(300)
        c.pg.mouse.up()
        c.pg.wait_for_timeout(900)
        ordem1 = B.exercicios(c)
        p.check(ordem1 != ordem0 and ordem1.index(ordem0[0]) > 0, f"arrastar mudou a ordem ({ordem0[0][:6]} foi para a posição {ordem1.index(ordem0[0]) + 1})")
        c.print("reordenar")
        c.pg.locator("[data-reordenar-pronto]").click()
        # Montar o meu: treino e exercício próprios → viram o treino do dia
        c.pg.locator("[data-treino-opcoes]").first.click()
        c.esperar(lambda: c.tem("[data-opcoes-treino]"), 6)
        c.pg.get_by_text("Trocar o treino do dia").click()
        c.esperar(lambda: c.tem("[data-montar-o-meu]"), 6)
        c.pg.locator("[data-montar-o-meu]").click()
        c.esperar(lambda: c.tem("[data-meu-treino]"), 6)
        p.check(c.pg.locator("[data-meu-treino-salvar]").is_disabled(), "negativo: sem nome e sem exercícios não salva")
        c.pg.locator("[data-meu-treino-nome]").fill("Meu treino W8")
        c.pg.locator('[data-bloco="peito"]').click()
        c.pg.locator("[data-opcao-exercicio] button[aria-pressed]").nth(0).click()
        c.pg.locator("[data-opcao-exercicio] button[aria-pressed]").nth(1).click()
        c.pg.locator("[data-novo-exercicio-abrir]").click()
        c.pg.get_by_label("Nome do exercício novo").fill("Flexão com pausa W8")
        c.pg.locator("[data-novo-exercicio-criar]").click()
        c.esperar(lambda: c.pg.get_by_text("Flexão com pausa W8").count() > 0, 6)
        c.pg.locator("[data-opcao-exercicio]", has_text="Flexão com pausa W8").locator("button[aria-pressed]").click()
        c.print("montar_o_meu")
        c.pg.locator("[data-meu-treino-salvar]").click()
        p.check(c.esperar(lambda: c.tem('[data-slot-grupo="Meu treino W8"]'), 10), "'Montar o meu': o treino próprio virou o treino do dia")
        p.check(B.texto(c, "[data-treino-chip]") == "MEU TREINO" and len(B.exercicios(c)) == 3, f"card 'MEU TREINO' com os 3 exercícios ({len(B.exercicios(c))})")
        B.sem_internet(c, False)
        p.check(B.esperar_fila_vazia(c, 120), "a fila subiu")
        p.check(B.esperar_staging(lambda: B.conta_staging("tb_exercicio_comentarios", desde) == 1, 40), "staging: a anotação subiu")
        p.check(B.conta_staging("exercicio_ordem_usuario", desde, "updated_at") >= 2, "staging: a ordem nova subiu")
        p.check(len(B.sql_treino(f"select 1 from staging.tb_grupos_treino_usuario where user_id='{B.USER_TESTE}' and nome='Meu treino W8' and created_at >= '{desde}'")) == 1,
                "staging: o treino próprio subiu")
        p.check(B.conta_staging("tb_exercicios_usuario", desde) == 1, "staging: o exercício próprio subiu")
    finally:
        c.fim()
    time.sleep(2)
    B.limpar_staging(desde, "funcoes")


def garantir_gratis_do_app(conta: str) -> None:
    """O aluno do app sem profissional (a Carla, w7b-treino) nasceu com 7 dias grátis (09/10 → 16/10/2026): vencido, o app abre
    na trava "Seus dias grátis acabaram" e o caso não acha o "Montar o meu" (22/10/2026). Renova o grátis por 30 dias SÓ NO
    STAGING (nunca no public) quando faltam menos de 3 dias — com o `mensalidade_recalcular`, como o W7b depois de mexer no teste."""
    s = B.schema()
    if s != "staging":
        return
    r = B.sql_principal(f"""select p.id::text as id from {s}.pacientes p join auth.users u on u.id = p.user_id
                              where u.email = '{B.CONTAS[conta][0]}' and p.conta_id = {s}.conta_do_app() and p.deleted_at is null
                                and coalesce(p.app_teste_ate, now()) < now() + interval '3 days'
                              order by p.created_at desc limit 1""")
    if r:
        B.sql_principal(f"""update {s}.pacientes set app_teste_ate = now() + interval '30 days' where id = '{r[0]["id"]}';
                            select {s}.mensalidade_recalcular('{r[0]["id"]}')""")
        print(f"   o grátis do app da {conta} renovado no staging por 30 dias")


@caso
def caso_sem_profissional(nav, a) -> None:
    garantir_gratis_do_app("w7b-treino")
    c = B.abrir_treino(nav, a.base, a.prefixo, "sem_profissional", conta="w7b-treino")
    arquivos_locais(c)
    try:
        c.esperar(lambda: c.tem("[data-sem-treino-montar]"), 20)
        p.check(c.tem("[data-sem-treino-montar]") and "Montar o meu" in c.texto(), "aluno sem profissional: 'Montar o meu'")
        p.check(c.tem("[data-sem-treino-pronto]") and "Usar um treino pronto" in c.texto(), "aluno sem profissional: 'Usar um treino pronto'")
        p.check(not c.tem("[data-sem-treino-adicionar]"), "negativo: sem o 'Adicionar treino' de quem tem profissional")
        c.print("sem_profissional")
        c.pg.locator("[data-sem-treino-montar]").click()
        p.check(c.esperar(lambda: c.tem("[data-meu-treino]"), 8), "'Montar o meu' abre o editor do treino próprio")
        c.pg.keyboard.press("Escape")
        c.pg.wait_for_timeout(400)
        c.pg.locator("[data-sem-treino-pronto]").click()
        p.check(c.esperar(lambda: c.caminho().startswith("/perfil/treinos-prontos"), 10), "'Usar um treino pronto' abre os treinos prontos (W7b)")
    finally:
        c.fim()


@caso
def caso_so_nutricao(nav, a) -> None:
    c = B.Caso(nav, a.base, a.prefixo, "so_nutricao", desktop=False)
    c.entrar("w7-paciente", "/treino", zerar=True)
    c.fechar_avisos()
    try:
        ok = c.esperar(lambda: c.tem("[data-tabbar]"), 40)
        c.pg.wait_for_timeout(1500)
        abas = c.pg.locator("[data-tabbar] [data-aba]").all_inner_texts() if c.tem("[data-tabbar]") else []
        p.check(ok and "Treino" not in abas, f"negativo: só Nutrição não tem a aba Treino na barra (abas {abas})")
        p.check(not c.tem("[data-aba-treino]"), "negativo: /treino não abre a aba Treino para quem só tem Nutrição (a trava da W3 responde)")
        c.print("so_nutricao")
    finally:
        c.fim()


@caso
def caso_sem_internet(nav, a) -> None:
    desde = B.agora_iso()
    c = B.abrir_treino(nav, a.base, a.prefixo, "sem_internet")
    arquivos_locais(c)
    try:
        B.sem_internet(c)
        B.escolher_treino_do_dia(c)
        ex = B.exercicios(c)[0]
        series_com_peso(c, ex, "42", quantas=1)
        B.pular_descanso(c)
        c.pg.evaluate("window.scrollTo(0, 0)")
        c.pg.wait_for_timeout(1500)
        p.check(c.tem('[data-sync="offline"]') and "Sem internet" in B.texto(c, "[data-sync]"), f"sem internet: '{B.texto(c, '[data-sync]')}'")
        p.check(B.fila_pendente(c) > 0, f"as mudanças esperam no aparelho ({B.fila_pendente(c)})")
        c.print("sem_internet")
        B.sem_internet(c, False)
        p.check(B.esperar_fila_vazia(c, 120), "volta a internet → a fila esvazia")
        p.check(B.esperar_staging(lambda: B.conta_staging("tb_treino_series", desde, "updated_at", "and peso = 42 and concluida") == 1, 60), "staging: a série de 42 kg com OK subiu")
    finally:
        c.fim()
    time.sleep(2)
    B.limpar_staging(desde, "sem_internet")


# --seco (hml-28): o arquivo → o que tem de estar nele (os seletores, o rótulo e as classes que os checks do H-169 e da faixa usam)
NO_CODIGO = {
    "src/treino/ui/CartaoDescanso.tsx": ['className="@container flex flex-col gap-4 pt-1" data-ajustes-descanso',
                                         'className="grid grid-cols-2 gap-2 @min-[360px]:grid-cols-[1fr_1fr_auto]"',
                                         'className="col-span-2 px-4 @min-[360px]:col-span-1"', "data-descanso-pausar", "data-descanso-recomecar",
                                         "data-descanso-menos15-ajuste", '{d.pausado ? "Continuar" : "Pausar"}', "data-descanso-ajustes"],
    "src/ui/premium/Sheet.tsx": ["data-painel={lado}", 'className="min-h-0 flex-1 overflow-y-auto px-5 pb-5"'],
    # a faixa Seg–Dom (o achado da W): os seletores do check e o dia sem o flex-none (os 7 encolhem por igual quando não cabem)
    "src/treino/ui/FaixaSemana.tsx": ["data-faixa-semana={deslocamento}", "data-dia-estado={estado}", 'className="flex justify-between gap-1"',
                                      '"relative flex h-[62px] w-[44px] flex-col items-center justify-center gap-1 rounded-2xl border text-[11px] font-semibold transition-colors"'],
    # hml-28 F5, o caminho do build sem PowerSync: a regra da instância, o esqueleto do 1º sync, o descanso guardado no aparelho (a chave, a aba
    # que o retoma ao montar, o estado e o Pular do cartão) e o health.json do build com o schema
    "src/lib/powersync/instancia.ts": ['if (env.PROD && schema !== "public") return "";'],
    "src/app-aluno/abas/Treino.tsx": ["const primeiroSync = !status.hasSynced && vazio", 'rotulo="Baixando o seu treino"', "ativo: descansoGuardadoAtivo(),"],
    "src/treino/useDescanso.ts": ['export const LS_DESCANSO = "physiq_rest_timer";'],
    "src/ui/premium/Estados.tsx": ['aria-label={rotulo} data-estado="carregando"'],
    "src/treino/ui/CartaoDescanso.tsx#cartao": ['data-descanso={d.acabou ? "acabou" : d.pausado ? "pausado" : "correndo"}', "data-descanso-pular"],
    "vite.config.ts": ['name: "physiq-health",', 'fileName: "health.json"', "schema: SCHEMAS_DO_BANCO.includes(schema) ? schema : null,"],
}
# as medidas da sonda da hml-28 (réplica com as classes do código, Chromium 153 = Edge 154): o código de antes com "Continuar" e o corrigido
_ANTES = {"pausar": "Continuar", "botoes": [[21, 152.64], [160.64, 302.58], [310.58, 379.5]]}
_DEPOIS = {"pausar": "Continuar"}
MEDIDAS_DA_SONDA = {
    "antes_390": {**_ANTES, "tela": 390, "doc": 390, "util": [21, 369], "fileira": [348, 359], "corpo": [388, 388]},
    "antes_360": {**_ANTES, "tela": 360, "doc": 360, "util": [21, 339], "fileira": [318, 359], "corpo": [358, 379]},
    "depois_390": {**_DEPOIS, "tela": 390, "doc": 390, "util": [21, 369], "fileira": [348, 348], "corpo": [388, 388],
                   "botoes": [[21, 191], [199, 369], [21, 369]]},
    "depois_360": {**_DEPOIS, "tela": 360, "doc": 360, "util": [21, 339], "fileira": [318, 318], "corpo": [358, 358],
                   "botoes": [[21, 176], [184, 339], [21, 339]]},
}
# a faixa Seg–Dom na sonda da hml-28 (a página com as classes do código): antes e depois em 360 px; os 44 px de hoje em 390 (antes = depois)
MEDIDAS_DA_FAIXA = {
    "antes_360": {"tela": 360, "doc": 360, "util": [18, 342], "fileira": [324, 332],
                  "dias": [[18, 62, 42, 42], [66, 110, 42, 42], [114, 158, 42, 42], [162, 206, 42, 42], [210, 254, 42, 42], [258, 302, 42, 42], [306, 350, 42, 42]]},
    "depois_360": {"tela": 360, "doc": 360, "util": [18, 342], "fileira": [324, 324],
                   "dias": [[18, 60.86, 41, 41], [64.86, 107.7, 41, 41], [111.7, 154.56, 41, 41], [158.56, 201.42, 41, 41], [205.42, 248.28, 41, 41],
                            [252.28, 295.14, 41, 41], [299.14, 342, 41, 41]]},
    "hoje_390": {"tela": 390, "doc": 390, "util": [18, 372], "fileira": [354, 354],
                 "dias": [[18, 62, 42, 42], [69.67, 113.67, 42, 42], [121.33, 165.33, 42, 42], [173, 217, 42, 42], [224.67, 268.67, 42, 42],
                          [276.33, 320.33, 42, 42], [328, 372, 42, 42]]},
}


def seco() -> int:
    """Sem navegador e sem rede (o socket fica bloqueado): os seletores e as classes do H-169 e da faixa no código e as regras dos checks."""
    def sem_rede(*_a, **_k):
        raise RuntimeError("--seco não usa a rede")

    socket.socket.connect = sem_rede  # type: ignore[method-assign]
    raiz = Path(__file__).resolve().parents[2]

    def fonte(arq: str) -> str:  # "arquivo#rótulo": o mesmo arquivo em mais de uma entrada
        f = raiz / arq.split("#")[0]
        return f.read_text(encoding="utf-8") if f.exists() else ""

    falta = [f"{arq} › {x}" for arq, itens in NO_CODIGO.items() for x in itens if x not in fonte(arq)]
    total = sum(len(v) for v in NO_CODIGO.values())
    p.check(not falta, f"seco: {total - len(falta)}/{total} seletores, rótulos e classes dos checks do H-169, da faixa e do build sem PowerSync no código"
            + (f" — falta: {falta}" if falta else ""))
    m = re.search(r"export interface EstadoDescansoSalvo \{(.*?)\n\}", fonte("src/treino/useDescanso.ts"), re.S)
    campos = re.findall(r"^\s+(\w+)\??:", m.group(1), re.M) if m else []
    p.check(bool(campos) and set(campos) == set(DESCANSO_SEMEADO),
            f"seco: o descanso semeado no build sem PowerSync tem os campos do EstadoDescansoSalvo (useDescanso.ts): {sorted(campos)}")
    M = MEDIDAS_DA_SONDA
    p.check(not fileira_descanso_cabe(M["antes_390"], 390) and not fileira_descanso_cabe(M["antes_360"], 360),
            "seco: a regra acusa o código de antes ('Continuar': o −15 s até 379,5 px, a útil 369 em 390 e 339 em 360)")
    p.check(fileira_descanso_cabe(M["depois_390"], 390) and fileira_descanso_cabe(M["depois_360"], 360),
            "seco: a regra passa no corrigido (o −15 s na 2ª linha com a largura toda; cada botão dentro da útil em 390 e em 360)")
    p.check(not fileira_descanso_cabe({**M["depois_390"], "pausar": "Pausar"}, 390) and not fileira_descanso_cabe({"botoes": []}, 390)
            and not fileira_descanso_cabe({**M["depois_390"], "corpo": None}, 390),
            "seco: a regra exige o descanso pausado ('Continuar'), os 3 botões e o corpo da folha (com 'Pausar' ou sem a fileira, falha)")
    FX = MEDIDAS_DA_FAIXA
    p.check(not faixa_cabe(FX["antes_360"], 360) and faixa_cabe(FX["depois_360"], 360) and faixa_cabe(FX["hoje_390"], 390),
            "seco: a regra da faixa acusa o código de antes em 360 px (o 'Dom' até 350, a útil 342) e passa no corrigido (os 7 com 42,86 px) e nos 44 px de 390")
    d390, d360 = FX["hoje_390"]["dias"], FX["depois_360"]["dias"]
    p.check(not faixa_cabe({**FX["hoje_390"], "dias": [[d[0], d[0] + 40, 38, 38] for d in d390]}, 390)
            and not faixa_cabe({**FX["depois_360"], "dias": d360[:6] + [[299.14, 330, 29, 29]]}, 360)
            and not faixa_cabe({**FX["depois_360"], "dias": [[d[0], d[1], 41, 45] for d in d360]}, 360)
            and not faixa_cabe({**FX["depois_360"], "dias": d360[:6]}, 360),
            "seco: a regra da faixa exige os 44 px de hoje quando cabe (encolher em 390 falha), os 7 iguais, o conteúdo dentro do dia e os 7 dias")
    try:
        socket.create_connection(("127.0.0.1", 9), timeout=1)
        bloqueado = False
    except RuntimeError:
        bloqueado = True
    except OSError:
        bloqueado = False
    p.check(bloqueado, "seco: a rede fica bloqueada (nada foi ao banco nem ao site)")
    return p.fim()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:5173")
    ap.add_argument("--prefixo", default="local")
    ap.add_argument("--casos", default=",".join(CASOS))
    ap.add_argument("--canal", default="chromium", choices=("chromium", "msedge", "chrome"))
    ap.add_argument("--seco", action="store_true",
                    help="sem navegador e sem rede: os checks do H-169 e da faixa (seletores, classes e as regras) e as premissas do build sem PowerSync")
    a = ap.parse_args()
    if a.seco:
        return seco()
    B.ESTADO["schema"] = "staging"
    SEM_POWERSYNC["sim"] = build_sem_powersync(a.base)
    print(f"o build em {a.base}: " + ("de STAGING, SEM PowerSync (H-14) — o que precisa do treino no aparelho fica PULADO" if SEM_POWERSYNC["sim"]
                                     else "com PowerSync (ou sem o /health.json) — o fluxo completo"), flush=True)
    with sync_playwright() as pw:
        nav = pw.chromium.launch(channel=a.canal, args=["--no-sandbox", "--disable-dev-shm-usage"])
        for nome in a.casos.split(","):
            print(f"\n== {nome} ==", flush=True)
            if SEM_POWERSYNC["sim"] and nome in PRECISAM_DO_POWERSYNC:
                pulado(f"[{nome}] o caso inteiro: {PRECISAM_DO_POWERSYNC[nome]} — {MOTIVO_SEM_POWERSYNC}")
                continue
            if not B.saude_treino():
                p.check(False, f"[{nome}] Banco do Treino fora do normal — parei (sem reiniciar nada)")
                break
            try:
                CASOS[nome](nav, a)
            except Exception as e:  # noqa: BLE001
                p.check(False, f"[{nome}] exceção: {e!r}"[:400])
            time.sleep(4)
        nav.close()
    if PULADOS:
        print(f"\n⏭️ {len(PULADOS)} pulados (fora do placar) — {MOTIVO_SEM_POWERSYNC}", flush=True)
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
