#!/usr/bin/env python3
"""Physiq W14 — massa de TESTE no staging (idempotente; sobre a da W13; SÓ *.teste.claude@physiqnutri.app — P26).

  (sem opção)  garante a massa da W13 (e2e/w13/massa.py) e acrescenta o que o Perfil do aluno mostra na tela 7: Rafael Moura
               com nascimento (28 anos), sexo, telefone de TESTE (DDD 00 — não existe; nenhuma mensagem chega a ninguém), CPF,
               apelido, a antropometria da Camila (84,2 kg · 1,78 m); telefones de teste na Marina e na Beatriz (pacientes da
               Camila com as mensagens desligadas → o aviso único da P15); uma instância de WhatsApp DESCONECTADA da Camila (o
               aviso só aparece para quem tem o WhatsApp no Physiq; desconectada = nada sai da fila); os ajustes voltam ao padrão.
  --limpar     desfaz só o que é da W14 (a massa da W13 fica — ela tem o próprio --limpar)

Uso: python3 e2e/w14/massa.py [--limpar]
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S


def q(sql: str) -> list:
    return B.sql_principal(sql)


def montar() -> None:
    r = subprocess.run([sys.executable, str(Path(__file__).parent.parent / "w13" / "massa.py")], capture_output=True, text=True, timeout=600)
    print(r.stdout[-800:], r.stderr[-400:])
    assert r.returncode == 0, "massa da W13 falhou"
    c = B.conta_de("w13-dono", B.NOME_CONTA)
    assert c, "conta W13"
    camila = B.uid("w13-nutri")
    raf = B.paciente("Rafael Moura", c)
    assert raf, "Rafael"
    q(f"""update {S}.pacientes set nascimento = '1998-03-10', genero = 'masculino', telefone = '{B.TEL_TESTE['Rafael Moura']}',
             apelido = 'Rafa', cpf = null, objetivo = 'definição', resumo = null,
             config = jsonb_build_object('acesso_app', true, 'mensagens_automaticas', false, 'diario_alimentar', true, 'acesso_link', true)
           where id = '{raf['id']}'""")
    for nome in ("Marina Alves", "Beatriz Lima"):
        pa = B.paciente(nome, c)
        assert pa, nome
        q(f"""update {S}.pacientes set telefone = '{B.TEL_TESTE[nome]}',
                 config = coalesce(config, '{{}}'::jsonb) - 'mensagens_automaticas' - 'diario_alimentar' - 'acesso_link'
               where id = '{pa['id']}'""")
    # a antropometria da Camila (altura e peso do cabeçalho de quem não tem treino ligado)
    if not q(f"select 1 from {S}.antropometrias where paciente_id = '{raf['id']}' and deleted_at is null"):
        q(f"""insert into {S}.antropometrias (nutricionista_id, paciente_id, data, peso, altura, sexo, idade, circunferencias, dobras, protocolo, resultados)
              values ('{camila}', '{raf['id']}', '2026-06-14', 84.2, 178, 'masculino', 28, '{{"cintura": 82, "quadril": 98}}'::jsonb, '{{}}'::jsonb, 'nenhum',
                      '{{"percentual_gordura": 17.8, "massa_gorda": 14.99, "massa_magra": 69.21, "imc": 26.6}}'::jsonb)""")
    # WhatsApp da Camila no Physiq: DESCONECTADA (o enfileirador só olha as conectadas — nada vai para a fila de verdade)
    if not q(f"select 1 from {S}.whatsapp_instancias where nutricionista_id = '{camila}'"):
        q(f"insert into {S}.whatsapp_instancias (nutricionista_id, status) values ('{camila}', 'desconectado')")
    q(f"update {S}.whatsapp_instancias set status = 'desconectado', numero_e164 = null where nutricionista_id = '{camila}'")
    # o aviso único volta a aparecer (a E2E fecha/liga)
    q(f"update {S}.profiles set config = coalesce(config, '{{}}'::jsonb) - 'aviso_mensagens_w14' where id = '{camila}'")
    print("W14:", q(f"""select nome, telefone, nascimento, genero, config from {S}.pacientes where conta_id = '{c}' and deleted_at is null
                         and nome in ('Rafael Moura', 'Marina Alves', 'Beatriz Lima') order by nome"""))


def limpar() -> None:
    c = B.conta_de("w13-dono", B.NOME_CONTA)
    camila = B.uid("w13-nutri")
    if c:
        q(f"""update {S}.pacientes set telefone = null, nascimento = null, genero = null, apelido = null, resumo = null,
                 config = coalesce(config, '{{}}'::jsonb) - 'mensagens_automaticas' - 'diario_alimentar' - 'acesso_link'
               where conta_id = '{c}' and nome in ('Rafael Moura', 'Marina Alves', 'Beatriz Lima')""")
        q(f"""update {S}.antropometrias set deleted_at = now() where nutricionista_id = '{camila}' and deleted_at is null
               and paciente_id in (select id from {S}.pacientes where conta_id = '{c}')""")
    if camila:
        q(f"delete from {S}.whatsapp_instancias where nutricionista_id = '{camila}'")
        q(f"update {S}.profiles set config = coalesce(config, '{{}}'::jsonb) - 'aviso_mensagens_w14' where id = '{camila}'")
    print("massa da W14 desfeita no staging")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limpar", action="store_true")
    a = ap.parse_args()
    limpar() if a.limpar else montar()
    return 0


if __name__ == "__main__":
    sys.exit(main())
