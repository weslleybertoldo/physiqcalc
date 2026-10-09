#!/usr/bin/env python3
"""Physiq W21 — a pré-consulta do SITE ANTIGO do PhysiqNutri lado a lado com a nova (as MESMAS tabelas e RPCs), com a nutri de teste
(nutri.teste.claude, legado_nutri — conta de teste):

  1. ela cria o formulário pelo REST com SÓ as colunas que o site antigo manda (o criarFormulario de lá — sem conta) → 201;
  2. o anônimo responde no /f/<slug> DO SITE ANTIGO (a página pública de lá) → "Respostas enviadas"; a resposta fica sem conta;
  3. o site antigo lista o formulário (/pre-consulta) e a resposta (/respostas-pre-consulta);
  4. o Physiq (Painel › Pré-consulta, a mesma nutri) mostra o MESMO formulário e a MESMA resposta;
  5. ela liga a resposta ao paciente dela NO PHYSIQ → o site antigo mostra "Paciente: <nome>" na mesma resposta;
  6. o /f/<slug> DO PHYSIQ abre o formulário criado no site antigo e grava a resposta (o link novo vale para os antigos).
Tudo o que é criado é apagado no fim (contagens iguais). Nenhum e-mail/WhatsApp (a pré-consulta não tem efeito colateral).
Uso: python3 e2e/w21/nutri_antigo.py --url https://physiqnutri-staging.vercel.app --base https://physiqcalc-staging.vercel.app --schema staging --prefixo staging
     (produção: --url https://nutri.physiqcalc.com.br --base https://physiqcalc.com.br --schema public --prefixo prod)
"""
from __future__ import annotations

import argparse
import json
import secrets
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

from playwright.sync_api import sync_playwright  # noqa: E402

p, q = B.p, B.q
CHAVE_LS_NUTRI = f"sb-{B.PRINCIPAL_REF}-auth-token"


def esperar(pg, seletor: str, timeout: float = 45) -> bool:
    try:
        pg.wait_for_selector(seletor, timeout=timeout * 1000)
        return True
    except Exception:  # noqa: BLE001
        return False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True, help="o site antigo do Nutri")
    ap.add_argument("--base", required=True, help="o Physiq")
    ap.add_argument("--schema", required=True, choices=["public", "staging"])
    ap.add_argument("--prefixo", required=True)
    ap.add_argument("--descartavel", action="store_true", help="usa um paciente DESCARTÁVEL de teste mesmo que a nutri já tenha um (o caminho de produção)")
    a = ap.parse_args()
    S = a.schema
    B.ESTADO["schema"] = S
    antigo, physiq = a.url.rstrip("/"), a.base.rstrip("/")
    B.saude_ok("nutri antigo W21")
    leg = B.conta_nutri_legado()
    antes = B.sql_principal(f"select (select count(*) from {S}.formularios_preconsulta)::int f, (select count(*) from {S}.respostas_preconsulta)::int r, "
                            f"(select count(*) from {S}.pacientes)::int pac")[0]
    pac = B.sql_principal(f"""select id::text, nome from {S}.pacientes where conta_id = {q(leg)} and deleted_at is null and email like '%teste.claude@%'
                               order by created_at limit 1""")
    descartavel = None
    if a.descartavel:
        pac = []
    if not pac:
        # produção: a nutri de teste não tem paciente — um DESCARTÁVEL de teste (e-mail único, sem telefone = nenhum WhatsApp), apagado no fim
        st, r = B.rest("nutri-legado", "POST", "pacientes", "", {"nome": f"{B.MARCA} Paciente {B.carimbo()}", "nutricionista_id": B.uid("nutri-legado"),
                                                                "email": f"w21.prod.{B.carimbo()}.teste.claude@physiqnutri.app"})
        p.check(st == 201, f"paciente DESCARTÁVEL de teste criado pela nutri ({S}) → {st}")
        if st == 201:
            descartavel = r[0]["id"]  # type: ignore[index]
            pac = [{"id": descartavel, "nome": r[0]["nome"]}]  # type: ignore[index]
    p.check(bool(pac), f"o paciente de TESTE da nutri do legado existe ({S})")
    pac = pac[0] if pac else None
    nutri = B.uid("nutri-legado")
    slug = "".join(secrets.choice("abcdefghijkmnpqrstuvwxyz23456789") for _ in range(8))
    titulo = f"{B.MARCA} Antigo lado a lado {B.carimbo()}"
    f_id = None
    erros: list[str] = []
    try:
        corpo = {"nutricionista_id": nutri, "titulo": titulo, "descricao": "Feito no site antigo", "origem": "personalizado", "origem_id": None, "slug": slug, "ativo": True,
                 "perguntas": [{"id": "p1", "texto": "Qual é o seu objetivo?", "tipo": "texto", "max": 4, "pontos_sim": 1, "opcoes": []},
                               {"id": "p2", "texto": "Já fez dieta antes?", "tipo": "sim_nao", "max": 4, "pontos_sim": 1, "opcoes": []}], "faixas": []}
        st, r = B.rest("nutri-legado", "POST", "formularios_preconsulta", "", corpo)
        p.check(st == 201 and r[0]["conta_id"] is None, f"1. a nutri cria pelo REST com SÓ as colunas do site antigo → {st} (sem conta)")  # type: ignore[index]
        f_id = r[0]["id"] if st == 201 else None  # type: ignore[index]
        sess = B.sessao("nutri-legado")
        with B_playwright() as nav:
            # 2. o anônimo responde no /f/ do SITE ANTIGO
            ctx = nav.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3.4, is_mobile=True, locale="pt-BR", timezone_id="America/Sao_Paulo")
            pg = ctx.new_page()
            pg.on("pageerror", lambda e: erros.append(f"antigo /f/: {str(e)[:160]}"))
            pg.goto(f"{antigo}/f/{slug}", wait_until="domcontentloaded")
            ok = esperar(pg, "[data-form-publico]")
            p.check(ok, "2. o /f/ DO SITE ANTIGO abre o formulário")
            if ok:
                pg.fill("[data-campo-nome-publico]", "Pessoa do Site Antigo")
                pg.fill("[data-campo-email-publico]", f"w21.antigo.{B.carimbo()}.teste.claude@physiqnutri.app")
                pg.fill('[data-campo-texto="0"]', "Ganhar massa")
                pg.click('[data-sim="1"]')
                pg.click("[data-btn-enviar-publico]")
                p.check(esperar(pg, "[data-formulario-enviado]"), "2. e grava a resposta ('Respostas enviadas')")
            ctx.close()
            r1 = B.sql_principal(f"select id::text, conta_id::text, nome from {S}.respostas_preconsulta where formulario_id = {q(f_id)} order by created_at limit 1")
            p.check(bool(r1) and r1[0]["conta_id"] is None, f"2. a resposta do formulário antigo fica sem conta, como hoje ({r1[0] if r1 else '-'})")
            r1 = r1[0] if r1 else {"id": "?"}
            # 3. o site antigo lista o formulário e a resposta
            ctx = nav.new_context(viewport={"width": 1280, "height": 883}, device_scale_factor=2, locale="pt-BR", timezone_id="America/Sao_Paulo")
            pa = ctx.new_page()
            pa.on("pageerror", lambda e: erros.append(f"antigo: {str(e)[:160]}"))
            pa.goto(f"{antigo}/entrar/nutricionista", wait_until="domcontentloaded")
            pa.evaluate("([k, v]) => localStorage.setItem(k, v)", [CHAVE_LS_NUTRI, json.dumps(sess)])
            pa.goto(f"{antigo}/pre-consulta", wait_until="domcontentloaded")
            p.check(esperar(pa, f'[data-formulario="{f_id}"]'), "3. o site antigo lista o formulário em Pré-consulta")
            pa.goto(f"{antigo}/respostas-pre-consulta", wait_until="domcontentloaded")
            p.check(esperar(pa, f'[data-resposta="{r1["id"]}"]'), "3. e a resposta em Respostas pré-consulta")
            pa.wait_for_timeout(600)
            pa.screenshot(path=str(B.PRINTS / f"{a.prefixo}_nutri_antigo_lado_a_lado_antes.png"))
            # 4. o Physiq mostra o mesmo formulário e a mesma resposta
            c = B.B5.Caso(nav, physiq, a.prefixo, "antigo-physiq", desktop=True)
            c.entrar("nutri-legado", "/painel/pre-consulta")
            c.fechar_avisos()
            p.check(c.esperar(lambda: c.tem(f'[data-formulario="{f_id}"]'), 90), "4. o Physiq mostra o MESMO formulário (Formulários)")
            c.ir("/painel/pre-consulta?aba=respostas")
            p.check(c.esperar(lambda: c.tem(f'[data-resposta="{r1["id"]}"]'), 60), "4. e a MESMA resposta (Respostas)")
            # 5. liga no Physiq → o site antigo mostra o paciente
            if pac:
                c.pg.locator(f'[data-resposta="{r1["id"]}"] [data-btn-ligar-resposta]').click()
                # hml-14b (B19): a lista do "Ligar" é a busca do banco (o SeletorDeAluno) — acha o paciente pelo nome
                c.pg.locator('[data-seletor-aluno="ligar"] [data-seletor-aluno-busca]').fill(pac["nome"])
                c.esperar(lambda: c.tem(f'[data-seletor-aluno="ligar"] [data-opcao-aluno="{pac["id"]}"]'), 20)
                c.pg.locator(f'[data-seletor-aluno="ligar"] [data-opcao-aluno="{pac["id"]}"]').click()
                c.pg.locator("[data-btn-salvar-ligar]").click()
                ok = c.esperar(lambda: c.pg.locator(f'[data-resposta="{r1["id"]}"]').get_attribute("data-resposta-aluno") == pac["id"], 30)
                p.check(ok, f"5. ligou ao paciente dela ({pac['nome']}) no Physiq")
                c.pg.wait_for_timeout(800)
                c.print("nutri_antigo_physiq_respostas")
                pa.goto(f"{antigo}/respostas-pre-consulta", wait_until="domcontentloaded")
                ok = esperar(pa, f'[data-resposta="{r1["id"]}"][data-resposta-paciente="{pac["id"]}"]')
                p.check(ok, "5. o site antigo mostra a resposta ligada ao mesmo paciente")
                pa.wait_for_timeout(600)
                pa.screenshot(path=str(B.PRINTS / f"{a.prefixo}_nutri_antigo_lado_a_lado_depois.png"))
            c.fim()
            ctx.close()
            # 6. o /f/ do Physiq abre o formulário criado no site antigo
            ctx = nav.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3.4, is_mobile=True, locale="pt-BR", timezone_id="America/Sao_Paulo")
            pg = ctx.new_page()
            pg.on("pageerror", lambda e: erros.append(f"physiq /f/: {str(e)[:160]}"))
            pg.goto(f"{physiq}/f/{slug}", wait_until="domcontentloaded")
            ok = esperar(pg, "[data-form-publico]", 60)
            p.check(ok, "6. o /f/ DO PHYSIQ abre o formulário criado no site antigo")
            if ok:
                pg.fill("[data-campo-nome-publico]", "Pessoa pelo Physiq")
                pg.fill('[data-campo-texto="0"]', "Saúde")
                pg.click("[data-btn-enviar-publico]")
                p.check(esperar(pg, "[data-formulario-enviado]"), "6. e grava a resposta")
            ctx.close()
            n = B.sql_principal(f"select count(*)::int n from {S}.respostas_preconsulta where formulario_id = {q(f_id)}")[0]["n"]
            p.check(n == 2, f"6. o formulário antigo tem as 2 respostas (site antigo + Physiq) → {n}")
    finally:
        if f_id:
            B.sql_principal(f"delete from {S}.respostas_preconsulta where formulario_id = {q(f_id)}")
            B.sql_principal(f"delete from {S}.formularios_preconsulta where id = {q(f_id)}")
        if descartavel:
            B.sql_principal(f"delete from {S}.pacientes where id = {q(descartavel)}")
    depois = B.sql_principal(f"select (select count(*) from {S}.formularios_preconsulta)::int f, (select count(*) from {S}.respostas_preconsulta)::int r, "
                             f"(select count(*) from {S}.pacientes)::int pac")[0]
    p.check(antes == depois, f"limpeza: contagens iguais antes/depois ({antes} × {depois})")
    p.check(not erros, f"sem erro de página ({erros[:3]})")
    return p.fim()


class B_playwright:
    """Chromium do cache (--no-sandbox), aberto e fechado com o bloco."""

    def __enter__(self):
        self._pw = sync_playwright().start()
        self.nav = self._pw.chromium.launch(args=["--no-sandbox"])
        return self.nav

    def __exit__(self, *_):
        try:
            self.nav.close()
        finally:
            self._pw.stop()


if __name__ == "__main__":
    t0 = time.time()
    r = main()
    print(f"W21 · nutri antigo · {time.time() - t0:.0f}s")
    sys.exit(r)
