#!/usr/bin/env python3
"""Physiq W18 — o SITE ANTIGO do Nutri continua lendo e escrevendo o prontuário (as mesmas tabelas, até a W28) e o PDF do prontuário
inteiro do Physiq sai igual ao de hoje.

Conta: nutri-legado (nutri.teste.claude@physiqnutri.app — dona + nutricionista da conta legado_nutri dela, como toda nutri do site
antigo). Um paciente DESCARTÁVEL dela é criado pela API e apagado no fim.

  1. site antigo: a nutri escreve um registro no Prontuário, registra uma consulta e sobe um anexo (PDF) — tudo grava;
  2. Physiq (aba Prontuário do mesmo aluno): o registro aparece como "Só nutricionistas" (o padrão das que vêm do Nutri), a consulta
     e o anexo também (URL assinada abre); a anotação "Equipe" escrita aqui aparece lá;
  3. PDF do prontuário inteiro: o texto do PDF do Physiq = o do site antigo, linha a linha, tirando a marca (PHYSIQNUTRI → PHYSIQ).

Uso: python3 e2e/w18/nutri_antigo.py --base http://localhost:5173 --nutri https://physiqnutri-staging.vercel.app --prefixo local [--schema staging]
     produção: --base https://physiqcalc.com.br --nutri https://nutri.physiqcalc.com.br --prefixo prod --schema public
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

from playwright.sync_api import sync_playwright  # noqa: E402

p = B.p
CONTA = "nutri-legado"
DOWNLOADS = B.SCRATCH / "downloads"


def textos_pdf(arq: Path) -> list[str]:
    bruto = arq.read_bytes().decode("latin-1")
    return [t[1:-1].replace("\\(", "(").replace("\\)", ")") for t in re.findall(r"\((?:\\.|[^\\)])*\)(?=\s*Tj)", bruto)]


def baixar(pg, clicar, nome: str) -> Path | None:
    DOWNLOADS.mkdir(parents=True, exist_ok=True)
    try:
        with pg.expect_download(timeout=60000) as d:
            clicar()
        destino = DOWNLOADS / f"{nome}_{d.value.suggested_filename}"
        d.value.save_as(str(destino))
        return destino
    except Exception as e:  # noqa: BLE001
        print(f"   download falhou: {e}", flush=True)
        return None


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
    st, pac = B.rest(tok, "POST", "pacientes", corpo={"nome": f"Paciente Prontuario W18 {int(time.time()) % 100000}", "nutricionista_id": uid,
                                                      "nascimento": "1990-05-20"})
    assert st == 201, ("paciente", st, pac)
    pid = pac[0]["id"]
    texto_antigo = f"Paciente relata melhora do sono ({B.MARCA}). Manter o plano por mais 2 semanas."
    texto_novo = f"Personal avisado do ajuste no jantar ({B.MARCA})."
    erros: list[str] = []
    t0 = time.time()
    try:
        with sync_playwright() as pw:
            nav = pw.chromium.launch(args=["--no-sandbox"])
            # ---------- 1. site antigo ----------
            cv = nav.new_context(viewport={"width": 1280, "height": 883}, device_scale_factor=2, locale="pt-BR", timezone_id="America/Sao_Paulo")
            pv = cv.new_page()
            pv.on("pageerror", lambda e: erros.append(f"antigo: {str(e)[:160]}"))
            pv.goto(f"{nutri}/entrar/nutricionista", wait_until="domcontentloaded")
            pv.evaluate("([k, v]) => localStorage.setItem(k, v)", [f"sb-{B.PRINCIPAL_REF}-auth-token", json.dumps(sess)])
            pv.goto(f"{nutri}/pacientes/{pid}/prontuario", wait_until="domcontentloaded")
            pv.wait_for_selector("[data-secao-prontuario]", timeout=90000)
            pv.locator("[data-btn-novo-registro]").first.click()
            pv.wait_for_selector('[data-modal-registro="novo"]', timeout=20000)
            pv.fill("[data-campo-texto-registro]", texto_antigo)
            pv.locator("[data-btn-salvar-registro]").click()
            ok = False
            for _ in range(40):
                if pv.locator("[data-registro]").count() == 1:
                    ok = True
                    break
                pv.wait_for_timeout(500)
            p.check(ok, "1. site antigo: a nutri grava um registro no Prontuário")
            db = B.sql_principal(f"select visibilidade, autor_papel from {S}.registros_prontuario where paciente_id = '{pid}' and deleted_at is null")
            p.check(db == [{"visibilidade": "nutricionistas", "autor_papel": "nutricionista"}], f"1. nasce \"Só nutricionistas\", assinada pela nutricionista ({db})")
            pdf_antigo = baixar(pv, lambda: pv.locator("[data-btn-pdf-prontuario]").click(), f"{a.prefixo}_antigo")
            p.check(pdf_antigo is not None, "1. site antigo: PDF do prontuário baixado")
            pv.screenshot(path=str(B.PRINTS / f"{a.prefixo}_nutri_antigo_prontuario.png"))
            pv.goto(f"{nutri}/pacientes/{pid}/consultas", wait_until="domcontentloaded")
            pv.wait_for_selector("[data-secao-consultas]", timeout=60000)
            pv.locator("[data-btn-registrar-consulta]").first.click()
            pv.wait_for_selector('[data-modal-consulta="nova"]', timeout=20000)
            pv.fill("[data-campo-observacao-consulta]", f"Consulta pelo site antigo ({B.MARCA}).")
            pv.locator("[data-btn-salvar-consulta]").click()
            ok = False
            for _ in range(40):
                if pv.locator("[data-consulta]").count() == 1:
                    ok = True
                    break
                pv.wait_for_timeout(500)
            p.check(ok, "1. site antigo: a nutri registra uma consulta")
            pv.goto(f"{nutri}/pacientes/{pid}/anexos", wait_until="domcontentloaded")
            pv.wait_for_selector("[data-secao-anexos]", timeout=60000)
            arq = DOWNLOADS / f"anexo-w18-{uuid.uuid4().hex[:6]}.pdf"
            DOWNLOADS.mkdir(parents=True, exist_ok=True)
            arq.write_bytes(B.pdf_minimo("Anexo pelo site antigo W18"))
            pv.locator("[data-input-anexos]").set_input_files(str(arq))
            pv.locator("[data-btn-enviar-arquivos]").click()
            ok = False
            for _ in range(60):
                if pv.locator("[data-anexo]").count() == 1:
                    ok = True
                    break
                pv.wait_for_timeout(500)
            p.check(ok, "1. site antigo: a nutri sobe um anexo (Storage + tabela, com as restritivas da W18)")
            pv.screenshot(path=str(B.PRINTS / f"{a.prefixo}_nutri_antigo_anexos.png"))

            # ---------- 2. Physiq ----------
            cn = nav.new_context(viewport={"width": 1280, "height": 883}, device_scale_factor=2, locale="pt-BR", timezone_id="America/Sao_Paulo",
                                 service_workers="block")
            pn = cn.new_page()
            pn.on("pageerror", lambda e: erros.append(f"physiq: {str(e)[:160]}"))
            pn.goto(f"{base}/privacidade", wait_until="domcontentloaded")
            pn.evaluate("""([k, v]) => { localStorage.setItem(k, v); localStorage.setItem('physiq_pendencia_avisada_em', new Date().toLocaleDateString('pt-BR'));
                localStorage.setItem('physiqcalc-pwa-dismissed', 'true'); }""", [B.B5.CHAVE_PRINCIPAL, json.dumps(B.sessao(CONTA))])
            pn.goto(f"{base}/painel/alunos/{pid}/prontuario", wait_until="domcontentloaded")
            pn.wait_for_selector("[data-secao-anotacoes] [data-anotacao]", timeout=90000)
            if pn.locator("[data-aviso-mudanca-ok]").count():
                pn.locator("[data-aviso-mudanca-ok]").click()
            linha = pn.locator("[data-anotacao]").first
            p.check(linha.get_attribute("data-visibilidade") == "nutricionistas" and "melhora do sono" in linha.inner_text(),
                    "2. Physiq: o registro do site antigo aparece como \"Só nutricionistas\"")
            p.check(pn.locator("[data-secao-prontuario-botao]").count() == 10, "2. Physiq: a dona-nutri vê as 10 seções")
            pdf_novo = baixar(pn, lambda: pn.locator("[data-btn-pdf-prontuario]").click(), f"{a.prefixo}_physiq")
            pn.screenshot(path=str(B.PRINTS / f"{a.prefixo}_nutri_antigo_no_physiq.png"))
            pn.locator('[data-secao-prontuario-botao="consultas"]').click()
            pn.wait_for_selector("[data-secao-consultas] [data-consulta]", timeout=45000)
            p.check("Consulta pelo site antigo" in pn.inner_text("[data-secao-consultas]") or pn.locator("[data-consulta]").count() == 1,
                    "2. Physiq: a consulta do site antigo aparece")
            pn.locator('[data-secao-prontuario-botao="anexos"]').click()
            pn.wait_for_selector("[data-secao-anexos] [data-anexo]", timeout=45000)
            pn.locator("[data-anexo] [data-btn-ver-anexo]").first.click()
            ok = False
            for _ in range(40):
                if pn.locator("[data-iframe-anexo][src*='/object/sign/anexos/']").count():
                    ok = True
                    break
                pn.wait_for_timeout(500)
            p.check(ok, "2. Physiq: o anexo subido no site antigo abre pela URL assinada")
            pn.keyboard.press("Escape")
            # a anotação "Equipe" escrita no Physiq aparece no site antigo
            pn.locator('[data-secao-prontuario-botao="anotacoes"]').click()
            pn.wait_for_selector("[data-btn-nova-anotacao]", timeout=30000)
            pn.locator("[data-btn-nova-anotacao]").first.click()
            pn.wait_for_selector('[data-modal-anotacao="nova"]', timeout=20000)
            pn.locator('[data-opcao-visibilidade="equipe"]').click()
            pn.fill("[data-campo-texto-anotacao]", texto_novo)
            pn.locator("[data-btn-salvar-anotacao]").click()
            ok = False
            for _ in range(40):
                if pn.locator("[data-anotacao]").count() == 2:
                    ok = True
                    break
                pn.wait_for_timeout(500)
            p.check(ok, "2. Physiq: a dona-nutri grava uma anotação \"Equipe\"")
            pv.goto(f"{nutri}/pacientes/{pid}/prontuario", wait_until="domcontentloaded")
            ok = False
            for _ in range(60):
                if pv.locator("[data-registro]").count() == 2:
                    ok = True
                    break
                pv.wait_for_timeout(500)
            p.check(ok, "2. site antigo: a anotação do Physiq aparece lá (mesma tabela)")

            # ---------- 3. o PDF ----------
            if pdf_antigo and pdf_novo:
                velho, novo = textos_pdf(pdf_antigo), textos_pdf(pdf_novo)
                velho_sem_marca = [t.replace("PHYSIQNUTRI", "PHYSIQ") for t in velho]
                # o Physiq foi gerado minutos depois: só a hora de emissão pode mudar
                hora = re.compile(r"Emitido em \d\d/\d\d/\d{4} \d\d:\d\d")
                igual = [hora.sub("Emitido em —", t) for t in velho_sem_marca] == [hora.sub("Emitido em —", t) for t in novo]
                p.check(igual, f"3. PDF do prontuário: o texto do Physiq = o do site antigo, linha a linha, tirando a marca ({len(velho)} × {len(novo)} trechos)")
                if not igual:
                    print("   antigo:", velho_sem_marca[:14], "\n   physiq:", novo[:14], flush=True)
                p.check(any("PHYSIQNUTRI" in t for t in velho) and any(t.startswith("PHYSIQ ·") for t in novo), "3. a marca: PHYSIQNUTRI no antigo, PHYSIQ no Physiq")
            nav.close()
    finally:
        for o in B.sql_principal(f"select name from storage.objects where bucket_id = 'anexos' and name like '%/{pid}/%'"):
            B.apagar_arquivos([o["name"]])
        B.sql_principal(f"delete from {S}.pacientes where id = '{pid}'")
    p.check(not erros, f"sem erro de página nos 2 sites ({erros[:3]})")
    print(f"\nW18 · site antigo do Nutri ({a.prefixo}) · {time.time() - t0:.0f}s")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
