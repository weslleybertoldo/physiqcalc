#!/usr/bin/env python3
"""Physiq — E2E de TELA do "Excluir minha conta" (agente F, 31/10/2026): o aluno com 2 matrículas VIVAS com o mesmo e-mail (o caso 1
— antes: 500 e o login ficava) exclui a conta pela tela do app, Perfil › Excluir minha conta (Playwright, contexto limpo, celular).

  massa      prof + aluno2 (aluno do app → a lista do prof: 2 matrículas vivas) + vizinho (aluno do prof, só olha) — _base/api.py
  negativo   a folha abre com o que sai e o que fica; SEM a palavra (campo vazio) e com a palavra ERRADA o botão fica travado e,
             tocado, nada sai: o login, as matrículas e o resto iguais (SQL só leitura)
  positivo   EXCLUIR digitado → "Sua conta foi excluída." → volta ao Entrar; o login SUMIU (hard delete), as 2 matrículas ficam com o
             profissional desligadas, o vínculo do Treino saiu, nada de outra pessoa mudou; a sessão de antes não abre mais o Perfil
  limpeza    o vizinho e o prof pelo PRÓPRIO "Excluir minha conta" (api.py limpar)
Prints (conferidos depois, um a um): ~/projetos/physiqcalc-scratch/excluir-conta/prints/<base>_<rodada>_NN_<passo>.png
Uso: python3 e2e/excluir_conta/telas.py --base local|staging|prod --rodada f3
     (local = o build de staging servido na máquina: npx vite preview --port 5173 --strictPort --host localhost)
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402
import api as A  # noqa: E402

p = B.p
BASES = {"local": "http://localhost:5173", "staging": "https://physiqcalc-staging.vercel.app", "prod": "https://physiqcalc.com.br"}
SCHEMA = {"local": "staging", "staging": "staging", "prod": "public"}
PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "excluir-conta" / "prints"
CHAVE_PRINCIPAL = "physiq-principal-auth"
PORTA = "[data-aceite-no-acesso]"
FOLHA = "[data-sheet-excluir]"


class Tela:
    def __init__(self, nav, base: str, rodada: str) -> None:
        self.base, self.url, self.rodada = base, BASES[base], rodada
        self.ctx = nav.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True,
                                   locale="pt-BR", timezone_id="America/Sao_Paulo", service_workers="block")
        self.pg = self.ctx.new_page()
        self.erros: list[str] = []
        self.rede: list[str] = []
        self.pg.on("pageerror", lambda e: self.erros.append(str(e)))
        self.pg.on("response", lambda r: self.rede.append(f"{r.status} {r.request.method} {r.url.split('?')[0][-48:]}")
                   if "/functions/v1/" in r.url and r.request.method != "OPTIONS" else None)
        if base == "local":
            # nenhum aviso de erro de verdade sai do local
            self.ctx.route("**/functions/v1/erro-avisar**", lambda rt: rt.fulfill(status=204, headers={
                "Access-Control-Allow-Origin": rt.request.headers.get("origin") or self.url, "Vary": "Origin"}))
        self.n = 0
        self.prints: list[str] = []

    def esperar(self, cond, timeout: float, passo: float = 0.5) -> bool:
        t0 = time.time()
        while time.time() - t0 < timeout:
            try:
                if cond():
                    return True
            except Exception:  # noqa: BLE001 — navegando
                pass
            self.pg.wait_for_timeout(passo * 1000)
        return False

    def tem(self, seletor: str) -> bool:
        loc = self.pg.locator(seletor)
        return loc.count() > 0 and loc.first.is_visible()

    def caminho(self) -> str:
        try:
            return self.pg.evaluate("location.pathname + location.search")
        except Exception:  # noqa: BLE001
            return ""

    def print(self, nome: str) -> str:
        PRINTS.mkdir(parents=True, exist_ok=True)
        self.n += 1
        arq = PRINTS / f"{self.base}_{self.rodada}_{self.n:02d}_{nome}.png"
        self.pg.wait_for_timeout(700)
        self.pg.screenshot(path=str(arq))
        self.prints.append(str(arq))
        return str(arq)

    def entrar(self, sess: dict, rota: str) -> None:
        """A sessão no aparelho (como o app grava depois do login) e a rota pedida."""
        self.pg.goto(self.url + "/privacidade", wait_until="domcontentloaded", timeout=60_000)
        self.pg.evaluate("""([k, v]) => { localStorage.setItem(k, v); localStorage.setItem('physiq_pendencia_avisada_em', new Date().toLocaleDateString('pt-BR'));
            localStorage.setItem('physiqcalc-pwa-dismissed', 'true'); }""", [CHAVE_PRINCIPAL, json.dumps(sess)])
        self.pg.goto(self.url + rota, wait_until="domcontentloaded", timeout=60_000)

    def passar_avisos(self) -> None:
        """A porta do aceite dos textos (a conta nova ainda não aceitou) e o aviso "o Physiq mudou", se aparecerem."""
        self.esperar(lambda: self.tem(PORTA) or self.tem("[data-aba-perfil]"), 60)
        if self.tem(PORTA):
            for sel in ("[data-aceite-caixa]", f"{PORTA} [data-consentimento-saude-caixa]"):
                loc = self.pg.locator(sel)
                if loc.count():
                    alvo = loc.first
                    caixa = alvo if alvo.get_attribute("type") == "checkbox" else alvo.locator("input[type='checkbox'], [role='checkbox']").first
                    try:
                        if caixa.count() and not caixa.is_checked():
                            caixa.check(timeout=5000)
                    except Exception:  # noqa: BLE001
                        alvo.click()
            data = self.pg.locator(f"{PORTA} [data-campo-nascimento] input[type='date']")
            if data.count() and data.first.is_visible():
                data.first.fill("1994-03-10")
            botao = self.pg.locator("[data-aceitar]").first
            self.esperar(lambda: botao.is_enabled(), 10)
            botao.click()
            p.check(self.esperar(lambda: not self.tem(PORTA), 60), "[tela] a porta do aceite dos textos: aceitou e seguiu")
        if self.esperar(lambda: self.tem("[data-aviso-mudanca-ok]"), 4):
            self.pg.locator("[data-aviso-mudanca-ok]").click()
            self.pg.wait_for_timeout(500)

    def abrir_folha(self) -> None:
        item = self.pg.locator("[data-aba-perfil]").get_by_text("Excluir minha conta", exact=True).first
        item.scroll_into_view_if_needed()
        item.click()
        self.esperar(lambda: self.tem(FOLHA), 20)
        self.esperar(lambda: self.pg.locator(FOLHA).first.get_attribute("data-estado-excluir") != "conferindo", 60)

    def estado_da_folha(self) -> str:
        return self.pg.locator(FOLHA).first.get_attribute("data-estado-excluir") or ""

    def fechar(self) -> None:
        graves = [e for e in self.erros if "ResizeObserver" not in e]
        p.check(not graves, f"[tela] sem erro de página ({graves[:2]})")
        self.ctx.close()


def rodar(base: str, r: str) -> int:
    s = SCHEMA[base]
    A.massa(s, r, papeis=("aluno2", "vizinho"))
    f0 = A.estado(s, r)
    p.check(len([m for m in f0["aluno2"]["matriculas"] if not m["lixeira"]]) == 2 and f0["aluno2"]["login"] == "vivo",
            f"[{base}] antes: o aluno2 tem 2 matrículas vivas e o login vivo")
    sess = B.sessao(r, "aluno2")
    with sync_playwright() as pw:
        nav = pw.chromium.launch(headless=True)
        t = Tela(nav, base, r)
        try:
            t.entrar(sess, "/perfil")
            t.passar_avisos()
            p.check(t.esperar(lambda: t.tem("[data-aba-perfil]"), 60), f"[{base}] o Perfil do aluno abriu ({t.caminho()})")
            t.print("antes_perfil")
            # ── o NEGATIVO: sem a palavra e com a palavra errada nada sai ──
            t.abrir_folha()
            p.check(t.estado_da_folha() == "pronto" and t.tem("[data-excluir-apaga]") and t.tem("[data-excluir-fica]"),
                    f"[{base}] a folha abriu com o que sai e o que fica (estado {t.estado_da_folha()!r})")
            fica = t.pg.locator("[data-excluir-fica]").first.inner_text()
            p.check("matrícula" in fica, f"[{base}] a folha diz que a matrícula fica com o profissional")
            t.print("dialogo")
            botao = t.pg.locator("[data-excluir-confirmar]").first
            p.check(botao.is_disabled(), f"[{base}] NEGATIVO sem confirmação: o botão Excluir fica travado com o campo vazio")
            t.pg.locator("[data-excluir-confirmacao]").first.fill("EXCLUI")
            p.check(botao.is_disabled(), f"[{base}] NEGATIVO palavra errada (EXCLUI): o botão continua travado")
            botao.click(force=True)  # o toque no botão travado não faz nada
            t.pg.wait_for_timeout(2500)
            t.print("negativo_palavra_errada")
            f1 = A.estado(s, r)
            p.check(f1 == f0, f"[{base}] NEGATIVO: nada saiu (o login, as 2 matrículas, o Treino e os outros iguais)")
            # ── o POSITIVO: EXCLUIR digitado → a conta sai inteira ──
            t.pg.locator("[data-excluir-confirmacao]").first.fill("EXCLUIR")
            p.check(t.esperar(lambda: botao.is_enabled(), 5), f"[{base}] com EXCLUIR o botão destrava")
            t.print("confirmacao_digitada")
            t0 = time.time()
            botao.click()
            saiu = t.esperar(lambda: t.caminho().startswith("/entrar"), 90)
            seg = round(time.time() - t0, 1)
            p.check(saiu, f"[{base}] POSITIVO: excluiu e voltou ao Entrar em {seg} s ({t.caminho()}; funções: {t.rede[-4:]})")
            t.print("depois_entrar")
            # a sessão de antes não abre mais o Perfil
            t.pg.goto(t.url + "/perfil", wait_until="domcontentloaded", timeout=60_000)
            p.check(t.esperar(lambda: t.caminho().startswith("/entrar"), 60), f"[{base}] depois: o Perfil pede login de novo ({t.caminho()})")
            t.print("depois_perfil_pede_login")
        finally:
            t.fechar()
            nav.close()
    f2 = A.estado(s, r)
    d = f2["aluno2"]
    vivas = [m for m in d["matriculas"] if not m["lixeira"]]
    p.check(d["login"] == "sumiu", f"[{base}] depois: o login SUMIU (hard delete) ({d['login']})")
    p.check(len(vivas) == 2 and all(m["sem_login"] and m["marcada"] and not m["ativo"] and m["email"] for m in vivas),
            f"[{base}] depois: as 2 matrículas ficam com o profissional, desligadas do login, inativas e marcadas")
    p.check(d["treino_vinculo"] == 0 and d["avisos"] == 0 and not d["perfil"], f"[{base}] depois: Treino, avisos e perfil fora")
    p.check(f2["impressao"] == f0["impressao"], f"[{base}] depois: NENHUM dado de outra pessoa mudou (o prof, o vizinho, a conta, a equipe)")
    try:
        B.sessao(r, "aluno2")
        entrou = True
    except Exception:  # noqa: BLE001
        entrou = False
    p.check(not entrou, f"[{base}] depois: o login não entra mais com a senha")
    est = B.ler_estado(s, r)
    est["tela"] = {"base": base, "prints": t.prints, "fim": d}
    B.gravar_estado(s, r, est)
    print("prints:", *t.prints, sep="\n  ")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", required=True, choices=list(BASES))
    ap.add_argument("--rodada", required=True)
    a = ap.parse_args()
    r = a.rodada.lower()
    B.email_de(r, "prof")
    rodar(a.base, r)
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
