-- Reversa da hml-19b (supabase-principal/migrations/20261011110000_hml19b_dieta_atomicas.sql). Idempotente: roda com ou sem a
-- migração aplicada. Saem as 7 funções novas (dieta_*) e a diario_enviar volta ao corpo de HOJE, byte a byte, nos 2 schemas (o aluno
-- dono do código volta a contar no limite por IP); nada mais muda (tabelas, policies e dados ficaram como estavam — o que as funções já
-- gravaram são linhas comuns das pessoas e FICAM).
--
-- ATENÇÃO — reverter o FRONT ANTES: o front da hml-19b (Dieta e Dietas) pede à função nutricao a nova prescrição, o duplicar/usar
-- modelo ★, a receita, o alimento, o subir/descer, o excluir grupo e o "copiar pra semana toda", e a função chama estas RPCs; sem elas,
-- essas ações dão erro na tela (o resto da Dieta segue, pelo CRUD da função). O front de antes (gravação direta) funciona com ou sem elas.
-- Aplicar: python3 scripts/apply_migration_principal.py <este arquivo> --so staging
--          python3 scripts/apply_migration_principal.py <este arquivo> --so public

drop function if exists {schema}.dieta_criar_plano(uuid, jsonb, jsonb);
drop function if exists {schema}.dieta_duplicar_plano(uuid, text, uuid);
drop function if exists {schema}.dieta_salvar_receita(jsonb, jsonb);
drop function if exists {schema}.dieta_salvar_alimento(jsonb, jsonb);
drop function if exists {schema}.dieta_ordenar(text, uuid[], integer[]);
drop function if exists {schema}.dieta_excluir_grupo_receita(uuid);
drop function if exists {schema}.dieta_copiar_semana(uuid[], uuid[]);


-- a diario_enviar de HOJE (antes da hml-19b; pg_get_functiondef do banco vivo, 11/10/2026): com o front da hml-19b no ar, o app voltaria
-- a contar no balde do IP da função (comum a todos) — reverter o front ANTES
do $hml19b_diario$
begin
  if '{schema}' = 'staging' then
    execute $diario_staging$CREATE OR REPLACE FUNCTION staging.diario_enviar(p_codigo text, p_path text, p_mime text, p_tamanho bigint, p_refeicao text, p_comentario text, p_data_hora timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'staging', 'public'
AS $function$
declare
  pac record;
  v_path text := trim(coalesce(p_path, ''));
  v_data timestamptz := coalesce(p_data_hora, now());
  v_comentario text := left(trim(coalesce(p_comentario, '')), 500);
  v_mime text := lower(trim(coalesce(p_mime, '')));
  v_qtd integer;
  v_id uuid;
begin
  perform staging.limite_publico('diario_enviar', 30, 'muitos_envios');  -- hml-05c: limite por IP
  select id, nutricionista_id, user_id, config into pac
    from pacientes
   where link_codigo = lower(trim(coalesce(p_codigo, '')))
     and ativo
     and deleted_at is null
   limit 1;
  if not found then
    raise exception using errcode = 'P0001', message = 'codigo_invalido';
  end if;
  -- W14 (R12, spec 9): diário desligado pelo profissional recusa (no app e no link); pelo link (sem ser o próprio aluno
  -- logado) também precisa do "envio de fotos pelo link" ligado
  if not staging.w14_ajuste(pac.config, 'diario_alimentar', true) then
    raise exception using errcode = 'P0001', message = 'diario_desligado';
  end if;
  if (auth.uid() is null or pac.user_id is distinct from auth.uid()) and not staging.w14_ajuste(pac.config, 'acesso_link', true) then
    raise exception using errcode = 'P0001', message = 'link_desligado';
  end if;
  if p_refeicao is null or p_refeicao not in ('cafe_manha', 'lanche_manha', 'almoco', 'lanche_tarde', 'jantar', 'ceia', 'outro') then
    raise exception using errcode = 'P0001', message = 'refeicao_invalida';
  end if;
  if v_path !~ ('^' || pac.nutricionista_id::text || '/' || pac.id::text || '/[0-9a-f-]{36}\.[a-z0-9]{2,5}$') then
    raise exception using errcode = 'P0001', message = 'path_invalido';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'diario-staging' and o.name = v_path) then
    raise exception using errcode = 'P0001', message = 'arquivo_nao_encontrado';
  end if;
  if v_mime = '' or v_mime not like 'image/%' or p_tamanho is null or p_tamanho <= 0 or p_tamanho > 10485760 then
    raise exception using errcode = 'P0001', message = 'arquivo_invalido';
  end if;
  if v_data > now() + interval '5 minutes' then
    raise exception using errcode = 'P0001', message = 'data_invalida';
  end if;
  select count(*) into v_qtd
    from diario_alimentar
   where paciente_id = pac.id
     and created_at > now() - interval '1 hour';
  if v_qtd >= 30 then
    raise exception using errcode = 'P0001', message = 'muitos_envios';
  end if;
  insert into diario_alimentar (nutricionista_id, paciente_id, data_hora, refeicao, path, mime, tamanho, comentario)
  values (pac.nutricionista_id, pac.id, v_data, p_refeicao, v_path, v_mime, p_tamanho, v_comentario)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'data_hora', v_data);
end;
$function$
$diario_staging$;
  else
    execute $diario_public$CREATE OR REPLACE FUNCTION public.diario_enviar(p_codigo text, p_path text, p_mime text, p_tamanho bigint, p_refeicao text, p_comentario text, p_data_hora timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'public'
AS $function$
declare
  pac record;
  v_path text := trim(coalesce(p_path, ''));
  v_data timestamptz := coalesce(p_data_hora, now());
  v_comentario text := left(trim(coalesce(p_comentario, '')), 500);
  v_mime text := lower(trim(coalesce(p_mime, '')));
  v_qtd integer;
  v_id uuid;
begin
  perform public.limite_publico('diario_enviar', 30, 'muitos_envios');  -- hml-05c: limite por IP
  select id, nutricionista_id, user_id, config into pac
    from pacientes
   where link_codigo = lower(trim(coalesce(p_codigo, '')))
     and ativo
     and deleted_at is null
   limit 1;
  if not found then
    raise exception using errcode = 'P0001', message = 'codigo_invalido';
  end if;
  -- W14 (R12, spec 9): diário desligado pelo profissional recusa (no app e no link); pelo link (sem ser o próprio aluno
  -- logado) também precisa do "envio de fotos pelo link" ligado
  if not public.w14_ajuste(pac.config, 'diario_alimentar', true) then
    raise exception using errcode = 'P0001', message = 'diario_desligado';
  end if;
  if (auth.uid() is null or pac.user_id is distinct from auth.uid()) and not public.w14_ajuste(pac.config, 'acesso_link', true) then
    raise exception using errcode = 'P0001', message = 'link_desligado';
  end if;
  if p_refeicao is null or p_refeicao not in ('cafe_manha', 'lanche_manha', 'almoco', 'lanche_tarde', 'jantar', 'ceia', 'outro') then
    raise exception using errcode = 'P0001', message = 'refeicao_invalida';
  end if;
  if v_path !~ ('^' || pac.nutricionista_id::text || '/' || pac.id::text || '/[0-9a-f-]{36}\.[a-z0-9]{2,5}$') then
    raise exception using errcode = 'P0001', message = 'path_invalido';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'diario' and o.name = v_path) then
    raise exception using errcode = 'P0001', message = 'arquivo_nao_encontrado';
  end if;
  if v_mime = '' or v_mime not like 'image/%' or p_tamanho is null or p_tamanho <= 0 or p_tamanho > 10485760 then
    raise exception using errcode = 'P0001', message = 'arquivo_invalido';
  end if;
  if v_data > now() + interval '5 minutes' then
    raise exception using errcode = 'P0001', message = 'data_invalida';
  end if;
  select count(*) into v_qtd
    from diario_alimentar
   where paciente_id = pac.id
     and created_at > now() - interval '1 hour';
  if v_qtd >= 30 then
    raise exception using errcode = 'P0001', message = 'muitos_envios';
  end if;
  insert into diario_alimentar (nutricionista_id, paciente_id, data_hora, refeicao, path, mime, tamanho, comentario)
  values (pac.nutricionista_id, pac.id, v_data, p_refeicao, v_path, v_mime, p_tamanho, v_comentario)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'data_hora', v_data);
end;
$function$
$diario_public$;
  end if;
end
$hml19b_diario$;

notify pgrst, 'reload schema';
