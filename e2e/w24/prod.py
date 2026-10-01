#!/usr/bin/env python3
"""Physiq W24 — PRODUÇÃO (https://physiqcalc.com.br, schema public): a prova do Painel › Dietas e do /d/ público.

Com 2 contas DESCARTÁVEIS (w24.prod.*.teste.claude@physiqnutri.app): uma nutricionista (conta nova em teste, dono + nutri) e um
aluno convidado por ela só com Nutrição (o convite vai para a caixa de teste do Resend; sem telefone = nenhum WhatsApp; sem aparelho =
nenhum push). O aluno manda a foto pelo /d/ (sem login, celular) → a foto aparece no Diário da nutri (o pronto-quando) → ela reage →
1 aviso no sino do aluno → o app do aluno mostra a reação. A nutri cadastra o alimento pelo rótulo na porção (H1: 127 kcal em 26 g →
488,46/100 g; o Editar mostra 127; salvar sem mexer não muda) e uma receita (PDF com a marca PHYSIQ). Negativos: diário desligado,
/p/ antigo → /d/, código inexistente. No fim tudo é apagado nos 2 bancos e as contagens antes/depois provam que só as linhas delas
mudaram. Nenhum dado de cliente é tocado (os do bertoldo.code são contados antes/depois); nenhuma mensagem real.
Uso: python3 e2e/w24/prod.py [--manter] [--so-limpar]
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
NUTRI, ALUNO = "w24-prod-nutri", "w24-prod-aluno"
B.EMAIL.update({NUTRI: "w24.prod.nutri.teste.claude@physiqnutri.app", ALUNO: "w24.prod.aluno.teste.claude@physiqnutri.app"})
B.NOMES.update({NUTRI: "Nutri Prova W24", ALUNO: "Aluno Prova W24"})
for _k in (NUTRI, ALUNO):
    B.CONTAS[_k] = (B.EMAIL[_k], B.B5.senha_de(_k))
NOME_CONTA = "Conta Teste W24 (prova)"
LEITE = "Leite em pó W24 prova"
RECEITA = "Receita W24 prova"
PASTA = Path.home() / "backups" / "physiq" / "2026-10-01-w24" / "prod-prova"
BERTOLDO = "bertoldo.code@gmail.com"
TAB_P = ["pacientes", "contas", "conta_membros", "convites", "cadastros_pendentes", "profiles", "alimentos", "medidas_caseiras", "receitas",
         "ingredientes_receita", "grupos_receita", "diario_alimentar"]
TAB_T = ["physiq_profiles", "physiq_identidades", "physiq_professores", "physiq_espelho_membros"]
DOWNLOADS = B.SCRATCH / "downloads"


def q(sql: str) -> list:
    return B.sql_principal(sql)


def contagens() -> dict:
    r = {f"principal.{t}": q(f"select count(*) as n from public.{t}")[0]["n"] for t in TAB_P}
    r.update({f"treino.{t}": B.sql_treino(f"select count(*) as n from public.{t}")[0]["n"] for t in TAB_T})
    r["principal.auth.users"] = q("select count(*) as n from auth.users")[0]["n"]
    r["treino.auth.users"] = B.sql_treino("select count(*) as n from auth.users")[0]["n"]
    r["storage.diario"] = q("select count(*) as n from storage.objects where bucket_id = 'diario'")[0]["n"]
    b = q(f"select id::text from auth.users where lower(email) = '{BERTOLDO}'")[0]["id"]
    r["bertoldo.diario"] = q(f"select count(*) as n from public.diario_alimentar where nutricionista_id = '{b}'")[0]["n"]
    r["bertoldo.alimentos"] = q(f"select count(*) as n from public.alimentos where nutricionista_id = '{b}'")[0]["n"]
    r["bertoldo.receitas"] = q(f"select count(*) as n from public.receitas where nutricionista_id = '{b}'")[0]["n"]
    r["bertoldo.leite_kcal"] = q("select coalesce(max(energia_kcal), 0)::float as n from public.alimentos where id::text like 'afbd224a%'")[0]["n"]
    return r


def ids() -> dict:
    u = {k: B.uid(k) for k in (NUTRI, ALUNO)}
    t = {}
    for k, v in u.items():
        if v:
            r = B.sql_treino(f"select treino_user_id::text as t from public.physiq_identidades where principal_user_id = '{v}'")
            t[k] = r[0]["t"] if r else None
    return {"principal": u, "treino": t}


def limpar() -> None:
    """Apaga TUDO das 2 contas descartáveis nos 2 bancos (só elas — o e-mail w24.prod.* é conferido)."""
    info = ids()
    for k in (NUTRI, ALUNO):
        e = B.EMAIL[k]
        assert e.startswith("w24.prod.") and e.endswith(".teste.claude@physiqnutri.app"), e
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
        if pacs:
            ps = ",".join(f"'{x}'" for x in pacs)
            fotos = [r["path"] for r in q(f"select path from public.diario_alimentar where paciente_id in ({ps})")]
            if fotos:
                B.apagar_fotos(fotos)
            q(f"delete from public.diario_alimentar where paciente_id in ({ps})")
            q(f"delete from public.mensagens_whatsapp where paciente_id in ({ps})")
        for t in ("pacientes", "convites", "cadastros_pendentes", "conta_eventos", "conta_membros"):
            q(f"delete from public.{t} where conta_id in ({cs})")
        q(f"delete from public.contas where id in ({cs})")
    if up:
        lu = ",".join(f"'{x}'" for x in up)
        # fotos órfãs na pasta da nutri descartável (envio que não terminou)
        orfas = [r["name"] for r in q(f"select name from storage.objects where bucket_id = 'diario' and (storage.foldername(name))[1] in ({lu})")]
        if orfas:
            B.apagar_fotos(orfas)
        q(f"delete from public.receitas where nutricionista_id in ({lu})")
        q(f"delete from public.grupos_receita where nutricionista_id in ({lu})")
        q(f"delete from public.alimentos where fonte = 'proprio' and nutricionista_id in ({lu})")
        q(f"delete from public.pacientes where user_id in ({lu})")
        q(f"delete from public.avisos where destino_user_id in ({lu})")
        q(f"delete from public.espelho_pendencias where payload ->> 'principal_user_id' in ({','.join(repr(x) for x in up)})".replace('"', "'"))
        B.sql_treino(f"delete from public.edge_rate_limits where user_id in ({lu})")
    spt = B.service(B.TREINO_REF)
    for t in ut:
        for tab in ("tb_semana_treinos", "tb_semana_dia_config", "tb_series_padrao_usuario", "tb_grupos_treino_perfis", "edge_rate_limits"):
            B.sql_treino(f"delete from public.{tab} where user_id = '{t}'")
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


def caso(nav, nome: str, conta: str | None, rota: str, desktop: bool = True):
    c = B.B5.Caso(nav, BASE, "prod", nome, desktop=desktop)
    if conta:
        c.entrar(conta, rota, zerar=False)
        c.fechar_avisos()
    else:
        c.ir(rota)
    return c


def leite_db(nutri: str) -> dict | None:
    r = q(f"""select id::text, porcao_g::float p, energia_kcal::float kcal, proteina_g::float prot, carboidrato_g::float carb, lipidio_g::float lip,
                     sodio_mg::float sodio, nutrientes from public.alimentos where nutricionista_id = '{nutri}' and nome = $n${LEITE}$n$ and deleted_at is null limit 1""")
    return r[0] if r else None


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
    mat = q(f"""select id::text, nutricionista_id::text, treino_user_id::text, telefone, link_codigo from public.pacientes
                 where conta_id = '{c_id}' and user_id = '{B.uid(ALUNO)}' and deleted_at is null""")
    p.check(st == 200 and mat and mat[0]["nutricionista_id"] == B.uid(NUTRI) and not mat[0]["telefone"], f"P3 aluno entrou → matrícula com a nutri (sem telefone) → {st}")
    pid, codigo = mat[0]["id"], mat[0]["link_codigo"]
    rota = mat[0]["treino_user_id"] or pid
    nutri = B.uid(NUTRI)

    st, r = B.rpc_anon("diario_link", {"p_codigo": codigo})
    p.check(st == 200 and isinstance(r, dict) and r.get("situacao") == "ok" and r.get("paciente_id") == pid, f"P4 diario_link em produção: ok ({r.get('situacao') if isinstance(r, dict) else r})")
    st, r = B.rpc_anon("diario_link", {"p_codigo": "naoexiste99"})
    p.check(r == {"situacao": "invalido"}, "P4 diario_link: código inexistente → 'invalido'")

    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox"])
        # o aluno manda a foto pelo /d/ (sem login, celular)
        a = caso(nav, "publico", None, f"/d/{codigo}", desktop=False)
        foto = None
        try:
            ok = a.esperar(lambda: a.tem('[data-pagina-diario-publico][data-estado-diario="ok"]') and a.tem("[data-form-diario]"), 60)
            p.check(ok, "P5 o /d/ do Physiq abre em produção, sem login")
            a.pg.locator('[data-refeicao="almoco"]').click()
            a.pg.set_input_files("[data-campo-foto]", str(B.FOTOS / "almoco.jpg"))
            a.pg.locator("[data-campo-comentario]").fill("Almoço da prova W24")
            a.pg.locator("[data-btn-enviar]").click()
            ok = a.esperar(lambda: a.tem("[data-envio-ok]"), 60)
            rr = q(f"select id::text from public.diario_alimentar where paciente_id = '{pid}' and comentario = 'Almoço da prova W24' and deleted_at is null")
            foto = rr[0]["id"] if rr else None
            p.check(ok and bool(foto), "P5 'Foto enviada' e a linha gravada (bucket + diario_enviar)")
            a.print("app_publico_diario")
            a.ir(f"/p/{codigo}")
            p.check(a.esperar(lambda: a.caminho().startswith(f"/d/{codigo}") and a.tem("[data-form-diario]"), 30), "P6 o /p/ antigo abre o /d/ do Physiq")
            a.ir("/d/naoexiste99")
            p.check(a.esperar(lambda: a.tem("[data-diario-nao-encontrado]"), 40), "P6 código inexistente: 'Link não encontrado'")
        finally:
            a.fim()
        # a foto no Diário da nutri; ela reage; 1 aviso no sino do aluno
        c = caso(nav, "nutri_diario", NUTRI, "/painel/dietas?aba=diario")
        try:
            ok = c.esperar(lambda: c.pg.locator(f'[data-registro="{foto}"] [data-foto]').count() == 1, 90)
            p.check(ok, "P7 a foto enviada pelo /d/ aparece no Diário da nutri (com a miniatura)")
            card = c.pg.locator(f'[data-registro="{foto}"]')
            card.locator('[data-btn-reacao="otimo"]').click()
            card.locator("[data-campo-comentario-nutri]").fill("Ótima escolha (prova W24)")
            card.locator("[data-btn-reagir]").click()
            ok = c.esperar(lambda: c.pg.locator(f'[data-registro="{foto}"][data-reagido="1"]').count() == 1, 30)
            av = q(f"select titulo, link from public.avisos where destino_user_id = '{B.uid(ALUNO)}' and tipo = 'reacao_diario'")
            p.check(ok and len(av) == 1 and av[0]["link"] == f"/dieta?ver=diario&registro={foto}", f"P7 reagiu (Ótimo) → 1 aviso no sino do aluno ({av[0]['titulo'] if av else None})")
            c.pg.evaluate("window.scrollTo(0, 0)")
            c.pg.wait_for_timeout(1500)
            c.print("tela6_dietas_diario")
        finally:
            c.fim()
        # o app do aluno mostra a reação
        al = caso(nav, "aluno_app", ALUNO, "/dieta?ver=diario", desktop=False)
        try:
            ok = al.esperar(lambda: al.pg.locator(f'[data-diario-registro="{foto}"] [data-diario-reacao-texto]').count() == 1, 90)
            txt = al.pg.locator(f'[data-diario-registro="{foto}"] [data-diario-reacao-texto]').first.inner_text() if ok else ""
            p.check(ok and "Ótima escolha (prova W24)" in txt, f"P8 o app do aluno mostra a reação da nutri ({txt.strip()[:50]})")
            if ok:
                al.pg.locator(f'[data-diario-registro="{foto}"]').scroll_into_view_if_needed()
            al.print("app_dieta_reacao")
        finally:
            al.fim()
        # alimento pelo rótulo na porção (H1) e receita com PDF
        c = caso(nav, "nutri_alimentos", NUTRI, "/painel/dietas")
        try:
            ok = c.esperar(lambda: c.pg.locator("[data-lista-alimentos] [data-alimento]").count() >= 20, 60)
            total = c.pg.locator("[data-pagina-alimentos]").get_attribute("data-total-alimentos")
            p.check(ok and total == "597", f"P9 Alimentos em produção: a TACO (597) para a nutri nova ({total})")
            c.pg.locator("[data-btn-novo-alimento]").click()
            c.esperar(lambda: c.tem('[data-modal-alimento="novo"]'), 15)
            c.pg.locator("[data-campo-nome-alimento]").fill(LEITE)
            c.pg.locator("[data-campo-porcao]").fill("26")
            for sel, v in (("kcal", "127"), ("proteina", "7"), ("carboidrato", "10"), ("lipidio", "7"), ("sodio", "77")):
                c.pg.locator(f"[data-campo-{sel}]").fill(v)
            c.pg.locator("[data-btn-salvar-alimento]").click()
            ok = c.esperar(lambda: leite_db(nutri) is not None, 20)
            d = leite_db(nutri) or {}
            p.check(ok and d.get("kcal") == 488.46 and d.get("prot") == 26.92 and d.get("carb") == 38.46 and d.get("lip") == 26.92 and d.get("sodio") == 296.15,
                    f"P9 H1 em produção: rótulo 127 kcal em 26 g → 488,46 kcal/100 g gravados ({d.get('kcal')})")
            c.pg.locator("[data-filtro-fonte]").select_option("proprio")
            c.esperar(lambda: c.pg.locator(f'[data-alimento="{d.get("id")}"]').count() == 1, 30)
            c.pg.locator(f'[data-alimento="{d.get("id")}"] [data-btn-editar-alimento]').click()
            c.esperar(lambda: c.tem('[data-modal-alimento="editar"]'), 15)
            kcal = c.pg.locator("[data-campo-kcal]").input_value()
            p.check(kcal == "127", f"P9 H1: o Editar mostra o rótulo de volta na porção (127 em 26 g) — {kcal}")
            c.print("tela8_alimento_editar_porcao")
            c.pg.locator("[data-btn-salvar-alimento]").click()
            c.esperar(lambda: not c.tem('[data-modal-alimento="editar"]'), 15)
            c.pg.wait_for_timeout(1500)
            d2 = leite_db(nutri) or {}
            p.check(all(d.get(k) == d2.get(k) for k in ("kcal", "prot", "carb", "lip", "sodio", "p")), "P9 H1: salvar sem mexer não muda o gravado")
            # receita
            c.pg.locator('[data-aba-dietas-botao="receitas"]').click()
            c.esperar(lambda: c.tem('[data-pagina-dietas][data-aba-dietas="receitas"]'), 20)
            c.pg.locator("[data-btn-nova-receita]").click()
            c.esperar(lambda: c.tem('[data-modal-receita="nova"]'), 15)
            c.pg.locator("[data-campo-nome-receita]").fill(RECEITA)
            li = c.pg.locator('[data-ingrediente="0"]')
            caixa = li.locator("[data-busca-alimento]").first
            caixa.click()
            caixa.fill("arroz, integral")
            alvo = li.locator('[data-resultado-alimento]:has([data-resultado-nome]:text-is("Arroz, integral, cozido"))').first
            c.esperar(lambda: alvo.count() > 0 and alvo.is_visible(), 30)
            alvo.click()
            c.esperar(lambda: li.locator("[data-campo-gramas-ingrediente]").count() > 0, 10)
            li.locator("[data-campo-gramas-ingrediente]").fill("150")
            c.pg.locator("[data-btn-salvar-receita]").click()
            linha = c.pg.locator(f'[data-receita]:has([data-receita-nome]:text-is("{RECEITA}"))').first
            ok = c.esperar(lambda: linha.count() == 1, 30)
            p.check(ok, "P10 receita criada em produção (calculada pelo ingrediente)")
            DOWNLOADS.mkdir(parents=True, exist_ok=True)
            arq = None
            try:
                with c.pg.expect_download(timeout=60000) as dl:
                    linha.locator("[data-btn-pdf-receita]").click()
                arq = DOWNLOADS / f"prod_{dl.value.suggested_filename}"
                dl.value.save_as(str(arq))
            except Exception as e:  # noqa: BLE001
                print("   download falhou:", e)
            bruto = arq.read_bytes() if arq else b""
            p.check(bool(arq) and b"PHYSIQ" in bruto and b"PHYSIQNUTRI" not in bruto, "P10 PDF da receita com a marca PHYSIQ")
            c.pg.wait_for_timeout(800)
            c.print("tela6_dietas_receitas")
        finally:
            c.fim()
        # o card "Link do diário" do Resumo e o diário desligado
        c = caso(nav, "nutri_resumo", NUTRI, f"/painel/alunos/{rota}")
        try:
            ok = c.esperar(lambda: c.tem(f'[data-card-link-diario="{codigo}"]'), 60)
            link = c.pg.locator("[data-link-diario]").first.get_attribute("data-link-diario") if ok else ""
            p.check(ok and link == f"{BASE}/d/{codigo}" and not c.tem("[data-link-site-antigo]"), f"P11 o card 'Link do diário' em produção já é o /d/ do Physiq ({link})")
        finally:
            c.fim()
        q(f"update public.pacientes set config = config || '{{\"diario_alimentar\": false}}'::jsonb where id = '{pid}'")
        a = caso(nav, "publico_desligado", None, f"/d/{codigo}", desktop=False)
        try:
            ok = a.esperar(lambda: a.tem('[data-diario-recusado="diario_desligado"]'), 60)
            p.check(ok and "O envio de fotos está desligado pelo seu profissional." in a.texto(), "P12 diário desligado: a mensagem da spec §9 e nada de formulário")
            a.print("app_publico_desligado")
        finally:
            a.fim()
        nav.close()

    if manter:
        print("(--manter: as contas descartáveis ficam; rode --so-limpar depois)")
        return
    limpar()
    time.sleep(3)
    sobras = q(f"""select (select count(*) from public.diario_alimentar where paciente_id = '{pid}')
                        + (select count(*) from public.avisos a join auth.users u on u.id = a.destino_user_id where u.email like 'w24.prod.%')
                        + (select count(*) from public.alimentos where nome = $n${LEITE}$n$)
                        + (select count(*) from public.receitas where nome = $n${RECEITA}$n$)
                        + (select count(*) from public.pacientes where id = '{pid}') as n""")[0]["n"]
    p.check(sobras == 0, f"P13 nenhuma linha das descartáveis sobrou (diário, avisos, alimento, receita, matrícula: {sobras})")
    depois = contagens()
    B.json_arquivo(PASTA / "contagens-depois.json", depois)
    dif = {k: (antes[k], depois.get(k)) for k in antes if antes[k] != depois.get(k)}
    p.check(not dif, f"P13 contagens iguais antes e depois (inclusive os dados do bertoldo.code e o leite em pó dele) {dif}")


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
