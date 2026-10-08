import { Component, ErrorInfo, ReactNode } from "react";
import { avisarErro } from "@/lib/avisoDeErro";
import { linkDoSuporte } from "@/nucleo/suporte";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorCount: number;
  /** O código do aviso (8 hex: src/lib/avisoDeErro.ts) — a tela mostra e o suporte usa para achar o aviso. */
  codigo: string | null;
}

/**
 * A tela de erro geral (o app inteiro quebrou). hml-10 (H-26 e H-48, D5 · S1): texto fixo + o código do aviso; a message do erro
 * não aparece mais (podia trazer dado do banco ou da pessoa). O erro vira 1 aviso ao Weslley (avisarErro) com o lugar "tela inteira".
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, errorCount: 0, codigo: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo.componentStack);
    this.setState({ codigo: avisarErro({ origem: "tela", mensagem: error, lugar: "tela inteira" }) });
  }

  handleReset = () => {
    this.setState((prev) => ({
      hasError: false,
      error: null,
      errorCount: prev.errorCount + 1,
      codigo: null,
    }));
  };

  handleFullReset = () => {
    // Limpa caches mas preserva fila offline
    Object.keys(localStorage)
      .filter(
        (k) =>
          k.startsWith("physiq_offline_cache") ||
          k.startsWith("physiq_profile_") ||
          k.startsWith("physiq_treino_")
      )
      .forEach((k) => localStorage.removeItem(k));
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const { codigo } = this.state;
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6" data-tela-erro="geral">
          <div className="text-center max-w-sm">
            <h2 className="text-xl font-heading font-bold text-foreground mb-2">
              Algo deu errado
            </h2>
            <p className="text-sm text-muted-foreground mb-2">
              Já recebemos o aviso. Tente de novo; se continuar, fale com o suporte.
            </p>
            {codigo && (
              <p className="text-xs text-muted-foreground mb-6" data-codigo-erro={codigo}>
                Código: <span className="font-mono text-foreground">{codigo}</span>
              </p>
            )}
            <div className="flex flex-col gap-3">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-heading text-sm uppercase tracking-wider"
              >
                Tentar novamente
              </button>
              {this.state.errorCount >= 2 && (
                <button
                  onClick={this.handleFullReset}
                  className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg font-heading text-sm uppercase tracking-wider"
                >
                  Reiniciar app
                </button>
              )}
              <a
                href={linkDoSuporte(codigo ? `Erro no Physiq · código ${codigo}` : "Erro no Physiq")}
                className="px-4 py-2 border border-border text-muted-foreground hover:text-foreground rounded-lg font-heading text-sm uppercase tracking-wider transition-colors"
              >
                Falar com o suporte
              </a>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
