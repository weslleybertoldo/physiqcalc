#!/usr/bin/env python3
"""Physiq W28 — E2E de TELAS da virada (Playwright; contexto limpo por caso, sessão por e-mail e senha injetada). Roda depois da
massa + 01 + 03 do ensaio (e2e/w28/massa.py) — as contas w28.*.teste.claude@… já no núcleo com o preço e as regras de hoje.

  nutri_raiz      celular, sem login: /?origem=nutri → "O PhysiqNutri agora é o Physiq" (entrar com o mesmo e-mail e senha / Google)
                  e a URL sem o origem=nutri; "Entrar com o mesmo e-mail e senha" leva ao /entrar/email
  nutri_publica   celular, sem login: /f/<formulário>?origem=nutri → a faixa leve e o formulário (o paciente responde)
  nutri_rotas     painel: rotas antigas do site do Nutri que caíam em "não encontrada" (sub-rotas, ?aba=assinatura, inexistente)
  tolerancia      legado Calc 3 dias depois do vencimento: faixa "pague até" (7 dias) e Configurações › Plano com o preço de hoje
  vencida         legado Calc 10 dias depois: o painel trava (tela de plano vencido, como a conta nova)
  sai_do_legado   legado Nutri ativo: "Mudar plano" avisa que o preço/regras de hoje deixam de valer (cancela; nada muda)
  equipe          legado Calc no núcleo: a equipe convida (sem o aviso "chega na mudança final")
  master          master de TESTE (só durante o caso): Visão geral com "sobre 1–N <mês>" e Contas sem "Cobrança legada"
Prints em ~/projetos/physiqcalc-scratch/prints/w28/<prefixo>_*.png (site 1280×883×2; celular 390×844×3,4).
Uso: python3 e2e/w28/telas.py --base http://localhost:5173 --prefixo local [--casos nutri_raiz,tolerancia]
     (staging: --base https://physiqcalc-staging.vercel.app --prefixo staging)
"""
from __future__ import annotations

import argparse
import importlib.util
import sys
from pathlib import Path

sys.dont_write_bytecode = True
_ESP = importlib.util.spec_from_file_location("_base_w05", Path(__file__).parent.parent / "w05" / "_base.py")
B5 = importlib.util.module_from_spec(_ESP)
sys.modules["_base_w05"] = B5
_ESP.loader.exec_module(B5)  # type: ignore[union-attr]
from playwright.sync_api import sync_playwright  # noqa: E402

p, Caso, CONTAS = B5.p, B5.Caso, B5.CONTAS
B5.PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "w28"
for caso in ("tolerancia", "vencida", "anual", "ciclo"):
    CONTAS[f"w28-calc-{caso}"] = (f"w28.calc.{caso}.teste.claude@physiqcalc.app", B5.senha_de(f"w28-calc-{caso}"))
for caso in ("teste", "pix", "cartao"):
    CONTAS[f"w28-nutri-{caso}"] = (f"w28.nutri.{caso}.teste.claude@physiqnutri.app", B5.senha_de(f"w28-nutri-{caso}"))
CONTAS["w28-master"] = ("w28.master.teste.claude@physiqnutri.app", B5.senha_de("w28-master"))


def sql(q: str) -> list:
    return B5.sql_principal(q)


def conta_de(email: str, origem: str) -> dict:
    r = sql(f"""select c.id::text as id, c.regras_legadas, c.plano, c.faixa, c.valor_travado from staging.contas c join auth.users u on u.id = c.dono_id
              where lower(u.email) = '{email}' and c.origem = '{origem}' limit 1""")
    return r[0] if r else {}


def caso_nutri_raiz(nav, base, pref):
    c = Caso(nav, base, pref, "nutri_raiz", desktop=False)
    try:
        c.ir("/?origem=nutri")
        p.check(c.esperar(lambda: c.tem("[data-boas-vindas-nutri]"), 25), "sem login: aparece 'O PhysiqNutri agora é o Physiq'")
        p.check("O PhysiqNutri agora é o Physiq" in c.texto(), "com o título certo")
        p.check("origem=nutri" not in c.pg.url, f"a URL perde o origem=nutri ({c.pg.url})")
        p.check(c.tem("[data-nutri-entrar-email]") and c.tem("[data-nutri-entrar-google]"), "entrar com o mesmo e-mail e senha / Google")
        c.print("app_boas_vindas_nutri")
        c.pg.locator("[data-nutri-entrar-email]").click()
        p.check(c.esperar(lambda: c.caminho().startswith("/entrar/email"), 15), f"'Entrar com o mesmo e-mail e senha' abre o /entrar/email ({c.caminho()})")
        p.check(not c.tem("[data-boas-vindas-nutri]"), "e a tela fecha")
    finally:
        c.fim()


def caso_nutri_android(nav, base, pref):
    """O APK antigo do Nutri abre o Chrome do Android no 308: lá aparece "Instalar o app Physiq" (a release Latest)."""
    c = Caso(nav, base, pref, "nutri_android", desktop=False)
    try:
        c.ctx.close()
        c.ctx = nav.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3.4, is_mobile=True, has_touch=True,
                                locale="pt-BR", timezone_id="America/Sao_Paulo", service_workers="block",
                                user_agent="Mozilla/5.0 (Linux; Android 14; 21121210G) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36")
        c.pg = c.ctx.new_page()
        c.pg.on("pageerror", lambda e: c.erros.append(str(e)))
        c.ir("/?origem=nutri")
        p.check(c.esperar(lambda: c.tem("[data-boas-vindas-nutri]"), 25), "Android (o APK antigo cai no Chrome): a tela aparece")
        p.check(c.esperar(lambda: c.tem("[data-nutri-instalar-app]"), 10), "com 'Instalar o app Physiq'")
        c.print("app_boas_vindas_nutri_android")
    finally:
        c.fim()


def caso_nutri_publica(nav, base, pref):
    slug = sql("select slug from staging.formularios_preconsulta where ativo order by slug limit 1")
    c = Caso(nav, base, pref, "nutri_publica", desktop=False)
    try:
        if not slug:
            p.check(False, "sem formulário de pré-consulta no staging")
            return
        c.ir(f"/f/{slug[0]['slug']}?origem=nutri")
        p.check(c.esperar(lambda: c.tem("[data-faixa-nutri]"), 25), "página pública: a faixa leve 'O PhysiqNutri agora é o Physiq'")
        p.check(not c.tem("[data-boas-vindas-nutri]"), "sem a folha por cima do formulário")
        p.check(c.caminho().startswith("/f/"), f"o formulário continua na tela ({c.caminho()})")
        c.print("app_publica_faixa_nutri")
    finally:
        c.fim()


def caso_nutri_rotas(nav, base, pref):
    c = Caso(nav, base, pref, "nutri_rotas")
    try:
        c.entrar("w28-nutri-teste", "/dashboard/agenda-antiga?origem=nutri")
        p.check(c.esperar(lambda: c.caminho().startswith("/painel"), 30), f"/dashboard/<qualquer> → /painel ({c.caminho()})")
        p.check(c.esperar(lambda: c.tem("[data-boas-vindas-nutri]"), 15), "logado também vê 'O PhysiqNutri agora é o Physiq'")
        c.print("tela6_nutri_rota_antiga")
        c.pg.locator("[data-nutri-continuar-physiq], [data-nutri-continuar]").first.click()
        c.ir("/configuracoes?aba=assinatura&origem=nutri")
        p.check(c.esperar(lambda: c.caminho().startswith("/painel/configuracoes/plano"), 30), f"/configuracoes?aba=assinatura → Plano ({c.caminho()})")
        c.ir("/pacientes/00000000-0000-0000-0000-000000000000/planejamento/refeicao/1?origem=nutri")
        p.check(c.esperar(lambda: c.caminho().startswith("/painel/alunos/"), 30), f"/pacientes/<id>/<seção>/<mais> → perfil do aluno ({c.caminho()})")
        c.ir("/uma-rota-que-o-nutri-tinha?origem=nutri")
        p.check(c.esperar(lambda: c.caminho().startswith("/painel") or c.caminho() == "/", 30) and not c.tem("[data-nao-encontrada]"),
                f"rota inexistente vinda do Nutri não dá 'Página não encontrada' ({c.caminho()})")
    finally:
        c.fim()


def caso_tolerancia(nav, base, pref):
    c = Caso(nav, base, pref, "tolerancia")
    try:
        c.entrar("w28-calc-tolerancia", "/painel")
        c.fechar_avisos()
        p.check(c.esperar(lambda: c.tem('[data-faixa-aviso-plano="tolerancia"]'), 30), "faixa da tolerância no topo do painel")
        txt = c.pg.locator('[data-faixa-aviso-plano="tolerancia"]').inner_text() if c.tem('[data-faixa-aviso-plano="tolerancia"]') else ""
        p.check("Pague até" in txt and "79,90" in txt, f"'venceu em … Pague até …' com o valor de hoje ({txt[:90]})")
        p.check(not c.tem("[data-plano-vencido]"), "o painel NÃO trava nos 7 dias de tolerância")
        c.print("tela6_faixa_tolerancia")
        c.ir("/painel/configuracoes/plano")
        p.check(c.esperar(lambda: c.tem("[data-preco-de-hoje]"), 30), "Configurações › Plano: 'Preço de hoje mantido'")
        p.check(c.tem("[data-tolerancia-de-hoje]"), "e a tolerância de 7 dias")
        p.check("79,90" in c.pg.locator("[data-preco-de-hoje]").inner_text(), "R$ 79,90/mês (Studio de hoje)")
        c.print("tela7_plano_legado_calc")
    finally:
        c.fim()


def caso_vencida(nav, base, pref):
    c = Caso(nav, base, pref, "vencida")
    try:
        c.entrar("w28-calc-vencida", "/painel/alunos")
        c.fechar_avisos()
        p.check(c.esperar(lambda: c.tem("[data-plano-vencido]"), 30), "legado Calc 10 dias depois do vencimento: o painel trava")
        p.check(c.tem("[data-plano-vencido-pagar]"), "com o 'Pagar' para o dono")
        c.print("tela6_plano_vencido_legado")
        c.pg.locator("[data-plano-vencido-pagar]").click()
        p.check(c.esperar(lambda: c.caminho().startswith("/painel/configuracoes/plano") and c.tem("[data-preco-de-hoje]"), 30),
                "Pagar abre Configurações › Plano com o preço de hoje")
    finally:
        c.fim()


def caso_sai_do_legado(nav, base, pref):
    email = CONTAS["w28-nutri-pix"][0]
    antes = conta_de(email, "legado_nutri")
    c = Caso(nav, base, pref, "sai_do_legado")
    try:
        c.entrar("w28-nutri-pix", "/painel/configuracoes/plano")
        c.fechar_avisos()
        p.check(c.esperar(lambda: c.tem("[data-preco-de-hoje]"), 30), "legado Nutri: 'Preço de hoje mantido: R$ 80,00/mês'")
        c.pg.locator('[data-plano-opcao="treino_nutricao"]').click()
        p.check(c.esperar(lambda: c.tem("[data-aviso-sai-do-legado]"), 15), "escolher outro plano mostra que o preço e as regras de hoje deixam de valer")
        c.pg.locator("[data-botao-mudar-plano]").click()
        p.check(c.esperar(lambda: "Trocar de plano?" in c.texto(), 15), "e pede confirmação antes ('Trocar de plano?')")
        c.print("tela8_mudar_plano_legado")
        c.pg.locator("[data-confirmar-cancelar]").click()
        c.pg.wait_for_timeout(1500)
        depois = conta_de(email, "legado_nutri")
        p.check(depois.get("regras_legadas") is True and depois.get("plano") == antes.get("plano"), "Cancelar não muda nada (segue no preço de hoje)")
    finally:
        c.fim()


def caso_equipe(nav, base, pref):
    c = Caso(nav, base, pref, "equipe")
    try:
        c.entrar("w28-calc-anual", "/painel/configuracoes/equipe")
        c.fechar_avisos()
        p.check(c.esperar(lambda: c.tem("[data-equipe-convidar]"), 30), "conta legada no núcleo: 'Convidar' na Equipe")
        bloqueio = c.pg.locator('[data-config-aba="equipe"]').first.get_attribute("data-equipe-bloqueio")
        p.check(bloqueio == "nenhum", f"sem o aviso de equipe só na mudança final (bloqueio = {bloqueio})")
        c.print("tela7_equipe_legada")
    finally:
        c.fim()


def caso_master(nav, base, pref):
    email = CONTAS["w28-master"][0]
    uid = B5.garantir_usuario(email, CONTAS["w28-master"][1], "Master Teste W28") if hasattr(B5, "garantir_usuario") else None
    if not uid:
        r = sql(f"select id::text as id from auth.users where lower(email) = '{email}'")
        uid = r[0]["id"] if r else None
    sk = B5.service(B5.PRINCIPAL_REF)
    cab = {"apikey": sk, "Authorization": f"Bearer {sk}"}
    B5.http("PUT", f"{B5.PRINCIPAL_URL}/auth/v1/admin/users/{uid}", {"app_metadata": {"role": "master"}}, cab)
    sql(f"update staging.profiles set role = 'master', nome = 'Master Teste W28' where id = '{uid}'")
    c = Caso(nav, base, pref, "master")
    try:
        c.entrar("w28-master", "/master")
        c.fechar_avisos()
        p.check(c.esperar(lambda: c.tem("[data-kpi-receita]"), 40), "Visão geral do master")
        txt = c.pg.locator("[data-kpi-receita]").inner_text() if c.tem("[data-kpi-receita]") else ""
        import re
        p.check(bool(re.search(r"(sobre|em) 1(º|–\d+) [a-z]{3}", txt)) or "planos das contas" in txt,
                f"receita comparada com o MESMO período do mês anterior ({txt[:80]})")
        c.print("tela6_master_visao_geral")
        c.ir("/master/contas")
        p.check(c.esperar(lambda: "W28 Calc" in c.texto() or "W28 Nutri" in c.texto(), 40), "Contas lista as legadas de teste")
        p.check("Cobrança legada até a virada" not in c.texto(), "sem 'Cobrança legada até a virada'")
        c.print("tela6_master_contas")
    finally:
        c.fim()
        # o master de TESTE só durante o caso (o Auth é o mesmo da produção)
        B5.http("PUT", f"{B5.PRINCIPAL_URL}/auth/v1/admin/users/{uid}", {"app_metadata": {"role": None}}, cab)
        sql(f"update staging.profiles set role = 'pessoa' where id = '{uid}'; update public.profiles set role = 'pessoa' where id = '{uid}' and role = 'master'")
        r = sql(f"select raw_app_meta_data->>'role' as r from auth.users where id = '{uid}'")
        p.check(not r or r[0]["r"] in (None, "pessoa"), "o master de teste perdeu o papel de master")


CASOS = {"nutri_raiz": caso_nutri_raiz, "nutri_android": caso_nutri_android, "nutri_publica": caso_nutri_publica, "nutri_rotas": caso_nutri_rotas, "tolerancia": caso_tolerancia,
         "vencida": caso_vencida, "sai_do_legado": caso_sai_do_legado, "equipe": caso_equipe, "master": caso_master}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--prefixo", required=True)
    ap.add_argument("--casos", default=",".join(CASOS))
    a = ap.parse_args()
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox"])
        for nome in a.casos.split(","):
            print(f"\n== {nome}", flush=True)
            try:
                CASOS[nome](nav, a.base.rstrip("/"), a.prefixo)
            except Exception as e:  # noqa: BLE001 — registra e segue
                p.check(False, f"[{nome}] erro: {str(e)[:200]}")
        nav.close()
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
