import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { ConfirmarContexto, type Confirmar, type OpcoesConfirmar } from "./useConfirmar";

interface Pedido {
  opcoes: OpcoesConfirmar;
  responder: (sim: boolean) => void;
}

/** A saída da janela (200 ms, a do AlertDialog) antes do próximo pedido da fila abrir. */
const SAIDA_MS = 200;
/** O botão de perigo no tom rosa (o mesmo do ConfirmarPerigo das Ferramentas). */
const PERIGO = "pq-botao-g !border-[rgba(244,63,94,.4)] !text-rosa-3 hover:!bg-[rgba(244,63,94,.08)]";

/**
 * hml-18a (H-40, B) — o provedor ÚNICO da confirmação (montado no App, fora das rotas): um AlertDialog controlado com os primitivos
 * do shadcn (entra e sai: fundo fade, janela fade + zoom-95, 200 ms) no visual premium. O foco abre no Cancelar (padrão do Radix);
 * Cancelar, Esc e toque fora respondem false. Um pedido por vez: o 2º espera o 1º sair. Enquanto a janela sai, o texto continua o do
 * pedido que fechou (não pisca vazia). O pedido é feito com `useConfirmar()` (src/ui/premium/useConfirmar.ts).
 */
export function ProvedorConfirmar({ children }: { children: ReactNode }) {
  const fila = useRef<Pedido[]>([]);
  const atual = useRef<Pedido | null>(null);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visto, setVisto] = useState<OpcoesConfirmar | null>(null);
  const [aberto, setAberto] = useState(false);

  const abrirProximo = useCallback(() => {
    espera.current = null;
    const p = fila.current.shift();
    if (!p) return;
    atual.current = p;
    setVisto(p.opcoes);
    setAberto(true);
  }, []);

  const confirmar = useCallback<Confirmar>(
    (opcoes) =>
      new Promise<boolean>((responder) => {
        fila.current.push({ opcoes, responder });
        if (!atual.current && !espera.current) abrirProximo();
      }),
    [abrirProximo],
  );

  const responder = useCallback(
    (sim: boolean) => {
      const p = atual.current;
      if (!p) return;
      atual.current = null;
      setAberto(false);
      p.responder(sim);
      if (fila.current.length) espera.current = setTimeout(abrirProximo, SAIDA_MS);
    },
    [abrirProximo],
  );

  // saiu da tela no meio (o App desmontou): ninguém fica esperando para sempre
  useEffect(
    () => () => {
      if (espera.current) clearTimeout(espera.current);
      atual.current?.responder(false);
      for (const p of fila.current.splice(0)) p.responder(false);
      atual.current = null;
    },
    [],
  );

  return (
    <ConfirmarContexto.Provider value={confirmar}>
      {children}
      <AlertDialog open={aberto} onOpenChange={(o) => { if (!o) responder(false); }}>
        <AlertDialogContent
          className="border-linha-2 bg-tela text-texto sm:rounded-[24px]"
          aoTocarFora={() => responder(false)}
          // sem descrição, sem o aria-describedby (senão o Radix avisa no console que falta a descrição)
          {...(visto?.descricao ? {} : { "aria-describedby": undefined })}
          data-confirmar={visto?.perigo ? "perigo" : ""}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto">{visto?.titulo}</AlertDialogTitle>
            {visto?.descricao ? (
              <AlertDialogDescription className="font-body text-[13px] leading-relaxed text-texto-2">{visto.descricao}</AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogPrimitive.Cancel className="pq-botao pq-botao-g pq-botao-sm" data-confirmar-cancelar>
              {visto?.rotuloCancelar ?? "Cancelar"}
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action
              className={cn("pq-botao pq-botao-sm", visto?.perigo ? PERIGO : "pq-botao-w")}
              onClick={() => responder(true)}
              data-confirmar-ok
            >
              {visto?.rotuloConfirmar}
            </AlertDialogPrimitive.Action>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmarContexto.Provider>
  );
}
