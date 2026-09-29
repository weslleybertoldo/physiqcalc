#!/usr/bin/env python3
"""Physiq W2 — massa de teste no schema STAGING do banco principal (idempotente; volta ao estado inicial a cada rodada):
conta "Conta Teste W2 (Claude)" em teste por 14 dias (Treino + Nutrição, f10), com personal.teste.claude como dono e personal
e aluno.teste.claude matriculado nela com esse personal responsável. Rode antes do e2e/w02/trocar_token.py.
Precisa das contas de e2e/w02/contas_teste.py.  Uso: python3 e2e/w02/massa_conta_teste.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _comum import sql_principal  # noqa: E402

CONTA = "0a0a0a0a-0000-4000-8000-00000000c0a1"
MATRICULA = "0a0a0a0a-0000-4000-8000-0000000a1a01"
PERSONAL = "(select id from auth.users where email = 'personal.teste.claude@physiqnutri.app')"
ALUNO = "(select id from auth.users where email = 'aluno.teste.claude@physiqnutri.app')"

sql_principal(f"""
insert into staging.contas (id, nome, origem, plano, faixa, situacao, teste_ate, dono_id)
values ('{CONTA}', 'Conta Teste W2 (Claude)', 'nova', 'treino_nutricao', 'f10', 'teste', current_date + 14, {PERSONAL})
on conflict (id) do update set situacao = 'teste', teste_ate = current_date + 14, vence_em = null, plano = 'treino_nutricao',
  faixa = 'f10', dono_id = excluded.dono_id, alunos_bloqueados_em = null, alunos_bloqueados_msg = null;
insert into staging.conta_membros (conta_id, user_id, papeis, status, codigo_convite)
values ('{CONTA}', {PERSONAL}, array['dono', 'personal'], 'ativo', 'PROF-PERSONAL-TESTE-W2')
on conflict (conta_id, user_id) where user_id is not null do update set papeis = excluded.papeis, status = 'ativo', removido_em = null;
insert into staging.pacientes (id, nutricionista_id, nome, genero, nascimento, conta_id, personal_id, user_id, origem, ativo)
values ('{MATRICULA}', null, 'Aluno Teste Claude', 'masculino', '1995-05-20', '{CONTA}', {PERSONAL}, {ALUNO}, 'novo', true)
on conflict (id) do update set conta_id = excluded.conta_id, personal_id = excluded.personal_id, user_id = excluded.user_id,
  deleted_at = null, ativo = true, acesso_bloqueado_em = null;
""")
print(sql_principal(f"select c.nome, c.situacao, c.teste_ate::text, (select count(*) from staging.conta_membros m where m.conta_id = c.id) as membros, "
                    f"(select count(*) from staging.pacientes p where p.conta_id = c.id) as matriculas from staging.contas c where c.id = '{CONTA}'"))
