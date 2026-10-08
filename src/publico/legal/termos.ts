import { ROTA_ASSINATURA, ROTA_POLITICA, VENDEDOR } from "./versao";

/**
 * hml-11 (H-28, D7) — os Termos de Uso NOVOS, em revisão: só no build de staging até a virada (src/publico/legal/versao.ts). Base:
 * o rascunho para o advogado (physiqcalc-scratch/hml/hml11/rascunhos/termos-de-uso.md, conferido no código do 82064d3) com as
 * decisões padrão da spec (P3: o Physiq recebe em nome do profissional nas contas com o Mercado Pago ligado; P5: o limite de 3
 * mensalidades; P7: o e-mail do suporte; P8: versão nova com aviso de 30 dias) e sem os marcadores do rascunho. O Anexo é o acordo
 * de tratamento de dados entre o profissional (controlador) e o Physiq (operador). A volta do advogado é copiada para cá.
 */

/** O título do Anexo (a Política aponta para a âncora dele). */
export const TITULO_ANEXO = "Anexo — Acordo de tratamento de dados (profissional e Physiq)";

const EMAIL = `[${VENDEDOR.email}](mailto:${VENDEDOR.email})`;

export const TERMOS_DE_USO = `
Estes termos são o contrato entre o Physiq e quem usa o aplicativo e o site: o aluno e o profissional. A
[Política de Privacidade](${ROTA_POLITICA}) faz parte deles e explica como tratamos dados pessoais. Os
[Termos de assinatura](${ROTA_ASSINATURA}) valem para quem paga um plano ao Physiq. O Anexo, no fim, é o acordo sobre os dados que o
profissional guarda dos alunos dele.

## Resumo — o mais importante

- **O Physiq é uma ferramenta.** Ele não é dispositivo médico, não diagnostica, não trata e não substitui o profissional de saúde
  (seção 5).
- **Idade:** 16 anos ou mais. De 16 a 17, só como aluno de um profissional e com o consentimento do responsável. Sem profissional,
  ou como profissional, só a partir de 18 anos (seção 2).
- **O profissional responde pelo que prescreve e pelos dados dos alunos dele.** Ele é o controlador desses dados, e o Physiq é o
  operador (seção 6 e Anexo).
- **O aluno de um profissional não paga nada ao Physiq.** O que ele paga ao profissional é combinado entre os dois (seção 8).
- **Planos pagos:** são o plano do profissional e o plano do app para quem treina sem profissional. Seguem os Termos de assinatura,
  com desistência em 7 dias e cancelamento quando quiser (seção 9).
- **Limites:** **não garantimos funcionamento sem interrupção nem livre de erros**, e a responsabilidade do Physiq com o
  profissional tem um limite (seção 10).
- **Você pode excluir a conta quando quiser**, pelo app ou pelo site (seção 11).
- **Mudanças nestes termos:** aviso de **30 dias** antes (seção 13).
- **Atendimento:** ${EMAIL}, com resposta em até 5 dias (seção 1).

## 1. Quem oferece

O Physiq é oferecido por **${VENDEDOR.nome}**, pessoa física, CPF ${VENDEDOR.cpf}, com endereço na ${VENDEDOR.endereco}, no site
physiqcalc.com.br.

Neste texto:
- "Physiq" e "nós" são quem oferece o aplicativo;
- "aluno" é quem treina ou faz o acompanhamento;
- "profissional" é o personal trainer, o nutricionista, o dono de uma conta de profissional ou o membro da equipe dele;
- "você" é quem usa.

O contato para qualquer assunto destes termos (informação, dúvida, reclamação, suspensão, cancelamento ou desistência) é o
${EMAIL}. Respondemos em até **5 dias** (Decreto nº 7.962/2013, art. 4º, parágrafo único).

## 2. Aceite e idade mínima

- Ao criar a conta, você aceita estes termos e a Política de Privacidade. O app guarda a data, a hora e a versão aceita.
- Quem já usava o Physiq antes desta versão aceita no próximo acesso. O app mostra os textos e só abre depois do aceite.
- **Idade mínima: 16 anos.**
  - **De 16 a 17 anos:** só como aluno de um profissional. O consentimento de um dos pais ou do responsável legal fica registrado
    no cadastro pelo profissional.
  - **Para treinar sem profissional (o plano do app) ou ser profissional:** é preciso ter 18 anos ou ser emancipado (Código Civil,
    art. 5º).
- Quem cria uma conta de profissional declara que pode exercer a profissão e que o registro no conselho que informa (CREF, CRN) é
  dele e está válido.
- Estes termos, os Termos de assinatura e a Política de Privacidade ficam no site, com link no rodapé e dentro do app. Dá para
  ler, imprimir ou salvar em PDF quando quiser.
- Se não concordar, não crie a conta ou pare de usar o Physiq.

## 3. O serviço

O Physiq tem:

- **para o aluno, no app** (Android e navegador):
  - o treino do dia, com séries, cargas e descanso;
  - a dieta e o diário alimentar com fotos;
  - a evolução, a agenda e os pagamentos ao profissional;
  - as notificações;
  - o treino funciona sem internet depois da 1ª sincronização;
- **para o profissional, no site:**
  - os alunos e a prescrição de treino e de dieta;
  - avaliações, prontuário, pré-consulta e diário;
  - agenda, financeiro, recibos e cobrança dos alunos;
  - a equipe;
  - as mensagens automáticas por WhatsApp;
- **sem login:** a calculadora de composição corporal, a pré-consulta, o diário e o cadastro pelos links que o profissional
  manda.

Podemos melhorar e mudar as funções. Se uma mudança tirar uma função importante de um plano pago, avisamos antes, como na seção
13, e quem paga pode cancelar sem multa.

## 4. Contas, papéis e segurança da conta

- Cada pessoa tem o próprio login, com o Google ou com e-mail e senha. Guarde a senha e não a compartilhe.
- **Conta de profissional:** quem cria a conta é o dono e paga o plano. Ele convida a equipe, define quem atende cada aluno e
  responde pelo que a equipe faz no Physiq.
- **Aluno:**
  - entra pelo código ou pelo convite do profissional;
  - ou treina sem profissional, no plano do app.

  O profissional pode pausar o acesso do aluno ao app, desligar o app dele ou fechá-lo enquanto a mensalidade com ele estiver
  vencida. Mesmo assim, o Perfil continua abrindo para sair, exportar os dados e excluir a conta.
- Informe um e-mail certo e que você acompanhe: é por ele que falamos com você.
- Suspeitou de uso indevido? Troque a senha e avise na hora pelo ${EMAIL}.
- Por segurança, o login com senha é bloqueado depois de várias tentativas erradas. Ele volta com uma senha nova, criada pelo
  profissional, ou entrando com o Google.

## 5. Saúde: o Physiq não é dispositivo médico

- O Physiq **não é um dispositivo médico**. Ele não diagnostica, não trata e **não substitui** o acompanhamento de um profissional
  de saúde.
- Os cálculos são **estimativas**, feitos com fórmulas reconhecidas (como Mifflin-St Jeor, Katch-McArdle e Jackson & Pollock). Não
  substituem a avaliação de um profissional.
- Consulte um médico e um nutricionista antes de começar uma dieta ou um treino, principalmente se tiver alguma condição de saúde,
  estiver grávida ou tomar remédio. Pare na hora e procure ajuda se sentir dor, tontura ou falta de ar.
- **O Physiq não serve para emergência.** Numa emergência, ligue 192 (SAMU).
- **Com profissional:** o treino e a dieta são prescritos por ele, que responde pelo que prescreve.
- **Sem profissional:** os treinos prontos e os pratos prontos são sugestões gerais, sem avaliação individual. O uso é por sua
  conta.

## 6. Responsabilidades do profissional

- **Exercício da profissão:** prescrever dentro da sua habilitação e seguir o código de ética do seu conselho. O Physiq não confere
  o registro.
- **Dados dos alunos:** o profissional é o controlador dos dados que guarda sobre os alunos dele (Anexo). Cabe a ele:
  - ter uma base legal da LGPD para esses dados (no atendimento, a tutela da saúde, art. 11, II, "f");
  - informar os alunos de que usa o Physiq;
  - guardar o prontuário pelo prazo que a lei e o conselho pedem.
- **Alunos de 16 e 17 anos:** o profissional confere a idade e registra no cadastro o consentimento de um dos pais ou do
  responsável legal. Não cadastre menores de 16 anos.
- **Conteúdo:** responde pelo que escreve, prescreve, anexa e manda pelo Physiq. Isso inclui os textos da pré-consulta, os
  comentários e as cobranças.
- **Mensagens automáticas por WhatsApp:** são opcionais e saem do WhatsApp do próprio profissional, conectado por QR code. A
  conexão usa uma forma não oficial do WhatsApp, e o WhatsApp pode limitar ou bloquear o número. Quem decide ligar, o que mandar e
  para quem é o profissional, e ele responde pelas mensagens. Pare de mandar a quem pedir.
- **Cobrança dos alunos:** o preço, o vencimento, o bloqueio por atraso, o recibo e a devolução são decisões dele (seção 8).
- **Ao sair:** antes de excluir a conta, baixe os prontuários. O histórico de cada aluno fica guardado com a matrícula dele.

## 7. Responsabilidades do aluno

- Informe dados verdadeiros e mantenha-os atualizados. Os cálculos dependem deles.
- Siga a orientação do seu profissional e respeite os seus limites.
- Use o Physiq só para você e dentro da lei.
- Não tente acessar dados de outras pessoas, contornar as travas do app nem atrapalhar o serviço.

## 8. Pagamentos entre aluno e profissional

- A mensalidade e as cobranças que o aluno paga ao profissional **não são venda do Physiq**. O preço, o vencimento, os descontos,
  o recibo e a devolução são combinados entre os dois. O Physiq oferece a ferramenta.
- **Pix na chave do profissional:** o dinheiro vai direto para ele. O aluno anexa o comprovante e o profissional confirma.
- **Mercado Pago, nas contas em que o Physiq liga essa opção:** o pagamento é processado na conta do Mercado Pago do Physiq, em
  nome do profissional, e repassado a ele como combinado com ele. A devolução ao aluno é pedida ao profissional, que pode fazê-la
  pelo próprio painel.
- Dúvida ou desacordo sobre uma cobrança do profissional: resolva com ele. Se precisar, o Physiq ajuda com o que estiver
  registrado.

## 9. Planos do Physiq

O plano da conta do profissional e o plano do app para quem treina sem profissional seguem os
[Termos de assinatura](${ROTA_ASSINATURA}): preços, teste grátis, pagamento, renovação, cancelamento, desistência e reajuste.

## 10. Responsabilidades do Physiq e limites

O Physiq se compromete a:

- manter o serviço funcionando e corrigir falhas em prazo razoável;
- proteger os dados com as medidas da seção 13 da [Política de Privacidade](${ROTA_POLITICA});
- usar os dados do atendimento só para prestar o serviço (Anexo);
- avisar de incidente de segurança que possa causar risco ou dano relevante:
  - o profissional, em até **48 horas**, quando envolver os dados dos alunos dele;
  - a ANPD e as pessoas afetadas, em até 3 dias úteis, quando o Physiq for o controlador.

Limites:

- O Physiq depende de internet, dos aparelhos e de serviços de terceiros (Política, seção 7). **Não garantimos funcionamento sem
  interrupção nem livre de erros.**
- Podemos parar o serviço para manutenção. Quando der, avisamos antes.
- Não respondemos:
  - pelo que o profissional prescreve, escreve ou cobra;
  - pelas decisões tomadas com base nas estimativas do app;
  - por falhas na internet ou nos aparelhos de quem usa;
  - por caso fortuito ou força maior (Código Civil, art. 393).
- **Limite de valor:** quando a lei permitir, a responsabilidade do Physiq com o profissional fica limitada ao valor de **3
  mensalidades** do plano dele na data do fato. Não inclui lucros cessantes nem outros danos indiretos.
  - **Esse limite não vale** para o aluno, nem para dano causado de propósito ou por culpa grave.
  - Também não vale quando o profissional for consumidor, nos termos da lei.
- Recomendamos que o profissional baixe os prontuários e os relatórios de tempos em tempos.

## 11. Suspensão, encerramento e exclusão

- **Falta de pagamento** do plano do profissional ou do plano do app: segue os Termos de assinatura. O bloqueio não apaga dados.
- **Uso indevido ou ilegal:** podemos suspender ou encerrar a conta de quem usar o Physiq contra a lei ou contra estes termos. Por
  exemplo:
  - fraude;
  - tentar acessar dados de outras pessoas;
  - cadastrar dados obtidos de forma ilegal;
  - registro profissional falso;
  - menor de 16 anos.

  Quando der, avisamos antes. Salvo ordem da Justiça ou de outra autoridade, os dados seguem a Política de Privacidade.
- **Exclusão:** você pode excluir a conta quando quiser (Política, seção 10). Excluir a conta cancela a cobrança automática do
  plano.

## 12. Propriedade intelectual e conteúdo

- **O Physiq é de quem o oferece:** o código, as telas, a marca, as animações e imagens dos exercícios e os textos. As imagens de
  terceiros são usadas com licença.
- Enquanto a conta existir, você tem o direito de usar o Physiq. Esse direito é pessoal: não dá para revender o acesso, copiar o
  aplicativo nem tentar extrair o código.
- **Os dados são de quem os registra.** O que você registra é seu. Os treinos, planos e textos que o profissional cria são dele, e
  ele autoriza o Physiq a guardá-los e a mostrá-los aos alunos dele. Não vendemos dados e não os usamos para anúncios.
- Você pode exportar os seus dados (Política, seção 10).

## 13. Alterações destes termos

- Podemos mudar estes termos. Quando a mudança for relevante:
  - sai uma **versão nova**, com a data no topo;
  - avisamos no app e por e-mail com **30 dias** de antecedência;
  - quem já usa aceita a versão nova no próximo acesso.
- **Se não concordar, você pode excluir a conta, e o profissional pode cancelar o plano sem multa, antes de a mudança valer.**

## 14. Lei e foro

- Estes termos seguem a lei brasileira.
- Fica eleito o foro de Maceió/AL, cidade de quem oferece o Physiq (Código de Processo Civil, art. 63). Se você for consumidor,
  pode entrar com a ação no foro do seu domicílio (Código de Defesa do Consumidor, art. 101, I).
- Antes de ir à Justiça, tentamos resolver pelo ${EMAIL}.

## 15. Regras gerais

- **Avisos:** os nossos vão para o e-mail da sua conta e aparecem no app. Os seus vão para o ${EMAIL}.
- **Cessão:** você não pode passar este contrato a outra pessoa. O Physiq pode passar o contrato, os dados e a operação do serviço
  a uma empresa que o assuma (por exemplo, se quem oferece abrir um CNPJ), nas mesmas condições, avisando antes. Se não concordar,
  você pode excluir a conta, e o profissional pode cancelar sem multa.
- **Parte inválida:** se uma parte destes termos for considerada inválida, o resto continua valendo.
- **Tolerância:** deixar de cobrar um direito uma vez não é abrir mão dele.
- **Sem vínculo:** estes termos não criam sociedade, emprego nem representação entre o Physiq e quem usa.

## ${TITULO_ANEXO}

Este anexo faz parte dos Termos de Uso. Vale para os dados pessoais que o profissional guarda e acompanha no Physiq sobre os alunos
dele: cadastro, avaliações, medidas e fotos, anamnese, prontuário, plano alimentar, treino prescrito, diário, respostas da
pré-consulta, agenda, cobranças e recibos. Os dados da conta do profissional e o que o Physiq decide seguem a
[Política de Privacidade](${ROTA_POLITICA}).

### A1. Papéis

- **O profissional é o controlador.** Ele decide quais dados guarda, para quê e por quanto tempo, e responde por eles perante os
  alunos.
- **O Physiq é o operador.** Trata esses dados só para prestar o serviço, seguindo as instruções do profissional (LGPD, art. 39).
  As instruções são:
  - o que o profissional faz no Physiq (cadastrar, editar, prescrever, mandar, exportar, excluir);
  - o que ele pedir por escrito pelo ${EMAIL}.
- O Physiq não usa esses dados para fins próprios. Não vende, não usa para anúncios e não mistura com os dados de outras contas.
  Também não fala com os alunos, a não ser:
  - pelos avisos que o próprio app manda (notificações e e-mails do atendimento);
  - pelas mensagens que o profissional liga.

### A2. Serviços usados (suboperadores)

O profissional autoriza o uso dos serviços da seção 7 da Política de Privacidade, com o que cada um recebe e onde fica. Se
incluirmos ou trocarmos um serviço que recebe dados dos alunos, avisamos com **30 dias** de antecedência. Se não concordar, o
profissional pode cancelar sem multa.

### A3. Sigilo e acesso

- Só acessa os dados do atendimento quem precisa, para manter o serviço e dar suporte, e essa pessoa guarda sigilo.
- O suporte do Physiq tem acesso administrativo pelo site e só olha os dados quando for preciso (Política, seção 6).
- Se outra pessoa passar a ter esse acesso, ela assina um compromisso de sigilo.
- O sigilo e a segurança continuam valendo depois do fim do contrato (LGPD, art. 47).

### A4. Segurança

As medidas da seção 13 da Política de Privacidade.

O profissional ajuda na segurança:
- define o papel de cada membro da equipe;
- guarda a senha;
- guarda com cuidado o que exporta (PDFs, planilhas e arquivos de prontuário).

Nenhum sistema é infalível.

### A5. Incidentes de segurança

- Se o Physiq souber de um incidente com os dados dos alunos do profissional que possa causar risco ou dano relevante, avisa o
  profissional em até **48 horas** depois de saber, pelo e-mail da conta.
- O aviso diz (LGPD, art. 48, § 1º):
  - o que aconteceu;
  - que dados e quantos alunos podem ter sido afetados;
  - as medidas de segurança que protegiam esses dados;
  - os riscos;
  - o que já foi feito.

  O que ainda não se souber vai depois, assim que se souber.
- Assim o profissional, como controlador, consegue avisar a ANPD e os alunos dele no prazo de **3 dias úteis** da Resolução
  CD/ANPD nº 15/2024. O Physiq ajuda com as informações que tiver.

### A6. Pedidos dos alunos e de autoridades

- Se um aluno pedir algo sobre os dados do atendimento (acesso, correção, cópia ou exclusão), quem responde é o profissional. Quase
  tudo dá para fazer no próprio Physiq. O aluno também exporta e exclui a própria conta pelo app.
- Se o pedido chegar ao Physiq, encaminhamos ao profissional e o ajudamos a atender.
- Se uma autoridade pedir os dados dos alunos, só entregamos quando a lei ou uma ordem judicial obrigar, e avisamos o profissional
  antes, quando a lei permitir.

### A7. Fim do contrato

- Antes de excluir a conta, o profissional baixa os prontuários.
- Depois da exclusão:
  - o histórico de cada aluno fica guardado com a matrícula dele, para a guarda que a lei pede para o prontuário;
  - o aluno com login continua no app, sem profissional.
- As cópias de segurança guardam os dados por até 30 dias, cifradas, e depois são descartadas.

### A8. O que o profissional garante

- Tem uma base legal da LGPD para os dados dos alunos e informa os alunos de que usa o Physiq e os serviços do item A2.
- Registra o consentimento do responsável dos alunos de 16 e 17 anos e não cadastra menores de 16.
- Dá só instruções que seguem a lei e não registra dados que não sejam necessários ao atendimento.
- Responde pelas mensagens automáticas que liga e pelos arquivos que exporta.
- **Reembolso ao Physiq:** se o Physiq tiver de pagar alguém (um aluno, por decisão da Justiça ou da ANPD) por um fato que, por
  estes termos, é responsabilidade do profissional, o profissional devolve ao Physiq o que ele pagou (LGPD, art. 42, § 4º, e
  Código Civil, art. 934).
`;
