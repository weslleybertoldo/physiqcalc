-- Physiq play-W6 (16/10/2026) — a assinatura do aluno SEM profissional pela Google Play (Play Billing) no banco. Banco principal,
-- staging + public. Idempotente e ADITIVA: nenhuma linha existente muda; sem linha da Play, a cobertura, a trava, a faixa, os módulos e
-- as leituras do aluno saem IGUAIS às de hoje (a prova: a cobertura de todas as matrículas antes × depois).
--
-- O que muda:
--   cobrancas                 a forma 'google_play' (o histórico do Pagamentos e do Financeiro do master: 1 linha 'paga' por pedido do
--                             Google — a compra e cada renovação; a devolução vira 'cancelada' + reembolsado_em) e a coluna play_pedido
--                             (o id do pedido; único: o mesmo pedido nunca vira 2 linhas). A guarda cobrancas_guard_play (o molde da
--                             W1b): o app (authenticated que não é master) não cria nem mexe em linha da Play.
--   play_assinaturas          NOVA: a assinatura da Play de cada matrícula do app (o token é a chave; 1 VIVA por matrícula). Só o
--                             servidor lê e grava: RLS ligado SEM policy e sem grant para o app e o visitante. O token e o pedido nunca
--                             saem do servidor (as leituras do aluno levam só estado, renova, expira_em e produto).
--   mensalidade_recalcular    o corpo de hoje (20261011010000_wp_planos_modalidades.sql:121-196) SEM as linhas google_play no laço +
--                             o período da Play no fim: greatest(…, expira_em) das 'ativa' | 'cancelada' | 'carencia' — o Google manda
--                             no período da Play (renovação, carência, troca com rateio, devolução, defer). A MESMA coluna
--                             (pacientes.mensalidade_pago_ate): a trava, a faixa, os módulos e a situação seguem iguais.
--   trg_play_assinaturas_recalcular   NOVO: a assinatura da Play que muda (estado, expira_em) recalcula a cobertura.
--   play_aplicar(jsonb)       NOVA (SECURITY DEFINER, search_path '', só o service_role): o que o Google disse, numa transação — a
--                             assinatura (pelo token), a anterior 'substituida' (o linkedPurchaseToken), o plano da matrícula pelo
--                             produto vigente (app_trocar_plano), a cobrança do pedido (nada se já existe; nenhuma na compra de TESTE
--                             do Google) e a devolução. Guarda a cobertura de antes da 1ª compra (adiar_ate: o teste ou o mês pago pelo
--                             MP) para a função adiar (defer) a assinatura pelo que falta.
--   financeiro_do_aluno()     o corpo de hoje (20261011200000_w1_infinitepay.sql:320-365) + 'play' (chave nova; o APK antigo ignora).
--   meu_plano_app()           o corpo de hoje (20260929190000_w07b_sem_profissional.sql:252-273) + 'play' na matrícula.
--   app_config.play_billing   a trava de liberação ({"liberada": false} no public, true no staging; publica = false — só a função
--                             play-compras lê; o molde do mercadopago_conta). Ligar = SQL, com o OK do dono, depois da compra de teste.
--
-- Quem chama (conferido em 16/10/2026): play_aplicar só as funções play-compras e play-rtdn (service role); as 3 trocadas mantêm
-- assinatura, atributos e grants (create or replace). Nenhuma policy, view ou job muda.
-- A conferência do fim (desfaz tudo se algo sair diferente): a tabela com RLS, sem policy e sem acesso do app/visitante; a play_aplicar
-- definer, search_path '' e só do servidor; o gatilho; a trava com o valor do schema.
-- Aplicar (backup ANTES em produção — scripts/backup/backup_principal.py):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261016010000_playw6_play_billing.sql --so staging --dry-run
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261016010000_playw6_play_billing.sql --so staging
--   (e o mesmo com --so public, antes de publicar as funções)
-- Testes: python3 e2e/playw6/sql_playw6.py (os casos com blocos desfeitos; --foto/--comparar: a cobertura antes × depois).
-- Reversa: supabase-principal/reversas/20261016010000_playw6_play_billing_reversa.sql (os 3 corpos de hoje; a tabela e as linhas da
-- Play FICAM).

select set_config('lock_timeout', '5s', true);

-- ============================================================================================================
-- 1. As colunas que a migration lê existem (sem uma delas, a migration para aqui e nada entra)
-- ============================================================================================================
do $p$
declare
  v_falta text;
begin
  select string_agg(c.t || '.' || c.nome, ', ') into v_falta
    from (values ('cobrancas', 'forma'), ('cobrancas', 'status'), ('cobrancas', 'reembolsado_em'), ('cobrancas', 'paciente_id'),
                 ('cobrancas', 'conta_id'), ('cobrancas', 'tipo'), ('cobrancas', 'criado_por'), ('cobrancas', 'nutricionista_id'),
                 ('cobrancas', 'origem'), ('cobrancas', 'valor'), ('cobrancas', 'pago_em'), ('cobrancas', 'deleted_at'),
                 ('cobrancas', 'mes_ref'), ('cobrancas', 'plano_aluno_id'), ('cobrancas', 'meses_cobertos'),
                 ('pacientes', 'mensalidade_pago_ate'), ('pacientes', 'app_teste_ate'), ('pacientes', 'conta_id'),
                 ('pacientes', 'plano_aluno_id'), ('pacientes', 'ativo'), ('pacientes', 'deleted_at')) as c(t, nome)
   where not exists (select 1 from pg_attribute a where a.attrelid = ('{schema}.' || c.t)::regclass and a.attname = c.nome
                        and a.attnum > 0 and not a.attisdropped);
  if v_falta is not null then
    raise exception 'playw6: {schema} sem a(s) coluna(s) %', v_falta;
  end if;
end $p$;

-- ============================================================================================================
-- 2. cobrancas: a forma google_play e o pedido do Google (1 linha por pedido)
-- ============================================================================================================
alter table {schema}.cobrancas drop constraint if exists cobrancas_forma_check;
alter table {schema}.cobrancas add constraint cobrancas_forma_check
  check (forma is null or forma = any (array['pix_manual'::text, 'mp'::text, 'manual'::text, 'infinitepay'::text, 'google_play'::text]));
alter table {schema}.cobrancas add column if not exists play_pedido text;
alter table {schema}.cobrancas drop constraint if exists cobrancas_play_pedido_check;
alter table {schema}.cobrancas add constraint cobrancas_play_pedido_check
  check (play_pedido is null or (forma = 'google_play' and char_length(play_pedido) between 1 and 200));
create unique index if not exists cobrancas_play_pedido_uq on {schema}.cobrancas (play_pedido) where play_pedido is not null;

-- a guarda (security invoker, o molde da cobrancas_guard_mp da W1b): o app (authenticated que não é master) não cria linha da Play nem
-- mexe numa; o servidor (service_role) e as funções definer (postgres) gravam como sempre. Os gatilhos BEFORE rodam em ordem alfabética:
-- guard_infinitepay → guard_mp → guard_mp_conta → guard_periodo → guard_play → updated_at (nenhum desfaz o outro).
create or replace function {schema}.cobrancas_guard_play() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and not {schema}.eh_master() then
    if tg_op = 'INSERT' then
      if new.forma = 'google_play' then new.forma := null; end if;
      new.play_pedido := null;
    else
      if new.forma is distinct from old.forma and (new.forma = 'google_play' or old.forma = 'google_play') then
        new.forma := old.forma;
      end if;
      if old.forma = 'google_play' then
        -- a situação, o valor e de quem é a linha da Play vêm do Google (pela função), não do app
        new.status := old.status; new.reembolsado_em := old.reembolsado_em; new.valor := old.valor; new.pago_em := old.pago_em;
        new.paciente_id := old.paciente_id; new.conta_id := old.conta_id; new.tipo := old.tipo; new.deleted_at := old.deleted_at;
        new.criado_por := old.criado_por; new.nutricionista_id := old.nutricionista_id; new.origem := old.origem;
      end if;
      new.play_pedido := old.play_pedido;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function {schema}.cobrancas_guard_play() from public, anon, authenticated;
drop trigger if exists trg_cobrancas_guard_play on {schema}.cobrancas;
create trigger trg_cobrancas_guard_play before insert or update on {schema}.cobrancas
  for each row execute function {schema}.cobrancas_guard_play();

-- ============================================================================================================
-- 3. play_assinaturas: a assinatura da Play de cada matrícula do app (só o servidor)
-- ============================================================================================================
create table if not exists {schema}.play_assinaturas (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references {schema}.pacientes(id) on delete cascade,
  conta_id uuid references {schema}.contas(id) on delete set null,
  produto text not null,
  plano_base text,
  token text not null,
  token_anterior text,
  estado text not null,
  expira_em timestamptz,
  renova boolean not null default false,
  reconhecida_em timestamptz,
  teste boolean not null default false,
  ultimo_pedido text,
  cancelada_por text,
  adiar_ate timestamptz,
  adiada_em timestamptz,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),
  constraint play_assinaturas_token_key unique (token),
  constraint play_assinaturas_estado_check check (estado in ('pendente', 'ativa', 'cancelada', 'carencia', 'suspensa', 'pausada',
                                                             'expirada', 'revogada', 'substituida')),
  constraint play_assinaturas_cancelada_por_check check (cancelada_por is null or cancelada_por in ('vinculo', 'exclusao', 'google')),
  constraint play_assinaturas_textos_check check (char_length(produto) between 1 and 100 and char_length(token) between 1 and 4096
                                                   and (token_anterior is null or char_length(token_anterior) between 1 and 4096)
                                                   and (plano_base is null or char_length(plano_base) between 1 and 100)
                                                   and (ultimo_pedido is null or char_length(ultimo_pedido) between 1 and 200))
);
-- 1 VIVA por matrícula (a que dá ou pode voltar a dar acesso): uma 2ª compra sem ligação com a 1ª não entra (cobrar 2 vezes)
create unique index if not exists play_assinaturas_viva_uq on {schema}.play_assinaturas (paciente_id)
  where estado in ('pendente', 'ativa', 'cancelada', 'carencia', 'suspensa', 'pausada');
create index if not exists play_assinaturas_paciente_idx on {schema}.play_assinaturas (paciente_id);
comment on table {schema}.play_assinaturas is
  'play-W6: a assinatura da Google Play de cada matrícula do app (o Google é a fonte da verdade; a play_aplicar grava o que ele diz). '
  'Só o servidor: RLS sem policy e sem grant para o app e o visitante — o token e o pedido não saem do servidor.';
alter table {schema}.play_assinaturas enable row level security;
revoke all on table {schema}.play_assinaturas from public, anon, authenticated;
grant select, insert, update, delete on table {schema}.play_assinaturas to service_role;

-- ============================================================================================================
-- 4. A cobertura (o corpo de hoje, 20261011010000_wp_planos_modalidades.sql:121-196, com as 3 mudanças da play-W6 marcadas)
-- ============================================================================================================
create or replace function {schema}.mensalidade_recalcular(p_paciente uuid) returns timestamptz
language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare
  v_ancora integer;
  v_cob timestamptz := null;
  v_base timestamptz;
  v_fim timestamptz;
  v_prox timestamptz;
  v_teste_de timestamptz;
  v_teste_ate timestamptz;
  v_teste_aplicado boolean;
  v_meses integer;
  v_seq integer := 0;
  v_seq_plano uuid := null;
  v_seq_total integer := null;
  v_num integer;
  v_play timestamptz;
  r record;
begin
  if p_paciente is null then
    return null;
  end if;
  select p.app_teste_de, p.app_teste_ate into v_teste_de, v_teste_ate from {schema}.pacientes p where p.id = p_paciente;
  v_teste_aplicado := v_teste_ate is null;
  select extract(day from a.proximo_vencimento)::integer into v_ancora
    from {schema}.aluno_assinaturas a
   where a.paciente_id = p_paciente and a.status = 'authorized' and a.proximo_vencimento is not null
   order by a.criado_em desc limit 1;
  for r in
    select c.id, c.pago_em, c.meses_cobertos, c.parcelas_total, c.plano_aluno_id from {schema}.cobrancas c
     where c.paciente_id = p_paciente and c.tipo = 'mensalidade' and c.status = 'paga'
       and c.deleted_at is null and c.pago_em is not null
       and c.forma is distinct from 'google_play'   -- play-W6: a Play não empurra por pedido (o período dela entra no fim)
     order by c.pago_em, c.created_at, c.id
  loop
    if not v_teste_aplicado and coalesce(v_teste_de, v_teste_ate) <= r.pago_em then
      v_cob := greatest(coalesce(v_cob, v_teste_ate), v_teste_ate);
      v_teste_aplicado := true;
    end if;
    v_meses := greatest(coalesce(r.meses_cobertos, 1), 1);
    v_base := greatest(r.pago_em, coalesce(v_cob, r.pago_em));
    v_fim := v_base + make_interval(months => v_meses);         -- o Postgres trava no fim do mês (31/01 + 1 mês = 28/02)
    if v_ancora is not null and v_meses = 1 then
      v_prox := {schema}.financeiro_proxima_ancora(v_base, v_ancora);
      if v_prox < v_fim then v_fim := v_prox; end if;
    end if;
    if r.parcelas_total is not null then
      if v_seq_plano is not distinct from r.plano_aluno_id and v_seq_total = r.parcelas_total then
        v_seq := v_seq + 1;
      else
        v_seq := 1;
        v_seq_plano := r.plano_aluno_id;
        v_seq_total := r.parcelas_total;
      end if;
      v_num := ((v_seq - 1) % r.parcelas_total) + 1;
    else
      v_seq := 0;
      v_seq_plano := null;
      v_seq_total := null;
      v_num := null;
    end if;
    update {schema}.cobrancas set cobre_de = v_base, cobre_ate = v_fim, parcela_num = v_num
     where id = r.id and (cobre_de is distinct from v_base or cobre_ate is distinct from v_fim or parcela_num is distinct from v_num);
    v_cob := v_fim;
  end loop;
  if not v_teste_aplicado then
    v_cob := greatest(coalesce(v_cob, v_teste_ate), v_teste_ate);
  end if;
  -- play-W6: o período da Google Play — o Google manda nele (renovação, carência, troca com rateio, devolução, defer); vale a
  -- assinatura que dá acesso (ativa, cancelada até o fim, carência). Sem linha da Play, nada muda.
  select max(a.expira_em) into v_play from {schema}.play_assinaturas a
   where a.paciente_id = p_paciente and a.estado in ('ativa', 'cancelada', 'carencia') and a.expira_em is not null;
  if v_play is not null then
    v_cob := greatest(coalesce(v_cob, v_play), v_play);
  end if;
  -- o que deixou de ser pago (recusa, estorno, removido) sai da cobertura e da contagem das parcelas
  update {schema}.cobrancas set cobre_de = null, cobre_ate = null, parcela_num = null
   where paciente_id = p_paciente and tipo = 'mensalidade' and (status <> 'paga' or deleted_at is not null)
     and (cobre_de is not null or cobre_ate is not null or parcela_num is not null);
  update {schema}.pacientes set mensalidade_pago_ate = v_cob where id = p_paciente and mensalidade_pago_ate is distinct from v_cob;
  return v_cob;
end;
$$;
revoke execute on function {schema}.mensalidade_recalcular(uuid) from public, anon, authenticated;
grant execute on function {schema}.mensalidade_recalcular(uuid) to service_role;

-- a assinatura da Play que muda (estado, expira_em) recalcula a cobertura da matrícula (o molde do trg_cobrancas_mensalidade)
create or replace function {schema}.play_assinaturas_recalcular() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform {schema}.mensalidade_recalcular(old.paciente_id);
  end if;
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.paciente_id is distinct from old.paciente_id) then
    perform {schema}.mensalidade_recalcular(new.paciente_id);
  end if;
  return null;
end;
$$;
revoke all on function {schema}.play_assinaturas_recalcular() from public, anon, authenticated;
drop trigger if exists trg_play_assinaturas_recalcular on {schema}.play_assinaturas;
create trigger trg_play_assinaturas_recalcular after insert or delete or update of estado, expira_em, paciente_id
  on {schema}.play_assinaturas for each row execute function {schema}.play_assinaturas_recalcular();

-- ============================================================================================================
-- 5. play_aplicar: o que o Google disse, numa transação (só o servidor: play-compras e play-rtdn)
-- ============================================================================================================
-- Entrada (jsonb; a função lê do GET purchases.subscriptionsv2, a fonte da verdade):
--   paciente_id (a matrícula do app dona da compra) · token · token_anterior (o linkedPurchaseToken) · produto (o vigente) · plano_base
--   · estado (o nosso: pendente|ativa|cancelada|carencia|suspensa|pausada|expirada|revogada|substituida) · expira_em · renova
--   · reconhecida (true = o Google diz reconhecida) · teste (a compra de TESTE do Google: sem cobrança) · pedido (o último pedido PAGO)
--   · valor (o recurringPrice; sem ele, o do plano) · pago_em · cancelada_por (vinculo|exclusao|google) · adiada (true = o defer feito)
--   · devolvido_pedido (o pedido devolvido: a cobrança vira 'cancelada').
-- Saída: {ok, nova, estado, expira_em, reconhecida_em, adiar_ate, adiada_em, cobertura_antes, pago_ate, cobranca, devolvidas, plano,
--   matricula_ativa} ou {ok: false, erro: invalido|sem_matricula|nao_e_do_app|produto_invalido|token_de_outra_matricula|outra_viva}.
create or replace function {schema}.play_aplicar(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  c_estados constant text[] := array['pendente', 'ativa', 'cancelada', 'carencia', 'suspensa', 'pausada', 'expirada', 'revogada',
                                      'substituida'];
  c_vivas constant text[] := array['pendente', 'ativa', 'cancelada', 'carencia', 'suspensa', 'pausada'];
  v_conta uuid := {schema}.conta_do_app();
  v_token text := nullif(btrim(coalesce(p ->> 'token', '')), '');
  v_ant text := nullif(btrim(coalesce(p ->> 'token_anterior', '')), '');
  v_produto text := nullif(btrim(coalesce(p ->> 'produto', '')), '');
  v_plano_base text := nullif(btrim(coalesce(p ->> 'plano_base', '')), '');
  v_estado text := nullif(btrim(coalesce(p ->> 'estado', '')), '');
  v_pedido text := nullif(btrim(coalesce(p ->> 'pedido', '')), '');
  v_devolvido text := nullif(btrim(coalesce(p ->> 'devolvido_pedido', '')), '');
  v_por text := nullif(btrim(coalesce(p ->> 'cancelada_por', '')), '');
  v_pac_id uuid;
  v_expira timestamptz;
  v_pago_em timestamptz;
  v_valor numeric;
  v_renova boolean;
  v_reconhecida boolean;
  v_teste boolean;
  v_adiada boolean;
  v_pac {schema}.pacientes%rowtype;
  v_plano {schema}.planos_aluno%rowtype;
  v_atual {schema}.play_assinaturas%rowtype;
  v_nova boolean;
  v_antes timestamptz;
  v_adiar timestamptz := null;
  v_dono uuid;
  v_cobranca text := null;
  v_devolvidas integer := 0;
  v_troca jsonb := null;
  v_depois timestamptz;
  v_n integer;
begin
  if p is null or jsonb_typeof(p) <> 'object' or v_token is null or v_produto is null or v_estado is null
     or not (v_estado = any (c_estados)) or char_length(v_token) > 4096 or (v_ant is not null and char_length(v_ant) > 4096)
     or char_length(v_produto) > 100 or (v_plano_base is not null and char_length(v_plano_base) > 100)
     or (v_pedido is not null and char_length(v_pedido) > 200) or (v_devolvido is not null and char_length(v_devolvido) > 200)
     or (v_por is not null and v_por not in ('vinculo', 'exclusao', 'google')) then
    return jsonb_build_object('ok', false, 'erro', 'invalido');
  end if;
  begin
    v_pac_id := (p ->> 'paciente_id')::uuid;
    v_expira := nullif(p ->> 'expira_em', '')::timestamptz;
    v_pago_em := coalesce(nullif(p ->> 'pago_em', '')::timestamptz, now());
    v_valor := nullif(p ->> 'valor', '')::numeric;
    v_renova := coalesce((p ->> 'renova')::boolean, false);
    v_reconhecida := coalesce((p ->> 'reconhecida')::boolean, false);
    v_teste := coalesce((p ->> 'teste')::boolean, false);
    v_adiada := coalesce((p ->> 'adiada')::boolean, false);
  exception when others then
    return jsonb_build_object('ok', false, 'erro', 'invalido');
  end;
  if v_pac_id is null then
    return jsonb_build_object('ok', false, 'erro', 'invalido');
  end if;

  -- a matrícula (trava a linha: o registrar e o aviso do Google da mesma matrícula entram um de cada vez)
  select * into v_pac from {schema}.pacientes where id = v_pac_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'sem_matricula');
  end if;
  if v_conta is null or v_pac.conta_id is distinct from v_conta then
    return jsonb_build_object('ok', false, 'erro', 'nao_e_do_app');
  end if;
  select * into v_plano from {schema}.planos_aluno where conta_id = v_conta and codigo = v_produto;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'produto_invalido');
  end if;
  select * into v_atual from {schema}.play_assinaturas where token = v_token for update;
  v_nova := not found;
  if not v_nova and v_atual.paciente_id <> v_pac.id then
    return jsonb_build_object('ok', false, 'erro', 'token_de_outra_matricula');
  end if;
  v_antes := v_pac.mensalidade_pago_ate;

  -- 1 viva por matrícula: outra compra viva, sem ligação com esta (nem a anterior que esta substitui, nem uma cancelada que já venceu)
  if v_estado = any (c_vivas) and (v_nova or v_atual.estado <> 'substituida') and exists (
       select 1 from {schema}.play_assinaturas a
        where a.paciente_id = v_pac.id and a.token <> v_token and a.token is distinct from v_ant and a.estado = any (c_vivas)
          and not (a.estado = 'cancelada' and a.expira_em is not null and a.expira_em < now())) then
    return jsonb_build_object('ok', false, 'erro', 'outra_viva');
  end if;

  -- a anterior (troca de plano ou reassinatura antes de vencer: o linkedPurchaseToken) não vale mais
  if v_ant is not null and v_ant <> v_token then
    update {schema}.play_assinaturas set estado = 'substituida', renova = false, atualizada_em = now()
     where token = v_ant and paciente_id = v_pac.id and estado <> 'substituida';
  end if;
  -- a cancelada que já venceu (o aviso EXPIRED que se perdeu) não segura a vaga
  update {schema}.play_assinaturas set estado = 'expirada', atualizada_em = now()
   where paciente_id = v_pac.id and token <> v_token and estado = 'cancelada' and expira_em is not null and expira_em < now();

  if v_nova then
    -- a 1ª compra (sem ligação) com a matrícula ainda coberta por mais de 1 dia (o teste grátis ou o mês pago pelo MP): a função adia
    -- (defer) a assinatura pelo que falta — o aluno não perde os dias que já tinha
    if v_ant is null and v_antes is not null and v_antes > now() + interval '1 day' then
      v_adiar := v_antes;
    end if;
    insert into {schema}.play_assinaturas (paciente_id, conta_id, produto, plano_base, token, token_anterior, estado, expira_em, renova,
                                           reconhecida_em, teste, ultimo_pedido, cancelada_por, adiar_ate, adiada_em)
    values (v_pac.id, v_conta, v_produto, v_plano_base, v_token, v_ant, v_estado, v_expira, v_renova,
            case when v_reconhecida then now() end, v_teste, v_pedido,
            coalesce(v_por, case when v_estado in ('cancelada', 'expirada', 'revogada') then 'google' end),
            v_adiar, case when v_adiada then now() end);
  else
    update {schema}.play_assinaturas a set
      produto = v_produto,
      plano_base = coalesce(v_plano_base, a.plano_base),
      token_anterior = coalesce(a.token_anterior, v_ant),
      estado = case when a.estado = 'substituida' then 'substituida' else v_estado end,   -- a substituída não volta
      expira_em = v_expira,
      renova = v_renova,
      reconhecida_em = coalesce(a.reconhecida_em, case when v_reconhecida then now() end),
      teste = a.teste or v_teste,
      ultimo_pedido = coalesce(v_pedido, a.ultimo_pedido),
      cancelada_por = case when a.estado <> 'substituida' and v_estado in ('pendente', 'ativa', 'carencia') then null
                           else coalesce(v_por, a.cancelada_por,
                                         case when v_estado in ('cancelada', 'expirada', 'revogada') then 'google' end) end,
      adiada_em = coalesce(a.adiada_em, case when v_adiada then now() end),
      atualizada_em = now()
     where a.id = v_atual.id;
  end if;
  select * into v_atual from {schema}.play_assinaturas where token = v_token;

  -- o plano da matrícula = o produto vigente da assinatura que dá acesso (a troca na hora já vem com o produto novo; a da renovação,
  -- só quando renova)
  if v_pac.ativo and v_pac.deleted_at is null and v_atual.estado in ('ativa', 'carencia', 'cancelada') then
    v_troca := {schema}.app_trocar_plano(v_pac.id, v_produto, null);
  end if;

  -- a cobrança do pedido PAGO (a compra e cada renovação): 1 linha por pedido; nenhuma na compra de TESTE do Google. O valor é o
  -- recurringPrice do GET: na troca NA HORA (CHARGE_PRORATED_PRICE) o Google cobra só o rateio do período que falta, então a
  -- linha da troca é uma ESTIMATIVA (o preço cheio do produto novo) — o valor exato só pela Orders API (a revisão, ⚪9)
  if v_pedido is not null and not v_atual.teste and v_atual.estado in ('ativa', 'cancelada', 'carencia') then
    select c.dono_id into v_dono from {schema}.contas c where c.id = v_conta;
    v_valor := case when v_valor is not null and v_valor > 0 then round(v_valor, 2) else v_plano.valor end;
    if v_dono is null or v_valor is null or v_valor <= 0 then
      v_cobranca := 'sem_recebedor';
    else
      insert into {schema}.cobrancas (nutricionista_id, paciente_id, conta_id, criado_por, tipo, descricao, valor, vencimento, mes_ref,
                                      status, pago_em, forma, plano_aluno_id, meses_cobertos, origem, play_pedido)
      values (v_dono, v_pac.id, v_conta, null, 'mensalidade', 'Mensalidade · ' || v_plano.nome || ' · Google Play', v_valor,
              (v_pago_em at time zone 'America/Sao_Paulo')::date,
              date_trunc('month', v_pago_em at time zone 'America/Sao_Paulo')::date,
              'paga', v_pago_em, 'google_play', v_plano.id, 1, 'google_play', v_pedido)
      on conflict (play_pedido) where play_pedido is not null do nothing;
      get diagnostics v_n = row_count;
      v_cobranca := case when v_n > 0 then 'nova' else 'ja_tinha' end;
    end if;
  end if;

  -- a devolução (o voidedPurchaseNotification): a cobrança do pedido vira 'cancelada' + reembolsado_em
  if v_devolvido is not null then
    update {schema}.cobrancas set status = 'cancelada', reembolsado_em = coalesce(reembolsado_em, now())
     where play_pedido = v_devolvido and forma = 'google_play' and paciente_id = v_pac.id and status = 'paga';
    get diagnostics v_devolvidas = row_count;
  end if;

  select p2.mensalidade_pago_ate into v_depois from {schema}.pacientes p2 where p2.id = v_pac.id;
  return jsonb_build_object('ok', true, 'nova', v_nova, 'estado', v_atual.estado, 'expira_em', v_atual.expira_em,
                            'reconhecida_em', v_atual.reconhecida_em, 'adiar_ate', v_atual.adiar_ate, 'adiada_em', v_atual.adiada_em,
                            'cobertura_antes', v_antes, 'pago_ate', v_depois, 'cobranca', v_cobranca, 'devolvidas', v_devolvidas,
                            'plano', v_troca, 'matricula_ativa', coalesce(v_pac.ativo, false) and v_pac.deleted_at is null);
end;
$$;
revoke all on function {schema}.play_aplicar(jsonb) from public, anon, authenticated;
grant execute on function {schema}.play_aplicar(jsonb) to service_role;

-- ============================================================================================================
-- 6. As leituras do aluno: + play (chave nova; o APK antigo ignora)
-- ============================================================================================================
create or replace function {schema}.financeiro_do_aluno() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x.j order by x.criado), '[]'::jsonb) from (
    select p.created_at as criado, jsonb_build_object(
      'paciente_id', p.id,
      'conta_id', p.conta_id,
      'conta_nome', c.nome,
      'recebimento_modo', coalesce(c.recebimento_modo, 'pix_manual'),
      'bloquear_inadimplente', coalesce(c.bloquear_app_inadimplente, false),
      'tem_chave', exists (select 1 from {schema}.recebimento_chaves k where k.conta_id = p.conta_id and k.ativa),
      'profissional', case when c.origem = 'app' then 'Physiq' else
                        (select coalesce(nullif(btrim(pr.nome), ''), pr.email) from {schema}.profiles pr
                          where pr.id = coalesce(c.dono_id, p.personal_id, p.nutricionista_id)) end,
      'mensalidade_valor', p.mensalidade_valor,
      'plano_nome', (select pa.nome from {schema}.planos_aluno pa where pa.id = p.plano_aluno_id),
      'pausada', p.cobranca_pausada,
      'pago_ate', p.mensalidade_pago_ate,
      'desde', p.mensalidade_desde,
      'aguardando', exists (select 1 from {schema}.cobrancas a where a.paciente_id = p.id and a.deleted_at is null
                              and a.status = 'aguardando_confirmacao' and a.tipo = 'mensalidade'
                              and (a.forma is distinct from 'infinitepay' or a.ip_expira_em > now())),
      'assinatura_ativa', exists (select 1 from {schema}.aluno_assinaturas s where s.paciente_id = p.id and s.status = 'authorized'),
      'abertas', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'descricao', a.descricao, 'valor', a.valor,
                          'vencimento', a.vencimento) order by a.vencimento), '[]'::jsonb)
                    from {schema}.cobrancas a where a.paciente_id = p.id and a.deleted_at is null
                     and (a.status = 'aberta'
                          or (a.status = 'aguardando_confirmacao' and a.tipo = 'avulsa' and a.forma = 'infinitepay'
                              and coalesce(a.ip_expira_em, now()) <= now()))),
      'aguardando_avulsas', (select count(*) from {schema}.cobrancas a where a.paciente_id = p.id and a.deleted_at is null
                               and a.status = 'aguardando_confirmacao' and a.tipo = 'avulsa'
                               and (a.forma is distinct from 'infinitepay' or a.ip_expira_em > now())),
      -- W7b
      'app', coalesce(c.origem = 'app', false),
      'teste_ate', case when c.origem = 'app' then p.app_teste_ate end,
      'plano_codigo', (select pa.codigo from {schema}.planos_aluno pa where pa.id = p.plano_aluno_id),
      -- W-P
      'modalidade', p.plano_modalidade,
      'plano_meses', (select pa.meses from {schema}.planos_aluno pa where pa.id = p.plano_aluno_id),
      -- play-W6: a assinatura viva da Google Play da matrícula do app (o token e o pedido NÃO saem do servidor)
      'play', case when c.origem = 'app' then
                (select jsonb_build_object('estado', a.estado, 'renova', a.renova, 'expira_em', a.expira_em, 'produto', a.produto)
                   from {schema}.play_assinaturas a
                  where a.paciente_id = p.id and a.estado in ('pendente', 'ativa', 'cancelada', 'carencia', 'suspensa', 'pausada')
                    -- a cancelada que já venceu (o RTDN EXPIRED atrasou ou se perdeu) não é viva: a regra da play_aplicar
                    and not (a.estado = 'cancelada' and a.expira_em is not null and a.expira_em < now())
                  order by a.atualizada_em desc limit 1) end
    ) as j
    from {schema}.pacientes p
    left join {schema}.contas c on c.id = p.conta_id
    where p.user_id = auth.uid() and p.deleted_at is null and p.ativo
  ) x;
$$;
revoke execute on function {schema}.financeiro_do_aluno() from public, anon;
grant execute on function {schema}.financeiro_do_aluno() to authenticated, service_role;

create or replace function {schema}.meu_plano_app() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'teste_dias', {schema}.app_teste_dias(),
    'planos', (select coalesce(jsonb_agg(jsonb_build_object('codigo', pa.codigo, 'nome', pa.nome, 'valor', pa.valor,
                                'modulos', to_jsonb(pa.modulos), 'descricao', pa.descricao) order by pa.ordem, pa.nome), '[]'::jsonb)
                 from {schema}.planos_aluno pa where pa.conta_id = {schema}.conta_do_app() and pa.ativo and pa.codigo is not null),
    'matricula', (select jsonb_build_object(
                     'paciente_id', p.id, 'ativo', p.ativo, 'plano', pa.codigo, 'plano_nome', pa.nome, 'valor', p.mensalidade_valor,
                     'modulos', to_jsonb(coalesce(pa.modulos, array['treino']::text[])), 'objetivo', p.objetivo_app,
                     'teste_de', p.app_teste_de, 'teste_ate', p.app_teste_ate, 'pago_ate', p.mensalidade_pago_ate,
                     'pausada', p.cobranca_pausada, 'encerrada_em', p.app_encerrada_em, 'encerrada_motivo', p.app_encerrada_motivo,
                     'aguardando', exists (select 1 from {schema}.cobrancas c where c.paciente_id = p.id and c.deleted_at is null
                                             and c.status = 'aguardando_confirmacao' and c.tipo = 'mensalidade'),
                     'assinatura', (select jsonb_build_object('status', s.status, 'valor', s.valor, 'proximo_vencimento', s.proximo_vencimento)
                                      from {schema}.aluno_assinaturas s where s.paciente_id = p.id order by s.criado_em desc limit 1),
                     -- play-W6: a assinatura viva da Google Play (o token e o pedido NÃO saem do servidor)
                     'play', (select jsonb_build_object('estado', a.estado, 'renova', a.renova, 'expira_em', a.expira_em,
                                                        'produto', a.produto)
                                from {schema}.play_assinaturas a
                               where a.paciente_id = p.id and a.estado in ('pendente', 'ativa', 'cancelada', 'carencia', 'suspensa', 'pausada')
                    -- a cancelada que já venceu (o RTDN EXPIRED atrasou ou se perdeu) não é viva: a regra da play_aplicar
                    and not (a.estado = 'cancelada' and a.expira_em is not null and a.expira_em < now())
                               order by a.atualizada_em desc limit 1))
                    from {schema}.pacientes p left join {schema}.planos_aluno pa on pa.id = p.plano_aluno_id
                   where p.user_id = auth.uid() and p.conta_id = {schema}.conta_do_app() and p.deleted_at is null
                   order by p.ativo desc, p.created_at desc limit 1),
    'com_profissional', exists (select 1 from {schema}.pacientes p where p.user_id = auth.uid() and p.deleted_at is null and p.ativo
                                   and p.conta_id is distinct from {schema}.conta_do_app()));
$$;

-- ============================================================================================================
-- 7. A trava de liberação (só a função play-compras lê; o molde do mercadopago_conta da W2)
-- ============================================================================================================
insert into {schema}.app_config (chave, valor, publica)
values ('play_billing', jsonb_build_object('liberada', '{schema}' = 'staging'), false)
on conflict (chave) do nothing;

-- ============================================================================================================
-- 8. A conferência do fim (qualquer diferença desfaz a migration inteira)
-- ============================================================================================================
do $c$
declare
  v_t oid := '{schema}.play_assinaturas'::regclass;
  v_f oid := '{schema}.play_aplicar(jsonb)'::regprocedure;
  v_cfg jsonb;
begin
  if not (select c.relrowsecurity from pg_class c where c.oid = v_t) then
    raise exception 'playw6: {schema}.play_assinaturas sem RLS';
  end if;
  if exists (select 1 from pg_policy pl where pl.polrelid = v_t) then
    raise exception 'playw6: {schema}.play_assinaturas com policy (é só do servidor)';
  end if;
  if has_table_privilege('anon', v_t, 'select, insert, update, delete')
     or has_table_privilege('authenticated', v_t, 'select, insert, update, delete') then
    raise exception 'playw6: o app ou o visitante acessam {schema}.play_assinaturas';
  end if;
  if not (select pr.prosecdef and coalesce(pr.proconfig, '{}') @> array['search_path=""'] from pg_proc pr where pr.oid = v_f) then
    raise exception 'playw6: {schema}.play_aplicar sem SECURITY DEFINER ou sem o search_path vazio';
  end if;
  if has_function_privilege('anon', v_f, 'execute') or has_function_privilege('authenticated', v_f, 'execute')
     or not has_function_privilege('service_role', v_f, 'execute') then
    raise exception 'playw6: o EXECUTE da {schema}.play_aplicar não é só do servidor';
  end if;
  if not exists (select 1 from pg_trigger tg where tg.tgrelid = v_t and tg.tgname = 'trg_play_assinaturas_recalcular' and not tg.tgisinternal)
     or not exists (select 1 from pg_trigger tg where tg.tgrelid = '{schema}.cobrancas'::regclass and tg.tgname = 'trg_cobrancas_guard_play') then
    raise exception 'playw6: falta um gatilho da play-W6 em {schema}';
  end if;
  select a.valor into v_cfg from {schema}.app_config a where a.chave = 'play_billing' and not a.publica;
  if v_cfg is null or jsonb_typeof(v_cfg -> 'liberada') <> 'boolean' then
    raise exception 'playw6: a trava play_billing de {schema} não está lá (ou é pública)';
  end if;
end $c$;

notify pgrst, 'reload schema';
