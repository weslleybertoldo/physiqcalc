#!/usr/bin/env python3
"""Physiq W26 — a Lixeira, os Favoritos (Modelos ★) e os Impressos do SITE ANTIGO do PhysiqNutri lado a lado com as Ferramentas do Physiq
(as MESMAS tabelas do banco principal), com a nutri de teste do legado (nutri.teste.claude, conta legado_nutri) e um aluno DESCARTÁVEL de
teste (e-mail único, sem telefone e sem login = nenhuma mensagem nem aviso):

  1. a anamnese excluída pelo caminho do site antigo (PostgREST: deleted_at) aparece na /lixeira de lá E na Lixeira do Physiq;
  2. restaurada no Physiq, ela sai da /lixeira do site antigo (e volta no banco);
  3. o modelo de meta com ★ aparece no /favoritos do site antigo E nos Modelos do Physiq; a ★ tirada no Physiq some de lá também;
  4. os 7 impressos abrem nas 2 telas.
Tudo o que é criado é apagado no fim (contagens iguais antes/depois).
Uso: python3 e2e/w26/nutri_antigo.py --url https://physiqnutri-staging.vercel.app --base https://physiqcalc-staging.vercel.app --schema staging --prefixo staging
     (produção: --url https://nutri.physiqcalc.com.br --base https://physiqcalc.com.br --schema public --prefixo prod)
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

from playwright.sync_api import sync_playwright  # noqa: E402

p = B.p
CHAVE_LS_NUTRI = f"sb-{B.PRINCIPAL_REF}-auth-token"


def contar(S: str) -> dict:
    return B.sql_principal(f"""select (select count(*) from {S}.pacientes)::int pacientes, (select count(*) from {S}.anamneses)::int anamneses,
                                      (select count(*) from {S}.modelos_meta)::int modelos_meta, (select count(*) from {S}.avisos)::int avisos,
                                      (select count(*) from {S}.conta_eventos)::int conta_eventos""")[0]


def rest(S: str, metodo: str, tabela: str, filtro: str, corpo=None) -> tuple[int, object]:
    tok = B.token("nutri-legado")
    cab = {"apikey": B.anon(B.PRINCIPAL_REF), "Authorization": f"Bearer {tok}", "Accept-Profile": S, "Content-Profile": S, "Prefer": "return=representation"}
    st, r, _ = B.http(metodo, f"{B.PRINCIPAL_URL}/rest/v1/{tabela}?{filtro}", corpo, cab, timeout=90)
    return st, r


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True, help="o site antigo do Nutri")
    ap.add_argument("--base", required=True, help="o Physiq")
    ap.add_argument("--schema", required=True, choices=["public", "staging"])
    ap.add_argument("--prefixo", required=True)
    a = ap.parse_args()
    S = a.schema
    B.ESTADO["schema"] = S
    antigo, physiq = a.url.rstrip("/"), a.base.rstrip("/")
    B.saude_ok("lado a lado W26")
    nutri = B.uid("nutri-legado")
    leg = B.sql_principal(f"select id::text from {S}.contas where dono_id = '{nutri}' and origem = 'legado_nutri' limit 1")
    p.check(bool(leg), f"a conta do legado da nutri de teste existe ({S})")
    if not leg:
        return p.fim()
    antes = contar(S)
    carimbo = B.carimbo()
    pid = anamnese = meta = None
    try:
        st, r = rest(S, "POST", "pacientes", "select=id,nome", {"nome": f"W26 Lado a lado {carimbo}", "nutricionista_id": nutri,
                                                              "email": f"w26.lado.{carimbo}.teste.claude@physiqnutri.app"})
        p.check(st == 201, f"aluno DESCARTÁVEL de teste criado pelo REST (as colunas do site antigo) → {st}")
        if st != 201:
            return p.fim()
        pid = r[0]["id"]  # type: ignore[index]
        st, r = rest(S, "POST", "anamneses", "select=id", {"nutricionista_id": nutri, "paciente_id": pid, "titulo": f"Anamnese lado a lado {carimbo}"})
        anamnese = r[0]["id"] if st == 201 else None  # type: ignore[index]
        st2, _ = rest(S, "PATCH", "anamneses", f"id=eq.{anamnese}", {"deleted_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()})
        p.check(bool(anamnese) and st2 == 200, "1. anamnese criada e EXCLUÍDA pelo caminho do site antigo (PATCH deleted_at)")
        st, r = rest(S, "POST", "modelos_meta", "select=id", {"nutricionista_id": nutri, "titulo": f"Meta lado a lado {carimbo}", "dias_semana": [1, 3, 5], "favorito": True})
        meta = r[0]["id"] if st == 201 else None  # type: ignore[index]
        p.check(bool(meta), "3. modelo de meta com ★ criado pela nutri")
        sess = B.B5.sessao("nutri-legado")
        with sync_playwright() as pw:
            nav = pw.chromium.launch(args=["--no-sandbox"])
            ctx = nav.new_context(viewport={"width": 1280, "height": 883}, device_scale_factor=2, locale="pt-BR", timezone_id="America/Sao_Paulo", service_workers="block")
            pv = ctx.new_page()
            pv.goto(f"{antigo}/entrar/nutricionista", wait_until="domcontentloaded")
            pv.evaluate("([k, v]) => localStorage.setItem(k, v)", [CHAVE_LS_NUTRI, json.dumps(sess)])

            def antigo_lixeira_tem() -> bool:
                pv.goto(f"{antigo}/lixeira?tipo=anamnese", wait_until="domcontentloaded")
                pv.wait_for_selector("[data-pagina-lixeira]", timeout=90000)
                pv.wait_for_timeout(2500)
                return pv.locator(f'[data-item-lixeira="anamnese:{anamnese}"]').count() == 1

            p.check(antigo_lixeira_tem(), "1. a anamnese excluída aparece na /lixeira do SITE ANTIGO")
            pv.screenshot(path=str(B.PRINTS / f"{a.prefixo}_nutri_antigo_lixeira.png"))

            c = B.Caso(nav, physiq, a.prefixo, "lado_physiq_lixeira")
            c.entrar("nutri-legado", "/painel/lixeira?tipo=anamnese")
            c.fechar_avisos()
            linha = c.pg.locator(f'[data-item-lixeira="anamnese:{anamnese}"]')
            p.check(c.esperar(lambda: linha.count() == 1, 90), "1. e na Lixeira do PHYSIQ (a mesma linha)")
            if linha.count():
                linha.locator("[data-btn-restaurar]").click()
                p.check(c.esperar(lambda: linha.count() == 0, 30), "2. restaurada no Physiq: sai da lista")
            dl = B.sql_principal(f"select deleted_at from {S}.anamneses where id = '{anamnese}'")
            p.check(bool(dl) and dl[0]["deleted_at"] is None, "2. no banco a anamnese voltou")
            c.fim()
            p.check(not antigo_lixeira_tem(), "2. e saiu da /lixeira do SITE ANTIGO")

            pv.goto(f"{antigo}/favoritos", wait_until="domcontentloaded")
            pv.wait_for_selector("[data-pagina-favoritos]", timeout=90000)
            pv.wait_for_timeout(2500)
            p.check(pv.locator(f'[data-favorito="meta:{meta}"]').count() == 1, "3. a meta ★ aparece no /favoritos do SITE ANTIGO")
            pv.screenshot(path=str(B.PRINTS / f"{a.prefixo}_nutri_antigo_favoritos.png"))
            c2 = B.Caso(nav, physiq, a.prefixo, "lado_physiq_modelos")
            c2.entrar("nutri-legado", "/painel/modelos?tipo=meta")
            c2.fechar_avisos()
            item = c2.pg.locator(f'[data-modelo="meta:{meta}"]')
            p.check(c2.esperar(lambda: item.count() == 1, 90), "3. e nos Modelos do PHYSIQ")
            if item.count():
                item.locator("[data-btn-desfavoritar]").click()
                p.check(c2.esperar(lambda: item.count() == 0, 30), "3. ★ tirada no Physiq: sai dos Modelos")
            c2.fim()
            pv.goto(f"{antigo}/favoritos", wait_until="domcontentloaded")
            pv.wait_for_selector("[data-pagina-favoritos]", timeout=90000)
            pv.wait_for_timeout(2500)
            p.check(pv.locator(f'[data-favorito="meta:{meta}"]').count() == 0, "3. e some do /favoritos do SITE ANTIGO")

            pv.goto(f"{antigo}/impressos", wait_until="domcontentloaded")
            ok_antigo = True
            try:
                pv.wait_for_selector('[data-pagina-impressos][data-total-impressos="7"]', timeout=90000)
            except Exception:  # noqa: BLE001
                ok_antigo = False
            c3 = B.Caso(nav, physiq, a.prefixo, "lado_physiq_impressos")
            c3.entrar("nutri-legado", "/painel/impressos")
            c3.fechar_avisos()
            ok_novo = c3.esperar(lambda: c3.pg.locator("[data-impresso]").count() == 7, 90)
            c3.fim()
            p.check(ok_antigo and ok_novo, "4. os 7 impressos abrem nas 2 telas (site antigo e Physiq)")
            ctx.close()
            nav.close()
    finally:
        if anamnese:
            B.sql_principal(f"delete from {S}.anamneses where id = '{anamnese}'")
        if meta:
            B.sql_principal(f"delete from {S}.modelos_meta where id = '{meta}'")
        if pid:
            B.sql_principal(f"delete from {S}.conta_eventos where depois ->> 'paciente_id' = '{pid}'")
            B.sql_principal(f"delete from {S}.pacientes where id = '{pid}'")
    depois = contar(S)
    p.check(antes == depois, f"contagens iguais antes/depois ({antes} → {depois})")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
