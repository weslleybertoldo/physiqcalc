#!/usr/bin/env python3
"""Physiq W16b — E2E das TELAS da trava de e-mail/CPF repetido (Playwright, contexto limpo por caso, staging do banco principal).

  novo_email      Painel › Alunos › Novo aluno › Cadastrar (Lucas, dono): o e-mail de OUTRO aluno (o w16b-app, aluno do app em
                  outra conta) → mensagem vermelha embaixo do campo ao sair dele; "Cadastrar" não grava; e-mail único → some
  dados           Perfil do aluno › Editar dados (Rafael Moura): CPF e e-mail de outras pessoas → as 2 mensagens embaixo dos campos;
                  "Salvar" não grava; voltar ao que era → somem
  cadastro_link   /c/<código do Lucas> (público, celular): e-mail que já é de um aluno → "Já existe cadastro com este e-mail."
                  embaixo do campo; nenhum cadastro pendente criado
Prints: ~/projetos/physiqcalc-scratch/prints/w16b/<prefixo>_trava_email.png, _trava_cpf.png, _trava_cadastro_link.png
Pré-requisito: e2e/w16b/causa.py (a conta w16b-app com a matrícula do app no staging) e a massa da W13 (e2e/w13/massa.py).
Uso: python3 e2e/w16b/telas.py --base http://localhost:5173 --prefixo local [--casos novo_email,dados,cadastro_link]
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
p = B.p
A = "w16b-app"
MSG_EMAIL, MSG_CPF = "Já existe um aluno com este e-mail.", "Já existe um aluno com este CPF."
DICA = "Para trazer essa pessoa, use o convite ou o seu código."
CPF_OUTRO = "529.982.247-25"
NOME_CPF = "W16b CPF de Outra Pessoa"


def q(sql: str) -> list:
    return B.sql_principal(sql)


def texto(c, sel: str) -> str:
    try:
        loc = c.pg.locator(sel).first
        return loc.inner_text(timeout=3000).strip() if loc.count() else ""
    except Exception:  # noqa: BLE001
        return ""


def caso(nav, base: str, pref: str, nome: str, conta: str | None, rota: str, desktop: bool = True, esperar: str | None = None):
    c = B.Caso(nav, base, pref, nome, desktop=desktop)
    if conta:
        c.entrar(conta, rota, zerar=True)
        c.fechar_avisos()
    else:
        c.ir(rota)
    if esperar:
        ok = c.esperar(lambda: c.tem(esperar), 90)
        p.check(ok, f"[{nome}] {rota} abriu ({esperar})")
        if not ok:
            c.diagnostico()
    return c


def foto(c, nome: str) -> str:
    try:
        c.pg.mouse.move(5, 5)
    except Exception:  # noqa: BLE001
        pass
    c.esperar(lambda: c.pg.locator("[data-sonner-toast]").count() == 0, 10)
    return c.print(nome)


def erro_do(c, campo_sel: str) -> str:
    """A mensagem vermelha embaixo do campo (o <span data-erro-campo> do mesmo <label>)."""
    return texto(c, f"label:has({campo_sel}) [data-erro-campo]")


def novo_email(nav, base, pref):
    conta = B.conta_w13()
    c = caso(nav, base, pref, "novo_email", "w13-dono", "/painel/alunos", esperar="[data-linhas-alunos]")
    try:
        c.pg.click("[data-novo-aluno-abrir]")
        ok = c.esperar(lambda: c.tem('[data-novo-aluno="cadastrar"]'), 15)
        p.check(ok, "[novo] a folha Novo aluno › Cadastrar abriu")
        c.pg.fill("[data-novo-nome]", "Teste Trava W16b")
        c.pg.fill("[data-novo-email]", B.EMAIL[A].upper())
        c.pg.keyboard.press("Tab")
        ok = c.esperar(lambda: MSG_EMAIL in erro_do(c, "[data-novo-email]"), 20)
        msg = erro_do(c, "[data-novo-email]")
        p.check(ok and DICA in msg, f"[novo] e-mail de outro aluno (outra conta, outra caixa) → vermelho embaixo do campo ao sair dele: {msg!r}")
        p.check(c.pg.get_attribute("[data-novo-email]", "aria-invalid") == "true", "[novo] o campo fica marcado como inválido (borda rosa)")
        foto(c, "trava_email")
        c.pg.click("[data-novo-cadastrar]")
        c.pg.wait_for_timeout(2500)
        n = q(f"select count(*)::int n from {S}.pacientes where conta_id = '{conta}' and nome = 'Teste Trava W16b'")[0]["n"]
        p.check(n == 0 and MSG_EMAIL in erro_do(c, "[data-novo-email]") and not c.tem("[data-novo-feito]"),
                f"[novo] 'Cadastrar aluno' NÃO grava com o e-mail repetido ({n} linha) e a mensagem fica")
        c.pg.fill("[data-novo-email]", "w16b.unico.teste.claude@physiqnutri.app")
        ok = c.esperar(lambda: erro_do(c, "[data-novo-email]") == "", 5)
        c.pg.keyboard.press("Tab")
        c.pg.wait_for_timeout(2500)
        p.check(ok and erro_do(c, "[data-novo-email]") == "" and c.pg.get_attribute("[data-novo-email]", "aria-invalid") is None,
                "[novo] (positivo) e-mail que ninguém usa → sem mensagem, o campo volta ao normal")
    finally:
        c.fim()


def dados(nav, base, pref):
    conta = B.conta_w13()
    raf = q(f"select id::text, email, cpf from {S}.pacientes where conta_id = '{conta}' and nome = 'Rafael Moura' and deleted_at is null limit 1")[0]
    nutri2 = q("select id::text from auth.users where lower(email) = 'teste@physiqnutri.app'")[0]["id"]
    q(f"delete from {S}.pacientes where nome = $n${NOME_CPF}$n$")
    q(f"insert into {S}.pacientes (nutricionista_id, nome, cpf) values ('{nutri2}', $n${NOME_CPF}$n$, '{CPF_OUTRO}')")
    c = caso(nav, base, pref, "dados", "w13-dono", f"/painel/alunos/{raf['id']}", esperar="[data-dados-editar]")
    try:
        c.pg.click("[data-dados-editar]")
        ok = c.esperar(lambda: c.tem("[data-editar-dados]"), 15)
        p.check(ok, "[dados] a folha Editar dados abriu")
        c.pg.fill("[data-editar-cpf]", CPF_OUTRO)
        c.pg.keyboard.press("Tab")
        ok = c.esperar(lambda: MSG_CPF in erro_do(c, "[data-editar-cpf]"), 20)
        p.check(ok, f"[dados] CPF de outra pessoa → vermelho embaixo do CPF: {erro_do(c, '[data-editar-cpf]')!r}")
        c.pg.fill("[data-editar-email]", f"  {B.EMAIL[A]} ")
        c.pg.keyboard.press("Tab")
        ok = c.esperar(lambda: MSG_EMAIL in erro_do(c, "[data-editar-email]"), 20)
        p.check(ok, f"[dados] e-mail de outro aluno → vermelho embaixo do e-mail: {erro_do(c, '[data-editar-email]')!r}")
        foto(c, "trava_cpf")
        c.pg.click("[data-editar-salvar]")
        c.pg.wait_for_timeout(2500)
        r2 = q(f"select email, cpf from {S}.pacientes where id = '{raf['id']}'")[0]
        p.check(c.tem("[data-editar-dados]") and r2["cpf"] == raf["cpf"] and r2["email"] == raf["email"],
                "[dados] 'Salvar' NÃO grava com CPF/e-mail repetidos (a folha continua aberta e o banco igual)")
        c.pg.fill("[data-editar-cpf]", raf["cpf"] or "")
        c.pg.fill("[data-editar-email]", raf["email"] or "")
        c.pg.keyboard.press("Tab")
        ok = c.esperar(lambda: erro_do(c, "[data-editar-cpf]") == "" and erro_do(c, "[data-editar-email]") == "", 10)
        p.check(ok, "[dados] (positivo) voltar ao CPF/e-mail que ele já tinha → as mensagens somem")
        c.pg.keyboard.press("Escape")
    finally:
        c.fim()
        q(f"delete from {S}.pacientes where nome = $n${NOME_CPF}$n$")


def captcha(ligado: bool) -> None:
    q(f"""update {S}.app_config set valor = jsonb_set(valor, '{{captcha}}', '{str(ligado).lower()}'::jsonb) where chave = 'login_limite'""")


def cadastro_link(nav, base, pref):
    conta = B.conta_w13()
    cod = q(f"select codigo_convite from {S}.conta_membros where conta_id = '{conta}' and user_id = '{B.uid('w13-dono')}'")[0]["codigo_convite"]
    antes = q(f"select count(*)::int n from {S}.cadastros_pendentes where conta_id = '{conta}'")[0]["n"]
    c = caso(nav, base, pref, "cadastro_link", None, f"/c/{cod}", desktop=False, esperar="[data-form-cadastro-publico]")
    try:
        c.pg.fill("[data-cad-nome]", "Wagner Cadastro W16b")
        c.pg.fill("[data-cad-email]", B.EMAIL[A])
        c.pg.fill("[data-cad-telefone]", "(82) 97777-1616")
        captcha(False)  # o Chromium automatizado cai no desafio do Turnstile: no staging, só neste envio, o captcha fica desligado
        try:
            c.pg.click("[data-cad-enviar]")
            ok = c.esperar(lambda: "Já existe cadastro com este e-mail." in erro_do(c, "[data-cad-email]"), 40)
        finally:
            captcha(True)
        p.check(ok and not c.tem("[data-cadastro-enviado]"), f"[/c/] e-mail que já é de um aluno → embaixo do campo: {erro_do(c, '[data-cad-email]')!r}")
        foto(c, "trava_cadastro_link")
        depois = q(f"select count(*)::int n from {S}.cadastros_pendentes where conta_id = '{conta}'")[0]["n"]
        p.check(depois == antes, f"[/c/] nenhum cadastro pendente criado ({antes} → {depois})")
    finally:
        c.fim()


CASOS = {"novo_email": novo_email, "dados": dados, "cadastro_link": cadastro_link}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:5173")
    ap.add_argument("--prefixo", default="local")
    ap.add_argument("--casos", default=",".join(CASOS))
    a = ap.parse_args()
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        for nome in [x.strip() for x in a.casos.split(",") if x.strip()]:
            print(f"\n── {nome} ──", flush=True)
            B.saude_ok(nome)
            try:
                CASOS[nome](nav, a.base, a.prefixo)
            except SystemExit:
                raise
            except Exception as e:  # noqa: BLE001
                p.check(False, f"{nome}: exceção {type(e).__name__}: {str(e)[:300]}")
            time.sleep(3)
        nav.close()
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
