#!/usr/bin/env python3
"""Physiq W21 — E2E das telas do Painel › Pré-consulta (padrão das telas 6/7) e da página pública /f/:slug. Contexto limpo por caso;
painel 1280 × 883 × 2 (= 2560 × 1766), público no celular 390 × 844 × 3,4 (= 1326 × 2870) e sem login.

Positivo:
  personal   prof2 (personal, conta SÓ TREINO): Novo formulário vai direto ao EM BRANCO; monta 2 perguntas, salva, "Copiar link" mostra
             o link do Physiq (o do ambiente); o anônimo responde no /f/ (celular); a resposta chega (NOVA + o número do menu = banco) e
             ele LIGA ao "Aluno Dois" (o número baixa). Não há "Importar" para ele.
  nutri      Camila (nutricionista): Novo formulário começa na ORIGEM (anamnese, questionário, em branco); a partir do modelo de
             anamnese; o anônimo responde com o e-mail do Rafael; "Ligar" sugere o Rafael (mesmo e-mail); IMPORTA → a anamnese aparece
             na aba Prontuário nova (W18) do Rafael.
  questionario  a nutri do legado: formulário do questionário Disbiose; o anônimo vê o RESULTADO; ela liga ao paciente dela e importa
             → aplicação de questionário no Prontuário › Questionários; o site antigo mostra a mesma aplicação e a resposta importada.
  cadastrar  Camila: "Cadastrar aluno com estes dados" (o Novo aluno da W13) — e-mail de outro aluno = mensagem vermelha (W16b); com
             e-mail novo cadastra e liga.
  inativo    prof2 desativa → o /f/ mostra a mensagem do Nutri ("não encontrado ou desativado"); ativa de novo → abre.
  rotas      /respostas-pre-consulta?sem=1 → /painel/pre-consulta?sem=1&aba=respostas (só as novas); /pre-consulta → /painel/pre-consulta.
Negativo:
  dono       Lucas (dono SEM papel de nutri): vê os formulários da equipe (o da Camila com o autor), mas NÃO as respostas do formulário da
             Camila; não vê "Importar"; o número do menu = o que o banco deixa ele ler.
  membro     Bruno (2º personal): só o formulário e a resposta dele.

hml-12: no build de staging o /f/ pede o consentimento das respostas de saúde (consentir_preconsulta marca a caixa) e a resposta pela
API vai pela preconsulta_responder de 6 argumentos (responder_api).

Uso: python3 e2e/w21/telas.py --base http://localhost:5173 --prefixo local [--casos personal,nutri,...]
     (staging: --base https://physiqcalc-staging.vercel.app --prefixo staging; o site antigo: --antigo https://physiqnutri-staging.vercel.app).
     A massa: python3 e2e/w21/massa.py (antes) e python3 e2e/w21/massa.py --limpar (no fim).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

from playwright.sync_api import sync_playwright  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
p, q = B.p, B.q
CASOS: dict[str, object] = {}
ESTADO: dict = {}
CHAVE_LS_NUTRI = f"sb-{B.PRINCIPAL_REF}-auth-token"


def caso(fn):
    CASOS[fn.__name__.replace("caso_", "")] = fn
    return fn


def m() -> dict:
    return ESTADO["massa"]


def abrir(nav, nome: str, conta: str, rota: str, esperar: str = "[data-pagina-preconsulta-painel]"):
    c = B.B5.Caso(nav, ESTADO["base"], ESTADO["prefixo"], nome, desktop=True)
    c.entrar(conta, rota)
    c.fechar_avisos()
    ok = c.esperar(lambda: c.tem(esperar), 90)
    p.check(ok, f"[{nome}] {rota} abriu já logado ({esperar})")
    return c


def publico(nav, nome: str):
    """Contexto ANÔNIMO no celular (quem recebe o link)."""
    ctx = nav.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3.4, is_mobile=True, has_touch=True, locale="pt-BR",
                          timezone_id="America/Sao_Paulo", service_workers="block")
    pg = ctx.new_page()
    erros: list[str] = []
    pg.on("pageerror", lambda e: erros.append(str(e)))
    return ctx, pg, erros


def print_pg(pg, nome: str) -> None:
    B.PRINTS.mkdir(parents=True, exist_ok=True)
    pg.wait_for_timeout(800)
    pg.screenshot(path=str(B.PRINTS / f"{ESTADO['prefixo']}_{nome}.png"))


def esperar_pg(pg, cond, timeout: float) -> bool:
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if cond():
                return True
        except Exception:  # noqa: BLE001
            pass
        pg.wait_for_timeout(500)
    return False


def ocioso(c) -> None:
    """Espera as gravações e as leituras da página terminarem (data-salvando-* = 0, data-atualizando = 0)."""
    c.esperar(lambda: c.pg.evaluate("""() => [...document.querySelectorAll('[data-salvando-formulario],[data-salvando-resposta]')]
        .every(e => e.getAttribute('data-salvando-formulario') === '0' || e.getAttribute('data-salvando-resposta') === '0')
        && [...document.querySelectorAll('[data-atualizando]')].every(e => e.getAttribute('data-atualizando') === '0')"""), 30)


def sem_toast(c, timeout: float = 9) -> None:
    """Os prints saem sem o aviso (toast) por cima."""
    c.esperar(lambda: c.pg.locator("[data-sonner-toast]").count() == 0, timeout)


def abrir_detalhe(c, resposta_id: str) -> None:
    linha = c.pg.locator(f'[data-resposta="{resposta_id}"]')
    if linha.locator("[data-resposta-detalhe]").count() == 0:
        linha.locator("[data-btn-ver-resposta]").click()
    c.esperar(lambda: c.tem(f'[data-resposta="{resposta_id}"] [data-resposta-detalhe]'), 10)


def novas_no_banco(conta: str, conta_id: str) -> int:
    return B.contar(conta, "respostas_preconsulta", f"deleted_at=is.null&paciente_id=is.null&or=(conta_id.eq.{conta_id},and(conta_id.is.null,nutricionista_id.eq.{B.uid(conta)}))")


def numero_do_menu(c) -> int:
    loc = c.pg.locator('[data-nav="/painel/pre-consulta"] [data-contador]')
    return int(loc.first.inner_text().strip()) if loc.count() else 0


def criar_formulario(c, nome: str, titulo: str, perguntas: list[tuple[str, str]] | None = None) -> dict:
    """No diálogo já aberto (etapa dados): título, perguntas (texto, tipo) e salvar. Devolve a linha do formulário criada."""
    c.pg.locator("[data-campo-titulo-formulario]").fill(titulo)
    for i, (texto, tipo) in enumerate(perguntas or []):
        if i > 0:
            c.pg.locator("[data-btn-adicionar-pergunta]").click()
        c.pg.locator(f'[data-campo-pergunta-texto="{i}"]').fill(texto)
        c.pg.locator(f'[data-campo-pergunta-tipo="{i}"]').select_option(tipo)
    c.pg.locator("[data-btn-salvar-formulario]").click()
    ok = c.esperar(lambda: c.pg.locator(f'[data-formulario-titulo="{titulo}"]').count() > 0 and c.pg.locator("[data-modal-formulario]").count() == 0, 40)
    p.check(ok, f"[{nome}] o formulário '{titulo}' entrou na lista")
    linha = c.pg.locator(f'[data-formulario-titulo="{titulo}"]').first
    f = B.sql_principal(f"select id::text, slug, conta_id::text, nutricionista_id::text, origem, ativo from {S}.formularios_preconsulta where titulo = {q(titulo)} and deleted_at is null")
    p.check(len(f) == 1, f"[{nome}] gravado 1 formulário no banco ({len(f)})")
    p.check(linha.get_attribute("data-formulario-slug") == (f[0]["slug"] if f else None), f"[{nome}] a linha mostra o slug do banco")
    return f[0] if f else {}


def copiar_link(c, nome: str, f: dict) -> str:
    c.pg.locator(f'[data-formulario="{f["id"]}"] [data-btn-copiar-link]').click()
    ok = c.esperar(lambda: c.tem(f'[data-formulario="{f["id"]}"] [data-link-publico]'), 10)
    url = c.pg.locator(f'[data-formulario="{f["id"]}"] [data-link-publico]').get_attribute("data-link-publico") if ok else ""
    esperado = f"{ESTADO['site']}/f/{f['slug']}"
    p.check(url == esperado, f"[{nome}] 'Copiar link' mostra o link do Physiq do ambiente ({url} × {esperado})")
    return url or esperado


def consentir_preconsulta(pg) -> bool:
    """hml-12 (H-30): no build de staging a pré-consulta pede o consentimento das respostas de saúde antes de "Enviar" (sem ele: "Para
    enviar, marque o consentimento."): marca a caixa. No build de produção (antes da virada) não há a caixa e segue igual."""
    if not esperar_pg(pg, lambda: pg.locator("[data-consentimento-saude='preconsulta']").count() > 0, 6):
        return False
    B.B5.marcar(pg.locator("[data-consentimento-saude='preconsulta'] [data-consentimento-saude-caixa]"))
    return True


def responder_api(slug: str, nome: str, email: str, respostas: dict, telefone: str = "") -> dict:
    """Responde ao formulário como o público (anônimo), pela RPC da página /f/ — hml-12: a de 6 argumentos, com o consentimento da
    versão do app (com a versão dos textos ligada no banco, o staging, a de 5 recusa com sem_consentimento). O e2e/w21/_base.py
    (responder) segue com a de 5."""
    st, r = B.rpc("", "preconsulta_responder", {"p_slug": slug, "p_nome": nome, "p_email": email, "p_telefone": telefone,
                                                 "p_respostas": respostas, "p_consentimento": B.B5.versao_dos_textos()})
    assert st == 200 and isinstance(r, dict) and r.get("id"), ("responder", st, r)
    return r


def responder_no_celular(nav, nome: str, slug: str, pessoa: str, email: str, preencher, print_antes: str | None = None, print_depois: str | None = None) -> bool:
    ctx, pg, erros = publico(nav, nome)
    try:
        pg.goto(f"{ESTADO['base']}/f/{slug}", wait_until="domcontentloaded")
        ok = esperar_pg(pg, lambda: pg.locator("[data-form-publico]").count() > 0, 60)
        p.check(ok, f"[{nome}] /f/{slug} abre SEM login (anônimo, no celular)")
        if not ok:
            print_pg(pg, f"falha_{nome}_publico")
            return False
        p.check(pg.locator("[data-casca='publico']").count() == 1 and pg.locator("[data-menu-lateral]").count() == 0, f"[{nome}] na casca pública (sem o menu do painel)")
        if print_antes:
            print_pg(pg, print_antes)
        pg.locator("[data-campo-nome-publico]").fill(pessoa)
        pg.locator("[data-campo-email-publico]").fill(email)
        preencher(pg)
        consentir_preconsulta(pg)  # hml-12: o consentimento de saúde (só no build de staging)
        pg.locator("[data-btn-enviar-publico]").click()
        ok = esperar_pg(pg, lambda: pg.locator("[data-formulario-enviado]").count() > 0, 40)
        p.check(ok, f"[{nome}] enviou: 'Respostas enviadas'")
        if print_depois:
            pg.evaluate("window.scrollTo(0, 0)")
            print_pg(pg, print_depois)
        p.check(not erros, f"[{nome}] sem erro na página pública ({erros[:2]})")
        return ok
    finally:
        ctx.close()


def ultima_resposta(formulario_id: str) -> dict:
    r = B.sql_principal(f"""select id::text, conta_id::text, nutricionista_id::text, paciente_id::text, importada_tipo, importada_id::text, pontuacao, faixa, nivel
                             from {S}.respostas_preconsulta where formulario_id = {q(formulario_id)} order by created_at desc limit 1""")
    return r[0] if r else {}


# ───────────────────────── positivos ─────────────────────────

@caso
def caso_personal(nav):
    conta = m()["conta_prof2"]
    aluno2 = B.aluno(conta, "Aluno Dois")
    c = abrir(nav, "personal", "prof2", "/painel/pre-consulta")
    c.esperar(lambda: c.tem("[data-cartao-formularios]") and not c.tem("[data-carregando-formularios]"), 40)
    p.check(c.pg.locator('[data-nav="/painel/pre-consulta"]').count() == 1, "[personal] o item Pré-consulta está no menu do personal (R7)")
    p.check(c.pg.locator("[data-pagina-preconsulta-painel]").get_attribute("data-nutri") == "0", "[personal] ele não é nutricionista (data-nutri=0)")
    c.pg.locator("[data-btn-novo-formulario]").first.click()
    ok = c.esperar(lambda: c.tem('[data-modal-formulario="novo"][data-etapa-formulario="dados"]'), 15)
    p.check(ok, "[personal] Novo formulário vai DIRETO ao em branco (sem a origem clínica)")
    p.check(c.pg.locator("[data-passo-origem]").count() == 0 and c.pg.locator('[data-form-origem="personalizado"]').count() == 1, "[personal] origem = personalizado")
    titulo = f"{B.MARCA} Pré-consulta do treino {B.carimbo()}"
    f = criar_formulario(c, "personal", titulo, [("Quantas vezes por semana você treina?", "escala"), ("Tem alguma lesão ou dor? Conte.", "texto")])
    p.check(f.get("conta_id") == conta and f.get("nutricionista_id") == B.uid("prof2"), "[personal] gravado na conta ativa dele, no nome dele")
    copiar_link(c, "personal", f)
    ocioso(c)
    sem_toast(c)
    c.print("tela6_formularios_personal")
    antes = numero_do_menu(c)
    pessoa = "Ana Respondente"

    def preencher(pg):
        pg.locator('[data-escala-valor="0-3"]').click()
        pg.locator('[data-campo-texto="1"]').fill("Nenhuma lesão, só um incômodo no joelho às vezes.")

    responder_no_celular(nav, "personal", f["slug"], pessoa, f"w21.resp.{B.carimbo()}.teste.claude@physiqnutri.app", preencher, "publico_formulario", "publico_enviado")
    r = ultima_resposta(f["id"])
    p.check(r.get("conta_id") == conta and r.get("nutricionista_id") == B.uid("prof2"), "[personal] a resposta caiu na conta dele (gatilho do conta_id)")
    c.ir("/painel/pre-consulta?aba=respostas")
    ok = c.esperar(lambda: c.tem(f'[data-resposta="{r.get("id")}"]'), 40)
    p.check(ok, "[personal] a resposta chegou na caixa de entrada")
    ocioso(c)
    linha = c.pg.locator(f'[data-resposta="{r.get("id")}"]')
    p.check(linha.get_attribute("data-resposta-nova") == "1", "[personal] marcada como NOVA (sem aluno)")
    n_banco = novas_no_banco("prof2", conta)
    c.esperar(lambda: numero_do_menu(c) == n_banco, 20)
    p.check(numero_do_menu(c) == n_banco and n_banco >= 1, f"[personal] o número do menu = novas no banco ({numero_do_menu(c)} × {n_banco}; antes {antes})")
    p.check(c.pg.locator("[data-btn-importar-resposta]").count() == 0, "[personal] NEGATIVO: sem 'Importar' (a anamnese é da nutricionista)")
    linha.locator("[data-btn-ver-resposta]").click()
    p.check(c.esperar(lambda: c.tem(f'[data-resposta="{r.get("id")}"] [data-resposta-detalhe]'), 10), "[personal] Ver mostra a tabela pergunta · resposta · pontos")
    valores = c.pg.locator(f'[data-resposta="{r.get("id")}"] [data-resposta-linha]').evaluate_all("els => els.map(e => e.dataset.respostaValor)")
    p.check(len(valores) == 2 and valores[0] == "3" and "joelho" in valores[1], f"[personal] as respostas certas ({valores})")
    linha.locator("[data-btn-ligar-resposta]").click()
    ok = c.esperar(lambda: c.tem(f'[data-modal-ligar="{r.get("id")}"]'), 10)
    p.check(ok, "[personal] abre 'Ligar a um aluno'")
    p.check(c.pg.locator(f'[data-opcao-aluno-ligar="{aluno2["id"]}"]').count() == 1, "[personal] a lista tem o Aluno Dois (aluno dele)")
    outros = c.pg.locator("[data-opcao-aluno-ligar]").evaluate_all("els => els.map(e => e.dataset.opcaoAlunoLigar)")
    alunos_dele = {x["id"] for x in B.sql_principal(f"select id::text from {S}.pacientes where conta_id = {q(conta)} and personal_id = {q(B.uid('prof2'))} and deleted_at is null")}
    p.check(set(outros) <= alunos_dele, f"[personal] P1: só os alunos dele na lista ({len(outros)})")
    c.pg.locator(f'[data-opcao-aluno-ligar="{aluno2["id"]}"]').click()
    c.pg.locator("[data-btn-salvar-ligar]").click()
    ok = c.esperar(lambda: c.pg.locator(f'[data-resposta="{r.get("id")}"]').get_attribute("data-resposta-aluno") == aluno2["id"], 30)
    p.check(ok, "[personal] LIGOU ao Aluno Dois")
    p.check(ultima_resposta(f["id"]).get("paciente_id") == aluno2["id"], "[personal] no banco também")
    ocioso(c)
    c.esperar(lambda: numero_do_menu(c) == n_banco - 1, 20)
    p.check(numero_do_menu(c) == n_banco - 1, f"[personal] o número do menu baixou ({numero_do_menu(c)})")
    abrir_detalhe(c, r.get("id"))
    sem_toast(c)
    c.print("tela7_respostas_personal")
    ESTADO["form_personal"] = f
    c.fim()


@caso
def caso_nutri(nav):
    w13 = m()["conta_w13"]
    rafael = B.aluno(w13, "Rafael Moura")
    c = abrir(nav, "nutri", "w13-nutri", "/painel/pre-consulta")
    c.esperar(lambda: c.tem("[data-cartao-formularios]") and not c.tem("[data-carregando-formularios]"), 40)
    p.check(c.pg.locator("[data-pagina-preconsulta-painel]").get_attribute("data-nutri") == "1", "[nutri] Camila é nutricionista (data-nutri=1)")
    c.pg.locator("[data-btn-novo-formulario]").first.click()
    ok = c.esperar(lambda: c.tem('[data-etapa-formulario="origem"]'), 15)
    origens = c.pg.locator("[data-origem]").evaluate_all("els => els.map(e => e.dataset.origem)")
    p.check(ok and origens == ["anamnese", "questionario", "personalizado"], f"[nutri] começa na ORIGEM ({origens})")
    c.pg.locator('[data-origem="anamnese"]').click()
    c.esperar(lambda: c.tem("[data-campo-origem-anamnese]"), 10)
    modelos = c.pg.locator("[data-campo-origem-anamnese] option").evaluate_all("els => els.map(e => [e.value, e.textContent])")
    modelo = next((v for v, t in modelos if v and "Anamnese geral" in (t or "")), next((v for v, _t in modelos if v), None))
    p.check(bool(modelo), f"[nutri] os modelos de anamnese dela aparecem ({len(modelos) - 1})")
    c.print("nutri_origem")
    c.pg.locator("[data-campo-origem-anamnese]").select_option(modelo)
    ok = c.esperar(lambda: c.tem('[data-etapa-formulario="dados"]') and c.tem('[data-form-origem="anamnese"]'), 10)
    n_perg = c.pg.locator("[data-campo-pergunta-texto]").count()
    p.check(ok and n_perg >= 5, f"[nutri] as perguntas do modelo vieram como texto ({n_perg})")
    titulo = f"{B.MARCA} Pré-anamnese Camila {B.carimbo()}"
    f = criar_formulario(c, "nutri", titulo)
    p.check(f.get("origem") == "anamnese" and f.get("conta_id") == w13, "[nutri] origem anamnese, na conta W13")
    copiar_link(c, "nutri", f)

    def preencher(pg):
        pg.locator('[data-campo-texto="0"]').fill("Emagrecer com saúde")
        pg.locator('[data-campo-texto="1"]').fill("Não")

    responder_no_celular(nav, "nutri", f["slug"], "Rafael M.", "w13.aluno.teste.claude@physiqnutri.app", preencher)
    r = ultima_resposta(f["id"])
    c.ir("/painel/pre-consulta?aba=respostas")
    ok = c.esperar(lambda: c.tem(f'[data-resposta="{r.get("id")}"]'), 40)
    p.check(ok, "[nutri] a resposta chegou")
    ocioso(c)
    imp = c.pg.locator(f'[data-resposta="{r.get("id")}"] [data-btn-importar-resposta]')
    p.check(imp.count() == 1 and imp.is_disabled() and "Ligue" in (imp.get_attribute("data-motivo-sem-importar") or ""), "[nutri] Importar desligado com o motivo (sem aluno)")
    c.pg.locator(f'[data-resposta="{r.get("id")}"] [data-btn-ligar-resposta]').click()
    ok = c.esperar(lambda: c.tem(f'[data-sugestao-aluno="{rafael["id"]}"]'), 15)
    p.check(ok and c.pg.locator("[data-sugestao-aluno]").get_attribute("data-sugestao-por") == "email", "[nutri] sugere o Rafael Moura (mesmo e-mail)")
    c.pg.locator("[data-btn-usar-sugestao]").click()
    c.pg.locator("[data-btn-salvar-ligar]").click()
    ok = c.esperar(lambda: c.pg.locator(f'[data-resposta="{r.get("id")}"]').get_attribute("data-resposta-aluno") == rafael["id"], 30)
    p.check(ok, "[nutri] ligou ao Rafael")
    ocioso(c)
    imp = c.pg.locator(f'[data-resposta="{r.get("id")}"] [data-btn-importar-resposta]')
    c.esperar(lambda: not imp.is_disabled(), 15)
    p.check(not imp.is_disabled(), "[nutri] Importar liberado (o Rafael é aluno dela)")
    imp.click()
    ok = c.esperar(lambda: c.tem("[data-modal-importar]"), 10)
    txt = c.pg.locator("[data-texto-importar]").inner_text() if ok else ""
    p.check("anamnese" in txt and "Rafael Moura" in txt, f"[nutri] confirma: vira uma anamnese no prontuário do Rafael ({txt[:90]})")
    c.pg.locator("[data-btn-confirmar-importar]").click()
    ok = c.esperar(lambda: c.pg.locator(f'[data-resposta="{r.get("id")}"]').get_attribute("data-resposta-importada") == "1", 40)
    p.check(ok, "[nutri] IMPORTADA")
    rr = ultima_resposta(f["id"])
    an = B.sql_principal(f"select id::text, paciente_id::text, nutricionista_id::text, titulo, jsonb_array_length(conteudo) n from {S}.anamneses where id = {q(rr.get('importada_id'))}")
    p.check(rr.get("importada_tipo") == "anamnese" and an and an[0]["paciente_id"] == rafael["id"] and an[0]["nutricionista_id"] == B.uid("w13-nutri"),
            f"[nutri] no banco: anamnese do Rafael, da Camila ({an[0] if an else '-'})")
    ocioso(c)
    sem_toast(c)
    c.print("tela7_respostas_nutri")
    c.pg.locator(f'[data-resposta="{r.get("id")}"] [data-link-importada]').click()
    ok = c.esperar(lambda: "/prontuario" in c.caminho() and c.tem(f'[data-anamnese="{rr.get("importada_id")}"]'), 60)
    p.check(ok, f"[nutri] o chip leva à aba Prontuário nova (W18) › Anamnese, com a importada ({c.caminho()})")
    sem_toast(c)
    c.print("prontuario_anamnese_importada")
    c.fim()


@caso
def caso_questionario(nav):
    leg = m()["conta_legado"]
    pac = B.aluno(leg, "Paciente Teste Claude")
    c = abrir(nav, "questionario", "nutri-legado", "/painel/pre-consulta")
    c.esperar(lambda: c.tem("[data-cartao-formularios]") and not c.tem("[data-carregando-formularios]"), 40)
    c.pg.locator("[data-btn-novo-formulario]").first.click()
    c.esperar(lambda: c.tem('[data-etapa-formulario="origem"]'), 15)
    c.pg.locator('[data-origem="questionario"]').click()
    c.esperar(lambda: c.tem("[data-campo-origem-questionario]"), 10)
    ops = c.pg.locator("[data-campo-origem-questionario] option").evaluate_all("els => els.map(e => [e.value, e.textContent])")
    disb = next((v for v, t in ops if v and "Disbiose" in (t or "")), None)
    p.check(bool(disb), "[questionario] o questionário do sistema Disbiose está na lista")
    c.pg.locator("[data-campo-origem-questionario]").select_option(disb)
    ok = c.esperar(lambda: c.tem('[data-form-origem="questionario"]') and c.pg.locator("[data-faixa]").count() == 3, 10)
    p.check(ok, "[questionario] perguntas e as 3 faixas copiadas")
    titulo = f"{B.MARCA} Disbiose {B.carimbo()}"
    f = criar_formulario(c, "questionario", titulo)

    def preencher(pg):
        for i in range(10):
            pg.locator(f'[data-escala-valor="{i}-{2 if i < 6 else 1}"]').click()

    responder_no_celular(nav, "questionario", f["slug"], "Paciente Teste", "paciente.teste.claude@physiqnutri.app", preencher, None, "publico_resultado")
    r = ultima_resposta(f["id"])
    p.check(float(r.get("pontuacao") or 0) == 16 and r.get("faixa") == "Suspeita moderada", f"[questionario] pontuação/faixa no banco ({r.get('pontuacao')} · {r.get('faixa')})")
    c.ir("/painel/pre-consulta?aba=respostas")
    c.esperar(lambda: c.tem(f'[data-resposta="{r.get("id")}"]'), 40)
    ocioso(c)
    c.pg.locator(f'[data-resposta="{r.get("id")}"] [data-btn-ligar-resposta]').click()
    c.esperar(lambda: c.tem(f'[data-sugestao-aluno="{pac["id"]}"]'), 15)
    c.pg.locator("[data-btn-usar-sugestao]").click()
    c.pg.locator("[data-btn-salvar-ligar]").click()
    c.esperar(lambda: c.pg.locator(f'[data-resposta="{r.get("id")}"]').get_attribute("data-resposta-aluno") == pac["id"], 30)
    ocioso(c)
    c.pg.locator(f'[data-resposta="{r.get("id")}"] [data-btn-importar-resposta]').click()
    c.esperar(lambda: c.tem("[data-modal-importar]"), 10)
    p.check("aplicação de questionário" in c.pg.locator("[data-texto-importar]").inner_text(), "[questionario] confirma: vira uma aplicação de questionário")
    c.pg.locator("[data-btn-confirmar-importar]").click()
    c.esperar(lambda: c.pg.locator(f'[data-resposta="{r.get("id")}"]').get_attribute("data-resposta-importada") == "1", 40)
    rr = ultima_resposta(f["id"])
    ap = B.sql_principal(f"select id::text, paciente_id::text, questionario_id::text, pontuacao, faixa from {S}.respostas_questionario where id = {q(rr.get('importada_id'))}")
    p.check(rr.get("importada_tipo") == "questionario" and ap and ap[0]["paciente_id"] == pac["id"] and ap[0]["questionario_id"] and float(ap[0]["pontuacao"]) == 16,
            f"[questionario] aplicação gravada com a pontuação e o questionário de origem ({ap[0] if ap else '-'})")
    ocioso(c)
    c.pg.locator(f'[data-resposta="{r.get("id")}"] [data-link-importada]').click()
    ok = c.esperar(lambda: c.tem(f'[data-aplicacao="{rr.get("importada_id")}"]'), 60)
    p.check(ok, "[questionario] Prontuário › Questionários mostra a aplicação importada")
    sem_toast(c)
    c.print("prontuario_questionario_importado")
    c.fim()
    # o site antigo do Nutri, lado a lado: a mesma aplicação e a mesma resposta (importada, com o paciente)
    if ESTADO.get("antigo"):
        sess = B.sessao("nutri-legado")
        ctx = nav.new_context(viewport={"width": 1280, "height": 883}, device_scale_factor=2, locale="pt-BR", timezone_id="America/Sao_Paulo")
        pg = ctx.new_page()
        try:
            pg.goto(f"{ESTADO['antigo']}/entrar/nutricionista", wait_until="domcontentloaded")
            pg.evaluate("([k, v]) => localStorage.setItem(k, v)", [CHAVE_LS_NUTRI, json.dumps(sess)])
            pg.goto(f"{ESTADO['antigo']}/pacientes/{pac['id']}/questionarios", wait_until="domcontentloaded")
            ok = esperar_pg(pg, lambda: pg.locator(f'[data-aplicacao="{rr.get("importada_id")}"]').count() > 0, 60)
            p.check(ok, "[questionario] o SITE ANTIGO mostra a mesma aplicação no paciente")
            print_pg(pg, "nutri_antigo_questionario")
            pg.goto(f"{ESTADO['antigo']}/respostas-pre-consulta", wait_until="domcontentloaded")
            ok = esperar_pg(pg, lambda: pg.locator(f'[data-resposta="{r.get("id")}"]').count() > 0, 60)
            linha = pg.locator(f'[data-resposta="{r.get("id")}"]')
            p.check(ok and linha.get_attribute("data-resposta-importada") == "1" and linha.get_attribute("data-resposta-paciente") == pac["id"],
                    "[questionario] e a resposta (importada, ligada ao paciente) em Respostas pré-consulta do site antigo")
            print_pg(pg, "nutri_antigo_respostas")
        finally:
            ctx.close()


@caso
def caso_cadastrar(nav):
    w13 = m()["conta_w13"]
    f = m()["formularios"]["camila"]
    r1 = responder_api(f["slug"], f"{B.MARCA} Nova Aluna {B.carimbo()}", "w13.marina.teste.claude@physiqnutri.app", {"p1": "Saúde", "p2": False, "p3": 2})
    c = abrir(nav, "cadastrar", "w13-nutri", "/painel/pre-consulta?aba=respostas")
    c.esperar(lambda: c.tem(f'[data-resposta="{r1["id"]}"]'), 40)
    ocioso(c)
    c.pg.locator(f'[data-resposta="{r1["id"]}"] [data-btn-ligar-resposta]').click()
    c.esperar(lambda: c.tem("[data-btn-cadastrar-da-resposta]"), 10)
    c.pg.locator("[data-btn-cadastrar-da-resposta]").click()
    ok = c.esperar(lambda: c.tem("[data-form-cadastrar-da-resposta]") and c.tem("[data-cadastro-resposta-email]"), 15)
    p.check(ok, "[cadastrar] abre o cadastro com os dados de quem respondeu")
    ok = c.esperar(lambda: c.tem("[data-form-cadastrar-da-resposta] [data-erro-campo]"), 20)
    p.check(ok and "Já existe um aluno com este e-mail" in c.pg.locator("[data-form-cadastrar-da-resposta] [data-erro-campo]").inner_text(),
            "[cadastrar] W16b: o e-mail é de outro aluno → mensagem vermelha embaixo do campo")
    c.print("cadastrar_email_repetido")
    novo_email = f"w21.novo.{B.carimbo()}.teste.claude@physiqnutri.app"
    c.pg.locator("[data-cadastro-resposta-email]").fill(novo_email)
    c.pg.locator("[data-cadastro-resposta-email]").blur()
    c.esperar(lambda: c.pg.locator("[data-form-cadastrar-da-resposta] [data-erro-campo]").count() == 0, 15)
    c.pg.locator("[data-btn-cadastrar-ligar]").click()
    ok = c.esperar(lambda: (c.pg.locator(f'[data-resposta="{r1["id"]}"]').get_attribute("data-resposta-aluno") or "") != "", 40)
    novo = B.sql_principal(f"select id::text, nutricionista_id::text, conta_id::text from {S}.pacientes where lower(email) = {q(novo_email)} and deleted_at is null")
    p.check(ok and novo and novo[0]["conta_id"] == w13 and novo[0]["nutricionista_id"] == B.uid("w13-nutri"), f"[cadastrar] cadastrou (na conta, com ela de nutri) e ligou ({novo})")
    p.check(c.pg.locator(f'[data-resposta="{r1["id"]}"]').get_attribute("data-resposta-aluno") == (novo[0]["id"] if novo else "?"), "[cadastrar] a resposta está ligada ao aluno novo")
    c.fim()


@caso
def caso_inativo(nav):
    f = ESTADO.get("form_personal") or m()["formularios"]["lucas"]
    conta = "prof2" if ESTADO.get("form_personal") else "w13-dono"
    c = abrir(nav, "inativo", conta, "/painel/pre-consulta")
    c.esperar(lambda: c.tem(f'[data-formulario="{f["id"]}"]'), 40)
    c.pg.locator(f'[data-formulario="{f["id"]}"] [data-btn-ativo-formulario]').click()
    ok = c.esperar(lambda: c.pg.locator(f'[data-formulario="{f["id"]}"]').get_attribute("data-formulario-ativo") == "0", 30)
    p.check(ok, "[inativo] desativou (INATIVO na lista)")
    ctx, pg, _erros = publico(nav, "inativo")
    try:
        pg.goto(f"{ESTADO['base']}/f/{f['slug']}", wait_until="domcontentloaded")
        ok = esperar_pg(pg, lambda: pg.locator("[data-formulario-nao-encontrado]").count() > 0, 40)
        p.check(ok and "Formulário não encontrado ou desativado" in pg.inner_text("body"), "[inativo] o /f/ mostra a mensagem do Nutri")
        print_pg(pg, "publico_nao_encontrado")
        pg.goto(f"{ESTADO['base']}/f/naoexiste", wait_until="domcontentloaded")
        p.check(esperar_pg(pg, lambda: pg.locator("[data-formulario-nao-encontrado]").count() > 0, 40), "[inativo] slug inexistente: a mesma mensagem")
    finally:
        ctx.close()
    c.pg.locator(f'[data-formulario="{f["id"]}"] [data-btn-ativo-formulario]').click()
    ok = c.esperar(lambda: c.pg.locator(f'[data-formulario="{f["id"]}"]').get_attribute("data-formulario-ativo") == "1", 30)
    p.check(ok, "[inativo] ativou de novo")
    st, r = B.rpc("", "preconsulta_formulario", {"p_slug": f["slug"]})
    p.check(st == 200 and isinstance(r, dict), "[inativo] o /f/ volta a abrir")
    c.fim()


@caso
def caso_rotas(nav):
    c = abrir(nav, "rotas", "w13-dono", "/respostas-pre-consulta?sem=1")
    ok = c.esperar(lambda: c.tem("[data-aba-respostas]"), 40)
    caminho = c.caminho()
    p.check(ok and caminho.startswith("/painel/pre-consulta") and "aba=respostas" in caminho and "sem=1" in caminho, f"[rotas] /respostas-pre-consulta?sem=1 → {caminho}")
    ocioso(c)
    novas = c.pg.locator("[data-resposta]").evaluate_all("els => els.map(e => e.dataset.respostaNova)")
    p.check(bool(novas) and all(x == "1" for x in novas), f"[rotas] o ?sem=1 do Nutri = só as novas ({novas})")
    c.ir("/pre-consulta")
    ok = c.esperar(lambda: c.caminho().startswith("/painel/pre-consulta") and c.tem("[data-aba-formularios]"), 30)
    p.check(ok, f"[rotas] /pre-consulta → {c.caminho()}")
    c.fim()


# ───────────────────────── negativos ─────────────────────────

@caso
def caso_dono(nav):
    w13 = m()["conta_w13"]
    fm, rm = m()["formularios"], m()["respostas"]
    c = abrir(nav, "dono", "w13-dono", "/painel/pre-consulta")
    c.esperar(lambda: c.tem(f'[data-formulario="{fm["camila"]["id"]}"]'), 40)
    ocioso(c)
    autor = c.pg.locator(f'[data-formulario="{fm["camila"]["id"]}"] [data-formulario-autor]')
    p.check(autor.count() == 1 and "Camila Rocha" in autor.inner_text(), "[dono] vê o formulário da Camila, com o autor")
    p.check(c.pg.locator(f'[data-formulario="{fm["bruno"]["id"]}"]').count() == 1, "[dono] e o do Bruno (a equipe)")
    p.check(c.pg.locator(f'[data-formulario="{fm["camila"]["id"]}"]').get_attribute("data-formulario-respostas") == "0",
            "[dono] NEGATIVO: a contagem do formulário da Camila não mostra respostas para ele (não lê — regra da W18)")
    p.check(c.pg.locator(f'[data-formulario="{fm["camila"]["id"]}"] [data-respostas-com-a-nutri]').count() == 1
            and c.pg.locator(f'[data-formulario="{fm["bruno"]["id"]}"] [data-respostas-com-a-nutri]').count() == 0,
            "[dono] no formulário da Camila: 'Com a nutricionista' (cadeado), não 'Nenhuma resposta'; no do Bruno, a contagem")
    sem_toast(c)
    c.print("tela6_preconsulta_dono")
    c.pg.locator('[data-aba-preconsulta-botao="respostas"]').click()
    c.esperar(lambda: c.tem("[data-aba-respostas]"), 20)
    ocioso(c)
    vistos = set(c.pg.locator("[data-resposta]").evaluate_all("els => els.map(e => e.dataset.resposta)"))
    p.check(rm["lucas"]["id"] in vistos and rm["bruno"]["id"] in vistos, "[dono] lê a resposta dele e a do Bruno")
    p.check(rm["camila"]["id"] not in vistos, "[dono] NEGATIVO: NÃO lê a resposta do formulário da Camila (pré-anamnese)")
    p.check(c.pg.locator("[data-btn-importar-resposta]").count() == 0, "[dono] NEGATIVO: sem 'Importar' (não é nutricionista)")
    n_banco = novas_no_banco("w13-dono", w13)
    c.esperar(lambda: numero_do_menu(c) == n_banco, 20)
    p.check(numero_do_menu(c) == n_banco, f"[dono] o número do menu = o que o banco deixa ele ler ({numero_do_menu(c)} × {n_banco})")
    sem_toast(c)
    c.print("tela7_respostas_dono")
    c.fim()


@caso
def caso_membro(nav):
    fm, rm = m()["formularios"], m()["respostas"]
    c = abrir(nav, "membro", "w13-personal2", "/painel/pre-consulta")
    c.esperar(lambda: c.tem(f'[data-formulario="{fm["bruno"]["id"]}"]'), 40)
    ocioso(c)
    forms = set(c.pg.locator("[data-formulario]").evaluate_all("els => els.map(e => e.dataset.formulario)"))
    p.check(fm["bruno"]["id"] in forms and fm["lucas"]["id"] not in forms and fm["camila"]["id"] not in forms, "[membro] P1: só o formulário dele")
    c.ir("/painel/pre-consulta?aba=respostas")
    c.esperar(lambda: c.tem(f'[data-resposta="{rm["bruno"]["id"]}"]'), 40)
    vistos = set(c.pg.locator("[data-resposta]").evaluate_all("els => els.map(e => e.dataset.resposta)"))
    p.check(vistos == {rm["bruno"]["id"]} or (rm["bruno"]["id"] in vistos and not vistos & {rm["lucas"]["id"], rm["camila"]["id"]}), "[membro] P1: só a resposta dele")
    c.fim()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--prefixo", required=True)
    ap.add_argument("--site", default="", help="origem esperada do link público (padrão: a --base no local; o site do ambiente fora dele)")
    ap.add_argument("--antigo", default="https://physiqnutri-staging.vercel.app")
    ap.add_argument("--casos", default=",".join(CASOS))
    a = ap.parse_args()
    base = a.base.rstrip("/")
    ESTADO.update(base=base, prefixo=a.prefixo, antigo=a.antigo.rstrip("/"),
                  site=(a.site or (base if re.match(r"^http://(localhost|127\.0\.0\.1)", base) else "https://physiqcalc-staging.vercel.app")).rstrip("/"))
    ESTADO["massa"] = B.massa()
    assert ESTADO["massa"].get("conta_w13"), "rode antes: python3 e2e/w21/massa.py"
    t0 = time.time()
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox"])
        for nome in a.casos.split(","):
            print(f"\n— caso {nome}", flush=True)
            B.saude_ok(nome)
            try:
                CASOS[nome](nav)  # type: ignore[operator]
            except Exception as e:  # noqa: BLE001
                p.check(False, f"[{nome}] {type(e).__name__}: {str(e)[:300]}")
                caso_atual = B.B5.ESTADO.get("caso")
                if caso_atual:
                    caso_atual.diagnostico()
            time.sleep(3)
        nav.close()
    print(f"\nW21 · telas ({a.prefixo}) · {time.time() - t0:.0f}s")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
