import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
const code=readFileSync(new URL("../assets/alicia-contextual.js",import.meta.url),"utf8");
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const ctx={Date,Intl,Math};ctx.window=ctx;
vm.runInNewContext(code,ctx,{filename:"alicia-contextual.js"});
const A=ctx.AlicerceAliciaContextual;
test("separates finance chat requests from app updates",()=>{
 assert.equal(A.matches("Alicia, como estão minhas finanças?"),true);
 assert.equal(A.matches("Me dá um resumo financeiro"),true);
 assert.equal(A.matches("analisa meus gastos"),true);
 assert.equal(A.matches("Quais são as atualizações do aplicativo?"),false);
 assert.equal(A.matches("Mostre as funcionalidades do aplicativo"),false);
 assert.equal(A.matches("Comprei R$ 50 com Sodexo"),false);
});
test("insights use real account values without fixed chart",()=>{
 const s={userId:"a",movements:[{id:"x"}],settings:{},getMotorFinanceiro(){return {disponivel:320}},
 getAnalysisEntries(){return [
 {data:"2026-11-11",valor:100,categoria:"alimentacao"},
 {data:"2026-11-15",valor:40,categoria:"transporte"},
 {data:"2026-10-11",valor:100,categoria:"alimentacao"}
 ];}};
 const x=A.report(s,"2026-11-23");
 assert.match(x.text,/R\$\s*140,00/);
 assert.match(x.text,/40% a mais/);
 assert.match(x.text,/alimentacao/);
 assert.match(x.text,/R\$\s*320,00/);
 assert.equal(x.text.includes("<canvas"),false);
});
test("no fake numbers for empty or unauthenticated account",()=>{
 const empty={userId:"b",movements:[],getAnalysisEntries(){return [];},getMotorFinanceiro(){return {disponivel:0}}};
 assert.equal(A.report(empty,"2026-11-23").facts,0);
 assert.equal(A.report({userId:null},"2026-11-23").facts,0);
});
test("carousel is updates only while chat uses contextual module",()=>{
 assert.match(html,/assets\/alicia-contextual\.js/);
 assert.match(html,/window\.AlicerceAliciaContextual\.report\(Store,Clock\.today\(\)\)/);
 assert.match(html,/smartCards=window\.AlicerceGuiaAlicia\.cards\(Store\)/);
 assert.match(html,/NOVIDADES · ALICERCE/);
 assert.doesNotMatch(html,/smartCards=tips\.concat\(/);
});

test("compares matching days and excludes future records from the period",()=>{
 const s={userId:"a",getAnalysisEntries(){return [
   {data:"2026-11-02",valor:100,categoria:"comida"},
   {data:"2026-11-29",valor:500,categoria:"comida"},
   {data:"2026-10-02",valor:80,categoria:"comida"},
   {data:"2026-10-29",valor:400,categoria:"comida"}
 ];}};
 const report=A.report(s,"2026-11-23");
 assert.equal(report.total,100);
 assert.equal(report.previousTotal,80);
 assert.match(report.text,/25% a mais/);
});

test("responde mercado por data de compra, Sodexo e aumento sem misturar os totais",()=>{
 const s={userId:"a",getAnalysisEntries(){return [
   {data:"2026-12-15",dataCompra:"2026-11-12",valor:50,subcategoria:"mercado"},
   {data:"2026-11-11",valor:30,subcategoria:"feira"},
   {data:"2026-11-15",valor:55,subcategoria:"uber"}
 ];}};
 ctx.AlicerceBeneficios={wallets:()=>[
   {provider:"pluxee",entries:[{kind:"debit",amount:13,date:"2026-11-02"}]},
   {provider:"solides",entries:[{kind:"debit",amount:20,date:"2026-11-02"}]}
 ]};
 ctx.AlicerceConsumo={increases:()=>({comparable:1,items:[{name:"Farofa",previous:6,current:8}]})};
 const q="Quanto gastei no mercado, o que encareceu e quanto saiu do Sodexo?";
 assert.equal(A.marketMatches(q),true);
 assert.equal(A.marketMatches("Comprei no mercado com Sodexo"),false);
 const result=A.marketReport(s,{start:"2026-11-01",end:"2026-11-23"},q);
 assert.match(result,/Mercado em dinheiro, Pix ou cartão: R\$\s*80,00/);
 assert.match(result,/Sodexo\/Pluxee: R\$\s*13,00/);
 assert.match(result,/Farofa: R\$\s*6,00 → R\$\s*8,00/);
 assert.doesNotMatch(result,/Sólides/);
});
