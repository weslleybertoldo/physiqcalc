#!/usr/bin/env python3
"""Physiq W23 — massa de TESTE no staging do Banco do Treino (idempotente; só as contas w13.* da "Consultoria Ferreira W13").

  (sem opção)  a pasta "Hipertrofia W23" do Lucas com os treinos-modelo A/B/C (exercícios da biblioteca global — 81 com GIF); o A
               com a prescrição DO MODELO da tela 8 (4 × 10 · 60 s · 60 kg…); o Rafael recebendo o A com UMA prescrição própria
               (Supino Reto 5 × 6 — o "Aplicar a quem recebe" não pode sobrescrever) e treinos feitos em setembro (Histórico e
               Relatório). Apaga o exercício próprio da W23 e os treinos/pastas que o E2E cria (para começar do zero).
  --limpar     apaga tudo o que a W23 criou no staging (modelos, pasta, exercício próprio, prescrições do Rafael nos modelos W23,
               treinos feitos de setembro da massa) — a massa da W15 (semana do Rafael, treinos de 28 e 29/09) não é tocada

Uso: python3 e2e/w23/massa.py [--limpar]
"""
from __future__ import annotations

import argparse
import datetime as dt
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
ARQ = B.SCRATCH / "massa_staging.json"
# treinos feitos em setembro (os de 28 e 29/09 são da massa da W15): dia → os exercícios do treino daquele dia na semana do Rafael
DIAS_FEITOS = ["2026-09-01", "2026-09-03", "2026-09-08", "2026-09-10", "2026-09-15", "2026-09-17", "2026-09-22", "2026-09-24"]
EX_POR_DIA = {0: ["Supino Reto com Barra", "Supino Inclinado com Barra", "Crucifixo com Halteres"],  # seg: A da W15 (Peito e tríceps)
              1: ["Puxada Frontal Aberta", "Remada Curvada com Barra", "Rosca Direta com Barra"],  # ter: B (Costas)
              2: ["Agachamento Livre com Barra", "Leg Press 45°", "Elevação Pélvica com Barra"],  # qua: C (Pernas)
              3: ["Supino Reto com Barra", "Supino Inclinado com Barra", "Tríceps Pulley"]}  # qui: A


def ex(sql: str) -> None:
    B.exec_treino(sql)


def q(sql: str) -> list:
    return B.sql_treino(sql)


def lit(v) -> str:
    return "null" if v is None else (f"'{v}'" if isinstance(v, str) else str(v))


def apagar_do_lucas(lucas: str, rafael: str) -> None:
    """Os modelos/pastas da W23 (os da massa e os que o E2E criou: nomes com "W23"), o exercício próprio da W23 (e o GIF dele no
    Storage do staging) e o grupo muscular de teste — numa transação só."""
    exs = [r["id"] for r in q(f"select id::text from {S}.tb_exercicios where professor_id = '{lucas}' and nome like '%W23%'")]
    n = q(f"select count(*)::int as n from {S}.tb_grupos_treino where professor_id = '{lucas}' and nome like '%W23%'")[0]["n"]
    ex(f"""begin;
        delete from {S}.tb_semana_treinos where grupo_id in (select id from {S}.tb_grupos_treino where professor_id = '{lucas}' and nome like '%W23%');
        delete from {S}.tb_treino_dia_override where grupo_id in (select id from {S}.tb_grupos_treino where professor_id = '{lucas}' and nome like '%W23%');
        delete from {S}.tb_grupos_treino where professor_id = '{lucas}' and nome like '%W23%';
        delete from {S}.tb_pastas_treino where professor_id = '{lucas}' and nome like '%W23%';
        delete from {S}.tb_exercicios where professor_id = '{lucas}' and nome like '%W23%';
        delete from {S}.grupos_musculares where professor_id = '{lucas}' and nome like '%W23%';
        commit;""")
    if exs:
        # o GIF do exercício de teste (bucket do staging): <id>.<ext>
        objetos = [r["name"] for r in B.sql_treino(
            f"select name from storage.objects where bucket_id = 'exercicios-staging' and split_part(name, '.', 1) in ({','.join(repr(e) for e in exs)})")]
        if objetos:
            sk = B.service(B.TREINO_REF)
            st, r, _ = B.http("DELETE", f"{B.B5.TREINO_URL}/storage/v1/object/exercicios-staging", {"prefixes": objetos},
                              {"apikey": sk, "Authorization": f"Bearer {sk}"})
            print("GIF de teste apagado do Storage:", objetos, st)
    if n or exs:
        print(f"apagados: {n} modelos, {len(exs)} exercícios próprios da W23")


def montar() -> None:
    i = B.ids()
    lucas, rafael = i["lucas"], i["rafael"]
    apagar_do_lucas(lucas, rafael)
    nomes = sorted({*(n for n, *_ in B.EXS_A), *B.EXS_B, *B.EXS_C, *(n for v in EX_POR_DIA.values() for n in v)})
    ids_ex = {r["nome"]: r["id"] for r in q(f"""select nome, id::text from {S}.tb_exercicios where professor_id is null
                                                and nome in ({','.join("$n$" + n + "$n$" for n in nomes)})""")}
    falta = [n for n in nomes if n not in ids_ex]
    assert not falta, f"exercícios globais não achados no staging: {falta}"
    pasta, gid = str(uuid.uuid4()), {k: str(uuid.uuid4()) for k in "ABC"}
    presc = {nome: (s, r, d, kg) for nome, s, r, d, kg in B.EXS_A}
    sql = ["begin;", f"insert into {S}.tb_pastas_treino (id, nome, professor_id) values ('{pasta}', $n${B.PASTA}$n$, '{lucas}');"]
    for chave, nome, exs in (("A", B.TREINO_A, [n for n, *_ in B.EXS_A]), ("B", B.TREINO_B, B.EXS_B), ("C", B.TREINO_C, B.EXS_C)):
        sql.append(f"insert into {S}.tb_grupos_treino (id, nome, professor_id) values ('{gid[chave]}', $n${nome}$n$, '{lucas}');")
        sql.append(f"insert into {S}.tb_pastas_treino_grupos (pasta_id, grupo_id) values ('{pasta}', '{gid[chave]}');")
        valores = []
        for ordem, n in enumerate(exs):
            s_, r_, d_, kg_ = presc.get(n, (None, None, None, None)) if chave == "A" else (None, None, None, None)
            valores.append(f"('{gid[chave]}', '{ids_ex[n]}', {ordem}, {lit(s_)}, {lit(r_)}, {lit(d_)}, {lit(kg_)})")
        sql.append(f"insert into {S}.tb_grupos_exercicios (grupo_id, exercicio_id, ordem, num_series, reps_alvo, descanso_segundos, carga_sugerida_kg) values {', '.join(valores)};")
    # o Rafael recebe o A, com UMA prescrição própria (o "Aplicar a quem recebe" só preenche o vazio)
    sql.append(f"insert into {S}.tb_grupos_treino_perfis (grupo_id, user_id) values ('{gid['A']}', '{rafael}') on conflict (grupo_id, user_id) do nothing;")
    sql.append(f"""insert into {S}.tb_series_padrao_usuario (user_id, grupo_id, exercicio_id, num_series, reps_alvo)
                   values ('{rafael}', '{gid['A']}', '{ids_ex['Supino Reto com Barra']}', 5, '6');""")
    # treinos feitos em setembro (Histórico e Relatório) — séries com carga subindo
    datas = ",".join(f"'{d}'" for d in DIAS_FEITOS)
    sql.append(f"delete from {S}.tb_treino_concluido where user_id = '{rafael}' and data_treino in ({datas});")
    sql.append(f"delete from {S}.tb_treino_series where user_id = '{rafael}' and data_treino in ({datas});")
    concl, series = [], []
    for k, d in enumerate(DIAS_FEITOS):
        dia_semana = dt.date.fromisoformat(d).weekday()
        concl.append(f"('{rafael}', '{d}', 0, true)")
        for n in EX_POR_DIA.get(dia_semana, EX_POR_DIA[0]):
            for s_ in (1, 2, 3):
                series.append(f"('{rafael}', '{ids_ex[n]}', '{d}', {s_}, {20 + 2 * k + 5 * (s_ - 1)}, {12 - s_}, true, 0)")
    sql.append(f"insert into {S}.tb_treino_concluido (user_id, data_treino, slot_idx, concluido) values {', '.join(concl)};")
    sql.append(f"insert into {S}.tb_treino_series (user_id, exercicio_id, data_treino, numero_serie, peso, reps, concluida, slot_idx) values {', '.join(series)};")
    sql.append("commit;")
    ex("\n".join(sql))
    estado = {"lucas": lucas, "rafael": rafael, "bruno": i["bruno"], "pasta": pasta, **gid, "feitos": DIAS_FEITOS}
    B.json_arquivo(ARQ, estado)
    print("massa W23 no staging:", {k: estado[k] for k in ("pasta", "A", "B", "C")}, "· feitos em setembro:", len(DIAS_FEITOS))


def limpar() -> None:
    estado = B.ler_json(ARQ)
    i = B.ids()
    apagar_do_lucas(i["lucas"], i["rafael"])
    datas = ",".join(f"'{d}'" for d in estado.get("feitos", DIAS_FEITOS))
    ex(f"""begin; delete from {S}.tb_treino_concluido where user_id = '{i['rafael']}' and data_treino in ({datas});
           delete from {S}.tb_treino_series where user_id = '{i['rafael']}' and data_treino in ({datas}); commit;""")
    if ARQ.exists():
        ARQ.unlink()
    print("massa W23 apagada do staging")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limpar", action="store_true")
    a = ap.parse_args()
    if not B.saude_treino():
        raise SystemExit("PARADO: Banco do Treino não está saudável — não mexo em nada")
    if a.limpar:
        limpar()
    else:
        montar()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
