import { useEffect, useMemo, useState, type ReactNode, type SelectHTMLAttributes } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, FileDown, Inbox, Search, Share2, TriangleAlert, UserPlus, Users, X } from "lucide-react";
import { toast } from "sonner";
import { useConta } from "@/nucleo/conta";
import { ehLoja } from "@/lib/distribuicao";
import { mensagemLimite } from "@/nucleo/cobranca/regras";
import { TopoPagina } from "@/ui/casca/topo";
import { Botao } from "@/ui/premium/Botao";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoCarregando, EstadoErro, EstadoVazio } from "@/ui/premium/Estados";
import { TEXTO_CONVITE_ALUNO } from "@/painel/configuracoes/equipe/regras";
import { atribuirAlunos, ErroAlunos, listarAlunos, paginaDaExportacao } from "@/painel/alunos/api";
import { LinhaAluno } from "@/painel/alunos/Linha";
import { NovoAluno } from "@/painel/alunos/NovoAluno";
import { useMeuLink } from "@/painel/alunos/meuLink";
import { NovosPorMes } from "@/painel/alunos/NovosPorMes";
import { Pendentes } from "@/painel/alunos/Pendentes";
import {
  FILTROS_PADRAO,
  GENEROS,
  ORDENS,
  PERIODOS_FILTRO,
  SITUACOES,
  TAMANHO_PAGINA,
  comPeriodo,
  exportarTodos,
  filtrosAtivos,
  limiteAtingido,
  mensagemErroAlunos,
  montarCSV,
  nomeDoCSV,
  textoExportacao,
  textoVagas,
  type FiltrosAlunos,
  type GeneroFiltro,
  type ListaAlunos,
  type ModuloAluno,
  type OrdemAlunos,
  type PeriodoFiltro,
  type SituacaoFiltro,
} from "@/painel/alunos/regras";

function Filtro({ rotulo, children, largo, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { rotulo: string; children: ReactNode; largo?: boolean }) {
  return (
    <label className={`flex min-w-[112px] flex-1 flex-col gap-1 sm:flex-none ${largo ? "sm:w-[168px]" : "sm:w-[116px]"}`}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-texto-4">{rotulo}</span>
      <select
        className="h-10 rounded-xl border border-linha-2 bg-superficie px-3 text-[13.5px] text-texto outline-none focus:border-violeta/60 [&>option]:bg-tela [&>option]:text-texto"
        {...props}
      >
        {children}
      </select>
    </label>
  );
}

const DATA = "h-10 rounded-xl border border-linha-2 bg-superficie px-2.5 text-[13px] text-texto outline-none focus:border-violeta/60";

/** H4 (N-10): o período de cadastro ou de modificação (os do Nutri) + as 2 datas quando é "Personalizar data". */
function FiltroPeriodo({ campo, rotulo, filtros, aoMudar }: {
  campo: "cadastro" | "modificacao";
  rotulo: string;
  filtros: FiltrosAlunos;
  aoMudar: (f: FiltrosAlunos) => void;
}) {
  const de = campo === "cadastro" ? filtros.cadastroDe : filtros.modificacaoDe;
  const ate = campo === "cadastro" ? filtros.cadastroAte : filtros.modificacaoAte;
  return (
    <div className="flex flex-wrap items-end gap-2" data-filtro-periodo={campo}>
      <Filtro largo rotulo={rotulo} value={filtros[campo]} onChange={(e) => aoMudar(comPeriodo(filtros, campo, e.target.value as PeriodoFiltro))}
        data-filtro-periodo-valor={campo}>
        {PERIODOS_FILTRO.map((x) => <option key={x.valor} value={x.valor}>{x.rotulo}</option>)}
      </Filtro>
      {filtros[campo] === "custom" && (
        <span className="flex items-center gap-1.5">
          <input type="date" aria-label={`${rotulo}: de`} value={de} max={ate || undefined} className={DATA}
            onChange={(e) => aoMudar({ ...filtros, [`${campo}De`]: e.target.value })} data-filtro-de={campo} />
          <span className="text-[11.5px] text-texto-3">até</span>
          <input type="date" aria-label={`${rotulo}: até`} value={ate} min={de || undefined} className={DATA}
            onChange={(e) => aoMudar({ ...filtros, [`${campo}Ate`]: e.target.value })} data-filtro-ate={campo} />
        </span>
      )}
    </div>
  );
}

function baixar(nome: string, conteudo: string) {
  const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function filtrosDaUrl(sp: URLSearchParams): FiltrosAlunos {
  const sit = sp.get("situacao") as SituacaoFiltro | null;
  return {
    ...FILTROS_PADRAO,
    situacao: sit && SITUACOES.some((s) => s.valor === sit) ? sit : FILTROS_PADRAO.situacao,
    responsavel: sp.get("responsavel") ?? "",
  };
}

/**
 * Painel › Alunos (W13 — spec 4.4, telas 6 e 7): a lista da conta ativa (20 com "Ver mais"), busca, filtros de situação, módulo,
 * responsável, tag e pagamento, selos, exportar CSV, Pendentes do link /c/, Novo aluno (cadastrar, convidar, link e código) e o
 * menu ⋮ de cada aluno (abrir, PDF, bloquear acesso, desativar, remover). O número do menu = o total desta lista no filtro
 * padrão "Ativos" (lição da W10: número = tela).
 */
export default function Alunos() {
  const { conta } = useConta();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const [filtros, setFiltros] = useState<FiltrosAlunos>(() => filtrosDaUrl(sp));
  const [busca, setBusca] = useState("");
  const [paginas, setPaginas] = useState(1);
  const [novoAberto, setNovoAberto] = useState(sp.get("novo") === "1");
  const [pendentesAbertos, setPendentesAbertos] = useState(sp.get("pendentes") === "1");
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [exportando, setExportando] = useState(false);
  const meuLink = useMeuLink();

  // busca com espera (300 ms), como a lista antiga
  useEffect(() => {
    const t = setTimeout(() => setFiltros((f) => (f.q === busca.trim() ? f : { ...f, q: busca.trim() })), 300);
    return () => clearTimeout(t);
  }, [busca]);
  useEffect(() => {
    setPaginas(1);
    setSelecionados([]);
  }, [filtros, conta?.id]);
  // a situação e o responsável ficam no endereço (o aviso do sino e o "sem responsável" abrem direto)
  useEffect(() => {
    const novo = new URLSearchParams(sp);
    if (filtros.situacao !== "ativos") novo.set("situacao", filtros.situacao); else novo.delete("situacao");
    if (filtros.responsavel) novo.set("responsavel", filtros.responsavel); else novo.delete("responsavel");
    novo.delete("novo");
    novo.delete("pendentes");
    if (novo.toString() !== sp.toString()) setSp(novo, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só os filtros mudam o endereço
  }, [filtros.situacao, filtros.responsavel]);

  const q = useQuery({
    queryKey: ["alunos", conta?.id, filtros, paginas],
    queryFn: () => listarAlunos(conta!.id, filtros, 0, TAMANHO_PAGINA * paginas),
    enabled: Boolean(conta?.id),
    placeholderData: keepPreviousData,
    staleTime: 20_000,
    retry: 1,
  });
  const lista = q.data ?? null;

  const recarregar = () => {
    void qc.invalidateQueries({ queryKey: ["alunos"] });
    void qc.invalidateQueries({ queryKey: ["alunos-contador"] });
  };

  // N-66: TODOS os alunos do filtro (páginas de 500 em sequência), com as colunas do Nutri; se algum ficar de fora, a tela avisa
  const exportar = async () => {
    const contaId = conta?.id;
    if (!contaId) return;
    setExportando(true);
    try {
      const e = await exportarTodos((offset, limite) => paginaDaExportacao(contaId, filtros, offset, limite));
      if (!e.itens.length) {
        toast.info("Nenhum aluno para exportar com esses filtros.");
        return;
      }
      baixar(nomeDoCSV(), montarCSV(e.itens));
      if (e.completo) toast.success(textoExportacao(e));
      else toast.warning(textoExportacao(e), { duration: 12_000 });
    } catch (e) {
      toast.error(mensagemErroAlunos(e instanceof ErroAlunos ? e.codigo : null));
    } finally {
      setExportando(false);
    }
  };

  const compartilhar = async () => {
    const link = meuLink.link;
    if (!link) return toast.error("Não deu para carregar o seu link agora.");
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Physiq", text: TEXTO_CONVITE_ALUNO, url: link });
        return;
      } catch (e) {
        if ((e as { name?: string } | null)?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copiado! Cole no WhatsApp do aluno.");
    } catch {
      toast.error("Não foi possível copiar. Abra Novo aluno › Link e código.");
    }
  };

  const topo = (
    <TopoPagina
      titulo="Alunos"
      // número = tela (lição da W10): o uso das vagas é o total desta lista só para o dono (ele vê todos os alunos da conta)
      subtitulo={lista ? (lista.eu.dono ? `${lista.conta.nome} · ${textoVagas(lista.vagas)}` : `${lista.conta.nome} · alunos que você acompanha`) : conta?.nome}
      acoes={<Botao variante="w" icone={UserPlus} onClick={() => setNovoAberto(true)} data-novo-aluno-abrir>Novo aluno</Botao>}
    />
  );

  if (!conta) {
    return (
      <div data-pagina-alunos data-estado="sem-conta">
        <EstadoVazio icone={Users} titulo="Nenhuma conta ativa" texto="Os seus alunos aparecem aqui quando você faz parte de uma conta de profissional." />
      </div>
    );
  }
  if (q.isLoading && !lista) {
    return (
      <div data-pagina-alunos data-estado="carregando">
        {topo}
        <EstadoCarregando linhas={4} rotulo="Carregando os alunos" />
      </div>
    );
  }
  if (!lista) {
    const cod = q.error instanceof ErroAlunos ? q.error.codigo : null;
    return (
      <div data-pagina-alunos data-estado="erro">
        {topo}
        <EstadoErro titulo="Não deu para carregar os alunos" texto={mensagemErroAlunos(cod)} aoTentar={() => void q.refetch()} />
      </div>
    );
  }
  return (
    <div data-pagina-alunos data-total-alunos={lista.total} data-situacao={filtros.situacao} className="flex flex-col gap-3.5">
      {topo}
      <Avisos lista={lista} aoVerBloqueados={() => setFiltros((f) => ({ ...f, situacao: "bloqueados" }))} aoPlano={() => navigate("/painel/configuracoes/plano")} />
      {/* W25 (N-9): "Novos alunos por mês" — o "+N este mês" do Dashboard é a barra do mês atual daqui */}
      <NovosPorMes contaId={lista.conta.id} dono={lista.eu.dono} />
      <Cartao className="p-4" data-filtros-alunos>
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="relative flex min-w-[220px] flex-1 items-center">
            <Search aria-hidden className="pointer-events-none absolute left-3.5 h-4 w-4 text-texto-3" />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, e-mail, telefone ou tag"
              className="h-11 w-full rounded-[14px] border border-linha-2 bg-superficie pl-10 pr-3 text-[14px] text-texto outline-none placeholder:text-texto-4 focus:border-violeta/60"
              data-busca-alunos
            />
          </label>
          <Botao icone={Inbox} onClick={() => setPendentesAbertos(true)} data-abrir-pendentes={lista.pendentes}>
            Pendentes
            {lista.pendentes > 0 && <span className="ml-0.5 rounded-full bg-violeta px-1.5 text-[11px] font-bold text-white" data-pendentes-contador>{lista.pendentes}</span>}
          </Botao>
          <Botao icone={Share2} onClick={() => void compartilhar()} data-compartilhar-link>Compartilhar link</Botao>
          <Botao icone={FileDown} onClick={() => void exportar()} disabled={exportando} data-exportar-csv>{exportando ? "Exportando…" : "Exportar CSV"}</Botao>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-texto-4">Situação</span>
            <div role="radiogroup" aria-label="Situação" className="inline-flex flex-wrap rounded-xl border border-linha bg-superficie p-[3px]" data-situacoes>
              {SITUACOES.map((s) => {
                const ativo = filtros.situacao === s.valor;
                const n = lista.contagens[s.valor] ?? 0;
                if (s.valor === "excluidas" && n === 0 && !ativo) return null;
                return (
                  <button
                    key={s.valor}
                    type="button"
                    role="radio"
                    aria-checked={ativo}
                    onClick={() => setFiltros((f) => ({ ...f, situacao: s.valor }))}
                    data-situacao-filtro={s.valor}
                    data-contagem={n}
                    className={`rounded-[9px] px-[11px] py-1.5 text-xs font-semibold transition-colors ${ativo ? "text-[var(--p-botao-w-texto)]" : "text-texto-2 hover:text-texto"}`}
                    style={ativo ? { background: "var(--p-botao-w-fundo)" } : undefined}
                  >
                    {s.rotulo} <span className={ativo ? "opacity-70" : "text-texto-4"}>{n}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {lista.conta.modulos.length > 1 && (
            <Filtro rotulo="Módulo" value={filtros.modulo} onChange={(e) => setFiltros((f) => ({ ...f, modulo: e.target.value as "" | ModuloAluno }))} data-filtro-modulo>
              <option value="">Todos</option>
              <option value="treino">Treino</option>
              <option value="nutricao">Nutrição</option>
            </Filtro>
          )}
          {(lista.eu.dono || lista.responsaveis.length > 1) && (
            <Filtro largo rotulo="Responsável" value={filtros.responsavel} onChange={(e) => setFiltros((f) => ({ ...f, responsavel: e.target.value }))} data-filtro-responsavel>
              <option value="">Todos</option>
              {lista.responsaveis.map((r) => <option key={r.id} value={r.id}>{r.nome}{r.eu ? " (você)" : ""}</option>)}
              {lista.eu.dono && <option value="sem">Sem responsável</option>}
            </Filtro>
          )}
          {lista.tags.length > 0 && (
            <Filtro rotulo="Tag" value={filtros.tag} onChange={(e) => setFiltros((f) => ({ ...f, tag: e.target.value }))} data-filtro-tag>
              <option value="">Todas</option>
              {lista.tags.map((t) => <option key={t} value={t}>{t}</option>)}
            </Filtro>
          )}
          {lista.eu.dono && (
            <Filtro rotulo="Pagamento" value={filtros.pagamento} onChange={(e) => setFiltros((f) => ({ ...f, pagamento: e.target.value as FiltrosAlunos["pagamento"] }))} data-filtro-pagamento>
              <option value="">Todos</option>
              <option value="pago">Pago</option>
              <option value="pendente">Pendente</option>
              <option value="comprovante">Comprovante para conferir</option>
            </Filtro>
          )}
          {/* H4 (N-10): os filtros do Nutri — gênero, cadastro e modificação — e a ordem da lista */}
          <Filtro rotulo="Gênero" value={filtros.genero} onChange={(e) => setFiltros((f) => ({ ...f, genero: e.target.value as GeneroFiltro }))} data-filtro-genero>
            <option value="">Todos</option>
            {GENEROS.map((g) => <option key={g.valor} value={g.valor}>{g.rotulo}</option>)}
          </Filtro>
          <FiltroPeriodo campo="cadastro" rotulo="Cadastro" filtros={filtros} aoMudar={setFiltros} />
          <FiltroPeriodo campo="modificacao" rotulo="Modificação" filtros={filtros} aoMudar={setFiltros} />
          <Filtro largo rotulo="Ordenar por" value={filtros.ordem} onChange={(e) => setFiltros((f) => ({ ...f, ordem: e.target.value as OrdemAlunos }))} data-filtro-ordem>
            {ORDENS.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
          </Filtro>
          {/* a situação tem os próprios chips: "Limpar" só aparece com busca ou seletor ligado */}
          {(filtrosAtivos({ ...filtros, situacao: "ativos" }) || filtros.ordem !== FILTROS_PADRAO.ordem) && (
            <Botao tamanho="sm" icone={X} onClick={() => { setBusca(""); setFiltros(FILTROS_PADRAO); }} data-limpar-filtros>Limpar</Botao>
          )}
        </div>
      </Cartao>

      <Cartao className="px-4 pb-2 pt-4" data-lista-alunos>
        <CabecalhoCartao
          titulo={`${lista.total} ${lista.total === 1 ? "aluno" : "alunos"}`}
          extra={<Chip tom="g" data-situacao-atual>{(SITUACOES.find((s) => s.valor === filtros.situacao)?.rotulo ?? "").toUpperCase()}</Chip>}
          acao={q.isFetching ? <span className="text-[12px] text-texto-3">Atualizando…</span> : null}
        />
        {filtros.responsavel === "sem" && lista.eu.dono && lista.itens.length > 0 && (
          <Atribuir lista={lista} selecionados={selecionados} setSelecionados={setSelecionados} aoFeito={() => { setSelecionados([]); recarregar(); }} />
        )}
        {lista.itens.length === 0 ? (
          filtrosAtivos(filtros) ? (
            <EstadoVazio icone={Search} titulo="Nenhum aluno com esses filtros" texto="Mude a busca ou os filtros."
              acao={<Botao onClick={() => { setBusca(""); setFiltros(FILTROS_PADRAO); }}>Limpar filtros</Botao>} className="my-6" />
          ) : (
            <EstadoVazio icone={Users} titulo="Nenhum aluno ainda" texto="Cadastre, convide por e-mail ou mande o seu link: o aluno entra e já aparece aqui."
              acao={<Botao variante="w" icone={UserPlus} onClick={() => setNovoAberto(true)}>Novo aluno</Botao>} className="my-6" />
          )
        ) : (
          <div data-linhas-alunos={lista.itens.length}>
            {lista.itens.map((a) => (
              <LinhaAluno
                key={a.id}
                aluno={a}
                eu={lista.eu}
                aoMudar={recarregar}
                selecionavel={filtros.responsavel === "sem" && lista.eu.dono}
                selecionado={selecionados.includes(a.id)}
                aoSelecionar={(sim) => setSelecionados((s) => (sim ? [...s, a.id] : s.filter((x) => x !== a.id)))}
              />
            ))}
          </div>
        )}
        {lista.itens.length < lista.total && (
          <div className="flex items-center justify-center gap-3 border-t border-linha-3 py-3">
            <span className="text-[12.5px] text-texto-3" data-mostrando>Mostrando {lista.itens.length} de {lista.total}</span>
            <Botao tamanho="sm" onClick={() => setPaginas((p) => p + 1)} disabled={q.isFetching} data-ver-mais>Ver mais</Botao>
          </div>
        )}
      </Cartao>

      <NovoAluno aberto={novoAberto} aoMudar={setNovoAberto} lista={lista} aoMudou={recarregar} />
      <Pendentes aberto={pendentesAbertos} aoMudar={setPendentesAbertos} lista={lista} aoMudou={recarregar} />
    </div>
  );
}

/** Faixas do topo: o limite do plano (C96) e os alunos com acesso bloqueado (fora do filtro padrão — P14/R10). */
function Avisos({ lista, aoVerBloqueados, aoPlano }: { lista: ListaAlunos; aoVerBloqueados: () => void; aoPlano: () => void }) {
  const cheio = limiteAtingido(lista.vagas);
  const bloqueados = lista.contagens.bloqueados ?? 0;
  if (!cheio && !bloqueados) return null;
  return (
    <div className="flex flex-col gap-2">
      {cheio && lista.vagas.limite !== null && (
        <div className="flex flex-wrap items-center gap-3 rounded-[18px] border border-ambar/35 px-4 py-3 text-[13px] text-texto"
          style={{ background: "linear-gradient(90deg, var(--p-chip-a-fundo), transparent)" }} data-aviso-limite>
          <TriangleAlert aria-hidden className="h-4 w-4 flex-none text-ambar-3" />
          <span className="min-w-0 flex-1">
            {mensagemLimite(lista.vagas.limite, lista.eu.dono, lista.conta.dono_nome)}
            {lista.eu.dono ? ` (${lista.vagas.em_uso} de ${lista.vagas.limite} em uso)` : ""}
          </span>
          {/* W1 da loja: na versão da Google Play, sem "Ver planos" (o profissional paga pelo site) */}
          {lista.eu.dono && !ehLoja && <Botao tamanho="sm" onClick={aoPlano} data-aviso-limite-plano>Ver planos</Botao>}
        </div>
      )}
      {bloqueados > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-[18px] border border-linha px-4 py-3 text-[13px] text-texto-2" data-aviso-bloqueados={bloqueados}>
          <Ban aria-hidden className="h-4 w-4 flex-none text-rosa-3" />
          <span className="min-w-0 flex-1">
            {bloqueados === 1 ? "1 aluno está" : `${bloqueados} alunos estão`} com o acesso bloqueado: o app fica fechado e a vaga do plano, livre.
          </span>
          <Botao tamanho="sm" onClick={aoVerBloqueados} data-ver-bloqueados>Ver</Botao>
        </div>
      )}
    </div>
  );
}

/** Atribuir em lote (herdado da W5): os alunos que ficaram sem responsável passam para um profissional da equipe. */
function Atribuir({ lista, selecionados, setSelecionados, aoFeito }: {
  lista: ListaAlunos;
  selecionados: string[];
  setSelecionados: (ids: string[]) => void;
  aoFeito: () => void;
}) {
  const modulos = lista.conta.modulos;
  const [modulo, setModulo] = useState<ModuloAluno>(modulos[0] ?? "treino");
  const candidatos = useMemo(() => lista.responsaveis.filter((r) => r.papeis.includes(modulo === "treino" ? "personal" : "nutricionista")), [lista.responsaveis, modulo]);
  const [resp, setResp] = useState("");
  const [indo, setIndo] = useState(false);
  useEffect(() => {
    if (!candidatos.some((c) => c.id === resp)) setResp(candidatos[0]?.id ?? "");
  }, [candidatos, resp]);
  const todos = lista.itens.map((a) => a.id);
  const ir = async () => {
    if (!selecionados.length || !resp) return;
    setIndo(true);
    try {
      const r = await atribuirAlunos(lista.conta.id, selecionados, modulo, resp);
      toast.success(`${r.atualizados} ${r.atualizados === 1 ? "aluno passou" : "alunos passaram"} para ${candidatos.find((c) => c.id === resp)?.nome ?? "o profissional"}.`);
      aoFeito();
    } catch (e) {
      toast.error(mensagemErroAlunos(e instanceof ErroAlunos ? e.codigo : null));
    } finally {
      setIndo(false);
    }
  };
  return (
    <div className="mb-2 flex flex-wrap items-end gap-2.5 rounded-2xl border border-linha bg-superficie px-3.5 py-3" data-atribuir-lote>
      <div className="flex min-w-[140px] flex-col gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-texto-4">Selecionados</span>
        <span className="text-[14px] font-semibold text-texto" data-atribuir-quantos={selecionados.length}>
          {selecionados.length} de {lista.itens.length}{" "}
          <button type="button" className="ml-1 text-[12px] font-medium text-violeta-3" onClick={() => setSelecionados(selecionados.length === todos.length ? [] : todos)} data-atribuir-todos>
            {selecionados.length === todos.length ? "limpar" : "todos"}
          </button>
        </span>
      </div>
      {modulos.length > 1 && (
        <Filtro rotulo="Módulo" value={modulo} onChange={(e) => setModulo(e.target.value as ModuloAluno)} data-atribuir-modulo>
          {modulos.map((m) => <option key={m} value={m}>{m === "treino" ? "Treino" : "Nutrição"}</option>)}
        </Filtro>
      )}
      <Filtro largo rotulo="Atribuir a" value={resp} onChange={(e) => setResp(e.target.value)} data-atribuir-responsavel>
        {candidatos.map((r) => <option key={r.id} value={r.id}>{r.nome}{r.eu ? " (você)" : ""}</option>)}
      </Filtro>
      <Botao variante="w" onClick={() => void ir()} disabled={indo || !selecionados.length || !resp} data-atribuir-confirmar>
        {indo ? "Atribuindo…" : "Atribuir"}
      </Botao>
    </div>
  );
}
