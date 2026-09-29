#!/usr/bin/env python3
"""Physiq W6 — smoke de PRODUÇÃO da cobrança aluno → profissional (SÓ LEITURA: nenhum clique em pagar, confirmar, salvar
ou recusar; nenhuma cobrança criada), no mínimo de trocas de token (o Banco do Treino é uma VM Nano), com os prints prod_*
nos tamanhos das telas aprovadas (app 390 × 844 × 3,4; painel 1280 × 883 × 2).

  aluno   conta de TESTE teste@teste.com: a faixa do topo na abertura (tela 1) e Perfil › Pagamentos (tela 5) com a
          mensalidade que veio do Calc pelo script 02 — 1 troca de token
  painel  conta de TESTE do master (admin.teste.claude): Resumo do aluno com o card Financeiro e o número Mensalidade, a aba
          Financeiro (tela 7), Configurações › Recebimento e a página Financeiro antiga (lendo o principal) — 1 troca
Uso: python3 smoke_prod.py [--base https://physiqcalc.com.br] [--casos aluno,painel]
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

AQUI = Path(__file__).resolve().parent
# dentro do repo (e2e/w06/smoke_prod.py) usa a base ao lado; na pasta de rascunho, a do repo principal (a W6 já está na main)
BASE_E2E = AQUI if (AQUI / "_base.py").exists() else Path.home() / "projetos" / "physiqcalc" / "e2e" / "w06"
sys.path.insert(0, str(BASE_E2E))
import _base as B  # noqa: E402

p = B.p
B.ESTADO["schema"] = "public"
S = "public"


def erros_de_rede(c) -> list[str]:
    return [r for r in c.rede if ("pagamentos-aluno" in r or "financeiro_do_aluno" in r) and not r.startswith("200 ")]


def caso_aluno(nav, a) -> None:
    m = B.matricula("aluno-calc")
    antes = B.sql_principal(f"select count(*)::int n, coalesce(sum(valor),0)::text s from {S}.cobrancas where paciente_id = '{m['id']}'")[0]
    c = B.Caso(nav, a.base, "prod", "aluno", desktop=False)
    c.entrar("aluno-calc", "/", zerar=False)
    c.fechar_avisos()
    p.check(c.esperar(lambda: c.tem("[data-faixa-mensalidade]"), 120), "faixa do topo na abertura (tela 1) com a mensalidade que veio do Calc")
    p.check("R$ 10,00" in c.pg.locator("[data-faixa-mensalidade]").inner_text(), "valor R$ 10,00 (o do Treino)")
    c.print("app_faixa")
    c.ir("/perfil/pagamentos")
    p.check(c.esperar(lambda: c.tem("[data-mensalidade-aluno]"), 90), "Perfil › Pagamentos (tela 5) com a mensalidade")
    txt = c.pg.locator("[data-pagina-pagamentos]").inner_text()
    p.check("R$ 10,00" in txt and c.tem("[data-historico-pagamentos]"), "valor e o histórico (o Mercado Pago cancelado migrado)")
    c.print("app_pagamentos")
    p.check(not erros_de_rede(c), f"pagamentos-aluno e financeiro_do_aluno responderam 200 ({erros_de_rede(c)[:3]})")
    p.check(len(c.trocas) <= 1, f"uma troca de token só ({len(c.trocas)})")
    depois = B.sql_principal(f"select count(*)::int n, coalesce(sum(valor),0)::text s from {S}.cobrancas where paciente_id = '{m['id']}'")[0]
    p.check(antes == depois, f"só leitura: nada mudou nas cobranças do aluno ({antes} = {depois})")
    c.fim()


def caso_painel(nav, a) -> None:
    conta = B.conta_do_dono("master")
    aluno = B.sql_principal(f"""select coalesce(treino_user_id, id)::text as id from {S}.pacientes where conta_id = '{conta}' and deleted_at is null
                                 order by created_at limit 1""")
    antes = B.sql_principal(f"select count(*)::int n from {S}.cobrancas where conta_id = '{conta}'")[0]["n"]
    c = B.Caso(nav, a.base, "prod", "painel")
    c.entrar("master", "/painel/configuracoes/recebimento", zerar=False)
    c.fechar_avisos()
    p.check(c.esperar(lambda: c.tem("[data-config-aba='recebimento'] [data-secao='recebimento-modo']"), 120), "Configurações › Recebimento abre (a aba nova)")
    p.check(c.pg.locator("[data-opcoes='recebimento-modo'] [data-opcao='mercadopago']").get_attribute("aria-checked") == "true",
            "a conta de teste veio do Calc com o Mercado Pago ligado (script 02)")
    p.check(c.esperar(lambda: c.tem("[data-recebimento-sem-pendentes]") or c.tem("[data-comprovante-pendente]"), 60), "a lista de comprovantes carrega")
    c.print("painel_recebimento")
    # a troca de token do Treino corre em segundo plano (esta aba não precisa dele): espera ela terminar antes de recarregar a
    # página — recarregar no meio aborta o pedido e a casca troca de novo na página seguinte
    c.esperar(lambda: any("trocar-token" in r for r in c.rede), 60)
    if aluno:
        c.ir(f"/painel/alunos/{aluno[0]['id']}")
        p.check(c.esperar(lambda: c.tem("[data-card-financeiro]") and c.tem("[data-cabecalho-aluno] h2"), 120), "Resumo do aluno com o card Financeiro (tela 7)")
        c.esperar(lambda: not c.tem("[data-card-financeiro] .animate-pulse"), 20)
        c.print("painel_resumo")
        c.pg.locator("[data-aba-aluno='financeiro']").click()
        p.check(c.esperar(lambda: c.tem("[data-financeiro-aluno] [data-cartao-mensalidade]"), 90), "aba Financeiro do aluno abre")
        c.print("painel_financeiro")
    c.ir("/painel/financeiro")
    p.check(c.esperar(lambda: c.tem("[data-pagina-cobranca] [data-secao-com-mensalidade]"), 120), "Financeiro (tela antiga até a W19) lendo o banco principal")
    c.print("painel_cobranca")
    p.check(not erros_de_rede(c), f"pagamentos-aluno respondeu 200 ({erros_de_rede(c)[:3]})")
    p.check(len(c.trocas) <= 1, f"uma troca de token só ({len(c.trocas)})")
    depois = B.sql_principal(f"select count(*)::int n from {S}.cobrancas where conta_id = '{conta}'")[0]["n"]
    p.check(antes == depois, f"só leitura: nenhuma cobrança criada ({antes} = {depois})")
    c.fim()


CASOS = {"aluno": caso_aluno, "painel": caso_painel}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="https://physiqcalc.com.br")
    ap.add_argument("--casos", default=",".join(CASOS))
    a = ap.parse_args()
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox"])
        for nome in [x.strip() for x in a.casos.split(",") if x.strip()]:
            print(f"\n── {nome}", flush=True)
            if not B.saude_treino():
                p.check(False, f"[{nome}] Banco do Treino fora do normal — parei (não reinicio nada)")
                break
            t0 = time.time()
            try:
                CASOS[nome](nav, a)
            except Exception as e:  # noqa: BLE001
                p.check(False, f"[{nome}] quebrou: {type(e).__name__}: {str(e)[:300]}")
                caso = B.ESTADO.get("caso")
                if caso is not None:
                    caso.diagnostico()
            print(f"   ({time.time() - t0:.0f} s)", flush=True)
            time.sleep(5)
        nav.close()
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
