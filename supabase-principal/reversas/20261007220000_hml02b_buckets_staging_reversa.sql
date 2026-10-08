-- REVERSA da 20261007220000_hml02b_buckets_staging.sql (hml-02b, 07/10/2026): volta as funções e as policies ao de ANTES (gerado de
-- pg_get_functiondef/pg_policies no banco vivo, antes de aplicar), apaga as 24 policies e as 3 funções do staging.
-- Os 3 buckets -staging ficam (apagar bucket só vazio e pela API do Storage; o app de staging volta a usar os de produção só com
-- o front de antes).
-- Aplicar como bloco compartilhado (nomes explícitos): python3 scripts/apply_migration_principal.py <este arquivo> --compartilhado
select 1;

-- @@ compartilhado
-- produção: funções e policies de antes
CREATE OR REPLACE FUNCTION public.anexo_permitido(p_acao text, p_path text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_sch text;
  v_fn text;
  v_r boolean;
  v_achou boolean := false;
  v_minha boolean;
  v_pac uuid;
begin
  if p_path is null or auth.uid() is null then
    return false;
  end if;
  if public.eh_master() then
    return true;
  end if;
  v_minha := coalesce((storage.foldername(p_path))[1] = auth.uid()::text, false);
  if p_acao = 'subir' then
    begin
      v_pac := ((storage.foldername(p_path))[2])::uuid;
    exception when others then
      return false;
    end;
    if v_pac is null then
      return false;
    end if;
    foreach v_sch in array array['staging', 'public'] loop
      execute format('select exists (select 1 from %I.pacientes p where p.id = $1)', v_sch) into v_r using v_pac;
      if v_r then
        if to_regprocedure(v_sch || '.pode_subir_anexo(text)') is null then
          if v_minha then return true; end if;
        else
          execute format('select %I.pode_subir_anexo($1)', v_sch) into v_r using p_path;
          if v_r then return true; end if;
        end if;
      end if;
    end loop;
    return false;
  end if;
  v_fn := case when p_acao = 'apagar' then 'pode_apagar_anexo' else 'pode_ler_anexo' end;
  foreach v_sch in array array['staging', 'public'] loop
    execute format('select exists (select 1 from %I.anexos a where a.path = $1)', v_sch) into v_r using p_path;
    if v_r then
      v_achou := true;
      if to_regprocedure(v_sch || '.' || v_fn || '(text)') is null then
        if v_minha then return true; end if;
      else
        execute format('select %I.%I($1)', v_sch, v_fn) into v_r using p_path;
        if v_r then return true; end if;
      end if;
    end if;
  end loop;
  return not v_achou and v_minha;
end;
$function$;

CREATE OR REPLACE FUNCTION public.diario_foto_permitida(p_acao text, p_path text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_sch text;
  v_fn text;
  v_r boolean;
  v_achou boolean := false;
  v_minha boolean;
  v_pac uuid;
begin
  if p_path is null or auth.uid() is null then
    return false;
  end if;
  if public.eh_master() then
    return true;
  end if;
  v_minha := coalesce((storage.foldername(p_path))[1] = auth.uid()::text, false);
  v_fn := case when p_acao = 'apagar' then 'diario_pode_apagar_foto' else 'diario_pode_ler_foto' end;
  foreach v_sch in array array['staging', 'public'] loop
    execute format('select exists (select 1 from %I.diario_alimentar d where d.path = $1)', v_sch) into v_r using p_path;
    if v_r then
      v_achou := true;
      if to_regprocedure(v_sch || '.' || v_fn || '(text)') is null then
        -- schema sem a W24: a regra de antes (a pasta da nutri; o aluno lê as fotos dele — aluno_le_foto_diario, W11)
        if v_minha then return true; end if;
        if p_acao = 'ler' and to_regprocedure(v_sch || '.aluno_le_foto_diario(text)') is not null then
          execute format('select %I.aluno_le_foto_diario($1)', v_sch) into v_r using p_path;
          if v_r then return true; end if;
        end if;
      else
        execute format('select %I.%I($1)', v_sch, v_fn) into v_r using p_path;
        if v_r then return true; end if;
      end if;
    end if;
  end loop;
  if v_achou then
    return false;
  end if;
  if v_minha then
    return true;
  end if;
  -- envio no meio pelo app: a pasta é <nutri>/<paciente>/ e o paciente é o do login de quem chama
  if p_acao = 'ler' then
    begin
      v_pac := ((storage.foldername(p_path))[2])::uuid;
    exception when others then
      return false;
    end;
    if v_pac is null then
      return false;
    end if;
    foreach v_sch in array array['staging', 'public'] loop
      execute format('select exists (select 1 from %I.pacientes p where p.id = $1 and p.user_id = $2 and p.deleted_at is null)', v_sch)
        into v_r using v_pac, auth.uid();
      if v_r then return true; end if;
    end loop;
  end if;
  return false;
end;
$function$;

CREATE OR REPLACE FUNCTION public.diario_pasta_valida(p_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  partes text[] := storage.foldername(p_name);
  v_nutri uuid;
  v_pac uuid;
begin
  if p_name is null or array_length(partes, 1) is distinct from 2 then
    return false;
  end if;
  begin
    v_nutri := partes[1]::uuid;
    v_pac := partes[2]::uuid;
  exception when others then
    return false;
  end;
  if storage.filename(p_name) !~ '^[0-9a-f-]{36}\.[a-z0-9]{2,5}$' then
    return false;
  end if;
  -- W14 (R12): com o diário desligado nada sobe; pelo link (sem ser o próprio aluno logado) só com o envio pelo link ligado.
  -- (Sem as funções w14_ajuste dos schemas: este bloco é único e roda antes de um dos schemas receber a W14.)
  return exists (select 1 from public.pacientes p where p.id = v_pac and p.nutricionista_id = v_nutri and p.ativo and p.deleted_at is null
                   and (case when jsonb_typeof(p.config -> 'diario_alimentar') = 'boolean' then (p.config ->> 'diario_alimentar')::boolean else true end)
                   and ((auth.uid() is not null and p.user_id = auth.uid())
                        or (case when jsonb_typeof(p.config -> 'acesso_link') = 'boolean' then (p.config ->> 'acesso_link')::boolean else true end)))
      or exists (select 1 from staging.pacientes p where p.id = v_pac and p.nutricionista_id = v_nutri and p.ativo and p.deleted_at is null
                   and (case when jsonb_typeof(p.config -> 'diario_alimentar') = 'boolean' then (p.config ->> 'diario_alimentar')::boolean else true end)
                   and ((auth.uid() is not null and p.user_id = auth.uid())
                        or (case when jsonb_typeof(p.config -> 'acesso_link') = 'boolean' then (p.config ->> 'acesso_link')::boolean else true end)));
end;
$function$;

alter policy "diario: o aluno le as proprias fotos" on storage.objects
  using (((bucket_id = 'diario'::text) AND (staging.aluno_le_foto_diario(name) OR aluno_le_foto_diario(name))));

alter policy "evolucao: o aluno le as proprias fotos" on storage.objects
  using (((bucket_id = 'evolucao'::text) AND (staging.aluno_le_foto_evolucao(name) OR aluno_le_foto_evolucao(name))));

alter policy "evolucao: quem ve o aluno le as fotos" on storage.objects
  using (((bucket_id = 'evolucao'::text) AND (staging.profissional_le_foto_evolucao(name) OR profissional_le_foto_evolucao(name))));

-- staging: sem as policies e as funções novas; envio do diário e exclusões com o bucket de antes
drop policy if exists "anexos-staging: W18 apagar so quem muda a nutricao" on storage.objects;
drop policy if exists "anexos-staging: W18 ler so quem ve o clinico" on storage.objects;
drop policy if exists "anexos-staging: W18 quem muda a nutricao apaga" on storage.objects;
drop policy if exists "anexos-staging: W18 quem ve o clinico le" on storage.objects;
drop policy if exists "anexos-staging: W18 subir so na pasta de aluno atendido" on storage.objects;
drop policy if exists "anexos-staging: W18 trocar so quem ve o clinico" on storage.objects;
drop policy if exists "anexos-staging: apagar os proprios ou master" on storage.objects;
drop policy if exists "anexos-staging: editar os proprios ou master" on storage.objects;
drop policy if exists "anexos-staging: ler os proprios ou master" on storage.objects;
drop policy if exists "anexos-staging: subir nos proprios ou master" on storage.objects;
drop policy if exists "diario-staging: W24 apagar so quem muda a nutricao" on storage.objects;
drop policy if exists "diario-staging: W24 ler so quem ve o clinico" on storage.objects;
drop policy if exists "diario-staging: W24 quem muda a nutricao apaga" on storage.objects;
drop policy if exists "diario-staging: W24 quem ve o clinico le" on storage.objects;
drop policy if exists "diario-staging: apagar as proprias ou master" on storage.objects;
drop policy if exists "diario-staging: ler as proprias ou master" on storage.objects;
drop policy if exists "diario-staging: o aluno le as proprias fotos" on storage.objects;
drop policy if exists "diario-staging: subir na pasta de um paciente valido" on storage.objects;
drop policy if exists "evolucao-staging: apagar as proprias ou master" on storage.objects;
drop policy if exists "evolucao-staging: editar as proprias ou master" on storage.objects;
drop policy if exists "evolucao-staging: ler as proprias ou master" on storage.objects;
drop policy if exists "evolucao-staging: o aluno le as proprias fotos" on storage.objects;
drop policy if exists "evolucao-staging: quem ve o aluno le as fotos" on storage.objects;
drop policy if exists "evolucao-staging: subir nas proprias ou master" on storage.objects;

drop function if exists staging.anexo_permitido(text, text);
drop function if exists staging.diario_foto_permitida(text, text);
drop function if exists staging.diario_pasta_valida(text);

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

CREATE OR REPLACE FUNCTION staging.excluir_dados_aluno(p_uid uuid, p_simular boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_staff text;
  v_ids uuid[];
  v_arquivos jsonb;
  v_apaga jsonb;
  v_mantem jsonb;
  v_whats integer;
begin
  if p_uid is null then
    raise exception 'excluir_dados_aluno: p_uid obrigatório';
  end if;
  -- quem é profissional não exclui pelo app do aluno (a conta dele sustenta alunos e equipe — nunca deixar conta órfã)
  select case
      when exists (select 1 from auth.users u where u.id = p_uid and coalesce(u.raw_app_meta_data ->> 'role', '') in ('master', 'admin')) then 'master'
      when exists (select 1 from staging.profiles p where p.id = p_uid and p.role in ('master', 'nutricionista')) then 'perfil_profissional'
      when exists (select 1 from staging.contas c where c.dono_id = p_uid) then 'dono'
      when exists (select 1 from staging.conta_membros m where m.user_id = p_uid and m.status <> 'removido') then 'membro'
    end into v_staff;
  if v_staff is not null then
    return jsonb_build_object('ok', false, 'erro', 'profissional', 'motivo', v_staff);
  end if;

  -- TODAS as matrículas do login (inclusive as da lixeira): o login some, nenhuma pode ficar apontando para ele
  select coalesce(array_agg(p.id), array[]::uuid[]) into v_ids from staging.pacientes p where p.user_id = p_uid;

  if exists (select 1 from staging.aluno_assinaturas a where a.paciente_id = any(v_ids) and a.status in ('authorized', 'pending', 'paused')) then
    return jsonb_build_object('ok', false, 'erro', 'assinatura_ativa');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('bucket', 'diario', 'path', d.path)), '[]'::jsonb) into v_arquivos
    from staging.diario_alimentar d where d.paciente_id = any(v_ids) and nullif(d.path, '') is not null;
  select count(*) into v_whats from staging.mensagens_whatsapp m where m.paciente_id = any(v_ids) and m.status = 'pendente';

  v_apaga := jsonb_build_object(
    'diario_alimentar', (select count(*) from staging.diario_alimentar d where d.paciente_id = any(v_ids)),
    'refeicoes_concluidas', (select count(*) from staging.refeicoes_concluidas r where r.paciente_id = any(v_ids)),
    'metas_concluidas', (select count(*) from staging.metas_concluidas r where r.paciente_id = any(v_ids)),
    'avisos', (select count(*) from staging.avisos a where a.destino_user_id = p_uid),
    'perfil', (select count(*) from staging.profiles p where p.id = p_uid),
    'whatsapp_pendentes_cancelados', v_whats);
  v_mantem := jsonb_build_object(
    'matriculas', coalesce(array_length(v_ids, 1), 0),
    'agendamentos', (select count(*) from staging.agendamentos a where a.paciente_id = any(v_ids)),
    'cobrancas', (select count(*) from staging.cobrancas c where c.paciente_id = any(v_ids)),
    'recibos', (select count(*) from staging.recibos r where r.paciente_id = any(v_ids)),
    'antropometrias', (select count(*) from staging.antropometrias a where a.paciente_id = any(v_ids)),
    'planos_alimentares', (select count(*) from staging.planos_alimentares a where a.paciente_id = any(v_ids)),
    'prontuario', (select count(*) from staging.registros_prontuario a where a.paciente_id = any(v_ids)));

  if not coalesce(p_simular, true) then
    delete from staging.diario_alimentar where paciente_id = any(v_ids);
    delete from staging.refeicoes_concluidas where paciente_id = any(v_ids);
    delete from staging.metas_concluidas where paciente_id = any(v_ids);
    update staging.mensagens_whatsapp set status = 'cancelada', erro = 'o aluno excluiu a conta', updated_at = now()
     where paciente_id = any(v_ids) and status = 'pendente';
    update staging.pacientes
       set ativo = false,
           config = coalesce(config, '{}'::jsonb) || jsonb_build_object('conta_excluida_em', now())
     where id = any(v_ids);
    -- o gatilho do espelho enfileirou esta pessoa (ativo mudou), mas o login vai sumir: o Treino já foi tratado pela borda
    delete from staging.espelho_pendencias
     where feito_em is null and tipo = 'pessoa' and payload ->> 'principal_user_id' = p_uid::text;
  end if;

  return jsonb_build_object('ok', true, 'simulacao', coalesce(p_simular, true), 'matriculas', to_jsonb(v_ids),
    'apaga', v_apaga, 'mantem', v_mantem, 'arquivos', v_arquivos);
end;
$function$;

CREATE OR REPLACE FUNCTION staging.excluir_conta_profissional(p_uid uuid, p_simular boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_simular boolean := coalesce(p_simular, true);
  v_contas_dono uuid[];
  v_c record;
  v_m record;
  v_nome text;
  v_perfil text;
  v_ids_aluno uuid[];
  v_aluno jsonb := null;
  v_arquivos jsonb := '[]'::jsonb;
  v_whats integer := 0;
  v_dono jsonb := '[]'::jsonb;
  v_equipes jsonb := '[]'::jsonb;
  v_ex_equipes integer := 0;
  v_sem_conta jsonb := null;
  v_eu_nutri boolean;
  v_alunos jsonb;
  v_resumo_alunos jsonb;
  v_membros jsonb;
  v_cobrancas jsonb;
  v_pront jsonb;
  v_convites integer;
  v_lixeira integer;
  v_removidos integer;
  v_revogados integer;
  v_chaves integer;
  v_whats_conta integer;
  v_treino integer;
  v_nutri integer;
  v_feito jsonb;
  v_email_login text;
  v_perfis jsonb := '[]'::jsonb;
begin
  if p_uid is null then
    raise exception 'excluir_conta_profissional: p_uid obrigatório';
  end if;

  -- o master nunca exclui por aqui (a conta do app — origem 'app' — é dele e nunca é afetada)
  if exists (select 1 from auth.users u where u.id = p_uid and coalesce(u.raw_app_meta_data ->> 'role', '') in ('master', 'admin'))
     or exists (select 1 from staging.profiles p where p.id = p_uid and p.role = 'master') then
    return jsonb_build_object('ok', false, 'erro', 'profissional', 'motivo', 'master');
  end if;

  -- contas de que é dono: a linha da conta (dono_id — continua apontando para ele depois de excluir: o pedido de novo acha) ou o
  -- papel 'dono' numa equipe ainda ativa
  select coalesce(array_agg(distinct c.id), array[]::uuid[]) into v_contas_dono
    from staging.contas c
   where c.dono_id = p_uid
      or exists (select 1 from staging.conta_membros m
                  where m.conta_id = c.id and m.user_id = p_uid and m.status <> 'removido' and 'dono' = any(m.papeis));
  if exists (select 1 from staging.contas c where c.id = any(v_contas_dono) and c.origem = 'app') then
    return jsonb_build_object('ok', false, 'erro', 'profissional', 'motivo', 'conta_do_app');
  end if;
  if exists (select 1 from staging.contas c where c.id = any(v_contas_dono) and c.cobranca_legada) then
    return jsonb_build_object('ok', false, 'erro', 'conta_legada');
  end if;

  -- é (ou já foi) profissional? Sem conta, sem equipe (nem passada) e sem o perfil de nutricionista do site antigo = só aluno: o
  -- caminho é o de sempre (excluir_dados_aluno — a borda sem o campo novo)
  if coalesce(array_length(v_contas_dono, 1), 0) = 0
     and not exists (select 1 from staging.conta_membros m where m.user_id = p_uid)
     and not exists (select 1 from staging.profiles p where p.id = p_uid and p.role = 'nutricionista') then
    return jsonb_build_object('ok', false, 'erro', 'nao_profissional');
  end if;

  select coalesce(nullif(btrim(pr.nome), ''), nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(u.email, ''), '@', 1)),
         lower(u.email)
    into v_nome, v_email_login from auth.users u left join staging.profiles pr on pr.id = u.id where u.id = p_uid;

  -- ---------- a parte de ALUNO (quem também é aluno em alguma conta — a mesma lista da excluir_dados_aluno, W7) ----------
  select coalesce(array_agg(p.id), array[]::uuid[]) into v_ids_aluno from staging.pacientes p where p.user_id = p_uid;
  if exists (select 1 from staging.aluno_assinaturas a where a.paciente_id = any(v_ids_aluno) and a.status in ('authorized', 'pending', 'paused')) then
    return jsonb_build_object('ok', false, 'erro', 'assinatura_ativa');
  end if;
  -- toda recusa vem ANTES de mudar qualquer coisa: a cobrança automática das contas dele (plano e alunos → ele) a borda cancela no
  -- Mercado Pago antes de pedir o "excluir"; sobrou alguma viva (o cancelamento falhou ou nasceu outra no meio) → nada muda
  if not v_simular and (
       exists (select 1 from staging.conta_assinaturas a where a.conta_id = any(v_contas_dono) and a.status in ('authorized', 'pending', 'paused'))
    or exists (select 1 from staging.aluno_assinaturas a
                where a.status in ('authorized', 'pending', 'paused')
                  and (a.conta_id = any(v_contas_dono)
                       or exists (select 1 from staging.pacientes p where p.id = a.paciente_id and p.conta_id = any(v_contas_dono))))) then
    return jsonb_build_object('ok', false, 'erro', 'cobranca_ativa');
  end if;
  if coalesce(array_length(v_ids_aluno, 1), 0) > 0 then
    select coalesce(jsonb_agg(jsonb_build_object('bucket', 'diario', 'path', d.path)), '[]'::jsonb) into v_arquivos
      from staging.diario_alimentar d where d.paciente_id = any(v_ids_aluno) and nullif(d.path, '') is not null;
    select count(*) into v_whats from staging.mensagens_whatsapp m where m.paciente_id = any(v_ids_aluno) and m.status = 'pendente';
    v_aluno := jsonb_build_object(
      'matriculas', coalesce(array_length(v_ids_aluno, 1), 0),
      'contas', (select coalesce(jsonb_agg(distinct c.nome), '[]'::jsonb) from staging.pacientes p join staging.contas c on c.id = p.conta_id
                  where p.id = any(v_ids_aluno) and c.origem <> 'app' and not (c.id = any(v_contas_dono))),
      'apaga', jsonb_build_object(
        'diario_alimentar', (select count(*) from staging.diario_alimentar d where d.paciente_id = any(v_ids_aluno)),
        'refeicoes_concluidas', (select count(*) from staging.refeicoes_concluidas r where r.paciente_id = any(v_ids_aluno)),
        'metas_concluidas', (select count(*) from staging.metas_concluidas r where r.paciente_id = any(v_ids_aluno)),
        'whatsapp_pendentes_cancelados', v_whats),
      'mantem', jsonb_build_object(
        'agendamentos', (select count(*) from staging.agendamentos a where a.paciente_id = any(v_ids_aluno)),
        'cobrancas', (select count(*) from staging.cobrancas c where c.paciente_id = any(v_ids_aluno)),
        'recibos', (select count(*) from staging.recibos r where r.paciente_id = any(v_ids_aluno)),
        'antropometrias', (select count(*) from staging.antropometrias a where a.paciente_id = any(v_ids_aluno)),
        'planos_alimentares', (select count(*) from staging.planos_alimentares a where a.paciente_id = any(v_ids_aluno)),
        'prontuario', (select count(*) from staging.registros_prontuario a where a.paciente_id = any(v_ids_aluno))));
    if not v_simular then
      delete from staging.diario_alimentar where paciente_id = any(v_ids_aluno);
      delete from staging.refeicoes_concluidas where paciente_id = any(v_ids_aluno);
      delete from staging.metas_concluidas where paciente_id = any(v_ids_aluno);
      update staging.mensagens_whatsapp set status = 'cancelada', erro = 'o aluno excluiu a conta', updated_at = now()
       where paciente_id = any(v_ids_aluno) and status = 'pendente';
      -- o login sai por soft delete (a linha do Auth fica): a matrícula fica desligada dele aqui, como o "set null" faria
      update staging.pacientes
         set ativo = false, user_id = null,
             config = coalesce(config, '{}'::jsonb) || jsonb_build_object('conta_excluida_em', now())
       where id = any(v_ids_aluno);
    end if;
  end if;

  -- ---------- DONO: cada conta ----------
  for v_c in select c.* from staging.contas c where c.id = any(v_contas_dono) order by c.criado_em loop
    v_eu_nutri := 'nutricao' = any(staging.modulos_do_plano(v_c.plano))
      and exists (select 1 from staging.conta_membros m where m.conta_id = v_c.id and m.user_id = p_uid and m.status = 'ativo'
                    and 'nutricionista' = any(m.papeis));
    -- os alunos (fora da lixeira) e para onde vão — a mesma regra do gatilho pacientes_app_assumir (W7b)
    select jsonb_build_object(
             'total', count(*),
             'para_o_app', count(*) filter (where x.destino = 'app'),
             'guardados', count(*) filter (where x.destino <> 'app'),
             'lista', coalesce((jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome, 'destino', x.destino) order by x.nome)
                                 filter (where x.ordem <= 100)), '[]'::jsonb))
      into v_resumo_alunos
      from (select p.id, p.nome, row_number() over (order by p.nome) as ordem,
                   case when p.user_id is not null and p.user_id <> p_uid and p.ativo and v_c.origem in ('nova', 'legado_calc')
                          and not exists (select 1 from staging.pacientes o where o.user_id = p.user_id and o.conta_id is distinct from v_c.id
                                            and o.deleted_at is null and o.ativo)
                          and not exists (select 1 from staging.profiles pr where pr.id = p.user_id and pr.role = 'master')
                        then 'app' else 'guardado' end as destino
              from staging.pacientes p where p.conta_id = v_c.id and p.deleted_at is null) x;
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', m.id, 'nome', coalesce(staging.nome_da_pessoa(m.user_id), m.email_convite), 'email', coalesce(u.email, m.email_convite),
             'papeis', to_jsonb(m.papeis), 'status', m.status) order by m.status, coalesce(staging.nome_da_pessoa(m.user_id), m.email_convite)), '[]'::jsonb)
      into v_membros
      from staging.conta_membros m left join auth.users u on u.id = m.user_id
     where m.conta_id = v_c.id and m.status in ('ativo', 'convidado') and m.user_id is distinct from p_uid;
    select count(*) into v_convites from staging.convites cv where cv.conta_id = v_c.id and cv.status = 'pendente';
    v_cobrancas := jsonb_build_object(
      'plano', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'mp_preapproval_id', a.mp_preapproval_id, 'status', a.status,
                                                              'simulada', coalesce(a.payload ->> 'simulada', '') = 'true')), '[]'::jsonb)
                  from staging.conta_assinaturas a where a.conta_id = v_c.id and a.status in ('authorized', 'pending', 'paused')),
      'alunos', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'paciente_id', a.paciente_id, 'mp_preapproval_id', a.mp_preapproval_id,
                                                               'status', a.status)), '[]'::jsonb)
                   from staging.aluno_assinaturas a
                  where a.status in ('authorized', 'pending', 'paused')
                    and (a.conta_id = v_c.id or exists (select 1 from staging.pacientes p where p.id = a.paciente_id and p.conta_id = v_c.id))));
    -- os prontuários (todas as matrículas da conta, inclusive as da lixeira): o que o dono vê e o que é "Só nutricionistas"
    select coalesce(jsonb_agg(jsonb_build_object('paciente_id', p.id, 'conta_id', v_c.id, 'nome', p.nome, 'registros', x.total,
                                                 'restritos', x.restritos) order by p.nome), '[]'::jsonb)
      into v_pront
      from staging.pacientes p
      join lateral (select count(*) as total,
                           count(*) filter (where r.visibilidade = 'nutricionistas' and not v_eu_nutri) as restritos
                      from staging.registros_prontuario r where r.paciente_id = p.id and r.deleted_at is null) x on x.total > 0
     where p.conta_id = v_c.id;

    v_feito := null;
    if not v_simular then
      -- a) as matrículas para a lixeira, como no aluno_remover: o gatilho pacientes_app_assumir (W7b) leva quem tem login para o app
      update staging.pacientes set deleted_at = now() where conta_id = v_c.id and deleted_at is null;
      get diagnostics v_lixeira = row_count;
      -- b) a equipe perde o acesso (sou_membro na hora; o Treino pelo espelho) e fica sabendo pelo sino, como no remover_membro
      select count(*) into v_removidos from staging.conta_membros m
       where m.conta_id = v_c.id and m.status <> 'removido' and m.user_id is distinct from p_uid;
      insert into staging.avisos (destino_user_id, tipo, titulo, link)
      select m.user_id, 'membro_removido', left('Você não faz mais parte da equipe de ' || v_c.nome || ' (a conta foi encerrada)', 160), null
        from staging.conta_membros m where m.conta_id = v_c.id and m.status <> 'removido' and m.user_id is not null and m.user_id <> p_uid;
      update staging.conta_membros
         set status = 'removido', removido_em = now(),
             removido_motivo = case when user_id = p_uid then 'conta_excluida' else removido_motivo end
       where conta_id = v_c.id and status <> 'removido';
      -- c) convites (aluno e membro) que ninguém aceitou não levam mais ninguém para a conta
      update staging.convites set status = 'revogado' where conta_id = v_c.id and status = 'pendente';
      get diagnostics v_revogados = row_count;
      -- d) ninguém paga mais por Pix a uma conta encerrada; mensagens automáticas pendentes saem da fila
      update staging.recebimento_chaves set ativa = false, atualizado_em = now() where conta_id = v_c.id and ativa;
      get diagnostics v_chaves = row_count;
      update staging.mensagens_whatsapp set status = 'cancelada', erro = 'o profissional excluiu a conta', updated_at = now()
       where status = 'pendente' and (conta_id = v_c.id or nutricionista_id = p_uid);
      get diagnostics v_whats_conta = row_count;
      -- e) a conta fica (as matrículas da lixeira guardam o histórico), cancelada
      update staging.contas set situacao = 'cancelada' where id = v_c.id and situacao <> 'cancelada';
      v_feito := jsonb_build_object('alunos_na_lixeira', v_lixeira, 'membros_removidos', v_removidos, 'convites_revogados', v_revogados,
                                    'chaves_pix_desligadas', v_chaves, 'whatsapp_cancelados', v_whats_conta);
      if v_c.situacao <> 'cancelada' or v_lixeira > 0 or v_removidos > 0 or v_revogados > 0 or v_chaves > 0 or v_whats_conta > 0 then
        insert into staging.conta_eventos (conta_id, tipo, antes, depois, por)
        values (v_c.id, 'situacao', jsonb_build_object('situacao', v_c.situacao),
                jsonb_build_object('situacao', 'cancelada', 'acao', 'conta_excluida_pelo_dono', 'w2l', true,
                                   'alunos_para_o_app', v_resumo_alunos -> 'para_o_app') || v_feito, p_uid);
      end if;
    end if;

    v_dono := v_dono || jsonb_build_object(
      'id', v_c.id, 'nome', v_c.nome, 'origem', v_c.origem, 'plano', v_c.plano, 'situacao', v_c.situacao, 'eu_nutri', v_eu_nutri,
      'alunos', v_resumo_alunos, 'membros', v_membros, 'convites_pendentes', v_convites, 'cobrancas', v_cobrancas, 'prontuarios', v_pront,
      'feito', v_feito);
  end loop;

  -- ---------- pacientes sem conta do site antigo do Nutri (os da própria nutricionista — regra de hoje: nutricionista_id) ----------
  if exists (select 1 from staging.pacientes p where p.conta_id is null and p.nutricionista_id = p_uid) then
    select jsonb_build_object(
             'alunos', (select count(*) from staging.pacientes p where p.conta_id is null and p.nutricionista_id = p_uid and p.deleted_at is null),
             'prontuarios', coalesce((
               select jsonb_agg(jsonb_build_object('paciente_id', p.id, 'conta_id', null, 'nome', p.nome, 'registros', x.total, 'restritos', 0)
                                order by p.nome)
                 from staging.pacientes p
                 join lateral (select count(*) as total from staging.registros_prontuario r
                                where r.paciente_id = p.id and r.deleted_at is null) x on x.total > 0
                where p.conta_id is null and p.nutricionista_id = p_uid), '[]'::jsonb))
      into v_sem_conta;
    if not v_simular then
      update staging.pacientes set deleted_at = now() where conta_id is null and nutricionista_id = p_uid and deleted_at is null;
    end if;
  end if;

  -- ---------- MEMBRO (não dono): sai da equipe como no remover_membro, sem novo responsável ----------
  for v_m in select m.*, c.nome as conta_nome, c.dono_id
               from staging.conta_membros m join staging.contas c on c.id = m.conta_id
              where m.user_id = p_uid and m.status <> 'removido' and not (m.conta_id = any(v_contas_dono))
              order by m.criado_em loop
    select count(*) filter (where p.personal_id = p_uid), count(*) filter (where p.nutricionista_id = p_uid)
      into v_treino, v_nutri
      from staging.pacientes p where p.conta_id = v_m.conta_id and p.deleted_at is null;
    if not v_simular then
      update staging.pacientes set personal_id = null where conta_id = v_m.conta_id and personal_id = p_uid;
      update staging.pacientes set nutricionista_id = null where conta_id = v_m.conta_id and nutricionista_id = p_uid;
      update staging.convites set status = 'revogado'
       where conta_id = v_m.conta_id and tipo = 'aluno' and status = 'pendente' and responsavel_id = p_uid;
      get diagnostics v_revogados = row_count;
      update staging.conta_membros set status = 'removido', removido_em = now(), removido_motivo = 'conta_excluida' where id = v_m.id;
      insert into staging.conta_eventos (conta_id, tipo, antes, depois, por)
      values (v_m.conta_id, 'membro', jsonb_build_object('membro_id', v_m.id, 'papeis', to_jsonb(v_m.papeis), 'status', v_m.status),
              jsonb_build_object('acao', 'saiu_excluiu_a_conta', 'w2l', true, 'membro_id', v_m.id, 'user_id', p_uid, 'alunos_treino', v_treino,
                                 'alunos_nutricao', v_nutri, 'convites_de_aluno_revogados', v_revogados), p_uid);
      if v_m.dono_id is not null and v_m.dono_id <> p_uid then
        insert into staging.avisos (destino_user_id, tipo, titulo, link)
        values (v_m.dono_id, 'geral', left(coalesce(v_nome, 'Um profissional') || ' excluiu a conta e saiu da equipe'
                  || case when v_treino + v_nutri > 0 then ' · ' || (v_treino + v_nutri) || ' aluno(s) sem responsável' else '' end, 160),
                '/painel/alunos');
      end if;
    end if;
    v_equipes := v_equipes || jsonb_build_object('conta_id', v_m.conta_id, 'conta_nome', v_m.conta_nome,
      'dono_nome', staging.nome_da_pessoa(v_m.dono_id), 'papeis', to_jsonb(v_m.papeis), 'alunos_treino', v_treino, 'alunos_nutricao', v_nutri);
  end loop;
  select count(*) into v_ex_equipes from staging.conta_membros m
   where m.user_id = p_uid and m.status = 'removido' and not (m.conta_id = any(v_contas_dono)) and m.removido_motivo is null;

  v_perfil := case when jsonb_array_length(v_dono) > 0 then 'dono'
                   when jsonb_array_length(v_equipes) > 0 then 'membro'
                   else 'ex_profissional' end;

  -- ---------- a pessoa (o login sai pela borda, por soft delete) ----------
  if not v_simular then
    -- o perfil: anônimo aqui e no ESPELHO (o gatilho handle_new_user cria o perfil nos 2 schemas). Fica o nome e o CRN/CREF só onde
    -- ele assina algo (w2l_limpar_perfil). No staging só conta de teste chega aqui (a borda recusa conta real) e, mesmo assim, o
    -- espelho em public só é limpo com e-mail de teste
    v_perfis := jsonb_build_array(staging.w2l_limpar_perfil(p_uid, 'staging'));
    if 'staging' = 'public' then
      v_perfis := v_perfis || staging.w2l_limpar_perfil(p_uid, 'staging');
    elsif staging.email_de_teste(v_email_login) then
      v_perfis := v_perfis || staging.w2l_limpar_perfil(p_uid, 'public');
    end if;
    delete from staging.avisos where destino_user_id = p_uid;
    delete from staging.push_aparelhos where user_id = p_uid;
    update staging.whatsapp_instancias
       set status = 'desconectado', qr_code = null, numero_conectado = null, erro = 'conta excluída', updated_at = now()
     where nutricionista_id = p_uid and status <> 'desconectado';
    -- os gatilhos do espelho enfileiraram esta pessoa, mas o login vai sair: o Treino dela é tratado pela borda (delete-my-account).
    -- Os alunos e a equipe seguem na fila (a borda dispara o espelho logo depois).
    delete from staging.espelho_pendencias
     where feito_em is null and tipo = 'pessoa' and payload ->> 'principal_user_id' = p_uid::text;
  end if;

  return jsonb_build_object(
    'ok', true, 'simulacao', v_simular, 'perfil', v_perfil, 'nome', v_nome,
    'contas_dono', v_dono, 'equipes', v_equipes, 'ex_equipes', v_ex_equipes, 'sem_conta', v_sem_conta,
    'aluno', v_aluno, 'arquivos', v_arquivos, 'perfis', v_perfis);
end;
$function$;
