#!/usr/bin/env python3
"""Physiq hml-19a (risco 2 da spec hml-19 §8) — teste das 2 Guardas dos E2E de PRODUÇÃO (só leitura), sem rede e sem navegador:
pedidos de mentira passam pela decisão de cada uma.

  e2e/hml17/_base.py  Guarda.escrita (a de todos os E2E da hml-17/18/19): a nutricao grava em TODA ação; função que a Guarda não
                      conhece = gravação; as que existiam seguem a regra de antes (pagamentos-aluno, admin-semana-treinos e admin-tags
                      pela ação; admin-delete-user e admin-update-user sempre); toda função das pastas do repo tem de estar decidida.
                      hml-19c (decisão K): a admin-avaliacoes só lê na "list" — as de antes que gravam e as foto_* ficam barradas.
                      hml-19d (decisão I): a financeiro grava em TODA ação (inclusive a semente) — o preflight passa.
                      hml-20a (decisão I): menos as LEITURAS pelo corpo — { acao: "ler" } na nutricao/financeiro e { action:
                      "minha_evolucao" } na admin-avaliacoes passam; o corpo "disfarçado" (o campo que a função NÃO lê com a
                      leitura), ilegível ou sem a ação segue barrado.
  e2e/w26/prod.py     eh_escrita: o POST na nutricao e na financeiro é escrita (como o POST em tabela); a leitura passa. hml-20a: o
                      POST com o corpo { acao: "ler" } é leitura.
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

    def __init__(self, metodo: str, url: str, corpo: dict | list | None = None, cru: str | None = None) -> None:
        self.method, self.url = metodo, url
        self.post_data = cru if cru is not None else (json.dumps(corpo) if corpo is not None else None)


P = "https://api-principal.physiqcalc.com.br"
T = "https://api.physiqcalc.com.br"


def casos_hml17(b) -> list[tuple]:
    g = b.Guarda()
    fn = lambda nome, acao=None, metodo="POST", host=P: g.escrita(Pedido(metodo, f"{host}/functions/v1/{nome}", {"acao": acao} if acao else {}))  # noqa: E731
    # hml-19c: as funções do Treino mandam a ação em "action" (o corpo como a tela manda)
    fnt = lambda nome, action=None, metodo="POST": g.escrita(Pedido(metodo, f"{T}/functions/v1/{nome}", {"action": action} if action else {}))  # noqa: E731
    saida = [
        # a nutricao: toda ação grava (inclusive a que só "garante" os padrões) — o preflight passa
        ("nutricao › anamnese_criar", fn("nutricao", "anamnese_criar"), True),
        ("nutricao › padroes_garantir", fn("nutricao", "padroes_garantir"), True),
        ("nutricao › anexo_preparar", fn("nutricao", "anexo_preparar"), True),
        ("nutricao › sem ação", fn("nutricao"), True),
        ("nutricao › OPTIONS (preflight)", fn("nutricao", "anamnese_criar", "OPTIONS"), False),
        # hml-19b: as ações da Dieta e do app do aluno também são da nutricao — barradas na produção sem mudar a Guarda
        ("nutricao › plano_criar (Dieta)", fn("nutricao", "plano_criar"), True),
        ("nutricao › dieta_ordenar (Dieta)", fn("nutricao", "dieta_ordenar"), True),
        ("nutricao › padroes_garantir secao=formula (Dieta)", g.escrita(Pedido("POST", f"{P}/functions/v1/nutricao", {"acao": "padroes_garantir", "secao": "formula"})), True),
        ("nutricao › aluno_marcar_refeicao (o app)", fn("nutricao", "aluno_marcar_refeicao"), True),
        ("nutricao › aluno_diario_preparar (o app)", fn("nutricao", "aluno_diario_preparar"), True),
        ("nutricao › aluno_diario_enviar (o app)", fn("nutricao", "aluno_diario_enviar"), True),
        ("RPC paciente_marcar_refeicao (saiu do front; grava)", g.escrita(Pedido("POST", f"{P}/rest/v1/rpc/paciente_marcar_refeicao", {})), True),
        ("RPC aluno_marcar_meta (saiu do front; grava)", g.escrita(Pedido("POST", f"{P}/rest/v1/rpc/aluno_marcar_meta", {})), True),
        ("RPC diario_enviar (o link público; grava)", g.escrita(Pedido("POST", f"{P}/rest/v1/rpc/diario_enviar", {})), True),
        ("RPC dieta_ordenar (nunca do navegador)", g.escrita(Pedido("POST", f"{P}/rest/v1/rpc/dieta_ordenar", {})), True),
        ("RPC plano_alimentar (leitura do editor)", g.escrita(Pedido("POST", f"{P}/rest/v1/rpc/plano_alimentar", {})), False),
        ("Storage: a foto do diário pelo link assinado (PUT)", g.escrita(Pedido("PUT", f"{P}/storage/v1/object/upload/sign/diario/a/b/c.png?token=x")), True),
        # função desconhecida = gravação (nova do jeito 2 que a Guarda ainda não conhece)
        ("função desconhecida (financeiro-relatorio)", fn("financeiro-relatorio", "listar"), True),
        # hml-19d (decisão I): a financeiro grava em TODA ação — a semente, o recibo, as tags — e o preflight passa
        ("financeiro › transacao_criar", fn("financeiro", "transacao_criar"), True),
        ("financeiro › padroes_garantir (a semente)", fn("financeiro", "padroes_garantir"), True),
        ("financeiro › recibo_emitir", fn("financeiro", "recibo_emitir"), True),
        ("financeiro › recibo_excluir", fn("financeiro", "recibo_excluir"), True),
        ("financeiro › tags_salvar", fn("financeiro", "tags_salvar"), True),
        ("financeiro › sem ação", fn("financeiro"), True),
        ("financeiro › OPTIONS (preflight)", fn("financeiro", "transacao_criar", "OPTIONS"), False),
        ("RPC financeiro_emitir_recibo (nunca do navegador)", g.escrita(Pedido("POST", f"{P}/rest/v1/rpc/financeiro_emitir_recibo", {})), True),
        ("RPC financeiro_garantir_padroes (nunca do navegador)", g.escrita(Pedido("POST", f"{P}/rest/v1/rpc/financeiro_garantir_padroes", {})), True),
        ("RPC financeiro_lancamentos (leitura do Financeiro)", g.escrita(Pedido("POST", f"{P}/rest/v1/rpc/financeiro_lancamentos", {})), False),
        ("PATCH pacientes (as tags, do jeito antigo)", g.escrita(Pedido("PATCH", f"{P}/rest/v1/pacientes?id=eq.x", {"tags": []})), True),
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
        # hml-19c (decisão K): a admin-avaliacoes só lê na "list"; as de antes que gravam e as foto_* ficam barradas na produção
        ("admin-avaliacoes › list (leitura)", fnt("admin-avaliacoes", "list"), False),
        ("admin-avaliacoes › create (grava)", fnt("admin-avaliacoes", "create"), True),
        ("admin-avaliacoes › update (grava)", fnt("admin-avaliacoes", "update"), True),
        ("admin-avaliacoes › proxima (grava)", fnt("admin-avaliacoes", "proxima"), True),
        ("admin-avaliacoes › delete (grava)", fnt("admin-avaliacoes", "delete"), True),
        ("admin-avaliacoes › foto_preparar (grava)", fnt("admin-avaliacoes", "foto_preparar"), True),
        ("admin-avaliacoes › foto_salvar (grava)", fnt("admin-avaliacoes", "foto_salvar"), True),
        ("admin-avaliacoes › foto_excluir (grava)", fnt("admin-avaliacoes", "foto_excluir"), True),
        ("admin-avaliacoes › sem ação (na dúvida, grava)", fnt("admin-avaliacoes"), True),
        ("admin-avaliacoes › OPTIONS (preflight)", fnt("admin-avaliacoes", "foto_salvar", "OPTIONS"), False),
        ("nutricao › antropometria_criar (Avaliação)", fn("nutricao", "antropometria_criar"), True),
        ("nutricao › foto_evolucao_preparar (Avaliação)", fn("nutricao", "foto_evolucao_preparar"), True),
        ("nutricao › avaliacao_avisar (Avaliação)", fn("nutricao", "avaliacao_avisar"), True),
        ("RPC aluno_avisar_avaliacao (saiu do front; grava)", g.escrita(Pedido("POST", f"{P}/rest/v1/rpc/aluno_avisar_avaliacao", {})), True),
        ("Storage: a foto mensal pelo link assinado do Treino (PUT)", g.escrita(Pedido("PUT", f"{T}/storage/v1/object/upload/sign/registros/a/2000-01/frente.jpg?token=x")), True),
        ("Storage: o link de leitura da foto mensal (sign, Treino)", g.escrita(Pedido("POST", f"{T}/storage/v1/object/sign/registros/a/2000-01/frente.jpg", {})), False),
        # tabela, RPC e Storage (sem mudança)
        ("POST em tabela", g.escrita(Pedido("POST", f"{P}/rest/v1/anamneses")), True),
        ("PATCH em tabela", g.escrita(Pedido("PATCH", f"{P}/rest/v1/anexos?id=eq.x")), True),
        ("GET em tabela", g.escrita(Pedido("GET", f"{P}/rest/v1/anamneses?select=*")), False),
        ("RPC de leitura (aluno_anotacoes)", g.escrita(Pedido("POST", f"{P}/rest/v1/rpc/aluno_anotacoes", {})), False),
        ("RPC que grava (nutricao_garantir_padroes, nunca do navegador)", g.escrita(Pedido("POST", f"{P}/rest/v1/rpc/nutricao_garantir_padroes", {})), True),
        ("Storage: link de leitura (sign)", g.escrita(Pedido("POST", f"{P}/storage/v1/object/sign/anexos/a/b/c.pdf", {})), False),
        ("Storage: subida pelo link assinado (PUT)", g.escrita(Pedido("PUT", f"{P}/storage/v1/object/upload/sign/anexos/a/b/c.pdf?token=x")), True),
        ("fora da API (o próprio site)", g.escrita(Pedido("POST", "https://physiqcalc.com.br/qualquer")), False),
        # hml-20a (decisão I): as LEITURAS do jeito 2 passam pelo corpo (o campo que a função lê); o resto dessas funções segue barrado
        ("hml-20a: nutricao › ler (leitura em lote)", g.escrita(Pedido("POST", f"{P}/functions/v1/nutricao", {"acao": "ler", "itens": [{"q": "aluno_dieta"}]})), False),
        ("hml-20a: financeiro › ler (leitura em lote)", g.escrita(Pedido("POST", f"{P}/functions/v1/financeiro", {"acao": "ler", "itens": []})), False),
        ("hml-20a: admin-avaliacoes › minha_evolucao (leitura do próprio)", fnt("admin-avaliacoes", "minha_evolucao"), False),
        ("hml-20a: nutricao › OPTIONS do ler (preflight)", fn("nutricao", "ler", "OPTIONS"), False),
        ("hml-20a: nutricao › disfarçado {action: ler, acao: anotacao_criar}", g.escrita(Pedido("POST", f"{P}/functions/v1/nutricao", {"action": "ler", "acao": "anotacao_criar"})), True),
        ("hml-20a: nutricao › {action: ler} (a nutricao lê o campo acao)", g.escrita(Pedido("POST", f"{P}/functions/v1/nutricao", {"action": "ler"})), True),
        ("hml-20a: financeiro › disfarçado {action: ler, acao: transacao_criar}", g.escrita(Pedido("POST", f"{P}/functions/v1/financeiro", {"action": "ler", "acao": "transacao_criar"})), True),
        ("hml-20a: admin-avaliacoes › disfarçado {acao: minha_evolucao, action: create}", g.escrita(Pedido("POST", f"{T}/functions/v1/admin-avaliacoes", {"acao": "minha_evolucao", "action": "create"})), True),
        ("hml-20a: admin-avaliacoes › {acao: minha_evolucao} (a função lê o campo action)", g.escrita(Pedido("POST", f"{T}/functions/v1/admin-avaliacoes", {"acao": "minha_evolucao"})), True),
        ("hml-20a: nutricao › corpo ilegível", g.escrita(Pedido("POST", f"{P}/functions/v1/nutricao", cru="{acao: ler")), True),
        ("hml-20a: nutricao › {acao: [ler]} (lista)", g.escrita(Pedido("POST", f"{P}/functions/v1/nutricao", {"acao": ["ler"]})), True),
        ("hml-20a: nutricao › {acao: LER}", fn("nutricao", "LER"), True),
        ("hml-20a: nutricao › corpo que é lista [{acao: ler}]", g.escrita(Pedido("POST", f"{P}/functions/v1/nutricao", [{"acao": "ler"}])), True),
        ("hml-20a: pagamentos-aluno › {acao: ler} (outra função: a regra dela)", fn("pagamentos-aluno", "ler"), True),
        ("hml-20a: funcao_grava SEM o corpo: nutricao 'ler' segue gravação (só o corpo libera)", b.funcao_grava("nutricao", "ler"), True),
        ("hml-20a: funcao_grava SEM o corpo: admin-avaliacoes 'minha_evolucao' segue a regra de antes", b.funcao_grava("admin-avaliacoes", "minha_evolucao"), True),
        ("hml-20a: funcao_grava COM o corpo de leitura: passa", b.funcao_grava("nutricao", "ler", json.dumps({"acao": "ler"})), False),
        ("revisão: POST em tabela com /functions/v1/nutricao na query e {acao: ler} (a Guarda lê o caminho)",
         g.escrita(Pedido("POST", f"{P}/rest/v1/anexos?x=/functions/v1/nutricao", {"acao": "ler"})), True),
    ]
    # toda função das pastas do repo está decidida (conhecida ou "sempre grava"): função nova sem decisão falha aqui
    pastas = {d.name for raiz in ("supabase-principal/functions", "supabase/functions") for d in (REPO / raiz).iterdir()
              if d.is_dir() and not d.name.startswith("_") and (d / "index.ts").exists()}
    sem_decisao = sorted(pastas - b.FUNCOES_CONHECIDAS - b.FUNCOES_QUE_SEMPRE_GRAVAM)
    saida.append((f"as {len(pastas)} funções do repo decididas (sem decisão: {', '.join(sem_decisao) or 'nenhuma'})", not sem_decisao, True, ("sim", "não")))
    saida.append(("a nutricao fora das 'conhecidas' (grava sempre)", "nutricao" not in b.FUNCOES_CONHECIDAS, True, ("sim", "não")))
    saida.append(("hml-19d: a financeiro fora das 'conhecidas' e nas que gravam sempre", "financeiro" not in b.FUNCOES_CONHECIDAS
                  and "financeiro" in b.FUNCOES_QUE_SEMPRE_GRAVAM, True, ("sim", "não")))
    return saida


def casos_w26(w) -> list[tuple]:
    e = w.eh_escrita
    return [
        ("w26 · POST nutricao", e("POST", f"{P}/functions/v1/nutricao"), True),
        ("w26 · POST nutricao (com query)", e("POST", f"{P}/functions/v1/nutricao?x=1"), True),
        ("w26 · OPTIONS nutricao", e("OPTIONS", f"{P}/functions/v1/nutricao"), False),
        ("w26 · POST nutricao-leitura (outra função)", e("POST", f"{P}/functions/v1/nutricao-leitura"), False),
        # hml-19d (decisão I): a financeiro também
        ("w26 · POST financeiro", e("POST", f"{P}/functions/v1/financeiro"), True),
        ("w26 · POST financeiro (com query)", e("POST", f"{P}/functions/v1/financeiro?x=1"), True),
        ("w26 · OPTIONS financeiro", e("OPTIONS", f"{P}/functions/v1/financeiro"), False),
        ("w26 · POST financeiro-relatorio (outra função)", e("POST", f"{P}/functions/v1/financeiro-relatorio"), False),
        ("w26 · POST em tabela", e("POST", f"{P}/rest/v1/anexos"), True),
        ("w26 · GET em tabela", e("GET", f"{P}/rest/v1/anexos?select=*"), False),
        ("w26 · RPC lixeira_restaurar", e("POST", f"{P}/rest/v1/rpc/lixeira_restaurar"), True),
        ("w26 · RPC lixeira_da_conta (leitura)", e("POST", f"{P}/rest/v1/rpc/lixeira_da_conta"), False),
        ("w26 · Storage sign (leitura)", e("POST", f"{P}/storage/v1/object/sign/anexos/a.pdf"), False),
        ("w26 · Storage upload pelo link assinado", e("PUT", f"{P}/storage/v1/object/upload/sign/anexos/a.pdf?token=x"), True),
        # hml-20a (decisão I): o POST com o corpo { acao: "ler" } na nutricao/financeiro é LEITURA; o resto segue escrita
        ("w26 · hml-20a: POST nutricao {acao: ler}", e("POST", f"{P}/functions/v1/nutricao", json.dumps({"acao": "ler", "itens": []})), False),
        ("w26 · hml-20a: POST financeiro {acao: ler}", e("POST", f"{P}/functions/v1/financeiro", json.dumps({"acao": "ler", "itens": []})), False),
        ("w26 · hml-20a: POST nutricao disfarçado {action: ler, acao: anotacao_criar}", e("POST", f"{P}/functions/v1/nutricao", json.dumps({"action": "ler", "acao": "anotacao_criar"})), True),
        ("w26 · hml-20a: POST nutricao {acao: anamnese_criar}", e("POST", f"{P}/functions/v1/nutricao", json.dumps({"acao": "anamnese_criar"})), True),
        ("w26 · hml-20a: POST nutricao corpo ilegível", e("POST", f"{P}/functions/v1/nutricao", "{acao: ler"), True),
        ("w26 · hml-20a: PATCH nutricao {acao: ler}", e("PATCH", f"{P}/functions/v1/nutricao", json.dumps({"acao": "ler"})), True),
        ("w26 · hml-20a: POST em tabela com corpo {acao: ler} (a exceção é só da função)", e("POST", f"{P}/rest/v1/anexos", json.dumps({"acao": "ler"})), True),
        # revisão: a exceção olha só o caminho — o nome da função na QUERY (ou no fragmento) não libera a tabela nem a RPC que grava
        ("w26 · revisão: POST em tabela com /functions/v1/nutricao na query e {acao: ler}", e("POST", f"{P}/rest/v1/anexos?x=/functions/v1/nutricao", json.dumps({"acao": "ler"})), True),
        ("w26 · revisão: POST na RPC que grava com /functions/v1/financeiro na query e {acao: ler}", e("POST", f"{P}/rest/v1/rpc/lixeira_restaurar?y=/functions/v1/financeiro", json.dumps({"acao": "ler"})), True),
        ("w26 · revisão: POST nutricao com query (o caminho é da função) e {acao: ler}", e("POST", f"{P}/functions/v1/nutricao?x=1", json.dumps({"acao": "ler"})), False),
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
