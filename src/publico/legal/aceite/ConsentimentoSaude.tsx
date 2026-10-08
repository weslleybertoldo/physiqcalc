import { Link } from "react-router-dom";
import { HeartPulse } from "lucide-react";
import { CONTATO_SUPORTE, linkDoSuporte } from "@/nucleo/suporte";
import { ESTADO_ABERTA_PELO_APP } from "@/publico/privacidade/textos";
import { ROTA_POLITICA, VERSAO_TEXTOS } from "../versao";
import { origemDoAceite, type OrigemDoAceite } from "./regras";

/** O consentimento dado: a versão do texto que a pessoa leu e de onde veio (vão para o banco junto com o pedido). */
export interface ConsentimentoDado {
  versao: string;
  origem: OrigemDoAceite;
}

export type VarianteConsentimento = "app" | "preconsulta";

const CLASSE_LINK = "font-semibold text-violeta-3 underline-offset-2 hover:underline";

/**
 * hml-12 (H-30, H8) — o consentimento do dado de saúde, específico e em destaque (LGPD, art. 11, I), separado do aceite dos Termos:
 * - `app`: o aluno sem profissional (Treinar sem profissional e a tela do aceite do aluno do app que ainda não consentiu);
 * - `preconsulta`: quem responde a pré-consulta pelo link /f/ (sem login: o consentimento vai na própria resposta).
 * Diz para que serve o dado, que não vai para publicidade, como retirar e o que acontece sem ele (Política §4 e §10). A caixa é
 * controlada por quem chama; marcar devolve a versão do texto (VERSAO_TEXTOS) e a origem, que vão com o pedido. Entra só no build de
 * staging até a virada (quem está fora de src/publico/legal/ a carrega com o `lazy` atrás da condição do Vite).
 */
export default function ConsentimentoSaude({
  variante,
  marcado,
  aoMudar,
  profissional,
  novaAba = true,
  desabilitado,
}: {
  variante: VarianteConsentimento;
  marcado: boolean;
  aoMudar: (consentimento: ConsentimentoDado | null) => void;
  /** preconsulta: quem recebe as respostas (o nome do formulário); sem ele, "o seu profissional". */
  profissional?: string | null;
  /** o link da Política em outra aba (o formulário fica onde está) ou na mesma janela, com o Voltar do app (a tela do aceite) */
  novaAba?: boolean;
  desabilitado?: boolean;
}) {
  const quem = profissional?.trim() || null;
  const email = (
    <a href={linkDoSuporte("Consentimento dos dados de saúde")} className={CLASSE_LINK}>
      {CONTATO_SUPORTE}
    </a>
  );
  const politica = novaAba ? (
    <Link to={ROTA_POLITICA} target="_blank" rel="noopener" className={CLASSE_LINK} data-consentimento-politica>
      Política de Privacidade
    </Link>
  ) : (
    <Link to={ROTA_POLITICA} state={ESTADO_ABERTA_PELO_APP} className={CLASSE_LINK} data-consentimento-politica>
      Política de Privacidade
    </Link>
  );

  return (
    <section
      aria-label="Seus dados de saúde"
      className="flex flex-col gap-2.5 rounded-2xl border border-ambar/40 px-4 py-3.5"
      style={{ background: "linear-gradient(90deg, var(--p-chip-a-fundo), transparent)" }}
      data-consentimento-saude={variante}
    >
      <h3 className="flex items-center gap-2 font-body text-[14px] font-semibold normal-case tracking-[-0.01em] text-texto">
        <HeartPulse aria-hidden className="h-4 w-4 flex-none text-ambar-3" strokeWidth={1.9} />
        Seus dados de saúde
      </h3>
      {variante === "app" ? (
        <p className="text-[13px] leading-relaxed text-texto-2">
          No plano sem profissional, o Physiq guarda os dados de saúde que você registra (peso, medidas, fotos de avaliação, treino e
          alimentação) só para montar e acompanhar o seu treino. Nunca para publicidade. Você pode retirar este consentimento quando
          quiser, pelo e-mail {email}; sem ele, o plano sem profissional não funciona. Mais na {politica}.
        </p>
      ) : (
        <p className="text-[13px] leading-relaxed text-texto-2">
          As respostas desta pré-consulta são dados de saúde. Elas vão só para {quem ?? "o seu profissional"}, que as usa para preparar
          o seu atendimento, e o Physiq as guarda para ele. Nunca para publicidade. Você pode retirar este consentimento quando quiser,
          pelo e-mail {email}; sem ele, as respostas não são enviadas. Mais na {politica}.
        </p>
      )}
      <label className="flex items-start gap-2.5 text-[13px] font-medium leading-relaxed text-texto">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 flex-none accent-[var(--p-ambar-3)]"
          checked={marcado}
          disabled={desabilitado}
          onChange={(e) => aoMudar(e.target.checked ? { versao: VERSAO_TEXTOS, origem: origemDoAceite() } : null)}
          data-consentimento-saude-caixa
        />
        <span>
          {variante === "app"
            ? "Consinto que o Physiq trate os meus dados de saúde para o plano sem profissional."
            : `Consinto que as minhas respostas de saúde sejam enviadas ${quem ? `a ${quem}` : "ao meu profissional"} e guardadas no Physiq para o meu atendimento. Tenho 18 anos ou mais, ou respondo com o meu responsável.`}
        </span>
      </label>
    </section>
  );
}
