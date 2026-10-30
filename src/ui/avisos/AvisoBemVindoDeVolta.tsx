import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { bemVindoMostrado, bemVindoPendente } from "@/nucleo/restaurarLogin";
import { useSessao } from "@/nucleo/sessao";

/** O 1º nome (o "Nome" do aviso); sem nome, o aviso sai sem ele. */
function primeiroNome(nome: string | null | undefined): string {
  return (nome ?? "").trim().split(/\s+/)[0] ?? "";
}

/**
 * restaurar-login (D5): depois de entrar sozinho no celular novo com a chave de volta do Android (src/nucleo/restaurarLogin.ts), a pessoa
 * vê UMA vez "Bem-vindo de volta, Nome — entramos sozinhos pelo backup do Google." (é o "identity context" que a Google cita). A marca é
 * gravada só na restauração e sai quando o aviso aparece.
 */
export default function AvisoBemVindoDeVolta() {
  const { usuario, situacao } = useSessao();
  const avisou = useRef(false);
  const uid = usuario?.id ?? null;
  const nome = situacao ? primeiroNome(situacao.nome) : null;
  useEffect(() => {
    // espera a situação (o nome) chegar; a marca é desta pessoa
    if (avisou.current || !uid || nome === null || !bemVindoPendente(uid)) return;
    avisou.current = true;
    bemVindoMostrado();
    toast.success(`Bem-vindo de volta${nome ? `, ${nome}` : ""} — entramos sozinhos pelo backup do Google.`, { duration: 8000 });
  }, [uid, nome]);
  return null;
}
