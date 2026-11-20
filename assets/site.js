(function(){
  'use strict';
  var $=function(s,r){return (r||document).querySelector(s)};
  var $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))};
  var reduced=window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- smooth scroll + anchors ---------- */
  var lenis=null;
  if(!reduced && window.Lenis){
    try{
      lenis=new Lenis({duration:1.1,smoothWheel:true});
      if(window.gsap && window.ScrollTrigger){
        gsap.registerPlugin(ScrollTrigger);
        lenis.on('scroll',ScrollTrigger.update);
        gsap.ticker.add(function(t){lenis.raf(t*1000)});
        gsap.ticker.lagSmoothing(0);
      }else{
        (function raf(t){lenis.raf(t);requestAnimationFrame(raf)})(0);
      }
    }catch(e){lenis=null}
  }
  function goTo(sel){
    var el=sel==='#top'?document.body:$(sel); if(!el) return;
    if(lenis){ lenis.scrollTo(sel==='#top'?0:el,{offset:-84}); }
    else if(sel==='#top'){ window.scrollTo({top:0,behavior:reduced?'auto':'smooth'}); }
    else{ var y=el.getBoundingClientRect().top+window.pageYOffset-84; window.scrollTo({top:y,behavior:reduced?'auto':'smooth'}); }
  }
  $$('[data-go]').forEach(function(a){
    a.addEventListener('click',function(e){
      e.preventDefault(); goTo(a.getAttribute('href'));
      $('#nav').classList.remove('open'); $('#menuBtn').setAttribute('aria-expanded','false');
    });
  });
  $('#menuBtn').addEventListener('click',function(){
    var o=$('#nav').classList.toggle('open'); this.setAttribute('aria-expanded',o?'true':'false');
  });

  /* ---------- entrance + reveals ---------- */
  if(!reduced && window.gsap){
    gsap.from('.rise',{y:26,opacity:0,duration:.9,stagger:.09,ease:'power3.out',delay:.1,clearProps:'transform,opacity'});
    if(window.ScrollTrigger){
      ScrollTrigger.batch('.reveal',{start:'top 94%',once:true,onEnter:function(els){
        gsap.fromTo(els,{y:30},{y:0,duration:.8,stagger:.08,ease:'power3.out',overwrite:true,clearProps:'transform'});
      }});
    }
  }

  /* ---------- data map ---------- */
  var MAP={
    bank:{
      collect:{ex:['KYC documents when a member opens an account','Loan applications with income and collateral details','Nominee and family details on forms'],q:['Is every field needed for the stated purpose?','Was consent, or another lawful ground, recorded at the counter and on the app?']},
      store:{ex:['Core banking system and its database','Branch ledgers and paper files','Staff laptops, shared drives and email','Backup disks and cloud copies'],q:['How many copies exist, and who can open each one?','Which fields are encrypted or masked?']},
      use:{ex:['Loan appraisal and recovery follow-up','Statements, SMS and app alerts','Reports for management and auditors'],q:['Is each use covered by what the notice says?','Who can see full records, and is that access logged?']},
      share:{ex:['Core banking, mobile app and SMS vendors','Credit information companies','Auditors, regulators and legal advisers'],q:['Which vendors hold personal data on your behalf?','Do contracts require safeguards and prompt breach reporting?']}
    },
    ent:{
      collect:{ex:['Website forms, sign-ups and enquiries','Orders with delivery addresses and phone numbers','Job applications and employee records'],q:['Do you ask for more than you need?','Can a person see why you are asking, at the moment you ask?']},
      store:{ex:['CRM and cloud business apps','Spreadsheets and email attachments','Support inboxes and chat tools','Backups'],q:['Where do personal copies hide outside the main system?','Who still has access after changing roles?']},
      use:{ex:['Marketing campaigns and analytics','Customer support and order handling','Payroll and HR processes'],q:['Is marketing use covered by consent?','Can you switch it off for one person quickly?']},
      share:{ex:['Payment gateways and delivery partners','Analytics, advertising and email tools','Hosting and cloud providers'],q:['Do you have a current list of every provider?','What happens to the data when a contract ends?']}
    }
  };
  var mapState={aud:'bank',stage:'collect'};
  function renderMap(){
    var d=MAP[mapState.aud][mapState.stage];
    $('#mapPanel').innerHTML='<div><h4>Where it shows up</h4><ul>'+d.ex.map(function(x){return '<li>'+x+'</li>'}).join('')+'</ul></div>'+
      '<div class="q"><h4>Questions to answer</h4><ul>'+d.q.map(function(x){return '<li>'+x+'</li>'}).join('')+'</ul></div>';
  }
  $$('#audSeg button').forEach(function(b){b.addEventListener('click',function(){
    mapState.aud=b.dataset.aud; $$('#audSeg button').forEach(function(x){x.setAttribute('aria-pressed',x===b?'true':'false')}); renderMap();
  })});
  $$('#flow button').forEach(function(b){b.addEventListener('click',function(){
    mapState.stage=b.dataset.stage; $$('#flow button').forEach(function(x){x.setAttribute('aria-selected',x===b?'true':'false')}); renderMap();
  })});
  renderMap();

  /* ---------- notice builder ---------- */
  var NB=[
    {id:'data',t:'What data you collect',s:'Name the personal data in plain words.',h:'<b>What we collect.</b> We collect <span class="ph">[name, phone number, address and identity documents]</span>.'},
    {id:'purpose',t:'Why you need it',s:'One clear purpose for each use.',h:'<b>Why we need it.</b> We use it to <span class="ph">[open your account, process your request or provide the service]</span>.'},
    {id:'share',t:'Who receives it',s:'Service providers, regulators and others.',h:'<b>Who receives it.</b> We share it only where needed with <span class="ph">[service providers, auditors or regulators]</span>.'},
    {id:'withdraw',t:'How to withdraw consent',s:'As easy to do as it was to give.',h:'<b>Withdrawing consent.</b> You can withdraw your consent at any time by contacting <span class="ph">[contact point]</span>. What we did before you withdrew remains valid.'},
    {id:'rights',t:'How to use your rights',s:'Access, correction, erasure, nomination.',h:'<b>Your rights.</b> You can ask to see, correct or erase your personal data, and nominate someone to act for you. Write to <span class="ph">[contact point]</span>.'},
    {id:'complain',t:'How to complain',s:'Your grievance contact, then the Board.',h:'<b>Complaints.</b> Write to our grievance contact at <span class="ph">[name and email]</span>. If your concern is not resolved, you may approach the Data Protection Board of India.'},
    {id:'lang',t:'Available in your language',s:'English plus a regional language.',h:'<b>Language.</b> This notice is available in English and Odia. Ask us if you need another language listed in the Eighth Schedule of the Constitution.'}
  ];
  var nbOn={data:true,purpose:true,share:false,withdraw:true,rights:false,complain:false,lang:false};
  function renderNB(){
    $('#nbChecks').innerHTML='<h3 style="font-size:1.3rem;margin-bottom:4px">Notice elements</h3>'+NB.map(function(n){
      return '<label class="chk"><input type="checkbox" data-id="'+n.id+'"'+(nbOn[n.id]?' checked':'')+'><span><b>'+n.t+'</b><small>'+n.s+'</small></span></label>';
    }).join('');
    $$('#nbChecks input').forEach(function(i){i.addEventListener('change',function(){nbOn[i.dataset.id]=i.checked;renderNBPreview()})});
    renderNBPreview();
  }
  function renderNBPreview(){
    var on=NB.filter(function(n){return nbOn[n.id]});
    $('#nbPreview').innerHTML='<h3>Privacy notice</h3>'+(on.length?on.map(function(n){return '<p>'+n.h+'</p>'}).join(''):'<p class="empty">Tick an element to start building your notice.</p>')+
      '<p style="font-size:.8rem;color:#5C6770;margin-top:14px">'+on.length+' of '+NB.length+' elements included. Sample wording only.</p>';
  }
  renderNB();

  /* ---------- roadmap (Netravex brochure, 4 phases over 30 days) ---------- */
  var ROAD=[
    {k:'Phase 1',days:'Days 1–5',end:5,t:'Appoint a sponsor and coordinator',d:'Set up ownership so the work has a sponsor, a coordinator and a clear scope.',
      a:['Appoint a DPDP sponsor.','Nominate a coordinator and a small working team.','Agree on the scope and key stakeholders.','Hold a kickoff meeting and set expectations.']},
    {k:'Phase 2',days:'Days 6–12',end:12,t:'List systems and map data and vendors',d:'Find out where personal data lives and who else handles it.',
      a:['List all systems that collect, store, or process personal data.','Identify types of personal data and where they are stored.','Map third-party vendors and service providers.','Note cross-border transfers, if any.']},
    {k:'Phase 3',days:'Days 13–20',end:20,t:'Review notices, consent, rights, and security',d:'Check what you already do against what the Act expects.',
      a:['Review privacy notices and consent flows.','Test rights-request and grievance submission routes.','Check user access and role permissions.','Review logging and monitoring practices.','Check backup, recovery, data protection, and system patching.']},
    {k:'Phase 4',days:'Days 21–30',end:30,t:'Prepare an incident playbook and roadmap',d:'Get ready for a bad day, then agree what to fix first.',
      a:['Draft incident contacts and an escalation list.','Prepare a simple incident-response playbook.','Prioritise gaps and quick wins.','Agree on next steps and a realistic roadmap.']}
  ];
  function renderRoad(i){
    var r=ROAD[i];
    $('#roadPanel').innerHTML='<div><p class="tag">'+r.k+' · '+r.days+'</p><h3>'+r.t+'</h3><p>'+r.d+'</p></div><div><ul>'+r.a.map(function(x){return '<li>'+x+'</li>'}).join('')+'</ul></div>';
    $('#roadBar').style.width=(r.end/30*100)+'%';
    $$('#roadTabs button').forEach(function(b,j){b.setAttribute('aria-selected',j===i?'true':'false')});
  }
  $$('#roadTabs button').forEach(function(b){b.addEventListener('click',function(){renderRoad(+b.dataset.w)})});
  renderRoad(0);

  /* ---------- scorecard (ten areas live in assets/areas.js) ---------- */
  var Q=window.NETRAVEX_AREAS;
  var ans=Q.map(function(){return null});   /* starts blank: nothing is sent unless the visitor answers */
  var LAB=['No','Partly','Yes'];
  function renderQ(){
    $('#qlist').innerHTML=Q.map(function(q,i){
      return '<div class="q"><div><b>'+(i+1)+'. '+q.t+'</b><small>'+q.h+'</small></div><div class="seg" role="group" aria-label="'+q.t+'">'+
        [0,1,2].map(function(v){return '<button type="button" class="v'+v+'" data-i="'+i+'" data-v="'+v+'" aria-pressed="'+(ans[i]===v?'true':'false')+'">'+LAB[v]+'</button>'}).join('')+'</div></div>';
    }).join('');
    $$('#qlist button').forEach(function(b){b.addEventListener('click',function(){
      var i=+b.dataset.i, v=+b.dataset.v; ans[i]=(ans[i]===v)?null:v; renderQ(); renderScore();
    })});
  }
  function bandFor(p,n){
    if(!n) return ['Not started','Answer the ten areas to see your score.','var(--muted)'];
    if(p<40) return ['Early stage','Most foundations are still to be laid. Start with the data inventory and the breach response process.','var(--danger)'];
    if(p<70) return ['Building','Some good practice exists. Closing the gaps below will lift the score fastest.','var(--warm)'];
    if(p<90) return ['Nearly ready','Most areas are covered. Test them with real requests and a drill.','var(--accent)'];
    return ['Ready to maintain','Strong across the board. Keep reviewing access, vendors and notices on a schedule.','var(--accent)'];
  }
  function summary(){
    var n=ans.filter(function(a){return a!==null}).length, sum=ans.reduce(function(s,a){return s+(a||0)},0), p=Math.round(sum/20*100);
    return {n:n,p:p,b:bandFor(p,n)};
  }
  function renderScore(){
    var s=summary();
    $('#pct').textContent=s.p+'%';
    $('#arc').style.strokeDashoffset=String(326.7*(1-s.p/100));
    $('#arc').style.stroke=s.b[2];
    $('#answered').textContent=s.n+' of 10 answered';
    $('#band').textContent=s.b[0]; $('#bandText').textContent=s.b[1];
    var gaps=[];
    Q.forEach(function(q,i){ if(ans[i]===0) gaps.push({k:0,q:q}); });
    Q.forEach(function(q,i){ if(ans[i]===1) gaps.push({k:1,q:q}); });
    $('#gaps').innerHTML=gaps.slice(0,5).map(function(g){
      return '<li><i class="'+(g.k===0?'no':'part')+'">'+(g.k===0?'No':'Partly')+'</i><span><b>'+g.q.t+'.</b> '+g.q.h+'</span></li>';
    }).join('') || (s.n?'<li><span>No gaps flagged. Every answered area is a Yes.</span></li>':'');
    syncAttach(s);
  }
  $('#resetBtn').addEventListener('click',function(){ans=Q.map(function(){return null});renderQ();renderScore();$('#scoreStatus').textContent='Cleared. Rate each area to build your score.'});

  /* ---------- enquiry form ---------- */
  var cfg=window.NETRAVEX_CONFIG||{};
  var live=!!(cfg.supabaseUrl&&cfg.supabaseAnonKey);
  var endpoint=live?cfg.supabaseUrl.replace(/\/+$/,'')+'/functions/v1/submit-enquiry':'';
  var outDefault=$('#outPanel').innerHTML;
  function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function copyText(text,statusEl,okMsg){
    function fallback(){
      var ta=document.createElement('textarea'); ta.value=text; ta.setAttribute('readonly',''); ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select();
      var ok=false; try{ok=document.execCommand('copy')}catch(e){} document.body.removeChild(ta);
      statusEl.textContent=ok?okMsg:'Copy was blocked. Select the text and copy it manually.';
    }
    try{ navigator.clipboard.writeText(text).then(function(){statusEl.textContent=okMsg},fallback); }catch(e){fallback()}
  }
  function syncAttach(s){
    var row=$('#attachRow'); if(!row) return;
    row.hidden=!s.n;
    if(s.n) $('#attachText').textContent='Attach my scorecard result ('+s.p+'%, '+s.b[0]+')';
  }
  function clearBad(){ $$('#form .bad').forEach(function(el){el.classList.remove('bad');el.removeAttribute('aria-invalid')}); }
  function flag(id){ var el=$(id); if(el){el.classList.add('bad');el.setAttribute('aria-invalid','true');} }
  function validate(v){
    clearBad();
    if(v.fullName.length<2){flag('#fName');return 'Please enter your name.';}
    if(v.organization.length<2){flag('#fOrg');return 'Please enter your organisation.';}
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)){flag('#fEmail');return 'Please enter a valid email address so we can reply.';}
    if(v.phone&&!/^[0-9+()\-\s]{5,20}$/.test(v.phone)){flag('#fPhone');return 'Phone numbers can only contain digits, spaces, + ( ) and -.';}
    if(!v.consent){flag('#fConsent');return 'Please tick the consent box so we can contact you about this enquiry.';}
    return '';
  }
  function showOut(html){
    var p=$('#outPanel'); p.innerHTML=html;
    var back=$('#outBack'); if(back) back.addEventListener('click',function(){p.innerHTML=outDefault;});
    var cp=$('#copyRef'); if(cp) cp.addEventListener('click',function(){copyText(cp.dataset.ref,$('#outStatus'),'Reference copied.');});
  }
  function renderSuccess(j,payload){
    var first=esc(payload.fullName.split(/\s+/)[0]);
    showOut('<p class="eyebrow">Enquiry received</p><h3>Thank you, '+first+'.</h3>'+
      '<div class="ref-box"><span>Your reference number</span><b class="mono">'+esc(j.referenceId)+'</b></div>'+
      (j.emailSent
        ? '<p class="muted">A short confirmation was sent to <b style="color:var(--fg)">'+esc(payload.email)+'</b>. If it does not arrive in a few minutes, check your spam folder.</p>'
        : '<div class="warn">Your enquiry is saved, but the confirmation email could not be sent. Please keep this reference number. The team will still reply to you.</div>')+
      '<div class="row"><button type="button" class="btn" id="copyRef" data-ref="'+esc(j.referenceId)+'">Copy reference</button><button type="button" class="btn" id="outBack">Send another enquiry</button></div><div class="status" id="outStatus"></div>');
  }
  function renderDemo(payload){
    var shown={fullName:payload.fullName,organization:payload.organization,orgType:payload.orgType,role:payload.role,email:payload.email,phone:payload.phone,focusArea:payload.focusArea,message:payload.message,answers:payload.answers,consent:payload.consent};
    showOut('<p class="eyebrow">Demo mode</p><h3>Nothing was sent.</h3>'+
      '<div class="warn">This copy of the site is not connected to a backend yet, so nothing was stored and no email was sent. Add your Supabase URL and anon key in <b>config.js</b> to go live.</div>'+
      '<p class="muted">This is what the site would send to the <span class="mono">submit-enquiry</span> function:</p>'+
      '<pre>'+esc(JSON.stringify(shown,null,2))+'</pre>'+
      '<div class="row"><button type="button" class="btn" id="outBack">Back</button></div>');
  }
  $('#form').addEventListener('submit',function(e){
    e.preventDefault();
    var s=summary(), attach=!$('#attachRow').hidden&&$('#fAttach').checked;
    var payload={
      fullName:$('#fName').value.trim(), organization:$('#fOrg').value.trim(), orgType:$('#fType').value,
      role:$('#fRole').value.trim(), email:$('#fEmail').value.trim(), phone:$('#fPhone').value.trim(),
      focusArea:$('#fFocus').value, message:$('#fMsg').value.trim(),
      answers:(attach&&s.n)?ans.slice():null, consent:$('#fConsent').checked, website:$('#fWebsite').value
    };
    var problem=validate(payload);
    if(problem){ $('#fErr').textContent=problem; return; }
    $('#fErr').textContent='';
    if(!live){ renderDemo(payload); return; }

    var btn=$('#fSubmit'); btn.disabled=true; btn.textContent='Sending…';
    var ctrl=('AbortController' in window)?new AbortController():null;
    var timer=setTimeout(function(){ if(ctrl) ctrl.abort(); },20000);
    fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','apikey':cfg.supabaseAnonKey},body:JSON.stringify(payload),signal:ctrl?ctrl.signal:undefined})
      .then(function(r){ return r.json().catch(function(){return {}}).then(function(j){return {ok:r.ok,j:j}}); })
      .then(function(res){
        if(res.ok&&res.j.success){ renderSuccess(res.j,payload); $('#form').reset(); }
        else{ $('#fErr').textContent=res.j.error||'Your enquiry could not be sent. Please try again.'; }
      })
      .catch(function(){ $('#fErr').textContent='We could not reach the server. Check your connection and try again.'; })
      .then(function(){ clearTimeout(timer); btn.disabled=false; btn.textContent='Send enquiry'; });
  });
  renderQ(); renderScore();

  /* ---------- WebGL hero scene ---------- */
  function initScene(){
    if(!window.THREE) return;
    var canvas=$('#bg'), renderer;
    try{ renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true,alpha:true}); }catch(e){ return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
    var scene=new THREE.Scene();
    var camera=new THREE.PerspectiveCamera(45,1,.1,100); camera.position.set(0,0,9);
    var group=new THREE.Group(); scene.add(group);
    var cAccent=new THREE.Color(0x52D6C4), cWarm=new THREE.Color(0xF0A63A), cDim=new THREE.Color(0x4B6B82);

    group.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.32,1),new THREE.MeshBasicMaterial({color:0x0C1822})));
    var wire=new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(1.4,1)),new THREE.LineBasicMaterial({color:cAccent,transparent:true,opacity:.9}));
    group.add(wire);

    var rings=[];
    for(var i=0;i<3;i++){
      var R=2.1+i*.5;
      var ring=new THREE.Mesh(new THREE.TorusGeometry(R,.012,8,180),new THREE.MeshBasicMaterial({color:i===1?cWarm:cAccent,transparent:true,opacity:.5}));
      ring.rotation.x=1.1+i*.55; ring.rotation.y=i*.7;
      var dot=new THREE.Mesh(new THREE.SphereGeometry(.07,12,12),new THREE.MeshBasicMaterial({color:cWarm}));
      dot.position.set(R,0,0); ring.add(dot);
      ring.userData.speed=.22+i*.11; rings.push(ring); group.add(ring);
    }

    var N=1100, pos=new Float32Array(N*3), col=new Float32Array(N*3);
    for(var j=0;j<N;j++){
      var r=2.9+Math.random()*3.6, th=Math.random()*Math.PI*2, ph=Math.acos(2*Math.random()-1);
      pos[j*3]=r*Math.sin(ph)*Math.cos(th); pos[j*3+1]=r*Math.sin(ph)*Math.sin(th); pos[j*3+2]=r*Math.cos(ph);
      var c=Math.random()<.08?cWarm:(Math.random()<.22?cAccent:cDim);
      col[j*3]=c.r; col[j*3+1]=c.g; col[j*3+2]=c.b;
    }
    var pg=new THREE.BufferGeometry();
    pg.setAttribute('position',new THREE.BufferAttribute(pos,3)); pg.setAttribute('color',new THREE.BufferAttribute(col,3));
    var pts=new THREE.Points(pg,new THREE.PointsMaterial({size:.05,vertexColors:true,transparent:true,opacity:.85}));
    scene.add(pts);

    var mx=0,my=0,tx=0,ty=0;
    window.addEventListener('pointermove',function(e){ tx=(e.clientX/window.innerWidth-.5)*2; ty=(e.clientY/window.innerHeight-.5)*2; },{passive:true});

    function resize(){
      var w=window.innerWidth,h=window.innerHeight;
      renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix();
      if(w>900){ group.position.set(2.9,0,0); group.scale.setScalar(1); }
      else{ group.position.set(0,2.1,0); group.scale.setScalar(.72); }
      if(reduced) draw(0);
    }
    var clock=new THREE.Clock();
    function draw(dt){
      var t=clock.elapsedTime, sp=Math.min(window.pageYOffset/window.innerHeight,3);
      mx+=(tx-mx)*.05; my+=(ty-my)*.05;
      group.rotation.y=t*.12+sp*1.3+mx*.35;
      group.rotation.x=my*.22+sp*.35;
      rings.forEach(function(r){ r.rotation.z+=dt*r.userData.speed; });
      pts.rotation.y=-t*.025;
      camera.position.z=9+sp*1.6;
      canvas.style.opacity=String(Math.max(.22,1-sp*.7));
      renderer.render(scene,camera);
    }
    window.addEventListener('resize',resize);
    resize();
    if(reduced){ return; }
    (function loop(){ requestAnimationFrame(loop); draw(Math.min(clock.getDelta(),.05)); })();
  }
  initScene();
})();
