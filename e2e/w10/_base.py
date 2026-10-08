"""Physiq W10 — base dos testes de ponta a ponta da aba Evolução nova (tela 4).

Login como o app: sessão do banco principal injetada no aparelho (W3) + troca de token pelo próprio app. A aba lê o Banco do
Treino pelo REST (physiq_profiles, physiq_avaliacoes, physiq_registros_fotos — o schema do build: no local e no staging é o
`staging`) e o banco principal pela função minha_evolucao() (antropometrias e fotos de evolução). O PowerSync não entra aqui:
a P20 (staging lê o public pelo sync) não afeta esta aba — a massa dos 2 bancos fica toda no schema `staging`.

Contas (só *.teste.claude@physiqnutri.app ou teste@teste.com — P26; senhas em ~/.physiq-teste-<nome>):
  w10-aluno     w10.aluno.teste.claude@physiqnutri.app     "Diego Almeida" — Treino + Nutrição na "Consultoria Ferreira W7"
                (Lucas Ferreira, personal · Camila Rocha, nutricionista): avaliações do Calc + antropometrias + fotos dos 2 lados
  w10-paciente  w10.paciente.teste.claude@physiqnutri.app  "Paula Lima" — só Nutrição: 1 antropometria, sem fotos
  aluno-calc    teste@teste.com                            só Calc (o que via no UserDashboard: perfil + 5 avaliações no staging)
  w7-treino     w7.treino.teste.claude@physiqnutri.app     "Bruno Treino" — sem nenhuma avaliação (estado vazio; só leitura)
Sem segredo no repo: chaves pela Management API (~/.pc-pat).
"""
from __future__ import annotations

import importlib.util
import json
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
_ESPEC = importlib.util.spec_from_file_location("_base_w08", Path(__file__).parent.parent / "w08" / "_base.py")
B8 = importlib.util.module_from_spec(_ESPEC)
sys.modules["_base_w08"] = B8
_ESPEC.loader.exec_module(B8)  # type: ignore[union-attr]

B7, B5 = B8.B7, B8.B5
p = B8.p
ESTADO, CONTAS = B8.ESTADO, B8.CONTAS
Caso, sql_treino, sql_principal, saude_treino = B8.Caso, B8.sql_treino, B8.sql_principal, B8.saude_treino
http, service, anon, rpc, uid, treino_id, sessao = B5.http, B5.service, B5.anon, B5.rpc, B5.uid, B5.treino_id, B5.sessao
PRINCIPAL_REF, PRINCIPAL_URL, TREINO_REF, TREINO_URL = B5.PRINCIPAL_REF, B5.PRINCIPAL_URL, B5.TREINO_REF, B5.TREINO_URL

PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "w10"
B5.PRINTS = PRINTS
B7.PRINTS = PRINTS
B8.PRINTS = PRINTS
SCRATCH = Path.home() / "projetos" / "physiqcalc-scratch" / "w10"
FOTOS = Path("/home/bertoldo/Desktop/Physiq Unificado - estrutura/Telas premium/fonte (gerador)/assets/fotos")

ALUNO_CALC = "aluno-calc"  # teste@teste.com
NOMES = {"w10-aluno": "Diego Almeida", "w10-paciente": "Paula Lima"}
EMAIL = {"w10-aluno": "w10.aluno.teste.claude@physiqnutri.app", "w10-paciente": "w10.paciente.teste.claude@physiqnutri.app"}
for _k in NOMES:
    CONTAS.setdefault(_k, (EMAIL[_k], B5.senha_de(_k)))
CONTAS.setdefault("w7-treino", ("w7.treino.teste.claude@physiqnutri.app", B5.senha_de("w7-treino")))


def schema() -> str:
    return ESTADO["schema"]


def bucket_do_ambiente(nome: str) -> str:
    """hml-02b (H-14): no staging os buckets de dado de saúde têm versão própria "-staging"."""
    return f"{nome}-staging" if schema() == "staging" else nome


def json_arquivo(caminho: Path, dados) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text(json.dumps(dados, ensure_ascii=False, indent=2, default=str), encoding="utf-8")


def abrir(nav, base: str, prefixo: str, nome: str, conta: str, rota: str = "/evolucao", esperar: str | None = "[data-aba-evolucao]") -> "Caso":
    """Contexto limpo no celular (390 × 844 × 3,4 = 1326 × 2870, como as telas do app), sessão injetada e a rota."""
    c = Caso(nav, base, prefixo, nome, desktop=False)
    c.entrar(conta, rota, zerar=schema() == "staging")
    c.fechar_avisos()
    if esperar:
        ok = c.esperar(lambda: c.tem(esperar), 120)
        p.check(ok, f"[{nome}] {rota} abriu já logado ({esperar})")
        p.check(not c.caminho().startswith("/entrar"), f"[{nome}] não caiu na tela de entrada")
    return c


def pausa(s: float) -> None:
    time.sleep(s)
