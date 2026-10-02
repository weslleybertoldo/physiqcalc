// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/pages/paciente/secoes/Gestacional.tsx) para o banco principal. Imports trocados; o resto é o do site antigo.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Baby, ClipboardList, FileDown, Flag, Pencil, Plus, Scale, Trash2, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BTN_PERIGO, BTN_PRI, BTN_SEC } from "@/nutricao/editor/ui/estilos";
import GestacaoDialog from "@/nutricao/prontuario/ui/GestacaoDialog";
import RegistroGestacionalDialog from "@/nutricao/prontuario/ui/RegistroGestacionalDialog";
import { useAuth } from "@/nutricao/prontuario/ui/contexto";
import {
  dadosProfissionais, encerrarGestacao, excluirGestacao, excluirRegistro, gestacaoAtiva, listarAntropometrias, listarGestacoes, listarRegistrosDoPaciente,
  nomeDaNutricionista, type Gestacao, type RegistroGestacional,
} from "@/nutricao/prontuario/lib/gestacional";
import { baixarPDFGestacional } from "@/nutricao/prontuario/lib/gestacionalPdf";
import {
  TICKS_SEMANAS, alertaPA, classificarIMCPre, dadosGrafico, faixaTotal, fmtData, fmtFaixa, fmtGanho, fmtKg, fmtPeso, ganhoFinal, ganhoRecomendado, hojeISO,
  inserirRegistro, ordenarRegistros, rotuloSituacao, semanaGestacional, serieGanho, textoContagemRegistros, textoIMCPre, textoPA, textoSemana,
  textoSemanaTrimestre, type PontoGanho, type SituacaoGanho,
} from "@/nutricao/editor/lib/gestacionalUtil";
import { usePaciente } from "@/nutricao/prontuario/ui/contexto";

const CARD = "pq-cartao min-w-0 space-y-3 px-[18px] py-4";
const TITULO = "flex items-center gap-1.5 font-body text-[15px] font-semibold normal-case tracking-[-0.01em] text-texto";
const ROTULO = "text-[10px] uppercase tracking-wider text-texto-2 font-body truncate";
const BTN_MINI = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-linha-2 bg-[rgba(255,255,255,.04)] px-2.5 text-[11.5px] font-semibold text-texto-2 transition-colors hover:text-texto disabled:cursor-not-allowed disabled:opacity-40";
const BTN_MINI_PERIGO = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-[rgba(244,63,94,.35)] bg-transparent px-2.5 text-[11.5px] font-semibold text-rosa-3 transition-colors hover:bg-[rgba(244,63,94,.08)] disabled:opacity-40";
const EIXO = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
const COR_SITUACAO: Record<SituacaoGanho, string> = { dentro: "text-texto", abaixo: "text-verde-3", acima: "text-rosa-3" };

// Seção "Acompanhamento gestacional" (referência: só o vazio 'Nenhum acompanhamento' / 'iniciar acompanhamento gestacional';
// o acompanhamento é nosso — IOM 2009). SEM gestação ativa → vazio (+ as encerradas, quando houver). COM ativa → card da
// gestação (DUM, DPP, semana atual, IMC pré, gemelar, ganho recomendado × ganho atual), curva recharts (faixa recomendada por
// semana × ganho real por registro), registros de peso (mais recente primeiro; 1 vivo por dia — upsert manual) e PDF.
// Lê antropometrias (W6) só pra SUGERIR peso/altura pré-gestacionais; grava só em `gestacoes` e `registros_gestacionais`.
export default function Gestacional() {
  const { paciente: p, recarregar } = usePaciente();
  const { user } = useAuth();
  const uid = user?.id;
  const qc = useQueryClient();

  const chaveG = useMemo(() => ["gestacoes", p.id], [p.id]);
  const chaveR = useMemo(() => ["registros-gestacionais", p.id], [p.id]);
  const chaveA = useMemo(() => ["gestacional-antropometrias", p.id], [p.id]);
  const gQ = useQuery({ queryKey: chaveG, queryFn: () => listarGestacoes(p.id) });
  const rQ = useQuery({ queryKey: chaveR, queryFn: () => listarRegistrosDoPaciente(p.id) });
  const aQ = useQuery({ queryKey: chaveA, queryFn: () => listarAntropometrias(p.id) });
  const perfilQ = useQuery({
    queryKey: ["perfil-pdf", uid],
    queryFn: async () => {
      const [nome, profissional] = await Promise.all([nomeDaNutricionista(uid ?? ""), dadosProfissionais(uid ?? "")]);
      return { nome, profissional };
    },
    enabled: !!uid,
  });
  const carregando = !uid || gQ.isPending || rQ.isPending || aQ.isPending;
  const atualizando = carregando || gQ.isFetching || rQ.isFetching || aQ.isFetching;
  const erro = gQ.error ?? rQ.error ?? aQ.error;

  const gestacoes = useMemo(() => gQ.data ?? [], [gQ.data]);
  const registros = useMemo(() => rQ.data ?? [], [rQ.data]);
  const antropometrias = useMemo(() => aQ.data ?? [], [aQ.data]);
  const ativa = useMemo(() => gestacaoAtiva(gestacoes), [gestacoes]);
  const encerradas = useMemo(() => gestacoes.filter((g) => g.encerrada_em !== null), [gestacoes]);
  // registros da ativa (memoizados: vão por prop pro modal), mais recente primeiro
  const registrosAtiva = useMemo(() => (ativa ? ordenarRegistros(registros.filter((r) => r.gestacao_id === ativa.id)) : []), [registros, ativa]);
  const serie = useMemo(() => (ativa ? serieGanho(registrosAtiva, ativa) : []), [registrosAtiva, ativa]);
  const classificacao = ativa ? classificarIMCPre(ativa.imc_pre) : null;
  const total = ativa && classificacao ? faixaTotal(classificacao, ativa.gemelar) : null;
  const dados = useMemo(() => (ativa && classificacao ? dadosGrafico(serie, classificacao, ativa.gemelar) : []), [serie, ativa, classificacao]);
  const ultimo = serie.length ? serie[serie.length - 1] : null;
  const semanaHoje = ativa ? semanaGestacional(ativa.dum, hojeISO()) : null;
  const faixaHoje = ativa && classificacao && semanaHoje ? ganhoRecomendado(classificacao, semanaHoje.semanas, ativa.gemelar) : null;

  const [modalGestacao, setModalGestacao] = useState<{ aberto: boolean; gestacao: Gestacao | null }>({ aberto: false, gestacao: null });
  const [modalRegistro, setModalRegistro] = useState<{ aberto: boolean; registro: RegistroGestacional | null }>({ aberto: false, registro: null });
  const [paraEncerrar, setParaEncerrar] = useState(false);
  const [paraExcluirRegistro, setParaExcluirRegistro] = useState<PontoGanho | null>(null);
  const [paraExcluirGestacao, setParaExcluirGestacao] = useState<Gestacao | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [salvando, setSalvando] = useState(0); // gravações assíncronas fora dos modais — o E2E espera voltar a 0

  const onGestacaoSalva = (g: Gestacao) => {
    qc.setQueryData<Gestacao[]>(chaveG, (old) => ((old ?? []).some((x) => x.id === g.id) ? (old ?? []).map((x) => (x.id === g.id ? g : x)) : [g, ...(old ?? [])]));
    void recarregar(); // o banco mexeu em pacientes.updated_at (trigger)
  };
  const onRegistroSalvo = (r: RegistroGestacional) => {
    qc.setQueryData<RegistroGestacional[]>(chaveR, (old) => inserirRegistro(old ?? [], r));
    void recarregar();
  };

  const rodar = async (acao: () => Promise<void>, erroPadrao: string) => {
    setOcupado(true);
    setSalvando((n) => n + 1);
    try {
      await acao();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : erroPadrao);
    } finally {
      setOcupado(false);
      setSalvando((n) => n - 1);
    }
  };

  const encerrar = () =>
    rodar(async () => {
      if (!ativa) return;
      const g = await encerrarGestacao(ativa.id);
      qc.setQueryData<Gestacao[]>(chaveG, (old) => (old ?? []).map((x) => (x.id === g.id ? g : x)));
      setParaEncerrar(false);
      toast.success("Acompanhamento encerrado");
      void recarregar();
    }, "Não foi possível encerrar o acompanhamento");

  const excluirReg = () =>
    rodar(async () => {
      if (!paraExcluirRegistro) return;
      const alvo = paraExcluirRegistro;
      await excluirRegistro(alvo.id);
      qc.setQueryData<RegistroGestacional[]>(chaveR, (old) => (old ?? []).filter((x) => x.id !== alvo.id));
      setParaExcluirRegistro(null);
      toast.success("Registro excluído");
    }, "Não foi possível excluir o registro");

  const excluirGest = () =>
    rodar(async () => {
      if (!paraExcluirGestacao) return;
      const alvo = paraExcluirGestacao;
      await excluirGestacao(alvo.id);
      qc.setQueryData<Gestacao[]>(chaveG, (old) => (old ?? []).filter((x) => x.id !== alvo.id));
      setParaExcluirGestacao(null);
      toast.success("Acompanhamento excluído");
    }, "Não foi possível excluir o acompanhamento");

  const pdf = () => {
    if (!ativa) return;
    try {
      const nome = baixarPDFGestacional({
        paciente: p.nome,
        nascimento: p.nascimento,
        nutricionista: perfilQ.data?.nome ?? null,
        profissional: perfilQ.data?.profissional ?? null,
        emitidoEm: new Date(),
        gestacao: ativa,
        serie,
      });
      toast.success("PDF gerado", { description: nome });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o PDF");
    }
  };

  return (
    <div className="space-y-4" data-secao-gestacional data-atualizando={atualizando ? "1" : "0"} data-salvando-gestacional={salvando} data-gestacao-ativa={ativa ? ativa.id : ""}>
      {erro && (
        <p role="alert" className="text-sm text-rosa-3 font-body" data-erro-gestacional>
          Não foi possível carregar o acompanhamento gestacional: {erro instanceof Error ? erro.message : "erro"}
        </p>
      )}

      {!carregando && !erro && !ativa && (
        <section className={CARD} data-card="vazio">
          <h2 className={TITULO}>
            <Baby size={12} aria-hidden="true" /> Acompanhamento gestacional
          </h2>
          <div className="rounded-2xl border border-dashed border-linha-2 p-6 text-center space-y-2" data-gestacional-vazio>
            <Baby className="mx-auto h-6 w-6 text-texto-3" aria-hidden="true" />
            <p className="text-sm text-texto font-body">Nenhum acompanhamento</p>
            <p className="text-xs text-texto-2 font-body">Sua aluna está grávida? Inicie um acompanhamento de ganho de peso.</p>
            <button type="button" onClick={() => setModalGestacao({ aberto: true, gestacao: null })} className={BTN_PRI} disabled={!uid} data-btn-iniciar-gestacao>
              <Plus size={12} aria-hidden="true" /> Iniciar acompanhamento gestacional
            </button>
          </div>
        </section>
      )}

      {ativa && classificacao && total && (
        <>
          <section className={CARD} data-card="gestacao" data-classificacao={classificacao}>
            <header className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className={TITULO}>
                  <Baby size={12} aria-hidden="true" /> Acompanhamento gestacional
                </h2>
                <p className="text-[11px] text-texto-3 font-body">Gestação {ativa.gemelar ? "gemelar" : "única"} · faixas do IOM 2009 pelo IMC pré-gestacional</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button type="button" onClick={() => setModalGestacao({ aberto: true, gestacao: ativa })} className={BTN_MINI} disabled={ocupado} data-btn-editar-gestacao>
                  <Pencil size={12} aria-hidden="true" /> Editar dados
                </button>
                <button type="button" onClick={pdf} className={BTN_MINI} data-leitura data-btn-pdf-gestacional>
                  <FileDown size={12} aria-hidden="true" /> PDF
                </button>
                <button type="button" onClick={() => setParaEncerrar(true)} className={BTN_MINI_PERIGO} disabled={ocupado} data-btn-encerrar-gestacao>
                  <Flag size={12} aria-hidden="true" /> Encerrar
                </button>
              </div>
            </header>

            <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-3">
              <div className="min-w-0">
                <dt className={ROTULO}>DUM</dt>
                <dd className="text-sm text-texto font-semibold" data-dum={ativa.dum}>{fmtData(ativa.dum)}</dd>
              </div>
              <div className="min-w-0">
                <dt className={ROTULO}>DPP</dt>
                <dd className="text-sm text-texto font-semibold" data-dpp={ativa.dpp}>{fmtData(ativa.dpp)}</dd>
              </div>
              <div className="min-w-0">
                <dt className={ROTULO}>Semana atual</dt>
                <dd className="text-sm text-texto font-semibold" data-semana={semanaHoje ? `${semanaHoje.semanas}s ${semanaHoje.dias}d` : ""}>{textoSemanaTrimestre(semanaHoje)}</dd>
              </div>
              <div className="min-w-0">
                <dt className={ROTULO}>Tipo</dt>
                <dd className="text-sm text-texto font-semibold">
                  <span className={`inline-block border px-2 py-0.5 text-[10px] uppercase tracking-wider ${ativa.gemelar ? "border-verde text-verde-3" : "border-linha-2 text-texto-2"}`} data-gemelar={ativa.gemelar ? "1" : "0"}>
                    {ativa.gemelar ? "gemelar" : "única"}
                  </span>
                </dd>
              </div>
              <div className="min-w-0 md:col-span-2">
                <dt className={ROTULO}>IMC pré-gestacional</dt>
                <dd className="text-sm text-texto font-semibold" data-imc-pre={ativa.imc_pre}>
                  IMC pré {textoIMCPre(ativa.imc_pre)}
                  <span className="text-texto-2 font-body text-xs"> · {fmtPeso(ativa.peso_pre)} · {fmtKg(ativa.altura)} cm</span>
                </dd>
              </div>
              <div className="min-w-0">
                <dt className={ROTULO}>Ganho recomendado</dt>
                <dd className="text-sm text-texto font-semibold" data-ganho-recomendado={`${total.faixa.min}-${total.faixa.max}`}>{fmtFaixa(total.faixa)}</dd>
                {faixaHoje && (
                  <dd className="text-[11px] text-texto-2 font-body" data-faixa-semana={`${faixaHoje.min.toFixed(2)}-${faixaHoje.max.toFixed(2)}`}>
                    até agora {fmtFaixa(faixaHoje)}
                  </dd>
                )}
              </div>
              <div className="min-w-0">
                <dt className={ROTULO}>Ganho atual</dt>
                <dd className={`text-sm font-semibold ${ultimo ? COR_SITUACAO[ultimo.situacao] : "text-texto-2"}`} data-ganho-atual={ultimo ? ultimo.ganho : ""} data-situacao-ganho={ultimo ? ultimo.situacao : "sem_registro"}>
                  {ultimo ? fmtGanho(ultimo.ganho) : "sem registro"}
                </dd>
                {ultimo && <dd className="text-[11px] text-texto-2 font-body">{rotuloSituacao(ultimo.situacao)} · {textoSemana(ultimo.semana)}</dd>}
              </div>
            </dl>
            {total.aviso && (
              <p className="text-xs text-verde-3 font-body flex items-center gap-1.5" data-aviso-gemelar>
                <AlertTriangle size={12} aria-hidden="true" /> {total.aviso}
              </p>
            )}
            {ativa.observacao && <p className="text-xs text-texto-2 font-body whitespace-pre-line" data-observacao-gestacao>{ativa.observacao}</p>}
          </section>

          <section className={CARD} data-card="curva">
            <h2 className={TITULO}>
              <TrendingUp size={12} aria-hidden="true" /> Curva de ganho de peso
            </h2>
            <p className="text-[11px] text-texto-3 font-body">Área = faixa recomendada por semana (IOM 2009) · linha = ganho real de cada pesagem</p>
            {serie.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-linha-2 p-6 text-center" data-curva-vazia>
                <p className="text-xs text-texto-2 font-body">Registre o primeiro peso pra ver a curva.</p>
              </div>
            ) : (
              <div className="h-64 w-full" data-grafico-ganho data-pontos={serie.length}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted-foreground) / 0.2)" />
                    <XAxis dataKey="semana" type="number" domain={[0, 40]} ticks={TICKS_SEMANAS} tick={EIXO} tickLine={false} axisLine={{ stroke: "hsl(var(--muted-foreground) / 0.3)" }} unit="s" />
                    <YAxis tick={EIXO} tickLine={false} axisLine={false} width={46} domain={["auto", "auto"]} unit=" kg" />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--muted-foreground) / 0.3)", fontSize: 12 }}
                      labelFormatter={(v) => `Semana ${v}`}
                      formatter={(v, nome) => (Array.isArray(v) ? [`${fmtKg(Number(v[0]))}–${fmtKg(Number(v[1]))} kg`, String(nome)] : [fmtGanho(Number(v)), String(nome)])}
                    />
                    <Area type="monotone" dataKey="faixa" name="Faixa recomendada" stroke="hsl(var(--primary) / 0.5)" fill="hsl(var(--primary) / 0.15)" strokeWidth={1} dot={false} activeDot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="ganho" name="Ganho real" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <section className={CARD} data-card="registros">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className={TITULO}>
                  <Scale size={12} aria-hidden="true" /> Registros de peso
                </h2>
                <p className="text-[11px] text-texto-3 font-body" data-contagem-registros={registrosAtiva.length}>{textoContagemRegistros(registrosAtiva.length)}</p>
              </div>
              <button type="button" onClick={() => setModalRegistro({ aberto: true, registro: null })} className={BTN_PRI} disabled={carregando} data-btn-novo-registro-gestacional>
                <Plus size={12} aria-hidden="true" /> Registrar peso
              </button>
            </header>
            {registrosAtiva.length === 0 ? (
              <p className="text-xs text-texto-3 font-body italic" data-registros-vazio>Nenhum peso registrado ainda.</p>
            ) : (
              <ul className="divide-y divide-linha" data-lista-registros-gestacionais>
                {[...serie].reverse().map((r) => (
                  <ItemRegistro
                    key={r.id}
                    r={r}
                    ocupado={ocupado}
                    onEditar={() => setModalRegistro({ aberto: true, registro: registrosAtiva.find((x) => x.id === r.id) ?? null })}
                    onExcluir={() => setParaExcluirRegistro(r)}
                  />
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {!carregando && encerradas.length > 0 && (
        <section className={CARD} data-card="encerradas">
          <h2 className={TITULO}>
            <ClipboardList size={12} aria-hidden="true" /> Acompanhamentos encerrados
          </h2>
          <ul className="divide-y divide-linha" data-lista-encerradas>
            {encerradas.map((g) => {
              const regs = registros.filter((r) => r.gestacao_id === g.id);
              const gf = ganhoFinal(regs, g);
              return (
                <li key={g.id} className="py-2 flex flex-wrap items-start justify-between gap-2" data-gestacao-encerrada={g.id} data-ganho-final={gf ?? ""}>
                  <div className="min-w-0">
                    <p className="text-sm text-texto font-body">
                      DUM {fmtData(g.dum)} · DPP {fmtData(g.dpp)} · encerrado em {fmtData(g.encerrada_em)}
                    </p>
                    <p className="text-xs text-texto-2 font-body">
                      {g.gemelar ? "gemelar · " : ""}IMC pré {textoIMCPre(g.imc_pre)} · {textoContagemRegistros(regs.length)} · ganho final {gf === null ? "—" : fmtGanho(gf)}
                    </p>
                  </div>
                  <button type="button" onClick={() => setParaExcluirGestacao(g)} className={BTN_MINI_PERIGO} disabled={ocupado} data-btn-excluir-gestacao>
                    <Trash2 size={12} aria-hidden="true" /> Excluir
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <GestacaoDialog
        open={modalGestacao.aberto}
        onOpenChange={(aberto) => setModalGestacao((m) => ({ ...m, aberto }))}
        nutricionistaId={uid ?? ""}
        pacienteId={p.id}
        gestacao={modalGestacao.gestacao}
        antropometrias={antropometrias}
        onSalvo={onGestacaoSalva}
      />
      {ativa && (
        <RegistroGestacionalDialog
          open={modalRegistro.aberto}
          onOpenChange={(aberto) => setModalRegistro((m) => ({ ...m, aberto }))}
          nutricionistaId={uid ?? ""}
          gestacao={ativa}
          registro={modalRegistro.registro}
          registros={registrosAtiva}
          onSalvo={onRegistroSalvo}
        />
      )}

      <AlertDialog open={paraEncerrar} onOpenChange={(aberto) => { if (!aberto) setParaEncerrar(false); }}>
        <AlertDialogContent className="bg-tela border-linha-2">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">Encerrar o acompanhamento?</AlertDialogTitle>
            <AlertDialogDescription className="font-body">
              A gestação {ativa ? <span className="text-texto">(DUM {fmtData(ativa.dum)}, {textoSemana(semanaHoje)})</span> : ""} vai pra lista de encerrados com os registros dela. Depois dá pra iniciar um acompanhamento novo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={BTN_SEC}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className={BTN_PRI} onClick={(e) => { e.preventDefault(); void encerrar(); }} disabled={ocupado} data-btn-confirmar-encerrar>
              {ocupado ? "Encerrando..." : "Encerrar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!paraExcluirRegistro} onOpenChange={(aberto) => { if (!aberto) setParaExcluirRegistro(null); }}>
        <AlertDialogContent className="bg-tela border-linha-2">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">Excluir este registro?</AlertDialogTitle>
            <AlertDialogDescription className="font-body">
              {paraExcluirRegistro ? <span className="text-texto">{fmtData(paraExcluirRegistro.data)} · {textoSemana(paraExcluirRegistro.semana)} · {fmtPeso(paraExcluirRegistro.peso)}</span> : ""} sai da curva e vai pra lixeira.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={BTN_SEC}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className={BTN_PERIGO} onClick={(e) => { e.preventDefault(); void excluirReg(); }} disabled={ocupado} data-btn-confirmar-excluir-registro-gestacional>
              {ocupado ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!paraExcluirGestacao} onOpenChange={(aberto) => { if (!aberto) setParaExcluirGestacao(null); }}>
        <AlertDialogContent className="bg-tela border-linha-2">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">Excluir este acompanhamento?</AlertDialogTitle>
            <AlertDialogDescription className="font-body">
              {paraExcluirGestacao ? <span className="text-texto">DUM {fmtData(paraExcluirGestacao.dum)}</span> : ""} sai da lista com os registros dele e vai pra lixeira.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={BTN_SEC}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className={BTN_PERIGO} onClick={(e) => { e.preventDefault(); void excluirGest(); }} disabled={ocupado} data-btn-confirmar-excluir-gestacao>
              {ocupado ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---- Um registro da lista ----
function ItemRegistro({ r, ocupado, onEditar, onExcluir }: { r: PontoGanho; ocupado: boolean; onEditar: () => void; onExcluir: () => void }) {
  const alerta = alertaPA(r.pa_sistolica, r.pa_diastolica);
  return (
    <li
      className="py-2.5 flex flex-wrap items-start justify-between gap-2"
      data-registro-gestacional={r.id}
      data-registro-data={r.data}
      data-registro-semana={r.semana ? r.semana.semanas : ""}
      data-registro-peso={r.peso}
      data-registro-ganho={r.ganho}
      data-registro-faixa={`${r.faixa.min.toFixed(2)}-${r.faixa.max.toFixed(2)}`}
      data-registro-situacao={r.situacao}
      data-registro-pa={r.pa_sistolica !== null && r.pa_diastolica !== null ? `${r.pa_sistolica}/${r.pa_diastolica}` : ""}
      data-registro-pa-alerta={alerta ? "" : undefined}
    >
      <div className="min-w-0 flex items-start gap-2">
        <Scale className="h-4 w-4 mt-0.5 shrink-0 text-verde-3" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm text-texto font-body">
            <span data-registro-data-texto>{fmtData(r.data)}</span> · <span data-registro-semana-texto>{textoSemana(r.semana)}</span> · <span className="font-semibold" data-registro-peso-texto>{fmtPeso(r.peso)}</span>
          </p>
          <p className="text-xs font-body" data-registro-resumo>
            <span className={`font-semibold ${COR_SITUACAO[r.situacao]}`}>{fmtGanho(r.ganho)}</span>
            <span className="text-texto-2"> (faixa {fmtFaixa(r.faixa)}) · {rotuloSituacao(r.situacao)}</span>
            {r.pa_sistolica !== null && (
              <span className={alerta ? "text-rosa-3 font-semibold" : "text-texto-2"}> · {textoPA(r.pa_sistolica, r.pa_diastolica)}{alerta ? ` · ${alerta}` : ""}</span>
            )}
          </p>
          {r.observacao && <p className="text-xs text-texto-3 font-body whitespace-pre-line" data-registro-observacao>{r.observacao}</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={onEditar} className={BTN_MINI} data-btn-editar-registro-gestacional>
          <Pencil size={12} aria-hidden="true" /> Editar
        </button>
        <button type="button" onClick={onExcluir} className={BTN_MINI_PERIGO} disabled={ocupado} data-btn-excluir-registro-gestacional>
          <Trash2 size={12} aria-hidden="true" /> Excluir
        </button>
      </div>
    </li>
  );
}
