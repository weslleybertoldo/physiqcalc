#!/usr/bin/env python3
"""Smoke de UI — aba Treino nova (W8, tela 2): remover exercício (só hoje / de vez, com Restaurar) + OK inicia o treino.

Prova:
  1. o link abre JÁ LOGADO na aba Treino (contexto limpo)
  2. "Remover" em cada exercício → "Só neste dia" (com o dia) / "De vez" ("vale para os próximos treinos")
  3. escolher → "Confirma?" (Voltar volta às opções) → confirmar remove
  4. só hoje: some hoje e continua nos outros dias; "Removidos" com "SÓ HOJE" e Restaurar
  5. de vez: some em todos os dias ("DE VEZ"); Restaurar volta
  6. OK numa série inicia o treino (pílula vermelha + "Treino iniciado"); OK de novo NÃO reinicia (início igual)
  7. Remover em exercício com série concluída é bloqueado (aviso)
  8. volta a internet: a remoção do dia sobe para o staging com exercício novo NULL e a data (a regra do banco aceita)
P20: roda SEM INTERNET depois do 1º sync (local e staging leem o public e gravam o staging — ver e2e/w08/_base.py); nada no
public. No fim apaga do staging o que a conta de teste gravou.

Uso: python3 scripts/smoke_ui_remover_exercicio.py [--base http://localhost:5173] [--prefixo local]
"""
from __future__ import annotations

import argparse
import datetime as dt
import importlib.util
import json
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
_ESPEC = importlib.util.spec_from_file_location("_base_w08", Path(__file__).resolve().parent.parent / "e2e" / "w08" / "_base.py")
B = importlib.util.module_from_spec(_ESPEC)
sys.modules["_base_w08"] = B
_ESPEC.loader.exec_module(B)  # type: ignore[union-attr]
from playwright.sync_api import sync_playwright  # noqa: E402

p = B.p


def toasts(c) -> str:
    return B.toasts(c)


def abrir_remover(c, ex_id: str):
    B.abrir_exercicio(c, ex_id)
    B.linha(c, ex_id).locator('[data-acao-exercicio="remover"]').click()
    folha = c.pg.locator("[data-modal-remover-exercicio]")
    c.esperar(lambda: folha.count() == 1, 8)
    return folha


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:5173")
    ap.add_argument("--prefixo", default="local")
    a = ap.parse_args()
    B.ESTADO["schema"] = "staging"
    if not B.saude_treino():
        print("Banco do Treino fora do normal — parando sem testar.")
        return 2
    desde = B.agora_iso()
    hoje, amanha = B.hoje(), B.hoje() + dt.timedelta(days=1)
    rotulo_hoje = f"{['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'][hoje.weekday()]} {hoje:%d/%m}"
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        c = B.abrir_treino(nav, a.base, a.prefixo, "remover_exercicio")
        try:
            B.sem_internet(c)
            B.ir_para_dia(c, amanha)
            B.escolher_treino_do_dia(c)
            B.ir_para_dia(c, hoje)
            p.check(B.escolher_treino_do_dia(c), f"hoje e amanhã com {B.GRUPO_NOME}")
            exs = B.exercicios(c)
            p.check(len(exs) >= 3, f"{len(exs)} exercícios no treino")
            ex_id, ex_def, ex_ok = exs[0], exs[1], exs[2]
            nome = B.linha(c, ex_id).locator("[data-exercicio-nome]").inner_text()

            print("== 1. Remover → só neste dia ou de vez → Confirma? ==", flush=True)
            B.abrir_exercicio(c, ex_id)
            p.check(B.linha(c, ex_id).locator('[data-acao-exercicio="remover"]').count() == 1, "o exercício aberto tem 'Remover' (junto de Ficha, Histórico, Anotações, Trocar)")
            folha = abrir_remover(c, ex_id)
            t = folha.inner_text()
            p.check(nome in c.texto(), "a folha abre com o nome do exercício")
            p.check("Só neste dia" in t and rotulo_hoje in t, f"opção 'Só neste dia' com o dia ({rotulo_hoje})")
            p.check("De vez" in t and "vale para os próximos treinos" in t, "opção 'De vez' com 'vale para os próximos treinos'")
            c.print("remover_opcoes")
            folha.locator("[data-remover-opcao='dia']").click()
            p.check("Confirma?" in folha.inner_text(), "a 2ª etapa pergunta 'Confirma?'")
            folha.locator("[data-remover-voltar]").click()
            p.check(folha.locator("[data-remover-opcao='dia']").count() == 1, "Voltar volta às 2 opções")
            folha.locator("[data-remover-opcao='dia']").click()
            folha.locator("[data-remover-confirmar]").click()
            c.esperar(lambda: B.linha(c, ex_id).count() == 0, 10)
            p.check(B.linha(c, ex_id).count() == 0, "sumiu do treino de hoje")
            rem = c.pg.locator("[data-removidos]")
            p.check(rem.count() == 1 and nome in rem.inner_text() and "SÓ HOJE" in rem.inner_text().upper() and rem.locator(f"[data-restaurar='{ex_id}']").count() == 1,
                    "'Removidos' com o nome, 'SÓ HOJE' e Restaurar")
            p.check("Removido só em" in toasts(c), "aviso 'Removido só em <dia>'")
            B.ir_para_dia(c, amanha)
            c.esperar(lambda: B.linha(c, ex_id).count() == 1, 8)
            p.check(B.linha(c, ex_id).count() == 1, f"em {amanha:%d/%m} continua (a remoção foi só do dia)")
            B.ir_para_dia(c, hoje)
            c.esperar(lambda: c.tem("[data-removidos]"), 8)
            p.check(B.linha(c, ex_id).count() == 0, "de volta a hoje, continua removido")
            c.pg.locator(f"[data-restaurar='{ex_id}']").click()
            c.esperar(lambda: B.linha(c, ex_id).count() == 1, 8)
            p.check(B.linha(c, ex_id).count() == 1, "Restaurar traz o exercício de volta")
            p.check(c.pg.locator("[data-removidos]").count() == 0, "a lista de removidos some")

            print("== 2. De vez: some em todos os dias; Restaurar volta ==", flush=True)
            folha = abrir_remover(c, ex_def)
            folha.locator("[data-remover-opcao='definitiva']").click()
            conf = folha.inner_text()
            p.check("Confirma?" in conf and "próximos treinos" in conf, "a confirmação do 'de vez' explica que vale nos próximos treinos")
            folha.locator("[data-remover-confirmar]").click()
            c.esperar(lambda: B.linha(c, ex_def).count() == 0, 10)
            selo = c.pg.locator("[data-removidos]").inner_text().upper() if c.pg.locator("[data-removidos]").count() else ""
            p.check("DE VEZ" in selo, "'Removidos' mostra 'DE VEZ'")
            B.ir_para_dia(c, amanha)
            c.pg.wait_for_timeout(700)
            p.check(B.linha(c, ex_def).count() == 0, f"em {amanha:%d/%m} também sumiu (de vez)")
            B.ir_para_dia(c, hoje)
            c.esperar(lambda: c.pg.locator(f"[data-restaurar='{ex_def}']").count() == 1, 8)
            c.pg.locator(f"[data-restaurar='{ex_def}']").click()
            c.esperar(lambda: B.linha(c, ex_def).count() == 1, 8)
            p.check(B.linha(c, ex_def).count() == 1, "Restaurar do 'de vez' traz de volta")

            print("== 3. OK inicia o treino; OK de novo não reinicia ==", flush=True)
            p.check(c.tem("[data-comecar-treino]") and not c.tem("[data-pilula-tempo]"), "antes: 'Começar treino' e nada rodando")
            p.check(B.ok_na_primeira_serie(c, ex_ok), "exercício com série para dar OK")
            c.esperar(lambda: c.tem("[data-pilula-tempo]"), 8)
            p.check(c.tem("[data-pilula-tempo]") and not c.tem("[data-comecar-treino]"), "depois do OK: a pílula vermelha e sem 'Começar treino'")
            p.check("Treino iniciado" in toasts(c), "aviso 'Treino iniciado'")
            inicio1 = json.loads(c.pg.evaluate("localStorage.getItem('physiq_workout_timer') || 'null'") or "null")
            p.check(bool(inicio1 and inicio1.get("ativo")), "o cronômetro ficou salvo no aparelho (physiq_workout_timer)")
            B.pular_descanso(c)
            c.pg.wait_for_timeout(1200)
            B.ok_na_primeira_serie(c, ex_ok)
            inicio2 = json.loads(c.pg.evaluate("localStorage.getItem('physiq_workout_timer') || 'null'") or "null")
            p.check(inicio1 and inicio2 and inicio1["startedAt"] == inicio2["startedAt"], "o início não mudou (não reiniciou)")
            B.pular_descanso(c)

            print("== 4. Remover com série concluída é bloqueado ==", flush=True)
            B.linha(c, ex_ok).locator('[data-acao-exercicio="remover"]').click()
            c.pg.wait_for_timeout(600)
            p.check(c.pg.locator("[data-modal-remover-exercicio]").count() == 0, "a folha NÃO abre")
            p.check("série concluída" in toasts(c), "o aviso explica que já tem série concluída")

            print("== 5. volta a internet → a remoção do dia sobe para o staging ==", flush=True)
            # uma remoção só do dia fica pendente para subir (a de antes foi restaurada)
            ex_rem = B.exercicios(c)[-1]
            folha = abrir_remover(c, ex_rem)
            folha.locator("[data-remover-opcao='dia']").click()
            folha.locator("[data-remover-confirmar]").click()
            c.esperar(lambda: B.linha(c, ex_rem).count() == 0, 10)
            B.sem_internet(c, False)
            p.check(B.esperar_fila_vazia(c, 120), "a fila do PowerSync esvaziou")
            ok = B.esperar_staging(lambda: len(B.sql_treino(
                f"select 1 from staging.exercicio_substituicao_usuario where user_id='{B.USER_TESTE}' and exercicio_origem_id='{ex_rem}' "
                f"and data_treino='{hoje.isoformat()}' and exercicio_novo_id is null and exercicio_novo_usuario_id is null and created_at >= '{desde}'")) == 1, 60)
            p.check(ok, "staging: a linha da remoção (exercício novo NULL, com a data) subiu")
            graves = [x for x in c.console if x.startswith("error") and "ERR_INTERNET_DISCONNECTED" not in x and "Failed to fetch" not in x and "Failed to load resource" not in x and "Upload error" not in x]
            p.check(not graves, f"sem erro de console fora os da falta de internet ({graves[:2]})")
        finally:
            c.fim()
            nav.close()
    time.sleep(3)
    B.limpar_staging(desde, "fim do smoke")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
