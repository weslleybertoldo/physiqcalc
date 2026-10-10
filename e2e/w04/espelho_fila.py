#!/usr/bin/env python3
"""Physiq W4 — a FILA DO ESPELHO (banco principal → Banco do Treino, spec 8.3) que a W4 liga (tarefa das 03:40 + a da fila,
pelo pg_net). Antes de ligar: conferir o que está parado e o que cada item mudaria no Treino (só leitura); depois, processar
e conferir que nada saiu do esperado.

  --dry-run    lista os itens pendentes e, pessoa a pessoa, o que a espelho-nucleo mudaria no Treino (papel no JWT, espelho
               dos membros, physiq_professores, physiq_profiles, alunos ligados) — lê o resumo pela espelho-resumo e o estado
               do Treino pelo psql; NÃO grava nada
  --processar  chama a espelho-enviar do schema até a fila esvaziar (ou 5 rodadas) e mostra o resultado de cada item
  --json <arq> grava o relatório (dry-run) em JSON

Uso: python3 e2e/w04/espelho_fila.py --schema staging --dry-run [--json ~/backups/physiq/2026-09-29-w04/fila-staging.json]
E-mails de contas reais aparecem mascarados no relatório.
Segredos (hml-16c): a espelho-resumo com o SEGREDO_ESPELHO_RESUMO do ambiente (S4, o que a trocar-token manda); a
espelho-enviar com o da fila (S8, ~/.physiq-segredo-espelho-fila). Sem eles, o legado (reserva até o F7).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "w02"))
from _comum import PRINCIPAL_URL, http, segredo_do_ambiente, segredo_fila, sql_principal, sql_treino  # noqa: E402

MAX = "2999-12-31"


def mascarar(email: str | None) -> str:
    e = (email or "").lower()
    if "teste" in e:
        return e
    if "@" not in e:
        return e
    nome, dominio = e.split("@", 1)
    return f"{nome[:2]}***@{dominio}"


def resumo(schema: str, uid: str) -> dict | None:
    st, r, _ = http("POST", f"{PRINCIPAL_URL}/functions/v1/espelho-resumo", {"principal_user_id": uid},
                    {"x-espelho-segredo": segredo_do_ambiente("SEGREDO_ESPELHO_RESUMO"), "x-schema": schema})  # S4
    return r if st == 200 else None


# ── porte das regras de supabase/functions/_shared/espelho/regras.ts (a mesma lógica da trocar-token/espelho-nucleo) ──
def tem_modulo(conta: dict | None, m: str) -> bool:
    return bool(conta) and m in (conta.get("modulos") or [])


def personal_com_treino(r: dict) -> bool:
    return any(m["status"] == "ativo" and "personal" in m["papeis"] and tem_modulo(m.get("conta"), "treino") for m in r.get("membros", []))


def papel_treino(r: dict, atual: str | None) -> str | None:
    staff = atual in ("admin", "master")
    if r.get("master"):
        return atual if staff else "master"
    if staff:
        return atual
    return "professor" if personal_com_treino(r) else None


def acesso_professor(r: dict) -> dict | None:
    ms = [m for m in r.get("membros", []) if m["status"] == "ativo" and "personal" in m["papeis"] and tem_modulo(m.get("conta"), "treino")]
    if not ms:
        return None
    maior = lambda a, b: b if not a else a if not b else max(a, b)  # noqa: E731
    acesso = acesso_novas = bloq = bloq_msg = codigo = None
    tem_nova = valendo = False
    for m in ms:
        c = m["conta"]
        acesso = maior(acesso, c.get("acesso_ate"))
        if not c.get("cobranca_legada"):
            tem_nova = True
            acesso_novas = maior(acesso_novas, c.get("acesso_ate"))
            if c.get("situacao") not in ("suspensa", "cancelada"):
                valendo = True
        if c.get("alunos_bloqueados_em") and not bloq:
            bloq, bloq_msg = c["alunos_bloqueados_em"], c.get("alunos_bloqueados_msg")
        if not codigo and m.get("codigo_convite"):
            codigo = m["codigo_convite"]
    return {"nucleo_acesso_ate": acesso, "ponte": {"acesso_liberado_ate": acesso_novas, "status": "ativo" if valendo else "suspenso"} if tem_nova else None,
            "alunos_bloqueados_em": bloq, "alunos_bloqueados_msg": bloq_msg, "codigo_convite": codigo}


def matricula_treino(ms: list[dict]) -> dict | None:
    """Não excluída, numa conta com Treino; ativa e com personal primeiro, depois a mais nova (escolherMatriculaTreino)."""
    cands = [m for m in ms if not m.get("excluida") and tem_modulo(m.get("conta"), "treino")]
    if not cands:
        return None
    return sorted(cands, key=lambda m: (bool(m.get("ativo")), bool(m.get("personal_id")), str(m.get("criado_em") or "")), reverse=True)[0]


def sexo(g: str | None) -> str | None:
    return {"masculino": "male", "feminino": "female"}.get(g or "")


def q(v: str | None) -> str:
    return "null" if v is None else "'" + str(v).replace("'", "''") + "'"


def analisar(schema: str, uid: str) -> dict:
    r = resumo(schema, uid)
    if not r:
        return {"principal_user_id": uid, "resultado": "sem_resumo"}
    v = sql_treino(f"select treino_user_id::text from {schema}.physiq_identidades where principal_user_id = {q(uid)}")
    if not v:
        return {"principal_user_id": uid, "email": mascarar(r.get("email")), "resultado": "sem_vinculo (a espelho-nucleo pula; aplica no 1º login)"}
    tid = v[0]["treino_user_id"]
    mudancas: list[str] = []
    u = sql_treino(f"select raw_app_meta_data->>'role' as role from auth.users where id = {q(tid)}")
    papel_atual = u[0]["role"] if u else None
    papel_novo = papel_treino(r, papel_atual)
    if papel_novo != papel_atual:
        mudancas.append(f"app_metadata.role: {papel_atual} → {papel_novo}")
    # espelho dos membros
    esp = {x["conta_id"]: x for x in sql_treino(f"select conta_id::text, papeis, ativo from {schema}.physiq_espelho_membros where treino_user_id = {q(tid)}")}
    linhas: dict[str, dict] = {}
    for m in r.get("membros", []):
        ativo = m["status"] == "ativo"
        if m["conta_id"] not in linhas or (ativo and not linhas[m["conta_id"]]["ativo"]):
            linhas[m["conta_id"]] = {"papeis": m["papeis"], "ativo": ativo}
    for cid, l in linhas.items():
        e = esp.get(cid)
        if not e:
            mudancas.append(f"espelho_membros +{cid[:8]} {l}")
        elif sorted(e["papeis"] or []) != sorted(l["papeis"]) or bool(e["ativo"]) != l["ativo"]:
            mudancas.append(f"espelho_membros {cid[:8]}: {e['papeis']}/{e['ativo']} → {l['papeis']}/{l['ativo']}")
    for cid, e in esp.items():
        if cid not in linhas and e["ativo"]:
            mudancas.append(f"espelho_membros {cid[:8]}: ativo → inativo")
    # professor
    a = acesso_professor(r)
    if a:
        p = sql_treino(f"select nucleo_acesso_ate::text, acesso_liberado_ate::text, status, alunos_bloqueados_em::text, alunos_bloqueados_msg, codigo_convite from {schema}.physiq_professores where id = {q(tid)}")
        campos = {"nucleo_acesso_ate": a["nucleo_acesso_ate"]}
        if a["alunos_bloqueados_em"] or a["ponte"]:
            campos["alunos_bloqueados_em"] = a["alunos_bloqueados_em"]
            campos["alunos_bloqueados_msg"] = a["alunos_bloqueados_msg"]
        if a["ponte"]:
            campos["acesso_liberado_ate"] = a["ponte"]["acesso_liberado_ate"]
            campos["status"] = a["ponte"]["status"]
        if not p:
            mudancas.append(f"physiq_professores CRIADO {campos}")
        else:
            for k, val in campos.items():
                antes = p[0].get(k)
                if (antes or None) != (val or None) and not (k == "alunos_bloqueados_em" and antes and val and antes[:19] == val.replace("T", " ")[:19]):
                    mudancas.append(f"physiq_professores.{k}: {antes} → {val}")
    # aluno
    mat = matricula_treino(r.get("matriculas", []))
    if mat:
        pf = sql_treino(f"select status, professor_id::text, conta_id::text, nome, sexo, data_nascimento::text from {schema}.physiq_profiles where id = {q(tid)}")
        if not pf:
            mudancas.append("physiq_profiles: sem perfil (não mexe)")
        else:
            pf = pf[0]
            novo_status = "bloqueado" if mat.get("bloqueada") else ("ativo" if pf["status"] == "bloqueado" else pf["status"])
            alvo = {"conta_id": mat.get("conta_id"), "status": novo_status}
            if not mat.get("personal_id"):
                alvo["professor_id"] = None
            else:
                mp = sql_treino(f"select treino_user_id::text from {schema}.physiq_identidades where principal_user_id = {q(mat['personal_id'])}")
                if mp:
                    alvo["professor_id"] = mp[0]["treino_user_id"]
            if (mat.get("nome") or "").strip():
                alvo["nome"] = mat["nome"].strip()
            if sexo(mat.get("genero")):
                alvo["sexo"] = sexo(mat.get("genero"))
            if mat.get("nascimento"):
                alvo["data_nascimento"] = mat["nascimento"]
            for k, val in alvo.items():
                if (pf.get(k) or None) != (val or None):
                    antes = pf.get(k)
                    if k == "nome":
                        mudancas.append(f"physiq_profiles.nome: (muda: {len(antes or '')}→{len(val or '')} letras)")
                    else:
                        mudancas.append(f"physiq_profiles.{k}: {antes} → {val}")
    # alunos de treino ligados ao personal
    for al in r.get("alunos_de_treino", []):
        ma = sql_treino(f"select treino_user_id::text from {schema}.physiq_identidades where principal_user_id = {q(al['principal_user_id'])}")
        if not ma or ma[0]["treino_user_id"] == tid:
            continue
        pa = sql_treino(f"select professor_id::text, conta_id::text from {schema}.physiq_profiles where id = {q(ma[0]['treino_user_id'])}")
        if pa and (pa[0]["professor_id"] != tid or pa[0]["conta_id"] != al["conta_id"]):
            mudancas.append(f"aluno {ma[0]['treino_user_id'][:8]} → professor {tid[:8]} / conta {al['conta_id'][:8]} (antes {pa[0]['professor_id']}/{pa[0]['conta_id']})")
    return {"principal_user_id": uid, "treino_user_id": tid, "email": mascarar(r.get("email")), "master": r.get("master"),
            "papel_treino": papel_atual, "mudancas": mudancas, "resultado": "sem_mudanca" if not mudancas else "muda"}


def pendentes(schema: str) -> list[dict]:
    return sql_principal(f"""select e.id, e.tipo, e.payload, e.tentativas, e.erro, e.criado_em::text
                             from {schema}.espelho_pendencias e where e.feito_em is null order by e.id""")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--schema", choices=["public", "staging"], required=True)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--processar", action="store_true")
    ap.add_argument("--json")
    a = ap.parse_args()
    fila = pendentes(a.schema)
    print(f"{a.schema}: {len(fila)} itens pendentes na fila do espelho")
    pessoas: dict[str, list[int]] = {}
    for f in fila:
        if f["tipo"] == "pessoa":
            pessoas.setdefault(f["payload"]["principal_user_id"], []).append(f["id"])
        else:
            membros = sql_principal(f"select user_id::text from {a.schema}.conta_membros where conta_id = {q(f['payload'].get('conta_id'))} and user_id is not null")
            for m in membros:
                pessoas.setdefault(m["user_id"], []).append(f["id"])
    print(f"   {len(pessoas)} pessoas distintas")
    if a.dry_run:
        rel = []
        for uid, ids in pessoas.items():
            x = analisar(a.schema, uid)
            x["itens"] = ids
            rel.append(x)
            print(f"\n• {x.get('email', uid[:8])}  itens {ids}  → {x['resultado']}")
            for m in x.get("mudancas", []):
                print(f"     - {m}")
        if a.json:
            Path(a.json).expanduser().write_text(json.dumps({"schema": a.schema, "fila": fila, "pessoas": rel}, ensure_ascii=False, indent=1, default=str))
            print(f"\nrelatório → {a.json}")
    if a.processar:
        for rodada in range(1, 6):
            st, r, _ = http("POST", f"{PRINCIPAL_URL}/functions/v1/espelho-enviar", {"limite": 50},
                            {"x-espelho-segredo": segredo_fila(), "x-schema": a.schema}, timeout=180)  # S8
            print(f"rodada {rodada}: HTTP {st} → {json.dumps(r, ensure_ascii=False)[:1500]}")
            if st != 200 or not (r or {}).get("processadas"):
                break
        resto = pendentes(a.schema)
        print(f"depois: {len(resto)} pendentes" + (f" — {[(x['id'], x['tentativas'], (x['erro'] or '')[:80]) for x in resto]}" if resto else ""))
        return 1 if resto else 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
