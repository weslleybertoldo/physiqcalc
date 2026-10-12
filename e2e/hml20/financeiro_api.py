"""Physiq hml-20d (H-42 · jeito 2, etapa 2, parte 4, 12/10/2026) — os casos de SERVIDOR do Financeiro (`api.py --area financeiro`): a ação
`ler` da financeiro com as 12 consultas da 20d (o Painel › Financeiro ×6 abas, o Financeiro do aluno, a parte do Financeiro do Dashboard e o
gate do app do aluno).

Contas (staging, só de TESTE — financeiro.py): P = w5p-personal (a dona da conta da w5p-aluna: tudo do painel; a massa); a w5p-aluna (o
fin_do_aluno só com as dela); N1 = w13-dono (OUTRA conta). No máximo 6 logins na etapa 2 (o registro: hml20/agente/logins_etapa2_20d.txt).
A massa (decisão J): 1 movimentação e 1 recibo da aluna, 1 categoria e 1 modelo, pelas ações da financeiro (como a personal), só no staging,
com a marca "hml20 e2e <rodada>"; o fim (ou o --limpar) apaga pelos ids e confere por SQL só leitura (só contagem).
  P   cada consulta com a conta certa = o que a LIB DE ANTES lia (o SQL FIXO de financeiro.SQL_DA_LIB, escrito a partir do ed0d72e — a
      tabela/RPC, o filtro, o dono, o recorte da conta ativa, a ordem e a página da lib, as colunas do select de hoje e os embutidos dela),
      rodado COMO A PESSOA (o papel authenticated + o sub): as listas iguais em JSON canônico, na ordem da lib (os modelos, que a lib não
      ordenava, como conjunto); os totais (count exato) = o count; as RPCs = a MESMA RPC com os args da lib; o fin_do_aluno como a ALUNA
  N1  outra conta (w13-dono) pede as consultas com a aluna, a conta da personal e os ids da massa → as listas vazias / total 0, os totais do
      aluno zerados, os { ok: false } das 3 RPCs da conta como o erro do ITEM (sem_acesso), as "minhas" dela mesma — NUNCA uma linha da
      personal ou da aluna
  N2  sem login → 401 · N3 q desconhecida → o item consulta_invalida (os outros respondem)
  N4  nutricionista_id/user_id/id de OUTRA pessoa no corpo das "minhas" → ignorados (o dono é quem chama: = o SQL da lib como quem chama)
  N5  param/coluna fora da lista (select, colunas, order, or, p_conta, paciente_id) → ignorados (a resposta é a mesma)
  N6  x-schema inválido → 400 schema_invalido · N7 origem fora da lista → o CORS padrão
  N8  NÃO se aplica (decisão H): nenhuma leitura do Financeiro assina URL — não há caminho para pedir
  N9  lote de 17 → 400 lote_grande (16 → 200)
--so-leitura (o smoke da sessão principal logo depois de publicar, 1 login por base): o CORS, o 401, o 400 de schema, a q desconhecida →
consulta_invalida, CADA consulta da 20d que tem param obrigatório, sem ele → dados_invalidos (o catálogo da 20d no ar, sem ir ao banco) e
17 itens → lote_grande. Nada grava; nada lê dado.
"""
from __future__ import annotations

import datetime as dt
import json
import subprocess
from pathlib import Path

import _base as B
import financeiro as F

C = B.C
CASOS = ("P", "N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8", "N9")
FALSO = "00000000-0000-4000-8000-0000000000aa"
OUTRO = "44444444-4444-4444-8444-444444444444"


def hoje_sp() -> str:
    return (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).date().isoformat()


def inicio_do_mes(dia: str) -> str:
    return f"{dia[:8]}01"


def fim_do_mes(dia: str) -> str:
    d = dt.date.fromisoformat(f"{dia[:8]}01")
    prox = (d.replace(day=28) + dt.timedelta(days=4)).replace(day=1)
    return (prox - dt.timedelta(days=1)).isoformat()


def desde_30(dia: str) -> str:
    return (dt.date.fromisoformat(dia) - dt.timedelta(days=29)).isoformat()


def canonico(v: object) -> str:
    return json.dumps(v, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def jsonb(v: object) -> object:
    if isinstance(v, str):
        try:
            return json.loads(v)
        except json.JSONDecodeError:
            return v
    return v


def ids_de(valor: object) -> set[str]:
    achados: set[str] = set()

    def andar(x: object) -> None:
        if isinstance(x, dict):
            for v in x.values():
                andar(v)
        elif isinstance(x, list):
            for v in x:
                andar(v)
        elif C.eh_uuid(x):
            achados.add(str(x))
    andar(valor)
    return achados


# ───────────────────────── os pedidos (puros: o --seco confere todos contra o servidor) ─────────────────────────
def itens_do_p(pac: str, conta: str, dia: str) -> list[dict]:
    """Um item de CADA consulta da 20d, com os params que a tela manda (o --seco passa todos no lerPedidoDeLeitura do servidor)."""
    i = B.item
    de, ini, fim = desde_30(dia), inicio_do_mes(dia), fim_do_mes(dia)
    return [
        i("fin_categorias"), i("fin_modelos_recibo"), i("fin_ultimo_recibo"), i("fin_profissional"),
        i("fin_resumo_periodo", conta=conta, de=de, ate=dia, filtros={"resumo": True}), i("fin_resumo_periodo", conta=conta, de=ini, ate=fim, filtros={}),
        i("fin_lancamentos", conta=conta, de=ini, ate=fim, filtros={}, offset=0, limite=20), i("fin_recibos", conta=conta, filtros={}, offset=0, limite=20),
        i("fin_recibos", conta=conta, filtros={"de": ini, "ate": fim}, offset=0, limite=0), i("fin_cobrancas_resumo", conta=conta, de=ini, ate=fim),
        i("fin_transacoes_do_aluno", aluno=pac, pagina=1), i("fin_recibos_do_aluno", aluno=pac, pagina=1), i("fin_totais_do_aluno", aluno=pac),
        i("fin_do_aluno"),
    ]


def pedidos_financeiro(pac: str, conta: str, dia: str) -> list[dict]:
    """Os corpos `ler` da rodada (P e os N): o --seco passa cada um pelo lerPedidoDeLeitura do servidor."""
    p = itens_do_p(pac, conta, dia)
    i = B.item
    return [
        {"acao": "ler", "itens": p},
        # N3: a q desconhecida no meio
        {"acao": "ler", "itens": [i("fin_categorias"), i("financeiro_inteiro"), i("aluno_dieta", dia=dia)]},
        # N4/N5: o dono, as colunas, a ordem, o .or(), o p_conta e o paciente no corpo — tudo cai
        {"acao": "ler", "itens": [i("fin_categorias", nutricionista_id=OUTRO, user_id=OUTRO, id=OUTRO),
                                  i("fin_ultimo_recibo", nutricionista_id=OUTRO, select="*", order="numero"),
                                  i("fin_cobrancas_resumo", conta=conta, de=inicio_do_mes(dia), ate=fim_do_mes(dia), nutricionista_id=OUTRO,
                                    **{"or": "id.not.is.null"}, colunas="*"),
                                  i("fin_transacoes_do_aluno", aluno=pac, pagina=1, paciente_id=OUTRO, select="*"),
                                  i("fin_recibos", conta=conta, filtros={"q": "x", "nutricionista_id": OUTRO}, offset=0, limite=20, p_conta=OUTRO)]},
        # o param fora da forma (uuid ruim, data ruim, página 0, limite 101, offset −1, texto de 501, o "resumo" em texto, a data do recibo com hora)
        {"acao": "ler", "itens": [i("fin_transacoes_do_aluno", aluno="abc", pagina=1), i("fin_resumo_periodo", conta=conta, de="12/10/2026", ate=dia),
                                  i("fin_recibos_do_aluno", aluno=pac, pagina=0), i("fin_lancamentos", conta=conta, de=dia, ate=dia, offset=0, limite=101),
                                  i("fin_recibos", conta=conta, offset=-1, limite=20), i("fin_lancamentos", conta=conta, de=dia, ate=dia, offset=0, limite=20,
                                                                                         filtros={"q": "x" * 501}),
                                  i("fin_resumo_periodo", conta=conta, de=dia, ate=dia, filtros={"resumo": "sim"}),
                                  i("fin_recibos", conta=conta, filtros={"de": f"{dia}T00:00"}, offset=0, limite=0)]},
        # N9: 17 itens
        {"acao": "ler", "itens": [i("fin_categorias")] * 17},
    ]


# ───────────────────────── o --seco ─────────────────────────
def seco(o) -> None:  # noqa: PLR0915
    pac, conta, dia = "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "2026-10-12"
    r = F.regras_leitura_fin(pedidos_financeiro(pac, conta, dia))
    consultas = r["consultas"]
    o.ok(sorted(consultas) == sorted(F.CONSULTAS_20D) and len(F.CONSULTAS_20D) == 12,
         f"o catálogo do servidor (lido do TS) tem as 12 consultas da 20d ({len(consultas)})")
    o.ok(sorted(q for q, c in consultas.items() if c["dono"]) == sorted(F.MINHAS)
         and consultas["fin_profissional"]["dono"] == "id" and all(consultas[q]["dono"] == "nutricionista_id" for q in F.MINHAS if q != "fin_profissional"),
         "'minha' só as 4 que a lib filtrava pelo id de quem está logado (categorias, modelos, último nº, nome); o resto o RLS/a RPC decide")
    o.ok({c["rpc"] for c in consultas.values() if c["rpc"]} == F.RPCS_DA_AREA,
         "a guarda que conta (leitura direta da área) tem as MESMAS RPCs que o catálogo leva ao servidor")
    tabelas = {c["tabela"] for c in consultas.values() if c["tabela"]} | {e["tabela"] for c in consultas.values() for e in (c["embutidos"] or [])}
    o.ok(tabelas - {"pacientes"} == F.TABELAS_DA_AREA and "pacientes" not in F.TABELAS_DA_AREA,
         f"as tabelas da área = as do catálogo (+ a categoria embutida); o pacientes (o nome embutido nas cobranças) fica fora da área (H-43) ({sorted(tabelas)})")
    o.ok(all(c["erros"] == list(F.ERROS_DAS_RPCS) for q, c in consultas.items() if q in ("fin_resumo_periodo", "fin_lancamentos", "fin_recibos"))
         and not consultas["fin_totais_do_aluno"]["erros"] and not consultas["fin_do_aluno"]["erros"],
         "os 4 códigos de propósito das 3 RPCs da conta (o { ok: false, erro } → o erro do item); os totais e o app sem códigos")
    o.ok(not any(c["assinar"] or c["sozinha"] for c in consultas.values()), "N8 não se aplica: nenhuma consulta da 20d assina URL (decisão H) nem vai sozinha")
    cob = consultas["fin_cobrancas_resumo"]
    o.ok(cob["recorte"] == {"modelo": "conta", "param": "conta"} and cob["laco"] == {"tamanho": 1000, "leituras": 20} and cob["vivas"]
         and r["ou"] == "status.in.(aberta,aguardando_confirmacao),and(vencimento.gte.2026-10-01,vencimento.lte.2026-10-31)",
         "as cobranças: o recorte da conta ativa (o user do token, no servidor), o 'em aberto OU no mês' = o .or() de hoje, o laço 1000 × 20")
    o.ok(consultas["fin_ultimo_recibo"]["vivas"] is False and consultas["fin_ultimo_recibo"]["teto"] == 1,
         "o último nº SEM o filtro das vivas (os da Lixeira contam — o número não volta), 1 linha")
    o.ok(r["limites"] == {"por_pagina": 20, "limite_rpc": 100, "texto": 500, "cobrancas": 1000, "leituras": 20} and r["lote_max"] == 16,
         f"os tetos: a página 20, o limite das RPCs 100, o texto 500, as cobranças 1000 × 20, o lote 16 ({r['limites']})")
    p_ok, p_n3, p_n45, p_ruim, p_n9 = r["pedidos"]
    o.ok(p_ok["ok"] and all(i["ok"] for i in p_ok["itens"]) and len(p_ok["itens"]) == 14,
         "P: os 14 itens (as 12 consultas, com os params da tela) passam no lerPedidoDeLeitura do servidor")
    o.ok(p_n3["ok"] and p_n3["itens"][0]["ok"] and [i.get("erro") for i in p_n3["itens"][1:]] == ["consulta_invalida", "consulta_invalida"],
         "N3 no servidor: a q desconhecida (e a da nutricao) → só aquele item volta consulta_invalida")
    n45 = p_n45["itens"] if p_n45["ok"] else []
    o.ok(len(n45) == 5 and all(i["ok"] for i in n45) and n45[0]["params"] == {} and n45[1]["params"] == {}
         and set(n45[2]["params"]) == {"conta", "de", "ate"} and set(n45[3]["params"]) == {"aluno", "pagina"}
         and n45[4]["params"]["filtros"] == {"q": "x"} and "p_conta" not in n45[4]["params"],
         "N4/N5 no servidor: o dono, as colunas, a ordem, o .or(), o p_conta, o paciente_id e a chave desconhecida do filtro caem (só os params declarados)")
    o.ok(p_ruim["ok"] and [i.get("erro") for i in p_ruim["itens"]] == ["dados_invalidos"] * 8,
         "o param fora da forma (uuid, data, página 0, limite 101, offset −1, texto 501, o resumo em texto, a data com hora) → dados_invalidos naquele item")
    o.ok(p_n9 == {"ok": False, "erro": "lote_grande"}, "N9 no servidor: 17 itens → lote_grande (o pedido inteiro)")
    o.ok(sorted(F.COM_PARAM_OBRIGATORIO) == sorted(q for q, c in consultas.items() if any(p.get("obrigatorio") for p in c["params"].values())),
         f"--so-leitura: as {len(F.COM_PARAM_OBRIGATORIO)} consultas com param obrigatório, sem ele → dados_invalidos (no ar, sem banco); as "
         f"{len(F.SEM_PARAM_OBRIGATORIO)} sem param obrigatório iriam ao banco (o smoke não as chama)")
    faltam = [k for k in ("fin_categorias", "fin_modelos_recibo", "fin_ultimo_recibo", "fin_profissional", "fin_cobrancas_resumo", "fin_transacoes_do_aluno",
                          "fin_recibos_do_aluno", "fin_resumo_periodo:resumo", "fin_lancamentos", "fin_recibos", "fin_recibos:contar", "fin_totais_do_aluno",
                          "fin_do_aluno") if k not in F.SQL_DA_LIB]
    o.ok(not faltam and all(":" in F.SQL_DA_LIB[k][0] and F.SQL_DA_LIB[k][0].startswith("src/") for k in F.SQL_DA_LIB),
         f"o SQL FIXO da lib: 1 (ou mais) por consulta da 20d, cada um com a origem (arquivo:linha do ed0d72e) — faltam: {faltam or '—'}")
    libs = sorted({F.SQL_DA_LIB[k][0].split(":")[0] for k in F.SQL_DA_LIB})
    sumidas = [x for x in libs if subprocess.run(["git", "-C", str(B.REPO), "cat-file", "-e", f"ed0d72e:{x}"], capture_output=True).returncode != 0]
    o.ok(not sumidas, f"as {len(libs)} libs citadas existem no ed0d72e (a origem de cada SQL fixo) — faltam: {sumidas or '—'}")
    sql = F.sql_da_lib("fin_cobrancas_resumo", "staging", uid=OUTRO, conta=conta, de="2026-10-01", ate="2026-10-31")
    o.ok("staging.cobrancas" in sql and f"c.nutricionista_id = '{OUTRO}'" in sql and "c.deleted_at is null" in sql and "'aguardando_confirmacao'" in sql
         and "order by x.ordem_da_lib" in sql and "jsonb_build_object('nome', p.nome)" in sql,
         "o SQL fixo das cobranças: o recorte da conta ativa com o uid de QUEM LÊ, o 'em aberto OU no mês', as vivas, o nome do aluno, a ordem da lib")
    sql = F.sql_da_lib("fin_ultimo_recibo", "staging", uid=OUTRO)
    o.ok("deleted_at" not in sql and "order by numero desc limit 1" in sql, "o SQL fixo do último nº: SEM o filtro das vivas (como a lib)")
    try:
        F.sql_da_lib("fin_cobrancas_resumo", "staging", uid=OUTRO, conta=conta, de="2026-10-01'; drop", ate="2026-10-31")
        injecao = False
    except SystemExit:
        injecao = True
    o.ok(injecao, "o SQL fixo recusa uma data fora do formato (nada do corpo de ninguém entra no SQL)")
    corpos = F.corpos_da_massa("seco-0000", pac, conta, dia)
    regras = B.B19.regras_fin([(a, {**c, "transacao_id": FALSO} if a == "recibo_emitir" else c) for a, c in corpos])
    o.ok([x["acao"] for x in regras["conferidos"]] == ["transacao_criar", "recibo_emitir", "categoria_criar", "modelo_recibo_criar"]
         and all(x["ok"] for x in regras["conferidos"]) and all("hml20 e2e seco-0000" in json.dumps(c) for _a, c in corpos),
         "a massa: os 4 corpos (movimentação, recibo, categoria, modelo) passam nas regras REAIS das gravações da financeiro, com a marca da rodada")
    cont = F.sql_contar_marca("staging", "seco-0000")
    o.ok("'%hml20%e2e%seco-0000%'" in cont and cont.count(" as ") == 4 and all(f"staging.{t}" in cont for t in F.COLUNAS_MARCA),
         "a conferência final: a marca da rodada nas 4 tabelas da massa (só contagem)")
    o.ok(B.REG_LOGINS.name == "logins_etapa2_20d.txt" and B.B19.MAX_LOGINS in (6, 10),
         f"o registro de logins da 20d (decisão J): {B.REG_LOGINS.name}, teto {B.B19.MAX_LOGINS} (6 na etapa 2; a sessão principal sobe para 10 no F6)")


# ───────────────────────── a rodada no staging ─────────────────────────
class Rodada:
    def __init__(self, o, L, estado, rodada: str) -> None:
        self.o, self.L, self.e, self.rodada = o, L, estado, rodada
        self.s = B.schema()
        self.tp = L.token(F.PERSONAL)
        self.up = L.uid(F.PERSONAL)
        self.pac = B.B17.matricula_da_aluna()
        self.conta = str(self.um(f"select coalesce(conta_id::text, '') as v from {self.s}.pacientes where id = {C.txt(self.pac)}") or "")
        if not C.eh_uuid(self.conta):
            raise SystemExit("a matrícula da aluna de teste não tem conta (o Financeiro da conta ativa precisa dela)")
        membro = self.um(f"select count(*)::int as v from {self.s}.conta_membros where conta_id = {C.txt(self.conta)} and user_id = {C.txt(self.up)} "
                         "and status = 'ativo'")
        if not membro:
            raise SystemExit("a w5p-personal não é membro ativo da conta da aluna de teste (SQL só leitura) — o P do Financeiro precisa dela")
        self.dia = hoje_sp()
        self.tempos: dict[str, list[int]] = {}
        self.massa: dict[str, str] = {}

    def um(self, sql: str):
        r = B.ler_principal(sql)
        return next(iter(r[0].values())) if r else None

    def ler(self, token: str, itens: list[dict], corpo: dict | None = None, rotulo: str = "ler") -> tuple[int, dict]:
        st, r, _h, ms = F.ler(token, itens, corpo=corpo)
        self.tempos.setdefault(rotulo, []).append(ms)
        return st, r

    def item(self, token: str, it: dict) -> dict:
        """1 consulta numa chamada (o P compara uma por uma)."""
        st, r = self.ler(token, [it])
        itens = r.get("itens") or [{}]
        return itens[0] if st == 200 else {"ok": False, "erro": f"HTTP {st} {r.get('erro')}"}

    def como(self, uid: str, sql: str) -> object:
        r = B.ler_como(B.PRINCIPAL_REF, uid, sql)
        return jsonb(r[0]["v"]) if r else None


def p_lista(R: Rodada, token: str, pessoa: str, q: str, params: dict, rotulo: str, chave: str | None = None, conjunto: bool = False, **valores) -> dict:
    """O P de uma consulta de tabela: as linhas da função = as do SQL FIXO da lib de antes, rodado como a pessoa (o JSON canônico, na ordem da
    lib; `conjunto`: a lib não ordenava — os modelos — como conjunto, pelo id)."""
    k = chave or q
    it = R.item(token, B.item(q, **params))
    esperado = F.sem_ordem(R.como(pessoa, F.sql_da_lib(k, R.s, **valores)) or [])
    linhas = it.get("linhas") or []
    if conjunto:
        linhas, esperado = sorted(linhas, key=lambda x: str(x.get("id"))), sorted(esperado, key=lambda x: str(x.get("id")))
    igual = bool(it.get("ok")) and canonico(linhas) == canonico(esperado)
    R.o.ok(igual, f"P {rotulo} {q}: a função = o que a lib de antes lia ({F.SQL_DA_LIB[k][0]} no ed0d72e), como a pessoa "
           f"({len(linhas)} × {len(esperado)} linha(s); {it.get('erro') or ('iguais' if igual else 'DIFERENTES')})")
    return it


def p_total(R: Rodada, pessoa: str, it: dict, q: str, chave: str, rotulo: str, **valores) -> None:
    total = R.como(pessoa, F.sql_da_lib(chave, R.s, **valores))
    R.o.ok(bool(it.get("ok")) and isinstance(it.get("total"), int) and it.get("total") == total,
           f"P {rotulo} {q}: o total = o count da lib ({F.SQL_DA_LIB[chave][0]}) como a pessoa ({it.get('total')} × {total})")


def p_rpc(R: Rodada, token: str, pessoa: str, q: str, params: dict, rotulo: str, chave: str | None = None, **valores) -> object:
    """O P de uma RPC: o valor da função = a MESMA RPC com os args DA LIB de antes, rodada como a pessoa (o JSON canônico)."""
    k = chave or q
    it = R.item(token, B.item(q, **params))
    esperado = R.como(pessoa, F.sql_da_lib(k, R.s, **valores))
    igual = bool(it.get("ok")) and canonico(jsonb(it.get("valor"))) == canonico(esperado)
    R.o.ok(igual, f"P {rotulo} {q}: o valor = a RPC da lib de antes ({F.SQL_DA_LIB[k][0]} no ed0d72e) rodada como a pessoa "
           f"({it.get('erro') or ('iguais' if igual else 'DIFERENTES')})")
    return it.get("valor")


def caso_p(R: Rodada) -> None:
    o, tp, up, pac, conta, dia = R.o, R.tp, R.up, R.pac, R.conta, R.dia
    ini, fim, de = inicio_do_mes(dia), fim_do_mes(dia), desde_30(dia)
    # as "minhas" (o dono = quem chama)
    cats = p_lista(R, tp, up, "fin_categorias", {}, "personal", uid=up)
    o.ok(R.massa.get("categorias_financeiras") in {x.get("id") for x in cats.get("linhas") or []}, "P a categoria da massa está na lista (a lista não está vazia)")
    mods = p_lista(R, tp, up, "fin_modelos_recibo", {}, "personal", conjunto=True, uid=up)
    o.ok(R.massa.get("modelos_recibo") in {x.get("id") for x in mods.get("linhas") or []}, "P o modelo da massa está na lista")
    ult = p_lista(R, tp, up, "fin_ultimo_recibo", {}, "personal", uid=up)
    o.ok(bool(ult.get("linhas")), f"P o último nº existe (o recibo da massa: {len(ult.get('linhas') or [])} linha)")
    p_lista(R, tp, up, "fin_profissional", {}, "personal", uid=up)
    # as RPCs da conta (os args da lib)
    p_rpc(R, tp, up, "fin_resumo_periodo", {"conta": conta, "de": de, "ate": dia, "filtros": {"resumo": True}}, "personal (o Resumo/Dashboard)",
          chave="fin_resumo_periodo:resumo", conta=conta, de=de, ate=dia)
    p_rpc(R, tp, up, "fin_resumo_periodo", {"conta": conta, "de": ini, "ate": fim, "filtros": {}}, "personal (os totais de Lançamentos)",
          chave="fin_resumo_periodo:lista", conta=conta, de=ini, ate=fim)
    v = p_rpc(R, tp, up, "fin_lancamentos", {"conta": conta, "de": ini, "ate": fim, "filtros": {}, "offset": 0, "limite": 20}, "personal", conta=conta, de=ini, ate=fim)
    o.ok(isinstance(v, dict) and R.massa.get("transacoes") in ids_de(v.get("itens")), "P a movimentação da massa está na página dos Lançamentos")
    v = p_rpc(R, tp, up, "fin_recibos", {"conta": conta, "filtros": {}, "offset": 0, "limite": 20}, "personal", conta=conta)
    o.ok(isinstance(v, dict) and R.massa.get("recibos") in ids_de(v.get("itens")), "P o recibo da massa está na página dos Recibos")
    p_rpc(R, tp, up, "fin_recibos", {"conta": conta, "filtros": {"de": ini, "ate": fim}, "offset": 0, "limite": 0}, "personal (o Recibos no mês)",
          chave="fin_recibos:contar", conta=conta, de=ini, ate=fim)
    p_lista(R, tp, up, "fin_cobrancas_resumo", {"conta": conta, "de": ini, "ate": fim}, "personal", uid=up, conta=conta, de=ini, ate=fim)
    # o Financeiro do aluno (a 1ª página, o total, os totais)
    it = p_lista(R, tp, up, "fin_transacoes_do_aluno", {"aluno": pac, "pagina": 1}, "personal", pac=pac)
    p_total(R, up, it, "fin_transacoes_do_aluno", "fin_transacoes_do_aluno:total", "personal", pac=pac)
    it = p_lista(R, tp, up, "fin_recibos_do_aluno", {"aluno": pac, "pagina": 1}, "personal", pac=pac)
    p_total(R, up, it, "fin_recibos_do_aluno", "fin_recibos_do_aluno:total", "personal", pac=pac)
    p_rpc(R, tp, up, "fin_totais_do_aluno", {"aluno": pac}, "personal", pac=pac)
    # o gate do app: como a ALUNA
    ta, ua = R.L.token(F.ALUNA), R.L.uid(F.ALUNA)
    p_rpc(R, ta, ua, "fin_do_aluno", {}, "aluna (o gate do app)")
    # a tela inteira numa ida: as comuns + o Resumo = 1 chamada (o lote da tela), os itens na ordem
    lote = [B.item("fin_profissional"), B.item("fin_categorias"), B.item("fin_modelos_recibo"), B.item("fin_ultimo_recibo"),
            B.item("fin_resumo_periodo", conta=conta, de=de, ate=dia, filtros={"resumo": True}), B.item("fin_cobrancas_resumo", conta=conta, de=ini, ate=fim),
            B.item("fin_lancamentos", conta=conta, de=de, ate=dia, filtros={}, offset=0, limite=6)]
    st, r = R.ler(tp, lote, rotulo="ler (a tela inteira)")
    o.ok(st == 200 and len(r.get("itens") or []) == 7 and all(i.get("ok") for i in r.get("itens") or []),
         f"P a tela do Resumo numa ida: as 4 comuns + as 3 do Resumo = 1 chamada com 7 itens, todos ok ({st})")


def caso_n1(R: Rodada) -> None:
    """Outra conta pede as consultas com a aluna, a conta da personal e os ids da massa: nada da personal nem da aluna volta."""
    o, pac, conta, dia = R.o, R.pac, R.conta, R.dia
    to = R.L.token(F.OUTRA)
    ini, fim = inicio_do_mes(dia), fim_do_mes(dia)
    proibidos = ({pac, R.up} | set(R.massa.values())) - {FALSO}
    i = B.item
    lote = [i("fin_transacoes_do_aluno", aluno=pac, pagina=1), i("fin_recibos_do_aluno", aluno=pac, pagina=1), i("fin_totais_do_aluno", aluno=pac),
            i("fin_resumo_periodo", conta=conta, de=ini, ate=fim, filtros={"resumo": True}), i("fin_lancamentos", conta=conta, de=ini, ate=fim, filtros={}, offset=0, limite=20),
            i("fin_recibos", conta=conta, filtros={}, offset=0, limite=20), i("fin_cobrancas_resumo", conta=conta, de=ini, ate=fim),
            i("fin_categorias"), i("fin_modelos_recibo"), i("fin_ultimo_recibo"), i("fin_profissional")]
    st, r = R.ler(to, lote)
    vazou = proibidos & ids_de(r)
    resumo: list[str] = []
    ok = st == 200
    for it, resp in zip(lote, r.get("itens") or []):
        q = it["q"]
        v = resp.get("valor")
        if q in ("fin_transacoes_do_aluno", "fin_recibos_do_aluno"):
            bom = resp.get("ok") is True and not (resp.get("linhas") or []) and resp.get("total") == 0
        elif q == "fin_totais_do_aluno":  # invoker: o RLS de quem chama → tudo zerado
            bom = resp.get("ok") is True and isinstance(v, dict) and v.get("total") == 0 and float(v.get("recebido") or 0) == 0
        elif q in ("fin_resumo_periodo", "fin_lancamentos", "fin_recibos"):  # definer: confere a conta → o { ok:false } vira o erro do item
            bom = resp.get("ok") is False and resp.get("erro") == "sem_acesso"
        else:  # as cobranças (o recorte com o user DELE) e as "minhas" dele: nenhuma linha da personal nem da aluna (o vazou)
            bom = resp.get("ok") is True
        ok = ok and bom
        resumo.append(f"{q}:{'ok' if bom else 'X'}")
    o.ok(ok and not vazou and len(resumo) == len(lote),
         f"N1 outra conta (w13-dono): as listas da aluna vazias (total 0), os totais zerados, as 3 RPCs da conta → o erro do item sem_acesso, as "
         f"cobranças e as 'minhas' só dele — nenhum id da personal, da aluna ou da massa ({len(vazou)} id; "
         f"{', '.join(x for x in resumo if x.endswith('X')) or 'todas como esperado'})")


def caso_n2_n3_n6_n7_n9(R: Rodada, casos: list[str]) -> None:
    o = R.o
    if "N2" in casos:
        st, _r, _h, _ms = F.ler(None, [B.item("fin_categorias")], sem_auth=True)
        o.ok(st == 401, f"N2 sem login → 401 ({st})")
    if "N3" in casos:
        st, r = R.ler(R.tp, [B.item("fin_categorias"), B.item("financeiro_inteiro"), B.item("aluno_dieta", dia=R.dia)])
        itens = r.get("itens") or [{}, {}, {}]
        o.ok(st == 200 and itens[0].get("ok") and [i.get("erro") for i in itens[1:]] == ["consulta_invalida", "consulta_invalida"],
             f"N3 q desconhecida (e a da nutricao) → o item volta consulta_invalida e o outro responde ({st})")
    if "N6" in casos:
        st, r, _h, _ms = F.ler(R.tp, [B.item("fin_categorias")], schema_="producao")
        o.ok(st == 400 and r.get("erro") == "schema_invalido", f"N6 x-schema inválido → 400 schema_invalido ({st})")
    if "N7" in casos:
        st, h = B.B19.preflight_fin(B.ORIGEM_FORA)
        o.ok(st in (200, 204) and B.cors(h) == B.ORIGEM_PADRAO, f"N7 origem fora da lista → o CORS padrão ({st})")
    if "N8" in casos:
        o.linha("N8 não se aplica (decisão H): nenhuma leitura do Financeiro assina URL — não há caminho para pedir (o --seco confere o catálogo)")
    if "N9" in casos:
        st, r = R.ler(R.tp, [B.item("fin_categorias")] * 17)
        o.ok(st == 400 and r.get("erro") == "lote_grande", f"N9 lote de 17 → 400 lote_grande ({st} {r.get('erro')})")
        st, r = R.ler(R.tp, [B.item("fin_categorias")] * 16)
        o.ok(st == 200 and len(r.get("itens") or []) == 16, f"N9 controle: 16 itens iguais → 200 com 16 respostas ({st})")


def caso_n4_n5(R: Rodada, casos: list[str]) -> None:
    o, pac, conta, dia = R.o, R.pac, R.conta, R.dia
    i = B.item
    if "N4" in casos:
        to, uo = R.L.token(F.OUTRA), R.L.uid(F.OUTRA)
        # as "minhas" com o dono da personal no corpo: volta o de QUEM CHAMA (o SQL da lib como a outra conta, com o uid DELA)
        for q in F.MINHAS:
            p_lista(R, to, uo, q, {"nutricionista_id": R.up, "user_id": R.up, "id": R.up}, "N4 outra conta com o dono da personal no corpo",
                    conjunto=(q == "fin_modelos_recibo"), uid=uo)
    if "N5" in casos:
        ini, fim = inicio_do_mes(dia), fim_do_mes(dia)
        base_itens = [i("fin_categorias"), i("fin_transacoes_do_aluno", aluno=pac, pagina=1), i("fin_cobrancas_resumo", conta=conta, de=ini, ate=fim),
                      i("fin_recibos", conta=conta, filtros={}, offset=0, limite=20)]
        outro_itens = [i("fin_categorias", select="*", colunas="*", order="id"), i("fin_transacoes_do_aluno", aluno=pac, pagina=1, paciente_id=OUTRO, select="*"),
                       i("fin_cobrancas_resumo", conta=conta, de=ini, ate=fim, nutricionista_id=OUTRO, **{"or": "id.not.is.null"}, limite=5000),
                       i("fin_recibos", conta=conta, filtros={"nutricionista_id": OUTRO}, offset=0, limite=20, p_conta=OUTRO)]
        st0, b = R.ler(R.tp, base_itens)
        st1, x = R.ler(R.tp, outro_itens)
        o.ok(st0 == 200 and st1 == 200 and canonico(b.get("itens")) == canonico(x.get("itens")),
             f"N5 select/colunas/order/or/p_conta/paciente_id/limite e a chave desconhecida do filtro no corpo → ignorados (a resposta é a mesma) ({st0}, {st1})")


def rodar(o, L, estado, rodada: str, casos: list[str]) -> None:
    R = Rodada(o, L, estado, rodada)
    estado.d.update({"pac": R.pac})
    estado.salvar()
    o.linha(f"rodada {rodada} · schema {R.s} · área financeiro (20d) · casos {','.join(casos)}")
    if {"P", "N1"} & set(casos):
        R.massa = F.criar_massa(o, estado, R.tp, R.up, R.pac, R.conta, rodada, R.dia)
    if "P" in casos:
        caso_p(R)
    if "N1" in casos:
        caso_n1(R)
    if {"N4", "N5"} & set(casos):
        caso_n4_n5(R, casos)
    if {"N2", "N3", "N6", "N7", "N8", "N9"} & set(casos):
        caso_n2_n3_n6_n7_n9(R, casos)
    tempos = {k: f"{min(v)}–{max(v)} ms (n={len(v)})" for k, v in sorted(R.tempos.items())}
    o.linha(f"tempos: {tempos}")


def so_leitura(o, L, base: str) -> None:
    """Nada grava e nada lê dado: o CORS, o 401, o 400 de schema, a q desconhecida, as consultas da 20d com param obrigatório SEM ele
    (dados_invalidos — o catálogo no ar, sem banco) e o lote de 17."""
    st1, h1 = B.B19.preflight_fin(B.ORIGEM_FORA)
    o.ok(st1 in (200, 204) and B.cors(h1) == B.ORIGEM_PADRAO, f"{base} N7: origem fora da lista → o CORS padrão ({st1})")
    st, _r, _h, _ms = F.ler(None, [B.item("fin_categorias")], sem_auth=True, origem=B.BASES[base])
    o.ok(st == 401, f"{base} N2: sem login → 401 ({st})")
    token = L.token(B.PROD_CONTA if base == "prod" else F.PERSONAL)
    st, r, _h, _ms = F.ler(token, [B.item("financeiro_inteiro")], schema_="producao", origem=B.BASES[base])
    o.ok(st == 400 and r.get("erro") == "schema_invalido", f"{base} N6: x-schema inválido → 400 ({st})")
    st, r, _h, ms = F.ler(token, [B.item("financeiro_inteiro"), B.item("aluno_dieta")], origem=B.BASES[base])
    o.ok(st == 200 and [i.get("erro") for i in r.get("itens") or []] == ["consulta_invalida", "consulta_invalida"],
         f"{base} N3: a q desconhecida → consulta_invalida em cada item, sem banco ({st}, {ms} ms)")
    st, r, _h, _ms = F.ler(token, [B.item(q) for q in F.COM_PARAM_OBRIGATORIO], origem=B.BASES[base])
    erros = [f"{q}:{i.get('erro')}" for q, i in zip(F.COM_PARAM_OBRIGATORIO, r.get("itens") or []) if i.get("erro") != "dados_invalidos"] if st == 200 else [f"HTTP {st}"]
    o.ok(not erros, f"{base}: as {len(F.COM_PARAM_OBRIGATORIO)} consultas da 20d com param obrigatório, sem ele → dados_invalidos — o catálogo da 20d "
         f"está no ar, sem ir ao banco ({', '.join(erros) or 'todas'})")
    st, r, _h, _ms = F.ler(token, [B.item("financeiro_inteiro")] * 17, origem=B.BASES[base])
    o.ok(st == 400 and r.get("erro") == "lote_grande", f"{base} N9: 17 itens → 400 lote_grande ({st})")
    # as gravações de antes seguem no ar e barram o que não é delas (a ação desconhecida → 400 acao_invalida, sem banco)
    st, r, _h, _ms = B.B19.funcao_fin(token, "transacao_apagar_tudo", {}, origem=B.BASES[base])
    o.ok(st == 400 and r.get("erro") == "acao_invalida", f"{base}: a ação desconhecida segue 400 acao_invalida (o despacho das gravações de antes) ({st})")


def main(a, casos: list[str]) -> int:
    """O --area financeiro do api.py (o seco, o --sair, o --limpar, o --so-leitura e a rodada)."""
    if a.seco:
        o = C.Saida("api20_financeiro_seco")
        seco(o)
        return o.fim()
    if a.sair:
        o = C.Saida("api20_sessoes_sair")
        B.Sessoes("sair").sair(o)
        return o.fim()
    if a.base == "prod" and not a.so_leitura:
        raise SystemExit("produção: só --so-leitura (nada grava, nada de massa)")
    modo = "so_leitura" if a.so_leitura else "limpar" if a.limpar else "rodada"
    s = B.usar_base(a.base)
    o = C.Saida(f"api20_financeiro_{a.base}" + {"limpar": "_limpar", "so_leitura": "_so_leitura"}.get(modo, ""))
    L = B.Sessoes("api20 financeiro" + {"limpar": " --limpar", "so_leitura": " --so-leitura"}.get(modo, "") + f" {a.base}")
    try:
        B.exigir_saude(o, "o api.py da hml-20 (financeiro)")
        if modo == "so_leitura":
            so_leitura(o, L, a.base if a.base != "local" else "staging")
        elif modo == "limpar":
            F.limpar_massa(o, B.Estado.ler(), s)
        else:
            pendente = B.Estado.ler()
            if not pendente.vazio():
                o.ok(False, f"há uma rodada que caiu no meio (área {pendente.d.get('area') or 'prontuario'}): rode o --limpar antes", parar=True)
            rodada = B.nova_rodada()
            estado = B.Estado({"rodada": rodada, "schema": s, "area": F.AREA_ESTADO, "linhas": [], "storage": [], "n8": None, "fin": []})
            estado.salvar()
            try:
                rodar(o, L, estado, rodada, casos)
            finally:
                F.limpar_massa(o, estado, s)
    except (Exception, SystemExit) as e:  # noqa: BLE001
        o.ok(False, f"parou no meio: {type(e).__name__}: {str(e)[:300]}")
    finally:
        L.fechar(o)
    C.C2.registrar_rodada(o.oks, o.oks + o.falhas)
    return o.fim()


ARQUIVO = Path(__file__).name
