#!/usr/bin/env python3
"""Physiq hml-19a (H-41 · H-81 · jeito 2, 11/10/2026) — E2E de SERVIDOR da função nutricao, área Prontuário.

Molde: e2e/wp/api.py (a foto do estado antes, --limpar, --seco). Massa "hml19 e2e <rodada> …" SÓ no schema staging, SÓ nas contas de
TESTE (P = w5p-nutri, a nutri responsável pela w5p-aluna; N1 = w13-dono, de OUTRA conta); o que a rodada cria vai para
~/projetos/physiqcalc-scratch/hml/hml19/agente/e2e_estado.json e sai no fim (ou no --limpar, se a rodada cair no meio): as linhas por
id (DELETE no staging, só do dono de teste), os arquivos pelo Storage (como a dona da pasta) e os modelos mexidos no N8 voltam. O último
✅ confere por SQL só leitura (só contagem) que não sobrou nada com a marca da rodada.

Casos (a ordem é sempre esta):
  P   com a nutri de teste: cada entidade das 18 tabelas — criar, editar e excluir (soft) pela função, e o SQL só leitura confere a
      linha (o dono = quem chama; a Lixeira; a origem "manual"; o "agora" do servidor); o lote dos resultados; o registro do dia
      (criado → mesmo dia = edição); o anexo pelo link assinado (preparar → PUT → registrar; o objeto no bucket; excluir tira o objeto);
      a interação do SISTEMA não muda (404); padroes_garantir das 3 seções (a lista volta; quem já tem não ganha outro)
  N1  profissional de OUTRA conta: criar para a aluna → 403; editar e excluir a linha da P → 404 e a linha não muda; anexo_preparar → 403
  N2  sem login → 401; token falso → 401
  N3  ação desconhecida → 400 acao_invalida
  N4  nutricionista_id de outra pessoa no corpo → ignorado (o dono é quem chama)
  N5  coluna fora da lista (origem, deleted_at, id) → ignorada
  N6  x-schema inválido → 400 schema_invalido
  N7  origem fora da lista → o CORS devolve o padrão (https://physiqcalc.com.br); a do staging volta igual
  N8  2 padroes_garantir ao MESMO tempo (a P sem modelo próprio de documento: os dela vão à Lixeira e voltam no fim) → 1 conjunto só
  N9  anexo registrado com caminho de outra pasta → 403 fora_da_pasta; o caminho certo sem o arquivo → 400 anexo_nao_enviado
  LX  a Lixeira (W26) com o excluir pela função: a anamnese excluída pela nutricao aparece na lixeira_da_conta, volta com o
      lixeira_restaurar e, excluída de novo, sai de vez com o lixeira_apagar (as RPCs da tela da Lixeira, como a nutri de teste)
Produção (--base prod --so-leitura): OPTIONS (CORS), sem login → 401, x-schema inválido → 400, ação desconhecida → 400 — nada grava.
--so-leitura também com --base staging (hml-19b, depois do incidente de 11/10 07:50): as MESMAS 4 checagens que não gravam, no staging
(antes, no staging o --so-leitura era ignorado e rodava a bateria inteira). SIGTERM/SIGINT (timeout, Ctrl+C) viram SystemExit: a
limpeza do `finally` roda mesmo com o processo cortado.
hml-19b: --area dieta (a Dieta e as Dietas: P, N1–N8) e --area aluno (o app: P, N1, N9 — o ✓ da refeição e da meta, a foto do diário
pelo link assinado, o balde do limite por IP e o link público) — os casos em api_dieta.py; o estado guarda a área (o --limpar desfaz a
rodada da área que caiu).
hml-19c: --area avaliacao (a Avaliação: a foto mensal pela admin-avaliacoes do Treino, no mês sentinela; a antropometria, a foto de
evolução pelo link assinado e o aviso pela nutricao — P, N1–N9) — os casos em api_avaliacao.py; o --limpar desfaz a rodada dela.

Uso: python3 e2e/hml19/api.py --area prontuario|dieta|aluno|avaliacao [--base staging|prod] [--casos P,N1,…,N9] [--seco | --limpar | --so-leitura | --sair]
  --seco    sem rede, sem login, sem banco: monta TODOS os pedidos da rodada e confere cada um contra as regras do servidor (o próprio
            _shared/nutricao-regras.ts, pelo node) + N3/N4/N5 nas regras + o SQL da limpeza
  --limpar  só desfaz uma rodada que caiu no meio (pelo arquivo de estado)
  --sair    o logout (scope=local) das sessões de TESTE guardadas entre os scripts (_base.Sessoes) — no fim da etapa 2
Antes de rodar no staging: a nutricao publicada e a migration 20261011100000 aplicada no staging (a Dieta e o app: também a
20261011110000 da hml-19b); ~/.pc-pat; as senhas de TESTE.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import threading
import time
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import _base as B  # noqa: E402
import api_avaliacao as AA  # noqa: E402
import api_dieta as AD  # noqa: E402

C = B.C
CASOS = ("P", "N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8", "N9", "LX")
FALSO = "00000000-0000-4000-8000-0000000000aa"


def hoje() -> str:
    return dt.date.today().isoformat()


def agora() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


# ───────────────────────── os pedidos (puros: o --seco confere todos) ─────────────────────────
def pedidos_de_criar(rodada: str, pac: str) -> list[tuple[str, str, dict, str]]:
    """(entidade, ação, corpo, coluna da marca) — 1 criar por tabela (o anexo e o registro do dia têm caminho próprio)."""
    m = f"{B.MARCA} {rodada}"
    dum = (dt.date.today() - dt.timedelta(days=70)).isoformat()
    dpp = (dt.date.today() - dt.timedelta(days=70) + dt.timedelta(days=280)).isoformat()
    return [
        ("anotacao", "anotacao_criar", {"paciente_id": pac, "data": agora(), "texto": f"{m} anotação", "visibilidade": "nutricionistas",
                                        "autor_papel": "nutricionista"}, "texto"),
        ("consulta", "consulta_criar", {"paciente_id": pac, "data": agora(), "observacao": f"{m} consulta"}, "observacao"),
        ("anamnese", "anamnese_criar", {"paciente_id": pac, "modelo_id": None, "titulo": f"{m} anamnese", "data": agora(),
                                        "conteudo": [{"pergunta": "Queixa", "resposta": "teste"}], "texto_livre": None}, "titulo"),
        ("modelo_anamnese", "modelo_anamnese_criar", {"titulo": f"{m} modelo", "perguntas": ["Pergunta de teste"], "favorito": False}, "titulo"),
        ("questionario", "questionario_criar", {"titulo": f"{m} questionário", "descricao": "", "perguntas": [], "faixas": [], "favorito": False}, "titulo"),
        ("aplicacao", "aplicacao_criar", {"paciente_id": pac, "questionario_id": None, "titulo": f"{m} aplicação", "perguntas": [], "faixas": [],
                                          "respostas": {}, "pontuacao": 0, "faixa": "", "nivel": "", "data": hoje(), "observacao": ""}, "titulo"),
        ("exame_catalogo", "exame_catalogo_criar", {"nome": f"{m} exame", "unidade": "mg/dL", "ref_min": 1, "ref_max": 2, "referencia_texto": "",
                                                    "favorito": False}, "nome"),
        ("pedido_exame", "pedido_exame_criar", {"paciente_id": pac, "data": hoje(), "exames": ["TSH"], "observacao": f"{m} pedido"}, "observacao"),
        ("avaliacao_integrada", "avaliacao_integrada_criar", {"paciente_id": pac, "titulo": f"{m} 360", "texto": None, "sintese": {"teste": True},
                                                              "fontes": {}}, "titulo"),
        ("gestacao", "gestacao_criar", {"paciente_id": pac, "dum": dum, "dpp": dpp, "peso_pre": 60, "altura": 165, "imc_pre": 22.04, "gemelar": False,
                                        "observacao": f"{m} gestação"}, "observacao"),
        ("interacao", "interacao_criar", {"medicamento": f"{m} med", "sinonimos": [], "classe": "", "nutriente": "B12", "efeito": "teste",
                                          "gravidade": "baixa", "conduta": "teste", "fonte": ""}, "medicamento"),
        ("medicamento", "medicamento_criar", {"paciente_id": pac, "medicamento": f"{m} med", "interacao_id": None, "dose": "", "posologia": "",
                                              "inicio": None, "observacao": ""}, "medicamento"),
        ("analise_farmaco", "analise_farmaco_criar", {"paciente_id": pac, "titulo": f"{m} análise", "parecer": "", "medicamentos": [], "interacoes": []},
         "titulo"),
        ("modelo_documento", "modelo_documento_criar", {"tipo": "atestado", "titulo": f"{m} modelo doc", "conteudo": "x", "favorito": False}, "titulo"),
        ("documento", "documento_criar", {"paciente_id": pac, "modelo_id": None, "tipo": "declaracao", "titulo": f"{m} documento", "texto": "teste",
                                          "dados": {}, "data": hoje()}, "titulo"),
    ]


# entidade → (tabela, ação de editar com o que muda, ação de excluir)
EDITAR_EXCLUIR: dict[str, tuple[str, str, dict, str]] = {
    "anotacao": ("registros_prontuario", "anotacao_editar", {"texto": "§ editada", "data": None, "visibilidade": "nutricionistas",
                                                             "autor_papel": "nutricionista"}, "anotacao_excluir"),
    "consulta": ("consultas", "consulta_editar", {"observacao": "§ editada"}, "consulta_excluir"),
    "anamnese": ("anamneses", "anamnese_editar", {"titulo": "§ editada"}, "anamnese_excluir"),
    "modelo_anamnese": ("modelos_anamnese", "modelo_anamnese_editar", {"titulo": "§ editada", "favorito": True}, "modelo_anamnese_excluir"),
    "questionario": ("questionarios", "questionario_editar", {"titulo": "§ editada"}, "questionario_excluir"),
    "aplicacao": ("respostas_questionario", "aplicacao_editar", {"pontuacao": 3, "nivel": "baixo", "observacao": "editada"}, "aplicacao_excluir"),
    "exame_catalogo": ("exames_catalogo", "exame_catalogo_editar", {"ref_max": 3}, "exame_catalogo_excluir"),
    "pedido_exame": ("pedidos_exame", "pedido_exame_editar", {"exames": ["TSH", "HDL"]}, "pedido_exame_excluir"),
    "avaliacao_integrada": ("avaliacoes_integradas", "avaliacao_integrada_editar", {"titulo": "§ editada", "texto": "parecer"},
                            "avaliacao_integrada_excluir"),
    "gestacao": ("gestacoes", "gestacao_editar", {"gemelar": True}, "gestacao_excluir"),
    "interacao": ("interacoes_farmaco_nutriente", "interacao_editar", {"conduta": "editada"}, "interacao_excluir"),
    "medicamento": ("medicamentos_paciente", "medicamento_editar", {"ativo": False}, "medicamento_excluir"),
    "analise_farmaco": ("analises_farmaco", "analise_farmaco_editar", {"titulo": "§ editada", "parecer": "editado"}, "analise_farmaco_excluir"),
    "modelo_documento": ("modelos_documento", "modelo_documento_editar", {"conteudo": "y"}, "modelo_documento_excluir"),
    "documento": ("documentos", "documento_editar", {"texto": "editado"}, "documento_excluir"),
}


def corpo_de_editar(entidade: str, criado: dict, id_: str) -> dict:
    """O corpo do editar: o "§" vira o texto marcado da criação (a marca fica) e o data nulo vira o de agora."""
    _t, _a, muda, _e = EDITAR_EXCLUIR[entidade]
    corpo = {"id": id_}
    for k, v in muda.items():
        if v == "§ editada":
            corpo[k] = f"{criado.get(k) or ''} editada".strip()
        elif v is None and k == "data":
            corpo[k] = agora()
        else:
            corpo[k] = v
    return corpo


def pedidos_da_rodada(rodada: str, pac: str, eu: str) -> list[tuple[str, dict]]:
    """Todos os pedidos da rodada na forma que vão (o --seco confere cada um contra o servidor)."""
    lista: list[tuple[str, dict]] = []
    for entidade, acao, corpo, _col in pedidos_de_criar(rodada, pac):
        lista.append((acao, corpo))
        if entidade in EDITAR_EXCLUIR:
            _t, ae, _m, ax = EDITAR_EXCLUIR[entidade]
            lista += [(ae, corpo_de_editar(entidade, corpo, FALSO)), (ax, {"id": FALSO})]
    m = f"{B.MARCA} {rodada}"
    linhas = [{"exame": f"{m} r1", "valor": 1.5, "valor_texto": "", "unidade": "mg/dL", "ref_min": 1, "ref_max": 2, "referencia_texto": ""},
              {"exame": f"{m} r2", "valor": None, "valor_texto": "negativo", "unidade": "", "ref_min": None, "ref_max": None, "referencia_texto": ""}]
    lista += [("resultados_exame_criar", {"paciente_id": pac, "data": hoje(), "linhas": linhas}),
              ("resultado_exame_editar", {"id": FALSO, "valor": 1.8}), ("resultado_exame_excluir", {"id": FALSO}),
              ("avaliacao_integrada_regerar", {"id": FALSO, "sintese": {"teste": 2}, "fontes": {"x": 1}}),
              ("gestacao_encerrar", {"id": FALSO}),
              ("registro_gestacional_salvar", {"gestacao_id": FALSO, "paciente_id": pac, "data": hoje(), "peso": 62, "pa_sistolica": None,
                                               "pa_diastolica": None, "observacao": f"{m} registro"}),
              ("registro_gestacional_editar", {"id": FALSO, "peso": 62.5}), ("registro_gestacional_excluir", {"id": FALSO}),
              ("anexo_preparar", pedido_de_anexo(rodada, pac, 12)),
              ("anexo_registrar", {**pedido_de_anexo(rodada, pac, 12), "caminho": f"{eu}/{pac}/{FALSO}-hml19-e2e-{rodada}.txt", "descricao": m}),
              ("anexo_editar", {"id": FALSO, "descricao": f"{m} editada"}), ("anexo_excluir", {"id": FALSO})]
    lista += [("padroes_garantir", {"secao": s}) for s in ("anamnese", "documento", "exame")]
    return lista


def pedido_de_anexo(rodada: str, pac: str, tamanho: int) -> dict:
    return {"paciente_id": pac, "nome": f"hml19-e2e-{rodada}.txt", "tipo": "text/plain", "tamanho": tamanho}


# ───────────────────────── o --seco ─────────────────────────
def seco(o, area: str) -> None:
    rodada, pac, eu = "seco-0000", "11111111-1111-4111-8111-111111111111", "33333333-3333-4333-8333-333333333333"
    pedidos = pedidos_da_rodada(rodada, pac, eu)
    r = B.regras(pedidos, eu)
    o.ok(len(r["acoes"]) == 58 and len(r["tabelas"]) == 18, f"as regras do servidor lidas do TS: {len(r['acoes'])} ações, {len(r['tabelas'])} tabelas")
    feitas = {a for a, _c in pedidos}
    o.ok(feitas == set(r["acoes"]), f"a rodada passa por TODAS as ações da área {area} ({len(feitas)}/58)"
         + ("" if feitas == set(r["acoes"]) else f" — faltam {sorted(set(r['acoes']) - feitas)}"))
    ruins = [f"{x['acao']} ({x['erro']} {x['campo'] or ''})" for x in r["conferidos"] if not x["ok"]]
    o.ok(not ruins, f"os {len(pedidos)} pedidos da rodada passam nas regras do servidor" + (f" — recusados: {ruins}" if ruins else ""))
    # N3, N4 e N5 nas regras (o que o servidor faz com o corpo)
    anamnese = next(c for e, _a, c, _col in pedidos_de_criar(rodada, pac) if e == "anamnese")
    n = B.regras([("apagar_tudo", {}), ("anamnese_criar", {**anamnese, "nutricionista_id": FALSO}),
                  ("consulta_criar", {"paciente_id": pac, "data": agora(), "origem": "importacao", "deleted_at": "2020-01-01T00:00:00Z", "id": FALSO})], eu)
    c3, c4, c5 = n["conferidos"]
    o.ok(not c3["ok"] and c3["erro"] == "acao_invalida", "N3 nas regras: ação desconhecida → acao_invalida")
    o.ok(c4["ok"] and c4["valores"]["nutricionista_id"] == eu, "N4 nas regras: o nutricionista_id do corpo cai; o dono é quem chama")
    o.ok(c5["ok"] and c5["valores"]["origem"] == "manual" and "deleted_at" not in c5["valores"] and "id" not in c5["valores"],
         "N5 nas regras: origem/deleted_at/id do corpo caem (a origem é 'manual')")
    # N9 nas regras: o caminho de outra pasta
    outro = "44444444-4444-4444-8444-444444444444"
    n9 = B.regras([("anexo_registrar", {**pedido_de_anexo(rodada, pac, 12), "caminho": f"{outro}/{pac}/{FALSO}-a.txt"})], eu)["conferidos"][0]
    o.ok(not n9["ok"] and n9["erro"] == "fora_da_pasta", "N9 nas regras: caminho de outra pasta → fora_da_pasta")
    # a limpeza e a conferência
    sqls = B.sql_apagar_linhas("staging", [["anamneses", FALSO], ["modelos_documento", FALSO]], eu)
    o.ok(len(sqls) == 2 and all("nutricionista_id = '" in s and "staging." in s for s in sqls), "o SQL da limpeza: por tabela, só o dono de teste e os ids")
    try:
        B.sql_apagar_linhas("public", [["anamneses", FALSO]], eu)
        o.ok(False, "a limpeza recusa outro schema que não o staging")
    except SystemExit:
        o.ok(True, "a limpeza recusa outro schema que não o staging")
    o.ok(B.sql_contar_marca("staging", rodada).count(" as ") == 18, "a conferência final conta a marca nas 18 tabelas (só leitura)")
    o.ok(set(EDITAR_EXCLUIR) == {e for e, *_ in pedidos_de_criar(rodada, pac)}, "toda entidade criada na rodada tem o editar e o excluir")


# ───────────────────────── a rodada no staging ─────────────────────────
class Rodada:
    def __init__(self, o, L, estado: B.Estado, rodada: str) -> None:
        self.o, self.L, self.e, self.rodada = o, L, estado, rodada
        self.s = B.schema()
        self.tp, self.tn = L.token(B.P_CONTA), L.token(B.N1_CONTA)
        self.up, self.un = L.uid(B.P_CONTA), L.uid(B.N1_CONTA)
        self.pac = B17_matricula()
        self.tempos: dict[str, list[int]] = {}
        self.ids: dict[str, str] = {}

    def chamar(self, token: str, acao: str, corpo: dict) -> tuple[int, dict]:
        st, r, _h, ms = B.funcao(token, acao, corpo)
        self.tempos.setdefault(acao, []).append(ms)
        return st, r

    def linha(self, tabela: str, id_: str, colunas: str) -> dict | None:
        r = B.B17.ler(f"select {colunas} from {self.s}.{tabela} where id = {C.txt(C.uuid_ok(id_))}")
        return r[0] if r else None


def B17_matricula() -> str:
    return B.B17.matricula_da_aluna()


def caso_p(R: Rodada) -> None:
    o, s = R.o, R.s
    for entidade, acao, corpo, col in pedidos_de_criar(R.rodada, R.pac):
        st, r = R.chamar(R.tp, acao, corpo)
        linha = r.get("linha") if isinstance(r.get("linha"), dict) else {}
        id_ = linha.get("id")
        if entidade == "gestacao" and st == 409:
            o.ok(r.get("erro") == "conflito", "P gestacao_criar: a aluna já tem uma gestação ativa → 409 conflito (o registro do dia fica de fora)")
            continue
        if not o.ok(st == 200 and C.eh_uuid(id_), f"P {acao} → 200 com a linha ({st} {r.get('erro')})"):
            continue
        tabela = EDITAR_EXCLUIR[entidade][0]
        R.e.linha(tabela, id_)
        R.ids[entidade] = id_
        db = R.linha(tabela, id_, f"nutricionista_id::text as dono, {col} as marca, deleted_at is null as viva") or {}
        o.ok(db.get("dono") == R.up and R.rodada in str(db.get("marca")) and db.get("viva"), f"P {acao}: a linha no banco (dono = quem chama, viva)")
        _t, ae, _m, ax = EDITAR_EXCLUIR[entidade]
        st, r = R.chamar(R.tp, ae, corpo_de_editar(entidade, corpo, id_))
        o.ok(st == 200 and (r.get("linha") or {}).get("id") == id_, f"P {ae} → 200 com a linha ({st} {r.get('erro')})")
        if entidade == "gestacao":
            caso_registro_do_dia(R, id_)
            st, r = R.chamar(R.tp, "gestacao_encerrar", {"id": id_})
            o.ok(st == 200 and (r.get("linha") or {}).get("encerrada_em"), f"P gestacao_encerrar → 200, encerrada pelo servidor ({st})")
        if entidade == "avaliacao_integrada":
            o.ok(linha.get("data") and abs(dt.datetime.fromisoformat(str(linha["data"]).replace("Z", "+00:00")).timestamp() - time.time()) < 600,
                 "P avaliacao_integrada_criar: a data é o agora do servidor")
            st, r = R.chamar(R.tp, "avaliacao_integrada_regerar", {"id": id_, "sintese": {"teste": 2}, "fontes": {"x": 1}})
            o.ok(st == 200 and (r.get("linha") or {}).get("sintese") == {"teste": 2}, f"P avaliacao_integrada_regerar → 200 ({st})")
        if entidade == "consulta":
            o.ok((R.linha("consultas", id_, "origem") or {}).get("origem") == "manual", "P consulta_criar: origem 'manual' (do servidor)")
        st, r = R.chamar(R.tp, ax, {"id": id_})
        db = R.linha(tabela, id_, "deleted_at is not null as lixeira") or {}
        o.ok(st == 200 and db.get("lixeira"), f"P {ax} → 200 e a linha vai à Lixeira ({st})")
        st, r = R.chamar(R.tp, ae, corpo_de_editar(entidade, corpo, FALSO))
        o.ok(st == 404 and r.get("erro") == "nao_encontrado", f"P {ae} de um id que não existe → 404 nao_encontrado ({st})")
    caso_resultados(R)
    caso_interacao_do_sistema(R)
    caso_anexo(R)
    caso_padroes(R)


def caso_registro_do_dia(R: Rodada, gestacao: str) -> None:
    o, m = R.o, f"{B.MARCA} {R.rodada}"
    corpo = {"gestacao_id": gestacao, "paciente_id": R.pac, "data": hoje(), "peso": 62, "pa_sistolica": None, "pa_diastolica": None,
             "observacao": f"{m} registro"}
    st, r = R.chamar(R.tp, "registro_gestacional_salvar", corpo)
    reg = r.get("registro") if isinstance(r.get("registro"), dict) else {}
    if o.ok(st == 200 and r.get("criado") is True and C.eh_uuid(reg.get("id")), f"P registro_gestacional_salvar (1º do dia) → criado ({st})"):
        R.e.linha("registros_gestacionais", reg["id"])
    st, r2 = R.chamar(R.tp, "registro_gestacional_salvar", {**corpo, "peso": 62.5})
    o.ok(st == 200 and r2.get("criado") is False and (r2.get("registro") or {}).get("id") == reg.get("id"),
         "P registro_gestacional_salvar (mesmo dia) → a MESMA linha editada (criado: false)")
    st, _ = R.chamar(R.tp, "registro_gestacional_editar", {"id": reg.get("id"), "peso": 63})
    o.ok(st == 200, f"P registro_gestacional_editar → 200 ({st})")
    st, _ = R.chamar(R.tp, "registro_gestacional_excluir", {"id": reg.get("id")})
    o.ok(st == 200, f"P registro_gestacional_excluir → 200 ({st})")


def caso_resultados(R: Rodada) -> None:
    o, m = R.o, f"{B.MARCA} {R.rodada}"
    linhas = [{"exame": f"{m} r1", "valor": 1.5, "valor_texto": "", "unidade": "mg/dL", "ref_min": 1, "ref_max": 2, "referencia_texto": ""},
              {"exame": f"{m} r2", "valor": None, "valor_texto": "negativo", "unidade": "", "ref_min": None, "ref_max": None, "referencia_texto": ""}]
    st, r = R.chamar(R.tp, "resultados_exame_criar", {"paciente_id": R.pac, "data": hoje(), "linhas": linhas})
    criados = [x for x in (r.get("linhas") or []) if isinstance(x, dict)]
    for x in criados:
        R.e.linha("resultados_exame", x.get("id"))
    o.ok(st == 200 and len(criados) == 2 and all(x.get("nutricionista_id") == R.up for x in criados), f"P resultados_exame_criar (lote de 2) → 2 linhas ({st})")
    if criados:
        st, _ = R.chamar(R.tp, "resultado_exame_editar", {"id": criados[0]["id"], "valor": 1.8})
        o.ok(st == 200, f"P resultado_exame_editar → 200 ({st})")
        for x in criados:
            st, _ = R.chamar(R.tp, "resultado_exame_excluir", {"id": x["id"]})
        o.ok(st == 200, f"P resultado_exame_excluir → 200 ({st})")


def caso_interacao_do_sistema(R: Rodada) -> None:
    r = B.B17.ler(f"select id::text as id, updated_at::text as em from {R.s}.interacoes_farmaco_nutriente where nutricionista_id is null "
                  "and deleted_at is null order by id limit 1")
    if not r:
        R.o.ok(True, "P interação do sistema: nenhuma no schema (pulado)")
        return
    st, resp = R.chamar(R.tp, "interacao_editar", {"id": r[0]["id"], "conduta": "não pode"})
    depois = B.B17.ler(f"select updated_at::text as em from {R.s}.interacoes_farmaco_nutriente where id = {C.txt(r[0]['id'])}")
    R.o.ok(st == 404 and resp.get("erro") == "nao_encontrado" and depois and depois[0]["em"] == r[0]["em"],
           f"P interacao_editar de uma do SISTEMA → 404 e a linha não muda ({st})")


def caso_anexo(R: Rodada) -> None:
    o, s = R.o, R.s
    conteudo = f"{B.MARCA} {R.rodada} — arquivo de teste".encode()
    st, link, _h, ms = B.funcao(R.tp, "anexo_preparar", pedido_de_anexo(R.rodada, R.pac, len(conteudo)))
    R.tempos.setdefault("anexo_preparar", []).append(ms)
    caminho = str(link.get("caminho") or "")
    if not o.ok(st == 200 and link.get("bucket") == B.bucket_dos_anexos(s) and caminho.startswith(f"{R.up}/{R.pac}/") and link.get("token"),
                f"P anexo_preparar → 200 com o link assinado no bucket do ambiente e o caminho na pasta de quem chama ({st} {link.get('erro')})"):
        return
    R.e.objeto(link["bucket"], caminho)
    st_put = B.subir_no_link(link["bucket"], caminho, link["token"], conteudo, "text/plain", R.tp)
    o.ok(st_put in (200, 201), f"P o PUT no link assinado → {st_put}")
    st, r = R.chamar(R.tp, "anexo_registrar", {**pedido_de_anexo(R.rodada, R.pac, len(conteudo)), "caminho": caminho, "descricao": f"{B.MARCA} {R.rodada}"})
    linha = r.get("linha") or {}
    if o.ok(st == 200 and linha.get("path") == caminho and linha.get("nutricionista_id") == R.up, f"P anexo_registrar → 200 com a linha ({st} {r.get('erro')})"):
        R.e.linha("anexos", linha["id"])
    obj = B.B17.ler(f"select count(*)::int as n from storage.objects where bucket_id = {C.txt(link['bucket'])} and name = {C.txt(caminho)}")
    o.ok(obj and obj[0]["n"] == 1, "P o arquivo está no bucket, naquele caminho")
    st, r = R.chamar(R.tp, "anexo_editar", {"id": linha.get("id"), "descricao": f"{B.MARCA} {R.rodada} editada"})
    o.ok(st == 200 and str((r.get("linha") or {}).get("descricao", "")).endswith("editada"), f"P anexo_editar → 200 ({st})")
    st, r = R.chamar(R.tp, "anexo_excluir", {"id": linha.get("id")})
    db = R.linha("anexos", linha["id"], "deleted_at is not null as lixeira") if linha.get("id") else {}
    obj = B.B17.ler(f"select count(*)::int as n from storage.objects where bucket_id = {C.txt(link['bucket'])} and name = {C.txt(caminho)}")
    o.ok(st == 200 and (db or {}).get("lixeira") and obj and obj[0]["n"] == 0, f"P anexo_excluir → a linha na Lixeira e o arquivo FORA do bucket ({st})")
    if obj and obj[0]["n"] == 0:
        R.e.d["storage"] = [x for x in R.e.d["storage"] if x[1] != caminho]
        R.e.salvar()


def caso_padroes(R: Rodada) -> None:
    for secao, tabela in (("anamnese", "modelos_anamnese"), ("documento", "modelos_documento"), ("exame", "exames_catalogo")):
        antes = B.B17.ler(f"select count(*)::int as n from {R.s}.{tabela} where nutricionista_id = {C.txt(R.up)} and deleted_at is null")[0]["n"]
        st, r = R.chamar(R.tp, "padroes_garantir", {"secao": secao})
        depois = B.B17.ler(f"select count(*)::int as n from {R.s}.{tabela} where nutricionista_id = {C.txt(R.up)} and deleted_at is null")[0]["n"]
        # quem já tem próprio não ganha outro; quem não tinha ganha 1 conjunto — o mesmo que a tela faria ao abrir (a trava é o N8)
        ok_qtd = (depois == antes and r.get("criados") == 0) if antes > 0 else (depois == r.get("criados") and depois > 0)
        R.o.ok(st == 200 and isinstance(r.get("lista"), list) and len(r["lista"]) >= depois and ok_qtd,
               f"P padroes_garantir ({secao}) → 200 com a lista; próprios vivos {antes} → {depois} (criados {r.get('criados')})")


def caso_n1(R: Rodada) -> None:
    o, m = R.o, f"{B.MARCA} {R.rodada}"
    st, r = R.chamar(R.tn, "anamnese_criar", {"paciente_id": R.pac, "modelo_id": None, "titulo": f"{m} N1", "data": agora(), "conteudo": [], "texto_livre": None})
    if r.get("linha"):
        R.e.linha("anamneses", r["linha"].get("id"))
    o.ok(st == 403 and r.get("erro") == "sem_acesso", f"N1 outra conta: anamnese_criar para a aluna → 403 sem_acesso ({st})")
    st, r = R.chamar(R.tn, "consulta_criar", {"paciente_id": R.pac, "data": agora(), "observacao": f"{m} N1"})
    o.ok(st == 403, f"N1 outra conta: consulta_criar → 403 ({st})")
    # a linha da P (criada aqui e apagada no fim) não muda
    st, r = R.chamar(R.tp, "anamnese_criar", {"paciente_id": R.pac, "modelo_id": None, "titulo": f"{m} alvo N1", "data": agora(), "conteudo": [], "texto_livre": None})
    alvo = (r.get("linha") or {}).get("id")
    if not o.ok(st == 200 and C.eh_uuid(alvo), "N1 a linha-alvo da P criada"):
        return
    R.e.linha("anamneses", alvo)
    st, r = R.chamar(R.tn, "anamnese_editar", {"id": alvo, "titulo": "invadida"})
    db = R.linha("anamneses", alvo, "titulo, deleted_at is null as viva") or {}
    o.ok(st == 404 and db.get("titulo") == f"{m} alvo N1", f"N1 editar a anamnese da P → 404 e a linha não muda ({st})")
    st, r = R.chamar(R.tn, "anamnese_excluir", {"id": alvo})
    db = R.linha("anamneses", alvo, "deleted_at is null as viva") or {}
    o.ok(st == 404 and db.get("viva") is True, f"N1 excluir a anamnese da P → 404 e a linha segue viva ({st})")
    st, r = R.chamar(R.tn, "anexo_preparar", pedido_de_anexo(R.rodada, R.pac, 10))
    o.ok(st == 403 and r.get("erro") == "sem_acesso", f"N1 anexo_preparar na pasta da aluna → 403 sem_acesso ({st})")
    R.chamar(R.tp, "anamnese_excluir", {"id": alvo})


def caso_n2_n3_n6(R: Rodada) -> None:
    o = R.o
    st, _r, _h, _ms = B.funcao(None, "anamnese_criar", {"paciente_id": R.pac}, sem_auth=True)
    o.ok(st == 401, f"N2 sem login → 401 ({st})")
    st, _r, _h, _ms = B.funcao("eyJhbGciOiJIUzI1NiJ9.e30.token-falso-de-teste", "anamnese_criar", {"paciente_id": R.pac})
    o.ok(st == 401, f"N2 token falso → 401 ({st})")
    st, r, _h, _ms = B.funcao(R.tp, "apagar_tudo", {})
    o.ok(st == 400 and r.get("erro") == "acao_invalida", f"N3 ação desconhecida → 400 acao_invalida ({st})")
    st, r, _h, _ms = B.funcao(R.tp, "anamnese_excluir", {"id": FALSO}, schema_="producao")
    o.ok(st == 400 and r.get("erro") == "schema_invalido", f"N6 x-schema inválido → 400 schema_invalido ({st})")


def caso_n4_n5(R: Rodada) -> None:
    o, m = R.o, f"{B.MARCA} {R.rodada}"
    st, r = R.chamar(R.tp, "anamnese_criar", {"paciente_id": R.pac, "modelo_id": None, "titulo": f"{m} N4", "data": agora(), "conteudo": [],
                                              "texto_livre": None, "nutricionista_id": R.un})
    id_n4 = (r.get("linha") or {}).get("id")
    if C.eh_uuid(id_n4):
        R.e.linha("anamneses", id_n4)
    db = R.linha("anamneses", id_n4, "nutricionista_id::text as dono") if C.eh_uuid(id_n4) else {}
    o.ok(st == 200 and (db or {}).get("dono") == R.up, f"N4 nutricionista_id de outra pessoa no corpo → ignorado: o dono é quem chama ({st})")
    falso_id = "55555555-5555-4555-8555-555555555555"
    st, r = R.chamar(R.tp, "consulta_criar", {"paciente_id": R.pac, "data": agora(), "observacao": f"{m} N5", "origem": "importacao",
                                              "deleted_at": "2020-01-01T00:00:00Z", "id": falso_id})
    id_ = (r.get("linha") or {}).get("id")
    if C.eh_uuid(id_):
        R.e.linha("consultas", id_)
    db = R.linha("consultas", id_, "origem, deleted_at is null as viva") if C.eh_uuid(id_) else {}
    o.ok(st == 200 and id_ != falso_id and (db or {}).get("origem") == "manual" and (db or {}).get("viva"),
         f"N5 coluna fora da lista (origem, deleted_at, id) → ignorada ({st})")
    for acao, i in (("anamnese_excluir", id_n4), ("consulta_excluir", id_)):
        if C.eh_uuid(i):
            R.chamar(R.tp, acao, {"id": i})


def caso_n7() -> list[tuple[bool, str]]:
    st1, h1 = B.preflight(B.ORIGEM_FORA)
    st2, h2 = B.preflight(B.BASES["staging"])
    return [(st1 in (200, 204) and B.cors(h1) == B.ORIGEM_PADRAO, f"N7 origem fora da lista → o CORS devolve o padrão ({st1}, {B.cors(h1)})"),
            (st2 in (200, 204) and B.cors(h2) == B.BASES["staging"], f"N7 a origem do staging volta igual ({st2})")]


def caso_n8(R: Rodada) -> None:
    """2 padroes_garantir ao MESMO tempo → 1 conjunto só. A P fica sem modelo próprio de documento (os dela vão à Lixeira pela função
    e VOLTAM no fim — anotados no estado antes de mexer)."""
    o, s = R.o, R.s
    meus = [x["id"] for x in B.B17.ler(f"select id::text as id from {s}.modelos_documento where nutricionista_id = {C.txt(R.up)} and deleted_at is null")]
    R.e.d["n8"] = {"originais": meus, "criados": [], "desde": None}
    R.e.salvar()
    for i in meus:
        st, _ = R.chamar(R.tp, "modelo_documento_excluir", {"id": i})
        o.ok(st == 200, f"N8 preparo: modelo próprio à Lixeira ({st})", parar=True)
    desde = B.B17.ler("select now()::text as t")[0]["t"]
    R.e.d["n8"]["desde"] = desde
    R.e.salvar()
    respostas: list[tuple[int, dict]] = []

    def chamar() -> None:
        st, r, _h, _ms = B.funcao(R.tp, "padroes_garantir", {"secao": "documento"})
        respostas.append((st, r))
    t = [threading.Thread(target=chamar) for _ in range(2)]
    for x in t:
        x.start()
    for x in t:
        x.join(90)
    novos = [x["id"] for x in B.B17.ler(f"select id::text as id from {s}.modelos_documento where nutricionista_id = {C.txt(R.up)} "
                                         f"and deleted_at is null and created_at >= {C.txt(desde)}::timestamptz")]
    R.e.d["n8"]["criados"] = novos
    R.e.salvar()
    criados = sorted(int(r.get("criados") or 0) for _st, r in respostas)
    o.ok(len(respostas) == 2 and all(st == 200 for st, _ in respostas) and criados == [0, 3] and len(novos) == 3,
         f"N8 2 padroes_garantir juntos → 1 conjunto só (criados {criados}; vivos novos {len(novos)})")


def desfazer_n8(o, estado: B.Estado, dono: str, s: str) -> None:
    n8 = estado.d.get("n8")
    if not n8:
        return
    if s != "staging":
        raise SystemExit("o N8 só roda no staging")
    C.uuid_ok(dono)
    novos = [i for i in n8.get("criados") or [] if C.eh_uuid(i)]
    if not novos and n8.get("desde"):
        novos = [x["id"] for x in B.B17.ler(f"select id::text as id from {s}.modelos_documento where nutricionista_id = {C.txt(dono)} "
                                             f"and created_at >= {C.txt(n8['desde'])}::timestamptz")]
    for sql in B.sql_apagar_linhas(s, [["modelos_documento", i] for i in novos], dono):
        C.C2.sql_principal(sql)
    originais = [i for i in n8.get("originais") or [] if C.eh_uuid(i)]
    if originais:
        C.C2.sql_principal(f"update {s}.modelos_documento set deleted_at = null where nutricionista_id = {C.txt(dono)} "
                           f"and id = any(array[{', '.join(C.txt(i) for i in originais)}]::uuid[])")
    vivos = B.B17.ler(f"select count(*)::int as n from {s}.modelos_documento where nutricionista_id = {C.txt(dono)} and deleted_at is null")[0]["n"]
    o.ok(vivos == len(originais) or (not originais and vivos >= 0), f"N8 desfeito: os {len(originais)} modelos da P de volta; os {len(novos)} do teste fora")
    estado.d["n8"] = None
    estado.salvar()


def caso_n9(R: Rodada) -> None:
    o = R.o
    outro = f"{R.un}/{R.pac}/{FALSO}-hml19-e2e-{R.rodada}.txt"
    st, r = R.chamar(R.tp, "anexo_registrar", {**pedido_de_anexo(R.rodada, R.pac, 10), "caminho": outro})
    o.ok(st == 403 and r.get("erro") == "fora_da_pasta", f"N9 registrar com o caminho de OUTRA pessoa → 403 fora_da_pasta ({st})")
    meu_sem_arquivo = f"{R.up}/{R.pac}/{FALSO}-hml19-e2e-{R.rodada}.txt"
    st, r = R.chamar(R.tp, "anexo_registrar", {**pedido_de_anexo(R.rodada, R.pac, 10), "caminho": meu_sem_arquivo})
    o.ok(st == 400 and r.get("erro") == "anexo_nao_enviado", f"N9 o caminho certo sem o arquivo → 400 anexo_nao_enviado ({st})")


def caso_lixeira(R: Rodada) -> None:
    """LX: o excluir pela função manda a anamnese para a Lixeira de verdade (a lixeira_da_conta mostra), e as RPCs da Lixeira (W26)
    restauram e apagam de vez o que a função excluiu."""
    o, m = R.o, f"{B.MARCA} {R.rodada} lixeira"
    conta = B.B17.ler(f"select conta_id::text as c from {R.s}.pacientes where id = {C.txt(R.pac)}")[0]["c"]
    st, r = R.chamar(R.tp, "anamnese_criar", {"paciente_id": R.pac, "modelo_id": None, "titulo": m, "data": agora(), "conteudo": [], "texto_livre": None})
    id_ = (r.get("linha") or {}).get("id")
    if not o.ok(st == 200 and C.eh_uuid(id_), f"LX a anamnese da Lixeira criada ({st})"):
        return
    R.e.linha("anamneses", id_)

    def na_lixeira() -> bool:
        st_l, lx = B.B17.rpc(R.tp, "lixeira_da_conta", {"p_conta": conta, "p_tipo": "anamnese", "p_busca": R.rodada, "p_offset": 0, "p_limite": 20})
        texto = json.dumps(lx) if isinstance(lx, (dict, list)) else str(lx)
        return st_l == 200 and id_ in texto

    st, _ = R.chamar(R.tp, "anamnese_excluir", {"id": id_})
    o.ok(st == 200 and na_lixeira(), f"LX excluída pela nutricao → está na lixeira_da_conta ({st})")
    st, rr = B.B17.rpc(R.tp, "lixeira_restaurar", {"p_tipo": "anamnese", "p_id": id_})
    viva = (R.linha("anamneses", id_, "deleted_at is null as viva") or {}).get("viva")
    o.ok(st == 200 and isinstance(rr, dict) and rr.get("ok") is True and viva, f"LX lixeira_restaurar → a anamnese volta viva ({st}, {C.resumo(rr)})")
    st, _ = R.chamar(R.tp, "anamnese_excluir", {"id": id_})
    st2, ra = B.B17.rpc(R.tp, "lixeira_apagar", {"p_tipo": "anamnese", "p_id": id_})
    sumiu = not B.B17.ler(f"select 1 as x from {R.s}.anamneses where id = {C.txt(id_)}")
    o.ok(st == 200 and st2 == 200 and isinstance(ra, dict) and ra.get("ok") is True and sumiu,
         f"LX excluída de novo e apagada de vez pela Lixeira → a linha some ({st}, {st2}, {C.resumo(ra)})")


def limpar(o, estado: B.Estado, L, s: str) -> None:
    """Desfaz o que a rodada criou (linhas por id, arquivos pelo Storage como a dona, o N8) e confere por SQL só leitura."""
    if estado.vazio():
        o.ok(True, "limpeza: nada pendente no estado")
        estado.apagar()
        return
    dono = L.uid(B.P_CONTA)
    desfazer_n8(o, estado, dono, s)
    if estado.d["storage"]:
        token = L.token(B.P_CONTA)
        for bucket in sorted({b for b, _c in estado.d["storage"]}):
            caminhos = [c for b, c in estado.d["storage"] if b == bucket]
            st, n = B.remover_do_storage(bucket, caminhos, token)
            o.ok(st == 200, f"limpeza: {len(caminhos)} arquivo(s) tirados do {bucket} como a dona ({st}, {n} removidos)")
        estado.d["storage"] = []
        estado.salvar()
    for sql in B.sql_apagar_linhas(s, estado.d["linhas"], dono):
        C.C2.sql_principal(sql)
    rodada = estado.d.get("rodada")
    sobra = B.B17.ler(B.sql_contar_marca(s, rodada))[0] if rodada else {}
    o.ok(rodada and not any(sobra.values()), f"limpeza conferida (SQL só leitura): 0 linha com a marca da rodada nas 18 tabelas ({sum(sobra.values()) if sobra else '?'})")
    objs = B.B17.ler(f"select count(*)::int as n from storage.objects where bucket_id = {C.txt(B.bucket_dos_anexos(s))} "
                     f"and name like {C.txt(dono + '/%hml19-e2e-' + str(rodada) + '%')}")
    o.ok(objs and objs[0]["n"] == 0, "limpeza conferida: 0 arquivo da rodada no bucket")
    estado.apagar()


def so_leitura(o, L, base: str = "prod") -> None:
    """SÓ LEITURA (produção ou staging): nada grava — a função recusa antes de qualquer banco (CORS, sem login, x-schema inválido,
    ação desconhecida). No staging, o token é o da nutri de TESTE (a sessão guardada); na produção, o da conta de teste da produção."""
    st1, h1 = B.preflight(B.ORIGEM_FORA)
    o.ok(st1 in (200, 204) and B.cors(h1) == B.ORIGEM_PADRAO, f"{base} N7: origem fora da lista → o CORS padrão ({st1})")
    st, _r, _h, _ms = B.funcao(None, "anamnese_criar", {}, sem_auth=True, origem=B.BASES[base])
    o.ok(st == 401, f"{base} N2: sem login → 401 ({st})")
    token = L.token(B.PROD_CONTA if base == "prod" else B.P_CONTA)
    st, r, _h, _ms = B.funcao(token, "anamnese_excluir", {"id": FALSO}, schema_="producao", origem=B.BASES[base])
    o.ok(st == 400 and r.get("erro") == "schema_invalido", f"{base} N6: x-schema inválido → 400 ({st})")
    st, r, _h, _ms = B.funcao(token, "apagar_tudo", {}, origem=B.BASES[base])
    o.ok(st == 400 and r.get("erro") == "acao_invalida", f"{base} N3: ação desconhecida → 400 acao_invalida ({st})")


def producao(o, L) -> None:
    so_leitura(o, L, "prod")


def modo_da_execucao(base: str, so_leit: bool, limpar: bool) -> str:
    """O que a execução faz: so_leitura (prod OU staging: só as 4 checagens que não gravam) · limpar · rodada (a bateria que GRAVA a
    massa, só no staging). Produção sem --so-leitura → recusa."""
    if so_leit:
        return "so_leitura"
    if base == "prod":
        raise SystemExit("produção só com --so-leitura")
    return "limpar" if limpar else "rodada"


def seco_execucao(o) -> None:
    """--seco: o --so-leitura no staging NÃO roda a bateria (o incidente de 11/10 07:50) e o corte vira SystemExit (a limpeza roda)."""
    o.ok(modo_da_execucao("staging", True, False) == "so_leitura" and modo_da_execucao("prod", True, False) == "so_leitura"
         and modo_da_execucao("staging", False, False) == "rodada" and modo_da_execucao("staging", False, True) == "limpar",
         "o --so-leitura vale no staging e na produção (só as 4 checagens que não gravam); sem ele, no staging, a rodada ou o --limpar")
    try:
        modo_da_execucao("prod", False, False)
        o.ok(False, "produção sem --so-leitura é recusada")
    except SystemExit:
        o.ok(True, "produção sem --so-leitura é recusada")
    r = B.regras([("apagar_tudo", {}), ("dieta_apagar_tudo", {})])
    o.ok(all(not x["ok"] and x["erro"] == "acao_invalida" and x["modulo"] is None for x in r["conferidos"]),
         "as ações do --so-leitura são desconhecidas do servidor (recusa antes de qualquer banco)")
    import signal  # noqa: PLC0415
    import subprocess  # noqa: PLC0415
    prova = ("import sys, signal, os, time; sys.path.insert(0, %r); import _base as B; B.corte_vira_saida()\n"
             "try:\n    os.kill(os.getpid(), signal.SIGTERM); time.sleep(5)\nfinally:\n    print('LIMPEZA RODOU')") % str(B.AQUI)
    r2 = subprocess.run([sys.executable, "-c", prova], capture_output=True, text=True, timeout=60)
    o.ok("LIMPEZA RODOU" in r2.stdout and r2.returncode != 0 and signal.SIGTERM.name in r2.stderr,
         f"o SIGTERM vira SystemExit e o finally (a limpeza) roda (saída {r2.returncode})")


CASOS_DA_AREA = {"prontuario": CASOS, "dieta": AD.CASOS_DIETA, "aluno": AD.CASOS_ALUNO, "avaliacao": AA.CASOS_AVALIACAO}
# o módulo de cada área (o seco, o so_leitura e o limpar de cada uma)
SECO = {"dieta": AD.seco, "aluno": AD.seco, "avaliacao": AA.seco}
SO_LEITURA = {"dieta": AD.so_leitura, "aluno": AD.so_leitura, "avaliacao": AA.so_leitura}


def rodar_prontuario(o, L, estado: B.Estado, rodada: str, casos: list[str]) -> None:
    R = Rodada(o, L, estado, rodada)
    o.linha(f"rodada {rodada} · schema {R.s} · aluna (matrícula) {R.pac[:8]}… · casos {','.join(casos)}")
    for nome, f in (("P", caso_p), ("N1", caso_n1), ("N4", caso_n4_n5), ("N8", caso_n8), ("N9", caso_n9), ("LX", caso_lixeira)):
        if nome in casos or (nome == "N4" and "N5" in casos):
            f(R)
    if {"N2", "N3", "N6"} & set(casos):
        caso_n2_n3_n6(R)
    if "N7" in casos:
        for ok, texto in caso_n7():
            o.ok(ok, texto)
    tempos = {k: f"{min(v)}–{max(v)} ms (n={len(v)})" for k, v in sorted(R.tempos.items())}
    o.linha(f"tempos por ação: {tempos}")


def limpar_da_area(o, estado: B.Estado, L, s: str) -> None:
    """O --limpar desfaz a rodada da área que está no estado (a da hml-19a não tinha área: o Prontuário)."""
    area = estado.d.get("area") or "prontuario"
    if area in ("dieta", "aluno"):
        AD.limpar(o, estado, L, s)
    elif area == "avaliacao":
        AA.limpar(o, estado, L, s)
    else:
        limpar(o, estado, L, s)


def main() -> int:
    ap = argparse.ArgumentParser(description="hml-19a/19b/19c — E2E de servidor da nutricao e da foto mensal (casos no topo, em api_dieta.py e em api_avaliacao.py)")
    ap.add_argument("--area", required=True, choices=tuple(CASOS_DA_AREA))
    ap.add_argument("--base", default="staging", choices=("staging", "prod"))
    ap.add_argument("--casos", default=None, help="padrão: todos os da área")
    modo = ap.add_mutually_exclusive_group()
    modo.add_argument("--seco", action="store_true")
    modo.add_argument("--limpar", action="store_true")
    modo.add_argument("--so-leitura", action="store_true")
    modo.add_argument("--sair", action="store_true")
    a = ap.parse_args()
    B.corte_vira_saida()  # o SIGTERM/SIGINT vira SystemExit: o finally da limpeza roda mesmo com o processo cortado
    validos = CASOS_DA_AREA[a.area]
    casos = [c.strip() for c in (a.casos or ",".join(validos)).split(",") if c.strip()]
    if any(c not in validos for c in casos):
        raise SystemExit(f"caso desconhecido na área {a.area} (os casos: {', '.join(validos)})")
    if a.seco:
        o = C.Saida(f"api_{a.area}_seco")
        SECO.get(a.area, seco)(o, a.area)
        seco_execucao(o)
        return o.fim()  # o --seco não vai ao e2e-rodadas (não é prova contra uma base)
    if a.sair:
        o = C.Saida("sessoes_sair")
        B.Sessoes("sair").sair(o)
        return o.fim()
    modo_exec = modo_da_execucao(a.base, a.so_leitura, a.limpar)
    s = B.usar_base(a.base)
    o = C.Saida(f"api_{a.area}_{a.base}" + {"limpar": "_limpar", "so_leitura": "_so_leitura"}.get(modo_exec, ""))
    # o motivo termina na base (o prod_f8.py conta os logins da produção pelas linhas que terminam em "prod)")
    L = B.Sessoes(f"api {a.area}" + {"limpar": " --limpar", "so_leitura": " --so-leitura"}.get(modo_exec, "") + f" {a.base}")
    try:
        B.exigir_saude(o, "o api.py")
        if modo_exec == "so_leitura":
            SO_LEITURA.get(a.area, so_leitura)(o, L, a.base)
        elif modo_exec == "limpar":
            limpar_da_area(o, B.Estado.ler(), L, s)
        else:
            pendente = B.Estado.ler()
            if not pendente.vazio():
                o.ok(False, f"há uma rodada que caiu no meio (área {pendente.d.get('area') or 'prontuario'}): rode --limpar antes", parar=True)
            rodada = B.nova_rodada()
            estado = B.Estado({"rodada": rodada, "schema": s, "area": a.area, "linhas": [], "storage": [], "n8": None})
            estado.salvar()
            try:
                if a.area == "prontuario":
                    rodar_prontuario(o, L, estado, rodada, casos)
                elif a.area == "avaliacao":
                    AA.rodar(o, L, estado, rodada, casos)
                else:
                    AD.rodar(o, L, estado, rodada, a.area, casos)
            finally:
                limpar_da_area(o, estado, L, s)
    except (Exception, SystemExit) as e:  # noqa: BLE001
        o.ok(False, f"parou no meio: {type(e).__name__}: {str(e)[:300]}")
    finally:
        L.fechar(o)
    C.C2.registrar_rodada(o.oks, o.oks + o.falhas)
    return o.fim()


if __name__ == "__main__":
    raise SystemExit(main())
