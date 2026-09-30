"""Physiq W14 — base dos testes de ponta a ponta do Perfil do aluno no painel (dados, acesso e ajustes + falhas F1 e F2).
Reaproveita a base da W13 (contas w13.*, a "Consultoria Ferreira W13": Lucas dono + personal, Camila nutricionista, Rafael
Moura aluno com login, Treino + Nutrição — o aluno da tela 7). Sem segredo no repo: chaves pela Management API (~/.pc-pat).
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

sys.dont_write_bytecode = True
_ESPEC = importlib.util.spec_from_file_location("_base_w13", Path(__file__).parent.parent / "w13" / "_base.py")
B13 = importlib.util.module_from_spec(_ESPEC)
sys.modules["_base_w13"] = B13
_ESPEC.loader.exec_module(B13)  # type: ignore[union-attr]

p = B13.p
ESTADO, CONTAS, EMAIL, NOMES = B13.ESTADO, B13.CONTAS, B13.EMAIL, B13.NOMES
Caso, sql_principal, sql_treino, saude_treino = B13.Caso, B13.sql_principal, B13.sql_treino, B13.saude_treino
http, service, anon, rpc, uid, sessao, token = B13.http, B13.service, B13.anon, B13.rpc, B13.uid, B13.sessao, B13.token
PRINCIPAL_REF, PRINCIPAL_URL, API_P = B13.PRINCIPAL_REF, B13.PRINCIPAL_URL, B13.API_P
conta_de, NOME_CONTA = B13.conta_de, B13.NOME_CONTA
PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "w14"
for _b in (B13, B13.B5, B13.B12, B13.B12.B11, B13.B12.B10, B13.B12.B8, B13.B12.B7):
    _b.PRINTS = PRINTS
SCRATCH = Path.home() / "projetos" / "physiqcalc-scratch" / "w14"

# telefones de TESTE que não existem (DDD 00): nenhuma mensagem chega a ninguém, mesmo se um dia o agente enviar
TEL_TESTE = {"Rafael Moura": "00900001401", "Marina Alves": "00900001402", "Beatriz Lima": "00900001403"}


def schema() -> str:
    return ESTADO["schema"]


def paciente(nome: str, conta: str) -> dict | None:
    r = sql_principal(f"select id::text, user_id::text, treino_user_id::text, link_codigo, config, telefone, nascimento::text, genero, "
                      f"resumo, objetivo, ativo, updated_at::text from {schema()}.pacientes where conta_id = '{conta}' and nome = $n${nome}$n$ "
                      f"and deleted_at is null order by created_at limit 1")
    return r[0] if r else None


# /health do Treino antes de cada bloco (lento > 10 s ou UNHEALTHY → para, sem restart) e espera com polling: os da W13
saude_ok, esperar, treino_id, status_treino = B13.saude_ok, B13.esperar, B13.treino_id, B13.status_treino
