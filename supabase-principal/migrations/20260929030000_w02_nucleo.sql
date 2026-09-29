-- Physiq W2 — núcleo no BANCO PRINCIPAL (Supabase hkxvtsbwctxkrqzkkdoz). Idempotente. SÓ ACRESCENTA.
-- Spec "Physiq Unificado - desenho aprovado" §8.1 (tabelas e colunas), §7.4 (gatilho handle_new_user), §6 (planos e faixas).
--
-- Aplicar (backup ANTES, ver scripts/backup/):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260929030000_w02_nucleo.sql --so staging
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260929030000_w02_nucleo.sql --so public
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260929030000_w02_nucleo.sql --compartilhado
-- O bloco de cima roda 1x por schema ({schema} = public / staging); o bloco "@@ compartilhado" roda 1x, DEPOIS dos 2 schemas
-- (o gatilho novo grava papel 'pessoa' em public.profiles e staging.profiles, então os 2 CHECKs já precisam aceitar 'pessoa').
--
-- O que NÃO muda: nenhuma política de hoje sai e nenhum dado existente é alterado (só colunas novas com padrão).
-- As políticas novas são PERMISSIVAS e só passam a valer quando existirem contas e membros (script 01 da W3).
-- As restritivas (escrita da nutrição só por nutricionista numa conta com Nutrição) entram na W3.

-- ============================================================================================================
-- 1. profiles: papel 'pessoa' (quem entra sem convite e sem conta — spec 7.4; o teste passa a ser da CONTA)
-- ============================================================================================================
alter table {schema}.profiles drop constraint if exists profiles_role_check;
alter table {schema}.profiles add constraint profiles_role_check
  check (role in ('nutricionista', 'master', 'paciente', 'pessoa'));

-- carimbo de atualização das tabelas novas (colunas em português, como na spec)
create or replace function {schema}.set_atualizado_em() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

-- ============================================================================================================
-- 2. Tabelas novas do núcleo
-- ============================================================================================================

-- conta = quem paga o plano (1 ou mais profissionais — decisão 1A)
create table if not exists {schema}.contas (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(btrim(nome)) >= 1),
  dono_id uuid references auth.users(id) on delete set null,
  origem text not null default 'nova' check (origem in ('nova', 'legado_calc', 'legado_nutri')),
  plano text not null default 'treino_nutricao' check (plano in ('treino', 'nutricao', 'treino_nutricao')),
  faixa text not null default 'f10' check (faixa in ('f10', 'f30', 'f100', 'livre')),
  periodicidade text not null default 'mensal' check (periodicidade in ('mensal', 'anual')),
  situacao text not null default 'teste' check (situacao in ('teste', 'ativa', 'vencida', 'isenta', 'suspensa', 'cancelada')),
  teste_ate date,
  vence_em date,                       -- o acesso vai até vence_em INCLUSIVE (spec 6.2)
  tolerancia_dias integer not null default 0 check (tolerancia_dias between 0 and 60),  -- 7 no legado Calc
  valor_travado numeric(10,2) check (valor_travado is null or valor_travado >= 0),        -- preço de hoje dos legados (6A)
  regra_pix text not null default 'mes' check (regra_pix in ('mes', '30dias')),
  cobranca_legada boolean not null default false,                                         -- true nos legados até a W28
  isenta_motivo text,
  recebimento_modo text not null default 'pix_manual' check (recebimento_modo in ('pix_manual', 'nenhum', 'mercadopago')),
  bloquear_app_inadimplente boolean not null default false,
  alunos_bloqueados_em timestamptz,
  alunos_bloqueados_msg text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists contas_dono_idx on {schema}.contas (dono_id);

-- membro = profissional ligado à conta, com 1 ou mais papéis
create table if not exists {schema}.conta_membros (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references {schema}.contas(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,          -- vazio enquanto o convite não é aceito
  papeis text[] not null default '{}' check (papeis <@ array['dono', 'personal', 'nutricionista']::text[]),
  status text not null default 'convidado' check (status in ('convidado', 'ativo', 'removido')),
  email_convite text,
  codigo_convite text,                                                -- o PROF-NOME-SOBRENOME de hoje (link ?prof=)
  treino_user_id uuid,                                                -- só informativo: o vínculo que vale é physiq_identidades (Treino)
  criado_em timestamptz not null default now(),
  removido_em timestamptz,
  check (user_id is not null or email_convite is not null)
);
create unique index if not exists conta_membros_conta_user_uq on {schema}.conta_membros (conta_id, user_id) where user_id is not null;
create unique index if not exists conta_membros_codigo_uq on {schema}.conta_membros (codigo_convite) where codigo_convite is not null;
create index if not exists conta_membros_user_idx on {schema}.conta_membros (user_id);

-- convites de aluno e de membro (o aceite é pela função do 1º login, com e-mail confirmado)
create table if not exists {schema}.convites (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references {schema}.contas(id) on delete cascade,
  tipo text not null check (tipo in ('aluno', 'membro')),
  email text not null check (position('@' in email) > 1),
  papeis text[] not null default '{}' check (papeis <@ array['dono', 'personal', 'nutricionista']::text[]),
  modulos text[] not null default '{}' check (modulos <@ array['treino', 'nutricao']::text[]),
  responsavel_id uuid references auth.users(id) on delete set null,
  status text not null default 'pendente' check (status in ('pendente', 'aceito', 'revogado', 'expirado')),
  criado_por uuid references auth.users(id) on delete set null,
  enviado_em timestamptz not null default now(),
  aceito_em timestamptz
);
create index if not exists convites_conta_idx on {schema}.convites (conta_id);
create index if not exists convites_email_pendente_idx on {schema}.convites (lower(email)) where status = 'pendente';

-- tabela de preços (plano × faixa), editável pelo master, com histórico (a carga dos valores é da W4)
create table if not exists {schema}.plano_precos (
  id uuid primary key default gen_random_uuid(),
  plano text not null check (plano in ('treino', 'nutricao', 'treino_nutricao')),
  faixa text not null check (faixa in ('f10', 'f30', 'f100', 'livre')),
  min_alunos integer not null default 1 check (min_alunos >= 0),
  max_alunos integer check (max_alunos is null or max_alunos >= min_alunos),
  valor_mensal numeric(10,2) not null check (valor_mensal >= 0),
  valor_anual numeric(10,2) check (valor_anual is null or valor_anual >= 0),
  ativo boolean not null default true,
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (plano, faixa)
);
create table if not exists {schema}.plano_precos_hist (
  id bigint generated always as identity primary key,
  plano_preco_id uuid,
  alterado_por uuid,
  alterado_em timestamptz not null default now(),
  antes jsonb,
  depois jsonb
);

-- faturas da conta (Pix, cartão, anual, recorrente, manual, migradas); mp_payment_id único = webhook idempotente
create table if not exists {schema}.conta_faturas (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references {schema}.contas(id) on delete cascade,
  tipo text not null check (tipo in ('mensal', 'anual', 'pix_avulso', 'recorrente', 'manual', 'migrado')),
  valor numeric(10,2) not null check (valor >= 0),
  cobre_de date,
  cobre_ate date,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled', 'expired', 'refunded', 'charged_back', 'in_process')),
  forma text check (forma in ('pix', 'cartao', 'manual')),
  mp_payment_id text unique,
  mp_preapproval_id text,
  pix_qr text,
  pix_copia_cola text,
  pix_expira_em timestamptz,
  pago_em timestamptz,
  registrado_por uuid references auth.users(id) on delete set null,
  origem text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists conta_faturas_conta_idx on {schema}.conta_faturas (conta_id, criado_em desc);

-- assinatura no cartão da conta (1 por conta)
create table if not exists {schema}.conta_assinaturas (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null unique references {schema}.contas(id) on delete cascade,
  mp_preapproval_id text,
  status text not null default 'pending' check (status in ('pending', 'authorized', 'paused', 'cancelled')),
  valor numeric(10,2) check (valor is null or valor >= 0),
  proximo_vencimento timestamptz,
  ultimo_pagamento_em timestamptz,
  payload jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- linha do tempo da conta (plano, isenção, vencimento, aviso, membro...)
create table if not exists {schema}.conta_eventos (
  id bigint generated always as identity primary key,
  conta_id uuid not null references {schema}.contas(id) on delete cascade,
  tipo text not null check (tipo in ('plano', 'isencao', 'vencimento', 'aviso', 'membro', 'pagamento', 'situacao', 'outro')),
  antes jsonb,
  depois jsonb,
  por uuid,
  em timestamptz not null default now()
);
create index if not exists conta_eventos_conta_idx on {schema}.conta_eventos (conta_id, em desc);

-- regras gerais editáveis pelo master (teste_dias, teste_max_alunos, aviso_mudanca...) — a carga é da W3/W4
create table if not exists {schema}.app_config (
  chave text primary key,
  valor jsonb not null default '{}'::jsonb,
  publica boolean not null default false,   -- true = qualquer autenticado lê (ex.: textos do aviso "o Physiq mudou")
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);

-- ✓ nas metas do dia pelo aluno (NF4) — o aluno marca pela função aluno_marcar_meta (W11)
create table if not exists {schema}.metas_concluidas (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references {schema}.pacientes(id) on delete cascade,
  meta_id uuid not null references {schema}.metas(id) on delete cascade,
  data date not null,
  conta_id uuid references {schema}.contas(id) on delete set null,
  criado_em timestamptz not null default now(),
  unique (meta_id, data)
);
create index if not exists metas_concluidas_paciente_idx on {schema}.metas_concluidas (paciente_id, data desc);

-- planos que a conta cobra dos alunos (vem do physiq_planos do Calc — W6)
create table if not exists {schema}.planos_aluno (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references {schema}.contas(id) on delete cascade,
  nome text not null check (char_length(btrim(nome)) >= 1),
  valor numeric(10,2) check (valor is null or valor >= 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists planos_aluno_conta_idx on {schema}.planos_aluno (conta_id);

-- chaves Pix de recebimento (vem do physiq_recebimentos do Calc — W6); só 1 ativa por conta
create table if not exists {schema}.recebimento_chaves (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references {schema}.contas(id) on delete cascade,
  membro_id uuid references {schema}.conta_membros(id) on delete set null,
  tipo text not null check (tipo in ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria')),
  chave text not null check (char_length(btrim(chave)) >= 1),
  favorecido text,
  banco text,
  ativa boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists recebimento_chaves_uma_ativa_uq on {schema}.recebimento_chaves (conta_id) where ativa;

-- assinaturas de aluno no Mercado Pago (vem do physiq_assinaturas de aluno do Calc — W6)
create table if not exists {schema}.aluno_assinaturas (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references {schema}.pacientes(id) on delete cascade,
  conta_id uuid references {schema}.contas(id) on delete set null,
  mp_preapproval_id text unique,
  status text not null default 'pending' check (status in ('pending', 'authorized', 'paused', 'cancelled')),
  valor numeric(10,2) check (valor is null or valor > 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists aluno_assinaturas_paciente_idx on {schema}.aluno_assinaturas (paciente_id);

-- sino de avisos (NF9); quem grava é a worktree de cada assunto (W6, W16, W17, W20, W24)
create table if not exists {schema}.avisos (
  id uuid primary key default gen_random_uuid(),
  destino_user_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('plano_atualizado', 'reacao_diario', 'pagamento_confirmado', 'pagamento_recusado',
                                     'consulta_marcada', 'avaliacao_nova', 'geral')),
  titulo text not null,
  link text,
  lido_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists avisos_destino_idx on {schema}.avisos (destino_user_id, criado_em desc);

-- fila do espelho principal → Banco do Treino (spec 8.3). 'pessoa' = {principal_user_id}; 'conta' = {conta_id}
create table if not exists {schema}.espelho_pendencias (
  id bigint generated always as identity primary key,
  tipo text not null check (tipo in ('pessoa', 'conta')),
  payload jsonb not null default '{}'::jsonb,
  tentativas integer not null default 0,
  erro text,
  criado_em timestamptz not null default now(),
  proxima_em timestamptz not null default now(),
  feito_em timestamptz
);
create index if not exists espelho_pendencias_fila_idx on {schema}.espelho_pendencias (proxima_em) where feito_em is null;

-- ============================================================================================================
-- 3. Colunas novas em tabelas de hoje (todas opcionais ou com padrão que mantém o comportamento do site antigo)
-- ============================================================================================================

-- pacientes = MATRÍCULA do aluno (spec 4.1/8.1); nutricionista_id passa a aceitar vazio (aluno só de treino)
alter table {schema}.pacientes add column if not exists conta_id uuid references {schema}.contas(id) on delete set null;
alter table {schema}.pacientes add column if not exists personal_id uuid references auth.users(id) on delete set null;
alter table {schema}.pacientes add column if not exists treino_user_id uuid;
alter table {schema}.pacientes add column if not exists objetivo text;
alter table {schema}.pacientes add column if not exists origem text check (origem is null or origem in ('calc', 'nutri', 'novo'));
alter table {schema}.pacientes add column if not exists acesso_bloqueado_em timestamptz;
alter table {schema}.pacientes add column if not exists acesso_bloqueado_msg text;
alter table {schema}.pacientes alter column nutricionista_id drop not null;
create index if not exists pacientes_conta_idx on {schema}.pacientes (conta_id);
create index if not exists pacientes_personal_idx on {schema}.pacientes (personal_id);
-- P7 (spec 4.1): o aluno que hoje está nos 2 apps com profissionais de contas diferentes vira 2 matrículas no MESMO login.
-- O índice único de hoje (1 login = 1 paciente) impediria isso; vira índice comum. O site antigo não depende da unicidade
-- (paciente_criar_acesso recusa quem já tem acesso e meu_paciente_id() usa limit 1).
create index if not exists pacientes_user_idx on {schema}.pacientes (user_id) where user_id is not null;
drop index if exists {schema}.pacientes_user_id_uq;

-- plano alimentar por dia da semana (NF3): vazio = todos os dias, como hoje
alter table {schema}.refeicoes add column if not exists dias_semana smallint[] not null default '{}'
  check (dias_semana <@ '{1,2,3,4,5,6,7}'::smallint[]);

-- tipo do agendamento (NF12): o que já existe e o que o site antigo cria é de nutrição
alter table {schema}.agendamentos add column if not exists modulo text not null default 'nutricao'
  check (modulo in ('treino', 'nutricao', 'geral'));
alter table {schema}.agendamentos add column if not exists conta_id uuid references {schema}.contas(id) on delete set null;
create index if not exists agendamentos_conta_idx on {schema}.agendamentos (conta_id);

-- anotações do prontuário com visibilidade (P4): as de hoje e as do site antigo = "Só nutricionistas"
alter table {schema}.registros_prontuario add column if not exists visibilidade text not null default 'nutricionistas'
  check (visibilidade in ('equipe', 'nutricionistas'));
alter table {schema}.registros_prontuario add column if not exists autor_papel text not null default 'nutricionista'
  check (autor_papel in ('dono', 'personal', 'nutricionista', 'master'));

-- cobrança do aluno unificada (W6): Pix manual com comprovante, Mercado Pago, manual
alter table {schema}.cobrancas add column if not exists forma text check (forma is null or forma in ('pix_manual', 'mp', 'manual'));
alter table {schema}.cobrancas add column if not exists comprovante_path text;
alter table {schema}.cobrancas add column if not exists mp_payment_id text;
alter table {schema}.cobrancas add column if not exists plano_aluno_id uuid references {schema}.planos_aluno(id) on delete set null;
alter table {schema}.cobrancas add column if not exists origem text;
alter table {schema}.cobrancas add column if not exists conta_id uuid references {schema}.contas(id) on delete set null;
alter table {schema}.cobrancas add column if not exists criado_por uuid references auth.users(id) on delete set null;
alter table {schema}.cobrancas drop constraint if exists cobrancas_status_check;
alter table {schema}.cobrancas add constraint cobrancas_status_check
  check (status in ('aberta', 'paga', 'cancelada', 'aguardando_confirmacao'));
create unique index if not exists cobrancas_mp_payment_uq on {schema}.cobrancas (mp_payment_id) where mp_payment_id is not null;
create index if not exists cobrancas_conta_idx on {schema}.cobrancas (conta_id);

-- módulos comuns ganham a conta (nutricionista_id continua e passa a significar "profissional dono do registro")
alter table {schema}.calendarios add column if not exists conta_id uuid references {schema}.contas(id) on delete set null;
alter table {schema}.bloqueios_agenda add column if not exists conta_id uuid references {schema}.contas(id) on delete set null;
alter table {schema}.formularios_preconsulta add column if not exists conta_id uuid references {schema}.contas(id) on delete set null;
alter table {schema}.respostas_preconsulta add column if not exists conta_id uuid references {schema}.contas(id) on delete set null;
alter table {schema}.transacoes add column if not exists conta_id uuid references {schema}.contas(id) on delete set null;
alter table {schema}.categorias_financeiras add column if not exists conta_id uuid references {schema}.contas(id) on delete set null;
alter table {schema}.recibos add column if not exists conta_id uuid references {schema}.contas(id) on delete set null;
alter table {schema}.modelos_recibo add column if not exists conta_id uuid references {schema}.contas(id) on delete set null;
alter table {schema}.anexos add column if not exists conta_id uuid references {schema}.contas(id) on delete set null;
alter table {schema}.whatsapp_instancias add column if not exists conta_id uuid references {schema}.contas(id) on delete set null;
alter table {schema}.mensagens_whatsapp add column if not exists conta_id uuid references {schema}.contas(id) on delete set null;
alter table {schema}.cadastros_pendentes add column if not exists conta_id uuid references {schema}.contas(id) on delete set null;
create index if not exists calendarios_conta_idx on {schema}.calendarios (conta_id);
create index if not exists bloqueios_agenda_conta_idx on {schema}.bloqueios_agenda (conta_id);
create index if not exists formularios_preconsulta_conta_idx on {schema}.formularios_preconsulta (conta_id);
create index if not exists respostas_preconsulta_conta_idx on {schema}.respostas_preconsulta (conta_id);
create index if not exists transacoes_conta_idx on {schema}.transacoes (conta_id);
create index if not exists categorias_financeiras_conta_idx on {schema}.categorias_financeiras (conta_id);
create index if not exists recibos_conta_idx on {schema}.recibos (conta_id);
create index if not exists modelos_recibo_conta_idx on {schema}.modelos_recibo (conta_id);
create index if not exists anexos_conta_idx on {schema}.anexos (conta_id);
create index if not exists whatsapp_instancias_conta_idx on {schema}.whatsapp_instancias (conta_id);
create index if not exists mensagens_whatsapp_conta_idx on {schema}.mensagens_whatsapp (conta_id);
create index if not exists cadastros_pendentes_conta_idx on {schema}.cadastros_pendentes (conta_id);

-- ============================================================================================================
-- 4. Funções auxiliares (spec §8). SECURITY DEFINER: leem o núcleo sem RLS, mas só respondem sobre o próprio auth.uid().
-- ============================================================================================================
create or replace function {schema}.modulos_do_plano(p_plano text) returns text[]
language sql immutable set search_path = '' as $$
  select case p_plano
    when 'treino' then array['treino']
    when 'nutricao' then array['nutricao']
    when 'treino_nutricao' then array['treino', 'nutricao']
    else array[]::text[] end;
$$;

create or replace function {schema}.conta_tem_modulo(p_conta uuid, p_modulo text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p_modulo = any({schema}.modulos_do_plano(c.plano)) from {schema}.contas c where c.id = p_conta), false);
$$;

create or replace function {schema}.sou_membro(p_conta uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from {schema}.conta_membros m
                  where m.conta_id = p_conta and m.user_id = auth.uid() and m.status = 'ativo');
$$;

create or replace function {schema}.sou_dono(p_conta uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from {schema}.conta_membros m
                  where m.conta_id = p_conta and m.user_id = auth.uid() and m.status = 'ativo' and 'dono' = any(m.papeis));
$$;

-- o papel só vale se a conta tem o módulo dele (personal → treino; nutricionista → nutricao; dono → sempre)
create or replace function {schema}.tenho_papel(p_conta uuid, p_papel text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from {schema}.conta_membros m join {schema}.contas c on c.id = m.conta_id
     where m.conta_id = p_conta and m.user_id = auth.uid() and m.status = 'ativo' and p_papel = any(m.papeis)
       and (p_papel = 'dono'
         or (p_papel = 'personal' and 'treino' = any({schema}.modulos_do_plano(c.plano)))
         or (p_papel = 'nutricionista' and 'nutricao' = any({schema}.modulos_do_plano(c.plano)))));
$$;

-- o membro (linha de conta_membros) é o próprio usuário, ativo, naquela conta
create or replace function {schema}.sou_o_membro(p_membro uuid, p_conta uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from {schema}.conta_membros m
                  where m.id = p_membro and m.conta_id = p_conta and m.user_id = auth.uid() and m.status = 'ativo');
$$;

-- papéis que a conta pode dar (papel precisa do módulo — spec 4.1)
create or replace function {schema}.papeis_permitidos(p_conta uuid, p_papeis text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(bool_and(
           papel = 'dono'
        or (papel = 'personal' and {schema}.conta_tem_modulo(p_conta, 'treino'))
        or (papel = 'nutricionista' and {schema}.conta_tem_modulo(p_conta, 'nutricao'))), true)
    from unnest(coalesce(p_papeis, array[]::text[])) as papel;
$$;

-- quem vê o aluno (P1): master; dono da conta; o responsável de cada módulo (com o papel valendo);
-- aluno sem conta (site antigo) = a regra de hoje (nutricionista_id)
create or replace function {schema}.pode_ver_aluno(p_paciente uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select {schema}.eh_master() or exists (
    select 1 from {schema}.pacientes p
     where p.id = p_paciente and (
           (p.conta_id is null and p.nutricionista_id = auth.uid())
        or (p.conta_id is not null and (
                {schema}.sou_dono(p.conta_id)
             or (p.personal_id = auth.uid() and {schema}.tenho_papel(p.conta_id, 'personal'))
             or (p.nutricionista_id = auth.uid() and {schema}.tenho_papel(p.conta_id, 'nutricionista'))))));
$$;

-- quem edita (P2/P3): p_modulo vazio = cadastro (dono ou responsável); 'treino' = personal responsável ou dono com papel
-- personal; 'nutricao' = nutricionista responsável ou dono com papel nutricionista
create or replace function {schema}.pode_editar_aluno(p_paciente uuid, p_modulo text default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select {schema}.eh_master() or exists (
    select 1 from {schema}.pacientes p
     where p.id = p_paciente and (
           (p.conta_id is null and p.nutricionista_id = auth.uid() and coalesce(p_modulo, 'nutricao') = 'nutricao')
        or (p.conta_id is not null and (
                (p_modulo is null and {schema}.sou_dono(p.conta_id))
             or (coalesce(p_modulo, 'treino') = 'treino' and {schema}.tenho_papel(p.conta_id, 'personal')
                 and (p.personal_id = auth.uid() or {schema}.sou_dono(p.conta_id)))
             or (coalesce(p_modulo, 'nutricao') = 'nutricao' and {schema}.tenho_papel(p.conta_id, 'nutricionista')
                 and (p.nutricionista_id = auth.uid() or {schema}.sou_dono(p.conta_id)))))));
$$;

-- aluno ativo = matrícula com ativo, sem deleted_at e sem bloqueio individual (spec 6.1)
create or replace function {schema}.conta_alunos_ativos(p_conta uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from {schema}.pacientes p
   where p.conta_id = p_conta and p.ativo and p.deleted_at is null and p.acesso_bloqueado_em is null;
$$;

-- limite da faixa: legado Nutri sem limite; teste = app_config.teste_max_alunos (padrão 10); senão a tabela de preços
-- (ou o padrão da faixa: f10 = 10, f30 = 30, f100 = 100, livre = sem limite). Legado Calc: a faixa do plano dele.
create or replace function {schema}.conta_limite_alunos(p_conta uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select case
    when c.origem = 'legado_nutri' then null
    when c.situacao = 'teste' then coalesce(
      (select (a.valor #>> '{}')::integer from {schema}.app_config a
        where a.chave = 'teste_max_alunos' and jsonb_typeof(a.valor) = 'number'), 10)
    else coalesce(
      (select pp.max_alunos from {schema}.plano_precos pp where pp.plano = c.plano and pp.faixa = c.faixa),
      case c.faixa when 'f10' then 10 when 'f30' then 30 when 'f100' then 100 else null end)
  end
  from {schema}.contas c where c.id = p_conta;
$$;

create or replace function {schema}.conta_pode_adicionar_aluno(p_conta uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from {schema}.contas c where c.id = p_conta)
     and ({schema}.conta_limite_alunos(p_conta) is null
          or {schema}.conta_alunos_ativos(p_conta) < {schema}.conta_limite_alunos(p_conta));
$$;

-- comprovante no Storage: dono da conta, quem criou a cobrança (ou o profissional dono do registro) e o aluno dono
create or replace function {schema}.pode_ler_comprovante(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select {schema}.eh_master() or exists (
    select 1 from {schema}.cobrancas c
     where c.comprovante_path = p_path and (
           (c.conta_id is not null and {schema}.sou_dono(c.conta_id))
        or c.criado_por = auth.uid()
        or c.nutricionista_id = auth.uid()
        or c.paciente_id = {schema}.meu_paciente_id()));
$$;

-- leitura de planos/refeições/itens pelo responsável (o personal lê o plano — P3)
create or replace function {schema}.pode_ver_plano_alimentar(p_plano uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from {schema}.planos_alimentares pa where pa.id = p_plano and {schema}.pode_ver_aluno(pa.paciente_id));
$$;
create or replace function {schema}.pode_ver_refeicao(p_refeicao uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from {schema}.refeicoes r where r.id = p_refeicao and {schema}.pode_ver_plano_alimentar(r.plano_id));
$$;

-- anotação "Só nutricionistas": nutricionista da conta (com o módulo) ou a dona do aluno sem conta (site antigo)
create or replace function {schema}.sou_nutri_do_aluno(p_paciente uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select {schema}.eh_master() or exists (
    select 1 from {schema}.pacientes p
     where p.id = p_paciente and (
           (p.conta_id is null and p.nutricionista_id = auth.uid())
        or (p.conta_id is not null and {schema}.tenho_papel(p.conta_id, 'nutricionista'))));
$$;

-- fila do espelho: os gatilhos das próximas worktrees (W4/W5/W13) chamam isto
create or replace function {schema}.espelho_enfileirar(p_tipo text, p_payload jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into {schema}.espelho_pendencias (tipo, payload) values (p_tipo, coalesce(p_payload, '{}'::jsonb));
$$;

-- histórico automático da tabela de preços (quem mudou, antes e depois)
create or replace function {schema}.plano_precos_registrar_hist() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into {schema}.plano_precos_hist (plano_preco_id, alterado_por, antes, depois)
  values (case when tg_op = 'DELETE' then old.id else new.id end, auth.uid(),
          case when tg_op = 'INSERT' then null else to_jsonb(old) end,
          case when tg_op = 'DELETE' then null else to_jsonb(new) end);
  return null;
end;
$$;

-- guardas: pelo app (role authenticated, fora do master) só muda o que a spec deixa
create or replace function {schema}.contas_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and not {schema}.eh_master() then
    -- o dono edita nome, recebimento (menos ligar o Mercado Pago) e o bloqueio do inadimplente; o resto é do servidor/master
    new.id := old.id; new.dono_id := old.dono_id; new.origem := old.origem; new.plano := old.plano; new.faixa := old.faixa;
    new.periodicidade := old.periodicidade; new.situacao := old.situacao; new.teste_ate := old.teste_ate;
    new.vence_em := old.vence_em; new.tolerancia_dias := old.tolerancia_dias; new.valor_travado := old.valor_travado;
    new.regra_pix := old.regra_pix; new.cobranca_legada := old.cobranca_legada; new.isenta_motivo := old.isenta_motivo;
    new.alunos_bloqueados_em := old.alunos_bloqueados_em; new.alunos_bloqueados_msg := old.alunos_bloqueados_msg;
    new.criado_em := old.criado_em;
    if new.recebimento_modo = 'mercadopago' and old.recebimento_modo is distinct from 'mercadopago' then
      new.recebimento_modo := old.recebimento_modo;
    end if;
  end if;
  return new;
end;
$$;

create or replace function {schema}.conta_membros_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and not {schema}.eh_master() then
    -- o dono muda papéis, situação e o e-mail do convite; quem é a pessoa (e o vínculo com o Treino) é do servidor
    new.id := old.id; new.conta_id := old.conta_id; new.user_id := old.user_id; new.treino_user_id := old.treino_user_id;
    new.codigo_convite := old.codigo_convite; new.criado_em := old.criado_em;
  end if;
  return new;
end;
$$;

create or replace function {schema}.pacientes_guard_vinculos() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- o login do aluno (user_id) e o id dele no Banco do Treino só mudam pelas funções do servidor (security definer),
  -- nunca por escrita direta do app: o espelho confia nesses vínculos para ligar o treino do aluno ao personal
  if current_user = 'authenticated' and not {schema}.eh_master() then
    if tg_op = 'INSERT' then
      new.user_id := null;
      new.treino_user_id := null;
    else
      new.user_id := old.user_id;
      new.treino_user_id := old.treino_user_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_contas_guard on {schema}.contas;
create trigger trg_contas_guard before update on {schema}.contas for each row execute function {schema}.contas_guard();
drop trigger if exists trg_conta_membros_guard on {schema}.conta_membros;
create trigger trg_conta_membros_guard before update on {schema}.conta_membros
  for each row execute function {schema}.conta_membros_guard();
drop trigger if exists trg_pacientes_guard_vinculos on {schema}.pacientes;
create trigger trg_pacientes_guard_vinculos before insert or update on {schema}.pacientes
  for each row execute function {schema}.pacientes_guard_vinculos();
drop trigger if exists trg_plano_precos_hist on {schema}.plano_precos;
create trigger trg_plano_precos_hist after insert or update or delete on {schema}.plano_precos
  for each row execute function {schema}.plano_precos_registrar_hist();

drop trigger if exists trg_contas_atualizado_em on {schema}.contas;
create trigger trg_contas_atualizado_em before update on {schema}.contas for each row execute function {schema}.set_atualizado_em();
drop trigger if exists trg_plano_precos_atualizado_em on {schema}.plano_precos;
create trigger trg_plano_precos_atualizado_em before update on {schema}.plano_precos for each row execute function {schema}.set_atualizado_em();
drop trigger if exists trg_conta_faturas_atualizado_em on {schema}.conta_faturas;
create trigger trg_conta_faturas_atualizado_em before update on {schema}.conta_faturas for each row execute function {schema}.set_atualizado_em();
drop trigger if exists trg_conta_assinaturas_atualizado_em on {schema}.conta_assinaturas;
create trigger trg_conta_assinaturas_atualizado_em before update on {schema}.conta_assinaturas for each row execute function {schema}.set_atualizado_em();
drop trigger if exists trg_app_config_atualizado_em on {schema}.app_config;
create trigger trg_app_config_atualizado_em before update on {schema}.app_config for each row execute function {schema}.set_atualizado_em();
drop trigger if exists trg_planos_aluno_atualizado_em on {schema}.planos_aluno;
create trigger trg_planos_aluno_atualizado_em before update on {schema}.planos_aluno for each row execute function {schema}.set_atualizado_em();
drop trigger if exists trg_recebimento_chaves_atualizado_em on {schema}.recebimento_chaves;
create trigger trg_recebimento_chaves_atualizado_em before update on {schema}.recebimento_chaves for each row execute function {schema}.set_atualizado_em();
drop trigger if exists trg_aluno_assinaturas_atualizado_em on {schema}.aluno_assinaturas;
create trigger trg_aluno_assinaturas_atualizado_em before update on {schema}.aluno_assinaturas for each row execute function {schema}.set_atualizado_em();

-- execução: só autenticado e service_role (as políticas rodam como authenticated); a fila só pelo servidor
revoke execute on function {schema}.conta_tem_modulo(uuid, text), {schema}.sou_membro(uuid), {schema}.sou_dono(uuid),
  {schema}.tenho_papel(uuid, text), {schema}.sou_o_membro(uuid, uuid), {schema}.papeis_permitidos(uuid, text[]),
  {schema}.pode_ver_aluno(uuid), {schema}.pode_editar_aluno(uuid, text), {schema}.conta_alunos_ativos(uuid),
  {schema}.conta_limite_alunos(uuid), {schema}.conta_pode_adicionar_aluno(uuid), {schema}.pode_ler_comprovante(text),
  {schema}.pode_ver_plano_alimentar(uuid), {schema}.pode_ver_refeicao(uuid), {schema}.sou_nutri_do_aluno(uuid)
  from public, anon;
grant execute on function {schema}.conta_tem_modulo(uuid, text), {schema}.sou_membro(uuid), {schema}.sou_dono(uuid),
  {schema}.tenho_papel(uuid, text), {schema}.sou_o_membro(uuid, uuid), {schema}.papeis_permitidos(uuid, text[]),
  {schema}.pode_ver_aluno(uuid), {schema}.pode_editar_aluno(uuid, text), {schema}.conta_alunos_ativos(uuid),
  {schema}.conta_limite_alunos(uuid), {schema}.conta_pode_adicionar_aluno(uuid), {schema}.pode_ler_comprovante(text),
  {schema}.pode_ver_plano_alimentar(uuid), {schema}.pode_ver_refeicao(uuid), {schema}.sou_nutri_do_aluno(uuid)
  to authenticated, service_role;
revoke execute on function {schema}.espelho_enfileirar(text, jsonb) from public, anon, authenticated;
grant execute on function {schema}.espelho_enfileirar(text, jsonb) to service_role;

-- ============================================================================================================
-- 5. RLS e GRANT explícito das tabelas novas (spec 8.1, coluna RLS)
-- ============================================================================================================
alter table {schema}.contas enable row level security;
alter table {schema}.conta_membros enable row level security;
alter table {schema}.convites enable row level security;
alter table {schema}.plano_precos enable row level security;
alter table {schema}.plano_precos_hist enable row level security;
alter table {schema}.conta_faturas enable row level security;
alter table {schema}.conta_assinaturas enable row level security;
alter table {schema}.conta_eventos enable row level security;
alter table {schema}.app_config enable row level security;
alter table {schema}.metas_concluidas enable row level security;
alter table {schema}.planos_aluno enable row level security;
alter table {schema}.recebimento_chaves enable row level security;
alter table {schema}.aluno_assinaturas enable row level security;
alter table {schema}.avisos enable row level security;
alter table {schema}.espelho_pendencias enable row level security;

revoke all on {schema}.contas, {schema}.conta_membros, {schema}.convites, {schema}.plano_precos, {schema}.plano_precos_hist,
  {schema}.conta_faturas, {schema}.conta_assinaturas, {schema}.conta_eventos, {schema}.app_config, {schema}.metas_concluidas,
  {schema}.planos_aluno, {schema}.recebimento_chaves, {schema}.aluno_assinaturas, {schema}.avisos, {schema}.espelho_pendencias
  from anon, authenticated;
grant all on {schema}.contas, {schema}.conta_membros, {schema}.convites, {schema}.plano_precos, {schema}.plano_precos_hist,
  {schema}.conta_faturas, {schema}.conta_assinaturas, {schema}.conta_eventos, {schema}.app_config, {schema}.metas_concluidas,
  {schema}.planos_aluno, {schema}.recebimento_chaves, {schema}.aluno_assinaturas, {schema}.avisos, {schema}.espelho_pendencias
  to service_role;
grant select, insert, update, delete on {schema}.contas, {schema}.conta_membros, {schema}.convites, {schema}.plano_precos,
  {schema}.conta_faturas, {schema}.conta_assinaturas, {schema}.conta_eventos, {schema}.app_config,
  {schema}.planos_aluno, {schema}.recebimento_chaves, {schema}.aluno_assinaturas
  to authenticated;
grant select on {schema}.plano_precos_hist, {schema}.metas_concluidas, {schema}.avisos to authenticated;
grant update (lido_em) on {schema}.avisos to authenticated;
-- espelho_pendencias: nenhum acesso pelo app (só service_role)

-- contas: membro ativo lê; dono edita (a guarda segura plano/situação/datas/valores); master tudo
drop policy if exists "contas: membro le" on {schema}.contas;
create policy "contas: membro le" on {schema}.contas for select to authenticated using ({schema}.sou_membro(id));
drop policy if exists "contas: dono edita" on {schema}.contas;
create policy "contas: dono edita" on {schema}.contas for update to authenticated
  using ({schema}.sou_dono(id)) with check ({schema}.sou_dono(id));
drop policy if exists "contas: master tudo" on {schema}.contas;
create policy "contas: master tudo" on {schema}.contas for all to authenticated
  using ({schema}.eh_master()) with check ({schema}.eh_master());

-- conta_membros: membros leem a equipe (e cada um as próprias linhas); dono convida, muda papéis e remove; master tudo
drop policy if exists "conta_membros: membros leem" on {schema}.conta_membros;
create policy "conta_membros: membros leem" on {schema}.conta_membros for select to authenticated
  using ({schema}.sou_membro(conta_id) or user_id = (select auth.uid()));
drop policy if exists "conta_membros: dono convida" on {schema}.conta_membros;
create policy "conta_membros: dono convida" on {schema}.conta_membros for insert to authenticated
  with check ({schema}.sou_dono(conta_id) and {schema}.papeis_permitidos(conta_id, papeis)
              and user_id is null and treino_user_id is null and codigo_convite is null and status = 'convidado');
drop policy if exists "conta_membros: dono edita" on {schema}.conta_membros;
create policy "conta_membros: dono edita" on {schema}.conta_membros for update to authenticated
  using ({schema}.sou_dono(conta_id)) with check ({schema}.sou_dono(conta_id) and {schema}.papeis_permitidos(conta_id, papeis));
drop policy if exists "conta_membros: dono apaga convite" on {schema}.conta_membros;
create policy "conta_membros: dono apaga convite" on {schema}.conta_membros for delete to authenticated
  using ({schema}.sou_dono(conta_id) and user_id is null);
drop policy if exists "conta_membros: master tudo" on {schema}.conta_membros;
create policy "conta_membros: master tudo" on {schema}.conta_membros for all to authenticated
  using ({schema}.eh_master()) with check ({schema}.eh_master());

-- convites: dono e quem convidou gerenciam; membro convida aluno; só o dono convida membro
drop policy if exists "convites: dono e quem convidou" on {schema}.convites;
create policy "convites: dono e quem convidou" on {schema}.convites for select to authenticated
  using ({schema}.sou_dono(conta_id) or (criado_por = (select auth.uid()) and {schema}.sou_membro(conta_id)));
drop policy if exists "convites: criar" on {schema}.convites;
create policy "convites: criar" on {schema}.convites for insert to authenticated
  with check (criado_por = (select auth.uid()) and (
                (tipo = 'membro' and {schema}.sou_dono(conta_id) and {schema}.papeis_permitidos(conta_id, papeis))
             or (tipo = 'aluno' and {schema}.sou_membro(conta_id))));
drop policy if exists "convites: editar" on {schema}.convites;
create policy "convites: editar" on {schema}.convites for update to authenticated
  using ({schema}.sou_dono(conta_id) or (criado_por = (select auth.uid()) and {schema}.sou_membro(conta_id)))
  with check ({schema}.sou_dono(conta_id) or (criado_por = (select auth.uid()) and {schema}.sou_membro(conta_id) and tipo = 'aluno'));
drop policy if exists "convites: apagar" on {schema}.convites;
create policy "convites: apagar" on {schema}.convites for delete to authenticated
  using ({schema}.sou_dono(conta_id) or (criado_por = (select auth.uid()) and {schema}.sou_membro(conta_id)));
drop policy if exists "convites: master tudo" on {schema}.convites;
create policy "convites: master tudo" on {schema}.convites for all to authenticated
  using ({schema}.eh_master()) with check ({schema}.eh_master());

-- tabela de preços: autenticado lê; master edita (histórico pelo gatilho)
drop policy if exists "plano_precos: autenticado le" on {schema}.plano_precos;
create policy "plano_precos: autenticado le" on {schema}.plano_precos for select to authenticated using (true);
drop policy if exists "plano_precos: master edita" on {schema}.plano_precos;
create policy "plano_precos: master edita" on {schema}.plano_precos for all to authenticated
  using ({schema}.eh_master()) with check ({schema}.eh_master());
drop policy if exists "plano_precos_hist: master le" on {schema}.plano_precos_hist;
create policy "plano_precos_hist: master le" on {schema}.plano_precos_hist for select to authenticated using ({schema}.eh_master());

-- faturas, assinatura e eventos da conta: dono lê; master tudo; o resto é service_role
drop policy if exists "conta_faturas: dono le" on {schema}.conta_faturas;
create policy "conta_faturas: dono le" on {schema}.conta_faturas for select to authenticated using ({schema}.sou_dono(conta_id));
drop policy if exists "conta_faturas: master tudo" on {schema}.conta_faturas;
create policy "conta_faturas: master tudo" on {schema}.conta_faturas for all to authenticated
  using ({schema}.eh_master()) with check ({schema}.eh_master());
drop policy if exists "conta_assinaturas: dono le" on {schema}.conta_assinaturas;
create policy "conta_assinaturas: dono le" on {schema}.conta_assinaturas for select to authenticated using ({schema}.sou_dono(conta_id));
drop policy if exists "conta_assinaturas: master tudo" on {schema}.conta_assinaturas;
create policy "conta_assinaturas: master tudo" on {schema}.conta_assinaturas for all to authenticated
  using ({schema}.eh_master()) with check ({schema}.eh_master());
drop policy if exists "conta_eventos: dono le" on {schema}.conta_eventos;
create policy "conta_eventos: dono le" on {schema}.conta_eventos for select to authenticated using ({schema}.sou_dono(conta_id));
drop policy if exists "conta_eventos: master tudo" on {schema}.conta_eventos;
create policy "conta_eventos: master tudo" on {schema}.conta_eventos for all to authenticated
  using ({schema}.eh_master()) with check ({schema}.eh_master());

-- app_config: autenticado lê as chaves públicas; master edita
drop policy if exists "app_config: autenticado le as publicas" on {schema}.app_config;
create policy "app_config: autenticado le as publicas" on {schema}.app_config for select to authenticated using (publica);
drop policy if exists "app_config: master tudo" on {schema}.app_config;
create policy "app_config: master tudo" on {schema}.app_config for all to authenticated
  using ({schema}.eh_master()) with check ({schema}.eh_master());

-- metas concluídas: o aluno lê as dele; a nutricionista responsável (ou a dona sem conta) e o dono da conta leem
drop policy if exists "metas_concluidas: aluno le as proprias" on {schema}.metas_concluidas;
create policy "metas_concluidas: aluno le as proprias" on {schema}.metas_concluidas for select to authenticated
  using (paciente_id = {schema}.meu_paciente_id());
drop policy if exists "metas_concluidas: responsavel le" on {schema}.metas_concluidas;
create policy "metas_concluidas: responsavel le" on {schema}.metas_concluidas for select to authenticated
  using ({schema}.pode_editar_aluno(paciente_id, 'nutricao')
         or exists (select 1 from {schema}.pacientes p where p.id = paciente_id and p.conta_id is not null and {schema}.sou_dono(p.conta_id)));

-- planos do aluno: membros leem; dono edita; master tudo
drop policy if exists "planos_aluno: membros leem" on {schema}.planos_aluno;
create policy "planos_aluno: membros leem" on {schema}.planos_aluno for select to authenticated using ({schema}.sou_membro(conta_id));
drop policy if exists "planos_aluno: dono edita" on {schema}.planos_aluno;
create policy "planos_aluno: dono edita" on {schema}.planos_aluno for all to authenticated
  using ({schema}.sou_dono(conta_id)) with check ({schema}.sou_dono(conta_id));
drop policy if exists "planos_aluno: master tudo" on {schema}.planos_aluno;
create policy "planos_aluno: master tudo" on {schema}.planos_aluno for all to authenticated
  using ({schema}.eh_master()) with check ({schema}.eh_master());

-- chaves Pix: dono e o membro dono da chave editam (o aluno lê só a ativa, por função — W6); master tudo
drop policy if exists "recebimento_chaves: dono e membro da chave" on {schema}.recebimento_chaves;
create policy "recebimento_chaves: dono e membro da chave" on {schema}.recebimento_chaves for all to authenticated
  using ({schema}.sou_dono(conta_id) or {schema}.sou_o_membro(membro_id, conta_id))
  with check ({schema}.sou_dono(conta_id) or {schema}.sou_o_membro(membro_id, conta_id));
drop policy if exists "recebimento_chaves: master tudo" on {schema}.recebimento_chaves;
create policy "recebimento_chaves: master tudo" on {schema}.recebimento_chaves for all to authenticated
  using ({schema}.eh_master()) with check ({schema}.eh_master());

-- assinaturas de aluno: responsável e dono leem; aluno lê a própria; master tudo; service_role grava
drop policy if exists "aluno_assinaturas: responsavel e dono leem" on {schema}.aluno_assinaturas;
create policy "aluno_assinaturas: responsavel e dono leem" on {schema}.aluno_assinaturas for select to authenticated
  using ((conta_id is not null and {schema}.sou_dono(conta_id)) or {schema}.pode_ver_aluno(paciente_id));
drop policy if exists "aluno_assinaturas: aluno le a propria" on {schema}.aluno_assinaturas;
create policy "aluno_assinaturas: aluno le a propria" on {schema}.aluno_assinaturas for select to authenticated
  using (paciente_id = {schema}.meu_paciente_id());
drop policy if exists "aluno_assinaturas: master tudo" on {schema}.aluno_assinaturas;
create policy "aluno_assinaturas: master tudo" on {schema}.aluno_assinaturas for all to authenticated
  using ({schema}.eh_master()) with check ({schema}.eh_master());

-- avisos: cada pessoa lê e marca como lido os seus (UPDATE só da coluna lido_em, pelo GRANT acima)
drop policy if exists "avisos: le os proprios" on {schema}.avisos;
create policy "avisos: le os proprios" on {schema}.avisos for select to authenticated using (destino_user_id = (select auth.uid()));
drop policy if exists "avisos: marca os proprios" on {schema}.avisos;
create policy "avisos: marca os proprios" on {schema}.avisos for update to authenticated
  using (destino_user_id = (select auth.uid())) with check (destino_user_id = (select auth.uid()));

-- ============================================================================================================
-- 6. Políticas PERMISSIVAS novas nas tabelas de hoje (as de hoje ficam — só somam acesso por conta)
-- ============================================================================================================

-- pacientes (matrícula): + quem vê pela conta; + quem edita pela conta (conferido na linha NOVA)
drop policy if exists "pacientes: ver pela conta" on {schema}.pacientes;
create policy "pacientes: ver pela conta" on {schema}.pacientes for select to authenticated using ({schema}.pode_ver_aluno(id));
drop policy if exists "pacientes: editar pela conta" on {schema}.pacientes;
create policy "pacientes: editar pela conta" on {schema}.pacientes for update to authenticated
  using ({schema}.pode_editar_aluno(id))
  with check ({schema}.eh_master() or (conta_id is not null and (
                   {schema}.sou_dono(conta_id)
                or (personal_id = (select auth.uid()) and {schema}.tenho_papel(conta_id, 'personal'))
                or (nutricionista_id = (select auth.uid()) and {schema}.tenho_papel(conta_id, 'nutricionista')))));

-- agenda: + dono da conta (o aluno já lê os seus pela política de hoje)
drop policy if exists "agendamentos: dono da conta" on {schema}.agendamentos;
create policy "agendamentos: dono da conta" on {schema}.agendamentos for all to authenticated
  using (conta_id is not null and {schema}.sou_dono(conta_id))
  with check (conta_id is not null and {schema}.sou_dono(conta_id));

-- prontuário: "Equipe" = quem tem acesso ao aluno; "Só nutricionistas" = nutricionista da conta com acesso ao aluno;
-- o personal (e o dono) escreve só anotação "Equipe"
drop policy if exists "registros_prontuario: ler pela visibilidade" on {schema}.registros_prontuario;
create policy "registros_prontuario: ler pela visibilidade" on {schema}.registros_prontuario for select to authenticated
  using ({schema}.pode_ver_aluno(paciente_id) and (visibilidade = 'equipe' or {schema}.sou_nutri_do_aluno(paciente_id)));
drop policy if exists "registros_prontuario: equipe escreve" on {schema}.registros_prontuario;
create policy "registros_prontuario: equipe escreve" on {schema}.registros_prontuario for insert to authenticated
  with check (nutricionista_id = (select auth.uid()) and visibilidade = 'equipe' and autor_papel in ('dono', 'personal')
              and {schema}.pode_ver_aluno(paciente_id));

-- cobranças do aluno: + dono da conta e quem criou (o aluno já lê as suas pela política de hoje)
drop policy if exists "cobrancas: dono da conta ou quem criou" on {schema}.cobrancas;
create policy "cobrancas: dono da conta ou quem criou" on {schema}.cobrancas for select to authenticated
  using ((conta_id is not null and {schema}.sou_dono(conta_id)) or (criado_por = (select auth.uid()) and not {schema}.eh_paciente()));
drop policy if exists "cobrancas: membro cria" on {schema}.cobrancas;
create policy "cobrancas: membro cria" on {schema}.cobrancas for insert to authenticated
  with check (criado_por = (select auth.uid()) and nutricionista_id = (select auth.uid()) and not {schema}.eh_paciente()
              and conta_id is not null and {schema}.sou_membro(conta_id) and {schema}.pode_ver_aluno(paciente_id));
drop policy if exists "cobrancas: dono da conta ou quem criou edita" on {schema}.cobrancas;
create policy "cobrancas: dono da conta ou quem criou edita" on {schema}.cobrancas for update to authenticated
  using ((conta_id is not null and {schema}.sou_dono(conta_id)) or (criado_por = (select auth.uid()) and not {schema}.eh_paciente()))
  with check ((conta_id is not null and {schema}.sou_dono(conta_id)) or (criado_por = (select auth.uid()) and not {schema}.eh_paciente()));
drop policy if exists "cobrancas: dono da conta ou quem criou apaga" on {schema}.cobrancas;
create policy "cobrancas: dono da conta ou quem criou apaga" on {schema}.cobrancas for delete to authenticated
  using ((conta_id is not null and {schema}.sou_dono(conta_id)) or (criado_por = (select auth.uid()) and not {schema}.eh_paciente()));

-- módulos comuns: + dono da conta (dono do registro e master já valem pelas políticas de hoje)
drop policy if exists "calendarios: dono da conta" on {schema}.calendarios;
create policy "calendarios: dono da conta" on {schema}.calendarios for all to authenticated
  using (conta_id is not null and {schema}.sou_dono(conta_id)) with check (conta_id is not null and {schema}.sou_dono(conta_id));
drop policy if exists "bloqueios_agenda: dono da conta" on {schema}.bloqueios_agenda;
create policy "bloqueios_agenda: dono da conta" on {schema}.bloqueios_agenda for all to authenticated
  using (conta_id is not null and {schema}.sou_dono(conta_id)) with check (conta_id is not null and {schema}.sou_dono(conta_id));
drop policy if exists "formularios_preconsulta: dono da conta" on {schema}.formularios_preconsulta;
create policy "formularios_preconsulta: dono da conta" on {schema}.formularios_preconsulta for all to authenticated
  using (conta_id is not null and {schema}.sou_dono(conta_id)) with check (conta_id is not null and {schema}.sou_dono(conta_id));
drop policy if exists "respostas_preconsulta: dono da conta" on {schema}.respostas_preconsulta;
create policy "respostas_preconsulta: dono da conta" on {schema}.respostas_preconsulta for all to authenticated
  using (conta_id is not null and {schema}.sou_dono(conta_id)) with check (conta_id is not null and {schema}.sou_dono(conta_id));
drop policy if exists "transacoes: dono da conta" on {schema}.transacoes;
create policy "transacoes: dono da conta" on {schema}.transacoes for all to authenticated
  using (conta_id is not null and {schema}.sou_dono(conta_id)) with check (conta_id is not null and {schema}.sou_dono(conta_id));
drop policy if exists "categorias_financeiras: dono da conta" on {schema}.categorias_financeiras;
create policy "categorias_financeiras: dono da conta" on {schema}.categorias_financeiras for all to authenticated
  using (conta_id is not null and {schema}.sou_dono(conta_id)) with check (conta_id is not null and {schema}.sou_dono(conta_id));
drop policy if exists "recibos: dono da conta" on {schema}.recibos;
create policy "recibos: dono da conta" on {schema}.recibos for all to authenticated
  using (conta_id is not null and {schema}.sou_dono(conta_id)) with check (conta_id is not null and {schema}.sou_dono(conta_id));
drop policy if exists "modelos_recibo: dono da conta" on {schema}.modelos_recibo;
create policy "modelos_recibo: dono da conta" on {schema}.modelos_recibo for all to authenticated
  using (conta_id is not null and {schema}.sou_dono(conta_id)) with check (conta_id is not null and {schema}.sou_dono(conta_id));
drop policy if exists "anexos: dono da conta" on {schema}.anexos;
create policy "anexos: dono da conta" on {schema}.anexos for all to authenticated
  using (conta_id is not null and {schema}.sou_dono(conta_id)) with check (conta_id is not null and {schema}.sou_dono(conta_id));
drop policy if exists "whatsapp_instancias: dono da conta" on {schema}.whatsapp_instancias;
create policy "whatsapp_instancias: dono da conta" on {schema}.whatsapp_instancias for all to authenticated
  using (conta_id is not null and {schema}.sou_dono(conta_id)) with check (conta_id is not null and {schema}.sou_dono(conta_id));
drop policy if exists "mensagens_whatsapp: dono da conta" on {schema}.mensagens_whatsapp;
create policy "mensagens_whatsapp: dono da conta" on {schema}.mensagens_whatsapp for all to authenticated
  using (conta_id is not null and {schema}.sou_dono(conta_id)) with check (conta_id is not null and {schema}.sou_dono(conta_id));
drop policy if exists "cadastros_pendentes: dono da conta" on {schema}.cadastros_pendentes;
create policy "cadastros_pendentes: dono da conta" on {schema}.cadastros_pendentes for all to authenticated
  using (conta_id is not null and {schema}.sou_dono(conta_id)) with check (conta_id is not null and {schema}.sou_dono(conta_id));

-- nutrição: leitura como hoje + quem tem acesso ao aluno lê o plano, as refeições, os itens, a adesão (✓ das refeições),
-- as antropometrias e as fotos (o personal responsável — P3). A escrita continua só pelas políticas de hoje.
drop policy if exists "planos_alimentares: ver pela conta" on {schema}.planos_alimentares;
create policy "planos_alimentares: ver pela conta" on {schema}.planos_alimentares for select to authenticated
  using ({schema}.pode_ver_aluno(paciente_id));
drop policy if exists "refeicoes: ver pela conta" on {schema}.refeicoes;
create policy "refeicoes: ver pela conta" on {schema}.refeicoes for select to authenticated
  using ({schema}.pode_ver_plano_alimentar(plano_id));
drop policy if exists "itens_refeicao: ver pela conta" on {schema}.itens_refeicao;
create policy "itens_refeicao: ver pela conta" on {schema}.itens_refeicao for select to authenticated
  using ({schema}.pode_ver_refeicao(refeicao_id));
drop policy if exists "refeicoes_concluidas: ver pela conta" on {schema}.refeicoes_concluidas;
create policy "refeicoes_concluidas: ver pela conta" on {schema}.refeicoes_concluidas for select to authenticated
  using ({schema}.pode_ver_aluno(paciente_id));
drop policy if exists "antropometrias: ver pela conta" on {schema}.antropometrias;
create policy "antropometrias: ver pela conta" on {schema}.antropometrias for select to authenticated
  using ({schema}.pode_ver_aluno(paciente_id));
drop policy if exists "fotos_evolucao: ver pela conta" on {schema}.fotos_evolucao;
create policy "fotos_evolucao: ver pela conta" on {schema}.fotos_evolucao for select to authenticated
  using ({schema}.pode_ver_aluno(paciente_id));

-- @@ compartilhado
-- (roda 1x, depois dos 2 schemas) ------------------------------------------------------------------------------

-- trava: os 2 CHECKs de profiles.role precisam aceitar 'pessoa' antes de trocar o gatilho (senão o cadastro quebra)
do $trava$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass
                    and conname = 'profiles_role_check' and pg_get_constraintdef(oid) like '%pessoa%')
     or not exists (select 1 from pg_constraint where conrelid = 'staging.profiles'::regclass
                    and conname = 'profiles_role_check' and pg_get_constraintdef(oid) like '%pessoa%') then
    raise exception 'W2: aplique o bloco por schema em public E staging antes do compartilhado (CHECK de profiles.role sem pessoa)';
  end if;
end;
$trava$;

-- gatilho NOVO (spec 7.4 / D1): o papel vem do app_metadata quando o servidor define (paciente, master e a
-- nutricionista criada pelo master no site antigo); sem papel → 'pessoa' e SEM teste (teste_ate = agora).
-- O teste passa a ser da CONTA ("Sou profissional", W4). No site antigo do Nutri, quem entra sem conta cai na
-- tela "Assinatura pendente" dele (teste vencido), sem acesso a nada.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_meta text := new.raw_app_meta_data ->> 'role';
  v_role text := case when v_meta in ('paciente', 'master', 'nutricionista') then v_meta else 'pessoa' end;
  v_nome text := coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'nome');
  v_teste timestamptz := case when v_role = 'pessoa' then now() else now() + interval '14 days' end;
begin
  insert into public.profiles (id, nome, email, role, teste_ate) values (new.id, v_nome, new.email, v_role, v_teste)
    on conflict (id) do nothing;
  insert into staging.profiles (id, nome, email, role, teste_ate) values (new.id, v_nome, new.email, v_role, v_teste)
    on conflict (id) do nothing;
  -- como hoje: sem papel definido pelo servidor, grava o papel padrão no JWT (agora 'pessoa', não mais 'nutricionista')
  if v_meta is null then
    update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', v_role)
      where id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- A API admin do GoTrue (auth.admin.createUser) grava o app_metadata DEPOIS do INSERT — o gatilho acima não vê o papel
-- e o perfil nasce 'pessoa'. Quando o servidor define o papel depois (paciente, master, nutricionista), o perfil que
-- ainda é 'pessoa' passa a ter esse papel (medido em 29/09/2026 com as contas de teste da W2).
create or replace function public.sincronizar_papel_do_jwt() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role text := new.raw_app_meta_data ->> 'role';
begin
  if v_role in ('paciente', 'master', 'nutricionista') then
    update public.profiles set role = v_role where id = new.id and role = 'pessoa';
    update staging.profiles set role = v_role where id = new.id and role = 'pessoa';
  end if;
  return new;
end;
$$;
drop trigger if exists on_auth_user_papel_mudou on auth.users;
create trigger on_auth_user_papel_mudou after update of raw_app_meta_data on auth.users
  for each row when ((new.raw_app_meta_data ->> 'role') is distinct from (old.raw_app_meta_data ->> 'role'))
  execute function public.sincronizar_papel_do_jwt();

-- Storage: comprovantes de Pix dos alunos (cópia dos arquivos do Calc na W6, mesmos caminhos). Privados; leitura pelo
-- dono da conta, por quem criou a cobrança e pelo aluno dono; o envio é pela função do servidor (W6).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comprovantes', 'comprovantes', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comprovantes-staging', 'comprovantes-staging', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do nothing;
drop policy if exists "comprovantes: ler dono da conta, quem criou ou o aluno" on storage.objects;
create policy "comprovantes: ler dono da conta, quem criou ou o aluno" on storage.objects for select to authenticated
  using ((bucket_id = 'comprovantes' and public.pode_ler_comprovante(name))
      or (bucket_id = 'comprovantes-staging' and staging.pode_ler_comprovante(name)));
