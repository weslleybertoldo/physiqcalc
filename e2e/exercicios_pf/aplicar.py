#!/usr/bin/env python3
"""Physiq — aplica os 3 exercícios GLOBAIS novos (supabase/migrations/20261012110000_exercicios_novos_personal_fit.sql; pedido do
Weslley em 12/10/2026, para a migração de um personal) num schema do banco do Treino: o MESMO INSERT da migration, com a lista
ARRAY['public','staging'] trocada pelo schema pedido. Sem --schema, não roda.

  1. Foto de antes (só SELECT): globais, sem GIF e a soma de conferência dos OUTROS globais; o que entra e o que já está.
     Para SEM gravar se um global com o MESMO nome (sem caixa) tem OUTRO id (a migration não o inseriria) ou se um dos 3 ids já
     está no banco com outra classificação.
  2. --dry-run: uma ida só (exec_treino): BEGIN → a migration → a conferência dentro da transação → erro de propósito com o
     resultado → ROLLBACK. Mostra os globais antes → dentro da transação e confere, depois, que nada ficou (a mesma foto).
     O sql_treino não serve para isso: ele embrulha a consulta num SELECT json_agg e não aceita BEGIN … ROLLBACK.
  3. De verdade: backup da tb_exercicios do schema (JSON com todas as linhas + a contagem; pasta 700, arquivo 600) em
     ~/backups/physiq/2026-10-12-exercicios-pf/<schema>/ → a mesma ida só, com a conferência que volta TUDO se não bater
     (globais = antes + os que entram, os 3 iguais ao esperado, nenhum nome global repetido) → COMMIT → foto de depois (os outros
     globais com a MESMA soma) → relatório na pasta do backup.
  Os 3 já no banco (iguais) = nada a fazer (idempotente).
Uso: PYTHONDONTWRITEBYTECODE=1 python3 e2e/exercicios_pf/aplicar.py --schema staging|public [--dry-run] [--backup-dir PASTA]
     depois: PYTHONDONTWRITEBYTECODE=1 python3 e2e/exercicios_pf/sql_exercicios_pf.py --schema <o mesmo>
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


def gravar_json(caminho: Path, dados) -> None:
    caminho.write_text(json.dumps(dados, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    os.chmod(caminho, 0o600)


def backup(s: str, pasta: Path, antes: dict, carimbo: str) -> Path:
    """A tabela inteira do schema (todas as linhas + a contagem), relida e conferida antes de seguir."""
    destino = pasta.expanduser() / s
    destino.mkdir(parents=True, exist_ok=True)
    for p in (destino.parent, destino):
        os.chmod(p, 0o700)
    linhas = B.ler(f"select * from {s}.tb_exercicios order by id")
    contagem = {"total": len(linhas), "globais": sum(1 for l in linhas if l.get("professor_id") is None)}
    arq = destino / f"tb_exercicios-{carimbo}.json"
    gravar_json(arq, {"schema": s, "banco": B.destino(), "gravado_em": time.strftime("%Y-%m-%d %H:%M:%S %z"), "contagem": contagem,
                      "linhas": linhas})
    volta = json.loads(arq.read_text(encoding="utf-8"))
    if len(volta["linhas"]) != contagem["total"] or contagem["globais"] != antes["globais"]:
        raise SystemExit(f"[{s}] o backup não confere ({contagem}; antes {antes['globais']} globais): NADA aplicado")
    return arq


def dry_run(s: str, antes: dict, entram: list[dict], esperado: int) -> int:
    try:
        B.executar(B.bloco(s, esperado, dry_run=True))
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
    ok = r["globais"] == esperado and r["os_3"] == len(B.ESPERADOS) and r["repetidos"] == 0 and nada_ficou
    print(f"[{s}] dry-run: globais {antes['globais']} → {r['globais']} dentro da transação (esperado {esperado}: entram "
          f"{len(entram)}); os 3 iguais ao esperado: {r['os_3']}/{len(B.ESPERADOS)}; nomes globais repetidos: {r['repetidos']}")
    print(f"[{s}] depois do ROLLBACK: {depois['globais']} globais, {depois['dos_3']} dos 3, a soma dos outros globais "
          + ("igual — nada ficou gravado" if nada_ficou else "⚠️ MUDOU"))
    print(f"[{s}] {'OK' if ok else 'FALHOU'} (dry-run)")
    return 0 if ok else 1


def main() -> int:
    ap = argparse.ArgumentParser(description="aplica os 3 exercícios globais novos num schema do banco do Treino")
    ap.add_argument("--schema", choices=B.SCHEMAS, help="staging ou public (obrigatório)")
    ap.add_argument("--dry-run", action="store_true", help="tudo dentro de uma transação desfeita (ROLLBACK)")
    ap.add_argument("--backup-dir", type=Path, default=B.BACKUP_PADRAO, help=f"padrão: {B.BACKUP_PADRAO}")
    a = ap.parse_args()
    if not a.schema:
        ap.error("--schema staging|public é obrigatório (sem ele, nada roda)")
    s = a.schema
    print(f"[{s}] banco: {B.destino()} · {B.MIGRACAO.name}" + (" · DRY-RUN (nada fica gravado)" if a.dry_run else ""))
    antes = B.foto(s)
    print(f"[{s}] antes: {antes['globais']} globais ({antes['globais_sem_imagem']} sem GIF), {antes['dos_3']} dos 3; "
          f"{antes['total']} exercícios no total")
    linhas = B.linhas_dos_3(s)
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
            problemas.append(f"o global {l['nome']!r} (id {l['id']}) tem o nome de um dos 3 (sem caixa): a migration não entraria")
    if problemas:
        print(f"[{s}] ⚠️ PARADO, nada gravado:\n  " + "\n  ".join(problemas))
        return 1
    esperado = antes["globais"] + len(entram)
    if a.dry_run:
        return dry_run(s, antes, entram, esperado)
    if not entram:
        print(f"[{s}] os 3 já estão no banco, iguais: nada a fazer (conferir: sql_exercicios_pf.py --schema {s})")
        return 0

    carimbo = time.strftime("%Y%m%d-%H%M%S")
    arq = backup(s, a.backup_dir, antes, carimbo)
    print(f"[{s}] backup: {arq} ({antes['total']} linhas, {antes['globais']} globais)")
    try:
        B.executar(B.bloco(s, esperado, dry_run=False))
    except RuntimeError as erro:
        r = B.resultado_do_erro(erro, "CONFERENCIA")
        print(f"[{s}] ❌ " + (f"a conferência dentro da transação não bateu {r}: voltou TUDO (nada gravado)" if r else f"erro: {erro}"))
        return 1
    depois = B.foto(s)
    no_banco = {l["id"]: l for l in B.linhas_dos_3(s)}
    difs = {e["nome"]: B.diferencas(e, no_banco.get(e["id"], {})) for e in B.ESPERADOS}
    difs = {n: d for n, d in difs.items() if d}
    globais_sem_gif = all(no_banco.get(e["id"], {}).get("professor_id", "?") is None and no_banco.get(e["id"], {}).get("imagem_url", "?") is None
                          for e in B.ESPERADOS)
    ok = (depois["globais"] == esperado and depois["dos_3"] == len(B.ESPERADOS) and depois["outros_globais"] == antes["outros_globais"]
          and depois["globais_sem_imagem"] == antes["globais_sem_imagem"] + len(entram) and not difs and globais_sem_gif)
    print(f"[{s}] depois: {depois['globais']} globais ({depois['globais_sem_imagem']} sem GIF), {depois['dos_3']} dos 3; a soma dos "
          f"outros globais {'igual' if depois['outros_globais'] == antes['outros_globais'] else '⚠️ DIFERENTE'}"
          + (f"; fora do esperado: {difs}" if difs else ""))
    print(f"[{s}] {'OK: entraram ' + ', '.join(e['nome'] for e in entram) + ' (globais, sem GIF); nada mais mudou' if ok else 'FALHOU'}")
    gravar_json(arq.parent / f"relatorio-{carimbo}.json", {"schema": s, "banco": B.destino(), "antes": antes, "depois": depois,
                                                           "entraram": [e["nome"] for e in entram], "diferentes": difs, "ok": ok})
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
