"""Physiq — 1 exercício GLOBAL novo no catálogo do Treino (pedido do Weslley em 21/10/2026): Paralela na Máquina (Mergulho), COM
3D (o movimento e a foto vêm do manifesto src/lib/exercicios3dManifest.json, pelo id; a imagem_url fica nula). A base do
aplicar.py e do sql_exercicio_paralela.py.

Uma fonte só da decisão: ESPERADOS. A migration supabase/migrations/20261021210000_exercicio_paralela_na_maquina.sql tem de ter
exatamente essa linha (o --seco do sql_exercicio_paralela.py confere) e o banco tem de ficar igual a elas (o mesmo script, no banco).
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
MIGRACAO = REPO / "supabase" / "migrations" / "20261021210000_exercicio_paralela_na_maquina.sql"
LISTA_SCHEMAS = "ARRAY['public','staging']"
SCHEMAS = ("staging", "public")
URL_DO_ID = "https://physiqcalc.com.br/exercicios/"   # id = uuid5(NAMESPACE_URL, URL_DO_ID + slug), como a 20261005190000
GLOBAIS_ANTES, GLOBAIS_DEPOIS = 156, 157
BACKUP_PADRAO = Path.home() / "backups" / "physiq" / "2026-10-21-exercicio-paralela"
CAMPOS = ("id", "nome", "grupo_muscular", "subgrupo", "tipo", "padrao_movimento", "equipamento", "variacao")

# A decisão (nome e classificação nossos, no padrão das linhas parecidas do catálogo; nada de app de terceiros).
ESPERADOS: tuple[dict, ...] = (
    {"slug": "paralela-na-maquina-mergulho", "id": "0e8c848c-96b3-5ad1-b266-7fe01ff398df", "nome": "Paralela na Máquina (Mergulho)",
     "grupo_muscular": "Tríceps", "subgrupo": "Tríceps · deltoide anterior · peitoral inferior", "tipo": "musculacao",
     "padrao_movimento": "mergulho", "equipamento": "maquina", "variacao": "sentado, pegadores dos lados do corpo"},
)


def lit(valor) -> str:
    """Literal SQL (texto entre aspas simples, com as aspas dobradas); None → null."""
    return "null" if valor is None else "'" + str(valor).replace("'", "''") + "'"


def sem_acento(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn")


IDS = "array[" + ", ".join(f"{lit(e['id'])}::uuid" for e in ESPERADOS) + "]"
NOMES = "array[" + ", ".join(lit(e["nome"].lower()) for e in ESPERADOS) + "]"
VALORES = ("(values " + ", ".join("(" + ", ".join(lit(e[c]) for c in CAMPOS) + ")" for e in ESPERADOS) + ") as v("
           + ", ".join(CAMPOS) + ")")


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
    """A linha do VALUES como ela está escrita na migration."""
    return "(" + ", ".join(lit(e[c]) for c in CAMPOS) + ")"


# ───────────────────────── leituras (só SELECT) ─────────────────────────

# a linha inteira (todas as colunas; o created_at em UTC, para não depender do fuso da sessão)
LINHA = "(to_jsonb(t) || jsonb_build_object('created_at', (t.created_at at time zone 'UTC')::text))::text"


def foto(schema: str) -> dict:
    """Contagens e a soma de conferência dos OUTROS globais (tudo menos o novo): prova que a migration não mexeu em mais nada.
    Só os globais na soma: exercício de profissional pode nascer pelo app a qualquer hora (sem relação com isto)."""
    s = checar_schema(schema)
    return ler(f"""select count(*)::int as total,
        count(*) filter (where t.professor_id is null)::int as globais,
        count(*) filter (where t.professor_id is null and t.imagem_url is null)::int as globais_sem_imagem,
        count(*) filter (where t.id = any({IDS}))::int as dos_novos,
        md5(coalesce(string_agg({LINHA}, '#' order by t.id) filter (where t.professor_id is null and not (t.id = any({IDS}))), ''))
          as outros_globais
      from {s}.tb_exercicios t""")[0]


def mesma_foto(a: dict, b: dict) -> bool:
    """Nada mudou nos globais (o total geral fica de fora: exercício de profissional não conta)."""
    return all(a[k] == b[k] for k in ("globais", "globais_sem_imagem", "dos_novos", "outros_globais"))


def linhas_dos_novos(schema: str) -> list[dict]:
    """As linhas com o id do novo ou com o nome dele (global, sem caixa)."""
    s = checar_schema(schema)
    return ler(f"""select t.id::text as id, t.nome, t.grupo_muscular, t.subgrupo, t.tipo, t.padrao_movimento, t.equipamento,
        t.variacao, t.imagem_url, t.dica, t.professor_id::text as professor_id
      from {s}.tb_exercicios t
      where t.id = any({IDS}) or (t.professor_id is null and lower(t.nome) = any({NOMES}))
      order by t.nome, t.id""")


def diferencas(e: dict, linha: dict) -> dict:
    """Campo → (esperado, no banco), só os que diferem."""
    return {c: (e[c], linha.get(c)) for c in CAMPOS if linha.get(c) != e[c]}


def biblioteca_acha(schema: str, e: dict) -> bool:
    """A RPC da Biblioteca (exercicios_da_lista: painel, folha do editor e master), escopo global, busca pelo nome sem acento."""
    s = checar_schema(schema)
    termo = sem_acento(e["nome"]).lower()
    r = ler(f"select {s}.exercicios_da_lista(jsonb_build_object('escopo', 'global', 'q', {lit(termo)}), 0, 20) as r")[0]["r"] or {}
    return e["id"] in [i.get("id") for i in r.get("itens") or []]


# ───────────────────────── o bloco do aplicar.py (uma ida só) ─────────────────────────

def conferencia_sql(schema: str) -> str:
    """Dentro da transação: os globais, quantos dos novos estão IGUAIS ao esperado (globais, imagem_url nula) e os nomes globais repetidos."""
    s = checar_schema(schema)
    iguais = " and ".join(f"e.{c} = v.{c}" for c in CAMPOS[1:])
    return (f"select json_build_object("
            f"'globais', (select count(*) from {s}.tb_exercicios where professor_id is null), "
            f"'os_novos', (select count(*) from {s}.tb_exercicios e join {VALORES} on e.id = v.id::uuid and {iguais} "
            f"and e.professor_id is null and e.imagem_url is null), "
            f"'repetidos', (select count(*) from (select 1 from {s}.tb_exercicios where professor_id is null "
            f"group by lower(nome) having count(*) > 1) d))")


def bloco(schema: str, globais_esperados: int, dry_run: bool) -> str:
    """BEGIN → a migration só no schema → a conferência dentro da transação → no dry-run, um erro de propósito com o resultado
    (RESULTADO<<json>>) e o ROLLBACK; de verdade, o erro só se a conferência não bater (CONFERENCIA<<json>>: volta TUDO) e o
    COMMIT. Com erro, o psql para (ON_ERROR_STOP) e a transação aberta volta inteira quando a conexão fecha."""
    if dry_run:
        corpo, fim = "  RAISE EXCEPTION 'RESULTADO<<%>>', r;", "ROLLBACK;"
    else:
        corpo = (f"  IF (r->>'globais')::int <> {int(globais_esperados)} OR (r->>'os_novos')::int <> {len(ESPERADOS)}"
                 f" OR (r->>'repetidos')::int <> 0 THEN\n    RAISE EXCEPTION 'CONFERENCIA<<%>>', r;\n  END IF;")
        fim = "COMMIT;"
    return (f"BEGIN;\n{migracao_do_schema(schema)}\nDO $pf$\nDECLARE r json;\nBEGIN\n  {conferencia_sql(schema)} INTO r;\n"
            f"{corpo}\nEND\n$pf$;\n{fim}\n")


def resultado_do_erro(erro: Exception, marca: str) -> dict | None:
    """O json que o bloco devolve na mensagem do erro (o exec_treino corta o stderr em 500 caracteres: o json cabe com folga)."""
    m = re.search(re.escape(marca) + r"<<(.*?)>>", str(erro), re.S)
    return json.loads(m.group(1)) if m else None
