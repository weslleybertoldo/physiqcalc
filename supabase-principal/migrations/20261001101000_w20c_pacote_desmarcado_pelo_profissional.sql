-- Physiq W20c (item extra, decisão dele 01/10 ~09:45) — no pacote de consultas, a consulta DESMARCADA PELO PROFISSIONAL não conta
-- como usada. Banco principal, staging e public. Idempotente; troca SÓ a função agenda_pacote_situacao (mesma assinatura e o
-- mesmo formato de resposta, com 1 estado e 1 campo a mais). Nenhuma tabela, coluna, política ou dado muda.
--
-- Aplicar (backup ANTES — scripts/backup/backup_principal.py: agenda_pacotes, agendamentos):
--   staging:  python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261001101000_w20c_pacote_desmarcado_pelo_profissional.sql --so staging
--   produção: python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261001101000_w20c_pacote_desmarcado_pelo_profissional.sql --so public
--
-- Antes (W20, default B): o mês do pacote contava como usado se o aluno fez, faltou, desistiu ou se o mês acabou sem consulta —
-- inclusive quando quem desmarcou foi o profissional.
-- Agora:
--   · desmarcada pelo PROFISSIONAL (status 'desmarcado', ou apagada no painel/no site antigo — a exclusão é a Lixeira, soft —,
--     pelo próprio, pelo dono da conta ou pela equipe) não consome o mês. Se o mês acaba sem consulta por isso, o mês fica
--     'desmarcada' e o crédito continua no pacote: o pacote anda 1 mês para a frente (6 de 6 continuam 6 consultas, 1 por mês);
--   · falta do aluno ('nao_compareceu'), desistência do aluno ('paciente_desmarcou' — o "Desistir" do app ou a nutri marcando
--     "Paciente desmarcou" no site antigo) e mês sem consulta por conta do aluno continuam contando, como já era;
--   · quem desmarcou já está gravado no status (o aluno nunca grava 'desmarcado'; a apagada com status de falta/desistência
--     segue contando como antes). Nada a gravar daqui pra frente.
-- Ordem de cada mês: feita > faltou > agendada > desistiu > desmarcada (o mês já acabou) > sem_consulta (o mês já acabou) > livre.
-- O mês corrente com a consulta desmarcada pelo profissional segue 'livre' (o aluno ainda pode marcar a do mês).

create or replace function {schema}.agenda_pacote_situacao(p_paciente uuid, p_prof uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_pac {schema}.agenda_pacotes%rowtype;
  v_mes_hoje date := {schema}.w20_mes(now());
  v_mes date;
  v_estado text;
  v_meses jsonb := '[]'::jsonb;
  v_usados int := 0;
  v_livres int := 0;
  v_contados int := 0;
  v_devolvidos int := 0;
  i int := 0;
  v_feita boolean;
  v_faltou boolean;
  v_desistiu boolean;
  v_futura boolean;
  v_desmarcou_prof boolean;
begin
  select * into v_pac from {schema}.agenda_pacotes
   where paciente_id = p_paciente and profissional_id = p_prof and encerrado_em is null;
  if not found then
    return null;
  end if;
  -- cada mês desmarcado pelo profissional devolve o crédito: o pacote anda 1 mês (no máximo 60 a mais)
  while v_contados < v_pac.total and i < v_pac.total + 60 loop
    v_mes := (v_pac.mes_inicio + make_interval(months => i))::date;
    select coalesce(bool_or(a.deleted_at is null and a.status in ('agendado', 'encaixe', 'confirmado', 'paciente_confirmou') and a.fim <= now()), false),
           coalesce(bool_or(a.deleted_at is null and a.status = 'nao_compareceu'), false),
           coalesce(bool_or(a.deleted_at is null and a.status = 'paciente_desmarcou'), false),
           coalesce(bool_or(a.deleted_at is null and a.status in ('agendado', 'encaixe', 'confirmado', 'paciente_confirmou') and a.fim > now()), false),
           coalesce(bool_or((a.deleted_at is null and a.status = 'desmarcado')
                         or (a.deleted_at is not null and a.status not in ('paciente_desmarcou', 'nao_compareceu'))), false)
      into v_feita, v_faltou, v_desistiu, v_futura, v_desmarcou_prof
      from {schema}.agendamentos a
     where a.paciente_id = p_paciente and a.nutricionista_id = p_prof and not a.dia_inteiro
       and coalesce(a.mes_referencia, {schema}.w20_mes(a.inicio)) = v_mes;
    v_estado := case
      when v_feita then 'feita'
      when v_faltou then 'faltou'
      when v_futura then 'agendada'
      when v_desistiu then 'desistiu'
      when v_mes < v_mes_hoje and v_desmarcou_prof then 'desmarcada'
      when v_mes < v_mes_hoje then 'sem_consulta'
      else 'livre' end;
    if v_estado = 'desmarcada' then
      v_devolvidos := v_devolvidos + 1;
    else
      v_contados := v_contados + 1;
    end if;
    if v_estado in ('feita', 'faltou', 'desistiu', 'sem_consulta') then
      v_usados := v_usados + 1;
    elsif v_estado = 'livre' then
      v_livres := v_livres + 1;
    end if;
    v_meses := v_meses || jsonb_build_object('mes', v_mes, 'estado', v_estado);
    i := i + 1;
  end loop;
  return jsonb_build_object(
    'id', v_pac.id, 'paciente_id', v_pac.paciente_id, 'profissional_id', v_pac.profissional_id,
    'total', v_pac.total, 'mes_inicio', v_pac.mes_inicio,
    'mes_fim', (v_pac.mes_inicio + make_interval(months => i - 1))::date,
    'usados', v_usados, 'restam', v_pac.total - v_usados, 'livres', v_livres, 'devolvidos', v_devolvidos, 'meses', v_meses);
end;
$$;
revoke all on function {schema}.agenda_pacote_situacao(uuid, uuid) from public, anon, authenticated;
grant execute on function {schema}.agenda_pacote_situacao(uuid, uuid) to service_role;
