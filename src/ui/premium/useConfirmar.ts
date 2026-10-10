import { createContext, useContext, type ReactNode } from "react";

/**
 * hml-18a (H-40, B) — a confirmação do app no lugar do `window.confirm` (o diálogo nativo congela o WebView, abre e fecha "seco" e
 * tem o visual do navegador). O provedor (`ProvedorConfirmar`, src/ui/premium/Confirmar.tsx) fica montado uma vez no App; as telas
 * pedem pela promessa:
 *
 *   const confirmar = useConfirmar();
 *   if (!(await confirmar({ titulo: "Excluir o treino?", descricao: "…", rotuloConfirmar: "Excluir", perigo: true }))) return;
 *
 * true = a pessoa tocou no botão de confirmar; false = Cancelar, Esc (o "voltar" do Android) ou toque fora.
 */
export interface OpcoesConfirmar {
  titulo: string;
  descricao?: ReactNode;
  /** O verbo da ação ("Excluir", "Tirar do dia"…) — nunca "OK". */
  rotuloConfirmar: string;
  /** Ação que apaga, cancela ou estorna: o botão em rosa. */
  perigo?: boolean;
  /** Padrão "Cancelar"; troque quando a própria ação é "cancelar algo" (ex.: "Voltar"). */
  rotuloCancelar?: string;
}

export type Confirmar = (opcoes: OpcoesConfirmar) => Promise<boolean>;

export const ConfirmarContexto = createContext<Confirmar | null>(null);

const semProvedor: Confirmar = () => Promise.reject(new Error("useConfirmar: falta o <ProvedorConfirmar> em volta da tela (src/App.tsx)"));

/** O pedido de confirmação do app (Promise<boolean>). Sem o provedor (um teste que não montou), o pedido falha alto. */
export function useConfirmar(): Confirmar {
  return useContext(ConfirmarContexto) ?? semProvedor;
}
