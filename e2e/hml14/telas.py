#!/usr/bin/env python3
"""Physiq hml-14b + hml-14d (B21 · B19, 09/10/2026) — E2E das telas: as listas em páginas de 20 do banco ("1–20 de 41", ← Anterior ·
Próxima →, a página no endereço ou no estado da folha) e os campos que escolhem aluno (a busca vai ao banco enquanto digita).

hml-14d (casos novos; os da 14b — L1–L8, M9, B1–B5 — continuam iguais, abaixo):
  T1–T8 Treino (telas_treino.py; conta w13-dono, a massa "treino"): Meus treinos, Biblioteca, Quem recebe, Histórico do mês, Histórico
        completo, seletor do Relatório, folhas Modelos e Biblioteca do editor
  M1–M7 Master (telas_master.py; w27-master, master SÓ no staging.profiles pela massa "master"): Contas, Financeiro, Integrações, App do
        aluno, Alunos, Sem conta, Biblioteca do master
  P1–P8 por aluno, app e pendências (telas_aluno.py; a massa "aluno" — a nutricionista do aluno no painel, o aluno no app —, P7/P8 com
        a da 14b): Financeiro do aluno, Anotações, Exames, Acompanhamento, app Pagamentos e Agenda, Pré-consulta, Dashboard
  X1    produção, SÓ LEITURA: as listas novas que as contas do e2e/w26/prod.py alcançam (Treino com a "master", só Treino; por aluno com
        a nutri-legado), "1–N de N" e o pedido com a página
  --casos: os nomes da 14b (alunos, …, b19), os códigos (T1, M3, P5…), "treino" (T1–T8), "master" (M1–M7), "aluno" (P1–P8), "14b"
  (só os da 14b), "14d" (só os novos); padrão: todos. Prints em ~/projetos/physiqcalc-scratch/prints/hml14d/; saídas, pedidos e o
  estado da massa em ~/projetos/physiqcalc-scratch/hml/hml14d/D/.

A parte da 14b:

Bases (antes de entrar com qualquer conta, a guarda do build: a faixa "Ambiente de teste" na /entrar existe no build de staging e
não existe no de produção — se não bater, nada roda com conta):
  --base local     o vite preview do build de STAGING (http://localhost:8080; outro endereço: --base http://localhost:5173)
  --base staging   https://physiqcalc-staging.vercel.app
  --base prod      https://physiqcalc.com.br — SÓ LEITURA (abaixo)
Local e staging falam com o schema staging e usam a massa do e2e/hml14/massa.py (--criar antes, --limpar depois; ou --massa aqui:
cria antes e limpa no fim, mesmo se a prova falhar). Conta: a nutri-legado (nutri.teste.claude, conta legado_nutri, faixa livre).

Listas (atributos do contrato: data-lista / data-item / data-paginacao + data-pagina, data-total, data-paginacao-rotulo,
data-pagina-anterior/-proxima): alunos · lancamentos · recibos · mensalidades (+ mensalidades-sem) · respostas · diario · receitas ·
lixeira (a aba Alunos: os removidos) · alimentos (a TACO, sem massa). De onde vem a página (o que o pedido confere): alunos_da_conta,
financeiro_lancamentos, financeiro_recibos, a função pagamentos-aluno (prof_resumo com pagina/pagina_sem), respostas_da_conta,
diario_alimentar (tabela), receitas_da_nutricionista, lixeira_da_conta e alimentos (tabela). A página no endereço: ?pagina= (Alunos,
Lançamentos, Respostas, Dietas e Lixeira), ?pagina_recibos=, ?pagina_mensalidades= e ?pagina_mensalidades_sem= (Financeiro). A busca
de cada lista: data-busca-alunos · -transacoes · -recibos · -mensalidades · -respostas · -alimentos, data-campo-busca-receitas e
data-campo-busca-lixeira (o Diário filtra pelo aluno, no data-campo-aluno).
  L1  sem filtro: 20 linhas, "1–20 de N" (N = 41 da massa + o que a conta já tinha) e o pedido só com 20 (tabela: limit 20/offset 0
      e content-range 0-19/N; RPC: p_limite 20/p_offset 0 e total N; função: pagina 1 e total N); outro pedido à mesma fonte com
      mais de 20 linhas vira aviso (⚠️, não conta como falha: a janela de datas do D18 é assim)
  L2  Próxima → "21–40 de N", ?pagina=2 no endereço e o pedido de offset 20
  L3  abrir um item e voltar (o aluno e o Voltar do navegador; o diálogo e Esc; a Lixeira e os Alimentos não abrem item: sair para o
      Dashboard e Voltar) e recarregar → continua na página 2, com as mesmas linhas; Anterior → página 1 sem ?pagina
  L4  a busca pela marca da massa ("HOMOLOG lista 09h15") → "1–20 de 41" e o pedido com o total 41 (o Diário não tem busca: a lista
      dos 7 dias é a massa; os Alimentos não têm massa)
  L5  Próxima até a última (a 3): "41–41 de 41", 1 linha, Próxima desligado; as 41 da massa aparecem 1 vez cada (o 41º na página 3)
  L6  estando na página 1, a busca pelo item que estava na página 3 ("aluno #41") → ele aparece e a página continua a 1 (o Diário
      filtra pelo aluno do registro, no filtro Aluno da tela)
  L7  na página 2, mudar a busca → volta à 1 (o endereço sem ?pagina); limpar a busca → a lista inteira de novo
  L8  celular (390 px): a lista com a paginação sem rolar para o lado (scrollWidth ≤ 392) + print
  M9  Mensalidades: a seção "Alunos sem mensalidade" abre FECHADA (data-btn-sem-mensalidade); aberta, "1–20 de N" (data-paginacao=
      "mensalidades-sem", o pedido com pagina_sem) e, com mais de 20, Próxima → ?pagina_mensalidades_sem=2 (a massa não tem aluno sem
      mensalidade: os da conta; sem nenhum, a seção não aparece)
B19 — os 4 campos (data-seletor-aluno = ligar · agendamento · movimentacao · recibo; data-seletor-aluno-busca, data-opcao-aluno,
data-seletor-aluno-mais, data-seletor-aluno-cadastrar); nada é salvo (o diálogo fecha com Esc):
  B1  acha o "Zé Último" por parte do nome ("Últim"), por "ze ultimo" (sem acento), pelo telefone (só os dígitos) e pelo CPF; o pedido
      é a alunos_da_conta com o termo e p_limite 20; nenhuma opção de outra conta (o gêmeo — mesmo nome e telefone — está noutra conta
      de teste; o CPF dele não acha ninguém)
  B2  a marca acha os 41: 20 opções e "20 de 41 — refine a busca"
  B3  digitar rápido: a resposta da busca anterior (retida no navegador até a nova chegar) não aparece por cima da nova
  B4  celular (390 px): a busca pelo CPF sem rolar para o lado + print
  B5  dado pessoal mínimo: só o Recibo (que imprime o CPF) pede o CPF ao banco (p_filtros.exportar); nos outros 3 a busca pelo CPF
      acha no banco, mas nenhuma resposta da alunos_da_conta traz CPF
Produção (SÓ LEITURA, sem massa): as contas de teste do e2e/w26/prod.py (nutri-legado; master = admin.teste.claude, conta só de
Treino: as listas de Dietas ficam de fora), a guarda de escrita do w26 no navegador (+ a pagamentos-aluno só com prof_resumo), as
contagens do banco iguais antes e depois. Cada lista: "1–N de N" sem setas (N ≤ 20; N = 0: sem paginação) ou "1–20 de N" e a
página 2 (os Alimentos); o pedido com limit/p_limite 20 ou pagina 1. Nos prints de produção as linhas saem borradas.
Prints: ~/projetos/physiqcalc-scratch/prints/hml14b/<base>_<caso>.png (computador 1280 e celular 390). Saída, o resumo dos pedidos
(sem dado pessoal) e o estado lido: ~/projetos/physiqcalc-scratch/hml/hml14b/D/ (nunca no /tmp). A rodada entra no
~/projetos/physiqcalc-scratch/e2e-rodadas.tsv (H-50; o docs/e2e-rodadas.md recebe as linhas no fim da worktree).

Uso: python3 e2e/hml14/telas.py --base local --canal msedge [--casos alunos,b19] [--sem-celular]
     python3 e2e/hml14/telas.py --base staging --canal msedge [--massa]
     python3 e2e/hml14/telas.py --base prod --canal msedge [--contas-prod nutri-legado]
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import math
import re
import sys
import time
import unicodedata
import urllib.parse
from dataclasses import dataclass, field
from pathlib import Path

sys.dont_write_bytecode = True
# os casos da 14d (telas_treino, telas_master, telas_aluno) fazem "import telas": o MESMO módulo, não uma 2ª cópia
sys.modules.setdefault("telas", sys.modules[__name__])
AQUI = Path(__file__).resolve().parent
REPO = AQUI.parents[1]
sys.path.insert(0, str(AQUI))
import massa as M  # noqa: E402 — só funções; nada lê banco nem credencial ao importar

SAIDA = M.SAIDA
PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "hml14d"  # hml-14d (a 14b ficou em prints/hml14b)
BASES = {"local": "http://localhost:8080", "staging": "https://physiqcalc-staging.vercel.app", "prod": "https://physiqcalc.com.br"}
HOSTS_DE_PRODUCAO = {"physiqcalc.com.br", "www.physiqcalc.com.br"}
POR_PAGINA = 20
MASSA = M.N
MAX_PAGINAS = 6  # a massa ocupa 3; o fundo da conta pode empurrar o Diário para mais
LARGURA_CELULAR = 392  # 390 + 2 de folga (a régua da hml-11/12)
CONTA_PADRAO = M.CHAVE_PADRAO
CONTAS_PROD = ("nutri-legado", "master")
TABELAS_PROD = ("pacientes", "transacoes", "recibos", "respostas_preconsulta", "formularios_preconsulta", "diario_alimentar", "receitas",
                "alimentos", "calendarios", "modelos_recibo", "conta_eventos", "avisos")
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
CHAVES_PAGINA = ("p_limite", "p_limit", "limite", "limit", "p_por_pagina", "por_pagina", "p_offset", "offset", "p_deslocamento", "pagina",
                 "p_pagina", "pagina_sem")


@dataclass(frozen=True)
class Lista:
    nome: str                                # data-lista / data-paginacao (o contrato)
    rota: str                                # a tela, já na aba
    fontes: tuple[tuple[str, str], ...]      # (tabela | rpc | funcao, nome) de onde vem a página — a 1ª é a que o agente fez
    tipo: str | None                         # o rótulo da massa nas linhas ("aluno #07"); None = sem massa (Alimentos)
    busca: tuple[str, ...] = ()              # o campo de busca (o 1º visível); () = sem busca de texto (o Diário filtra pelo aluno)
    abrir: tuple[str, str, str] | None = None  # (dentro da linha, "url:<trecho>" | "dialogo", "voltar" | "esc"); None = sair e Voltar
    nutricao: bool = False                   # só numa conta com Nutrição (Dietas)
    nomes: tuple[str, ...] = ()              # outros nomes aceitos no data-lista / data-paginacao (vazio = só o nome)
    nome_item: str | None = None             # onde está o nome do item (a busca dos Alimentos, sem massa)
    fundo: str | None = None                 # a contagem do "fundo" no estado da massa (da parte da lista)
    chave: str = "pagina"                    # a página no endereço (?pagina= ou ?pagina_<lista>=, a 1ª não aparece)
    # hml-14d
    acoes: tuple[str, ...] = ()              # função: as ações (acao/action) que trazem a página (vazio = a regra da 14b: prof_resumo)
    conta: str | None = None                 # a conta de TESTE que entra (chave das CONTAS; None = a da 14b)
    parte: str = "14b"                       # a parte da massa (a marca e o fundo vêm dela): 14b | treino | master | aluno
    saida: str = "/painel"                   # sem item para abrir: sai para esta rota e Voltar (o master: /master)
    filtro: str | None = None                # sem busca de texto: como filtrar pelo item da última página ("diario" | "seletor-treino" | "nenhum")
    antes: str | None = None                 # o botão que mostra a lista (o "Ver todos" do Financeiro do aluno) — produção (X1)

    @property
    def candidatos(self) -> tuple[str, ...]:
        return self.nomes or (self.nome,)


@dataclass(frozen=True)
class Campo:
    nome: str    # data-seletor-aluno
    rota: str
    abrir: str   # o botão que abre o diálogo
    modal: str   # o diálogo


# hml-14b (integração): como as telas ficaram — a fonte da página (a 1ª), o campo de busca (o atributo estável de cada uma), o que
# abre um item e a chave da página no endereço. Respostas: a tabela respostas_preconsulta segue como 2ª fonte só para o aviso da
# leitura de até 1000 que os números do topo e da aba Formulários ainda fazem (o usePreConsulta) — não é a página.
LISTAS = (
    Lista("alunos", "/painel/alunos", (("rpc", "alunos_da_conta"),), "aluno", ("[data-busca-alunos]",),
          ("[data-abrir-aluno]", "url:/painel/alunos/", "voltar"), fundo="alunos_fundo"),
    Lista("lancamentos", "/painel/financeiro?aba=lancamentos", (("rpc", "financeiro_lancamentos"),), "lanc",
          ("[data-busca-transacoes]",), ("[data-btn-editar-transacao]", "dialogo", "esc"), fundo="lancamentos_fundo"),
    Lista("recibos", "/painel/financeiro?aba=recibos", (("rpc", "financeiro_recibos"),), "recibo",
          ("[data-busca-recibos]",), ("[data-btn-ver-recibo]", "dialogo", "esc"), fundo="recibos_fundo", chave="pagina_recibos"),
    Lista("mensalidades", "/painel/financeiro?aba=mensalidades", (("funcao", "pagamentos-aluno"),), "aluno",
          ("[data-busca-mensalidades]",), ("a[href$='/financeiro']", "url:/painel/alunos/", "voltar"), fundo="mensalidades_fundo",
          chave="pagina_mensalidades"),
    Lista("respostas", "/painel/pre-consulta?aba=respostas", (("rpc", "respostas_da_conta"), ("tabela", "respostas_preconsulta")), "resposta",
          ("[data-busca-respostas]",), ("[data-btn-ligar-resposta]", "dialogo", "esc"), fundo="respostas_fundo"),
    Lista("diario", "/painel/dietas?aba=diario", (("tabela", "diario_alimentar"),), "diario", (),
          ("[data-registro-nome]", "url:/painel/alunos/", "voltar"), nutricao=True, fundo="diario_fundo"),
    Lista("receitas", "/painel/dietas?aba=receitas", (("rpc", "receitas_da_nutricionista"),), "receita",
          ("[data-campo-busca-receitas]",), ("[data-btn-ver-receita]", "dialogo", "esc"), nutricao=True, fundo="receitas_fundo"),
    Lista("lixeira", "/painel/lixeira?tipo=paciente", (("rpc", "lixeira_da_conta"),), "removido", ("[data-campo-busca-lixeira]",),
          None, fundo="removidos_fundo"),
    Lista("alimentos", "/painel/dietas?aba=alimentos", (("tabela", "alimentos"),), None,
          ("[data-busca-alimentos]",), None, nutricao=True, nome_item="[data-alimento-nome]"),
)
CAMPOS = (
    Campo("movimentacao", "/painel/financeiro?aba=lancamentos", "[data-nova-movimentacao]", "[data-modal-movimentacao]"),
    Campo("recibo", "/painel/financeiro?aba=recibos", "[data-btn-novo-recibo]", "[data-modal-recibo]"),
    Campo("agendamento", "/painel/agenda", "[data-btn-novo-agendamento]", "[data-modal-agendamento]"),
    Campo("ligar", "/painel/pre-consulta?aba=respostas", "[data-btn-ligar-resposta]", "[data-modal-ligar]"),
)
TODOS = tuple(L.nome for L in LISTAS) + tuple(f"b19-{F.nome}" for F in CAMPOS)
# hml-14d: as contas de teste dos casos novos (chave das CONTAS da W5 → e-mail); a senha é a de ~/.physiq-teste-<chave>
CONTAS_14D = {"w13-dono": "w13.dono.teste.claude@physiqnutri.app", "w13-nutri": "w13.nutri.teste.claude@physiqnutri.app",
              "w13-aluno": "w13.aluno.teste.claude@physiqnutri.app", "w27-master": "w27.master.teste.claude@physiqnutri.app"}
BORRAR = "[data-lista] [data-item], [data-lista] [data-item] * { filter: blur(7px) !important; }"

# o estado da lista na tela (1 chamada): a paginação, as linhas, o endereço e a largura
JS_LISTA = r"""([nomes, seletorNome]) => {
  const vis = (e) => !!e && e.getClientRects().length > 0;
  for (const n of nomes) {
    const pag = document.querySelector(`[data-paginacao="${n}"]`);
    const lista = document.querySelector(`[data-lista="${n}"]`);
    if (!pag && !lista) continue;
    const itens = lista ? [...lista.querySelectorAll('[data-item]')].filter(vis) : [];
    const botao = (s) => { const b = pag && pag.querySelector(s); return !b ? 'ausente' : (b.disabled ? 'desligado' : 'ligado'); };
    const rot = pag && pag.querySelector('[data-paginacao-rotulo]');
    return {
      nome: n, temPaginacao: !!pag, temLista: !!lista,
      pagina: pag ? Number(pag.getAttribute('data-pagina')) : null,
      total: pag ? Number(pag.getAttribute('data-total')) : null,
      rotulo: rot ? rot.textContent.replace(/\s+/g, ' ').trim() : null,
      anterior: botao('[data-pagina-anterior]'), proxima: botao('[data-pagina-proxima]'),
      textos: itens.map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim()),
      // o id da linha: o valor do data-item ou o 1º atributo de id conhecido (na linha ou num filho) — hml-14d
      ids: itens.map((e) => {
        const v = e.getAttribute('data-item'); if (v) return v;
        for (const a of ['data-grupo-data', 'data-pedido', 'data-agendamento', 'data-anotacao', 'data-cobranca', 'data-recibo', 'data-lancamento',
                         'data-modelo', 'data-exercicio-biblioteca']) {
          if (e.getAttribute(a)) return e.getAttribute(a);
          const f = e.querySelector(`[${a}]`); if (f && f.getAttribute(a)) return f.getAttribute(a);
        }
        return ''; }),
      linhas1: itens.map((e) => ((e.innerText || '').split('\n').map((x) => x.trim()).filter(Boolean)[0] || '')),
      // "@data-x" = o valor do atributo (no item ou num filho); senão, o texto do seletor
      nomesItens: seletorNome ? itens.map((e) => {
        if (seletorNome.startsWith('@')) { const a = seletorNome.slice(1); const el = e.hasAttribute(a) ? e : e.querySelector(`[${a}]`);
                                           return el ? (el.getAttribute(a) || '').trim() : ''; }
        return ((e.querySelector(seletorNome) || {}).innerText || '').trim(); }) : [],
      url: location.pathname + location.search,
      largura: document.documentElement.scrollWidth,
      direita: pag ? Math.round(pag.getBoundingClientRect().right) : null,
    };
  }
  return { nome: null, temPaginacao: false, temLista: false, pagina: null, total: null, rotulo: null, anterior: 'ausente',
           proxima: 'ausente', textos: [], ids: [], linhas1: [], nomesItens: [], url: location.pathname + location.search,
           largura: document.documentElement.scrollWidth, direita: null };
}"""
# o seletor de aluno aberto: o termo que o banco respondeu (data-termo), se ainda busca e os ids das opções à vista
JS_SELETOR = r"""() => {
  const vis = (e) => !!e && e.getClientRects().length > 0;
  const lista = [...document.querySelectorAll('[data-seletor-aluno-lista]')].find(vis);
  const ids = [...document.querySelectorAll('[data-opcao-aluno]')].filter(vis).map((e) => e.getAttribute('data-opcao-aluno'))
    .filter((v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v || ''));
  return { termo: lista ? lista.getAttribute('data-termo') : null, buscando: lista ? lista.getAttribute('data-buscando') === '1' : false, ids };
}"""
JS_SESSAO = """([k, v, kc, c]) => { localStorage.setItem(k, v); localStorage.setItem('physiq_pendencia_avisada_em', new Date().toLocaleDateString('pt-BR'));
  localStorage.setItem('physiqcalc-pwa-dismissed', 'true'); if (kc) localStorage.setItem(kc, c); }"""


# ───────────────────────── a base dos E2E (carregada só depois do --help) ─────────────────────────
def carregar(schema: str):
    """A base da hml-09 (C: ler só leitura, Saida, Sessoes) e a da W5 (B5: sessão por senha da conta de TESTE, o Caso do navegador,
    a porta do aceite da hml-12) — as mesmas da hml-11/12. Os prints com até 3 tentativas (o "Unable to capture screenshot")."""
    espec = importlib.util.spec_from_file_location("_comum_hml09", REPO / "e2e" / "hml09" / "_comum.py")
    C = importlib.util.module_from_spec(espec)
    sys.modules["_comum_hml09"] = C
    espec.loader.exec_module(C)  # type: ignore[union-attr]
    B5 = C.B5
    B5.ESTADO["schema"] = schema
    C.SAIDA = SAIDA
    B5.PRINTS = PRINTS
    for chave, email in CONTAS_14D.items():  # hml-14d: o professor/nutri/aluno da W13 e o master de teste da W27 (logins que já existem)
        if chave not in B5.CONTAS:
            B5.CONTAS[chave] = (email, B5.senha_de(chave))
    original = B5.Caso.print

    def print_com_nova_tentativa(self, nome: str) -> str:
        for tentativa in range(3):
            try:
                return original(self, nome)
            except Exception as e:  # noqa: BLE001
                if "Unable to capture screenshot" not in str(e) or tentativa == 2:
                    raise
                print(f"   (print {nome}: 'Unable to capture screenshot' — tentativa {tentativa + 2} de 3)", flush=True)
                self.pg.wait_for_timeout(1500)
        raise AssertionError("inalcançável")

    B5.Caso.print = print_com_nova_tentativa
    return C, B5


# ───────────────────────── os pedidos (rede) ─────────────────────────
def classificar(url: str) -> tuple[str, str] | None:
    caminho = urllib.parse.urlparse(url).path
    for padrao, tipo in ((r"/rest/v1/rpc/([^/]+)$", "rpc"), (r"/rest/v1/([^/]+)$", "tabela"), (r"/functions/v1/([^/]+)$", "funcao")):
        m = re.search(padrao, caminho)
        if m:
            return tipo, m.group(1)
    return None


def corpo_json(texto: str | None) -> dict | None:
    try:
        r = json.loads(texto) if texto else None
    except (ValueError, TypeError):
        return None
    return r if isinstance(r, dict) else None


def primeiro_int(d: dict, chaves: tuple[str, ...]) -> int | None:
    for k in chaves:
        v = d.get(k)
        if isinstance(v, int) and not isinstance(v, bool):
            return v
        if isinstance(v, str) and v.isdigit():
            return int(v)
    return None


def termo_do_pedido(corpo: dict | None) -> str | None:
    if not isinstance(corpo, dict):
        return None
    f = corpo.get("p_filtros")
    if isinstance(f, dict) and f.get("q") is not None:
        return str(f["q"])
    for k in ("q", "p_q", "p_busca", "busca"):
        if corpo.get(k) is not None:
            return str(corpo[k])
    return None


def lista_e_total(dados) -> tuple[list | None, int | None]:
    """A página e o total de uma resposta de RPC/função: { itens | ids | alunos | …, total }."""
    if isinstance(dados, list):
        return dados, None
    if not isinstance(dados, dict):
        return None, None
    total = dados.get("total")
    if isinstance(total, dict):
        total = total.get("paciente", total.get("alunos"))
    if total is None and isinstance(dados.get("total_datas"), int):  # hml-14d: exames_do_aluno (a página são DATAS)
        total = dados["total_datas"]
    if not isinstance(total, int) or isinstance(total, bool):
        total = None
    # hml-14d: modelos (admin-semana-treinos), historico (historicoUsuario), users (admin-list-users), contas (master), pessoas (sem
    # conta), datas (exames_do_aluno), anotacoes (aluno_anotacoes)
    for k in ("itens", "ids", "items", "alunos", "lista", "linhas", "registros", "dados", "data", "modelos", "historico", "users", "contas",
              "pessoas", "datas", "anotacoes"):
        if isinstance(dados.get(k), list):
            return dados[k], total
    return None, total


def analisar(ev: dict, dados) -> dict:
    """Do pedido: limite/deslocamento (ou a página), o termo da busca; da resposta: quantas linhas vieram e o total."""
    out: dict = {"n": None, "total": None, "limite": None, "deslocamento": None, "pagina": None, "q": None, "pagina_sem": None,
                 "total_sem": None, "situacao": None, "exportar": None, "com_cpf": None, "numeros": None}
    if ev["tipo"] == "tabela":
        q = ev["query"]
        out["limite"] = primeiro_int(q, ("limit",))
        out["deslocamento"] = primeiro_int(q, ("offset",))
        if out["deslocamento"] is None and out["limite"] is not None:
            out["deslocamento"] = 0
        m = re.match(r"^\s*(?:(\d+)-(\d+)|\*)/(\d+|\*)\s*$", ev.get("content_range") or "")
        if m:
            out["total"] = int(m.group(3)) if m.group(3) != "*" else None
            out["n"] = int(m.group(2)) - int(m.group(1)) + 1 if m.group(1) is not None else 0
        if isinstance(dados, list):
            out["n"] = len(dados)
        return out
    corpo = ev.get("corpo") or {}
    out["limite"] = primeiro_int(corpo, ("p_limite", "p_limit", "limite", "limit", "p_por_pagina", "por_pagina"))
    out["deslocamento"] = primeiro_int(corpo, ("p_offset", "offset", "p_deslocamento"))
    out["pagina"] = primeiro_int(corpo, ("pagina", "p_pagina"))
    out["q"] = termo_do_pedido(corpo)
    lista, total = lista_e_total(dados)
    out["n"] = len(lista) if lista is not None else None
    out["total"] = total
    # Mensalidades (prof_resumo com pagina): a página dos sem mensalidade vem em `sem`
    out["pagina_sem"] = primeiro_int(corpo, ("pagina_sem",))
    sem = dados.get("sem") if isinstance(dados, dict) else None
    if isinstance(sem, dict) and isinstance(sem.get("total"), int):
        out["total_sem"] = sem["total"]
    if ev["nome"] == "preconsulta_numeros" and isinstance(dados, dict):  # hml-14d (P7): os números do topo, só contagens
        out["numeros"] = {k: dados.get(k) for k in ("total", "novas", "ligadas", "importadas", "mes")}
    # B5 (o seletor de aluno): o pedido pediu o CPF (exportar)? alguma opção da resposta veio com CPF?
    if ev["nome"] == "alunos_da_conta":
        filtros = corpo.get("p_filtros") if isinstance(corpo.get("p_filtros"), dict) else {}
        out["situacao"] = filtros.get("situacao")
        out["exportar"] = str(filtros.get("exportar", "")).lower() == "true"
        out["com_cpf"] = any(isinstance(x, dict) and x.get("cpf") for x in (lista or []))
    return out


class Rede:
    """Os pedidos de dados das listas e do seletor: a fonte, limit/offset (ou p_limite/p_offset/pagina), o status, o content-range e
    QUANTAS linhas vieram com o total. Do conteúdo, só a contagem: nenhum nome, e-mail ou id de pessoa vai para a saída."""

    def __init__(self, caso, fontes) -> None:
        self.fontes = {tuple(f[:2]) for f in fontes}
        self.eventos: list[dict] = []
        caso.pg.on("response", self._resposta)

    def _resposta(self, r) -> None:
        try:
            req = r.request
            if req.method == "OPTIONS":
                return
            fonte = classificar(r.url)
            if not fonte:
                return
            corpo = corpo_json(req.post_data) if req.method == "POST" else None
            query = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(r.url).query))
            paginado = "limit" in query or "offset" in query or bool(corpo and any(k in corpo for k in CHAVES_PAGINA))
            if fonte not in self.fontes and not paginado:
                return
            dados = None
            if r.status < 300 and req.method in ("GET", "POST"):
                try:
                    dados = r.json()
                except Exception:  # noqa: BLE001 — corpo vazio ou não-JSON
                    dados = None
            ev = {"i": len(self.eventos), "t": round(time.time(), 2), "tipo": fonte[0], "nome": fonte[1], "metodo": req.method,
                  "status": r.status, "query": query, "corpo": corpo, "content_range": (r.headers or {}).get("content-range"),
                  # hml-14d: a ação da função (principal: acao; Treino: action) e a query crua (chave repetida: data=gte & data=lte)
                  "acao": (corpo or {}).get("acao") or (corpo or {}).get("action"),
                  "query_pares": urllib.parse.parse_qsl(urllib.parse.urlparse(r.url).query)}
            ev.update(analisar(ev, dados))
            self.eventos.append(ev)
        except Exception:  # noqa: BLE001 — a página fechando no meio
            pass

    def resumo(self) -> list[dict]:
        """Para o arquivo de pedidos: só a forma do pedido e as contagens (o termo da busca vira o tamanho)."""
        saida = []
        for e in self.eventos:
            corpo = e.get("corpo") or {}
            saida.append({"tipo": e["tipo"], "nome": e["nome"], "metodo": e["metodo"], "status": e["status"],
                          "query": {k: v for k, v in e["query"].items() if k in ("limit", "offset", "order")},
                          "corpo": {k: corpo[k] for k in ("acao", "action", "tipo", "p_tipo", *CHAVES_PAGINA) if k in corpo},
                          "q_tamanho": len(e["q"]) if e.get("q") else 0, "content_range": e["content_range"], "n": e["n"], "total": e["total"],
                          **({"numeros": e.get("numeros")} if e.get("numeros") else {}),
                          **({"exportar": e.get("exportar"), "com_cpf": e.get("com_cpf")} if e["nome"] == "alunos_da_conta" else {})})
        return saida


def descr(e: dict | None) -> str:
    if not e:
        return ""
    if e["tipo"] == "tabela":
        pedido = f"{e['metodo']} {e['nome']} limit={e['limite']} offset={e['deslocamento']}"
        resposta = f"content-range {e['content_range']}"
    elif e["tipo"] == "rpc":
        pedido = f"rpc {e['nome']} p_offset={e['deslocamento']} p_limite={e['limite']}" + (f" pagina={e['pagina']}" if e["pagina"] else "")
        resposta = f"total {e['total']}"
    else:
        acao = e.get("acao") or (e.get("corpo") or {}).get("acao")
        extra = f" limite={e['limite']} offset={e['deslocamento']}" if e["pagina"] is None and e["limite"] is not None else ""
        pedido = f"função {e['nome']}{' ' + acao if acao else ''} pagina={e['pagina']}{extra}"
        resposta = f"total {e['total']}"
    return f"{pedido} → {e['n']} linha(s), {resposta} (HTTP {e['status']})"


def pedido_da_pagina(rede: Rede, L: Lista, desde: int, pagina: int) -> dict | None:
    """O último pedido da página `pagina` a uma das fontes da lista, a partir do evento `desde`."""
    achados = []
    fontes = {tuple(f[:2]) for f in L.fontes}
    for e in rede.eventos[desde:]:
        if e["status"] >= 300 or e["metodo"] == "HEAD" or (e["tipo"], e["nome"]) not in fontes:
            continue
        if e["tipo"] == "funcao":
            acoes = L.acoes or (None, "prof_resumo")
            if e.get("acao") in acoes and (e["pagina"] == pagina or (e["pagina"] is None and e["limite"] == POR_PAGINA
                                                                       and (e["deslocamento"] or 0) == (pagina - 1) * POR_PAGINA)):
                achados.append(e)
        elif e["limite"] == POR_PAGINA and (e["deslocamento"] or 0) == (pagina - 1) * POR_PAGINA:
            achados.append(e)
        elif e["pagina"] == pagina and e["limite"] in (None, POR_PAGINA):
            achados.append(e)
    return achados[-1] if achados else None


def esperar_pedido(caso, rede: Rede, L: Lista, desde: int, pagina: int, timeout: float = 20) -> dict | None:
    caso.esperar(lambda: pedido_da_pagina(rede, L, desde, pagina) is not None, timeout)
    return pedido_da_pagina(rede, L, desde, pagina)


def pedido_ok(e: dict | None, total: int, linhas: int) -> bool:
    """Só 20 por pedido, a contagem certa de linhas da página e o total da lista inteira."""
    return bool(e) and e["n"] is not None and e["n"] <= POR_PAGINA and e["n"] == linhas and e["total"] == total


def nao_veio(rede: Rede, L: Lista, desde: int) -> str:
    vistos = sorted({f"{e['tipo']} {e['nome']}" for e in rede.eventos[desde:]})
    return (f"o pedido não veio (fontes esperadas: {', '.join(f'{t} {n}' for t, n in L.fontes)}; pedidos de dados vistos: "
            f"{', '.join(vistos) or 'nenhum'})")


def pedidos_grandes(rede: Rede, L: Lista, desde: int) -> list[dict]:
    fontes = {tuple(f[:2]) for f in L.fontes}
    return [e for e in rede.eventos[desde:] if (e["tipo"], e["nome"]) in fontes and (e["n"] or 0) > POR_PAGINA
            and (not L.acoes or e["tipo"] != "funcao" or e.get("acao") in L.acoes)]


# ───────────────────────── a tela ─────────────────────────
def rotulo(pagina: int, total: int) -> str:
    """O rótulo de src/lib/paginacao.ts: "1–20 de 41" (meia-risca)."""
    if total <= 0:
        return "0 de 0"
    de = (pagina - 1) * POR_PAGINA
    return f"{de + 1}–{min(de + POR_PAGINA, total)} de {total}"


def pagina_da_url(url: str, chave: str = "pagina") -> int | None:
    """A página da lista no endereço (a chave dela: ?pagina=, ?pagina_recibos=, ?pagina_mensalidades=…); a 1ª não aparece (None)."""
    v = urllib.parse.parse_qs(urllib.parse.urlparse(url or "").query).get(chave)
    if not v:
        return None
    try:
        return int(v[0])
    except (ValueError, IndexError):
        return -1


def na_pagina(url: str, pagina: int, chave: str = "pagina") -> bool:
    p = pagina_da_url(url, chave)
    return p in (None, 1) if pagina == 1 else p == pagina


def sem_acento(texto: str) -> str:
    """Minúsculo e sem acento (a busca das telas é assim)."""
    return "".join(c for c in unicodedata.normalize("NFD", texto or "") if not unicodedata.combining(c)).lower()


def token(texto: str, tipo: str | None) -> str | None:
    """O número da massa na linha ("aluno #07" → "07"; hml-14d: sem acento — "exercício #07" = "exercicio #07")."""
    if not tipo:
        return None
    m = re.search(rf"\b{re.escape(sem_acento(tipo))}\s+#(\d{{2}})\b", sem_acento(texto))
    return m.group(1) if m else None


def tokens(st: dict, tipo: str | None) -> list[str | None]:
    return [token(x, tipo) for x in st.get("textos") or []]


def chaves(st: dict, L: Lista) -> list:
    """O que identifica as linhas da página (o número da massa; sem ele, o texto)."""
    return [token(x, L.tipo) or x for x in st.get("textos") or []]


def marca_em(texto: str, marca: str) -> bool:
    return marca.lower() in (texto or "").lower()


def ler(caso, L: Lista) -> dict:
    try:
        return caso.pg.evaluate(JS_LISTA, [list(L.candidatos), L.nome_item or ""])
    except Exception:  # noqa: BLE001 — navegando
        return {"nome": None, "temPaginacao": False, "textos": [], "ids": [], "linhas1": [], "nomesItens": [], "url": caso.caminho(), "pagina": None, "total": None,
                "rotulo": None, "anterior": "ausente", "proxima": "ausente", "largura": -1, "direita": None}


def esperar_lista(caso, L: Lista, cond, timeout: float = 30) -> tuple[bool, dict]:
    ultimo: dict = {}

    def pronta() -> bool:
        nonlocal ultimo
        ultimo = ler(caso, L)
        try:
            return bool(cond(ultimo))
        except Exception:  # noqa: BLE001
            return False

    ok = caso.esperar(pronta, timeout)
    return ok, ultimo


def mudar_pagina(caso, L: Lista, nome: str, qual: str, pagina: int, antes: dict) -> tuple[bool, dict]:
    botao = caso.pg.locator(f'[data-paginacao="{nome}"] [data-pagina-{qual}]').first
    if not caso.esperar(lambda: botao.count() > 0 and botao.is_enabled(), 15):
        return False, ler(caso, L)
    botao.click()
    velhas = chaves(antes, L)
    return esperar_lista(caso, L, lambda e: e["pagina"] == pagina and e["textos"] and chaves(e, L) != velhas, 30)


def campo_busca(caso, L: Lista):
    for sel in L.busca:
        loc = caso.pg.locator(sel)
        for i in range(min(loc.count(), 4)):
            if loc.nth(i).is_visible():
                return loc.nth(i)
    return None


def fechar_dialogo(caso) -> bool:
    """Fecha o diálogo SEM salvar: Esc (o campo do seletor com o foco fecha a própria lista primeiro); se não fechar, tira o foco e
    Esc de novo; por último, o Cancelar/Fechar do próprio diálogo (nunca o salvar)."""
    for i in range(6):
        if not caso.tem("[role='dialog']"):
            return True
        if i == 2:
            caso.pg.evaluate("() => document.activeElement && document.activeElement.blur && document.activeElement.blur()")
        if i >= 4:
            botao = caso.pg.locator("[role='dialog'] button:has-text('Cancelar'), [role='dialog'] button:has-text('Fechar'), "
                                    "[role='dialog'] button:has-text('Close'), [role='dialog'] button[aria-label='Close']").first
            if botao.count() and botao.is_visible():
                botao.click()
                caso.pg.wait_for_timeout(600)
                continue
        caso.pg.keyboard.press("Escape")
        caso.pg.wait_for_timeout(500)
    return not caso.tem("[role='dialog']")


def rolar_ate(caso, seletor: str) -> None:
    loc = caso.pg.locator(seletor)
    if loc.count():
        loc.first.scroll_into_view_if_needed()
        caso.pg.wait_for_timeout(400)


def texto_de(caso, seletor: str) -> str:
    loc = caso.pg.locator(seletor)
    for i in range(min(loc.count(), 4)):
        if loc.nth(i).is_visible():
            return re.sub(r"\s+", " ", loc.nth(i).inner_text()).strip()
    return ""


def abrir_e_voltar(caso, L: Lista, nome: str, antes: dict) -> tuple[bool, str]:
    """Na página 2: abre um item e volta (navegação + Voltar do navegador, ou o diálogo + Esc); sem item para abrir, sai da tela e
    volta. Depois: a mesma página no endereço e as mesmas linhas."""
    url = antes["url"]
    if L.abrir:
        sel, espera, volta = L.abrir
        alvo = caso.pg.locator(f'[data-lista="{nome}"] [data-item]').first.locator(sel).first
        if not alvo.count():
            alvo = caso.pg.locator(f'[data-lista="{nome}"] {sel}').first
        if not alvo.count():
            return False, f"a linha não tem '{sel}'"
        alvo.click()
        if espera.startswith("url:"):
            abriu = caso.esperar(lambda: espera[4:] in caso.caminho() and caso.caminho() != url, 30)
            como = f"abriu {caso.caminho().split('?')[0]}"
        else:
            abriu = caso.esperar(lambda: caso.tem("[role='dialog']"), 20)
            como = "abriu o diálogo"
        if not abriu:
            return False, f"o item não abriu ({sel})"
        caso.pg.wait_for_timeout(800)
        caso.print(f"{L.nome}_pagina2_item_aberto")  # hml-14d: a página 2 com a folha/diálogo do item aberto (spec §4)
        if volta == "voltar":
            caso.pg.go_back(wait_until="domcontentloaded")
            como += " · Voltar do navegador"
        else:
            como += " · Esc" if fechar_dialogo(caso) else " · o diálogo NÃO fechou com Esc"
            if espera.startswith("url:"):  # hml-14d: a folha da URL (Master › Contas ?conta=) sai do endereço ao fechar
                caso.esperar(lambda: espera[4:] not in caso.caminho(), 10)
    else:
        caso.ir(L.saida)
        caso.esperar(lambda: caso.tem("[data-menu-lateral]"), 30)
        caso.pg.go_back(wait_until="domcontentloaded")
        como = f"a lista não abre item: saiu para {L.saida} e Voltar do navegador"
    velhas = chaves(antes, L)
    ok, depois = esperar_lista(caso, L, lambda e: e["pagina"] == 2 and chaves(e, L) == velhas, 60)
    return ok and na_pagina(depois.get("url") or "", 2, L.chave), f"{como}; depois: página {depois.get('pagina')}, {depois.get('url')}"


# ───────────────────────── a rodada (contas, sessões, guarda) ─────────────────────────
LEITURAS_PAGAMENTOS = ("prof_resumo", "prof_aluno", "prof_aluno_cobrancas", "aluno_status", "aluno_historico")  # hml-14d: + as leituras
LEITURAS_SEMANA = ("get", "volume", "volumePraticado", "getSeriesPadrao", "exerciciosTreino", "semanaAtual", "resolverAluno", "quemRecebe",
                   "quemRecebeLista", "modelos")  # admin-semana-treinos: ACOES_LEITURA + modelos


class Guarda:
    """Bloqueia no navegador toda escrita que as telas tentarem — o molde do e2e/w26/prod.py:Guarda (tabela, RPC que grava, Storage)
    — e, na função pagamentos-aluno, tudo o que não for leitura (hml-14d: + as funções do Treino que gravam)."""

    ESCRITA_RPC = re.compile(r"/rest/v1/rpc/(lixeira_restaurar|lixeira_apagar|aluno_remover|marcar_aviso|marcar|salvar|criar|"
                             r"registrar|aceitar|excluir|apagar|atualizar|enviar|garantir|agenda_garantir_tags|aluno_acesso|diario_link)")
    ESCRITA_TABELA = re.compile(r"/rest/v1/(?!rpc/)")

    def __init__(self, hosts: tuple[str, ...]) -> None:
        self.hosts = hosts
        self.bloqueadas: list[str] = []

    def instalar(self, ctx) -> None:
        def rota(route, request) -> None:
            u, m = request.url, request.method
            escrita = m in ("POST", "PATCH", "PUT", "DELETE") and bool(
                self.ESCRITA_TABELA.search(u) or self.ESCRITA_RPC.search(u)
                or ("/storage/v1/object/" in u and "/storage/v1/object/sign/" not in u))
            if not escrita and m == "POST" and "/functions/v1/pagamentos-aluno" in u:
                escrita = (corpo_json(request.post_data) or {}).get("acao") not in LEITURAS_PAGAMENTOS
            if not escrita and m == "POST" and "/functions/v1/admin-" in u:  # hml-14d: as funções do Treino que gravam
                funcao = u.split("/functions/v1/")[1].split("?")[0]
                acao = (corpo_json(request.post_data) or {}).get("action")
                escrita = funcao in ("admin-delete-user", "admin-update-user") or (
                    funcao == "admin-semana-treinos" and acao not in LEITURAS_SEMANA) or (
                    funcao == "admin-tags" and not str(acao or "").lower().startswith(("list", "get")))
            if escrita:
                self.bloqueadas.append(f"{m} {u.split('?')[0]}")
                route.abort()
                return
            route.continue_()
        for host in self.hosts:
            ctx.route(f"https://{host}/**", rota)


@dataclass
class Rodada:
    C: object
    B5: object
    o: object
    base: str
    prefixo: str
    producao: bool
    chave: str = CONTA_PADRAO
    massa: dict | None = None
    conta_ids: set = field(default_factory=set)
    conta_ativa: dict = field(default_factory=dict)
    guarda: Guarda | None = None
    redes: list = field(default_factory=list)
    avisos: list = field(default_factory=list)
    sessoes: dict = field(default_factory=dict)
    sess: object = None
    build_ok: bool = False

    @property
    def marca(self) -> str:
        return (self.massa or {}).get("marca", "")

    def parte(self, nome: str) -> dict:
        """hml-14d: o estado de uma parte da massa (a 14b mora no topo do estado; treino, master e aluno em chaves próprias)."""
        if nome == "14b":
            return self.massa or {}
        return (self.massa or {}).get(nome) or {}

    def marca_de(self, L: Lista) -> str:
        return self.parte(L.parte).get("marca") or self.marca

    def sessao(self, chave: str) -> dict:
        """A sessão da conta de TESTE (login por senha, como o B5), guardada por 40 min — menos logins no Auth (o da produção)."""
        guardada = self.sessoes.get(chave)
        if guardada and time.time() - guardada[0] < 2400:
            return guardada[1]
        s = self.B5.sessao(chave)
        self.sess.guardar("principal", s["access_token"], f"{chave} (sessão injetada)")
        self.sessoes[chave] = (time.time(), s)
        return s

    def novo_caso(self, nav, nome: str, desktop: bool = True, fontes=()):
        caso = self.B5.Caso(nav, self.base, self.prefixo, nome, desktop=desktop)
        if self.guarda:
            self.guarda.instalar(caso.ctx)
        rede = Rede(caso, fontes)
        self.redes.append((nome, rede))
        return caso, rede

    def entrar(self, caso, rota: str, chave: str | None = None) -> None:
        """A sessão injetada (como o B5.Caso.entrar) + a conta ativa da massa, a rota e a porta do aceite (hml-12)."""
        chave = chave or self.chave
        email = self.B5.CONTAS[chave][0]
        if not self.B5.email_de_teste(email) or "revisao" in email.lower():
            raise SystemExit(f"não é conta de teste: {chave}")
        if not self.producao:
            self.B5.zerar_limite_troca(chave)  # a troca de token tem limite por hora (só no staging)
        s = self.sessao(chave)
        uid = (s.get("user") or {}).get("id") or ""
        conta = self.conta_ativa.get(chave) or ""
        caso.pg.goto(self.base + "/privacidade", wait_until="domcontentloaded")
        caso.pg.evaluate(JS_SESSAO, [self.B5.CHAVE_PRINCIPAL, json.dumps(s), f"physiq_conta_ativa:{uid}" if uid and conta else "", conta])
        caso.pg.goto(self.base + rota, wait_until="domcontentloaded")
        caso.fechar_avisos()

    def fundo(self, L: Lista) -> int | None:
        cont = self.parte(L.parte).get("contagens") or {}
        return cont.get(L.fundo) if L.fundo else None

    def aviso(self, texto: str) -> None:
        self.avisos.append(texto)
        self.o.linha("⚠️ " + texto)


def avisar_grandes(R: Rodada, t: str, rede: Rede, L: Lista, desde: int) -> None:
    grandes = pedidos_grandes(rede, L, desde)
    if grandes:
        R.aviso(f"{t} outro pedido à mesma fonte trouxe mais de 20 linhas (fora da página): " + "; ".join(descr(e) for e in grandes[:3]))


# ───────────────────────── antes de tudo: o build ─────────────────────────
def conferir_build(o, nav, R: Rodada) -> bool:
    caso, _ = R.novo_caso(nav, "build", desktop=False)
    try:
        caso.ir("/entrar")
        abriu = caso.esperar(lambda: caso.tem("[data-entrar-google]") or caso.tem("[data-entrada-staging]"), 60)
        if R.producao:
            tem = caso.pg.locator("[data-entrada-staging]").count() > 0
            return o.ok(abriu and not tem, "o build é o de produção (a /entrar sem a faixa 'Ambiente de teste')")
        tem = caso.esperar(lambda: caso.tem("[data-entrada-staging]"), 30)
        return o.ok(abriu and tem, "o build é o de staging (a faixa 'Ambiente de teste' na /entrar) — senão nada roda com conta")
    finally:
        caso.fim()


# ───────────────────────── as listas (staging e local) ─────────────────────────
def filtrar_aluno_diario(caso, R: Rodada, L: Lista, paciente: str) -> str:
    """O filtro Aluno do Diário: pela tela (o select com a opção do aluno) ou, sem a opção, pelo endereço (?aluno=)."""
    sel = caso.pg.locator("[data-campo-aluno]").first
    try:
        if sel.count() and sel.evaluate("e => e.tagName") == "SELECT":
            if paciente in sel.evaluate("e => [...e.options].map((o) => o.value)"):
                sel.select_option(paciente)
                return "tela"
            via = "sem-opcao"
        else:
            via = "sem-campo"
    except Exception:  # noqa: BLE001
        via = "sem-campo"
    caso.ir(L.rota + f"&aluno={paciente}")
    return via


def provar_lista(o, nav, R: Rodada, L: Lista) -> None:
    t = f"[{L.nome}]"
    caso, rede = R.novo_caso(nav, f"lista_{L.nome}", fontes=L.fontes)
    try:
        R.entrar(caso, L.rota, L.conta)
        ok, st = esperar_lista(caso, L, lambda e: e["temPaginacao"] and e["textos"], 90)
        if not o.ok(ok, f"{t} a lista abre com data-lista / data-paginacao ('{' | '.join(L.candidatos)}') e as linhas data-item"):
            caso.diagnostico()
            return
        nome, N = st["nome"], int(st["total"] or 0)
        # L1 — sem filtro
        if L.tipo:
            fundo = R.fundo(L)
            no_banco = f"; no banco, 41 da massa + {fundo} de fundo = {MASSA + fundo}" if isinstance(fundo, int) else ""
            o.ok(N >= MASSA, f"{t} L1 o total da lista: {N}{no_banco}")
            if isinstance(fundo, int) and N != MASSA + fundo:
                R.aviso(f"{t} o total da tela ({N}) difere da conta do massa.py (41 + {fundo}): o filtro padrão da tela não é o que o massa.py supõe")
        elif isinstance(R.fundo(L), int):  # hml-14d: lista sem massa com a contagem do banco (as do master)
            o.ok(N == R.fundo(L), f"{t} L1 o total da lista: {N} (no banco, com a regra da RPC: {R.fundo(L)})")
        else:
            o.ok(N > 3 * POR_PAGINA, f"{t} L1 o total da lista: {N} (a TACO + os próprios)")
        o.ok(st["rotulo"] == rotulo(1, N) and len(st["textos"]) == min(POR_PAGINA, N) and st["pagina"] == 1 and na_pagina(st["url"], 1, L.chave),
             f"{t} L1 sem filtro: {len(st['textos'])} linhas e '{st['rotulo']}' (esperado '{rotulo(1, N)}'), página {st['pagina']}, {st['url']}")
        ev = esperar_pedido(caso, rede, L, 0, 1)
        o.ok(pedido_ok(ev, N, min(POR_PAGINA, N)), f"{t} L1 o pedido traz só 20: {descr(ev) or nao_veio(rede, L, 0)}")
        avisar_grandes(R, t, rede, L, 0)
        # L2 — Próxima
        desde = len(rede.eventos)
        ok, st2 = mudar_pagina(caso, L, nome, "proxima", 2, st)
        exp2 = min(POR_PAGINA, N - POR_PAGINA)
        o.ok(ok and st2["rotulo"] == rotulo(2, N) and len(st2["textos"]) == exp2 and na_pagina(st2["url"], 2, L.chave),
             f"{t} L2 Próxima → '{st2.get('rotulo')}', {len(st2.get('textos') or [])} linhas, {st2.get('url')}")
        ev = esperar_pedido(caso, rede, L, desde, 2)
        o.ok(pedido_ok(ev, N, exp2), f"{t} L2 o pedido da página 2: {descr(ev) or nao_veio(rede, L, desde)}")
        if not ok:
            caso.diagnostico()
            return
        o.linha(f"   print: {caso.print(f'{L.nome}_pagina2')}")  # hml-14d: os prints da spec §4 ("… na página 2")
        # L3 — abrir e voltar; recarregar; Anterior
        ok3, como = abrir_e_voltar(caso, L, nome, st2)
        o.ok(ok3, f"{t} L3 abrir um item e voltar mantém ?pagina=2 e as mesmas linhas ({como})")
        caso.pg.reload(wait_until="domcontentloaded")
        ok, st3 = esperar_lista(caso, L, lambda e: e["pagina"] == 2 and chaves(e, L) == chaves(st2, L), 60)
        o.ok(ok and na_pagina(st3["url"], 2, L.chave), f"{t} L3 recarregar a tela → continua na página 2 com as mesmas linhas ({st3.get('url')})")
        ok, st1 = mudar_pagina(caso, L, nome, "anterior", 1, st3)
        o.ok(ok and na_pagina(st1["url"], 1, L.chave) and st1["rotulo"] == rotulo(1, N), f"{t} L3 Anterior → página 1, o endereço sem ?pagina ({st1.get('url')})")
        if L.tipo is None:
            provar_sem_massa(o, caso, rede, R, L, nome, N, st1)
        else:
            provar_massa(o, caso, rede, R, L, nome, N, st1)
        if L.nome == "mensalidades":
            provar_sem_mensalidade(o, caso, rede, R, L)
    finally:
        caso.fim()


def pedido_sem_mensalidade(rede: Rede, L: Lista, desde: int, pagina_sem: int) -> dict | None:
    """O último prof_resumo (com `pagina`) que pediu a página `pagina_sem` dos sem mensalidade."""
    achados = [e for e in rede.eventos[desde:] if (e["tipo"], e["nome"]) in L.fontes and e["status"] < 300 and e["pagina"] is not None
               and (e.get("pagina_sem") or 1) == pagina_sem]
    return achados[-1] if achados else None


def provar_sem_mensalidade(o, caso, rede: Rede, R: Rodada, Lm: Lista) -> None:
    """M9: a seção "Alunos sem mensalidade" abre FECHADA (data-btn-sem-mensalidade); aberta, a paginação dela (data-paginacao=
    "mensalidades-sem", a página da MESMA resposta do prof_resumo: pagina_sem) e, com mais de 20, Próxima → ?pagina_mensalidades_sem=2
    com o pedido de pagina_sem 2, e Anterior → sem a chave. A massa não tem aluno sem mensalidade: são os da conta."""
    t = "[mensalidades-sem]"
    L = Lista("mensalidades-sem", Lm.rota, Lm.fontes, None, chave="pagina_mensalidades_sem")
    caso.ir(Lm.rota)  # do zero: sem busca (com busca a seção abre sozinha) e com a seção fechada
    if not caso.esperar(lambda: caso.tem('[data-paginacao="mensalidades"]') or caso.tem("[data-cobranca-vazio]"), 60):
        o.ok(False, f"{t} M9 a aba Mensalidades não abriu de novo")
        return
    botao = caso.pg.locator("[data-btn-sem-mensalidade]").first
    if not caso.esperar(lambda: botao.count() > 0, 10):
        o.linha(f"   {t} M9 a conta não tem aluno sem mensalidade: a seção não aparece (nada a provar)")
        return
    expandida = botao.get_attribute("aria-expanded")
    o.ok(expandida == "false" and not caso.tem('[data-lista="mensalidades-sem"]'),
         f"{t} M9 a seção 'Alunos sem mensalidade' abre FECHADA (data-btn-sem-mensalidade, aria-expanded={expandida})")
    botao.click()
    ok, st = esperar_lista(caso, L, lambda e: e["temPaginacao"] and e["textos"], 20)
    N = int(st.get("total") or 0)
    no_banco = ((R.massa or {}).get("contagens") or {}).get("mensalidades_sem_fundo")
    if isinstance(no_banco, int) and no_banco != N:
        R.aviso(f"{t} o total da tela ({N}) difere da conta do massa.py ({no_banco} vivos da conta sem mensalidade)")
    ev = pedido_sem_mensalidade(rede, L, 0, 1)
    o.ok(ok and st["rotulo"] == rotulo(1, N) and len(st["textos"]) == min(POR_PAGINA, N) and na_pagina(st["url"], 1, L.chave),
         f"{t} M9 aberta: '{st.get('rotulo')}' (esperado '{rotulo(1, N)}'), {len(st.get('textos') or [])} linha(s), {st.get('url')}")
    o.ok(bool(ev) and ev.get("total_sem") == N, f"{t} M9 a página vem do prof_resumo (pagina_sem 1, total_sem {ev.get('total_sem') if ev else '—'})")
    if N <= POR_PAGINA:
        o.linha(f"   {t} M9 {N} aluno(s) sem mensalidade: uma página só (sem Próxima)")
        return
    desde = len(rede.eventos)
    ok2, st2 = mudar_pagina(caso, L, L.nome, "proxima", 2, st)
    ev2 = pedido_sem_mensalidade(rede, L, desde, 2)
    o.ok(ok2 and st2["rotulo"] == rotulo(2, N) and na_pagina(st2["url"], 2, L.chave) and na_pagina(st2["url"], 1, Lm.chave),
         f"{t} M9 Próxima → '{st2.get('rotulo')}', ?{L.chave}=2 e a página dos com mensalidade intacta ({st2.get('url')})")
    o.ok(bool(ev2) and ev2.get("total_sem") == N, f"{t} M9 o pedido de pagina_sem 2 ({'veio' if ev2 else 'não veio'})")
    ok3, st3 = mudar_pagina(caso, L, L.nome, "anterior", 1, st2)
    o.ok(ok3 and na_pagina(st3["url"], 1, L.chave), f"{t} M9 Anterior → página 1, o endereço sem ?{L.chave} ({st3.get('url')})")


def provar_massa(o, caso, rede: Rede, R: Rodada, L: Lista, nome: str, N: int, st1: dict) -> None:
    t = f"[{L.nome}]"
    marca = R.marca_de(L)
    busca = campo_busca(caso, L) if L.busca else None
    # L4 — a massa: a busca pela marca (o Diário: a lista dos 7 dias)
    if L.busca and not o.ok(busca is not None, f"{t} L4 o campo de busca da lista ({' | '.join(L.busca)})"):
        caso.diagnostico()
        return
    if busca:
        desde = len(rede.eventos)
        busca.fill(marca)
        ok, sm = esperar_lista(caso, L, lambda e: e["total"] == MASSA and len(e["textos"]) == POR_PAGINA
                               and all(marca_em(x, marca) for x in e["textos"]), 30)
        o.ok(ok and sm["rotulo"] == rotulo(1, MASSA) and sm["pagina"] == 1,
             f"{t} L4 a busca pela marca '{marca}' → '{sm.get('rotulo')}', {len(sm.get('textos') or [])} linhas da massa (esperado '{rotulo(1, MASSA)}')")
        ev = esperar_pedido(caso, rede, L, desde, 1)
        o.ok(pedido_ok(ev, MASSA, POR_PAGINA), f"{t} L4 o pedido da busca traz só 20 e o total 41: {descr(ev) or nao_veio(rede, L, desde)}")
        if not ok:
            caso.diagnostico()
            return
        Nm = MASSA
    else:
        sm, Nm = st1, N
        o.linha(f"   {t} L4 sem busca de texto: a massa é a lista do período padrão ({N} = 41 da massa + {N - MASSA} de fundo)")
    o.linha(f"   print: {caso.print(f'{L.nome}_pagina1')}")
    # L5 — até a última página
    ultima = min(math.ceil(Nm / POR_PAGINA), MAX_PAGINAS)
    paginas = {1: tokens(sm, L.tipo)}
    atual = sm
    for P in range(2, ultima + 1):
        desde = len(rede.eventos)
        ok, prox = mudar_pagina(caso, L, nome, "proxima", P, atual)
        exp = min(POR_PAGINA, Nm - (P - 1) * POR_PAGINA)
        o.ok(ok and prox["rotulo"] == rotulo(P, Nm) and len(prox["textos"]) == exp and na_pagina(prox["url"], P, L.chave),
             f"{t} L5 página {P}: '{prox.get('rotulo')}' (esperado '{rotulo(P, Nm)}'), {len(prox.get('textos') or [])} linha(s), {prox.get('url')}")
        ev = esperar_pedido(caso, rede, L, desde, P)
        if ev is None and ok and P <= 2:
            # a página 2 já foi pedida no L2/L3: o React Query devolve do cache (mesma chave) — o pedido dela já foi provado
            R.aviso(f"{t} L5 a página {P} veio do cache da tela (o pedido dela foi provado no L2)")
        else:
            o.ok(pedido_ok(ev, Nm, exp), f"{t} L5 o pedido da página {P}: {descr(ev) or nao_veio(rede, L, desde)}")
        if not ok:
            caso.diagnostico()
            return
        paginas[P] = tokens(prox, L.tipo)
        atual = prox
    ultima = max(paginas)
    o.ok(atual["proxima"] in ("desligado", "ausente"), f"{t} L5 na última página ({ultima}) o Próxima fica desligado ({atual['proxima']})")
    vistos = [x for P in sorted(paginas) for x in paginas[P] if x]
    repetidos = sorted({x for x in vistos if vistos.count(x) > 1})
    faltam = sorted({f"{i:02d}" for i in range(1, MASSA + 1)} - set(vistos))
    alvo = next((x for x in reversed(paginas[ultima]) if x), None)
    o.ok(not repetidos and not faltam,
         f"{t} L5 as 41 da massa aparecem 1 vez cada nas {len(paginas)} páginas (faltam: {faltam or '—'}; repetidas: {repetidos or '—'}); "
         f"na página {ultima}: {L.tipo} #{alvo}")
    o.linha(f"   print: {caso.print(f'{L.nome}_pagina{ultima}')}")
    if not alvo:
        o.ok(False, f"{t} L6 nenhum item da massa na página {ultima} para buscar")
        return
    # L6 — de volta à 1 e a busca pelo item da última página
    for P in range(ultima - 1, 0, -1):
        ok, atual = mudar_pagina(caso, L, nome, "anterior", P, atual)
        if not ok:
            break
    o.ok(atual.get("pagina") == 1 and na_pagina(atual.get("url") or "", 1, L.chave), f"{t} L6 de volta à página 1 pelo Anterior ({atual.get('url')})")
    if busca:
        termo = f"{L.tipo} #{alvo}"
        busca.fill(termo)
        ok, sb = esperar_lista(caso, L, lambda e: alvo in tokens(e, L.tipo) and (e["total"] or 0) < MASSA, 30)
        o.ok(ok and sb["pagina"] == 1 and na_pagina(sb["url"], 1, L.chave),
             f"{t} L6 estando na página 1, a busca '{termo}' (o item da página {ultima}) acha o item ('{sb.get('rotulo')}') e fica na página 1")
        # L7 — na página 2, mudar a busca volta à 1; limpar a busca
        busca.fill(marca)
        ok, s1 = esperar_lista(caso, L, lambda e: e["total"] == MASSA and e["pagina"] == 1 and len(e["textos"]) == POR_PAGINA, 30)
        ok2, s2 = mudar_pagina(caso, L, nome, "proxima", 2, s1) if ok else (False, s1)
        busca.fill(termo)
        ok3, s3 = esperar_lista(caso, L, lambda e: alvo in tokens(e, L.tipo) and (e["total"] or 0) < MASSA, 30)
        o.ok(ok and ok2 and ok3 and s3["pagina"] == 1 and na_pagina(s3["url"], 1, L.chave),
             f"{t} L7 na página 2, mudar a busca volta à 1 (antes {s2.get('url')}; depois {s3.get('url')}, '{s3.get('rotulo')}')")
        busca.fill("")
        ok4, s4 = esperar_lista(caso, L, lambda e: e["total"] == N and e["pagina"] == 1, 30)
        o.ok(ok4 and s4["rotulo"] == rotulo(1, N), f"{t} L7 limpar a busca → a lista inteira de novo, na página 1 ('{s4.get('rotulo')}')")
        return
    if L.filtro and L.filtro != "diario":
        filtrar = FILTROS.get(L.filtro)
        if not o.ok(filtrar is not None, f"{t} L6 o filtro '{L.filtro}' da lista"):
            return
        filtrar(o, caso, rede, R, L, nome, N, alvo)
        return
    # o Diário: o filtro Aluno (o registro #NN é do aluno #NN)
    paciente = (R.massa or {}).get("alunos", {}).get(alvo)
    if not o.ok(bool(paciente), f"{t} L6 o aluno do registro #{alvo} no estado da massa"):
        return
    via = filtrar_aluno_diario(caso, R, L, paciente)
    ok, sb = esperar_lista(caso, L, lambda e: alvo in tokens(e, L.tipo) and (e["total"] or 0) < N, 30)
    o.ok(via == "tela", f"{t} L6 o filtro Aluno da tela oferece o aluno do registro da página {ultima} estando na página 1 "
                        f"({'sim' if via == 'tela' else 'não: ' + via + ' — filtrado pelo endereço ?aluno='})")
    o.ok(ok and sb["pagina"] == 1 and na_pagina(sb["url"], 1, L.chave),
         f"{t} L6 filtrado pelo aluno do registro #{alvo} (página {ultima}): ele aparece e a página é a 1 ('{sb.get('rotulo')}', {sb.get('url')})")
    if via != "tela":
        return
    sel = caso.pg.locator("[data-campo-aluno]").first
    sel.select_option("")
    ok, s1 = esperar_lista(caso, L, lambda e: e["total"] == N and e["pagina"] == 1, 30)
    ok2, s2 = mudar_pagina(caso, L, nome, "proxima", 2, s1) if ok else (False, s1)
    sel.select_option(paciente)
    ok3, s3 = esperar_lista(caso, L, lambda e: alvo in tokens(e, L.tipo) and (e["total"] or 0) < N, 30)
    o.ok(ok and ok2 and ok3 and s3["pagina"] == 1 and na_pagina(s3["url"], 1, L.chave),
         f"{t} L7 na página 2, mudar o filtro Aluno volta à 1 (antes {s2.get('url')}; depois {s3.get('url')})")
    sel.select_option("")
    ok4, s4 = esperar_lista(caso, L, lambda e: e["total"] == N and e["pagina"] == 1, 30)
    o.ok(ok4, f"{t} L7 tirar o filtro → a lista inteira de novo, na página 1 ('{s4.get('rotulo')}')")


def nome_do_item(st: dict, i: int, L: Lista) -> str:
    """O nome do item i da página: o seletor do nome (nome_item; "@data-x" = o atributo) ou, sem ele, a 1ª linha do texto da linha."""
    nomes = st.get("nomesItens") or []
    if L.nome_item and i < len(nomes) and nomes[i]:
        return nomes[i]
    linhas = st.get("linhas1") or []
    return linhas[i] if i < len(linhas) else ""


def provar_sem_massa(o, caso, rede: Rede, R: Rodada, L: Lista, nome: str, N: int, st1: dict) -> None:
    """Listas sem massa (os Alimentos da 14b; hml-14d: Contas, Financeiro, Integrações e a Biblioteca do master): as páginas 1 → a
    última (até a 3ª), a busca pelo 1º item da última estando na 1 e, na página 2, mudar a busca volta à 1."""
    t = f"[{L.nome}]"
    o.linha(f"   print: {caso.print(f'{L.nome}_pagina1')}")
    atual = st1
    ultima = min(math.ceil(N / POR_PAGINA), 3)
    for P in range(2, ultima + 1):
        desde = len(rede.eventos)
        ok, atual = mudar_pagina(caso, L, nome, "proxima", P, atual)
        exp = min(POR_PAGINA, N - (P - 1) * POR_PAGINA)
        o.ok(ok and atual["rotulo"] == rotulo(P, N) and len(atual["textos"]) == exp and na_pagina(atual["url"], P, L.chave),
             f"{t} L5 página {P}: '{atual.get('rotulo')}' (esperado '{rotulo(P, N)}'), {len(atual.get('textos') or [])} linha(s), {atual.get('url')}")
        ev = esperar_pedido(caso, rede, L, desde, P)
        if ev is None and ok and P <= 2:
            # a página 2 já foi pedida no L2/L3: o React Query devolve do cache (mesma chave) — o pedido dela já foi provado
            R.aviso(f"{t} L5 a página {P} veio do cache da tela (o pedido dela foi provado no L2)")
        else:
            o.ok(pedido_ok(ev, N, exp), f"{t} L5 o pedido da página {P}: {descr(ev) or nao_veio(rede, L, desde)}")
        if not ok:
            caso.diagnostico()
            return
    if ultima > 1:
        o.ok(atual["proxima"] in ("desligado", "ausente") or ultima < math.ceil(N / POR_PAGINA),
             f"{t} L5 na última página ({ultima}) o Próxima fica desligado ({atual['proxima']})")
        o.linha(f"   print: {caso.print(f'{L.nome}_pagina{ultima}')}")
    alvo = nome_do_item(atual, 0, L)
    for P in range(ultima - 1, 0, -1):
        ok, atual = mudar_pagina(caso, L, nome, "anterior", P, atual)
    busca = campo_busca(caso, L) if L.busca else None
    if not L.busca:
        return
    if not o.ok(busca is not None and alvo and atual.get("pagina") == 1, f"{t} L6 na página 1, o campo de busca e o nome do 1º item da página {ultima}"):
        return
    achou = (lambda e: any(alvo in x for x in (e.get("nomesItens") or []) + (e.get("textos") or [])) and (e["total"] or 0) < N)
    busca.fill(alvo)
    ok, sb = esperar_lista(caso, L, achou, 30)
    o.ok(ok and sb["pagina"] == 1 and na_pagina(sb["url"], 1, L.chave),
         f"{t} L6 estando na página 1, a busca pelo 1º item da página {ultima} ({alvo!r}) acha o item ('{sb.get('rotulo')}') e fica na página 1")
    busca.fill("")
    ok, s1 = esperar_lista(caso, L, lambda e: e["total"] == N and e["pagina"] == 1, 30)
    if ultima < 2:
        return
    ok2, s2 = mudar_pagina(caso, L, nome, "proxima", 2, s1) if ok else (False, s1)
    busca.fill(alvo)
    ok3, s3 = esperar_lista(caso, L, achou, 30)
    o.ok(ok and ok2 and ok3 and s3["pagina"] == 1 and na_pagina(s3["url"], 1, L.chave),
         f"{t} L7 na página 2, mudar a busca volta à 1 (antes {s2.get('url')}; depois {s3.get('url')})")
    busca.fill("")


def provar_lista_celular(o, nav, R: Rodada, L: Lista) -> None:
    t = f"[{L.nome} 390px]"
    caso, _ = R.novo_caso(nav, f"lista_{L.nome}_390px", desktop=False, fontes=L.fontes)
    try:
        R.entrar(caso, L.rota, L.conta)
        ok, st = esperar_lista(caso, L, lambda e: e["temPaginacao"] and e["textos"], 90)
        if not o.ok(ok, f"{t} a lista abre no celular"):
            caso.diagnostico()
            return
        busca = campo_busca(caso, L) if (L.tipo and L.busca) else None
        if busca:
            busca.fill(R.marca_de(L))
            esperar_lista(caso, L, lambda e: e["total"] == MASSA and len(e["textos"]) == POR_PAGINA, 30)
        rolar_ate(caso, f'[data-paginacao="{st["nome"]}"]')
        st = ler(caso, L)
        o.ok(0 < st["largura"] <= LARGURA_CELULAR and (st["direita"] or 0) <= LARGURA_CELULAR,
             f"{t} L8 celular 390 px: '{st['rotulo']}' sem rolar para o lado (scrollWidth {st['largura']}; a paginação até {st['direita']} px)")
        o.linha(f"   print: {caso.print(f'{L.nome}_390px')}")
    finally:
        caso.fim()


# ───────────────────────── B19: o campo que escolhe aluno ─────────────────────────
def campo_do_seletor(caso, campo: str):
    raiz = caso.pg.locator(f'[data-seletor-aluno="{campo}"]').first
    if not caso.esperar(lambda: raiz.count() > 0 and raiz.is_visible(), 20):
        return None
    busca = raiz.locator("[data-seletor-aluno-busca]").first
    if not busca.count():
        busca = caso.pg.locator("[data-seletor-aluno-busca]").first  # (num portal)
    if not caso.esperar(lambda: busca.count() > 0 and busca.is_visible(), 5):
        gatilho = raiz.locator("[role='combobox'], button").first
        if gatilho.count():
            gatilho.click()
        if not caso.esperar(lambda: busca.count() > 0 and busca.is_visible(), 10):
            return None
    return busca


def seletor(caso) -> dict:
    try:
        return caso.pg.evaluate(JS_SELETOR)
    except Exception:  # noqa: BLE001
        return {"termo": None, "buscando": True, "ids": []}


def buscar_no_seletor(caso, busca, termo: str, cond=None, timeout: float = 20) -> list[str]:
    """Digita o termo e espera a resposta DELE (data-termo = o termo, fora do "buscando"); `cond(ids)` quando a tela não diz o termo."""
    busca.fill(termo)
    alvo = re.sub(r"\s+", " ", termo).strip()

    def pronta() -> bool:
        s = seletor(caso)
        if s["buscando"] or (s["termo"] is not None and s["termo"] != alvo):
            return False
        return cond(s["ids"]) if cond else s["termo"] == alvo

    caso.esperar(pronta, timeout)
    caso.pg.wait_for_timeout(300)
    return seletor(caso)["ids"]


def pedido_do_termo(rede: Rede, desde: int, termo: str) -> dict | None:
    alvo = re.sub(r"\s+", " ", termo).strip().lower()
    achados = [e for e in rede.eventos[desde:] if e["nome"] == "alunos_da_conta" and re.sub(r"\s+", " ", e.get("q") or "").strip().lower() == alvo]
    return achados[-1] if achados else None


def provar_resposta_velha(o, caso, busca, R: Rodada, t: str) -> None:
    """B3: a busca anterior fica RETIDA no navegador (o pedido não sai) até a nova chegar; solta, a resposta velha não pode trocar a
    lista. O termo velho é novo (sem cache): a marca + " · aluno"."""
    ze = R.massa["ze"]
    velho = f"{R.marca} · aluno"
    retidos: list = []

    def reter(route) -> None:
        q = termo_do_pedido(corpo_json(route.request.post_data)) or ""
        if route.request.method == "POST" and velho.lower() in q.lower():
            retidos.append(route)
            return
        route.continue_()

    padrao = "**/rest/v1/rpc/alunos_da_conta*"
    caso.pg.route(padrao, reter)
    segurou = nova = False
    final: list[str] = []
    try:
        busca.fill(velho)
        segurou = caso.esperar(lambda: bool(retidos), 10)
        nova = buscar_no_seletor(caso, busca, ze["cpf"], lambda ids: ids == [ze["id"]]) == [ze["id"]]
    finally:
        for r in retidos:
            try:
                r.continue_()
            except Exception:  # noqa: BLE001 — o pedido já foi cancelado pela tela (também vale)
                pass
        caso.pg.wait_for_timeout(3000)
        final = seletor(caso)["ids"]
        try:
            caso.pg.unroute(padrao, reter)
        except Exception:  # noqa: BLE001
            pass
    o.ok(segurou and nova and final == [ze["id"]],
         f"{t} B3 digitar rápido: a resposta da busca anterior (retida até a do CPF chegar) não aparece por cima — no fim só o Zé "
         f"({len(final)} opção(ões); pedido retido: {'sim' if segurou else 'não'})")


def provar_campo(o, nav, R: Rodada, F: Campo, desktop: bool = True) -> None:
    t = f"[B19 {F.nome}{'' if desktop else ' 390px'}]"
    caso, rede = R.novo_caso(nav, f"b19_{F.nome}" + ("" if desktop else "_390px"), desktop=desktop, fontes={("rpc", "alunos_da_conta")})
    ze, gemeo = R.massa["ze"], R.massa.get("gemeo")
    try:
        rota = F.rota + (f"&q={urllib.parse.quote(R.marca)}" if F.nome == "ligar" else "")
        R.entrar(caso, rota)
        botao = caso.pg.locator(F.abrir).first
        if not o.ok(caso.esperar(lambda: botao.count() > 0 and botao.is_visible() and botao.is_enabled(), 90), f"{t} o botão que abre o diálogo ({F.abrir})"):
            caso.diagnostico()
            return
        botao.click()
        if not o.ok(caso.esperar(lambda: caso.tem(F.modal), 30), f"{t} o diálogo abriu ({F.modal})"):
            caso.diagnostico()
            return
        busca = campo_do_seletor(caso, F.nome)
        if not o.ok(busca is not None, f"{t} o campo de aluno é o SeletorDeAluno (data-seletor-aluno='{F.nome}' + data-seletor-aluno-busca)"):
            caso.diagnostico()
            return
        termos = (("parte do nome", "Últim"), ("sem acento", "ze ultimo"), ("telefone", ze["telefone"]), ("CPF", ze["cpf"]))
        for rot, termo in termos if desktop else termos[-1:]:
            desde = len(rede.eventos)
            ids = buscar_no_seletor(caso, busca, termo, lambda ids: ze["id"] in ids)
            fora = [i for i in ids if i not in R.conta_ids]
            mostra = {"CPF": "o CPF de teste", "telefone": "o telefone de teste (só dígitos)"}.get(rot, repr(termo))
            o.ok(ze["id"] in ids, f"{t} B1 acha o Zé Último por {rot} ({mostra} → {len(ids)} opção(ões))")
            o.ok(not fora and not (gemeo and gemeo["id"] in ids),
                 f"{t} B1 nenhuma opção de outra conta ({rot}: {len(fora)} fora da conta; o gêmeo de outra conta "
                 f"{'APARECEU' if gemeo and gemeo['id'] in ids else 'não aparece' if gemeo else '— sem gêmeo na massa'})")
            if desktop:
                ev = pedido_do_termo(rede, desde, termo)
                o.ok(bool(ev) and ev["limite"] == POR_PAGINA and (ev["n"] or 0) <= POR_PAGINA,
                     f"{t} B1 o pedido da busca por {rot}: {descr(ev) or 'nenhuma alunos_da_conta com esse termo'}")
            if rot == "CPF":
                if not desktop:
                    larg = caso.pg.evaluate("document.documentElement.scrollWidth")
                    o.ok(0 < larg <= LARGURA_CELULAR, f"{t} B4 celular 390 px: o diálogo com a busca sem rolar para o lado (scrollWidth {larg})")
                o.linha(f"   print: {caso.print(f'b19_{F.nome}_cpf' + ('' if desktop else '_390px'))}")
        if desktop:
            if gemeo:
                ids = buscar_no_seletor(caso, busca, gemeo["cpf"])
                o.ok(not ids, f"{t} B1 o CPF do gêmeo (aluno de outra conta) não acha ninguém ({len(ids)} opção(ões); "
                              f"'Cadastrar aluno' {'à vista' if caso.tem('[data-seletor-aluno-cadastrar]') else 'não'})")
            ids = buscar_no_seletor(caso, busca, R.marca, lambda ids: len(ids) == POR_PAGINA)
            mais = texto_de(caso, "[data-seletor-aluno-mais]")
            o.ok(len(ids) == POR_PAGINA and bool(re.search(rf"\b{POR_PAGINA}\s+de\s+{MASSA}\b", mais)),
                 f"{t} B2 a marca acha os 41: {len(ids)} opções e '{mais}' (esperado '20 de 41 — refine a busca')")
            # B5 — as buscas do seletor (situação dele; o número do menu e o do cadastro usam 'ativos' e ficam de fora)
            buscas = [e for e in rede.eventos if e["nome"] == "alunos_da_conta" and e["status"] < 300
                      and e.get("situacao") in ("ativos_e_bloqueados", "todos")]
            com_cpf = sum(1 for e in buscas if e.get("com_cpf"))
            pediu = sum(1 for e in buscas if e.get("exportar"))
            if F.nome == "recibo":
                o.ok(bool(buscas) and pediu == len(buscas),
                     f"{t} B5 o Recibo (imprime o CPF) pede o CPF ao banco: {pediu} de {len(buscas)} busca(s) com exportar; {com_cpf} com CPF")
            else:
                o.ok(bool(buscas) and pediu == 0 and com_cpf == 0,
                     f"{t} B5 dado pessoal mínimo: {len(buscas)} busca(s), {pediu} pediram o CPF e {com_cpf} trouxeram (a busca pelo CPF acha no banco)")
            provar_resposta_velha(o, caso, busca, R, t)
        o.ok(fechar_dialogo(caso) and not caso.tem(F.modal), f"{t} o diálogo fechou com Esc, sem salvar")
    finally:
        caso.fim()


# ───────────────────────── produção (só leitura) ─────────────────────────
def contagens_producao(R: Rodada) -> dict | None:
    try:
        r = R.C.ler(R.C.PRINCIPAL_REF, " union all ".join(f"select '{x}' as t, count(*)::int as n from public.{x}" for x in TABELAS_PROD))
        return {x["t"]: x["n"] for x in r}
    except Exception as e:  # noqa: BLE001
        R.o.linha(f"   contagens do banco (só leitura): {type(e).__name__}: {str(e)[:160]}")
        return None


def conta_ativa_producao(R: Rodada, chave: str) -> str | None:
    """A conta legado_nutri da nutri de teste no public (só leitura) — a mesma da tela (o card da conta)."""
    email = R.B5.CONTAS[chave][0]
    try:
        r = R.C.ler(R.C.PRINCIPAL_REF, f"""select c.id::text as id from public.contas c
                                              join public.conta_membros m on m.conta_id = c.id and m.status = 'ativo'
                                              join auth.users u on u.id = m.user_id
                                             where lower(u.email) = {R.C.txt(email.lower())} and c.origem <> 'app'
                                             order by (c.origem = 'legado_nutri') desc, c.criado_em limit 1""")
    except Exception:  # noqa: BLE001
        return None
    return r[0]["id"] if r else None


def menu_da_conta(o, nav, R: Rodada, chave: str) -> set[str]:
    caso, _ = R.novo_caso(nav, f"prod_{chave}_menu")
    try:
        R.entrar(caso, "/painel", chave)
        caso.esperar(lambda: caso.pg.locator("[data-menu-lateral] [data-nav]").count() > 0, 60)
        navs = caso.pg.locator("[data-menu-lateral] [data-nav]").evaluate_all("els => els.map((e) => e.getAttribute('data-nav'))")
        o.linha(f"   [prod {chave}] menu: {', '.join(sorted(set(navs)))}")
        return set(navs)
    finally:
        caso.fim()


def provar_lista_producao(o, nav, R: Rodada, chave: str, L: Lista, desktop: bool = True) -> None:
    t = f"[prod {chave} · {L.nome}{'' if desktop else ' 390px'}]"
    caso, rede = R.novo_caso(nav, f"prod_{chave}_{L.nome}" + ("" if desktop else "_390px"), desktop=desktop, fontes=L.fontes)
    try:
        R.entrar(caso, L.rota, chave)
        if L.antes:  # hml-14d: a lista só aparece pelo botão (o "Ver todos (N)"); sem o botão, a lista cabe no cartão
            botao = caso.pg.locator(L.antes).first
            if not caso.esperar(lambda: botao.count() > 0 and botao.is_visible(), 45):
                o.linha(f"   {t} sem o botão {L.antes} (a lista cabe no cartão): fica de fora")
                return
            botao.click()
        ev = esperar_pedido(caso, rede, L, 0, 1, 60)
        caso.pg.wait_for_timeout(1500)
        st = ler(caso, L)
        N = ev["total"] if ev and isinstance(ev.get("total"), int) else int(st["total"] or 0)
        o.ok(pedido_ok(ev, N, min(POR_PAGINA, N)), f"{t} o pedido traz só 20 (limit/p_limite 20 ou pagina 1): {descr(ev) or nao_veio(rede, L, 0)}")
        avisar_grandes(R, t, rede, L, 0)
        if N == 0:
            o.ok(not st["temPaginacao"], f"{t} lista vazia: sem paginação (o componente some com 0)")
        elif N <= POR_PAGINA:
            o.ok(st["rotulo"] == rotulo(1, N) and st["anterior"] == "ausente" and st["proxima"] == "ausente" and len(st["textos"]) == N,
                 f"{t} '{st['rotulo']}' (esperado '{rotulo(1, N)}'), sem setas, {len(st['textos'])} linha(s)")
        else:
            o.ok(st["rotulo"] == rotulo(1, N) and len(st["textos"]) == POR_PAGINA and st["proxima"] == "ligado",
                 f"{t} '{st['rotulo']}' (esperado '{rotulo(1, N)}'), 20 linhas e o Próxima")
            if desktop:
                desde = len(rede.eventos)
                ok, st2 = mudar_pagina(caso, L, st["nome"], "proxima", 2, st)
                exp2 = min(POR_PAGINA, N - POR_PAGINA)
                o.ok(ok and st2["rotulo"] == rotulo(2, N) and na_pagina(st2["url"], 2, L.chave), f"{t} Próxima → '{st2.get('rotulo')}' e ?pagina=2 (só leitura)")
                ev2 = esperar_pedido(caso, rede, L, desde, 2)
                o.ok(pedido_ok(ev2, N, exp2), f"{t} o pedido da página 2: {descr(ev2) or nao_veio(rede, L, desde)}")
        if not desktop:
            o.ok(0 < st["largura"] <= LARGURA_CELULAR, f"{t} celular 390 px sem rolar para o lado (scrollWidth {st['largura']})")
        try:
            caso.pg.add_style_tag(content=BORRAR)
        except Exception:  # noqa: BLE001
            pass
        o.linha(f"   print: {caso.print(f'{chave}_{L.nome}' + ('' if desktop else '_390px'))}")
    finally:
        caso.fim()


# ───────────────────────── hml-14d: peças dos casos novos (usadas por telas_treino/_master/_aluno) ─────────────────────────
FILTROS: dict = {  # listas sem busca de texto: o filtro pelo item da última página (telas_treino registra o "seletor-treino")
    "nenhum": lambda o, caso, rede, R, L, nome, N, alvo: o.linha(f"   [{L.nome}] L6/L7: a lista não tem busca nem filtro (a página é a do banco)"),
}


@dataclass(frozen=True)
class Caso14d:
    codigo: str                     # T1 · M3 · P5…
    titulo: str
    parte: str                      # a parte da massa que o caso usa (treino | master | aluno | 14b)
    fn: object                      # fn(o, nav, R, desktop: bool)
    modos: tuple[bool, ...] = (True, False)  # True = computador 1280; False = celular 390 (o --sem-celular tira)


def massa_ns(a) -> argparse.Namespace:
    """Os argumentos do massa.py (os padrões dele) para o --massa daqui."""
    return argparse.Namespace(login=M.LOGIN_PADRAO, conta_id=None, marca=None, sem_gemeo=False, outra_conta=None,
                              professor="w13.dono.teste.claude@physiqnutri.app", aluno_treino="w13.aluno.teste.claude@physiqnutri.app",
                              master="w27.master.teste.claude@physiqnutri.app", aluno_app="w13.aluno.teste.claude@physiqnutri.app",
                              estado=a.estado)


def chave_do_email(R: Rodada, email: str | None) -> str | None:
    """A chave das CONTAS da W5 de um login de teste do estado da massa (as da 14d estão em CONTAS_14D)."""
    e = (email or "").strip().lower()
    for k, (em, _) in R.B5.CONTAS.items():
        if em.lower() == e:
            return k
    return None


def ate_a_ultima(o, caso, rede: Rede, R: Rodada, L: Lista, nome: str, Nm: int, st: dict, t: str, max_paginas: int = MAX_PAGINAS) -> tuple[dict, dict]:
    """Próxima até a última página (até max_paginas): o rótulo, as linhas e o pedido de cada uma. Devolve ({página: tokens}, o estado
    da última)."""
    ultima = min(math.ceil(Nm / POR_PAGINA), max_paginas)
    paginas = {1: tokens(st, L.tipo)}
    ids = {1: list(st.get("ids") or [])}
    atual = st
    for P in range(2, ultima + 1):
        desde = len(rede.eventos)
        ok, prox = mudar_pagina(caso, L, nome, "proxima", P, atual)
        exp = min(POR_PAGINA, Nm - (P - 1) * POR_PAGINA)
        o.ok(ok and prox["rotulo"] == rotulo(P, Nm) and len(prox["textos"]) == exp and (L.chave is None or na_pagina(prox["url"], P, L.chave)),
             f"{t} página {P}: '{prox.get('rotulo')}' (esperado '{rotulo(P, Nm)}'), {len(prox.get('textos') or [])} linha(s), {prox.get('url')}")
        ev = esperar_pedido(caso, rede, L, desde, P)
        if ev is None and ok and P <= 2:
            R.aviso(f"{t} a página {P} veio do cache da tela (o pedido dela foi provado antes)")
        else:
            o.ok(pedido_ok(ev, Nm, exp), f"{t} o pedido da página {P}: {descr(ev) or nao_veio(rede, L, desde)}")
        if not ok:
            caso.diagnostico()
            break
        paginas[P] = tokens(prox, L.tipo)
        ids[P] = list(prox.get("ids") or [])
        atual = prox
    IDS_DAS_PAGINAS[L.nome] = ids
    return paginas, atual


IDS_DAS_PAGINAS: dict[str, dict] = {}  # os ids das linhas de cada página da última ate_a_ultima de cada lista (P1–P6)


def conferir_massa_nas_paginas(o, paginas: dict, L: Lista, t: str, quantos: int = MASSA) -> str | None:
    """Os N da massa aparecem 1 vez cada nas páginas; devolve o número do último item da massa na última página."""
    vistos = [x for P in sorted(paginas) for x in paginas[P] if x]
    repetidos = sorted({x for x in vistos if vistos.count(x) > 1})
    faltam = sorted({f"{i:02d}" for i in range(1, quantos + 1)} - set(vistos))
    ultima = max(paginas)
    alvo = next((x for x in reversed(paginas[ultima]) if x), None)
    o.ok(not repetidos and not faltam, f"{t} os {quantos} da massa aparecem 1 vez cada nas {len(paginas)} páginas (faltam: {faltam or '—'}; "
                                       f"repetidos: {repetidos or '—'}); na página {ultima}: {L.tipo} #{alvo}")
    return alvo


def conferir_ids(o, L: Lista, esperados, t: str) -> None:
    """Sem o número da massa no texto da linha: os ids da massa (do estado) aparecem 1 vez cada nas páginas (o id da linha)."""
    paginas = IDS_DAS_PAGINAS.get(L.nome) or {}
    vistos = [x for P in sorted(paginas) for x in paginas[P] if x]
    alvo = list(esperados.values()) if isinstance(esperados, dict) else list(esperados or [])
    faltam = [x for x in alvo if x not in vistos]
    repetidos = sorted({x for x in vistos if vistos.count(x) > 1})
    o.ok(bool(alvo) and not faltam and not repetidos, f"{t} os {len(alvo)} da massa aparecem 1 vez cada nas {len(paginas)} páginas, pelo id "
                                                      f"da linha (faltam {len(faltam)}; repetidos {len(repetidos)})")


def conferir_massa(o, paginas: dict, L: Lista, esperados, t: str, quantos: int = MASSA) -> str | None:
    """Pelo número da massa no texto da linha; se nenhuma linha mostra o número (ex.: a consulta do app mostra a área, não o título),
    pelos ids do estado."""
    if any(x for P in paginas for x in paginas[P]) or not esperados:
        return conferir_massa_nas_paginas(o, paginas, L, t, quantos)
    conferir_ids(o, L, esperados, t)
    return None


def provar_folha(o, caso, rede: Rede, R: Rodada, L: Lista, abrir, t: str, quantos: int | None = None, busca_massa: bool = True,
                 esperados=None) -> None:
    """Lista DENTRO de uma folha (a página no estado da folha — fecha = volta à 1; o "Ver todos" do app e as folhas do editor): abre,
    "1–20 de N" + o pedido só com 20, (com busca) a marca → 41, Próxima até a última (os 41 aparecem), a busca pelo item da última
    página volta à 1, fecha e abre de novo → página 1. `abrir()` abre a folha e devolve se abriu."""
    if not o.ok(abrir(), f"{t} a folha abre"):
        caso.diagnostico()
        return
    ok, st = esperar_lista(caso, L, lambda e: e["temPaginacao"] and e["textos"], 60)
    if not o.ok(ok, f"{t} a lista da folha com data-lista / data-paginacao ('{' | '.join(L.candidatos)}') e as linhas data-item"):
        caso.diagnostico()
        return
    nome, N = st["nome"], int(st["total"] or 0)
    fundo = R.fundo(L)
    o.ok(N >= (quantos or MASSA), f"{t} o total: {N}" + (f" (no banco: {quantos or MASSA} da massa + {fundo} de fundo)" if isinstance(fundo, int) else ""))
    if isinstance(fundo, int) and N != (quantos or MASSA) + fundo:
        R.aviso(f"{t} o total da tela ({N}) difere da conta do massa.py ({quantos or MASSA} + {fundo})")
    o.ok(st["rotulo"] == rotulo(1, N) and len(st["textos"]) == min(POR_PAGINA, N), f"{t} '{st['rotulo']}' (esperado '{rotulo(1, N)}'), {len(st['textos'])} linhas")
    ev = esperar_pedido(caso, rede, L, 0, 1)
    o.ok(pedido_ok(ev, N, min(POR_PAGINA, N)), f"{t} o pedido traz só 20: {descr(ev) or nao_veio(rede, L, 0)}")
    avisar_grandes(R, t, rede, L, 0)
    marca = R.marca_de(L)
    busca = campo_busca(caso, L) if L.busca else None
    Nm, sm = N, st
    if busca and busca_massa:
        desde = len(rede.eventos)
        busca.fill(marca)
        ok, sm = esperar_lista(caso, L, lambda e: e["total"] == (quantos or MASSA) and e["pagina"] == 1 and len(e["textos"]) == POR_PAGINA
                               and all(marca_em(x, marca) for x in e["textos"]), 30)
        Nm = quantos or MASSA
        o.ok(ok and sm["rotulo"] == rotulo(1, Nm), f"{t} a busca pela marca → '{sm.get('rotulo')}' (esperado '{rotulo(1, Nm)}')")
        ev = esperar_pedido(caso, rede, L, desde, 1)
        o.ok(pedido_ok(ev, Nm, POR_PAGINA), f"{t} o pedido da busca: {descr(ev) or nao_veio(rede, L, desde)}")
        if not ok:
            caso.diagnostico()
            return
    o.linha(f"   print: {caso.print(f'{L.nome}_pagina1')}")
    paginas, _ = ate_a_ultima(o, caso, rede, R, L, nome, Nm, sm, t)
    alvo = conferir_massa(o, paginas, L, esperados, t, quantos or MASSA) if L.tipo and Nm <= MAX_PAGINAS * POR_PAGINA else None
    o.linha(f"   print: {caso.print(f'{L.nome}_pagina{max(paginas)}')}")
    if busca and alvo:
        termo = f"{L.tipo} #{alvo}"
        busca.fill(termo)
        ok, sb = esperar_lista(caso, L, lambda e: alvo in tokens(e, L.tipo) and e["pagina"] == 1, 30)
        o.ok(ok, f"{t} na página {max(paginas)}, a busca '{termo}' acha o item e volta à página 1 ('{sb.get('rotulo')}')")
    fechar_dialogo(caso)
    reaberta = abrir()
    ok, st2 = esperar_lista(caso, L, lambda e: e["temPaginacao"] and e["textos"], 30) if reaberta else (False, {})
    o.ok(reaberta and ok and st2.get("pagina") == 1, f"{t} fechar e abrir de novo → página 1 ('{st2.get('rotulo')}')")
    fechar_dialogo(caso)


# ───────────────────────── staging: a massa ─────────────────────────
def preparar_massa(o, R: Rodada, a, partes: set[str]) -> set[str]:
    """O estado da massa (ou --massa: cria as partes que os casos usam) e, para cada parte, se está inteira no banco (só leitura).
    Devolve as partes prontas; os casos de uma parte que falta ficam de fora com o ❌ dela."""
    arquivo = Path(a.estado)
    if a.massa:
        print(f"\n== massa (--massa): criando no staging ({', '.join(sorted(partes))})")
        M.criar_tudo(massa_ns(a), tuple(x for x in M.PARTES if x in partes), arquivo)
    estado = M.ler_estado(arquivo)
    if not o.ok(bool(estado), f"o estado da massa ({arquivo}) — sem ele: python3 e2e/hml14/massa.py --criar (ou --massa aqui)"):
        return set()
    if not o.ok(estado.get("schema") == "staging", f"a massa é do schema staging ({estado.get('schema')})"):
        return set()
    R.massa = estado
    prontas: set[str] = set()
    if "14b" in partes:
        if o.ok(estado.get("login") == R.B5.CONTAS[R.chave][0].lower() and estado.get("conta_id"),
                f"a massa da 14b é da conta de teste {R.chave} ({estado.get('login')})"):
            try:
                cont = M.contar(M.contexto_do_estado(estado), estado["marca"])
                R.conta_ids = {x["id"] for x in R.C.ler(R.C.PRINCIPAL_REF, f"""select id::text as id from staging.pacientes
                                                                               where conta_id = {R.C.txt(estado['conta_id'])}::uuid and deleted_at is null""")}
                faltas = M.massa_completa(cont, bool(estado.get("gemeo")))
                if not estado.get("ze"):
                    faltas.append("Zé Último")
                estado["contagens"] = cont
                R.conta_ativa[R.chave] = estado["conta_id"]
                if o.ok(not faltas, f"a massa '{estado['marca']}' da 14b está inteira no staging (conta {estado.get('conta_nome')!r}; fundo: "
                                    f"{', '.join(f'{k} {cont.get(k)}' for k in ('alunos_fundo', 'lancamentos_fundo', 'recibos_fundo', 'respostas_fundo', 'diario_fundo', 'receitas_fundo', 'removidos_fundo'))})"
                                    + (f" — falta: {faltas}" if faltas else "")):
                    prontas.add("14b")
            except Exception as e:  # noqa: BLE001
                o.ok(False, f"a massa da 14b no staging (só leitura): {type(e).__name__}: {str(e)[:200]}")
    MT, MP = M._modulos()
    for parte in ("treino", "master", "aluno"):
        if parte not in partes:
            continue
        e = estado.get(parte) or {}
        if not o.ok(bool(e.get("marca")), f"a parte '{parte}' da massa está no estado — sem ela: massa.py --criar --partes {parte}"):
            continue
        try:  # as contagens de agora (só leitura): o fundo de cada lista e se a massa continua inteira
            if parte == "treino":
                cont = MT.contar(e, e["marca"])
                faltas = MT.massa_completa(cont)
            elif parte == "master":
                cont = MP.contar_master(e, e["marca"])
                faltas = ([] if cont.get("app_massa") == MASSA else [f"app_massa {cont.get('app_massa')}"]) + (
                    [] if cont.get("papel") == "master" else [f"o master de teste não é master no staging (papel {cont.get('papel')!r})"])
            else:
                cont = MP.contar_aluno(e, e["marca"])
                faltas = MP.massa_aluno_completa(cont)
            e["contagens"] = cont
        except Exception as x:  # noqa: BLE001
            o.ok(False, f"a parte '{parte}' no staging (só leitura): {type(x).__name__}: {str(x)[:200]}")
            continue
        if o.ok(not faltas, f"a parte '{parte}' da massa '{e['marca']}' está inteira no staging" + (f" — falta: {faltas}" if faltas else "")):
            prontas.add(parte)
    aluno = estado.get("aluno") or {}
    for chave in (chave_do_email(R, aluno.get("profissional_email")),):
        if chave and aluno.get("conta_id"):
            R.conta_ativa[chave] = aluno["conta_id"]
    return prontas


def interpretar_casos(texto: str, c14d: dict) -> set[str]:
    """Os nomes da 14b, os códigos da 14d e os grupos (b19, treino, master, aluno, 14b, 14d, x1)."""
    grupos = {"b19": {f"b19-{F.nome}" for F in CAMPOS}, "14b": set(TODOS), "14d": set(c14d),
              "treino": {k for k in c14d if k.startswith("T")}, "master": {k for k in c14d if k.startswith("M")},
              "aluno": {k for k in c14d if k.startswith("P")}}
    casos: set[str] = set()
    for c in (x.strip() for x in texto.split(",") if x.strip()):
        chave = c.lower()
        if chave in grupos:
            casos |= grupos[chave]
        elif c.upper() in c14d or c.upper() == "X1":
            casos.add(c.upper())
        else:
            casos.add(chave)
    desconhecidos = casos - set(TODOS) - set(c14d) - {"X1"}
    if desconhecidos:
        raise SystemExit(f"casos desconhecidos: {sorted(desconhecidos)} (conhecidos: {', '.join(TODOS)}, {', '.join(c14d)}, X1; grupos: "
                         f"{', '.join(grupos)})")
    return casos


# os casos da 14d (importados depois das peças acima: eles usam "import telas" no topo)
import telas_aluno as TA  # noqa: E402
import telas_master as TM  # noqa: E402
import telas_treino as TT  # noqa: E402

CASOS_14D: dict[str, Caso14d] = {**TT.CASOS, **TM.CASOS, **TA.CASOS}


# ───────────────────────── principal ─────────────────────────
def main() -> int:
    ap = argparse.ArgumentParser(description="hml-14b + hml-14d — E2E das listas paginadas (painel, Treino, master, por aluno e app) e dos campos "
                                             "que escolhem aluno (casos e uso no topo)")
    ap.add_argument("--base", required=True, help="local (http://localhost:8080) | staging | prod | <url> (ex.: http://localhost:5173)")
    ap.add_argument("--prefixo", help="o começo dos prints e o nome da saída (padrão: local — também para localhost:5173 —, staging ou prod)")
    # no notebook o Chromium do Playwright cai nas páginas longas e o Edge não (hml-11, 08/10/2026): lá, --canal msedge
    ap.add_argument("--canal", default="chromium", choices=("chromium", "msedge", "chrome"))
    ap.add_argument("--casos", default="14b,14d,X1", help=f"listas, campos e casos (padrão: todos — os da 14b: {', '.join(TODOS)}; b19 = os 4 "
                                                       f"campos; os da 14d: {', '.join(CASOS_14D)} (grupos treino, master, aluno, 14d); X1 = produção)")
    ap.add_argument("--sem-celular", action="store_true", help="pula as rodadas de 390 px (L8, B4 e as dos casos da 14d)")
    ap.add_argument("--massa", action="store_true", help="staging/local: cria a massa antes (massa.py --criar das partes dos casos) e limpa no fim, "
                                                        "mesmo se a prova falhar")
    ap.add_argument("--estado", default=str(M.ESTADO), help="o estado da massa que o massa.py grava")
    ap.add_argument("--conta-teste", default=CONTA_PADRAO, help="staging/local: a conta de teste dona da massa da 14b (chave das CONTAS da W5)")
    ap.add_argument("--contas-prod", default=",".join(CONTAS_PROD), help="produção: as contas de teste do e2e/w26/prod.py")
    a = ap.parse_args()

    base = BASES.get(a.base, a.base).rstrip("/")
    host = urllib.parse.urlparse(base).hostname or ""
    producao = host in HOSTS_DE_PRODUCAO
    if a.base == "prod" and not producao:
        raise SystemExit("--base prod precisa ser a produção")
    if producao and a.massa:
        raise SystemExit("--massa na produção: recusado (a produção é só leitura)")
    casos = interpretar_casos(a.casos, CASOS_14D)
    prefixo = a.prefixo or (a.base if a.base in BASES else "local" if host in ("localhost", "127.0.0.1") else "url")

    C, B5 = carregar("public" if producao else "staging")
    o = C.Saida(f"telas_{prefixo}", parar=False)
    R = Rodada(C=C, B5=B5, o=o, base=base, prefixo=prefixo, producao=producao, chave=a.conta_teste, sess=C.Sessoes())
    o.linha(f"base {base} · {'produção (só leitura)' if producao else 'schema staging'} · casos "
            f"{', '.join([c for c in TODOS if c in casos] + [c for c in CASOS_14D if c in casos] + (['X1'] if 'X1' in casos else []))}"
            + (" · sem celular" if a.sem_celular else ""))
    if not producao and (a.conta_teste not in B5.CONTAS or not C.eh_email_de_teste(B5.CONTAS[a.conta_teste][0])):
        raise SystemExit(f"--conta-teste {a.conta_teste}: não é conta de teste das CONTAS da W5")
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    antes = None
    with sync_playwright() as pw:

        def rodar(fn, *args) -> None:
            """Cada grupo num navegador NOVO; caiu no meio (o Chromium do notebook) → 1 nova tentativa noutro (o molde da hml-11/12)."""
            for tentativa in (1, 2):
                nav = pw.chromium.launch(channel=a.canal, args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"])
                try:
                    fn(o, nav, R, *args)
                    return
                except Exception as e:  # noqa: BLE001
                    caiu = any(x in str(e) for x in ("Target crashed", "Unable to capture screenshot", "has been closed"))
                    if not caiu or tentativa == 2:
                        o.ok(False, f"{fn.__name__} {' '.join(getattr(x, 'nome', str(x)) for x in args)}: {type(e).__name__}: {str(e)[:300]}")
                        caso = B5.ESTADO.get("caso")
                        if caso:
                            caso.diagnostico()
                        return
                    o.linha(f"   ({fn.__name__}: o navegador caiu no meio — o grupo de novo, num navegador novo)")
                finally:
                    try:
                        nav.close()
                    except Exception:  # noqa: BLE001
                        pass

        def build(o_, nav, R_) -> None:
            R_.build_ok = conferir_build(o_, nav, R_)

        try:
            rodar(build)
            if not R.build_ok:
                o.ok(False, "parei antes dos casos com conta: o build não é o esperado para esta base")
            elif producao:
                R.guarda = Guarda(("api-principal.physiqcalc.com.br", "api.physiqcalc.com.br", f"{C.PRINCIPAL_REF}.supabase.co",
                                   f"{C.TREINO_REF}.supabase.co"))
                antes = contagens_producao(R)
                for chave in (x.strip() for x in a.contas_prod.split(",") if x.strip()):
                    if chave not in B5.CONTAS or not B5.email_de_teste(B5.CONTAS[chave][0]):
                        o.ok(False, f"--contas-prod: {chave} não é conta de teste das CONTAS da W5")
                        continue
                    conta = conta_ativa_producao(R, chave)
                    if conta:
                        R.conta_ativa[chave] = conta
                    navs: set[str] = set()

                    def menu(o_, nav, R_, chave_=chave) -> None:
                        navs.update(menu_da_conta(o_, nav, R_, chave_))

                    rodar(menu)
                    for L in LISTAS:
                        if L.nome not in casos:
                            continue
                        if L.nutricao and "/painel/dietas" not in navs:
                            o.linha(f"   [prod {chave} · {L.nome}] fica de fora: a conta não tem Dietas no menu (conta sem Nutrição)")
                            continue
                        rodar(provar_lista_producao, chave, L, True)
                        if not a.sem_celular:
                            rodar(provar_lista_producao, chave, L, False)
                    if "X1" in casos:  # hml-14d: as listas novas que a conta alcança (SÓ LEITURA)
                        for L in TA.listas_x1(o, R, chave, navs) + TT.listas_x1(o, R, chave, navs):
                            rodar(provar_lista_producao, chave, L, True)
                            if not a.sem_celular:
                                rodar(provar_lista_producao, chave, L, False)
            else:
                partes = ({"14b"} if any(c in casos for c in TODOS) else set()) | {CASOS_14D[c].parte for c in casos if c in CASOS_14D}
                prontas = preparar_massa(o, R, a, partes)
                for L in LISTAS:
                    if L.nome in casos and "14b" in prontas:
                        rodar(provar_lista, L)
                        if not a.sem_celular:
                            rodar(provar_lista_celular, L)
                for F in CAMPOS:
                    if f"b19-{F.nome}" in casos and "14b" in prontas:
                        rodar(provar_campo, F, True)
                        if not a.sem_celular:
                            rodar(provar_campo, F, False)
                for codigo, K in CASOS_14D.items():  # hml-14d
                    if codigo not in casos:
                        continue
                    if K.parte not in prontas:
                        o.ok(False, f"[{codigo}] {K.titulo}: fica de fora — a parte '{K.parte}' da massa não está pronta (acima)")
                        continue
                    for desktop in K.modos:
                        if desktop or not a.sem_celular:
                            rodar(K.fn, desktop)
        finally:
            if a.massa and not producao:
                print("\n== massa (--massa): limpando pela marca (as 4 partes; o tirar_master)")
                try:
                    o.ok(M.limpar_tudo(massa_ns(a), M.PARTES, Path(a.estado)), "a massa foi limpa pela marca nos 2 bancos (nada sobrou)")
                except (Exception, SystemExit) as e:  # noqa: BLE001
                    o.ok(False, f"a limpeza da massa: {type(e).__name__}: {str(e)[:200]} — rode python3 e2e/hml14/massa.py --limpar")
            R.sess.fechar(o)
    if producao:
        depois = contagens_producao(R)
        o.linha(f"   escritas bloqueadas pelo navegador: {R.guarda.bloqueadas if R.guarda else []}")
        o.ok(antes is not None and antes == depois, f"SÓ LEITURA: as contagens do banco iguais antes e depois ({antes} → {depois})")
    graves = [x for bom, x in B5.p.itens if not bom]
    o.ok(not graves, f"sem erro de página nem falha da base ({graves[:2]})")
    pedidos = SAIDA / f"pedidos_{prefixo}.json"
    try:
        pedidos.parent.mkdir(parents=True, exist_ok=True)
        pedidos.write_text(json.dumps({nome: rede.resumo() for nome, rede in R.redes}, ensure_ascii=False, indent=1), encoding="utf-8")
        o.linha(f"   pedidos (forma e contagens, sem dado pessoal): {pedidos}")
    except OSError as e:
        o.linha(f"   pedidos: não gravou ({e})")
    if R.avisos:
        o.linha(f"\n⚠️ {len(R.avisos)} aviso(s) (não contam como falha):")
        for x in R.avisos:
            o.linha(f"   - {x}")
    C.C2.registrar_rodada(o.oks, o.oks + o.falhas)  # H-50: a rodada no e2e-rodadas.tsv (nunca derruba o teste)
    return o.fim()


if __name__ == "__main__":
    raise SystemExit(main())
