#!/usr/bin/env python3
"""Physiq hml-14b (B21 · B19, 09/10/2026) — E2E das telas: as listas do painel em páginas de 20 ("1–20 de 41", ← Anterior ·
Próxima →, a página no endereço) e o campo que escolhe aluno nos 4 diálogos (a busca vai ao banco enquanto digita).

Bases (antes de entrar com qualquer conta, a guarda do build: a faixa "Ambiente de teste" na /entrar existe no build de staging e
não existe no de produção — se não bater, nada roda com conta):
  --base local     o vite preview do build de STAGING (http://localhost:8080; outro endereço: --base http://localhost:5173)
  --base staging   https://physiqcalc-staging.vercel.app
  --base prod      https://physiqcalc.com.br — SÓ LEITURA (abaixo)
Local e staging falam com o schema staging e usam a massa do e2e/hml14/massa.py (--criar antes, --limpar depois; ou --massa aqui:
cria antes e limpa no fim, mesmo se a prova falhar). Conta: a nutri-legado (nutri.teste.claude, conta legado_nutri, faixa livre).

Listas (atributos do contrato: data-lista / data-item / data-paginacao + data-pagina, data-total, data-paginacao-rotulo,
data-pagina-anterior/-proxima): alunos · lancamentos · recibos · mensalidades · respostas · diario · receitas · lixeira (os alunos
removidos) · alimentos (a TACO, sem massa)
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
B19 — os 4 campos (data-seletor-aluno = ligar · agendamento · movimentacao · recibo; data-seletor-aluno-busca, data-opcao-aluno,
data-seletor-aluno-mais, data-seletor-aluno-cadastrar); nada é salvo (o diálogo fecha com Esc):
  B1  acha o "Zé Último" por parte do nome ("Últim"), por "ze ultimo" (sem acento), pelo telefone (só os dígitos) e pelo CPF; o pedido
      é a alunos_da_conta com o termo e p_limite 20; nenhuma opção de outra conta (o gêmeo — mesmo nome e telefone — está noutra conta
      de teste; o CPF dele não acha ninguém)
  B2  a marca acha os 41: 20 opções e "20 de 41 — refine a busca"
  B3  digitar rápido: a resposta da busca anterior (retida no navegador até a nova chegar) não aparece por cima da nova
  B4  celular (390 px): a busca pelo CPF sem rolar para o lado + print
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
import urllib.parse
from dataclasses import dataclass, field
from pathlib import Path

sys.dont_write_bytecode = True
AQUI = Path(__file__).resolve().parent
REPO = AQUI.parents[1]
sys.path.insert(0, str(AQUI))
import massa as M  # noqa: E402 — só funções; nada lê banco nem credencial ao importar

SAIDA = M.SAIDA
PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "hml14b"
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
BUSCA_GENERICA = "input[type='search']"
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
CHAVES_PAGINA = ("p_limite", "p_limit", "limite", "p_por_pagina", "por_pagina", "p_offset", "offset", "p_deslocamento", "pagina", "p_pagina")


@dataclass(frozen=True)
class Lista:
    nome: str                                # data-lista / data-paginacao (o contrato)
    rota: str                                # a tela, já na aba
    fontes: tuple[tuple[str, str], ...]      # (tabela | rpc | funcao, nome) de onde vem a página — a 1ª é a que o agente fez
    tipo: str | None                         # o rótulo da massa nas linhas ("aluno #07"); None = sem massa (Alimentos)
    busca: tuple[str, ...] = ()              # o campo de busca (o 1º visível); () = sem busca de texto (o Diário filtra pelo aluno)
    abrir: tuple[str, str, str] | None = None  # (dentro da linha, "url:<trecho>" | "dialogo", "voltar" | "esc"); None = sair e Voltar
    nutricao: bool = False                   # só numa conta com Nutrição (Dietas)
    nomes: tuple[str, ...] = ()              # outros nomes aceitos no data-lista (a Lixeira: lixeira-paciente)
    nome_item: str | None = None             # onde está o nome do item (a busca dos Alimentos, sem massa)
    fundo: str | None = None                 # a contagem do "fundo" no estado da massa

    @property
    def candidatos(self) -> tuple[str, ...]:
        return self.nomes or (self.nome,)


@dataclass(frozen=True)
class Campo:
    nome: str    # data-seletor-aluno
    rota: str
    abrir: str   # o botão que abre o diálogo
    modal: str   # o diálogo


LISTAS = (
    Lista("alunos", "/painel/alunos", (("rpc", "alunos_da_conta"),), "aluno", ("[data-busca-alunos]", BUSCA_GENERICA),
          ("[data-abrir-aluno]", "url:/painel/alunos/", "voltar"), fundo="alunos_fundo"),
    Lista("lancamentos", "/painel/financeiro?aba=lancamentos", (("rpc", "financeiro_lancamentos"), ("tabela", "transacoes")), "lanc",
          ("[data-busca-transacoes]", BUSCA_GENERICA), ("[data-btn-editar-transacao]", "dialogo", "esc"), fundo="lancamentos_fundo"),
    Lista("recibos", "/painel/financeiro?aba=recibos", (("rpc", "financeiro_recibos"), ("tabela", "recibos")), "recibo",
          ("[data-busca-recibos]", BUSCA_GENERICA), ("[data-btn-ver-recibo]", "dialogo", "esc"), fundo="recibos_fundo"),
    Lista("mensalidades", "/painel/financeiro?aba=mensalidades", (("funcao", "pagamentos-aluno"),), "aluno",
          ("[data-busca-mensalidades]", "[data-aba-financeiro-conteudo='mensalidades'] input[type='search']", BUSCA_GENERICA),
          ("a[href$='/financeiro']", "url:/painel/alunos/", "voltar"), fundo="mensalidades_fundo"),
    Lista("respostas", "/painel/pre-consulta?aba=respostas", (("rpc", "respostas_da_conta"), ("tabela", "respostas_preconsulta")), "resposta",
          ("[data-busca-respostas]", BUSCA_GENERICA), ("[data-btn-ligar-resposta]", "dialogo", "esc"), fundo="respostas_fundo"),
    Lista("diario", "/painel/dietas?aba=diario", (("tabela", "diario_alimentar"), ("rpc", "diario_da_conta")), "diario", (),
          ("[data-registro-nome]", "url:/painel/alunos/", "voltar"), nutricao=True, fundo="diario_fundo"),
    Lista("receitas", "/painel/dietas?aba=receitas", (("rpc", "receitas_da_nutricionista"), ("tabela", "receitas")), "receita",
          ("[data-campo-busca-receitas]", BUSCA_GENERICA), ("[data-btn-ver-receita]", "dialogo", "esc"), nutricao=True, fundo="receitas_fundo"),
    Lista("lixeira", "/painel/lixeira?tipo=paciente", (("rpc", "lixeira_da_conta"),), "removido", ("[data-campo-busca-lixeira]", BUSCA_GENERICA),
          None, nomes=("lixeira-paciente", "lixeira"), fundo="removidos_fundo"),
    Lista("alimentos", "/painel/dietas?aba=alimentos", (("tabela", "alimentos"), ("rpc", "alimentos_da_conta")), None,
          ("[data-busca-alimentos]", BUSCA_GENERICA), None, nutricao=True, nome_item="[data-alimento-nome]"),
)
CAMPOS = (
    Campo("movimentacao", "/painel/financeiro?aba=lancamentos", "[data-nova-movimentacao]", "[data-modal-movimentacao]"),
    Campo("recibo", "/painel/financeiro?aba=recibos", "[data-btn-novo-recibo]", "[data-modal-recibo]"),
    Campo("agendamento", "/painel/agenda", "[data-btn-novo-agendamento]", "[data-modal-agendamento]"),
    Campo("ligar", "/painel/pre-consulta?aba=respostas", "[data-btn-ligar-resposta]", "[data-modal-ligar]"),
)
TODOS = tuple(L.nome for L in LISTAS) + tuple(f"b19-{F.nome}" for F in CAMPOS)
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
      nomesItens: seletorNome ? itens.map((e) => ((e.querySelector(seletorNome) || {}).innerText || '').trim()) : [],
      url: location.pathname + location.search,
      largura: document.documentElement.scrollWidth,
      direita: pag ? Math.round(pag.getBoundingClientRect().right) : null,
    };
  }
  return { nome: null, temPaginacao: false, temLista: false, pagina: null, total: null, rotulo: null, anterior: 'ausente',
           proxima: 'ausente', textos: [], nomesItens: [], url: location.pathname + location.search,
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
    if not isinstance(total, int) or isinstance(total, bool):
        total = None
    for k in ("itens", "ids", "items", "alunos", "lista", "linhas", "registros", "dados", "data"):
        if isinstance(dados.get(k), list):
            return dados[k], total
    return None, total


def analisar(ev: dict, dados) -> dict:
    """Do pedido: limite/deslocamento (ou a página), o termo da busca; da resposta: quantas linhas vieram e o total."""
    out: dict = {"n": None, "total": None, "limite": None, "deslocamento": None, "pagina": None, "q": None}
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
    out["limite"] = primeiro_int(corpo, ("p_limite", "p_limit", "limite", "p_por_pagina", "por_pagina"))
    out["deslocamento"] = primeiro_int(corpo, ("p_offset", "offset", "p_deslocamento"))
    out["pagina"] = primeiro_int(corpo, ("pagina", "p_pagina"))
    out["q"] = termo_do_pedido(corpo)
    lista, total = lista_e_total(dados)
    out["n"] = len(lista) if lista is not None else None
    out["total"] = total
    return out


class Rede:
    """Os pedidos de dados das listas e do seletor: a fonte, limit/offset (ou p_limite/p_offset/pagina), o status, o content-range e
    QUANTAS linhas vieram com o total. Do conteúdo, só a contagem: nenhum nome, e-mail ou id de pessoa vai para a saída."""

    def __init__(self, caso, fontes) -> None:
        self.fontes = set(fontes)
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
                  "status": r.status, "query": query, "corpo": corpo, "content_range": (r.headers or {}).get("content-range")}
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
                          "corpo": {k: corpo[k] for k in ("acao", *CHAVES_PAGINA) if k in corpo},
                          "q_tamanho": len(e["q"]) if e.get("q") else 0, "content_range": e["content_range"], "n": e["n"], "total": e["total"]})
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
        acao = (e.get("corpo") or {}).get("acao")
        pedido = f"função {e['nome']}{' ' + acao if acao else ''} pagina={e['pagina']}"
        resposta = f"total {e['total']}"
    return f"{pedido} → {e['n']} linha(s), {resposta} (HTTP {e['status']})"


def pedido_da_pagina(rede: Rede, L: Lista, desde: int, pagina: int) -> dict | None:
    """O último pedido da página `pagina` a uma das fontes da lista, a partir do evento `desde`."""
    achados = []
    for e in rede.eventos[desde:]:
        if e["status"] >= 300 or e["metodo"] == "HEAD" or (e["tipo"], e["nome"]) not in L.fontes:
            continue
        if e["tipo"] == "funcao":
            if (e.get("corpo") or {}).get("acao") in (None, "prof_resumo") and e["pagina"] == pagina:
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
    return [e for e in rede.eventos[desde:] if (e["tipo"], e["nome"]) in L.fontes and (e["n"] or 0) > POR_PAGINA]


# ───────────────────────── a tela ─────────────────────────
def rotulo(pagina: int, total: int) -> str:
    """O rótulo de src/lib/paginacao.ts: "1–20 de 41" (meia-risca)."""
    if total <= 0:
        return "0 de 0"
    de = (pagina - 1) * POR_PAGINA
    return f"{de + 1}–{min(de + POR_PAGINA, total)} de {total}"


def pagina_da_url(url: str) -> int | None:
    """A página no endereço (?pagina= ou ?pagina_<lista>=); a 1ª não aparece (None)."""
    for k, v in urllib.parse.parse_qs(urllib.parse.urlparse(url or "").query).items():
        if k == "pagina" or k.startswith("pagina_"):
            try:
                return int(v[0])
            except (ValueError, IndexError):
                return -1
    return None


def na_pagina(url: str, pagina: int) -> bool:
    p = pagina_da_url(url)
    return p in (None, 1) if pagina == 1 else p == pagina


def token(texto: str, tipo: str | None) -> str | None:
    """O número da massa na linha ("aluno #07" → "07")."""
    if not tipo:
        return None
    m = re.search(rf"(?i)\b{re.escape(tipo)}\s+#(\d{{2}})\b", texto or "")
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
        return {"nome": None, "temPaginacao": False, "textos": [], "nomesItens": [], "url": caso.caminho(), "pagina": None, "total": None,
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
        if volta == "voltar":
            caso.pg.go_back(wait_until="domcontentloaded")
            como += " · Voltar do navegador"
        else:
            como += " · Esc" if fechar_dialogo(caso) else " · o diálogo NÃO fechou com Esc"
    else:
        caso.ir("/painel")
        caso.esperar(lambda: caso.tem("[data-menu-lateral]"), 30)
        caso.pg.go_back(wait_until="domcontentloaded")
        como = "a lista não abre item: saiu para o Dashboard e Voltar do navegador"
    velhas = chaves(antes, L)
    ok, depois = esperar_lista(caso, L, lambda e: e["pagina"] == 2 and chaves(e, L) == velhas, 60)
    return ok and na_pagina(depois.get("url") or "", 2), f"{como}; depois: página {depois.get('pagina')}, {depois.get('url')}"


# ───────────────────────── a rodada (contas, sessões, guarda) ─────────────────────────
class Guarda:
    """Bloqueia no navegador toda escrita que as telas tentarem — o molde do e2e/w26/prod.py:Guarda (tabela, RPC que grava, Storage)
    — e, na função pagamentos-aluno, tudo o que não for a leitura prof_resumo."""

    ESCRITA_RPC = re.compile(r"/rest/v1/rpc/(lixeira_restaurar|lixeira_apagar|aluno_remover|marcar_aviso|marcar|salvar|criar|"
                             r"registrar|aceitar|excluir|apagar|atualizar|enviar)")
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
                escrita = (corpo_json(request.post_data) or {}).get("acao") != "prof_resumo"
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
        cont = (self.massa or {}).get("contagens") or {}
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
        R.entrar(caso, L.rota)
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
        else:
            o.ok(N > 3 * POR_PAGINA, f"{t} L1 o total da lista: {N} (a TACO + os próprios)")
        o.ok(st["rotulo"] == rotulo(1, N) and len(st["textos"]) == min(POR_PAGINA, N) and st["pagina"] == 1 and na_pagina(st["url"], 1),
             f"{t} L1 sem filtro: {len(st['textos'])} linhas e '{st['rotulo']}' (esperado '{rotulo(1, N)}'), página {st['pagina']}, {st['url']}")
        ev = esperar_pedido(caso, rede, L, 0, 1)
        o.ok(pedido_ok(ev, N, min(POR_PAGINA, N)), f"{t} L1 o pedido traz só 20: {descr(ev) or nao_veio(rede, L, 0)}")
        avisar_grandes(R, t, rede, L, 0)
        # L2 — Próxima
        desde = len(rede.eventos)
        ok, st2 = mudar_pagina(caso, L, nome, "proxima", 2, st)
        exp2 = min(POR_PAGINA, N - POR_PAGINA)
        o.ok(ok and st2["rotulo"] == rotulo(2, N) and len(st2["textos"]) == exp2 and na_pagina(st2["url"], 2),
             f"{t} L2 Próxima → '{st2.get('rotulo')}', {len(st2.get('textos') or [])} linhas, {st2.get('url')}")
        ev = esperar_pedido(caso, rede, L, desde, 2)
        o.ok(pedido_ok(ev, N, exp2), f"{t} L2 o pedido da página 2: {descr(ev) or nao_veio(rede, L, desde)}")
        if not ok:
            caso.diagnostico()
            return
        # L3 — abrir e voltar; recarregar; Anterior
        ok3, como = abrir_e_voltar(caso, L, nome, st2)
        o.ok(ok3, f"{t} L3 abrir um item e voltar mantém ?pagina=2 e as mesmas linhas ({como})")
        caso.pg.reload(wait_until="domcontentloaded")
        ok, st3 = esperar_lista(caso, L, lambda e: e["pagina"] == 2 and chaves(e, L) == chaves(st2, L), 60)
        o.ok(ok and na_pagina(st3["url"], 2), f"{t} L3 recarregar a tela → continua na página 2 com as mesmas linhas ({st3.get('url')})")
        ok, st1 = mudar_pagina(caso, L, nome, "anterior", 1, st3)
        o.ok(ok and na_pagina(st1["url"], 1) and st1["rotulo"] == rotulo(1, N), f"{t} L3 Anterior → página 1, o endereço sem ?pagina ({st1.get('url')})")
        if L.tipo is None:
            provar_sem_massa(o, caso, rede, R, L, nome, N, st1)
        else:
            provar_massa(o, caso, rede, R, L, nome, N, st1)
    finally:
        caso.fim()


def provar_massa(o, caso, rede: Rede, R: Rodada, L: Lista, nome: str, N: int, st1: dict) -> None:
    t = f"[{L.nome}]"
    busca = campo_busca(caso, L) if L.busca else None
    # L4 — a massa: a busca pela marca (o Diário: a lista dos 7 dias)
    if L.busca and not o.ok(busca is not None, f"{t} L4 o campo de busca da lista ({' | '.join(L.busca)})"):
        caso.diagnostico()
        return
    if busca:
        desde = len(rede.eventos)
        busca.fill(R.marca)
        ok, sm = esperar_lista(caso, L, lambda e: e["total"] == MASSA and len(e["textos"]) == POR_PAGINA
                               and all(marca_em(x, R.marca) for x in e["textos"]), 30)
        o.ok(ok and sm["rotulo"] == rotulo(1, MASSA) and sm["pagina"] == 1,
             f"{t} L4 a busca pela marca '{R.marca}' → '{sm.get('rotulo')}', {len(sm.get('textos') or [])} linhas da massa (esperado '{rotulo(1, MASSA)}')")
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
        o.ok(ok and prox["rotulo"] == rotulo(P, Nm) and len(prox["textos"]) == exp and na_pagina(prox["url"], P),
             f"{t} L5 página {P}: '{prox.get('rotulo')}' (esperado '{rotulo(P, Nm)}'), {len(prox.get('textos') or [])} linha(s), {prox.get('url')}")
        ev = esperar_pedido(caso, rede, L, desde, P)
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
    o.ok(atual.get("pagina") == 1 and na_pagina(atual.get("url") or "", 1), f"{t} L6 de volta à página 1 pelo Anterior ({atual.get('url')})")
    if busca:
        termo = f"{L.tipo} #{alvo}"
        busca.fill(termo)
        ok, sb = esperar_lista(caso, L, lambda e: alvo in tokens(e, L.tipo) and (e["total"] or 0) < MASSA, 30)
        o.ok(ok and sb["pagina"] == 1 and na_pagina(sb["url"], 1),
             f"{t} L6 estando na página 1, a busca '{termo}' (o item da página {ultima}) acha o item ('{sb.get('rotulo')}') e fica na página 1")
        # L7 — na página 2, mudar a busca volta à 1; limpar a busca
        busca.fill(R.marca)
        ok, s1 = esperar_lista(caso, L, lambda e: e["total"] == MASSA and e["pagina"] == 1 and len(e["textos"]) == POR_PAGINA, 30)
        ok2, s2 = mudar_pagina(caso, L, nome, "proxima", 2, s1) if ok else (False, s1)
        busca.fill(termo)
        ok3, s3 = esperar_lista(caso, L, lambda e: alvo in tokens(e, L.tipo) and (e["total"] or 0) < MASSA, 30)
        o.ok(ok and ok2 and ok3 and s3["pagina"] == 1 and na_pagina(s3["url"], 1),
             f"{t} L7 na página 2, mudar a busca volta à 1 (antes {s2.get('url')}; depois {s3.get('url')}, '{s3.get('rotulo')}')")
        busca.fill("")
        ok4, s4 = esperar_lista(caso, L, lambda e: e["total"] == N and e["pagina"] == 1, 30)
        o.ok(ok4 and s4["rotulo"] == rotulo(1, N), f"{t} L7 limpar a busca → a lista inteira de novo, na página 1 ('{s4.get('rotulo')}')")
        return
    # o Diário: o filtro Aluno (o registro #NN é do aluno #NN)
    paciente = (R.massa or {}).get("alunos", {}).get(alvo)
    if not o.ok(bool(paciente), f"{t} L6 o aluno do registro #{alvo} no estado da massa"):
        return
    via = filtrar_aluno_diario(caso, R, L, paciente)
    ok, sb = esperar_lista(caso, L, lambda e: alvo in tokens(e, L.tipo) and (e["total"] or 0) < N, 30)
    o.ok(via == "tela", f"{t} L6 o filtro Aluno da tela oferece o aluno do registro da página {ultima} estando na página 1 "
                        f"({'sim' if via == 'tela' else 'não: ' + via + ' — filtrado pelo endereço ?aluno='})")
    o.ok(ok and sb["pagina"] == 1 and na_pagina(sb["url"], 1),
         f"{t} L6 filtrado pelo aluno do registro #{alvo} (página {ultima}): ele aparece e a página é a 1 ('{sb.get('rotulo')}', {sb.get('url')})")
    if via != "tela":
        return
    sel = caso.pg.locator("[data-campo-aluno]").first
    sel.select_option("")
    ok, s1 = esperar_lista(caso, L, lambda e: e["total"] == N and e["pagina"] == 1, 30)
    ok2, s2 = mudar_pagina(caso, L, nome, "proxima", 2, s1) if ok else (False, s1)
    sel.select_option(paciente)
    ok3, s3 = esperar_lista(caso, L, lambda e: alvo in tokens(e, L.tipo) and (e["total"] or 0) < N, 30)
    o.ok(ok and ok2 and ok3 and s3["pagina"] == 1 and na_pagina(s3["url"], 1),
         f"{t} L7 na página 2, mudar o filtro Aluno volta à 1 (antes {s2.get('url')}; depois {s3.get('url')})")
    sel.select_option("")
    ok4, s4 = esperar_lista(caso, L, lambda e: e["total"] == N and e["pagina"] == 1, 30)
    o.ok(ok4, f"{t} L7 tirar o filtro → a lista inteira de novo, na página 1 ('{s4.get('rotulo')}')")


def provar_sem_massa(o, caso, rede: Rede, R: Rodada, L: Lista, nome: str, N: int, st1: dict) -> None:
    """Os Alimentos (a TACO, sem massa): as páginas 1 → 3, a busca pelo 1º da página 3 estando na 1 e o volta à 1."""
    t = f"[{L.nome}]"
    o.linha(f"   print: {caso.print(f'{L.nome}_pagina1')}")
    atual = st1
    for P in (2, 3):
        desde = len(rede.eventos)
        ok, atual = mudar_pagina(caso, L, nome, "proxima", P, atual)
        o.ok(ok and atual["rotulo"] == rotulo(P, N) and len(atual["textos"]) == POR_PAGINA and na_pagina(atual["url"], P),
             f"{t} L5 página {P}: '{atual.get('rotulo')}', {len(atual.get('textos') or [])} linhas, {atual.get('url')}")
        ev = esperar_pedido(caso, rede, L, desde, P)
        o.ok(pedido_ok(ev, N, POR_PAGINA), f"{t} L5 o pedido da página {P}: {descr(ev) or nao_veio(rede, L, desde)}")
        if not ok:
            caso.diagnostico()
            return
    o.linha(f"   print: {caso.print(f'{L.nome}_pagina3')}")
    alvo = next((x for x in atual.get("nomesItens") or [] if x), "")
    for P in (2, 1):
        ok, atual = mudar_pagina(caso, L, nome, "anterior", P, atual)
    busca = campo_busca(caso, L)
    if not o.ok(busca is not None and alvo and atual.get("pagina") == 1, f"{t} L6 na página 1, o campo de busca e o nome do 1º item da página 3"):
        return
    busca.fill(alvo)
    ok, sb = esperar_lista(caso, L, lambda e: alvo in (e.get("nomesItens") or []) and (e["total"] or 0) < N, 30)
    o.ok(ok and sb["pagina"] == 1 and na_pagina(sb["url"], 1),
         f"{t} L6 estando na página 1, a busca pelo 1º item da página 3 ({alvo!r}) acha o item ('{sb.get('rotulo')}') e fica na página 1")
    busca.fill("")
    ok, s1 = esperar_lista(caso, L, lambda e: e["total"] == N and e["pagina"] == 1, 30)
    ok2, s2 = mudar_pagina(caso, L, nome, "proxima", 2, s1) if ok else (False, s1)
    busca.fill(alvo)
    ok3, s3 = esperar_lista(caso, L, lambda e: alvo in (e.get("nomesItens") or []) and (e["total"] or 0) < N, 30)
    o.ok(ok and ok2 and ok3 and s3["pagina"] == 1 and na_pagina(s3["url"], 1),
         f"{t} L7 na página 2, mudar a busca volta à 1 (antes {s2.get('url')}; depois {s3.get('url')})")
    busca.fill("")


def provar_lista_celular(o, nav, R: Rodada, L: Lista) -> None:
    t = f"[{L.nome} 390px]"
    caso, _ = R.novo_caso(nav, f"lista_{L.nome}_390px", desktop=False, fontes=L.fontes)
    try:
        R.entrar(caso, L.rota)
        ok, st = esperar_lista(caso, L, lambda e: e["temPaginacao"] and e["textos"], 90)
        if not o.ok(ok, f"{t} a lista abre no celular"):
            caso.diagnostico()
            return
        busca = campo_busca(caso, L) if (L.tipo and L.busca) else None
        if busca:
            busca.fill(R.marca)
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
                o.ok(ok and st2["rotulo"] == rotulo(2, N) and na_pagina(st2["url"], 2), f"{t} Próxima → '{st2.get('rotulo')}' e ?pagina=2 (só leitura)")
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


# ───────────────────────── staging: a massa ─────────────────────────
def preparar_massa(o, R: Rodada, a) -> bool:
    if a.massa:
        print("\n== massa (--massa): criando no staging")
        ctx = M.resolver(R.B5.CONTAS[R.chave][0])
        estado = M.criar(ctx, arquivo=Path(a.estado))
    else:
        estado = M.ler_estado(a.estado)
    if not o.ok(bool(estado), f"o estado da massa ({a.estado}) — sem ele: python3 e2e/hml14/massa.py --criar (ou --massa aqui)"):
        return False
    if not o.ok(estado.get("schema") == "staging" and estado.get("login") == R.B5.CONTAS[R.chave][0].lower(),
                f"a massa é do schema staging e da conta de teste {R.chave} ({estado.get('login')})"):
        return False
    try:
        cont = M.contar(M.contexto_do_estado(estado), estado["marca"])
        R.conta_ids = {x["id"] for x in R.C.ler(R.C.PRINCIPAL_REF, f"""select id::text as id from staging.pacientes
                                                                       where conta_id = {R.C.txt(estado['conta_id'])}::uuid and deleted_at is null""")}
    except Exception as e:  # noqa: BLE001
        o.ok(False, f"a massa no staging (só leitura): {type(e).__name__}: {str(e)[:200]}")
        return False
    faltas = M.massa_completa(cont, bool(estado.get("gemeo")))
    if not estado.get("ze"):
        faltas.append("Zé Último")
    estado["contagens"] = cont
    R.massa = estado
    R.conta_ativa[R.chave] = estado["conta_id"]
    return o.ok(not faltas, f"a massa '{estado['marca']}' está inteira no staging (conta {estado.get('conta_nome')!r}; "
                            f"fundo: {', '.join(f'{k} {cont.get(k)}' for k in ('alunos_fundo', 'lancamentos_fundo', 'recibos_fundo', 'respostas_fundo', 'diario_fundo', 'receitas_fundo', 'removidos_fundo'))})"
                            + (f" — falta: {faltas}" if faltas else ""))


# ───────────────────────── principal ─────────────────────────
def main() -> int:
    ap = argparse.ArgumentParser(description="hml-14b — E2E das listas paginadas do painel e do campo que escolhe aluno (casos e uso no topo)")
    ap.add_argument("--base", required=True, help="local (http://localhost:8080) | staging | prod | <url> (ex.: http://localhost:5173)")
    ap.add_argument("--prefixo", help="o começo dos prints e o nome da saída (padrão: local — também para localhost:5173 —, staging ou prod)")
    # no notebook o Chromium do Playwright cai nas páginas longas e o Edge não (hml-11, 08/10/2026): lá, --canal msedge
    ap.add_argument("--canal", default="chromium", choices=("chromium", "msedge", "chrome"))
    ap.add_argument("--casos", default=",".join(TODOS), help=f"listas e campos (padrão: todos — {', '.join(TODOS)}; 'b19' = os 4 campos)")
    ap.add_argument("--sem-celular", action="store_true", help="pula as rodadas de 390 px (L8 e B4)")
    ap.add_argument("--massa", action="store_true", help="staging/local: cria a massa antes (massa.py --criar) e limpa no fim, mesmo se a prova falhar")
    ap.add_argument("--estado", default=str(M.ESTADO), help="o estado da massa que o massa.py grava")
    ap.add_argument("--conta-teste", default=CONTA_PADRAO, help="staging/local: a conta de teste dona da massa (chave das CONTAS da W5)")
    ap.add_argument("--contas-prod", default=",".join(CONTAS_PROD), help="produção: as contas de teste do e2e/w26/prod.py")
    a = ap.parse_args()

    base = BASES.get(a.base, a.base).rstrip("/")
    host = urllib.parse.urlparse(base).hostname or ""
    producao = host in HOSTS_DE_PRODUCAO
    if a.base == "prod" and not producao:
        raise SystemExit("--base prod precisa ser a produção")
    if producao and a.massa:
        raise SystemExit("--massa na produção: recusado (a produção é só leitura)")
    casos: set[str] = set()
    for c in (x.strip().lower() for x in a.casos.split(",") if x.strip()):
        casos |= {f"b19-{F.nome}" for F in CAMPOS} if c == "b19" else {c}
    desconhecidos = casos - set(TODOS)
    if desconhecidos:
        raise SystemExit(f"casos desconhecidos: {sorted(desconhecidos)} (conhecidos: {', '.join(TODOS)}, b19)")
    prefixo = a.prefixo or (a.base if a.base in BASES else "local" if host in ("localhost", "127.0.0.1") else "url")

    C, B5 = carregar("public" if producao else "staging")
    o = C.Saida(f"telas_{prefixo}", parar=False)
    R = Rodada(C=C, B5=B5, o=o, base=base, prefixo=prefixo, producao=producao, chave=a.conta_teste, sess=C.Sessoes())
    o.linha(f"base {base} · {'produção (só leitura)' if producao else 'schema staging'} · casos {', '.join(c for c in TODOS if c in casos)}"
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
            elif preparar_massa(o, R, a):
                for L in LISTAS:
                    if L.nome in casos:
                        rodar(provar_lista, L)
                        if not a.sem_celular:
                            rodar(provar_lista_celular, L)
                for F in CAMPOS:
                    if f"b19-{F.nome}" in casos:
                        rodar(provar_campo, F, True)
                        if not a.sem_celular:
                            rodar(provar_campo, F, False)
        finally:
            if a.massa and not producao:
                print("\n== massa (--massa): limpando pela marca")
                try:
                    estado = M.ler_estado(a.estado)
                    ctx = M.contexto_do_estado(estado) if estado else M.resolver(B5.CONTAS[R.chave][0])
                    o.ok(M.limpar(ctx, None), "a massa foi limpa pela marca (nada sobrou)")
                except Exception as e:  # noqa: BLE001
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
