#!/usr/bin/env python3
"""Physiq W7b — smoke de PRODUÇÃO do aluno sem profissional (conta do app) + um Pix DE VERDADE criado e CANCELADO na hora.
Só contas de TESTE: a descartável w7b.prod.teste.claude@physiqnutri.app ("Teste App W7b", nasce nesta W; senha em
~/.physiq-teste-w7b-prod) e o master de teste admin.teste.claude (perfil 'master' do principal só durante o print, desfeito
no fim). Nenhum dado de cliente é tocado. Em série, com o /health do Banco do Treino antes de cada caso (VM Nano).

  aluno   descartável SEM nada → Boas-vindas (tela 1) → "Treinar sem profissional" (Emagrecer + Treino + Alimentação) → 7 dias
          grátis → Treinos prontos (tela 2) → faixa → Perfil (tela 5) → Alimentação (tela 3) → Pagamentos → Pix DE VERDADE
          (Mercado Pago de produção, R$ 49,90) → cancelado no MP → "Já paguei" confere → nenhuma cobrança aberta
  master  admin.teste: Master › Alunos › "Alunos do app" (a lista de produção, com plano e situação)
Prints prod_* (app 390 × 844 × 3,4; master 1280 × 883 × 2) em ~/projetos/physiqcalc-scratch/prints/w07b/.
A prova viva do cartão (o Weslley paga) fica em prova_real.py (mesma pasta).
Uso: python3 smoke_prod.py [aluno|master|tudo] [--base https://physiqcalc.com.br]
"""
from __future__ import annotations

import argparse
import secrets
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.dont_write_bytecode = True
# a base da W7b: a do repo principal (depois do merge) ou a da worktree da W7b
for _cand in (Path(__file__).resolve().parent, Path.home() / "projetos" / "physiqcalc" / "e2e" / "w07b", Path.home() / "projetos" / "physiqcalc-w07b-sem-profissional" / "e2e" / "w07b",
              Path(__file__).resolve().parent / "e2e" / "w07b"):  # cópia da base (2026-09-29), se o repo ainda não tiver a W7b
    if (_cand / "_base.py").exists():
        sys.path.insert(0, str(_cand))
        break
import _base as B  # noqa: E402

p = B.p
S = "public"
B.ESTADO["schema"] = S
DESC = "w7b-prod"
NOME = "Teste App W7b"
EMAIL = "w7b.prod.teste.claude@physiqnutri.app"
B.CONTAS[DESC] = (EMAIL, B.senha_de(DESC))
MP = "https://api.mercadopago.com"


def mp(metodo: str, caminho: str, corpo: dict | None = None) -> tuple[int, dict]:
    token = (Path.home() / ".physiq-mp-prod").read_text(encoding="utf-8").strip()
    cab = {"Authorization": f"Bearer {token}"}
    if metodo == "POST":
        cab["X-Idempotency-Key"] = secrets.token_hex(16)
    st, r, _ = B.http(metodo, f"{MP}{caminho}", corpo, cab)
    return st, (r if isinstance(r, dict) else {"_": r})


def cobrancas_abertas(pid: str) -> int:
    return B.sql_principal(f"""select count(*)::int n from {S}.cobrancas where paciente_id = '{pid}' and deleted_at is null
                                and status = 'aguardando_confirmacao'""")[0]["n"]


def caso_aluno(nav, a) -> None:
    uid = B.garantir_usuario(EMAIL, B.CONTAS[DESC][1], NOME)
    antes = B.sql_principal(f"select count(*)::int n from {S}.pacientes where user_id = '{uid}' and deleted_at is null")[0]["n"]
    p.check(antes == 0 or B.app_da(DESC) is not None, f"descartável de teste no principal ({uid}; matrículas {antes})")
    if a.refazer and B.app_da(DESC):
        # de novo do zero (conta de TESTE): a matrícula do app anterior vai para a lixeira (fica o histórico, com o Pix cancelado)
        assert EMAIL.endswith(".teste.claude@physiqnutri.app")
        B.sql_principal(f"""update {S}.pacientes set deleted_at = now() where user_id = '{uid}' and conta_id = {S}.conta_do_app() and deleted_at is null;
                            delete from {S}.avisos where destino_user_id = '{uid}'""")
        p.check(B.app_da(DESC) is None, "refazer: a matrícula do app da descartável foi para a lixeira (conta de teste)")
    c = B.Caso(nav, a.base, "prod", "aluno", desktop=False)
    c.entrar(DESC, "/", zerar=False)
    if B.app_da(DESC) is None:
        ok = c.esperar(lambda: c.caminho().startswith("/boas-vindas") and c.pg.locator("[data-onboarding]").count() == 3, 90)
        ordem = c.pg.locator("[data-onboarding]").evaluate_all("(els) => els.map((e) => e.getAttribute('data-onboarding'))") if ok else []
        p.check(ok and ordem == ["TenhoCodigo", "TreinarSemProfissional", "CriarConta"] and "7 DIAS GRÁTIS" in c.texto()
                and "a partir de R$ 29,90" in c.texto(), f"prod: Boas-vindas com a opção nova e o menor preço da tabela ({ordem})")
        c.pg.wait_for_timeout(800)
        c.print("entrada")
        c.pg.locator("[data-sozinho-abrir]").click()
        c.esperar(lambda: c.tem("[data-plano-app='app_treino_alimentacao']") and "R$ 49,90/mês" in c.texto(), 20)
        c.pg.locator("[data-objetivo='emagrecer']").click()
        c.pg.locator("[data-plano-app='app_treino_alimentacao']").click()
        c.pg.locator("[data-form-sozinho]").scroll_into_view_if_needed()
        c.print("escolha_plano")
        c.pg.locator("[data-sozinho-enviar]").click()
        p.check(c.esperar(lambda: c.tem("[data-app-pronto]"), 40), "prod: entrou com os 7 dias grátis")
        ok = c.esperar(lambda: c.caminho().startswith("/perfil/treinos-prontos") and c.pg.locator("[data-cartao-treino-pronto]").count() == 3, 90)
        p.check(ok, f"prod: Treinos prontos do objetivo (catálogo do Banco do Treino) ({c.pg.locator('[data-cartao-treino-pronto]').count()})")
        c.pg.wait_for_timeout(2000)
        c.print("treinos_prontos")
    m = B.app_da(DESC)
    p.check(bool(m) and m["plano"] == "app_treino_alimentacao" and m["objetivo_app"] == "emagrecer" and m["teste_ate"] and m["valor"] == "49.90",
            f"prod: matrícula da conta do app (plano, objetivo, teste) ({m})")

    c.ir("/treino")
    ok = c.esperar(lambda: c.tem("[data-faixa-mensalidade='teste']"), 90)
    t = c.pg.locator("[data-faixa-mensalidade]").inner_text() if ok else ""
    p.check(ok and "Seus dias grátis vão até" in t and "R$ 49,90/mês" in t, f"prod: faixa dos dias grátis ({t!r})")
    c.esperar(lambda: "Sincronizado" in c.texto(), 20)
    c.print("faixa_teste")

    c.ir("/perfil")
    ok = c.esperar(lambda: c.tem("[data-perfil-plano-app]") and c.tem("[data-perfil-linha]"), 60)
    p.check(ok and "Treinos prontos" in c.texto() and "Treino + Alimentação" in c.texto(), "prod: Perfil com o Plano do app (tela 5)")
    c.print("perfil_app")

    c.ir("/perfil/alimentacao")
    ok = c.esperar(lambda: c.pg.locator("[data-prato-pronto]").count() == 8, 60)
    kcal = c.pg.locator("[data-prato-pronto='emagrecer-cafe-ovos-pao-mamao'] [data-prato-kcal]").get_attribute("data-prato-kcal") if ok else None
    p.check(ok and kcal == "269", f"prod: 8 pratos prontos do objetivo, kcal da TACO ({kcal})")
    c.pg.wait_for_timeout(1200)
    c.print("pratos_prontos")

    c.ir("/perfil/pagamentos")
    ok = c.esperar(lambda: c.tem("[data-mensalidade-aluno='teste']"), 60)
    p.check(ok and "Plano do app" in c.pg.locator("[data-mensalidade-aluno]").inner_text(), "prod: Pagamentos nos dias grátis (Assinar)")
    c.print("pagamentos_teste")
    abertas0 = cobrancas_abertas(m["id"])
    c.pg.locator("[data-pagar-mensalidade]").click()
    c.esperar(lambda: c.tem("[data-mp-gerar-pix]"), 20)
    c.pg.locator("[data-mp-gerar-pix]").click()
    ok = c.esperar(lambda: c.tem("[data-mp-pix-aberto]"), 90)
    cob_id = c.pg.locator("[data-mp-pix-aberto]").get_attribute("data-mp-pix-aberto") if ok else None
    cob = B.sql_principal(f"""select id::text, status, valor::text, mp_payment_id, metodo from {S}.cobrancas where id = '{cob_id}'""") if cob_id else []
    cob = cob[0] if cob else {}
    p.check(ok and cob.get("status") == "aguardando_confirmacao" and cob.get("valor") == "49.90" and cob.get("mp_payment_id") and cob.get("metodo") == "pix",
            f"prod: Pix DE VERDADE gerado no Mercado Pago ({ {k: cob.get(k) for k in ('status', 'valor', 'metodo')} })")
    c.pg.wait_for_timeout(800)
    c.print("pix")
    if cob.get("mp_payment_id"):
        st, pay = mp("GET", f"/v1/payments/{cob['mp_payment_id']}")
        p.check(st == 200 and pay.get("status") == "pending" and pay.get("payment_method_id") == "pix" and float(pay.get("transaction_amount") or 0) == 49.9
                and str(pay.get("external_reference") or "").startswith(f"physiq:public:aluno:{m['id']}:"),
                f"prod: o MP tem o Pix pendente de R$ 49,90 com a referência da matrícula ({st} {pay.get('status')})")
        st, r = mp("PUT", f"/v1/payments/{cob['mp_payment_id']}", {"status": "cancelled"})
        p.check(st == 200 and r.get("status") == "cancelled", f"prod: Pix CANCELADO no Mercado Pago ({st} {r.get('status')})")
        c.pg.locator("[data-mp-ja-paguei]").click()
        ok = c.esperar(lambda: B.sql_principal(f"select status from {S}.cobrancas where id = '{cob_id}'")[0]["status"] == "cancelada", 60)
        p.check(ok, "prod: 'Já paguei' conferiu no MP → a cobrança ficou cancelada")
    c.ir("/perfil/pagamentos")
    c.esperar(lambda: c.tem("[data-mensalidade-aluno='teste']"), 60)
    c.pg.wait_for_timeout(1200)
    c.print("pagamentos_pix_cancelado")
    abertas = cobrancas_abertas(m["id"])
    p.check(abertas == 0, f"prod: nenhuma cobrança aberta ({abertas0} antes do Pix → {abertas} depois)")
    c.fim()


def caso_master(nav, a) -> None:
    u = B.uid("master")
    antes = B.sql_principal(f"select role from {S}.profiles where id = '{u}'")[0]["role"]
    B.sql_principal(f"update {S}.profiles set role = 'master' where id = '{u}'")
    try:
        c = B.Caso(nav, a.base, "prod", "master", desktop=True)
        c.entrar("master", "/painel/alunos", zerar=False)
        c.fechar_avisos()
        c.esperar(lambda: c.tem("[data-menu-lateral]"), 120)
        c.esperar(lambda: c.pg.evaluate("() => Object.keys(localStorage).some((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))"), 60)
        c.pg.wait_for_timeout(1000)
        c.ir("/master/alunos?semProfessor=1")
        ok = c.esperar(lambda: c.pg.locator("[data-aluno-do-app]").count() >= 2, 60)
        n = c.pg.locator("[data-aluno-do-app]").count()
        p.check(ok and "alunos do app" in c.texto().lower(), f"prod: master › Alunos › 'Alunos do app' com plano e situação ({n})")
        c.pg.wait_for_timeout(1000)
        c.print("master_alunos_app")
        c.fim()
    finally:
        B.sql_principal(f"update {S}.profiles set role = '{antes}' where id = '{u}'")
        depois = B.sql_principal(f"select role from {S}.profiles where id = '{u}'")[0]["role"]
        p.check(depois == antes, f"prod: perfil do master de teste de volta a '{antes}' ({depois})")


def caso_bloqueio(nav, a) -> None:
    """SÓ LEITURA, depois do `prova_real.py preparar` (dias grátis acabados): o app fechado e o Pagamentos vencido."""
    m = B.app_da(DESC)
    antes = B.sql_principal(f"select count(*)::int n from {S}.cobrancas where paciente_id = '{m['id']}'")[0]["n"]
    c = B.Caso(nav, a.base, "prod", "bloqueio", desktop=False)
    c.entrar(DESC, "/", zerar=False)
    ok = c.esperar(lambda: c.tem("[data-trava-app='pagamento-pendente-app']"), 90)
    p.check(ok and "Seus dias grátis acabaram" in c.texto() and "R$ 1,00/mês" in c.texto(), "prod: dias grátis acabados → o app fecha com 'Pagar'")
    c.print("bloqueio")
    c.pg.locator("[data-trava-pagar]").click()
    ok = c.esperar(lambda: c.caminho().startswith("/perfil/pagamentos") and c.tem("[data-mensalidade-aluno='vencida']"), 60)
    p.check(ok, "prod: só Pagamentos abre, com a mensalidade vencida")
    c.pg.wait_for_timeout(800)
    c.print("pagamentos_vencido")
    depois = B.sql_principal(f"select count(*)::int n from {S}.cobrancas where paciente_id = '{m['id']}'")[0]["n"]
    p.check(antes == depois, f"só leitura: nenhuma cobrança criada ({antes} = {depois})")
    c.fim()


CASOS = {"aluno": caso_aluno, "master": caso_master, "bloqueio": caso_bloqueio}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("modo", nargs="?", default="tudo")
    ap.add_argument("--base", default="https://physiqcalc.com.br")
    ap.add_argument("--refazer", action="store_true", help="aluno: a descartável volta a 'sem nada' antes (só a conta de teste)")
    a = ap.parse_args()
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox"])
        try:
            for nome, f in CASOS.items():
                if a.modo != nome and not (a.modo == "tudo" and nome != "bloqueio"):
                    continue
                print(f"\n== {nome}", flush=True)
                if not B.saude_treino():
                    p.check(False, "Banco do Treino lento/instável — parei antes do caso (nada de restart)")
                    break
                try:
                    f(nav, a)
                except Exception as e:  # noqa: BLE001
                    p.check(False, f"[{nome}] exceção: {type(e).__name__}: {str(e)[:300]}")
                    caso = B.ESTADO.get("caso")
                    if caso:
                        caso.diagnostico()
                        caso.fim()
        finally:
            nav.close()
    return p.fim() if hasattr(p, "fim") else 0


if __name__ == "__main__":
    sys.exit(main())
