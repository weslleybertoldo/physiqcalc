"""Physiq W23 — base dos testes de ponta a ponta do Painel › Treinos (Meus treinos, Biblioteca, Histórico, Relatório) e da faixa
"Ligar para todos" do personal (herdado da W22). Reaproveita a base da W15 → W14 → W13 (a "Consultoria Ferreira W13": Lucas dono
+ personal, Camila nutricionista, Bruno 2º personal, Rafael Moura aluno com login, Treino + Nutrição).

Funções do Treino chamadas COMO a pessoa (token do Treino da troca de token), com x-schema. Sem segredo no repo: chaves pela
Management API (~/.pc-pat), senhas das contas de TESTE em ~/.physiq-teste-<nome>.
"""
from __future__ import annotations

import importlib.util
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
_ESPEC = importlib.util.spec_from_file_location("_base_w15", Path(__file__).parent.parent / "w15" / "_base.py")
B15 = importlib.util.module_from_spec(_ESPEC)
sys.modules["_base_w15"] = B15
_ESPEC.loader.exec_module(B15)  # type: ignore[union-attr]
B14, B13, B5 = B15.B14, B15.B13, B15.B5

p = B15.p
ESTADO, CONTAS, EMAIL, NOMES = B15.ESTADO, B15.CONTAS, B15.EMAIL, B15.NOMES
Caso, sql_principal, sql_treino, saude_treino = B15.Caso, B15.sql_principal, B15.sql_treino, B15.saude_treino
http, service, anon, rpc, uid, sessao, token = B15.http, B15.service, B15.anon, B15.rpc, B15.uid, B15.sessao, B15.token
PRINCIPAL_REF, PRINCIPAL_URL, API_P, TREINO_REF, API_T = B15.PRINCIPAL_REF, B15.PRINCIPAL_URL, B15.API_P, B15.TREINO_REF, B15.API_T
exec_treino, funcao_treino, token_treino, exercicio_id = B15.exec_treino, B15.funcao_treino, B15.token_treino, B15.exercicio_id
conta_de, NOME_CONTA = B15.conta_de, B15.NOME_CONTA
saude_ok, esperar, treino_id, json_arquivo, ler_json = B15.saude_ok, B15.esperar, B15.treino_id, B15.json_arquivo, B15.ler_json
# SQL do Treino pelo psql do pooler (~/.pgpass): sem o limite por minuto da Management API (a W7 tinha trocado para a API num dia
# em que o pooler falhou — se ele falhar de novo, cai na API). Vale para todas as bases da cadeia (w05 → w15).
import _comum  # noqa: E402 — o da W2 (já no sys.path pela base da W5)


def _sql_treino(query: str) -> list:
    try:
        return _comum.sql_treino(query)
    except Exception:  # noqa: BLE001 — pooler fora: Management API
        time.sleep(1)
        return _comum.sql_mgmt(B5.TREINO_REF, query)


def _exec_treino(comando: str) -> None:
    try:
        _comum.exec_treino(comando)
    except RuntimeError as e:
        if "psql:" in str(e) and ("timeout" in str(e).lower() or "connect" in str(e).lower()):
            time.sleep(1)
            _comum.sql_mgmt(B5.TREINO_REF, comando)
        else:
            raise


for _nome, _mod in list(sys.modules.items()):
    if _nome.startswith("_base_w"):
        if hasattr(_mod, "sql_treino"):
            _mod.sql_treino = _sql_treino
        if hasattr(_mod, "exec_treino"):
            _mod.exec_treino = _exec_treino
sql_treino, exec_treino = _sql_treino, _exec_treino

PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "w23"
for _b in (B15, B14, B13, B5, B13.B12, B13.B12.B11, B13.B12.B10, B13.B12.B8, B13.B12.B7):
    _b.PRINTS = PRINTS
SCRATCH = Path.home() / "projetos" / "physiqcalc-scratch" / "w23"
GIF_TESTE = Path(__file__).resolve().parents[2] / "public" / "exercicios"

# a pasta e os 3 treinos-modelo da W23 (os exercícios da biblioteca global — 81 com GIF); A leva a prescrição da tela 8
PASTA = "Hipertrofia W23"
TREINO_A = "A · Peito e tríceps W23"
TREINO_B = "B · Costas e bíceps W23"
TREINO_C = "C · Pernas W23"
EXS_A = [
    ("Supino Reto com Barra", 4, "10", 60, 60),
    ("Supino Inclinado com Barra", 4, "10", 60, 24),
    ("Crucifixo com Halteres", 3, "12", 45, 14),
    ("Tríceps Francês com Halter", 3, "12", 45, 18),
    ("Tríceps Pulley", 4, "12", 60, 25),
]
EXS_B = ["Puxada Frontal Aberta", "Remada Curvada com Barra", "Rosca Martelo com Halteres", "Rosca Direta com Barra"]
EXS_C = ["Agachamento Livre com Barra", "Leg Press 45°", "Levantamento Terra Romeno (Stiff)", "Elevação Pélvica com Barra"]
# o exercício PRÓPRIO novo (Biblioteca › Minha): mesmo movimento e músculo da Rosca Martelo com Halteres, outro equipamento
PROPRIO = "Rosca Martelo com Kettlebell W23"


def schema() -> str:
    return ESTADO["schema"]


def ids() -> dict:
    lucas, rafael, bruno = treino_id("w13-dono"), treino_id("w13-aluno"), treino_id("w13-personal2")
    assert lucas and rafael, "rode antes o e2e/w13/massa.py e entre uma vez com o Lucas e o Rafael no staging"
    return {"lucas": lucas, "rafael": rafael, "bruno": bruno}


def semana(conta: str, acao: str, aluno: str | None = None, **extra) -> tuple[int, dict]:
    corpo = {"action": acao, **({"userId": aluno} if aluno else {}), **extra}
    return funcao_treino(conta, "admin-semana-treinos", corpo)


def grupo_id(nome: str, dono: str) -> str | None:
    r = sql_treino(f"select id::text from {schema()}.tb_grupos_treino where nome = $n${nome}$n$ and professor_id = '{dono}' order by created_at desc limit 1")
    return r[0]["id"] if r else None


def linhas_modelo(gid: str) -> list[dict]:
    return sql_treino(f"""select e.nome, ge.ordem, ge.num_series, ge.reps_alvo, ge.descanso_segundos, ge.carga_sugerida_kg::float as carga
                            from {schema()}.tb_grupos_exercicios ge join {schema()}.tb_exercicios e on e.id = ge.exercicio_id
                           where ge.grupo_id = '{gid}' order by ge.ordem, e.nome""")


def recebe(gid: str, aluno: str) -> bool:
    return bool(sql_treino(f"select 1 from {schema()}.tb_grupos_treino_perfis where grupo_id = '{gid}' and user_id = '{aluno}'"))


def prescricao_aluno(aluno: str, gid: str) -> dict[str, dict]:
    rs = sql_treino(f"""select e.nome, s.num_series, s.reps_alvo, s.descanso_segundos, s.carga_sugerida_kg::float as carga
                          from {schema()}.tb_series_padrao_usuario s join {schema()}.tb_exercicios e on e.id = s.exercicio_id
                         where s.user_id = '{aluno}' and s.grupo_id = '{gid}'""")
    return {r["nome"]: r for r in rs}


def pausa(s: float = 2.0) -> None:
    time.sleep(s)
