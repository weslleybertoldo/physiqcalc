import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, LogIn } from "lucide-react";
import { useSessao } from "@/nucleo/sessao";
import { contaComoTentativa, formatarRestante, gravarRegistro, lerRegistro, registrarErro, restanteBloqueioMs } from "@/lib/rateLimitLogin";
import { Cartao } from "@/ui/premium/Cartao";
import { useOnline } from "@/ui/premium/useOnline";
import { Campo, MensagemForm } from "./pecas/Campo";
import { textoErroEntrar } from "./pecas/textos";
import { MolduraEntrada, TituloEntrada } from "./pecas/Moldura";

/**
 * Entrar com e-mail e senha (W3, spec 4.2 e 8A): no banco principal, para quem tem senha — o aluno que o profissional
 * cadastrou, a nutricionista criada pelo master e as contas de teste. Limitador de tentativas de hoje (13/09/2026):
 * 3 erros → 1 min; 4º → 3 min; depois 5, 10 e 30 min → 1 h (por e-mail, no aparelho).
 */
export default function EntrarEmail() {
  const { entrarComEmail } = useSessao();
  const online = useOnline();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [agora, setAgora] = useState(() => Date.now());
  const restante = restanteBloqueioMs(lerRegistro(email, agora), agora);
  const bloqueado = restante > 0;

  useEffect(() => {
    if (!bloqueado) return;
    const t = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [bloqueado]);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (bloqueado || carregando) return; // Enter no campo também cai aqui e não chama o Auth
    setErro("");
    setCarregando(true);
    try {
      const r = await entrarComEmail(email, senha);
      if (!r.erro) {
        gravarRegistro(email, null); // acerto zera os erros do e-mail
        setAgora(Date.now());
        return;
      }
      if (contaComoTentativa(r.erro)) {
        const registro = registrarErro(lerRegistro(email), Date.now());
        gravarRegistro(email, registro);
        setAgora(Date.now());
        setErro(registro.bloqueadoAte ? "" : textoErroEntrar(r.erro));
      } else {
        setErro(textoErroEntrar(r.erro));
      }
    } catch {
      setErro("Não foi possível entrar. Tente de novo.");
    } finally {
      setCarregando(false);
    }
  };

  return (
    <MolduraEntrada
      voltar={
        <Link to="/entrar" className="pq-ibtn" aria-label="Voltar" title="Voltar">
          <ArrowLeft aria-hidden />
        </Link>
      }
    >
      <TituloEntrada sobre="Entrar com" titulo="E-mail e senha" texto="Use o e-mail e a senha que o seu profissional te passou (ou a sua, se você criou uma)." />
      <Cartao brilho className="p-4">
        <form onSubmit={enviar} className="flex flex-col gap-4" data-form-email>
          <Campo rotulo="E-mail" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" required />
          <Campo rotulo="Senha" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Sua senha" required minLength={6} />
          {bloqueado ? (
            <MensagemForm data-bloqueio-login>
              Muitas tentativas. Tente de novo em <span data-bloqueio-restante className="tabular-nums">{formatarRestante(restante)}</span>.
            </MensagemForm>
          ) : (
            erro && <MensagemForm>{erro}</MensagemForm>
          )}
          <button type="submit" data-btn-entrar disabled={carregando || bloqueado || !email || !senha || !online}
            className="pq-botao pq-botao-w h-[52px] w-full rounded-2xl text-[15.5px]">
            <LogIn aria-hidden />
            {carregando ? "Entrando…" : bloqueado ? "Aguarde" : "Entrar"}
          </button>
        </form>
      </Cartao>
      <p className="px-1 text-center text-[12.5px] leading-relaxed text-texto-3">
        Esqueceu a senha? Fale com o seu profissional — ele cria uma nova para você. Se você entra com o Google, volte e use o botão do Google.
      </p>
    </MolduraEntrada>
  );
}
