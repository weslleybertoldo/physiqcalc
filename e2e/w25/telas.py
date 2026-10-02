#!/usr/bin/env python3
"""Physiq W25 — E2E das telas do Painel › Dashboard (tela 6) e dos herdados (Alunos, Financeiro, Agenda, PDF) — local e staging.

Positivo ("Consultoria Ferreira W13", massa: e2e/w25/massa.py):
  dono        Lucas (dono + personal): os 4 números = as telas de origem (o total de Alunos e o número do menu, o "+N este mês" do
              card de Alunos, o "Recebido em <mês>" e a comparação do Resumo do Financeiro, o "Consultas hoje" da Agenda); a Agenda de
              hoje = a lista do número; "Precisam de atenção" pela P28 (Pix/vencidas = o card do Financeiro; o cadastro pendente = o
              "Pendentes" de Alunos; a pré-consulta nova = o número do menu; o Carlos sem treinar há 10 dias; a avaliação do Rafael
              vencida há 12 dias; o aniversário da Marina), cada item abre a tela de origem; sem o Diário (regra clínica);
  completo    Lucas com o papel de nutricionista SÓ durante o caso: a tela 6 inteira (o Diário de hoje com as reações e a dieta
              parada da Larissa) — o print da tela 6;
  nutri       Camila: o Diário de hoje, a DIETA da Larissa; sem o resumo do Treino (a nutri não troca o token);
  personal    Bruno (2º personal): P1 — só o Carlos (TREINO), a agenda dele (nenhuma hoje) e os números dele;
  busca       Ctrl K: alunos, treinos e alimentos; cada resultado abre a tela dele;
  herdados    card "Novos alunos por mês" (Alunos), "nada em 1º set" (Financeiro, o mesmo período), "Consultas por semana" vazio com
              texto (Agenda), PDF "Dados & Evolução" com "Faulkner - 4 dobras".
Uso: python3 e2e/w25/telas.py --base http://localhost:5173 --prefixo local [--casos dono,completo,…]
     (staging: --base https://physiqcalc-staging.vercel.app --prefixo staging). Painel 1280 × 883 × 2 (2560 × 1766, como a tela 6).
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

from playwright.sync_api import sync_playwright  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
p = B.p
q = B.sql_principal
CASOS: dict[str, object] = {}
ESTADO: dict = {}
DOWNLOADS = B.SCRATCH / "downloads"


def caso(fn):
    CASOS[fn.__name__.replace("caso_", "")] = fn
    return fn


def abrir(nav, nome: str, conta: str, rota: str = "/painel"):
    c = B.Caso(nav, ESTADO["base"], ESTADO["prefixo"], nome, desktop=True)
    c.entrar(conta, rota)
    c.fechar_avisos()
    return c


def fechar_faixa(c) -> None:
    if c.esperar(lambda: c.tem("[data-faixa-mensagens-fechar]"), 2):
        c.pg.locator("[data-faixa-mensagens-fechar]").first.click()
        c.pg.wait_for_timeout(300)


def attr(c, sel: str, nome: str) -> str | None:
    loc = c.pg.locator(sel)
    return loc.first.get_attribute(nome) if loc.count() else None


def esperar_dashboard(c, nome: str, treino: str) -> bool:
    """Espera o Dashboard inteiro (nenhum esqueleto e o resumo do Treino no estado esperado: ok · fora)."""
    ok = c.esperar(lambda: c.tem("[data-pagina-dashboard]") and c.pg.locator("[data-kpi-carregando]").count() == 0
                   and attr(c, "[data-pagina-dashboard]", "data-treino") == treino and c.tem("[data-cartao-atividade]")
                   and c.tem("[data-cartao-agenda-hoje-dashboard]") and c.pg.locator("[data-receita-carregando]").count() == 0, 90)
    p.check(ok, f"[{nome}] o Dashboard abriu inteiro (Treino: {treino}; agora {attr(c, '[data-pagina-dashboard]', 'data-treino')})")
    # as fotos do diário (URL assinada) carregadas de verdade (a imagem decodificada, não só o <img>)
    c.esperar(lambda: not c.tem("[data-cartao-diario-hoje]") or c.pg.evaluate(
        "() => { const f = [...document.querySelectorAll('[data-diario-foto]')]; return f.length > 0 && f.every((x) => { const i = x.querySelector('img'); return i && i.complete && i.naturalWidth > 0; }); }"), 25)
    c.pg.wait_for_timeout(1500)
    return ok


def itens_atencao(c) -> list[tuple[str, str]]:
    if c.tem("[data-atencao-ver-todas]") and "Ver todas" in (c.pg.locator("[data-atencao-ver-todas]").inner_text() or ""):
        c.pg.locator("[data-atencao-ver-todas]").click()
        c.pg.wait_for_timeout(300)
    return [(e.get_attribute("data-atencao-item") or "", e.inner_text().replace("\n", " · ")) for e in c.pg.locator("[data-atencao-item]").all()]


def contador_menu(c, rota: str) -> str:
    loc = c.pg.locator(f'[data-menu-lateral] [data-nav="{rota}"] [data-contador]')
    return (loc.first.inner_text().strip() if loc.count() else "0")


def numeros_do_dashboard(c) -> dict:
    return {
        "alunos": attr(c, "[data-kpi-alunos]", "data-kpi-alunos"),
        "novos": attr(c, "[data-kpi-novos]", "data-kpi-novos"),
        "receita": attr(c, "[data-kpi-receita]", "data-kpi-receita"),
        "comparacao": attr(c, '[data-kpi-bloco="receita"] [data-comparacao-mes]', "data-comparacao-mes"),
        "consultas": attr(c, "[data-kpi-consultas]", "data-kpi-consultas"),
        "agenda_hoje": c.pg.locator("[data-agenda-hoje-evento]").count() + int(attr(c, "[data-agenda-hoje-mais]", "data-agenda-hoje-mais") or 0),
        "adesao": attr(c, '[data-kpi-bloco="adesao"]', "data-adesao"),
        "atencao": attr(c, "[data-cartao-atencao-dashboard]", "data-atencao-total"),
    }


def conferir_origens(c, nome: str, n: dict, itens: list[tuple[str, str]]) -> None:
    """Número = tela (lição da W10): abre cada tela de origem e compara."""
    fin = sum(1 for t, _ in itens if t in ("pix", "cobranca"))
    # Alunos
    c.ir("/painel/alunos")
    c.esperar(lambda: attr(c, "[data-pagina-alunos]", "data-total-alunos") is not None and c.tem("[data-cartao-novos-por-mes][data-novos-mes]"), 60)
    total = attr(c, "[data-pagina-alunos]", "data-total-alunos")
    p.check(n["alunos"] == total == contador_menu(c, "/painel/alunos"), f"[{nome}] Alunos ativos = a página Alunos = o menu ({n['alunos']} · {total} · {contador_menu(c, '/painel/alunos')})")
    p.check(n["novos"] == attr(c, "[data-cartao-novos-por-mes]", "data-novos-mes"), f"[{nome}] '+N este mês' = o card Novos alunos por mês ({n['novos']} · {attr(c, '[data-cartao-novos-por-mes]', 'data-novos-mes')})")
    pend = attr(c, "[data-abrir-pendentes]", "data-abrir-pendentes") or "0"
    cad = [t for t, _ in itens if t == "cadastro"]
    p.check((pend == "0" and not cad) or (cad and f"{pend} cadastro" in dict(itens)["cadastro"]), f"[{nome}] cadastros pendentes = o Pendentes de Alunos ({pend} · {dict(itens).get('cadastro')})")
    # Pré-consulta (o número do menu)
    novas = contador_menu(c, "/painel/pre-consulta")
    pre = dict(itens).get("preconsulta")
    p.check((novas == "0" and not pre) or (pre and pre.startswith(f"{novas} resposta")), f"[{nome}] pré-consultas novas = o número do menu ({novas} · {pre})")
    # Financeiro
    c.ir("/painel/financeiro")
    t0 = time.time()
    achou = c.esperar(lambda: attr(c, '[data-aba-financeiro-conteudo="resumo"]', "data-recebido-mes") is not None, 60)
    print(f"   financeiro: {achou} em {time.time() - t0:.1f}s · {c.caminho()} · {[e.get_attribute('data-aba-financeiro-conteudo') for e in c.pg.locator('[data-aba-financeiro-conteudo]').all()]}", flush=True)
    rec = attr(c, '[data-aba-financeiro-conteudo="resumo"]', "data-recebido-mes")
    comp = attr(c, '[data-kpis-financeiro] [data-comparacao-mes]', "data-comparacao-mes")
    p.check(n["receita"] == rec, f"[{nome}] Receita do mês = o Recebido do Resumo do Financeiro ({n['receita']} · {rec})")
    p.check(n["comparacao"] == comp and comp is not None, f"[{nome}] a comparação é a mesma (o mesmo período do mês anterior: {n['comparacao']} · {comp})")
    # o card do Financeiro completa quando o resumo da W6 (mensalidades e comprovantes) chega: espera assentar
    c.esperar(lambda: attr(c, "[data-cartao-atencao]", "data-atencao-total") == str(fin), 30)
    tot_fin = attr(c, "[data-cartao-atencao]", "data-atencao-total")
    p.check(str(fin) == tot_fin, f"[{nome}] Pix aguardando + vencidas = o 'Precisam de atenção' do Financeiro ({fin} · {tot_fin})")
    # Agenda
    c.ir("/painel/agenda")
    c.esperar(lambda: attr(c, "[data-resumo-agenda]", "data-hoje") is not None, 60)
    hoje_ag = attr(c, "[data-resumo-agenda]", "data-hoje")
    p.check(n["consultas"] == hoje_ag and str(n["agenda_hoje"]) == hoje_ag, f"[{nome}] Consultas hoje = a Agenda = a Agenda de hoje ({n['consultas']} · {hoje_ag} · {n['agenda_hoje']})")


# ───────────────────────── casos ─────────────────────────

@caso
def caso_dono(nav) -> None:
    B.saude_ok("dono")
    c = abrir(nav, "dono", "w13-dono")
    try:
        fechar_faixa(c)
        if not esperar_dashboard(c, "dono", "ok"):
            return
        p.check("Lucas" in (c.pg.locator("[data-saudacao]").inner_text() or ""), f"[dono] a saudação com o nome ({c.pg.locator('[data-saudacao]').inner_text()})")
        p.check(c.pg.locator("[data-cartao-diario-hoje]").count() == 0, "[dono sem papel de nutri] sem o Diário de hoje (regra clínica)")
        n = numeros_do_dashboard(c)
        print("   números:", n, flush=True)
        itens = itens_atencao(c)
        print("   atenção:", itens, flush=True)
        tipos = [t for t, _ in itens]
        texto = dict(itens)
        p.check("treino" in tipos and "Carlos Souza" in texto.get("treino", "") and "Sem treinar há 10 dias" in texto["treino"], f"[dono] TREINO: Carlos sem treinar há 10 dias ({texto.get('treino')})")
        p.check("Avaliação vencida há 12 dias" in texto.get("avaliacao", ""), f"[dono] AVALIAÇÃO: o Rafael, pela data marcada ({texto.get('avaliacao')})")
        p.check("aniversario" in tipos and "Marina" in texto.get("aniversario", ""), f"[dono] ANIVERSÁRIO: a Marina no sábado ({texto.get('aniversario')})")
        p.check("pix" in tipos and "dieta" not in tipos, "[dono] PIX sim; DIETA não (o dono sem papel de nutri não vê a dieta)")
        ordem_ok = [t for t in ["pix", "cobranca", "treino", "avaliacao", "dieta", "cadastro", "preconsulta", "aniversario"] if t in tipos] == list(dict.fromkeys(tipos))
        p.check(ordem_ok, f"[dono] a ordem da tela 6 ({tipos})")
        atv = [e.inner_text().replace("\n", " ") for e in c.pg.locator("[data-atividade-item]").all()]
        print("   atividade:", atv, flush=True)
        p.check(any("concluiu o Treino A" in a and a.startswith("Rafa") for a in atv) and any("bateu recorde no Supino Reto com Barra (46 kg)" in a for a in atv),
                f"[dono] Atividade recente: o treino de hoje e o recorde do Rafael ({atv[:3]})")
        c.pg.evaluate("window.scrollTo(0, 0)")
        c.print("tela6_dashboard_dono")
        # cada item leva à tela de origem
        c.pg.locator('[data-atencao-item="treino"]').first.click()
        p.check(c.esperar(lambda: "/treino" in c.caminho() and "/painel/alunos/" in c.caminho(), 20), f"[dono] o TREINO abre a aba Treino do aluno ({c.caminho()})")
        c.ir("/painel")
        esperar_dashboard(c, "dono (volta)", "ok")
        itens_atencao(c)  # abre o "Ver todas" (o cadastro é o 6º item)
        c.pg.locator('[data-atencao-item="cadastro"]').first.click()
        p.check(c.esperar(lambda: c.caminho().startswith("/painel/alunos") and c.tem("[data-pendentes]"), 20),
                f"[dono] o cadastro pendente abre Alunos › Pendentes ({c.caminho()})")
        c.ir("/painel")
        esperar_dashboard(c, "dono (volta 2)", "ok")
        conferir_origens(c, "dono", n, itens)
    finally:
        c.fim()


def papeis_lucas(conta: str) -> list[str]:
    r = q(f"select papeis from {S}.conta_membros where conta_id = '{conta}' and user_id = '{B.uid('w13-dono')}' and status = 'ativo'")
    return list(r[0]["papeis"]) if r else []


@caso
def caso_completo(nav) -> None:
    """A tela 6 inteira: o Lucas com o papel de nutricionista SÓ durante este caso (volta para dono + personal no fim)."""
    conta = B.conta_w13()
    antes = papeis_lucas(conta)
    B.saude_ok("completo")
    q(f"update {S}.conta_membros set papeis = array['dono','personal','nutricionista'] where conta_id = '{conta}' and user_id = '{B.uid('w13-dono')}' and status = 'ativo'")
    try:
        c = abrir(nav, "completo", "w13-dono")
        try:
            fechar_faixa(c)
            if not esperar_dashboard(c, "completo", "ok"):
                return
            carregadas = c.pg.evaluate("() => [...document.querySelectorAll('[data-diario-foto] img')].filter((i) => i.complete && i.naturalWidth > 0).length")
            p.check(carregadas == c.pg.locator("[data-diario-foto]").count(), f"[completo] as fotos do diário carregaram (URL assinada): {carregadas}")
            fotos = c.pg.locator("[data-diario-foto]").count()
            reacoes = [e.inner_text() for e in c.pg.locator("[data-diario-reacao]").all()]
            p.check(fotos == 3 and sorted(reacoes) == ["Atenção", "Ótimo"], f"[completo] Diário de hoje: as 3 fotos de hoje, com as reações ({fotos}, {reacoes})")
            itens = itens_atencao(c)
            texto = dict(itens)
            p.check("Larissa Prado" in texto.get("dieta", "") and "Sem marcar a dieta há 4 dias" in texto["dieta"], f"[completo] DIETA: a Larissa há 4 dias ({texto.get('dieta')})")
            p.check(c.pg.locator('[data-kpi-bloco="adesao"]').get_attribute("data-adesao") not in (None, ""), "[completo] a Adesão média com treino e dieta")
            p.check("treinos feitos e dieta marcada" in c.pg.locator('[data-kpi-bloco="adesao"]').inner_text(), "[completo] o detalhe da adesão: treinos feitos e dieta marcada")
            # o card "Precisam de atenção" volta a mostrar 5 (o print igual à tela 6)
            if c.tem("[data-atencao-ver-todas]") and "menos" in c.pg.locator("[data-atencao-ver-todas]").inner_text():
                c.pg.locator("[data-atencao-ver-todas]").click()
            c.pg.evaluate("window.scrollTo(0, 0)")
            c.pg.wait_for_timeout(800)
            c.print("tela6_dashboard")
            # a página inteira (a 1280 de largura o Dashboard passa um pouco da altura da janela: a tela 6 foi desenhada a 1440)
            c.pg.screenshot(path=str(B.PRINTS / f"{c.prefixo}_tela6_dashboard_inteira.png"), full_page=True)
            # a foto abre o Diário filtrado pelo aluno
            c.pg.locator("[data-diario-foto]").first.click()
            p.check(c.esperar(lambda: "/painel/dietas" in c.caminho() and "aba=diario" in c.caminho() and "aluno=" in c.caminho(), 20), f"[completo] a foto abre o Diário do aluno ({c.caminho()})")
        finally:
            c.fim()
    finally:
        q(f"update {S}.conta_membros set papeis = array[{','.join(repr(x) for x in antes)}]::text[] where conta_id = '{conta}' and user_id = '{B.uid('w13-dono')}' and status = 'ativo'")
        p.check(papeis_lucas(conta) == antes, f"[completo] os papéis do Lucas voltaram ({papeis_lucas(conta)})")


@caso
def caso_nutri(nav) -> None:
    B.saude_ok("nutri")
    c = abrir(nav, "nutri", "w13-nutri")
    try:
        fechar_faixa(c)
        if not esperar_dashboard(c, "nutri", "fora"):
            return
        p.check(c.pg.locator("[data-diario-foto]").count() == 3, f"[nutri] o Diário de hoje com as 3 fotos ({c.pg.locator('[data-diario-foto]').count()})")
        itens = itens_atencao(c)
        tipos = [t for t, _ in itens]
        p.check("dieta" in tipos and "treino" not in tipos, f"[nutri] DIETA sim, TREINO não (sem a sessão do Treino) ({tipos})")
        n = numeros_do_dashboard(c)
        c.ir("/painel/alunos")
        c.esperar(lambda: attr(c, "[data-pagina-alunos]", "data-total-alunos") is not None, 60)
        p.check(n["alunos"] == attr(c, "[data-pagina-alunos]", "data-total-alunos"), f"[nutri] Alunos ativos = os dela na página Alunos ({n['alunos']})")
        c.ir("/painel")
        esperar_dashboard(c, "nutri (volta)", "fora")
        c.pg.evaluate("window.scrollTo(0, 0)")
        c.print("tela6_dashboard_nutri")
    finally:
        c.fim()


@caso
def caso_personal(nav) -> None:
    B.saude_ok("personal 2")
    c = abrir(nav, "personal", "w13-personal2")
    try:
        fechar_faixa(c)
        if not esperar_dashboard(c, "personal", "ok"):
            return
        n = numeros_do_dashboard(c)
        itens = itens_atencao(c)
        nomes = {t: x for t, x in itens}
        p.check(n["alunos"] == "1" and "Carlos Souza" in nomes.get("treino", ""), f"[personal 2] P1: 1 aluno (o Carlos, sem treinar) ({n['alunos']}, {itens})")
        p.check(not any("Rafael" in x for _, x in itens), "[personal 2] nada do Rafael (aluno do Lucas)")
        p.check(c.tem('[data-bloco-vazio="agenda"]') and n["consultas"] == "0", f"[personal 2] nenhuma consulta dele hoje: o estado vazio com texto ({n['consultas']})")
        p.check(c.pg.locator("[data-cartao-diario-hoje]").count() == 0, "[personal 2] sem o Diário")
        conferir_origens(c, "personal 2", n, itens)
    finally:
        c.fim()


@caso
def caso_busca(nav) -> None:
    B.saude_ok("busca")
    c = abrir(nav, "busca", "w13-dono")
    try:
        fechar_faixa(c)
        esperar_dashboard(c, "busca", "ok")
        c.pg.keyboard.press("Control+k")
        p.check(c.esperar(lambda: c.tem("[data-paleta-busca]"), 10), "[busca] o Ctrl K abre a busca")
        c.pg.keyboard.type("pe", delay=60)
        ok = c.esperar(lambda: all(c.pg.locator(f'[data-paleta-busca] [cmdk-group-heading]:text-is("{g}")').count() for g in ("Alunos", "Treinos", "Alimentos")), 30)
        grupos = [e.inner_text() for e in c.pg.locator("[data-paleta-busca] [cmdk-group-heading]").all()]
        p.check(ok, f"[busca] 'pe' acha alunos, treinos e alimentos ({grupos})")
        c.pg.wait_for_timeout(600)
        c.print("tela6_busca")
        # aluno → perfil
        c.pg.keyboard.press("Control+a")
        c.pg.keyboard.type("Rafael", delay=50)
        c.esperar(lambda: c.pg.locator('[data-paleta-busca] [cmdk-item]:has-text("Rafael Moura")').count() > 0, 30)
        c.pg.locator('[data-paleta-busca] [cmdk-item]:has-text("Rafael Moura")').first.click()
        p.check(c.esperar(lambda: c.caminho().startswith("/painel/alunos/") and not c.tem("[data-paleta-busca]"), 20), f"[busca] o aluno abre o perfil ({c.caminho()})")
        # treino → Treinos › Meus treinos
        c.pg.keyboard.press("Control+k")
        c.esperar(lambda: c.tem("[data-paleta-busca]"), 10)
        c.pg.keyboard.type("Peito e", delay=50)
        c.esperar(lambda: c.pg.locator('[data-paleta-busca] [cmdk-item]:has-text("Peito e tríceps")').count() > 0, 30)
        c.pg.locator('[data-paleta-busca] [cmdk-item]:has-text("Peito e tríceps")').first.click()
        p.check(c.esperar(lambda: "/painel/treinos" in c.caminho() and "treino=" in c.caminho(), 20), f"[busca] o treino abre Treinos › Meus treinos ({c.caminho()})")
        # alimento → Dietas › Alimentos
        c.pg.keyboard.press("Control+k")
        c.esperar(lambda: c.tem("[data-paleta-busca]"), 10)
        c.pg.keyboard.type("arroz integral", delay=40)
        c.esperar(lambda: c.pg.locator('[data-paleta-busca] [cmdk-item]:has-text("Arroz, integral")').count() > 0, 30)
        c.pg.locator('[data-paleta-busca] [cmdk-item]:has-text("Arroz, integral")').first.click()
        p.check(c.esperar(lambda: c.caminho().startswith("/painel/dietas") and "aba=alimentos" in c.caminho(), 20), f"[busca] o alimento abre Dietas › Alimentos ({c.caminho()})")
    finally:
        c.fim()


@caso
def caso_herdados(nav) -> None:
    B.saude_ok("herdados")
    c = abrir(nav, "herdados", "w13-dono", "/painel/alunos")
    try:
        fechar_faixa(c)
        ok = c.esperar(lambda: c.tem("[data-cartao-novos-por-mes][data-novos-total]"), 60)
        barras = c.pg.locator("[data-novos-barra]").count()
        p.check(ok and barras == 6, f"[herdados] Alunos: o card 'Novos alunos por mês' com 6 meses ({barras})")
        p.check(c.tem("[data-linhas-alunos]"), "[herdados] Alunos: a lista da W13 continua embaixo")
        c.print("tela6_alunos_novos_por_mes")
        c.ir("/painel/financeiro")
        c.esperar(lambda: attr(c, '[data-kpis-financeiro] [data-comparacao-mes]', "data-comparacao-mes") is not None, 60)
        txt = c.pg.locator('[data-kpis-financeiro] [data-kpi]').first.inner_text().replace("\n", " ")
        hoje = B.hoje()
        if hoje.endswith("-01"):
            p.check("1º" in txt and "−" not in txt.split("sobre")[-1] if "sobre" in txt else "nada em 1º" in txt,
                    f"[herdados] Financeiro no dia 1º: compara 1º com 1º (não o mês cheio) ({txt})")
        else:
            p.check("1–" in txt, f"[herdados] Financeiro: compara com o mesmo período do mês anterior ({txt})")
        c.print("tela6_financeiro_comparacao")
    finally:
        c.fim()
    # Agenda vazia (a nutricionista da Clínica Sabor W24 não tem consulta nenhuma nas 8 semanas)
    c = abrir(nav, "agenda-vazia", "w24-personal", "/painel/agenda")
    try:
        fechar_faixa(c)
        c.esperar(lambda: c.tem("[data-resumo-agenda]") and not c.tem('[data-resumo-agenda="carregando"]'), 60)
        if attr(c, "[data-resumo-agenda]", "data-semana") is not None and c.tem("[data-consultas-semana-vazio]"):
            p.check(True, "[herdados] Agenda: 'Consultas por semana' vazio com texto (Nenhuma consulta nas últimas 8 semanas)")
            c.print("tela6_agenda_consultas_semana_vazia")
        else:
            p.check(c.tem("[data-grafico-semanas]"), "[herdados] Agenda com consultas: o gráfico (o vazio é provado no vitest)")
    finally:
        c.fim()
    # PDF Dados & Evolução da Marina (antropometria de Faulkner): "Faulkner - 4 dobras"
    marina = q(f"select id::text from {S}.pacientes where conta_id = '{B.conta_w13()}' and nome = 'Marina Alves' and deleted_at is null")[0]["id"]
    c = abrir(nav, "pdf", "w13-nutri", f"/painel/alunos/{marina}")
    try:
        fechar_faixa(c)
        c.esperar(lambda: c.tem("[data-menu-perfil]"), 60)
        c.pg.wait_for_timeout(1500)
        c.pg.locator("[data-menu-perfil]").first.click()
        c.esperar(lambda: c.tem('[data-acao-perfil="pdf-dados"]'), 10)
        DOWNLOADS.mkdir(parents=True, exist_ok=True)
        with c.pg.expect_download(timeout=60000) as d:
            c.pg.locator('[data-acao-perfil="pdf-dados"]').click()
        destino = DOWNLOADS / f"{c.prefixo}_dados_evolucao_marina.pdf"
        d.value.save_as(str(destino))
        bruto = destino.read_bytes()
        p.check(b"Faulkner - 4 dobras" in bruto, f"[herdados] PDF Dados & Evolução: 'Faulkner - 4 dobras' ({destino.name}, {len(bruto)} bytes)")
        p.check(b"COMPOSICAO CORPORAL - FAULKNER - 4 DOBRAS" in bruto and b"(3 dobras)" not in bruto,
                "[herdados] PDF: o título da composição com o protocolo da última avaliação (e nenhum '3 dobras')")
    finally:
        c.fim()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:5173")
    ap.add_argument("--prefixo", default="local")
    ap.add_argument("--casos", default=",".join(CASOS))
    a = ap.parse_args()
    ESTADO.update(base=a.base.rstrip("/"), prefixo=a.prefixo)
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox"])
        try:
            for nome in a.casos.split(","):
                for tentativa in (1, 2):
                    print(f"\n── {nome}{' (2ª tentativa: o navegador caiu)' if tentativa == 2 else ''} ──", flush=True)
                    antes = len(p.itens)
                    try:
                        CASOS[nome](nav)  # type: ignore[operator]
                        break
                    except SystemExit:
                        raise
                    except Exception as e:  # noqa: BLE001
                        caiu = "Target crashed" in str(e) or "has been closed" in str(e)
                        if caiu and tentativa == 1:
                            # o Chromium do notebook (pouca RAM) às vezes cai no meio: o caso roda de novo, do zero
                            del p.itens[antes:]
                            nav.close()
                            nav = pw.chromium.launch(args=["--no-sandbox"])
                            time.sleep(5)
                            continue
                        p.check(False, f"[{nome}] erro: {str(e)[:300]}")
                        break
                time.sleep(4)  # pausa entre as trocas de token (o Banco do Treino é frágil)
        finally:
            nav.close()
    raise SystemExit(p.fim())


if __name__ == "__main__":
    main()
