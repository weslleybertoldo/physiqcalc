import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, KeyRound } from "lucide-react";
import { lerProfPendente } from "@/lib/profPendente";
import { useSessao } from "@/nucleo/sessao";
import { MENSAGEM_VINCULO } from "@/nucleo/situacao";
import { Cartao } from "@/ui/premium/Cartao";
import { Campo, MensagemForm } from "../pecas/Campo";

/**
 * Boas-vindas › "Tenho um código do meu profissional" (W3, spec 4.2): o código PROF-NOME-SOBRENOME (o link ?prof= já
 * preenche) leva à conta certa — a matrícula nasce na conta do profissional pelo `vincular-aluno` e o treino dele chega
 * pela troca de token.
 */
export default function TenhoCodigo() {
  const { vincularCodigo } = useSessao();
  const navigate = useNavigate();
  const [codigo, setCodigo] = useState(() => lerProfPendente() ?? "");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState<string | null>(null);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    const r = await vincularCodigo(codigo);
    setEnviando(false);
    if (!r.ok) {
      setErro(MENSAGEM_VINCULO[r.erro ?? "erro_interno"]);
      return;
    }
    setPronto(r.profissional ?? "seu profissional");
    setTimeout(() => navigate("/", { replace: true }), 1400);
  };

  return (
    <Cartao brilho data-onboarding="TenhoCodigo" className="flex flex-col gap-4 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-[14px] border border-linha bg-superficie text-violeta-3">
          <KeyRound aria-hidden className="h-5 w-5" strokeWidth={1.8} />
        </span>
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold tracking-[-0.01em] text-texto">Tenho um código do meu profissional</span>
          <span className="mt-0.5 block text-[13px] leading-relaxed text-texto-2">
            O seu personal ou a sua nutricionista te passa um código (ex.: PROF-LUCAS-FERREIRA) ou um link.
          </span>
        </span>
      </div>
      {pronto ? (
        <MensagemForm tom="ok" data-vinculo-ok>
          <CheckCircle2 aria-hidden className="mr-1.5 inline h-4 w-4 align-[-3px]" />
          Pronto! Você entrou na lista de {pronto}. Abrindo o seu app…
        </MensagemForm>
      ) : (
        <form onSubmit={enviar} className="flex flex-col gap-3" data-form-codigo>
          <Campo rotulo="Código" value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="PROF-NOME-SOBRENOME"
            autoCapitalize="characters" autoComplete="off" spellCheck={false} required />
          {erro && <MensagemForm data-vinculo-erro>{erro}</MensagemForm>}
          <button type="submit" disabled={enviando || !codigo.trim()} className="pq-botao pq-botao-w h-12 w-full rounded-2xl">
            {enviando ? "Conferindo…" : "Entrar na lista"}
          </button>
        </form>
      )}
    </Cartao>
  );
}
