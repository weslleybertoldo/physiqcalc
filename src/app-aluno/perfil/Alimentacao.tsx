import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChefHat, Salad, UtensilsCrossed } from "lucide-react";
import { useSessao } from "@/nucleo/sessao";
import { matriculaDoApp, temAlimentacaoDoApp } from "@/nucleo/situacao";
import { buscarPratos, ErroApp } from "@/app-aluno/sozinho/api";
import {
  agruparPorRefeicao,
  ehObjetivo,
  gramas,
  kcalTexto,
  mensagemApp,
  OBJETIVOS,
  resumoDosItens,
  ROTULO_REFEICAO,
  rotuloObjetivo,
  type Objetivo,
  type PratoPronto,
} from "@/app-aluno/sozinho/regras";
import { CLASSE_PAGINA_APP, TopoItem } from "@/app-aluno/perfil/pecas/TopoItem";
import { Botao } from "@/ui/premium/Botao";
import { Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoCarregando, EstadoErro, EstadoSemInternet, EstadoVazio } from "@/ui/premium/Estados";
import { fotoDaRefeicao } from "@/ui/premium/fotos";
import { Segmentado } from "@/ui/premium/Segmentado";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { useOnline } from "@/ui/premium/useOnline";

const OBJETIVO_CURTO: Record<Objetivo, string> = { emagrecer: "Emagrecer", manter: "Manter", ganhar_massa: "Massa" };

/**
 * Perfil › Alimentação (W7b — regra dele: "em nutri terá alguns pratos prontos baseado no objetivo do aluno (quando não tem
 * profissional vinculado)"): os pratos prontos do plano Treino + Alimentação, por refeição, com kcal e macros calculados da
 * tabela TACO pelo banco. Só quem está no app com esse plano vê (o banco confere). Visual da tela 3 (refeições com foto,
 * horário/itens e kcal); a W11 leva estes pratos para a aba Dieta do aluno sem profissional.
 */
export default function Alimentacao() {
  const navigate = useNavigate();
  const online = useOnline();
  const { situacao } = useSessao();
  const doApp = matriculaDoApp(situacao);
  const libera = temAlimentacaoDoApp(doApp) || !!situacao?.master;
  const [objetivo, setObjetivo] = useState<Objetivo | null>(() => (ehObjetivo(doApp?.objetivo_app) ? doApp!.objetivo_app : null));
  const [aberto, setAberto] = useState<PratoPronto | null>(null);
  const consulta = useQuery({
    queryKey: ["pratos-prontos", objetivo ?? "do-aluno"],
    queryFn: () => buscarPratos(objetivo),
    enabled: libera,
    staleTime: 5 * 60_000,
    retry: 1,
    networkMode: "online",
  });
  const obj = objetivo ?? consulta.data?.objetivo ?? "manter";
  const grupos = useMemo(() => agruparPorRefeicao(consulta.data?.pratos ?? []), [consulta.data]);

  if (!libera) {
    return (
      <div data-pagina-alimentacao="sem-plano" className={CLASSE_PAGINA_APP}>
        <TopoItem titulo="Alimentação" />
        <Cartao brilho className="flex flex-col gap-3 px-4 py-4" data-alimentacao-bloqueada>
          <span className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-linha bg-superficie text-verde-3">
            <Salad aria-hidden className="h-5 w-5" strokeWidth={1.8} />
          </span>
          <b className="text-[16px] font-semibold text-texto">Pratos prontos pelo seu objetivo</b>
          <p className="text-[13px] leading-relaxed text-texto-2">
            {doApp
              ? "Os pratos prontos, com calorias e macros, estão no plano Treino + Alimentação. Troque de plano em Meu plano."
              : "Os pratos prontos são para quem treina sem profissional, no plano Treino + Alimentação."}
          </p>
          {doApp && <Botao variante="w" className="w-full" onClick={() => navigate("/perfil/meu-plano")} data-ver-planos>Ver os planos</Botao>}
        </Cartao>
      </div>
    );
  }

  return (
    <div data-pagina-alimentacao="pratos" className={CLASSE_PAGINA_APP}>
      <TopoItem titulo="Alimentação" />
      <Cartao brilho className="flex items-start gap-3 px-4 py-3.5" data-alimentacao-cabecalho>
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[12px] bg-superficie text-verde-3">
          <ChefHat aria-hidden className="h-5 w-5" strokeWidth={1.8} />
        </span>
        <span className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-texto-2">
          <b className="block text-[14.5px] font-semibold text-texto">Pratos prontos · {rotuloObjetivo(obj)}</b>
          Escolha 1 prato por refeição. Calorias e macros da tabela TACO; ajuste a porção à sua fome.
        </span>
      </Cartao>
      <Segmentado<Objetivo> rotulo="Objetivo" className="self-start" valor={obj} aoMudar={setObjetivo}
        opcoes={OBJETIVOS.map((o) => ({ valor: o.id, rotulo: OBJETIVO_CURTO[o.id] }))} />

      {!online && !consulta.data ? (
        <EstadoSemInternet texto="Os pratos prontos aparecem quando a internet voltar." />
      ) : consulta.isLoading ? (
        <EstadoCarregando linhas={4} rotulo="Carregando os pratos prontos" />
      ) : consulta.isError ? (
        <EstadoErro texto={mensagemApp(consulta.error instanceof ErroApp ? consulta.error.codigo : null)} aoTentar={() => void consulta.refetch()} />
      ) : !grupos.length ? (
        <EstadoVazio icone={UtensilsCrossed} titulo="Nenhum prato por enquanto" texto="Os pratos deste objetivo aparecem aqui." />
      ) : (
        grupos.map((g) => (
          <section key={g.refeicao} className="flex flex-col gap-2" data-refeicao-pronta={g.refeicao}>
            <div className="mt-1.5 flex items-center justify-between px-1">
              <span className="text-[15px] font-semibold text-texto">{g.rotulo}</span>
              <Chip tom="n">{g.pratos.length} {g.pratos.length === 1 ? "OPÇÃO" : "OPÇÕES"}</Chip>
            </div>
            {g.pratos.map((p) => (
              <button key={p.codigo} type="button" onClick={() => setAberto(p)} data-prato-pronto={p.codigo}
                className="pq-cartao flex items-center gap-3 px-2.5 py-2.5 text-left">
                <img src={p.foto_url || fotoDaRefeicao(ROTULO_REFEICAO[p.refeicao])} alt="" aria-hidden
                  className="h-[62px] w-[62px] flex-none rounded-[16px] border border-linha object-cover" />
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[14px] font-semibold text-texto">{p.nome}</b>
                  <span className="mt-0.5 block truncate text-[12.5px] text-texto-2">{resumoDosItens(p.itens)}</span>
                </span>
                <span className="flex-none pr-1 text-right" data-prato-kcal={Math.round(p.kcal)}>
                  <b className="block text-[16px] font-bold tabular-nums text-texto">{kcalTexto(p.kcal)}</b>
                  <span className="block text-[11.5px] text-texto-3">kcal</span>
                </span>
              </button>
            ))}
          </section>
        ))
      )}
      <p className="px-1 pt-1 text-[11.5px] leading-relaxed text-texto-3">
        Sugestões gerais, não são uma dieta individual. Para um plano sob medida, fale com uma nutricionista pelo código dela no Perfil.
      </p>
      <DetalhePrato prato={aberto} aoFechar={() => setAberto(null)} />
    </div>
  );
}

const MACROS: Array<{ chave: "proteina_g" | "carboidrato_g" | "lipidio_g"; rotulo: string; kcalPorG: number; cor: string }> = [
  { chave: "proteina_g", rotulo: "Proteína", kcalPorG: 4, cor: "linear-gradient(90deg, var(--p-ciano), #38bdf8)" },
  { chave: "carboidrato_g", rotulo: "Carboidrato", kcalPorG: 4, cor: "linear-gradient(90deg, #84cc16, var(--p-verde-2))" },
  { chave: "lipidio_g", rotulo: "Gordura", kcalPorG: 9, cor: "linear-gradient(90deg, #facc15, var(--p-ambar-3))" },
];

/** Detalhe do prato (tela 3: barras de proteína, carboidrato e gordura): os itens com a medida caseira e o modo de preparo. */
function DetalhePrato({ prato, aoFechar }: { prato: PratoPronto | null; aoFechar: () => void }) {
  const total = prato ? MACROS.reduce((n, m) => n + prato[m.chave] * m.kcalPorG, 0) || 1 : 1;
  return (
    <PainelDeslizante aberto={!!prato} aoMudar={(v) => !v && aoFechar()} titulo={prato?.nome ?? "Prato"}
      descricao={prato ? `${ROTULO_REFEICAO[prato.refeicao]} · ${kcalTexto(prato.kcal)} kcal` : undefined} lado="baixo">
      {prato && (
        <div className="flex flex-col gap-4" data-detalhe-prato={prato.codigo}>
          {prato.descricao && <p className="text-[13px] leading-relaxed text-texto-2">{prato.descricao}</p>}
          <div className="flex flex-col gap-2.5 rounded-2xl border border-linha bg-superficie px-3.5 py-3" data-prato-macros>
            {MACROS.map((m) => (
              <div key={m.chave}>
                <div className="flex items-baseline justify-between text-[12.5px]">
                  <span className="text-texto-2">{m.rotulo}</span>
                  <b className="font-semibold tabular-nums text-texto">{gramas(prato[m.chave])}</b>
                </div>
                <div className="mt-1 h-[7px] overflow-hidden rounded-full bg-superficie-2">
                  <div className="h-full rounded-full" style={{ width: `${Math.round((prato[m.chave] * m.kcalPorG * 100) / total)}%`, background: m.cor }} />
                </div>
              </div>
            ))}
          </div>
          <div>
            <div className="pq-eyebrow pb-1">Ingredientes</div>
            <ul className="divide-y divide-linha-3">
              {prato.itens.map((i, n) => (
                <li key={`${i.nome}-${n}`} className="flex items-center justify-between gap-3 py-2 text-[13px]" data-item-prato={i.taco ?? i.nome}>
                  <span className="min-w-0">
                    <span className="block truncate text-texto">{i.nome}</span>
                    <span className="block truncate text-[11.5px] text-texto-3">{[i.medida, gramas(i.quantidade_g)].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="flex-none tabular-nums text-texto-2">{kcalTexto(i.kcal)} kcal</span>
                </li>
              ))}
            </ul>
          </div>
          {prato.modo_preparo && (
            <div>
              <div className="pq-eyebrow pb-1">Como fazer</div>
              <p className="text-[13px] leading-relaxed text-texto-2">{prato.modo_preparo}</p>
            </div>
          )}
        </div>
      )}
    </PainelDeslizante>
  );
}
