import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Copy, ImageOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { enderecoDoDiario } from "@/nucleo/siteAntigoNutri";
import { tomReacao, type Reacao } from "@/nutricao/app/diarioUtil";
import { usePaginaNaUrl } from "@/ui/casca/usePaginaNaUrl";
import { Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoCarregando, EstadoErro, EstadoVazio } from "@/ui/premium/Estados";
import { Paginacao } from "@/ui/premium/Paginacao";
import { Segmentado } from "@/ui/premium/Segmentado";
import type { ContextoDietas } from "./contexto";
import { excluirRegistro, listarAlunosDoDiario, listarDiarioPaginaComDias, reagir, type RegistroDiarioNutri } from "./diario";
import {
  PERIODOS, agruparPorDia, inicioDoPeriodo, nomeAluno, periodoDaURL, plural, primeiroNomeAluno, textoPeriodo, textoReacaoNutri, textoRegistro, tituloDia,
} from "./diarioPainel";
import { AcaoLinha, ConfirmarExclusao, Filtro } from "./pecas";
import ReacaoInline from "./ReacaoInline";
import { CHAVE_DIARIO, useMiniaturas, useNaoReagidas } from "./useDiario";
import VerFotoDiarioDialog from "./VerFotoDiarioDialog";

// Physiq W24 — Painel › Dietas › Diário (N-18): porta da tela "Diário alimentar" do PhysiqNutri (src/pages/consultorio/Diario.tsx) no
// visual premium (as fotos como o "Diário de hoje" da tela 6): as fotos das refeições que os alunos mandam (pelo app — Dieta › Foto
// pro diário — ou pelo link /d/<código>, sem login) dos últimos 7 a 90 dias (?dias=), filtro por aluno (?aluno=), "Só não reagidas"
// (?nao_reagidas=1), agrupadas por dia, com a miniatura (URL assinada — bucket privado), o aluno (abre o perfil), "Almoço · 12:40", o
// comentário dele, a reação (Ótimo, Bom, Atenção, Evitar + comentário — vira aviso no sino do aluno) e Excluir (soft + a foto sai).
// Quem lê e reage é a nutricionista da conta (a responsável pelo aluno ou o dono com papel de nutri — P1); o banco garante.
// hml-14b (B21): 20 fotos por página, do banco (o período, o aluno e o "Só não reagidas" filtram lá), a página no endereço (?pagina=);
// as opções do filtro de aluno e as contagens também vêm do banco.

/** "41 registros · 3 não reagidas" (o total vem do banco; quantos dias ele cobre ficou de fora — a página não traz todos). */
const textoDaContagem = (total: number, naoReagidas: number): string =>
  !total ? "Nenhum registro" : `${plural(total, "registro", "registros")}${naoReagidas > 0 ? ` · ${plural(naoReagidas, "não reagida", "não reagidas")}` : ""}`;

function FotoDoCartao({ registro, url, aoAbrir, aoFalhar }: { registro: RegistroDiarioNutri; url?: string; aoAbrir: () => void; aoFalhar: () => void }) {
  const reacao = textoReacaoNutri(registro).split(" — ")[0];
  return (
    <button type="button" onClick={aoAbrir} aria-label={`Ver a foto de ${nomeAluno(registro)}`}
      className="group relative h-[132px] w-[132px] flex-none overflow-hidden rounded-[18px] border border-linha bg-superficie-2 sm:h-[148px] sm:w-[148px]" data-btn-ver-foto>
      {url ? (
        <img src={url} alt={textoRegistro(registro)} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" loading="lazy" onError={aoFalhar} data-foto />
      ) : (
        <span className="absolute inset-0 animate-pulse bg-superficie-2" data-foto-carregando />
      )}
      <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,.28) 0%, transparent 34%, transparent 58%, rgba(0,0,0,.7) 100%)" }} />
      {reacao && (
        <Chip tom={tomReacao(registro.reacao_nutri)} className="absolute right-2 top-2 h-[22px] px-2 text-[10.5px] normal-case tracking-[0.02em] !bg-[rgba(9,9,11,.72)] backdrop-blur-sm" data-foto-reacao={registro.reacao_nutri ?? ""}>
          {reacao}
        </Chip>
      )}
      <span className="absolute bottom-2 left-2.5 right-2 truncate text-left text-[12.5px] font-semibold text-white drop-shadow" data-foto-nome>{primeiroNomeAluno(registro)}</span>
    </button>
  );
}

export function Diario({ ctx, params, setParams }: { ctx: ContextoDietas; params: URLSearchParams; setParams: (p: URLSearchParams, o?: { replace?: boolean }) => void }) {
  const qc = useQueryClient();
  const dias = periodoDaURL(params.get("dias"));
  const alunoId = params.get("aluno") ?? params.get("paciente") ?? "";
  const soNaoReagidas = params.get("nao_reagidas") === "1";
  // o início do período muda só quando muda o número de dias (à meia-noite a página é recarregada pelo foco)
  const deIso = useMemo(() => inicioDoPeriodo(dias).toISOString(), [dias]);
  const ligado = ctx.souNutri && !!ctx.contaId && !!ctx.uid;
  const filtro = useMemo(() => ({ dias, alunoId, soNaoReagidas }), [dias, alunoId, soNaoReagidas]);

  // hml-14b (B21): a página do banco; filtro novo volta à 1 e a página além do fim (a lista encolheu) vai para a última
  const [totalLido, setTotalLido] = useState<number | null>(null);
  const { pagina, irPara } = usePaginaNaUrl({ filtro, total: totalLido });
  const q = useQuery({
    queryKey: [...CHAVE_DIARIO, "pagina", ctx.contaId, ctx.uid, dias, alunoId, soNaoReagidas, pagina],
    queryFn: () => listarDiarioPaginaComDias(ctx.contaId, ctx.uid, { deIso, alunoId, soNaoReagidas }, pagina),
    enabled: ligado,
    placeholderData: keepPreviousData,
    staleTime: 20_000,
    refetchOnWindowFocus: true,
  });
  const totalDaResposta = q.data && !q.isPlaceholderData ? q.data.total : null;
  useEffect(() => {
    if (totalDaResposta !== null) setTotalLido(totalDaResposta);
  }, [totalDaResposta]);
  // as opções do filtro "Aluno": quem tem foto no período — do banco, não da página que carregou
  const alunosQ = useQuery({
    queryKey: [...CHAVE_DIARIO, "alunos", ctx.contaId, ctx.uid, dias],
    queryFn: () => listarAlunosDoDiario(ctx.contaId, ctx.uid, deIso),
    enabled: ligado,
    staleTime: 20_000,
  });
  // o "Só não reagidas (N)": as do período (e do aluno do filtro), contadas no banco (a mesma chave do número da aba)
  const naoReagidasQ = useNaoReagidas(ctx.contaId, ctx.uid, dias, alunoId, ligado);

  const itens = useMemo(() => q.data?.itens ?? [], [q.data]);
  const total = q.data?.total ?? 0;
  const alunos = useMemo(() => alunosQ.data ?? [], [alunosQ.data]);
  const naoReagidas = naoReagidasQ.data ?? 0;
  // o dia que a página partiu ao meio diz o total do dia (do banco), não só o que coube aqui
  const grupos = useMemo(() => {
    const porDia = q.data?.porDia ?? {};
    return agruparPorDia(itens).map((g) => {
      const n = porDia[g.chave] ?? g.itens.length;
      return { ...g, total: n, titulo: n === g.itens.length ? g.titulo : tituloDia(new Date(g.itens[0].data_hora), n) };
    });
  }, [itens, q.data]);
  const codigoAluno = alunos.find((p) => p.id === alunoId)?.link_codigo ?? "";
  const alunoForaDaLista = !!alunoId && !alunos.some((p) => p.id === alunoId);
  const { urls, renovar } = useMiniaturas(itens);

  const setFiltro = useCallback(
    (mud: { dias?: number; aluno?: string; nao_reagidas?: boolean }) => {
      const novos = new URLSearchParams();
      novos.set("aba", "diario");
      novos.set("dias", String(mud.dias ?? dias));
      const a = mud.aluno ?? alunoId;
      if (a) novos.set("aluno", a);
      if (mud.nao_reagidas ?? soNaoReagidas) novos.set("nao_reagidas", "1");
      setParams(novos, { replace: true });
    },
    [dias, alunoId, soNaoReagidas, setParams],
  );

  const [salvando, setSalvando] = useState(false);
  const rodar = async (acao: () => Promise<void>, erroPadrao: string): Promise<boolean> => {
    setSalvando(true);
    try {
      await acao();
      await qc.invalidateQueries({ queryKey: CHAVE_DIARIO });
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : erroPadrao);
      return false;
    } finally {
      setSalvando(false);
    }
  };
  const reagirEm = (r: RegistroDiarioNutri, reacao: Reacao | null, comentario: string) =>
    rodar(async () => {
      await reagir(r.id, reacao, comentario);
      toast.success(reacao ? "Reação enviada" : "Reação removida", { description: `${nomeAluno(r)} · ${textoRegistro(r)}` });
    }, "Não foi possível enviar a reação");

  const [paraExcluir, setParaExcluir] = useState<RegistroDiarioNutri | null>(null);
  const excluir = async () => {
    if (!paraExcluir) return;
    const alvo = paraExcluir;
    const ok = await rodar(async () => {
      await excluirRegistro(alvo);
      toast.success("Foto excluída", { description: `${nomeAluno(alvo)} · ${textoRegistro(alvo)}` });
    }, "Não foi possível excluir a foto");
    if (ok) setParaExcluir(null);
  };

  const copiarLink = async () => {
    if (!codigoAluno) return;
    const link = enderecoDoDiario(codigoAluno);
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      /* sem permissão: o link fica na descrição do aviso */
    }
    toast.success("Link copiado", { description: link });
  };

  const [verFoto, setVerFoto] = useState<RegistroDiarioNutri | null>(null);
  const irmas = useMemo(() => (verFoto ? grupos.find((g) => g.itens.some((i) => i.id === verFoto.id))?.itens ?? [] : []), [grupos, verFoto]);
  const podeReagir = (r: RegistroDiarioNutri) => ctx.master || (ctx.souNutri && (ctx.dono || r.paciente?.nutricionista_id === ctx.uid));

  if (!ctx.souNutri) {
    return (
      <EstadoVazio icone={Camera} titulo="O diário alimentar é da nutricionista" className="mt-2"
        texto="Quem vê as fotos das refeições e reage é a nutricionista da conta (a responsável pelo aluno ou o dono com o papel de nutricionista)." />
    );
  }

  const contagemTexto = q.isLoading ? "Contando…" : `${textoPeriodo(dias)} · ${textoDaContagem(total, soNaoReagidas ? total : naoReagidas)}`;
  const semFiltro = !alunoId && !soNaoReagidas;

  return (
    <div className="flex flex-col gap-4" data-pagina-diario data-total-filtrados={total} data-nao-reagidas={naoReagidas}
      data-periodo-ativo={dias} data-aluno-filtro={alunoId} data-salvando-diario={salvando ? "1" : "0"} data-carregando={q.isLoading ? "1" : "0"} data-atualizando={q.isFetching ? "1" : "0"}>
      <Cartao className="p-4">
        <div className="flex flex-wrap items-end gap-2.5" data-filtros-diario>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-texto-4">Período</span>
            <Segmentado rotulo="Período" opcoes={PERIODOS.map((n) => ({ valor: String(n), rotulo: `${n} dias` }))} valor={String(dias)} aoMudar={(v) => setFiltro({ dias: Number(v) })} />
          </div>
          <Filtro largo rotulo="Aluno" value={alunoId} onChange={(e) => setFiltro({ aluno: e.target.value })} aria-label="Filtrar por aluno" data-campo-aluno>
            <option value="">Todos os alunos</option>
            {alunos.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
            {alunoForaDaLista && <option value={alunoId}>{alunosQ.isPending ? "Carregando…" : "Aluno sem fotos no período"}</option>}
          </Filtro>
          <button
            type="button"
            aria-pressed={soNaoReagidas}
            onClick={() => setFiltro({ nao_reagidas: !soNaoReagidas })}
            className={cn("pq-chip h-9 px-3.5 text-[12px] normal-case tracking-normal", soNaoReagidas ? "pq-chip-n" : "pq-chip-g")}
            data-btn-nao-reagidas
            data-badge-nao-reagidas={naoReagidas}
          >
            Só não reagidas <span className="tabular-nums opacity-80">({naoReagidas})</span>
          </button>
          <AcaoLinha icone={Copy} className="h-9" onClick={() => void copiarLink()} disabled={!codigoAluno}
            title={codigoAluno ? "Copiar o link público do diário deste aluno" : "Escolha um aluno com foto no período para copiar o link"} data-btn-copiar-link>
            Copiar link do diário
          </AcaoLinha>
        </div>
        <p className="mt-2.5 text-[12.5px] text-texto-2" data-contagem-diario={total}>{contagemTexto}</p>
      </Cartao>

      {q.error ? (
        <EstadoErro texto={`Não foi possível carregar o diário: ${(q.error as Error).message}`} aoTentar={() => void q.refetch()} />
      ) : q.isLoading ? (
        <EstadoCarregando linhas={3} rotulo="Carregando o diário" />
      ) : total === 0 && semFiltro ? (
        <div data-diario-vazio>
          <EstadoVazio icone={Camera} titulo="Nenhuma foto no diário"
            texto="Os alunos mandam as fotos das refeições pelo app (Dieta › Foto pro diário) ou pelo link do diário, que fica no perfil de cada aluno (Resumo › Link do diário)." />
        </div>
      ) : total === 0 ? (
        <div data-diario-filtro-vazio>
          <EstadoVazio icone={ImageOff} titulo="Nenhuma foto com esse filtro" texto="Mude o período, o aluno ou tire o “Só não reagidas”." />
        </div>
      ) : (
        <div className="flex flex-col gap-4" data-lista="diario">
          {grupos.map((g) => (
            <section key={g.chave} className="flex flex-col gap-2.5" data-dia={g.chave} data-dia-total={g.total}>
              <h2 className="pq-eyebrow px-1" data-dia-titulo>{g.titulo}</h2>
              <ul className="grid gap-3 lg:grid-cols-2">
                {g.itens.map((r) => (
                  <li key={r.id} data-item>
                    <Cartao className="flex gap-3.5 p-3" data-registro={r.id} data-reagido={r.reacao_nutri ? "1" : "0"} data-registro-paciente={r.paciente_id}>
                      <FotoDoCartao registro={r} url={urls[r.id]} aoAbrir={() => setVerFoto(r)} aoFalhar={() => renovar(r.id)} />
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <Link to={`/painel/alunos/${r.paciente_id}`} className="block truncate text-[14px] font-semibold text-texto hover:text-verde-3" data-registro-nome>
                              {nomeAluno(r)}
                            </Link>
                            <p className="text-[12px] text-texto-3" data-registro-refeicao>{textoRegistro(r)}</p>
                          </div>
                          {podeReagir(r) && (
                            <button type="button" className="pq-ibtn flex-none !text-texto-3 hover:!text-rosa-3" style={{ width: 32, height: 32, borderRadius: 10 }}
                              onClick={() => setParaExcluir(r)} disabled={salvando} aria-label="Excluir a foto" title="Excluir a foto" data-btn-excluir-registro>
                              <Trash2 aria-hidden />
                            </button>
                          )}
                        </div>
                        {r.comentario && <p className="line-clamp-3 whitespace-pre-wrap text-[12.5px] text-texto-2" data-registro-comentario>“{r.comentario}”</p>}
                        <div className="mt-auto pt-1">
                          <ReacaoInline key={`${r.id}:${r.reacao_nutri ?? ""}:${r.reagido_em ?? ""}`} registro={r} salvando={salvando} podeReagir={podeReagir(r)}
                            onReagir={(reacao, comentario) => reagirEm(r, reacao, comentario)} />
                        </div>
                      </div>
                    </Cartao>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {!q.error && <Paginacao nome="diario" pagina={pagina} total={total} aoMudar={irPara} carregando={q.isFetching} />}

      <VerFotoDiarioDialog open={!!verFoto} onOpenChange={(a) => !a && setVerFoto(null)} registro={verFoto} irmas={irmas} onTrocar={setVerFoto} />
      <ConfirmarExclusao
        aberto={!!paraExcluir}
        aoMudar={(a) => !a && setParaExcluir(null)}
        titulo="Excluir esta foto?"
        texto={paraExcluir ? `${nomeAluno(paraExcluir)} · ${textoRegistro(paraExcluir)}. A foto é apagada e o registro some do diário do aluno.` : ""}
        ocupado={salvando}
        aoConfirmar={() => void excluir()}
        data-confirmar-excluir-registro
      />
    </div>
  );
}
