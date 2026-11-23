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
function cards(store){
 if(!store||!store.userId)return [];
 var hasBenefits=!!(root.AlicerceBeneficios&&root.AlicerceBeneficios.wallets(store).length);
 var hasExpenses=!!(Array.isArray(store.movements)&&store.movements.length);
 var options=FEATURES.filter(function(f){return !f.needsBenefits||hasBenefits;});
 // No início, mostre primeiro funções úteis a quem ainda não registrou despesas.
 if(!hasExpenses){
   options=options.slice().sort(function(a,b){
     var priorities={chat:0,gasto:1,beneficios:2,beneficiochat:3,corrigir:4,cartoes:5,calendario:6,visao:7,atualizacoes:8};
     return priorities[a.id]-priorities[b.id];
   });
 }else{
   options=options.slice().sort(function(a,b){
     var priorities={chat:0,beneficios:1,beneficiochat:2,corrigir:3,visao:4,gasto:5,cartoes:6,calendario:7,atualizacoes:8};
     return priorities[a.id]-priorities[b.id];
   });
 }
 return options.map(function(f){return {pr:6,type:"alicia-guia",id:f.id,title:f.title,text:f.text,lbl:f.label,go:"go('"+f.go+"')",guide:true};});
}
root.AlicerceGuiaAlicia={cards:cards,features:FEATURES};
})(typeof window!=="undefined"?window:globalThis);
