-- ⚠️ CÓPIA para a fonte única das migrações do banco principal (pedido da orquestradora, W17 · 01/10/2026). Origem: repo
-- physiqnutri, main 294887a, supabase/migrations/20261001010000_h1_cadastro_publico_trava.sql (H1). JÁ APLICADA no staging e no
-- public do principal pela H1 em 01/10/2026 — NÃO rodar de novo (é idempotente, mas não há nada a aplicar). O corpo abaixo é o
-- original, sem mudança (o formato do Nutri é o mesmo do principal: placeholder {schema}, sem bloco compartilhado).
-- Neste repo, se um dia precisar: python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261001010000_h1_cadastro_publico_trava.sql --so staging|public
--
-- PhysiqNutri — H1 (01/10/2026): o cadastro pelo LINK público (/c/<codigo>) respeita a trava de e-mail e CPF únicos.
-- Pedido do Weslley (30/09 ~22:50): "Se tentar cadastrar o mesmo email ou o mesmo CPF ele não permite e aparece uma mensagem
-- vermelha abaixo do campo informando que já possui um paciente com o CPF" · "O correto é não ter emails e CPF iguais".
-- A trava de verdade é o gatilho `pacientes_unicos_email_cpf` do banco principal (Physiq W16b, migração
-- 20260930235000_w16b_email_cpf_unicos.sql do repo physiqcalc), que barra INSERT/UPDATE em `pacientes`. O cadastro pelo link
-- grava em `cadastros_pendentes` e não passa por ele — o paciente só descobriria na aprovação. Aqui a RPC pública passa a
-- barrar ANTES, com o mesmo código do gatilho (SQLSTATE P0001, message 'paciente_email_repetido' | 'paciente_cpf_repetido'),
-- e a tela diz só "Já existe um paciente com este e-mail/CPF." (sem dizer de quem nem de qual conta).
-- Corpo IGUAL ao da W41 (20260920130000_cadastro_link.sql) + a conferência antes do insert; mesma assinatura e grants.
-- Idempotente; só troca a função (nenhum dado muda). Depende da W16b (`{schema}.paciente_conflitos`) nos 2 schemas.
-- Aplicar: PHYSIQNUTRI_REF=hkxvtsbwctxkrqzkkdoz python3 scripts/apply_migration.py supabase/migrations/20261001010000_h1_cadastro_publico_trava.sql [--so staging|public]

create or replace function {schema}.cadastro_publico_enviar(
  p_codigo text, p_nome text, p_apelido text, p_nascimento text, p_telefone text, p_cpf text, p_email text, p_genero text, p_observacoes text
)
returns jsonb
language plpgsql
security definer
set search_path = {schema}, public
as $$
declare
  v_nutri uuid;
  v_nome text := left(regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g'), 120);
  v_apelido text := nullif(left(trim(coalesce(p_apelido, '')), 60), '');
  v_nascimento date;
  v_telefone text := nullif(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), '');
  v_cpf text := nullif(regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g'), '');
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_genero text := nullif(lower(trim(coalesce(p_genero, ''))), '');
  v_obs text := nullif(left(trim(coalesce(p_observacoes, '')), 2000), '');
  v_qtd integer;
  v_novo_id uuid;
  v_rep text[];
begin
  select p.id into v_nutri
    from profiles p
   where p.codigo_cadastro = lower(trim(coalesce(p_codigo, '')))
     and p.ativo
   limit 1;
  if v_nutri is null then
    raise exception 'link_nao_encontrado';
  end if;
  if length(v_nome) < 2 then
    raise exception 'nome_invalido';
  end if;
  if v_telefone is not null and length(v_telefone) not in (10, 11) then
    raise exception 'telefone_invalido';
  end if;
  if v_cpf is not null and length(v_cpf) <> 11 then
    raise exception 'cpf_invalido';
  end if;
  if v_email is not null and (position('@' in v_email) = 0 or length(v_email) > 160) then
    raise exception 'email_invalido';
  end if;
  if v_genero is not null and v_genero not in ('masculino', 'feminino', 'outro') then
    raise exception 'genero_invalido';
  end if;
  if nullif(trim(coalesce(p_nascimento, '')), '') is not null then
    begin
      v_nascimento := trim(p_nascimento)::date;
    exception when others then
      raise exception 'nascimento_invalido';
    end;
    if v_nascimento > current_date or v_nascimento < date '1900-01-01' then
      raise exception 'nascimento_invalido';
    end if;
  end if;
  select count(*) into v_qtd
    from cadastros_pendentes
   where nutricionista_id = v_nutri
     and created_at > now() - interval '1 hour';
  if v_qtd >= 30 then
    raise exception 'muitos_cadastros';
  end if;
  if exists (
    select 1 from cadastros_pendentes c
     where c.nutricionista_id = v_nutri
       and c.status = 'pendente'
       and ((v_cpf is not null and c.cpf = v_cpf)
         or (v_email is not null and c.email = v_email)
         or (v_telefone is not null and c.telefone = v_telefone and lower(c.nome) = lower(v_nome)))
  ) then
    raise exception 'cadastro_repetido';
  end if;
  -- H1: e-mail ou CPF que já é de um paciente vivo (em qualquer conta) não vira cadastro novo — a mesma regra do gatilho da
  -- W16b (e-mail minúsculo sem espaços nas pontas; CPF só dígitos); só diz que já existe, sem dizer de quem
  select coalesce(array_agg(distinct c.campo), '{}') into v_rep
    from {schema}.paciente_conflitos(null, null, v_email, v_cpf) c;
  if 'email' = any(v_rep) then
    raise exception using errcode = 'P0001', message = 'paciente_email_repetido', hint = 'Já existe um paciente com este e-mail.';
  end if;
  if 'cpf' = any(v_rep) then
    raise exception using errcode = 'P0001', message = 'paciente_cpf_repetido', hint = 'Já existe um paciente com este CPF.';
  end if;
  insert into cadastros_pendentes (nutricionista_id, nome, apelido, nascimento, telefone, cpf, email, genero, observacoes)
  values (v_nutri, v_nome, v_apelido, v_nascimento, v_telefone, v_cpf, v_email, v_genero, v_obs)
  returning id into v_novo_id;
  return jsonb_build_object('id', v_novo_id);
end;
$$;
revoke all on function {schema}.cadastro_publico_enviar(text, text, text, text, text, text, text, text, text) from public;
grant execute on function {schema}.cadastro_publico_enviar(text, text, text, text, text, text, text, text, text) to anon, authenticated;
