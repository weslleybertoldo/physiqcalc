"""Physiq W15 — base dos testes de ponta a ponta do Perfil do aluno › Treino (editor da tela 8, lado esquerdo) e do card
Treino do Resumo (tela 7). Reaproveita a base da W14/W13 (a "Consultoria Ferreira W13": Lucas dono + personal, Camila
nutricionista, Bruno 2º personal, Rafael Moura aluno com login, Treino + Nutrição — o aluno das telas 7 e 8).

Funções do Treino chamadas COMO a pessoa (token do Treino da troca de token), com x-schema. Sem segredo no repo: chaves pela
Management API (~/.pc-pat), senhas das contas de TESTE em ~/.physiq-teste-<nome>.
"""
from __future__ import annotations

import importlib.util
import json
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
_ESPEC = importlib.util.spec_from_file_location("_base_w14", Path(__file__).parent.parent / "w14" / "_base.py")
B14 = importlib.util.module_from_spec(_ESPEC)
sys.modules["_base_w14"] = B14
_ESPEC.loader.exec_module(B14)  # type: ignore[union-attr]
B13 = B14.B13
B5 = B13.B5

p = B14.p
ESTADO, CONTAS, EMAIL, NOMES = B14.ESTADO, B14.CONTAS, B14.EMAIL, B14.NOMES
Caso, sql_principal, sql_treino, saude_treino = B14.Caso, B14.sql_principal, B14.sql_treino, B14.saude_treino
http, service, anon, rpc, uid, sessao, token = B14.http, B14.service, B14.anon, B14.rpc, B14.uid, B14.sessao, B14.token
PRINCIPAL_REF, PRINCIPAL_URL, API_P = B14.PRINCIPAL_REF, B14.PRINCIPAL_URL, B14.API_P
TREINO_REF = B5.TREINO_REF
API_T = "https://api.physiqcalc.com.br"
conta_de, NOME_CONTA = B14.conta_de, B14.NOME_CONTA
exec_treino = B5.exec_treino
PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "w15"
for _b in (B14, B13, B5, B13.B12, B13.B12.B11, B13.B12.B10, B13.B12.B8, B13.B12.B7):
    _b.PRINTS = PRINTS
SCRATCH = Path.home() / "projetos" / "physiqcalc-scratch" / "w15"
saude_ok, esperar, treino_id = B14.saude_ok, B14.esperar, B14.treino_id

# os 5 exercícios do treino A da tela 8 (a prescrição que o E2E digita no editor) — nomes da biblioteca global (81 com GIF)
TREINO_A = [
    ("Supino Reto com Barra", 4, "10", 60, 60),
    ("Supino Inclinado", 4, "10", 60, 24),
    ("Crucifixo com Halteres", 3, "12", 45, 14),
    ("Tríceps Francês com Halter", 3, "12", 45, 18),
    ("Tríceps Pulley", 4, "12", 60, 25),
]
TREINO_B = ["Puxada Aberta Frontal", "Remada Curvada com Barra", "Remada Unilateral com Halter", "Rosca Direta com Barra"]
TREINO_C = ["Agachamento Livre", "Leg Press", "Levantamento Terra Romeno (Stiff)", "Elevação Pélvica"]
OBSERVACAO = "Desça a barra em 3 segundos no supino. Se passar de 12 repetições no tríceps, suba 2 kg na próxima série."


def schema() -> str:
    return ESTADO["schema"]


_tok_treino: dict[str, tuple[float, str]] = {}


def token_treino(conta: str) -> str:
    """Sessão do Banco do Treino da pessoa (a troca de token do app), guardada por 40 min para não gastar o limite (20/h)."""
    agora = time.time()
    if conta in _tok_treino and agora - _tok_treino[conta][0] < 2400:
        return _tok_treino[conta][1]
    st, r = B5.trocar_token(conta)
    assert st == 200 and r.get("access_token"), (conta, st, r)
    _tok_treino[conta] = (agora, r["access_token"])
    return r["access_token"]


def funcao_treino(conta_ou_token: str, nome: str, corpo: dict, origem: str = "https://physiqcalc-staging.vercel.app",
                  base: str = API_T) -> tuple[int, dict]:
    """Chama uma função admin-* do Treino como a pessoa (JWT do Treino), no schema do teste."""
    tok = token_treino(conta_ou_token) if conta_ou_token in CONTAS else conta_ou_token
    st, r, _ = http("POST", f"{base}/functions/v1/{nome}", corpo,
                    {"apikey": anon(TREINO_REF), "Authorization": f"Bearer {tok}", "x-schema": schema(), "Origin": origem}, timeout=90)
    return st, (r if isinstance(r, dict) else {"bruto": r})


def semana(conta: str, acao: str, aluno: str, **extra) -> tuple[int, dict]:
    return funcao_treino(conta, "admin-semana-treinos", {"action": acao, "userId": aluno, **extra})


def exercicio_id(nome: str) -> str:
    r = sql_treino(f"select id::text from {schema()}.tb_exercicios where nome = $n${nome}$n$ and professor_id is null limit 1")
    assert r, f"exercício não achado: {nome}"
    return r[0]["id"]


def linhas_prescricao(aluno: str) -> list[dict]:
    return sql_treino(f"""select grupo_id::text, grupo_usuario_id::text, exercicio_id::text, exercicio_usuario_id::text, num_series,
                                 reps_alvo, descanso_segundos, carga_sugerida_kg::float as carga, observacao
                            from {schema()}.tb_series_padrao_usuario where user_id = '{aluno}'""")


def json_arquivo(caminho: Path, dados) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text(json.dumps(dados, ensure_ascii=False, indent=2, default=str), encoding="utf-8")


def ler_json(caminho: Path) -> dict:
    return json.loads(caminho.read_text(encoding="utf-8")) if caminho.exists() else {}
