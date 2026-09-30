import UpdateChecker from "@/components/UpdateChecker";

/**
 * "Nova versão disponível" do APK (C79 — o app se atualiza sozinho pela release "Latest" do GitHub). O aviso morava dentro
 * da TreinosPage; com ela saindo (W8), a casca monta em qualquer área logada — o aluno E o profissional que usa o APK.
 * No site não faz nada (o UpdateChecker só consulta no nativo).
 */
export default function AvisoAtualizacao() {
  return <UpdateChecker />;
}
