import { useEffect, useMemo, useState } from "react";
import { Segmentado } from "@/ui/premium/Segmentado";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { autorCurto, ROTULO_POSICAO, rotuloSessao, rotuloSessaoCurto } from "../formato";
import { comparacaoInicial, posicoesComFotos, sessoesComPosicao } from "../serie";
import type { Posicao, SessaoFotos } from "../tipos";
import { FotoProgresso } from "./FotoProgresso";

function Coluna({
  titulo,
  marca,
  lista,
  escolhida,
  aoEscolher,
  posicao,
}: {
  titulo: string;
  marca: string;
  lista: SessaoFotos[];
  escolhida: string | null;
  aoEscolher: (chave: string) => void;
  posicao: Posicao;
}) {
  const s = lista.find((x) => x.chave === escolhida) ?? null;
  const foto = s?.fotos[posicao] ?? null;
  return (
    <div className="flex min-w-0 flex-col gap-2" data-comparar-coluna={marca}>
      <label className="flex flex-col gap-1">
        <span className="pq-eyebrow">{titulo}</span>
        <select
          value={escolhida ?? ""}
          onChange={(e) => aoEscolher(e.target.value)}
          className="h-9 w-full rounded-xl border border-linha-2 bg-superficie px-2.5 text-[13px] font-medium text-texto outline-none focus:border-violeta"
          data-comparar-data={marca}
        >
          {lista.map((x) => (
            <option key={x.chave} value={x.chave} className="bg-tela text-texto">
              {rotuloSessaoCurto(x)} · {autorCurto(x.autor)}
            </option>
          ))}
        </select>
      </label>
      <FotoProgresso url={foto?.url ?? null} rotulo={ROTULO_POSICAO[posicao]} vazia={!foto} altura={236} />
      {s && (
        <span className="truncate text-[11.5px] text-texto-2" data-comparar-legenda={marca}>
          {rotuloSessao(s)} · {s.origem === "principal" ? "nutricionista" : "personal"}
        </span>
      )}
    </div>
  );
}

/**
 * Comparar (tela 4 → C26 e N-34): a MESMA posição em 2 datas lado a lado (a regra da tela antiga — lateral com lateral,
 * frente com frente), com as fotos do personal e as da nutricionista juntas na lista de datas. Começa com a penúltima × a
 * última. As fotos seguem com o cadeado (tocar mostra).
 */
export function SheetComparar({ aberto, aoMudar, sessoes }: { aberto: boolean; aoMudar: (v: boolean) => void; sessoes: SessaoFotos[] }) {
  const posicoes = useMemo(() => posicoesComFotos(sessoes), [sessoes]);
  const [posicao, setPosicao] = useState<Posicao>(posicoes[0] ?? "frente");
  const pos = posicoes.includes(posicao) ? posicao : posicoes[0] ?? "frente";
  const lista = useMemo(() => sessoesComPosicao(sessoes, pos), [sessoes, pos]);
  const [escolha, setEscolha] = useState<{ antes: string | null; depois: string | null }>(() => comparacaoInicial(sessoes, pos));
  useEffect(() => {
    setEscolha(comparacaoInicial(sessoes, pos));
  }, [sessoes, pos, aberto]);

  return (
    <PainelDeslizante aberto={aberto} aoMudar={aoMudar} titulo="Comparar fotos" descricao="A mesma posição em 2 datas, lado a lado." className="max-h-[92vh]">
      <div className="flex flex-col gap-3.5 pb-2" data-sheet-comparar={pos}>
        {posicoes.length > 1 && (
          <Segmentado<Posicao> opcoes={posicoes.map((p) => ({ valor: p, rotulo: ROTULO_POSICAO[p] }))} valor={pos} aoMudar={setPosicao} rotulo="Posição" className="self-start" />
        )}
        {lista.length < 2 && (
          <p className="text-[12.5px] leading-relaxed text-texto-2" data-comparar-pouco>
            Para comparar, é preciso ter fotos de “{ROTULO_POSICAO[pos]}” em pelo menos 2 datas.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Coluna titulo="Antes" marca="antes" lista={lista} escolhida={escolha.antes} aoEscolher={(c) => setEscolha((e) => ({ ...e, antes: c }))} posicao={pos} />
          <Coluna titulo="Depois" marca="depois" lista={lista} escolhida={escolha.depois} aoEscolher={(c) => setEscolha((e) => ({ ...e, depois: c }))} posicao={pos} />
        </div>
      </div>
    </PainelDeslizante>
  );
}
