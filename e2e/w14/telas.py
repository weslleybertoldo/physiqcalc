#!/usr/bin/env python3
"""Physiq W14 — E2E de telas do Perfil do aluno no painel (tela 7: cabeçalho e cards do Resumo) e das travas do app (F2).

Casos (em série; /health do Treino antes de cada um):
  resumo    o cabeçalho (Mensagem, Nova avaliação, ⋯, linha e chips) e os 6 cards novos; o "Dados" antigo saiu (herdado W6)
  editar    Editar dados (cadastro no principal) + erro de validação (negativo)
  pdf       ⋯ → Gerar PDF "Dados & Evolução" (quem veio do Nutri, pelas antropometrias)
  acesso    ajuste "Acesso ao app" desligado → o app do aluno fecha com a mensagem própria; religado → abre
  diario    ajuste "Diário" desligado → a aba Dieta do app não oferece a foto (mensagem da spec 9); religado → oferece
  link      o card mostra /d/<código>; /p/<código> e /p/abc abrem o diário (F1 — R13)
  resumo_privado  salvar e voltar
  aviso     aviso único da P15 (Camila): o número = a lista; "Ligar para todos" liga exatamente os da lista
  acoes     Acesso do aluno › Desativar / Reativar e ⋯ › Remover da lista (função alunos da W13) com a Diego (sem login)
  negativo  P1: o 2º personal não abre o perfil do Rafael
Prints: site 1280 × 883 × 2 (= 2560 × 1766, tela 7) e app 390 × 844 × 3,4 em ~/projetos/physiqcalc-scratch/prints/w14/.
Uso: python3 e2e/w14/telas.py --base http://localhost:5173 --prefixo local [--casos resumo,acesso]
"""
from __future__ import annotations

import argparse
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


def q(sql: str) -> list:
    return B.sql_principal(sql)


def caso(nav, base: str, pref: str, nome: str, conta: str, rota: str, desktop: bool = True, esperar: str | None = None) -> "B.Caso":
    c = B.Caso(nav, base, pref, nome, desktop=desktop)
    c.entrar(conta, rota, zerar=True)
    c.fechar_avisos()
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


def rafael() -> dict:
    r = B.paciente("Rafael Moura", C)
    assert r, "Rafael"
    return r


def config(pid: str) -> dict:
    return q(f"select config from {S}.pacientes where id = '{pid}'")[0]["config"] or {}


def ajuste_ui(c, chave: str, ligar: bool) -> bool:
    """Clica no interruptor do ajuste (se precisar) e espera a tela e o banco concordarem."""
    sel = f'[data-ajuste="{chave}"]'
    atual = attr(c, sel, "data-ajuste-ligado") == "1"
    if atual != ligar:
        c.pg.click(f'[data-ajuste-botao="{chave}"]')
    return c.esperar(lambda: attr(c, sel, "data-ajuste-ligado") == ("1" if ligar else "0"), 20)


# ───────────────────────── casos ─────────────────────────

def resumo(nav, base, pref):
    raf = rafael()
    c = caso(nav, base, pref, "resumo", "w13-dono", f"/painel/alunos/{raf['id']}", esperar="[data-cabecalho-w14] [data-cabecalho-nome]")
    try:
        ok = c.esperar(lambda: all(c.tem(s) for s in ("[data-card-dados-aluno]", "[data-card-acesso-aluno]", "[data-card-ajustes-aluno]",
                                                      "[data-card-link-diario]", "[data-card-resumo-privado]", "[data-card-fluxo-consulta]")), 60)
        p.check(ok, "[resumo] os 6 cards da W14 no Resumo (dados, acesso, ajustes, link, resumo privado, fluxo de consulta)")
        linha = texto(c, "[data-cabecalho-linha]")
        p.check(linha.startswith("28 anos · 1,78 m · objetivo: definição · aluno desde"), f"[cabeçalho] linha da tela 7: {linha!r}")
        chips = texto(c, "[data-cabecalho-chips]").upper()
        p.check("TREINO · LUCAS" in chips and "NUTRIÇÃO · CAMILA" in chips, f"[cabeçalho] chips TREINO · LUCAS e NUTRIÇÃO · CAMILA ({chips!r})")
        zap = attr(c, "[data-acao-mensagem]", "data-acao-mensagem")
        p.check(zap == "https://wa.me/5500900001401", f"[cabeçalho] Mensagem abre o WhatsApp do aluno (P24): {zap}")
        p.check(c.tem("[data-acao-nova-avaliacao]") and c.tem("[data-menu-perfil]"), "[cabeçalho] Nova avaliação e ⋯")
        p.check(c.esperar(lambda: c.tem("[data-kpi-mensalidade]"), 30), "[cabeçalho] número da mensalidade (KPI da W6)")
        p.check(not c.tem("[data-fallback-aluno]") and not c.tem("[data-aluno-dados]"), "[herdado W6] o \"Dados\" do Configurar aluno antigo saiu do Resumo")
        p.check(not c.tem("[data-cabecalho-aluno]:not([data-cabecalho-w14])"), "[resumo] o cabeçalho padrão da W1 não aparece mais")
        foto(c, "resumo_topo")
        dados = texto(c, "[data-card-dados-aluno]")
        for rot, val in (("Nascimento", "10/03/1998 · 28 anos"), ("Sexo", "Masculino"), ("Telefone", "(00) 90000-1401"), ("Altura", "1,78 m"),
                         ("Peso", "84,2 kg"), ("Objetivo", "definição"), ("Apelido", "Rafa")):
            p.check(val in dados, f"[dados] {rot}: {val}")
        c.pg.click("[data-menu-perfil]")
        ok = c.esperar(lambda: c.tem("[data-menu-perfil-aberto]"), 10)
        itens = [x.get_attribute("data-acao-perfil") for x in c.pg.locator("[data-menu-perfil-aberto] [data-acao-perfil]").all()]
        p.check(ok and itens[:3] == ["editar", "pdf-dados", "acesso"] and {"bloquear", "desativar", "remover"} <= set(itens),
                f"[⋯] editar dados, PDF Dados & Evolução, Acesso do aluno, Bloquear, Desativar, Remover ({itens})")
        foto(c, "menu_perfil")
        c.pg.keyboard.press("Escape")
        c.pg.locator("[data-card-ajustes-aluno]").scroll_into_view_if_needed()
        c.pg.wait_for_timeout(600)
        foto(c, "resumo_cards")
        c.pg.locator("[data-card-fluxo-consulta]").scroll_into_view_if_needed()
        c.pg.wait_for_timeout(600)
        destinos = [x.get_attribute("data-atalho-destino") for x in c.pg.locator("[data-atalho]").all()]
        p.check(len(destinos) == 7 and all("physiqnutri-staging.vercel.app/pacientes/" in d or "physiqnutri-staging.vercel.app/agenda?paciente=" in d for d in destinos),
                f"[fluxo] 7 atalhos, cada um na seção do aluno no site antigo (as abas novas ainda não existem) ({len(destinos)})")
        foto(c, "resumo_fluxo")
    finally:
        c.fim()


def editar(nav, base, pref):
    raf = rafael()
    c = caso(nav, base, pref, "editar", "w13-dono", f"/painel/alunos/{raf['id']}", esperar="[data-dados-editar]")
    try:
        c.pg.click("[data-dados-editar]")
        ok = c.esperar(lambda: c.tem("[data-editar-dados]"), 10)
        p.check(ok and c.pg.input_value("[data-editar-nome]") == "Rafael Moura" and c.pg.input_value("[data-editar-nascimento]") == "1998-03-10",
                "[editar] a folha abre com o cadastro")
        c.pg.fill("[data-editar-nascimento]", "2099-01-01")
        c.pg.click("[data-editar-salvar]")
        ok = c.esperar(lambda: "Confira a data de nascimento" in texto(c, "[data-editar-erro]"), 10)
        p.check(ok, "[editar] negativo: data no futuro não salva (mensagem na folha)")
        c.pg.fill("[data-editar-nascimento]", "1998-03-10")
        c.pg.fill("[data-editar-objetivo]", "hipertrofia")
        foto(c, "editar_dados")
        c.pg.click("[data-editar-salvar]")
        ok = c.esperar(lambda: not c.tem("[data-editar-dados]") and "objetivo: hipertrofia" in texto(c, "[data-cabecalho-linha]"), 30)
        p.check(ok, f"[editar] salvou: o cabeçalho mostra o objetivo novo ({texto(c, '[data-cabecalho-linha]')!r})")
        p.check(rafael()["objetivo"] == "hipertrofia", "[editar] gravou no banco principal (matrícula)")
    finally:
        q(f"update {S}.pacientes set objetivo = 'definição' where id = '{raf['id']}'")
        c.fim()


def pdf(nav, base, pref):
    raf = rafael()
    c = caso(nav, base, pref, "pdf", "w13-dono", f"/painel/alunos/{raf['id']}", esperar="[data-menu-perfil]")
    try:
        c.pg.click("[data-menu-perfil]")
        c.esperar(lambda: c.tem('[data-acao-perfil="pdf-dados"]'), 10)
        with c.pg.expect_download(timeout=60000) as info:
            c.pg.click('[data-acao-perfil="pdf-dados"]')
        d = info.value
        destino = B.SCRATCH / f"{pref}_pdf_dados_evolucao.pdf"
        d.save_as(str(destino))
        tam = destino.stat().st_size
        p.check(d.suggested_filename.startswith("Physiq-Rafael Moura") and tam > 2000,
                f"[pdf] Dados & Evolução baixou ({d.suggested_filename}, {tam} bytes)")
    finally:
        c.fim()


def acesso(nav, base, pref):
    raf = rafael()
    c = caso(nav, base, pref, "acesso", "w13-dono", f"/painel/alunos/{raf['id']}", esperar='[data-ajuste="acesso_app"]')
    try:
        ok = ajuste_ui(c, "acesso_app", False)
        p.check(ok and config(raf["id"]).get("acesso_app") is False, "[acesso] o profissional desliga o \"Acesso ao app\" (gravou acesso_app=false)")
        c.pg.locator("[data-card-ajustes-aluno]").scroll_into_view_if_needed()
        foto(c, "ajuste_acesso_desligado")
    finally:
        c.fim()
    B.saude_ok("app com o acesso desligado")
    a = caso(nav, base, pref, "app_acesso_desligado", "w13-aluno", "/", desktop=False, esperar='[data-trava-app="acesso-app-desligado"]')
    try:
        t = texto(a, '[data-trava-app="acesso-app-desligado"]')
        p.check("Seu acesso ao app está desligado" in t and "Fale com seu profissional" in t, "[app] fechado com a mensagem da spec 9")
        p.check("Acesso pausado" not in t and "Pagamento pendente" not in t, "[app] não se confunde com as outras travas (bloqueio / pagamento)")
        p.check(a.tem("[data-trava-sair]") and a.tem("[data-trava-meus-dados]"), "[app] Sair e Exportar/Excluir na trava")
        p.check(not a.tem("[data-aba-inicio]"), "[app] negativo: o Início não abre")
        foto(a, "app_acesso_desligado")
    finally:
        a.ctx.close()
    c2 = caso(nav, base, pref, "acesso_religar", "w13-dono", f"/painel/alunos/{raf['id']}", esperar='[data-ajuste="acesso_app"]')
    try:
        ok = ajuste_ui(c2, "acesso_app", True)
        p.check(ok and config(raf["id"]).get("acesso_app") is True, "[acesso] religado")
    finally:
        c2.fim()
    B.saude_ok("app com o acesso religado")
    a2 = caso(nav, base, pref, "app_acesso_ligado", "w13-aluno", "/", desktop=False, esperar="[data-aba-inicio]")
    try:
        p.check(not a2.tem('[data-trava-app="acesso-app-desligado"]'), "[app] religado: o app abre no Início")
    finally:
        a2.ctx.close()


def diario(nav, base, pref):
    raf = rafael()
    q(f"update {S}.pacientes set config = coalesce(config, '{{}}'::jsonb) || '{{\"diario_alimentar\": false}}'::jsonb where id = '{raf['id']}'")
    try:
        B.saude_ok("app com o diário desligado")
        a = caso(nav, base, pref, "app_diario_desligado", "w13-aluno", "/dieta", desktop=False, esperar="[data-abrir-diario]")
        try:
            ok = a.esperar(lambda: attr(a, "[data-abrir-diario]", "data-diario-ligado") == "0", 30)
            p.check(ok and a.pg.locator("[data-abrir-diario]").is_disabled(), "[app] Dieta: \"Foto pro diário\" desligado")
            p.check("O envio de fotos está desligado pelo seu profissional" in texto(a, "[data-diario-desligado]"), "[app] a mensagem da spec 9 embaixo")
            foto(a, "app_diario_desligado")
        finally:
            a.ctx.close()
    finally:
        q(f"update {S}.pacientes set config = coalesce(config, '{{}}'::jsonb) || '{{\"diario_alimentar\": true}}'::jsonb where id = '{raf['id']}'")
    a2 = caso(nav, base, pref, "app_diario_ligado", "w13-aluno", "/dieta", desktop=False, esperar="[data-abrir-diario]")
    try:
        ok = a2.esperar(lambda: attr(a2, "[data-abrir-diario]", "data-diario-ligado") == "1", 30)
        p.check(ok and not a2.pg.locator("[data-abrir-diario]").is_disabled() and not a2.tem("[data-diario-desligado]"), "[app] religado: a foto volta")
    finally:
        a2.ctx.close()


def link(nav, base, pref):
    raf = rafael()
    cod = raf["link_codigo"]
    c = caso(nav, base, pref, "link", "w13-dono", f"/painel/alunos/{raf['id']}", esperar="[data-card-link-diario]")
    try:
        url = attr(c, "[data-link-diario]", "data-link-diario")
        p.check(url == f"https://physiqnutri-staging.vercel.app/d/{cod}", f"[link] o card mostra o link do DIÁRIO /d/<código> (F1): {url}")
        p.check(attr(c, "[data-card-link-diario]", "data-link-estado") == "ligado", "[link] ligado (diário e envio pelo link ligados)")
        c.pg.locator("[data-card-link-diario]").scroll_into_view_if_needed()
        foto(c, "card_link_diario")
    finally:
        c.fim()
    # /p/<código> (o link antigo) → o diário
    d = B.Caso(nav, base, pref, "p_codigo")
    try:
        d.ir(f"/p/{cod}")
        ok = d.esperar(lambda: "/d/" in d.pg.url and "physiqnutri-staging.vercel.app" in d.pg.url and "OLÁ, RAFA" in d.texto().upper(), 60)
        p.check(ok, f"[/p/] /p/{cod} abre o diário do aluno ({d.pg.url} · \"Olá, Rafa\")")
        foto(d, "p_abre_diario")
        d.ir("/p/abc")
        ok = d.esperar(lambda: d.pg.url.rstrip("/").endswith("/d/abc") and "physiqnutri-staging.vercel.app" in d.pg.url, 60)
        p.check(ok, f"[/p/] /p/abc abre o diário (/d/abc — o site antigo diz \"Link não encontrado\") ({d.pg.url})")
        p.check(d.esperar(lambda: "LINK NÃO ENCONTRADO" in d.texto().upper(), 30), "[/p/] /d/abc é a página do diário (código que não existe)")
        foto(d, "p_abc")
    finally:
        d.ctx.close()


def resumo_privado(nav, base, pref):
    raf = rafael()
    c = caso(nav, base, pref, "resumo_privado", "w13-dono", f"/painel/alunos/{raf['id']}", esperar="[data-resumo-texto]")
    try:
        c.pg.fill("[data-resumo-texto]", "Treina de manhã; lesão antiga no joelho esquerdo (evitar agachamento profundo).")
        c.pg.click("[data-resumo-salvar]")
        ok = c.esperar(lambda: (rafael()["resumo"] or "").startswith("Treina de manhã"), 20)
        p.check(ok, "[resumo privado] salvou em pacientes.resumo (o mesmo campo do site antigo)")
        c.ir(f"/painel/alunos/{raf['id']}")
        ok = c.esperar(lambda: c.tem("[data-resumo-texto]") and c.pg.input_value("[data-resumo-texto]").startswith("Treina de manhã"), 60)
        p.check(ok, "[resumo privado] recarregado, o texto continua")
        c.pg.locator("[data-card-resumo-privado]").scroll_into_view_if_needed()
        foto(c, "resumo_privado")
    finally:
        q(f"update {S}.pacientes set resumo = null where id = '{raf['id']}'")
        c.fim()


def aviso(nav, base, pref):
    camila = B.uid("w13-nutri")
    q(f"update {S}.profiles set config = coalesce(config, '{{}}'::jsonb) - 'aviso_mensagens_w14' where id = '{camila}'")
    ids = [B.paciente(n, C)["id"] for n in ("Rafael Moura", "Marina Alves", "Beatriz Lima")]
    q(f"update {S}.pacientes set config = coalesce(config, '{{}}'::jsonb) - 'mensagens_automaticas' where id in ({','.join(repr(i) for i in ids)})")
    c = caso(nav, base, pref, "aviso", "w13-nutri", "/painel/alunos", esperar="[data-faixa-mensagens]")
    try:
        n = attr(c, "[data-faixa-mensagens]", "data-faixa-mensagens")
        p.check(n == "3" and "3 alunos estão com as mensagens automáticas do WhatsApp desligadas" in texto(c, "[data-faixa-mensagens]"),
                f"[aviso] faixa \"3 alunos estão com as mensagens … desligadas\" ({n})")
        foto(c, "aviso_mensagens")
        c.pg.click("[data-faixa-mensagens-ver]")
        ok = c.esperar(lambda: c.tem("[data-mensagens-lista]"), 10)
        linhas = c.pg.locator("[data-mensagens-aluno]").count()
        p.check(ok and linhas == 3 and attr(c, "[data-mensagens-lista]", "data-mensagens-lista") == n, f"[aviso] número = tela: a lista tem {linhas} = {n}")
        foto(c, "aviso_lista")
        c.pg.click("[data-mensagens-lista-ligar]")
        ok = c.esperar(lambda: not c.tem("[data-faixa-mensagens]"), 20)
        p.check(ok, "[aviso] \"Ligar para todos\": o aviso some (único)")
        cfg = [config(i).get("mensagens_automaticas") for i in ids]
        p.check(cfg == [True, True, True], f"[aviso] ligou exatamente os 3 da lista ({cfg})")
        visto = q(f"select config -> 'aviso_mensagens_w14' as v from {S}.profiles where id = '{camila}'")[0]["v"]
        p.check(isinstance(visto, dict) and visto.get("acao") == "ligar_todos" and visto.get("ligados") == 3, f"[aviso] guardado no perfil da Camila ({visto})")
        c.ir("/painel/alunos")
        c.pg.wait_for_timeout(4000)
        p.check(not c.tem("[data-faixa-mensagens]"), "[aviso] não volta ao recarregar")
    finally:
        q(f"update {S}.pacientes set config = coalesce(config, '{{}}'::jsonb) - 'mensagens_automaticas' where id in ({','.join(repr(i) for i in ids)})")
        q(f"update {S}.pacientes set config = coalesce(config, '{{}}'::jsonb) || '{{\"mensagens_automaticas\": false}}'::jsonb where id = '{ids[0]}'")
        q(f"update {S}.profiles set config = coalesce(config, '{{}}'::jsonb) - 'aviso_mensagens_w14' where id = '{camila}'")
        c.fim()


def acoes(nav, base, pref):
    diego = B.paciente("Diego Souza", C)
    assert diego, "Diego"
    did = diego["id"]
    q(f"update {S}.pacientes set ativo = true, deleted_at = null where id = '{did}'")
    c = caso(nav, base, pref, "acoes", "w13-dono", f"/painel/alunos/{did}", esperar='[data-acesso-acao="desativar"]')
    try:
        c.pg.locator("[data-card-acesso-aluno]").scroll_into_view_if_needed()
        foto(c, "acesso_sem_login")
        c.pg.click('[data-acesso-acao="desativar"]')
        ok = c.esperar(lambda: c.tem('[data-confirmar-acao="desativar"]'), 10)
        p.check(ok, "[acesso] Desativar pede confirmação (a mesma da lista da W13)")
        c.pg.click("[data-confirmar-ok]")
        ok = c.esperar(lambda: c.tem('[data-acesso-acao="reativar"]') and c.tem('[data-chip-situacao="desativado"]'), 30)
        p.check(ok and q(f"select ativo from {S}.pacientes where id = '{did}'")[0]["ativo"] is False,
                "[acesso] desativado pela função alunos (ativo=false; o card oferece Reativar e o cabeçalho mostra DESATIVADO)")
        c.pg.click('[data-acesso-acao="reativar"]')
        ok = c.esperar(lambda: c.tem('[data-acesso-acao="desativar"]') and not c.tem('[data-chip-situacao="desativado"]'), 30)
        p.check(ok, "[acesso] reativado")
        c.pg.click("[data-menu-perfil]")
        c.esperar(lambda: c.tem('[data-acao-perfil="remover"]'), 10)
        c.pg.click('[data-acao-perfil="remover"]')
        c.esperar(lambda: c.tem('[data-confirmar-acao="remover"]'), 10)
        c.pg.click("[data-confirmar-ok]")
        ok = c.esperar(lambda: c.caminho().startswith("/painel/alunos") and not c.caminho().startswith(f"/painel/alunos/{did}"), 30)
        p.check(ok and q(f"select deleted_at is not null as l from {S}.pacientes where id = '{did}'")[0]["l"], "[⋯] Remover da lista → Lixeira e volta para a lista")
    finally:
        q(f"update {S}.pacientes set ativo = true, deleted_at = null where id = '{did}'")
        c.fim()


def negativo(nav, base, pref):
    raf = rafael()
    c = caso(nav, base, pref, "negativo", "w13-personal2", f"/painel/alunos/{raf['id']}")
    try:
        ok = c.esperar(lambda: "Não deu para abrir este aluno" in c.texto(), 60)
        p.check(ok and not c.tem("[data-dados-grade]") and not c.tem("[data-ajustes-lista]"), "[P1] o 2º personal (não é responsável) não vê o Rafael (nem os dados nem os ajustes)")
        foto(c, "negativo_p1")
    finally:
        c.fim()


CASOS = {"resumo": resumo, "editar": editar, "pdf": pdf, "acesso": acesso, "diario": diario, "link": link, "resumo_privado": resumo_privado,
         "aviso": aviso, "acoes": acoes, "negativo": negativo}


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
            time.sleep(10)
        nav.close()
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
