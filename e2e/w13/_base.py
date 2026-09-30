"""Physiq W13 — base dos testes de ponta a ponta da página Alunos do painel (+ F5 "Bloquear" com efeito).
Login como o app: sessão do banco principal injetada no aparelho (W3); o app troca o token do Treino sozinho.
Contas (só *.teste.claude@physiqnutri.app — P26; senhas em ~/.physiq-teste-<nome>, criadas por e2e/w13/massa.py):
  w13-dono      "Lucas Ferreira"  dono + personal da "Consultoria Ferreira W13" (conta nova, em teste: até 10 alunos)
  w13-nutri     "Camila Rocha"    nutricionista da mesma conta
  w13-personal2 "Bruno Lima"      2º personal da conta (P1: vê só os alunos dele)
  w13-aluno     "Rafael Moura"    aluno com login (Treino + Nutrição): bloquear/desbloquear e a trava do app
  w13-limite    "Paula Limite"    dona + personal da "Conta Limite W13" (f10): o 11º aluno é recusado
Sem segredo no repo: chaves pela Management API (~/.pc-pat).
"""
from __future__ import annotations

import importlib.util
import json
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
_ESPEC = importlib.util.spec_from_file_location("_base_w12", Path(__file__).parent.parent / "w12" / "_base.py")
B12 = importlib.util.module_from_spec(_ESPEC)
sys.modules["_base_w12"] = B12
_ESPEC.loader.exec_module(B12)  # type: ignore[union-attr]
B5 = B12.B5
p = B12.p
ESTADO, CONTAS = B12.ESTADO, B12.CONTAS
Caso, sql_principal, sql_treino, saude_treino = B12.Caso, B12.sql_principal, B12.sql_treino, B12.saude_treino
http, service, anon, rpc, uid, treino_id, sessao = B5.http, B5.service, B5.anon, B5.rpc, B5.uid, B5.treino_id, B5.sessao
PRINCIPAL_REF, PRINCIPAL_URL, TREINO_REF = B5.PRINCIPAL_REF, B5.PRINCIPAL_URL, B5.TREINO_REF
API_P = "https://api-principal.physiqcalc.com.br"
PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "w13"
for _b in (B5, B12, B12.B11, B12.B10, B12.B8, B12.B7):
    _b.PRINTS = PRINTS
SCRATCH = Path.home() / "projetos" / "physiqcalc-scratch" / "w13"
FOTOS = Path("/home/bertoldo/Desktop/Physiq Unificado - estrutura/Telas premium/fonte (gerador)/assets/fotos")

EMAIL = {
    "w13-dono": "w13.dono.teste.claude@physiqnutri.app",
    "w13-nutri": "w13.nutri.teste.claude@physiqnutri.app",
    "w13-personal2": "w13.personal2.teste.claude@physiqnutri.app",
    "w13-aluno": "w13.aluno.teste.claude@physiqnutri.app",
    "w13-limite": "w13.limite.teste.claude@physiqnutri.app",
    "w13-convidado": "w13.convidado.teste.claude@physiqnutri.app",
}
NOMES = {
    "w13-dono": "Lucas Ferreira", "w13-nutri": "Camila Rocha", "w13-personal2": "Bruno Lima", "w13-aluno": "Rafael Moura",
    "w13-limite": "Paula Limite", "w13-convidado": "Julia Convidada",
}
for _k, _e in EMAIL.items():
    CONTAS[_k] = (_e, B5.senha_de(_k))
NOME_CONTA = "Consultoria Ferreira W13"
NOME_CONTA_LIMITE = "Conta Limite W13"


def schema() -> str:
    return ESTADO["schema"]


def token(conta: str) -> str:
    return sessao(conta)["access_token"]


def alunos(conta_ou_token: str, acao: str, corpo: dict | None = None, origem: str = "https://physiqcalc-staging.vercel.app") -> tuple[int, dict]:
    """Chama a função alunos do principal como a pessoa (ou sem login, se conta_ou_token for "")."""
    tok = (token(conta_ou_token) if conta_ou_token in CONTAS else conta_ou_token) or anon(PRINCIPAL_REF)
    st, r, _ = http("POST", f"{API_P}/functions/v1/alunos", {"acao": acao, **(corpo or {})},
                    {"apikey": anon(PRINCIPAL_REF), "Authorization": f"Bearer {tok}", "x-schema": schema(), "Origin": origem}, timeout=90)
    return st, (r if isinstance(r, dict) else {"bruto": r})


def lista(conta: str, conta_id: str, filtros: dict | None = None, limite: int = 50) -> dict:
    st, r = rpc(conta, "alunos_da_conta", {"p_conta": conta_id, "p_filtros": filtros or {}, "p_offset": 0, "p_limite": limite})
    assert st == 200, (st, r)
    return r  # type: ignore[return-value]


def conta_de(conta: str, nome: str) -> str | None:
    u = uid(conta)
    r = sql_principal(f"select id::text from {schema()}.contas where dono_id = '{u}' and nome = $n${nome}$n$ order by criado_em limit 1")
    return r[0]["id"] if r else None


def paciente(nome: str, conta_id: str) -> dict | None:
    r = sql_principal(f"""select id::text, user_id::text, treino_user_id::text, ativo, acesso_bloqueado_em, deleted_at, personal_id::text,
                                 nutricionista_id::text from {schema()}.pacientes
                           where conta_id = '{conta_id}' and nome = $n${nome}$n$ order by created_at limit 1""")
    return r[0] if r else None


def status_treino(treino_user: str) -> str | None:
    r = sql_treino(f"select status from {schema()}.physiq_profiles where id = '{treino_user}'")
    return r[0]["status"] if r else None


def sessoes_treino(treino_user: str) -> int:
    return int(sql_treino(f"select count(*) as n from auth.sessions where user_id = '{treino_user}'")[0]["n"])


def esperar(cond, timeout: float, passo: float = 2.0):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            v = cond()
            if v:
                return v
        except Exception:  # noqa: BLE001
            pass
        time.sleep(passo)
    return None


def saude_ok(rotulo: str) -> None:
    """O Banco do Treino (VM Nano) trava com carga: confere o /health antes de cada bloco; lento ou UNHEALTHY → para."""
    t0 = time.time()
    ok = saude_treino()
    dt = time.time() - t0
    print(f"   /health do Treino antes de {rotulo}: {'ok' if ok else 'RUIM'} ({dt:.1f}s)", flush=True)
    if not ok or dt > 10:
        raise SystemExit(f"PARADO: Banco do Treino {'UNHEALTHY' if not ok else 'lento'} antes de {rotulo} — não reinicio nada")


def json_arquivo(caminho: Path, dados) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text(json.dumps(dados, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
