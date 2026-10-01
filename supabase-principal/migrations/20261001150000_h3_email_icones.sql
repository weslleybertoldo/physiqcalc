-- Physiq H3 — ícones e logo dos e-mails do app (molde C, supabase-principal/functions/_shared/email-modelo.ts).
--
-- O Gmail não mostra SVG no corpo do e-mail: os ícones vão em PNG, num bucket PÚBLICO só deles ("email"), servidos pelo
-- domínio próprio (https://api-principal.physiqcalc.com.br/storage/v1/object/public/email/v1/<arquivo>.png). Um bucket só
-- para os 2 ambientes (os ícones são os mesmos). Os arquivos ficam no repo em supabase-principal/email/v1/ e sobem pelo
-- scripts/email/publicar_icones_email.py (idempotente, --dry-run). "v1" nunca muda: e-mail que já saiu continua com ícone;
-- um desenho novo vira "v2".
--
-- Só cria o bucket (nenhuma tabela, nenhum dado de cliente). Leitura pública pelo endpoint /object/public (bucket público);
-- gravar só com a service_role (sem política nova em storage.objects). Aplicar SÓ o bloco compartilhado:
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261001150000_h3_email_icones.sql --compartilhado
select 1 as h3_nada_por_schema;

-- @@ compartilhado
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('email', 'email', true, 262144, array['image/png'])
on conflict (id) do nothing;
