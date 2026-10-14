import { useEffect, useRef, useState, type FormEvent } from "react";
import { LogIn, LogOut } from "lucide-react";
import { MensagemForm } from "@/entrada/pecas/Campo";
import { MolduraEntrada, TituloEntrada } from "@/entrada/pecas/Moldura";
import { useSessao } from "@/nucleo/sessao";
import { codigoValido, fatorParaPedir, TEXTO_ERRO_CODIGO, type ErroCodigo } from "@/nucleo/doisFatoresRegras";
import { linkDoSuporte } from "@/nucleo/suporte";
import { Cartao } from "@/ui/premium/Cartao";
import { useOnline } from "@/ui/premium/useOnline";
import { CampoCodigo } from "./CampoCodigo";
import { confirmar, erroDe, fatores, relerUsuario } from "./mfa";

/**
 * hml-22 (H-22) — "Digite o código do app autenticador": quem tem a verificação em 2 etapas ligada (fator verificado) e entrou só com
 * a senha ou o Google (token aal1) vê esta tela antes de qualquer área logada do site (src/rotas/Rotas.tsx, ComCodigo; o
 * MasterLayout repete). Código certo → a sessão vira aal2 e a tela sai sozinha (a sessão do app troca no MFA_CHALLENGE_VERIFIED).
 * Só no site: no build do app o Rollup corta o import() desta tela (scripts/ci/sem-master.sh confere).
 * "Sair" encerra só ESTA sessão (escopo local): quem ainda não passou do código não derruba as outras sessões da conta.
 */
export default function TelaCodigo() {
  const { sessao, sair } = useSessao();
  const online = useOnline();
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<ErroCodigo | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const enviandoRef = useRef(false);
  const fator = fatorParaPedir(sessao?.user?.factors);

  // o fator guardado na sessão pode estar velho (o suporte apagou — docs/master-2fa.md): relê do Auth ao abrir; sem fator
  // verificado lá, relê a sessão (a renovação traz os fatores de agora) e a tela sai sozinha
  useEffect(() => {
    let vivo = true;
    void fatores().then((r) => {
      if (vivo && r.ok && r.valor.verificados.length === 0) void relerUsuario();
    });
    return () => {
      vivo = false;
    };
  }, []);

  async function enviar(valor = codigo, e?: FormEvent) {
    e?.preventDefault();
    if (enviandoRef.current || saindo || !fator || !codigoValido(valor)) return;
    enviandoRef.current = true;
    setEnviando(true);
    setErro(null);
    const falhou = erroDe(await confirmar(fator.id, valor));
    if (!falhou) return; // a sessão vira aal2: a tela sai sozinha (fica "Conferindo…" até lá)
    if (falhou === "sem_fator") {
      await relerUsuario();
      setErro("falhou");
    } else {
      setErro(falhou);
    }
    setCodigo("");
    enviandoRef.current = false;
    setEnviando(false);
  }

  async function sairDaqui() {
    setSaindo(true);
    try {
      await sair({ escopo: "local" });
    } finally {
      setSaindo(false);
    }
  }

  const textoErro = erro && erro !== "sem_fator" ? TEXTO_ERRO_CODIGO[erro] : null;

  return (
    <MolduraEntrada>
      <div data-2fa-tela className="flex flex-col gap-5">
        <TituloEntrada
          sobre="Verificação em 2 etapas"
          titulo="Digite o código do app autenticador"
          texto="Abra o app autenticador do celular (Google Authenticator, Microsoft Authenticator ou outro) e digite os 6 números do Physiq."
        />
        <Cartao brilho className="p-4">
          <form onSubmit={(e) => void enviar(codigo, e)} className="flex flex-col gap-4" data-form-codigo>
            <CampoCodigo
              valor={codigo}
              aoMudar={(v) => {
                setCodigo(v);
                if (v) setErro(null);
              }}
              aoCompletar={(v) => void enviar(v)}
              desligado={enviando || saindo || !fator}
              invalido={erro === "errado"}
              autoFocus
            />
            {textoErro && <MensagemForm data-2fa-erro={erro}>{textoErro}</MensagemForm>}
            <button
              type="submit"
              data-2fa-entrar
              disabled={enviando || saindo || !fator || !online || !codigoValido(codigo)}
              className="pq-botao pq-botao-w h-[52px] w-full rounded-2xl text-[15.5px]"
            >
              <LogIn aria-hidden />
              {enviando ? "Conferindo…" : "Entrar"}
            </button>
            <button
              type="button"
              data-2fa-sair
              onClick={() => void sairDaqui()}
              disabled={saindo}
              className="pq-botao pq-botao-g h-[48px] w-full rounded-2xl text-[14.5px]"
            >
              <LogOut aria-hidden />
              {saindo ? "Saindo…" : "Sair"}
            </button>
          </form>
        </Cartao>
        <p className="px-1 text-center text-[12.5px] leading-relaxed text-texto-3" data-2fa-suporte>
          Perdeu o celular?{" "}
          <a href={linkDoSuporte("Perdi o celular do código do Physiq")} className="font-medium text-violeta-3 hover:underline">
            Fale com o suporte.
          </a>
        </p>
      </div>
    </MolduraEntrada>
  );
}
