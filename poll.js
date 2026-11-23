(() => {
  'use strict';
  const ELECTION_CONFIG_PREFIX='school-arts-sports-election-public-v2-';
  const BALLOT_CHUNK_PREFIX='school-arts-sports-election-ballot-chunk-v2-';
  const BALLOT_META_PREFIX='school-arts-sports-election-ballot-meta-v2-';
  const SUMMARY_KEY_PREFIX='school-arts-sports-election-summary-v1-';
  const BALLOT_CHUNK_SIZE=250;
  const MAX_BALLOT_CHUNKS=5000;
  const MAX_BALLOTS=MAX_BALLOT_CHUNKS*BALLOT_CHUNK_SIZE;
  const configKey=id=>`${ELECTION_CONFIG_PREFIX}${Number(id)}`;
  const chunkKey=(id,chunk)=>`${BALLOT_CHUNK_PREFIX}${Number(id)}-${Number(chunk)}`;
  const metaKey=id=>`${BALLOT_META_PREFIX}${Number(id)}`;
  const summaryKey=id=>`${SUMMARY_KEY_PREFIX}${Number(id)}`;
  const $=selector=>document.querySelector(selector);
  const params=new URLSearchParams(location.search);
  const pollId=Number(params.get('poll'));
  const publicKey=params.get('key')||'';
  const panel=$('#poll-panel');
  let storageError=false;

  function readJson(key){
    try{
      const raw=localStorage.getItem(key);
      return raw===null?null:JSON.parse(raw);
    }catch(err){storageError=true;return null;}
  }
  function readJsonStrict(key,fallback){
    try{
      const raw=localStorage.getItem(key);
      if(raw===null)return fallback;
      const parsed=JSON.parse(raw);
      if(parsed===null||typeof parsed!=='object')throw new Error('Stored election data is malformed.');
      return parsed;
    }catch(err){storageError=true;throw new Error('Stored election data is malformed or unavailable.');}
  }
  function readElectionConfig(){
    if(!Number.isSafeInteger(pollId)||pollId<1||publicKey.length<8)return null;
    const config=readJson(configKey(pollId));
    return config&&typeof config==='object'&&config.publicKey===publicKey?config:null;
  }
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
  function formatSchoolTime(value){
    const time=schoolDateTimeMillis(value);
    return Number.isFinite(time)?new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(time)):String(value||'');
  }
  function isWindowOpen(election,now=Date.now()){
    const closes=schoolDateTimeMillis(election?.closeAt);
    return election?.status==='open'&&Number.isFinite(closes)&&now<closes;
  }
  function validElection(election){
    if(!election||!Number.isSafeInteger(pollId)||pollId<1||publicKey.length<8||String(election.title||'').trim().length<1||String(election.title||'').length>100)return false;
    if(!['draft','open','closed','published'].includes(election.status)||typeof election.publicKey!=='string'||election.publicKey!==publicKey)return false;
    if(typeof election.showLive!=='boolean'||typeof election.allowAbstain!=='boolean')return false;
    const opens=schoolDateTimeMillis(election.openAt),closes=schoolDateTimeMillis(election.closeAt);
    if(!Number.isFinite(opens)||!Number.isFinite(closes)||closes<=opens||!Array.isArray(election.positions)||election.positions.length<1||election.positions.length>30)return false;
    const positionIds=new Set();let totalCandidates=0;
    for(const position of election.positions){
      const positionId=Number(position?.id);
      if(!Number.isSafeInteger(positionId)||positionId<1||positionIds.has(positionId)||!String(position?.name||'').trim()||String(position.name).length>80||!Array.isArray(position.candidates)||position.candidates.length<1||position.candidates.length>100)return false;
      positionIds.add(positionId);totalCandidates+=position.candidates.length;
      const candidateIds=new Set();
      for(const candidate of position.candidates){
        const candidateId=Number(candidate?.id);
        if(!Number.isSafeInteger(candidateId)||candidateId<1||candidateIds.has(candidateId)||!String(candidate?.name||'').trim()||String(candidate.name).length>80||String(candidate.classLabel||'').length>40||String(candidate.details||'').length>240)return false;
        candidateIds.add(candidateId);
      }
    }
    return totalCandidates<=1000;
  }
  function randomId(){
    const bytes=new Uint8Array(20);
    if(!window.crypto?.getRandomValues)throw new Error('Secure random generation is not available in this browser.');
    window.crypto.getRandomValues(bytes);
    return 'anon-'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  }
  function esc(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
  function chip(value){return `<span class="meta-chip">${esc(value)}</span>`;}
  function showState(title,message,kind='info'){
    panel.innerHTML=`<div class="state-card ${kind==='success'?'success-state':''}"><div class="state-icon">${kind==='success'?'✓':'i'}</div><h2>${esc(title)}</h2><p>${esc(message)}</p></div>`;
  }
  function readBallotMeta(){
    let raw;try{raw=localStorage.getItem(metaKey(pollId));}catch{throw new Error('Election ballot storage is unavailable.');}
    if(raw===null)return {count:0,lastChunk:0};
    let meta;try{meta=JSON.parse(raw);}catch{throw new Error('Election ballot storage is malformed.');}
    const count=Number(meta?.count),lastChunk=Number(meta?.lastChunk),expected=Math.max(0,Math.ceil(count/BALLOT_CHUNK_SIZE)-1);
    if(!meta||typeof meta!=='object'||Array.isArray(meta)||!Number.isSafeInteger(count)||count<0||count>MAX_BALLOTS||!Number.isSafeInteger(lastChunk)||lastChunk<0||lastChunk>=MAX_BALLOT_CHUNKS||lastChunk!==expected)throw new Error('Election ballot storage is malformed or inconsistent.');
    return {count,lastChunk};
  }
  function readChunk(chunk,required=false){
    let raw;try{raw=localStorage.getItem(chunkKey(pollId,chunk));}catch{throw new Error('Election ballot storage is unavailable.');}
    if(raw===null){if(required)throw new Error('An election ballot chunk is missing. Ask the administrator to recover or reset this election.');return [];}
    let parsed;try{parsed=JSON.parse(raw);}catch{throw new Error('Election ballot storage is malformed.');}
    if(!Array.isArray(parsed)||parsed.length>BALLOT_CHUNK_SIZE||parsed.some(ballot=>!ballot||typeof ballot.id!=='string'||!/^anon-[a-f0-9]{16,}$/i.test(ballot.id)||!ballot.choices||typeof ballot.choices!=='object'||Array.isArray(ballot.choices)))throw new Error('Election ballot storage contains an invalid chunk.');
    return parsed;
  }
  function appendBallot(ballot){
    const previousMeta=readBallotMeta();
    if(previousMeta.count>=MAX_BALLOTS)throw new Error('This election has reached the browser trial ballot storage limit.');
    const previousChunk=readChunk(previousMeta.lastChunk,previousMeta.count>0);
    const expectedLast=previousMeta.count===0?0:(previousMeta.count%BALLOT_CHUNK_SIZE||BALLOT_CHUNK_SIZE);
    if(previousChunk.length!==expectedLast)throw new Error('Election ballot count and stored chunks do not match. Ask the administrator to recover or reset this election.');
    const nextChunk=previousChunk.length>=BALLOT_CHUNK_SIZE?previousMeta.lastChunk+1:previousMeta.lastChunk;
    const values=previousChunk.length>=BALLOT_CHUNK_SIZE?[ballot]:[...previousChunk,ballot];
    const nextMeta={count:previousMeta.count+1,lastChunk:nextChunk};
    try{
      localStorage.setItem(chunkKey(pollId,nextChunk),JSON.stringify(values));
      localStorage.setItem(metaKey(pollId),JSON.stringify(nextMeta));
      return {ok:true,previousMeta,previousChunk,nextChunk};
    }catch(error){
      try{
        if(previousChunk.length) localStorage.setItem(chunkKey(pollId,previousMeta.lastChunk),JSON.stringify(previousChunk));
        else localStorage.removeItem(chunkKey(pollId,previousMeta.lastChunk));
        localStorage.setItem(metaKey(pollId),JSON.stringify(previousMeta));
        if(nextChunk!==previousMeta.lastChunk)localStorage.removeItem(chunkKey(pollId,nextChunk));
      }catch{}
      return {ok:false,error};
    }
  }
  function updateSummary(election,choices){
    let previousSummary;
    try{previousSummary=readJsonStrict(summaryKey(election.id),{acceptedBallots:0,candidateCounts:{}});}catch(error){return {ok:false,error};}
    if(!Number.isSafeInteger(Number(previousSummary.acceptedBallots))||Number(previousSummary.acceptedBallots)<0||!previousSummary.candidateCounts||typeof previousSummary.candidateCounts!=='object'||Array.isArray(previousSummary.candidateCounts))return {ok:false,error:new Error('The election result summary is malformed.')};
    const candidateCounts={};
    for(const [key,value] of Object.entries(previousSummary.candidateCounts)){const count=Number(value);if(!/^\d+:\d+$/.test(key)||!Number.isSafeInteger(count)||count<0)return {ok:false,error:new Error('The election result summary contains invalid totals.')};candidateCounts[key]=count;}
    const next={acceptedBallots:Number(previousSummary.acceptedBallots)+1,candidateCounts};
    for(const [positionId,candidateId] of Object.entries(choices)){const key=`${positionId}:${candidateId}`;next.candidateCounts[key]=(next.candidateCounts[key]||0)+1;}
    try{localStorage.setItem(summaryKey(election.id),JSON.stringify(next));return {ok:true,previousSummary};}
    catch(error){return {ok:false,error,previousSummary};}
  }
  async function withElectionWriteLock(electionId,work){
    const name=`school-election-write-${Number(electionId)}`;
    if(!navigator.locks?.request)throw new Error('This browser cannot safely coordinate ballots across tabs. Use the latest Chrome or Edge browser on this computer.');
    return navigator.locks.request(name,{mode:'exclusive'},work);
  }

  function render(){
    storageError=false;
    const election=readElectionConfig();
    if(storageError){
      $('#poll-title').textContent='Voting unavailable';
      $('#poll-description').textContent='This browser could not access its local election storage.';
      showState('Browser storage unavailable','Open the voting link from the same local portal server used by the school, then try again.');
      return;
    }
    if(!election){
      $('#poll-title').textContent='Voting link unavailable';
      $('#poll-description').textContent='This link is incomplete, invalid or no longer associated with an active poll.';
      showState('Poll not found','Ask the school administrator for the current voting link.');
      return;
    }
    $('#school-name').textContent=election.schoolName||$('#school-name').textContent||'School';
    $('#poll-title').textContent=election.title;
    $('#poll-description').textContent='Select one candidate for each position, review your choices, then submit your anonymous ballot. The ballot clears for the next voter.';
    const positionsReady=Array.isArray(election.positions)&&election.positions.length>0&&election.positions.every(p=>Array.isArray(p.candidates)&&p.candidates.length>0);
    $('#poll-meta').innerHTML=chip(`${Array.isArray(election.positions)?election.positions.length:0} positions`)+chip(isWindowOpen(election)?'Voting is open':election.status==='published'?'Voting completed':'Voting not open')+chip(`Closes ${formatSchoolTime(election.closeAt)} IST`);
    if(!validElection(election)){showState('Poll not ready','The shared election data is incomplete or invalid. Ask the administrator for a fresh voting link.');return;}
    if(!positionsReady){showState('Poll is not ready','The school has not finished adding positions and candidates to this election.');return;}
    if(!isWindowOpen(election)){
      const message=election.status==='draft'?'The school has not opened this poll yet.':election.status==='published'?'Voting has ended. Final results are available on the separate results display.':'The voting window is closed. Ask the school for information if you believe this is an error.';
      showState('Voting is unavailable',message);return;
    }
    const positions=election.positions.map(position=>`<fieldset class="position-block"><legend>${esc(position.name)}</legend><div class="candidate-grid">${position.candidates.map(candidate=>`<label class="candidate-option"><input type="radio" name="position-${position.id}" value="${candidate.id}"><span class="candidate-avatar">${esc(String(candidate.name||'?').trim().split(/\s+/).slice(0,2).map(word=>word[0]||'').join('').toUpperCase())}</span><span class="candidate-copy"><strong>${esc(candidate.name)}</strong><small>${esc(candidate.classLabel||'Candidate')}</small>${candidate.details?`<small class="candidate-details">${esc(candidate.details)}</small>`:''}</span></label>`).join('')}${election.allowAbstain?`<label class="candidate-option"><input type="radio" name="position-${position.id}" value="__abstain__"><span class="candidate-avatar">—</span><span class="candidate-copy"><strong>Abstain</strong><small>Do not select a candidate for this position</small></span></label>`:''}</div></fieldset>`).join('');
    panel.innerHTML=`<form id="ballot-form" novalidate>${positions}<div class="submit-row"><p class="submit-note">Your selections are saved as an anonymous ballot. After submission, the ballot clears so the next person can vote.</p><button class="poll-button" type="submit">Review and submit ballot</button></div></form><div class="warning-note">This is a browser-local trial ballot. No voter identity is collected. The supervised process relies on the device being handed to the next voter after the ballot is recorded.</div>`;
    $('#ballot-form').addEventListener('submit',submitBallot);
  }
  function showNextVoter(){
    panel.innerHTML=`<div class="state-card success-state"><div class="state-icon">✓</div><h2>Ballot recorded</h2><p>Your anonymous ballot has been saved. No voter identity was collected. Pass the device to the next person, then clear the ballot for them.</p><button class="poll-button" id="next-voter" type="button">Clear ballot for next voter</button></div>`;
    $('#next-voter').addEventListener('click',render);
  }
  async function submitBallot(event){
    event.preventDefault();
    const formElement=event.currentTarget;
    const election=readElectionConfig();
    if(!validElection(election)||!isWindowOpen(election)){render();return;}
    const form=new FormData(formElement),choices={};
    for(const position of election.positions){
      const choice=form.get(`position-${position.id}`);
      if(choice==='__abstain__'&&election.allowAbstain)continue;
      const candidate=position.candidates.find(item=>String(item.id)===String(choice));
      if(!candidate){
        const existing=formElement.querySelector('.ballot-error');
        const error=existing||document.createElement('p');
        error.className='ballot-error';
        error.setAttribute('role','alert');
        error.textContent=`Choose an option for ${position.name} before submitting.`;
        if(!existing){error.style.margin='10px 0';error.style.fontWeight='600';error.style.color='#8a2d1b';formElement.querySelector('.submit-row')?.prepend(error);}
        return;
      }
      choices[String(position.id)]=candidate.id;
    }
    formElement.querySelector('.ballot-error')?.remove();
    const submitButton=formElement.querySelector('button[type="submit"]');
    if(submitButton){submitButton.disabled=true;submitButton.dataset.busy='true';}
    try{
      await withElectionWriteLock(election.id,async()=>{
        const freshElection=readElectionConfig();
        if(!validElection(freshElection)||!isWindowOpen(freshElection))throw new Error('Voting has closed. Your selections were not recorded.');
        let ballot;
        try{ballot={id:randomId(),choices};}catch(error){throw new Error(error.message);}
        const ballotWrite=appendBallot(ballot);
        if(!ballotWrite.ok)throw new Error('This browser could not save the ballot. No ballot was recorded; check browser storage before trying again.');
        const summaryWrite=updateSummary(freshElection,choices);
        if(!summaryWrite.ok){
          let restored=true;
          try{if(ballotWrite.previousChunk.length)localStorage.setItem(chunkKey(pollId,ballotWrite.previousMeta.lastChunk),JSON.stringify(ballotWrite.previousChunk));else localStorage.removeItem(chunkKey(pollId,ballotWrite.previousMeta.lastChunk));localStorage.setItem(metaKey(pollId),JSON.stringify(ballotWrite.previousMeta));if(ballotWrite.nextChunk!==ballotWrite.previousMeta.lastChunk)localStorage.removeItem(chunkKey(pollId,ballotWrite.nextChunk));}catch{restored=false;}
          if(!restored)throw new Error('The vote summary failed and ballot rollback was incomplete. Stop using this election until the administrator restores or resets it.');
          throw new Error('The vote summary could not be saved, so the ballot was rolled back. Nothing was counted.');
        }
        showNextVoter();
      });
    }catch(error){
      if(formElement.isConnected){
        const existing=formElement.querySelector('.ballot-error');
        const message=existing||document.createElement('p');
        message.className='ballot-error';message.setAttribute('role','alert');message.textContent=String(error?.message||'The ballot could not be saved.');
        if(!existing){message.style.margin='10px 0';message.style.fontWeight='600';message.style.color='#8a2d1b';formElement.querySelector('.submit-row')?.prepend(message);}
      }else showState('Ballot not saved',String(error?.message||'The ballot could not be saved.'));
    }finally{
      if(submitButton&&formElement.isConnected){submitButton.disabled=false;delete submitButton.dataset.busy;}
    }
  }
  window.addEventListener('storage',event=>{if(event.key===configKey(pollId))render();});
  render();
})();
