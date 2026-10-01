#!/usr/bin/env python3
"""Physiq W16b (Parte B) — PROVA em PRODUÇÃO depois da migração do profissional + master (só leitura: cada função roda como a
pessoa — o JWT dela na transação, igual ao PostgREST — numa transação DESFEITA; nenhum login, nenhuma senha, nenhuma mensagem).
Nada de nome/e-mail de aluno real na saída: só contagens e as linhas do próprio dono das contas.

  o login antigo (agora SÓ ALUNO): minha_situacao = treino + nutrição, sem bloqueio, não é master · minha_dieta = os planos de 20/09
     e 30/09, o de 30/09 no app · o treino dele no Treino: o mesmo usuário, o histórico, o professor novo, a conta de treino
  o login novo (PROFISSIONAL + MASTER): master; o nome que os alunos veem ("Weslley Bertoldo") no perfil e no Treino; as 3 contas;
     a lista de alunos de cada uma (contagens); os códigos PROF-… e o link de cadastro valendo; Pix, integração MP e espelho no Treino
Uso: python3 e2e/w16b/prova_parteB_prod.py --de <uuid> --para <uuid> --conta-treino <uuid> --conta-nutri <uuid> --conta-app <uuid>
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

S = "public"
B.ESTADO["schema"] = S
p = B.p
NOME = "Weslley Bertoldo"


def q(sql: str) -> list:
    return B.sql_principal(sql)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    for k in ("--de", "--para", "--conta-treino", "--conta-nutri", "--conta-app"):
        ap.add_argument(k, required=True)
    a = ap.parse_args()
    de, para = a.de, a.para
    em = {x["id"]: x for x in q(f"select id::text, email, raw_app_meta_data ->> 'role' role from auth.users where id in ('{de}', '{para}')")}
    c_de = {"sub": de, "role": "authenticated", "aud": "authenticated", "email": em[de]["email"], "app_metadata": {"role": em[de]["role"]}}
    c_para = {"sub": para, "role": "authenticated", "aud": "authenticated", "email": em[para]["email"], "app_metadata": {"role": em[para]["role"]}}
    p.check(em[de]["role"] == "paciente" and em[para]["role"] == "master", f"[Auth] papéis: antigo = {em[de]['role']}, novo = {em[para]['role']}")

    r = B.como_claims(c_de, f"r := r || jsonb_build_object('sit', {S}.minha_situacao(), 'dieta', {S}.minha_dieta());")
    sit, dieta = r.get("sit") or {}, r.get("dieta") or {}
    mats = sit.get("matriculas") or []
    st = json.dumps(sit, ensure_ascii=False)
    bloqueio = [m for m in mats if m.get("bloqueado") or m.get("acesso_bloqueado_em") or m.get("bloqueada")]
    p.check(not sit.get("master") and not sit.get("sem_nada") and "treino" in st and "nutricao" in st and not bloqueio,
            f"[aluno] minha_situacao do login antigo: não é master, tem treino e nutrição, sem bloqueio ({len(mats)} matrículas)")
    contas_mat = {m.get("conta_id"): m for m in mats}
    p.check(a.conta_treino in contas_mat and a.conta_nutri in contas_mat,
            "[aluno] matrículas na conta de treino (personal = novo) e na de nutrição (nutri = novo)")
    titulos = [x.get("titulo") for x in (dieta.get("planos") or [])]
    p.check(len(titulos) >= 2 and titulos[0] == "Plano alimentar 30/09/2026" and "Plano alimentar 20/09/2026" in titulos,
            f"[aluno] minha_dieta: os planos {titulos} — o de 30/09 primeiro (é o que o app mostra)")
    resp = q(f"""select (select count(*) from {S}.pacientes where user_id = '{de}' and conta_id = '{a.conta_treino}' and personal_id = '{para}' and ativo) treino,
                        (select count(*) from {S}.pacientes where user_id = '{de}' and conta_id = '{a.conta_nutri}' and nutricionista_id = '{para}' and ativo) nutri,
                        (select count(*) from {S}.pacientes where user_id = '{de}' and conta_id = '{a.conta_app}' and not ativo and app_encerrada_motivo = 'vinculou_profissional') app_encerrada,
                        (select count(*) from {S}.cobrancas c join {S}.pacientes x on x.id = c.paciente_id where x.user_id = '{de}' and x.conta_id = '{a.conta_app}') cobrancas_app,
                        (select count(*) from {S}.pacientes where user_id = '{para}' and deleted_at is null) matriculas_do_novo""")[0]
    p.check(resp["treino"] == 1 and resp["nutri"] == 1 and resp["app_encerrada"] == 1 and resp["matriculas_do_novo"] == 0,
            f"[aluno] responsável = novo nos 2 módulos; a matrícula do app encerrou pelo P7; o novo não é aluno de si mesmo: {resp}")

    t = B.sql_treino(f"""select i.treino_user_id::text de_t,
             (select treino_user_id::text from {S}.physiq_identidades where principal_user_id = '{para}') para_t
        from {S}.physiq_identidades i where i.principal_user_id = '{de}'""")[0]
    tt = B.sql_treino(f"""select (select professor_id::text from {S}.physiq_profiles where id = '{t['de_t']}') prof,
             (select conta_id::text from {S}.physiq_profiles where id = '{t['de_t']}') conta,
             (select status from {S}.physiq_profiles where id = '{t['de_t']}') status,
             (select count(*) from {S}.tb_treino_series where user_id = '{t['de_t']}') series,
             (select count(*) from {S}.treino_historico where user_id = '{t['de_t']}') historico,
             (select count(*) from {S}.tb_treino_concluido where user_id = '{t['de_t']}') concluidos,
             (select count(*) from {S}.tb_semana_treinos where user_id = '{t['de_t']}') semana,
             (select raw_app_meta_data ->> 'role' from auth.users where id = '{t['de_t']}') role_de,
             (select raw_app_meta_data ->> 'role' from auth.users where id = '{t['para_t']}') role_para,
             (select nome from {S}.physiq_professores where id = '{t['para_t']}') nome_prof,
             (select codigo_convite from {S}.physiq_professores where id = '{t['para_t']}') codigo,
             (select nucleo_acesso_ate::text from {S}.physiq_professores where id = '{t['para_t']}') acesso,
             (select count(*) from {S}.physiq_professores where id = '{t['de_t']}') prof_velho,
             (select count(*) from {S}.physiq_profiles where professor_id = '{t['para_t']}') alunos_do_novo,
             (select count(*) from {S}.physiq_profiles where professor_id = '{t['de_t']}') alunos_do_antigo,
             (select nome from {S}.physiq_profiles where id = '{t['para_t']}') nome_perfil_novo,
             (select count(*) from {S}.physiq_integracoes where professor_id = '{t['para_t']}') integracoes,
             (select count(*) from {S}.physiq_recebimentos where professor_id = '{t['para_t']}') recebimentos,
             (select count(*) from {S}.physiq_espelho_membros where treino_user_id = '{t['para_t']}' and ativo) membros_novo,
             (select count(*) from {S}.physiq_espelho_membros where treino_user_id = '{t['de_t']}' and ativo) membros_antigo""")[0]
    p.check(tt["prof"] == t["para_t"] and tt["conta"] == a.conta_treino and tt["status"] in (None, "ativo"),
            f"[Treino] o login antigo é ALUNO do novo no Treino (o mesmo usuário {t['de_t'][:8]}; conta de treino; {tt['status']})")
    p.check((tt["series"], tt["historico"], tt["concluidos"], tt["semana"]) == (932, 49, 52, 11),
            f"[Treino] o treino dele ficou onde estava: séries {tt['series']}, histórico {tt['historico']}, concluídos {tt['concluidos']}, semana {tt['semana']}")
    p.check(tt["role_de"] is None and tt["role_para"] == "admin", f"[Treino] papéis: antigo {tt['role_de']}, novo {tt['role_para']}")
    p.check(tt["nome_prof"] == NOME and tt["nome_perfil_novo"] == NOME and tt["codigo"] == "PROF-WESLLEY-BERTOLDO" and tt["acesso"] == "2999-12-31" and tt["prof_velho"] == 0,
            f"[Treino] a linha de professor é do novo: nome {tt['nome_prof']!r}, código {tt['codigo']}, acesso {tt['acesso']}")
    p.check(tt["alunos_do_novo"] == 11 and tt["alunos_do_antigo"] == 0 and tt["integracoes"] == 1 and tt["recebimentos"] == 1
            and tt["membros_novo"] == 2 and tt["membros_antigo"] == 0,
            f"[Treino] 11 alunos (os 10 + ele), integração MP, Pix e espelho de membros no novo; nada no antigo: {tt}")

    pf = q(f"""select nome, role, isento_assinatura, tipo_perfil, (select count(*) from jsonb_object_keys(coalesce(dados_profissionais, '{{}}'::jsonb))) chaves_prof,
                      codigo_cadastro from {S}.profiles where id = '{para}'""")[0]
    p.check(pf["nome"] == NOME and pf["role"] == "master" and pf["isento_assinatura"] and pf["chaves_prof"] >= 5,
            f"[profissional] perfil do novo: nome {pf['nome']!r}, {pf['role']}, isento, {pf['chaves_prof']} campos profissionais (CREF…)")
    r = B.como_claims(c_para, f"""
      r := r || jsonb_build_object('sit', {S}.minha_situacao(), 'master', {S}.eh_master());
      r := r || jsonb_build_object('treino', ({S}.alunos_da_conta('{a.conta_treino}', '{{}}'::jsonb, 0, 200) -> 'total'),
                                   'nutri', ({S}.alunos_da_conta('{a.conta_nutri}', '{{"situacao": "todos"}}'::jsonb, 0, 200) -> 'total'),
                                   'treino_tem_ele', exists (select 1 from jsonb_array_elements({S}.alunos_da_conta('{a.conta_treino}', '{{}}'::jsonb, 0, 200) -> 'itens') x
                                                              where x ->> 'user_id' = '{de}' or x ->> 'email' = '{em[de]['email']}'));""")
    contas = {c.get("id") or c.get("conta_id") for c in ((r.get("sit") or {}).get("contas") or [])}
    p.check(r.get("master") is True and {a.conta_treino, a.conta_nutri} <= contas,
            f"[profissional] o novo é master e membro das contas de treino e de nutrição ({len(contas)} contas na situação)")
    p.check(r.get("treino_tem_ele") is True, f"[profissional] na conta de treino ele aparece como aluno ({r.get('treino')} alunos ativos na lista)")
    dono = q(f"""select (select string_agg(id::text, ',' order by id) from {S}.contas where dono_id = '{para}') contas_do_novo,
                        (select user_id::text from {S}.w13_dono_do_codigo('PROF-WESLLEY-BERTOLDO')) cod1,
                        (select user_id::text from {S}.w13_dono_do_codigo('PROF-WESLLEY-BERTOLDO-WB')) cod2,
                        ({S}.cadastro_link_info('PROF-WESLLEY-BERTOLDO') ->> 'profissional') link_nome,
                        (select count(*) from {S}.whatsapp_instancias where nutricionista_id = '{para}') whatsapp""")[0]
    p.check(set((dono["contas_do_novo"] or "").split(",")) == {a.conta_treino, a.conta_nutri, a.conta_app},
            "[profissional] o novo é DONO das 3 contas (treino, nutrição e a do app)")
    p.check(dono["cod1"] == para and dono["cod2"] == para and dono["link_nome"] == NOME and dono["whatsapp"] == 1,
            f"[links] os códigos PROF-WESLLEY-BERTOLDO(-WB) e o link de cadastro /c/ valem pelo novo (nome no link: {dono['link_nome']!r}); WhatsApp no novo")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
