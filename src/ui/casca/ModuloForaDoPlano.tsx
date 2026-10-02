import { PackageX } from "lucide-react";
import { Link } from "react-router-dom";

const ROTULO: Record<string, string> = { treino: "Treino", nutricao: "Nutrição" };

/**
 * Rota de um módulo que a conta não tem no plano (spec §9: "Conta perde um módulo" → "Este módulo não está no plano da conta"). Os
 * dados ficam guardados e escondidos; quem é dono muda o plano em Configurações › Plano. W27 (herdado da W26): antes a casca mostrava
 * "Página não encontrada". Vale para as páginas do painel e as abas do aluno.
 */
export function ModuloForaDoPlano({ modulo, ehDono, voltarPara = "/painel" }: { modulo: string; ehDono?: boolean; voltarPara?: string }) {
  const nome = ROTULO[modulo] ?? modulo;
  return (
    <div data-modulo-fora-do-plano={modulo} className="relative flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-linha bg-superficie text-ambar-3">
        <PackageX aria-hidden className="h-[22px] w-[22px]" strokeWidth={1.75} />
      </span>
      <h1 className="font-body text-[22px] font-bold normal-case tracking-[-0.03em] text-texto">Este módulo não está no plano da conta</h1>
      <p className="max-w-md text-[13.5px] text-texto-2">
        O módulo <span className="font-medium text-forte">{nome}</span> não faz parte do plano desta conta. Os dados continuam guardados e voltam a aparecer
        quando o plano tiver o módulo de novo.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {ehDono && <Link to="/painel/configuracoes/plano" className="pq-botao pq-botao-w" data-mudar-plano>Mudar o plano</Link>}
        <Link to={voltarPara} className="pq-botao pq-botao-g">Voltar ao painel</Link>
      </div>
      {!ehDono && <p className="text-[12px] text-texto-3">Quem muda o plano é o dono da conta.</p>}
    </div>
  );
}
