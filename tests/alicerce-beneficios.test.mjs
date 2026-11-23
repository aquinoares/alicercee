import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../assets/alicerce-beneficios.js",import.meta.url),"utf8");
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const env={Date,Math,Set,Intl};env.window=env;
vm.runInNewContext(source,env,{filename:"alicerce-beneficios.js"});
const B=env.AlicerceBeneficios;
function st(user="usuario-a"){return {userId:user,settings:{},movements:[],cards:[],count:0,save(){this.count++;},_uid(){return "id-"+(this.count+Math.random());},getBalances(){return {disponivel:1000};}};}
test("Cria vale-alimentação Sodexo/Pluxee e Sólides separados por conta",()=>{
 const a=st(),b=st("usuario-b");
 const p=B.addWallet(a,"pluxee",true),s=B.addWallet(a,"solides",false);
 assert.equal(p.ok,true);assert.equal(s.ok,true);
 assert.equal(B.snapshot(a).length,2);
 assert.equal(B.snapshot(b).length,0);
 assert.equal(B.snapshot(a)[0].showHome,true);
 assert.equal(B.snapshot(a)[1].showHome,false);
});
test("Recarga e gasto de benefício não mudam caixa nem crédito",()=>{
 const store=st(),wallet=B.addWallet(store,"pluxee",true).wallet;
 assert.equal(B.addEntry(store,wallet.id,"credit","600,00","2026-11-23","Recarga").ok,true);
 assert.equal(B.addEntry(store,wallet.id,"debit","80,50","2026-11-23","Mercado").ok,true);
 assert.equal(B.balance(wallet),519.5);
 assert.equal(store.movements.length,0);
 assert.equal(store.cards.length,0);
 assert.equal(store.getBalances().disponivel,1000);
});
test("Impedir saldo negativo, datas inválidas e lançamento sem descrição",()=>{
 const store=st(),wallet=B.addWallet(store,"solides",true).wallet;
 assert.equal(B.addEntry(store,wallet.id,"debit","20","2026-11-23","Mercado").ok,false);
 assert.equal(B.addEntry(store,wallet.id,"credit","20","2026-02-30","Recarga").ok,false);
 assert.equal(B.addEntry(store,wallet.id,"credit","20","2026-11-23","Recarga").ok,true);
 assert.equal(B.addEntry(store,wallet.id,"debit","15","2026-11-23","").ok,false);
 assert.equal(B.addEntry(store,wallet.id,"debit","15","2026-11-23","Mercado").ok,true);
 assert.equal(B.balance(wallet),5);
});
test("Saldo acumula sem zerar no mês seguinte; exibição na home é opcional",()=>{
 const store=st(),wallet=B.addWallet(store,"pluxee",false).wallet;
 B.addEntry(store,wallet.id,"credit","300","2026-10-05","Vale");
 B.addEntry(store,wallet.id,"debit","75","2026-10-21","Compra");
 assert.equal(B.balance(wallet),225);
 assert.equal(B.renderHome(store),"");
 B.toggleHome(store,wallet.id,true);
 assert.match(B.renderHome(store),/R\$[\u00a0\s]225,00/);
 assert.match(B.renderPage(store,"2026-11-23"),/Nova recarga/);
});
test("Alicia responde somente sobre carteira correspondente",()=>{
 const store=st();
 const p=B.addWallet(store,"pluxee",true).wallet;
 const s=B.addWallet(store,"solides",true).wallet;
 B.addEntry(store,p.id,"credit","100","2026-11-23","Recarga");
 B.addEntry(store,s.id,"credit","200","2026-11-23","Recarga");
 assert.match(B.answer(store,"Quanto tenho no Sodexo?"),/100,00/);
 assert.doesNotMatch(B.answer(store,"Quanto tenho no Sodexo?"),/200,00/);
 assert.match(B.answer(store,"Qual o saldo do Sólides?"),/200,00/);
 assert.equal(B.answer(store,"Bom dia Alicia"),"");
});
test("Dados de usuário são escapados e não executados na tela",()=>{
 const store=st(),w=B.addWallet(store,"pluxee",true).wallet;
 B.addEntry(store,w.id,"credit","20","2026-11-23","Crédito");
 B.addEntry(store,w.id,"debit","10","2026-11-23",'<img src=x onerror=alert(1)>');
 const out=B.renderPage(store,"2026-11-23");
 assert.equal(out.includes('<img src=x'),false);
 assert.match(out,/&lt;img src=x/);
});
test("A tela e o menu estão conectados ao aplicativo",()=>{
 assert.match(html,/case 'beneficios'/);
 assert.match(html,/AlicerceBeneficios\.renderHome\(Store\)/);
 assert.match(html,/assets\/alicerce-beneficios\.js/);
 assert.match(html,/alicerceBeneficioAdicionar/);
 assert.match(html,/Meus benefícios/);
});
