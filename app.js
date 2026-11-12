const $ = selector => document.querySelector(selector);
const workspace = $('#workspace');
const dialog = $('#dialog');
const names = {explore:'環遊地圖',compare:'風土選集',air:'怎麼飛',knowledge:'知識專題'};
const kinds = ['產地','店家','茶園','茶具','文化體驗','交通節點'];
const statuses = ['已確認','待查證'];
const regions = new Map([['日本','japan'],['臺灣','taiwan'],['中國','china']]);
const regionClass = country => regions.has(country) ? ' region-'+regions.get(country) : '';
const convenience = ['直飛＋短程接駁','直飛＋跨城轉乘','需轉機','待評估'];
let model, selected = {group:'records',id:'otani'};
let category = '窯燒', mode = 'map', showAir = true;
let filters = {query:'',country:'',kiln:'',tea:'',convenience:'',kind:''};
let map, mapMarkers, mapView;
let visibleMapRows = [];
const h = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const unique = values => [...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-Hant'));
const route = () => Object.hasOwn(names,location.hash.slice(1)) ? location.hash.slice(1) : 'explore';
const find = (group,id) => model[group]?.find(row=>row.id===id);
const activeRows = group => model[group];
const badge = (value,cls='') => '<span class="badge '+(value==='待查證'?'pending':cls)+'">'+h(value)+'</span>';
function link(url,label='資料來源 ↗') {
  try {
    const parsed = new URL(url);
    if (['https:','http:'].includes(parsed.protocol)) return '<a class="source" href="'+h(parsed.href)+'" target="_blank" rel="noopener noreferrer">'+h(label)+'</a>';
  } catch {}
  return '';
}
const cardLinks = row => row.links ?? (row.url ? [{label:'官方／店家連結',url:row.url}] : []);
const sourceUpdate = row => row.sourceUpdate ?? [row.source,row.date && '更新日期 '+row.date].filter(Boolean).join('\n');
const plainText = value => h(value).replace(/\r?\n/g,'<br>');
function cardReferences(row) {
  const links = cardLinks(row).map(item=>link(item.url,item.label||item.url)).join('');
  const source = sourceUpdate(row);
  return (links?'<h4>相關連結</h4><div class="inline">'+links+'</div>':'')+
    (source?'<h4>資料來源與更新</h4><p>'+plainText(source)+'</p>':'');
}
const button = (action,label,extra='',cls='secondary') => '<button type="button" class="'+cls+'" data-act="'+action+'" '+extra+'>'+h(label)+'</button>';
const attr = (group,id) => 'data-group="'+h(group)+'" data-id="'+h(id)+'"';
const empty = text => '<div class="empty">'+h(text)+'</div>';
const section = (title,desc='',actions='') => '<div class="section-head"><div><h2>'+h(title)+'</h2>'+(desc?'<p class="meta">'+h(desc)+'</p>':'')+'</div><div class="actions">'+actions+'</div></div>';
const tab = (action,key,label,active) => '<button type="button" data-act="'+action+'" data-value="'+h(key)+'" class="'+(active?'active':'')+'" aria-pressed="'+active+'">'+h(label)+'</button>';
const option = (value,label,checked) => '<option value="'+h(value)+'"'+(checked?' selected':'')+'>'+h(label)+'</option>';
const title = (row,group) => group==='flights' ? row.origin+' → '+row.airport : row.name;
const airportLabel = id => id+' · '+(find('airports',id)?.name || '');
const locationText = row => [row.country,row.location].filter(Boolean).join(' · ');
const summary = row => [row.category,row.kind,row.kiln,row.tea].filter(Boolean).join(' / ');
function toolbar(showKind=true) {
  const select = (key,label,options) => '<select data-filter="'+key+'" aria-label="'+label+'">'+option('',label,!filters[key])+options.map(o=>option(o,o,filters[key]===o)).join('')+'</select>';
  return '<div class="toolbar"><div class="toolbar-top"><div class="tabs" aria-label="資料主題">'+['窯燒','茶葉','全部'].map(c=>tab('category',c,c==='茶葉'?'茶種':c,category===c)).join('')+'</div><div class="actions">'+(route()==='explore'?'<div class="tabs" aria-label="檢視方式">'+tab('mode','map','◎ 地圖',mode==='map')+tab('mode','list','▤ 資料卡',mode==='list')+'</div>':'')+button('reset','清除篩選')+'</div></div><div class="filters"><input data-filter="query" type="search" aria-label="搜尋資料" placeholder="搜尋產地、產品或地名" value="'+h(filters.query)+'">'+select('country','國家',unique(activeRows('records').map(r=>r.country)))+select('kiln','窯燒類型',unique(activeRows('records').map(r=>r.kiln)))+select('tea','茶種類型',unique(['綠茶','紅茶','烏龍茶','白茶','黃茶','黑茶',...activeRows('records').map(r=>r.tea)]))+select('convenience','交通方式',convenience)+(showKind?select('kind','資料類型',kinds):'')+'</div></div>';
}
function results(producing=false) {
  const query = filters.query.toLowerCase().trim();
  return activeRows('records').filter(r => (!producing || ['產地','茶園'].includes(r.kind)) &&
    (category==='全部'||r.category===category) &&
    ['country','kiln','tea','convenience','kind'].every(key => !filters[key] || filters[key]===r[key]) &&
    (!query || [r.name,r.country,r.location,r.kiln,r.tea,r.features,r.description,r.products,r.notes,r.transport,...r.airports.map(airportLabel)].join(' ').toLowerCase().includes(query)));
}
function visitStatus(row) {
  return badge(row.visited ? 'Tony去過' : 'Tony還沒去過', row.visited ? '' : 'neutral');
}
function recordCard(r,group='records') {
  const id = attr(group,r.id);
  return '<article class="record-card'+(group==='records'?regionClass(r.country):'')+'"><div class="inline">'+badge(r.status)+(group==='records'?badge(r.kind,'neutral'):'')+'</div><h3>'+button('detail',title(r,group),id,'link-button')+'</h3><div class="meta">'+h(group==='flights'?r.airline:locationText(r))+'</div><p>'+h(r.products||r.description||r.kind||r.id)+'</p><div class="actions">'+button('detail','查看資料',id)+(group==='records'?visitStatus(r):'')+'</div></article>';
}
function detail(group,id) {
  const r = find(group,id);
  if (!r) return empty('點選地圖標記或資料卡查看詳細資料。');
  const parent = r.parent ? find('records',r.parent) : null;
  const children = activeRows('records').filter(row=>row.parent===r.id);
  const linkedAirports = group==='records' ? r.airports : group==='airports' ? [id] : [];
  const flights = model.flights.filter(f=>linkedAirports.includes(f.airport));
  const relatedPlaces = group==='airports' ? activeRows('records').filter(row=>['產地','茶園'].includes(row.kind)&&row.airports.includes(id)) : [];
  const segment = (heading,value) => value ? '<h4>'+heading+'</h4><p>'+h(value)+'</p>' : '';
  const detailRow = (g,row,label,sub) => '<div class="row"><span>'+button('detail',label,attr(g,row.id),'link-button')+(sub?'<br><small class="meta">'+h(sub)+'</small>':'')+'</span>'+badge(row.status)+'</div>';
  return '<div class="detail-body'+(group==='records'?regionClass(r.country):'')+'"><div class="inline">'+badge(r.status)+badge(group==='records'?summary(r):group==='airports'?id:r.kind,'neutral')+'</div><h3>'+h(title(r,group))+'</h3><div class="meta">'+h(group==='flights'?[r.airline,r.via&&'經 '+r.via].filter(Boolean).join(' · '):locationText(r))+'</div>'+(group==='records'?'<div class="actions">'+visitStatus(r)+'</div>':'')+
    segment('產地／場域介紹',r.description)+segment('窯業特色',r.features)+segment('代表產品',r.products)+
    (parent?'<h4>所屬產地</h4>'+button('detail',parent.name,attr('records',r.parent),'link-button'):'')+
    (children.length?'<h4>店家與文化體驗</h4><div class="detail-list">'+children.map(c=>detailRow('records',c,c.name,c.kind)).join('')+'</div>':'')+
    segment('從臺灣出發',r.transport)+
    (group==='records'&&linkedAirports.length?'<h4>關聯機場</h4><div class="detail-list">'+linkedAirports.map(code=>detailRow('airports',find('airports',code),airportLabel(code),'')).join('')+'</div>':'')+
    (flights.length?'<h4>臺灣出發航線</h4><div class="detail-list">'+flights.map(f=>detailRow('flights',f,f.origin+' → '+f.airport,f.kind+' · '+f.airline+(f.via?' · 經 '+f.via:''))).join('')+'</div>':'')+
    (relatedPlaces.length?'<h4>關聯產地</h4><div class="detail-list">'+relatedPlaces.map(p=>detailRow('records',p,p.name,p.location)).join('')+'</div>':'')+
    (group==='flights'&&find('airports',r.airport)?'<h4>抵達機場</h4>'+button('detail',airportLabel(r.airport),attr('airports',r.airport),'link-button'):'')+
    segment('備註',r.notes)+cardReferences(r)+'</div>';
}
const geo = row => row.lat!=='' && row.lng!=='' && row.lat!=null && row.lng!=null &&
  Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lng)) &&
  Math.abs(Number(row.lat))<=90 && Math.abs(Number(row.lng))<=180;
const mappedResults = () => filters.kind ? results() : results(true);
const asiaBounds = [[23,114],[38,141]];
function fitAtlas() {
  if(!map) return;
  const points=category==='窯燒' ? [] : mappedResults().filter(geo).map(row=>[Number(row.lat),Number(row.lng)]);
  map.fitBounds(points.length?points:asiaBounds,{padding:[24,24],maxZoom:8});
}
const labelZoom = 8;
const markerOffsets = [[0,0],[16,-16],[-16,-16],[16,16],[-16,16],[0,26],[0,-26],[30,0],[-30,0],[32,26],[-32,-26]];

const placeMarkerIcons = {
  kiln: '<path class="symbol-body" d="M3 21v-6a8 8 0 0 1 7-8V3h5v5a8 8 0 0 1 6 7v6Z"/>' +
    '<path class="symbol-detail" d="M9 21v-4a3 3 0 0 1 6 0v4"/>',
  tea: '<path class="symbol-body" d="M4 18C1 11 8 4 21 3c0 11-5 18-13 17l-4 2-1-2Z"/>' +
    '<path class="symbol-detail" d="M6 18 17 7m-7 7 1-4m2 1 4-1"/>'
};
function placeMarkerIcon(type) {
  return '<svg class="place-marker-symbol" viewBox="0 0 24 24" aria-hidden="true">' +
    placeMarkerIcons[type] + '</svg>';
}

function mapPanel(rows) {
  return '<div class="panel"><div class="panel-title"><h2>東亞產地分布</h2><small>'+rows.filter(geo).length+' 個地圖標記</small></div>'+
    '<div class="map"><div id="atlasMap" aria-label="東亞互動地圖"></div><div class="map-controls">'+button('map-reset','全圖','','icon')+'</div><span id="mapNotice" class="map-note" role="status" hidden></span></div>'+
    '<div class="legend"><span class="legend-key">'+Array.from(regions,([name,id])=>'<span><i class="dot region-'+id+'" aria-hidden="true"></i> '+name+'</span>').join('')+'</span><span class="legend-key"><span>'+placeMarkerIcon('kiln')+' 窯燒</span><span>'+placeMarkerIcon('tea')+' 茶種</span><span><i class="dot air" aria-hidden="true"></i> 機場</span><span><i class="dot pending" aria-hidden="true"></i> 待查證</span></span><label><input id="showAir" type="checkbox" '+(showAir?'checked':'')+'> 顯示機場</label></div></div>';
}
function drawMap(rows) {
  visibleMapRows=rows;
  if(!mapMarkers) return;
  mapMarkers.clearLayers();
  const candidates = rows.filter(geo).map(row=>[row,'records']).concat(
    showAir ? model.airports.filter(geo).map(row=>[row,'airports']) : []);
  const occupied=[];
  for(const [row,group] of candidates) {
    const point=[Number(row.lat),Number(row.lng)];
    const projected=map.project(point);
    const [dx,dy]=markerOffsets.find(([x,y])=>occupied.every(([a,b])=>Math.hypot(projected.x+x-a,projected.y+y-b)>=21)) ?? markerOffsets[0];
    occupied.push([projected.x+dx,projected.y+dy]);
    const airport=group==='airports';
    const markerType=airport?'airport':row.category==='茶葉'?'tea':'kiln';
    const active=selected?.id===row.id && selected.group===group;
    const label=airport?airportLabel(row.id):row.name;
    const icon=L.divIcon({
      className:'atlas-map-pin '+markerType+
        (airport?'':regionClass(row.country))+(active?' selected':'')+(row.status==='待查證'?' pending':''),
      html:airport?'<span aria-hidden="true">✈︎</span>':placeMarkerIcon(markerType),
      iconSize:[20,20],iconAnchor:[10-dx,10-dy],tooltipAnchor:[dx,dy]
    });
    const tooltipText=document.createElement('span');
    tooltipText.textContent=label;
    const marker=L.marker(point,{icon,zIndexOffset:active?500:0})
      .bindTooltip(tooltipText,{
        permanent:map.getZoom()>=labelZoom,
        direction:'top',offset:[0,-10],className:'atlas-point-label'
      })
      .addTo(mapMarkers);
    const element=marker.getElement();
    element.setAttribute('role','button');
    element.setAttribute('aria-label',label);
    element.setAttribute('aria-pressed',String(active));
    marker.on('click',()=>{
      selected={group,id:row.id};
      $('#detailContent').innerHTML=detail(group,row.id);
      const panel=$('#detailPanel');
      panel.scrollTop=0;
      if(window.matchMedia('(max-width: 760px)').matches) panel.scrollIntoView({block:'start'});
      mapMarkers.eachLayer(pin=>{
        const activePin=pin===marker;
        if(!pin.getElement()?.classList.contains('atlas-map-pin')) return;
        pin.getElement().classList.toggle('selected',activePin);
        pin.getElement().setAttribute('aria-pressed',String(activePin));
        pin.setZIndexOffset(activePin?500:0);
      });
    });
    element.addEventListener('keydown',event=>{
      if(event.key===' ') {event.preventDefault();marker.fire('click');}
    });
    if(dx||dy) {
      const anchor=map.unproject(projected.add([dx,dy]));
      L.polyline([point,anchor],{color:'#54665c',weight:1,opacity:.7,interactive:false}).addTo(mapMarkers);
    }
  }
}
function bindMap(rows) {
  const node=$('#atlasMap');
  const notice=$('#mapNotice');
  if(!window.L) {
    notice.textContent='地圖元件載入失敗，請重新整理，或切換至資料卡。';
    notice.hidden=false;
    return;
  }
  map=L.map(node,{minZoom:2,maxZoom:19,scrollWheelZoom:false,worldCopyJump:true});
  map.attributionControl.setPrefix(false);
  map.zoomControl.getContainer().querySelector('.leaflet-control-zoom-in').setAttribute('aria-label','放大');
  map.zoomControl.getContainer().querySelector('.leaflet-control-zoom-out').setAttribute('aria-label','縮小');
  if(mapView) map.setView(mapView.center,mapView.zoom);
  else fitAtlas();
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom:19,
    attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).on('tileerror',()=>{
    const message=$('#mapNotice');
    if(message){message.textContent='部分 OpenStreetMap 圖磚暫時無法載入。';message.hidden=false;}
  }).on('loading',()=>{
    const message=$('#mapNotice');
    if(message) message.hidden=true;
  }).addTo(map);
  mapMarkers=L.layerGroup().addTo(map);
  map.on('zoomend',()=>drawMap(visibleMapRows));
  drawMap(rows);
}
function table(headers,rows) {
  return rows.length?'<div class="panel table-wrap"><table class="data-table"><thead><tr>'+headers.map(c=>'<th scope="col">'+h(c)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(cell=>'<td>'+cell+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>': '<div class="panel">'+empty('目前沒有符合條件的資料。')+'</div>';
}
function explore() {
  const rows=results(), mapped=filters.kind ? rows : rows.filter(r=>['產地','茶園'].includes(r.kind));
  if (selected?.group==='records' && !rows.some(r=>r.id===selected.id)) selected = mapped[0] ? {group:'records',id:mapped[0].id} : null;
  if (!selected && mapped[0]) selected={group:'records',id:mapped[0].id};
  const cards = rows.length ? '<div class="cards">'+rows.map(r=>recordCard(r)).join('')+'</div>' : '<div class="panel">'+empty('目前沒有符合條件的資料。')+'</div>';
  if(mode==='list') return toolbar()+section('資料卡',rows.length+' 筆')+cards;
  return toolbar()+'<div class="map-layout">'+mapPanel(mapped)+'<div class="panel detail" id="detailPanel"><div class="panel-title"><h2>旅遊指南</h2></div><div id="detailContent">'+detail(selected?.group,selected?.id)+'</div></div></div>'+section('目前資料',rows.length+' 筆，包含產地與關聯場域')+cards;
}
const comparisonIds = new Set();
const comparisonLimit = 3;
const comparisonRows = () => [...comparisonIds].map(id=>find('records',id)).filter(row=>row&&!row.trashedOn);
function canCompare(row, rows) {
  return comparisonIds.has(row.id) || (rows.length<comparisonLimit && (!rows.length || rows[0].category===row.category));
}
function compare() {
  const rows=results(true);
  const chosen=comparisonRows();
  const selectedNames=chosen.map(r=>r.name).join('、');
  const actions=button('show-comparison','並排比較','aria-disabled="'+(chosen.length<2)+'"'+(chosen.length<2?' disabled':''),'primary')+
    (chosen.length?button('clear-comparison','清除選取'):'');
  return section('風土選集','瀏覽產地與茶園，可選同類別的兩至三筆並排比較。')+toolbar(false)+
    section('已選 '+chosen.length+'／'+comparisonLimit+' 筆',selectedNames,actions)+
    table(['名稱','國家／地區','工藝／茶類','代表產品','關聯機場','交通便利性','查證狀態','比較'],rows.map(r=>[
      button('detail',r.name,attr('records',r.id),'link-button')+'<br><small class="meta">'+h(r.location)+'</small>',
      h(r.country),h(r.kiln||r.tea||'待補'),h(r.products||'待補'),
      r.airports.map(code=>button('detail',code,attr('airports',code),'link-button')).join(' '),h(r.convenience||'待評估'),badge(r.status),
      '<input type="checkbox" data-compare-id="'+h(r.id)+'" aria-label="比較 '+h(r.name)+'"'+
        (comparisonIds.has(r.id)?' checked':'')+(canCompare(r,chosen)?'':' disabled')+'>'
    ]));
}
function showComparison() {
  const rows=comparisonRows();
  if(rows.length<2) return;
  const fields=[
    ['國家／地區',r=>locationText(r)],
    ['工藝／茶類',r=>r.kiln||r.tea],
    ['代表產品',r=>r.products],
    ['特色／介紹',r=>[r.features,r.description].filter(Boolean).join('\n')],
    ['從臺灣出發',r=>r.transport],
    ['關聯機場',r=>r.airports.map(airportLabel).join('、')],
    ['交通便利性',r=>r.convenience],
    ['查證狀態',r=>r.status],
    ['資料來源與更新',sourceUpdate]
  ];
  const body=table(['比較項目',...rows.map(r=>r.name)],fields.map(([label,get])=>[
    h(label),...rows.map(r=>plainText(get(r)||'—'))
  ]));
  showDialog('並排比較',body);
}
function knowledge() {
  return section('知識專題')+'<div class="cards">'+
    '<article class="record-card"><h3>製茶入門：綠茶與紅茶</h3>'+
    '<p>綠茶在製程前段透過殺菁抑制酵素活性。紅茶先萎凋、揉捻，讓茶葉充分氧化，再乾燥。閱讀製程時，可以先看加熱出現在什麼階段。</p>'+
    link('https://www.tbrs.gov.tw/ws.php?id=5273&print=Y','茶及飲料作物改良場：特色茶分類與加工製程 ↗')+'</article>'+
    '<article class="record-card"><h3>陶瓷入門：從成形到出窯</h3>'+
    '<p>陶土經過成形，可以再做表面裝飾或上釉，最後進窯燒成。電窯、瓦斯窯和柴燒都是可進一步認識的燒成方式。</p>'+
    link('https://www.culture.ntpc.gov.tw/files/file_pool/2/0O148645332741653967/%E9%99%B6%E5%8D%9A%E9%A4%A8%E6%95%99%E5%85%B7%E7%B8%BD%E6%B8%85%E5%96%AE-%E5%90%AB%E6%95%99%E6%A1%88%E9%80%A3%E7%B5%902024.5%E7%89%88.pdf','鶯歌陶瓷博物館：陶瓷教具與教案 ↗')+'</article></div>';
}
function air() {
  return section('怎麼飛','查看從臺灣出發的航線及機場周邊產地。')+
    table(['機場','所在地','臺灣出發航線','關聯產地／茶園','機場資料'],model.airports.map(r=>[
      button('detail',airportLabel(r.id),attr('airports',r.id),'link-button'),h(locationText(r)),
      model.flights.filter(f=>f.airport===r.id).map(f=>button('detail',f.origin+' · '+f.kind+' · '+f.airline+(f.via?' · 經 '+f.via:''),attr('flights',f.id),'link-button')+' '+badge(f.status)).join('<br>')||'—',
      activeRows('records').filter(p=>p.airports.includes(r.id)&&['產地','茶園'].includes(p.kind)).map(p=>button('detail',p.name,attr('records',p.id),'link-button')).join(' · ')||'—',badge(r.status)
    ]))+section('航線查證','航線狀態和機場資料狀態各自標記。航空公司為首批盤點，請依日期查核。')+
    table(['出發 → 抵達','方式','轉機點','航空公司','狀態','資料來源與更新'],model.flights.map(r=>[button('detail',title(r,'flights'),attr('flights',r.id),'link-button'),h(r.kind),h(r.via||'—'),h(r.airline),badge(r.status),plainText(sourceUpdate(r))]));
}
function render(keepSearch=false) {
  if (!model) return;
  const selection = keepSearch ? $('[data-filter="query"]')?.selectionStart : null;
  const page=route();
  $('#hero').hidden=page!=='explore';
  $('#pageContext').hidden=page==='explore';
  $('#crumb').textContent=names[page];
  for(const a of document.querySelectorAll('.site-nav a')) {
    const active=a.hash==='#'+page;
    a.classList.toggle('active',active);
    if(active) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current');
  }
  const showMap=page==='explore'&&mode==='map';
  const existingMap=map?.getContainer();
  const existingNotice=map ? $('#mapNotice') : null;
  if(map&&!showMap) {
    mapView={center:map.getCenter(),zoom:map.getZoom()};
    map.remove();
    map=null;
    mapMarkers=null;
  }
  workspace.innerHTML=({explore,compare,air,knowledge})[page]();
  if(showMap&&existingMap) {
    $('#atlasMap').replaceWith(existingMap);
    $('#mapNotice').replaceWith(existingNotice);
    map.invalidateSize({pan:false});
    drawMap(mappedResults());
  } else if(showMap) bindMap(mappedResults());
  if(keepSearch) {
    const search=$('[data-filter="query"]');
    search?.focus();
    if(selection!==null&&selection!==undefined) search?.setSelectionRange(selection,selection);
  }
}
function showDialog(title,body) {
  dialog.innerHTML='<header class="modal-head"><h2 id="dialogTitle">'+h(title)+'</h2>'+button('close','✕','aria-label="關閉"','icon')+'</header>'+body;
  dialog.setAttribute('aria-labelledby','dialogTitle');
  if(!dialog.open) dialog.showModal();
  dialog.scrollTop=0;
}
function openDetail(group,id) {
  const r=find(group,id);
  if(r) showDialog('資料詳情',detail(group,id));
}
document.addEventListener('click',event=>{
  const control=event.target.closest('[data-act]');
  if(!control || !model) return;
  const {act,group,id,value}=control.dataset;
  switch(act) {
    case 'close': dialog.close(); break;
    case 'show-comparison': showComparison(); break;
    case 'clear-comparison': comparisonIds.clear(); render(); break;
    case 'detail': openDetail(group,id); break;
    case 'reset': for(const key of Object.keys(filters)) filters[key]=''; render(); fitAtlas(); break;
    case 'category': category=value; filters.kiln=''; filters.tea=''; filters.kind=''; selected=null; render(); fitAtlas(); break;
    case 'mode': mode=value; render(); break;
    case 'map-reset': fitAtlas(); break;
  }
});
workspace.addEventListener('input',event=>{
  if(event.target.dataset.filter!=='query'||event.isComposing)return;
  filters.query=event.target.value;render(true);
});
workspace.addEventListener('compositionend',event=>{
  if(event.target.dataset.filter==='query'){filters.query=event.target.value;render(true);}
});
workspace.addEventListener('change',event=>{
  const compareId=event.target.dataset.compareId;
  if(compareId) {
    const row=find('records',compareId);
    if(!event.target.checked) comparisonIds.delete(compareId);
    else if(row&&!row.trashedOn&&canCompare(row,comparisonRows())) comparisonIds.add(compareId);
    render();
    const replacement=[...workspace.querySelectorAll('[data-compare-id]')].find(input=>input.dataset.compareId===compareId);
    replacement?.focus({preventScroll:true});
    return;
  }
  if(event.target.id==='showAir') {showAir=event.target.checked;render();return;}
  const key=event.target.dataset.filter;
  if(key && key!=='query') {filters[key]=event.target.value;render();if(category!=='窯燒'&&['country','tea'].includes(key))fitAtlas();}
});
window.addEventListener('hashchange',()=>{filters.kind='';render();window.scrollTo(0,0);});
async function start() {
  try {
    const response = await fetch('./atlas.json');
    if (!response.ok) throw new Error('無法讀取資料');
    model = await response.json();
    render();
  } catch {
    workspace.textContent = '無法載入資料，請重新整理。';
  }
}
start();
