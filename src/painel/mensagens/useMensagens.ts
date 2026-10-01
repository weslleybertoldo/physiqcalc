// Physiq W22 — o que as partes do Painel › Mensagens dividem: a conta ativa e quem é você nela (dono vê a fila da conta; membro, a
// dele — P1), o WhatsApp do seu perfil, a conexão (com polling enquanto espera o QR) e o resumo (números da página e do menu).
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useConta } from "@/nucleo/conta";
import { useSessao } from "@/nucleo/sessao";
import { buscarResumo, lerPerfilWhatsapp, statusConexao } from "./api";
import { CHAVES_MENSAGENS } from "./chaves";
import { lerConfig } from "./disparosUtil";
import { devePollar, numeroDoPerfil, situacaoTela } from "./whatsappUtil";

/** enquanto espera o QR, a tela confere a cada 3 s (a do site antigo também) */
export const POLL_MS = 3000;

/** relógio da tela: o QR vence em 50 s e o aviso do celular depende da última batida — re-render periódico mesmo sem dado novo */
export function useRelogio(passoMs: number): number {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), passoMs);
    return () => clearInterval(t);
  }, [passoMs]);
  return agora;
}

export function useContextoMensagens() {
  const { conta, ehDono } = useConta();
  const { usuario } = useSessao();
  const uid = usuario?.id ?? "";
  const contaId = conta?.id ?? "";
  return { uid, contaId, conta, dono: ehDono, pronto: !!uid };
}

export type ContextoMensagens = ReturnType<typeof useContextoMensagens>;

export function useDadosMensagens(ctx: ContextoMensagens) {
  const qc = useQueryClient();
  const { uid, contaId, pronto } = ctx;
  const perfil = useQuery({ queryKey: CHAVES_MENSAGENS.perfil(uid), queryFn: () => lerPerfilWhatsapp(uid), enabled: pronto, staleTime: 30_000, retry: 1 });
  const numero = numeroDoPerfil(perfil.data?.dados_profissionais);
  const temNumero = !!numero.e164;
  const conexao = useQuery({
    queryKey: CHAVES_MENSAGENS.conexao(uid),
    queryFn: statusConexao,
    enabled: pronto,
    staleTime: 10_000,
    retry: 1,
    refetchInterval: (q) => (devePollar(situacaoTela(q.state.data ?? null, temNumero, Date.now())) ? POLL_MS : false),
  });
  const resumo = useQuery({
    queryKey: CHAVES_MENSAGENS.resumo(contaId, uid),
    queryFn: () => buscarResumo(contaId || null),
    enabled: pronto,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });
  const config = useMemo(() => lerConfig(perfil.data?.config), [perfil.data?.config]);

  /** depois de agir: a conexão, o resumo (e o número do menu), o histórico e/ou o perfil */
  const recarregar = async (o: { conexao?: boolean; resumo?: boolean; fila?: boolean; perfil?: boolean } = { conexao: true, resumo: true, fila: true, perfil: true }) => {
    const alvos: (readonly string[])[] = [];
    if (o.conexao) alvos.push(CHAVES_MENSAGENS.conexao(uid));
    if (o.resumo) alvos.push(CHAVES_MENSAGENS.resumoPrefixo);
    if (o.fila) alvos.push(CHAVES_MENSAGENS.filaPrefixo);
    if (o.perfil) alvos.push(CHAVES_MENSAGENS.perfil(uid));
    await Promise.all(alvos.map((queryKey) => qc.invalidateQueries({ queryKey })));
  };

  return { perfil, conexao, resumo, numero, temNumero, config, recarregar };
}

export type DadosMensagens = ReturnType<typeof useDadosMensagens>;

export { CHAVES_MENSAGENS };
