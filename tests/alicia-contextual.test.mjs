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
