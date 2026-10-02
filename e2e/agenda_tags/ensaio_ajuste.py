#!/usr/bin/env python3
"""Physiq W2 — ENSAIO no STAGING do ajuste só do Weslley (scripts/agenda_tags/ajuste_weslley.py), com uma conta de TESTE no mesmo
estado da dele em produção: dono + personal + nutricionista (Treino + Nutrição) com o "Calendário principal" que nasceu antes da W2,
1 consulta de nutrição viva, 1 de treino viva e 1 de nutrição na lixeira.

  simulação → aplicar → conferir (Treino com a tag Treino, Nutrição com a tag Nutrição, só a de nutrição viva mudou de calendário,
  nada mais mudou) → desfazer (volta igual ao backup) → aplicar de novo → 3ª vez responde "já ajustado".
Uso: python3 e2e/agenda_tags/ensaio_ajuste.py [--limpar]
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
p = B.p
q = B.q
LEG = "w2t-legado"
EMAIL = "w2t.legado.teste.claude@physiqnutri.app"
NOME = "Lia Legado W2"
CONTA = "Studio Legado W2"
B.CONTAS[LEG] = (EMAIL, B.B5.senha_de(LEG))
B.EMAIL[LEG] = EMAIL
SCRIPT = Path(__file__).resolve().parent.parent.parent / "scripts" / "agenda_tags" / "ajuste_weslley.py"
PASTA = B.SCRATCH / "ensaio_ajuste"


def montar() -> dict:
    u = B.B5.garantir_usuario(EMAIL, B.CONTAS[LEG][1], NOME)
    B.sql_principal(f"update {S}.profiles set nome = {q(NOME)} where id = {q(u)}")
    c = B.sql_principal(f"select id::text from {S}.contas where nome = {q(CONTA)} limit 1")
    if not c:
        st, r = B.B5.rpc(LEG, "criar_minha_conta", {"p_nome": CONTA, "p_tipo": "outra_area", "p_registro": "W2-LEGADO"})
        assert st == 200 and r.get("ok"), (st, r)
        c = B.sql_principal(f"select id::text from {S}.contas where nome = {q(CONTA)} limit 1")
    conta = c[0]["id"]
    if not B.sql_principal(f"select 1 from {S}.calendarios where nutricionista_id = {q(u)}"):
        cal = B.sql_principal(f"""insert into {S}.calendarios (nutricionista_id, nome, cor, padrao, faixa_inicio, faixa_fim, conta_id)
                                  values ({q(u)}, 'Calendário principal', '#a78bfa', true, '07:00', '20:00', {q(conta)}) returning id::text""")[0]["id"]
        d = B.B5.hoje() + dt.timedelta(days=6)
        for titulo, mod, hora, apagada in (("Consulta de nutrição", "nutricao", "09:00", False), ("Avaliação física", "treino", "10:00", False),
                                           ("Antiga de nutrição", "nutricao", "11:00", True)):
            ini = dt.datetime(d.year, d.month, d.day, int(hora[:2]), 0, tzinfo=dt.timezone(dt.timedelta(hours=-3)))
            B.sql_principal(f"""insert into {S}.agendamentos (nutricionista_id, calendario_id, titulo, inicio, fim, modulo, conta_id, deleted_at)
                                values ({q(u)}, {q(cal)}, {q(titulo)}, {q(ini.isoformat())}, {q((ini + dt.timedelta(minutes=30)).isoformat())},
                                        {q(mod)}, {q(conta)}, {'now()' if apagada else 'null'})""")
    return {"prof": u, "conta": conta}


def limpar() -> None:
    u = B.uid(LEG) if B.sql_principal(f"select 1 from auth.users where lower(email) = {q(EMAIL)}") else None
    c = B.sql_principal(f"select id::text from {S}.contas where nome = {q(CONTA)}")
    if u:
        B.sql_principal(f"""delete from {S}.agendamentos where nutricionista_id = {q(u)}; delete from {S}.calendarios where nutricionista_id = {q(u)};
                            delete from {S}.agenda_tags where profissional_id = {q(u)};""")
    for x in c:
        B.sql_principal(f"""delete from {S}.conta_eventos where conta_id = {q(x['id'])}; delete from {S}.conta_membros where conta_id = {q(x['id'])};
                            delete from {S}.contas where id = {q(x['id'])};""")
    if u:
        sp = B.service(B.PRINCIPAL_REF)
        B.http("DELETE", f"{B.PRINCIPAL_URL}/auth/v1/admin/users/{u}", None, {"apikey": sp, "Authorization": f"Bearer {sp}"})
    print("ensaio limpo")


def script(*args: str) -> str:
    r = subprocess.run([sys.executable, str(SCRIPT), "--schema", S, *args], capture_output=True, text=True, timeout=300)
    print(r.stdout[-2500:], r.stderr[-800:], flush=True)
    return r.stdout


def estado(prof: str) -> dict:
    cal = B.sql_principal(f"select id::text, nome, cor, padrao, tag_padrao_id::text as tag from {S}.calendarios where nutricionista_id = {q(prof)} and deleted_at is null order by created_at")
    ags = B.sql_principal(f"""select a.titulo, c.nome as cal, a.modulo, a.tag_id::text as tag, a.deleted_at is not null as apagada, a.inicio::text
                              from {S}.agendamentos a join {S}.calendarios c on c.id = a.calendario_id where a.nutricionista_id = {q(prof)} order by a.titulo""")
    return {"calendarios": cal, "consultas": ags}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--limpar", action="store_true")
    a = ap.parse_args()
    if a.limpar:
        limpar()
        return 0
    limpar()
    m = montar()
    prof, conta = m["prof"], m["conta"]
    # as base vêm do gatilho (as consultas acima gravaram sem tag → o banco criou as 3 e pôs a da área)
    bt, bn = B.base_de(prof, "treino"), B.base_de(prof, "nutricao")
    p.check(bool(bt and bn), "[ensaio] as base do profissional existem (o gatilho criou ao gravar as consultas)")
    e0 = estado(prof)
    p.check([c["nome"] for c in e0["calendarios"]] == ["Calendário principal"], f"[ensaio] antes: 1 'Calendário principal' ({e0['calendarios']})")
    comum = ["--profissional", prof, "--conta", conta, "--pasta", str(PASTA)]
    out = script("--dry-run", *comum)
    p.check("simulação ok" in out, "[ensaio] simulação sem gravar nada")
    p.check(estado(prof) == e0, "[ensaio] a simulação não mudou nada")
    out = script("--aplicar", "--sim", *comum)
    p.check("iguais: True" in out, "[ensaio] aplicar: horário/status/área/tag/aluno das consultas iguais")
    e1 = estado(prof)
    cals = {c["nome"]: c for c in e1["calendarios"]}
    p.check(set(cals) == {"Treino", "Nutrição"} and cals["Treino"]["tag"] == bt and cals["Nutrição"]["tag"] == bn and cals["Treino"]["padrao"]
            and not cals["Nutrição"]["padrao"] and cals["Nutrição"]["cor"] == "#34d399" and cals["Treino"]["cor"] == "#a78bfa",
            f"[ensaio] Treino (tag Treino, padrão) + Nutrição (verde, tag Nutrição): {e1['calendarios']}")
    onde = {c["titulo"]: c["cal"] for c in e1["consultas"]}
    p.check(onde == {"Consulta de nutrição": "Nutrição", "Avaliação física": "Treino", "Antiga de nutrição": "Treino"},
            f"[ensaio] só a de nutrição VIVA foi para o Nutrição ({onde})")
    rel = sorted(PASTA.glob("backup-aplicar-*"))[-1]
    out = script("--desfazer", str(rel), "--sim", *comum)
    e2 = estado(prof)
    p.check(e2 == e0, f"[ensaio] desfazer: volta igual ao antes ({e2['calendarios']})")
    out = script("--aplicar", "--sim", *comum)
    p.check("iguais: True" in out and {c["nome"] for c in estado(prof)["calendarios"]} == {"Treino", "Nutrição"}, "[ensaio] aplicar de novo")
    out = script("--aplicar", "--sim", *comum)
    p.check("já ajustado" in out, "[ensaio] 3ª vez: 'já ajustado' (idempotente)")
    print(json.dumps(estado(prof), ensure_ascii=False, indent=1)[:1500])
    limpar()
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
