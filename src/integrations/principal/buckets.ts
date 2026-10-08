// Homologação hml-02b (H-14): o Storage do banco principal é um só para os 2 schemas — no staging, os buckets de dado de saúde
// têm a versão própria "-staging" (o mesmo padrão do fotos-perfil / comprovantes), para teste nunca cair no bucket da produção.
import { PRINCIPAL_SCHEMA } from "./client";

export type BucketDoPrincipal = "anexos" | "diario" | "evolucao";

export function bucketDoAmbiente(nome: BucketDoPrincipal, schema: string = PRINCIPAL_SCHEMA): string {
  return schema === "staging" ? `${nome}-staging` : nome;
}
