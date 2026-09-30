#!/usr/bin/env python3
"""Smoke de UI (regressão) — aba Treino nova (W8, tela 2): fim de treino depois de trocar/remover exercícios + troca definitiva.

Bugs cobertos (26/08/2026), agora na tela nova:
  1. Trocar/remover exercício NO MEIO do treino deixava séries padrão órfãs → o cronômetro nunca perguntava "Treino foi
     concluído?".
  2. Troca DEFINITIVA feita por cima de uma troca DO DIA gravava no banco, mas a do dia escondia a definitiva.

Adaptação da W8 (P20: o PowerSync de desenvolvimento está parado — local e staging LEEM o public e GRAVAM o staging): o
roteiro roda SEM INTERNET depois do 1º sync (o SQLite do aparelho é a verdade da tela, como no celular sem rede) e, quando a
internet volta, confere que a fila do PowerSync subiu para o staging (troca definitiva, histórico, concluído). Nada é gravado
no public. No fim, apaga do staging o que a conta de teste gravou durante o teste.

Roteiro (conta teste@teste.com; o treino do profissional "Peito + tríceps" posto hoje e amanhã pelo próprio app):
  1. abre já logado (contexto limpo); treino do dia com os exercícios do grupo
  2. troca SÓ HOJE: Tríceps Testa → Remada Aberta (selo "trocado")
  3. troca DEFINITIVA por cima: Remada Aberta → Remada Fechada aparece NA HORA (bug 2) e vale amanhã
  4. remove Corrida (de vez) e Crucifixo (só hoje) → "Removidos" com Restaurar dos 2
  5. OK em TODAS as séries → "Treino foi concluído?" (bug 1); o descanso abre na 1ª e segue o relógio; a última não abre
  6. "Não, continuar" → Refazer + OK pergunta de novo → "Sim, finalizar" → "Treino finalizado!" + card concluído
  7. volta a internet → staging recebe 1 troca definitiva, o histórico com os exercícios e o concluído de hoje

Uso: python3 scripts/smoke_ui_fim_treino_trocas.py [--base http://localhost:5173] [--prefixo local]
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
EX_ORIGEM = "c7016a9d-1af3-4238-929f-adae75005ce6"   # Tríceps Testa (programado no grupo)
EX_DIA = "37da252b-86db-4cf8-ad90-735a0c23c75e"      # Remada Aberta na Máquina (troca só hoje)
EX_DEF = "b7a120f0-5efb-474a-bdaf-d13acfaceef8"      # Remada Fechada na Máquina (troca definitiva)
EX_CORRIDA = "4a151e92-a1f1-473d-a6df-51235d68d77c"  # removida de vez
EX_CRUCIFIXO = "aa61d549-d952-4ee9-94ac-2f76ed29b063"  # removida só hoje


def trocar(c, ex_na_tela: str, escopo: str, busca: str, novo_id: str) -> None:
    B.abrir_exercicio(c, ex_na_tela)
    B.linha(c, ex_na_tela).locator('[data-acao-exercicio="trocar"]').click()
    dlg = c.pg.locator("[role='dialog']:has-text('Trocar exercício')")
    dlg.wait_for(timeout=10000)
    dlg.locator("button:has-text('Só neste dia')" if escopo == "dia" else "button:has-text('Definitiva')").click()
    dlg.locator("input[type='text']").first.fill(busca)
    opcao = dlg.locator(f"label[data-trocar-opcao='{novo_id}']")
    opcao.wait_for(timeout=10000)
    opcao.locator("input").click()
    dlg.locator("button:has-text('Salvar troca por')").click()
    c.pg.wait_for_selector("[role='dialog']:has-text('Trocar exercício')", state="detached", timeout=10000)
    c.pg.wait_for_timeout(500)


def remover(c, ex_id: str, escopo: str) -> None:
    B.abrir_exercicio(c, ex_id)
    B.linha(c, ex_id).locator('[data-acao-exercicio="remover"]').click()
    folha = c.pg.locator("[data-modal-remover-exercicio]")
    folha.wait_for(timeout=10000)
    folha.locator(f"[data-remover-opcao='{escopo}']").click()
    folha.locator("[data-remover-confirmar]").click()
    c.pg.wait_for_selector(f"[data-exercicio-id='{ex_id}']", state="detached", timeout=15000)
    c.pg.wait_for_timeout(300)


def toasts(c) -> str:
    return B.toasts(c)


def fim(c):
    return c.pg.locator("[data-fim-texto]")


def descanso_segue_o_relogio(c) -> None:
    """O restante deriva do início salvo (relógio real): nada de re-ancorar a cada tick; 'voltar do segundo plano' pula."""
    st1 = json.loads(c.pg.evaluate("localStorage.getItem('physiq_rest_timer')"))
    c.pg.wait_for_timeout(2500)
    st2 = json.loads(c.pg.evaluate("localStorage.getItem('physiq_rest_timer')"))
    p.check(st1["startedAt"] == st2["startedAt"], f"descanso: o início salvo NÃO é re-ancorado a cada tick ({st1['startedAt']} → {st2['startedAt']})")
    c.pg.evaluate("() => { const s = JSON.parse(localStorage.getItem('physiq_rest_timer')); s.startedAt -= 40000; localStorage.setItem('physiq_rest_timer', JSON.stringify(s)); }")
    c.pg.wait_for_timeout(1600)
    esperado = c.pg.evaluate("() => { const s = JSON.parse(localStorage.getItem('physiq_rest_timer')); return Math.max(0, s.duracao - Math.floor((Date.now() - s.startedAt) / 1000)); }")
    m, s = B.texto(c, "[data-descanso-tempo]").strip().split(":")
    mostrado = int(m) * 60 + int(s)
    p.check(abs(mostrado - esperado) <= 2, f"descanso: a tela segue o relógio ao 'voltar do segundo plano' (tela {mostrado}s · esperado {esperado}s)")


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
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        c = B.abrir_treino(nav, a.base, a.prefixo, "fim_treino_trocas")
        try:
            print("== 1. sem internet, o treino do profissional hoje e amanhã (pelo app) ==", flush=True)
            B.sem_internet(c)
            p.check(c.tem('[data-sync="offline"]'), "sem internet: o aviso de que o treino fica salvo no aparelho")
            B.ir_para_dia(c, amanha)
            p.check(B.escolher_treino_do_dia(c), f"amanhã ({amanha:%d/%m}) com {B.GRUPO_NOME}")
            B.ir_para_dia(c, hoje)
            p.check(B.escolher_treino_do_dia(c), f"hoje ({hoje:%d/%m}) com {B.GRUPO_NOME}")
            exs = B.exercicios(c)
            p.check(EX_ORIGEM in exs and EX_CORRIDA in exs and EX_CRUCIFIXO in exs, f"treino do dia com os {len(exs)} exercícios do grupo")
            n0 = len(exs)

            print("== 2. troca SÓ HOJE: Tríceps Testa → Remada Aberta ==", flush=True)
            trocar(c, EX_ORIGEM, "dia", "Remada Aberta", EX_DIA)
            c.esperar(lambda: B.linha(c, EX_DIA).count() == 1, 10)
            p.check(B.linha(c, EX_DIA).count() == 1 and B.linha(c, EX_ORIGEM).count() == 0, "Remada Aberta entrou no lugar")
            p.check("trocado" in B.linha(c, EX_DIA).inner_text(), "selo 'trocado' na linha")
            p.check("Trocado só hoje" in toasts(c), "aviso 'Trocado só hoje'")

            print("== 3. troca DEFINITIVA por cima: Remada Aberta → Remada Fechada (bug 2) ==", flush=True)
            trocar(c, EX_DIA, "definitiva", "Remada Fechada", EX_DEF)
            apareceu = c.esperar(lambda: B.linha(c, EX_DEF).count() == 1, 10)
            p.check(apareceu and B.linha(c, EX_DIA).count() == 0, "Remada Fechada aparece HOJE na hora (a do dia não esconde a definitiva)")
            p.check(apareceu and "trocado" in B.linha(c, EX_DEF).inner_text(), "selo 'trocado' na troca definitiva")
            B.ir_para_dia(c, amanha)
            c.esperar(lambda: B.linha(c, EX_DEF).count() == 1, 10)
            p.check(B.linha(c, EX_DEF).count() == 1 and B.linha(c, EX_ORIGEM).count() == 0, f"amanhã ({amanha:%d/%m}) também com Remada Fechada (definitiva)")
            B.ir_para_dia(c, hoje)
            c.esperar(lambda: B.linha(c, EX_DEF).count() == 1, 10)

            print("== 4. remover Corrida (de vez) e Crucifixo (só hoje) ==", flush=True)
            remover(c, EX_CORRIDA, "definitiva")
            remover(c, EX_CRUCIFIXO, "dia")
            n = len(B.exercicios(c))
            p.check(n == n0 - 2, f"restaram {n} exercícios (eram {n0})")
            rem = c.pg.locator("[data-removidos]")
            p.check(rem.count() == 1 and rem.locator(f"[data-restaurar='{EX_CORRIDA}']").count() == 1 and rem.locator(f"[data-restaurar='{EX_CRUCIFIXO}']").count() == 1,
                    "'Removidos' com Restaurar dos 2")
            c.print("fim_treino_lista")

            print("== 5. OK em todas as séries → 'Treino foi concluído?' (bug 1) ==", flush=True)
            p.check(c.tem("[data-comecar-treino]"), "antes: 'Começar treino' no card")
            total = 0
            restantes = B.exercicios(c)
            for ex in restantes:
                while True:
                    B.abrir_exercicio(c, ex)
                    oks = B.linha(c, ex).locator("[data-serie-ok]")
                    if oks.count() == 0:
                        break
                    oks.first.click()
                    total += 1
                    c.pg.wait_for_timeout(300)
                    if total == 1:
                        p.check(c.esperar(lambda: c.tem("[data-pilula-tempo]"), 8), "1ª série: o cronômetro do treino começa (pílula vermelha)")
                        p.check(c.esperar(lambda: c.tem("[data-descanso]"), 6), "1ª série: o descanso abre")
                        p.check(B.texto(c, "[data-descanso-depois]").startswith("Depois: série 2"), f"o card diz a próxima série ({B.texto(c, '[data-descanso-depois]')})")
                        c.print("fim_treino_descanso")
                        descanso_segue_o_relogio(c)
                    if c.tem("[data-fim-texto]"):
                        break
                    B.pular_descanso(c)
                if c.tem("[data-fim-texto]"):
                    break
            print(f"     {total} séries com OK", flush=True)
            apareceu = c.esperar(lambda: c.tem("[data-fim-texto]"), 10)
            p.check(apareceu, "'Treino foi concluído?' apareceu mesmo com 1 troca + 2 remoções")
            if apareceu:
                p.check(f"Todas as séries de {B.GRUPO_NOME}" in B.texto(c, "[data-fim-texto]"), "o texto cita 'Todas as séries de Peito + tríceps'")
            c.pg.wait_for_timeout(600)
            p.check(not c.tem("[data-descanso]"), "a última série do treino NÃO abre o descanso")

            print("== 6. Não, continuar → Refazer + OK pergunta de novo → Sim, finalizar ==", flush=True)
            if apareceu:
                c.pg.locator("[data-fim-nao]").click()
                c.esperar(lambda: not c.tem("[data-fim-texto]"), 5)
                p.check(not c.tem("[data-fim-texto]") and c.tem("[data-pilula-tempo]"), "'Não' fecha e o cronômetro segue")
                ultimo = restantes[-1]
                B.abrir_exercicio(c, ultimo)
                B.linha(c, ultimo).locator("[data-serie-refazer]").last.click()
                c.pg.wait_for_timeout(500)
                p.check(B.linha(c, ultimo).locator("[data-serie-ok]").count() == 1, "Refazer reabre a série (OK de volta)")
                B.linha(c, ultimo).locator("[data-serie-ok]").first.click()
                c.pg.wait_for_timeout(700)
                p.check(not c.tem("[data-descanso]"), "refazer a última e concluir de novo também NÃO abre o descanso")
                de_novo = c.esperar(lambda: c.tem("[data-fim-texto]"), 10)
                p.check(de_novo, "concluir de novo pergunta de novo (1 vez por transição)")
                if de_novo:
                    c.pg.locator("[data-fim-sim]").click()
                    p.check(c.esperar(lambda: c.tem("[data-treino-finalizado]"), 15), "'Sim, finalizar' → 'Treino finalizado!' com os números")
                    c.print("fim_treino_concluido")
                    p.check("Treino concluído em" in toasts(c), "aviso 'Treino concluído em …'")
                    c.pg.locator("[data-concluido-fechar]").click()
                    c.pg.wait_for_timeout(500)
                    p.check(c.esperar(lambda: c.tem("[data-treino-feito]"), 8), "card do treino: TREINO CONCLUÍDO (+ Compartilhar)")
                    p.check(not c.tem("[data-pilula-tempo]"), "o cronômetro parou")

            print("== 7. volta a internet → a fila sobe para o staging ==", flush=True)
            pend = B.fila_pendente(c)
            p.check(pend > 0, f"sem internet, as mudanças esperavam no aparelho ({pend})")
            B.sem_internet(c, False)
            p.check(B.esperar_fila_vazia(c, 120), "com a internet de volta, a fila do PowerSync esvaziou")
            ok_def = B.esperar_staging(lambda: len(B.sql_treino(
                f"select 1 from staging.exercicio_substituicao_usuario where user_id='{B.USER_TESTE}' and exercicio_origem_id='{EX_ORIGEM}' and data_treino is null and exercicio_novo_id='{EX_DEF}' and created_at >= '{desde}'")) == 1, 60)
            p.check(ok_def, "staging: a troca definitiva (Tríceps Testa → Remada Fechada) subiu")
            hist = B.sql_treino(f"select exercicios_concluidos from staging.treino_historico where user_id='{B.USER_TESTE}' and created_at >= '{desde}' order by created_at desc limit 1")
            if hist:
                exs = hist[0]["exercicios_concluidos"]
                for _ in range(2):
                    if isinstance(exs, str):
                        exs = json.loads(exs)
                ids = {e["exercicio_id"] for e in exs}
                p.check(EX_DEF in ids and not ({EX_ORIGEM, EX_DIA, EX_CORRIDA, EX_CRUCIFIXO} & ids), f"staging: histórico com {len(exs)} exercícios, com Remada Fechada e SEM os trocados/removidos")
            else:
                p.check(False, "staging: o treino do histórico subiu")
            p.check(B.conta_staging("tb_treino_concluido", desde, extra=f"and data_treino='{hoje.isoformat()}'") == 1, "staging: treino de hoje marcado como concluído")
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
