import { Building2, Gem, Link2, Smartphone, User, Users, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ehLoja } from "@/lib/distribuicao";
import { existe } from "@/rotas/registro";
import type { DadosCasca } from "@/ui/casca/dadosCasca";

export interface AbaConfig {
  id: string;
  arquivo: string;
  rotulo: string;
  icone: LucideIcon;
  soDono: boolean;
  /** W1 da loja: aba só do site e do APK do site (some na versão da Google Play) */
  soSite?: boolean;
}

export const ABAS_CONFIG: AbaConfig[] = [
  { id: "perfil", arquivo: "Perfil", rotulo: "Perfil", icone: User, soDono: false },
  { id: "conta", arquivo: "Conta", rotulo: "Conta", icone: Building2, soDono: true },
  { id: "equipe", arquivo: "Equipe", rotulo: "Equipe", icone: Users, soDono: true },
  { id: "plano", arquivo: "Plano", rotulo: "Plano", icone: Gem, soDono: true },
  { id: "recebimento", arquivo: "Recebimento", rotulo: "Recebimento", icone: Wallet, soDono: true },
  { id: "convite", arquivo: "Convite", rotulo: "Convite", icone: Link2, soDono: false },
  // W1 da loja: baixar e atualizar o APK (fora da loja) não existe na versão da Google Play — quem atualiza é a loja
  { id: "aplicativo", arquivo: "Aplicativo", rotulo: "Aplicativo", icone: Smartphone, soDono: false, soSite: true },
];

/** nova = aba registrada (src/painel/configuracoes/<arquivo>.tsx) · null = escondida. W28: a Planos do Calc (fallback do Plano) saiu. */
export type EstadoAbaConfig = "nova" | null;

/** `loja` = versão da Google Play (W1 da loja): a aba `soSite` some — também no link direto (a rota cai na 1ª aba). */
export function estadoDaAbaConfig(
  aba: AbaConfig,
  dados: Pick<DadosCasca, "ehDono">,
  temNova: (arquivo: string) => boolean = (a) => existe("abasConfig", a),
  loja: boolean = ehLoja,
): EstadoAbaConfig {
  if (aba.soDono && !dados.ehDono) return null;
  if (aba.soSite && loja) return null;
  return temNova(aba.arquivo) ? "nova" : null;
}
