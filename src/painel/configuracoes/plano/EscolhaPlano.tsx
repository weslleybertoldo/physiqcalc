import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  FAIXAS,
  NOME_FAIXA,
  NOME_PLANO,
  PLANOS,
  maxAlunosDaFaixa,
  precoDoPlano,
  reais,
  type Faixa,
  type LinhaPreco,
  type Meses,
  type PlanoConta,
} from "@/nucleo/cobranca/regras";
import { Chip } from "@/ui/premium/Chip";
import { Segmentado } from "@/ui/premium/Segmentado";

export interface Escolha {
  plano: PlanoConta;
  faixa: Faixa;
  meses: Meses;
}

const DESCRICAO: Record<PlanoConta, string> = {
  treino: "Prescrição, execução e avaliação física",
  nutricao: "Planos alimentares, prontuário e diário",
  treino_nutricao: "Os dois módulos, com a equipe junta",
};

/**
 * Escolha do plano (spec 6.1 e 6.5): os 3 planos por módulo, a faixa de alunos ativos e mensal/anual (anual = 10
 * mensalidades por 12 meses). Faixa em que os alunos ativos não cabem fica desabilitada (6.4). Cartões no padrão das
 * telas 6/7 (linha fina, chips TREINO/NUTRIÇÃO, valor grande).
 */
export function EscolhaPlano({
  precos,
  valorTravado,
  escolha,
  aoMudar,
  alunosAtivos,
  atual,
  semAnual,
}: {
  precos: LinhaPreco[];
  valorTravado: number | null;
  escolha: Escolha;
  aoMudar: (e: Escolha) => void;
  alunosAtivos: number;
  /** o plano de hoje (conta ativa) — marcado com "Atual" */
  atual?: { plano: PlanoConta; faixa: Faixa } | null;
  semAnual?: boolean;
}) {
  const precoMes = (plano: PlanoConta, faixa: Faixa) => precoDoPlano(precos, plano, faixa, 1, valorTravado);
  return (
    <div className="flex flex-col gap-4" data-escolha-plano>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3" role="radiogroup" aria-label="Plano">
        {PLANOS.map((plano) => {
          const ativo = escolha.plano === plano;
          const valor = precoDoPlano(precos, plano, escolha.faixa, escolha.meses, valorTravado);
          const ehAtual = atual?.plano === plano && atual.faixa === escolha.faixa;
          return (
            <button key={plano} type="button" role="radio" aria-checked={ativo} data-plano-opcao={plano}
              onClick={() => aoMudar({ ...escolha, plano })}
              className={cn(
                "relative flex flex-col items-start gap-2 rounded-[18px] border px-3.5 py-3 text-left transition-colors",
                ativo ? "border-violeta/60 bg-superficie-2 shadow-[0_0_0_1px_rgba(139,92,246,.25)]" : "border-linha bg-superficie-3 hover:border-linha-2",
              )}>
              <span className="flex flex-wrap gap-1.5">
                {plano !== "nutricao" && <Chip tom="t">TREINO</Chip>}
                {plano !== "treino" && <Chip tom="n">NUTRIÇÃO</Chip>}
              </span>
              <span className="flex items-center gap-2 text-[14px] font-semibold text-texto">
                {ativo && (
                  <span aria-hidden className="flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full bg-[var(--p-violeta)] text-white">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                )}
                {NOME_PLANO[plano]}
              </span>
              <span className="text-[11.5px] leading-snug text-texto-3">{DESCRICAO[plano]}</span>
              <span className="mt-0.5 flex items-baseline gap-1">
                <b className="text-[20px] font-bold tabular-nums tracking-[-0.03em] text-texto">{reais(valor)}</b>
                <span className="text-[11.5px] text-texto-3">{escolha.meses === 12 ? "/ano" : "/mês"}</span>
              </span>
              {ehAtual && <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-texto-3" data-plano-atual>Plano atual</span>}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] font-semibold text-texto-2">Alunos ativos na conta · hoje {alunosAtivos}</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Faixa de alunos">
          {FAIXAS.map((faixa) => {
            const max = maxAlunosDaFaixa(precos, escolha.plano, faixa);
            const cabe = max === null || alunosAtivos <= max;
            const ativo = escolha.faixa === faixa;
            return (
              <button key={faixa} type="button" role="radio" aria-checked={ativo} disabled={!cabe} data-faixa-opcao={faixa}
                onClick={() => aoMudar({ ...escolha, faixa })}
                title={cabe ? undefined : `Os ${alunosAtivos} alunos ativos não cabem nesta faixa`}
                className={cn(
                  "flex flex-col items-start rounded-[14px] border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                  ativo ? "border-violeta/60 bg-superficie-2" : "border-linha bg-superficie-3 hover:border-linha-2",
                )}>
                <span className="text-[12.5px] font-semibold text-texto">{NOME_FAIXA[faixa]}</span>
                <span className="text-[11.5px] tabular-nums text-texto-3">{reais(precoMes(escolha.plano, faixa))}/mês</span>
              </button>
            );
          })}
        </div>
      </div>

      {!semAnual && (
        <div className="flex flex-wrap items-center gap-3">
          <Segmentado
            rotulo="Período"
            opcoes={[{ valor: "1", rotulo: "Mensal" }, { valor: "12", rotulo: "Anual" }]}
            valor={String(escolha.meses) as "1" | "12"}
            aoMudar={(v) => aoMudar({ ...escolha, meses: v === "12" ? 12 : 1 })}
          />
          <span className="text-[12px] text-texto-3">Anual = 10 mensalidades por 12 meses (2 meses grátis).</span>
        </div>
      )}
    </div>
  );
}
