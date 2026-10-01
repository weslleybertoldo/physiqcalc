// Physiq W20 — as folhas da Perfil › Agenda: Reagendar (a mensagem clara no topo, montada pelas regras — pedido dele — e então
// o dia e 1 horário), Desistir (o aviso do que ele perde e a confirmação) e Marcar a consulta do pacote (1 slot).
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, CalendarX2, Info, Repeat } from "lucide-react";
import { toast } from "sonner";
import { diaSP, hojeSP, mensagemDesistir, mensagemReagendar, mesDe, periodoDoPacote, quandoConsulta, textoPacote, type PacoteSituacao, type RegrasAgenda } from "@/agenda/regras";
import { MensagemForm } from "@/entrada/pecas/Campo";
import { Botao } from "@/ui/premium/Botao";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import {
  desistirConsulta, horariosParaMarcar, horariosParaReagendar, marcarConsulta, mensagemErroAgenda, reagendarConsulta, type ConsultaAluno,
  type ProfissionalDaAgenda,
} from "./api";
import { EscolherHorario } from "./EscolherHorario";

export interface ContextoDaConsulta {
  regras: RegrasAgenda;
  pacote: PacoteSituacao | null;
  profissional: string | null;
  /** outras consultas vivas com o mesmo profissional no mesmo mês */
  outrasNoMes: number;
}

function Aviso({ tom, titulo, texto, marca }: { tom: "ambar" | "rosa" | "violeta"; titulo?: string; texto: string; marca: string }) {
  const cor = { ambar: ["rgba(245,158,11,.32)", "rgba(245,158,11,.08)", "text-ambar-3"], rosa: ["rgba(244,63,94,.35)", "rgba(244,63,94,.08)", "text-rosa-3"], violeta: ["rgba(139,92,246,.35)", "rgba(139,92,246,.1)", "text-violeta-3"] }[tom];
  return (
    <div className="flex items-start gap-2.5 rounded-2xl border px-3.5 py-3" style={{ borderColor: cor[0], background: cor[1] }} {...{ [`data-${marca}`]: "" }}>
      <Info aria-hidden className={`mt-0.5 h-4 w-4 flex-none ${cor[2]}`} />
      <div>
        {titulo && <b className={`block text-[13px] font-semibold ${cor[2]}`}>{titulo}</b>}
        <p className="text-[13px] leading-relaxed text-texto">{texto}</p>
      </div>
    </div>
  );
}

const mesDaConsulta = (c: ConsultaAluno): string => (c.mes_referencia ? mesDe(c.mes_referencia) : mesDe(diaSP(c.inicio)));

export function SheetReagendar({ consulta, contexto, aberto, aoMudar, aoFeito }: {
  consulta: ConsultaAluno | null;
  contexto: ContextoDaConsulta | null;
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  aoFeito: () => void;
}) {
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  useEffect(() => {
    if (aberto) {
      setEscolhido(null);
      setErro("");
    }
  }, [aberto, consulta?.id]);
  const msg = consulta && contexto
    ? mensagemReagendar({ regras: contexto.regras, reagendamentos: consulta.reagendamentos ?? 0, mesRef: mesDaConsulta(consulta), hoje: hojeSP(), inicio: consulta.inicio, profissional: contexto.profissional, pacote: contexto.pacote })
    : null;
  const q = useQuery({
    queryKey: ["agenda-aluno-horarios", "reagendar", consulta?.id ?? ""],
    queryFn: () => horariosParaReagendar(consulta!.id),
    enabled: aberto && !!consulta && !!msg?.pode,
    staleTime: 10_000,
    retry: 1,
  });

  const reagendar = async () => {
    if (!consulta || !escolhido) return;
    setEnviando(true);
    setErro("");
    try {
      await reagendarConsulta(consulta.id, escolhido);
      toast.success(`Consulta reagendada para ${quandoConsulta(escolhido)}.`);
      aoFeito();
      aoMudar(false);
    } catch (e) {
      setErro(mensagemErroAgenda(e));
      void q.refetch();
    } finally {
      setEnviando(false);
    }
  };

  return (
    <PainelDeslizante aberto={aberto} aoMudar={aoMudar} titulo={msg?.titulo ?? "Reagendar consulta"}>
      {consulta && msg && (
        <div className="flex flex-col gap-4 pt-1" data-sheet-reagendar={consulta.id} data-pode={msg.pode ? "1" : "0"}>
          <Aviso tom="ambar" texto={msg.texto} marca="mensagem-reagendar" />
          <p className="text-[12.5px] text-texto-2">Está marcada para <b className="text-texto">{quandoConsulta(consulta.inicio)}</b>.</p>
          {msg.pode && (
            <>
              <EscolherHorario horarios={q.data?.horarios ?? []} carregando={q.isLoading} erro={q.isError ? mensagemErroAgenda(q.error) : null} valor={escolhido} aoEscolher={setEscolhido} />
              {erro && <MensagemForm data-reagendar-erro>{erro}</MensagemForm>}
              <Botao variante="w" icone={Repeat} disabled={!escolhido || enviando} onClick={() => void reagendar()} data-reagendar-confirmar>
                {enviando ? "Reagendando…" : escolhido ? `Reagendar para ${quandoConsulta(escolhido)}` : "Escolha o novo horário"}
              </Botao>
            </>
          )}
        </div>
      )}
    </PainelDeslizante>
  );
}

export function SheetDesistir({ consulta, contexto, aberto, aoMudar, aoFeito }: {
  consulta: ConsultaAluno | null;
  contexto: ContextoDaConsulta | null;
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  aoFeito: () => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  useEffect(() => {
    if (aberto) setErro("");
  }, [aberto]);
  const msg = consulta && contexto
    ? mensagemDesistir({ regras: contexto.regras, reagendamentos: consulta.reagendamentos ?? 0, mesRef: mesDaConsulta(consulta), hoje: hojeSP(), inicio: consulta.inicio, profissional: contexto.profissional, pacote: contexto.pacote, outrasNoMes: contexto.outrasNoMes })
    : null;

  const desistir = async () => {
    if (!consulta) return;
    setEnviando(true);
    setErro("");
    try {
      await desistirConsulta(consulta.id);
      toast.success("Você desistiu da consulta. O seu profissional foi avisado.");
      aoFeito();
      aoMudar(false);
    } catch (e) {
      setErro(mensagemErroAgenda(e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <PainelDeslizante aberto={aberto} aoMudar={aoMudar} titulo={msg?.titulo ?? "Desistir da consulta?"}>
      {consulta && msg && (
        <div className="flex flex-col gap-4 pt-1" data-sheet-desistir={consulta.id} data-pode={msg.pode ? "1" : "0"}>
          <Aviso tom="rosa" texto={msg.texto} marca="mensagem-desistir" />
          {erro && <MensagemForm data-desistir-erro>{erro}</MensagemForm>}
          {msg.pode && (
            <button type="button" onClick={() => void desistir()} disabled={enviando}
              className="pq-botao pq-botao-g !border-[rgba(244,63,94,.4)] !text-rosa-3 hover:!bg-[rgba(244,63,94,.08)]" data-desistir-confirmar>
              <CalendarX2 aria-hidden /> {enviando ? "Desistindo…" : "Desistir da consulta"}
            </button>
          )}
          <Botao variante="g" onClick={() => aoMudar(false)} data-desistir-voltar>Voltar</Botao>
        </div>
      )}
    </PainelDeslizante>
  );
}

export function SheetMarcar({ prof, aberto, aoMudar, aoFeito }: {
  prof: ProfissionalDaAgenda | null;
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  aoFeito: () => void;
}) {
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  useEffect(() => {
    if (aberto) {
      setEscolhido(null);
      setErro("");
    }
  }, [aberto, prof?.profissional_id]);
  const q = useQuery({
    queryKey: ["agenda-aluno-horarios", "marcar", prof?.profissional_id ?? ""],
    queryFn: () => horariosParaMarcar(prof!.profissional_id),
    enabled: aberto && !!prof,
    staleTime: 10_000,
    retry: 1,
  });

  const marcar = async () => {
    if (!prof || !escolhido) return;
    setEnviando(true);
    setErro("");
    try {
      await marcarConsulta(prof.profissional_id, escolhido);
      toast.success(`Consulta marcada para ${quandoConsulta(escolhido)}.`);
      aoFeito();
      aoMudar(false);
    } catch (e) {
      setErro(mensagemErroAgenda(e));
      void q.refetch();
    } finally {
      setEnviando(false);
    }
  };

  const p = prof?.pacote ?? null;
  return (
    <PainelDeslizante aberto={aberto} aoMudar={aoMudar} titulo="Marcar consulta">
      {prof && (
        <div className="flex flex-col gap-4 pt-1" data-sheet-marcar={prof.profissional_id}>
          <Aviso tom="violeta" marca="mensagem-marcar"
            texto={`${p ? `${textoPacote(p)} com ${prof.profissional ?? "o seu profissional"} (${periodoDoPacote(p)}). ` : ""}Escolha 1 horário: a consulta do mês fica marcada e ${prof.profissional ?? "o profissional"} é avisado.`} />
          <EscolherHorario horarios={q.data?.horarios ?? []} carregando={q.isLoading} erro={q.isError ? mensagemErroAgenda(q.error) : null} valor={escolhido} aoEscolher={setEscolhido} />
          {erro && <MensagemForm data-marcar-erro>{erro}</MensagemForm>}
          <Botao variante="w" icone={CalendarCheck} disabled={!escolhido || enviando} onClick={() => void marcar()} data-marcar-confirmar>
            {enviando ? "Marcando…" : escolhido ? `Marcar ${quandoConsulta(escolhido)}` : "Escolha o horário"}
          </Botao>
        </div>
      )}
    </PainelDeslizante>
  );
}
