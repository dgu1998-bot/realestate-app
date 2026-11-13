import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';

const region = '47290';
const cache = new Map();
const credentials = { molit: process.env.MOLIT_API_KEY, reb: process.env.REB_API_KEY };
const assets = { '/': ['index.html','text/html'], '/app.js': ['app.js','text/javascript'], '/style.css': ['style.css','text/css'] };
const json = (res, data, status = 200) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
};
const error = message => new Error(message);
async function cached(key, ttl, load) {
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.promise;
  const promise = Promise.resolve().then(load);
  cache.set(key, { promise, until: Date.now() + ttl });
  if (cache.size > 240) cache.delete(cache.keys().next().value);
  try { return await promise; }
  catch (cause) { if (cache.get(key)?.promise === promise) cache.delete(key); throw cause; }
}
async function fetchText(url, options) {
  let response;
  try { response = await fetch(url, { ...options, signal: AbortSignal.timeout(22000) }); }
  catch { throw error('외부 데이터 서버에 연결하지 못했습니다.'); }
  const body = await response.text();
  if (!response.ok) throw error('외부 API 응답 오류 (' + response.status + '). 키와 서비스 활용승인 상태를 확인해 주세요.');
  return body;
}
const decode = str => str.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, v) => {
  if (v.startsWith('#')) return String.fromCodePoint(v[1] === 'x' ? parseInt(v.slice(2),16) : Number(v.slice(1)));
  return { amp:'&',lt:'<',gt:'>',quot:'"',apos:"'" }[v] ?? '';
});
const tag = (xml, key) => decode(xml.match(new RegExp('<' + key + '>([\\s\\S]*?)</' + key + '>'))?.[1]?.trim() ?? '');
const numeric = value => Number(String(value).replace(/,/g,''));
const iso = (y,m,d) => [y,String(m).padStart(2,'0'),String(d).padStart(2,'0')].join('-');
function parseTrade(block, rent) {
  const g = key => tag(block,key);
  const deposit = numeric(g(rent ? 'deposit' : 'dealAmount'));
  const monthly = numeric(g('monthlyRent'));
  if ((!rent && (g('cdealDay') || g('cdealType') === 'O')) || !g('aptNm') || !g('dealDay') || (!deposit && !monthly)) return null;
  return { name:g('aptNm'), dong:g('umdNm'), jibun:g('jibun'), date:iso(g('dealYear'),g('dealMonth'),g('dealDay')), area:numeric(g('excluUseAr')), floor:g('floor'), amount:deposit, monthly, kind:rent ? monthly ? '월세':'전세':'매매' };
}
async function trades(month, rent, key) {
  if (!key) throw error('공공데이터포털 API 키를 연결해 주세요.');
  return cached((rent?'rent':'sale')+month, 20*60_000, async () => {
    const suffix = rent ? 'Rent':'Trade';
    const path = 'RTMSDataSvcApt' + suffix;
    const rows = [];
    let total;
    for (let page=1; page<=20; page++) {
      const query = new URLSearchParams({serviceKey:key, LAWD_CD:region, DEAL_YMD:month, numOfRows:'1000', pageNo:String(page)});
      const body = await fetchText('https://apis.data.go.kr/1613000/'+path+'/get'+path+'?'+query);
      const code = tag(body,'resultCode') || tag(body,'returnReasonCode');
      if (!['00','000'].includes(code)) throw error('국토교통부 API 조회 오류 (' + ( /^\d+$/.test(code) ? code : '응답 형식') + '). 매매·전월세 활용승인을 확인해 주세요.');
      total = numeric(tag(body,'totalCount'));
      const blocks = [...body.matchAll(/<item>([\s\S]*?)<\/item>/g)];
      rows.push(...blocks.map(([,block]) => parseTrade(block,rent)).filter(Boolean));
      if (page*1000>=total) return rows;
      if (!blocks.length) break;
    }
    throw error('실거래 자료를 모두 가져오지 못했습니다.');
  });
}
async function reb(path, args, key) {
  const body = JSON.parse(await fetchText('https://www.reb.or.kr/r-one/openapi/'+path+'.do?'+new URLSearchParams({KEY:key,Type:'json',pSize:'1000',...args})));
  return body[path]?.find(entry => Array.isArray(entry.row))?.row ?? [];
}
async function index(key, end) {
  if (!key) throw error('한국부동산원 API 키를 연결해 주세요.');
  return cached('index'+end, 3600_000, async () => {
    const endMonth = end.slice(0,7).replace('-','');
    const year = Number(end.slice(0,4));
    const tables = await reb('SttsApiTbl',{},key);
    const table = tables.find(row => /월.*매매.*지수.*아파트/.test(row.STATBL_NM ?? '') && !/규모|실거래|변동률/.test(row.STATBL_NM));
    const tableId = process.env.REB_STATBL_ID || table?.STATBL_ID || 'A_2024_00045';
    const args = { STATBL_ID:tableId };
    const items = await reb('SttsApiTblItm',args,key);
    const district = items.find(item => (item.CLS_NM ?? item.CLS_FULLNM ?? '').trim().endsWith('경산시'))?.CLS_ID;
    const rows = await reb('SttsApiTblData',{...args, DTACYCLE_CD:'MM', START_WRTTIME:String(year-1)+'01', END_WRTTIME:endMonth, ...(district ? {CLS_ID:district}:{})},key);
    const local = rows.filter(r => String(r.CLS_NM || r.CLS_FULLNM || '').trim().endsWith('경산시') && r.DTA_VAL != null && r.DTA_VAL !== '' && Number.isFinite(Number(r.DTA_VAL)));
    if (!local.length) throw error('R-ONE에서 경산시 지수를 확인하지 못했습니다.');
    const series = local.filter(r => r.ITM_ID === local[0].ITM_ID).map(r => ({month:String(r.WRTTIME_ID).replace(/\D/g,'').slice(0,6),value:Number(r.DTA_VAL)})).filter(r=>r.month.length===6).sort((a,b)=>a.month.localeCompare(b.month));
    if (!series.length) throw error('R-ONE 지수의 기준월을 확인하지 못했습니다.');
    return series.slice(-12);
  });
}
const aroundQuery = (latitude,longitude) => {
  const at = '(around:2800,'+latitude+','+longitude+')';
  return '[out:json][timeout:14];(nwr'+at+'["amenity"~"^(school|cafe|townhall|public_building|community_centre|police|post_office)$"]["name"];nwr'+at+'["shop"~"^(supermarket|department_store|mall)$"]["name"];nwr'+at+'["railway"~"^(station|halt)$"]["name"];nwr'+at+'["highway"="bus_stop"]["name"];);out center;';
};
async function overpass(query) {
  const raw = await fetchText('https://overpass.private.coffee/api/interpreter',{method:'POST',body:new URLSearchParams({data:query})});
  const payload = JSON.parse(raw);
  if (payload.remark || !Array.isArray(payload.elements)) throw error('주변 지도 자료를 조회하지 못했습니다.');
  return payload.elements;
}
async function locate(name, dong, jibun) {
  const clean = s => s.normalize('NFKC').replace(/[\s\-()]/g,'').replace(/아파트$/,'').toLowerCase();
  return cached('location'+JSON.stringify([name,dong,jibun]), 86400_000, async () => {
    const address = '경상북도 경산시 '+dong+' '+jibun;
    if (jibun && process.env.VWORLD_API_KEY) {
      try {
        const params = new URLSearchParams({service:'address',request:'getcoord',version:'2.0',key:process.env.VWORLD_API_KEY,address,format:'json',type:'parcel',crs:'EPSG:4326'});
        const response = JSON.parse(await fetchText('https://api.vworld.kr/req/address?'+params));
        const point = response.response?.result?.point;
        if (point && Number(point.y)>35 && Number(point.x)>128) return {lat:Number(point.y),lon:Number(point.x)};
      } catch { /* OpenStreetMap can resolve named complexes. */ }
    }
    const compact = name.replace(/[^\p{L}\p{N} ]/gu,'').trim();
    if (compact.length < 2) return null;
    const pattern = [...compact.replace(/\s/g,'').replace(/아파트$/,'')].join('[ -]*');
    if (!pattern) return null;
    const area='(35.68,128.64,36.02,129.05)';
    const query = '[out:json][timeout:12];(nwr'+area+'["name"~"'+pattern+'",i];nwr'+area+'["name:ko"~"'+pattern+'",i];);out center 35;';
    const objects = await overpass(query);
    const matches=objects.filter(o=>[o.tags?.name,o.tags?.['name:ko']].some(label=>label && clean(label)===clean(name)));
    const match=matches.find(o=>o.tags?.['addr:suburb']===dong || (jibun && o.tags?.['addr:housenumber']===jibun)) ??
      (matches.length===1 ? matches[0] : null);
    if (!match) return null;
    const point = match.center ?? match;
    return Number.isFinite(point.lat) && Number.isFinite(point.lon) ? {lat:point.lat,lon:point.lon} : null;
  });
}
function validDate(value) {
  if (!/^20\d\d-\d\d-\d\d$/.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(+parsed) && parsed.toISOString().slice(0,10)===value;
}
function shift(date, days) {
  const value = new Date(date);
  value.setUTCDate(value.getUTCDate()+days);
  return value.toISOString().slice(0,10);
}
function months(start,end) {
  const current = new Date(start.slice(0,7)+'-01');
  const result = [];
  while (current.toISOString().slice(0,7)<=end.slice(0,7)) {
    result.push(current.toISOString().slice(0,7).replace('-',''));
    current.setUTCMonth(current.getUTCMonth()+1);
  }
  return result;
}
const server = createServer(async (req,res) => {
  try {
    const {pathname,searchParams:p} = new URL(req.url,'http://localhost');
    if (pathname==='/api/config' && req.method==='POST') {
      if (req.headers.origin !== 'http://'+req.headers.host) return json(res,{error:'요청 출처를 확인해 주세요.'},403);
      let body='';
      for await (const chunk of req) { body+=chunk; if (body.length>1024) return json(res,{error:'입력값이 너무 깁니다.'},400); }
      const submitted = JSON.parse(body);
      for (const field of ['molit','reb']) {
        if (!submitted[field]) continue;
        const key = decodeURIComponent(String(submitted[field]).trim());
        if (!/^[a-zA-Z0-9+/=_.-]{12,180}$/.test(key)) return json(res,{error:'API 키 형식을 확인해 주세요.'},400);
      }
      for (const field of ['molit','reb']) if (submitted[field]) credentials[field]=decodeURIComponent(String(submitted[field]).trim());
      cache.clear();
      return json(res,{molit:!!credentials.molit,reb:!!credentials.reb});
    }
    if (req.method!=='GET') return json(res,{error:'지원하지 않는 요청입니다.'},405);
    if (pathname==='/api/config') return json(res,{molit:!!credentials.molit,reb:!!credentials.reb});
    if (pathname==='/api/trades') {
      const start=p.get('start') ?? '',end=p.get('end') ?? '';
      const kind=p.get('kind');
      if (!validDate(start)||!validDate(end)||end<start||new Date(end)-new Date(start)>92*86400_000||!['매매','전세','월세'].includes(kind)) return json(res,{error:'조회 기간은 최대 93일입니다.'},400);
      const requestedMonths=months(start,end);
      const data=await Promise.all(requestedMonths.map(month=>trades(month,kind!=='매매',credentials.molit)));
      return json(res,{rows:data.flat().filter(row=>row.kind===kind && row.date>=start && row.date<=end)});
    }
    if (pathname==='/api/recent') {
      const end=p.get('end') ?? '', name=p.get('name'), dong=p.get('dong'), kind=p.get('kind');
      if (!validDate(end)||!name||!dong||!['매매','전세','월세'].includes(kind)) return json(res,{error:'단지와 날짜를 확인해 주세요.'},400);
      const clean = name => name.replace(/\s/g,'').replace(/아파트$/,'');
      const all = [];
      for (const month of months(shift(end,-120),end).reverse()) {
        const rows = await trades(month,kind!=='매매',credentials.molit);
        all.push(...rows.filter(row=>row.kind===kind && row.dong===dong && clean(row.name)===clean(name) && (!p.get('jibun') || row.jibun===p.get('jibun')) && row.date<=end).sort((a,b)=>b.date.localeCompare(a.date)));
        if (all.length>=4) break;
      }
      return json(res,{rows:all.slice(0,4)});
    }
    if (pathname==='/api/index') {
      const end=p.get('end') ?? '';
      if (!validDate(end)) return json(res,{error:'기준일을 확인해 주세요.'},400);
      return json(res,{series:await index(credentials.reb,end)});
    }
    if (pathname==='/api/location') {
      const name=p.get('name')??'',dong=p.get('dong')??'',jibun=p.get('jibun')??'';
      if (!name || name.length>100 || dong.length>40 || jibun.length>30) return json(res,{error:'단지명을 확인해 주세요.'},400);
      return json(res,{point:await locate(name,dong,jibun)});
    }
    if (pathname==='/api/nearby') {
      const lat=Number(p.get('lat')),lon=Number(p.get('lon'));
      if (!(lat>35.68 && lat<36.02 && lon>128.64 && lon<129.05)) return json(res,{error:'경산시 주변 좌표를 확인해 주세요.'},400);
      const x=lat.toFixed(4), y=lon.toFixed(4);
      const rows=await cached('poi'+x+','+y,86400_000,()=>overpass(aroundQuery(x,y)));
      return json(res,{places:rows.map(o=>({...(o.center??o),tags:o.tags})).filter(o=>Number.isFinite(o.lat)&&Number.isFinite(o.lon)).map(({lat,lon,tags})=>({lat,lon,tags}))});
    }
    if (assets[pathname]) {
      const [file,type]=assets[pathname];
      const content=await readFile(new URL('public/'+file,import.meta.url));
      res.writeHead(200,{'Content-Type':type+'; charset=utf-8','X-Content-Type-Options':'nosniff'});
      return res.end(content);
    }
    return json(res,{error:'페이지를 찾을 수 없습니다.'},404);
  } catch (cause) {
    return json(res,{error:cause instanceof SyntaxError ? '응답 데이터 형식을 확인할 수 없습니다.' : (cause.message.includes('fetch') ? '외부 데이터에 연결하지 못했습니다.' : cause.message)},502);
  }
});
const port=Number(process.env.PORT||3000);
server.listen(port,'127.0.0.1',()=>{
  const address='http://127.0.0.1:'+server.address().port+'/';
  console.log(address);
  if (process.platform==='win32' && process.argv.includes('--open')) {
    execFile('cmd.exe',['/d','/c','start',address],{windowsHide:true},cause=>{
      if (cause) console.error('Open the address above in your browser.');
    });
  }
});
export { server };

