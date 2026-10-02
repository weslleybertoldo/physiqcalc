#!/usr/bin/env python3
"""Physiq W1 (conta única) — CONFERÊNCIA em PRODUÇÃO, só leitura, das 2 contas reais do profissional depois (ou antes) da junção.

  API    COMO cada login (role authenticated + o JWT nas claims, numa transação DESFEITA — nenhuma sessão nasce, nada é gravado):
         minha_situacao do profissional (1 conta, módulos e papéis, limite) e do aluno (1 matrícula ativa com Treino e Dieta) ·
         minha_dieta do aluno (os planos; a refeição marcada e a foto do dia em que foram feitas) · alunos_da_conta da conta que fica ·
         master › Alunos "Em 2 contas" (P7) sem o aluno · a foto do diário abre para o aluno e para o profissional · nada de
         fatura/assinatura/WhatsApp/aviso novo
  TREINO o perfil do aluno (professor e conta), o espelho dos membros, a linha de professor e o treino do aluno igual ao backup
  TELAS  (--telas) https://physiqcalc.com.br com sessão por link mágico da API admin (sem e-mail, sem senha): painel (menu, Alunos,
         perfil do aluno com Treino e Dieta, Agenda) e o app do aluno (Treino e Dieta). O navegador BLOQUEIA qualquer escrita (tabela,
         RPC de gravar, Storage) e as linhas dos 2 logins são contadas antes e depois (nada pode mudar).
Uso: python3 e2e/conta_unica/prod.py --estado antes|juntada --profissional <uuid> --aluno <uuid> --conta-fica <uuid> --conta-sai <uuid>
       --matricula-fica <uuid> --matricula-sai <uuid> [--backup <pasta do backup de produção>] [--telas]
Prints: ~/projetos/physiqcalc-scratch/prints/conta-unica-agenda/w1/prod_*.png
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

S = "public"
B.ESTADO["schema"] = S
p = B.p
q = B.sql_principal
BASE = "https://physiqcalc.com.br"
ESCRITA_RPC = re.compile(r"/rest/v1/rpc/(marcar|salvar|garantir|criar|registrar|aceitar|excluir|apagar|atualizar|enviar|matricular|vincular|"
                         r"desvincular|master_conta_acao|master_mover|paciente_criar|aluno_ativar|aluno_salvar|aluno_criar|aluno_convidar|"
                         r"agenda_marcar|agenda_salvar|agenda_garantir|agendamento_|whatsapp_|mensagem_|mensagens_enviar|reagir|responder)")
ESCRITA_TABELA = re.compile(r"/rest/v1/(?!rpc/)")


def contar_linhas(ids: list[str]) -> dict:
    """Quantas linhas citam cada login (toda coluna uuid do public): as telas não podem mudar nada."""
    cols = q(f"""select c.table_name as t, c.column_name as col from information_schema.columns c
        join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
       where c.table_schema = 'public' and c.data_type = 'uuid' and c.table_name not in ('espelho_pendencias', 'login_tentativas_ip')
       order by 1, 2""")
    out: dict = {}
    for i in range(0, len(cols), 30):
        partes = []
        for x in cols[i:i + 30]:
            f = ", ".join(f"count(*) filter (where \"{x['col']}\" = '{u}')::int as n{j}" for j, u in enumerate(ids))
            partes.append(f"select '{x['t']}.{x['col']}' as k, {f} from public.\"{x['t']}\"")
        for r in q(" union all ".join(partes)):
            n = [r[f"n{j}"] for j in range(len(ids))]
            if any(n):
                out[r["k"]] = n
    return out


def api(a, estado: str) -> None:
    juntada = estado == "juntada"
    prof, aluno, fica, sai, mf, ms = a.profissional, a.aluno, a.conta_fica, a.conta_sai, a.matricula_fica, a.matricula_sai
    sit = B.como(prof, S, "{s}.minha_situacao()")
    contas = {c["id"]: c for c in (sit or {}).get("contas") or []}
    c = contas.get(fica) or {}
    if juntada:
        p.check(list(contas) == [fica], f"[prof] minha_situacao: 1 conta só ({[x['nome'] + ' ' + x['id'][:8] for x in contas.values()]})")
        p.check(c.get("modulos") == ["treino", "nutricao"] and c.get("papeis") == ["dono", "personal", "nutricionista"],
                f"[prof] módulos {c.get('modulos')} · papéis {c.get('papeis')}")
        p.check(c.get("plano") == "treino_nutricao" and c.get("situacao") == "isenta" and c.get("isenta_motivo") == "master"
                and c.get("faixa") == "livre" and c.get("limite_alunos") is None,
                f"[prof] plano {c.get('plano')} · {c.get('situacao')}/{c.get('isenta_motivo')} · faixa {c.get('faixa')} · limite {c.get('limite_alunos')}")
    else:
        p.check(set(contas) == {fica, sai}, f"[prof] antes: as 2 contas ({len(contas)})")
    p.check(bool((sit or {}).get("master")), "[prof] continua master")
    sa = B.como(aluno, S, "{s}.minha_situacao()")
    mats = (sa or {}).get("matriculas") or []
    ativas = [m for m in mats if m.get("ativo")]
    resumo = [(m["id"][:8], m.get("conta_nome"), m.get("ativo"), m.get("modulos")) for m in mats]
    if juntada:
        m = ativas[0] if len(ativas) == 1 else {}
        p.check(len(ativas) == 1 and m.get("id") == mf and sorted(m.get("modulos") or []) == ["nutricao", "treino"],
                f"[aluno] minha_situacao: 1 matrícula ativa com Treino e Dieta — {resumo}")
        p.check((m.get("personal") or {}).get("id") == prof and (m.get("nutricionista") or {}).get("id") == prof,
                "[aluno] personal e nutricionista = o profissional")
    else:
        p.check(len(ativas) == 2, f"[aluno] antes: 2 matrículas ativas (P7) — {resumo}")
    dieta = B.como(aluno, S, "{s}.minha_dieta()")
    planos = (dieta or {}).get("planos") or []
    alvo = mf if juntada else ms
    p.check(len(planos) == 2 and all(x["paciente_id"] == alvo for x in planos),
            f"[aluno] minha_dieta: {len(planos)} planos na matrícula {'que fica' if juntada else 'da Nutri'} ({sorted(x['titulo'] for x in planos)})")
    dia = B.como(aluno, S, "{s}.minha_dieta('2026-10-01'::date)")
    p.check(len((dia or {}).get("refeicoes_concluidas") or []) == 1 and len((dia or {}).get("diario") or []) >= 1
            and all(d["paciente_id"] == alvo for d in (dia or {}).get("diario") or []),
            f"[aluno] 01/10: a refeição marcada e a foto do diário continuam lá ({len(dia.get('refeicoes_concluidas') or [])} · {len(dia.get('diario') or [])})")
    fotos = q(f"select path from {S}.diario_alimentar where paciente_id in ('{mf}', '{ms}') and deleted_at is null")
    for f in fotos:
        ve_aluno = B.como(aluno, S, "{s}.aluno_le_foto_diario(" + B.q(f["path"]) + ")")
        ve_prof = B.como(prof, S, "public.diario_foto_permitida('ler', " + B.q(f["path"]) + ")")
        p.check(ve_aluno is True and ve_prof is True, f"[foto] a foto do diário abre para o aluno ({ve_aluno}) e para o profissional ({ve_prof})")
    lista = B.como(prof, S, "{s}.alunos_da_conta('" + fica + "'::uuid, '{\"situacao\":\"todos\"}'::jsonb, 0, 200)")
    itens = {x["id"]: x for x in (lista or {}).get("itens") or []}
    eu = itens.get(mf) or {}
    print(f"   alunos_da_conta: contagens {lista.get('contagens')} · módulos da conta {(lista.get('conta') or {}).get('modulos')}")
    if juntada:
        p.check(sorted(eu.get("modulos") or []) == ["nutricao", "treino"] and ms not in itens,
                f"[lista] o aluno 1 vez, com Treino e Dieta ({eu.get('modulos')})")
    p7 = B.como(prof, S, "{s}.master_alunos('{\"modo\":\"p7\"}'::jsonb, 0, 200)")
    nomes_p7 = [(x.get("user_id") or "")[:8] for x in (p7 or {}).get("alunos") or []]
    tem = any(x.get("user_id") == aluno for x in (p7 or {}).get("alunos") or [])
    p.check(tem is (not juntada), f"[master] Alunos › 'Em 2 contas' {'sem' if juntada else 'com'} ele (p7: {(p7 or {}).get('total')} · {nomes_p7})")
    fat = q(f"""select (select count(*) from {S}.conta_faturas where conta_id in ('{fica}', '{sai}'))::int as faturas,
                       (select count(*) from {S}.conta_assinaturas where conta_id in ('{fica}', '{sai}'))::int as assinaturas,
                       (select count(*) from {S}.mensagens_whatsapp where paciente_id in ('{mf}', '{ms}'))::int as whats,
                       (select {S}.conta_limite_alunos('{fica}')) as limite""")[0]
    p.check(fat["faturas"] == 0 and fat["assinaturas"] == 0 and fat["whats"] == 0 and fat["limite"] is None, f"[nada nasce] {fat}")

    B.saude_ok("o Banco do Treino")
    ident = {x["pid"]: x["tid"] for x in B.sql_treino(f"""select principal_user_id::text as pid, treino_user_id::text as tid from public.physiq_identidades
                                                       where principal_user_id in ('{prof}', '{aluno}')""")}
    pt, at = ident.get(prof), ident.get(aluno)
    t = B.sql_treino(f"""select (select professor_id::text from public.physiq_profiles where id = '{at}') as prof_aluno,
                               (select conta_id::text from public.physiq_profiles where id = '{at}') as conta_aluno,
                               (select nucleo_acesso_ate::text from public.physiq_professores where id = '{pt}') as acesso""")[0]
    p.check(t["prof_aluno"] == pt and t["conta_aluno"] == fica and t["acesso"] == "2999-12-31",
            f"[Treino] o aluno com o professor e a conta de sempre; acesso do profissional {t['acesso']}")
    membros = {x["c"]: x for x in B.sql_treino(f"select conta_id::text as c, papeis, ativo from public.physiq_espelho_membros where treino_user_id = '{pt}'")}
    if juntada:
        p.check((membros.get(fica) or {}).get("papeis") == ["dono", "personal", "nutricionista"] and (membros.get(fica) or {}).get("ativo") is True
                and (membros.get(sai) or {}).get("ativo") is False, f"[Treino] espelho dos membros: {membros}")
    if a.backup:
        antes = json.loads((Path(a.backup).expanduser() / "treino.public.treino_dos_alunos.json").read_text(encoding="utf-8")).get(at, {})
        cols = sorted(antes)
        agora = {}
        for tab in cols:
            agora[tab] = B.sql_treino(f"select count(*)::int as n from public.\"{tab}\" where user_id = '{at}'")[0]["n"]
        diferentes = {k: (antes[k], agora[k]) for k in cols if antes[k] != agora[k]}
        p.check(not diferentes, f"[Treino] o treino do aluno igual ao backup ({len(cols)} tabelas; séries {agora.get('tb_treino_series')}, "
                                f"histórico {agora.get('treino_historico')}; diferenças {diferentes})")


class Guarda:
    """Bloqueia no navegador toda escrita que as telas tentarem (o painel e o app só podem LER na conta real)."""

    def __init__(self) -> None:
        self.bloqueadas: list[str] = []
        self.rpcs: set[str] = set()

    def instalar(self, ctx) -> None:
        def rota(route, request) -> None:
            u, m = request.url, request.method
            if "/rest/v1/rpc/" in u:
                self.rpcs.add(u.split("/rest/v1/rpc/")[1].split("?")[0])
            if m in ("POST", "PATCH", "PUT", "DELETE") and (
                    (ESCRITA_TABELA.search(u) and m != "GET") or ESCRITA_RPC.search(u) or "/storage/v1/object/" in u and m != "GET"):
                if "/storage/v1/object/sign/" in u:
                    route.continue_()
                    return
                self.bloqueadas.append(f"{m} {u.split('?')[0]}")
                route.abort()
                return
            route.continue_()
        for host in ("api-principal.physiqcalc.com.br", "api.physiqcalc.com.br", f"{B.PRINCIPAL_REF}.supabase.co", f"{B.TREINO_REF}.supabase.co"):
            ctx.route(f"https://{host}/**", rota)


def abrir(nav, guarda: Guarda, sess: dict, rota: str, desktop: bool, nome: str, extra: dict | None = None):
    c = B.Caso(nav, BASE, "prod", nome, desktop=desktop)
    guarda.instalar(c.ctx)
    c.pg.goto(BASE + "/privacidade", wait_until="domcontentloaded")
    c.pg.evaluate("""([k, v]) => { localStorage.setItem(k, v); localStorage.setItem('physiq_pendencia_avisada_em', new Date().toLocaleDateString('pt-BR'));
        localStorage.setItem('physiqcalc-pwa-dismissed', 'true'); }""", [B.B5.CHAVE_PRINCIPAL, json.dumps(sess)])
    for k, v in (extra or {}).items():
        c.pg.evaluate("([k, v]) => localStorage.setItem(k, v)", [k, v])
    c.pg.goto(BASE + rota, wait_until="domcontentloaded")
    if c.esperar(lambda: c.tem("[data-aviso-mudanca-ok]"), 6):
        c.pg.locator("[data-aviso-mudanca-ok]").click()  # o "visto" é gravado por RPC — a guarda bloqueia (nada muda na conta)
        c.pg.wait_for_timeout(500)
    if c.esperar(lambda: "Crie a sua senha" in c.texto(), 8):
        c.pg.get_by_role("button", name="Agora não").click()
        c.esperar(lambda: "Crie a sua senha" not in c.texto(), 15)
    return c


def telas(a) -> None:
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    B.saude_ok("os prints de produção")
    emails = {x["id"]: x["email"] for x in q(f"select id::text, email from auth.users where id in ('{a.profissional}', '{a.aluno}')")}
    antes = contar_linhas([a.profissional, a.aluno])
    sp, sa = B.sessao_magica(emails[a.profissional]), B.sessao_magica(emails[a.aluno])
    guarda = Guarda()
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        try:
            c = abrir(nav, guarda, sp, "/painel", True, "painel", {f"physiq_conta_ativa:{a.profissional}": a.conta_fica})
            try:
                ok = c.esperar(lambda: c.tem("[data-menu-lateral]") and "Alunos" in c.pg.locator("[data-menu-lateral]").inner_text(), 90)
                menu = c.pg.locator("[data-menu-lateral]").inner_text() if ok else ""
                tem = {x: x in menu for x in ("Treinos", "Dietas", "Impressos")}
                p.check(ok and all(tem.values()), f"[prod] painel: menu num acesso só {tem}")
                c.pg.wait_for_timeout(2500)
                c.pg.mouse.move(5, 5)
                c.print("painel_menu")
                c.ir("/painel/alunos")
                ok = c.esperar(lambda: c.tem("[data-linhas-alunos]") and c.pg.locator("[data-aluno-nome]").count() > 0, 90)
                if c.tem('[data-situacao-filtro="todos"]'):
                    c.pg.locator('[data-situacao-filtro="todos"]').click()
                    c.pg.wait_for_timeout(2500)
                n_ativos = c.pg.locator('[data-situacao-filtro="ativos"]').get_attribute("data-contagem") if ok else None
                n_todos = c.pg.locator('[data-situacao-filtro="todos"]').get_attribute("data-contagem") if ok else None
                minhas = c.pg.locator(f'[data-aluno-linha="{a.matricula_fica}"]').count()
                p.check(ok and minhas == 1 and c.pg.locator(f'[data-aluno-linha="{a.matricula_sai}"]').count() == 0,
                        f"[prod] Alunos: ativos {n_ativos} · todos {n_todos} · o aluno 1 vez")
                c.print("painel_alunos")
                c.pg.locator(f'[data-aluno-linha="{a.matricula_fica}"] [data-abrir-aluno]').first.click()
                ok = c.esperar(lambda: c.tem("[data-abas-aluno]"), 60)
                abas = c.pg.locator("[data-aba-aluno]").evaluate_all("els => els.map(e => e.dataset.abaAluno)") if ok else []
                p.check("treino" in abas and "dieta" in abas, f"[prod] perfil do aluno com Treino e Dieta {abas}")
                c.pg.wait_for_timeout(4000)
                c.print("painel_aluno_resumo")
                c.pg.locator('[data-aba-aluno="treino"]').click()
                ok = c.esperar(lambda: c.tem("[data-aba-treino-aluno]"), 60)
                c.pg.wait_for_timeout(5000)
                p.check(ok, "[prod] aba Treino do aluno")
                c.print("painel_aluno_treino")
                c.pg.locator('[data-aba-aluno="dieta"]').click()
                ok = c.esperar(lambda: c.tem("[data-aba-dieta-aluno]") and "Plano alimentar" in c.texto(), 60)
                p.check(ok, "[prod] aba Dieta do aluno com os planos")
                c.print("painel_aluno_dieta")
                c.ir("/painel/agenda?visao=lista")
                ok = c.esperar(lambda: c.pg.locator('[data-visao="lista"] [data-evento]').count() > 0 or c.tem("[data-lista-vazia]"), 60)
                txt = c.pg.locator('[data-visao="lista"]').inner_text() if ok else ""
                p.check(ok and "Consulta de nutrição" in txt, f"[prod] Agenda (lista do mês) com a consulta: {txt[:120]!r}")
                if ok:
                    c.pg.locator('[data-visao="lista"]').scroll_into_view_if_needed()
                c.pg.mouse.move(5, 5)
                c.print("painel_agenda")
            finally:
                c.fim()
            time.sleep(3)
            B.saude_ok("o app do aluno")
            c = abrir(nav, guarda, sa, "/dieta", False, "app_dieta")
            try:
                ok = c.esperar(lambda: "Plano" in c.texto() or "Refeições" in c.texto() or c.tem("[data-dieta-sem-plano]"), 90)
                c.pg.wait_for_timeout(3000)
                p.check(ok and not c.tem("[data-dieta-sem-plano]") and "Sua dieta aparece aqui" not in c.texto(), "[prod] app do aluno › Dieta com o plano")
                c.print("app_dieta")
            finally:
                c.fim()
            time.sleep(3)
            B.saude_ok("o Treino do app")
            c = abrir(nav, guarda, sa, "/treino", False, "app_treino")
            try:
                ok = c.esperar(lambda: c.tem("[data-aba-treino]") or "Treino" in c.texto(), 120)
                c.pg.wait_for_timeout(9000)  # o PowerSync traz o treino dele
                p.check(ok, "[prod] app do aluno › Treino")
                c.print("app_treino")
            finally:
                c.fim()
        finally:
            nav.close()
    depois = contar_linhas([a.profissional, a.aluno])
    mudou = {k: (antes.get(k), depois.get(k)) for k in sorted(set(antes) | set(depois)) if antes.get(k) != depois.get(k)}
    print(f"   escritas bloqueadas pelo navegador: {guarda.bloqueadas}")
    print(f"   RPCs que as telas chamaram: {sorted(guarda.rpcs)}")
    p.check(not mudou, f"[prod] nada mudou nas linhas dos 2 logins com as telas ({mudou})")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--estado", required=True, choices=("antes", "juntada"))
    for k in ("--profissional", "--aluno", "--conta-fica", "--conta-sai", "--matricula-fica", "--matricula-sai"):
        ap.add_argument(k, required=True)
    ap.add_argument("--backup")
    ap.add_argument("--telas", action="store_true")
    ap.add_argument("--so-telas", action="store_true")
    a = ap.parse_args()
    B.saude_ok("a conferência de produção")
    if not a.so_telas:
        api(a, a.estado)
    if a.telas or a.so_telas:
        telas(a)
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
