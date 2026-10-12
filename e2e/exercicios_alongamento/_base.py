"""Physiq — categoria "Alongamento e mobilidade" no catálogo do Treino (pedido do Weslley em 12/10/2026: ele escolheu criar a
categoria): 9 exercícios GLOBAIS novos em tb_exercicios (SEM GIF) e 2 linhas GLOBAIS novas em grupos_musculares ("Alongamento" e
"Mobilidade"). A base do aplicar.py e do sql_exercicios_alongamento.py.

Uma fonte só da decisão: ESPERADOS e GRUPOS. A migration supabase/migrations/20261012150000_exercicios_alongamento_mobilidade.sql
tem de ter exatamente essas 9 + 2 linhas (o --seco do sql_exercicios_alongamento.py confere) e o banco tem de ficar igual a elas
(o mesmo script, no banco).
Banco: o do Treino pelo psql do pooler (~/.pgpass), com os ajudantes de e2e/w02/_comum.py — sql_treino (só SELECT: ele embrulha a
consulta num SELECT json_agg, então NÃO aceita BEGIN … ROLLBACK) e exec_treino (psql -c: vários comandos numa ida só, BEGIN …
COMMIT/ROLLBACK inclusive).
Ensaio local: TREINO_CONN="host=<pasta do socket> dbname=postgres user=postgres" aponta os 2 scripts para um Postgres
descartável (o _comum lê a variável ao ser importado).
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "w02"))
import _comum  # noqa: E402
from _comum import Placar  # noqa: E402,F401 — os 2 scripts usam o placar do _comum

REPO = Path(__file__).resolve().parents[2]
MIGRACAO = REPO / "supabase" / "migrations" / "20261012150000_exercicios_alongamento_mobilidade.sql"
LISTA_SCHEMAS = "ARRAY['public','staging']"
SCHEMAS = ("staging", "public")
URL_DO_ID = "https://physiqcalc.com.br/exercicios/"            # id = uuid5(NAMESPACE_URL, URL_DO_ID + slug), como a 20261012110000
URL_DO_GRUPO = "https://physiqcalc.com.br/grupos-musculares/"  # id do grupo = uuid5(NAMESPACE_URL, URL_DO_GRUPO + slug)
GLOBAIS_ANTES, GLOBAIS_DEPOIS = 147, 156
GRUPOS_ANTES, GRUPOS_DEPOIS = 23, 25
BACKUP_PADRAO = Path.home() / "backups" / "physiq" / "2026-10-12-exercicios-alongamento"
CAMPOS = ("id", "nome", "grupo_muscular", "subgrupo", "tipo", "padrao_movimento", "equipamento", "variacao")
CAMPOS_GRUPO = ("id", "nome")
BLOCO = "alongamento"   # o bloco novo de src/lib/gruposMusculares.ts (a categoria "Alongamento e mobilidade")
# Os 6 movimentos novos do bloco (src/treino/equivalencia.ts; desenho de 12/10/2026).
MOVIMENTOS = ("along_coluna", "along_pescoco", "along_ombro", "along_punho", "along_posterior", "along_quadril")

# As somas de conferência de ANTES (lidas só por SELECT em 12/10/2026, antes da migration): a CLASSIFICAÇÃO dos 147 globais (sem
# imagem_url nem created_at: o lote dos GIFs 3D muda a imagem de um global sem relação com isto) e as 23 linhas globais da
# grupos_musculares inteiras. Staging × public diferem só no emoji da Elevação Pélvica com Barra (já era assim).
SOMA_147 = {"staging": "96e1ba5a3206987ceeb634b40640e1de", "public": "2ec740c8de2c3fdbcf1c340fdff3658f"}
SOMA_23 = {"staging": "9a53b6f52fba6e9a9aacec3d93e9c4ca", "public": "9a53b6f52fba6e9a9aacec3d93e9c4ca"}


def _ex(slug, id_, nome, grupo, subgrupo, padrao, variacao):
    return {"slug": slug, "id": id_, "nome": nome, "grupo_muscular": grupo, "subgrupo": subgrupo, "tipo": "musculacao",
            "padrao_movimento": padrao, "equipamento": "peso_corporal", "variacao": variacao}


# A decisão (nome e classificação nossos; nada de app de terceiros). Tabela do desenho de 12/10/2026.
ESPERADOS: tuple[dict, ...] = (
    _ex("alongamento-abracando-os-joelhos", "8eb04184-87e2-5639-8446-03f8b7860f80", "Alongamento Abraçando os Joelhos", "Alongamento",
        "Eretores da espinha (lombar) · glúteo máximo", "along_coluna", "deitado, joelhos ao peito"),
    _ex("alongamento-de-extensao-da-coluna", "c8266767-ad75-510a-b92e-23c82e026536", "Alongamento de Extensão da Coluna", "Alongamento",
        "Lombar (extensão) · reto abdominal · flexores do quadril", "along_coluna", "deitado de bruços, apoio nas mãos"),
    _ex("alongamento-de-posterior-em-pe", "6122eb99-fb03-5254-8823-05bef03bd1c6", "Alongamento de Posterior em Pé", "Alongamento",
        "Isquiotibiais · gastrocnêmio", "along_posterior", "em pé, tronco à frente"),
    _ex("alongamento-de-punho-flexores", "a489f80b-9a94-5646-81ae-9de100beef28", "Alongamento de Punho (flexores)", "Alongamento",
        "Flexores do antebraço", "along_punho", "braço estendido, dedos para trás"),
    _ex("alongamento-de-punho-extensores", "ef3cdd4d-88c2-586c-bd0b-f3a3a30f5522", "Alongamento de Punho (extensores)", "Alongamento",
        "Extensores do antebraço", "along_punho", "braço estendido, mão para baixo"),
    _ex("mobilidade-cervical", "cdbfa476-b311-5883-8a77-e1527bb4ff1a", "Mobilidade Cervical", "Mobilidade",
        "Trapézio superior · elevador da escápula · esternocleidomastóideo", "along_pescoco", "sentado ou em pé"),
    _ex("mobilidade-de-coluna-deitado", "839b864e-936e-5b1d-90ce-e86c59bf06bb", "Mobilidade de Coluna Deitado", "Mobilidade",
        "Lombar · eretores da espinha · oblíquos", "along_coluna", "deitado, joelhos para os lados"),
    _ex("mobilidade-de-ombro-com-bastao", "1e857840-e81a-579f-acb6-9df841c2c5b9", "Mobilidade de Ombro com Bastão", "Mobilidade",
        "Deltoide · rotadores do ombro", "along_ombro", "em pé, bastão nas mãos"),
    _ex("alongamento-borboleta", "1be8df4d-eba8-52bd-9a87-8d70a4baedbc", "Alongamento Borboleta", "Alongamento",
        "Adutores (longo · curto · magno)", "along_quadril", "sentado, solas dos pés juntas"),
)
# As 2 linhas novas da grupos_musculares, no padrão das 23 globais (professor_id e criado_por nulos; created_at = o padrão now()).
GRUPOS: tuple[dict, ...] = (
    {"slug": "alongamento", "id": "d5f36dfc-b6e1-551a-9ed1-1373852f8923", "nome": "Alongamento"},
    {"slug": "mobilidade", "id": "32dc55a5-bc23-51b6-b1ab-3f8ccfb10591", "nome": "Mobilidade"},
)


def lit(valor) -> str:
    """Literal SQL (texto entre aspas simples, com as aspas dobradas); None → null."""
    return "null" if valor is None else "'" + str(valor).replace("'", "''") + "'"


def sem_acento(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn")


def _array_uuid(itens) -> str:
    return "array[" + ", ".join(f"{lit(e['id'])}::uuid" for e in itens) + "]"


IDS = _array_uuid(ESPERADOS)
IDS_GRUPOS = _array_uuid(GRUPOS)
NOMES = "array[" + ", ".join(lit(e["nome"].lower()) for e in ESPERADOS) + "]"
NOMES_GRUPOS = "array[" + ", ".join(lit(g["nome"].lower()) for g in GRUPOS) + "]"
VALORES = ("(values " + ", ".join("(" + ", ".join(lit(e[c]) for c in CAMPOS) + ")" for e in ESPERADOS) + ") as v("
           + ", ".join(CAMPOS) + ")")
VALORES_GRUPOS = ("(values " + ", ".join("(" + ", ".join(lit(g[c]) for c in CAMPOS_GRUPO) + ")" for g in GRUPOS) + ") as v("
                  + ", ".join(CAMPOS_GRUPO) + ")")


def checar_schema(schema: str) -> str:
    if schema not in SCHEMAS:
        raise SystemExit(f"schema {schema!r}: só staging ou public")
    return schema


def destino() -> str:
    """Para onde o psql vai: o pooler do Treino ou um Postgres local (ensaio)."""
    m = re.search(r"host=(\S+)", _comum.TREINO_CONN)
    host = m.group(1) if m else "?"
    return f"LOCAL (socket {host})" if host.startswith("/") else f"Treino {_comum.TREINO_REF} ({host})"


def ler(q: str) -> list[dict]:
    """Só SELECT (o sql_treino embrulha num SELECT json_agg)."""
    return _comum.sql_treino(q)


def executar(comando: str) -> None:
    """Uma ida só pelo psql -c (o exec_treino): aceita BEGIN … COMMIT/ROLLBACK no mesmo texto."""
    _comum.exec_treino(comando)


# ───────────────────────── a migration ─────────────────────────

def migracao_texto() -> str:
    return MIGRACAO.read_text(encoding="utf-8")


def migracao_do_schema(schema: str) -> str:
    """A MESMA migration, com a lista de schemas trocada pelo pedido (o molde do scripts/conteudo/novos_61.py)."""
    texto = migracao_texto()
    if texto.count(LISTA_SCHEMAS) != 1:
        raise SystemExit(f"a migration não tem a lista {LISTA_SCHEMAS} uma vez só: {MIGRACAO.name}")
    return texto.replace(LISTA_SCHEMAS, f"ARRAY[{lit(checar_schema(schema))}]")


def tupla_da_migracao(e: dict) -> str:
    """A linha do VALUES dos exercícios como ela está escrita na migration."""
    return "(" + ", ".join(lit(e[c]) for c in CAMPOS) + ")"


def tupla_do_grupo(g: dict) -> str:
    """A linha do VALUES dos grupos como ela está escrita na migration."""
    return "(" + ", ".join(lit(g[c]) for c in CAMPOS_GRUPO) + ")"


# ───────────────────────── leituras (só SELECT) ─────────────────────────

# a linha inteira (todas as colunas; o created_at em UTC, para não depender do fuso da sessão)
LINHA = "(to_jsonb(t) || jsonb_build_object('created_at', (t.created_at at time zone 'UTC')::text))::text"
# a classificação de um exercício (sem imagem_url e created_at) — a soma dos 147 de antes (SOMA_147)
CLASSIF = ("jsonb_build_array(t.id, t.nome, t.grupo_muscular, t.subgrupo, t.tipo, t.padrao_movimento, t.equipamento, t.variacao, "
           "t.professor_id, t.dica, t.emoji)::text")


def foto(schema: str) -> dict:
    """Contagens e as somas de conferência dos OUTROS globais (tudo menos os 9 e os 2), nas 2 tabelas: prova que a migration não
    mexeu em mais nada. Só os globais nas somas: exercício e grupo de profissional podem nascer pelo app a qualquer hora (sem
    relação com isto)."""
    s = checar_schema(schema)
    return ler(f"""select
        (select count(*)::int from {s}.tb_exercicios) as total,
        (select count(*)::int from {s}.tb_exercicios where professor_id is null) as globais,
        (select count(*)::int from {s}.tb_exercicios where professor_id is null and imagem_url is null) as globais_sem_imagem,
        (select count(*)::int from {s}.tb_exercicios where id = any({IDS})) as dos_9,
        (select md5(coalesce(string_agg({LINHA}, '#' order by t.id), '')) from {s}.tb_exercicios t
          where t.professor_id is null and not (t.id = any({IDS}))) as outros_globais,
        (select md5(coalesce(string_agg({CLASSIF}, '#' order by t.id), '')) from {s}.tb_exercicios t
          where t.professor_id is null and not (t.id = any({IDS}))) as classif_outros,
        (select count(*)::int from {s}.grupos_musculares) as grupos_total,
        (select count(*)::int from {s}.grupos_musculares where professor_id is null) as grupos,
        (select count(*)::int from {s}.grupos_musculares where id = any({IDS_GRUPOS})) as dos_2,
        (select md5(coalesce(string_agg({LINHA}, '#' order by t.id), '')) from {s}.grupos_musculares t
          where t.professor_id is null and not (t.id = any({IDS_GRUPOS}))) as outros_grupos""")[0]


CHAVES_DA_FOTO = ("globais", "globais_sem_imagem", "dos_9", "outros_globais", "classif_outros", "grupos", "dos_2", "outros_grupos")


def mesma_foto(a: dict, b: dict) -> bool:
    """Nada mudou nos globais das 2 tabelas (os totais gerais ficam de fora: linha de profissional não conta)."""
    return all(a[k] == b[k] for k in CHAVES_DA_FOTO)


def linhas_dos_9(schema: str) -> list[dict]:
    """As linhas com o id de um dos 9 ou com o nome de um deles (global, sem caixa)."""
    s = checar_schema(schema)
    return ler(f"""select t.id::text as id, t.nome, t.grupo_muscular, t.subgrupo, t.tipo, t.padrao_movimento, t.equipamento,
        t.variacao, t.imagem_url, t.dica, t.professor_id::text as professor_id
      from {s}.tb_exercicios t
      where t.id = any({IDS}) or (t.professor_id is null and lower(t.nome) = any({NOMES}))
      order by t.nome, t.id""")


def linhas_dos_2(schema: str) -> list[dict]:
    """As linhas da grupos_musculares com o id de um dos 2 ou com o nome de um deles (sem caixa, em QUALQUER linha: lá o nome é
    único na tabela inteira)."""
    s = checar_schema(schema)
    return ler(f"""select g.id::text as id, g.nome, g.professor_id::text as professor_id, g.criado_por::text as criado_por
      from {s}.grupos_musculares g
      where g.id = any({IDS_GRUPOS}) or lower(g.nome) = any({NOMES_GRUPOS})
      order by g.nome, g.id""")


def diferencas(e: dict, linha: dict, campos=CAMPOS) -> dict:
    """Campo → (esperado, no banco), só os que diferem."""
    return {c: (e[c], linha.get(c)) for c in campos if linha.get(c) != e[c]}


def biblioteca(schema: str, filtros: dict) -> dict:
    """A RPC da Biblioteca (exercicios_da_lista: painel, folha do editor e master), página de até 100."""
    s = checar_schema(schema)
    return ler(f"select {s}.exercicios_da_lista({lit(json.dumps(filtros, ensure_ascii=False))}::jsonb, 0, 100) as r")[0]["r"] or {}


def biblioteca_acha(schema: str, e: dict) -> bool:
    """Escopo global, busca pelo nome sem acento: o id vem na resposta."""
    r = biblioteca(schema, {"escopo": "global", "q": sem_acento(e["nome"]).lower()})
    return e["id"] in [i.get("id") for i in r.get("itens") or []]


def biblioteca_do_bloco(schema: str) -> list[str]:
    """O que o chip do bloco novo mostra: escopo global, `musculos` = os 2 grupos (o que a tela manda pelo musculosDosBlocos)."""
    r = biblioteca(schema, {"escopo": "global", "musculos": [g["nome"].lower() for g in GRUPOS]})
    return sorted(i.get("id") for i in r.get("itens") or [])


# ───────────────────────── o bloco do aplicar.py (uma ida só) ─────────────────────────

def conferencia_sql(schema: str) -> str:
    """Dentro da transação: os globais, quantos dos 9 estão IGUAIS ao esperado (globais, sem GIF), os nomes globais repetidos; os
    grupos globais, quantos dos 2 estão iguais (globais, sem criado_por) e os nomes de grupo repetidos (sem caixa)."""
    s = checar_schema(schema)
    iguais = " and ".join(f"e.{c} = v.{c}" for c in CAMPOS[1:])
    return (f"select json_build_object("
            f"'globais', (select count(*) from {s}.tb_exercicios where professor_id is null), "
            f"'os_9', (select count(*) from {s}.tb_exercicios e join {VALORES} on e.id = v.id::uuid and {iguais} "
            f"and e.professor_id is null and e.imagem_url is null), "
            f"'repetidos', (select count(*) from (select 1 from {s}.tb_exercicios where professor_id is null "
            f"group by lower(nome) having count(*) > 1) d), "
            f"'grupos', (select count(*) from {s}.grupos_musculares where professor_id is null), "
            f"'os_2', (select count(*) from {s}.grupos_musculares e join {VALORES_GRUPOS} on e.id = v.id::uuid and e.nome = v.nome "
            f"and e.professor_id is null and e.criado_por is null), "
            f"'grupos_repetidos', (select count(*) from (select 1 from {s}.grupos_musculares "
            f"group by lower(nome) having count(*) > 1) d))")


def bloco(schema: str, globais_esperados: int, grupos_esperados: int, dry_run: bool) -> str:
    """BEGIN → a migration só no schema → a conferência dentro da transação → no dry-run, um erro de propósito com o resultado
    (RESULTADO<<json>>) e o ROLLBACK; de verdade, o erro só se a conferência não bater (CONFERENCIA<<json>>: volta TUDO) e o
    COMMIT. Com erro, o psql para (ON_ERROR_STOP) e a transação aberta volta inteira quando a conexão fecha."""
    if dry_run:
        corpo, fim = "  RAISE EXCEPTION 'RESULTADO<<%>>', r;", "ROLLBACK;"
    else:
        corpo = (f"  IF (r->>'globais')::int <> {int(globais_esperados)} OR (r->>'os_9')::int <> {len(ESPERADOS)}"
                 f" OR (r->>'repetidos')::int <> 0 OR (r->>'grupos')::int <> {int(grupos_esperados)}"
                 f" OR (r->>'os_2')::int <> {len(GRUPOS)} OR (r->>'grupos_repetidos')::int <> 0 THEN\n"
                 f"    RAISE EXCEPTION 'CONFERENCIA<<%>>', r;\n  END IF;")
        fim = "COMMIT;"
    return (f"BEGIN;\n{migracao_do_schema(schema)}\nDO $al$\nDECLARE r json;\nBEGIN\n  {conferencia_sql(schema)} INTO r;\n"
            f"{corpo}\nEND\n$al$;\n{fim}\n")


def resultado_do_erro(erro: Exception, marca: str) -> dict | None:
    """O json que o bloco devolve na mensagem do erro (o exec_treino corta o stderr em 500 caracteres: o json cabe com folga)."""
    m = re.search(re.escape(marca) + r"<<(.*?)>>", str(erro), re.S)
    return json.loads(m.group(1)) if m else None
