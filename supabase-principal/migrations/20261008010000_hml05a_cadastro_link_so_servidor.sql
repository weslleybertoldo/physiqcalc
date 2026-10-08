-- Homologação do Physiq — hml-05a / H-18 (08/10/2026). Idempotente. Nenhum dado muda.
-- O cadastro pelo link (/c/:codigo) grava só pela função `alunos`, que roda como servidor depois do captcha de uso único e do
-- limite por IP. A RPC sai do alcance de quem tem login (aluno, profissional) e de visitante: chamada direta pela API → sem
-- permissão. `cadastro_link_info` fica como está (só o nome do profissional pelo código, público por desenho).
-- Aplicar: python3 scripts/apply_migration_principal.py <este arquivo> --so staging (depois --so public, com backup).

revoke execute on function {schema}.cadastro_link_enviar(text, jsonb) from public, anon, authenticated;
grant execute on function {schema}.cadastro_link_enviar(text, jsonb) to service_role;
