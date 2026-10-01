#!/usr/bin/env python3
"""Physiq W21 — prova de PRODUÇÃO da pré-consulta (physiqcalc.com.br + o site antigo nutri.physiqcalc.com.br), só com a conta de TESTE
"Nutri Teste Claude" (nutri.teste.claude@physiqnutri.app, legado_nutri) e um paciente DESCARTÁVEL de teste criado e apagado aqui:

  1. Painel › Pré-consulta abre (o item do menu e os 4 números); Novo formulário começa na origem; a partir do questionário
     Disbiose; "Copiar link" mostra https://physiqcalc.com.br/f/<slug>;
  2. o anônimo responde em https://physiqcalc.com.br/f/<slug> (celular, sem login) e vê o resultado;
  3. a resposta chega; "Ligar" sugere o paciente descartável (mesmo e-mail); IMPORTA → aplicação de questionário no Prontuário (W18);
  4. o site antigo (nutri.physiqcalc.com.br) mostra a mesma resposta, importada e com o paciente;
  5. o /f/ de um slug que não existe mostra a mensagem do Nutri.
Nenhum e-mail/WhatsApp/push (o paciente não tem telefone; a pré-consulta não tem efeito colateral). No fim apaga a aplicação, a
resposta, o formulário e o paciente — as contagens das 5 tabelas ficam iguais às de antes.
Uso: python3 e2e/w21/prod.py   (ensaio no staging: --site https://physiqcalc-staging.vercel.app --antigo https://physiqnutri-staging.vercel.app --schema staging --prefixo ensaio)
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402
import telas as T  # noqa: E402

from playwright.sync_api import sync_playwright  # noqa: E402

_ap = argparse.ArgumentParser()
_ap.add_argument("--site", default="https://physiqcalc.com.br")
_ap.add_argument("--antigo", default="https://nutri.physiqcalc.com.br")
_ap.add_argument("--schema", default="public", choices=["public", "staging"])
_ap.add_argument("--prefixo", default="prod")
_A = _ap.parse_args()
S = _A.schema
T.S = S
B.ESTADO["schema"] = S
p, q = B.p, B.q
SITE = _A.site.rstrip("/")
ANTIGO = _A.antigo.rstrip("/")
T.ESTADO.update(base=SITE, prefixo=_A.prefixo, site=SITE, antigo=ANTIGO, massa={})


def contagens() -> dict:
    return B.sql_principal(f"""select (select count(*) from {S}.formularios_preconsulta)::int formularios, (select count(*) from {S}.respostas_preconsulta)::int respostas,
                                      (select count(*) from {S}.anamneses)::int anamneses, (select count(*) from {S}.respostas_questionario)::int aplicacoes,
                                      (select count(*) from {S}.pacientes)::int pacientes""")[0]


def main() -> int:
    B.saude_ok("prova de prod W21")
    antes = contagens()
    print("   contagens antes:", antes, flush=True)
    email_pac = f"w21.prod.{B.carimbo()}.teste.claude@physiqnutri.app"
    st, r = B.rest("nutri-legado", "POST", "pacientes", "", {"nome": f"{B.MARCA} Paciente Prod {B.carimbo()}", "nutricionista_id": B.uid("nutri-legado"), "email": email_pac})
    p.check(st == 201, f"0. paciente DESCARTÁVEL de teste (sem telefone) criado pela nutri de teste → {st}")
    pac = r[0] if st == 201 else None  # type: ignore[index]
    f: dict = {}
    resp: dict = {}
    try:
        with sync_playwright() as pw:
            nav = pw.chromium.launch(args=["--no-sandbox"])
            c = T.abrir(nav, "prod", "nutri-legado", "/painel/pre-consulta")
            c.esperar(lambda: c.tem("[data-cartao-formularios]") and not c.tem("[data-carregando-formularios]"), 40)
            p.check(c.pg.locator('[data-nav="/painel/pre-consulta"]').count() == 1 and c.tem("[data-resumo-preconsulta]"), "1. o item do menu e os 4 números")
            c.pg.locator("[data-btn-novo-formulario]").first.click()
            p.check(c.esperar(lambda: c.tem('[data-etapa-formulario="origem"]'), 15), "1. Novo formulário começa na origem (nutricionista)")
            c.pg.locator('[data-origem="questionario"]').click()
            c.esperar(lambda: c.tem("[data-campo-origem-questionario]"), 10)
            ops = c.pg.locator("[data-campo-origem-questionario] option").evaluate_all("els => els.map(e => [e.value, e.textContent])")
            disb = next((v for v, t in ops if v and "Disbiose" in (t or "")), None)
            c.pg.locator("[data-campo-origem-questionario]").select_option(disb)
            c.esperar(lambda: c.pg.locator("[data-faixa]").count() == 3, 10)
            f = T.criar_formulario(c, "prod", f"{B.MARCA} Prova de produção {B.carimbo()}")
            T.copiar_link(c, "prod", f)
            T.ocioso(c)
            T.sem_toast(c)
            c.print("tela6_formularios")

            def preencher(pg):
                for i in range(10):
                    pg.locator(f'[data-escala-valor="{i}-{2 if i < 6 else 1}"]').click()

            T.responder_no_celular(nav, "prod", f["slug"], "Paciente Prod W21", email_pac, preencher, None, "publico_resultado")
            resp = T.ultima_resposta(f["id"])
            p.check(resp.get("conta_id") is not None and float(resp.get("pontuacao") or 0) == 16, f"2. gravada na conta dela, 16 pontos ({resp.get('pontuacao')})")
            c.ir("/painel/pre-consulta?aba=respostas")
            p.check(c.esperar(lambda: c.tem(f'[data-resposta="{resp.get("id")}"]'), 40), "3. a resposta chegou")
            T.ocioso(c)
            c.pg.locator(f'[data-resposta="{resp.get("id")}"] [data-btn-ligar-resposta]').click()
            ok = c.esperar(lambda: c.tem(f'[data-sugestao-aluno="{pac["id"] if pac else "?"}"]'), 20)
            p.check(ok, "3. sugere o paciente descartável (mesmo e-mail)")
            c.pg.locator("[data-btn-usar-sugestao]").click()
            c.pg.locator("[data-btn-salvar-ligar]").click()
            c.esperar(lambda: c.pg.locator(f'[data-resposta="{resp.get("id")}"]').get_attribute("data-resposta-aluno") == (pac or {}).get("id"), 30)
            T.ocioso(c)
            c.pg.locator(f'[data-resposta="{resp.get("id")}"] [data-btn-importar-resposta]').click()
            c.esperar(lambda: c.tem("[data-modal-importar]"), 10)
            c.pg.locator("[data-btn-confirmar-importar]").click()
            ok = c.esperar(lambda: c.pg.locator(f'[data-resposta="{resp.get("id")}"]').get_attribute("data-resposta-importada") == "1", 40)
            p.check(ok, "3. IMPORTADA")
            resp = T.ultima_resposta(f["id"])
            T.ocioso(c)
            T.abrir_detalhe(c, resp.get("id"))
            T.sem_toast(c)
            c.print("tela7_respostas")
            c.pg.locator(f'[data-resposta="{resp.get("id")}"] [data-link-importada]').click()
            ok = c.esperar(lambda: c.tem(f'[data-aplicacao="{resp.get("importada_id")}"]'), 60)
            p.check(ok, "3. Prontuário › Questionários mostra a aplicação importada (W18)")
            T.sem_toast(c)
            c.print("prontuario_questionario_importado")
            c.fim()
            # 4. o site antigo
            ctx = nav.new_context(viewport={"width": 1280, "height": 883}, device_scale_factor=2, locale="pt-BR", timezone_id="America/Sao_Paulo")
            pa = ctx.new_page()
            pa.goto(f"{ANTIGO}/entrar/nutricionista", wait_until="domcontentloaded")
            pa.evaluate("([k, v]) => localStorage.setItem(k, v)", [T.CHAVE_LS_NUTRI, json.dumps(B.sessao("nutri-legado"))])
            pa.goto(f"{ANTIGO}/respostas-pre-consulta", wait_until="domcontentloaded")
            ok = T.esperar_pg(pa, lambda: pa.locator(f'[data-resposta="{resp.get("id")}"][data-resposta-importada="1"][data-resposta-paciente="{(pac or {}).get("id")}"]').count() > 0, 60)
            p.check(ok, "4. o site antigo mostra a mesma resposta, importada e com o paciente")
            T.print_pg(pa, "nutri_antigo_respostas")
            ctx.close()
            # 5. o /f/ inexistente
            ctx, pg, _e = T.publico(nav, "prod")
            pg.goto(f"{SITE}/f/naoexiste", wait_until="domcontentloaded")
            p.check(T.esperar_pg(pg, lambda: pg.locator("[data-formulario-nao-encontrado]").count() > 0, 40), "5. /f/ inexistente: a mensagem do Nutri")
            ctx.close()
            nav.close()
    finally:
        if resp.get("importada_id"):
            B.sql_principal(f"delete from {S}.respostas_questionario where id = {q(resp['importada_id'])}")
        if f.get("id"):
            B.sql_principal(f"delete from {S}.respostas_preconsulta where formulario_id = {q(f['id'])}")
            B.sql_principal(f"delete from {S}.formularios_preconsulta where id = {q(f['id'])}")
        if pac:
            B.sql_principal(f"delete from {S}.pacientes where id = {q(pac['id'])}")
    depois = contagens()
    p.check(antes == depois, f"limpeza: contagens iguais antes/depois ({antes} × {depois})")
    return p.fim()


if __name__ == "__main__":
    t0 = time.time()
    r = main()
    print(f"W21 · prova de produção · {time.time() - t0:.0f}s")
    sys.exit(r)
