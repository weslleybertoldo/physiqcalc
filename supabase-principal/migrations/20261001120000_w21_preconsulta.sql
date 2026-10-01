-- Physiq W21 — Painel › Pré-consulta (banco principal, staging e public; spec §11.3 W21, §4.1 "Quem vê e edita o quê", §4.4 linha
-- "Pré-consulta", §4.8, N-7, N-12, N-13, N-55, R7). Idempotente; NENHUM dado muda: só funções, gatilhos e políticas. As tabelas
-- (formularios_preconsulta, respostas_preconsulta) e as 2 RPCs públicas (preconsulta_formulario, preconsulta_responder) são as do
-- site antigo do Nutri (20260919190000_preconsulta.sql e 20260919200000_respostas_preconsulta_importacao.sql) com o conta_id e a
-- política "dono da conta" da W2 — o site antigo continua lendo e gravando as MESMAS tabelas até a W28, sem mudar nada lá.
--
-- Aplicar (backup ANTES — scripts/backup/backup_principal.py: formularios_preconsulta, respostas_preconsulta):
--   staging:  python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261001120000_w21_preconsulta.sql --so staging
--   produção: python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261001120000_w21_preconsulta.sql --so public
--   (--dry-run em qualquer um: roda dentro de BEGIN … ROLLBACK)
--
-- O que muda:
--   1. A resposta nasce na conta do formulário: o painel novo grava o formulário com a conta ativa (conta_id) e a RPC pública
--      (security definer, sem login) grava a resposta sem conta — um gatilho copia o conta_id do formulário. Formulário do site
--      antigo (sem conta) continua gerando resposta sem conta, só da dona (como hoje).
--   2. Quem lê, liga, importa (marca) e exclui uma resposta (restritivas de leitura e escrita, somadas às políticas de hoje —
--      "as proprias" e "dono da conta" da W2), pela regra da W18 para o que é clínico (spec 4.1, P1, P3):
--        · sem conta (site antigo): só quem criou o formulário (e o master) — igual a hoje;
--        · na conta: quem criou o formulário enquanto ainda é membro ativo (membro removido deixa de ler — W5/W16/W18); e o dono
--          da conta, MENOS a resposta de formulário criado por nutricionista da conta (pré-anamnese = dado de saúde), que o dono
--          só lê se também for nutricionista da conta (com o módulo Nutrição). O personal e os outros membros não leem as dos
--          outros (P1).
--   3. Formulários (restritivas): na conta, só membro ativo mexe (o removido perde o acesso na hora — spec §9) e o conta_id
--      gravado tem de ser de uma conta da pessoa; quem cria é o autor (o dono não cria em nome de outro).
--   4. Guardas (gatilhos): pelo app, a resposta não muda de autor, de conta nem de formulário (só o formulário pode sumir, no
--      "apagar de vez" da Lixeira) e só liga a um aluno que quem liga vê (pode_ver_aluno — P1); o formulário não muda de autor
--      (o dono não "toma" o formulário de uma nutricionista para ler as respostas novas). Master e scripts (service_role) passam.
--   5. Importar para a anamnese / questionário do aluno continua sendo das regras da W3/W18 (só nutricionista com o módulo
--      Nutrição que muda a nutrição do aluno escreve nas tabelas clínicas) — aqui nada muda nisso.

-- ============================================================================================================
-- 1. Quem lê a resposta
-- ============================================================================================================
-- o autor do formulário (da resposta) é nutricionista na conta? (qualquer situação: a removida continua tendo criado como nutri)
create or replace function {schema}.preconsulta_autor_nutri(p_conta uuid, p_autor uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from {schema}.conta_membros m
                  where m.conta_id = p_conta and m.user_id = p_autor and 'nutricionista' = any(m.papeis));
$$;
revoke execute on function {schema}.preconsulta_autor_nutri(uuid, uuid) from public, anon;
grant execute on function {schema}.preconsulta_autor_nutri(uuid, uuid) to authenticated, service_role;

create or replace function {schema}.pode_ver_resposta_preconsulta(p_conta uuid, p_autor uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select {schema}.eh_master()
      or (p_conta is null and p_autor = auth.uid())
      or (p_conta is not null and (
            (p_autor = auth.uid() and {schema}.sou_membro(p_conta))
         or ({schema}.sou_dono(p_conta)
             and ({schema}.tenho_papel(p_conta, 'nutricionista') or not {schema}.preconsulta_autor_nutri(p_conta, p_autor)))));
$$;
revoke execute on function {schema}.pode_ver_resposta_preconsulta(uuid, uuid) from public, anon;
grant execute on function {schema}.pode_ver_resposta_preconsulta(uuid, uuid) to authenticated, service_role;

drop policy if exists "respostas_preconsulta: W21 leitura" on {schema}.respostas_preconsulta;
create policy "respostas_preconsulta: W21 leitura" on {schema}.respostas_preconsulta
  as restrictive for select to authenticated
  using ({schema}.pode_ver_resposta_preconsulta(conta_id, nutricionista_id));
drop policy if exists "respostas_preconsulta: W21 editar" on {schema}.respostas_preconsulta;
create policy "respostas_preconsulta: W21 editar" on {schema}.respostas_preconsulta
  as restrictive for update to authenticated
  using ({schema}.pode_ver_resposta_preconsulta(conta_id, nutricionista_id))
  with check ({schema}.pode_ver_resposta_preconsulta(conta_id, nutricionista_id));
drop policy if exists "respostas_preconsulta: W21 apagar" on {schema}.respostas_preconsulta;
create policy "respostas_preconsulta: W21 apagar" on {schema}.respostas_preconsulta
  as restrictive for delete to authenticated
  using ({schema}.pode_ver_resposta_preconsulta(conta_id, nutricionista_id));

-- ============================================================================================================
-- 2. Formulários: na conta, só membro ativo; quem cria é o autor
-- ============================================================================================================
drop policy if exists "formularios_preconsulta: W21 so membro da conta" on {schema}.formularios_preconsulta;
create policy "formularios_preconsulta: W21 so membro da conta" on {schema}.formularios_preconsulta
  as restrictive for all to authenticated
  using ({schema}.eh_master() or conta_id is null or {schema}.sou_membro(conta_id))
  with check ({schema}.eh_master() or conta_id is null or {schema}.sou_membro(conta_id));
drop policy if exists "formularios_preconsulta: W21 cria os proprios" on {schema}.formularios_preconsulta;
create policy "formularios_preconsulta: W21 cria os proprios" on {schema}.formularios_preconsulta
  as restrictive for insert to authenticated
  with check ({schema}.eh_master() or nutricionista_id = (select auth.uid()));

-- ============================================================================================================
-- 3. Guardas (gatilhos)
-- ============================================================================================================
-- resposta: nasce com a conta do formulário; pelo app não muda de autor/conta/formulário e só liga a aluno visível
create or replace function {schema}.respostas_preconsulta_w21() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.conta_id is null and new.formulario_id is not null then
      select f.conta_id into new.conta_id from {schema}.formularios_preconsulta f where f.id = new.formulario_id;
    end if;
    return new;
  end if;
  if auth.uid() is not null and not {schema}.eh_master() then
    if new.nutricionista_id is distinct from old.nutricionista_id
       or new.conta_id is distinct from old.conta_id
       or (new.formulario_id is not null and new.formulario_id is distinct from old.formulario_id) then
      raise exception 'resposta_imutavel' using errcode = '42501';
    end if;
    if new.paciente_id is not null and new.paciente_id is distinct from old.paciente_id
       and not {schema}.pode_ver_aluno(new.paciente_id) then
      raise exception 'aluno_invisivel' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_respostas_preconsulta_w21 on {schema}.respostas_preconsulta;
create trigger trg_respostas_preconsulta_w21 before insert or update on {schema}.respostas_preconsulta
  for each row execute function {schema}.respostas_preconsulta_w21();

-- formulário: pelo app não muda de autor
create or replace function {schema}.formularios_preconsulta_w21() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not {schema}.eh_master() and new.nutricionista_id is distinct from old.nutricionista_id then
    raise exception 'formulario_imutavel' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_formularios_preconsulta_w21 on {schema}.formularios_preconsulta;
create trigger trg_formularios_preconsulta_w21 before update on {schema}.formularios_preconsulta
  for each row execute function {schema}.formularios_preconsulta_w21();
