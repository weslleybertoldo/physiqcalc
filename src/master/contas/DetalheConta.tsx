import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight, BellRing, CalendarClock, CalendarPlus, CreditCard, ExternalLink, Gem, HandCoins, Lock, LockOpen, PauseCircle, PlayCircle,
  ShieldCheck, ShieldOff, Trash2, Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { ConfirmarPerigo } from "@/ferramentas/Confirmar";
import { Avatar } from "@/ui/premium/Avatar";
import { Botao } from "@/ui/premium/Botao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoCarregando, EstadoErro } from "@/ui/premium/Estados";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { detalheConta, ErroMaster, tornarMaster } from "../api";
import { ChipLegada, ChipOrigem, ChipSituacao, ChipsModulos, Info } from "../pecas/ui";
import {
  LEGADA, MASTER_NUTRI_ANTIGO, ROTULO_FAIXA, ROTULO_PLANO, ROTULO_RECEBIMENTO, acoesDaConta, dataCurta, dataHora, linhaAlunos, linhaVencimento, moeda,
  textoErro, type AcaoMaster,
} from "../regras";
import type { ContaLinha, EventoConta, Membro } from "../tipos";
import { AcaoContaDialog } from "./AcaoContaDialog";
import { CobrancaLegadaCalc } from "./CobrancaLegadaCalc";

const BOTOES: Partial<Record<AcaoMaster, { rotulo: string; icone: LucideIcon; perigo?: boolean }>> = {
  plano: { rotulo: "Mudar plano", icone: Gem },
  vencimento: { rotulo: "Ajustar vencimento", icone: CalendarClock },
  liberar: { rotulo: "Liberar até…", icone: CalendarPlus },
  registrar_pagamento: { rotulo: "Registrar pagamento", icone: HandCoins },
  isentar: { rotulo: "Isentar", icone: ShieldCheck },
  tirar_isencao: { rotulo: "Tirar isenção", icone: ShieldOff },
  suspender: { rotulo: "Suspender", icone: PauseCircle, perigo: true },
  reativar: { rotulo: "Reativar", icone: PlayCircle },
  bloquear_alunos: { rotulo: "Bloquear alunos", icone: Lock, perigo: true },
  desbloquear_alunos: { rotulo: "Desbloquear alunos", icone: LockOpen },
  reenviar_aviso: { rotulo: "Reenviar aviso", icone: BellRing },
  cancelar_assinatura: { rotulo: "Cancelar cobrança no cartão", icone: CreditCard, perigo: true },
  mover_alunos: { rotulo: "Mover alunos", icone: ArrowLeftRight },
  excluir: { rotulo: "Excluir conta", icone: Trash2, perigo: true },
};

const PAPEL: Record<string, string> = { dono: "Dono", personal: "Personal", nutricionista: "Nutricionista" };

function resumoEvento(e: EventoConta): string {
  const d = (e.depois ?? {}) as Record<string, unknown>;
  const w = (d.w27 ?? d.w13) as string | undefined;
  if (e.tipo === "pagamento") return `Pagamento ${moeda(d.valor as number)} · vale até ${dataCurta(d.vence_em as string)}`;
  if (e.tipo === "plano" && d.criada_por) return `Conta criada (${d.criada_por === "master" ? "pelo master" : "Sou profissional"})`;
  if (e.tipo === "plano" && d.plano) return `Plano: ${ROTULO_PLANO[d.plano as keyof typeof ROTULO_PLANO] ?? d.plano} · ${ROTULO_FAIXA[d.faixa as keyof typeof ROTULO_FAIXA] ?? d.faixa ?? ""}`;
  if (e.tipo === "plano" && d.assinatura) return `Cobrança no cartão: ${d.assinatura}`;
  if (e.tipo === "isencao") return d.isenta_motivo ? `Isenta: ${d.isenta_motivo}` : "Isenção retirada";
  if (e.tipo === "vencimento") return `${d.acao === "liberar" ? "Liberado" : "Vencimento"} até ${dataCurta(d.vence_em as string)}${d.motivo ? ` · ${d.motivo}` : ""}`;
  if (e.tipo === "situacao") return `Situação: ${d.situacao}${d.motivo ? ` · ${d.motivo}` : ""}`;
  if (e.tipo === "aviso") return `Aviso ao dono: ${d.titulo ?? ""}`;
  if (w === "bloquear_alunos") return "Alunos bloqueados";
  if (w === "desbloquear_alunos") return "Alunos desbloqueados";
  if (w === "recebimento") return `Recebimento: ${ROTULO_RECEBIMENTO[d.recebimento_modo as string] ?? d.recebimento_modo}`;
  if (w === "aluno_saiu") return "Um aluno foi movido para outra conta";
  if (w === "aluno_entrou") return "Um aluno veio de outra conta";
  if (w === "alunos_movidos") return `${d.quantos} aluno(s) movido(s) para esta conta`;
  if (w === "aluno_criado") return "Aluno novo";
  if (w) return w.replace(/_/g, " ");
  return e.tipo;
}

/** Folha com tudo de uma conta (C56): situação, plano, vencimento, membros (R6), faturas, linha do tempo e as ações do master. */
export function DetalheConta({ contaId, aoFechar, aoMudou }: { contaId: string | null; aoFechar: () => void; aoMudou?: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [acao, setAcao] = useState<AcaoMaster | null>(null);
  const [legada, setLegada] = useState(false);
  const [paraMaster, setParaMaster] = useState<Membro | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const q = useQuery({ queryKey: ["master-conta", contaId], queryFn: () => detalheConta(contaId!), enabled: Boolean(contaId), staleTime: 10_000 });
  const d = q.data;
  const c: ContaLinha | undefined = d?.conta;

  const recarregar = () => {
    void q.refetch();
    void qc.invalidateQueries({ queryKey: ["master"] });
    aoMudou?.();
  };

  async function promover() {
    if (!paraMaster?.user_id) return;
    setOcupado(true);
    try {
      await tornarMaster(paraMaster.user_id);
      toast.success(`${paraMaster.nome ?? "A pessoa"} agora é master (nos 2 bancos).`);
      setParaMaster(null);
      recarregar();
    } catch (e) {
      toast.error(textoErro(e instanceof ErroMaster ? e.codigo : "erro_interno"));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <PainelDeslizante aberto={Boolean(contaId)} aoMudar={(a) => !a && aoFechar()} lado="direita" titulo={c?.nome ?? "Conta"}
      className="w-[min(620px,96vw)]" descricao={c ? `${c.dono?.nome ?? "Sem dono"} · ${c.dono?.email ?? ""}` : undefined}>
      <div data-detalhe-conta={contaId ?? ""}>
        {q.isLoading && <EstadoCarregando linhas={6} />}
        {q.isError && <EstadoErro texto={textoErro(q.error instanceof ErroMaster ? q.error.codigo : "erro_interno")} aoTentar={() => void q.refetch()} />}
        {c && d && (
          <div className="flex flex-col gap-4 pb-2">
            <div className="flex flex-wrap items-center gap-1.5" data-detalhe-chips>
              <ChipSituacao conta={c} />
              <ChipsModulos modulos={c.modulos} />
              <ChipOrigem origem={c.origem} />
              {c.cobranca_legada && <ChipLegada />}
              {/* W28: a legada no núcleo com o preço e as regras de hoje (até trocar de plano) */}
              {!c.cobranca_legada && c.regras_legadas && <Chip tom="g" data-chip-regras-legadas>Preço e regras de hoje</Chip>}
              {c.alunos_bloqueados_em && <Chip tom="r" icone={Lock}>Alunos bloqueados</Chip>}
            </div>

            {c.cobranca_legada && (
              <div className="rounded-2xl border border-ambar/30 px-3.5 py-3 text-[13px] text-texto-2" style={{ background: "linear-gradient(90deg,var(--p-chip-a-fundo),transparent)" }}
                data-aviso-legada={c.origem}>
                <b className="text-texto">{LEGADA}.</b>{" "}
                {c.origem === "legado_calc"
                  ? "O ciclo, o plano e a tolerância de 7 dias desta conta continuam no Financeiro antigo do PhysiqCalc (Banco do Treino) até a virada."
                  : "A assinatura desta conta continua no site antigo do PhysiqNutri até a virada."}
                <div className="mt-2">
                  {c.origem === "legado_calc"
                    ? <Botao tamanho="sm" icone={ExternalLink} onClick={() => setLegada(true)} data-abrir-legada-calc>Abrir no Financeiro antigo</Botao>
                    : <a href={MASTER_NUTRI_ANTIGO} target="_blank" rel="noreferrer" className="pq-botao pq-botao-g pq-botao-sm" data-abrir-legada-nutri><ExternalLink aria-hidden />Abrir no site antigo</a>}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-detalhe-info>
              <Info rotulo="Plano">{ROTULO_PLANO[c.plano]}</Info>
              <Info rotulo="Faixa">{ROTULO_FAIXA[c.faixa]}</Info>
              <Info rotulo="Valor mensal">{c.cobranca_legada && c.origem === "legado_calc" ? "No Calc" : moeda(c.valor_mensal)}</Info>
              <Info rotulo="Vencimento" data-detalhe-vencimento>{linhaVencimento(c)}</Info>
              <Info rotulo="Alunos ativos">{linhaAlunos(c)}</Info>
              <Info rotulo="Recebe dos alunos">{ROTULO_RECEBIMENTO[c.recebimento_modo] ?? c.recebimento_modo}</Info>
              <Info rotulo="Cobrança no cartão">{c.assinatura ? `${c.assinatura.status}${c.assinatura.valor ? ` · ${moeda(c.assinatura.valor)}` : ""}` : "Não"}</Info>
              <Info rotulo="Membros">{c.membros}{c.convidados ? ` (+${c.convidados} convite)` : ""}</Info>
              <Info rotulo="Criada em">{dataCurta(c.criado_em)}</Info>
            </div>
            {c.alunos_bloqueados_em && (
              <p className="rounded-2xl border border-rosa/30 bg-[rgba(244,63,94,.06)] px-3.5 py-2.5 text-[13px] text-texto-2" data-detalhe-bloqueio>
                Alunos bloqueados desde {dataHora(c.alunos_bloqueados_em)}{c.alunos_bloqueados_msg ? `: "${c.alunos_bloqueados_msg}"` : ""}
              </p>
            )}

            <div className="flex flex-wrap gap-2" data-detalhe-acoes>
              {acoesDaConta(c).map((a) => {
                const b = BOTOES[a];
                if (!b) return null;
                return (
                  <Botao key={a} tamanho="sm" icone={b.icone} data-acao={a}
                    className={b.perigo ? "!border-[rgba(244,63,94,.35)] !text-rosa-3 hover:!bg-[rgba(244,63,94,.08)]" : undefined}
                    onClick={() => (a === "mover_alunos" ? navigate(`/master/alunos?conta=${encodeURIComponent(c.id)}`) : setAcao(a))}>
                    {b.rotulo}
                  </Botao>
                );
              })}
            </div>

            <section data-detalhe-membros>
              <h3 className="mb-2 flex items-center gap-2 font-body text-[13.5px] font-semibold normal-case tracking-[-0.01em] text-texto"><Users aria-hidden className="h-4 w-4 text-texto-3" />Membros ({d.membros.length})</h3>
              <div className="flex flex-col divide-y divide-linha-3 rounded-2xl border border-linha">
                {d.membros.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 px-3 py-2.5" data-membro={m.email ?? m.id}>
                    <Avatar nome={m.nome ?? m.email ?? "?"} tamanho={32} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-semibold text-texto">{m.nome ?? m.email}{m.master && <span className="ml-1.5 text-[11px] font-bold text-violeta-3">MASTER</span>}</div>
                      <div className="truncate text-[12px] text-texto-3">{m.email} · {m.papeis.map((p) => PAPEL[p] ?? p).join(" + ")} · {m.status === "convidado" ? "convite pendente" : `${m.alunos} aluno(s)`}</div>
                    </div>
                    {m.user_id && !m.master && m.status === "ativo" && (
                      <Botao tamanho="sm" onClick={() => setParaMaster(m)} data-tornar-master={m.email ?? ""}>Tornar master</Botao>
                    )}
                  </div>
                ))}
                {d.membros.length === 0 && <p className="px-3 py-3 text-[13px] text-texto-3">Nenhum membro.</p>}
              </div>
            </section>

            <section data-detalhe-faturas>
              <h3 className="mb-2 font-body text-[13.5px] font-semibold normal-case tracking-[-0.01em] text-texto">Faturas</h3>
              {d.faturas.length === 0 ? <p className="text-[13px] text-texto-3">Nenhuma fatura ainda.</p> : (
                <div className="flex flex-col divide-y divide-linha-3 rounded-2xl border border-linha">
                  {d.faturas.slice(0, 8).map((f) => (
                    <div key={f.id} className="flex items-center gap-3 px-3 py-2 text-[13px]" data-fatura={f.status}>
                      <span className="w-[86px] flex-none text-texto-3">{dataCurta(f.pago_em ?? f.criado_em)}</span>
                      <span className="min-w-0 flex-1 truncate text-texto-2">{f.descricao ?? f.tipo}{f.registrado_por ? ` · ${f.registrado_por}` : ""}</span>
                      <b className="tabular-nums text-texto">{moeda(f.valor)}</b>
                      <Chip tom={f.status === "approved" ? "n" : f.status === "pending" ? "a" : "g"}>{f.status === "approved" ? "Paga" : f.status === "pending" ? "Aberta" : f.status}</Chip>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section data-detalhe-eventos>
              <h3 className="mb-2 font-body text-[13.5px] font-semibold normal-case tracking-[-0.01em] text-texto">Linha do tempo</h3>
              <ol className="flex flex-col gap-1.5">
                {d.eventos.slice(0, 12).map((e) => (
                  <li key={e.id} className="flex gap-3 text-[12.5px]">
                    <span className="w-[118px] flex-none text-texto-3">{dataHora(e.em)}</span>
                    <span className="min-w-0 flex-1 text-texto-2">{resumoEvento(e)}{e.por ? <span className="text-texto-3"> · {e.por}</span> : null}</span>
                  </li>
                ))}
                {d.eventos.length === 0 && <li className="text-[13px] text-texto-3">Nada registrado ainda.</li>}
              </ol>
            </section>
          </div>
        )}
      </div>
      <AcaoContaDialog conta={c ?? null} acao={acao} aoFechar={() => setAcao(null)}
        aoFeito={() => { const fechou = acao === "excluir"; setAcao(null); recarregar(); if (fechou) aoFechar(); }} />
      {/* o Financeiro antigo do Calc só enquanto a cobrança da conta é a antiga (W28: depois da virada, a do núcleo) */}
      {c?.cobranca_legada && c.origem === "legado_calc" && <CobrancaLegadaCalc aberta={legada} aoMudar={setLegada} conta={c} />}
      <ConfirmarPerigo aberto={Boolean(paraMaster)} aoMudar={(a) => !a && setParaMaster(null)} titulo="Tornar master?" rotulo="Tornar master" ocupado={ocupado}
        texto={`${paraMaster?.nome ?? paraMaster?.email ?? ""} passa a ver e mudar TODAS as contas e alunos, nos 2 bancos. Tirar o master depois é à mão.`}
        aoConfirmar={() => void promover()} data-confirmar-tornar-master />
    </PainelDeslizante>
  );
}
