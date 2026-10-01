#!/usr/bin/env python3
"""Physiq W16 — PRODUÇÃO (https://physiqcalc.com.br, schema public): a prova "a nutri monta o plano e o aluno vê; a nutri vê os ✓".

Com 2 contas DESCARTÁVEIS (w16.prod.*.teste.claude@physiqnutri.app): uma nutricionista (conta nova em teste, dono + nutri) e um
aluno convidado por ela só com Nutrição (o convite vai para a caixa de teste do Resend). A nutri cria a prescrição no painel (6
refeições padrão), põe alimentos da TACO pela busca e usa "Salvar e enviar ao aluno"; o aluno vê o plano no app e o aviso no sino
e marca o café; a nutri vê o ✓ de hoje no acompanhamento e no card Dieta do Resumo (a adesão). A função treino-leitura responde em
produção (sem token 401, o próprio aluno 403, a nutri 404 "sem treino" — o aluno não tem treino). No fim tudo é apagado nos 2
bancos e as contagens antes/depois provam que só as linhas delas mudaram. Nenhum dado de cliente é tocado; nenhuma mensagem real.
Uso: python3 e2e/w16/prod.py [--manter] [--so-limpar]
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
NUTRI, ALUNO = "w16-prod-nutri", "w16-prod-aluno"
B.EMAIL.update({NUTRI: "w16.prod.nutri.teste.claude@physiqnutri.app", ALUNO: "w16.prod.aluno.teste.claude@physiqnutri.app"})
B.NOMES.update({NUTRI: "Nutri Teste W16", ALUNO: "Aluno Teste W16"})
for _k in (NUTRI, ALUNO):
    B.CONTAS[_k] = (B.EMAIL[_k], B.B5.senha_de(_k))
NOME_CONTA = "Conta Teste W16 (prova)"
PASTA = Path.home() / "backups" / "physiq" / "2026-09-30-w16" / "prod-prova"
# o que só muda por cadastro (planos, ✓, avisos e a fila do WhatsApp mudam com os clientes de verdade usando: ficam de fora da
# contagem total e entram na conferência "nenhuma linha das descartáveis sobrou")
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


def ids() -> dict:
    u = {k: B.uid(k) for k in (NUTRI, ALUNO)}
    t = {}
    for k, v in u.items():
        if v:
            r = B.sql_treino(f"select treino_user_id::text as t from public.physiq_identidades where principal_user_id = '{v}'")
            t[k] = r[0]["t"] if r else None
    return {"principal": u, "treino": t}


def limpar() -> None:
    """Apaga TUDO das 2 contas descartáveis nos 2 bancos (só elas — o e-mail w16.prod.* é conferido)."""
    info = ids()
    for k in (NUTRI, ALUNO):
        e = B.EMAIL[k]
        assert e.startswith("w16.prod.") and e.endswith(".teste.claude@physiqnutri.app"), e
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


def adicionar(c, refeicao: str, termo: str, alimento: str, gramas: str) -> bool:
    r = c.pg.locator(f'[data-editor-dieta] [data-refeicao-nome="{refeicao}"]').first
    if r.get_attribute("data-aberta") is None:
        r.locator("[data-refeicao-abrir]").click()
    c.esperar(lambda: r.locator("[data-refeicao-busca] [data-busca-alimento]").count() > 0, 15)
    caixa = r.locator("[data-busca-alimento]").first
    caixa.click()
    caixa.fill(termo)
    alvo = r.locator(f'[data-resultado-alimento]:has([data-resultado-nome]:text-is("{alimento}"))').first
    if not c.esperar(lambda: alvo.count() > 0 and alvo.is_visible(), 30):
        return False
    alvo.click()
    if not c.esperar(lambda: c.tem('[data-modal-item="novo"]'), 15):
        return False
    c.pg.locator("[data-campo-quantidade-g]").fill(gramas)
    c.pg.locator("[data-btn-salvar-item]").click()
    return c.esperar(lambda: not c.tem('[data-modal-item="novo"]') and r.locator(f'[data-item-nome="{alimento}"]').count() == 1, 25)


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
    mat = q(f"select id::text, nutricionista_id::text, treino_user_id::text, telefone from public.pacientes where conta_id = '{c_id}' and user_id = '{B.uid(ALUNO)}' and deleted_at is null")
    p.check(st == 200 and mat and mat[0]["nutricionista_id"] == B.uid(NUTRI) and not mat[0]["telefone"], f"P3 aluno entrou → matrícula com a nutri (sem telefone) → {st} {mat}")
    pid = mat[0]["id"]
    rota = mat[0]["treino_user_id"] or pid

    # a função treino-leitura em produção (o aluno não tem treino: a nutri recebe 404 "sem_treino")
    def leitura(token: str | None) -> tuple[int, str]:
        cab = {"x-schema": S, "Origin": BASE}
        if token:
            cab["Authorization"] = f"Bearer {token}"
        st2, r2, _ = B.http("POST", f"{B.API_T}/functions/v1/treino-leitura", {"action": "get", "aluno": pid}, cab, timeout=60)
        return st2, (r2 or {}).get("error", "") if isinstance(r2, dict) else ""
    p.check(leitura(None) == (401, "missing_auth"), "P4 treino-leitura em produção: sem token → 401")
    p.check(leitura(B.token(ALUNO))[0] == 403, "P4 treino-leitura: o próprio aluno → 403")
    p.check(leitura(B.token(NUTRI)) == (404, "sem_treino"), "P4 treino-leitura: a nutri vê o aluno, que não tem treino → 404 sem_treino")

    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox"])
        # a nutri cria a prescrição e põe os alimentos
        c = caso(nav, "nutri_plano", NUTRI, f"/painel/alunos/{rota}/dieta")
        try:
            ok = c.esperar(lambda: c.tem("[data-btn-primeiro-plano]") or c.tem("[data-editor-dieta]"), 90)
            p.check(ok, "P5 a aba Dieta abre em produção (sem plano ainda)")
            c.pg.locator("[data-btn-primeiro-plano]").first.click()
            c.esperar(lambda: c.tem('[data-modal-plano="novo"]'), 15)
            c.pg.locator("[data-campo-titulo-plano]").fill("Plano Teste W16")
            c.pg.locator("[data-campo-kcal-alvo]").fill("2000")
            c.pg.locator("[data-btn-salvar-plano]").click()
            ok = c.esperar(lambda: c.pg.locator("[data-editor-dieta] [data-refeicao]").count() == 6, 40)
            p.check(ok, "P5 'Nova prescrição alimentar' cria o plano com as 6 refeições padrão")
            p.check(adicionar(c, "Café da manhã", "banana, prata", "Banana, prata, crua", "120"), "P6 banana 120 g no café (busca TACO)")
            p.check(adicionar(c, "Almoço", "arroz, integral", "Arroz, integral, cozido", "150"), "P6 arroz integral 150 g no almoço")
            plano = q(f"select id::text from public.planos_alimentares where paciente_id = '{pid}' and deleted_at is null")
            itens = q(f"select count(*)::int n from public.itens_refeicao i join public.refeicoes r on r.id = i.refeicao_id where r.plano_id = '{plano[0]['id']}'") if plano else [{"n": 0}]
            p.check(len(plano) == 1 and itens[0]["n"] == 2, f"P6 no banco: 1 plano com 2 alimentos ({len(plano)} · {itens[0]['n']})")
            c.ir(f"/painel/alunos/{rota}/editar")
            c.esperar(lambda: c.tem("[data-editores-enviar]") and c.tem("[data-editor-dieta] [data-refeicao]"), 60)
            c.pg.locator("[data-editores-enviar]").click()
            av = c.esperar(lambda: q(f"select 1 from public.avisos where destino_user_id = '{B.uid(ALUNO)}' and tipo = 'plano_atualizado'"), 30)
            p.check(av, "P7 'Salvar e enviar ao aluno' → o aviso no sino do aluno")
            p.check(q(f"select count(*)::int n from public.mensagens_whatsapp where paciente_id = '{pid}'")[0]["n"] == 0, "P7 nenhuma mensagem de WhatsApp na fila para o aluno")
            c.pg.mouse.move(5, 5)
            c.print("tela8")
        finally:
            c.fim()
        # o aluno vê o plano e o aviso, e marca o café (a mesma função do app)
        cafe = q(f"select r.id::text from public.refeicoes r join public.planos_alimentares pl on pl.id = r.plano_id where pl.paciente_id = '{pid}' and r.nome = 'Café da manhã'")[0]["id"]
        a = caso(nav, "aluno_dieta", ALUNO, "/dieta", desktop=False)
        try:
            ok = a.esperar(lambda: a.pg.locator("[data-refeicoes] [data-refeicao]").count() >= 2, 90)
            p.check(ok, "P8 o app do aluno mostra o plano que a nutri acabou de montar")
            a.pg.locator(f'[data-refeicao="{cafe}"] [data-refeicao-marcar]').first.click()
            ok = a.esperar(lambda: q(f"select 1 from public.refeicoes_concluidas where paciente_id = '{pid}' and refeicao_id = '{cafe}'"), 30)
            p.check(ok, "P8 o aluno marcou o café no app (✓ gravado)")
            a.pg.wait_for_timeout(1200)
            a.print("app_dieta")
            a.ir("/")
            if a.esperar(lambda: a.tem("[data-sino]"), 60):
                a.pg.locator("[data-sino]").first.click()
            p.check(a.esperar(lambda: "Sua dieta foi atualizada" in a.texto(), 30), "P8 o aluno vê 'Sua dieta foi atualizada' no sino")
            a.print("app_sino")
        finally:
            a.fim()
        # a nutri vê o ✓ de hoje no acompanhamento e a adesão no card Dieta
        c = caso(nav, "nutri_ve", NUTRI, f"/painel/alunos/{rota}/dieta?secao=acompanhamento")
        try:
            ok = c.esperar(lambda: c.pg.locator("[data-concluidas-dia]").count() >= 7, 60)
            hoje = B.B5.hoje().isoformat()
            h = c.pg.locator(f'[data-concluidas-dia="{hoje}"]').first
            p.check(ok and (h.get_attribute("data-feitas"), h.get_attribute("data-total")) == ("1", "2"), "P9 a nutri vê o ✓ de hoje no acompanhamento (1 de 2)")
            c.pg.mouse.move(5, 5)
            c.print("acompanhamento")
            c.ir(f"/painel/alunos/{rota}")
            ok = c.esperar(lambda: c.tem("[data-card-dieta-adesao]"), 60)
            fe = c.pg.locator("[data-card-dieta-adesao]").first.get_attribute("data-card-dieta-feitas") if ok else None
            p.check(ok and fe == "1/14", f"P9 o card Dieta do Resumo: 1 de 14 nos 7 dias ({fe})")
            c.pg.mouse.move(5, 5)
            c.print("resumo")
            box = c.pg.locator("[data-card-dieta]").first.bounding_box()
            if box:
                c.pg.screenshot(path=str(B.PRINTS / "prod_card_dieta.png"), clip={"x": box["x"] - 8, "y": box["y"] - 8, "width": box["width"] + 16, "height": box["height"] + 16})
        finally:
            c.fim()
        nav.close()

    if manter:
        print("(--manter: as contas descartáveis ficam; rode --so-limpar depois)")
        return
    limpar()
    time.sleep(3)
    sobras = q(f"""select (select count(*) from public.planos_alimentares where paciente_id = '{pid}')
                        + (select count(*) from public.refeicoes_concluidas where paciente_id = '{pid}')
                        + (select count(*) from public.avisos a join auth.users u on u.id = a.destino_user_id where u.email like 'w16.prod.%')
                        + (select count(*) from public.pacientes where id = '{pid}') as n""")[0]["n"]
    p.check(sobras == 0, f"P10 nenhuma linha das descartáveis sobrou (planos, ✓, avisos, matrícula: {sobras})")
    depois = contagens()
    B.json_arquivo(PASTA / "contagens-depois.json", depois)
    dif = {k: (antes[k], depois.get(k)) for k in antes if antes[k] != depois.get(k)}
    p.check(not dif, f"P10 contagens iguais antes e depois (só as linhas das descartáveis mudaram e foram apagadas) {dif}")


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
