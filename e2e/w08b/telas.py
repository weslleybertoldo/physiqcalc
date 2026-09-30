#!/usr/bin/env python3
"""Physiq W8b — E2E de TELA do limite de tentativas no login, do card "Acesso do aluno" (tela 7) e da tela "crie a sua senha"
(padrão da tela 1). Playwright em contexto limpo por caso, em série (o Banco do Treino é uma VM Nano); o widget do Turnstile é
trocado por um que entrega tokens REAIS do Edge (a função entrar-senha confere de verdade — e2e/w08b/_base.py).

Casos (na ordem):
  espera       w8b-bloqueio pelo formulário (390 px): 3 erradas → "E-mail ou senha incorretos."; a 4ª → "Muitas tentativas. Tente de
               novo em 1:00" com o botão travado; relógio acelerado → 5:00, 15:00, 30:00, 60:00; a seguinte → "Conta bloqueada por
               tentativas…" + botão do Google; a senha CERTA continua recusada
  card         w8b-personal no painel (1280 × 883 × 2): Resumo do Rafael (bloqueado de vez) com o card Acesso do aluno; "Criar
               senha nova" → a folha com a senha gerada → salva → mostra o que passar ao aluno; o card vira SENHA PROVISÓRIA
  provisoria   Rafael entra com a senha provisória (390 px) → "Crie a sua senha"; "Agora não" → o app abre; entra de novo → a
               tela volta; cria a dele → o app abre; entra com a nova → a tela NÃO aparece
  criar        w8b-personal: o Bruno (sem login) → "Criar acesso" com o e-mail do cadastro; o Bruno entra e vê "Crie a sua senha"
  celular      o card no painel em 390 px
  negativo     outra profissional abre o Rafael: o card não oferece criar senha
Uso: python3 e2e/w08b/telas.py --base http://localhost:8080 --prefixo local [--casos a,b]
     produção (só a escada, com a descartável): --base https://physiqcalc.com.br --prefixo prod --schema public --casos espera
"""
from __future__ import annotations

import argparse
import re
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

p = B.p
ESTADO_CASO: dict = {}


def S() -> str:
    return B.schema()


def aluno_pid(conta: str = "w8b-aluno") -> str:
    return B.q(f"select id::text from {S()}.pacientes where user_id = '{B.uid(conta)}' and deleted_at is null order by created_at limit 1")[0]["id"]


def novo_pid() -> dict:
    return B.q(f"select id::text as id, user_id::text as u from {S()}.pacientes where lower(email) = '{B.EMAIL_NOVO}' and deleted_at is null")[0]


def caso_novo(nav, a, nome: str, desktop: bool) -> B.Caso:
    c = B.Caso(nav, a.base, a.prefixo, nome, desktop=desktop)
    B.ligar_turnstile_real(c)
    return c


def formulario(c: B.Caso) -> None:
    c.ir("/entrar/email")
    assert c.esperar(lambda: c.tem("[data-form-email]"), 60), "a tela de e-mail e senha não abriu"
    c.pg.evaluate("() => { localStorage.setItem('physiqcalc-pwa-dismissed', 'true'); }")


def tentar(c: B.Caso, email: str, senha: str) -> None:
    c.pg.fill("input[type=email]", email)
    c.pg.fill("input[type=password]", senha)
    c.pg.locator("[data-btn-entrar]").click()
    c.esperar(lambda: "Entrando" not in c.pg.locator("[data-btn-entrar]").inner_text(), 60)
    c.pg.wait_for_timeout(400)


def texto_msg(c: B.Caso) -> str:
    for sel in ("[data-bloqueio-de-vez]", "[data-bloqueio-login]", "[data-erro-login]"):
        if c.tem(sel):
            return c.pg.locator(sel).first.inner_text()
    return ""


def caso_espera(nav, a) -> None:
    email, senha = B.CONTAS["w8b-bloqueio" if S() == "staging" else "w8b-prod-bloqueio"]
    B.zerar(email)
    B.zerar_ips()
    c = caso_novo(nav, a, "espera", desktop=False)
    formulario(c)
    for i in (1, 2, 3):
        tentar(c, email, f"errada-{i}")
        p.check(c.esperar(lambda: "E-mail ou senha incorretos." in texto_msg(c), 30), f"{i}ª errada: 'E-mail ou senha incorretos.' ({texto_msg(c)!r})")
    tentar(c, email, "errada-4")
    ok = c.esperar(lambda: re.search(r"Muitas tentativas\. Tente de novo em (1:00|0:5\d)\.", texto_msg(c)) is not None, 30)
    p.check(ok, f"4ª errada: 'Muitas tentativas. Tente de novo em 1:00' ({texto_msg(c)!r})")
    btn = c.pg.locator("[data-btn-entrar]")
    p.check(btn.is_disabled() and btn.inner_text().strip() == "Aguarde", "o botão espera com a mesma senha")
    c.print("espera")
    for n, esperado in ((5, "5:00|4:5"), (6, "15:00|14:5"), (7, "30:00|29:5"), (8, "60:00|59:5")):
        B.acelerar(email)
        tentar(c, email, f"errada-{n}")
        ok = c.esperar(lambda: re.search(rf"Tente de novo em ({esperado})", texto_msg(c)) is not None, 30)
        p.check(ok, f"relógio acelerado → {n}ª errada espera {esperado.split('|')[0]} ({texto_msg(c)!r})")
    c.print("espera_60")
    B.acelerar(email)
    tentar(c, email, "errada-9")
    ok = c.esperar(lambda: "Conta bloqueada por tentativas. Peça uma senha nova ao seu profissional ou entre com o Google" in texto_msg(c), 30)
    p.check(ok, f"9ª errada: 'Conta bloqueada por tentativas. Peça uma senha nova ao seu profissional ou entre com o Google' ({texto_msg(c)!r})")
    p.check(c.tem("[data-bloqueio-google] [data-entrar-google]"), "o botão do Google aparece (destrava)")
    c.print("bloqueada")
    B.acelerar(email)
    tentar(c, email, senha)
    p.check(c.esperar(lambda: "Conta bloqueada por tentativas" in texto_msg(c), 30) and c.caminho().startswith("/entrar"),
            "a senha CERTA é recusada (continua na entrada, bloqueada de vez)")
    e = B.estado(email) or {}
    p.check(e.get("erros") == 9 and e.get("bloqueado_de_vez_em"), f"no banco: 9 erros, de vez ({e.get('erros')})")
    c.fim()
    B.zerar(email)


def entrar_ui(nav, a, nome: str, email: str, senha: str) -> B.Caso:
    c = caso_novo(nav, a, nome, desktop=False)
    formulario(c)
    tentar(c, email, senha)
    return c


def esperar_resumo(c: B.Caso, nome: str) -> bool:
    """O Resumo inteiro carregado (cabeçalho com o nome e o card Financeiro sem o esqueleto) antes do print."""
    return c.esperar(lambda: nome in c.pg.locator("[data-perfil-aluno]").inner_text()
                     and (c.tem("[data-card-financeiro-vazio]") or c.tem("[data-card-financeiro-linhas]")), 60)


def caso_card(nav, a) -> None:
    email_a = B.CONTAS["w8b-aluno"][0]
    pid = aluno_pid()
    B.q(f"""insert into {S()}.login_bloqueios (email, erros, bloqueado_de_vez_em) values ('{email_a}', 9, now())
            on conflict (email) do update set erros = 9, bloqueado_de_vez_em = now(), bloqueado_ate = null""")
    B.q(f"update auth.users set raw_app_meta_data = raw_app_meta_data - 'senha_provisoria' where lower(email) = '{email_a}'")
    c = B.Caso(nav, a.base, a.prefixo, "card", desktop=True)
    c.entrar("w8b-personal", f"/painel/alunos/{pid}", zerar=False)
    c.fechar_avisos()
    ok = c.esperar(lambda: c.tem("[data-card-acesso-aluno][data-acesso-estado='bloqueado_de_vez']"), 60)
    p.check(ok, "Resumo do aluno mostra o card Acesso do aluno (bloqueado de vez)")
    esperar_resumo(c, "Rafael Moura")
    card = c.pg.locator("[data-card-acesso-aluno]")
    t = card.inner_text()
    p.check("BLOQUEADO" in t and email_a in t and "Bloqueado de vez por tentativas de senha" in t, "card: chip, e-mail do login e o aviso do bloqueio")
    card.scroll_into_view_if_needed()
    c.print("card_acesso")
    c.pg.locator("[data-acesso-acao='senha']").click()
    ok = c.esperar(lambda: c.tem("[data-form-senha-aluno]"), 20)
    senha = c.pg.locator("[data-senha-aluno-campo-senha]").input_value() if ok else ""
    p.check(ok and re.fullmatch(r"[A-Za-z2-9]{10}", senha or "") is not None, f"a folha abre com a senha provisória gerada ({senha})")
    c.pg.locator("[data-senha-aluno-gerar]").click()
    senha2 = c.pg.locator("[data-senha-aluno-campo-senha]").input_value()
    p.check(senha2 != senha and len(senha2) == 10, "'Gerar outra' troca a senha")
    c.print("criar_senha")
    c.pg.locator("[data-senha-aluno-salvar]").click()
    ok = c.esperar(lambda: c.tem("[data-senha-aluno-pronta]"), 30)
    mostrada = c.pg.locator("[data-senha-aluno-valor]").inner_text().strip() if ok else ""
    p.check(ok and mostrada == senha2, f"salvou e mostra o que passar ao aluno (e-mail + senha {mostrada})")
    c.print("senha_criada")
    p.check(B.estado(email_a) is None and B.meta(email_a).get("senha_provisoria") is True, "no banco: destravou e a senha é provisória")
    c.pg.locator("[data-senha-aluno-fechar]").click()
    ok = c.esperar(lambda: c.tem("[data-card-acesso-aluno][data-acesso-estado='provisoria']"), 30)
    p.check(ok and "SENHA PROVISÓRIA" in c.pg.locator("[data-card-acesso-aluno]").inner_text(), "o card vira SENHA PROVISÓRIA (sem bloqueio)")
    c.pg.locator("[data-card-acesso-aluno]").scroll_into_view_if_needed()
    c.print("card_provisoria")
    ESTADO_CASO["senha_provisoria"] = senha2
    c.fim()


def esperar_app(c: B.Caso, timeout: float = 90) -> bool:
    return c.esperar(lambda: c.tem("[data-tabbar]") and not c.caminho().startswith("/entrar"), timeout)


def caso_provisoria(nav, a) -> None:
    email_a, senha_teste = B.CONTAS["w8b-aluno"]
    prov = ESTADO_CASO.get("senha_provisoria")
    if not prov:
        prov = "Prov" + str(int(time.time()))[-5:] + "Ab"
        st, r = B.rpc(B.sessao("w8b-personal")["access_token"], "paciente_redefinir_senha", {"p_paciente_id": aluno_pid(), "p_senha": prov})
        assert st in (200, 204), (st, r)
    # 1º login com a provisória → a tela
    c = entrar_ui(nav, a, "provisoria", email_a, prov)
    ok = c.esperar(lambda: c.tem("[data-aviso-senha-provisoria]"), 90)
    t = c.texto()
    p.check(ok and "Crie a sua senha" in t and "Olá, Rafael" in t and "Agora não" in t, "1ª tela depois de entrar com a senha provisória: 'Crie a sua senha'")
    c.print("atualizar_senha")
    c.pg.locator("[data-senha-provisoria-depois]").click()
    p.check(c.esperar(lambda: not c.tem("[data-aviso-senha-provisoria]"), 20) and esperar_app(c), "'Agora não' entra no app")
    c.fechar_avisos()
    c.print("depois_agora_nao")
    c.fim()
    # 2º login (outra sessão) com a provisória → a tela volta
    c = entrar_ui(nav, a, "provisoria_de_novo", email_a, prov)
    ok = c.esperar(lambda: c.tem("[data-aviso-senha-provisoria]"), 90)
    p.check(ok, "no próximo login a tela volta (a senha ainda é a provisória)")
    nova = "Minha" + str(int(time.time()))[-5:] + "x"
    c.pg.fill("[data-senha-provisoria-nova]", nova)
    c.pg.fill("[data-senha-provisoria-confirmacao]", nova + "z")
    c.pg.locator("[data-senha-provisoria-salvar]").click()
    p.check(c.esperar(lambda: c.tem("[data-senha-provisoria-erro]"), 10), "confirmação diferente → erro, nada gravado")
    c.pg.fill("[data-senha-provisoria-confirmacao]", nova)
    c.pg.locator("[data-senha-provisoria-salvar]").click()
    ok = c.esperar(lambda: not c.tem("[data-aviso-senha-provisoria]"), 40) and esperar_app(c)
    p.check(ok, "criou a senha dela → o app abre")
    p.check("senha_provisoria" not in B.meta(email_a), "no banco: a marca de provisória saiu")
    c.fim()
    # 3º login com a senha nova → sem a tela
    c = entrar_ui(nav, a, "senha_nova", email_a, nova)
    ok = esperar_app(c)
    c.pg.wait_for_timeout(1500)
    p.check(ok and not c.tem("[data-aviso-senha-provisoria]"), "entrou com a senha nova: a tela NÃO aparece")
    c.fim()
    c = entrar_ui(nav, a, "provisoria_velha", email_a, prov)
    p.check(c.esperar(lambda: "E-mail ou senha incorretos." in texto_msg(c), 30), "a provisória não vale mais")
    c.fim()
    B.zerar(email_a)
    B.garantir_usuario(email_a, senha_teste, "Rafael Moura")


def caso_criar(nav, a) -> None:
    n = novo_pid()
    if n.get("u"):
        sp = B.service(B.PRINCIPAL_REF)
        B.http("DELETE", f"{B.PRINCIPAL_URL}/auth/v1/admin/users/{n['u']}", None, {"apikey": sp, "Authorization": f"Bearer {sp}"})
    c = B.Caso(nav, a.base, a.prefixo, "criar", desktop=True)
    c.entrar("w8b-personal", f"/painel/alunos/{n['id']}", zerar=False)
    c.fechar_avisos()
    ok = c.esperar(lambda: c.tem("[data-card-acesso-aluno][data-acesso-estado='sem']"), 60)
    esperar_resumo(c, B.NOME_NOVO)
    p.check(ok and "SEM ACESSO" in c.pg.locator("[data-card-acesso-aluno]").inner_text(), "aluno sem login: card SEM ACESSO com 'Criar acesso'")
    c.pg.locator("[data-card-acesso-aluno]").scroll_into_view_if_needed()
    c.print("card_sem_acesso")
    c.pg.locator("[data-acesso-criar]").click()
    ok = c.esperar(lambda: c.tem("[data-form-senha-aluno][data-modo='criar']"), 20)
    p.check(ok and c.pg.locator("[data-senha-aluno-campo-email]").input_value() == B.EMAIL_NOVO, "a folha abre com o e-mail do cadastro")
    senha = c.pg.locator("[data-senha-aluno-campo-senha]").input_value()
    c.print("criar_acesso")
    c.pg.locator("[data-senha-aluno-salvar]").click()
    p.check(c.esperar(lambda: c.tem("[data-senha-aluno-pronta]"), 30), "acesso criado: mostra e-mail e senha para passar")
    c.fim()
    c = entrar_ui(nav, a, "criar_login", B.EMAIL_NOVO, senha)
    p.check(c.esperar(lambda: c.tem("[data-aviso-senha-provisoria]"), 90), "o aluno novo entra e vê 'Crie a sua senha'")
    c.fim()


def caso_celular(nav, a) -> None:
    c = B.Caso(nav, a.base, a.prefixo, "celular", desktop=False)
    c.entrar("w8b-personal", f"/painel/alunos/{aluno_pid()}", zerar=False)
    c.fechar_avisos()
    ok = c.esperar(lambda: c.tem("[data-card-acesso-aluno]") and c.pg.locator("[data-card-acesso-aluno]").get_attribute("data-acesso-estado") != "carregando", 60)
    esperar_resumo(c, "Rafael Moura")
    p.check(ok, "o card aparece no painel em 390 px")
    # o card inteiro entre a barra de cima e a de baixo (a barra flutuante cobre o fim da tela)
    c.pg.evaluate("() => { const el = document.querySelector('[data-card-acesso-aluno]'); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 64); }")
    c.print("card_celular")
    c.fim()


def caso_negativo(nav, a) -> None:
    c = B.Caso(nav, a.base, a.prefixo, "negativo", desktop=True)
    c.entrar("w8b-outro", f"/painel/alunos/{aluno_pid()}", zerar=False)
    c.fechar_avisos()
    c.esperar(lambda: c.tem("[data-card-acesso-aluno]") or "não" in c.texto().lower(), 40)
    c.pg.wait_for_timeout(2000)
    p.check(not c.tem("[data-acesso-acao]") and not c.tem("[data-acesso-criar]"), "outra profissional: o card não oferece criar senha/acesso")
    c.fim()


CASOS = {"espera": caso_espera, "card": caso_card, "provisoria": caso_provisoria, "criar": caso_criar, "celular": caso_celular, "negativo": caso_negativo}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--prefixo", required=True)
    ap.add_argument("--casos", default=",".join(CASOS))
    ap.add_argument("--schema", default="staging", choices=["staging", "public"])
    a = ap.parse_args()
    a.base = a.base.rstrip("/")
    B.ESTADO["schema"] = a.schema
    if not B.fonte_viva():
        print("a fonte de tokens do Turnstile não está rodando (python3 e2e/w08b/fonte_turnstile.py --porta 5173)")
        return 2
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox"])
        try:
            for nome in [x.strip() for x in a.casos.split(",") if x.strip()]:
                print(f"\n== {nome}", flush=True)
                try:
                    CASOS[nome](nav, a)
                except Exception as e:  # noqa: BLE001
                    p.check(False, f"[{nome}] exceção: {type(e).__name__}: {str(e)[:300]}")
                    caso = B.ESTADO.get("caso")
                    if caso:
                        caso.diagnostico()
                        try:
                            caso.ctx.close()
                        except Exception:  # noqa: BLE001
                            pass
                time.sleep(1)
        finally:
            nav.close()
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
