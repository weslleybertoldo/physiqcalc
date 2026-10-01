#!/usr/bin/env python3
"""Physiq W18 — PRODUÇÃO (https://physiqcalc.com.br, schema public): a prova "o personal lê e escreve as anotações Equipe e NÃO lê o
que é clínico; a nutri vê tudo" — no banco (PostgREST, função, Storage) e na tela.

Com 2 contas DESCARTÁVEIS (w18.prod.*.teste.claude@physiqnutri.app): o dono + personal (conta nova em teste, criada pelo
"Sou profissional") e uma nutricionista da mesma conta; 1 aluno descartável sem login, do personal e da nutri. A nutri grava uma
anotação "Só nutricionistas", uma consulta e um anexo (PDF no Storage privado); o personal grava uma "Equipe". Prints prod_* só
dessas contas. No fim tudo é apagado nos 2 bancos (e o arquivo no Storage) e as contagens antes/depois provam que só as linhas delas
mudaram. Nenhum dado de cliente é tocado; nenhuma mensagem.
Uso: python3 e2e/w18/prod.py [--manter] [--so-limpar]
"""
from __future__ import annotations

import argparse
import sys
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

S = "public"
B.ESTADO["schema"] = S
p = B.p
BASE = "https://physiqcalc.com.br"
DONO, NUTRI = "w18-prod-dono", "w18-prod-nutri"
B.EMAIL.update({DONO: "w18.prod.dono.teste.claude@physiqnutri.app", NUTRI: "w18.prod.nutri.teste.claude@physiqnutri.app"})
B.NOMES.update({DONO: "Personal Teste W18", NUTRI: "Nutri Teste W18"})
for _k in (DONO, NUTRI):
    B.CONTAS[_k] = (B.EMAIL[_k], B.B5.senha_de(_k))
NOME_CONTA = "Conta Teste W18 (prova)"
NOME_ALUNO = "Aluno Prova W18"
PASTA = Path.home() / "backups" / "physiq" / "2026-10-01-w18" / "prod-prova"
TAB_P = ["pacientes", "contas", "conta_membros", "convites", "profiles", "registros_prontuario", "consultas", "anexos"]
TAB_T = ["physiq_profiles", "physiq_identidades", "physiq_professores", "physiq_espelho_membros"]


def q(sql: str) -> list:
    return B.sql_principal(sql)


def contagens() -> dict:
    r = {f"principal.{t}": q(f"select count(*) as n from public.{t}")[0]["n"] for t in TAB_P}
    r.update({f"treino.{t}": B.sql_treino(f"select count(*) as n from public.{t}")[0]["n"] for t in TAB_T})
    r["principal.auth.users"] = q("select count(*) as n from auth.users")[0]["n"]
    r["treino.auth.users"] = B.sql_treino("select count(*) as n from auth.users")[0]["n"]
    r["principal.storage.anexos"] = q("select count(*) as n from storage.objects where bucket_id = 'anexos'")[0]["n"]
    return r


def ids() -> dict:
    u = {k: B.uid(k) for k in (DONO, NUTRI)}
    t = {}
    for k, v in u.items():
        if v:
            r = B.sql_treino(f"select treino_user_id::text as t from public.physiq_identidades where principal_user_id = '{v}'")
            t[k] = r[0]["t"] if r else None
    return {"principal": u, "treino": t}


def limpar() -> None:
    """Apaga TUDO das 2 contas descartáveis nos 2 bancos (só elas — o e-mail w18.prod.* é conferido)."""
    info = ids()
    for k in (DONO, NUTRI):
        e = B.EMAIL[k]
        assert e.startswith("w18.prod.") and e.endswith(".teste.claude@physiqnutri.app"), e
    up = [v for v in info["principal"].values() if v]
    ut = [v for v in info["treino"].values() if v]
    contas = [r["id"] for r in q(f"select id::text from public.contas where nome = $n${NOME_CONTA}$n$")]
    if up:
        lu = ",".join(f"'{x}'" for x in up)
        contas += [r["id"] for r in q(f"select id::text from public.contas where dono_id in ({lu})")]
    contas = sorted(set(contas))
    if contas:
        cs = ",".join(f"'{c}'" for c in contas)
        pacs = [r["id"] for r in q(f"select id::text from public.pacientes where conta_id in ({cs})")]
        for pid in pacs:
            B.apagar_arquivos([o["name"] for o in q(f"select name from storage.objects where bucket_id = 'anexos' and name like '%/{pid}/%'")])
            for t in B.TABELAS:
                q(f"delete from public.{t} where paciente_id = '{pid}'")
        for t in ("pacientes", "convites", "cadastros_pendentes", "conta_eventos", "conta_membros"):
            q(f"delete from public.{t} where conta_id in ({cs})")
        q(f"delete from public.contas where id in ({cs})")
    if up:
        lu = ",".join(f"'{x}'" for x in up)
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
        q(f"delete from staging.profiles where id = '{u}'")
        print("principal: usuário descartável apagado", u, st)


def caso(nav, nome: str, conta: str, rota: str):
    c = B.B5.Caso(nav, BASE, "prod", nome, desktop=True)
    c.entrar(conta, rota, zerar=False)
    c.fechar_avisos()
    return c


def prova(manter: bool) -> None:
    PASTA.mkdir(parents=True, exist_ok=True)
    B.saude_ok("prod — contagens")
    antes = contagens()
    B.json_arquivo(PASTA / "contagens-antes.json", antes)
    for k in (DONO, NUTRI):
        B.B5.garantir_usuario(B.EMAIL[k], B.CONTAS[k][1], B.NOMES[k])
        q(f"update public.profiles set nome = $n${B.NOMES[k]}$n$ where id = '{B.uid(k)}'")
    st, r = B.rpc(DONO, "criar_minha_conta", {"p_nome": NOME_CONTA, "p_tipo": "personal", "p_registro": "CREF 000000-G/SP"})
    p.check(st == 200 and isinstance(r, dict) and r.get("ok"), f"P1 conta descartável (dono + personal, Treino + Nutrição em teste) → {st} {r}")
    conta = q(f"select id::text from public.contas where dono_id = '{B.uid(DONO)}' and nome = $n${NOME_CONTA}$n$")[0]["id"]
    dono, nutri = B.uid(DONO), B.uid(NUTRI)
    q(f"""insert into public.conta_membros (conta_id, user_id, papeis, status, codigo_convite)
          values ('{conta}', '{nutri}', array['nutricionista']::text[], 'ativo', public.gerar_codigo_membro($n${B.NOMES[NUTRI]}$n$))""")
    pid = q(f"""insert into public.pacientes (conta_id, personal_id, nutricionista_id, nome, origem, ativo)
                values ('{conta}', '{dono}', '{nutri}', $n${NOME_ALUNO}$n$, 'novo', true) returning id::text""")[0]["id"]
    filtro = f"paciente_id=eq.{pid}"
    tp, tn = B.token(DONO), B.token(NUTRI)
    # gravação como cada um (a RLS de produção confere)
    st, r = B.rest(tp, "POST", "registros_prontuario", corpo={"nutricionista_id": dono, "paciente_id": pid, "visibilidade": "equipe", "autor_papel": "personal",
                                                            "data": "2026-09-30T18:10:00-03:00", "texto": "Treino de costas concluído; aumentar a carga da remada."})
    p.check(st == 201, f"P2 o personal grava uma anotação \"Equipe\" ({st})")
    st, r = B.rest(tp, "POST", "registros_prontuario", corpo={"nutricionista_id": dono, "paciente_id": pid, "texto": "não pode",
                                                            "visibilidade": "nutricionistas", "autor_papel": "nutricionista"})
    p.check(st in (401, 403), f"P2 o personal NÃO grava \"Só nutricionistas\" ({st})")
    st, r = B.rest(tn, "POST", "registros_prontuario", corpo={"nutricionista_id": nutri, "paciente_id": pid, "data": "2026-09-30T19:00:00-03:00",
                                                            "texto": "Relata compulsão à noite; investigar na próxima consulta."})
    p.check(st == 201 and r[0]["visibilidade"] == "nutricionistas", f"P3 a nutri grava uma \"Só nutricionistas\" (o padrão) ({st})")
    st, r = B.rest(tn, "POST", "consultas", corpo={"nutricionista_id": nutri, "paciente_id": pid, "data": "2026-09-30T19:10:00-03:00", "origem": "manual",
                                                    "observacao": "Primeira consulta: objetivo definição."})
    p.check(st == 201, f"P3 a nutri registra uma consulta ({st})")
    caminho = f"{nutri}/{pid}/{uuid.uuid4()}-exames.pdf"
    st, r = B.storage(tn, "POST", f"object/anexos/{caminho}", B.pdf_minimo("Exames - Aluno Prova W18"))
    st2, r2 = B.rest(tn, "POST", "anexos", corpo={"nutricionista_id": nutri, "paciente_id": pid, "nome": "exames.pdf", "path": caminho, "tamanho": 600,
                                                   "mime": "application/pdf", "descricao": "Exames (prova W18)"})
    p.check(st == 200 and st2 == 201, f"P3 a nutri sobe um anexo (Storage {st} · tabela {st2})")
    # leitura: o banco filtra
    p.check(B.n_linhas(tp, "registros_prontuario", filtro) == 1, "P4 PostgREST: o personal lê 1 anotação (a \"Equipe\")")
    for t in ("consultas", "anamneses", "pedidos_exame", "resultados_exame", "documentos", "anexos"):
        p.check(B.n_linhas(tp, t, filtro) == 0, f"P4 PostgREST: o personal lê 0 em {t}")
    st, r = B.storage(tp, "POST", f"object/sign/anexos/{caminho}", {"expiresIn": 60})
    p.check(st in (400, 403, 404), f"P4 Storage: o personal não assina a URL do anexo ({st})")
    st, r = B.rpc(tp, "aluno_anotacoes", {"p_aluno": pid, "p_limite": 3})
    p.check(st == 200 and r.get("total") == 1 and r.get("clinico") is False, f"P4 aluno_anotacoes do personal: 1, sem clínico ({st} {r.get('total') if isinstance(r, dict) else r})")
    p.check(B.n_linhas(tn, "registros_prontuario", filtro) == 2 and B.n_linhas(tn, "consultas", filtro) == 1 and B.n_linhas(tn, "anexos", filtro) == 1,
            "P5 PostgREST: a nutri lê as 2 anotações, a consulta e o anexo")
    st, r = B.storage(tn, "POST", f"object/sign/anexos/{caminho}", {"expiresIn": 60})
    p.check(st == 200, f"P5 Storage: a nutri assina a URL do anexo ({st})")

    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox"])
        B.saude_ok("prod — telas")
        c = caso(nav, "personal_resumo", DONO, f"/painel/alunos/{pid}")
        try:
            ok = c.esperar(lambda: c.pg.locator("[data-card-prontuario-notas] [data-nota]").count() == 1, 90)
            p.check(ok and "investigar" not in c.texto(), "P6 o card Prontuário do personal: só a \"Equipe\"")
            c.esperar(lambda: c.pg.locator("[data-card-treino-semana], [data-card-treino-treinos], [data-card-treino-vazio], [data-card-treino-sem-volume]").count() > 0, 45)
            c.pg.mouse.move(5, 5)
            c.print("tela7_resumo_personal")
            box = c.pg.locator("[data-card-prontuario]").first.bounding_box()
            if box:
                c.pg.screenshot(path=str(B.PRINTS / "prod_card_prontuario_personal.png"),
                                clip={"x": box["x"] - 8, "y": box["y"] - 8, "width": box["width"] + 16, "height": box["height"] + 16})
            c.ir(f"/painel/alunos/{pid}/prontuario")
            ok = c.esperar(lambda: c.pg.locator("[data-secao-anotacoes] [data-anotacao]").count() == 1, 60)
            p.check(ok and not c.tem("[data-secoes-prontuario]"), "P6 a aba do personal: 1 anotação e nenhuma seção clínica")
            c.print("aba_anotacoes_personal")
        finally:
            c.fim()
        time.sleep(3)
        c = caso(nav, "nutri_aba", NUTRI, f"/painel/alunos/{pid}/prontuario")
        try:
            ok = c.esperar(lambda: c.pg.locator("[data-secao-anotacoes] [data-anotacao]").count() == 2, 90)
            p.check(ok and c.pg.locator("[data-secao-prontuario-botao]").count() == 10, "P7 a aba da nutri: as 2 anotações e as 10 seções")
            c.pg.mouse.move(5, 5)
            c.print("aba_anotacoes_nutri")
            c.pg.locator('[data-secao-prontuario-botao="anexos"]').click()
            ok = c.esperar(lambda: c.pg.locator("[data-secao-anexos] [data-anexo]").count() == 1, 45)
            p.check(ok, "P7 Anexos: o PDF da nutri")
            c.pg.locator("[data-anexo] [data-btn-ver-anexo]").first.click()
            ok = c.esperar(lambda: c.pg.locator("[data-iframe-anexo][src*='/object/sign/anexos/']").count() > 0, 30)
            p.check(ok, "P7 o anexo abre pela URL assinada")
            c.pg.keyboard.press("Escape")
            c.pg.locator('[data-secao-prontuario-botao="consultas"]').click()
            ok = c.esperar(lambda: c.pg.locator("[data-secao-consultas] [data-consulta]").count() == 1, 45)
            p.check(ok, "P7 Consultas: a consulta da nutri")
            c.pg.mouse.move(5, 5)
            c.print("secao_consultas")
        finally:
            c.fim()
        nav.close()

    if manter:
        print("(--manter: as contas descartáveis ficam; rode --so-limpar depois)")
        return
    limpar()
    time.sleep(3)
    sobras = q(f"""select (select count(*) from public.registros_prontuario where paciente_id = '{pid}')
                        + (select count(*) from public.consultas where paciente_id = '{pid}')
                        + (select count(*) from public.anexos where paciente_id = '{pid}')
                        + (select count(*) from storage.objects where bucket_id = 'anexos' and name like '%/{pid}/%')
                        + (select count(*) from public.pacientes where id = '{pid}') as n""")[0]["n"]
    p.check(sobras == 0, f"P8 nenhuma linha (nem arquivo) das descartáveis sobrou ({sobras})")
    depois = contagens()
    B.json_arquivo(PASTA / "contagens-depois.json", depois)
    dif = {k: (antes[k], depois.get(k)) for k in antes if antes[k] != depois.get(k)}
    p.check(not dif, f"P8 contagens iguais antes e depois (só as linhas das descartáveis mudaram e foram apagadas) {dif}")


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
