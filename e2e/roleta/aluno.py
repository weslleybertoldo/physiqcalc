#!/usr/bin/env python3
"""Physiq — a roleta do tempo no app do aluno, de verdade (09/11/2026). Pedidos do Weslley: "não tem como colocar tipo o relógio? E eu
seleciono quanto tempo foi?" (o Tempo da corrida pedia "00:19" e o teclado numérico do celular não tem o ":"; a série fechava como
"0 kg × 0") e "eu seleciono um tempo 1 min e vai na contagem regressiva" (a Prancha).

Conta de TESTE temporária (e2e/CONTAS_DE_TESTE.md) com o treino de hoje: a Corrida na Esteira, a Prancha (sem meta) e a Prancha Lateral
(meta de 30 s do profissional). O app local abre já logado (o login de dev do vite.config.gate.ts, nunca commitado) e grava no banco
de verdade, só nas contas de teste:
  1. Corrida: o Tempo é um botão (nada de teclado); a roleta abre com horas · min · seg; o DEDO rola a coluna dos minutos e ela
     encaixa num número; 19 min + 2,2 km → "19:00", o pace 8:38 /km e, no OK, a série feita "19:00 · 2,2 km · pace 8:38 /km" — no
     banco do Treino, tempo 1140 s e 2,2 km.
  2. Prancha (sem meta): a roleta só com min · seg; 5 s escolhidos → o ▶ conta 00:05 pra trás e fecha a série com 5 s; a S2 sem tempo
     → o ▶ conta pra cima e o Parar fecha com o que segurou.
  3. Prancha Lateral (meta 30 s): o campo vem com a meta; 4 s escolhidos passam por cima dela → conta 00:04 pra trás.
  4. No fim, Refazer em tudo (a conta fica pronta para o teste dele).

Uso: python3 e2e/roleta/aluno.py --base http://localhost:5173 --aluno-treino <uuid do aluno no Treino>
Prints (390 × 844 × 3): ~/projetos/physiqcalc-scratch/prints/roleta/<prefixo>_*.png
"""
from __future__ import annotations

import argparse
import datetime as dt
import importlib.util
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
RAIZ = Path(__file__).resolve().parent.parent


def _carregar(nome: str, caminho: Path):
    esp = importlib.util.spec_from_file_location(nome, caminho)
    mod = importlib.util.module_from_spec(esp)
    sys.modules[nome] = mod
    esp.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


C = _carregar("_comum_roleta", RAIZ / "w02" / "_comum.py")
from playwright.sync_api import sync_playwright  # noqa: E402

CORRIDA = "4a151e92-a1f1-473d-a6df-51235d68d77c"  # Corrida na Esteira (tipo corrida)
PRANCHA = "217d3ff2-62d0-5df4-90f8-600677209cf2"
LATERAL = "88f946d5-46f3-5c84-8fdc-f114d9ed805a"
ALTURA_ITEM = 44  # src/treino/roletaTempo.ts
PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "roleta"
resultado = {"ok": 0, "itens": 0}


def check(ok: bool, texto: str) -> bool:
    resultado["itens"] += 1
    resultado["ok"] += int(bool(ok))
    print(("✅ " if ok else "❌ ") + texto, flush=True)
    return bool(ok)


def esperar(pg, cond, timeout: float, passo: float = 0.3) -> bool:
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if cond():
                return True
        except Exception:  # noqa: BLE001
            pass
        pg.wait_for_timeout(passo * 1000)
    return False


def tem(pg, sel: str) -> bool:
    loc = pg.locator(sel)
    return loc.count() > 0 and loc.first.is_visible()


def series_no_banco(aluno: str, ex: str) -> list[dict]:
    hoje = dt.datetime.now(dt.timezone(dt.timedelta(hours=-3))).date().isoformat()
    return C.sql_mgmt(C.TREINO_REF, f"""set transaction read only;
        select numero_serie, tempo_segundos, distancia_km::float as km, concluida from public.tb_treino_series
         where user_id = '{aluno}' and data_treino = '{hoje}' and exercicio_id = '{ex}' order by numero_serie""") or []


class Tela:
    def __init__(self, pg, prefixo: str):
        self.pg = pg
        self.prefixo = prefixo

    def print(self, nome: str) -> Path:
        PRINTS.mkdir(parents=True, exist_ok=True)
        arq = PRINTS / f"{self.prefixo}_{nome}.png"
        self.pg.screenshot(path=str(arq))
        print(f"   📸 {arq}", flush=True)
        return arq

    def exercicio(self, ex: str):
        return self.pg.locator(f'[data-exercicio-id="{ex}"]').first

    def abrir_exercicio(self, ex: str):
        e = self.exercicio(ex)
        e.scroll_into_view_if_needed()
        if e.get_attribute("data-aberto") != "1":
            e.locator("[data-exercicio-abrir]").first.click()
            esperar(self.pg, lambda: e.get_attribute("data-aberto") == "1", 10)
        self.pg.wait_for_timeout(400)
        return e

    def serie(self, ex: str, n: int):
        return self.pg.locator(f'[data-exercicio-id="{ex}"] [data-serie="{n}"]').first

    def pular_descanso(self) -> None:
        if esperar(self.pg, lambda: tem(self.pg, "[data-descanso-pular]"), 3):
            self.pg.locator("[data-descanso-pular]").first.click()
            self.pg.wait_for_timeout(500)

    def coluna(self, nome: str):
        return self.pg.locator(f'[data-roleta-coluna="{nome}"]').first

    def valor(self, nome: str) -> int:
        return int(self.coluna(nome).get_attribute("aria-valuenow") or "-1")

    def tocar_item(self, nome: str, n: int) -> None:
        self.coluna(nome).locator(f'[data-roleta-item="{n}"]').first.click()
        esperar(self.pg, lambda: self.valor(nome) == n, 3)
        self.pg.wait_for_timeout(450)  # a rolagem suave termina

    def confirmar(self) -> None:
        self.pg.locator("[data-roleta-confirmar]").first.click()
        esperar(self.pg, lambda: not tem(self.pg, "[data-roleta-tempo]"), 5)
        self.pg.wait_for_timeout(500)


def zerar_pela_roleta(t: Tela, ex: str, n: int) -> bool:
    """Rodada repetida: a série já tem um tempo salvo hoje → zero na roleta deixa o campo vazio (é o próprio comportamento novo).
    Devolve True se precisou zerar."""
    campo = t.serie(ex, n).locator("[data-campo-tempo]")
    if "sem tempo" in (campo.get_attribute("aria-label") or ""):
        return False
    campo.click()
    esperar(t.pg, lambda: tem(t.pg, "[data-roleta-tempo]"), 5)
    t.pg.wait_for_timeout(500)
    t.tocar_item("Min", 0)
    t.tocar_item("Seg", 0)
    t.confirmar()
    return True


def caso_corrida(t: Tela, aluno: str, cdp) -> None:
    pg = t.pg
    t.abrir_exercicio(CORRIDA)
    s1 = t.serie(CORRIDA, 1)
    campo = s1.locator("[data-campo-tempo]")
    check(campo.count() == 1 and campo.evaluate("e => e.tagName") == "BUTTON", "Corrida: o Tempo é um botão (não abre teclado)")
    check(s1.locator("input[aria-label^='Tempo']").count() == 0, "Corrida: não sobrou campo de digitar o tempo")
    km = s1.locator("input[aria-label^='Distância']").first
    km.fill("2.2")
    campo.click()
    abriu = esperar(pg, lambda: tem(pg, "[data-roleta-tempo]"), 5)
    pg.wait_for_timeout(500)  # a folha termina de subir
    check(abriu and all(t.coluna(c).count() == 1 for c in ("Horas", "Min", "Seg")), "Corrida: a roleta abre com Horas · Min · Seg")
    t.print("1_corrida_roleta_aberta")

    # o DEDO rola a coluna dos minutos (toque de verdade: encosta, arrasta pra cima e solta) e ela encaixa num número.
    # (o Input.synthesizeScrollGesture de toque não rola nada no Chromium sem tela — nem a página; os eventos crus rolam)
    antes = t.valor("Min")
    caixa = t.coluna("Min").bounding_box()
    cx, base = caixa["x"] + caixa["width"] / 2, caixa["y"] + caixa["height"] / 2 + 90
    for _ in range(2):  # 2 arrastos de 4 números (176 px cada)
        cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": cx, "y": base}]})
        for i in range(1, 17):
            cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": cx, "y": base - i * 11}]})
            pg.wait_for_timeout(20)
        pg.wait_for_timeout(150)  # o dedo para antes de soltar: sem embalo
        cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        pg.wait_for_timeout(700)
    topo = t.coluna("Min").evaluate("e => e.scrollTop")
    v = t.valor("Min")
    check(v == round(topo / ALTURA_ITEM) and abs(topo - v * ALTURA_ITEM) <= 2, f"Corrida: o dedo rolou e a coluna encaixou num número ({antes} → {v}, scrollTop {topo:.0f})")
    check(5 <= v - antes <= 11, f"Corrida: 2 arrastos de 4 números andaram ~8 ({v - antes})")
    if v != 19:
        t.tocar_item("Min", 19)
    check(t.valor("Min") == 19, "Corrida: 19 minutos marcados na roleta")
    t.print("2_corrida_roleta_19min")
    t.confirmar()
    check(campo.inner_text().strip() == "19:00", f"Corrida: o Tempo mostra 19:00 ({campo.inner_text().strip()!r})")
    check("pace 8:38 /km" in s1.inner_text(), "Corrida: o pace aparece (8:38 /km)")
    t.print("3_corrida_tempo_escolhido")

    s1.locator("[data-serie-ok]").first.click()
    feita = t.pg.locator(f'[data-exercicio-id="{CORRIDA}"] [data-serie="1"][data-serie-feita]').first
    ok = esperar(pg, lambda: feita.count() > 0 and feita.is_visible(), 10)
    texto = feita.inner_text() if ok else ""
    check(ok and "19:00 · 2,2 km" in texto and "pace 8:38 /km" in texto, f"Corrida: a série feita mostra tempo, km e pace ({texto.strip()!r})")
    largura = feita.evaluate("e => [...e.querySelectorAll('.block')].every(b => b.scrollWidth <= b.clientWidth + 1)") if ok else False
    check(largura, "Corrida: o resumo cabe na linha (nada cortado com reticências em 390 px)")
    check(ok and "kg" not in texto, "Corrida: a série feita não mostra 'kg'")
    t.pular_descanso()
    t.exercicio(CORRIDA).scroll_into_view_if_needed()
    pg.wait_for_timeout(300)
    t.print("4_corrida_feita")

    linhas: list[dict] = []
    gravou = esperar(pg, lambda: bool(linhas.extend(series_no_banco(aluno, CORRIDA)) or True) and any(
        r["concluida"] and r["tempo_segundos"] == 1140 and abs((r["km"] or 0) - 2.2) < 1e-6 for r in linhas[-5:]), 90, 3)
    check(gravou, f"Corrida: no banco do Treino, S1 com 1140 s, 2,2 km e concluída ({linhas[-1:] if linhas else 'nada'})")


def caso_prancha(t: Tela, aluno: str) -> None:
    pg = t.pg
    t.abrir_exercicio(PRANCHA)
    s1 = t.serie(PRANCHA, 1)
    campo = s1.locator("[data-campo-tempo]")
    zerou = zerar_pela_roleta(t, PRANCHA, 1)
    zerar_pela_roleta(t, PRANCHA, 2)  # rodada repetida: a S2 também começa vazia (o print sai limpo)
    check("sem tempo" in (campo.get_attribute("aria-label") or ""),
          "Prancha: zero na roleta esvaziou o Tempo (rodada repetida)" if zerou else "Prancha: sem meta e sem histórico, o Tempo começa vazio")
    campo.click()
    esperar(pg, lambda: tem(pg, "[data-roleta-tempo]"), 5)
    pg.wait_for_timeout(500)
    check(t.coluna("Horas").count() == 0 and t.coluna("Min").count() == 1 and t.coluna("Seg").count() == 1, "Prancha: a roleta só tem Min · Seg")
    check(t.coluna("Min").get_attribute("aria-valuemax") == "10", "Prancha: os minutos vão até 10 (o teto da série por tempo)")
    t.tocar_item("Seg", 5)
    t.print("5_prancha_roleta_5s")
    t.confirmar()
    check(campo.inner_text().strip() == "00:05", f"Prancha: o Tempo mostra 00:05 ({campo.inner_text().strip()!r})")

    s1.locator("[data-serie-iniciar]").first.click()
    rodando = pg.locator(f'[data-exercicio-id="{PRANCHA}"] [data-serie="1"][data-serie-cronometro]').first
    esperar(pg, lambda: rodando.count() > 0, 3)
    modo = rodando.get_attribute("data-serie-cronometro") if rodando.count() else None
    mostrado = int(pg.locator("[data-cronometro-mostrado]").first.get_attribute("data-cronometro-mostrado") or "-1")
    check(modo == "meta" and 3 <= mostrado <= 5, f"Prancha: o ▶ conta pra TRÁS a partir de 00:05 (modo {modo}, mostrando {mostrado} s)")
    t.print("6_prancha_contando")
    feita = pg.locator(f'[data-exercicio-id="{PRANCHA}"] [data-serie="1"][data-serie-feita]').first
    fechou = esperar(pg, lambda: feita.count() > 0, 12)
    check(fechou and "5 s" in feita.inner_text(), f"Prancha: no fim fechou a série com 5 s ({feita.inner_text().strip() if fechou else 'não fechou'!r})")
    t.pular_descanso()
    t.exercicio(PRANCHA).scroll_into_view_if_needed()
    t.print("7_prancha_feita")

    s2 = t.serie(PRANCHA, 2)
    zerar_pela_roleta(t, PRANCHA, 2)
    if "sem tempo" in (s2.locator("[data-campo-tempo]").get_attribute("aria-label") or ""):
        s2.locator("[data-serie-iniciar]").first.click()
        livre = pg.locator(f'[data-exercicio-id="{PRANCHA}"] [data-serie="2"][data-serie-cronometro="livre"]').first
        check(esperar(pg, lambda: livre.count() > 0, 3), "Prancha: S2 sem tempo → o ▶ conta pra CIMA (como antes)")
        pg.wait_for_timeout(3200)
        pg.locator("[data-serie-parar]").first.click()
        feita2 = pg.locator(f'[data-exercicio-id="{PRANCHA}"] [data-serie="2"][data-serie-feita]').first
        ok2 = esperar(pg, lambda: feita2.count() > 0, 5)
        check(ok2 and any(f"{n} s" in feita2.inner_text() for n in (3, 4)), f"Prancha: o Parar fechou a S2 com o que segurou ({feita2.inner_text().strip() if ok2 else '-'!r})")
        t.pular_descanso()
    else:
        check(False, "Prancha: a S2 deveria ficar sem tempo (zero na roleta)")

    linhas: list[dict] = []
    gravou = esperar(pg, lambda: bool(linhas.extend(series_no_banco(aluno, PRANCHA)) or True) and any(
        r["numero_serie"] == 1 and r["concluida"] and r["tempo_segundos"] == 5 for r in linhas[-6:]), 90, 3)
    check(gravou, f"Prancha: no banco do Treino, S1 com 5 s e concluída ({[r for r in linhas[-6:] if r['numero_serie'] == 1][-1:]})")


def caso_lateral(t: Tela, aluno: str) -> None:
    pg = t.pg
    t.abrir_exercicio(LATERAL)
    s1 = t.serie(LATERAL, 1)
    campo = s1.locator("[data-campo-tempo]")
    mostra = campo.inner_text().strip()
    check("Tempo · meta 00:30" in s1.inner_text(), "Prancha Lateral: o rótulo mostra a meta do profissional (00:30)")
    if mostra == "00:30":
        check(True, "Prancha Lateral: o Tempo vem com a meta (conta nova)")
    else:
        print(f"   ℹ️ a série já tinha {mostra} salvo hoje (rodada repetida): o campo mostra o salvo, não a meta", flush=True)
    campo.click()
    esperar(pg, lambda: tem(pg, "[data-roleta-tempo]"), 5)
    pg.wait_for_timeout(500)
    mm, ss = (int(x) for x in mostra.split(":"))
    check(t.valor("Min") == mm and t.valor("Seg") == ss, f"Prancha Lateral: a roleta abre marcando o que o campo mostra ({mostra})")
    t.tocar_item("Seg", 4)
    t.confirmar()
    check(campo.inner_text().strip() == "00:04", "Prancha Lateral: o tempo escolhido (00:04) passa por cima da meta")
    s1.locator("[data-serie-iniciar]").first.click()
    pg.wait_for_timeout(400)
    mostrado = int(pg.locator("[data-cronometro-mostrado]").first.get_attribute("data-cronometro-mostrado") or "-1")
    check(2 <= mostrado <= 4, f"Prancha Lateral: conta 00:04 pra trás (mostrando {mostrado} s)")
    feita = pg.locator(f'[data-exercicio-id="{LATERAL}"] [data-serie="1"][data-serie-feita]').first
    fechou = esperar(pg, lambda: feita.count() > 0, 10)
    check(fechou and "4 s" in feita.inner_text(), "Prancha Lateral: fechou a série com 4 s")
    t.pular_descanso()
    t.exercicio(LATERAL).scroll_into_view_if_needed()
    t.print("8_lateral_feita")


def feitas_no_banco(aluno: str) -> int:
    hoje = dt.datetime.now(dt.timezone(dt.timedelta(hours=-3))).date().isoformat()
    r = C.sql_mgmt(C.TREINO_REF, f"""set transaction read only;
        select count(*)::int as n from public.tb_treino_series where user_id = '{aluno}' and data_treino = '{hoje}' and concluida""")
    return int((r or [{"n": -1}])[0]["n"])


def refazer_tudo(t: Tela, aluno: str) -> None:
    """Refazer em toda série feita e ESPERAR o banco: a fila do app só sobe com a página aberta (fechar logo perdia o Refazer)."""
    pg = t.pg
    sobrou = 0
    for ex in (CORRIDA, PRANCHA, LATERAL):  # o treino abre um exercício por vez: Refazer em cada um, aberto
        t.abrir_exercicio(ex)
        for _ in range(6):
            botoes = pg.locator(f'[data-exercicio-id="{ex}"] [data-serie-refazer]')
            if botoes.count() == 0:
                break
            botoes.first.click()
            pg.wait_for_timeout(700)
        sobrou += pg.locator(f'[data-exercicio-id="{ex}"] [data-serie-refazer]').count()
    check(sobrou == 0, "Refazer em todas as séries (um exercício aberto por vez)")
    check(esperar(pg, lambda: feitas_no_banco(aluno) == 0, 120, 3), "o banco do Treino ficou sem série feita (a conta pronta para a próxima rodada)")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:5173")
    ap.add_argument("--aluno-treino", required=True, help="id do aluno no banco do Treino (user_id das séries)")
    ap.add_argument("--prefixo", default="local")
    a = ap.parse_args()
    with sync_playwright() as pw:
        nav = pw.chromium.launch(headless=True)
        ctx = nav.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True,
                              locale="pt-BR", timezone_id="America/Sao_Paulo", service_workers="block")
        pg = ctx.new_page()
        erros: list[str] = []
        pg.on("pageerror", lambda e: erros.append(str(e)[:200]))
        cdp = ctx.new_cdp_session(pg)
        t = Tela(pg, a.prefixo)
        pg.goto(a.base + "/treino", wait_until="domcontentloaded")
        abriu = esperar(pg, lambda: tem(pg, "[data-aba-treino]") and tem(pg, "[data-cartao-treino]"), 120)
        check(abriu and not pg.evaluate("location.pathname").startswith("/entrar"), "abriu JÁ LOGADO na aba Treino")
        esperar(pg, lambda: not tem(pg, '[data-sync="primeira"]'), 90)
        pg.wait_for_timeout(1500)
        for _ in range(6):
            fechado = pg.locator('[data-treino-minimizar][aria-expanded="false"]')
            if fechado.count() == 0:
                break
            fechado.first.click()
            pg.wait_for_timeout(450)
        if feitas_no_banco(a.aluno_treino):
            refazer_tudo(t, a.aluno_treino)  # sobra de uma rodada anterior
        try:
            caso_corrida(t, a.aluno_treino, cdp)
            caso_prancha(t, a.aluno_treino)
            caso_lateral(t, a.aluno_treino)
        finally:
            refazer_tudo(t, a.aluno_treino)
            check(not erros, f"sem erro de página ({erros[-3:]})")
            ctx.close()
            nav.close()
    print(f"{resultado['ok']}/{resultado['itens']} PASS", flush=True)
    return 0 if resultado["ok"] == resultado["itens"] else 1


if __name__ == "__main__":
    sys.exit(main())
