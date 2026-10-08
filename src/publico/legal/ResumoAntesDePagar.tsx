import { Link } from "react-router-dom";
import { FileText } from "lucide-react";
import { resumoDaAssinatura } from "./assinatura";
import { ListaLegal } from "./TextoLegal";
import { ROTA_ASSINATURA, ROTA_POLITICA } from "./versao";

/** As 3 telas em que o Physiq vende (o pagamento ao profissional não é venda do Physiq e não tem resumo). */
export type TelaQueVende = "plano-profissional" | "sem-profissional" | "meu-plano";

const CLASSE_LINK = "font-semibold text-violeta-3 underline-offset-2 hover:underline";

/**
 * hml-11 (H-28, D5) — o resumo dos Termos de assinatura ANTES de pagar (Decreto 7.962/2013, art. 4º, I: o sumário do contrato antes
 * de contratar, com destaque nas cláusulas que limitam direitos — o negrito do próprio texto). Os itens são a seção "Resumo" de
 * assinatura.ts, sem o bloco do outro público, e os links abrem os documentos completos em outra aba (o pagamento fica onde está).
 * Entra SÓ no build de staging até a virada (cada tela o importa com a condição do Vite direto no `lazy`) e nunca na versão da
 * Google Play (`ehLoja`: lá não há pagamento) nem no pagamento ao profissional.
 */
export default function ResumoAntesDePagar({ tela }: { tela: TelaQueVende }) {
  const itens = resumoDaAssinatura(tela === "plano-profissional" ? "profissional" : "aluno");
  return (
    <section aria-label="Resumo dos Termos de assinatura" className="rounded-2xl border border-linha bg-superficie-3 px-4 py-3.5" data-resumo-antes-de-pagar={tela}>
      <h3 className="flex items-center gap-2 font-body text-[13.5px] font-semibold normal-case tracking-[-0.01em] text-texto">
        <FileText aria-hidden className="h-4 w-4 flex-none text-violeta-3" />
        Antes de pagar, o resumo dos Termos de assinatura
      </h3>
      <div className="mt-2 text-[13px] leading-relaxed text-texto-2">
        <ListaLegal itens={itens} links={{ novaAba: true }} />
      </div>
      <p className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
        <Link to={ROTA_ASSINATURA} target="_blank" rel="noopener" className={CLASSE_LINK} data-link-legal="assinatura">
          Termos de assinatura
        </Link>
        <Link to={ROTA_POLITICA} target="_blank" rel="noopener" className={CLASSE_LINK} data-link-legal="politica">
          Política de Privacidade
        </Link>
      </p>
    </section>
  );
}
