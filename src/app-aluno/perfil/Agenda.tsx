import { useState, type ReactNode } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, CalendarDays, CalendarPlus, Check, Dumbbell, Package, RefreshCw, Repeat, Salad, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useSessao } from "@/nucleo/sessao";
import { ROTULO_MES_PACOTE, aguardandoAluno, mesUsado, normalizarRegras, periodoDoPacote, quandoConsulta, textoPacote, type MesPacote } from "@/agenda/regras";
import { Botao, BotaoIcone } from "@/ui/premium/Botao";
import { Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoCarregando, EstadoErro, EstadoSemInternet, EstadoVazio } from "@/ui/premium/Estados";
import { GrupoLista } from "@/ui/premium/Lista";
import { Paginacao } from "@/ui/premium/Paginacao";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { useOnline } from "@/ui/premium/useOnline";
import { minhaAgenda, minhaAgendaLista } from "./pecas/api";
import {
  agendamentosAnteriores, areaDaConsulta, ehCancelado, emQuantosDias, inicioDaAgenda, proximosAgendamentos, PROXIMAS_NO_CARTAO, quandoAgendamento, rotuloStatus,
  ROTULO_PAPEL, type AreaDaConsulta,
} from "./pecas/regras";
import { CLASSE_PAGINA_APP, TopoItem } from "./pecas/TopoItem";
import { confirmarConsulta, mensagemErroAgenda, minhasRegrasAgenda, type ConsultaAluno, type ProfissionalDaAgenda } from "./agenda/api";
import { SheetDesistir, SheetMarcar, SheetReagendar, type ContextoDaConsulta } from "./agenda/Folhas";

/** Cor do status (desmarcado = rosa; confirmado = verde; esperando o aluno = âmbar; o resto, neutro). */
function corDoStatus(status: string): string {
  if (ehCancelado(status) || status === "nao_compareceu") return "text-rosa-3";
  if (status === "confirmado" || status === "paciente_confirmou") return "text-verde-3";
  if (aguardandoAluno(status)) return "text-ambar-3";
  return "text-texto-2";
}

/** O ícone pela ÁREA da consulta (H1: treino → halter, nutrição → prato, geral → calendário; o papel só sem a área). */
const ICONE_DA_AREA: Record<AreaDaConsulta, LucideIcon> = { treino: Dumbbell, nutricao: Salad, geral: CalendarDays };
const MINI = "inline-flex h-8 items-center gap-1 rounded-[10px] border px-2 text-[11.5px] font-semibold transition-colors disabled:opacity-50";

function Acoes({ a, ctx, aoConfirmar, aoReagendar, aoDesistir, confirmando }: {
  a: ConsultaAluno;
  ctx: ContextoDaConsulta;
  aoConfirmar: () => void;
  aoReagendar: () => void;
  aoDesistir: () => void;
  confirmando: boolean;
}) {
  if (a.dia_inteiro || ehCancelado(a.status) || a.status === "nao_compareceu" || new Date(a.inicio).getTime() <= Date.now()) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5" data-acoes-consulta={a.id}>
      {aguardandoAluno(a.status) && (
        <button type="button" onClick={aoConfirmar} disabled={confirmando} className={cn(MINI, "border-transparent text-[var(--p-botao-w-texto)]")} style={{ background: "var(--p-botao-w-fundo)" }} data-btn-confirmar={a.id}>
          <Check aria-hidden className="h-3.5 w-3.5" /> {confirmando ? "Confirmando…" : "Confirmar"}
        </button>
      )}
      {ctx.regras.reagendamentos_max > 0 && (
        <button type="button" onClick={aoReagendar} className={cn(MINI, "border-linha-2 bg-[rgba(255,255,255,.04)] text-texto")} data-btn-reagendar={a.id}>
          <Repeat aria-hidden className="h-3.5 w-3.5" /> Reagendar
        </button>
      )}
      {ctx.regras.desistencia && (
        <button type="button" onClick={aoDesistir} className={cn(MINI, "border-[rgba(244,63,94,.3)] text-rosa-3")} data-btn-desistir={a.id}>
          <X aria-hidden className="h-3.5 w-3.5" /> Desistir
        </button>
      )}
    </div>
  );
}

function Linha({ a, acoes, item = false }: { a: ConsultaAluno; acoes?: ReactNode; item?: boolean }) {
  const cancelado = ehCancelado(a.status);
  const area = areaDaConsulta(a);
  const Icone = ICONE_DA_AREA[area];
  const quem = a.profissional ? `${a.profissional}${a.papel ? ` · ${ROTULO_PAPEL[a.papel]}` : ""}` : null;
  const espera = aguardandoAluno(a.status) && new Date(a.inicio).getTime() > Date.now();
  return (
    <li className="flex items-start gap-3 py-2.5" data-agendamento={a.id} data-agendamento-status={a.status} data-agendamento-area={area} {...(item ? { "data-item": "" } : {})}>
      <span className="mt-0.5 flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[10px] bg-superficie text-suave" data-icone-area={area}>
        <Icone aria-hidden className="h-4 w-4" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("whitespace-nowrap text-[13.5px] font-medium", cancelado ? "text-texto-3 line-through" : "text-texto")} data-agendamento-quando>
          {quandoAgendamento(a)}
        </p>
        <p className="truncate text-[12px] text-texto-2">{[a.titulo, quem].filter(Boolean).join(" · ")}</p>
        <p className={cn("mt-0.5 text-[11.5px] font-semibold", corDoStatus(a.status))} data-agendamento-rotulo>
          {espera ? "Esperando a sua confirmação" : rotuloStatus(a.status, a.papel)}
          {(a.reagendamentos ?? 0) > 0 && <span className="font-normal text-texto-3"> · reagendada {a.reagendamentos === 1 ? "1 vez" : `${a.reagendamentos} vezes`}</span>}
        </p>
        {acoes}
      </div>
    </li>
  );
}

function corDoMes(e: MesPacote["estado"]): string {
  if (e === "feita") return "border-verde/40 bg-[rgba(16,185,129,.12)] text-verde-3";
  if (e === "agendada") return "border-violeta-2/50 bg-[rgba(139,92,246,.14)] text-violeta-3";
  if (mesUsado(e)) return "border-[rgba(244,63,94,.3)] bg-[rgba(244,63,94,.07)] text-rosa-3";
  return "border-linha-2 bg-[rgba(255,255,255,.03)] text-texto-2";
}

function CartaoPacote({ p, aoMarcar }: { p: ProfissionalDaAgenda; aoMarcar: () => void }) {
  const pac = p.pacote!;
  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const podeMarcar = pac.livres > 0 && p.tem_calendario;
  return (
    <Cartao className="px-4 py-3.5" data-cartao-pacote={p.profissional_id} data-pacote-restam={pac.restam} data-pacote-total={pac.total}>
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-[14px] border border-linha bg-superficie text-verde-3">
          <Package aria-hidden className="h-5 w-5" strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <span className="pq-eyebrow whitespace-nowrap">Pacote de consultas</span>
          <b className="mt-0.5 block text-[16px] font-semibold tracking-[-0.01em] text-texto" data-pacote-texto>{textoPacote(pac)}</b>
          <span className="block truncate text-[12px] text-texto-2">{p.profissional ?? ROTULO_PAPEL[p.papel]} · {periodoDoPacote(pac)}</span>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5" data-pacote-meses>
        {pac.meses.map((m) => (
          <span key={m.mes} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold", corDoMes(m.estado))} data-mes={m.mes} data-mes-estado={m.estado}>
            {MESES[Number(m.mes.slice(5, 7)) - 1]} · {ROTULO_MES_PACOTE[m.estado]}
          </span>
        ))}
      </div>
      {podeMarcar && (
        <Botao variante="g" tamanho="sm" icone={CalendarPlus} className="mt-3" onClick={aoMarcar} data-btn-marcar={p.profissional_id}>Marcar consulta</Botao>
      )}
    </Cartao>
  );
}

type Folha = { tipo: "reagendar" | "desistir"; consulta: ConsultaAluno } | { tipo: "marcar"; prof: ProfissionalDaAgenda } | null;

/**
 * hml-14d (B21 · D31 · P7): a folha "Ver todas" das próximas consultas — a lista inteira em páginas de 20 do banco (minha_agenda_lista,
 * a mesma janela e a mesma regra das "Próximas"), com "1–20 de N" e as ações de cada consulta. A página fica no estado da folha:
 * fechar volta à 1. O erro aparece na folha.
 */
function FolhaProximas({ aberta, uid, aoFechar, acoesDe }: { aberta: boolean; uid: string | null; aoFechar: () => void; acoesDe: (a: ConsultaAluno) => ReactNode }) {
  const [pagina, setPagina] = useState(1);
  const q = useQuery({
    queryKey: ["agenda-aluno", uid, "lista", "proximas", pagina],
    queryFn: () => minhaAgendaLista("proximas", pagina),
    enabled: aberta && Boolean(uid),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: 1,
    networkMode: "online",
  });
  const fechar = () => {
    setPagina(1);
    aoFechar();
  };
  return (
    <PainelDeslizante aberto={aberta} aoMudar={(a) => !a && fechar()} titulo="Próximas consultas"
      descricao={q.data ? (q.data.total === 1 ? "1 consulta marcada" : `${q.data.total} consultas marcadas`) : undefined} lado="baixo">
      <div data-folha-todos="agenda">
        {q.isError ? (
          <EstadoErro aoTentar={() => void q.refetch()} />
        ) : !q.data ? (
          <EstadoCarregando linhas={3} rotulo="Carregando as consultas" />
        ) : q.data.itens.length === 0 ? (
          <p className="py-3 text-[13px] text-texto-2">Nenhuma consulta marcada daqui para frente.</p>
        ) : (
          <ul className="divide-y divide-linha-3" data-lista="app-agenda">
            {(q.data.itens as ConsultaAluno[]).map((a) => <Linha key={a.id} a={a} acoes={acoesDe(a)} item />)}
          </ul>
        )}
        {q.data && <Paginacao nome="app-agenda" pagina={pagina} total={q.data.total} aoMudar={setPagina} carregando={q.isFetching} />}
      </div>
    </PainelDeslizante>
  );
}

/**
 * Perfil › Agenda (N-53 — porte da agenda do paciente do PhysiqNutri — + o pedido dele de 01/10, W20): as próximas consultas e as
 * dos últimos 3 meses, com o status na voz do aluno; a consulta que o profissional marcou pede a resposta do aluno: CONFIRMAR,
 * REAGENDAR (1 slot; nº de vezes e janela pelas regras do profissional, com a mensagem clara) ou DESISTIR (com o aviso do que
 * perde). Com pacote: quantas restam (1 por mês) e "Marcar consulta". Todas as matrículas (P7); precisa de internet.
 */
export default function Agenda() {
  const { usuario } = useSessao();
  const online = useOnline();
  const qc = useQueryClient();
  const uid = usuario?.id ?? null;
  const q = useQuery({ queryKey: ["agenda-aluno", uid], queryFn: () => minhaAgenda(inicioDaAgenda()), enabled: Boolean(uid), staleTime: 60_000, retry: 1, networkMode: "online" });
  const regrasQ = useQuery({ queryKey: ["agenda-aluno-regras", uid], queryFn: minhasRegrasAgenda, enabled: Boolean(uid), staleTime: 60_000, retry: 1, networkMode: "online" });
  const [folha, setFolha] = useState<Folha>(null);
  const [verTodas, setVerTodas] = useState(false);
  const [confirmando, setConfirmando] = useState<string | null>(null);

  const agora = new Date();
  const lista = (q.data ?? []) as ConsultaAluno[];
  // hml-14d (B21 · P7): o cartão "Próximas" mostra as 20 primeiras (antes, 50 sem "ver todas"); a regra de reagendar e o destaque
  // seguem sobre TODAS as próximas da minha_agenda; "Ver todas (N)" abre a folha em páginas de 20 do banco
  const todasProximas = proximosAgendamentos(lista, agora);
  const proximos = todasProximas.slice(0, PROXIMAS_NO_CARTAO);
  const anteriores = agendamentosAnteriores(lista, agora);
  const pendentes = todasProximas.filter((a) => aguardandoAluno(a.status) && !a.dia_inteiro && new Date(a.inicio).getTime() > agora.getTime());
  const profs = regrasQ.data ?? [];
  const comPacote = profs.filter((p) => p.pacote);
  const primeira = proximos[0] ?? null;
  const destaque = pendentes[0] ?? null;

  const contextoDe = (c: ConsultaAluno): ContextoDaConsulta => {
    const p = profs.find((x) => x.profissional_id === c.profissional_id);
    const outrasNoMes = todasProximas.filter((x) => x.id !== c.id && x.profissional_id === c.profissional_id && !x.dia_inteiro
      && (x.mes_referencia ?? "").slice(0, 7) === (c.mes_referencia ?? "").slice(0, 7)).length;
    return { regras: normalizarRegras(c.regras ?? p?.regras), pacote: p?.pacote ?? null, profissional: c.profissional ?? p?.profissional ?? null, outrasNoMes };
  };
  const atualizar = () => {
    void qc.invalidateQueries({ queryKey: ["agenda-aluno", uid] });
    void qc.invalidateQueries({ queryKey: ["agenda-aluno-regras", uid] });
    void qc.invalidateQueries({ queryKey: ["agenda-aluno-horarios"] });
  };
  const confirmar = async (c: ConsultaAluno) => {
    setConfirmando(c.id);
    try {
      await confirmarConsulta(c.id);
      toast.success(`Presença confirmada: ${quandoConsulta(c.inicio)}.`);
      atualizar();
    } catch (e) {
      toast.error(mensagemErroAgenda(e));
    } finally {
      setConfirmando(null);
    }
  };
  const acoesDe = (a: ConsultaAluno) => (
    <Acoes a={a} ctx={contextoDe(a)} confirmando={confirmando === a.id} aoConfirmar={() => void confirmar(a)}
      aoReagendar={() => setFolha({ tipo: "reagendar", consulta: a })} aoDesistir={() => setFolha({ tipo: "desistir", consulta: a })} />
  );
  const consultaDaFolha = folha && folha.tipo !== "marcar" ? folha.consulta : null;
  const nadaAinda = proximos.length === 0 && anteriores.length === 0 && comPacote.length === 0;

  return (
    <div data-pagina-agenda data-proximos={todasProximas.length} data-anteriores={anteriores.length} data-pendentes={pendentes.length} className={CLASSE_PAGINA_APP}>
      <TopoItem titulo="Agenda"
        acao={<BotaoIcone icone={RefreshCw} rotulo="Atualizar" onClick={() => { void q.refetch(); void regrasQ.refetch(); }} className={q.isFetching ? "[&>svg]:animate-spin" : undefined} />} />
      <p className="-mt-1 px-0.5 text-[13px] text-texto-2">Suas consultas: confirme, reagende ou desista pelo app.</p>
      {!online && !q.data ? (
        <EstadoSemInternet texto="A agenda aparece quando a internet voltar." />
      ) : q.isLoading ? (
        <EstadoCarregando linhas={3} rotulo="Carregando a agenda" />
      ) : q.isError ? (
        <EstadoErro aoTentar={() => void q.refetch()} />
      ) : nadaAinda ? (
        <EstadoVazio icone={CalendarDays} titulo="Nenhuma consulta marcada" texto="As consultas que o seu profissional marcar aparecem aqui, para você confirmar." />
      ) : (
        <>
          {destaque ? (
            <Cartao brilho className="px-4 py-3.5" data-agenda-confirmar={destaque.id}>
              <div className="flex items-center gap-3.5">
                <span className="flex h-11 w-11 flex-none items-center justify-center rounded-[14px] border border-linha bg-superficie text-ambar-3">
                  <CalendarCheck aria-hidden className="h-5 w-5" strokeWidth={1.8} />
                </span>
                <div className="min-w-0 flex-1">
                  <span className="pq-eyebrow whitespace-nowrap">Confirme sua consulta</span>
                  <div className="mt-0.5 flex items-center gap-2">
                    <b className="min-w-0 truncate text-[16px] font-semibold tracking-[-0.01em] text-texto" data-confirmar-quando>{quandoAgendamento(destaque)}</b>
                    <Chip tom="a" className="flex-none">{emQuantosDias(destaque.inicio, agora)}</Chip>
                  </div>
                  <span className="block truncate text-[12.5px] text-texto-2">{[destaque.profissional, destaque.titulo].filter(Boolean).join(" · ") || "Consulta"}</span>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Botao variante="w" icone={Check} disabled={confirmando === destaque.id} onClick={() => void confirmar(destaque)} data-destaque-confirmar>
                  {confirmando === destaque.id ? "Confirmando…" : "Confirmar"}
                </Botao>
                <Botao variante="g" icone={Repeat} onClick={() => setFolha({ tipo: "reagendar", consulta: destaque })} disabled={contextoDe(destaque).regras.reagendamentos_max <= 0} data-destaque-reagendar>
                  Reagendar
                </Botao>
              </div>
              {contextoDe(destaque).regras.desistencia && (
                <button type="button" onClick={() => setFolha({ tipo: "desistir", consulta: destaque })} className="mt-2.5 w-full text-center text-[12.5px] font-semibold text-rosa-3" data-destaque-desistir>
                  Não vou poder ir: desistir da consulta
                </button>
              )}
            </Cartao>
          ) : primeira ? (
            <Cartao brilho className="flex items-center gap-3.5 px-4 py-3.5" data-agenda-proxima>
              <span className="flex h-11 w-11 flex-none items-center justify-center rounded-[14px] border border-linha bg-superficie text-violeta-3">
                <CalendarDays aria-hidden className="h-5 w-5" strokeWidth={1.8} />
              </span>
              <div className="min-w-0 flex-1">
                <span className="pq-eyebrow">Próxima consulta</span>
                <b className="mt-0.5 block truncate text-[16px] font-semibold tracking-[-0.01em] text-texto">{quandoAgendamento(primeira)}</b>
                <span className="block truncate text-[12.5px] text-texto-2">{[primeira.profissional, primeira.titulo].filter(Boolean).join(" · ") || "Consulta"}</span>
              </div>
              <Chip tom="c">{emQuantosDias(primeira.inicio, agora)}</Chip>
            </Cartao>
          ) : null}

          {comPacote.map((p) => <CartaoPacote key={p.profissional_id} p={p} aoMarcar={() => setFolha({ tipo: "marcar", prof: p })} />)}

          <GrupoLista titulo="Próximas">
            {proximos.length ? (
              <ul className="divide-y divide-linha-3" data-agenda-lista="proximas">{proximos.map((a) => <Linha key={a.id} a={a} acoes={a.id === destaque?.id ? undefined : acoesDe(a)} />)}</ul>
            ) : (
              <p className="py-3 text-[13px] text-texto-2" data-agenda-sem-proximas>Nenhuma consulta marcada daqui para frente.</p>
            )}
            {todasProximas.length > PROXIMAS_NO_CARTAO && (
              <button type="button" onClick={() => setVerTodas(true)} className="block w-full border-t border-linha-3 py-2.5 text-left text-[12.5px] font-semibold text-violeta-3"
                data-ver-todos="agenda">
                Ver todas ({todasProximas.length})
              </button>
            )}
          </GrupoLista>
          {anteriores.length > 0 && (
            <GrupoLista titulo="Anteriores">
              <ul className="divide-y divide-linha-3" data-agenda-lista="anteriores">{anteriores.map((a) => <Linha key={a.id} a={a} />)}</ul>
            </GrupoLista>
          )}
        </>
      )}

      <FolhaProximas aberta={verTodas} uid={uid} aoFechar={() => setVerTodas(false)} acoesDe={acoesDe} />
      <SheetReagendar consulta={folha?.tipo === "reagendar" ? consultaDaFolha : null} contexto={consultaDaFolha ? contextoDe(consultaDaFolha) : null}
        aberto={folha?.tipo === "reagendar"} aoMudar={(v) => !v && setFolha(null)} aoFeito={atualizar} />
      <SheetDesistir consulta={folha?.tipo === "desistir" ? consultaDaFolha : null} contexto={consultaDaFolha ? contextoDe(consultaDaFolha) : null}
        aberto={folha?.tipo === "desistir"} aoMudar={(v) => !v && setFolha(null)} aoFeito={atualizar} />
      <SheetMarcar prof={folha?.tipo === "marcar" ? folha.prof : null} aberto={folha?.tipo === "marcar"} aoMudar={(v) => !v && setFolha(null)} aoFeito={atualizar} />
    </div>
  );
}
