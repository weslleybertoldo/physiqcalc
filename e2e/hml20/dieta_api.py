"""Physiq hml-20c (H-42 + H-102 · jeito 2, etapa 2, 12/10/2026) — os casos de SERVIDOR da Dieta do aluno no Painel, das Dietas, da
Pré-consulta e do Dashboard de saúde (`api.py --area dieta`): a ação `ler` da nutricao com as 34 consultas da 20c e as 5 gravações da
Pré-consulta pela função (preconsulta_formulario_criar/_editar/_excluir, preconsulta_resposta_ligar/_excluir).

Contas (staging, só de TESTE — dieta.py): P = w5p-nutri (a nutri da aluna: tudo); w5p-personal (o Dashboard dele lê painel_resumo,
preconsulta_novas e respostas_recentes — o useDashboard); N1 = w13-dono (OUTRA conta); a w5p-aluna só para a massa (a foto do diário). No
máximo 6 logins na etapa 2 (o registro: hml20/agente/logins_etapa2_20c.txt). A massa (decisão J): 1 foto no diário da aluna (a ação da
hml-19b, pela aluna), 1 formulário de Pré-consulta da nutri (pela ação NOVA preconsulta_formulario_criar — o G1) e 1 resposta dele (pelo
/f/:slug, como ANÔNIMO — a RPC de hoje), só no staging, com a marca "hml20 e2e <rodada>"; o --limpar desfaz e confere por SQL só leitura.
  P   cada consulta com a conta certa = o que a LIB DE ANTES lia (o SQL FIXO de dieta.SQL_DA_LIB, escrito a partir do 2436d0b — a
      tabela/RPC, o filtro, o recorte da conta, a ordem e o limite/página da lib, `select *` e os embutidos dela), rodado COMO A PESSOA:
      os mesmos ids na ordem da lib (os empatados em qualquer ordem; a página da busca dentro da lista inteira), coluna a coluna os valores
      (os embutidos como conjuntos, com as chaves que a tela usa), TODA coluna que a tela usa na lista da função; as RPCs = a mesma RPC com
      os args da lib; os totais (count exato e HEAD) = o count; o total de cada dia cortado = a contagem da lib no dia; os ★ com a conta =
      o filtro de antes da Ferramentas › Modelos (H-108); as URLs do diário (relativas, montadas com o domínio do cliente) baixam a foto
      da massa — 1 h nas miniaturas, 300 s na foto grande
  G   as 5 gravações da Pré-consulta pela função (H-102), como a nutri: criar (o dono, o slug — no alfabeto da tela — e a conta nascem no
      servidor; o slug/dono/id/deleted_at do corpo caem) → editar (o título; a conta, o dono e o slug do corpo caem; nada a mudar → 400) →
      a resposta anônima pelo /f/:slug → ligar à aluna, a importação com o importada_em do SERVIDOR, desligar (a importação pela metade →
      400; aluno que a nutri não vê → 403 aluno_invisivel) → excluir a resposta e o formulário (a Lixeira; de novo → 404); OUTRA conta:
      editar/ligar/excluir → 404 nao_encontrado e criar na conta da nutri → 403 sem_acesso (nada grava); cada passo conferido no banco
      por SQL só leitura (só os campos de controle)
  N1  outra conta (w13-dono) pede as consultas com os ids da aluna, da massa e a conta da nutri → listas vazias / 0 / nao_encontrado / o
      {ok:false} da RPC, NUNCA uma linha da aluna
  N2  sem login → 401 · N3 q desconhecida → o item consulta_invalida (os outros respondem)
  N4  nutricionista_id/user_id de OUTRA pessoa no corpo das consultas "minhas" (receita_nome, grupos_receita, o "meus" dos alimentos, os ★
      com a conta) e das listas da conta → ignorados (o dono é quem chama)
  N5  param/coluna fora da lista (select, colunas, order, or, recorte, paciente_id) → ignorados (a resposta é a mesma)
  N6  x-schema inválido → 400 schema_invalido · N7 origem fora da lista → o CORS padrão
  N8  o caminho no corpo da foto grande e das miniaturas → não vira assinatura: o servidor assina SÓ o caminho da linha relida pelo id
  N9  lote de 17 → 400 lote_grande (16 → 200)
--so-leitura (o smoke da sessão principal logo depois de publicar, 1 login por base): o CORS, o 401, o 400 de schema, a q desconhecida →
consulta_invalida, CADA consulta da 20c que tem param obrigatório, sem ele → dados_invalidos (o catálogo da 20c está no ar, sem ir ao
banco), 17 itens → lote_grande e as 5 ações da Pré-consulta com o corpo vazio → 400 dados_invalidos (estão no ar; nada grava — a recusa é
antes do banco); nada lê dado de saúde.
"""
from __future__ import annotations

import datetime as dt
import json
import re
import subprocess
from pathlib import Path

import _base as B
import dieta as D
import painel as P20B

C = B.C
CASOS = ("P", "G", "N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8", "N9")
FALSO = "00000000-0000-4000-8000-0000000000aa"
OUTRO = "44444444-4444-4444-8444-444444444444"
ACOES_PRECONSULTA = ("preconsulta_formulario_criar", "preconsulta_formulario_editar", "preconsulta_formulario_excluir", "preconsulta_resposta_ligar",
                     "preconsulta_resposta_excluir")
SLUG = re.compile(r"^[abcdefghijkmnpqrstuvwxyz23456789]{8}$")


def hoje_sp() -> str:
    return (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).date().isoformat()


def dia_sp(dias_atras: int) -> str:
    return (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3, days=dias_atras)).date().isoformat()


def agora_iso(menos_dias: int = 0) -> str:
    return (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=menos_dias)).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def canonico(v: object) -> str:
    return json.dumps(v, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def jsonb(v: object) -> object:
    if isinstance(v, str):
        try:
            return json.loads(v)
        except json.JSONDecodeError:
            return v
    return v


def igual(a: object, b: object, conjunto: bool = False) -> bool:
    """O mesmo JSON (conjunto=True: as listas como conjuntos — as RPCs com jsonb_agg sem ordem, como o painel_resumo)."""
    a, b = jsonb(a), jsonb(b)
    if conjunto:
        a, b = D.em_conjunto(a), D.em_conjunto(b)
    return canonico(a) == canonico(b)


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


# ───────────────────────── as regras da Pré-consulta e das janelas do diário, do próprio TS (node, sem rede) ─────────────────────────
_JS_DIETA = r"""
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const regras = await import(pathToFileURL(process.argv[1]).href);
const motor = await import(pathToFileURL(process.argv[2]).href);
const e = JSON.parse(readFileSync(0, "utf8"));
const agora = new Date("2026-10-12T15:00:00.000Z");
console.log(JSON.stringify({
  acoes: [...regras.ACOES_DA_PRECONSULTA],
  modulos: (e.acoes ?? []).map((a) => regras.moduloDoPedido({ acao: a })),
  gravacoes: (e.gravacoes ?? []).map(([acao, corpo]) => regras.montarGravacaoPreconsulta(acao, corpo, e.userId, agora)),
  slug: regras.slugDaPreconsulta(e.bytes ?? []),
  alfabeto: regras.SLUG_PRECONSULTA_ALFABETO, tamanho: regras.SLUG_PRECONSULTA_TAMANHO,
  status: Object.fromEntries((e.codigos ?? []).map((c) => [c, regras.statusDoErro(c)])),
  janelas: (e.janelas ?? []).map((j) => motor.janelasDosDiasCortados(j.linhas, "data_hora", j.pagina, j.porPagina, j.total, j.dias, j.de)),
}));
"""


def regras_dieta(gravacoes: list | None = None, acoes: list | None = None, janelas: list | None = None, user_id: str = OUTRO) -> dict:
    regras = B.REPO / "supabase-principal" / "functions" / "_shared" / "nutricao-regras.ts"
    r = subprocess.run(["node", "--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", _JS_DIETA, str(regras), str(B.MOTOR_TS)],
                       input=json.dumps({"gravacoes": gravacoes or [], "acoes": acoes or [], "janelas": janelas or [], "userId": user_id,
                                         "bytes": list(range(8)), "codigos": ["aluno_invisivel", "resposta_imutavel", "formulario_imutavel",
                                                                              "nao_encontrado", "dados_invalidos", "sem_acesso", "conflito"]}),
                       capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        raise RuntimeError(f"node (regras da dieta): {r.stderr.strip()[:400]}")
    return json.loads(r.stdout)


# ───────────────────────── os pedidos (puros: o --seco confere todos contra o servidor) ─────────────────────────
def itens_do_p(pac: str, conta: str, plano: str, diario: str, base: str = "Receita") -> list[dict]:
    """Um item de CADA consulta da 20c, com os params da tela (o --seco passa todos no lerPedidoDeLeitura do servidor)."""
    i = B.item
    de, dias = D.inicio_do_periodo(30), D.dias_do_periodo(D.inicio_do_periodo(30))
    return [
        i("planos_do_aluno", aluno=pac), i("plano_alimentar", plano=plano), i("planos_favoritos"), i("planos_favoritos", conta=conta),
        *[i(q, aluno=pac) for q in D.LISTAS_DO_ALUNO], *[i(q, aluno=pac, de=dia_sp(365), ate=hoje_sp()) for q in D.LISTAS_DO_PERIODO],
        i("registros_do_dia", aluno=pac, dia=hoje_sp()), *[i(q) for q in D.LISTAS_DA_CONTA],
        i("alimentos_busca", palavras=["arroz"], offset=0, limite=12), i("alimentos_busca", offset=0, limite=20, meus=True), i("grupos_alimentos"),
        i("receitas_pagina", filtros={}, offset=0, limite=20), i("receita_nome", base=base), i("grupos_receita", meus=True),
        i("diario_pagina", conta=conta, de=de, dias=dias, pagina=1), i("diario_contagem", conta=conta, de=de, nao_reagidas=True),
        i("diario_alunos", conta=conta, de=de), i("diario_hoje", conta=conta, de=D.inicio_do_periodo(1)), i("diario_urls", ids=[diario]),
        i("diario_foto_url", id=diario), i("formularios_preconsulta", conta=conta), i("preconsulta_numeros", conta=conta, inicio_mes=D.inicio_do_mes()),
        i("respostas_da_conta", conta=conta, filtros={}, offset=0, limite=20), i("preconsulta_novas", conta=conta), i("painel_resumo", conta=conta),
        i("respostas_recentes", conta=conta, desde=agora_iso(30)),
    ]


def pedidos_dieta(pac: str, conta: str, plano: str, diario: str) -> list[dict]:
    """Os corpos `ler` da rodada (P em lotes de até 16 e os N): o --seco passa cada um pelo lerPedidoDeLeitura do servidor."""
    p = itens_do_p(pac, conta, plano, diario)
    i = B.item
    de = D.inicio_do_periodo(30)
    return [
        {"acao": "ler", "itens": p[:16]}, {"acao": "ler", "itens": p[16:32]}, {"acao": "ler", "itens": p[32:]},
        # N3: a q desconhecida no meio
        {"acao": "ler", "itens": [i("calculos_do_aluno", aluno=pac), i("dieta_inteira"), i("diario_de_todos")]},
        # N4/N5/N8: o dono, as colunas, a ordem, o recorte, o caminho no corpo — tudo cai
        {"acao": "ler", "itens": [i("receita_nome", base="Receita", nutricionista_id=OUTRO, user_id=OUTRO),
                                  i("grupos_receita", meus=True, nutricionista_id=OUTRO),
                                  i("calculos_do_aluno", aluno=pac, select="*", colunas="*", order="id", paciente_id=OUTRO),
                                  i("formularios_preconsulta", conta=conta, nutricionista_id=OUTRO, recorte="x", **{"or": "id.not.is.null"}),
                                  i("diario_foto_url", id=diario, path=f"{OUTRO}/x/y.png", caminho=f"{OUTRO}/x/y.png"),
                                  i("diario_urls", ids=[diario], paths=[f"{OUTRO}/x/y.png"]),
                                  i("respostas_da_conta", conta=conta, filtros={"x": "1", "q": "Ana"}, offset=0, limite=20)]},
        # o param fora da forma (uuid ruim, data ruim, instante sem fuso, página 0, limite 0, palavra com vírgula, 7 palavras, booleano em texto,
        # 61 ids, enum fora da lista)
        {"acao": "ler", "itens": [i("calculos_do_aluno", aluno="abc"), i("registros_diarios", aluno=pac, de="12/10/2026", ate=hoje_sp()),
                                  i("diario_alunos", conta=conta, de="2026-10-12T03:00:00"), i("diario_pagina", conta=conta, de=de, dias=[de], pagina=0),
                                  i("alimentos_busca", offset=0, limite=0), i("alimentos_busca", palavras=["a,b"], offset=0, limite=12),
                                  i("alimentos_busca", palavras=list("abcdefg"), offset=0, limite=12), i("grupos_receita", meus="sim"),
                                  i("diario_urls", ids=[FALSO] * 61), i("alimentos_busca", fonte="outra", offset=0, limite=12)]},
        # N9: 17 itens
        {"acao": "ler", "itens": [i("produtos")] * 17},
    ]


# ───────────────────────── o --seco ─────────────────────────
def seco(o) -> None:  # noqa: PLR0915
    pac, conta, plano, diario = ("11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333",
                                 "55555555-5555-4555-8555-555555555555")
    r = B.regras_leitura(pedidos_dieta(pac, conta, plano, diario))
    consultas = r["consultas"]
    o.ok(set(D.CONSULTAS_20C) <= set(consultas) and len(D.CONSULTAS_20C) == 34 and len(set(D.CONSULTAS_20C)) == 34,
         f"o catálogo do servidor (lido do TS) tem as 34 consultas da 20c ({len(consultas)} no total, com as 30 da 20a/20b)")
    o.ok(not set(D.CONSULTAS_20C) & set(P20B.CONSULTAS_20B), "nenhuma consulta da 20c tem o nome de uma da 20b (as de antes não mudam)")
    rpcs = {consultas[q]["rpc"] for q in D.CONSULTAS_20C if consultas[q]["rpc"]}
    o.ok(rpcs == D.RPCS_DA_AREA, f"a guarda que conta (leitura direta da área) tem as MESMAS RPCs que o catálogo da 20c leva ao servidor ({sorted(rpcs)})")
    tabelas = {consultas[q]["tabela"] for q in D.CONSULTAS_20C if consultas[q]["tabela"]}
    embutidas = {e["tabela"] for q in D.CONSULTAS_20C for e in (consultas[q]["embutidos"] or [])} | {"ingredientes_receita", "alimentos", "medidas_caseiras"}
    relidas = {(consultas[q]["linhasDosIds"] or {}).get("tabela") for q in D.CONSULTAS_20C} - {None}
    # o pacientes (os alunos do filtro do diário e o aluno embutido) fica FORA da guarda: o Dashboard e outras telas o leem direto (H-43) — a
    # prova de que o diário saiu do navegador é o `ler` (diario_alunos nas consultas) e o semLeituraDireta (0 leitura em src/painel/dietas)
    o.ok((tabelas | embutidas | relidas) - {"pacientes"} <= D.TABELAS_DA_AREA and "pacientes" in D.FORA_TABELAS and "pacientes" not in D.TABELAS_DA_AREA
         and D.TABELAS_DA_AREA - (tabelas | embutidas | relidas) <= {"planos_alimentares", "refeicoes", "itens_refeicao", "profiles"},
         f"as tabelas da área = as do catálogo da 20c (+ as embutidas e a releitura pelos ids) e as que as 3 RPCs do plano leem ({len(tabelas)} de tabela); "
         "o pacientes fica fora da área (H-43 — o Dashboard o lê direto)")
    o.ok(r["buckets_todos"].get("diario:staging") == "diario-staging" == B.bucket_do_diario("staging") and r["buckets_todos"].get("diario:public") == "diario"
         and D.BUCKETS_DA_AREA == {"diario", "diario-staging"},
         "o bucket da assinatura do servidor = o da massa e o da guarda (diario, diario-staging)")
    o.ok(B.AREAS["dieta"]["rpcs"] >= D.RPCS_DA_AREA | P20B.RPCS_DA_AREA and B.AREAS["dieta"]["tabelas"] >= D.TABELAS_DA_AREA | P20B.TABELAS_DA_AREA,
         "a guarda da área dieta conta também o que a 20b tirou do navegador (as telas da Dieta passam pela casca do aluno)")
    # o recorte, o dono, as que vão sozinhas e o HEAD (o catálogo)
    conta_q = [q for q in D.CONSULTAS_20C if (consultas[q]["recorte"] or {}).get("modelo") == "conta"]
    o.ok(set(conta_q) == {"diario_pagina", "diario_contagem", "diario_alunos", "diario_hoje", "formularios_preconsulta", "preconsulta_novas", "respostas_recentes"}
         and all((consultas[q]["recorte"] or {}).get("tabela") == "paciente" for q in ("diario_pagina", "diario_contagem", "diario_hoje"))
         and (consultas["alimentos_busca"]["recorte"] or {}).get("modelo") == "taco_ou_meus",
         f"o recorte da conta ativa (o .or() de hoje, montado no servidor): {len(conta_q)} consultas de tabela (o diário no aluno embutido); os alimentos "
         "'TACO ou meus'")
    o.ok({q for q in D.CONSULTAS_20C if consultas[q]["dono"]} == {"receita_nome", "grupos_receita"} and consultas["grupos_receita"]["donoSe"] == "meus"
         and all(consultas[q]["dono"] == "nutricionista_id" for q in ("receita_nome", "grupos_receita")),
         "'minha' só receita_nome e grupos_receita com o \"meus\" (o dono = quem chama)")
    o.ok({q for q in D.CONSULTAS_20C if consultas[q]["sozinha"]} == {"planos_favoritos", "receitas_todas", "diario_foto_url"}
         and {q for q in D.CONSULTAS_20C if consultas[q]["soContar"]} == {"registros_do_dia", "diario_contagem", "preconsulta_novas"}
         and consultas["diario_pagina"]["porDia"] == {"coluna": "data_hora", "de": "de", "dias": "dias"}
         and (consultas["planos_favoritos"]["filtrarLista"] or {}).get("dono") == "nutricionista_id"
         and (consultas["receitas_pagina"]["linhasDosIds"] or {}).get("tabela") == "receitas",
         "sozinhas: os ★, todas as receitas e a foto grande; HEAD: o registro do dia, a contagem do diário e as novas; o total de cada dia; os ★ "
         "do dono com a conta (H-108); a página de receitas relida pelos ids na mesma ida")
    o.ok(consultas["diario_urls"]["assinar"]["validade"] == 3600 and consultas["diario_foto_url"]["assinar"]["validade"] == 300
         and all(consultas[q]["assinar"]["bucket"] == "diario" and consultas[q]["assinar"]["coluna"] == "path" for q in ("diario_urls", "diario_foto_url"))
         and not any(consultas[q]["assinar"] for q in D.CONSULTAS_20C if q not in ("diario_urls", "diario_foto_url")),
         "o Storage (decisão H): as miniaturas 1 h e a foto grande 300 s, no bucket diario do ambiente, só o path da linha; nenhuma outra assina")
    # os pedidos
    p1, p2, p3, p_n3, p_n458, p_ruim, p_n9 = r["pedidos"]
    n_p = len(itens_do_p(pac, conta, plano, diario))
    o.ok(all(p["ok"] for p in (p1, p2, p3)) and all(i["ok"] for p in (p1, p2, p3) for i in p["itens"]) and len(p1["itens"]) + len(p2["itens"]) + len(p3["itens"]) == n_p
         and {i["q"] for p in (p1, p2, p3) for i in p["itens"]} == set(D.CONSULTAS_20C),
         f"P: os {n_p} itens (as 34 consultas, com os params da tela) passam no lerPedidoDeLeitura do servidor")
    o.ok(p_n3["ok"] and p_n3["itens"][0]["ok"] and [i.get("erro") for i in p_n3["itens"][1:]] == ["consulta_invalida", "consulta_invalida"],
         "N3 no servidor: a q desconhecida → só aquele item volta consulta_invalida")
    i4 = p_n458["itens"]
    o.ok(p_n458["ok"] and all(i["ok"] for i in i4) and i4[0]["params"] == {"base": "Receita"} and i4[1]["params"] == {"meus": True}
         and i4[2]["params"] == {"aluno": pac} and i4[3]["params"] == {"conta": conta} and i4[4]["params"] == {"id": diario} and i4[5]["params"] == {"ids": [diario]}
         and i4[6]["params"] == {"conta": conta, "filtros": {"q": "Ana"}, "offset": 0, "limite": 20},
         "N4/N5/N8 no servidor: o dono, as colunas, a ordem, o .or(), o recorte, o paciente_id, o caminho e o campo desconhecido do filtro caem (só os "
         "params declarados)")
    o.ok(p_ruim["ok"] and [i.get("erro") for i in p_ruim["itens"]] == ["dados_invalidos"] * 10,
         "o param fora da forma (uuid, data, instante sem fuso, página 0, limite 0, palavra com vírgula, 7 palavras, booleano em texto, 61 ids, "
         "a fonte fora da lista) → dados_invalidos naquele item")
    o.ok(p_n9 == {"ok": False, "erro": "lote_grande"}, "N9 no servidor: 17 itens → lote_grande (o pedido inteiro)")
    so = B.regras_leitura([{"acao": "ler", "itens": [B.item(q) for q in D.COM_PARAM_OBRIGATORIO[:16]]},
                           {"acao": "ler", "itens": [B.item(q) for q in D.COM_PARAM_OBRIGATORIO[16:]]}])["pedidos"]
    sem = B.regras_leitura([{"acao": "ler", "itens": [B.item(q) for q in D.SEM_PARAM_OBRIGATORIO]}])["pedidos"][0]
    o.ok(all(p["ok"] for p in so) and all(i.get("erro") == "dados_invalidos" for p in so for i in p["itens"]) and len(D.COM_PARAM_OBRIGATORIO) == 26
         and sem["ok"] and all(i["ok"] for i in sem["itens"]),
         f"--so-leitura: as {len(D.COM_PARAM_OBRIGATORIO)} consultas da 20c com param obrigatório, sem ele → dados_invalidos (no ar, sem banco); as "
         f"{len(D.SEM_PARAM_OBRIGATORIO)} sem param obrigatório iriam ao banco (o smoke não as chama)")
    # o P "como a pessoa" (a lição 🟡3 da 20b): o SQL FIXO da lib do 2436d0b — nunca montado do catálogo — e o comparador
    chaves = {k.split(":")[0] for k in D.SQL_DA_LIB}
    o.ok(chaves == set(D.CONSULTAS_20C) and all(m.startswith(("select to_jsonb(", "select count(", "select coalesce(jsonb_agg(")) or "*" in m or q.split(":")[0] in D.COLUNAS_DA_TELA_FIXAS
                                                 for q, (_o, m) in D.SQL_DA_LIB.items())
         and all(o_.split(" ")[0].split(":")[0].endswith((".ts", ".tsx")) for o_, _m in D.SQL_DA_LIB.values()),
         f"o SQL fixo da lib: 1 (ou mais) por consulta da 20c ({len(chaves)}), `select *` nas tabelas (o recorte da lib onde ela já era fechada) e a RPC "
         "da lib nas RPCs, cada um com a origem (arquivo:linha do 2436d0b)")
    libs: dict[str, bool] = {}
    for origem, _m in D.SQL_DA_LIB.values():
        arq = "src/" + origem.split(":")[0]
        libs.setdefault(arq, subprocess.run(["git", "-C", str(B.REPO), "cat-file", "-e", f"2436d0b:{arq}"], capture_output=True, timeout=10).returncode == 0)
    o.ok(all(libs.values()), f"as {len(libs)} libs citadas existem no 2436d0b (a origem de cada SQL fixo) — faltam: {[a for a, ok in libs.items() if not ok] or '—'}")
    for q in D.CONSULTAS_20C:
        tabela, chave = (consultas[q]["tabela"], q) if consultas[q]["tabela"] else ((consultas[q]["linhasDosIds"] or {}).get("tabela"), f"{q}:linhas")
        if tabela and f".{tabela} " not in D.SQL_DA_LIB[chave][1]:
            o.ok(False, f"o SQL fixo de {chave} não lê a tabela da consulta ({tabela})")
    sql = D.sql_da_lib("metas_do_aluno", "staging", aluno=pac)
    o.ok(sql == f"select * from staging.metas where paciente_id = '{pac}' and deleted_at is null order by created_at desc limit 1000"
         and "dense_rank() over (order by created_at desc)" in D.sql_com_ordem(sql, D.ORDEM_DA_LIB["metas_do_aluno"]),
         "o SQL fixo de uma lista do aluno: o `select *` da lib, o paciente, as vivas, a ordem e o teto (e o rank da ordem da lib para os empates)")
    u = "66666666-6666-4666-8666-666666666666"
    s_diario = D.sql_da_lib("diario_pagina", "staging", conta=conta, uid=u, de="2026-10-01T03:00:00Z")
    s_alunos = D.sql_da_lib("diario_alunos", "staging", conta=conta, uid=u, de="2026-10-01T03:00:00Z")
    s_alim = D.sql_da_lib("alimentos_busca:painel", "staging", uid=u)
    s_nome = D.sql_da_lib("receita_nome", "staging", uid=u, prefixo="Bolo%")
    s_rec = D.sql_da_lib("receitas_pagina:linhas", "staging", ids=[FALSO])
    o.ok(f"(p.conta_id = '{conta}' or (p.conta_id is null and p.nutricionista_id = '{u}'))" in s_diario and "offset 0 limit 20" in s_diario
         and "d.deleted_at is null" in s_diario and "order by d.data_hora desc, d.created_at desc, d.id desc" in s_diario
         and "exists (select 1 from staging.diario_alimentar d where d.paciente_id = p.id and d.deleted_at is null" in s_alunos and "p.deleted_at" not in s_alunos
         and f"(a.fonte = 'taco' or a.nutricionista_id = '{u}')" in s_alim and "a.id asc offset 0 limit 20" in s_alim
         and f"nutricionista_id = '{u}'" in s_nome and "nome ilike 'Bolo%'" in s_nome
         and f"r.id = any(array['{FALSO}']::uuid[])" in s_rec and "'alimento', (select jsonb_build_object('id', a.id" in s_rec,
         "o SQL fixo: o recorte da conta no aluno embutido (!inner), a 1ª página do diário, os alunos com foto SEM o filtro da Lixeira do aluno (como "
         "a lib), o \"TACO ou meus\" com o id no desempate, o prefixo das cópias só do dono e a releitura das receitas com os ingredientes e o alimento")
    # o comparador
    lib = [{"n": 1, "r": 1, "linha": {"id": 1, "a": "x", "m": [{"id": 9, "g": 1, "extra": 0}, {"id": 8, "g": 2, "extra": 0}]}},
           {"n": 2, "r": 1, "linha": {"id": 2, "a": "y", "m": []}}, {"n": 3, "r": 2, "linha": {"id": 3, "a": "z", "m": []}}]
    ok, _m = D.comparar_com_a_lib([{"id": 2, "a": "y", "m": []}, {"id": 1, "a": "x", "m": [{"id": 8, "g": 2}, {"id": 9, "g": 1}]}, {"id": 3, "a": "z", "m": [], "url": "/x"}], lib)
    fora, _m1 = D.comparar_com_a_lib([{"id": 3, "a": "z"}, {"id": 1, "a": "x"}, {"id": 2, "a": "y"}], lib)
    falta, _m2 = D.comparar_com_a_lib([{"id": 1, "a": "x"}, {"id": 3, "a": "z"}], lib)
    difere, _m3 = D.comparar_com_a_lib([{"id": 1, "a": "x", "m": [{"id": 8, "g": 3}, {"id": 9, "g": 1}]}, {"id": 2, "a": "y"}, {"id": 3, "a": "z"}], lib)
    inventada, _m4 = D.comparar_com_a_lib([{"id": 1, "zz": 1}, {"id": 2}, {"id": 3}], lib)
    a_menos, _m5 = D.comparar_com_a_lib([{"id": 1, "m": [{"id": 9}]}, {"id": 2}, {"id": 3}], lib)
    pagina, _m6 = D.comparar_com_a_lib([{"id": 2}, {"id": 1}], lib, janela=(0, 2))
    pagina_ruim, _m7 = D.comparar_com_a_lib([{"id": 1}, {"id": 3}], lib, janela=(0, 2))
    sem_ordem, _m8 = D.comparar_com_a_lib([{"id": 3}, {"id": 1}, {"id": 2}], lib, ordem=False)
    sem_id, _m9 = D.comparar_com_a_lib([{"d": "2026-10-01", "k": 1}, {"d": "2026-10-02", "k": 2}],
                                       [{"n": 1, "r": 1, "linha": {"d": "2026-10-01", "k": 1}}, {"n": 2, "r": 2, "linha": {"d": "2026-10-02", "k": 2}}], None)
    sem_id_ruim, _m10 = D.comparar_com_a_lib([{"d": "2026-10-02", "k": 2}, {"d": "2026-10-01", "k": 1}],
                                             [{"n": 1, "r": 1, "linha": {"d": "2026-10-01", "k": 1}}, {"n": 2, "r": 2, "linha": {"d": "2026-10-02", "k": 2}}], None)
    o.ok(ok and not fora and not falta and not difere and not inventada and not a_menos and pagina and not pagina_ruim and sem_ordem and sem_id and not sem_id_ruim,
         "o comparador do P: os mesmos ids na ordem da lib (o empate em qualquer ordem), os embutidos como conjunto e só com as chaves da função "
         "(a coluna a mais do `*` fica de fora; o item a menos falha), a página DENTRO da lista inteira, a releitura sem ordem, as linhas sem id "
         "pelo multiconjunto; fora da ordem, linha a menos, valor diferente ou coluna que a lib não tem → falha (a `url` fica de fora)")
    o.ok(D.conferir_embutidos("diario_pagina", [{"paciente": dict.fromkeys(D.PACIENTE_DO_DIARIO)}])[0]
         and not D.conferir_embutidos("diario_pagina", [{"paciente": {"id": 1}}])[0] and D.conferir_embutidos("produtos", [{"id": 1}])[0],
         "os embutidos: as chaves de cada um = as que a tela usa (nem a mais, nem a menos)")
    # as colunas que a tela usa estão na lista da função (o Row do tipo / o recorte da lib) e os embutidos do catálogo = os da tela
    tela = {q: D.colunas_da_tela(q) for q in D.CONSULTAS_20C if q in D.TABELA_DA_CONSULTA or q in D.COLUNAS_DA_TELA_FIXAS}
    cols = {q: consultas[q]["colunas"] or (consultas[q]["linhasDosIds"] or {}).get("colunas") or [] for q in tela}
    faltam = {q: [c for c in v if c not in cols[q]] for q, v in tela.items()}
    o.ok(not any(faltam.values()) and len(tela) == 23,
         f"TODA coluna que a tela usa (o Row do tipo do front; os recortes da lib) está na lista da função ({sum(len(v) for v in tela.values())} colunas em "
         f"{len(tela)} consultas) — faltam: {[f'{q}:{c}' for q, cs in faltam.items() for c in cs] or '—'}")
    emb = {e.get("nome") or e["tabela"]: e for e in consultas["receitas_todas"]["embutidos"] or []}
    ing = emb.get("ingredientes") or {}
    alim = {x.get("nome") or x["tabela"]: x for x in ing.get("embutidos") or []}.get("alimento") or {}
    med = (consultas["alimentos_busca"]["embutidos"] or [{}])[0]
    pac_emb = (consultas["diario_pagina"]["embutidos"] or [{}])[0]
    o.ok(sorted(ing.get("colunas") or []) == sorted(P20B.colunas_do_tipo("ingredientes_receita")) and sorted(med.get("colunas") or []) == sorted(P20B.colunas_do_tipo("medidas_caseiras"))
         and sorted((alim.get("colunas") or []) + ["medidas_caseiras"]) == sorted(D.ALIMENTO_DO_INGREDIENTE) and pac_emb.get("nome") == "paciente"
         and sorted(pac_emb.get("colunas") or []) == sorted(D.PACIENTE_DO_DIARIO) and pac_emb.get("interno") is True,
         "os embutidos do catálogo = os do select de hoje: as medidas (o Row), o ingrediente (o Row) com o alimento (as 10 do ALIMENTO_EMBUTIDO + as "
         "medidas) e o aluno do diário (as 7 do SELECT_NUTRI, !inner)")
    # as janelas do dia cortado (o diasQuePodemContinuar) — o Python do P = o TS do servidor nos mesmos casos
    de = "2026-10-01T03:00:00Z"
    dias = [de] + [f"2026-10-{d:02d}T03:00:00Z" for d in range(2, 15)]
    linhas = [{"data_hora": f"2026-10-{d:02d}T{h:02d}:00:00Z"} for d, h in ((10, 15), (10, 4), (9, 20), (9, 3))]
    casos_j = [{"linhas": linhas, "pagina": 1, "porPagina": 4, "total": 9, "dias": dias, "de": de},
               {"linhas": linhas, "pagina": 2, "porPagina": 4, "total": 9, "dias": dias, "de": de},
               {"linhas": linhas, "pagina": 3, "porPagina": 4, "total": 12, "dias": dias, "de": de},
               {"linhas": linhas[:1], "pagina": 1, "porPagina": 4, "total": 1, "dias": dias, "de": de},
               {"linhas": [{"data_hora": "2026-10-01T04:00:00Z"}], "pagina": 2, "porPagina": 1, "total": 3, "dias": dias, "de": "2026-10-01T05:00:00Z"}]
    ts = regras_dieta(janelas=casos_j)["janelas"]
    py = [D.janelas_dos_dias(j["linhas"], j["pagina"], j["porPagina"], j["total"], j["dias"], j["de"]) for j in casos_j]
    o.ok(ts == py and len(ts[0]) == 1 and len(ts[1]) == 2 and ts[3] == [] and ts[0][0] == {"dia": "2026-10-09T03:00:00Z", "de": "2026-10-09T03:00:00Z", "ate": "2026-10-10T03:00:00Z"},
         f"as janelas dos dias cortados: o Python do P = o janelasDosDiasCortados do servidor nos {len(casos_j)} casos (a 1ª página, a do meio, a última, "
         "sem corte, o início do período no meio do dia)")
    hoje = D.dias_do_periodo(D.inicio_do_periodo(30))
    o.ok(len(hoje) >= 31 and hoje[0] == D.inicio_do_periodo(30) and all(a < b for a, b in zip(hoje, hoje[1:])) and len(hoje) <= 100
         and all(x.endswith("T03:00:00Z") for x in hoje) and len(D.dias_do_periodo(D.inicio_do_periodo(400))) == 100,
         f"os inícios de dia do período (o diasDoPeriodo da tela, no fuso de São Paulo): {len(hoje)} para 30 dias (até depois de amanhã), crescentes, o teto de 100")
    # a Pré-consulta: as 5 ações e as regras (do próprio TS)
    corpo = D.formulario_de_teste("seco-0000", conta)
    hostil = {**corpo, "nutricionista_id": OUTRO, "slug": "zzzzzzzz", "id": FALSO, "deleted_at": "2020-01-01T00:00:00Z", "created_at": "2020-01-01T00:00:00Z"}
    g = regras_dieta(gravacoes=[["preconsulta_formulario_criar", hostil], ["preconsulta_formulario_editar", {"id": FALSO, "titulo": "Novo", "conta_id": OUTRO,
                                                                                                          "nutricionista_id": OUTRO, "slug": "x"}],
                                ["preconsulta_formulario_editar", {"id": FALSO, "slug": "x"}],
                                ["preconsulta_resposta_ligar", {"id": FALSO, "paciente_id": pac}],
                                ["preconsulta_resposta_ligar", {"id": FALSO, "importada_tipo": "anamnese", "importada_id": FALSO, "importada_em": "2000-01-01T00:00:00Z"}],
                                ["preconsulta_resposta_ligar", {"id": FALSO, "importada_tipo": "anamnese"}],
                                ["preconsulta_formulario_excluir", {"id": FALSO}], ["preconsulta_resposta_excluir", {}]],
                     acoes=list(ACOES_PRECONSULTA) + ["ler", "anotacao_criar"])
    criar, editar, nada, ligar, importar, meia, excluir, sem_id = g["gravacoes"]
    o.ok(g["acoes"] == list(ACOES_PRECONSULTA) and [m["modulo"] for m in g["modulos"][:5]] == ["preconsulta"] * 5 and g["modulos"][5]["modulo"] == "leitura"
         and g["modulos"][6]["modulo"] == "prontuario",
         "as 5 ações da Pré-consulta (a lista fechada) vão ao módulo preconsulta; o `ler` e as de antes seguem para o mesmo módulo de antes")
    o.ok(criar["ok"] and criar["valores"]["nutricionista_id"] == OUTRO and "slug" not in criar["valores"] and "id" not in criar["valores"]
         and "deleted_at" not in criar["valores"] and criar["valores"]["conta_id"] == conta and criar["valores"]["titulo"] == corpo["titulo"]
         and "slug" in criar["volta"] and editar["ok"] and editar["valores"] == {"titulo": "Novo"} and nada == {"ok": False, "erro": "dados_invalidos", "campo": "nada_a_mudar"},
         "a massa: o formulário de teste passa nas regras (o dono = quem chama; o slug, o id e o deleted_at do corpo caem); o editar só leva o "
         "título (a conta, o dono e o slug caem); nada a mudar → dados_invalidos")
    o.ok(ligar["ok"] and ligar["valores"] == {"paciente_id": pac} and importar["ok"] and importar["valores"]["importada_em"] == "2026-10-12T15:00:00.000Z"
         and meia == {"ok": False, "erro": "dados_invalidos", "campo": "importada"} and excluir["ok"] and set(excluir["valores"]) == {"deleted_at"}
         and sem_id == {"ok": False, "erro": "dados_invalidos", "campo": "id"},
         "ligar: o aluno; a importação com o importada_em do SERVIDOR (o do corpo cai); a importação pela metade → dados_invalidos; excluir = a Lixeira; "
         "sem id → dados_invalidos")
    o.ok(SLUG.match(g["slug"]) and g["alfabeto"] == "abcdefghijkmnpqrstuvwxyz23456789" and g["tamanho"] == 8
         and g["status"] == {"aluno_invisivel": 403, "resposta_imutavel": 403, "formulario_imutavel": 403, "nao_encontrado": 404, "dados_invalidos": 400,
                             "sem_acesso": 403, "conflito": 409},
         "o slug nasce no alfabeto e no tamanho da tela; os códigos dos gatilhos da W21 → 403; 0 linha → 404; o corpo ruim → 400; o slug esgotado → 409")
    o.ok(all(B.B17.funcao_grava("nutricao", a, json.dumps({"acao": a})) for a in ACOES_PRECONSULTA)
         and not B.B17.funcao_grava("nutricao", "ler", json.dumps({"acao": "ler", "itens": []})),
         "a Guarda dos E2E (decisão L): as 5 da Pré-consulta são gravação (barradas na produção); o `ler` passa")
    # a massa e a limpeza
    o.ok(D.formulario_de_teste("seco-0000", conta)["titulo"].startswith(f"{B.MARCA} seco-0000") and D.versao_dos_textos()
         and D.formulario_de_teste("seco-0000", conta)["perguntas"][0] == {"id": "p1", "texto": "Como você dorme?", "tipo": "texto", "max": 4, "pontos_sim": 1, "opcoes": []},
         "a massa: o título com a marca da rodada; a pergunta no formato da tela (preconsultaUtil.ts:69); a versão dos textos do consentimento")
    sqls = [D.sql_apagar("staging", "diario_alimentar", [FALSO], paciente=pac), D.sql_apagar("staging", "formularios_preconsulta", [FALSO], dono=OUTRO),
            D.sql_apagar("staging", "respostas_preconsulta", [FALSO], dono=OUTRO)]
    o.ok(all("staging." in s and "any(array[" in s for s in sqls) and "paciente_id = '" in sqls[0] and all("nutricionista_id = '" in s for s in sqls[1:]),
         "a limpeza: só staging, só os ids da rodada, o diário só da aluna de teste e a Pré-consulta só da nutri de teste")
    recusas = 0
    for f in (lambda: D.sql_apagar("public", "diario_alimentar", [FALSO], paciente=pac), lambda: D.sql_apagar("staging", "formularios_preconsulta", [], dono=OUTRO),
              lambda: D.sql_apagar("staging", "pacientes", [FALSO], dono=OUTRO), lambda: D.sql_apagar("staging", "diario_alimentar", [FALSO]),
              lambda: D.sql_apagar("staging", "respostas_preconsulta", [FALSO])):
        try:
            f()
        except SystemExit:
            recusas += 1
    o.ok(recusas == 5, "a limpeza recusa outro schema, o DELETE sem id, tabela que não é da massa e o DELETE sem a aluna/nutri de teste")
    cont = D.sql_contar_marca("staging", "seco-0000")
    o.ok("'%hml20 e2e%seco-0000%'" in cont and all(f"staging.{t}" in cont for t in D.TABELAS_DA_MASSA) and cont.count(" as ") == 3,
         "a conferência final: a marca no diário, nos formulários e nas respostas (só contagem)")
    o.ok(B.REG_LOGINS.name == "logins_etapa2_20c.txt" and B.B19.MAX_LOGINS in (6, 10),
         f"o registro de logins da 20c (decisão J): {B.REG_LOGINS.name}, teto {B.B19.MAX_LOGINS} (6 na etapa 2; a sessão principal sobe para 10 no F6)")


# ───────────────────────── a rodada no staging ─────────────────────────
class Rodada:
    def __init__(self, o, L, estado, rodada: str) -> None:
        self.o, self.L, self.e, self.rodada = o, L, estado, rodada
        self.s = B.schema()
        self.tn = L.token(D.NUTRI)
        self.un = L.uid(D.NUTRI)
        self.pac = B.B17.matricula_da_aluna()
        self.conta = str(self.um(f"select coalesce(conta_id::text, '') as v from {self.s}.pacientes where id = {C.txt(self.pac)}") or "")
        if not C.eh_uuid(self.conta):
            raise SystemExit("a matrícula da aluna de teste não tem conta (o recorte da conta ativa precisa dela)")
        r = self.um(f"select id::text as v from {self.s}.planos_alimentares where paciente_id = {C.txt(self.pac)} and deleted_at is null order by created_at desc limit 1")
        self.plano = r if C.eh_uuid(r) else FALSO
        r = self.um(f"select nome as v from {self.s}.receitas where nutricionista_id = {C.txt(self.un)} and deleted_at is null order by created_at limit 1")
        self.base = (str(r) if r else "Receita").split(" (cópia")[0][:100]
        self.tempos: dict[str, list[int]] = {}
        self.massa: dict = {"diario": None, "formulario": None, "resposta": None}
        self.catalogo = B.regras_leitura()["consultas"]

    def um(self, sql: str):
        r = B.ler_principal(sql)
        return next(iter(r[0].values())) if r else None

    def ler(self, token: str, itens: list[dict], corpo: dict | None = None, rotulo: str = "ler") -> tuple[int, dict]:
        st, r, _h, ms = B.ler(token, itens, corpo=corpo)
        self.tempos.setdefault(rotulo, []).append(ms)
        return st, r

    def item(self, token: str, it: dict) -> dict:
        """1 consulta numa chamada (o P compara uma por uma)."""
        st, r = self.ler(token, [it])
        itens = r.get("itens") or [{}]
        return itens[0] if st == 200 else {"ok": False, "erro": f"HTTP {st} {r.get('erro')}"}

    def acao(self, token: str, acao: str, corpo: dict) -> tuple[int, dict]:
        st, r, _h, ms = B.B19.funcao(token, acao, corpo)
        self.tempos.setdefault(acao, []).append(ms)
        return st, r

    def como(self, uid: str, sql: str) -> object:
        r = B.ler_como(B.PRINCIPAL_REF, uid, sql)
        return jsonb(r[0]["v"]) if r else None


def p_lista(R: Rodada, token: str, pessoa: str, q: str, params: dict, rotulo: str, chave: str | None = None, *, id_col: str | None = "id",
            ordem: bool = True, janela: tuple[int, int] | None = None, ignorar: tuple[str, ...] = ("url",), **valores) -> dict:
    """O P de uma consulta de tabela: as linhas da função = as do SQL FIXO da lib de antes, rodado como a pessoa (os mesmos ids na ordem da
    lib e, coluna a coluna, os valores; os embutidos como conjuntos); TODA coluna que a tela usa na lista da função; os embutidos com as
    chaves da tela."""
    k = chave or q
    it = R.item(token, B.item(q, **params))
    sql = R.como(pessoa, D.sql_com_ordem(D.sql_da_lib(k, R.s, **valores), D.ORDEM_DA_LIB.get(k)))
    linhas = it.get("linhas") or []
    ok, msg = (D.comparar_com_a_lib(linhas, sql if isinstance(sql, list) else [], id_col, ordem=ordem, janela=janela, ignorar=ignorar)
               if it.get("ok") else (False, str(it.get("erro"))))
    c = R.catalogo[q]
    lista = c["colunas"] or (c["linhasDosIds"] or {}).get("colunas") or []
    faltam = [col for col in D.colunas_da_tela(q) if col not in lista] if (q in D.TABELA_DA_CONSULTA or q in D.COLUNAS_DA_TELA_FIXAS) else []
    ok_e, msg_e = D.conferir_embutidos(q, linhas)
    R.o.ok(ok and not faltam and ok_e, f"P {rotulo} {q}: a função = o que a lib de antes lia ({D.SQL_DA_LIB[k][0]} no 2436d0b), como a pessoa ({msg}); "
           f"as colunas que a tela usa na lista da função (faltam: {faltam or '—'}); os embutidos ({msg_e})")
    return it


def p_total(R: Rodada, token: str, pessoa: str, q: str, params: dict, rotulo: str, chave: str, it: dict | None = None, **valores) -> dict:
    """O P de um total (o count exato da página ou o HEAD): o total da função = o count da lib, como a pessoa."""
    it = it if it is not None else R.item(token, B.item(q, **params))
    total = R.como(pessoa, D.sql_da_lib(chave, R.s, **valores))
    R.o.ok(bool(it.get("ok")) and isinstance(it.get("total"), int) and it.get("total") == total,
           f"P {rotulo} {q}: o total = o count da lib ({D.SQL_DA_LIB[chave][0]}) como a pessoa ({it.get('total')} × {total}; {it.get('erro') or 'ok'})")
    return it


def p_rpc(R: Rodada, token: str, pessoa: str, q: str, params: dict, rotulo: str, chave: str | None = None, conjunto: bool = False, filtro=None,
          **valores) -> object:
    """O P de uma consulta de RPC: o valor da função = a MESMA RPC com os args DA LIB de antes (o SQL fixo), rodada como a pessoa (o JSON
    canônico; `conjunto`: as listas sem ordem — o jsonb_agg sem order by; `filtro`: o filtro que a tela fazia depois — os ★ da conta)."""
    k = chave or q
    it = R.item(token, B.item(q, **params))
    valor = it.get("valor")
    sql = R.como(pessoa, D.sql_da_lib(k, R.s, **valores))
    esperado = filtro(sql) if filtro else sql
    R.o.ok(bool(it.get("ok")) and igual(valor, esperado, conjunto),
           f"P {rotulo} {q}: o valor = a RPC da lib de antes ({D.SQL_DA_LIB[k][0]} no 2436d0b) rodada como a pessoa"
           f"{' (as listas como conjunto)' if conjunto else ''} ({it.get('erro') or ('iguais' if igual(valor, esperado, conjunto) else 'DIFERENTES')})")
    return valor


def baixar_e_conferir(R: Rodada, rel: object, massa: dict, prazo: int, rotulo: str) -> None:
    url = B.url_da_tela(B.API_P, rel)
    st_img, n, _tipo = B.baixar(url) if url else (0, 0, "")
    R.o.ok(bool(url) and st_img == 200 and n == massa["bytes"] and P20B.prazo_da_url(url) == prazo and P20B.caminho_da_url(url) == f"{massa['bucket']}/{massa['path']}",
           f"P {rotulo}: a URL do servidor (relativa, montada com o domínio do cliente) baixa a foto da massa ({st_img}, {n} B), com o prazo de hoje "
           f"({P20B.prazo_da_url(url)} s) e o caminho DA LINHA")


def caso_p(R: Rodada) -> None:  # noqa: PLR0915
    o, pac, conta, tn, un = R.o, R.pac, R.conta, R.tn, R.un
    # Dieta › Plano (as RPCs da hml-17) e os ★ (com e sem a conta — H-108)
    p_rpc(R, tn, un, "planos_do_aluno", {"aluno": pac}, "nutri", aluno=pac)
    p_rpc(R, tn, un, "plano_alimentar", {"plano": R.plano}, "nutri" + (" (sem plano: o null)" if R.plano == FALSO else ""), plano=R.plano)
    p_rpc(R, tn, un, "planos_favoritos", {}, "nutri (o \"Usar um modelo ★\")")
    p_rpc(R, tn, un, "planos_favoritos", {"conta": conta}, "nutri (a Ferramentas › Modelos — os ★ do dono e da conta)",
          filtro=lambda v: D.filtrar_favoritos(v, un, conta))
    # as listas do aluno, as do período, o registro do dia e os modelos/catálogo
    for q in D.LISTAS_DO_ALUNO:
        p_lista(R, tn, un, q, {"aluno": pac}, "nutri", aluno=pac)
    de, ate = dia_sp(365), hoje_sp()
    p_lista(R, tn, un, "registros_diarios", {"aluno": pac, "de": de, "ate": ate}, "nutri (o período)", aluno=pac, de=de, ate=ate)
    for q in ("refeicoes_concluidas", "metas_concluidas"):
        p_lista(R, tn, un, q, {"aluno": pac, "de": de, "ate": ate}, "nutri (o período)", id_col=None, aluno=pac, de=de, ate=ate)
    p_total(R, tn, un, "registros_do_dia", {"aluno": pac, "dia": ate}, "nutri (o dia de hoje)", "registros_do_dia", aluno=pac, dia=ate)
    for q in D.LISTAS_DA_CONTA:
        p_lista(R, tn, un, q, {}, "nutri")
    # Dietas › Alimentos (a busca do editor: a página dentro da lista inteira; o painel: "TACO ou meus" + o id) e os grupos
    it = p_lista(R, tn, un, "alimentos_busca", {"palavras": ["arroz"], "offset": 0, "limite": 12}, "nutri (a busca do editor, \"arroz\")", janela=(0, 12),
                 palavra="%arroz%")
    p_total(R, tn, un, "alimentos_busca", {}, "nutri (a busca do editor)", "alimentos_busca:total", it=it, palavra="%arroz%")
    it = p_lista(R, tn, un, "alimentos_busca", {"offset": 0, "limite": 20, "meus": True}, "nutri (a lista do painel)", chave="alimentos_busca:painel", uid=un)
    p_total(R, tn, un, "alimentos_busca", {}, "nutri (a lista do painel)", "alimentos_busca:painel:total", it=it, uid=un)
    p_rpc(R, tn, un, "grupos_alimentos", {}, "nutri")
    # Dietas › Receitas (a página: a RPC e a releitura pelos ids na MESMA ida; todas; os nomes da cópia; os grupos)
    it = R.item(tn, B.item("receitas_pagina", filtros={}, offset=0, limite=20))
    sql = R.como(un, D.sql_da_lib("receitas_pagina", R.s))
    ids = [x for x in ((sql or {}).get("ids") or []) if C.eh_uuid(x)] if isinstance(sql, dict) else []
    o.ok(bool(it.get("ok")) and igual(it.get("valor"), sql), f"P nutri receitas_pagina: o valor = a receitas_da_nutricionista da lib (receitas.ts:121) como a pessoa "
         f"({len(ids)} id(s); {it.get('erro') or 'iguais'})")
    if ids:
        linhas_sql = R.como(un, D.sql_com_ordem(D.sql_da_lib("receitas_pagina:linhas", R.s, ids=ids), None))
        ok, msg = D.comparar_com_a_lib(it.get("linhas") or [], linhas_sql if isinstance(linhas_sql, list) else [], "id", ordem=False)
        ok_e, msg_e = D.conferir_embutidos("receitas_pagina", it.get("linhas") or [])
        o.ok(ok and ok_e, f"P nutri receitas_pagina: as receitas da página relidas pelos ids NA MESMA IDA = a releitura da lib (receitas.ts:127) ({msg}; {msg_e})")
    else:
        o.ok(it.get("linhas") == [], "P nutri receitas_pagina: nenhuma receita na página → linhas vazias, sem a 2ª leitura")
    p_lista(R, tn, un, "receitas_todas", {}, "nutri (o \"Da receita\" do plano)")
    p_lista(R, tn, un, "receita_nome", {"base": R.base}, "nutri (os nomes da cópia)", id_col=None, ordem=False, uid=un,
            prefixo=re.sub(r"[\\%_]", lambda m: "\\" + m.group(0), R.base) + "%")
    p_lista(R, tn, un, "grupos_receita", {"meus": True}, "nutri (os meus)", uid=un)
    # Dietas › Diário e o "Diário de hoje" do Dashboard (o recorte da conta ativa; a página com o total e o de cada dia cortado; o HEAD; os alunos)
    de30 = D.inicio_do_periodo(30)
    dias = D.dias_do_periodo(de30)
    it = p_lista(R, tn, un, "diario_pagina", {"conta": conta, "de": de30, "dias": dias, "pagina": 1}, "nutri (a 1ª página, 30 dias)", conta=conta, uid=un, de=de30)
    p_total(R, tn, un, "diario_pagina", {}, "nutri (a 1ª página)", "diario_pagina:total", it=it, conta=conta, uid=un, de=de30)
    janelas = D.janelas_dos_dias(it.get("linhas") or [], 1, 20, int(it.get("total") or 0), dias, de30)
    esperado = [{"dia": j["dia"], "total": R.como(un, D.sql_da_lib("diario_pagina:dia", R.s, conta=conta, uid=un, de=j["de"], ate=j["ate"]))} for j in janelas]
    o.ok(bool(it.get("ok")) and ((it.get("valor") or {}).get("por_dia") or []) == esperado,
         f"P nutri diario_pagina: o total de cada dia que a página partiu = a contagem da lib no dia (diario.ts:116-123), na MESMA ida ({len(esperado)} dia(s) cortado(s))")
    p_total(R, tn, un, "diario_contagem", {"conta": conta, "de": de30, "nao_reagidas": True}, "nutri (o \"Só não reagidas (N)\")", "diario_contagem",
            conta=conta, uid=un, de=de30)
    p_lista(R, tn, un, "diario_alunos", {"conta": conta, "de": de30}, "nutri (o filtro \"Aluno\")", ignorar=("url", "registros"), conta=conta, uid=un, de=de30)
    hoje0 = D.inicio_do_periodo(1)
    p_lista(R, tn, un, "diario_hoje", {"conta": conta, "de": hoje0}, "nutri (o \"Diário de hoje\" do Dashboard)", conta=conta, uid=un, de=hoje0)
    d = R.massa["diario"]
    if d:
        ids_pag = [x.get("id") for x in it.get("linhas") or [] if C.eh_uuid(x.get("id"))]
        alvo = list(dict.fromkeys([d["id"], *ids_pag]))[:60]
        u = p_lista(R, tn, un, "diario_urls", {"ids": alvo}, "nutri (as miniaturas)", ordem=False, ids=alvo)
        f = next((x for x in u.get("linhas") or [] if x.get("id") == d["id"]), {})
        baixar_e_conferir(R, f.get("url"), d, 3600, "nutri diario_urls (a miniatura da foto da massa)")
        u = p_lista(R, tn, un, "diario_foto_url", {"id": d["id"]}, "nutri (a foto grande)", id=d["id"])
        baixar_e_conferir(R, ((u.get("linhas") or [{}])[0]).get("url"), d, 300, "nutri diario_foto_url (a foto grande da massa)")
    # Pré-consulta e o Dashboard
    p_lista(R, tn, un, "formularios_preconsulta", {"conta": conta}, "nutri", conta=conta, uid=un)
    im = D.inicio_do_mes()
    p_rpc(R, tn, un, "preconsulta_numeros", {"conta": conta, "inicio_mes": im}, "nutri", conta=conta, inicio_mes=im)
    p_rpc(R, tn, un, "respostas_da_conta", {"conta": conta, "filtros": {}, "offset": 0, "limite": 20}, "nutri (a 1ª página)", conta=conta)
    p_total(R, tn, un, "preconsulta_novas", {"conta": conta}, "nutri (o contador do menu)", "preconsulta_novas", conta=conta, uid=un)
    p_rpc(R, tn, un, "painel_resumo", {"conta": conta}, "nutri", conjunto=True, conta=conta)
    desde = agora_iso(30)
    p_lista(R, tn, un, "respostas_recentes", {"conta": conta, "desde": desde}, "nutri (a \"Atividade recente\")", conta=conta, uid=un, desde=desde)
    resp = R.massa["resposta"]
    if resp:
        linhas = R.item(tn, B.item("respostas_recentes", conta=conta, desde=desde)).get("linhas") or []
        o.ok(any(x.get("id") == resp["id"] for x in linhas), "P nutri respostas_recentes: a resposta anônima da massa aparece na \"Atividade recente\"")
    # o Dashboard da personal (o useDashboard dela lê o resumo, as novas e as recentes)
    tp, up = R.L.token(D.PERSONAL), R.L.uid(D.PERSONAL)
    p_rpc(R, tp, up, "painel_resumo", {"conta": conta}, "personal", conjunto=True, conta=conta)
    p_total(R, tp, up, "preconsulta_novas", {"conta": conta}, "personal", "preconsulta_novas", conta=conta, uid=up)
    p_lista(R, tp, up, "respostas_recentes", {"conta": conta, "desde": desde}, "personal", conta=conta, uid=up, desde=desde)


# ───────────────────────── G: as 5 gravações da Pré-consulta pela função (H-102) ─────────────────────────
def sql_formulario(s: str, id_: str) -> str:
    return (f"select nutricionista_id::text as dono, conta_id::text as conta, slug, titulo, deleted_at is null as viva from {s}.formularios_preconsulta "
            f"where id = {C.txt(C.uuid_ok(id_))}")


def sql_resposta(s: str, id_: str) -> str:
    return (f"select coalesce(paciente_id::text, '') as paciente, coalesce(importada_tipo, '') as tipo, coalesce(importada_id::text, '') as importada, "
            f"importada_em, deleted_at is null as viva, formulario_id::text as formulario from {s}.respostas_preconsulta where id = {C.txt(C.uuid_ok(id_))}")


# as colunas que o criar/editar devolvem (o VOLTA_FORMULARIO_PRECONSULTA = o Row de hoje, coluna a coluna)
D_COLUNAS_FORMULARIO = ["id", "nutricionista_id", "conta_id", "titulo", "descricao", "origem", "origem_id", "perguntas", "faixas", "slug", "ativo", "created_at",
                        "updated_at", "deleted_at"]


def massa_preconsulta(R: Rodada) -> None:
    """G1 (e a massa): o formulário de teste pela ação NOVA (o corpo com dono, slug, id e deleted_at de mentira — caem) e a resposta anônima
    pelo /f/:slug (a RPC de hoje, com o consentimento vigente)."""
    o, s = R.o, R.s
    corpo = D.formulario_de_teste(R.rodada, R.conta)
    hostil = {**corpo, "nutricionista_id": OUTRO, "slug": "zzzzzzzz", "id": FALSO, "deleted_at": "2020-01-01T00:00:00Z", "created_at": "2020-01-01T00:00:00Z"}
    st, r = R.acao(R.tn, "preconsulta_formulario_criar", hostil)
    linha = r.get("linha") or {}
    if C.eh_uuid(linha.get("id")):
        R.e.linha("formularios_preconsulta", linha["id"])
    banco = (B.ler_principal(sql_formulario(s, linha["id"])) or [{}])[0] if C.eh_uuid(linha.get("id")) else {}
    if not o.ok(st == 200 and linha.get("id") != FALSO and linha.get("nutricionista_id") == R.un == banco.get("dono") and linha.get("conta_id") == R.conta == banco.get("conta")
                and bool(SLUG.match(str(linha.get("slug")))) and linha.get("slug") == banco.get("slug") != "zzzzzzzz" and linha.get("deleted_at") is None
                and banco.get("viva") is True and linha.get("titulo") == corpo["titulo"] and sorted(linha) == sorted(D_COLUNAS_FORMULARIO),
                f"G1 preconsulta_formulario_criar (a nutri): o formulário de teste nasce com o dono = quem chama, a conta do corpo e o slug do SERVIDOR "
                f"(no alfabeto da tela); o slug/dono/id/deleted_at do corpo caem; conferido no banco ({st} {r.get('erro')})"):
        return
    R.massa["formulario"] = {"id": linha["id"], "slug": linha["slug"], "titulo": linha["titulo"]}
    st, rid = D.responder_como_anonimo(linha["slug"], R.rodada, "api")
    if C.eh_uuid(rid):
        R.e.linha("respostas_preconsulta", rid)
    if o.ok(st == 200 and C.eh_uuid(rid), f"massa: 1 resposta ao formulário de teste pelo /f/:slug, como ANÔNIMO (a RPC de hoje, com o consentimento) ({st})"):
        R.massa["resposta"] = {"id": rid}


def caso_g(R: Rodada) -> None:  # noqa: PLR0915
    """G2–G5: editar, ligar/importar/desligar, os negativos (outra conta; o aluno invisível; a importação pela metade) e excluir — cada passo
    conferido no banco (SQL só leitura)."""
    o, s = R.o, R.s
    f, resp = R.massa["formulario"], R.massa["resposta"]
    if not f:
        o.ok(False, "G: sem o formulário de teste (o G1 falhou) — os outros passos não rodam")
        return
    novo = f"{B.MARCA} {R.rodada} formulário editado"
    st, r = R.acao(R.tn, "preconsulta_formulario_editar", {"id": f["id"], "titulo": novo, "conta_id": OUTRO, "nutricionista_id": OUTRO, "slug": "zzzzzzzz"})
    linha = r.get("linha") or {}
    banco = (B.ler_principal(sql_formulario(s, f["id"])) or [{}])[0]
    o.ok(st == 200 and linha.get("titulo") == novo == banco.get("titulo") and banco.get("slug") == f["slug"] and banco.get("conta") == R.conta and banco.get("dono") == R.un,
         f"G2 preconsulta_formulario_editar: o título muda; a conta, o dono e o slug do corpo caem (conferido no banco) ({st} {r.get('erro')})")
    st, r = R.acao(R.tn, "preconsulta_formulario_editar", {"id": f["id"], "slug": "zzzzzzzz"})
    o.ok(st == 400 and r.get("erro") == "dados_invalidos", f"G2 editar só com o que cai (nada a mudar) → 400 dados_invalidos, sem ir ao banco ({st} {r.get('erro')})")
    # a outra conta: não acha (o RLS) e não cria na conta da nutri
    to = R.L.token(D.OUTRA)
    sts = [R.acao(to, "preconsulta_formulario_editar", {"id": f["id"], "titulo": "invadido"}),
           R.acao(to, "preconsulta_formulario_excluir", {"id": f["id"]})]
    if resp:
        sts += [R.acao(to, "preconsulta_resposta_ligar", {"id": resp["id"], "paciente_id": None}), R.acao(to, "preconsulta_resposta_excluir", {"id": resp["id"]})]
    banco = (B.ler_principal(sql_formulario(s, f["id"])) or [{}])[0]
    o.ok(all(st == 404 and r.get("erro") == "nao_encontrado" for st, r in sts) and banco.get("titulo") == novo and banco.get("viva") is True,
         f"G outra conta (w13-dono): editar/excluir o formulário e ligar/excluir a resposta da nutri → 404 nao_encontrado; o banco não mudou "
         f"({[st for st, _r in sts]})")
    st, r = R.acao(to, "preconsulta_formulario_criar", D.formulario_de_teste(R.rodada, R.conta))
    intruso = (r.get("linha") or {}).get("id")
    if C.eh_uuid(intruso):
        R.e.linha("formularios_preconsulta", intruso)
    o.ok(st == 403 and r.get("erro") == "sem_acesso" and not intruso,
         f"G outra conta cria um formulário na conta da nutri → 403 sem_acesso (o RLS da W21: só membro ativo); nada gravado ({st} {r.get('erro')})")
    if resp:
        rid = resp["id"]
        st, r = R.acao(R.tn, "preconsulta_resposta_ligar", {"id": rid, "paciente_id": R.pac})
        linha = r.get("linha") or {}
        banco = (B.ler_principal(sql_resposta(s, rid)) or [{}])[0]
        o.ok(st == 200 and linha.get("paciente_id") == R.pac == banco.get("paciente") and (linha.get("formulario") or {}).get("id") == f["id"]
             and linha.get("importada_em") is None,
             f"G3 preconsulta_resposta_ligar: a resposta ligada à aluna (com o formulário embutido, como a tela lê); conferido no banco ({st} {r.get('erro')})")
        antes = dt.datetime.now(dt.timezone.utc)
        st, r = R.acao(R.tn, "preconsulta_resposta_ligar", {"id": rid, "importada_tipo": "anamnese", "importada_id": FALSO, "importada_em": "2000-01-01T00:00:00Z"})
        linha = r.get("linha") or {}
        quando = str(linha.get("importada_em") or "")
        try:
            perto = abs((dt.datetime.fromisoformat(quando.replace("Z", "+00:00")) - antes).total_seconds()) < 600
        except ValueError:
            perto = False
        o.ok(st == 200 and linha.get("importada_tipo") == "anamnese" and linha.get("importada_id") == FALSO and perto and not quando.startswith("2000"),
             f"G3 a importação: o tipo e o id do corpo, o importada_em do SERVIDOR (o do corpo cai) ({st} {r.get('erro')})")
        st, r = R.acao(R.tn, "preconsulta_resposta_ligar", {"id": rid, "importada_tipo": "questionario"})
        st2, r2 = R.acao(R.tn, "preconsulta_resposta_ligar", {"id": rid, "paciente_id": FALSO})
        banco = (B.ler_principal(sql_resposta(s, rid)) or [{}])[0]
        o.ok(st == 400 and r.get("erro") == "dados_invalidos" and st2 == 403 and r2.get("erro") == "aluno_invisivel" and banco.get("paciente") == R.pac
             and banco.get("tipo") == "anamnese",
             f"G3 a importação pela metade → 400 dados_invalidos; um aluno que a nutri não vê → 403 aluno_invisivel (o gatilho da W21, com o código "
             f"próprio); o banco não mudou ({st} {r.get('erro')}, {st2} {r2.get('erro')})")
        st, r = R.acao(R.tn, "preconsulta_resposta_ligar", {"id": rid, "paciente_id": None})
        banco = (B.ler_principal(sql_resposta(s, rid)) or [{}])[0]
        o.ok(st == 200 and (r.get("linha") or {}).get("paciente_id") is None and banco.get("paciente") == "",
             f"G3 desligar (paciente_id null) → a resposta volta a ser \"nova\" ({st} {r.get('erro')})")
        st, r = R.acao(R.tn, "preconsulta_resposta_excluir", {"id": rid})
        st2, r2 = R.acao(R.tn, "preconsulta_resposta_excluir", {"id": rid})
        banco = (B.ler_principal(sql_resposta(s, rid)) or [{}])[0]
        o.ok(st == 200 and banco.get("viva") is False and st2 == 404 and r2.get("erro") == "nao_encontrado",
             f"G4 preconsulta_resposta_excluir: a resposta vai à Lixeira (deleted_at); de novo → 404 ({st}, {st2})")
    st, r = R.acao(R.tn, "preconsulta_formulario_excluir", {"id": f["id"]})
    st2, r2 = R.acao(R.tn, "preconsulta_formulario_excluir", {"id": f["id"]})
    banco = (B.ler_principal(sql_formulario(s, f["id"])) or [{}])[0]
    o.ok(st == 200 and banco.get("viva") is False and st2 == 404 and r2.get("erro") == "nao_encontrado",
         f"G5 preconsulta_formulario_excluir: o formulário vai à Lixeira (deleted_at); de novo → 404 ({st}, {st2})")


# ───────────────────────── os N ─────────────────────────
def caso_n1(R: Rodada) -> None:
    """Outra conta pede as consultas com os ids da aluna, da massa e a conta da nutri: nada da aluna volta."""
    o, pac, conta = R.o, R.pac, R.conta
    to = R.L.token(D.OUTRA)
    d = (R.massa["diario"] or {}).get("id") or FALSO
    f = (R.massa["formulario"] or {}).get("id")
    rid = (R.massa["resposta"] or {}).get("id")
    proibidos = {pac, d, R.plano} | ({f} if f else set()) | ({rid} if rid else set())
    proibidos.discard(FALSO)
    i = B.item
    de30 = D.inicio_do_periodo(30)
    lotes = [
        [i("planos_do_aluno", aluno=pac), i("plano_alimentar", plano=R.plano), *[i(q, aluno=pac) for q in D.LISTAS_DO_ALUNO],
         *[i(q, aluno=pac, de=dia_sp(365), ate=hoje_sp()) for q in D.LISTAS_DO_PERIODO], i("registros_do_dia", aluno=pac, dia=hoje_sp()),
         i("diario_foto_url", id=d), i("diario_urls", ids=[d]), i("planos_favoritos", conta=conta)],
        [i("diario_pagina", conta=conta, de=de30, dias=D.dias_do_periodo(de30), pagina=1), i("diario_contagem", conta=conta, de=de30),
         i("diario_alunos", conta=conta, de=de30), i("diario_hoje", conta=conta, de=D.inicio_do_periodo(1)), i("formularios_preconsulta", conta=conta),
         i("preconsulta_numeros", conta=conta, inicio_mes=D.inicio_do_mes()), i("respostas_da_conta", conta=conta, filtros={}, offset=0, limite=20),
         i("preconsulta_novas", conta=conta), i("painel_resumo", conta=conta), i("respostas_recentes", conta=conta, desde=agora_iso(30))],
    ]
    vazou: set[str] = set()
    resumo: list[str] = []
    ok = True
    for lote in lotes:
        st, r = R.ler(to, lote)
        vazou |= proibidos & ids_de(r)
        for it, resp in zip(lote, r.get("itens") or []):
            q = it["q"]
            v = resp.get("valor")
            if q in ("planos_do_aluno", "planos_favoritos"):
                bom = resp.get("ok") is True and v == []
            elif q == "plano_alimentar":
                bom = resp.get("ok") is True and v is None
            elif q == "diario_foto_url":
                bom = resp.get("ok") is False and resp.get("erro") == "nao_encontrado"
            elif q in ("preconsulta_numeros", "respostas_da_conta", "painel_resumo"):
                bom = (resp.get("ok") is True and isinstance(v, dict) and v.get("ok") is False) or (resp.get("ok") is False and resp.get("erro") == "sem_acesso")
            elif q in ("registros_do_dia", "diario_contagem", "preconsulta_novas"):
                bom = resp.get("ok") is True and resp.get("total") == 0
            else:
                bom = resp.get("ok") is True and not (resp.get("linhas") or []) and resp.get("total", 0) == 0
            ok = ok and bom and st == 200
            resumo.append(f"{q}:{'ok' if bom else 'X'}")
    o.ok(ok and not vazou and len(resumo) == sum(len(x) for x in lotes),
         f"N1 outra conta (w13-dono): as consultas da aluna, da massa e da conta da nutri → vazio / 0 / nao_encontrado / o {{ok:false}} da RPC, nenhum "
         f"id da aluna ({len(vazou)} id; {', '.join(x for x in resumo if x.endswith('X')) or 'todas como esperado'})")


def caso_n2_n3_n6_n7_n9(R: Rodada, casos: list[str]) -> None:
    o = R.o
    if "N2" in casos:
        st, _r, _h, _ms = B.ler(None, [B.item("produtos")], sem_auth=True)
        st2, _r2, _h2, _ms2 = B.B19.funcao(None, "preconsulta_formulario_excluir", {"id": FALSO}, sem_auth=True)
        o.ok(st == 401 and st2 == 401, f"N2 sem login → 401 (o `ler` {st}; a gravação da Pré-consulta {st2})")
    if "N3" in casos:
        st, r = R.ler(R.tn, [B.item("calculos_do_aluno", aluno=R.pac), B.item("dieta_inteira"), B.item("diario_de_todos")])
        itens = r.get("itens") or [{}, {}, {}]
        o.ok(st == 200 and itens[0].get("ok") and [i.get("erro") for i in itens[1:]] == ["consulta_invalida", "consulta_invalida"],
             f"N3 q desconhecida → o item volta consulta_invalida e o outro responde ({st})")
    if "N6" in casos:
        st, r, _h, _ms = B.ler(R.tn, [B.item("produtos")], schema_="producao")
        st2, r2, _h2, _ms2 = B.B19.funcao(R.tn, "preconsulta_formulario_excluir", {"id": FALSO}, schema_="producao")
        o.ok(st == 400 and r.get("erro") == "schema_invalido" and st2 == 400 and r2.get("erro") == "schema_invalido",
             f"N6 x-schema inválido → 400 schema_invalido (o `ler` {st}; a gravação {st2})")
    if "N7" in casos:
        st, h = B.preflight(B.ORIGEM_FORA)
        o.ok(st in (200, 204) and B.cors(h) == B.ORIGEM_PADRAO, f"N7 origem fora da lista → o CORS padrão ({st})")
    if "N9" in casos:
        st, r = R.ler(R.tn, [B.item("produtos")] * 17)
        o.ok(st == 400 and r.get("erro") == "lote_grande", f"N9 lote de 17 → 400 lote_grande ({st} {r.get('erro')})")
        st, r = R.ler(R.tn, [B.item("produtos")] * 16)
        o.ok(st == 200 and len(r.get("itens") or []) == 16, f"N9 controle: 16 itens iguais → 200 com 16 respostas ({st})")


def caso_n4_n5_n8(R: Rodada, casos: list[str]) -> None:  # noqa: PLR0915
    o, pac, conta = R.o, R.pac, R.conta
    i = B.item
    if "N4" in casos:
        to, uo = R.L.token(D.OUTRA), R.L.uid(D.OUTRA)
        # as "minhas": o dono do corpo cai — volta o de QUEM CHAMA (o SQL da lib como a outra conta, com o uid DELA)
        p_lista(R, to, uo, "receita_nome", {"base": R.base, "nutricionista_id": R.un, "user_id": R.un}, "N4 outra conta com o dono da nutri no corpo",
                id_col=None, ordem=False, uid=uo, prefixo=re.sub(r"[\\%_]", lambda m: "\\" + m.group(0), R.base) + "%")
        p_lista(R, to, uo, "grupos_receita", {"meus": True, "nutricionista_id": R.un}, "N4 outra conta com o dono da nutri no corpo", uid=uo)
        it = p_lista(R, to, uo, "alimentos_busca", {"offset": 0, "limite": 20, "meus": True, "nutricionista_id": R.un}, "N4 outra conta (o \"meus\")",
                     chave="alimentos_busca:painel", uid=uo)
        o.ok(not any(x.get("nutricionista_id") == R.un for x in it.get("linhas") or []), "N4 o \"meus\" da outra conta nunca traz um alimento da nutri")
        p_rpc(R, to, uo, "planos_favoritos", {"conta": conta, "nutricionista_id": R.un}, "N4 outra conta (os ★ com a conta da nutri)",
              filtro=lambda v: D.filtrar_favoritos(v, uo, conta))
        # as listas da conta: o dono/aluno de outra pessoa no corpo → a mesma resposta
        st0, base = R.ler(R.tn, [i(q) for q in D.LISTAS_DA_CONTA])
        st1, outro = R.ler(R.tn, [i(q, nutricionista_id=OUTRO, user_id=OUTRO, aluno=OUTRO) for q in D.LISTAS_DA_CONTA])
        o.ok(st0 == 200 and st1 == 200 and igual(base.get("itens"), outro.get("itens")),
             f"N4 o dono/aluno de outra pessoa no corpo das listas da conta (modelos, produtos, todas as receitas) → ignorados ({st0}, {st1})")
    if "N5" in casos:
        de30 = D.inicio_do_periodo(30)
        dias = D.dias_do_periodo(de30)
        base_itens = [i("calculos_do_aluno", aluno=pac), i("formularios_preconsulta", conta=conta), i("diario_pagina", conta=conta, de=de30, dias=dias, pagina=1)]
        outro_itens = [i("calculos_do_aluno", aluno=pac, select="*", colunas="*", order="id", paciente_id=OUTRO),
                       i("formularios_preconsulta", conta=conta, recorte="x", nutricionista_id=OUTRO, **{"or": "id.not.is.null"}),
                       i("diario_pagina", conta=conta, de=de30, dias=dias, pagina=1, order="id", referencedTable="paciente", limite=1000)]
        st0, b = R.ler(R.tn, base_itens)
        st1, x = R.ler(R.tn, outro_itens)
        o.ok(st0 == 200 and st1 == 200 and igual(b.get("itens"), x.get("itens")),
             f"N5 select/colunas/order/or/recorte/paciente_id/limite no corpo → ignorados (a resposta é a mesma) ({st0}, {st1})")
    if "N8" in casos and R.massa["diario"]:
        d = R.massa["diario"]
        st, r = R.ler(R.tn, [i("diario_foto_url", id=d["id"], path=f"{OUTRO}/x/y.png", caminho=f"{OUTRO}/x/y.png")])
        linha = ((r.get("itens") or [{}])[0].get("linhas") or [{}])[0]
        url = B.url_da_tela(B.API_P, linha.get("url"))
        st2, r2 = R.ler(R.tn, [i("diario_urls", ids=[d["id"]], paths=[f"{OUTRO}/x/y.png"], path=f"{OUTRO}/x/y.png")])
        linhas2 = (r2.get("itens") or [{}])[0].get("linhas") or []
        caminhos = {P20B.caminho_da_url(B.url_da_tela(B.API_P, x.get("url"))) for x in linhas2 if x.get("url")}
        o.ok(st == 200 and st2 == 200 and P20B.caminho_da_url(url) == f"{d['bucket']}/{d['path']}" and caminhos == {f"{d['bucket']}/{d['path']}"}
             and OUTRO not in json.dumps(r) + json.dumps(r2),
             "N8 a foto grande e as miniaturas com outro caminho no corpo → assinam SÓ o caminho da linha relida pelo id")


def rodar(o, L, estado, rodada: str, casos: list[str]) -> None:
    R = Rodada(o, L, estado, rodada)
    estado.d.update({"pac": R.pac})
    estado.salvar()
    o.linha(f"rodada {rodada} · schema {R.s} · área dieta (20c) · casos {','.join(casos)} · plano {'sim' if R.plano != FALSO else 'não'}")
    if {"P", "N1", "N8"} & set(casos):
        R.massa["diario"] = D.criar_foto_do_diario(o, estado, L.token(D.ALUNA), R.pac, rodada)
    if {"P", "G", "N1"} & set(casos):
        massa_preconsulta(R)
    if "P" in casos:
        caso_p(R)
    if "N1" in casos:
        caso_n1(R)
    if {"N4", "N5", "N8"} & set(casos):
        caso_n4_n5_n8(R, casos)
    if "G" in casos:
        caso_g(R)
    if {"N2", "N3", "N6", "N7", "N9"} & set(casos):
        caso_n2_n3_n6_n7_n9(R, casos)
    tempos = {k: f"{min(v)}–{max(v)} ms (n={len(v)})" for k, v in sorted(R.tempos.items())}
    o.linha(f"tempos: {tempos}")


def limpar(o, estado, L, s: str) -> None:
    D.limpar_massa(o, estado, L, s)


def so_leitura(o, L, base: str) -> None:
    """Nada grava e nada lê dado de saúde: o CORS, o 401, o 400 de schema, a q desconhecida, as 26 consultas da 20c com param obrigatório
    SEM ele (dados_invalidos), o lote de 17 e as 5 ações da Pré-consulta com o corpo vazio (400 dados_invalidos: no ar, recusadas antes do
    banco)."""
    st1, h1 = B.preflight(B.ORIGEM_FORA)
    o.ok(st1 in (200, 204) and B.cors(h1) == B.ORIGEM_PADRAO, f"{base} N7: origem fora da lista → o CORS padrão ({st1})")
    st, _r, _h, _ms = B.ler(None, [B.item("produtos")], sem_auth=True, origem=B.BASES[base])
    o.ok(st == 401, f"{base} N2: sem login → 401 ({st})")
    token = L.token(B.PROD_CONTA if base == "prod" else D.NUTRI)
    st, r, _h, _ms = B.ler(token, [B.item("dieta_inteira")], schema_="producao", origem=B.BASES[base])
    o.ok(st == 400 and r.get("erro") == "schema_invalido", f"{base} N6: x-schema inválido → 400 ({st})")
    st, r, _h, ms = B.ler(token, [B.item("dieta_inteira"), B.item("diario_de_todos")], origem=B.BASES[base])
    o.ok(st == 200 and [i.get("erro") for i in r.get("itens") or []] == ["consulta_invalida", "consulta_invalida"],
         f"{base} N3: a q desconhecida → consulta_invalida em cada item, sem banco ({st}, {ms} ms)")
    erros: list[str] = []
    for lote in (D.COM_PARAM_OBRIGATORIO[:16], D.COM_PARAM_OBRIGATORIO[16:]):
        st, r, _h, _ms = B.ler(token, [B.item(q) for q in lote], origem=B.BASES[base])
        erros += [f"{q}:{i.get('erro')}" for q, i in zip(lote, r.get("itens") or []) if i.get("erro") != "dados_invalidos"] if st == 200 else [f"HTTP {st}"]
    o.ok(not erros, f"{base}: as {len(D.COM_PARAM_OBRIGATORIO)} consultas da 20c com param obrigatório, sem ele → dados_invalidos — o catálogo da 20c "
         f"está no ar, sem ir ao banco ({', '.join(erros) or 'todas'})")
    st, r, _h, _ms = B.ler(token, [B.item("dieta_inteira")] * 17, origem=B.BASES[base])
    o.ok(st == 400 and r.get("erro") == "lote_grande", f"{base} N9: 17 itens → 400 lote_grande ({st})")
    ruins: list[str] = []
    for acao in ACOES_PRECONSULTA:
        st, r, _h, _ms = B.B19.funcao(token, acao, {}, origem=B.BASES[base])
        if not (st == 400 and r.get("erro") == "dados_invalidos"):
            ruins.append(f"{acao}:{st} {r.get('erro')}")
    o.ok(not ruins, f"{base}: as 5 ações da Pré-consulta com o corpo vazio → 400 dados_invalidos (no ar; recusadas antes do banco — nada grava) "
         f"({', '.join(ruins) or 'todas'})")


def main(a, casos: list[str]) -> int:
    """O --area dieta do api.py (o seco, o --sair, o --limpar, o --so-leitura e a rodada)."""
    if a.seco:
        o = C.Saida("api20_dieta_seco")
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
    o = C.Saida(f"api20_dieta_{a.base}" + {"limpar": "_limpar", "so_leitura": "_so_leitura"}.get(modo, ""))
    L = B.Sessoes("api20 dieta" + {"limpar": " --limpar", "so_leitura": " --so-leitura"}.get(modo, "") + f" {a.base}")
    try:
        B.exigir_saude(o, "o api.py da hml-20 (dieta)")
        if modo == "so_leitura":
            so_leitura(o, L, a.base if a.base != "local" else "staging")
        elif modo == "limpar":
            limpar(o, B.Estado.ler(), L, s)
        else:
            pendente = B.Estado.ler()
            if not pendente.vazio():
                o.ok(False, f"há uma rodada que caiu no meio (área {pendente.d.get('area') or 'prontuario'}): rode o --limpar antes", parar=True)
            rodada = B.nova_rodada()
            estado = B.Estado({"rodada": rodada, "schema": s, "area": D.AREA_ESTADO, "linhas": [], "storage": [], "n8": None})
            estado.salvar()
            try:
                rodar(o, L, estado, rodada, casos)
            finally:
                limpar(o, estado, L, s)
    except (Exception, SystemExit) as e:  # noqa: BLE001
        o.ok(False, f"parou no meio: {type(e).__name__}: {str(e)[:300]}")
    finally:
        L.fechar(o)
    C.C2.registrar_rodada(o.oks, o.oks + o.falhas)
    return o.fim()


ARQUIVO = Path(__file__).name
