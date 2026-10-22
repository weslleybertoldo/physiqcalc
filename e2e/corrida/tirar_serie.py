#!/usr/bin/env python3
"""Physiq — tirar uma série da CORRIDA, de verdade (22/10/2026): as séries seguintes só mudam de número — o tempo, a distância e o
pace ficam, e nenhuma linha sobra no banco. Antes do conserto, o `removerSerie` regravava as seguintes pelo número novo (só peso e
repetições): a corrida perdia o tempo e a distância, e a última linha antiga sobrava.

Conta de TESTE teste@teste.com ("aluno-calc"), o treino próprio "Teste 3D" (domingo) e a Bicicleta Ergométrica (tipo corrida).
Só no LOCAL (o `vite dev`, schema staging — o P20 da W8: o app LÊ o public e GRAVA o staging): SEM internet depois do 1º sync,
preenche a S1, a S2 e a S3 com tempos e distâncias diferentes (gravadas no aparelho, sem OK), tira a S1 → a tela mostra a antiga S2
como S1 e a antiga S3 como S2; volta a internet → o staging com 2 linhas (1 e 2) com os tempos e distâncias certos e NENHUMA linha 3;
o public sem nada; no fim apaga do staging o que gravou (e2e/w08/_base.py: limpar_staging).

Uso: PYTHONDONTWRITEBYTECODE=1 python3 e2e/corrida/tirar_serie.py --base http://localhost:5173 [--canal msedge]
Prints (390 × 844 × 3,4): ~/projetos/physiqcalc-scratch/prints/corrida/local_*.png
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


B8 = _carregar("_base_w08_corrida", RAIZ / "w08" / "_base.py")
from playwright.sync_api import sync_playwright  # noqa: E402

p = B8.p
BICICLETA = "035b869a-e840-5177-b77a-d0f65e6f86de"  # Bicicleta Ergométrica, tipo corrida (tempo e distância)
GRUPO = "Teste 3D"
PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "corrida"
B8.B5.PRINTS = PRINTS
B8.B7.PRINTS = PRINTS
B8.PRINTS = PRINTS
SERIES = {1: ("05:00", "2"), 2: ("06:00", "3"), 3: ("07:00", "4")}  # tempo (MM:SS) e distância (km)


def domingo() -> dt.date:
    h = B8.hoje()
    return h + dt.timedelta(days=6 - h.weekday())


def series_no_banco(schema: str, dia: dt.date) -> list[dict]:
    return B8.sql_treino(f"""select numero_serie, tempo_segundos, distancia_km::float as km, pace_segundos_km, concluida
                               from {schema}.tb_treino_series where user_id = '{B8.USER_TESTE}' and data_treino = '{dia.isoformat()}'
                               and exercicio_id = '{BICICLETA}' order by numero_serie""") or []


def serie(c, n: int):
    return c.pg.locator(f'[data-exercicio-id="{BICICLETA}"] [data-serie="{n}"]').first


def campos(c, n: int) -> tuple[str, str]:
    s = serie(c, n)
    return s.locator("input[aria-label^='Tempo']").input_value(), s.locator("input[aria-label^='Distância']").input_value()


def caso_local(nav, base: str) -> None:
    rotulo = "local"
    desde = B8.agora_iso()
    dia = domingo()
    c = B8.abrir_treino(nav, base, rotulo, "aluno")
    try:
        B8.ir_para_dia(c, dia)
        ok = c.esperar(lambda: c.pg.locator(f'[data-slot-grupo="{GRUPO}"] [data-exercicio-id="{BICICLETA}"]').count() > 0, 40)
        p.check(ok, f"o treino \"{GRUPO}\" de domingo ({dia:%d/%m}) tem a Bicicleta Ergométrica (corrida)")
        if not ok:
            return
        B8.sem_internet(c)  # o P20: a tela é o SQLite do aparelho; a fila sobe na volta da internet
        B8.abrir_exercicio(c, BICICLETA)
        c.esperar(lambda: c.pg.locator(f'[data-exercicio-id="{BICICLETA}"] input[aria-label^="Distância"]').count() >= 3, 10)
        p.check(c.pg.locator(f'[data-exercicio-id="{BICICLETA}"] input[aria-label^="Distância"]').count() >= 3,
                "a Bicicleta aberta com 3 séries de tempo e distância")

        # S1, S2 e S3 gravadas no aparelho (sem OK): cada campo grava ao sair. No ritmo de uma pessoa: toca no Km (o Tempo grava
        # ao sair), o campo abre e só então digita a distância. O km digitado no MESMO instante do toque (o `fill` direto) cai em 2
        # defeitos antigos do preenchimento, fora deste conserto (medidos em 22/10/2026): os 2 salvamentos da série nova procuram a
        # linha antes de o 1º gravar e criam 2 linhas (o servidor recusa a 2ª, a da distância, pela chave única) ou a linha se refaz
        # com o que o 1º gravou e apaga o km digitado
        for n, (tempo, km) in SERIES.items():
            s = serie(c, n)
            s.locator("input[aria-label^='Tempo']").fill(tempo)
            s.locator("input[aria-label^='Distância']").click()
            c.pg.wait_for_timeout(800)
            s.locator("input[aria-label^='Distância']").fill(km)
            s.locator("input[aria-label^='Distância']").blur()
            c.pg.wait_for_timeout(500)
        serie(c, 1).scroll_into_view_if_needed()
        print("   print:", c.print("1_tres_series"))

        # tira a S1: a antiga S2 vira S1 e a antiga S3 vira S2, com os mesmos tempos e distâncias
        serie(c, 1).locator("[data-serie-tirar]").click()
        c.esperar(lambda: c.pg.locator(f'[data-exercicio-id="{BICICLETA}"] [data-serie="3"]').count() == 0, 8)
        c.pg.wait_for_timeout(600)
        p.check(c.pg.locator(f'[data-exercicio-id="{BICICLETA}"] [data-serie="3"]').count() == 0, "tirou a S1: ficaram 2 séries na tela")
        s1, s2 = campos(c, 1), campos(c, 2)
        p.check(s1[0] == "06:00" and s1[1] in ("3", "3.0", "3,0"), f"a nova S1 é a antiga S2 (tempo e distância): {s1}")
        p.check(s2[0] == "07:00" and s2[1] in ("4", "4.0", "4,0"), f"a nova S2 é a antiga S3 (tempo e distância): {s2}")
        serie(c, 1).scroll_into_view_if_needed()
        print("   print:", c.print("2_depois_de_tirar_a_s1"))

        # volta a internet: a fila sobe pro STAGING
        B8.sem_internet(c, False)
        p.check(B8.esperar_fila_vazia(c, 150), "na volta da internet a fila do aparelho esvaziou (subiu pro staging)")
        ok_banco = B8.esperar_staging(lambda: [s["numero_serie"] for s in series_no_banco("staging", dia)] == [1, 2], 90)
        linhas = series_no_banco("staging", dia)
        print("   staging:", linhas)
        p.check(ok_banco, f"banco (staging): só as linhas 1 e 2 — nenhuma linha sobrando ({[s['numero_serie'] for s in linhas]})")
        b1 = next((s for s in linhas if s["numero_serie"] == 1), {})
        b2 = next((s for s in linhas if s["numero_serie"] == 2), {})
        p.check(b1.get("tempo_segundos") == 360 and b1.get("km") == 3.0 and (b1.get("pace_segundos_km") or 0) > 0,
                f"banco (staging): a linha 1 = a antiga S2 (6 min, 3 km, com pace) ({b1})")
        p.check(b2.get("tempo_segundos") == 420 and b2.get("km") == 4.0 and (b2.get("pace_segundos_km") or 0) > 0,
                f"banco (staging): a linha 2 = a antiga S3 (7 min, 4 km, com pace) ({b2})")
        p.check(not series_no_banco("public", dia), "o public (produção) sem nenhuma série da Bicicleta da conta de teste")
        repetidas = [m for m in c.console if "two children with the same key" in m]
        p.check(not repetidas, f"nenhuma série repetida na tela (chave do React) — uma linha por série no aparelho ({len(repetidas)})")
    finally:
        c.fim()
        B8.limpar_staging(desde, "corrida")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--canal", default="msedge", choices=("chromium", "msedge", "chrome"))
    a = ap.parse_args()
    B8.ESTADO["schema"] = "staging"
    PRINTS.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        nav = pw.chromium.launch(channel=a.canal, args=["--no-sandbox"])
        try:
            caso_local(nav, a.base.rstrip("/"))
        finally:
            nav.close()
    return p.fim()


if __name__ == "__main__":
    raise SystemExit(main())
