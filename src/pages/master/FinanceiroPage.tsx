import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ListaPaginada, usePaginado } from "@/components/ListaPaginada";
import { fmtData, masterFinanceiro, planoComValor, type FinanceiroLinha } from "@/lib/saasApi";
import ProfessorFinanceiroModal from "@/components/master/ProfessorFinanceiroModal";
import { BloquearAlunosDialog, LiberarAcessoDialog, ReenviarAvisoDialog, type AlvoAcao } from "@/components/master/AcoesFinanceiroDialogs";
import {
  BTN_MINI_NEUTRO, BTN_MINI_PERIGO, BTN_MINI_PRIMARIO, Carregando, Chip, ErroCarregar, Etiqueta, KpiCard, LINHA, TituloPagina, Vazio,
  cicloTexto, hojeISO, mensagemErro, situacaoInfo, useConfirmacao,
} from "@/components/master/masterUi";

type Filtro = "todos" | "atrasados" | "travados" | "trial" | "pausados" | "em_dia";
const FILTROS: { key: Filtro; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "atrasados", label: "Atrasados" },
  { key: "travados", label: "Travados" },
  { key: "trial", label: "Trial / sem adesão" },
  { key: "pausados", label: "Pausados" },
  { key: "em_dia", label: "Em dia" },
];
interface Resumo { total: number; travados: number; emTolerancia: number; emDia: number; trial: number }
interface FinList { professores: FinanceiroLinha[]; total: number; resumo: Resumo; tolerancia: number; hoje: string }

// Financeiro (master): cobrança dos professores — KPIs, filtros, linhas COMPACTAS (decisão do Weslley)
// com ações rápidas conforme a situação; clicar na linha abre o modal completo.
const FinanceiroPage = () => {
  const [sp, setSp] = useSearchParams();
  const filtroParam = sp.get("filtro");
  const filtro: Filtro = FILTROS.some((f) => f.key === filtroParam) ? (filtroParam as Filtro) : "todos";
  const abertoId = sp.get("professorId");

  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [tolerancia, setTolerancia] = useState<number | null>(null);
  const [hoje, setHoje] = useState(hojeISO());
  // o `resumo` da edge é calculado DEPOIS do filtro → busca à parte com "todos" pra os KPIs não mudarem com o chip
  const carregarResumo = useCallback(async () => {
    try {
      const r = await masterFinanceiro<FinList>("list", { filtro: "todos", limit: 1 });
      setResumo(r.resumo); setTolerancia(r.tolerancia); setHoje(r.hoje);
    } catch { /* a lista já mostra o erro */ }
  }, []);
  useEffect(() => { void carregarResumo(); }, [carregarResumo]);

  const fetchPage = useCallback((offset: number, limit: number) =>
    masterFinanceiro<FinList>("list", { limit, offset, filtro }).then((r) => ({ itens: r.professores, total: r.total })), [filtro]);
  const lista = usePaginado<FinanceiroLinha>(fetchPage, [filtro]);
  const recarregarTudo = () => { void lista.recarregar(); void carregarResumo(); };

  const setParam = (k: string, v: string | null) => setSp((prev) => {
    const n = new URLSearchParams(prev);
    if (v) n.set(k, v); else n.delete(k);
    return n;
  }, { replace: true });
  const setFiltro = (f: Filtro) => setParam("filtro", f === "todos" ? null : f);

  // ações rápidas da linha
  const [liberar, setLiberar] = useState<AlvoAcao | null>(null);
  const [bloquear, setBloquear] = useState<AlvoAcao | null>(null);
  const [aviso, setAviso] = useState<AlvoAcao | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { confirmar, dialogo } = useConfirmacao();
  const rodar = async (l: FinanceiroLinha, fn: () => Promise<unknown>, ok: string) => {
    setBusyId(l.id);
    try {
      await fn();
      toast.success(ok);
      recarregarTudo();
    } catch (e) {
      toast.error(mensagemErro(e));
    } finally {
      setBusyId(null);
    }
  };
  const desbloquear = async (l: FinanceiroLinha) => {
    if (await confirmar({ titulo: `Desbloquear os alunos de ${l.nome}?`, descricao: "Os alunos dele voltam a usar o app normalmente.", confirmar: "Desbloquear" })) {
      await rodar(l, () => masterFinanceiro("desbloquear-alunos", { userId: l.id }), "Alunos desbloqueados.");
    }
  };
  const removerLiberacao = async (l: FinanceiroLinha) => {
    if (await confirmar({ titulo: `Remover a liberação de ${l.nome}?`, descricao: "Volta a valer a régua normal (ciclo + tolerância) imediatamente.", confirmar: "Remover", perigo: true })) {
      await rodar(l, () => masterFinanceiro("liberar-acesso-ate", { userId: l.id, ate: null }), "Liberação removida.");
    }
  };

  return (
    <div data-pagina="master-financeiro">
      <TituloPagina
        titulo="Financeiro"
        sub={<>Cobrança dos professores (o master não paga plano).{tolerancia !== null ? ` Tolerância ${tolerancia} dias · hoje ${fmtData(hoje)}.` : ""}</>}
      />

      {resumo && (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-5" data-kpis>
          <KpiCard rotulo="Professores" valor={resumo.total} onClick={() => setFiltro("todos")} data-kpi="total" />
          <KpiCard rotulo="Travados" valor={resumo.travados} onClick={() => setFiltro("travados")} tom={resumo.travados > 0 ? "ruim" : "neutro"} data-kpi="travados" />
          <KpiCard rotulo="Em tolerância" valor={resumo.emTolerancia} onClick={() => setFiltro("atrasados")} tom={resumo.emTolerancia > 0 ? "aviso" : "neutro"} data-kpi="em-tolerancia" />
          <KpiCard rotulo="Em dia" valor={resumo.emDia} onClick={() => setFiltro("em_dia")} tom="ok" data-kpi="em-dia" />
          <KpiCard rotulo="Trial / sem adesão" valor={resumo.trial} onClick={() => setFiltro("trial")} data-kpi="trial" />
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-5" data-filtros>
        {FILTROS.map((f) => (
          <Chip key={f.key} ativo={filtro === f.key} onClick={() => setFiltro(f.key)} data-filtro={f.key}>{f.label}</Chip>
        ))}
      </div>

      {lista.erro && <ErroCarregar texto={mensagemErro(lista.erro)} onRetry={recarregarTudo} />}
      {lista.loading ? <Carregando /> : lista.itens.length === 0 ? (
        <Vazio texto={filtro === "todos" ? "Nenhum professor além de você." : "Nenhum professor nesse filtro."} />
      ) : (
        <div data-lista-financeiro>
          {lista.itens.map((l) => {
            const sit = situacaoInfo(l.situacao);
            const liberado = l.situacao === "liberado";
            const acoes: { rotulo: string; cls: string; onClick: () => void; data: string }[] = [];
            if (l.situacao === "travado") {
              acoes.push({ rotulo: "Liberar acesso", cls: BTN_MINI_PRIMARIO, onClick: () => setLiberar({ id: l.id, nome: l.nome, acessoLiberadoAte: l.acessoLiberadoAte }), data: "liberar" });
              if (!l.alunosBloqueadosEm) acoes.push({ rotulo: "Bloquear alunos", cls: BTN_MINI_PERIGO, onClick: () => setBloquear({ id: l.id, nome: l.nome }), data: "bloquear" });
            }
            if (l.situacao === "em_tolerancia") acoes.push({ rotulo: "Reenviar aviso", cls: BTN_MINI_PRIMARIO, onClick: () => setAviso({ id: l.id, nome: l.nome }), data: "reenviar-aviso" });
            if (l.alunosBloqueadosEm) acoes.push({ rotulo: "Desbloquear alunos", cls: BTN_MINI_PRIMARIO, onClick: () => void desbloquear(l), data: "desbloquear" });
            if (liberado) acoes.push({ rotulo: "Remover liberação", cls: BTN_MINI_NEUTRO, onClick: () => void removerLiberacao(l), data: "remover-liberacao" });
            return (
              <div key={l.id} className={`${LINHA} ${busyId === l.id ? "opacity-60" : ""}`} data-financeiro-linha={l.id} data-situacao={l.situacao}>
                <button type="button" onClick={() => setParam("professorId", l.id)} className="w-full text-left -mx-1 px-1 rounded hover:bg-primary/5 transition-colors" data-btn-abrir>
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="font-heading text-sm text-foreground truncate max-w-full">{l.nome}</span>
                    <span className="text-xs text-primary font-body">{planoComValor(l.plano)}</span>
                    <span className="text-[11px] text-muted-foreground font-body">{l.alunos} aluno(s)</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[11px] font-body text-muted-foreground">
                    <span>{cicloTexto(l)}</span>
                    <Etiqueta cls={sit.cls} className="!text-[10px]">{sit.label}</Etiqueta>
                    {l.recorrente && <Etiqueta tom="info" className="!text-[10px]">recorrente</Etiqueta>}
                    {l.alunosBloqueadosEm && <Etiqueta tom="ruim" className="!text-[10px]">alunos bloqueados</Etiqueta>}
                    {l.diasAtraso !== null && l.diasAtraso > 0 && (l.situacao === "travado" || l.situacao === "em_tolerancia") && (
                      <span className="text-destructive">{l.diasAtraso} d de atraso</span>
                    )}
                  </div>
                </button>
                {acoes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2" data-acoes-rapidas>
                    {acoes.map((a) => (
                      <button key={a.data} type="button" onClick={a.onClick} disabled={busyId === l.id} className={a.cls} data-acao={a.data}>{a.rotulo}</button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <ListaPaginada total={lista.total} mostrando={lista.itens.length} carregandoMais={lista.carregandoMais} onVerMais={lista.verMais} rotulo="professores" />
        </div>
      )}

      <ProfessorFinanceiroModal userId={abertoId} onClose={() => setParam("professorId", null)} onChanged={recarregarTudo} />
      <LiberarAcessoDialog alvo={liberar} onClose={() => setLiberar(null)} onFeito={recarregarTudo} />
      <BloquearAlunosDialog alvo={bloquear} onClose={() => setBloquear(null)} onFeito={recarregarTudo} />
      <ReenviarAvisoDialog alvo={aviso} onClose={() => setAviso(null)} onFeito={recarregarTudo} />
      {dialogo}
    </div>
  );
};

export default FinanceiroPage;
