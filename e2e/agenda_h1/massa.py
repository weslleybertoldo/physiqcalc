#!/usr/bin/env python3
"""Physiq H1 — MASSA no STAGING, só contas de TESTE (P26), para os 3 ajustes:

  h1a-ambos  "Hugo Ambos H1": a conta pelo onboarding (criar_minha_conta "outra área" = dono + personal + nutricionista), as 3 tags
             prontas (agenda_garantir_tags), os calendários "Treino" (padrão, tag padrão Treino) e "Nutrição" (tag padrão Nutrição) — o
             mesmo que o 1º acesso à Agenda cria (garantirCalendarios) — e as tags "Reunião" (Geral, rosa) e "Avaliação H1" (Treino,
             laranja). Tudo pela REST/RPC COMO ele (o caminho do app, RLS de verdade).
  h1a-aluno  "Iara Aluna H1": aluna com login na Studio Hugo (personal e nutri = Hugo) e um pacote de 3 consultas a partir do mês que
             vem (aluno_definir_pacote como o Hugo).
  Consultas (do Hugo, pela REST): a Iara em nutrição, treino e geral daqui a 2–3 dias + 1 de nutrição de ontem (a "Anteriores", como
  a do Weslley de 01/10); HOJE: nutrição com a Iara, "Reunião de equipe" sem aluno e "Avaliação física" com a Iara (tag Avaliação H1).
Nenhum e-mail (a REST não chama a agenda-avisar) e nenhum WhatsApp. Idempotente: roda de novo e só cria o que falta (as de HOJE são
pela data do dia em que roda).
Uso: python3 e2e/agenda_h1/massa.py [--limpar]   (ids em ~/projetos/physiqcalc-scratch/conta-unica-agenda/h1/massa_ids.json)
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
q = B.sql_principal


def sp(d: dt.date, hhmm: str) -> str:
    h, mi = (int(x) for x in hhmm.split(":"))
    return dt.datetime(d.year, d.month, d.day, h, mi, tzinfo=dt.timezone(dt.timedelta(hours=-3))).astimezone(dt.timezone.utc).isoformat()


def conta(nome: str) -> str | None:
    r = q(f"select id::text from {S}.contas where nome = {B.q(nome)} order by criado_em limit 1")
    return r[0]["id"] if r else None


def rest_ok(tok: str, caminho: str, metodo: str, corpo) -> list:
    st, r = B.rest(tok, caminho, metodo, corpo, S)
    assert st in (200, 201) and isinstance(r, list) and r, (caminho, st, str(r)[:300])
    return r


def garantir_tag(tok: str, hugo: str, nome: str, cor: str, area: str) -> str:
    achada = q(f"select id::text from {S}.agenda_tags where profissional_id = {B.q(hugo)} and nome = {B.q(nome)} and deleted_at is null")
    if achada:
        return achada[0]["id"]
    return rest_ok(tok, "agenda_tags", "POST", {"profissional_id": hugo, "nome": nome, "cor": cor, "area": area})[0]["id"]


def garantir_consulta(tok: str, dados: dict) -> str:
    achada = q(f"""select id::text from {S}.agendamentos where nutricionista_id = {B.q(dados['nutricionista_id'])} and titulo = {B.q(dados['titulo'])}
                   and inicio = {B.q(dados['inicio'])} and deleted_at is null""")
    if achada:
        return achada[0]["id"]
    return rest_ok(tok, "agendamentos", "POST", dados)[0]["id"]


def montar() -> dict:
    B.saude_ok("a massa do H1")
    for k in (B.AMBOS, B.ALUNO):
        print(f"principal  {B.EMAIL[k]:44s} {B.B5.garantir_usuario(B.EMAIL[k], B.CONTAS[k][1], B.NOMES[k])}")
    hugo, iara = B.uid(B.AMBOS), B.uid(B.ALUNO)
    for u, k in ((hugo, B.AMBOS), (iara, B.ALUNO)):
        q(f"update {S}.profiles set nome = {B.q(B.NOMES[k])} where id = '{u}'")
    studio = conta(B.CONTA_AMBOS)
    if not studio:
        st, r = B.B5.rpc(B.AMBOS, "criar_minha_conta", {"p_nome": B.CONTA_AMBOS, "p_tipo": "outra_area", "p_registro": "H1-TESTE"})
        assert st == 200 and isinstance(r, dict) and r.get("ok"), (st, r)
        studio = conta(B.CONTA_AMBOS)
    assert studio, "a conta do Hugo não nasceu"
    papeis = q(f"select papeis from {S}.conta_membros where user_id = '{hugo}' and conta_id = '{studio}' and status = 'ativo'")[0]["papeis"]
    assert sorted(papeis) == ["dono", "nutricionista", "personal"], papeis
    mat = q(f"select id::text from {S}.pacientes where user_id = '{iara}' and conta_id = '{studio}' and deleted_at is null")
    if mat:
        mat = mat[0]["id"]
    else:
        r = q(f"select {S}.matricular_na_conta('{iara}', '{studio}', '{hugo}', '{hugo}', 'novo', true) as r")[0]["r"]
        assert r.get("ok"), r
        mat = r["paciente_id"]
    q(f"update {S}.pacientes set nome = {B.q(B.NOMES[B.ALUNO])}, email = {B.q(B.EMAIL[B.ALUNO])}, ativo = true where id = '{mat}'")
    pm = q(f"select personal_id::text as p, nutricionista_id::text as n from {S}.pacientes where id = '{mat}'")[0]
    assert pm["p"] == hugo and pm["n"] == hugo, f"a Iara precisa ter o Hugo nos 2 papéis: {pm}"

    tok = B.token(B.AMBOS)
    st, r = B.rpc_token(tok, "agenda_garantir_tags", {}, S)
    assert st == 200 and isinstance(r, dict) and r.get("ok"), (st, r)
    base = {t["area"]: t["id"] for t in r["tags"] if t["base"]}
    reuniao = garantir_tag(tok, hugo, *B.TAG_REUNIAO)
    avaliacao = garantir_tag(tok, hugo, *B.TAG_AVALIACAO)
    # os calendários do 1º acesso de quem é personal E nutri (garantirCalendarios: "Treino" padrão + "Nutrição")
    cals = {c["nome"]: c["id"] for c in q(f"select id::text, nome from {S}.calendarios where nutricionista_id = '{hugo}' and deleted_at is null")}
    if not cals:
        for nome, cor, padrao, area in (("Treino", "#a78bfa", True, "treino"), ("Nutrição", "#34d399", False, "nutricao")):
            c = rest_ok(tok, "calendarios", "POST", {"nutricionista_id": hugo, "conta_id": studio, "nome": nome, "cor": cor, "padrao": padrao,
                                                     "tag_padrao_id": base[area]})[0]
            cals[nome] = c["id"]
    assert set(cals) == {"Treino", "Nutrição"}, cals

    hoje = B.B5.hoje()
    d2, d3, ontem = hoje + dt.timedelta(days=2), hoje + dt.timedelta(days=3), hoje - dt.timedelta(days=1)

    def consulta(titulo: str, dia: dt.date, hora: str, cal: str, tag: str, aluno: bool = True, status: str = "confirmado", minutos: int = 30) -> str:
        ini = dt.datetime.fromisoformat(sp(dia, hora))
        return garantir_consulta(tok, {
            "nutricionista_id": hugo, "calendario_id": cals[cal], "paciente_id": mat if aluno else None, "titulo": titulo,
            "inicio": ini.isoformat(), "fim": (ini + dt.timedelta(minutes=minutos)).isoformat(), "dia_inteiro": False, "status": status,
            "confirmacao": "confirmado", "observacao": None, "modulo": "geral", "conta_id": studio, "tag_id": tag})

    ag = {
        "nutri": consulta("Consulta de nutrição", d2, "10:00", "Nutrição", base["nutricao"]),
        "treino": consulta("Consulta de treino", d2, "11:00", "Treino", base["treino"]),
        "geral": consulta("Conversa de alinhamento", d3, "10:00", "Treino", base["geral"]),
        "passada": consulta("Consulta de nutrição", ontem, "10:00", "Nutrição", base["nutricao"], status="paciente_confirmou"),
        "hoje_nutri": consulta("Consulta de nutrição", hoje, "21:00", "Nutrição", base["nutricao"]),
        "hoje_reuniao": consulta("Reunião de equipe", hoje, "21:30", "Treino", reuniao, aluno=False),
        "hoje_avaliacao": consulta("Avaliação física", hoje, "22:00", "Treino", avaliacao),
    }
    # o banco (gatilho da W2) pôs o modulo = a área da tag
    mods = {k: q(f"select modulo, tag_id::text as tag from {S}.agendamentos where id = '{v}'")[0] for k, v in ag.items()}
    esperado = {"nutri": "nutricao", "treino": "treino", "geral": "geral", "passada": "nutricao", "hoje_nutri": "nutricao", "hoje_reuniao": "geral",
                "hoje_avaliacao": "treino"}
    assert all(mods[k]["modulo"] == esperado[k] for k in ag), mods

    # o pacote da Iara com o Hugo: 3 meses a partir do mês que vem (o aluno marca pelo app; as de teste deste mês não contam)
    mes_que_vem = (hoje.replace(day=1) + dt.timedelta(days=32)).replace(day=1)
    pac = q(f"select total, mes_inicio::text as m from {S}.agenda_pacotes where paciente_id = '{mat}' and profissional_id = '{hugo}' and encerrado_em is null")
    if not pac:
        st, r = B.rpc_token(tok, "aluno_definir_pacote", {"p_aluno": mat, "p_profissional": hugo, "p_total": 3, "p_mes_inicio": mes_que_vem.isoformat()}, S)
        assert st == 200 and isinstance(r, dict) and r.get("ok"), (st, r)

    for k in (B.AMBOS, B.ALUNO):
        B.saude_ok(f"a troca de token de {k}")
        st, r = B.B5.trocar_token(k)
        assert st == 200, (k, st, r)
    B.BC.processar_espelho()
    out = {"hugo": hugo, "iara": iara, "conta": studio, "matricula": mat, "cal_treino": cals["Treino"], "cal_nutri": cals["Nutrição"],
           "base": base, "reuniao": reuniao, "avaliacao": avaliacao, "ag": ag, "hoje": hoje.isoformat()}
    B.SCRATCH.mkdir(parents=True, exist_ok=True)
    B.IDS.write_text(json.dumps(out, indent=1), encoding="utf-8")
    print("massa pronta:", json.dumps(out, indent=1, ensure_ascii=False))
    return out


def limpar() -> None:
    """Desfaz a massa (as 2 contas de TESTE do H1 nos 2 bancos)."""
    us = [u for u in (B.uid(B.AMBOS), B.uid(B.ALUNO)) if u]
    contas = [c for c in (conta(B.CONTA_AMBOS),) if c]
    lista = ",".join(f"'{u}'" for u in us) or "null"
    clista = ",".join(f"'{c}'" for c in contas) or "null"
    if us or contas:
        q(f"""delete from {S}.mensagens_whatsapp where nutricionista_id in ({lista});
              delete from {S}.agenda_pacotes where profissional_id in ({lista}) or paciente_id in (select id from {S}.pacientes where user_id in ({lista}) or conta_id in ({clista}));
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
    sp_ = B.service(B.PRINCIPAL_REF)
    for k in (B.AMBOS, B.ALUNO):
        u = B.uid(k)
        if u:
            assert B.EMAIL[k].endswith(".teste.claude@physiqnutri.app")
            st, r, _ = B.http("DELETE", f"{B.PRINCIPAL_URL}/auth/v1/admin/users/{u}", None, {"apikey": sp_, "Authorization": f"Bearer {sp_}"})
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
