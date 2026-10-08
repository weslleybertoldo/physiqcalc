#!/usr/bin/env python3
"""Physiq hml-05b (homologação, 08/10/2026 — H-18 mensagem, H-47, H-17 item 2) — E2E das TELAS, na "Consultoria Ferreira W13" do
staging (Lucas = w13-dono; Rafael Moura = aluno com login). Só contas *.teste.claude@… (P26).

  cadastro       H-18: o /c/ do Lucas com o e-mail de um aluno que JÁ existe (o do Rafael) → o "enviado" de sempre (antes: "Já existe
                 cadastro com este e-mail." embaixo do campo) e o pendente nasce;
  aprovar        H-18: o Lucas aprova esse pendente em Alunos › Pendentes → o aviso "Já existe um aluno com este e-mail." aparece para o
                 PROFISSIONAL e nenhum aluno é criado; o teste apaga o pendente no fim (precisa do caso cadastro antes);
  novo_link      H-17 item 2: Resumo do Rafael › Link do diário › Gerar link novo → código com 16 caracteres; no fim o teste devolve o
                 código antigo ao Rafael (outros E2E usam o link dele);
  entrar         H-47: /entrar/email com "teste@sem-ponto" → "Confira o e-mail." e nada vai ao entrar-senha (vale em produção);
  c_inexistente  /c/<código que não existe> → "Link de cadastro não encontrado" (vale em produção: só leitura).

Uso: python3 e2e/hml05b/telas.py --base http://127.0.0.1:5197 --prefixo local [--casos ...]
     staging: --base https://physiqcalc-staging.vercel.app --prefixo staging
     produção (visitante, nada grava): --base https://physiqcalc.com.br --prefixo prod --casos entrar,c_inexistente
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent.parent / "h5"))
import _base as B  # noqa: E402

from playwright.sync_api import sync_playwright  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
p = B.p
q = B.sql_principal
PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "hml05b"
for _b in (B, B.B20, B.B19, B.B18, B.B17, B.B16, B.B15, B.B14, B.B13, B.B5, B.B13.B12, B.B13.B12.B11, B.B13.B12.B10, B.B13.B12.B8, B.B13.B12.B7):
    _b.PRINTS = PRINTS
NOME = "Teste Repetido hml05b"
CASOS: dict[str, object] = {}
ESTADO: dict = {}


def caso(fn):
    CASOS[fn.__name__.replace("caso_", "")] = fn
    return fn


def painel(nav, nome: str, conta: str, rota: str):
    c = B.Caso(nav, ESTADO["base"], ESTADO["prefixo"], nome, desktop=True)
    c.entrar(conta, rota)
    c.fechar_avisos()
    return c


def rafael() -> dict:
    return B.rafael(B.conta_w13())


def pendentes(conta: str) -> int:
    return q(f"select count(*)::int n from {S}.cadastros_pendentes where conta_id = '{conta}' and status = 'pendente' and nome = '{NOME}'")[0]["n"]


# ───────────────────────── /c/ (H-18) ─────────────────────────

@caso
def caso_cadastro(nav) -> None:
    conta = B.conta_w13()
    cod = q(f"select codigo_convite c from {S}.conta_membros where conta_id = '{conta}' and user_id = '{B.uid('w13-dono')}'")[0]["c"]
    email = rafael()["email"]
    assert email, "o Rafael precisa ter e-mail"
    antes = pendentes(conta)
    c = B.Caso(nav, ESTADO["base"], ESTADO["prefixo"], "cadastro", desktop=False)
    try:
        c.ir(f"/c/{cod}")
        p.check(c.esperar(lambda: c.tem("[data-form-cadastro-publico]"), 60), "[/c/] o formulário abre")
        c.pg.fill("[data-cad-nome]", NOME)
        c.pg.fill("[data-cad-email]", email)
        B.captcha(False)
        try:
            c.pg.click("[data-cad-enviar]")
            ok = c.esperar(lambda: c.tem("[data-cadastro-enviado]"), 40)
        finally:
            B.captcha(True)
        p.check(ok and not c.tem("[data-erro-campo]") and "Já existe" not in c.texto(),
                "[/c/] e-mail de aluno que já existe → o \"enviado\" de sempre, sem dizer que a pessoa já é aluna (H-18)")
        c.print("cadastro_email_de_aluno_enviado")
        depois = pendentes(conta)
        p.check(depois == antes + 1, f"[/c/] o pendente nasceu ({antes} → {depois})")
    finally:
        c.fim()
        B.captcha(True)


@caso
def caso_aprovar(nav) -> None:
    conta = B.conta_w13()
    pend = q(f"select id::text from {S}.cadastros_pendentes where conta_id = '{conta}' and status = 'pendente' and nome = '{NOME}' order by created_at desc limit 1")
    assert pend, "o pendente do teste não existe: rode o caso cadastro antes"
    pid = pend[0]["id"]
    alunos = lambda: q(f"select count(*)::int n from {S}.pacientes where conta_id = '{conta}' and deleted_at is null")[0]["n"]  # noqa: E731
    antes = alunos()
    c = painel(nav, "aprovar", "w13-dono", "/painel/alunos")
    try:
        p.check(c.esperar(lambda: c.tem("[data-abrir-pendentes]"), 60), "[pendentes] o botão Pendentes aparece")
        c.pg.click("[data-abrir-pendentes]")
        p.check(c.esperar(lambda: c.tem(f'[data-pendente="{pid}"]'), 30), "[pendentes] o cadastro do teste está na fila")
        c.pg.click(f'[data-pendente-aprovar="{pid}"]')
        ok = c.esperar(lambda: c.tem("[data-pendente-erro]"), 30)
        txt = c.pg.locator("[data-pendente-erro]").first.inner_text().strip() if ok else ""
        p.check(txt == "Já existe um aluno com este e-mail.", f"[pendentes] aprovar → o aviso vai para o PROFISSIONAL: {txt!r}")
        c.print("aprovar_aviso_email_repetido")
        p.check(alunos() == antes, "[pendentes] nenhum aluno criado")
        st = q(f"select status from {S}.cadastros_pendentes where id = '{pid}'")[0]["status"]
        p.check(st == "pendente", f"[pendentes] o cadastro continua na fila ({st}) — o profissional decide (recusar ou falar com a pessoa)")
    finally:
        c.fim()
        q(f"delete from {S}.cadastros_pendentes where conta_id = '{conta}' and nome = '{NOME}'")


# ───────────────────────── Resumo › Link do diário (H-17 item 2) ─────────────────────────

@caso
def caso_novo_link(nav) -> None:
    raf = rafael()
    antigo = q(f"select link_codigo from {S}.pacientes where id = '{raf['id']}'")[0]["link_codigo"]
    c = painel(nav, "novo_link", "w13-dono", f"/painel/alunos/{raf['id']}")
    try:
        p.check(c.esperar(lambda: c.tem(f'[data-card-link-diario="{antigo}"]'), 60), f"[link] o card mostra o link de hoje ({len(antigo)} caracteres)")
        card = c.pg.locator("[data-card-link-diario]").first
        card.scroll_into_view_if_needed()
        c.pg.click("[data-link-novo]")
        p.check(c.esperar(lambda: c.tem("[data-link-confirmar-ok]"), 15), "[link] pede confirmação")
        c.pg.click("[data-link-confirmar-ok]")
        ok = c.esperar(lambda: (card.get_attribute("data-card-link-diario") or antigo) != antigo, 30)
        novo = card.get_attribute("data-card-link-diario") if ok else ""
        p.check(ok and len(novo or "") == 16, f"[link] o link novo tem 16 caracteres ({len(novo or '')})")
        banco = q(f"select link_codigo from {S}.pacientes where id = '{raf['id']}'")[0]["link_codigo"]
        p.check(banco == novo, "[link] o banco guardou o mesmo código")
        url = c.pg.locator("[data-link-diario]").first.get_attribute("data-link-diario") or ""
        p.check(url.endswith(f"/d/{novo}"), "[link] o endereço do card usa o código novo")
        c.esperar(lambda: not c.tem("[data-link-confirmar]"), 10)
        card.scroll_into_view_if_needed()
        c.print("novo_link_16")
    finally:
        c.fim()
        q(f"update {S}.pacientes set link_codigo = '{antigo}' where id = '{raf['id']}'")


# ───────────────────────── /entrar e /c/ inexistente (visitante; valem em produção) ─────────────────────────

@caso
def caso_entrar(nav) -> None:
    c = B.Caso(nav, ESTADO["base"], ESTADO["prefixo"], "entrar", desktop=False)
    chamadas: list[str] = []
    c.pg.on("request", lambda r: chamadas.append(r.url) if "entrar-senha" in r.url else None)
    try:
        c.ir("/entrar/email")
        p.check(c.esperar(lambda: c.tem("input[placeholder='voce@email.com']"), 60), "[entrar] a tela abre")
        c.pg.get_by_placeholder("voce@email.com").fill("teste@sem-ponto")
        c.pg.get_by_placeholder("Sua senha").fill("qualquer-senha-123")
        c.pg.get_by_role("button", name="Entrar").click()
        ok = c.esperar(lambda: "Confira o e-mail." in c.texto(), 15)
        c.pg.wait_for_timeout(1500)
        p.check(ok and not chamadas, f"[entrar] e-mail sem ponto → \"Confira o e-mail.\" e nada ao entrar-senha ({len(chamadas)} pedidos) — H-47")
        c.print("entrar_email_torto")
    finally:
        c.fim()


@caso
def caso_c_inexistente(nav) -> None:
    c = B.Caso(nav, ESTADO["base"], ESTADO["prefixo"], "c_inexistente", desktop=False)
    try:
        c.ir("/c/naoexiste2345hml")
        ok = c.esperar(lambda: "Link de cadastro não encontrado" in c.texto(), 60)
        p.check(ok and not c.tem("[data-form-cadastro-publico]"), "[/c/] código que não existe → \"Link de cadastro não encontrado\"")
        c.print("c_inexistente")
    finally:
        c.fim()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:5197")
    ap.add_argument("--prefixo", default="local")
    ap.add_argument("--casos", default=",".join(CASOS))
    a = ap.parse_args()
    ESTADO.update(base=a.base.rstrip("/"), prefixo=a.prefixo)
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        for nome in [x.strip() for x in a.casos.split(",") if x.strip()]:
            print(f"\n── {nome} ──", flush=True)
            if nome not in ("entrar", "c_inexistente"):
                B.saude_ok(nome)
            try:
                CASOS[nome](nav)
            except SystemExit:
                raise
            except Exception as e:  # noqa: BLE001
                p.check(False, f"{nome}: exceção {type(e).__name__}: {str(e)[:300]}")
            time.sleep(2)
        nav.close()
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
