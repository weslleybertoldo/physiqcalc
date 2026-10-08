import { Link } from "react-router-dom";
import { RefreshCw, ShieldAlert, UserRoundX } from "lucide-react";
import { TelaTrava } from "@/app-aluno/gates/pecas/TelaTrava";
import { useSessao } from "@/nucleo/sessao";
import type { MenorSituacao } from "@/nucleo/situacao";
import { destinoDaExclusao } from "@/painel/configuracoes/excluirConta/regras";
import { useOnline } from "@/ui/premium/useOnline";

const TEXTOS: Record<MenorSituacao, { titulo: string; texto: string; icone: typeof ShieldAlert; tom: string }> = {
  menor_16: {
    titulo: "O Physiq é para quem tem 16 anos ou mais",
    texto:
      "Pela data de nascimento do seu cadastro, esta conta não pode usar o Physiq. Se a data estiver errada, fale com o seu profissional.",
    icone: UserRoundX,
    tom: "var(--p-rosa-3)",
  },
  sem_responsavel: {
    titulo: "Falta a autorização do seu responsável",
    texto:
      "Você tem 16 ou 17 anos. Para usar o Physiq, o seu profissional precisa registrar o consentimento de um dos seus pais ou do seu responsável legal. Fale com ele.",
    icone: ShieldAlert,
    tom: "var(--p-ambar-3)",
  },
};

/**
 * hml-12 (H-30, P6) — a trava de idade: a matrícula de profissional com menos de 16 anos (Termos §11: a conta é suspensa), ou de 16
 * a 17 sem o consentimento do responsável registrado na ficha (o app fica fechado até o profissional registrar). Vale mesmo sem
 * internet (é o cache da situação). Na TelaTrava das travas do app (que já tem o Sair), com o Excluir minha conta e, com internet, o
 * "Conferir de novo" (o profissional registrou o responsável ou corrigiu a data → a situação nova abre a porta; molde GateAcessoApp).
 */
export default function TelaMenor({ motivo }: { motivo: MenorSituacao }) {
  const { situacao, recarregarSituacao } = useSessao();
  const online = useOnline();
  const t = TEXTOS[motivo];
  return (
    <div data-tela-menor={motivo} className="relative isolate min-h-screen">
      <div aria-hidden className="pq-halo-app pointer-events-none fixed inset-0 -z-10" />
      <TelaTrava
        marca={`idade-${motivo}`}
        icone={t.icone}
        tom={t.tom}
        titulo={t.titulo}
        texto={t.texto}
        acoes={
          <>
            {online && (
              <button type="button" className="pq-botao pq-botao-g w-full" onClick={() => void recarregarSituacao()} data-tela-menor-conferir>
                <RefreshCw aria-hidden /> Conferir de novo
              </button>
            )}
            <Link to={destinoDaExclusao(situacao)} className="pq-botao pq-botao-g w-full" data-aceite-excluir>
              Excluir minha conta
            </Link>
          </>
        }
      />
    </div>
  );
}
