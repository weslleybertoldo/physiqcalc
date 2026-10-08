import { Component, type ErrorInfo, type ReactNode } from "react";
import { avisarErro } from "@/lib/avisoDeErro";
import { EstadoErro } from "@/ui/premium/Estados";

/**
 * Limite de erro local das cascas: uma tela/aba/card que quebra mostra "Não deu para abrir esta parte" com
 * "Tentar de novo" no próprio lugar — o menu, a barra de abas e o resto da página continuam.
 * `silencioso` = some sem mostrar nada (avisos globais, contadores).
 * hml-10 (H-26 e H-48, D5 · S2): o texto é fixo, com o código do aviso (a message do erro não aparece mais: podia trazer dado do
 * banco ou da pessoa), e todo erro pego aqui — inclusive nos silenciosos — vira 1 aviso ao Weslley (avisarErro, com o `nome` como
 * o lugar). O chunk velho continua com a tela dele (o avisarErro não manda esse).
 */
export class LimiteDeErro extends Component<{ children: ReactNode; silencioso?: boolean; nome?: string }, { erro: Error | null; codigo: string | null }> {
  state = { erro: null as Error | null, codigo: null as string | null };

  static getDerivedStateFromError(erro: Error) {
    return { erro };
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error(`[casca] ${this.props.nome ?? "tela"} quebrou:`, erro, info.componentStack);
    this.setState({ codigo: avisarErro({ origem: "tela", mensagem: erro, lugar: this.props.nome ?? "parte da tela" }) });
  }

  render() {
    if (!this.state.erro) return this.props.children;
    if (this.props.silencioso) return null;
    // chunk velho depois de um deploy (a tela foi publicada de novo): recarregar resolve
    const chunk = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(this.state.erro.message);
    const { codigo } = this.state;
    return (
      <EstadoErro
        titulo={chunk ? "Tem versão nova do Physiq" : "Não deu para abrir esta parte"}
        texto={
          chunk ? (
            "Toque em tentar de novo para carregar a versão atual."
          ) : codigo ? (
            <>
              Tente de novo. Se continuar, fale com o suporte (código{" "}
              <span data-codigo-erro={codigo} className="font-mono text-texto">
                {codigo}
              </span>
              ).
            </>
          ) : (
            "Tente de novo. Se continuar, fale com o suporte."
          )
        }
        aoTentar={() => (chunk ? window.location.reload() : this.setState({ erro: null, codigo: null }))}
      />
    );
  }
}
