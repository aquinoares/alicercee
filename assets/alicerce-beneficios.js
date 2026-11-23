/* Alicerce · carteiras de vale-alimentação (Pluxee/Sodexo e Sólides)
 * Origem: Store.settings.benefitWalletsV1 — isolado por conta, sincronizado como settings.
 * Nunca altera Store.movements, limite de cartão, saldo bancário nem cria receita salarial.
 */
(function(root){
"use strict";
if(root.AlicerceBeneficios)return;
var PROVIDERS={pluxee:"Sodexo / Pluxee",solides:"Sólides Benefícios"};
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
function validMoney(value){
 var raw=String(value==null?"":value).trim();
 if(!/^\d{1,8}(?:[.,]\d{1,2})?$/.test(raw))return null;
 var n=Number(raw.replace(",","."));return Number.isFinite(n)&&n>0&&n<=10000000?Math.round(n*100)/100:null;
}
function money(n){return (Number(n)||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});}
function ensure(store){
 if(!store||!store.userId||!store.settings)return [];
 if(!Array.isArray(store.settings.benefitWalletsV1))store.settings.benefitWalletsV1=[];
 return store.settings.benefitWalletsV1;
}
function wallets(store){return ensure(store).filter(function(w){return w&&PROVIDERS[w.provider]&&w.type==="alimentacao"&&Array.isArray(w.entries);});}
function balance(w){return Math.round((w.entries||[]).reduce(function(total,item){var n=Number(item.amount)||0;return total+(item.kind==="credit"?n:-n);},0)*100)/100;}
function addWallet(store,provider,showHome){
 if(!Object.prototype.hasOwnProperty.call(PROVIDERS,provider))return {ok:false,error:"Selecione Pluxee/Sodexo ou Sólides."};
 var list=ensure(store);if(!store||!store.userId)return {ok:false,error:"Entre na sua conta para salvar."};
 var w={id:typeof store._uid==="function"?store._uid():"va-"+Date.now()+"-"+Math.random().toString(36).slice(2),provider:provider,type:"alimentacao",showHome:!!showHome,entries:[],createdAt:new Date().toISOString()};
 list.push(w);store.save();
 return {ok:true,wallet:w};
}
function addEntry(store,id,kind,amount,date,description){
 var w=wallets(store).find(function(row){return String(row.id)===String(id);});
 if(!w)return {ok:false,error:"Não encontrei essa carteira na sua conta."};
 if(!["credit","debit"].includes(kind))return {ok:false,error:"Escolha recarga ou compra."};
 var n=validMoney(amount);
 if(n===null)return {ok:false,error:"Informe um valor positivo válido."};
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||"")))return {ok:false,error:"Informe a data completa."};
 var parsed=new Date(date+"T12:00:00Z");
 if(Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)return {ok:false,error:"Data inválida."};
 if(kind==="debit"&&n>balance(w))return {ok:false,error:"Saldo insuficiente. Confira suas recargas ou o saldo inicial."};
 var label=String(description||"").trim().slice(0,120);
 if(kind==="debit"&&!label)return {ok:false,error:"Descreva a compra (por exemplo, supermercado)."};
 w.entries.push({id:typeof store._uid==="function"?store._uid():"entry-"+Date.now()+"-"+Math.random().toString(36).slice(2),kind:kind,amount:n,date:date,description:label||"Recarga do benefício",createdAt:new Date().toISOString()});
 store.save();return {ok:true,wallet:w};
}
function toggleHome(store,id,show){
 var w=wallets(store).find(function(row){return String(row.id)===String(id);});
 if(!w)return false;
 w.showHome=!!show;store.save();return true;
}
function removeEntry(store,walletId,entryId){
 var w=wallets(store).find(function(row){return String(row.id)===String(walletId);});
 if(!w)return false;
 var next=w.entries.filter(function(e){return String(e.id)!==String(entryId);});
 if(next.length===w.entries.length)return false;
 if(next.reduce(function(total,e){return total+(e.kind==="credit"?Number(e.amount):-Number(e.amount));},0)<-0.001)return false;
 w.entries=next;store.save();return true;
}
function snapshot(store){
 return wallets(store).map(function(w){
  var spent=0,credit=0;
  (w.entries||[]).forEach(function(e){if(e.kind==="credit")credit+=Number(e.amount)||0;else spent+=Number(e.amount)||0;});
  return {id:w.id,provider:w.provider,name:PROVIDERS[w.provider],showHome:!!w.showHome,balance:balance(w),spent:Math.round(spent*100)/100,credit:Math.round(credit*100)/100,entries:w.entries.length};
 });
}
function renderHome(store){
 var visible=snapshot(store).filter(function(w){return w.showHome;});
 if(!visible.length)return "";
 var html='<section class="al-benefits-home" aria-label="Vales-alimentação na página principal">';
 visible.forEach(function(w){
  html+='<button type="button" class="al-benefit-home-card" onclick="go(\'beneficios\')" aria-label="Abrir carteira '+esc(w.name)+'">';
  html+='<span class="al-benefit-symbol">VA</span><span class="al-benefit-home-info"><strong>'+esc(w.name)+'</strong><small>Vale-alimentação · saldo registrado</small></span><span class="al-benefit-home-value">'+esc(money(w.balance))+'</span></button>';
 });
 return html+'</section>';
}
function renderPage(store,today){
 var items=wallets(store),selected=store.screenData&&store.screenData.benefitWalletId;
 var w=items.find(function(x){return String(x.id)===String(selected);})||items[0];
 var html='<div class="content al-benefits-page"><button class="btn btn-secondary btn-sm mt-4" onclick="go(\'home\')">‹ Início</button><div class="section-title mt-4">Meus benefícios</div>';
 html+='<p class="text-muted text-sm">Carteiras de vale-alimentação. Não fazem parte do saldo bancário nem do limite do cartão de crédito.</p>';
 if(!items.length){
  html+='<div class="card mt-4"><h3>Comece por um vale-alimentação</h3><p class="text-muted text-sm">Escolha o fornecedor abaixo. O saldo começa em zero até você registrar uma recarga ou saldo inicial.</p></div>';
 }else{
  html+='<div class="al-benefit-switches mt-4">'+items.map(function(x){return '<button class="al-benefit-chip'+(x===w?' active':'')+'" type="button" onclick="go(\'beneficios\',{benefitWalletId:'+JSON.stringify(x.id).replace(/"/g,"&quot;")+'})">'+esc(PROVIDERS[x.provider])+'</button>';}).join("")+'</div>';
  html+='<section class="al-benefit-detail card mt-3"><div class="al-benefit-heading"><span class="al-benefit-symbol">VA</span><div><strong>'+esc(PROVIDERS[w.provider])+'</strong><small>Vale-alimentação · saldo registrado manualmente</small></div></div><div class="al-benefit-total">'+esc(money(balance(w)))+'</div>';
  html+='<label class="al-benefit-toggle"><input type="checkbox" id="benefit-home-visible" '+(w.showHome?'checked':'')+' onchange="alicerceBeneficioHome('+esc(JSON.stringify(w.id)) +',this.checked)"> Exibir este cartão na tela principal</label>';
  html+='<div class="al-benefit-fields"><label>Movimentação<select id="benefit-entry-kind" class="input"><option value="credit">Recarga / saldo inicial</option><option value="debit">Compra no mercado</option></select></label>';
  html+='<label>Valor (R$)<input id="benefit-entry-amount" class="input" inputmode="decimal" placeholder="Ex.: 150,00"></label>';
  html+='<label>Data<input id="benefit-entry-date" type="date" class="input" value="'+esc(today)+'"></label>';
  html+='<label>Descrição<input id="benefit-entry-description" class="input" maxlength="120" placeholder="Ex.: Compra no supermercado"></label></div>';
  html+='<button type="button" class="btn btn-primary btn-block mt-3" onclick="alicerceBeneficioAdicionar('+esc(JSON.stringify(w.id))+')">Registrar movimentação</button>';
  html+='<h3 class="mt-4">Histórico</h3>';
  if(!w.entries.length)html+='<p class="text-muted text-sm">Ainda não há recargas nem compras registradas.</p>';
  else html+='<div class="al-benefit-history">'+w.entries.slice().reverse().slice(0,30).map(function(e){return '<div class="al-benefit-history-item"><div><strong>'+esc(e.description)+'</strong><small>'+esc(e.date.split("-").reverse().join("/"))+'</small></div><strong class="'+(e.kind==="credit"?'positive':'')+'">'+(e.kind==="credit"?'+':'−')+esc(money(e.amount))+'</strong></div>';}).join("")+'</div>';
  html+='</section>';
 }
 html+='<div class="card mt-3"><h3>'+(items.length?'Adicionar outro cartão':'Adicionar cartão')+'</h3><label class="input-label">Fornecedor</label><select id="benefit-provider" class="input"><option value="pluxee">Sodexo / Pluxee</option><option value="solides">Sólides Benefícios</option></select>';
 html+='<label class="al-benefit-toggle"><input type="checkbox" id="benefit-new-showhome" checked> Mostrar na tela principal</label>';
 html+='<button class="btn btn-secondary btn-block mt-3" type="button" onclick="alicerceBeneficioCriar()">Adicionar vale-alimentação</button></div>';
 html+='<p class="text-muted text-sm mt-3">O Alicerce não consulta a operadora automaticamente. Confira o saldo real no aplicativo do fornecedor antes de registrar. Compras desta carteira não reduzem o saldo bancário.</p></div>';
 return html;
}
function answer(store,question){
 var q=String(question||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
 if(!/\b(sodexo|pluxee|solides|vale alimentacao|vale-alimentacao|beneficio|beneficios)\b/.test(q))return "";
 if(!/\b(saldo|quanto|gastei|gastou|sobrou|resta|tenho|recarga|cartao|cartoes|beneficio)\b/.test(q))return "";
 var list=snapshot(store);
 if(!list.length)return "Você ainda não cadastrou um vale-alimentação em Meus benefícios. Posso consultar o saldo assim que registrar suas recargas e compras.";
 var provider=/solides/.test(q)?"solides":/\b(sodexo|pluxee)\b/.test(q)?"pluxee":"";
 if(provider)list=list.filter(function(w){return w.provider===provider;});
 if(!list.length)return "Não encontrei essa carteira de benefício cadastrada na sua conta.";
 return list.map(function(w){return w.name+": saldo registrado "+money(w.balance)+", recargas "+money(w.credit)+", compras "+money(w.spent)+"."}).join("\n")+" Esses saldos são estimados a partir dos lançamentos feitos no Alicerce e não são sincronizados com as operadoras.";
}
root.AlicerceBeneficios={providers:PROVIDERS,wallets:wallets,balance:balance,addWallet:addWallet,addEntry:addEntry,removeEntry:removeEntry,toggleHome:toggleHome,snapshot:snapshot,renderHome:renderHome,renderPage:renderPage,answer:answer};
})(typeof window!=="undefined"?window:globalThis);
