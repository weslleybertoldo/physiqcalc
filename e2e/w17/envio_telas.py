#!/usr/bin/env python3
"""Physiq W17 (item 2) — E2E de TELA do "Salvar e enviar ao aluno" (tela 8) com e-mail e o botão "Enviar pelo WhatsApp".

Camila (nutricionista responsável do "Aluno Envio W17", que tem login, e-mail e telefone de mentira):
  positivo   o botão "Enviar pelo WhatsApp" é o atalho wa.me com o DDI 55 e a mensagem pronta (o que mudou + o link da aba);
             "Salvar e enviar ao aluno" → aviso no sino + e-mail (no staging, a caixa de teste do Resend) e o aviso na tela diz
  repetido   o 2º clique em menos de 10 minutos não repete o sino nem o e-mail (e a tela diz)
  sem_email  aluno sem e-mail no cadastro → só o sino (e a tela diz)
  sem_telefone  aluno sem telefone → o botão do WhatsApp fica desligado com o motivo "Aluno sem telefone"
O e-mail e o telefone do aluno de teste voltam ao que eram no fim.

Uso: python3 e2e/w17/envio_telas.py --base http://localhost:5173 --prefixo local   (staging: --base https://physiqcalc-staging.vercel.app --prefixo staging)
     Contexto limpo por caso, painel 1280 × 883 × 2 (tela 8).
"""
from __future__ import annotations

import argparse
import sys
import time
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

from playwright.sync_api import sync_playwright  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
p = B.p
ESTADO: dict = {}


def q(sql: str) -> list:
    return B.sql_principal(sql)


def abrir(nav, nome: str, rota: str):
    c = B.B5.Caso(nav, ESTADO["base"], ESTADO["prefixo"], nome, desktop=True)
    c.entrar("w13-nutri", rota)
    c.fechar_avisos()
    return c


def esperar_tela8(c, nome: str) -> bool:
    ok = c.esperar(lambda: c.tem("[data-editores-enviar]") and c.tem("[data-editor-dieta]") and c.pg.locator("[data-editor-dieta] [data-refeicao]").count() > 0, 90)
    p.check(ok, f"[{nome}] a tela 8 abriu com o plano e o 'Salvar e enviar ao aluno'")
    return ok


def fechar_faixa(c) -> None:
    if c.esperar(lambda: c.tem("[data-faixa-mensagens-fechar]"), 2):
        c.pg.locator("[data-faixa-mensagens-fechar]").first.click()
        c.pg.wait_for_timeout(300)


def toast(c, trecho: str, timeout: float = 45) -> str:
    alvo = c.pg.locator("[data-sonner-toast]", has_text=trecho)
    c.esperar(lambda: alvo.count() > 0, timeout)
    return alvo.first.inner_text() if alvo.count() else " | ".join(c.pg.locator("[data-sonner-toast]").all_inner_texts())


def fechar_toasts(c) -> None:
    # nunca remover o nó à mão (o React do Toaster perde o lugar — NotFoundError): espera os avisos saírem sozinhos
    c.esperar(lambda: c.pg.locator("[data-sonner-toast]").count() == 0, 12)


def caso_positivo(nav, m: dict) -> None:
    rota = f"/painel/alunos/{m['envio']}/editar"
    q(f"delete from {S}.avisos where destino_user_id = '{m['envio_user']}'")
    c = abrir(nav, "positivo", rota)
    try:
        if not esperar_tela8(c, "positivo"):
            return
        fechar_faixa(c)
        zap = c.pg.locator("a[data-editores-whatsapp]")
        p.check(zap.count() == 1 and zap.first.is_visible() and "Enviar pelo WhatsApp" in zap.first.inner_text(), "botão 'Enviar pelo WhatsApp' ligado")
        href = zap.first.get_attribute("href") or ""
        txt = urllib.parse.parse_qs(urllib.parse.urlparse(href).query).get("text", [""])[0]
        site = "https://physiqcalc-staging.vercel.app" if ESTADO["base"].startswith("https://physiqcalc-staging") else None
        p.check(href.startswith(f"https://wa.me/55{B.TELEFONE_ENVIO}?text="), f"atalho wa.me com o DDI 55 e o telefone do aluno ({href[:60]}…)")
        p.check(txt.startswith("Oi, Aluno! Atualizei seu plano alimentar no Physiq. Abra o app para ver: ") and txt.endswith("/dieta")
                and (site is None or site in txt), f"mensagem pronta: o que mudou + o link da Dieta ({txt})")
        p.check(zap.first.get_attribute("target") == "_blank", "abre fora do painel (aba nova / WhatsApp)")
        c.pg.locator("[data-editores-enviar]").click()
        t = toast(c, "Salvo e enviado")
        p.check("com o aviso no sino e por e-mail (caixa de teste)" in t, f"aviso na tela: sino + e-mail na caixa de teste ({t})")
        av = q(f"select titulo, email_em from {S}.avisos where destino_user_id = '{m['envio_user']}' and tipo = 'plano_atualizado'")
        p.check(len(av) == 1 and av[0]["titulo"] == "Sua dieta foi atualizada" and av[0]["email_em"], f"no banco: 1 aviso com o e-mail marcado ({av})")
        c.print("salvar_enviar")
        fechar_toasts(c)
        # 2º envio em menos de 10 minutos
        c.pg.locator("[data-editores-enviar]").click()
        t = toast(c, "já tinha o aviso")
        p.check("Salvo. O aluno já tinha o aviso no app e o e-mail (menos de 10 minutos)." in t, f"2º envio: nada repete ({t})")
        av = q(f"select count(*)::int n from {S}.avisos where destino_user_id = '{m['envio_user']}' and tipo = 'plano_atualizado'")
        p.check(av[0]["n"] == 1, "continua 1 aviso")
        c.print("salvar_enviar_repetido")
    finally:
        c.fim()


def caso_sem_email(nav, m: dict) -> None:
    rota = f"/painel/alunos/{m['envio']}/editar"
    email0 = q(f"select email from {S}.pacientes where id = '{m['envio']}'")[0]["email"]
    q(f"update {S}.pacientes set email = null where id = '{m['envio']}'")
    q(f"delete from {S}.avisos where destino_user_id = '{m['envio_user']}'")
    c = abrir(nav, "sem_email", rota)
    try:
        if not esperar_tela8(c, "sem_email"):
            return
        fechar_faixa(c)
        c.pg.locator("[data-editores-enviar]").click()
        t = toast(c, "Salvo e enviado")
        p.check("Sem e-mail no cadastro, nada foi por e-mail." in t, f"sem e-mail: só o sino ({t})")
        av = q(f"select email_em from {S}.avisos where destino_user_id = '{m['envio_user']}' and tipo = 'plano_atualizado'")
        p.check(len(av) == 1 and not av[0]["email_em"], f"no banco: 1 aviso, sem e-mail ({av})")
        c.print("salvar_enviar_sem_email")
    finally:
        c.fim()
        q(f"update {S}.pacientes set email = $e${email0}$e$ where id = '{m['envio']}'")


def caso_sem_telefone(nav, m: dict) -> None:
    rota = f"/painel/alunos/{m['envio']}/editar"
    q(f"update {S}.pacientes set telefone = null where id = '{m['envio']}'")
    c = abrir(nav, "sem_telefone", rota)
    try:
        if not esperar_tela8(c, "sem_telefone"):
            return
        fechar_faixa(c)
        b = c.pg.locator("button[data-editores-whatsapp]")
        p.check(b.count() == 1 and b.first.is_disabled() and c.pg.locator("a[data-editores-whatsapp]").count() == 0,
                "sem telefone: o botão 'Enviar pelo WhatsApp' fica desligado")
        motivo = c.pg.locator("[data-editores-whatsapp-motivo]")
        p.check(motivo.count() == 1 and motivo.first.is_visible() and motivo.first.inner_text().startswith("Aluno sem telefone"),
                f"com o motivo na tela ({motivo.first.inner_text() if motivo.count() else '—'})")
        p.check(b.first.get_attribute("title") == "Aluno sem telefone", "e na dica do botão")
        p.check(c.tem("[data-editores-enviar]") and c.pg.locator("[data-editores-enviar]").is_enabled(), "o 'Salvar e enviar' continua valendo")
        c.print("salvar_enviar_sem_telefone")
    finally:
        c.fim()
        q(f"update {S}.pacientes set telefone = '{B.TELEFONE_ENVIO}' where id = '{m['envio']}'")


CASOS = {"positivo": caso_positivo, "sem_email": caso_sem_email, "sem_telefone": caso_sem_telefone}

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--prefixo", required=True)
    ap.add_argument("--casos", default=",".join(CASOS))
    a = ap.parse_args()
    ESTADO.update(base=a.base.rstrip("/"), prefixo=a.prefixo)
    m = B.ler_json(B.SCRATCH / "massa_staging.json")
    assert m.get("envio"), "rode antes: python3 e2e/w17/massa.py"
    t0 = time.time()
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox"])
        for nome in a.casos.split(","):
            CASOS[nome](nav, m)
        nav.close()
    q(f"delete from {S}.avisos where destino_user_id = '{m['envio_user']}'")
    rc = p.fim()
    print(f"({time.time() - t0:.0f} s)")
    sys.exit(rc)
