# สร้าง public/index.html จากต้นแบบ โดยเปลี่ยนชั้นข้อมูลให้คุยกับ API จริง
import re,sys
src=open('/home/claude/phangam/index.html').read()
lines=src.split('\n')
def region(a,b):
    i=src.index(a); j=src.index(b,i); return i,j
s=src
def R(o,n,c=1):
    global s
    assert s.count(o)==c,(o[:100],s.count(o)); s=s.replace(o,n)

# --- หัวเว็บ / แบนเนอร์ต้นแบบ
R('<div class="demo">ต้นแบบ (Prototype) — ข้อมูลเก็บในเบราว์เซอร์นี้เท่านั้น และการแจ้งเตือนอีเมล/LINE เป็นการจำลอง</div>\n','')
R('<title>ระบบจองเดินป่าผาแง่ม</title>','<title>ผาแง่ม · จองเดินป่า</title>\n<meta name="description" content="จองรอบเดินป่าผาแง่มพร้อมไกด์ชุมชนท้องถิ่น">\n<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Ctext y=%22.9em%22 font-size=%2290%22%3E⛰️%3C/text%3E%3C/svg%3E">')
R("const KEY='phangam_demo_v9';","")

# --- me/can
R("const me=()=>session&&DB.users.find(u=>u.id===session.userId);","const me=()=>DB?.me||null;")

# --- ชั้นข้อมูล: แทนที่ data + core logic ด้วยตัวช่วยแสดงผล + API
i=s.index('/* ========== data ========== */'); j=s.index('/* ========== badges ========== */')
old=s[i:j]
keep_names=['function ph(','function avatar(']
ph_line=[l for l in old.split('\n') if l.startswith('function ph(')][0]
av_line=[l for l in old.split('\n') if l.startswith('function avatar(')][0]
new_data=r'''/* ========== data (มาจากเซิร์ฟเวอร์) ========== */
let DB=null,PUB=null,AUTH={hasUsers:true},booted=false;
'''+ph_line+'\n'+av_line+r'''
async function api(path,opt={}){
  try{const r=await fetch(path,{credentials:'same-origin',...opt,headers:{...(opt.body&&!(opt.body instanceof FormData)&&typeof opt.body==='string'?{'content-type':'application/json'}:{}),...(opt.headers||{})}});
    const j=await r.json().catch(()=>({error:'เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง'}));return {ok:r.ok,status:r.status,...j}}
  catch(e){return {ok:false,status:0,error:'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต'}}}
const post=(path,body)=>api(path,{method:'POST',body:JSON.stringify(body||{})});
async function loadPub(){const r=await api('/api/public/state');if(r.ok)PUB=r;return r.ok}
async function loadAdmin(){const r=await api('/api/admin/state');DB=r.ok?r:null;return r.ok}
/* คำสั่งหลังบ้าน: ส่งไปเซิร์ฟเวอร์ → ได้สถานะใหม่ → แสดงผล */
async function call(name,p){
  const r=await post('/api/admin/'+name,p);
  if(r.status===401){DB=null;render();toast('กรุณาเข้าสู่ระบบใหม่');return null}
  if(!r.ok){toast(r.error||'ทำรายการไม่สำเร็จ');return null}
  DB=r.state;if(r.msg)toast(r.msg);await loadPub();render();return r}
async function uploadImg(dataURL){const blob=await (await fetch(dataURL)).blob();
  const r=await api('/api/admin/upload',{method:'POST',body:blob,headers:{'content-type':blob.type||'image/jpeg'}});if(!r.ok){toast(r.error||'อัปโหลดไม่สำเร็จ');return null}return r.url}
const gObj=(db,id)=>db.guides.find(g=>g.id===id);
const gName=(db,id)=>{const g=gObj(db,id);return g?`${g.firstName} ${g.lastName}`:'-'};
const PAX=[['ta','คนไทย ผู้ใหญ่'],['tc','คนไทย เด็ก'],['fa','ชาวต่างชาติ ผู้ใหญ่'],['fc','ชาวต่างชาติ เด็ก']];
const paxCount=p=>PAX.reduce((a,[k])=>a+(+p[k]||0),0);
const entryOf=(p,r)=>PAX.reduce((a,[k])=>a+(+p[k]||0)*(+r[k]||0),0);
const paxText=p=>PAX.filter(([k])=>+p[k]).map(([k,l])=>`${l} ${p[k]}`).join(' · ');
const activeGuides=db=>db.guides.filter(g=>g.active).sort((a,b)=>a.priority-b.priority);
function guideBusy(db,gid,date,time,exceptId){const dur=db.settings.tripHours*60,st=toMin(time);
  return db.bookings.some(b=>b.id!==exceptId&&b.guideId===gid&&b.status!=='cancelled'&&b.trip!=='paidcancel'&&b.date===date&&Math.abs(toMin(b.time)-st)<dur)}
const unavailOn=(db,gid,date)=>(db.unavail||[]).some(u=>u.guideId===gid&&u.date===date);
const guideDayCount=(db,gid,date,exceptId)=>db.bookings.filter(b=>b.id!==exceptId&&b.guideId===gid&&b.status!=='cancelled'&&b.trip!=='paidcancel'&&b.date===date).length;
function guideBlocked(db,gid,date,time,exceptId,b){const cap=+db.settings.maxGroupsPerGuideDay||0;return (cap>0&&guideDayCount(db,gid,date,exceptId)>=cap)||guideBusy(db,gid,date,time,exceptId)||unavailOn(db,gid,date)||!!(b&&(b.declined||[]).some(d=>d.guideId===gid))}
const dayBookings=(db,date)=>db.bookings.filter(b=>b.date===date&&b.status!=='cancelled').sort((a,b)=>(a.qn??1e9)-(b.qn??1e9)||a.createdAt.localeCompare(b.createdAt));
const dayGuides=(db,date)=>activeGuides(db).filter(g=>!unavailOn(db,g.id,date));
const DONE=['completed','noshow','paidcancel'];const isDone=b=>DONE.includes(b.trip);
const isLocked=b=>b.trip==='started'||isDone(b)||b.manual;
function streamNext(db,ptr,b){const G=activeGuides(db);if(!G.length)return null;const i=G.findIndex(g=>g.id===ptr),st=i>=0?i+1:0;
  for(let k=0;k<G.length;k++){const g=G[(st+k)%G.length];if(!b||!guideBlocked(db,g.id,b.date,b.time,b.id,b))return g}return null}
const nextQueueGuide=db=>streamNext(db,db.lastGuideId,null);
function slotList(){const s=(DB||PUB).settings,o=[];for(let m=toMin(s.slotStart);m<=toMin(s.slotEnd);m+=Math.max(15,+s.slotStep||60))o.push(fromMin(m));return o}
const byId=id=>DB.bookings.find(b=>b.id===id);

'''
s=s[:i]+new_data+s[j:]

# --- หน้าเว็บสาธารณะใช้ PUB
i=s.index('function siteImg('); j=s.index('/* ========== ADMIN ========== */')
pub=s[i:j]
pub=pub.replace('DB.settings','PUB.settings').replace('DB.site','PUB.site').replace('activeGuides(DB).length','PUB.guideCount')
pub=pub.replace("let viewBookingId=null;","")
s=s[:i]+pub+s[j:]
# chOn / payChannelHTML / paypalCharge (อยู่ในส่วน admin ของไฟล์)
R("const chOn=()=>CH.filter(([k])=>DB.settings.channels[k]?.on);","const chOn=()=>CH.filter(([k])=>PUB.settings.channels[k]?.on);")
R("function paypalCharge(total){const c=DB.settings.channels.paypal;","function paypalCharge(total){const c=PUB.settings.channels.paypal||{};")
R("function payChannelHTML(b,k){const c=DB.settings.channels[k],","function payChannelHTML(b,k){const c=PUB.settings.channels[k],")
R("let viewBookingId=null;","let VB=null; /* การจองที่กำลังแสดง {booking, phone} */\nconst AV={}; /* ที่ว่างรายวันจากเซิร์ฟเวอร์ */",0) if False else None
s=s.replace("const bf={date:addDays(today(),1),","let VB=null; /* การจองที่กำลังแสดง {booking, phone} */\nlet AV=null,avKey=''; /* ที่ว่างจากเซิร์ฟเวอร์ */\nconst bf={date:addDays(today(),1),",1)

# renderBook: ใช้ VB
R("  if(viewBookingId){const b=DB.bookings.find(x=>x.id===viewBookingId);if(b)return renderPayment(b,true)}","  if(VB)return renderPayment(VB.booking,true);")
# slotsHTML ใช้ที่ว่างจากเซิร์ฟเวอร์
i=s.index('function slotsHTML(){'); j=s.index('const POLICY=')
s=s[:i]+r'''function slotsHTML(){
  const key=bf.date+'|'+paxCount(bf.pax);
  if(avKey!==key||!AV){if(avKey!==key){avKey=key;AV=null;loadAvail(key)}return '<div class="mut sm">กำลังตรวจสอบรอบที่ว่าง…</div>'}
  if(AV.closed){bf.time=null;return `<div class="price" style="background:var(--redbg);color:var(--red)"><b>ปิดรับจองวันนี้: ${esc(AV.closed.name)}</b><div class="sm">${esc(AV.closed.text)} · กรุณาเลือกวันอื่น</div></div>`}
  if(AV.tooFar){bf.time=null;return `<div class="price" style="background:var(--redbg);color:var(--red)">จองล่วงหน้าได้ไม่เกิน ${PUB.settings.bookAheadDays} วัน</div>`}
  if(!AV.slots.length)return '<div class="mut sm">ไม่มีรอบให้จอง</div>';
  return `<div class="slots">${AV.slots.map(x=>{const past=x.reason==='lead',dis=past||x.free<=0;if(dis&&bf.time===x.t)bf.time=null;
    return `<button type="button" class="slot ${bf.time===x.t?'on':''}" data-act="slot" data-t="${x.t}" ${dis?'disabled':''}><b>${x.t}</b><span>${past?(leadText()?'ต้องจองล่วงหน้า':'ปิดรับแล้ว'):x.free<=0?esc(x.reason||'เต็ม'):'ว่าง '+x.free+' กลุ่ม'}</span></button>`}).join('')}</div>`;
}
async function loadAvail(key){const [date,people]=key.split('|');const r=await post('/api/public/availability',{date,people});if(avKey!==key)return;
  AV=r.ok?r:{slots:[],closed:{name:r.error||'โหลดไม่สำเร็จ',text:''}};const el=document.getElementById('slots');if(el)el.innerHTML=slotsHTML()}
'''+s[j:]

# renderPayment: เบอร์โทรถูกปิดบางส่วน, ช่องทาง auto จาก PUB
R("const auto=PUB.settings.channels[payCh]?.mode==='auto';","const auto=PUB.settings.channels[payCh]?.mode==='auto';")
R("""${auto?'<p class="badge b-ok">⚡ ช่องทางนี้ยืนยันอัตโนมัติทันทีหลังแนบหลักฐาน</p>':'<p class="sm mut">เจ้าหน้าที่จะตรวจและยืนยันหลังแนบหลักฐาน</p>'}""","""<p class="sm mut">แนบหลักฐานการชำระด้านล่าง เจ้าหน้าที่จะตรวจและยืนยันการจองให้โดยเร็ว</p>""")
R('<input type="file" accept="image/*" data-slip="${b.id}">','<input type="file" accept="image/jpeg,image/png,image/webp" data-slip="${b.code}">')
# renderCheck
R("""   <button class="btn" type="submit">ค้นหา</button><p class="mut sm">ทดลอง: PG1011 / 0619990000</p></form>
   ${checkResult?renderPayment(checkResult,false):''}`;""","""   <button class="btn" type="submit">ค้นหา</button></form>
   ${checkResult?renderPayment(checkResult.booking,false):''}`;""")

# --- เข้าสู่ระบบ
i=s.index('function renderLogin(){'); j=s.index('function renderAdmin(sub){')
s=s[:i]+r'''function renderLogin(){
  return `<form class="card login" data-form="login"><h2>เข้าสู่ระบบหลังบ้าน</h2>
  <div class="field"><label>ชื่อผู้ใช้</label><input name="username" autocomplete="username" autocapitalize="off"></div>
  <div class="field"><label>รหัสผ่าน</label><input name="password" type="password" autocomplete="current-password"></div>
  <button class="btn lg" type="submit">เข้าสู่ระบบ</button>
  ${AUTH.hasUsers?'':'<p class="sm" style="color:var(--red);margin-top:12px">ระบบยังไม่มีผู้ดูแล — ตั้งค่า ADMIN_PASSWORD ใน Cloudflare แล้วโหลดหน้านี้ใหม่</p>'}</form>`;
}
'''+s[j:]
R("""   <a href="#admin" data-act="logout" style="color:var(--red)">ออกจากระบบ</a></aside>""","""   <a href="#admin" data-act="chpw">🔑 เปลี่ยนรหัสผ่าน</a><a href="#admin" data-act="logout" style="color:var(--red)">ออกจากระบบ</a></aside>""")

# --- หน้าหลังบ้านที่ต้องปรับเล็กน้อย
R("""${me().role==='superadmin'?`<button type="button" class="btn ghost" data-act="reset">รีเซ็ตข้อมูลตัวอย่าง</button>`:''}""","")
R("""${f('lineUserId','LINE User ID (ได้เมื่อไกด์เพิ่มเพื่อน LINE OA — ใช้ส่งข้อความจริง)')}""","""<p class="sm mut" style="margin-top:-4px">รับแจ้งเตือนทาง LINE: ให้ไกด์เพิ่มเพื่อน LINE OA ของชุมชน แล้วพิมพ์เบอร์โทรนี้ในแชท ระบบจะผูกให้อัตโนมัติ ${g.lineUserId?'<b style="color:var(--g2)">✓ ผูกแล้ว</b>':'<b style="color:var(--warn)">ยังไม่ผูก</b>'}</p>""")
R("ตั้งรหัสผ่านใหม่ (เว้นว่าง = ไม่เปลี่ยน)","ตั้งรหัสผ่านใหม่ (อย่างน้อย 6 ตัว · เว้นว่าง = ไม่เปลี่ยน)")
R("รหัสผ่าน (อย่างน้อย 4 ตัว)","รหัสผ่าน (อย่างน้อย 6 ตัว)")
R("<label>รหัสผ่าน ${u.id?'(เว้นว่าง = ไม่เปลี่ยน)':'*'}</label>","<label>รหัสผ่าน ${u.id?'(เว้นว่าง = ไม่เปลี่ยน)':'* (อย่างน้อย 8 ตัว)'}</label>")
# การแจ้งเตือน: แสดงชื่อปลายทาง + สถานะการส่งจริง
R("""<span class="mut sm">→ ${esc(n.to)} · ${fmtDT(n.at)}</span>""","""<span class="mut sm">→ ${esc(n.toLabel||n.to)} · ${fmtDT(n.at)}</span>${n.status?badge([n.status,n.status==='ส่งแล้ว'?'b-ok':n.status==='pending'?'b-gray':'b-warn']):''}""")
R("<p class=\"mut sm\" style=\"margin-top:0\">ในต้นแบบนี้เป็นการจำลอง — ระบบจริงจะส่งผ่าน LINE Messaging API (LINE OA) และบริการส่งอีเมล ทันทีที่มีการมอบหมาย/เปลี่ยนแปลงงาน</p>","<p class=\"mut sm\" style=\"margin-top:0\">ส่งผ่าน LINE OA และอีเมลทันทีที่มีการมอบหมาย/เปลี่ยนแปลงงาน · เตือนอีกครั้ง 18:00 คืนก่อนเดินป่า · สถานะ “ยังไม่ผูก” = ไกด์ยังไม่ได้พิมพ์เบอร์ใน LINE OA</p>")
# ข้อความ auto ในหน้าช่องทางชำระ
R("<p class=\"sm mut\" style=\"margin:-4px 0 10px\">ออโต้ในระบบจริง: ${AUTO_HOW[k]}</p>","<p class=\"sm mut\" style=\"margin:-4px 0 10px\">ออโต้ต้องเชื่อม: ${AUTO_HOW[k]} — ระหว่างยังไม่เชื่อม ระบบจะรอเจ้าหน้าที่ยืนยัน (แมนนวล)</p>")
R("const PAGES={","const PAGES_={")
s=s.replace("const PAGES_={","const PAGES={",1)

R("window.addEventListener('hashchange',render);","")
# --- render(): ไม่มี expirePending ฝั่ง client
R("  expirePending();const h=location.hash.slice(1)||'home',app=document.getElementById('app');","  const h=location.hash.slice(1)||'home',app=document.getElementById('app');\n  if(!booted||!PUB){app.innerHTML='<div class=\"empty\">กำลังโหลด…</div>';return}\n  if(h.startsWith('admin')&&DB===null&&AUTH.checking){app.innerHTML='<div class=\"empty\">กำลังโหลด…</div>';return}")
R("function commit(){save();render()}","")
# countdown → ดึงสถานะใหม่จากเซิร์ฟเวอร์
R("  if(ms<=0){if(expirePending())render();return}","  if(ms<=0){if(!el._done){el._done=1;refreshVB()}return}")

# --- events: แทนที่ทั้งหมด
i=s.index('/* ========== events ========== */'); j=s.index('</script>\n</body>')
events=open('/home/claude/phangamtrail/tools/events.js').read()
s=s[:i]+events+s[j:]
open('/home/claude/phangamtrail/public/index.html','w').write(s)
print('ok',len(s))
