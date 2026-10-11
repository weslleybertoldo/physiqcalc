#!/usr/bin/env python3
"""Physiq hml-19a (risco 2 da spec hml-19 §8) — teste das 2 Guardas dos E2E de PRODUÇÃO (só leitura), sem rede e sem navegador:
pedidos de mentira passam pela decisão de cada uma.

  e2e/hml17/_base.py  Guarda.escrita (a de todos os E2E da hml-17/18/19): a nutricao grava em TODA ação; função que a Guarda não
                      conhece = gravação; as que existiam seguem a regra de antes (pagamentos-aluno, admin-semana-treinos e admin-tags
                      pela ação; admin-delete-user e admin-update-user sempre); toda função das pastas do repo tem de estar decidida.
  e2e/w26/prod.py     eh_escrita: o POST na nutricao é escrita (como o POST em tabela); a leitura passa.
Uso: python3 e2e/hml19/guarda_teste.py   (sai 1 se algum caso falhar)
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
AQUI = Path(__file__).resolve().parent
REPO = AQUI.parents[1]


def carregar(nome: str, caminho: Path):
    sys.path.insert(0, str(caminho.parent))
    try:
        espec = importlib.util.spec_from_file_location(nome, caminho)
        mod = importlib.util.module_from_spec(espec)
        sys.modules[nome] = mod
        espec.loader.exec_module(mod)  # type: ignore[union-attr]
        return mod
    finally:
        sys.path.remove(str(caminho.parent))


class Pedido:
    """O que a Guarda lê de um pedido do Playwright: url, method e post_data."""

    def __init__(self, metodo: str, url: str, corpo: dict | None = None) -> None:
        self.method, self.url = metodo, url
        self.post_data = json.dumps(corpo) if corpo is not None else None


P = "https://api-principal.physiqcalc.com.br"
T = "https://api.physiqcalc.com.br"


def casos_hml17(b) -> list[tuple]:
    g = b.Guarda()
    fn = lambda nome, acao=None, metodo="POST", host=P: g.escrita(Pedido(metodo, f"{host}/functions/v1/{nome}", {"acao": acao} if acao else {}))  # noqa: E731
    saida = [
        # a nutricao: toda ação grava (inclusive a que só "garante" os padrões) — o preflight passa
        ("nutricao › anamnese_criar", fn("nutricao", "anamnese_criar"), True),
        ("nutricao › padroes_garantir", fn("nutricao", "padroes_garantir"), True),
        ("nutricao › anexo_preparar", fn("nutricao", "anexo_preparar"), True),
        ("nutricao › sem ação", fn("nutricao"), True),
        ("nutricao › OPTIONS (preflight)", fn("nutricao", "anamnese_criar", "OPTIONS"), False),
        # função desconhecida = gravação (nova do jeito 2 que a Guarda ainda não conhece; a financeiro da hml-19d)
        ("função desconhecida (financeiro)", fn("financeiro", "transacao_criar"), True),
        ("função desconhecida no Treino", fn("funcao-nova", "listar", host=T), True),
        # as de antes: a regra de antes
        ("pagamentos-aluno › prof_resumo (leitura)", fn("pagamentos-aluno", "prof_resumo"), False),
        ("pagamentos-aluno › prof_registrar (grava)", fn("pagamentos-aluno", "prof_registrar"), True),
        ("treino-leitura (Treino)", fn("treino-leitura", "avaliacoes", host=T), False),
        ("pos-login", fn("pos-login"), False),
        ("trocar-token (Treino)", fn("trocar-token", host=T), False),
        ("admin-update-user (Treino)", fn("admin-update-user", host=T), True),
        ("admin-semana-treinos › get (leitura)", fn("admin-semana-treinos", "get", host=T), False),
        ("admin-semana-treinos › salvar (grava)", fn("admin-semana-treinos", "salvar", host=T), True),
        ("admin-tags › list (leitura)", fn("admin-tags", "list", host=T), False),
        ("admin-tags › add (grava)", fn("admin-tags", "add", host=T), True),
        # tabela, RPC e Storage (sem mudança)
        ("POST em tabela", g.escrita(Pedido("POST", f"{P}/rest/v1/anamneses")), True),
        ("PATCH em tabela", g.escrita(Pedido("PATCH", f"{P}/rest/v1/anexos?id=eq.x")), True),
        ("GET em tabela", g.escrita(Pedido("GET", f"{P}/rest/v1/anamneses?select=*")), False),
        ("RPC de leitura (aluno_anotacoes)", g.escrita(Pedido("POST", f"{P}/rest/v1/rpc/aluno_anotacoes", {})), False),
        ("RPC que grava (nutricao_garantir_padroes, nunca do navegador)", g.escrita(Pedido("POST", f"{P}/rest/v1/rpc/nutricao_garantir_padroes", {})), True),
        ("Storage: link de leitura (sign)", g.escrita(Pedido("POST", f"{P}/storage/v1/object/sign/anexos/a/b/c.pdf", {})), False),
        ("Storage: subida pelo link assinado (PUT)", g.escrita(Pedido("PUT", f"{P}/storage/v1/object/upload/sign/anexos/a/b/c.pdf?token=x")), True),
        ("fora da API (o próprio site)", g.escrita(Pedido("POST", "https://physiqcalc.com.br/qualquer")), False),
    ]
    # toda função das pastas do repo está decidida (conhecida ou "sempre grava"): função nova sem decisão falha aqui
    pastas = {d.name for raiz in ("supabase-principal/functions", "supabase/functions") for d in (REPO / raiz).iterdir()
              if d.is_dir() and not d.name.startswith("_") and (d / "index.ts").exists()}
    sem_decisao = sorted(pastas - b.FUNCOES_CONHECIDAS - b.FUNCOES_QUE_SEMPRE_GRAVAM)
    saida.append((f"as {len(pastas)} funções do repo decididas (sem decisão: {', '.join(sem_decisao) or 'nenhuma'})", not sem_decisao, True, ("sim", "não")))
    saida.append(("a nutricao fora das 'conhecidas' (grava sempre)", "nutricao" not in b.FUNCOES_CONHECIDAS, True, ("sim", "não")))
    return saida


def casos_w26(w) -> list[tuple]:
    e = w.eh_escrita
    return [
        ("w26 · POST nutricao", e("POST", f"{P}/functions/v1/nutricao"), True),
        ("w26 · POST nutricao (com query)", e("POST", f"{P}/functions/v1/nutricao?x=1"), True),
        ("w26 · OPTIONS nutricao", e("OPTIONS", f"{P}/functions/v1/nutricao"), False),
        ("w26 · POST nutricao-leitura (outra função)", e("POST", f"{P}/functions/v1/nutricao-leitura"), False),
        ("w26 · POST em tabela", e("POST", f"{P}/rest/v1/anexos"), True),
        ("w26 · GET em tabela", e("GET", f"{P}/rest/v1/anexos?select=*"), False),
        ("w26 · RPC lixeira_restaurar", e("POST", f"{P}/rest/v1/rpc/lixeira_restaurar"), True),
        ("w26 · RPC lixeira_da_conta (leitura)", e("POST", f"{P}/rest/v1/rpc/lixeira_da_conta"), False),
        ("w26 · Storage sign (leitura)", e("POST", f"{P}/storage/v1/object/sign/anexos/a.pdf"), False),
        ("w26 · Storage upload pelo link assinado", e("PUT", f"{P}/storage/v1/object/upload/sign/anexos/a.pdf?token=x"), True),
    ]


def main() -> int:
    b = carregar("_base_hml17_guarda", REPO / "e2e" / "hml17" / "_base.py")
    w = carregar("_prod_w26_guarda", REPO / "e2e" / "w26" / "prod.py")
    falhas = 0
    casos = casos_hml17(b) + casos_w26(w)
    for caso in casos:
        nome, obtido, esperado = caso[:3]
        sim, nao = caso[3] if len(caso) > 3 else ("grava", "passa")
        ok = bool(obtido) == esperado
        falhas += not ok
        print(f"{'✅' if ok else '❌'} {nome}: {sim if obtido else nao}" + ("" if ok else f" (esperado: {sim if esperado else nao})"))
    print(f"guarda_teste: {len(casos) - falhas}/{len(casos)}")
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main())
