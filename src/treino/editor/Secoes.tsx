import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, ChevronLeft, ChevronRight, FileSpreadsheet, FileText, Minus, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SERIES_PADRAO_MAX, SERIES_PADRAO_MIN, clampSeries } from "@/lib/seriesPadrao";
import { calcularVolumePraticado } from "@/lib/volumeSemanal";
import { chaveData, datasDaSemana } from "@/treino/datas";
import { formatDuracao } from "@/lib/treinoResumo";
import { Botao } from "@/ui/premium/Botao";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { Esqueleto, EstadoErro } from "@/ui/premium/Estados";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { Segmentado } from "@/ui/premium/Segmentado";
import { useConfirmar } from "@/ui/premium/useConfirmar";
import { carregarHistoricoMes, carregarPlanoParaPdf, carregarTreinoDoHistorico, carregarVolumePraticado, type ItemHistorico } from "./api";
import { diasAte, padraoDoAluno, textoDataCurta, textoSeriesVolume, volumePorGrupo, type VolumeGrupo } from "./regras";
import { MESES } from "./relatorio";
import { mensagemDoErro, useAcoesEditor, useDadosEditor, useVolumeDoAluno } from "./useEditorTreino";

// ───────────────────────── barras de séries por grupo (card do Resumo e aba) ─────────────────────────

/** "Séries por semana, por grupo" (tela 7): nome, barra violeta e o nº — o mesmo desenho no card e na aba.
 *  hml-17 (H-39): `feitoFalhou` = a leitura do feito na semana falhou → "feito —" (nunca "feito 0", que diz que o aluno não treinou). */
export function BarrasVolume({ grupos, maximo = 5, feitos, feitoFalhou = false }: { grupos: VolumeGrupo[]; maximo?: number; feitos?: Map<string, number>; feitoFalhou?: boolean }) {
  const lista = grupos.slice(0, maximo);
  const topo = Math.max(1, ...lista.map((g) => g.total), 20);
  return (
    <div className="flex flex-col gap-[9px]" data-barras-volume>
      {lista.map((g) => (
        <div key={g.chave} className="flex items-center gap-3 text-[13px]" data-volume-grupo={g.chave} data-volume-total={g.total}>
          <span className="w-[76px] flex-none text-texto-2">{g.nome}</span>
          <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-[rgba(255,255,255,.06)]">
            <span
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${Math.min(100, (g.total / topo) * 100)}%`, background: "linear-gradient(90deg,var(--p-violeta),var(--p-violeta-2))" }}
            />
          </span>
          <b className="w-7 flex-none text-right font-semibold tabular-nums text-texto">{textoSeriesVolume(g.total)}</b>
          {feitos && (
            <span className="w-[62px] flex-none text-right text-[11.5px] tabular-nums text-texto-3" data-volume-feito={g.chave}>
              feito {feitoFalhou ? "—" : textoSeriesVolume(feitos.get(g.chave) ?? 0)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ───────────────────────── séries e troca do treino ─────────────────────────

/** Nº de séries (padrão para todos × personalizado por exercício — C41) e a data da troca do treino (NF7). */
export function SeriesETroca({ treinoUserId, somenteLeitura }: { treinoUserId: string; somenteLeitura: boolean }) {
  const dados = useDadosEditor(treinoUserId);
  const acoes = useAcoesEditor(treinoUserId);
  const d = dados.data;
  const [n, setN] = useState<number | null>(null);
  const confirmar = useConfirmar();
  if (!d) return <Cartao className="p-5"><Esqueleto className="h-[200px] w-full" /></Cartao>;
  const modo = d.config?.series_modo === "padrao" ? "padrao" : "personalizada";
  const padrao = padraoDoAluno(d);
  const qtd = n ?? padrao;
  const troca = d.config?.proxima_troca_treino ?? null;
  const faltam = diasAte(troca);
  return (
    <Cartao className="flex flex-col gap-4 px-[18px] py-4" data-series-troca>
      <div>
        <CabecalhoCartao titulo="Número de séries" />
        <Segmentado
          rotulo="Modo das séries"
          opcoes={[{ valor: "padrao", rotulo: "Padrão para todos" }, { valor: "personalizada", rotulo: "Por exercício" }]}
          valor={modo}
          aoMudar={(v) => {
            if (somenteLeitura || v === modo) return;
            if (v === "personalizada") void acoes.configurar({ series_modo: "personalizada" }, "Séries por exercício: ajuste no editor acima.");
            else void acoes.configurar({ series_modo: "padrao" });
          }}
        />
        {modo === "padrao" ? (
          <div className="mt-3 flex flex-wrap items-center gap-3" data-series-padrao>
            <button type="button" disabled={somenteLeitura || qtd <= SERIES_PADRAO_MIN} onClick={() => setN(clampSeries(qtd - 1))} aria-label="Menos uma série" className="pq-ibtn" style={{ width: 34, height: 34 }}>
              <Minus aria-hidden />
            </button>
            <b className="min-w-[2ch] text-center text-[26px] font-semibold tabular-nums text-violeta-3" data-series-padrao-qtd>{qtd}</b>
            <button type="button" disabled={somenteLeitura || qtd >= SERIES_PADRAO_MAX} onClick={() => setN(clampSeries(qtd + 1))} aria-label="Mais uma série" className="pq-ibtn" style={{ width: 34, height: 34 }}>
              <Plus aria-hidden />
            </button>
            <span className="text-[12.5px] text-texto-2">séries em cada exercício</span>
            {!somenteLeitura && (
              <Botao
                tamanho="sm"
                variante="w"
                className="ml-auto"
                onClick={async () => {
                  if (!(await confirmar({ titulo: `${qtd} ${qtd === 1 ? "série" : "séries"} em TODOS os exercícios do aluno?`,
                    descricao: "Os números próprios de cada exercício saem (repetições, descanso, carga e observações ficam).",
                    rotuloConfirmar: "Aplicar em todos", perigo: true }))) return;
                  await acoes.aplicarPadrao(qtd);
                  setN(null);
                }}
                data-series-aplicar
              >
                Aplicar a todos
              </Botao>
            )}
          </div>
        ) : (
          <p className="mt-3 text-[12.5px] text-texto-2" data-series-personalizada>
            Cada exercício com o seu número, no campo SÉRIES do editor. Sem número próprio vale {padrao} {padrao === 1 ? "série" : "séries"}.
          </p>
        )}
      </div>
      <div className="border-t border-[rgba(255,255,255,.06)] pt-3">
        <CabecalhoCartao
          titulo="Troca do treino"
          extra={troca ? <Chip tom="t" icone={CalendarClock} data-troca-chip>{(textoDataCurta(troca) ?? "").toUpperCase()}</Chip> : undefined}
        />
        <p className="-mt-1 mb-2 text-[12px] text-texto-3">
          {troca
            ? faltam !== null && faltam >= 0
              ? `Novo ciclo em ${faltam === 0 ? "hoje" : faltam === 1 ? "1 dia" : `${faltam} dias`} — aparece nos próximos compromissos.`
              : "A data passou: marque a do próximo ciclo."
            : "Quando o treino muda (novo ciclo). Aparece nos próximos compromissos do aluno."}
        </p>
        {!somenteLeitura && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={troca ?? ""}
              onChange={(e) => void acoes.configurar({ proxima_troca_treino: e.target.value || null }, e.target.value ? `Troca do treino: ${textoDataCurta(e.target.value)}.` : "Troca do treino sem data.")}
              className="h-9 rounded-xl border border-linha-2 bg-[rgba(255,255,255,.04)] px-3 text-[13px] text-texto outline-none [color-scheme:dark] focus:border-violeta-3"
              data-troca-data
            />
            {troca && (
              <Botao tamanho="sm" variante="g" onClick={() => void acoes.configurar({ proxima_troca_treino: null }, "Troca do treino sem data.")} data-troca-limpar>
                Tirar a data
              </Botao>
            )}
          </div>
        )}
      </div>
    </Cartao>
  );
}

// ───────────────────────── volume semanal ─────────────────────────

/** Séries por semana por grupo (C38): o programado (a semana do aluno) e o feito nesta semana (séries concluídas no app). */
export function VolumeDoAluno({ treinoUserId, leituraAluno }: { treinoUserId: string; leituraAluno?: string | null }) {
  // W16: quem só lê pelo principal (a nutricionista) vê o programado; o feito na semana é das funções do Treino
  const volume = useVolumeDoAluno(leituraAluno ? null : treinoUserId, leituraAluno);
  const dias = datasDaSemana(new Date());
  const inicio = chaveData(dias[0]);
  const fim = chaveData(dias[6]);
  const praticado = useQuery({
    queryKey: ["treino-volume-praticado", treinoUserId, inicio],
    queryFn: () => carregarVolumePraticado(treinoUserId, inicio, fim),
    enabled: !leituraAluno,
    staleTime: 60_000,
  });
  const grupos = useMemo(() => volumePorGrupo(volume.data ?? []), [volume.data]);
  const feitos = useMemo(() => new Map(volumePorGrupo(calcularVolumePraticado(praticado.data ?? [])).map((g) => [g.chave, g.total])), [praticado.data]);
  // hml-17 (H-39): o feito da semana não veio — "feito —" e o aviso com "Tentar de novo" (antes, "feito 0" em cada grupo)
  const feitoFalhou = !leituraAluno && praticado.isError && !praticado.data;
  return (
    <Cartao className="px-[18px] py-4" data-volume-aluno>
      <CabecalhoCartao titulo="Volume semanal" extra={<Chip tom="g">SÉRIES POR GRUPO</Chip>} />
      <p className="-mt-1 mb-3 text-[12px] text-texto-3">
        {leituraAluno ? "Programado na semana do aluno (secundários contam meia série)." : "Programado na semana do aluno (secundários contam meia série) e o feito nesta semana no app."}
      </p>
      {volume.isLoading ? (
        <Esqueleto className="h-[150px] w-full" />
      ) : volume.error ? (
        <EstadoErro titulo="Não deu para calcular" texto={mensagemDoErro(volume.error)} aoTentar={() => void volume.refetch()} />
      ) : grupos.length === 0 ? (
        <p className="text-[12.5px] text-texto-3" data-volume-vazio>Monte a semana do aluno para ver o volume.</p>
      ) : (
        <>
          <BarrasVolume grupos={grupos} maximo={grupos.length} feitos={leituraAluno ? undefined : feitos} feitoFalhou={feitoFalhou} />
          {feitoFalhou && (
            <p className="mt-3 flex flex-wrap items-center gap-2 text-[12px] font-medium text-rosa-3" role="alert" data-volume-feito-erro>
              Não deu para carregar o feito nesta semana.
              <Botao tamanho="sm" icone={RefreshCw} onClick={() => void praticado.refetch()} data-volume-feito-tentar>Tentar de novo</Botao>
            </p>
          )}
        </>
      )}
    </Cartao>
  );
}

// ───────────────────────── histórico ─────────────────────────

function useMes() {
  const agora = new Date();
  const [ref, setRef] = useState({ ano: agora.getFullYear(), mes: agora.getMonth() + 1 });
  const mover = (delta: number) =>
    setRef((r) => {
      const d = new Date(r.ano, r.mes - 1 + delta, 1);
      return { ano: d.getFullYear(), mes: d.getMonth() + 1 };
    });
  const futuro = ref.ano > agora.getFullYear() || (ref.ano === agora.getFullYear() && ref.mes >= agora.getMonth() + 1);
  return { ...ref, mover, noMesAtual: futuro };
}

function SeletorMes({ ano, mes, mover, noMesAtual }: { ano: number; mes: number; mover: (d: number) => void; noMesAtual: boolean }) {
  return (
    <div className="flex items-center gap-1" data-seletor-mes={`${ano}-${String(mes).padStart(2, "0")}`}>
      <button type="button" aria-label="Mês anterior" onClick={() => mover(-1)} className="pq-ibtn" style={{ width: 30, height: 30, borderRadius: 10 }}>
        <ChevronLeft aria-hidden />
      </button>
      <span className="min-w-[112px] text-center text-[12.5px] font-semibold text-texto">{MESES[mes - 1]} {ano}</span>
      <button type="button" aria-label="Próximo mês" disabled={noMesAtual} onClick={() => mover(1)} className="pq-ibtn disabled:opacity-30" style={{ width: 30, height: 30, borderRadius: 10 }}>
        <ChevronRight aria-hidden />
      </button>
    </div>
  );
}

/** Histórico de treinos do aluno por mês (C39): data, treino, duração e exercícios; tocar abre o treino feito. */
export function HistoricoDoAluno({ treinoUserId }: { treinoUserId: string }) {
  const m = useMes();
  const q = useQuery({ queryKey: ["treino-historico", treinoUserId, m.ano, m.mes], queryFn: () => carregarHistoricoMes(treinoUserId, m.ano, m.mes), staleTime: 60_000 });
  const [aberto, setAberto] = useState<ItemHistorico | null>(null);
  const det = useQuery({
    queryKey: ["treino-historico-item", treinoUserId, aberto?.chave],
    queryFn: () => carregarTreinoDoHistorico(treinoUserId, aberto!.chave),
    enabled: !!aberto,
    staleTime: 5 * 60_000,
  });
  const itens = q.data ?? [];
  return (
    <Cartao className="px-[18px] py-4" data-historico-aluno>
      <CabecalhoCartao titulo="Histórico" extra={q.data ? <Chip tom="g">{new Set(itens.map((i) => i.data)).size} {new Set(itens.map((i) => i.data)).size === 1 ? "DIA" : "DIAS"}</Chip> : undefined} acao={<SeletorMes {...m} />} />
      {q.isLoading ? (
        <Esqueleto className="h-[140px] w-full" />
      ) : q.error ? (
        <EstadoErro titulo="Não deu para abrir o histórico" texto={mensagemDoErro(q.error)} aoTentar={() => void q.refetch()} />
      ) : itens.length === 0 ? (
        <p className="py-2 text-[12.5px] text-texto-3" data-historico-vazio>Nenhum treino feito em {MESES[m.mes - 1].toLowerCase()}.</p>
      ) : (
        <ul data-historico-lista>
          {itens.map((i) => (
            <li key={i.chave}>
              <button type="button" onClick={() => setAberto(i)} className="flex w-full items-center gap-3 border-t border-[rgba(255,255,255,.06)] py-2 text-left" data-historico-item={i.data}>
                <span className="w-12 flex-none text-[12px] font-semibold tabular-nums text-texto-2">{i.data.slice(8, 10)}/{i.data.slice(5, 7)}</span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[13px] font-semibold text-texto">{i.nomeTreino}</b>
                  <span className="block text-[11.5px] text-texto-3">
                    {i.totalExercicios} {i.totalExercicios === 1 ? "exercício" : "exercícios"}
                    {i.duracaoSegundos ? ` · ${formatDuracao(i.duracaoSegundos)}` : " · sem cronômetro"}
                    {i.academia ? ` · ${i.academia}` : ""}
                  </span>
                </span>
                <ChevronRight aria-hidden className="h-4 w-4 flex-none text-texto-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <PainelDeslizante aberto={!!aberto} aoMudar={(a) => !a && setAberto(null)} lado="direita" titulo={aberto?.nomeTreino ?? "Treino"} descricao={aberto ? `${aberto.data.split("-").reverse().join("/")}${aberto.duracaoSegundos ? ` · ${formatDuracao(aberto.duracaoSegundos)}` : ""}` : undefined}>
        {det.isLoading ? (
          <Esqueleto className="h-[200px] w-full" />
        ) : det.isError && !det.data ? (
          // hml-17 (H-39): a leitura falhou — o aviso com "Tentar de novo" ("Não achamos" fica só para o treino que não existe)
          <div data-historico-detalhe-erro>
            <EstadoErro titulo="Não deu para abrir este treino" aoTentar={() => void det.refetch()} />
          </div>
        ) : !det.data ? (
          <p className="text-[13px] text-texto-3">Não achamos esse treino.</p>
        ) : (
          <ul className="flex flex-col" data-historico-detalhe>
            {det.data.exercicios_concluidos.map((e, i) => (
              <li key={`${e.nome}-${i}`} className="border-t border-[rgba(255,255,255,.06)] py-2">
                <b className="block text-[13px] font-semibold text-texto">{e.nome}</b>
                <span className="text-[12px] text-texto-2">
                  {(e.series ?? []).length
                    ? (e.series ?? []).map((s) => `${String(s.peso).replace(".", ",")} kg × ${s.reps}`).join(" · ")
                    : `${e.series_concluidas ?? 0} séries`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </PainelDeslizante>
    </Cartao>
  );
}

// ───────────────────────── relatório do mês e PDF do treino ─────────────────────────

/** Relatório do mês (C45 — PDF e Excel) e o PDF do treino (C80), com a prescrição do profissional. */
export function RelatorioDoAluno({ treinoUserId, nomeAluno }: { treinoUserId: string; nomeAluno?: string | null }) {
  const m = useMes();
  const [gerando, setGerando] = useState<null | "pdf" | "excel" | "treino">(null);
  const gerar = async (tipo: "pdf" | "excel") => {
    setGerando(tipo);
    try {
      const r = await import("./relatorio");
      const [rel, dados] = await Promise.all([r.carregarRelatorioCompleto(treinoUserId, m.ano, m.mes), r.carregarDadosUsuario(treinoUserId)]);
      const semanas = r.agruparPorSemana(rel.concluidos, rel.series, m.ano, m.mes, rel.grupoNomePorData);
      if (tipo === "pdf") await r.exportarPDF(dados.perfil, dados.avaliacao, semanas, m.mes, m.ano, nomeAluno ?? undefined);
      else await r.exportarExcel(dados.perfil, dados.avaliacao, semanas, m.mes, m.ano, nomeAluno ?? undefined);
      toast.success(tipo === "pdf" ? "Relatório em PDF baixado." : "Relatório em Excel baixado.");
    } catch (e) {
      toast.error(mensagemDoErro(e));
    } finally {
      setGerando(null);
    }
  };
  const pdfTreino = async () => {
    setGerando("treino");
    try {
      const [{ generateWorkoutPlanPDF }, d] = await Promise.all([import("@/lib/generateWorkoutPlanPDF"), carregarPlanoParaPdf(treinoUserId)]);
      await generateWorkoutPlanPDF(d.profile as never, (d.dias ?? []) as never);
      toast.success("PDF do treino baixado.");
    } catch (e) {
      toast.error(mensagemDoErro(e));
    } finally {
      setGerando(null);
    }
  };
  return (
    <Cartao className="flex flex-col gap-3 px-[18px] py-4" data-relatorio-aluno>
      <CabecalhoCartao titulo="Relatório" acao={<SeletorMes {...m} />} />
      <p className="-mt-1 text-[12px] text-texto-3">Treinos, cargas e volume de {MESES[m.mes - 1].toLowerCase()}, semana a semana.</p>
      <div className="flex flex-wrap gap-2">
        <Botao tamanho="sm" variante="g" icone={FileText} disabled={!!gerando} onClick={() => void gerar("pdf")} data-relatorio-pdf>
          {gerando === "pdf" ? "Gerando…" : "PDF"}
        </Botao>
        <Botao tamanho="sm" variante="g" icone={FileSpreadsheet} disabled={!!gerando} onClick={() => void gerar("excel")} data-relatorio-excel>
          {gerando === "excel" ? "Gerando…" : "Excel"}
        </Botao>
      </div>
      <div className={cn("mt-1 flex items-center gap-3 border-t border-[rgba(255,255,255,.06)] pt-3")}>
        <span className="min-w-0 flex-1 text-[12.5px] text-texto-2">
          <b className="block text-[13px] font-semibold text-texto">PDF do treino</b>
          A semana com séries × repetições, descanso, carga e as observações.
        </span>
        <Botao tamanho="sm" variante="w" icone={FileText} disabled={!!gerando} onClick={() => void pdfTreino()} data-pdf-treino>
          {gerando === "treino" ? "Gerando…" : "Gerar PDF"}
        </Botao>
      </div>
    </Cartao>
  );
}
