import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorCount: number;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, errorCount: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo.componentStack);
  }

  handleReset = () => {
    this.setState((prev) => ({
      hasError: false,
      error: null,
      errorCount: prev.errorCount + 1,
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
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="text-center max-w-sm">
            <h2 className="text-xl font-heading font-bold text-foreground mb-2">
              Algo deu errado
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              {this.state.error?.message || "Erro inesperado"}
            </p>
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
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
