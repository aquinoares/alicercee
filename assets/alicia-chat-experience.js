/* Alicia chat experience v1.2 — test-only finance adapter */
(function(root){
'use strict';
if(!root)return;
var ai=typeof AlicerceIA!=='undefined'?AlicerceIA:null;
var brain=root.AliciaBrain||null;
var config=root.ALICIA_CHAT_CONFIG||{};
config.audioEnabled=false;config.recognitionEnabled=false;config.expenseStoreMode='test-only';config.expenseStore=null;
root.ALICIA_CHAT_CONFIG=config;
function n(v){var s=String(v||'').toLowerCase();try{s=s.normalize('NFD').replace(/[\u0300-\u036f]/g,'');}catch(e){}return s.replace(/[^a-z0-9$,.]+/g,' ').replace(/\s+/g,' ').trim();}
function lastA(h){if(!Array.isArray(h))return'';for(var i=h.length-1;i>=0;i--)if(h[i]&&h[i].role==='assistant')return String(h[i].text||'');return'';}
var cursors={};
function variant(k,a,h){var last=lastA(h),i=Number(cursors[k]||0),chosen=a[i%a.length];if(chosen===last)chosen=a[(i+1)%a.length];cursors[k]=(i+1)%a.length;return chosen;}
if(brain&&brain.classify&&brain.respond){
 var baseClassify=brain.classify,baseRespond=brain.respond;
 brain.classify=function(text,history,lang){
  var intent=baseClassify(text,history,lang),v=n(text);
  if(intent==='unknown'&&/\b(minha|meu|minhas|meus)\s+(filha|filho|mae|pai|irma|irmao|amiga|amigo|parente)\b/.test(v)&&/\b(mandou|enviou|postou|escreveu|falou|disse|gravou)\b/.test(v)&&/\b(vai embora|ir embora|sumir|despedida|despedir|nao aguenta mais|nao quer viver)\b/.test(v))return'third_party_ambiguous';
  return intent;
 };
 brain.respond=function(text,history,lang){
  var intent=brain.classify(text,history,lang);
  if(intent==='third_party_ambiguous')return{intent:intent,handled:true,text:'Quando ela disse que vai embora, você entendeu que quer sair de casa ou ela falou em se machucar ou em não querer mais viver?'};
  var result=baseRespond(text,history,lang);if(!result||!result.handled)return result;
  if(result.intent==='care_check'||result.intent==='sadness'||result.intent==='tiredness')result.text=variant('low',[
   'Poxa, parece que isso está pesando bastante. Quer me contar o que mais está te preocupando agora?',
   'Imagino que não seja simples lidar com tudo isso. Como você está hoje?',
   'Vamos por partes, sem cobrança. O que está mais difícil neste momento?',
   'Sinto muito que esteja passando por isso. Tem alguém de confiança com quem você possa conversar também?',
   'Não precisa resolver tudo de uma vez. O que está precisando de mais atenção agora?'
  ],history);
  else if(result.intent==='self_safety_crisis'&&brain.assessSelfHarmRisk&&brain.assessSelfHarmRisk(text)==='medium')result.text=variant('medium',[
   'Sinto muito que esteja tão pesado. Você consegue ficar perto de alguém de confiança agora? Em risco imediato, ligue SAMU 192; para conversar, CVV 188.',
   'Obrigado por me contar. Tente não ficar só e se afaste do que possa usar para se machucar. Em perigo agora, ligue SAMU 192; para conversar, CVV 188.',
   'Vamos cuidar primeiro da sua segurança. Pode chamar alguém de confiança para ficar com você? Se o risco for agora, SAMU 192; CVV 188.',
   'Você merece apoio neste momento. Procure alguém de confiança e fique acompanhado. Em perigo imediato, SAMU 192; apoio emocional, CVV 188.',
   'Não precisa enfrentar isso sozinho. Vá para perto de alguém que possa te acompanhar; em risco imediato, SAMU 192; para conversar, CVV 188.'
  ],history);
  return result;
 };
}

var testStore=null,purchaseSeq=0,careTimerSeq=0;
function scheduleCareExpiry(instance){if(!instance._aliciaCareState)return;var state=instance._aliciaCareState;var token=++careTimerSeq;state.expiresAt=Date.now()+30*60*1000;state.checkAsked=false;state._timerToken=token;if(root.__aliciaCareTimer&&typeof root.clearTimeout==='function')root.clearTimeout(root.__aliciaCareTimer);if(typeof root.setTimeout==='function'){root.__aliciaCareTimer=root.setTimeout(function(){if(instance._aliciaCareState&&instance._aliciaCareState._timerToken===token)instance._aliciaCareState=null;root.__aliciaCareTimer=null;},30*60*1000);}}
var written={zero:0,um:1,uma:1,dois:2,duas:2,tres:3,quatro:4,cinco:5,seis:6,sete:7,oito:8,nove:9,dez:10,onze:11,doze:12,treze:13,catorze:14,quatorze:14,quinze:15,dezesseis:16,dezessete:17,dezoito:18,dezenove:19,vinte:20,trinta:30,quarenta:40,cinquenta:50,sessenta:60,setenta:70,oitenta:80,noventa:90,cem:100,cento:100,duzentos:200,duzentas:200,trezentos:300,trezentas:300,quatrocentos:400,quatrocentas:400,quinhentos:500,quinhentas:500,seiscentos:600,seiscentas:600,setecentos:700,setecentas:700,oitocentos:800,oitocentas:800,novecentos:900};
function num(s){s=String(s||'').trim();if(!s)return null;if(/^\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(s))s=s.replace(/\./g,'').replace(',','.');else if(/^\d+,\d{1,2}$/.test(s))s=s.replace(',','.');else if(/^\d{1,3}(?:\.\d{3})+$/.test(s))s=s.replace(/\./g,'');var x=Number(s);return isFinite(x)&&x>0&&x<=10000000?x:null;}
function wordsNum(s){var a=n(s).split(/\s+/),sum=0,v=0,found=false;for(var i=0;i<a.length;i++){if(!a[i]||a[i]==='e')continue;if(Object.prototype.hasOwnProperty.call(written,a[i])){v+=written[a[i]];found=true;}else if(a[i]==='mil'){sum+=(v||1)*1000;v=0;found=true;}else return null;}return found?sum+v:null;}
function amount(s){var v=n(s),m;m=v.match(/\br\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[,.]\d{1,2})?)/);if(m)return{value:num(m[1]),raw:m[0]};var keys=Object.keys(written).filter(function(x){return x!=='zero';}).sort(function(a,b){return b.length-a.length;}),w='(?:'+keys.join('|')+')';m=v.match(new RegExp('\\b('+w+'(?:\\s+(?:e\\s+)?'+w+')*)\\s+(?:reais?|contos?)\\b'));if(m){var a=wordsNum(m[1]);if(a!==null)return{value:a,raw:m[0]};}m=v.match(/\b(?:uns?|por|de|valor de)\s+(\d{1,6}(?:[,.]\d{1,2})?)\s*(?:reais?|contos?)?\b(?!\s*x)/);if(m)return{value:num(m[1]),raw:m[0]};m=v.match(/\b(\d{1,6}(?:[,.]\d{1,2})?)\s*(?:reais?|contos?)?\b(?!\s*x)/);return m?{value:num(m[1]),raw:m[0]}:{value:null,raw:''};}
function dateBase(s){if(/^\d{4}-\d{2}-\d{2}$/.test(String(s||''))){var p=s.split('-');return new Date(+p[0],+p[1]-1,+p[2]);}var d=new Date();return new Date(d.getFullYear(),d.getMonth(),d.getDate());}
function iso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function month(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');}
function monthAdd(d,k){return new Date(d.getFullYear(),d.getMonth()+k,1);}
function dateValue(s,today){var d=dateBase(today),v=n(s);if(/\banteontem\b/.test(v))d.setDate(d.getDate()-2);else if(/\bontem\b/.test(v))d.setDate(d.getDate()-1);else{var map={domingo:0,segunda:1,terca:2,quarta:3,quinta:4,sexta:5,sabado:6},m=v.match(/\b(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:\s+feira)?\b/);if(m)d.setDate(d.getDate()-((d.getDay()-map[m[1]]+7)%7));}return iso(d);}
var cats=[
 [/\b(picole|sorvete|acai)\b/,'comida','doces'],
 [/\b(pao|padaria)\b/,'comida','padaria'],
 [/\b(mercado|supermercado|atacadao|assai|feira|hortifruti)\b/,'comida','mercado'],
 [/\b(lanche|lanchonete|quentinha|pastel|tapioca|cuscuz|macaxeira|mungunza|goma|espetinho|bolo de rolo|agua de coco|salgado|coxinha)\b/,'comida','lanchonete'],
 [/\buber\b/,'transporte','uber'],[/\b99\b/,'transporte','99'],[/\b(onibus|lotacao|mototaxi|taxi)\b/,'transporte','onibus'],
 [/\b(gasolina|etanol|diesel|combustivel|abastecimento)\b/,'transporte','combustivel'],
 [/\b(farmacia|drogaria)\b/,'saude','farmacia'],[/\b(remedio|medicamento)\b/,'saude','medicamentos'],
 [/\b(luz|energia)\b/,'moradia','energia'],[/\b(agua|compesa)\b/,'moradia','agua'],[/\b(internet|wifi)\b/,'moradia','internet'],[/\b(botijao|gas)\b/,'moradia','gas'],
 [/\bcinema\b/,'lazer','cinema'],[/\b(jogo|games)\b/,'lazer','jogos'],[/\bbar\b/,'lazer','passeios'],
 [/\b(tenis|sapato|sandalia|chinelo)\b/,'vestuario','calcados'],[/\b(roupa|camisa|calca|vestido|bermuda)\b/,'vestuario','roupas']
];
var itemLabels={picole:'picolé',sorvete:'sorvete',acai:'açaí',pao:'pão',tenis:'tênis',onibus:'ônibus',remedio:'remédio',farmacia:'farmácia',agua:'água'};
function catOf(s){var v=n(s);for(var i=0;i<cats.length;i++)if(cats[i][0].test(v))return{category:cats[i][1],subcategory:cats[i][2]};return null;}
function payment(s){var v=n(s),method='',card='',cardType='';if(/\bpix\b/.test(v))method='pix';else if(/\b(dinheiro|especie)\b/.test(v))method='dinheiro';else if(/\bdebito\b/.test(v)){method='cartao';cardType='debito';}else if(/\bcredito\b/.test(v)){method='cartao';cardType='credito';}else if(/\bcartao\b/.test(v)){method='cartao';cardType='credito';}else if(/\btransferencia\b/.test(v))method='transferencia';var m=v.match(/\bcartao\s+(?:do|da|de)\s+([a-z0-9]+(?:\s+[a-z0-9]+){0,2})/);if(m)card=m[1];return{method:method,cardName:card,cardType:cardType};}
function partCount(s){var m=n(s).match(/\b(?:em\s*)?(\d{1,2})\s*x\b/)||n(s).match(/\b(\d{1,2})\s+parcelas?\b/);return m?Math.max(1,Math.min(48,+m[1]||1)):1;}
function itemValue(s,raw){var v=n(s);if(raw)v=v.replace(n(raw),' ');v=v.replace(/\bcartao\s+(?:do|da|de)\s+[a-z0-9]+(?:\s+[a-z0-9]+){0,2}\b/g,' ').replace(/\b(?:acabei\s+de\s+comprar|resolvi\s+comprar|comprei|comprar|compra|gastei|paguei|pagar|peguei|tomei|anota(?:r)?|registra(?:r)?|lanca(?:r)?)\b/g,' ').replace(/\b(?:alicia|eu\s+tava\s+com\s+vontade|tava\s+com\s+vontade|estava\s+com\s+vontade)\b/g,' ').replace(/\b(?:ontem|anteontem|hoje|domingo|segunda|terca|quarta|quinta|sexta|sabado|feira)\b/g,' ').replace(/\b(?:no|na|em|com|por)\s+(?:pix|dinheiro|especie|debito|credito|cartao|transferencia)\b/g,' ').replace(/\b(?:pix|dinheiro|especie|debito|credito|cartao|transferencia)\b/g,' ').replace(/\b(?:em\s*)?\d{1,2}\s*x\b/g,' ').replace(/\b(?:de|por|uns?|umas?|uma|um|o|a|os|as|no|na|nos|nas|do|da|dos|das|em)\b/g,' ').replace(/\s+/g,' ').trim().replace(/^(?:eu|quero|preciso|um|uma|o|a)\s+/,'').trim();if(['negocio','coisa','produto','item'].indexOf(v)>=0)return 'Compra';return itemLabels[v]||v;}
function parse(s,today){var raw=String(s||'').trim(),v=n(raw);if(!v)return null;var add=/\b(me\s+)?adiciona(?:r)?\b.*\b(compra|cartao)\b/.test(v)&&/\bcartao\b/.test(v),verb=/\b(acabei\s+de\s+comprar|resolvi\s+comprar|comprei|comprar|compra|gastei|paguei|pagar|peguei|tomei|anota|anotar|registra|registrar|lanca|lancar)\b/.test(v);if(!add&&!verb)return null;if(!add&&(/^(quanto|quais|qual|como|onde|quando|me mostra|me diga|me diz)\b/.test(v)||/\?\s*$/.test(raw)))return null;var a=amount(v),p=payment(v),parts=partCount(v),item=add?'Compra no cartão':itemValue(v,a.raw),c=catOf(item);if(add){p.method='cartao';p.cardType=p.cardType||'credito';c=c||{category:'outros',subcategory:'nao_identificado'};}return{amount:a.value,item:item||'Compra',category:c?c.category:'',subcategory:c?c.subcategory:'',paymentMethod:p.method,cardName:p.cardName,cardType:p.cardType||'',installments:parts,invalidDebitInstallments:p.cardType==='debito'&&parts>1,date:dateValue(v,today),isCardPurchase:p.method==='cartao'||add,addCard:add,needsClarification:a.value===null?'amount':(!p.method?'payment':(!c?'category':''))};}
function invMonth(card,today){var d=dateBase(today),c=Number(card&&card.fechamento)||0,v=Number(card&&card.vencimento)||0,offset=1;if(c>0)offset=(d.getDate()>c?1:0)+(v>0&&v<=c?1:0);return month(monthAdd(d,offset));}
function installmentsIn(cards,rows,ym){var out=[],list=Array.isArray(cards)?cards:[];(Array.isArray(rows)?rows:[]).forEach(function(x){if(!x||x.tipo!=='cartao'||!x.data||String(x.data).slice(0,7)!==ym)return;var card=null;for(var i=0;i<list.length;i++)if(String(list[i].id)===String(x.cardId)){card=list[i];break;}if(!card)return;out.push({id:x.id,description:String(x.descricao||x.local||'Compra no cartão'),part:Number(x.parcelaAtual)||1,parts:Number(x.parcelas)||1,amount:Number(x.valor)||0,cardName:String(card&&card.nome||'Cartão não identificado'),dueDate:String(x.data),purchaseDate:String(x.dataCompra||''),status:String(x.status||'pendente')});});out.sort(function(a,b){return a.dueDate.localeCompare(b.dueDate)||a.cardName.localeCompare(b.cardName);});return out;}
function balance(cards,rows,today){var inv=[],total=0,list=Array.isArray(rows)?rows:[];(Array.isArray(cards)?cards:[]).forEach(function(card){var ym=invMonth(card,today),due=list.filter(function(x){return x&&x.tipo==='cartao'&&String(x.cardId)===String(card.id)&&x.data&&String(x.data).slice(0,7)===ym&&x.status!=='pago';}),sum=due.reduce(function(s,x){return s+(Number(x.valor)||0);},0);total+=sum;inv.push({cardName:String(card.nome||'Cartão'),month:ym,total:sum,installments:due});});return{total:total,invoices:inv};}
function buildRows(card,cmd,today){if(!card||!cmd||!(Number(cmd.amount)>0))return[];var purchase=String(cmd.date||today),parts=Math.max(1,Math.min(48,Number(cmd.installments)||1)),d=dateBase(purchase),close=Number(card.fechamento)||0,due=Number(card.vencimento)||0,offset=close>0?((d.getDate()>close?1:0)+(due>0&&due<=close?1:0)):1,cents=Math.round(Number(cmd.amount)*100),base=Math.floor(cents/parts),rem=cents%parts,id='alicia-test-'+Date.now()+'-'+(++purchaseSeq),out=[];for(var i=0;i<parts;i++){var dt=monthAdd(d,offset+i);if(due>0)dt.setDate(Math.min(due,new Date(dt.getFullYear(),dt.getMonth()+1,0).getDate()));out.push({cardId:card.id,tipo:'cartao',categoria:cmd.category||'outros',subcategoria:cmd.subcategory||'nao_identificado',descricao:cmd.item||'Compra no cartão',compraId:id,parcelaAtual:i+1,parcelas:parts,valor:(base+(i<rem?1:0))/100,data:iso(dt),dataCompra:purchase,status:'pendente',responsavel:'Eu'});}return out;}
var exp={version:'1.2.0',normalize:n,parseAmount:amount,parse:parse,resolveCategory:catOf,listInstallments:installmentsIn,cardBalance:balance,buildCardRows:buildRows,invoiceMonth:invMonth,bindTestStore:function(s){if(!s||s.testOnly!==true||!Array.isArray(s.cards)||!Array.isArray(s.installments)||typeof s.addMovement!=='function'||typeof s.addInstallmentsBatch!=='function')return false;testStore=s;config.expenseStore=s;return true;},unbindTestStore:function(){testStore=null;config.expenseStore=null;},isTestStoreBound:function(){return !!testStore;}};
root.AliciaExpense=exp;if(ai)ai._parseExpenseCommand=parse;

function append(instance,label,text){if(!Array.isArray(instance._messages))instance._messages=[];instance._messages.push({role:'user',text:label},{role:'assistant',text:text});while(instance._messages.length>8)instance._messages.splice(0,2);instance._question=label;instance._answer=text;var input=typeof document!=='undefined'?document.getElementById('alicerce-assistant-input'):null;if(input)input.value='';if(typeof render==='function')render();return text;}
function cash(v){try{return'R$ '+Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});}catch(e){return'R$ '+Number(v||0).toFixed(2).replace('.',',');}}
function catLabel(c){var a={comida:'Alimentação',transporte:'Transporte',saude:'Saúde',moradia:'Contas',lazer:'Lazer',vestuario:'Roupas',outros:'Outros'};return a[c]||'Outros';}
function monthLabel(s){var p=s.split('-');return new Date(+p[0],+p[1]-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'});}
function ask(instance,draft,field){draft.awaiting=field;if(field==='amount')draft.askedAmount=true;instance._aliciaExpensePending=draft;var prompts={amount:'Qual foi o valor? Pode mandar só o número, por exemplo 25.',payment:'Como você pagou: Pix, dinheiro, débito ou cartão?',category:'Em qual categoria você quer colocar a compra?',card:'Qual cartão você usou?'};return append(instance,'[campo pendente]',prompts[field]);}
function findCard(cards,name){var a=Array.isArray(cards)?cards:[];if(!name)return a.length===1?a[0]:null;var v=n(name);for(var i=0;i<a.length;i++){var z=n(a[i].nome||'');if(z===v||z.indexOf(v)>=0)return a[i];}return null;}
function catReply(s){var v=n(s),a=[['comida',/\b(comida|alimentacao|mercado|feira|padaria|lanche)\b/],['transporte',/\b(transporte|uber|99|onibus|gasolina)\b/],['saude',/\b(saude|farmacia|remedio)\b/],['moradia',/\b(contas|moradia|luz|agua|internet)\b/],['lazer',/\b(lazer|cinema|bar|jogo)\b/],['vestuario',/\b(roupas|roupa|calcado|tenis)\b/],['outros',/\b(outros|outras)\b/]];for(var i=0;i<a.length;i++)if(a[i][1].test(v))return a[i][0];return'';}
function askCat(instance,draft){draft.awaiting='category';instance._aliciaExpensePending=draft;return append(instance,'[categoria pendente]','Em qual categoria você quer colocar essa compra?');}
function showCardPreview(instance,d,card){instance._aliciaExpensePending=null;instance._aliciaCardPurchasePreview={draft:d,card:card};var first=buildRows(card,d,typeof Clock!=='undefined'?Clock.today():d.date)[0];return append(instance,'[prévia de compra parcelada]','Antes de salvar: '+d.installments+'x de '+cash(d.amount/d.installments)+' no '+(card.nome||'Cartão')+', primeira parcela em '+monthLabel(first.data.slice(0,7))+'. Vou criar '+d.installments+' parcelas futuras. Confirma?');}
function saveExpense(instance,d){
 instance._aliciaExpensePending=null;instance._aliciaExpenseCardChoices=null;
 if(!testStore||testStore.testOnly!==true){instance._aliciaExpensePending=null;return append(instance,'[gasto interpretado, sem gravação]','Identifiquei '+d.item+', '+cash(d.amount)+', '+(d.paymentMethod||'pagamento não informado')+' e '+catLabel(d.category)+'. Ainda não registrei: falta conectar um armazenamento de teste. Não consultei nem alterei dados reais.');}
 if(d.isCardPurchase){
  var card=findCard(testStore.cards,d.cardName);
  if(!card&&testStore.cards.length>1){instance._aliciaExpenseCardChoices=testStore.cards.map(function(c){return{id:c.id,name:c.nome||'Cartão'};});return ask(instance,d,'card');}
  if(!card)return append(instance,'[sem cartão de teste]','Não encontrei um cartão no ambiente de teste. Não registrei a compra.');
  d.cardId=card.id;d.cardName=card.nome||'Cartão';
  if(d.cardType==='debito'&&(d.installments>1||d.invalidDebitInstallments)){d.awaiting='debit_installment';instance._aliciaExpensePending=d;return append(instance,'[confirmação de débito à vista]','Cartão de débito não permite parcelamento. Quer registrar à vista?');}
  if(d.cardType==='debito'){
   var debit=testStore.addMovement({tipo:'despesa',categoria:d.category||'outros',subcategoria:d.subcategory||'nao_identificado',valor:Number(d.amount),data:d.date,forma:'cartao',paymentMethod:'cartao',cardType:'debito',cardId:card.id,status:'pago',descricao:d.item||'Compra',source:'alicia-chat-test'});
   if(!debit)return append(instance,'[falha no teste de débito]','Não consegui registrar no armazenamento de teste.');
   if(testStore.save)testStore.save();instance._aliciaLastExpenseAction={kind:'movement',id:debit.id,draft:d};
   return append(instance,'[gasto no débito anotado]','Anotei: '+d.item+', '+cash(d.amount)+', cartão de débito '+d.cardName+', '+catLabel(d.category)+'. Registrei somente no armazenamento de teste.');
  }
  if(d.installments>1){return showCardPreview(instance,d,card);}
  var rows=buildRows(card,d,typeof Clock!=='undefined'?Clock.today():d.date),made=testStore.addInstallmentsBatch?testStore.addInstallmentsBatch(rows):[];if(!made||made.length!==rows.length)return append(instance,'[falha no teste]','Não consegui criar todas as linhas no ambiente de teste.');if(testStore.save)testStore.save();instance._aliciaLastExpenseAction={kind:'card',purchaseId:rows[0].compraId,draft:d,card:card};return append(instance,'[compra de teste anotada]','Anotei: '+d.item+', '+cash(d.amount)+', '+card.nome+', à vista. Registrei somente no armazenamento de teste.');
 }
 var movement=testStore.addMovement({tipo:'despesa',categoria:d.category||'outros',subcategoria:d.subcategory||'nao_identificado',valor:Number(d.amount),data:d.date,forma:d.paymentMethod,paymentMethod:d.paymentMethod,status:'pago',descricao:d.item||'Compra',source:'alicia-chat-test'});
 if(!movement)return append(instance,'[falha no teste de gasto]','Não consegui registrar no armazenamento de teste.');
 instance._aliciaLastExpenseAction={kind:'movement',id:movement.id,draft:d};if(testStore.save)testStore.save();
 return append(instance,'[gasto de teste anotado]','Anotei: '+d.item+', '+cash(d.amount)+', '+d.paymentMethod+', '+catLabel(d.category)+'. Registrei somente no armazenamento de teste.');
}
function continueDraft(instance,d,text){
 if(d.awaiting==='debit_installment'){if(/\b(sim|avista|a vista|pode|quero)\b/.test(n(text))){d.installments=1;d.invalidDebitInstallments=false;d.awaiting='';return saveExpense(instance,d);}instance._aliciaExpensePending=null;return append(instance,'[compra no débito cancelada]','Tudo bem. Não registrei a compra. No cartão de débito, o pagamento precisa ser à vista.');}
 if(d.awaiting==='amount'){var a=amount(text).value;if(!a){instance._aliciaExpensePending=null;return append(instance,'[valor não identificado]','Não consegui identificar o valor. Não registrei a compra; quando souber, pode me enviar só o valor.');}d.amount=a;}
 else if(d.awaiting==='payment'){var p=payment(text);if(!p.method){instance._aliciaExpensePending=null;return append(instance,'[pagamento não identificado]','Não identifiquei a forma de pagamento. Não registrei a compra.');}d.paymentMethod=p.method;d.cardName=p.cardName||d.cardName;d.cardType=p.cardType||d.cardType||'';d.isCardPurchase=p.method==='cartao';d.invalidDebitInstallments=d.cardType==='debito'&&Number(d.installments)>1;}
 else if(d.awaiting==='category'){var c=catReply(text);d.category=c||'outros';d.subcategory=c?'outros':'nao_identificado';d.categoryFallback=!c;instance._aliciaShowChangeCategory=!c;}
 else if(d.awaiting==='card'){var card=findCard(testStore?testStore.cards:[],text);if(!card){instance._aliciaExpensePending=null;return append(instance,'[cartão não identificado]','Não identifiquei esse cartão no ambiente de teste. Não registrei.');}d.cardName=card.nome;d.cardId=card.id;}
 d.awaiting='';if(!d.category)return askCat(instance,d);if(!d.paymentMethod)return ask(instance,d,'payment');
 var result=saveExpense(instance,d);if(d.categoryFallback)instance._aliciaShowChangeCategory=true;return result;
}
function listQuery(instance,type){
 if(!testStore||!testStore.testOnly)return append(instance,'[consulta financeira não executada]','Entendi sua pergunta, mas não consultei cartões ou parcelas porque não há armazenamento de teste conectado. Nenhum dado real foi lido.');
 var today=typeof Clock!=='undefined'?Clock.today():iso(new Date()),ym=today.slice(0,7);
 if(type==='installments'){var rows=installmentsIn(testStore.cards,testStore.installments,ym);if(!rows.length){var nxt=dateBase(today);nxt.setMonth(nxt.getMonth()+1);return append(instance,'[parcelas do mês consultadas]','Consultei '+monthLabel(ym)+' em todos os cartões de teste e não encontrei parcelas com vencimento neste mês. Quer ver '+monthLabel(month(nxt))+'?');}var lines=rows.map(function(r){return r.description+' — parcela '+r.part+' de '+r.parts+' — '+cash(r.amount)+' — '+r.cardName+' — '+(r.status==='pago'?'paga':'pendente');});var sum=rows.reduce(function(s,r){return s+r.amount;},0);return append(instance,'[parcelas consultadas]',lines.join('\n')+'\nTotal: '+cash(sum)+'.');}
 var b=balance(testStore.cards,testStore.installments,today);if(!b.invoices.length)return append(instance,'[cartões consultados]','Não há cartões cadastrados no ambiente de teste.');
 return append(instance,'[faturas consultadas]',b.invoices.map(function(x){return x.cardName+' — '+monthLabel(x.month)+': '+cash(x.total);}).join('\n')+'\nTotal em aberto nas faturas atuais: '+cash(b.total)+'.');
}
function finance(text,intent){return intent==='financial'||intent==='financial_followup'||intent==='followup_yes'||intent==='followup_no'||/\b(saldo|gastos?|despesas?|cartao|fatura|parcelas?|paguei|gastei|boleto|dinheiro|pix|conta|renda|orcamento)\b/.test(n(text));}
function yes(t){return /\b(sim|pode continuar|continua|pode seguir|vamos continuar|estou bem|to bem|segue)\b/.test(n(t));}
function no(t){return /^\s*(nao|prefiro parar|agora nao)\b/.test(n(t));}
function safeUnknown(s){
 var v=String(s||'').trim();
 if(!v||v.length>220||/\\d|r\\$|@|https?:|www\\./i.test(v))return null;
 if(/\\b(cpf|cnpj|senha|cartao|pix|saldo|gasto|gastei|paguei|boleto|fatura|dinheiro|salario|divida|emprestimo|parcela|conta bancaria)\\b/i.test(v))return null;
 if(/\\b(meu nome|me chamo|sou chamado|sou chamada|meu cpf|minha senha|meu telefone)\\b/i.test(v))return null;
 if(/\\b(meu|minha|meus|minhas)\\s+(filho|filha|mae|pai|irmao|irma|amigo|amiga|marido|esposa|chefe|colega)\\b/i.test(v))return null;
 var folded=n(v);
 var allowed='a o as os um uma uns umas de do da dos das em no na nos nas com por para que porque se e ou mas eu me meu minha meus minhas voce seu sua seus suas isso isto aquilo aqui ai la ele ela eles elas essa esse essas esses outra outro outras outros frase frases mensagem mensagens texto palavra palavras inventada inventado entendida entendido entendi entender entendeu entenderam nao sim foi estou to tava ando tenho sinto parece quero queria preciso ajuda ajudar ajuda me ajuda conversar conversa falar falei falou disse dizer dizendo agora hoje ontem assim muito pouca pouco mais menos bem mal ruim dificil cansado cansada triste preocupado preocupada ansioso ansiosa confuso confusa sem animo vida tudo nada algo jeito certo errado estranho estranha app aplicativo abre abrir funciona funcionar erro problema problemas tentei tentar usar usando consigo aguento força forca sozinho sozinha'.split(' ');
 var tokens=folded?folded.split(' '):[];
 for(var i=0;i<tokens.length;i++)if(allowed.indexOf(tokens[i])===-1)return null;
 if(!tokens.length)return null;
 return folded;
}
function unknownConsent(instance,text){instance._aliciaUnknownRaw=text;instance._aliciaUnknownConsentPending=true;return append(instance,'[mensagem não entendida]','Ainda não consegui entender bem. Como você está? Posso guardar uma versão filtrada desta mensagem somente neste aparelho para revisar e melhorar a Alicia? Você decide.');}
if(ai){
 ai.registrarNaoEntendida=function(ok){var raw=this._aliciaUnknownRaw||'';this._aliciaUnknownRaw='';this._aliciaUnknownConsentPending=false;if(!ok){append(this,'[registro recusado]','Tudo bem. Não guardei a mensagem.');return false;}var clean=safeUnknown(raw);if(!clean){append(this,'[mensagem não guardada]','Não guardei essa mensagem porque pode conter nome, dado pessoal ou informação financeira.');return false;}try{var storage=root.localStorage,key='alicia_unknown_feedback_v1',items=[];if(!storage)throw new Error('local storage missing');try{items=JSON.parse(storage.getItem(key)||'[]');}catch(e){}if(!Array.isArray(items))items=[];items.push({text:clean,savedAt:new Date().toISOString()});if(items.length>30)items=items.slice(-30);storage.setItem(key,JSON.stringify(items));append(this,'[registro local consentido]','Guardei a frase filtrada somente neste aparelho. Ela não foi enviada à nuvem nem vinculada à sua conta.');return true;}catch(e){append(this,'[registro local indisponível]','Não consegui guardar no aparelho. Nada foi enviado à nuvem.');return false;}};
 ai.confirmarCompraCartao=function(){var p=this._aliciaCardPurchasePreview;if(!p||!testStore)return false;var rows=buildRows(p.card,p.draft,typeof Clock!=='undefined'?Clock.today():p.draft.date),made=testStore.addInstallmentsBatch?testStore.addInstallmentsBatch(rows):[];if(!made||made.length!==rows.length){append(this,'[falha no teste de parcelas]','Não consegui criar todas as parcelas.');return false;}if(testStore.save)testStore.save();this._aliciaLastExpenseAction={kind:'card',purchaseId:rows[0].compraId,draft:p.draft,card:p.card};this._aliciaCardPurchasePreview=null;append(this,'[compra parcelada teste salva]','Anotei: '+p.draft.item+', '+p.draft.installments+' parcelas no '+p.card.nome+'. Registro somente no ambiente de teste.');return true;};
 ai.cancelarCompraCartao=function(){this._aliciaCardPurchasePreview=null;append(this,'[prévia cancelada]','Compra cancelada. Nenhuma parcela foi criada.');};
 ai.corrigirCompraCartao=function(){var p=this._aliciaCardPurchasePreview;if(!p)return false;this._aliciaCardPurchasePreview=null;this._aliciaCardCorrection={preview:p,phase:'field'};return append(this,'[correção da prévia]','O que quer corrigir: valor, parcelas ou data?');};
 ai.selecionarCartaoGasto=function(id){var d=this._aliciaExpensePending;if(!d||!testStore)return false;var c=null;for(var i=0;i<testStore.cards.length;i++)if(String(testStore.cards[i].id)===String(id))c=testStore.cards[i];if(!c)return false;d.cardName=c.nome;d.cardId=c.id;d.awaiting='';return saveExpense(this,d);};
 ai.selecionarCategoriaGasto=function(c){var d=this._aliciaExpensePending;if(!d||d.awaiting!=='category'||['comida','transporte','saude','moradia','lazer','vestuario','outros'].indexOf(c)<0)return false;d.category=c;d.subcategory='outros';d.awaiting='';if(!d.paymentMethod)return ask(this,d,'payment');return saveExpense(this,d);};
 ai.mudarCategoriaGasto=function(){var action=this._aliciaLastExpenseAction;if(!action||!this.podeCorrigirUltimoGasto())return false;this._aliciaCategoryCorrectionPending=true;append(this,'[categoria para corrigir]','Qual a nova categoria para esse gasto?');return true;};
 ai.selecionarCategoriaCorrecao=function(category){if(!this._aliciaCategoryCorrectionPending||!this._aliciaLastExpenseAction)return false;var allowed=['comida','transporte','saude','moradia','lazer','vestuario','outros'];if(allowed.indexOf(category)<0)return false;this._aliciaCategoryCorrectionPending=false;this._aliciaExpenseShowChangeCategory=false;return correctSaved(this,{action:this._aliciaLastExpenseAction},'categoria',category);};
 ai.podeCorrigirUltimoGasto=function(){var a=this._aliciaLastExpenseAction;return !!(a&&testStore&&((a.kind==='movement'&&typeof testStore.updateMovement==='function')||(a.kind==='card'&&typeof testStore.replaceInstallments==='function')));};
 ai.iniciarCorrecaoGasto=function(){var a=this._aliciaLastExpenseAction;if(!a||!this.podeCorrigirUltimoGasto())return false;this._aliciaCorrection={action:a,phase:'field'};append(this,'[correção pendente]','O que você quer corrigir: valor, categoria, pagamento ou data?');return true;};
 ai.podeDesfazerUltimoGasto=function(){var a=this._aliciaLastExpenseAction;return !!(a&&testStore&&((a.kind==='movement'&&typeof testStore.removeMovement==='function')||(a.kind==='card'&&Array.isArray(testStore.installments))));};
 ai.desfazerUltimoGasto=function(){var a=this._aliciaLastExpenseAction;if(!a||!testStore)return false;if(a.kind==='movement'&&typeof testStore.removeMovement==='function')testStore.removeMovement(a.id);else if(a.kind==='card'){testStore.installments=testStore.installments.filter(function(x){return String(x.compraId)!==String(a.purchaseId);});if(testStore.save)testStore.save();}else return false;this._aliciaLastExpenseAction=null;append(this,'[gasto de teste desfeito]','Desfiz o lançamento somente no ambiente de teste.');return true;};
}
function correctSaved(instance,session,field,value){
 var a=session.action,d={},src=a.draft||{};Object.keys(src).forEach(function(k){d[k]=src[k];});
 if(field==='valor'){var x=amount(value).value;if(!x)return append(instance,'[valor inválido]','Não identifiquei o novo valor. Nenhuma alteração foi feita.');d.amount=x;}
 else if(field==='categoria'){var c=catReply(value);if(!c)return append(instance,'[categoria inválida]','Não identifiquei a categoria. Nada foi alterado.');d.category=c;d.subcategory='outros';}
 else if(field==='pagamento'){var p=payment(value);if(!p.method)return append(instance,'[pagamento inválido]','Não identifiquei a forma de pagamento. Nada foi alterado.');d.paymentMethod=p.method;}
 else if(field==='data')d.date=dateValue(value,typeof Clock!=='undefined'?Clock.today():'');
 if(a.kind==='movement'){var patch={valor:d.amount,categoria:d.category,subcategoria:d.subcategory,forma:d.paymentMethod,paymentMethod:d.paymentMethod,data:d.date};if(!testStore.updateMovement(a.id,patch))return append(instance,'[correção recusada]','O armazenamento de teste recusou a alteração. Mantive o lançamento original.');}
 else if(a.kind==='card'){var rows=buildRows(a.card,d,typeof Clock!=='undefined'?Clock.today():d.date);if(!testStore.replaceInstallments(a.purchaseId,rows))return append(instance,'[correção recusada]','O armazenamento de teste recusou a alteração. Mantive as parcelas originais.');}
 a.draft=d;instance._aliciaLastExpenseAction=a;instance._aliciaCorrection=null;if(testStore.save)testStore.save();return append(instance,'[correção de teste aplicada]','Atualizei o lançamento somente no armazenamento de teste.');
}

if(ai&&typeof ai.enviarMensagem==='function'&&!ai._aliciaExperienceV1Installed){
 var originalSend=ai.enviarMensagem;
 async function process(instance,text){
  var language=(typeof Store!=='undefined'&&Store.lang)?Store.lang:'pt',intent=brain&&brain.classify?brain.classify(text,instance._messages,language):'unknown';
  var crisis=intent==='self_safety_crisis'||intent==='third_party_danger'||intent==='third_party_self_safety'||intent==='sensitive_data'||intent==='sensitive_data_request';
  if(crisis){instance._aliciaExpensePending=null;instance._aliciaCardPurchasePreview=null;instance._aliciaCardCorrection=null;instance._aliciaCorrection=null;var safeReply=await originalSend.call(instance,text);if(intent==='self_safety_crisis'&&instance._aliciaCareState){scheduleCareExpiry(instance);delete instance._aliciaCareState.remaining;}return safeReply;}
  if(instance._aliciaCardCorrection){var cs=instance._aliciaCardCorrection;if(cs.phase==='field'){var cv=n(text);if(/\b(valor|preco)\b/.test(cv))cs.field='amount';else if(/\b(parcelas?|vezes)\b/.test(cv))cs.field='installments';else if(/\b(data|dia)\b/.test(cv))cs.field='date';if(!cs.field)return append(instance,'[campo da prévia]','Escolha valor, parcelas ou data.');cs.phase='value';var cp={amount:'Qual é o novo valor total?',installments:'Em quantas vezes?',date:'Qual foi a data da compra?'};return append(instance,'[novo dado da prévia]',cp[cs.field]);}var cd=cs.preview.draft;if(cs.field==='amount'){var ca=amount(text).value;if(!ca)return append(instance,'[valor não identificado]','Não consegui entender o novo valor.');cd.amount=ca;}else if(cs.field==='installments'){var ci=String(text).match(/^\s*(\d{1,2})\s*$/);cd.installments=ci?Math.max(1,Math.min(48,Number(ci[1]))):partCount(text);}else if(cs.field==='date')cd.date=dateValue(text,typeof Clock!=='undefined'?Clock.today():'');instance._aliciaCardCorrection=null;return showCardPreview(instance,cd,cs.preview.card);}
  if(instance._aliciaCorrection){
   var s=instance._aliciaCorrection;
   if(s.phase==='field'){var v=n(text);if(/\b(valor|preco)\b/.test(v))s.field='valor';else if(/\bcategoria\b/.test(v))s.field='categoria';else if(/\b(pagamento|forma)\b/.test(v))s.field='pagamento';else if(/\b(data|dia)\b/.test(v))s.field='data';if(!s.field)return append(instance,'[campo de correção]', 'Escolha valor, categoria, pagamento ou data.');s.phase='value';var q={valor:'Qual é o novo valor?',categoria:'Qual é a nova categoria?',pagamento:'Como foi pago?',data:'Qual foi a data?'};return append(instance,'[novo dado de correção]',q[s.field]);}
   return correctSaved(instance,s,s.field,text);
  }
  if(instance._aliciaExpensePending)return continueDraft(instance,instance._aliciaExpensePending,text);
  if(instance._aliciaCardPurchasePreview){if(/\b(sim|salvar|confirma|confirmo)\b/.test(n(text)))return ai.confirmarCompraCartao.call(instance);if(/\b(corrigir|nao|cancela|cancelar)\b/.test(n(text)))return ai.cancelarCompraCartao.call(instance);}
  if(instance._aliciaCareState){
   var state=instance._aliciaCareState;
   if(state.expiresAt&&Date.now()>state.expiresAt)instance._aliciaCareState=null;
   else if(crisis)instance._aliciaCareState=null;
   else if(state.checkAsked&&state.pendingFinancialMessage&&yes(text)){var pending=state.pendingFinancialMessage;instance._aliciaCareState=null;return originalSend.call(instance,pending);}
   else if(state.checkAsked&&no(text)){instance._aliciaCareState=null;return append(instance,'[pausa respeitada]','Tudo bem. Podemos deixar essa consulta para depois. Não precisa decidir nada agora.');}
   else if(finance(text,intent)){if(!state.checkAsked){state.checkAsked=true;state.pendingFinancialMessage=text;state.expiresAt=Date.now()+30*60*1000;return append(instance,'[checagem breve]','Antes de continuar com as finanças, quero saber como você está e se prefere seguir com a consulta agora. Tudo bem?');}instance._aliciaCareState=null;}
   else instance._aliciaCareState=null;
  }
  var v=n(text);
  if(/\b(quais parcelas|parcelas tenho|parcelas deste mes|parcelas esse mes|parcelas neste mes)\b/.test(v))return listQuery(instance,'installments');
  if(/\b(quanto falta pagar do cartao|quanto devo no cartao|fatura do cartao|quanto falta da fatura)\b/.test(v))return listQuery(instance,'balance');
  var cmd=parse(text,typeof Clock!=='undefined'?Clock.today():'');
  if(cmd){if(cmd.amount===null||cmd.amount===undefined)return ask(instance,cmd,'amount');if(!cmd.paymentMethod)return ask(instance,cmd,'payment');if(!cmd.category)return askCat(instance,cmd);return saveExpense(instance,cmd);}
  if(intent==='unknown'&&!finance(text,intent))return unknownConsent(instance,text);
  var result=await originalSend.call(instance,text);
  if(instance._aliciaCareState&&!instance._aliciaCareState.expiresAt)scheduleCareExpiry(instance);
  return result;
 }
 ai.enviarMensagem=function(question){var input=typeof document!=='undefined'?document.getElementById('alicerce-assistant-input'):null;var text=String(question!==undefined?question:(input?input.value:'')||'').trim();if(!text)return;return process(this,text);};
 ai._aliciaExperienceV1Installed=true;
}
if(ai){
 ai._audioEnabled=false;ai._recognitionEnabled=false;
 var audioOff=function(){var s=typeof document!=='undefined'?document.getElementById('alicerce-assistant-status'):null;if(s)s.textContent='O áudio da Alicia está desativado. Você pode digitar ou usar o ditado do teclado.';return false;};
 ai.toggleMicrofone=audioOff;ai.solicitarMicrofone=audioOff;ai.solicitarMicrofoneRemoto=audioOff;ai.iniciarMicrofone=audioOff;ai._iniciarSessaoReconhecimento=audioOff;ai.pedirAudio=audioOff;ai.ouvirMensagem=audioOff;
}
if(typeof root.renderAssistente==='function'&&!root.__aliciaExperienceRenderInstalled){
 var oldRender=root.renderAssistente;
 root.renderAssistente=function(){
  var html=String(oldRender.apply(this,arguments)||'');
  html=html.replace(/<button\b[^>]*class="[^"]*\balicerce-assistant-speak\b[^"]*"[^>]*>[\s\S]*?<\/button>/gi,'');
  html=html.replace(/<button\b[^>]*class="[^"]*\balicerce-assistant-mic\b[^"]*"[^>]*>[\s\S]*?<\/button>/gi,'');
  html=html.replace(/<button\b[^>]*id="alicerce-assistant-mic"[^>]*>[\s\S]*?<\/button>/gi,'');
  html=html.replace(/onfocus="AlicerceIA\.mostrarAvisoDitado\(\)"/g,'').replace(/placeholder="Digite sua mensagem\.\.\."/g,'placeholder="Digite sua mensagem"').replace(/aria-label="Digite sua mensagem\.\.\."/g,'aria-label="Digite sua mensagem"');
  html=html.replace('<section class="alicerce-assistant-chat-panel">','<p class="alicia-assistant-disclaimer">A Alicia é uma assistente digital. Não substitui atendimento profissional nem serviço de emergência. CVV 188 · SAMU 192</p><section class="alicerce-assistant-chat-panel">');
  var extra='';
  if(!ai._dictationHintShown){ai._dictationHintShown=true;extra+='<p class="alicerce-assistant-note">Dica: toque no microfone do teclado para ditar.</p>';}
  if(ai._aliciaUnknownConsentPending)extra+='<div class="alicia-assistant-actions"><button type="button" onclick="AlicerceIA.registrarNaoEntendida(true)">Permitir registro local</button><button type="button" onclick="AlicerceIA.registrarNaoEntendida(false)">Não guardar</button></div>';
  if(ai._aliciaExpensePending&&ai._aliciaExpensePending.awaiting==='category'){extra+='<div class="alicia-assistant-actions">';[['comida','Alimentação'],['transporte','Transporte'],['saude','Saúde'],['moradia','Contas'],['lazer','Lazer'],['vestuario','Roupas'],['outros','Outros']].forEach(function(c){extra+='<button type="button" onclick="AlicerceIA.selecionarCategoriaGasto(\''+c[0]+'\')">'+c[1]+'</button>';});extra+='</div>';}
  if(ai._aliciaExpensePending&&ai._aliciaExpensePending.awaiting==='card'&&Array.isArray(ai._aliciaExpenseCardChoices)){extra+='<div class="alicia-assistant-actions">';ai._aliciaExpenseCardChoices.forEach(function(c){var id=JSON.stringify(String(c.id)).replace(/"/g,'&quot;');extra+='<button type="button" onclick="AlicerceIA.selecionarCartaoGasto('+id+')">'+String(c.name).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</button>';});extra+='</div>';}
  if(ai._aliciaCardPurchasePreview)extra+='<div class="alicia-assistant-actions"><button type="button" onclick="AlicerceIA.confirmarCompraCartao()">Salvar</button><button type="button" onclick="AlicerceIA.corrigirCompraCartao()">Corrigir</button></div>';
  if(ai._aliciaCategoryCorrectionPending){extra+='<div class="alicia-assistant-actions">';[['comida','Alimentação'],['transporte','Transporte'],['saude','Saúde'],['moradia','Contas'],['lazer','Lazer'],['vestuario','Roupas'],['outros','Outros']].forEach(function(c){extra+='<button type="button" onclick="AlicerceIA.selecionarCategoriaCorrecao(\''+c[0]+'\')">'+c[1]+'</button>';});extra+='</div>';}
  else if(ai._aliciaExpenseShowChangeCategory)extra+='<div class="alicia-assistant-actions"><button type="button" onclick="AlicerceIA.mudarCategoriaGasto()">Mudar categoria</button></div>';
  if(ai._aliciaLastExpenseAction){extra+='<div class="alicia-assistant-actions">';if(ai.podeCorrigirUltimoGasto())extra+='<button type="button" onclick="AlicerceIA.iniciarCorrecaoGasto()">Corrigir</button>';if(ai.podeDesfazerUltimoGasto())extra+='<button type="button" onclick="AlicerceIA.desfazerUltimoGasto()">Desfazer</button>';extra+='</div>';}
  if(extra)html=html.replace('</form>','</form>'+extra);
  html=html.replace('<style id="alicerce-assistant-screen-styles">','<style id="alicerce-assistant-screen-styles">.alicia-assistant-disclaimer{margin:0 0 10px;padding:8px 10px;border-left:3px solid var(--accent);background:var(--surface2);color:var(--text2);font-size:10px;line-height:1.45}.alicia-assistant-actions{display:flex;flex-wrap:wrap;gap:7px;margin:9px 0}.alicia-assistant-actions button{min-height:36px;padding:7px 11px;border:1px solid var(--field-border);border-radius:10px;background:var(--surface);color:var(--text);font-size:11px;font-weight:700;cursor:pointer}.alicerce-assistant-note{margin:5px 2px 2px;color:var(--text2);font-size:10px;line-height:1.4}');
  return html;
 };
 root.__aliciaExperienceRenderInstalled=true;
}
})(window);