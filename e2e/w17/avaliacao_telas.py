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
No fim tudo volta ao que era (o perfil do Treino do Diego é guardado antes e restaurado).

Uso: python3 e2e/w17/avaliacao_telas.py --base http://localhost:5173 --prefixo local   (staging: --base https://physiqcalc-staging.vercel.app --prefixo staging)
     Contexto limpo por caso, painel 1280 × 883 × 2 (tela 7) e app 390 × 844 × 3,4 (tela 4).
"""
from __future__ import annotations

import argparse
import json
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


CASOS = {"personal": caso_personal, "nutri": caso_nutri, "resumo": caso_resumo, "app": caso_app, "fotos": caso_fotos,
         "excluir": caso_excluir, "negativos": caso_negativos}


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


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--prefixo", required=True)
    ap.add_argument("--casos", default="personal,nutri,resumo,app,fotos,excluir,negativos")
    # hml-18a: o E2E de tela sempre com o Edge no notebook (o Chromium do Playwright cai nas páginas longas — hml-11/hml-16)
    ap.add_argument("--canal", default="chromium", choices=("chromium", "msedge", "chrome"))
    a = ap.parse_args()
    ESTADO.update(base=a.base.rstrip("/"), prefixo=a.prefixo)
    B.saude_ok(f"avaliação — telas ({a.prefixo})")
    m = massa()
    ESTADO["m"] = m
    B.json_arquivo(B.SCRATCH / f"perfil_diego_antes_{a.prefixo}.json", m["perfil0"])
    t0 = time.time()
    try:
        with sync_playwright() as pw:
            nav = pw.chromium.launch(channel=a.canal, args=["--no-sandbox"])
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
