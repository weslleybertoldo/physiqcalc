-- Physiq W23 — "Ligar para todos" também para o PERSONAL (herdado da W22). Banco principal, public + staging. Idempotente.
-- Aplicar (backup ANTES em produção — as definições antigas das 2 funções + profiles.config.aviso_mensagens_w14):
--   staging:  python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261001160000_w23_mensagens_personal.sql --so staging
--   produção: python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261001160000_w23_mensagens_personal.sql --so public
--   (--dry-run em qualquer um: roda dentro de BEGIN … ROLLBACK)
--
-- O aviso único da P15 (W14 — faixa src/painel/gates/FaixaMensagensDesligadas.tsx: "X alunos estão com as mensagens automáticas
-- do WhatsApp desligadas" + "Ver quais" + "Ligar para todos") só listava os alunos de quem a pessoa é a NUTRICIONISTA
-- (pacientes.nutricionista_id). Desde a W22 o personal também tem o WhatsApp automático (R7: aniversário dos alunos de quem ele é
-- o personal, mensalidade da régua do Calc) e os alunos dele nascem com "Mensagens automáticas" desligado (o padrão da W14, que
-- NÃO muda aqui). A lista passa a ser a do alcance da W22 (whatsapp_resumo): os alunos de quem a pessoa é a nutricionista OU o
-- personal (pacientes.personal_id), ativos, com telefone que dá para mandar e com o ajuste desligado. O resto é IGUAL ao da W14:
-- só aparece para quem já tem o WhatsApp no Physiq (instância) e ainda não fechou o aviso (profiles.config.aviso_mensagens_w14 — a
-- mesma chave: quem já fechou ou já ligou não vê de novo); "Ligar para todos" liga exatamente os ids da lista que ainda cumprem a
-- regra. Nada é ligado por esta migração; nenhum dado muda.

create or replace function {schema}.mensagens_desligadas() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_visto jsonb;
  v_alunos jsonb;
  v_whats boolean;
begin
  if v_uid is null then return null; end if;
  v_whats := exists (select 1 from {schema}.whatsapp_instancias w where w.nutricionista_id = v_uid);
  select pr.config -> 'aviso_mensagens_w14' into v_visto from {schema}.profiles pr where pr.id = v_uid;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'rota_id', coalesce(p.treino_user_id, p.id), 'nome', p.nome, 'telefone', p.telefone)
                            order by lower(p.nome), p.id), '[]'::jsonb)
    into v_alunos
    from {schema}.pacientes p
   where (p.nutricionista_id = v_uid or p.personal_id = v_uid) and p.deleted_at is null and p.ativo
     and {schema}.whatsapp_destino(p.telefone) is not null
     and not {schema}.w14_ajuste(p.config, 'mensagens_automaticas', false);
  return jsonb_build_object(
    'mostrar', v_whats and v_visto is null and jsonb_array_length(v_alunos) > 0,
    'whatsapp', v_whats,
    'visto', v_visto,
    'total', jsonb_array_length(v_alunos),
    'alunos', v_alunos);
end;
$$;
revoke execute on function {schema}.mensagens_desligadas() from public, anon;
grant execute on function {schema}.mensagens_desligadas() to authenticated, service_role;

-- liga as mensagens de exatamente os ids que a lista do aviso mostrou (e que ainda cumprem a regra) e fecha o aviso
create or replace function {schema}.mensagens_ligar_para_todos(p_ids uuid[]) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_n integer;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'erro', 'sem_login'); end if;
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 500 then return jsonb_build_object('ok', false, 'erro', 'selecao_invalida'); end if;
  update {schema}.pacientes p
     set config = coalesce(p.config, '{}'::jsonb) || jsonb_build_object('mensagens_automaticas', true)
   where p.id = any(p_ids) and (p.nutricionista_id = v_uid or p.personal_id = v_uid) and p.deleted_at is null and p.ativo
     and {schema}.whatsapp_destino(p.telefone) is not null
     and not {schema}.w14_ajuste(p.config, 'mensagens_automaticas', false);
  get diagnostics v_n = row_count;
  update {schema}.profiles
     set config = coalesce(config, '{}'::jsonb) || jsonb_build_object('aviso_mensagens_w14', jsonb_build_object('em', now(), 'acao', 'ligar_todos', 'ligados', v_n))
   where id = v_uid;
  return jsonb_build_object('ok', true, 'ligados', v_n);
end;
$$;
revoke execute on function {schema}.mensagens_ligar_para_todos(uuid[]) from public, anon;
grant execute on function {schema}.mensagens_ligar_para_todos(uuid[]) to authenticated, service_role;
