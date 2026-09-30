#!/usr/bin/env python3
"""Physiq W9 — classificação dos 81 exercícios GLOBAIS (movimento, equipamento e variação) no BANCO DO TREINO.

Fonte: docs/exercicios-equivalencia.csv (uma linha por exercício: id, nome, grupo, subgrupo, padrao_movimento, equipamento,
variacao — as listas fixas estão em src/treino/equivalencia.ts). A migração supabase/migrations/20260930060000_w09_classificacao_81.sql
é GERADA daqui (`gerar`) e muda SÓ as 3 colunas novas dos 81 globais (nunca id, nome, grupo, subgrupo, imagem, dica). Idempotente:
a linha que já está igual não é tocada (o PowerSync não reenvia nada ao rodar de novo).

Uso:
  python3 scripts/conteudo/classificacao_81.py gerar                      # CSV → migração (confere as listas fixas)
  python3 scripts/conteudo/classificacao_81.py aplicar --schema staging --dry-run
  python3 scripts/conteudo/classificacao_81.py aplicar --schema staging --backup ~/backups/physiq/<data>-w09
  python3 scripts/conteudo/classificacao_81.py aplicar --schema public  --backup ~/backups/physiq/<data>-w09
`aplicar` faz: backup (JSON da tabela inteira pela Management API) → contagens e a soma de conferência das colunas que NÃO podem
mudar → a migração só no schema pedido → contagens de novo (81 classificados, 0 vazios, total e conferência iguais) → relatório.
SQL pela Management API (~/.pc-pat).
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "virada"))
from _base import TREINO_REF, http, lit, pat, salvar_json  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent.parent
CSV = RAIZ / "docs" / "exercicios-equivalencia.csv"
MIGRACAO = RAIZ / "supabase" / "migrations" / "20260930060000_w09_classificacao_81.sql"
EQUIVALENCIA_TS = RAIZ / "src" / "treino" / "equivalencia.ts"
TREINOS_PRONTOS = Path(__file__).resolve().parent / "treinos_prontos.json"
LISTA_SCHEMAS = "ARRAY['public','staging']"
CABECALHO = ["id", "nome", "grupo", "subgrupo", "padrao_movimento", "equipamento", "variacao"]
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


def sql(query: str) -> list:
    st, r = http("POST", f"https://api.supabase.com/v1/projects/{TREINO_REF}/database/query", {"query": query},
                 {"Authorization": f"Bearer {pat()}"}, timeout=300)
    if st not in (200, 201):
        raise RuntimeError(f"SQL Treino HTTP {st}: {str(r)[:800]}")
    return r or []


def listas_fixas() -> tuple[set[str], set[str]]:
    """As chaves de PADROES e EQUIPAMENTOS lidas do próprio equivalencia.ts (uma fonte só)."""
    ts = EQUIVALENCIA_TS.read_text(encoding="utf-8")
    eq = ts.split("export const EQUIPAMENTOS", 1)[1].split("] as const", 1)[0]
    pd = ts.split("export const PADROES", 1)[1].split("] as const", 1)[0]
    chaves = lambda bloco: set(re.findall(r'chave: "([a-z_]+)"', bloco))  # noqa: E731
    return chaves(pd), chaves(eq)


def ler_csv() -> list[dict]:
    with CSV.open(encoding="utf-8", newline="") as f:
        r = csv.reader(f)
        cab = next(r)
        if cab != CABECALHO:
            raise SystemExit(f"cabeçalho do CSV diferente: {cab}")
        linhas = [dict(zip(cab, l)) for l in r if l]
    padroes, equipamentos = listas_fixas()
    erros = []
    ids = set()
    for l in linhas:
        if not UUID.match(l["id"]):
            erros.append(f"{l['nome']}: id {l['id']}")
        if l["id"] in ids:
            erros.append(f"{l['nome']}: id repetido")
        ids.add(l["id"])
        if l["padrao_movimento"] not in padroes:
            erros.append(f"{l['nome']}: movimento '{l['padrao_movimento']}' fora da lista")
        if l["equipamento"] not in equipamentos:
            erros.append(f"{l['nome']}: equipamento '{l['equipamento']}' fora da lista")
    if len(linhas) != 81:
        erros.append(f"{len(linhas)} linhas (esperado 81)")
    if erros:
        raise SystemExit("CSV com problema:\n  " + "\n  ".join(erros))
    return linhas


def gerar() -> None:
    linhas = ler_csv()
    valores = ",\n".join(
        f"          ({lit(l['id'])}, {lit(l['padrao_movimento'])}, {lit(l['equipamento'])}, {lit(l['variacao'] or None)})"
        for l in linhas
    )
    texto = f"""-- W9 — Troca de exercício por equivalente: classificação dos 81 exercícios GLOBAIS (professor_id vazio) do Banco do Treino.
-- Gerada por scripts/conteudo/classificacao_81.py a partir de docs/exercicios-equivalencia.csv (não editar à mão).
-- Muda SÓ padrao_movimento, equipamento e variacao (colunas da W2); listas fixas em src/treino/equivalencia.ts.
-- Idempotente: a linha que já está igual não é tocada (rodar de novo não reenvia nada pelo PowerSync).
-- Aplicar por schema com backup e contagens: python3 scripts/conteudo/classificacao_81.py aplicar --schema <staging|public>.
DO $mig$
DECLARE s text;
BEGIN
  FOREACH s IN ARRAY {LISTA_SCHEMAS} LOOP
    EXECUTE format($q$
      UPDATE %I.tb_exercicios AS e
         SET padrao_movimento = v.padrao, equipamento = v.equipamento, variacao = v.variacao
        FROM (VALUES
{valores}
        ) AS v(id, padrao, equipamento, variacao)
       WHERE e.id = v.id::uuid
         AND e.professor_id IS NULL
         AND (e.padrao_movimento IS DISTINCT FROM v.padrao
              OR e.equipamento IS DISTINCT FROM v.equipamento
              OR e.variacao IS DISTINCT FROM v.variacao)
    $q$, s);
  END LOOP;
END
$mig$;
"""
    MIGRACAO.write_text(texto, encoding="utf-8")
    print(f"migração gerada: {MIGRACAO.relative_to(RAIZ)} ({len(linhas)} exercícios)")
    # os 9 treinos prontos da W7b usam exercícios da biblioteca pelo NOME: todos têm que estar classificados
    nomes = {l["nome"] for l in linhas}
    usados = {x["exercicio"] for t in json.loads(TREINOS_PRONTOS.read_text(encoding="utf-8"))["treinos"] for g in t["grupos"] for x in g["exercicios"]}
    fora = sorted(usados - nomes)
    print(f"treinos prontos: {len(usados)} exercícios usados, {len(usados) - len(fora)} classificados" + (f" — FORA: {fora}" if fora else ""))
    if fora:
        raise SystemExit(1)


CONFERENCIA = """select count(*)::int as total,
  count(*) filter (where professor_id is null)::int as globais,
  count(*) filter (where professor_id is null and padrao_movimento is not null and equipamento is not null)::int as classificados,
  count(*) filter (where professor_id is null and (padrao_movimento is null or equipamento is null))::int as vazios,
  md5(string_agg(concat_ws('|', id, nome, grupo_muscular, subgrupo, imagem_url, emoji, tipo, dica, professor_id), '#' order by id)) as intocaveis,
  md5(string_agg(concat_ws('|', id, padrao_movimento, equipamento, variacao), '#' order by id)) as classificacao
from {s}.tb_exercicios"""


def aplicar(schema: str, dry_run: bool, backup: Path | None) -> int:
    assert schema in ("public", "staging"), schema
    linhas = ler_csv()
    atuais = {r["id"]: r for r in sql(f"select id::text as id, nome, professor_id::text as professor_id, padrao_movimento, equipamento, variacao from {schema}.tb_exercicios")}
    faltam = [l["nome"] for l in linhas if l["id"] not in atuais]
    trocam_nome = [l["nome"] for l in linhas if l["id"] in atuais and atuais[l["id"]]["nome"] != l["nome"]]
    de_prof = [l["nome"] for l in linhas if l["id"] in atuais and atuais[l["id"]]["professor_id"]]
    if faltam or trocam_nome or de_prof:
        print(f"PARADO: ids que faltam {faltam} · nome diferente {trocam_nome} · de professor {de_prof}")
        return 1
    mudam = [l for l in linhas if (atuais[l["id"]]["padrao_movimento"], atuais[l["id"]]["equipamento"], atuais[l["id"]]["variacao"])
             != (l["padrao_movimento"], l["equipamento"], l["variacao"] or None)]
    antes = sql(CONFERENCIA.format(s=schema))[0]
    print(f"[{schema}] antes: {antes}")
    print(f"[{schema}] {len(mudam)} de {len(linhas)} exercícios mudam" + (" (dry-run: nada gravado)" if dry_run else ""))
    if dry_run:
        return 0
    if backup:
        backup.mkdir(parents=True, exist_ok=True)
        backup.chmod(0o700)
        tabela = sql(f"select * from {schema}.tb_exercicios order by id")
        salvar_json(backup / f"{schema}.tb_exercicios.json", tabela)
        (backup / f"{schema}.tb_exercicios.json").chmod(0o600)
        print(f"[{schema}] backup: {backup / f'{schema}.tb_exercicios.json'} ({len(tabela)} linhas)")
    texto = MIGRACAO.read_text(encoding="utf-8")
    if LISTA_SCHEMAS not in texto:
        raise SystemExit("a migração não tem a lista de schemas esperada")
    sql(texto.replace(LISTA_SCHEMAS, f"ARRAY[{lit(schema)}]"))
    depois = sql(CONFERENCIA.format(s=schema))[0]
    print(f"[{schema}] depois: {depois}")
    ok = (depois["total"] == antes["total"] and depois["globais"] == antes["globais"] and depois["intocaveis"] == antes["intocaveis"]
          and depois["classificados"] == 81 and depois["vazios"] == 0)
    relatorio = {"schema": schema, "antes": antes, "depois": depois, "mudaram": [l["nome"] for l in mudam], "ok": ok}
    if backup:
        salvar_json(backup / f"{schema}.relatorio_classificacao.json", relatorio)
    print(f"[{schema}] {'OK' if ok else 'FALHOU'}: 81 classificados, 0 vazios, total e colunas intocáveis iguais" if ok else f"[{schema}] FALHOU: {relatorio}")
    return 0 if ok else 1


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("gerar")
    a = sub.add_parser("aplicar")
    a.add_argument("--schema", required=True, choices=("staging", "public"))
    a.add_argument("--dry-run", action="store_true")
    a.add_argument("--backup", type=Path)
    args = ap.parse_args()
    if args.cmd == "gerar":
        gerar()
        return 0
    return aplicar(args.schema, args.dry_run, args.backup.expanduser() if args.backup else None)


if __name__ == "__main__":
    sys.exit(main())
