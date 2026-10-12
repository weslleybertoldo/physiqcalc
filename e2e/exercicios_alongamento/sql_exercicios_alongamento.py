#!/usr/bin/env python3
"""Physiq — a categoria "Alongamento e mobilidade" (supabase/migrations/20261012150000_exercicios_alongamento_mobilidade.sql; pedido
do Weslley em 12/10/2026) no banco do Treino, SÓ LEITURA (vale em staging e em produção). Placar N/N:
  por exercício (9)  existe uma vez (o id fixo) · o id certo (o global com esse nome, sem caixa, é só ele) · global, sem GIF e sem
                     dica · a classificação esperada (nome, grupo, subgrupo, tipo, movimento, equipamento, variação) · a Biblioteca
                     acha (RPC exercicios_da_lista, escopo global, busca pelo nome sem acento)
  o chip do bloco    a Biblioteca com `musculos` = os 2 grupos (o que a tela do bloco novo manda) mostra os 9 e só eles
  por grupo (2)      existe uma vez (o id fixo) · a linha com esse nome (sem caixa, na tabela inteira) é só ela · global como as
                     23 (professor_id e criado_por nulos) e o nome exato
  catálogo           os 9 com o grupo na lista de grupos globais · nenhum nome global repetido · o total de globais (156 = os 147 +
                     os 9; --globais N) · os 147 de antes com a mesma classificação (a soma lida em 12/10, antes da migration; sem
                     imagem nem created_at, que o lote dos GIFs muda) · nenhum nome de grupo repetido · o total de grupos globais
                     (25 = os 23 + os 2; --grupos N) · os 23 de antes iguais (a linha inteira)
59 itens. Antes da migration, só os 4 "nada repetido / os de antes iguais" passam (o vermelho 4/59); depois do aplicar.py, 59/59.
  --seco  autoteste SEM banco: a migration tem as 9 + 2 linhas de ESPERADOS e GRUPOS (e2e/exercicios_alongamento/_base.py) e só os
          INSERTs idempotentes; ids uuid5; movimento um dos 6 do bloco novo e equipamento da lista fixa; o FRONT conhece o
          movimento no bloco `alongamento` (src/treino/equivalencia.ts) e põe os 2 grupos nesse bloco (src/lib/gruposMusculares.ts);
          nenhum nome igual aos do catálogo do repo; os blocos do aplicar.py (dry-run e de verdade) bem formados para o schema pedido.
          81 itens; com --sem-front, 62 (sem as 19 conferências com src/, para a parte do banco antes de o front entrar).
Uso: PYTHONDONTWRITEBYTECODE=1 python3 e2e/exercicios_alongamento/sql_exercicios_alongamento.py --schema staging|public
     [--seco [--sem-front]] [--globais N] [--grupos N]
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
INSERT_GRUPO = "INSERT INTO %1$I.grupos_musculares (id, nome)"
GUARDA_GRUPO = "WHERE g.id = v.id::uuid OR lower(g.nome) = lower(v.nome)"


# ───────────────────────── no banco (só leitura) ─────────────────────────

def no_banco(p: B.Placar, s: str, globais_esperados: int, grupos_esperados: int) -> None:
    print(f"[{s}] banco: {B.destino()} (só leitura)")
    linhas = B.linhas_dos_9(s)
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
    do_bloco = B.biblioteca_do_bloco(s)
    p.check(do_bloco == sorted(e["id"] for e in B.ESPERADOS),
            f"[{s}] o chip do bloco novo: a Biblioteca com musculos {[g['nome'].lower() for g in B.GRUPOS]} mostra os 9 e só eles → "
            f"{len(do_bloco)}")
    grupos = B.linhas_dos_2(s)
    for g in B.GRUPOS:
        com_id = [l for l in grupos if l["id"] == g["id"]]
        p.check(len(com_id) == 1, f"[{s}] grupo {g['nome']}: existe uma vez (id {g['id'][:8]}) → {len(com_id)}")
        mesmo_nome = sorted(l["id"] for l in grupos if l["nome"].lower() == g["nome"].lower())
        p.check(mesmo_nome == [g["id"]], f"[{s}] grupo {g['nome']}: a linha com esse nome (tabela inteira) é só ela → "
                                         f"{[i[:8] for i in mesmo_nome]}")
        l = com_id[0] if com_id else {}
        p.check(bool(com_id) and l["nome"] == g["nome"] and l["professor_id"] is None and l["criado_por"] is None,
                f"[{s}] grupo {g['nome']}: global como as 23 (professor_id e criado_por nulos) e o nome exato")
    nomes_grupos = {r["nome"] for r in B.ler(f"select nome from {s}.grupos_musculares where professor_id is null")}
    sem_grupo = sorted({l["grupo_muscular"] for l in linhas if l["id"] in {e["id"] for e in B.ESPERADOS}} - nomes_grupos)
    p.check(len(linhas) >= len(B.ESPERADOS) and not sem_grupo,
            f"[{s}] os 9 com o grupo na lista de grupos globais (o botão \"Grupos musculares\")" + (f" → faltam {sem_grupo}" if sem_grupo else ""))
    rep = B.ler(f"select lower(nome) as nome, count(*)::int as n from {s}.tb_exercicios where professor_id is null group by 1 "
                f"having count(*) > 1")
    p.check(not rep, f"[{s}] nenhum nome global repetido (sem caixa) → {rep}")
    f = B.foto(s)
    p.check(f["globais"] == globais_esperados,
            f"[{s}] total de globais {f['globais']} (esperado {globais_esperados}); {f['globais_sem_imagem']} sem GIF")
    p.check(f["classif_outros"] == B.SOMA_147[s],
            f"[{s}] os 147 de antes com a mesma classificação (soma {f['classif_outros'][:12]}… × {B.SOMA_147[s][:12]}… de 12/10)")
    rep_g = B.ler(f"select lower(nome) as nome, count(*)::int as n from {s}.grupos_musculares group by 1 having count(*) > 1")
    p.check(not rep_g, f"[{s}] nenhum nome de grupo repetido (sem caixa, tabela inteira) → {rep_g}")
    p.check(f["grupos"] == grupos_esperados, f"[{s}] total de grupos globais {f['grupos']} (esperado {grupos_esperados})")
    p.check(f["outros_grupos"] == B.SOMA_23[s],
            f"[{s}] os 23 grupos de antes iguais (a linha inteira; soma {f['outros_grupos'][:12]}… × {B.SOMA_23[s][:12]}… de 12/10)")


# ───────────────────────── --seco (sem banco) ─────────────────────────

def sem_banco() -> None:
    def recusa(*_a, **_k):
        raise RuntimeError("o --seco não vai ao banco")
    B._comum.sql_treino = recusa
    B._comum.exec_treino = recusa


def do_front() -> tuple[dict[str, str], set[str], dict[str, str], set[str]]:
    """Do próprio código (uma fonte só): movimento → bloco, equipamentos, músculo primário → bloco e as chaves dos blocos."""
    ts = (B.REPO / "src" / "treino" / "equivalencia.ts").read_text(encoding="utf-8")
    eq = ts.split("export const EQUIPAMENTOS", 1)[1].split("] as const", 1)[0]
    pd = ts.split("export const PADROES", 1)[1].split("] as const", 1)[0]
    bloco_do_padrao = dict(re.findall(r'chave:\s*"([a-z_]+)",\s*rotulo:\s*"[^"]*",\s*bloco:\s*"([a-z_]+)"', pd))
    gm = (B.REPO / "src" / "lib" / "gruposMusculares.ts").read_text(encoding="utf-8")
    mapa = gm.split("const MAPA_PRIMARIO", 1)[1].split("};", 1)[0]
    bloco_do_musculo = dict(re.findall(r'^\s*"?([a-z][a-z ]*)"?\s*:\s*"([a-z_]+)"', mapa, re.M))
    blocos = gm.split("export const BLOCOS_MUSCULARES", 1)[1].split("];", 1)[0]
    return bloco_do_padrao, set(re.findall(r'chave:\s*"([a-z_]+)"', eq)), bloco_do_musculo, set(re.findall(r'key:\s*"([a-z_]+)"', blocos))


def nomes_do_repo() -> set[str]:
    """Os nomes globais que o repo conhece: os 81 (docs/exercicios-equivalencia.csv), os 61 (scripts/conteudo/novos_61.json), o da
    20261005190000 (tríceps testa) e os 3 da 20261012110000."""
    with (B.REPO / "docs" / "exercicios-equivalencia.csv").open(encoding="utf-8", newline="") as f:
        nomes = {l["nome"].lower() for l in csv.DictReader(f)}
    nomes |= {e["nome"].lower() for e in json.loads((B.REPO / "scripts/conteudo/novos_61.json").read_text(encoding="utf-8"))}
    for mig in ("20261005190000_exercicio_triceps_testa_na_polia_alta_em_pe.sql", "20261012110000_exercicios_novos_personal_fit.sql"):
        texto = (B.REPO / "supabase/migrations" / mig).read_text(encoding="utf-8")
        nomes |= {n.lower() for n in re.findall(r"^\s*\('[0-9a-f-]{36}', '([^']+)'", texto, re.M)}
    return nomes


def seco(p: B.Placar, s: str, front: bool = True) -> None:
    texto = B.migracao_texto()
    codigo = re.sub(r"--[^\n]*", "", texto)   # sem os comentários
    p.check(texto.count(B.LISTA_SCHEMAS) == 1, f"a migration tem {B.LISTA_SCHEMAS} uma vez só ({B.MIGRACAO.name})")
    p.check(codigo.count(INSERT) == 1, "o INSERT dos exercícios com as colunas do molde (sem imagem_url, professor_id, dica nem emoji)")
    p.check(codigo.count(INSERT_GRUPO) == 1, "o INSERT dos grupos só com id e nome (professor_id e criado_por nulos, created_at padrão)")
    p.check(codigo.count(GUARDA) == 1, "idempotente nos exercícios: id ou nome global igual (sem caixa) não entra de novo")
    p.check(codigo.count(GUARDA_GRUPO) == 1, "idempotente nos grupos: id ou o mesmo nome (sem caixa) em qualquer linha (UNIQUE (nome))")
    p.check(not re.search(r"\b(update|delete|truncate|drop|alter|create|grant|revoke|copy)\b", codigo, re.I),
            "só INSERT: nada de UPDATE, DELETE, DDL ou grant")
    tuplas = re.findall(r"^\s*\('[0-9a-f-]{36}'.*\)", codigo, re.M)
    p.check(len(tuplas) == len(B.ESPERADOS) + len(B.GRUPOS) == 11, f"11 linhas nos VALUES (9 exercícios + 2 grupos) → {len(tuplas)}")
    bloco_do_padrao, equipamentos, bloco_do_musculo, blocos = do_front()
    do_repo = nomes_do_repo()
    p.check(len(do_repo) == 146, f"o repo conhece 146 nomes globais (81 + 61 + 1 + 3) → {len(do_repo)}")
    if front:
        p.check(B.BLOCO in blocos, f"o front tem o bloco {B.BLOCO!r} em BLOCOS_MUSCULARES (src/lib/gruposMusculares.ts) → {sorted(blocos)}")
    nomes_dos_grupos = {g["nome"] for g in B.GRUPOS}
    for e in B.ESPERADOS:
        n = e["nome"]
        p.check(codigo.count(B.tupla_da_migracao(e)) == 1, f"{n}: a linha da migration = a decisão (ESPERADOS)")
        p.check(e["id"] == str(uuid.uuid5(uuid.NAMESPACE_URL, B.URL_DO_ID + e["slug"])),
                f"{n}: id {e['id'][:8]} = uuid5(NAMESPACE_URL, '{B.URL_DO_ID}{e['slug']}')")
        p.check(e["padrao_movimento"] in B.MOVIMENTOS and e["equipamento"] == "peso_corporal" and "peso_corporal" in equipamentos
                and e["tipo"] == "musculacao",
                f"{n}: movimento {e['padrao_movimento']} (um dos 6 do bloco novo), equipamento peso_corporal (lista fixa), tipo musculacao")
        p.check(e["grupo_muscular"] in nomes_dos_grupos, f"{n}: grupo {e['grupo_muscular']} = um dos 2 grupos novos")
        if front:
            p.check(bloco_do_padrao.get(e["padrao_movimento"]) == B.BLOCO,
                    f"{n}: o front conhece o movimento {e['padrao_movimento']} no bloco {B.BLOCO} (src/treino/equivalencia.ts) → "
                    f"{bloco_do_padrao.get(e['padrao_movimento'])}")
            primario = B.sem_acento(e["grupo_muscular"].split("/")[0]).strip().lower()
            p.check(bloco_do_musculo.get(primario) == B.BLOCO,
                    f"{n}: o front põe o grupo {e['grupo_muscular']} no bloco {B.BLOCO} (MAPA_PRIMARIO de src/lib/gruposMusculares.ts) → "
                    f"{bloco_do_musculo.get(primario)}")
        p.check(n.lower() not in do_repo, f"{n}: nenhum nome igual no catálogo do repo")
    for g in B.GRUPOS:
        p.check(codigo.count(B.tupla_do_grupo(g)) == 1, f"grupo {g['nome']}: a linha da migration = a decisão (GRUPOS)")
        p.check(g["id"] == str(uuid.uuid5(uuid.NAMESPACE_URL, B.URL_DO_GRUPO + g["slug"])),
                f"grupo {g['nome']}: id {g['id'][:8]} = uuid5(NAMESPACE_URL, '{B.URL_DO_GRUPO}{g['slug']}')")
    ids = [e["id"] for e in B.ESPERADOS] + [g["id"] for g in B.GRUPOS]
    p.check(len({e["nome"].lower() for e in B.ESPERADOS}) == 9 and len({g["nome"].lower() for g in B.GRUPOS}) == 2 and len(set(ids)) == 11
            and {e["grupo_muscular"] for e in B.ESPERADOS} == nomes_dos_grupos,
            "os 9 com nome e id distintos, os 2 grupos distintos, 11 ids diferentes; os 9 usam os 2 grupos")
    outro = "public" if s == "staging" else "staging"
    mig = B.migracao_do_schema(s)
    p.check(f"ARRAY['{s}']" in mig and B.LISTA_SCHEMAS not in mig and f"'{outro}'" not in re.sub(r"--[^\n]*", "", mig),
            f"[{s}] a migration do schema: ARRAY['{s}'] e nada do {outro}")
    for dry in (True, False):
        b = B.bloco(s, B.GLOBAIS_DEPOIS, B.GRUPOS_DEPOIS, dry_run=dry)
        sem_coment = re.sub(r"--[^\n]*", "", b)
        fim = "ROLLBACK;" if dry else "COMMIT;"
        marca = ("RAISE EXCEPTION 'RESULTADO<<%>>', r;" if dry else
                 f"<> {B.GLOBAIS_DEPOIS} OR (r->>'os_9')::int <> 9 OR (r->>'repetidos')::int <> 0 OR (r->>'grupos')::int <> "
                 f"{B.GRUPOS_DEPOIS} OR (r->>'os_2')::int <> 2")
        p.check(b.startswith("BEGIN;\n") and b.rstrip().endswith(fim) and b.count("DO $mig$") == 1 and b.count("DO $al$") == 1
                and marca in b and f"{outro}.tb_exercicios" not in sem_coment and f"{outro}.grupos_musculares" not in sem_coment
                and f"'{outro}'" not in sem_coment and sem_coment.count(f"{s}.tb_exercicios") == 3
                and sem_coment.count(f"{s}.grupos_musculares") == 3,
                f"[{s}] o bloco {'do dry-run' if dry else 'de verdade'}: BEGIN → a migration só no {s} → a conferência → {fim}")
    exemplo = ('psql: ERROR:  RESULTADO<<{"globais" : 9999, "os_9" : 9, "repetidos" : 999, "grupos" : 9999, "os_2" : 2, '
               '"grupos_repetidos" : 999}>>')
    p.check(len(exemplo) < 200 and B.resultado_do_erro(RuntimeError(exemplo), "RESULTADO")
            == {"globais": 9999, "os_9": 9, "repetidos": 999, "grupos": 9999, "os_2": 2, "grupos_repetidos": 999},
            "o resultado do bloco volta inteiro na mensagem do erro (bem abaixo do corte de 500 do exec_treino)")


def main() -> int:
    ap = argparse.ArgumentParser(description="a categoria Alongamento e mobilidade no banco do Treino (só leitura)")
    ap.add_argument("--schema", choices=B.SCHEMAS, help="staging ou public (obrigatório)")
    ap.add_argument("--seco", action="store_true", help="autoteste sem banco")
    ap.add_argument("--sem-front", action="store_true",
                    help="no --seco, sem as 19 conferências com o front (src/): para rodar a parte do banco antes de o front entrar")
    ap.add_argument("--globais", type=int, default=B.GLOBAIS_DEPOIS, help=f"total de exercícios globais esperado (padrão {B.GLOBAIS_DEPOIS})")
    ap.add_argument("--grupos", type=int, default=B.GRUPOS_DEPOIS, help=f"total de grupos globais esperado (padrão {B.GRUPOS_DEPOIS})")
    a = ap.parse_args()
    if not a.schema:
        ap.error("--schema staging|public é obrigatório")
    p = B.Placar()
    if a.seco:
        sem_banco()
        seco(p, a.schema, front=not a.sem_front)
    else:
        no_banco(p, a.schema, a.globais, a.grupos)
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
