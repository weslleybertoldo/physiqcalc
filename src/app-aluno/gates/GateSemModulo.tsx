import type { ReactNode } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ExternalLink, LayoutDashboard, Salad, UserRoundX } from "lucide-react";
import { existe } from "@/rotas/registro";
import { useSessao } from "@/nucleo/sessao";
import { ehProfissional } from "@/nucleo/situacao";
import { SITE_NUTRI } from "@/nucleo/planoLegado";
import { lembrarArea } from "@/ui/casca/area";
import { TelaTrava } from "./pecas/TelaTrava";

/**
 * Trava do app por módulo (W3, spec 4.3/9 e 11.1):
 *   · sem conta, sem matrícula e sem convite → Boas-vindas (código do profissional ou "sou profissional");
 *   · matrícula sem nenhum módulo (responsáveis removidos, conta sem o módulo) → "Seu profissional ainda não liberou seu
 *     acesso" (os dados ficam guardados);
 *   · só Nutrição e a aba Dieta nova ainda não chegou (W11) → "use o site do PhysiqNutri por enquanto".
 * Sem a situação (principal fora do ar e nada guardado) não trava: vale o que o Treino sabe.
 */
export default function GateSemModulo({ children }: { children: ReactNode }) {
  const { situacao } = useSessao();
  const navigate = useNavigate();
  if (!situacao) return <>{children}</>;
  if (situacao.sem_nada) return <Navigate to="/boas-vindas" replace />;
  const modulos = situacao.modulos_aluno;
  const profissional = ehProfissional(situacao);

  if (modulos.length === 0) {
    return profissional ? (
      <TelaTrava
        marca="sem-modulo-profissional"
        icone={UserRoundX}
        tom="var(--p-texto-2)"
        titulo="Você ainda não é aluno no Physiq"
        texto="Este é o app do aluno. Quando um profissional te matricular, o seu treino e a sua dieta aparecem aqui."
        acoes={
          <button type="button" className="pq-botao pq-botao-w w-full" onClick={() => { lembrarArea("painel"); navigate("/painel"); }}>
            <LayoutDashboard aria-hidden /> Voltar ao painel
          </button>
        }
      />
    ) : (
      <TelaTrava
        marca="sem-modulo"
        icone={UserRoundX}
        tom="var(--p-ambar-3)"
        titulo="Seu profissional ainda não liberou seu acesso"
        texto="Assim que ele liberar o treino ou a dieta, tudo aparece aqui. O que você já tinha continua guardado."
      />
    );
  }

  if (!modulos.includes("treino") && !existe("abasApp", "Dieta")) {
    return (
      <TelaTrava
        marca="use-o-nutri"
        icone={Salad}
        tom="var(--p-verde-3)"
        titulo="Sua dieta continua no PhysiqNutri por enquanto"
        texto="O Physiq está juntando tudo num app só. Enquanto a dieta não chega aqui, use o site do PhysiqNutri — com o mesmo e-mail e senha."
        acoes={
          <a href={`${SITE_NUTRI}/app/entrar`} target="_blank" rel="noopener noreferrer" className="pq-botao pq-botao-w w-full">
            <ExternalLink aria-hidden /> Abrir o PhysiqNutri
          </a>
        }
      />
    );
  }
  return <>{children}</>;
}
