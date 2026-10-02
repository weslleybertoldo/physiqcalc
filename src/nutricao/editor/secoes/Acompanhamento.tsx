// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/pages/paciente/secoes/Acompanhamento.tsx) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, ArrowRight, CalendarDays, ClipboardList, Droplets, Flame, PenLine, Plus, Scale, Trash2, Utensils } from "lucide-react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BTN_LINK, BTN_PERIGO, BTN_PRI, BTN_SEC, INPUT, SELECT } from "@/nutricao/editor/ui/estilos";
import RegistroDiarioDialog from "@/nutricao/editor/ui/RegistroDiarioDialog";
import GraficoEvolucao from "@/nutricao/editor/ui/GraficoEvolucao";
import { useAuth } from "@/nutricao/editor/ui/contexto";
import { excluirRegistro, listarAntropometrias, listarCalculos, listarPlanos, listarRegistrosDoPaciente, type RegistroDiario } from "@/nutricao/editor/lib/acompanhamento";
import {
  MACROS, PRESETS_INTERVALO, PRESETS_PESO, calculoMaisRecente, fmtAgua, fmtVariacao, formatarDataRegistro, hojeISO, inserirRegistro, intervaloDaURL,
  intervaloPreset, kcalAtividadesDia, kcalAtividadesIntervalo, kcalPorMacro, lerSintomas, mediaAgua, nDias, noIntervalo, ordenarRegistros, planoAtivo,
  presetAtivo, serieAgua, serieNutrientes, sintomasFrequentes, textoContagemRegistros, textoDias, textoSintomas, ultimosPesos, validarIntervalo,
  variacaoPeso, type Intervalo,
} from "@/nutricao/editor/lib/acompanhamentoUtil";
import { fmtNum } from "@/nutricao/editor/lib/antropometriaUtil";
import { fmtKcal, totaisDoPlano } from "@/nutricao/editor/lib/dietaUtil";
import { lerAtividades, rotuloFator, rotuloFormula } from "@/nutricao/editor/lib/energeticoUtil";
import { usePaciente } from "@/nutricao/editor/ui/contexto";
import { ConcluidasDoPeriodo } from "@/nutricao/editor/ui/ConcluidasDoPeriodo";
import { somarDias } from "@/nutricao/app/dia";

const CARD = "pq-cartao min-w-0 space-y-3 px-[18px] py-4";
const TITULO = "flex items-center gap-1.5 font-body text-[15px] font-semibold normal-case tracking-[-0.01em] text-texto";
const VAZIO = "rounded-2xl border border-dashed border-linha-2 p-4 text-center font-body text-[12.5px] text-texto-3";
const BTN_MINI = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-linha-2 bg-[rgba(255,255,255,.04)] px-2.5 text-[11.5px] font-semibold text-texto-2 transition-colors hover:text-texto disabled:cursor-not-allowed disabled:opacity-40";
const BTN_MINI_PERIGO = "inline-flex h-7 items-center gap-1 rounded-[9px] border border-[rgba(244,63,94,.35)] bg-transparent px-2.5 text-[11.5px] font-semibold text-rosa-3 transition-colors hover:bg-[rgba(244,63,94,.08)] disabled:opacity-40";
const BTN_PRESET = "rounded-[9px] px-[11px] py-1.5 text-xs font-semibold transition-colors";
const BTN_PRESET_ON = "bg-[#FAFAFA] text-[#09090B]";
const BTN_PRESET_OFF = "text-texto-2 hover:text-texto";
const EIXO = { fontSize: 11, fill: "#71717A" };
const TOOLTIP = { background: "#09090B", border: "1px solid rgba(255,255,255,.12)", fontSize: 12 };

// Seção "Acompanhamento" do paciente (referência: painel por intervalo de datas). Lê as seções donas SEM mexer nelas — plano
// alimentar ativo (W9: kcal e kcal por macro + donut 'Nutrientes'), atividade física do cálculo energético mais recente (W7:
// kcal/dia × dias do intervalo), últimos pesos da antropometria (W6: GraficoEvolucao reusado) — e grava só na tabela nova
// `registros_diarios` (água + sintomas + observação, 1 registro vivo por dia): 'Ingestão hídrica' (barras por dia), 'Sintomas
// mais frequentes' (top 5) e a lista 'Registros do período'. O intervalo vive na URL (`?de=&ate=`), padrão últimos 7 dias.
export default function Acompanhamento() {
  const { paciente: p, recarregar } = usePaciente();
  const { user } = useAuth();
  const uid = user?.id;
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const hoje = hojeISO();
  const intervalo = useMemo(() => intervaloDaURL(params, hoje), [params, hoje]);
  const dias = nDias(intervalo.de, intervalo.ate);
  const preset = presetAtivo(intervalo, hoje);
  const diasDoIntervalo = useMemo(() => Array.from({ length: Math.min(dias, 62) }, (_, i) => somarDias(intervalo.ate, i - (Math.min(dias, 62) - 1))), [dias, intervalo.ate]);
  // rascunho das datas digitadas enquanto o intervalo está inválido (a URL só recebe intervalo válido)
  const [rascunho, setRascunho] = useState<Intervalo | null>(null);
  const [erroIntervalo, setErroIntervalo] = useState<string | null>(null);
  const mostrado = rascunho ?? intervalo;

  const chaveReg = useMemo(() => ["registros-diarios", p.id], [p.id]);
  const planosQ = useQuery({ queryKey: ["acompanhamento-planos", p.id], queryFn: () => listarPlanos(p.id) });
  const antroQ = useQuery({ queryKey: ["acompanhamento-antropometrias", p.id], queryFn: () => listarAntropometrias(p.id) });
  const calcQ = useQuery({ queryKey: ["acompanhamento-calculos", p.id], queryFn: () => listarCalculos(p.id) });
  const regQ = useQuery({ queryKey: chaveReg, queryFn: () => listarRegistrosDoPaciente(p.id) });
  const carregando = !uid || planosQ.isPending || antroQ.isPending || calcQ.isPending || regQ.isPending;
  const atualizando = carregando || planosQ.isFetching || antroQ.isFetching || calcQ.isFetching || regQ.isFetching;
  const erro = planosQ.error ?? antroQ.error ?? calcQ.error ?? regQ.error;

  // plano alimentar ativo → kcal + macros
  const plano = useMemo(() => planoAtivo(planosQ.data ?? []), [planosQ.data]);
  const totais = useMemo(() => (plano ? totaisDoPlano(plano.refeicoes) : null), [plano]);
  const nutrientes = useMemo(() => (totais ? serieNutrientes(totais) : []), [totais]);
  const kcalMacro = useMemo(() => (totais ? kcalPorMacro(totais) : null), [totais]);
  // atividade física do cálculo mais recente
  const calculo = useMemo(() => calculoMaisRecente(calcQ.data ?? []), [calcQ.data]);
  const atividades = useMemo(() => (calculo ? lerAtividades(calculo.atividades) : []), [calculo]);
  const kcalDia = calculo ? kcalAtividadesDia(atividades, calculo.peso) : 0;
  const kcalPeriodo = kcalAtividadesIntervalo(kcalDia, dias);
  // peso: últimos 10/20/30
  const [filtroPeso, setFiltroPeso] = useState(PRESETS_PESO[0]);
  const pesos = useMemo(() => ultimosPesos(antroQ.data ?? [], filtroPeso), [antroQ.data, filtroPeso]);
  const variacao = useMemo(() => variacaoPeso(pesos), [pesos]);
  // registros diários do intervalo → água + sintomas + lista
  const registros = useMemo(() => regQ.data ?? [], [regQ.data]);
  const noPeriodo = useMemo(() => ordenarRegistros(registros.filter((r) => noIntervalo(r.data, intervalo.de, intervalo.ate))), [registros, intervalo]);
  const agua = useMemo(() => serieAgua(noPeriodo, intervalo.de, intervalo.ate), [noPeriodo, intervalo]);
  const media = mediaAgua(noPeriodo);
  const sintomas = useMemo(() => sintomasFrequentes(noPeriodo), [noPeriodo]);

  const [modal, setModal] = useState<{ aberto: boolean; registro: RegistroDiario | null }>({ aberto: false, registro: null });
  const [paraExcluir, setParaExcluir] = useState<RegistroDiario | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [salvando, setSalvando] = useState(0); // gravações assíncronas fora do modal — o E2E espera voltar a 0

  const aplicarIntervalo = (de: string, ate: string) => {
    const problema = validarIntervalo(de, ate, hoje);
    setErroIntervalo(problema);
    if (problema) {
      setRascunho({ de, ate });
      return;
    }
    setRascunho(null);
    setParams((atual) => { const n = new URLSearchParams(atual); n.set("de", de); n.set("ate", ate); return n; }, { replace: true });
  };
  const aplicarPreset = (n: number) => {
    const i = intervaloPreset(hoje, n);
    setErroIntervalo(null);
    setRascunho(null);
    setParams((atual) => { const n = new URLSearchParams(atual); n.set("de", i.de); n.set("ate", i.ate); return n; }, { replace: true });
  };

  const onSalvo = (r: RegistroDiario) => {
    qc.setQueryData<RegistroDiario[]>(chaveReg, (old) => inserirRegistro(old ?? [], r));
    void recarregar(); // o banco mexeu em pacientes.updated_at (trigger)
  };
  const excluir = async () => {
    if (!paraExcluir) return;
    const alvo = paraExcluir;
    setExcluindo(true);
    setSalvando((n) => n + 1);
    try {
      await excluirRegistro(alvo.id);
      qc.setQueryData<RegistroDiario[]>(chaveReg, (old) => (old ?? []).filter((x) => x.id !== alvo.id));
      setParaExcluir(null);
      toast.success("Registro excluído");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir o registro");
    } finally {
      setExcluindo(false);
      setSalvando((n) => n - 1);
    }
  };

  const pesoUltimo = variacao?.ultimo ?? null;

  return (
    <div className="space-y-4" data-secao-acompanhamento data-atualizando={atualizando ? "1" : "0"} data-salvando-registro={salvando} data-intervalo-dias={dias}>
      {erro && (
        <p role="alert" className="text-sm text-rosa-3 font-body" data-erro-acompanhamento>
          Não foi possível carregar o acompanhamento: {erro instanceof Error ? erro.message : "erro"}
        </p>
      )}

      {/* cabeçalho: intervalo de datas + presets + registrar dia */}
      <section className={CARD} data-card="intervalo">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className={TITULO}>
              <CalendarDays size={12} aria-hidden="true" /> Acompanhamento
            </h2>
            <p className="text-[11px] text-texto-3 font-body" data-intervalo-texto>
              {carregando ? "Carregando..." : `${formatarDataRegistro(intervalo.de)} – ${formatarDataRegistro(intervalo.ate)} · ${textoDias(dias)}`}
            </p>
          </div>
          <button type="button" onClick={() => setModal({ aberto: true, registro: null })} className={BTN_PRI} disabled={carregando} data-btn-novo-registro>
            <Plus size={12} aria-hidden="true" /> Registrar dia
          </button>
        </header>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-[10px] uppercase tracking-wider text-texto-2 font-body space-y-1">
            <span>De</span>
            <input type="date" className={`${INPUT} min-w-[9.5rem]`} value={mostrado.de} max={hoje} onChange={(e) => aplicarIntervalo(e.target.value, mostrado.ate)} data-leitura data-intervalo-de />
          </label>
          <label className="text-[10px] uppercase tracking-wider text-texto-2 font-body space-y-1">
            <span>Até</span>
            <input type="date" className={`${INPUT} min-w-[9.5rem]`} value={mostrado.ate} max={hoje} onChange={(e) => aplicarIntervalo(mostrado.de, e.target.value)} data-leitura data-intervalo-ate />
          </label>
          <div className="inline-flex rounded-xl border border-linha bg-superficie p-[3px]" role="group" aria-label="Intervalo rápido">
            {PRESETS_INTERVALO.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={preset === n}
                onClick={() => aplicarPreset(n)}
                className={`${BTN_PRESET} ${preset === n ? BTN_PRESET_ON : BTN_PRESET_OFF}`}
                data-leitura data-btn-preset={n}
              >
                {n} dias
              </button>
            ))}
          </div>
        </div>
        {erroIntervalo && <p role="alert" className="text-xs text-rosa-3 font-body" data-erro-intervalo>{erroIntervalo}</p>}
      </section>

      {/* F3 (R14): os ✓ das refeições por dia — a nutricionista vê o que o aluno marcou no app */}
      <ConcluidasDoPeriodo pacienteId={p.id} refeicoes={plano ? plano.refeicoes : null} dias={diasDoIntervalo} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 1) plano alimentar ativo */}
        <section className={CARD} data-card="plano" data-plano-id={plano?.id ?? ""} data-plano-kcal={totais ? Math.round(totais.energia_kcal) : ""}>
          <header className="flex items-center justify-between gap-2">
            <h2 className={TITULO}>
              <Utensils size={12} aria-hidden="true" /> Plano alimentar
            </h2>
            <Link to="?secao=planejamento" className={BTN_LINK} data-link-planejamento>
              Ver planejamento <ArrowRight size={11} aria-hidden="true" />
            </Link>
          </header>
          {!carregando && !plano && <div className={VAZIO} data-plano-vazio>Nenhum plano alimentar — crie um no Planejamento.</div>}
          {plano && totais && kcalMacro && (
            <div className="space-y-3">
              <div>
                <p className="text-sm text-texto font-body truncate" data-plano-titulo>
                  {plano.titulo}
                  {plano.favorito && <span className="text-[10px] uppercase tracking-wider text-verde-3 font-semibold pl-2">favorito</span>}
                </p>
                <p className="text-2xl font-semibold text-texto" data-plano-kcal-texto>
                  {fmtKcal(totais.energia_kcal)} <span className="text-xs text-texto-2 uppercase tracking-wider">kcal</span>
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {MACROS.map((m) => {
                  const kcal = kcalMacro[m.chave];
                  const fatia = nutrientes.find((n) => n.chave === m.chave);
                  return (
                    <div key={m.chave} className="border border-linha p-2 min-w-0" data-plano-macro={m.chave} data-kcal={Math.round(kcal)} data-pct={fatia?.pct ?? 0}>
                      <p className="text-[10px] uppercase tracking-wider text-texto-2 font-semibold truncate flex items-center gap-1">
                        <span className="inline-block h-2 w-2 shrink-0" style={{ background: m.cor }} aria-hidden="true" /> {m.rotulo}
                      </p>
                      <p className="text-sm text-texto font-body">{fmtKcal(kcal)} kcal</p>
                      <p className="text-[11px] text-texto-2 font-body">{fatia ? `${fatia.pct}%` : "—"}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* 2) nutrientes (donut) */}
        <section className={CARD} data-card="nutrientes">
          <h2 className={TITULO}>
            <Activity size={12} aria-hidden="true" /> Nutrientes
          </h2>
          {!carregando && nutrientes.length === 0 && <div className={VAZIO} data-nutrientes-vazio>Sem plano alimentar com alimentos — o gráfico segue o plano ativo.</div>}
          {nutrientes.length > 0 && (
            <div className="h-60 w-full" data-grafico-nutrientes data-pontos={nutrientes.length}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                  <Pie data={nutrientes} dataKey="kcal" nameKey="rotulo" cx="50%" cy="50%" innerRadius="52%" outerRadius="78%" paddingAngle={2} stroke="#09090B" isAnimationActive={false}>
                    {nutrientes.map((n) => (
                      <Cell key={n.chave} fill={n.cor} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP} formatter={(v, nome) => [`${fmtKcal(typeof v === "number" ? v : Number(v))} kcal`, String(nome)]} />
                  <Legend
                    wrapperStyle={{ fontSize: 11 }}
                    formatter={(valor) => {
                      const n = nutrientes.find((x) => x.rotulo === valor);
                      return n ? `${valor} ${n.pct}%` : String(valor);
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {/* 3) atividade física */}
        <section className={CARD} data-card="atividade" data-atividade-kcal={calculo ? kcalPeriodo : ""} data-atividade-dias={dias}>
          <header className="flex items-center justify-between gap-2">
            <h2 className={TITULO}>
              <Flame size={12} aria-hidden="true" /> Atividade física
            </h2>
            <Link to="?secao=calculo-energetico" className={BTN_LINK} data-link-calculo>
              Ver cálculo energético <ArrowRight size={11} aria-hidden="true" />
            </Link>
          </header>
          {!carregando && !calculo && <div className={VAZIO} data-atividade-vazio>Sem cálculo energético — as kcal das atividades vêm do cálculo mais recente.</div>}
          {calculo && (
            <div className="space-y-1">
              <p className="text-2xl font-semibold text-texto" data-atividade-texto>
                {fmtKcal(kcalPeriodo)} <span className="text-xs text-texto-2 uppercase tracking-wider">kcal {textoDias(dias)}</span>
              </p>
              <p className="text-xs text-texto-2 font-body" data-atividade-detalhe>
                {atividades.length
                  ? `${fmtKcal(Math.round(kcalDia))} kcal/dia em ${atividades.length === 1 ? "1 atividade" : `${atividades.length} atividades`}${calculo.peso === null ? " · sem peso no cálculo" : ""}`
                  : "Nenhuma atividade no cálculo"}
                {" · "}
                {rotuloFormula(calculo.formula)} · fator {rotuloFator(calculo.fator_atividade)}
              </p>
            </div>
          )}
        </section>

        {/* 4) peso */}
        <section className={CARD} data-card="peso" data-peso-pontos={pesos.length} data-peso-ultimo={pesoUltimo ?? ""} data-peso-variacao={variacao?.diferenca ?? ""}>
          <header className="flex flex-wrap items-center justify-between gap-2">
            <h2 className={TITULO}>
              <Scale size={12} aria-hidden="true" /> Peso
            </h2>
            <label className="text-[10px] uppercase tracking-wider text-texto-2 font-body flex items-center gap-2">
              <span>Últimos</span>
              <select className={`${SELECT} w-auto min-w-[4.5rem]`} value={filtroPeso} onChange={(e) => setFiltroPeso(Number(e.target.value))} data-leitura data-filtro-peso>
                {PRESETS_PESO.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
          </header>
          {!carregando && pesos.length === 0 && <div className={VAZIO} data-peso-vazio>Sem antropometria — o peso vem das avaliações registradas.</div>}
          {pesos.length > 0 && variacao && (
            <div className="space-y-2">
              <p className="text-sm text-texto font-body" data-peso-texto>
                Último <span className="font-semibold">{fmtNum(variacao.ultimo, 1)} kg</span>
                <span className="text-texto-2"> · variação {fmtVariacao(variacao.diferenca)} kg em {pesos.length === 1 ? "1 avaliação" : `${pesos.length} avaliações`}</span>
              </p>
              <GraficoEvolucao serie={pesos} />
            </div>
          )}
        </section>

        {/* 5) ingestão hídrica */}
        <section className={CARD} data-card="agua" data-agua-media={media} data-agua-dias={noPeriodo.length}>
          <h2 className={TITULO}>
            <Droplets size={12} aria-hidden="true" /> Ingestão hídrica
          </h2>
          {!carregando && noPeriodo.length === 0 && <div className={VAZIO} data-agua-vazio>Nenhum registro no período — use 'Registrar dia'.</div>}
          {noPeriodo.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-texto font-body" data-agua-texto>
                média <span className="font-semibold">{fmtAgua(media)}/dia</span>
                <span className="text-texto-2"> · {textoContagemRegistros(noPeriodo.length)}</span>
              </p>
              <div className="h-60 w-full" data-grafico-agua data-pontos={agua.length}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={agua} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.07)" vertical={false} />
                    <XAxis dataKey="rotulo" tick={EIXO} tickLine={false} axisLine={{ stroke: "rgba(255,255,255,.12)" }} interval={agua.length > 8 ? Math.ceil(agua.length / 8) - 1 : 0} />
                    <YAxis tick={EIXO} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => fmtAgua(Number(v))} />
                    <Tooltip contentStyle={TOOLTIP} cursor={{ fill: "rgba(255,255,255,.05)" }} formatter={(v) => [fmtAgua(Number(v)), "Água"]} />
                    <Bar dataKey="ml" name="Água" fill="#3b82f6" radius={[2, 2, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </section>

        {/* 6) sintomas mais frequentes */}
        <section className={CARD} data-card="sintomas">
          <h2 className={TITULO}>
            <ClipboardList size={12} aria-hidden="true" /> Sintomas mais frequentes
          </h2>
          {!carregando && sintomas.length === 0 && <div className={VAZIO} data-sintomas-vazio>Nenhum sintoma registrado no período.</div>}
          {sintomas.length > 0 && (
            <ul className="divide-y divide-linha" data-lista-sintomas>
              {sintomas.map((s) => (
                <li key={s.chave} className="flex items-center justify-between gap-2 py-1.5 text-sm font-body" data-sintoma={s.chave} data-sintoma-n={s.n}>
                  <span className="text-texto truncate">{s.rotulo}</span>
                  <span className="text-xs text-texto-2 shrink-0">{s.n === 1 ? "1 dia" : `${s.n} dias`}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* 7) registros do período */}
      <section className={CARD} data-card="registros">
        <header className="flex items-center justify-between gap-2">
          <h2 className={TITULO}>
            <Droplets size={12} aria-hidden="true" /> Registros do período
          </h2>
          <span className="text-[11px] text-texto-2 font-body" data-contagem-registros={noPeriodo.length}>{textoContagemRegistros(noPeriodo.length)}</span>
        </header>
        {!carregando && noPeriodo.length === 0 && (
          <div className={`${VAZIO} space-y-1`} data-registros-vazio>
            <p className="text-sm text-texto">Nenhum dia registrado neste intervalo</p>
            <p>Registre água, sintomas e observações de cada dia pra acompanhar o aluno entre as consultas.</p>
          </div>
        )}
        {noPeriodo.length > 0 && (
          <ul className="divide-y divide-linha" data-lista-registros>
            {noPeriodo.map((r) => {
              const chaves = lerSintomas(r.sintomas);
              return (
                <li key={r.id} className="py-2 flex flex-wrap items-start justify-between gap-2" data-registro={r.id} data-registro-data={r.data} data-registro-agua={r.agua_ml} data-registro-sintomas={chaves.join(",")}>
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm text-texto font-body" data-registro-texto>
                      <span className="font-semibold">{formatarDataRegistro(r.data)}</span> · {fmtAgua(r.agua_ml)} · {chaves.length ? textoSintomas(chaves) : <span className="text-texto-2">sem sintomas</span>}
                    </p>
                    {r.observacao && <p className="text-xs text-texto-2 font-body line-clamp-2" data-registro-observacao>{r.observacao}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button type="button" onClick={() => setModal({ aberto: true, registro: r })} className={BTN_MINI} data-btn-editar-registro>
                      <PenLine size={11} aria-hidden="true" /> Editar
                    </button>
                    <button type="button" onClick={() => setParaExcluir(r)} className={BTN_MINI_PERIGO} data-btn-excluir-registro>
                      <Trash2 size={11} aria-hidden="true" /> Excluir
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <RegistroDiarioDialog
        open={modal.aberto}
        onOpenChange={(aberto) => setModal((m) => ({ ...m, aberto }))}
        nutricionistaId={uid ?? ""}
        pacienteId={p.id}
        registro={modal.registro}
        registros={registros}
        onSalvo={onSalvo}
      />

      <AlertDialog open={!!paraExcluir} onOpenChange={(aberto) => { if (!aberto) setParaExcluir(null); }}>
        <AlertDialogContent className="border-linha-2 bg-tela text-texto sm:rounded-[24px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">Excluir este registro?</AlertDialogTitle>
            <AlertDialogDescription className="font-body text-texto-2">
              {paraExcluir ? <span className="text-texto">{formatarDataRegistro(paraExcluir.data)} · {fmtAgua(paraExcluir.agua_ml)}</span> : ""} sai do acompanhamento. O registro fica na lixeira e o dia pode ser registrado de novo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={BTN_SEC}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className={BTN_PERIGO} onClick={(e) => { e.preventDefault(); void excluir(); }} disabled={excluindo} data-btn-confirmar-excluir-registro>
              {excluindo ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
