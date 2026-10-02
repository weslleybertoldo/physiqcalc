import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, FileText, Ruler, RotateCcw, Search, Trash2, User, Utensils, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useConta } from "@/nucleo/conta";
import { useSessao } from "@/nucleo/sessao";
import { AcaoLinha, CampoBusca } from "@/painel/dietas/pecas";
import { ConfirmarPerigo } from "@/ferramentas/Confirmar";
import { TopoPagina } from "@/ui/casca/topo";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoCarregando, EstadoErro, EstadoVazio } from "@/ui/premium/Estados";
import { CHAVE_LIXEIRA, ErroLixeira, apagarDeVez, listarLixeira, restaurar } from "@/ferramentas/lixeira/dados";
import {
  AVISO_LIXEIRA, abaInicial, abasDaPessoa, contarPorTipo, diasParaPurga, filtrarItens, infoTipo, mensagemDaRecusa, rotaDoItem, textoConfirmarApagar,
  textoContagem, textoExcluidoEm, textoPurga, textoVazioAba, tituloDoItem, type ItemLixeira, type TipoLixeira,
} from "@/ferramentas/lixeira/regras";

const ICONES: Record<TipoLixeira, LucideIcon> = {
  resposta: ClipboardList,
  anamnese: FileText,
  antropometria: Ruler,
  plano: Utensils,
  paciente: User,
};

const chave = (i: Pick<ItemLixeira, "tipo" | "id">) => `${i.tipo}:${i.id}`;

/**
 * Ferramentas › Lixeira (W26 — spec 4.6, N-21 e N-65; padrão das telas 6 e 8): o que foi excluído, em abas — respostas de pré-consulta,
 * anamneses, antropometrias, planos alimentares e alunos —, com Restaurar e Apagar de vez. Some sozinho em 30 dias (a tarefa das 03:15
 * do banco, a mesma do site antigo); o aluno fica até restaurar. Quem vê o quê é do banco (lixeira_da_conta): o dono vê o da conta
 * inteira e o membro só o dele (P1); as abas clínicas só para a nutricionista da conta (W18). Restaurar o aluno volta a matrícula como
 * era e respeita o e-mail/CPF únicos (W16b) e o P7 — a recusa aparece em vermelho na linha e nada muda.
 */
export default function Lixeira() {
  const { conta } = useConta();
  const { usuario } = useSessao();
  const qc = useQueryClient();
  const navegar = useNavigate();
  const [sp, setSp] = useSearchParams();
  const contaId = conta?.id ?? "";
  const pronto = !!usuario?.id && !!contaId;
  const [busca, setBusca] = useState(sp.get("q") ?? "");
  const [agindo, setAgindo] = useState<string | null>(null);
  const [recusas, setRecusas] = useState<Record<string, string>>({});
  const [paraApagar, setParaApagar] = useState<ItemLixeira | null>(null);

  const consulta = useQuery({
    queryKey: [...CHAVE_LIXEIRA, contaId, usuario?.id ?? ""],
    queryFn: () => listarLixeira(contaId),
    enabled: pronto,
    staleTime: 15_000,
    retry: 1,
  });
  const dados = consulta.data;
  const itens = useMemo(() => dados?.itens ?? [], [dados]);
  // as abas clínicas: só a nutricionista da conta (W18) — e só numa conta com Nutrição (sem o módulo, abas e itens somem — spec 9)
  const abas = useMemo(() => abasDaPessoa(!!dados?.veClinico && !!dados?.temNutricao), [dados?.veClinico, dados?.temNutricao]);
  const contagem = useMemo(() => contarPorTipo(itens), [itens]);
  const aba = abaInicial(abas, contagem, sp.get("tipo"));
  const visiveis = useMemo(() => filtrarItens(itens, aba, busca), [itens, aba, busca]);
  const totalVisivel = abas.reduce((s, a) => s + contagem[a.id], 0);

  // a busca vai para a URL (?q=) com um atraso curto, como nas outras telas
  useEffect(() => {
    const t = setTimeout(() => {
      const atual = sp.get("q") ?? "";
      if (busca.trim() === atual) return;
      const n = new URLSearchParams(sp);
      if (busca.trim()) n.set("q", busca.trim());
      else n.delete("q");
      setSp(n, { replace: true });
    }, 250);
    return () => clearTimeout(t);
  }, [busca, sp, setSp]);

  const irPara = (tipo: TipoLixeira) => {
    const n = new URLSearchParams(sp);
    n.set("tipo", tipo);
    setSp(n, { replace: false });
  };

  const recarregar = async () => {
    await qc.invalidateQueries({ queryKey: CHAVE_LIXEIRA });
  };

  const aoRestaurar = async (i: ItemLixeira) => {
    if (agindo) return;
    setAgindo(chave(i));
    setRecusas((r) => {
      const n = { ...r };
      delete n[chave(i)];
      return n;
    });
    try {
      await restaurar(i.tipo, i.id);
      // as telas de origem guardam as próprias listas: invalida tudo para nenhuma ficar velha (como o "Meus favoritos" do Nutri)
      await qc.invalidateQueries();
      const rota = rotaDoItem(i);
      toast.success(i.tipo === "paciente" ? "Aluno restaurado" : "Item restaurado", {
        description: tituloDoItem(i),
        action: rota ? { label: "Abrir", onClick: () => navegar(rota) } : undefined,
      });
    } catch (e) {
      const codigo = e instanceof ErroLixeira ? e.codigo : "erro_interno";
      setRecusas((r) => ({ ...r, [chave(i)]: mensagemDaRecusa(codigo, e instanceof ErroLixeira ? e.extra : {}) }));
      if (codigo === "nao_esta_na_lixeira") void recarregar();
    } finally {
      setAgindo(null);
    }
  };

  const aoApagar = async () => {
    const i = paraApagar;
    if (!i || agindo) return;
    setAgindo(chave(i));
    try {
      await apagarDeVez(i.tipo, i.id);
      setParaApagar(null);
      await recarregar();
      toast.success("Apagado de vez", { description: tituloDoItem(i) });
    } catch (e) {
      setParaApagar(null);
      const codigo = e instanceof ErroLixeira ? e.codigo : "erro_interno";
      setRecusas((r) => ({ ...r, [chave(i)]: mensagemDaRecusa(codigo, e instanceof ErroLixeira ? e.extra : {}) }));
    } finally {
      setAgindo(null);
    }
  };

  if (!conta) {
    return (
      <div data-pagina-lixeira data-estado="sem-conta">
        <TopoPagina titulo="Lixeira" />
        <EstadoVazio icone={Trash2} titulo="Nenhuma conta ativa" texto="A lixeira aparece aqui quando você faz parte de uma conta de profissional." />
      </div>
    );
  }

  const agora = new Date();
  return (
    <div
      className="flex flex-col"
      data-pagina-lixeira
      data-aba-lixeira={aba}
      data-ve-clinico={dados?.veClinico ? "1" : "0"}
      data-total-lixeira={totalVisivel}
      data-carregando={consulta.isLoading ? "1" : "0"}
      data-agindo={agindo ? "1" : "0"}
    >
      <TopoPagina
        titulo="Lixeira"
        subtitulo={<span data-subtitulo-lixeira>{consulta.isLoading ? "Abrindo a lixeira…" : `${textoContagem(totalVisivel)} · ${conta.nome}`}</span>}
      />

      <nav aria-label="Abas da lixeira" data-abas-lixeira className="pq-sem-barra flex gap-1 overflow-x-auto border-b border-linha">
        {abas.map((a) => {
          const ativa = a.id === aba;
          const Icone = ICONES[a.id];
          const n = contagem[a.id];
          return (
            <button key={a.id} type="button" role="tab" aria-selected={ativa} onClick={() => irPara(a.id)} data-aba-lixeira-botao={a.id} data-aba-total={n}
              className={cn("relative flex h-[42px] flex-none items-center gap-2 px-3.5 text-[13.5px] font-semibold transition-colors", ativa ? "text-texto" : "text-texto-3 hover:text-texto-2")}>
              <Icone aria-hidden className="h-4 w-4" strokeWidth={1.75} />
              {a.plural}
              {n > 0 && <span className="rounded-full border border-linha-2 px-1.5 text-[11px] font-bold tabular-nums text-texto-2">{n}</span>}
              {ativa && (
                <span aria-hidden className="absolute inset-x-2.5 -bottom-px h-0.5 rounded-sm"
                  style={{ background: "linear-gradient(90deg,var(--p-violeta-2),var(--p-verde-2))", boxShadow: "0 0 12px rgba(139,92,246,.7)" }} />
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-4 flex flex-col gap-4">
        <Cartao className="p-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <CampoBusca valor={busca} aoMudar={setBusca} placeholder={`Buscar em ${infoTipo(aba).plural.toLowerCase()}`} data-campo-busca-lixeira />
          </div>
          <p className="mt-2.5 text-[12px] text-texto-3" data-aviso-lixeira>
            {AVISO_LIXEIRA}
            {dados && !dados.veClinico && dados.temNutricao && " Anamneses, antropometrias e planos alimentares só aparecem para a nutricionista da conta."}
          </p>
        </Cartao>

        <Cartao className="px-4 pb-1 pt-4">
          <CabecalhoCartao titulo={<span data-titulo-aba-lixeira>{infoTipo(aba).plural}</span>}
            extra={<Chip tom="g" data-contagem-aba={contagem[aba]}>{contagem[aba]}</Chip>} />
          {consulta.error ? (
            <EstadoErro texto={`Não foi possível abrir a lixeira: ${mensagemDaRecusa((consulta.error as ErroLixeira).codigo)}`} aoTentar={() => void consulta.refetch()} className="my-4" />
          ) : consulta.isLoading || !pronto ? (
            <EstadoCarregando linhas={3} rotulo="Abrindo a lixeira" className="pb-3" />
          ) : visiveis.length === 0 ? (
            <EstadoVazio icone={busca.trim() ? Search : Trash2} titulo={textoVazioAba(aba, busca)}
              texto={busca.trim() ? "Mude a busca ou troque de aba." : "Tudo o que for excluído nesta conta aparece aqui por 30 dias."} className="my-4" />
          ) : (
            <ul className="divide-y divide-linha-3" data-lista-lixeira>
              {visiveis.map((i) => {
                const Icone = ICONES[i.tipo];
                const dias = diasParaPurga(i.tipo, i.excluido_em, agora);
                const recusa = recusas[chave(i)];
                const ocupado = agindo === chave(i);
                const titulo = tituloDoItem(i);
                return (
                  <li key={chave(i)} className="flex flex-col gap-1.5 py-3" data-item-lixeira={chave(i)} data-item-tipo={i.tipo} data-item-titulo={titulo}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[12px] border border-linha bg-superficie text-texto-2">
                          <Icone aria-hidden className="h-4 w-4" strokeWidth={1.75} />
                        </span>
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-texto">
                            <span className="truncate" data-item-nome>{titulo}</span>
                            <Chip tom={i.tipo === "paciente" ? "c" : infoTipo(i.tipo).clinico ? "n" : "g"} className="h-[20px] px-2 text-[9.5px]">
                              {infoTipo(i.tipo).rotulo.toUpperCase()}
                            </Chip>
                          </p>
                          <p className="mt-0.5 text-[12px] text-texto-3" data-item-resumo>
                            {i.tipo === "paciente" ? (i.detalhe ?? "Sem e-mail") : i.paciente_nome ? `Aluno: ${i.paciente_nome}` : "Sem aluno ligado"}
                            {" · "}
                            {textoExcluidoEm(i.excluido_em)}
                            {" · "}
                            <span className={cn(dias !== null && dias <= 3 && "text-ambar")} data-item-purga={dias ?? "mantido"}>{textoPurga(dias)}</span>
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {i.pode_restaurar && (
                          <AcaoLinha icone={RotateCcw} onClick={() => void aoRestaurar(i)} disabled={!!agindo} data-btn-restaurar>
                            {ocupado ? "Restaurando…" : "Restaurar"}
                          </AcaoLinha>
                        )}
                        {i.pode_apagar && (
                          <AcaoLinha icone={Trash2} perigo onClick={() => setParaApagar(i)} disabled={!!agindo} data-btn-apagar-de-vez>Apagar de vez</AcaoLinha>
                        )}
                        {!i.pode_restaurar && <span className="text-[12px] text-texto-4" data-item-so-ver>Só quem é responsável restaura</span>}
                      </div>
                    </div>
                    {recusa && (
                      <p role="alert" className="pl-12 text-[12.5px] font-medium text-rosa-3" data-recusa-lixeira>{recusa}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {!consulta.isLoading && visiveis.length > 0 && visiveis.length < contagem[aba] && (
            <p className="border-t border-linha-3 py-3 text-center text-[12px] text-texto-4" data-lixeira-filtrados>{visiveis.length} de {contagem[aba]}</p>
          )}
        </Cartao>
      </div>

      <ConfirmarPerigo
        aberto={!!paraApagar}
        aoMudar={(a) => !a && setParaApagar(null)}
        titulo="Apagar de vez?"
        texto={paraApagar ? textoConfirmarApagar(tituloDoItem(paraApagar)) : ""}
        rotulo="Apagar de vez"
        ocupado={!!agindo}
        aoConfirmar={() => void aoApagar()}
        data-confirmar-apagar-de-vez
      />
    </div>
  );
}
