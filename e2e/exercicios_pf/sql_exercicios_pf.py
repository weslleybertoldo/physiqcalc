#!/usr/bin/env python3
"""Physiq — os 3 exercícios GLOBAIS novos (supabase/migrations/20261012110000_exercicios_novos_personal_fit.sql; pedido do Weslley em
12/10/2026, para a migração de um personal) no banco do Treino, SÓ LEITURA (vale em staging e em produção). Placar N/N:
  por exercício  existe uma vez (o id fixo) · o id certo (o global com esse nome, sem caixa, é só ele) · global, sem GIF e sem dica
                 (professor_id, imagem_url e dica nulos) · a classificação esperada (nome, grupo, subgrupo, tipo, movimento,
                 equipamento, variação) · a Biblioteca acha (RPC exercicios_da_lista, escopo global, busca pelo nome sem acento)
  catálogo       nenhum nome global repetido (sem caixa) · o total de globais (147 = os 144 + os 3; --globais N para outro número)
Antes da migration os 3 ficam ❌ (o vermelho); depois do aplicar.py, N/N.
  --seco  autoteste SEM banco: a migration tem as 3 linhas de ESPERADOS (e2e/exercicios_pf/_base.py) e só o INSERT idempotente do
          molde; ids uuid5; movimento e equipamento das listas fixas de src/treino/equivalencia.ts e o grupo do bloco do movimento
          (src/lib/gruposMusculares.ts); nenhum nome igual aos do catálogo do repo (os 81, os 61 e o tríceps testa); os blocos do
          aplicar.py (dry-run e de verdade) bem formados para o schema pedido.
Uso: PYTHONDONTWRITEBYTECODE=1 python3 e2e/exercicios_pf/sql_exercicios_pf.py --schema staging|public [--seco] [--globais N]
Ensaio local: TREINO_CONN="host=<pasta do socket> dbname=postgres user=postgres" (um Postgres descartável).
Saída sem dado pessoal: só o catálogo global.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import uuid
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import _base as B  # noqa: E402

INSERT = "INSERT INTO %1$I.tb_exercicios (id, nome, grupo_muscular, subgrupo, tipo, padrao_movimento, equipamento, variacao)"
GUARDA = "WHERE e.id = v.id::uuid OR (e.professor_id IS NULL AND lower(e.nome) = lower(v.nome))"


# ───────────────────────── no banco (só leitura) ─────────────────────────

def no_banco(p: B.Placar, s: str, globais_esperados: int) -> None:
    print(f"[{s}] banco: {B.destino()} (só leitura)")
    linhas = B.linhas_dos_3(s)
    for e in B.ESPERADOS:
        com_id = [l for l in linhas if l["id"] == e["id"]]
        p.check(len(com_id) == 1, f"[{s}] {e['nome']}: existe uma vez (id {e['id'][:8]}) → {len(com_id)}")
        mesmo_nome = sorted(l["id"] for l in linhas if l["professor_id"] is None and l["nome"].lower() == e["nome"].lower())
        p.check(mesmo_nome == [e["id"]], f"[{s}] {e['nome']}: o id certo (o global com esse nome é só ele) → {[i[:8] for i in mesmo_nome]}")
        l = com_id[0] if com_id else {}
        p.check(bool(com_id) and l["professor_id"] is None and l["imagem_url"] is None and l["dica"] is None,
                f"[{s}] {e['nome']}: global, sem GIF e sem dica (professor_id, imagem_url e dica nulos)")
        dif = B.diferencas(e, l) if com_id else {"linha": "não existe"}
        p.check(not dif, f"[{s}] {e['nome']}: classificação esperada ({e['grupo_muscular']} · {e['padrao_movimento']} · "
                         f"{e['equipamento']} · {e['variacao']})" + (f" → diferente: {dif}" if dif else ""))
        termo = B.sem_acento(e["nome"]).lower()
        p.check(B.biblioteca_acha(s, e), f"[{s}] {e['nome']}: a Biblioteca acha (exercicios_da_lista, escopo global, busca {termo!r})")
    rep = B.ler(f"select lower(nome) as nome, count(*)::int as n from {s}.tb_exercicios where professor_id is null group by 1 "
                f"having count(*) > 1")
    p.check(not rep, f"[{s}] nenhum nome global repetido (sem caixa) → {rep}")
    f = B.foto(s)
    p.check(f["globais"] == globais_esperados,
            f"[{s}] total de globais {f['globais']} (esperado {globais_esperados}); {f['globais_sem_imagem']} sem GIF")


# ───────────────────────── --seco (sem banco) ─────────────────────────

def sem_banco() -> None:
    def recusa(*_a, **_k):
        raise RuntimeError("o --seco não vai ao banco")
    B._comum.sql_treino = recusa
    B._comum.exec_treino = recusa


def listas_fixas() -> tuple[set[str], set[str], dict[str, str], dict[str, str]]:
    """Do próprio código (uma fonte só): movimentos, equipamentos, movimento → bloco e bloco → grupo padrão."""
    ts = (B.REPO / "src" / "treino" / "equivalencia.ts").read_text(encoding="utf-8")
    eq = ts.split("export const EQUIPAMENTOS", 1)[1].split("] as const", 1)[0]
    pd = ts.split("export const PADROES", 1)[1].split("] as const", 1)[0]
    bloco_do_padrao = dict(re.findall(r'chave: "([a-z_]+)", rotulo: "[^"]*", bloco: "([a-z_]+)"', pd))
    gm = (B.REPO / "src" / "lib" / "gruposMusculares.ts").read_text(encoding="utf-8")
    grupo_do_bloco = dict(re.findall(r'key: "([a-z_]+)", nome: "[^"]*", emoji: "[^"]*", grupoPadrao: "([^"]+)"', gm))
    return set(bloco_do_padrao), set(re.findall(r'chave: "([a-z_]+)"', eq)), bloco_do_padrao, grupo_do_bloco


def nomes_do_repo() -> set[str]:
    """Os nomes globais que o repo conhece: os 81 (docs/exercicios-equivalencia.csv), os 61 (scripts/conteudo/novos_61.json) e o
    da 20261005190000 (tríceps testa)."""
    with (B.REPO / "docs" / "exercicios-equivalencia.csv").open(encoding="utf-8", newline="") as f:
        nomes = {l["nome"].lower() for l in csv.DictReader(f)}
    nomes |= {e["nome"].lower() for e in json.loads((B.REPO / "scripts/conteudo/novos_61.json").read_text(encoding="utf-8"))}
    triceps = (B.REPO / "supabase/migrations/20261005190000_exercicio_triceps_testa_na_polia_alta_em_pe.sql").read_text(encoding="utf-8")
    nomes |= {n.lower() for n in re.findall(r"^\s*\('[0-9a-f-]{36}', '([^']+)'", triceps, re.M)}
    return nomes


def seco(p: B.Placar, s: str) -> None:
    texto = B.migracao_texto()
    codigo = re.sub(r"--[^\n]*", "", texto)   # sem os comentários
    p.check(texto.count(B.LISTA_SCHEMAS) == 1, f"a migration tem {B.LISTA_SCHEMAS} uma vez só ({B.MIGRACAO.name})")
    p.check(codigo.count(INSERT) == 1, "o INSERT com as colunas do molde (sem imagem_url, professor_id, dica nem emoji)")
    p.check(codigo.count(GUARDA) == 1, "idempotente: id ou nome global igual (sem caixa) não entra de novo")
    p.check(not re.search(r"\b(update|delete|truncate|drop|alter|create|grant|revoke|copy)\b", codigo, re.I),
            "só INSERT: nada de UPDATE, DELETE, DDL ou grant")
    tuplas = re.findall(r"^\s*\('[0-9a-f-]{36}'.*\)", codigo, re.M)
    p.check(len(tuplas) == len(B.ESPERADOS) == 3, f"3 linhas no VALUES → {len(tuplas)}")
    padroes, equipamentos, bloco_do_padrao, grupo_do_bloco = listas_fixas()
    do_repo = nomes_do_repo()
    p.check(len(do_repo) == 143, f"o repo conhece 143 nomes globais (81 + 61 + 1) → {len(do_repo)}")
    for e in B.ESPERADOS:
        n = e["nome"]
        p.check(codigo.count(B.tupla_da_migracao(e)) == 1, f"{n}: a linha da migration = a decisão (ESPERADOS)")
        p.check(e["id"] == str(uuid.uuid5(uuid.NAMESPACE_URL, B.URL_DO_ID + e["slug"])),
                f"{n}: id {e['id'][:8]} = uuid5(NAMESPACE_URL, '{B.URL_DO_ID}{e['slug']}')")
        p.check(e["padrao_movimento"] in padroes and e["equipamento"] in equipamentos and e["tipo"] == "musculacao",
                f"{n}: movimento {e['padrao_movimento']} e equipamento {e['equipamento']} das listas fixas; tipo musculacao")
        bloco = bloco_do_padrao.get(e["padrao_movimento"])
        p.check(grupo_do_bloco.get(bloco or "") == e["grupo_muscular"],
                f"{n}: grupo {e['grupo_muscular']} = o grupo padrão do bloco do movimento ({bloco})")
        p.check(B.sem_acento(e["subgrupo"]).lower().startswith(B.sem_acento(e["grupo_muscular"]).lower()),
                f"{n}: o músculo principal do subgrupo é o do grupo ({e['subgrupo'].split(' · ')[0]})")
        p.check(n.lower() not in do_repo, f"{n}: nenhum nome igual no catálogo do repo")
    p.check(len({e["nome"].lower() for e in B.ESPERADOS}) == 3 and len({e["id"] for e in B.ESPERADOS}) == 3, "os 3 com nome e id distintos")
    outro = "public" if s == "staging" else "staging"
    mig = B.migracao_do_schema(s)
    p.check(f"ARRAY['{s}']" in mig and B.LISTA_SCHEMAS not in mig and f"'{outro}'" not in re.sub(r"--[^\n]*", "", mig),
            f"[{s}] a migration do schema: ARRAY['{s}'] e nada do {outro}")
    for dry in (True, False):
        b = B.bloco(s, B.GLOBAIS_DEPOIS, dry_run=dry)
        sem_coment = re.sub(r"--[^\n]*", "", b)
        fim = "ROLLBACK;" if dry else "COMMIT;"
        marca = "RAISE EXCEPTION 'RESULTADO<<%>>', r;" if dry else f"<> {B.GLOBAIS_DEPOIS} OR (r->>'os_3')::int <> 3"
        p.check(b.startswith("BEGIN;\n") and b.rstrip().endswith(fim) and b.count("DO $mig$") == 1 and b.count("DO $pf$") == 1
                and marca in b and f"{outro}.tb_exercicios" not in sem_coment and f"'{outro}'" not in sem_coment
                and sem_coment.count(f"{s}.tb_exercicios") == 3,
                f"[{s}] o bloco {'do dry-run' if dry else 'de verdade'}: BEGIN → a migration só no {s} → a conferência → {fim}")
    exemplo = 'psql: ERROR:  RESULTADO<<{"globais" : 9999, "os_3" : 3, "repetidos" : 999}>>'
    p.check(len(exemplo) < 200 and B.resultado_do_erro(RuntimeError(exemplo), "RESULTADO") == {"globais": 9999, "os_3": 3, "repetidos": 999},
            "o resultado do bloco volta inteiro na mensagem do erro (bem abaixo do corte de 500 do exec_treino)")


def main() -> int:
    ap = argparse.ArgumentParser(description="os 3 exercícios globais novos no banco do Treino (só leitura)")
    ap.add_argument("--schema", choices=B.SCHEMAS, help="staging ou public (obrigatório)")
    ap.add_argument("--seco", action="store_true", help="autoteste sem banco")
    ap.add_argument("--globais", type=int, default=B.GLOBAIS_DEPOIS, help=f"total de globais esperado (padrão {B.GLOBAIS_DEPOIS})")
    a = ap.parse_args()
    if not a.schema:
        ap.error("--schema staging|public é obrigatório")
    p = B.Placar()
    if a.seco:
        sem_banco()
        seco(p, a.schema)
    else:
        no_banco(p, a.schema, a.globais)
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
