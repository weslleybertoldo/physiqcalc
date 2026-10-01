#!/usr/bin/env python3
"""Physiq W17 (item 2) — PRODUÇÃO (https://physiqcalc.com.br, schema public): "Salvar e enviar ao aluno" com e-mail e o atalho do
WhatsApp, com 2 contas DESCARTÁVEIS (w17.prod.*.teste.claude@physiqnutri.app): uma nutricionista (conta nova em teste, dono +
nutri) e um aluno convidado por ela só com Nutrição (o convite e o e-mail do plano vão para a caixa de teste do Resend — o
domínio de teste não existe). A nutri cria a prescrição, usa "Salvar e enviar ao aluno" (aviso no sino + e-mail aceito pelo
Resend; o 2º clique não repete) e o botão do WhatsApp tem o atalho com a mensagem pronta; o aluno vê o aviso no sino do app.
No fim tudo é apagado e as contagens antes/depois provam que só as linhas delas mudaram. Nenhum dado de cliente é tocado.

Uso: python3 e2e/w17/prod_envio.py [--manter] [--so-limpar]
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

S = "public"
B.ESTADO["schema"] = S
p = B.p
BASE = "https://physiqcalc.com.br"
NUTRI, ALUNO = "w17-prod-nutri", "w17-prod-aluno"
B.EMAIL.update({NUTRI: "w17.prod.nutri.teste.claude@physiqnutri.app", ALUNO: "w17.prod.aluno.teste.claude@physiqnutri.app"})
B.NOMES.update({NUTRI: "Nutri Teste W17", ALUNO: "Aluno Teste W17"})
for _k in (NUTRI, ALUNO):
    B.CONTAS[_k] = (B.EMAIL[_k], B.B5.senha_de(_k))
NOME_CONTA = "Conta Teste W17 (prova)"
TELEFONE = "00900001799"
PASTA = Path.home() / "backups" / "physiq" / "2026-09-30-w17" / "prod-prova-envio"
TAB_P = ["pacientes", "contas", "conta_membros", "convites", "cadastros_pendentes", "profiles"]
TAB_T = ["physiq_profiles", "physiq_identidades", "physiq_professores", "physiq_espelho_membros"]


def q(sql: str) -> list:
    return B.sql_principal(sql)


def contagens() -> dict:
    r = {f"principal.{t}": q(f"select count(*) as n from public.{t}")[0]["n"] for t in TAB_P}
    r.update({f"treino.{t}": B.sql_treino(f"select count(*) as n from public.{t}")[0]["n"] for t in TAB_T})
    r["principal.auth.users"] = q("select count(*) as n from auth.users")[0]["n"]
    r["treino.auth.users"] = B.sql_treino("select count(*) as n from auth.users")[0]["n"]
    return r


def limpar() -> None:
    """Apaga TUDO das 2 contas descartáveis nos 2 bancos (só elas — o e-mail w17.prod.* é conferido)."""
    for k in (NUTRI, ALUNO):
        e = B.EMAIL[k]
        assert e.startswith("w17.prod.") and e.endswith(".teste.claude@physiqnutri.app"), e
    up = [v for v in (B.uid(NUTRI), B.uid(ALUNO)) if v]
    ut = []
    for v in up:
        r = B.sql_treino(f"select treino_user_id::text as t from public.physiq_identidades where principal_user_id = '{v}'")
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
            q(f"delete from public.refeicoes_concluidas where paciente_id in ({ps})")
            q(f"delete from public.planos_alimentares where paciente_id in ({ps})")
            q(f"delete from public.mensagens_whatsapp where paciente_id in ({ps})")
        for t in ("pacientes", "convites", "cadastros_pendentes", "conta_eventos", "conta_membros"):
            q(f"delete from public.{t} where conta_id in ({cs})")
        q(f"delete from public.contas where id in ({cs})")
    if up:
        lu = ",".join(f"'{x}'" for x in up)
        q(f"delete from public.pacientes where user_id in ({lu})")
        q(f"delete from public.avisos where destino_user_id in ({lu})")
        q(f"delete from public.espelho_pendencias where payload ->> 'principal_user_id' in ({','.join(repr(x) for x in up)})")
        B.sql_treino(f"delete from public.edge_rate_limits where user_id in ({lu})")
    spt = B.service(B.TREINO_REF)
    for t in ut:
        for tab in ("tb_semana_treinos", "tb_semana_dia_config", "tb_series_padrao_usuario", "tb_grupos_treino_perfis", "edge_rate_limits"):
            B.sql_treino(f"delete from public.{tab} where user_id = '{t}'")
        B.sql_treino(f"delete from public.tb_grupos_treino where professor_id = '{t}'")
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


def caso(nav, nome: str, conta: str, rota: str, desktop: bool = True):
    c = B.B5.Caso(nav, BASE, "prod", nome, desktop=desktop)
    c.entrar(conta, rota, zerar=False)
    c.fechar_avisos()
    return c


def toast(c, trecho: str, timeout: float = 45) -> str:
    alvo = c.pg.locator("[data-sonner-toast]", has_text=trecho)
    c.esperar(lambda: alvo.count() > 0, timeout)
    return alvo.first.inner_text() if alvo.count() else " | ".join(c.pg.locator("[data-sonner-toast]").all_inner_texts())


def prova(manter: bool) -> None:
    PASTA.mkdir(parents=True, exist_ok=True)
    B.saude_ok("prod — contagens")
    antes = contagens()
    B.json_arquivo(PASTA / "contagens-antes.json", antes)
    for k in (NUTRI, ALUNO):
        B.B5.garantir_usuario(B.EMAIL[k], B.CONTAS[k][1], B.NOMES[k])
    q(f"update public.profiles set nome = $n${B.NOMES[NUTRI]}$n$ where id = '{B.uid(NUTRI)}'")
    st, r = B.rpc(NUTRI, "criar_minha_conta", {"p_nome": NOME_CONTA, "p_tipo": "nutricionista", "p_registro": "CRN 00000"})
    p.check(st == 200 and isinstance(r, dict) and r.get("ok"), f"P1 conta descartável (dono + nutricionista) criada em produção → {st} {r}")
    c_id = q(f"select id::text from public.contas where dono_id = '{B.uid(NUTRI)}' and nome = $n${NOME_CONTA}$n$")[0]["id"]
    st, r = B.B13.alunos(NUTRI, "convidar", {"conta_id": c_id, "email": B.EMAIL[ALUNO], "modulos": ["nutricao"]}, origem=BASE)
    p.check(st == 200 and r.get("email_teste") is True, f"P2 convite em produção (caixa de teste) → {st} {({k: r.get(k) for k in ('ok', 'email_teste', 'email_enviado')})}")
    tok = B.token(ALUNO)
    st, _, _ = B.http("POST", f"{B.API_P}/functions/v1/pos-login", {}, {"apikey": B.anon(B.PRINCIPAL_REF), "Authorization": f"Bearer {tok}",
                                                                         "x-schema": S, "Origin": BASE}, timeout=90)
    mat = q(f"select id::text, nutricionista_id::text, treino_user_id::text, email from public.pacientes where conta_id = '{c_id}' and user_id = '{B.uid(ALUNO)}' and deleted_at is null")
    p.check(st == 200 and mat and mat[0]["nutricionista_id"] == B.uid(NUTRI) and mat[0]["email"] == B.EMAIL[ALUNO],
            f"P3 aluno entrou → matrícula com a nutri e o e-mail de teste → {st} {mat}")
    pid = mat[0]["id"]
    rota = mat[0]["treino_user_id"] or pid
    q(f"update public.pacientes set telefone = '{TELEFONE}' where id = '{pid}'")  # telefone de mentira (só da matrícula descartável)

    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox"])
        c = caso(nav, "nutri_envio", NUTRI, f"/painel/alunos/{rota}/dieta")
        try:
            ok = c.esperar(lambda: c.tem("[data-btn-primeiro-plano]") or c.tem("[data-editor-dieta]"), 90)
            p.check(ok, "P4 a aba Dieta abre em produção (sem plano ainda)")
            c.pg.locator("[data-btn-primeiro-plano]").first.click()
            c.esperar(lambda: c.tem('[data-modal-plano="novo"]'), 15)
            c.pg.locator("[data-campo-titulo-plano]").fill("Plano Teste W17")
            c.pg.locator("[data-campo-kcal-alvo]").fill("2000")
            c.pg.locator("[data-btn-salvar-plano]").click()
            ok = c.esperar(lambda: c.pg.locator("[data-editor-dieta] [data-refeicao]").count() == 6, 40)
            p.check(ok, "P4 'Nova prescrição alimentar' cria o plano com as 6 refeições padrão")
            c.ir(f"/painel/alunos/{rota}/editar")
            c.esperar(lambda: c.tem("[data-editores-enviar]") and c.tem("[data-editor-dieta] [data-refeicao]"), 60)
            zap = c.pg.locator("a[data-editores-whatsapp]")
            href = zap.first.get_attribute("href") if zap.count() else ""
            txt = urllib.parse.parse_qs(urllib.parse.urlparse(href or "").query).get("text", [""])[0]
            p.check((href or "").startswith(f"https://wa.me/55{TELEFONE}?text=") and txt.endswith("https://physiqcalc.com.br/dieta"),
                    f"P5 'Enviar pelo WhatsApp' em produção: atalho wa.me com a mensagem pronta e o link de produção ({txt})")
            c.pg.locator("[data-editores-enviar]").click()
            t = toast(c, "Salvo e enviado")
            p.check("com o aviso no sino e por e-mail (caixa de teste)" in t, f"P6 'Salvar e enviar' em produção → sino + e-mail (caixa de teste) ({t})")
            av = q(f"select titulo, email_em from public.avisos where destino_user_id = '{B.uid(ALUNO)}' and tipo = 'plano_atualizado'")
            p.check(len(av) == 1 and av[0]["email_em"], f"P6 no banco: 1 aviso com o e-mail marcado ({av})")
            c.pg.mouse.move(5, 5)
            c.print("salvar_enviar")
            c.esperar(lambda: c.pg.locator("[data-sonner-toast]").count() == 0, 12)  # nunca remover o nó do React à mão
            c.pg.locator("[data-editores-enviar]").click()
            t = toast(c, "já tinha o aviso")
            p.check("e o e-mail (menos de 10 minutos)" in t, f"P7 2º clique não repete o sino nem o e-mail ({t})")
            p.check(q(f"select count(*)::int n from public.mensagens_whatsapp where paciente_id = '{pid}'")[0]["n"] == 0, "P7 nenhuma mensagem na fila do WhatsApp")
        finally:
            c.fim()
        a = caso(nav, "aluno_sino", ALUNO, "/", desktop=False)
        try:
            if a.esperar(lambda: a.tem("[data-sino]"), 60):
                a.pg.locator("[data-sino]").first.click()
            p.check(a.esperar(lambda: "Sua dieta foi atualizada" in a.texto(), 30), "P8 o aluno vê 'Sua dieta foi atualizada' no sino do app")
            a.print("app_sino_envio")
        finally:
            a.fim()
        nav.close()

    if manter:
        print("(--manter: as contas descartáveis ficam; rode --so-limpar depois)")
        return
    limpar()
    time.sleep(3)
    sobras = q(f"""select (select count(*) from public.planos_alimentares where paciente_id = '{pid}')
                        + (select count(*) from public.avisos a join auth.users u on u.id = a.destino_user_id where u.email like 'w17.prod.%')
                        + (select count(*) from public.pacientes where id = '{pid}') as n""")[0]["n"]
    p.check(sobras == 0, f"P9 nenhuma linha das descartáveis sobrou ({sobras})")
    depois = contagens()
    B.json_arquivo(PASTA / "contagens-depois.json", depois)
    dif = {k: (antes[k], depois.get(k)) for k in antes if antes[k] != depois.get(k)}
    p.check(not dif, f"P9 contagens iguais antes e depois {dif}")


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
