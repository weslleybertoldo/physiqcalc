// Fixture do perfil do aluno no painel (W14) no formato da aluno_perfil() do banco principal — o aluno da tela 7.
import type { PerfilAluno } from "@/painel/aluno/dados/tipos";

export function perfil(o: Partial<PerfilAluno> = {}): PerfilAluno {
  return {
    ok: true, paciente_id: "p1", treino_user_id: null, rota_id: "p1", conta_id: "c1", conta_nome: "Consultoria Ferreira", conta_origem: "nova",
    conta_modulos: ["treino", "nutricao"], nome: "Rafael Moura", apelido: "Rafa", email: "rafa@teste.com", telefone: "11987654321", cpf: null,
    nascimento: "1998-03-10", genero: "masculino", objetivo: "definição", objetivo_app: null, tags: ["VIP"], foto_url: null,
    criado_em: "2026-03-05T12:00:00Z", atualizado_em: "2026-09-30T19:40:00Z", ativo: true, bloqueado: false, bloqueado_em: null, bloqueio_msg: null,
    conta_excluida: false, origem: "novo", tem_login: true, modulos: ["treino", "nutricao"], personal: { id: "u1", nome: "Lucas Ferreira" },
    nutricionista: { id: "u2", nome: "Camila Rocha" }, ajustes: { acesso_app: true, mensagens_automaticas: false, diario_alimentar: true, acesso_link: true },
    link_codigo: "abc234xyz9", resumo: null, ultima_antropometria: { data: "2026-06-14", peso: "84.2", altura: "178" },
    eu: { id: "u1", dono: true, personal: true, nutricionista: false, master: false }, pode_editar: true, agora: "2026-09-30T19:45:00Z", ...o,
  };
}
