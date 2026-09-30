import type { ReactNode } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Dumbbell, ExternalLink, LayoutDashboard, Salad, UserRoundX, Wallet } from "lucide-react";
import { faixaDoAluno } from "@/financeiro/regras";
import { useResumoFinanceiro } from "@/financeiro/useResumoFinanceiro";
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
 *   · só Nutrição e a aba Dieta nova ainda não chegou (W11) → "use o site do PhysiqNutri por enquanto" — menos o Perfil
 *     (W7: Agenda, Pagamentos — W6, R16 —, Conta, Aparência, Exportar e Excluir); com cobrança a pagar, a trava mostra "Pagar".
 * W7: o aluno sem módulo também abre o Perfil (Sair, Exportar, Excluir e o "Tenho um código do meu profissional").
 * W7b: e pode treinar sozinho (Boas-vindas › "Treinar sem profissional", com os dias grátis do plano do app).
 * Sem a situação (principal fora do ar e nada guardado) não trava: vale o que o Treino sabe.
 */
export default function GateSemModulo({ children }: { children: ReactNode }) {
  const { situacao } = useSessao();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const soNutri = !!situacao && !situacao.sem_nada && situacao.modulos_aluno.length > 0 && !situacao.modulos_aluno.includes("treino") && !existe("abasApp", "Dieta");
  const { resumo } = useResumoFinanceiro({ ativo: soNutri, atrasoMs: 300 });
  if (!situacao) return <>{children}</>;
  if (situacao.sem_nada) return <Navigate to="/boas-vindas" replace />;
  const modulos = situacao.modulos_aluno;
  const profissional = ehProfissional(situacao);

  const noPerfil = pathname === "/perfil" || pathname.startsWith("/perfil/");

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
        acoes={
          <button type="button" className="pq-botao pq-botao-g w-full" onClick={() => navigate("/boas-vindas")} data-trava-treinar-sozinho>
            <Dumbbell aria-hidden /> Treinar sem profissional
          </button>
        }
      />
    );
  }

  if (soNutri) {
    if (noPerfil) return <>{children}</>;
    const f = faixaDoAluno(resumo);
    const pagar = f?.podePagar ? (f.alvo.tipo === "avulsa" ? `/perfil/pagamentos?pagar=${f.alvo.id}` : "/perfil/pagamentos?pagar=mensalidade") : null;
    return (
      <TelaTrava
        marca="use-o-nutri"
        icone={Salad}
        tom="var(--p-verde-3)"
        titulo="Sua dieta continua no PhysiqNutri por enquanto"
        texto="O Physiq está juntando tudo num app só. Enquanto a dieta não chega aqui, use o site do PhysiqNutri — com o mesmo e-mail e senha."
        acoes={
          <>
            {f && pagar && (
              <>
                <p className={`rounded-2xl border px-3.5 py-2.5 text-left text-[12.5px] font-semibold text-texto ${f.tom === "r" ? "border-[var(--p-chip-r-borda)] bg-[var(--p-chip-r-fundo)]" : "border-[rgba(245,158,11,.26)] bg-[var(--p-chip-a-fundo)]"}`} data-trava-cobranca>
                  {f.titulo}
                  <span className="mt-px block text-[12px] font-medium text-texto-2">{f.subtitulo}</span>
                </p>
                <button type="button" className="pq-botao pq-botao-w w-full" onClick={() => navigate(pagar)} data-trava-pagar>
                  <Wallet aria-hidden /> Pagar
                </button>
              </>
            )}
            <a href={`${SITE_NUTRI}/app/entrar`} target="_blank" rel="noopener noreferrer" className={`pq-botao ${pagar ? "pq-botao-g" : "pq-botao-w"} w-full`}>
              <ExternalLink aria-hidden /> Abrir o PhysiqNutri
            </a>
            {!pagar && (
              <button type="button" className="pq-botao pq-botao-g w-full" onClick={() => navigate("/perfil/pagamentos")} data-trava-pagamentos>
                <Wallet aria-hidden /> Pagamentos
              </button>
            )}
          </>
        }
      />
    );
  }
  return <>{children}</>;
}
