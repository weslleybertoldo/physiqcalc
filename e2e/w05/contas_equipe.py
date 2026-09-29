#!/usr/bin/env python3
"""Physiq W5 — contas de TESTE da equipe no schema staging (idempotente; SÓ contas *.teste.claude@physiqnutri.app — P26).

  --zerar   volta ao começo: apaga a "Consultoria Equipe W5" (membros, convites e as matrículas dos alunos de teste dela) e o
            espelho dessas contas no Treino; recria a conta do dono pelo caminho do produto ("Sou profissional" → RPC
            criar_minha_conta, tipo personal → dono + personal, teste de 14 dias no Treino + Nutrição)
  (sem)     só garante os usuários e a conta do dono

Uso: python3 e2e/w05/contas_equipe.py [--zerar] [--schema staging]
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

NOMES = {
    "w5-dono": "Dono Equipe W5",
    "w5-personal": "Personal Equipe W5",
    "w5-nutri": "Nutri Equipe W5",
    "w5-aluno1": "Aluno Um W5",
    "w5-aluno2": "Aluna Dois W5",
}
NOME_CONTA = "Consultoria Equipe W5"


def conta_do_dono() -> dict | None:
    u = B.uid("w5-dono")
    r = B.sql_principal(f"select id::text, nome, situacao, plano from {B.schema()}.contas where dono_id = '{u}' and origem = 'nova' order by criado_em limit 1")
    return r[0] if r else None


def zerar() -> None:
    s = B.schema()
    ids = {k: B.uid(k) for k in NOMES}
    c = conta_do_dono()
    alunos = [ids["w5-aluno1"], ids["w5-aluno2"]]
    lista_alunos = ",".join(f"'{a}'" for a in alunos if a)
    if c:
        B.sql_principal(f"""
          delete from {s}.pacientes where conta_id = '{c['id']}' and user_id in ({lista_alunos});
          delete from {s}.contas where id = '{c['id']}';""")
    # matrículas soltas dos alunos de teste (de outra rodada) e avisos da equipe
    if lista_alunos:
        B.sql_principal(f"delete from {s}.pacientes where user_id in ({lista_alunos});")
    todos = ",".join(f"'{v}'" for v in ids.values() if v)
    B.sql_principal(f"""
      delete from {s}.convites where lower(email) like '%w5.%.teste.claude@physiqnutri.app';
      delete from {s}.conta_membros where user_id in ({todos}) or lower(email_convite) like '%w5.%.teste.claude@physiqnutri.app';
      delete from {s}.avisos where destino_user_id in ({todos});
      update {s}.profiles set tipo_perfil = null, dados_profissionais = null, nome = null where id in ({todos});""")
    # Treino: o espelho dessas pessoas (só as de teste)
    treinos = [B.sql_treino(f"select treino_user_id::text as tid from {s}.physiq_identidades where principal_user_id = '{v}'") for v in ids.values() if v]
    tids = [t[0]["tid"] for t in treinos if t]
    if tids:
        lista = ",".join(f"'{t}'" for t in tids)
        B.exec_treino(f"delete from {s}.physiq_espelho_membros where treino_user_id in ({lista})")
        B.exec_treino(f"update {s}.physiq_profiles set professor_id = null, conta_id = null where id in ({lista})")
    print(f"zerado: conta {c['id'] if c else '-'} · treino {len(tids)} pessoas")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--zerar", action="store_true")
    ap.add_argument("--schema", default="staging")
    a = ap.parse_args()
    B.ESTADO["schema"] = a.schema
    assert a.schema == "staging", "as contas da equipe W5 são só do staging"
    for k, nome in NOMES.items():
        email, s = B.CONTAS[k]
        print(f"principal  {email:44s} {B.garantir_usuario(email, s, nome)}")
    if a.zerar:
        zerar()
    if not conta_do_dono():
        st, r = B.rpc("w5-dono", "criar_minha_conta", {"p_nome": NOME_CONTA, "p_tipo": "personal", "p_registro": "CREF 000555-G/PE"})
        assert st == 200 and isinstance(r, dict) and r.get("ok"), (st, r)
        print("conta criada:", r)
    print("conta do dono:", conta_do_dono())
    return 0


if __name__ == "__main__":
    sys.exit(main())
