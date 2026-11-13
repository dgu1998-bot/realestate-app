const $ = id => document.getElementById(id);
const staticHosting = location.hostname.endsWith('.github.io');
const kinds = ['매매','전세','월세'];
const districts = '하양읍 진량읍 압량읍 와촌면 자인면 용성면 남산면 남천면 삼북동 삼남동 서상동 신교동 상방동 백천동 옥곡동 옥산동 사정동 정평동 중산동 중방동 계양동 사동 평산동 점촌동 여천동 유곡동 신천동 갑제동 조영동 대동 임당동 대평동 대정동 소룡동 내동 남방동 내리동'.split(' ');
const sampleListings = [
  {name:'펜타힐즈더샵2차',dong:'중산동',jibun:'655',area:84.98,kind:'매매',amount:48500,note:'중산동 아파트 상담 예시'},
  {name:'중산자이1단지',dong:'중산동',area:84.95,kind:'전세',amount:34000,note:'전용 84㎡ 전세 상담 예시'},
  {name:'경산아이파크',dong:'압량읍 신대리',area:84.96,kind:'매매',amount:39000,note:'압량읍 신축 단지 상담 예시'},
  {name:'팰리스부영2단지',dong:'사동',area:84.9,kind:'월세',amount:3000,monthly:75,note:'사동 월세 상담 예시'},
].map((v,i)=>({...v,id:'sample-'+i,sample:true}));
const sampleComplexes = [...sampleListings,
  {name:'중방스타힐스',dong:'중방동',area:84.8,amount:37500},
  {name:'펜타힐즈푸르지오2차',dong:'중산동',area:84.95,amount:48000},
  {name:'경산하양금호어울림',dong:'하양읍 서사리',area:74.8,amount:28500},
  {name:'정평역하늘채리버파크',dong:'정평동',area:84.9,amount:45500},
  {name:'옥곡동부영우리마을',dong:'옥곡동',area:59.8,amount:20500},
  {name:'경산서희스타힐스',dong:'중방동',area:84.9,amount:36500},
];
const topics = [
  {title:'교통',icon:'↔',detail:'반경 2.8 km · 철도역과 버스 정류장', searches:['KTX역','도시철도역','버스정류장']},
  {title:'학군',icon:'□',detail:'주변 학교와 통학구역 확인', searches:['초등학교','중학교','고등학교']},
  {title:'상권·생활',icon:'▤',detail:'마트·백화점·카페·관공서', searches:['마트','백화점','카페','행정복지센터']},
  {title:'개발계획',icon:'◇',detail:'경산시 공고에서 대상지와 사업 단계를 확인하세요.', searches:[]},
];
const development = [
  {districts:['임당동','대평동','중방동'],name:'경산대임 공공주택지구',summary:'LH 업무·체육시설 및 상업용지 공급 공고',url:'https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancInfo.do?aisTpCd=01&ccrCnntSysDsCd=01&mi=1062&panId=BN-0007935&uppAisTpCd=01'},
  {districts:['진량읍'],name:'진량 선화지구',summary:'2026.10.19 지구단위계획 변경 고시 제2026-175호',url:'https://eum.go.kr/web/gs/gv/gvGosiList.jsp?area=&chrgorg=&enddt=&geul_yn=Y&gihyung_yn=&gosichrg=&gosino=&listSize=10&mobile_yn=&pageNo=36&selSggCd=&select2=&select3=&silsi_yn=&startdt=&zonenm='},
];
const $state = {kind:'매매',period:'monthly',dataMode:'loading',selected:null,rows:[],groups:[],expanded:false,run:0,detail:0};
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const maps = s => 'https://map.kakao.com/?q='+encodeURIComponent(s);
const number = new Intl.NumberFormat('ko-KR');
const amount = v => v>=10000 ? Math.floor(v/10000)+'억'+(v%10000?' '+number.format(v%10000)+'만':'') : number.format(v)+'만';
const price = row => row.kind==='월세' ? amount(row.amount)+' / '+amount(row.monthly) : amount(row.amount)+'원';
const day = d => d.toISOString().slice(0,10);
const shift = (d,n) => {const result=new Date(d);result.setUTCDate(result.getUTCDate()+n);return day(result);};
const today = new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
const keyOf = row => [row.dong,row.name,row.jibun??''].join('|');
function sampleRows(start,end,kind) {
  const rows=[];
  for (let date=start;date<=end;date=shift(date,1)) {
    const dayNumber=Math.floor(Date.parse(date)/86400000);
    sampleComplexes.forEach((apt,i)=>{
      if ((dayNumber+i*2+kinds.indexOf(kind))%(5+i)!==0) return;
      const offset=dayNumber%5;
      rows.push({...apt,kind,date,amount:kind==='매매'?apt.amount-offset*100:kind==='전세'?Math.round(apt.amount*.66/100)*100-offset*100:2000+i*500,
        monthly:kind==='월세'?65+i*4+offset:0,floor:8+offset,jibun:apt.jibun??''});
    });
  }
  return rows;
}
const sortDeals = rows => rows.sort((a,b)=>b.date.localeCompare(a.date)||b.amount-a.amount||b.monthly-a.monthly);
function group(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!map.has(key)) map.set(key,{...row,key,rows:[]});
    map.get(key).rows.push(row);
  }
  return [...map.values()].map(({rows,...apt})=>({...apt,rows:sortDeals(rows)})).sort((a,b)=>b.rows.length-a.rows.length||b.rows[0].date.localeCompare(a.rows[0].date)||a.name.localeCompare(b.name,'ko'));
}
async function api(path,args={}) {
  const res = await fetch('/api/'+path+'?'+new URLSearchParams(args));
  const data = await res.json();
  if (!res.ok) throw Error(data.error || '데이터를 읽지 못했습니다.');
  return data;
}
const setNotice = (str,alert=false) => {$('notice').textContent=str;$('notice').dataset.alert=alert;};
function renderDates() {
  const end=$('end').value||today;
  if ($state.period==='weekly') $('start').value=shift(end,-6);
  if ($state.period==='monthly') $('start').value=end.slice(0,7)+'-01';
  document.querySelectorAll('[data-period]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.period===$state.period));
}
function updateDistricts(rows) {
  const current=$('district').value;
  const names=new Set([...districts,...rows.map(row=>row.dong).filter(Boolean)]);
  $('district').innerHTML='<option value="">경산시 전체</option>'+[...names].sort((a,b)=>a.localeCompare(b,'ko')).map(s=>'<option>'+esc(s)+'</option>').join('');
  $('district').value=names.has(current)?current:'';
}
const scoped = rows => rows.filter(row=>!$('district').value || row.dong===$('district').value || row.dong.startsWith($('district').value+' '));
function refreshMarket() {
  const rows=scoped($state.rows);
  $state.groups=group(rows);
  $state.expanded=false;
  const {start,end,period}=$state.applied;
  $('marketSubtitle').textContent=($('district').value||'경산시 전체')+' · '+({weekly:'주간',monthly:'월간',custom:'직접 지정'})[period]+' '+start+' ~ '+end+' · 신고 건수 순';
  $('count').textContent=$state.dataMode==='error'?'—':number.format(rows.length)+'건';
  $('complexes').textContent=$state.dataMode==='error'?'—':$state.groups.length+'곳';
  $('countNote').textContent=$state.dataMode==='sample'?'예시 데이터 · 계약일 기준':'국토교통부 공개 신고 자료 · 계약일 기준';
  const medianField=$state.kind==='월세'?'monthly':'amount';
  const values=rows.map(r=>r[medianField]).sort((a,b)=>a-b);
  const middle=Math.floor(values.length/2);
  const median=values.length ? (values[middle]+values[Math.floor((values.length-1)/2)])/2 : null;
  $('medianTitle').textContent=({매매:'매매 중위가',전세:'전세 보증금 중위값',월세:'월 임대료 중위값'})[$state.kind];
  $('median').textContent=median===null?'—':amount(median)+'원';
  renderChart(rows);
  choose($state.groups[0]??null);
}
async function loadMarket() {
  const start=$('start').value,end=$('end').value;
  if (!start||!end||end<start||end>today||new Date(end)-new Date(start)>92*86400000) {
    setNotice('오늘까지의 날짜를 선택하세요. 한 번에 최대 93일을 조회할 수 있습니다.',true);
    return;
  }
  const run=++$state.run;
  const {kind,period}=$state;
  document.querySelectorAll('[data-kind]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.kind===kind));
  setNotice('조회 중…');
  $('modeLabel').textContent='데이터 확인 중';
  $('indexValue').textContent='—';
  $('indexNote').textContent='한국부동산원 · 월간';
  let config;
  try { config=staticHosting ? {molit:false,reb:false} : await api('config'); }
  catch {
    if (run!==$state.run) return;
    $state.dataMode='error';
    $state.rows=[];
    $state.applied={start,end,kind,period};
    $('modeLabel').textContent='서버 연결 실패';
    setNotice('로컬 서버에 연결할 수 없습니다. 대시보드 실행 창을 확인하고 다시 조회하세요.',true);
    refreshMarket();
    return;
  }
  if (run!==$state.run) return;
  if (config.reb) $('indexNote').removeAttribute('title');
  if (config.reb) api('index',{end}).then(({series})=>{
    if (run!==$state.run) return;
    const last=series.at(-1);
    $('indexValue').textContent=last.value.toFixed(2);
    $('indexNote').textContent=last.month.slice(0,4)+'.'+last.month.slice(4)+' · 한국부동산원';
  }).catch(e=>{if (run===$state.run) {$('indexNote').textContent='R-ONE 조회 실패';$('indexNote').title=e.message;}});
  else $('indexNote').textContent='한국부동산원 API 연결 필요';
  let rows=[],mode,message;
  try {
    if (config.molit) {
      ({rows}=await api('trades',{start,end,kind}));
      mode='live';
      message=rows.length?'최근 계약은 신고가 늦게 반영될 수 있습니다. 중위값은 면적과 층을 보정하지 않은 금액입니다.':'이 기간에 공개된 '+kind+' 계약이 없습니다. 종료일을 이전 날짜로 바꾸거나 더 넓은 기간을 조회하세요.';
    } else {
      rows=sampleRows(start,end,kind);
      mode='sample';
      message=staticHosting
        ? 'GitHub 공개판은 예시 데이터로 작동합니다. 실제 신고 자료는 저장소를 내려받아 로컬 서버에서 조회할 수 있습니다.'
        : '화면의 거래 금액과 건수는 예시입니다. 우측 상단 설정에서 API 키를 연결하면 실제 신고 자료를 조회합니다.';
    }
  } catch (e) {
    mode='error';
    message=e.message;
  }
  if (run!==$state.run) return;
  $state.rows=rows;
  $state.dataMode=mode;
  $state.applied={start,end,kind,period};
  $('modeLabel').textContent={sample:'예시 데이터',live:'공공데이터 연동',error:'실거래 조회 실패'}[mode];
  setNotice(message,mode==='error');
  updateDistricts(rows);
  refreshMarket();
}
function renderRank() {
  const groups=$state.groups;
  const visible=$state.expanded?groups:groups.slice(0,10);
  $('rankCount').textContent=groups.length+'개 단지';
  $('ranking').innerHTML=visible.map((apt,i)=>'<button class="rank" type="button" data-rank="'+i+'" aria-pressed="'+($state.selected?.key===apt.key)+'"><span class="num">'+(i+1)+'</span><span><strong>'+esc(apt.name)+'</strong><small>'+esc(apt.dong)+' · '+apt.rows.length+'건</small></span><span class="price">'+esc(price(apt.rows[0]))+'<small>최근 '+esc(apt.rows[0].date.slice(5).replace('-','.'))+'</small></span></button>').join('')||'<p class="empty">'+($state.dataMode==='error'?'조회에 실패했습니다. 날짜와 API 연결 상태를 확인해 주세요.':'선택 조건에서 확인된 단지가 없습니다.')+'</p>';
  $('expandRank').hidden=groups.length<=10;
  $('expandRank').textContent=$state.expanded?'Top 10만 보기':'거래 단지 '+groups.length+'곳 모두 보기 ＋';
}
function renderRecent(rows, kind, placeholder='조회 기준일 이전 120일 내 해당 거래를 찾지 못했습니다.', sample=false) {
  $('recent').innerHTML='<h4>최근 '+esc(kind)+(sample?' 계약 예시':' 실거래')+'</h4>'+ (rows.map(row=>'<div class="deal"><span>'+esc(row.date)+' · '+esc(row.area)+'㎡'+(row.floor?' · '+esc(row.floor)+'층':'')+'</span><strong>'+esc(price(row))+'</strong></div>').join('')||'<small>'+esc(placeholder)+'</small>');
}
function showMap(point) {
  const {lat,lon}=point;
  const bbox=[lon-.012,lat-.007,lon+.012,lat+.007].map(x=>x.toFixed(5)).join(',');
  const src='https://www.openstreetmap.org/export/embed.html?'+new URLSearchParams({bbox,layer:'mapnik',marker:lat+','+lon});
  $('map').innerHTML='<iframe title="선택한 단지 위치 지도" src="'+esc(src)+'" referrerpolicy="strict-origin-when-cross-origin"></iframe>';
}
function showAddressMap(apt) {
  const query='경상북도 경산시 '+apt.dong+' '+(apt.jibun||apt.name);
  const source='https://maps.google.com/maps?'+new URLSearchParams({q:query,z:'16',output:'embed'});
  $('map').innerHTML='<iframe title="선택 단지 주소 검색 지도" src="'+esc(source)+'" referrerpolicy="strict-origin-when-cross-origin"></iframe>';
}
const distance = (p, q) => {
  const radians = Math.PI/180;
  const a=Math.sin((p.lat-q.lat)*radians/2)**2+Math.cos(p.lat*radians)*Math.cos(q.lat*radians)*Math.sin((p.lon-q.lon)*radians/2)**2;
  return Math.round(12742000*Math.asin(Math.sqrt(a)));
};
function category(tags) {
  if (tags.highway==='bus_stop') return '버스';
  if (tags.railway) return tags.station==='subway'||tags.subway==='yes'?'도시철도':'철도';
  if (tags.amenity==='school') {
    const name=tags['name:ko']||tags.name;
    if (/초등학교|초등교/.test(name)) return '초등학교';
    if (/중학교/.test(name)) return '중학교';
    if (/고등학교/.test(name)) return '고등학교';
    return '학교';
  }
  return ({supermarket:'마트',department_store:'백화점',mall:'쇼핑몰'})[tags.shop]|| (tags.amenity==='cafe'?'카페':'관공서');
}
function renderLocation(apt, places=[], status='') {
  $('locationSubtitle').textContent=apt?apt.name+' · 경상북도 경산시 '+apt.dong:'단지를 선택하면 주변 정보를 표시합니다.';
  const topicGroups=[['철도','도시철도','버스'],['초등학교','중학교','고등학교','학교'],['마트','백화점','쇼핑몰','카페','관공서']];
  $('locationGrid').innerHTML=topics.map(({title,icon,detail,searches},i)=>{
    const nearby=topicGroups[i]?.flatMap(type=>places.filter(p=>p.type===type).slice(0,2))||[];
    const links=apt?searches.map(s=>'<a href="'+maps('경산시 '+apt.dong+' '+s)+'" target="_blank" rel="noopener">'+esc(s)+'</a>').join(' · '):'';
    const rows=nearby.map(p=>'<li><span>'+esc(p.name)+' <small class="muted">'+esc(p.type)+'</small></span><span>'+number.format(p.distance)+' m</span></li>').join('');
    const projects=i===3&&apt?development.filter(p=>p.districts.includes(apt.dong.split(' ')[0])).map(p=>'<p><a href="'+esc(p.url)+'" target="_blank" rel="noopener">'+esc(p.name)+'</a><br>'+esc(p.summary)+'</p>').join(''):'';
    const extra=i===3?'<a href="https://map.gbgs.go.kr/bm/gisMap.do" target="_blank" rel="noopener">경산시 도시개발 지도 ↗</a> · <a href="https://www.eum.go.kr/" target="_blank" rel="noopener">토지이음 ↗</a>':links;
    return '<article class="panel"><h3><span class="symbol">'+icon+'</span>'+title+'</h3><p>'+esc(detail)+'</p>'+(rows?'<ul>'+rows+'</ul><p>직선거리 · OpenStreetMap</p>':apt&&i!==3?'<p>'+esc(status||'등록된 주변 시설을 확인하지 못했습니다.')+'</p>':'')+(i===1&&apt?'<p><a href="https://schoolzone.emac.kr/" target="_blank" rel="noopener">학구도 안내서비스 ↗</a></p>':'')+projects+'<p>'+extra+'</p></article>';
  }).join('');
}
async function choose(apt, jump=false) {
  const token=++$state.detail;
  $state.selected=apt;
  renderRank();
  $('mapTitle').textContent=apt?.name??'단지 위치';
  $('mapAddress').textContent=apt?'경상북도 경산시 '+apt.dong+(apt.jibun?' '+apt.jibun:''):'';
  $('mapLink').hidden=!apt;
  $('map').innerHTML=apt?'':'<div>거래 단지 또는 추천매물을 선택하세요.</div>';
  if (!apt) {$('recent').innerHTML='';renderLocation(null);return;}
  $('mapLink').href=maps('경산시 '+apt.dong+' '+apt.name);
  showAddressMap(apt);
  renderLocation(apt,[],'주변 시설 확인 중…');
  if (jump) $('mapTitle').scrollIntoView({block:'center',behavior:'smooth'});
  const kind=apt.rows?$state.applied.kind:apt.kind;
  const end=$state.applied?.end||today;
  const args={name:apt.name,dong:apt.dong,jibun:apt.jibun??''};
  const fixture=$state.dataMode==='sample' && !jump;
  const canQuery=$state.dataMode==='live'||$state.dataMode==='error';
  renderRecent(apt.rows?.slice(0,4)??[],kind,canQuery?'조회 중…':'공공데이터포털 API를 연결하면 최근 계약을 확인할 수 있습니다.',fixture);
  if (!fixture && canQuery) api('recent',{...args,kind,end}).then(({rows})=>{
    if (token===$state.detail) renderRecent(rows,kind);
  }).catch(e=>{if (token===$state.detail && !apt.rows?.length) renderRecent([],kind,e.message);});
  let point;
  try { ({point}=await api('location',args)); } catch { point=null; }
  if (token!==$state.detail) return;
  if (!point) {
    $('mapAddress').textContent+=' · 주소 검색 위치';
    renderLocation(apt,[],'단지 좌표가 확인되면 주변 시설을 표시합니다.');
    return;
  }
  showMap(point);
  try {
    const {places}=await api('nearby',point);
    if (token!==$state.detail) return;
    const unique=new Map();
    for (const place of places.map(p=>({name:p.tags['name:ko']||p.tags.name,type:category(p.tags),distance:distance(point,p)})).sort((a,b)=>a.distance-b.distance)) {
      const key=place.type+place.name;
      if (!unique.has(key)) unique.set(key,place);
    }
    renderLocation(apt,[...unique.values()]);
  } catch {if (token===$state.detail) renderLocation(apt,[],'주변 시설을 불러오지 못했습니다. 지도에서 검색할 수 있습니다.');}
}
function renderChart(rows) {
  const {start,end}=$state.applied;
  const total=Math.round((new Date(end)-new Date(start))/86400000)+1;
  const interval=total>35?7:1;
  const bins=Array.from({length:Math.ceil(total/interval)},()=>0);
  for (const row of rows) bins[Math.floor((new Date(row.date)-new Date(start))/(86400000*interval))]++;
  const max=Math.max(...bins,1);
  $('chartNote').textContent=($('district').value||'경산시 전체')+' · '+$state.applied.kind+' · '+(interval===7?'7일 단위':'일별')+($state.dataMode==='sample'?' · 예시 데이터':'');
  $('chart').innerHTML=$state.dataMode==='error'?'<p class="empty">거래량을 불러오지 못했습니다.</p>':'<div class="bars" role="img" aria-label="조회 기간 거래 '+rows.length+'건">'+bins.map((v,i)=>'<div class="bin" title="'+shift(start,i*interval)+' · '+v+'건"><i style="height:'+Math.round(100*v/max)+'%"></i></div>').join('')+'</div><div class="chartLabels"><span>'+start+'</span><span>'+end+'</span></div>';
}
function userListings() {
  try { const value=JSON.parse(localStorage.getItem('gyeongsan-listings')||'[]');return Array.isArray(value)?value:[]; } catch {return [];}
}
function renderListings() {
  $('listings').innerHTML=[...sampleListings,...userListings()].map(v=>'<article class="panel listing"><button type="button" class="listingButton" data-listing="'+esc(v.id)+'"><span class="pill">'+esc(v.kind)+'</span>'+(v.sample?'<span class="pill">샘플</span>':'')+'<h3>'+esc(v.name)+'</h3><small>'+esc(v.dong)+' · 전용 '+esc(v.area)+'㎡</small><span class="price">'+esc(price(v))+'</span><p>'+esc(v.note)+'</p></button>'+(v.sample?'':'<button class="textButton delete" data-delete="'+esc(v.id)+'" type="button">삭제</button>')+'</article>').join('');
}
$('end').max=today;
$('start').max=today;
$('end').value=today;
updateDistricts([]);
renderDates();
renderListings();
renderLocation(null);
$('filters').addEventListener('submit',e=>{e.preventDefault();loadMarket();});
$('district').addEventListener('change',()=>{if ($state.applied) refreshMarket();});
$('period').addEventListener('click',e=>{if (!e.target.dataset.period) return;$state.period=e.target.dataset.period;renderDates();loadMarket();});
$('end').addEventListener('change',()=>renderDates());
$('start').addEventListener('change',()=>{$state.period='custom';renderDates();});
$('kinds').addEventListener('click',e=>{if (kinds.includes(e.target.dataset.kind)) {$state.kind=e.target.dataset.kind;loadMarket();}});
$('ranking').addEventListener('click',e=>{const rank=e.target.closest('[data-rank]');if(rank) choose($state.groups[Number(rank.dataset.rank)]);});
$('expandRank').addEventListener('click',()=>{$state.expanded=!$state.expanded;renderRank();});
$('settings').addEventListener('click',()=>{
  $('apiStatus').textContent=staticHosting?'공개 페이지에서는 API 키를 저장하지 않습니다. 실데이터는 로컬 실행본에서 연결하세요.':'';
  $('apiForm').querySelectorAll('input,button[type=submit]').forEach(element=>element.disabled=staticHosting);
  $('settingsDialog').showModal();
});
$('addListing').addEventListener('click',()=>$('listingDialog').showModal());
document.querySelectorAll('.close').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
$('apiForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const form=e.currentTarget;
  try {
    const res=await fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(form)))});
    const data=await res.json();
    if (!res.ok) throw Error(data.error);
    form.reset();
    $('settingsDialog').close();
    loadMarket();
  } catch (e) {$('apiStatus').textContent=e.message;}
});
$('listingForm').elements.kind.addEventListener('change',e=>{
  $('rentField').hidden=e.target.value!=='월세';
  $('listingForm').elements.monthly.required=!$('rentField').hidden;
});
$('listingForm').addEventListener('submit',e=>{
  e.preventDefault();
  const form=e.currentTarget;
  const input=Object.fromEntries(new FormData(form));
  const item={...input,name:input.name.trim(),dong:input.dong.trim(),jibun:input.jibun.trim(),area:Number(input.area),amount:Number(input.amount),monthly:input.kind==='월세'?Number(input.monthly):0,id:crypto.randomUUID()};
  if (!item.name||!item.dong) return;
  localStorage.setItem('gyeongsan-listings',JSON.stringify([item,...userListings()]));
  form.reset();
  $('rentField').hidden=true;
  form.elements.monthly.required=false;
  $('listingDialog').close();
  renderListings();
});
$('listings').addEventListener('click',e=>{
  const selected=e.target.closest('[data-listing]');
  const remove=e.target.closest('[data-delete]');
  if (selected) {
    const apt=[...sampleListings,...userListings()].find(item=>item.id===selected.dataset.listing);
    if (apt) choose(apt,true);
  }
  if (remove && confirm('이 추천매물을 삭제할까요?')) {
    localStorage.setItem('gyeongsan-listings',JSON.stringify(userListings().filter(v=>v.id!==remove.dataset.delete)));
    renderListings();
  }
});
loadMarket();

