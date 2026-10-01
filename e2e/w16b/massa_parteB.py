#!/usr/bin/env python3
"""Physiq W16b (Parte B) — MASSA do ensaio no STAGING: o mesmo desenho das 2 contas do Weslley, só com contas de TESTE.

  w16b-mestre  "Mestre Teste W16b" — o papel do login profissional de hoje: MASTER (app_metadata.role master — o Auth é o da produção:
               a conta é de teste, a senha é aleatória e o ensaio tira o master dela), dono + personal da conta "Calc W16b Mestre"
               (legado_calc, Só Treino, isenta, código PROF-W16B-MESTRE) e dono + nutricionista da "Nutri W16b Mestre"
               (legado_nutri, Só Nutrição, isenta); admin no Treino, com a linha de professor (código, Pix, integração MP,
               convite) e ALUNO do app (matrícula do app + treino próprio no Treino: histórico e concluídos)
  w16b-aluno1/2 alunos reais do Calc (personal mestre, no Treino com professor = mestre)
  w16b-novo    "Novo Login W16b" — o papel do login novo: login de paciente CRIADO pela nutri no site antigo
               (paciente_criar_acesso) num paciente da conta de nutrição do mestre, depois renomeado (como o "B Code")
  nutrição: o plano "20/09" no paciente do novo e o plano "30/09" (mais recente) na matrícula do app do mestre; alimento próprio,
  categoria financeira, modelo de meta e a instância do WhatsApp (desconectada) do mestre
Uso: python3 e2e/w16b/massa_parteB.py [--limpar]   (ids em ~/projetos/physiqcalc-scratch/w16b/parteB/massa_ids.json)
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
M, A1, A2, NV = "w16b-mestre", "w16b-aluno1", "w16b-aluno2", "w16b-novo"
B.EMAIL.update({M: "w16b.mestre.teste.claude@physiqnutri.app", A1: "w16b.aluno1.teste.claude@physiqnutri.app",
                A2: "w16b.aluno2.teste.claude@physiqnutri.app", NV: "w16b.novo.teste.claude@physiqnutri.app"})
B.NOMES.update({M: "Mestre Teste W16b", A1: "Aluno Um W16b", A2: "Aluna Dois W16b", NV: "Novo Login W16b"})
for _k in (M, A1, A2, NV):
    B.CONTAS[_k] = (B.EMAIL[_k], B.B5.senha_de(_k))
CALC, NUTRI = "Calc W16b Mestre", "Nutri W16b Mestre"
COD_CALC, COD_NUTRI = "PROF-W16B-MESTRE", "PROF-W16B-MESTRE-NB"
IDS = B.SCRATCH / "parteB" / "massa_ids.json"


def q(sql: str) -> list:
    return B.sql_principal(sql)


def admin_principal(metodo: str, caminho: str, corpo=None):
    sp = B.service(B.PRINCIPAL_REF)
    st, r, _ = B.http(metodo, f"{B.PRINCIPAL_URL}/auth/v1/admin/{caminho}", corpo, {"apikey": sp, "Authorization": f"Bearer {sp}"})
    return st, r


def admin_treino(metodo: str, caminho: str, corpo=None):
    sk = B.service(B.TREINO_REF)
    st, r, _ = B.http(metodo, f"https://{B.TREINO_REF}.supabase.co/auth/v1/admin/{caminho}", corpo, {"apikey": sk, "Authorization": f"Bearer {sk}"})
    return st, r


def conta(nome: str) -> str | None:
    r = q(f"select id::text from {S}.contas where nome = $n${nome}$n$ order by criado_em limit 1")
    return r[0]["id"] if r else None


def montar() -> dict:
    um = B.uid
    for k in (M, A1, A2):
        print(f"principal  {B.EMAIL[k]:48s} {B.B5.garantir_usuario(B.EMAIL[k], B.CONTAS[k][1], B.NOMES[k])}")
    mid = um(M)
    st, r = admin_principal("PUT", f"users/{mid}", {"app_metadata": {"role": "master"}})
    assert st == 200, (st, r)
    q(f"""update {S}.profiles set role = 'master', nome = $n${B.NOMES[M]}$n$, tipo_perfil = 'personal', isento_assinatura = true,
             dados_profissionais = jsonb_build_object('cref', '016016-G/AL', 'registro', 'CREF 016016-G/AL', 'uf', 'AL', 'cidade', 'Maceió'),
             recebimento = 'manual' where id = '{mid}'""")
    for k in (A1, A2):
        q(f"update {S}.profiles set nome = $n${B.NOMES[k]}$n$ where id = '{um(k)}'")
    # as 2 contas legadas do mestre (o desenho das do Weslley: isentas, master)
    for nome, origem, plano, regra in ((CALC, "legado_calc", "treino", "mes"), (NUTRI, "legado_nutri", "nutricao", "30dias")):
        if not conta(nome):
            q(f"""insert into {S}.contas (nome, dono_id, origem, plano, faixa, periodicidade, situacao, isenta_motivo, cobranca_legada, regra_pix,
                                          recebimento_modo)
                  values ($n${nome}$n$, '{mid}', '{origem}', '{plano}', 'livre', 'mensal', 'isenta', 'master', true, '{regra}', 'pix_manual')""")
    calc, nutri = conta(CALC), conta(NUTRI)
    for c, papeis, cod in ((calc, "array['personal','dono']", COD_CALC), (nutri, "array['nutricionista','dono']", COD_NUTRI)):
        if not q(f"select 1 from {S}.conta_membros where conta_id = '{c}' and user_id = '{mid}'"):
            q(f"insert into {S}.conta_membros (conta_id, user_id, papeis, status, codigo_convite) values ('{c}', '{mid}', {papeis}::text[], 'ativo', '{cod}')")
    membro_calc = q(f"select id::text from {S}.conta_membros where conta_id = '{calc}' and user_id = '{mid}'")[0]["id"]
    if not q(f"select 1 from {S}.recebimento_chaves where conta_id = '{calc}'"):
        q(f"""insert into {S}.recebimento_chaves (conta_id, membro_id, tipo, chave, favorecido, banco, ativa)
              values ('{calc}', '{membro_calc}', 'email', 'w16b.pix@exemplo.test', 'Mestre Teste W16b', 'Banco Teste', true)""")
    # alunos do Calc (com login)
    for k in (A1, A2):
        r = q(f"select {S}.matricular_na_conta('{um(k)}', '{calc}', '{mid}', null, 'calc', true) as r")[0]["r"]
        assert r.get("ok"), r
    # o mestre também é ALUNO do app (sem profissional), com plano de Treino + Alimentação
    st, r = B.rpc(M, "entrar_sem_profissional", {"p_objetivo": "ganhar_massa", "p_plano": "app_treino_alimentacao"})
    assert st == 200 and isinstance(r, dict) and r.get("ok"), (st, r)
    app = q(f"""select p.id::text from {S}.pacientes p join {S}.contas c on c.id = p.conta_id
                 where p.user_id = '{mid}' and c.origem = 'app' and p.deleted_at is null limit 1""")[0]["id"]
    # o login do "novo" nasce como o de produção: a nutri cadastra o paciente no site antigo e cria o acesso dele
    nid = um(NV)
    if not nid:
        st, novo = B.rest_como(M, "POST", "pacientes?select=*", {"nome": "Weslley Teste da Silva W16b", "email": B.EMAIL[NV], "nutricionista_id": mid})
        assert st in (200, 201), (st, novo)
        pid = novo[0]["id"]
        st, nid = B.rpc(M, "paciente_criar_acesso", {"p_paciente_id": pid, "p_email": B.EMAIL[NV], "p_senha": B.CONTAS[NV][1]})
        assert st == 200, (st, nid)
    pnovo = q(f"select id::text from {S}.pacientes where user_id = '{nid}' and deleted_at is null limit 1")[0]["id"]
    # ... e ele renomeia o paciente (o "B Code" / e-mail trocado de produção)
    q(f"update {S}.pacientes set nome = 'Bê Código W16b', email = 'w16b.xxxxxz@exemplo.test' where id = '{pnovo}'")
    # nutrição: alimento próprio, plano "20/09" no paciente do novo, plano "30/09" na matrícula do app do mestre
    if not q(f"select 1 from {S}.alimentos where nutricionista_id = '{mid}' and nome = 'Pasta de amendoim W16b'"):
        q(f"""insert into {S}.alimentos (fonte, nutricionista_id, nome, porcao_g, energia_kcal, proteina_g, carboidrato_g, lipidio_g, nutrientes)
              values ('proprio', '{mid}', 'Pasta de amendoim W16b', 100, 588, 25, 20, 50, '{{}}'::jsonb)""")
    alim = q(f"select id::text from {S}.alimentos where nutricionista_id = '{mid}' and nome = 'Pasta de amendoim W16b'")[0]["id"]
    for pac, titulo in ((pnovo, "Plano alimentar 20/09/2026 W16b"), (app, "Plano alimentar 30/09/2026 W16b")):
        if not q(f"select 1 from {S}.planos_alimentares where paciente_id = '{pac}' and titulo = $t${titulo}$t$"):
            pl = q(f"""insert into {S}.planos_alimentares (nutricionista_id, paciente_id, titulo, metodo, kcal_alvo)
                       values ('{mid}', '{pac}', $t${titulo}$t$, 'alimentos', 2000) returning id::text""")[0]["id"]
            rf = q(f"insert into {S}.refeicoes (plano_id, nome, ordem) values ('{pl}', 'Café da manhã', 0) returning id::text")[0]["id"]
            q(f"insert into {S}.itens_refeicao (refeicao_id, alimento_id, quantidade_g, ordem) values ('{rf}', '{alim}', 30, 0)")
            time.sleep(1.2)  # o de 30/09 fica mais recente
    for sql in (f"insert into {S}.categorias_financeiras (nutricionista_id, nome) select '{mid}', 'Consultas W16b' where not exists (select 1 from {S}.categorias_financeiras where nutricionista_id = '{mid}')",
                f"insert into {S}.modelos_meta (nutricionista_id, titulo) select '{mid}', 'Beber 3 L de água W16b' where not exists (select 1 from {S}.modelos_meta where nutricionista_id = '{mid}')",
                f"insert into {S}.whatsapp_instancias (nutricionista_id, status) select '{mid}', 'desconectado' where not exists (select 1 from {S}.whatsapp_instancias where nutricionista_id = '{mid}')"):
        q(sql)
    # Banco do Treino: o mestre e os alunos entram (a troca de token cria o usuário, o vínculo e — pelo espelho — a linha de professor)
    B.saude_ok("as trocas de token da massa")
    for k in (M, A1, A2):
        st, r = B.B5.trocar_token(k)
        assert st == 200, (k, st, r)
        time.sleep(2)
    mt = B.B5.treino_id(M)
    assert mt, "o mestre não ganhou usuário no Treino"
    # admin no Treino (como o Weslley: o master do Calc é 'admin'), Pix, integração MP, convite e o treino dele de ALUNO
    st, r = admin_treino("PUT", f"users/{mt}", {"app_metadata": {"role": "admin"}})
    assert st == 200, (st, r)
    B.sql_treino(f"select 1")  # aquece
    B5x = B.B5
    B5x.exec_treino(f"""
      insert into {S}.physiq_recebimentos (professor_id, tipo, pix_tipo, pix_chave, pix_favorecido, pix_banco, ativo)
      select '{mt}', 'pix', 'email', 'w16b.pix@exemplo.test', 'Mestre Teste W16b', 'Banco Teste', true
       where not exists (select 1 from {S}.physiq_recebimentos where professor_id = '{mt}');
      insert into {S}.physiq_integracoes (professor_id, tipo, status, config)
      select '{mt}', 'mercadopago', 'desconectado', '{{}}'::jsonb where not exists (select 1 from {S}.physiq_integracoes where professor_id = '{mt}');
      insert into {S}.physiq_convites (professor_id, email, papel, status, criado_por)
      select '{mt}', 'w16b.convite@exemplo.test', 'aluno', 'revogado', '{mt}' where not exists (select 1 from {S}.physiq_convites where professor_id = '{mt}');
      insert into {S}.treino_historico (user_id, nome_treino, iniciado_em, concluido_em, duracao_segundos)
      select '{mt}', 'Treino A W16b', now() - interval '2 days 1 hour', now() - interval '2 days', 3600
       where not exists (select 1 from {S}.treino_historico where user_id = '{mt}');
      insert into {S}.tb_treino_concluido (user_id, data_treino) select '{mt}', current_date - 2
       where not exists (select 1 from {S}.tb_treino_concluido where user_id = '{mt}');""")
    ids = {"mestre": mid, "novo": nid, "aluno1": um(A1), "aluno2": um(A2), "calc": calc, "nutri": nutri, "app_matricula": app,
           "paciente_do_novo": pnovo, "alimento": alim, "mestre_treino": mt, "aluno1_treino": B.B5.treino_id(A1), "aluno2_treino": B.B5.treino_id(A2)}
    B.json_arquivo(IDS, ids)
    prof = B.sql_treino(f"select id::text, codigo_convite from {S}.physiq_professores where id = '{mt}'")
    alunos = B.sql_treino(f"select id::text from {S}.physiq_profiles where professor_id = '{mt}'")
    print("massa pronta:", json.dumps(ids, indent=1), "\nprofessor no Treino:", prof, "· alunos:", len(alunos))
    return ids


def limpar() -> None:
    """Desfaz a massa (e tira o master/admin de qualquer conta de teste da W16b)."""
    ids = json.loads(IDS.read_text()) if IDS.exists() else {}
    us = [B.uid(k) for k in (M, A1, A2, NV)]
    us = [u for u in us if u]
    contas = [c for c in (conta(CALC), conta(NUTRI)) if c]
    lista = ",".join(f"'{u}'" for u in us) or "null"
    clista = ",".join(f"'{c}'" for c in contas) or "null"
    if us or contas:
        q(f"""delete from {S}.planos_alimentares where nutricionista_id in ({lista}) or paciente_id in (select id from {S}.pacientes where user_id in ({lista}) or conta_id in ({clista}));
              delete from {S}.alimentos where nutricionista_id in ({lista});
              delete from {S}.categorias_financeiras where nutricionista_id in ({lista});
              delete from {S}.modelos_meta where nutricionista_id in ({lista});
              delete from {S}.whatsapp_instancias where nutricionista_id in ({lista});
              delete from {S}.cobrancas where paciente_id in (select id from {S}.pacientes where user_id in ({lista}) or conta_id in ({clista}));
              delete from {S}.pacientes where user_id in ({lista}) or conta_id in ({clista}) or nutricionista_id in ({lista}) or personal_id in ({lista});
              delete from {S}.avisos where destino_user_id in ({lista});
              delete from {S}.contas where id in ({clista});""")
    tids = []
    for u in us:
        r = B.sql_treino(f"select treino_user_id::text t from {S}.physiq_identidades where principal_user_id = '{u}'")
        tids += [x["t"] for x in r]
    tl = ",".join(f"'{t}'" for t in tids) or "null"
    if tids:
        B.B5.exec_treino(f"""delete from {S}.physiq_recebimentos where professor_id in ({tl});
            delete from {S}.physiq_integracoes where professor_id in ({tl});
            delete from {S}.physiq_convites where professor_id in ({tl});
            delete from {S}.treino_historico where user_id in ({tl});
            delete from {S}.tb_treino_concluido where user_id in ({tl});
            update {S}.physiq_profiles set professor_id = null where professor_id in ({tl});
            delete from {S}.physiq_espelho_membros where treino_user_id in ({tl});
            delete from {S}.physiq_professores where id in ({tl});
            delete from {S}.physiq_profiles where id in ({tl});
            delete from {S}.physiq_identidades where treino_user_id in ({tl});""")
        for t in tids:
            admin_treino("DELETE", f"users/{t}")
    for k in (M, A1, A2, NV):
        u = B.uid(k)
        if u:
            assert B.EMAIL[k].endswith(".teste.claude@physiqnutri.app")
            admin_principal("DELETE", f"users/{u}")
    print("limpo:", {"logins": len(us), "contas": len(contas), "treino": len(tids)})


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--limpar", action="store_true")
    a = ap.parse_args()
    if a.limpar:
        limpar()
        return 0
    montar()
    return 0


if __name__ == "__main__":
    sys.exit(main())
