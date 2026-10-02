#!/usr/bin/env python3
"""Physiq H5 — a massa de TESTE do staging (só o banco principal; nada no Banco do Treino) para as telas do H5, na "Consultoria
Ferreira W13" (Rafael Moura, aluno da Camila e do Lucas):
  · 2 metas do Rafael ("Beber 3 L de água H5" todos os dias; "Caminhar 30 min H5" seg/qua/sex) com ✓ em dias dos últimos 7 (N-40);
  · 2 antropometrias a mais com % de gordura (abr e ago; o peso sobe em ago e a gordura cai — as 2 linhas se separam) — achado 9;
  · 3 fotos de evolução da Camila (frente, lado, costas) no bucket privado `evolucao` (N-34: ver grande, baixar, editar);
  · o aluno "Otávio CPF H5" (sem login) com um CPF válido — a trava de CPF do /c/ (N-57).
Uso: python3 e2e/h5/massa.py [--limpar]   (staging; tudo marcado com H5 e apagado no --limpar)
"""
from __future__ import annotations

import argparse
import datetime as dt
import sys
import urllib.error
import urllib.request
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
q = B.sql_principal
FOTOS = Path("/home/bertoldo/Desktop/Physiq Unificado - estrutura/Telas premium/fonte (gerador)/assets/fotos")
CPF_EXISTE = "39053344705"  # válido (dígitos verificadores) e de teste
NOME_CPF = "Otávio CPF H5"


def subir(caminho: str, arquivo: Path) -> int:
    sk = B.service(B.PRINCIPAL_REF)
    req = urllib.request.Request(f"{B.PRINCIPAL_URL}/storage/v1/object/evolucao/{caminho}", data=arquivo.read_bytes(), method="POST",
                                 headers={"Authorization": f"Bearer {sk}", "apikey": sk, "Content-Type": "image/jpeg", "x-upsert": "false", "User-Agent": "physiq-e2e-h5"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code


def apagar_arquivos(caminhos: list[str]) -> int:
    if not caminhos:
        return 200
    sk = B.service(B.PRINCIPAL_REF)
    st, _, _ = B.http("DELETE", f"{B.PRINCIPAL_URL}/storage/v1/object/evolucao", {"prefixes": caminhos}, {"apikey": sk, "Authorization": f"Bearer {sk}"}, timeout=90)
    return st


def limpar(conta: str, raf: dict) -> None:
    fotos = q(f"select id::text, path from {S}.fotos_evolucao where paciente_id = '{raf['id']}' and coalesce(observacao, '') like '%H5%'")
    st = apagar_arquivos([f["path"] for f in fotos])
    q(f"delete from {S}.fotos_evolucao where paciente_id = '{raf['id']}' and coalesce(observacao, '') like '%H5%'")
    q(f"delete from {S}.metas_concluidas where meta_id in (select id from {S}.metas where paciente_id = '{raf['id']}' and titulo like '%H5%')")
    q(f"delete from {S}.metas where paciente_id = '{raf['id']}' and titulo like '%H5%'")
    q(f"delete from {S}.antropometrias where paciente_id = '{raf['id']}' and coalesce(observacao, '') like '%massa H5%'")
    q(f"delete from {S}.pacientes where conta_id = '{conta}' and nome = {B.q(NOME_CPF)}")
    print(f"limpo (fotos {len(fotos)}, storage {st})")


def montar(conta: str, raf: dict) -> None:
    camila = B.uid("w13-nutri")
    hoje = B.hoje()
    # metas + ✓ (dias dos últimos 7)
    m1 = q(f"""insert into {S}.metas (paciente_id, nutricionista_id, titulo, descricao, dias_semana, ativa, inicio)
               values ('{raf['id']}', '{camila}', 'Beber 3 L de água H5', 'Ao longo do dia', '{{1,2,3,4,5,6,7}}', true, '{hoje - dt.timedelta(days=20)}') returning id::text""")[0]["id"]
    m2 = q(f"""insert into {S}.metas (paciente_id, nutricionista_id, titulo, descricao, dias_semana, ativa, inicio)
               values ('{raf['id']}', '{camila}', 'Caminhar 30 min H5', '', '{{1,3,5}}', true, '{hoje - dt.timedelta(days=20)}') returning id::text""")[0]["id"]
    dias1 = [hoje - dt.timedelta(days=d) for d in (0, 1, 3, 4, 6)]
    dias2 = [d for d in (hoje - dt.timedelta(days=x) for x in range(7)) if d.isoweekday() in (1, 3, 5)][:1]
    linhas = [f"('{raf['id']}', '{m1}', '{d}', '{conta}')" for d in dias1] + [f"('{raf['id']}', '{m2}', '{d}', '{conta}')" for d in dias2]
    q(f"insert into {S}.metas_concluidas (paciente_id, meta_id, data, conta_id) values {', '.join(linhas)}")
    # antropometrias com % de gordura (abr e ago) — a de jun (17,8 %) já existe
    for data, peso, gord in (("2026-04-10", 87.0, 19.6), ("2026-08-20", 85.1, 16.9)):
        mg = round(peso * gord / 100, 2)
        q(f"""insert into {S}.antropometrias (paciente_id, nutricionista_id, data, peso, altura, sexo, idade, protocolo, resultados, observacao)
              values ('{raf['id']}', '{camila}', '{data} 12:00-03', {peso}, 178, 'masculino', 28, 'nenhum',
                      '{{"percentual_gordura": {gord}, "massa_gorda": {mg}, "massa_magra": {round(peso - mg, 2)}}}'::jsonb, 'massa H5')""")
    # 3 fotos de evolução da Camila
    for pos, arq, dia in (("frente", "fisico1.jpg", hoje - dt.timedelta(days=2)), ("lado_d", "fisico2.jpg", hoje - dt.timedelta(days=2)),
                          ("costas", "fisico3.jpg", hoje - dt.timedelta(days=2))):
        caminho = f"{camila}/{raf['id']}/{uuid.uuid4()}-{arq}"
        st = subir(caminho, FOTOS / arq)
        assert st in (200, 201), (st, caminho)
        q(f"""insert into {S}.fotos_evolucao (nutricionista_id, paciente_id, posicao, data, path, tamanho, mime, observacao)
              values ('{camila}', '{raf['id']}', '{pos}', '{dia}', '{caminho}', {(FOTOS / arq).stat().st_size}, 'image/jpeg', 'Início do acompanhamento H5')""")
    # o aluno com CPF (a trava do /c/)
    q(f"""insert into {S}.pacientes (nome, cpf, conta_id, nutricionista_id, personal_id, origem, ativo)
          values ({B.q(NOME_CPF)}, '{CPF_EXISTE}', '{conta}', '{camila}', '{B.uid('w13-dono')}', 'novo', true)""")
    print("massa H5 montada: 2 metas (+✓), 2 antropometrias, 3 fotos, 1 aluno com CPF")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limpar", action="store_true")
    a = ap.parse_args()
    B.saude_ok("massa H5")
    conta = B.conta_w13()
    raf = B.rafael(conta)
    limpar(conta, raf)
    if not a.limpar:
        montar(conta, raf)
    return 0


if __name__ == "__main__":
    sys.exit(main())
