import { ExternalLink, Salad } from "lucide-react";
import { existe } from "@/rotas/registro";
import { useSessao } from "@/nucleo/sessao";
import { SITE_NUTRI } from "@/nucleo/planoLegado";

/**
 * Faixa do topo do app (W3, spec 11.3: "Dieta … mostram 'use o site do PhysiqNutri por enquanto'"): o aluno que tem
 * Treino E Nutrição vê o treino aqui e é lembrado de que a dieta continua no site do PhysiqNutri até a aba Dieta nova
 * (W11) entrar — aí esta faixa some sozinha. (Quem só tem Nutrição cai na trava GateSemModulo.)
 */
export default function AvisoDietaNoNutri() {
  const { situacao } = useSessao();
  const mods = situacao?.modulos_aluno ?? [];
  if (!mods.includes("nutricao") || !mods.includes("treino") || existe("abasApp", "Dieta")) return null;
  // W7b: a Nutrição do aluno sem profissional (Treino + Alimentação) são os pratos prontos do app, não uma dieta do Nutri
  const dietaDeNutri = (situacao?.matriculas ?? []).some((m) => m.modulos.includes("nutricao") && !m.app);
  if (!dietaDeNutri) return null;
  return (
    <div data-aviso-dieta-nutri className="flex items-center gap-3 rounded-[18px] border border-verde/30 px-3.5 py-3 text-[13px]"
      style={{ background: "linear-gradient(90deg, var(--p-chip-n-fundo), transparent)" }}>
      <Salad aria-hidden className="h-5 w-5 flex-none text-verde-3" strokeWidth={1.8} />
      <span className="min-w-0 flex-1 text-texto">
        <b className="block font-semibold">Sua dieta continua no PhysiqNutri</b>
        <span className="text-texto-2">Use o site do PhysiqNutri por enquanto.</span>
      </span>
      <a href={`${SITE_NUTRI}/app/entrar`} target="_blank" rel="noopener noreferrer" className="pq-botao pq-botao-g pq-botao-sm flex-none">
        <ExternalLink aria-hidden /> Abrir
      </a>
    </div>
  );
}
