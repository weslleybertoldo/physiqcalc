-- Physiq W13 — Banco do Treino (public + staging). Idempotente. Aplicar UMA vez pela Management API (database/query).
-- F5 ("Bloquear" com efeito): quando o profissional bloqueia um aluno, o espelho (trocar-token / espelho-nucleo) põe
-- physiq_profiles.status = 'bloqueado' e — se a pessoa é SÓ aluno — encerra as sessões do Treino dela, para o APK antigo
-- (≤ 3.15, sem a trava nova) parar de sincronizar; a trocar-token recusa a sessão nova (aluno_bloqueado). Nunca mexe em quem
-- tem papel de staff no Treino (professor, admin, master). Só a service_role chama.
DO $mig$
DECLARE
  sch text;
BEGIN
  FOREACH sch IN ARRAY ARRAY['public', 'staging'] LOOP
    EXECUTE format($f$
      create or replace function %1$I.physiq_encerrar_sessoes_treino(p_user uuid) returns integer
      language plpgsql volatile security definer set search_path = '' as $b$
      declare
        v_n integer := 0;
      begin
        if p_user is null then
          return 0;
        end if;
        if exists (select 1 from auth.users u where u.id = p_user
                     and coalesce(u.raw_app_meta_data ->> 'role', '') in ('admin', 'master', 'professor')) then
          return 0;
        end if;
        delete from auth.sessions where user_id = p_user;
        get diagnostics v_n = row_count;
        return v_n;
      end;
      $b$;
      revoke execute on function %1$I.physiq_encerrar_sessoes_treino(uuid) from public, anon, authenticated;
      grant execute on function %1$I.physiq_encerrar_sessoes_treino(uuid) to service_role;
    $f$, sch);
  END LOOP;
END
$mig$;
