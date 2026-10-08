#!/usr/bin/env python3
"""Physiq W18 — E2E das telas: Perfil do aluno › Prontuário e o card Prontuário do Resumo (tela 7), por papel.

Positivo:
  · Lucas (dono + personal do Rafael, SEM papel de nutricionista) abre o Resumo do Rafael: o card Prontuário mostra as 3 últimas
    anotações "Equipe" (16/07 e 14/06 dele, 02/07 da Camila) — a "Só nutricionistas" de 09/07 não chega; "Nova anotação" abre a aba
    com o formulário (só "Equipe"); ele escreve, a anotação aparece com o papel Personal, edita e exclui a dele.
  · Camila (nutricionista responsável): o card mostra a "Só nutricionistas" com o cadeado; a aba tem as 10 seções; ela escreve uma
    "Só nutricionistas"; cada seção clínica abre com o que a massa gravou (consultas, anamnese, exames com 2 fora da referência,
    atestado, medicamento, anexo com a URL assinada); o "PDF do prontuário" baixa com a marca Physiq; os atalhos "Registrar consulta"
    e "Anamnese" do Fluxo de consulta (W14) abrem a seção nova com o formulário.
Negativo: o Lucas não vê seção clínica nem pela URL (?secao=anamnese, ?nova=consulta); o Bruno (2º personal, não é do Rafael) não
abre o prontuário dele (P1).

Uso: python3 e2e/w18/telas.py --base http://localhost:5173 --prefixo local [--casos resumo,personal,nutri,secoes,atalhos,negativos]
     (staging: --base https://physiqcalc-staging.vercel.app --prefixo staging). Contexto limpo por caso, painel 1280 × 883 × 2 (tela 7).
     A massa volta ao começo no fim (python3 e2e/w18/massa.py).
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

from playwright.sync_api import sync_playwright  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
p = B.p
DOWNLOADS = B.SCRATCH / "downloads"
CASOS: dict[str, object] = {}
ESTADO: dict = {}


def caso(fn):
    CASOS[fn.__name__.replace("caso_", "")] = fn
    return fn


def m() -> dict:
    return ESTADO["massa"]


def abrir(nav, nome: str, conta: str, rota: str):
    c = B.B5.Caso(nav, ESTADO["base"], ESTADO["prefixo"], nome, desktop=True)
    c.entrar(conta, rota)
    c.fechar_avisos()
    return c


def rota(sufixo: str = "") -> str:
    return f"/painel/alunos/{m()['rota']}{sufixo}"


def esperar_anotacoes(c, n: int, nome: str) -> bool:
    ok = c.esperar(lambda: c.pg.locator("[data-secao-anotacoes] [data-anotacao]").count() == n, 60)
    p.check(ok, f"[{nome}] {n} anotações na aba ({c.pg.locator('[data-secao-anotacoes] [data-anotacao]').count()})")
    return ok


def print_elemento(c, seletor: str, nome: str) -> str:
    B.PRINTS.mkdir(parents=True, exist_ok=True)
    caminho = B.PRINTS / f"{c.prefixo}_{nome}.png"
    c.pg.wait_for_timeout(600)
    c.pg.locator(seletor).first.screenshot(path=str(caminho))
    return str(caminho)


def baixar(c, clicar, nome: str) -> Path | None:
    DOWNLOADS.mkdir(parents=True, exist_ok=True)
    try:
        with c.pg.expect_download(timeout=60000) as d:
            clicar()
        destino = DOWNLOADS / f"{c.prefixo}_{nome}_{d.value.suggested_filename}"
        d.value.save_as(str(destino))
        return destino
    except Exception as e:  # noqa: BLE001
        print(f"   download falhou: {e}", flush=True)
        return None


def textos_pdf(arq: Path) -> str:
    """O texto que o jsPDF escreveu (operadores "(...) Tj"; o jsPDF não comprime por padrão)."""
    bruto = arq.read_bytes().decode("latin-1")
    return "\n".join(t[1:-1].replace("\\(", "(").replace("\\)", ")") for t in re.findall(r"\((?:\\.|[^\\)])*\)(?=\s*Tj)", bruto))


def nova_anotacao(c, texto: str, visibilidade: str | None = None) -> None:
    c.pg.locator("[data-btn-nova-anotacao]").first.click()
    c.esperar(lambda: c.tem('[data-modal-anotacao="nova"]'), 15)
    if visibilidade:
        c.pg.locator(f'[data-opcao-visibilidade="{visibilidade}"]').click()
    c.pg.fill("[data-campo-texto-anotacao]", texto)
    c.pg.locator("[data-btn-salvar-anotacao]").click()


@caso
def caso_resumo(nav) -> None:
    """Lucas: o Resumo da tela 7 com o card Prontuário (as 3 "Equipe")."""
    c = abrir(nav, "resumo", "w13-dono", rota())
    ok = c.esperar(lambda: c.pg.locator("[data-card-prontuario-notas] [data-nota]").count() == 3, 90)
    p.check(ok, "[resumo] o card Prontuário mostra 3 anotações")
    cab = [t.strip() for t in c.pg.locator("[data-card-prontuario-notas] [data-nota-cabecalho]").all_inner_texts()]
    p.check(cab == ["16/07 · Lucas Ferreira", "02/07 · Camila Rocha", "14/06 · Lucas Ferreira"], f"[resumo] 16/07 Lucas · 02/07 Camila · 14/06 Lucas ({cab})")
    p.check("Investigar ansiedade" not in c.texto(), "[resumo] a \"Só nutricionistas\" não chega para o personal")
    p.check(c.pg.locator('[data-nota-visibilidade="nutricionistas"]').count() == 0, "[resumo] nenhuma nota com cadeado")
    # tela 7 inteira (2560 × 1766) e o card sozinho — com o card Treino já carregado (troca de token do Lucas)
    c.esperar(lambda: c.pg.locator("[data-card-treino-semana], [data-card-treino-treinos], [data-card-treino-vazio], [data-card-treino-sem-volume]").count() > 0, 60)
    c.pg.evaluate("window.scrollTo(0, 0)")
    c.print("tela7_resumo_personal")
    print_elemento(c, "[data-card-prontuario]", "card_prontuario_personal")
    c.pg.locator("[data-card-prontuario-nova]").click()
    ok = c.esperar(lambda: c.tem('[data-modal-anotacao="nova"]'), 30)
    p.check(ok, "[resumo] \"Nova anotação\" abre a aba Prontuário com o formulário")
    p.check(c.tem("[data-visibilidade-fixa]") and not c.tem("[data-opcao-visibilidade]"), "[resumo] o personal só escreve \"Equipe\"")
    p.check(c.esperar(lambda: c.caminho().endswith("/prontuario?secao=anotacoes"), 10), f"[resumo] a URL fica na aba ({c.caminho()})")
    c.fim()


@caso
def caso_personal(nav) -> None:
    """Lucas: a aba só com as anotações da equipe; escreve, edita e exclui a dele."""
    c = abrir(nav, "personal", "w13-dono", rota("/prontuario"))
    esperar_anotacoes(c, 3, "personal")
    p.check(c.tem("[data-prontuario-so-equipe]") and not c.tem("[data-secoes-prontuario]"), "[personal] aviso e nenhuma seção clínica")
    p.check(c.pg.locator('[data-anotacao] [data-chip-visibilidade="nutricionistas"]').count() == 0, "[personal] nenhuma \"Só nutricionistas\"")
    p.check(c.pg.locator('[data-anotacao] [data-btn-editar-anotacao]').count() == 2, "[personal] edita só as 2 dele")
    c.print("aba_anotacoes_personal")
    texto = f"Treino de pernas: progrediu no agachamento ({B.MARCA} {int(time.time())})."
    nova_anotacao(c, texto)
    ok = esperar_anotacoes(c, 4, "personal (depois de escrever)")
    linha = c.pg.locator(f'[data-anotacao]:has-text("{texto[:40]}")').first
    p.check(ok and linha.get_attribute("data-autor-papel") == "personal" and linha.get_attribute("data-visibilidade") == "equipe",
            "[personal] a anotação nova é \"Equipe\", assinada como Personal")
    db = B.sql_principal(f"select visibilidade, autor_papel from {S}.registros_prontuario where texto like $t${texto[:40]}%$t$ and deleted_at is null")
    p.check(db == [{"visibilidade": "equipe", "autor_papel": "personal"}], f"[personal] no banco: equipe/personal ({db})")
    linha.locator("[data-btn-editar-anotacao]").click()
    c.esperar(lambda: c.tem('[data-modal-anotacao="editar"]'), 10)
    c.pg.fill("[data-campo-texto-anotacao]", texto + " Editada.")
    c.pg.locator("[data-btn-salvar-anotacao]").click()
    ok = c.esperar(lambda: "Editada." in c.texto(), 30)
    p.check(ok, "[personal] edita a dele")
    c.pg.locator(f'[data-anotacao]:has-text("{texto[:40]}") [data-btn-excluir-anotacao]').first.click()
    c.pg.locator("[data-btn-confirmar-excluir-anotacao]").click()
    esperar_anotacoes(c, 3, "personal (depois de excluir)")
    # negativo: nenhuma seção clínica pela URL
    c.ir(rota("/prontuario?secao=anamnese"))
    ok = c.esperar(lambda: c.pg.locator("[data-aba-prontuario-aluno]").count() == 1, 30)
    p.check(ok and c.pg.locator("[data-aba-prontuario-aluno]").get_attribute("data-secao-prontuario") == "anotacoes" and not c.tem("[data-secao-anamnese]"),
            "[personal] ?secao=anamnese fica nas anotações")
    c.ir(rota("/prontuario?nova=consulta"))
    c.esperar(lambda: c.pg.locator("[data-secao-anotacoes]").count() == 1, 30)
    c.pg.wait_for_timeout(1500)
    p.check(not c.tem("[data-modal-consulta]") and not c.tem("[data-secao-consultas]"), "[personal] ?nova=consulta não abre consulta")
    c.fim()


@caso
def caso_nutri(nav) -> None:
    """Camila: o card com a "Só nutricionistas", a aba com as 10 seções, escreve uma "Só nutricionistas" e baixa o PDF."""
    c = abrir(nav, "nutri", "w13-nutri", rota())
    ok = c.esperar(lambda: c.pg.locator("[data-card-prontuario-notas] [data-nota]").count() == 3, 90)
    cab = [t.strip() for t in c.pg.locator("[data-card-prontuario-notas] [data-nota-cabecalho]").all_inner_texts()]
    p.check(ok and cab == ["16/07 · Lucas Ferreira", "09/07 · Camila Rocha", "02/07 · Camila Rocha"], f"[nutri] o card traz a de 09/07 ({cab})")
    p.check(c.pg.locator('[data-card-prontuario] [data-nota-visibilidade="nutricionistas"]').count() == 1, "[nutri] com o cadeado")
    print_elemento(c, "[data-card-prontuario]", "card_prontuario_nutri")
    c.ir(rota("/prontuario"))
    esperar_anotacoes(c, 4, "nutri")
    p.check(c.pg.locator("[data-secao-prontuario-botao]").count() == 10, "[nutri] 10 seções (anotações + 9 clínicas)")
    c.print("aba_anotacoes_nutri")
    c.pg.locator("[data-btn-nova-anotacao]").first.click()
    c.esperar(lambda: c.tem('[data-modal-anotacao="nova"]'), 15)
    marcado = c.pg.locator('[data-opcao-visibilidade][aria-checked="true"]').get_attribute("data-opcao-visibilidade")
    p.check(marcado == "nutricionistas", f"[nutri] o padrão da nutri é \"Só nutricionistas\" ({marcado})")
    c.pg.fill("[data-campo-texto-anotacao]", f"Retorno em 15 dias para rever o jantar ({B.MARCA}).")
    c.pg.wait_for_timeout(300)
    c.print("dialogo_anotacao_nutri")
    c.pg.locator("[data-btn-salvar-anotacao]").click()
    esperar_anotacoes(c, 5, "nutri (depois de escrever)")
    db = B.sql_principal(f"select visibilidade, autor_papel from {S}.registros_prontuario where texto like $t$Retorno em 15 dias%$t$ and deleted_at is null")
    p.check(db == [{"visibilidade": "nutricionistas", "autor_papel": "nutricionista"}], f"[nutri] no banco: nutricionistas/nutricionista ({db})")
    arq = baixar(c, lambda: c.pg.locator("[data-btn-pdf-prontuario]").click(), "prontuario")
    t = textos_pdf(arq) if arq else ""
    p.check(bool(arq) and "PHYSIQ" in t and "PHYSIQNUTRI" not in t and "Rafael Moura" in t and "Nutricionista: Camila Rocha" in t,
            f"[nutri] PDF do prontuário baixado com a marca Physiq ({arq.name if arq else None})")
    p.check("Lucas Ferreira (personal)" in t, "[nutri] no PDF, as do Lucas saem com o autor ao lado da data")
    # a nutri exclui a dela (Lixeira) e a lista volta às 4
    c.pg.locator('[data-anotacao]:has-text("Retorno em 15 dias") [data-btn-excluir-anotacao]').first.click()
    c.pg.locator("[data-btn-confirmar-excluir-anotacao]").click()
    esperar_anotacoes(c, 4, "nutri (depois de excluir)")
    c.fim()


SECOES = [("consultas", "[data-secao-consultas] [data-consulta]", 2), ("anamnese", "[data-secao-anamnese] [data-anamnese]", 1),
          ("questionarios", "[data-secao-questionarios]", None), ("exames", "[data-secao-exames] [data-resultado]", 3),
          ("avaliacao-integrada", "[data-secao-avaliacao-integrada]", None), ("gestacional", "[data-secao-gestacional]", None),
          ("farmaco-nutrientes", "[data-secao-farmaco] [data-medicamento]", 1), ("documentos", "[data-secao-documentos] [data-documento]", 1),
          ("anexos", "[data-secao-anexos] [data-anexo]", 1)]


@caso
def caso_secoes(nav) -> None:
    """Camila: cada seção clínica abre com o que a massa gravou (no visual premium)."""
    c = abrir(nav, "secoes", "w13-nutri", rota("/prontuario"))
    ok = c.esperar(lambda: c.pg.locator("[data-secao-anotacoes] [data-anotacao]").count() >= len(B.ANOTACOES_TELA7), 60)
    p.check(ok, "[secoes] a aba abriu com as anotações")
    for sid, seletor, n in SECOES:
        c.pg.locator(f'[data-secao-prontuario-botao="{sid}"]').click()
        if n is None:
            ok = c.esperar(lambda: c.tem(seletor), 45)
            p.check(ok, f"[secoes] {sid} abre")
        else:
            ok = c.esperar(lambda: c.pg.locator(seletor).count() == n, 45)
            p.check(ok, f"[secoes] {sid}: {n} ({c.pg.locator(seletor).count()})")
        c.pg.wait_for_timeout(700)
        c.print(f"secao_{sid}")
        if sid == "exames":
            fora = c.pg.locator("[data-secao-exames] [data-resultado]").all_inner_texts()
            p.check(sum(1 for x in fora if re.search(r"acima|abaixo|fora", x, re.I)) >= 2, "[secoes] exames: 2 fora da referência em destaque")
        if sid == "anexos":
            c.pg.locator("[data-anexo] [data-btn-ver-anexo]").first.click()
            ok = c.esperar(lambda: c.pg.locator(f"[data-iframe-anexo][src*='/object/sign/{B.bucket_do_ambiente('anexos')}/']").count() > 0, 30)
            p.check(ok, "[secoes] anexo abre pela URL assinada")
            c.print("secao_anexos_ver")
            c.pg.keyboard.press("Escape")
    c.fim()


@caso
def caso_atalhos(nav) -> None:
    """Camila: "Registrar consulta" e "Anamnese" do Fluxo de consulta abrem a seção nova com o formulário."""
    c = abrir(nav, "atalhos", "w13-nutri", rota())
    ok = c.esperar(lambda: c.tem('[data-atalho="consulta"]'), 90)
    p.check(ok and c.pg.locator('[data-atalho="consulta"]').get_attribute("data-atalho-destino") == rota("/prontuario?nova=consulta"),
            "[atalhos] Registrar consulta → aba Prontuário")
    p.check(c.pg.locator('[data-atalho="anamnese"]').get_attribute("data-atalho-destino") == rota("/prontuario?nova=anamnese"), "[atalhos] Anamnese → aba Prontuário")
    c.pg.locator('[data-atalho="consulta"]').click()
    ok = c.esperar(lambda: c.tem('[data-modal-consulta="nova"]'), 45)
    p.check(ok and c.caminho().endswith("/prontuario?secao=consultas"), f"[atalhos] a consulta abre com o formulário ({c.caminho()})")
    c.print("atalho_registrar_consulta")
    c.pg.keyboard.press("Escape")
    c.ir(rota())
    c.esperar(lambda: c.tem('[data-atalho="anamnese"]'), 60)
    c.pg.locator('[data-atalho="anamnese"]').click()
    ok = c.esperar(lambda: c.tem('[data-modal-anamnese="nova"]'), 45)
    p.check(ok and c.caminho().endswith("/prontuario?secao=anamnese"), f"[atalhos] a anamnese abre com o formulário ({c.caminho()})")
    c.pg.keyboard.press("Escape")
    # link antigo do Nutri /pacientes/:id/<seção> → a aba Prontuário na seção (tabela "Seção do prontuário → aba", spec 5.2)
    c.ir(f"/pacientes/{m()['paciente']}/exames")
    ok = c.esperar(lambda: c.tem("[data-secao-exames]") and c.caminho().endswith("/prontuario?secao=exames"), 45)
    p.check(ok, f"[atalhos] /pacientes/:id/exames do site antigo abre Prontuário › Exames ({c.caminho()})")
    c.fim()


@caso
def caso_negativos(nav) -> None:
    """Bruno (2º personal, não é do Rafael): não abre o prontuário dele (P1)."""
    c = abrir(nav, "negativos", "w13-personal2", rota("/prontuario"))
    ok = c.esperar(lambda: "Não deu para abrir" in c.texto() or c.tem("[data-perfil-erro]"), 60)
    p.check(ok and c.pg.locator("[data-anotacao]").count() == 0, "[negativos] o Bruno não abre o prontuário do Rafael")
    c.fim()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--prefixo", required=True)
    ap.add_argument("--casos", default=",".join(CASOS))
    a = ap.parse_args()
    ESTADO.update(base=a.base.rstrip("/"), prefixo=a.prefixo)
    ESTADO["massa"] = B.ler_json(B.SCRATCH / "massa_staging.json")
    assert ESTADO["massa"].get("paciente"), "rode antes: python3 e2e/w18/massa.py"
    t0 = time.time()
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox"])
        for nome in a.casos.split(","):
            print(f"\n— caso {nome}", flush=True)
            B.saude_ok(nome)
            try:
                CASOS[nome](nav)  # type: ignore[operator]
            except Exception as e:  # noqa: BLE001
                p.check(False, f"[{nome}] {type(e).__name__}: {str(e)[:300]}")
                caso_atual = B.B5.ESTADO.get("caso")
                if caso_atual:
                    caso_atual.diagnostico()
            time.sleep(3)
        nav.close()
    subprocess.run([sys.executable, str(Path(__file__).parent / "massa.py")], check=False, capture_output=True)
    print(f"\nW18 · telas ({a.prefixo}) · {time.time() - t0:.0f}s")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
