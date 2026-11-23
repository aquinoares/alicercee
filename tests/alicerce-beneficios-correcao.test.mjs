import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../assets/alicerce-beneficios.js",import.meta.url),"utf8");
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const sandbox={Date,Math,Set,Intl};sandbox.window=sandbox;
vm.runInNewContext(source,sandbox,{filename:"alicerce-beneficios.js"});
const B=sandbox.AlicerceBeneficios;
function store(userId="conta-a"){
 let index=0;
 return {userId,settings:{},movements:[],cards:[],_uid(){return "id-"+(++index);},save(){this.saves=(this.saves||0)+1;},getMotorFinanceiro(){return {disponivel:250};}};
}
function setup(){
 const s=store(),w=B.addWallet(s,"pluxee",true).wallet;
 B.addEntry(s,w.id,"credit","600","2026-11-23","Recarga correta");
 B.addEntry(s,w.id,"credit","600","2026-11-23","Recarga duplicada por engano");
 return {s,w};
}
test("exclui apenas a recarga duplicada e corrige o saldo preservando dinheiro bancário",()=>{
 const {s,w}=setup();
 assert.equal(B.balance(w),1200);
 const second=w.entries[1].id;
 assert.equal(B.removeEntry(s,w.id,second),true);
 assert.equal(B.balance(w),600);
 assert.equal(w.entries.length,1);
 assert.equal(s.movements.length,0);
 assert.equal(s.getMotorFinanceiro().disponivel,250);
});
test("editar valor substitui a recarga anterior, sem somar outra entrada",()=>{
 const {s,w}=setup();
 const id=w.entries[0].id;
 const result=B.updateEntry(s,w.id,id,"450,00","2026-11-20","Saldo inicial corrigido");
 assert.equal(result.ok,true);
 assert.equal(B.balance(w),1050);
 assert.equal(w.entries.length,2);
 assert.equal(w.entries[0].amount,450);
 assert.equal(w.entries[0].description,"Saldo inicial corrigido");
});
test("conferir saldo real cria apenas a diferença e não nova recarga",()=>{
 const {s,w}=setup();
 const result=B.setBalance(s,w.id,"580,00","2026-11-23");
 assert.equal(result.ok,true);
 assert.equal(result.delta,-620);
 assert.equal(B.balance(w),580);
 assert.equal(w.entries.length,3);
 assert.equal(w.entries[2].kind,"adjustment");
 assert.equal(w.entries[2].amount,-620);
 const summary=B.snapshot(s)[0];
 assert.equal(summary.credit,1200);
 assert.equal(summary.spent,0);
 const same=B.setBalance(s,w.id,"580,00","2026-11-23");
 assert.equal(same.unchanged,true);
 assert.equal(w.entries.length,3);
});
test("recarga futura aumenta saldo corretamente depois da conferência",()=>{
 const {s,w}=setup();
 B.setBalance(s,w.id,"500","2026-11-23");
 B.addEntry(s,w.id,"credit","150","2026-12-01","Recarga dezembro");
 assert.equal(B.balance(w),650);
});
test("exclusão e edição recusam deixar saldo negativo",()=>{
 const {s,w}=setup();
 B.addEntry(s,w.id,"debit","900","2026-11-23","Compras");
 assert.equal(B.removeEntry(s,w.id,w.entries[0].id),false);
 assert.equal(B.balance(w),300);
 const old=w.entries[1].amount;
 const attempt=B.updateEntry(s,w.id,w.entries[1].id,"100","2026-11-23","Correção");
 assert.equal(attempt.ok,false);
 assert.equal(w.entries[1].amount,old);
});
test("exclui cartão selecionado e histórico sem tocar outras carteiras",()=>{
 const {s,w}=setup();
 const another=B.addWallet(s,"solides",true).wallet;
 B.addEntry(s,another.id,"credit","150","2026-11-23","Recarga Sólides");
 assert.equal(B.deleteWallet(s,w.id).ok,true);
 assert.equal(B.wallets(s).length,1);
 assert.equal(B.wallets(s)[0].id,another.id);
 assert.equal(B.balance(another),150);
 assert.equal(s.movements.length,0);
});
test("impede duplicar carteira do mesmo fornecedor, permite editar o nome",()=>{
 const {s,w}=setup();
 assert.equal(B.addWallet(s,"pluxee",true).ok,false);
 assert.equal(B.updateWalletName(s,w.id,"Meu Sodexo").ok,true);
 assert.equal(B.snapshot(s)[0].name,"Meu Sodexo");
 assert.match(B.renderHome(s),/Meu Sodexo/);
});
test("dashboard premium mostra cartão, resumo e somente 3 lançamentos inicialmente",()=>{
 const {s,w}=setup();
 B.addEntry(s,w.id,"credit","10","2026-11-23","Terceira recarga");
 B.addEntry(s,w.id,"debit","5","2026-11-23","Compra 1");
 const page=B.renderPage(s,"2026-11-23");
 assert.match(page,/al-v2-hero/);
 assert.match(page,/R\$[\s\u00a0]1.205,00/);
 assert.match(page,/Nova recarga/);
 assert.match(page,/Registrar compra/);
 assert.match(page,/Corrigir saldo/);
 assert.match(page,/Recargas do mês/);
 assert.match(page,/Compras do mês/);
 assert.match(page,/Ver tudo/);
 assert.equal((page.match(/class="al-v2-entry-wrap"/g)||[]).length,3);
 assert.equal(page.includes('id="benefit-real-balance"'),false);
 assert.equal(page.includes("Excluir cartão e histórico"),false);
});
test("operações de correção e exclusão aparecem nas seções próprias sem poluir dashboard",()=>{
 const {s,w}=setup();
 s.screenData={benefitWalletId:w.id,benefitSection:"history",benefitEditEntryId:w.entries[0].id};
 let page=B.renderPage(s,"2026-11-23");
 for(const word of ["Editar","Excluir","Salvar correção","Valor correto"])assert.ok(page.includes(word),word);
 assert.equal((page.match(/class="al-v2-entry-wrap"/g)||[]).length,2);
 assert.equal(page.includes("id=\"benefit-real-balance\""),false);
 s.screenData={benefitWalletId:w.id,benefitSection:"balance"};
 page=B.renderPage(s,"2026-11-23");
 assert.match(page,/id="benefit-real-balance"/);
 assert.match(page,/Atualizar saldo/);
 s.screenData={benefitWalletId:w.id,benefitSection:"settings"};
 page=B.renderPage(s,"2026-11-23");
 assert.match(page,/Exibir este cartão na tela principal/);
 assert.match(page,/Excluir cartão e histórico/);
 for(const handler of ["alicerceBeneficioSalvarEdicao","alicerceBeneficioExcluirLancamento","alicerceBeneficioConferirSaldo","alicerceBeneficioExcluirCartao","alicerceBeneficioSalvarNome"])assert.ok(html.includes("function "+handler+"("),handler);
 assert.match(html,/window\.confirm\(/);
});
test("edição visual de recarga e compra tem formulários em seções separadas",()=>{
 const {s,w}=setup();
 s.screenData={benefitWalletId:w.id,benefitSection:"topup"};
 let page=B.renderPage(s,"2026-11-23");
 assert.match(page,/id="benefit-entry-kind" type="hidden" value="credit"/);
 assert.match(page,/Confirmar recarga/);
 s.screenData={benefitWalletId:w.id,benefitSection:"purchase"};
 page=B.renderPage(s,"2026-11-23");
 assert.match(page,/id="benefit-entry-kind" type="hidden" value="debit"/);
 assert.match(page,/Confirmar compra/);
});
