import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { Check, Download, Globe, RefreshCw, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { baixarNoNavegador, RELEASES_PAGE, ultimoApk, ultimoApkOuErro } from "@/lib/apkRelease";
import { downloadAndInstall } from "@/lib/apkUpdater";
import { instrucaoCurta } from "@/lib/instalacaoManual";
import { TopoPagina } from "@/ui/casca/topo";
import { Botao } from "@/ui/premium/Botao";
import { Chip } from "@/ui/premium/Chip";
import { KpiCompacto } from "@/ui/premium/Kpi";
import { SecaoForm } from "./pecas/Form";
import { versaoMaisNova } from "./pecas/regras";

const VERSAO_ATUAL = __APP_VERSION__;

/**
 * Configurações › Aplicativo (W5, spec 4.6 — todos): o card "Aplicativo Android" (instalar pelo APK da última release do
 * GitHub — o mesmo canal de atualização do app — e a versão), o app web (instalar pelo navegador) e o iPhone (pelo site).
 * hml-17 (H-39): a consulta da release que falhou (sem rede, rate limit, mais de 8 s) vira "não deu para verificar" com Tentar de
 * novo — antes o APK dizia "Você está na mais nova". Chave própria: o Perfil do aluno (RodapePerfil) lê ["apk-ultimo"] com o
 * ultimoApk, que devolve null na falha.
 */
export default function Aplicativo() {
  const nativo = Capacitor.isNativePlatform();
  const { canInstall, isInstalled, promptInstall } = usePWAInstall();
  const release = useQuery({ queryKey: ["apk-ultimo", "verificar"], queryFn: () => ultimoApkOuErro(), staleTime: 10 * 60_000, retry: 1 });
  const [progresso, setProgresso] = useState<number | null>(null);
  const ultima = release.data?.version ?? null;
  const temNova = Boolean(ultima && versaoMaisNova(ultima, VERSAO_ATUAL));
  const naoVerificou = release.isError && !release.data;

  const baixar = async () => {
    const r = release.data ?? (await ultimoApk());
    if (!r) {
      toast.error("Não achei o APK agora. Abrindo a página de downloads.");
      baixarNoNavegador(RELEASES_PAGE);
      return;
    }
    if (nativo) {
      setProgresso(0);
      try {
        const res = await downloadAndInstall(r.url, (p) => setProgresso(p));
        if (res === "permission") toast.info('Libere "instalar apps desconhecidos" para o Physiq e toque em Atualizar de novo.');
      } catch {
        toast.error("Não foi possível baixar a atualização agora.");
      } finally {
        setProgresso(null);
      }
      return;
    }
    toast.success(`Baixando Physiq v${r.version} (APK)…`);
    baixarNoNavegador(r.url);
  };

  const instalarWeb = async () => {
    if (isInstalled) return;
    if (canInstall) {
      await promptInstall();
      return;
    }
    toast.info(instrucaoCurta(), { duration: 6000 });
  };

  return (
    <div data-config-aba="aplicativo" className="flex flex-col gap-3.5">
      <TopoPagina titulo="Aplicativo" subtitulo="O Physiq no celular" />
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
        <SecaoForm brilho titulo="Aplicativo Android" marca="app-android"
          extra={!nativo || naoVerificou ? undefined : temNova ? <Chip tom="a">ATUALIZAÇÃO</Chip> : ultima ? <Chip tom="n" icone={Check}>EM DIA</Chip> : undefined}
          descricao="O mesmo app dos alunos, com o treino funcionando sem internet. Instala direto pelo arquivo (fora da loja) e avisa quando sai versão nova.">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 flex-none items-center justify-center rounded-2xl border border-linha bg-superficie text-violeta-3">
              <Smartphone aria-hidden className="h-6 w-6" strokeWidth={1.7} />
            </span>
            <div className="flex flex-wrap gap-2.5">
              <KpiCompacto rotulo={nativo ? "Instalada" : "Versão do site"} valor={`v${VERSAO_ATUAL}`} />
              <KpiCompacto rotulo={nativo ? "Mais nova" : "APK mais novo"} valor={release.isLoading ? "…" : ultima ? `v${ultima}` : "—"}
                detalhe={naoVerificou ? "não deu para verificar" : nativo && temNova ? "disponível" : undefined} tomDetalhe="ambar" />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-linha pt-4" data-app-verificar-erro={naoVerificou || undefined}>
            {nativo && naoVerificou ? (
              <Botao variante="w" icone={RefreshCw} onClick={() => void release.refetch()} disabled={release.isFetching} data-app-verificar-tentar>
                {release.isFetching ? "Verificando…" : "Não deu para verificar — tentar de novo"}
              </Botao>
            ) : (
              <Botao variante="w" icone={nativo ? RefreshCw : Download} onClick={() => void baixar()} disabled={progresso !== null || (nativo && !temNova)} data-app-baixar>
                {progresso !== null ? `Baixando… ${progresso}%` : nativo ? (temNova ? "Atualizar agora" : "Você está na mais nova") : "Baixar o APK"}
              </Botao>
            )}
            {!nativo && naoVerificou && (
              <Botao tamanho="sm" icone={RefreshCw} onClick={() => void release.refetch()} disabled={release.isFetching} data-app-verificar-tentar>
                Tentar de novo
              </Botao>
            )}
            {!nativo && <span className="text-[12px] text-texto-3">No Android, abra o arquivo baixado e toque em Instalar.</span>}
          </div>
        </SecaoForm>
        <div className="flex flex-col gap-3.5">
          <SecaoForm titulo="App web" marca="app-web" descricao="Sem instalar arquivo: o Physiq fica na tela inicial, pelo navegador (Chrome, Edge, Safari).">
            <Botao icone={isInstalled ? Check : Globe} onClick={() => void instalarWeb()} disabled={isInstalled} data-app-web>
              {isInstalled ? "Já está na tela inicial" : "Instalar o app web"}
            </Botao>
          </SecaoForm>
          <SecaoForm titulo="iPhone" marca="app-iphone" descricao='No iPhone o Physiq funciona pelo site: abra no Safari, toque em "Compartilhar" e depois em "Adicionar à Tela de Início".'>
            <span className="text-[12px] text-texto-3">O app nativo de iPhone não faz parte desta versão.</span>
          </SecaoForm>
        </div>
      </div>
    </div>
  );
}
