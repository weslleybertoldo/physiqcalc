// Physiq W-A P3 — "Rotinas de hoje" (spec §4.3): o card do Início e — na P5 — a seção do fim da aba Dieta (a MESMA lista: `origem` só muda
// o data-*). As rotinas do dia (vivas, do dia da semana, pela hora) com o ✓ otimista; primeiro as que faltam, até 4 + "+N"; hora, nome e
// detalhe; o selo "do seu profissional" nas criadas por profissional. Vazio: "Crie a sua 1ª rotina…" + "Criar rotina". Tocar abre a página.
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { CircleCheck, ListChecks, LoaderCircle, Plus, RefreshCw, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { hojeSP, rotinasDoDia, type RotinaDoDia } from "@/aluno-dia/regras";
import { Botao } from "@/ui/premium/Botao";
import { Chip } from "@/ui/premium/Chip";
import { Esqueleto } from "@/ui/premium/Estados";
import { useOnline } from "@/ui/premium/useOnline";
import { NO_CARD, ROTA_ROTINAS, proximasDoDia, vivas } from "../regras";
import { SELO_DO_PROFISSIONAL, TEXTOS } from "../textos";
import { fraseDoErro, useMarcarRotina, useMinhasRotinas } from "../useRotinas";

export function RotinasDeHoje({ origem = "inicio", limite = NO_CARD }: { origem?: "inicio" | "dieta"; limite?: number }) {
  const navigate = useNavigate();
  const online = useOnline();
  const q = useMinhasRotinas(true);
  const marcar = useMarcarRotina();
  const hoje = hojeSP();
  const atributo = origem === "inicio" ? "data-card-rotinas-hoje" : "data-card-rotinas-dieta";
  const abrir = (nova = false) => navigate(nova ? `${ROTA_ROTINAS}?nova=1` : ROTA_ROTINAS);
  const semRede = !online && !q.data;

  const titulo = (
    <button type="button" onClick={() => abrir()} className="flex w-full items-center gap-[7px] text-left text-[12.5px] font-semibold text-suave hover:text-texto" data-rotinas-abrir>
      <ListChecks aria-hidden className="h-[15px] w-[15px] flex-none text-ciano-3" strokeWidth={1.75} />
      <span className="min-w-0 flex-1 truncate">{TEXTOS.card}</span>
      {!online && <WifiOff aria-label="Sem conexão" className="h-3.5 w-3.5 flex-none text-ambar-3" strokeWidth={1.75} />}
    </button>
  );
  const moldura = (estado: string, filhos: ReactNode) => (
    <div className="pq-cartao flex min-w-0 flex-col gap-3 p-3.5" {...{ [atributo]: estado }}>
      {titulo}
      {filhos}
    </div>
  );

  if (!q.data) {
    if (semRede) {
      return moldura("sem-internet", (
        <span className="block">
          <b className="block text-[14px] font-semibold leading-snug text-texto">{TEXTOS.semConexao}</b>
          <span className="mt-1 block text-[12px] leading-snug text-texto-2">{TEXTOS.semConexaoTexto}</span>
        </span>
      ));
    }
    if (q.isError) {
      return moldura("erro", (
        <span className="flex items-center justify-between gap-3">
          <span className="text-[12.5px] leading-snug text-texto-2">{TEXTOS.erroLer}</span>
          <Botao tamanho="sm" icone={RefreshCw} onClick={() => void q.refetch()} data-rotinas-tentar>Tentar de novo</Botao>
        </span>
      ));
    }
    return moldura("carregando", (
      <div role="status" aria-busy="true" aria-label="Carregando as rotinas" className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => <Esqueleto key={i} className="h-4 w-full" />)}
      </div>
    ));
  }

  if (vivas(q.data.rotinas).length === 0) {
    return moldura("vazio", (
      <span className="flex flex-col items-start gap-2.5">
        <span className="text-[13px] leading-snug text-texto-2">{TEXTOS.vazio}</span>
        <Botao tamanho="sm" variante="w" icone={Plus} onClick={() => abrir(true)} data-rotinas-criar>{TEXTOS.criar}</Botao>
      </span>
    ));
  }

  const doDia = rotinasDoDia(q.data.rotinas, q.data.feitas, hoje);
  if (doDia.length === 0) {
    return moldura("nenhuma-hoje", (
      <span className="block">
        <b className="block text-[14px] font-semibold leading-snug text-texto">{TEXTOS.nenhumaHoje}</b>
        <span className="mt-1 block text-[12px] leading-snug text-texto-2">{TEXTOS.nenhumaHojeTexto}</span>
      </span>
    ));
  }

  const { visiveis, resto } = proximasDoDia(doDia, limite);
  const alternar = (r: RotinaDoDia) => {
    if (!online) {
      toast.error(TEXTOS.semInternetMarcar);
      return;
    }
    marcar.mutate({ id: r.id, dia: hoje, feita: !r.feita }, { onError: (e) => toast.error(fraseDoErro(e)) });
  };

  return moldura("lista", (
    <ul className="flex min-w-0 flex-col gap-2.5" data-rotinas-hoje={doDia.length} data-rotinas-hoje-feitas={doDia.filter((r) => r.feita).length}>
      {visiveis.map((r) => {
        const salvando = marcar.isPending && marcar.variables?.id === r.id;
        const Icone = salvando ? LoaderCircle : CircleCheck;
        return (
          <li key={r.id} className="flex min-w-0 items-center gap-2.5" data-rotina-hoje={r.id} data-rotina-feita={r.feita ? "1" : "0"}>
            <button type="button" onClick={() => alternar(r)} disabled={salvando} aria-pressed={r.feita} data-rotina-marcar={r.id}
              aria-label={`${r.nome}: ${r.feita ? "feita (toque para desmarcar)" : "marcar como feita"}`} className="flex-none">
              <Icone aria-hidden className={cn("h-[19px] w-[19px]", salvando && "animate-spin", r.feita ? "text-verde-2" : "text-texto-4")} strokeWidth={1.9} />
            </button>
            <button type="button" onClick={() => abrir()} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
              <span className="w-[42px] flex-none text-[12px] font-semibold tabular-nums text-texto-2">{r.horario ?? "—"}</span>
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-[13px] font-medium", r.feita ? "text-texto-3" : "text-texto")}>{r.nome}</span>
                {r.detalhe && <span className="block truncate text-[11.5px] text-texto-3">{r.detalhe}</span>}
              </span>
              {r.origem === "profissional" && <Chip tom="c" className="flex-none" data-rotina-selo>{SELO_DO_PROFISSIONAL}</Chip>}
            </button>
          </li>
        );
      })}
      {resto > 0 && (
        <li>
          <button type="button" onClick={() => abrir()} className="text-[12px] font-semibold text-ciano-3" data-rotinas-mais={resto}>
            +{resto} {resto === 1 ? "rotina" : "rotinas"}
          </button>
        </li>
      )}
    </ul>
  ));
}
