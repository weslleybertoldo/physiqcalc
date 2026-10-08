-- Reversa da 20261008030000_hml05b_entrada_mensagens (hml-05b): as 2 funções como estavam (pg_get_functiondef, 08/10/2026) e o default de 10 caracteres.
-- Os códigos de 16 já gerados continuam valendo. Aplicar: --so staging · --so public

CREATE OR REPLACE FUNCTION {schema}.cadastro_link_enviar(p_codigo text, p_dados jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_d jsonb := coalesce(p_dados, '{}'::jsonb);
  v_dono_user uuid;
  v_dono_conta uuid;
  v_nome text := left(regexp_replace(btrim(coalesce(v_d ->> 'nome', '')), '\s+', ' ', 'g'), 120);
  v_apelido text := nullif(left(regexp_replace(btrim(coalesce(v_d ->> 'apelido', '')), '\s+', ' ', 'g'), 60), '');
  v_email text := nullif(lower(btrim(coalesce(v_d ->> 'email', ''))), '');
  v_tel text := nullif(regexp_replace(coalesce(v_d ->> 'telefone', ''), '\D', '', 'g'), '');
  v_cpf text := nullif(regexp_replace(coalesce(v_d ->> 'cpf', ''), '\D', '', 'g'), '');
  v_genero text := nullif(lower(btrim(coalesce(v_d ->> 'genero', ''))), '');
  v_obs text := nullif(left(btrim(coalesce(v_d ->> 'observacoes', '')), 2000), '');
  v_nasc date;
  v_qtd integer;
  v_id uuid;
  v_rep text[];
begin
  select d.user_id, d.conta_id into v_dono_user, v_dono_conta from {schema}.w13_dono_do_codigo(p_codigo) d;
  if v_dono_user is null then return jsonb_build_object('ok', false, 'erro', 'link_nao_encontrado'); end if;
  if length(v_nome) < 2 then return jsonb_build_object('ok', false, 'erro', 'nome_invalido'); end if;
  if v_email is not null and (v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 160) then
    return jsonb_build_object('ok', false, 'erro', 'email_invalido');
  end if;
  if v_tel is not null and length(v_tel) not in (10, 11) then return jsonb_build_object('ok', false, 'erro', 'telefone_invalido'); end if;
  if v_cpf is not null and length(v_cpf) <> 11 then return jsonb_build_object('ok', false, 'erro', 'cpf_invalido'); end if;
  if v_genero is not null and v_genero not in ('masculino', 'feminino', 'outro') then return jsonb_build_object('ok', false, 'erro', 'genero_invalido'); end if;
  if nullif(btrim(coalesce(v_d ->> 'nascimento', '')), '') is not null then
    begin
      v_nasc := (v_d ->> 'nascimento')::date;
    exception when others then
      return jsonb_build_object('ok', false, 'erro', 'nascimento_invalido');
    end;
    if v_nasc > current_date or v_nasc < date '1900-01-01' then return jsonb_build_object('ok', false, 'erro', 'nascimento_invalido'); end if;
  end if;
  -- staging: só contato de teste (P26)
  if '{schema}' = 'staging' and v_email is not null and not {schema}.email_de_teste(v_email) then
    return jsonb_build_object('ok', false, 'erro', 'conta_real_no_staging');
  end if;
  select count(*) into v_qtd from {schema}.cadastros_pendentes cp
   where cp.nutricionista_id = v_dono_user and cp.created_at > now() - interval '1 hour';
  if v_qtd >= 30 then return jsonb_build_object('ok', false, 'erro', 'muitos_cadastros'); end if;
  if exists (select 1 from {schema}.cadastros_pendentes cp
              where cp.nutricionista_id = v_dono_user and cp.status = 'pendente'
                and ((v_cpf is not null and cp.cpf = v_cpf)
                  or (v_email is not null and cp.email = v_email)
                  or (v_tel is not null and cp.telefone = v_tel and lower(cp.nome) = lower(v_nome)))) then
    return jsonb_build_object('ok', false, 'erro', 'cadastro_repetido');
  end if;
  -- W16b + H5: e-mail ou CPF que já é de um aluno vivo (em qualquer conta) não vira cadastro novo — só diz que já existe
  select coalesce(array_agg(distinct c.campo order by c.campo), '{}') into v_rep
    from {schema}.paciente_conflitos(null, null, v_email, v_cpf) c;
  if cardinality(v_rep) > 0 then
    return jsonb_build_object('ok', false,
                              'erro', case when 'email' = any(v_rep) then 'cadastro_email_existe' else 'cadastro_cpf_existe' end,
                              'campos', to_jsonb(v_rep));
  end if;
  insert into {schema}.cadastros_pendentes (nutricionista_id, conta_id, nome, apelido, nascimento, telefone, cpf, email, genero, observacoes)
  values (v_dono_user, v_dono_conta, v_nome, v_apelido, v_nasc, v_tel, v_cpf, v_email, v_genero, v_obs)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$function$;

CREATE OR REPLACE FUNCTION {schema}.aluno_novo_link(p_aluno uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid := {schema}.w14_matricula_da_rota(p_aluno);
  v_alfa constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  v_bytes bytea;
  v_codigo text;
  v_i integer;
  v_tentativa integer := 0;
begin
  if not {schema}.w14_pode_editar(v_id) then return jsonb_build_object('ok', false, 'erro', 'sem_acesso'); end if;
  loop
    v_tentativa := v_tentativa + 1;
    v_bytes := extensions.gen_random_bytes(10);
    v_codigo := '';
    for v_i in 0..9 loop
      v_codigo := v_codigo || substr(v_alfa, (get_byte(v_bytes, v_i) % length(v_alfa)) + 1, 1);
    end loop;
    begin
      update {schema}.pacientes set link_codigo = v_codigo where id = v_id;
      exit;
    exception when unique_violation then
      if v_tentativa >= 5 then raise; end if;
    end;
  end loop;
  return jsonb_build_object('ok', true, 'paciente_id', v_id, 'link_codigo', v_codigo);
end;
$function$;

alter table {schema}.pacientes alter column link_codigo set default substr(md5((gen_random_uuid())::text), 1, 10);
