import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source=readFileSync(new URL("../assets/alicia-analitica.js",import.meta.url),"utf8");
const cash=readFileSync(new URL("../assets/alicia-cashflow.js",import.meta.url),"utf8");
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const env={Intl, Date, Set, console};
env.window=env;
vm.runInNewContext(cash,env,{filename:"alicia-cashflow.js"});
vm.runInNewContext(source,env,{filename:"alicia-analitica.js"});
const A=env.AlicerceAnalitica;
const clock="2026-11-23";
function store(){
  return {
    movements:[
      {id:"paid1",tipo:"despesa",status:"pago",data:"2026-11-20",valor:25,categoria:"comida",descricao:"Lanche"},
      {id:"paid2",tipo:"despesa",status:"pago",data:"2026-11-20",valor:50,categoria:"transporte",descricao:"Uber"},
      {id:"pending",tipo:"despesa",status:"pendente",data:"2026-11-30",valor:600,descricao:"Aluguel",dataVencimento:"2026-11-30"},
      {id:"transfer",tipo:"transferencia",direction:"saida",status:"pago",data:"2026-11-19",valor:200,descricao:"Entre contas próprias"},
      {id:"gift",tipo:"transferencia",direction:"saida",status:"pago",data:"2026-11-19",valor:40,descricao:"Ajuda financeira para família"},
    ],
    loans:[],cards:[],commitments:[],
    installments:[{id:"cc",tipo:"cartao",status:"pendente",valor:80,descricao:"Compra parcelada",data:"2026-12-05"}],
    getAnalysisEntries(){return [
      {id:"paid1",data:"2026-11-20",valor:25,categoria:"comida"},
      {id:"paid2",data:"2026-11-20",valor:50,categoria:"transporte"},
      {id:"old",data:"2026-10-15",valor:30,categoria:"comida"},
      {id:"card1",data:"2026-11-30",valor:10,categoria:"comida",source:"card"},
    ];},
    getMotorFinanceiro(){return {aReceber:15};}
  };
}
test("interpreta intenções e não confunde pedidos sem assunto financeiro",()=>{
 assert.equal(A.intent("Alicia, mostra um gráfico de gastos por categoria"),"categories");
 assert.equal(A.intent("Compare meus gastos dos últimos meses"),"months");
 assert.equal(A.intent("Mostre as dívidas que tenho a pagar"),"obligations");
 assert.equal(A.intent("Quero um gráfico do dinheiro que já saiu"),"outflows");
 assert.equal(A.intent("Mostre um gráfico financeiro"),"overview");
 assert.equal(A.intent("quero um gráfico do clima"),null);
 assert.equal(A.intent("comprei um lanche"),null);
});
test("gráfico por categoria usa registros reais e soma a parcela sem chamar de pagamento",()=>{
 const c=A.chart("Mostre gráfico de categorias de gasto",store(),clock);
 assert.equal(c.total,85);
 assert.equal(c.data.find(x=>x.label==="comida").label,"comida");
 assert.equal(c.data.find(x=>x.label==="comida").value,35);
 assert.equal(c.note.includes("parcelas de cartão"),true);
 assert.match(A.renderChart(c),/R\$[\s\u00a0]35,00/);
});
test("evolução de seis meses respeita os meses e não inventa dados",()=>{
 const c=A.chart("Compare meus gastos dos últimos meses",store(),clock);
 assert.equal(c.data.length,6);
 assert.equal(c.data[5].value,85);
 assert.equal(c.data[4].value,30);
 assert.equal(c.total,115);
 assert.match(A.renderChart(c),/alicia-chart-columns/);
});
test("gráfico de dinheiro efetivamente gasto exclui transferência própria e conta pendente",()=>{
 const c=A.chart("Mostra gráfico do dinheiro que já saiu",store(),clock);
 assert.equal(c.total,115);
 assert.equal(c.data.some(x=>x.label==="Ajuda e presentes"),true);
 assert.equal(c.data.some(x=>x.label==="Entre contas próprias"),false);
});
test("vencimentos e dívidas mantêm vencidas separadas e não alteram registros",()=>{
 const st=store();
 const snapshot=JSON.stringify(st.movements);
 const c=A.chart("Mostre as dívidas a pagar",st,clock);
 assert.equal(c.total,680);
 assert.equal(c.data[0].value,0);
 assert.equal(c.data[1].value,680);
 assert.equal(JSON.stringify(st.movements),snapshot);
});
test("sem lançamentos não gera gráficos enganosos ou números simulados",()=>{
 const st={movements:[],installments:[],commitments:[],loans:[],getAnalysisEntries(){return [];}};
 const c=A.chart("mostra um gráfico financeiro",st,clock);
 assert.equal(c.empty,true);
 assert.match(A.renderChart(c),/Sem dados suficientes/);
 assert.match(A.response(c),/não há lançamentos confirmados suficientes/);
});
test("dados de rótulos são escapados e não executáveis no gráfico",()=>{
 const st=store();
 st.getAnalysisEntries=()=>[{data:"2026-11-23",valor:10,categoria:'<script>alert("x")</script>'}];
 const c=A.chart("gráfico de categorias de gastos",st,clock);
 const out=A.renderChart(c);
 assert.equal(out.includes("<script>"),false);
 assert.equal(out.includes("&lt;script&gt;"),true,JSON.stringify({type:c.type,data:c.data,html:out.slice(0,900)}));
});
test("chat embute gráfico na resposta e preserva dados do usuário",()=>{
 assert.match(html,/AlicerceAnalitica\.chart\(questionForEngine,Store,Clock\.today\(\)\)/);
 assert.match(html,/AlicerceAnalitica\.renderChart\(item.chart\)/);
 assert.match(html,/assets\/alicia-analitica\.js/);
});
