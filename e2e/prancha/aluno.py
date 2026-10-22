#!/usr/bin/env python3
"""Physiq — a Prancha por TEMPO no APP DO ALUNO, de verdade (decisão do Weslley 21/10/2026: a Prancha e a Prancha Lateral registram a
série por tempo — o cronômetro da série conta pra baixo a partir da meta do profissional e apita; sem meta, conta pra cima; grava só o
tempo; o aluno corrige na mão).

Conta de TESTE teste@teste.com ("aluno-calc"), o treino próprio dele "Teste 3D" (domingo; as 156 do catálogo com 3D, as 2 pranchas
inclusive). O treino é do próprio aluno → sem meta → o cronômetro conta pra CIMA. A contagem pra BAIXO (com a meta do profissional) está
provada no vitest (src/treino/prancha.test.tsx: a aba Treino inteira, da prescrição "30" ao banco) — no aparelho ela aparece quando um
profissional puser a meta (nenhum treino de teste tem a prancha com meta: o lado do profissional está no e2e/prancha/profissional.py).

--rotulo local (o `vite dev`, schema staging): o P20 da W8 — o app LÊ o public e GRAVA o staging; os fluxos de escrita rodam SEM INTERNET
  depois do 1º sync e, na volta, a fila sobe pro staging: o banco tem SÓ o tempo (peso e reps nulos), nada em tb_academia_pesos; no fim
  apaga do staging o que gravou (e2e/w08/_base.py: limpar_staging).
--rotulo prod (https://physiqcalc.com.br, SÓ LEITURA): a Guarda da hml-17 barra toda escrita e o app fica sem internet depois do 1º sync;
  só abre a prancha, liga o ▶ e cancela no × (o cronômetro vive no aparelho; nada vai ao banco) — antes e depois, o public sem nenhuma
  série da prancha da conta de teste.

Uso: PYTHONDONTWRITEBYTECODE=1 python3 e2e/prancha/aluno.py --rotulo local --base http://localhost:5181 [--canal msedge]
     PYTHONDONTWRITEBYTECODE=1 python3 e2e/prancha/aluno.py --rotulo prod --base https://physiqcalc.com.br [--canal msedge]
Prints (390 × 844 × 3,4): ~/projetos/physiqcalc-scratch/prints/prancha/<rotulo>_*.png
"""
from __future__ import annotations

import argparse
import datetime as dt
import importlib.util
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


B8 = _carregar("_base_w08_prancha", RAIZ / "w08" / "_base.py")
sys.path.insert(0, str(RAIZ / "hml17"))
B17 = _carregar("_base_hml17_prancha", RAIZ / "hml17" / "_base.py")
from playwright.sync_api import sync_playwright  # noqa: E402

p = B8.p
PRANCHA = "217d3ff2-62d0-5df4-90f8-600677209cf2"
LATERAL = "88f946d5-46f3-5c84-8fdc-f114d9ed805a"
ESCALADOR = "32b7d001-7a57-5443-b6da-87ec6ac7c1ee"
GRUPO = "Teste 3D"
PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "prancha"
B8.B5.PRINTS = PRINTS
B8.B7.PRINTS = PRINTS
B8.PRINTS = PRINTS


def domingo() -> dt.date:
    h = B8.hoje()
    return h + dt.timedelta(days=6 - h.weekday())


def series_no_banco(schema: str, dia: dt.date, exercicio: str) -> list[dict]:
    return B8.sql_treino(f"""select numero_serie, peso, reps, tempo_segundos, concluida from {schema}.tb_treino_series
                               where user_id = '{B8.USER_TESTE}' and data_treino = '{dia.isoformat()}' and exercicio_id = '{exercicio}'
                               order by numero_serie""") or []


def pesos_academia_da_prancha(schema: str, desde: str | None = None) -> int:
    filtro = f" and updated_at >= '{desde}'" if desde else ""
    r = B8.sql_treino(f"""select count(*)::int n from {schema}.tb_academia_pesos where user_id = '{B8.USER_TESTE}'
                            and exercicio_id in ('{PRANCHA}', '{LATERAL}'){filtro}""")
    return int(r[0]["n"]) if r else 0


def mostrado(c, ex: str) -> str:
    return B8.texto(c, f'[data-exercicio-id="{ex}"] [data-cronometro-mostrado]')


def serie(c, ex: str, n: int):
    return c.pg.locator(f'[data-exercicio-id="{ex}"] [data-serie="{n}"]').first


def abrir_no_domingo(c, rotulo: str) -> bool:
    B8.ir_para_dia(c, domingo())
    ok = c.esperar(lambda: c.pg.locator(f'[data-slot-grupo="{GRUPO}"] [data-exercicio-id="{PRANCHA}"]').count() > 0, 40)
    p.check(ok, f"[{rotulo}] o treino \"{GRUPO}\" de domingo ({domingo():%d/%m}) tem a Prancha")
    return ok


def ver_linhas(c, rotulo: str) -> None:
    linha = B8.texto(c, f'[data-exercicio-id="{PRANCHA}"] [data-exercicio-linha]')
    p.check(" × " not in linha and "kg" not in linha, f"[{rotulo}] a linha da Prancha sem repetições nem carga (sem meta): {linha!r}")
    p.check(c.pg.locator(f'[data-exercicio-id="{PRANCHA}"] [data-exercicio-carga]').count() == 0, f"[{rotulo}] a Prancha sem o chip de carga")


def caso_local(nav, base: str) -> None:
    rotulo = "local"
    desde = B8.agora_iso()
    c = B8.abrir_treino(nav, base, rotulo, "aluno")
    try:
        if not abrir_no_domingo(c, rotulo):
            return
        B8.sem_internet(c)  # o P20: a tela é o SQLite do aparelho; a fila sobe na volta da internet
        c.pg.locator(f'[data-exercicio-id="{PRANCHA}"]').scroll_into_view_if_needed()
        ver_linhas(c, rotulo)
        B8.abrir_exercicio(c, PRANCHA)
        c.esperar(lambda: c.pg.locator(f'[data-exercicio-id="{PRANCHA}"] [data-serie-iniciar]').count() > 0, 10)
        n_tempo = c.pg.locator(f'[data-exercicio-id="{PRANCHA}"] [data-serie-tempo]').count()
        p.check(n_tempo >= 1 and c.pg.locator(f'[data-exercicio-id="{PRANCHA}"] [data-serie-iniciar]').count() == n_tempo,
                f"[{rotulo}] Prancha aberta: {n_tempo} séries com o campo Tempo e o ▶ (sem peso × reps)")
        p.check(c.pg.locator(f'[data-exercicio-id="{PRANCHA}"] input[aria-label^="Peso"]').count() == 0, f"[{rotulo}] nenhum campo de peso na Prancha")
        serie(c, PRANCHA, 1).scroll_into_view_if_needed()
        print("   print:", c.print("1_prancha_aberta"))

        # S1: ▶ → conta pra cima → Parar grava o tempo segurado
        serie(c, PRANCHA, 1).locator("[data-serie-iniciar]").click()
        p.check(c.esperar(lambda: c.pg.locator(f'[data-exercicio-id="{PRANCHA}"] [data-serie-cronometro="livre"]').count() == 1, 5),
                f"[{rotulo}] S1: o ▶ liga o cronômetro pra CIMA (\"Segurando\")")
        p.check(c.esperar(lambda: mostrado(c, PRANCHA) >= "00:03", 10), f"[{rotulo}] S1: contando ({mostrado(c, PRANCHA)})")
        print("   print:", c.print("2_contando"))
        c.esperar(lambda: mostrado(c, PRANCHA) >= "00:05", 10)
        segurou = mostrado(c, PRANCHA)
        serie(c, PRANCHA, 1).locator("[data-serie-parar]").click()
        # o Parar conclui a série: a linha vira "feita" quando o SQLite do aparelho grava, e o descanso abre como no OK
        c.esperar(lambda: serie(c, PRANCHA, 1).get_attribute("data-serie-feita") is not None, 10)
        if c.esperar(lambda: c.tem("[data-descanso-pular]"), 5):
            print("   print:", c.print("3_descanso_depois_da_prancha"))
        B8.pular_descanso(c)
        feita = serie(c, PRANCHA, 1)
        p.check(feita.get_attribute("data-serie-feita") is not None and " s" in feita.inner_text() and "kg" not in feita.inner_text(),
                f"[{rotulo}] S1 feita com o tempo ({feita.inner_text().strip()!r}; a tela mostrava {segurou})")

        # S2: corrige na mão ("40") e o OK conclui com 40 s
        campo = serie(c, PRANCHA, 2).locator("input")
        campo.fill("40")
        campo.press("Tab")
        c.pg.wait_for_timeout(300)
        p.check(serie(c, PRANCHA, 2).locator("input").input_value() == "00:40", f"[{rotulo}] S2: digitou 40 → o campo mostra 00:40")
        serie(c, PRANCHA, 2).locator("[data-serie-ok]").click()
        c.esperar(lambda: serie(c, PRANCHA, 2).get_attribute("data-serie-feita") is not None, 10)
        c.esperar(lambda: c.tem("[data-descanso-pular]"), 5)
        B8.pular_descanso(c)
        p.check("40 s" in serie(c, PRANCHA, 2).inner_text(), f"[{rotulo}] S2 feita com 40 s ({serie(c, PRANCHA, 2).inner_text().strip()!r})")

        # S3: ▶ e o × cancela sem gravar
        if c.pg.locator(f'[data-exercicio-id="{PRANCHA}"] [data-serie="3"]').count():
            serie(c, PRANCHA, 3).locator("[data-serie-iniciar]").click()
            c.esperar(lambda: mostrado(c, PRANCHA) >= "00:02", 8)
            serie(c, PRANCHA, 3).locator("[data-serie-cancelar]").click()
            c.pg.wait_for_timeout(400)
            p.check(serie(c, PRANCHA, 3).get_attribute("data-serie-feita") is None and serie(c, PRANCHA, 3).locator("[data-serie-iniciar]").count() == 1,
                    f"[{rotulo}] S3: o × cancela sem gravar (a série continua por fazer)")
        serie(c, PRANCHA, 1).scroll_into_view_if_needed()
        print("   print:", c.print("4_prancha_series_feitas"))

        # o histórico do exercício (o SQLite do aparelho) mostra o tempo
        c.pg.locator(f'[data-exercicio-id="{PRANCHA}"] [data-acao-exercicio="historico"]').click()
        c.esperar(lambda: c.tem("[data-historico-exercicio]"), 8)
        c.pg.wait_for_timeout(800)
        hist = B8.texto(c, "[data-historico-exercicio]")
        p.check("00:40" in hist and "kg" not in hist, f"[{rotulo}] o Histórico da Prancha mostra o tempo, sem kg ({hist[:80]!r})")
        print("   print:", c.print("5_historico_prancha"))
        c.pg.keyboard.press("Escape")
        c.pg.wait_for_timeout(500)

        # a Prancha Lateral também; o Escalador (o mesmo movimento) continua por repetições
        B8.abrir_exercicio(c, LATERAL)
        p.check(c.esperar(lambda: c.pg.locator(f'[data-exercicio-id="{LATERAL}"] [data-serie-iniciar]').count() >= 1, 10),
                f"[{rotulo}] a Prancha Lateral com o ▶")
        serie(c, LATERAL, 1).scroll_into_view_if_needed()
        print("   print:", c.print("6_prancha_lateral"))
        if c.pg.locator(f'[data-exercicio-id="{ESCALADOR}"]').count():
            B8.abrir_exercicio(c, ESCALADOR)  # abrir um exercício fecha o outro
            c.esperar(lambda: c.pg.locator(f'[data-exercicio-id="{ESCALADOR}"] [data-serie]').count() > 0, 10)
            p.check(c.pg.locator(f'[data-exercicio-id="{ESCALADOR}"] [data-serie-iniciar]').count() == 0
                    and c.pg.locator(f'[data-exercicio-id="{ESCALADOR}"] input[aria-label^="Repetições"]').count() >= 1,
                    f"[{rotulo}] o Escalador continua com peso × repetições (sem o ▶)")
            serie(c, ESCALADOR, 1).scroll_into_view_if_needed()
            print("   print:", c.print("7_escalador_por_repeticoes"))

        # volta a internet: a fila sobe pro STAGING com SÓ o tempo
        B8.sem_internet(c, False)
        p.check(B8.esperar_fila_vazia(c, 150), f"[{rotulo}] na volta da internet a fila do aparelho esvaziou (subiu pro staging)")
        dia = domingo()
        ok_banco = B8.esperar_staging(lambda: sum(1 for s in series_no_banco("staging", dia, PRANCHA) if s["concluida"]) >= 2, 90)
        linhas = series_no_banco("staging", dia, PRANCHA)
        print("   staging:", linhas)
        s1 = next((s for s in linhas if s["numero_serie"] == 1), {})
        s2 = next((s for s in linhas if s["numero_serie"] == 2), {})
        p.check(ok_banco and s1.get("concluida") is True and (s1.get("tempo_segundos") or 0) >= 5 and s1.get("peso") is None and s1.get("reps") is None,
                f"[{rotulo}] banco (staging): S1 concluída com SÓ o tempo ({s1})")
        p.check(s2.get("concluida") is True and s2.get("tempo_segundos") == 40 and s2.get("peso") is None and s2.get("reps") is None,
                f"[{rotulo}] banco (staging): S2 concluída com 40 s, peso e reps nulos ({s2})")
        p.check(all(s.get("peso") is None and s.get("reps") is None for s in linhas), f"[{rotulo}] banco: nenhuma série da Prancha com peso ou repetições")
        p.check(pesos_academia_da_prancha("staging", desde) == 0, f"[{rotulo}] banco: nada da Prancha em tb_academia_pesos")
        p.check(not series_no_banco("public", dia, PRANCHA), f"[{rotulo}] o public (produção) sem nenhuma série da Prancha da conta de teste")
    finally:
        c.fim()
        B8.limpar_staging(desde, "prancha")


def caso_prod(nav, base: str) -> None:
    rotulo = "prod"
    dia = domingo()
    antes = len(series_no_banco("public", dia, PRANCHA)), pesos_academia_da_prancha("public")
    guarda = B17.Guarda()
    c = B8.Caso(nav, base, rotulo, "aluno", desktop=False)
    guarda.instalar(c.ctx)
    try:
        c.entrar(B8.ALUNO, "/treino", zerar=False)
        c.fechar_avisos()
        ok = c.esperar(lambda: c.tem("[data-aba-treino]") and (c.tem("[data-cartao-treino]") or c.tem("[data-sem-treino-dia]")), 120)
        p.check(ok, f"[{rotulo}] a aba Treino abriu já logada")
        c.esperar(lambda: not c.tem('[data-sync="primeira"]'), 90)
        c.pg.wait_for_timeout(1200)
        B8.sem_internet(c)  # nada sobe: a tela é o SQLite do aparelho, que some com o contexto
        if not abrir_no_domingo(c, rotulo):
            return
        c.pg.locator(f'[data-exercicio-id="{PRANCHA}"]').scroll_into_view_if_needed()
        ver_linhas(c, rotulo)
        B8.abrir_exercicio(c, PRANCHA)
        p.check(c.esperar(lambda: c.pg.locator(f'[data-exercicio-id="{PRANCHA}"] [data-serie-iniciar]').count() >= 1, 10),
                f"[{rotulo}] a Prancha com o campo Tempo e o ▶ (o bundle novo)")
        serie(c, PRANCHA, 1).scroll_into_view_if_needed()
        print("   print:", c.print("1_prancha_aberta"))
        serie(c, PRANCHA, 1).locator("[data-serie-iniciar]").click()
        p.check(c.esperar(lambda: mostrado(c, PRANCHA) >= "00:03", 10), f"[{rotulo}] o ▶ conta pra cima ({mostrado(c, PRANCHA)})")
        print("   print:", c.print("2_contando"))
        serie(c, PRANCHA, 1).locator("[data-serie-cancelar]").click()
        c.pg.wait_for_timeout(400)
        p.check(serie(c, PRANCHA, 1).get_attribute("data-serie-feita") is None, f"[{rotulo}] o × cancelou sem gravar")
        print("   print:", c.print("3_cancelado"))
    finally:
        c.fim()
    depois = len(series_no_banco("public", dia, PRANCHA)), pesos_academia_da_prancha("public")
    p.check(antes == depois, f"[{rotulo}] produção intacta: séries e pesos da Prancha da conta de teste {antes} → {depois}")
    p.check(not [b for b in guarda.bloqueadas if "tb_treino_series" in b], f"[{rotulo}] a Guarda não precisou barrar série nenhuma ({guarda.bloqueadas[:4]})")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rotulo", choices=("local", "prod"), required=True)
    ap.add_argument("--base", required=True)
    ap.add_argument("--canal", default="msedge", choices=("chromium", "msedge", "chrome"))
    a = ap.parse_args()
    B8.ESTADO["schema"] = "public" if a.rotulo == "prod" else "staging"
    PRINTS.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        nav = pw.chromium.launch(channel=a.canal, args=["--no-sandbox"])
        try:
            (caso_prod if a.rotulo == "prod" else caso_local)(nav, a.base.rstrip("/"))
        finally:
            nav.close()
    return p.fim()


if __name__ == "__main__":
    raise SystemExit(main())
