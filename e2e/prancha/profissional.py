#!/usr/bin/env python3
"""Physiq — a Prancha por TEMPO no lado do PROFISSIONAL, de verdade (decisão do Weslley 21/10/2026: "a meta é em segundos").

O editor do treino do aluno (Perfil do aluno › Treino, a tela 8) com a massa da W15 no STAGING (e2e/w15/massa.py: o Lucas, dono +
personal, e o treino A "Peito e tríceps", só do Rafael Moura): a Prancha entra no treino A pela função (o mesmo "adicionar" da
biblioteca), o profissional digita a meta no campo TEMPO pela TELA ("30") e o banco guarda `reps_alvo = '30'` — o texto que o app do
aluno lê como a meta em segundos; valor inválido não grava; a carga fica só leitura; a folha "Editar exercício" diz "Tempo de cada
série (segundos)", sem carga sugerida, e a prévia do aluno "3 × 30 s"; o PDF do treino sai com "× 30 s" (nunca a faixa 8-12). No
fim a Prancha sai do treino A (a função apaga a prescrição junto) — a massa volta como estava.

Uso: PYTHONDONTWRITEBYTECODE=1 python3 e2e/prancha/profissional.py --rotulo local|staging --base URL [--canal msedge]
Prints (1280 × 883 × 2 e 390 × 844 × 3,4): ~/projetos/physiqcalc-scratch/prints/prancha/<rotulo>_prof_*.png
"""
from __future__ import annotations

import argparse
import importlib.util
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True
RAIZ = Path(__file__).resolve().parent.parent


def _carregar(nome: str, caminho: Path):
    esp = importlib.util.spec_from_file_location(nome, caminho)
    mod = importlib.util.module_from_spec(esp)
    sys.modules[nome] = mod
    esp.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


B = _carregar("_base_w15_prancha", RAIZ / "w15" / "_base.py")
from playwright.sync_api import sync_playwright  # noqa: E402

p = B.p
S = "staging"
B.ESTADO["schema"] = S
PRANCHA = "217d3ff2-62d0-5df4-90f8-600677209cf2"
PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "prancha"
DOWNLOADS = PRINTS / "downloads"
for _b in (B, B.B14, B.B13, B.B5):
    _b.PRINTS = PRINTS


def presc_prancha(rafael: str, grupo: str) -> dict | None:
    r = [x for x in B.linhas_prescricao(rafael) if x["grupo_id"] == grupo and x["exercicio_id"] == PRANCHA]
    return r[0] if r else None


def no_treino(grupo: str) -> bool:
    return bool(B.sql_treino(f"select 1 from {S}.tb_grupos_exercicios where grupo_id = '{grupo}' and exercicio_id = '{PRANCHA}'"))


def linha(c):
    return c.pg.locator('[data-exercicio-nome="Prancha"]').first


def digitar(c, valor: str) -> None:
    inp = linha(c).locator('[data-campo-input="reps"]')
    inp.click()
    inp.fill(valor)
    inp.press("Enter")
    c.pg.wait_for_timeout(400)


def pdf_do_treino(c, rotulo: str) -> str:
    DOWNLOADS.mkdir(parents=True, exist_ok=True)
    try:
        with c.pg.expect_download(timeout=90000) as d:
            c.pg.locator("[data-pdf-treino]").first.click()
        destino = DOWNLOADS / f"{rotulo}_plano_{d.value.suggested_filename}"
        d.value.save_as(str(destino))
    except Exception as e:  # noqa: BLE001
        print("   PDF não baixou:", e)
        return ""
    r = subprocess.run(["pdftotext", "-layout", str(destino), "-"], capture_output=True, text=True)
    return r.stdout


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rotulo", choices=("local", "staging"), required=True)
    ap.add_argument("--base", required=True)
    ap.add_argument("--canal", default="msedge", choices=("chromium", "msedge", "chrome"))
    a = ap.parse_args()
    base, rotulo = a.base.rstrip("/"), a.rotulo
    PRINTS.mkdir(parents=True, exist_ok=True)
    m = B.ler_json(B.SCRATCH / "massa_staging.json")
    rafael, A = m["rafael"], m["A"]
    conta = B.conta_de("w13-dono", B.NOME_CONTA)
    pac = B.B14.paciente("Rafael Moura", conta)
    assert pac, "o Rafael Moura (massa da W13/W15) não existe no staging"
    rota = pac["treino_user_id"] or pac["id"]

    # a Prancha entra no treino A (o "adicionar" da biblioteca, pela função, como o Lucas)
    if not no_treino(A):
        st, r = B.semana("w13-dono", "adicionarExercicio", rafael, grupo_id=A, exercicio_id=PRANCHA)
        p.check(st == 200, f"[{rotulo}] a Prancha entrou no treino A do Rafael (adicionarExercicio → {st} {r})")
    try:
        with sync_playwright() as pw:
            nav = pw.chromium.launch(channel=a.canal, args=["--no-sandbox"])
            try:
                c = B.Caso(nav, base, f"{rotulo}_prof", "editor")
                try:
                    c.entrar("w13-dono", f"/painel/alunos/{rota}/treino")
                    c.fechar_avisos()
                    ok = c.esperar(lambda: linha(c).count() > 0, 120)
                    p.check(ok, f"[{rotulo}] o editor do treino do Rafael abriu com a Prancha")
                    if not ok:
                        return p.fim()
                    rot = linha(c).inner_text()
                    p.check("TEMPO" in rot and "REPS" not in rot, f"[{rotulo}] a linha da Prancha tem TEMPO no lugar de REPS")
                    p.check(linha(c).locator('[data-campo-input="carga"]').count() == 0, f"[{rotulo}] a carga da Prancha é só leitura")
                    digitar(c, "30")
                    p.check(B.esperar(lambda: (presc_prancha(rafael, A) or {}).get("reps_alvo") == "30", 30),
                            f"[{rotulo}] banco: a meta digitada na tela virou reps_alvo '30' ({presc_prancha(rafael, A)})")
                    c.pg.wait_for_timeout(600)
                    valor = linha(c).locator('[data-campo-input="reps"]').input_value()
                    p.check(valor == "30 s", f"[{rotulo}] o campo mostra '30 s' ({valor!r})")
                    linha(c).scroll_into_view_if_needed()
                    print("   print:", c.print("1_editor_tempo_30s"))

                    # inválido não grava
                    digitar(c, "doze reps")
                    c.pg.wait_for_timeout(800)
                    p.check((presc_prancha(rafael, A) or {}).get("reps_alvo") == "30", f"[{rotulo}] valor inválido não grava (continua '30')")

                    # a folha "Editar exercício"
                    linha(c).locator("[data-exercicio-editar]").click()
                    p.check(c.esperar(lambda: c.tem("[data-folha-editar]"), 10), f"[{rotulo}] a folha Editar exercício abriu")
                    folha = c.pg.locator("[data-folha-editar]").first
                    txt = folha.inner_text()
                    previa = c.pg.locator("[data-editar-previa]").first.inner_text()
                    p.check("Tempo de cada série (segundos)" in txt and "Carga sugerida" not in txt and "Repetições" not in txt,
                            f"[{rotulo}] a folha pede o tempo em segundos, sem carga")
                    p.check(previa.startswith("3 × 30 s"), f"[{rotulo}] a prévia do aluno: {previa!r}")
                    print("   print:", c.print("2_folha_editar"))
                    c.pg.keyboard.press("Escape")
                    c.pg.wait_for_timeout(700)

                    texto_pdf = pdf_do_treino(c, rotulo)
                    linha_pdf = next((l for l in texto_pdf.splitlines() if "Prancha" in l), "")
                    p.check("30 s" in linha_pdf and "8-12" not in linha_pdf, f"[{rotulo}] o PDF do treino: {linha_pdf.strip()[:90]!r}")
                finally:
                    c.fim()

                # no celular os campos descem pra 2ª linha
                c = B.Caso(nav, base, f"{rotulo}_prof", "editor-celular", desktop=False)
                try:
                    c.entrar("w13-dono", f"/painel/alunos/{rota}/treino")
                    c.fechar_avisos()
                    if c.esperar(lambda: linha(c).count() > 0, 120):
                        linha(c).scroll_into_view_if_needed()
                        print("   print:", c.print("3_editor_celular"))
                finally:
                    c.fim()
            finally:
                nav.close()
    finally:
        st, r = B.semana("w13-dono", "removerExercicio", rafael, grupo_id=A, exercicio_id=PRANCHA)
        p.check(st == 200 and not no_treino(A) and not presc_prancha(rafael, A),
                f"[{rotulo}] limpeza: a Prancha saiu do treino A e a prescrição dela também ({st})")
    return p.fim()


if __name__ == "__main__":
    raise SystemExit(main())
