#!/usr/bin/env python3
"""Physiq W7b — E2E de TELA do aluno sem profissional (Playwright; contexto limpo por caso; em série — o Banco do Treino é uma
VM Nano), prints no tamanho do app (390 × 844 × 3,4; o master em 1280 × 883 × 2). Staging; só contas de TESTE (e2e/w07b/contas.py).

Casos (na ordem):
  entrada          w7b-novo (sem nada): Boas-vindas com as 3 opções (tela 1) → "Treinar sem profissional" → (hml-12, build de
                   staging: data de nascimento de adulto + consentimento de saúde) → sem objetivo recusa →
                   Emagrecer + Treino + Alimentação → 7 dias grátis → abre os Treinos prontos
  treino_pronto    w7b-novo: detalhe de um treino pronto (tela 2) → SEM INTERNET "Usar este treino" → a aba Treino mostra o treino
                   dele (PowerSync no aparelho) → volta a internet → os treinos próprios e a semana sobem para o Banco do Treino
  faixa            w7b-novo: a faixa violeta dos dias grátis no topo da aba de abertura
  perfil           w7b-novo: Perfil (tela 5) com o "Plano do app" (Meu plano, Treinos prontos, Alimentação) e o objetivo no card
  meu_plano        w7b-novo: Meu plano (grátis até, preço da tabela) → trocar para Treino e de volta (confirmação)
  pratos           w7b-novo: Alimentação — pratos prontos por refeição (tela 3) e o detalhe com macros e ingredientes
  pagamentos       w7b-novo: Pagamentos nos dias grátis (Assinar)
  sem_alimentacao  w7b-treino (só Treino): a Alimentação oferece o plano (negativo — nada de pratos)
  bloqueio         w7b-vence: o teste acabou sem pagar → app fechado (o Perfil também) → Pagamentos → Pix (sandbox) → simular
                   aprovação → o app abre
  popup            w7b-sozinho: o código do Lucas no Perfil → o popup avisa que a mensalidade do app para (Cancelar: nada muda)
  master           admin.teste (perfil master só no staging, desfeito no fim): Alunos › "Alunos do app" com plano e situação
Uso: python3 e2e/w07b/telas.py --base http://localhost:5173 --prefixo local [--casos a,b]
"""
from __future__ import annotations

import argparse
import importlib.util
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

p = B.p
S = "staging"
B.ESTADO["schema"] = S
_espec = importlib.util.spec_from_file_location("contas_w7b", Path(__file__).parent / "contas.py")
C = importlib.util.module_from_spec(_espec)
_espec.loader.exec_module(C)  # type: ignore[union-attr]
TREINO_ESCOLHIDO = "emagrecer-intermediario"  # "Definição em 4 dias": A seg/qui, B ter/sex


def consentir_no_cartao(c) -> bool:
    """hml-12 (H-30): no build de staging o "Treinar sem profissional" pede a data de nascimento (18+) e o consentimento de saúde
    antes de "Começar" (o botão fica travado sem os 2): data de 30 anos atrás e a caixa marcada. No build de produção (antes da
    virada) não há os 2 e segue igual. True = preencheu."""
    if not c.esperar(lambda: c.tem("[data-consentimento-saude='app']"), 6):
        return False
    c.pg.locator("[data-form-sozinho] [data-campo-nascimento] input[type='date']").first.fill(B.B5.nascimento_adulto())
    B.B5.marcar(c.pg.locator("[data-form-sozinho] [data-consentimento-saude-caixa]"))
    return True


def abrir(nav, a, conta: str, rota: str, nome: str, desktop: bool = False) -> B.Caso:
    c = B.Caso(nav, a.base, a.prefixo, nome, desktop=desktop)
    c.entrar(conta, rota, zerar=True)
    c.fechar_avisos()
    return c


def caso_entrada(nav, a) -> None:
    C.zerar("w7b-novo")
    c = abrir(nav, a, "w7b-novo", "/", "entrada")
    ok = c.esperar(lambda: c.caminho().startswith("/boas-vindas") and c.pg.locator("[data-onboarding]").count() == 3 and "a partir de R$ 29,90" in c.texto(), 30)
    ordem = c.pg.locator("[data-onboarding]").evaluate_all("(els) => els.map((e) => e.getAttribute('data-onboarding'))")
    p.check(ok and ordem == ["TenhoCodigo", "TreinarSemProfissional", "CriarConta"], f"Boas-vindas: código · treinar sem profissional · sou profissional ({ordem})")
    p.check("7 DIAS GRÁTIS" in c.texto() and "Treinar sem profissional" in c.texto(), "opção nova com os 7 dias grátis e o menor preço da tabela")
    c.print("entrada")
    c.pg.locator("[data-sozinho-abrir]").click()
    c.esperar(lambda: c.tem("[data-plano-app='app_treino_alimentacao']") and "R$ 49,90/mês" in c.texto(), 15)
    if consentir_no_cartao(c):  # hml-12: a data (18+) e o consentimento de saúde, antes de qualquer clique em "Começar"
        p.check(True, "hml-12: data de nascimento (adulto) e consentimento de saúde preenchidos no cartão (build de staging)")
    c.pg.locator("[data-sozinho-enviar]").click()
    p.check(c.esperar(lambda: "Escolha o seu objetivo." in c.texto(), 6), "sem objetivo: pede o objetivo (nada é criado)")
    p.check(B.app_da("w7b-novo") is None, "nada criado sem o objetivo")
    c.pg.locator("[data-objetivo='emagrecer']").click()
    c.pg.locator("[data-plano-app='app_treino_alimentacao']").click()
    c.pg.locator("[data-form-sozinho]").scroll_into_view_if_needed()
    c.print("escolha_plano")
    c.pg.locator("[data-sozinho-enviar]").click()
    p.check(c.esperar(lambda: c.tem("[data-app-pronto]"), 20), "entrou: 'Pronto! Grátis até …'")
    m = B.app_da("w7b-novo")
    p.check(m and m["plano"] == "app_treino_alimentacao" and m["objetivo_app"] == "emagrecer" and m["teste_ate"], f"matrícula do app no banco ({m})")
    ok = c.esperar(lambda: c.caminho().startswith("/perfil/treinos-prontos") and c.pg.locator("[data-cartao-treino-pronto]").count() >= 3, 40)
    p.check(ok and c.tem("[data-treinos-inicio]"), "abriu os Treinos prontos com o aviso dos dias grátis")
    p.check(c.pg.locator("[data-cartao-treino-pronto]").count() == 3, f"3 treinos do objetivo Emagrecer ({c.pg.locator('[data-cartao-treino-pronto]').count()})")
    c.print("treinos_prontos")
    c.fim()


def zerar_treino(conta: str) -> None:
    """Só os treinos próprios e a semana no Banco do Treino (staging) — o PowerSync do staging lê o public: sem isto, a semana
    antiga do staging bateria no índice único (user, dia, slot) ao subir a nova."""
    tid = B.treino_id(conta)
    if tid:
        B.sql_treino(f"""delete from {S}.tb_semana_treinos where user_id = '{tid}';
                         delete from {S}.tb_series_padrao_usuario where user_id = '{tid}';
                         delete from {S}.tb_grupos_exercicios_usuario where user_id = '{tid}';
                         delete from {S}.tb_grupos_treino_usuario where user_id = '{tid}'""")


def caso_treino_pronto(nav, a) -> None:
    zerar_treino("w7b-novo")
    # abre a aba Treino primeiro (as peças dela ficam carregadas — no APK/PWA elas já estão no aparelho) e navega pelo app
    c = abrir(nav, a, "w7b-novo", "/treino", "treino_pronto")
    c.esperar(lambda: c.tem("[data-tabbar]") and c.caminho().startswith("/treino"), 40)
    c.pg.wait_for_timeout(2500)
    c.pg.locator("[data-tabbar] a[href='/perfil']").click()
    c.esperar(lambda: c.tem("[data-perfil-plano-app]"), 30)
    c.pg.locator("[data-perfil-plano-app] a[href='/perfil/treinos-prontos']").click()
    c.esperar(lambda: c.pg.locator(f"[data-cartao-treino-pronto='{TREINO_ESCOLHIDO}']").count() == 1, 40)
    c.pg.locator(f"[data-cartao-treino-pronto='{TREINO_ESCOLHIDO}']").click()
    ok = c.esperar(lambda: c.tem("[data-pagina-treinos-prontos='detalhe']") and c.pg.locator("[data-exercicio-pronto]").count() == 15, 20)
    p.check(ok and "Definição em 4 dias" in c.texto() and "Treino A · Superiores" in c.texto() and "4 × 12 · 60 s" in c.texto(),
            "detalhe: divisões, dias, exercícios com séries × reps · descanso (tela 2)")
    c.print("treino_pronto_detalhe")
    c.ctx.set_offline(True)
    c.pg.wait_for_timeout(800)
    c.pg.locator("[data-usar-treino]").click()
    if c.esperar(lambda: c.tem("[data-confirmar-usar]"), 3):
        c.pg.locator("[data-confirmar-usar]").click()
    ok = c.esperar(lambda: c.caminho().startswith("/treino") and "Treino B · Inferiores e abdômen" in c.texto(), 30)
    p.check(ok, "SEM INTERNET: 'Usar este treino' → a aba Treino mostra o treino dele (hoje, terça: Treino B)")
    c.pg.wait_for_timeout(1500)
    c.print("treino_sem_internet")
    c.ctx.set_offline(False)
    tid = B.treino_id("w7b-novo")
    ok = False
    g: dict = {}
    for _ in range(30):
        g = B.sql_treino(f"select (select count(*) from {S}.tb_grupos_treino_usuario where user_id = '{tid}')::int g, "
                         f"(select count(*) from {S}.tb_semana_treinos where user_id = '{tid}')::int s, "
                         f"(select count(*) from {S}.tb_series_padrao_usuario where user_id = '{tid}')::int e, "
                         f"(select string_agg(dia_semana, ',' order by dia_semana) from {S}.tb_semana_treinos where user_id = '{tid}') dias")[0]
        if g["g"] == 2 and g["s"] == 4 and g["e"] == 15:
            ok = True
            break
        c.pg.wait_for_timeout(2000)
    p.check(ok, f"a internet voltou: 2 treinos próprios, 4 dias na semana e 15 séries/reps/descanso no Banco do Treino ({g})")
    c.fim()


def caso_faixa(nav, a) -> None:
    c = abrir(nav, a, "w7b-novo", "/", "faixa")  # desde a W12 a aba de abertura é o Início (a faixa fica abaixo da saudação)
    ok = c.esperar(lambda: c.tem("[data-faixa-mensalidade='teste']"), 30)
    t = c.pg.locator("[data-faixa-mensalidade]").inner_text() if ok else ""
    p.check(ok and "Seus dias grátis vão até" in t and "R$ 49,90/mês" in t and "Assinar" in t, f"faixa violeta dos dias grátis ({t!r})")
    c.print("faixa_teste")
    c.fim()


def caso_perfil(nav, a) -> None:
    c = abrir(nav, a, "w7b-novo", "/perfil", "perfil")
    ok = c.esperar(lambda: c.tem("[data-perfil-plano-app]") and c.tem("[data-perfil-linha]"), 30)
    t = c.texto()
    p.check(ok and "Plano do app" in t.replace("PLANO DO APP", "Plano do app") and "Treinos prontos" in t and "Alimentação" in t and "Treino + Alimentação" in t,
            "Perfil: o grupo Plano do app (Meu plano · Treinos prontos · Alimentação)")
    linha = c.pg.locator("[data-perfil-linha]").inner_text().lower() if ok else ""
    p.check("objetivo: emagrec" in linha and "TREINO" in t and "NUTRIÇÃO" in t, f"card do aluno com o objetivo e os módulos (tela 5) ({linha!r})")
    p.check("Tenho um código do meu profissional" in t, "sem profissional: o campo do código continua (W7)")
    c.print("perfil_app")
    c.fim()


def caso_meu_plano(nav, a) -> None:
    c = abrir(nav, a, "w7b-novo", "/perfil/meu-plano", "meu_plano")
    ok = c.esperar(lambda: c.tem("[data-meu-plano='app_treino_alimentacao']") and c.tem("[data-meu-plano-situacao='teste']"), 30)
    p.check(ok and "R$ 49,90/mês" in c.texto() and "Grátis até" in c.pg.locator("[data-meu-plano-situacao]").inner_text(), "Meu plano: Treino + Alimentação, grátis até …")
    c.print("meu_plano")
    c.pg.locator("[data-plano-app='app_treino']").click()
    c.esperar(lambda: c.tem("[data-troca-texto]"), 8)
    p.check("Os pratos prontos saem" in c.pg.locator("[data-troca-texto]").inner_text(), "confirmação antes de trocar")
    c.print("trocar_plano")
    c.pg.locator("[data-troca-confirmar]").click()
    ok = c.esperar(lambda: c.tem("[data-meu-plano='app_treino']") and "R$ 29,90/mês" in c.pg.locator("[data-meu-plano-valor]").inner_text(), 20)
    p.check(ok and B.app_da("w7b-novo")["plano"] == "app_treino", "trocou para Treino (R$ 29,90) — tela e banco")
    c.pg.locator("[data-plano-app='app_treino_alimentacao']").click()
    c.esperar(lambda: c.tem("[data-troca-confirmar]"), 8)
    c.pg.locator("[data-troca-confirmar]").click()
    ok = c.esperar(lambda: c.tem("[data-meu-plano='app_treino_alimentacao']"), 20)
    p.check(ok and B.app_da("w7b-novo")["plano"] == "app_treino_alimentacao", "de volta ao Treino + Alimentação")
    c.fim()


def caso_pratos(nav, a) -> None:
    c = abrir(nav, a, "w7b-novo", "/perfil/alimentacao", "pratos")
    ok = c.esperar(lambda: c.pg.locator("[data-prato-pronto]").count() == 8, 30)
    t = c.texto()
    p.check(ok and all(x in t for x in ("Café da manhã", "Almoço", "Lanche", "Jantar")) and "Pratos prontos · Emagrecer" in t,
            "8 pratos do objetivo por refeição (tela 3)")
    kcal = c.pg.locator("[data-prato-pronto='emagrecer-cafe-ovos-pao-mamao'] [data-prato-kcal]").get_attribute("data-prato-kcal") if ok else None
    p.check(kcal == "269", f"kcal do prato pela TACO ({kcal})")
    c.print("pratos_prontos")
    c.pg.locator("[data-prato-pronto='emagrecer-almoco-frango-arroz-integral']").click()
    ok = c.esperar(lambda: c.tem("[data-detalhe-prato]") and c.pg.locator("[data-item-prato]").count() == 6, 10)
    p.check(ok and "Proteína" in c.texto() and "Como fazer" in c.texto().replace("COMO FAZER", "Como fazer"), "detalhe: macros, ingredientes com a medida e o preparo")
    c.print("prato_detalhe")
    c.fim()


def caso_pagamentos(nav, a) -> None:
    c = abrir(nav, a, "w7b-novo", "/perfil/pagamentos", "pagamentos")
    ok = c.esperar(lambda: c.tem("[data-mensalidade-aluno='teste']"), 30)
    t = c.pg.locator("[data-mensalidade-aluno]").inner_text() if ok else ""
    p.check(ok and "Plano do app" in t and "Grátis até" in t and "Assinar" in t, f"Pagamentos nos dias grátis: Assinar ({t[:120]!r})")
    c.print("pagamentos_teste")
    c.fim()


def caso_sem_alimentacao(nav, a) -> None:
    c = abrir(nav, a, "w7b-treino", "/perfil/alimentacao", "sem_alimentacao")
    ok = c.esperar(lambda: c.tem("[data-alimentacao-bloqueada]"), 30)
    p.check(ok and c.pg.locator("[data-prato-pronto]").count() == 0 and "Treino + Alimentação" in c.texto(), "só Treino: a Alimentação oferece o plano, sem pratos")
    c.print("alimentacao_sem_plano")
    c.fim()


def caso_bloqueio(nav, a) -> None:
    pid = B.app_da("w7b-vence")["id"]
    B.sql_principal(f"""delete from {S}.cobrancas where paciente_id = '{pid}';
                        update {S}.pacientes set app_teste_de = now() - interval '9 days', app_teste_ate = now() - interval '2 hours' where id = '{pid}';
                        select {S}.mensalidade_recalcular('{pid}')""")
    c = abrir(nav, a, "w7b-vence", "/", "bloqueio")
    ok = c.esperar(lambda: c.tem("[data-trava-app='pagamento-pendente-app']"), 30)
    p.check(ok and "Seus dias grátis acabaram" in c.texto() and "R$ 29,90/mês" in c.texto(), "teste acabou sem pagar: o app fecha com 'Pagar'")
    c.print("bloqueio")
    c.ir("/perfil")
    p.check(c.esperar(lambda: c.tem("[data-trava-app='pagamento-pendente-app']"), 15), "o Perfil também fica fechado (só Pagamentos abre)")
    c.pg.locator("[data-trava-pagar]").click()
    ok = c.esperar(lambda: c.caminho().startswith("/perfil/pagamentos") and c.tem("[data-mensalidade-aluno='vencida']"), 30)
    p.check(ok, "Pagamentos abre com a mensalidade vencida")
    c.print("pagamentos_vencido")
    c.pg.locator("[data-pagar-mensalidade]").click()
    c.esperar(lambda: c.tem("[data-mp-gerar-pix]"), 10)
    c.pg.locator("[data-mp-gerar-pix]").click()
    ok = c.esperar(lambda: c.tem("[data-mp-pix-aberto]"), 40)
    p.check(ok, "Pix do Mercado Pago (sandbox) gerado")
    c.print("pix")
    c.pg.locator("[data-mp-simular]").click()
    ok = c.esperar(lambda: c.tem("[data-mensalidade-aluno='em_dia']"), 30)
    p.check(ok, "pagou (aprovação simulada no staging): em dia")
    c.ir("/treino")
    ok = c.esperar(lambda: not c.tem("[data-trava-app]") and c.caminho().startswith("/treino") and c.tem("[data-tabbar]"), 30)
    p.check(ok, "o app abriu de novo")
    c.print("liberado")
    c.fim()


def caso_popup(nav, a) -> None:
    c = abrir(nav, a, "w7b-sozinho", "/perfil", "popup")
    c.esperar(lambda: c.tem("[data-perfil-profissionais]") and c.pg.get_by_placeholder("PROF-NOME-SOBRENOME").count() > 0, 30)
    c.pg.get_by_placeholder("PROF-NOME-SOBRENOME").first.fill(B.CODIGO_LUCAS)
    c.pg.get_by_role("button", name="Entrar na lista").first.click()
    ok = c.esperar(lambda: c.tem("[data-vinculo-app]"), 30)
    p.check(ok and "A mensalidade do app (R$ 49,90/mês) para aqui" in c.texto(), "popup: avisa que a mensalidade do app para")
    c.print("popup_vincular_app")
    c.pg.locator("[data-vinculo-cancelar]").click()
    c.pg.wait_for_timeout(800)
    p.check(B.app_da("w7b-sozinho")["ativo"] is True, "Cancelar: continua no app")
    c.fim()


def caso_master(nav, a) -> None:
    u = B.uid("master")
    antes = B.sql_principal(f"select role from {S}.profiles where id = '{u}'")[0]["role"]
    B.sql_principal(f"update {S}.profiles set role = 'master' where id = '{u}'")
    try:
        # como a W3: primeiro o painel (a troca de token grava a sessão do Treino), depois o master — a guarda antiga das páginas
        # do master (src/layouts/MasterLayout.tsx) manda para /entrar se abrir antes da troca (já era assim; fica para a W27)
        c = abrir(nav, a, "master", "/painel/alunos", "master", desktop=True)
        c.esperar(lambda: c.tem("[data-menu-lateral]"), 120)
        c.esperar(lambda: c.pg.evaluate("() => Object.keys(localStorage).some((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))"), 60)
        c.pg.wait_for_timeout(1000)
        c.ir("/master/alunos?semProfessor=1")
        ok = c.esperar(lambda: c.pg.locator("[data-aluno-do-app]").count() >= 3, 45)
        p.check(ok and "aluno(s) do app" in c.texto().lower() and "alunos do app" in c.texto().lower(), f"master › Alunos › 'Alunos do app' com plano e situação ({c.pg.locator('[data-aluno-do-app]').count()})")
        c.print("master_alunos_app")
        c.fim()
    finally:
        B.sql_principal(f"update {S}.profiles set role = '{antes}' where id = '{u}'")


CASOS = {"entrada": caso_entrada, "treino_pronto": caso_treino_pronto, "faixa": caso_faixa, "perfil": caso_perfil, "meu_plano": caso_meu_plano,
         "pratos": caso_pratos, "pagamentos": caso_pagamentos, "sem_alimentacao": caso_sem_alimentacao, "bloqueio": caso_bloqueio,
         "popup": caso_popup, "master": caso_master}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--prefixo", required=True)
    ap.add_argument("--casos", default=",".join(CASOS))
    a = ap.parse_args()
    a.base = a.base.rstrip("/")
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox"])
        try:
            for nome in [x.strip() for x in a.casos.split(",") if x.strip()]:
                print(f"\n== {nome}", flush=True)
                if not B.saude_treino():
                    p.check(False, "Banco do Treino lento/instável — parei antes do caso (nada de restart)")
                    break
                try:
                    CASOS[nome](nav, a)
                except Exception as e:  # noqa: BLE001
                    p.check(False, f"[{nome}] exceção: {type(e).__name__}: {str(e)[:300]}")
                    caso = B.ESTADO.get("caso")
                    if caso:
                        caso.diagnostico()
                        try:
                            caso.ctx.close()
                        except Exception:  # noqa: BLE001
                            pass
                time.sleep(2)
        finally:
            nav.close()
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
