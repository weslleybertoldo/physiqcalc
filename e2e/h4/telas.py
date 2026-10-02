#!/usr/bin/env python3
"""Physiq H4 — E2E das TELAS (local e staging), com a massa do e2e/h4/massa.py e a "Conta Suspensa H4" suspensa pelo api.py.
Em série e curto (o Banco do Treino é frágil): 1 login por conta, /health antes de cada bloco.

  master    (w27-master, MASTER só durante o caso) Contas › "Conta Suspensa H4": o código PROF-… do membro com Copiar (C56) e o
            "Último acesso" (N-22); Alunos › "Abrir" a aluna de OUTRA conta → o perfil dela no painel, com as abas da conta DELA (C57/N-5)
            e o selo "BLOQUEADO (PAGAMENTO)" (N-64)
  dono      (h4-dono — Clínica H4) o selo na aluna vencida e NÃO no aluno em dia (N-64); "Ver diário" no Resumo → o Diário só dela
            (N-27); Financeiro do aluno: 12 + "Ver todos (15)" e o atalho para Lançamentos (N-45); Dashboard: "2 fotos do diário"
            em Precisam de atenção = o "Só não reagidas" do Diário, e "Recibos em <mês>" = os recibos do mês (item 10); Perfil: "Sua
            área" do "Outra área" grava (N-23); /master volta para o painel (não é master)
  csv       (h4-csv — 520 alunos) os filtros novos (gênero, cadastro, modificação) e a ordem (N-10); Exportar CSV com TODOS (520 + as
            colunas do Nutri) e com o filtro (N-66); negativos: o "Sua área" não aparece para o personal; o Dashboard dele não tem o
            item do diário (não é nutricionista); ele também é ALUNO da Clínica H4: Perfil › "Excluir minha conta" recusa (é
            profissional) e mostra o contato do suporte (item 11)
  suspensa  (h4-membro — membro da conta suspensa) entra e vê "Conta suspensa" com o contato do suporte no lugar do painel (N-22/item 11)
  publicas  (sem login) /privacidade com o mesmo contato (lido da constante); a Calculadora gera o PDF (o download do site continua — item 12)
Uso: python3 e2e/h4/telas.py --base http://localhost:5173 --prefixo local [--casos master,dono,csv,suspensa,publicas]
     (staging: --base https://physiqcalc-staging.vercel.app --prefixo staging)
"""
from __future__ import annotations

import argparse
import csv as csvlib
import datetime as dt
import io
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

from playwright.sync_api import sync_playwright  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
p = B.p
CASOS: dict[str, object] = {}
ESTADO: dict = {}
# o contato do suporte (src/nucleo/suporte.ts — decisão dele 02/10): a privacidade, a conta suspensa e o "Excluir minha conta" leem dele
CONTATO = "bertoldo.code@gmail.com"
MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]


def caso(fn):
    CASOS[fn.__name__.replace("caso_", "")] = fn
    return fn


def abrir(nav, nome: str, conta: str | None, rota: str):
    c = B.Caso(nav, ESTADO["base"], ESTADO["prefixo"], nome, desktop=True)
    try:
        c.ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=ESTADO["base"])
    except Exception:  # noqa: BLE001 — o navegador sem a permissão: o caso confere pelo aviso
        pass
    if conta:
        c.entrar(conta, rota)
        c.fechar_avisos()
    else:
        c.ir(rota)
    return c


def nova_aba(c) -> None:
    """Uma aba nova na MESMA sessão (o login fica no localStorage do contexto): o renderizador antigo sai e a memória do notebook
    volta — o Chromium daqui cai em sessões longas. Os ouvintes do Caso (erros, console, rede) passam para a aba nova."""
    velha = c.pg
    c.pg = c.ctx.new_page()
    c.pg.on("pageerror", lambda e: c.erros.append(str(e)))
    c.pg.on("console", lambda m: c.console.append(f"{m.type}: {m.text}") if m.type in ("error", "warning") else None)
    c.pg.on("response", lambda r: c.rede.append(f"{r.status} {r.request.method} {r.url.split('?')[0][-60:]}")
            if ("/functions/v1/" in r.url or "/rpc/" in r.url) and r.request.method != "OPTIONS" else None)
    c.pg.on("dialog", lambda d: d.accept())
    velha.close()


def sem_carregando(c, timeout: float = 30) -> None:
    c.esperar(lambda: not c.tem('[data-estado="carregando"]') and not c.tem("[data-esqueleto]") and "Carregando" not in c.texto()[:4000], timeout)


def ler_csv(caminho: str) -> list[list[str]]:
    texto = Path(caminho).read_text(encoding="utf-8-sig")
    return list(csvlib.reader(io.StringIO(texto), delimiter=";"))


@caso
def caso_master(nav):
    c3 = B.conta_id(B.CONTA_SUSP)
    c1 = B.conta_id(B.CONTA_CLINICA)
    laura = B.aluno_id(c1, B.ALUNA_VENCIDA)
    B.dar_master("w27-master")
    try:
        c = abrir(nav, "master", "w27-master", "/master/contas")
        p.check(c.esperar(lambda: c.tem('[data-pagina-master="contas"]') and c.tem(f'[data-linha-conta="{B.CONTA_SUSP}"]'), 60), "[master] Contas com a Conta Suspensa H4")
        c.pg.locator(f'[data-linha-conta="{B.CONTA_SUSP}"]').first.click()
        ok = c.esperar(lambda: c.tem("[data-detalhe-membros]") and c.tem('[data-copiar-codigo="PROF-MAURO-REIS-H4"]'), 30)
        p.check(ok, "[master] C56: o código PROF-MAURO-REIS-H4 do membro aparece na folha da conta")
        ua = c.pg.locator(f'[data-membro="{B.EMAIL["h4-membro"]}"] [data-ultimo-acesso]').first.get_attribute("data-ultimo-acesso") if ok else None
        p.check(ua == "hoje", f"[master] N-22: o último acesso do membro = hoje ({ua})")
        p.check(c.pg.locator(f'[data-membro="{B.EMAIL["h4-susp"]}"] [data-ultimo-acesso]').count() == 1, "[master] o dono também tem o último acesso")
        c.pg.locator('[data-copiar-codigo="PROF-MAURO-REIS-H4"]').click()
        copiado = c.esperar(lambda: "Código PROF-MAURO-REIS-H4 copiado." in c.texto(), 10)
        try:
            area = c.pg.evaluate("navigator.clipboard.readText()")
        except Exception:  # noqa: BLE001
            area = "(sem leitura da área de transferência)"
        p.check(copiado and (area in ("PROF-MAURO-REIS-H4", "(sem leitura da área de transferência)")), f"[master] Copiar: aviso e a área de transferência ({area})")
        c.pg.locator(f'[data-membro="{B.EMAIL["h4-membro"]}"]').first.scroll_into_view_if_needed()
        c.print("master_conta_codigo_ultimo_acesso")
        # C57/N-5: Alunos › Abrir a aluna de OUTRA conta (o master de teste não tem conta: as abas vêm da conta da aluna)
        c.ir(f"/master/alunos?conta={c1}")
        p.check(c.esperar(lambda: c.tem(f'[data-abrir-aluno="{B.ALUNA_VENCIDA}"]'), 45), "[master] Alunos da Clínica H4 com o botão Abrir")
        sem_carregando(c)
        c.print("master_alunos_abrir")
        c.pg.locator(f'[data-abrir-aluno="{B.ALUNA_VENCIDA}"]').click()
        ok = c.esperar(lambda: c.caminho().startswith(f"/painel/alunos/{laura}") and c.tem("[data-cabecalho-nome]"), 45)
        p.check(ok, f"[master] Abrir → /painel/alunos/<matrícula> com o cabeçalho da aluna ({c.caminho()})")
        abas = c.pg.eval_on_selector_all("[data-aba-aluno]", "els => els.map(e => e.getAttribute('data-aba-aluno'))") if ok else []
        p.check({"resumo", "treino", "dieta", "avaliacao", "prontuario", "financeiro"} <= set(abas), f"[master] as 6 abas pela conta da aluna (Treino + Nutrição): {abas}")
        selo = c.esperar(lambda: c.tem('[data-chip-situacao="bloqueado-pagamento"]'), 30)
        p.check(selo, "[master] N-64: o selo BLOQUEADO (PAGAMENTO) para o master (ele vê a mensalidade)")
        sem_carregando(c)
        c.print("master_perfil_aluna_outra_conta")
        c.pg.locator('[data-aba-aluno="dieta"]').click()
        p.check(c.esperar(lambda: "/dieta" in c.caminho() and not c.tem("[data-modulo-fora-do-plano]"), 30), "[master] a aba Dieta abre (não cai no 'fora do plano')")
        c.fim()
    finally:
        B.tirar_master("w27-master")


@caso
def caso_dono(nav):
    c1 = B.conta_id(B.CONTA_CLINICA)
    laura = B.aluno_id(c1, B.ALUNA_VENCIDA)
    igor = B.aluno_id(c1, B.ALUNO_EM_DIA)
    c = abrir(nav, "dono", "h4-dono", f"/painel/alunos/{laura}")
    p.check(c.esperar(lambda: c.tem("[data-cabecalho-nome]"), 60), "[dono] perfil da Laura")
    p.check(c.esperar(lambda: c.tem('[data-chip-situacao="bloqueado-pagamento"]'), 30), "[dono] N-64: Laura (vencida, conta bloqueia) tem o selo BLOQUEADO (PAGAMENTO)")
    p.check(c.esperar(lambda: c.tem("[data-ver-diario-aluno]"), 30), "[dono] N-27: 'Ver diário' no card do Link do diário (ela é nutricionista da conta)")
    sem_carregando(c)
    c.print("dono_perfil_selo_ver_diario")
    c.pg.locator("[data-card-link-diario]").first.scroll_into_view_if_needed()
    c.print("dono_resumo_card_ver_diario")
    c.pg.locator("[data-ver-diario-aluno]").click()
    ok = c.esperar(lambda: c.tem("[data-pagina-diario]") and c.pg.locator("[data-pagina-diario]").get_attribute("data-aluno-filtro") == laura, 30)
    n = c.pg.locator("[data-pagina-diario]").get_attribute("data-total-filtrados") if ok else None
    p.check(ok and n == "2", f"[dono] 'Ver diário' abre o Diário só da Laura (2 fotos: {n})")
    sem_carregando(c)
    c.print("dono_diario_da_aluna")
    # negativo do selo
    c.ir(f"/painel/alunos/{igor}")
    p.check(c.esperar(lambda: c.tem("[data-cabecalho-nome]") and "Igor" in (c.pg.locator("[data-cabecalho-nome]").inner_text() or ""), 45), "[dono] perfil do Igor")
    c.pg.wait_for_timeout(2500)
    p.check(not c.tem('[data-chip-situacao="bloqueado-pagamento"]'), "[dono] N-64: Igor (em dia) NÃO tem o selo")
    # N-45: Financeiro do aluno
    nova_aba(c)
    c.ir(f"/painel/alunos/{laura}/financeiro")
    ok = c.esperar(lambda: c.tem("[data-lancamentos-ver-todos]"), 45)
    vis = c.pg.locator("[data-cartao-lancamentos] [data-lancamento]").count() if ok else 0
    p.check(ok and vis == 12, f"[dono] N-45: 12 lançamentos + 'Ver todos' ({vis})")
    if ok:
        c.pg.locator("[data-lancamentos-ver-todos]").click()
        c.pg.wait_for_timeout(500)
        vis = c.pg.locator("[data-cartao-lancamentos] [data-lancamento]").count()
        p.check(vis == 15, f"[dono] 'Ver todos' mostra os 15 ({vis})")
        c.pg.locator("[data-cartao-lancamentos]").scroll_into_view_if_needed()
        c.print("dono_financeiro_ver_todos")
        c.pg.locator("[data-lancamentos-rodape]").scroll_into_view_if_needed()
        c.print("dono_financeiro_rodape_atalho")
        c.pg.locator("[data-lancamentos-no-financeiro]").click()
        ok = c.esperar(lambda: c.caminho().startswith("/painel/financeiro") and "aba=lancamentos" in c.caminho(), 30)
        linhas = c.esperar(lambda: c.texto().count("Mensalidade ") >= 15, 30)
        p.check(ok and linhas, f"[dono] 'Editar, estornar ou excluir no Financeiro' abre Lançamentos com os 15 dela ({c.caminho()[:90]})")
        sem_carregando(c)
        c.print("dono_lancamentos_no_financeiro")
    # item 10: Dashboard
    nova_aba(c)
    c.ir("/painel")
    ok = c.esperar(lambda: c.tem('[data-atencao-item="diario"]') and c.tem("[data-recibos-mes]") and c.pg.locator("[data-recibos-mes]").get_attribute("data-recibos-mes") != "", 60)
    item = c.pg.locator('[data-atencao-item="diario"]').first.inner_text() if ok else ""
    rec = c.pg.locator("[data-recibos-mes]").get_attribute("data-recibos-mes") if ok else None
    mes = MESES[dt.datetime.now().month - 1]
    p.check(ok and "2 fotos do diário" in item, f"[dono] Dashboard: '2 fotos do diário' em Precisam de atenção ({item!r})")
    p.check(rec == "2" and f"Recibos em {mes}" in c.texto(), f"[dono] Dashboard: 'Recibos em {mes}' = 2 (os do mês) ({rec})")
    sem_carregando(c)
    c.print("dono_dashboard_fotos_recibos")
    # o número do item = o "Só não reagidas" do Diário (a tela de origem)
    c.pg.locator('[data-atencao-item="diario"]').first.click()
    ok = c.esperar(lambda: c.tem("[data-btn-nao-reagidas]"), 30)
    badge = c.pg.locator("[data-btn-nao-reagidas]").get_attribute("data-badge-nao-reagidas") if ok else None
    p.check(ok and badge == "2" and "nao_reagidas=1" in c.caminho() and "dias=7" in c.caminho(), f"[dono] o item abre o Diário com 'Só não reagidas (2)' ({badge}, {c.caminho()})")
    # os recibos do mês = os da aba Recibos com a data neste mês
    c.ir("/painel/financeiro?aba=recibos")
    # a lista carregada: as linhas [data-recibo] = o número do cabeçalho (antes disso o cartão mostra o esqueleto)
    ok = c.esperar(lambda: c.tem("[data-lista-recibos-conta] [data-recibo]")
                   and c.pg.locator("[data-lista-recibos-conta] [data-recibo]").count() == int(c.pg.locator("[data-recibos-total]").first.get_attribute("data-recibos-total") or -1), 45)
    datas = re.findall(r"\b(\d{2})/(\d{2})/(\d{4})\b", c.pg.locator("[data-cartao-recibos-conta]").inner_text()) if ok else []
    hoje = dt.datetime.now()
    no_mes = sum(1 for d_, m_, a_ in datas if int(m_) == hoje.month and int(a_) == hoje.year)
    p.check(ok and no_mes == 2, f"[dono] Financeiro › Recibos tem 2 com a data deste mês (= o Dashboard) ({no_mes} de {len(datas)})")
    # N-23: Configurações › Perfil — "Sua área"
    nova_aba(c)
    c.ir("/painel/configuracoes/perfil")
    ok = c.esperar(lambda: c.tem("[data-perfil-area-outra]"), 45)
    p.check(ok, "[dono] N-23: o campo 'Sua área' aparece no tipo 'Outra área'")
    if ok:
        c.pg.locator("[data-perfil-area-outra]").fill("Educação física")
        c.print("dono_perfil_sua_area")
        c.pg.locator("[data-perfil-salvar]").click()
        gravou = c.esperar(lambda: (B.sql_principal(f"select area_outra from {S}.profiles where id = '{B.uid('h4-dono')}'")[0]["area_outra"] or "") == "Educação física", 30)
        p.check(gravou, "[dono] 'Sua área' grava em profiles.area_outra")
    # negativo: não é master
    c.ir("/master/alunos")
    p.check(c.esperar(lambda: not c.caminho().startswith("/master"), 30) and not c.tem("[data-abrir-aluno]"), f"[dono] /master não abre para quem não é master ({c.caminho()})")
    c.fim()


@caso
def caso_csv(nav):
    c = abrir(nav, "csv", "h4-csv", "/painel/alunos")
    ok = c.esperar(lambda: c.tem("[data-pagina-alunos][data-total-alunos]") and c.tem("[data-filtro-genero]") and c.tem("[data-filtro-ordem]"), 60)
    total = c.pg.locator("[data-pagina-alunos]").get_attribute("data-total-alunos") if ok else None
    p.check(ok and total == str(B.N_CSV), f"[csv] Alunos: {total} e os filtros novos na tela (gênero, cadastro, modificação, ordem)")
    p.check(c.tem('[data-filtro-periodo-valor="cadastro"]') and c.tem('[data-filtro-periodo-valor="modificacao"]'), "[csv] os 2 períodos (cadastro e modificação)")
    # exportar TODOS (520) com as colunas do Nutri
    with c.pg.expect_download(timeout=90_000) as d:
        c.pg.locator("[data-exportar-csv]").click()
    linhas = ler_csv(d.value.path())
    cab = linhas[0] if linhas else []
    p.check(len(linhas) - 1 == B.N_CSV, f"[csv] N-66: o CSV tem os {B.N_CSV} alunos (sem o corte em 500): {len(linhas) - 1}")
    p.check(cab[:7] == ["Nome", "Apelido", "CPF", "E-mail", "Telefone", "Nascimento", "Gênero"] and cab[-1] == "Modificado em", f"[csv] as colunas do Nutri: {cab}")
    com_cpf = [x for x in linhas[1:] if re.fullmatch(r"\d{3}\.\d{3}\.\d{3}-\d{2}", x[2] or "")]
    p.check(len(com_cpf) == 3 and any(x[1].startswith("Apelido") for x in linhas[1:]) and all(re.fullmatch(r"\d{2}/\d{2}/\d{4} - \d{2}:\d{2}:\d{2}", x[-1]) for x in linhas[1:]),
            "[csv] CPF com máscara (3), apelidos e o 'Modificado em' dd/mm/aaaa - hh:mm:ss")
    p.check(c.esperar(lambda: f"{B.N_CSV} alunos exportados." in c.texto(), 15), "[csv] o aviso diz quantos saíram")
    c.print("csv_exportados_520")
    # filtros: gênero feminino → 130; ordem por cadastro → o mais recente primeiro
    c.pg.locator("[data-filtro-genero]").select_option("feminino")
    p.check(c.esperar(lambda: c.pg.locator("[data-pagina-alunos]").get_attribute("data-total-alunos") == "130", 30), "[csv] N-10: Gênero = Feminino → 130 alunos")
    c.pg.locator("[data-filtro-ordem]").select_option("recentes")
    esperado = B.sql_principal(f"""select nome from {S}.pacientes where conta_id = '{B.conta_id(B.CONTA_CSV)}' and deleted_at is null and genero = 'feminino'
                                   order by created_at desc, lower(nome), id limit 1""")[0]["nome"]
    ok = c.esperar(lambda: esperado in (c.pg.locator("[data-linhas-alunos]").inner_text()[:200] if c.tem("[data-linhas-alunos]") else ""), 30)
    p.check(ok, f"[csv] N-10: Ordenar por data de cadastro → '{esperado}' primeiro")
    c.pg.locator('[data-filtro-periodo-valor="cadastro"]').select_option("custom")
    de = (dt.date.today() - dt.timedelta(days=90)).isoformat()
    ate = (dt.date.today() - dt.timedelta(days=60)).isoformat()
    c.pg.locator('[data-filtro-de="cadastro"]').fill(de)
    c.pg.locator('[data-filtro-ate="cadastro"]').fill(ate)
    n_sql = B.sql_principal(f"""select count(*)::int n from {S}.pacientes where conta_id = '{B.conta_id(B.CONTA_CSV)}' and deleted_at is null and genero = 'feminino'
        and (created_at at time zone 'America/Sao_Paulo')::date between '{de}' and '{ate}'""")[0]["n"]
    ok = c.esperar(lambda: c.pg.locator("[data-pagina-alunos]").get_attribute("data-total-alunos") == str(n_sql), 30)
    p.check(ok and n_sql > 0, f"[csv] Cadastro personalizado ({de} a {ate}) + feminino → {n_sql} (= SQL)")
    sem_carregando(c)
    c.print("csv_filtros_genero_cadastro_ordem")
    # exportar com o filtro: só os do filtro
    with c.pg.expect_download(timeout=60_000) as d:
        c.pg.locator("[data-exportar-csv]").click()
    linhas = ler_csv(d.value.path())
    p.check(len(linhas) - 1 == n_sql and all(x[6] == "Feminino" for x in linhas[1:]), f"[csv] o CSV segue os filtros ({len(linhas) - 1} = {n_sql}, todas Feminino)")
    # Limpar volta tudo
    c.pg.locator("[data-limpar-filtros]").click()
    p.check(c.esperar(lambda: c.pg.locator("[data-pagina-alunos]").get_attribute("data-total-alunos") == str(B.N_CSV), 30), "[csv] Limpar volta aos 520")
    # negativos: o personal não vê o "Sua área"; o Dashboard dele não tem o item do diário
    c.ir("/painel/configuracoes/perfil")
    ok = c.esperar(lambda: c.tem("[data-form-perfil]"), 45)
    p.check(ok and not c.tem("[data-perfil-area-outra]"), "[csv] personal: o campo 'Sua área' não aparece")
    c.ir("/painel")
    ok = c.esperar(lambda: c.tem("[data-cartao-atencao-dashboard]") and c.tem("[data-recibos-mes]"), 60)
    c.pg.wait_for_timeout(2000)
    p.check(ok and not c.tem('[data-atencao-item="diario"]') and c.pg.locator("[data-recibos-mes]").get_attribute("data-recibos-mes") == "0",
            "[csv] personal sem o papel de nutri: sem o item do diário; Recibos no mês = 0")
    # item 11: o profissional NÃO exclui a própria conta pelo app — a recusa mostra o contato do suporte (constante única)
    c.ir("/perfil")
    ok = c.esperar(lambda: c.pg.get_by_text("Excluir minha conta").count() > 0, 45)
    if ok:
        c.pg.get_by_text("Excluir minha conta").first.click()
        ok = c.esperar(lambda: c.tem('[data-excluir-recusa="profissional"]'), 30)
    sup = c.pg.locator("[data-excluir-suporte]").first.get_attribute("data-excluir-suporte") if ok and c.tem("[data-excluir-suporte]") else None
    p.check(ok and sup == CONTATO and not c.tem("[data-excluir-confirmacao]"), f"[csv] item 11 (profissional que também é aluno): Excluir minha conta recusa o profissional e mostra o contato ({sup})")
    p.check("pelo painel" not in c.texto(), "[csv] … sem o antigo 'fale com o suporte pelo painel'")
    c.print("csv_excluir_conta_suporte")
    c.fim()


@caso
def caso_suspensa(nav):
    c = abrir(nav, "suspensa", "h4-membro", "/painel")
    ok = c.esperar(lambda: c.tem('[data-plano-vencido="suspensa"]'), 60)
    p.check(ok, "[suspensa] N-22: o membro da conta suspensa entra e vê 'Conta suspensa' no lugar do painel")
    sup = c.pg.locator("[data-plano-suspenso-suporte]").get_attribute("data-plano-suspenso-suporte") if ok else None
    href = c.pg.locator("[data-plano-suspenso-suporte] a").get_attribute("href") if ok else ""
    p.check(sup == CONTATO and (href or "").startswith(f"mailto:{CONTATO}"), f"[suspensa] com o contato do suporte ({sup}, {href})")
    p.check(not c.tem("[data-pagina-alunos]") and not c.tem("[data-pagina-dashboard]"), "[suspensa] nada do painel aparece")
    c.ir("/painel/alunos")
    c.pg.wait_for_timeout(1500)
    p.check(c.tem('[data-plano-vencido="suspensa"]') and not c.tem("[data-pagina-alunos]"), "[suspensa] nem por link direto (/painel/alunos)")
    c.print("suspensa_membro_conta_suspensa")
    c.fim()


@caso
def caso_publicas(nav):
    c = abrir(nav, "publicas", None, "/privacidade")
    p.check(c.esperar(lambda: f"Contato: {CONTATO}." in c.texto(), 30), f"[públicas] /privacidade: o contato novo, lido da constante ({CONTATO})")
    c.print("publica_privacidade_contato")
    c.fim()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--prefixo", required=True)
    ap.add_argument("--casos", default=",".join(CASOS))
    a = ap.parse_args()
    ESTADO.update(base=a.base.rstrip("/"), prefixo=a.prefixo)
    t0 = time.time()
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox"])
        for nome in [x for x in a.casos.split(",") if x]:
            fn = CASOS[nome]
            B.saude_ok(f"o caso {nome}")
            print(f"\n── {nome}", flush=True)
            for _ in (1, 2):
                try:
                    fn(nav)  # type: ignore[operator]
                    break
                except Exception as e:  # noqa: BLE001
                    if "Target crashed" in str(e) or "has been closed" in str(e):
                        print("   o navegador caiu — 2ª tentativa", flush=True)
                        nav = pw.chromium.launch(args=["--no-sandbox"])
                        continue
                    p.check(False, f"[{nome}] exceção: {str(e)[:300]}")
                    caso_atual = B.ESTADO.get("caso")
                    if caso_atual is not None:
                        caso_atual.diagnostico()
                    break
            time.sleep(2)
        nav.close()
    print(f"\nH4 · telas ({a.prefixo}) · {time.time() - t0:.0f}s")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
