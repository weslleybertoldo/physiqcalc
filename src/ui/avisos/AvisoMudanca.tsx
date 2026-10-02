import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { History, LogIn, Smartphone, Stethoscope, UserRound } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSessao } from "@/nucleo/sessao";
import { useVeioDoNutri } from "@/ui/casca/veioDoNutri";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { Marca } from "@/ui/premium/Marca";

/** O que mudou, por público (os textos do título e do parágrafo vêm de app_config.aviso_mudanca — o master edita). */
const PONTOS: Record<"calc" | "nutri", Array<{ icone: LucideIcon; texto: string }>> = {
  calc: [
    { icone: LogIn, texto: "Você entra com o Google ou com e-mail e senha — a mesma conta de sempre." },
    { icone: History, texto: "Seus treinos, séries e avaliações continuam aqui, com todo o histórico." },
    { icone: Smartphone, texto: "O app agora se chama Physiq e ganha, aos poucos, a dieta e o resto." },
  ],
  // W28 (depois da virada — o aviso do público nutri liga no fim dela): tudo no Physiq
  nutri: [
    { icone: Stethoscope, texto: "Tudo agora fica no Physiq: o consultório, os pacientes, a agenda e as dietas." },
    { icone: UserRound, texto: "Entre com o mesmo e-mail e a mesma senha de sempre (ou o Google)." },
    { icone: Smartphone, texto: "O app do paciente agora é o app Physiq." },
  ],
};

/**
 * Aviso "o Physiq mudou" (NF14, spec 4.2): uma vez por pessoa, com o texto de quem veio do Calc ou do Nutri; liga e
 * desliga em app_config (o painel master ganha a tela na W27). A casca monta sozinha (src/ui/avisos). W28: enquanto a tela
 * "O PhysiqNutri agora é o Physiq" (quem chegou pelo site antigo — src/ui/casca/BoasVindasNutri.tsx) está aberta, espera:
 * as 2 folhas não abrem uma em cima da outra.
 */
export default function AvisoMudanca() {
  const { situacao, marcarAvisoMudanca } = useSessao();
  const celular = useIsMobile();
  const veioDoNutri = useVeioDoNutri();
  const [fechado, setFechado] = useState(false);
  const aviso = situacao?.aviso_mudanca;
  if (!aviso || !aviso.ativo || aviso.visto || fechado || !aviso.titulo || veioDoNutri) return null;
  const pontos = PONTOS[aviso.publico] ?? PONTOS.calc;
  const fechar = () => {
    setFechado(true);
    void marcarAvisoMudanca(aviso.versao || "1");
  };
  return (
    <PainelDeslizante
      aberto
      lado={celular ? "baixo" : "direita"}
      aoMudar={(aberto) => {
        if (!aberto) fechar();
      }}
      titulo={aviso.titulo}
      descricao={aviso.texto ?? undefined}
      rodape={
        <button type="button" className="pq-botao pq-botao-w w-full" onClick={fechar} data-aviso-mudanca-ok>
          Entendi
        </button>
      }
    >
      <div data-aviso-mudanca={aviso.publico} className="flex flex-col gap-3 pt-2">
        <div className="flex justify-center py-2">
          <Marca tamanho={44} />
        </div>
        {pontos.map(({ icone: Icone, texto }) => (
          <div key={texto} className="flex items-start gap-3 rounded-2xl border border-linha bg-superficie px-3.5 py-3">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-linha bg-superficie text-violeta-3">
              <Icone aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.8} />
            </span>
            <span className="pt-1.5 text-[13.5px] leading-relaxed text-texto">{texto}</span>
          </div>
        ))}
      </div>
    </PainelDeslizante>
  );
}
