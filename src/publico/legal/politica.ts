import { FRASE_BACKUPS, FRASE_SUPORTE, servicosDaVersao } from "@/publico/privacidade/textos";
import { slug } from "./markdown";
import { TITULO_ANEXO } from "./termos";
import { ROTA_ASSINATURA, ROTA_TERMOS, VENDEDOR } from "./versao";

/**
 * hml-11 (H-28, D6) — a Política de Privacidade NOVA, em revisão: só no build de staging até a virada (src/publico/legal/versao.ts).
 * Base: o rascunho para o advogado (physiqcalc-scratch/hml/hml11/rascunhos/politica-de-privacidade.md, conferido no código do
 * 82064d3) com as decisões padrão da spec (P2: as séries saem também do banco; P4: o encarregado é o dono, pelo nome; P7: o e-mail
 * do suporte; P8: versão nova com aviso de 30 dias) e sem os marcadores do rascunho. A volta do advogado é copiada para cá.
 *
 * Um lugar só para o que a página de hoje e a /excluir-conta também dizem (src/publico/privacidade/textos.ts): a tabela de serviços
 * sai de `servicosDaVersao` (na versão da Google Play, sem o GitHub), os backups de `FRASE_BACKUPS` e o suporte de `FRASE_SUPORTE`.
 * O teste (textos.test.ts) confere o texto com o app.
 *
 * hml-12 (H-30, §1.3): o registro do aceite guarda também o responsável (nome, vínculo, como consentiu) e a origem (site, app ou
 * Google Play); a prova do aceite fica até 5 anos depois da exclusão (P3); o aviso de versão nova é por e-mail, e no app ela aparece
 * para o aceite no próximo acesso (P2).
 */

/** Onde fica cada serviço da seção 7 (o que ele recebe é o texto de SERVICOS_TERCEIROS). Serviço novo lá → o teste pede o lugar aqui. */
export const ONDE_FICA_O_SERVICO: Readonly<Record<string, string>> = {
  supabase: "o banco principal em São Paulo, Brasil; o banco do treino nos Estados Unidos",
  powersync: "Estados Unidos",
  cloudflare: "rede mundial",
  vercel: "Estados Unidos",
  google: "Estados Unidos",
  resend: "Estados Unidos",
  "mercado-pago": "Brasil",
  whatsapp: "o WhatsApp é de empresa estrangeira; a conexão do profissional fica num aparelho de quem opera o Physiq, no Brasil, e nunca no banco",
  telegram: "exterior",
  github: "Estados Unidos",
};

/** "- a;\n- b;\n- c." — a lista do Markdown com o ";" entre os itens e o "." no último. */
function listaMd(itens: string[], recuo = ""): string {
  return itens.map((item, i) => `${recuo}- ${item}${i === itens.length - 1 ? "." : ";"}`).join("\n");
}

/** A Política de Privacidade da versão do build (`loja` = a da Google Play, sem o GitHub). */
export function politicaDePrivacidade(loja: boolean): string {
  const servicos = servicosDaVersao(loja);
  const tabelaDeServicos = servicos.map((s) => `| ${s.nome} | ${s.texto} | ${ONDE_FICA_O_SERVICO[s.id] ?? ""} |`).join("\n");
  const foraDoBrasil = [
    "o banco do treino, que guarda também as avaliações e as fotos de avaliação",
    "o PowerSync",
    "a Vercel",
    "o Google",
    "o Resend",
    "o Telegram",
    ...(servicos.some((s) => s.id === "github") ? ["o GitHub"] : []),
  ];
  const email = `[${VENDEDOR.email}](mailto:${VENDEDOR.email})`;

  return `
## 1. Quem somos e como falar conosco

O Physiq é um aplicativo de treino e alimentação. O aluno acompanha o treino, a dieta e a evolução pelo app. O profissional
(personal trainer, nutricionista ou uma equipe) prescreve e acompanha pelo site physiqcalc.com.br.

O Physiq é oferecido por **${VENDEDOR.nome}**, pessoa física, CPF ${VENDEDOR.cpf}, com endereço na ${VENDEDOR.endereco}, Brasil.
Neste texto, "Physiq" e "nós" são quem oferece o aplicativo.

- **Contato para qualquer assunto de dados pessoais:** ${email}. É também o canal para a Autoridade Nacional de Proteção de Dados
  (ANPD).
- **Encarregado pelo tratamento de dados pessoais (LGPD, art. 41):** ${VENDEDOR.nome}, pelo mesmo e-mail.

## 2. Quando o Physiq decide e quando quem decide é o seu profissional

- **Se você é atendido por um profissional** (entrou pelo código, pelo convite ou pelo link de cadastro dele), quem decide sobre os
  dados do seu atendimento é **o profissional**. Ele é o **controlador** desses dados e responde por eles. São:
  - avaliações, medidas e fotos de avaliação;
  - anamnese e prontuário;
  - plano alimentar e treino prescrito;
  - agenda, cobranças e recibos;
  - as respostas da pré-consulta;
  - o diário que você manda para ele.

  O Physiq é o **operador**: guarda e processa esses dados só para o app funcionar para ele e para você, seguindo o que o
  profissional faz no app (LGPD, art. 39). As regras entre o profissional e o Physiq estão no Anexo dos
  [Termos de Uso](${ROTA_TERMOS}#${slug(TITULO_ANEXO)}).
- **O Physiq é o controlador** de:
  - os dados da sua conta (login, nome, e-mail e foto do perfil);
  - tudo de quem treina **sem profissional** (o plano do app);
  - os pagamentos feitos **ao Physiq** (o plano do profissional e o plano do app);
  - os avisos que o app manda;
  - os dados técnicos de segurança.

## 3. Que dados tratamos e para quê

| Grupo | Dados | Para quê |
|---|---|---|
| Conta | nome, e-mail e foto (do Google, quando você entra com ele) ou e-mail e senha (a senha fica cifrada no serviço de login) | entrar no app e falar com você sobre a conta |
| Cadastro e perfil | telefone, CPF, data de nascimento, sexo, peso, altura, objetivo e o que você ou o seu profissional preencherem | identificar você no atendimento e calcular as metas (gasto de energia, % de gordura, macronutrientes) |
| Treino | exercícios, séries, cargas, repetições, tempos, distâncias, datas, comentários e a academia | montar e registrar o treino e mostrar a evolução |
| Avaliações | dobras, medidas, composição corporal e fotos de avaliação (frente, costas e laterais) | acompanhar a evolução com o profissional |
| Alimentação | plano alimentar, refeições marcadas, metas, e as fotos e comentários do diário alimentar | acompanhar a dieta com o nutricionista |
| Prontuário e pré-consulta | anamnese, antropometria, exames, gestação, as anotações clínicas do nutricionista e as respostas da pré-consulta | o atendimento do nutricionista |
| Agenda e pagamentos ao profissional | consultas, mensalidades, cobranças, comprovantes de Pix e recibos | o profissional organizar o atendimento e receber |
| Pagamentos ao Physiq | plano, valor, situação, vencimento e o identificador do pagamento no Mercado Pago (o número do cartão não passa pelo Physiq) | cobrar o plano do profissional e o plano do app |
| Profissional | registro no conselho (CRN, CREF), WhatsApp, endereço, carimbo, chave Pix de recebimento e, quando ele liga as mensagens automáticas, a conexão do WhatsApp dele | o perfil profissional, os recibos e os avisos aos alunos |
| Aceite e consentimentos | data, hora e versão aceita dos Termos e desta política; o consentimento do dado de saúde; e, para quem tem 16 ou 17 anos, o consentimento do responsável (nome, vínculo e como consentiu, registrados pelo profissional); e de onde veio cada aceite (site, app ou Google Play) | provar o aceite e o consentimento |
| Técnicos | identificador do usuário, datas, o código do aparelho para as notificações, um código feito a partir do endereço IP (não o IP) para limitar tentativas, e os avisos de erro, sem dado pessoal | segurança, notificações e correção de erros |

Não usamos os seus dados para publicidade e não vendemos dados. Não há rastreadores de terceiros no site nem no app (como Google
Analytics ou Facebook Pixel).

**Os dados da conta são necessários para usar o Physiq:** sem nome e e-mail não dá para criar a conta. Os outros dados são
preenchidos por você ou pelo seu profissional, conforme o uso.

## 4. Dados de saúde

Estes são **dados pessoais sensíveis** (LGPD, art. 5º, II, e art. 11):
- peso, medidas, dobras e composição corporal;
- fotos de avaliação;
- anamnese, prontuário, exames e gestação;
- a alimentação e o diário;
- as respostas de saúde da pré-consulta.

Eles servem só ao seu acompanhamento e às funções do app que você usa. Nunca são usados para publicidade, nem compartilhados para
obter vantagem econômica (art. 11, § 4º).

- **Com profissional:** a base é a tutela da saúde, em procedimento feito por profissional de saúde (art. 11, II, "f"). Quem
  decide é o profissional (seção 2).
- **Sem profissional (o plano do app) e na pré-consulta pelo link:** antes de enviar, a tela pede o seu **consentimento
  específico e em destaque** (art. 11, I). Você pode retirar o consentimento quando quiser, pelo e-mail da seção 1. O que já foi
  feito antes continua válido (art. 8º, § 5º). Sem esse consentimento, o app não guarda os seus dados de saúde no plano sem
  profissional, e a pré-consulta não é enviada.

## 5. Base legal de cada uso (LGPD, arts. 7º e 11)

| Uso | Base legal |
|---|---|
| Conta, login, perfil e as funções do app | execução do contrato, que são os Termos de Uso (art. 7º, V) |
| Dado de saúde no atendimento pelo profissional | tutela da saúde, em procedimento feito por profissional de saúde (art. 11, II, "f"). Decide o profissional |
| Dado de saúde de quem treina sem profissional, e as respostas da pré-consulta | consentimento específico e em destaque (art. 11, I) |
| Cadastro pelo link do profissional | procedimentos preliminares do contrato com o profissional (art. 7º, V). Decide o profissional |
| Pagamentos ao Physiq | execução do contrato (art. 7º, V) e cumprimento de obrigação legal, nos registros fiscais e de pagamento (art. 7º, II) |
| Avisos (notificações, e-mails e lembretes) | execução do contrato (art. 7º, V). As mensagens automáticas de WhatsApp são do profissional, que decide e responde por elas |
| Captcha, limite de tentativas, registros de segurança e avisos de erro | legítimo interesse em proteger o app e as contas (art. 7º, IX). Esses registros não levam dado de saúde |
| Cópias de segurança | a mesma base do dado copiado, e o dever de segurança (art. 46) |
| Guardar o que a lei manda depois da exclusão (prontuário) | cumprimento de obrigação legal (art. 7º, II, e art. 11, II, "a") |
| Guardar o necessário para a defesa em processo | exercício regular de direitos (art. 7º, VI, e art. 11, II, "d") |
| Registro do aceite e dos consentimentos | exercício regular de direitos (art. 7º, VI) |

## 6. Quem vê os seus dados

- Você vê os seus dados.
- O seu personal vê o treino e as avaliações. O seu nutricionista vê a alimentação e o prontuário. As anotações clínicas ficam só
  com o nutricionista.
- O dono da conta do profissional vê os alunos da conta. O membro da equipe vê os alunos de que é responsável.
- **Suporte do Physiq:** ${FRASE_SUPORTE} Quem tem esse acesso guarda sigilo sobre os dados.

## 7. Com quem compartilhamos

Só com os serviços que fazem o Physiq funcionar (operadores), e só com o necessário. A conexão é sempre criptografada (HTTPS). O
banco principal (conta, alimentação, agenda e pagamentos) fica em São Paulo, Brasil, e o banco do treino (treino e avaliações),
nos Estados Unidos (região us-east-1).

| Serviço | O que recebe | Onde |
|---|---|---|
${tabelaDeServicos}

- **Quem instala pela Google Play:** a instalação e as atualizações seguem a política de privacidade do Google. O login com o
  Google, o WhatsApp e o Mercado Pago também seguem as políticas deles.
- **Autoridades:** só entregamos dados a uma autoridade quando a lei ou uma ordem judicial obrigar (Marco Civil da Internet,
  art. 10). Se forem dados que um profissional controla, avisamos o profissional antes, quando a lei permitir.
- **Troca de quem oferece o Physiq:** os dados passam para quem assumir o serviço, que segue esta política, se o Physiq:
  - passar a ser oferecido por uma empresa (por exemplo, se quem oferece abrir um CNPJ); ou
  - for vendido.

  Avisamos antes.

## 8. Dados fora do Brasil

Ficam fora do Brasil, principalmente nos Estados Unidos:
${listaMd(foraDoBrasil)}

A transferência segue o art. 33 da LGPD e as garantias de proteção de dados que esses serviços oferecem.

## 9. Por quanto tempo guardamos

| O quê | Por quanto tempo |
|---|---|
| Dados da conta e do app | enquanto a conta existir, inclusive com o plano vencido: o bloqueio por falta de pagamento não apaga nada |
| Séries de treino | as com mais de 12 meses são apagadas automaticamente, do aparelho e do banco |
| O que o profissional exclui (respostas da pré-consulta, anamneses, antropometrias e planos alimentares) | 30 dias na lixeira; depois, apagado de vez |
| Aluno removido pelo profissional | o cadastro e o histórico ficam guardados com o profissional; a lixeira não apaga |
| Quando você exclui a conta | o login e os seus dados próprios saem na hora (seção 10); o que o profissional registrou no atendimento fica com ele |
| Prontuário do nutricionista | 20 anos a partir do último registro (Res. CFN nº 594/2017 e Lei nº 13.787/2018) |
| Contagem de tentativas | só um código feito a partir do IP: 1 dia nas páginas sem login e 2 dias no login com senha. A conta bloqueada por excesso de tentativas fica bloqueada até ser destravada (senha nova ou entrar com o Google) |
| Avisos de erro | 30 dias |
| Registros dos serviços (login e servidor) | poucos dias, conforme cada serviço |
| Cópias de segurança do banco | ${FRASE_BACKUPS} |
| Pagamentos ao Physiq | 5 anos, pelos registros fiscais e de pagamento |
| Aceite e consentimentos | enquanto a conta existir e até 5 anos depois de excluída, só para provar o aceite, sem uso para outro fim |

No fim de cada prazo, os dados são apagados. Fica só o que a lei mandar guardar ou o que for preciso para a defesa em processo
(LGPD, art. 16).

## 10. Seus direitos (LGPD, art. 18)

Você pode pedir, a qualquer momento e sem custo:

- **confirmação** de que tratamos os seus dados, e **acesso** a eles;
- **correção** de dados incompletos, errados ou desatualizados. Quase tudo dá para corrigir no próprio app, ou pedir ao seu
  profissional;
- **anonimização, bloqueio ou eliminação** de dados desnecessários, excessivos ou tratados em desacordo com a LGPD;
- **portabilidade:** no app, Perfil › Exportar meus dados baixa os seus dados num arquivo;
- **exclusão:** pelo app ou pela página [Excluir conta](/excluir-conta). Antes de confirmar, o app mostra o que vai acontecer;
  - **aluno** (Perfil › Excluir minha conta):
    - saem o seu login e os seus dados de treino, o diário, as refeições e metas marcadas, a foto do perfil, os avisos e a cópia
      do treino guardada no aparelho;
    - no banco do treino fica só um registro técnico, sem e-mail, sem senha e sem sessão, para o histórico do profissional não
      perder a referência;
    - o que o profissional registrou no seu atendimento fica com ele, desligado do seu login;
  - **profissional** (Configurações › Excluir minha conta):
    - antes, ele baixa os prontuários;
    - o login é desativado e fica sem e-mail;
    - a conta é encerrada, a equipe perde o acesso e a cobrança automática do plano é cancelada;
    - o histórico de cada aluno fica guardado com ele;
  - **nos dois casos:** o registro dos seus aceites e consentimentos fica guardado por 5 anos, só para provar o aceite;
- **informação** sobre com quem compartilhamos os seus dados (seção 7);
- **informação** sobre a possibilidade de não dar o consentimento e o que acontece se você não der, e **revogação** do
  consentimento (seção 4);
- **oposição** a um tratamento que não cumpra a LGPD;
- **revisão** de decisão tomada só de forma automática que afete os seus interesses. Os cálculos do app (metas, % de gordura) são
  estimativas para você e o seu profissional, e não decidem nada sozinhos.

**Como pedir:** no próprio app, quando der, ou pelo e-mail da seção 1. Podemos pedir que você confirme que é você. A resposta
completa sai em até **15 dias** (art. 19, II).

Se o dado é do seu atendimento, fale primeiro com o seu profissional (ele é o controlador, seção 2). Se o pedido chegar a nós,
nós o ajudamos a atender. Você também pode reclamar à ANPD (gov.br/anpd).

## 11. Menores de idade

- O Physiq é para quem tem **16 anos ou mais**.
- **De 16 a 17 anos:** só como aluno de um profissional, com o consentimento de um dos pais ou do responsável legal, registrado
  no cadastro pelo profissional. O profissional confere a idade e guarda esse consentimento (Anexo dos Termos de Uso).
- **Treinar sem profissional (o plano do app) e ser profissional:** só para maiores de 18 anos ou emancipados (Código Civil,
  art. 5º).
- O tratamento é sempre feito no melhor interesse do adolescente (LGPD, art. 14, e Enunciado CD/ANPD nº 1/2023).
- Se soubermos de uma conta de menor de 16 anos, ou de 16 ou 17 anos sem o consentimento, ela é suspensa e os dados são
  apagados, salvo o que a lei mandar guardar.

## 12. Cookies e armazenamento no aparelho

Usamos só o necessário:
- a sessão do login, guardada no navegador ou no app, para manter você conectado;
- a cópia do treino no aparelho, para funcionar sem internet;
- as preferências (como o tema) e os avisos que você já fechou.

Não usamos cookies de publicidade nem de análise. O captcha da Cloudflare e o formulário de pagamento do Mercado Pago podem usar
recursos próprios do navegador.

## 13. Segurança

- Cada pessoa só vê o que pode ver: há regras de acesso no banco, linha por linha.
- A conexão é sempre cifrada (HTTPS).
- As chaves secretas ficam só no servidor.
- Os comprovantes e as fotos ficam num armazenamento privado e são abertos por links que valem pouco tempo.
- O login tem captcha e limite de tentativas.
- O acesso administrativo existe só pelo site.
- Os registros do servidor e os avisos de erro não levam dado pessoal.
- As notificações não mostram nome nem valor.
- Há uma cópia de segurança diária, cifrada.

Nenhum sistema é infalível.

## 14. Incidentes de segurança

Pode acontecer um incidente de segurança que cause risco ou dano relevante. Nesse caso:

- **Nos dados em que o Physiq é o controlador** (seção 2): avisamos a ANPD e as pessoas afetadas em até 3 dias úteis (LGPD,
  art. 48, e Resolução CD/ANPD nº 15/2024).
- **Nos dados do atendimento** (o profissional é o controlador): avisamos o profissional em até **48 horas** depois de saber. Ele
  avisa a ANPD e os alunos dele no prazo, e nós o ajudamos com as informações que tivermos.

O aviso diz:
- o que aconteceu;
- que dados e quantas pessoas podem ter sido afetadas;
- as medidas de segurança que protegiam esses dados;
- os riscos;
- o que já foi feito;
- o contato.

## 15. Mudanças nesta política

Quando esta política mudar de forma relevante, sai uma **versão nova**, com a data no topo desta página. Avisamos por e-mail com
**30 dias** de antecedência. No app, a versão nova aparece para o aceite no próximo acesso depois da data: quem já usa o Physiq
aceita a versão nova nesse acesso.

Quem não concordar pode excluir a conta. O profissional pode cancelar o plano sem multa
([Termos de assinatura](${ROTA_ASSINATURA})).
`;
}
