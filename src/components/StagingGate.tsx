import type { ReactNode } from "react";
import { FlaskConical, LogOut } from "lucide-react";
import { DB_SCHEMA } from "@/integrations/supabase/client";
import { emailDeTeste } from "@/nucleo/contasTeste";
import { useSessao } from "@/nucleo/sessao";
import { Cartao } from "@/ui/premium/Cartao";
import { Marca } from "@/ui/premium/Marca";

/**
 * O staging é ambiente de TESTE (P26): o Auth dos 2 bancos é compartilhado com a produção, então só entram as contas de
 * teste (src/nucleo/contasTeste.ts — a mesma regra da troca de token e do pos-login). Conta real cai nesta tela e não
 * opera nada.
 */
const StagingGate = ({ children }: { children: ReactNode }) => {
  const { usuario, sair } = useSessao();
  if (DB_SCHEMA !== "staging" || !usuario || emailDeTeste(usuario.email)) return <>{children}</>;

  return (
    <div data-staging-bloqueado className="relative isolate flex min-h-screen items-center justify-center px-5">
      <div aria-hidden className="pq-halo-app pointer-events-none fixed inset-0 -z-10" />
      <Cartao brilho className="flex w-full max-w-sm flex-col items-center gap-4 px-6 py-8 text-center">
        <Marca tamanho={40} soIcone />
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-linha bg-superficie text-ambar-3">
          <FlaskConical aria-hidden className="h-5 w-5" strokeWidth={1.8} />
        </span>
        <h1 className="font-body text-[18px] font-semibold normal-case tracking-[-0.02em] text-texto">Ambiente de teste</h1>
        <p className="text-[13.5px] leading-relaxed text-texto-2">
          Esta conta é de produção e não entra no ambiente de teste. Use uma conta de teste ou abra o app oficial em physiqcalc.com.br.
        </p>
        <button type="button" onClick={() => void sair()} className="pq-botao pq-botao-g">
          <LogOut aria-hidden />
          Sair
        </button>
      </Cartao>
    </div>
  );
};

export default StagingGate;
