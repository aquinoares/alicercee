import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
const benefitSource=readFileSync(new URL("../assets/alicerce-beneficios.js",import.meta.url),"utf8");
const analyticSource=readFileSync(new URL("../assets/alicia-analitica.js",import.meta.url),"utf8");
const cashflowSource=readFileSync(new URL("../assets/alicia-cashflow.js",import.meta.url),"utf8");
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const env={Date,Math,Set,Intl};env.window=env;
vm.runInNewContext(cashflowSource,env,{filename:"alicia-cashflow.js"});
vm.runInNewContext(benefitSource,env,{filename:"alicerce-beneficios.js"});
vm.runInNewContext(analyticSource,env,{filename:"alicia-analitica.js"});
const B=env.AlicerceBeneficios,A=env.AlicerceAnalitica;
function st(){
 return {userId:"u1",settings:{},movements:[],cards:[],installments:[],commitments:[],loans:[],
   save(){this.saved=(this.saved||0)+1;},_uid(){this.uid=(this.uid||0)+1;return "id-"+this.uid;},
   getMotorFinanceiro(){return {disponivel:500,aReceber:0};},
   getAnalysisEntries(){return [];},
 };
}
test("Adicionar compra oferece benefício e preserva carteira entre etapas",()=>{
 assert.match(html,/id="pay-benefit"/);
 assert.match(html,/contextoNovaCompra.novaCompraFlow&&contextoNovaCompra.paymentMethod!==\x27cartao\x27&&contextoNovaCompra.paymentMethod!==\x27beneficio\x27/);
 assert.match(html,/go\(data.novaCompraFlow\?\x27beneficios\x27:\x27home\x27\)/);
 assert.match(html,/gasto-benefit-options/);
 assert.match(html,/id="ag-benefit-id"/);
 assert.match(html,/benefitWalletId: paymentData.paymentMethod==='beneficio'/);
 assert.match(html,/id="edit-gasto-benefit-id"/);
 assert.match(html,/data.benefitWalletId=data.paymentMethod==='beneficio'/);
 assert.match(html,/AlicerceBeneficios.addEntry\(Store,data.benefitWalletId,'debit'/);
});
test("Compra do fluxo principal debita apenas o Sodexo selecionado, sem duplicar despesas",()=>{
 const s=st(),pl=B.addWallet(s,"pluxee",true).wallet,sol=B.addWallet(s,"solides",true).wallet;
 B.addEntry(s,pl.id,"credit","400","2026-11-23","Recarga");
 B.addEntry(s,sol.id,"credit","220","2026-11-23","Recarga");
 const result=B.addEntry(s,pl.id,"debit","68.90","2026-11-23","Compra do mercado",{category:"alimentacao",subcategory:"supermercado",merchant:"Mercado Exemplo",origin:"add-gasto"});
 assert.equal(result.ok,true);
 assert.equal(B.balance(pl),331.1);
 assert.equal(B.balance(sol),220);
 assert.equal(s.movements.length,0);
 assert.equal(s.cards.length,0);
 assert.equal(s.getMotorFinanceiro().disponivel,500);
 assert.equal(pl.entries[1].category,"alimentacao");
 assert.equal(pl.entries[1].merchant,"Mercado Exemplo");
 assert.equal(pl.entries[1].origin,"add-gasto");
});
test("Não salva compra quando o saldo do vale é insuficiente",()=>{
 const s=st(),pl=B.addWallet(s,"pluxee",true).wallet;
 B.addEntry(s,pl.id,"credit","30","2026-11-23","Recarga");
 const out=B.addEntry(s,pl.id,"debit","35","2026-11-23","Supermercado",{origin:"add-gasto"});
 assert.equal(out.ok,false);
 assert.equal(pl.entries.length,1);
 assert.equal(B.balance(pl),30);
});
test("Alicia faz gráfico do Sodexo no próprio chat usando os gastos do benefício",()=>{
 const s=st(),pl=B.addWallet(s,"pluxee",true).wallet,sol=B.addWallet(s,"solides",true).wallet;
 B.addEntry(s,pl.id,"credit","200","2026-11-23","Recarga");
 B.addEntry(s,pl.id,"debit","80","2026-11-23","Supermercado");
 B.addEntry(s,sol.id,"credit","100","2026-11-23","Recarga");
 B.addEntry(s,sol.id,"debit","15","2026-11-23","Padaria");
 const c=A.chart("Mostre gráfico dos meus gastos no Sodexo",s,"2026-11-23");
 assert.ok(c);
 assert.equal(c.type,"benefits");
 assert.equal(c.total,80);
 assert.equal(c.data.length,1);
 assert.match(A.renderChart(c),/Sodexo/);
 const all=A.chart("Mostre gráfico dos benefícios",s,"2026-11-23");
 assert.equal(all.total,95);
 assert.equal(all.data.length,2);
});
test("Alicia informa saldo de cartão de benefício sem tratar como dinheiro bancário",()=>{
 const s=st(),pl=B.addWallet(s,"pluxee",true).wallet;
 B.addEntry(s,pl.id,"credit","100","2026-11-23","Recarga");
 B.addEntry(s,pl.id,"debit","25","2026-11-23","Supermercado");
 const answer=B.answer(s,"Quanto gastei no Sodexo e quanto tenho de saldo?");
 assert.match(answer,/75,00/);
 assert.match(answer,/25,00/);
 assert.match(answer,/sem reduzir o dinheiro bancário/);
});
