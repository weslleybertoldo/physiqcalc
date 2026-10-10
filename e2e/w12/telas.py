#!/usr/bin/env python3
"""Physiq W12 — E2E da aba Início (tela 1), em contexto limpo, com as contas de teste do staging (P26). Casos em SÉRIE, com o
/health do Banco do Treino antes de cada um (a VM Nano trava com carga — lento ou UNHEALTHY: para, sem restart).

  inicio          Diego (2 módulos): os 6 blocos da tela 1 com dados reais (saudação, faixa, treino de hoje, dieta, metas, próxima
                  consulta, peso) E cada número batendo com a aba que o card abre (lição da W10): "N de M na semana" × a faixa da
                  aba Treino; o nome e os exercícios × o card da aba Treino; kcal e refeições × o topo da aba Dieta; metas × a folha
                  das metas; peso × o card Peso da Evolução; a consulta × a Perfil › Agenda. E o topo de TODAS as abas no mesmo lugar;
  acoes           Diego: ✓ numa meta (grava no banco e aparece na aba Dieta; desfaz), Começar treino (abre a aba Treino com o
                  cronômetro), Pagar (Perfil › Pagamentos) e o toque em cada card (a aba certa);
  trocar          Diego SEM internet: ⇄ troca o treino de hoje (a troca do dia, no aparelho) e, com a internet de volta, a troca
                  sobe para o staging (P20: depois o staging lê o public e a troca "some" — a linha é apagada no fim);
  so_treino       Bruno (só Treino): sem dieta/metas; barra Início · Treino · Evolução · Perfil;
  so_nutricao     Paciente Teste Claude (só Nutrição): sem o treino; barra Início · Dieta · Evolução · Perfil; kcal × a aba Dieta;
  sem_profissional  Ana (aluna do app, Treino + Alimentação): o treino pronto e os pratos prontos, a faixa dos dias grátis; sem metas,
                  consulta nem peso; Carla (só Treino): sem o card da dieta;
  faixa           Rafael: a faixa "Sua mensalidade vence em N dias · R$ 249,00" abaixo da saudação (C85: sem popup), Pagar e a faixa
                  só no Início;
  busca           Diego: exercícios do treino (a ficha com o GIF) e alimentos do plano (a refeição na aba Dieta);
  sem_internet    Diego: sem internet o treino abre (SQLite do aparelho) e Começar treino funciona; a dieta mostra "Sem conexão";
  abertura        "/" abre no Início; os links antigos (/treinos, /avaliacao, /app, /app/plano, /app/metas, /pagamentos) e as abas;
                  o ?prof= (popup do vínculo por cima do Início); o profissional continua abrindo no painel;
  offline_frio    (só no staging/publicado) o app ABRE sem internet (service worker) direto no Início com o treino de hoje.
Uso: python3 e2e/w12/telas.py --base http://localhost:5173 --prefixo local [--casos inicio,busca]
"""
from __future__ import annotations

import argparse
import datetime as dt
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402
import massa as M  # noqa: E402

p = B.p
CASOS: dict = {}
ESTADO: dict = {}
attr, txt, foto, aba = B.attr, B.txt, B.foto, B.aba
TOPOS = {"Início": "[data-aba-inicio]", "Treino": "[data-aba-treino]", "Dieta": "[data-aba-dieta]", "Evolução": "[data-aba-evolucao]", "Perfil": "[data-aba-perfil]"}


def caso(f):
    CASOS[f.__name__.removeprefix("caso_")] = f
    return f


def esperar_inicio(c, *, treino: bool = True, dieta: bool = True, consulta: bool = True, peso: bool = True, timeout: float = 120) -> bool:
    """Espera os cards saírem do 'carregando' (cada um no seu estado final)."""
    def pronto() -> bool:
        if treino and (not c.tem("[data-card-treino-hoje]") or c.tem('[data-card-treino-hoje="carregando"]')):
            return False
        if dieta and (not c.tem("[data-card-dieta-hoje]") or c.tem('[data-card-dieta-hoje="carregando"]')):
            return False
        if consulta and (not c.tem("[data-card-consulta]") or c.tem('[data-card-consulta="carregando"]')):
            return False
        if peso and (not c.tem("[data-card-peso]") or c.tem('[data-card-peso="carregando"]')):
            return False
        return True
    ok = c.esperar(pronto, timeout)
    # a duração estimada entra quando as séries do dia montam
    if ok and treino and c.tem('[data-card-treino-hoje="treino"]'):
        c.esperar(lambda: c.tem("[data-treino-hoje-duracao]"), 20)
    c.pg.wait_for_timeout(900)
    return ok


def topo_da_aba(c, seletor: str) -> float | None:
    try:
        return c.pg.evaluate("(s) => { const el = document.querySelector(s); return el && el.firstElementChild ? el.firstElementChild.getBoundingClientRect().top + window.scrollY : null }", seletor)
    except Exception:  # noqa: BLE001
        return None


def rotulos_da_barra(c) -> list[str]:
    return c.pg.locator("[data-tabbar] [data-aba]").evaluate_all("els => els.map(e => e.textContent.trim())")


def conferir_topos(c, nome: str, abas: list[str]) -> None:
    """Herdado da W11: o topo de TODAS as abas no mesmo lugar (sem o espaço a mais da faixa vazia da casca)."""
    tops = {}
    for rotulo in abas:
        aba(c, rotulo)
        c.esperar(lambda: c.tem(TOPOS[rotulo]), 30)
        c.pg.evaluate("window.scrollTo(0, 0)")
        c.pg.wait_for_timeout(400)
        tops[rotulo] = topo_da_aba(c, TOPOS[rotulo])
    print(f"   topo das abas ({nome}): {tops}", flush=True)
    valores = [v for v in tops.values() if v is not None]
    p.check(len(valores) == len(abas) and max(valores) - min(valores) <= 3, f"[{nome}] o topo de todas as abas no mesmo lugar (±3 px): {tops}")
    p.check(not c.tem("[data-avisos-topo]") or c.caminho() == "/", f"[{nome}] fora do Início, nenhuma faixa da casca no alto")


# ───────────────────────── casos ─────────────────────────

@caso
def caso_inicio(nav, base: str, prefixo: str) -> None:
    diego = M.M11.matricula_de(B.EMAIL["w10-aluno"])
    M.M11.limpar([diego["id"]])
    print(f"   ✓ de hoje pelas funções do app: {M.marcar_do_dia('w10-aluno')}", flush=True)
    c = B.abrir(nav, base, prefixo, "inicio", "w10-aluno")
    try:
        p.check(esperar_inicio(c), "[inicio] os cards do Início carregaram")
        texto = c.texto()
        p.check(bool(re.search(r"(Bom dia|Boa tarde|Boa noite),", texto)) and txt(c, "[data-inicio-nome]") == "Diego", f"[inicio] saudação com o nome ({txt(c, '[data-inicio-nome]')})")
        p.check(c.tem("[data-inicio-busca]") and c.tem("[data-sino]"), "[inicio] busca e sino no topo")
        p.check(rotulos_da_barra(c) == ["Início", "Treino", "Dieta", "Evolução", "Perfil"], f"[inicio] barra com as 5 abas ({rotulos_da_barra(c)})")
        # a faixa da mensalidade (W6) ABAIXO da saudação e acima do treino (tela 1)
        y = c.pg.evaluate("""() => ['[data-inicio-topo]', '[data-faixa-mensalidade]', '[data-card-treino-hoje]', '[data-card-dieta-hoje]', '[data-card-consulta]', '[data-card-peso]']
            .map(s => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().top) : null })""")
        print(f"   posições (topo, faixa, treino, dieta, consulta, peso): {y}", flush=True)
        p.check(None not in y and y == sorted(y), f"[inicio] a ordem da tela 1: saudação · faixa · treino · dieta/metas · consulta · peso ({y})")
        p.check("vence em" in txt(c, "[data-faixa-titulo]") and "249,00" in txt(c, "[data-faixa-subtitulo]"), f"[inicio] faixa: '{txt(c, '[data-faixa-titulo]')} · {txt(c, '[data-faixa-subtitulo]')}'")
        bottom = c.pg.evaluate("() => { const e = document.querySelector('[data-card-peso]'); return e ? Math.round(e.getBoundingClientRect().bottom) : 9999 }")
        barra = c.pg.evaluate("() => { const e = document.querySelector('[data-tabbar]'); return e ? Math.round(e.getBoundingClientRect().top) : 0 }")
        p.check(bottom <= barra, f"[inicio] os 6 blocos cabem acima da barra de abas (peso termina em {bottom}, a barra começa em {barra})")
        # ── os números do Início ──
        ini = {
            "semana": attr(c, "[data-treino-semana]", "data-treino-semana"),
            "treino": txt(c, "[data-treino-hoje-nome]"),
            "letra": txt(c, "[data-treino-hoje-letra]"),
            "exercicios": attr(c, "[data-treino-hoje-exercicios]", "data-treino-hoje-exercicios"),
            "duracao": attr(c, "[data-treino-hoje-duracao]", "data-treino-hoje-duracao"),
            "kcal": attr(c, "[data-dieta-hoje-kcal]", "data-dieta-hoje-kcal"),
            "refeicoes": attr(c, "[data-dieta-hoje-refeicoes]", "data-dieta-hoje-refeicoes"),
            "pct": attr(c, "[data-dieta-hoje-pct]", "data-dieta-hoje-pct"),
            "metas": attr(c, "[data-card-metas-hoje]", "data-metas-hoje"),
            "metas_feitas": attr(c, "[data-card-metas-hoje]", "data-metas-hoje-feitas"),
            "consulta": txt(c, "[data-consulta-quando]"),
            "consulta_em": txt(c, "[data-consulta-em]"),
            "consulta_prof": txt(c, "[data-consulta-profissional]"),
            "peso": attr(c, '[data-card-peso="dados"]', "data-peso-valor"),
            "peso_var": attr(c, '[data-card-peso="dados"]', "data-peso-variacao"),
            "peso_periodo": attr(c, '[data-card-peso="dados"]', "data-peso-periodo"),
            "peso_linha": txt(c, "[data-peso-linha]"),
        }
        print(f"   Início: {ini}", flush=True)
        ESTADO["inicio"] = ini
        foto(c, "inicio")
        esperado = M.TREINOS["w10-aluno"]
        hoje_letra = esperado["semana"].get(M.DIAS[M.HOJE.weekday()])
        if hoje_letra:
            p.check(ini["treino"] == esperado["treinos"][hoje_letra][0], f"[inicio] treino de hoje = o da semana ({ini['treino']})")
        p.check(ini["exercicios"] == "5" and ini["duracao"] is not None, f"[inicio] 5 exercícios e a duração estimada (~{ini['duracao']} min)")
        p.check(ini["consulta_prof"] == "Camila Rocha" and ini["consulta_em"] == "Em 2 dias", f"[inicio] próxima consulta: {ini['consulta_prof']} · {ini['consulta']} · {ini['consulta_em']}")

        # ── treino: × a aba Treino ──
        aba(c, "Treino")
        c.esperar(lambda: c.tem("[data-aba-treino]") and c.tem("[data-faixa-semana]"), 60)
        c.esperar(lambda: c.tem("[data-cartao-treino]") or c.tem("[data-sem-treino-dia]"), 60)
        c.pg.wait_for_timeout(800)
        feitos = attr(c, "[data-semana-feitos]", "data-semana-feitos") or "0"
        dias_com_treino = c.pg.evaluate("() => [...document.querySelectorAll('[data-dia]')].filter(d => !d.getAttribute('aria-label').includes('sem treino') || d.getAttribute('data-dia-estado') === 'feito').length")
        nome_treino = txt(c, "[data-treino-nome]")
        exs_treino = txt(c, "[data-treino-exercicios]")
        chip = txt(c, "[data-treino-chip]")
        print(f"   aba Treino: feitos={feitos} dias={dias_com_treino} nome={nome_treino!r} exercícios={exs_treino!r} chip={chip!r}", flush=True)
        p.check(ini["semana"] == f"{feitos}/{dias_com_treino}", f"[inicio] 'N de M na semana' ({ini['semana']}) = a faixa da aba Treino ({feitos} feitos de {dias_com_treino} dias com treino)")
        p.check(nome_treino == ini["treino"] and exs_treino.startswith(f"{ini['exercicios']} "), f"[inicio] o treino do card = o da aba Treino ({nome_treino}, {exs_treino})")
        p.check(chip.upper() == ini["letra"].upper(), f"[inicio] 'Treino A' do card = o chip da aba Treino ({chip})")

        # ── dieta: × a aba Dieta ──
        aba(c, "Dieta")
        c.esperar(lambda: c.tem('[data-aba-dieta="plano"]'), 60)
        c.pg.wait_for_timeout(600)
        kcal_dieta = f"{attr(c, '[data-kcal-marcadas]', 'data-kcal-marcadas')}/{attr(c, '[data-kcal-do-dia]', 'data-kcal-do-dia')}"
        ref_dieta = attr(c, "[data-refeicoes-contagem]", "data-refeicoes-contagem")
        print(f"   aba Dieta: kcal={kcal_dieta} refeições={ref_dieta}", flush=True)
        p.check(ini["kcal"] == kcal_dieta, f"[inicio] kcal da Dieta de hoje ({ini['kcal']}) = o anel da aba Dieta ({kcal_dieta})")
        p.check(ini["refeicoes"] == ref_dieta, f"[inicio] refeições ({ini['refeicoes']}) = 'Refeições de hoje' da aba Dieta ({ref_dieta})")
        c.pg.locator("[data-abrir-metas]").click()
        c.esperar(lambda: c.tem("[data-folha-metas]"), 30)
        m_hoje, m_feitas = attr(c, "[data-folha-metas]", "data-metas-hoje"), attr(c, "[data-folha-metas]", "data-metas-feitas")
        p.check(ini["metas"] == m_hoje and ini["metas_feitas"] == m_feitas, f"[inicio] metas de hoje ({ini['metas']}, {ini['metas_feitas']} feitas) = a folha das metas ({m_hoje}, {m_feitas})")
        c.pg.keyboard.press("Escape")
        c.pg.wait_for_timeout(500)

        # ── peso: × o card Peso da Evolução ──
        aba(c, "Evolução")
        c.esperar(lambda: c.tem('[data-kpi-evolucao="peso"]'), 60)
        c.pg.wait_for_timeout(600)
        ev_valor = attr(c, '[data-kpi-evolucao="peso"]', "data-kpi-valor")
        ev_var = attr(c, '[data-kpi-evolucao="peso"] [data-kpi-variacao]', "data-kpi-variacao")
        seg = c.pg.evaluate("() => { const b = document.querySelector('[role=radiogroup] [aria-checked=true], [data-segmentado] [aria-pressed=true], [aria-pressed=true]'); return b ? b.textContent.trim() : null }")
        print(f"   aba Evolução: peso={ev_valor} variação={ev_var} período={seg}", flush=True)
        p.check(ini["peso"] == ev_valor and ini["peso_var"] == ev_var, f"[inicio] peso ({ini['peso']}, {ini['peso_var']}) = o card Peso da Evolução ({ev_valor}, {ev_var})")
        p.check((ini["peso_periodo"] or "").upper() in (seg or "").upper() or seg is None, f"[inicio] o período do peso ({ini['peso_periodo']}) = o de abertura da Evolução ({seg})")

        # ── consulta: × a Perfil › Agenda ──
        c.ir("/perfil/agenda")
        c.esperar(lambda: c.tem("[data-agenda-proxima]"), 40)
        agenda = txt(c, "[data-agenda-proxima]")
        quando = ini["consulta"].split(" · ", 1)[1] if " · " in ini["consulta"] else ini["consulta"]
        p.check(quando in agenda and ini["consulta_em"] in agenda, f"[inicio] a consulta do card ({quando}, {ini['consulta_em']}) = a 'Próxima consulta' da Agenda ({agenda!r})")

        # ── o topo de todas as abas (herdado da W11) ──
        c.ir("/")
        c.esperar(lambda: c.tem("[data-aba-inicio]"), 30)
        conferir_topos(c, "inicio", ["Início", "Treino", "Dieta", "Evolução", "Perfil"])
        for rotulo in ["Treino", "Dieta", "Evolução", "Perfil"]:
            aba(c, rotulo)
            c.esperar(lambda: c.tem(TOPOS[rotulo]), 30)
            c.pg.wait_for_timeout(700)
            foto(c, f"aba_{rotulo.lower().replace('ç', 'c').replace('ã', 'a')}_topo")
        p.check(not c.tem("[data-faixa-mensalidade]"), "[inicio] a faixa da mensalidade só no Início (não repete nas outras abas)")
    finally:
        c.fim()


@caso
def caso_acoes(nav, base: str, prefixo: str) -> None:
    diego = M.M11.matricula_de(B.EMAIL["w10-aluno"])
    M.M11.limpar([diego["id"]])
    c = B.abrir(nav, base, prefixo, "acoes", "w10-aluno")
    try:
        p.check(esperar_inicio(c), "[acoes] Início carregado")
        # ✓ numa meta de hoje que ainda não está feita
        alvo = c.pg.locator('[data-meta-hoje][data-meta-hoje-feita="0"]').first
        meta_id = alvo.get_attribute("data-meta-hoje") if alvo.count() else None
        p.check(bool(meta_id), f"[acoes] uma meta de hoje por fazer ({meta_id})")
        if meta_id:
            antes = int(attr(c, "[data-card-metas-hoje]", "data-metas-hoje-feitas") or 0)
            alvo.click()
            ok = c.esperar(lambda: attr(c, f'[data-meta-hoje="{meta_id}"]', "data-meta-hoje-feita") == "1", 20)
            p.check(ok and int(attr(c, "[data-card-metas-hoje]", "data-metas-hoje-feitas") or 0) == antes + 1, "[acoes] ✓ na meta pelo Início")
            gravado = B.sql_principal(f"select count(*)::int n from staging.metas_concluidas where meta_id = '{meta_id}' and data = '{M.HOJE}'")[0]["n"]
            p.check(gravado == 1, f"[acoes] o ✓ gravou no banco (staging.metas_concluidas: {gravado})")
            foto(c, "inicio_meta_marcada")
            c.ir("/dieta?ver=metas")
            c.esperar(lambda: c.tem("[data-folha-metas]"), 40)
            p.check(attr(c, "[data-folha-metas]", "data-metas-feitas") == str(antes + 1), "[acoes] a folha das metas da aba Dieta mostra o ✓ feito no Início")
            c.ir("/")
            esperar_inicio(c)
            c.pg.locator(f'[data-meta-hoje="{meta_id}"]').click()
            p.check(c.esperar(lambda: attr(c, f'[data-meta-hoje="{meta_id}"]', "data-meta-hoje-feita") == "0", 20), "[acoes] desmarcar a meta volta")
        # tocar nos cards abre a aba certa
        for seletor, destino in [("[data-card-dieta-hoje]", "/dieta"), ('[data-card-peso="dados"]', "/evolucao"), ('[data-card-consulta="proxima"]', "/perfil/agenda")]:
            c.ir("/")
            esperar_inicio(c)
            c.pg.locator(seletor).first.click()
            p.check(c.esperar(lambda: c.caminho().startswith(destino), 20), f"[acoes] {seletor} → {destino} ({c.caminho()})")
        # Pagar da faixa
        c.ir("/")
        esperar_inicio(c)
        c.pg.locator("[data-faixa-pagar]").click()
        p.check(c.esperar(lambda: c.caminho() == "/perfil/pagamentos?pagar=mensalidade", 20), f"[acoes] Pagar da faixa → Perfil › Pagamentos ({c.caminho()})")
        # Começar treino → a aba Treino com o cronômetro correndo
        c.ir("/")
        esperar_inicio(c)
        if c.tem("[data-comecar-treino-hoje]"):
            c.pg.locator("[data-comecar-treino-hoje]").click()
            ok = c.esperar(lambda: c.caminho() == "/treino" and c.tem("[data-pilula-tempo]"), 40)
            p.check(ok, f"[acoes] Começar treino abriu a aba Treino com o cronômetro ({c.caminho()})")
            cron = c.pg.evaluate("() => JSON.parse(localStorage.getItem('physiq_workout_timer') || 'null')")
            p.check(bool(cron and cron.get("ativo") and cron.get("dateKey") == str(M.HOJE)), f"[acoes] o cronômetro é do treino de hoje ({cron})")
            foto(c, "treino_comecado_pelo_inicio")
            c.ir("/")
            esperar_inicio(c)
            p.check(c.tem('[data-card-treino-hoje="rodando"]') and "Continuar treino" in txt(c, "[data-comecar-treino-hoje]"), "[acoes] de volta ao Início: 'Continuar treino'")
        else:
            p.check(False, "[acoes] o card do treino de hoje sem o 'Começar treino'")
    finally:
        c.fim()
        M.M11.limpar([diego["id"]])


@caso
def caso_trocar(nav, base: str, prefixo: str) -> None:
    desde = B.B8.agora_iso()
    tid = M.treino_user("w10-aluno")
    c = B.abrir(nav, base, prefixo, "trocar", "w10-aluno")
    try:
        p.check(esperar_inicio(c), "[trocar] Início carregado")
        antes = txt(c, "[data-treino-hoje-nome]")
        # sem internet: a troca vai para o aparelho (o SQLite do PowerSync) — P20
        c.ctx.set_offline(True)
        c.pg.wait_for_timeout(900)
        c.pg.locator("[data-treino-hoje-trocar]").click()
        ok = c.esperar(lambda: c.tem("[data-alterar-treino]"), 30)
        p.check(ok, "[trocar] ⇄ abriu a troca do treino do dia (a folha da aba Treino)")
        outro = "Pernas" if antes != "Pernas" else "Costas e Bíceps"
        c.pg.locator("[data-alterar-treino] [data-escolher-treino]", has_text=outro).first.click()
        ok = c.esperar(lambda: txt(c, "[data-treino-hoje-nome]") == outro, 30)
        p.check(ok, f"[trocar] sem internet o card virou '{outro}' (era '{antes}')")
        foto(c, "inicio_treino_trocado")
        c.ctx.set_offline(False)
        subiu = B.B8.esperar_staging(lambda: B.sql_treino(f"select count(*)::int n from staging.tb_treino_dia_override where user_id = '{tid}' and data_treino = '{M.HOJE}'")[0]["n"] >= 1, 90)
        p.check(subiu, "[trocar] com a internet de volta, a troca do dia subiu para o staging (tb_treino_dia_override)")
    finally:
        c.ctx.set_offline(False)
        c.fim()
        n = B.sql_treino(f"with d as (delete from staging.tb_treino_dia_override where user_id = '{tid}' and created_at >= '{desde}' returning 1) select count(*)::int n from d")[0]["n"]
        print(f"   limpeza do staging (trocar): {n} troca(s) do dia apagada(s)", flush=True)


@caso
def caso_so_treino(nav, base: str, prefixo: str) -> None:
    c = B.abrir(nav, base, prefixo, "so_treino", "w7-treino")
    try:
        p.check(esperar_inicio(c, dieta=False), "[so_treino] Início carregado")
        p.check(rotulos_da_barra(c) == ["Início", "Treino", "Evolução", "Perfil"], f"[so_treino] barra ({rotulos_da_barra(c)})")
        p.check(not c.tem("[data-card-dieta-hoje]") and not c.tem("[data-card-metas-hoje]"), "[so_treino] sem os cards da dieta e das metas")
        p.check(c.tem('[data-card-treino-hoje="treino"]'), f"[so_treino] o treino de hoje ({txt(c, '[data-treino-hoje-nome]')}, {attr(c, '[data-treino-semana]', 'data-treino-semana')})")
        p.check(c.tem('[data-card-consulta]') and c.tem('[data-card-peso]'), "[so_treino] a consulta e o peso (com profissional) no estado dele")
        foto(c, "inicio_so_treino")
        conferir_topos(c, "so_treino", ["Início", "Treino", "Evolução", "Perfil"])
    finally:
        c.fim()


@caso
def caso_so_nutricao(nav, base: str, prefixo: str) -> None:
    pac = M.M11.matricula_de(B.EMAIL["paciente"])
    M.M11.limpar([pac["id"]])
    c = B.abrir(nav, base, prefixo, "so_nutricao", "paciente")
    try:
        p.check(esperar_inicio(c, treino=False), "[so_nutricao] Início carregado")
        p.check(rotulos_da_barra(c) == ["Início", "Dieta", "Evolução", "Perfil"], f"[so_nutricao] barra ({rotulos_da_barra(c)})")
        p.check(not c.tem("[data-card-treino-hoje]"), "[so_nutricao] sem o card do treino")
        p.check(c.tem("[data-card-dieta-hoje]") and c.tem("[data-card-metas-hoje]"), "[so_nutricao] dieta e metas de hoje")
        kcal = attr(c, "[data-dieta-hoje-kcal]", "data-dieta-hoje-kcal")
        foto(c, "inicio_so_nutricao")
        aba(c, "Dieta")
        c.esperar(lambda: c.tem('[data-aba-dieta="plano"]'), 60)
        c.pg.wait_for_timeout(600)
        kcal_dieta = f"{attr(c, '[data-kcal-marcadas]', 'data-kcal-marcadas')}/{attr(c, '[data-kcal-do-dia]', 'data-kcal-do-dia')}"
        p.check(kcal == kcal_dieta, f"[so_nutricao] kcal do Início ({kcal}) = a aba Dieta ({kcal_dieta})")
        c.ir("/")
        c.esperar(lambda: c.tem("[data-aba-inicio]"), 30)
        conferir_topos(c, "so_nutricao", ["Início", "Dieta", "Evolução", "Perfil"])
    finally:
        c.fim()


@caso
def caso_sem_profissional(nav, base: str, prefixo: str) -> None:
    c = B.abrir(nav, base, prefixo, "sem_profissional", "w7b-novo")
    try:
        p.check(esperar_inicio(c, consulta=False, peso=False), "[sem_profissional] Início carregado")
        estado = attr(c, "[data-card-treino-hoje]", "data-card-treino-hoje")
        p.check(estado in ("escolher", "treino", "sem-treino", "descanso"), f"[sem_profissional] o treino dela ({estado})")
        if estado == "escolher":
            p.check(c.tem("[data-treino-hoje-pronto]") and c.tem("[data-treino-hoje-montar]"), "[sem_profissional] 'Usar um treino pronto' e 'Montar o meu'")
        p.check(c.tem('[data-card-dieta-hoje="pratos"]'), "[sem_profissional] Treino + Alimentação: os pratos prontos no card da dieta")
        p.check(not c.tem("[data-card-metas-hoje]") and not c.tem("[data-card-consulta]") and not c.tem("[data-card-peso]"), "[sem_profissional] sem metas, consulta nem peso (não tem profissional)")
        p.check(attr(c, "[data-faixa-mensalidade]", "data-faixa-mensalidade") == "teste", f"[sem_profissional] a faixa dos dias grátis ({txt(c, '[data-faixa-titulo]')})")
        p.check(not c.tem("[data-sugestao-treino-pronto]"), "[sem_profissional] sem a faixa repetida 'Escolha um treino pronto' (o card faz isso)")
        foto(c, "inicio_sem_profissional")
        if c.tem("[data-treino-hoje-pronto]"):
            c.pg.locator("[data-treino-hoje-pronto]").click()
            p.check(c.esperar(lambda: c.caminho() == "/perfil/treinos-prontos", 20), f"[sem_profissional] 'Usar um treino pronto' → os treinos prontos ({c.caminho()})")
        c.ir("/")
        c.esperar(lambda: c.tem("[data-card-dieta-hoje]"), 30)
        c.pg.locator("[data-card-dieta-hoje]").click()
        p.check(c.esperar(lambda: c.caminho() == "/dieta" and c.tem('[data-aba-dieta="pratos"]'), 30), "[sem_profissional] o card dos pratos → a aba Dieta com os pratos prontos")
    finally:
        c.fim()
    c = B.abrir(nav, base, prefixo, "sem_profissional_treino", "w7b-treino")
    try:
        p.check(esperar_inicio(c, dieta=False, consulta=False, peso=False), "[sem_profissional] Carla (só Treino) — Início carregado")
        p.check(not c.tem("[data-card-dieta-hoje]") and rotulos_da_barra(c) == ["Início", "Treino", "Evolução", "Perfil"], "[sem_profissional] Carla: só Treino, sem o card da dieta")
        foto(c, "inicio_sem_profissional_so_treino")
    finally:
        c.fim()


@caso
def caso_faixa(nav, base: str, prefixo: str) -> None:
    c = B.abrir(nav, base, prefixo, "faixa", "w7-aluno")
    try:
        p.check(esperar_inicio(c, peso=True), "[faixa] Início carregado")
        c.esperar(lambda: c.tem("[data-faixa-mensalidade]"), 30)
        titulo, sub = txt(c, "[data-faixa-titulo]"), txt(c, "[data-faixa-subtitulo]")
        p.check("Sua mensalidade" in titulo and "249,00" in sub, f"[faixa] '{titulo} · {sub}'")
        y = c.pg.evaluate("() => ['[data-inicio-topo]', '[data-faixa-mensalidade]', '[data-card-treino-hoje]'].map(s => Math.round(document.querySelector(s).getBoundingClientRect().top))")
        p.check(y == sorted(y), f"[faixa] abaixo da saudação e acima do treino, como na tela 1 ({y})")
        p.check(c.pg.locator("[role=dialog]").count() == 0, "[faixa] C85: nenhum popup de parcela (só a faixa)")
        foto(c, "inicio_faixa_mensalidade")
        aba(c, "Treino")
        c.esperar(lambda: c.tem("[data-aba-treino]"), 30)
        p.check(not c.tem("[data-faixa-mensalidade]"), "[faixa] a faixa não repete na aba Treino")
        c.ir("/")
        c.esperar(lambda: c.tem("[data-faixa-pagar]"), 30)
        c.pg.locator("[data-faixa-pagar]").click()
        p.check(c.esperar(lambda: c.caminho().startswith("/perfil/pagamentos"), 20), f"[faixa] Pagar → {c.caminho()}")
    finally:
        c.fim()


@caso
def caso_busca(nav, base: str, prefixo: str) -> None:
    c = B.abrir(nav, base, prefixo, "busca", "w10-aluno")
    try:
        p.check(esperar_inicio(c), "[busca] Início carregado")
        c.pg.locator("[data-inicio-busca]").click()
        p.check(c.esperar(lambda: c.tem("[data-paleta-busca]"), 20), "[busca] a busca abriu")
        p.check(c.tem("[data-busca-dica]"), "[busca] a dica antes de digitar")
        campo = c.pg.locator("[data-paleta-busca] input")
        # "peito": os exercícios do treino "Peito e Tríceps" e o alimento "Frango, peito…" do plano — sem piscar "Nada com …" antes
        vistos: list[str] = []
        campo.fill("peito")
        for _ in range(15):
            vistos.append("nada" if c.tem("[data-busca-vazia]") else "itens" if c.pg.locator("[cmdk-item]").count() else "outro")
            if vistos[-1] == "itens":
                break
            c.pg.wait_for_timeout(60)
        p.check("nada" not in vistos, f"[busca] logo depois de digitar, sem 'Nada com …' antes dos resultados ({vistos})")
        c.esperar(lambda: c.pg.locator("[cmdk-item]").count() > 0, 20)
        c.pg.wait_for_timeout(600)
        grupos = c.pg.locator("[cmdk-group-heading]").evaluate_all("els => els.map(e => e.textContent)")
        itens = c.pg.locator("[cmdk-item]").evaluate_all("els => els.map(e => e.textContent)")
        print(f"   busca 'peito': grupos={grupos} itens={itens[:10]}", flush=True)
        p.check("Exercícios do seu treino" in grupos and "Alimentos da sua dieta" in grupos, f"[busca] exercícios e alimentos do plano ({grupos})")
        foto(c, "inicio_busca")
        # sem acento: "triceps" acha "Tríceps"
        campo.fill("triceps")
        ok = c.esperar(lambda: c.pg.locator("[cmdk-item]", has_text="Tríceps").count() > 0, 20)
        p.check(ok, "[busca] 'triceps' (sem acento) acha os exercícios de tríceps")
        c.pg.locator("[cmdk-item]", has_text="Tríceps").first.click()
        p.check(c.esperar(lambda: c.tem("[data-ficha-exercicio]"), 20), "[busca] o exercício abre a ficha (com o GIF)")
        c.esperar(lambda: c.tem("[data-ficha-gif] img"), 10)
        c.pg.wait_for_timeout(1500)
        foto(c, "inicio_busca_ficha")
        c.pg.keyboard.press("Escape")
        c.pg.wait_for_timeout(600)
        # um alimento de hoje: a refeição na aba Dieta
        c.pg.locator("[data-inicio-busca]").click()
        c.esperar(lambda: c.tem("[data-paleta-busca]"), 20)
        c.pg.locator("[data-paleta-busca] input").fill("frango")
        c.esperar(lambda: c.pg.locator("[cmdk-item]").count() > 0, 20)
        c.pg.locator("[cmdk-item]").first.click()
        ok = c.esperar(lambda: c.caminho().startswith("/dieta?ver=refeicao") and c.tem("[data-painel]"), 30)
        p.check(ok, f"[busca] o alimento abre a refeição de hoje na aba Dieta ({c.caminho()})")
        c.pg.wait_for_timeout(800)
        foto(c, "inicio_busca_alimento")
    finally:
        c.fim()


@caso
def caso_sem_internet(nav, base: str, prefixo: str) -> None:
    c = B.Caso(nav, base, prefixo, "sem_internet", desktop=False)
    try:
        # a dieta não chega (como se a internet tivesse caído antes dela) — o resto do Início abre com internet
        c.pg.route("**/rpc/minha_dieta", lambda r: r.abort("internetdisconnected"))
        c.entrar("w10-aluno", "/", zerar=True)
        c.fechar_avisos()
        p.check(esperar_inicio(c, dieta=False), "[sem_internet] Início aberto com internet (o treino baixou para o aparelho)")
        # os arquivos das outras abas vêm com o APK (no site, com o service worker): aqui, abre cada uma uma vez com internet
        for rotulo in ["Treino", "Evolução", "Perfil", "Início"]:
            aba(c, rotulo)
            c.esperar(lambda: c.tem(TOPOS[rotulo]), 30)
        c.ctx.set_offline(True)
        c.pg.wait_for_timeout(1000)
        aba(c, "Perfil")
        aba(c, "Início")
        ok = c.esperar(lambda: c.tem('[data-card-treino-hoje="treino"]') and c.tem('[data-card-dieta-hoje="sem-internet"]'), 40)
        p.check(ok, "[sem_internet] sem internet: o treino de hoje aparece (SQLite do aparelho) e a dieta mostra 'Sem conexão'")
        p.check("A dieta aparece quando a internet voltar." in txt(c, "[data-card-dieta-hoje]"), f"[sem_internet] texto da dieta ({txt(c, '[data-card-dieta-hoje]')!r})")
        p.check(c.tem('[data-card-metas-hoje="sem-internet"]'), "[sem_internet] metas: 'Sem conexão'")
        c.pg.wait_for_timeout(800)
        foto(c, "inicio_sem_internet")
        c.pg.locator("[data-comecar-treino-hoje]").click()
        ok = c.esperar(lambda: c.caminho() == "/treino" and c.tem("[data-cartao-treino]") and c.tem("[data-pilula-tempo]"), 40)
        p.check(ok, "[sem_internet] Começar treino sem internet abre a aba Treino com o cronômetro")
        foto(c, "treino_sem_internet_pelo_inicio")
        c.pg.unroute("**/rpc/minha_dieta")
        c.ctx.set_offline(False)
        aba(c, "Início")
        ok = c.esperar(lambda: c.tem('[data-card-dieta-hoje="plano"]'), 60)
        p.check(ok, "[sem_internet] a internet voltou: a dieta aparece sozinha")
    finally:
        c.ctx.set_offline(False)
        c.fim()


@caso
def caso_abertura(nav, base: str, prefixo: str) -> None:
    c = B.abrir(nav, base, prefixo, "abertura", "w10-aluno", rota="/entrar", esperar=None)
    try:
        ok = c.esperar(lambda: c.caminho() == "/" and c.tem("[data-aba-inicio]"), 60)
        p.check(ok, f"[abertura] logado, /entrar abre o app no Início ({c.caminho()})")
        for antiga, nova, seletor in [
            ("/treinos", "/treino", "[data-aba-treino]"),
            ("/avaliacao", "/evolucao", "[data-aba-evolucao]"),
            ("/app", "/", "[data-aba-inicio]"),
            ("/app/plano", "/dieta", "[data-aba-dieta]"),
            ("/app/metas", "/dieta?ver=metas", "[data-folha-metas]"),
            ("/pagamentos", "/perfil/pagamentos", "[data-pagina-pagamentos]"),
            ("/treino", "/treino", "[data-aba-treino]"),
            ("/dieta", "/dieta", "[data-aba-dieta]"),
            ("/evolucao", "/evolucao", "[data-aba-evolucao]"),
            ("/perfil", "/perfil", "[data-aba-perfil]"),
            ("/perfil/agenda", "/perfil/agenda", "[data-pagina-agenda]"),
            ("/", "/", "[data-aba-inicio]"),
        ]:
            c.ir(antiga)
            ok = c.esperar(lambda: c.caminho() == nova and c.tem(seletor), 40)
            p.check(ok, f"[abertura] {antiga} → {nova} ({c.caminho()})")
        # ?prof= (W7): o popup do vínculo abre por cima do Início
        codigo = B.sql_principal("""select m.codigo_convite from staging.conta_membros m join staging.profiles pr on pr.id = m.user_id
                                      join staging.contas c on c.id = m.conta_id where c.nome = 'Consultoria Ferreira W7' and pr.nome = 'Lucas Ferreira'""")[0]["codigo_convite"]
        c.ir(f"/?prof={codigo}")
        ok = c.esperar(lambda: c.tem("[data-popup-vinculo]") and not c.tem('[data-popup-vinculo="carregando"]'), 40)
        p.check(ok and c.pg.locator("[data-aba-inicio]").count() > 0, f"[abertura] /?prof= abre o popup do profissional por cima do Início ({attr(c, '[data-popup-vinculo]', 'data-popup-vinculo')})")
        c.pg.wait_for_timeout(800)
        foto(c, "inicio_popup_prof")
        botao = c.pg.locator("[data-vinculo-cancelar], [data-vinculo-fechar]")
        if botao.count():
            botao.first.click()
            c.pg.wait_for_timeout(900)
        p.check(not c.tem("[data-popup-vinculo]"), "[abertura] Cancelar fecha o popup (nada vinculado)")
    finally:
        c.fim()
    # o profissional continua abrindo no painel
    c = B.abrir(nav, base, prefixo, "abertura_profissional", "master", rota="/", esperar=None)
    try:
        ok = c.esperar(lambda: c.caminho().startswith("/painel") or c.caminho().startswith("/master"), 60)
        p.check(ok, f"[abertura] o profissional abre no painel ({c.caminho()})")
    finally:
        c.fim()


@caso
def caso_offline_frio(nav, base: str, prefixo: str) -> None:
    """O app publicado (com o service worker) ABRE sem internet direto no Início com o treino de hoje (o APK abre igual)."""
    if "localhost" in base and ESTADO.get("dev"):
        print("   (dev server sem service worker — pulei)", flush=True)
        return
    c = B.abrir(nav, base, prefixo, "offline_frio", "w10-aluno", sw=True)
    try:
        p.check(esperar_inicio(c), "[offline_frio] Início com internet (o service worker guarda o app)")
        for rotulo in ["Treino", "Início"]:
            aba(c, rotulo)
            c.esperar(lambda: c.tem(TOPOS[rotulo]), 30)
        c.esperar(lambda: c.pg.evaluate("async () => !!(navigator.serviceWorker && (await navigator.serviceWorker.getRegistration()) && navigator.serviceWorker.controller)"), 40)
        c.pg.wait_for_timeout(2500)
        c.ctx.set_offline(True)
        c.pg.reload(wait_until="domcontentloaded")
        ok = c.esperar(lambda: c.tem("[data-aba-inicio]") and c.tem('[data-card-treino-hoje="treino"]'), 90)
        p.check(ok, "[offline_frio] recarregado SEM internet: abre no Início e o treino de hoje aparece")
        c.pg.wait_for_timeout(1500)
        foto(c, "inicio_offline_frio")
    finally:
        c.ctx.set_offline(False)
        c.fim()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:5173")
    ap.add_argument("--prefixo", default="local")
    ap.add_argument("--casos", default=",".join(CASOS))
    ap.add_argument("--dev", action="store_true", help="o local é o dev server (sem service worker)")
    # hml-18a: o E2E de tela sempre com o Edge no notebook (o Chromium do Playwright cai nas páginas longas — hml-11/hml-16)
    ap.add_argument("--canal", default="chromium", choices=("chromium", "msedge", "chrome"))
    a = ap.parse_args()
    B.ESTADO["schema"] = "staging"
    ESTADO.update(prefixo=a.prefixo, dev=a.dev)
    with sync_playwright() as pw:
        nav = pw.chromium.launch(channel=a.canal, args=["--no-sandbox", "--disable-dev-shm-usage"])
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
