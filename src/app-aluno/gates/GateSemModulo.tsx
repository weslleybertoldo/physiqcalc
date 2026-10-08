import type { ReactNode } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Dumbbell, LayoutDashboard, UserRoundX } from "lucide-react";
import { ehLoja } from "@/lib/distribuicao";
import { useSessao } from "@/nucleo/sessao";
import { ehProfissional } from "@/nucleo/situacao";
import { lembrarArea } from "@/ui/casca/area";
import { TelaTrava } from "./pecas/TelaTrava";

/**
 * Trava do app por módulo (W3, spec 4.3/9 e 11.1):
 *   · sem conta, sem matrícula e sem convite → Boas-vindas (código do profissional ou "sou profissional");
 *   · matrícula sem nenhum módulo (responsáveis removidos, conta sem o módulo) → "Seu profissional ainda não liberou seu
 *     acesso" (os dados ficam guardados);
 *   · W11: só Nutrição entra no app (Dieta · Evolução · Perfil) — a trava "use o site do PhysiqNutri por enquanto" da W3
 *     saiu com a aba Dieta nova (a cobrança a pagar segue na trava de pagamento e em Perfil › Pagamentos).
 * W7: o aluno sem módulo também abre o Perfil (Sair, Exportar, Excluir e o "Tenho um código do meu profissional").
 * W7b: e pode treinar sozinho (Boas-vindas › "Treinar sem profissional", com os dias grátis do plano do app). W1 da loja: na versão
 * da Google Play o "Treinar sem profissional" não existe (a mensalidade do app vai para o Play Billing na W6) — a trava fica sem o botão.
 * Sem a situação (principal fora do ar e nada guardado) não trava: vale o que o Treino sabe.
 */
export default function GateSemModulo({ children }: { children: ReactNode }) {
  const { situacao } = useSessao();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  if (!situacao) return <>{children}</>;
  const noPerfil = pathname === "/perfil" || pathname.startsWith("/perfil/");
  // hml-09 (D7): quem ainda não tem nada também abre o Perfil (Sair, Exportar e Excluir) — antes, o "Entrar para excluir" da
  // /excluir-conta (→ /perfil?excluir=1) caía nas Boas-vindas e a conta não tinha como se excluir
  if (situacao.sem_nada) return noPerfil ? <>{children}</> : <Navigate to="/boas-vindas" replace />;
  const modulos = situacao.modulos_aluno;
  const profissional = ehProfissional(situacao);

  if (modulos.length === 0) {
    if (!profissional && noPerfil) return <>{children}</>;
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
        acoes={ehLoja ? undefined : (
          <button type="button" className="pq-botao pq-botao-g w-full" onClick={() => navigate("/boas-vindas")} data-trava-treinar-sozinho>
            <Dumbbell aria-hidden /> Treinar sem profissional
          </button>
        )}
      />
    );
  }

  return <>{children}</>;
}
