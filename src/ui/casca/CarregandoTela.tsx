import { Marca } from "@/ui/premium/Marca";

/** Abertura/carregamento de tela inteira no visual premium (no lugar do "Carregando..." solto). */
export function CarregandoTela({ texto = "Carregando" }: { texto?: string }) {
  return (
    <div role="status" aria-live="polite" data-carregando-tela className="relative isolate flex min-h-screen flex-col items-center justify-center gap-5">
      <div aria-hidden className="pq-halo-app pointer-events-none fixed inset-0" />
      <div className="relative animate-pulse">
        <Marca tamanho={44} soIcone />
      </div>
      <p className="relative text-[13px] font-medium text-texto-2">{texto}…</p>
    </div>
  );
}
