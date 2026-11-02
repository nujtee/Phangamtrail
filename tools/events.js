/* ========== events ========== */
const ACT={
  slot:el=>{bf.time=el.dataset.t;document.getElementById('slots').innerHTML=slotsHTML()},
  ppl:el=>{const k=el.dataset.k,d=+el.dataset.d,n=Math.max(0,bf.pax[k]+d),tot=paxCount(bf.pax)-bf.pax[k]+n;
    if(tot>PUB.settings.maxGroup)return toast(`รวมได้ไม่เกิน ${PUB.settings.maxGroup} คนต่อกลุ่ม`);if(tot<1)return;
    bf.pax[k]=n;document.getElementById('ppl_'+k).textContent=n;document.getElementById('price').innerHTML=priceHTML();document.getElementById('slots').innerHTML=slotsHTML()},
  calnav:el=>{const d=+el.dataset.d;if(!d)calM=today().slice(0,7);else{const [y,m]=calM.split('-').map(Number),n=new Date(y,m-1+d,1);calM=`${n.getFullYear()}-${pad(n.getMonth()+1)}`}render()},
  calday:el=>{calSel=el.dataset.d;calR={preset:'custom',from:calSel,to:calSel};render()},
  calp:el=>{calR.preset=el.dataset.k;calSel='';if(el.dataset.k==='custom'&&!calR.from){calR.from=monthRange(calM+'-01')[0];calR.to=monthRange(calM+'-01')[1]}render()},
  seasonform:el=>{const x=(DB.settings.seasons||[]).find(y=>y.id===el.dataset.id)||{kind:'month',from:'6',to:'9',active:true,name:''};
    openModal(`<h3>${x.id?'แก้ไข':'เพิ่ม'}ช่วงปิดรับจอง</h3><form data-form="season" data-id="${x.id||''}">
    <div class="field"><label>ชื่อ / เหตุผล *</label><input name="name" value="${esc(x.name)}" placeholder="เช่น ปิดเส้นทางฤดูฝน"></div>
    <div class="row" style="margin-bottom:10px"><label style="display:flex;gap:6px;align-items:center;margin:0;color:var(--ink)"><input type="radio" name="kind" value="date" style="width:auto" ${x.kind==='date'?'checked':''} data-act="seasonkind"> วันที่ถึงวันที่</label>
     <label style="display:flex;gap:6px;align-items:center;margin:0;color:var(--ink)"><input type="radio" name="kind" value="month" style="width:auto" ${x.kind==='month'?'checked':''} data-act="seasonkind"> เดือนถึงเดือน (ซ้ำทุกปี)</label></div>
    <div id="sk_date" class="grid2" style="${x.kind==='date'?'':'display:none'}"><div class="field"><label>ตั้งแต่วันที่</label><input type="date" name="dfrom" value="${x.kind==='date'?x.from:today()}"></div><div class="field"><label>ถึงวันที่</label><input type="date" name="dto" value="${x.kind==='date'?x.to:today()}"></div></div>
    <div id="sk_month" class="grid2" style="${x.kind==='month'?'':'display:none'}"><div class="field"><label>ตั้งแต่เดือน</label><select name="mfrom">${MONTHS.map((m,i)=>`<option value="${i+1}" ${+x.from===i+1&&x.kind==='month'?'selected':''}>${m}</option>`).join('')}</select></div><div class="field"><label>ถึงเดือน</label><select name="mto">${MONTHS.map((m,i)=>`<option value="${i+1}" ${+x.to===i+1&&x.kind==='month'?'selected':''}>${m}</option>`).join('')}</select></div></div>
    <p class="sm mut" style="margin-top:-4px">ช่วงเดือนข้ามปีได้ เช่น พ.ย. – ก.พ.</p>
    <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="active" style="width:auto" ${x.active?'checked':''}> เปิดใช้ (ปิดรับจองในช่วงนี้)</label>
    <div class="mact"><button type="button" class="btn ghost" data-act="mcancel">ยกเลิก</button><button class="btn" type="submit">บันทึก</button></div></form>`)},
  seasonkind:el=>{const k=el.value;document.getElementById('sk_date').style.display=k==='date'?'':'none';document.getElementById('sk_month').style.display=k==='month'?'':'none'},
  seasontoggle:el=>call('seasonToggle',{id:el.dataset.id}),
  seasondel:async el=>{const x=DB.settings.seasons.find(y=>y.id===el.dataset.id);if(!await confirmBox('ลบช่วงปิดรับจอง?',`${esc(x.name)} · ${seasonText(x)}`,'ลบ','red'))return;call('seasonDel',{id:x.id})},
  galcat:el=>{galCat=el.dataset.k;render()},
  lb:el=>{const g=PUB.site.gallery.imgs.find(x=>x.id===el.dataset.src);if(g)showLb(g.src,g.caption)},
  lbsrc:el=>showLb(el.src,''),
  lbclose:()=>{document.querySelector('.lb')?.remove()},
  ctab:el=>{cTab=el.dataset.k;render()},
  gcatsel:el=>{cGalCat=el.dataset.k;render()},
  gcatadd:()=>openModal(`<h3>เพิ่มหมวดหมู่รูป</h3><form data-form="gcat"><div class="field"><label>ชื่อหมวดหมู่</label><input name="name"></div><div class="mact"><button type="button" class="btn ghost" data-act="mcancel">ยกเลิก</button><button class="btn" type="submit">เพิ่ม</button></div></form>`),
  gcatren:()=>{const c=DB.site.gallery.cats.find(x=>x.id===cGalCat);openModal(`<h3>เปลี่ยนชื่อหมวดหมู่</h3><form data-form="gcat" data-id="${c.id}"><div class="field"><label>ชื่อหมวดหมู่</label><input name="name" value="${esc(c.name)}"></div><div class="mact"><button type="button" class="btn ghost" data-act="mcancel">ยกเลิก</button><button class="btn" type="submit">บันทึก</button></div></form>`)},
  gcatdel:async()=>{const G=DB.site.gallery,c=G.cats.find(x=>x.id===cGalCat),n=G.imgs.filter(g=>g.cat===c.id).length;if(!await confirmBox('ลบหมวดหมู่?',`${esc(c.name)} — รูปในหมวดนี้ ${n} รูปจะถูกลบด้วย`,'ลบ','red'))return;call('gcatDel',{id:c.id})},
  gimgdel:async el=>{if(!await confirmBox('ลบรูปนี้?','','ลบ','red'))return;call('gimgDel',{id:el.dataset.id})},
  gimgcap:el=>{const g=DB.site.gallery.imgs.find(x=>x.id===el.dataset.id);openModal(`<h3>คำบรรยายรูป</h3><form data-form="gcap" data-id="${g.id}"><img src="${g.src}" style="max-width:100%;border-radius:8px;margin-bottom:8px"><div class="field"><input name="caption" value="${esc(g.caption)}"></div><div class="mact"><button type="button" class="btn ghost" data-act="mcancel">ยกเลิก</button><button class="btn" type="submit">บันทึก</button></div></form>`)},
  stayform:el=>openModal(stayFormHTML(DB.site.stays.find(x=>x.id===el.dataset.id))),
  staydel:async el=>{const x=DB.site.stays.find(y=>y.id===el.dataset.id);if(!await confirmBox('ลบบ้านพัก?',esc(x.name),'ลบ','red'))return;call('stayDel',{id:x.id})},
  staymv:el=>call('stayMove',{i:+el.dataset.i,d:+el.dataset.d}),
  draftdel:el=>{draftImgs.splice(+el.dataset.i,1);document.getElementById('draftimgs').innerHTML=draftGal()},
  draftfirst:el=>{const [x]=draftImgs.splice(+el.dataset.i,1);draftImgs.unshift(x);document.getElementById('draftimgs').innerHTML=draftGal()},
  orgform:el=>openModal(orgFormHTML(DB.site.org.find(x=>x.id===el.dataset.id))),
  orgdel:async el=>{const S=DB.site,o=S.org.find(x=>x.id===el.dataset.id),kids=S.org.filter(x=>x.parent===o.id);if(!await confirmBox('ลบบุคคลนี้?',`${esc(o.pos)} · ${esc(o.name)}${kids.length?`<br>ผู้ที่อยู่ภายใต้ ${kids.length} คน จะย้ายขึ้นไปอยู่ภายใต้ผู้บังคับบัญชาของคนนี้แทน`:''}`,'ลบ','red'))return;call('orgDel',{id:o.id})},
  paych:el=>{payCh=el.dataset.k;render()},
  chimgdel:el=>{chImgDraft[el.dataset.k]='';document.getElementById('chprev_'+el.dataset.k).innerHTML='<span class="sm mut">ลบรูปแล้ว (ยังไม่บันทึก)</span>'},
  newbook:()=>{VB=null;avKey='';render();scrollTo(0,0)},
  copy:el=>{navigator.clipboard?.writeText(el.dataset.v).then(()=>toast('คัดลอกแล้ว'),()=>toast('คัดลอกไม่ได้ — กรุณาคัดลอกเอง'))},
  mcancel:()=>{const m=document.getElementById('modal');m._res&&m._res(false);m._res=null;closeModal()},
  mok:()=>{const m=document.getElementById('modal');const r=m._res;const ref=m.querySelector('[name=ref]')?.value||'';m._res=null;closeModal();r&&r(ref||true)},
  logout:async()=>{await post('/api/auth/logout');DB=null;location.hash='admin';render()},
  chpw:()=>openModal(`<h3>เปลี่ยนรหัสผ่าน</h3><form data-form="chpw"><div class="field"><label>รหัสผ่านเดิม</label><input name="old" type="password" autocomplete="current-password"></div>
    <div class="field"><label>รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)</label><input name="new" type="password" autocomplete="new-password"></div><div class="field"><label>ยืนยันรหัสผ่านใหม่</label><input name="new2" type="password" autocomplete="new-password"></div>
    <div class="mact"><button type="button" class="btn ghost" data-act="mcancel">ยกเลิก</button><button class="btn" type="submit">บันทึก</button></div></form>`),
  dtab:el=>{dashTab=el.dataset.k;render()},
  accp:el=>{acc.preset=el.dataset.k;render()},
  ptab:el=>{payTab=el.dataset.k;render()},
  ntf:el=>{ntF=el.dataset.k;render()},
  confirmpay:async el=>{const b=byId(el.dataset.id);if(!await confirmBox('ยืนยันรับเงิน',`${b.code} · ${esc(b.name)}<br>ยอด <b>${baht(b.paidAmount||b.total)}</b>${b.payFee?` <span class="sm mut">(รวมค่าธรรมเนียม PayPal ${baht(b.payFee)})</span>`:''}${b.payChannel?`<br>ผ่าน ${(CH.find(x=>x[0]===b.payChannel)||[,'-'])[1]}`:''}${b.slip?'':'<br><span style="color:var(--warn)">⚠ ลูกค้ายังไม่ได้แนบหลักฐาน — ตรวจยอดเงินเข้าบัญชีก่อนยืนยัน</span>'}`))return;call('confirmPay',{id:b.id})},
  noshow:async el=>{const b=byId(el.dataset.id);if(!await confirmBox('ยืนยันลูกค้าไม่มา',`${b.code} · ${esc(b.name)} · ${fmtDate(b.date)} ${b.time}<br>ไม่คืนเงิน · ไกด์ ${esc(gName(DB,b.guideId))} ยังได้ค่าไกด์ <b>${baht(b.split.guide)}</b> และจะถูกย้ายไปต่อท้ายคิว`,'ยืนยันลูกค้าไม่มา','warn'))return;call('noshow',{id:b.id})},
  paidcancel:async el=>{const b=byId(el.dataset.id),g=gObj(DB,b.guideId);
    if(!await confirmBox('ลูกค้ายกเลิก (ไม่คืนเงิน)',`${b.code} · ${esc(b.name)} · ${fmtDate(b.date)} ${b.time}<br>ไม่คืนเงิน · ${g?`ไกด์ ${esc(g.firstName+' '+g.lastName)} ได้ค่าไกด์ <b>${baht(b.split.guide)}</b> ย้ายไปต่อท้ายคิว และว่างรับงานอื่นในเวลานั้นได้`:'<span style="color:var(--red)">ยังไม่มีไกด์ได้รับมอบหมาย — ค่าไกด์จะไม่ถูกจ่ายให้ใคร</span>'}`,'ยืนยันการยกเลิก','red'))return;call('paidcancel',{id:b.id})},
  reschedule:el=>{const b=byId(el.dataset.id);openModal(`<h3>เลื่อนวันเดินป่า ${b.code}</h3><p class="sm mut">ชำระแล้วไม่คืนเงิน แต่เลื่อนวันได้ · เลขคิว #${b.qn+1} คงเดิม</p>
    <form data-form="reschedule" data-id="${b.id}"><div class="grid2"><div class="field"><label>วันที่ใหม่</label><input type="date" name="date" value="${b.date}" min="${today()}"></div>
    <div class="field"><label>เวลา</label><select name="time">${slotList().map(t=>`<option ${t===b.time?'selected':''}>${t}</option>`).join('')}</select></div></div>
    <div class="mact"><button type="button" class="btn ghost" data-act="mcancel">ยกเลิก</button><button class="btn" type="submit">บันทึกการเลื่อนวัน</button></div></form>`)},
  slip:el=>{const b=byId(el.dataset.id);openModal(`<h3>หลักฐานการชำระ ${b.code}</h3><img class="slipimg" src="${b.slip}"><div class="mact"><a class="btn ghost" href="${b.slip}" target="_blank" rel="noopener" style="text-decoration:none">เปิดรูปเต็ม</a><button class="btn ghost" data-act="mcancel">ปิด</button></div>`)},
  cancelbk:async el=>{const b=byId(el.dataset.id);if(!await confirmBox('ยกเลิกการจอง?',`${b.code} · ${esc(b.name)} · ${fmtDate(b.date)} ${b.time}`,'ยกเลิกการจอง','red'))return;call('cancelBooking',{id:b.id})},
  tripstart:async el=>{const b=byId(el.dataset.id);if(!await confirmBox('ยืนยันเริ่มการเดินทาง',`${b.code} · ${b.people} คน · ${fmtDate(b.date)} ${b.time}`))return;call('tripStart',{id:b.id})},
  tripend:async el=>{const b=byId(el.dataset.id);if(!await confirmBox('ยืนยันสิ้นสุดการเดินทาง',`${b.code} · เริ่มเมื่อ ${fmtDT(b.startedAt)}<br>รายการจะถูกส่งไปหน้าเบิกจ่ายค่าไกด์`,'สิ้นสุดการเดินทาง','warn'))return;call('tripEnd',{id:b.id})},
  paygd:async el=>{const b=byId(el.dataset.id),g=gObj(DB,b.guideId);
    const r=await confirmBox('ยืนยันชำระเงินให้ไกด์',`<dl class="kv"><dt>ไกด์</dt><dd>${esc(g.firstName+' '+g.lastName)}</dd><dt>บัญชี</dt><dd>${esc(g.bankName)} ${esc(g.accountNo)}</dd><dt>โทร</dt><dd>${esc(g.phone)}</dd><dt>งาน</dt><dd>${b.code} · ${fmtDateS(b.date)} ${b.time}</dd><dt>ยอด</dt><dd><b>${baht(b.split.guide)}</b></dd></dl>
      <div class="field" style="margin-top:10px"><label>เลขอ้างอิงการโอน (ถ้ามี)</label><input name="ref"></div><p class="sm mut">ระบบจะบันทึกว่าคุณ (${esc(me().name)}) เป็นผู้กดยืนยัน</p>`,'ยืนยันจ่ายแล้ว');
    if(!r)return;call('payGuide',{id:b.id,ref:r===true?'':r})},
  payundo:async el=>{const b=byId(el.dataset.id);if(!await confirmBox('ยกเลิกการยืนยันจ่าย?',`${b.code} — จะถูกบันทึกใน log`,'ยกเลิกการยืนยัน','red'))return;call('payUndo',{id:b.id})},
  guideform:el=>openModal(guideFormHTML(el.dataset.id&&gObj(DB,el.dataset.id))),
  gtoggle:el=>call('guideToggle',{id:el.dataset.id}),
  gup:el=>call('guideMove',{id:el.dataset.id,d:-1}),gdown:el=>call('guideMove',{id:el.dataset.id,d:1}),
  gnotify:el=>call('guideTest',{id:el.dataset.id}),
  autoall:()=>call('autoAll'),
  decline:el=>{const b=byId(el.dataset.id);openModal(`<h3>แจ้งไม่ว่างรับงาน</h3><p>${b.code} · ${fmtDate(b.date)} ${b.time} น. · ${b.people} คน</p>
    <form data-form="decline" data-id="${b.id}"><div class="field"><label>เหตุผล *</label><select name="preset"><option>ติดธุระส่วนตัว</option><option>เจ็บป่วย</option><option>ติดงานอื่น</option><option>เดินทางไม่สะดวก</option><option value="">อื่น ๆ (ระบุด้านล่าง)</option></select></div>
    <div class="field"><label>รายละเอียดเพิ่มเติม</label><textarea name="reason" rows="2"></textarea></div>
    <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="wholeDay" style="width:auto"> ไม่ว่างทั้งวัน (ไม่รับงานอื่นในวันนี้ด้วย)</label>
    <p class="sm" style="color:var(--red)">งานนี้จะถูกส่งต่อให้ไกด์คนถัดไปทันที และคิวของคุณจะย้ายไปลำดับสุดท้าย</p>
    <div class="mact"><button type="button" class="btn ghost" data-act="mcancel">ยกเลิก</button><button class="btn red" type="submit">ยืนยันไม่ว่าง</button></div></form>`)},
  unavailform:el=>{const gid=el.dataset.id||'';openModal(`<h3>แจ้งไกด์ไม่ว่างรับงาน</h3><form data-form="unavail">
    <div class="field"><label>ไกด์</label><select name="guideId">${activeGuides(DB).map(g=>`<option value="${g.id}" ${g.id===gid?'selected':''}>${g.priority}. ${esc(g.firstName+' '+g.lastName)}</option>`).join('')}</select></div>
    <div class="field"><label>วันที่ไม่ว่าง</label><input type="date" name="date" value="${today()}" min="${today()}"></div>
    <div class="field"><label>เหตุผล *</label><input name="reason"></div>
    <p class="sm mut">งานที่มอบหมายไว้ในวันนั้น (ที่ยังไม่เริ่มเดินทาง) จะถูกส่งต่อให้ไกด์คนถัดไป และคิวของไกด์คนนี้ย้ายไปลำดับสุดท้าย</p>
    <div class="mact"><button type="button" class="btn ghost" data-act="mcancel">ยกเลิก</button><button class="btn red" type="submit">บันทึกไม่ว่าง</button></div></form>`)},
  unavaildel:async el=>{const u=DB.unavail.find(x=>x.id===el.dataset.id);if(!await confirmBox('ลบวันไม่ว่าง?',`${esc(gName(DB,u.guideId))} · ${fmtDate(u.date)}<br><span class="sm mut">ลำดับคิวจะไม่ถูกย้ายกลับ (ปรับเองได้ด้วยปุ่ม ▲▼)</span>`,'ลบ','red'))return;call('unavailDel',{id:u.id})},
  userform:el=>openModal(userFormHTML(el.dataset.id&&DB.users.find(u=>u.id===el.dataset.id))),
  csv:()=>{const r=accRange(),L=DB.bookings.filter(b=>b.status==='paid'&&inR(b.date,r));const rows=[['date','code','guide','people','guide_fee','village','park','entry','total'],...L.map(b=>[b.date,b.code,gName(DB,b.guideId),b.people,b.split.guide,b.split.village,b.split.park,b.entryTotal,b.total])];
    navigator.clipboard?.writeText(rows.map(r=>r.join(',')).join('\n')).then(()=>toast('คัดลอก CSV แล้ว วางใน Excel/Sheets ได้เลย'),()=>toast('คัดลอกไม่ได้'))},
};
document.addEventListener('click',e=>{const el=e.target.closest('[data-act]');if(!el)return;if(el.tagName==='A')e.preventDefault();ACT[el.dataset.act]?.(el,e)});
document.getElementById('modal').addEventListener('click',e=>{if(e.target.id==='modal')ACT.mcancel()});
document.addEventListener('input',e=>{const k=e.target.dataset.bf;if(!k)return;bf[k]=e.target.value;if(k==='date'){bf.time=null;document.getElementById('slots').innerHTML=slotsHTML()}});
async function refreshVB(){if(!VB)return;const r=await post('/api/public/lookup',{code:VB.booking.code,phone:VB.phone});if(r.ok){VB.booking=r.booking;if(checkResult)checkResult.booking=r.booking;render()}}
let busy=false;
document.addEventListener('change',async e=>{
  const el=e.target,k=el.dataset.chg;
  if(el.dataset.slip){const f=el.files[0];if(!f||!VB)return;if(busy)return;busy=true;toast('กำลังอัปโหลด…');
    try{const data=await shrinkTo(f,1400,.8);if(!data){toast('อ่านไฟล์รูปไม่ได้');return}
      const blob=await (await fetch(data)).blob(),fd=new FormData();fd.append('file',new File([blob],'slip.jpg',{type:'image/jpeg'}));fd.append('code',VB.booking.code);fd.append('phone',VB.phone);fd.append('channel',payCh);
      const r=await api('/api/public/slip-upload',{method:'POST',body:fd});if(!r.ok){toast(r.error||'อัปโหลดไม่สำเร็จ');return}
      VB.booking=r.booking;if(checkResult)checkResult.booking=r.booking;toast('แนบหลักฐานแล้ว — รอเจ้าหน้าที่ตรวจสอบ');render()}finally{busy=false}return}
  if(el.dataset.up){const files=[...el.files];if(!files.length)return;const kind2=el.dataset.up;if(busy)return;busy=true;
    try{
    if(kind2==='gallery'){const urls=[];toast(`กำลังอัปโหลด ${files.length} รูป…`);for(const f of files){const d=await shrinkTo(f,1600,.8);if(d){const u=await uploadImg(d);if(u)urls.push(u)}}
      if(urls.length)await call('galleryAdd',{cat:cGalCat,urls});return}
    if(kind2==='stay'){toast('กำลังอัปโหลด…');for(const f of files){const d=await shrinkTo(f,1600,.8);if(d){const u=await uploadImg(d);if(u)draftImgs.push(u)}}document.getElementById('draftimgs').innerHTML=draftGal();el.value='';return}
    if(kind2==='hero'){const d=await shrinkTo(files[0],2000,.8);draftOne=d&&await uploadImg(d);if(draftOne)document.getElementById('up_hero').innerHTML=`<img src="${draftOne}" style="max-width:260px;border-radius:8px"> <span class="sm mut">ยังไม่บันทึก</span>`;return}
    if(kind2==='org'){const d=await shrinkTo(files[0],400,.85);draftOne=d&&await uploadImg(d);if(draftOne)document.getElementById('up_org').innerHTML=`<img src="${draftOne}" style="width:64px;height:64px;border-radius:50%;object-fit:cover"> <span class="sm mut">ยังไม่บันทึก</span>`;return}
    }finally{busy=false}}
  if(el.dataset.chimg){const f=el.files[0];if(!f)return;const k2=el.dataset.chimg;const d=await shrinkTo(f,1000,.9);const u=d&&await uploadImg(d);if(!u)return;chImgDraft[k2]=u;document.getElementById('chprev_'+k2).innerHTML=`<img src="${u}" style="max-width:160px;border-radius:8px;border:1px solid var(--line)"> <span class="sm mut">ยังไม่บันทึก</span>`;return}
  if(!k)return;
  if(k==='bkstatus')bkF.status=el.value;else if(k==='bkfrom')bkF.from=el.value;else if(k==='bkto')bkF.to=el.value;else if(k==='bkq')bkF.q=el.value;
  else if(k==='accfrom')acc.from=el.value;else if(k==='accto')acc.to=el.value;else if(k==='auf')auF=el.value;else if(k==='qdate')qDate=el.value||today();else if(k==='calfrom'){calR.from=el.value;if(calR.to<calR.from)calR.to=calR.from}else if(k==='calto')calR.to=el.value;
  else if(k==='reassign'){call('reassign',{id:el.dataset.id,guideId:el.value});return}
  render();
});
function showLb(src,cap){document.querySelector('.lb')?.remove();const d=document.createElement('div');d.className='lb';d.dataset.act='lbclose';d.innerHTML=`<img src="${src}">${cap?`<p>${esc(cap)}</p>`:''}<p class="sm" style="opacity:.7">แตะเพื่อปิด</p>`;document.body.appendChild(d)}
function shrinkTo(file,max,q){return new Promise(res=>{const r=new FileReader();r.onload=()=>{const img=new Image();img.onload=()=>{const k=Math.min(1,max/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.round(img.width*k);c.height=Math.round(img.height*k);c.getContext('2d').drawImage(img,0,0,c.width,c.height);res(c.toDataURL('image/jpeg',q))};img.onerror=()=>res(null);img.src=r.result};r.onerror=()=>res(null);r.readAsDataURL(file)})}
const fdOf=f=>Object.fromEntries(new FormData(f));
document.addEventListener('submit',async e=>{
  const f=e.target,kind=f.dataset.form;if(!kind)return;e.preventDefault();const fd=fdOf(f);
  const btn=f.querySelector('button[type=submit]');if(btn?.disabled)return;if(btn)btn.disabled=true;
  try{
  if(kind==='book'){
    Object.assign(bf,{name:fd.name.trim(),phone:fd.phone.trim(),email:fd.email.trim(),line:fd.line.trim(),note:fd.note.trim()});
    if(!bf.time)return toast('กรุณาเลือกเวลาออกเดินทาง');if(!bf.name)return toast('กรุณากรอกชื่อ-นามสกุล');
    const phone=bf.phone.replace(/\D/g,'');if(!/^0\d{8,9}$/.test(phone)&&!/^\d{8,15}$/.test(phone))return toast('กรุณากรอกเบอร์โทรให้ถูกต้อง');
    const r=await post('/api/public/createBooking',{...bf,pax:{...bf.pax},phone});
    if(!r.ok){toast(r.error||'จองไม่สำเร็จ');avKey='';document.getElementById('slots').innerHTML=slotsHTML();return}
    VB={booking:r.booking,phone};payCh=null;Object.assign(bf,{time:null,name:'',phone:'',email:'',line:'',note:''});avKey='';render();scrollTo(0,0);return}
  if(kind==='check'){const phone=fd.phone.replace(/\D/g,'');const r=await post('/api/public/lookup',{code:fd.code,phone});payCh=null;
    if(!r.ok){checkResult=null;toast(r.error||'ไม่พบการจอง');render();return}checkResult={booking:r.booking,phone};VB={booking:r.booking,phone};render();return}
  if(kind==='login'){const r=await post('/api/auth/login',{username:fd.username.trim(),password:fd.password});if(!r.ok)return toast(r.error||'เข้าสู่ระบบไม่สำเร็จ');
    await loadAdmin();page=ROLES[DB.me.role].pages[0];location.hash='admin-'+page;render();return}
  if(kind==='chpw'){if(fd.new!==fd.new2)return toast('รหัสผ่านใหม่ไม่ตรงกัน');if(await call('changePassword',{old:fd.old,new:fd.new}))closeModal();return}
  if(kind==='decline'){const reason=[fd.preset,(fd.reason||'').trim()].filter(Boolean).join(' — ');if(!reason)return toast('กรุณาระบุเหตุผล');
    if(await call('decline',{id:f.dataset.id,reason,wholeDay:!!fd.wholeDay}))closeModal();return}
  if(kind==='unavail'){if(await call('unavail',{guideId:fd.guideId,date:fd.date,reason:fd.reason}))closeModal();return}
  if(kind==='chome'){const p={title:fd.title,subtitle:fd.subtitle,intro:fd.intro};if(draftOne)p.hero=draftOne;if(await call('homeSave',p))draftOne=null;return}
  if(kind==='cabout'){call('aboutSave',{title:fd.title,body:fd.body});return}
  if(kind==='gcat'){const r=await call('gcatSave',{id:f.dataset.id||'',name:fd.name});if(r){if(r.id&&!f.dataset.id){cGalCat=r.id;render()}closeModal()}return}
  if(kind==='gcap'){if(await call('gimgCap',{id:f.dataset.id,caption:fd.caption}))closeModal();return}
  if(kind==='stay'){if(await call('staySave',{id:f.dataset.id||'',name:fd.name,desc:fd.desc,price:fd.price,phone:fd.phone,link:fd.link,imgs:[...draftImgs]}))closeModal();return}
  if(kind==='org'){const p={id:f.dataset.id||'',name:fd.name,pos:fd.pos,parent:fd.parent||'',order:fd.order};if(draftOne)p.photo=draftOne;if(await call('orgSave',p)){draftOne=null;closeModal()}return}
  if(kind==='season'){const k=fd.kind==='date'?'date':'month';if(await call('seasonSave',{id:f.dataset.id||'',name:fd.name,kind:k,from:k==='date'?fd.dfrom:fd.mfrom,to:k==='date'?fd.dto:fd.mto,active:!!fd.active}))closeModal();return}
  if(kind==='payments'){const p={...fd};['bank','promptpay','paypal','alipay','truemoney'].forEach(k=>p[k+'_on']=!!fd[k+'_on']);p.paypal_passFee=!!fd.paypal_passFee;
    for(const k in chImgDraft)p[k+'_image']=chImgDraft[k];if(await call('paymentsSave',p))chImgDraft={};return}
  if(kind==='reschedule'){if(await call('reschedule',{id:f.dataset.id,date:fd.date,time:fd.time}))closeModal();return}
  if(kind==='guide'){if(await call('guideSave',{...fd,id:f.dataset.id||'',active:!!fd.active,createAcct:!!fd.createAcct}))closeModal();return}
  if(kind==='user'){if(await call('userSave',{...fd,id:f.dataset.id||'',active:!!fd.active}))closeModal();return}
  if(kind==='settings'){call('settingsSave',fd);return}
  }finally{if(btn&&document.body.contains(btn))btn.disabled=false}
});
window.addEventListener('hashchange',async()=>{const h=location.hash.slice(1);if(h.startsWith('admin')&&DB)await loadAdmin();render()});

/* เริ่มต้น: โหลดข้อมูลสาธารณะ + ตรวจสถานะเข้าสู่ระบบ */
(async()=>{
  render();
  if(!await loadPub()){document.getElementById('app').innerHTML='<div class="card empty">เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง</div>';return}
  booted=true;bf.date=addDays(PUB.today,1);
  const [m,st]=await Promise.all([api('/api/auth/me'),api('/api/auth/status')]);AUTH.hasUsers=st.hasUsers!==false;
  if(m.me)await loadAdmin();
  render();
  setInterval(async()=>{if(DB&&location.hash.startsWith('#admin')&&!document.querySelector('#modal.show')){await loadAdmin();render()}},60000);
})();
