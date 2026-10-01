#!/usr/bin/env python3
"""Physiq W17 (item 3) — PRODUÇÃO (https://physiqcalc.com.br, schema public): a prova "avaliação física do personal e antropometria
da nutri aparecem juntas no painel e no app; excluir funciona nos 2".

Com 2 contas DESCARTÁVEIS (w17.prod.*.teste.claude@physiqnutri.app): um profissional "Outra área" (conta nova em teste: dono +
personal + nutricionista) e um aluno convidado por ele nos 2 módulos (o convite vai para a caixa de teste do Resend). O aluno entra
(pos-login + troca de token: nasce o usuário dele no Treino). No painel de produção o profissional registra a avaliação física
(formulário do Calc → Banco do Treino) e a antropometria (formulário do Nutri → principal); as 2 aparecem no histórico da aba
Avaliação e na Evolução do app do aluno; depois exclui as 2. No fim tudo é apagado nos 2 bancos e as contagens antes/depois
provam que só as linhas delas mudaram. Nenhum dado de cliente é tocado; nenhum e-mail a pessoa real.

Uso: python3 e2e/w17/prod_avaliacao.py [--manter] [--so-limpar]
"""
from __future__ import annotations

import argparse
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
PROF, ALUNO = "w17-prod-prof", "w17-prod-aluno2"
B.EMAIL.update({PROF: "w17.prod.prof.teste.claude@physiqnutri.app", ALUNO: "w17.prod.aluno2.teste.claude@physiqnutri.app"})
B.NOMES.update({PROF: "Profissional Teste W17", ALUNO: "Aluno Avaliacao W17"})
for _k in (PROF, ALUNO):
    B.CONTAS[_k] = (B.EMAIL[_k], B.B5.senha_de(_k))
NOME_CONTA = "Conta Teste W17 Avaliacao (prova)"
MARCA = "W17 prova prod"
PASTA = Path.home() / "backups" / "physiq" / "2026-09-30-w17" / "prod-prova-avaliacao"
TAB_P = ["pacientes", "contas", "conta_membros", "convites", "cadastros_pendentes", "profiles", "antropometrias", "fotos_evolucao"]
TAB_T = ["physiq_profiles", "physiq_identidades", "physiq_professores", "physiq_espelho_membros", "physiq_avaliacoes", "physiq_registros_fotos"]


def q(sql: str) -> list:
    return B.sql_principal(sql)


def t(sql: str) -> list:
    return B.sql_treino(sql)


def contagens() -> dict:
    r = {f"principal.{x}": q(f"select count(*) as n from public.{x}")[0]["n"] for x in TAB_P}
    r.update({f"treino.{x}": t(f"select count(*) as n from public.{x}")[0]["n"] for x in TAB_T})
    r["principal.auth.users"] = q("select count(*) as n from auth.users")[0]["n"]
    r["treino.auth.users"] = t("select count(*) as n from auth.users")[0]["n"]
    return r


def limpar() -> None:
    """Apaga TUDO das 2 contas descartáveis nos 2 bancos (só elas — o e-mail w17.prod.* é conferido)."""
    for k in (PROF, ALUNO):
        e = B.EMAIL[k]
        assert e.startswith("w17.prod.") and e.endswith(".teste.claude@physiqnutri.app"), e
    up = [v for v in (B.uid(PROF), B.uid(ALUNO)) if v]
    ut = []
    for v in up:
        r = t(f"select treino_user_id::text as t from public.physiq_identidades where principal_user_id = '{v}'")
        if r and r[0]["t"]:
            ut.append(r[0]["t"])
    contas = [r["id"] for r in q(f"select id::text from public.contas where nome = $n${NOME_CONTA}$n$")]
    if up:
        lu = ",".join(f"'{x}'" for x in up)
        contas += [r["id"] for r in q(f"select id::text from public.contas where dono_id in ({lu})")]
    contas = sorted(set(contas))
    if contas:
        cs = ",".join(f"'{c}'" for c in contas)
        pacs = [r["id"] for r in q(f"select id::text from public.pacientes where conta_id in ({cs})")]
        if pacs:
            ps = ",".join(f"'{x}'" for x in pacs)
            for tab in ("antropometrias", "fotos_evolucao", "refeicoes_concluidas", "planos_alimentares", "mensagens_whatsapp"):
                q(f"delete from public.{tab} where paciente_id in ({ps})")
        for tab in ("pacientes", "convites", "cadastros_pendentes", "conta_eventos", "conta_membros"):
            q(f"delete from public.{tab} where conta_id in ({cs})")
        q(f"delete from public.contas where id in ({cs})")
    if up:
        lu = ",".join(f"'{x}'" for x in up)
        q(f"delete from public.pacientes where user_id in ({lu})")
        q(f"delete from public.avisos where destino_user_id in ({lu})")
        q(f"delete from public.espelho_pendencias where payload ->> 'principal_user_id' in ({','.join(repr(x) for x in up)})")
        t(f"delete from public.edge_rate_limits where user_id in ({lu})")
    spt = B.service(B.TREINO_REF)
    for u in ut:
        for tab in ("physiq_avaliacoes", "physiq_registros_fotos", "tb_semana_treinos", "tb_semana_dia_config", "tb_series_padrao_usuario",
                    "tb_grupos_treino_perfis", "edge_rate_limits"):
            t(f"delete from public.{tab} where user_id = '{u}'")
        t(f"delete from public.tb_grupos_treino where professor_id = '{u}'")
        t(f"delete from public.physiq_espelho_membros where treino_user_id = '{u}'")
        t(f"delete from public.physiq_professores where id = '{u}'")
        t(f"delete from public.physiq_identidades where treino_user_id = '{u}'")
        st, _, _ = B.http("DELETE", f"{B.B5.TREINO_URL}/auth/v1/admin/users/{u}", None, {"apikey": spt, "Authorization": f"Bearer {spt}"})
        t(f"delete from public.physiq_profiles where id = '{u}'")
        print("Treino: usuário descartável apagado", u, st)
    spp = B.service(B.PRINCIPAL_REF)
    for u in up:
        st, _, _ = B.http("DELETE", f"{B.PRINCIPAL_URL}/auth/v1/admin/users/{u}", None, {"apikey": spp, "Authorization": f"Bearer {spp}"})
        q(f"delete from public.profiles where id = '{u}'")
        print("principal: usuário descartável apagado", u, st)


def caso(nav, nome: str, conta: str, rota: str, desktop: bool = True):
    c = B.B5.Caso(nav, BASE, "prod", nome, desktop=desktop)
    c.entrar(conta, rota, zerar=False)
    c.fechar_avisos()
    return c


def itens(c) -> list[dict]:
    return c.pg.evaluate("""() => [...document.querySelectorAll('[data-avaliacao-item]')].map(e => ({
        id: e.getAttribute('data-avaliacao-item'), origem: e.getAttribute('data-avaliacao-origem'), autor: e.querySelector('[data-avaliacao-autor]')?.textContent || '' }))""")


def prova(manter: bool) -> None:
    PASTA.mkdir(parents=True, exist_ok=True)
    B.saude_ok("prod — contagens")
    antes = contagens()
    B.json_arquivo(PASTA / "contagens-antes.json", antes)
    for k in (PROF, ALUNO):
        B.B5.garantir_usuario(B.EMAIL[k], B.CONTAS[k][1], B.NOMES[k])
    q(f"update public.profiles set nome = $n${B.NOMES[PROF]}$n$ where id = '{B.uid(PROF)}'")
    st, r = B.rpc(PROF, "criar_minha_conta", {"p_nome": NOME_CONTA, "p_tipo": "outra_area", "p_registro": None})
    p.check(st == 200 and isinstance(r, dict) and r.get("ok"), f"P1 conta descartável (dono + personal + nutricionista) criada em produção → {st} {r}")
    c_id = q(f"select id::text from public.contas where dono_id = '{B.uid(PROF)}' and nome = $n${NOME_CONTA}$n$")[0]["id"]
    st, r = B.B13.alunos(PROF, "convidar", {"conta_id": c_id, "email": B.EMAIL[ALUNO], "modulos": ["treino", "nutricao"]}, origem=BASE)
    p.check(st == 200 and r.get("email_teste") is True, f"P2 convite nos 2 módulos (caixa de teste) → {st} {({k: r.get(k) for k in ('ok', 'email_teste')})}")
    tok = B.token(ALUNO)
    st, _, _ = B.http("POST", f"{B.API_P}/functions/v1/pos-login", {}, {"apikey": B.anon(B.PRINCIPAL_REF), "Authorization": f"Bearer {tok}",
                                                                         "x-schema": S, "Origin": BASE}, timeout=90)
    mat = q(f"select id::text, personal_id::text, nutricionista_id::text, treino_user_id::text from public.pacientes where conta_id = '{c_id}' and user_id = '{B.uid(ALUNO)}' and deleted_at is null")
    p.check(st == 200 and mat and mat[0]["personal_id"] == B.uid(PROF) and mat[0]["nutricionista_id"] == B.uid(PROF), f"P3 aluno entrou → personal e nutri = o profissional → {st} {mat}")
    pid = mat[0]["id"]
    q(f"update public.pacientes set genero = 'masculino', nascimento = '1995-05-10' where id = '{pid}'")
    st1, r1 = B.B5.trocar_token(PROF)
    st2, r2 = B.B5.trocar_token(ALUNO)
    tp, ta = r1.get("treino_user_id"), r2.get("treino_user_id")
    ok = B.esperar(lambda: (t(f"select professor_id::text as p from public.physiq_profiles where id = '{ta}'") or [{}])[0].get("p") == tp, 60, 3)
    p.check(st1 == 200 and st2 == 200 and bool(ok), f"P4 Treino: o aluno ligado ao profissional ({bool(ok)})")
    rota = mat[0]["treino_user_id"] or pid
    hoje = B.B5.hoje().isoformat()
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        B.saude_ok("prod — avaliação física")
        c = caso(nav, "avaliacao", PROF, f"/painel/alunos/{rota}/avaliacao")
        try:
            ok = c.esperar(lambda: c.tem("[data-aba-avaliacao]") and c.pg.locator("[data-aba-avaliacao]").first.get_attribute("data-avaliacao-treino") == "ok", 120)
            p.check(ok and c.pg.locator("[data-aba-avaliacao]").first.get_attribute("data-avaliacao-permissoes") == "fisica,antropometria",
                    "P5 a aba Avaliação abre em produção, com os 2 papéis")
            # avaliação física (Calc → Treino)
            c.pg.locator("[data-avaliacao-nova]").first.click()
            c.esperar(lambda: c.tem("[data-avaliacao-nova-fisica]"), 10)
            c.pg.locator("[data-avaliacao-nova-fisica]").click()
            c.esperar(lambda: c.tem("[data-modal-avaliacao-fisica]"), 15)
            c.pg.locator("[data-fisica-peso]").fill("80")
            c.pg.locator("[data-fisica-altura]").fill("175")
            c.pg.locator("[data-fisica-idade]").fill("31")
            c.pg.locator('[data-campos-avaliacao] [data-metodo="dobras_3"]').click()
            for i, v in enumerate(("12", "18", "14")):
                c.pg.locator("[data-campos-avaliacao] input").nth(i).fill(v)
            c.pg.locator("[data-fisica-observacao]").fill(MARCA)
            c.pg.locator("[data-btn-salvar-fisica]").click()
            ok = c.esperar(lambda: t(f"select count(*)::int n from public.physiq_avaliacoes where user_id = '{ta}' and observacao = '{MARCA}'")[0]["n"] == 1, 60)
            p.check(ok, "P6 avaliação física gravada no Banco do Treino (produção)")
            c.esperar(lambda: not c.tem("[data-modal-avaliacao-fisica]"), 20)
            c.esperar(lambda: c.pg.locator("[data-sonner-toast]").count() == 0, 12)  # nunca remover o nó do React à mão
            # antropometria (Nutri → principal)
            B.saude_ok("prod — antropometria")
            c.pg.locator("[data-avaliacao-nova]").first.click()
            c.esperar(lambda: c.tem("[data-avaliacao-nova-antropometria]"), 10)
            c.pg.locator("[data-avaliacao-nova-antropometria]").click()
            c.esperar(lambda: c.tem("[data-modal-antropometria='nova']"), 15)
            c.pg.locator("[data-campo-peso]").fill("80,4")
            c.pg.locator("[data-campo-altura]").fill("175")
            c.pg.locator("[data-campo-protocolo]").select_option("nenhum")
            c.pg.locator("[data-circunferencias] [data-campo-circ='cintura']").fill("82")
            c.pg.locator("[data-campo-observacao]").fill(MARCA)
            c.pg.locator("[data-btn-salvar-antropometria]").click()
            ok = c.esperar(lambda: q(f"select count(*)::int n from public.antropometrias where paciente_id = '{pid}' and observacao = '{MARCA}' and deleted_at is null")[0]["n"] == 1, 60)
            p.check(ok, "P7 antropometria gravada no banco principal (produção)")
            ok = c.esperar(lambda: len(itens(c)) == 2, 60)
            li = itens(c)
            p.check(ok and {x["origem"] for x in li} == {"treino", "principal"}, f"P8 as 2 juntas no histórico do painel, com o autor ({[(x['origem'], x['autor'][:40]) for x in li]})")
            c.esperar(lambda: c.pg.locator("[data-sonner-toast]").count() == 0, 12)  # nunca remover o nó do React à mão
            c.pg.mouse.move(5, 5)
            c.print("avaliacao")
        finally:
            c.fim()
        B.saude_ok("prod — app do aluno")
        a = caso(nav, "app_evolucao", ALUNO, "/evolucao", desktop=False)
        try:
            ok = a.esperar(lambda: a.tem("[data-evolucao-conteudo]"), 120)
            a.pg.wait_for_timeout(1500)
            dd = f"{hoje[8:10]}/{hoje[5:7]}"
            if ok and a.tem("[data-evolucao-contagem]"):
                a.pg.locator("[data-evolucao-contagem]").first.click()
                a.esperar(lambda: a.tem("[data-sheet-avaliacoes]"), 20)
            txt = a.pg.locator("[data-sheet-avaliacoes]").first.inner_text() if a.tem("[data-sheet-avaliacoes]") else a.texto()
            p.check(txt.count(dd) >= 2, f"P9 o app do aluno (produção) mostra as 2 avaliações de hoje juntas ({txt.count(dd)}×)")
            a.print("app_evolucao")
        finally:
            a.fim()
        B.saude_ok("prod — excluir")
        c = caso(nav, "excluir", PROF, f"/painel/alunos/{rota}/avaliacao")
        try:
            c.esperar(lambda: c.tem("[data-aba-avaliacao]") and c.pg.locator("[data-aba-avaliacao]").first.get_attribute("data-avaliacao-treino") == "ok", 120)
            c.esperar(lambda: len(itens(c)) == 2, 60)
            for origem in ("principal", "treino"):
                alvo = [x for x in itens(c) if x["origem"] == origem]
                if not alvo:
                    continue
                c.pg.locator(f"[data-avaliacao-excluir='{alvo[0]['id']}']").click()
                c.esperar(lambda: c.tem("[data-btn-confirmar-excluir-avaliacao]"), 10)
                c.pg.locator("[data-btn-confirmar-excluir-avaliacao]").click()
                c.esperar(lambda: not any(x["id"] == alvo[0]["id"] for x in itens(c)), 60)
            n_t = t(f"select count(*)::int n from public.physiq_avaliacoes where user_id = '{ta}'")[0]["n"]
            n_p = q(f"select count(*)::int n from public.antropometrias where paciente_id = '{pid}' and deleted_at is null")[0]["n"]
            p.check(n_t == 0 and n_p == 0, f"P10 excluir funciona nos 2 bancos (Treino {n_t}, principal {n_p})")
        finally:
            c.fim()
        nav.close()

    if manter:
        print("(--manter: as contas descartáveis ficam; rode --so-limpar depois)")
        return
    limpar()
    time.sleep(3)
    depois = contagens()
    B.json_arquivo(PASTA / "contagens-depois.json", depois)
    dif = {k: (antes[k], depois.get(k)) for k in antes if antes[k] != depois.get(k)}
    p.check(not dif, f"P11 contagens iguais antes e depois (só as linhas das descartáveis mudaram e foram apagadas) {dif}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--manter", action="store_true")
    ap.add_argument("--so-limpar", action="store_true")
    a = ap.parse_args()
    if a.so_limpar:
        limpar()
        sys.exit(0)
    try:
        prova(a.manter)
    except Exception as e:  # noqa: BLE001
        p.check(False, f"exceção: {str(e)[:300]}")
        if not a.manter:
            limpar()
    sys.exit(p.fim())
