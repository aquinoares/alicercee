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
function balance(w){return Math.round((w.entries||[]).reduce(function(total,item){var n=Number(item.amount)||0;return total+(item.kind==="credit"||item.kind==="adjustment"?n:-n);},0)*100)/100;}
function addWallet(store,provider,showHome){
 if(!Object.prototype.hasOwnProperty.call(PROVIDERS,provider))return {ok:false,error:"Selecione Pluxee/Sodexo ou Sólides."};
 var list=ensure(store);if(!store||!store.userId)return {ok:false,error:"Entre na sua conta para salvar."};
 if(list.some(function(w){return w&&w.provider===provider&&w.type==="alimentacao";}))return {ok:false,error:"Esse fornecedor já está cadastrado. Use o cartão existente para corrigir o saldo."};
 var w={id:typeof store._uid==="function"?store._uid():"va-"+Date.now()+"-"+Math.random().toString(36).slice(2),provider:provider,type:"alimentacao",showHome:!!showHome,entries:[],createdAt:new Date().toISOString()};
 list.push(w);store.save();
 return {ok:true,wallet:w};
}
function addEntry(store,id,kind,amount,date,description,details){
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
 var meta=details&&typeof details==="object"?details:{};
 var entry={id:typeof store._uid==="function"?store._uid():"entry-"+Date.now()+"-"+Math.random().toString(36).slice(2),kind:kind,amount:n,date:date,description:label||"Recarga do benefício",createdAt:new Date().toISOString()};
 if(kind==="debit"){
   entry.category=String(meta.category||"alimentacao").slice(0,60);
   entry.subcategory=String(meta.subcategory||"").slice(0,60);
   entry.merchant=String(meta.merchant||"").slice(0,100);
   entry.origin=String(meta.origin||"benefits").slice(0,40);
   entry.purpose=String(meta.purpose||"").slice(0,120);
 }
 w.entries.push(entry);
 store.save();return {ok:true,wallet:w};
}
function toggleHome(store,id,show){
 var w=wallets(store).find(function(row){return String(row.id)===String(id);});
 if(!w)return false;
 w.showHome=!!show;store.save();return true;
}

function validDate(date){
 var d=String(date||"");if(!/^\d{4}-\d{2}-\d{2}$/.test(d))return false;
 var parsed=new Date(d+"T12:00:00Z");return !Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===d;
}
function recalc(entries){return Math.round(entries.reduce(function(total,e){var v=Number(e.amount)||0;return total+(e.kind==="credit"||e.kind==="adjustment"?v:-v);},0)*100)/100;}
function setBalance(store,id,target,date){
 var w=wallets(store).find(function(x){return String(x.id)===String(id);});
 if(!w)return {ok:false,error:"Cartão não encontrado."};
 var raw=String(target==null?"":target).trim();
 if(!/^\d{1,8}(?:[.,]\d{1,2})?$/.test(raw))return {ok:false,error:"Informe o saldo real, igual ou maior que zero."};
 var number=Number(raw.replace(",","."));if(!Number.isFinite(number)||number<0)return {ok:false,error:"Saldo inválido."};
 if(!validDate(date))return {ok:false,error:"Data inválida."};
 var delta=Math.round((number-balance(w))*100)/100;
 if(delta===0)return {ok:true,unchanged:true,wallet:w};
 w.entries.push({id:typeof store._uid==="function"?store._uid():"cor-"+Date.now(),kind:"adjustment",amount:delta,date:date,description:"Conferência de saldo real",origin:"manual-reconciliation",createdAt:new Date().toISOString()});
 store.save();return {ok:true,wallet:w,delta:delta};
}
function updateEntry(store,walletId,entryId,amount,date,description){
 var w=wallets(store).find(function(x){return String(x.id)===String(walletId);});
 if(!w)return {ok:false,error:"Cartão não encontrado."};
 var i=w.entries.findIndex(function(e){return String(e.id)===String(entryId);});
 if(i<0)return {ok:false,error:"Lançamento não encontrado."};
 if(w.entries[i].kind==="adjustment")return {ok:false,error:"Para alterar uma conferência de saldo, faça uma nova conferência."};
 var n=validMoney(amount),label=String(description||"").trim().slice(0,120);
 if(n===null)return {ok:false,error:"Informe um valor positivo válido."};
 if(!validDate(date))return {ok:false,error:"Data inválida."};
 if(!label)return {ok:false,error:"Informe uma descrição."};
 var next=Object.assign({},w.entries[i],{amount:n,date:date,description:label,updatedAt:new Date().toISOString()});
 var hypothetical=w.entries.slice();hypothetical[i]=next;
 if(recalc(hypothetical)<0)return {ok:false,error:"Essa correção deixaria o saldo negativo. Confira as outras recargas e compras."};
 w.entries[i]=next;store.save();return {ok:true,wallet:w};
}
function deleteWallet(store,id){
 var list=ensure(store),i=list.findIndex(function(w){return w&&String(w.id)===String(id);});
 if(i<0)return {ok:false,error:"Cartão não encontrado."};
 list.splice(i,1);store.save();return {ok:true};
}
function updateWalletName(store,id,name){
 var w=wallets(store).find(function(x){return String(x.id)===String(id);});
 if(!w)return {ok:false,error:"Cartão não encontrado."};
 var value=String(name||"").trim();
 if(value.length>50)return {ok:false,error:"Use um nome com até 50 caracteres."};
 w.alias=value;store.save();return {ok:true,wallet:w};
}
function removeEntry(store,walletId,entryId){
 var w=wallets(store).find(function(row){return String(row.id)===String(walletId);});
 if(!w)return false;
 var next=w.entries.filter(function(e){return String(e.id)!==String(entryId);});
 if(next.length===w.entries.length)return false;
 if(recalc(next)<-0.001)return false;
 w.entries=next;store.save();return true;
}
// Read-only projection: no additional financial movement and no balance mutation.
function spendingEntries(store){
 var rows=[],seen=new Set();
 wallets(store).forEach(function(w){
   w.entries.forEach(function(e){
     if(!e||e.kind!=="debit"||!e.id||!validDate(e.date)||!Number.isFinite(Number(e.amount))||Number(e.amount)<=0)return;
     if(["transfer","refund","adjustment"].includes(e.financialRole))return;
     var id="benefit:"+String(w.id)+":"+String(e.id);
     if(seen.has(id))return;seen.add(id);
     rows.push({id:id,benefitWalletId:String(w.id),tipo:"despesa",data:e.date,valor:Number(e.amount),
       categoria:e.category==="alimentacao"?"comida":e.category||"comida",
       subcategoria:e.subcategory||"outros",descricao:e.description||"Compra com benefício",
       local:e.merchant||"",purpose:e.purpose||"",origin:e.origin||"benefits",
       pagamento:w.alias||PROVIDERS[w.provider]});
   });
 });
 return rows;
}
function spentInMonth(store,month){return wallets(store).reduce(function(result,w){(w.entries||[]).forEach(function(e){if(e.kind==="debit"&&String(e.date||"").slice(0,7)===month){result.total+=Number(e.amount)||0;result.count++;result.byProvider[w.provider]=(result.byProvider[w.provider]||0)+(Number(e.amount)||0);}});return result;},{total:0,count:0,byProvider:{}});}
function snapshot(store){
 return wallets(store).map(function(w){
  var spent=0,credit=0;
  (w.entries||[]).forEach(function(e){if(e.kind==="credit")credit+=Number(e.amount)||0;else if(e.kind==="debit")spent+=Number(e.amount)||0;});
  return {id:w.id,provider:w.provider,name:w.alias||PROVIDERS[w.provider],showHome:!!w.showHome,balance:balance(w),spent:Math.round(spent*100)/100,credit:Math.round(credit*100)/100,entries:w.entries.length};
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
 var items=wallets(store),state=store.screenData||{},section=String(state.benefitSection||"overview");
 var selected=state.benefitWalletId,w=items.find(function(x){return String(x.id)===String(selected);})||items[0];
 var arg=function(id,view,more){return "go('beneficios',{benefitWalletId:"+JSON.stringify(id)+",benefitSection:"+JSON.stringify(view)+(more?",benefitEditEntryId:"+JSON.stringify(more):"")+"})";};
 var button=function(label,target,style){return '<button type="button" class="al-v2-action '+(style||'')+'" onclick="'+esc(target)+'">'+esc(label)+'</button>';};
 var html='<div class="content al-benefits-page al-benefits-v2">';
 html+='<header class="al-v2-header"><button type="button" class="al-v2-back" onclick="go(\'home\')" aria-label="Voltar para o início">‹</button><div><span class="al-v2-eyebrow">ALICERCE FINANCEIRO</span><h2>Meus benefícios</h2></div></header>';
 html+='<p class="al-v2-intro">Seus vales-alimentação, organizados em um só lugar.</p>';
 if(!items.length||section==="add"){
   html+='<section class="al-v2-panel al-v2-onboard"><div class="al-v2-panel-head"><h3>Adicionar cartão</h3>'+ (items.length?button("Voltar",arg(w.id,"overview"),"quiet"):"") +'</div><p>Escolha o benefício. Você poderá incluir a recarga e acompanhar o saldo.</p>';
   html+='<label for="benefit-provider">Operadora</label><select id="benefit-provider" class="input"><option value="pluxee">Sodexo / Pluxee</option><option value="solides">Sólides Benefícios</option></select>';
   html+='<label class="al-v2-check"><input type="checkbox" id="benefit-new-showhome" checked> Mostrar na tela principal</label><button class="al-v2-primary" type="button" onclick="alicerceBeneficioCriar()">Adicionar cartão</button></section>';
   if(!items.length)html+='<p class="al-v2-footnote">Nenhum cartão cadastrado. O saldo começa em zero e não afeta sua conta bancária.</p>';
   return html+'</div>';
 }
 html+='<div class="al-v2-wallets" role="group" aria-label="Escolher benefício">';
 items.forEach(function(x){
   var active=x===w;
   html+='<button type="button" class="al-v2-wallet-choice'+(active?' selected':'')+'" aria-pressed="'+active+'" onclick="'+esc(arg(x.id,"overview"))+'"><span class="al-v2-wallet-dot"></span>'+esc(x.alias||PROVIDERS[x.provider])+'</button>';
 });
 if(items.length<2)html+=button("+ Cartão",arg(w.id,"add"),"al-v2-plus");
 html+='</div>';
 var value=balance(w);
 html+='<section class="al-v2-hero" aria-label="Cartão de vale-alimentação"><div class="al-v2-hero-top"><span class="al-v2-card-symbol">VA</span><span class="al-v2-hero-type">ALIMENTAÇÃO</span></div>';
 html+='<div class="al-v2-card-name">'+esc(w.alias||PROVIDERS[w.provider])+'</div><div class="al-v2-balance-label">Saldo registrado</div><div class="al-v2-balance">'+esc(money(value))+'</div>';
 html+='<div class="al-v2-hero-footer"><span>Carteira separada do banco</span><span>● Disponível</span></div></section>';
 html+='<div class="al-v2-quick">';
 html+=button("＋ Nova recarga",arg(w.id,"topup"),section==="topup"?"active":"");
 html+=button("↗ Registrar compra",arg(w.id,"purchase"),section==="purchase"?"active":"");
 html+=button("⇄ Corrigir saldo",arg(w.id,"balance"),section==="balance"?"active":"");
 html+='</div>';
 if(section==="topup"||section==="purchase"){
   var credit=section==="topup";
   html+='<section class="al-v2-panel"><div class="al-v2-panel-head"><h3>'+(credit?"Nova recarga":"Registrar compra")+'</h3>'+button("Fechar",arg(w.id,"overview"),"quiet")+'</div>';
   html+='<p>'+(credit?"Use somente para um crédito novo recebido da empresa. Este valor será somado ao saldo atual.":"O valor será descontado apenas deste vale-alimentação.")+'</p>';
   html+='<div class="al-v2-form"><label for="benefit-entry-amount">Valor (R$)</label><input id="benefit-entry-amount" class="input" type="text" inputmode="decimal" placeholder="0,00">';
   html+='<label for="benefit-entry-date">Data</label><input id="benefit-entry-date" type="date" class="input" value="'+esc(today)+'">';
   html+='<label for="benefit-entry-description">Descrição</label><input id="benefit-entry-description" class="input" maxlength="120" placeholder="'+(credit?"Ex.: Recarga mensal":"Ex.: Supermercado")+'">';
   html+='<input id="benefit-entry-kind" type="hidden" value="'+(credit?"credit":"debit")+'"></div>';
   html+='<button class="al-v2-primary" onclick="alicerceBeneficioAdicionar('+esc(JSON.stringify(w.id))+')">Confirmar '+(credit?"recarga":"compra")+'</button></section>';
 }
 if(section==="balance"){
   html+='<section class="al-v2-panel"><div class="al-v2-panel-head"><h3>Conferir saldo real</h3>'+button("Fechar",arg(w.id,"overview"),"quiet")+'</div><p>Quando houver uma recarga duplicada ou diferença no valor, informe o saldo exibido pela operadora. O Alicerce ajusta só a diferença, sem somar tudo de novo.</p>';
   html+='<label for="benefit-real-balance">Saldo correto (R$)</label><input id="benefit-real-balance" class="input" type="text" inputmode="decimal" placeholder="Ex.: 485,00">';
   html+='<button class="al-v2-primary" onclick="alicerceBeneficioConferirSaldo('+esc(JSON.stringify(w.id))+')">Atualizar saldo</button></section>';
 }
 if(section==="settings"){
   html+='<section class="al-v2-panel"><div class="al-v2-panel-head"><h3>Configurar cartão</h3>'+button("Fechar",arg(w.id,"overview"),"quiet")+'</div>';
   html+='<label class="al-v2-check"><input type="checkbox" id="benefit-home-visible" '+(w.showHome?'checked':'')+' onchange="alicerceBeneficioHome('+esc(JSON.stringify(w.id))+',this.checked)"> Exibir este cartão na tela principal</label>';
   html+='<label for="benefit-wallet-alias">Nome do cartão (opcional)</label><input id="benefit-wallet-alias" class="input" maxlength="50" value="'+esc(w.alias||"")+'" placeholder="Ex.: Meu Sodexo">';
   html+='<button class="al-v2-secondary" onclick="alicerceBeneficioSalvarNome('+esc(JSON.stringify(w.id))+')">Salvar nome</button><div class="al-v2-danger-zone"><button type="button" class="al-v2-danger" onclick="alicerceBeneficioExcluirCartao('+esc(JSON.stringify(w.id))+')">Excluir cartão e histórico</button></div></section>';
 }
 var month=String(today||"").slice(0,7);
 var monthly=(w.entries||[]).filter(function(e){return String(e.date||"").slice(0,7)===month;});
 var paid=Math.round(monthly.filter(function(e){return e.kind==="debit";}).reduce(function(n,e){return n+Number(e.amount||0);},0)*100)/100;
 var credited=Math.round(monthly.filter(function(e){return e.kind==="credit";}).reduce(function(n,e){return n+Number(e.amount||0);},0)*100)/100;
 html+='<div class="al-v2-mini-metrics"><div><small>Recargas do mês</small><strong>'+esc(money(credited))+'</strong></div><div><small>Compras do mês</small><strong>'+esc(money(paid))+'</strong></div></div>';
 html+='<section class="al-v2-history"><div class="al-v2-section-title"><div><span class="al-v2-eyebrow">MOVIMENTAÇÕES</span><h3>Histórico</h3></div>';
 html+=button(section==="history"?"Ver menos":"Ver tudo",arg(w.id,section==="history"?"overview":"history"),"quiet");
 html+='</div>';
 var all=w.entries.slice().reverse();
 var listing=section==="history"?all:all.slice(0,3);
 if(!listing.length)html+='<div class="al-v2-empty">Ainda não há movimentações neste cartão.</div>';
 else html+='<div class="al-v2-entries">'+listing.map(function(e){
   var credit=e.kind==="credit"||e.kind==="adjustment"&&Number(e.amount)>=0;
   var iconText=e.kind==="credit"?"↓":e.kind==="debit"?"↑":"⇄";
   var kind=e.kind==="credit"?"Recarga":e.kind==="debit"?"Compra":"Ajuste de saldo";
   var id=JSON.stringify(e.id),walletId=JSON.stringify(w.id);
   var htmlRow='<div class="al-v2-entry"><span class="al-v2-entry-icon '+(credit?"credit":"debit")+'">'+iconText+'</span><div class="al-v2-entry-copy"><strong>'+esc(e.description)+'</strong><small>'+esc(kind)+' · '+esc(String(e.date||"").split("-").reverse().join("/"))+'</small></div><strong class="al-v2-entry-amount '+(credit?"credit":"debit")+'">'+(credit?"+":"−")+esc(money(Math.abs(e.amount)))+'</strong></div>';

   return '<div class="al-v2-entry-wrap">'+htmlRow+'</div>'+ (section==="history"?'<div class="al-v2-control-row">'+(e.kind!=="adjustment"?button("Editar",arg(w.id,"history",e.id),"quiet"):"")+'<button type="button" class="al-v2-tiny-danger" onclick="alicerceBeneficioExcluirLancamento('+esc(walletId)+','+esc(id)+')">Excluir</button></div>':"");
 }).join("")+'</div>';
 var editId=state.benefitEditEntryId;
 var editRow=section==="history"&&w.entries.find(function(e){return e.kind!=="adjustment"&&String(e.id)===String(editId);});
 if(editRow){
   html+='<div class="al-v2-panel al-v2-edit"><div class="al-v2-panel-head"><h3>Corrigir lançamento</h3>'+button("Cancelar",arg(w.id,"history"),"quiet")+'</div><p>O novo valor substitui o anterior. Não soma outra recarga.</p>';
   html+='<label for="benefit-edit-amount">Valor correto</label><input id="benefit-edit-amount" class="input" inputmode="decimal" value="'+esc(String(editRow.amount).replace(".",","))+'">';
   html+='<label for="benefit-edit-date">Data</label><input id="benefit-edit-date" class="input" type="date" value="'+esc(editRow.date)+'">';
   html+='<label for="benefit-edit-description">Descrição</label><input id="benefit-edit-description" class="input" maxlength="120" value="'+esc(editRow.description)+'">';
   html+='<button class="al-v2-primary" onclick="alicerceBeneficioSalvarEdicao('+esc(JSON.stringify(w.id))+','+esc(JSON.stringify(editRow.id))+')">Salvar correção</button></div>';
 }
 html+='</section><div class="al-v2-bottom-settings">'+button("⚙ Configurar cartão",arg(w.id,"settings"),"quiet")+'</div>';
 html+='<p class="al-v2-footnote">Saldo calculado a partir dos registros no Alicerce. Não há sincronização automática com a operadora.</p></div>';
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
 var thisMonth=new Date().getFullYear()+"-"+String(new Date().getMonth()+1).padStart(2,"0");
 return list.map(function(w){return w.name+": saldo registrado "+money(w.balance)+", recargas "+money(w.credit)+", compras acumuladas "+money(w.spent)+"."}).join("\n")+" Essas compras usam o saldo de vale-alimentação, sem reduzir o dinheiro bancário. Os valores são calculados dos lançamentos no Alicerce, não são sincronizados com as operadoras.";
}
root.AlicerceBeneficios={providers:PROVIDERS,wallets:wallets,balance:balance,addWallet:addWallet,addEntry:addEntry,removeEntry:removeEntry,toggleHome:toggleHome,snapshot:snapshot,updateEntry:updateEntry,setBalance:setBalance,deleteWallet:deleteWallet,updateWalletName:updateWalletName,spentInMonth:spentInMonth,spendingEntries:spendingEntries,renderHome:renderHome,renderPage:renderPage,answer:answer};
})(typeof window!=="undefined"?window:globalThis);
