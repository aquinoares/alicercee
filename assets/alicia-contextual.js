/* Alicia — conversa financeira contextual, independente das novidades do app.
 * Consulta apenas dados autenticados já presentes no Store, sem alterar registros.
 * Explicações compactas; gráficos somente se há comparação relevante e pedido explícito.
 */
(function(root){
"use strict";
if(root.AlicerceAliciaContextual)return;
function norm(x){return String(x||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim();}
function money(x){return (Number(x)||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});}
function amount(v){var n=Number(v);return Number.isFinite(n)&&n>0?n:0;}
function monthBefore(s){var p=String(s).slice(0,7).split("-").map(Number);var d=new Date(p[0],p[1]-2,1);return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");}
function matches(input){
 var q=norm(input);
 if(/\b(atualizacoes?|novidades?|versao|mudancas do app|funcionalidades do aplicativo)\b/.test(q))return false;
 return /^(?:alicia[\s,]*)?(?:como (?:estao|estao indo|andam|vao|estao as|esta|ando|estou) (?:minhas financas|meus gastos|financeiramente|com o dinheiro|esse mes|este mes|de dinheiro)|me (?:da|de|mostra|mostre|faz|traga|apresenta|apresente) (?:um )?(?:resumo|panorama|diagnostico|balanco|situacao) (?:das minhas financas|financeiro|dos meus gastos|do mes|de hoje)?|(?:resumo|panorama|diagnostico|balanco|situacao) (?:financeira|financeiro|dos meus gastos|do mes)|o que (?:voce percebe|merece atencao|preciso saber) (?:nas minhas financas|nos meus gastos|do meu dinheiro)?|analisa(?:r)? (?:meu dinheiro|minhas financas|meus gastos)|analise(?: geral)? (?:das minhas financas|financeira|dos meus gastos))\??$/.test(q);
}
function report(store,day){
 if(!store||!store.userId)return {text:"Entre na sua conta para eu analisar seus dados financeiros.",facts:0};
 var month=String(day||"").slice(0,7);
 if(!/^\d{4}-\d{2}$/.test(month))return {text:"Não consegui identificar o período. Tente novamente.",facts:0};
 var old=monthBefore(month);
 var entries=typeof store.getAnalysisEntries==="function"?store.getAnalysisEntries():[];
 var records=Array.isArray(entries)?entries.filter(function(x){return x&&/^\d{4}-\d{2}-\d{2}$/.test(String(x.data||""))&&amount(x.valor); }):[];
 var current=records.filter(function(x){return x.data.slice(0,7)===month;});
 var previous=records.filter(function(x){return x.data.slice(0,7)===old;});
 var sum=function(list){return Math.round(list.reduce(function(t,x){return t+amount(x.valor);},0)*100)/100;};
 var thisTotal=sum(current),oldTotal=sum(previous);
 var bank=null;try{if(typeof store.getMotorFinanceiro==="function")bank=store.getMotorFinanceiro();}catch(e){}
 var cards=(root.AlicerceBeneficios&&typeof root.AlicerceBeneficios.snapshot==="function")?root.AlicerceBeneficios.snapshot(store):[];
 var hasCash=bank&&Number.isFinite(Number(bank.disponivel))&&(Array.isArray(store.movements)&&store.movements.length>0);
 if(!current.length&&!previous.length&&!hasCash&&!cards.length){
  return {text:"Ainda não tenho registros suficientes para analisar seu mês. Cadastre a primeira compra ou receita; depois eu consigo explicar seus números.",facts:0};
 }
 var lines=[],facts=0;
 if(current.length){lines.push("Compras registradas neste mês: "+money(thisTotal)+" ("+current.length+" lançamento"+(current.length===1?"":"s")+").");facts++;}
 else if(previous.length){lines.push("Ainda não encontrei compras registradas neste mês.");facts++;}
 if(current.length&&previous.length&&oldTotal>0){
  var delta=Math.round((thisTotal-oldTotal)/oldTotal*100);
  if(delta>=10)lines.push("Você registrou "+delta+"% a mais que no mês anterior.");
  else if(delta<=-10)lines.push("Você registrou "+Math.abs(delta)+"% a menos que no mês anterior.");
  else lines.push("Seus gastos ficaram próximos dos do mês anterior.");
  facts++;
 }
 if(current.length>0){
  var groups={};current.forEach(function(e){var label=String(e.categoria||"Outros").replace(/_/g," ");groups[label]=(groups[label]||0)+amount(e.valor);});
  var top=Object.keys(groups).sort(function(a,b){return groups[b]-groups[a];})[0];
  if(top){lines.push("Maior categoria: "+top+" · "+money(groups[top])+".");facts++;}
 }
 if(hasCash){lines.push("Caixa realizado no Alicerce: "+money(bank.disponivel)+".");facts++;}
 var benefitMonth=0;
 if(root.AlicerceBeneficios&&typeof root.AlicerceBeneficios.spentInMonth==="function"){
  var spent=root.AlicerceBeneficios.spentInMonth(store,month);benefitMonth=spent&&Number(spent.total)||0;
  if(benefitMonth>0){lines.push("Vale-alimentação no mês: "+money(benefitMonth)+" (incluído nas compras acima, fora do caixa bancário).");facts++;}
 }
 if(!facts)return {text:"Não encontrei movimentações confirmadas suficientes para um diagnóstico. Não vou estimar valores sem dados.",facts:0};
 var detail="Os valores refletem apenas o que foi registrado no aplicativo.";
 if(current.length&&previous.length)detail="Comparei somente lançamentos registrados; meses incompletos podem parecer menores.";
 return {text:lines.slice(0,5).join("\n")+"\n"+detail,facts:facts,total:thisTotal,previousTotal:oldTotal,benefitMonth:benefitMonth};
}
root.AlicerceAliciaContextual={matches:matches,report:report};
})(typeof window!=="undefined"?window:globalThis);
