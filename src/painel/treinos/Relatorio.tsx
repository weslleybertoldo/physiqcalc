import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, FileBarChart, FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "sonner";
import { tmbEscolhida } from "@/lib/avaliacao";
import { cn } from "@/lib/utils";
import { formatarDataCurta } from "@/utils/formatDate";
import { MESES, agruparPorSemana, carregarDadosUsuario, carregarRelatorioCompleto, type SemanaAgrupada } from "@/treino/editor/relatorio";
import { Avatar } from "@/ui/premium/Avatar";
import { Botao } from "@/ui/premium/Botao";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { Esqueleto, EstadoErro, EstadoVazio } from "@/ui/premium/Estados";
import { useMes } from "./estilo";
import { SeletorAluno, SeletorMes } from "./pecas";
import { resumoDoMes } from "./regras";
import type { QuemMexe } from "./tipos";
import { mensagemDoErro, useAlunosDaLista } from "./useTreinos";

const kg = (n: unknown, casas = 1) => (n == null || n === "" || !Number.isFinite(Number(n)) ? "—" : `${Number(n).toFixed(casas).replace(".", ",")}`);

function Dado({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="rounded-xl border border-linha bg-[rgba(255,255,255,.03)] px-3 py-2">
      <span className="pq-eyebrow block">{rotulo}</span>
      <b className={cn("mt-0.5 block text-[15px] font-semibold tabular-nums", destaque ? "text-violeta-3" : "text-texto")}>{valor}</b>
    </div>
  );
}

function Semana({ s, aberta, aoAlternar }: { s: SemanaAgrupada; aberta: boolean; aoAlternar: () => void }) {
  const ev = s.evolucao;
  return (
    <div className="overflow-hidden rounded-2xl border border-linha" data-relatorio-semana={s.numero} data-relatorio-semana-treinos={s.totalTreinos}>
      <button type="button" onClick={aoAlternar} className="flex w-full items-center gap-3 bg-[rgba(255,255,255,.03)] px-3.5 py-3 text-left">
        <b className="text-[13.5px] font-semibold text-texto">{s.label}</b>
        <span className="text-[12px] text-texto-3">{s.totalTreinos} {s.totalTreinos === 1 ? "treino" : "treinos"}</span>
        {ev && (
          <span className={cn("ml-auto text-[12px] font-semibold", ev.volume > 0 ? "text-verde-3" : ev.volume < 0 ? "text-rosa-3" : "text-texto-3")}>
            {ev.volume >= 0 ? "↑" : "↓"} {Math.abs(ev.volume)}% vol
          </span>
        )}
        {aberta ? <ChevronUp aria-hidden className={cn("h-4 w-4 text-texto-3", !ev && "ml-auto")} /> : <ChevronDown aria-hidden className={cn("h-4 w-4 text-texto-3", !ev && "ml-auto")} />}
      </button>
      {aberta && (
        <div className="flex flex-col gap-2.5 px-3.5 py-3">
          {s.dias.filter((d) => d.exercicios.length > 0 || d.concluido).length === 0 ? (
            <p className="py-3 text-center text-[12.5px] text-texto-3">Nenhum treino concluído nesta semana.</p>
          ) : (
            s.dias
              .filter((d) => d.exercicios.length > 0 || d.concluido)
              .map((d) => (
                <div key={d.data} className="rounded-xl border border-[rgba(255,255,255,.06)] px-3 py-2.5" data-relatorio-dia={d.data}>
                  <div className="mb-1.5 flex items-center gap-2">
                    <b className="text-[13px] font-semibold capitalize text-texto">{formatarDataCurta(d.data, { weekday: true })}</b>
                    {d.grupoNome && <span className="truncate text-[12px] text-texto-3">{d.grupoNome}</span>}
                    {d.concluido && <Chip tom="n" className="ml-auto">CONCLUÍDO</Chip>}
                    <span className={cn("text-[11.5px] tabular-nums text-texto-3", !d.concluido && "ml-auto")}>Vol {d.volumeTotal.toLocaleString("pt-BR")} kg·rep</span>
                  </div>
                  {d.exercicios.length === 0 ? (
                    <p className="text-[12px] italic text-texto-3">Treino concluído — sem detalhes de séries registrados.</p>
                  ) : (
                    d.exercicios.map((ex) => (
                      <div key={ex.id} className="border-l-2 border-[rgba(167,139,250,.35)] py-1 pl-2.5">
                        <b className="text-[12.5px] font-semibold text-texto">{ex.nome}</b>
                        <span className="ml-2 text-[11px] text-violeta-3">{ex.grupo}</span>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {ex.series.map((sr) => (
                            <span key={sr.numero} className="rounded-md bg-[rgba(255,255,255,.05)] px-2 py-0.5 text-[11.5px] tabular-nums text-texto-2">
                              S{sr.numero}: {String(sr.peso).replace(".", ",")} kg × {sr.reps}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ))
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Painel › Treinos › Relatório (C45): o relatório mensal de um aluno (dados e composição, treinos no mês, volume, média por
 * semana e cada semana com os dias e as séries) e a exportação em PDF e Excel — o MESMO gerador da aba Treino do perfil do aluno
 * (src/treino/editor/relatorio.ts, W15), que é o do Relatório antigo com a marca Physiq.
 */
export function Relatorio({ q }: { q: QuemMexe }) {
  const m = useMes();
  const alunos = useAlunosDaLista(q);
  const [aluno, setAluno] = useState("");
  const [aberta, setAberta] = useState<number | null>(null);
  const [gerando, setGerando] = useState<null | "pdf" | "excel">(null);
  const nome = alunos.data?.find((a) => a.id === aluno)?.nome ?? "";
  const email = alunos.data?.find((a) => a.id === aluno)?.email ?? "";
  const dados = useQuery({
    queryKey: ["painel-treinos-relatorio", aluno, m.ano, m.mes],
    queryFn: async () => {
      const [rel, usuario] = await Promise.all([carregarRelatorioCompleto(aluno, m.ano, m.mes), carregarDadosUsuario(aluno)]);
      const semanas = agruparPorSemana(rel.concluidos, rel.series, m.ano, m.mes, rel.grupoNomePorData ?? {});
      return { semanas, perfil: usuario.perfil, avaliacao: usuario.avaliacao };
    },
    enabled: !!aluno,
    staleTime: 60_000,
    retry: 1,
    networkMode: "online",
  });
  const resumo = useMemo(() => resumoDoMes(dados.data?.semanas ?? []), [dados.data]);
  const vazio = !!dados.data && dados.data.semanas.every((s) => s.totalTreinos === 0 && s.dias.every((d) => d.exercicios.length === 0));

  const exportar = async (tipo: "pdf" | "excel") => {
    if (!dados.data) return;
    setGerando(tipo);
    try {
      const r = await import("@/treino/editor/relatorio");
      if (tipo === "pdf") r.exportarPDF(dados.data.perfil, dados.data.avaliacao, dados.data.semanas, m.mes, m.ano, nome || undefined, email || undefined);
      else await r.exportarExcel(dados.data.perfil, dados.data.avaliacao, dados.data.semanas, m.mes, m.ano, nome || undefined, email || undefined);
      toast.success(tipo === "pdf" ? "Relatório em PDF baixado." : "Relatório em Excel baixado.");
    } catch (e) {
      toast.error(mensagemDoErro(e));
    } finally {
      setGerando(null);
    }
  };

  const p = dados.data?.perfil ?? null;
  const av = (dados.data?.avaliacao ?? null) as Record<string, unknown> | null;
  const tmb = p ? (av && tmbEscolhida(av).valor != null ? tmbEscolhida(av) : tmbEscolhida(p as unknown as Record<string, unknown>)) : null;

  return (
    <Cartao className="px-[18px] py-4" data-relatorio-painel={aluno || "sem-aluno"}>
      <CabecalhoCartao
        titulo="Relatório mensal"
        acao={
          <>
            <Botao tamanho="sm" variante="g" icone={FileText} disabled={!dados.data || vazio || !!gerando} onClick={() => void exportar("pdf")} data-relatorio-pdf-painel>
              {gerando === "pdf" ? "Gerando…" : "PDF"}
            </Botao>
            <Botao tamanho="sm" variante="g" icone={FileSpreadsheet} disabled={!dados.data || vazio || !!gerando} onClick={() => void exportar("excel")} data-relatorio-excel-painel>
              {gerando === "excel" ? "Gerando…" : "Excel"}
            </Botao>
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SeletorAluno alunos={alunos.data ?? []} valor={aluno} aoMudar={(id) => { setAluno(id); setAberta(null); }} todos="Escolha o aluno" />
        <SeletorMes {...m} />
      </div>

      {!aluno ? (
        <EstadoVazio icone={FileBarChart} titulo="Escolha um aluno" texto="O relatório mostra os treinos, as cargas e o volume do mês, semana a semana, e baixa em PDF ou Excel."
          className="border-0 bg-transparent py-6 shadow-none" />
      ) : dados.isLoading ? (
        <div className="flex flex-col gap-2">{[0, 1, 2].map((i) => <Esqueleto key={i} className="h-16 w-full" />)}</div>
      ) : dados.error || !dados.data ? (
        <EstadoErro titulo="Não deu para abrir o relatório" texto={mensagemDoErro(dados.error)} aoTentar={() => void dados.refetch()} />
      ) : (
        <div className="flex flex-col gap-3.5" data-relatorio-conteudo>
          {p && (
            <div className="flex flex-col gap-3 rounded-2xl border border-linha bg-superficie px-3.5 py-3.5" data-relatorio-perfil>
              <div className="flex items-center gap-3">
                <Avatar src={p.foto_url} nome={p.nome ?? nome} tamanho={44} />
                <div className="min-w-0">
                  <b className="block truncate text-[15px] font-semibold text-texto">{p.nome ?? nome}</b>
                  <span className="block truncate text-[12px] text-texto-3">{p.email ?? email}{p.user_code ? ` · ID ${p.user_code}` : ""}</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Dado rotulo="Peso" valor={av?.peso ?? p.peso ? `${kg(av?.peso ?? p.peso)} kg` : "—"} />
                <Dado rotulo="Altura" valor={av?.altura ?? p.altura ? `${av?.altura ?? p.altura} cm` : "—"} />
                <Dado rotulo="Idade" valor={p.idade ? `${p.idade} anos` : "—"} />
                {(av?.percentual_gordura ?? p.percentual_gordura) != null && <Dado rotulo="% Gordura" valor={`${kg(av?.percentual_gordura ?? p.percentual_gordura)}%`} destaque />}
                {(av?.massa_gorda ?? p.massa_gorda) != null && <Dado rotulo="Massa gorda" valor={`${kg(av?.massa_gorda ?? p.massa_gorda)} kg`} />}
                {(av?.massa_magra ?? p.massa_magra) != null && <Dado rotulo="Massa magra" valor={`${kg(av?.massa_magra ?? p.massa_magra)} kg`} />}
              </div>
              {tmb?.valor != null && <span className="text-[12.5px] text-texto-2">TMB {tmb.label}: <b className="font-semibold text-texto">{Math.round(tmb.valor)} kcal/dia</b></span>}
            </div>
          )}
          <div className="grid grid-cols-3 gap-2" data-relatorio-resumo={resumo.treinos}>
            <Dado rotulo="Treinos no mês" valor={String(resumo.treinos)} destaque />
            <Dado rotulo="Volume total" valor={`${resumo.volume.toLocaleString("pt-BR")} kg·rep`} />
            <Dado rotulo="Média / semana" valor={resumo.mediaSemana} />
          </div>
          {vazio ? (
            <p className="py-4 text-center text-[13px] text-texto-3" data-relatorio-vazio>Nenhum treino registrado em {MESES[m.mes - 1].toLowerCase()} de {m.ano}.</p>
          ) : (
            <div className="flex flex-col gap-2" data-relatorio-semanas={dados.data.semanas.length}>
              {dados.data.semanas.map((s) => (
                <Semana key={s.numero} s={s} aberta={aberta === s.numero} aoAlternar={() => setAberta((a) => (a === s.numero ? null : s.numero))} />
              ))}
            </div>
          )}
        </div>
      )}
    </Cartao>
  );
}
