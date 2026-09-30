#!/usr/bin/env python3
"""Physiq W13 — PRODUÇÃO (https://physiqcalc.com.br, schema public): smoke do painel Alunos e a prova OFFLINE da trava (P20).

P20: no staging o PowerSync lê o `public`, então a prova "bloquear → sincronizar → modo avião → reabrir = fechado; desbloquear →
volta" roda AQUI, com 2 contas DESCARTÁVEIS (w13.prod.*.teste.claude@physiqnutri.app): um profissional (conta nova em teste) e
um aluno convidado por ele (o convite vai para a caixa de teste do Resend). No fim tudo é apagado nos 2 bancos e as contagens
antes/depois provam que só as linhas delas mudaram. Nenhum dado de cliente é tocado.
Uso: python3 e2e/w13/prod.py [--manter] [--so-limpar]
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
DONO, ALUNO = "w13-prod-dono", "w13-prod-aluno"
B.EMAIL.update({DONO: "w13.prod.dono.teste.claude@physiqnutri.app", ALUNO: "w13.prod.aluno.teste.claude@physiqnutri.app"})
B.NOMES.update({DONO: "Profissional Teste W13", ALUNO: "Aluno Teste W13"})
for _k in (DONO, ALUNO):
    B.CONTAS[_k] = (B.EMAIL[_k], B.B5.senha_de(_k))
NOME_CONTA = "Conta Teste W13 (prova)"
PASTA = Path.home() / "backups" / "physiq" / "2026-09-30-w13" / "prod-prova"
TAB_P = ["pacientes", "contas", "conta_membros", "convites", "conta_eventos", "cadastros_pendentes", "avisos", "profiles"]
TAB_T = ["physiq_profiles", "physiq_identidades", "physiq_professores", "physiq_espelho_membros"]


def q(sql: str) -> list:
    return B.sql_principal(sql)


def contagens() -> dict:
    r = {f"principal.{t}": q(f"select count(*) as n from public.{t}")[0]["n"] for t in TAB_P}
    r.update({f"treino.{t}": B.sql_treino(f"select count(*) as n from public.{t}")[0]["n"] for t in TAB_T})
    r["principal.auth.users"] = q("select count(*) as n from auth.users")[0]["n"]
    r["treino.auth.users"] = B.sql_treino("select count(*) as n from auth.users")[0]["n"]
    return r


def ids() -> dict:
    u = {k: B.uid(k) for k in (DONO, ALUNO)}
    t = {}
    for k, v in u.items():
        if v:
            r = B.sql_treino(f"select treino_user_id::text as t from public.physiq_identidades where principal_user_id = '{v}'")
            t[k] = r[0]["t"] if r else None
    return {"principal": u, "treino": t}


def limpar() -> None:
    """Apaga TUDO das 2 contas descartáveis nos 2 bancos (só elas — o e-mail w13.prod.* é conferido)."""
    info = ids()
    for k, e in ((DONO, B.EMAIL[DONO]), (ALUNO, B.EMAIL[ALUNO])):
        assert e.startswith("w13.prod.") and e.endswith(".teste.claude@physiqnutri.app"), e
    up = [v for v in info["principal"].values() if v]
    ut = [v for v in info["treino"].values() if v]
    contas = [r["id"] for r in q(f"select id::text from public.contas where nome = $n${NOME_CONTA}$n$")]
    if up:
        lu = ",".join(f"'{x}'" for x in up)
        contas += [r["id"] for r in q(f"select id::text from public.contas where dono_id in ({lu})")]
    contas = sorted(set(contas))
    if contas:
        cs = ",".join(f"'{c}'" for c in contas)
        q(f"delete from public.pacientes where conta_id in ({cs})")
        q(f"delete from public.convites where conta_id in ({cs})")
        q(f"delete from public.cadastros_pendentes where conta_id in ({cs})")
        q(f"delete from public.conta_eventos where conta_id in ({cs})")
        q(f"delete from public.conta_membros where conta_id in ({cs})")
        q(f"delete from public.contas where id in ({cs})")
    if up:
        lu = ",".join(f"'{x}'" for x in up)
        q(f"delete from public.pacientes where user_id in ({lu})")
        q(f"delete from public.avisos where destino_user_id in ({lu})")
        q(f"delete from public.espelho_pendencias where payload ->> 'principal_user_id' in ({','.join(repr(x) for x in up)})")
        B.sql_treino(f"delete from public.edge_rate_limits where user_id in ({lu})")
    spt = B.service(B.TREINO_REF)
    for t in ut:
        B.sql_treino(f"delete from public.physiq_espelho_membros where treino_user_id = '{t}'")
        B.sql_treino(f"delete from public.physiq_professores where id = '{t}'")
        B.sql_treino(f"delete from public.physiq_identidades where treino_user_id = '{t}'")
        st, _, _ = B.http("DELETE", f"{B.B5.TREINO_URL}/auth/v1/admin/users/{t}", None, {"apikey": spt, "Authorization": f"Bearer {spt}"})
        B.sql_treino(f"delete from public.physiq_profiles where id = '{t}'")
        print("Treino: usuário descartável apagado", t, st)
    spp = B.service(B.PRINCIPAL_REF)
    for u in up:
        st, _, _ = B.http("DELETE", f"{B.PRINCIPAL_URL}/auth/v1/admin/users/{u}", None, {"apikey": spp, "Authorization": f"Bearer {spp}"})
        q(f"delete from public.profiles where id = '{u}'")
        print("principal: usuário descartável apagado", u, st)


def caso(nav, nome: str, conta: str, rota: str, desktop: bool, sw: bool = False) -> "B.Caso":
    c = B.Caso(nav, BASE, "prod", nome, desktop=desktop)
    if sw:
        c.ctx.close()
        c.ctx = nav.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3.4, is_mobile=True, has_touch=True,
                                locale="pt-BR", timezone_id="America/Sao_Paulo", service_workers="allow")
        c.pg = c.ctx.new_page()
        c.pg.on("pageerror", lambda e: c.erros.append(str(e)))
        c.pg.on("dialog", lambda d: d.accept())
    c.entrar(conta, rota, zerar=False)
    c.fechar_avisos()
    return c


def foto(c, nome: str) -> str:
    try:
        c.pg.mouse.move(5, 5)
    except Exception:  # noqa: BLE001
        pass
    c.esperar(lambda: c.pg.locator("[data-sonner-toast]").count() == 0, 10)
    return c.print(nome)


def attr(c, sel: str, nome: str):
    try:
        loc = c.pg.locator(sel).first
        return loc.get_attribute(nome, timeout=3000) if loc.count() else None
    except Exception:  # noqa: BLE001
        return None


def prova(manter: bool) -> None:
    PASTA.mkdir(parents=True, exist_ok=True)
    B.saude_ok("prod — contagens")
    antes = contagens()
    B.json_arquivo(PASTA / "contagens-antes.json", antes)
    # 1. as 2 contas descartáveis e a conta do profissional (nova, em teste)
    for k in (DONO, ALUNO):
        B.B5.garantir_usuario(B.EMAIL[k], B.CONTAS[k][1], B.NOMES[k])
    q(f"update public.profiles set nome = $n${B.NOMES[DONO]}$n$, tipo_perfil = 'personal' where id = '{B.uid(DONO)}'")
    st, r = B.rpc(DONO, "criar_minha_conta", {"p_nome": NOME_CONTA, "p_tipo": "personal", "p_registro": "CREF 001315-G/PE"})
    p.check(st == 200 and isinstance(r, dict) and r.get("ok"), f"P1 conta descartável criada em produção → {st} {r}")
    c_id = q(f"select id::text from public.contas where dono_id = '{B.uid(DONO)}' and nome = $n${NOME_CONTA}$n$")[0]["id"]
    # 2. convite de verdade em produção (e-mail vai para a caixa de teste do Resend) + aceite no 1º login do aluno (C7)
    st, r = B.alunos(DONO, "convidar", {"conta_id": c_id, "email": B.EMAIL[ALUNO], "modulos": ["treino"]}, origem=BASE)
    p.check(st == 200 and r.get("email_teste") is True and r.get("email_enviado") is True, f"P2 convite em produção (caixa de teste) → {st} {({k: r.get(k) for k in ('ok', 'email_teste', 'email_enviado')})}")
    tok = B.token(ALUNO)
    st, _, _ = B.http("POST", f"{B.API_P}/functions/v1/pos-login", {}, {"apikey": B.anon(B.PRINCIPAL_REF), "Authorization": f"Bearer {tok}",
                                                                         "x-schema": S, "Origin": BASE}, timeout=90)
    mat = q(f"select id::text, personal_id::text from public.pacientes where conta_id = '{c_id}' and user_id = '{B.uid(ALUNO)}' and deleted_at is null")
    p.check(st == 200 and mat and mat[0]["personal_id"] == B.uid(DONO), f"P3 aluno entrou → matrícula com o profissional (C7) → {st} {mat}")
    pid = mat[0]["id"]
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        # 3. o painel (smoke): a lista com o aluno e o número do menu = total
        B.saude_ok("prod — painel")
        d = caso(nav, "painel", DONO, "/painel/alunos", desktop=True)
        try:
            ok = d.esperar(lambda: d.tem(f'[data-aluno-linha="{pid}"]'), 90)
            p.check(ok, "P4 painel em produção: a lista mostra o aluno descartável")
            ok = d.esperar(lambda: d.pg.locator('[data-menu-lateral] [data-nav="/painel/alunos"] [data-contador]').count() > 0
                           and d.pg.locator('[data-menu-lateral] [data-nav="/painel/alunos"] [data-contador]').first.inner_text().strip() == attr(d, "[data-pagina-alunos]", "data-total-alunos"), 40)
            p.check(ok, f"P4 número = tela em produção (menu = {attr(d, '[data-pagina-alunos]', 'data-total-alunos')})")
            foto(d, "lista")
        finally:
            d.ctx.close()
        # 4. o app do aluno (celular, com o service worker — o "sem internet" de verdade abre do cache do aparelho)
        B.saude_ok("prod — app do aluno")
        a = caso(nav, "app", ALUNO, "/", desktop=False, sw=True)
        try:
            ok = a.esperar(lambda: (attr(a, "[data-card-treino-hoje]", "data-card-treino-hoje") or "carregando") != "carregando", 120)
            p.check(ok, f"P5 app abre no Início com o Treino (troca de token + PowerSync) → {attr(a, '[data-card-treino-hoje]', 'data-card-treino-hoje')}")
            # o service worker precisa CONTROLAR a página (e guardar o app) antes do modo avião — como na W12 (offline_frio)
            for rotulo in ("Treino", "Perfil", "Início"):
                try:
                    a.pg.locator("[data-tabbar] [data-aba]", has_text=rotulo).first.click(timeout=5000)
                    a.pg.wait_for_timeout(1200)
                except Exception:  # noqa: BLE001
                    pass
            ok_sw = a.esperar(lambda: a.pg.evaluate("async () => !!(navigator.serviceWorker && (await navigator.serviceWorker.getRegistration()) && navigator.serviceWorker.controller)"), 60)
            if not ok_sw:  # a 1ª carga nem sempre fica sob o service worker: recarrega com internet e espera de novo
                a.pg.reload(wait_until="domcontentloaded")
                a.esperar(lambda: a.tem("[data-aba-inicio]"), 90)
                ok_sw = a.esperar(lambda: a.pg.evaluate("async () => !!navigator.serviceWorker && !!navigator.serviceWorker.controller"), 60)
            p.check(bool(ok_sw), "P5b o service worker controla o app (abre sem internet)")
            a.pg.wait_for_timeout(3000)
            uid_p = B.uid(ALUNO)
            situacao_antes = a.pg.evaluate(f"() => localStorage.getItem('physiq_situacao:{uid_p}')")
            p.check(bool(situacao_antes) and '"bloqueada":false' in (situacao_antes or "").replace(" ", ""), "P6 situação guardada no aparelho (antes do bloqueio: livre)")
            tu = B.treino_id(ALUNO)
            # 5. bloquear (o profissional) → espelho no Treino → PowerSync leva ao aparelho → o app fecha na hora
            st, r = B.alunos(DONO, "bloquear", {"aluno_id": pid, "mensagem": "Acesso pausado para o teste da W13."}, origem=BASE)
            p.check(st == 200 and r.get("ok"), f"P7 bloquear em produção → {st}")
            ok = B.esperar(lambda: B.status_treino(tu) == "bloqueado", 120, 3)
            p.check(bool(ok), f"P8 espelho no Treino (public): status = {B.status_treino(tu)}")
            ok = a.esperar(lambda: a.tem('[data-trava-app="bloqueio-profissional"]'), 120)
            p.check(ok, "P9 sincronizou: o app aberto fecha sozinho com \"Acesso pausado pelo seu profissional\"")
            foto(a, "app_bloqueado")
            # 6. MODO AVIÃO: a situação do aparelho volta a ser a de ANTES do bloqueio (só o PowerSync sabe) e o app reabre sem internet
            a.pg.evaluate("([k, v]) => localStorage.setItem(k, v)", [f"physiq_situacao:{uid_p}", situacao_antes])
            a.ctx.set_offline(True)
            try:
                a.pg.reload(wait_until="domcontentloaded")
            except Exception as e:  # noqa: BLE001
                print("   recarga sem internet falhou:", str(e)[:160], flush=True)
            ok = a.esperar(lambda: a.tem('[data-trava-app="bloqueio-profissional"]'), 60)
            p.check(ok, "P10 SEM INTERNET, reaberto e com a situação guardada de antes do bloqueio: continua fechado (o espelho do PowerSync)")
            p.check(not a.tem("[data-aba-inicio]"), "P10 nenhuma aba abre sem internet (negativo)")
            foto(a, "offline_bloqueado")
            # 7. desbloquear → volta (com internet)
            st, r = B.alunos(DONO, "desbloquear", {"aluno_id": pid}, origem=BASE)
            p.check(st == 200, f"P11 desbloquear em produção → {st}")
            B.esperar(lambda: B.status_treino(tu) == "ativo", 120, 3)
            a.ctx.set_offline(False)
            a.pg.reload(wait_until="domcontentloaded")
            ok = a.esperar(lambda: a.tem("[data-aba-inicio]") and not a.tem('[data-trava-app="bloqueio-profissional"]'), 120)
            p.check(ok, "P12 desbloqueado: com internet o app volta a abrir no Início")
            ok = a.esperar(lambda: (attr(a, "[data-card-treino-hoje]", "data-card-treino-hoje") or "carregando") not in ("carregando",), 120)
            p.check(ok, f"P12 o treino volta (a troca de token dá a sessão de novo) → {attr(a, '[data-card-treino-hoje]', 'data-card-treino-hoje')}")
            foto(a, "desbloqueado")
        finally:
            a.ctx.close()
        nav.close()
    B.json_arquivo(PASTA / "ids.json", ids())
    if not manter:
        limpar()
        time.sleep(3)
        depois = contagens()
        B.json_arquivo(PASTA / "contagens-depois.json", depois)
        dif = {k: (antes[k], depois[k]) for k in antes if antes[k] != depois.get(k)}
        p.check(not dif, f"P13 limpeza: contagens de produção iguais antes/depois (só as linhas descartáveis mudaram) → diferenças {dif}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--manter", action="store_true")
    ap.add_argument("--so-limpar", action="store_true")
    a = ap.parse_args()
    if a.so_limpar:
        limpar()
        return 0
    try:
        prova(a.manter)
    finally:
        if not a.manter and B.uid(DONO):
            print("limpeza de segurança (as descartáveis ainda existiam)")
            limpar()
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
