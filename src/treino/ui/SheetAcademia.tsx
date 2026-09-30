import SeletorAcademia from "@/components/treinos/SeletorAcademia";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import type { Academia } from "../tipos";

/**
 * Academia do treino (C17/C73 — cargas por academia): a escolha de hoje (trocar, criar, "Salvar treino" com os pesos) no
 * seletor que já existe — a W9 soma nele os equipamentos da academia (filtro da troca por equivalente).
 */
export function SheetAcademia({
  aberto,
  aoMudar,
  userId,
  academia,
  trocaBloqueada,
  aoTrocar,
  aoSalvar,
  aoCriada,
}: {
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  userId: string;
  academia: Academia | null;
  trocaBloqueada: boolean;
  aoTrocar: (a: Academia) => Promise<void>;
  aoSalvar: (a: Academia) => Promise<void>;
  aoCriada: (a: Academia) => void;
}) {
  return (
    <PainelDeslizante aberto={aberto} aoMudar={aoMudar} titulo="Academia"
      descricao="Os pesos ficam guardados por academia: trocando, as cargas de hoje viram as salvas nela.">
      <div className="pt-1 [&_.result-card]:mb-0" data-sheet-academia>
        <SeletorAcademia userId={userId} academiaAtual={academia} onTrocar={aoTrocar} onSalvar={aoSalvar} onCriada={aoCriada} trocaBloqueada={trocaBloqueada} />
      </div>
    </PainelDeslizante>
  );
}
