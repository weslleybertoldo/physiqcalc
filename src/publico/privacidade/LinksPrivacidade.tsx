import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ESTADO_ABERTA_PELO_APP } from "./textos";

const CLASSE_LINK = "inline-flex min-h-8 items-center font-medium text-texto-3 underline-offset-2 transition-colors hover:text-texto-2 hover:underline";

/**
 * "Política de privacidade · Termos de uso" de dentro do app (W3 da loja — antes o link só aparecia na entrada, em
 * src/entrada/pecas/Moldura.tsx): no rodapé do Perfil do aluno e no rodapé das Configurações do profissional. Abre a página pública
 * na mesma janela — igual no site, no APK e na versão da Google Play — com o `state` que faz o "Voltar" dela voltar para cá.
 */
export function LinksPrivacidade({ className }: { className?: string }) {
  return (
    <nav aria-label="Privacidade e termos" className={cn("flex flex-wrap items-center gap-x-2 text-[12px]", className)} data-links-privacidade>
      <Link to="/privacidade" state={ESTADO_ABERTA_PELO_APP} className={CLASSE_LINK} data-link-privacidade>
        Política de privacidade
      </Link>
      <span aria-hidden className="text-texto-4">·</span>
      <Link to="/termos" state={ESTADO_ABERTA_PELO_APP} className={CLASSE_LINK} data-link-termos>
        Termos de uso
      </Link>
    </nav>
  );
}
