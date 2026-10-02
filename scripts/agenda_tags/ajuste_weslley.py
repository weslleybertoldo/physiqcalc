#!/usr/bin/env python3
"""Physiq W2 (tags da agenda, 02/10/2026; spec §5 "Ajuste só dele") — os calendários do profissional que é personal E nutri e já
tinha 1 "Calendário principal" (o Weslley: a regra nova "nasce com 2" só vale para quem entra SEM calendário):

  1. o "Calendário principal" vira "Treino" (tag padrão = a base Treino dele; cor, faixa, slot e "padrão" ficam);
  2. nasce o "Nutrição" na mesma conta (verde, tag padrão = a base Nutrição, a mesma faixa do principal, sem ser o padrão);
  3. as consultas VIVAS dele de área nutrição (deleted_at nulo, modulo = 'nutricao') que estão no principal passam para o Nutrição.
Nada mais muda: nem horário, status, aluno, tag ou área de consulta nenhuma (só o calendario_id das de nutrição), nem outra conta.
Mudar o calendário não avisa o aluno (o sino/e-mail só olham início, status e exclusão) e as tags já vêm do backfill da migração
20261002150000_agenda_tags.sql (o script recusa se as base não existirem).

Uso (cada modo é UM bloco no banco — tudo ou nada; backup JSON das linhas dele antes de qualquer modo):
  python3 scripts/agenda_tags/ajuste_weslley.py --schema public --dry-run          o que faria (o bloco com ROLLBACK)
  python3 scripts/agenda_tags/ajuste_weslley.py --schema public --aplicar --sim     aplica (COMMIT) e grava o relatório
  python3 scripts/agenda_tags/ajuste_weslley.py --schema public --desfazer <pasta do backup-aplicar-…> [--sim]   volta (sem --sim = prévia)
  --profissional / --conta (padrão: o Weslley — bertoldo.code e a conta Treino + Nutrição dele) · --pasta (padrão
  ~/backups/physiq/2026-10-02-w2-agenda-tags/<schema>). Idempotente: depois de aplicado, responde "já ajustado" e não muda nada.
Sem segredo no repositório: PAT em ~/.pc-pat (Management API).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "virada"))
from _base import PRINCIPAL_REF, http, lit, pat, sql_principal  # noqa: E402

PROFISSIONAL = "1ddcadb8-c727-4783-84da-0ddab580532b"  # bertoldo.code (master)
CONTA = "cb3ae70c-a705-4bd8-96a8-6e7e5153e110"  # "Weslley Bertoldo" — Treino + Nutrição desde a W1
PASTA_PADRAO = Path.home() / "backups" / "physiq" / "2026-10-02-w2-agenda-tags"
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
COR_NUTRI = "#34d399"


def bloco(s: str, prof: str, conta: str, simular: bool) -> str:
    """O ajuste num bloco só. Termina com raise 'W2_AJUSTE <json>' (simulação: o bloco inteiro volta) ou 'W2_FEITO <json>' depois do
    commit (o relatório)."""
    fim = "raise exception 'W2_AJUSTE %', r::text;" if simular else "perform set_config('w2.ajuste', r::text, true);"
    return f"""
do $aj$
declare
  r jsonb;
  v_t uuid;
  v_n uuid;
  v_princ {s}.calendarios%rowtype;
  v_cal_nutri uuid;
  v_movidas uuid[];
  v_qtd int;
begin
  select id into v_t from {s}.agenda_tags where profissional_id = {lit(prof)} and base and area = 'treino';
  select id into v_n from {s}.agenda_tags where profissional_id = {lit(prof)} and base and area = 'nutricao';
  if v_t is null or v_n is null then
    raise exception 'sem_tags_base (rode a migração 20261002150000_agenda_tags.sql antes)';
  end if;
  -- já ajustado: "Treino" com a tag Treino + "Nutrição" com a tag Nutrição, vivos, na conta
  if exists (select 1 from {s}.calendarios where nutricionista_id = {lit(prof)} and conta_id = {lit(conta)} and deleted_at is null
              and nome = 'Treino' and tag_padrao_id = v_t)
     and exists (select 1 from {s}.calendarios where nutricionista_id = {lit(prof)} and conta_id = {lit(conta)} and deleted_at is null
                  and nome = 'Nutrição' and tag_padrao_id = v_n) then
    r := jsonb_build_object('ja_ajustado', true);
    {fim}
    return;
  end if;
  select count(*) into v_qtd from {s}.calendarios
   where nutricionista_id = {lit(prof)} and conta_id = {lit(conta)} and deleted_at is null and nome = 'Calendário principal';
  if v_qtd <> 1 then
    raise exception 'esperava 1 "Calendário principal" vivo do profissional na conta e achei %', v_qtd;
  end if;
  select * into v_princ from {s}.calendarios
   where nutricionista_id = {lit(prof)} and conta_id = {lit(conta)} and deleted_at is null and nome = 'Calendário principal' for update;
  r := jsonb_build_object('antes', jsonb_build_object(
         'calendarios', (select jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'cor', c.cor, 'padrao', c.padrao, 'tag_padrao_id', c.tag_padrao_id)
                                          order by c.created_at)
                           from {s}.calendarios c where c.nutricionista_id = {lit(prof)} and c.deleted_at is null),
         'consultas', (select jsonb_object_agg(a.id, jsonb_build_object('calendario_id', a.calendario_id, 'modulo', a.modulo, 'tag_id', a.tag_id,
                                                                         'inicio', a.inicio, 'status', a.status, 'paciente_id', a.paciente_id))
                         from {s}.agendamentos a where a.nutricionista_id = {lit(prof)} and a.deleted_at is null)));
  -- 1. o principal vira "Treino" (tag padrão Treino)
  update {s}.calendarios set nome = 'Treino', tag_padrao_id = v_t where id = v_princ.id;
  -- 2. nasce o "Nutrição" (verde, tag padrão Nutrição, a mesma faixa e o mesmo slot do principal, sem ser o padrão)
  insert into {s}.calendarios (nutricionista_id, conta_id, nome, cor, padrao, faixa_inicio, faixa_fim, slot_minutos, tag_padrao_id)
  values ({lit(prof)}, {lit(conta)}, 'Nutrição', {lit(COR_NUTRI)}, false, v_princ.faixa_inicio, v_princ.faixa_fim, v_princ.slot_minutos, v_n)
  returning id into v_cal_nutri;
  -- 3. as consultas vivas de nutrição do principal passam para o Nutrição (só o calendario_id)
  with m as (
    update {s}.agendamentos set calendario_id = v_cal_nutri
     where nutricionista_id = {lit(prof)} and calendario_id = v_princ.id and deleted_at is null and modulo = 'nutricao'
    returning id)
  select coalesce(array_agg(id), '{{}}') into v_movidas from m;
  r := r || jsonb_build_object(
    'calendario_treino', v_princ.id, 'calendario_nutricao', v_cal_nutri, 'tag_treino', v_t, 'tag_nutricao', v_n,
    'consultas_movidas', to_jsonb(v_movidas),
    'depois', jsonb_build_object(
      'calendarios', (select jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'cor', c.cor, 'padrao', c.padrao, 'tag_padrao_id', c.tag_padrao_id)
                                       order by c.created_at)
                        from {s}.calendarios c where c.nutricionista_id = {lit(prof)} and c.deleted_at is null),
      'consultas', (select jsonb_object_agg(a.id, jsonb_build_object('calendario_id', a.calendario_id, 'modulo', a.modulo, 'tag_id', a.tag_id,
                                                                      'inicio', a.inicio, 'status', a.status, 'paciente_id', a.paciente_id))
                      from {s}.agendamentos a where a.nutricionista_id = {lit(prof)} and a.deleted_at is null)));
  {fim}
end $aj$;"""


def rodar(sql: str) -> tuple[int, object]:
    return http("POST", f"https://api.supabase.com/v1/projects/{PRINCIPAL_REF}/database/query", {"query": sql},
                {"Authorization": f"Bearer {pat()}"}, timeout=180)


def tirar(msg: str, marca: str) -> dict:
    i = msg.find(marca + " ")
    if i < 0:
        raise SystemExit(f"o bloco não devolveu {marca}: {msg[:1500]}")
    obj, _ = json.JSONDecoder().raw_decode(msg[i + len(marca) + 1:])
    return obj


def backup(s: str, prof: str, pasta: Path) -> None:
    pasta.mkdir(parents=True, exist_ok=True)
    for t, col in (("calendarios", "nutricionista_id"), ("agendamentos", "nutricionista_id"), ("agenda_tags", "profissional_id")):
        r = sql_principal(f"select count(*)::int as n, coalesce(json_agg(x), '[]'::json) as dados from {s}.{t} x where x.{col} = {lit(prof)}")[0]
        arq = pasta / f"{s}.{t}.json"
        arq.write_text(json.dumps(r["dados"], ensure_ascii=False, indent=1), encoding="utf-8")
        os.chmod(arq, 0o600)
        print(f"   backup {s}.{t:14s} {r['n']:4d} linha(s) → {arq}")


def assinatura(s: str, prof: str) -> list:
    """O que NÃO pode mudar em consulta nenhuma (só o calendario_id das de nutrição)."""
    return sql_principal(f"""select id::text, inicio::text, fim::text, status, modulo, tag_id::text as tag, paciente_id::text as paciente,
                                    deleted_at is not null as apagada from {s}.agendamentos where nutricionista_id = {lit(prof)} order by id""")


def aplicar(a, simular: bool) -> int:
    s, prof, conta = a.schema, a.profissional, a.conta
    carimbo = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    pasta = Path(os.path.expanduser(a.pasta or PASTA_PADRAO / s)) / f"backup-{'dry-run' if simular else 'aplicar'}-{carimbo}"
    print(f"── {'simulação' if simular else 'APLICAR'} em {s} · profissional {prof} · conta {conta}")
    backup(s, prof, pasta)
    antes = assinatura(s, prof)
    st, r = rodar(bloco(s, prof, conta, simular=True))
    msg = r.get("message", "") if isinstance(r, dict) else str(r)
    res = tirar(msg, "W2_AJUSTE")
    (pasta / "relatorio-simulacao.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(res, ensure_ascii=False, indent=1)[:3000])
    if simular or res.get("ja_ajustado"):
        print("já ajustado: nada a fazer" if res.get("ja_ajustado") else f"simulação ok (nada gravado) — relatório em {pasta}")
        return 0
    st, r = rodar(bloco(s, prof, conta, simular=False) + "\nselect current_setting('w2.ajuste', true) as r;")
    if st not in (200, 201):
        raise SystemExit(f"o bloco falhou (HTTP {st}): {str(r)[:1500]} — nada foi gravado")
    # o resultado da execução DE VERDADE (os ids que nasceram no commit — os da simulação foram desfeitos)
    feito = json.loads(r[0]["r"]) if isinstance(r, list) and r and r[0].get("r") else None
    if not feito:
        raise SystemExit(f"o bloco gravou mas não devolveu o resultado: {str(r)[:500]} — confira à mão antes de seguir")
    depois = assinatura(s, prof)
    estado = sql_principal(f"""select c.id::text, c.nome, c.cor, c.padrao, c.tag_padrao_id::text as tag from {s}.calendarios c
                               where c.nutricionista_id = {lit(prof)} and c.deleted_at is null order by c.created_at""")
    mov = sql_principal(f"""select a.id::text from {s}.agendamentos a join {s}.calendarios c on c.id = a.calendario_id
                            where a.nutricionista_id = {lit(prof)} and a.deleted_at is null and c.nome = 'Nutrição' and c.conta_id = {lit(conta)}""")
    rel = {"quando": carimbo, "schema": s, "profissional": prof, "conta": conta, "aplicado": feito, "simulacao": res, "calendarios_depois": estado,
           "consultas_no_nutricao": [x["id"] for x in mov], "assinatura_igual": antes == depois}
    (pasta / "relatorio-aplicar.json").write_text(json.dumps(rel, ensure_ascii=False, indent=1), encoding="utf-8")
    print("calendários agora:", json.dumps(estado, ensure_ascii=False))
    print("consultas no Nutrição:", rel["consultas_no_nutricao"])
    print("horário/status/área/tag/aluno das consultas iguais:", rel["assinatura_igual"])
    print(f"relatório e backup: {pasta}")
    return 0 if rel["assinatura_igual"] else 1


def desfazer(a) -> int:
    s, prof, conta = a.schema, a.profissional, a.conta
    pasta = Path(os.path.expanduser(a.desfazer))
    rel = json.loads((pasta / "relatorio-aplicar.json").read_text(encoding="utf-8"))
    sim = rel["aplicado"]  # os ids que o --aplicar criou de verdade
    cal_t, cal_n = sim["calendario_treino"], sim["calendario_nutricao"]
    antes = {c["id"]: c for c in sim["antes"]["calendarios"]}
    princ = antes[cal_t]
    movidas = sim.get("consultas_movidas") or []
    outras = sql_principal(f"""select id::text from {s}.agendamentos where calendario_id = {lit(cal_n)}
                               and not (id = any({lit(movidas)}::uuid[]))""")
    print(f"── DESFAZER em {s}: '{cal_t}' volta a '{princ['nome']}', as {len(movidas)} consulta(s) voltam para ele e o Nutrição '{cal_n}' sai")
    if outras:
        raise SystemExit(f"o calendário Nutrição já tem {len(outras)} consulta(s) nova(s) ({[x['id'] for x in outras][:5]}): não desfaço sozinho")
    sql = f"""do $df$ begin
      update {s}.agendamentos set calendario_id = {lit(cal_t)} where id = any({lit(movidas)}::uuid[]) and calendario_id = {lit(cal_n)};
      update {s}.calendarios set nome = {lit(princ['nome'])}, tag_padrao_id = {lit(princ.get('tag_padrao_id'))}::uuid where id = {lit(cal_t)};
      delete from {s}.calendarios where id = {lit(cal_n)} and nutricionista_id = {lit(prof)} and conta_id = {lit(conta)};
    end $df$;"""
    if not a.sim:
        print("prévia (sem --sim nada muda):\n" + sql)
        return 0
    backup(s, prof, pasta / f"antes-do-desfazer-{dt.datetime.now().strftime('%Y%m%d-%H%M%S')}")
    st, r = rodar(sql)
    if st not in (200, 201):
        raise SystemExit(f"desfazer falhou (HTTP {st}): {str(r)[:1200]} — nada foi gravado")
    print("desfeito:", sql_principal(f"select id::text, nome, tag_padrao_id::text as tag from {s}.calendarios where nutricionista_id = {lit(prof)} and deleted_at is null"))
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--schema", required=True, choices=("public", "staging"))
    ap.add_argument("--profissional", default=PROFISSIONAL)
    ap.add_argument("--conta", default=CONTA)
    ap.add_argument("--pasta")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--dry-run", action="store_true")
    g.add_argument("--aplicar", action="store_true")
    g.add_argument("--desfazer", metavar="PASTA")
    ap.add_argument("--sim", action="store_true", help="confirma o --aplicar / --desfazer")
    a = ap.parse_args()
    for v in (a.profissional, a.conta):
        if not UUID_RE.match(v):
            raise SystemExit(f"uuid inválido: {v}")
    if a.desfazer:
        return desfazer(a)
    if a.aplicar and not a.sim:
        raise SystemExit("--aplicar precisa de --sim (rode o --dry-run antes)")
    return aplicar(a, simular=a.dry_run)


if __name__ == "__main__":
    sys.exit(main())
