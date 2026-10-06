import { useNavigate } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { Botao } from "@/ui/premium/Botao";
import { SecaoForm } from "../pecas/Form";

/** Configurações › Perfil: o caminho para "Excluir minha conta" (W2 da loja — a Google Play exige que seja fácil de achar). */
export function AtalhoExcluir() {
  const navigate = useNavigate();
  return (
    <SecaoForm titulo="Excluir minha conta" marca="perfil-excluir"
      descricao="Encerra o seu login no Physiq. Antes, você confere o que acontece com os alunos, a equipe e a cobrança, e baixa os prontuários.">
      <Botao tamanho="sm" icone={Trash2} onClick={() => navigate("/painel/configuracoes/excluir-conta")} data-perfil-excluir-conta>
        Excluir minha conta
      </Botao>
    </SecaoForm>
  );
}
