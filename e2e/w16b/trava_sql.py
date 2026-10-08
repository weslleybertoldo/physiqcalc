#!/usr/bin/env python3
"""Physiq W16b — Parte C: a trava de e-mail/CPF repetido entre alunos (pacientes) de pessoas diferentes, no BANCO (staging).

Quase tudo roda em transações DESFEITAS (o resultado volta na exceção; nada fica gravado): o gatilho, as funções das telas como
cada pessoa (JWT na transação, igual ao PostgREST) e a pré-checagem paciente_dado_livre. O caso do site antigo do Nutri é REAL
(REST como a nutricionista de teste): o gatilho recusa e nada é gravado.

Casos: novo com e-mail de outro → barra · caixa/espaço diferente → barra · CPF com pontuação → barra · vazio → passa · mesma pessoa
em 2 contas (P7: matricular_na_conta) → passa · editar telefone/nome de quem JÁ era repetido → passa · restaurar da lixeira
repetindo → barra · linha sem login com o e-mail de quem já é aluno com login → barra · o próprio login × linha sem login → passa ·
trocar o login (paciente_criar_acesso) → passa · aluno_criar / aluno_salvar_dados / cadastro_link_enviar / aluno_pendente_decidir
devolvem o erro em JSON · paciente_dado_livre só booleanos (aluno e visitante não sondam) · site antigo (REST) recebe P0001.
Pré-requisito: e2e/w16b/causa.py já rodou (as contas w16b-app e w16b-paciente e a matrícula do app do w16b-app no staging).
Uso: python3 e2e/w16b/trava_sql.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
p = B.p
A, BL, N = "w16b-app", "w16b-paciente", B.NUTRI_LEGADO
NOME_P = "Bruna Paciente W16b da Silva"


def q(sql: str) -> list:
    return B.sql_principal(sql)


def tenta(rotulo: str, sql: str) -> str:
    """Trecho PL/pgSQL que roda `sql` e guarda em r->rotulo 'ok' ou a mensagem do erro (subtransação: o erro não aborta o resto)."""
    return f"""
      begin
        {sql};
        r := r || jsonb_build_object('{rotulo}', 'ok');
      exception when others then
        r := r || jsonb_build_object('{rotulo}', sqlerrm);
      end;"""


def main() -> int:
    ida, idb, idn = B.uid(A), B.uid(BL), B.uid(N)
    assert ida and idb and idn, "rode antes: python3 e2e/w16b/causa.py"
    nutri2 = q("select id::text from auth.users where lower(email) = 'teste@physiqnutri.app'")[0]["id"]
    lucas = B.uid("w13-dono")
    conta13 = B.conta_w13()
    rafael = q(f"select id::text, email, cpf from {S}.pacientes where conta_id = '{conta13}' and nome = 'Rafael Moura' and deleted_at is null limit 1")[0]
    ma = q(f"""select p.id::text from {S}.pacientes p join {S}.contas c on c.id = p.conta_id
                where p.user_id = '{ida}' and c.origem = 'app' and p.deleted_at is null limit 1""")[0]["id"]
    ea, eb = B.EMAIL[A], B.EMAIL[BL]

    # ── o gatilho (como postgres, tudo desfeito) ──
    r = B.dryrun(f"""
      -- os "repetidos de antes" (como os pares que já existem em produção): criados com o gatilho desligado SÓ nesta transação
      alter table {S}.pacientes disable trigger trg_pacientes_unicos_email_cpf;
      insert into {S}.pacientes (nutricionista_id, nome, email, cpf) values
        ('{idn}', 'W16b Legado 1', 'w16b.legado@exemplo.test', '86288366757'), ('{nutri2}', 'W16b Legado 2', 'W16B.Legado@exemplo.test ', '862.883.667-57'),
        ('{nutri2}', 'W16b Sem Login B', '{eb}', null);  -- linha SEM login com o e-mail do login B (cadastrada antes da trava)
      alter table {S}.pacientes enable trigger trg_pacientes_unicos_email_cpf;
      insert into {S}.pacientes (nutricionista_id, nome, email, cpf) values ('{idn}', 'W16b Trava A', 'w16b.trava.um@exemplo.test', '52998224725');
      {tenta('outro_email', f"insert into {S}.pacientes (nutricionista_id, nome, email) values ('{nutri2}', 'W16b Trava B', 'w16b.trava.um@exemplo.test')")}
      {tenta('caixa_espaco', f"insert into {S}.pacientes (nutricionista_id, nome, email) values ('{nutri2}', 'W16b Trava B', '  W16B.Trava.UM@Exemplo.TEST ')")}
      {tenta('cpf_pontuado', f"insert into {S}.pacientes (nutricionista_id, nome, cpf) values ('{nutri2}', 'W16b Trava C', '529.982.247-25')")}
      {tenta('vazio', f"insert into {S}.pacientes (nutricionista_id, nome, email, cpf) values ('{idn}', 'W16b Vazio 1', '', ''), ('{nutri2}', 'W16b Vazio 2', null, '  '), ('{nutri2}', 'W16b Vazio 3', '   ', null)")}
      {tenta('editar_telefone_repetido', f"update {S}.pacientes set telefone = '82999990000', apelido = 'Legado' where nome = 'W16b Legado 1'")}
      {tenta('editar_email_igual_repetido', f"update {S}.pacientes set email = upper(email), cpf = '862.883.667-57' where nome = 'W16b Legado 2'")}
      insert into {S}.pacientes (nutricionista_id, nome, email) values ('{idn}', 'W16b Lixeira 1', 'w16b.lixeira@exemplo.test');
      update {S}.pacientes set deleted_at = now() where nome = 'W16b Lixeira 1' and nutricionista_id = '{idn}';
      {tenta('novo_com_o_da_lixeira', f"insert into {S}.pacientes (nutricionista_id, nome, email) values ('{nutri2}', 'W16b Lixeira 2', 'w16b.lixeira@exemplo.test')")}
      {tenta('restaurar_repetindo', f"update {S}.pacientes set deleted_at = null where nome = 'W16b Lixeira 1' and nutricionista_id = '{idn}'")}
      {tenta('sem_login_com_email_de_aluno_com_login', f"insert into {S}.pacientes (nutricionista_id, nome, email) values ('{nutri2}', 'W16b Sem Login', '{ea}')")}
      {tenta('mesma_pessoa_p7', f"perform {S}.matricular_na_conta('{ida}', '{conta13}', '{lucas}', null, 'novo', true)")}
      r := r || jsonb_build_object('p7_linhas', (select count(*) from {S}.pacientes where user_id = '{ida}' and deleted_at is null));
      {tenta('proprio_login_x_sem_login', f"perform {S}.matricular_na_conta('{idb}', '{conta13}', '{lucas}', null, 'novo', true)")}
      {tenta('trocar_login', f"update {S}.pacientes set user_id = '{idb}' where nome = 'W16b Sem Login B' and nutricionista_id = '{nutri2}'")}
      {tenta('cpf_outra_pessoa_no_editar', f"update {S}.pacientes set cpf = '52998224725' where nome = 'W16b Legado 1'")}
    """)
    B.json_arquivo(B.SCRATCH / "trava" / "gatilho.json", r)
    p.check(r.get("outro_email") == B.ERRO_EMAIL, f"[gatilho] aluno novo com o e-mail de OUTRA pessoa (outra conta) → barra ({r.get('outro_email')})")
    p.check(r.get("caixa_espaco") == B.ERRO_EMAIL, f"[gatilho] o mesmo e-mail com caixa/espaço diferente → barra ({r.get('caixa_espaco')})")
    p.check(r.get("cpf_pontuado") == B.ERRO_CPF, f"[gatilho] o mesmo CPF com pontuação → barra ({r.get('cpf_pontuado')})")
    p.check(r.get("vazio") == "ok", f"[gatilho] e-mail/CPF vazios ou só espaços nunca conflitam ({r.get('vazio')})")
    p.check(r.get("editar_telefone_repetido") == "ok", f"[gatilho] editar telefone/nome de quem JÁ era repetido → passa ({r.get('editar_telefone_repetido')})")
    p.check(r.get("editar_email_igual_repetido") == "ok", f"[gatilho] regravar o MESMO e-mail (outra caixa) de quem já era repetido → passa ({r.get('editar_email_igual_repetido')})")
    p.check(r.get("novo_com_o_da_lixeira") == "ok", f"[gatilho] e-mail de quem está na LIXEIRA não conflita ({r.get('novo_com_o_da_lixeira')})")
    p.check(r.get("restaurar_repetindo") == B.ERRO_EMAIL, f"[gatilho] restaurar da lixeira repetindo → barra ({r.get('restaurar_repetindo')})")
    p.check(r.get("sem_login_com_email_de_aluno_com_login") == B.ERRO_EMAIL,
            f"[gatilho] cadastrar SEM login o e-mail de quem já é aluno com login → barra ({r.get('sem_login_com_email_de_aluno_com_login')})")
    p.check(r.get("mesma_pessoa_p7") == "ok" and int(r.get("p7_linhas") or 0) >= 2,
            f"[gatilho] a MESMA pessoa em 2 contas (P7, matricular_na_conta) → passa ({r.get('mesma_pessoa_p7')}, {r.get('p7_linhas')} matrículas)")
    p.check(r.get("proprio_login_x_sem_login") == "ok",
            f"[gatilho] matrícula com o e-mail do PRÓPRIO login × linha sem login com esse e-mail → passa ({r.get('proprio_login_x_sem_login')})")
    p.check(r.get("trocar_login") == "ok", f"[gatilho] ligar um login a uma linha (paciente_criar_acesso/user_id) → passa ({r.get('trocar_login')})")
    p.check(r.get("cpf_outra_pessoa_no_editar") == B.ERRO_CPF, f"[gatilho] editar pondo o CPF de outra pessoa → barra ({r.get('cpf_outra_pessoa_no_editar')})")

    # ── as funções das telas (como cada pessoa) ──
    c_lucas = {"sub": lucas, "role": "authenticated", "aud": "authenticated", "app_metadata": {"role": "personal"}}
    r = B.como_claims(c_lucas, f"""
      perform set_config('role', 'postgres', true);
      insert into {S}.cadastros_pendentes (nutricionista_id, conta_id, nome, email) values ('{lucas}', '{conta13}', 'W16b Pendente', '{ea}');
      perform set_config('role', 'authenticated', true);
      r := r || jsonb_build_object('aprovar_repetido', {S}.aluno_pendente_decidir('{conta13}',
               (select id from {S}.cadastros_pendentes where nome = 'W16b Pendente' and conta_id = '{conta13}' limit 1), true));
      r := r || jsonb_build_object('criar_repetido', {S}.aluno_criar('{conta13}', jsonb_build_object('nome', 'W16b Novo', 'email', '{ea.upper()}', 'modulos', jsonb_build_array('treino'))));
      r := r || jsonb_build_object('criar_novo', {S}.aluno_criar('{conta13}', jsonb_build_object('nome', 'W16b Novo', 'email', 'w16b.novo.unico@exemplo.test', 'modulos', jsonb_build_array('treino'))));
      r := r || jsonb_build_object('dados_email', {S}.aluno_salvar_dados('{rafael['id']}', jsonb_build_object('email', ' {ea} ')));
      perform set_config('role', 'postgres', true);
      insert into {S}.pacientes (nutricionista_id, nome, cpf) values ('{nutri2}', 'W16b CPF Outro', '111.444.777-35');
      perform set_config('role', 'authenticated', true);
      r := r || jsonb_build_object('dados_cpf', {S}.aluno_salvar_dados('{rafael['id']}', jsonb_build_object('cpf', '11144477735')));
      r := r || jsonb_build_object('dados_telefone', {S}.aluno_salvar_dados('{rafael['id']}', jsonb_build_object('telefone', '82988887777')) -> 'ok');
      r := r || jsonb_build_object('livre_repetido', {S}.paciente_dado_livre('{ea}', '111.444.777-35', null));
      r := r || jsonb_build_object('livre_unico', {S}.paciente_dado_livre('w16b.livre@exemplo.test', '935.411.347-80', null));
      r := r || jsonb_build_object('livre_o_proprio', {S}.paciente_dado_livre({("'" + rafael['email'] + "'") if rafael['email'] else 'null'}::text, null, '{rafael['id']}'));
      r := r || jsonb_build_object('livre_de_outro_aluno', {S}.paciente_dado_livre('w16b.x@exemplo.test', null, '{ma}'));
      perform set_config('role', 'postgres', true);
      r := r || jsonb_build_object('link_repetido', {S}.cadastro_link_enviar((select codigo_convite from {S}.conta_membros where conta_id = '{conta13}' and user_id = '{lucas}' limit 1),
               jsonb_build_object('nome', 'W16b Link', 'email', '{rafael['email']}')));
    """)
    B.json_arquivo(B.SCRATCH / "trava" / "funcoes.json", r)
    p.check((r.get("criar_repetido") or {}).get("erro") == "email_repetido", f"[Novo aluno] aluno_criar com o e-mail de outra pessoa → email_repetido ({r.get('criar_repetido')})")
    p.check((r.get("criar_novo") or {}).get("ok") is True, f"[Novo aluno] e-mail único → cria ({str(r.get('criar_novo'))[:90]})")
    p.check((r.get("dados_email") or {}).get("erro") == "email_repetido", f"[Editar dados] e-mail de outra pessoa → email_repetido ({r.get('dados_email')})")
    p.check((r.get("dados_cpf") or {}).get("erro") == "cpf_repetido", f"[Editar dados] CPF de outra pessoa → cpf_repetido ({r.get('dados_cpf')})")
    p.check(r.get("dados_telefone") is True, f"[Editar dados] só o telefone → salva ({r.get('dados_telefone')})")
    lr, lu = r.get("livre_repetido") or {}, r.get("livre_unico") or {}
    p.check(lr.get("ok") is True and lr.get("email_livre") is False and lr.get("cpf_livre") is False and set(lr) == {"ok", "email_livre", "cpf_livre"},
            f"[pré-checagem] repetidos → email_livre/cpf_livre false, SÓ booleanos (sem de quem/qual conta) ({lr})")
    p.check(lu.get("email_livre") is True and lu.get("cpf_livre") is True, f"[pré-checagem] únicos → livres ({lu})")
    p.check((r.get("livre_o_proprio") or {}).get("email_livre") is True, f"[pré-checagem] o e-mail que o aluno já tem conta como livre ({r.get('livre_o_proprio')})")
    p.check((r.get("livre_de_outro_aluno") or {}).get("erro") == "sem_acesso", f"[pré-checagem] aluno que não é dele → sem_acesso ({r.get('livre_de_outro_aluno')})")
    p.check((r.get("aprovar_repetido") or {}).get("erro") == "email_repetido", f"[Pendentes] aprovar cadastro com e-mail de outro aluno → email_repetido ({r.get('aprovar_repetido')})")
    # hml-05b (H-18, 08/10/2026): o /c/ não diz mais que o e-mail já é de um aluno — vira pendente; o aviso fica na aprovação (acima)
    p.check((r.get("link_repetido") or {}).get("ok") is True, f"[/c/] cadastro pelo link com e-mail de aluno → ok, sem dizer que já existe ({r.get('link_repetido')})")

    # quem não é profissional não sonda
    c_aluno = {"sub": ida, "role": "authenticated", "aud": "authenticated", "app_metadata": {"role": "paciente"}}
    r = B.como_claims(c_aluno, f"r := r || jsonb_build_object('aluno', {S}.paciente_dado_livre('{eb}', null, null));")
    p.check((r.get("aluno") or {}).get("erro") == "sem_acesso", f"[pré-checagem] o ALUNO (não é profissional) → sem_acesso ({r.get('aluno')})")
    st, rr, _ = B.http("POST", f"{B.PRINCIPAL_URL}/rest/v1/rpc/paciente_dado_livre", {"p_email": eb},
                    {"apikey": B.anon(B.PRINCIPAL_REF), "Content-Profile": S, "Accept-Profile": S})
    p.check(st in (401, 403, 404), f"[pré-checagem] sem login (anon) → recusado ({st} {str(rr)[:90]})")

    # ── o site antigo do Nutri (REST de verdade, como a nutricionista de teste): o gatilho recusa e nada é gravado ──
    # (outras sessões gravam massa no staging ao mesmo tempo: a conta é só das linhas deste teste)
    antes = q(f"select count(*)::int n from {S}.pacientes where nome like 'W16b %'")[0]["n"]
    st, rr = B.rest_como(N, "POST", "pacientes?select=*", {"nome": "W16b Site Antigo", "email": ea, "nutricionista_id": idn})
    p.check(st == 400 and isinstance(rr, dict) and rr.get("code") == "P0001" and rr.get("message") == B.ERRO_EMAIL and "e-mail" in str(rr.get("hint")),
            f"[site antigo] POST pacientes com o e-mail de outro aluno → HTTP {st} {rr}")
    st2, novo = B.rest_como(N, "POST", "pacientes?select=*", {"nome": "W16b Site Antigo CPF", "cpf": "52998224725", "email": "w16b.site.antigo@exemplo.test",
                                                            "nutricionista_id": idn})
    nid = novo[0]["id"] if st2 in (200, 201) and isinstance(novo, list) else None
    p.check(bool(nid), f"[site antigo] paciente com e-mail/CPF únicos → grava (HTTP {st2})")
    st3, rr3 = B.rest_como(N, "POST", "pacientes?select=*", {"nome": "W16b Site Antigo CPF 2", "cpf": "529.982.247-25", "nutricionista_id": idn})
    p.check(st3 == 400 and isinstance(rr3, dict) and rr3.get("message") == B.ERRO_CPF and "CPF" in str(rr3.get("hint")),
            f"[site antigo] 2º paciente com o mesmo CPF (pontuado) → HTTP {st3} {rr3}")
    if nid:
        form = {"nome": "W16b Site Antigo CPF", "apelido": None, "nascimento": None, "telefone": None, "cpf": "52998224725", "email": ea, "genero": None}
        st4, rr4 = B.rest_como(N, "PATCH", f"pacientes?id=eq.{nid}&select=*", form)
        email4 = q(f"select email from {S}.pacientes where id = '{nid}'")[0]["email"]
        p.check(st4 == 400 and isinstance(rr4, dict) and rr4.get("message") == B.ERRO_EMAIL and email4 == "w16b.site.antigo@exemplo.test",
                f"[site antigo] o formulário Editar paciente pondo o e-mail de outro aluno (o PATCH de 00:10:35) → HTTP {st4} {rr4.get('message') if isinstance(rr4, dict) else rr4}; o e-mail ficou o de antes")
        st5, _ = B.rest_como(N, "PATCH", f"pacientes?id=eq.{nid}&select=*", {"telefone": "82999998888"})
        p.check(st5 == 200, f"[site antigo] editar só o telefone → grava (HTTP {st5})")
        q(f"delete from {S}.pacientes where id = '{nid}'")
    depois = q(f"select count(*)::int n from {S}.pacientes where nome like 'W16b %'")[0]["n"]
    p.check(depois == antes, f"[site antigo] nada sobrou ({antes} → {depois} pacientes no staging)")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
