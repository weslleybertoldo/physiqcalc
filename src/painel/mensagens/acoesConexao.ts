// Physiq W22 — as ações da CONEXÃO do WhatsApp (o botão principal do topo da página e o do cartão usam as mesmas): conectar, cancelar o
// pedido, desconectar e mandar o teste — pela função whatsapp-conectar do banco principal.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { desconectar, enviarTeste, ErroMensagens, pedirConexao } from "./api";
import { CHAVES_MENSAGENS } from "./chaves";
import type { ContextoMensagens, DadosMensagens } from "./useMensagens";
import { situacaoTela, traduzErro, type Instancia } from "./whatsappUtil";

const codigo = (e: unknown): string => (e instanceof ErroMensagens ? e.codigo : "erro_interno");

export const ROTA_PERFIL = "/painel/configuracoes/perfil";

export function useAcoesConexao(ctx: ContextoMensagens, d: DadosMensagens, agora: number) {
  const qc = useQueryClient();
  const [agindo, setAgindo] = useState<null | "conexao" | "teste">(null);
  const inst = d.conexao.data ?? null;
  const situacao = situacaoTela(inst, d.temNumero, agora);
  const carregando = d.conexao.isLoading || d.perfil.isLoading;

  const agir = async (fn: () => Promise<Instancia>) => {
    setAgindo("conexao");
    try {
      const nova = await fn();
      qc.setQueryData(CHAVES_MENSAGENS.conexao(ctx.uid), nova);
    } catch (e) {
      toast.error(traduzErro(codigo(e)));
    } finally {
      setAgindo(null);
    }
  };

  const principal = () => {
    if (situacao === "conectado" || situacao === "qr" || situacao === "aguardando_agente") return void agir(desconectar);
    return void agir(pedirConexao);
  };

  const testar = async () => {
    setAgindo("teste");
    try {
      const { repetida } = await enviarTeste();
      toast.success(repetida ? "Já tem uma mensagem de teste na fila" : "Mensagem de teste na fila — deve chegar em instantes");
      await d.recarregar({ resumo: true, fila: true });
    } catch (e) {
      toast.error(traduzErro(codigo(e)));
    } finally {
      setAgindo(null);
    }
  };

  return { inst, situacao, agindo, carregando, principal, testar };
}

export type AcoesConexao = ReturnType<typeof useAcoesConexao>;

