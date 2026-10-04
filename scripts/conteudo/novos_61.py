#!/usr/bin/env python3
"""Physiq — 61 exercícios GLOBAIS novos (sem GIF) no BANCO DO TREINO, da lista aberta free-exercise-db (domínio público).

Fonte: scripts/conteudo/novos_61.json (id uuid5 fixo, nome, grupo_muscular, subgrupo, tipo, padrao_movimento, equipamento,
variacao; `fonte_en` = o nome na lista aberta, só pra rastrear). Da lista só vieram nome, músculo e equipamento — nada de imagens
nem instruções. Lista curta aprovada pelo Weslley em 03/10/2026; entram SEM GIF (imagem_url nula) até os GIFs 3D. Grupo e
subgrupo no padrão dos 81 (o subgrupo é o que separa "mesmo músculo" na troca); movimento e equipamento só das listas fixas de
src/treino/equivalencia.ts (sem APK). A migração 20261004000000_exercicios_novos_61.sql é GERADA daqui (`gerar`).
Idempotente: id ou nome global que já existe não entra de novo.

Uso:
  python3 scripts/conteudo/novos_61.py gerar                      # JSON → migração (confere listas fixas e os 81)
  python3 scripts/conteudo/novos_61.py aplicar --schema staging --dry-run
  python3 scripts/conteudo/novos_61.py aplicar --schema staging --backup ~/backups/physiq/<data>-novos61
  python3 scripts/conteudo/novos_61.py aplicar --schema public  --backup ~/backups/physiq/<data>-novos61
`aplicar` faz: contagens e a soma de conferência dos OUTROS exercícios → backup → a migração só no schema pedido → contagens de
novo (total + os que entraram, os outros iguais, os 61 no banco iguais ao JSON, globais e sem GIF) → relatório. SQL pela
Management API (~/.pc-pat).
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "virada"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from _base import lit, salvar_json  # noqa: E402
from classificacao_81 import listas_fixas, sql  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent.parent
DADOS = Path(__file__).resolve().parent / "novos_61.json"
CSV_81 = RAIZ / "docs" / "exercicios-equivalencia.csv"
MIGRACAO = RAIZ / "supabase" / "migrations" / "20261004000000_exercicios_novos_61.sql"
LISTA_SCHEMAS = "ARRAY['public','staging']"
CAMPOS = ("nome", "grupo_muscular", "subgrupo", "tipo", "padrao_movimento", "equipamento", "variacao")
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


def ler() -> list[dict]:
    itens = json.loads(DADOS.read_text(encoding="utf-8"))
    padroes, equipamentos = listas_fixas()
    with CSV_81.open(encoding="utf-8", newline="") as f:
        nomes_81 = {l["nome"].lower() for l in csv.DictReader(f)}
    erros = []
    if len(itens) != 61:
        erros.append(f"{len(itens)} itens (esperado 61)")
    if len({i["id"] for i in itens}) != len(itens) or len({i["nome"].lower() for i in itens}) != len(itens):
        erros.append("id ou nome repetido no JSON")
    for i in itens:
        if not UUID.match(i["id"]):
            erros.append(f"{i['nome']}: id {i['id']}")
        if not (i["nome"].strip() and i["grupo_muscular"].strip() and i["subgrupo"].strip()):
            erros.append(f"{i['nome']}: nome, grupo ou subgrupo vazio")
        if i["padrao_movimento"] not in padroes:
            erros.append(f"{i['nome']}: movimento {i['padrao_movimento']} fora da lista")
        if i["equipamento"] not in equipamentos:
            erros.append(f"{i['nome']}: equipamento {i['equipamento']} fora da lista")
        if i["tipo"] not in ("musculacao", "corrida") or (i["tipo"] == "corrida") != (i["padrao_movimento"] == "cardio"):
            erros.append(f"{i['nome']}: tipo {i['tipo']} × movimento {i['padrao_movimento']}")
        if i["nome"].lower() in nomes_81:
            erros.append(f"{i['nome']}: já existe nos 81")
    if erros:
        raise SystemExit("novos_61.json:\n  " + "\n  ".join(erros))
    return itens


def gerar() -> None:
    itens = ler()
    valores = ",\n".join(
        f"          ({lit(i['id'])}, {lit(i['nome'])}, {lit(i['grupo_muscular'])}, {lit(i['subgrupo'])}, {lit(i['tipo'])}, "
        f"{lit(i['padrao_movimento'])}, {lit(i['equipamento'])}, {lit(i['variacao'])})" for i in itens)
    texto = f"""-- {len(itens)} exercícios GLOBAIS novos (professor_id vazio) no Banco do Treino, SEM GIF (imagem_url nula) até os GIFs 3D.
-- Fonte: lista aberta free-exercise-db (domínio público; só nome/músculo/equipamento), nomes no padrão das academias.
-- Gerada por scripts/conteudo/novos_61.py a partir de scripts/conteudo/novos_61.json (não editar à mão).
-- Idempotente: id ou nome global que já existe não entra de novo.
-- Aplicar por schema com backup e contagens: python3 scripts/conteudo/novos_61.py aplicar --schema <staging|public>.
DO $mig$
DECLARE s text;
BEGIN
  FOREACH s IN ARRAY {LISTA_SCHEMAS} LOOP
    EXECUTE format($q$
      INSERT INTO %1$I.tb_exercicios (id, nome, grupo_muscular, subgrupo, tipo, padrao_movimento, equipamento, variacao)
      SELECT v.id::uuid, v.nome, v.grupo, v.subgrupo, v.tipo, v.padrao, v.equipamento, v.variacao
        FROM (VALUES
{valores}
        ) AS v(id, nome, grupo, subgrupo, tipo, padrao, equipamento, variacao)
       WHERE NOT EXISTS (SELECT 1 FROM %1$I.tb_exercicios e
                          WHERE e.id = v.id::uuid OR (e.professor_id IS NULL AND lower(e.nome) = lower(v.nome)))
    $q$, s);
  END LOOP;
END
$mig$;
"""
    MIGRACAO.write_text(texto, encoding="utf-8")
    print(f"migração gerada: {MIGRACAO.relative_to(RAIZ)} ({len(itens)} exercícios)")


CONFERENCIA = """select count(*)::int as total, count(*) filter (where professor_id is null)::int as globais,
  md5(string_agg(concat_ws('|', id, nome, grupo_muscular, subgrupo, imagem_url, emoji, tipo, dica, professor_id,
                           padrao_movimento, equipamento, variacao), '#' order by id) filter (where not (id = any({ids})))) as os_outros
from {s}.tb_exercicios"""


def aplicar(schema: str, dry_run: bool, backup: Path | None) -> int:
    assert schema in ("public", "staging"), schema
    itens = ler()
    ids = "array[" + ",".join(f"{lit(i['id'])}::uuid" for i in itens) + "]"
    nomes = "array[" + ",".join(lit(i["nome"].lower()) for i in itens) + "]"
    ja = {r["id"] for r in sql(f"select id::text as id from {schema}.tb_exercicios where id = any({ids})")}
    entram = [i for i in itens if i["id"] not in ja]
    conflito = sql(f"select nome from {schema}.tb_exercicios where professor_id is null and lower(nome) = any({nomes}) "
                   f"and not (id = any({ids}))")
    conf = CONFERENCIA.format(s=schema, ids=ids)
    antes = sql(conf)[0]
    print(f"[{schema}] antes: {antes}")
    print(f"[{schema}] {len(entram)} de {len(itens)} entram" + (" (dry-run: nada gravado)" if dry_run else ""))
    if conflito:
        print(f"[{schema}] ⚠️ nome global já usado por outro id (não entram): {[r['nome'] for r in conflito]}")
    if dry_run or not entram:
        return 0 if not conflito else 1
    if backup:
        backup.mkdir(parents=True, exist_ok=True)
        backup.chmod(0o700)
        salvar_json(backup / f"{schema}.tb_exercicios.json", sql(f"select * from {schema}.tb_exercicios order by id"))
    texto = MIGRACAO.read_text(encoding="utf-8")
    if LISTA_SCHEMAS not in texto:
        raise SystemExit("a migração não tem a lista de schemas esperada")
    sql(texto.replace(LISTA_SCHEMAS, f"ARRAY[{lit(schema)}]"))
    depois = sql(conf)[0]
    no_banco = {r["id"]: r for r in sql(
        f"select id::text as id, {', '.join(CAMPOS)} from {schema}.tb_exercicios "
        f"where id = any({ids}) and imagem_url is null and professor_id is null")}
    diferentes = [i["nome"] for i in itens if any(no_banco.get(i["id"], {}).get(c) != i[c] for c in CAMPOS)]
    ok = (depois["os_outros"] == antes["os_outros"] and depois["total"] == antes["total"] + len(entram) and not diferentes)
    print(f"[{schema}] depois: {depois}")
    if diferentes:
        print(f"[{schema}] fora do esperado no banco: {diferentes}")
    print(f"[{schema}] {'OK: os 61 globais e sem GIF, iguais ao JSON; os outros exercícios iguais' if ok else 'FALHOU'}")
    if backup:
        salvar_json(backup / f"{schema}.relatorio_novos61.json",
                    {"antes": antes, "depois": depois, "entraram": [i["nome"] for i in entram], "diferentes": diferentes, "ok": ok})
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
