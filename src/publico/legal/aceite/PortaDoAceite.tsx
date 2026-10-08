import { useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useSessao } from "@/nucleo/sessao";
import type { LegalSituacao } from "@/nucleo/situacao";
import { CarregandoTela } from "@/ui/casca/CarregandoTela";
import { useOnline } from "@/ui/premium/useOnline";
import { decisaoDaPorta, exclusaoAberta, rotaLivreDoAceite } from "./regras";
import TelaDoAceite from "./TelaDoAceite";
import TelaMenor from "./TelaMenor";

/**
 * hml-12 (H-30, D6) — a porta do aceite: o invólucro global do App.tsx (por dentro do MasterSoNoSite), carregado SÓ no build de
 * staging até a virada. Quem não aceitou a versão vigente dos textos (o `legal` da situação) vê a tela do aceite antes de qualquer
 * área logada (app, Boas-vindas, painel, master); quem tem a trava de idade vê a tela da trava. As páginas públicas, o Sair e o
 * Excluir minha conta passam sempre (regras.ts).
 * - `children` são as rotas; `avisos` são os avisos globais (o popup do ?prof=, "o Physiq mudou", o pedido de push…) e o link do site
 *   que abriu o APK: eles só montam quando nada está pendente (a decisão SEM a rota livre dá "segue"). Numa rota livre com pendência
 *   (ex.: os Termos abertos da tela do aceite), só as rotas.
 * - A exclusão aberta continua livre enquanto a pessoa fica nela (o Perfil apaga o ?excluir=1 ao abrir); saiu → a porta volta.
 * - Aceitou → a situação recarrega e a porta abre; se a recarga falhar, vale o `legal` que o banco devolveu no aceite até chegar um
 *   `legal` novo (quem aceitou não fica preso). A comparação é com o `legal` da situação, não com o objeto inteiro: outra mudança
 *   da situação (o spread do marcarAvisoMudanca) mantém o mesmo `legal` e não traz a tela de volta.
 */
export default function PortaDoAceite({ children, avisos }: { children: ReactNode; avisos?: ReactNode }) {
  const { usuario, situacao, carregandoSituacao } = useSessao();
  const online = useOnline();
  const { pathname, search } = useLocation();
  const [aceito, setAceito] = useState<{ de: LegalSituacao | null; legal: LegalSituacao | null } | null>(null);
  const [exclusao, setExclusao] = useState(false);

  // hml-12 (H-30): o ajuste no próprio render (não num efeito), para já valer no render em que o Perfil apaga o ?excluir=1
  const naExclusao = exclusaoAberta(exclusao, pathname, search);
  if (naExclusao !== exclusao) setExclusao(naExclusao);

  const doBanco = situacao?.legal ?? null;
  const legal = !usuario ? null : aceito && aceito.de === doBanco ? aceito.legal : doBanco;
  const base = { online, carregando: carregandoSituacao };
  const decisao = decisaoDaPorta(legal, { ...base, rotaLivre: naExclusao || rotaLivreDoAceite(pathname, search) });
  const comAvisos = decisaoDaPorta(legal, { ...base, rotaLivre: false }) === "segue";

  if (decisao === "carregando") return <CarregandoTela />;
  if (decisao === "aceite" && legal) return <TelaDoAceite legal={legal} aoAceitar={(novo) => setAceito({ de: doBanco, legal: novo })} />;
  if (decisao === "menor_16" || decisao === "sem_responsavel") return <TelaMenor motivo={decisao} />;
  return (
    <>
      {children}
      {comAvisos && avisos}
    </>
  );
}
