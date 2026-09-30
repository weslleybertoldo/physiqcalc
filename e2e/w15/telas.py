#!/usr/bin/env python3
"""Physiq W15 — E2E das telas: Perfil do aluno › Treino (editor da tela 8, lado esquerdo) e o card Treino do Resumo (tela 7).

Positivo (Lucas, dono + personal do Rafael): o editor abre com A/B/C, "+" e Modelos; o professor digita a prescrição dos 5
exercícios do treino A (séries × repetições · descanso · carga — NF1) e a observação (NF2) e o banco do schema do teste guarda
exatamente nas colunas que o app lê; arrasta, adiciona da biblioteca e tira exercício (direto no treino só do Rafael); no
treino compartilhado a lista vira cópia só do Rafael; Modelos dá e tira treino; "+" cria treino; cadeado, descanso padrão,
semana (dias, alternado), padrão N (a prescrição fica), troca do treino (NF7), volume, histórico, relatório (PDF e Excel) e PDF
do treino baixam. O card Treino do Resumo mostra o MESMO "N de M na semana" do app e as MESMAS séries por grupo da aba.
Negativo: o Bruno (2º personal, não é o responsável) não abre o Rafael; a Camila (nutricionista) vê a aba como "do módulo
Treino"; valor inválido não grava; aluno sem login mostra "o treino nasce no 1º acesso".

Uso: python3 e2e/w15/telas.py --base http://localhost:5173 --prefixo local   (staging: --base https://physiqcalc-staging.vercel.app
     --prefixo staging). Contexto limpo por caso, painel 1280 × 883 × 2 (as telas 7 e 8). A massa volta ao começo no fim.
"""
from __future__ import annotations

import argparse
import datetime as dt
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

from playwright.sync_api import sync_playwright  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
p = B.p
DOWNLOADS = B.SCRATCH / "downloads"


def rota_do(nome: str, conta: str) -> str:
    pac = B.B14.paciente(nome, conta)
    assert pac, f"matrícula não achada: {nome}"
    return pac["treino_user_id"] or pac["id"]


def presc(aluno: str, grupo: str, exercicio: str) -> dict | None:
    r = [x for x in B.linhas_prescricao(aluno) if x["grupo_id"] == grupo and x["exercicio_id"] == exercicio]
    return r[0] if r else None


def ordem(grupo: str) -> list[str]:
    return [x["n"] for x in B.sql_treino(f"""select e.nome as n from {S}.tb_grupos_exercicios ge join {S}.tb_exercicios e on e.id = ge.exercicio_id
                                               where ge.grupo_id = '{grupo}' order by ge.ordem""")]


def grupos_do(aluno: str) -> set[str]:
    return {r["g"] for r in B.sql_treino(f"select grupo_id::text as g from {S}.tb_grupos_treino_perfis where user_id = '{aluno}'")}


def config(aluno: str) -> dict:
    return B.sql_treino(f"""select series_travadas, tempo_descanso_segundos, series_modo, series_padrao_qtd, proxima_troca_treino::text as troca
                              from {S}.physiq_profiles where id = '{aluno}'""")[0]


def linha(c, nome: str):
    return c.pg.locator(f'[data-exercicio-nome="{nome}"]').first


def digitar(c, nome: str, campo: str, valor: str) -> None:
    inp = linha(c, nome).locator(f'[data-campo-input="{campo}"]')
    inp.click()
    inp.fill(valor)
    inp.press("Enter")
    c.pg.wait_for_timeout(250)


def abrir_aba(c, rotulo: str) -> None:
    c.pg.locator(f'[data-treino-rotulo="{rotulo}"]').first.click()
    c.pg.wait_for_timeout(500)


def arrastar(c, de: str, para: str) -> None:
    """dnd-kit (PointerSensor, 4 px para começar): pega a alça de `de` e solta em cima da linha `para`."""
    alca = linha(c, de).locator("[data-exercicio-arrastar]")
    alvo = linha(c, para)
    a = alca.bounding_box()
    b = alvo.bounding_box()
    assert a and b
    c.pg.mouse.move(a["x"] + a["width"] / 2, a["y"] + a["height"] / 2)
    c.pg.mouse.down()
    c.pg.mouse.move(a["x"] + a["width"] / 2, a["y"] + a["height"] / 2 - 8, steps=4)
    c.pg.mouse.move(b["x"] + 40, b["y"] + b["height"] / 2 - 6, steps=14)
    c.pg.wait_for_timeout(200)
    c.pg.mouse.up()
    c.pg.wait_for_timeout(600)


def baixar(c, seletor: str, nome: str) -> Path | None:
    DOWNLOADS.mkdir(parents=True, exist_ok=True)
    try:
        with c.pg.expect_download(timeout=60000) as d:
            c.pg.locator(seletor).first.click()
        destino = DOWNLOADS / f"{c.prefixo}_{nome}_{d.value.suggested_filename}"
        d.value.save_as(str(destino))
        return destino
    except Exception as e:  # noqa: BLE001
        print("   download falhou:", e)
        return None


def esperar_editor(c, nome: str) -> bool:
    ok = c.esperar(lambda: c.pg.locator("[data-exercicio-editor]").count() > 0, 120)
    p.check(ok, f"[{nome}] o editor do treino abriu com os exercícios")
    return ok


def caso_editor(nav, base: str, prefixo: str, m: dict, rota: str) -> None:
    rafael, A, Bg = m["rafael"], m["A"], m["B"]
    B.saude_ok("o editor (prescrição)")
    c = B.Caso(nav, base, prefixo, "editor")
    try:
        c.entrar("w13-dono", f"/painel/alunos/{rota}/treino")
        c.fechar_avisos()
        if not esperar_editor(c, "editor"):
            return
        rot = [c.pg.locator("[data-treino-aba]").nth(i).get_attribute("data-treino-rotulo") for i in range(c.pg.locator("[data-treino-aba]").count())]
        p.check(rot == ["A · Peito e tríceps", "B · Costas", "C · Pernas"], f"abas A/B/C na ordem da semana ({rot})")
        p.check(c.tem("[data-treino-novo]") and c.tem("[data-treino-modelos]"), "'+' e Modelos no cabeçalho")
        p.check(c.pg.locator("[data-chip-exercicios]").inner_text().strip() == "5 EXERCÍCIOS", "chip 5 EXERCÍCIOS")
        p.check(c.pg.locator("[data-chip-cadeado]").get_attribute("data-chip-cadeado") == "travado", "chip ALUNO NÃO MUDA AS SÉRIES")
        p.check("DESCANSO PADRÃO 60 S" in c.pg.locator("[data-chip-descanso]").inner_text(), "chip DESCANSO PADRÃO 60 S")
        p.check("TREINO ALTERNADO: NÃO" in c.pg.locator("[data-chip-alternado]").inner_text(), "chip TREINO ALTERNADO: NÃO")
        p.check(c.pg.locator("[data-treino-adicionar]").inner_text().strip() == "Adicionar exercício da biblioteca (81 com GIF)", "botão da biblioteca (81 com GIF)")
        p.check(c.pg.locator('[data-exercicio-editor] [data-miniatura]').count() >= 5, "miniatura do GIF em cada exercício")
        # começa vazio (como hoje): o descanso mostra o padrão apagado, reps e carga com "—"
        p.check(linha(c, "Supino Reto com Barra").locator('[data-campo-input="reps"]').input_value() == "", "sem prescrição: REPS vazio (como hoje)")

        # ── o professor digita a prescrição dos 5 exercícios (NF1) ──
        for nome, s, r, d, kg in B.TREINO_A:
            digitar(c, nome, "series", str(s))
            digitar(c, nome, "reps", r)
            digitar(c, nome, "descanso", str(d))
            digitar(c, nome, "carga", str(kg))
            ok = B.esperar(lambda: (lambda x: bool(x) and x["num_series"] == s and x["reps_alvo"] == r and x["descanso_segundos"] == d and x["carga"] == float(kg))(
                presc(rafael, A, B.exercicio_id(nome))), 30, 1.5)
            p.check(bool(ok), f"banco ({S}): {nome} = {s} × {r} · {d} s · {kg} kg")
            time.sleep(0.6)
        c.pg.wait_for_timeout(800)
        vals = [linha(c, n).locator(f'[data-campo-input="{f}"]').input_value() for n, *_ in B.TREINO_A[:1] for f in ("series", "reps", "descanso", "carga")]
        p.check(vals == ["4", "10", "60 s", "60 kg"], f"a tela mostra 4 · 10 · 60 s · 60 kg ({vals})")
        p.check(c.pg.locator("[data-chip-series]").inner_text().strip() == "18 SÉRIES", f"chip 18 SÉRIES ({c.pg.locator('[data-chip-series]').inner_text()})")

        # ── observação para o aluno (NF2) ──
        obs = c.pg.locator("[data-treino-observacao-campo]")
        obs.click()
        obs.fill(B.OBSERVACAO)
        c.pg.locator("[data-chip-exercicios]").click()  # sai do campo
        ok = B.esperar(lambda: any(x["observacao"] == B.OBSERVACAO and not x["exercicio_id"] and x["grupo_id"] == A for x in B.linhas_prescricao(rafael)), 30, 1.5)
        p.check(bool(ok), f"banco ({S}): observação na linha geral do treino A")
        c.pg.mouse.move(5, 5)
        c.esperar(lambda: c.pg.locator("[data-sonner-toast]").count() == 0, 12)
        B.PRINTS.mkdir(parents=True, exist_ok=True)
        c.pg.locator("[data-editor-treino]").first.screenshot(path=str(B.PRINTS / f"{prefixo}_editor_treino.png"))
        c.print("aba_treino")

        # ── negativo: valor inválido não grava ──
        antes = presc(rafael, A, B.exercicio_id("Tríceps Pulley"))
        digitar(c, "Tríceps Pulley", "reps", "doze")
        c.pg.wait_for_timeout(1200)
        p.check(presc(rafael, A, B.exercicio_id("Tríceps Pulley")) == antes, "REPS 'doze' não grava (o banco fica como estava)")
        p.check(linha(c, "Tríceps Pulley").locator('[data-campo-input="reps"]').input_value() == "12", "o campo volta ao valor salvo")

        # ── arrastar (lista do treino só do Rafael: muda direto) ──
        B.saude_ok("arrastar/adicionar/tirar")
        arrastar(c, "Tríceps Pulley", "Supino Reto com Barra")
        ok = B.esperar(lambda: ordem(A)[0] == "Tríceps Pulley", 30, 1.5)
        p.check(bool(ok), f"arrastar: Tríceps Pulley foi para o 1º lugar ({ordem(A)})")
        arrastar(c, "Tríceps Pulley", "Tríceps Francês com Halter")
        B.esperar(lambda: ordem(A)[-1] == "Tríceps Pulley", 30, 1.5)
        p.check(ordem(A) == [n for n, *_ in B.TREINO_A], f"arrastar de volta: a ordem da tela 8 ({ordem(A)})")

        # ── adicionar da biblioteca e tirar ──
        c.pg.locator("[data-treino-adicionar]").click()
        p.check(c.esperar(lambda: c.tem("[data-folha-biblioteca]"), 20), "a biblioteca abre")
        c.esperar(lambda: c.pg.locator("[data-biblioteca-item]").count() > 20, 30)
        p.check(c.pg.locator("[data-biblioteca-item]").count() >= 81, f"81 exercícios na biblioteca ({c.pg.locator('[data-biblioteca-item]').count()})")
        c.pg.locator("[data-biblioteca-busca]").fill("rosca direta")
        c.pg.wait_for_timeout(400)
        c.print("biblioteca")
        c.pg.locator('[data-biblioteca-item="Rosca Direta com Barra"]').click()
        ok = B.esperar(lambda: "Rosca Direta com Barra" in ordem(A), 30, 1.5)
        p.check(bool(ok), "adicionar: Rosca Direta entrou no treino A (direto, só do Rafael)")
        p.check(c.esperar(lambda: c.tem('[data-exercicio-nome="Rosca Direta com Barra"]'), 20), "a linha nova aparece no editor")
        linha(c, "Rosca Direta com Barra").locator("[data-exercicio-remover]").click()  # o confirm é aceito pelo Caso
        ok = B.esperar(lambda: "Rosca Direta com Barra" not in ordem(A), 30, 1.5)
        p.check(bool(ok), "tirar: a Rosca saiu do treino A")

        # ── treino compartilhado (B): mudar a lista vira CÓPIA só do Rafael ──
        abrir_aba(c, "B · Costas")
        p.check(c.esperar(lambda: c.tem('[data-exercicio-nome="Puxada Aberta Frontal"]'), 20), "aba B abre com a Puxada")
        p.check(c.tem("[data-treino-compartilhado]"), "B avisa que é compartilhado")
        c.pg.locator("[data-treino-adicionar]").click()
        c.esperar(lambda: c.pg.locator("[data-biblioteca-item]").count() > 20, 30)
        c.pg.locator("[data-biblioteca-busca]").fill("crucifixo invertido")
        c.pg.wait_for_timeout(400)
        c.pg.locator('[data-biblioteca-item="Crucifixo Invertido"]').first.click()
        ok = B.esperar(lambda: Bg not in grupos_do(rafael), 30, 1.5)
        p.check(bool(ok) and Bg in grupos_do(m["lucas"]), "B virou cópia só do Rafael (o Lucas segue com o original)")
        p.check("Crucifixo Invertido" not in ordem(Bg), "o B original não mudou")
        p.check(c.esperar(lambda: c.tem('[data-exercicio-nome="Crucifixo Invertido"]') and c.tem('[data-treino-rotulo="B · Costas"]'), 30),
                "a aba segue 'B · Costas', agora com o exercício novo")
        abrir_aba(c, "A · Peito e tríceps")

        # ── cadeado e descanso padrão ──
        B.saude_ok("cadeado/descanso/modelos")
        c.pg.locator("[data-chip-cadeado]").click()
        p.check(bool(B.esperar(lambda: config(rafael)["series_travadas"] is False, 20, 1.5)), "cadeado: o aluno pode mudar as séries (banco)")
        c.pg.locator("[data-chip-cadeado]").click()
        p.check(bool(B.esperar(lambda: config(rafael)["series_travadas"] is True, 20, 1.5)), "cadeado de volta: ALUNO NÃO MUDA AS SÉRIES (banco)")
        c.pg.locator("[data-chip-descanso]").click()
        c.esperar(lambda: c.tem("[data-folha-descanso]"), 10)
        c.pg.locator('[data-descanso-atalho="90"]').click()
        c.pg.locator("[data-descanso-salvar]").click()
        p.check(bool(B.esperar(lambda: config(rafael)["tempo_descanso_segundos"] == 90, 20, 1.5)), "descanso padrão 90 s (banco)")
        c.esperar(lambda: "90 S" in c.pg.locator("[data-chip-descanso]").inner_text(), 10)
        c.pg.locator("[data-chip-descanso]").click()
        c.esperar(lambda: c.tem("[data-folha-descanso]"), 10)
        c.pg.locator('[data-descanso-atalho="60"]').click()
        c.pg.locator("[data-descanso-salvar]").click()
        p.check(bool(B.esperar(lambda: config(rafael)["tempo_descanso_segundos"] == 60, 20, 1.5)), "descanso padrão de volta a 60 s")

        # ── Modelos (dar e tirar) e "+" (treino novo) ──
        c.pg.locator("[data-treino-modelos]").click()
        c.esperar(lambda: c.pg.locator("[data-modelo-usar]").count() > 0, 30)
        nome_modelo = c.pg.locator("[data-modelo-usar]").first.get_attribute("data-modelo-usar")
        c.print("modelos")
        c.pg.locator("[data-modelo-usar]").first.click()
        ok = c.esperar(lambda: c.pg.locator(f'[data-treino-aba][data-treino-rotulo$="{nome_modelo}"]').count() > 0, 30)
        p.check(ok, f"Modelos › Dar ao aluno: '{nome_modelo}' virou uma aba")
        c.pg.locator(f'[data-treino-aba][data-treino-rotulo$="{nome_modelo}"]').first.click()
        c.pg.wait_for_timeout(500)
        c.pg.locator("[data-treino-tirar]").click()
        ok = c.esperar(lambda: c.pg.locator(f'[data-treino-aba][data-treino-rotulo$="{nome_modelo}"]').count() == 0, 30)
        p.check(ok, f"Tirar do aluno: '{nome_modelo}' saiu")
        c.pg.locator("[data-treino-novo]").click()
        c.esperar(lambda: c.tem("[data-novo-treino-nome]"), 10)
        c.pg.locator("[data-novo-treino-nome]").fill("Treino D W15")
        c.pg.locator("[data-novo-treino-criar]").click()
        novo = '[data-treino-aba][data-treino-rotulo$="Treino D W15"]'
        ok = c.esperar(lambda: c.tem(novo), 30)
        p.check(ok, f"+ › treino novo (vazio, só do Rafael) ganha a letra seguinte ({c.pg.locator(novo).first.get_attribute('data-treino-rotulo') if ok else '-'})")
        if ok:
            p.check(c.pg.locator("[data-treino-aba]").count() == 4 and c.pg.locator(novo).first.is_visible(), "4 treinos: a 4ª aba aparece (as abas quebram a linha)")
            c.pg.locator(novo).first.click()
            p.check(c.esperar(lambda: c.tem("[data-treino-sem-exercicios]"), 10), "treino novo sem exercícios")
            c.pg.locator("[data-treino-tirar]").click()
            p.check(c.esperar(lambda: not c.tem(novo), 30), "o treino novo sai do aluno (Tirar do aluno)")
    finally:
        c.fim()


def caso_semana_series(nav, base: str, prefixo: str, m: dict, rota: str) -> None:
    rafael = m["rafael"]
    B.saude_ok("semana/séries/troca")
    c = B.Caso(nav, base, prefixo, "semana")
    try:
        c.entrar("w13-dono", f"/painel/alunos/{rota}/treino")
        c.fechar_avisos()
        if not esperar_editor(c, "semana"):
            return
        # sexta: tira o B e põe o C (cliques seguidos: a 2ª gravação já parte da lista nova); depois volta
        dia_sql = lambda d: [x["g"] for x in B.sql_treino(f"select grupo_id::text as g from {S}.tb_semana_treinos where user_id = '{rafael}' and dia_semana = '{d}' and not extra order by slot_idx")]  # noqa: E731
        sexta_antes = dia_sql("SEX")
        sexta = c.pg.locator('[data-semana-dia="SEX"]')
        sexta.locator("[data-semana-treino][data-marcado]").first.click()
        sexta.locator('[data-semana-treino="catalogo:' + m["C"] + '"]').click()
        ok = B.esperar(lambda: dia_sql("SEX") == [m["C"]], 20, 1.5)
        p.check(bool(ok), f"semana: sexta passou a ter só o treino C, com 2 cliques seguidos (banco: {dia_sql('SEX')})")
        # segunda com A e B + alternado
        seg = c.pg.locator('[data-semana-dia="SEG"]')
        seg.locator('[data-semana-treino="catalogo:' + m["C"] + '"]').click()
        B.esperar(lambda: len(B.sql_treino(f"select 1 from {S}.tb_semana_treinos where user_id = '{rafael}' and dia_semana = 'SEG'")) == 2, 20, 1.5)
        c.pg.wait_for_timeout(600)
        c.pg.locator('[data-semana-alternar="SEG"]').click()
        ok = B.esperar(lambda: B.sql_treino(f"select alternado from {S}.tb_semana_dia_config where user_id = '{rafael}' and dia_semana = 'SEG'") == [{"alternado": True}], 20, 1.5)
        p.check(bool(ok), "semana: segunda alternando A ⇄ C (banco)")
        p.check(c.esperar(lambda: c.tem('[data-semana-esta="SEG"]'), 20), f"'Esta semana: …' na segunda")
        p.check(c.esperar(lambda: "TREINO ALTERNADO: SIM" in c.pg.locator("[data-chip-alternado]").inner_text(), 20), "chip TREINO ALTERNADO: SIM")
        c.pg.locator("#semana-do-aluno").screenshot(path=str(B.PRINTS / f"{prefixo}_semana.png"))
        c.pg.locator('[data-semana-alternar="SEG"]').click()
        B.esperar(lambda: B.sql_treino(f"select alternado from {S}.tb_semana_dia_config where user_id = '{rafael}' and dia_semana = 'SEG'") == [{"alternado": False}], 20, 1.5)
        seg.locator('[data-semana-treino="catalogo:' + m["C"] + '"]').click()
        B.esperar(lambda: dia_sql("SEG") == [m["A"]], 20, 1.5)
        sexta.locator('[data-semana-treino="catalogo:' + m["C"] + '"]').click()
        for g in sexta_antes:
            sexta.locator(f'[data-semana-treino="catalogo:{g}"]').click()
        p.check(bool(B.esperar(lambda: dia_sql("SEX") == sexta_antes and dia_sql("SEG") == [m["A"]], 20, 1.5)), "semana de volta como estava")

        # padrão N para todos: a prescrição fica (só o nº de séries muda)
        B.saude_ok("padrão N")
        c.pg.get_by_role("radio", name="Padrão para todos").click()
        c.esperar(lambda: c.tem("[data-series-padrao]"), 20)
        c.pg.get_by_role("button", name="Mais uma série").click()
        c.pg.locator("[data-series-aplicar]").click()
        sup = B.exercicio_id("Supino Reto com Barra")
        ok = B.esperar(lambda: (lambda x: bool(x) and x["num_series"] == 4 and x["reps_alvo"] == "10" and x["carga"] == 60.0)(presc(rafael, m["A"], sup)) and config(rafael)["series_padrao_qtd"] == 4, 30, 1.5)
        p.check(bool(ok), "Padrão 4 para todos: séries 4 e a prescrição (10 reps, 60 kg) fica")
        c.pg.get_by_role("radio", name="Por exercício").click()
        B.esperar(lambda: config(rafael)["series_modo"] == "personalizada", 20, 1.5)

        # troca do treino (NF7)
        c.pg.locator("[data-troca-data]").fill("2026-10-19")
        ok = B.esperar(lambda: config(rafael)["troca"] == "2026-10-19", 20, 1.5)
        p.check(bool(ok), "troca do treino 19/10 (banco)")
        p.check(c.esperar(lambda: c.tem("[data-troca-chip]"), 20), "chip da troca aparece")
        c.pg.locator("[data-series-troca]").screenshot(path=str(B.PRINTS / f"{prefixo}_series_troca.png"))

        # volume, histórico, relatório e PDF do treino
        B.saude_ok("volume/histórico/relatório")
        p.check(c.esperar(lambda: c.pg.locator("[data-volume-aluno] [data-volume-grupo]").count() >= 3, 30), "volume semanal por grupo")
        p.check(c.esperar(lambda: c.pg.locator("[data-historico-item]").count() >= len(m["feitos"]), 30), f"histórico do mês com {len(m['feitos'])} treinos")
        c.pg.locator("[data-historico-item]").first.click()
        p.check(c.esperar(lambda: c.pg.locator("[data-historico-detalhe] li").count() > 0, 30), "histórico: o treino feito abre com as séries")
        c.pg.keyboard.press("Escape")
        c.pg.wait_for_timeout(500)
        c.pg.locator("[data-volume-aluno]").screenshot(path=str(B.PRINTS / f"{prefixo}_volume.png"))
        c.pg.locator("[data-historico-aluno]").screenshot(path=str(B.PRINTS / f"{prefixo}_historico.png"))
        pdf = baixar(c, "[data-relatorio-pdf]", "relatorio")
        p.check(bool(pdf) and pdf.stat().st_size > 5000 and pdf.name.endswith(".pdf"), f"relatório do mês em PDF ({pdf.name if pdf else '-'})")
        xls = baixar(c, "[data-relatorio-excel]", "relatorio")
        p.check(bool(xls) and xls.stat().st_size > 3000 and xls.name.endswith(".xlsx"), f"relatório do mês em Excel ({xls.name if xls else '-'})")
        ptreino = baixar(c, "[data-pdf-treino]", "treino")
        corpo = ptreino.read_bytes() if ptreino else b""
        p.check(bool(ptreino) and b"Supino" in corpo and b"60 kg" in corpo, f"PDF do treino com a prescrição ({ptreino.name if ptreino else '-'})")
        c.print("aba_treino_fim")
    finally:
        c.fim()


def caso_resumo(nav, base: str, prefixo: str, m: dict, rota: str) -> None:
    rafael = m["rafael"]
    B.saude_ok("o card Treino do Resumo")
    c = B.Caso(nav, base, prefixo, "resumo")
    try:
        c.entrar("w13-dono", f"/painel/alunos/{rota}")
        c.fechar_avisos()
        ok = c.esperar(lambda: c.tem("[data-card-treino-semana]") and c.pg.locator("[data-card-treino] [data-volume-grupo]").count() > 0, 120)
        p.check(ok, "card Treino do Resumo com a semana e as séries por grupo")
        # o MESMO "N de M" do app do aluno: dias com treino feito / dias com treino na semana (a semana da massa: 5 dias)
        hoje = B.B5.hoje()
        seg = hoje - dt.timedelta(days=hoje.weekday())
        feitos = len([d for d in m["feitos"] if seg.isoformat() <= d <= (seg + dt.timedelta(days=6)).isoformat()])
        esperado = f"{feitos}/5"
        valor = c.pg.locator("[data-card-treino-semana]").get_attribute("data-card-treino-semana")
        p.check(valor == esperado, f"'N de M na semana' = a conta do app ({valor} × {esperado})")
        chips = [c.pg.locator("[data-card-treino-treino]").nth(i).get_attribute("data-card-treino-treino") for i in range(c.pg.locator("[data-card-treino-treino]").count())]
        p.check(chips[:3] == ["A · Peito e tríceps", "B · Costas", "C · Pernas"], f"treinos A/B/C no card ({chips})")
        card = {c.pg.locator("[data-card-treino] [data-volume-grupo]").nth(i).get_attribute("data-volume-grupo"):
                c.pg.locator("[data-card-treino] [data-volume-grupo]").nth(i).get_attribute("data-volume-total")
                for i in range(c.pg.locator("[data-card-treino] [data-volume-grupo]").count())}
        c.pg.locator("[data-card-treino]").screenshot(path=str(B.PRINTS / f"{prefixo}_card_treino.png"))
        c.print("resumo")
        # número = tela: as séries por grupo do card = a seção Volume da aba Treino
        c.pg.locator("[data-card-treino-abrir]").click()
        c.esperar(lambda: c.pg.locator("[data-volume-aluno] [data-volume-grupo]").count() > 0, 60)
        aba = {c.pg.locator("[data-volume-aluno] [data-volume-grupo]").nth(i).get_attribute("data-volume-grupo"):
               c.pg.locator("[data-volume-aluno] [data-volume-grupo]").nth(i).get_attribute("data-volume-total")
               for i in range(c.pg.locator("[data-volume-aluno] [data-volume-grupo]").count())}
        p.check(bool(card) and all(aba.get(k) == v for k, v in card.items()), f"séries por grupo: card = aba ({card} × {aba})")
        p.check(c.caminho().startswith(f"/painel/alunos/{rota}/treino"), "Abrir leva à aba Treino")
    finally:
        c.fim()


def caso_negativos(nav, base: str, prefixo: str, m: dict, rota: str, rota_sem_login: str) -> None:
    B.saude_ok("os negativos")
    c = B.Caso(nav, base, prefixo, "bruno")
    try:
        c.entrar("w13-personal2", f"/painel/alunos/{rota}/treino")
        c.fechar_avisos()
        c.esperar(lambda: "Não deu para abrir este aluno" in c.texto() or c.tem("[data-editor-treino]"), 60)
        p.check(not c.tem("[data-editor-treino]"), "Bruno (outro personal) não abre o treino do Rafael")
        c.print("negativo_outro_personal")
    finally:
        c.fim()
    time.sleep(2)
    c = B.Caso(nav, base, prefixo, "camila")
    try:
        c.entrar("w13-nutri", f"/painel/alunos/{rota}/treino")
        c.fechar_avisos()
        ok = c.esperar(lambda: c.tem('[data-sem-treino="sem-papel"]'), 60)
        p.check(ok and not c.tem("[data-editor-treino]"), "Camila (nutricionista) vê a aba como 'do módulo Treino', sem editor")
        c.print("negativo_nutricionista")
    finally:
        c.fim()
    time.sleep(2)
    c = B.Caso(nav, base, prefixo, "sem_login")
    try:
        c.entrar("w13-dono", f"/painel/alunos/{rota_sem_login}/treino")
        c.fechar_avisos()
        ok = c.esperar(lambda: "O treino nasce no 1º acesso do aluno" in c.texto(), 60)
        p.check(ok, "aluno sem login: 'O treino nasce no 1º acesso do aluno'")
    finally:
        c.fim()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:5173")
    ap.add_argument("--prefixo", default="local")
    a = ap.parse_args()
    B.saude_ok("a massa")
    r = subprocess.run([sys.executable, str(Path(__file__).parent / "massa.py")], capture_output=True, text=True)
    print(r.stdout[-400:], r.stderr[-400:])
    m = B.ler_json(B.SCRATCH / "massa_staging.json")
    conta = B.conta_de("w13-dono", B.NOME_CONTA)
    rota = rota_do("Rafael Moura", conta)
    rota_sem_login = rota_do("João Pedro", conta)
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox"])
        try:
            caso_editor(nav, a.base, a.prefixo, m, rota)
            time.sleep(3)
            caso_semana_series(nav, a.base, a.prefixo, m, rota)
            time.sleep(3)
            caso_resumo(nav, a.base, a.prefixo, m, rota)
            time.sleep(3)
            caso_negativos(nav, a.base, a.prefixo, m, rota, rota_sem_login)
        finally:
            nav.close()
    # a massa volta ao começo (a prescrição digitada fica para os prints do staging da próxima rodada, que a monta de novo)
    subprocess.run([sys.executable, str(Path(__file__).parent / "massa.py")], capture_output=True)
    return p.fim()


if __name__ == "__main__":
    raise SystemExit(main())
