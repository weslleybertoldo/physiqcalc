"""Physiq W7 — base dos testes de ponta a ponta do Perfil do aluno (tela 5) e da falha F4 (Exportar e Excluir para qualquer
aluno — C88, R11, P19), mais o popup "confirmar o profissional" do vínculo por código. Sem segredo no repo: chaves pela
Management API (~/.pc-pat), senhas das contas de TESTE em ~/.physiq-teste-<nome>.

Contas de TESTE da W7 (staging; SÓ *.teste.claude@physiqnutri.app — P26; criadas por e2e/w07/contas.py):
  w7-personal   w7.personal.teste.claude@physiqnutri.app    "Lucas Ferreira" — dono + personal da "Consultoria Ferreira W7"
  w7-nutri      w7.nutri.teste.claude@physiqnutri.app       "Camila Rocha" — nutricionista da mesma conta
  w7-aluno      w7.aluno.teste.claude@physiqnutri.app       "Rafael Moura" — Treino + Nutrição (a tela 5), agenda e mensalidade
  w7-treino     w7.treino.teste.claude@physiqnutri.app      "Bruno Treino" — só Treino
  w7-paciente   w7.paciente.teste.claude@physiqnutri.app    "Paula Nutri" — só Nutrição, com agenda (próximas + 3 meses)
  w7-staff      w7.staff.teste.claude@physiqnutri.app       "Sofia Staff" — dona da própria conta E aluna do Lucas (o Excluir
                                                            do Perfil recusa: profissional não exclui pelo app do aluno)
  excluir1      excluir1.teste.claude@physiqnutri.app       DESCARTÁVEL — Treino + Nutrição, com dados; Exportar e Excluir
  excluir2      excluir2.teste.claude@physiqnutri.app       DESCARTÁVEL — "aluno sem professor" (vem do Calc): o código do
                                                            profissional no Perfil (popup), depois é excluído
  excluir3      excluir3.teste.claude@physiqnutri.app       DESCARTÁVEL — o link ?prof= (logado e deslogado), depois excluído
Nenhuma conta real, nenhuma conta de teste de outra W: Exportar/Excluir só nas descartáveis desta W (auth.users é um só
por projeto — excluir no staging apaga o login DE VERDADE).
"""
from __future__ import annotations

import importlib.util
import json
import sys
import time
from pathlib import Path

_ESPEC = importlib.util.spec_from_file_location("_base_w05", Path(__file__).parent.parent / "w05" / "_base.py")
B5 = importlib.util.module_from_spec(_ESPEC)
sys.modules["_base_w05"] = B5
_ESPEC.loader.exec_module(B5)  # type: ignore[union-attr]

ADMIN, API_P, API_T, CONTAS, ESTADO = B5.ADMIN, B5.API_P, B5.API_T, B5.CONTAS, B5.ESTADO
PRINCIPAL_REF, PRINCIPAL_URL, TREINO_REF, TREINO_URL = B5.PRINCIPAL_REF, B5.PRINCIPAL_URL, B5.TREINO_REF, B5.TREINO_URL
Caso, anon, exec_treino, http, p, service = B5.Caso, B5.anon, B5.exec_treino, B5.http, B5.p, B5.service
sql_principal, sql_treino, senha_de, sessao, funcao, rpc, uid, treino_id = (
    B5.sql_principal, B5.sql_treino, B5.senha_de, B5.sessao, B5.funcao, B5.rpc, B5.uid, B5.treino_id)
garantir_usuario, trocar_token, processar_espelho, espelho_segredo = B5.garantir_usuario, B5.trocar_token, B5.processar_espelho, B5.espelho_segredo

# 29/09 ~18:30: o pooler de sessão (Supavisor, porta 5432) do Treino passou a devolver "Failed to connect to database: timeout"
# por minutos, com o banco saudável (Management API em < 1 s, 15 de 60 conexões) — o SQL do Treino dos testes da W7 vai pela
# Management API (o mesmo caminho das migrações do principal); as funções da W5 que o usam passam a usar este também.
def _mgmt(query: str) -> list:
    import _comum  # noqa: PLC0415 — o da W2 (já no sys.path pela base da W5)
    return _comum.sql_mgmt(TREINO_REF, query)


def _exec_treino_api(comando: str) -> None:
    _mgmt(comando)


sql_treino = B5.sql_treino = _mgmt
exec_treino = B5.exec_treino = _exec_treino_api

PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "w07"
B5.PRINTS = PRINTS
BACKUP = Path.home() / "backups" / "physiq" / "2026-09-29-w07"
FOTOS = Path("/home/bertoldo/Desktop/Physiq Unificado - estrutura/Telas premium/fonte (gerador)/assets/fotos")

NOMES = {
    "w7-personal": "Lucas Ferreira",
    "w7-nutri": "Camila Rocha",
    "w7-aluno": "Rafael Moura",
    "w7-treino": "Bruno Treino",
    "w7-paciente": "Paula Nutri",
    "w7-staff": "Sofia Staff",
    "excluir1": "Excluir Um W7",
    "excluir2": "Excluir Dois W7",
    "excluir3": "Excluir Tres W7",
}
EMAIL = {k: f"{k.replace('w7-', 'w7.')}.teste.claude@physiqnutri.app" for k in NOMES}
for k in NOMES:
    CONTAS.setdefault(k, (EMAIL[k], senha_de(k)))
DESCARTAVEIS = ("excluir1", "excluir2", "excluir3")
NOME_CONTA = "Consultoria Ferreira W7"


def schema() -> str:
    return ESTADO["schema"]


def bucket_do_ambiente(nome: str) -> str:
    """hml-02b (H-14): no staging os buckets de dado de saúde têm versão própria "-staging"."""
    return f"{nome}-staging" if schema() == "staging" else nome


def saude_treino(limite_s: float = 10.0) -> bool:
    """/health do Banco do Treino (a VM Nano trava com carga): UNHEALTHY ou lento → o caso para (nada de restart aqui)."""
    t0 = time.time()
    st, r, _ = http("GET", f"https://api.supabase.com/v1/projects/{TREINO_REF}/health?services=db&services=auth&services=rest", None,
                    {"Authorization": f"Bearer {B5.pat() if hasattr(B5, 'pat') else Path.home().joinpath('.pc-pat').read_text().strip()}"}, timeout=30)
    dt_ = time.time() - t0
    ok = st == 200 and isinstance(r, list) and all(x.get("status") == "ACTIVE_HEALTHY" for x in r) and dt_ < limite_s
    print(f"   /health do Treino: {st} {[(x.get('name'), x.get('status')) for x in r] if isinstance(r, list) else r} em {dt_:.1f} s", flush=True)
    return ok


_tokens: dict[str, tuple[float, str]] = {}


def token(conta: str) -> str:
    agora = time.time()
    t = _tokens.get(conta)
    if t and agora - t[0] < 2400:
        return t[1]
    tok = sessao(conta)["access_token"]
    _tokens[conta] = (agora, tok)
    return tok


def esquecer_token(conta: str) -> None:
    _tokens.pop(conta, None)


def principal_id(conta: str) -> str | None:
    return uid(conta)


def matriculas(conta: str) -> list[dict]:
    u = uid(conta)
    if not u:
        return []
    return sql_principal(f"select id::text as id, ativo, treino_user_id::text as treino_user_id, config from {schema()}.pacientes where user_id = '{u}'")


def json_arquivo(caminho: Path, dados) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text(json.dumps(dados, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
