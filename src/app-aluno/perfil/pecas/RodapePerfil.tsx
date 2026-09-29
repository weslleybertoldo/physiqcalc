import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { Check, Download, Globe, LogOut, RefreshCw, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { baixarNoNavegador, RELEASES_PAGE, ultimoApk } from "@/lib/apkRelease";
import { downloadAndInstall } from "@/lib/apkUpdater";
import { instrucaoCurta } from "@/lib/instalacaoManual";
import { useSessao } from "@/nucleo/sessao";
import { versaoMaisNova } from "@/painel/configuracoes/pecas/regras";
import { Botao } from "@/ui/premium/Botao";
import { PainelDeslizante } from "@/ui/premium/Sheet";

const VERSAO = __APP_VERSION__;

/**
 * Rodapé do Perfil (tela 5, `.rodape`; C20): "Sair" à esquerda e "Physiq 3.x · atualizado" à direita. No APK confere a
 * última release do GitHub (o mesmo canal do aviso de atualização) e oferece "Atualizar para 3.y"; no site, "Instalar"
 * (App Web ou o APK Android).
 */
export function RodapePerfil() {
  const { sair } = useSessao();
  const nativo = Capacitor.isNativePlatform();
  const [confirmarSaida, setConfirmarSaida] = useState(false);
  const [instalar, setInstalar] = useState(false);
  const [progresso, setProgresso] = useState<number | null>(null);
  const release = useQuery({ queryKey: ["apk-ultimo"], queryFn: () => ultimoApk(), enabled: nativo, staleTime: 10 * 60_000, retry: 1 });
  const ultima = release.data?.version ?? null;
  const temNova = Boolean(nativo && ultima && versaoMaisNova(ultima, VERSAO));

  const atualizar = async () => {
    const r = release.data ?? (await ultimoApk());
    if (!r) {
      toast.error("Não achei a atualização agora. Tente de novo em instantes.");
      return;
    }
    setProgresso(0);
    try {
      const res = await downloadAndInstall(r.url, (p) => setProgresso(p));
      if (res === "permission") toast.info('Libere "instalar apps desconhecidos" para o Physiq e toque de novo.');
    } catch {
      toast.error("Não foi possível baixar a atualização agora.");
    } finally {
      setProgresso(null);
    }
  };

  let direita: React.ReactNode;
  if (!nativo) {
    direita = (
      <button type="button" onClick={() => setInstalar(true)} className="flex items-center gap-1.5 hover:text-texto" data-rodape-instalar>
        <span data-rodape-versao>Physiq {VERSAO}</span> · <Download aria-hidden className="h-3.5 w-3.5" /> Instalar
      </button>
    );
  } else if (progresso !== null) {
    direita = <span data-rodape-versao>Baixando {progresso}%…</span>;
  } else if (temNova) {
    direita = (
      <button type="button" onClick={() => void atualizar()} className="flex items-center gap-1.5 text-ambar-3" data-rodape-atualizar>
        <RefreshCw aria-hidden className="h-3.5 w-3.5" /> Atualizar para {ultima}
      </button>
    );
  } else {
    direita = (
      <button type="button" onClick={() => void release.refetch()} className="flex items-center gap-1.5 hover:text-texto" data-rodape-verificar
        aria-label="Verificar atualizações">
        <span data-rodape-versao>Physiq {VERSAO}</span> · {release.isFetching ? "verificando…" : ultima ? "atualizado" : "verificar atualizações"}
      </button>
    );
  }

  return (
    <>
      <div className="mt-1 flex items-center justify-between px-1 text-[12px] text-texto-3" data-perfil-rodape>
        <button type="button" onClick={() => setConfirmarSaida(true)} className="flex items-center gap-1.5 font-semibold text-suave hover:text-texto" data-perfil-sair>
          <LogOut aria-hidden className="h-4 w-4" /> Sair
        </button>
        {direita}
      </div>

      <PainelDeslizante aberto={confirmarSaida} aoMudar={setConfirmarSaida} titulo="Sair do Physiq?"
        descricao="Você sai deste aparelho. O que já está salvo continua na sua conta.">
        <div className="flex gap-2 pt-2">
          <Botao className="flex-1" onClick={() => setConfirmarSaida(false)}>Cancelar</Botao>
          <Botao variante="w" className="flex-1" icone={LogOut} onClick={() => { setConfirmarSaida(false); void sair(); }} data-perfil-sair-confirmar>Sair</Botao>
        </div>
      </PainelDeslizante>

      {!nativo && <InstalarSheet aberto={instalar} aoMudar={setInstalar} />}
    </>
  );
}

/** "Instalar o Physiq" (site): App Web (o prompt do navegador ou a instrução) ou o APK Android da última release. */
function InstalarSheet({ aberto, aoMudar }: { aberto: boolean; aoMudar: (v: boolean) => void }) {
  const { canInstall, isInstalled, promptInstall } = usePWAInstall();
  const [buscando, setBuscando] = useState(false);
  const appWeb = async () => {
    if (isInstalled) return;
    aoMudar(false);
    if (canInstall) {
      await promptInstall();
      return;
    }
    toast.info(instrucaoCurta(), { duration: 6000 });
  };
  const apk = async () => {
    setBuscando(true);
    const r = await ultimoApk();
    setBuscando(false);
    aoMudar(false);
    if (!r) {
      toast.error("Não achei o APK agora. Abrindo a página de downloads.");
      baixarNoNavegador(RELEASES_PAGE);
      return;
    }
    toast.success(`Baixando Physiq v${r.version} (APK)…`);
    baixarNoNavegador(r.url);
  };
  return (
    <PainelDeslizante aberto={aberto} aoMudar={aoMudar} titulo="Instalar o Physiq" descricao="Escolha como quer instalar.">
      <div className="flex flex-col gap-2 pt-2" data-sheet-instalar>
        <Botao variante="w" icone={isInstalled ? Check : Globe} onClick={() => void appWeb()} disabled={isInstalled} className="justify-start">
          {isInstalled ? "App Web · já está na tela inicial" : "App Web · na tela inicial, sem loja"}
        </Botao>
        <Botao icone={Smartphone} onClick={() => void apk()} disabled={buscando} className="justify-start">
          {buscando ? "Buscando a versão mais nova…" : "APK Android · baixa o instalador"}
        </Botao>
      </div>
    </PainelDeslizante>
  );
}
