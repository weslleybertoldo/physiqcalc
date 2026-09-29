import { useState, type FormEvent } from "react";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { CheckCircle2, KeyRound, MessageCircle } from "lucide-react";
import { Campo, MensagemForm } from "@/entrada/pecas/Campo";
import { lerProfPendente, limparProfPendente } from "@/lib/profPendente";
import { MENSAGEM_VINCULO, normalizarCodigo } from "@/nucleo/situacao";
import { Avatar } from "@/ui/premium/Avatar";
import { Botao, BotaoIcone } from "@/ui/premium/Botao";
import { Esqueleto } from "@/ui/premium/Estados";
import { GrupoLista } from "@/ui/premium/Lista";
import { ConfirmarVinculo } from "@/ui/vinculo/ConfirmarVinculo";
import type { ProfissionalDoAluno } from "./api";
import { linkWhatsapp, ROTULO_PAPEL } from "./regras";

/** Abre a conversa no WhatsApp do profissional (P24 — sem chat interno). No APK pelo navegador do sistema (o WebView não abre wa.me). */
async function abrirWhatsapp(url: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * "Meus profissionais" (tela 5, `.grp` + `.pro`): nome, papel e o botão de conversa (abre o WhatsApp — P24; sem número
 * cadastrado, sem botão). Sem profissional (pedido dele, 29/09): o campo "Tenho um código do meu profissional" — o mesmo
 * vínculo das Boas-vindas (vincular-aluno; o link ?prof= já preenche).
 */
export function MeusProfissionais({
  profissionais,
  carregando,
  aoVincular,
}: {
  profissionais: ProfissionalDoAluno[] | null;
  carregando: boolean;
  aoVincular: () => void;
}) {
  return (
    <GrupoLista titulo="Meus profissionais" className="mt-0">
      <div data-perfil-profissionais={profissionais?.length ?? ""}>
        {carregando && !profissionais ? (
          <div className="flex h-[52px] items-center gap-3">
            <Esqueleto className="h-[38px] w-[38px] rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Esqueleto className="h-3.5 w-2/5" />
              <Esqueleto className="h-3 w-1/4" />
            </div>
          </div>
        ) : profissionais && profissionais.length > 0 ? (
          <div className="divide-y divide-linha-3">
            {profissionais.map((p) => {
              const wa = linkWhatsapp(p.whatsapp);
              return (
                <div key={`${p.id}:${p.papel}`} className="flex h-[52px] items-center gap-3" data-profissional={p.papel}>
                  <Avatar src={p.foto_url} nome={p.nome} tamanho={38} />
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-[14px] font-semibold text-texto">{p.nome}</b>
                    <span className="block truncate text-[12px] text-texto-2">{ROTULO_PAPEL[p.papel] ?? p.papel}</span>
                  </div>
                  {wa && (
                    <BotaoIcone
                      icone={MessageCircle}
                      rotulo={`Conversar com ${p.nome.split(" ")[0]} no WhatsApp`}
                      tamanho={36}
                      className="rounded-[12px] [&>svg]:h-[17px] [&>svg]:w-[17px]"
                      onClick={() => void abrirWhatsapp(wa)}
                      data-profissional-whatsapp={wa}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <VincularCodigo aoVincular={aoVincular} />
        )}
      </div>
    </GrupoLista>
  );
}

/**
 * "Tenho um código do meu profissional" dentro do Perfil (sem sair da aba). Antes de vincular, o popup mostra o nome, a foto
 * e o tipo do profissional (Confirmar / Cancelar — pedido dele, 29/09); ao vincular, a seção mostra o profissional.
 */
function VincularCodigo({ aoVincular }: { aoVincular: () => void }) {
  const [codigo, setCodigo] = useState(() => lerProfPendente() ?? "");
  const [erro, setErro] = useState("");
  const [conferindo, setConferindo] = useState<string | null>(null);
  const [pronto, setPronto] = useState<string | null>(null);

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setErro("");
    const c = normalizarCodigo(codigo);
    if (!c) return setErro(MENSAGEM_VINCULO.codigo_invalido);
    setConferindo(c);
  };

  if (pronto) {
    return (
      <div className="py-3">
        <MensagemForm tom="ok" data-vinculo-ok>
          <CheckCircle2 aria-hidden className="mr-1.5 inline h-4 w-4 align-[-3px]" />
          Pronto! Você entrou na lista de {pronto}.
        </MensagemForm>
      </div>
    );
  }
  return (
    <>
      <form onSubmit={enviar} className="flex flex-col gap-3 pb-3 pt-1" data-perfil-codigo>
        <div className="flex items-start gap-3">
          <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[10px] bg-superficie text-violeta-3">
            <KeyRound aria-hidden className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <span className="min-w-0 text-[12.5px] leading-relaxed text-texto-2">
            <b className="block text-[13.5px] font-medium text-texto">Tenho um código do meu profissional</b>
            Você ainda não está com um profissional no Physiq. Digite o código que o seu personal ou a sua nutricionista te passou
            (ex.: PROF-LUCAS-FERREIRA) — ou abra o link que ele mandou.
          </span>
        </div>
        <Campo rotulo="Código do profissional" value={codigo} onChange={(e) => { setCodigo(e.target.value.toUpperCase()); setErro(""); }}
          placeholder="PROF-NOME-SOBRENOME" autoCapitalize="characters" autoComplete="off" spellCheck={false} data-perfil-codigo-campo />
        {erro && <MensagemForm data-vinculo-erro>{erro}</MensagemForm>}
        <Botao type="submit" variante="w" disabled={!codigo.trim()} data-perfil-codigo-enviar>Entrar na lista</Botao>
      </form>
      <ConfirmarVinculo
        codigo={conferindo}
        aberto={conferindo !== null}
        aoFechar={(fim, r) => {
          setConferindo(null);
          if (fim === "vinculou") {
            setPronto(r?.profissional ?? "seu profissional");
            aoVincular();
          } else {
            limparProfPendente();
          }
        }}
      />
    </>
  );
}
