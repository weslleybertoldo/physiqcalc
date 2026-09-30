import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Lock, LogIn } from "lucide-react";
import { useSessao } from "@/nucleo/sessao";
import { useCaptcha } from "@/nucleo/captcha";
import { formatarRestante, gravarRegistro, lerRegistro, registroDaResposta, restanteBloqueioMs } from "@/lib/rateLimitLogin";
import { Cartao } from "@/ui/premium/Cartao";
import { useOnline } from "@/ui/premium/useOnline";
import { BotaoGoogle } from "./pecas/BotaoGoogle";
import { Campo, MensagemForm } from "./pecas/Campo";
import { TEXTO_BLOQUEADA_DE_VEZ, textoErroEntrar, textoErroServidor } from "./pecas/textos";
import { MolduraEntrada, TituloEntrada } from "./pecas/Moldura";

/**
 * Entrar com e-mail e senha (W3, spec 4.2 e 8A): no banco principal, para quem tem senha — o aluno que o profissional
 * cadastrou, a nutricionista criada pelo master e as contas de teste.
 * W8b: a tentativa vai para a função entrar-senha, que conta as senhas erradas NO SERVIDOR (por conta e por IP; regra dele:
 * 4 erradas → 1 min; depois 5, 15, 30 e 60 min; o erro seguinte bloqueia de vez) com um captcha invisível (Turnstile). O aparelho
 * só segue a resposta: mostra o tempo que falta e não manda a MESMA senha antes da hora (uma senha nova — a que o profissional
 * criou — pode tentar: o servidor decide).
 */
export default function EntrarEmail() {
  const { entrarComEmail, entrarComGoogle } = useSessao();
  const online = useOnline();
  const captcha = useCaptcha("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [abrindoGoogle, setAbrindoGoogle] = useState(false);
  const [agora, setAgora] = useState(() => Date.now());
  // a senha que levou ao bloqueio: com ela o botão espera; outra senha (a nova, do profissional) pode tentar
  const [senhaDoBloqueio, setSenhaDoBloqueio] = useState<string | null>(null);
  const registro = lerRegistro(email, agora);
  const restante = restanteBloqueioMs(registro, agora);
  const deVez = registro?.deVez === true;
  const esperando = restante > 0;
  const travado = (esperando || deVez) && (senha === "" || senha === senhaDoBloqueio);

  useEffect(() => {
    if (!esperando) return;
    const t = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [esperando]);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (travado || carregando) return; // Enter no campo também cai aqui e não chama o servidor
    setErro("");
    setCarregando(true);
    try {
      const token = await captcha.obterToken();
      const r = await entrarComEmail(email, senha, token);
      captcha.usado();
      if (!r.erro) {
        gravarRegistro(email, null); // entrou: some o aviso do bloqueio deste e-mail
        setSenhaDoBloqueio(null);
        setAgora(Date.now());
        return;
      }
      const code = r.erro.code ?? "";
      const reg = registroDaResposta({ erro: code, bloqueado_ate: r.erro.bloqueado_ate, bloqueado_de_vez: r.erro.bloqueado_de_vez, agora: r.erro.agora });
      if (reg) {
        gravarRegistro(email, reg);
        setSenhaDoBloqueio(senha);
      } else if (code === "senha_errada") {
        gravarRegistro(email, null);
      }
      setErro(reg ? "" : code && code !== "sessao" ? textoErroServidor(code) : textoErroEntrar(r.erro));
      setAgora(Date.now());
    } catch {
      setErro("Não foi possível entrar. Tente de novo.");
    } finally {
      setCarregando(false);
    }
  };

  const google = async () => {
    setAbrindoGoogle(true);
    const r = await entrarComGoogle();
    if (r.erro) setErro("Não foi possível abrir o Google. Tente de novo.");
    setAbrindoGoogle(false);
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
          <Campo rotulo="E-mail" type="email" autoComplete="email" inputMode="email" value={email}
            onChange={(e) => { setEmail(e.target.value); setErro(""); setSenhaDoBloqueio(null); }} placeholder="voce@email.com" required />
          <Campo rotulo="Senha" type="password" autoComplete="current-password" value={senha}
            onChange={(e) => { setSenha(e.target.value); setErro(""); }} placeholder="Sua senha" required minLength={6} />
          {deVez ? (
            <div data-bloqueio-de-vez className="flex items-start gap-3 rounded-2xl border border-rosa/30 px-3.5 py-3"
              style={{ background: "linear-gradient(90deg, var(--p-chip-r-fundo), transparent)" }}>
              <Lock aria-hidden className="mt-0.5 h-[18px] w-[18px] flex-none text-rosa-3" strokeWidth={1.9} />
              <MensagemForm className="text-[13px] font-medium leading-relaxed text-texto">{TEXTO_BLOQUEADA_DE_VEZ}</MensagemForm>
            </div>
          ) : esperando ? (
            <MensagemForm data-bloqueio-login>
              {registro?.motivo === "rede" ? "Muitas tentativas desta rede. " : "Muitas tentativas. "}
              Tente de novo em <span data-bloqueio-restante className="tabular-nums">{formatarRestante(restante)}</span>.
            </MensagemForm>
          ) : (
            erro && <MensagemForm data-erro-login>{erro}</MensagemForm>
          )}
          {/* captcha invisível (Turnstile): a caixinha só aparece se o Cloudflare pedir a confirmação */}
          <div ref={captcha.refCaixa} data-captcha={captcha.estado} className="flex justify-center empty:hidden" />
          <button type="submit" data-btn-entrar disabled={carregando || travado || !email || !senha || !online}
            className="pq-botao pq-botao-w h-[52px] w-full rounded-2xl text-[15.5px]">
            <LogIn aria-hidden />
            {carregando ? "Entrando…" : travado ? (deVez ? "Conta bloqueada" : "Aguarde") : "Entrar"}
          </button>
        </form>
      </Cartao>
      {deVez && (
        <div className="flex flex-col gap-2" data-bloqueio-google>
          <BotaoGoogle carregando={abrindoGoogle} onClick={google} disabled={!online} />
          <p className="px-1 text-center text-[12px] leading-relaxed text-texto-3">
            Se o seu e-mail é do Gmail, entrar com o Google destrava a conta. Depois você cria uma senha nova no Perfil › Conta.
          </p>
        </div>
      )}
      <p className="px-1 text-center text-[12.5px] leading-relaxed text-texto-3">
        Esqueceu a senha? Fale com o seu profissional — ele cria uma nova para você. Se você entra com o Google, volte e use o botão do Google.
      </p>
    </MolduraEntrada>
  );
}
