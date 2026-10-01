#!/usr/bin/env python3
"""Physiq W19 — o SITE ANTIGO do Nutri e o Painel › Financeiro do Physiq lado a lado (as mesmas tabelas até a W28):

  1. site antigo (/financeiro): a nutri registra uma entrada (ligada a um paciente DESCARTÁVEL dela) e uma saída — grava sem conta_id,
     como sempre;
  2. Physiq (/painel/financeiro › Lançamentos, o mesmo período padrão): a nutri vê os MESMOS números do site antigo (entradas, saídas,
     saldo e a contagem do período) e a entrada nova;
  3. Physiq: "Emitir recibo" da entrada → PDF; site antigo (/pacientes/<id>/financeiro): o PDF do MESMO recibo → texto igual, linha a
     linha, tirando a marca (PHYSIQNUTRI → PHYSIQ) e a hora de emissão;
  4. site antigo: recibo avulso → Physiq (Recibos) baixa o PDF dele → igual também;
  5. tudo o que o teste criou é apagado (paciente, lançamentos, recibos) e as contagens da nutri voltam ao que eram.

Conta: nutri-legado (nutri.teste.claude@physiqnutri.app — dona + nutricionista da conta legado_nutri dela).
Uso: python3 e2e/w19/nutri_antigo.py --base http://localhost:5173 --nutri https://physiqnutri-staging.vercel.app --prefixo local [--schema staging]
     produção: --base https://physiqcalc.com.br --nutri https://nutri.physiqcalc.com.br --prefixo prod --schema public
"""
from __future__ import annotations

import argparse
import json
import random
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

from playwright.sync_api import sync_playwright  # noqa: E402

p = B.p
CONTA = "nutri-legado"
MARCA = "W19 antigo"


def cpf_aleatorio() -> str:
    while True:
        base = [random.randint(0, 9) for _ in range(9)]
        if len(set(base)) == 1:
            continue
        for _ in range(2):
            s = sum(v * k for v, k in zip(base, range(len(base) + 1, 1, -1)))
            d = (s * 10) % 11
            base.append(0 if d == 10 else d)
        return "".join(map(str, base))


def contagens(S: str, uid: str) -> dict:
    r = B.sql_principal(f"""select (select count(*) from {S}.transacoes where nutricionista_id = '{uid}') tx,
                                   (select count(*) from {S}.recibos where nutricionista_id = '{uid}') rec,
                                   (select count(*) from {S}.pacientes where nutricionista_id = '{uid}') pac""")[0]
    return {k: int(v) for k, v in r.items()}


def numeros(pg) -> dict:
    return {k: pg.locator(f"[data-total-{k}]").first.get_attribute(f"data-total-{k}") for k in ("entradas", "saidas", "saldo")} | {
        "contagem": pg.locator("[data-contagem]").first.get_attribute("data-contagem-periodo")}


def esperar(pg, cond, timeout: float) -> bool:
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if cond():
                return True
        except Exception:  # noqa: BLE001
            pass
        pg.wait_for_timeout(500)
    return False


def iguais_sem_marca(antigo: list[str], novo: list[str]) -> bool:
    hora = re.compile(r"Emitido em \d\d/\d\d/\d{4} \d\d:\d\d")
    a = [hora.sub("Emitido em —", t.replace("PHYSIQNUTRI", "PHYSIQ")) for t in antigo]
    n = [hora.sub("Emitido em —", t) for t in novo]
    if a != n:
        print("   antigo:", a[:16], "\n   physiq:", n[:16], flush=True)
    return a == n


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--nutri", required=True)
    ap.add_argument("--prefixo", required=True)
    ap.add_argument("--schema", default="staging", choices=["staging", "public"])
    a = ap.parse_args()
    S = a.schema
    B.ESTADO["schema"] = S
    base, nutri = a.base.rstrip("/"), a.nutri.rstrip("/")
    sess = B.sessao(CONTA)
    tok, uid = sess["access_token"], sess["user"]["id"]
    outras = B.sql_principal(f"select count(distinct conta_id) as n from {S}.transacoes where nutricionista_id = '{uid}' and conta_id is not null and deleted_at is null")
    antes = contagens(S, uid)
    nome_pac = f"Paciente Financeiro W19 {int(time.time()) % 100000}"
    st, pac = B.rest(tok, "POST", "pacientes", corpo={"nome": nome_pac, "nutricionista_id": uid, "cpf": cpf_aleatorio()})
    assert st == 201, ("paciente", st, pac)
    pid = pac[0]["id"]
    erros: list[str] = []
    t0 = time.time()
    try:
        with sync_playwright() as pw:
            nav = pw.chromium.launch(args=["--no-sandbox"])
            # ---------- 1. site antigo: uma entrada do paciente e uma saída ----------
            cv = nav.new_context(viewport={"width": 1280, "height": 883}, device_scale_factor=2, locale="pt-BR", timezone_id="America/Sao_Paulo",
                                 accept_downloads=True)
            pv = cv.new_page()
            pv.on("pageerror", lambda e: erros.append(f"antigo: {str(e)[:160]}"))
            pv.goto(f"{nutri}/entrar/nutricionista", wait_until="domcontentloaded")
            pv.evaluate("([k, v]) => localStorage.setItem(k, v)", [f"sb-{B.PRINCIPAL_REF}-auth-token", json.dumps(sess)])
            pv.goto(f"{nutri}/financeiro", wait_until="domcontentloaded")
            pv.wait_for_selector("[data-pagina-financeiro][data-atualizando='0']", timeout=90000)
            for tipo, desc, valor, com_paciente in (("entrada", f"Consulta nutricional {MARCA}", "180", True), ("saida", f"Material {MARCA}", "45,50", False)):
                pv.locator("[data-btn-nova-movimentacao]").click()
                pv.wait_for_selector('[data-modal-movimentacao="novo"]', timeout=20000)
                pv.locator(f'[data-tipo-btn="{tipo}"]').click()
                pv.fill("[data-campo-descricao]", desc)
                pv.fill("[data-campo-valor]", valor)
                pv.locator("[data-campo-metodo]").select_option("pix")
                if com_paciente:
                    pv.locator("[data-campo-categoria]").select_option(label="Consulta")
                    pv.locator("[data-campo-paciente]").click()
                    pv.fill("[data-busca-paciente]", nome_pac)
                    pv.locator(f'[data-opcao-paciente="{pid}"]').click()
                pv.locator("[data-btn-salvar-movimentacao]").click()
                ok = esperar(pv, lambda d=desc: pv.locator("[data-transacao]", has_text=d).count() == 1, 30)
                p.check(ok, f"1. site antigo: grava a {tipo} \"{desc}\"")
            db = B.sql_principal(f"select count(*) as n, count(*) filter (where conta_id is null) as sem_conta from {S}.transacoes where nutricionista_id = '{uid}' and descricao like '%{MARCA}%' and deleted_at is null")[0]
            p.check(int(db["n"]) == 2 and int(db["sem_conta"]) == 2, f"1. o site antigo grava sem conta_id, como sempre ({db})")
            pv.wait_for_timeout(1500)
            velho = numeros(pv)
            pv.screenshot(path=str(B.PRINTS / f"{a.prefixo}_nutri_antigo_financeiro.png"))

            # ---------- 2. Physiq: os mesmos números ----------
            cn = nav.new_context(viewport={"width": 1280, "height": 883}, device_scale_factor=2, locale="pt-BR", timezone_id="America/Sao_Paulo",
                                 service_workers="block", accept_downloads=True)
            pn = cn.new_page()
            pn.on("pageerror", lambda e: erros.append(f"physiq: {str(e)[:160]}"))
            pn.on("dialog", lambda d: d.accept())
            pn.goto(f"{base}/privacidade", wait_until="domcontentloaded")
            pn.evaluate("""([k, v]) => { localStorage.setItem(k, v); localStorage.setItem('physiq_pendencia_avisada_em', new Date().toLocaleDateString('pt-BR'));
                localStorage.setItem('physiqcalc-pwa-dismissed', 'true'); }""", [B.B5.CHAVE_PRINCIPAL, json.dumps(B.B5.sessao(CONTA))])  # sessão própria: as 2 páginas não dividem o token de renovação
            pn.goto(f"{base}/painel/financeiro?aba=lancamentos", wait_until="domcontentloaded")
            ok = esperar(pn, lambda: pn.locator("[data-transacao]", has_text=f"Consulta nutricional {MARCA}").count() == 1, 90)
            if pn.locator("[data-aviso-mudanca-ok]").count():
                pn.locator("[data-aviso-mudanca-ok]").click()
            p.check(ok, "2. Physiq: a entrada gravada no site antigo aparece em Lançamentos")
            pn.wait_for_timeout(1500)
            novo = numeros(pn)
            p.check(velho == novo and int(outras[0]["n"]) <= 1,
                    f"2. os MESMOS números do site antigo no mesmo período (entradas, saídas, saldo, contagem): {velho} × {novo}")
            pn.screenshot(path=str(B.PRINTS / f"{a.prefixo}_nutri_physiq_lancamentos.png"))

            # ---------- 3. recibo emitido no Physiq a partir da entrada × o mesmo recibo no site antigo ----------
            linha = pn.locator("[data-transacao]", has_text=f"Consulta nutricional {MARCA}").first
            linha.locator("[data-btn-emitir-recibo]").click()
            esperar(pn, lambda: pn.locator('[data-modal-recibo="movimentacao"]').count() == 1 and pn.locator("[data-campo-modelo-recibo] option").count() > 0, 30)
            pdf_novo = B.baixar(pn, lambda: pn.locator("[data-btn-salvar-recibo]").click(), f"{a.prefixo}_nutri_physiq_recibo")
            rec = B.sql_principal(f"select id::text, numero, texto from {S}.recibos where paciente_id = '{pid}' and deleted_at is null order by created_at")
            p.check(len(rec) == 1 and pdf_novo is not None, f"3. Physiq: recibo nº {rec[0]['numero'] if rec else '?'} emitido da entrada e o PDF baixado")
            pv.goto(f"{nutri}/pacientes/{pid}/financeiro", wait_until="domcontentloaded")
            esperar(pv, lambda: pv.locator("[data-recibo]").count() == 1, 60)
            pdf_antigo = B.baixar(pv, lambda: pv.locator("[data-recibo] [data-btn-pdf-recibo]").first.click(), f"{a.prefixo}_nutri_antigo_recibo")
            if pdf_antigo and pdf_novo:
                ta, tn = B.textos_pdf(pdf_antigo), B.textos_pdf(pdf_novo)
                p.check(iguais_sem_marca(ta, tn), f"3. o recibo emitido a partir da entrada sai IGUAL ao de hoje, tirando a marca ({len(ta)} × {len(tn)} trechos)")
                p.check(any("PHYSIQNUTRI" in t for t in ta) and tn[:1] == ["PHYSIQ · RECIBO"] and "Nutricionista" in tn and "Paciente:" in " ".join(tn),
                        "3. a marca: PHYSIQNUTRI no antigo, PHYSIQ no Physiq (o resto — Paciente, Nutricionista — igual)")
            pv.screenshot(path=str(B.PRINTS / f"{a.prefixo}_nutri_antigo_recibos.png"))

            # ---------- 4. recibo avulso emitido no site antigo × o PDF dele no Physiq ----------
            pv.locator("[data-btn-novo-recibo]").click()
            pv.wait_for_selector('[data-modal-recibo="avulso"]', timeout=20000)
            esperar(pv, lambda: pv.locator("[data-campo-modelo-recibo] option").count() > 0, 20)
            pv.fill("[data-campo-valor-recibo]", "250")
            pdf_antigo2 = B.baixar(pv, lambda: pv.locator("[data-btn-salvar-recibo]").click(), f"{a.prefixo}_nutri_antigo_recibo_avulso")
            rec2 = B.sql_principal(f"select numero from {S}.recibos where paciente_id = '{pid}' and deleted_at is null and transacao_id is null")
            p.check(len(rec2) == 1 and pdf_antigo2 is not None, "4. site antigo: recibo avulso emitido (e o PDF de lá)")
            pn.goto(f"{base}/painel/financeiro?aba=recibos", wait_until="domcontentloaded")
            numero = rec2[0]["numero"] if rec2 else 0
            alvo = pn.locator(f'[data-recibo-id]', has_text=nome_pac).filter(has_text=f"Nº {int(numero):04d}")
            esperar(pn, lambda: alvo.count() == 1, 60)
            pdf_novo2 = B.baixar(pn, lambda: alvo.first.locator("[data-btn-pdf-recibo]").click(), f"{a.prefixo}_nutri_physiq_recibo_avulso")
            if pdf_antigo2 and pdf_novo2:
                p.check(iguais_sem_marca(B.textos_pdf(pdf_antigo2), B.textos_pdf(pdf_novo2)),
                        "4. o PDF do recibo do site antigo baixado no Physiq é igual ao de lá, tirando a marca")
            pn.screenshot(path=str(B.PRINTS / f"{a.prefixo}_nutri_physiq_recibos.png"))
            nav.close()
    finally:
        B.sql_principal(f"""update {S}.transacoes set recibo_id = null where nutricionista_id = '{uid}' and (paciente_id = '{pid}' or descricao like '%{MARCA}%');
                             delete from {S}.recibos where paciente_id = '{pid}';
                             delete from {S}.transacoes where nutricionista_id = '{uid}' and (paciente_id = '{pid}' or descricao like '%{MARCA}%');
                             delete from {S}.pacientes where id = '{pid}';""")
        depois = contagens(S, uid)
        p.check(depois == antes, f"5. o que o teste criou foi apagado: contagens da nutri antes = depois ({antes} → {depois})")
    p.check(not erros, f"sem erro de página nos 2 sites ({erros[:3]})")
    print(f"\nW19 · site antigo do Nutri × Physiq ({a.prefixo}) · {time.time() - t0:.0f}s")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
