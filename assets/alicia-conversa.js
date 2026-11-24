/* Conversation state for spending queries. It contains only the subject and period. */
(function(root){
  "use strict";

  var SUBJECTS=[
    {id:"market",label:"Mercado",pattern:/^(?:mercado|supermercado|atacado|atacadao|feira|compras de casa)$/},
    {id:"snack",label:"Lanches",pattern:/^(?:lanche|lanches)$/},
    {id:"bar",label:"Bar",pattern:/^(?:bar|bares)$/},
    {id:"pharmacy",label:"Farmácia",pattern:/^(?:farmacia|remedios?|medicamentos?)$/,subcategories:["farmacia","medicamentos"]},
    {id:"restaurants",label:"Restaurantes",pattern:/^(?:restaurante|restaurantes)$/,subcategories:["restaurante"]},
    {id:"delivery",label:"Delivery",pattern:/^(?:delivery|ifood|i food)$/,subcategories:["delivery"]},
    {id:"fuel",label:"Combustível",pattern:/^(?:combustivel|gasolina)$/,subcategories:["combustivel"]},
    {id:"food",label:"Alimentação",pattern:/^(?:alimentacao|comida)$/},
    {id:"transport",label:"Transporte",pattern:/^(?:transporte|corridas)$/},
    {id:"children",label:"Filhos",pattern:/^(?:(?:meu|minha|meus|minhas) )?filh[oa]s?$/},
    {id:"partner",label:"Esposa ou marido",pattern:/^(?:(?:meu|minha) )?(?:esposa|marido|companheira|companheiro)$/},
    {id:"family",label:"Família",pattern:/^(?:familia|minha familia)$/},
    {id:"pluxee",label:"Sodexo/Pluxee",pattern:/^(?:(?:meu|o) )?(?:sodexo|pluxee)$/},
    {id:"solides",label:"Sólides",pattern:/^(?:(?:meu|o) )?solides$/},
    {id:"benefit",label:"Vale-alimentação",pattern:/^(?:vale alimentacao|beneficios?)$/}
  ];
  var PERIOD=/\b(?:(?:no |do )?mes (?:passado|anterior)|(?:no |do )?mes atual|(?:este|esse|neste|nesse) mes|(?:na |da )?semana passada|(?:esta|nesta|nessa|essa) semana|(?:nos )?ultimos (?:7|sete) dias|(?:nos )?ultimos (?:3|tres) meses|(?:no )?trimestre|anteontem|ontem|hoje)\b/;

  function normalize(value){
    return String(value||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .replace(/[^a-z0-9]+/g," ").trim()
      .replace(/^(?:alicia\s+)?(?:(?:me fala|me diz|me diga|me conta|queria saber)\s+)(?=quanto\b)/,"")
      .replace(/^alicia\s+/,"");
  }

  function canonicalPeriod(value){
    if(/mes (?:passado|anterior)/.test(value))return "mes passado";
    if(/semana passada/.test(value))return "semana passada";
    if(/semana/.test(value))return "esta semana";
    if(/(?:7|sete) dias/.test(value))return "ultimos 7 dias";
    if(/(?:3|tres) meses|trimestre/.test(value))return "ultimos 3 meses";
    return /^(?:anteontem|ontem|hoje)$/.test(value)?value:"este mes";
  }

  function extract(value){
    var match=value.match(PERIOD);
    var other=match?value.slice(0,match.index)+" "+value.slice(match.index+match[0].length):value;
    var subjectText=other.replace(/\s+/g," ").trim()
      .replace(/^(?:so|apenas)\s+/,"")
      .replace(/^(?:(?:com|no|na|em|pelo|pela|para|pra|pro|de|do|da)\s+)+/,"");
    var subject=SUBJECTS.find(function(entry){return entry.pattern.test(subjectText);});
    return {period:match?canonicalPeriod(match[0]):"",subject:subject,hasText:!!subjectText};
  }

  function benefitSubject(subject){
    return subject==="pluxee"||subject==="solides"||subject==="benefit";
  }

  function spendingQuery(q){
    var direct=q.match(/^quanto\s+(?:eu\s+)?(?:gastei|paguei|dei|mandei|deixei|saiu|foi gasto)\b\s*(.*)$/);
    if(!direct)return null;
    var parts=extract(direct[1]);
    if(parts.hasText&&!parts.subject)return null;
    if(/^quanto (?:eu )?(?:paguei|dei|mandei)\b/.test(q)&&!parts.subject)return null;
    return {kind:"spending",subject:parts.subject?parts.subject.id:"total",period:parts.period||"este mes"};
  }

  function turn(input,state){
    var q=normalize(input);
    var base=state&&state.current;
    if(/^(?:e )?(?:compare|compara|comparar) (?:os dois|esses dois|os periodos)$/.test(q)){
      var previous=state&&state.previous;
      if(base&&previous&&base.kind==="spending"&&previous.kind==="spending"&&base.subject===previous.subject&&(base.marketOnly===true)===(previous.marketOnly===true)&&base.period!==previous.period)
        return {compare:[previous,base]};
      return {prompt:"Quais períodos você quer comparar? Por exemplo, pergunte quanto gastou neste mês e depois diga “E no mês passado?”."};
    }

    var direct=spendingQuery(q);
    if(direct)return {query:direct};
    var isFollowUp=/^e(?:\s|$)/.test(q);
    var suffix=q.replace(/^e\s+/,"");
    var parts=extract(suffix);
    if(!(isFollowUp||parts.period&&!parts.hasText))return null;
    if(parts.hasText&&!parts.subject)return null;
    if(!base)return {prompt:"Qual gasto você quer consultar? Pode dizer, por exemplo, “Quanto gastei no mercado este mês?”."};
    if(base.kind==="market"){
      if(parts.period&&!parts.subject)return {query:{kind:"market",question:base.question,period:parts.period}};
      if(!parts.subject)return null;
    }
    var subject=parts.subject?parts.subject.id:base.subject;
    var marketOnly=parts.subject?benefitSubject(subject)&&(base.kind==="market"||base.subject==="market")&&/^(?:so|apenas)\b/.test(suffix):base.marketOnly===true;
    return {query:{kind:"spending",subject:subject,period:parts.period||base.period,marketOnly:marketOnly}};
  }

  function remember(state,query){
    if(!state||!state.current)return {current:query,previous:null};
    var current=state.current;
    if(current.kind===query.kind&&current.subject===query.subject&&current.period===query.period&&current.question===query.question&&(current.marketOnly===true)===(query.marketOnly===true))return state;
    return {current:query,previous:current};
  }

  function marketQuery(input){
    var q=normalize(input);
    var match=q.match(PERIOD);
    var without=match?q.replace(PERIOD," ").replace(/\s+/g," ").trim():q;
    return {kind:"market",question:without,period:match?canonicalPeriod(match[0]):"este mes"};
  }

  function spending(query,range,rows,wallets){
    var subject=query.subject;
    var descriptor=SUBJECTS.find(function(entry){return entry.id===subject;});
    var label=descriptor?descriptor.label:"Despesas registradas";
    var inside=function(value){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&value>=range.start&&value<=range.end;};
    var market=/\b(?:mercado|supermercado|atacado|atacadao|feira|hortifruti)\b/;
    if(benefitSubject(subject)){
      var eligible=wallets.filter(function(wallet){return subject==="benefit"||wallet.provider===subject;});
      var entries=eligible.flatMap(function(wallet){return wallet.entries||[];}).filter(function(entry){
        return entry&&entry.kind==="debit"&&inside(String(entry.date||""))
          &&(!query.marketOnly||market.test(normalize([entry.subcategory,entry.merchant,entry.description].join(" "))));
      });
      return {label:query.marketOnly?"Mercado com "+label:label,total:sum(entries,"amount"),count:entries.length,missingWallet:!eligible.length};
    }
    var selected=rows.filter(function(row){
      if(!row||!inside(String(row.dataCompra||row.data||"")))return false;
      var category=row.categoria;
      var sub=row.subcategoria;
      if(subject==="total")return true;
      if(descriptor&&descriptor.subcategories)return descriptor.subcategories.includes(sub);
      if(subject==="market")return market.test(normalize([sub,row.local,row.descricao].join(" ")));
      if(subject==="snack")return category==="comida"&&sub==="lanchonete";
      if(subject==="bar")return category==="comida"&&sub==="bar";
      if(subject==="food")return category==="comida";
      if(subject==="transport")return category==="transporte";
      return category==="familia"&&(subject==="family"||sub===(subject==="children"?"filhos":"esposa_marido"));
    });
    return {label:label,total:sum(selected,"valor"),count:selected.length};
  }

  function sum(records,key){
    return Math.round(records.reduce(function(total,row){
      var amount=Number(row[key]);
      return total+(Number.isFinite(amount)&&amount>0?amount:0);
    },0)*100)/100;
  }
  root.AlicerceConversa={turn:turn,remember:remember,marketQuery:marketQuery,spending:spending};
})(typeof window!=="undefined"?window:globalThis);
