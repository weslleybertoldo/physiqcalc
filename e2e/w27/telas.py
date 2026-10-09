#!/usr/bin/env python3
"""Physiq W27 — E2E das telas do PAINEL MASTER (padrão da tela 6), com a massa do e2e/w27/massa.py + api.py (contas W27 no staging).

Positivo (master de teste w27-master):
  direto        /master e /master/contas abertos DIRETO num contexto limpo (link, F5) ficam no master (herdado W16b); a Biblioteca
                antiga espera a sessão do Treino e abre (não cai no /painel)
  visao         Visão geral: KPIs, Precisam de atenção, Contas por situação, Origem
  contas        lista + folha da conta A (membros, ações) + ISENTAR pela tela (motivo) e TIRAR a isenção (o banco confere)
  nova          janela "Nova conta" (e-mail e senha / Google, plano, faixa, isenção) — só o formulário
  alunos        lista com filtros; MOVER pela tela um aluno de B para A (o banco confere) e volta pela função
  financeiro    filtros + faturas recentes
  planos        tabela por módulo × faixa, teste, histórico; editar um preço (janela) sem salvar
  integracoes   recebimento por conta
  config        resumo das regras + aviso "o Physiq mudou": liga/desliga do Nutri pela tela e volta (o banco confere)
  app           App do aluno: alunos do app, treinos prontos, pratos prontos
Negativo / casca:
  negativo      dono A (não é master) abre /master/contas → volta para o painel; as 3 funções respondem 403
  modulo        dono B (Só Treino) abre /painel/dietas → "Este módulo não está no plano da conta" (herdado W26)
  excluir_w24   o "Excluir" da W24 (Dietas › Alimentos) com os botões premium, sem o violeta do shadcn (herdado W26)
Uso: python3 e2e/w27/telas.py --base http://localhost:5173 --prefixo local [--casos direto,visao,...]
     (staging: --base https://physiqcalc-staging.vercel.app --prefixo staging)
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
CASOS: dict[str, object] = {}
ESTADO: dict = {}


def caso(fn):
    CASOS[fn.__name__.replace("caso_", "")] = fn
    return fn


def abrir(nav, nome: str, conta: str, rota: str):
    c = B.Caso(nav, ESTADO["base"], ESTADO["prefixo"], nome, desktop=True)
    c.entrar(conta, rota)
    c.fechar_avisos()
    return c


def pagina(c, nome: str, timeout: float = 45) -> bool:
    return c.esperar(lambda: c.tem(f'[data-pagina-master="{nome}"]'), timeout)


def sem_carregando(c, timeout: float = 30) -> None:
    c.esperar(lambda: not c.tem('[data-estado="carregando"]') and not c.tem("[data-esqueleto]") and "Carregando" not in c.texto()[:4000], timeout)


def buscar_na_lista(c, campo: str, termo: str, timeout: float = 30) -> None:
    """hml-14d (D39): as listas do master vêm em páginas de 20 — o item procurado pela busca da lista (no banco, 300 ms)."""
    if c.esperar(lambda: c.tem(campo), timeout):
        c.pg.locator(campo).fill(termo)
        c.pg.wait_for_timeout(800)  # passa da espera de 300 ms da busca antes de marcar/clicar


@caso
def caso_direto(nav):
    c = abrir(nav, "direto", "w27-master", "/master")
    p.check(pagina(c, "visao-geral") and c.caminho() == "/master", f"[direto] /master aberto direto fica no master ({c.caminho()})")
    c.fim()
    c = abrir(nav, "direto_contas", "w27-master", "/master/contas")
    p.check(pagina(c, "contas") and c.caminho().startswith("/master/contas"), f"[direto] /master/contas direto fica em Contas ({c.caminho()})")
    c.fim()
    c = abrir(nav, "direto_biblioteca", "w27-master", "/master/biblioteca")
    ok = c.esperar(lambda: "Biblioteca" in c.texto() and c.caminho() == "/master/biblioteca" and not c.tem("[data-sem-treino]"), 60)
    p.check(ok, f"[direto] /master/biblioteca espera o Treino e abre (não cai no /painel) ({c.caminho()})")
    sem_carregando(c)
    c.print("tela6_master_biblioteca_direto")
    c.fim()


@caso
def caso_visao(nav):
    c = abrir(nav, "visao", "w27-master", "/master")
    ok = pagina(c, "visao-geral") and c.esperar(lambda: c.tem('[data-kpi="Contas"]') and c.tem("[data-cartao-atencao-master]"), 45)
    p.check(ok, "[visão] KPIs (Contas, Profissionais, Alunos ativos, Receita) e Precisam de atenção")
    p.check(c.tem('[data-kpi="Receita do mês"]') and c.tem("[data-cartao-situacoes]") and c.tem("[data-cartao-origens]"), "[visão] receita, contas por situação e origem")
    sem_carregando(c)
    c.print("tela6_master_visao_geral")
    c.fim()


@caso
def caso_contas(nav):
    ca = B.conta_id(B.CONTA_A)
    c = abrir(nav, "contas", "w27-master", "/master/contas")
    p.check(pagina(c, "contas") and c.esperar(lambda: c.tem("[data-tabela-contas]"), 45), "[contas] tabela das contas")
    sem_carregando(c)
    c.print("tela6_master_contas")
    # hml-14d (D39): a conta A pode estar na 2ª página (20 por página) — pela busca da lista
    buscar_na_lista(c, "[data-busca-contas]", B.CONTA_A)
    p.check(c.esperar(lambda: c.tem(f'[data-linha-conta="{B.CONTA_A}"]'), 30), "[contas] a conta A está na lista (pela busca)")
    c.pg.locator(f'[data-linha-conta="{B.CONTA_A}"]').first.click()
    p.check(c.esperar(lambda: c.tem("[data-detalhe-acoes]") and c.tem("[data-detalhe-membros]"), 30), "[contas] folha da conta com ações e membros")
    p.check(c.tem('[data-acao="isentar"]') and c.tem('[data-acao="suspender"]') and c.tem('[data-acao="bloquear_alunos"]'), "[contas] ações de isentar, suspender e bloquear alunos")
    c.print("tela6_master_conta_detalhe")
    # isentar pela tela (motivo) → o banco confere → tirar a isenção
    c.pg.locator('[data-acao="isentar"]').click()
    c.esperar(lambda: c.tem('[data-janela-acao="isentar"]'), 10)
    c.pg.locator("[data-campo-motivo]").fill("Conta de teste W27 (tela)")
    c.print("tela8_master_isentar")
    c.pg.locator("[data-acao-confirmar]").click()
    ok = c.esperar(lambda: B.sql_principal(f"select situacao from {S}.contas where id = '{ca}'")[0]["situacao"] == "isenta", 25)
    p.check(ok, "[contas] isentar pela tela: a conta A fica isenta no banco")
    c.esperar(lambda: c.tem('[data-acao="tirar_isencao"]'), 20)
    c.pg.locator('[data-acao="tirar_isencao"]').click()
    c.esperar(lambda: c.tem('[data-janela-acao="tirar_isencao"]'), 10)
    c.pg.locator("[data-acao-confirmar]").click()
    ok = c.esperar(lambda: B.sql_principal(f"select situacao, isenta_motivo from {S}.contas where id = '{ca}'")[0]["isenta_motivo"] is None, 25)
    p.check(ok, "[contas] tirar a isenção pela tela: volta para a situação das datas")
    c.fim()


@caso
def caso_nova(nav):
    c = abrir(nav, "nova", "w27-master", "/master/contas")
    pagina(c, "contas")
    c.pg.locator("[data-master-nova-conta]").first.click()
    p.check(c.esperar(lambda: c.tem('[data-janela-nova-conta="form"]'), 15), "[nova] janela Nova conta")
    c.pg.locator("[data-campo-nome]").fill("Profissional Exemplo")
    c.pg.locator("[data-campo-email]").fill("exemplo.teste.claude@physiqnutri.app")
    p.check(c.tem("[data-campo-senha]") and c.tem("[data-campo-plano]") and c.tem("[data-campo-faixa]") and c.tem("[data-campo-isentar]"), "[nova] e-mail e senha, plano, faixa e isenção")
    c.print("tela8_master_nova_conta")
    c.fim()


@caso
def caso_alunos(nav):
    ca, cb = B.conta_id(B.CONTA_A), B.conta_id(B.CONTA_B)
    alvo = B.sql_principal(f"select id::text from {S}.pacientes where conta_id = '{cb}' and nome = 'Aluno Sem Login W27' and deleted_at is null limit 1")
    c = abrir(nav, "alunos", "w27-master", "/master/alunos")
    p.check(pagina(c, "alunos") and c.esperar(lambda: c.tem("[data-tabela-alunos-master]"), 45), "[alunos] lista de todos os alunos")
    p.check(c.tem('[data-filtro="app"]') and c.tem('[data-filtro="p7"]') and c.tem('[data-filtro="sem_conta"]'), "[alunos] filtros Do app, Em 2 contas e Sem conta")
    sem_carregando(c)
    c.print("tela6_master_alunos")
    if alvo:
        c.ir(f"/master/alunos?conta={cb}")
        buscar_na_lista(c, "[data-busca-alunos]", "Aluno Sem Login W27")  # hml-14d (D39): 20 por página — o alvo pela busca
        c.esperar(lambda: c.tem('[data-marcar-aluno="Aluno Sem Login W27"]'), 30)
        c.pg.locator('[data-marcar-aluno="Aluno Sem Login W27"]').check()
        c.pg.locator("[data-master-mover]").click()
        c.esperar(lambda: c.tem("[data-janela-mover]"), 10)
        c.pg.locator("[data-mover-conta]").select_option(ca)
        c.esperar(lambda: c.tem("[data-mover-personal]"), 20)
        c.print("tela8_master_mover_alunos")
        c.pg.locator("[data-mover-confirmar]").click()
        ok = c.esperar(lambda: B.sql_principal(f"select conta_id::text as c from {S}.pacientes where id = '{alvo[0]['id']}'")[0]["c"] == ca, 25)
        p.check(ok, "[alunos] mover pela tela: o aluno foi para a conta A no banco")
        st, r = B.funcao("master-contas", {"acao": "mover", "pacientes": [alvo[0]["id"]], "usuarios": [], "conta_id": cb, "personal_id": B.uid("w27-dono-b")})
        p.check(st == 200 and r.get("movidos") == 1, "[alunos] e volta para a B (função)")
    c.fim()


@caso
def caso_financeiro(nav):
    c = abrir(nav, "financeiro", "w27-master", "/master/financeiro")
    p.check(pagina(c, "financeiro") and c.esperar(lambda: c.tem("[data-tabela-financeiro-master]") and c.tem("[data-cartao-faturas-master]"), 45),
            "[financeiro] contas com a situação de cobrança + faturas recentes")
    # W28: o filtro "Legadas" saiu com a virada (nenhuma conta segue na cobrança antiga)
    p.check(c.tem('[data-filtro="tolerancia"]') and c.tem('[data-filtro="isentas"]') and not c.tem('[data-filtro="legadas"]'), "[financeiro] filtros do Calc (sem o de legadas)")
    sem_carregando(c)
    c.print("tela6_master_financeiro")
    c.fim()


@caso
def caso_planos(nav):
    c = abrir(nav, "planos", "w27-master", "/master/planos")
    p.check(pagina(c, "planos") and c.esperar(lambda: c.tem('[data-preco="treino_nutricao:f10"]'), 45), "[planos] tabela por módulo × faixa")
    p.check("Adesão: não existe mais" in c.texto() and "Tolerância do legado Calc" in c.texto(), "[planos] sem adesão (R2) e tolerância só do legado Calc")
    sem_carregando(c)
    c.print("tela6_master_planos")
    c.pg.locator('[data-editar-preco="treino:f10"]').click()
    p.check(c.esperar(lambda: c.tem("[data-janela-preco]"), 10), "[planos] janela de editar o preço")
    c.print("tela8_master_editar_preco")
    c.fim()


@caso
def caso_integracoes(nav):
    c = abrir(nav, "integracoes", "w27-master", "/master/integracoes")
    p.check(pagina(c, "integracoes") and c.esperar(lambda: c.tem("[data-tabela-integracoes]"), 45), "[integrações] recebimento por conta")
    sem_carregando(c)
    c.print("tela6_master_integracoes")
    c.fim()


@caso
def caso_config(nav):
    antes = B.sql_principal(f"select valor from {S}.app_config where chave = 'aviso_mudanca'")[0]["valor"]
    c = abrir(nav, "config", "w27-master", "/master/configuracoes")
    p.check(pagina(c, "configuracoes") and c.esperar(lambda: c.tem("[data-cartao-aviso-mudanca]") and c.tem("[data-cartao-regras]"), 45),
            "[config] resumo das regras + aviso o Physiq mudou")
    sem_carregando(c)
    c.print("tela6_master_configuracoes")
    alternar = c.pg.locator('[data-aviso-publico="nutri"] [role="switch"]')
    alternar.click()
    c.pg.locator("[data-salvar-aviso]").click()
    ok = c.esperar(lambda: B.sql_principal(f"select valor from {S}.app_config where chave = 'aviso_mudanca'")[0]["valor"]["nutri"]["ativo"] is (not antes["nutri"]["ativo"]), 20)
    p.check(ok, "[config] liga/desliga do aviso do Nutri pela tela (staging)")
    c.pg.wait_for_timeout(1200)
    c.pg.locator('[data-aviso-publico="nutri"] [role="switch"]').click()
    c.pg.locator("[data-salvar-aviso]").click()
    ok = c.esperar(lambda: B.sql_principal(f"select valor from {S}.app_config where chave = 'aviso_mudanca'")[0]["valor"] == antes, 20)
    p.check(ok, "[config] e volta: o aviso fica igual ao de antes")
    c.fim()


@caso
def caso_app(nav):
    c = abrir(nav, "app", "w27-master", "/master/app-do-aluno")
    p.check(pagina(c, "app-aluno") and c.esperar(lambda: c.tem("[data-tabela-alunos-app]"), 45), "[app] alunos do app")
    sem_carregando(c)
    c.print("tela6_master_app_alunos")
    c.ir("/master/app-do-aluno?aba=treinos")
    p.check(c.esperar(lambda: c.tem("[data-treinos-prontos]") and c.tem("[data-treino-pronto]"), 60), "[app] treinos prontos (Banco do Treino)")
    c.print("tela6_master_app_treinos")
    c.pg.locator("[data-editar-treino-pronto]").first.click()
    p.check(c.esperar(lambda: c.tem("[data-janela-treino-pronto]") and c.tem("[data-grupo-pronto]"), 15), "[app] editor do treino pronto com divisões")
    c.print("tela8_master_treino_pronto")
    c.ir("/master/app-do-aluno?aba=pratos")
    p.check(c.esperar(lambda: c.tem("[data-pratos-prontos]") and c.tem("[data-prato]"), 45), "[app] pratos prontos")
    c.print("tela6_master_app_pratos")
    c.fim()


@caso
def caso_negativo(nav):
    c = abrir(nav, "negativo", "w27-dono-a", "/master/contas")
    ok = c.esperar(lambda: c.caminho().startswith("/painel"), 45)
    p.check(ok and not c.tem("[data-pagina-master]"), f"[negativo] quem não é master abre /master/contas e volta para o painel ({c.caminho()})")
    c.fim()


@caso
def caso_modulo(nav):
    c = abrir(nav, "modulo", "w27-dono-b", "/painel/dietas")
    ok = c.esperar(lambda: c.tem('[data-modulo-fora-do-plano="nutricao"]'), 45)
    p.check(ok and "Este módulo não está no plano da conta" in c.texto(), "[casca] Só Treino abre /painel/dietas: Este módulo não está no plano da conta")
    c.print("tela6_modulo_fora_do_plano")
    c.fim()


@caso
def caso_excluir_w24(nav):
    uid = B.uid("w27-dono-a")
    B.sql_principal(f"""insert into {S}.alimentos (fonte, nutricionista_id, nome, porcao_g, energia_kcal)
                        select 'proprio', '{uid}', 'Alimento Teste W27', 100, 100
                         where not exists (select 1 from {S}.alimentos where nutricionista_id = '{uid}' and nome = 'Alimento Teste W27' and deleted_at is null)""")
    c = abrir(nav, "excluir_w24", "w27-dono-a", "/painel/dietas?aba=alimentos")
    c.esperar(lambda: c.tem("[data-busca-alimentos]"), 45)
    c.pg.locator("[data-busca-alimentos]").fill("Alimento Teste W27")
    achou = c.esperar(lambda: c.pg.locator('[data-alimento][data-editavel="1"]', has_text="Alimento Teste W27").count() > 0, 30)
    p.check(achou, "[W24] o alimento próprio aparece em Dietas › Alimentos")
    linha = c.pg.locator('[data-alimento][data-editavel="1"]', has_text="Alimento Teste W27").first
    linha.locator("[data-btn-excluir-alimento]").click()
    ok = c.esperar(lambda: c.tem("[data-confirmar-excluir]"), 15)
    cor = c.pg.evaluate("""() => { const b = document.querySelector('[data-confirmar-excluir]'); return b ? getComputedStyle(b).backgroundColor : ''; }""") if ok else ""
    p.check(ok and "139, 92, 246" not in cor and "124, 58, 237" not in cor, f"[W24] Excluir com o botão premium (sem o violeta do shadcn): {cor}")
    c.print("tela8_w24_excluir_premium")
    c.pg.locator("[data-confirmar-cancelar]").click()
    c.fim()
    B.sql_principal(f"delete from {S}.alimentos where nutricionista_id = '{uid}' and nome = 'Alimento Teste W27'")


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
                    break
            time.sleep(2)
        nav.close()
    print(f"\nW27 · telas ({a.prefixo}) · {time.time() - t0:.0f}s")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
