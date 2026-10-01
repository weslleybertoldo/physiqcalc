import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, ChevronRight, Dumbbell, History, MapPin, Timer } from "lucide-react";
import { formatDuracao } from "@/lib/treinoResumo";
import { carregarTreinoDoHistorico, type ItemHistorico } from "@/treino/editor/api";
import { MESES } from "@/treino/editor/relatorio";
import { Botao } from "@/ui/premium/Botao";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { Esqueleto, EstadoErro, EstadoVazio } from "@/ui/premium/Estados";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { carregarHistoricoCompleto, carregarHistoricoDoMes, type TreinoDoHistoricoCompleto } from "./api";
import { useMes } from "./estilo";
import { SeletorAluno, SeletorMes } from "./pecas";
import { diaMes } from "./regras";
import type { QuemMexe } from "./tipos";
import { mensagemDoErro, useAlunosDaLista } from "./useTreinos";

/** exercicios_concluidos pode vir como JSON em texto (1 ou 2 vezes) — a mesma leitura do histórico do app */
function exerciciosDe(raw: unknown): { nome: string; series?: { numero_serie: number; peso: number; reps: number }[]; series_concluidas?: number }[] {
  let v = raw;
  for (let i = 0; i < 3 && typeof v === "string"; i++) {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  return Array.isArray(v) ? (v as never[]) : [];
}

const textoSeries = (e: { series?: { peso: number; reps: number }[]; series_concluidas?: number }) =>
  (e.series ?? []).length ? (e.series ?? []).map((s) => `${String(s.peso).replace(".", ",")} kg × ${s.reps}`).join(" · ") : `${e.series_concluidas ?? 0} séries`;

/**
 * Painel › Treinos › Histórico (C44): os treinos feitos no mês pelos alunos do profissional (todos ou um), com o detalhe de cada
 * treino (as séries) e o histórico completo de um aluno — o Histórico de Treinos do admin antigo (admin-relatorio).
 */
export function Historico({ q }: { q: QuemMexe }) {
  const m = useMes();
  const alunos = useAlunosDaLista(q);
  const [aluno, setAluno] = useState("");
  const [aberto, setAberto] = useState<ItemHistorico | null>(null);
  const [completo, setCompleto] = useState(false);
  const mes = useQuery({
    queryKey: ["painel-treinos-historico", q.meuId, m.ano, m.mes],
    queryFn: () => carregarHistoricoDoMes(m.ano, m.mes),
    staleTime: 60_000,
    retry: 1,
    networkMode: "online",
  });
  const det = useQuery({
    queryKey: ["painel-treinos-historico-item", aberto?.userId, aberto?.chave],
    queryFn: () => carregarTreinoDoHistorico(aberto!.userId, aberto!.chave),
    enabled: !!aberto,
    staleTime: 5 * 60_000,
  });
  const itens = useMemo(() => mes.data ?? [], [mes.data]);
  // no seletor entram os alunos da lista (os que treinaram no mês primeiro)
  const opcoes = useMemo(() => {
    const treinaram = new Set(itens.map((i) => i.userId));
    return [...(alunos.data ?? [])].sort((a, b) => Number(treinaram.has(b.id)) - Number(treinaram.has(a.id)) || a.nome.localeCompare(b.nome, "pt-BR"));
  }, [alunos.data, itens]);
  const visiveis = aluno ? itens.filter((i) => i.userId === aluno) : itens;
  const nomeAluno = opcoes.find((a) => a.id === aluno)?.nome ?? "";

  return (
    <Cartao className="px-[18px] py-4" data-historico-painel={`${m.ano}-${m.mes}`} data-historico-total={visiveis.length}>
      <CabecalhoCartao
        titulo="Histórico de treinos"
        extra={mes.data ? <Chip tom="t" data-historico-contagem>{visiveis.length} {visiveis.length === 1 ? "TREINO" : "TREINOS"}</Chip> : undefined}
        acao={<SeletorMes {...m} />}
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SeletorAluno alunos={opcoes} valor={aluno} aoMudar={setAluno} todos="Todos os alunos" />
        {aluno && (
          <Botao tamanho="sm" variante="g" icone={History} onClick={() => setCompleto(true)} data-historico-completo-abrir>
            Todo o histórico de {nomeAluno.split(" ")[0]}
          </Botao>
        )}
      </div>
      {mes.isLoading ? (
        <div className="flex flex-col gap-2">{[0, 1, 2, 3].map((i) => <Esqueleto key={i} className="h-12 w-full" />)}</div>
      ) : mes.error ? (
        <EstadoErro titulo="Não deu para abrir o histórico" texto={mensagemDoErro(mes.error)} aoTentar={() => void mes.refetch()} />
      ) : visiveis.length === 0 ? (
        <EstadoVazio icone={CalendarClock} titulo={`Nenhum treino em ${MESES[m.mes - 1].toLowerCase()}`}
          texto={aluno ? `${nomeAluno.split(" ")[0]} não registrou treino neste mês.` : "Quando os seus alunos concluírem treinos no app, eles aparecem aqui."}
          className="border-0 bg-transparent py-6 shadow-none" />
      ) : (
        <ul data-historico-lista-painel={visiveis.length}>
          {visiveis.map((i) => (
            <li key={i.chave}>
              <button type="button" onClick={() => setAberto(i)} className="flex w-full items-center gap-3 border-t border-[rgba(255,255,255,.06)] py-2.5 text-left" data-historico-linha={i.data}>
                <span className="w-[54px] flex-none text-[12px] font-semibold tabular-nums text-texto-2">
                  {diaMes(i.data)}
                  <span className="block text-[10.5px] font-medium text-texto-3">{i.diaSemana}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">
                    <b className="font-semibold text-violeta-3">{i.pessoa}</b>
                    <span className="text-texto-3"> · </span>
                    <b className="font-semibold text-texto">{i.nomeTreino}</b>
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11.5px] text-texto-3">
                    <span className="flex items-center gap-1"><Timer aria-hidden className="h-3 w-3" />{i.comCronometro && i.duracaoSegundos !== null ? formatDuracao(i.duracaoSegundos) : "sem cronômetro"}</span>
                    {i.totalExercicios > 0 && <span className="flex items-center gap-1"><Dumbbell aria-hidden className="h-3 w-3" />{i.totalExercicios} exercícios</span>}
                    {i.academia && <span className="flex items-center gap-1"><MapPin aria-hidden className="h-3 w-3" />{i.academia}</span>}
                  </span>
                </span>
                <ChevronRight aria-hidden className="h-4 w-4 flex-none text-texto-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <PainelDeslizante aberto={!!aberto} aoMudar={(a) => !a && setAberto(null)} lado="direita" titulo={aberto ? `${aberto.pessoa} · ${aberto.nomeTreino}` : "Treino"}
        descricao={aberto ? `${aberto.data.split("-").reverse().join("/")}${aberto.duracaoSegundos ? ` · ${formatDuracao(aberto.duracaoSegundos)}` : ""}${aberto.academia ? ` · ${aberto.academia}` : ""}` : undefined}>
        {det.isLoading ? (
          <Esqueleto className="h-[200px] w-full" />
        ) : !det.data ? (
          <p className="text-[13px] text-texto-3">Não achamos esse treino.</p>
        ) : (
          <ul className="flex flex-col" data-historico-detalhe-painel>
            {exerciciosDe(det.data.exercicios_concluidos).map((e, idx) => (
              <li key={`${e.nome}-${idx}`} className="border-t border-[rgba(255,255,255,.06)] py-2">
                <b className="block text-[13px] font-semibold text-texto">{e.nome}</b>
                <span className="text-[12px] text-texto-2">{textoSeries(e)}</span>
              </li>
            ))}
          </ul>
        )}
      </PainelDeslizante>

      <HistoricoCompleto aberto={completo} aoMudar={setCompleto} userId={aluno} nome={nomeAluno} />
    </Cartao>
  );
}

function chaveMes(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** O histórico completo de um aluno, por mês (o "Buscar" do Histórico antigo). */
function HistoricoCompleto({ aberto, aoMudar, userId, nome }: { aberto: boolean; aoMudar: (a: boolean) => void; userId: string; nome: string }) {
  const q = useQuery({
    queryKey: ["painel-treinos-historico-completo", userId],
    queryFn: () => carregarHistoricoCompleto(userId),
    enabled: aberto && !!userId,
    staleTime: 60_000,
  });
  const [expandido, setExpandido] = useState<string | null>(null);
  const porMes = useMemo(() => {
    const m = new Map<string, TreinoDoHistoricoCompleto[]>();
    for (const t of q.data ?? []) {
      const k = chaveMes(t.iniciado_em || t.concluido_em);
      m.set(k, [...(m.get(k) ?? []), t]);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [q.data]);
  return (
    <PainelDeslizante aberto={aberto} aoMudar={aoMudar} lado="direita" titulo={nome || "Histórico"} className="w-[min(480px,94vw)]"
      descricao={q.data ? `${q.data.length} ${q.data.length === 1 ? "treino" : "treinos"} no total` : "Todo o histórico de treinos"}>
      {q.isLoading ? (
        <Esqueleto className="h-[240px] w-full" />
      ) : q.error ? (
        <EstadoErro titulo="Não deu para abrir" texto={mensagemDoErro(q.error)} aoTentar={() => void q.refetch()} />
      ) : porMes.length === 0 ? (
        <p className="text-[13px] text-texto-3">Nenhum treino registrado.</p>
      ) : (
        <div className="flex flex-col gap-3" data-historico-completo={q.data?.length ?? 0}>
          {porMes.map(([k, lista]) => {
            const [ano, mes] = k.split("-");
            return (
              <section key={k}>
                <h4 className="pq-eyebrow mb-1">{MESES[Number(mes) - 1]} {ano} · {lista.length}</h4>
                <ul>
                  {lista.map((t) => {
                    const id = t.id || `${t.iniciado_em}-${t.nome_treino}`;
                    const exs = exerciciosDe(t.exercicios_concluidos);
                    return (
                      <li key={id} className="border-t border-[rgba(255,255,255,.06)]">
                        <button type="button" onClick={() => setExpandido(expandido === id ? null : id)} className="flex w-full items-center gap-3 py-2 text-left">
                          <span className="w-12 flex-none text-[12px] font-semibold tabular-nums text-texto-2">{new Date(t.iniciado_em || t.concluido_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>
                          <span className="min-w-0 flex-1">
                            <b className="block truncate text-[13px] font-semibold text-texto">{t.nome_treino}</b>
                            <span className="block text-[11.5px] text-texto-3">{exs.length} exercícios{t.sem_cronometro ? " · sem cronômetro" : t.duracao_segundos ? ` · ${formatDuracao(t.duracao_segundos)}` : ""}</span>
                          </span>
                        </button>
                        {expandido === id && (
                          <ul className="mb-2 ml-12 flex flex-col gap-1">
                            {exs.map((e, i) => (
                              <li key={`${e.nome}-${i}`} className="text-[12px] text-texto-2"><b className="font-semibold text-texto">{e.nome}</b> · {textoSeries(e)}</li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </PainelDeslizante>
  );
}
