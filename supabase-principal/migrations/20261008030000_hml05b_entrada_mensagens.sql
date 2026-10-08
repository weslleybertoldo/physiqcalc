-- Homologação do Physiq — hml-05b / H-18 (mensagem) e H-17 item 2 (08/10/2026). Idempotente.
--
-- 1. Cadastro pelo link (/c/:codigo, função alunos → cadastro_link_enviar): e-mail ou CPF que já é de um aluno vivo em QUALQUER conta não
--    devolve mais cadastro_email_existe / cadastro_cpf_existe (a tela dizia "Já existe cadastro com este e-mail/CPF" a quem tem o link,
--    que é público). O pendente nasce como os outros; o profissional vê o aviso ao aprovar (gatilho pacientes_unicos_email_cpf →
--    paciente_email_repetido / paciente_cpf_repetido). Continua: cadastro_repetido (o MESMO e-mail/CPF pendente para o MESMO profissional).
-- 2. Código do link do diário com 16 caracteres (era 10): aluno_novo_link (alfabeto de 31, ≈ 79 bits) e o default da coluna
--    pacientes.link_codigo (hex, 64 bits). Os links já enviados continuam valendo (trocar quebraria o link que o aluno guardou); o
--    profissional troca pelo "novo link" quando quiser.
-- Corpos gerados de pg_get_functiondef no banco vivo (08/10/2026; staging e produção conferidos iguais com o marcador de schema) com trocas
-- exatas (gerar_migration.py do rascunho da hml-05b). Grants e dono não mudam (CREATE OR REPLACE).
-- Aplicar: python3 scripts/apply_migration_principal.py <este arquivo> --so staging [--dry-run]  ·  --so public (produção; backup antes)
-- Reversa: supabase-principal/reversas/20261008030000_hml05b_entrada_mensagens_reversa.sql

-- 1. cadastro pelo link: sem o aviso de existe
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
  -- hml-05b (H-18): e-mail ou CPF que já é de um aluno vira cadastro pendente como os outros — quem preenche o link não fica
  -- sabendo se a pessoa já é aluna em alguma conta; o profissional vê o aviso ao aprovar (o gatilho pacientes_unicos_email_cpf
  -- recusa com paciente_email_repetido / paciente_cpf_repetido, que o painel já mostra).
  insert into {schema}.cadastros_pendentes (nutricionista_id, conta_id, nome, apelido, nascimento, telefone, cpf, email, genero, observacoes)
  values (v_dono_user, v_dono_conta, v_nome, v_apelido, v_nasc, v_tel, v_cpf, v_email, v_genero, v_obs)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$function$;

-- 2. código do link do diário com 16 caracteres
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
    v_bytes := extensions.gen_random_bytes(16);
    v_codigo := '';
    for v_i in 0..15 loop
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

alter table {schema}.pacientes alter column link_codigo set default substr(md5(gen_random_uuid()::text), 1, 16);
