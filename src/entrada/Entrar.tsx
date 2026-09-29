import { useState } from "react";
import { Link } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { Briefcase, ChevronRight, Download, Link2, Mail, RefreshCw, Salad, Dumbbell } from "lucide-react";
import { existe } from "@/rotas/registro";
import { lerProfPendente } from "@/lib/profPendente";
import { useSessao } from "@/nucleo/sessao";
import { Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { FOTOS_TREINO } from "@/ui/premium/fotos";
import { useOnline } from "@/ui/premium/useOnline";
import { BotaoGoogle } from "./pecas/BotaoGoogle";
import { MensagemForm } from "./pecas/Campo";
import { MolduraEntrada, TituloEntrada } from "./pecas/Moldura";

// constante do build (vite define); nos testes pode não existir
const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "";
const RELEASES_URL = "https://api.github.com/repos/weslleybertoldo/physiqcalc/releases/latest";

/** "Verificar atualizações" na entrada do APK (como a tela de login antiga): quem não consegue entrar pode estar numa versão velha. */
function VerificarAtualizacao() {
  const [estado, setEstado] = useState<"parado" | "vendo" | "atual" | { url: string; versao: string }>("parado");
  const verificar = async () => {
    setEstado("vendo");
    try {
      const r = await fetch(RELEASES_URL, { cache: "no-store" });
      const rel = await r.json();
      const remota = String(rel.tag_name || "").replace(/^v/, "").split(".").map(Number);
      const local = APP_VERSION.split(".").map(Number);
      const maior = remota[0] > local[0] || (remota[0] === local[0] && (remota[1] ?? 0) > (local[1] ?? 0));
      const apk = (rel.assets || []).find((a: { name: string }) => a.name.endsWith(".apk"));
      setEstado(maior && apk ? { url: apk.browser_download_url, versao: remota.join(".") } : "atual");
    } catch {
      setEstado("atual");
    }
  };
  if (typeof estado === "object") {
    return (
      <a href={estado.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-violeta-3">
        <Download aria-hidden className="h-3.5 w-3.5" /> Baixar a versão {estado.versao}
      </a>
    );
  }
  return (
    <button type="button" onClick={verificar} disabled={estado === "vendo"} className="inline-flex items-center gap-1.5 text-[12px] text-texto-3 hover:text-texto">
      <RefreshCw aria-hidden className={`h-3.5 w-3.5 ${estado === "vendo" ? "animate-spin" : ""}`} />
      {estado === "atual" ? "Você está na versão mais recente" : "Verificar atualizações"}
    </button>
  );
}

/**
 * Entrar (W3, spec 4.2 e tela 1): Google para todos, e-mail e senha para quem tem senha (o aluno criado pelo
 * profissional, as contas de teste) e o link do profissional. "Sou profissional — criar conta" abre com a W4; até lá
 * avisa que o cadastro abre em breve (o master continua convidando).
 */
export default function Entrar() {
  const { entrarComGoogle } = useSessao();
  const online = useOnline();
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [profissional, setProfissional] = useState(false);
  const codigo = lerProfPendente();
  const cadastroAberto = existe("onboarding", "CriarConta");

  const google = async () => {
    setErro("");
    setCarregando(true);
    const r = await entrarComGoogle();
    if (r.erro) setErro("Não foi possível abrir o Google. Tente de novo.");
    setCarregando(false);
  };

  return (
    <MolduraEntrada>
      <div className="relative h-[168px] overflow-hidden rounded-[22px] border border-linha" data-entrada-capa>
        <img src={FOTOS_TREINO.geral} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" />
        <div aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(9,9,11,.15), rgba(9,9,11,.92))" }} />
        <div className="absolute inset-x-4 bottom-4 flex flex-wrap gap-1.5">
          <Chip tom="t" icone={Dumbbell}>TREINO</Chip>
          <Chip tom="n" icone={Salad}>NUTRIÇÃO</Chip>
        </div>
      </div>

      <TituloEntrada sobre="Boas-vindas ao" titulo="Physiq" texto="Seu treino e sua dieta num app só. Entre com a mesma conta de sempre." />

      {codigo && (
        <div data-prof-pendente className="flex items-start gap-3 rounded-2xl border border-violeta/30 px-3.5 py-3 text-[13px]"
          style={{ background: "linear-gradient(90deg, var(--p-chip-t-fundo), transparent)" }}>
          <Link2 aria-hidden className="mt-0.5 h-[18px] w-[18px] flex-none text-violeta-3" strokeWidth={1.9} />
          <span className="text-texto">
            Você chegou pelo link de um profissional (<b className="font-semibold text-violeta-3">{codigo}</b>). Ao entrar, sua conta fica ligada a ele.
          </span>
        </div>
      )}

      <Cartao brilho className="flex flex-col gap-3 p-4">
        <BotaoGoogle carregando={carregando} onClick={google} disabled={!online} />
        <Link to="/entrar/email" data-entrar-email className="pq-botao pq-botao-g h-[52px] w-full rounded-2xl text-[15px]">
          <Mail aria-hidden />
          Entrar com e-mail e senha
        </Link>
        {erro && <MensagemForm>{erro}</MensagemForm>}
      </Cartao>

      <button
        type="button"
        data-sou-profissional
        onClick={() => setProfissional((v) => !v)}
        className="flex w-full items-center gap-3 rounded-2xl border border-linha bg-superficie px-3.5 py-3 text-left transition-colors hover:border-linha-2"
      >
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[14px] border border-linha bg-superficie text-verde-3">
          <Briefcase aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold text-texto">Sou profissional — criar conta</span>
          <span className="block text-[12.5px] text-texto-2">Personal trainer ou nutricionista</span>
        </span>
        <ChevronRight aria-hidden className="h-4 w-4 flex-none text-texto-3" />
      </button>
      {profissional && (
        <p data-cadastro-profissional className="-mt-2 px-1 text-[13px] leading-relaxed text-texto-2">
          {cadastroAberto
            ? "Entre com o Google (ou e-mail e senha) e escolha \"Sou profissional\" nas boas-vindas: a conta nasce com 14 dias grátis."
            : "O cadastro de profissional abre em breve. Se você já atende pelo Physiq, entre com a sua conta de sempre — ou peça o convite ao suporte."}
        </p>
      )}

      {Capacitor.isNativePlatform() && (
        <div className="flex justify-center">
          <VerificarAtualizacao />
        </div>
      )}
    </MolduraEntrada>
  );
}
