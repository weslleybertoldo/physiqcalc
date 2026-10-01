#!/usr/bin/env python3
"""Physiq W16b (Parte B) — CONFERÊNCIA do ensaio no STAGING, depois de rodar scripts/virada/06_migrar_profissional.py com a massa
de teste (e2e/w16b/massa_parteB.py): o "mestre" (papel do login profissional de hoje) virou SÓ ALUNO e o "novo" (papel do login novo)
virou PROFISSIONAL + MASTER. Em série, /health do Treino antes de cada bloco.

  API   papéis no JWT dos 2 bancos · minha_situacao/minha_dieta do mestre (treino + nutrição com o novo; a dieta mais recente) ·
        o novo: master, as 2 contas, a lista de alunos de cada uma · códigos/links antigos (PROF-…) apontam para o novo ·
        Treino: professor do mestre e dos alunos = novo, a linha de professor (código, Pix, integração MP) do novo, o treino do
        mestre intacto · site antigo do Nutri (REST como o novo) vê o paciente
  TELAS painel do novo (Alunos da conta Calc com o mestre na lista) · app do mestre (Dieta = o plano de 30/09) · site antigo do
        Nutri (staging) como o novo · master como o novo
Prints: ~/projetos/physiqcalc-scratch/prints/w16b/staging_parteB_*.png
Uso: python3 e2e/w16b/ensaio_parteB.py [--base https://physiqcalc-staging.vercel.app] [--so-api]
"""
from __future__ import annotations

import argparse
import base64
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402
import massa_parteB as MB  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
p = B.p
IDS = json.loads(MB.IDS.read_text())
M, NV, A1 = MB.M, MB.NV, MB.A1
NUTRI_ANTIGO = "https://physiqnutri-staging.vercel.app"


def q(sql: str) -> list:
    return B.sql_principal(sql)


def claims(token: str) -> dict:
    corpo = token.split(".")[1]
    return json.loads(base64.urlsafe_b64decode(corpo + "=" * (-len(corpo) % 4)))


def api() -> None:
    B.saude_ok("a conferência da API")
    sm, sn = B.sessao(M), B.sessao(NV)
    cm, cn = claims(sm["access_token"]), claims(sn["access_token"])
    p.check((cm.get("app_metadata") or {}).get("role") == "paciente", f"[papel] o mestre entra como ALUNO no principal (role {cm.get('app_metadata', {}).get('role')})")
    p.check((cn.get("app_metadata") or {}).get("role") == "master", f"[papel] o novo entra como MASTER no principal (role {cn.get('app_metadata', {}).get('role')})")
    pf = {x["id"]: x for x in q(f"""select id::text, role, nome, tipo_perfil, isento_assinatura, dados_profissionais ->> 'cref' cref
                                      from {S}.profiles where id in ('{IDS['mestre']}', '{IDS['novo']}')""")}
    n = pf[IDS["novo"]]
    p.check(n["role"] == "master" and n["nome"] == "Mestre Teste W16b" and n["cref"] == "016016-G/AL" and n["isento_assinatura"],
            f"[perfil] o novo ganhou a identidade de profissional (nome, CREF, isento) e o master: {n}")
    p.check(pf[IDS["mestre"]]["role"] == "paciente", f"[perfil] o mestre ficou só aluno ({pf[IDS['mestre']]['role']})")

    st, sit = B.rpc(sm["access_token"], "minha_situacao", {})
    txt = json.dumps(sit, ensure_ascii=False)
    mats = (sit or {}).get("matriculas") or []
    ativas = [m for m in mats if m.get("ativo", True)]
    p.check(st == 200 and not (sit or {}).get("master") and "treino" in txt and "nutricao" in txt,
            f"[aluno] minha_situacao do mestre: não é master, tem treino e nutrição ({len(mats)} matrículas): {txt[:260]}")
    st, dieta = B.rpc(sm["access_token"], "minha_dieta", {})
    d = json.dumps(dieta, ensure_ascii=False)
    p.check(st == 200 and "Plano alimentar 30/09/2026 W16b" in d, f"[aluno] minha_dieta do mestre mostra o plano de 30/09 (o mais recente): {d[:200]}")
    planos = q(f"select count(*)::int n from {S}.planos_alimentares where paciente_id = '{IDS['paciente_do_novo']}' and deleted_at is null")[0]["n"]
    p.check(planos == 2, f"[aluno] os 2 planos (20/09 e 30/09) estão na matrícula de nutrição dele ({planos})")

    st, sitn = B.rpc(sn["access_token"], "minha_situacao", {})
    contas = {c.get("id") or c.get("conta_id"): c for c in ((sitn or {}).get("contas") or [])}
    p.check(st == 200 and (sitn or {}).get("master") is True and IDS["calc"] in contas and IDS["nutri"] in contas,
            f"[profissional] o novo é master e membro das 2 contas: {list(contas)[:3]}")
    for conta, esperado in ((IDS["calc"], {"Aluno Um W16b", "Aluna Dois W16b", "Mestre Teste W16b"}), (IDS["nutri"], {"Mestre Teste W16b"})):
        st, lista = B.rpc(sn["access_token"], "alunos_da_conta", {"p_conta": conta, "p_filtros": {}, "p_offset": 0, "p_limite": 50})
        nomes = {a.get("nome") for a in ((lista or {}).get("itens") or (lista or {}).get("alunos") or [])}
        p.check(st == 200 and esperado <= nomes, f"[profissional] a lista de alunos da conta tem {sorted(esperado)} ({sorted(nomes)})")
    dono = q(f"select user_id::text u, conta_id::text c from {S}.w13_dono_do_codigo('{MB.COD_CALC}')")
    info = q(f"select {S}.cadastro_link_info('{MB.COD_CALC}') as r")[0]["r"]
    p.check(dono and dono[0]["u"] == IDS["novo"] and dono[0]["c"] == IDS["calc"] and (info or {}).get("profissional") == "Mestre Teste W16b",
            f"[links] o código antigo {MB.COD_CALC} (convite e /c/) agora é do novo: {dono} · {info}")
    rec = q(f"""select m.user_id::text u from {S}.recebimento_chaves r join {S}.conta_membros m on m.id = r.membro_id where r.conta_id = '{IDS['calc']}'""")
    p.check(rec and rec[0]["u"] == IDS["novo"], f"[recebimento] a chave Pix da conta continua lá, com o membro = novo ({rec})")

    B.saude_ok("as trocas de token")
    st, tn = B.B5.trocar_token(NV)
    nt = (tn or {}).get("access_token") or ((tn or {}).get("sessao") or {}).get("access_token")
    ct = claims(nt) if nt else {}
    novo_t = q(f"select 1")  # noqa: F841 (aquece)
    tid_novo = B.B5.treino_id(NV)
    p.check(st == 200 and tid_novo and ct.get("sub") == tid_novo and (ct.get("app_metadata") or {}).get("role") == "admin",
            f"[Treino] o novo troca o token: usuário do Treino {tid_novo} com role {(ct.get('app_metadata') or {}).get('role')}")
    time.sleep(3)
    st, tm = B.B5.trocar_token(M)
    mt_tok = (tm or {}).get("access_token") or ((tm or {}).get("sessao") or {}).get("access_token")
    cmt = claims(mt_tok) if mt_tok else {}
    p.check(st == 200 and cmt.get("sub") == IDS["mestre_treino"] and (cmt.get("app_metadata") or {}).get("role") not in ("admin", "master"),
            f"[Treino] o mestre troca o token: o MESMO usuário do Treino, sem admin (role {(cmt.get('app_metadata') or {}).get('role')})")
    t = B.sql_treino(f"""select (select professor_id::text from {S}.physiq_profiles where id = '{IDS['mestre_treino']}') prof_mestre,
                                (select conta_id::text from {S}.physiq_profiles where id = '{IDS['mestre_treino']}') conta_mestre,
                                (select professor_id::text from {S}.physiq_profiles where id = '{IDS['aluno1_treino']}') prof_aluno1,
                                (select id::text from {S}.physiq_professores where codigo_convite = '{MB.COD_CALC}') prof_do_codigo,
                                (select count(*) from {S}.physiq_professores where id = '{IDS['mestre_treino']}') prof_velho,
                                (select count(*) from {S}.physiq_integracoes where professor_id = '{tid_novo}') integracoes,
                                (select count(*) from {S}.physiq_recebimentos where professor_id = '{tid_novo}') recebimentos,
                                (select count(*) from {S}.treino_historico where user_id = '{IDS['mestre_treino']}') historico_mestre,
                                (select count(*) from {S}.physiq_espelho_membros where treino_user_id = '{tid_novo}' and ativo) membros_novo""")[0]
    p.check(t["prof_mestre"] == tid_novo and t["conta_mestre"] == IDS["calc"] and t["prof_aluno1"] == tid_novo,
            f"[Treino] o professor do mestre e dos alunos é o novo (conta do mestre = Calc): {t['prof_mestre'] == tid_novo}, {t['prof_aluno1'] == tid_novo}")
    p.check(t["prof_do_codigo"] == tid_novo and t["prof_velho"] == 0 and t["integracoes"] == 1 and t["recebimentos"] == 1 and t["membros_novo"] == 2,
            f"[Treino] o código {MB.COD_CALC}, a integração MP, o Pix e o espelho de membros são do novo: {t}")
    p.check(t["historico_mestre"] == 1, f"[Treino] o treino do mestre (histórico) ficou onde estava ({t['historico_mestre']})")

    st, lst = B.rest_como(sn["access_token"], "GET", f"pacientes?select=id,nome,nutricionista_id&id=eq.{IDS['paciente_do_novo']}")
    p.check(st == 200 and isinstance(lst, list) and lst and lst[0]["nutricionista_id"] == IDS["novo"],
            f"[site antigo] pelo REST (como o site antigo) o novo vê o paciente dele: {lst}")


def sem_trava_senha(c) -> None:
    """O login do "novo" nasceu com senha provisória (criada pela nutri no site antigo): a trava "Crie a sua senha" da W8b aparece;
    em produção o login novo já entrou com o Google e não tem mais a marca. "Agora não" segue para o painel."""
    if c.esperar(lambda: "Crie a sua senha" in c.texto(), 12):
        c.pg.get_by_role("button", name="Agora não").click()
        c.esperar(lambda: "Crie a sua senha" not in c.texto(), 15)


def telas(base: str) -> None:
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        try:
            B.saude_ok("a tela do painel")
            c = B.Caso(nav, base, "staging", "parteB_painel", desktop=True)
            try:
                c.pg.goto(base + "/privacidade", wait_until="domcontentloaded")
                c.pg.evaluate("([k, v]) => localStorage.setItem(k, v)", [f"physiq_conta_ativa:{IDS['novo']}", IDS["calc"]])
                c.entrar(NV, "/painel/alunos", zerar=True)
                c.fechar_avisos()
                sem_trava_senha(c)
                ok = c.esperar(lambda: "Mestre Teste W16b" in c.texto() and "Aluno Um W16b" in c.texto(), 90)
                p.check(ok, "[tela] painel do novo › Alunos (Calc W16b Mestre): os alunos de antes + o mestre como aluno")
                c.print("parteB_painel")
            finally:
                c.fim()
            time.sleep(3)
            B.saude_ok("a tela do app")
            c = B.Caso(nav, base, "staging", "parteB_app_dieta", desktop=False)
            try:
                c.entrar(M, "/dieta", zerar=True)
                c.fechar_avisos()
                ok = c.esperar(lambda: "30/09/2026 W16b" in c.texto() or "Café da manhã" in c.texto(), 90)
                p.check(ok, "[tela] app do mestre › Dieta: o plano de 30/09 (o mais recente) com a refeição")
                c.print("parteB_app_dieta")
            finally:
                c.fim()
            time.sleep(3)
            c = B.Caso(nav, base, "staging", "parteB_master", desktop=True)
            try:
                # entra pelo painel e vai ao master pela navegação do app (abrir /master direto na 1ª carga cai no painel antes de a
                # sessão do Treino chegar: o MasterLayout olha só o papel do Treino — achado à parte, não é da W16b)
                c.entrar(NV, "/painel/alunos", zerar=True)
                c.fechar_avisos()
                sem_trava_senha(c)
                c.esperar(lambda: c.tem("[data-linhas-alunos]") or "Alunos" in c.texto(), 60)
                # o master do site (MasterLayout) olha o papel da sessão do Treino: espera a troca de token terminar
                c.esperar(lambda: any(x.startswith("200 POST") and "trocar-token" in x for x in c.rede), 60)
                c.pg.wait_for_timeout(5000)
                c.pg.evaluate("window.history.pushState({}, '', '/master'); window.dispatchEvent(new PopStateEvent('popstate'))")
                ok = c.esperar(lambda: "/master" in c.caminho() and c.tem("[data-card-conta]"), 90)
                c.pg.wait_for_timeout(2500)
                p.check(ok, f"[tela] o novo abre o painel master ({c.caminho()})")
                c.print("parteB_master")
            finally:
                c.fim()
            time.sleep(3)
            # site antigo do Nutri (staging): sessão do principal na chave do site antigo
            ctx = nav.new_context(viewport={"width": 1280, "height": 883}, device_scale_factor=2, locale="pt-BR", timezone_id="America/Sao_Paulo")
            pg = ctx.new_page()
            try:
                sess = B.sessao(NV)
                pg.goto(NUTRI_ANTIGO + "/", wait_until="domcontentloaded")
                pg.evaluate("([k, v]) => localStorage.setItem(k, v)", [f"sb-{B.PRINCIPAL_REF}-auth-token", json.dumps(sess)])
                pg.goto(NUTRI_ANTIGO + "/pacientes", wait_until="domcontentloaded")
                ok = False
                for _ in range(60):
                    try:
                        if "Mestre Teste W16b" in pg.inner_text("body"):
                            ok = True
                            break
                    except Exception:  # noqa: BLE001
                        pass
                    pg.wait_for_timeout(1500)
                p.check(ok, "[tela] site antigo do Nutri (staging) como o novo: o paciente (o mestre) aparece na lista")
                B.PRINTS.mkdir(parents=True, exist_ok=True)
                pg.screenshot(path=str(B.PRINTS / "staging_parteB_nutri_antigo.png"))
            finally:
                ctx.close()
        finally:
            nav.close()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", default="https://physiqcalc-staging.vercel.app")
    ap.add_argument("--so-api", action="store_true")
    ap.add_argument("--so-telas", action="store_true")
    a = ap.parse_args()
    if not a.so_telas:
        api()
    if not a.so_api:
        telas(a.base)
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
