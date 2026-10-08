-- Reversa da 20261008020000_hml05c_limite_ip_publico (hml-05c): as 9 RPCs como estavam antes (pg_get_functiondef do banco vivo, 08/10/2026) e sem o contador.
-- O segredo physiq_proxy_segredo fica no Vault (não atrapalha; apagar à parte se for o caso). O Worker pode continuar mandando a
-- assinatura: sem estas funções o banco ignora os cabeçalhos.
-- Aplicar: python3 scripts/apply_migration_principal.py <este arquivo> --so staging · --compartilhado (produção)

-- staging
CREATE OR REPLACE FUNCTION staging.diario_link(p_codigo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_codigo text := lower(btrim(coalesce(p_codigo, '')));
  v_p record;
begin
  if v_codigo = '' or char_length(v_codigo) > 40 or v_codigo !~ '^[a-z0-9]+$' then
    return jsonb_build_object('situacao', 'invalido');
  end if;
  select p.id, p.nutricionista_id, p.nome, p.apelido, p.ativo, p.config
    into v_p
    from staging.pacientes p
   where p.link_codigo = v_codigo and p.deleted_at is null
   order by p.ativo desc
   limit 1;
  if not found or not v_p.ativo then
    return jsonb_build_object('situacao', 'invalido');
  end if;
  if not staging.w14_ajuste(v_p.config, 'diario_alimentar', true) then
    return jsonb_build_object('situacao', 'diario_desligado');
  end if;
  if not staging.w14_ajuste(v_p.config, 'acesso_link', true) then
    return jsonb_build_object('situacao', 'link_desligado');
  end if;
  if v_p.nutricionista_id is null then
    return jsonb_build_object('situacao', 'sem_nutricionista');
  end if;
  return jsonb_build_object(
    'situacao', 'ok',
    'paciente_id', v_p.id,
    'nutricionista_id', v_p.nutricionista_id,
    'nome', coalesce(nullif(btrim(v_p.apelido), ''), split_part(btrim(v_p.nome), ' ', 1))
  );
end;
$function$;

CREATE OR REPLACE FUNCTION staging.diario_listar(p_codigo text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'staging', 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', d.id,
      'data_hora', d.data_hora,
      'refeicao', d.refeicao,
      'comentario', d.comentario,
      'reacao_nutri', d.reacao_nutri,
      'comentario_nutri', d.comentario_nutri,
      'reagido_em', d.reagido_em
    ) order by d.data_hora desc, d.created_at desc), '[]'::jsonb)
  from diario_alimentar d
  join pacientes p on p.id = d.paciente_id
  where p.link_codigo = lower(trim(coalesce(p_codigo, '')))
    and p.ativo
    and p.deleted_at is null
    and staging.w14_ajuste(p.config, 'acesso_link', true)
    and staging.w14_ajuste(p.config, 'diario_alimentar', true)
    and d.deleted_at is null
    and d.data_hora >= (((now() at time zone 'America/Sao_Paulo')::date - 6)::timestamp at time zone 'America/Sao_Paulo');
$function$;

CREATE OR REPLACE FUNCTION staging.diario_paciente(p_codigo text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'staging', 'public'
AS $function$
  select jsonb_build_object(
    'paciente_id', p.id,
    'nutricionista_id', p.nutricionista_id,
    'nome', coalesce(nullif(trim(p.apelido), ''), split_part(trim(p.nome), ' ', 1))
  )
  from pacientes p
  where p.link_codigo = lower(trim(coalesce(p_codigo, '')))
    and p.ativo
    and p.deleted_at is null
    -- W14 (R12): o link público só abre com o envio pelo link e o diário ligados (desligado = o link não abre)
    and staging.w14_ajuste(p.config, 'acesso_link', true)
    and staging.w14_ajuste(p.config, 'diario_alimentar', true)
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION staging.diario_enviar(p_codigo text, p_path text, p_mime text, p_tamanho bigint, p_refeicao text, p_comentario text, p_data_hora timestamp with time zone)
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
$function$;

CREATE OR REPLACE FUNCTION staging.preconsulta_formulario(p_slug text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'staging', 'public'
AS $function$
  select jsonb_build_object(
    'id', f.id,
    'titulo', f.titulo,
    'descricao', f.descricao,
    'perguntas', f.perguntas,
    'faixas', f.faixas,
    'nutricionista', coalesce(p.nome, '')
  )
  from formularios_preconsulta f
  left join profiles p on p.id = f.nutricionista_id
  where f.slug = lower(trim(coalesce(p_slug, '')))
    and f.ativo
    and f.deleted_at is null
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION staging.preconsulta_responder(p_slug text, p_nome text, p_email text, p_telefone text, p_respostas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'staging', 'public'
AS $function$
declare
  f record;
  v_nome text := regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g');
  v_email text := lower(trim(coalesce(p_email, '')));
  v_telefone text := trim(coalesce(p_telefone, ''));
  v_pergunta jsonb;
  v_id text;
  v_tipo text;
  v_resp jsonb;
  v_texto text;
  v_max numeric;
  v_p numeric;
  v_idx integer;
  v_n_opcoes integer;
  v_n integer := 0;
  v_pontos numeric := 0;
  v_respostas jsonb := '{}'::jsonb;
  v_faixa jsonb;
  v_fmin numeric;
  v_fmax numeric;
  v_rotulo text := '';
  v_nivel text := '';
  v_qtd integer;
  v_novo_id uuid;
begin
  select * into f
    from formularios_preconsulta
   where slug = lower(trim(coalesce(p_slug, '')))
     and ativo
     and deleted_at is null
   limit 1;
  if not found then
    raise exception 'formulario_nao_encontrado';
  end if;
  if length(v_nome) < 2 or length(v_nome) > 120 then
    raise exception 'nome_invalido';
  end if;
  if v_email <> '' and (position('@' in v_email) = 0 or length(v_email) > 160) then
    raise exception 'email_invalido';
  end if;
  if length(v_telefone) > 30 then
    raise exception 'telefone_invalido';
  end if;
  if p_respostas is null or jsonb_typeof(p_respostas) <> 'object' then
    raise exception 'sem_respostas';
  end if;

  -- pontuação por tipo (mesmas regras do app, questionariosUtil.pontuarPergunta); só respostas válidas contam e são gravadas
  for v_pergunta in select value from jsonb_array_elements(f.perguntas) loop
    if jsonb_typeof(v_pergunta) <> 'object' then
      continue;
    end if;
    v_id := v_pergunta ->> 'id';
    if v_id is null or v_id = '' or not (p_respostas ? v_id) then
      continue;
    end if;
    v_tipo := coalesce(v_pergunta ->> 'tipo', 'escala');
    v_resp := p_respostas -> v_id;
    if v_tipo = 'escala' then
      if jsonb_typeof(v_resp) <> 'number' then
        continue;
      end if;
      v_max := case when (v_pergunta ->> 'max') ~ '^[0-9]+(\.[0-9]+)?$' then (v_pergunta ->> 'max')::numeric else 4 end;
      v_p := least(v_max, greatest(0, round((v_resp #>> '{}')::numeric)));
      v_respostas := v_respostas || jsonb_build_object(v_id, v_p);
      v_pontos := v_pontos + v_p;
      v_n := v_n + 1;
    elsif v_tipo = 'sim_nao' then
      if jsonb_typeof(v_resp) <> 'boolean' then
        continue;
      end if;
      if (v_resp #>> '{}')::boolean then
        v_pontos := v_pontos + case when (v_pergunta ->> 'pontos_sim') ~ '^[0-9]+(\.[0-9]+)?$' then (v_pergunta ->> 'pontos_sim')::numeric else 1 end;
      end if;
      v_respostas := v_respostas || jsonb_build_object(v_id, (v_resp #>> '{}')::boolean);
      v_n := v_n + 1;
    elsif v_tipo = 'multipla' then
      if jsonb_typeof(v_resp) <> 'number' then
        continue;
      end if;
      v_n_opcoes := case when jsonb_typeof(v_pergunta -> 'opcoes') = 'array' then jsonb_array_length(v_pergunta -> 'opcoes') else 0 end;
      v_idx := floor((v_resp #>> '{}')::numeric)::integer;
      if v_idx < 0 or v_idx >= v_n_opcoes or (v_resp #>> '{}')::numeric <> v_idx then
        continue;
      end if;
      v_pontos := v_pontos + case when ((v_pergunta -> 'opcoes' -> v_idx) ->> 'pontos') ~ '^-?[0-9]+(\.[0-9]+)?$'
                                  then greatest(0, ((v_pergunta -> 'opcoes' -> v_idx) ->> 'pontos')::numeric) else 0 end;
      v_respostas := v_respostas || jsonb_build_object(v_id, v_idx);
      v_n := v_n + 1;
    else
      if jsonb_typeof(v_resp) <> 'string' then
        continue;
      end if;
      v_texto := trim(v_resp #>> '{}');
      if v_texto = '' then
        continue;
      end if;
      v_respostas := v_respostas || jsonb_build_object(v_id, left(v_texto, 500));
      v_n := v_n + 1;
    end if;
  end loop;
  if v_n = 0 then
    raise exception 'sem_respostas';
  end if;

  -- rate limit simples por formulário: 30 respostas na última hora (conta também as da lixeira)
  select count(*) into v_qtd
    from respostas_preconsulta
   where formulario_id = f.id
     and created_at > now() - interval '1 hour';
  if v_qtd >= 30 then
    raise exception 'muitas_respostas';
  end if;

  v_pontos := round(v_pontos, 2);
  for v_faixa in select value from jsonb_array_elements(f.faixas) loop
    if jsonb_typeof(v_faixa) <> 'object' then
      continue;
    end if;
    v_fmin := case when (v_faixa ->> 'min') ~ '^-?[0-9]+(\.[0-9]+)?$' then (v_faixa ->> 'min')::numeric end;
    v_fmax := case when (v_faixa ->> 'max') ~ '^-?[0-9]+(\.[0-9]+)?$' then (v_faixa ->> 'max')::numeric end;
    if v_fmin is null or v_fmax is null then
      continue;
    end if;
    if v_pontos >= least(v_fmin, v_fmax) and v_pontos <= greatest(v_fmin, v_fmax) then
      v_nivel := case when (v_faixa ->> 'nivel') in ('baixo', 'moderado', 'alto') then v_faixa ->> 'nivel' else 'baixo' end;
      v_rotulo := left(trim(coalesce(v_faixa ->> 'rotulo', '')), 60);
      if v_rotulo = '' then
        v_rotulo := initcap(v_nivel);
      end if;
      exit;
    end if;
  end loop;

  insert into respostas_preconsulta (nutricionista_id, formulario_id, titulo, perguntas, faixas, respostas, pontuacao, faixa, nivel, nome, email, telefone)
  values (f.nutricionista_id, f.id, f.titulo, f.perguntas, f.faixas, v_respostas, v_pontos, v_rotulo, v_nivel, v_nome, v_email, v_telefone)
  returning id into v_novo_id;

  return jsonb_build_object('id', v_novo_id, 'pontuacao', v_pontos, 'faixa', v_rotulo, 'nivel', v_nivel);
end;
$function$;

CREATE OR REPLACE FUNCTION staging.cadastro_link_info(p_codigo text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce((
    select jsonb_build_object('ok', true, 'profissional', staging.nome_da_pessoa(d.user_id), 'conta', c.nome,
             'foto_url', (select nullif(btrim(pr.dados_profissionais ->> 'foto_url'), '') from staging.profiles pr where pr.id = d.user_id))
      from staging.w13_dono_do_codigo(p_codigo) d join staging.contas c on c.id = d.conta_id),
    jsonb_build_object('ok', false, 'erro', 'link_nao_encontrado'));
$function$;

CREATE OR REPLACE FUNCTION staging.cadastro_publico_info(p_codigo text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'staging', 'public'
AS $function$
  select jsonb_build_object('nutricionista', coalesce(p.nome, ''), 'codigo', p.codigo_cadastro)
  from profiles p
  where p.codigo_cadastro = lower(trim(coalesce(p_codigo, '')))
    and p.ativo
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION staging.cadastro_publico_enviar(p_codigo text, p_nome text, p_apelido text, p_nascimento text, p_telefone text, p_cpf text, p_email text, p_genero text, p_observacoes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'staging', 'public'
AS $function$
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
    from staging.paciente_conflitos(null, null, v_email, v_cpf) c;
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
$function$;

drop function if exists staging.limite_publico(text, integer, text);
drop function if exists staging.ip_do_pedido_hash();
drop table if exists staging.publico_pedidos_ip;

-- @@ compartilhado
-- public
CREATE OR REPLACE FUNCTION public.diario_link(p_codigo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_codigo text := lower(btrim(coalesce(p_codigo, '')));
  v_p record;
begin
  if v_codigo = '' or char_length(v_codigo) > 40 or v_codigo !~ '^[a-z0-9]+$' then
    return jsonb_build_object('situacao', 'invalido');
  end if;
  select p.id, p.nutricionista_id, p.nome, p.apelido, p.ativo, p.config
    into v_p
    from public.pacientes p
   where p.link_codigo = v_codigo and p.deleted_at is null
   order by p.ativo desc
   limit 1;
  if not found or not v_p.ativo then
    return jsonb_build_object('situacao', 'invalido');
  end if;
  if not public.w14_ajuste(v_p.config, 'diario_alimentar', true) then
    return jsonb_build_object('situacao', 'diario_desligado');
  end if;
  if not public.w14_ajuste(v_p.config, 'acesso_link', true) then
    return jsonb_build_object('situacao', 'link_desligado');
  end if;
  if v_p.nutricionista_id is null then
    return jsonb_build_object('situacao', 'sem_nutricionista');
  end if;
  return jsonb_build_object(
    'situacao', 'ok',
    'paciente_id', v_p.id,
    'nutricionista_id', v_p.nutricionista_id,
    'nome', coalesce(nullif(btrim(v_p.apelido), ''), split_part(btrim(v_p.nome), ' ', 1))
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.diario_listar(p_codigo text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', d.id,
      'data_hora', d.data_hora,
      'refeicao', d.refeicao,
      'comentario', d.comentario,
      'reacao_nutri', d.reacao_nutri,
      'comentario_nutri', d.comentario_nutri,
      'reagido_em', d.reagido_em
    ) order by d.data_hora desc, d.created_at desc), '[]'::jsonb)
  from diario_alimentar d
  join pacientes p on p.id = d.paciente_id
  where p.link_codigo = lower(trim(coalesce(p_codigo, '')))
    and p.ativo
    and p.deleted_at is null
    and public.w14_ajuste(p.config, 'acesso_link', true)
    and public.w14_ajuste(p.config, 'diario_alimentar', true)
    and d.deleted_at is null
    and d.data_hora >= (((now() at time zone 'America/Sao_Paulo')::date - 6)::timestamp at time zone 'America/Sao_Paulo');
$function$;

CREATE OR REPLACE FUNCTION public.diario_paciente(p_codigo text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'public'
AS $function$
  select jsonb_build_object(
    'paciente_id', p.id,
    'nutricionista_id', p.nutricionista_id,
    'nome', coalesce(nullif(trim(p.apelido), ''), split_part(trim(p.nome), ' ', 1))
  )
  from pacientes p
  where p.link_codigo = lower(trim(coalesce(p_codigo, '')))
    and p.ativo
    and p.deleted_at is null
    -- W14 (R12): o link público só abre com o envio pelo link e o diário ligados (desligado = o link não abre)
    and public.w14_ajuste(p.config, 'acesso_link', true)
    and public.w14_ajuste(p.config, 'diario_alimentar', true)
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.diario_enviar(p_codigo text, p_path text, p_mime text, p_tamanho bigint, p_refeicao text, p_comentario text, p_data_hora timestamp with time zone)
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
$function$;

CREATE OR REPLACE FUNCTION public.preconsulta_formulario(p_slug text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'public'
AS $function$
  select jsonb_build_object(
    'id', f.id,
    'titulo', f.titulo,
    'descricao', f.descricao,
    'perguntas', f.perguntas,
    'faixas', f.faixas,
    'nutricionista', coalesce(p.nome, '')
  )
  from formularios_preconsulta f
  left join profiles p on p.id = f.nutricionista_id
  where f.slug = lower(trim(coalesce(p_slug, '')))
    and f.ativo
    and f.deleted_at is null
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.preconsulta_responder(p_slug text, p_nome text, p_email text, p_telefone text, p_respostas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'public'
AS $function$
declare
  f record;
  v_nome text := regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g');
  v_email text := lower(trim(coalesce(p_email, '')));
  v_telefone text := trim(coalesce(p_telefone, ''));
  v_pergunta jsonb;
  v_id text;
  v_tipo text;
  v_resp jsonb;
  v_texto text;
  v_max numeric;
  v_p numeric;
  v_idx integer;
  v_n_opcoes integer;
  v_n integer := 0;
  v_pontos numeric := 0;
  v_respostas jsonb := '{}'::jsonb;
  v_faixa jsonb;
  v_fmin numeric;
  v_fmax numeric;
  v_rotulo text := '';
  v_nivel text := '';
  v_qtd integer;
  v_novo_id uuid;
begin
  select * into f
    from formularios_preconsulta
   where slug = lower(trim(coalesce(p_slug, '')))
     and ativo
     and deleted_at is null
   limit 1;
  if not found then
    raise exception 'formulario_nao_encontrado';
  end if;
  if length(v_nome) < 2 or length(v_nome) > 120 then
    raise exception 'nome_invalido';
  end if;
  if v_email <> '' and (position('@' in v_email) = 0 or length(v_email) > 160) then
    raise exception 'email_invalido';
  end if;
  if length(v_telefone) > 30 then
    raise exception 'telefone_invalido';
  end if;
  if p_respostas is null or jsonb_typeof(p_respostas) <> 'object' then
    raise exception 'sem_respostas';
  end if;

  -- pontuação por tipo (mesmas regras do app, questionariosUtil.pontuarPergunta); só respostas válidas contam e são gravadas
  for v_pergunta in select value from jsonb_array_elements(f.perguntas) loop
    if jsonb_typeof(v_pergunta) <> 'object' then
      continue;
    end if;
    v_id := v_pergunta ->> 'id';
    if v_id is null or v_id = '' or not (p_respostas ? v_id) then
      continue;
    end if;
    v_tipo := coalesce(v_pergunta ->> 'tipo', 'escala');
    v_resp := p_respostas -> v_id;
    if v_tipo = 'escala' then
      if jsonb_typeof(v_resp) <> 'number' then
        continue;
      end if;
      v_max := case when (v_pergunta ->> 'max') ~ '^[0-9]+(\.[0-9]+)?$' then (v_pergunta ->> 'max')::numeric else 4 end;
      v_p := least(v_max, greatest(0, round((v_resp #>> '{}')::numeric)));
      v_respostas := v_respostas || jsonb_build_object(v_id, v_p);
      v_pontos := v_pontos + v_p;
      v_n := v_n + 1;
    elsif v_tipo = 'sim_nao' then
      if jsonb_typeof(v_resp) <> 'boolean' then
        continue;
      end if;
      if (v_resp #>> '{}')::boolean then
        v_pontos := v_pontos + case when (v_pergunta ->> 'pontos_sim') ~ '^[0-9]+(\.[0-9]+)?$' then (v_pergunta ->> 'pontos_sim')::numeric else 1 end;
      end if;
      v_respostas := v_respostas || jsonb_build_object(v_id, (v_resp #>> '{}')::boolean);
      v_n := v_n + 1;
    elsif v_tipo = 'multipla' then
      if jsonb_typeof(v_resp) <> 'number' then
        continue;
      end if;
      v_n_opcoes := case when jsonb_typeof(v_pergunta -> 'opcoes') = 'array' then jsonb_array_length(v_pergunta -> 'opcoes') else 0 end;
      v_idx := floor((v_resp #>> '{}')::numeric)::integer;
      if v_idx < 0 or v_idx >= v_n_opcoes or (v_resp #>> '{}')::numeric <> v_idx then
        continue;
      end if;
      v_pontos := v_pontos + case when ((v_pergunta -> 'opcoes' -> v_idx) ->> 'pontos') ~ '^-?[0-9]+(\.[0-9]+)?$'
                                  then greatest(0, ((v_pergunta -> 'opcoes' -> v_idx) ->> 'pontos')::numeric) else 0 end;
      v_respostas := v_respostas || jsonb_build_object(v_id, v_idx);
      v_n := v_n + 1;
    else
      if jsonb_typeof(v_resp) <> 'string' then
        continue;
      end if;
      v_texto := trim(v_resp #>> '{}');
      if v_texto = '' then
        continue;
      end if;
      v_respostas := v_respostas || jsonb_build_object(v_id, left(v_texto, 500));
      v_n := v_n + 1;
    end if;
  end loop;
  if v_n = 0 then
    raise exception 'sem_respostas';
  end if;

  -- rate limit simples por formulário: 30 respostas na última hora (conta também as da lixeira)
  select count(*) into v_qtd
    from respostas_preconsulta
   where formulario_id = f.id
     and created_at > now() - interval '1 hour';
  if v_qtd >= 30 then
    raise exception 'muitas_respostas';
  end if;

  v_pontos := round(v_pontos, 2);
  for v_faixa in select value from jsonb_array_elements(f.faixas) loop
    if jsonb_typeof(v_faixa) <> 'object' then
      continue;
    end if;
    v_fmin := case when (v_faixa ->> 'min') ~ '^-?[0-9]+(\.[0-9]+)?$' then (v_faixa ->> 'min')::numeric end;
    v_fmax := case when (v_faixa ->> 'max') ~ '^-?[0-9]+(\.[0-9]+)?$' then (v_faixa ->> 'max')::numeric end;
    if v_fmin is null or v_fmax is null then
      continue;
    end if;
    if v_pontos >= least(v_fmin, v_fmax) and v_pontos <= greatest(v_fmin, v_fmax) then
      v_nivel := case when (v_faixa ->> 'nivel') in ('baixo', 'moderado', 'alto') then v_faixa ->> 'nivel' else 'baixo' end;
      v_rotulo := left(trim(coalesce(v_faixa ->> 'rotulo', '')), 60);
      if v_rotulo = '' then
        v_rotulo := initcap(v_nivel);
      end if;
      exit;
    end if;
  end loop;

  insert into respostas_preconsulta (nutricionista_id, formulario_id, titulo, perguntas, faixas, respostas, pontuacao, faixa, nivel, nome, email, telefone)
  values (f.nutricionista_id, f.id, f.titulo, f.perguntas, f.faixas, v_respostas, v_pontos, v_rotulo, v_nivel, v_nome, v_email, v_telefone)
  returning id into v_novo_id;

  return jsonb_build_object('id', v_novo_id, 'pontuacao', v_pontos, 'faixa', v_rotulo, 'nivel', v_nivel);
end;
$function$;

CREATE OR REPLACE FUNCTION public.cadastro_link_info(p_codigo text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce((
    select jsonb_build_object('ok', true, 'profissional', public.nome_da_pessoa(d.user_id), 'conta', c.nome,
             'foto_url', (select nullif(btrim(pr.dados_profissionais ->> 'foto_url'), '') from public.profiles pr where pr.id = d.user_id))
      from public.w13_dono_do_codigo(p_codigo) d join public.contas c on c.id = d.conta_id),
    jsonb_build_object('ok', false, 'erro', 'link_nao_encontrado'));
$function$;

CREATE OR REPLACE FUNCTION public.cadastro_publico_info(p_codigo text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'public'
AS $function$
  select jsonb_build_object('nutricionista', coalesce(p.nome, ''), 'codigo', p.codigo_cadastro)
  from profiles p
  where p.codigo_cadastro = lower(trim(coalesce(p_codigo, '')))
    and p.ativo
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.cadastro_publico_enviar(p_codigo text, p_nome text, p_apelido text, p_nascimento text, p_telefone text, p_cpf text, p_email text, p_genero text, p_observacoes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'public'
AS $function$
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
    from public.paciente_conflitos(null, null, v_email, v_cpf) c;
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
$function$;

drop function if exists public.limite_publico(text, integer, text);
drop function if exists public.ip_do_pedido_hash();
drop table if exists public.publico_pedidos_ip;
