import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { Building2, Gem, Link2, Smartphone, User, Users, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { existe } from "@/rotas/registro";
import type { DadosCasca } from "@/ui/casca/dadosCasca";

export interface AbaConfig {
  id: string;
  arquivo: string;
  rotulo: string;
  icone: LucideIcon;
  soDono: boolean;
  /** Tela antiga do Calc que responde pela aba enquanto a nova não existe. */
  antiga?: LazyExoticComponent<ComponentType>;
}

const PlanosAntiga = lazy(() => import("@/pages/admin/PlanosPage"));

export const ABAS_CONFIG: AbaConfig[] = [
  { id: "perfil", arquivo: "Perfil", rotulo: "Perfil", icone: User, soDono: false },
  { id: "conta", arquivo: "Conta", rotulo: "Conta", icone: Building2, soDono: true },
  { id: "equipe", arquivo: "Equipe", rotulo: "Equipe", icone: Users, soDono: true },
  { id: "plano", arquivo: "Plano", rotulo: "Plano", icone: Gem, soDono: true, antiga: PlanosAntiga },
  { id: "recebimento", arquivo: "Recebimento", rotulo: "Recebimento", icone: Wallet, soDono: true },
  { id: "convite", arquivo: "Convite", rotulo: "Convite", icone: Link2, soDono: false },
  { id: "aplicativo", arquivo: "Aplicativo", rotulo: "Aplicativo", icone: Smartphone, soDono: false },
];

export type EstadoAbaConfig = "nova" | "antiga" | null;

export function estadoDaAbaConfig(aba: AbaConfig, dados: Pick<DadosCasca, "ehDono">, temNova: (arquivo: string) => boolean = (a) => existe("abasConfig", a)): EstadoAbaConfig {
  if (aba.soDono && !dados.ehDono) return null;
  if (temNova(aba.arquivo)) return "nova";
  return aba.antiga ? "antiga" : null;
}
