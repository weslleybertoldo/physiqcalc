import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownCircle, ArrowUpCircle, Ban, Banknote, Eye, FileDown, Pause, Play, Plus, ReceiptText, Repeat, Save, Settings2, Tags, Trash2, Undo2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Campo, MensagemForm } from "@/entrada/pecas/Campo";
import { CampoSelect } from "@/painel/configuracoes/pecas/Form";
import { useSessao } from "@/nucleo/sessao";
import { supabase } from "@/integrations/supabase/client";
import ComprovantePixCard from "@/components/admin/ComprovantePixCard";
import { Botao } from "@/ui/premium/Botao";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { Esqueleto, EstadoErro } from "@/ui/premium/Estados";
import { ErroFinanceiro } from "../api";
import { criarLancamento, garantirCategorias, listarLancamentosDoAluno, rotuloMetodoLancamento, totais, valorComSinal, type Lancamento } from "../lancamentos";
import { excluirRecibo, formatarDataRecibo, formatarNumeroRecibo, listarRecibosDoAluno, podeEmitirRecibo } from "../recibos";
import { LANCAMENTOS_MAX, LANCAMENTOS_VISIVEIS, rotaDosLancamentosDoAluno } from "@/painel/aluno/dados/regras";
import ModelosReciboDialog from "@/painel/financeiro/ModelosReciboDialog";
import { pdfDoRecibo } from "@/painel/financeiro/pdfRecibo";
import ReciboDialog from "@/painel/financeiro/ReciboDialog";
import { useFinanceiroConta } from "@/painel/financeiro/useFinanceiro";
import { chipDaMensalidade, dataBR, estadoDaMensalidade, hojeSP, lerValor, mensagemErroFinanceiro, ordenarCobrancas, reais, reaisCurto, textoDoVencimento } from "../regras";
import type { CobrancaVista, FinanceiroProfissional } from "../tipos";
import { ComprovanteVisor } from "./ComprovanteVisor";
import { DialogoLancamento, DialogoNovaCobranca, DialogoRegistrar } from "./Dialogos";
import { LinhaCobranca } from "./LinhaCobranca";
import { TagsDoAluno } from "./TagsDoAluno";
import { useFinanceiroDoAluno } from "./useFinanceiroDoAluno";

const MODO_TEXTO: Record<string, string> = { pix_manual: "Pix na chave da conta, com comprovante", mercadopago: "Mercado Pago (Pix e cartão, automático)", nenhum: "Não cobra pelo app (por fora)" };

function IconeAcao({ icone: Icone, rotulo, onClick, perigo, marca }: { icone: typeof Eye; rotulo: string; onClick: () => void; perigo?: boolean; marca?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={rotulo} title={rotulo} data-acao-cobranca={marca}
      className={`flex h-8 w-8 flex-none items-center justify-center rounded-[10px] border border-linha bg-superficie transition-colors ${perigo ? "text-texto-3 hover:text-rosa-3" : "text-texto-2 hover:text-texto"}`}>
      <Icone aria-hidden className="h-4 w-4" strokeWidth={1.8} />
    </button>
  );
}

/**
 * O Financeiro de um aluno no painel (spec 4.5, tela 7; C29, C40, C47, C97–C100, N-45, N-59): plano e valor, a situação da
 * mensalidade, cobranças (Pix com comprovante, Mercado Pago, avulsas do Nutri), confirmar/recusar o comprovante, pagamento
 * feito por fora, pausar, reembolsar e a cobrança automática, lançamentos do aluno e recibos, e as tags. Quem vê o quê: o dono
 * vê tudo; o profissional responsável vê as cobranças que criou (P6). `compacto` = dentro do popup "Cobrança" antigo.
 */
export function FinanceiroDoAluno({ alunoId, compacto = false }: { alunoId: string; compacto?: boolean }) {
  const f = useFinanceiroDoAluno(alunoId);
  const [params, setParams] = useSearchParams();
  const [comprovante, setComprovante] = useState<string | null>(null);
  const [registrar, setRegistrar] = useState<{ cobranca: CobrancaVista | null } | null>(null);
  const [novaCobranca, setNovaCobranca] = useState(false);
  const [reciboAvulso, setReciboAvulso] = useState(false);

  // "Emitir recibo" do card do Resumo abre direto aqui (?recibo=novo)
  useEffect(() => {
    if (params.get("recibo") !== "novo" || !f.data) return;
    setReciboAvulso(true);
    setParams((a) => {
      const q = new URLSearchParams(a);
      q.delete("recibo");
      return q;
    }, { replace: true });
  }, [params, f.data, setParams]);

  if (f.isLoading) {
    return (
      <div className="grid gap-3.5 xl:grid-cols-3" data-financeiro-carregando>
        {[0, 1, 2].map((i) => <Cartao key={i} className="h-[260px] p-5"><Esqueleto className="h-full w-full" /></Cartao>)}
      </div>
    );
  }
  if (f.isError || !f.data) {
    const codigo = f.error instanceof ErroFinanceiro ? f.error.codigo : null;
    return <EstadoErro titulo="Não deu para abrir o financeiro" texto={mensagemErroFinanceiro(codigo, "Confira a internet e tente de novo.")} aoTentar={() => void f.refetch()} />;
  }
  const d = f.data;
  const aguardando = d.cobrancas.filter((c) => c.status === "aguardando_confirmacao" && c.forma === "pix_manual");

  return (
    <div className="flex flex-col gap-3.5" data-financeiro-aluno={d.aluno.paciente_id}>
      <div className={compacto ? "grid gap-3.5" : "grid gap-3.5 md:grid-cols-2 xl:grid-cols-3"}>
        <CartaoMensalidade d={d} agir={f.agir} />
        <CartaoCobrancas d={d} agir={f.agir} aoVerComprovante={setComprovante} aoRegistrar={(c) => setRegistrar({ cobranca: c })}
          aoNovaCobranca={() => setNovaCobranca(true)} aoRegistrarMensalidade={() => setRegistrar({ cobranca: null })} />
        <div className="flex flex-col gap-3.5">
          {aguardando.map((c) => <ComprovantePixCard key={c.id} item={c} onResolvido={() => void f.recarregar()} />)}
          {d.assinatura && <CartaoAssinatura d={d} agir={f.agir} />}
          <TagsDoAluno pacienteId={d.aluno.paciente_id} treinoUserId={d.aluno.treino_user_id} tags={d.aluno.tags} podeEditar={d.permissoes.dono || d.permissoes.responsavel}
            aoMudou={() => void f.recarregar()} />
        </div>
      </div>
      <div className={compacto ? "grid gap-3.5" : "grid gap-3.5 xl:grid-cols-2"}>
        <CartaoLancamentosERecibos d={d} reciboAvulso={reciboAvulso} aoFecharReciboAvulso={() => setReciboAvulso(false)} aoAbrirReciboAvulso={() => setReciboAvulso(true)} />
      </div>

      <ComprovanteVisor cobrancaId={comprovante} quem="prof" aoFechar={() => setComprovante(null)} />
      <DialogoRegistrar aberto={!!registrar} aoFechar={() => setRegistrar(null)} cobranca={registrar?.cobranca ?? null} mensalidade={d.mensalidade?.valor ?? null}
        aoSalvar={async (x) => !!(await f.agir("prof_registrar", { aluno: d.aluno.paciente_id, data: x.data, metodo: x.metodo, valor: x.valor, lancar: x.lancar,
          ...(registrar?.cobranca ? { cobranca_id: registrar.cobranca.id } : {}) }, "Pagamento registrado."))} />
      <DialogoNovaCobranca aberto={novaCobranca} aoFechar={() => setNovaCobranca(false)}
        aoSalvar={async (x) => !!(await f.agir("prof_cobranca_criar", { aluno: d.aluno.paciente_id, ...x }, "Cobrança criada — o aluno já vê em Pagamentos."))} />
    </div>
  );
}

function CartaoMensalidade({ d, agir }: { d: FinanceiroProfissional; agir: ReturnType<typeof useFinanceiroDoAluno>["agir"] }) {
  const m = d.mensalidade;
  const [plano, setPlano] = useState(m?.plano_id ?? "");
  const [planoNovo, setPlanoNovo] = useState("");
  const [valor, setValor] = useState(m ? valorNoCampo(m.valor) : "");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    setPlano(d.mensalidade?.plano_id ?? "");
    setValor(d.mensalidade ? valorNoCampo(d.mensalidade.valor) : "");
  }, [d.mensalidade]);

  if (!d.permissoes.mensalidade) {
    return (
      <Cartao brilho className="p-5" data-cartao-mensalidade="sem-permissao">
        <CabecalhoCartao titulo="Mensalidade" />
        <p className="text-[13px] text-texto-2">A mensalidade deste aluno é do dono da conta. Aqui você vê e cria as cobranças que são suas.</p>
      </Cartao>
    );
  }
  const e = estadoDaMensalidade(m ? { valor: m.valor, pausada: m.pausada, pago_ate: m.pago_ate, desde: m.desde, aguardando: d.cobrancas.some((c) => c.tipo === "mensalidade" && c.status === "aguardando_confirmacao") } : null);
  const chip = chipDaMensalidade(e);
  const salvar = async (ev: FormEvent) => {
    ev.preventDefault();
    const v = valor.trim() ? lerValor(valor) : null;
    if (valor.trim() && !v) return setErro("Valor inválido.");
    if (plano === "__novo__" && !planoNovo.trim()) return setErro("Dê um nome ao plano novo.");
    setSalvando(true);
    setErro("");
    const r = await agir("prof_definir", {
      aluno: d.aluno.paciente_id, valor: v, ...(plano === "__novo__" ? { plano_novo: planoNovo.trim() } : { plano_aluno_id: plano || null }),
    }, "Plano e mensalidade salvos.");
    setSalvando(false);
    if (r) {
      setPlanoNovo("");
      espelharNoTreino(d.aluno.treino_user_id, plano === "__novo__" ? planoNovo.trim() : d.planos.find((p) => p.id === plano)?.nome ?? null, v);
    }
  };
  return (
    <Cartao brilho className="flex flex-col p-5" data-cartao-mensalidade={e.situacao}>
      <CabecalhoCartao titulo="Mensalidade" extra={m ? <Chip tom="g">{reaisCurto(m.valor)}/MÊS</Chip> : undefined} className="mb-2" />
      {/* a situação numa linha própria: "Aguardando confirmação" não cabe no cabeçalho do cartão estreito */}
      <div className="mb-3.5"><Chip tom={chip.tom} data-chip-mensalidade>{chip.texto}</Chip></div>
      <form onSubmit={salvar} className="flex flex-col gap-3" data-form-mensalidade>
        <CampoSelect rotulo="Plano do aluno" value={plano} onChange={(ev) => { setPlano(ev.target.value); setErro(""); }} data-mensalidade-plano>
          <option value="">Sem plano</option>
          {d.planos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          <option value="__novo__">+ Criar novo plano…</option>
        </CampoSelect>
        {plano === "__novo__" && <Campo rotulo="Nome do plano novo" maxLength={80} value={planoNovo} onChange={(ev) => setPlanoNovo(ev.target.value)} placeholder="Ex.: Consultoria mensal" data-mensalidade-plano-novo />}
        <Campo rotulo="Mensalidade (R$)" inputMode="decimal" value={valor} onChange={(ev) => { setValor(ev.target.value); setErro(""); }} placeholder="Vazio = sem cobrança" data-mensalidade-valor />
        {erro && <MensagemForm>{erro}</MensagemForm>}
        <div className="flex flex-wrap gap-2">
          <Botao type="submit" variante="w" icone={Save} disabled={salvando} data-mensalidade-salvar>{salvando ? "Salvando…" : "Salvar"}</Botao>
          {m && (m.pausada ? (
            <Botao icone={Play} onClick={() => void agir("prof_pausar", { aluno: d.aluno.paciente_id, pausar: false }, "Cobrança reativada.")} data-mensalidade-reativar>Reativar cobrança</Botao>
          ) : (
            <Botao icone={Pause} onClick={() => { if (window.confirm("Parar a cobrança pelo app? O aluno deixa de ver a pendência e o Pagar.")) void agir("prof_pausar", { aluno: d.aluno.paciente_id, pausar: true }, "Cobrança parada."); }} data-mensalidade-parar>Não cobrar pelo app</Botao>
          ))}
        </div>
      </form>
      <div className="mt-4 border-t border-linha pt-3 text-[12.5px] text-texto-2" data-mensalidade-situacao>
        {m ? <p><b className="font-semibold text-texto">{textoDoVencimento(e).replace(/^./, (x) => x.toUpperCase())}</b>{e.coberta && m.pago_ate && e.situacao !== "em_dia" ? ` · coberto até ${dataBR(m.pago_ate)}` : ""}</p> : <p>Sem mensalidade: o aluno não vê cobrança mensal.</p>}
        <p className="mt-1.5 flex items-start gap-1.5"><Wallet aria-hidden className="mt-[2px] h-3.5 w-3.5 flex-none" /> <span className="min-w-0 break-words">{MODO_TEXTO[d.conta.modo] ?? d.conta.modo}{d.conta.modo === "pix_manual" && d.conta.chave ? ` · ${d.conta.chave.chave}` : d.conta.modo === "pix_manual" ? " · sem chave ativa" : ""}</span></p>
        {d.permissoes.dono && <Link to="/painel/configuracoes/recebimento" className="mt-1.5 inline-flex items-center gap-1.5 font-semibold text-violeta-3" data-link-recebimento><Settings2 aria-hidden className="h-3.5 w-3.5" /> Configurar o recebimento</Link>}
      </div>
    </Cartao>
  );
}

/** 99.9 → "99,90" (o campo mostra o valor com os centavos, como o aluno vê). */
function valorNoCampo(v: number | string): string {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2).replace(".", ",") : String(v);
}

/** Mantém o plano e o valor também no Banco do Treino (a lista antiga de alunos e o cabeçalho leem de lá até a W13/W14). */
function espelharNoTreino(treinoUserId: string | null, planoNome: string | null, valor: number | null) {
  if (!treinoUserId) return;
  void supabase.functions.invoke("admin-update-user", { body: { userId: treinoUserId, data: { plano_nome: planoNome, mensalidade_valor: valor } } })
    .then(({ error }) => error && console.warn("[Financeiro] espelho no Treino", error.message))
    .catch(() => undefined);
}

function CartaoCobrancas({ d, agir, aoVerComprovante, aoRegistrar, aoNovaCobranca, aoRegistrarMensalidade }: {
  d: FinanceiroProfissional;
  agir: ReturnType<typeof useFinanceiroDoAluno>["agir"];
  aoVerComprovante: (id: string) => void;
  aoRegistrar: (c: CobrancaVista) => void;
  aoNovaCobranca: () => void;
  aoRegistrarMensalidade: () => void;
}) {
  const [todas, setTodas] = useState(false);
  const lista = ordenarCobrancas(d.cobrancas);
  const visiveis = todas ? lista : lista.slice(0, 8);
  const dono = d.permissoes.mensalidade;
  return (
    <Cartao className="flex flex-col p-5" data-cartao-cobrancas>
      <CabecalhoCartao titulo="Cobranças" extra={<Chip tom="g">{d.cobrancas.length}</Chip>} />
      <div className="mb-2 flex flex-wrap gap-2">
        {dono && d.mensalidade && <Botao tamanho="sm" icone={Banknote} onClick={aoRegistrarMensalidade} data-btn-registrar-pagamento>Registrar pagamento</Botao>}
        <Botao tamanho="sm" icone={Plus} onClick={aoNovaCobranca} data-btn-nova-cobranca>Nova cobrança</Botao>
      </div>
      {lista.length === 0 ? (
        <p className="py-3 text-[12.5px] text-texto-3">Nenhuma cobrança ainda.</p>
      ) : (
        <div data-lista-cobrancas>
          {visiveis.map((c) => (
            <LinhaCobranca key={c.id} cobranca={c} hoje={d.hoje} acoes={
              <span className="flex flex-none items-center gap-1">
                {c.comprovante && <IconeAcao icone={Eye} rotulo="Ver o comprovante" onClick={() => aoVerComprovante(c.id)} marca="ver" />}
                {c.status === "aberta" && <IconeAcao icone={Banknote} rotulo="Registrar pago por fora" onClick={() => aoRegistrar(c)} marca="pago-por-fora" />}
                {c.status === "aberta" && <IconeAcao icone={Ban} rotulo="Cancelar a cobrança" perigo marca="cancelar"
                  onClick={() => { if (window.confirm(`Cancelar "${c.descricao}"?`)) void agir("prof_cobranca_cancelar", { cobranca_id: c.id }, "Cobrança cancelada."); }} />}
                {dono && c.status === "paga" && c.forma === "mp" && c.mp && <IconeAcao icone={Undo2} rotulo="Estornar no Mercado Pago" perigo marca="estornar"
                  onClick={() => { if (window.confirm(`Estornar ${reais(c.valor)} no Mercado Pago? O dinheiro volta para o aluno.`)) void agir("prof_reembolsar", { cobranca_id: c.id }, "Estorno pedido ao Mercado Pago."); }} />}
                {dono && c.status === "paga" && c.forma === "manual" && c.tipo === "mensalidade" && <IconeAcao icone={Trash2} rotulo="Remover o pagamento por fora" perigo marca="remover"
                  onClick={() => { if (window.confirm(`Remover este pagamento de ${reais(c.valor)}? Sem outra cobertura, o aluno volta a ficar pendente.`)) void agir("prof_remover", { cobranca_id: c.id }, "Pagamento removido."); }} />}
              </span>
            } />
          ))}
          {lista.length > 8 && (
            <button type="button" onClick={() => setTodas((v) => !v)} className="mt-2 text-[12.5px] font-semibold text-violeta-3" data-cobrancas-ver-todas>
              {todas ? "Ver menos" : `Ver todas (${lista.length})`}
            </button>
          )}
        </div>
      )}
    </Cartao>
  );
}

function CartaoAssinatura({ d, agir }: { d: FinanceiroProfissional; agir: ReturnType<typeof useFinanceiroDoAluno>["agir"] }) {
  const a = d.assinatura!;
  const ativa = ["authorized", "pending", "paused"].includes(a.status);
  return (
    <Cartao className="flex items-center gap-3 p-4" data-cartao-assinatura={a.status}>
      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[11px] bg-superficie text-violeta-3"><Repeat aria-hidden className="h-[18px] w-[18px]" /></span>
      <span className="min-w-0 flex-1 text-[12.5px] text-texto-2">
        <b className="block text-[13.5px] font-semibold text-texto">Cobrança automática {a.status === "authorized" ? "ativa" : a.status === "cancelled" ? "cancelada" : "pendente"}</b>
        {reais(a.valor)}/mês no cartão{a.proximo_vencimento && ativa ? ` · próxima ${dataBR(a.proximo_vencimento)}` : ""}
      </span>
      {ativa && d.permissoes.mensalidade && (
        <Botao tamanho="sm" onClick={() => { if (window.confirm("Cancelar a cobrança automática deste aluno? Ela para na hora.")) void agir("prof_cancelar_assinatura", { aluno: d.aluno.paciente_id }, "Cobrança automática cancelada."); }} data-btn-cancelar-assinatura>Cancelar</Botao>
      )}
    </Cartao>
  );
}

function CartaoLancamentosERecibos({ d, reciboAvulso, aoFecharReciboAvulso, aoAbrirReciboAvulso }: {
  d: FinanceiroProfissional;
  reciboAvulso: boolean;
  aoFecharReciboAvulso: () => void;
  aoAbrirReciboAvulso: () => void;
}) {
  const { usuario } = useSessao();
  const uid = usuario?.id ?? "";
  // W19: o recibo, os modelos ★ e o PDF são os do Painel › Financeiro (o do Nutri: emitir e baixar o PDF, marca Physiq)
  const fin = useFinanceiroConta({ categorias: false });
  const qc = useQueryClient();
  const pid = d.aluno.paciente_id;
  const lanc = useQuery({ queryKey: ["financeiro-lancamentos", pid], queryFn: () => listarLancamentosDoAluno(pid), enabled: !!uid });
  const recibos = useQuery({ queryKey: ["financeiro-recibos", pid], queryFn: () => listarRecibosDoAluno(pid), enabled: !!uid });
  const categorias = useQuery({ queryKey: ["financeiro-categorias", uid], queryFn: () => garantirCategorias(uid), enabled: !!uid });
  const [novoLanc, setNovoLanc] = useState(false);
  const [reciboDe, setReciboDe] = useState<Lancamento | null>(null);
  const [modelosAberto, setModelosAberto] = useState(false);
  // N-45: os 12 mais recentes; "Ver todos" mostra a lista inteira (a consulta traz até 500)
  const [todos, setTodos] = useState(false);
  const lista = useMemo(() => lanc.data ?? [], [lanc.data]);
  const visiveis = todos ? lista : lista.slice(0, LANCAMENTOS_VISIVEIS);
  const t = totais(lista);
  const recarregar = async () => {
    await Promise.all(["financeiro-lancamentos", "financeiro-recibos"].map((k) => qc.invalidateQueries({ queryKey: [k, pid] })));
    await fin.recarregar("recibos");
  };
  const pdf = async (r: { numero: number; valor: number | string; data: string; descricao: string; texto: string; nutricionista_id: string }) => {
    try {
      await pdfDoRecibo(fin, { ...r, valor: Number(r.valor) }, d.aluno.nome);
    } catch {
      toast.error("Não deu para gerar o PDF agora.");
    }
  };
  return (
    <>
      <Cartao className="flex flex-col p-5" data-cartao-lancamentos>
        <CabecalhoCartao titulo="Lançamentos do aluno" acao={<Botao tamanho="sm" icone={Plus} onClick={() => setNovoLanc(true)} data-btn-novo-lancamento>Registrar</Botao>} />
        <div className="mb-3 grid grid-cols-2 gap-2.5">
          <div className="rounded-2xl border border-linha bg-superficie-3 px-3.5 py-2.5"><div className="text-[11.5px] text-texto-2">Recebido</div><b className="text-[17px] font-bold tabular-nums text-verde-2">{reais(t.entradas)}</b></div>
          <div className="rounded-2xl border border-linha bg-superficie-3 px-3.5 py-2.5"><div className="text-[11.5px] text-texto-2">Gasto com o aluno</div><b className="text-[17px] font-bold tabular-nums text-rosa-3">{reais(t.saidas)}</b></div>
        </div>
        {lanc.isLoading ? <Esqueleto className="h-24 w-full" /> : lista.length === 0 ? (
          <p className="py-2 text-[12.5px] text-texto-3">Nenhum lançamento. Confirmar um Pix ou registrar um pagamento pode lançar a entrada aqui.</p>
        ) : visiveis.map((l) => (
          <div key={l.id} className="flex min-h-[46px] items-center gap-2.5 border-t border-linha-3 py-1.5 first:border-t-0" data-lancamento={l.id}>
            {l.tipo === "saida" ? <ArrowDownCircle aria-hidden className="h-4 w-4 flex-none text-rosa-3" /> : <ArrowUpCircle aria-hidden className="h-4 w-4 flex-none text-verde-2" />}
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-[13px] text-texto ${l.estornada ? "line-through opacity-60" : ""}`}>{l.descricao}</span>
              <span className="block truncate text-[11.5px] text-texto-3">{formatarDataRecibo(l.data)} · {l.categoria?.nome ?? "sem categoria"} · {rotuloMetodoLancamento(l.metodo)}</span>
            </span>
            <b className={`text-[13px] font-semibold tabular-nums ${l.tipo === "saida" ? "text-rosa-3" : "text-verde-2"}`}>{valorComSinal(l.tipo, Number(l.valor))}</b>
            {l.recibo_id ? <Chip tom="t" className="h-[22px] text-[10.5px]">RECIBO</Chip> : podeEmitirRecibo({ ...l, deleted_at: null }) && (
              <IconeAcao icone={ReceiptText} rotulo="Emitir recibo" onClick={() => setReciboDe(l)} marca="emitir-recibo" />
            )}
          </div>
        ))}
        {lista.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-linha-3 pt-2.5 text-[12.5px]" data-lancamentos-rodape={lista.length}>
            {lista.length > LANCAMENTOS_VISIVEIS ? (
              <button type="button" onClick={() => setTodos((x) => !x)} className="font-semibold text-violeta-3" data-lancamentos-ver-todos={todos ? "aberto" : "fechado"}>
                {todos ? `Mostrar só os ${LANCAMENTOS_VISIVEIS} mais recentes` : `Ver todos (${lista.length}${lista.length >= LANCAMENTOS_MAX ? "+" : ""})`}
              </button>
            ) : (
              <span className="text-texto-3">{lista.length === 1 ? "1 lançamento" : `${lista.length} lançamentos`}</span>
            )}
            <Link to={rotaDosLancamentosDoAluno(d.aluno.nome, lista.map((l) => l.data), hojeSP())} className="font-semibold text-texto-2 hover:text-texto"
              title="Painel › Financeiro › Lançamentos, só deste aluno" data-lancamentos-no-financeiro>
              Editar, estornar ou excluir no Financeiro
            </Link>
          </div>
        )}
      </Cartao>
      <Cartao className="flex flex-col p-5" data-cartao-recibos>
        <CabecalhoCartao titulo="Recibos" extra={<Chip tom="g">{recibos.data?.length ?? 0}</Chip>} acao={
          <span className="flex gap-2">
            <Botao tamanho="sm" icone={Tags} onClick={() => setModelosAberto(true)} data-btn-modelos-recibo>Modelos</Botao>
            <Botao tamanho="sm" icone={Plus} onClick={aoAbrirReciboAvulso} data-btn-novo-recibo>Novo recibo</Botao>
          </span>
        } />
        {recibos.isLoading ? <Esqueleto className="h-24 w-full" /> : (recibos.data ?? []).length === 0 ? (
          <p className="py-2 text-[12.5px] text-texto-3">Nenhum recibo. Emita de um lançamento ou um recibo avulso; o número é sequencial e o PDF sai na hora.</p>
        ) : (recibos.data ?? []).map((r) => (
          <div key={r.id} className="flex min-h-[46px] items-center gap-2.5 border-t border-linha-3 py-1.5 first:border-t-0" data-recibo={r.numero}>
            <ReceiptText aria-hidden className="h-4 w-4 flex-none text-violeta-3" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] text-texto">Nº {formatarNumeroRecibo(r.numero)} · <b className="font-semibold tabular-nums">{reais(r.valor)}</b></span>
              <span className="block truncate text-[11.5px] text-texto-3">{formatarDataRecibo(r.data)} · {r.descricao}</span>
            </span>
            <IconeAcao icone={FileDown} rotulo="Baixar o PDF" onClick={() => void pdf(r)} marca="pdf-recibo" />
            <IconeAcao icone={Trash2} rotulo="Excluir o recibo" perigo marca="excluir-recibo" onClick={() => {
              if (!window.confirm(`Mandar o recibo nº ${formatarNumeroRecibo(r.numero)} para a lixeira? O número não é reaproveitado.`)) return;
              void excluirRecibo(r.id).then(recarregar).catch(() => toast.error("Não deu para excluir."));
            }} />
          </div>
        ))}
      </Cartao>
      <DialogoLancamento aberto={novoLanc} aoFechar={() => setNovoLanc(false)} categorias={categorias.data ?? []}
        aoSalvar={async (x) => {
          try {
            await criarLancamento({ uid, contaId: d.aluno.conta_id, pacienteId: pid, ...x });
            toast.success("Lançamento registrado.");
            await recarregar();
            return true;
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Não deu para registrar.");
            return false;
          }
        }} />
      <ReciboDialog open={reciboAvulso || !!reciboDe} onOpenChange={(a) => { if (!a) { setReciboDe(null); aoFecharReciboAvulso(); } }}
        aluno={{ id: pid, nome: d.aluno.nome, apelido: null, cpf: d.aluno.cpf }}
        transacao={reciboDe ? { id: reciboDe.id, tipo: reciboDe.tipo, descricao: reciboDe.descricao, valor: Number(reciboDe.valor), data: reciboDe.data } : null}
        modelos={fin.modelos.data ?? []} proximoNumero={(fin.ultimo.data ?? 0) + 1} nomeProfissional={fin.nomeProfissional} padrao={fin.padrao} uid={uid}
        contaId={d.aluno.conta_id} onSalvo={() => void recarregar()} onGerenciarModelos={() => setModelosAberto(true)} />
      <ModelosReciboDialog open={modelosAberto} onOpenChange={setModelosAberto} uid={uid} contaId={d.aluno.conta_id} modelos={fin.modelos.data ?? []}
        nomeProfissional={fin.nomeProfissional} onMudou={() => fin.recarregar("modelos")} />
    </>
  );
}
