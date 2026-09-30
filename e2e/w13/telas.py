#!/usr/bin/env python3
"""Physiq W13 — E2E de telas da página Alunos (telas 6/7) e da trava "Acesso pausado pelo seu profissional" (F5).

Casos (em série; /health do Treino antes de cada um): lista · p1 · bloquear (painel → app fechado → Perfil reduzido → desbloquear →
app abre) · novo (cadastrar, convidar, link) · pendentes · cadastro (/c/ público) · limite (11º recusado) · sem_responsavel (atribuir).
Prints: site 1280 × 883 × 2 (= 2560 × 1766, telas 6–8) e app 390 × 844 × 3,4 (telas 1–5) em ~/projetos/physiqcalc-scratch/prints/w13/.
Uso: python3 e2e/w13/telas.py --base http://localhost:5173 --prefixo local [--casos lista,bloquear]
"""
from __future__ import annotations

import argparse
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

p = B.p
S = "staging"
B.ESTADO["schema"] = S
C = B.conta_de("w13-dono", B.NOME_CONTA)
CL = B.conta_de("w13-limite", B.NOME_CONTA_LIMITE)


def q(sql: str) -> list:
    return B.sql_principal(sql)


def caso(nav, base: str, pref: str, nome: str, conta: str | None, rota: str, desktop: bool = True, esperar: str | None = None) -> "B.Caso":
    c = B.Caso(nav, base, pref, nome, desktop=desktop)
    if conta:
        c.entrar(conta, rota, zerar=True)
        c.fechar_avisos()
    else:
        c.ir(rota)
    if esperar:
        ok = c.esperar(lambda: c.tem(esperar), 90)
        p.check(ok, f"[{nome}] {rota} abriu ({esperar})")
        if not ok:
            c.diagnostico()
    return c


def texto(c, sel: str) -> str:
    try:
        loc = c.pg.locator(sel).first
        return loc.inner_text(timeout=3000).strip() if loc.count() else ""
    except Exception:  # noqa: BLE001
        return ""


def attr(c, sel: str, nome: str) -> str | None:
    try:
        loc = c.pg.locator(sel).first
        return loc.get_attribute(nome, timeout=3000) if loc.count() else None
    except Exception:  # noqa: BLE001
        return None


def foto(c, nome: str) -> str:
    try:
        c.pg.mouse.move(5, 5)
    except Exception:  # noqa: BLE001
        pass
    c.esperar(lambda: c.pg.locator("[data-sonner-toast]").count() == 0, 10)
    return c.print(nome)


def contador_menu(c) -> str:
    return texto(c, '[data-menu-lateral] [data-nav="/painel/alunos"] [data-contador]')


def numero_igual_tela(c, rotulo: str) -> None:
    ok = c.esperar(lambda: contador_menu(c) != "" and attr(c, "[data-pagina-alunos]", "data-total-alunos") is not None
                   and contador_menu(c) == attr(c, "[data-pagina-alunos]", "data-total-alunos") and attr(c, "[data-pagina-alunos]", "data-situacao") == "ativos", 40)
    p.check(ok, f"[{rotulo}] número = tela: menu Alunos {contador_menu(c)!r} = total da lista (Ativos) {attr(c, '[data-pagina-alunos]', 'data-total-alunos')!r}")


def sem_erro(c, nome: str) -> None:
    ruins = [e for e in c.erros if "ResizeObserver" not in e]
    p.check(not ruins, f"[{nome}] sem erro de página {ruins[:2]}")


def pid(nome: str, conta: str) -> str:
    r = B.paciente(nome, conta)
    assert r, nome
    return r["id"]


# ───────────────────────── casos ─────────────────────────

def lista(nav, base, pref):
    c = caso(nav, base, pref, "lista", "w13-dono", "/painel/alunos", esperar="[data-linhas-alunos]")
    try:
        nomes = [attr(c, f"[data-aluno-linha]:nth-of-type({i})", "data-aluno-nome") for i in range(1, 9)]
        p.check(c.pg.locator("[data-aluno-linha]").count() >= 6, f"[lista] linhas dos alunos ativos: {[n for n in nomes if n]}")
        raf = pid("Rafael Moura", C)
        linha = f'[data-aluno-linha="{raf}"]'
        p.check(texto(c, f'{linha} [data-chip-aluno="treino"]') == "TREINO · LUCAS" and texto(c, f'{linha} [data-chip-aluno="nutricao"]') == "NUTRIÇÃO · CAMILA",
                "[lista] chips da tela 7: TREINO · LUCAS / NUTRIÇÃO · CAMILA")
        p.check(c.tem(f'{linha} [data-selo-aluno="pago"]') and c.tem(f'{linha} [data-tag-aluno="VIP"]'), "[lista] selo PAGO ATÉ e a tag VIP na linha do Rafael")
        ok_foto = c.esperar(lambda: c.pg.evaluate(f"""() => {{ const i = document.querySelector('{linha} img'); return !!i && i.complete && i.naturalWidth > 0; }}"""), 20)
        p.check(ok_foto, "[lista] foto do aluno carregada (linha com foto, como a tela 7)")
        p.check(c.tem('[data-situacao-filtro="ativos"][aria-checked="true"]'), "[lista] filtro padrão = Ativos")
        numero_igual_tela(c, "lista")
        joao = pid("João Pedro", C)
        p.check(c.tem(f'[data-aluno-linha="{joao}"] [data-selo-aluno="pendente"]'), "[lista] João Pedro com o selo PENDENTE (mensalidade)")
        # busca
        c.pg.fill("[data-busca-alunos]", "beatriz")
        ok = c.esperar(lambda: c.pg.locator("[data-aluno-linha]").count() == 1 and attr(c, "[data-aluno-linha]", "data-aluno-nome") == "Beatriz Lima", 20)
        p.check(ok, "[lista] busca por nome acha 1 (Beatriz)")
        c.pg.fill("[data-busca-alunos]", "")
        c.esperar(lambda: c.pg.locator("[data-aluno-linha]").count() >= 6, 20)
        foto(c, "lista")
        sem_erro(c, "lista")
    finally:
        c.ctx.close()


def p1(nav, base, pref):
    c = caso(nav, base, pref, "p1", "w13-personal2", "/painel/alunos", esperar="[data-linhas-alunos]")
    try:
        ok = c.esperar(lambda: c.pg.locator("[data-aluno-linha]").count() == 1, 20)
        p.check(ok and attr(c, "[data-aluno-linha]", "data-aluno-nome") == "Carlos Souza", "[p1] o 2º personal vê só o aluno dele (P1)")
        numero_igual_tela(c, "p1")
        p.check(not c.tem("[data-filtro-pagamento]"), "[p1] membro não tem o filtro de pagamento (a mensalidade é do dono)")
        sub = texto(c, "[data-titulo-pagina] + div")
        p.check("alunos que você acompanha" in sub and " de 10" not in sub, f"[p1] subtítulo sem o uso da conta inteira (número = tela) → {sub!r}")
        foto(c, "p1_personal2")
    finally:
        c.ctx.close()


def bloquear(nav, base, pref):
    raf = pid("Rafael Moura", C)
    q(f"update {S}.pacientes set acesso_bloqueado_em = null, acesso_bloqueado_msg = null where id = '{raf}'")
    c = caso(nav, base, pref, "bloquear", "w13-dono", "/painel/alunos", esperar=f'[data-aluno-linha="{raf}"]')
    try:
        numero_igual_tela(c, "bloquear-antes")
        antes = int(contador_menu(c) or 0)
        c.pg.click(f'[data-menu-aluno="{raf}"]')
        c.esperar(lambda: c.tem(f'[data-menu-aluno-aberto="{raf}"]'), 10)
        foto(c, "menu_acoes")
        c.pg.click(f'[data-menu-aluno-aberto="{raf}"] [data-acao-aluno="bloquear"]')
        ok = c.esperar(lambda: c.tem('[data-confirmar-acao="bloquear"]'), 10)
        p.check(ok and "Acesso pausado pelo seu profissional" in texto(c, '[data-confirmar-acao="bloquear"]'), "[bloquear] confirmação explica o efeito (app fecha, Perfil segue, vaga livre)")
        c.pg.fill("[data-bloquear-mensagem]", "Fale comigo para regularizar a mensalidade.")
        foto(c, "confirmar_bloqueio")
        c.pg.click("[data-confirmar-ok]")
        ok = c.esperar(lambda: c.pg.locator(f'[data-aluno-linha="{raf}"]').count() == 0, 30)
        p.check(ok, "[bloquear] Rafael sai dos Ativos na hora")
        ok = c.esperar(lambda: contador_menu(c) == str(antes - 1), 40)
        p.check(ok, f"[bloquear] número do menu cai 1 ({antes} → {contador_menu(c)})")
        numero_igual_tela(c, "bloquear-depois")
        c.pg.click('[data-situacao-filtro="bloqueados"]')
        ok = c.esperar(lambda: c.tem(f'[data-aluno-linha="{raf}"] [data-selo-aluno="bloqueado"]'), 20)
        p.check(ok, "[bloquear] filtro Bloqueados mostra o Rafael com o selo BLOQUEADO")
        foto(c, "bloqueados")
        pr = B.paciente("Rafael Moura", C)
        p.check(pr["acesso_bloqueado_em"] is not None, "[bloquear] gravou acesso_bloqueado_em (F5)")
        tu = B.treino_id("w13-aluno")
        ok = B.esperar(lambda: B.status_treino(tu) == "bloqueado", 120, 3) if tu else None
        p.check(bool(ok), f"[bloquear] espelho no Treino (leitura pelo caminho online): status = {B.status_treino(tu) if tu else None}")
    finally:
        c.ctx.close()
    # o app do aluno (celular)
    B.saude_ok("app do aluno bloqueado")
    a = caso(nav, base, pref, "app_bloqueado", "w13-aluno", "/", desktop=False, esperar='[data-trava-app="bloqueio-profissional"]')
    try:
        t = texto(a, '[data-trava-app="bloqueio-profissional"]')
        p.check("Acesso pausado pelo seu profissional" in t and "Fale comigo para regularizar a mensalidade." in t, "[app] fechado com a mensagem do profissional")
        p.check(a.tem("[data-trava-sair]") and a.tem("[data-trava-meus-dados]"), "[app] Sair e Exportar/Excluir na trava")
        p.check(not a.tem("[data-aba-inicio]") and not a.tem("[data-aba-treino]"), "[app] nenhum conteúdo de aba abre (negativo; a barra de abas fica, como na trava do master)")
        foto(a, "app_bloqueado")
        a.pg.click("[data-trava-meus-dados]")
        ok = a.esperar(lambda: "Exportar meus dados" in a.texto() and "Excluir minha conta" in a.texto(), 30)
        p.check(ok, "[app] Perfil reduzido: Sair, Exportar e Excluir (spec 9)")
        foto(a, "app_bloqueado_perfil")
        a.ir("/treino")
        ok = a.esperar(lambda: a.tem('[data-trava-app="bloqueio-profissional"]'), 20)
        p.check(ok, "[app] /treino continua fechado (negativo)")
    finally:
        a.ctx.close()
    # desbloquear pelo painel
    d = caso(nav, base, pref, "desbloquear", "w13-dono", "/painel/alunos?situacao=bloqueados", esperar=f'[data-aluno-linha="{raf}"]')
    try:
        d.pg.click(f'[data-menu-aluno="{raf}"]')
        d.esperar(lambda: d.tem(f'[data-menu-aluno-aberto="{raf}"]'), 10)
        d.pg.click(f'[data-menu-aluno-aberto="{raf}"] [data-acao-aluno="desbloquear"]')
        ok = d.esperar(lambda: d.pg.locator(f'[data-aluno-linha="{raf}"]').count() == 0, 30)
        p.check(ok, "[desbloquear] sai dos Bloqueados")
        d.pg.click('[data-situacao-filtro="ativos"]')
        ok = d.esperar(lambda: d.tem(f'[data-aluno-linha="{raf}"]'), 20)
        p.check(ok, "[desbloquear] volta para os Ativos")
        numero_igual_tela(d, "desbloquear")
    finally:
        d.ctx.close()
    tu = B.treino_id("w13-aluno")
    B.esperar(lambda: B.status_treino(tu) == "ativo", 120, 3)
    B.saude_ok("app do aluno desbloqueado")
    a2 = caso(nav, base, pref, "app_desbloqueado", "w13-aluno", "/", desktop=False, esperar="[data-aba-inicio]")
    try:
        p.check(not a2.tem('[data-trava-app="bloqueio-profissional"]'), "[app] desbloqueado: o app abre no Início")
        ok = a2.esperar(lambda: (attr(a2, "[data-card-treino-hoje]", "data-card-treino-hoje") or "carregando") != "carregando", 90)
        p.check(ok, f"[app] o card do treino carregou (sessão do Treino de volta) → {attr(a2, '[data-card-treino-hoje]', 'data-card-treino-hoje')}")
        foto(a2, "app_desbloqueado")
    finally:
        a2.ctx.close()


def novo(nav, base, pref):
    q(f"delete from {S}.pacientes where conta_id = '{C}' and nome = 'Helena Teste W13'")
    q(f"delete from {S}.convites where conta_id = '{C}' and lower(email) in ('w13.helena.teste.claude@physiqnutri.app', 'w13.convite2.teste.claude@physiqnutri.app')")
    c = caso(nav, base, pref, "novo", "w13-dono", "/painel/alunos", esperar="[data-linhas-alunos]")
    try:
        numero_igual_tela(c, "novo-antes")
        antes = int(contador_menu(c) or 0)
        c.pg.click("[data-novo-aluno-abrir]")
        ok = c.esperar(lambda: c.tem('[data-novo-aluno="cadastrar"]'), 10)
        p.check(ok and "7 de 10" in texto(c, "[data-novo-vagas]") or "de 10" in texto(c, "[data-novo-vagas]"), f"[novo] o limite do plano aparece: {texto(c, '[data-novo-vagas]')!r}")
        c.pg.fill("[data-novo-nome]", "Helena Teste W13")
        c.pg.fill("[data-novo-email]", "w13.helena.teste.claude@physiqnutri.app")
        foto(c, "novo_aluno")
        c.pg.click("[data-novo-cadastrar]")
        ok = c.esperar(lambda: c.tem("[data-novo-feito]"), 30)
        p.check(ok, "[novo] cadastrou (e oferece abrir o aluno para criar o acesso)")
        c.pg.keyboard.press("Escape")
        ok = c.esperar(lambda: c.pg.locator('[data-aluno-nome="Helena Teste W13"]').count() == 1, 30)
        p.check(ok, "[novo] Helena aparece na lista")
        ok = c.esperar(lambda: contador_menu(c) == str(antes + 1), 40)
        p.check(ok, f"[novo] número do menu sobe 1 ({antes} → {contador_menu(c)})")
        # convidar
        c.pg.click("[data-novo-aluno-abrir]")
        c.esperar(lambda: c.tem("[data-novo-aluno]"), 10)
        c.pg.locator('[data-novo-aluno] [role="radio"]', has_text="Convidar").click()
        c.esperar(lambda: c.tem("[data-form-convidar]"), 10)
        c.pg.fill("[data-convite-email]", "w13.helena.teste.claude@physiqnutri.app")
        c.pg.click("[data-convite-enviar]")
        ok = c.esperar(lambda: "já é de um aluno ativo" in texto(c, "[data-convite-erro]"), 30)
        p.check(ok, f"[novo] convidar quem já é aluno da conta é recusado (negativo) → {texto(c, '[data-convite-erro]')!r}")
        c.pg.fill("[data-convite-email]", "w13.convite2.teste.claude@physiqnutri.app")
        c.pg.click("[data-convite-enviar]")
        ok = c.esperar(lambda: c.tem("[data-convite-feito]"), 40)
        p.check(ok and attr(c, "[data-convite-feito]", "data-convite-feito") == "enviado", f"[novo] convite enviado (conta de teste → caixa de teste) → {attr(c, '[data-convite-feito]', 'data-convite-feito')}")
        ok = c.esperar(lambda: c.tem('[data-convite-pendente-email="w13.convite2.teste.claude@physiqnutri.app"]'), 20)
        p.check(ok, "[novo] aparece em Convites pendentes")
        foto(c, "convidar")
        c.pg.locator('[data-novo-aluno] [role="radio"]', has_text="Link e código").click()
        ok = c.esperar(lambda: c.tem("[data-link-convite]") and c.tem("[data-link-cadastro]"), 20)
        link = c.pg.input_value("[data-link-convite]") if ok else ""
        cad = c.pg.input_value("[data-link-cadastro]") if ok else ""
        p.check(ok and "/?prof=PROF-" in link and "/c/PROF-" in cad, f"[novo] link ?prof= e link de cadastro /c/ → {link} · {cad}")
        foto(c, "link")
        sem_erro(c, "novo")
    finally:
        c.ctx.close()
        q(f"delete from {S}.pacientes where conta_id = '{C}' and nome = 'Helena Teste W13'")
        q(f"delete from {S}.convites where conta_id = '{C}' and lower(email) in ('w13.helena.teste.claude@physiqnutri.app', 'w13.convite2.teste.claude@physiqnutri.app')")


def captcha(ligado: bool) -> None:
    q(f"""update {S}.app_config set valor = jsonb_set(valor, '{{captcha}}', '{str(ligado).lower()}'::jsonb) where chave = 'login_limite'""")


def codigo_lucas() -> str:
    return q(f"select codigo_convite from {S}.conta_membros where conta_id = '{C}' and user_id = '{B.uid('w13-dono')}'")[0]["codigo_convite"]


def cadastro(nav, base, pref):
    cod = codigo_lucas()
    q(f"delete from {S}.cadastros_pendentes where conta_id = '{C}'")
    neg = caso(nav, base, pref, "cadastro_invalido", None, "/c/NAO-EXISTE-W13", desktop=False)
    try:
        ok = neg.esperar(lambda: "Link de cadastro não encontrado" in neg.texto(), 30)
        p.check(ok, "[cadastro] link inexistente → aviso (negativo)")
    finally:
        neg.ctx.close()
    c = caso(nav, base, pref, "cadastro", None, f"/c/{cod}", desktop=False, esperar="[data-form-cadastro-publico]")
    try:
        p.check("Lucas Ferreira" in texto(c, "[data-cadastro-profissional]"), "[cadastro] mostra de quem é o link")
        c.pg.fill("[data-cad-nome]", "Sofia Cadastro W13")
        c.pg.fill("[data-cad-email]", "w13.sofia.teste.claude@physiqnutri.app")
        c.pg.fill("[data-cad-telefone]", "(82) 97777-6666")
        c.pg.fill("[data-cad-obs]", "Treino de manhã, joelho sensível.")
        foto(c, "cadastro_publico")
        captcha(False)  # o Chromium automatizado cai no desafio do Turnstile: no staging, só neste envio, o captcha fica desligado
        try:
            c.pg.click("[data-cad-enviar]")
            ok = c.esperar(lambda: c.tem("[data-cadastro-enviado]"), 40)
        finally:
            captcha(True)
        p.check(ok, "[cadastro] enviado — fica pendente")
        foto(c, "cadastro_enviado")
        pend = q(f"select count(*) as n from {S}.cadastros_pendentes where conta_id = '{C}' and status = 'pendente' and nome = 'Sofia Cadastro W13'")[0]["n"]
        p.check(pend == 1, f"[cadastro] 1 cadastro pendente no banco → {pend}")
    finally:
        c.ctx.close()


def pendentes(nav, base, pref):
    if not q(f"select 1 from {S}.cadastros_pendentes where conta_id = '{C}' and status = 'pendente'"):
        cadastro(nav, base, pref)
    c = caso(nav, base, pref, "pendentes", "w13-dono", "/painel/alunos", esperar="[data-linhas-alunos]")
    try:
        ok = c.esperar(lambda: attr(c, "[data-abrir-pendentes]", "data-abrir-pendentes") == "1", 20)
        p.check(ok, f"[pendentes] botão Pendentes com 1 → {attr(c, '[data-abrir-pendentes]', 'data-abrir-pendentes')}")
        c.pg.click("[data-abrir-pendentes]")
        ok = c.esperar(lambda: c.tem('[data-pendente-nome="Sofia Cadastro W13"]'), 20)
        p.check(ok, "[pendentes] a Sofia está na fila")
        foto(c, "pendentes")
        c.pg.click("[data-pendente-aprovar]")
        ok = c.esperar(lambda: c.pg.locator('[data-pendente-nome="Sofia Cadastro W13"]').count() == 0, 30)
        p.check(ok, "[pendentes] aprovar tira da fila")
        c.pg.keyboard.press("Escape")
        ok = c.esperar(lambda: c.pg.locator('[data-aluno-nome="Sofia Cadastro W13"]').count() == 1, 30)
        p.check(ok, "[pendentes] Sofia entra na lista de alunos")
        so = B.paciente("Sofia Cadastro W13", C)
        p.check(so and so["personal_id"] == B.uid("w13-dono"), "[pendentes] com o dono do link (Lucas) como responsável")
    finally:
        c.ctx.close()
        q(f"delete from {S}.pacientes where conta_id = '{C}' and nome = 'Sofia Cadastro W13'")
        q(f"delete from {S}.cadastros_pendentes where conta_id = '{C}'")


def limite(nav, base, pref):
    q(f"delete from {S}.pacientes where conta_id = '{CL}' and nome like 'Extra%'")
    c = caso(nav, base, pref, "limite", "w13-limite", "/painel/alunos", esperar="[data-linhas-alunos]")
    try:
        ok = c.esperar(lambda: c.tem("[data-aviso-limite]"), 20)
        p.check(ok and "Seu plano permite 10 alunos ativos" in texto(c, "[data-aviso-limite]") and "10 de 10" in texto(c, "[data-aviso-limite]"),
                f"[limite] faixa do limite com o uso: {texto(c, '[data-aviso-limite]')!r}")
        numero_igual_tela(c, "limite")
        foto(c, "limite")
        c.pg.click("[data-novo-aluno-abrir]")
        c.esperar(lambda: c.tem("[data-form-cadastrar]"), 10)
        c.pg.fill("[data-novo-nome]", "Extra Onze W13")
        c.pg.click("[data-novo-cadastrar]")
        ok = c.esperar(lambda: "Seu plano permite 10 alunos ativos" in texto(c, "[data-novo-erro]"), 30)
        p.check(ok, f"[limite] o 11º aluno é recusado na tela: {texto(c, '[data-novo-erro]')!r}")
        foto(c, "limite_novo")
        n = q(f"select count(*) as n from {S}.pacientes where conta_id = '{CL}' and nome like 'Extra%'")[0]["n"]
        p.check(n == 0, "[limite] nada foi gravado (servidor recusou)")
    finally:
        c.ctx.close()


def sem_responsavel(nav, base, pref):
    die = pid("Diego Souza", C)
    q(f"update {S}.pacientes set personal_id = null, nutricionista_id = null where id = '{die}'")
    c = caso(nav, base, pref, "sem_responsavel", "w13-dono", "/painel/alunos?responsavel=sem", esperar=f'[data-aluno-linha="{die}"]')
    try:
        p.check(c.tem('[data-atribuir-lote]') and c.tem(f'[data-selecionar-aluno="{die}"]'), "[sem_responsavel] seleção e a barra 'Atribuir a…'")
        p.check(c.tem(f'[data-aluno-linha="{die}"] [data-chip-aluno="sem-responsavel"]'), "[sem_responsavel] chip SEM RESPONSÁVEL")
        c.pg.click(f'[data-selecionar-aluno="{die}"]')
        c.pg.select_option("[data-atribuir-modulo]", "nutricao")
        c.pg.select_option("[data-atribuir-responsavel]", B.uid("w13-nutri"))
        foto(c, "sem_responsavel")
        c.pg.click("[data-atribuir-confirmar]")
        ok = c.esperar(lambda: c.pg.locator(f'[data-aluno-linha="{die}"]').count() == 0, 30)
        p.check(ok, "[sem_responsavel] atribuído → sai do filtro 'Sem responsável'")
        d2 = B.paciente("Diego Souza", C)
        p.check(d2["nutricionista_id"] == B.uid("w13-nutri"), "[sem_responsavel] Camila é a responsável de nutrição do Diego")
    finally:
        c.ctx.close()
        q(f"update {S}.pacientes set personal_id = null, nutricionista_id = null where id = '{die}'")


CASOS = {"lista": lista, "p1": p1, "bloquear": bloquear, "novo": novo, "cadastro": cadastro, "pendentes": pendentes, "limite": limite,
         "sem_responsavel": sem_responsavel}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:5173")
    ap.add_argument("--prefixo", default="local")
    ap.add_argument("--casos", default=",".join(CASOS))
    a = ap.parse_args()
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        for nome in [x.strip() for x in a.casos.split(",") if x.strip()]:
            print(f"\n── {nome} ──", flush=True)
            if not B.saude_treino():
                p.check(False, f"{nome}: Banco do Treino lento/instável — parei (nada de restart)")
                break
            try:
                CASOS[nome](nav, a.base, a.prefixo)
            except SystemExit:
                raise
            except Exception as e:  # noqa: BLE001
                p.check(False, f"{nome}: exceção {type(e).__name__}: {str(e)[:300]}")
                if B.ESTADO.get("caso"):
                    try:
                        B.ESTADO["caso"].diagnostico()
                    except Exception:  # noqa: BLE001
                        pass
            time.sleep(3)
        nav.close()
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
