import { Component, type ErrorInfo, type ReactNode } from "react";
import { EstadoErro } from "@/ui/premium/Estados";

/**
 * Limite de erro local das cascas: uma tela/aba/card que quebra mostra "Não deu para carregar" com
 * "Tentar de novo" no próprio lugar — o menu, a barra de abas e o resto da página continuam.
 * `silencioso` = some sem mostrar nada (avisos globais, contadores).
 */
export class LimiteDeErro extends Component<{ children: ReactNode; silencioso?: boolean; nome?: string }, { erro: Error | null }> {
  state = { erro: null as Error | null };

  static getDerivedStateFromError(erro: Error) {
    return { erro };
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error(`[casca] ${this.props.nome ?? "tela"} quebrou:`, erro, info.componentStack);
  }

  render() {
    if (!this.state.erro) return this.props.children;
    if (this.props.silencioso) return null;
    // chunk velho depois de um deploy (a tela foi publicada de novo): recarregar resolve
    const chunk = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(this.state.erro.message);
    return (
      <EstadoErro
        titulo={chunk ? "Tem versão nova do Physiq" : "Não deu para abrir esta parte"}
        texto={chunk ? "Toque em tentar de novo para carregar a versão atual." : this.state.erro.message || "Erro inesperado."}
        aoTentar={() => (chunk ? window.location.reload() : this.setState({ erro: null }))}
      />
    );
  }
}
