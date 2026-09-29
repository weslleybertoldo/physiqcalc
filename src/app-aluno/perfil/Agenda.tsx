import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Dumbbell, RefreshCw, Salad } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSessao } from "@/nucleo/sessao";
import { BotaoIcone } from "@/ui/premium/Botao";
import { Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoCarregando, EstadoErro, EstadoSemInternet, EstadoVazio } from "@/ui/premium/Estados";
import { GrupoLista } from "@/ui/premium/Lista";
import { useOnline } from "@/ui/premium/useOnline";
import { minhaAgenda } from "./pecas/api";
import {
  agendamentosAnteriores, ehCancelado, emQuantosDias, inicioDaAgenda, proximosAgendamentos, quandoAgendamento, rotuloStatus, ROTULO_PAPEL,
  type AgendamentoAluno,
} from "./pecas/regras";
import { CLASSE_PAGINA_APP, TopoItem } from "./pecas/TopoItem";

/** Cor do status (desmarcado = rosa; confirmado = verde; o resto, neutro). */
function corDoStatus(status: string): string {
  if (ehCancelado(status) || status === "nao_compareceu") return "text-rosa-3";
  if (status === "confirmado" || status === "paciente_confirmou") return "text-verde-3";
  return "text-texto-2";
}

function Linha({ a }: { a: AgendamentoAluno }) {
  const cancelado = ehCancelado(a.status);
  const Icone = a.modulo === "treino" || a.papel === "personal" ? Dumbbell : a.modulo === "nutricao" || a.papel === "nutricionista" ? Salad : CalendarDays;
  const quem = a.profissional ? `${a.profissional}${a.papel ? ` · ${ROTULO_PAPEL[a.papel]}` : ""}` : null;
  return (
    <li className="flex items-start gap-3 py-2.5" data-agendamento={a.id} data-agendamento-status={a.status}>
      <span className="mt-0.5 flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[10px] bg-superficie text-suave">
        <Icone aria-hidden className="h-4 w-4" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("whitespace-nowrap text-[13.5px] font-medium", cancelado ? "text-texto-3 line-through" : "text-texto")} data-agendamento-quando>
          {quandoAgendamento(a)}
        </p>
        <p className="truncate text-[12px] text-texto-2">{[a.titulo, quem].filter(Boolean).join(" · ")}</p>
        <p className={cn("mt-0.5 text-[11.5px] font-semibold", corDoStatus(a.status))} data-agendamento-rotulo>{rotuloStatus(a.status, a.papel)}</p>
      </div>
    </li>
  );
}

/**
 * Perfil › Agenda (N-53 — porte da agenda do paciente do PhysiqNutri): as próximas consultas e as dos últimos 3 meses, com o
 * status na voz do aluno. Só leitura (não confirma nem desmarca, como hoje). Todas as matrículas (P7); precisa de internet.
 */
export default function Agenda() {
  const { usuario } = useSessao();
  const online = useOnline();
  const uid = usuario?.id ?? null;
  const q = useQuery({ queryKey: ["agenda-aluno", uid], queryFn: () => minhaAgenda(inicioDaAgenda()), enabled: Boolean(uid), staleTime: 60_000, retry: 1, networkMode: "online" });
  const agora = new Date();
  const proximos = proximosAgendamentos(q.data ?? [], agora, 50);
  const anteriores = agendamentosAnteriores(q.data ?? [], agora);
  const primeira = proximos[0] ?? null;

  return (
    <div data-pagina-agenda data-proximos={proximos.length} data-anteriores={anteriores.length} className={CLASSE_PAGINA_APP}>
      <TopoItem titulo="Agenda"
        acao={<BotaoIcone icone={RefreshCw} rotulo="Atualizar" onClick={() => void q.refetch()} className={q.isFetching ? "[&>svg]:animate-spin" : undefined} />} />
      <p className="-mt-1 px-0.5 text-[13px] text-texto-2">Suas consultas: as próximas e as dos últimos 3 meses.</p>
      {!online && !q.data ? (
        <EstadoSemInternet texto="A agenda aparece quando a internet voltar." />
      ) : q.isLoading ? (
        <EstadoCarregando linhas={3} rotulo="Carregando a agenda" />
      ) : q.isError ? (
        <EstadoErro aoTentar={() => void q.refetch()} />
      ) : proximos.length === 0 && anteriores.length === 0 ? (
        <EstadoVazio icone={CalendarDays} titulo="Nenhuma consulta marcada" texto="As consultas que o seu profissional marcar aparecem aqui." />
      ) : (
        <>
          {primeira && (
            <Cartao brilho className="flex items-center gap-3.5 px-4 py-3.5" data-agenda-proxima>
              <span className="flex h-11 w-11 flex-none items-center justify-center rounded-[14px] border border-linha bg-superficie text-violeta-3">
                <CalendarDays aria-hidden className="h-5 w-5" strokeWidth={1.8} />
              </span>
              <div className="min-w-0 flex-1">
                <span className="pq-eyebrow">Próxima consulta</span>
                <b className="mt-0.5 block truncate text-[16px] font-semibold tracking-[-0.01em] text-texto">{quandoAgendamento(primeira)}</b>
                <span className="block truncate text-[12.5px] text-texto-2">
                  {[primeira.profissional, primeira.titulo].filter(Boolean).join(" · ") || "Consulta"}
                </span>
              </div>
              <Chip tom="c">{emQuantosDias(primeira.inicio, agora)}</Chip>
            </Cartao>
          )}
          <GrupoLista titulo="Próximas">
            {proximos.length ? (
              <ul className="divide-y divide-linha-3" data-agenda-lista="proximas">{proximos.map((a) => <Linha key={a.id} a={a} />)}</ul>
            ) : (
              <p className="py-3 text-[13px] text-texto-2" data-agenda-sem-proximas>Nenhuma consulta marcada daqui para frente.</p>
            )}
          </GrupoLista>
          {anteriores.length > 0 && (
            <GrupoLista titulo="Anteriores">
              <ul className="divide-y divide-linha-3" data-agenda-lista="anteriores">{anteriores.map((a) => <Linha key={a.id} a={a} />)}</ul>
            </GrupoLista>
          )}
        </>
      )}
    </div>
  );
}
