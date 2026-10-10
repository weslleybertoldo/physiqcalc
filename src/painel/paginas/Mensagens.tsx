import { Link } from "react-router-dom";
import { Loader2, MessageCircle, Send, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { TopoPagina } from "@/ui/casca/topo";
import { Botao } from "@/ui/premium/Botao";
import { EstadoVazio } from "@/ui/premium/Estados";
import Automaticas from "@/painel/mensagens/Automaticas";
import AvisoAgente from "@/painel/mensagens/AvisoAgente";
import { ROTA_PERFIL, useAcoesConexao } from "@/painel/mensagens/acoesConexao";
import Conexao, { BotaoConexao } from "@/painel/mensagens/Conexao";
import Historico from "@/painel/mensagens/Historico";
import ResumoMensagens from "@/painel/mensagens/ResumoMensagens";
import { useContextoMensagens, useDadosMensagens, useRelogio } from "@/painel/mensagens/useMensagens";

/**
 * Painel › Mensagens (W22 — spec 4.4 "Mensagens", N-14, N-58, R7, R12, risco 8; padrão da tela 6): o WhatsApp dos 2 módulos (o personal
 * ganha o que só o Nutri tinha). Conectar o número por QR (o agente do celular de casa publica o código), enviar teste, as 6 mensagens
 * automáticas com horário e texto (tudo nascendo desligado), o aviso do plano por Pix, o histórico da fila (na fila · enviada · falhou)
 * com Reenviar/Limpar, o aviso quando o celular de envio está fora do ar e o número de falhas no menu. As MESMAS tabelas, funções e
 * config do site antigo do Nutri: a nutri vê a mesma instância, o mesmo histórico e os mesmos textos lá e aqui.
 */
export default function Mensagens() {
  const ctx = useContextoMensagens();
  const d = useDadosMensagens(ctx);
  const agora = useRelogio(5000);
  const a = useAcoesConexao(ctx, d, agora);

  if (!ctx.conta) {
    return (
      <div data-pagina-mensagens data-estado="sem-conta">
        <TopoPagina titulo="Mensagens" />
        <EstadoVazio icone={MessageCircle} titulo="Nenhuma conta ativa" texto="As mensagens aparecem aqui quando você faz parte de uma conta de profissional." />
      </div>
    );
  }
  const conectado = a.situacao === "conectado";
  const subtitulo = `WhatsApp · ${ctx.conta.nome}${ctx.dono && ctx.conta.profissionais > 1 ? " · a fila de toda a equipe" : ""}`;

  return (
    <div className="flex flex-col gap-3.5" data-pagina-mensagens data-whatsapp-situacao={a.situacao} data-dono={ctx.dono ? "1" : "0"}>
      <TopoPagina titulo="Mensagens" subtitulo={<span data-subtitulo-mensagens>{subtitulo}</span>}
        acoes={
          a.situacao === "sem_numero" && !a.carregando ? (
            <Link to={ROTA_PERFIL} className="pq-botao pq-botao-w" data-btn-cadastrar-numero><Settings aria-hidden /> Cadastrar meu WhatsApp</Link>
          ) : conectado ? (
            <Botao variante="w" icone={a.agindo === "teste" ? Loader2 : Send} onClick={() => void a.testar()} disabled={a.agindo !== null}
              className={cn(a.agindo === "teste" && "[&_svg]:animate-spin")} data-btn-teste-topo>
              Enviar teste
            </Botao>
          ) : (
            <BotaoConexao a={a} temNumero={d.temNumero} variante="w" />
          )
        } />

      <AvisoAgente ping={d.resumo.data?.agente_ping} agora={agora} />

      <ResumoMensagens resumo={d.resumo.data} config={d.config} carregando={d.resumo.isLoading || d.perfil.isLoading} conectado={conectado} />

      <div className="grid grid-cols-1 items-start gap-3.5 xl:grid-cols-3">
        <Conexao d={d} a={a} agora={agora} />
        <Automaticas d={d} conectado={conectado} />
      </div>

      <Historico ctx={ctx} d={d} conectado={conectado} agora={agora} />
    </div>
  );
}
