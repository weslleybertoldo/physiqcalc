import { useState } from "react";
import { Link } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, Eraser, History, Loader2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/ui/premium/Avatar";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoCarregando, EstadoErro, EstadoVazio } from "@/ui/premium/Estados";
import { Segmentado } from "@/ui/premium/Segmentado";
import { ErroMensagens, limparFalhas, listarFila, reenviar } from "./api";
import { CHAVES_MENSAGENS } from "./chaves";
import {
  ESCOPOS, FILTROS, ROTULO_STATUS_MSG, TOM_STATUS, destinoFormatado, nomeDaLinha, primeiroNome, quandoDaMensagem, resumoFalhas, rotuloTipo, textoVazio,
  type EscopoFila, type FiltroFila, type ItemFila,
} from "./filaUtil";
import type { ContextoMensagens, DadosMensagens } from "./useMensagens";
import { traduzErro } from "./whatsappUtil";

const POR_PAGINA = 20;
const BTN_MINI =
  "inline-flex h-8 flex-none items-center gap-1.5 rounded-[10px] border border-linha-2 bg-[rgba(255,255,255,.04)] px-2.5 text-[12px] font-semibold text-texto-2 transition-colors hover:text-texto disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:h-[14px] [&_svg]:w-[14px]";

/**
 * Physiq W22 — o HISTÓRICO DA FILA (spec 4.4: pendente, enviada, falhou), no padrão das listas da tela 6. "Minha fila" = o que sai do seu
 * WhatsApp; o dono também vê "Toda a equipe" (os alunos da conta, de qualquer membro — P1). "Com falha" = as falhas novas (7 dias,
 * depois do "Limpar") = o número do menu; "Reenviar" põe a sua mensagem de volta na fila (o banco confere se ainda faz sentido) e
 * "Limpar falhas" zera o número sem apagar nada.
 */
export default function Historico({ ctx, d, conectado, agora }: { ctx: ContextoMensagens; d: DadosMensagens; conectado: boolean; agora: number }) {
  const [filtro, setFiltro] = useState<FiltroFila>("todas");
  const [escopoEscolhido, setEscopo] = useState<EscopoFila>("meus");
  const escopo: EscopoFila = ctx.dono ? escopoEscolhido : "meus";
  const [agindo, setAgindo] = useState<string | null>(null);
  const q = useInfiniteQuery({
    queryKey: CHAVES_MENSAGENS.fila(ctx.contaId, ctx.uid, escopo, filtro),
    queryFn: ({ pageParam }) => listarFila({ contaId: ctx.contaId || null, escopo, filtro, limite: POR_PAGINA, cursor: pageParam }),
    initialPageParam: null as { antes: string; antesId: string } | null,
    getNextPageParam: (ultima) => {
      const fim = ultima.itens[ultima.itens.length - 1];
      return ultima.mais && fim ? { antes: fim.criado_em, antesId: fim.id } : undefined;
    },
    enabled: ctx.pronto,
    staleTime: 15_000,
    refetchInterval: 60_000,
    retry: 1,
  });
  const itens = q.data?.pages.flatMap((p) => p.itens) ?? [];
  const falhas = d.resumo.data?.falhas ?? 0;
  const vazio = textoVazio(filtro, escopo);

  const fazer = async (chave: string, fn: () => Promise<void>, ok: string) => {
    setAgindo(chave);
    try {
      await fn();
      toast.success(ok);
      await d.recarregar({ resumo: true, fila: true });
    } catch (e) {
      toast.error(traduzErro(e instanceof ErroMensagens ? e.codigo : "erro_interno"));
    } finally {
      setAgindo(null);
    }
  };

  return (
    <Cartao className="px-[22px] pb-3 pt-[18px]" data-card-historico data-historico-filtro={filtro} data-historico-escopo={escopo} data-historico-linhas={itens.length}
      data-atualizando={q.isFetching ? "1" : "0"}>
      <CabecalhoCartao titulo="Histórico da fila"
        extra={falhas > 0 ? <Chip tom="r" data-chip-falhas>{falhas}</Chip> : undefined}
        acao={ctx.dono ? <Segmentado<EscopoFila> opcoes={ESCOPOS} valor={escopo} aoMudar={setEscopo} rotulo="De quem" /> : undefined} />

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Segmentado<FiltroFila> opcoes={FILTROS.map((f) => ({ ...f, rotulo: f.valor === "falhas" && falhas > 0 && escopo === "meus" ? `${f.rotulo} (${falhas})` : f.rotulo }))}
          valor={filtro} aoMudar={setFiltro} rotulo="Filtrar o histórico" />
        <span className="text-[12px] text-texto-3" data-resumo-falhas>{resumoFalhas(falhas)}</span>
        {falhas > 0 && (
          <button type="button" className={cn(BTN_MINI, "ml-auto")} disabled={agindo !== null}
            onClick={() => void fazer("limpar", limparFalhas, "Falhas marcadas como vistas")} data-btn-limpar-falhas>
            {agindo === "limpar" ? <Loader2 aria-hidden className="animate-spin" /> : <Eraser aria-hidden />} Limpar falhas
          </button>
        )}
      </div>

      {q.isLoading ? (
        <EstadoCarregando linhas={3} rotulo="Carregando o histórico" className="py-2" />
      ) : q.isError ? (
        <EstadoErro titulo="Não deu para carregar o histórico" aoTentar={() => void q.refetch()} className="my-2" />
      ) : itens.length === 0 ? (
        <EstadoVazio icone={History} titulo={vazio.titulo} texto={vazio.texto} className="my-2 border-0 bg-transparent shadow-none" />
      ) : (
        <ul className="divide-y divide-linha-3" data-lista-historico>
          {itens.map((m) => (
            <LinhaFila key={m.id} m={m} agora={agora} conectado={conectado} agindo={agindo}
              aoReenviar={() => void fazer(`reenviar:${m.id}`, () => reenviar(m.id), "Mensagem de volta na fila")} />
          ))}
        </ul>
      )}

      {q.hasNextPage && (
        <div className="flex justify-center pt-2">
          <button type="button" className={BTN_MINI} onClick={() => void q.fetchNextPage()} disabled={q.isFetchingNextPage} data-btn-ver-mais>
            {q.isFetchingNextPage ? <Loader2 aria-hidden className="animate-spin" /> : <ChevronDown aria-hidden />} Ver mais
          </button>
        </div>
      )}
    </Cartao>
  );
}

function LinhaFila({ m, agora, conectado, agindo, aoReenviar }: { m: ItemFila; agora: number; conectado: boolean; agindo: string | null; aoReenviar: () => void }) {
  const nome = nomeDaLinha(m);
  const indo = agindo === `reenviar:${m.id}`;
  return (
    <li className="flex min-h-[62px] items-center gap-3 py-2.5" data-mensagem={m.id} data-mensagem-status={m.status} data-mensagem-tipo={m.tipo}
      data-mensagem-minha={m.minha ? "1" : "0"}>
      <Avatar nome={nome} tamanho={36} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          {m.aluno ? (
            <Link to={`/painel/alunos/${m.aluno.rota}`} className="truncate text-[13.5px] font-semibold text-texto hover:underline" data-mensagem-aluno={m.aluno.id}>{nome}</Link>
          ) : (
            <b className="truncate text-[13.5px] font-semibold text-texto">{nome}</b>
          )}
          <Chip tom="g" className="h-[20px] text-[10px]">{rotuloTipo(m.tipo).toUpperCase()}</Chip>
          {!m.minha && <span className="text-[11.5px] text-texto-3" data-mensagem-autor>do WhatsApp de {primeiroNome(m.autor.nome) || "outro profissional"}</span>}
        </div>
        <p className="line-clamp-1 text-[12px] text-texto-3" data-mensagem-texto>{m.texto}</p>
        {m.status === "falhou" && m.erro && <p className="text-[11.5px] font-medium text-rosa-3" data-mensagem-erro>Motivo: {m.erro}</p>}
      </div>
      <div className="hidden flex-none flex-col items-end gap-0.5 text-right md:flex">
        <span className="text-[11.5px] text-texto-2" data-mensagem-quando>{quandoDaMensagem(m, new Date(agora))}</span>
        {m.destino && <span className="text-[11px] tabular-nums text-texto-4">{destinoFormatado(m.destino)}</span>}
      </div>
      <Chip tom={TOM_STATUS[m.status] ?? "g"} className="h-[22px] flex-none text-[10.5px]" data-status-msg={m.status}>{(ROTULO_STATUS_MSG[m.status] ?? m.status).toUpperCase()}</Chip>
      {m.pode_reenviar && (
        <button type="button" className={BTN_MINI} onClick={aoReenviar} disabled={!conectado || agindo !== null}
          title={conectado ? "Pôr de volta na fila" : "Conecte o WhatsApp para reenviar"} data-btn-reenviar={m.id}>
          {indo ? <Loader2 aria-hidden className="animate-spin" /> : <RotateCcw aria-hidden />} Reenviar
        </button>
      )}
    </li>
  );
}
