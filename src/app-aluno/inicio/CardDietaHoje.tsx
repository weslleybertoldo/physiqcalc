import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ChefHat, RefreshCw, Salad, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtKcal } from "@/nutricao/app/numeros";
import { useDieta } from "@/nutricao/app/useDieta";
import { Esqueleto } from "@/ui/premium/Estados";
import { useOnline } from "@/ui/premium/useOnline";
import { dietaDeHoje } from "./pecas/regras";
import { useOQueOAlunoTem } from "./pecas/dados";

/** Cartão pequeno da tela 1 (`.card.mini`: 150 px, a metade da linha ao lado das Metas). Tocar abre a aba Dieta. */
function Mini({ marca, aoTocar, children, className }: { marca: string; aoTocar?: () => void; children: ReactNode; className?: string }) {
  const classe = cn("pq-cartao flex h-[150px] min-w-0 flex-col p-3.5 text-left", className);
  return aoTocar ? (
    <button type="button" onClick={aoTocar} data-card-dieta-hoje={marca} className={cn(classe, "transition-colors hover:border-linha-2")}>
      {children}
    </button>
  ) : (
    <div data-card-dieta-hoje={marca} className={classe}>
      {children}
    </div>
  );
}

function Titulo({ offline }: { offline?: boolean }) {
  return (
    <span className="flex w-full items-center gap-[7px] text-[12.5px] font-semibold text-suave">
      <Salad aria-hidden className="h-[15px] w-[15px] flex-none text-verde-2" strokeWidth={1.75} />
      <span className="min-w-0 flex-1 truncate">Dieta de hoje</span>
      {offline && <WifiOff aria-label="Sem conexão" className="h-3.5 w-3.5 flex-none text-ambar-3" strokeWidth={1.75} data-dieta-hoje-offline />}
    </span>
  );
}

function Recado({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <span className="mt-auto block pt-3">
      <b className="block text-[14px] font-semibold leading-snug tracking-[-0.01em] text-texto">{titulo}</b>
      <span className="mt-1 block text-[12px] leading-snug text-texto-2">{texto}</span>
    </span>
  );
}

/**
 * Início › "Dieta de hoje" (W12 — tela 1; N-48): kcal marcadas / kcal do dia, a barra, "N de M refeições" e o % — a MESMA conta
 * do topo da aba Dieta (plano atual, refeições que valem hoje, ✓ de hoje — `useDieta` da W11, o mesmo cache). Aluno do app no
 * Treino + Alimentação (W7b): os pratos prontos pelo objetivo. Precisa de internet (9A): sem conexão, o que já foi aberto com
 * o aviso, ou "A dieta aparece quando a internet voltar". Só Treino: o card não aparece.
 */
export default function CardDietaHoje() {
  const tem = useOQueOAlunoTem();
  if (!tem.nutricao) return null;
  if (tem.pratosProntos) return <PratosDoApp />;
  return <DietaDaNutricionista />;
}

function PratosDoApp() {
  const navigate = useNavigate();
  return (
    <Mini marca="pratos" aoTocar={() => navigate("/dieta")}>
      <Titulo />
      <span className="mt-auto flex items-start gap-2.5 pt-3">
        <ChefHat aria-hidden className="mt-0.5 h-5 w-5 flex-none text-verde-2" strokeWidth={1.75} />
        <span className="min-w-0">
          <b className="block text-[14px] font-semibold leading-snug tracking-[-0.01em] text-texto">Pratos prontos</b>
          <span className="mt-1 block text-[12px] leading-snug text-texto-2">Pelo seu objetivo, com as kcal e os macros.</span>
        </span>
      </span>
    </Mini>
  );
}

function DietaDaNutricionista() {
  const d = useDieta();
  const online = useOnline();
  const navigate = useNavigate();
  const abrir = () => navigate("/dieta");
  const dados = d.dados;
  const semRede = !online || d.erro?.message === "sem_internet";

  if (!dados) {
    if (semRede) {
      return (
        <Mini marca="sem-internet" aoTocar={abrir}>
          <Titulo offline />
          <Recado titulo="Sem conexão" texto="A dieta aparece quando a internet voltar." />
        </Mini>
      );
    }
    if (d.erro) {
      return (
        <Mini marca="erro">
          <Titulo />
          <span className="mt-auto block text-[12.5px] leading-snug text-texto-2">Não deu para carregar a sua dieta.</span>
          <button type="button" onClick={d.recarregar} className="mt-2 inline-flex items-center gap-1 self-start text-[12px] font-semibold text-verde-2" data-dieta-hoje-tentar>
            <RefreshCw aria-hidden className="h-3.5 w-3.5" /> Tentar de novo
          </button>
        </Mini>
      );
    }
    return (
      <Mini marca="carregando">
        <Titulo />
        <div role="status" aria-busy="true" aria-label="Carregando a sua dieta" className="mt-auto flex flex-col gap-2.5">
          <Esqueleto className="h-6 w-4/5" />
          <Esqueleto className="h-[7px] w-full rounded" />
          <Esqueleto className="h-3 w-3/5" />
        </div>
      </Mini>
    );
  }

  const h = dietaDeHoje(dados, d.hoje);
  if (dados.matriculas.length === 0) {
    return (
      <Mini marca="vazia" aoTocar={abrir}>
        <Titulo offline={semRede} />
        <Recado titulo="Sua dieta aparece aqui" texto="Quando a nutricionista liberar o seu plano." />
      </Mini>
    );
  }
  if (!h.plano) {
    return (
      <Mini marca="sem-plano" aoTocar={abrir}>
        <Titulo offline={semRede} />
        <Recado titulo="Nenhum plano ainda" texto="A nutricionista ainda vai montar o seu plano." />
      </Mini>
    );
  }
  if (h.refeicoes.length === 0) {
    return (
      <Mini marca="sem-refeicao" aoTocar={abrir}>
        <Titulo offline={semRede} />
        <Recado titulo="Nenhuma refeição hoje" texto="O seu plano muda conforme o dia. Veja os outros dias." />
      </Mini>
    );
  }
  if (h.resumo.marcaveis === 0) {
    return (
      <Mini marca="sem-alimento" aoTocar={abrir}>
        <Titulo offline={semRede} />
        <Recado titulo={`${h.refeicoes.length} ${h.refeicoes.length === 1 ? "refeição" : "refeições"} hoje`} texto="Ainda sem os alimentos." />
      </Mini>
    );
  }

  const marcadas = h.resumo.marcado.energia_kcal;
  const total = h.resumo.total.energia_kcal;
  return (
    <Mini marca="plano" aoTocar={abrir}>
      <Titulo offline={semRede} />
      <span className="mt-4 flex flex-wrap items-baseline gap-x-1" data-dieta-hoje-kcal={`${Math.round(marcadas)}/${Math.round(total)}`}>
        <b className="text-[26px] font-bold leading-none tracking-[-0.03em] text-texto tabular-nums">{fmtKcal(marcadas)}</b>
        <span className="text-[12px] text-texto-3 tabular-nums">/ {fmtKcal(total)} kcal</span>
      </span>
      <span className="mt-auto block h-[7px] overflow-hidden rounded bg-superficie-2">
        <i className="block h-full rounded"
          style={{ width: `${h.pct}%`, background: "linear-gradient(90deg, #a3e635, #10b981)", boxShadow: h.pct ? "0 0 10px rgba(16,185,129,.7)" : "none" }} />
      </span>
      <span className="mt-2.5 flex items-center justify-between gap-2 text-[12px]">
        <span className="truncate text-suave" data-dieta-hoje-refeicoes={`${h.resumo.concluidas}/${h.resumo.marcaveis}`}>
          {h.resumo.concluidas} de {h.resumo.marcaveis} {h.resumo.marcaveis === 1 ? "refeição" : "refeições"}
        </span>
        <span className="font-semibold text-verde-2 tabular-nums" data-dieta-hoje-pct={h.pct}>{h.pct}%</span>
      </span>
    </Mini>
  );
}
