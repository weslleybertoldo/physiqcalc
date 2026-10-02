#!/usr/bin/env python3
"""Physiq W27 — prova de PRODUÇÃO do painel master, SÓ LEITURA (nenhuma escrita em conta ou aluno real, nada no Mercado Pago, o aviso
"o Physiq mudou" intocado). Contagens do banco antes = depois.

  negativo  nutri.teste.claude (não é master): 403 nas 3 funções; /master/contas volta para o painel. Sem login: 401.
  positivo  w27.master.teste.claude (master de TESTE só durante a prova — o massa.py --limpar tira): as leituras das 3 funções batem
            com o banco; as telas abrem; prints SÓ de telas sem dado pessoal (Planos, Configurações) ou com nomes/e-mails BORRADOS.
Uso: python3 e2e/w27/prod.py
"""
from __future__ import annotations

import hashlib
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

from playwright.sync_api import sync_playwright  # noqa: E402

S = "public"
B.ESTADO["schema"] = S
p = B.p
BASE = "https://physiqcalc.com.br"
BORRAR = """
  [data-tabela-contas] td, [data-tabela-integracoes] td:first-child, [data-tabela-integracoes] [data-chave-pix],
  [data-cartao-atencao-master] [data-atencao-item] b, [data-cartao-atencao-master] [data-atencao-item] span.block,
  [data-tabela-alunos-master] td, [data-menu-usuario], .pq-avatar { filter: blur(7px) !important; }
"""


def contagens() -> dict:
    tabs = ["contas", "conta_membros", "pacientes", "conta_faturas", "conta_eventos", "conta_assinaturas", "plano_precos", "plano_precos_hist",
            "app_config", "pratos_prontos", "pratos_prontos_itens", "avisos"]
    r = B.sql_principal(" union all ".join(f"select '{t}' as t, count(*)::int as n from {S}.{t}" for t in tabs))
    out = {x["t"]: x["n"] for x in r}
    av = B.sql_principal(f"select valor::text as v from {S}.app_config where chave = 'aviso_mudanca'")[0]["v"]
    out["aviso_mudanca_hash"] = hashlib.sha256(av.encode()).hexdigest()[:16]
    t = B.sql_treino("select (select count(*) from public.physiq_treinos_prontos)::int as a, (select count(*) from public.physiq_treinos_prontos_grupos)::int as b,"
                     " (select count(*) from public.physiq_treinos_prontos_exercicios)::int as c")[0]
    out["treino_prontos"] = f"{t['a']}/{t['b']}/{t['c']}"
    return out


def main() -> int:
    B.saude_ok("a prova de produção da W27")
    antes = contagens()
    print("   antes:", json.dumps(antes, ensure_ascii=False))

    # ── negativo: quem não é master e sem login ──
    for nome, corpo in (("master-contas", {"acao": "visao_geral"}), ("master-financeiro", {"acao": "listar"}), ("master-planos", {"acao": "listar"})):
        st, r = B.funcao(nome, corpo, conta="nutri-legado")
        p.check(st == 403 and r.get("erro") == "so_master", f"[prod negativo] {nome}: nutri de teste (não é master) recebe 403 ({st} {r.get('erro')})")
        st, r = B.funcao(nome, corpo, conta=None)
        p.check(st == 401, f"[prod negativo] {nome}: sem login 401 ({st})")

    # ── positivo só leitura (master de TESTE) ──
    st, vg = B.funcao("master-contas", {"acao": "visao_geral"})
    total = B.sql_principal(f"select count(*)::int as n from {S}.contas where origem <> 'app'")[0]["n"]
    p.check(st == 200 and vg["contas"]["total"] == total, f"[prod] visão geral: contas = banco ({vg.get('contas', {}).get('total')} = {total})")
    st, lc = B.funcao("master-contas", {"acao": "listar"})
    p.check(st == 200 and len(lc.get("contas", [])) == total + 1, f"[prod] contas: todas, com a conta do app ({len(lc.get('contas', []))})")
    legadas = [c for c in lc.get("contas", []) if c.get("cobranca_legada")]
    p.check(all(c["origem"] in ("legado_calc", "legado_nutri") for c in legadas), f"[prod] {len(legadas)} contas legadas marcadas (Cobrança legada até a virada)")
    st, fi = B.funcao("master-financeiro", {"acao": "listar"})
    p.check(st == 200 and "resumo" in fi, "[prod] financeiro: resumo e faturas")
    st, pl = B.funcao("master-planos", {"acao": "listar"})
    p.check(st == 200 and len(pl.get("precos", [])) == 12, f"[prod] planos: 12 preços (3 módulos × 4 faixas) ({len(pl.get('precos', []))})")
    st, ig = B.funcao("master-contas", {"acao": "integracoes"})
    p.check(st == 200 and len(ig.get("contas", [])) == total + 1, "[prod] integrações: todas as contas")
    st, al = B.funcao("master-contas", {"acao": "alunos", "filtros": {"modo": "todos"}, "limite": 1})
    np_ = B.sql_principal(f"select count(*)::int as n from {S}.pacientes where deleted_at is null")[0]["n"]
    p.check(st == 200 and al.get("total") == np_, f"[prod] alunos: total = banco ({al.get('total')} = {np_})")
    st, pr = B.funcao("master-planos", {"acao": "pratos"})
    p.check(st == 200 and len(pr.get("pratos", [])) == antes["pratos_prontos"], "[prod] pratos prontos listados")

    # ── telas (só leitura): /master direto, Planos e Configurações sem dado pessoal; Visão geral e Contas BORRADAS ──
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox"])
        c = B.Caso(nav, BASE, "prod", "prod_master", desktop=True)
        c.entrar("w27-master", "/master", zerar=False)
        c.fechar_avisos()
        p.check(c.esperar(lambda: c.tem('[data-pagina-master="visao-geral"]'), 60) and c.caminho() == "/master", f"[prod] /master direto abre a Visão geral ({c.caminho()})")
        c.esperar(lambda: c.tem('[data-kpi="Contas"]'), 30)
        c.pg.add_style_tag(content=BORRAR)
        c.print("tela6_master_visao_geral_borrada")
        for rota, pag, nome in (("/master/planos", "planos", "tela6_master_planos"), ("/master/configuracoes", "configuracoes", "tela6_master_configuracoes")):
            c.ir(rota)
            ok = c.esperar(lambda: c.tem(f'[data-pagina-master="{pag}"]') and not c.tem("[data-esqueleto]"), 45)
            if pag == "planos":
                ok = ok and c.esperar(lambda: c.tem('[data-preco="treino_nutricao:f10"]'), 30)
            if pag == "configuracoes":
                ok = ok and c.esperar(lambda: c.tem("[data-cartao-aviso-mudanca]"), 30)
            p.check(ok, f"[prod] {rota} abre")
            c.pg.add_style_tag(content=BORRAR)
            c.print(nome)
        c.ir("/master/contas")
        p.check(c.esperar(lambda: c.tem("[data-tabela-contas]"), 45), "[prod] Contas abre (lista borrada no print)")
        c.pg.add_style_tag(content=BORRAR)
        c.print("tela6_master_contas_borrada")
        c.fim()
        c = B.Caso(nav, BASE, "prod", "prod_negativo", desktop=True)
        c.entrar("nutri-legado", "/master/contas", zerar=False)
        p.check(c.esperar(lambda: c.caminho().startswith("/painel"), 60) and not c.tem("[data-pagina-master]"),
                f"[prod negativo] não-master abre /master/contas e volta para o painel ({c.caminho()})")
        c.fim()
        nav.close()

    time.sleep(2)
    depois = contagens()
    print("   depois:", json.dumps(depois, ensure_ascii=False))
    p.check(antes == depois, f"[prod] contagens iguais antes e depois (nada gravado): {'iguais' if antes == depois else {k: (antes[k], depois.get(k)) for k in antes if antes[k] != depois.get(k)}}")
    B.json_arquivo(Path.home() / "backups" / "physiq" / "2026-10-02-w27" / "prova-prod-contagens.json", {"antes": antes, "depois": depois})
    B.saude_ok("o fim da prova de produção")
    return p.fim()


if __name__ == "__main__":
    raise SystemExit(main())
