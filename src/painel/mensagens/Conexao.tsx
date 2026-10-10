import { Link } from "react-router-dom";
import { Check, CircleCheck, Loader2, MessageCircle, QrCode, Send, Settings, Unplug, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Botao } from "@/ui/premium/Botao";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip, type TomChip } from "@/ui/premium/Chip";
import { Esqueleto } from "@/ui/premium/Estados";
import { ROTA_PERFIL, type AcoesConexao } from "./acoesConexao";
import { quantosValendo } from "./disparosUtil";
import { dataHoraCurta, ROTULO_STATUS_MSG } from "./filaUtil";
import type { DadosMensagens } from "./useMensagens";
import { ROTULO_PASSO, ROTULO_STATUS, passosConexao, rotuloBotao, textoSituacao, type Instancia, type SituacaoTela } from "./whatsappUtil";

/** o link do cartão no violeta dos "Ver agenda"/"Ver todos" da tela 6 */
const LINK = "inline-flex items-center gap-1 text-[12.5px] font-semibold text-violeta-3 transition-colors hover:text-violeta-2";

const TOM_SITUACAO: Record<SituacaoTela, TomChip> = {
  sem_numero: "g",
  desconectado: "g",
  aguardando_agente: "c",
  qr: "c",
  conectado: "n",
  erro: "r",
};

/** O botão principal (topo da página e cartão): "Conectar WhatsApp" · "Cancelar" · "Desconectar". */
export function BotaoConexao({ a, temNumero, variante, tamanho }: { a: AcoesConexao; temNumero: boolean; variante?: "w" | "g"; tamanho?: "md" | "sm" }) {
  const rotulo = rotuloBotao(a.situacao);
  const desligado = a.agindo !== null || a.carregando || (!temNumero && a.situacao === "sem_numero");
  const Icone = a.agindo === "conexao" ? Loader2 : a.situacao === "conectado" ? Unplug : a.situacao === "desconectado" || a.situacao === "sem_numero" || a.situacao === "erro" ? MessageCircle : X;
  return (
    <Botao variante={variante ?? (a.situacao === "conectado" ? "g" : "w")} tamanho={tamanho} icone={Icone} onClick={a.principal} disabled={desligado}
      className={cn(a.agindo === "conexao" && "[&_svg]:animate-spin")} data-btn-conectar data-btn-acao={rotulo}>
      {rotulo}
    </Botao>
  );
}

/**
 * Physiq W22 — o cartão da CONEXÃO (spec 4.4: "conectar o número por QR, enviar teste"), com a borda de luz da tela 6: o WhatsApp do
 * perfil, a situação, os 3 passos e o QR que o agente do celular publica (a tela confere a cada 3 s enquanto espera). Conectado, o
 * "Enviar teste" manda 1 mensagem para o próprio número.
 */
export default function Conexao({ d, a, agora }: { d: DadosMensagens; a: AcoesConexao; agora: number }) {
  const { inst, situacao } = a;
  const passos = passosConexao(d.temNumero, inst?.status ?? "desconectado", quantosValendo(d.config));
  const teste = d.resumo.data?.ultimo_teste ?? null;
  const ping = d.resumo.data?.agente_ping ?? inst?.ultimo_ping ?? null;

  return (
    <Cartao brilho className="p-5 xl:col-span-2" data-card-conexao data-whatsapp-situacao={situacao} data-whatsapp-conexao={inst?.status ?? "desconectado"}
      data-whatsapp-carregando={a.carregando ? "1" : "0"}>
      <CabecalhoCartao titulo="Conexão"
        extra={<Chip tom={TOM_SITUACAO[situacao]} data-status-conexao={inst?.status ?? "desconectado"}>{ROTULO_STATUS[inst?.status ?? "desconectado"].toUpperCase()}</Chip>}
        acao={<Link to={ROTA_PERFIL} className={LINK} data-link-configuracoes><Settings aria-hidden className="h-3.5 w-3.5" /> {d.temNumero ? "Alterar o número" : "Cadastrar o número"}</Link>} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_236px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="rounded-2xl border border-linha bg-superficie px-4 py-3">
            <div className="text-[11.5px] font-medium text-texto-3">Seu WhatsApp</div>
            {a.carregando ? (
              <Esqueleto className="mt-1.5 h-5 w-44" />
            ) : (
              <div className="mt-0.5 text-[17px] font-semibold tabular-nums tracking-[-0.01em] text-texto" data-numero-whatsapp={d.numero.e164 ?? ""} data-tem-numero={d.temNumero ? "1" : "0"}>
                {d.temNumero ? d.numero.formatado : "Nenhum número cadastrado"}
              </div>
            )}
          </div>

          {d.conexao.isError ? (
            <p className="text-[13px] font-medium text-rosa-3" role="alert" data-erro-conexao>
              Não deu para ver a conexão agora.{" "}
              <button type="button" className="font-semibold underline" onClick={() => void d.conexao.refetch()} data-btn-tentar-conexao>Tentar de novo</button>
            </p>
          ) : (
            <p className="text-[13px] leading-relaxed text-texto-2" data-texto-situacao>{a.carregando ? "Carregando…" : textoSituacao(situacao, inst, agora, ping)}</p>
          )}

          <ol className="flex flex-col gap-2.5" data-passos-conexao>
            {passos.map((p) => (
              <li key={p.n} className="flex items-start gap-3" data-passo={p.n} data-passo-estado={p.estado}>
                <span aria-hidden className={cn("mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-[9px] text-[12px] font-bold",
                  p.estado === "feito" ? "bg-[var(--p-chip-n-fundo)] text-[var(--p-chip-n-texto)]" : "border border-linha-2 text-texto-3")}>
                  {p.estado === "feito" ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : p.n}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold text-texto">
                    {p.titulo}
                    <Chip tom={p.estado === "feito" ? "n" : p.estado === "pendente" ? "a" : "g"} className="h-[20px] text-[10px]">{ROTULO_PASSO[p.estado].toUpperCase()}</Chip>
                  </span>
                  <span className="block text-[12px] text-texto-3">{p.descricao}</span>
                </span>
              </li>
            ))}
          </ol>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <BotaoConexao a={a} temNumero={d.temNumero} tamanho="sm" />
            {situacao === "conectado" && (
              <Botao variante="g" tamanho="sm" icone={a.agindo === "teste" ? Loader2 : Send} onClick={() => void a.testar()} disabled={a.agindo !== null}
                className={cn(a.agindo === "teste" && "[&_svg]:animate-spin")} data-btn-teste>
                Enviar teste
              </Botao>
            )}
            <span className="text-[12px] text-texto-3">
              {situacao === "conectado" ? "Fica conectado como um aparelho a mais — igual ao WhatsApp Web." : "Seu número fica salvo em Configurações; a conexão você refaz quando quiser."}
            </span>
          </div>

          {situacao === "conectado" && (
            <p className="text-[12.5px] text-texto-2" data-status-teste={teste?.status ?? ""}>
              {teste
                ? teste.status === "enviada"
                  ? `Teste enviado ${dataHoraCurta(teste.enviada_em ?? teste.criado_em, new Date(agora))} — confira o seu WhatsApp.`
                  : teste.status === "falhou"
                    ? `O teste falhou: ${teste.erro ?? "motivo não informado"}`
                    : `Teste ${ROTULO_STATUS_MSG[teste.status]?.toLowerCase() ?? "na fila"}, aguardando o envio…`
                : "O teste chega no próprio número conectado, para você ver como fica."}
            </p>
          )}
        </div>

        <PainelQr inst={inst} situacao={situacao} />
      </div>
    </Cartao>
  );
}

/** O quadro do QR (o agente publica um novo a cada ~20 s; sem QR válido, a tela espera o próximo). */
function PainelQr({ inst, situacao }: { inst: Instancia | null; situacao: SituacaoTela }) {
  if (situacao === "qr" && inst?.qr_code) {
    return (
      <div className="flex flex-col items-center gap-2" data-qr-code>
        <img src={inst.qr_code} alt="QR code para conectar o WhatsApp" className="h-[236px] w-[236px] rounded-2xl bg-white p-3" />
        <p className="text-center text-[11.5px] leading-snug text-texto-3">WhatsApp › Configurações › Aparelhos conectados › Conectar um aparelho</p>
      </div>
    );
  }
  const base = "flex h-[236px] w-[236px] flex-col items-center justify-center gap-3 rounded-2xl border border-linha bg-superficie px-5 text-center";
  if (situacao === "aguardando_agente") {
    return (
      <div className={base} data-aguardando-qr>
        <Loader2 aria-hidden className="h-7 w-7 animate-spin text-ciano" />
        <span className="text-[12.5px] text-texto-2">Preparando o QR code…</span>
      </div>
    );
  }
  if (situacao === "conectado") {
    return (
      <div className={base} data-qr-conectado>
        <CircleCheck aria-hidden className="h-8 w-8 text-verde-2" strokeWidth={1.75} />
        <span className="text-[13px] font-semibold text-texto">WhatsApp conectado</span>
        <span className="text-[12px] text-texto-3">As mensagens saem do seu próprio número, uma por aluno.</span>
      </div>
    );
  }
  return (
    <div className={base} data-qr-vazio>
      <QrCode aria-hidden className="h-8 w-8 text-texto-4" strokeWidth={1.5} />
      <span className="text-[12.5px] text-texto-3">O QR code aparece aqui quando você pedir a conexão.</span>
    </div>
  );
}
