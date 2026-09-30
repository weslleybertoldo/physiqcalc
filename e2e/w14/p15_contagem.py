#!/usr/bin/env python3
"""Physiq W14 — conferência da migração P15 (ajustes do aluno) no banco principal, antes e depois (só leitura).

Por nutricionista (a dona do registro no site antigo) e por conta: alunos vivos, com login, com "acesso ao app" valendo (o que
a tela mostra: sem a chave = ligado para quem tem login — a regra da W14; e "sem a chave = desligado" do site antigo, para ver o
que a P15 evita), com mensagens automáticas ligadas e com telefone. A regra de ouro: ninguém com login perde o acesso — todo
login com o acesso valendo antes continua com ele depois (a lista dos que têm login e o acesso desligado tem que ficar igual).

Uso: python3 e2e/w14/p15_contagem.py --schema staging|public --rotulo antes|depois [--pasta ~/backups/physiq/2026-09-30-w14]
     python3 e2e/w14/p15_contagem.py --schema public --comparar antes depois --pasta …   (sai 1 se alguém com login perdeu o acesso)
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent.parent / "w02"))
import _comum as C  # noqa: E402


def contar(schema: str) -> dict:
    s = schema
    # o valor do ajuste com a regra da W14, escrito sem depender da função (roda antes e depois da migração)
    app_w14 = "(case when jsonb_typeof(p.config -> 'acesso_app') = 'boolean' then (p.config ->> 'acesso_app')::boolean else p.user_id is not null end)"
    app_antigo = "(case when jsonb_typeof(p.config -> 'acesso_app') = 'boolean' then (p.config ->> 'acesso_app')::boolean else false end)"
    msg = "(case when jsonb_typeof(p.config -> 'mensagens_automaticas') = 'boolean' then (p.config ->> 'mensagens_automaticas')::boolean else false end)"
    por = C.sql_principal(f"""
      select coalesce(pr.email, '(sem nutricionista)') as nutri, coalesce(c.nome, '(sem conta)') as conta, coalesce(c.origem, '') as origem,
             count(*) as vivos,
             count(*) filter (where p.user_id is not null) as com_login,
             count(*) filter (where p.user_id is not null and {app_w14}) as login_com_acesso_app,
             count(*) filter (where p.user_id is not null and {app_antigo}) as login_com_acesso_app_regra_antiga,
             count(*) filter (where p.config ? 'acesso_app') as com_chave_acesso_app,
             count(*) filter (where {msg}) as mensagens_ligadas,
             count(*) filter (where {s}.whatsapp_destino(p.telefone) is not null) as com_telefone
        from {s}.pacientes p
        left join {s}.profiles pr on pr.id = p.nutricionista_id
        left join {s}.contas c on c.id = p.conta_id
       where p.deleted_at is null
       group by 1, 2, 3 order by 1, 2""")
    sem_acesso = C.sql_principal(f"""
      select p.id::text, p.nome from {s}.pacientes p
       where p.deleted_at is null and p.user_id is not null and not {app_w14} order by p.id""")
    tot = {k: sum(int(r[k]) for r in por) for k in ("vivos", "com_login", "login_com_acesso_app", "login_com_acesso_app_regra_antiga",
                                                      "com_chave_acesso_app", "mensagens_ligadas", "com_telefone")}
    return {"schema": schema, "por_nutri_e_conta": por, "total": tot, "login_sem_acesso_app": sem_acesso}


def imprimir(d: dict) -> None:
    print(f"\n== {d['schema']} ==")
    print(f"{'nutricionista':34s} {'conta':30s} vivos login acesso(W14) acesso(antiga) chave msgs tel")
    for r in d["por_nutri_e_conta"]:
        print(f"{r['nutri'][:34]:34s} {r['conta'][:30]:30s} {r['vivos']:5} {r['com_login']:5} {r['login_com_acesso_app']:11} "
              f"{r['login_com_acesso_app_regra_antiga']:14} {r['com_chave_acesso_app']:5} {r['mensagens_ligadas']:4} {r['com_telefone']:3}")
    print("total:", d["total"])
    print("com login e SEM o acesso ao app valendo:", d["login_sem_acesso_app"] or "nenhum")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--schema", required=True, choices=["staging", "public"])
    ap.add_argument("--rotulo")
    ap.add_argument("--pasta", default=str(Path.home() / "backups" / "physiq" / "2026-09-30-w14"))
    ap.add_argument("--comparar", nargs=2, metavar=("ANTES", "DEPOIS"))
    a = ap.parse_args()
    pasta = Path(a.pasta).expanduser()
    if a.comparar:
        antes = json.loads((pasta / f"p15-{a.schema}-{a.comparar[0]}.json").read_text())
        depois = json.loads((pasta / f"p15-{a.schema}-{a.comparar[1]}.json").read_text())
        perdeu = sorted({x["id"] for x in depois["login_sem_acesso_app"]} - {x["id"] for x in antes["login_sem_acesso_app"]})
        ta, td = antes["total"], depois["total"]
        print(f"{a.schema}: login {ta['com_login']} → {td['com_login']} · acesso ao app (W14) {ta['login_com_acesso_app']} → {td['login_com_acesso_app']}"
              f" · pela regra antiga {ta['login_com_acesso_app_regra_antiga']} → {td['login_com_acesso_app_regra_antiga']}"
              f" · mensagens ligadas {ta['mensagens_ligadas']} → {td['mensagens_ligadas']} · vivos {ta['vivos']} → {td['vivos']}")
        ok = not perdeu and td["login_com_acesso_app"] >= ta["login_com_acesso_app"] and td["vivos"] == ta["vivos"] and td["com_login"] == ta["com_login"]
        print("✅ ninguém com login perdeu o acesso ao app" if ok else f"❌ PERDERAM O ACESSO: {perdeu}")
        return 0 if ok else 1
    d = contar(a.schema)
    imprimir(d)
    if a.rotulo:
        pasta.mkdir(parents=True, exist_ok=True)
        arq = pasta / f"p15-{a.schema}-{a.rotulo}.json"
        arq.write_text(json.dumps(d, ensure_ascii=False, indent=1, default=str))
        print("→", arq)
    return 0


if __name__ == "__main__":
    sys.exit(main())
