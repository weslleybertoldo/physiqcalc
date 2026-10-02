#!/usr/bin/env python3
"""Physiq H1 — CONFERÊNCIA em PRODUÇÃO, só leitura, depois da migração e do deploy.

  API    as 2 funções do public = as do arquivo da migração · COMO o aluno (numa transação DESFEITA — nenhuma sessão nasce): a
         consulta de nutrição dele com o papel "nutricionista" (o mesmo profissional nos 2 papéis), minha_agenda com os mesmos campos
         e sem tag, 0 linhas de agenda_tags.
  TELAS  (--telas) https://physiqcalc.com.br com sessão por link mágico da API admin (sem e-mail, sem senha): o app do aluno (Perfil ›
         Agenda: a consulta de nutrição com o PRATO, sem tag) e o Dashboard do profissional (a "Agenda de hoje": a pílula da tag, ou o
         card vazio se não houver consulta hoje; as tags lidas só por profissional_id). O navegador BLOQUEIA qualquer escrita e as linhas
         dos 2 logins são contadas antes e depois.
Uso: python3 e2e/agenda_h1/prod.py --profissional <uuid> --aluno <uuid> --conta <uuid> --consulta <uuid> [--telas | --so-telas]
Prints: ~/projetos/physiqcalc-scratch/prints/conta-unica-agenda/h1/prod_*.png
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

# a guarda de escrita, a contagem das linhas e o abrir com sessão da conferência de prod da W2 (o "_base" que ela importa é este,
# já carregado acima: os mesmos ESTADO/B5/sql_principal)
_ESPEC = importlib.util.spec_from_file_location("_prod_agenda_tags", Path(__file__).parent.parent / "agenda_tags" / "prod.py")
W2 = importlib.util.module_from_spec(_ESPEC)
_ESPEC.loader.exec_module(W2)  # type: ignore[union-attr]

S = "public"
B.ESTADO["schema"] = S
p = B.p
q = B.sql_principal
BASE = "https://physiqcalc.com.br"
MIG = Path(__file__).resolve().parents[2] / "supabase-principal" / "migrations" / "20261002173000_h1_agenda_ajustes.sql"
ICONE = {"treino": "lucide-dumbbell", "nutricao": "lucide-salad", "geral": "lucide-calendar-days"}


def corpo_do_arquivo(fn: str) -> str:
    m = re.search(r"create or replace function \{schema\}\." + re.escape(fn) + r"\(.*?\$\$(.*?)\$\$;", MIG.read_text(encoding="utf-8"), re.S)
    assert m, fn
    return m.group(1).replace("{schema}", S)


def api(a) -> None:
    for fn in ("minha_agenda", "aluno_agenda_marcar"):
        vivo = q(f"select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = '{S}' and p.proname = '{fn}'")
        p.check(len(vivo) == 1 and vivo[0]["prosrc"] == corpo_do_arquivo(fn), f"[api] public.{fn} = a do arquivo da migração do H1")
    ag = B.como(a.aluno, S, "{s}.minha_agenda(null)")
    txt = json.dumps(ag, ensure_ascii=False)
    alvo = next((x for x in ag if x.get("id") == a.consulta), None) if isinstance(ag, list) else None
    p.check(bool(alvo) and alvo["modulo"] == "nutricao" and alvo["papel"] == "nutricionista",
            f"[aluno] a consulta de nutrição dele: modulo {alvo and alvo['modulo']} · papel {alvo and alvo['papel']} (o mesmo profissional nos 2 papéis)")
    chaves = sorted({k for x in ag for k in x}) if isinstance(ag, list) else []
    p.check(chaves == ["dia_inteiro", "fim", "id", "inicio", "mes_referencia", "modulo", "origem", "paciente_id", "papel", "profissional", "profissional_id",
                       "reagendamentos", "regras", "status", "titulo"] and "tag" not in txt.lower(), f"[aluno] minha_agenda com os mesmos campos e sem tag ({len(ag)} consulta(s))")
    n = B.como(a.aluno, S, "(select count(*) from {s}.agenda_tags)")
    p.check(n == 0, f"[aluno] lê 0 linhas de agenda_tags ({n})")


def telas(a) -> None:
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    prof, aluno, conta, consulta = a.profissional, a.aluno, a.conta, a.consulta
    B.saude_ok("os prints de produção")
    emails = {x["id"]: x["email"] for x in q(f"select id::text, email from auth.users where id in ('{prof}', '{aluno}')")}
    antes = W2.contar_linhas([prof, aluno])
    sp, sa = B.sessao_magica(emails[prof]), B.sessao_magica(emails[aluno])
    guarda = W2.Guarda()
    hoje = B.B5.hoje().isoformat()
    de_hoje = q(f"""select a.id::text, t.nome as tag from public.agendamentos a left join public.agenda_tags t on t.id = a.tag_id
                    where a.deleted_at is null and not a.dia_inteiro and a.status not in ('desmarcado', 'paciente_desmarcou')
                      and timezone('America/Sao_Paulo', a.inicio)::date = '{hoje}' and (a.nutricionista_id = '{prof}' or a.conta_id = '{conta}')""")
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        try:
            # ── o app do aluno: a consulta de nutrição com o prato (antes: o halter) e sem tag
            c = W2.abrir(nav, guarda, sa, "/perfil/agenda", False, "app_aluno_agenda")
            try:
                ok = c.esperar(lambda: c.pg.locator(f'[data-agendamento="{consulta}"]').count() > 0, 120)
                li = c.pg.locator(f'[data-agendamento="{consulta}"]').first
                area = li.get_attribute("data-agendamento-area") if ok else None
                cls = (li.locator("[data-icone-area] svg").first.get_attribute("class") or "") if ok else ""
                texto = li.inner_text() if ok else ""
                p.check(ok and area == "nutricao" and ICONE["nutricao"] in cls, f"[prod] app do aluno: a consulta de nutrição com o PRATO (área {area}; {cls.split(' ')[1] if ' ' in cls else cls})")
                p.check("Nutricionista" in texto and "Personal" not in texto, f"[prod] a linha diz 'Nutricionista' ({texto!r})")
                p.check(c.pg.locator("[data-tag-pilula]").count() == 0, "[prod] app do aluno sem tag nenhuma (D4)")
                c.pg.mouse.move(5, 5)
                B.print_inteiro(c, "app_aluno_agenda_prato")
            finally:
                c.fim()
            time.sleep(3)
            B.saude_ok("o Dashboard")
            # ── o Dashboard do profissional: a "Agenda de hoje"
            c = W2.abrir(nav, guarda, sp, "/painel", True, "dashboard", {f"physiq_conta_ativa:{prof}": conta})
            respostas: list = []
            c.pg.on("response", lambda r: respostas.append(r) if "/rest/v1/agenda_tags" in r.url and r.request.method == "GET" else None)
            try:
                c.ir("/painel")
                ok = c.esperar(lambda: c.tem("[data-cartao-agenda-hoje-dashboard]") and (c.tem("[data-agenda-hoje-evento]") or c.tem('[data-bloco-vazio="agenda"]')), 120)
                c.pg.wait_for_timeout(2500)
                n_ev = c.pg.locator("[data-agenda-hoje-evento]").count()
                if de_hoje:
                    nomes = c.pg.locator("[data-agenda-hoje-evento] [data-tag-pilula]").evaluate_all("els => els.map(e => e.dataset.tagNome)")
                    p.check(ok and n_ev == len(de_hoje) and sorted(nomes) == sorted(x["tag"] for x in de_hoje),
                            f"[prod] Dashboard › Agenda de hoje com a pílula da tag de cada consulta ({nomes})")
                else:
                    p.check(ok and n_ev == 0 and c.tem('[data-bloco-vazio="agenda"]'), "[prod] Dashboard › Agenda de hoje: nenhuma consulta hoje — o card vazio (a pílula provada no staging)")
                p.check(c.pg.locator("[data-cartao-agenda-hoje-dashboard] [data-chip]").count() == 0, "[prod] sem o chip TREINO/NUTRI de antes")
                lidas = []
                for r in respostas:
                    try:
                        lidas.append((r.url, r.json()))
                    except Exception:  # noqa: BLE001
                        pass
                filtradas = bool(lidas) and all(f"profissional_id=in.%28{prof}%29" in u or f"profissional_id=in.({prof})" in u for u, _ in lidas)
                so_dele = all(isinstance(x, list) and all(t.get("profissional_id") == prof for t in x) for _, x in lidas)
                p.check(filtradas and so_dele, f"[prod] as tags lidas SÓ do profissional (o master lê todas pela RLS): {sum(len(x) for _, x in lidas if isinstance(x, list))} tag(s)")
                c.pg.locator("[data-cartao-agenda-hoje-dashboard]").scroll_into_view_if_needed()
                c.pg.mouse.move(5, 5)
                c.print("dashboard_agenda_hoje")
            finally:
                c.fim()
        finally:
            nav.close()
    depois = W2.contar_linhas([prof, aluno])
    mudou = {k: (antes.get(k), depois.get(k)) for k in sorted(set(antes) | set(depois)) if antes.get(k) != depois.get(k)}
    print(f"   escritas bloqueadas pelo navegador: {guarda.bloqueadas}")
    print(f"   RPCs que as telas chamaram: {sorted(guarda.rpcs)}")
    p.check(not mudou, f"[prod] nada mudou nas linhas dos 2 logins com as telas ({mudou})")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    for k in ("--profissional", "--aluno", "--conta", "--consulta"):
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
