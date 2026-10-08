-- RASCUNHO (hml-05c, 08/10/2026 — NÃO aplicado). Homologação do Physiq — H-17 (1): limite por IP nas 3 RPCs públicas (diário e
-- pré-consulta). Idempotente. Falta: a chamada de {schema}.limite_publico(...) no começo de preconsulta_responder, diario_listar e
-- diario_enviar (gerar do banco vivo, como na hml-02b) e diario_listar passar a VOLATILE (STABLE não grava o contador).
--
-- IP de quem chamou: pelo Worker api-principal o banco vê o IP do Worker, então o Worker manda x-physiq-ip + x-physiq-assinatura =
-- HMAC-SHA256(PROXY_SEGREDO, "ip:minuto") (infra/cloudflare/physiq-principal-api/worker.js); vale a assinatura do minuto atual ou do
-- anterior, conferida com o segredo guardado no Vault (`physiq_proxy_segredo`). Sem assinatura válida vale o cf-connecting-ip, que a
-- Cloudflare sobrescreve no pedido direto ao *.supabase.co. O banco guarda só o hash do IP (sha256 com o próprio segredo como sal).
-- Aplicar: python3 scripts/apply_migration_principal.py <este arquivo> --so staging (depois --so public, com backup).

create table if not exists {schema}.publico_pedidos_ip (
  ip_hash text not null,
  rota text not null,
  janela timestamptz not null,
  n integer not null default 0,
  primary key (ip_hash, rota, janela)
);
alter table {schema}.publico_pedidos_ip enable row level security;  -- sem policy: só as funções definer mexem
revoke all on {schema}.publico_pedidos_ip from public, anon, authenticated;

create or replace function {schema}.ip_do_pedido_hash() returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  h json := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
  ip text := h->>'x-physiq-ip';
  sig text := h->>'x-physiq-assinatura';
  seg text;
  minuto bigint := floor(extract(epoch from now()) / 60)::bigint;
begin
  select s.decrypted_secret into seg from vault.decrypted_secrets s where s.name = 'physiq_proxy_segredo';
  if seg is null or ip is null or sig is null or sig not in (
       encode(extensions.hmac(ip || ':' || minuto, seg, 'sha256'), 'hex'),
       encode(extensions.hmac(ip || ':' || (minuto - 1), seg, 'sha256'), 'hex')) then
    ip := h->>'cf-connecting-ip';
  end if;
  return encode(extensions.digest(coalesce(seg, '') || ':' || coalesce(ip, 'sem-ip'), 'sha256'), 'hex');
end $$;
revoke execute on function {schema}.ip_do_pedido_hash() from public, anon, authenticated;

-- true = pode seguir; false = passou do limite nesta janela. Limpa o que tem mais de 1 dia de vez em quando.
create or replace function {schema}.limite_publico(p_rota text, p_max integer, p_janela interval) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_ip text := {schema}.ip_do_pedido_hash();
  v_janela timestamptz := to_timestamp(floor(extract(epoch from now()) / extract(epoch from p_janela)) * extract(epoch from p_janela));
  v_n integer;
begin
  insert into {schema}.publico_pedidos_ip as t (ip_hash, rota, janela, n) values (v_ip, p_rota, v_janela, 1)
  on conflict (ip_hash, rota, janela) do update set n = t.n + 1
  returning t.n into v_n;
  if random() < 0.01 then
    delete from {schema}.publico_pedidos_ip where janela < now() - interval '1 day';
  end if;
  return v_n <= p_max;
end $$;
revoke execute on function {schema}.limite_publico(text, integer, interval) from public, anon, authenticated;
