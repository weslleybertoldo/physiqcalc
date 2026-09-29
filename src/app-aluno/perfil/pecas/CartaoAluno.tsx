import { Dumbbell, Salad } from "lucide-react";
import type { Modulo } from "@/ui/casca/dadosCasca";
import { Avatar } from "@/ui/premium/Avatar";
import { Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { Esqueleto } from "@/ui/premium/Estados";

/** Card do aluno (tela 5, `.pf`): foto 62, nome, "Aluno desde… · Objetivo: …" e os chips TREINO / NUTRIÇÃO pelos módulos. */
export function CartaoAluno({
  nome,
  foto,
  linha,
  modulos,
  carregando,
}: {
  nome: string;
  foto: string | null;
  linha: string;
  modulos: readonly Modulo[];
  carregando?: boolean;
}) {
  return (
    <Cartao brilho data-perfil-cartao className="mt-1 flex min-h-[90px] items-center gap-3.5 px-3.5 py-[13px]">
      <Avatar src={foto} nome={nome} tamanho={62} />
      <div className="min-w-0 flex-1">
        <b className="block truncate text-[18px] font-bold tracking-[-0.02em] text-texto" data-perfil-nome>{nome}</b>
        {carregando && !linha ? (
          <Esqueleto className="mb-2 mt-1.5 h-3 w-3/4" />
        ) : (
          linha && <div className="mb-[7px] mt-0.5 truncate text-[12px] text-texto-2" data-perfil-linha>{linha}</div>
        )}
        {modulos.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5" data-perfil-modulos>
            {modulos.includes("treino") && <Chip tom="t" icone={Dumbbell}>TREINO</Chip>}
            {modulos.includes("nutricao") && <Chip tom="n" icone={Salad}>NUTRIÇÃO</Chip>}
          </div>
        )}
      </div>
    </Cartao>
  );
}
