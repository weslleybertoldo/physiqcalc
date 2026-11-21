---
aprovado: não
assunto: Physiq: versão nova da Política de Privacidade a partir de 22 de dezembro de 2026
---
<!--
D8 da restauração de login (versão de 22/12/2026) — o texto do aviso de 30 dias ANTES de uma versão nova dos textos legais (P2; a
Política, seção 15), enviado por scripts/legal/avisar_textos.py prod --previo. Rodar na worktree do PR da versão nova: o script lê a
versão e a data do versao.ts da pasta onde roda.
- Só sai com "aprovado: sim" no topo (o dono aprova o texto final antes do --enviar, P11; no orquestrador, o ok_id da caixa) e com a
  confirmação digitada na hora ("ENVIAR <n>"; a trava 4 exige um terminal de verdade: rodar num tmux/pty, e quem digita é quem tem o
  ok_id, com o texto montado e o n da simulação escritos no caso).
- Rodar o --enviar --previo UMA vez: ninguém consegue aceitar a versão nova antes da data, então rodar de novo manda em dobro para todos.
- Logo depois do envio, o topo volta para "aprovado: não" no mesmo PR: depois da data, este texto fica vencido ("A partir de…"). O
  lembrete depois da data é texto novo e OK novo.
- Marcas que o script troca (só no corpo): {ola} ("Olá, Ana!" ou "Olá!"), {data_dos_textos}, {link_termos}, {link_privacidade},
  {link_assinatura}, {link_excluir} e {contato}. Os links são os do site do ambiente (nunca localhost). O assunto não troca marca:
  a data dele é escrita à mão e tem de ser a do DATA_DOS_TEXTOS.
- Linha em branco separa parágrafos; linha que começa com "- " vira item de lista. Este comentário não vai no e-mail.
- Até a data, o {link_privacidade} abre a versão de antes (a nova só entra no ar no dia): por isso o próprio e-mail diz o que muda.
- O 1º texto (a virada de 29/10/2026) saiu no dia (P1); desde então, cada versão nova avisa 30 dias antes ("A partir de …").
-->
{ola}

A partir de {data_dos_textos}, vale uma versão nova da Política de Privacidade do Physiq. Os Termos de Uso e os Termos de assinatura não mudam: só passam a ter a mesma data.

O que muda: no app do Physiq para Android, quando você trocar de celular, ele pode abrir já na sua conta, sem você precisar entrar de novo. Para isso, quando você entra ou abre o app já conectado, o app cria sozinho uma chave de entrada. O próprio Android guarda essa chave no celular e, se o backup do Google e o bloqueio de tela estiverem ligados, também no backup da sua conta Google, criptografada de ponta a ponta, segundo o Google. Quando você passa os seus apps para o celular novo, pelo backup do Google ou pela cópia direta de um celular para o outro, o Android pode levar essa chave junto.

No servidor do Physiq ficam a parte pública dessa chave (sozinha, ela não serve para entrar), ligada à sua conta, e alguns dados técnicos, como a marca e o modelo do celular e as datas de uso. A chave não leva o seu e-mail. No site, essa função não existe. Ao sair da conta no app (Sair), o app pede ao Android que apague a chave do celular e do backup; quando você entrar de novo, o app cria outra. O app não tem opção para desligar essa função.

A chave vale no máximo 13 meses e é trocada quando você abre o app depois de 6 meses. Desligada (ao sair da conta com internet, ao trocar a senha ou ao excluir a conta), ela não entra mais, e o registro dela sai do servidor cerca de 90 dias depois (na exclusão da conta de quem é só aluno, na hora). A base legal é o legítimo interesse, num serviço que beneficia você (seção 5).

A versão nova também muda 2 pontos que valem para todos: os registros das funções do servidor levam códigos técnicos, como o identificador da conta, e o texto técnico do erro; os avisos de erro levam o texto técnico do erro sem o e-mail, o telefone, o CPF e o IP que o sistema reconhece, e nunca o identificador da conta. A versão de hoje dizia que eles não levavam dado pessoal (seção 13). E o bloqueio por senhas erradas vale só para o login por senha: entrar com o Google ou com a chave continua funcionando (seção 9).

No 1º acesso a partir de {data_dos_textos}, no app ou no site, o Physiq vai pedir que você leia e aceite a versão nova. Depois do aceite, tudo abre normalmente. No celular Android, a partir dessa data, atualize o app do Physiq.

Os textos de hoje estão nos links abaixo. A versão nova entra no mesmo endereço em {data_dos_textos}.
- Política de Privacidade: {link_privacidade}
- Termos de Uso: {link_termos}
- Termos de assinatura: {link_assinatura}

Se não concordar, antes dessa data você pode excluir a sua conta, pelo app ou pela página {link_excluir}, e quem é profissional pode cancelar o plano sem multa.

Dúvidas? Escreva para {contato}.

Weslley
Physiq

Você recebeu este e-mail porque tem uma conta no Physiq.
