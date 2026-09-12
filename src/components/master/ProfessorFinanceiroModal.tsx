import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Receipt, Trash2, Undo2, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ComprovanteModal from "@/components/ComprovanteModal";
import { METODOS_MANUAIS, tipoPagamentoLabel, type MpPagamento } from "@/lib/mpClient";
import {
  fmtBRL, fmtData, fmtDataHora, masterFinanceiro, planoComValor, type AvisoPlano, type FinanceiroLinha,
} from "@/lib/saasApi";
import DefinirPlanoDialog from "@/components/master/DefinirPlanoDialog";
import { BloquearAlunosDialog, LiberarAcessoDialog, ReenviarAvisoDialog } from "@/components/master/AcoesFinanceiroDialogs";
import {
  ASSINATURA_STATUS_LABEL, BTN_MINI_NEUTRO, BTN_MINI_PERIGO, BTN_MINI_PRIMARIO, BTN_NEUTRO, BTN_PRIMARIO, Campo, Carregando, DIALOG_CONTENT,
  Dado, ErroCarregar, Etiqueta, INPUT, INTEGRACAO_LABEL, PAGAMENTO_STATUS_LABEL, SELECT_CONTENT, SELECT_TRIGGER, TIPO_COBRANCA_LABEL,
  alunosTexto, cicloTexto, hojeISO, mensagemErro, numOuNull, resumoHistorico, situacaoInfo, useConfirmacao, usePlanosMaster,
} from "@/components/master/masterUi";

interface Assinatura { id: string; status: string; valor: number | string; created_at: string; updated_at?: string }
interface HistItem { id: number | string; plano_id: string | null; alterado_por: string | null; alterado_em: string; antes: unknown; depois: unknown }
export interface DetalheFinanceiro {
  professor: FinanceiroLinha;
  assinatura: Assinatura | null;
  assinaturas: Assinatura[];
  pagamentos: MpPagamento[];
  avisos: AvisoPlano[];
  historico: HistItem[];
  integracao: string;
  integracaoConfig?: Record<string, unknown>;
  tolerancia: number;
  hoje: string;
}

interface Props {
  userId: string | null;
  onClose: () => void;
  /** depois de qualquer ação (a lista/resumo da página recarrega) */
  onChanged: () => void;
}

type Painel = null | "pagamento" | "ciclo";
type TipoCobranca = "adesao" | "mensal" | "anual";
interface CicloForm { adesao_paga_em: string; trial_ate: string; ciclo_inicio: string; ciclo_vence_em: string; anual_ate: string; ciclo_valor: string }
const CICLO_DATAS: { k: Exclude<keyof CicloForm, "ciclo_valor">; label: string }[] = [
  { k: "adesao_paga_em", label: "Adesão paga em" },
  { k: "trial_ate", label: "Teste grátis até" },
  { k: "ciclo_inicio", label: "Ciclo início" },
  { k: "ciclo_vence_em", label: "Ciclo vence em" },
  { k: "anual_ate", label: "Anual até" },
];
const EFEITO_REGISTRO: Record<TipoCobranca, string> = {
  adesao: "Marca a adesão como paga e abre um ciclo de 30 dias a partir da data.",
  mensal: "Estende o ciclo em 1 mês (a partir do vencimento atual, se ainda não venceu; senão, da data).",
  anual: "Marca o anual pago por 1 ano a partir da data.",
};
const cicloDoProfessor = (p: FinanceiroLinha): CicloForm => ({
  adesao_paga_em: p.adesaoPagaEm ?? "", trial_ate: p.trialAte ?? "", ciclo_inicio: p.cicloInicio ?? "",
  ciclo_vence_em: p.cicloVenceEm ?? "", anual_ate: p.anualAte ?? "", ciclo_valor: p.cicloValor == null ? "" : String(Number(p.cicloValor)),
});

// Modal do professor no Financeiro: detalhe completo + TODAS as ações do master-financeiro.
export default function ProfessorFinanceiroModal({ userId, onClose, onChanged }: Props) {
  const [det, setDet] = useState<DetalheFinanceiro | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [painel, setPainel] = useState<Painel>(null);
  const [comprovante, setComprovante] = useState<MpPagamento | null>(null);
  const [liberar, setLiberar] = useState(false);
  const [bloquear, setBloquear] = useState(false);
  const [aviso, setAviso] = useState(false);
  const [mudarPlano, setMudarPlano] = useState(false);
  const { planos, regras } = usePlanosMaster(!!userId);
  const { confirmar, dialogo } = useConfirmacao();

  const carregar = useCallback(async (id: string, silencioso = false) => {
    if (!silencioso) { setLoading(true); setDet(null); }
    setErro(null);
    try {
      setDet(await masterFinanceiro<DetalheFinanceiro>("detalhe", { userId: id }));
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    setPainel(null); setComprovante(null);
    void carregar(userId);
  }, [userId, carregar]);

  const recarregar = async () => {
    if (userId) await carregar(userId, true);
    onChanged();
  };
  const rodar = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await recarregar();
      return true;
    } catch (e) {
      toast.error(mensagemErro(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const p = det?.professor ?? null;
  const hoje = det?.hoje ?? hojeISO();
  const planoAtual = p?.plano ? planos.find((x) => x.id === p.plano!.id) ?? null : null;
  const nomePlano = (id: string | null | undefined) => (id ? planos.find((x) => x.id === id)?.nome ?? "plano removido" : "sem plano");
  const assinaturaAtiva = !!det?.assinatura && ["authorized", "pending", "paused"].includes(det.assinatura.status);
  const liberado = !!(p?.acessoLiberadoAte && p.acessoLiberadoAte >= hoje);

  // ── registrar pagamento ──
  const [regTipo, setRegTipo] = useState<TipoCobranca>("mensal");
  const [regValor, setRegValor] = useState("");
  const [regMetodo, setRegMetodo] = useState("pix");
  const [regData, setRegData] = useState(hojeISO());
  const valorSugerido = (tipo: TipoCobranca): number | null => {
    if (tipo === "adesao") return regras?.adesao_professor ?? null;
    if (tipo === "mensal") return p?.plano?.valorMensal ?? (p?.cicloValor != null ? Number(p.cicloValor) : null);
    return planoAtual?.valor_anual_efetivo ?? (p?.plano ? Number((p.plano.valorMensal * 10).toFixed(2)) : null);
  };
  const abrirRegistro = () => {
    const v = valorSugerido("mensal");
    setRegTipo("mensal"); setRegValor(v == null ? "" : String(v)); setRegMetodo("pix"); setRegData(hojeISO());
    setPainel("pagamento");
  };
  const trocarTipo = (t: TipoCobranca) => {
    setRegTipo(t);
    const v = valorSugerido(t);
    setRegValor(v == null ? "" : String(v));
  };
  const registrar = async () => {
    if (!userId) return;
    const valor = numOuNull(regValor);
    if (valor == null || valor <= 0) { toast.error("Informe o valor do pagamento."); return; }
    if (!regData) { toast.error("Informe a data do pagamento."); return; }
    if (regData > hojeISO()) { toast.error("A data não pode ser no futuro."); return; }
    const metodoLabel = METODOS_MANUAIS.find((m) => m.value === regMetodo)?.label || regMetodo;
    const ok = await confirmar({
      titulo: "Registrar pagamento?",
      descricao: `${TIPO_COBRANCA_LABEL[regTipo]} · ${fmtBRL(valor)} · ${fmtData(regData)} · ${metodoLabel}. ${EFEITO_REGISTRO[regTipo]}`,
      confirmar: "Registrar",
    });
    if (!ok) return;
    if (await rodar(() => masterFinanceiro("registrar-pagamento", { userId, tipoCobranca: regTipo, valor, metodo: regMetodo, data: regData }), "Pagamento registrado.")) setPainel(null);
  };

  // ── ajustar ciclo ──
  const [ciclo, setCiclo] = useState<CicloForm>({ adesao_paga_em: "", trial_ate: "", ciclo_inicio: "", ciclo_vence_em: "", anual_ate: "", ciclo_valor: "" });
  const abrirCiclo = () => { if (p) { setCiclo(cicloDoProfessor(p)); setPainel("ciclo"); } };
  const salvarCiclo = async () => {
    if (!userId || !p) return;
    const orig = cicloDoProfessor(p);
    const patch: Record<string, unknown> = {};
    for (const { k } of CICLO_DATAS) if (ciclo[k] !== orig[k]) patch[k] = ciclo[k] || null;
    if (ciclo.ciclo_valor !== orig.ciclo_valor) {
      const v = ciclo.ciclo_valor.trim() === "" ? null : numOuNull(ciclo.ciclo_valor);
      if (ciclo.ciclo_valor.trim() !== "" && v == null) { toast.error("Valor do ciclo inválido."); return; }
      patch.ciclo_valor = v;
    }
    if (!Object.keys(patch).length) { toast.info("Nada mudou."); return; }
    if (await rodar(() => masterFinanceiro("set-ciclo", { userId, ...patch }), "Ciclo ajustado.")) setPainel(null);
  };

  // ── demais ações ──
  const pausar = async (pausarAgora: boolean) => {
    if (!userId || !p) return;
    const ok = await confirmar({
      titulo: pausarAgora ? `Pausar a cobrança de ${p.nome}?` : `Retomar a cobrança de ${p.nome}?`,
      descricao: pausarAgora
        ? "Ele fica com acesso liberado e sem avisos enquanto pausado (a assinatura no cartão, se houver, continua — cancele também se for o caso)."
        : "Volta a valer o ciclo e a tolerância normais.",
      confirmar: pausarAgora ? "Pausar" : "Retomar",
    });
    if (ok) await rodar(() => masterFinanceiro("pausar-cobranca", { userId, pausar: pausarAgora }), pausarAgora ? "Cobrança pausada." : "Cobrança retomada.");
  };
  const removerLiberacao = async () => {
    if (!userId || !p) return;
    if (await confirmar({ titulo: "Remover a liberação de acesso?", descricao: "Volta a valer a régua normal (ciclo + tolerância) imediatamente.", confirmar: "Remover", perigo: true })) {
      await rodar(() => masterFinanceiro("liberar-acesso-ate", { userId, ate: null }), "Liberação removida.");
    }
  };
  const cancelarAssinatura = async () => {
    if (!userId || !p) return;
    if (await confirmar({ titulo: `Cancelar a assinatura de ${p.nome}?`, descricao: "A cobrança automática no cartão para imediatamente (no Mercado Pago também). O ciclo atual continua até vencer.", confirmar: "Cancelar assinatura", perigo: true })) {
      await rodar(() => masterFinanceiro("cancelar-assinatura", { userId }), "Assinatura cancelada.");
    }
  };
  const desbloquear = async () => {
    if (!userId || !p) return;
    if (await confirmar({ titulo: `Desbloquear os alunos de ${p.nome}?`, descricao: "Os alunos dele voltam a usar o app normalmente.", confirmar: "Desbloquear" })) {
      await rodar(() => masterFinanceiro("desbloquear-alunos", { userId }), "Alunos desbloqueados.");
    }
  };
  const removerManual = async (pg: MpPagamento) => {
    if (await confirmar({
      titulo: `Remover este pagamento manual de ${fmtBRL(pg.valor)}?`,
      descricao: "Só a linha é apagada — as datas do ciclo NÃO voltam sozinhas. Ajuste em \"Ajustar ciclo\" se precisar.",
      confirmar: "Remover", perigo: true,
    })) {
      await rodar(() => masterFinanceiro("remover-manual", { pagamentoId: pg.id }), "Pagamento manual removido. Confira as datas do ciclo.");
    }
  };
  const reembolsar = async (pg: MpPagamento) => {
    if (await confirmar({ titulo: `Reembolsar ${fmtBRL(pg.valor)} no Mercado Pago?`, descricao: "O estorno é feito na hora e não pode ser desfeito. O ciclo do professor não muda sozinho.", confirmar: "Reembolsar", perigo: true })) {
      await rodar(() => masterFinanceiro("refund", { pagamentoId: pg.id }), `Reembolso de ${fmtBRL(pg.valor)} solicitado.`);
    }
  };

  const statusCls = (s: string) => (s === "approved" ? "text-primary" : s === "refunded" || s === "rejected" || s === "charged_back" ? "text-destructive" : "text-muted-foreground");

  return (
    <>
      <Dialog open={!!userId} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent
          className={`${DIALOG_CONTENT} max-w-lg`}
          data-modal-financeiro={userId ?? undefined}
          // o comprovante fica num portal fora deste conteúdo: não deixar o clique nele fechar o modal
          onPointerDownOutside={(e) => { if (comprovante) e.preventDefault(); }}
          onInteractOutside={(e) => { if (comprovante) e.preventDefault(); }}
          onEscapeKeyDown={(e) => { if (comprovante) { e.preventDefault(); setComprovante(null); } }}
        >
          <DialogHeader className="text-left">
            <DialogTitle className="font-heading text-foreground uppercase tracking-wider text-base break-words">{p?.nome ?? "Professor"}</DialogTitle>
            <DialogDescription className="font-body text-xs break-all">
              {p ? <>{p.email ?? "—"} · <span className="font-heading tracking-wider">{p.codigo}</span></> : loading ? "Carregando..." : ""}
            </DialogDescription>
          </DialogHeader>

          {loading && <Carregando />}
          {erro && <ErroCarregar texto={erro} onRetry={() => userId && void carregar(userId)} />}

          {p && det && (
            <div className={`space-y-5 ${busy ? "opacity-70 pointer-events-none" : ""}`}>
              {/* situação */}
              <div className="flex flex-wrap gap-1.5" data-badges>
                <Etiqueta cls={situacaoInfo(p.situacao).cls}>{situacaoInfo(p.situacao).label}</Etiqueta>
                {p.recorrente && <Etiqueta tom="info">recorrente</Etiqueta>}
                {p.alunosBloqueadosEm && <Etiqueta tom="ruim">alunos bloqueados</Etiqueta>}
                {p.cobrancaPausada && <Etiqueta>cobrança pausada</Etiqueta>}
                {!p.acessoOk && <Etiqueta tom="ruim">sem acesso</Etiqueta>}
                {p.diasAtraso !== null && p.diasAtraso > 0 && (p.situacao === "travado" || p.situacao === "em_tolerancia") && (
                  <Etiqueta tom="aviso">{p.diasAtraso} d de atraso</Etiqueta>
                )}
              </div>

              {/* dados */}
              <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-x-6">
                <div>
                  <Dado k="Plano" v={planoComValor(p.plano)} destaque />
                  <Dado k="Alunos" v={alunosTexto(p.alunos, p.plano?.maxAlunos)} />
                  <Dado k="Recebimento" v={INTEGRACAO_LABEL[det.integracao] ?? det.integracao} />
                  <Dado k="Ciclo" v={cicloTexto(p)} />
                  <Dado k="Valor do ciclo" v={fmtBRL(p.cicloValor)} />
                  <Dado k="Assinatura" v={det.assinatura ? `${ASSINATURA_STATUS_LABEL[det.assinatura.status] ?? det.assinatura.status} · ${fmtBRL(det.assinatura.valor)}/mês` : "—"} />
                </div>
                <div>
                  <Dado k="Adesão paga em" v={fmtData(p.adesaoPagaEm)} />
                  <Dado k="Teste grátis até" v={fmtData(p.trialAte)} />
                  <Dado k="Vence em" v={fmtData(p.cicloVenceEm)} />
                  <Dado k="Anual até" v={fmtData(p.anualAte)} />
                  <Dado k="Liberado até" v={fmtData(p.acessoLiberadoAte)} destaque={liberado} />
                  <Dado k="Tolerância" v={`${det.tolerancia} dias`} />
                </div>
              </div>
              {p.alunosBloqueadosEm && (
                <p className="text-xs text-destructive font-body">
                  Alunos bloqueados em {fmtDataHora(p.alunosBloqueadosEm)}{p.alunosBloqueadosMsg ? ` — "${p.alunosBloqueadosMsg}"` : ""}.
                </p>
              )}

              {/* ações */}
              <div className="flex flex-wrap gap-1.5" data-acoes>
                <button type="button" onClick={() => (painel === "pagamento" ? setPainel(null) : abrirRegistro())} className={BTN_MINI_PRIMARIO} data-btn-registrar>Registrar pagamento</button>
                <button type="button" onClick={() => (painel === "ciclo" ? setPainel(null) : abrirCiclo())} className={BTN_MINI_NEUTRO} data-btn-ajustar-ciclo>Ajustar ciclo</button>
                <button type="button" onClick={() => setMudarPlano(true)} className={BTN_MINI_NEUTRO} data-btn-mudar-plano>Mudar plano</button>
                {p.cobrancaPausada ? (
                  <button type="button" onClick={() => void pausar(false)} className={BTN_MINI_NEUTRO} data-btn-retomar>Retomar cobrança</button>
                ) : (
                  <button type="button" onClick={() => void pausar(true)} className={BTN_MINI_NEUTRO} data-btn-pausar>Pausar cobrança</button>
                )}
                <button type="button" onClick={() => setLiberar(true)} className={BTN_MINI_NEUTRO} data-btn-liberar>{liberado ? "Mudar liberação" : "Liberar acesso até…"}</button>
                {liberado && <button type="button" onClick={() => void removerLiberacao()} className={BTN_MINI_PERIGO} data-btn-remover-liberacao>Remover liberação</button>}
                <button type="button" onClick={() => setAviso(true)} className={BTN_MINI_NEUTRO} data-btn-reenviar-aviso>Reenviar aviso</button>
                {p.alunosBloqueadosEm ? (
                  <button type="button" onClick={() => void desbloquear()} className={BTN_MINI_PRIMARIO} data-btn-desbloquear>Desbloquear alunos</button>
                ) : (
                  <button type="button" onClick={() => setBloquear(true)} className={BTN_MINI_PERIGO} data-btn-bloquear>Bloquear alunos</button>
                )}
                {assinaturaAtiva && <button type="button" onClick={() => void cancelarAssinatura()} className={BTN_MINI_PERIGO} data-btn-cancelar-assinatura>Cancelar assinatura</button>}
              </div>

              {/* painel: registrar pagamento */}
              {painel === "pagamento" && (
                <div className="bg-muted/20 border border-border rounded-lg p-3 space-y-3" data-painel-pagamento>
                  <p className="text-sm text-foreground font-body">Pagamento recebido por fora do app</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Campo rotulo="Cobrança">
                      <Select value={regTipo} onValueChange={(v) => trocarTipo(v as TipoCobranca)}>
                        <SelectTrigger className={SELECT_TRIGGER} data-select-tipo-cobranca><SelectValue /></SelectTrigger>
                        <SelectContent className={SELECT_CONTENT}>
                          <SelectItem value="adesao">Adesão{regras ? ` (${fmtBRL(regras.adesao_professor)})` : ""}</SelectItem>
                          <SelectItem value="mensal">Mensal{p.plano ? ` (${fmtBRL(p.plano.valorMensal)})` : ""}</SelectItem>
                          <SelectItem value="anual">Anual{planoAtual?.valor_anual_efetivo != null ? ` (${fmtBRL(planoAtual.valor_anual_efetivo)})` : ""}</SelectItem>
                        </SelectContent>
                      </Select>
                    </Campo>
                    <Campo rotulo="Valor (R$)">
                      <input type="text" inputMode="decimal" value={regValor} onChange={(e) => setRegValor(e.target.value)} className={INPUT} data-input-valor />
                    </Campo>
                    <Campo rotulo="Método">
                      <Select value={regMetodo} onValueChange={setRegMetodo}>
                        <SelectTrigger className={SELECT_TRIGGER}><SelectValue /></SelectTrigger>
                        <SelectContent className={SELECT_CONTENT}>
                          {METODOS_MANUAIS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </Campo>
                    <Campo rotulo="Data">
                      <input type="date" value={regData} max={hojeISO()} onChange={(e) => setRegData(e.target.value)} className={INPUT} data-input-data />
                    </Campo>
                  </div>
                  <p className="text-[11px] text-muted-foreground font-body">{EFEITO_REGISTRO[regTipo]}</p>
                  <div className="flex flex-wrap gap-2 justify-end">
                    <button type="button" onClick={() => setPainel(null)} className={BTN_NEUTRO}>Cancelar</button>
                    <button type="button" onClick={() => void registrar()} className={BTN_PRIMARIO} data-btn-confirmar-registro>Confirmar registro</button>
                  </div>
                </div>
              )}

              {/* painel: ajustar ciclo */}
              {painel === "ciclo" && (
                <div className="bg-muted/20 border border-border rounded-lg p-3 space-y-3" data-painel-ciclo>
                  <p className="text-sm text-foreground font-body">Ajuste manual das datas (correções)</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {CICLO_DATAS.map(({ k, label }) => (
                      <Campo key={k} rotulo={label}>
                        <div className="flex items-center gap-1">
                          <input type="date" value={ciclo[k]} onChange={(e) => setCiclo((c) => ({ ...c, [k]: e.target.value }))} className={INPUT} data-input-ciclo={k} />
                          {ciclo[k] && (
                            <button type="button" onClick={() => setCiclo((c) => ({ ...c, [k]: "" }))} title="Limpar (fica vazio)" className="p-1 text-muted-foreground hover:text-destructive">
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      </Campo>
                    ))}
                    <Campo rotulo="Valor do ciclo (R$)" dica="Vazio = sem valor congelado (usa o do plano).">
                      <input type="text" inputMode="decimal" value={ciclo.ciclo_valor} onChange={(e) => setCiclo((c) => ({ ...c, ciclo_valor: e.target.value }))} className={INPUT} data-input-ciclo="ciclo_valor" />
                    </Campo>
                  </div>
                  <p className="text-[11px] text-muted-foreground font-body">Campo vazio é gravado como nulo. Só o que mudou é enviado.</p>
                  <div className="flex flex-wrap gap-2 justify-end">
                    <button type="button" onClick={() => setPainel(null)} className={BTN_NEUTRO}>Cancelar</button>
                    <button type="button" onClick={() => void salvarCiclo()} className={BTN_PRIMARIO} data-btn-salvar-ciclo>Salvar ciclo</button>
                  </div>
                </div>
              )}

              {/* pagamentos */}
              <section>
                <h3 className="font-heading text-xs text-muted-foreground uppercase tracking-wider mb-1">Pagamentos ({det.pagamentos.length})</h3>
                {det.pagamentos.length === 0 ? (
                  <p className="text-xs text-muted-foreground font-body">Nenhum pagamento registrado.</p>
                ) : (
                  <div data-lista-pagamentos>
                    {det.pagamentos.map((pg) => (
                      <div key={pg.id} className="flex items-center gap-1 border-b border-border/40 py-1.5 last:border-0" data-pagamento-linha={pg.id}>
                        <button type="button" onClick={() => setComprovante(pg)} className="flex-1 min-w-0 text-left hover:bg-muted/20 rounded px-1 transition-colors" title="Ver comprovante" data-btn-comprovante>
                          <p className="text-xs text-foreground font-body truncate">
                            <span className="font-heading tracking-wider">{TIPO_COBRANCA_LABEL[pg.tipo_cobranca ?? ""] ?? "Cobrança"}</span>
                            <span className="text-muted-foreground"> · {tipoPagamentoLabel(pg)} · {new Date(pg.created_at).toLocaleDateString("pt-BR")}</span>
                          </p>
                          <p className="text-[11px] font-body">
                            <span className="text-foreground">{fmtBRL(pg.valor)}</span>
                            <span className={`uppercase tracking-wider ml-2 ${statusCls(pg.status)}`}>{PAGAMENTO_STATUS_LABEL[pg.status] ?? pg.status}</span>
                            {pg.mp_payment_id && <span className="text-muted-foreground ml-2 inline-flex items-center gap-0.5"><Receipt size={10} />MP</span>}
                          </p>
                        </button>
                        {pg.status === "approved" && pg.tipo === "manual" && (
                          <button type="button" onClick={() => void removerManual(pg)} title="Remover pagamento manual" className="p-2 text-muted-foreground hover:text-destructive transition-colors" data-btn-remover-manual>
                            <Trash2 size={14} />
                          </button>
                        )}
                        {pg.status === "approved" && pg.mp_payment_id && (
                          <button type="button" onClick={() => void reembolsar(pg)} title={`Reembolsar ${fmtBRL(pg.valor)}`} className="p-2 text-muted-foreground hover:text-destructive transition-colors" data-btn-reembolsar>
                            <Undo2 size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* assinaturas */}
              {det.assinaturas.length > 0 && (
                <section>
                  <h3 className="font-heading text-xs text-muted-foreground uppercase tracking-wider mb-1">Assinaturas (cartão)</h3>
                  {det.assinaturas.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-2 border-b border-border/40 py-1.5 last:border-0 text-xs font-body" data-assinatura-linha={a.id}>
                      <span className="text-foreground">{fmtBRL(a.valor)}/mês · {new Date(a.created_at).toLocaleDateString("pt-BR")}</span>
                      <span className={a.status === "authorized" ? "text-primary" : "text-muted-foreground"}>{ASSINATURA_STATUS_LABEL[a.status] ?? a.status}</span>
                    </div>
                  ))}
                </section>
              )}

              {/* avisos */}
              <section>
                <h3 className="font-heading text-xs text-muted-foreground uppercase tracking-wider mb-1">Avisos no app ({det.avisos.length})</h3>
                {det.avisos.length === 0 ? (
                  <p className="text-xs text-muted-foreground font-body">Nenhum aviso enviado.</p>
                ) : (
                  <div data-lista-avisos>
                    {det.avisos.map((a) => (
                      <div key={a.id} className="border-b border-border/40 py-1.5 last:border-0" data-aviso-linha={a.id}>
                        <p className="text-[11px] text-muted-foreground font-body">
                          {fmtDataHora(a.enviado_em)} · {a.canal}{a.canal !== "manual" && a.canal !== "reajuste" ? ` · dia ${a.dia}` : ""} · ciclo {fmtData(a.ciclo_vence_em)}
                        </p>
                        {a.mensagem && <p className="text-xs text-foreground font-body break-words">{a.mensagem}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* histórico de plano */}
              <section>
                <h3 className="font-heading text-xs text-muted-foreground uppercase tracking-wider mb-1">Histórico de plano ({det.historico.length})</h3>
                {det.historico.length === 0 ? (
                  <p className="text-xs text-muted-foreground font-body">Sem trocas de plano.</p>
                ) : (
                  <div data-lista-historico>
                    {det.historico.map((h) => (
                      <div key={h.id} className="border-b border-border/40 py-1.5 last:border-0" data-historico-linha={h.id}>
                        <p className="text-[11px] text-muted-foreground font-body">{fmtDataHora(h.alterado_em)}{h.alterado_por === p.id ? " · pelo professor" : ""}</p>
                        <p className="text-xs text-foreground font-body break-words">{resumoHistorico(h, nomePlano)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* comprovante fora do DialogContent (o translate do Radix confinaria o `fixed`); pointer-events-auto vence o lock do body */}
      {comprovante && createPortal(
        <div className="pointer-events-auto" data-comprovante-portal>
          <ComprovanteModal pagamento={comprovante} onClose={() => setComprovante(null)} />
        </div>,
        document.body,
      )}

      <LiberarAcessoDialog alvo={liberar && p ? { id: p.id, nome: p.nome, acessoLiberadoAte: p.acessoLiberadoAte } : null} onClose={() => setLiberar(false)} onFeito={() => void recarregar()} />
      <BloquearAlunosDialog alvo={bloquear && p ? { id: p.id, nome: p.nome } : null} onClose={() => setBloquear(false)} onFeito={() => void recarregar()} />
      <ReenviarAvisoDialog alvo={aviso && p ? { id: p.id, nome: p.nome } : null} onClose={() => setAviso(false)} onFeito={() => void recarregar()} />
      <DefinirPlanoDialog professor={mudarPlano && p ? { id: p.id, nome: p.nome, alunos: p.alunos, plano: p.plano } : null} onClose={() => setMudarPlano(false)} onSalvo={() => void recarregar()} />
      {dialogo}
    </>
  );
}
