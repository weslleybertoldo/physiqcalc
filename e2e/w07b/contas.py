#!/usr/bin/env python3
"""Physiq W7b — contas de TESTE do aluno sem profissional no schema staging (idempotente; SÓ *.teste.claude@physiqnutri.app).

  (sem opção)   garante os usuários da W7b (e_base.py) e ZERA o que a W7b cria para eles no staging: as matrículas (a do app e a do
                Lucas — cobranças e assinaturas vão junto), os avisos do sino e, no Banco do Treino (staging), os treinos
                próprios e a semana — para o E2E rodar de novo do zero. Nenhuma outra conta é tocada.
  --so-usuarios só garante os usuários (senha nova em ~/.physiq-teste-<nome>)

Uso: python3 e2e/w07b/contas.py [--so-usuarios]
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S


def zerar(conta: str) -> dict:
    u = B.uid(conta)
    if not u:
        return {}
    assert B.EMAIL[conta].endswith(".teste.claude@physiqnutri.app"), conta
    r = B.sql_principal(f"""with m as (delete from {S}.pacientes where user_id = '{u}' returning id),
                                 a as (delete from {S}.avisos where destino_user_id = '{u}' returning id)
                            select (select count(*) from m)::int as matriculas, (select count(*) from a)::int as avisos""")[0]
    tid = B.treino_id(conta)
    if tid:
        B.sql_treino(f"""delete from {S}.tb_semana_treinos where user_id = '{tid}';
                         delete from {S}.tb_series_padrao_usuario where user_id = '{tid}';
                         delete from {S}.tb_grupos_exercicios_usuario where user_id = '{tid}';
                         delete from {S}.tb_grupos_treino_usuario where user_id = '{tid}';
                         update {S}.physiq_profiles set professor_id = null where id = '{tid}'""")
        r["treino"] = tid
    return r


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--so-usuarios", action="store_true")
    a = ap.parse_args()
    for k in B.NOMES:
        email, s = B.CONTAS[k]
        print(f"principal  {email:46s} {B.garantir_usuario(email, s, B.NOMES[k])}")
        B.sql_principal(f"update {S}.profiles set nome = $n${B.NOMES[k]}$n$ where id = '{B.uid(k)}'")
    if a.so_usuarios:
        return 0
    for k in B.NOMES:
        print(f"zerado     {k:14s} {zerar(k)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
