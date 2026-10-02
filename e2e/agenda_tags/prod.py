#!/usr/bin/env python3
"""Physiq W2 (tags da agenda) — CONFERÊNCIA em PRODUÇÃO, só leitura, depois da migração e (com --fase ajustado) do ajuste dele.

  API    o backfill (toda consulta com a tag da área dela; 3 base por profissional com calendário ou consulta; nenhuma área trocada) ·
         as tags do profissional (as 3 prontas) · os calendários dele (fase ajustado: "Treino" com a tag Treino e padrão + "Nutrição"
         com a tag Nutrição; a consulta de nutrição viva no Nutrição) · COMO o aluno (numa transação DESFEITA — nenhuma sessão nasce):
         0 linhas de agenda_tags, a RPC agenda_garantir_tags recusa e minha_agenda / minhas_regras_agenda sem tag nenhuma.
  TELAS  (--telas) https://physiqcalc.com.br com sessão por link mágico da API admin (sem e-mail, sem senha): o painel (Agenda com o
         bloco Tags e os calendários, a consulta com a pílula, a lista, o "Novo agendamento" ABERTO e fechado SEM salvar) e a Agenda do
         app do aluno (sem tag). O navegador BLOQUEIA qualquer escrita e as linhas dos 2 logins são contadas antes e depois.
Uso: python3 e2e/agenda_tags/prod.py --fase migrada|ajustado --profissional <uuid> --aluno <uuid> --conta <uuid> [--telas | --so-telas]
Prints: ~/projetos/physiqcalc-scratch/prints/conta-unica-agenda/w2/prod_*.png
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
                         r"agenda_marcar|agenda_salvar|agenda_garantir|agenda_reservar|agendamento_|whatsapp_|mensagem_|mensagens_enviar|reagir|responder|"
                         r"aluno_agenda_confirmar|aluno_agenda_desistir|aluno_agenda_reagendar|aluno_agenda_marcar|aluno_definir_pacote)")
ESCRITA_TABELA = re.compile(r"/rest/v1/(?!rpc/)")


def contar_linhas(ids: list[str]) -> dict:
    """Quantas linhas citam cada login (toda coluna uuid do public): as telas não podem mudar nada."""
    cols = q("""select c.table_name as t, c.column_name as col from information_schema.columns c
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


def api(a) -> None:
    prof, aluno, conta = a.profissional, a.aluno, a.conta
    ajustado = a.fase == "ajustado"
    g = q("""select (select count(*) from public.agendamentos)::int as consultas,
                    (select count(*) from public.agendamentos where tag_id is null)::int as sem_tag,
                    (select count(*) from public.agendamentos a join public.agenda_tags t on t.id = a.tag_id
                      where t.area <> a.modulo or t.profissional_id <> a.nutricionista_id)::int as tag_errada,
                    (select count(*) from public.agenda_tags where base)::int as base,
                    (select count(distinct x.p) from (select nutricionista_id p from public.calendarios union select nutricionista_id from public.agendamentos) x
                       join auth.users u on u.id = x.p)::int as profs,
                    (select count(distinct profissional_id) from public.agenda_tags where base)::int as profs_com_base""")[0]
    p.check(g["sem_tag"] == 0 and g["tag_errada"] == 0, f"[backfill] toda consulta com a tag da área dela ({g['consultas']} consultas · sem tag {g['sem_tag']} · errada {g['tag_errada']})")
    p.check(g["profs_com_base"] >= g["profs"] and g["base"] == 3 * g["profs_com_base"], f"[backfill] 3 prontas por profissional ({g['base']} base · {g['profs_com_base']}/{g['profs']} profissionais)")
    tags = B.tags_de(prof)
    p.check([(t["nome"], t["cor"], t["area"], t["base"]) for t in tags[:3]] ==
            [("Treino", "#a78bfa", "treino", True), ("Nutrição", "#34d399", "nutricao", True), ("Geral", "#94a3b8", "geral", True)],
            f"[prof] as 3 prontas dele ({[(t['nome'], t['cor']) for t in tags]})")
    bt, bn = B.base_de(prof, "treino"), B.base_de(prof, "nutricao")
    cals = q(f"""select id::text, nome, cor, padrao, tag_padrao_id::text as tag, conta_id::text as conta from public.calendarios
                 where nutricionista_id = '{prof}' and deleted_at is null order by created_at""")
    vivas = q(f"""select a.id::text, c.nome as cal, a.modulo, a.tag_id::text as tag from public.agendamentos a join public.calendarios c on c.id = a.calendario_id
                  where a.nutricionista_id = '{prof}' and a.deleted_at is null order by a.inicio""")
    if ajustado:
        nomes = {c["nome"]: c for c in cals}
        p.check(set(nomes) == {"Treino", "Nutrição"} and nomes["Treino"]["tag"] == bt and nomes["Treino"]["padrao"] and nomes["Nutrição"]["tag"] == bn
                and not nomes["Nutrição"]["padrao"] and all(c["conta"] == conta for c in cals),
                f"[prof] calendários: Treino (tag Treino, padrão) + Nutrição (tag Nutrição) na conta dele ({[(c['nome'], c['cor']) for c in cals]})")
        p.check(all(v["cal"] == ("Nutrição" if v["modulo"] == "nutricao" else "Treino") for v in vivas) and vivas,
                f"[prof] as consultas vivas de nutrição no Nutrição ({vivas})")
        p.check(all(v["tag"] == (bn if v["modulo"] == "nutricao" else bt if v["modulo"] == "treino" else v["tag"]) for v in vivas),
                "[prof] a consulta com a tag Nutrição (a área dela)")
    else:
        p.check([c["nome"] for c in cals] == ["Calendário principal"], f"[prof] antes do ajuste: o 'Calendário principal' ({cals})")
    # COMO o aluno (transação desfeita): nada da tag
    n = B.como(aluno, S, "(select count(*) from {s}.agenda_tags)")
    p.check(n == 0, f"[aluno] lê 0 linhas de agenda_tags ({n})")
    g2 = B.como(aluno, S, "{s}.agenda_garantir_tags()")
    p.check(isinstance(g2, dict) and g2.get("ok") is False and g2.get("erro") == "sem_acesso", f"[aluno] agenda_garantir_tags recusa ({g2})")
    ag = B.como(aluno, S, "{s}.minha_agenda(null)")
    txt = json.dumps(ag, ensure_ascii=False)
    p.check(isinstance(ag, list) and "tag" not in txt.lower(), f"[aluno] minha_agenda sem tag ({len(ag) if isinstance(ag, list) else ag} consulta(s))")
    rg = B.como(aluno, S, "{s}.minhas_regras_agenda()")
    p.check("tag" not in json.dumps(rg).lower(), "[aluno] minhas_regras_agenda sem tag")


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
            escrita = m in ("POST", "PATCH", "PUT", "DELETE") and (
                (ESCRITA_TABELA.search(u) and m != "GET") or ESCRITA_RPC.search(u) or ("/storage/v1/object/" in u and "/storage/v1/object/sign/" not in u)
                or "/functions/v1/agenda-avisar" in u)
            if escrita:
                self.bloqueadas.append(f"{m} {u.split('?')[0]}")
                route.abort()
                return
            route.continue_()
        for host in ("api-principal.physiqcalc.com.br", "api.physiqcalc.com.br", f"{B.PRINCIPAL_REF}.supabase.co", f"{B.TREINO_REF}.supabase.co"):
            ctx.route(f"https://{host}/**", rota)


def abrir(nav, guarda: Guarda, sess: dict, rota: str, desktop: bool, nome: str, extra: dict | None = None):
    c = B.B5.Caso(nav, BASE, "prod", nome, desktop=desktop)
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

    prof, aluno, conta = a.profissional, a.aluno, a.conta
    B.saude_ok("os prints de produção")
    emails = {x["id"]: x["email"] for x in q(f"select id::text, email from auth.users where id in ('{prof}', '{aluno}')")}
    antes = contar_linhas([prof, aluno])
    sp, sa = B.sessao_magica(emails[prof]), B.sessao_magica(emails[aluno])
    guarda = Guarda()
    cal_nutri = (q(f"select id::text from public.calendarios where nutricionista_id = '{prof}' and nome = 'Nutrição' and deleted_at is null") or [{}])[0].get("id")
    consulta = (q(f"""select a.id::text, timezone('America/Sao_Paulo', a.inicio)::date::text as dia from public.agendamentos a
                      where a.nutricionista_id = '{prof}' and a.deleted_at is null and a.modulo = 'nutricao' order by a.inicio desc limit 1""") or [{}])[0]
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        try:
            dia = consulta.get("dia")
            c = abrir(nav, guarda, sp, f"/painel/agenda?visao=semana&data={dia}", True, "agenda", {f"physiq_conta_ativa:{prof}": conta})
            try:
                ok = c.esperar(lambda: c.pg.locator("[data-tags-minhas] [data-tag-item]").count() >= 3 and c.pg.locator("[data-calendario]").count() >= 1, 120)
                nomes = c.pg.locator("[data-tags-minhas] [data-tag-item-nome]").evaluate_all("els => els.map(e => e.textContent)") if ok else []
                p.check(ok and nomes[:3] == ["Treino", "Nutrição", "Geral"], f"[prod] Agenda com o bloco Tags e as 3 prontas ({nomes})")
                cals = c.pg.locator("[data-calendario]").evaluate_all("els => els.map(e => e.innerText.trim())")
                p.check(any("Treino" in x for x in cals) and any("Nutrição" in x for x in cals), f"[prod] 'Meus calendários': Treino e Nutrição ({cals})")
                ok = c.esperar(lambda: c.tem(f'[data-evento="{consulta.get("id")}"]'), 60)
                pil = c.pg.locator(f'[data-evento="{consulta.get("id")}"] [data-tag-pilula]').get_attribute("data-tag-nome") if ok else None
                cal_ev = c.pg.locator(f'[data-evento="{consulta.get("id")}"]').get_attribute("data-calendario-evento") if ok else None
                p.check(ok and pil == "Nutrição" and cal_ev == cal_nutri, f"[prod] a consulta dele com a pílula Nutrição, no calendário Nutrição ({pil})")
                c.pg.locator("[data-aside-agenda]").scroll_into_view_if_needed()
                c.pg.mouse.move(5, 5)
                c.print("agenda_tags_calendarios")
                c.pg.set_viewport_size({"width": 1920, "height": 1080})
                c.pg.wait_for_timeout(1000)
                vis = c.pg.locator(f'[data-evento="{consulta.get("id")}"] [data-tag-pilula]').inner_text() if ok else ""
                p.check(vis == "Nutrição", f"[prod] tela larga: a pílula com o nome inteiro ('{vis}')")
                c.pg.locator('[data-visao="semana"]').scroll_into_view_if_needed()
                c.print("consulta_pilula_1920")
                c.pg.set_viewport_size({"width": 1280, "height": 883})
                c.ir(f"/painel/agenda?visao=lista&data={dia}")
                ok = c.esperar(lambda: c.tem(f'[data-visao="lista"] [data-evento="{consulta.get("id")}"] [data-tag-pilula]'), 60)
                lt = c.pg.locator(f'[data-visao="lista"] [data-evento="{consulta.get("id")}"] [data-tag-pilula]').inner_text() if ok else ""
                p.check(ok and lt.upper() == "NUTRIÇÃO", f"[prod] lista: a consulta com a pílula ({lt})")
                c.pg.locator('[data-visao="lista"]').scroll_into_view_if_needed()
                c.print("lista")
                # o "Novo agendamento" ABERTO (nada é salvo: fecha no Esc) — as tags dele como chips
                c.pg.locator("[data-btn-novo-agendamento]").click()
                ok = c.esperar(lambda: c.tem('[data-modal-agendamento="novo"]') and c.tem("[data-campo-tag]"), 30)
                chips = c.pg.locator("[data-tag-btn]").evaluate_all("els => els.map(e => e.dataset.tagBtnNome)") if ok else []
                marcada = c.pg.locator("[data-campo-tag]").get_attribute("data-campo-tag") if ok else None
                bt = B.base_de(prof, "treino")
                p.check(ok and chips[:3] == ["Treino", "Nutrição", "Geral"] and marcada == bt,
                        f"[prod] Novo agendamento aberto: chips {chips} · no calendário padrão (Treino) vem a tag Treino")
                c.pg.wait_for_timeout(1200)
                c.print("agendamento_dialog_sem_salvar")
                c.pg.keyboard.press("Escape")
                p.check(c.esperar(lambda: not c.tem("[data-modal-agendamento]"), 10), "[prod] fechado sem salvar")
            finally:
                c.fim()
            time.sleep(3)
            B.saude_ok("o app do aluno")
            c = abrir(nav, guarda, sa, "/perfil/agenda", False, "app_aluno_agenda")
            try:
                ok = c.esperar(lambda: c.tem("[data-pagina-agenda]"), 120)
                c.pg.wait_for_timeout(3000)
                txt = c.texto()
                p.check(ok and c.pg.locator("[data-tag-pilula]").count() == 0, "[prod] app do aluno › Agenda sem tag nenhuma")
                c.print("app_aluno_agenda")
                _ = txt
            finally:
                c.fim()
        finally:
            nav.close()
    depois = contar_linhas([prof, aluno])
    mudou = {k: (antes.get(k), depois.get(k)) for k in sorted(set(antes) | set(depois)) if antes.get(k) != depois.get(k)}
    print(f"   escritas bloqueadas pelo navegador: {guarda.bloqueadas}")
    print(f"   RPCs que as telas chamaram: {sorted(guarda.rpcs)}")
    p.check(not mudou, f"[prod] nada mudou nas linhas dos 2 logins com as telas ({mudou})")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--fase", required=True, choices=("migrada", "ajustado"))
    for k in ("--profissional", "--aluno", "--conta"):
        ap.add_argument(k, required=True)
    ap.add_argument("--telas", action="store_true")
    ap.add_argument("--so-telas", action="store_true")
    a = ap.parse_args()
    B.saude_ok("a conferência de produção")
    if not a.so_telas:
        api(a)
    if a.telas or a.so_telas:
        telas(a)
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
