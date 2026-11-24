/*
 * Alicia · autonomia analítica local. Somente leitura, sem serviços de gráficos externos.
 * O formato do gráfico depende da intenção do usuário e dos lançamentos do Store.
 * Nenhum gráfico altera contas, cria movimentações ou grava dados.
 */
(function(root){
  "use strict";
  if(root.AlicerceAnalitica) return;
  var COLORS=["#6fbcdd","#b9a6e8","#e7a67d","#86c8b0","#d6c079","#a6afd1"];
  function norm(x){return String(x||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");}
  function money(v){return (Number(v)||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});}
  function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
  function finite(v){var n=Number(v);return Number.isFinite(n)&&n>0?n:0;}
  function monthOffset(base,offset){var p=String(base).slice(0,7).split("-").map(Number);var d=new Date(p[0],p[1]-1+offset,1);return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");}
  function monthLabel(key){var parts=key.split("-");return ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"][Number(parts[1])-1]+"/"+parts[0].slice(2);}
  function paid(v){return !!v&&(v.status==="pago"||v.status==="recebido"||v.paymentStatus==="pago");}
  function isConsumption(r){var role=String(r&&r.analysis&&r.analysis.financialRole||"");return !["investment_contribution","investment_income","transfer","refund","adjustment"].includes(role);}
  function entries(store){
    // Canonical spending analysis excludes non-consumption flows, loan pass-throughs,
    // and uses existing source; card installment entries describe accrued consumption.
    return typeof store.getAnalysisEntries==="function"?store.getAnalysisEntries().filter(function(r){return r&&finite(r.valor)&&/^\d{4}-\d{2}-\d{2}$/.test(r.data||"");}):[];
  }
  function actualOutflows(store,month){
    var loans={};
    (store.loans||[]).forEach(function(l){if(l&&l.id)loans[String(l.id)]=l;});
    var list=[];
    (store.movements||[]).forEach(function(m){
      if(!m||!paid(m)||String(m.data||"").slice(0,7)!==month||!finite(m.valor))return;
      if(m.tipo==="despesa"&&isConsumption(m)){
        if(m.loanId&&loans[String(m.loanId)]&&loans[String(m.loanId)].tipo==="emprestei")return;
        list.push({label:String(m.categoria||"Outros"),value:finite(m.valor)});
      }else if(m.tipo==="transferencia"&&m.direction==="saida"){
        var purpose=norm([m.purpose,m.descricao,m.naturezaFinanceira].join(" "));
        if(String(m.analysis&&m.analysis.financialRole||"")==="gift"||/\b(presente|doacao|doei|ajuda financeira|sem devolucao)\b/.test(purpose)){
          list.push({label:"Ajuda e presentes",value:finite(m.valor)});
        }
      }
    });
    return list;
  }
  function categorize(rows,key){
    var values={};
    (rows||[]).forEach(function(r){var label=String(r[key]||"Outros").replace(/_/g," ");values[label]=(values[label]||0)+finite(r.value!=null?r.value:r.valor);});
    return Object.keys(values).map(function(k){return {label:k,value:Math.round(values[k]*100)/100};}).sort(function(a,b){return b.value-a.value;});
  }
  function sum(rows){return Math.round((rows||[]).reduce(function(a,r){return a+finite(r.value!=null?r.value:r.valor);},0)*100)/100;}
  function pending(store,today){
    if(root.AlicerceCashflow&&typeof root.AlicerceCashflow.summarize==="function"){
      // Cashflow snapshots already deduplicate commitments linked to movements.
      var s=root.AlicerceCashflow.summarize(store,today);
      return {total:s.pendingTotal,overdue:s.overdue,pending:s.pending,receivable:s.receivable,definitivePaid:s.definitivePaid};
    }
    return {total:0,overdue:0,pending:[],receivable:0,definitivePaid:0};
  }
  function intent(question){
    var q=norm(question);
    var display=/\b(grafico|graficos|visual|visualizar|desenhe|mostra|mostre|exiba|comparar|compare|evolucao|tendencia|distribuicao|categorias|categoria|analise por|analisa meus)\b/.test(q);
    if(display&&/\b(sodexo|pluxee|solides|vale alimentacao|vale-alimentacao|beneficio|beneficios)\b/.test(q))return "benefits";
    var finance=/\b(gastos?|gastei|despesas?|consumo|dinheiro|financeir\w*|divida|devo|pagar|receber|vencimento|categorias?|compar|evolucao|mes|meses|semana|contas)\b/.test(q);
    if(!display||!finance)return null;
    if(/\b(divida|dividas|pagar|pendente|vencimento|contas a vencer)\b/.test(q))return "obligations";
    if(/\b(comparar|compare|comparacao|evolucao|tendencia|ultimos meses|mes a mes|meses)\b/.test(q))return "months";
    if(/\b(saiu|pagas|paguei|gasto real|gastos reais|dinheiro que nao volta)\b/.test(q))return "outflows";
    if(/\b(categoria|categorias|onde|distribuicao|pizza|rosca)\b/.test(q))return "categories";
    return "overview";
  }
  function chart(question,store,today){
    var type=intent(question);
    if(!type)return null;
    var date=String(today||new Date().toISOString().slice(0,10));
    var q=norm(question);
    if(/\b(?:semana|hoje|ontem|ultimos 7 dias)\b/.test(q))return null;
    var month=date.slice(0,7);
    if(/\bmes (?:passado|anterior)\b/.test(q)&&["categories","outflows","benefits"].includes(type))month=monthOffset(month,-1);
    var data=[],total=0,title="",note="",mode="bars",basis="";
    if(type==="benefits"){
      if(root.AlicerceBeneficios&&typeof root.AlicerceBeneficios.wallets==="function"){
        var wallets=root.AlicerceBeneficios.wallets(store);
        var normalizedQuestion=norm(question);
        if(/\b(sodexo|pluxee)\b/.test(normalizedQuestion))wallets=wallets.filter(function(w){return w.provider==="pluxee";});
        else if(/\bsolides\b/.test(normalizedQuestion))wallets=wallets.filter(function(w){return w.provider==="solides";});
        data=wallets.map(function(w){
          var total=(w.entries||[]).filter(function(e){return e.kind==="debit"&&String(e.date||"").slice(0,7)===month;}).reduce(function(sum,e){return sum+(Number(e.amount)||0);},0);
          return {label:root.AlicerceBeneficios.providers[w.provider]||"Vale-alimentação",value:Math.round(total*100)/100};
        });
      }
      title="Compras com vale-alimentação · "+month;
      note="Compras pagas com benefício, separadas do saldo bancário e sem somá-las outra vez às despesas do caixa.";
      total=sum(data);
    }else if(type==="months"){
      var compareTwo=/\b(?:comparar|compare|comparacao)\b/.test(q)&&/\bmes (?:passado|anterior)\b/.test(q);
      var count=compareTwo?2:/\b(?:trimestre|ultimos 3 meses)\b/.test(q)?3:6;
      var cutoff=date.slice(8,10);
      var recorded=entries(store);
      data=Array.from({length:count},function(_,i){
        var key=monthOffset(month,i-count+1);
        var rows=recorded.filter(function(e){return e.data.slice(0,7)===key&&(!compareTwo||e.data.slice(8,10)<=cutoff);});
        return {label:monthLabel(key),value:sum(rows),month:key};
      });
      total=sum(data);
      title=compareTwo?"Despesas registradas · até o dia "+Number(cutoff):"Evolução das despesas registradas · "+count+" meses";
      note=compareTwo?"Os dois meses foram comparados até o mesmo dia. Parcelas entram no mês em que foram registradas.":"Parcelas entram no respectivo mês. O gráfico mostra os lançamentos registrados.";
      mode="columns";
    }else if(type==="categories"){
      data=categorize(entries(store).filter(function(e){return e.data.slice(0,7)===month;}),"categoria");
      title="Distribuição dos gastos · "+month;
      note="Despesas registradas e parcelas de cartão do mês; transferências e investimentos ficam fora.";
      total=sum(data);
    }else if(type==="outflows"){
      data=categorize(actualOutflows(store,month),"label");
      title="Dinheiro que efetivamente saiu · "+month;
      note="Apenas saídas pagas; transferências sem finalidade confirmada não são contabilizadas.";
      total=sum(data);
    }else if(type==="obligations"){
      var p=pending(store,date);
      data=[{label:"Vencidas",value:p.overdue},{label:"Demais pendências",value:Math.max(0,p.total-p.overdue)}];
      title="Compromissos ainda a pagar";
      note="Valores pendentes registrados. Não marquei nenhuma conta como paga.";
      total=p.total;
    }else{
      var s=pending(store,date);
      data=[{label:"Já saiu no mês",value:s.definitivePaid},{label:"Ainda a pagar",value:s.total},{label:"A receber",value:s.receivable}];
      title="Panorama do dinheiro";
      note="Gastos realizados, dívidas registradas e créditos são grandezas diferentes, não somadas entre si.";
      mode="overview";
    }
    return {kind:"alicia-analytic-v1",type:type,mode:mode,title:title,note:note,basis:basis,period:month,data:data.slice(0,12),total:total,empty:!data.some(function(d){return d.value>0;})};
  }
  function response(c){
    if(!c)return "";
    if(c.empty)return "Preparei a análise \""+c.title+"\", mas não há lançamentos confirmados suficientes para desenhar valores neste período. Não vou criar números de demonstração.";
    if(c.mode==="overview")return "Montei um panorama visual no chat. As colunas representam situações diferentes do seu dinheiro e não devem ser somadas como se fossem o mesmo tipo de gasto.";
    if(c.type==="benefits")return "Mostrei os gastos do mês com vale-alimentação, no total de "+money(c.total)+". Esse valor saiu dos benefícios, não do saldo bancário.";
    if(c.type==="obligations")return "Mostrei a divisão entre contas vencidas e outras pendências registradas, totalizando "+money(c.total)+".";
    if(c.type==="months")return c.data.map(function(row){return row.label+": "+money(row.value);}).join(" · ")+".";
    return "Montei o gráfico dentro da conversa. O total dos registros analisados é "+money(c.total)+".";
  }
  function renderChart(c){
    if(!c||c.kind!=="alicia-analytic-v1"||!Array.isArray(c.data))return "";
    var max=Math.max(1,...c.data.map(function(d){return finite(d.value);}));
    var html='<section class="alicia-analytic-chart" aria-label="'+esc(c.title)+'">';
    html+='<div class="alicia-chart-top"><strong>'+esc(c.title)+'</strong><small>ANÁLISE REAL</small></div>';
    if(c.empty)html+='<p class="alicia-chart-empty">Sem dados suficientes para montar este gráfico. Nenhum valor foi inventado.</p>';
    else if(c.mode==="columns"){
      html+='<div class="alicia-chart-columns" role="img" aria-label="'+esc(c.title)+'">';
      c.data.forEach(function(d,i){var percent=finite(d.value)/max*100;html+='<div class="alicia-chart-column"><span>'+esc(money(d.value))+'</span><div class="alicia-chart-column-rail"><i style="height:'+percent.toFixed(2)+'%;background:'+COLORS[i%COLORS.length]+'"></i></div><small>'+esc(d.label)+'</small></div>';});
      html+='</div>';
    }else{
      html+='<div class="alicia-chart-bars">';
      c.data.forEach(function(d,i){var pct=finite(d.value)/max*100;html+='<div class="alicia-chart-line"><div class="alicia-chart-row"><span>'+esc(d.label)+'</span><strong>'+esc(money(d.value))+'</strong></div><div class="alicia-chart-track" role="img" aria-label="'+esc(d.label)+': '+esc(money(d.value))+'"><i style="width:'+pct.toFixed(2)+'%;background:'+COLORS[i%COLORS.length]+'"></i></div></div>';});
      html+='</div>';
    }
    html+='<p class="alicia-chart-note">'+esc(c.note)+'</p></section>';
    return html;
  }
  root.AlicerceAnalitica={intent:intent,chart:chart,response:response,renderChart:renderChart};
})(typeof window!=="undefined"?window:globalThis);
