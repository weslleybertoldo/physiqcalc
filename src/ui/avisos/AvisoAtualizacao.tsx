import UpdateChecker from "@/components/UpdateChecker";
import { ehLoja } from "@/lib/distribuicao";

/**
 * "Nova versão disponível" do APK (C79 — o app se atualiza sozinho pela release "Latest" do GitHub). O aviso morava dentro
 * da TreinosPage; com ela saindo (W8), a casca monta em qualquer área logada — o aluno E o profissional que usa o APK.
 * No site não faz nada (o UpdateChecker só consulta no nativo). W1 da loja: na versão da Google Play não monta nem consulta a
 * versão — quem atualiza é a própria loja.
 */
export default function AvisoAtualizacao() {
  if (ehLoja) return null;
  return <UpdateChecker />;
}
