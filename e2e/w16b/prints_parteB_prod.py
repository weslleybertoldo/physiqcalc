#!/usr/bin/env python3
"""Physiq W16b (Parte B) — PRINTS de PRODUÇÃO (https://physiqcalc.com.br) das 2 contas do Weslley depois da migração, só onde não
aparece aluno real. Sessão por link mágico gerado pela API admin do Auth (generate_link: NÃO manda e-mail, NÃO troca senha) e
injetada no aparelho, como nos E2E. A trava "Crie a sua senha" (senha provisória) é dispensada com "Agora não" — nenhuma senha muda.

  login antigo (aluno): app › Dieta (o plano de 30/09) e app › Treino (o treino dele)
  login novo (profissional + master): painel › Alunos da conta de treino FILTRADO pelo e-mail do login antigo (só ele na lista)
Uso: python3 e2e/w16b/prints_parteB_prod.py --de-email <e-mail> --para-email <e-mail> --para-id <uuid> --conta-treino <uuid>
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

S = "public"
B.ESTADO["schema"] = S
p = B.p
BASE = "https://physiqcalc.com.br"


def sessao_magica(email: str) -> dict:
    sp = B.service(B.PRINCIPAL_REF)
    cab = {"apikey": sp, "Authorization": f"Bearer {sp}"}
    st, r, _ = B.http("POST", f"{B.PRINCIPAL_URL}/auth/v1/admin/generate_link", {"type": "magiclink", "email": email}, cab)
    assert st == 200 and isinstance(r, dict), (st, str(r)[:200])
    th = r.get("hashed_token") or (r.get("properties") or {}).get("hashed_token")
    st, s, _ = B.http("POST", f"{B.PRINCIPAL_URL}/auth/v1/verify", {"type": "magiclink", "token_hash": th}, {"apikey": B.anon(B.PRINCIPAL_REF)})
    assert st == 200 and isinstance(s, dict) and s.get("access_token"), (st, str(s)[:200])
    return s


def abrir(nav, sess: dict, rota: str, desktop: bool, nome: str, extra: dict | None = None):
    c = B.Caso(nav, BASE, "prod", nome, desktop=desktop)
    c.pg.goto(BASE + "/privacidade", wait_until="domcontentloaded")
    c.pg.evaluate("""([k, v]) => { localStorage.setItem(k, v); localStorage.setItem('physiq_pendencia_avisada_em', new Date().toLocaleDateString('pt-BR'));
        localStorage.setItem('physiqcalc-pwa-dismissed', 'true'); }""", [B.B5.CHAVE_PRINCIPAL, json.dumps(sess)])
    for k, v in (extra or {}).items():
        c.pg.evaluate("([k, v]) => localStorage.setItem(k, v)", [k, v])
    c.pg.goto(BASE + rota, wait_until="domcontentloaded")
    c.fechar_avisos()
    if c.esperar(lambda: "Crie a sua senha" in c.texto(), 15):
        c.pg.get_by_role("button", name="Agora não").click()
        c.esperar(lambda: "Crie a sua senha" not in c.texto(), 15)
    return c


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    for k in ("--de-email", "--para-email", "--para-id", "--conta-treino"):
        ap.add_argument(k, required=True)
    a = ap.parse_args()
    B.saude_ok("os prints de produção")
    s_de, s_para = sessao_magica(a.de_email), sessao_magica(a.para_email)
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        try:
            c = abrir(nav, s_de, "/dieta", False, "parteB_app_dieta")
            try:
                ok = c.esperar(lambda: "Refeições de hoje" in c.texto() or "Plano de" in c.texto(), 90)
                p.check(ok and "Weslley Bertoldo" in c.texto(), "[prod] app do login antigo › Dieta: o plano do profissional novo (Weslley Bertoldo)")
                c.print("parteB_app_dieta")
            finally:
                c.fim()
            time.sleep(3)
            B.saude_ok("o Treino do aluno")
            c = abrir(nav, s_de, "/treino", False, "parteB_app_treino")
            try:
                ok = c.esperar(lambda: c.tem("[data-aba-treino]") or "Treino" in c.texto(), 120)
                c.pg.wait_for_timeout(8000)  # o PowerSync traz o treino dele
                p.check(ok, "[prod] app do login antigo › Treino: o treino dele (o mesmo usuário do Treino)")
                c.print("parteB_app_treino")
            finally:
                c.fim()
            time.sleep(3)
            c = abrir(nav, s_para, "/painel/alunos", True, "parteB_painel_aluno", {f"physiq_conta_ativa:{a.para_id}": a.conta_treino})
            try:
                ok = c.esperar(lambda: c.tem("[data-linhas-alunos]"), 90)
                busca = c.pg.locator('input[placeholder^="Buscar por nome"]').first
                busca.fill(a.de_email)
                ok = ok and c.esperar(lambda: c.pg.locator("[data-aluno-nome]").count() == 1, 30)
                p.check(ok and "Weslley Bertoldo" in c.texto(), "[prod] painel do login novo › Alunos (conta de treino), filtrado: o login antigo é aluno dele")
                c.pg.mouse.move(5, 5)
                c.print("parteB_painel_aluno")
            finally:
                c.fim()
        finally:
            nav.close()
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
