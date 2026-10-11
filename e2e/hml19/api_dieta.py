"""Physiq hml-19b (H-41 · jeito 2 · decisão 14, 11/10/2026) — os casos de SERVIDOR da Dieta, das Dietas e do app do aluno (o api.py chama:
--area dieta | aluno). O mesmo molde da área do Prontuário (api.py): a foto do estado, --limpar, --seco; massa "hml19 e2e <rodada> …" SÓ
no schema staging, SÓ nas contas de TESTE (P = w5p-nutri, a nutri da w5p-aluna; N1 = w13-dono, de OUTRA conta; A = w5p-aluna, o app);
o que a rodada cria vai para o estado (agente/e2e_estado.json, com a área) e sai no fim: as linhas por id (DELETE no staging, só do
dono de teste, na ordem das FKs; as filhas — refeições, itens, medidas, ingredientes, as marcações do aluno — saem com o pai em
cascata), os arquivos do diário pelo Storage (como a nutri dona da pasta) e o N8 desfeito.

--area dieta (a nutri)
  P   cada ação das 19 tabelas pela função, conferida por SQL só leitura: o cálculo energético; o plano novo com as 6 refeições (1 chamada)
      e o cálculo; título/meta/★; refeição e item (criar/editar/excluir — o item volta com o alimento); o lote "Da receita"; o
      subir/descer (dieta_ordenar); o "copiar pra semana toda"; o duplicar (a cópia é de quem chama, com o cálculo) e o usar modelo ★
      (sem o cálculo); o registro do dia (criado → o mesmo dia vira edição); produto e indicações (+ ordenar); manipulados, metas,
      orientações (os modelos e os do aluno); o alimento com as medidas (editar TROCA as medidas; o da TACO → 404); o grupo (o nome
      repetido → 409) e a receita com os ingredientes (editar troca; excluir o grupo tira o grupo das receitas, junto); os padrões de
      fórmula/meta/orientação (quem já tem não ganha outro)
  N1  outra conta: criar plano/meta para a aluna → 403; editar/duplicar/ordenar o plano da P e editar a receita dela → 404 e nada muda
  N2  sem login → 401 · N3 ação desconhecida → 400 · N6 x-schema inválido → 400 · N7 origem fora da lista → o CORS padrão
  N4  nutricionista_id de outra pessoa no corpo → ignorado · N5 deleted_at/id no corpo → ignorados
  N8  2 dieta_ordenar ao MESMO tempo (permutações diferentes) → o resultado é o de UMA inteira; 2 padroes_garantir (fórmula) ao mesmo
      tempo, com a P sem modelo próprio (os dela vão à Lixeira e voltam no fim) → 1 conjunto só
--area aluno (o app; a massa é da P: um plano de teste com 1 refeição com alimento, 1 sem, e 1 meta de todos os dias)
  P   a aluna marca/desmarca a refeição e a meta pela função (as MESMAS RPCs de hoje): a linha do ✓ aparece e some; os códigos de
      propósito (sem_alimentos, data_invalida, meta_pausada) chegam como estão; a foto do diário pelo link assinado (preparar → PUT →
      enviar): a linha e o arquivo na pasta da matrícula — e o envio pelo app NÃO consome o balde do limite por IP (decisão da sessão
      principal); o link público (visitante, /d/:codigo) segue como hoje: sobe direto no bucket, chama a diario_enviar e CONTA no balde
      do IP; a nutri reage e exclui (a linha na Lixeira e o arquivo fora do bucket)
  N1  outra conta: marcar a refeição da aluna → 403; reagir à foto → 404
  N9  a foto registrada com o caminho de outra pasta → 403 fora_da_pasta; o caminho certo sem o arquivo → 400 arquivo_nao_encontrado
Produção (--base prod --so-leitura): as mesmas recusas do Prontuário (OPTIONS, 401, 400) com ações da Dieta — nada grava.
A imagem do diário é sintética (PNG 8 × 8 cinza, gerado aqui; nunca foto real). Da saída só saem status, códigos, contagens e tempos
(o código do link da aluna é lido por SQL só leitura e nunca impresso).
"""
from __future__ import annotations

import datetime as dt
import re
import struct
import threading
import time
import uuid
import zlib
from zoneinfo import ZoneInfo

import _base as B

C = B.C
FALSO = "00000000-0000-4000-8000-0000000000aa"
OUTRO = "44444444-4444-4444-8444-444444444444"
CASOS_DIETA = ("P", "N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8")
CASOS_ALUNO = ("P", "N1", "N9")
FUSO = ZoneInfo("America/Sao_Paulo")
DIETA_UTIL_TS = B.REPO / "src" / "nutricao" / "editor" / "lib" / "dietaUtil.ts"


def refeicoes_padrao_do_front() -> list[tuple[str, str]]:
    """As 6 refeições da nova prescrição, do PRÓPRIO front (dietaUtil.ts › REFEICOES_PADRAO): a rodada manda o mesmo que a tela."""
    texto = DIETA_UTIL_TS.read_text(encoding="utf-8")
    bloco = texto.split("export const REFEICOES_PADRAO", 1)[1].split("];", 1)[0]
    return re.findall(r'\{ nome: "([^"]+)", horario: "([^"]+)" \}', bloco)


def n_padrao_formula() -> int:
    """Quantos modelos de fórmula o padroes_garantir cria (nutricao-padroes.ts › MODELOS_FORMULA_PADRAO): o N8 espera 1 conjunto."""
    texto = B.PADROES_TS.read_text(encoding="utf-8")
    bloco = texto.split("export const MODELOS_FORMULA_PADRAO", 1)[1].split("\n];", 1)[0]
    return len(re.findall(r"^\s{4}titulo:", bloco, flags=re.M))


def hoje_sp() -> str:
    return dt.datetime.now(FUSO).date().isoformat()


def agora() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def png_sintetico(lado: int = 8) -> bytes:
    """Uma imagem PNG pequena gerada aqui (nunca foto real): `lado`×`lado`, cinza."""
    linha = b"\x00" + bytes([128, 128, 128]) * lado

    def bloco(tipo: bytes, dados: bytes) -> bytes:
        return struct.pack(">I", len(dados)) + tipo + dados + struct.pack(">I", zlib.crc32(tipo + dados) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n" + bloco(b"IHDR", struct.pack(">IIBBBBB", lado, lado, 8, 2, 0, 0, 0)) + bloco(b"IDAT", zlib.compress(linha * lado))
            + bloco(b"IEND", b""))


# ───────────────────────── os pedidos (puros: o --seco confere todos) ─────────────────────────
def refeicoes_padrao() -> list[dict]:
    return [{"nome": n, "horario": h, "ordem": i} for i, (n, h) in enumerate(refeicoes_padrao_do_front())]


def corpo_plano(m: str, pac: str, refeicoes: list[dict] | None = None, calculo: str | None = None) -> dict:
    return {"paciente_id": pac, "titulo": f"{m} plano", "kcal_alvo": 1800, "observacao": None, "calculo_energetico_id": calculo,
            "refeicoes": refeicoes_padrao() if refeicoes is None else refeicoes}


def item(ref: str, ali: str, ordem: int, gramas: float = 100) -> dict:
    return {"refeicao_id": ref, "alimento_id": ali, "ordem": ordem, "quantidade_g": gramas, "medida_caseira_id": None, "quantidade_medida": None,
            "observacao": None}


def corpo_calculo(m: str, pac: str | None = None) -> dict:
    c = {"data": agora(), "formula": "mifflin", "peso": 70, "altura": 170, "idade": 30, "sexo": "feminino", "massa_magra": None, "fator_atividade": 1.55,
         "atividades": [], "tmb": 1400, "get": 2170, "ajuste_kcal": -300, "vet": 1870, "objetivo": "emagrecer", "observacao": f"{m} cálculo"}
    return {"paciente_id": pac, **c} if pac else c


def corpo_produto(m: str) -> dict:
    return {"nome": f"{m} produto", "marca": "", "categoria": "suplemento", "apresentacao": "", "dose_padrao": "30 g", "modo_uso": "", "link": "",
            "observacao": "", "favorito": False}


def corpo_indicacao(m: str, pac: str, produto: str | None, n: int) -> dict:
    return {"paciente_id": pac, "produto_id": produto, "produto_nome": f"{m} indicação {n}", "produto_marca": "", "produto_apresentacao": "",
            "produto_categoria": "suplemento", "dose": "1 cápsula", "horario": "", "duracao": "", "inicio": hoje_sp(), "observacao": "", "ordem": 900 + n}


def corpo_alimento(m: str, kcal: float = 180) -> dict:
    return {"nome": f"{m} alimento", "grupo": "Teste", "porcao_g": 40, "energia_kcal": kcal, "proteina_g": 4, "carboidrato_g": 30, "lipidio_g": 5,
            "fibra_g": 3, "sodio_mg": 10, "marca": None, "nutrientes": {}}


def corpo_receita(m: str, grupo: str | None, nome: str = "receita") -> dict:
    return {"nome": f"{m} {nome}", "grupo_id": grupo, "porcoes": 2, "rendimento_g": 300, "tempo_preparo_min": 10, "modo_preparo": "teste",
            "observacao": "", "favorita": False}


def ingrediente(ali: str, gramas: float) -> dict:
    return {"alimento_id": ali, "quantidade_g": gramas, "medida_caseira_id": None, "quantidade_medida": None, "ordem": 0, "observacao": ""}


def corpo_meta(m: str, pac: str, titulo: str = "meta", dias: list[int] | None = None) -> dict:
    return {"paciente_id": pac, "modelo_id": None, "titulo": f"{m} {titulo}", "descricao": "", "dias_semana": dias or [1, 2, 3, 4, 5, 6, 7], "ativa": True}


def corpo_orientacao(m: str, pac: str, titulo: str = "orientação") -> dict:
    return {"paciente_id": pac, "modelo_id": None, "titulo": f"{m} {titulo}", "conteudo": "z"}


# as entidades do CRUD simples: (tabela, (ação de criar, corpo), (ação de editar, o que muda), ação de excluir, a coluna da marca)
def crud_simples(m: str, pac: str) -> list[tuple[str, tuple[str, dict], tuple[str, dict], str, str]]:
    return [
        ("modelos_formula", ("modelo_formula_criar", {"titulo": f"{m} modelo fórmula", "ativos": [{"ativo": "Mg", "dose": "300", "unidade": "mg"}],
                                                       "posologia": "", "quantidade": "", "observacao": "", "favorito": False}),
         ("modelo_formula_editar", {"favorito": True}), "modelo_formula_excluir", "titulo"),
        ("formulas_manipuladas", ("formula_criar", {"paciente_id": pac, "modelo_id": None, "titulo": f"{m} fórmula", "ativos": [], "posologia": "",
                                                    "quantidade": "", "observacao": ""}), ("formula_editar", {"posologia": "1 ao dia"}), "formula_excluir", "titulo"),
        ("modelos_meta", ("modelo_meta_criar", {"titulo": f"{m} modelo meta", "descricao": "", "dias_semana": [1, 2, 3, 4, 5, 6, 7], "favorito": False}),
         ("modelo_meta_editar", {"dias_semana": [6, 7]}), "modelo_meta_excluir", "titulo"),
        ("metas", ("meta_criar", corpo_meta(m, pac)), ("meta_editar", {"ativa": False}), "meta_excluir", "titulo"),
        ("modelos_orientacao", ("modelo_orientacao_criar", {"titulo": f"{m} modelo orientação", "conteudo": "## x", "favorito": False}),
         ("modelo_orientacao_editar", {"conteudo": "## y"}), "modelo_orientacao_excluir", "titulo"),
        ("orientacoes", ("orientacao_criar", corpo_orientacao(m, pac)), ("orientacao_editar", {"titulo": f"{m} orientação", "conteudo": "w"}),
         "orientacao_excluir", "titulo"),
    ]


def pedidos_dieta(rodada: str, pac: str) -> list[tuple[str, dict]]:
    """Todos os pedidos da área dieta na forma que vão (os ids de mentira no lugar dos que a rodada cria)."""
    m = f"{B.MARCA} {rodada}"
    F = FALSO
    L: list[tuple[str, dict]] = [
        ("calculo_energetico_criar", corpo_calculo(m, pac)), ("calculo_energetico_editar", {"id": F, "vet": 1900}),
        ("plano_criar", corpo_plano(m, pac, calculo=F)),
        ("plano_editar", {"id": F, "kcal_alvo": 1900, "favorito": True}),
        ("refeicao_criar", {"plano_id": F, "nome": "Lanche hml19", "horario": "15:00", "observacao": None, "ordem": 6}),
        ("refeicao_editar", {"id": F, "nome": "Lanche hml19 b", "horario": "15:30", "observacao": None, "dias_semana": [1]}),
        ("item_criar", item(F, F, 0)),
        ("itens_criar", {"linhas": [{**item(F, F, 1, 50), "receita_id": None}, {**item(F, F, 2, 70), "receita_id": None}]}),
        ("item_editar", {"id": F, "quantidade_g": 120, "medida_caseira_id": None, "quantidade_medida": None, "observacao": "x"}),
        ("item_editar", {"id": F, "substitutos": [{"alimento_id": F, "nome": "Substituto", "quantidade_g": 50}]}),
        ("dieta_ordenar", {"tabela": "refeicoes", "ordens": [{"id": F, "ordem": 1}, {"id": OUTRO, "ordem": 0}]}),
        ("plano_copiar_semana", {"para_todos": [F], "para_apagar": []}),
        ("plano_duplicar", {"plano_id": F, "titulo": f"{m} plano (cópia)"}),
        ("plano_duplicar", {"plano_id": F, "paciente_id": pac, "titulo": f"{m} modelo"}),
        ("item_excluir", {"id": F}), ("refeicao_excluir", {"id": F}), ("plano_excluir", {"id": F}), ("calculo_energetico_excluir", {"id": F}),
        ("registro_diario_salvar", {"paciente_id": pac, "data": "2001-01-01", "agua_ml": 1500, "sintomas": [], "observacao": f"{m} registro"}),
        ("registro_diario_editar", {"id": F, "data": "2001-01-01", "agua_ml": 2000, "sintomas": ["azia"], "observacao": f"{m} registro"}),
        ("registro_diario_excluir", {"id": F}),
        ("produto_criar", corpo_produto(m)), ("produto_editar", {"id": F, "favorito": True}),
        ("indicacao_criar", corpo_indicacao(m, pac, F, 1)), ("indicacao_criar", corpo_indicacao(m, pac, None, 2)),
        ("dieta_ordenar", {"tabela": "indicacoes_produto", "ordens": [{"id": F, "ordem": 901}, {"id": OUTRO, "ordem": 900}]}),
        ("indicacao_editar", {"id": F, "ativa": False}), ("indicacao_excluir", {"id": F}), ("produto_excluir", {"id": F}),
    ]
    for _t, criar, editar, excluir, _col in crud_simples(m, pac):
        L += [criar, (editar[0], {"id": F, **editar[1]}), (excluir, {"id": F})]
    L += [
        ("alimento_salvar", {"alimento": corpo_alimento(m), "medidas": [{"descricao": "colher", "gramas": 10, "ordem": 0},
                                                                        {"descricao": "xícara", "gramas": 80, "ordem": 1}]}),
        ("alimento_salvar", {"id": F, "alimento": corpo_alimento(m, 170), "medidas": [{"descricao": "colher", "gramas": 12, "ordem": 0}]}),
        ("alimento_excluir", {"id": F}),
        ("grupo_receita_criar", {"nome": f"{m} grupo"}), ("grupo_receita_editar", {"id": F, "nome": f"{m} grupo b"}),
        ("receita_salvar", {"receita": corpo_receita(m, F), "ingredientes": [ingrediente(F, 100), ingrediente(F, 50)]}),
        ("receita_salvar", {"id": F, "receita": corpo_receita(m, F), "ingredientes": [ingrediente(F, 80)]}),
        ("receita_editar", {"id": F, "favorita": True}), ("grupo_receita_excluir", {"id": F}), ("receita_excluir", {"id": F}),
    ]
    L += [("padroes_garantir", {"secao": s}) for s in ("formula", "meta", "orientacao")]
    return L


def pedido_foto(pac: str, nutri: str, tamanho: int) -> dict:
    return {"paciente_id": pac, "nutricionista_id": nutri, "tipo": "image/png", "tamanho": tamanho}


def corpo_envio(pac: str, nutri: str, tamanho: int, caminho: str, codigo: str, comentario: str) -> dict:
    return {**pedido_foto(pac, nutri, tamanho), "caminho": caminho, "codigo": codigo, "refeicao": "almoco", "comentario": comentario, "data_hora": agora()}


def pedidos_aluno(rodada: str, pac: str, nutri: str) -> list[tuple[str, dict]]:
    m = f"{B.MARCA} {rodada}"
    return [
        ("aluno_marcar_refeicao", {"refeicao_id": FALSO, "data": hoje_sp(), "concluida": True}),
        ("aluno_marcar_refeicao", {"refeicao_id": FALSO, "data": hoje_sp(), "concluida": False}),
        ("aluno_marcar_meta", {"meta_id": FALSO, "data": hoje_sp(), "concluida": True}),
        ("aluno_diario_preparar", pedido_foto(pac, nutri, 100)),
        ("aluno_diario_enviar", corpo_envio(pac, nutri, 100, f"{nutri}/{pac}/{uuid.uuid4()}.png", "codigo-de-teste", f"{m} app")),
        ("diario_reagir", {"id": FALSO, "reacao": "otimo", "comentario": m}),
        ("diario_excluir", {"id": FALSO}),
        # a massa do app (pela nutri): o plano de teste, o item e a meta (pausada no fim)
        ("plano_criar", corpo_plano(m, pac, [{"nome": "Almoço hml19", "horario": "12:00", "ordem": 0}, {"nome": "Ceia hml19", "horario": "21:00", "ordem": 1}])),
        ("item_criar", item(FALSO, FALSO, 0)), ("meta_criar", corpo_meta(m, pac)), ("meta_editar", {"id": FALSO, "ativa": False}),
    ]


# ───────────────────────── o --seco ─────────────────────────
def seco(o, area: str) -> None:
    rodada, pac, eu = "seco-0000", "11111111-1111-4111-8111-111111111111", "33333333-3333-4333-8333-333333333333"
    nutri = "55555555-5555-4555-8555-555555555555"
    r0 = B.regras([], eu)
    acoes_dieta, acoes_aluno = set(r0["acoes_dieta"]), set(r0["acoes_aluno"])
    o.ok(len(acoes_dieta) == 53 and len(acoes_aluno) == 4 and len(r0["tabelas_dieta"]) == 19,
         f"as regras do servidor lidas do TS: {len(acoes_dieta)} ações da Dieta, {len(acoes_aluno)} do app, {len(r0['tabelas_dieta'])} tabelas")
    o.ok(B.TABELAS_DIETA == set(r0["tabelas_dieta"]) and set(B.ORDEM_LIMPEZA_DIETA) == B.TABELAS_DIETA - B.DIETA_SEM_DONO,
         "as 19 tabelas da Dieta da contagem são as do servidor; a ordem da limpeza cobre as 15 com dono")
    o.ok(len(refeicoes_padrao()) == 6 and refeicoes_padrao()[0]["nome"] == "Café da manhã", "as 6 refeições da nova prescrição lidas do front (dietaUtil.ts)")
    o.ok(n_padrao_formula() == 3, f"o conjunto padrão de fórmulas lido do servidor ({n_padrao_formula()} modelos)")
    # as 2 áreas juntas passam por TODAS as ações da Dieta e do app
    pd, pa = pedidos_dieta(rodada, pac), pedidos_aluno(rodada, pac, nutri)
    feitas = {a for a, _ in pd} | {a for a, _ in pa}
    faltam = sorted((acoes_dieta | acoes_aluno) - feitas)
    o.ok(not faltam, f"as áreas dieta + aluno passam por TODAS as {len(acoes_dieta)} + {len(acoes_aluno)} ações" + (f" — faltam {faltam}" if faltam else ""))
    pedidos = pd if area == "dieta" else pa
    r = B.regras(pedidos, eu)
    ruins = [f"{x['acao']} ({x['erro']} {x['campo'] or ''})" for x in r["conferidos"] if not x["ok"]]
    o.ok(not ruins, f"os {len(pedidos)} pedidos da rodada ({area}) passam nas regras do servidor" + (f" — recusados: {ruins}" if ruins else ""))
    fora = sorted({x["acao"] for x in r["conferidos"] if x["modulo"] not in ("dieta", "aluno")})
    o.ok(not fora, "todos vão ao módulo certo da função (dieta.ts/aluno.ts), nenhum ao do Prontuário" + (f" — {fora}" if fora else ""))
    if area == "dieta":
        n = B.regras([("dieta_apagar_tudo", {}), ("meta_criar", {**corpo_meta("x", pac), "nutricionista_id": OUTRO}),
                      ("orientacao_criar", {**corpo_orientacao("x", pac), "deleted_at": "2020-01-01T00:00:00Z", "id": OUTRO})], eu)
        c3, c4, c5 = n["conferidos"]
        o.ok(not c3["ok"] and c3["erro"] == "acao_invalida" and c3["modulo"] is None, "N3 nas regras: ação desconhecida → acao_invalida (nenhum módulo)")
        o.ok(c4["ok"] and c4["valores"]["nutricionista_id"] == eu, "N4 nas regras: o nutricionista_id do corpo cai; o dono é quem chama")
        o.ok(c5["ok"] and "deleted_at" not in c5["valores"] and "id" not in c5["valores"], "N5 nas regras: deleted_at/id do corpo caem")
        ordem = B.regras([("dieta_ordenar", {"tabela": "alimentos", "ordens": [{"id": FALSO, "ordem": 1}]})], eu)["conferidos"][0]
        o.ok(not ordem["ok"] and ordem["campo"] == "tabela", "o dieta_ordenar só aceita as tabelas da lista (refeições e indicações)")
        sqls = B.sql_apagar_linhas("staging", [["alimentos", FALSO], ["refeicoes", FALSO], ["receitas", FALSO], ["planos_alimentares", FALSO]], eu)
        o.ok(len(sqls) == 3 and not any(".refeicoes " in s for s in sqls) and "planos_alimentares" in sqls[0] and ".alimentos " in sqls[-1],
             "a limpeza: as tabelas com dono por id, na ordem das FKs (o plano e a receita antes do alimento; as filhas saem com o pai)")
        o.ok(B.sql_contar_marca_dieta("staging", rodada).count(" as ") == 15, "a conferência final conta a marca nas 15 tabelas da Dieta com dono (só leitura)")
    else:
        fora_pasta = B.regras([("aluno_diario_enviar", corpo_envio(pac, nutri, 100, f"{OUTRO}/{pac}/{uuid.uuid4()}.png", "x", ""))], eu)["conferidos"][0]
        o.ok(not fora_pasta["ok"] and fora_pasta["erro"] == "fora_da_pasta", "N9 nas regras: a foto com o caminho de outra pasta → fora_da_pasta")
        tipo = B.regras([("aluno_diario_preparar", {**pedido_foto(pac, nutri, 100), "tipo": "application/pdf"})], eu)["conferidos"][0]
        o.ok(not tipo["ok"] and tipo["erro"] == "tipo_invalido", "o preparar só aceita as imagens do bucket (pdf → tipo_invalido)")
        png = png_sintetico()
        o.ok(png[:8] == b"\x89PNG\r\n\x1a\n" and len(png) < 200, f"a imagem de teste é sintética e pequena ({len(png)} bytes)")


# ───────────────────────── a rodada no staging ─────────────────────────
class RodadaDieta:
    def __init__(self, o, L, estado: B.Estado, rodada: str, area: str) -> None:
        self.o, self.L, self.e, self.rodada, self.area = o, L, estado, rodada, area
        self.s = B.schema()
        self.m = f"{B.MARCA} {rodada}"
        self.tp, self.tn = L.token(B.P_CONTA), L.token(B.N1_CONTA)
        self.up, self.un = L.uid(B.P_CONTA), L.uid(B.N1_CONTA)
        self.pac = B.B17.matricula_da_aluna()
        self.tempos: dict[str, list[int]] = {}

    def chamar(self, token: str, acao: str, corpo: dict) -> tuple[int, dict]:
        st, r, _h, ms = B.funcao(token, acao, corpo)
        self.tempos.setdefault(acao, []).append(ms)
        return st, r

    def ler(self, sql: str) -> list[dict]:
        return B.B17.ler(sql)

    def um(self, sql: str):
        r = self.ler(sql)
        return next(iter(r[0].values())) if r else None

    def guardar(self, tabela: str, linha: object) -> str | None:
        id_ = linha.get("id") if isinstance(linha, dict) else None
        if C.eh_uuid(id_):
            self.e.linha(tabela, id_)
            return id_
        return None

    def objeto(self, bucket: str, caminho: str) -> None:
        """O arquivo vai ao estado (o --limpar tira) e à lista da rodada (a conferência final: 0 arquivo da rodada no bucket)."""
        self.e.objeto(bucket, caminho)
        todos = self.e.d.setdefault("storage_rodada", [])
        if [bucket, caminho] not in todos:
            todos.append([bucket, caminho])
            self.e.salvar()

    def objeto_saiu(self, bucket: str, caminho: str) -> None:
        self.e.d["storage"] = [x for x in self.e.d["storage"] if x != [bucket, caminho]]
        self.e.salvar()


def alimento_taco(R: RodadaDieta) -> str:
    r = R.ler(f"select id::text as id from {R.s}.alimentos where fonte = 'taco' and deleted_at is null order by nome limit 1")
    if not r:
        raise SystemExit("nenhum alimento da TACO no schema")
    return C.uuid_ok(r[0]["id"])


def _crud(R: RodadaDieta, tabela: str, criar: tuple[str, dict], editar: tuple[str, dict], conferir: str) -> str | None:
    """criar → conferir o dono e a marca por SQL → editar; o chamador decide quando excluir."""
    o, s = R.o, R.s
    st, r = R.chamar(R.tp, *criar)
    id_ = R.guardar(tabela, r.get("linha"))
    if not o.ok(st == 200 and id_, f"P {criar[0]} → 200 com a linha ({st} {r.get('erro')})"):
        return None
    db = R.ler(f"select nutricionista_id::text as dono, {conferir}::text as marca from {s}.{tabela} where id = {C.txt(id_)}")[0]
    o.ok(db["dono"] == R.up and R.rodada in str(db["marca"]), f"P {criar[0]}: a linha no banco (o dono é quem chama, a marca)")
    st, r = R.chamar(R.tp, editar[0], {"id": id_, **editar[1]})
    o.ok(st == 200 and (r.get("linha") or {}).get("id") == id_, f"P {editar[0]} → 200 ({st} {r.get('erro')})")
    return id_


def _excluir(R: RodadaDieta, tabela: str, acao: str, id_: str | None) -> None:
    if not id_:
        return
    st, _ = R.chamar(R.tp, acao, {"id": id_})
    R.o.ok(st == 200 and R.um(f"select deleted_at is not null from {R.s}.{tabela} where id = {C.txt(id_)}"), f"P {acao} → a Lixeira ({st})")


def caso_p_dieta(R: RodadaDieta) -> None:
    o, s, m = R.o, R.s, R.m
    taco = alimento_taco(R)
    calc = _crud(R, "calculos_energeticos", ("calculo_energetico_criar", corpo_calculo(m, R.pac)), ("calculo_energetico_editar", {"vet": 1900}), "observacao")
    # o plano novo: 1 chamada, as 6 refeições padrão (e o cálculo), o dono é quem chama
    st, r = R.chamar(R.tp, "plano_criar", corpo_plano(m, R.pac, calculo=calc))
    plano = R.guardar("planos_alimentares", r.get("plano"))
    refs = sorted([x for x in (r.get("refeicoes") or []) if isinstance(x, dict)], key=lambda x: x.get("ordem", 0))
    if not o.ok(st == 200 and plano and len(refs) == 6, f"P plano_criar → 200 com o plano e as 6 refeições padrão (1 chamada) ({st} {r.get('erro')})"):
        _excluir(R, "calculos_energeticos", "calculo_energetico_excluir", calc)
        return
    db = R.ler(f"select nutricionista_id::text as dono, metodo, calculo_energetico_id::text as calc, "
               f"(select count(*) from {s}.refeicoes x where x.plano_id = p.id)::int as n from {s}.planos_alimentares p where id = {C.txt(plano)}")[0]
    o.ok(db["dono"] == R.up and db["metodo"] == "alimentos" and db["n"] == 6 and db["calc"] == calc,
         "P o plano no banco: o dono é quem chama, método 'alimentos', 6 refeições, o cálculo ligado")
    st, r = R.chamar(R.tp, "plano_editar", {"id": plano, "kcal_alvo": 1900, "favorito": True})
    o.ok(st == 200 and float((r.get("linha") or {}).get("kcal_alvo") or 0) == 1900 and (r.get("linha") or {}).get("favorito") is True,
         f"P plano_editar (meta e ★) → 200 ({st})")
    # refeição e itens
    st, r = R.chamar(R.tp, "refeicao_criar", {"plano_id": plano, "nome": "Lanche hml19", "horario": "15:00", "observacao": None, "ordem": 6})
    lanche = (r.get("linha") or {}).get("id")
    o.ok(st == 200 and C.eh_uuid(lanche), f"P refeicao_criar → 200 ({st} {r.get('erro')})")
    st, r = R.chamar(R.tp, "refeicao_editar", {"id": lanche, "nome": "Lanche hml19 b", "horario": "15:30", "observacao": None, "dias_semana": [1]})
    o.ok(st == 200 and (r.get("linha") or {}).get("dias_semana") == [1], f"P refeicao_editar (dias da semana) → 200 ({st})")
    r0, r1 = refs[0]["id"], refs[1]["id"]
    st, r = R.chamar(R.tp, "item_criar", item(r0, taco, 0))
    it = r.get("linha") or {}
    o.ok(st == 200 and C.eh_uuid(it.get("id")) and (it.get("alimento") or {}).get("id") == taco, f"P item_criar → 200, o item volta com o alimento ({st})")
    st, r = R.chamar(R.tp, "itens_criar", {"linhas": [{**item(r1, taco, 1, 50), "receita_id": None}, {**item(r1, taco, 2, 70), "receita_id": None}]})
    o.ok(st == 200 and len(r.get("linhas") or []) == 2, f"P itens_criar (o lote 'Da receita', 2 itens) → 2 itens numa chamada ({st})")
    st, r = R.chamar(R.tp, "item_editar", {"id": it.get("id"), "quantidade_g": 120, "medida_caseira_id": None, "quantidade_medida": None, "observacao": "x"})
    o.ok(st == 200 and float((r.get("linha") or {}).get("quantidade_g") or 0) == 120, f"P item_editar → 200 ({st})")
    st, r = R.chamar(R.tp, "item_editar", {"id": it.get("id"), "substitutos": [{"alimento_id": taco, "nome": "Substituto", "quantidade_g": 50}]})
    o.ok(st == 200 and len((r.get("linha") or {}).get("substitutos") or []) == 1, f"P item_editar (substitutos) → 200 ({st})")
    # subir/descer: 1 chamada, tudo ou nada
    st, r = R.chamar(R.tp, "dieta_ordenar", {"tabela": "refeicoes", "ordens": [{"id": r0, "ordem": 1}, {"id": r1, "ordem": 0}]})
    ordens = {x["id"]: x["o"] for x in R.ler(f"select id::text as id, ordem as o from {s}.refeicoes where id = any(array[{C.txt(r0)}, {C.txt(r1)}]::uuid[])")}
    o.ok(st == 200 and r.get("n") == 2 and ordens == {r0: 1, r1: 0}, f"P dieta_ordenar (refeições) → as 2 ordens trocadas numa chamada ({st} {ordens})")
    st, r = R.chamar(R.tp, "plano_copiar_semana", {"para_todos": [lanche], "para_apagar": []})
    dias = R.um(f"select dias_semana::text from {s}.refeicoes where id = {C.txt(lanche)}")
    o.ok(st == 200 and r.get("atualizadas") == 1 and dias == "{}", f"P plano_copiar_semana → a refeição vale todos os dias ({st} {dias})")
    # duplicar (a cópia é de quem chama, com o cálculo) e usar modelo ★ (o título do modelo, sem o cálculo)
    st, r = R.chamar(R.tp, "plano_duplicar", {"plano_id": plano, "titulo": f"{m} plano (cópia)"})
    copia_linha = r.get("plano") if isinstance(r.get("plano"), dict) else {}
    copia = R.guardar("planos_alimentares", copia_linha)
    if o.ok(st == 200 and copia and len(copia_linha.get("refeicoes") or []) == 7, f"P plano_duplicar → 200 com a cópia montada (7 refeições) ({st})"):
        cmp_ = R.ler(f"select (select count(*) from {s}.itens_refeicao i join {s}.refeicoes x on x.id = i.refeicao_id where x.plano_id = {C.txt(plano)})::int as a, "
                     f"(select count(*) from {s}.itens_refeicao i join {s}.refeicoes x on x.id = i.refeicao_id where x.plano_id = {C.txt(copia)})::int as b, "
                     f"(select nutricionista_id::text from {s}.planos_alimentares where id = {C.txt(copia)}) as dono, "
                     f"(select calculo_energetico_id::text from {s}.planos_alimentares where id = {C.txt(copia)}) as calc")[0]
        o.ok(cmp_["a"] == cmp_["b"] == 3 and cmp_["dono"] == R.up and cmp_["calc"] == calc,
             f"P a cópia: os mesmos 3 itens, o dono é quem chama, o mesmo cálculo ({cmp_['a']}/{cmp_['b']})")
    st, r = R.chamar(R.tp, "plano_duplicar", {"plano_id": plano, "paciente_id": R.pac, "titulo": f"{m} modelo"})
    modelo_linha = r.get("plano") if isinstance(r.get("plano"), dict) else {}
    modelo = R.guardar("planos_alimentares", modelo_linha)
    o.ok(st == 200 and modelo and modelo_linha.get("calculo_energetico_id") is None and modelo_linha.get("titulo") == f"{m} modelo",
         f"P usar modelo ★ (plano_duplicar com o aluno) → o título do modelo, sem o cálculo ({st})")
    for acao, corpo in (("item_excluir", {"id": it.get("id")}), ("refeicao_excluir", {"id": lanche})):
        st, _ = R.chamar(R.tp, acao, corpo)
        st2, r2 = R.chamar(R.tp, acao, corpo)
        o.ok(st == 200 and st2 == 404 and r2.get("erro") == "nao_encontrado", f"P {acao} (DELETE físico) → 200; de novo → 404 ({st}, {st2})")
    for p in (plano, copia, modelo):
        _excluir(R, "planos_alimentares", "plano_excluir", p)
    _excluir(R, "calculos_energeticos", "calculo_energetico_excluir", calc)
    caso_registro_diario(R)
    caso_suplementos(R)
    for tabela, criar, editar, excluir, col in crud_simples(m, R.pac):
        _excluir(R, tabela, excluir, _crud(R, tabela, criar, editar, col))
    caso_alimento(R, taco)
    caso_receita(R, taco)
    caso_padroes_dieta(R)


def caso_registro_diario(R: RodadaDieta) -> None:
    o, s, m = R.o, R.s, R.m
    # um dia sem registro vivo da aluna (o salvar EDITA o vivo do dia: nunca um dia com dado de verdade) — em 2001, pelo código da rodada
    dia = None
    base = int(re.sub(r"[^0-9a-f]", "", R.rodada)[-4:] or "0", 16) % 300
    for k in range(40):
        d = (dt.date(2001, 1, 1) + dt.timedelta(days=base + k)).isoformat()
        if R.um(f"select count(*)::int from {s}.registros_diarios where paciente_id = {C.txt(R.pac)} and data = {C.txt(d)} and deleted_at is null") == 0:
            dia = d
            break
    if not o.ok(dia is not None, "P registro do dia: um dia sem registro vivo da aluna (para não editar dado de verdade)"):
        return
    corpo = {"paciente_id": R.pac, "data": dia, "agua_ml": 1500, "sintomas": [], "observacao": f"{m} registro"}
    st, r = R.chamar(R.tp, "registro_diario_salvar", corpo)
    reg = R.guardar("registros_diarios", r.get("registro"))
    o.ok(st == 200 and r.get("criado") is True and reg, f"P registro_diario_salvar (1º do dia) → criado ({st} {r.get('erro')})")
    st, r2 = R.chamar(R.tp, "registro_diario_salvar", {**corpo, "agua_ml": 1800})
    o.ok(st == 200 and r2.get("criado") is False and (r2.get("registro") or {}).get("id") == reg, "P registro_diario_salvar (mesmo dia) → a MESMA linha editada")
    st, _ = R.chamar(R.tp, "registro_diario_editar", {"id": reg, "data": dia, "agua_ml": 2000, "sintomas": ["azia"], "observacao": f"{m} registro"})
    o.ok(st == 200 and R.um(f"select agua_ml from {s}.registros_diarios where id = {C.txt(reg)}") == 2000, f"P registro_diario_editar → 200 ({st})")
    _excluir(R, "registros_diarios", "registro_diario_excluir", reg)


def caso_suplementos(R: RodadaDieta) -> None:
    o, s, m = R.o, R.s, R.m
    prod = _crud(R, "produtos", ("produto_criar", corpo_produto(m)), ("produto_editar", {"favorito": True}), "nome")
    inds = []
    for n in (1, 2):
        st, r = R.chamar(R.tp, "indicacao_criar", corpo_indicacao(m, R.pac, prod if n == 1 else None, n))
        i = R.guardar("indicacoes_produto", r.get("linha"))
        o.ok(st == 200 and i and (r.get("linha") or {}).get("ativa") is True and (r.get("linha") or {}).get("nutricionista_id") == R.up,
             f"P indicacao_criar {n} → 200, nasce ativa, o dono é quem chama ({st})")
        inds.append(i)
    if all(inds):
        st, r = R.chamar(R.tp, "dieta_ordenar", {"tabela": "indicacoes_produto", "ordens": [{"id": inds[0], "ordem": 901}, {"id": inds[1], "ordem": 900}]})
        ordens = {x["id"]: x["o"] for x in R.ler(f"select id::text as id, ordem as o from {s}.indicacoes_produto "
                                                 f"where id = any(array[{C.txt(inds[0])}, {C.txt(inds[1])}]::uuid[])")}
        o.ok(st == 200 and ordens == {inds[0]: 901, inds[1]: 900}, f"P dieta_ordenar (indicações) → as ordens trocadas ({st})")
        st, r = R.chamar(R.tp, "indicacao_editar", {"id": inds[0], "ativa": False})
        o.ok(st == 200 and (r.get("linha") or {}).get("ativa") is False, f"P indicacao_editar (encerrar) → 200 ({st})")
    for i in inds:
        _excluir(R, "indicacoes_produto", "indicacao_excluir", i)
    _excluir(R, "produtos", "produto_excluir", prod)


def caso_alimento(R: RodadaDieta, taco: str) -> None:
    o, m = R.o, R.m
    st, r = R.chamar(R.tp, "alimento_salvar", {"alimento": corpo_alimento(m), "medidas": [{"descricao": "colher", "gramas": 10, "ordem": 0},
                                                                                       {"descricao": "xícara", "gramas": 80, "ordem": 1}]})
    linha = r.get("linha") if isinstance(r.get("linha"), dict) else {}
    ali = R.guardar("alimentos", linha)
    o.ok(st == 200 and ali and linha.get("fonte") == "proprio" and linha.get("nutricionista_id") == R.up and len(linha.get("medidas_caseiras") or []) == 2,
         f"P alimento_salvar (novo) → o alimento próprio com as 2 medidas (1 chamada) ({st} {r.get('erro')})")
    if not ali:
        return
    st, r = R.chamar(R.tp, "alimento_salvar", {"id": ali, "alimento": corpo_alimento(m, 170), "medidas": [{"descricao": "colher", "gramas": 12, "ordem": 0}]})
    med = (r.get("linha") or {}).get("medidas_caseiras") or []
    o.ok(st == 200 and len(med) == 1 and float((r.get("linha") or {}).get("energia_kcal") or 0) == 170, f"P alimento_salvar (editar) → as medidas TROCADAS ({st}, {len(med)})")
    antes = R.um(f"select count(*)::int from {R.s}.medidas_caseiras where alimento_id = {C.txt(taco)}")
    st, r = R.chamar(R.tp, "alimento_salvar", {"id": taco, "alimento": {"nome": "não pode"}, "medidas": []})
    depois = R.um(f"select count(*)::int from {R.s}.medidas_caseiras where alimento_id = {C.txt(taco)}")
    o.ok(st == 404 and r.get("erro") == "nao_encontrado" and antes == depois, f"P editar um alimento da TACO → 404 e as medidas dele não mudam ({st}, {antes} → {depois})")
    _excluir(R, "alimentos", "alimento_excluir", ali)
    st, r = R.chamar(R.tp, "alimento_excluir", {"id": ali})
    o.ok(st == 404, f"P alimento_excluir de novo (já na Lixeira) → 404 ({st})")


def caso_receita(R: RodadaDieta, taco: str) -> None:
    o, s, m = R.o, R.s, R.m
    st, r = R.chamar(R.tp, "grupo_receita_criar", {"nome": f"{m} grupo"})
    grupo = R.guardar("grupos_receita", r.get("linha"))
    o.ok(st == 200 and grupo, f"P grupo_receita_criar → 200 ({st} {r.get('erro')})")
    st, r = R.chamar(R.tp, "grupo_receita_criar", {"nome": f"{m} grupo"})
    R.guardar("grupos_receita", r.get("linha"))
    o.ok(st == 409 and r.get("erro") == "conflito", f"P o mesmo nome de grupo → 409 conflito ({st})")
    st, r = R.chamar(R.tp, "grupo_receita_editar", {"id": grupo, "nome": f"{m} grupo b"})
    o.ok(st == 200, f"P grupo_receita_editar → 200 ({st})")
    st, r = R.chamar(R.tp, "receita_salvar", {"receita": corpo_receita(m, grupo), "ingredientes": [ingrediente(taco, 100), ingrediente(taco, 50)]})
    rec = R.guardar("receitas", r.get("linha"))
    ings = (r.get("linha") or {}).get("ingredientes") or []
    o.ok(st == 200 and rec and sorted(i.get("ordem") for i in ings) == [0, 1] and all((i.get("alimento") or {}).get("id") == taco for i in ings),
         f"P receita_salvar (nova) → a receita com os 2 ingredientes e o alimento de cada um (1 chamada) ({st} {r.get('erro')})")
    if not rec:
        return
    st, r = R.chamar(R.tp, "receita_salvar", {"id": rec, "receita": corpo_receita(m, grupo), "ingredientes": [ingrediente(taco, 80)]})
    o.ok(st == 200 and len((r.get("linha") or {}).get("ingredientes") or []) == 1, f"P receita_salvar (editar) → os ingredientes TROCADOS ({st})")
    st, r = R.chamar(R.tp, "receita_editar", {"id": rec, "favorita": True})
    o.ok(st == 200 and (r.get("linha") or {}).get("favorita") is True and "ingredientes" in (r.get("linha") or {}), f"P receita_editar (★) → a receita montada ({st})")
    st, r = R.chamar(R.tp, "grupo_receita_excluir", {"id": grupo})
    sem_grupo = R.um(f"select grupo_id is null from {s}.receitas where id = {C.txt(rec)}")
    lixeira = R.um(f"select deleted_at is not null from {s}.grupos_receita where id = {C.txt(grupo)}")
    o.ok(st == 200 and r.get("receitas") == 1 and sem_grupo and lixeira, f"P grupo_receita_excluir → o grupo na Lixeira e a receita sem grupo, juntos ({st})")
    _excluir(R, "receitas", "receita_excluir", rec)


def caso_padroes_dieta(R: RodadaDieta) -> None:
    for secao, tabela in (("formula", "modelos_formula"), ("meta", "modelos_meta"), ("orientacao", "modelos_orientacao")):
        antes = R.um(f"select count(*)::int from {R.s}.{tabela} where nutricionista_id = {C.txt(R.up)} and deleted_at is null")
        st, r = R.chamar(R.tp, "padroes_garantir", {"secao": secao})
        depois = R.um(f"select count(*)::int from {R.s}.{tabela} where nutricionista_id = {C.txt(R.up)} and deleted_at is null")
        # quem já tem próprio não ganha outro; quem não tinha ganha 1 conjunto — o mesmo que a tela faria ao abrir (a trava é o N8)
        ok_qtd = (depois == antes and r.get("criados") == 0) if antes > 0 else (depois == r.get("criados") and depois > 0)
        R.o.ok(st == 200 and isinstance(r.get("lista"), list) and len(r["lista"]) >= depois and ok_qtd,
               f"P padroes_garantir ({secao}) → 200 com a lista; próprios vivos {antes} → {depois} (criados {r.get('criados')})")


def caso_n1_dieta(R: RodadaDieta) -> None:
    o, s, m = R.o, R.s, R.m
    st, r = R.chamar(R.tn, "plano_criar", corpo_plano(f"{m} N1", R.pac))
    R.guardar("planos_alimentares", r.get("plano"))
    o.ok(st == 403 and r.get("erro") == "sem_acesso", f"N1 outra conta: plano_criar para a aluna → 403 sem_acesso ({st} {r.get('erro')})")
    st, r = R.chamar(R.tn, "meta_criar", corpo_meta(f"{m} N1", R.pac))
    R.guardar("metas", r.get("linha"))
    o.ok(st == 403, f"N1 outra conta: meta_criar para a aluna → 403 ({st})")
    st, r = R.chamar(R.tp, "plano_criar", corpo_plano(f"{m} alvo N1", R.pac))
    alvo = R.guardar("planos_alimentares", r.get("plano"))
    refs = [x["id"] for x in sorted(r.get("refeicoes") or [], key=lambda x: x.get("ordem", 0))]
    if not o.ok(st == 200 and alvo and len(refs) == 6, "N1 o plano-alvo da P criado"):
        return
    st, r = R.chamar(R.tn, "plano_editar", {"id": alvo, "titulo": "invadido"})
    titulo = R.um(f"select titulo from {s}.planos_alimentares where id = {C.txt(alvo)}")
    o.ok(st == 404 and titulo == f"{m} alvo N1 plano", f"N1 editar o plano da P → 404 e o título não muda ({st})")
    st, r = R.chamar(R.tn, "plano_duplicar", {"plano_id": alvo, "titulo": "cópia invasora"})
    R.guardar("planos_alimentares", r.get("plano"))
    o.ok(st == 404 and r.get("erro") == "nao_encontrado", f"N1 duplicar o plano da P → 404 (o RLS esconde o plano) ({st})")
    st, r = R.chamar(R.tn, "dieta_ordenar", {"tabela": "refeicoes", "ordens": [{"id": refs[0], "ordem": 5}, {"id": refs[5], "ordem": 0}]})
    ordens = [x["o"] for x in R.ler(f"select ordem as o from {s}.refeicoes where plano_id = {C.txt(alvo)} order by ordem")]
    o.ok(st == 404 and ordens == [0, 1, 2, 3, 4, 5], f"N1 ordenar as refeições da P → 404 e nada muda ({st})")
    st, r = R.chamar(R.tp, "receita_salvar", {"receita": corpo_receita(m, None, "alvo N1"), "ingredientes": []})
    rec = R.guardar("receitas", r.get("linha"))
    if rec:
        st, r = R.chamar(R.tn, "receita_salvar", {"id": rec, "receita": {"nome": "invadida"}, "ingredientes": []})
        nome = R.um(f"select nome from {s}.receitas where id = {C.txt(rec)}")
        o.ok(st == 404 and nome == f"{m} alvo N1", f"N1 editar a receita da P → 404 e nada muda ({st})")
        R.chamar(R.tp, "receita_excluir", {"id": rec})
    R.chamar(R.tp, "plano_excluir", {"id": alvo})


def caso_n4_n5_dieta(R: RodadaDieta) -> None:
    o, s, m = R.o, R.s, R.m
    st, r = R.chamar(R.tp, "meta_criar", {**corpo_meta(m, R.pac, "N4"), "nutricionista_id": R.un})
    meta = R.guardar("metas", r.get("linha"))
    dono = R.um(f"select nutricionista_id::text from {s}.metas where id = {C.txt(meta)}") if meta else None
    o.ok(st == 200 and dono == R.up, f"N4 nutricionista_id de outra pessoa no corpo → ignorado: o dono é quem chama ({st})")
    falso_id = "55555555-5555-4555-8555-555555555555"
    st, r = R.chamar(R.tp, "orientacao_criar", {**corpo_orientacao(m, R.pac, "N5"), "deleted_at": "2020-01-01T00:00:00Z", "id": falso_id})
    ori = R.guardar("orientacoes", r.get("linha"))
    viva = R.um(f"select deleted_at is null from {s}.orientacoes where id = {C.txt(ori)}") if ori else None
    o.ok(st == 200 and ori != falso_id and viva, f"N5 deleted_at e id no corpo → ignorados ({st})")
    for acao, i in (("meta_excluir", meta), ("orientacao_excluir", ori)):
        if i:
            R.chamar(R.tp, acao, {"id": i})


def caso_n2_n3_n6_n7(R: RodadaDieta, casos: list[str]) -> None:
    o = R.o
    if "N2" in casos:
        st, _r, _h, _ms = B.funcao(None, "plano_criar", {"paciente_id": R.pac}, sem_auth=True)
        o.ok(st == 401, f"N2 sem login → 401 ({st})")
        st, _r, _h, _ms = B.funcao("eyJhbGciOiJIUzI1NiJ9.e30.token-falso-de-teste", "plano_criar", {"paciente_id": R.pac})
        o.ok(st == 401, f"N2 token falso → 401 ({st})")
    if "N3" in casos:
        st, r, _h, _ms = B.funcao(R.tp, "dieta_apagar_tudo", {})
        o.ok(st == 400 and r.get("erro") == "acao_invalida", f"N3 ação desconhecida → 400 acao_invalida ({st})")
        st, r, _h, _ms = B.funcao(R.tp, "padroes_garantir", {"secao": "receita"})
        o.ok(st == 400 and r.get("erro") == "secao_invalida", f"N3 seção de padrões desconhecida → 400 secao_invalida (o Prontuário responde, como antes) ({st})")
    if "N6" in casos:
        st, r, _h, _ms = B.funcao(R.tp, "plano_excluir", {"id": FALSO}, schema_="producao")
        o.ok(st == 400 and r.get("erro") == "schema_invalido", f"N6 x-schema inválido → 400 schema_invalido ({st})")
    if "N7" in casos:
        st1, h1 = B.preflight(B.ORIGEM_FORA)
        o.ok(st1 in (200, 204) and B.cors(h1) == B.ORIGEM_PADRAO, f"N7 origem fora da lista → o CORS devolve o padrão ({st1})")


def caso_n8_dieta(R: RodadaDieta) -> None:
    """2 dieta_ordenar ao MESMO tempo (permutações diferentes do mesmo plano) → o resultado é o de UMA inteira; e 2 padroes_garantir
    (fórmula) ao mesmo tempo, com a P sem modelo próprio (os dela vão à Lixeira e voltam no fim — anotados no estado antes) → 1 conjunto."""
    o, s, m = R.o, R.s, R.m
    st, r = R.chamar(R.tp, "plano_criar", corpo_plano(f"{m} N8", R.pac))
    plano = R.guardar("planos_alimentares", r.get("plano"))
    ids = [x["id"] for x in sorted(r.get("refeicoes") or [], key=lambda x: x.get("ordem", 0))]
    if o.ok(st == 200 and plano and len(ids) == 6, "N8 o plano de teste com 6 refeições"):
        perm_a, perm_b = [5, 4, 3, 2, 1, 0], [3, 4, 5, 0, 1, 2]
        respostas: list[int] = []

        def ordenar(perm: list[int]) -> None:
            st_, _r, _h, _ms = B.funcao(R.tp, "dieta_ordenar", {"tabela": "refeicoes", "ordens": [{"id": i, "ordem": p} for i, p in zip(ids, perm)]})
            respostas.append(st_)
        t = [threading.Thread(target=ordenar, args=(p,)) for p in (perm_a, perm_b)]
        for x in t:
            x.start()
        for x in t:
            x.join(90)
        lista = ", ".join(C.txt(i) for i in ids)
        final = [x["o"] for x in R.ler(f"select ordem as o from {s}.refeicoes where id = any(array[{lista}]::uuid[]) "
                                         f"order by array_position(array[{lista}]::uuid[], id)")]
        o.ok(respostas == [200, 200] and final in (perm_a, perm_b), f"N8 2 dieta_ordenar juntos → o resultado é o de UMA inteira ({respostas}, {final})")
        R.chamar(R.tp, "plano_excluir", {"id": plano})
    meus = [x["id"] for x in R.ler(f"select id::text as id from {s}.modelos_formula where nutricionista_id = {C.txt(R.up)} and deleted_at is null")]
    R.e.d["n8"] = {"tabela": "modelos_formula", "originais": meus, "criados": [], "desde": None}
    R.e.salvar()
    for i in meus:
        st, _ = R.chamar(R.tp, "modelo_formula_excluir", {"id": i})
        o.ok(st == 200, f"N8 preparo: modelo de fórmula próprio à Lixeira ({st})", parar=True)
    desde = R.um("select now()::text")
    R.e.d["n8"]["desde"] = desde
    R.e.salvar()
    resp: list[tuple[int, dict]] = []

    def garantir() -> None:
        st_, r_, _h, _ms = B.funcao(R.tp, "padroes_garantir", {"secao": "formula"})
        resp.append((st_, r_))
    t = [threading.Thread(target=garantir) for _ in range(2)]
    for x in t:
        x.start()
    for x in t:
        x.join(90)
    novos = [x["id"] for x in R.ler(f"select id::text as id from {s}.modelos_formula where nutricionista_id = {C.txt(R.up)} and deleted_at is null "
                                     f"and created_at >= {C.txt(desde)}::timestamptz")]
    R.e.d["n8"]["criados"] = novos
    R.e.salvar()
    criados = sorted(int(r_.get("criados") or 0) for _st, r_ in resp)
    n = n_padrao_formula()
    o.ok(len(resp) == 2 and all(st_ == 200 for st_, _ in resp) and criados == [0, n] and len(novos) == n,
         f"N8 2 padroes_garantir (fórmula) juntos → 1 conjunto só (criados {criados}; vivos novos {len(novos)} de {n})")


def desfazer_n8(o, estado: B.Estado, dono: str, s: str) -> None:
    n8 = estado.d.get("n8")
    if not n8 or n8.get("tabela") != "modelos_formula":
        return
    if s != "staging":
        raise SystemExit("o N8 só roda no staging")
    C.uuid_ok(dono)
    novos = [i for i in n8.get("criados") or [] if C.eh_uuid(i)]
    if not novos and n8.get("desde"):
        novos = [x["id"] for x in B.B17.ler(f"select id::text as id from {s}.modelos_formula where nutricionista_id = {C.txt(dono)} "
                                             f"and created_at >= {C.txt(n8['desde'])}::timestamptz")]
    for sql in B.sql_apagar_linhas(s, [["modelos_formula", i] for i in novos], dono):
        C.C2.sql_principal(sql)
    originais = [i for i in n8.get("originais") or [] if C.eh_uuid(i)]
    if originais:
        C.C2.sql_principal(f"update {s}.modelos_formula set deleted_at = null where nutricionista_id = {C.txt(dono)} "
                           f"and id = any(array[{', '.join(C.txt(i) for i in originais)}]::uuid[])")
    vivos = B.B17.ler(f"select count(*)::int as n from {s}.modelos_formula where nutricionista_id = {C.txt(dono)} and deleted_at is null")[0]["n"]
    o.ok(vivos == len(originais), f"N8 desfeito: os {len(originais)} modelos de fórmula da P de volta; os {len(novos)} do teste fora ({vivos} vivos)")
    estado.d["n8"] = None
    estado.salvar()


# ───────────────────────── o app do aluno ─────────────────────────
def balde_do_ip(R: RodadaDieta) -> tuple[int, str]:
    """O total do limite por IP da diario_enviar na hora corrente (todos os IPs; SQL só leitura) e a hora (a janela)."""
    r = R.ler(f"select coalesce(sum(n), 0)::int as n, date_trunc('hour', now())::text as h from {R.s}.publico_pedidos_ip "
              "where rota = 'diario_enviar' and janela = date_trunc('hour', now())")[0]
    return int(r["n"]), str(r["h"])


def longe_da_virada(R: RodadaDieta, folga_s: int = 60) -> None:
    """O balde do IP é por hora: perto da virada, espera a hora nova (antes × depois na MESMA janela)."""
    seg = int(R.um("select (extract(epoch from now())::bigint % 3600)::int") or 0)
    if seg > 3600 - folga_s:
        time.sleep(3600 - seg + 3)


def massa_do_app(R: RodadaDieta, taco: str) -> dict | None:
    """O plano de TESTE da aluna (da P): 1 refeição com alimento, 1 sem; e 1 meta de todos os dias (a massa marcada, limpa no fim)."""
    o, m = R.o, R.m
    st, r = R.chamar(R.tp, "plano_criar", corpo_plano(m, R.pac, [{"nome": "Almoço hml19", "horario": "12:00", "ordem": 0},
                                                              {"nome": "Ceia hml19", "horario": "21:00", "ordem": 1}]))
    plano = R.guardar("planos_alimentares", r.get("plano"))
    refs = sorted(r.get("refeicoes") or [], key=lambda x: x.get("ordem", 0))
    if not o.ok(st == 200 and plano and len(refs) == 2, f"massa do app: o plano de teste da aluna (da P) ({st} {r.get('erro')})", parar=True):
        return None
    st, _ = R.chamar(R.tp, "item_criar", item(refs[0]["id"], taco, 0))
    st2, r2 = R.chamar(R.tp, "meta_criar", corpo_meta(m, R.pac))
    meta = R.guardar("metas", r2.get("linha"))
    o.ok(st == 200 and st2 == 200 and meta, "massa do app: 1 refeição com alimento, 1 sem, e 1 meta de todos os dias", parar=True)
    return {"plano": plano, "com": refs[0]["id"], "sem": refs[1]["id"], "meta": meta}


def caso_p_aluno(R: RodadaDieta, massa: dict) -> None:
    o, s = R.o, R.s
    ta = R.L.token(B.A_CONTA)
    hoje = hoje_sp()
    st, r = R.chamar(ta, "aluno_marcar_refeicao", {"refeicao_id": massa["com"], "data": hoje, "concluida": True})
    n = R.um(f"select count(*)::int from {s}.refeicoes_concluidas where refeicao_id = {C.txt(massa['com'])} and data = {C.txt(hoje)}")
    o.ok(st == 200 and r.get("concluida") is True and n == 1, f"P a aluna marca a refeição pela função → a linha do ✓ ({st} {r.get('erro')}, {n})")
    st, r = R.chamar(ta, "aluno_marcar_refeicao", {"refeicao_id": massa["com"], "data": hoje, "concluida": False})
    n = R.um(f"select count(*)::int from {s}.refeicoes_concluidas where refeicao_id = {C.txt(massa['com'])} and data = {C.txt(hoje)}")
    o.ok(st == 200 and r.get("concluida") is False and n == 0, f"P desmarca → a linha some ({st}, {n})")
    st, r = R.chamar(ta, "aluno_marcar_refeicao", {"refeicao_id": massa["sem"], "data": hoje, "concluida": True})
    o.ok(st == 400 and r.get("erro") == "sem_alimentos", f"P a refeição sem alimento → 400 sem_alimentos (o código de propósito) ({st} {r.get('erro')})")
    velho = (dt.date.fromisoformat(hoje) - dt.timedelta(days=5)).isoformat()
    st, r = R.chamar(ta, "aluno_marcar_refeicao", {"refeicao_id": massa["com"], "data": velho, "concluida": True})
    o.ok(st == 400 and r.get("erro") == "data_invalida", f"P o dia fora de hoje ± 1 → 400 data_invalida ({st} {r.get('erro')})")
    # a meta: o "início" é o CURRENT_DATE do banco (UTC) — à noite em São Paulo ele já é amanhã; marca no maior dos 2 (hoje ± 1 vale)
    inicio = str(R.um(f"select inicio::text from {s}.metas where id = {C.txt(massa['meta'])}") or hoje)
    dia_meta = max(hoje, inicio)
    st, r = R.chamar(ta, "aluno_marcar_meta", {"meta_id": massa["meta"], "data": dia_meta, "concluida": True})
    n = R.um(f"select count(*)::int from {s}.metas_concluidas where meta_id = {C.txt(massa['meta'])} and data = {C.txt(dia_meta)}")
    o.ok(st == 200 and r.get("concluida") is True and n == 1, f"P a aluna marca a meta pela função → a linha do ✓ ({st} {r.get('erro')}, {n})")
    st, r = R.chamar(ta, "aluno_marcar_meta", {"meta_id": massa["meta"], "data": dia_meta, "concluida": False})
    n = R.um(f"select count(*)::int from {s}.metas_concluidas where meta_id = {C.txt(massa['meta'])} and data = {C.txt(dia_meta)}")
    o.ok(st == 200 and r.get("concluida") is False and n == 0, f"P desmarca a meta → a linha some ({st}, {n})")
    st, _ = R.chamar(R.tp, "meta_editar", {"id": massa["meta"], "ativa": False})
    st2, r = R.chamar(ta, "aluno_marcar_meta", {"meta_id": massa["meta"], "data": dia_meta, "concluida": True})
    o.ok(st == 200 and st2 == 400 and r.get("erro") == "meta_pausada", f"P a meta pausada pela nutri → 400 meta_pausada ({st2} {r.get('erro')})")
    caso_diario(R, ta)


def dados_da_matricula(R: RodadaDieta) -> dict:
    """O nutricionista_id da matrícula, o código do link e os 2 ajustes do diário (SQL só leitura; o código nunca sai na saída)."""
    r = R.ler(f"select nutricionista_id::text as n, coalesce(link_codigo, '') as c, "
              f"coalesce(config ->> 'diario_alimentar', 'true') as diario, coalesce(config ->> 'acesso_link', 'true') as link "
              f"from {R.s}.pacientes where id = {C.txt(R.pac)}")[0]
    return {"nutri": C.uuid_ok(r["n"]), "codigo": str(r["c"]), "diario": r["diario"] != "false", "link": r["link"] != "false"}


def caso_diario(R: RodadaDieta, ta: str) -> None:
    o, s, m = R.o, R.s, R.m
    mat = dados_da_matricula(R)
    nutri, codigo = mat["nutri"], mat["codigo"]
    if not o.ok(mat["diario"] and codigo, "P o diário da matrícula de teste está ligado e tem o código do link (SQL só leitura)"):
        return
    png = png_sintetico()
    bucket = B.bucket_do_diario(s)
    st, link, _h, ms = B.funcao(ta, "aluno_diario_preparar", pedido_foto(R.pac, nutri, len(png)))
    R.tempos.setdefault("aluno_diario_preparar", []).append(ms)
    caminho = str(link.get("caminho") or "")
    if not o.ok(st == 200 and link.get("bucket") == bucket and caminho.startswith(f"{nutri}/{R.pac}/") and caminho.endswith(".png") and link.get("token"),
                f"P aluno_diario_preparar → o link assinado no bucket do ambiente, na pasta da matrícula ({st} {link.get('erro')})"):
        return
    R.objeto(bucket, caminho)
    st_put = B.subir_no_link(bucket, caminho, link["token"], png, "image/png", ta)
    o.ok(st_put in (200, 201), f"P o PUT no link assinado (a imagem sintética, {len(png)} bytes) → {st_put}")
    longe_da_virada(R)
    antes, h0 = balde_do_ip(R)
    st, r = R.chamar(ta, "aluno_diario_enviar", corpo_envio(R.pac, nutri, len(png), caminho, codigo, f"{m} app"))
    reg = (r.get("registro") or {}).get("id")
    depois, h1 = balde_do_ip(R)
    if o.ok(st == 200 and C.eh_uuid(reg), f"P aluno_diario_enviar → 200 com o registro ({st} {r.get('erro')})"):
        R.e.linha("diario_alimentar", reg)
    db = R.ler(f"select path = {C.txt(caminho)} as mesmo, paciente_id::text as p, nutricionista_id::text as n, tamanho "
               f"from {s}.diario_alimentar where id = {C.txt(reg)}") if C.eh_uuid(reg) else []
    o.ok(db and db[0]["mesmo"] and db[0]["p"] == R.pac and db[0]["n"] == nutri and int(db[0]["tamanho"] or 0) == len(png),
         "P a linha do diário: o MESMO caminho, a matrícula, a nutri dela e o tamanho do arquivo que chegou")
    o.ok(h0 == h1 and depois == antes, f"P o envio pelo app NÃO consome o balde do limite por IP (decisão da sessão principal) ({antes} → {depois})")
    # N9 (aqui, com a foto de verdade no bucket): outra pasta e o caminho certo sem o arquivo
    st, r = R.chamar(ta, "aluno_diario_enviar", corpo_envio(R.pac, nutri, len(png), f"{OUTRO}/{R.pac}/{uuid.uuid4()}.png", codigo, f"{m} N9"))
    o.ok(st == 403 and r.get("erro") == "fora_da_pasta", f"N9 a foto com o caminho de OUTRA pasta → 403 fora_da_pasta ({st} {r.get('erro')})")
    st, r = R.chamar(ta, "aluno_diario_enviar", corpo_envio(R.pac, nutri, len(png), f"{nutri}/{R.pac}/{uuid.uuid4()}.png", codigo, f"{m} N9"))
    o.ok(st == 400 and r.get("erro") == "arquivo_nao_encontrado", f"N9 o caminho certo sem o arquivo → 400 arquivo_nao_encontrado ({st} {r.get('erro')})")
    caso_link_publico(R, mat, png)
    if C.eh_uuid(reg):
        st, r = R.chamar(R.tn, "diario_reagir", {"id": reg, "reacao": "otimo", "comentario": "invasão"})
        o.ok(st == 404, f"N1 outra conta reage à foto → 404 ({st})")
        st, r = R.chamar(R.tp, "diario_reagir", {"id": reg, "reacao": "otimo", "comentario": f"  {m} reação "})
        linha = r.get("linha") or {}
        o.ok(st == 200 and linha.get("reacao_nutri") == "otimo" and linha.get("comentario_nutri") == f"{m} reação" and linha.get("reagido_em"),
             f"P a nutri reage → a reação, o comentário aparado e o agora do servidor ({st})")
        st, _ = R.chamar(R.tp, "diario_excluir", {"id": reg})
        obj = R.um(f"select count(*)::int from storage.objects where bucket_id = {C.txt(bucket)} and name = {C.txt(caminho)}")
        lix = R.um(f"select deleted_at is not null from {s}.diario_alimentar where id = {C.txt(reg)}")
        o.ok(st == 200 and lix and obj == 0, f"P diario_excluir → a linha na Lixeira e a foto FORA do bucket ({st}, {obj})")
        if obj == 0:
            R.objeto_saiu(bucket, caminho)


def caso_link_publico(R: RodadaDieta, mat: dict, png: bytes) -> None:
    """O link público (/d/:codigo, visitante) segue como HOJE (decisão 13: publico.ts sem mudança): sobe direto no bucket e chama a
    diario_enviar — e CONTA no balde do IP (o aluno dono só não conta quando chama logado; aqui não há login)."""
    o, s, m = R.o, R.s, R.m
    if not o.ok(mat["link"], "o link público: o envio de fotos pelo link está ligado na matrícula de teste (SQL só leitura)"):
        return
    bucket = B.bucket_do_diario(s)
    caminho = f"{mat['nutri']}/{R.pac}/{uuid.uuid4()}.png"
    anon = B.B5.anon(B.PRINCIPAL_REF)
    st, _r, _h = B.B5.http("POST", f"{B.API_P}/storage/v1/object/{bucket}/{caminho}", png,
                           {"apikey": anon, "Authorization": f"Bearer {anon}", "Content-Type": "image/png", "x-upsert": "false",
                            "cache-control": "max-age=3600"}, timeout=60)
    if not o.ok(st in (200, 201), f"o link público: o visitante sobe a foto direto no bucket, como hoje ({st})"):
        return
    R.objeto(bucket, caminho)
    longe_da_virada(R)
    antes, h0 = balde_do_ip(R)
    st, r = B.B17.rpc(None, "diario_enviar", {"p_codigo": mat["codigo"], "p_path": caminho, "p_mime": "image/png", "p_tamanho": len(png),
                                              "p_refeicao": "jantar", "p_comentario": f"{m} link", "p_data_hora": agora()})
    depois, h1 = balde_do_ip(R)
    reg = r.get("id") if isinstance(r, dict) else None
    if C.eh_uuid(reg):
        R.e.linha("diario_alimentar", reg)
    o.ok(st == 200 and C.eh_uuid(reg) and h0 == h1 and depois == antes + 1,
         f"o link público (visitante) segue como hoje: registra e CONTA 1 no balde do IP ({st}, {antes} → {depois})")
    if C.eh_uuid(reg):
        st, _ = R.chamar(R.tp, "diario_excluir", {"id": reg})
        if st == 200 and R.um(f"select count(*)::int from storage.objects where bucket_id = {C.txt(bucket)} and name = {C.txt(caminho)}") == 0:
            R.objeto_saiu(bucket, caminho)


def caso_n1_aluno(R: RodadaDieta, massa: dict) -> None:
    st, r = R.chamar(R.tn, "aluno_marcar_refeicao", {"refeicao_id": massa["com"], "data": hoje_sp(), "concluida": True})
    R.o.ok(st == 403 and r.get("erro") == "sem_acesso", f"N1 outra conta marca a refeição da aluna → 403 sem_acesso ({st} {r.get('erro')})")


# ───────────────────────── a limpeza ─────────────────────────
def limpar(o, estado: B.Estado, L, s: str) -> None:
    """Desfaz o que a rodada criou (as linhas da Dieta por id — as filhas em cascata —, os arquivos do diário pelo Storage como a nutri
    dona da pasta, o N8) e confere por SQL só leitura (só contagem)."""
    if estado.vazio():
        o.ok(True, "limpeza: nada pendente no estado")
        estado.apagar()
        return
    dono = L.uid(B.P_CONTA)
    desfazer_n8(o, estado, dono, s)
    if estado.d["storage"]:
        token = L.token(B.P_CONTA)  # a nutri da pasta (<nutri>/<aluno>/…) apaga as fotos da pasta dela
        for bucket in sorted({b for b, _c in estado.d["storage"]}):
            caminhos = [c for b, c in estado.d["storage"] if b == bucket]
            st, n = B.remover_do_storage(bucket, caminhos, token)
            o.ok(st == 200, f"limpeza: {len(caminhos)} arquivo(s) tirados do {bucket} como a nutri dona da pasta ({st}, {n} removidos)")
        estado.d["storage"] = []
        estado.salvar()
    for sql in B.sql_apagar_linhas(s, estado.d["linhas"], dono):
        C.C2.sql_principal(sql)
    rodada = estado.d.get("rodada")
    sobra = B.B17.ler(B.sql_contar_marca_dieta(s, rodada))[0] if rodada else {}
    o.ok(rodada and not any(sobra.values()),
         f"limpeza conferida (SQL só leitura): 0 linha com a marca da rodada nas 15 tabelas da Dieta ({sum(sobra.values()) if sobra else '?'})")
    todos = [c for _b, c in estado.d.get("storage_rodada") or []]
    if todos:
        objs = B.B17.ler(f"select count(*)::int as n from storage.objects where bucket_id = {C.txt(B.bucket_do_diario(s))} "
                         f"and name = any(array[{', '.join(C.txt(c) for c in todos)}]::text[])")
        o.ok(objs and objs[0]["n"] == 0, f"limpeza conferida: 0 arquivo da rodada no bucket do diário (de {len(todos)})")
    estado.apagar()


def so_leitura(o, L, base: str = "prod") -> None:
    """SÓ LEITURA (produção ou staging): nada grava — a função recusa antes de qualquer banco (CORS, sem login, x-schema inválido,
    ação desconhecida), com as ações da Dieta e do app."""
    st1, h1 = B.preflight(B.ORIGEM_FORA)
    o.ok(st1 in (200, 204) and B.cors(h1) == B.ORIGEM_PADRAO, f"{base} N7: origem fora da lista → o CORS padrão ({st1})")
    st, _r, _h, _ms = B.funcao(None, "plano_criar", {}, sem_auth=True, origem=B.BASES[base])
    o.ok(st == 401, f"{base} N2: sem login → 401 ({st})")
    st, _r, _h, _ms = B.funcao(None, "aluno_marcar_refeicao", {}, sem_auth=True, origem=B.BASES[base])
    o.ok(st == 401, f"{base} N2: o app sem login → 401 ({st})")
    token = L.token(B.PROD_CONTA if base == "prod" else B.P_CONTA)
    st, r, _h, _ms = B.funcao(token, "plano_excluir", {"id": FALSO}, schema_="producao", origem=B.BASES[base])
    o.ok(st == 400 and r.get("erro") == "schema_invalido", f"{base} N6: x-schema inválido → 400 ({st})")
    st, r, _h, _ms = B.funcao(token, "dieta_apagar_tudo", {}, origem=B.BASES[base])
    o.ok(st == 400 and r.get("erro") == "acao_invalida", f"{base} N3: ação desconhecida → 400 acao_invalida ({st})")


def producao(o, L) -> None:
    so_leitura(o, L, "prod")


def rodar(o, L, estado: B.Estado, rodada: str, area: str, casos: list[str]) -> None:
    R = RodadaDieta(o, L, estado, rodada, area)
    o.linha(f"rodada {rodada} · schema {R.s} · área {area} · aluna (matrícula) {R.pac[:8]}… · casos {','.join(casos)}")
    if area == "dieta":
        for nome, f in (("P", caso_p_dieta), ("N1", caso_n1_dieta), ("N4", caso_n4_n5_dieta), ("N8", caso_n8_dieta)):
            if nome in casos or (nome == "N4" and "N5" in casos):
                f(R)
        if {"N2", "N3", "N6", "N7"} & set(casos):
            caso_n2_n3_n6_n7(R, casos)
    else:
        massa = massa_do_app(R, alimento_taco(R))
        if massa:
            if "P" in casos or "N9" in casos:
                caso_p_aluno(R, massa)
            if "N1" in casos:
                caso_n1_aluno(R, massa)
    tempos = {k: f"{min(v)}–{max(v)} ms (n={len(v)})" for k, v in sorted(R.tempos.items())}
    o.linha(f"tempos por ação: {tempos}")
