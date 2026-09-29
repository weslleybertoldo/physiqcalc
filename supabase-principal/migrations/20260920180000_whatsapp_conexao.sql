-- PhysiqNutri — W46 Conexão do WhatsApp (QR code, biblioteca Baileys rodando no celular de casa).
-- Pedido dele (20/09/2026): "temos pendentes ainda as mensagens pelo whatsapp". Decisões dele no mesmo dia: QR code como no
-- WhatsApp Web (API não oficial) · serviço hospedado no celular da sala · CADA profissional conecta o PRÓPRIO número ·
-- "fechamos assim, camera fora do G7". Idempotente.
-- Aplicar com `python3 scripts/apply_migration.py supabase/migrations/20260920180000_whatsapp_conexao.sql` (public E staging).
--
-- Desenho: a tela pede a conexão (Edge Function whatsapp-conectar, JWT da dona) → a linha fica em 'aguardando_qr' → o agente
-- do celular (Edge Function whatsapp-agente, token próprio no header) pega o pedido, abre a sessão e PUBLICA o QR (dataURL) →
-- a tela mostra o QR e troca pra 'conectado' quando o celular avisa. Quem ESCREVE nas duas tabelas é só a service_role das
-- functions; a dona só LÊ. As credenciais da sessão do WhatsApp nunca vêm pro banco: ficam no celular.

-- 1) instância (1 por profissional): estado da conexão do número dela
create table if not exists {schema}.whatsapp_instancias (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null unique references auth.users(id) on delete cascade,
  status text not null default 'desconectado'
    check (status in ('desconectado', 'aguardando_qr', 'conectado', 'erro')),
  numero_e164 text,                          -- número que ela pediu pra conectar (vem de Configurações, W35)
  numero_conectado text,                     -- número que o WhatsApp confirmou ao abrir a sessão
  qr_code text,                              -- dataURL do QR publicado pelo agente (vale ~60 s, o agente republica)
  qr_atualizado_em timestamptz,
  pedido_em timestamptz,                     -- quando ela pediu pra conectar (o agente só age em pedido recente)
  conectado_em timestamptz,
  ultimo_ping timestamptz,                   -- batida do agente — a tela avisa quando o celular está fora do ar
  erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists whatsapp_instancias_status_idx on {schema}.whatsapp_instancias (status, pedido_em desc);
grant all on {schema}.whatsapp_instancias to anon, authenticated, service_role;

alter table {schema}.whatsapp_instancias enable row level security;

-- a dona lê a própria linha (conta de PACIENTE nunca lê nada aqui) ou master lê todas. Ninguém escreve pelo cliente:
-- sem policy de insert/update/delete, só a service_role das Edge Functions grava.
drop policy if exists "whatsapp: dona ou master le" on {schema}.whatsapp_instancias;
create policy "whatsapp: dona ou master le" on {schema}.whatsapp_instancias
  for select to authenticated
  using ((nutricionista_id = auth.uid() and not {schema}.eh_paciente()) or {schema}.eh_master());

drop trigger if exists trg_whatsapp_instancias_updated_at on {schema}.whatsapp_instancias;
create trigger trg_whatsapp_instancias_updated_at before update on {schema}.whatsapp_instancias
  for each row execute function {schema}.set_updated_at();

-- 2) fila de mensagens: a W46 só usa o tipo 'teste' (botão "enviar teste pra mim"); os disparos automáticos
--    (aniversário, lembrete de consulta, cobrança) entram na W47 enfileirando aqui pelo pg_cron.
create table if not exists {schema}.mensagens_whatsapp (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,
  paciente_id uuid references {schema}.pacientes(id) on delete set null,
  tipo text not null default 'teste'
    check (tipo in ('teste', 'aniversario', 'lembrete_consulta', 'cobranca_vencendo', 'cobranca_vencida', 'confirmacao_agendamento')),
  destino_e164 text not null,
  texto text not null,
  agendada_para timestamptz not null default now(),
  status text not null default 'pendente' check (status in ('pendente', 'enviando', 'enviada', 'falhou', 'cancelada')),
  tentativas integer not null default 0,
  enviada_em timestamptz,
  erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mensagens_whatsapp_fila_idx on {schema}.mensagens_whatsapp (status, agendada_para);
create index if not exists mensagens_whatsapp_nutri_idx on {schema}.mensagens_whatsapp (nutricionista_id, created_at desc);
create index if not exists mensagens_whatsapp_paciente_idx on {schema}.mensagens_whatsapp (paciente_id, created_at desc);
grant all on {schema}.mensagens_whatsapp to anon, authenticated, service_role;

alter table {schema}.mensagens_whatsapp enable row level security;

-- mesma regra: a dona (ou master) LÊ o histórico; escrever é só pela função, com service_role.
drop policy if exists "mensagens whatsapp: dona ou master le" on {schema}.mensagens_whatsapp;
create policy "mensagens whatsapp: dona ou master le" on {schema}.mensagens_whatsapp
  for select to authenticated
  using ((nutricionista_id = auth.uid() and not {schema}.eh_paciente()) or {schema}.eh_master());

drop trigger if exists trg_mensagens_whatsapp_updated_at on {schema}.mensagens_whatsapp;
create trigger trg_mensagens_whatsapp_updated_at before update on {schema}.mensagens_whatsapp
  for each row execute function {schema}.set_updated_at();

-- 3) preferências do WhatsApp no perfil (profiles.config.whatsapp): a W46 grava só `horario` e os toggles ficam
--    desligados; a W47 usa isso pra decidir o que enfileirar. Nada a fazer aqui — `config` já é jsonb livre (W35).
