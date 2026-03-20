import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { formatarDataCurta, agoraFormatado } from "@/utils/formatDate";
import {
  desenharCabecalho, desenharTituloSecao, desenharCard,
  desenharRodape, estiloTabela, novaPagina, limparTexto,
  TEMA, hexToRgb, setTextColor, pintarFundo
        } from "@/utils/gerarRelatorio";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

interface UserOption {
  id: string;
  nome: string;
  email: string;
}

interface SerieRow {
  data_treino: string;
  numero_serie: number;
  peso: number | null;
  reps: number | null;
  concluida: boolean | null;
  exercicio_id: string;
  exercicio_usuario_id: string | null;
  tb_exercicios: { nome: string; grupo_muscular: string; emoji: string | null } | null;
  tb_exercicios_usuario: { nome: string; grupo_muscular: string; emoji: string | null } | null;
}

interface ProfileData {
  nome: string | null;
  email: string | null;
  user_code: number | null;
  foto_url: string | null;
  peso: number | null;
  altura: number | null;
  idade: number | null;
  percentual_gordura: number | null;
  massa_gorda: number | null;
  massa_magra: number | null;
  tmb_mifflin: number | null;
  tmb_katch: number | null;
}

interface ExercicioAgrupado {
  id: string;
  nome: string;
  grupo: string;
  emoji: string;
  series: { numero: number; peso: number; reps: number }[];
}

interface DiaAgrupado {
  data: string;
  concluido: boolean;
  exercicios: ExercicioAgrupado[];
  volumeTotal: number;
  grupoNome: string;
}

interface SemanaAgrupada {
  numero: number;
  label: string;
  totalTreinos: number;
  volumeTotal: number;
  dias: DiaAgrupado[];
  evolucao: { treinos: number; volume: number } | null;
}

// ── Data fetching ──

async function carregarRelatorioCompleto(userId: string, ano: number, mes: number) {
  const _d1 = new Date(ano, mes - 1, 1); const inicioMes = `${_d1.getFullYear()}-${String(_d1.getMonth()+1).padStart(2,"0")}-01`;
  const _d2 = new Date(ano, mes, 0); const fimMes = `${_d2.getFullYear()}-${String(_d2.getMonth()+1).padStart(2,"0")}-${String(_d2.getDate()).padStart(2,"0")}`;

  const [concluidosRes, seriesRes, overridesDireto, gruposRes] = await Promise.all([
    supabase
      .from("tb_treino_concluido")
      .select("data_treino")
      .eq("user_id", userId)
      .eq("concluido", true)
      .gte("data_treino", inicioMes)
      .lte("data_treino", fimMes)
      .order("data_treino"),
    supabase
      .from("tb_treino_series")
      .select(`
        data_treino, numero_serie, peso, reps, concluida,
        exercicio_id, exercicio_usuario_id,
        tb_exercicios ( nome, grupo_muscular, emoji ),
        tb_exercicios_usuario ( nome, grupo_muscular, emoji )
      `)
      .eq("user_id", userId)
      .eq("concluida", true)
      .gte("data_treino", inicioMes)
      .lte("data_treino", fimMes)
      .order("data_treino")
      .order("numero_serie"),
    // Busca overrides direto — policy SELECT USING(true) permite acesso sem autenticação
    supabase
      .from("tb_treino_dia_override")
      .select("data_treino, grupo_id, grupo_usuario_id")
      .eq("user_id", userId)
      .gte("data_treino", inicioMes)
      .lte("data_treino", fimMes),
    // Busca todos os grupos globais de uma vez
    supabase.from("tb_grupos_treino").select("id, nome"),
  ]);

  const overrides: any[] = (overridesDireto.data ?? []) as any[];

  // Monta mapa de grupos globais por id
  const grupoNomeById: Record<string, string> = {};
  ((gruposRes.data ?? []) as any[]).forEach((g: any) => {
    if (g?.id && g?.nome) grupoNomeById[g.id] = g.nome;
  });

  // Busca grupos pessoais se necessário
  const grupoIdsUsuario = [...new Set(overrides.map((o: any) => o.grupo_usuario_id).filter(Boolean))];
  if (grupoIdsUsuario.length > 0) {
    const { data: gu } = await supabase
      .from("tb_grupos_treino_usuario")
      .select("id, nome")
      .in("id", grupoIdsUsuario);
    (gu ?? []).forEach((g: any) => { if (g?.id && g?.nome) grupoNomeById[g.id] = g.nome; });
  }

  // Monta mapa data → nome do grupo de treino
  const grupoNomePorData: Record<string, string> = {};
  overrides.forEach((o: any) => {
    const nome = grupoNomeById[o.grupo_usuario_id] ?? grupoNomeById[o.grupo_id];
    const dataKey = o.data_treino ? String(o.data_treino).split('T')[0] : null;
    if (nome && dataKey) grupoNomePorData[dataKey] = nome;
  });

  const concluidos = (concluidosRes.data ?? []) as { data_treino: string }[];

  return {
    concluidos,
    series: (seriesRes.data ?? []) as unknown as SerieRow[],
    grupoNomePorData
  };
}

async function carregarDadosUsuario(userId: string) {
  const { data } = await supabase.functions.invoke("admin-get-user", {
    body: { userId }
        });
  return {
    perfil: (data?.profile as ProfileData | null) ?? null,
    avaliacao: data?.avaliacao ?? null
        };
}

// ── Grouping helpers ──

function agruparPorExercicio(series: SerieRow[]): ExercicioAgrupado[] {
  const mapa: Record<string, ExercicioAgrupado> = {};
  series.forEach((s) => {
    const id = s.exercicio_usuario_id ?? s.exercicio_id;
    const info = s.tb_exercicios_usuario ?? s.tb_exercicios;
    if (!mapa[id])
      mapa[id] = {
        id,
        nome: info?.nome ?? "Exercício",
        grupo: info?.grupo_muscular ?? "",
        emoji: info?.emoji ?? "🏋️",
        series: []
        };
    mapa[id].series.push({
      numero: s.numero_serie,
      peso: Number(s.peso ?? 0),
      reps: Number(s.reps ?? 0)
        });
  });
  return Object.values(mapa);
}

function agruparPorDia(
  concluidos: { data_treino: string }[],
  series: SerieRow[],
  grupoNomePorData: Record<string, string> = {}
): DiaAgrupado[] {
  const datas = [
    ...new Set([
      ...concluidos.map((c) => c.data_treino),
      ...series.map((s) => s.data_treino),
    ]),
  ].sort();

  return datas.map((data) => {
    const exercicios = agruparPorExercicio(series.filter((s) => s.data_treino === data));
    const volume = exercicios.reduce(
      (a, ex) => a + ex.series.reduce((b, s) => b + Number(s.peso) * Number(s.reps), 0),
      0
    );
    return {
      data,
      concluido: concluidos.some((c) => c.data_treino === data),
      exercicios,
      volumeTotal: volume,
      grupoNome: grupoNomePorData[data] ?? ''
        };
  });
}

function agruparPorSemana(
  concluidos: { data_treino: string }[],
  series: SerieRow[],
  ano: number,
  mes: number,
  grupoNomePorData: Record<string, string> = {}
): SemanaAgrupada[] {
  const diasNoMes = new Date(ano, mes, 0).getDate();
  const semanas: Omit<SemanaAgrupada, "evolucao">[] = [];
  let num = 1;

  for (let inicio = 1; inicio <= diasNoMes; inicio += 7) {
    const fim = Math.min(inicio + 6, diasNoMes);
    const pad = (n: number) => String(n).padStart(2, "0");
    const ini = `${ano}-${pad(mes)}-${pad(inicio)}`;
    const fimStr = `${ano}-${pad(mes)}-${pad(fim)}`;

    const c = concluidos.filter((x) => x.data_treino >= ini && x.data_treino <= fimStr);
    const s = series.filter((x) => x.data_treino >= ini && x.data_treino <= fimStr);
    const dias = agruparPorDia(c, s, grupoNomePorData);
    const volume = dias.reduce((a, d) => a + d.volumeTotal, 0);

    semanas.push({
      numero: num,
      label: `Semana ${num}  (${pad(inicio)}/${pad(mes)} – ${pad(fim)}/${pad(mes)})`,
      totalTreinos: c.length,
      volumeTotal: volume,
      dias
        });
    num++;
  }

  return semanas.map((s, i) => ({
    ...s,
    evolucao:
      i === 0
        ? null
        : {
            treinos: s.totalTreinos - semanas[i - 1].totalTreinos,
            volume:
              semanas[i - 1].volumeTotal > 0
                ? Math.round(
                    ((s.volumeTotal - semanas[i - 1].volumeTotal) / semanas[i - 1].volumeTotal) *
                      100
                  )
                : 0
        }
        }));
}

// ── Sub-components ──

function DadoBox({ label, value, destaque = false }: { label: string; value: string; destaque?: boolean }) {
  return (
    <div className="bg-background/60 rounded-lg p-2.5">
      <div className="text-[10px] text-muted-foreground tracking-wider font-heading uppercase mb-1">{label}</div>
      <div className={`font-heading text-sm ${destaque ? "text-primary" : "text-foreground"}`}>{value}</div>
    </div>
  );
}

function TMBBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-primary/5 border border-primary/10 rounded-lg p-3">
      <div className="text-[10px] text-muted-foreground tracking-wider font-heading uppercase mb-1.5">{label}</div>
      <div className="font-heading text-lg text-primary">{value}</div>
    </div>
  );
}

function Divisor({ label }: { label: string }) {
  return (
    <div className="text-[10px] text-muted-foreground tracking-wider font-heading uppercase border-t border-muted-foreground/20 pt-2.5 mb-2">
      {label}
    </div>
  );
}

function CardPerfil({ perfil, avaliacao }: { perfil: ProfileData | null; avaliacao: any }) {
  if (!perfil) return null;
  const fotoUrl = perfil.foto_url;
  const initial = perfil.nome?.charAt(0)?.toUpperCase() ?? "U";

  // Use avaliacao data if available, otherwise fall back to profile
  const peso = avaliacao?.peso ?? perfil.peso;
  const altura = avaliacao?.altura ?? perfil.altura;
  const idade = perfil.idade;
  const pGordura = avaliacao?.percentual_gordura ?? perfil.percentual_gordura;
  const mGorda = avaliacao?.massa_gorda ?? perfil.massa_gorda;
  const mMagra = avaliacao?.massa_magra ?? perfil.massa_magra;
  const tmbMifflin = avaliacao?.tmb_mifflin ?? perfil.tmb_mifflin;
  const tmbKatch = avaliacao?.tmb_katch ?? perfil.tmb_katch;

  return (
    <div className="result-card border-muted-foreground/20 mb-5">
      {/* Identity */}
      <div className="flex items-center gap-3.5 mb-4">
        {fotoUrl ? (
          <img
            src={fotoUrl}
            alt="foto"
            className="w-12 h-12 rounded-full object-cover border-2 border-primary"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center font-heading text-xl text-primary-foreground shrink-0">
            {initial}
          </div>
        )}
        <div>
          <div className="font-heading text-foreground text-lg">{perfil.nome ?? "Usuário"}</div>
          <div className="text-xs text-muted-foreground font-body">{perfil.email}</div>
          <div className="text-[10px] text-primary font-body mt-0.5">ID: {perfil.user_code ?? "—"}</div>
        </div>
      </div>

      {/* Personal data */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <DadoBox label="Peso" value={peso ? `${peso} kg` : "—"} />
        <DadoBox label="Altura" value={altura ? `${altura} cm` : "—"} />
        <DadoBox label="Idade" value={idade ? `${idade} anos` : "—"} />
      </div>

      {/* Body composition */}
      {(pGordura || mGorda || mMagra) && (
        <>
          <Divisor label="Composição Corporal" />
          <div className="grid grid-cols-3 gap-2 mb-3">
            <DadoBox label="% Gordura" value={pGordura ? `${Number(pGordura).toFixed(1)}%` : "—"} destaque />
            <DadoBox label="Massa Gorda" value={mGorda ? `${Number(mGorda).toFixed(1)} kg` : "—"} />
            <DadoBox label="Massa Magra" value={mMagra ? `${Number(mMagra).toFixed(1)} kg` : "—"} />
          </div>
        </>
      )}

      {/* TMB */}
      {(tmbMifflin || tmbKatch) && (
        <>
          <Divisor label="Taxa Metabólica Basal" />
          <div className="grid grid-cols-2 gap-2">
            <TMBBox label="TMB Mifflin-St Jeor" value={tmbMifflin ? `${Math.round(Number(tmbMifflin))} kcal/dia` : "—"} />
            <TMBBox label="TMB Katch-McArdle" value={tmbKatch ? `${Math.round(Number(tmbKatch))} kcal/dia` : "—"} />
          </div>
        </>
      )}

      {avaliacao?.created_at && (
        <div className="text-[10px] text-muted-foreground font-body mt-3 text-right">
          Última avaliação: {formatarDataCurta(avaliacao.created_at?.split('T')[0])}
        </div>
      )}
    </div>
  );
}

function ResumoMes({ semanas }: { semanas: SemanaAgrupada[] }) {
  const totalTreinos = semanas.reduce((a, s) => a + s.totalTreinos, 0);
  const volumeTotal = semanas.reduce((a, s) => a + s.volumeTotal, 0);
  const media = semanas.length > 0 ? (totalTreinos / semanas.length).toFixed(1) : "0";

  return (
    <div className="grid grid-cols-3 gap-2.5 mb-5">
      <div className="result-card border-classify-green/30">
        <div className="text-[10px] text-muted-foreground tracking-wider font-heading uppercase mb-1.5">Treinos no mês</div>
        <div className="font-heading text-2xl text-classify-green">{totalTreinos}</div>
      </div>
      <div className="result-card border-primary/30">
        <div className="text-[10px] text-muted-foreground tracking-wider font-heading uppercase mb-1.5">Volume total</div>
        <div className="font-heading text-2xl text-primary">{volumeTotal.toLocaleString('pt-BR')} kg·rep</div>
      </div>
      <div className="result-card border-blue-500/30">
        <div className="text-[10px] text-muted-foreground tracking-wider font-heading uppercase mb-1.5">Média / semana</div>
        <div className="font-heading text-2xl text-blue-500">{media}</div>
      </div>
    </div>
  );
}

function CardDia({ dia }: { dia: DiaAgrupado }) {
  const dataFmt = formatarDataCurta(dia.data, { weekday: true });

  return (
    <div className="result-card border-muted-foreground/15 mt-3">
      <div className="flex justify-between items-center mb-2.5">
        <div className="font-heading text-sm text-foreground capitalize">{dataFmt}</div>
        <div className="flex gap-2.5 items-center">
          {dia.concluido && (
            <span className="text-[10px] text-classify-green font-heading">✅ CONCLUÍDO</span>
          )}
          <span className="text-[10px] text-muted-foreground font-body">
            Vol: {dia.volumeTotal.toLocaleString("pt-BR")} kg·rep
          </span>
        </div>
      </div>

      {dia.exercicios.length === 0 ? (
        <p className="text-xs text-muted-foreground font-body italic">Treino concluído — sem detalhes de séries registrados.</p>
      ) : dia.exercicios.map((ex) => (
        <div key={ex.id} className="mb-2.5 pl-2.5 border-l-2 border-muted-foreground/20">
          <div className="text-sm font-heading text-foreground mb-1">
            {ex.emoji} {ex.nome}
            <span className="ml-2 text-[10px] text-primary font-body">{ex.grupo}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ex.series.map((s) => (
              <span
                key={s.numero}
                className="bg-secondary rounded px-2.5 py-0.5 text-xs text-muted-foreground font-body"
              >
                S{s.numero}: {s.peso} kg × {s.reps}
              </span>
            ))}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1 font-body">
            Máx: {Math.max(...ex.series.map((s) => s.peso))} kg &nbsp;•&nbsp; Vol:{" "}
            {ex.series.reduce((a, s) => a + s.peso * s.reps, 0)} kg·rep &nbsp;•&nbsp;{" "}
            {ex.series.length} série{ex.series.length !== 1 ? "s" : ""}
          </div>
        </div>
      ))}
    </div>
  );
}

function CardSemana({
  semana,
  aberta,
  onToggle
        }: {
  semana: SemanaAgrupada;
  aberta: boolean;
  onToggle: () => void;
}) {
  const ev = semana.evolucao;
  const corVol = !ev ? "" : ev.volume > 0 ? "text-classify-green" : ev.volume < 0 ? "text-destructive" : "text-muted-foreground";
  const sVol = ev && ev.volume >= 0 ? "↑" : "↓";

  return (
    <div className="border border-muted-foreground/20 rounded-xl mb-2 overflow-hidden">
      <div
        onClick={onToggle}
        className="flex justify-between items-center px-4 py-3.5 bg-card cursor-pointer hover:bg-card/80 transition-colors"
      >
        <div>
          <span className="font-heading text-sm text-foreground">{semana.label}</span>
          <span className="ml-3 text-xs text-muted-foreground font-body">
            {semana.totalTreinos} treino{semana.totalTreinos !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {ev && (
            <div className={`text-xs font-heading ${corVol}`}>
              {sVol}
              {Math.abs(ev.volume)}% vol
              {ev.treinos !== 0 && (
                <span className={`ml-2 ${ev.treinos > 0 ? "text-classify-green" : "text-destructive"}`}>
                  {ev.treinos > 0 ? "+" : ""}
                  {ev.treinos} treinos
                </span>
              )}
            </div>
          )}
          <span className="text-muted-foreground text-xs">{aberta ? "▲" : "▼"}</span>
        </div>
      </div>

      {aberta && (
        <div className="px-4 pb-4 bg-background">
          {semana.totalTreinos === 0 && semana.dias.every((d) => d.exercicios.length === 0) ? (
            <div className="text-muted-foreground py-6 text-center text-sm font-body">
              Nenhum treino concluído nesta semana.
            </div>
          ) : (
            semana.dias
              .filter((d) => d.exercicios.length > 0 || d.concluido)
              .map((dia) => <CardDia key={dia.data} dia={dia} />)
          )}
        </div>
      )}
    </div>
  );
}

// ── Export helpers ──

function obterNomeAluno(perfil: ProfileData | null, fallbackNome?: string, fallbackEmail?: string): string {
  return perfil?.nome?.trim() || fallbackNome?.trim() || perfil?.email?.split('@')[0] || fallbackEmail?.split('@')[0] || 'aluno';
}

// ── Export functions ──

interface TreinoSemana {
  semanaLabel: string;
  grupoNome: string;
  data: string;
  volume: number;
  totalReps: number;
  kgPerRep: number;
}

interface ResumoRow {
  semana: string;
  grupo: string;
  volume: string;
  kgRep: string;
  evol: string;
  evolColor: string;
}

function exportarPDF(
  perfil: ProfileData | null,
  avaliacao: any,
  semanas: SemanaAgrupada[],
  mes: number,
  ano: number,
  fallbackNome?: string,
  fallbackEmail?: string
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();

  // Intercepta toda nova página adicionada e pinta o fundo antes do conteúdo
  const _origAddPage = doc.addPage.bind(doc);
  (doc as any).addPage = (...args: any[]) => {
    _origAddPage(...args);
    pintarFundo(doc);
    return doc;
  };

  const nomeAluno = obterNomeAluno(perfil, fallbackNome, fallbackEmail);
  const nomeArquivo = `treinos_${nomeAluno.replace(/\s+/g, "_")}_${MESES[mes - 1]}_${ano}.pdf`;

  let y = desenharCabecalho(
    doc,
    'Relatorio de Treinos',
    `${limparTexto(nomeAluno)} - ${MESES[mes - 1]} / ${ano} - Gerado em ${agoraFormatado({ incluirHora: false })}`
  );

  // User data
  y = desenharTituloSecao(doc, 'Dados do Aluno', y);
  autoTable(doc, {
    startY: y,
    head: [],
    body: [
      ["Nome", limparTexto(perfil?.nome ?? fallbackNome ?? "-"), "Email", perfil?.email ?? fallbackEmail ?? "-"],
      ["ID", String(perfil?.user_code ?? "-"), "Ultima avaliacao", avaliacao?.created_at ? formatarDataCurta(avaliacao.created_at.split('T')[0]) : "-"],
      ["Peso", (avaliacao?.peso ?? perfil?.peso) ? `${avaliacao?.peso ?? perfil?.peso} kg` : "-", "Altura", (avaliacao?.altura ?? perfil?.altura) ? `${avaliacao?.altura ?? perfil?.altura} cm` : "-"],
      ["Idade", perfil?.idade ? `${perfil.idade} anos` : "-", "% Gordura", (avaliacao?.percentual_gordura ?? perfil?.percentual_gordura) ? `${Number(avaliacao?.percentual_gordura ?? perfil?.percentual_gordura).toFixed(1)}%` : "-"],
      ["Massa Gorda", (avaliacao?.massa_gorda ?? perfil?.massa_gorda) ? `${Number(avaliacao?.massa_gorda ?? perfil?.massa_gorda).toFixed(1)} kg` : "-", "Massa Magra", (avaliacao?.massa_magra ?? perfil?.massa_magra) ? `${Number(avaliacao?.massa_magra ?? perfil?.massa_magra).toFixed(1)} kg` : "-"],
      ["TMB Mifflin", (avaliacao?.tmb_mifflin ?? perfil?.tmb_mifflin) ? `${Number(avaliacao?.tmb_mifflin ?? perfil?.tmb_mifflin).toFixed(1)} kcal/dia` : "-", "TMB Katch", (avaliacao?.tmb_katch ?? perfil?.tmb_katch) ? `${Number(avaliacao?.tmb_katch ?? perfil?.tmb_katch).toFixed(1)} kcal/dia` : "-"],
    ],
    ...estiloTabela(),
    margin: { left: 14, right: 14, top: 15 },
        });
  y = (doc as any).lastAutoTable.finalY + 8;

  // Monthly summary
  y = desenharTituloSecao(doc, 'Resumo do Mes', y);
  const totalTreinos = semanas.reduce((a, s) => a + s.totalTreinos, 0);
  const volTotal = semanas.reduce((a, s) => a + s.volumeTotal, 0);
  const media = semanas.length > 0 ? (totalTreinos / semanas.length).toFixed(1) : "0";

  const cW = (W - 28 - 8) / 3;
  desenharCard(doc, 'Treinos no mes', String(totalTreinos), 14, y, cW, 18, TEMA.verde);
  desenharCard(doc, 'Volume total', `${volTotal.toLocaleString('pt-BR')} kg x rep`, 14 + cW + 4, y, cW, 18, TEMA.amarelo);
  desenharCard(doc, 'Media / semana', `${media} treinos`, 14 + cW * 2 + 8, y, cW, 18, TEMA.branco);
  y += 24;

  // ── Resumo semanal com comparação por nome do grupo de treino ──────────
  y = desenharTituloSecao(doc, 'Visao Semanal dos Treinos', y);

  // Monta lista: por semana, por treino (grupoNome do dia), volume total e kg/rep médio
  const treinosPorSemana: TreinoSemana[] = [];
  semanas
    .filter(s => s.totalTreinos > 0)
    .forEach(s => {
      s.dias
        .filter(d => d.exercicios.length > 0)
        .forEach(d => {
          const vol = d.exercicios.reduce(
            (a, ex) => a + ex.series.reduce((b, sr) => b + Number(sr.peso) * Number(sr.reps), 0), 0
          );
          const totalReps = d.exercicios.reduce(
            (a, ex) => a + ex.series.reduce((b, sr) => b + Number(sr.reps), 0), 0
          );
          const kgPerRep = totalReps > 0 ? vol / totalReps : 0;
          const dataCurta = d.data.split('-').reverse().slice(0, 2).join('/');
          const nomeExibicao = d.grupoNome
            ? `${d.grupoNome} ${dataCurta}`
            : `Treino ${dataCurta}`;
          treinosPorSemana.push({
            semanaLabel: s.label,
            grupoNome: nomeExibicao,
            data: d.data,
            volume: vol,
            totalReps,
            kgPerRep
        });
        });
    });

  // Monta rows comparando o mesmo grupoNome entre semanas
  const rows_resumo: (ResumoRow | null)[] = [];
  const treinosVistos: Record<string, TreinoSemana> = {};

  // Agrupa por semana para exibir
  const semanaLabels = [...new Set(treinosPorSemana.map(t => t.semanaLabel))];
  semanaLabels.forEach(semLabel => {
    const treinos = treinosPorSemana.filter(t => t.semanaLabel === semLabel);
    treinos.forEach((t, tIdx) => {
      let evolStr = '-';
      let evolColor: string = TEMA.cinzaMedio;
      // Extract base name (without date suffix "DD/MM") for cross-week comparison
      const nomeBase = t.grupoNome.replace(/\s+\d{2}\/\d{2}$/, '');
      const isRealGrupo = !nomeBase.startsWith('Treino');
      const prev = treinosVistos[nomeBase];
      if (isRealGrupo && prev && prev.semanaLabel !== t.semanaLabel && prev.volume > 0) {
        const diff = ((t.volume - prev.volume) / prev.volume * 100);
        const sinal = diff >= 0 ? '+' : '';
        evolStr = `${sinal}${diff.toFixed(1)}%`;
        evolColor = diff > 0 ? TEMA.verde : diff < 0 ? TEMA.vermelho : TEMA.cinzaMedio;
      }
      treinosVistos[nomeBase] = t;

      rows_resumo.push({
        semana: tIdx === 0 ? semLabel.replace(/  /g, ' ') : '',
        grupo: t.grupoNome,
        volume: `${t.volume.toLocaleString('pt-BR')} kg·rep`,
        kgRep: `${t.kgPerRep.toFixed(2)} kg/rep`,
        evol: evolStr,
        evolColor,
        });
    });
    if (treinos.length > 0) rows_resumo.push(null);
  });

  if (rows_resumo.filter(Boolean).length === 0) {
    setTextColor(doc, TEMA.cinzaMedio);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.text('Nenhum treino com detalhes registrados.', 14, y + 2);
    y += 10;
  } else {
    if (y > 230) { y = novaPagina(doc); }
    const tableRows = rows_resumo
      .filter(Boolean)
      .map((r: any) => [r.semana, r.grupo, r.volume, r.kgRep, r.evol]);

    autoTable(doc, {
      startY: y,
      head: [['Semana', 'Treino', 'Volume Total', 'Kg/Rep', 'Evolucao kg/rep']],
      body: tableRows,
      ...estiloTabela(),
      headStyles: {
        fillColor: hexToRgb(TEMA.cinzaFundo),
        textColor: hexToRgb(TEMA.amarelo),
        fontSize: 8,
        fontStyle: 'bold' as const,
        },
      columnStyles: {
        0: { cellWidth: 38, fontStyle: 'bold' as const, textColor: hexToRgb(TEMA.cinzaClaro) },
        1: { cellWidth: 52 },
        2: { cellWidth: 32 },
        3: { cellWidth: 22 },
        4: { cellWidth: 28 }
        },
      didParseCell: (data: any) => {
        if (data.column.index === 4 && data.section === 'body') {
          const row = rows_resumo.filter(Boolean)[data.row.index];
          if (row) {
            data.cell.styles.textColor = hexToRgb(row.evolColor as string);
          }
        }
      },
      margin: { left: 14, right: 14, top: 15 },
        });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // Weeks
  for (const semana of semanas) {
    if (y > 250) { y = novaPagina(doc); }

    y = desenharTituloSecao(doc, semana.label, y);

    if (semana.evolucao && semana.totalTreinos > 0) {
      const sinal = semana.evolucao.volume >= 0 ? "+" : "";
      const cor = semana.evolucao.volume >= 0 ? TEMA.verde : TEMA.vermelho;
      setTextColor(doc, cor);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.text(`  ${sinal}${semana.evolucao.volume}% vol vs semana anterior`, W - 14, y - 6, { align: "right" });
    }

    if (semana.dias.every(d => d.exercicios.length === 0 && !d.concluido)) {
      setTextColor(doc, TEMA.cinzaMedio);
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.text("Nenhum treino concluido nesta semana.", 14, y + 2);
      y += 10;
      continue;
    }

    for (const dia of semana.dias.filter(d => d.exercicios.length > 0 || d.concluido)) {
      if (y > 250) { y = novaPagina(doc); }

      const dataFmt = formatarDataCurta(dia.data, { weekday: true });

      if (dia.exercicios.length === 0) {
        // Concluded workout without detailed series
        autoTable(doc, {
          startY: y,
          head: [
            [{ content: `${dataFmt.toUpperCase()}  - CONCLUIDO`, colSpan: 5, styles: { fillColor: hexToRgb(TEMA.cinzaFundo), textColor: hexToRgb(TEMA.cinzaClaro), fontStyle: "bold", fontSize: 9 } }],
          ],
          body: [
            [{ content: "Treino concluido - sem detalhes de series registrados", colSpan: 5, styles: { textColor: hexToRgb(TEMA.cinzaMedio), fontStyle: "italic", fontSize: 8 } }],
          ],
          ...estiloTabela(),
          margin: { left: 14, right: 14, top: 15 },
        });
        y = (doc as any).lastAutoTable.finalY + 4;
        continue;
      }

      const rows: any[] = [];
      for (const ex of dia.exercicios) {
        const seriesStr = ex.series.map((s) => `S${s.numero}: ${Number(s.peso)}kg x ${Number(s.reps)}`).join("   ");
        const maxPeso = Math.max(...ex.series.map((s) => Number(s.peso)));
        const vol = ex.series.reduce((a, s) => a + Number(s.peso) * Number(s.reps), 0);
        rows.push([
          limparTexto(ex.nome),
          limparTexto(ex.grupo),
          seriesStr,
          `${maxPeso} kg`,
          `${vol} kg x rep`,
        ]);
      }

      autoTable(doc, {
        startY: y,
        head: [
          [{ content: `${dataFmt.toUpperCase()}${dia.concluido ? "  - CONCLUIDO" : ""}`, colSpan: 5, styles: { fillColor: hexToRgb(TEMA.cinzaFundo), textColor: hexToRgb(TEMA.cinzaClaro), fontStyle: "bold", fontSize: 9 } }],
          ["Exercicio", "Grupo", "Series", "Max", "Volume"],
        ],
        body: rows,
        ...estiloTabela(),
        showHead: 'firstPage',
        headStyles: { fillColor: hexToRgb(TEMA.cinzaFundo), textColor: hexToRgb(TEMA.amarelo), fontSize: 8, fontStyle: 'bold' as const },
        columnStyles: {
          0: { cellWidth: 48 },
          1: { cellWidth: 28 },
          2: { cellWidth: 68 },
          3: { cellWidth: 22 },
          4: { cellWidth: 24 }
        },
        margin: { left: 14, right: 14, top: 15 },
        });
      y = (doc as any).lastAutoTable.finalY + 4;
    }
    y += 4;
  }

  // Rodapé em todas as páginas
  const totalPaginas = doc.getNumberOfPages();
  for (let i = 1; i <= totalPaginas; i++) {
    doc.setPage(i);
    desenharRodape(doc, `PhysiqCalc - Pagina ${i} de ${totalPaginas}`);
  }

  doc.save(nomeArquivo);
}

function exportarExcel(
  perfil: ProfileData | null,
  avaliacao: any,
  semanas: SemanaAgrupada[],
  mes: number,
  ano: number,
  fallbackNome?: string,
  fallbackEmail?: string
) {
  const wb = XLSX.utils.book_new();
  const nomeAluno = obterNomeAluno(perfil, fallbackNome, fallbackEmail);
  const nomeArquivo = `treinos_${nomeAluno.replace(/\s+/g, "_")}_${MESES[mes - 1]}_${ano}.xlsx`;

  const totalTreinos = semanas.reduce((a, s) => a + s.totalTreinos, 0);
  const volTotal = semanas.reduce((a, s) => a + s.volumeTotal, 0);

  // Sheet 1: Summary
  const resumo = [
    ["PHYSIQCALC — RELATORIO DE TREINOS"],
    [`${MESES[mes - 1]} / ${ano}`],
    [`Gerado em: ${agoraFormatado({ incluirHora: false })}`],
    [],
    ["DADOS DO ALUNO"],
    ["Nome", perfil?.nome ?? fallbackNome ?? "-"],
    ["Email", perfil?.email ?? fallbackEmail ?? "-"],
    ["ID", perfil?.user_code ?? "-"],
    ["Peso", (avaliacao?.peso ?? perfil?.peso) ? `${avaliacao?.peso ?? perfil?.peso} kg` : "-"],
    ["Altura", (avaliacao?.altura ?? perfil?.altura) ? `${avaliacao?.altura ?? perfil?.altura} cm` : "-"],
    ["Idade", perfil?.idade ? `${perfil.idade} anos` : "-"],
    ["% Gordura", (avaliacao?.percentual_gordura ?? perfil?.percentual_gordura) ? `${avaliacao?.percentual_gordura ?? perfil?.percentual_gordura}%` : "-"],
    ["Massa Gorda", (avaliacao?.massa_gorda ?? perfil?.massa_gorda) ? `${avaliacao?.massa_gorda ?? perfil?.massa_gorda} kg` : "-"],
    ["Massa Magra", (avaliacao?.massa_magra ?? perfil?.massa_magra) ? `${avaliacao?.massa_magra ?? perfil?.massa_magra} kg` : "-"],
    ["TMB Mifflin", (avaliacao?.tmb_mifflin ?? perfil?.tmb_mifflin) ? `${avaliacao?.tmb_mifflin ?? perfil?.tmb_mifflin} kcal/dia` : "-"],
    ["TMB Katch", (avaliacao?.tmb_katch ?? perfil?.tmb_katch) ? `${avaliacao?.tmb_katch ?? perfil?.tmb_katch} kcal/dia` : "-"],
    [],
    ["RESUMO DO MES"],
    ["Treinos no mes", totalTreinos],
    ["Volume total (kg x rep)", volTotal],
    ["Media por semana", parseFloat((totalTreinos / Math.max(semanas.length, 1)).toFixed(1))],
    [],
    ["COMPARATIVO POR SEMANA"],
    ["Semana", "Periodo", "Treinos", "Volume (kg x rep)", "Var. Vol %", "Var. Treinos"],
    ...semanas.map((s) => [
      s.label.split("  ")[0],
      s.label.split("  ")[1] ?? "",
      s.totalTreinos,
      s.volumeTotal,
      s.evolucao ? `${s.evolucao.volume >= 0 ? "+" : ""}${s.evolucao.volume}%` : "-",
      s.evolucao ? `${s.evolucao.treinos >= 0 ? "+" : ""}${s.evolucao.treinos}` : "-",
    ]),
  ];

  const wsResumo = XLSX.utils.aoa_to_sheet(resumo);
  wsResumo["!cols"] = [{ wch: 30 }, { wch: 20 }, { wch: 15 }, { wch: 18 }, { wch: 12 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo");

  // Sheet 2: Detailed workouts
  const linhas: any[][] = [
    ["Data", "Dia da semana", "Concluido", "Exercicio", "Grupo Muscular", "Serie", "Peso (kg)", "Reps", "Volume (kg x rep)"],
  ];

  for (const semana of semanas) {
    for (const dia of semana.dias) {
      for (const ex of dia.exercicios) {
        for (const s of ex.series) {
          linhas.push([
            dia.data,
            formatarDataCurta(dia.data, { weekday: true }),
            dia.concluido ? "Sim" : "Nao",
            ex.nome,
            ex.grupo,
            `S${s.numero}`,
            s.peso,
            s.reps,
            s.peso * s.reps,
          ]);
        }
      }
    }
  }

  const wsDetalhes = XLSX.utils.aoa_to_sheet(linhas);
  wsDetalhes["!cols"] = [
    { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 36 },
    { wch: 22 }, { wch: 8 }, { wch: 12 }, { wch: 8 }, { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, wsDetalhes, "Treinos Detalhados");

  // Sheet 3: Evolution by exercise
  const porExercicio: Record<string, { data: string; semana: number; series: number; maxPeso: number; vol: number }[]> = {};

  for (const semana of semanas) {
    for (const dia of semana.dias) {
      for (const ex of dia.exercicios) {
        if (!porExercicio[ex.nome]) porExercicio[ex.nome] = [];
        const maxPeso = Math.max(...ex.series.map((s) => s.peso));
        const vol = ex.series.reduce((a, s) => a + s.peso * s.reps, 0);
        porExercicio[ex.nome].push({ data: dia.data, semana: semana.numero, series: ex.series.length, maxPeso, vol });
      }
    }
  }

  const evolucaoLinhas: any[][] = [
    ["Exercicio", "Data", "Semana", "Series", "Peso Max (kg)", "Volume (kg x rep)"],
  ];
  for (const [nome, registros] of Object.entries(porExercicio)) {
    for (const r of registros) {
      evolucaoLinhas.push([nome, r.data, `Semana ${r.semana}`, r.series, r.maxPeso, r.vol]);
    }
  }

  const wsEvolucao = XLSX.utils.aoa_to_sheet(evolucaoLinhas);
  wsEvolucao["!cols"] = [{ wch: 36 }, { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 16 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, wsEvolucao, "Evolucao por Exercicio");

  XLSX.writeFile(wb, nomeArquivo);
}

// ── Main component ──

interface AdminRelatorioProps {
  users: UserOption[];
}

const AdminRelatorio = ({ users }: AdminRelatorioProps) => {
  const [usuarioSelecionado, setUsuarioSelecionado] = useState("");
  const [mesSelecionado, setMesSelecionado] = useState(new Date().getMonth() + 1);
  const [anoSelecionado, setAnoSelecionado] = useState(new Date().getFullYear());
  const [perfil, setPerfil] = useState<ProfileData | null>(null);
  const [avaliacao, setAvaliacao] = useState<any>(null);
  const [semanas, setSemanas] = useState<SemanaAgrupada[]>([]);
  const [semanaAberta, setSemanaAberta] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!usuarioSelecionado) return;
    setLoading(true);

    Promise.all([
      carregarDadosUsuario(usuarioSelecionado),
      carregarRelatorioCompleto(usuarioSelecionado, anoSelecionado, mesSelecionado),
    ]).then(([dadosUsuario, dadosTreino]) => {
      setPerfil(dadosUsuario.perfil);
      setAvaliacao(dadosUsuario.avaliacao);
      const semanasAgrupadas = agruparPorSemana(
        dadosTreino.concluidos,
        dadosTreino.series,
        anoSelecionado,
        mesSelecionado,
        dadosTreino.grupoNomePorData ?? {}
      );
      setSemanas(semanasAgrupadas);
      setSemanaAberta(Math.ceil(new Date().getDate() / 7));
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
  }, [usuarioSelecionado, anoSelecionado, mesSelecionado]);

  return (
    <div className="space-y-5">
      {/* Selectors */}
      <div className="flex gap-2.5 flex-wrap">
        <select
          value={usuarioSelecionado}
          onChange={(e) => setUsuarioSelecionado(e.target.value)}
          className="flex-[2] bg-transparent border-b border-muted-foreground text-foreground font-body text-sm py-2.5 outline-none focus:border-primary transition-colors min-w-[180px]"
        >
          <option value="">Selecionar usuário...</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nome} ({u.email})
            </option>
          ))}
        </select>
        <select
          value={mesSelecionado}
          onChange={(e) => setMesSelecionado(Number(e.target.value))}
          className="flex-1 bg-transparent border-b border-muted-foreground text-foreground font-body text-sm py-2.5 outline-none focus:border-primary transition-colors min-w-[100px]"
        >
          {MESES.map((m, i) => (
            <option key={i + 1} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <select
          value={anoSelecionado}
          onChange={(e) => setAnoSelecionado(Number(e.target.value))}
          className="bg-transparent border-b border-muted-foreground text-foreground font-body text-sm py-2.5 outline-none focus:border-primary transition-colors min-w-[70px]"
        >
          {[2025, 2026, 2027].map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      {loading && (
        <div className="text-center py-10 text-muted-foreground font-body">Carregando relatório...</div>
      )}

      {!loading && usuarioSelecionado && (
        <>
          <CardPerfil perfil={perfil} avaliacao={avaliacao} />
          <ResumoMes semanas={semanas} />

          {semanas.length > 0 && (
            <div className="flex gap-2.5 justify-end mb-5">
              <button
                onClick={() => {
                  const u = users.find(u => u.id === usuarioSelecionado);
                  exportarPDF(perfil, avaliacao, semanas, mesSelecionado, anoSelecionado, u?.nome, u?.email);
                }}
                className="flex items-center gap-2 bg-destructive/10 border border-destructive text-destructive rounded-lg px-4 py-2.5 font-heading font-bold text-sm hover:bg-destructive hover:text-destructive-foreground transition-all"
              >
                📄 Exportar PDF
              </button>
              <button
                onClick={() => {
                  const u = users.find(u => u.id === usuarioSelecionado);
                  exportarExcel(perfil, avaliacao, semanas, mesSelecionado, anoSelecionado, u?.nome, u?.email);
                }}
                className="flex items-center gap-2 bg-classify-green/10 border border-classify-green text-classify-green rounded-lg px-4 py-2.5 font-heading font-bold text-sm hover:bg-classify-green hover:text-background transition-all"
              >
                📊 Exportar Excel
              </button>
            </div>
          )}

          {semanas.map((s) => (
            <CardSemana
              key={s.numero}
              semana={s}
              aberta={semanaAberta === s.numero}
              onToggle={() => setSemanaAberta((p) => (p === s.numero ? null : s.numero))}
            />
          ))}

          {semanas.every((s) => s.totalTreinos === 0) && semanas.every((s) => s.dias.every((d) => d.exercicios.length === 0)) && (
            <div className="text-center py-10 text-muted-foreground font-body">
              Nenhum treino registrado em {MESES[mesSelecionado - 1]} de {anoSelecionado}.
            </div>
          )}
        </>
      )}

      {!usuarioSelecionado && !loading && (
        <div className="text-center py-10 text-muted-foreground font-body">
          Selecione um usuário para ver o relatório.
        </div>
      )}
    </div>
  );
};

export default AdminRelatorio;
