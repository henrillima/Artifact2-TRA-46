(function(){
'use strict';
var D;
try{ D=JSON.parse(document.getElementById('dados').textContent); }
catch(e){ document.getElementById('erro').innerHTML='<div class="err">Não foi possível ler os dados do painel.</div>'; return; }

/* ============ utilidades ============ */
var $=function(s){return document.querySelector(s)};
var MA=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
var ML=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
var MESES=D.meses,YEARS=D.meta.anos.slice(),LY=D.meta.ultimo_completo,PY=D.meta.parcial,BASE=D.meta.base,Y0=YEARS[0];
var N=MESES.length, F=D.fator, NAC=D.nac, A=D.anual;
function im(ym){return MESES.indexOf(ym)}
function yOf(i){return +MESES[i].slice(0,4)}
function mOf(i){return +MESES[i].slice(5,7)-1}
function yl(y){return y===PY?y+'*':String(y)}
function pad(m){return (m<10?'0':'')+m}
var nf0=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:0});
var nfd=function(d){return new Intl.NumberFormat('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d})};
function fix(s){return String(s).replace(/-/g,'\u2212')}
function brl(x){return 'R$\u00a0'+nf0.format(Math.round(x))}
function pc(x,d){d=d==null?1:d;return fix(nfd(d).format(x*100))+'%'}
function pcs(x,d){return (x>0?'+':'')+pc(x,d)}
function mi(x){return nfd(1).format(x/1e6)+' mi'}
function mil(x){return x>=1e6?mi(x):nf0.format(Math.round(x/1000))+' mil'}
function lab(i){var m=mOf(i);return MA[m].charAt(0).toUpperCase()+MA[m].slice(1)+'/'+yOf(i)}
function realS(a){return a.map(function(v,i){return v==null?null:v*F[i]})}
function wma(vals,w,k){return vals.map(function(_,i){if(i<k-1)return null;var s=0,t=0;for(var j=i-k+1;j<=i;j++){if(vals[j]==null||!w[j])continue;s+=vals[j]*w[j];t+=w[j]}return t?s/t:null})}
function noAcc(s){return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}
function divColor(idx,span){span=span||.25;var t=Math.max(-1,Math.min(1,(idx-1)/span));var a=(Math.abs(t)*.62).toFixed(3);return t<0?'rgba(43,119,189,'+a+')':'rgba(218,83,26,'+a+')'}
function niceTicks(lo,hi,n){
  if(hi<=lo){hi=lo+1}
  var raw=(hi-lo)/n,p=Math.pow(10,Math.floor(Math.log10(raw)));
  var s=[1,2,2.5,5,10].map(function(x){return x*p}).filter(function(x){return x>=raw})[0];
  var a=Math.floor(lo/s+1e-9)*s,b=Math.ceil(hi/s-1e-9)*s,t=[];
  for(var v=a;v<=b+s/2;v+=s)t.push(Math.round(v*1e6)/1e6);
  return t;
}
function pathOf(vals,X,Y){var d='',pen=false;vals.forEach(function(v,i){if(v==null){pen=false;return}d+=(pen?'L':'M')+X(i).toFixed(1)+' '+Y(v).toFixed(1);pen=true});return d}
function bandPath(lo,hi,X,Y){
  var d='',i=0;
  while(i<lo.length){
    if(lo[i]==null||hi[i]==null){i++;continue}
    var j=i;while(j<lo.length&&lo[j]!=null&&hi[j]!=null)j++;
    var up=[],dn=[];
    for(var k=i;k<j;k++){up.push(X(k).toFixed(1)+' '+Y(hi[k]).toFixed(1));dn.push(X(k).toFixed(1)+' '+Y(lo[k]).toFixed(1))}
    d+='M'+up.join('L')+'L'+dn.reverse().join('L')+'Z';i=j;
  }
  return d;
}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}

/* tooltip */
var tip=$('#tip');
function showTip(html,cx,cy){
  tip.innerHTML=html;tip.style.opacity=1;
  var r=tip.getBoundingClientRect(),x=cx+16,y=cy+16;
  if(x+r.width>innerWidth-8)x=cx-r.width-16;
  if(y+r.height>innerHeight-8)y=cy-r.height-16;
  tip.style.left=Math.max(8,x)+'px';tip.style.top=Math.max(8,y)+'px';
}
function hideTip(){tip.style.opacity=0}
function trow(color,label,val){return '<div class="r"><span>'+(color?'<i style="background:'+color+'"></i>':'')+label+'</span><span>'+val+'</span></div>'}

/* ============ gráfico de séries mensais ============ */
function timeChart(host,cfg){
  var W=Math.max(300,host.clientWidth),mob=W<560,bars=cfg.bars||null;
  var ih=cfg.h||(mob?240:320),BH=bars?(mob?54:70):0,GAP=bars?(mob?24:28):0;
  var m={l:mob?46:58,r:mob?10:16,t:14,b:30};
  var iw=W-m.l-m.r,H=m.t+ih+GAP+BH+m.b;
  var vis=cfg.series.filter(function(s){return !s.hidden});
  var lo=Infinity,hi=-Infinity;
  function cons(v){if(v!=null&&isFinite(v)){if(v<lo)lo=v;if(v>hi)hi=v}}
  vis.forEach(function(s){s.vals.forEach(cons)});
  if(cfg.band&&!cfg.band.hidden){cfg.band.lo.forEach(cons);cfg.band.hi.forEach(cons)}
  if(!isFinite(lo)){lo=0;hi=1}
  if(cfg.yZero)lo=0;
  var T=niceTicks(lo,hi,mob?4:5),y0=T[0],y1=T[T.length-1];
  var X=function(i){return m.l+iw*(i+.5)/N},Y=function(v){return m.t+ih*(1-(v-y0)/(y1-y0))};
  var s='<svg viewBox="0 0 '+W+' '+H+'" width="'+W+'" height="'+H+'" aria-hidden="true">';
  s+='<g class="ax">';
  T.forEach(function(t,k){s+='<line class="gl'+(k===0?' base':'')+'" x1="'+m.l+'" x2="'+(W-m.r)+'" y1="'+Y(t).toFixed(1)+'" y2="'+Y(t).toFixed(1)+'"/><text x="'+(m.l-8)+'" y="'+(Y(t)+4).toFixed(1)+'" text-anchor="end">'+(cfg.yFmt?cfg.yFmt(t):nf0.format(t))+'</text>'});
  var ystep=(iw/YEARS.length<40)?2:1;
  YEARS.forEach(function(y,q){var a=im(y+'-01');if(a<0)a=0;var b=(q<YEARS.length-1)?im((y+1)+'-01'):N;
    var xx=m.l+iw*a/N;s+='<line class="gl" x1="'+xx.toFixed(1)+'" x2="'+xx.toFixed(1)+'" y1="'+m.t+'" y2="'+(m.t+ih+(bars?GAP+BH:0))+'" style="opacity:.5"/>';
    if(q%ystep===0)s+='<text x="'+(m.l+iw*(a+b)/2/N).toFixed(1)+'" y="'+(H-8)+'" text-anchor="middle">'+(ystep>1?"'"+String(y).slice(2):y)+'</text>'});
  s+='</g>';
  if(cfg.band&&!cfg.band.hidden)s+='<path d="'+bandPath(cfg.band.lo,cfg.band.hi,X,Y)+'" style="fill:var(--sig);opacity:.17"/>';
  vis.forEach(function(sr){s+='<path d="'+pathOf(sr.vals,X,Y)+'" fill="none" style="stroke:'+sr.color+'" stroke-width="'+(sr.width||2.5)+'" stroke-linejoin="round" stroke-linecap="round"'+(sr.dash?' stroke-dasharray="'+sr.dash+'"':'')+'/>'});
  /* barras */
  var bTop=m.t+ih+GAP,bMax=0;
  if(bars){
    bars.vals.forEach(function(v){if(v>bMax)bMax=v});
    var bt=niceTicks(0,bMax,2),bm=bt[bt.length-1],bw=Math.max(1.5,iw/N*.68);
    s+='<g class="ax"><line class="gl base" x1="'+m.l+'" x2="'+(W-m.r)+'" y1="'+(bTop+BH)+'" y2="'+(bTop+BH)+'"/>';
    s+='<text x="'+(m.l-8)+'" y="'+(bTop+10)+'" text-anchor="end">'+bars.fmt(bm)+'</text><text x="'+(m.l-8)+'" y="'+(bTop+BH+4)+'" text-anchor="end">0</text>';
    s+='<text class="ytitle" x="'+m.l+'" y="'+(bTop-9)+'">'+esc(bars.label)+'</text></g>';
    bars.vals.forEach(function(v,i){if(!v)return;var h=BH*v/bm;s+='<rect x="'+(X(i)-bw/2).toFixed(1)+'" y="'+(bTop+BH-h).toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+h.toFixed(1)+'" rx="1.5" style="fill:'+(bars.color||'var(--nom)')+';opacity:.75"/>'});
  }
  /* anotações */
  if(cfg.notes&&!mob||cfg.notes&&cfg.notesMobile){
    cfg.notes.forEach(function(n){
      var sr=vis[vis.length-1],v=sr.vals[n.i];if(v==null)return;
      var px=X(n.i),py=Y(v),lx=px+n.dx,ly=py+n.dy,lines=n.text.split('\n');
      s+='<line class="note-l" x1="'+px.toFixed(1)+'" y1="'+py.toFixed(1)+'" x2="'+lx.toFixed(1)+'" y2="'+(ly+(n.dy<0?3:-10)).toFixed(1)+'"/><circle class="pt" cx="'+px.toFixed(1)+'" cy="'+py.toFixed(1)+'" r="4.5"/>';
      s+='<text class="note-t" x="'+lx.toFixed(1)+'" y="'+ly.toFixed(1)+'" text-anchor="'+(n.anchor||'middle')+'">'+lines.map(function(t,k){return '<tspan x="'+lx.toFixed(1)+'" dy="'+(k?15:0)+'">'+esc(t)+'</tspan>'}).join('')+'</text>';
    });
  }
  /* cursor */
  s+='<line class="xh" id="xh_'+host.id+'" y1="'+m.t+'" y2="'+(m.t+ih+(bars?GAP+BH:0))+'" x1="0" x2="0" style="display:none"/>';
  vis.forEach(function(sr,k){s+='<circle class="dot" id="dt_'+host.id+'_'+k+'" r="5" style="fill:'+sr.color+';display:none"/>'});
  s+='<rect id="ov_'+host.id+'" x="'+m.l+'" y="'+m.t+'" width="'+iw+'" height="'+(H-m.t-m.b+2)+'" fill="transparent" style="cursor:crosshair"/></svg>';
  host.innerHTML=s;
  var svg=host.querySelector('svg'),ov=host.querySelector('#ov_'+host.id),xh=host.querySelector('#xh_'+host.id);
  function move(e){
    var r=svg.getBoundingClientRect(),px=(e.clientX-r.left)*(W/r.width);
    var i=Math.max(0,Math.min(N-1,Math.round((px-m.l)/iw*N-.5)));
    xh.setAttribute('x1',X(i));xh.setAttribute('x2',X(i));xh.style.display='';
    vis.forEach(function(sr,k){var d=host.querySelector('#dt_'+host.id+'_'+k),v=sr.vals[i];if(v==null){d.style.display='none'}else{d.setAttribute('cx',X(i));d.setAttribute('cy',Y(v));d.style.display=''}});
    showTip(cfg.tip(i),e.clientX,e.clientY);
  }
  function leave(){xh.style.display='none';vis.forEach(function(_,k){host.querySelector('#dt_'+host.id+'_'+k).style.display='none'});hideTip()}
  ov.addEventListener('pointermove',move);ov.addEventListener('pointerdown',move);ov.addEventListener('pointerleave',leave);
}

/* ============ estado e desenho: panorama ============ */
var S={hero:{metric:'media',smooth:false,nom:true,band:true},route:{id:D.rotas[0].id,id2:'',smooth:false,sort:'seats',dir:-1,q:''},
  dist:{years:[Y0,2022,LY]},season:'rec',emp:{year:LY,smooth:true,metric:'tarifa'},aero:{year:LY,id:(D.aero.some(function(a){return a.icao==='SBPA'})?'SBPA':D.aero[0].icao),smooth:false},cs:'pandemia'};

function heroDraw(){
  var st=S.hero,host=$('#heroChart'),key=st.metric,base=NAC[key],nameM=key==='media'?'Média':'Mediana';
  var rl=realS(base),nm=base.slice(),p25=realS(NAC.p25),p75=realS(NAC.p75);
  if(st.smooth){rl=wma(rl,NAC.a,12);nm=wma(nm,NAC.a,12);p25=wma(p25,NAC.a,12);p75=wma(p75,NAC.a,12)}
  var series=[{label:'Real',color:'var(--nom)',vals:nm,dash:'6 5',width:2,hidden:!st.nom},{label:'Real',color:'var(--sig)',vals:rl,width:3.2}];
  /* anotações (só sem suavização) */
  var notes=null;
  if(!st.smooth){
    var imax=0;rl.forEach(function(v,i){if(v>rl[imax])imax=i});
    var iA=im('2020-04'),iJ=im('2020-01'),iM=im('2022-03'),iF=im('2022-02'),iN=im('2025-11'),iO=im('2025-10');
    var ch=rl[iM]/rl[iF]-1;
    notes=[
      {i:iA,text:'Abr/2020: assentos vendidos\ncaem '+pc(1-NAC.a[iA]/NAC.a[iJ],0)+' vs. jan.',dx:-22,dy:58,anchor:'end'},
      {i:iM,text:'Mar/2022: '+pcs(ch,0)+' em um mês',dx:-30,dy:-58,anchor:'end'},
      {i:imax,text:'Máximo real: '+lab(imax)+',\n'+brl(rl[imax]),dx:-16,dy:-46,anchor:'end'},
      {i:iN,text:'Nov/2025: assentos '+pcs(NAC.a[iN]/NAC.a[iO]-1,0)+'\nvs. out., tarifa '+pcs(base[iN]/base[iO]-1,0),dx:-14,dy:70,anchor:'end'}
    ];
    if(imax===iN||Math.abs(imax-iM)<3)notes.splice(2,1);
  }
  timeChart(host,{series:series,band:{lo:p25,hi:p75,hidden:!st.band},h:null,notes:notes,yFmt:function(v){return 'R$\u00a0'+nf0.format(v)},
    bars:{vals:NAC.a,label:'Assentos vendidos por mês (milhões)',fmt:function(v){return nfd(v%1e6?1:0).format(v/1e6)},color:'var(--nom)'},
    tip:function(i){
      var t='<b>'+lab(i)+(st.smooth?' (12 meses)':'')+'</b>';
      t+=trow('var(--sig)',nameM+' real',brl(rl[i]==null?0:rl[i]));
      if(nm[i]!=null)t+=trow('','Nominal',brl(nm[i]));
      if(p25[i]!=null)t+=trow('','P25 a P75 (real)',brl(p25[i])+' a '+brl(p75[i]));
      t+=trow('','Assentos no mês',mil(NAC.a[i]));
      return t;
    }});
}
function heroLegend(){
  var st=S.hero,h='<span class="lg"><i class="sw"></i>Valores reais (R$ de '+BASE+')</span>';
  h+='<button type="button" class="lg" data-k="nom" aria-pressed="'+st.nom+'"><i class="sw dash"></i>Valores nominais (R$ da época)</button>';
  h+='<button type="button" class="lg" data-k="band" aria-pressed="'+st.band+'"><i class="sw band"></i>Metade central dos assentos (P25 a P75, real)</button>';
  var el=$('#heroLegend');el.innerHTML=h;
  el.querySelectorAll('button').forEach(function(b){b.onclick=function(){S.hero[b.dataset.k]=!S.hero[b.dataset.k];heroLegend();heroDraw()}});
}
function ytd(y,ref){
  var R=realS(NAC.media),s1=0,w1=0,s0=0,w0=0,n=0;
  for(var m=1;m<=12;m++){var i=im(y+'-'+pad(m)),j=im(ref+'-'+pad(m));if(i<0||j<0)continue;n++;s1+=R[i]*NAC.a[i];w1+=NAC.a[i];s0+=R[j]*NAC.a[j];w0+=NAC.a[j]}
  return {n:n,v:w1?s1/w1:null,ref:w0?s0/w0:null,a:w1,aref:w0};
}
function heroText(){
  var a22=A[2022],aL=A[LY],a20=A[2020],a19=A[2019],a0=A[Y0],dec=true;
  for(var y=2023;y<=LY;y++){if(A[y].media_real>=A[y-1].media_real)dec=false}
  $('#h1').textContent=dec?'Em valores reais, a tarifa média caiu a cada ano desde 2022':'Em valores reais, a tarifa média está abaixo do pico de 2022';
  $('#lead1').innerHTML='Corrigida pelo IPCA, a tarifa média anual foi de <b>'+brl(a22.media_real)+'</b> em 2022 para <b>'+brl(aL.media_real)+'</b> em '+LY+' ('+pcs(aL.media_real/a22.media_real-1)+'). No mesmo período, os assentos vendidos por ano cresceram <b>'+pc(aL.assentos/a22.assentos-1,0)+'</b>, de '+mi(a22.assentos)+' para '+mi(aL.assentos)+'.';
  $('#lead2').innerHTML='Na série inteira, desde '+Y0+': a média real era <b>'+brl(a0.media_real)+'</b> em '+Y0+' e <b>'+brl(a19.media_real)+'</b> em 2019, antes da pandemia; em '+LY+' está '+pcs(aL.media_real/a19.media_real-1,0)+' sobre 2019 e '+pcs(aL.media_real/a20.media_real-1,0)+' sobre 2020. Nos valores da época a tarifa parece parada desde 2022 ('+brl(a22.media_nom)+' em 2022, '+brl(aL.media_nom)+' em '+LY+'), porque a inflação esconde a queda.';
  var t='Tarifa por mês de venda, ponderada pelos assentos. Passe o mouse (ou toque) no gráfico para ver cada mês.';
  if(PY){var q=ytd(PY,LY);if(q.v)t+=' Em '+PY+' (até '+ML[q.n-1]+'), a média real é '+brl(q.v)+', '+pcs(q.v/q.ref-1,1)+' sobre os mesmos meses de '+LY+'.'}
  $('#heroNote').textContent=t;
}

/* ============ sazonalidade ============ */
function seasonWin(){
  var w=S.season,y0=w==='pre'?Y0:LY-3,y1=w==='pre'?2019:LY;return {y0:y0,y1:y1,lab:y0+' a '+y1};
}
function seasonChips(){
  var el=$('#seasonWin'),opts=[['rec','Recente ('+(LY-3)+'–'+LY+')'],['pre','Antes da pandemia ('+Y0+'–2019)']];
  el.innerHTML=opts.map(function(o){return '<button type="button" class="chip" data-v="'+o[0]+'" aria-pressed="'+(S.season===o[0])+'">'+o[1]+'</button>'}).join('');
  el.querySelectorAll('button').forEach(function(b){b.onclick=function(){S.season=b.dataset.v;seasonChips();seasonDraw()}});
}
function seasonDraw(){
  var R=realS(NAC.media),idx={},heat=$('#heat');
  var h='<div class="hh"></div>'+MA.map(function(m){return '<div class="hh">'+m+'</div>'}).join('');
  YEARS.forEach(function(y){
    h+='<div class="hy">'+yl(y)+'<small>'+brl(A[y].media_real)+'</small></div>';
    for(var m=0;m<12;m++){var i=im(y+'-'+pad(m+1));
      if(i<0){h+='<div class="hc"></div>';continue}
      var ix=R[i]/A[y].media_real;idx[y*12+m]=ix;
      h+='<div class="hc" style="background:'+divColor(ix)+'" title="'+lab(i)+': '+brl(R[i])+' ('+pcs(ix-1,0)+' vs. média do ano)">'+nf0.format(Math.round(R[i]))+'</div>'}
  });
  heat.innerHTML=h;
  var W_=seasonWin(),avg=[];for(var m=0;m<12;m++){var t=0,c=0;for(var y=W_.y0;y<=W_.y1;y++){var v=idx[y*12+m];if(v!=null){t+=v;c++}}avg[m]=t/c-1}
  var ord=avg.map(function(v,m){return {m:m,v:v}}).sort(function(a,b){return b.v-a.v});
  var top=ord.slice(0,2),bot=ord.slice(-2).reverse();
  $('#seasonH').textContent='Padrão típico, '+W_.lab;
  $('#seasonLead').innerHTML='Entre '+W_.y0+' e '+W_.y1+', os meses mais caros para comprar foram <b>'+ML[top[0].m]+' ('+pcs(top[0].v,0)+')</b> e <b>'+ML[top[1].m]+' ('+pcs(top[1].v,0)+')</b>; os mais baratos, <b>'+ML[bot[0].m]+' ('+pcs(bot[0].v,0)+')</b> e <b>'+ML[bot[1].m]+' ('+pcs(bot[1].v,0)+')</b>.';
  /* barras divergentes */
  var host=$('#seasonChart'),W=Math.max(280,host.clientWidth),Hh=230,mob=W<480,ml=6,mr=6,cy=Hh/2-6,iw=W-ml-mr,bw=iw/12,mx=Math.max.apply(null,avg.map(Math.abs)),sc=(Hh/2-40)/mx;
  var s='<svg viewBox="0 0 '+W+' '+Hh+'" width="'+W+'" height="'+Hh+'" aria-hidden="true"><g class="ax"><line class="gl base" x1="'+ml+'" x2="'+(W-mr)+'" y1="'+cy+'" y2="'+cy+'"/>';
  avg.forEach(function(v,m){
    var x=ml+bw*m+bw*.16,w=bw*.68,h=Math.abs(v)*sc,up=v>0,y=up?cy-h:cy;
    s+='<rect x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+w.toFixed(1)+'" height="'+h.toFixed(1)+'" rx="3" style="fill:'+(up?'var(--warn)':'var(--cool)')+'"><title>'+ML[m]+': '+pcs(v,1)+'</title></rect>';
    s+='<text x="'+(x+w/2).toFixed(1)+'" y="'+(up?y-5:y+h+13).toFixed(1)+'" text-anchor="middle" style="font-weight:600;fill:var(--ink);font-size:'+(mob?10:11.5)+'px">'+pcs(v,0)+'</text>';
    s+='<text x="'+(x+w/2).toFixed(1)+'" y="'+(Hh-6)+'" text-anchor="middle">'+MA[m]+'</text>';
  });
  host.innerHTML=s+'</g></svg>';
}

/* ============ faixas de preço ============ */
var BL=['até 300','300 a 500','500 a 800','800 a 1.200','1.200 a 2.000','acima de 2.000'];
function bandsDraw(){
  $('#bandsLegend').innerHTML=BL.map(function(t,k){return '<span class="lg"><i class="sw box k'+(k+1)+'"></i>R$\u00a0'+t+'</span>'}).join('');
  $('#bands').innerHTML=YEARS.map(function(y){var b=A[y].bandas;
    return '<div class="brow"><div class="by">'+yl(y)+'</div><div class="bbar">'+b.map(function(v,k){return '<div class="bseg k'+(k+1)+'" style="flex:'+(v*100).toFixed(2)+' 1 0" title="'+y+', R$ '+BL[k]+': '+pc(v)+'">'+(v>=.055?pc(v,0):'')+'</div>'}).join('')+'</div></div>'}).join('');
  var b0=A[Y0].bandas[0],b19=A[2019].bandas[0],b20=A[2020].bandas[0],b22=A[2022].bandas[0],bL=A[LY].bandas[0];
  $('#bandsH').textContent=(b19>bL&&b22<bL)?'Faixas de preço: menos passagens baratas que antes da pandemia, mais que no pico de 2022':'Faixas de preço: como os assentos se distribuem por preço';
  $('#bandsLead').innerHTML='Os assentos vendidos abaixo de R$\u00a0300 (em valores reais) eram <b>'+pc(b0,0)+'</b> em '+Y0+', <b>'+pc(b19,0)+'</b> em 2019 e <b>'+pc(b20,0)+'</b> em 2020; caíram para <b>'+pc(b22,0)+'</b> em 2022 e estavam em <b>'+pc(bL,0)+'</b> em '+LY+'. No topo, as passagens acima de R$\u00a01.200 passaram de '+pc(A[Y0].bandas[4]+A[Y0].bandas[5],0)+' em '+Y0+' para '+pc(A[LY].bandas[4]+A[LY].bandas[5],0)+' em '+LY+'.';
}
var YC={2015:'#475569',2016:'#64748B',2017:'#A16207',2018:'#2563EB',2019:'#0F766E',2020:'#94A3B8',2021:'#5E9BD5',2022:'#DA531A',2023:'#D19A22',2024:'#8C6FC7',2025:'#0A9AA8',2026:'#16A34A'};
function distChips(){
  var el=$('#distChips');
  el.innerHTML=YEARS.map(function(y){var on=S.dist.years.indexOf(y)>-1;return '<button type="button" class="chip" data-y="'+y+'" aria-pressed="'+on+'"><i style="background:'+YC[y]+'"></i>'+yl(y)+'</button>'}).join('');
  el.querySelectorAll('button').forEach(function(b){b.onclick=function(){var y=+b.dataset.y,a=S.dist.years,k=a.indexOf(y);if(k>-1){if(a.length>1)a.splice(k,1)}else a.push(y);a.sort();distChips();distDraw()}});
}
function distDraw(){
  var host=$('#distChart'),W=Math.max(280,host.clientWidth),mob=W<520,Hh=mob?230:280,m={l:44,r:10,t:12,b:34},iw=W-m.l-m.r,ih=Hh-m.t-m.b,K=26;
  var ys=S.dist.years,mx=0;ys.forEach(function(y){for(var k=0;k<K;k++)mx=Math.max(mx,A[y].hist[k])});
  var T=niceTicks(0,mx,4),top=T[T.length-1];
  var X=function(k){return m.l+iw*(k+.5)/K},Y=function(v){return m.t+ih*(1-v/top)};
  var s='<svg viewBox="0 0 '+W+' '+Hh+'" width="'+W+'" height="'+Hh+'" aria-hidden="true"><g class="ax">';
  T.forEach(function(t,k){s+='<line class="gl'+(k?'':' base')+'" x1="'+m.l+'" x2="'+(W-m.r)+'" y1="'+Y(t)+'" y2="'+Y(t)+'"/><text x="'+(m.l-7)+'" y="'+(Y(t)+4)+'" text-anchor="end">'+pc(t,0)+'</text>'});
  [0,5,10,15,20,25].forEach(function(k){var x=m.l+iw*k/K;s+='<text x="'+x.toFixed(1)+'" y="'+(Hh-12)+'" text-anchor="middle">'+(k?nf0.format(k*100):'0')+'</text>'});
  s+='<text class="ytitle" x="'+(m.l+iw/2)+'" y="'+(Hh)+'" text-anchor="middle" style="font-size:11px">R$ de '+BASE+', faixas de R$ 100</text></g>';
  ys.forEach(function(y){var v=A[y].hist.slice(0,K);s+='<path d="'+pathOf(v,X,Y)+'" fill="none" stroke="'+YC[y]+'" stroke-width="'+(y===LY||y===2022?3:2.2)+'" stroke-linejoin="round"/>'});
  s+='<line class="xh" id="dxh" y1="'+m.t+'" y2="'+(m.t+ih)+'" style="display:none"/><rect id="dov" x="'+m.l+'" y="'+m.t+'" width="'+iw+'" height="'+ih+'" fill="transparent" style="cursor:crosshair"/></svg>';
  host.innerHTML=s;
  var svg=host.querySelector('svg'),ov=host.querySelector('#dov'),xh=host.querySelector('#dxh');
  function mv(e){var r=svg.getBoundingClientRect(),px=(e.clientX-r.left)*(W/r.width),k=Math.max(0,Math.min(K-1,Math.floor((px-m.l)/iw*K)));
    xh.setAttribute('x1',X(k));xh.setAttribute('x2',X(k));xh.style.display='';
    var t='<b>R$\u00a0'+nf0.format(k*100)+' a '+nf0.format(k*100+100)+'</b>';ys.forEach(function(y){t+=trow(YC[y],yl(y),pc(A[y].hist[k]))});showTip(t,e.clientX,e.clientY)}
  ov.addEventListener('pointermove',mv);ov.addEventListener('pointerdown',mv);ov.addEventListener('pointerleave',function(){xh.style.display='none';hideTip()});
  /* tabela */
  var tb='<thead><tr><th>Ano</th><th>Média</th><th>Mediana</th><th>P90</th></tr></thead><tbody>';
  ys.forEach(function(y){tb+='<tr><td>'+yl(y)+'</td><td>'+brl(A[y].media_real)+'</td><td>'+brl(A[y].mediana_real)+'</td><td>'+brl(A[y].p90)+'</td></tr>'});
  $('#distTable').innerHTML=tb+'</tbody>';
  var tail=0;YEARS.forEach(function(y){var t=0;for(var k=K;k<A[y].hist.length;k++)t+=A[y].hist[k];tail=Math.max(tail,t)});
  $('#distNote').textContent='P90: 90% dos assentos foram vendidos abaixo desse valor. A curva foi cortada em R$ 2.600; a cauda acima disso soma no máximo '+pc(tail,1)+' dos assentos em qualquer ano.';
}

/* ============ companhias ============ */
var EMP=[{k:'TAM',n:'LATAM',c:'var(--tam)'},{k:'GLO',n:'Gol',c:'var(--glo)'},{k:'AZU',n:'Azul',c:'var(--azu)'},{k:'ONE',n:'Avianca',c:'var(--one)'},{k:'OUT',n:'Outras',c:'var(--out)'}];
function shareDraw(){
  var host=$('#shareChart'),W=Math.max(300,host.clientWidth),mob=W<520,Hh=mob?250:310,m={l:38,r:mob?64:80,t:10,b:28},iw=W-m.l-m.r,ih=Hh-m.t-m.b;
  var X=function(i){return m.l+iw*i/(N-1)},Y=function(v){return m.t+ih*(1-v)};
  var sh={};EMP.forEach(function(e){sh[e.k]=D.emp[e.k].a.map(function(v,i){return v/NAC.a[i]})});
  var order=['TAM','AZU','GLO','ONE','OUT'],cum=[],base=new Array(N).fill(0),s='<svg viewBox="0 0 '+W+' '+Hh+'" width="'+W+'" height="'+Hh+'" aria-hidden="true"><g class="ax">';
  [0,.25,.5,.75,1].forEach(function(t){s+='<line class="gl'+(t?'':' base')+'" x1="'+m.l+'" x2="'+(W-m.r)+'" y1="'+Y(t)+'" y2="'+Y(t)+'"/><text x="'+(m.l-7)+'" y="'+(Y(t)+4)+'" text-anchor="end">'+pc(t,0)+'</text>'});
  var ys2=(iw/YEARS.length<40)?2:1;YEARS.forEach(function(y,q){if(q%ys2)return;var a=Math.max(0,im(y+'-01')),b=(q<YEARS.length-1)?im((y+1)+'-01'):N;s+='<text x="'+(m.l+iw*((a+b)/2-.5)/(N-1)).toFixed(1)+'" y="'+(Hh-8)+'" text-anchor="middle">'+(ys2>1?"'"+String(y).slice(2):y)+'</text>'});
  s+='</g>';
  var col={TAM:'var(--tam)',AZU:'var(--azu)',GLO:'var(--glo)',ONE:'var(--one)',OUT:'var(--out)'},lbl='';
  order.forEach(function(k){
    var top=base.map(function(b,i){return b+sh[k][i]}),up=[],dn=[];
    for(var i=0;i<N;i++){up.push(X(i).toFixed(1)+' '+Y(top[i]).toFixed(1));dn.push(X(i).toFixed(1)+' '+Y(base[i]).toFixed(1))}
    s+='<path d="M'+up.join('L')+'L'+dn.reverse().join('L')+'Z" style="fill:'+col[k]+';opacity:.9"/>';
    var mid=(top[N-1]+base[N-1])/2,nm=EMP.filter(function(e){return e.k===k})[0].n;
    if(sh[k][N-1]>.03)lbl+='<text x="'+(W-m.r+7)+'" y="'+(Y(mid)+4).toFixed(1)+'" style="font:600 12.5px var(--f-body);fill:var(--ink)">'+nm+' '+pc(sh[k][N-1],0)+'</text>';
    base=top;
  });
  s+=lbl+'<line class="xh" id="sxh" y1="'+m.t+'" y2="'+(m.t+ih)+'" style="display:none;stroke:#fff;opacity:.9"/><rect id="sov" x="'+m.l+'" y="'+m.t+'" width="'+iw+'" height="'+ih+'" fill="transparent" style="cursor:crosshair"/></svg>';
  host.innerHTML=s;
  var svg=host.querySelector('svg'),ov=host.querySelector('#sov'),xh=host.querySelector('#sxh');
  function mv(e){var r=svg.getBoundingClientRect(),px=(e.clientX-r.left)*(W/r.width),i=Math.max(0,Math.min(N-1,Math.round((px-m.l)/iw*(N-1))));
    xh.setAttribute('x1',X(i));xh.setAttribute('x2',X(i));xh.style.display='';
    var t='<b>'+lab(i)+'</b>';EMP.forEach(function(e){t+=trow(col[e.k],e.n,pc(sh[e.k][i]))});showTip(t,e.clientX,e.clientY)}
  ov.addEventListener('pointermove',mv);ov.addEventListener('pointerdown',mv);ov.addEventListener('pointerleave',function(){xh.style.display='none';hideTip()});
}
function empLines(){
  var st=S.emp,sm=st.smooth,mt=st.metric,host=$('#empLines'),ser=[],nacR=realS(NAC.media),ones=NAC.a.map(function(){return 1});
  var nat=sm?wma(nacR,NAC.a,12):nacR,yFmt,fmtV,head,sub,ks=['TAM','GLO','AZU','ONE'];
  function em(k){return EMP.filter(function(x){return x.k===k})[0]}
  if(mt==='assentos'){
    head='Assentos vendidos por companhia';sub='Assentos vendidos por mês'+(sm?' (média móvel de 12 meses).':'.');
    ks.forEach(function(k){var e=em(k),a=D.emp[k].a;ser.push({color:e.c,vals:sm?wma(a,ones,12):a.slice(),width:2.8,name:e.n})});
    yFmt=function(v){return v===0?'0':mil(v)};fmtV=mil;
  }else if(mt==='premio'){
    head='Quanto cada companhia cobra acima ou abaixo da média';sub='Diferença entre a tarifa média real da companhia e a média nacional'+(sm?' (média móvel de 12 meses)':'')+'. Reflete também o mix de rotas de cada uma.';
    ser.push({color:'var(--nom)',vals:nat.map(function(v){return v==null?null:0}),dash:'6 5',width:1.8,name:'Média nacional'});
    ks.forEach(function(k){var e=em(k),r=realS(D.emp[k].n),v=sm?wma(r,D.emp[k].a,12):r;ser.push({color:e.c,vals:v.map(function(x,i){return (x==null||nat[i]==null)?null:x/nat[i]-1}),width:2.8,name:e.n})});
    yFmt=function(v){return pcs(v,0)};fmtV=function(v){return pcs(v,1)};
  }else{
    head='Tarifa média real por companhia';sub=(sm?'Média móvel de 12 meses':'Valor mensal')+', em R$ de '+BASE+'. A linha tracejada é a média nacional.';
    ser.push({color:'var(--nom)',vals:nat,dash:'6 5',width:2,name:'Média nacional'});
    ks.forEach(function(k){var e=em(k),r=realS(D.emp[k].n);ser.push({color:e.c,vals:sm?wma(r,D.emp[k].a,12):r,width:2.8,name:e.n})});
    yFmt=function(v){return 'R$\u00a0'+nf0.format(v)};fmtV=brl;
  }
  $('#empLinesH').textContent=head;$('#empLinesSub').textContent=sub;
  $('#empLegend').innerHTML=(mt==='assentos'?'':'<span class="lg"><i class="sw dash"></i>Média nacional</span>')+EMP.slice(0,4).map(function(e){return '<span class="lg"><i class="sw" style="border-top-color:'+e.c+'"></i>'+e.n+'</span>'}).join('')+'<button type="button" class="lg" id="empSm" aria-pressed="'+sm+'" style="margin-left:auto">Suavizar (12 meses)</button>';
  $('#empSm').onclick=function(){S.emp.smooth=!S.emp.smooth;empLines()};
  timeChart(host,{series:ser,h:window.innerWidth<560?230:270,yFmt:yFmt,yZero:mt==='assentos',
    tip:function(i){var t='<b>'+lab(i)+(sm?' (12 meses)':'')+'</b>';ser.slice().reverse().forEach(function(s){t+=trow(s.color,s.name,s.vals[i]==null?'—':fmtV(s.vals[i]))});return t}});
}
function empMetric(){
  var el=$('#empMetric'),opts=[['tarifa','Tarifa'],['assentos','Assentos'],['premio','Contra a média']];
  el.innerHTML=opts.map(function(o){return '<button type="button" data-v="'+o[0]+'" aria-pressed="'+(S.emp.metric===o[0])+'">'+o[1]+'</button>'}).join('');
  el.querySelectorAll('button').forEach(function(b){b.onclick=function(){S.emp.metric=b.dataset.v;el.querySelectorAll('button').forEach(function(x){x.setAttribute('aria-pressed',x===b)});empLines()}});
}
function empTable(){
  var y=S.emp.year;
  $('#empChips').innerHTML=YEARS.map(function(v){return '<button type="button" class="chip" data-y="'+v+'" aria-pressed="'+(v===y)+'">'+yl(v)+'</button>'}).join('');
  $('#empChips').querySelectorAll('button').forEach(function(b){b.onclick=function(){S.emp.year=+b.dataset.y;empTable()}});
  var tb='<thead><tr><th>Companhia</th><th>Assentos</th><th>Tarifa média real</th><th>Mediana</th><th>P90</th></tr></thead><tbody>';
  EMP.forEach(function(e){var r=D.emp_anual[e.k][y]||{};if(!r.assentos&&e.k==='ONE')return;
    tb+='<tr><td><span class="who"><i style="background:'+e.c+'"></i>'+e.n+'</span></td><td>'+pc(r.share||0,1)+'</td><td>'+(e.k==='OUT'?'—':brl(r.media_real))+'</td><td>'+(r.mediana_real?brl(r.mediana_real):'—')+'</td><td>'+(r.p90_real?brl(r.p90_real):'—')+'</td></tr>'});
  tb+='<tr class="cur"><td>Brasil</td><td>100%</td><td>'+brl(A[y].media_real)+'</td><td>'+brl(A[y].mediana_real)+'</td><td>'+brl(A[y].p90)+'</td></tr>';
  $('#empTable').innerHTML=tb+'</tbody>';
}
function empText(){
  var t=D.emp_anual.TAM,g=D.emp_anual.GLO,a=D.emp_anual.AZU,o=D.emp_anual.OUT,v=D.emp_anual.ONE;
  var threeL=1-((o[LY]?o[LY].share:0)+(v[LY]?v[LY].share:0)),vp=YEARS.reduce(function(b,y){return (v[y]&&v[y].share>(v[b]?v[b].share:0))?y:b},Y0);
  $('#empLead').innerHTML='LATAM, Gol e Azul respondem por <b>'+(threeL>0.999?'mais de 99,9%':pc(threeL,1))+'</b> dos assentos de '+LY+'. Em '+Y0+' eram quatro grandes: a Avianca tinha <b>'+pc(v[Y0].share,0)+'</b> dos assentos, chegou a '+pc(v[vp].share,0)+' em '+vp+' e deixou o mercado em 2019. A LATAM foi de '+pc(t[Y0].share,0)+' em '+Y0+' para '+pc(t[LY].share,0)+' em '+LY+'; a Azul, de '+pc(a[Y0].share,0)+' para '+pc(a[LY].share,0)+'; a Gol, de '+pc(g[Y0].share,0)+' para '+pc(g[LY].share,0)+'.';
  var hs=YEARS.map(function(y){return D.hhi[y]});
  $('#hhiNote').textContent='O índice de concentração (HHI, máximo de 10.000) passou de '+nf0.format(D.hhi[Y0])+' em '+Y0+' para '+nf0.format(D.hhi[2020])+' em 2020, depois da saída da Avianca, e ficou entre '+nf0.format(Math.min.apply(null,hs))+' e '+nf0.format(Math.max.apply(null,hs))+' no período todo: o mercado é muito concentrado.';
}

/* ============ rotas ============ */
var RT=D.rotas.map(function(r){
  var s25=r.anual[LY][0],p25=r.anual[LY][1],p22=r.anual[2022][1];
  return {r:r,seats:s25,real:p25,vr:(p25&&p22)?p25/p22-1:null,spark:YEARS.map(function(y){return r.anual[y][1]}),key:noAcc(r.nome+' '+r.id)};
});
function spark(v){
  var w=84,h=22,pts=[],vals=v.filter(function(x){return x!=null});if(vals.length<2)return '';
  var lo=Math.min.apply(null,vals),hi=Math.max.apply(null,vals),rg=hi-lo||1;
  v.forEach(function(x,i){if(x!=null)pts.push([2+(w-4)*i/(v.length-1),2+(h-4)*(1-(x-lo)/rg)])});
  var l=pts[pts.length-1];
  return '<svg class="spark" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" aria-hidden="true"><polyline fill="none" style="stroke:var(--sig)" stroke-width="1.8" stroke-linejoin="round" points="'+pts.map(function(p){return p[0].toFixed(1)+','+p[1].toFixed(1)}).join(' ')+'"/><circle cx="'+l[0].toFixed(1)+'" cy="'+l[1].toFixed(1)+'" r="2.4" style="fill:var(--sig)"/></svg>';
}
function routeSelect(){
  var sel=$('#rsel'),sel2=$('#rsel2'),opts=D.rotas.map(function(r){return '<option value="'+r.id+'">'+esc(r.nome)+'</option>'}).join('');
  sel.innerHTML=opts;sel.value=S.route.id;
  sel2.innerHTML='<option value="">Nenhuma</option>'+opts;sel2.value=S.route.id2;
  sel.onchange=function(){S.route.id=sel.value;routeDraw();routeTable()};
  sel2.onchange=function(){S.route.id2=sel2.value;routeDraw()};
}
function routeTicket(r){
  var a25=r.anual[LY],nat=A[LY].media_real,cmp=a25[1]?a25[1]/nat-1:null,p22=r.anual[2022][1],vr=(a25[1]&&p22)?a25[1]/p22-1:null;
  var parts=r.nome.split(' ↔ ');
  $('#ticket').innerHTML='<div class="tk-main"><h3>'+esc(parts[0])+' <span style="color:var(--sig-ink)">↔</span> '+esc(parts[1])+'</h3><p>Soma dos dois sentidos. Código ICAO: '+r.o+' e '+r.d+'.</p></div>'+
   '<div class="tk-stub"><div><div class="v">'+(a25[1]?brl(a25[1]):'—')+'</div><div class="l">tarifa real média em '+LY+'</div></div>'+
   '<div><div class="cmp '+(cmp==null?'':cmp>0?'up':'dn')+'">'+(cmp==null?'—':pcs(cmp,0)+' vs. Brasil')+'</div><div class="l">média nacional: '+brl(nat)+'</div></div>'+
   '<div><div class="cmp">'+(vr==null?'—':pcs(vr,0))+'</div><div class="l">variação real 2022 a '+LY+' · '+mil(a25[0])+' assentos em '+LY+'</div></div></div>';
}
function routeDraw(){
  var r=byId(S.route.id),sm=S.route.smooth,r2=(S.route.id2&&S.route.id2!==S.route.id)?byId(S.route.id2):null;
  routeTicket(r);
  var rr=realS(r.n),nat=realS(NAC.media);
  var sv=sm?wma(rr,r.a,12):rr,nv=sm?wma(nat,NAC.a,12):nat,rr2=r2?realS(r2.n):null,sv2=r2?(sm?wma(rr2,r2.a,12):rr2):null;
  var lg='<span class="lg"><i class="sw"></i>'+esc(shortR(r))+'</span>';
  if(r2)lg+='<span class="lg"><i class="sw" style="border-top-color:var(--warn)"></i>'+esc(shortR(r2))+'</span>';
  $('#rLegend').innerHTML=lg+'<span class="lg"><i class="sw dash"></i>Média nacional</span>';
  var ser=[{color:'var(--nom)',vals:nv,dash:'6 5',width:2},{color:'var(--sig)',vals:sv,width:3}];
  if(r2)ser.push({color:'var(--warn)',vals:sv2,width:3});
  timeChart($('#rChart'),{series:ser,h:window.innerWidth<560?220:270,
    yFmt:function(v){return 'R$\u00a0'+nf0.format(v)},
    bars:{vals:r.a,label:'Assentos vendidos por mês ('+shortR(r)+')',fmt:function(v){return v>=1e6?nfd(1).format(v/1e6)+' mi':(v>=1000?nf0.format(v/1000)+' mil':nf0.format(v))},color:'var(--sig)'},
    tip:function(i){var t='<b>'+lab(i)+(sm?' (12 meses)':'')+'</b>';
      t+=trow('var(--sig)',shortR(r),sv[i]==null?'sem vendas':brl(sv[i]));
      if(r2)t+=trow('var(--warn)',shortR(r2),sv2[i]==null?'sem vendas':brl(sv2[i]));
      t+=trow('','Média nacional',nv[i]==null?'—':brl(nv[i]));
      if(r.a[i])t+=trow('','Assentos ('+shortR(r)+')',nf0.format(r.a[i]));
      if(sv[i]!=null&&nv[i]!=null)t+=trow('','Diferença ('+shortR(r)+')',pcs(sv[i]/nv[i]-1,0));return t}});
  routeAir(r);
}
function routeTable(){
  var st=S.route,rows=RT.filter(function(x){return !st.q||x.key.indexOf(st.q)>-1});
  var k=st.sort,d=st.dir;
  rows.sort(function(a,b){
    var va=k==='name'?a.r.nome:a[k],vb=k==='name'?b.r.nome:b[k];
    if(va==null&&vb==null)return 0;if(va==null)return 1;if(vb==null)return -1;
    return k==='name'?d*va.localeCompare(vb,'pt-BR'):d*(va-vb);
  });
  function th(key,txt,num){var cur=st.sort===key;return '<th class="'+(num?'num':'')+'" scope="col"'+(cur?' aria-sort="'+(st.dir<0?'descending':'ascending')+'"':'')+'><button type="button" data-k="'+key+'">'+txt+(cur?(st.dir<0?' ↓':' ↑'):'')+'</button></th>'}
  var h='<thead><tr>'+th('name','Ligação')+th('real','Real '+LY,1)+th('vr','2022→'+String(LY).slice(2),1)+th('seats','Assentos '+LY,1)+'<th scope="col">'+Y0+' a '+YEARS[YEARS.length-1]+'</th></tr></thead><tbody>';
  if(!rows.length)h+='<tr><td colspan="5" class="empty">Nenhuma ligação encontrada. Tente outro nome de cidade ou o código IATA.</td></tr>';
  rows.forEach(function(x){
    h+='<tr data-id="'+x.r.id+'" tabindex="0" aria-selected="'+(x.r.id===st.id)+'"><td class="rn">'+esc(x.r.nome)+'</td><td class="num">'+(x.real?brl(x.real):'—')+'</td><td class="num '+(x.vr==null?'':x.vr<0?'neg':'pos')+'">'+(x.vr==null?'—':pcs(x.vr,0))+'</td><td class="num">'+(x.seats?mil(x.seats):'—')+'</td><td>'+spark(x.spark)+'</td></tr>'});
  var tab=$('#rtab');tab.innerHTML=h+'</tbody>';
  tab.querySelectorAll('th button').forEach(function(b){b.onclick=function(){var kk=b.dataset.k;if(st.sort===kk)st.dir*=-1;else{st.sort=kk;st.dir=kk==='name'?1:-1}routeTable()}});
  tab.querySelectorAll('tbody tr[data-id]').forEach(function(tr){
    function pick(){S.route.id=tr.dataset.id;$('#rsel').value=S.route.id;routeDraw();routeTable();var t=$('#ticket').getBoundingClientRect();if(t.top<70||t.top>innerHeight*.7)$('#ticket').scrollIntoView({behavior:'smooth',block:'center'})}
    tr.onclick=pick;tr.onkeydown=function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();pick()}};
  });
}

/* ============ aeroportos: ranking ============ */
function aeroDraw(){
  var y=S.aero.year,nat=A[y].media_real;
  $('#aChips').innerHTML=YEARS.map(function(v){return '<button type="button" class="chip" data-y="'+v+'" aria-pressed="'+(v===y)+'">'+yl(v)+'</button>'}).join('');
  $('#aChips').querySelectorAll('button').forEach(function(b){b.onclick=function(){S.aero.year=+b.dataset.y;aeroDraw();mapDraw();aeroFocusDraw()}});
  var rows=D.aero.map(function(a){return {i:a.icao,n:a.nome,s:a.anual[y][0],p:a.anual[y][1]}}).filter(function(r){return r.p!=null&&r.s>0}).sort(function(a,b){return b.s-a.s}).slice(0,15);
  var mx=rows[0].s;
  $('#aero').innerHTML=rows.map(function(r){
    return '<div class="arow" role="button" tabindex="0" data-ic="'+r.i+'" aria-selected="'+(r.i===S.aero.id)+'"><div class="an" title="'+esc(r.n)+'">'+esc(r.n)+'</div><div class="ab"><div style="width:'+(r.s/mx*100).toFixed(1)+'%;background:'+divColorSolid(r.p/nat)+'"></div></div><div class="av">'+brl(r.p)+'<small>'+mil(r.s)+'</small></div></div>'}).join('');
  $('#aero').querySelectorAll('.arow').forEach(function(el){function pick(){selectAero(el.dataset.ic,true)}el.onclick=pick;el.onkeydown=function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();pick()}}});
}
function aeroSelect(){
  var sel=$('#asel');sel.innerHTML=D.aero.map(function(a){return '<option value="'+a.icao+'">'+esc(a.nome)+'</option>'}).join('');sel.value=S.aero.id;
  sel.onchange=function(){selectAero(sel.value,false)};
}
function divColorSolid(idx){var t=Math.max(-1,Math.min(1,(idx-1)/.3)),a=(.35+Math.abs(t)*.6).toFixed(2);return t<0?'rgba(43,119,189,'+a+')':'rgba(218,83,26,'+a+')'}

/* ============ utilidades novas ============ */
function lab2(i){return ML[mOf(i)]+' de '+yOf(i)}
function yy(i){return String(yOf(i)).slice(2)}
function byId(id){return D.rotas.filter(function(x){return x.id===id})[0]||D.rotas[0]}
function aeroBy(ic){return D.aero.filter(function(x){return x.icao===ic})[0]||D.aero[0]}
function shortR(r){var m=r.nome.match(/\(([A-Za-z0-9]+)\)/g)||[];return m.map(function(x){return x.slice(1,-1)}).join('–')}
function hostHint(){return window.innerWidth<560}
function bindHover(el,htmlFn,onClick){
  el.addEventListener('pointermove',function(e){showTip(htmlFn(),e.clientX,e.clientY)});
  el.addEventListener('pointerdown',function(e){showTip(htmlFn(),e.clientX,e.clientY)});
  el.addEventListener('pointerleave',hideTip);
  if(onClick){el.addEventListener('click',onClick)}
}

/* ============ barras agrupadas (categorias x séries) ============ */
function groupBars(host,cfg){
  var W=Math.max(280,host.clientWidth),mob=W<560,H=cfg.h||(mob?230:270),m={l:mob?48:58,r:8,t:18,b:cfg.b||30};
  var iw=W-m.l-m.r,ih=H-m.t-m.b,C=cfg.cats.length,K=cfg.series.length,mx=0;
  cfg.series.forEach(function(s){s.vals.forEach(function(v){if(v!=null&&v>mx)mx=v})});
  var T=niceTicks(0,mx||1,4),top=T[T.length-1],Y=function(v){return m.t+ih*(1-v/top)};
  var cw=iw/C,gw=cw*.82,bw=gw/K,every=cw<36?Math.ceil(36/cw):1;
  var s='<svg viewBox="0 0 '+W+' '+H+'" width="'+W+'" height="'+H+'" aria-hidden="true"><g class="ax">';
  T.forEach(function(t,k){s+='<line class="gl'+(k?'':' base')+'" x1="'+m.l+'" x2="'+(W-m.r)+'" y1="'+Y(t).toFixed(1)+'" y2="'+Y(t).toFixed(1)+'"/><text x="'+(m.l-7)+'" y="'+(Y(t)+4).toFixed(1)+'" text-anchor="end">'+(cfg.yFmt?cfg.yFmt(t):nf0.format(t))+'</text>'});
  cfg.cats.forEach(function(c,ci){if(ci%every===0)s+='<text x="'+(m.l+cw*(ci+.5)).toFixed(1)+'" y="'+(H-10)+'" text-anchor="middle">'+esc(c)+'</text>'});
  s+='</g>';
  var lbl='';
  cfg.series.forEach(function(sr,si){sr.vals.forEach(function(v,ci){
    if(v==null||v<=0)return;
    var x=m.l+cw*ci+(cw-gw)/2+bw*si,h=ih*v/top;
    s+='<rect data-c="'+ci+'" data-s="'+si+'" x="'+x.toFixed(1)+'" y="'+(m.t+ih-h).toFixed(1)+'" width="'+Math.max(1,bw-1.5).toFixed(1)+'" height="'+h.toFixed(1)+'" rx="2" style="fill:'+sr.color+';cursor:default"/>';
    if(cfg.lblFmt&&bw>=(cfg.lblW||46))lbl+='<text x="'+(x+(bw-1.5)/2).toFixed(1)+'" y="'+(m.t+ih-h-4).toFixed(1)+'" text-anchor="middle" style="font:600 10.5px var(--f-body);fill:var(--ink)">'+cfg.lblFmt(v)+'</text>';
  })});
  host.innerHTML=s+lbl+'</svg>';
  host.querySelectorAll('rect[data-c]').forEach(function(r){var ci=+r.dataset.c,si=+r.dataset.s;bindHover(r,function(){return cfg.tip(ci,si)})});
}

/* ============ série mensal numa janela (casos reais) ============ */
function winChart(host,cfg){
  var i0=cfg.i0,i1=cfg.i1,n=i1-i0+1,W=Math.max(300,host.clientWidth),mob=W<560,notes=cfg.notes||[],bars=cfg.bars||null;
  var ih=cfg.h||(mob?220:270),BH=bars?(mob?52:64):0,GAP=bars?26:0,m={l:mob?46:58,r:mob?10:16,t:notes.length?(12+notes.length*16):12,b:38};
  var iw=W-m.l-m.r,H=m.t+ih+GAP+BH+m.b,lo=Infinity,hi=-Infinity,i;
  cfg.series.forEach(function(sr){for(i=i0;i<=i1;i++){var v=sr.vals[i];if(v!=null&&isFinite(v)){if(v<lo)lo=v;if(v>hi)hi=v}}});
  if(!isFinite(lo)){lo=0;hi=1}
  var T=niceTicks(lo,hi,mob?4:5),y0=T[0],y1=T[T.length-1];
  var X=function(k){return m.l+iw*(k-i0+.5)/n},Y=function(v){return m.t+ih*(1-(v-y0)/(y1-y0))};
  var step=Math.max(1,Math.ceil((mob?36:44)/(iw/n))),bot=m.t+ih+(bars?GAP+BH:0);
  var s='<svg viewBox="0 0 '+W+' '+H+'" width="'+W+'" height="'+H+'" aria-hidden="true"><g class="ax">';
  T.forEach(function(t,k){s+='<line class="gl'+(k===0?' base':'')+'" x1="'+m.l+'" x2="'+(W-m.r)+'" y1="'+Y(t).toFixed(1)+'" y2="'+Y(t).toFixed(1)+'"/><text x="'+(m.l-8)+'" y="'+(Y(t)+4).toFixed(1)+'" text-anchor="end">'+(cfg.yFmt?cfg.yFmt(t):nf0.format(t))+'</text>'});
  for(i=i0;i<=i1;i++){if((i-i0)%step===0){
    s+='<text x="'+X(i).toFixed(1)+'" y="'+(H-20)+'" text-anchor="middle">'+MA[mOf(i)]+'</text>';
    if(mOf(i)===0||i===i0)s+='<text x="'+X(i).toFixed(1)+'" y="'+(H-6)+'" text-anchor="middle" style="font-weight:600;fill:var(--ink)">'+yOf(i)+'</text>';
  }}
  s+='</g>';
  var bTop=m.t+ih+GAP,bm=0;
  if(bars){
    for(i=i0;i<=i1;i++){if(bars.vals[i]>bm)bm=bars.vals[i]}
    var bt=niceTicks(0,bm,2);bm=bt[bt.length-1];
    var bw=Math.max(2,iw/n*.66);
    s+='<g class="ax"><line class="gl base" x1="'+m.l+'" x2="'+(W-m.r)+'" y1="'+(bTop+BH)+'" y2="'+(bTop+BH)+'"/><text x="'+(m.l-8)+'" y="'+(bTop+10)+'" text-anchor="end">'+bars.fmt(bm)+'</text><text x="'+(m.l-8)+'" y="'+(bTop+BH+4)+'" text-anchor="end">0</text><text class="ytitle" x="'+m.l+'" y="'+(bTop-9)+'">'+esc(bars.label)+'</text></g>';
    for(i=i0;i<=i1;i++){var v=bars.vals[i];if(!v)continue;var h=BH*v/bm;s+='<rect x="'+(X(i)-bw/2).toFixed(1)+'" y="'+(bTop+BH-h).toFixed(1)+'" width="'+bw.toFixed(1)+'" height="'+h.toFixed(1)+'" rx="1.5" style="fill:'+(bars.color||'var(--nom)')+';opacity:.75"/>'}
  }
  cfg.series.forEach(function(sr){
    var d='',pen=false;
    for(i=i0;i<=i1;i++){var v=sr.vals[i];if(v==null){pen=false;continue}d+=(pen?'L':'M')+X(i).toFixed(1)+' '+Y(v).toFixed(1);pen=true}
    s+='<path d="'+d+'" fill="none" style="stroke:'+sr.color+'" stroke-width="'+(sr.width||2.6)+'" stroke-linejoin="round" stroke-linecap="round"'+(sr.dash?' stroke-dasharray="'+sr.dash+'"':'')+'/>';
  });
  notes.forEach(function(nt,j){
    var x=X(nt.i),ty=14+j*16,right=x>W*.55;
    s+='<line class="note-l" x1="'+x.toFixed(1)+'" y1="'+(ty+4)+'" x2="'+x.toFixed(1)+'" y2="'+(m.t+ih)+'" stroke-dasharray="2 3"/><text class="note-t" x="'+(right?x-6:x+6).toFixed(1)+'" y="'+ty+'" text-anchor="'+(right?'end':'start')+'">'+esc(mob&&nt.short?nt.short:nt.text)+'</text>';
  });
  s+='<line class="xh" id="xh_'+host.id+'" y1="'+m.t+'" y2="'+bot+'" x1="0" x2="0" style="display:none"/>';
  cfg.series.forEach(function(sr,k){s+='<circle class="dot" id="dt_'+host.id+'_'+k+'" r="5" style="fill:'+sr.color+';display:none"/>'});
  s+='<rect id="ov_'+host.id+'" x="'+m.l+'" y="'+m.t+'" width="'+iw+'" height="'+(bot-m.t)+'" fill="transparent" style="cursor:crosshair"/></svg>';
  host.innerHTML=s;
  var svg=host.querySelector('svg'),ov=host.querySelector('#ov_'+host.id),xh=host.querySelector('#xh_'+host.id);
  function move(e){
    var r=svg.getBoundingClientRect(),px=(e.clientX-r.left)*(W/r.width);
    var k=i0+Math.max(0,Math.min(n-1,Math.round((px-m.l)/iw*n-.5)));
    xh.setAttribute('x1',X(k));xh.setAttribute('x2',X(k));xh.style.display='';
    cfg.series.forEach(function(sr,q){var d=host.querySelector('#dt_'+host.id+'_'+q),v=sr.vals[k];if(v==null){d.style.display='none'}else{d.setAttribute('cx',X(k));d.setAttribute('cy',Y(v));d.style.display=''}});
    showTip(cfg.tip(k),e.clientX,e.clientY);
  }
  function leave(){xh.style.display='none';cfg.series.forEach(function(_,q){host.querySelector('#dt_'+host.id+'_'+q).style.display='none'});hideTip()}
  ov.addEventListener('pointermove',move);ov.addEventListener('pointerdown',move);ov.addEventListener('pointerleave',leave);
}

/* ============ casos reais ============ */
var seatsBars={label:'Assentos vendidos por mês',fmt:function(v){return v>=1e6?nfd(v%1e6?1:0).format(v/1e6)+' mi':nf0.format(v/1000)+' mil'},color:'var(--nom)'};
function argMin(a,i0,i1){var k=i0;for(var i=i0;i<=i1;i++)if(a[i]<a[k])k=i;return k}
function caseFill(title,legend,facts,ctx){
  $('#caseTitle').textContent=title;
  $('#caseLegend').innerHTML=legend;
  $('#caseFacts').innerHTML=facts.map(function(f){return '<li>'+f+'</li>'}).join('');
  $('#caseCtx').innerHTML='<b>De fora dos dados.</b> '+ctx;
}
function casePandemia(){
  var R=realS(NAC.media),j0=im('2020-01'),j1=im('2021-12'),s0=NAC.a[j0],iMin=argMin(NAC.a,j0,j1),iLow=argMin(R,j0,j1),back=-1,i;
  for(i=iMin+1;i<N;i++){if(NAC.a[i]>=s0){back=i;break}}
  caseFill('Pandemia: as vendas quase param',
    '<span class="lg"><i class="sw"></i>Tarifa média real</span><span class="lg"><i class="sw box" style="background:var(--nom)"></i>Assentos vendidos</span>',
    ['Os assentos vendidos caíram de <b>'+mi(s0)+'</b> em janeiro de 2020 para <b>'+mi(NAC.a[iMin])+'</b> em '+ML[iMin%12]+' ('+pcs(NAC.a[iMin]/s0-1,0)+').',
     back>0?'O volume só voltou ao nível de janeiro/2020 em <b>'+lab2(back)+'</b>.':'O volume não voltou ao nível de janeiro/2020 até o fim da série.',
     'No ano todo, 2020 teve <b>'+mi(A[2020].assentos)+'</b> de assentos vendidos, contra '+mi(A[2019].assentos)+' em 2019 ('+pcs(A[2020].assentos/A[2019].assentos-1,0)+').',
     'A tarifa média real também recuou: mínimo de <b>'+brl(R[iLow])+'</b> em '+lab2(iLow)+', contra '+brl(R[j0])+' em janeiro.',
     'Depois veio a alta: média real de <b>'+brl(A[2020].media_real)+'</b> em 2020, <b>'+brl(A[2021].media_real)+'</b> em 2021 e <b>'+brl(A[2022].media_real)+'</b> em 2022.'],
    'A pandemia de covid-19 e as restrições a viagens reduziram a demanda a partir de março de 2020.');
  winChart($('#caseChart'),{i0:im('2019-07'),i1:j1,series:[{vals:R,color:'var(--sig)',width:3}],bars:{vals:NAC.a,label:seatsBars.label,fmt:seatsBars.fmt,color:seatsBars.color},
    notes:[{i:iMin,text:'Menor volume: '+lab(iMin)+' ('+pcs(NAC.a[iMin]/s0-1,0)+' vs. jan/20)',short:lab(iMin)+' '+pcs(NAC.a[iMin]/s0-1,0)}],
    yFmt:function(v){return 'R$\u00a0'+nf0.format(v)},
    tip:function(k){return '<b>'+lab(k)+'</b>'+trow('var(--sig)','Tarifa média real',brl(R[k]))+trow('','Assentos vendidos',mil(NAC.a[k]))+trow('','Contra jan/2020',pcs(NAC.a[k]/s0-1,0))}});
}
function caseQav(){
  var R=realS(NAC.media),cs=D.casos.cesta_mar22,iF=im('2022-02'),iM=im('2022-03'),iD=im('2022-12'),nomCh=NAC.media[iM]/NAC.media[iF]-1,realCh=R[iM]/R[iF]-1,i,mn=Infinity,mx=0;
  for(i=iM;i<=iD;i++){if(R[i]<mn)mn=R[i];if(R[i]>mx)mx=R[i]}
  var ser=[{vals:R,color:'var(--nom)',width:2.4,dash:'6 5',name:'Média nacional'}];
  EMP.slice(0,3).forEach(function(e){ser.push({vals:realS(D.emp[e.k].n),color:e.c,width:2.8,name:e.n})});
  caseFill('Março de 2022: a tarifa muda de patamar',
    '<span class="lg"><i class="sw dash"></i>Média nacional</span>'+EMP.slice(0,3).map(function(e){return '<span class="lg"><i class="sw" style="border-top-color:'+e.c+'"></i>'+e.n+'</span>'}).join(''),
    ['De fevereiro para março de 2022 a tarifa média subiu <b>'+pc(nomCh,1)+'</b> em valores da época ('+brl(NAC.media[iF])+' para '+brl(NAC.media[iM])+') e <b>'+pc(realCh,1)+'</b> em valores reais.',
     'Não é efeito de mix de rotas: comparando as <b>mesmas companhias nas mesmas rotas</b>, a alta foi de <b>'+pc(cs.total,1)+'</b> (valores da época).',
     'A alta apareceu nas três: LATAM '+pc(cs.TAM,0)+', Gol '+pc(cs.GLO,0)+' e Azul '+pc(cs.AZU,0)+' (mesmas rotas).',
     'O novo patamar durou: de março a dezembro de 2022 a média real ficou entre <b>'+brl(mn)+'</b> e <b>'+brl(mx)+'</b>, contra '+brl(R[iF])+' em fevereiro.'],
    'A imprensa da época (por exemplo, O Globo, com dados da ANAC) atribuiu a alta à combinação de guerra na Ucrânia e reabertura da economia. Os dados não identificam a causa.');
  winChart($('#caseChart'),{i0:im('2021-09'),i1:iD,series:ser,bars:{vals:NAC.a,label:seatsBars.label,fmt:seatsBars.fmt,color:seatsBars.color},
    notes:[{i:iM,text:'Mar/2022: '+pcs(realCh,0)+' em um mês (real)',short:'Mar/22 '+pcs(realCh,0)}],
    yFmt:function(v){return 'R$\u00a0'+nf0.format(v)},
    tip:function(k){var t='<b>'+lab(k)+'</b>';ser.slice().reverse().forEach(function(s){t+=trow(s.color,s.name,s.vals[k]==null?'—':brl(s.vals[k]))});return t+trow('','Assentos vendidos',mil(NAC.a[k]))}});
}
function caseRS(){
  var P=D.casos.poa,pa=P.SBPA.a,co=P.SBCO.a,i0=im('2024-01'),i1=im('2025-06'),i,back=-1,iAb=im('2024-04'),iMa=im('2024-05'),iJn=im('2024-06'),iJl=im('2024-07');
  for(i=iJl;i<=i1;i++){if(co[i]<2000){back=i;break}}
  var cats=[];for(i=i0;i<=i1;i++)cats.push(MA[mOf(i)]+(mOf(i)===0||i===i0?'/'+yy(i):''));
  var A1=pa[iAb],iOct=im('2024-10');
  caseFill('Enchentes no Rio Grande do Sul, maio de 2024',
    '<span class="lg"><i class="sw box" style="background:var(--sig)"></i>Porto Alegre (SBPA)</span><span class="lg"><i class="sw box" style="background:var(--sun)"></i>Canoas (SBCO)</span>',
    ['Em abril de 2024 saíram de Porto Alegre (SBPA) <b>'+nf0.format(A1)+'</b> assentos vendidos. Em maio, <b>'+nf0.format(pa[iMa])+'</b> ('+pcs(pa[iMa]/A1-1,0)+'); em junho e julho, <b>'+nf0.format(pa[iJn])+'</b> e <b>'+nf0.format(pa[iJl])+'</b>.',
     'Canoas (SBCO), que não aparecia nos meses anteriores, passou a registrar <b>'+nf0.format(co[iMa])+'</b> assentos em maio e <b>'+nf0.format(co[iJn])+'</b> em junho'+(back>0?'; cai a menos de 2 mil em '+lab2(back)+'.':'.'),
     'Somando os dois aeroportos, junho teve <b>'+pc((pa[iJn]+co[iJn])/A1,0)+'</b> do volume de abril: o desvio para Canoas compensou só uma parte da queda.',
     'Em outubro, as vendas em SBPA voltaram a <b>'+pc(pa[iOct]/A1,0)+'</b> do nível de abril.'],
    'O aeroporto Salgado Filho, em Porto Alegre, ficou fechado a partir das enchentes de maio de 2024. Os dados mostram o efeito nas vendas, não o motivo. Como a base registra o mês da venda (não o do voo), a retomada das vendas pode se antecipar à dos voos.');
  groupBars($('#caseChart'),{cats:cats,series:[{vals:pa.slice(i0,i1+1),color:'var(--sig)',name:'Porto Alegre (SBPA)'},{vals:co.slice(i0,i1+1),color:'var(--sun)',name:'Canoas (SBCO)'}],
    h:hostHint()?250:300,yFmt:function(v){return v?mil(v):'0'},
    tip:function(ci){var k=i0+ci;return '<b>'+lab(k)+'</b>'+trow('var(--sig)','Porto Alegre (SBPA)',nf0.format(pa[k]))+trow('var(--sun)','Canoas (SBCO)',nf0.format(co[k]))+trow('','Soma',nf0.format(pa[k]+co[k]))}});
}
function caseNov(){
  var R=realS(NAC.media),j=-1,i,iN=im('2025-11'),iO=im('2025-10'),iD=im('2025-12');
  for(i=iO;i>=0;i--){if(NAC.a[i]>=NAC.a[iN]){j=i;break}}
  caseFill('Novembro de 2025: mais vendas, tarifa menor',
    '<span class="lg"><i class="sw"></i>Tarifa média real</span><span class="lg"><i class="sw box" style="background:var(--nom)"></i>Assentos vendidos</span>',
    ['Em novembro de 2025 foram vendidos <b>'+mi(NAC.a[iN])+'</b> assentos, <b>'+pcs(NAC.a[iN]/NAC.a[iO]-1,0)+'</b> sobre outubro.',
     j>=0?'É o maior volume mensal desde <b>'+lab2(j)+'</b>.':'É o maior volume mensal de toda a série.',
     'A tarifa média real caiu de <b>'+brl(R[iO])+'</b> para <b>'+brl(R[iN])+'</b> ('+pcs(R[iN]/R[iO]-1,0)+').',
     'Em dezembro o volume voltou a cair ('+pcs(NAC.a[iD]/NAC.a[iN]-1,0)+') e a tarifa real subiu para <b>'+brl(R[iD])+'</b>.'],
    'O período coincide com a Black Friday (fim de novembro), mas os dados não permitem atribuir a causa.');
  winChart($('#caseChart'),{i0:im('2025-01'),i1:iD,series:[{vals:R,color:'var(--sig)',width:3}],bars:{vals:NAC.a,label:seatsBars.label,fmt:seatsBars.fmt,color:seatsBars.color},
    notes:[{i:iN,text:'Nov/2025: assentos '+pcs(NAC.a[iN]/NAC.a[iO]-1,0)+', tarifa '+pcs(R[iN]/R[iO]-1,0),short:'Nov/25'}],
    yFmt:function(v){return 'R$\u00a0'+nf0.format(v)},
    tip:function(k){return '<b>'+lab(k)+'</b>'+trow('var(--sig)','Tarifa média real',brl(R[k]))+trow('','Assentos vendidos',mil(NAC.a[k]))}});
}
function caseAvianca(){
  var i0=im('2018-01'),i1=im('2020-02'),ks=['TAM','GLO','AZU','ONE'],sh={},i,last=-1,pk=i0,v=D.emp_anual.ONE;
  ks.forEach(function(k){sh[k]=D.emp[k].a.map(function(x,j){return NAC.a[j]?x/NAC.a[j]:null})});
  for(i=i0;i<=i1;i++){if(D.emp.ONE.a[i]>0)last=i;if(sh.ONE[i]>sh.ONE[pk])pk=i}
  var d=function(k){return D.emp_anual[k][2019].share-D.emp_anual[k][2018].share};
  var ser=ks.map(function(k){var e=EMP.filter(function(x){return x.k===k})[0];return {vals:sh[k],color:e.c,width:k==='ONE'?3.2:2.4,name:e.n}});
  caseFill('Saída da Avianca, 2019: de quatro grandes para três',
    EMP.slice(0,4).map(function(e){return '<span class="lg"><i class="sw" style="border-top-color:'+e.c+'"></i>'+e.n+'</span>'}).join(''),
    ['A Avianca tinha <b>'+pc(v[2018].share,1)+'</b> dos assentos vendidos em 2018; o pico mensal foi de <b>'+pc(sh.ONE[pk],1)+'</b> em '+lab2(pk)+'.',
     last>=0?'A última venda registrada foi em <b>'+lab2(last)+'</b>; em 2019 a participação anual caiu para '+pc(v[2019].share,1)+'.':'',
     'De 2018 para 2019, a participação da LATAM mudou '+pcs(d('TAM'),1).replace('%','')+' pontos percentuais, a da Gol '+pcs(d('GLO'),1).replace('%','')+' e a da Azul '+pcs(d('AZU'),1).replace('%','')+'.',
     'O HHI do mercado doméstico passou de <b>'+nf0.format(D.hhi[2018])+'</b> em 2018 para <b>'+nf0.format(D.hhi[2019])+'</b> em 2019 e '+nf0.format(D.hhi[2020])+' em 2020.'],
    'A Avianca Brasil entrou em recuperação judicial em dezembro de 2018 e parou de voar em maio de 2019. Os dados mostram a mudança de participação, não o motivo.');
  winChart($('#caseChart'),{i0:i0,i1:i1,series:ser,yFmt:function(x){return pc(x,0)},
    notes:last>=0?[{i:last,text:'Última venda da Avianca: '+lab(last),short:lab(last)}]:[],
    tip:function(k){var t='<b>'+lab(k)+'</b>';ser.slice().reverse().forEach(function(s){t+=trow(s.color,s.name,s.vals[k]==null?'—':pc(s.vals[k],1))});return t+trow('','HHI do mês',nf0.format(D.hhi_m[k]))}});
}
var CASES=[{k:'avianca',t:'Saída da Avianca (2019)',f:caseAvianca},{k:'pandemia',t:'Pandemia (2020)',f:casePandemia},{k:'qav',t:'Março de 2022',f:caseQav},{k:'rs',t:'Enchente no RS (2024)',f:caseRS},{k:'nov',t:'Novembro de 2025',f:caseNov}];
function caseTabs(){
  var el=$('#caseTabs');
  el.innerHTML=CASES.map(function(c){return '<button type="button" class="chip" data-k="'+c.k+'" aria-pressed="'+(c.k===S.cs)+'">'+c.t+'</button>'}).join('');
  el.querySelectorAll('button').forEach(function(b){b.onclick=function(){S.cs=b.dataset.k;caseTabs();caseDraw()}});
}
function caseDraw(){CASES.filter(function(c){return c.k===S.cs})[0].f()}

/* ============ rota: tarifa por companhia ============ */
function routeAir(r){
  var ks=['TAM','GLO','AZU','ONE'],MINS=500,y=YEARS.indexOf(LY);
  var ser=ks.map(function(k){var e=EMP.filter(function(x){return x.k===k})[0],em=(r.emp&&r.emp[k])||{};
    return {name:e.n,color:e.c,vals:YEARS.map(function(yr){var x=em[yr];return x&&x[1]!=null&&x[0]>=MINS?x[1]:null}),seats:YEARS.map(function(yr){var x=em[yr];return x?x[0]:0})}});
  var tot=YEARS.map(function(yr){return r.anual[yr][0]});
  $('#rAirLg').innerHTML=ser.map(function(s){return '<span class="lg"><i class="sw box" style="background:'+s.color+'"></i>'+s.name+'</span>'}).join('');
  ser=ser.filter(function(s){return s.vals.some(function(v){return v!=null})});
  groupBars($('#rAir'),{cats:YEARS.map(yl),series:ser,h:hostHint()?220:250,yFmt:function(v){return 'R$\u00a0'+nf0.format(v)},lblW:50,lblFmt:function(v){return nf0.format(Math.round(v))},
    tip:function(ci,si){var s=ser[si];return '<b>'+esc(s.name)+', '+yl(YEARS[ci])+'</b>'+trow('','Tarifa média real',brl(s.vals[ci]))+trow('','Assentos na ligação',mil(s.seats[ci]))+trow('','Participação',tot[ci]?pc(s.seats[ci]/tot[ci],0):'—')}});
  var ok=ser.filter(function(s){return s.vals[y]!=null}).sort(function(a,b){return a.vals[y]-b.vals[y]});
  $('#rAirTxt').innerHTML=ok.length>1?'Em '+LY+', a companhia mais barata nesta ligação foi <b>'+ok[0].name+'</b> ('+brl(ok[0].vals[y])+') e a mais cara, <b>'+ok[ok.length-1].name+'</b> ('+brl(ok[ok.length-1].vals[y])+'), uma diferença de '+pc(ok[ok.length-1].vals[y]/ok[0].vals[y]-1,0)+'. Só aparecem companhias com pelo menos 500 assentos vendidos na ligação no ano.':(ok.length===1?'Em '+LY+', só a <b>'+ok[0].name+'</b> vendeu ao menos 500 assentos nesta ligação ('+brl(ok[0].vals[y])+').':'Nenhuma companhia vendeu ao menos 500 assentos nesta ligação em '+LY+'.');
}

/* ============ aeroportos: mapa esquemático ============ */
var BR=[[-51.6,4.35],[-51.0,3.4],[-50.4,2.1],[-49.9,1.6],[-50.4,0.9],[-50.7,0.1],[-50.0,-0.2],[-48.9,-0.3],[-48.4,-0.8],[-47.4,-0.6],[-46.5,-0.9],[-45.4,-1.3],[-44.6,-2.1],[-44.0,-2.5],[-43.0,-2.5],[-42.0,-2.8],[-41.0,-2.9],[-40.0,-2.85],[-39.0,-3.1],[-38.4,-3.7],[-37.3,-4.6],[-36.3,-5.0],[-35.3,-5.3],[-35.2,-6.0],[-34.85,-7.1],[-34.85,-8.0],[-35.4,-9.0],[-36.2,-10.2],[-37.0,-11.0],[-37.4,-11.9],[-38.3,-12.9],[-38.9,-13.4],[-39.1,-14.7],[-39.05,-16.3],[-39.2,-17.7],[-39.7,-18.7],[-40.2,-19.9],[-40.4,-20.7],[-41.0,-21.9],[-41.9,-22.9],[-43.1,-23.0],[-44.7,-23.3],[-46.3,-24.0],[-47.9,-25.0],[-48.6,-26.0],[-48.6,-27.2],[-48.6,-28.5],[-49.4,-29.3],[-50.3,-30.6],[-51.2,-31.6],[-52.1,-32.2],[-53.4,-33.75],[-53.4,-32.6],[-54.1,-31.9],[-55.0,-31.2],[-55.6,-30.9],[-56.0,-30.2],[-57.6,-30.2],[-57.0,-29.6],[-56.0,-28.8],[-55.2,-28.2],[-54.4,-27.5],[-53.7,-27.1],[-53.9,-26.2],[-54.4,-25.7],[-54.6,-24.5],[-54.3,-24.05],[-55.0,-23.9],[-55.7,-22.3],[-56.5,-22.1],[-57.9,-22.1],[-57.9,-20.0],[-58.1,-19.4],[-57.6,-17.6],[-58.3,-16.3],[-60.2,-16.3],[-60.3,-14.6],[-61.0,-13.5],[-62.0,-12.8],[-64.4,-12.5],[-65.3,-11.0],[-65.4,-9.8],[-66.7,-9.9],[-68.0,-10.7],[-68.8,-11.0],[-70.6,-11.0],[-71.0,-10.0],[-72.2,-9.6],[-73.2,-9.4],[-73.99,-7.5],[-73.1,-6.5],[-72.4,-5.6],[-71.3,-4.4],[-70.1,-4.2],[-69.9,-3.1],[-69.4,-1.1],[-69.6,0.4],[-69.9,1.05],[-68.9,1.7],[-67.5,1.9],[-66.9,1.2],[-66.4,0.8],[-65.6,0.9],[-64.0,1.9],[-64.0,2.5],[-63.4,3.9],[-62.7,4.0],[-61.6,4.3],[-60.7,5.2],[-60.2,5.25],[-59.9,4.5],[-60.1,3.4],[-59.7,2.6],[-59.0,1.4],[-58.0,1.5],[-57.0,1.9],[-55.9,2.0],[-55.9,2.5],[-54.6,2.3],[-54.0,2.3],[-52.9,2.2],[-52.4,2.9],[-51.9,3.7]];
function mapDraw(){
  var host=$('#map'),y=S.aero.year,nat=A[y].media_real,W=Math.min(Math.max(280,host.clientWidth),620);
  var LON0=-74.6,LON1=-31.4,LAT0=6,LAT1=-34.4,K=Math.cos(15*Math.PI/180),H=Math.round(W*(LAT0-LAT1)/((LON1-LON0)*K));
  var X=function(lo){return (lo-LON0)/(LON1-LON0)*W},Y=function(la){return (LAT0-la)/(LAT0-LAT1)*H};
  var pts=D.aero.filter(function(a){return a.lat!=null&&a.anual[y][0]>0&&a.anual[y][1]!=null}).map(function(a){return {a:a,s:a.anual[y][0],f:a.anual[y][1],x:X(a.lon),y:Y(a.lat)}}).sort(function(p,q){return q.s-p.s});
  var smax=pts.length?pts[0].s:1,rmax=W<420?14:21,rmin=3.2;
  var s='<svg viewBox="0 0 '+W+' '+H+'" width="'+W+'" height="'+H+'" role="img" aria-label="Mapa esquemático dos aeroportos: tamanho é o volume de assentos e cor é a tarifa real comparada à média nacional">';
  s+='<path class="map-shape" d="M'+BR.map(function(p){return X(p[0]).toFixed(1)+' '+Y(p[1]).toFixed(1)}).join('L')+'Z"/>';
  var placed=[];
  pts.slice().reverse().forEach(function(p){
    var r=rmin+Math.sqrt(p.s/smax)*(rmax-rmin),sel=p.a.icao===S.aero.id;
    s+='<circle class="mp'+(sel?' sel':'')+'" data-ic="'+p.a.icao+'" cx="'+p.x.toFixed(1)+'" cy="'+p.y.toFixed(1)+'" r="'+r.toFixed(1)+'" style="fill:'+divColorSolid(p.f/nat)+'"/>';
    p.r=r;
  });
  var lbl='';
  pts.forEach(function(p,k){
    var t=(p.a.nome.match(/\(([A-Za-z0-9]+)\)/)||[0,p.a.icao])[1],w=t.length*6.6+4,lx=p.x+p.r+3,ly=p.y+4;
    if(lx+w>W)lx=p.x-p.r-3-w;
    var hit=placed.some(function(b){return lx<b.x+b.w&&lx+w>b.x&&Math.abs(ly-b.y)<12});
    if(!hit&&(k<14||p.a.icao===S.aero.id)){placed.push({x:lx,w:w,y:ly});lbl+='<text class="mlab" x="'+lx.toFixed(1)+'" y="'+ly.toFixed(1)+'">'+t+'</text>'}
  });
  host.innerHTML=s+lbl+'</svg>';
  host.querySelectorAll('circle.mp').forEach(function(c){
    var p=pts.filter(function(q){return q.a.icao===c.dataset.ic})[0];
    bindHover(c,function(){return '<b>'+esc(p.a.nome)+'</b>'+trow('','Tarifa média real',brl(p.f))+trow('','Contra a média nacional',pcs(p.f/nat-1,0))+trow('','Assentos com origem aqui',mil(p.s))},function(){selectAero(p.a.icao,true)});
  });
}

/* ============ aeroportos: ranking, foco, mix de companhias ============ */
function selectAero(ic,scroll){
  S.aero.id=ic;$('#asel').value=ic;aeroDraw();mapDraw();aeroFocusDraw();
  if(scroll){var t=$('#aTicket').getBoundingClientRect();if(t.top<70||t.top>innerHeight*.75)$('#aTicket').scrollIntoView({behavior:'smooth',block:'center'})}
}
function aeroFocusDraw(){
  var a=aeroBy(S.aero.id),y=S.aero.year,nat=A[LY].media_real,a25=a.anual[LY],p22=a.anual[2022][1],sm=S.aero.smooth;
  var rank=D.aero.slice().sort(function(p,q){return q.anual[LY][0]-p.anual[LY][0]}).map(function(x){return x.icao}).indexOf(a.icao)+1;
  var cmp=a25[1]?a25[1]/nat-1:null,vr=(a25[1]&&p22)?a25[1]/p22-1:null;
  $('#aTicket').innerHTML='<div class="tk-main"><h3>'+esc(a.nome)+'</h3><p>Assentos vendidos com origem neste aeroporto. Código ICAO: '+a.icao+'.</p></div>'+
    '<div class="tk-stub"><div><div class="v">'+(a25[1]?brl(a25[1]):'—')+'</div><div class="l">tarifa real média em '+LY+'</div></div>'+
    '<div><div class="cmp '+(cmp==null?'':cmp>0?'up':'dn')+'">'+(cmp==null?'—':pcs(cmp,0)+' vs. Brasil')+'</div><div class="l">média nacional: '+brl(nat)+'</div></div>'+
    '<div><div class="cmp">'+(vr==null?'—':pcs(vr,0))+'</div><div class="l">variação real 2022 a '+LY+' · '+mil(a25[0])+' assentos em '+LY+' (#'+rank+')</div></div></div>';
  var rr=realS(a.n),nat72=realS(NAC.media),sv=sm?wma(rr,a.a,12):rr,nv=sm?wma(nat72,NAC.a,12):nat72;
  $('#aLegend').innerHTML='<span class="lg"><i class="sw"></i>'+esc(a.nome)+'</span><span class="lg"><i class="sw dash"></i>Média nacional</span>';
  timeChart($('#aChart'),{series:[{color:'var(--nom)',vals:nv,dash:'6 5',width:2},{color:'var(--sig)',vals:sv,width:3}],h:hostHint()?220:270,
    yFmt:function(v){return 'R$\u00a0'+nf0.format(v)},bars:{vals:a.a,label:'Assentos vendidos por mês',fmt:function(v){return v>=1e6?nfd(1).format(v/1e6)+' mi':(v>=1000?nf0.format(v/1000)+' mil':nf0.format(v))},color:'var(--sig)'},
    tip:function(i){var t='<b>'+lab(i)+(sm?' (12 meses)':'')+'</b>';t+=trow('var(--sig)','Neste aeroporto',sv[i]==null?'sem vendas':brl(sv[i]));t+=trow('','Média nacional',nv[i]==null?'—':brl(nv[i]));if(a.a[i])t+=trow('','Assentos no mês',nf0.format(a.a[i]));return t}});
  /* mix de companhias por ano */
  var cols={TAM:'var(--tam)',GLO:'var(--glo)',AZU:'var(--azu)',ONE:'var(--one)',OUT:'var(--out)'};
  $('#aMix').innerHTML=YEARS.map(function(yr){var e=a.emp[yr],tot=0,k;for(k in e)tot+=e[k][0];
    return '<div class="brow"><div class="by">'+yl(yr)+'</div><div class="bbar">'+EMP.map(function(c){var v=tot&&e[c.k]?e[c.k][0]/tot:0;return '<div class="bseg" style="flex:'+(v*100).toFixed(2)+' 1 0;background:'+cols[c.k]+';color:#fff" title="'+yr+', '+c.n+': '+pc(v)+'">'+(v>=.08?pc(v,0):'')+'</div>'}).join('')+'</div></div>'}).join('');
  var e=a.emp[y],tb='<thead><tr><th>Companhia</th><th>Assentos</th><th>Tarifa média real</th><th>vs. média do aeroporto</th></tr></thead><tbody>',totS=0,k;
  for(k in e)totS+=e[k][0];
  var ap=a.anual[y][1];
  EMP.slice(0,4).forEach(function(c){var x=e[c.k];if(!x||(!x[0]&&c.k==='ONE'))return;tb+='<tr><td><span class="who"><i style="background:'+c.c+'"></i>'+c.n+'</span></td><td>'+(totS?pc(x[0]/totS,0):'—')+'</td><td>'+(x[0]>=200&&x[1]!=null?brl(x[1]):'—')+'</td><td>'+(x[0]>=200&&x[1]!=null&&ap?pcs(x[1]/ap-1,0):'—')+'</td></tr>'});
  $('#aFares').innerHTML=tb+'</tbody>';
  $('#aFaresH').textContent='Companhias neste aeroporto em '+yl(y);
}

/* ============ tema, navegação, arranque ============ */
function applyTheme(t){if(t)document.documentElement.setAttribute('data-theme',t);else document.documentElement.removeAttribute('data-theme')}
try{var saved=localStorage.getItem('tarifas-tema');if(saved)applyTheme(saved)}catch(e){}
$('#theme').onclick=function(){
  var cur=document.documentElement.getAttribute('data-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'),nx=cur==='dark'?'light':'dark';
  applyTheme(nx);try{localStorage.setItem('tarifas-tema',nx)}catch(e){}
};
$('#heroMetric').querySelectorAll('button').forEach(function(b){b.onclick=function(){S.hero.metric=b.dataset.v;$('#heroMetric').querySelectorAll('button').forEach(function(x){x.setAttribute('aria-pressed',x===b)});heroDraw()}});
$('#heroSmooth').onclick=function(){S.hero.smooth=!S.hero.smooth;this.setAttribute('aria-pressed',S.hero.smooth);heroDraw()};
$('#rSmooth').onclick=function(){S.route.smooth=!S.route.smooth;this.setAttribute('aria-pressed',S.route.smooth);routeDraw()};
$('#aSmooth').onclick=function(){S.aero.smooth=!S.aero.smooth;this.setAttribute('aria-pressed',S.aero.smooth);aeroFocusDraw()};
$('#rfind').oninput=function(){S.route.q=noAcc(this.value.trim());routeTable()};

function drawAll(){heroDraw();seasonDraw();distDraw();shareDraw();empLines();routeDraw();caseDraw();mapDraw();aeroFocusDraw()}
heroText();heroLegend();seasonChips();bandsDraw();distChips();empText();empTable();empMetric();routeSelect();routeTable();caseTabs();aeroSelect();aeroDraw();
[].slice.call(document.querySelectorAll('.baseLbl')).forEach(function(e){e.textContent=BASE});
$('#mArq').textContent=D.meta.arquivos;$('#mPer').textContent=D.meta.inicio+' a '+D.meta.fim;
$('#mIpca').textContent=Object.keys(D.meta.ipca_anual).map(function(y){return y+': '+nfd(2).format(D.meta.ipca_anual[y])+'%'}).join('; ');
$('#cov').textContent=pc(D.rotas.reduce(function(s,r){return s+r.tot},0)/D.meta.total_assentos,1);
$('#nRotas').textContent=D.rotas.length;
$('#mLin').textContent=nf0.format(D.meta.linhas);
drawAll();
var rz;window.addEventListener('resize',function(){cancelAnimationFrame(rz);rz=requestAnimationFrame(drawAll)});
if('ResizeObserver' in window){var lw=0;new ResizeObserver(function(en){var w=Math.round(en[0].contentRect.width);if(w!==lw){lw=w;cancelAnimationFrame(rz);rz=requestAnimationFrame(drawAll)}}).observe($('#heroChart'))}
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(function(){drawAll()});

/* item ativo na navegação */
var links=[].slice.call(document.querySelectorAll('#nav a'));
if('IntersectionObserver' in window){
  var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){links.forEach(function(a){a.setAttribute('aria-current',a.getAttribute('href')==='#'+e.target.id?'true':'false')})}})},{rootMargin:'-30% 0px -60% 0px'});
  document.querySelectorAll('section[data-nav]').forEach(function(s){io.observe(s)});
}
})();
