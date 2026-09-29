import { Dumbbell, RefreshCw, Unplug, UserRoundSearch } from "lucide-react";
import { useSessao } from "@/nucleo/sessao";
import type { ErroTroca } from "@/nucleo/trocaToken";
import { Botao } from "@/ui/premium/Botao";
import { Cartao } from "@/ui/premium/Cartao";
import { EstadoCarregando } from "@/ui/premium/Estados";
import { MENSAGEM_TREINO_PAINEL, type TreinoDaPagina } from "./treinoDaPagina";

/** O estado da página do Treino sem a sessão dele (W5): carregando, erro com "Tentar de novo" ou "é do módulo Treino". */
const SEM_TENTAR: ErroTroca[] = ["conflito", "staging", "email", "invalido"];

export function SemConexaoTreino({ estado }: { estado: Exclude<TreinoDaPagina, { tipo: "ok" }> }) {
  const { tentarTreinoDeNovo } = useSessao();
  if (estado.tipo === "carregando") {
    return (
      <div data-sem-treino="carregando">
        <EstadoCarregando linhas={3} rotulo="Conectando ao Treino" />
      </div>
    );
  }
  if (estado.tipo === "sem-papel") {
    return (
      <Cartao data-sem-treino="sem-papel" className="mx-auto mt-4 flex max-w-lg flex-col items-center gap-3 px-6 py-8 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-linha bg-superficie text-violeta-3">
          <Dumbbell aria-hidden className="h-[22px] w-[22px]" strokeWidth={1.75} />
        </span>
        <h2 className="font-body text-[16px] font-semibold normal-case tracking-[-0.01em] text-texto">Esta página é do módulo Treino</h2>
        <p className="max-w-sm text-[13.5px] leading-relaxed text-texto-2">
          Ela abre para quem é personal nesta conta. A sua parte chega aqui nas próximas versões do painel — as Configurações já
          funcionam.
        </p>
      </Cartao>
    );
  }
  const conflito = estado.erro === "conflito";
  const podeTentar = !SEM_TENTAR.includes(estado.erro);
  return (
    <Cartao brilho data-sem-treino={estado.erro} className="mx-auto mt-4 flex max-w-lg flex-col items-center gap-3 px-6 py-8 text-center">
      <span className={`flex h-12 w-12 items-center justify-center rounded-2xl border border-linha bg-superficie ${conflito ? "text-ambar-3" : "text-rosa-3"}`}>
        {conflito ? <UserRoundSearch aria-hidden className="h-[22px] w-[22px]" strokeWidth={1.75} /> : <Unplug aria-hidden className="h-[22px] w-[22px]" strokeWidth={1.75} />}
      </span>
      <h2 className="font-body text-[16px] font-semibold normal-case tracking-[-0.01em] text-texto">
        {conflito ? "Sua conta precisa de uma conferência" : "Sem conexão com o Treino"}
      </h2>
      <p className="max-w-sm text-[13.5px] leading-relaxed text-texto-2">{MENSAGEM_TREINO_PAINEL[estado.erro]}</p>
      {podeTentar && (
        <Botao variante="g" tamanho="sm" icone={RefreshCw} onClick={tentarTreinoDeNovo} data-sem-treino-tentar>
          Tentar de novo
        </Botao>
      )}
      <p className="text-[12px] text-texto-3">O resto do painel (Configurações, Plano, Equipe) continua funcionando.</p>
    </Cartao>
  );
}
