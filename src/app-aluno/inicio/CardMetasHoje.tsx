import { useNavigate } from "react-router-dom";
import { CircleCheck, LoaderCircle, Target, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { textoErroMeta } from "@/nutricao/app/metasUtil";
import { useDieta } from "@/nutricao/app/useDieta";
import { Esqueleto } from "@/ui/premium/Estados";
import { useOnline } from "@/ui/premium/useOnline";
import { metasDeHoje } from "./pecas/regras";
import { useOQueOAlunoTem } from "./pecas/dados";

const MAX_NO_CARD = 3;

/**
 * Início › "Metas de hoje" (W12 — tela 1; NF4, N-51): as metas que valem hoje (a MESMA lista "Hoje" da folha das metas da aba
 * Dieta), com o ✓ — a mesma função `aluno_marcar_meta` e o mesmo cache do `useDieta` (marcar aqui aparece na aba Dieta e no
 * painel da nutricionista). Zera no dia seguinte (São Paulo). Mais de 3: "+N" abre as metas. Precisa de internet para marcar.
 * Só quem tem nutricionista vê (o aluno só do Treino e o do app sem nutricionista, não).
 */
export default function CardMetasHoje() {
  const tem = useOQueOAlunoTem();
  if (!tem.comNutricionista) return null;
  return <Metas />;
}

function Metas() {
  const d = useDieta();
  const online = useOnline();
  const navigate = useNavigate();
  const dados = d.dados;
  const semRede = !online || d.erro?.message === "sem_internet";
  const verMetas = () => navigate("/dieta?ver=metas");

  const titulo = (
    <button type="button" onClick={verMetas} className="flex w-full items-center gap-[7px] text-left text-[12.5px] font-semibold text-suave hover:text-texto" data-metas-hoje-abrir>
      <Target aria-hidden className="h-[15px] w-[15px] flex-none text-ambar-3" strokeWidth={1.75} />
      <span className="min-w-0 flex-1 truncate">Metas de hoje</span>
      {semRede && <WifiOff aria-label="Sem conexão" className="h-3.5 w-3.5 flex-none text-ambar-3" strokeWidth={1.75} />}
    </button>
  );

  if (!dados) {
    return (
      <div className="pq-cartao flex h-[150px] min-w-0 flex-col p-3.5" data-card-metas-hoje={semRede ? "sem-internet" : d.erro ? "erro" : "carregando"}>
        {titulo}
        {semRede ? (
          <span className="mt-auto block">
            <b className="block text-[14px] font-semibold leading-snug tracking-[-0.01em] text-texto">Sem conexão</b>
            <span className="mt-1 block text-[12px] leading-snug text-texto-2">As metas aparecem quando a internet voltar.</span>
          </span>
        ) : d.erro ? (
          <span className="mt-auto block text-[12.5px] leading-snug text-texto-2">Não deu para carregar as metas.</span>
        ) : (
          <div role="status" aria-busy="true" aria-label="Carregando as metas" className="mt-3 flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <Esqueleto key={i} className="h-4 w-full" />
            ))}
          </div>
        )}
      </div>
    );
  }

  const { metas, feitas } = metasDeHoje(dados.metas, dados.metas_concluidas, d.hoje);
  const visiveis = metas.slice(0, MAX_NO_CARD);
  const resto = metas.length - visiveis.length;
  const temAtivas = dados.metas.some((m) => m.ativa);

  const marcar = async (id: string, concluida: boolean) => {
    if (!online) {
      toast.error("Sem conexão. Marque de novo quando a internet voltar.");
      return;
    }
    try {
      await d.marcarMeta({ id, concluida });
    } catch (e) {
      toast.error(textoErroMeta(e instanceof Error ? e : null));
    }
  };

  return (
    <div className="pq-cartao flex h-[150px] min-w-0 flex-col p-3.5" data-card-metas-hoje={metas.length ? "metas" : "vazio"} data-metas-hoje={metas.length} data-metas-hoje-feitas={feitas}>
      {titulo}
      {metas.length === 0 ? (
        <span className="mt-auto block">
          <b className="block text-[14px] font-semibold leading-snug tracking-[-0.01em] text-texto">Nenhuma meta hoje</b>
          <span className="mt-1 block text-[12px] leading-snug text-texto-2">{temAtivas ? "As suas metas são de outros dias." : "As metas da nutricionista aparecem aqui."}</span>
        </span>
      ) : (
        <ul className="mt-3 flex min-w-0 flex-col gap-[9px] text-[12.5px]">
          {visiveis.map((m) => {
            const salvando = d.salvandoMeta === m.id;
            const Icone = salvando ? LoaderCircle : CircleCheck;
            return (
              <li key={m.id} className="min-w-0">
                <button type="button" onClick={() => void marcar(m.id, !m.feita)} disabled={salvando} aria-pressed={m.feita}
                  aria-label={`${m.titulo}: ${m.feita ? "feita (toque para desmarcar)" : "marcar como feita"}`}
                  data-meta-hoje={m.id} data-meta-hoje-feita={m.feita ? "1" : "0"}
                  className="flex w-full min-w-0 items-center gap-2 text-left">
                  <Icone aria-hidden className={cn("h-[17px] w-[17px] flex-none", salvando && "animate-spin", m.feita ? "text-verde-2" : "text-texto-4")} strokeWidth={1.9} />
                  <span className={cn("min-w-0 flex-1 truncate", m.feita ? "text-texto" : "text-texto-3")}>{m.titulo}</span>
                </button>
              </li>
            );
          })}
          {resto > 0 && (
            <li>
              <button type="button" onClick={verMetas} className="text-[12px] font-semibold text-ambar-3" data-metas-hoje-mais={resto}>
                +{resto} {resto === 1 ? "meta" : "metas"}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
