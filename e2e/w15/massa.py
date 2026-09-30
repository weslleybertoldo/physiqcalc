#!/usr/bin/env python3
"""Physiq W15 — massa de TESTE no staging do Banco do Treino (idempotente; só as contas w13.* da "Consultoria Ferreira W13").

  (sem opção)  os 3 treinos do Rafael Moura (tela 8): "Peito e tríceps" (do Lucas, só do Rafael → a lista muda direto),
               "Costas" (global, também do Lucas → compartilhado: mudar a lista vira cópia só do Rafael) e "Pernas" (global,
               só do Rafael → também vira cópia, global é modelo); a semana (Seg A · Ter B · Qua C · Qui A · Sex B — 5 dias),
               descanso padrão 60 s, séries travadas, os treinos concluídos de seg e ter desta semana (+ hoje com --hoje) e
               séries feitas no mês (histórico, volume praticado e relatório). A prescrição (séries × reps · descanso · carga)
               e a observação NÃO entram aqui: o E2E digita no editor.
  --prescricao depois de montar, grava a prescrição e a observação da tela 8 no treino A (o que o E2E digitaria) — a massa
               que a W16 ("Editar treino e dieta") usa nos prints
  --limpar     apaga tudo o que a W15 criou no staging (treinos, semana, séries, concluídos) e devolve a config do Rafael

Uso: python3 e2e/w15/massa.py [--prescricao | --limpar] [--hoje]
"""
from __future__ import annotations

import argparse
import datetime as dt
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
ARQ = B.SCRATCH / "massa_staging.json"


def ex(sql: str) -> None:
    B.exec_treino(sql)


def q(sql: str) -> list:
    return B.sql_treino(sql)


def ids() -> dict:
    lucas, rafael = B.treino_id("w13-dono"), B.treino_id("w13-aluno")
    assert lucas and rafael, "rode antes o e2e/w13/massa.py e entre uma vez com o Lucas e o Rafael no staging"
    return {"lucas": lucas, "rafael": rafael}


def segunda(hoje: dt.date) -> dt.date:
    return hoje - dt.timedelta(days=hoje.weekday())


def grupo(nome: str, professor: str | None, estado: dict, chave: str) -> str:
    gid = estado.get(chave)
    if gid and q(f"select 1 from {S}.tb_grupos_treino where id = '{gid}'"):
        ex(f"update {S}.tb_grupos_treino set nome = $n${nome}$n$, professor_id = {'null' if professor is None else repr(professor)} where id = '{gid}'")
        return gid
    prof = "null" if professor is None else f"'{professor}'"
    gid = q(f"insert into {S}.tb_grupos_treino (nome, professor_id) values ($n${nome}$n$, {prof}) returning id::text")[0]["id"]
    estado[chave] = gid
    return gid


def exercicios(gid: str, nomes: list[str]) -> None:
    ex(f"delete from {S}.tb_grupos_exercicios where grupo_id = '{gid}'")
    for i, n in enumerate(nomes):
        ex(f"insert into {S}.tb_grupos_exercicios (grupo_id, exercicio_id, ordem) values ('{gid}', '{B.exercicio_id(n)}', {i})")


def recebe(gid: str, *quem: str) -> None:
    for u in quem:
        ex(f"insert into {S}.tb_grupos_treino_perfis (grupo_id, user_id) values ('{gid}', '{u}') on conflict (grupo_id, user_id) do nothing")


def apagar_copias(rafael: str, estado: dict) -> None:
    """As cópias "personalizadas" que o E2E criou (treinos do Rafael fora dos 3 da massa) e as de um --zerar anterior."""
    base = [estado.get(k) for k in ("A", "B", "C") if estado.get(k)]
    fora = ",".join(f"'{g}'" for g in base) or "'00000000-0000-0000-0000-000000000000'"
    copias = [r["id"] for r in q(f"""select g.id::text from {S}.tb_grupos_treino g join {S}.tb_grupos_treino_perfis p on p.grupo_id = g.id
                                     where p.user_id = '{rafael}' and g.id not in ({fora})""")]
    for g in copias:
        ex(f"delete from {S}.tb_semana_treinos where grupo_id = '{g}'")
        ex(f"delete from {S}.tb_grupos_treino where id = '{g}'")
    if copias:
        print("cópias/treinos novos apagados:", len(copias))


def montar(hoje_feito: bool) -> None:
    i = ids()
    estado = B.ler_json(ARQ)
    lucas, rafael = i["lucas"], i["rafael"]
    apagar_copias(rafael, estado)
    a = grupo("Peito e tríceps", lucas, estado, "A")
    b = grupo("Costas", None, estado, "B")
    c = grupo("Pernas", None, estado, "C")
    exercicios(a, [n for n, *_ in B.TREINO_A])
    exercicios(b, B.TREINO_B)
    exercicios(c, B.TREINO_C)
    ex(f"delete from {S}.tb_grupos_treino_perfis where user_id = '{rafael}'")
    recebe(a, rafael)
    recebe(b, rafael, lucas)  # "Costas" também é do Lucas → compartilhado
    recebe(c, rafael)
    # a semana: Seg A · Ter B · Qua C · Qui A · Sex B (5 dias com treino)
    ex(f"delete from {S}.tb_semana_treinos where user_id = '{rafael}'")
    ex(f"delete from {S}.tb_semana_dia_config where user_id = '{rafael}'")
    for dia, g in (("SEG", a), ("TER", b), ("QUA", c), ("QUI", a), ("SEX", b)):
        ex(f"insert into {S}.tb_semana_treinos (user_id, dia_semana, slot_idx, grupo_id) values ('{rafael}', '{dia}', 0, '{g}')")
    # config do aluno (tela 8: DESCANSO PADRÃO 60 S · ALUNO NÃO MUDA AS SÉRIES) — a original fica guardada para o --limpar
    cfg = q(f"select series_padrao_qtd, series_modo, series_travadas, tempo_descanso_segundos, proxima_troca_treino::text from {S}.physiq_profiles where id = '{rafael}'")[0]
    estado.setdefault("config_original", cfg)
    ex(f"""update {S}.physiq_profiles set tempo_descanso_segundos = 60, series_travadas = true, series_modo = 'personalizada',
             series_padrao_qtd = 3, proxima_troca_treino = null where id = '{rafael}'""")
    # prescrição e observação do aluno: o E2E digita (começa vazia)
    ex(f"delete from {S}.tb_series_padrao_usuario where user_id = '{rafael}'")
    ex(f"delete from {S}.exercicio_ordem_usuario where user_id = '{rafael}'")
    ex(f"delete from {S}.exercicio_substituicao_usuario where user_id = '{rafael}'")
    # treinos feitos nesta semana (seg e ter; hoje com --hoje) e séries feitas no mês
    hoje = B.B5.hoje()
    seg = segunda(hoje)
    ex(f"delete from {S}.tb_treino_concluido where user_id = '{rafael}' and data_treino >= '{hoje.replace(day=1)}'")
    ex(f"delete from {S}.tb_treino_series where user_id = '{rafael}' and data_treino >= '{hoje.replace(day=1)}'")
    feitos = [seg, seg + dt.timedelta(days=1)] + ([hoje] if hoje_feito and hoje not in (seg, seg + dt.timedelta(days=1)) else [])
    feitos = [d for d in feitos if d <= hoje]
    grupos_do_dia = {0: a, 1: b, 2: c, 3: a, 4: b}
    nomes = {a: [n for n, *_ in B.TREINO_A], b: B.TREINO_B, c: B.TREINO_C}
    for d in feitos:
        ex(f"insert into {S}.tb_treino_concluido (user_id, data_treino, slot_idx, concluido) values ('{rafael}', '{d}', 0, true)")
        for n in nomes[grupos_do_dia[d.weekday()]][:3]:
            for s in (1, 2, 3):
                ex(f"""insert into {S}.tb_treino_series (user_id, exercicio_id, data_treino, numero_serie, peso, reps, concluida, slot_idx)
                       values ('{rafael}', '{B.exercicio_id(n)}', '{d}', {s}, {20 + 5 * s}, 10, true, 0)""")
    estado.update({"lucas": lucas, "rafael": rafael, "feitos": [str(d) for d in feitos]})
    B.json_arquivo(ARQ, estado)
    print("massa W15 no staging:", {k: estado[k] for k in ("A", "B", "C")}, "· feitos:", estado["feitos"])


def prescrever() -> None:
    """A prescrição da tela 8 no treino A do Rafael (séries × reps · descanso · carga) e a observação — direto no banco do staging."""
    estado = B.ler_json(ARQ)
    rafael, a = estado["rafael"], estado["A"]
    for nome, series, reps, desc, kg in B.TREINO_A:
        ex(f"""insert into {S}.tb_series_padrao_usuario (user_id, grupo_id, exercicio_id, num_series, reps_alvo, descanso_segundos, carga_sugerida_kg)
               values ('{rafael}', '{a}', '{B.exercicio_id(nome)}', {series}, '{reps}', {desc}, {kg})""")
    ex(f"""insert into {S}.tb_series_padrao_usuario (user_id, grupo_id, num_series, observacao)
           values ('{rafael}', '{a}', 3, $o${B.OBSERVACAO}$o$)""")
    print("prescrição da tela 8 gravada no treino A do Rafael (staging)")


def limpar() -> None:
    estado = B.ler_json(ARQ)
    if not estado:
        print("nada a limpar")
        return
    rafael = estado["rafael"]
    apagar_copias(rafael, estado)
    for k in ("A", "B", "C"):
        g = estado.get(k)
        if g:
            ex(f"delete from {S}.tb_semana_treinos where grupo_id = '{g}'")
            ex(f"delete from {S}.tb_grupos_treino where id = '{g}'")
    ex(f"delete from {S}.tb_series_padrao_usuario where user_id = '{rafael}'")
    ex(f"delete from {S}.tb_semana_treinos where user_id = '{rafael}'")
    ex(f"delete from {S}.tb_semana_dia_config where user_id = '{rafael}'")
    for d in estado.get("feitos", []):
        ex(f"delete from {S}.tb_treino_concluido where user_id = '{rafael}' and data_treino = '{d}'")
        ex(f"delete from {S}.tb_treino_series where user_id = '{rafael}' and data_treino = '{d}'")
    cfg = estado.get("config_original")
    if cfg:
        lit = lambda v: "null" if v is None else (str(v).lower() if isinstance(v, bool) else repr(v) if isinstance(v, str) else str(v))  # noqa: E731
        ex(f"""update {S}.physiq_profiles set series_padrao_qtd = {lit(cfg['series_padrao_qtd'])}, series_modo = {lit(cfg['series_modo'])},
                 series_travadas = {lit(cfg['series_travadas'])}, tempo_descanso_segundos = {lit(cfg['tempo_descanso_segundos'])},
                 proxima_troca_treino = {lit(cfg['proxima_troca_treino'])} where id = '{rafael}'""")
    ARQ.unlink()
    print("massa W15 apagada do staging")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--prescricao", action="store_true")
    ap.add_argument("--limpar", action="store_true")
    ap.add_argument("--hoje", action="store_true")
    a = ap.parse_args()
    if not B.saude_treino():
        raise SystemExit("PARADO: Banco do Treino não está saudável — não mexo em nada")
    if a.limpar:
        limpar()
    else:
        montar(a.hoje)
        if a.prescricao:
            prescrever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
