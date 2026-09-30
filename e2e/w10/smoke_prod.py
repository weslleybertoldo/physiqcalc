#!/usr/bin/env python3
"""Physiq W10 — smoke de PRODUÇÃO da aba Evolução nova (tela 4), SÓ LEITURA, com a conta de teste do Calc (teste@teste.com).

Nada é gravado: um vigia conta todo POST/PATCH/PUT/DELETE no REST dos 2 bancos (fora as funções de leitura) e o smoke falha
se aparecer algum. Em produção não há antropometria nem foto de evolução no principal; a conta de teste tem 1 avaliação sem
números (15/07) e o perfil sem dados — o que a tela antiga mostrava ("Seus dados ainda não foram configurados" + a linha do
tempo com 15/07). Casos:
  so_calc  a aba nova abre já logada, o estado vazio certo e a avaliação de 15/07 na tabela; NÚMERO A NÚMERO contra a foto da
           tela antiga de produção (antes_prod.json, tirada antes do merge)
  rotas    /avaliacao → /evolucao com a aba nova (a mesma conta de teste — a w10-aluno só existe no staging)
Prints prod_* (390 × 844 × 3,4) em ~/projetos/physiqcalc-scratch/prints/w10/.
Uso: python3 e2e/w10/smoke_prod.py [--base https://physiqcalc.com.br]
"""
from __future__ import annotations

import argparse
import importlib.util
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

_ESPEC = importlib.util.spec_from_file_location("telas_w10", Path(__file__).parent / "telas.py")
T = importlib.util.module_from_spec(_ESPEC)
_ESPEC.loader.exec_module(T)  # type: ignore[union-attr]

p = B.p
ESCRITAS: list[str] = []


def vigiar(c) -> None:
    def ver(r) -> None:
        u = r.url
        if r.method in ("POST", "PATCH", "PUT", "DELETE") and "/rest/v1/" in u and "/rpc/" not in u:
            ESCRITAS.append(f"{r.method} {u.split('?')[0][-80:]}")
    c.pg.on("request", ver)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="https://physiqcalc.com.br")
    ap.add_argument("--prefixo", default="prod")
    a = ap.parse_args()
    B.ESTADO["schema"] = "public"
    T.ESTADO["antes"] = "prod"
    T.ESTADO["conta_rotas"] = B.ALUNO_CALC
    T.ESTADO["marca_rotas"] = "vazia"
    if not B.saude_treino():
        print("Banco do Treino fora do normal — parando sem testar.")
        return 2

    # o vigia entra em cada página que os casos abrem, antes de navegar (pega também o que a abertura gravaria)
    iniciar = B.Caso.__init__

    def iniciar_vigiado(self, *args, **kw):
        iniciar(self, *args, **kw)
        vigiar(self)

    B.Caso.__init__ = iniciar_vigiado
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        for nome in ("so_calc", "rotas"):
            print(f"\n── {nome} ──", flush=True)
            try:
                T.CASOS[nome](nav, a.base, a.prefixo)
            except Exception as e:  # noqa: BLE001
                p.check(False, f"{nome}: exceção {type(e).__name__}: {str(e)[:300]}")
        nav.close()
    p.check(not ESCRITAS, f"só leitura: nenhuma escrita no REST dos 2 bancos ({ESCRITAS[:5]})")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
