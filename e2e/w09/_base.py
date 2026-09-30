"""Physiq W9 — base dos testes de ponta a ponta da troca de exercício por equivalente (tela 2) e dos campos da biblioteca (tela 8).

Reaproveita a base da W8 (login como o app: sessão do principal injetada + troca de token + PowerSync). P20: o PowerSync de
desenvolvimento está parado — local e staging LEEM o `public` (a classificação dos 81 foi aplicada nos 2 schemas) e GRAVAM o
`staging`. Os fluxos de escrita do aluno rodam SEM INTERNET depois do 1º sync (o SQLite do aparelho é a verdade da tela) e, na
volta da internet, conferem a linha que subiu para o `staging` do Banco do Treino. Nada é gravado no `public`.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

sys.dont_write_bytecode = True
_ESPEC = importlib.util.spec_from_file_location("_base_w08", Path(__file__).parent.parent / "w08" / "_base.py")
B8 = importlib.util.module_from_spec(_ESPEC)
sys.modules["_base_w08"] = B8
_ESPEC.loader.exec_module(B8)  # type: ignore[union-attr]

B5, B7 = B8.B5, B8.B7
p = B8.p
ESTADO, CONTAS = B8.ESTADO, B8.CONTAS
Caso, sql_treino, saude_treino = B8.Caso, B8.sql_treino, B8.saude_treino
ALUNO, USER_TESTE, GRUPO_NOME, ADMIN_TREINO = B8.ALUNO, B8.USER_TESTE, B8.GRUPO_NOME, B8.ADMIN_TREINO
hoje, agora_iso, schema, sem_internet, texto, ir_para_dia = B8.hoje, B8.agora_iso, B8.schema, B8.sem_internet, B8.texto, B8.ir_para_dia
escolher_treino_do_dia, exercicios, linha, abrir_exercicio = B8.escolher_treino_do_dia, B8.exercicios, B8.linha, B8.abrir_exercicio
esperar_fila_vazia, esperar_staging, conta_staging, limpar_staging = B8.esperar_fila_vazia, B8.esperar_staging, B8.conta_staging, B8.limpar_staging
toasts, json_arquivo = B8.toasts, B8.json_arquivo

PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "w09"
B5.PRINTS = PRINTS
B7.PRINTS = PRINTS
B8.PRINTS = PRINTS

# os 81 globais (ids iguais em public e staging) usados nos roteiros
EX = {
    "martelo_polia": "cc614132-6b3e-4629-9995-e19dd6537ab1",
    "martelo_halteres": "97bf2aa2-77b4-429e-9c9d-d5e3547b5b14",
    "rosca_direta": "4f141bfc-a902-406b-bc41-98076648c4ae",
    "supino_barra": "23d01e92-0780-4bbf-9451-0c04d63600cf",
    "supino_halteres": "bb673b75-dfee-407c-af40-7166908ff2b9",
    "crucifixo_maquina": "aa61d549-d952-4ee9-94ac-2f76ed29b063",
    "crucifixo_halteres": "91fb0a6d-dfe2-4edd-bab7-aecf79311927",
    "crossover": "049e0404-02e8-4064-9bc4-e2a99a856e7e",
    "frances_polia": "45f56d80-a211-4c4d-b46d-52d066e4b5c0",
    "frances_halter": "3ee805c7-8279-4dba-9411-02c2bb7cbe22",
    "triceps_testa": "c7016a9d-1af3-4238-929f-adae75005ce6",
}


# ───────────────────────── o "Trocar" ─────────────────────────

def abrir_trocar(c, ex_id: str) -> None:
    abrir_exercicio(c, ex_id)
    linha(c, ex_id).locator('[data-acao-exercicio="trocar"]').click()
    c.esperar(lambda: c.tem("[data-trocar-exercicio]") and c.pg.locator("[data-trocar-exercicio] [aria-busy]").count() == 0, 10)
    c.pg.wait_for_timeout(500)


def sem_avisos(c, timeout: float = 8) -> None:
    """Espera os avisos (sonner) sumirem antes do print — o aviso cobre o rodapé da folha."""
    c.esperar(lambda: c.pg.locator("[data-sonner-toast]").count() == 0, timeout)


def fechar_trocar(c) -> None:
    c.pg.keyboard.press("Escape")
    c.esperar(lambda: not c.tem("[data-trocar-exercicio]"), 6)
    c.pg.wait_for_timeout(300)


def aba_atual(c) -> str:
    return c.pg.locator("[data-trocar-exercicio]").get_attribute("data-trocar-aba-atual") or ""


def ir_aba(c, aba: str) -> None:
    c.pg.locator(f'[data-trocar-aba="{aba}"]').click()
    c.pg.wait_for_timeout(300)


def opcoes(c) -> list[dict]:
    """As opções da aba aberta, na ordem da tela: id, nome, apagada (não tem na academia), bloqueada (no treino/sai)."""
    return c.pg.locator("[data-trocar-exercicio] [data-trocar-opcao]").evaluate_all(
        """els => els.map(e => ({ id: e.getAttribute('data-trocar-opcao'), nome: e.querySelector('[data-trocar-nome]')?.textContent,
            sem_academia: e.getAttribute('data-sem-academia') === '1', bloqueada: e.disabled,
            texto: e.innerText }))"""
    )


def escolher(c, ex_id: str) -> None:
    c.pg.locator(f"[data-trocar-exercicio] [data-trocar-opcao='{ex_id}']").click()
    c.pg.wait_for_timeout(250)


def confirmar_troca(c, escopo: str) -> None:
    c.pg.locator(f'[data-trocar-escopo="{escopo}"]').click()
    c.pg.locator("[data-trocar-confirmar]").click()
    c.esperar(lambda: not c.tem("[data-trocar-exercicio]"), 10)
    c.pg.wait_for_timeout(600)


# ───────────────────────── staging (limpeza do que a W9 grava) ─────────────────────────

def limpar_academias(desde: str, motivo: str) -> None:
    """Apaga do STAGING as academias que a conta de teste criou no teste (e os pesos delas). Nada do public."""
    assert schema() == "staging"
    ids = sql_treino(f"select id::text as id from staging.tb_academias where user_id = '{USER_TESTE}' and created_at >= '{desde}'")
    if ids:
        lista = ",".join(f"'{r['id']}'" for r in ids)
        sql_treino(f"delete from staging.tb_academia_pesos where academia_id in ({lista})")
        sql_treino(f"delete from staging.tb_academias where id in ({lista})")
    print(f"   limpeza do staging ({motivo}): {len(ids)} academia(s) da conta de teste", flush=True)
