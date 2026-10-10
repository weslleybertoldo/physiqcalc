import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, ChevronRight, Dumbbell, FolderClosed, FolderPlus, Lock, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Botao, BotaoIcone } from "@/ui/premium/Botao";
import { Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { Esqueleto, EstadoErro, EstadoVazio } from "@/ui/premium/Estados";
import { Paginacao } from "@/ui/premium/Paginacao";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { usePaginaNaUrl } from "@/ui/casca/usePaginaNaUrl";
import { colocarNaPasta, criarModelo, criarPasta, excluirModelo, excluirPasta, listarExercicios, renomearModelo, renomearPasta } from "./api";
import { DetalheModelo } from "./DetalheModelo";
import { FolhaNome } from "./pecas";
import { QuemRecebe } from "./QuemRecebe";
import { donoAoCriar, podeCriar, textoAlunos, textoExercicios } from "./regras";
import type { FiltrosModelos, ModeloTela, PastaTela, QuemMexe } from "./tipos";
import { CHAVE_EXERCICIOS, mensagemDoErro, usePastas, useRecarregar, useTermoComEspera, useTreinosDaTela } from "./useTreinos";

type Folha = null | { tipo: "novo-treino" } | { tipo: "nova-pasta" } | { tipo: "renomear-treino"; m: ModeloTela } | { tipo: "renomear-pasta"; p: PastaTela } | { tipo: "pastas"; m: ModeloTela };

/**
 * Painel › Treinos › Meus treinos (C42): as pastas e os treinos-modelo (os do profissional + os globais do master, só leitura),
 * cada treino no padrão da tela 8 (exercícios com GIF e a prescrição do modelo) e "Quem recebe". Estado na URL: ?pasta=&treino=
 * (os links antigos do /admin/treinos chegam com ?t=grupos&pasta=).
 * hml-14d (B21 · D23): a lista de treinos vem do banco em páginas de 20 ("1–20 de N", `?pagina=`), com a busca (nome do treino ou de
 * um exercício dele, sem acento, 300 ms) e a pasta no banco; os detalhes (exercícios, pastas, quem recebe) só dos treinos da página;
 * o `?treino=` fora da página abre pelo id; as pastas vêm inteiras, com o número de treinos de cada uma vindo do banco.
 */
export function MeusTreinos({
  q,
  params,
  setParams,
  pedidoNovo,
  aoAtenderPedido,
}: {
  q: QuemMexe;
  params: URLSearchParams;
  setParams: (p: URLSearchParams, o?: { replace?: boolean }) => void;
  /** o botão principal do topo ("Novo treino") */
  pedidoNovo: boolean;
  aoAtenderPedido: () => void;
}) {
  const recarregar = useRecarregar();
  const [busca, setBusca] = useState("");
  const termo = useTermoComEspera(busca);
  const [folha, setFolha] = useState<Folha>(null);
  const pastaId = params.get("pasta");
  const treinoId = params.get("treino");
  // a pasta do endereço vale enquanto as pastas carregam e, depois, só se existir (outra = a lista inteira, como antes)
  const pastasQ = usePastas(q);
  const pastaDoFiltro = pastaId && (!pastasQ.data || pastasQ.data.some((p) => p.id === pastaId)) ? pastaId : null;
  const filtros: FiltrosModelos = useMemo(() => ({ q: termo, pasta: pastaDoFiltro }), [termo, pastaDoFiltro]);
  const [totalLido, setTotalLido] = useState<number | null>(null);
  const { pagina, irPara: irParaPagina } = usePaginaNaUrl({ filtro: filtros, total: totalLido });
  const t = useTreinosDaTela(q, filtros, pagina, treinoId);
  const totalDaResposta = t.pagina.data && !t.pagina.isPlaceholderData ? t.pagina.data.total : null;
  useEffect(() => {
    if (totalDaResposta !== null) setTotalLido(totalDaResposta);
  }, [totalDaResposta]);
  const pasta = t.pastas.find((p) => p.id === pastaId) ?? null;
  const lista = t.modelos;
  const abrindoPeloId = !!treinoId && !t.todos.some((m) => m.id === treinoId) && t.abertoQ.isFetching;
  const aberto = t.todos.find((m) => m.id === treinoId) ?? lista[0] ?? null;
  const pastasEditaveis = t.pastas.filter((p) => p.editavel);
  const criar = podeCriar(q);
  // "Adicionar exercício da biblioteca (N com GIF)": a contagem do banco (globais + meus com GIF)
  const resumoBiblioteca = useQuery({
    queryKey: [CHAVE_EXERCICIOS, q.meuId, "resumo"],
    queryFn: () => listarExercicios({ escopo: "visiveis" }, 1, 1),
    staleTime: 5 * 60_000,
    networkMode: "online",
  });
  // hml-17 (H-39): a contagem falhou → null (o botão mostra "— com GIF", nunca "0 com GIF")
  const comGif = resumoBiblioteca.isError && !resumoBiblioteca.data ? null : resumoBiblioteca.data?.comGif ?? 0;

  useEffect(() => {
    if (pedidoNovo) {
      setFolha(criar ? { tipo: "novo-treino" } : null);
      aoAtenderPedido();
    }
  }, [pedidoNovo, criar, aoAtenderPedido]);

  const irPara = (mudar: Record<string, string | null>, replace = false) => {
    const n = new URLSearchParams(params);
    n.set("aba", "treinos");
    n.delete("t");
    for (const [k, v] of Object.entries(mudar)) {
      if (v === null) n.delete(k);
      else n.set(k, v);
    }
    setParams(n, { replace });
  };
  const erro = (e: unknown) => toast.error(mensagemDoErro(e));

  if (t.pagina.isLoading) {
    return (
      <div className="grid gap-3.5 xl:grid-cols-[320px_minmax(0,1fr)]" data-meus-treinos="carregando">
        <Cartao className="flex flex-col gap-2 p-4">{[0, 1, 2, 3, 4].map((i) => <Esqueleto key={i} className="h-12 w-full" />)}</Cartao>
        <Cartao className="flex flex-col gap-3 p-5"><Esqueleto className="h-8 w-1/2" />{[0, 1, 2, 3].map((i) => <Esqueleto key={i} className="h-14 w-full" />)}</Cartao>
      </div>
    );
  }
  if (t.pagina.error || t.pastasQ.error || !t.pagina.data) {
    return (
      <EstadoErro
        titulo="Não deu para abrir os treinos"
        texto={mensagemDoErro(t.pagina.error ?? t.pastasQ.error)}
        aoTentar={() => {
          void t.pagina.refetch();
          void t.pastasQ.refetch();
        }}
      />
    );
  }

  const novoTreino = async (nome: string, naPasta: boolean) => {
    try {
      const id = await criarModelo(nome, donoAoCriar(q));
      if (naPasta && pasta?.editavel) await colocarNaPasta(pasta.id, id, true);
      await recarregar.catalogo();
      setFolha(null);
      irPara({ treino: id });
      toast.success(`Treino "${nome}" criado. Adicione os exercícios da biblioteca.`);
    } catch (e) {
      erro(e);
    }
  };
  const novaPasta = async (nome: string) => {
    try {
      const id = await criarPasta(nome, donoAoCriar(q));
      await recarregar.catalogo();
      setFolha(null);
      irPara({ pasta: id, treino: null });
      toast.success(`Pasta "${nome}" criada.`);
    } catch (e) {
      erro(e);
    }
  };
  const excluirTreino = async (m: ModeloTela) => {
    const aviso = m.alunos > 0
      ? `\n\n${textoAlunos(m.alunos)} ${m.alunos === 1 ? "recebe" : "recebem"} este treino: ele sai do app ${m.alunos === 1 ? "dele" : "deles"} e os dias da semana com ele ficam sem treino.`
      : "";
    if (!window.confirm(`Excluir o treino "${m.nome}"?${aviso}`)) return;
    try {
      await excluirModelo(m.id);
      await recarregar.tudo();
      irPara({ treino: null }, true);
      toast.success("Treino excluído.");
    } catch (e) {
      erro(e);
    }
  };
  const excluirPastaAberta = async (p: PastaTela) => {
    if (!window.confirm(`Excluir a pasta "${p.nome}"? Os treinos dela NÃO são excluídos — voltam para a lista.`)) return;
    try {
      await excluirPasta(p.id);
      await recarregar.catalogo();
      irPara({ pasta: null }, true);
      toast.success("Pasta excluída — treinos preservados.");
    } catch (e) {
      erro(e);
    }
  };

  // pasta aberta: os treinos dela (a página) viram as abas
  const abas = pasta ? lista : aberto ? [aberto] : [];
  const linhasAberto = t.linhas.filter((l) => l.grupo_id === aberto?.id);
  const nomeDaPasta = (id: string) => t.pastas.find((p) => p.id === id)?.nome ?? "";
  const buscando = !!(termo || busca.trim());

  return (
    <div className="grid items-start gap-3.5 xl:grid-cols-[320px_minmax(0,1fr)]" data-meus-treinos={t.totalGeral}>
      {/* ── esquerda: pastas e treinos ── */}
      <Cartao className="flex min-w-0 flex-col px-3.5 py-3.5" data-lista-modelos>
        <label className="mb-3 flex h-9 items-center gap-2 rounded-xl border border-linha bg-superficie px-3 text-[13px] text-texto-2">
          <Search aria-hidden className="h-4 w-4 text-texto-3" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar treino ou exercício" className="min-w-0 flex-1 bg-transparent text-texto outline-none placeholder:text-texto-3" data-busca-modelos />
        </label>

        {pasta ? (
          <div className="mb-2 flex items-center gap-1.5 rounded-2xl border border-linha bg-superficie px-2 py-2" data-pasta-aberta={pasta.id}>
            <BotaoIcone icone={ArrowLeft} rotulo="Voltar para todas as pastas" onClick={() => irPara({ pasta: null, treino: null })} tamanho={30} data-pasta-voltar />
            <FolderClosed aria-hidden className="h-4 w-4 flex-none text-violeta-3" />
            <b className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-texto">{pasta.nome}</b>
            {pasta.editavel ? (
              <>
                <BotaoIcone icone={Pencil} rotulo="Renomear a pasta" onClick={() => setFolha({ tipo: "renomear-pasta", p: pasta })} tamanho={30} data-pasta-renomear />
                <BotaoIcone icone={Trash2} rotulo="Excluir a pasta (os treinos ficam)" onClick={() => void excluirPastaAberta(pasta)} tamanho={30} data-pasta-excluir />
              </>
            ) : (
              <Chip tom="g" icone={Lock}>GLOBAL</Chip>
            )}
          </div>
        ) : (
          <>
            <div className="mb-1.5 flex items-center gap-2 px-1">
              <span className="pq-eyebrow flex-1">Pastas</span>
              {criar && (
                <button type="button" onClick={() => setFolha({ tipo: "nova-pasta" })} className="flex items-center gap-1 text-[12px] font-semibold text-violeta-3 hover:text-violeta-2" data-nova-pasta>
                  <FolderPlus aria-hidden className="h-3.5 w-3.5" /> Nova pasta
                </button>
              )}
            </div>
            {t.pastasQ.isLoading ? (
              <Esqueleto className="mb-2 h-9 w-full" />
            ) : t.pastas.length === 0 ? (
              <p className="mb-2 px-1 text-[12px] text-texto-3" data-sem-pastas>Nenhuma pasta. Pastas juntam os treinos de um programa (ex.: A, B e C).</p>
            ) : (
              <ul className="mb-2 flex flex-col gap-1" data-lista-pastas={t.pastas.length}>
                {t.pastas.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => irPara({ pasta: p.id, treino: null })}
                      className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-[rgba(255,255,255,.04)]" data-pasta={p.id} data-pasta-nome={p.nome}>
                      <FolderClosed aria-hidden className="h-4 w-4 flex-none text-violeta-3" strokeWidth={1.75} />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-texto">{p.nome}</span>
                      {p.global && !p.editavel && <Lock aria-label="Global — só leitura" className="h-3 w-3 flex-none text-texto-3" />}
                      <span className="flex-none text-[11.5px] text-texto-3" data-pasta-total={p.total}>{p.total}</span>
                      <ChevronRight aria-hidden className="h-3.5 w-3.5 flex-none text-texto-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        <div className="mb-1.5 mt-1 flex items-center gap-2 px-1">
          <span className="pq-eyebrow flex-1">{pasta ? "Treinos da pasta" : "Treinos"}</span>
          {criar && (
            <button type="button" onClick={() => setFolha({ tipo: "novo-treino" })} className="flex items-center gap-1 text-[12px] font-semibold text-violeta-3 hover:text-violeta-2" data-novo-treino-lista>
              <Plus aria-hidden className="h-3.5 w-3.5" /> Novo treino
            </button>
          )}
        </div>
        {lista.length === 0 ? (
          <p className="px-1 py-2 text-[12.5px] text-texto-3" data-sem-modelos>
            {buscando ? "Nenhum treino com esse nome ou exercício." : pasta ? "Nenhum treino nesta pasta ainda." : "Nenhum treino ainda."}
          </p>
        ) : (
          <ul className="flex flex-col gap-1" data-lista-treinos={lista.length} data-lista="modelos" data-atualizando={t.pagina.isFetching ? "1" : "0"}>
            {lista.map((m) => {
              const ativo = m.id === aberto?.id;
              return (
                <li key={m.id} data-item>
                  <button type="button" onClick={() => irPara({ treino: m.id })}
                    className={cn("flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors",
                      ativo ? "border-[rgba(167,139,250,.45)] bg-[rgba(139,92,246,.09)]" : "border-transparent hover:bg-[rgba(255,255,255,.04)]")}
                    data-modelo={m.id} data-modelo-item={m.nome} data-modelo-global={m.global ? "1" : "0"} aria-current={ativo || undefined}>
                    <span className={cn("flex h-8 w-8 flex-none items-center justify-center rounded-[10px] border", ativo ? "border-[rgba(167,139,250,.4)] text-violeta-3" : "border-linha text-texto-3")}>
                      <Dumbbell aria-hidden className="h-4 w-4" strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[13px] font-semibold text-texto">{m.nome}</b>
                      <span className="block truncate text-[11.5px] text-texto-3">
                        {textoExercicios(m.exercicios.length)}{t.alunosProntos ? ` · ${textoAlunos(m.alunos).toLowerCase()}` : ""}
                        {!pasta && m.pastas.length ? ` · ${m.pastas.map(nomeDaPasta).filter(Boolean).join(", ")}` : ""}
                      </span>
                    </span>
                    {m.global && !m.editavel && <Lock aria-label="Global — só leitura" className="h-3.5 w-3.5 flex-none text-texto-3" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <Paginacao nome="modelos" pagina={pagina} total={t.total} aoMudar={irParaPagina} carregando={t.pagina.isFetching} className="px-1" />
        {!q.staff && (
          <p className="mt-3 rounded-xl border border-linha bg-superficie px-3 py-2 text-[12px] text-texto-2" data-so-ver>
            Você vê os treinos da conta; quem cria e muda é o personal.
          </p>
        )}
      </Cartao>

      {/* ── direita: o treino aberto e quem recebe ── */}
      <div className="flex min-w-0 flex-col gap-3.5">
        {abrindoPeloId ? (
          <Cartao className="flex flex-col gap-3 p-5" data-modelo-abrindo={treinoId}><Esqueleto className="h-8 w-1/2" />{[0, 1, 2].map((i) => <Esqueleto key={i} className="h-14 w-full" />)}</Cartao>
        ) : aberto ? (
          <>
            <DetalheModelo
              modelo={aberto}
              abas={abas.length ? abas : [aberto]}
              linhas={linhasAberto}
              q={q}
              comGif={comGif}
              alunosProntos={t.alunosProntos}
              aoAbrir={(id) => irPara({ treino: id })}
              aoNovo={criar ? () => setFolha({ tipo: "novo-treino" }) : undefined}
              aoRenomear={() => setFolha({ tipo: "renomear-treino", m: aberto })}
              aoExcluir={() => void excluirTreino(aberto)}
              aoPastas={() => setFolha({ tipo: "pastas", m: aberto })}
            />
            <QuemRecebe modelo={aberto} q={q} />
          </>
        ) : (
          <EstadoVazio
            icone={Dumbbell}
            titulo={pasta ? "Pasta vazia" : "Nenhum treino ainda"}
            texto={criar ? "Crie o primeiro treino e adicione os exercícios da biblioteca (com GIF)." : "Quando o personal criar, os treinos aparecem aqui."}
            acao={criar ? <Botao variante="w" tamanho="sm" icone={Plus} onClick={() => setFolha({ tipo: "novo-treino" })}>Novo treino</Botao> : undefined}
          />
        )}
      </div>

      {/* ── folhas ── */}
      <FolhaNovoTreino aberto={folha?.tipo === "novo-treino"} aoMudar={(a) => !a && setFolha(null)} pasta={pasta?.editavel ? pasta : null} aoSalvar={novoTreino} master={q.master} />
      <FolhaNome
        aberto={folha?.tipo === "nova-pasta"}
        aoMudar={(a) => !a && setFolha(null)}
        titulo="Nova pasta"
        descricao={q.master ? "Pasta do catálogo global (todos os profissionais veem)." : "Junte os treinos de um programa (ex.: Hipertrofia — A, B e C)."}
        rotuloBotao="Criar pasta"
        placeholder="Ex.: Treino mulher"
        aoSalvar={novaPasta}
      />
      <FolhaNome
        aberto={folha?.tipo === "renomear-treino"}
        aoMudar={(a) => !a && setFolha(null)}
        titulo="Renomear o treino"
        inicial={folha?.tipo === "renomear-treino" ? folha.m.nome : ""}
        rotuloBotao="Salvar"
        placeholder="Nome do treino"
        aoSalvar={async (nome) => {
          if (folha?.tipo !== "renomear-treino") return;
          try {
            await renomearModelo(folha.m.id, nome);
            await recarregar.catalogo();
            setFolha(null);
            toast.success("Treino renomeado.");
          } catch (e) {
            erro(e);
          }
        }}
      />
      <FolhaNome
        aberto={folha?.tipo === "renomear-pasta"}
        aoMudar={(a) => !a && setFolha(null)}
        titulo="Renomear a pasta"
        inicial={folha?.tipo === "renomear-pasta" ? folha.p.nome : ""}
        rotuloBotao="Salvar"
        placeholder="Nome da pasta"
        aoSalvar={async (nome) => {
          if (folha?.tipo !== "renomear-pasta") return;
          try {
            await renomearPasta(folha.p.id, nome);
            await recarregar.catalogo();
            setFolha(null);
            toast.success("Pasta renomeada.");
          } catch (e) {
            erro(e);
          }
        }}
      />
      <FolhaPastasDoTreino
        aberto={folha?.tipo === "pastas"}
        aoMudar={(a) => !a && setFolha(null)}
        modelo={folha?.tipo === "pastas" ? (t.todos.find((m) => m.id === folha.m.id) ?? folha.m) : null}
        pastas={t.pastas}
        editaveis={pastasEditaveis}
        aoAlternar={async (p, colocar) => {
          if (folha?.tipo !== "pastas") return;
          try {
            await colocarNaPasta(p.id, folha.m.id, colocar);
            await recarregar.catalogo();
            toast.success(colocar ? `Treino na pasta "${p.nome}".` : `Treino fora da pasta "${p.nome}".`);
          } catch (e) {
            erro(e);
          }
        }}
        aoNovaPasta={criar ? () => setFolha({ tipo: "nova-pasta" }) : undefined}
      />
    </div>
  );
}

function FolhaNovoTreino({
  aberto,
  aoMudar,
  pasta,
  aoSalvar,
  master,
}: {
  aberto: boolean;
  aoMudar: (a: boolean) => void;
  pasta: PastaTela | null;
  aoSalvar: (nome: string, naPasta: boolean) => Promise<void>;
  master: boolean;
}) {
  const [naPasta, setNaPasta] = useState(true);
  useEffect(() => {
    if (aberto) setNaPasta(true);
  }, [aberto]);
  return (
    <FolhaNome
      aberto={aberto}
      aoMudar={aoMudar}
      titulo="Novo treino"
      descricao={master ? "Treino do catálogo global (todos os profissionais podem dar aos alunos)." : "Um treino-modelo seu: depois você adiciona os exercícios e marca quem recebe."}
      rotuloBotao="Criar treino"
      placeholder="Ex.: A · Peito e tríceps"
      aoSalvar={(nome) => aoSalvar(nome, naPasta)}
      extra={
        pasta ? (
          <label className="mt-1 flex items-center gap-2 text-[13px] text-texto-2">
            <input type="checkbox" checked={naPasta} onChange={(e) => setNaPasta(e.target.checked)} className="accent-[#8B5CF6]" data-novo-treino-na-pasta />
            Colocar na pasta "{pasta.nome}"
          </label>
        ) : undefined
      }
    />
  );
}

function FolhaPastasDoTreino({
  aberto,
  aoMudar,
  modelo,
  pastas,
  editaveis,
  aoAlternar,
  aoNovaPasta,
}: {
  aberto: boolean;
  aoMudar: (a: boolean) => void;
  modelo: ModeloTela | null;
  pastas: PastaTela[];
  editaveis: PastaTela[];
  aoAlternar: (p: PastaTela, colocar: boolean) => Promise<void>;
  aoNovaPasta?: () => void;
}) {
  const [indo, setIndo] = useState<string | null>(null);
  if (!modelo) return null;
  // hml-14d: as pastas do treino vêm do próprio treino (a tela não tem mais todos os treinos de cada pasta)
  const globais = pastas.filter((p) => !p.editavel && modelo.pastas.includes(p.id));
  return (
    <PainelDeslizante aberto={aberto} aoMudar={aoMudar} lado="direita" titulo="Pastas do treino" descricao={`"${modelo.nome}" pode estar em várias pastas.`}>
      <div className="flex flex-col gap-1" data-folha-pastas={modelo.id}>
        {editaveis.length === 0 && <p className="text-[13px] text-texto-3">Você ainda não tem pastas.</p>}
        {editaveis.map((p) => {
          const dentro = modelo.pastas.includes(p.id);
          return (
            <button key={p.id} type="button" role="checkbox" aria-checked={dentro} disabled={indo === p.id}
              onClick={async () => {
                setIndo(p.id);
                await aoAlternar(p, !dentro);
                setIndo(null);
              }}
              className="flex items-center gap-3 border-t border-[rgba(255,255,255,.06)] py-2.5 text-left" data-folha-pasta={p.id} data-dentro={dentro ? "1" : "0"}>
              <FolderClosed aria-hidden className="h-4 w-4 flex-none text-violeta-3" />
              <span className="min-w-0 flex-1 truncate text-[13.5px] text-texto">{p.nome}</span>
              <span aria-hidden className={cn("flex h-6 w-6 items-center justify-center rounded-lg border", dentro ? "border-violeta-3 bg-violeta text-white" : "border-linha-2")}>
                {dentro && <Check className="h-3.5 w-3.5" strokeWidth={2.5} />}
              </span>
            </button>
          );
        })}
        {globais.length > 0 && (
          <p className="mt-2 text-[12px] text-texto-3">Também nas pastas globais: {globais.map((p) => p.nome).join(", ")} (só leitura).</p>
        )}
        {aoNovaPasta && (
          <Botao tamanho="sm" variante="g" icone={FolderPlus} onClick={aoNovaPasta} className="mt-3 self-start" data-folha-pastas-nova>
            Nova pasta
          </Botao>
        )}
      </div>
    </PainelDeslizante>
  );
}
