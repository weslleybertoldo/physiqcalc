// Physiq W6: a aba Pagamentos antiga do Calc (mp-payments do Banco do Treino) foi substituída por Perfil › Pagamentos
// (src/app-aluno/perfil/Pagamentos.tsx), que lê a cobrança unificada do banco principal. Este arquivo só reexporta a nova
// para quem ainda importa o caminho antigo (o fallback de /perfil/pagamentos em src/app-aluno/RotasApp.tsx).
export { default } from "@/app-aluno/perfil/Pagamentos";
