"""Physiq W7b — base dos testes de ponta a ponta do aluno SEM profissional (a "conta do app"): entrar sozinho (Boas-vindas),
planos do app (Treino · Treino + Alimentação, com os preços do banco), 7 dias grátis, trava do inadimplente, Pix (sandbox),
trocar de plano, treinos prontos (viram o treino do aluno), pratos prontos (TACO), vincular a um profissional (a assinatura do
app é cancelada), o profissional tirar da lista (volta para o app com 7 dias) e o master vendo os alunos do app.
Sem segredo no repo: chaves pela Management API (~/.pc-pat), senhas das contas de TESTE em ~/.physiq-teste-<nome>.

Contas de TESTE da W7b (staging; SÓ *.teste.claude@physiqnutri.app — P26; criadas por e2e/w07b/contas.py):
  w7b-novo      w7b.novo.teste.claude@physiqnutri.app       "Ana Lima" — entra SEM código pelas Boas-vindas (a tela nova)
  w7b-sozinho   w7b.sozinho.teste.claude@physiqnutri.app    "Bruno Sozinho" — aluno do app, Treino + Alimentação (API)
  w7b-treino    w7b.treino.teste.claude@physiqnutri.app     "Carla Treino" — aluno do app só Treino (sem os pratos)
  w7b-vence     w7b.vence.teste.claude@physiqnutri.app      "Davi Vence" — teste grátis que acabou: trava, Pix, libera
  w7b-vincula   w7b.vincula.teste.claude@physiqnutri.app    "Eva Vincula" — do app com cobrança automática → vai para o Lucas
  w7b-removido  w7b.removido.teste.claude@physiqnutri.app   "Fabio Removido" — do Lucas; o Lucas tira da lista → volta ao app
O profissional é o "Lucas Ferreira" da W7 (PROF-LUCAS-FERREIRA, conta nova "Consultoria Ferreira W7" no staging).
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

sys.dont_write_bytecode = True
_ESPEC = importlib.util.spec_from_file_location("_base_w07", Path(__file__).parent.parent / "w07" / "_base.py")
B7 = importlib.util.module_from_spec(_ESPEC)
sys.modules["_base_w07"] = B7
_ESPEC.loader.exec_module(B7)  # type: ignore[union-attr]

B5 = B7.B5
p = B7.p
ESTADO, CONTAS = B7.ESTADO, B7.CONTAS
API_P, API_T, PRINCIPAL_REF, PRINCIPAL_URL, TREINO_REF, TREINO_URL = B7.API_P, B7.API_T, B7.PRINCIPAL_REF, B7.PRINCIPAL_URL, B7.TREINO_REF, B7.TREINO_URL
Caso, anon, http, service, sql_principal, sql_treino, senha_de, sessao, funcao, rpc, uid, treino_id = (
    B7.Caso, B7.anon, B7.http, B7.service, B7.sql_principal, B7.sql_treino, B7.senha_de, B7.sessao, B7.funcao, B7.rpc, B7.uid, B7.treino_id)
garantir_usuario, trocar_token, processar_espelho, espelho_segredo, saude_treino, token, esquecer_token = (
    B7.garantir_usuario, B7.trocar_token, B7.processar_espelho, B7.espelho_segredo, B7.saude_treino, B7.token, B7.esquecer_token)

PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "w07b"
B5.PRINTS = PRINTS
B7.PRINTS = PRINTS
BACKUP = Path.home() / "backups" / "physiq" / "2026-09-29-w07b"

NOMES = {
    "w7b-novo": "Ana Lima",
    "w7b-sozinho": "Bruno Sozinho",
    "w7b-treino": "Carla Treino",
    "w7b-vence": "Davi Vence",
    "w7b-vincula": "Eva Vincula",
    "w7b-removido": "Fabio Removido",
}
EMAIL = {k: f"{k.replace('w7b-', 'w7b.')}.teste.claude@physiqnutri.app" for k in NOMES}
for k in NOMES:
    CONTAS.setdefault(k, (EMAIL[k], senha_de(k)))
# as da W7 que a W7b usa (o profissional e um aluno com profissional)
for k in ("w7-personal", "w7-aluno"):
    CONTAS.setdefault(k, (B7.EMAIL[k], senha_de(k)))

CODIGO_LUCAS = "PROF-LUCAS-FERREIRA"


def schema() -> str:
    return ESTADO["schema"]


def conta_do_app() -> str:
    return sql_principal(f"select {schema()}.conta_do_app()::text as id")[0]["id"]


def app_da(conta: str) -> dict | None:
    """A matrícula do app (a mais recente) da conta de teste."""
    u = uid(conta)
    if not u:
        return None
    r = sql_principal(f"""select p.id::text as id, p.ativo, p.objetivo_app, p.app_teste_de::text as teste_de, p.app_teste_ate::text as teste_ate,
                                 p.mensalidade_pago_ate::text as pago_ate, p.mensalidade_valor::text as valor, p.cobranca_pausada as pausada,
                                 p.app_encerrada_em::text as encerrada_em, p.app_encerrada_motivo as encerrada_motivo,
                                 (select pa.codigo from {schema()}.planos_aluno pa where pa.id = p.plano_aluno_id) as plano
                            from {schema()}.pacientes p where p.user_id = '{u}' and p.conta_id = {schema()}.conta_do_app() and p.deleted_at is null
                           order by p.created_at desc limit 1""")
    return r[0] if r else None


def matriculas_de(conta: str) -> list[dict]:
    u = uid(conta)
    if not u:
        return []
    return sql_principal(f"""select p.id::text as id, p.ativo, c.origem, c.nome as conta, p.personal_id::text as personal_id,
                                    p.desvinculado_em::text as desvinculado_em
                               from {schema()}.pacientes p left join {schema()}.contas c on c.id = p.conta_id
                              where p.user_id = '{u}' and p.deleted_at is null order by p.created_at""")


def json_arquivo(caminho: Path, dados) -> None:
    B7.json_arquivo(caminho, dados)
