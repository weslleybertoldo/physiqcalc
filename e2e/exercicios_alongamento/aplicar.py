#!/usr/bin/env python3
"""Physiq — aplica a categoria "Alongamento e mobilidade" (supabase/migrations/20261012150000_exercicios_alongamento_mobilidade.sql;
pedido do Weslley em 12/10/2026) num schema do banco do Treino: os 9 exercícios GLOBAIS novos em tb_exercicios (sem GIF) e as 2
linhas GLOBAIS novas em grupos_musculares ("Alongamento" e "Mobilidade") — o MESMO INSERT da migration, com a lista
ARRAY['public','staging'] trocada pelo schema pedido. Sem --schema, não roda.

  1. Foto de antes (só SELECT), nas 2 tabelas: globais, sem GIF, grupos globais e as somas de conferência dos OUTROS globais; o que
     entra e o que já está. Para SEM gravar se um exercício global com o MESMO nome (sem caixa) tem OUTRO id, se um dos 9 ids já
     está no banco com outra classificação, se uma linha da grupos_musculares (de qualquer dono: lá o nome é único na tabela
     inteira) tem o nome de um dos 2 com outro id, ou se um dos 2 ids já está com outro nome ou com dono.
  2. --dry-run: uma ida só (exec_treino): BEGIN → a migration → a conferência dentro da transação → erro de propósito com o
     resultado → ROLLBACK. Mostra os números antes → dentro da transação e confere, depois, que nada ficou (a mesma foto).
     O sql_treino não serve para isso: ele embrulha a consulta num SELECT json_agg e não aceita BEGIN … ROLLBACK.
  3. De verdade: backup da tb_exercicios E da grupos_musculares do schema (JSON com todas as linhas + a contagem; pasta 700, arquivo
     600) em ~/backups/physiq/2026-10-12-exercicios-alongamento/<schema>/ → a mesma ida só, com a conferência que volta TUDO se não
     bater (globais = antes + os que entram, os 9 iguais ao esperado, nenhum nome global repetido; grupos globais = antes + os que
     entram, os 2 iguais, nenhum nome de grupo repetido) → COMMIT → foto de depois (os outros globais das 2 tabelas com a MESMA
     soma) → relatório na pasta do backup.
  Os 9 e os 2 já no banco (iguais) = nada a fazer (idempotente).
Uso: PYTHONDONTWRITEBYTECODE=1 python3 e2e/exercicios_alongamento/aplicar.py --schema staging|public [--dry-run] [--backup-dir PASTA]
     depois: PYTHONDONTWRITEBYTECODE=1 python3 e2e/exercicios_alongamento/sql_exercicios_alongamento.py --schema <o mesmo>
Ensaio local: TREINO_CONN="host=<pasta do socket> dbname=postgres user=postgres" (um Postgres descartável) e --backup-dir fora de
~/backups/physiq. Saída sem dado pessoal: só o catálogo global.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import _base as B  # noqa: E402

TABELAS = ("tb_exercicios", "grupos_musculares")


def gravar_json(caminho: Path, dados) -> None:
    caminho.write_text(json.dumps(dados, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    os.chmod(caminho, 0o600)


def backup(s: str, pasta: Path, antes: dict, carimbo: str) -> list[Path]:
    """As 2 tabelas inteiras do schema (todas as linhas + a contagem), relidas e conferidas antes de seguir."""
    destino = pasta.expanduser() / s
    destino.mkdir(parents=True, exist_ok=True)
    for p in (destino.parent, destino):
        os.chmod(p, 0o700)
    arqs = []
    for tab in TABELAS:
        linhas = B.ler(f"select * from {s}.{tab} order by id")
        contagem = {"total": len(linhas), "globais": sum(1 for l in linhas if l.get("professor_id") is None)}
        arq = destino / f"{tab}-{carimbo}.json"
        gravar_json(arq, {"schema": s, "tabela": tab, "banco": B.destino(), "gravado_em": time.strftime("%Y-%m-%d %H:%M:%S %z"),
                          "contagem": contagem, "linhas": linhas})
        volta = json.loads(arq.read_text(encoding="utf-8"))
        globais_antes = antes["globais"] if tab == "tb_exercicios" else antes["grupos"]
        if len(volta["linhas"]) != contagem["total"] or contagem["globais"] != globais_antes:
            raise SystemExit(f"[{s}] o backup da {tab} não confere ({contagem}; antes {globais_antes} globais): NADA aplicado")
        arqs.append(arq)
    return arqs


def dry_run(s: str, antes: dict, entram: list[dict], entram_g: list[dict], esperado: int, esperado_g: int) -> int:
    try:
        B.executar(B.bloco(s, esperado, esperado_g, dry_run=True))
    except RuntimeError as erro:
        r = B.resultado_do_erro(erro, "RESULTADO")
        if r is None:
            print(f"[{s}] ❌ o dry-run falhou: {erro}")
            return 1
    else:
        print(f"[{s}] ❌ o bloco do dry-run não terminou no erro de propósito (o ROLLBACK do fim desfez de qualquer jeito)")
        return 1
    depois = B.foto(s)
    nada_ficou = B.mesma_foto(antes, depois)
    ok = (r["globais"] == esperado and r["os_9"] == len(B.ESPERADOS) and r["repetidos"] == 0 and r["grupos"] == esperado_g
          and r["os_2"] == len(B.GRUPOS) and r["grupos_repetidos"] == 0 and nada_ficou)
    print(f"[{s}] dry-run: globais {antes['globais']} → {r['globais']} dentro da transação (esperado {esperado}: entram "
          f"{len(entram)}); os 9 iguais ao esperado: {r['os_9']}/{len(B.ESPERADOS)}; nomes globais repetidos: {r['repetidos']}")
    print(f"[{s}] dry-run: grupos globais {antes['grupos']} → {r['grupos']} dentro da transação (esperado {esperado_g}: entram "
          f"{len(entram_g)}); os 2 iguais ao esperado: {r['os_2']}/{len(B.GRUPOS)}; nomes de grupo repetidos: {r['grupos_repetidos']}")
    print(f"[{s}] depois do ROLLBACK: {depois['globais']} globais, {depois['dos_9']} dos 9, {depois['grupos']} grupos globais, "
          f"{depois['dos_2']} dos 2, as somas dos outros " + ("iguais — nada ficou gravado" if nada_ficou else "⚠️ MUDARAM"))
    print(f"[{s}] {'OK' if ok else 'FALHOU'} (dry-run)")
    return 0 if ok else 1


def conferir_exercicios(s: str) -> tuple[list[dict], list[str]]:
    linhas = B.linhas_dos_9(s)
    por_id = {l["id"]: l for l in linhas}
    ids = {e["id"] for e in B.ESPERADOS}
    entram, problemas = [], []
    for e in B.ESPERADOS:
        l = por_id.get(e["id"])
        if l is None:
            entram.append(e)
            print(f"[{s}]   entra    {e['id']}  {e['nome']}")
            continue
        dif = B.diferencas(e, l)
        dif.update({c: (None, l[c]) for c in ("professor_id", "imagem_url") if l.get(c) is not None})
        print(f"[{s}]   já está  {e['id']}  {e['nome']}" + (f"  ⚠️ diferente: {dif}" if dif else ""))
        if dif:
            problemas.append(f"{e['nome']}: o id já está no banco com outra classificação {dif}")
    for l in linhas:
        if l["id"] not in ids:
            problemas.append(f"o global {l['nome']!r} (id {l['id']}) tem o nome de um dos 9 (sem caixa): a migration não entraria")
    return entram, problemas


def conferir_grupos(s: str) -> tuple[list[dict], list[str]]:
    linhas = B.linhas_dos_2(s)
    por_id = {l["id"]: l for l in linhas}
    ids = {g["id"] for g in B.GRUPOS}
    entram, problemas = [], []
    for g in B.GRUPOS:
        l = por_id.get(g["id"])
        if l is None:
            entram.append(g)
            print(f"[{s}]   entra    {g['id']}  grupo {g['nome']}")
            continue
        dif = B.diferencas(g, l, B.CAMPOS_GRUPO)
        dif.update({c: (None, l[c]) for c in ("professor_id", "criado_por") if l.get(c) is not None})
        print(f"[{s}]   já está  {g['id']}  grupo {g['nome']}" + (f"  ⚠️ diferente: {dif}" if dif else ""))
        if dif:
            problemas.append(f"grupo {g['nome']}: o id já está no banco com outro nome ou com dono {dif}")
    for l in linhas:
        if l["id"] not in ids:
            dono = "global" if l["professor_id"] is None else "de profissional"
            problemas.append(f"a linha {dono} {l['nome']!r} (id {l['id']}) da grupos_musculares tem o nome de um dos 2 (sem caixa; o "
                             f"nome é único na tabela inteira): a migration não entraria")
    return entram, problemas


def main() -> int:
    ap = argparse.ArgumentParser(description="aplica a categoria Alongamento e mobilidade (9 exercícios + 2 grupos globais) num schema")
    ap.add_argument("--schema", choices=B.SCHEMAS, help="staging ou public (obrigatório)")
    ap.add_argument("--dry-run", action="store_true", help="tudo dentro de uma transação desfeita (ROLLBACK)")
    ap.add_argument("--backup-dir", type=Path, default=B.BACKUP_PADRAO, help=f"padrão: {B.BACKUP_PADRAO}")
    a = ap.parse_args()
    if not a.schema:
        ap.error("--schema staging|public é obrigatório (sem ele, nada roda)")
    s = a.schema
    print(f"[{s}] banco: {B.destino()} · {B.MIGRACAO.name}" + (" · DRY-RUN (nada fica gravado)" if a.dry_run else ""))
    antes = B.foto(s)
    print(f"[{s}] antes: {antes['globais']} globais ({antes['globais_sem_imagem']} sem GIF), {antes['dos_9']} dos 9; "
          f"{antes['total']} exercícios no total; {antes['grupos']} grupos globais, {antes['dos_2']} dos 2; "
          f"{antes['grupos_total']} grupos no total")
    entram, problemas = conferir_exercicios(s)
    entram_g, problemas_g = conferir_grupos(s)
    problemas += problemas_g
    if problemas:
        print(f"[{s}] ⚠️ PARADO, nada gravado:\n  " + "\n  ".join(problemas))
        return 1
    esperado = antes["globais"] + len(entram)
    esperado_g = antes["grupos"] + len(entram_g)
    if a.dry_run:
        return dry_run(s, antes, entram, entram_g, esperado, esperado_g)
    if not entram and not entram_g:
        print(f"[{s}] os 9 e os 2 grupos já estão no banco, iguais: nada a fazer "
              f"(conferir: sql_exercicios_alongamento.py --schema {s})")
        return 0

    carimbo = time.strftime("%Y%m%d-%H%M%S")
    arqs = backup(s, a.backup_dir, antes, carimbo)
    print(f"[{s}] backup: {', '.join(str(x) for x in arqs)} ({antes['total']} exercícios, {antes['globais']} globais; "
          f"{antes['grupos_total']} grupos, {antes['grupos']} globais)")
    try:
        B.executar(B.bloco(s, esperado, esperado_g, dry_run=False))
    except RuntimeError as erro:
        r = B.resultado_do_erro(erro, "CONFERENCIA")
        print(f"[{s}] ❌ " + (f"a conferência dentro da transação não bateu {r}: voltou TUDO (nada gravado)" if r else f"erro: {erro}"))
        return 1
    depois = B.foto(s)
    no_banco = {l["id"]: l for l in B.linhas_dos_9(s)}
    difs = {e["nome"]: B.diferencas(e, no_banco.get(e["id"], {})) for e in B.ESPERADOS}
    difs = {n: d for n, d in difs.items() if d}
    globais_sem_gif = all(no_banco.get(e["id"], {}).get("professor_id", "?") is None and no_banco.get(e["id"], {}).get("imagem_url", "?") is None
                          for e in B.ESPERADOS)
    grupos_no_banco = {l["id"]: l for l in B.linhas_dos_2(s)}
    grupos_certos = all(grupos_no_banco.get(g["id"], {}).get("nome") == g["nome"]
                        and grupos_no_banco.get(g["id"], {}).get("professor_id", "?") is None
                        and grupos_no_banco.get(g["id"], {}).get("criado_por", "?") is None for g in B.GRUPOS)
    ok = (depois["globais"] == esperado and depois["dos_9"] == len(B.ESPERADOS) and depois["outros_globais"] == antes["outros_globais"]
          and depois["classif_outros"] == antes["classif_outros"]
          and depois["globais_sem_imagem"] == antes["globais_sem_imagem"] + len(entram) and not difs and globais_sem_gif
          and depois["grupos"] == esperado_g and depois["dos_2"] == len(B.GRUPOS) and depois["outros_grupos"] == antes["outros_grupos"]
          and grupos_certos)
    print(f"[{s}] depois: {depois['globais']} globais ({depois['globais_sem_imagem']} sem GIF), {depois['dos_9']} dos 9; a soma dos "
          f"outros globais {'igual' if depois['outros_globais'] == antes['outros_globais'] else '⚠️ DIFERENTE'}"
          + (f"; fora do esperado: {difs}" if difs else ""))
    print(f"[{s}] depois: {depois['grupos']} grupos globais, {depois['dos_2']} dos 2 ({'globais, iguais' if grupos_certos else '⚠️ DIFERENTES'}); "
          f"a soma dos outros grupos {'igual' if depois['outros_grupos'] == antes['outros_grupos'] else '⚠️ DIFERENTE'}")
    nomes = [e["nome"] for e in entram] + [f"grupo {g['nome']}" for g in entram_g]
    print(f"[{s}] {'OK: entraram ' + ', '.join(nomes) + ' (globais, sem GIF); nada mais mudou' if ok else 'FALHOU'}")
    gravar_json(arqs[0].parent / f"relatorio-{carimbo}.json", {"schema": s, "banco": B.destino(), "antes": antes, "depois": depois,
                                                               "entraram": nomes, "diferentes": difs, "ok": ok})
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
