(() => {
  'use strict';
  const ELECTION_CONFIG_PREFIX='school-arts-sports-election-public-v2-';
  const SUMMARY_KEY_PREFIX='school-arts-sports-election-summary-v1-';
  const configKey=id=>`${ELECTION_CONFIG_PREFIX}${Number(id)}`;
  const summaryKey=id=>`${SUMMARY_KEY_PREFIX}${Number(id)}`;
  const $=selector=>document.querySelector(selector);
  const params=new URLSearchParams(location.search);
  const pollId=Number(params.get('poll'));
  const publicKey=params.get('key')||'';
  const panel=$('#poll-panel');
  let storageError=false;
  function readJson(key){try{const raw=localStorage.getItem(key);return raw===null?null:JSON.parse(raw);}catch{storageError=true;return null;}}
  function readElectionConfig(){if(!Number.isSafeInteger(pollId)||pollId<1||publicKey.length<8)return null;const config=readJson(configKey(pollId));return config&&typeof config==='object'&&config.publicKey===publicKey?config:null;}
  function readElectionSummary(electionId){const parsed=readJson(summaryKey(electionId));if(storageError)return {acceptedBallots:0,candidateCounts:{},corrupt:true};if(parsed===null)return {acceptedBallots:0,candidateCounts:{}};if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||!Number.isSafeInteger(Number(parsed.acceptedBallots))||Number(parsed.acceptedBallots)<0||!parsed.candidateCounts||typeof parsed.candidateCounts!=='object'||Array.isArray(parsed.candidateCounts))return {acceptedBallots:0,candidateCounts:{},corrupt:true};const counts={};for(const [key,value] of Object.entries(parsed.candidateCounts)){const n=Number(value);if(!/^\d+:\d+$/.test(key)||!Number.isSafeInteger(n)||n<0)return {acceptedBallots:0,candidateCounts:{},corrupt:true};counts[key]=n;}return {acceptedBallots:Number(parsed.acceptedBallots),candidateCounts:counts};}
  function schoolDateTimeMillis(value){
    if(!value)return NaN;
    const text=String(value),match=text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if(!match)return NaN;
    const [,year,month,day,hour,minute,second='0']=match;
    const [y,mo,d,h,mi,se]=[year,month,day,hour,minute,second].map(Number);
    const check=new Date(Date.UTC(y,mo-1,d,h,mi,se));
    if(check.getUTCFullYear()!==y||check.getUTCMonth()!==mo-1||check.getUTCDate()!==d||h>23||mi>59||se>59)return NaN;
    return check.getTime()-330*60*1000;
  }
  function formatSchoolTime(value){const time=schoolDateTimeMillis(value);return Number.isFinite(time)?new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(time)):String(value||'');}
  function isWindowOpen(election,now=Date.now()){const closes=schoolDateTimeMillis(election?.closeAt);return election?.status==='open'&&Number.isFinite(closes)&&now<closes;}
  function esc(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
  function chip(value){return `<span class="meta-chip">${esc(value)}</span>`;}
  function stateCard(title,message){panel.innerHTML=`<div class="state-card"><div class="state-icon">i</div><h2>${esc(title)}</h2><p>${esc(message)}</p></div>`;$('#live-indicator').textContent='WAITING';$('#live-indicator').classList.add('closed');}
  function render(){
    storageError=false;
    const election=readElectionConfig();
    if(storageError){$('#poll-title').textContent='Results unavailable';$('#poll-description').textContent='This browser could not access local election storage.';stateCard('Browser storage unavailable','Open this results link from the same local portal server used by the school, then try again.');return;}
    if(!election||typeof election.showLive!=='boolean'||typeof election.allowAbstain!=='boolean'||!Number.isFinite(schoolDateTimeMillis(election.openAt))||!Number.isFinite(schoolDateTimeMillis(election.closeAt))||schoolDateTimeMillis(election.closeAt)<=schoolDateTimeMillis(election.openAt)||!Array.isArray(election.positions)||!election.positions.length||election.positions.length>30||election.publicKey!==publicKey||publicKey.length<8){$('#poll-title').textContent='Results link unavailable';$('#poll-description').textContent='This link is incomplete or no longer associated with a poll.';stateCard('Poll not found','Ask the school administrator for the current results link.');return;}
    $('#school-name').textContent=election.schoolName||$('#school-name').textContent||'School';
    $('#poll-title').textContent=election.title;
    $('#poll-description').textContent=election.status==='published'?'Final school election results.':'Aggregate totals update as ballots are submitted.';
    const open=isWindowOpen(election),published=election.status==='published',summary=readElectionSummary(election.id),acceptedBallots=Number(summary.acceptedBallots)||0;
    if(summary.corrupt){stateCard('Results unavailable','The election result data is damaged. Ask the administrator to repair or reset the election before using this display.');return;}
    $('#poll-meta').innerHTML=chip(published?'Final results':open?'Live results':'Awaiting publication')+chip(`${acceptedBallots} recorded ballots`);
    const visible=published||(open&&election.showLive===true);
    if(!visible){const message=election.status==='draft'?'The poll has not opened yet.':election.status==='closed'?'Voting has closed. The school administrator has not published the final results yet.':'Live totals are hidden during voting. The school has chosen not to display interim standings.';stateCard('Results are not being displayed',message);return;}
    const candidateCounts=new Map(Object.entries(summary.candidateCounts||{}));
    const sections=election.positions.map(position=>{
      const counts=(position.candidates||[]).map(candidate=>({candidate,count:Number(candidateCounts.get(`${position.id}:${candidate.id}`))||0}));
      const max=Math.max(1,...counts.map(item=>item.count));
      return `<section class="position-results"><h2>${esc(position.name)}</h2>${counts.map(item=>`<div class="result-row"><span class="result-name">${esc(item.candidate.name)}</span><span class="result-track"><span class="result-fill" style="display:block;width:${Math.max(0,Math.min(100,item.count/max*100))}%"></span></span><span class="result-count">${item.count}</span></div>`).join('')}<div class="result-foot"><span>${counts.reduce((n,item)=>n+item.count,0)} votes for this position</span><span>Abstentions are not included in candidate totals</span></div></section>`;
    }).join('');
    panel.innerHTML=`<div class="results-summary"><div><strong>${acceptedBallots}</strong><small>Accepted anonymous ballots</small></div><span class="meta-chip">${published?'Finalised':'Live aggregate'}</span></div>${sections}<div class="warning-note">This display shows candidate totals only. Individual voter identities and ballot selections are not displayed or stored in each ballot record.</div>`;
    $('#live-indicator').textContent=published?'FINAL':'LIVE';$('#live-indicator').classList.toggle('closed',!open&&!published);
  }
  window.addEventListener('storage',event=>{if(event.key===configKey(pollId)||event.key===summaryKey(pollId))render();});
  render();
})();
