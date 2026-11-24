/* Alicerce — arquivo de consumo por pastas. Observações não movimentam saldo. */
(function(){
'use strict';
var categories=[
['alimentacao','Alimentação'],['limpeza','Limpeza'],['higiene','Higiene pessoal'],
['saude','Saúde'],['casa','Casa'],['pets','Animais'],['outros','Outros']
];
function clean(s){return String(s||'').replace(/\s+/g,' ').trim().slice(0,120)}
function norm(s){return clean(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}
function num(s){var v=String(s||'').trim().replace(/R\$/gi,'').replace(/\s/g,'');if(!/^\d{1,3}(?:\.\d{3})*,\d{2}$|^\d+,\d{2}$/.test(v))return null;return Number(v.replace(/\./g,'').replace(',','.'))}
function money(n){return Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
function folder(name){
var v=norm(name);
if(/sabao|detergente|desinfetante|amaciante|agua sanitaria|esponja|limpador|multiuso|alvejante/.test(v))return 'limpeza';
if(/shampoo|sabonete|creme dental|escova dental|desodorante|absorvente|papel higienico|condicionador/.test(v))return 'higiene';
if(/remedio|medicamento|vitamina|farmacia|curativo/.test(v))return 'saude';
if(/racao|areia gato|petisco pet/.test(v))return 'pets';
if(/lampada|pilha|bateria|utensilio|pano de prato/.test(v))return 'casa';
if(/arroz|feijao|farinha|farofa|leite|cafe|acucar|carne|frango|biscoito|bisc |pao|macarrao|oleo|ovo|iogurte|queijo|manteiga|fruta|banana|tomate|batata|refrigerante|suco|agua mineral/.test(v))return 'alimentacao';
return 'outros';
}
function key(){return 'consumptionReceiptsV1'}
function records(){
if(typeof Store==='undefined'||!Store.userId)return [];
var v=Store.settings&&Store.settings[key()];
return Array.isArray(v)?v.filter(function(x){return x&&x.ownerId===String(Store.userId)}):[];
}
function parse(raw){
var lines=String(raw||'').replace(/\r/g,'').split('\n').map(clean).filter(Boolean);
var items=[];
for(var i=0;i<lines.length;i++){
var title=lines[i],n=norm(title);
if(/^(qtde|qtd|vl\.|valor|total|documento|cnpj|cpf|chave|tributos|pagamento|troco|desconto|subtotal|consumidor)/.test(n))continue;
var inline=title.match(/^(.+?)\s+(?=\b(?:qtde|qtd)[.:\s])/i);
if(inline)title=inline[1].trim();
var detail=inline?lines[i]:lines[i+1]||'';
var quantity=detail.match(/\b(?:qtde|qtd)[.:\s]*([\d.,]+)/i);
if(!quantity)continue;
var nextIndex=i+(inline?1:2);
var following=lines[nextIndex]||'';
if(/^\s*(?:vl\.?\s*total|valor\s*total)\b/i.test(following)){
detail+=' '+following;
following=lines[nextIndex+1]||'';
}
var total=(detail+' '+(/^\s*(?:R\$\s*)?[\d.]+,\d{2}\s*$/.test(following)?following:''))
.match(/(?:vl\.?\s*total|valor\s*total)\s*[:R$\s]*([\d.]+,\d{2})/i);
if(!total||!/\p{L}/u.test(title)||title.length<4||title.length>115)continue;
var desc=clean(title.replace(/\s*\((?:c[oó]digo|cod)\s*[:.]?\s*\d+\s*\)/i,''));
var value=num(total[1]);
var qt=quantity?Number(quantity[1].replace(',','.')):1;
if(!value||!Number.isFinite(qt)||qt<=0||qt>10000)continue;
if(/nota fiscal|supermercado|cnpj|documento|tributo|informac|emitid|consumidor|chave de acesso/i.test(norm(desc)))continue;
items.push({name:desc,quantity:qt,total:value,folder:folder(desc)});
if(items.length>=120)break;
}
return items;
}
function escape(s){return String(s||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function dialog(title,inner){
var old=document.getElementById('al-consumo-overlay');if(old)old.remove();
var el=document.createElement('div');el.id='al-consumo-overlay';el.style='position:fixed;inset:0;background:rgba(0,0,0,.82);z-index:10000;overflow:auto;padding:20px 12px;box-sizing:border-box';
el.innerHTML='<section role="dialog" aria-modal="true" aria-label="'+escape(title)+'" style="max-width:540px;margin:auto;background:var(--surface);color:var(--text);border:1px solid var(--line);border-radius:20px;padding:17px"><h2 style="font-size:19px;margin:0 0 12px">'+escape(title)+'</h2>'+inner+'<button type="button" class="btn btn-secondary mt-3" id="al-consumo-close">Fechar</button></section>';
document.body.appendChild(el);el.querySelector('#al-consumo-close').onclick=function(){el.remove()};
return el;
}
function review(raw,receipt){
var parsed=parse(raw);
var body='<p class="text-muted text-sm">Revise produto, quantidade, valor total e pasta. Nada será lançado no banco ou no saldo.</p>';
body+='<p class="text-sm">Itens reconhecidos: <strong>'+parsed.length+'</strong>. Você pode corrigir as linhas antes de arquivar.</p>';
body+='<label for="al-consumo-lines" class="form-label">Um produto por linha: nome | quantidade | total</label>';
body+='<textarea id="al-consumo-lines" rows="9" style="width:100%;font-size:14px;min-height:180px">'+escape(parsed.map(function(x){return x.name+' | '+x.quantity+' | '+x.total.toFixed(2).replace('.',',')}).join('\n'))+'</textarea>';
body+='<p class="text-muted text-sm">Se nenhum item foi lido, a nota pode ser arquivada sem produtos. O total da compra é independente da soma de itens quando houver descontos.</p>';
body+='<button type="button" class="btn btn-primary btn-block mt-3" id="al-consumo-save">Confirmar e arquivar nota</button>';
var el=dialog('Produtos da nota · revisão',body);
el.querySelector('#al-consumo-save').onclick=function(){
if(!Store.userId){alert('Entre na conta para arquivar.');return}
var lines=el.querySelector('#al-consumo-lines').value.split('\n').map(function(x){return x.trim()}).filter(Boolean);
var list=[],bad=0;
lines.forEach(function(line){
var parts=line.split('|').map(function(x){return x.trim()});
var q=Number((parts[1]||'').replace(',','.')),value=num(parts[2]||'');
if(parts.length!==3||!parts[0]||parts[0].length>120||!Number.isFinite(q)||q<=0||!value||value<=0){bad++;return}
list.push({name:clean(parts[0]),quantity:q,total:value,folder:folder(parts[0])});
});
if(bad){alert('Corrija as linhas inválidas antes de arquivar.');return}
if(!list.length&&!confirm('Arquivar somente os dados gerais da nota, sem produtos?'))return;
var keyFiscal=String(receipt&&receipt.fiscalKey||'');
var prev=records();
if(keyFiscal&&prev.some(function(x){return x.fiscalKey===keyFiscal})){alert('Esta chave fiscal já foi arquivada nesta conta.');return}
var total=num(receipt&&receipt.total)||num(receipt&&receipt.paid)||null;
var note={id:'nota-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),ownerId:String(Store.userId),createdAt:new Date().toISOString(),date:clean(receipt&&receipt.date),merchant:clean(receipt&&receipt.merchant),fiscalKey:keyFiscal,total:total,items:list,ledgerMovementId:null};
Store.settings=Store.settings||{};
Store.settings[key()]=prev.concat(note);
Store.save();
el.remove();
if(window.AlicerceIA&&Array.isArray(AlicerceIA._messages)){
var answer='Arquivei a nota com '+list.length+' produtos organizados em pastas. O arquivo de consumo não altera seu saldo nem cria despesa. Posso analisar seus preços por produto.';
AlicerceIA._messages.push({role:'assistant',text:answer});
AlicerceIA._answer=answer;
if(typeof render==='function')render();
}
};
}
function receiptDate(value){
var raw=String(value||'');
var iso=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
var br=raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
var date=iso?raw:br?br[3]+'-'+br[2].padStart(2,'0')+'-'+br[1].padStart(2,'0'):'';
var instant=date?new Date(date+'T12:00:00Z'):null;
return instant&&!isNaN(instant.getTime())&&instant.toISOString().slice(0,10)===date?date:'';
}
function summary(question){
var data=records(),items=[];
data.forEach(function(r){(r.items||[]).forEach(function(it){items.push({name:it.name,folder:it.folder||folder(it.name),total:Number(it.total)||0,quantity:Number(it.quantity)||1,date:receiptDate(r.date),receiptId:r.id||data.indexOf(r),merchant:r.merchant})})});
if(!data.length)return 'Ainda não existem notas arquivadas. Envie a foto de uma nota à Alícia para começar seu histórico de produtos.';
var q=norm(question),group=q.match(/alimentacao|limpeza|higiene|saude|casa|pets|outros/);
var target=group?group[0]:null;
var filtered=target?items.filter(function(x){return x.folder===target}):items;
var sum=filtered.reduce(function(a,x){return a+x.total},0);
var response='Arquivo de consumo: '+data.length+' notas, '+items.length+' produtos cadastrados. '+(target?'Pasta '+target+': ':'Produtos extraídos: ')+filtered.length+' itens, '+money(sum)+' em itens. Esse valor não representa necessariamente o gasto bancário.';
var by={};filtered.forEach(function(x){by[x.folder]=(by[x.folder]||0)+x.total});
var ranked=Object.keys(by).sort(function(a,b){return by[b]-by[a]}).slice(0,5);
if(ranked.length)response+='\nPastas: '+ranked.map(function(k){return (categories.find(function(c){return c[0]===k})||[k,k])[1]+' '+money(by[k])}).join(' · ')+'.';
if(/preco|aumento|barato|caro|produto|compare|comparar/.test(q)){
var words=function(value){return norm(value).match(/[a-z0-9]+/g)||[]};
var ignored=new Set(['compare','comparar','preco','precos','aumento','barato','caro','produto','produtos','o','a','do','da','de','os','das','dos','em','no','na','quanto','custou','custa','pastas','consumo','historico','minhas','meus','nas','nos']);
var targetWords=words(question).filter(function(word){return !ignored.has(word)});
var products=Object.create(null);
items.forEach(function(item){
var name=words(item.name).join(' ');
if(!item.date||!targetWords.length||!targetWords.every(function(word){return name.split(' ').includes(word)}))return;
var notes=products[name]||(products[name]=new Map());
var entry=notes.get(item.receiptId)||{name:item.name,date:item.date,total:0,quantity:0};
entry.total+=item.total;entry.quantity+=item.quantity;notes.set(item.receiptId,entry);
});
var variants=Object.keys(products);
var matching=variants.length===1?Array.from(products[variants[0]].values()).sort(function(a,b){return a.date.localeCompare(b.date)}):[];
if(variants.length>1)response+='\nEncontrei mais de uma versão desse produto. Informe também a marca ou o tamanho da embalagem.';
if(matching.length>=2){var a=matching[matching.length-2],b=matching[matching.length-1];response+='\n'+b.name+': últimas duas ocorrências, '+money(a.total/a.quantity)+' e '+money(b.total/b.quantity)+' por unidade informada. Confira embalagens e quantidades antes de comparar.'}
else response+='\nPara comparar preços, preciso de ao menos duas ocorrências do mesmo produto com unidades equivalentes.';
}
return response;
}
function open(){
var data=records();
var html='<p class="text-muted text-sm">Arquivo privado da conta. As pastas não alteram seu saldo bancário.</p>';
if(!data.length)html+='<p>Sem notas arquivadas. Envie uma foto de nota à Alícia.</p>';
categories.forEach(function(cat){
var rows=[];data.forEach(function(r){(r.items||[]).forEach(function(x){if(x.folder===cat[0])rows.push({item:x,receipt:r})})});
var sum=rows.reduce(function(a,x){return a+x.item.total},0);
html+='<details style="border:1px solid var(--line);border-radius:12px;padding:10px;margin:8px 0"><summary><strong>'+escape(cat[1])+'</strong> · '+rows.length+' itens · '+money(sum)+'</summary>';
rows.slice(-60).reverse().forEach(function(x){html+='<div style="border-top:1px solid var(--line);padding:8px 0;font-size:12px"><strong>'+escape(x.item.name)+'</strong><div>'+escape(x.item.quantity)+' un. · '+money(x.item.total)+' · '+escape(x.receipt.merchant||'Local não identificado')+'</div></div>'});
html+='</details>';
});
html+='<details><summary>Notas arquivadas ('+data.length+')</summary>';
data.slice().reverse().slice(0,50).forEach(function(r){html+='<p class="text-sm">'+escape(r.merchant||'Estabelecimento não identificado')+' · '+escape(r.date||'Data não identificada')+' · '+(r.total===null?'Sem total':money(r.total))+' · '+r.items.length+' produtos</p>'});
html+='</details>';
dialog('Minhas pastas de consumo',html);
}
window.AlicerceConsumo={parse:parse,review:review,open:open,summary:summary,records:records};
})();