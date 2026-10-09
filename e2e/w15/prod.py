#!/usr/bin/env python3
"""Physiq W15 — PRODUÇÃO (https://physiqcalc.com.br, schema public): a prova "o aluno vê 4 × 10 · 60 s · 60 kg" (P20).

No staging o PowerSync lê o `public`, então a prova de ponta a ponta do editor → app do aluno roda AQUI, com 2 contas
DESCARTÁVEIS (w15.prod.*.teste.claude@physiqnutri.app): um personal (conta nova em teste) e um aluno convidado por ele (o convite
vai para a caixa de teste do Resend). O personal monta o treino no editor do painel (treino novo, 2 exercícios da biblioteca,
a prescrição num deles, a observação e o dia de hoje na semana) e o app do aluno — pelo PowerSync — mostra "4 × 10 · 60 s" com
a carga "60 kg" e a observação; o exercício sem prescrição segue como hoje. No fim tudo é apagado nos 2 bancos e as contagens
antes/depois provam que só as linhas delas mudaram. Nenhum dado de cliente é tocado.
Uso: python3 e2e/w15/prod.py [--manter] [--so-limpar]
"""
from __future__ import annotations

import argparse
import re
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
PERSONAL, ALUNO = "w15-prod-personal", "w15-prod-aluno"
B.EMAIL.update({PERSONAL: "w15.prod.personal.teste.claude@physiqnutri.app", ALUNO: "w15.prod.aluno.teste.claude@physiqnutri.app"})
B.NOMES.update({PERSONAL: "Personal Teste W15", ALUNO: "Aluno Teste W15"})
for _k in (PERSONAL, ALUNO):
    B.CONTAS[_k] = (B.EMAIL[_k], B.B5.senha_de(_k))
NOME_CONTA = "Conta Teste W15 (prova)"
NOME_TREINO = "Treino Teste W15"
OBS = "Teste W15: desça a barra em 3 segundos."
PASTA = Path.home() / "backups" / "physiq" / "2026-09-30-w15" / "prod-prova"
TAB_P = ["pacientes", "contas", "conta_membros", "convites", "conta_eventos", "cadastros_pendentes", "avisos", "profiles"]
# as tabelas que a prova toca (as de execução — séries e treinos feitos — mudam com os alunos de verdade treinando: ficam de fora
# da contagem total e entram na conferência "nenhuma linha dos descartáveis sobrou")
TAB_T = ["physiq_profiles", "physiq_identidades", "physiq_professores", "physiq_espelho_membros", "tb_grupos_treino", "tb_grupos_exercicios",
         "tb_grupos_treino_perfis", "tb_semana_treinos", "tb_semana_dia_config", "tb_series_padrao_usuario"]
TAB_T_USUARIO = ["tb_semana_treinos", "tb_semana_dia_config", "tb_series_padrao_usuario", "tb_grupos_treino_perfis", "tb_treino_series",
                 "tb_treino_concluido", "exercicio_ordem_usuario", "exercicio_substituicao_usuario"]
DIAS = ["SEG", "TER", "QUA", "QUI", "SEX", "SAB", "DOM"]


def q(sql: str) -> list:
    return B.sql_principal(sql)


def contagens() -> dict:
    r = {f"principal.{t}": q(f"select count(*) as n from public.{t}")[0]["n"] for t in TAB_P}
    r.update({f"treino.{t}": B.sql_treino(f"select count(*) as n from public.{t}")[0]["n"] for t in TAB_T})
    r["principal.auth.users"] = q("select count(*) as n from auth.users")[0]["n"]
    r["treino.auth.users"] = B.sql_treino("select count(*) as n from auth.users")[0]["n"]
    return r


def ids() -> dict:
    u = {k: B.uid(k) for k in (PERSONAL, ALUNO)}
    t = {}
    for k, v in u.items():
        if v:
            r = B.sql_treino(f"select treino_user_id::text as t from public.physiq_identidades where principal_user_id = '{v}'")
            t[k] = r[0]["t"] if r else None
    return {"principal": u, "treino": t}


def limpar() -> None:
    """Apaga TUDO das 2 contas descartáveis nos 2 bancos (só elas — o e-mail w15.prod.* é conferido)."""
    info = ids()
    for k in (PERSONAL, ALUNO):
        e = B.EMAIL[k]
        assert e.startswith("w15.prod.") and e.endswith(".teste.claude@physiqnutri.app"), e
    up = [v for v in info["principal"].values() if v]
    ut = [v for v in info["treino"].values() if v]
    contas = [r["id"] for r in q(f"select id::text from public.contas where nome = $n${NOME_CONTA}$n$")]
    if up:
        lu = ",".join(f"'{x}'" for x in up)
        contas += [r["id"] for r in q(f"select id::text from public.contas where dono_id in ({lu})")]
    contas = sorted(set(contas))
    if contas:
        cs = ",".join(f"'{c}'" for c in contas)
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
        # os treinos que o personal descartável montou (o grupo e, em cascata, exercícios, quem recebe e prescrição)
        B.sql_treino(f"delete from public.tb_grupos_treino where professor_id = '{t}'")
        for tab, col in (("tb_semana_treinos", "user_id"), ("tb_semana_dia_config", "user_id"), ("tb_series_padrao_usuario", "user_id"),
                         ("tb_grupos_treino_perfis", "user_id"), ("tb_treino_series", "user_id"), ("tb_treino_concluido", "user_id"),
                         ("exercicio_ordem_usuario", "user_id"), ("exercicio_substituicao_usuario", "user_id"), ("edge_rate_limits", "user_id")):
            B.sql_treino(f"delete from public.{tab} where {col} = '{t}'")
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


def caso(nav, nome: str, conta: str, rota: str, desktop: bool) -> "B.Caso":
    c = B.Caso(nav, BASE, "prod", nome, desktop=desktop)
    c.entrar(conta, rota, zerar=False)
    c.fechar_avisos()
    return c


def prova(manter: bool) -> None:
    PASTA.mkdir(parents=True, exist_ok=True)
    B.saude_ok("prod — contagens")
    antes = contagens()
    B.json_arquivo(PASTA / "contagens-antes.json", antes)
    for k in (PERSONAL, ALUNO):
        B.B5.garantir_usuario(B.EMAIL[k], B.CONTAS[k][1], B.NOMES[k])
    q(f"update public.profiles set nome = $n${B.NOMES[PERSONAL]}$n$, tipo_perfil = 'personal' where id = '{B.uid(PERSONAL)}'")
    st, r = B.rpc(PERSONAL, "criar_minha_conta", {"p_nome": NOME_CONTA, "p_tipo": "personal", "p_registro": "CREF 001515-G/PE"})
    p.check(st == 200 and isinstance(r, dict) and r.get("ok"), f"P1 conta descartável criada em produção → {st} {r}")
    c_id = q(f"select id::text from public.contas where dono_id = '{B.uid(PERSONAL)}' and nome = $n${NOME_CONTA}$n$")[0]["id"]
    st, r = B.B13.alunos(PERSONAL, "convidar", {"conta_id": c_id, "email": B.EMAIL[ALUNO], "modulos": ["treino"]}, origem=BASE)
    p.check(st == 200 and r.get("email_teste") is True, f"P2 convite em produção (caixa de teste) → {st} {({k: r.get(k) for k in ('ok', 'email_teste', 'email_enviado')})}")
    tok = B.token(ALUNO)
    st, _, _ = B.http("POST", f"{B.API_P}/functions/v1/pos-login", {}, {"apikey": B.anon(B.PRINCIPAL_REF), "Authorization": f"Bearer {tok}",
                                                                         "x-schema": S, "Origin": BASE}, timeout=90)
    mat = q(f"select id::text, personal_id::text, treino_user_id::text from public.pacientes where conta_id = '{c_id}' and user_id = '{B.uid(ALUNO)}' and deleted_at is null")
    p.check(st == 200 and mat and mat[0]["personal_id"] == B.uid(PERSONAL), f"P3 aluno entrou → matrícula com o personal → {st} {mat}")
    rota = mat[0]["treino_user_id"] or mat[0]["id"]
    # as sessões do Treino (como o app): o personal primeiro (vira professor), depois o aluno (o espelho liga o aluno ao personal)
    st1, r1 = B.B5.trocar_token(PERSONAL)
    st2, r2 = B.B5.trocar_token(ALUNO)
    tp, ta = r1.get("treino_user_id"), r2.get("treino_user_id")
    ok = B.esperar(lambda: (B.sql_treino(f"select professor_id::text as p from public.physiq_profiles where id = '{ta}'") or [{}])[0].get("p") == tp, 60, 3)
    if not ok:
        B.B5.trocar_token(ALUNO)
        ok = B.esperar(lambda: (B.sql_treino(f"select professor_id::text as p from public.physiq_profiles where id = '{ta}'") or [{}])[0].get("p") == tp, 60, 3)
    p.check(st1 == 200 and st2 == 200 and r1.get("papel") == "professor" and bool(ok), f"P4 Treino: personal = professor, aluno ligado a ele ({r1.get('papel')}, {bool(ok)})")
    dia = DIAS[B.B5.hoje().weekday()]
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        # 1. o personal monta o treino no editor do painel (produção)
        B.saude_ok("prod — editor")
        d = caso(nav, "editor", PERSONAL, f"/painel/alunos/{rota}/treino", desktop=True)
        try:
            ok = d.esperar(lambda: d.tem("[data-editor-treino]") and d.tem("[data-treino-novo]"), 120)
            p.check(ok, "P5 o editor do treino abre em produção (aluno sem treino ainda)")
            d.pg.locator("[data-treino-novo]").click()
            d.esperar(lambda: d.tem("[data-novo-treino-nome]"), 20)
            d.pg.locator("[data-novo-treino-nome]").fill(NOME_TREINO)
            d.pg.locator("[data-novo-treino-criar]").click()
            ok = d.esperar(lambda: d.pg.locator(f'[data-treino-aba][data-treino-rotulo$="{NOME_TREINO}"]').count() > 0, 60)
            p.check(ok, "P6 '+' criou o treino novo do aluno")
            for nome in ("Supino Reto com Barra", "Tríceps Pulley"):
                d.pg.locator("[data-treino-adicionar]").click()
                d.esperar(lambda: d.pg.locator("[data-biblioteca-item]").count() > 0, 60)  # hml-14d (D39): a folha mostra 20 por página
                d.pg.locator("[data-biblioteca-busca]").fill(nome.lower())
                d.pg.wait_for_timeout(500)
                d.pg.locator(f'[data-biblioteca-item="{nome}"]').first.click()
                p.check(d.esperar(lambda: d.tem(f'[data-exercicio-nome="{nome}"]'), 60), f"P7 biblioteca › {nome} no treino")
                time.sleep(1.5)
            for campo, valor in (("series", "4"), ("reps", "10"), ("descanso", "60"), ("carga", "60")):
                inp = d.pg.locator('[data-exercicio-nome="Supino Reto com Barra"]').first.locator(f'[data-campo-input="{campo}"]')
                inp.click()
                inp.fill(valor)
                inp.press("Enter")
                d.pg.wait_for_timeout(700)
            obs = d.pg.locator("[data-treino-observacao-campo]")
            obs.click()
            obs.fill(OBS)
            d.pg.locator("[data-chip-exercicios]").click()
            d.pg.wait_for_timeout(1500)
            sup = B.sql_treino("select id::text from public.tb_exercicios where nome = 'Supino Reto com Barra' and professor_id is null")[0]["id"]
            ok = B.esperar(lambda: B.sql_treino(f"""select 1 from public.tb_series_padrao_usuario where user_id = '{ta}' and exercicio_id = '{sup}'
                                                    and num_series = 4 and reps_alvo = '10' and descanso_segundos = 60 and carga_sugerida_kg = 60"""), 40, 2)
            p.check(bool(ok), "P8 produção (public): a prescrição 4 × 10 · 60 s · 60 kg gravada nas colunas que o app lê")
            ok = B.esperar(lambda: B.sql_treino(f"select 1 from public.tb_series_padrao_usuario where user_id = '{ta}' and exercicio_id is null and observacao = $o${OBS}$o$"), 40, 2)
            p.check(bool(ok), "P8 produção: a observação na linha geral do treino")
            # o dia de hoje na semana do aluno
            d.pg.locator(f'[data-semana-dia="{dia}"] [data-semana-treino]').first.click()
            ok = B.esperar(lambda: B.sql_treino(f"select 1 from public.tb_semana_treinos where user_id = '{ta}' and dia_semana = '{dia}'"), 40, 2)
            p.check(bool(ok), f"P9 semana: o treino no dia de hoje ({dia})")
            d.pg.mouse.move(5, 5)
            d.esperar(lambda: d.pg.locator("[data-sonner-toast]").count() == 0, 12)
            d.pg.locator("[data-editor-treino]").first.screenshot(path=str(B.PRINTS / "prod_editor_treino.png"))
            d.print("aba_treino")
            d.ir(f"/painel/alunos/{rota}")
            ok = d.esperar(lambda: d.tem("[data-card-treino-semana]") or d.tem("[data-card-treino-treino]"), 90)
            p.check(ok, "P10 Resumo: o card Treino com o treino do aluno")
            d.pg.wait_for_timeout(2500)
            d.pg.locator("[data-card-treino]").first.screenshot(path=str(B.PRINTS / "prod_card_treino.png"))
        finally:
            d.fim()
        # 2. o aluno abre o app (celular): o PowerSync traz a prescrição
        B.saude_ok("prod — app do aluno")
        a = caso(nav, "app", ALUNO, "/treino", desktop=False)
        try:
            ok = a.esperar(lambda: a.tem('[data-exercicio-nome]') and "Supino Reto com Barra" in a.texto(), 180)
            p.check(ok, "P11 app do aluno em produção: o treino de hoje chegou pelo PowerSync")
            a.esperar(lambda: not a.tem('[data-sync="primeira"]'), 60)
            linha_sup = a.pg.locator("[data-exercicio-id]", has_text="Supino Reto com Barra").first
            texto_sup = linha_sup.locator("[data-exercicio-linha]").inner_text().strip()
            carga_sup = linha_sup.locator("[data-exercicio-carga]").inner_text().strip() if linha_sup.locator("[data-exercicio-carga]").count() else ""
            # o exercício atual começa com "Série 1 de 4 · " (tela 2); a carga vai no chip enquanto não está feito
            sem_serie = re.sub(r"^Série \d+ de \d+ · ", "", texto_sup)
            p.check(sem_serie == "4 × 10 · 60 s" and carga_sup == "60 kg", f"P12 o aluno vê '4 × 10 · 60 s' + '60 kg' ({texto_sup!r} + {carga_sup!r})")
            linha_tri = a.pg.locator("[data-exercicio-id]", has_text="Tríceps Pulley").first
            texto_tri = linha_tri.locator("[data-exercicio-linha]").inner_text().strip()
            p.check("60 s" not in texto_tri and "4 ×" not in texto_tri, f"P13 sem prescrição: como hoje ({texto_tri!r})")
            p.check(OBS in a.texto(), "P14 a observação do professor no card do treino")
            a.pg.wait_for_timeout(1200)
            a.print("aluno_treino")
        finally:
            a.fim()
        nav.close()
    B.json_arquivo(PASTA / "ids.json", ids())
    if not manter:
        limpar()
        time.sleep(3)
        depois = contagens()
        B.json_arquivo(PASTA / "contagens-depois.json", depois)
        dif = {k: (antes[k], depois[k]) for k in antes if antes[k] != depois.get(k)}
        p.check(not dif, f"P15 limpeza: contagens de produção iguais antes/depois (só as linhas descartáveis mudaram) → diferenças {dif}")
        info = B.ler_json(PASTA / "ids.json")
        sobra = {}
        for t in [x for x in (info.get("treino") or {}).values() if x]:
            for tab in TAB_T_USUARIO:
                n = B.sql_treino(f"select count(*) as n from public.{tab} where user_id = '{t}'")[0]["n"]
                if n:
                    sobra[f"{tab}:{t[:8]}"] = n
            n = B.sql_treino(f"select count(*) as n from public.tb_grupos_treino where professor_id = '{t}'")[0]["n"]
            if n:
                sobra[f"tb_grupos_treino:{t[:8]}"] = n
        p.check(not sobra, f"P16 nenhuma linha das contas descartáveis sobrou no Treino → {sobra}")


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
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001
        p.check(False, f"erro na prova: {e}")
        if not a.manter:
            limpar()
    return p.fim()


if __name__ == "__main__":
    raise SystemExit(main())
