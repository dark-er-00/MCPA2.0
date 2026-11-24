/* Presentation only. Counts and units come from the authenticated report. */
(function(scope){
  'use strict';
  const {escape:E,format}=scope.MCPAConsumablesRequests;
  function bars(rows, metric, empty) {
    if(!rows.length)return '<p class="wa-chart-empty">'+E(empty)+'</p>';
    const peak=rows.reduce((max,row)=>Math.max(max,row.value),1);
    return '<ol class="wa-bars">'+rows.slice(0,5).map(row=>{
      const tip=row.label+' · '+format(row.value)+' '+metric;
      return `<li tabindex="0" title="${E(tip)}" aria-label="${E(tip)}"><span>${E(row.label)}</span><strong>${format(row.value)}</strong><i aria-hidden="true" style="--fill:${100*row.value/peak}%"></i></li>`;
    }).join('')+'</ol>'+(rows.length>5?'<p>Top 5 of '+format(rows.length)+'</p>':'');
  }
  function axis(label){
    if(label.length===13)return label.slice(-2)+':00';
    const monthly=label.length===7;
    const t=new Date(label+(monthly?'-01':'')+'T12:00:00Z');
    return t.toLocaleDateString('en-PH',{timeZone:'UTC',month:'short',...(monthly?{year:'2-digit'}:{day:'numeric'})});
  }
  function line(points,metric,empty){
    const total=points.reduce((n,p)=>n+p.value,0);
    if(!total)return '<p class="wa-chart-empty">'+E(empty)+'</p>';
    const max=Math.max(...points.map(p=>p.value)),w=640,h=128;
    const coords=points.map((p,i)=>({x:points.length===1?w/2:8+i*(w-16)/(points.length-1),y:h-10-p.value*(h-22)/max}));
    const path=coords.map(({x,y},i)=>(i?'L':'M')+x+' '+y).join(' ');
    const marks=points.map((p,i)=>{
      const {x,y}=coords[i],label=p.label.replace('T',' ')+(p.label.length===13?':00':'')+' · '+format(p.value)+' '+metric;
      return `<g tabindex="0" role="img" aria-label="${E(label)}" data-chart-tip="${E(label)}"><title>${E(label)}</title><circle class="wa-hit" cx="${x}" cy="${y}" r="10"/><circle class="wa-dot" cx="${x}" cy="${y}" r="3"/></g>`;
    }).join('');
    const axisPoints=[...new Set([0,Math.floor((points.length-1)/2),points.length-1])];
    return `<figure class="wa-plot" aria-label="${format(total)} ${E(metric)}"><div class="wa-plot-readout" aria-live="off">${format(max)} peak</div><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="group" aria-label="${E(metric)} over time"><path class="wa-gridline" d="M0 12H640 M0 65H640 M0 118H640"/><path class="wa-area" d="${path} L${coords.at(-1).x} ${h} L${coords[0].x} ${h} Z"/><path class="wa-line" d="${path}"/>${marks}</svg><figcaption>${axisPoints.map(i=>'<span>'+E(axis(points[i].label))+'</span>').join('')}</figcaption></figure>`;
  }
  scope.MCPAMaterialCharts={bars,line};
})(globalThis);
