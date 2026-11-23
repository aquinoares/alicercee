/* Alicia · compra no vale-alimentação pelo chat, com confirmação obrigatória.
 * Nenhum lançamento é criado durante interpretação, pergunta ou apresentação.
 * Usa exclusivamente a carteira de benefício existente, sem tocar no caixa bancário.
 */
(function(root){
"use strict";
if(root.AlicerceCompraBeneficioChat)return;
function norm(v){return String(v||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim();}
function money(v){return (Number(v)||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});}
function str(v){return String(v||"").trim();}
function walletList(store){
  return root.AlicerceBeneficios&&typeof root.AlicerceBeneficios.wallets==="function"?root.AlicerceBeneficios.wallets(store):[];
}
function providerOf(message){
  var q=norm(message);
  if(/\b(sodexo|pluxee|sedexo)\b/.test(q))return "pluxee";
  if(/\bsolides\b/.test(q))return "solides";
  return "";
}
function isPurchaseIntent(message){
  var q=norm(message);
  var benefit=/\b(sodexo|sedexo|pluxee|solides|vale alimentacao|vale-alimentacao|cartao alimentacao|beneficio alimentacao)\b/.test(q);
  var purchase=/\b(comprei|comprou|compra|compras|gastei|paguei|pagar|pague|gasto|registra|registrar|anota|anotar|lanca|lancar|adiciona|adicionar|salva|salvar)\b/.test(q);
  var question=/^(quanto|qual|onde|como|porque|por que|me mostra|mostra|mostre|grafico|compare|analisa|analise|saldo|tenho)\b/.test(q);
  return benefit&&purchase&&!question&&!/\b(grafico|analise|relatorio|comparacao|compara|quanto gastei)\b/.test(q);
}
function amountFrom(message){
  var q=norm(message);
  // Only explicit BRL money; do not mistake dates, quantities or card numbers for prices.
  var match=q.match(/(?:r\$\s*|\b)(\d{1,7}(?:[.,]\d{1,2})?)\s*(?:reais?\b|\br\$\b)/);
  if(!match)match=q.match(/\br\$\s*(\d{1,7}(?:[.,]\d{1,2})?)(?!\d)/);
  if(!match){
    // "comprei 35 no Sodexo", "gastei 35,50 no mercado com Sodexo"
    match=q.match(/\b(?:comprei|gastei|paguei|compra de|compra no valor de|valor de|foi|custou|por)\s*(?:r\$\s*)?(\d{1,7}(?:[.,]\d{1,2})?)\b/);
  }
  if(!match)return null;
  var number=Number(match[1].replace(",","."));
  return Number.isFinite(number)&&number>0?Math.round(number*100)/100:null;
}
function descriptionFrom(message){
  var q=norm(message);
  var product=q.match(/\b(?:comprei|comprar|compra de|paguei por|gastei com|gasto com|adiciona compra de|registra compra de)\s+(?:um|uma|uns|umas)?\s*([a-z][a-z\s-]{2,65}?)(?=\s+(?:por|de|no valor|com|usando|pelo|pelo cartao|no cartao|no sodexo|na pluxee|na solides|r\$)\b|[.,!?]|$)/);
  if(product){
    var phrase=str(product[1]).replace(/^(?:no|na|pelo|pela|cartao)\s+/,"").replace(/\s+(?:no|na|com|pelo|pela)$/,"").trim();
    if(phrase&&!/^(?:cartao|vale alimentacao|sodexo|pluxee|solides|beneficio)$/.test(phrase))return phrase.slice(0,100);
  }
  var bought=q.match(/\bcomprei\s+(?:um|uma|uns|umas)?\s*([a-z][a-z\s-]{2,60}?)\s+(?:de|por|a)\s+(?:r\$\s*)?\d{1,7}(?:[.,]\d{1,2})?\s*(?:reais?)?\b/);
  if(bought&&str(bought[1]))return str(bought[1]).slice(0,100);
  var place=q.match(/\b(?:no|na|em|do|da)\s+(supermercado|mercado|padaria|mercearia|hortifruti|acougue|atacadao|carrefour|assai|pao de acucar|loja de alimentos)\b/);
  if(place)return "Compra no "+place[1];
  return "";
}
function findWallet(store,draft){
  var list=walletList(store);
  if(draft.walletId){
    var direct=list.find(function(w){return String(w.id)===String(draft.walletId);});
    if(direct)return direct;
  }
  if(draft.provider){
    var options=list.filter(function(w){return w.provider===draft.provider;});
    return options.length===1?options[0]:null;
  }
  return list.length===1?list[0]:null;
}
function status(store,draft){
  if(!store||!store.userId)return {ready:false,reply:"Entre na sua conta do Alicerce para registrar uma compra com vale-alimentação."};
  var list=walletList(store);
  if(!list.length)return {ready:false,terminal:true,reply:"Você ainda não cadastrou Sodexo/Pluxee ou Sólides em Meus benefícios. Cadastre o cartão e registre o saldo inicial antes de comprar pela Alicia."};
  var w=findWallet(store,draft);
  if(!w){
    if(draft.provider&&!list.some(function(x){return x.provider===draft.provider;}))return {ready:false,terminal:true,reply:"Não encontrei esse cartão cadastrado em Meus benefícios. Cadastre o vale-alimentação antes de registrar a compra."};
    return {ready:false,reply:list.length>1?"Qual cartão devo usar: Sodexo/Pluxee ou Sólides?":"Qual vale-alimentação devo usar?"};
  }
  draft.walletId=String(w.id);
  draft.provider=w.provider;
  if(!(draft.amount>0))return {ready:false,reply:"Qual foi o valor da compra? Informe em reais, por exemplo: R$ 35,50."};
  if(!draft.description)return {ready:false,reply:"O que você comprou? Pode dizer, por exemplo, supermercado, pão ou alimentos."};
  var balance=root.AlicerceBeneficios.balance(w);
  if(draft.amount>balance)return {ready:false,terminal:true,reply:"O saldo registrado de "+root.AlicerceBeneficios.providers[w.provider]+" é "+money(balance)+", menor que a compra de "+money(draft.amount)+". Não registrei nada. Confira as recargas em Meus benefícios."};
  return {ready:true,reply:"Confira a compra preparada abaixo. Só vou descontar o vale-alimentação depois que você tocar em Confirmar compra ou escrever exatamente “confirmar compra”. Nenhum valor saiu do banco."};
}
function parse(message,store,today){
  var draft={provider:providerOf(message),walletId:"",amount:amountFrom(message),description:descriptionFrom(message),date:String(today||"").slice(0,10),token:"",approved:false};
  var st=status(store,draft);
  return {draft:draft,state:st};
}
function applyFollowup(draft,message,store){
  var q=norm(message);
  var p=providerOf(message);
  if(p){draft.provider=p;draft.walletId="";}
  var value=amountFrom(message);
  if(value!=null)draft.amount=value;
  if(!draft.description){
    var desc=descriptionFrom(message);
    if(!desc && !/^(?:confirmar compra|cancelar compra|nao|sim|sodexo|sedexo|pluxee|solides)\b/.test(q)
       &&!/^\d/.test(q) && !/^r\$\s*\d/.test(q) && !/^\d+[.,]\d{1,2}\s*reais?\b/.test(q)){
      desc=str(message).replace(/[.!?]+$/,"").slice(0,100);
    }
    if(desc)draft.description=desc;
  }
  return status(store,draft);
}
function confirm(store,draft){
  if(!draft||draft.approved)return {ok:false,error:"Essa compra já foi tratada. Para outra compra, faça um novo pedido."};
  var st=status(store,draft);
  if(!st.ready)return {ok:false,error:st.reply};
  var wallet=findWallet(store,draft);
  if(!wallet||String(wallet.id)!==String(draft.walletId))return {ok:false,error:"Não encontrei mais a carteira selecionada."};
  // Lock the in-memory draft before the only writing operation. Retrying cannot debit twice.
  draft.approved=true;
  var result;
  try{
    result=root.AlicerceBeneficios.addEntry(store,draft.walletId,"debit",String(draft.amount),draft.date,draft.description,{
      category:"alimentacao",subcategory:"",origin:"alicia-chat",merchant:""
    });
  }catch(error){return {ok:false,error:"Não consegui confirmar a gravação. Confira o histórico do benefício antes de tentar de novo."};}
  if(!result||!result.ok)return {ok:false,error:result&&result.error||"Não consegui registrar a compra."};
  return {ok:true,reply:"Compra registrada com sucesso! "+root.AlicerceBeneficios.providers[wallet.provider]+": "+money(draft.amount)+" em "+draft.description+". Saldo registrado restante: "+money(root.AlicerceBeneficios.balance(wallet))+". O saldo bancário não foi alterado."};
}
function isConfirm(q){return /^(confirmar compra|confirmo a compra|pode registrar a compra)$/i.test(norm(q));}
function isCancel(q){return /^(cancelar compra|cancela compra|desistir|desisti|esquece|nao quero|cancelar)$/i.test(norm(q));}
function renderDraft(draft,store){
  if(!draft||draft.approved)return "";
  var st=status(store,draft);
  if(!st.ready)return "";
  var w=findWallet(store,draft);
  if(!w)return "";
  function esc(s){return String(s||"").replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
  var remaining=root.AlicerceBeneficios.balance(w)-draft.amount;
  return '<section class="alicia-benefit-review" aria-label="Confirmar compra com vale-alimentação">'
  +'<strong>Compra aguardando confirmação</strong>'
  +'<div><span>O que comprou</span><b>'+esc(draft.description)+'</b></div>'
  +'<div><span>Vale-alimentação</span><b>'+esc(root.AlicerceBeneficios.providers[w.provider])+'</b></div>'
  +'<div><span>Valor da compra</span><b>'+esc(money(draft.amount))+'</b></div>'
  +'<div><span>Saldo após confirmar</span><b>'+esc(money(remaining))+'</b></div>'
  +'<p>O valor sai apenas do benefício. Nenhuma despesa bancária será criada.</p>'
  +'<div class="alicia-benefit-review-actions"><button type="button" class="btn btn-primary" onclick="AlicerceIA.confirmarCompraBeneficio()">Confirmar compra</button><button type="button" class="btn btn-secondary" onclick="AlicerceIA.cancelarCompraBeneficio()">Cancelar</button></div>'
  +'</section>';
}
root.AlicerceCompraBeneficioChat={
  isPurchaseIntent:isPurchaseIntent,parse:parse,applyFollowup:applyFollowup,status:status,confirm:confirm,
  isConfirm:isConfirm,isCancel:isCancel,renderDraft:renderDraft,amountFrom:amountFrom,descriptionFrom:descriptionFrom
};
})(typeof window!=="undefined"?window:globalThis);
