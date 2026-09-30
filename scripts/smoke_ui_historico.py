#!/usr/bin/env python3
"""Smoke de UI: painel › Treinos › "Histórico de Treinos" (todos os alunos, filtro por aluno, detalhe de UM treino, histórico
completo de um aluno) + a aba Relatório.

W8: a versão de antes estava presa aos dados de agosto/2026 (nomes e números fixos). Agora o oráculo é a MESMA função da tela
(admin-relatorio: historicoMes), com a sessão do Treino do profissional de teste vinda da troca de token: o smoke escolhe o mês
mais recente com treinos e confere a tela contra ela. Login como o app de hoje (W3 — e2e/w08/_base.py). Só leitura.
O histórico do ALUNO (calendário da aba Treino nova, com detalhe, compartilhar e excluir) é coberto em e2e/w08/telas.py.

Uso: SMOKE_BASE=http://localhost:5173 python3 scripts/smoke_ui_historico.py   (SMOKE_SCHEMA=staging)
"""
from __future__ import annotations

import importlib.util
import os
import re
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.dont_write_bytecode = True
_ESPEC = importlib.util.spec_from_file_location("_base_w08", Path(__file__).resolve().parent.parent / "e2e" / "w08" / "_base.py")
B = importlib.util.module_from_spec(_ESPEC)
sys.modules["_base_w08"] = B
_ESPEC.loader.exec_module(B)  # type: ignore[union-attr]

BASE = os.environ.get("SMOKE_BASE", "http://localhost:5173").rstrip("/")
SCHEMA = os.environ.get("SMOKE_SCHEMA", "staging")
REF = "uxwpwdbbnlticxgtzcsb"
MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]
p = B.p


def tem(texto: str, alvo: str) -> bool:
    return alvo.upper() in (texto or "").upper()


def espera_carregar(pg, escopo=None, timeout_ms=90000) -> bool:
    limite = time.time() + timeout_ms / 1000
    while time.time() < limite:
        try:
            texto = (escopo or pg.locator("body")).inner_text()
        except Exception:  # noqa: BLE001
            texto = "Carregando"
        if "Carregando" not in texto:
            return True
        pg.wait_for_timeout(400)
    return False


def main() -> int:
    B.ESTADO["schema"] = SCHEMA
    if not B.saude_treino():
        print("Banco do Treino fora do normal — parando sem testar.")
        return 2
    st, sess = B.B5.trocar_token("master")
    assert st == 200 and sess.get("access_token"), (st, sess)
    cab = {"apikey": B.B5.anon(REF), "Authorization": f"Bearer {sess['access_token']}", "x-schema": SCHEMA, "Origin": "http://localhost:5173"}

    def edge(corpo: dict) -> dict:
        s, r, _ = B.B5.http("POST", "https://api.physiqcalc.com.br/functions/v1/admin-relatorio", corpo, cab, timeout=120)
        assert s == 200, (s, r)
        return r if isinstance(r, dict) else {}

    alvo = None
    hoje = time.localtime()
    ano, mes = hoje.tm_year, hoje.tm_mon
    for _ in range(18):
        itens = edge({"action": "historicoMes", "ano": ano, "mes": mes}).get("itens", [])
        if itens:
            alvo = (ano, mes, itens)
            break
        mes -= 1
        if mes == 0:
            ano, mes = ano - 1, 12
    p.check(alvo is not None, "oráculo: achou um mês com treinos nos últimos 18 meses")
    if not alvo:
        return p.fim()
    ano, mes, itens = alvo
    por_aluno: dict[str, list] = {}
    for i in itens:
        por_aluno.setdefault(i["pessoa"], []).append(i)
    pessoa = max(por_aluno, key=lambda k: len(por_aluno[k]))
    print(f"== alvo: {MESES[mes - 1]}/{ano} · {len(itens)} treinos · aluno com mais: {pessoa} ({len(por_aluno[pessoa])}) ==", flush=True)

    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        c = B.abrir_painel(nav, BASE, os.environ.get("SMOKE_PREFIXO", "local"), "painel_historico", "/admin?v=treinos&t=historico")
        pg = c.pg
        try:
            print("== 1. /admin?v=treinos&t=historico abre o painel › Treinos › Histórico de Treinos ==", flush=True)
            pg.wait_for_selector("text=Histórico completo de um aluno", timeout=120000)
            p.check(c.caminho().startswith("/painel/treinos"), f"redirecionou para {c.caminho()}")
            abas = pg.eval_on_selector_all("div.flex.border-b button", "els => els.map(e => e.textContent.trim())")
            p.check("Histórico de Treinos" in abas and "Relatório" in abas and abas.index("Histórico de Treinos") < abas.index("Relatório"), f"abas: {abas}")

            print(f"== 2. {MESES[mes - 1]}/{ano}: a lista == a função (todos os alunos) ==", flush=True)
            pg.locator("[data-historico-ano]").select_option(str(ano))
            pg.locator("[data-historico-mes]").select_option(str(mes))
            pg.wait_for_timeout(600)
            p.check(espera_carregar(pg), "recarregou")
            linhas = pg.locator("[data-historico-linha]")
            c.esperar(lambda: linhas.count() == len(itens), 60)
            p.check(linhas.count() == len(itens), f"mesmo nº de treinos que a função (tela {linhas.count()} × função {len(itens)})")
            corpo = "\n".join(linhas.all_inner_texts())
            p.check(all(tem(corpo, k) for k in por_aluno), f"todos os alunos do mês aparecem ({', '.join(por_aluno)})")

            print("== 3. filtro por aluno ==", flush=True)
            sel_aluno = pg.locator("select").nth(3)
            opcoes = sel_aluno.locator("option").all_inner_texts()
            p.check("Todos os alunos" in opcoes, "o filtro tem 'Todos os alunos'")
            rotulo = next((o for o in opcoes if o.startswith(pessoa)), None)
            p.check(rotulo is not None, f"o filtro lista {pessoa}")
            if rotulo:
                sel_aluno.select_option(label=rotulo)
                pg.wait_for_timeout(1200)
                vis = pg.locator("[data-historico-linha]").all_inner_texts()
                p.check(len(vis) == len(por_aluno[pessoa]) and all(tem(v, pessoa) for v in vis), f"filtrando por {pessoa}: {len(vis)} linhas, só dele")
                cont = pg.locator("[data-historico-contagem]").inner_text() if pg.locator("[data-historico-contagem]").count() else ""
                n_rot = int(re.search(r"(\d+)", cont).group(1)) if re.search(r"(\d+)", cont) else -1
                p.check(n_rot == len(vis), f"a contagem do rótulo bate ({cont})")
                sel_aluno.select_option("")
                pg.wait_for_timeout(1200)
                p.check(pg.locator("[data-historico-linha]").count() == len(itens), "voltar a 'Todos os alunos' restaura a lista")

            print("== 4. a linha abre SÓ aquele treino ==", flush=True)
            pg.locator("[data-historico-linha]").first.click()
            pg.wait_for_selector("div.fixed.inset-0.z-50", timeout=30000)
            popup = pg.locator("div.fixed.inset-0.z-50")
            p.check(espera_carregar(pg, popup), "o detalhe terminou de carregar")
            txt = popup.inner_text()
            p.check(tem(txt, "Duração") and tem(txt, "Academia") and tem(txt, "Volume total") and tem(txt, "Média peso/rep"), "as 4 caixas do treino")
            p.check(not tem(txt, "Todos os meses") and not tem(txt, "Tempo total"), "é o detalhe de UM treino (não o histórico completo)")
            p.check(popup.locator("button[title='Excluir treino']").count() == 0, "o profissional não vê excluir")
            pg.keyboard.press("Escape")
            pg.wait_for_timeout(700)
            p.check(pg.locator("div.fixed.inset-0.z-50").count() == 0, "ESC fecha")

            print("== 5. 'Buscar': o histórico completo de um aluno ==", flush=True)
            sel_topo = pg.locator("select").first
            c.esperar(lambda: sel_topo.locator("option").count() > 1, 30)
            op_topo = sel_topo.locator("option").all_inner_texts()
            alvo_topo = next((o for o in op_topo if o.startswith(f"{pessoa} (")), None)
            p.check(alvo_topo is not None, f"{pessoa} no seletor do topo")
            if alvo_topo:
                sel_topo.select_option(label=alvo_topo)
                # o "Buscar" da tela (não a busca global da casca, Ctrl K)
                pg.get_by_role("button", name="Buscar", exact=True).click()
                pg.wait_for_selector("div.fixed.inset-0.z-50", timeout=30000)
                popup = pg.locator("div.fixed.inset-0.z-50").last
                p.check(c.esperar(lambda: tem(popup.inner_text(), "Tempo total") and not tem(popup.inner_text(), "Carregando"), 60), "o histórico completo carregou")
                t = popup.inner_text()
                p.check(tem(t, pessoa) or tem(t, "Histórico"), "é do aluno escolhido")
                p.check(tem(t, "Todos os meses") and tem(t, "Tempo total") and tem(t, "Média"), "histórico completo: seletor de mês e Total/Tempo total/Média")
                c.print("painel_historico_completo")
                pg.keyboard.press("Escape")
                pg.wait_for_timeout(600)

            print("== 6. aba Relatório abre para um aluno ==", flush=True)
            c.ir("/admin?v=treinos&t=relatorio")
            pg.wait_for_selector("select", timeout=60000)
            pg.wait_for_timeout(1500)
            c.esperar(lambda: pg.locator("select").first.locator("option").count() > 1, 30)
            op_rel = pg.locator("select").first.locator("option").all_inner_texts()
            alvo_rel = next((o for o in op_rel if o.startswith(f"{pessoa} (") or o == pessoa), None)
            p.check(alvo_rel is not None, f"{pessoa} no seletor do relatório")
            if alvo_rel:
                pg.locator("select").first.select_option(label=alvo_rel)
                pg.wait_for_timeout(4000)
                p.check(re.search(r"TREINOS NO M[ÊE]S", pg.inner_text("body"), re.IGNORECASE) is not None, "o relatório do aluno mostra 'Treinos no mês'")
            graves = [x for x in c.console if x.startswith("error") and "realtime" not in x.lower() and "Failed to load resource" not in x]
            p.check(not graves, f"sem erro de console ({graves[:2]})")
        finally:
            c.fim()
            nav.close()
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
