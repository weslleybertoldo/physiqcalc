#!/usr/bin/env python3
"""Physiq — nomes dos 81 exercícios GLOBAIS no padrão das academias (32 mudam) no BANCO DO TREINO.

Fonte: docs/exercicios-equivalencia.csv (coluna nome, já com os nomes novos) + RENOMEIA abaixo (id, nome antigo, nome novo).
A migração supabase/migrations/20261003230000_nomes_81_padrao_academias.sql é GERADA daqui (`gerar`) e muda SÓ o nome dos 32
(nunca id, grupo, subgrupo, imagem, dica, tipo nem a classificação da W9). Idempotente: a linha que já tem o nome novo não é tocada.
Os GIFs seguem com o título antigo até os GIFs 3D novos (decisão do Weslley, 03/10/2026); o gerador (scripts/gifs_catalogo) fica
com os nomes antigos pelo mesmo motivo.

Uso:
  python3 scripts/conteudo/nomes_81.py gerar                      # CSV → migração (confere CSV, RENOMEIA e treinos prontos)
  python3 scripts/conteudo/nomes_81.py aplicar --schema staging --dry-run
  python3 scripts/conteudo/nomes_81.py aplicar --schema staging --backup ~/backups/physiq/<data>-nomes81
  python3 scripts/conteudo/nomes_81.py aplicar --schema public  --backup ~/backups/physiq/<data>-nomes81
`aplicar` faz: confere que cada um dos 32 está com o nome antigo ou o novo (outro nome = para) → contagens e a soma de conferência
das colunas que NÃO podem mudar → backup → a migração só no schema pedido → contagens de novo → relatório. SQL pela Management API.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "virada"))
from _base import TREINO_REF, http, lit, pat, salvar_json  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent.parent
CSV = RAIZ / "docs" / "exercicios-equivalencia.csv"
MIGRACAO = RAIZ / "supabase" / "migrations" / "20261003230000_nomes_81_padrao_academias.sql"
TREINOS_PRONTOS = Path(__file__).resolve().parent / "treinos_prontos.json"
LISTA_SCHEMAS = "ARRAY['public','staging']"

# (id, nome antigo, nome novo) — proposta aprovada pelo Weslley em 03/10/2026
RENOMEIA = [
    ("6e06bce6-1909-4f5d-902b-ea3c80695aec", "Abdutora", "Cadeira Abdutora"),
    ("a7f62fd1-842d-4ae0-83ee-c62e902efb7b", "Adutora", "Cadeira Adutora"),
    ("17e52ced-abc2-41a1-8776-c6162309e306", "Abdominais na Máquina", "Abdominal na Máquina"),
    ("59c92f5d-312e-422c-b9fb-e6e60ef05997", "Abdominal Oblíquo com Pé no Banco", "Abdominal Oblíquo com Pés no Banco"),
    ("821c3148-1817-40a2-9598-86388a81f577", "Abdominal Supra no Solo", "Abdominal Supra"),
    ("0eed6ebd-c8bf-4e47-b1af-d59d52f8eaf9", "Rosca Alternada no Banco Inclinado", "Rosca Alternada Inclinada com Halteres"),
    ("61bcf40c-6a82-423b-99e5-0adc11190b67", "Rosca Concentrada", "Rosca Concentrada com Halter"),
    ("9ff64ebf-6c63-4151-a8f7-0b2380a094cf", "Rosca Scott na máquina", "Rosca Scott na Máquina"),
    ("c2c93530-bb75-4501-b827-b70e387e8912", "Rosca Punho com Halter Apoiado", "Rosca Punho com Halter"),
    ("4a151e92-a1f1-473d-a6df-51235d68d77c", "Corrida", "Corrida na Esteira"),
    ("d15af9c4-3439-462f-a95b-4139e6627a82", "Puxada Alta na Polia", "Puxada Frontal"),
    ("a4e3d8c8-48be-4446-b9c8-c78ba0a74fa6", "Puxada Aberta Frontal", "Puxada Frontal Aberta"),
    ("1ad63bb7-2a99-40a0-a5e4-78b2749d780e", "Puxada Fechada Frontal", "Puxada Frontal Fechada"),
    ("ca81c43e-1360-44a6-a8d4-784ed0dd6fa0", "Puxada Fechada Supinada", "Puxada Frontal Supinada"),
    ("e9241c10-9aaf-4ea5-badf-2b42ad3e4ffc", "Crucifixo Invertido Sentado", "Crucifixo Invertido na Máquina"),
    ("6f78e74c-c4db-400e-8e26-47d06638a770", "Crucifixo Invertido", "Crucifixo Invertido com Halteres"),
    ("232c2ac4-7fd8-4145-8dba-76cf121dcb87", "Remada Unilateral com Halter", "Remada Unilateral com Halter (Serrote)"),
    ("59b8f69d-3b31-45e2-ae12-f12369b45dfb", "Remada na Polia Sentado", "Remada Baixa na Polia"),
    ("5be8bb3e-992c-47be-adc2-cee8328cb48f", "Coice na Polia Baixa", "Coice de Glúteo na Polia"),
    ("8fa6d8ea-d37a-492a-82fc-30da35333b15", "Elevação Pélvica", "Elevação Pélvica com Barra"),
    ("ebaa51d6-b407-40ad-9909-ee07cfb85448", "Flexora Deitado", "Mesa Flexora"),
    ("3e848d7d-77d6-47b3-a200-9d49d4e271b0", "Flexora de Perna Sentado", "Cadeira Flexora"),
    ("919d1ad4-42d6-4407-89b9-2f7007a3e1ba", "Panturrilha na Máquina", "Panturrilha Sentado na Máquina"),
    ("f09b4daa-fcfd-4baa-9696-0d9571457ee9", "Supino Inclinado", "Supino Inclinado com Barra"),
    ("f06e45bc-a6c7-4939-92d1-3d6fafa4a534", "Agachamento Livre", "Agachamento Livre com Barra"),
    ("e55a6426-e367-40e1-a127-3c3dc30090ec", "Extensora", "Cadeira Extensora"),
    ("cbf903f0-b43d-4ee7-8be1-f2eee6eb71a2", "Agachamento Búlgaro", "Agachamento Búlgaro com Halteres"),
    ("5143c9ed-f192-4a84-a2b0-9ce146ac8d9c", "Agachamento Sumô", "Agachamento Sumô com Halteres"),
    ("d06298a4-bcc3-43f3-a681-765b58315ea4", "Agachamento na Máquina", "Agachamento no Smith"),
    ("3274a384-ff2e-4ebf-8350-aea78367ee71", "Leg Press", "Leg Press 45°"),
    ("4e5b8db8-6778-47a1-a15a-3e94e8a21713", "Mergulho (Tríceps)", "Mergulho nas Paralelas"),
    ("c7016a9d-1af3-4238-929f-adae75005ce6", "Tríceps Testa", "Tríceps Testa com Barra"),
]


def sql(query: str) -> list:
    st, r = http("POST", f"https://api.supabase.com/v1/projects/{TREINO_REF}/database/query", {"query": query},
                 {"Authorization": f"Bearer {pat()}"}, timeout=300)
    if st not in (200, 201):
        raise RuntimeError(f"SQL Treino HTTP {st}: {str(r)[:800]}")
    return r or []


def ler_csv() -> dict[str, str]:
    """id → nome do CSV, conferido contra RENOMEIA (os 32 com o nome novo, nenhum nome repetido)."""
    with CSV.open(encoding="utf-8", newline="") as f:
        nomes = {l["id"]: l["nome"] for l in csv.DictReader(f)}
    erros = [f"{i}: CSV '{nomes.get(i)}' ≠ novo '{novo}'" for i, _, novo in RENOMEIA if nomes.get(i) != novo]
    if len(RENOMEIA) != 32 or len({i for i, _, _ in RENOMEIA}) != 32:
        erros.append("RENOMEIA tem que ter 32 ids diferentes")
    if len(set(nomes.values())) != len(nomes):
        erros.append("nome repetido no CSV")
    if erros:
        raise SystemExit("CSV × RENOMEIA:\n  " + "\n  ".join(erros))
    return nomes


def gerar() -> None:
    nomes = ler_csv()
    valores = ",\n".join(f"          ({lit(i)}, {lit(novo)})" for i, _, novo in RENOMEIA)
    texto = f"""-- Nomes dos exercícios GLOBAIS (professor_id vazio) do Banco do Treino no padrão das academias: 32 dos 81 mudam.
-- Gerada por scripts/conteudo/nomes_81.py a partir de docs/exercicios-equivalencia.csv (não editar à mão).
-- Muda SÓ o nome; id, grupo, subgrupo, imagem, dica, tipo e a classificação da W9 ficam. Os GIFs seguem com o título antigo.
-- Idempotente: a linha que já tem o nome novo não é tocada (rodar de novo não reenvia nada pelo PowerSync).
-- Aplicar por schema com backup e contagens: python3 scripts/conteudo/nomes_81.py aplicar --schema <staging|public>.
DO $mig$
DECLARE s text;
BEGIN
  FOREACH s IN ARRAY {LISTA_SCHEMAS} LOOP
    EXECUTE format($q$
      UPDATE %I.tb_exercicios AS e
         SET nome = v.nome
        FROM (VALUES
{valores}
        ) AS v(id, nome)
       WHERE e.id = v.id::uuid
         AND e.professor_id IS NULL
         AND e.nome IS DISTINCT FROM v.nome
    $q$, s);
  END LOOP;
END
$mig$;
"""
    MIGRACAO.write_text(texto, encoding="utf-8")
    print(f"migração gerada: {MIGRACAO.relative_to(RAIZ)} ({len(RENOMEIA)} exercícios)")
    # os treinos prontos da W7b usam exercícios da biblioteca pelo NOME: todos têm que existir com o nome novo
    usados = {x["exercicio"] for t in json.loads(TREINOS_PRONTOS.read_text(encoding="utf-8"))["treinos"] for g in t["grupos"] for x in g["exercicios"]}
    fora = sorted(usados - set(nomes.values()))
    print(f"treinos prontos: {len(usados)} exercícios usados, {len(usados) - len(fora)} na biblioteca" + (f" — FORA: {fora}" if fora else ""))
    if fora:
        raise SystemExit(1)


CONFERENCIA = """select count(*)::int as total,
  count(*) filter (where professor_id is null)::int as globais,
  md5(string_agg(concat_ws('|', id, grupo_muscular, subgrupo, imagem_url, emoji, tipo, dica, professor_id,
                           padrao_movimento, equipamento, variacao), '#' order by id)) as intocaveis,
  md5(string_agg(concat_ws('|', id, nome), '#' order by id) filter (where not (id = any({ids})))) as outros_nomes
from {s}.tb_exercicios"""


def aplicar(schema: str, dry_run: bool, backup: Path | None) -> int:
    assert schema in ("public", "staging"), schema
    ler_csv()
    ids = "array[" + ",".join(f"{lit(i)}::uuid" for i, _, _ in RENOMEIA) + "]"
    atuais = {r["id"]: r for r in sql(f"select id::text as id, nome, professor_id::text as professor_id from {schema}.tb_exercicios "
                                      f"where id = any({ids})")}
    erros = [f"{antigo}: não existe" for i, antigo, _ in RENOMEIA if i not in atuais]
    erros += [f"{antigo}: é de professor" for i, antigo, _ in RENOMEIA if i in atuais and atuais[i]["professor_id"]]
    erros += [f"{antigo}: está como '{atuais[i]['nome']}'" for i, antigo, novo in RENOMEIA
              if i in atuais and atuais[i]["nome"] not in (antigo, novo)]
    if erros:
        print(f"[{schema}] PARADO:\n  " + "\n  ".join(erros))
        return 1
    mudam = [(antigo, novo) for i, antigo, novo in RENOMEIA if atuais[i]["nome"] != novo]
    conf = CONFERENCIA.format(s=schema, ids=ids)
    antes = sql(conf)[0]
    print(f"[{schema}] antes: {antes}")
    print(f"[{schema}] {len(mudam)} de {len(RENOMEIA)} mudam de nome" + (" (dry-run: nada gravado)" if dry_run else ""))
    for antigo, novo in mudam:
        print(f"    {antigo} → {novo}")
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
    depois = sql(conf)[0]
    agora = {r["id"]: r["nome"] for r in sql(f"select id::text as id, nome from {schema}.tb_exercicios where id = any({ids})")}
    novos_ok = all(agora.get(i) == novo for i, _, novo in RENOMEIA)
    print(f"[{schema}] depois: {depois}")
    ok = novos_ok and all(depois[k] == antes[k] for k in ("total", "globais", "intocaveis", "outros_nomes"))
    relatorio = {"schema": schema, "antes": antes, "depois": depois, "mudaram": mudam, "ok": ok}
    if backup:
        salvar_json(backup / f"{schema}.relatorio_nomes81.json", relatorio)
    print(f"[{schema}] {'OK: os 32 com o nome novo; total, outros nomes e colunas intocáveis iguais' if ok else 'FALHOU: ' + json.dumps(relatorio, ensure_ascii=False)}")
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
