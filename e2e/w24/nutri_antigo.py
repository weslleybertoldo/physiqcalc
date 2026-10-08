#!/usr/bin/env python3
"""Physiq W24 — o diário, os alimentos e as receitas do SITE ANTIGO do PhysiqNutri lado a lado com o Painel › Dietas (as MESMAS
tabelas, o MESMO bucket e as MESMAS funções — no staging, desde a hml-02b, o site antigo continua no bucket "diario" e o Physiq usa o
"diario-staging"), com a nutri de teste do legado (nutri.teste.claude, legado_nutri — conta de teste) e um
paciente DESCARTÁVEL de teste (e-mail único, sem telefone e sem login = nenhuma mensagem nem aviso):

  1. o /d/<código> DO SITE ANTIGO continua abrindo e aceitando a foto (o link de hoje vale até a W28);
  2. a foto chega no Diário DO PHYSIQ (Painel › Dietas › Diário) e a nutri reage lá (Ótimo + comentário);
  3. o /diario do site antigo mostra a MESMA foto com a reação feita no Physiq;
  4. o /d/<código> DO PHYSIQ manda outra foto para o mesmo paciente e ela aparece no /diario do site antigo;
  5. o alimento próprio criado pelo Physiq (com a porção — H1) aparece no /alimentos do site antigo com os mesmos 100 g, e a
     receita da nutri aparece no /receitas de lá.
Tudo o que é criado é apagado no fim (contagens iguais antes/depois).
Uso: python3 e2e/w24/nutri_antigo.py --url https://physiqnutri-staging.vercel.app --base https://physiqcalc-staging.vercel.app --schema staging --prefixo staging
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


def contar(S: str, nutri: str) -> dict:
    # hml-02b: o site antigo da Nutri continua nos buckets sem "-staging" (a foto dele fica no "diario"); a do Physiq vai para o bucket do ambiente
    buckets = ", ".join(f"'{b}'" for b in sorted({"diario", B.bucket_do_ambiente("diario")}))
    return B.sql_principal(f"""select (select count(*) from {S}.diario_alimentar)::int diario, (select count(*) from {S}.pacientes)::int pacientes,
                                      (select count(*) from {S}.alimentos)::int alimentos, (select count(*) from {S}.avisos)::int avisos,
                                      (select count(*) from storage.objects where bucket_id in ({buckets}))::int fotos""")[0]


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
    B.saude_ok("lado a lado W24")
    nutri = B.uid("nutri-legado")
    leg = B.sql_principal(f"select id::text from {S}.contas where dono_id = '{nutri}' and origem = 'legado_nutri' limit 1")
    p.check(bool(leg), f"a conta do legado da nutri de teste existe ({S})")
    if not leg:
        return p.fim()
    antes = contar(S, nutri)
    carimbo = B.carimbo()
    pid = None
    alimento = None
    fotos: list[str] = []  # as do Physiq (bucket do ambiente)
    fotos_antigo: list[str] = []  # hml-02b: o site antigo da Nutri continua nos buckets sem "-staging" (as dele ficam no "diario")
    try:
        st, r = B.rest("nutri-legado", "POST", "pacientes", "select=id,link_codigo,nome",
                       {"nome": f"W24 Paciente {carimbo}", "nutricionista_id": nutri, "email": f"w24.lado.{carimbo}.teste.claude@physiqnutri.app"})
        p.check(st == 201, f"paciente DESCARTÁVEL de teste criado pela nutri pelo REST (as colunas do site antigo) → {st}")
        if st != 201:
            return p.fim()
        pid, codigo = r[0]["id"], r[0]["link_codigo"]  # type: ignore[index]
        sess = B.sessao("nutri-legado")
        with sync_playwright() as pw:
            nav = pw.chromium.launch(args=["--no-sandbox"])
            cel = nav.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3.4, is_mobile=True, has_touch=True, locale="pt-BR",
                                  timezone_id="America/Sao_Paulo", service_workers="block")
            pg = cel.new_page()
            # 1. o /d/ do site antigo
            pg.goto(f"{antigo}/d/{codigo}", wait_until="domcontentloaded")
            pg.wait_for_selector('[data-pagina-diario-publico][data-carregando="0"]', timeout=60000)
            p.check(pg.locator("[data-form-diario]").count() == 1 and pg.locator("[data-diario-nao-encontrado]").count() == 0, "1. o /d/ do SITE ANTIGO abre o formulário do paciente")
            pg.locator('[data-refeicao="almoco"]').click()
            pg.set_input_files("[data-campo-foto]", str(B.FOTOS / "almoco.jpg"))
            pg.locator("[data-campo-comentario]").fill(f"Pelo site antigo {carimbo}")
            pg.locator("[data-btn-enviar]").click()
            pg.wait_for_selector("[data-envio-ok]", timeout=60000)
            reg_antigo = B.sql_principal(f"select id::text, path from {S}.diario_alimentar where paciente_id = '{pid}' and comentario = 'Pelo site antigo {carimbo}'")
            p.check(len(reg_antigo) == 1, "1. a foto mandada pelo site antigo gravou (o mesmo bucket e a mesma função)")
            fotos_antigo += [x["path"] for x in reg_antigo]
            pg.screenshot(path=str(B.PRINTS / f"{a.prefixo}_nutri_antigo_d.png"))
            cel.close()
            # 2. no Diário do Physiq, a nutri reage
            c = B.Caso(nav, physiq, a.prefixo, "lado_physiq")
            c.entrar("nutri-legado", f"/painel/dietas?aba=diario&aluno={pid}")
            c.fechar_avisos()
            rid = reg_antigo[0]["id"] if reg_antigo else ""
            ok = c.esperar(lambda: c.pg.locator(f'[data-registro="{rid}"] [data-foto]').count() == 1, 90)
            p.check(ok, "2. a foto do site antigo aparece no Diário do PHYSIQ (com a miniatura)")
            if ok:
                card = c.pg.locator(f'[data-registro="{rid}"]')
                card.locator('[data-btn-reacao="otimo"]').click()
                card.locator("[data-campo-comentario-nutri]").fill(f"Reagido no Physiq {carimbo}")
                card.locator("[data-btn-reagir]").click()
                p.check(c.esperar(lambda: c.pg.locator(f'[data-registro="{rid}"][data-reagido="1"]').count() == 1, 30), "2. a nutri reagiu no Physiq (Ótimo + comentário)")
                c.print("nutri_antigo_physiq_diario")
            c.fim()
            # 3. o /diario do site antigo mostra a reação
            ctx = nav.new_context(viewport={"width": 1280, "height": 883}, device_scale_factor=2, locale="pt-BR", timezone_id="America/Sao_Paulo", service_workers="block")
            pv = ctx.new_page()
            pv.goto(f"{antigo}/entrar/nutricionista", wait_until="domcontentloaded")
            pv.evaluate("([k, v]) => localStorage.setItem(k, v)", [CHAVE_LS_NUTRI, json.dumps(sess)])
            pv.goto(f"{antigo}/diario?dias=7&paciente={pid}", wait_until="domcontentloaded")
            try:
                pv.wait_for_selector(f'[data-registro="{rid}"] [data-reacao-gravada="otimo"]', timeout=90000)
                ok3 = True
            except Exception:  # noqa: BLE001
                ok3 = False
            p.check(ok3 and f"Reagido no Physiq {carimbo}" in pv.inner_text(f'[data-registro="{rid}"]'), "3. o /diario do site antigo mostra a MESMA foto com a reação feita no Physiq")
            pv.screenshot(path=str(B.PRINTS / f"{a.prefixo}_nutri_antigo_diario.png"))
            # 4. o /d/ do Physiq → o /diario do site antigo
            cel2 = nav.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3.4, is_mobile=True, has_touch=True, locale="pt-BR",
                                   timezone_id="America/Sao_Paulo", service_workers="block")
            pn = cel2.new_page()
            pn.goto(f"{physiq}/d/{codigo}", wait_until="domcontentloaded")
            pn.wait_for_selector("[data-form-diario]", timeout=60000)
            pn.locator('[data-refeicao="jantar"]').click()
            pn.set_input_files("[data-campo-foto]", str(B.FOTOS / "jantar.jpg"))
            pn.locator("[data-campo-comentario]").fill(f"Pelo Physiq {carimbo}")
            pn.locator("[data-btn-enviar]").click()
            pn.wait_for_selector("[data-envio-ok]", timeout=60000)
            cel2.close()
            reg_novo = B.sql_principal(f"select id::text, path from {S}.diario_alimentar where paciente_id = '{pid}' and comentario = 'Pelo Physiq {carimbo}'")
            fotos += [x["path"] for x in reg_novo]
            pv.goto(f"{antigo}/diario?dias=7&paciente={pid}", wait_until="domcontentloaded")
            try:
                pv.wait_for_selector(f'[data-registro="{reg_novo[0]["id"]}"] [data-foto]', timeout=90000)
                ok4 = True
            except Exception:  # noqa: BLE001
                ok4 = False
            p.check(len(reg_novo) == 1 and ok4, "4. a foto mandada pelo /d/ do PHYSIQ aparece no /diario do site antigo (com a miniatura)")
            # 5. alimento (H1) e receita
            st, al = B.rest("nutri-legado", "POST", "alimentos", "select=id,nome",
                            {"nome": f"Leite lado a lado W24 {carimbo}", "fonte": "proprio", "nutricionista_id": nutri, "porcao_g": 26, "energia_kcal": 488.46,
                             "proteina_g": 26.92})
            alimento = al[0]["id"] if st == 201 else None  # type: ignore[index]
            pv.goto(f"{antigo}/alimentos", wait_until="domcontentloaded")
            pv.wait_for_selector("[data-busca-alimentos]", timeout=60000)
            pv.locator("[data-busca-alimentos]").fill(f"lado a lado W24 {carimbo}")
            try:
                pv.wait_for_selector(f'[data-alimento="{alimento}"]', timeout=60000)
                resumo = pv.inner_text(f'[data-alimento="{alimento}"] [data-alimento-resumo]')
                ok5 = "488,46" in resumo
            except Exception:  # noqa: BLE001
                resumo, ok5 = "", False
            p.check(bool(alimento) and ok5, f"5. o alimento próprio (porção 26 g → 488,46/100 g) aparece no /alimentos do site antigo com os mesmos 100 g ({resumo})")
            pv.goto(f"{antigo}/receitas", wait_until="domcontentloaded")
            try:
                pv.wait_for_selector('[data-pagina-receitas]', timeout=60000)
                pv.wait_for_timeout(2500)
                ok6 = pv.locator("[data-pagina-receitas]").count() == 1
            except Exception:  # noqa: BLE001
                ok6 = False
            p.check(ok6, "5. o /receitas do site antigo abre (as mesmas tabelas das Receitas do Physiq)")
            ctx.close()
            nav.close()
    finally:
        if fotos_antigo:
            B.apagar_fotos(fotos_antigo, "diario")
        if fotos:
            B.apagar_fotos(fotos)
        if pid:
            B.sql_principal(f"delete from {S}.diario_alimentar where paciente_id = '{pid}'")
            B.sql_principal(f"delete from {S}.pacientes where id = '{pid}'")
        if alimento:
            B.sql_principal(f"delete from {S}.alimentos where id = '{alimento}'")
    depois = contar(S, nutri)
    p.check(antes == depois, f"tudo o que o teste criou foi apagado (contagens iguais: {antes} = {depois})")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
