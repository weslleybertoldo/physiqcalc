#!/usr/bin/env python3
"""Physiq H4 — prova de PRODUÇÃO, SÓ LEITURA (nenhuma escrita em conta ou aluno real; nada no Mercado Pago; nenhuma mensagem). Contagens
do banco antes = depois. Só contas de TESTE: a "Nutri Teste Claude" (nutri.teste.claude, sem alunos) e o w27.master.teste.claude (MASTER
de teste só durante a prova — o Auth é um só; tirar_master no fim). O aluno da "Admin Teste" pode ser pessoa real: fica de fora.

  publicas  /privacidade com o contato novo (bertoldo.code@gmail.com, a constante) e a data nova
  servidor  alunos_da_conta (public) aceita os filtros novos, a ordem e a exportação; master_conta_detalhe dá o código PROF-… e o
            último acesso de cada membro; quem não é master recebe 403
  telas     nutri de teste: Alunos com os filtros novos e o Exportar CSV (lista vazia → o aviso, sem arquivo), o Dashboard (Recibos no
            mês) e o Perfil SEM o "Sua área" (é nutricionista); master de teste: a folha da conta de teste com o código e o último acesso
            (a lista das contas BORRADA) e o Alunos com o botão Abrir (BORRADO; nada é aberto)
Uso: python3 e2e/h4/prod.py
"""
from __future__ import annotations

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
CONTATO = "bertoldo.code@gmail.com"
CONTA_TESTE = "Nutri Teste Claude"
BORRAR = """
  [data-tabela-contas] td, [data-tabela-alunos-master] td:not(:last-child), [data-cartao-atencao-master] [data-atencao-item] b,
  [data-menu-usuario] { filter: blur(7px) !important; }
"""


def contagens() -> dict:
    tabs = ["contas", "conta_membros", "pacientes", "transacoes", "recibos", "diario_alimentar", "cobrancas", "conta_eventos", "profiles"]
    r = B.sql_principal(" union all ".join(f"select '{t}' as t, count(*)::int as n from {S}.{t}" for t in tabs))
    out = {x["t"]: x["n"] for x in r}
    out["area_outra_preenchida"] = B.sql_principal(f"select count(*)::int n from {S}.profiles where area_outra is not null")[0]["n"]
    out["masters_perfil"] = B.sql_principal(f"select count(*)::int n from {S}.profiles where role = 'master'")[0]["n"]
    return out


def main() -> int:
    B.saude_ok("a prova de produção do H4")
    antes = contagens()
    print("   antes:", json.dumps(antes, ensure_ascii=False))
    conta = B.conta_id(CONTA_TESTE)
    assert conta, CONTA_TESTE

    # ── servidor (public), só leitura ──
    st, r = B.rpc("nutri-legado", "alunos_da_conta", {"p_conta": conta, "p_filtros": {
        "situacao": "todos", "genero": "feminino", "cadastro_de": "2025-01-01T03:00:00Z", "modificado_ate": "2030-01-01T03:00:00Z",
        "ordem": "modificados", "exportar": "true"}, "p_offset": 0, "p_limite": 500})
    p.check(st == 200 and isinstance(r, dict) and r.get("ok") and r.get("total") == 0, f"[prod] alunos_da_conta (public) aceita os filtros novos, a ordem e a exportação ({st} {str(r)[:120]})")
    st, r = B.rpc("nutri-legado", "alunos_da_conta", {"p_conta": conta, "p_filtros": {"situacao": "todos", "cadastro_de": "não é data", "genero": "x"}, "p_offset": 0, "p_limite": 0})
    p.check(st == 200 and isinstance(r, dict) and r.get("ok"), "[prod] filtro inválido não quebra a lista")
    st, r = B.funcao("master-contas", {"acao": "detalhe", "conta_id": conta}, "nutri-legado")
    p.check(st == 403, f"[prod negativo] quem não é master não abre o detalhe da conta ({st})")

    B.dar_master("w27-master")
    try:
        st, r = B.funcao("master-contas", {"acao": "detalhe", "conta_id": conta}, "w27-master")
        m = next((x for x in (r.get("membros") or []) if x.get("email") == "nutri.teste.claude@physiqnutri.app"), {}) if isinstance(r, dict) else {}
        p.check(st == 200 and (m.get("codigo_convite") or "").startswith("PROF-") and "ultimo_acesso" in m,
                f"[prod] master: o código {m.get('codigo_convite')} e o último acesso ({str(m.get('ultimo_acesso'))[:10]}) do membro da conta de teste")

        # ── telas ──
        with sync_playwright() as pw:
            nav = pw.chromium.launch(args=["--no-sandbox"])
            c = B.Caso(nav, BASE, "prod", "prod_publicas", desktop=True)
            c.ir("/privacidade")
            p.check(c.esperar(lambda: f"Contato: {CONTATO}." in c.texto() and "2 de outubro de 2026" in c.texto(), 45),
                    f"[prod] /privacidade: 'Contato: {CONTATO}.' e 'Última atualização: 2 de outubro de 2026'")
            c.print("privacidade_contato")
            c.fim()

            c = B.Caso(nav, BASE, "prod", "prod_nutri", desktop=True)
            c.entrar("nutri-legado", "/painel/alunos", zerar=False)
            c.fechar_avisos()
            ok = c.esperar(lambda: c.tem("[data-pagina-alunos]") and c.tem("[data-filtro-genero]") and c.tem("[data-filtro-ordem]")
                           and c.tem('[data-filtro-periodo-valor="cadastro"]') and c.tem('[data-filtro-periodo-valor="modificacao"]'), 90)
            p.check(ok, "[prod] Alunos: os filtros novos (gênero, cadastro, modificação) e a ordem")
            c.pg.locator('[data-filtro-periodo-valor="cadastro"]').select_option("custom")
            p.check(c.esperar(lambda: c.tem('[data-filtro-de="cadastro"]') and c.tem('[data-filtro-ate="cadastro"]'), 10), "[prod] 'Personalizar data' mostra as 2 datas")
            c.pg.locator("[data-exportar-csv]").click()
            p.check(c.esperar(lambda: "Nenhum aluno para exportar" in c.texto(), 20), "[prod] Exportar CSV com a lista vazia: o aviso (nenhum arquivo)")
            c.print("alunos_filtros_novos")
            c.ir("/painel")
            ok = c.esperar(lambda: c.tem("[data-pagina-dashboard]") and c.tem("[data-recibos-mes]")
                           and c.pg.locator("[data-recibos-mes]").get_attribute("data-recibos-mes") not in (None, ""), 90)
            n = B.sql_principal(f"""select count(*)::int n from {S}.recibos r where r.deleted_at is null and r.nutricionista_id = '{B.uid('nutri-legado')}'
                                    and to_char(r.data, 'YYYY-MM') = to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM')""")[0]["n"]
            rec = c.pg.locator("[data-recibos-mes]").get_attribute("data-recibos-mes") if ok else None
            p.check(ok and rec == str(n), f"[prod] Dashboard: 'Recibos no mês' = os do mês no banco ({rec} = {n})")
            p.check(not c.tem('[data-atencao-item="diario"]'), "[prod] sem fotos sem reação, sem o item do diário")
            c.print("dashboard_recibos_mes")
            c.ir("/painel/configuracoes/perfil")
            ok = c.esperar(lambda: c.tem("[data-form-perfil]"), 60)
            p.check(ok and not c.tem("[data-perfil-area-outra]"), "[prod] Perfil da nutricionista: sem o 'Sua área' (só do tipo Outra área)")
            c.fim()

            c = B.Caso(nav, BASE, "prod", "prod_master", desktop=True)
            c.entrar("w27-master", "/master/contas", zerar=False)
            c.fechar_avisos()
            # hml-14d (D39): Contas em páginas de 20 — a conta de teste pela busca da lista (no banco, 300 ms; só leitura)
            if c.esperar(lambda: c.tem("[data-busca-contas]"), 90):
                c.pg.locator("[data-busca-contas]").fill(CONTA_TESTE)
                c.pg.wait_for_timeout(800)
            ok = c.esperar(lambda: c.tem(f'[data-linha-conta="{CONTA_TESTE}"]'), 90)
            p.check(ok, "[prod] master: Contas com a conta de teste")
            if ok:
                c.pg.locator(f'[data-linha-conta="{CONTA_TESTE}"]').first.click()
                ok = c.esperar(lambda: c.tem("[data-detalhe-membros] [data-copiar-codigo]") and c.tem("[data-detalhe-membros] [data-ultimo-acesso]"), 30)
                p.check(ok, "[prod] master: a folha da conta de teste com o código PROF-… (Copiar) e o último acesso")
                c.pg.add_style_tag(content=BORRAR)
                c.print("master_conta_teste_codigo_borrada")
            c.ir("/master/alunos")
            ok = c.esperar(lambda: c.tem("[data-tabela-alunos-master] [data-abrir-aluno]"), 60)
            p.check(ok, "[prod] master: Alunos com o botão Abrir em cada linha (nada é aberto)")
            c.pg.add_style_tag(content=BORRAR)
            c.print("master_alunos_abrir_borrada")
            c.fim()
            nav.close()
    finally:
        B.tirar_master("w27-master")

    time.sleep(2)
    depois = contagens()
    print("   depois:", json.dumps(depois, ensure_ascii=False))
    p.check(antes == depois, f"[prod] contagens iguais antes e depois (nada gravado): {'iguais' if antes == depois else {k: (antes[k], depois.get(k)) for k in antes if antes[k] != depois.get(k)}}")
    destino = Path.home() / "backups" / "physiq" / "2026-10-02-h4" / "prova-prod-contagens.json"
    destino.write_text(json.dumps({"antes": antes, "depois": depois}, ensure_ascii=False, indent=2), encoding="utf-8")
    destino.chmod(0o600)
    B.saude_ok("o fim da prova de produção")
    return p.fim()


if __name__ == "__main__":
    raise SystemExit(main())
