#!/usr/bin/env python3
"""Physiq W25 — PRODUÇÃO (https://physiqcalc.com.br, schema public): smoke SÓ DE LEITURA do Painel › Dashboard com as contas de
TESTE de produção (nenhum dado é criado nem mudado; nenhuma conta de cliente é aberta — prints só com *.teste.claude@…):

  admin.teste.claude@physiqcalc.app  dono + personal da "Admin Teste" (conta só de Treino, 1 aluno de teste): o Dashboard inteiro com o
                                     resumo do Treino (a função painel-resumo-treino em produção), sem os blocos da Nutrição, e os números
                                     = as telas de origem (Alunos e o menu, o Recebido do Financeiro, o "Consultas hoje" da Agenda);
  nutri.teste.claude@physiqnutri.app dona + nutricionista da "Nutri Teste Claude" (só Nutrição, sem alunos): os estados vazios com texto,
                                     o Diário de hoje (nutricionista) e nenhum pedido ao Banco do Treino;
  API                                painel_resumo e alunos_novos_por_mes (principal, public) e a painel-resumo-treino (Treino, public):
                                     o dono vê a conta; sem token / anon / conta alheia recusados.
Contagens de linhas antes/depois provam que nada mudou.
Uso: python3 e2e/w25/prod.py
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402
import telas as T  # noqa: E402  (importar ANTES de escolher o schema: o telas.py marca o staging)

from playwright.sync_api import sync_playwright  # noqa: E402

S = "public"
B.ESTADO["schema"] = S
p = B.p
BASE = "https://physiqcalc.com.br"
DONO, NUTRI = "master", "nutri-legado"   # admin.teste.claude@physiqcalc.app · nutri.teste.claude@physiqnutri.app (B5.CONTAS)
TAB_P = ["pacientes", "cobrancas", "transacoes", "agendamentos", "respostas_preconsulta", "cadastros_pendentes", "conta_membros"]
TAB_T = ["tb_treino_series", "tb_treino_concluido", "treino_historico", "tb_semana_treinos", "physiq_avaliacoes"]


def contagens(contas: list[str]) -> dict:
    """As linhas das contas de TESTE (as de cliente mudam sozinhas com o uso de verdade e não entram na conta)."""
    em = ",".join(f"'{c}'" for c in contas)
    r = {f"principal.{t}": B.sql_principal(f"select count(*) as n from public.{t} where conta_id in ({em})")[0]["n"] for t in TAB_P}
    r["principal.diario"] = B.sql_principal(f"select count(*) as n from public.diario_alimentar d join public.pacientes p on p.id = d.paciente_id where p.conta_id in ({em})")[0]["n"]
    r["principal.avisos"] = B.sql_principal(f"select count(*) as n from public.avisos a where a.destino_user_id in (select user_id from public.conta_membros where conta_id in ({em}))")[0]["n"]
    alunos = f"(select id from public.physiq_profiles where conta_id in ({em}))"
    r.update({f"treino.{t}": B.sql_treino(f"select count(*) as n from public.{t} where user_id in {alunos}")[0]["n"] for t in TAB_T})
    r["treino.physiq_profiles"] = B.sql_treino(f"select count(*) as n from public.physiq_profiles where conta_id in ({em})")[0]["n"]
    return r


def conta_do(conta: str) -> str:
    u = B.uid(conta)
    r = B.sql_principal(f"select m.conta_id::text as id from public.conta_membros m where m.user_id = '{u}' and m.status = 'ativo' and 'dono' = any(m.papeis) limit 1")
    assert r, f"conta de {conta} não achada"
    return r[0]["id"]


def main() -> None:
    for k in (DONO, NUTRI):
        e = B.CONTAS[k][0]
        assert ".teste.claude@" in e, e
    T.ESTADO.update(base=BASE, prefixo="prod")
    conta_dono, conta_nutri = conta_do(DONO), conta_do(NUTRI)
    antes = contagens([conta_dono, conta_nutri])
    print("contagens antes:", antes, flush=True)

    # ───────── API (só leitura) ─────────
    B.saude_ok("produção: API")
    st, r = B.resumo_principal(DONO, conta_dono)
    lista = B.lista_alunos(DONO, conta_dono)
    p.check(st == 200 and r.get("ok") is True and len(r["alunos"]) == lista["total"], f"[prod dono] painel_resumo = a lista de Alunos ({len(r.get('alunos', []))} · {lista['total']})")
    st, n = B.novos_por_mes(DONO, conta_dono)
    p.check(st == 200 and n.get("ok") is True and len(n.get("meses", [])) == 6, f"[prod dono] novos por mês ({n.get('meses')})")
    tok = B.treino_token(DONO)
    st, rt, seg = B.resumo_treino(tok, conta_dono, origem=BASE)
    p.check(st == 200 and rt.get("ok") is True and len(rt.get("alunos", [])) == lista["total"], f"[prod dono] painel-resumo-treino: os alunos da conta ({len((rt or {}).get('alunos', []))}, {seg:.1f}s)")
    st, _, _ = B.resumo_treino(None, conta_dono, origem=BASE)
    p.check(st == 401, f"[prod] sem token: recusado ({st})")
    st, r5, _ = B.resumo_treino(B.anon(B.TREINO_REF), conta_dono, origem=BASE)
    p.check(st == 401, f"[prod] anon: recusado ({st} {r5})")
    st, r6, _ = B.resumo_treino(tok, conta_nutri, origem=BASE)
    p.check(st == 403, f"[prod] conta alheia: recusado ({st} {r6})")
    time.sleep(3)

    # ───────── telas (só leitura) ─────────
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox"])
        try:
            B.saude_ok("produção: Dashboard do dono")
            c = T.abrir(nav, "prod-dono", DONO)
            try:
                T.fechar_faixa(c)
                if T.esperar_dashboard(c, "prod dono", "ok"):
                    p.check(c.pg.locator("[data-cartao-diario-hoje]").count() == 0, "[prod dono] conta só de Treino: sem o Diário de hoje")
                    p.check(attr_mod(c) == "treino", f"[prod dono] os módulos da conta: {attr_mod(c)}")
                    n = T.numeros_do_dashboard(c)
                    itens = T.itens_atencao(c)
                    print("   números:", n, "· atenção:", itens, flush=True)
                    p.check(not any(t == "dieta" for t, _ in itens), "[prod dono] nenhum item de dieta (conta sem Nutrição)")
                    c.pg.evaluate("window.scrollTo(0, 0)")
                    c.print("tela6_dashboard_treino")
                    c.pg.screenshot(path=str(B.PRINTS / "prod_tela6_dashboard_treino_inteira.png"), full_page=True)
                    T.conferir_origens(c, "prod dono", n, itens)
            finally:
                c.fim()
            time.sleep(4)
            B.saude_ok("produção: Dashboard da nutri")
            c = T.abrir(nav, "prod-nutri", NUTRI)
            try:
                T.fechar_faixa(c)
                if T.esperar_dashboard(c, "prod nutri", "fora"):
                    p.check(c.tem("[data-cartao-diario-hoje]"), "[prod nutri] a nutricionista vê o Diário de hoje")
                    p.check(c.tem('[data-bloco-vazio="atencao"]') and c.tem('[data-bloco-vazio="agenda"]'), "[prod nutri] sem alunos: os estados vazios com texto")
                    p.check(not any("/functions/v1/painel-resumo-treino" in x for x in c.rede), "[prod nutri] nenhum pedido ao Banco do Treino (conta só de Nutrição)")
                    c.pg.evaluate("window.scrollTo(0, 0)")
                    c.print("tela6_dashboard_vazio_nutri")
            finally:
                c.fim()
        finally:
            nav.close()

    depois = contagens([conta_dono, conta_nutri])
    mudou = {k: (antes[k], depois[k]) for k in antes if antes[k] != depois[k]}
    p.check(not mudou, f"[prod] nada mudou nas contas de teste nos 2 bancos (contagens iguais antes/depois) {mudou}")
    raise SystemExit(p.fim())


def attr_mod(c) -> str | None:
    return T.attr(c, "[data-pagina-dashboard]", "data-modulos")


if __name__ == "__main__":
    main()
