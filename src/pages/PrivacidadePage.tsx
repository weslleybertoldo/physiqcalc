import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const PrivacidadePage = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 sm:px-8 py-8 space-y-6">
        <Link to="/" className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground hover:text-primary font-heading transition-colors">
          <ArrowLeft size={14} /> Voltar
        </Link>

        <h1 className="font-heading text-2xl sm:text-3xl text-foreground tracking-tight">
          Política de Privacidade & Termos
        </h1>
        <p className="text-xs text-muted-foreground font-body">Última atualização: 11 de maio de 2026</p>

        <section className="space-y-2 text-sm font-body text-foreground/90 leading-relaxed">
          <h2 className="font-heading text-base text-primary uppercase tracking-wider mt-6">Quem somos</h2>
          <p>O PhysiqCalc é um aplicativo pessoal de cálculo de composição corporal e registro de treinos, operado por Weslley Bertoldo (Maceió-AL, Brasil). Contato: contato@seazone.com.br.</p>
        </section>

        <section className="space-y-2 text-sm font-body text-foreground/90 leading-relaxed">
          <h2 className="font-heading text-base text-primary uppercase tracking-wider mt-6">Dados coletados</h2>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li><strong>Conta</strong>: nome, email e foto fornecidos pelo Google ao fazer login.</li>
            <li><strong>Perfil</strong>: dados antropométricos que você inserir (peso, altura, dobras, idade, sexo, nível de atividade).</li>
            <li><strong>Treinos</strong>: séries, exercícios, pesos, repetições, datas, comentários e fotos de avaliação.</li>
            <li><strong>Técnicos</strong>: ID do usuário Supabase, timestamps, logs mínimos de erro para depuração.</li>
          </ul>
        </section>

        <section className="space-y-2 text-sm font-body text-foreground/90 leading-relaxed">
          <h2 className="font-heading text-base text-primary uppercase tracking-wider mt-6">Como usamos</h2>
          <p>Os dados são usados exclusivamente para: (a) autenticar você; (b) calcular métricas (TMB, % gordura, macros); (c) sincronizar seu histórico entre dispositivos via PowerSync/Supabase. Não há venda de dados, anúncios, analytics de terceiros (Google Analytics, Facebook Pixel) nem cookies de rastreamento.</p>
        </section>

        <section className="space-y-2 text-sm font-body text-foreground/90 leading-relaxed">
          <h2 className="font-heading text-base text-primary uppercase tracking-wider mt-6">Onde ficam armazenados</h2>
          <p>Banco de dados Supabase (PostgreSQL) na região us-east-1, com Row Level Security ativo (apenas você lê seus dados). Cópia local no dispositivo via SQLite (PowerSync) para funcionar offline.</p>
        </section>

        <section className="space-y-2 text-sm font-body text-foreground/90 leading-relaxed">
          <h2 className="font-heading text-base text-primary uppercase tracking-wider mt-6">Seus direitos (LGPD Art. 18)</h2>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li><strong>Acesso / portabilidade</strong>: você pode exportar todos os seus dados em JSON pela tela Configurações → Exportar meus dados.</li>
            <li><strong>Exclusão</strong>: a opção "Excluir minha conta" em Configurações apaga permanentemente seu perfil, treinos, avaliações e revoga o login Google. Operação irreversível.</li>
            <li><strong>Retificação</strong>: edite perfil e treinos diretamente no app.</li>
            <li><strong>Reclamação</strong>: você pode contatar a ANPD (gov.br/anpd).</li>
          </ul>
        </section>

        <section className="space-y-2 text-sm font-body text-foreground/90 leading-relaxed">
          <h2 className="font-heading text-base text-primary uppercase tracking-wider mt-6">Retenção</h2>
          <p>Séries de treino com mais de 12 meses são removidas automaticamente do dispositivo. Excluindo a conta, todos os dados são apagados imediatamente; backups operacionais do Supabase podem reter cópias por até 7 dias.</p>
        </section>

        <section className="space-y-2 text-sm font-body text-foreground/90 leading-relaxed">
          <h2 className="font-heading text-base text-primary uppercase tracking-wider mt-6">Termos de uso</h2>
          <p>O PhysiqCalc é fornecido "como está", sem garantia médica. Os cálculos são estimativas baseadas em fórmulas reconhecidas (Mifflin-St Jeor, Katch-McArdle, Jackson-Pollock) e <strong>não substituem avaliação profissional</strong>. Consulte nutricionista e médico antes de iniciar dieta/treino.</p>
        </section>
      </div>
    </div>
  );
};

export default PrivacidadePage;
