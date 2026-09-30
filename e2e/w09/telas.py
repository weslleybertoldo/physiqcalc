#!/usr/bin/env python3
"""Physiq W9 — E2E de TELA da troca de exercício por equivalente (tela 2) e dos campos da biblioteca (tela 8).

Em série (o Banco do Treino é uma VM Nano), contexto limpo por caso, `/health` antes de cada um. Os fluxos do aluno rodam SEM
INTERNET depois do 1º sync (P20 — ver _base.py) e conferem a subida para o staging na volta; a biblioteca (master e profissional)
grava pelo REST no schema do build (staging) e o teste apaga o que criou.

Casos (na ordem):
  equivalentes  treino próprio com a rosca martelo na polia → "Trocar" abre em Equivalentes com a rosca martelo com halteres;
                Mesmo músculo (outras roscas); Todos com busca (quem está no treino não entra); negativo: exercício próprio
                sem classificação abre no Mesmo músculo; troca DE VEZ num treino próprio (o grupo muda) → sobe para o staging
  academia      academia nova com os equipamentos marcados (sem polia) → o cross-over (polia) vai para o fim, apagado, "não tem
                na sua academia"; Limpar = sem filtro; volta a internet → staging com o text[] certo
  dia_vez       treino do profissional: troca SÓ HOJE (selo "trocado") → Restaurar; troca DE VEZ → vale amanhã; a só hoje não
                → volta a internet → staging com a de vez (sem data) e sem a do dia
  biblioteca_master        master › Biblioteca global: movimento e equipamento na lista e no formulário; cria um global com os
                           campos (staging) e apaga
  biblioteca_profissional  painel › Treinos › Biblioteca › Minha: cria um exercício com movimento e equipamento e apaga
Uso: python3 e2e/w09/telas.py --base http://localhost:5173 --prefixo local [--casos a,b]
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
EX = B.EX
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


def nomes(ops: list[dict]) -> list[str]:
    return [o["nome"] for o in ops]


def montar_meu_treino(c, nome: str, ids: list[str], proprio: str | None = None) -> bool:
    """'Montar o meu' (W8): escolhe os exercícios pela busca, cria um exercício próprio (opcional) e vira o treino do dia."""
    if c.tem("[data-sem-treino-montar]"):
        c.pg.locator("[data-sem-treino-montar]").click()
    else:
        if c.tem("[data-sem-treino-adicionar]"):
            c.pg.locator("[data-sem-treino-adicionar]").click()
        elif c.tem("[data-sem-treino-escolher]"):
            c.pg.locator("[data-sem-treino-escolher]").click()
        else:
            c.pg.locator("[data-treino-opcoes]").first.click()
            c.esperar(lambda: c.tem("[data-opcoes-treino]"), 6)
            c.pg.get_by_text("Trocar o treino do dia").click()
        c.esperar(lambda: c.tem("[data-montar-o-meu]"), 6)
        c.pg.locator("[data-montar-o-meu]").click()
    c.esperar(lambda: c.tem("[data-meu-treino]"), 8)
    c.pg.locator("[data-meu-treino-nome]").fill(nome)
    for ex_id in ids:
        c.pg.locator("[data-meu-treino-busca]").fill("")
        nome_ex = B.sql_treino(f"select nome from public.tb_exercicios where id = '{ex_id}'")[0]["nome"]
        c.pg.locator("[data-meu-treino-busca]").fill(nome_ex)
        c.pg.wait_for_timeout(300)
        c.pg.locator(f'[data-opcao-exercicio="{ex_id}"] button[aria-pressed]').first.click()
    c.pg.locator("[data-meu-treino-busca]").fill("")
    if proprio:
        c.pg.locator("[data-novo-exercicio-abrir]").click()
        c.pg.get_by_label("Nome do exercício novo").fill(proprio)
        c.pg.locator("[data-novo-exercicio-criar]").click()
        c.pg.wait_for_timeout(500)
        c.pg.locator("[data-meu-treino-busca]").fill(proprio)
        c.esperar(lambda: c.pg.locator("[data-opcao-exercicio]", has_text=proprio).count() > 0, 6)
        c.pg.locator("[data-opcao-exercicio]", has_text=proprio).locator("button[aria-pressed]").click()
    c.pg.locator("[data-meu-treino-salvar]").click()
    return c.esperar(lambda: c.tem(f'[data-slot-grupo="{nome}"]'), 12)


@caso
def caso_equivalentes(nav, a) -> None:
    desde = B.agora_iso()
    c = B.B8.abrir_treino(nav, a.base, a.prefixo, "equivalentes")
    arquivos_locais(c)
    meu = "Meu treino W9"
    try:
        B.sem_internet(c)
        ok = montar_meu_treino(c, meu, [EX["martelo_polia"], EX["supino_barra"]], proprio="Supino com pausa W9")
        p.check(ok, "treino próprio com a rosca martelo na polia virou o treino de hoje (sem internet)")
        c.esperar(lambda: c.pg.locator('[data-miniatura="quadro"]').count() >= 2, 10)

        # o exemplo do pedido
        B.abrir_trocar(c, EX["martelo_polia"])
        ops = B.opcoes(c)
        p.check(B.aba_atual(c) == "equivalentes", f"abre em Equivalentes ({B.aba_atual(c)})")
        p.check(bool(ops) and ops[0]["id"] == EX["martelo_halteres"], f"rosca martelo na polia sugere rosca martelo com halteres ({nomes(ops)})")
        p.check(B.texto(c, '[data-trocar-contagem="equivalentes"]') == "1", "contagem de Equivalentes = 1")
        p.check("Halteres" in ops[0]["texto"], f"a opção mostra o equipamento ('{ops[0]['texto'][:60]}')")
        B.sem_avisos(c)
        c.print("trocar_equivalentes")

        B.ir_aba(c, "mesmo")
        mm = nomes(B.opcoes(c))
        p.check("Rosca Direta com Barra" in mm and "Rosca Martelo com Halteres" not in mm, f"Mesmo músculo: outras roscas, sem o equivalente ({len(mm)})")
        c.print("trocar_mesmo_musculo")

        B.ir_aba(c, "todos")
        c.pg.locator("[data-trocar-busca]").fill("supino reto")
        c.pg.wait_for_timeout(400)
        todos = B.opcoes(c)
        barra = next((o for o in todos if o["id"] == EX["supino_barra"]), None)
        p.check(len(todos) >= 4 and barra is not None and barra["bloqueada"], f"Todos com busca: {len(todos)} supinos; o que já está no treino não entra")
        c.print("trocar_todos_busca")
        c.pg.locator("[data-trocar-busca]").fill("zzzz")
        p.check(c.esperar(lambda: "Nenhum exercício encontrado." in B.texto(c, "[data-trocar-exercicio]"), 4), "negativo: busca sem resultado")
        B.fechar_trocar(c)

        # negativo: exercício próprio sem classificação → sem equivalentes, abre no Mesmo músculo
        proprio_id = B.exercicios(c)[-1]
        B.abrir_trocar(c, proprio_id)
        p.check(B.aba_atual(c) == "mesmo" and B.texto(c, '[data-trocar-contagem="equivalentes"]') == "0",
                f"exercício próprio sem movimento: 0 equivalentes, abre no Mesmo músculo ({B.aba_atual(c)})")
        B.fechar_trocar(c)

        # troca DE VEZ num treino próprio: o grupo muda
        B.abrir_trocar(c, EX["martelo_polia"])
        B.escolher(c, EX["martelo_halteres"])
        B.confirmar_troca(c, "definitiva")
        exs = B.exercicios(c)
        p.check(EX["martelo_halteres"] in exs and EX["martelo_polia"] not in exs, "de vez no treino próprio: a rosca com halteres entrou no lugar")
        p.check(B.linha(c, EX["martelo_halteres"]).locator("[data-exercicio-trocado]").count() == 0, "treino próprio de vez = editar o treino (sem o selo 'trocado')")

        B.sem_internet(c, False)
        p.check(B.esperar_fila_vazia(c, 120), "volta a internet → a fila esvazia")
        ok = B.esperar_staging(lambda: len(B.sql_treino(
            f"""select 1 from staging.tb_grupos_exercicios_usuario geu join staging.tb_grupos_treino_usuario g on g.id = geu.grupo_usuario_id
                where g.user_id = '{B.USER_TESTE}' and g.nome = '{meu}' and geu.exercicio_id = '{EX['martelo_halteres']}'""")) == 1, 60)
        p.check(ok, "staging: o treino próprio subiu com a rosca martelo com halteres no lugar da polia")
    finally:
        c.fim()
    time.sleep(2)
    B.limpar_staging(desde, "equivalentes")


@caso
def caso_academia(nav, a) -> None:
    desde = B.agora_iso()
    c = B.B8.abrir_treino(nav, a.base, a.prefixo, "academia")
    arquivos_locais(c)
    nome_ac = "Academia W9"
    sem_polia = ["barra", "halteres", "maquina", "peso_corporal"]
    try:
        B.sem_internet(c)
        p.check(B.escolher_treino_do_dia(c), f"o treino do profissional ({B.GRUPO_NOME}) no dia")
        # sem academia: a troca mostra tudo e convida a escolher
        B.abrir_trocar(c, EX["crucifixo_maquina"])
        p.check(c.pg.locator("[data-trocar-academia]").get_attribute("data-trocar-academia") in ("sem-academia", "sem-equipamentos"), "sem equipamentos marcados: sem filtro")
        p.check(not any(o["sem_academia"] for o in B.opcoes(c)), "sem filtro: nenhuma opção apagada")
        c.pg.locator("[data-trocar-equipamentos]").click()  # abre a academia a partir da troca
        p.check(c.esperar(lambda: c.tem("[data-sheet-academia]"), 6), "o atalho da troca abre a academia")
        # academia nova e os equipamentos dela
        c.pg.locator("[data-academia-opcoes]").click()
        c.pg.locator("[data-academia-adicionar]").click()
        c.pg.locator("[data-academia-nome]").fill(nome_ac)
        c.pg.locator("[data-academia-criar]").click()
        c.esperar(lambda: c.pg.locator(f'[data-equipamentos-academia] >> text=Marque o que a {nome_ac} tem').count() > 0, 6)
        for e in sem_polia:
            c.pg.locator(f'[data-equipamento="{e}"]').click()
            c.pg.wait_for_timeout(200)
        marcados = c.pg.locator('[data-equipamento][aria-pressed="true"]').evaluate_all("els => els.map(e => e.getAttribute('data-equipamento'))")
        p.check(sorted(marcados) == sorted(sem_polia), f"equipamentos marcados na {nome_ac}: {marcados}")
        p.check("4 de 11 marcados" in B.texto(c, "[data-equipamentos-resumo]"), "resumo '4 de 11 marcados'")
        B.sem_avisos(c)
        c.print("academia_equipamentos")
        c.pg.keyboard.press("Escape")
        c.pg.wait_for_timeout(400)

        B.abrir_trocar(c, EX["crucifixo_maquina"])
        ops = B.opcoes(c)
        p.check(nomes(ops) == ["Crucifixo com Halteres", "Cross-over na Polia"], f"equivalentes do crucifixo na máquina: {nomes(ops)}")
        p.check(bool(ops) and ops[-1]["sem_academia"] and "não tem na sua academia" in ops[-1]["texto"], "com 'polia' desmarcada, o cross-over vai para o fim, apagado")
        p.check(not ops[0]["sem_academia"], "o de halteres (a academia tem) vem primeiro, normal")
        p.check(f"{nome_ac}: 4 equipamentos marcados" in B.texto(c, "[data-trocar-academia]"), "a troca diz o filtro da academia")
        B.sem_avisos(c)
        c.print("trocar_academia_sem_polia")
        B.fechar_trocar(c)

        # negativo: Limpar = sem filtro
        c.pg.locator("[data-treino-academia]").first.click()
        c.esperar(lambda: c.tem("[data-sheet-academia]"), 6)
        c.pg.locator("[data-equipamentos-limpar]").click()
        c.pg.wait_for_timeout(300)
        c.pg.keyboard.press("Escape")
        c.pg.wait_for_timeout(300)
        B.abrir_trocar(c, EX["crucifixo_maquina"])
        p.check(not any(o["sem_academia"] for o in B.opcoes(c)), "Limpar = sem filtro: o cross-over volta ao normal")
        B.fechar_trocar(c)
        # marca de novo (o estado final sobe para o staging)
        c.pg.locator("[data-treino-academia]").first.click()
        c.esperar(lambda: c.tem("[data-sheet-academia]"), 6)
        for e in sem_polia:
            c.pg.locator(f'[data-equipamento="{e}"]').click()
            c.pg.wait_for_timeout(150)
        c.pg.keyboard.press("Escape")

        B.sem_internet(c, False)
        p.check(B.esperar_fila_vazia(c, 120), "volta a internet → a fila esvazia")
        r = []

        def subiu() -> bool:
            r[:] = B.sql_treino(f"select array_to_string(equipamentos, ',') as eq, equipamentos is null as nulo from staging.tb_academias where user_id = '{B.USER_TESTE}' and nome = '{nome_ac}'")
            return bool(r) and r[0]["eq"] == ",".join(sem_polia)
        p.check(B.esperar_staging(subiu, 60), f"staging: tb_academias.equipamentos é text[] com os 4 ({r})")
    finally:
        c.fim()
    time.sleep(2)
    B.limpar_staging(desde, "academia")
    B.limpar_academias(desde, "academia")


@caso
def caso_dia_vez(nav, a) -> None:
    desde = B.agora_iso()
    c = B.B8.abrir_treino(nav, a.base, a.prefixo, "dia_vez")
    arquivos_locais(c)
    amanha = B.hoje() + dt.timedelta(days=1)
    try:
        B.sem_internet(c)
        p.check(B.escolher_treino_do_dia(c), "o treino do profissional hoje")
        # SÓ HOJE: francês na polia → francês com halter (equivalente)
        B.abrir_trocar(c, EX["frances_polia"])
        ops = B.opcoes(c)
        p.check(EX["frances_halter"] in [o["id"] for o in ops], f"francês na polia: equivalentes {nomes(ops)}")
        B.escolher(c, EX["frances_halter"])
        p.check("Trocar só hoje" in B.texto(c, "[data-trocar-confirmar]"), "botão 'Trocar só hoje'")
        B.confirmar_troca(c, "dia")
        exs = B.exercicios(c)
        p.check(EX["frances_halter"] in exs and EX["frances_polia"] not in exs, "só hoje: o francês com halter entrou")
        selo = B.texto(c, f'[data-exercicio-id="{EX["frances_halter"]}"] [data-exercicio-trocado]')
        p.check("no lugar de Tríceps Francês Unilateral" in selo, f"selo 'trocado · no lugar de …' ({selo})")
        B.sem_avisos(c)
        B.linha(c, EX["frances_halter"]).scroll_into_view_if_needed()
        c.print("trocado_linha")
        # Restaurar
        B.abrir_trocar(c, EX["frances_halter"])
        p.check(c.tem("[data-trocado]") and "SÓ HOJE" in B.texto(c, "[data-trocado]") and "No lugar de Tríceps Francês Unilateral" in B.texto(c, "[data-trocado]"),
                "a troca mostra 'Trocado · No lugar de' com SÓ HOJE e Restaurar")
        B.sem_avisos(c)
        c.print("trocado_restaurar")
        c.pg.locator("[data-trocar-restaurar]").click()
        c.esperar(lambda: not c.tem("[data-trocar-exercicio]"), 8)
        c.pg.wait_for_timeout(600)
        exs = B.exercicios(c)
        p.check(EX["frances_polia"] in exs and EX["frances_halter"] not in exs, "Restaurar: o original voltou")

        # DE VEZ: crucifixo na máquina → crucifixo com halteres
        B.abrir_trocar(c, EX["crucifixo_maquina"])
        B.escolher(c, EX["crucifixo_halteres"])
        B.confirmar_troca(c, "definitiva")
        p.check(EX["crucifixo_halteres"] in B.exercicios(c), "de vez: o crucifixo com halteres entrou hoje")
        # amanhã: o mesmo treino → a de vez vale; a só hoje (desfeita) não
        B.ir_para_dia(c, amanha)
        p.check(B.escolher_treino_do_dia(c), "o mesmo treino amanhã")
        exs = B.exercicios(c)
        p.check(EX["crucifixo_halteres"] in exs and EX["crucifixo_maquina"] not in exs, "amanhã: a troca de vez vale")
        p.check(EX["frances_polia"] in exs, "amanhã: o francês na polia (a só hoje não passa para o outro dia)")
        p.check(B.linha(c, EX["crucifixo_halteres"]).locator("[data-exercicio-trocado]").count() == 0, "amanhã: sem o selo (só no dia da troca)")
        B.ir_para_dia(c, B.hoje())

        B.sem_internet(c, False)
        p.check(B.esperar_fila_vazia(c, 120), "volta a internet → a fila esvazia")
        ok = B.esperar_staging(lambda: B.conta_staging(
            "exercicio_substituicao_usuario", desde,
            extra=f"and data_treino is null and exercicio_origem_id = '{EX['crucifixo_maquina']}' and exercicio_novo_id = '{EX['crucifixo_halteres']}'") == 1, 60)
        p.check(ok, "staging: a troca de vez (sem data) subiu")
        p.check(B.conta_staging("exercicio_substituicao_usuario", desde, extra=f"and exercicio_origem_id = '{EX['frances_polia']}'") == 0,
                "staging: a troca só hoje restaurada não ficou lá")
    finally:
        c.fim()
    time.sleep(2)
    B.limpar_staging(desde, "dia_vez")


@caso
def caso_biblioteca_master(nav, a) -> None:
    nome_novo = "Exercício global W9 teste"
    # como a W7b: primeiro o painel (a troca de token grava a sessão do Treino), depois o master — a guarda antiga das páginas do
    # master manda para o painel se abrir antes da troca (já era assim; fica para a W27)
    c = B.B8.abrir_painel(nav, a.base, a.prefixo, "biblioteca_master", "/painel/alunos")
    try:
        c.esperar(lambda: c.tem("[data-menu-lateral]"), 120)
        c.esperar(lambda: c.pg.evaluate("() => Object.keys(localStorage).some((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))"), 60)
        c.pg.wait_for_timeout(1000)
        c.ir("/master/biblioteca")
        ok = c.esperar(lambda: c.pg.locator("[data-exercicio-linha]").count() >= 20, 40)
        p.check(ok, f"master › Biblioteca global abre com os exercícios ({c.pg.locator('[data-exercicio-linha]').count()} na 1ª página)")
        p.check("todos os globais com movimento e equipamento" in c.texto(), "o topo diz que os 81 globais estão classificados")
        p.check(c.pg.locator("[data-exercicio-linha] [data-exercicio-equivalencia]").count() == c.pg.locator("[data-exercicio-linha]").count()
                and c.pg.locator("[data-exercicio-sem-equivalencia]").count() == 0, "toda linha mostra o movimento e o equipamento (nenhum 'sem movimento')")
        c.print("biblioteca_master_lista")
        c.pg.locator("[data-input-busca-exercicio]").fill("martelo")
        c.pg.wait_for_timeout(700)
        linha_polia = c.pg.locator(f'[data-exercicio-linha="{EX["martelo_polia"]}"]')
        txt_polia = linha_polia.inner_text().lower() if linha_polia.count() else ""
        p.check("rosca martelo" in txt_polia and "polia (cabo)" in txt_polia, f"a linha da rosca martelo na polia mostra o movimento e o equipamento ('{txt_polia[:90]}')")
        linha_polia.locator("[data-btn-editar-exercicio]").click()
        c.esperar(lambda: c.tem("[data-form-equivalencia]"), 6)
        p.check(c.pg.locator("[data-campo-movimento]").input_value() == "rosca_martelo" and c.pg.locator("[data-campo-equipamento]").input_value() == "polia",
                "o formulário traz movimento e equipamento do exercício")
        p.check(c.pg.locator("[data-campo-variacao]").input_value() == "pegada neutra", "e a variação")
        c.print("biblioteca_master_campos")
        c.pg.keyboard.press("Escape")
        c.pg.wait_for_timeout(400)
        # cria um global com os campos (staging) e apaga
        c.pg.locator("[data-input-busca-exercicio]").fill("")
        c.pg.locator("[data-btn-novo-exercicio]").click()
        c.esperar(lambda: c.tem("[data-form-equivalencia]"), 6)
        c.pg.locator("[data-input-ex-nome]").fill(nome_novo)
        c.pg.locator("[data-campo-movimento]").select_option("rosca_martelo")
        c.pg.locator("[data-campo-equipamento]").select_option("elastico")
        c.pg.locator("[data-campo-variacao]").fill("em pé")
        c.pg.locator("[data-btn-salvar-exercicio]").click()
        c.esperar(lambda: not c.tem("[data-form-equivalencia]"), 10)
        r = B.sql_treino(f"select id::text as id, padrao_movimento, equipamento, variacao, professor_id from staging.tb_exercicios where nome = '{nome_novo}'")
        p.check(len(r) == 1 and (r[0]["padrao_movimento"], r[0]["equipamento"], r[0]["variacao"], r[0]["professor_id"]) == ("rosca_martelo", "elastico", "em pé", None),
                f"staging: o global novo foi gravado com os 3 campos ({r})")
        if r:
            c.pg.locator("[data-input-busca-exercicio]").fill("W9 teste")
            c.pg.wait_for_timeout(700)
            c.pg.locator(f'[data-exercicio-linha="{r[0]["id"]}"] [data-btn-excluir-exercicio]').click()
            c.pg.get_by_role("button", name="Excluir").last.click()
            c.pg.wait_for_timeout(1500)
            p.check(not B.sql_treino(f"select 1 from staging.tb_exercicios where nome = '{nome_novo}'"), "o global de teste foi apagado")
    finally:
        c.fim()
        B.sql_treino(f"delete from staging.tb_exercicios where nome = '{nome_novo}'")


@caso
def caso_biblioteca_profissional(nav, a) -> None:
    nome_novo = "Remada no elástico W9"
    c = B.Caso(nav, a.base, a.prefixo, "biblioteca_profissional", desktop=True)
    try:
        c.entrar("prof1", "/painel/treinos?t=biblioteca&b=minha", zerar=True)
        c.fechar_avisos()
        ok = c.esperar(lambda: c.tem("[data-btn-criar-exercicio]"), 40)
        p.check(ok, "painel › Treinos › Biblioteca › Minha (profissional)")
        c.pg.locator("[data-btn-criar-exercicio]").click()
        c.esperar(lambda: c.tem("[data-form-equivalencia]"), 6)
        c.pg.get_by_placeholder("Nome do exercício...").fill(nome_novo)
        grupo = c.pg.locator("select:has(option:text('Selecionar...'))").first
        if grupo.count() and grupo.locator("option", has_text="Dorsal").count():
            grupo.select_option(label=grupo.locator("option", has_text="Dorsal").first.inner_text())
        c.pg.locator("[data-campo-movimento]").select_option("remada")
        c.pg.locator("[data-campo-equipamento]").select_option("elastico")
        c.pg.locator("[data-campo-variacao]").fill("sentado")
        c.print("biblioteca_profissional_campos")
        c.pg.get_by_role("button", name="Criar Exercício").last.click()
        c.esperar(lambda: not c.tem("[data-form-equivalencia]"), 10)
        prof = B.B5.treino_id("prof1")
        r = B.sql_treino(f"select id::text as id, padrao_movimento, equipamento, variacao, professor_id::text as professor_id from staging.tb_exercicios where nome = '{nome_novo}'")
        p.check(len(r) == 1 and (r[0]["padrao_movimento"], r[0]["equipamento"], r[0]["variacao"], r[0]["professor_id"]) == ("remada", "elastico", "sentado", prof),
                f"staging: o exercício do profissional foi gravado com os 3 campos e o dono ({r})")
        # a lista "Exercícios" mostra o movimento e o equipamento
        c.pg.get_by_role("button", name="Exercícios (").click()
        c.pg.wait_for_timeout(600)
        linha_ = c.pg.locator(f"p:has-text('{nome_novo}') + p")
        p.check(linha_.count() > 0 and "Remada" in linha_.first.inner_text() and "Elástico" in linha_.first.inner_text(), "a lista da biblioteca mostra movimento e equipamento")
    finally:
        c.fim()
        B.sql_treino(f"delete from staging.tb_exercicios where nome = '{nome_novo}'")


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
