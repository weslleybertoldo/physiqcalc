#!/usr/bin/env python3
"""Physiq W2 (tags da agenda) — MASSA no STAGING, só contas de TESTE, para os casos da spec §5:

  w2t-ambos     "Ana Ambos W2": cria a conta pelo onboarding (criar_minha_conta, "outra área" = dono + personal + nutricionista —
                Treino + Nutrição num acesso só, o caso do Weslley) e NÃO tem calendário: o 1º acesso à agenda cria "Treino" e "Nutrição"
  w2t-personal  "Paulo Personal W2": conta pelo onboarding como personal (dono + personal), sem calendário: o 1º acesso cria 1
  w2t-aluno     "Bia Aluna W2": aluna com login na Studio Ambos (personal e nutricionista = Ana)
Os 3 passam pela troca de token (o painel e o app entram no Banco do Treino) e o espelho roda. Nada de e-mail a pessoa real (só
contas de teste) e nenhum WhatsApp (ninguém conectado).
Uso: python3 e2e/agenda_tags/massa.py [--limpar]   (ids em ~/projetos/physiqcalc-scratch/conta-unica-agenda/w2/massa_ids.json)
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
q = B.sql_principal


def conta(nome: str) -> str | None:
    r = q(f"select id::text from {S}.contas where nome = {B.q(nome)} order by criado_em limit 1")
    return r[0]["id"] if r else None


def garantir_conta(quem: str, nome: str, tipo: str) -> str:
    c = conta(nome)
    if not c:
        st, r = B.B5.rpc(quem, "criar_minha_conta", {"p_nome": nome, "p_tipo": tipo, "p_registro": "W2-TESTE"})
        assert st == 200 and isinstance(r, dict) and r.get("ok"), (quem, st, r)
        c = conta(nome)
    assert c, f"a conta {nome} não nasceu"
    return c


def montar() -> dict:
    B.saude_ok("a massa da W2")
    for k in (B.AMBOS, B.PERSONAL, B.ALUNO):
        print(f"principal  {B.EMAIL[k]:46s} {B.B5.garantir_usuario(B.EMAIL[k], B.CONTAS[k][1], B.NOMES[k])}")
    ana, paulo, bia = B.uid(B.AMBOS), B.uid(B.PERSONAL), B.uid(B.ALUNO)
    for u, k in ((ana, B.AMBOS), (paulo, B.PERSONAL), (bia, B.ALUNO)):
        q(f"update {S}.profiles set nome = {B.q(B.NOMES[k])} where id = '{u}'")
    ambos = garantir_conta(B.AMBOS, B.CONTA_AMBOS, "outra_area")
    so_personal = garantir_conta(B.PERSONAL, B.CONTA_PERSONAL, "personal")
    papeis = {r["c"]: r["p"] for r in q(f"select conta_id::text as c, papeis as p from {S}.conta_membros where user_id in ('{ana}', '{paulo}') and status = 'ativo'")}
    assert sorted(papeis[ambos]) == ["dono", "nutricionista", "personal"], papeis
    assert sorted(papeis[so_personal]) == ["dono", "personal"], papeis
    # a aluna com login na Studio Ambos (personal e nutri = Ana)
    mat = q(f"select id::text from {S}.pacientes where user_id = '{bia}' and conta_id = '{ambos}' and deleted_at is null")
    if mat:
        mat = mat[0]["id"]
    else:
        r = q(f"select {S}.matricular_na_conta('{bia}', '{ambos}', '{ana}', '{ana}', 'novo', true) as r")[0]["r"]
        assert r.get("ok"), r
        mat = r["paciente_id"]
    q(f"update {S}.pacientes set nome = {B.q(B.NOMES[B.ALUNO])}, email = {B.q(B.EMAIL[B.ALUNO])}, ativo = true where id = '{mat}'")
    # sem calendário: o 1º acesso à agenda é que cria (é o que o E2E prova)
    sem = q(f"select count(*)::int as n from {S}.calendarios where nutricionista_id in ('{ana}', '{paulo}')")[0]["n"]
    assert sem == 0, f"já há {sem} calendário(s): rode --limpar antes"
    # Banco do Treino: a troca de token cria o usuário e o vínculo (o painel e o app entram por ela)
    for k in (B.AMBOS, B.PERSONAL, B.ALUNO):
        B.saude_ok(f"a troca de token de {k}")
        st, r = B.B5.trocar_token(k)
        assert st == 200, (k, st, r)
    B.BC.processar_espelho()
    out = {"ana": ana, "paulo": paulo, "bia": bia, "conta_ambos": ambos, "conta_personal": so_personal, "matricula_bia": mat,
           "lucas": B.uid("lucas"), "camila": B.uid("camila")}
    B.SCRATCH.mkdir(parents=True, exist_ok=True)
    B.IDS.write_text(json.dumps(out, indent=1), encoding="utf-8")
    print("massa pronta:", json.dumps(out, indent=1))
    return out


def limpar() -> None:
    """Desfaz a massa (as 3 contas de TESTE da W2 nos 2 bancos)."""
    us = [u for u in (B.uid(B.AMBOS), B.uid(B.PERSONAL), B.uid(B.ALUNO)) if u]
    contas = [c for c in (conta(B.CONTA_AMBOS), conta(B.CONTA_PERSONAL)) if c]
    lista = ",".join(f"'{u}'" for u in us) or "null"
    clista = ",".join(f"'{c}'" for c in contas) or "null"
    if us or contas:
        q(f"""delete from {S}.mensagens_whatsapp where nutricionista_id in ({lista});
              delete from {S}.agendamentos where nutricionista_id in ({lista}) or conta_id in ({clista});
              delete from {S}.calendarios where nutricionista_id in ({lista});
              delete from {S}.agenda_tags where profissional_id in ({lista});
              delete from {S}.agenda_config where profissional_id in ({lista});
              delete from {S}.pacientes where user_id in ({lista}) or conta_id in ({clista}) or nutricionista_id in ({lista}) or personal_id in ({lista});
              delete from {S}.avisos where destino_user_id in ({lista});
              delete from {S}.conta_eventos where conta_id in ({clista});
              delete from {S}.conta_membros where conta_id in ({clista}) or user_id in ({lista});
              delete from {S}.contas where id in ({clista});""")
    tids = []
    for u in us:
        tids += [x["tid"] for x in B.B5.sql_treino(f"select treino_user_id::text as tid from {S}.physiq_identidades where principal_user_id = '{u}'")]
    tl = ",".join(f"'{t}'" for t in tids) or "null"
    if tids:
        B.saude_ok("a limpeza no Banco do Treino")
        B.B5.exec_treino(f"""update {S}.physiq_profiles set professor_id = null where professor_id in ({tl});
            delete from {S}.physiq_espelho_membros where treino_user_id in ({tl});
            delete from {S}.physiq_professores where id in ({tl});
            delete from {S}.physiq_profiles where id in ({tl});
            delete from {S}.physiq_identidades where treino_user_id in ({tl});
            delete from {S}.edge_rate_limits where user_id in ({tl});""")
        sk = B.service(B.TREINO_REF)
        for t in tids:
            B.http("DELETE", f"https://{B.TREINO_REF}.supabase.co/auth/v1/admin/users/{t}", None, {"apikey": sk, "Authorization": f"Bearer {sk}"})
    sp = B.service(B.PRINCIPAL_REF)
    for k in (B.AMBOS, B.PERSONAL, B.ALUNO):
        u = B.uid(k)
        if u:
            assert B.EMAIL[k].endswith(".teste.claude@physiqnutri.app")
            st, r, _ = B.http("DELETE", f"{B.PRINCIPAL_URL}/auth/v1/admin/users/{u}", None, {"apikey": sp, "Authorization": f"Bearer {sp}"})
            print(f"   apagar login {B.EMAIL[k]}: HTTP {st}")
    print("limpo:", {"logins": len(us), "contas": len(contas), "treino": len(tids)})


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--limpar", action="store_true")
    a = ap.parse_args()
    if a.limpar:
        limpar()
    else:
        montar()
    return 0


if __name__ == "__main__":
    sys.exit(main())
