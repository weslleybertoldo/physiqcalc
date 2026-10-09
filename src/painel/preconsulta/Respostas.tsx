// Physiq W21 — Pré-consulta › Respostas (porta de src/pages/consultorio/RespostasPreConsulta.tsx do PhysiqNutri, main 294887a, no
// padrão das telas 6/7 — a lista "Precisam de atenção"): a caixa de entrada do que chegou pelo link /f/<slug>, mais recente primeiro,
// com os filtros na URL (formulário, busca por nome/e-mail/telefone, "Novas" = sem aluno ligado — o ?sem=1 do Nutri — e ?aluno=<id>).
// Cada resposta: Ver (pergunta · resposta · pontos), Ligar a um aluno (P1), Importar para o prontuário (só a nutricionista com
// Nutrição: questionário → aplicação de questionário; pré-anamnese/personalizado → anamnese — W18), Desligar e Excluir (soft).
// hml-14b (B21): a lista vem do banco 20 por vez (respostas_da_conta) — filtros, busca, contagem e os títulos do filtro também; a
// página fica no endereço (?pagina=) e o aluno ligado vem junto da resposta (sem a lista de alunos da conta).
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Download, Eraser, Inbox, Search, Trash2, Unlink, UserCheck, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { BTN_PERIGO, BTN_PRI, BTN_SEC, DESCRICAO_JANELA, JANELA, SELECT, TITULO_JANELA } from "@/nutricao/editor/ui/estilos";
import { formatarPontos, textoPontuacao } from "@/nutricao/prontuario/lib/questionariosUtil";
import { usePaginaNaUrl } from "@/ui/casca/usePaginaNaUrl";
import { Avatar } from "@/ui/premium/Avatar";
import { Botao } from "@/ui/premium/Botao";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoErro, EstadoVazio, Esqueleto } from "@/ui/premium/Estados";
import { Paginacao } from "@/ui/premium/Paginacao";
import { Segmentado } from "@/ui/premium/Segmentado";
import { criarAnamnese, criarAplicacao, excluirResposta, ligarAluno, listarRespostasPagina, marcarImportada, type RespostaDaLista } from "./dados";
import LigarAlunoDialog from "./LigarAlunoDialog";
import { CHAVES_PRECONSULTA } from "./novas";
import { Acao, BTN_MINI, SeloNivel } from "./pecas";
import RespostaDetalhe from "./RespostaDetalhe";
import {
  anamneseDaResposta, aplicacaoDaResposta, contatoResposta, ehNova, filtrosAtivos, filtrosDaURL, filtrosParaURL, formatarDataHoraResposta, linkAluno, linkImportada,
  motivoSemImportar, podeDesligar, pontosDaResposta, situacaoFormulario, textoConfirmarImportar, textoContagemRespostas, textoImportada, textoSituacaoFormulario,
  tipoImportacao, type FiltrosRespostas,
} from "./respostasUtil";
import type { ContextoPreConsulta, DadosPreConsulta } from "./usePreConsulta";

export default function Respostas({ ctx, d, params, setParams }: {
  ctx: ContextoPreConsulta;
  d: DadosPreConsulta;
  params: URLSearchParams;
  setParams: (p: URLSearchParams, o?: { replace?: boolean }) => void;
}) {
  const navigate = useNavigate();
  const filtros = useMemo(() => filtrosDaURL(params), [params]);
  const [busca, setBusca] = useState(filtros.busca);

  // hml-14b (B21): a página do banco; filtro novo volta à 1 e a página além do fim (a lista encolheu) vai para a última
  const [totalLido, setTotalLido] = useState<number | null>(null);
  const { pagina, irPara } = usePaginaNaUrl({ filtro: filtros, total: totalLido });
  const q = useQuery({
    queryKey: [...CHAVES_PRECONSULTA.respostas(ctx.contaId, ctx.uid), "pagina", filtros, pagina],
    queryFn: () => listarRespostasPagina(ctx.contaId, filtros, pagina),
    enabled: ctx.pronto,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
  const totalDaResposta = q.data && !q.isPlaceholderData ? q.data.total : null;
  useEffect(() => {
    if (totalDaResposta !== null) setTotalLido(totalDaResposta);
  }, [totalDaResposta]);
  const respostas = useMemo(() => q.data?.itens ?? [], [q.data]);
  const total = q.data?.total ?? 0;
  const totalConta = q.data?.totalConta ?? 0;
  const novas = q.data?.novas ?? 0;
  const titulos = q.data?.titulos ?? [];

  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const [ligando, setLigando] = useState<RespostaDaLista | null>(null);
  const [paraImportar, setParaImportar] = useState<RespostaDaLista | null>(null);
  const [paraExcluir, setParaExcluir] = useState<RespostaDaLista | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(0); // gravações fora do modal — o E2E espera voltar a 0

  const atualizar = (mudanca: Partial<FiltrosRespostas>) => {
    const novos = { ...filtrosDaURL(params), ...mudanca };
    const url = new URLSearchParams(filtrosParaURL(novos));
    url.set("aba", "respostas");
    setParams(url, { replace: true });
  };
  useEffect(() => {
    const t = setTimeout(() => {
      if (busca.trim() !== filtros.busca) atualizar({ busca: busca.trim() });
    }, 300);
    return () => clearTimeout(t);
  }, [busca]); // eslint-disable-line react-hooks/exhaustive-deps -- só a digitação dispara
  const limparFiltros = () => {
    setBusca("");
    setParams(new URLSearchParams({ aba: "respostas" }), { replace: true });
  };

  const comOcupado = async (id: string, fn: () => Promise<void>) => {
    setOcupado(id);
    setSalvando((n) => n + 1);
    try {
      await fn();
    } finally {
      setOcupado(null);
      setSalvando((n) => n - 1);
    }
  };

  const desligar = (r: RespostaDaLista) => comOcupado(r.id, async () => {
    try {
      await ligarAluno(r.id, null);
      await d.recarregar("respostas");
      toast.success("Aluno desligado da resposta — ela volta para as novas");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível desligar");
    }
  });

  const importar = async () => {
    const r = paraImportar;
    if (!r || !r.paciente_id) return;
    const pacienteId = r.paciente_id;
    await comOcupado(r.id, async () => {
      try {
        const tipo = tipoImportacao(r);
        const alvoId = tipo === "questionario"
          ? (await criarAplicacao(ctx.uid, pacienteId, aplicacaoDaResposta(r))).id
          : (await criarAnamnese(ctx.uid, pacienteId, null, anamneseDaResposta(r))).id;
        const nova = await marcarImportada(r.id, tipo, alvoId);
        await d.recarregar("respostas");
        const link = linkImportada(nova);
        toast.success(tipo === "questionario" ? "Resposta importada como aplicação de questionário" : "Resposta importada como anamnese", {
          action: link ? { label: "Ver no aluno", onClick: () => navigate(link) } : undefined,
        });
        setParaImportar(null);
      } catch (e) {
        const m = e instanceof Error ? e.message : "";
        toast.error(/row-level security|permission/i.test(m) ? "Só a nutricionista responsável pelo aluno importa para o prontuário dele." : m || "Não foi possível importar a resposta");
      }
    });
  };

  const excluir = async () => {
    const alvo = paraExcluir;
    if (!alvo) return;
    await comOcupado(alvo.id, async () => {
      try {
        await excluirResposta(alvo.id);
        await d.recarregar("respostas");
        toast.success(`Resposta de ${alvo.nome} excluída`);
        setParaExcluir(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Não foi possível excluir");
      }
    });
  };

  const alunoFiltro = filtros.aluno ? q.data?.alunoFiltro : null;
  const nomeParaImportar = paraImportar?.aluno?.nome ?? "";

  return (
    <div data-aba-respostas data-salvando-resposta={salvando} data-atualizando={q.isFetching ? "1" : "0"}>
      <Cartao className="px-[22px] pb-3 pt-[18px]" data-cartao-respostas data-contagem-respostas={totalConta} data-novas={novas}>
        <CabecalhoCartao titulo="Caixa de entrada"
          extra={novas > 0 ? <Chip tom="a" className="h-[22px] text-[10.5px]" data-chip-novas>{novas} {novas === 1 ? "NOVA" : "NOVAS"}</Chip> : undefined}
          acao={<span className="text-[12px] text-texto-3">{q.isPending ? "" : `${textoContagemRespostas(totalConta)}${total !== totalConta ? ` · ${total} no filtro` : ""}`}</span>} />

        <div className="mb-2 grid grid-cols-1 items-center gap-2.5 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto]" data-filtros-respostas>
          <div className="relative">
            <Search aria-hidden className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-texto-3" />
            <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Busque por nome, e-mail ou telefone"
              className="h-10 w-full rounded-xl border border-linha-2 bg-[rgba(255,255,255,.04)] pl-10 pr-3 text-[14px] text-texto outline-none placeholder:text-texto-4 focus:border-violeta/60"
              data-busca-respostas />
          </div>
          <select className={SELECT} value={titulos.includes(filtros.formulario) ? filtros.formulario : ""} onChange={(e) => atualizar({ formulario: e.target.value })}
            aria-label="Formulário" data-filtro-formulario>
            <option value="">Todos os formulários</option>
            {titulos.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <Segmentado rotulo="Mostrar" opcoes={[{ valor: "todas", rotulo: "Todas" }, { valor: "novas", rotulo: `Novas${novas ? ` · ${novas}` : ""}` }]}
            valor={filtros.soNovas ? "novas" : "todas"} aoMudar={(v) => atualizar({ soNovas: v === "novas" })} />
        </div>
        {(filtros.aluno || filtrosAtivos(filtros)) && (
          <div className="mb-1 flex flex-wrap items-center gap-2" data-filtros-ativos>
            {filtros.aluno && (
              <Chip tom="t" className="h-[24px] text-[11px]" data-filtro-aluno={filtros.aluno}>
                ALUNO: {alunoFiltro?.nome ?? "…"}
              </Chip>
            )}
            <button type="button" onClick={limparFiltros} className="inline-flex items-center gap-1 text-[12px] font-semibold text-texto-3 hover:text-texto" data-btn-limpar-filtros>
              <Eraser aria-hidden className="h-3.5 w-3.5" /> Limpar filtros
            </button>
          </div>
        )}

        {q.isError ? (
          <EstadoErro titulo="Não deu para carregar as respostas" texto={q.error instanceof Error ? q.error.message : undefined} aoTentar={() => void q.refetch()} className="my-3" />
        ) : q.isPending ? (
          <div className="flex flex-col gap-2 py-2" data-carregando-respostas>{[0, 1, 2].map((i) => <Esqueleto key={i} className="h-[62px] w-full" />)}</div>
        ) : totalConta === 0 ? (
          <EstadoVazio icone={Inbox} className="my-3" titulo="Nenhuma resposta ainda"
            texto="Copie o link de um formulário e mande para quem vai responder: a pessoa responde sem login e a resposta aparece aqui." />
        ) : total === 0 ? (
          <EstadoVazio icone={Search} className="my-3" titulo="Nenhuma resposta com esses filtros" acao={<Botao tamanho="sm" icone={X} onClick={limparFiltros}>Limpar filtros</Botao>} />
        ) : (
          <div className="divide-y divide-linha-3 border-t border-linha-3" data-lista="respostas" data-lista-respostas>
            {respostas.map((r) => {
              const pts = pontosDaResposta(r);
              const situacao = situacaoFormulario(r);
              const aluno = r.aluno ?? null;
              const nomeAluno = aluno?.nome ?? "";
              const linkImp = linkImportada(r);
              const aberto = !!abertos[r.id];
              const contato = contatoResposta(r);
              const nova = ehNova(r);
              const motivo = ctx.souNutri ? motivoSemImportar(r, { uid: ctx.uid, souNutri: ctx.souNutri, souDono: ctx.dono }, aluno) : null;
              return (
                <div key={r.id} className="py-3" data-item data-resposta={r.id} data-resposta-nome={r.nome} data-resposta-formulario={r.titulo} data-resposta-aluno={r.paciente_id ?? ""}
                  data-resposta-nova={nova ? "1" : "0"} data-resposta-pontos={formatarPontos(pts.pontos)} data-resposta-nivel={pts.nivel}
                  data-resposta-importada={r.importada_em ? "1" : "0"}>
                  <div className="flex flex-wrap items-center gap-3">
                    <Avatar nome={r.nome} tamanho={38} />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <b className="text-[14px] font-semibold tracking-[-0.01em] text-texto" data-resposta-linha1>{r.nome}</b>
                        {nova && <Chip tom="a" className="h-[20px] text-[10px]" data-resposta-chip-nova>NOVA</Chip>}
                        {pts.temFaixas && <SeloNivel nivel={pts.nivel} rotulo={pts.faixa} data-resposta-badge={pts.nivel || "sem"} />}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-texto-3">
                        <span data-resposta-titulo>{r.titulo}</span>
                        <span className="text-texto-4">·</span>
                        <span data-resposta-quando>{formatarDataHoraResposta(r.respondido_em)}</span>
                        <span className="text-texto-4">·</span>
                        <span data-resposta-resumo>{contato || "sem contato"}{pts.max > 0 ? ` · ${textoPontuacao(pts.pontos, pts.max)}` : ""}</span>
                        {situacao !== "ativo" && <span className="italic" data-resposta-situacao-formulario={situacao}>· {textoSituacaoFormulario(situacao)}</span>}
                      </p>
                      {(r.paciente_id || r.importada_em) && (
                        <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {r.paciente_id && (
                            <Link to={linkAluno(r.paciente_id)} className="inline-flex" data-resposta-aluno-nome={nomeAluno}>
                              <Chip tom="t" icone={UserCheck} className="h-[22px] text-[10.5px]">ALUNO · {(nomeAluno || "fora da sua lista").toUpperCase()}</Chip>
                            </Link>
                          )}
                          {r.importada_em && (linkImp ? (
                            <Link to={linkImp} className="inline-flex" data-link-importada>
                              <Chip tom="n" icone={Download} className="h-[22px] text-[10.5px]">{textoImportada(r).toUpperCase()}</Chip>
                            </Link>
                          ) : (
                            <Chip tom="n" icone={Download} className="h-[22px] text-[10.5px]" data-resposta-importada-texto>{textoImportada(r).toUpperCase()}</Chip>
                          ))}
                        </p>
                      )}
                    </div>
                    <span className="flex flex-none flex-wrap items-center gap-1.5">
                      <button type="button" className={BTN_MINI} onClick={() => setAbertos((a) => ({ ...a, [r.id]: !a[r.id] }))} aria-expanded={aberto} data-btn-ver-resposta>
                        {aberto ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />} {aberto ? "Fechar" : "Ver"}
                      </button>
                      {!r.importada_em && (
                        <button type="button" className={cn(BTN_MINI, nova && "border-violeta/40 text-violeta-3 hover:text-violeta-2")} onClick={() => setLigando(r)} disabled={ocupado === r.id}
                          data-btn-ligar-resposta>
                          <UserPlus aria-hidden /> {r.paciente_id ? "Trocar aluno" : "Ligar a um aluno"}
                        </button>
                      )}
                      {ctx.souNutri && !r.importada_em && (
                        <button type="button" className={BTN_MINI} onClick={() => setParaImportar(r)} disabled={!!motivo || ocupado === r.id} title={motivo ?? "Levar para o prontuário do aluno"}
                          data-btn-importar-resposta data-motivo-sem-importar={motivo ?? ""}>
                          <Download aria-hidden /> Importar
                        </button>
                      )}
                      {podeDesligar(r) && <Acao icone={Unlink} rotulo="Desligar o aluno" onClick={() => void desligar(r)} marca="data-btn-desligar-resposta" desabilitado={ocupado === r.id} />}
                      <Acao icone={Trash2} rotulo="Excluir" perigo onClick={() => setParaExcluir(r)} marca="data-btn-excluir-resposta" desabilitado={ocupado === r.id} />
                    </span>
                  </div>
                  {aberto && <RespostaDetalhe resposta={r} />}
                </div>
              );
            })}
          </div>
        )}
        {!q.isError && <Paginacao nome="respostas" pagina={pagina} total={total} aoMudar={irPara} carregando={q.isFetching} />}
      </Cartao>

      <LigarAlunoDialog open={!!ligando} onOpenChange={(a) => { if (!a) setLigando(null); }} resposta={ligando} contaId={ctx.contaId}
        onLigada={() => { void d.recarregar("tudo"); }} />

      <AlertDialog open={!!paraImportar} onOpenChange={(aberto) => { if (!aberto) setParaImportar(null); }}>
        <AlertDialogContent className={JANELA} data-modal-importar>
          <AlertDialogHeader>
            <AlertDialogTitle className={TITULO_JANELA}>Importar para o prontuário?</AlertDialogTitle>
            <AlertDialogDescription className={DESCRICAO_JANELA} data-texto-importar>
              {paraImportar ? textoConfirmarImportar(paraImportar, nomeParaImportar) : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={BTN_SEC}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className={BTN_PRI} onClick={(e) => { e.preventDefault(); void importar(); }} disabled={!!paraImportar && ocupado === paraImportar.id} data-btn-confirmar-importar>
              <Download aria-hidden /> {paraImportar && ocupado === paraImportar.id ? "Importando…" : "Importar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!paraExcluir} onOpenChange={(aberto) => { if (!aberto) setParaExcluir(null); }}>
        <AlertDialogContent className={JANELA}>
          <AlertDialogHeader>
            <AlertDialogTitle className={TITULO_JANELA}>Excluir esta resposta?</AlertDialogTitle>
            <AlertDialogDescription className={DESCRICAO_JANELA}>
              A resposta de <span className="text-texto">{paraExcluir?.nome}</span> ({paraExcluir?.titulo}) vai para a lixeira.
              {paraExcluir?.importada_em ? " O que já foi importado para o aluno continua lá." : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={BTN_SEC}>Cancelar</AlertDialogCancel>
            <AlertDialogAction className={BTN_PERIGO} onClick={(e) => { e.preventDefault(); void excluir(); }} disabled={!!paraExcluir && ocupado === paraExcluir.id}
              data-btn-confirmar-excluir-resposta>
              {paraExcluir && ocupado === paraExcluir.id ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
