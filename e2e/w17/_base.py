"""Physiq W17 — base dos testes de ponta a ponta: (item 2) o "Salvar e enviar ao aluno" da tela 8 com e-mail e o atalho do
WhatsApp; (item 3) o Perfil do aluno › Avaliação. Reaproveita a base da W16/W15/W14/W13 (a "Consultoria Ferreira W13": Lucas
dono + personal, Camila nutricionista, Bruno 2º personal, Rafael Moura aluno com login, Treino + Nutrição).

Contas de TESTE desta W (criadas pela e2e/w17/massa.py; só *.teste.claude@physiqnutri.app — P26):
  w17-envio    w17.envio.teste.claude@physiqnutri.app   aluno da Camila COM login (o e-mail e o telefone mudam no teste)

Sem segredo no repo: chaves pela Management API (~/.pc-pat), senhas das contas de TESTE em ~/.physiq-teste-<nome>.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

sys.dont_write_bytecode = True
_ESPEC = importlib.util.spec_from_file_location("_base_w16", Path(__file__).parent.parent / "w16" / "_base.py")
B16 = importlib.util.module_from_spec(_ESPEC)
sys.modules["_base_w16"] = B16
_ESPEC.loader.exec_module(B16)  # type: ignore[union-attr]
B15, B14, B13, B5 = B16.B15, B16.B14, B16.B13, B16.B5

p = B16.p
ESTADO, CONTAS, EMAIL, NOMES = B16.ESTADO, B16.CONTAS, B16.EMAIL, B16.NOMES
Caso, sql_principal, sql_treino, saude_treino = B16.Caso, B16.sql_principal, B16.sql_treino, B16.saude_treino
http, service, anon, rpc, uid, sessao, token = B16.http, B16.service, B16.anon, B16.rpc, B16.uid, B16.sessao, B16.token
PRINCIPAL_REF, PRINCIPAL_URL, API_P, API_T, TREINO_REF = B16.PRINCIPAL_REF, B16.PRINCIPAL_URL, B16.API_P, B16.API_T, B16.TREINO_REF
conta_de, NOME_CONTA, conta_w13, rafael = B16.conta_de, B16.NOME_CONTA, B16.conta_w13, B16.rafael
saude_ok, esperar, treino_id = B16.saude_ok, B16.esperar, B16.treino_id
token_treino, funcao_treino = B16.token_treino, B16.funcao_treino
json_arquivo, ler_json = B16.json_arquivo, B16.ler_json
PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "w17"
for _b in (B16, B15, B14, B13, B5, B13.B12, B13.B12.B11, B13.B12.B10, B13.B12.B8, B13.B12.B7):
    _b.PRINTS = PRINTS
SCRATCH = Path.home() / "projetos" / "physiqcalc-scratch" / "w17"

EMAIL_ENVIO = "w17.envio.teste.claude@physiqnutri.app"
NOME_ENVIO = "Aluno Envio W17"
TELEFONE_ENVIO = "00900001701"  # número de mentira (nenhum WhatsApp de verdade)
CONTAS["w17-envio"] = (EMAIL_ENVIO, B5.senha_de("w17-envio"))

# item 3 (Avaliação): a massa da W10 — "Diego Almeida" (w10-aluno) na "Consultoria Ferreira W7": w7-personal = dono + personal
# (Lucas Ferreira), w7-nutri = nutricionista (Camila Rocha); 6 avaliações do Treino + 2 antropometrias + fotos das 2 origens
for _k, _e in (("w7-personal", "w7.personal.teste.claude@physiqnutri.app"), ("w7-nutri", "w7.nutri.teste.claude@physiqnutri.app"),
               ("w10-aluno", "w10.aluno.teste.claude@physiqnutri.app"), ("w10-paciente", "w10.paciente.teste.claude@physiqnutri.app")):
    CONTAS.setdefault(_k, (_e, B5.senha_de(_k)))
DIEGO = "2102f4e1-1950-44d9-be55-94bb9cd6fee3"
PAULA = "bc3ce350-f197-4e2f-9690-5c2648b1ba42"
CONTA_W7 = "46a4f549-8daf-4d56-a49c-7b059ceab471"


def bucket_do_ambiente(nome: str) -> str:
    """hml-02b (H-14): no staging os buckets de dado de saúde têm versão própria "-staging"."""
    return f"{nome}-staging" if ESTADO["schema"] == "staging" else nome
