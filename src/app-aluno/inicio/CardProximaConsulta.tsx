import { useNavigate } from "react-router-dom";
import { CalendarDays, WifiOff } from "lucide-react";
import { emQuantosDias, proximosAgendamentos, quandoAgendamento, ROTULO_PAPEL } from "@/app-aluno/perfil/pecas/regras";
import { Avatar } from "@/ui/premium/Avatar";
import { Chip } from "@/ui/premium/Chip";
import { Esqueleto } from "@/ui/premium/Estados";
import { useOnline } from "@/ui/premium/useOnline";
import { profissionalDaConsulta, tomDaConsulta } from "./pecas/regras";
import { useAgendaDoAluno, useOQueOAlunoTem, usePerfilDoAluno } from "./pecas/dados";

/**
 * Início › próxima consulta (W12 — tela 1; N-48 e N-53): a foto e o nome do profissional, "Nutricionista · sáb, 18/07 · 10:00" e
 * "Em 2 dias" — a MESMA consulta que a Perfil › Agenda mostra em "Próxima consulta" (as mesmas consulta e cache do W7). Sem
 * consulta marcada: a linha "Nenhuma consulta marcada". Tocar abre a Agenda. O aluno do app (sem profissional) não tem agenda: o
 * card não aparece.
 */
export default function CardProximaConsulta() {
  const tem = useOQueOAlunoTem();
  const navigate = useNavigate();
  const online = useOnline();
  const agenda = useAgendaDoAluno(!tem.semProfissional);
  const perfil = usePerfilDoAluno();
  if (tem.semProfissional) return null;

  const abrir = () => navigate("/perfil/agenda");
  const proxima = agenda.data ? proximosAgendamentos(agenda.data, new Date(), 1)[0] ?? null : null;
  const classe = "pq-cartao flex w-full items-center gap-2.5 px-3.5 py-3 text-left transition-colors hover:border-linha-2";

  if (!agenda.data) {
    // sem internet e nada guardado: o aviso na hora (sem esperar a tentativa da consulta cair)
    if (agenda.isLoading && online) {
      return (
        <div className={classe} data-card-consulta="carregando" role="status" aria-busy="true" aria-label="Carregando a agenda">
          <Esqueleto className="h-[42px] w-[42px] flex-none rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Esqueleto className="h-3.5 w-2/5" />
            <Esqueleto className="h-3 w-3/5" />
          </div>
        </div>
      );
    }
    return (
      <button type="button" onClick={abrir} className={classe} data-card-consulta={!online ? "sem-internet" : "erro"}>
        <span className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-full border border-linha bg-superficie text-texto-3">
          {online ? <CalendarDays aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.75} /> : <WifiOff aria-hidden className="h-[18px] w-[18px] text-ambar-3" strokeWidth={1.75} />}
        </span>
        <span className="min-w-0 flex-1">
          <b className="block truncate text-[14px] font-semibold text-texto">{online ? "Agenda" : "Sem conexão"}</b>
          <span className="mt-0.5 block truncate text-[12px] text-texto-2">{online ? "Não deu para carregar a agenda agora." : "A agenda aparece quando a internet voltar."}</span>
        </span>
      </button>
    );
  }

  if (!proxima) {
    return (
      <button type="button" onClick={abrir} className={classe} data-card-consulta="vazia">
        <span className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-full border border-linha bg-superficie text-texto-3">
          <CalendarDays aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1">
          <b className="block truncate text-[14px] font-semibold text-texto">Nenhuma consulta marcada</b>
          <span className="mt-0.5 block truncate text-[12px] text-texto-2">As consultas do seu profissional aparecem aqui.</span>
        </span>
      </button>
    );
  }

  const prof = profissionalDaConsulta(perfil.data?.profissionais, proxima);
  const nome = proxima.profissional || prof?.nome || proxima.titulo || "Consulta";
  const papel = proxima.papel ? ROTULO_PAPEL[proxima.papel] : proxima.titulo;
  return (
    <button type="button" onClick={abrir} className={classe} data-card-consulta="proxima" data-consulta-id={proxima.id}>
      <Avatar src={prof?.foto_url ?? null} nome={nome} tamanho={42} />
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[14px] font-semibold tracking-[-0.01em] text-texto" data-consulta-profissional>{nome}</b>
        <span className="mt-0.5 block truncate text-[12px] tracking-[-0.01em] text-texto-2" data-consulta-quando>
          {[papel, quandoAgendamento(proxima)].filter(Boolean).join(" · ")}
        </span>
      </span>
      <Chip tom={tomDaConsulta(proxima.papel)} className="flex-none" data-consulta-em>{emQuantosDias(proxima.inicio)}</Chip>
    </button>
  );
}
