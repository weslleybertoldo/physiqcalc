#!/usr/bin/env python3
"""Physiq H1 (ajustes da agenda achados na W2) — E2E das telas e do banco, em série, contexto limpo por caso (painel 1280 × 883 × 2;
app 390 × 844 × 3,4). A massa: python3 e2e/agenda_h1/massa.py (antes).

  app_agenda    a Iara (o Hugo é o personal E a nutri dela) na Perfil › Agenda: nutrição → prato, treino → halter, geral → calendário
                (a ÁREA vence o papel), a de nutrição de ontem nas "Anteriores" com o prato; o papel da linha pela área ("Nutricionista"
                na de nutrição); nenhuma tag (D4).
  app_inicio    o Início › próxima consulta: a cor do chip pela área da consulta (e o papel pela área).
  dashboard     o Hugo no Painel › Dashboard: a "Agenda de hoje" com a pílula da TAG de cada consulta (Nutrição, a "Reunião" nova e a
                "Avaliação H1"), na cor dela, sem o chip TREINO/NUTRI; as tags lidas só por profissional_id e nada gravado.
  tag_padrao    o Hugo põe a "Avaliação H1" como "Tag padrão" do calendário "Treino" (o padrão — o que o aluno usa para marcar).
  marcar        a Iara marca a consulta do pacote pelo app → nasce com a tag padrão do calendário (Avaliação H1, área treino, "Consulta
                de treino"); a resposta da função e o app sem tag nenhuma; a consulta nova com o halter.
  painel_marcada  a consulta que a Iara marcou, no painel do Hugo, com a pílula "Avaliação H1".
  negativos     a Iara lê 0 linhas de agenda_tags; minha_agenda e minhas_regras_agenda sem tag; aluno_compromissos sem tag.
Uso: python3 e2e/agenda_h1/telas.py --base http://localhost:5173 --prefixo local [--casos a,b]
     (staging: --base https://physiqcalc-staging.vercel.app --prefixo staging)
Prints: ~/projetos/physiqcalc-scratch/prints/conta-unica-agenda/h1/<prefixo>_*.png
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

from playwright.sync_api import sync_playwright  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
p = B.p
q = B.q
CASOS: dict[str, object] = {}
E: dict = {}
ICONE = {"treino": "lucide-dumbbell", "nutricao": "lucide-salad", "geral": "lucide-calendar-days"}
ROTULO = {"treino": "Personal trainer", "nutricao": "Nutricionista"}


def caso(fn):
    CASOS[fn.__name__.replace("caso_", "")] = fn
    return fn


def m() -> dict:
    return E["massa"]


def esperar_db(sql: str, timeout: float = 30) -> list:
    t0 = time.time()
    while time.time() - t0 < timeout:
        r = B.sql_principal(sql)
        if r:
            return r
        time.sleep(1)
    return []


def abrir(nav, nome: str, conta: str, rota: str, esperar: str, desktop: bool = True):
    c = B.B5.Caso(nav, E["base"], E["prefixo"], nome, desktop=desktop)
    c.entrar(conta, rota)
    c.fechar_avisos()
    if c.esperar(lambda: "Crie a sua senha" in c.texto(), 6):
        c.pg.get_by_role("button", name="Agora não").click()
        c.esperar(lambda: "Crie a sua senha" not in c.texto(), 15)
    ok = c.esperar(lambda: c.tem(esperar), 120)
    p.check(ok, f"[{nome}] {rota} abriu já logado ({esperar})")
    return c


def icone_da_linha(c, ag_id: str) -> tuple[str | None, str]:
    li = c.pg.locator(f'[data-agendamento="{ag_id}"]').first
    if not li.count():
        return None, ""
    return li.get_attribute("data-agendamento-area"), li.locator("[data-icone-area] svg").first.get_attribute("class") or ""


# ───────────────────────── 1. o app do aluno: o ícone pela área ─────────────────────────

@caso
def caso_app_agenda(nav):
    ag = m()["ag"]
    c = abrir(nav, "app_agenda", B.ALUNO, "/perfil/agenda", "[data-pagina-agenda]", desktop=False)
    ok = c.esperar(lambda: all(c.pg.locator(f'[data-agendamento="{ag[k]}"]').count() for k in ("nutri", "treino", "geral", "passada")), 60)
    p.check(ok, "[app_agenda] as consultas da Iara na Agenda do app (próximas e anteriores)")
    for k, area in (("nutri", "nutricao"), ("treino", "treino"), ("geral", "geral"), ("passada", "nutricao"), ("hoje_avaliacao", "treino")):
        a, cls = icone_da_linha(c, ag[k])
        p.check(a == area and ICONE[area] in cls, f"[app_agenda] {k}: área {a} → {ICONE[area].replace('lucide-', '')} ({cls.split(' ')[1] if ' ' in cls else cls})")
    lista = c.pg.locator(f'[data-agendamento="{ag["passada"]}"]').first.evaluate("e => e.closest('[data-agenda-lista]')?.dataset.agendaLista")
    p.check(lista == "anteriores", f"[app_agenda] a de nutrição de ontem nas Anteriores ({lista}), com o prato (o caso do print de prod da W2)")
    # o papel da linha pela área (o mesmo profissional nos 2 papéis — o banco do H1)
    tn = c.pg.locator(f'[data-agendamento="{ag["nutri"]}"]').first.inner_text()
    tt = c.pg.locator(f'[data-agendamento="{ag["treino"]}"]').first.inner_text()
    tg = c.pg.locator(f'[data-agendamento="{ag["geral"]}"]').first.inner_text()
    p.check("Hugo Ambos H1 · Nutricionista" in tn and "pela nutricionista" in tn.lower(), f"[app_agenda] nutrição: 'Nutricionista' e 'Confirmado pela nutricionista' ({tn!r})")
    p.check("Hugo Ambos H1 · Personal trainer" in tt and "pelo personal" in tt.lower(), f"[app_agenda] treino: 'Personal trainer' ({tt!r})")
    p.check("Hugo Ambos H1" in tg and "Personal" not in tg and "Nutricionista" not in tg and "pelo profissional" in tg.lower(),
            f"[app_agenda] geral: sem papel ('Confirmado pelo profissional') ({tg!r})")
    txt = c.texto()
    p.check(c.pg.locator("[data-tag-pilula]").count() == 0 and "Avaliação H1" not in txt and "Reunião" not in txt, "[app_agenda] nenhuma tag no app (D4)")
    c.pg.mouse.move(5, 5)
    B.print_inteiro(c, "app_aluno_agenda_icones")
    c.fim()


@caso
def caso_app_inicio(nav):
    ag = m()["ag"]
    agora = dt.datetime.now(dt.timezone.utc).isoformat()
    prox = B.sql_principal(f"""select id::text, modulo from {S}.agendamentos where paciente_id = {q(m()['matricula'])} and deleted_at is null
                               and fim >= {q(agora)} and status not in ('desmarcado', 'paciente_desmarcou') order by inicio limit 1""")
    c = abrir(nav, "app_inicio", B.ALUNO, "/", "[data-card-consulta]", desktop=False)
    ok = c.esperar(lambda: c.tem('[data-card-consulta="proxima"]'), 60)
    if ok and prox:
        area = prox[0]["modulo"]
        id_card = c.pg.locator('[data-card-consulta="proxima"]').get_attribute("data-consulta-id")
        tom = c.pg.locator("[data-consulta-em]").get_attribute("data-chip")
        quando = c.pg.locator("[data-consulta-quando]").inner_text()
        esperado = {"nutricao": "n", "treino": "t", "geral": "c"}[area]
        p.check(id_card == prox[0]["id"] and tom == esperado, f"[app_inicio] a próxima ({area}) com o chip da área: '{tom}' (esperado '{esperado}')")
        if area in ROTULO:
            p.check(quando.startswith(ROTULO[area]), f"[app_inicio] o papel pela área: {quando!r}")
        E["inicio_area"] = area
    else:
        p.check(False, f"[app_inicio] o card da próxima consulta ({prox})")
    _ = ag
    c.print("app_aluno_inicio_proxima")
    c.fim()


# ───────────────────────── 2. o Dashboard: a pílula da TAG ─────────────────────────

@caso
def caso_dashboard(nav):
    ag, hugo = m()["ag"], m()["hugo"]
    c = abrir(nav, "dashboard", B.AMBOS, "/painel", "[data-pagina-dashboard]")
    pedidos: list[tuple[str, str]] = []
    c.pg.on("request", lambda r: pedidos.append((r.method, r.url)) if "/rest/v1/" in r.url else None)
    c.ir("/painel")
    ok = c.esperar(lambda: c.pg.locator("[data-cartao-agenda-hoje-dashboard] [data-agenda-hoje-evento]").count() >= 3, 90)
    p.check(ok, "[dashboard] a 'Agenda de hoje' com as 3 consultas de hoje")
    esperado = {"hoje_nutri": ("Nutrição", "#34d399", m()["base"]["nutricao"]), "hoje_reuniao": ("Reunião", "#f472b6", m()["reuniao"]),
                "hoje_avaliacao": ("Avaliação H1", "#fb923c", m()["avaliacao"])}
    for k, (nome, cor, tag) in esperado.items():
        linha = c.pg.locator(f'[data-agenda-hoje-evento="{ag[k]}"]')
        if not linha.count():
            p.check(False, f"[dashboard] {k} na lista")
            continue
        pil = linha.locator("[data-tag-pilula]")
        n, fundo, tid = pil.get_attribute("data-tag-nome"), pil.evaluate("e => e.style.background"), linha.get_attribute("data-agenda-hoje-tag")
        p.check(n == nome and B.RGB[cor] in fundo and tid == tag, f"[dashboard] {k}: a pílula '{n}' na cor dela ({fundo})")
    card = c.pg.locator("[data-cartao-agenda-hoje-dashboard]")
    txt = card.inner_text()
    p.check(card.locator("[data-chip]").count() == 0 and "TREINO" not in txt.replace("Treino", "") and "NUTRI\n" not in txt,
            "[dashboard] sem o chip TREINO/NUTRI de antes")
    lidos = [u for (mt, u) in pedidos if "/rest/v1/agenda_tags" in u and mt == "GET"]
    p.check(bool(lidos) and all(f"profissional_id=in.%28{hugo}%29" in u or f"profissional_id=in.({hugo})" in u for u in lidos),
            f"[dashboard] as tags lidas SÓ por profissional_id ({[u.split('?')[1][:90] for u in lidos][:2]})")
    gravou = [f"{mt} {u.split('?')[0][-50:]}" for (mt, u) in pedidos if mt in ("POST", "PATCH", "DELETE", "PUT") and ("agenda_tags" in u or "agenda_garantir" in u or "calendarios" in u)]
    p.check(not gravou, f"[dashboard] o Dashboard não grava tag nem calendário ({gravou})")
    card.scroll_into_view_if_needed()
    c.pg.mouse.move(5, 5)
    c.print("dashboard_agenda_hoje")
    c.fim()


# ───────────────────────── 3. a consulta que o aluno marca: a tag padrão do calendário ─────────────────────────

@caso
def caso_tag_padrao(nav):
    cal, aval = m()["cal_treino"], m()["avaliacao"]
    # o ponto de partida: o "Treino" com a tag padrão Treino (como nasce)
    B.sql_principal(f"update {S}.calendarios set tag_padrao_id = {q(m()['base']['treino'])} where id = {q(cal)}")
    c = abrir(nav, "tag_padrao", B.AMBOS, "/painel/agenda", "[data-pagina-agenda-painel]")
    c.esperar(lambda: c.tem(f'[data-btn-editar-calendario="{cal}"]'), 60)
    c.esperar(lambda: c.pg.locator("[data-tags-minhas] [data-tag-item]").count() >= 5, 60)
    c.pg.locator(f'[data-btn-editar-calendario="{cal}"]').click()
    p.check(c.esperar(lambda: c.tem('[data-modal-calendario="editar"]'), 20), "[tag_padrao] editar o calendário Treino")
    c.pg.locator("[data-campo-tag-padrao]").select_option(aval)
    c.pg.wait_for_timeout(300)
    c.print("calendario_treino_tag_padrao")
    c.pg.locator("[data-btn-salvar-calendario]").click()
    r = esperar_db(f"select tag_padrao_id::text as t, padrao from {S}.calendarios where id = {q(cal)} and tag_padrao_id = {q(aval)}", 20)
    p.check(bool(r) and r[0]["padrao"], "[tag_padrao] o 'Treino' (o calendário padrão) ficou com a tag padrão 'Avaliação H1'")
    c.fim()


@caso
def caso_marcar(nav):
    hugo, mat, aval, cal = m()["hugo"], m()["matricula"], m()["avaliacao"], m()["cal_treino"]
    antes = {x["id"] for x in B.sql_principal(f"select id::text from {S}.agendamentos where paciente_id = {q(mat)}")}
    c = abrir(nav, "marcar", B.ALUNO, "/perfil/agenda", "[data-pagina-agenda]", desktop=False)
    ok = c.esperar(lambda: c.tem(f'[data-btn-marcar="{hugo}"]'), 60)
    p.check(ok, "[marcar] o cartão do pacote com 'Marcar consulta'")
    c.pg.locator(f'[data-btn-marcar="{hugo}"]').click()
    ok = c.esperar(lambda: c.tem("[data-sheet-marcar]") and c.pg.locator("[data-horario-livre]").count() > 0, 60)
    p.check(ok, "[marcar] a folha com os horários livres do pacote")
    hora = c.pg.locator("[data-horario-livre]").first.get_attribute("data-horario-livre")
    c.pg.locator("[data-horario-livre]").first.click()
    c.pg.wait_for_timeout(300)
    folha = c.pg.locator("[data-sheet-marcar]").inner_text()
    p.check("Avaliação H1" not in folha and "tag" not in folha.lower(), "[marcar] a folha sem tag")
    c.print("app_aluno_marcar_pacote")
    with c.pg.expect_response(lambda r: "/rpc/aluno_agenda_marcar" in r.url and r.request.method == "POST", timeout=30000) as info:
        c.pg.locator("[data-marcar-confirmar]").click()
    resp = info.value.json()
    p.check(isinstance(resp, dict) and resp.get("ok") is True and set(resp) == {"ok", "id", "inicio", "fim"},
            f"[marcar] a função respondeu só ok/id/inicio/fim (sem tag) ({resp})")
    nova = esperar_db(f"""select id::text, tag_id::text as tag, modulo, titulo, origem, status, calendario_id::text as cal from {S}.agendamentos
                         where paciente_id = {q(mat)} and origem = 'aluno' and deleted_at is null and id = {q((resp or {}).get('id'))}""", 20)
    n = nova[0] if nova else {}
    p.check(bool(n) and n["id"] not in antes and n["tag"] == aval and n["modulo"] == "treino" and n["titulo"] == "Consulta de treino"
            and n["cal"] == cal and n["status"] == "paciente_confirmou",
            f"[marcar] a consulta nasceu com a tag padrão do calendário (Avaliação H1 → treino, 'Consulta de treino', no Treino) ({n})")
    E["marcada"] = n.get("id")
    E["marcada_dia"] = (B.sql_principal(f"select timezone('America/Sao_Paulo', inicio)::date::text as d from {S}.agendamentos where id = {q(n.get('id'))}") or [{}])[0].get("d")
    ok = c.esperar(lambda: c.pg.locator(f'[data-agendamento="{n.get("id")}"]').count() > 0, 30)
    a, cls = icone_da_linha(c, n.get("id") or "-")
    p.check(ok and a == "treino" and ICONE["treino"] in cls, f"[marcar] no app: a consulta nova com o halter (área {a})")
    txt = c.texto()
    p.check(c.pg.locator("[data-tag-pilula]").count() == 0 and "Avaliação H1" not in txt, "[marcar] e o aluno continua sem ver tag nenhuma")
    _ = hora
    c.pg.mouse.move(5, 5)
    B.print_inteiro(c, "app_aluno_marcada_sem_tag")
    c.fim()


@caso
def caso_painel_marcada(nav):
    ag_id, dia = E.get("marcada"), E.get("marcada_dia")
    if not ag_id or not dia:
        p.check(False, "[painel_marcada] sem a consulta marcada pelo aluno (rode o caso marcar antes)")
        return
    c = abrir(nav, "painel_marcada", B.AMBOS, f"/painel/agenda?visao=semana&data={dia}", "[data-pagina-agenda-painel]")
    ok = c.esperar(lambda: c.tem(f'[data-evento="{ag_id}"] [data-tag-pilula][data-tag-nome="Avaliação H1"]'), 60)
    p.check(ok, "[painel_marcada] no painel do Hugo a consulta que a Iara marcou com a pílula 'Avaliação H1'")
    c.pg.set_viewport_size({"width": 1920, "height": 1080})
    c.pg.wait_for_timeout(1000)
    vis = c.pg.locator(f'[data-evento="{ag_id}"] [data-tag-pilula]').inner_text() if ok else ""
    p.check(vis == "Avaliação H1", f"[painel_marcada] tela larga: o nome inteiro da tag ('{vis}')")
    c.pg.locator('[data-visao="semana"]').scroll_into_view_if_needed()
    c.pg.mouse.move(5, 5)
    c.print("painel_consulta_do_aluno_com_tag")
    c.fim()


# ───────────────────────── negativos (REST e funções) ─────────────────────────

@caso
def caso_negativos(nav):  # noqa: ARG001 — sem navegador
    mat, hugo = m()["matricula"], m()["hugo"]
    ti = B.token(B.ALUNO)
    st, r = B.rest(ti, "agenda_tags?select=*", schema_=S)
    p.check(st == 200 and r == [], f"[neg] a aluna lê 0 linhas de agenda_tags pela REST ({st}, {r})")
    st, r = B.rest(ti, f"agenda_tags?select=*&profissional_id=eq.{hugo}", schema_=S)
    p.check(st == 200 and r == [], f"[neg] nem filtrando pelo profissional dela ({st}, {r})")
    st, r = B.rpc_token(ti, "minha_agenda", {"p_desde": None}, S)
    txt = json.dumps(r, ensure_ascii=False)
    chaves = sorted({k for x in (r or []) for k in x}) if isinstance(r, list) else []
    p.check(st == 200 and isinstance(r, list) and len(r) >= 5 and "tag" not in txt.lower() and "Avaliação H1" not in txt and "Reunião" not in txt,
            f"[neg] minha_agenda sem tag ({len(r) if isinstance(r, list) else r} consultas)")
    p.check(chaves == ["dia_inteiro", "fim", "id", "inicio", "mes_referencia", "modulo", "origem", "paciente_id", "papel", "profissional", "profissional_id",
                       "reagendamentos", "regras", "status", "titulo"], f"[neg] minha_agenda com os MESMOS campos de antes ({chaves})")
    papeis = {x["modulo"]: x["papel"] for x in r} if isinstance(r, list) else {}
    p.check(papeis.get("nutricao") == "nutricionista" and papeis.get("treino") == "personal" and "geral" in papeis and papeis["geral"] is None,
            f"[neg] o papel pela área (o mesmo profissional nos 2 papéis): {papeis}")
    st, r = B.rpc_token(ti, "minhas_regras_agenda", {}, S)
    p.check(st == 200 and "tag" not in json.dumps(r).lower(), "[neg] minhas_regras_agenda sem tag")
    th = B.token(B.AMBOS)
    st, r = B.rpc_token(th, "aluno_compromissos", {"p_aluno": mat}, S)
    txt = json.dumps(r, ensure_ascii=False)
    p.check(st == 200 and isinstance(r, dict) and len(r.get("consultas") or []) >= 3 and "tag" not in txt.lower() and "Avaliação H1" not in txt,
            f"[neg] aluno_compromissos (o painel) sem a tag ({len((r or {}).get('consultas') or [])} consultas)")


ORDEM = ["app_agenda", "app_inicio", "dashboard", "tag_padrao", "marcar", "painel_marcada", "negativos"]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", required=True)
    ap.add_argument("--prefixo", required=True)
    ap.add_argument("--casos", default=",".join(ORDEM))
    a = ap.parse_args()
    E.update(base=a.base.rstrip("/"), prefixo=a.prefixo, massa=B.ids())
    estado = B.SCRATCH / f"estado_{a.prefixo}.json"
    if estado.exists() and a.casos != ",".join(ORDEM):
        E.update({k: v for k, v in json.loads(estado.read_text()).items() if k not in ("base", "prefixo", "massa")})
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        try:
            for nome in a.casos.split(","):
                B.saude_ok(f"o caso {nome}")
                print(f"\n── {nome}", flush=True)
                try:
                    CASOS[nome](nav)
                except Exception as e:  # noqa: BLE001
                    p.check(False, f"[{nome}] exceção: {e!r}"[:400])
                    caso_atual = B.ESTADO.get("caso")
                    if caso_atual:
                        caso_atual.diagnostico()
                        try:
                            caso_atual.ctx.close()
                        except Exception:  # noqa: BLE001
                            pass
                estado.write_text(json.dumps({k: v for k, v in E.items() if k not in ("massa",)}, indent=1, default=str))
                time.sleep(1.5)
        finally:
            nav.close()
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
