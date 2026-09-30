#!/usr/bin/env python3
"""Physiq W10 — E2E de TELA da aba Evolução nova (tela 4), em série e em contexto limpo por caso (390 × 844 × 3,4).

A aba lê o Banco do Treino pelo REST no schema do build (local e staging = `staging`) e o principal pela minha_evolucao()
(W10) — a massa dos 2 bancos está toda no `staging` (e2e/w10/massa.py). Nada é gravado pela tela.

Casos (na ordem):
  dois_bancos  w10-aluno: cards Peso/Gordura/M. magra com a variação do 6M, gráfico "De 89,1 kg pra 84,2 kg", "7 avaliações",
               a última ("Avaliação por 7 dobras · 22/09 · Lucas Ferreira, seu personal") → Ver (composição completa),
               a tabela do período (7, o mesmo N do botão; resumo = a conta dos cards: −4,9) e "Ver todas" (8; "Desde a 1ª
               avaliação": −6,1), as 2 origens juntas, em ordem, com o autor; o Ver de uma antropometria da nutri,
               filtro 1A/3M, fotos com cadeado (tocar abre e fecha; a imagem carrega), Comparar (nutri 26/08 × personal set/26)
  so_calc      teste@teste.com: tudo o que o UserDashboard mostrava, NÚMERO A NÚMERO (antes_<prefixo>.json, tirado da tela antiga
               antes do deploy): a composição (perfil), cada avaliação da linha do tempo, as variações e o resumo
  vazia        w7-treino (sem nenhuma avaliação nem foto): o estado vazio certo, sem filtro
  so_nutri     w10-paciente (só Nutrição — sem sessão do Treino): só a antropometria dela, sem aviso de erro
  sem_internet w10-aluno: aberta com internet → sem internet a aba (remontada) mostra o que já foi aberto + o aviso; sem nada
               guardado no aparelho → "Sem conexão"; volta a internet → busca de novo e o aviso some
  rotas        C14: /avaliacao (o ícone "Avaliação" antigo) → /evolucao com a aba nova
Uso: python3 e2e/w10/telas.py --base http://localhost:5173 --prefixo local [--casos a,b] [--antes staging]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

p = B.p
CASOS: dict[str, callable] = {}
ESTADO = {"antes": "staging"}


def caso(f):
    CASOS[f.__name__.removeprefix("caso_")] = f
    return f


def txt(c, seletor: str) -> str:
    loc = c.pg.locator(seletor)
    return loc.first.inner_text() if loc.count() else ""


def painel(c) -> str:
    return txt(c, '[role="dialog"]')


def fechar_painel(c) -> None:
    c.pg.keyboard.press("Escape")
    c.pg.wait_for_timeout(600)


def esperar_dados(c, marca: str = "dados") -> bool:
    return c.esperar(lambda: c.tem(f'[data-aba-evolucao="{marca}"]'), 90)


def rolar_painel(c, px: int) -> None:
    c.pg.evaluate("(px) => { const d = document.querySelector('[role=\"dialog\"] .overflow-y-auto'); if (d) d.scrollTop += px; }", px)
    c.pg.wait_for_timeout(500)


def img_carregou(c, seletor: str) -> bool:
    return bool(c.pg.evaluate("(s) => { const i = document.querySelector(s); return !!i && i.complete && i.naturalWidth > 0; }", seletor))


# ───────────────────────── casos ─────────────────────────

@caso
def caso_dois_bancos(nav, base: str, prefixo: str) -> None:
    c = B.abrir(nav, base, prefixo, "dois_bancos", "w10-aluno")
    try:
        p.check(esperar_dados(c), "a aba mostra a evolução do Diego (Treino + Nutrição)")
        c.pg.wait_for_timeout(1500)
        p.check(c.pg.get_by_role("radio", name="6M").get_attribute("aria-checked") == "true", "abre no 6M (a tela 4)")
        peso, gord, musc = txt(c, '[data-kpi-evolucao="peso"]'), txt(c, '[data-kpi-evolucao="gordura"]'), txt(c, '[data-kpi-evolucao="massaMagra"]')
        p.check("84,2" in peso and "4,9 kg" in peso, f"card Peso: 84,2 kg ↘ 4,9 kg ({peso!r})")
        p.check("15,9" in gord and "5,2 pts" in gord, f"card Gordura: 15,9 % ↘ 5,2 pts ({gord!r})")
        p.check("M. magra" in musc and "70,8" in musc and "0,5 kg" in musc, f"card M. magra: 70,8 kg ↗ 0,5 kg ({musc!r})")
        p.check(txt(c, "[data-grafico-titulo]") == "De 89,1 kg pra 84,2 kg", f"gráfico: {txt(c, '[data-grafico-titulo]')!r}")
        p.check(txt(c, "[data-evolucao-contagem]") == "7 avaliações", f"chip: {txt(c, '[data-evolucao-contagem]')!r} (5 do personal + 2 da nutri no 6M)")
        p.check("22/09" in txt(c, "[data-grafico-balao]"), "balão com o ponto atual (22/09)")
        p.check(c.pg.locator("[data-ponto-atual]").count() == 1, "o ponto atual destacado no gráfico")
        ult = txt(c, "[data-ultima-avaliacao]")
        p.check("Avaliação por 7 dobras" in ult and "22/09 · Lucas Ferreira, seu personal" in ult, f"última avaliação com o autor ({ult!r})")
        p.check(txt(c, "[data-fotos-sessao]") == "Setembro 2026 · Lucas Ferreira, seu personal", f"fotos de progresso: {txt(c, '[data-fotos-sessao]')!r}")
        fechadas = c.pg.locator('[data-fotos-grade] [data-foto-cadeado="fechada"]').count()
        p.check(fechadas == 3, f"Frente, Lado e Costas desfocadas com cadeado ({fechadas})")
        c.print("evolucao")

        # Ver — a composição completa da última (os números atuais do perfil)
        c.pg.locator("[data-ver-avaliacao]").click()
        c.esperar(lambda: c.tem("[data-composicao]"), 10)
        t = painel(c)
        for esperado in ("Composição corporal", "Avaliação por 7 dobras · 22/09 · Lucas Ferreira, seu personal", "7 dobras", "15,9%", "13,4 kg", "70,8 kg",
                         "Masculino", "31 anos", "84,2 kg", "178 cm", "Boa Forma", "Axilar média", "Abdômen", "Panturrilha D", "TMB Katch-McArdle", "1.900",
                         "Ótima evolução no corte"):
            p.check(esperado in t, f"Ver: '{esperado}'")
        c.print("evolucao_ver")
        rolar_painel(c, 900)
        c.print("evolucao_ver_2")
        fechar_painel(c)

        # "N avaliações" — a tabela abre com as do PERÍODO (o mesmo N do botão) e o resumo com a conta dos cards
        card_peso = txt(c, '[data-kpi-evolucao="peso"]')
        c.pg.locator("[data-evolucao-contagem]").click()
        c.esperar(lambda: c.tem("[data-tabela-avaliacoes]"), 10)
        n6 = c.pg.locator("[data-linha-avaliacao]").count()
        p.check(n6 == 7 and "7 avaliações" in painel(c) and c.pg.locator('[data-sheet-avaliacoes="periodo"]').count() == 1,
                f"6M: a tabela abre com as 7 do período — o mesmo N do botão ({n6})")
        origens = c.pg.locator("[data-linha-avaliacao]").evaluate_all("ls => ls.map(l => l.getAttribute('data-linha-origem'))")
        p.check(origens == ["treino", "principal", "treino", "treino", "principal", "treino", "treino"], f"tabela 6M: as 2 origens em ordem de data ({origens})")
        p.check("14/03/26" not in txt(c, "[data-tabela-avaliacoes]"), "6M: o 14/03 (fora dos 6 meses) não entra")
        autores = c.pg.locator("[data-linha-autor]").all_inner_texts()
        p.check(autores[1] == "Pollock 3 · Camila" and autores[0] == "7 dobras · Lucas", f"com o autor de cada uma ({autores[:2]})")
        cel = c.pg.locator('[data-linha-avaliacao] [data-celula="peso"]').first.inner_text()
        p.check("84,2" in cel and "−0,7" in cel, f"variação desde a anterior (a da nutri, 84,9 → 84,2): {cel!r}")
        r_peso = txt(c, '[data-resumo="peso"]')
        p.check(txt(c, "[data-resumo-titulo]").lower() == "resumo do período" and "89,1" in r_peso and "84,2" in r_peso and "−4,9" in r_peso,
                f"resumo do período: Peso 89,1 → 84,2 −4,9 ({r_peso!r})")
        p.check("4,9 kg" in card_peso, f"= o card Peso do mesmo período (↘ 4,9 kg) ({card_peso!r})")
        c.print("evolucao_tabela")
        c.pg.locator("[data-tabela-ver-todas]").evaluate("b => b.scrollIntoView({ block: 'center' })")
        c.pg.wait_for_timeout(600)
        p.check(txt(c, "[data-tabela-ver-todas]") == "Ver todas (8)", f"no fim da lista: {txt(c, '[data-tabela-ver-todas]')!r}")
        c.print("evolucao_tabela_periodo")
        # "Ver todas (8)": o histórico inteiro (C25) e o resumo "Desde a 1ª avaliação"
        c.pg.locator("[data-tabela-ver-todas]").click()
        c.pg.wait_for_timeout(700)
        n = c.pg.locator("[data-linha-avaliacao]").count()
        p.check(n == 8 and "8 avaliações" in painel(c), f"Ver todas: as 8 (6 do personal + 2 da nutricionista) ({n})")
        r_todas = txt(c, '[data-resumo="peso"]')
        p.check(txt(c, "[data-resumo-titulo]").lower() == "desde a 1ª avaliação" and "90,3" in r_todas and "−6,1" in r_todas,
                f"'Desde a 1ª avaliação': Peso 90,3 → 84,2 −6,1 ({r_todas!r})")
        p.check(txt(c, "[data-tabela-ver-periodo]") == "Só os últimos 6 meses (7)", f"e a volta pro período: {txt(c, '[data-tabela-ver-periodo]')!r}")
        # a última linha (14/03, a que só entra em "todas"), o botão de volta e o resumo "Desde a 1ª avaliação"
        c.pg.locator('[data-linha-avaliacao]').last.evaluate("l => l.scrollIntoView({ block: 'start' })")
        c.pg.wait_for_timeout(600)
        p.check("14/03/26" in txt(c, "[data-tabela-avaliacoes]"), "Ver todas: o 14/03 entra")
        c.print("evolucao_tabela_todas")
        c.pg.locator('[data-metrica="gordura"]').click()
        c.pg.wait_for_timeout(500)
        p.check(c.pg.locator('[data-grafico-metrica="gordura"] [data-grafico-pontos]').count() == 1, "gráfico de outra métrica (% de gordura) no painel")
        c.pg.locator('[data-metrica="peso"]').click()
        c.pg.wait_for_timeout(300)
        c.pg.locator("[data-tabela-avaliacoes]").evaluate("t => t.scrollIntoView({ block: 'start' })")
        c.pg.wait_for_timeout(500)
        c.print("evolucao_2bancos")
        # a linha da antropometria abre a composição dela (IMC, protocolo, dobras e circunferências da nutri)
        c.pg.locator('[data-linha-avaliacao="principal:' + B.sql_principal(
            "select a.id::text from staging.antropometrias a join staging.pacientes p on p.id = a.paciente_id join auth.users u on u.id = p.user_id "
            f"where u.email = '{B.EMAIL['w10-aluno']}' and a.data::date = '2026-08-26'")[0]["id"] + '"]').click()
        c.esperar(lambda: c.pg.locator("[data-composicao-origem=\"principal\"]").count() > 0, 10)
        tn = txt(c, '[data-composicao-origem="principal"]')
        for esperado in ("Jackson & Pollock — 3 dobras", "16,8%", "IMC", "Sobrepeso", "Peitoral", "Abdominal", "Cintura", "Abdômen"):
            p.check(esperado in tn, f"Ver da antropometria: '{esperado}'")
        p.check("nota interna" not in tn and "nota interna" not in c.texto(), "a observação interna da nutricionista NÃO aparece")
        c.print("evolucao_ver_nutri")
        fechar_painel(c)
        fechar_painel(c)

        # filtros 1A e 3M
        c.pg.get_by_role("radio", name="1A").click()
        c.pg.wait_for_timeout(500)
        p.check(txt(c, "[data-grafico-titulo]") == "De 90,3 kg pra 84,2 kg" and "6,1 kg" in txt(c, '[data-kpi-evolucao="peso"]'), "1A: De 90,3 kg pra 84,2 kg (↘ 6,1 kg)")
        p.check(txt(c, "[data-evolucao-contagem]") == "8 avaliações", "1A: 8 avaliações")
        c.pg.get_by_role("radio", name="3M").click()
        c.pg.wait_for_timeout(500)
        p.check(txt(c, "[data-grafico-titulo]") == "De 85,5 kg pra 84,2 kg", f"3M: {txt(c, '[data-grafico-titulo]')!r}")
        c.pg.get_by_role("radio", name="6M").click()

        # fotos: o cadeado
        c.pg.locator("[data-fotos-progresso]").scroll_into_view_if_needed()
        c.pg.wait_for_timeout(500)
        c.print("evolucao_fotos_cadeado")
        for slot in ("frente", "lado", "costas"):
            c.pg.locator(f'[data-foto-slot="{slot}"] [data-foto-cadeado]').click()
            c.pg.wait_for_timeout(250)
        abertas = c.pg.locator('[data-fotos-grade] [data-foto-cadeado="aberta"]').count()
        p.check(abertas == 3, f"tocar abre as 3 ({abertas})")
        c.pg.wait_for_timeout(900)
        p.check(all(img_carregou(c, f'[data-foto-slot="{s}"] img') for s in ("frente", "lado", "costas")), "as 3 imagens carregaram (URL assinada do bucket privado)")
        c.print("evolucao_fotos_abertas")
        c.pg.locator('[data-foto-slot="frente"] [data-foto-cadeado]').click()
        p.check(c.pg.locator('[data-foto-slot="frente"] [data-foto-cadeado]').get_attribute("data-foto-cadeado") == "fechada", "tocar de novo esconde")

        # Comparar
        c.pg.locator("[data-comparar]").click()
        c.esperar(lambda: c.tem("[data-sheet-comparar]"), 10)
        antes = c.pg.locator('[data-comparar-data="antes"]').input_value()
        depois = c.pg.locator('[data-comparar-data="depois"]').input_value()
        p.check(antes == "principal:2026-08-26" and depois == "treino:2026-09-01", f"Comparar abre em nutri 26/08 × personal set/26 ({antes} × {depois})")
        p.check(txt(c, '[data-comparar-legenda="antes"]') == "26/08/2026 · nutricionista" and txt(c, '[data-comparar-legenda="depois"]') == "Setembro 2026 · personal",
                "legendas com a data e quem subiu")
        for col in ("antes", "depois"):
            c.pg.locator(f'[data-comparar-coluna="{col}"] [data-foto-cadeado]').click()
            c.pg.wait_for_timeout(300)
        c.pg.wait_for_timeout(900)
        p.check(img_carregou(c, '[data-comparar-coluna="antes"] img') and img_carregou(c, '[data-comparar-coluna="depois"] img'), "as 2 fotos da comparação carregaram")
        c.print("evolucao_comparar")
        c.pg.locator('[data-comparar-data="antes"]').select_option("treino:2026-06-01")
        c.pg.wait_for_timeout(600)
        p.check(txt(c, '[data-comparar-legenda="antes"]') == "Junho 2026 · personal", "trocar a data de 'Antes' (junho, personal)")
        c.pg.get_by_role("radio", name="Costas").click()
        c.pg.wait_for_timeout(500)
        p.check(c.pg.locator('[data-comparar-data="antes"] option').count() == 3, "Costas: 3 datas (set e jun do personal, 26/08 da nutri)")
        fechar_painel(c)
    finally:
        c.fim()


def numeros(texto: str, milhar: bool) -> list[float]:
    """Números do texto; `milhar` = formato pt-BR (1.850 = mil oitocentos e cinquenta; 84,2 = oitenta e quatro vírgula dois)."""
    if milhar:
        texto = re.sub(r"(?<=\d)\.(?=\d{3}\b)", "", texto).replace(",", ".")
    return [float(x) for x in re.findall(r"[+\-−]?\d+(?:\.\d+)?", texto.replace("−", "-"))]


@caso
def caso_so_calc(nav, base: str, prefixo: str) -> None:
    arq = B.SCRATCH / f"antes_{ESTADO['antes']}.json"
    antes = json.loads(arq.read_text(encoding="utf-8"))
    c = B.abrir(nav, base, prefixo, "so_calc", B.ALUNO_CALC)
    try:
        comp_antiga = antes.get("composicao", "")
        evol_antiga = antes.get("evolucao", "")
        sem_dados = "ainda não foram configurados" in comp_antiga
        marca = "vazia" if sem_dados and "kg" not in evol_antiga else "dados"
        p.check(esperar_dados(c, marca), f"a aba abriu para o aluno só do Calc ({marca})")
        c.pg.wait_for_timeout(1500)
        c.print("evolucao_calc")
        textos: list[str] = []
        if c.tem("[data-ver-avaliacao]"):
            c.pg.locator("[data-ver-avaliacao]").click()
            c.esperar(lambda: c.tem("[data-composicao]"), 10)
            textos.append(painel(c))
            c.print("evolucao_calc_ver")
            fechar_painel(c)
        # a tabela com TUDO + a composição de cada linha
        abrir_tabela = "[data-evolucao-contagem]" if c.tem("[data-evolucao-contagem]") else "[data-evolucao-ver-registros]"
        c.pg.locator(abrir_tabela).click()
        c.esperar(lambda: c.tem("[data-linha-avaliacao]") or c.tem("[data-tabela-vazia]"), 10)
        if c.tem("[data-tabela-ver-todas]"):
            c.pg.locator("[data-tabela-ver-todas]").click()
            c.pg.wait_for_timeout(600)
        textos.append(painel(c))
        c.print("evolucao_calc_tabela")
        ids = c.pg.locator("[data-linha-avaliacao]").evaluate_all("ls => ls.map(l => l.getAttribute('data-linha-avaliacao'))")
        for i in ids:
            c.pg.locator(f'[data-linha-avaliacao="{i}"]').click()
            c.esperar(lambda: c.pg.locator(f'[data-composicao="{i}"]').count() > 0, 8)
            textos.append(txt(c, f'[data-composicao="{i}"]'))
            fechar_painel(c)
        fechar_painel(c)
        novo = "\n".join(textos)

        # o texto antigo vem repetido (a seção de fora + as de dentro): a 1ª "LINHA DO TEMPO", até o gráfico ou o resumo
        linha_tempo = evol_antiga.split("LINHA DO TEMPO")[1] if "LINHA DO TEMPO" in evol_antiga else ""
        linha_tempo = linha_tempo.split("GRÁFICOS DE EVOLUÇÃO")[0].split("RESUMO COMPARATIVO")[0]
        # datas da linha do tempo antiga (dd/mm/aaaa) → na tabela nova (dd/mm/aa), com as repetições
        datas_antigas = re.findall(r"(\d{2})/(\d{2})/\d{2}(\d{2})", linha_tempo)
        datas_novas = re.findall(r"(\d{2})/(\d{2})/(\d{2})\b", textos[-1 - len(ids)] if ids else novo)
        p.check(sorted(datas_antigas) == sorted(datas_novas), f"as mesmas avaliações da linha do tempo antiga ({len(datas_antigas)} × {len(datas_novas)})")
        # números: a composição antiga + a linha do tempo antiga (sem o eixo do gráfico e sem as datas) + o resumo comparativo
        # o texto antigo vem repetido (a seção de fora + as de dentro): o resumo vai até a próxima "LINHA DO TEMPO"
        resumo = evol_antiga.split("RESUMO COMPARATIVO")[1].split("LINHA DO TEMPO")[0] if "RESUMO COMPARATIVO" in evol_antiga else ""
        resumo = re.sub(r"\d{2}/\d{2}/\d{4}", " ", resumo)
        base_antiga = re.sub(r"\d{2}/\d{2}/\d{4}", " ", comp_antiga + "\n" + linha_tempo) + "\n" + resumo
        antigos = [n for n in numeros(base_antiga, milhar=False)]
        novos = numeros(re.sub(r"\d{2}/\d{2}/\d{2,4}", " ", novo), milhar=True)
        faltando = sorted({abs(n) for n in antigos if not any(abs(abs(n) - abs(m)) < 0.051 for m in novos)})
        p.check(not faltando, f"número a número: {len(antigos)} números da tela antiga, todos na nova (faltando: {faltando})")
        for rotulo in re.findall(r"\b(Bioimpedância|3 dobras|7 dobras|Masculino|Feminino|Boa Forma|Atleta|Aceitável|Obesidade|Gordura Essencial)\b", comp_antiga + evol_antiga):
            p.check(rotulo.lower() in novo.lower(), f"'{rotulo}' também na nova")
        if sem_dados:
            p.check(c.tem("[data-evolucao-vazia]") or "Sua evolução" in c.texto() or "kg" in novo, "perfil sem dados: a nova também não inventa composição")
    finally:
        c.fim()


@caso
def caso_vazia(nav, base: str, prefixo: str) -> None:
    c = B.abrir(nav, base, prefixo, "vazia", "w7-treino")
    try:
        p.check(esperar_dados(c, "vazia"), "aluno sem nenhuma avaliação: o estado vazio")
        p.check("Sua evolução aparece aqui" in c.texto(), "texto do vazio")
        p.check(c.pg.get_by_role("radio", name="6M").count() == 0, "sem o filtro 3M/6M/1A (não há o que filtrar)")
        p.check(not c.tem("[data-fotos-progresso]") and not c.tem("[data-kpi-evolucao]"), "sem cards nem fotos vazios")
        c.print("evolucao_vazia")
    finally:
        c.fim()


@caso
def caso_so_nutri(nav, base: str, prefixo: str) -> None:
    """Aluna só de Nutrição: até a aba Dieta (W11) a trava da W3 ("sua dieta continua no PhysiqNutri") segue valendo em todo o
    app menos o Perfil — a Evolução dela aparece junto com a Dieta. Aqui: a trava continua e nada do Diego vaza."""
    c = B.abrir(nav, base, prefixo, "so_nutri", "w10-paciente", esperar=None)
    try:
        ok = c.esperar(lambda: c.tem('[data-trava-app="use-o-nutri"]') or "Sua dieta continua no PhysiqNutri" in c.texto(), 60)
        p.check(ok, "só Nutrição: a trava 'Sua dieta continua no PhysiqNutri por enquanto' (regra da W3 até a W11)")
        p.check(c.tem('[data-tabbar] [data-aba="evolucao"]') and c.tem('[data-tabbar] [data-aba="perfil"]'), "barra com Evolução e Perfil")
        p.check("Diego" not in c.texto() and "84,2" not in c.texto(), "nada de outro aluno")
        c.print("evolucao_nutri_trava")
    finally:
        c.fim()


def ir_para(c, aba: str) -> None:
    """Troca de aba pela barra de baixo (navegação dentro do app: sem internet, recarregar a página não abriria)."""
    c.pg.locator(f'[data-tabbar] [data-aba="{aba}"]').first.click()
    c.pg.wait_for_timeout(900)


@caso
def caso_sem_internet(nav, base: str, prefixo: str) -> None:
    c = B.abrir(nav, base, prefixo, "sem_internet", "w10-aluno")
    try:
        p.check(esperar_dados(c), "aberta com internet (fica guardada no aparelho)")
        # no dev server cada aba é um arquivo baixado na hora: abre o Perfil 1 vez com internet (no APK e no site publicado os
        # arquivos já estão no aparelho — o service worker e o pacote)
        ir_para(c, "perfil")
        c.esperar(lambda: c.tem("[data-aba-perfil]"), 20)
        ir_para(c, "evolucao")
        esperar_dados(c)
        c.esperar(lambda: c.pg.evaluate("async () => (await caches.keys()).includes('supabase-api-cache-evolucao')"), 15)
        p.check(c.pg.evaluate("async () => (await caches.keys()).includes('supabase-api-cache-evolucao')"), "cache no aparelho (o sair() apaga — nome com supabase-api-cache)")
        c.ctx.set_offline(True)
        c.pg.wait_for_timeout(800)
        ir_para(c, "perfil")
        ir_para(c, "evolucao")
        ok = c.esperar(lambda: c.tem('[data-evolucao-aviso="sem-conexao"]'), 20)
        p.check(ok, "sem internet: o aviso 'Sem conexão · mostrando o que foi aberto'")
        p.check("mostrando o que foi aberto" in txt(c, "[data-evolucao-aviso]"), f"texto do aviso ({txt(c, '[data-evolucao-aviso]')!r})")
        p.check("84,2" in txt(c, '[data-kpi-evolucao="peso"]') and txt(c, "[data-evolucao-contagem]") == "7 avaliações", "os mesmos números de antes (os 2 bancos)")
        c.print("evolucao_offline")
        # sem nada guardado no aparelho
        c.pg.evaluate("async () => { await caches.delete('supabase-api-cache-evolucao'); }")
        ir_para(c, "perfil")
        ir_para(c, "evolucao")
        ok = c.esperar(lambda: c.tem('[data-aba-evolucao="sem-conexao"]'), 20)
        p.check(ok and "Sem conexão" in c.texto(), "sem nada guardado: 'Sem conexão' no visual padrão")
        c.print("evolucao_offline_sem_cache")
        # a internet volta: busca de novo
        c.ctx.set_offline(False)
        ok = c.esperar(lambda: c.tem('[data-aba-evolucao="dados"]') and not c.tem("[data-evolucao-aviso]"), 40)
        p.check(ok, "a internet voltou: a aba busca de novo sozinha e o aviso some")
    finally:
        c.ctx.set_offline(False)
        c.fim()


@caso
def caso_rotas(nav, base: str, prefixo: str) -> None:
    # produção: a conta de teste do Calc (a w10-aluno só tem matrícula no staging) — lá ela abre no estado vazio
    conta, marca = ESTADO.get("conta_rotas", "w10-aluno"), ESTADO.get("marca_rotas", "dados")
    c = B.abrir(nav, base, prefixo, "rotas", conta, rota="/avaliacao")
    try:
        p.check(c.esperar(lambda: c.caminho() == "/evolucao", 20), f"/avaliacao → /evolucao ({c.caminho()})")
        p.check(esperar_dados(c, marca), f"com a aba nova (não a tela antiga) — {marca}")
        p.check("PHYSIQ" not in c.pg.inner_text("h1") and "Composição Corporal" not in c.texto(), "o UserDashboard saiu")
    finally:
        c.fim()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:5173")
    ap.add_argument("--prefixo", default="local")
    ap.add_argument("--casos", default=",".join(CASOS))
    ap.add_argument("--antes", default="staging", help="qual foto da tela antiga comparar (antes_<x>.json)")
    a = ap.parse_args()
    B.ESTADO["schema"] = "staging"
    ESTADO["antes"] = a.antes
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        for nome in [x.strip() for x in a.casos.split(",") if x.strip()]:
            print(f"\n── {nome} ──", flush=True)
            if not B.saude_treino():
                p.check(False, f"{nome}: Banco do Treino lento/instável — parei (nada de restart)")
                break
            try:
                CASOS[nome](nav, a.base, a.prefixo)
            except Exception as e:  # noqa: BLE001
                p.check(False, f"{nome}: exceção {type(e).__name__}: {str(e)[:300]}")
            B.pausa(3)
        nav.close()
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
