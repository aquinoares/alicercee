/* Alicerce • Guia da Alicia no carrossel principal
 * Catálogo local de recursos existentes, sem chamadas remotas nem leitura de dados privados.
 * Botões usam apenas rotas internas autorizadas; não efetuam operações financeiras.
 */
(function(root){
"use strict";
if(root.AlicerceGuiaAlicia)return;
var FEATURES=[
 {id:"chat",title:"Converse com a Alicia",text:"Eu posso responder perguntas sobre seus gastos, analisar valores registrados e ajudar a entender seu dinheiro.",go:"assistente",label:"Conversar agora"},
 {id:"gasto",title:"Registre compras sem complicação",text:"Em Adicionar gasto, informe valor, produto e pagamento. Eu ajudo na classificação antes de você confirmar.",go:"addGasto",label:"Adicionar gasto"},
 {id:"beneficios",title:"Sodexo/Pluxee e Sólides",text:"Cadastre seu vale-alimentação, registre recargas e compras e confira o saldo separado do banco.",go:"beneficios",label:"Ver meus benefícios",needsBenefits:true},
 {id:"beneficiochat",title:"Compra pelo chat da Alicia",text:"Diga: “Comprei R$ 35 no mercado com Sodexo.” Eu preparo a compra, e você confirma antes do desconto.",go:"assistente",label:"Experimentar no chat",needsBenefits:true},
 {id:"corrigir",title:"Corrija o saldo do cartão",text:"Adicionou uma recarga duas vezes? Em Meus benefícios, edite ou exclua o lançamento ou confira o saldo real.",go:"beneficios",label:"Conferir saldo",needsBenefits:true},
 {id:"cartoes",title:"Organize cartões e faturas",text:"Acompanhe cartões de crédito, compras parceladas e vencimentos no mesmo lugar.",go:"cartoes",label:"Abrir cartões"},
 {id:"calendario",title:"Não perca compromissos",text:"Use Calendário para acompanhar compromissos e lembretes. Os avisos aparecem dentro do aplicativo.",go:"calendario",label:"Abrir calendário"},
 {id:"visao",title:"Entenda sua visão financeira",text:"Consulte os gastos, compromissos e resumos financeiros. Peça também gráficos à Alicia no chat.",go:"visao",label:"Ver relatórios"},
 {id:"atualizacoes",title:"Conheça as atualizações",text:"Em Atualizações você encontra informações sobre recursos e melhorias do Alicerce. Avisos push com o app fechado ainda não estão ativos.",go:"atualizacoes",label:"Ver atualizações"}
];
var POSTS=[
 {id:"familia",title:"Como registrar uma ajuda à família",text:"Diga à Alícia quanto você deu e para quem foi. Confira a categoria Família e a data antes de salvar.",prompt:"Dei R$ 50 para meu filho ontem",link:"Experimentar no chat"},
 {id:"pix",title:"Como conferir um Pix pela foto",text:"No chat, toque no botão de foto e escolha a imagem do comprovante. Confira o valor e a data antes de registrar.",go:"assistente",link:"Abrir o chat"},
 {id:"consumo",title:"Como comparar preços de mercado",text:"Envie a foto de uma nota, revise os produtos e arquive. Depois, peça à Alícia para comparar o preço e diga a marca e o tamanho.",prompt:"Compare o preço da farofa Yoki 400g nas minhas pastas",link:"Experimentar no chat"},
 {id:"beneficios",title:"Como lançar uma compra no Sodexo",text:"Informe o valor e o que comprou. O saldo do vale diminui quando você confirma a compra.",prompt:"Comprei R$ 35 no mercado com Sodexo",link:"Experimentar no chat"},
 {id:"caixa",title:"Como ler a Visão Financeira",text:"Confira o caixa registrado, os pagamentos do mês, os valores a pagar e os valores a receber. Toque em Pedir resumo à Alícia para conversar sobre esses números.",go:"visao",link:"Abrir Visão Financeira"}
];
function cards(store){
 if(!store||!store.userId)return [];
 var hasBenefits=!!(root.AlicerceBeneficios&&root.AlicerceBeneficios.wallets(store).length);
 var priorities=hasBenefits?["chat","beneficios","beneficiochat","corrigir","visao"]:["chat","gasto","beneficios","visao"];
 var ordered=priorities.map(function(id){return FEATURES.find(function(f){return f.id===id;});});
 ordered=ordered.concat(FEATURES.filter(function(f){return !priorities.includes(f.id);}));
 var posts=POSTS.map(function(post){return {
   id:"guia-"+post.id,title:post.title,text:post.text,lbl:"Ver passo a passo",go:"go('atualizacoes')"
 };});
 var features=ordered.map(function(f){return {id:f.id,title:f.title,text:f.text,lbl:f.label,go:"go('"+f.go+"')"};});
 return features.slice(0,1).concat(posts,features.slice(1)).map(function(card){
   return Object.assign({pr:6,type:"alicia-guia",guide:true},card);
 });
}
function openPost(id){
 var post=POSTS.find(function(item){return item.id===id;});
 if(!post)return;
 if(post.prompt)AlicerceIA.experimentar(post.prompt);
 else root.go(post.go);
}
root.AlicerceGuiaAlicia={cards:cards,features:FEATURES,posts:POSTS,openPost:openPost};
})(typeof window!=="undefined"?window:globalThis);
