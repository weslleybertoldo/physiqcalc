#!/usr/bin/env python3
"""Physiq W8 — E2E de TELA da aba Treino nova (tela 2), com os prints no tamanho do app (390 × 844 × 3,4 = 1326 × 2870).

Em série (o Banco do Treino é uma VM Nano), contexto limpo por caso, `/health` antes de cada um. Os fluxos de ESCRITA rodam SEM
INTERNET depois do 1º sync (P20 — ver _base.py) e conferem a subida para o staging na volta; os GIFs e fotos (no APK são
arquivos do próprio app; no site, o service worker guarda) vêm dos arquivos locais também sem internet.

Casos (na ordem):
  treino_dia       aluno do Calc: o treino do profissional no dia → séries com peso e OK (2 exercícios feitos, o 3º com 2 de 3)
                   → tela 2 (card, feitos com ✓, o atual com "Série 3 de 3" e a carga, card do descanso com o anel) → exercício
                   aberto com as séries → ajustes do descanso → termina o treino → "Treino finalizado!" → compartilhar → volta a
                   internet → as séries (peso × reps), o histórico e o concluído sobem para o staging
  historico        o calendário do mês com o treino de hoje, o detalhe, compartilhar e excluir (sem internet; a exclusão sobe)
  funcoes          ficha com GIF, histórico do exercício, anotações (o ponto), academia, adicionar/tirar série, reordenar
                   arrastando (a ordem sobe), "Montar o meu" (treino e exercício próprios viram o treino do dia)
  sem_profissional aluno do app (W7b, sem profissional): "Montar o meu" e "Usar um treino pronto" (abre os treinos prontos)
  so_nutricao      negativo: aluno só de Nutrição não tem a aba Treino (a rota volta para a abertura)
  sem_internet     o aviso "Sem internet · o treino fica salvo no aparelho (N mudanças)"
Uso: python3 e2e/w08/telas.py --base http://localhost:5173 --prefixo local [--casos a,b]
"""
from __future__ import annotations

import argparse
import datetime as dt
import sys
import time
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


def arquivos_locais(c) -> None:
    """GIFs (public/exercicios) e fotos (public/fotos) servidos do disco, com ou sem internet — como no APK."""
    def servir(route):
        rel = route.request.url.split("://", 1)[1].split("/", 1)[1].split("?")[0]
        arq = PUBLICO / rel
        if arq.exists():
            route.fulfill(path=str(arq), content_type="image/webp" if arq.suffix == ".webp" else None)
        else:
            route.continue_()
    c.ctx.route("**/exercicios/**", servir)
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


@caso
def caso_treino_dia(nav, a) -> None:
    desde = B.agora_iso()
    c = B.abrir_treino(nav, a.base, a.prefixo, "treino_dia")
    arquivos_locais(c)
    try:
        B.sem_internet(c)
        p.check(B.escolher_treino_do_dia(c), f"o treino do profissional ({B.GRUPO_NOME}) virou o treino de hoje")
        c.esperar(lambda: c.pg.locator('[data-miniatura="quadro"]').count() >= 3, 12)
        p.check(c.pg.locator('[data-miniatura="quadro"]').count() >= 3, "miniaturas: o 1º quadro do NOSSO GIF, com o play")
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
        # ficha com o GIF
        B.abrir_exercicio(c, e1)
        B.linha(c, e1).locator('[data-acao-exercicio="ficha"]').click()
        p.check(c.esperar(lambda: c.tem("[data-ficha-gif] img"), 8), "ficha do exercício com o GIF")
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


@caso
def caso_sem_profissional(nav, a) -> None:
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


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:5173")
    ap.add_argument("--prefixo", default="local")
    ap.add_argument("--casos", default=",".join(CASOS))
    a = ap.parse_args()
    B.ESTADO["schema"] = "staging"
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        for nome in a.casos.split(","):
            print(f"\n== {nome} ==", flush=True)
            if not B.saude_treino():
                p.check(False, f"[{nome}] Banco do Treino fora do normal — parei (sem reiniciar nada)")
                break
            try:
                CASOS[nome](nav, a)
            except Exception as e:  # noqa: BLE001
                p.check(False, f"[{nome}] exceção: {e!r}"[:400])
            time.sleep(4)
        nav.close()
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
