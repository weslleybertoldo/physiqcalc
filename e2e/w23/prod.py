#!/usr/bin/env python3
"""Physiq W23 — PRODUÇÃO (https://physiqcalc.com.br, schema public): a prova "o exercício próprio novo aparece na troca por
equivalente do aluno" e "o aluno recebe a prescrição do modelo" (P20: no staging o PowerSync lê o `public`).

2 contas DESCARTÁVEIS (w23.prod.*.teste.claude@physiqnutri.app): um personal (conta nova em teste) e um aluno convidado por ele (o
convite vai para a caixa de teste do Resend). No painel de produção o personal cria, em Painel › Treinos: o exercício PRÓPRIO
"Rosca Martelo com Kettlebell · Teste W23" (Biblioteca › Minha, com o GIF, movimento rosca martelo e equipamento kettlebell) e o
treino-modelo "Treino Teste W23" (Rosca Martelo com Halteres + Supino Reto com Barra, este com 4 × 10 · 60 s · 60 kg NO MODELO) e
marca o aluno em "Quem recebe". O app do aluno (celular, PowerSync) mostra o Supino com "4 × 10 · 60 s" + "60 kg" e o "Trocar" da
rosca martelo traz o exercício próprio em Equivalentes. No fim tudo é apagado nos 2 bancos e no Storage, e as contagens antes/
depois provam que só as linhas delas mudaram. Nenhum dado de cliente é tocado.
Uso: python3 e2e/w23/prod.py [--manter] [--so-limpar]
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
PERSONAL, ALUNO = "w23-prod-personal", "w23-prod-aluno"
B.EMAIL.update({PERSONAL: "w23.prod.personal.teste.claude@physiqnutri.app", ALUNO: "w23.prod.aluno.teste.claude@physiqnutri.app"})
B.NOMES.update({PERSONAL: "Personal Teste W23", ALUNO: "Aluno Teste W23"})
for _k in (PERSONAL, ALUNO):
    B.CONTAS[_k] = (B.EMAIL[_k], B.B5.senha_de(_k))
NOME_CONTA = "Conta Teste W23 (prova)"
NOME_TREINO = "Treino Teste W23"
PROPRIO = "Rosca Martelo com Kettlebell · Teste W23"
ARQ_GIF = B.GIF_TESTE / "97bf2aa2-77b4-429e-9c9d-d5e3547b5b14-1788913556.webp"
PASTA = Path.home() / "backups" / "physiq" / "2026-10-01-w23" / "prod-prova"
TAB_P = ["pacientes", "contas", "conta_membros", "convites", "conta_eventos", "cadastros_pendentes", "avisos", "profiles"]
TAB_T = ["physiq_profiles", "physiq_identidades", "physiq_professores", "physiq_espelho_membros", "tb_grupos_treino", "tb_grupos_exercicios",
         "tb_grupos_treino_perfis", "tb_semana_treinos", "tb_semana_dia_config", "tb_series_padrao_usuario", "tb_exercicios", "grupos_musculares",
         "tb_pastas_treino", "tb_pastas_treino_grupos"]
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
    r["treino.storage.exercicios"] = B.sql_treino("select count(*) as n from storage.objects where bucket_id = 'exercicios'")[0]["n"]
    return r


def ids() -> dict:
    u = {k: B.uid(k) for k in (PERSONAL, ALUNO)}
    t = {}
    for k, v in u.items():
        if v:
            # (apelido ≠ "t": o embrulho do psql agrega a linha como json_agg(t))
            r = B.sql_treino(f"select treino_user_id::text as tid from public.physiq_identidades where principal_user_id = '{v}'")
            t[k] = r[0]["tid"] if r else None
    return {"principal": u, "treino": t}


def limpar() -> None:
    """Apaga TUDO das 2 contas descartáveis nos 2 bancos e no Storage (só elas — o e-mail w23.prod.* é conferido)."""
    info = ids()
    for k in (PERSONAL, ALUNO):
        e = B.EMAIL[k]
        assert e.startswith("w23.prod.") and e.endswith(".teste.claude@physiqnutri.app"), e
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
        # o GIF do exercício próprio (bucket de produção) antes do exercício
        exs = [r["id"] for r in B.sql_treino(f"select id::text from public.tb_exercicios where professor_id = '{t}'")]
        if exs:
            objs = [r["name"] for r in B.sql_treino(f"select name from storage.objects where bucket_id = 'exercicios' and split_part(name, '.', 1) in ({','.join(repr(e) for e in exs)})")]
            if objs:
                st, _, _ = B.http("DELETE", f"{B.B5.TREINO_URL}/storage/v1/object/exercicios", {"prefixes": objs}, {"apikey": spt, "Authorization": f"Bearer {spt}"})
                print("Storage: GIF de teste apagado", objs, st)
        B.exec_treino(f"""begin;
            delete from public.tb_grupos_treino where professor_id = '{t}';
            delete from public.tb_pastas_treino where professor_id = '{t}';
            delete from public.tb_exercicios where professor_id = '{t}';
            delete from public.grupos_musculares where professor_id = '{t}';
            commit;""")
        for tab in ("tb_semana_treinos", "tb_semana_dia_config", "tb_series_padrao_usuario", "tb_grupos_treino_perfis", "tb_treino_series",
                    "tb_treino_concluido", "exercicio_ordem_usuario", "exercicio_substituicao_usuario", "edge_rate_limits"):
            B.exec_treino(f"delete from public.{tab} where user_id = '{t}'")
        B.exec_treino(f"delete from public.physiq_espelho_membros where treino_user_id = '{t}'")
        B.exec_treino(f"delete from public.physiq_professores where id = '{t}'")
        B.exec_treino(f"delete from public.physiq_identidades where treino_user_id = '{t}'")
        st, _, _ = B.http("DELETE", f"{B.B5.TREINO_URL}/auth/v1/admin/users/{t}", None, {"apikey": spt, "Authorization": f"Bearer {spt}"})
        B.exec_treino(f"delete from public.physiq_profiles where id = '{t}'")
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
    st, r = B.rpc(PERSONAL, "criar_minha_conta", {"p_nome": NOME_CONTA, "p_tipo": "personal", "p_registro": "CREF 002323-G/PE"})
    p.check(st == 200 and isinstance(r, dict) and r.get("ok"), f"P1 conta descartável criada em produção → {st} {r}")
    c_id = q(f"select id::text from public.contas where dono_id = '{B.uid(PERSONAL)}' and nome = $n${NOME_CONTA}$n$")[0]["id"]
    st, r = B.B13.alunos(PERSONAL, "convidar", {"conta_id": c_id, "email": B.EMAIL[ALUNO], "modulos": ["treino"]}, origem=BASE)
    p.check(st == 200 and r.get("email_teste") is True, f"P2 convite em produção (caixa de teste) → {st} {({k: r.get(k) for k in ('ok', 'email_teste', 'email_enviado')})}")
    tok = B.token(ALUNO)
    st, _, _ = B.http("POST", f"{B.API_P}/functions/v1/pos-login", {}, {"apikey": B.anon(B.PRINCIPAL_REF), "Authorization": f"Bearer {tok}",
                                                                         "x-schema": S, "Origin": BASE}, timeout=90)
    mat = q(f"select id::text, personal_id::text from public.pacientes where conta_id = '{c_id}' and user_id = '{B.uid(ALUNO)}' and deleted_at is null")
    p.check(st == 200 and mat and mat[0]["personal_id"] == B.uid(PERSONAL), f"P3 aluno entrou → matrícula com o personal → {st} {mat}")
    st1, r1 = B.B5.trocar_token(PERSONAL)
    st2, r2 = B.B5.trocar_token(ALUNO)
    tp, ta = r1.get("treino_user_id"), r2.get("treino_user_id")
    ok = B.esperar(lambda: (B.sql_treino(f"select professor_id::text as p from public.physiq_profiles where id = '{ta}'") or [{}])[0].get("p") == tp, 60, 3)
    if not ok:
        B.B5.trocar_token(ALUNO)
        ok = B.esperar(lambda: (B.sql_treino(f"select professor_id::text as p from public.physiq_profiles where id = '{ta}'") or [{}])[0].get("p") == tp, 60, 3)
    p.check(st1 == 200 and st2 == 200 and r1.get("papel") == "professor" and bool(ok), f"P4 Treino: personal = professor, aluno ligado a ele ({r1.get('papel')}, {bool(ok)})")
    dia = DIAS[B.B5.hoje().weekday()]
    rosca = B.sql_treino("select id::text from public.tb_exercicios where nome = 'Rosca Martelo com Halteres' and professor_id is null")[0]["id"]
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        # 1. Biblioteca › Minha: o exercício próprio novo (GIF, movimento e equipamento)
        B.saude_ok("prod — biblioteca")
        d = caso(nav, "biblioteca", PERSONAL, "/painel/treinos?aba=biblioteca&b=minha", desktop=True)
        try:
            ok = d.esperar(lambda: d.tem('[data-biblioteca="minha"]'), 120)
            p.check(ok, "P5 Painel › Treinos › Biblioteca › Minha abre em produção")
            d.pg.locator("[data-btn-novo-exercicio]").click()
            d.esperar(lambda: d.tem('[data-folha-exercicio="novo"]'), 20)
            d.pg.locator("[data-campo-nome]").fill(PROPRIO)
            d.pg.locator("[data-campo-grupo]").select_option("Bíceps / Braquial")
            d.pg.locator("[data-campo-subgrupo]").fill("Braquial · braquiorradial · bíceps")
            d.pg.locator("[data-exercicio-arquivo]").set_input_files(str(ARQ_GIF))
            d.pg.locator("[data-campo-movimento]").select_option("rosca_martelo")
            d.pg.locator("[data-campo-equipamento]").select_option("kettlebell")
            d.pg.locator("[data-exercicio-salvar]").click()
            reg = B.esperar(lambda: (B.sql_treino(f"select id::text, professor_id::text, padrao_movimento, equipamento, imagem_url from public.tb_exercicios where nome = $n${PROPRIO}$n$") or [None])[0]
                            if (B.sql_treino(f"select imagem_url from public.tb_exercicios where nome = $n${PROPRIO}$n$") or [{}])[0].get("imagem_url") else None, 60, 2)
            p.check(bool(reg) and reg["professor_id"] == tp and reg["padrao_movimento"] == "rosca_martelo" and reg["equipamento"] == "kettlebell"
                    and "/exercicios/" in (reg["imagem_url"] or ""), f"P6 produção: exercício próprio do personal com o GIF no bucket de produção → {reg and reg['imagem_url'][:80]}")
            d.esperar(lambda: d.tem(f'[data-exercicio-biblioteca-nome="{PROPRIO}"]'), 30)
            d.esperar(lambda: d.pg.locator(f'[data-exercicio-biblioteca-nome="{PROPRIO}"] [data-miniatura="quadro"], [data-exercicio-biblioteca-nome="{PROPRIO}"] [data-miniatura="imagem"]').count() > 0, 30)
            d.pg.mouse.move(5, 5)
            d.esperar(lambda: d.pg.locator("[data-sonner-toast]").count() == 0, 12)
            d.print("tela8_biblioteca_minha")
        finally:
            d.fim()
        time.sleep(2)
        # 2. Meus treinos: o treino-modelo com a prescrição do modelo e quem recebe
        B.saude_ok("prod — meus treinos")
        d = caso(nav, "meus_treinos", PERSONAL, "/painel/treinos", desktop=True)
        try:
            ok = d.esperar(lambda: d.tem("[data-btn-novo-treino]"), 120)
            d.pg.locator("[data-btn-novo-treino]").click()
            d.esperar(lambda: d.tem("[data-folha-nome-campo]"), 20)
            d.pg.locator("[data-folha-nome-campo]").fill(NOME_TREINO)
            d.pg.locator("[data-folha-nome-salvar]").click()
            ok = d.esperar(lambda: d.pg.locator("[data-modelo-detalhe]").get_attribute("data-modelo-nome") == NOME_TREINO, 60)
            p.check(ok, "P7 Novo treino (modelo) criado em produção")
            for nome in ("Supino Reto com Barra", "Rosca Martelo com Halteres"):
                d.pg.locator("[data-modelo-adicionar]").click()
                d.esperar(lambda: d.pg.locator("[data-biblioteca-item]").count() > 0, 60)  # hml-14d (D39): a folha mostra 20 por página
                d.pg.locator("[data-biblioteca-busca]").fill(nome.lower())
                d.pg.wait_for_timeout(500)
                d.pg.locator(f'[data-biblioteca-item="{nome}"]').first.click()
                p.check(d.esperar(lambda: d.tem(f'[data-modelo-detalhe] [data-exercicio-nome="{nome}"]'), 60), f"P8 biblioteca › {nome} no modelo")
                time.sleep(1.5)
            for campo, valor in (("series", "4"), ("reps", "10"), ("descanso", "60"), ("carga", "60")):
                inp = d.pg.locator('[data-modelo-detalhe] [data-exercicio-nome="Supino Reto com Barra"]').first.locator(f'[data-campo-input="{campo}"]')
                inp.click()
                inp.fill(valor)
                inp.press("Enter")
                d.pg.wait_for_timeout(700)
            gid = (B.sql_treino(f"select id::text from public.tb_grupos_treino where professor_id = '{tp}' and nome = $n${NOME_TREINO}$n$") or [{}])[0].get("id")
            sup = B.sql_treino("select id::text from public.tb_exercicios where nome = 'Supino Reto com Barra' and professor_id is null")[0]["id"]
            ok = B.esperar(lambda: B.sql_treino(f"""select 1 from public.tb_grupos_exercicios where grupo_id = '{gid}' and exercicio_id = '{sup}'
                                                    and num_series = 4 and reps_alvo = '10' and descanso_segundos = 60 and carga_sugerida_kg = 60"""), 40, 2)
            p.check(bool(gid) and bool(ok), "P9 produção: a prescrição DO MODELO (4 × 10 · 60 s · 60 kg) nas colunas novas")
            d.esperar(lambda: d.tem(f'[data-quem-recebe-aluno="{ta}"]'), 60)
            d.pg.locator(f'[data-quem-recebe-aluno="{ta}"]').click()
            ok = B.esperar(lambda: B.sql_treino(f"""select 1 from public.tb_series_padrao_usuario where user_id = '{ta}' and grupo_id = '{gid}' and exercicio_id = '{sup}'
                                                    and num_series = 4 and reps_alvo = '10' and descanso_segundos = 60 and carga_sugerida_kg = 60"""), 40, 2)
            p.check(bool(ok), "P10 'Quem recebe': o aluno recebe o modelo e leva a prescrição dele (tb_series_padrao_usuario)")
            d.pg.mouse.move(5, 5)
            d.esperar(lambda: d.pg.locator("[data-sonner-toast]").count() == 0, 12)
            d.print("tela8_meus_treinos")
        finally:
            d.fim()
        # o dia de hoje na semana do aluno (a função da W15, como o editor do perfil do aluno faz)
        st, r = B.funcao_treino(PERSONAL, "admin-semana-treinos", {"action": "setDia", "userId": ta, "dia_semana": dia, "grupos": [{"grupo_id": gid}]}, origem=BASE)
        p.check(st == 200, f"P11 semana do aluno: o modelo no dia de hoje ({dia}) → {st} {r}")
        time.sleep(3)
        # 3. o app do aluno (celular): a prescrição do modelo e o exercício próprio na troca por equivalente
        B.saude_ok("prod — app do aluno")
        a = caso(nav, "app", ALUNO, "/treino", desktop=False)
        try:
            ok = a.esperar(lambda: a.tem('[data-exercicio-nome]') and "Rosca Martelo com Halteres" in a.texto(), 180)
            p.check(ok, "P12 app do aluno em produção: o treino de hoje chegou pelo PowerSync")
            a.esperar(lambda: not a.tem('[data-sync="primeira"]'), 60)
            linha_sup = a.pg.locator("[data-exercicio-id]", has_text="Supino Reto com Barra").first
            texto_sup = linha_sup.locator("[data-exercicio-linha]").inner_text().strip()
            carga_sup = linha_sup.locator("[data-exercicio-carga]").inner_text().strip() if linha_sup.locator("[data-exercicio-carga]").count() else ""
            sem_serie = re.sub(r"^Série \d+ de \d+ · ", "", texto_sup)
            p.check(sem_serie == "4 × 10 · 60 s" and carga_sup == "60 kg", f"P13 o aluno vê a prescrição do modelo: '4 × 10 · 60 s' + '60 kg' ({texto_sup!r} + {carga_sup!r})")
            l = a.pg.locator(f'[data-exercicio-id="{rosca}"]')
            if l.get_attribute("data-aberto") != "1":
                l.locator("[data-exercicio-abrir]").click()
                a.esperar(lambda: a.pg.locator(f'[data-exercicio-id="{rosca}"]').get_attribute("data-aberto") == "1", 8)
            l.locator('[data-acao-exercicio="trocar"]').click()
            ok = a.esperar(lambda: a.tem("[data-trocar-exercicio]") and a.pg.locator("[data-trocar-exercicio] [aria-busy]").count() == 0, 20)
            a.pg.wait_for_timeout(800)
            nomes = a.pg.locator('[data-trocar-lista="equivalentes"] [data-trocar-nome]').all_inner_texts() if ok else []
            aba = a.pg.locator("[data-trocar-exercicio]").get_attribute("data-trocar-aba-atual") if ok else ""
            p.check(ok and aba == "equivalentes" and PROPRIO in nomes, f"P14 'Trocar' a rosca martelo: o exercício PRÓPRIO do personal em Equivalentes ({aba}: {nomes})")
            a.esperar(lambda: a.pg.locator("[data-sonner-toast]").count() == 0, 8)
            a.print("app_trocar_equivalente_proprio")
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
            for tab in ("tb_grupos_treino", "tb_exercicios", "tb_pastas_treino", "grupos_musculares"):
                n = B.sql_treino(f"select count(*) as n from public.{tab} where professor_id = '{t}'")[0]["n"]
                if n:
                    sobra[f"{tab}:{t[:8]}"] = n
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
