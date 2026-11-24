(async () => {
  'use strict';

  // The school calendar is always based on India Standard Time, even if the
  // portal is opened on a device configured for another timezone.
  const SCHOOL_TIME_ZONE = 'Asia/Kolkata';
  function schoolDateISO(value=new Date()) {
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:SCHOOL_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value);
    const get=type=>parts.find(part=>part.type===type)?.value||'';
    return `${get('year')}-${get('month')}-${get('day')}`;
  }
  function schoolDateTimeMillis(value) {
    if(!value)return NaN;
    const text=String(value),match=text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if(!match)return NaN;
    const [,year,month,day,hour,minute,second='0']=match;
    const [y,mo,d,h,mi,se]=[year,month,day,hour,minute,second].map(Number);
    const check=new Date(Date.UTC(y,mo-1,d,h,mi,se));
    if(check.getUTCFullYear()!==y||check.getUTCMonth()!==mo-1||check.getUTCDate()!==d||h>23||mi>59||se>59)return NaN;
    return check.getTime()-330*60*1000;
  }
  function formatSchoolDateTime(value) {
    const time=schoolDateTimeMillis(value);
    return Number.isFinite(time)?new Intl.DateTimeFormat('en-IN',{timeZone:SCHOOL_TIME_ZONE,day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(time)):String(value||'');
  }

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const uiIcon = (name, className='ui-icon') => `<svg class="${esc(className)}" aria-hidden="true" focusable="false"><use href="#icon-${esc(name)}"></use></svg>`;
  const KEY = 'school-arts-sports-html-v1';
  const ELECTION_KEY = 'school-arts-sports-election-v1'; // legacy aggregate election store; admin index compatibility
  const ELECTION_INDEX_KEY = 'school-arts-sports-election-index-v2';
  const ELECTION_CONFIG_PREFIX = 'school-arts-sports-election-config-v2-'; // private admin configuration
  const ELECTION_PUBLIC_CONFIG_PREFIX = 'school-arts-sports-election-public-v2-';
  const BALLOT_KEY = 'school-arts-sports-election-ballots-v1'; // legacy aggregate store; migration only
  const BALLOT_KEY_PREFIX = 'school-arts-sports-election-ballots-v1-';
  const BALLOT_CHUNK_PREFIX = 'school-arts-sports-election-ballot-chunk-v2-';
  const BALLOT_META_PREFIX = 'school-arts-sports-election-ballot-meta-v2-';
  const SUMMARY_KEY_PREFIX = 'school-arts-sports-election-summary-v1-';
  const electionConfigKey = id => `${ELECTION_CONFIG_PREFIX}${Number(id)}`;
  const electionPublicConfigKey = id => `${ELECTION_PUBLIC_CONFIG_PREFIX}${Number(id)}`;
  const electionBallotKey = id => `${BALLOT_KEY_PREFIX}${Number(id)}`;
  const electionBallotChunkKey = (id,chunk) => `${BALLOT_CHUNK_PREFIX}${Number(id)}-${Number(chunk)}`;
  const electionBallotMetaKey = id => `${BALLOT_META_PREFIX}${Number(id)}`;
  const electionSummaryKey = id => `${SUMMARY_KEY_PREFIX}${Number(id)}`;
  const BALLOT_CHUNK_SIZE = 250;
  const THEME_KEY = 'school-arts-sports-theme';
  const THEME_DEFAULT_VERSION_KEY = 'school-arts-sports-theme-default-version';
  // Keep a session-only overlay for writes/removals that localStorage rejects.
  // A quota failure can leave getItem() working while setItem() fails, so cached
  // values must take precedence over stale persistent values for the rest of this tab.
  const memoryStorage = new Map();
  const memoryStorageOverrides = new Set();
  const memoryStorageRemoved = new Set();
  let persistentStorageAvailable = true;
  let storageWarningShown = false;
  let databaseRecoveryError = null;
  // Shared trial storage mirrors the existing localStorage data model.
  // This uses anonymous access and MUST only contain synthetic test data.
  const sharedStorage = {
    status: 'connecting', ready: false, endpoint: '', publishableKey: '',
    lastSeen: new Map(), pending: new Map(), flushTimer: null,
    pollTimer: null, polling: false, warned: false
  };
  const isSharedStorageKey = key => typeof key === 'string'
    && key.startsWith('school-arts-sports-')
    && key !== THEME_KEY && key !== THEME_DEFAULT_VERSION_KEY;
  function sharedStorageHeaders(extra={}) {
    return { apikey: sharedStorage.publishableKey, ...extra };
  }
  function setLocalStorageSilently(key,value) {
    try { window.localStorage.setItem(key,value); } catch { memoryStorageOverrides.add(key); }
    memoryStorage.set(key,value);
    memoryStorageRemoved.delete(key);
  }
  function removeLocalStorageSilently(key) {
    try { window.localStorage.removeItem(key); } catch {}
    memoryStorage.delete(key);
    memoryStorageOverrides.delete(key);
    memoryStorageRemoved.add(key);
  }
  function queueSharedStorageWrite(key,value) {
    if (!sharedStorage.ready || !isSharedStorageKey(key)) return;
    sharedStorage.pending.set(key,String(value));
    if (!sharedStorage.flushTimer) sharedStorage.flushTimer=setTimeout(flushSharedStorageWrites,180);
  }
  function queueSharedStorageDelete(key) {
    if (!sharedStorage.ready || !isSharedStorageKey(key)) return;
    sharedStorage.pending.set(key,null);
    if (!sharedStorage.flushTimer) sharedStorage.flushTimer=setTimeout(flushSharedStorageWrites,180);
  }
  async function flushSharedStorageWrites() {
    sharedStorage.flushTimer=null;
    if (!sharedStorage.ready || !sharedStorage.pending.size) return;
    const batch=[...sharedStorage.pending.entries()];
    for (const [key,value] of batch) {
      if (sharedStorage.pending.get(key)!==value) continue;
      sharedStorage.pending.delete(key);
      try {
        let response;
        if (value===null) {
          response=await fetch(`${sharedStorage.endpoint}?key=eq.${encodeURIComponent(key)}`,{
            method:'DELETE',headers:sharedStorageHeaders({Prefer:'return=minimal'})
          });
        } else {
          response=await fetch(`${sharedStorage.endpoint}?on_conflict=key`,{
            method:'POST',
            headers:sharedStorageHeaders({'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'}),
            body:JSON.stringify({key,value})
          });
        }
        if (!response.ok) throw new Error(`Supabase write failed (${response.status}).`);
        if (value!==null) {
          const rows=await response.json().catch(()=>[]);
          const row=Array.isArray(rows)?rows[0]:null;
          if (row?.updated_at) sharedStorage.lastSeen.set(key,row.updated_at);
        } else {
          sharedStorage.lastSeen.delete(key);
        }
      } catch (error) {
        if (!sharedStorage.pending.has(key)) sharedStorage.pending.set(key,value);
        sharedStorage.status='error';
        if (!sharedStorage.warned) {
          sharedStorage.warned=true;
          console.warn('Shared test storage is temporarily unavailable:',error);
        }
        updateStorageStatus();
        if (!sharedStorage.flushTimer) sharedStorage.flushTimer=setTimeout(flushSharedStorageWrites,5000);
        return;
      }
    }
    sharedStorage.status='connected';
    sharedStorage.warned=false;
    updateStorageStatus();
    if (sharedStorage.pending.size && !sharedStorage.flushTimer)
      sharedStorage.flushTimer=setTimeout(flushSharedStorageWrites,180);
  }
  function applyRemoteSharedStorageChanges(changedKeys) {
    try {
      if (changedKeys.includes(KEY)) {
        const raw=window.localStorage.getItem(KEY);
        if (raw) {
          const incoming=migrateDatabase(JSON.parse(raw));
          validateBackupShape(incoming);
          db=incoming;
          if (Array.isArray(db.settings?.classes)&&db.settings.classes.length) classes=db.settings.classes.map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=12).sort((a,b)=>a-b);
          if (Array.isArray(db.settings?.sections)&&db.settings.sections.length) sections=db.settings.sections;
          registrationLookupSource=null;studentLookupSource=null;programmeLookupSource=null;
        }
      }
      if (changedKeys.some(key=>key!==KEY&&key.startsWith('school-arts-sports-'))) {
        electionDb=loadElectionDatabase(Array.isArray(db.elections)?db.elections:[],db.nextIds||{});
      }
      render();
      toast('Shared test workspace updated from another device.','info');
    } catch (error) {
      console.warn('A shared update could not be applied safely:',error);
      toast('A shared update was received but could not be applied. Refresh after checking the data.','warning');
    }
  }
  async function pollSharedStorage() {
    if (!sharedStorage.ready || sharedStorage.polling) return;
    sharedStorage.polling=true;
    try {
      const response=await fetch(`${sharedStorage.endpoint}?select=key,value,updated_at&order=key.asc`,{
        headers:sharedStorageHeaders(),cache:'no-store'
      });
      if (!response.ok) throw new Error(`Supabase read failed (${response.status}).`);
      const rows=await response.json();
      const present=new Set();
      const changed=[];
      for (const row of rows) {
        if (!row || !isSharedStorageKey(row.key)) continue;
        present.add(row.key);
        if (sharedStorage.pending.has(row.key)) continue;
        const previousStamp=sharedStorage.lastSeen.get(row.key);
        if (previousStamp===row.updated_at) continue;
        const current=storageGet(row.key);
        if (current!==row.value) {
          setLocalStorageSilently(row.key,row.value);
          changed.push(row.key);
        }
        sharedStorage.lastSeen.set(row.key,row.updated_at);
      }
      for (const key of [...sharedStorage.lastSeen.keys()]) {
        if (present.has(key)||sharedStorage.pending.has(key)) continue;
        removeLocalStorageSilently(key);
        sharedStorage.lastSeen.delete(key);
        changed.push(key);
      }
      sharedStorage.status='connected';
      sharedStorage.warned=false;
      if (changed.length) applyRemoteSharedStorageChanges(changed);
      else updateStorageStatus();
    } catch (error) {
      sharedStorage.status='error';
      if (!sharedStorage.warned) {
        sharedStorage.warned=true;
        console.warn('Shared test storage polling failed:',error);
      }
      updateStorageStatus();
    } finally {
      sharedStorage.polling=false;
    }
  }
  function activateSharedStorageFromCurrentBrowser() {
    if (sharedStorage.status!=='needs-reset') return;
    sharedStorage.ready=true;
    sharedStorage.status='connected';
    sharedStorage.warned=false;
    for (const key of storageKeys()) {
      if (!isSharedStorageKey(key)) continue;
      const value=storageGet(key);
      if (value!==null) sharedStorage.pending.set(key,value);
    }
    if (!sharedStorage.pollTimer) sharedStorage.pollTimer=setInterval(pollSharedStorage,4000);
    if (sharedStorage.pending.size&&!sharedStorage.flushTimer)
      sharedStorage.flushTimer=setTimeout(flushSharedStorageWrites,80);
    updateStorageStatus();
  }
  async function initializeSharedStorage() {
    const config=window.PORTAL_SUPABASE_CONFIG;
    if (!config?.url || !config?.publishableKey) {
      sharedStorage.status='local';
      return;
    }
    const base=String(config.url);
    sharedStorage.endpoint=(base.endsWith('/')?base.slice(0,-1):base)+'/rest/v1/portal_storage';
    sharedStorage.publishableKey=config.publishableKey;
    try {
      const response=await fetch(`${sharedStorage.endpoint}?select=key,value,updated_at&order=key.asc`,{
        headers:sharedStorageHeaders(),cache:'no-store'
      });
      if (!response.ok) throw new Error(`Supabase connection failed (${response.status}).`);
      const rows=await response.json();
      const localEntries=storageKeys().filter(isSharedStorageKey)
        .map(key=>[key,storageGet(key)]).filter(([,value])=>value!==null);
      const remoteMap=new Map(rows.filter(row=>row&&isSharedStorageKey(row.key))
        .map(row=>[row.key,row]));
      const localMap=new Map(localEntries);
      const hasConflict=rows.length
        ? (localEntries.some(([key,value])=>!remoteMap.has(key)||remoteMap.get(key).value!==value)
          || rows.some(row=>isSharedStorageKey(row.key)&&!localMap.has(row.key)))
        : localEntries.length>0;
      if (hasConflict) {
        // Never upload, overwrite or merge browser-local school data implicitly.
        sharedStorage.status='needs-reset';
        updateStorageStatus();
        return;
      }
      if (rows.length) {
        for (const row of rows) {
          if (!row || !isSharedStorageKey(row.key)) continue;
          setLocalStorageSilently(row.key,row.value);
          sharedStorage.lastSeen.set(row.key,row.updated_at);
        }
      }
      sharedStorage.ready=true;
      sharedStorage.status='connected';
      sharedStorage.pollTimer=setInterval(pollSharedStorage,4000);
      updateStorageStatus();
    } catch (error) {
      sharedStorage.status='error';
      console.warn('Supabase is not available; this browser will continue in local-only mode:',error);
      updateStorageStatus();
    }
  }

  function storageKeys() {
    const keys=new Set();
    try {
      const store=window.localStorage;
      for(let index=0;index<store.length;index++){
        const key=store.key(index);
        if(typeof key==='string')keys.add(key);
      }
    } catch { persistentStorageAvailable=false; }
    for(const key of memoryStorage.keys())keys.add(key);
    for(const key of memoryStorageRemoved)keys.delete(key);
    return [...keys];
  }
  function storageGet(key) {
    if(memoryStorageRemoved.has(key))return null;
    if(memoryStorageOverrides.has(key))return memoryStorage.has(key)?memoryStorage.get(key):null;
    try {
      const value=window.localStorage.getItem(key);
      if(value===null) memoryStorage.delete(key); else memoryStorage.set(key,value);
      if(key===KEY)persistentStorageAvailable=true;
      return value;
    } catch {
      persistentStorageAvailable=false;
      return memoryStorage.has(key)?memoryStorage.get(key):null;
    }
  }
  function storageSet(key,value) {
    const text=String(value);
    try {
      window.localStorage.setItem(key,text);
      memoryStorage.set(key,text);
      memoryStorageOverrides.delete(key);
      memoryStorageRemoved.delete(key);
      if(key===KEY)persistentStorageAvailable=true;
      queueSharedStorageWrite(key,text);
      return true;
    } catch {
      persistentStorageAvailable=false;
      try {
        memoryStorage.set(key,text);
        memoryStorageOverrides.add(key);
        memoryStorageRemoved.delete(key);
        queueSharedStorageWrite(key,text);
        return true;
      } catch { return false; }
    }
  }
  function storageRemove(key) {
    try {
      window.localStorage.removeItem(key);
      memoryStorage.delete(key);
      memoryStorageOverrides.delete(key);
      memoryStorageRemoved.delete(key);
      queueSharedStorageDelete(key);
      return true;
    } catch {
      persistentStorageAvailable=false;
      memoryStorage.delete(key);
      memoryStorageOverrides.delete(key);
      memoryStorageRemoved.add(key);
      queueSharedStorageDelete(key);
      return true;
    }
  }
  let electionRecoveryError=null;
  let classes = Array.from({ length: 12 }, (_, i) => i + 1);
  let sections = ['A', 'B', 'C'];
    const roleNames = { admin: 'Administrator', teacher: 'Teacher', parent: 'Parent' };
  const pageNames = { dashboard: 'Overview', students: 'Students', arts: 'Arts programmes', sports: 'Sports programmes', groups: 'Group Items', 'programme-detail': 'Programme details', results: 'Final results', reports: 'Reports', 'not-registered': 'Not registered', calendar: 'Events', portal: 'My child', 'house-assign': 'House assignment', admin: 'Administration' };
  await initializeSharedStorage();
  let db = loadDatabase();
  let electionDb = loadElectionDatabase(Array.isArray(db.elections) ? db.elections : [], db.nextIds || {});
  delete db.elections;
  delete db.nextIds.election;
  delete db.nextIds.position;
  delete db.nextIds.candidate;
  saveElectionDatabase();
  saveDatabase();
  if (Array.isArray(db.settings?.classes) && db.settings.classes.length) classes = db.settings.classes.map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=12).sort((a,b)=>a-b);
  if (Array.isArray(db.settings?.sections) && db.settings.sections.length) sections = db.settings.sections;
  const savedThemePreference = storageGet(THEME_KEY);
  const themeDefaultVersion = storageGet(THEME_DEFAULT_VERSION_KEY);
  // v18.7 migrates the previous default-dark setup to light once. After this
  // migration, explicit user theme choices are remembered across launches.
  let savedTheme = themeDefaultVersion === '3' && savedThemePreference ? savedThemePreference : 'light';
  const state = {
    page: 'dashboard', role: 'parent', previewUserId: 1, selectedStudentId: 6, programmeId: null,
    studentFilters: {}, programmeFilters: {}, reportFilters: {}, reportPrint: {area:'Sports', programme:'', q:'', age:'', gender:'', classNo:'', section:'', house:'', category:'', customStudentIds:[], columns:['name','admission','age','dob','gender','class','section','house','category']},
    adminTab: 'overview', accountPanel: 'admins', electionId: 1,
    theme: savedTheme, searchTimer: null,
    importRows: [], importSourceRows: [], importHeaders: [], importColumnMap: {}, importFileName: '', showArchivedStudents: false,
    adminRegistrationFilters: { sort: 'programme', age: '', moreOpen: false }, adminProgrammeFilters: { sort: 'name' }, parentAccountQuery: '',
    notRegisteredBrowser: { area: 'Both' }, studentBrowser: { classNo: null, section: null, q: '', gender: '', category: '', age: '', sort: 'name' }, adminStudentBrowser: { classNo: null, section: null, q: '', gender: '', category: '', age: '', sort: 'name', moreOpen: false }, classTeacherClass: null, programmeDetailBrowser: { classNo: null, section: null }, programmeDetailFilters: { registration: 'participating', sort: 'class', age: '' }, resultsFilters: { sort: 'name', moreOpen: false }, adminRegistrationBrowser: { classNo: null, section: null }, reportBrowser: { classNo: null, section: null }, parentTab: 'arts', selectedMoveStudentIds: [], selectedUnsectionedIds: [], calendarPeriod: 'upcoming', calendarQuery: '', calendarType: 'All', houseBrowser: { classNo: null, section: null }, houseSelectedStudentIds: [], lastHouseSelectionIndex: -1,
  };

  function seedDatabase() {
    const todayKey = schoolDateISO();
    const today = new Date(`${todayKey}T12:00:00Z`);
    const fmt = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    const plus = (n) => { const d = new Date(`${todayKey}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return fmt(d); };
    const students = [
      ['1001','Aarav Menon','2015-03-12','Boy',5,'A'],['1002','Diya Nair','2015-07-21','Girl',5,'B'],
      ['1003','Ishaan Thomas','2013-02-09','Boy',7,'A'],['1004','Ananya Raj','2013-10-18','Girl',7,'B'],
      ['1005','Rohan Mathew','2012-05-05','Boy',8,'A'],['1006','Meera Joseph','2012-12-14','Girl',8,'B'],
      ['1007','Kabir Das','2011-04-25','Boy',9,'A'],['1008','Nila Varghese','2011-09-09','Girl',9,'B'],
      ['1009','Arjun Pillai','2010-01-30','Boy',10,'A'],['1010','Sara George','2010-06-08','Girl',10,'B'],
      ['1011','Dev Menon','2009-03-02','Boy',11,'A'],['1012','Tara Kurian','2009-11-17','Girl',12,'B'],
      ['1013','Maya Joseph','2012-06-16','Girl',8,'C'],['1014','Nikhil Das','2009-08-27','Boy',11,'B'],
      ['1015','Akhil Raj','2009-02-01','Boy',12,'A'],['1016','Sana Thomas','2015-11-19','Girl',4,'A'],
      ['1017','Neil Varghese','2014-09-05','Boy',6,'C'],['1018','Riya Mathew','2014-04-09','Girl',6,'B'],['1019','Kiran Nair','2015-02-08','Boy',4,'B'],
    ].map((r, i) => ({ id: i + 1, admissionNo: r[0], name: r[1], dob: r[2], gender: r[3], classNo: r[4], section: r[5], active: true }));
    const programmes = [
      program(1,'AR-C1-DRAW','Drawing','Arts','Cat 1','All',1,4,80,plus(10),'Individual art item for Classes 1–4.'),
      program(2,'AR-C2-REC','Recitation','Arts','Cat 2','All',5,7,80,plus(8),'Individual stage item for Classes 5–7.'),
      program(3,'AR-C3-STORY','Story Writing','Arts','Cat 3','All',8,10,80,plus(12),'Individual literary item for Classes 8–10.'),
      program(4,'AR-C4-SKETCH','Pencil Sketch','Arts','Cat 4','All',11,12,80,plus(14),'Individual art item for Classes 11–12.'),
      program(5,'AR-GRP-CHOIR','Group Song','Arts','Group Item','All',1,6,100,plus(15),'Group performance for Classes 1–6.',[1,2,3,4,5,6]),
      program(6,'SP-C4-100-G','100m Sprint','Sports','Cat 4','Girls',11,12,60,plus(6),'Track event · Classes 11–12 · Girls.'),
      program(7,'SP-C4-100-B','100m Sprint','Sports','Cat 4','Boys',11,12,60,plus(6),'Track event · Classes 11–12 · Boys.'),
      program(8,'SP-C2-100-G','100m Sprint','Sports','Cat 2','Girls',5,7,60,plus(9),'Track event · Classes 5–7 · Girls.'),
      program(9,'SP-C2-100-B','100m Sprint','Sports','Cat 2','Boys',5,7,60,plus(9),'Track event · Classes 5–7 · Boys.'),
      program(10,'SP-C3-SHOT-B','Shot Put','Sports','Cat 3','Boys',8,10,45,plus(16),'Field event · Classes 8–10 · Boys.'),
      program(11,'SP-C3-SHOT-G','Shot Put','Sports','Cat 3','Girls',8,10,45,plus(16),'Field event · Classes 8–10 · Girls.'),
      program(12,'SP-GRP-FOOT','Football','Sports','Group Item','All',6,8,100,plus(18),'Team entry · Classes 6–8.',[6,7,8]),
    ];
    const registrations = [
      [1,16],[1,19],[2,3],[2,4],[3,7],[3,8],[4,11],[4,12],[5,1],[5,2],
      [6,12],[7,11],[8,2],[8,4],[9,1],[9,3],[10,9],[11,8],[12,3],[12,5],
    ].map((x, i) => ({ id: i + 1, programmeId: x[0], studentId: x[1], createdAt: today.toISOString().slice(0,10) }));
    const events = [
      { id: 1, title: 'Annual Sports Meet', date: plus(7), time: '09:00', venue: 'School Ground', type: 'Sports', coordinator: 'Sports Department', description: 'Track and field events across categories.', published: true },
      { id: 2, title: 'Arts Festival', date: plus(13), time: '10:00', venue: 'Main Hall', type: 'Arts', coordinator: 'Arts Department', description: 'Individual and group arts programmes.', published: true },
      { id: 3, title: 'School Anniversary', date: plus(24), time: '16:00', venue: 'Open Auditorium', type: 'School event', coordinator: 'Event Committee', description: 'School anniversary celebrations.', published: true },
    ];
    const election = {
      id: 1, title: 'Student Council Election 2026', status: 'draft', publicKey: 'demo-council-poll-2026', openAt: today.toISOString().slice(0,10) + 'T08:00', closeAt: plus(2) + 'T17:00',
      showLive: true, allowAbstain: true, eligibleClasses: classes, tokens: [], usedTokens: [], ballots: [],
      positions: [
        { id: 1, name: 'Head Boy', candidates: [{id:1,name:'Akhil Raj',classLabel:'Class 12'},{id:2,name:'Nikhil Das',classLabel:'Class 11'}] },
        { id: 2, name: 'Head Girl', candidates: [{id:3,name:'Maya Joseph',classLabel:'Class 8'},{id:4,name:'Sara George',classLabel:'Class 10'}] },
        { id: 3, name: 'Arts Secretary', candidates: [{id:5,name:'Nila Varghese',classLabel:'Class 9'},{id:6,name:'Tara Kurian',classLabel:'Class 12'}] },
        { id: 4, name: 'Sports Secretary', candidates: [{id:7,name:'Arjun Pillai',classLabel:'Class 10'},{id:8,name:'Dev Menon',classLabel:'Class 11'}] },
      ]
    };
    return {
      version: 1, nextIds: { student: 20, programme: 13, registration: 21, event: 4, user: 4, election: 2, position: 5, candidate: 9, groupTeam: 1 },
      settings: { schoolName: 'Your School', shortName: 'YS', academicYear: '2026–27', categoryBands: defaultCategoryBands(), maxArts: 3, maxSports: 3, maxGroup: 2, maxArtsOnstage: 3, maxArtsOffstage: 3, maxSportsTrack: 2, maxSportsField: 2, registrationOpen: fmt(today), registrationClose: plus(30), sections: [...sections], classes: [...classes], classTeachers: {'7|A': 2}, houseNames: ['Emerald','Ruby','Diamond','Sapphire'], houseAssignmentVersion: 3, teacherPermissions: {}, logoDataUrl: '', backgroundDataUrl: '', dashboardEyebrow: 'ACTIVITY MANAGER', dashboardTitle: 'Every student has a place to take part.', dashboardDescription: 'Keep programme choices, event schedules and school results organised in one place. Arts and Sports stay separate; student records stay central.', dashboardQuote: 'Talent thrives when opportunity meets support.', announcements: 'Programme choice dates are now open for selected Arts and Sports programmes.', publishResults: false, publishParticipants: false },
      students, programmes, registrations, groupTeams: [],
      results: [{ programmeId: 6, studentId: 12, rank: 1, notes: 'School-level first place.' }, { programmeId: 9, studentId: 3, rank: 2, notes: '' }],
      selections: [{ programmeId: 6, studentId: 12, pathway: 'School competition', confirmedAt: today.toISOString().slice(0,10) }],
      events,
      users: [
        { id: 1, displayName: 'Portal Administrator', role: 'admin', active: true, classNumbers: [], linkedStudentIds: [] },
        { id: 2, displayName: 'Class 7A Teacher', role: 'teacher', active: true, linkedStudentIds: [] },
        { id: 3, displayName: 'Parent Account', role: 'parent', active: true, classNumbers: [], linkedStudentIds: [4, 6] },
      ],
      elections: [election], audit: [{ id: 1, date: today.toISOString(), actor: 'System', role: 'system', action: 'workspace_initialized', record: 'Portal', detail: 'Fictional sample data created for evaluation.' }],
    };
  }

  function inferProgrammeType(area, category, name='', description='', saved='') {
    if(category==='Group Item')return 'group';
    const value=String(saved||'').toLowerCase();
    if(area==='Arts')return ['onstage','offstage'].includes(value)?value:(/on.?stage|stage|performance|recitation|song|dance|drama|speech|singing|mime|mono.?act|instrumental|story.?telling/i.test(`${name} ${description}`)?'onstage':'offstage');
    return ['track','field'].includes(value)?value:(/field|shot put|long jump|high jump|discus|javelin|triple jump|hammer throw|pole vault/i.test(`${name} ${description}`)?'field':'track');
  }
  function programmeTypeLabel(type) {
    const labels={track:'Track event',field:'Field event',onstage:'On stage',offstage:'Offstage',group:'Group item'};
    return labels[String(type||'').toLowerCase()]||String(type||'');
  }
  function programmeTypeBadge(type) {
    const label=programmeTypeLabel(type);
    return label ? `<span class="programme-type-pill">${esc(label)}</span>` : '';
  }
  function program(id, code, name, area, category, gender, min, max, capacity, closeDate, description, eligibleClasses = []) {
    return { id, code, name, area, category, gender, itemType: inferProgrammeType(area,category,name,description), ageGroup: 'Open', ageCutoffDate: '', maxAge: null, classMin: min, classMax: max, eligibleClasses, ...(category === 'Group Item' ? { groupScope: 'classes', eligibleCategories: [], groupMode: 'house' } : {}), capacity, openDate: localDateString(), closeDate, status: 'open', description, archived: false };
  }
  // Migrate older browser saves without discarding valid school data. Earlier HTML builds
  // represented Group Item eligibility with classMin/classMax but did not store groupScope.
  function migrateDatabase(data) {
    if (!data || typeof data !== 'object' || !Array.isArray(data.programmes)) return data;
    if(!Array.isArray(data.groupTeams))data.groupTeams=[];
    if(!data.nextIds||typeof data.nextIds!=='object')data.nextIds={};
    data.nextIds.groupTeam=Number.isSafeInteger(Number(data.nextIds.groupTeam))&&Number(data.nextIds.groupTeam)>0?Number(data.nextIds.groupTeam):Math.max(0,...data.groupTeams.map(team=>Number(team?.id)||0))+1;
    for (const p of data.programmes) {
      if (p?.category === 'Group Item' && !['classes', 'categories'].includes(p.groupScope)) p.groupScope = Array.isArray(p.eligibleCategories) && p.eligibleCategories.length ? 'categories' : 'classes';
      if(p?.category==='Group Item'&&p.groupMode!=='house')p.groupMode='house';
      if (p?.category === 'Group Item' && !Array.isArray(p.eligibleCategories)) p.eligibleCategories = [];
      // Item grouping is stored explicitly so the editor and choice limits agree.
      p.itemType=inferProgrammeType(p.area,p.category,p.name,p.description,p.itemType);
      // Age is a reporting/filter field calculated from DOB, never a programme eligibility rule.
      p.ageGroup='Open'; p.ageCutoffDate=''; p.maxAge=null;
    }
    // Calendar expansion: retain old single-day events and provide safe defaults for
    // end dates, all-day events and audience visibility without discarding saved entries.
    for (const event of (data.events || [])) {
      if (!event || typeof event !== 'object') continue;
      event.date = String(event.date || '').slice(0, 10);
      if (!event.endDate) event.endDate = event.date;
      if (typeof event.allDay !== 'boolean') event.allDay = !event.time;
      if (typeof event.endTime !== 'string') event.endTime = '';
      if (!event.audience) event.audience = 'Everyone';
      if (!event.type) event.type = 'School event';
    }
    // Preserve older student rows with empty section cells. These are valid records,
    // not failed imports; keep them visible under the explicit Unsectioned group.
    for (const student of (data.students || [])) {
      if (student && typeof student === 'object' && !String(student.section || '').trim()) student.section = 'Unsectioned';
    }
    if (data.settings) {
      if (!Array.isArray(data.settings.categoryBands) || !data.settings.categoryBands.length) data.settings.categoryBands = defaultCategoryBands();
      data.settings.categoryBands = data.settings.categoryBands.filter(b => b && typeof b.name === 'string' && Number.isInteger(Number(b.minClass)) && Number.isInteger(Number(b.maxClass))).map((b,i)=>({id:String(b.id||`cat${i+1}`),name:String(b.name).trim(),minClass:Number(b.minClass),maxClass:Number(b.maxClass)})).filter(b=>b.name&&b.minClass>=1&&b.maxClass<=12&&b.minClass<=b.maxClass);
      if (!data.settings.categoryBands.length) data.settings.categoryBands = defaultCategoryBands();
      if (!Array.isArray(data.settings.classes) || !data.settings.classes.length) data.settings.classes = Array.from({length:12},(_,i)=>i+1);
      data.settings.classes = [...new Set(data.settings.classes.map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=12))].sort((a,b)=>a-b);
      if (!Array.isArray(data.settings.sections) || !data.settings.sections.length) data.settings.sections = ['A','B','C'];
      if (!data.settings.classTeachers || typeof data.settings.classTeachers !== 'object' || Array.isArray(data.settings.classTeachers)) data.settings.classTeachers = {};
      // Older builds stored section assignments on each teacher account. Merge those into
      // the school-level map, but never overwrite a newer assignment already in the map.
      for (const user of (data.users||[]).filter(x=>x?.role==='teacher')) {
        const legacyPairs = Array.isArray(user.classSections)
          ? user.classSections.map(x=>({classNo:Number(x.classNo),section:String(x.section||'A')}))
          : (Array.isArray(user.classNumbers)?user.classNumbers:[]).map(Number).flatMap(classNo=>data.settings.sections.map(section=>({classNo,section})));
        for (const pair of legacyPairs) {
          const key=`${pair.classNo}|${pair.section}`;
          if (data.settings.classes.includes(pair.classNo) && (data.settings.sections.includes(pair.section)||pair.section==='Unsectioned') && !data.settings.classTeachers[key]) data.settings.classTeachers[key] = user.id;
        }
      }
      if (!Array.isArray(data.settings.houseNames)) data.settings.houseNames = ['Emerald','Ruby','Diamond','Sapphire'];
      data.settings.houseNames = [...new Set(data.settings.houseNames.map(x=>String(x||'').trim()).filter(Boolean))].slice(0,8);
      data.settings.dashboardEyebrow = String(data.settings.dashboardEyebrow || 'ACTIVITY MANAGER');
      data.settings.dashboardTitle = String(data.settings.dashboardTitle || 'Every student has a place to take part.');
      data.settings.dashboardDescription = String(data.settings.dashboardDescription || 'Keep programme choices, event schedules and school results organised in one place. Arts and Sports stay separate; student records stay central.');
      data.settings.dashboardQuote = String(data.settings.dashboardQuote || 'Talent thrives when opportunity meets support.');
      if (!Number.isSafeInteger(Number(data.settings.maxArtsOnstage))) data.settings.maxArtsOnstage=3;
      if (!Number.isSafeInteger(Number(data.settings.maxArtsOffstage))) data.settings.maxArtsOffstage=3;
      if (!Number.isSafeInteger(Number(data.settings.maxSportsTrack))) data.settings.maxSportsTrack=2;
      if (!Number.isSafeInteger(Number(data.settings.maxSportsField))) data.settings.maxSportsField=2;
      if (!Number.isSafeInteger(Number(data.settings.maxSports))) data.settings.maxSports=3;
      if (!Number.isSafeInteger(Number(data.settings.maxGroup))) data.settings.maxGroup=2;
      if (!data.settings.teacherHousePermissions || typeof data.settings.teacherHousePermissions !== 'object' || Array.isArray(data.settings.teacherHousePermissions)) data.settings.teacherHousePermissions = {};
      const legacy=data.settings.teacherTemporaryPermissions&&typeof data.settings.teacherTemporaryPermissions==='object'&&!Array.isArray(data.settings.teacherTemporaryPermissions)?data.settings.teacherTemporaryPermissions:{};
      const oldGrants=data.settings.teacherPermissions&&typeof data.settings.teacherPermissions==='object'&&!Array.isArray(data.settings.teacherPermissions)?data.settings.teacherPermissions:{};
      // Rebuild permission maps from valid teacher IDs only. Never write attacker-
      // controlled keys such as __proto__, constructor or prototype to a plain object.
      const validTeacherIds=new Set((data.users||[]).filter(user=>user?.role==='teacher'&&Number.isSafeInteger(Number(user.id))&&Number(user.id)>0).map(user=>String(Number(user.id))));
      const permissionNames=['viewReports','addStudents','editStudents','removeStudents','assignHouses','manageSections'];
      const grants=Object.create(null);
      for(const [teacherId,record] of Object.entries(oldGrants)){
        const normalizedId=String(Number(teacherId));
        if(!/^\d+$/.test(teacherId)||!validTeacherIds.has(normalizedId)||!record||typeof record!=='object'||Array.isArray(record))continue;
        const safeRecord=Object.create(null);
        for(const key of permissionNames)if(record[key]===true)safeRecord[key]=true;
        if(Object.keys(safeRecord).length)grants[normalizedId]=safeRecord;
      }
      for(const [teacherId,record] of Object.entries(legacy)){
        const normalizedId=String(Number(teacherId));
        if(!/^\d+$/.test(teacherId)||!validTeacherIds.has(normalizedId)||!record||typeof record!=='object'||Array.isArray(record))continue;
        const expiry=String(record.expiresAt||'').trim();
        if(expiry){
          const parsedExpiry=Date.parse(expiry);
          const expired=Number.isFinite(parsedExpiry)?parsedExpiry<=Date.now():/^\d{4}-\d{2}-\d{2}$/.test(expiry)&&expiry<localDateString();
          if(expired)continue;
        }
        grants[normalizedId]||=Object.create(null);
        for(const key of permissionNames)if(record[key]===true)grants[normalizedId][key]=true;
      }
      for(const [teacherId,value] of Object.entries(data.settings.teacherHousePermissions)){
        const normalizedId=String(Number(teacherId));
        if(/^\d+$/.test(teacherId)&&validTeacherIds.has(normalizedId)&&value===true){grants[normalizedId]||=Object.create(null);grants[normalizedId].assignHouses=true;}
      }
      data.settings.teacherPermissions=grants;
      delete data.settings.teacherTemporaryPermissions;
      delete data.settings.teacherHousePermissions;
      // House assignment is being introduced as a new deliberate workflow. Any old
      // prototype auto-allocation is cleared once; subsequent user assignments persist.
      if (Number(data.settings.houseAssignmentVersion || 0) < 3) {
        for (const student of (data.students || [])) if (student && typeof student === 'object') student.house = '';
        data.settings.houseAssignmentVersion = 3;
      }
    }
    // House columns in source imports are ignored. Houses are assigned only through the dedicated admin/teacher workflow.
    if (Array.isArray(data.users)) {
      data.users = data.users.filter(user => user && user.role !== 'student');
      for (const user of data.users) {
        if (user.role === 'teacher') {
          delete user.classNumbers;
          delete user.classSections;
          delete user.classes;
          delete user.programmeIds;
        } else if (user.role === 'parent') {
          if (!Array.isArray(user.linkedStudentIds)) user.linkedStudentIds = user.linkedStudentId ? [Number(user.linkedStudentId)] : [];
          user.linkedStudentIds = [...new Set(user.linkedStudentIds.map(Number).filter(Number.isSafeInteger))];
          const linkedClasses = user.linkedStudentIds.map(id => (data.students || []).find(student => Number(student?.id) === id && student.active !== false)?.classNo).map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 12);
          const savedClasses = Array.isArray(user.classNumbers) ? user.classNumbers.map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 12) : [];
          user.classNumbers = [...new Set([...savedClasses, ...linkedClasses])].sort((a,b)=>a-b);
          delete user.linkedStudentId;
        }
      }
    }
    if (data.settings) data.settings.publishParticipants = false; // Parent views never expose participant rosters.
    data.groupTeams=data.groupTeams.filter(team=>team&&Number.isSafeInteger(Number(team.id))&&Number.isSafeInteger(Number(team.programmeId))&&team.mode==='house'&&String(team.house||'')&&Array.isArray(team.studentIds)).map(team=>({...team,id:Number(team.id),programmeId:Number(team.programmeId),mode:'house',category:String(team.category||''),house:String(team.house||''),studentIds:[...new Set(team.studentIds.map(Number).filter(Number.isSafeInteger))]}));
    for (const election of data.elections || []) if (election && typeof election === 'object') {
      if (!election.publicKey) election.publicKey = `legacy-poll-${election.id}`;
      if (typeof election.showLive !== 'boolean') election.showLive = true;
      if (typeof election.allowAbstain !== 'boolean') election.allowAbstain = true;
    }
    return data;
  }
  function normalizeElectionStore(elections=[], nextIds={}) {
    const safe=Array.isArray(elections)?JSON.parse(JSON.stringify(elections)):[];
    for(const election of safe){
      if(!election||typeof election!=='object')continue;
      if(!election.publicKey)election.publicKey=`legacy-poll-${election.id}`;
      if(!Array.isArray(election.positions))election.positions=[];
      if(!Array.isArray(election.ballots))election.ballots=[];
      if(!Array.isArray(election.tokens))election.tokens=[];
      if(!Array.isArray(election.usedTokens))election.usedTokens=[];
      if(typeof election.showLive!=='boolean')election.showLive=true;
      if(typeof election.allowAbstain!=='boolean')election.allowAbstain=true;
    }
    const maxPosition=Math.max(0,...safe.flatMap(e=>(e.positions||[]).map(p=>Number(p?.id)||0)));
    const maxCandidate=Math.max(0,...safe.flatMap(e=>(e.positions||[]).flatMap(p=>(p.candidates||[]).map(c=>Number(c?.id)||0))));
    const maxElection=Math.max(0,...safe.map(e=>Number(e?.id)||0));
    return {version:1,elections:safe,nextIds:{election:Math.max(Number(nextIds.election)||0,maxElection)+1,position:Math.max(Number(nextIds.position)||0,maxPosition)+1,candidate:Math.max(Number(nextIds.candidate)||0,maxCandidate)+1}};
  }
  function readLegacyBallotStore(){
    try{const raw=storageGet(BALLOT_KEY);const parsed=raw?JSON.parse(raw):{};return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{};}catch{return {};}
  }
  const MAX_ELECTION_BALLOT_CHUNKS=5000;
  const MAX_ELECTION_BALLOTS=MAX_ELECTION_BALLOT_CHUNKS*BALLOT_CHUNK_SIZE;
  function readElectionBallotMeta(electionId){
    try{
      const raw=storageGet(electionBallotMetaKey(electionId));
      if(raw===null){
        const prefix=`${BALLOT_CHUNK_PREFIX}${Number(electionId)}-`;
        let orphaned=false;
        orphaned=storageKeys().some(key=>key.startsWith(prefix));
        return orphaned?{count:0,lastChunk:0,corrupt:true}:{count:0,lastChunk:0,missing:true};
      }
      const parsed=JSON.parse(raw),count=Number(parsed?.count),lastChunk=Number(parsed?.lastChunk);
      if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||!Number.isSafeInteger(count)||count<0||count>MAX_ELECTION_BALLOTS||!Number.isSafeInteger(lastChunk)||lastChunk<0||lastChunk>=MAX_ELECTION_BALLOT_CHUNKS)return {count:0,lastChunk:0,corrupt:true};
      const expected=Math.max(0,Math.ceil(count/BALLOT_CHUNK_SIZE)-1);
      if(lastChunk!==expected)return {count,lastChunk,corrupt:true};
      return {count,lastChunk,missing:false};
    }catch{return {count:0,lastChunk:0,corrupt:true};}
  }
  function readElectionBallotChunk(electionId,chunk,required=true){
    const raw=storageGet(electionBallotChunkKey(electionId,chunk));
    if(raw===null){if(required)throw new Error(`Election ${electionId} is missing ballot chunk ${chunk}.`);return [];}
    let parsed;try{parsed=JSON.parse(raw);}catch{throw new Error(`Election ${electionId} has a damaged ballot chunk ${chunk}.`);}
    if(!Array.isArray(parsed)||parsed.length>BALLOT_CHUNK_SIZE)throw new Error(`Election ${electionId} has an invalid ballot chunk ${chunk}.`);
    for(const ballot of parsed){
      if(!ballot||typeof ballot!=='object'||typeof ballot.id!=='string'||!/^anon-[a-f0-9]{16,}$/i.test(ballot.id)||!ballot.choices||typeof ballot.choices!=='object'||Array.isArray(ballot.choices))throw new Error(`Election ${electionId} contains an invalid ballot record.`);
    }
    return parsed;
  }
  function readElectionBallots(electionId){
    const meta=readElectionBallotMeta(electionId);
    if(meta.corrupt)throw new Error(`Election ${electionId} ballot metadata is damaged. Clear or restore the election data before continuing.`);
    if(meta.count>0||!meta.missing){
      const ballots=[];
      for(let chunk=0;chunk<=meta.lastChunk;chunk++){
        const values=readElectionBallotChunk(electionId,chunk,meta.count>0||chunk===0);
        const expected=chunk<meta.lastChunk?BALLOT_CHUNK_SIZE:meta.count%BALLOT_CHUNK_SIZE|| (meta.count===0?0:BALLOT_CHUNK_SIZE);
        if(values.length!==expected)throw new Error(`Election ${electionId} ballot chunk ${chunk} does not match its metadata.`);
        ballots.push(...values);
      }
      if(ballots.length!==meta.count)throw new Error(`Election ${electionId} ballot count does not match its stored chunks.`);
      return ballots;
    }
    try{const raw=storageGet(electionBallotKey(electionId));const parsed=raw?JSON.parse(raw):[];if(!Array.isArray(parsed))throw new Error('Legacy ballots are damaged.');return parsed;}catch(err){throw new Error(`Election ${electionId} legacy ballot data is damaged: ${err.message}`);}
  }
  function readElectionSummary(electionId){
    try{
      const raw=storageGet(electionSummaryKey(electionId));
      if(raw===null)return {acceptedBallots:0,candidateCounts:{}};
      const parsed=JSON.parse(raw);
      if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||!Number.isSafeInteger(Number(parsed.acceptedBallots))||Number(parsed.acceptedBallots)<0||!parsed.candidateCounts||typeof parsed.candidateCounts!=='object'||Array.isArray(parsed.candidateCounts))return {acceptedBallots:0,candidateCounts:{},corrupt:true};
      const candidateCounts={};
      for(const [key,value] of Object.entries(parsed.candidateCounts)){const count=Number(value);if(!/^\d+:\d+$/.test(key)||!Number.isSafeInteger(count)||count<0)return {acceptedBallots:0,candidateCounts:{},corrupt:true};candidateCounts[key]=count;}
      return {acceptedBallots:Number(parsed.acceptedBallots),candidateCounts};
    }catch{return {acceptedBallots:0,candidateCounts:{},corrupt:true};}
  }
  function buildElectionSummary(election){
    const candidateCounts={};let acceptedBallots=0;const seenBallots=new Set();
    const positions=Array.isArray(election.positions)?election.positions:[];
    const positionIds=new Set(positions.map(position=>String(position.id)));
    for(const ballot of election.ballots||[]){
      if(!ballot||typeof ballot.id!=='string'||!/^anon-[a-f0-9]{16,}$/i.test(ballot.id)||seenBallots.has(ballot.id)||!ballot.choices||typeof ballot.choices!=='object'||Array.isArray(ballot.choices))continue;
      seenBallots.add(ballot.id);
      const entries=Object.entries(ballot.choices);
      const valid=entries.every(([positionId,candidateId])=>positions.some(pos=>String(pos.id)===String(positionId)&&(pos.candidates||[]).some(c=>String(c.id)===String(candidateId))));
      if(!valid)continue;
      if(election.allowAbstain===false&&(entries.length!==positions.length||positions.some(pos=>!Object.hasOwn(ballot.choices,String(pos.id)))))continue;
      acceptedBallots++;
      for(const [positionId,candidateId] of entries){const key=`${positionId}:${candidateId}`;candidateCounts[key]=(candidateCounts[key]||0)+1;}
    }
    return {acceptedBallots,candidateCounts};
  }
  function saveElectionSummary(electionId,summary){return storageSet(electionSummaryKey(electionId),JSON.stringify(summary));}
  function writeElectionBallots(electionId,ballots){
    if(!Array.isArray(ballots)||ballots.length>MAX_ELECTION_BALLOTS)return false;
    const previousMeta=readElectionBallotMeta(electionId);if(previousMeta.corrupt)return false;
    const previous=new Map();
    for(let chunk=0;chunk<=previousMeta.lastChunk;chunk++)previous.set(electionBallotChunkKey(electionId,chunk),storageGet(electionBallotChunkKey(electionId,chunk)));
    previous.set(electionBallotMetaKey(electionId),storageGet(electionBallotMetaKey(electionId)));
    previous.set(electionBallotKey(electionId),storageGet(electionBallotKey(electionId)));
    try{
      const chunks=Math.max(0,Math.ceil(ballots.length/BALLOT_CHUNK_SIZE)-1);
      for(let chunk=0;chunk<=chunks;chunk++){
        const values=ballots.slice(chunk*BALLOT_CHUNK_SIZE,(chunk+1)*BALLOT_CHUNK_SIZE);
        if(!storageSet(electionBallotChunkKey(electionId,chunk),JSON.stringify(values)))throw new Error('Ballot chunk could not be saved.');
      }
      for(let chunk=chunks+1;chunk<=previousMeta.lastChunk;chunk++)if(!storageRemove(electionBallotChunkKey(electionId,chunk)))throw new Error('An obsolete ballot chunk could not be removed.');
      if(!storageSet(electionBallotMetaKey(electionId),JSON.stringify({count:ballots.length,lastChunk:chunks})))throw new Error('Ballot metadata could not be saved.');
      if(!storageRemove(electionBallotKey(electionId)))throw new Error('Legacy ballot data could not be removed.');
      return true;
    }catch(error){
      let restored=true;
      for(const [key,value] of previous){const ok=value===null?storageRemove(key):storageSet(key,value);if(!ok)restored=false;}
      if(!restored)electionRecoveryError=new Error(`Election ${electionId} ballot write failed and its previous storage could not be fully restored. Export/recover from a backup before editing this election.`);
      return false;
    }
  }
  function clearElectionBallotChunks(electionId){
    const prefix=`${BALLOT_CHUNK_PREFIX}${Number(electionId)}-`;
    const keys=storageKeys().filter(key=>key.startsWith(prefix));
    if(keys.length>MAX_ELECTION_BALLOT_CHUNKS+1)return false;
    keys.push(electionBallotMetaKey(electionId),electionBallotKey(electionId),electionSummaryKey(electionId));
    for(const key of new Set(keys))if(!storageRemove(key))return false;
    return !storageKeys().some(key=>key.startsWith(prefix)||key===electionBallotMetaKey(electionId)||key===electionBallotKey(electionId)||key===electionSummaryKey(electionId));
  }
  function electionIndexRecord(e){
    return {id:e.id,title:e.title,status:e.status,publicKey:e.publicKey,openAt:e.openAt,closeAt:e.closeAt,showLive:e.showLive,allowAbstain:e.allowAbstain,eligibleClasses:[...(e.eligibleClasses||classes)]};
  }
  function saveElectionDatabase(){
    if(electionRecoveryError)return false;
    const prefixes=[ELECTION_INDEX_KEY,ELECTION_KEY,ELECTION_CONFIG_PREFIX,ELECTION_PUBLIC_CONFIG_PREFIX];
    const snapshot=new Map();
    try{
      for(const key of storageKeys())if(prefixes.some(prefix=>key===prefix||key.startsWith(prefix))){const value=storageGet(key);if(value!==null)snapshot.set(key,value);}
    }catch{persistentStorageAvailable=false;return false;}
    for(const [key,value] of memoryStorage)if(prefixes.some(prefix=>key===prefix||key.startsWith(prefix))&&!snapshot.has(key))snapshot.set(key,value);
    const restore=()=>{
      let ok=true;const current=storageKeys().filter(key=>prefixes.some(prefix=>key===prefix||key.startsWith(prefix)));
      for(const key of current)if(!snapshot.has(key)&&!storageRemove(key))ok=false;
      for(const [key,value] of snapshot)if(!storageSet(key,value))ok=false;
      for(const key of [...memoryStorage.keys()])if(prefixes.some(prefix=>key===prefix||key.startsWith(prefix))&&!snapshot.has(key))memoryStorage.delete(key);
      return ok;
    };
    try{
      const index={version:2,elections:(electionDb.elections||[]).map(electionIndexRecord),nextIds:{...electionDb.nextIds}};
      if(!storageSet(ELECTION_INDEX_KEY,JSON.stringify(index)))throw new Error('Election index could not be saved.');
      const activeIds=new Set();
      for(const election of electionDb.elections||[]){
        activeIds.add(Number(election.id));
        const privateConfig=JSON.parse(JSON.stringify(election));privateConfig.schoolName=db.settings?.schoolName||'School';delete privateConfig.ballots;
        if(!storageSet(electionConfigKey(election.id),JSON.stringify(privateConfig)))throw new Error('Election configuration could not be saved.');
        const publicConfig={id:election.id,title:election.title,status:election.status,publicKey:election.publicKey,openAt:election.openAt,closeAt:election.closeAt,showLive:election.showLive===true,allowAbstain:election.allowAbstain!==false,schoolName:db.settings?.schoolName||'School',positions:(election.positions||[]).map(position=>({id:position.id,name:position.name,candidates:(position.candidates||[]).map(candidate=>({id:candidate.id,name:candidate.name,classLabel:candidate.classLabel||'',details:candidate.details||''}))}))};
        if(!storageSet(electionPublicConfigKey(election.id),JSON.stringify(publicConfig)))throw new Error('Public election configuration could not be saved.');
      }
      for(const key of storageKeys()){
        if((key.startsWith(ELECTION_CONFIG_PREFIX)&&!activeIds.has(Number(key.slice(ELECTION_CONFIG_PREFIX.length))))||(key.startsWith(ELECTION_PUBLIC_CONFIG_PREFIX)&&!activeIds.has(Number(key.slice(ELECTION_PUBLIC_CONFIG_PREFIX.length)))))if(!storageRemove(key))throw new Error('An obsolete election configuration could not be removed.');
      }
      if(!storageRemove(ELECTION_KEY))throw new Error('Legacy election data could not be removed.');
      return true;
    }catch(error){
      if(!restore())electionRecoveryError=new Error('Election save failed and the earlier election settings could not be completely restored. Restore a valid backup before further edits.');
      return false;
    }
  }
  function mergeElectionBallots(store){
    const legacy=readLegacyBallotStore();
    for(const election of store.elections||[]){
      let ballots=[];
      try{
        ballots=readElectionBallots(election.id);
        if(!ballots.length&&Array.isArray(legacy[String(election.id)])&&legacy[String(election.id)].length){ballots=legacy[String(election.id)];if(!writeElectionBallots(election.id,ballots))throw new Error('Legacy ballots could not be migrated to the chunk store.');}
      }catch(error){electionRecoveryError=error;election.recoveryError=true;election.ballots=[];continue;}
      const rebuilt=buildElectionSummary({...election,ballots});
      const current=readElectionSummary(election.id);
      if(current.corrupt||JSON.stringify(current)!==JSON.stringify(rebuilt))if(!saveElectionSummary(election.id,rebuilt)){electionRecoveryError=new Error(`Election ${election.id} result summary could not be saved.`);election.recoveryError=true;}
      election.ballots=[];
    }
    if(!electionRecoveryError){storageRemove(BALLOT_KEY);}
    return store;
  }
  function loadElectionDatabase(seedElections=[], seedNextIds={}) {
    try{
      const indexRaw=storageGet(ELECTION_INDEX_KEY);
      if(indexRaw!==null){
        const index=JSON.parse(indexRaw);
        if(!index||typeof index!=='object'||!Array.isArray(index.elections))throw new Error('Election index structure is invalid.');
        const elections=[];
        for(const meta of index.elections){
          const raw=storageGet(electionConfigKey(meta.id));
          const config=raw?JSON.parse(raw):null;
          if(!config||typeof config!=='object')throw new Error(`Election ${meta.id} configuration is missing or unreadable.`);
          elections.push({...meta,...config,ballots:[]});
        }
        return mergeElectionBallots(normalizeElectionStore(elections,index.nextIds||{}));
      }
      const legacyRaw=storageGet(ELECTION_KEY);
      if(legacyRaw!==null){
        const parsed=JSON.parse(legacyRaw);
        if(!parsed||typeof parsed!=='object'||!Array.isArray(parsed.elections))throw new Error('Legacy election workspace is damaged.');
        return mergeElectionBallots(normalizeElectionStore(parsed.elections,parsed.nextIds||{}));
      }
    }catch(err){
      electionRecoveryError=err;
      console.warn('Election data needs recovery; existing election storage has been preserved:',err);
      return normalizeElectionStore([],seedNextIds);
    }
    return normalizeElectionStore(seedElections,seedNextIds);
  }
  function saveBallotStore(electionId,ballots){return writeElectionBallots(electionId,ballots);}
  function syncElectionBallots(){for(const election of electionDb.elections||[])election.ballots=[];}
  function electionNowInput() { return new Date(Date.now()+330*60*1000).toISOString().slice(0,16); }
  function loadDatabase() {
    let raw=null;
    try {
      raw = storageGet(KEY);
      if (raw) { const original = JSON.parse(raw); if(!Array.isArray(original.elections)) original.elections=[]; original.nextIds ||= {}; original.nextIds.election ||= 1; original.nextIds.position ||= 1; original.nextIds.candidate ||= 1; const needsHouseReset = Number(original.settings?.houseAssignmentVersion || 0) < 3; const needsSectionMigration = (original.students || []).some(student => student && typeof student === 'object' && !String(student.section || '').trim()); const needsCategoryMigration = !Array.isArray(original.settings?.categoryBands) || !original.settings.categoryBands.length; const parsed = migrateDatabase(original); validateBackupShape(parsed); if (needsHouseReset || needsSectionMigration || needsCategoryMigration) storageSet(KEY, JSON.stringify(parsed)); return parsed; }
    } catch (err) {
      console.warn('Could not read local portal data. Original saved data was preserved:', err);
      if(raw!==null){databaseRecoveryError=err;persistentStorageAvailable=false;return migrateDatabase(seedDatabase());}
    }
    const initial = migrateDatabase(seedDatabase());
    if(!storageSet(KEY,JSON.stringify(initial)))console.warn('Persistent browser storage is unavailable; this session will use temporary in-memory data.');
    return initial;
  }
  function saveDatabase() {
    if(databaseRecoveryError){updateStorageStatus();return false;}
    let previousRaw=null;
    previousRaw=storageGet(KEY);
    const mainSnapshot=JSON.parse(JSON.stringify(db)); delete mainSnapshot.elections; if(mainSnapshot.nextIds){delete mainSnapshot.nextIds.election;delete mainSnapshot.nextIds.position;delete mainSnapshot.nextIds.candidate;} const saved=storageSet(KEY,JSON.stringify(mainSnapshot));
    if(!saved&&previousRaw){
      try{
        const restored=migrateDatabase(JSON.parse(previousRaw));
        db=restored;classes=[...restored.settings.classes];sections=[...restored.settings.sections];
        registrationLookupSource=null;studentLookupSource=null;programmeLookupSource=null;
      }catch(error){
        databaseRecoveryError=new Error(`A save failed and the previous school data could not be restored in memory: ${error.message}`);
      }
    }
    if(!saved&&!storageWarningShown){storageWarningShown=true;toast('Browser storage is blocked or full. The previous saved data was restored where available; export a backup and check browser storage before retrying.','warning');}
    updateStorageStatus();return saved;
  }
  function updateStorageStatus() {
    const strong=$('.sidebar-status strong'),small=$('.sidebar-status small');if(!strong||!small)return;
    if(sharedStorage.status==='connected'){
      strong.textContent='Shared test workspace';
      small.textContent='Multi-device sync active · no sign-in';
    }else if(sharedStorage.status==='connecting'){
      strong.textContent='Connecting shared workspace';
      small.textContent='Checking Supabase connection…';
    }else if(sharedStorage.status==='needs-reset'){
      strong.textContent='Trial setup needs reset';
      small.textContent='Replace this browser data with fictional demo data to sync';
    }else if(sharedStorage.status==='error'){
      strong.textContent='Shared sync unavailable';
      small.textContent='This browser is currently working locally';
    }else{
      strong.textContent=persistentStorageAvailable?'Local working copy':'Temporary local session';
      small.textContent=persistentStorageAvailable?'Changes saved in this browser':'Changes are lost when this tab closes';
    }
  }
  function audit(action, record, detail = '') {
    const actor=userByRole(state.role)?.displayName||roleNames[state.role]||'System';
    db.audit.unshift({ id: Date.now() + Math.floor(Math.random() * 1000), date: new Date().toISOString(), actor, role: state.role, action, record, detail: String(detail).slice(0,240) });
    db.audit = db.audit.slice(0,300);
  }
  function commitElectionMutation(change, auditAction, record, detail) {
    const previousDb=JSON.stringify(db),previousElection=JSON.stringify(electionDb);
    try{
      change();
      if(auditAction)audit(auditAction,record,detail);
      if(saveElectionDatabase()&&saveDatabase())return true;
    }catch(error){console.warn('Election update failed:',error);}
    db=JSON.parse(previousDb);electionDb=JSON.parse(previousElection);
    const electionRestored=saveElectionDatabase(),mainRestored=saveDatabase();
    if(!electionRestored||!mainRestored)electionRecoveryError=new Error('An election update failed and its previous state may not have been fully restored. Restore from a backup before continuing.');
    return false;
  }
  function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  // DOB input is deliberately locale-friendly: school staff commonly use DD/MM/YYYY.
  // Stored values remain canonical YYYY-MM-DD so sorting, exports and backups stay consistent.
  function parseDateOfBirth(value) {
    const raw=String(value??'').trim();
    if(!raw)return '';
    let text=raw.replace(/\s+/g,' ').trim();
    // Accept date-time strings from spreadsheets, but ignore the time component for DOB.
    text=text.replace(/([T ]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)$/i,'').trim();
    const monthNames={jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12};
    const expandYear=y=>{const n=Number(y);if(String(y).length===2)return n<=29?2000+n:1900+n;return n;};
    let year,month,day,m;
    if((m=text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))){year=Number(m[1]);month=Number(m[2]);day=Number(m[3]);}
    else if((m=text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/))){day=Number(m[1]);month=Number(m[2]);year=expandYear(m[3]);}
    else if((m=text.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9}),?\s+(\d{2}|\d{4})$/i))){day=Number(m[1]);month=monthNames[m[2].toLowerCase()];year=expandYear(m[3]);}
    else if((m=text.match(/^([A-Za-z]{3,9})[-/. ]+(\d{1,2})(?:st|nd|rd|th)?,?[-/. ]+(\d{2}|\d{4})$/i))){month=monthNames[m[1].toLowerCase()];day=Number(m[2]);year=expandYear(m[3]);}
    else if((m=text.match(/^(\d{1,2})[-/.]([A-Za-z]{3,9})[-/.](\d{2}|\d{4})$/i))){day=Number(m[1]);month=monthNames[m[2].toLowerCase()];year=expandYear(m[3]);}
    else return null;
    if(!Number.isInteger(year)||year<1||year>9999||!Number.isInteger(month)||month<1||month>12||!Number.isInteger(day)||day<1)return null;
    const leap=year%4===0&&(year%100!==0||year%400===0);
    const monthDays=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
    if(day>monthDays[month-1])return null;
    return `${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }
  function formatDateOfBirth(value) {
    const iso=parseDateOfBirth(value);
    if(!iso)return String(value??'');
    const [year,month,day]=iso.split('-');
    return `${Number(day)}/${Number(month)}/${year}`;
  }
  function ageOnDate(dob, referenceDate=schoolDateISO()) {
    const birth=parseDateOfBirth(dob),reference=parseDateOfBirth(referenceDate);
    if(!birth||!reference||birth>reference)return null;
    const [by,bm,bd]=birth.split('-').map(Number),[ry,rm,rd]=reference.split('-').map(Number);
    return ry-by-((rm<bm||(rm===bm&&rd<bd))?1:0);
  }
  function studentAge(student, referenceDate=schoolDateISO()) { return ageOnDate(student?.dob,referenceDate); }
  function studentAgeText(student, referenceDate=schoolDateISO()) { const age=studentAge(student,referenceDate);return age===null?'—':String(age); }
  function ageFilterMarkup(id, students, selected='') {
    const ages=[...new Set(students.map(student=>studentAge(student)).filter(age=>Number.isInteger(age)))].sort((a,b)=>a-b);
    const underOptions=Array.from({length:16},(_,i)=>i+6).map(n=>({value:`under-${n}`,label:`Under ${n}`}));
    return `<label class="filter-field"><span>Age</span><select class="filter-select" id="${id}"><option value="">All ages</option><option value="unknown" ${selected==='unknown'?'selected':''}>Age unavailable</option><optgroup label="Age groups">${selectOptions(underOptions,selected)}</optgroup><optgroup label="Exact age">${selectOptions(ages.map(age=>({value:String(age),label:`${age} years`})),selected)}</optgroup></select></label>`;
  }
  function matchesAgeFilter(student, value='') {
    if(!value)return true;
    const age=studentAge(student);
    if(value==='unknown')return age===null;
    const underMatch=String(value).match(/^under-(\d+)$/);
    if(underMatch)return age!==null&&age<Number(underMatch[1]);
    return age!==null&&String(age)===String(value);
  }
  function programmeAgeLabel(programme) { return 'Age shown and filtered from DOB'; }

  function initials(name) { return String(name || 'NA').trim().split(/\s+/).slice(0,2).map(x => x[0] || '').join('').toUpperCase(); }
  function defaultCategoryBands() { return [
    {id:'cat1',name:'Cat 1',minClass:1,maxClass:4},
    {id:'cat2',name:'Cat 2',minClass:5,maxClass:7},
    {id:'cat3',name:'Cat 3',minClass:8,maxClass:10},
    {id:'cat4',name:'Cat 4',minClass:11,maxClass:12}
  ]; }
  function categoryBands(source=db?.settings?.categoryBands) {
    const bands=Array.isArray(source)&&source.length?source:defaultCategoryBands();
    return bands.filter(b=>b&&String(b.name||'').trim()&&Number.isInteger(Number(b.minClass))&&Number.isInteger(Number(b.maxClass))).map(b=>({...b,name:String(b.name).trim(),minClass:Number(b.minClass),maxClass:Number(b.maxClass)}));
  }
  function categoryNames(source) { return categoryBands(source).map(b=>b.name); }
  function categoryForClassWithBands(n,bands=categoryBands()) {
    n=Number(n);const band=categoryBands(bands).find(b=>n>=b.minClass&&n<=b.maxClass);return band?.name||'Uncategorised';
  }
  function catForClass(n) { return categoryForClassWithBands(n); }
  function ordinalClass(n) { const v=Number(n),tail=v%100;const suffix=tail>=11&&tail<=13?'th':({1:'st',2:'nd',3:'rd'}[v%10]||'th');return `${v}${suffix}`; }
  let studentLookupSource=null,studentLookupLength=-1,studentByIdMap=new Map();
  let programmeLookupSource=null,programmeLookupLength=-1,programmeByIdMap=new Map();
  function rebuildEntityLookups(){
    if(studentLookupSource!==db.students||studentLookupLength!==db.students.length){studentLookupSource=db.students;studentLookupLength=db.students.length;studentByIdMap=new Map(db.students.map(student=>[Number(student.id),student]));}
    if(programmeLookupSource!==db.programmes||programmeLookupLength!==db.programmes.length){programmeLookupSource=db.programmes;programmeLookupLength=db.programmes.length;programmeByIdMap=new Map(db.programmes.map(programme=>[Number(programme.id),programme]));}
  }
  function studentById(id) { rebuildEntityLookups(); return studentByIdMap.get(Number(id)); }
  function programmeById(id) { rebuildEntityLookups(); return programmeByIdMap.get(Number(id)); }
  function userByRole(role) {
    const active=db.users.filter(u=>u.role===role&&u.active);
    return (role===state.role?active.find(u=>u.id===Number(state.previewUserId)):null)||active[0]||null;
  }
  function previewAccounts() { return db.users.filter(u=>u.role===state.role&&u.active).map(u=>({id:u.id,label:u.displayName})); }
  function parentStudentIds(user=userByRole('parent')) {
    if (user?.portalEnabled === false) return [];
    const ids=Array.isArray(user?.linkedStudentIds)?user.linkedStudentIds:(user?.linkedStudentId?[user.linkedStudentId]:[]);
    return [...new Set(ids.map(Number))].filter(id=>studentById(id)?.active);
  }
  function parentStudents() { return parentStudentIds().map(studentById).filter(Boolean); }
  function currentLinkedStudent() {
    if(state.role!=='parent')return null;
    const students=parentStudents();
    return students.find(student=>student.id===Number(state.selectedStudentId))||students[0]||null;
  }
  function isAdmin() { return state.role === 'admin'; }
  function teacherClassSections() {
    const user=userByRole('teacher');if(!user)return [];
    const map=db.settings?.classTeachers||{};
    return Object.entries(map).filter(([,teacherId])=>Number(teacherId)===Number(user.id)).map(([key])=>{const [classNo,section]=key.split('|');return {classNo:Number(classNo),section:String(section)};}).filter(x=>classes.includes(x.classNo)&&(sections.includes(x.section)||x.section==='Unsectioned')).sort((a,b)=>a.classNo-b.classNo||a.section.localeCompare(b.section));
  }
  function teacherClasses() { return [...new Set(teacherClassSections().map(x=>x.classNo))]; }
  function assignedTeacherFor(classNo,section) { const id=Number(db.settings?.classTeachers?.[classSectionKey(classNo,section)]||0);return db.users.find(u=>u.id===id&&u.active&&u.role==='teacher')||null; }
  function teacherCanAccessStudent(student) { return !!student&&teacherClassSections().some(x=>x.classNo===Number(student.classNo)&&x.section===String(student.section)); }
  function classSectionKey(classNo,section) { return `${Number(classNo)}|${String(section)}`; }
  function teacherHasPower(userId, permission) {
    const user=db.users.find(item=>Number(item.id)===Number(userId)&&item.role==='teacher'&&item.active);
    const record=db.settings?.teacherPermissions?.[String(Number(userId))]||{};
    return !!user&&record[permission]===true;
  }
  function currentTeacherHas(permission) {
    const teacher = userByRole('teacher');
    return !!teacher && teacherHasPower(teacher.id, permission);
  }
  function teacherCanAssignHouses(userId) {
    const user = db.users.find(x => Number(x.id) === Number(userId) && x.active && x.role === 'teacher');
    return !!user && teacherHasPower(user.id, 'assignHouses') && Object.values(db.settings.classTeachers || {}).some(id => Number(id) === Number(user.id));
  }
  function teacherCanAddSections(userId, classNo) {
    const user = db.users.find(x => Number(x.id) === Number(userId) && x.active && x.role === 'teacher');
    return !!user && teacherHasPower(user.id, 'manageSections') && teacherClassSections().some(pair => pair.classNo === Number(classNo));
  }
  function currentTeacherCanAssignHouses() { const user = userByRole('teacher'); return !!user && teacherCanAssignHouses(user.id); }
  function teacherCanAccessSection(classNo, section) {
    return teacherClassSections().some(x => x.classNo === Number(classNo) && x.section === String(section));
  }
  function canAddStudentToSection(classNo, section) {
    return isAdmin() || (state.role === 'teacher' && currentTeacherHas('addStudents') && teacherCanAccessSection(classNo, section));
  }
  function canRemoveStudentRecord(student) {
    return isAdmin() || (state.role === 'teacher' && !!student && currentTeacherHas('removeStudents') && teacherCanAccessStudent(student));
  }
  function sectionsForClass(classNo) {
    const present = db.students.some(st => st.active && Number(st.classNo) === Number(classNo) && st.section === 'Unsectioned');
    return [...sections, ...(present && !sections.includes('Unsectioned') ? ['Unsectioned'] : [])];
  }
  function teacherCanManageUnsectionedClass(classNo) { return state.role==='teacher' && teacherClassSections().some(pair=>pair.classNo===Number(classNo)); }
  function canViewStudent(s) { return isAdmin() || (state.role === 'teacher' && (teacherCanAccessStudent(s) || s?.section==='Unsectioned' && teacherCanManageUnsectionedClass(s.classNo))); }
  function canEditStudent(s) { return isAdmin() || (state.role === 'teacher' && currentTeacherHas('editStudents') && teacherCanAccessStudent(s)); }
  function dateOnly(v) { return v ? String(v).slice(0,10) : ''; }
  function localDateString(d=new Date()) { return schoolDateISO(d); }
  function validSchoolDateKey(value) {
    const key=dateOnly(value),match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
    if(!match)return null;
    const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
    const date=new Date(Date.UTC(year,month-1,day,12));
    return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day?{key,date}:null;
  }
  function formatDate(v, options={ day:'2-digit', month:'short', year:'numeric' }) {
    if (!v) return 'Not set';
    const parsed=validSchoolDateKey(v);
    if(!parsed)return String(v);
    return new Intl.DateTimeFormat('en-IN',{...options,timeZone:SCHOOL_TIME_ZONE}).format(parsed.date);
  }
  function formatTime(v) { return formatSchoolDateTime(v); }
  function badge(text, kind='neutral') { return `<span class="status-pill ${kind==='open'?'status-open':kind==='closed'?'status-closed':kind==='draft'?'status-draft':''}">${esc(text)}</span>`; }
  function catBadge(text) { return `<span class="category-pill">${esc(text)}</span>`; }
  function btn(label, action, cls='btn', attrs='') { return `<button type="button" class="${esc(cls)}" data-action="${esc(action)}" ${attrs}>${esc(label)}</button>`; }
  function selectOptions(values, selected='', allLabel='') { return (allLabel?`<option value="">${esc(allLabel)}</option>`:'') + values.map(v=>{ const value=typeof v==='object'?v.value:v, label=typeof v==='object'?v.label:v; return `<option value="${esc(value)}" ${String(value)===String(selected)?'selected':''}>${esc(label)}</option>`; }).join(''); }
  function heading(title, description, eyebrow='ACTIVITY MANAGER', actions='') { return `<div class="page-heading"><div class="page-heading-main"><p class="eyebrow">${esc(eyebrow)}</p><h1>${esc(title)}</h1><p>${esc(description)}</p></div><div class="heading-actions">${actions}</div></div>`; }
  function toast(message, type='success') {
    if(type==='success'&&(!persistentStorageAvailable||databaseRecoveryError)){
      type='warning';
      message=databaseRecoveryError
        ? 'Not saved. The existing saved data could not be read; restore a valid backup before editing.'
        : 'Not saved permanently. Browser storage is unavailable or full. This change is only temporary and will be lost when this tab closes.';
    }
    const region=$('#toast-region'); if(!region)return;
    const el=document.createElement('div'); el.className=`toast ${type}`; el.textContent=message; region.append(el); window.setTimeout(()=>el.remove(),6500);
  }
  function updateIdentity() {
    document.body.dataset.role = state.role;
    const user = userByRole(state.role);
    const name = user?.displayName || roleNames[state.role];
    $('#sidebar-avatar').textContent = initials(name); $('#top-avatar').textContent = initials(name);
    $('#sidebar-user-name').textContent = name; $('#sidebar-user-role').textContent = roleNames[state.role];
    $('#top-user-name').textContent = name; $('#top-user-role').textContent = roleNames[state.role];
    const accountChoices=previewAccounts();
    if(!accountChoices.some(x=>Number(x.id)===Number(state.previewUserId)))state.previewUserId=accountChoices[0]?.id??null;
    $$('select[data-workspace-role]').forEach(select=>{select.value=state.role;});
    $$('[data-workspace-account-wrap]').forEach(wrap=>{wrap.hidden=!accountChoices.length;});
    $$('select[data-preview-account]').forEach(select=>{
      select.innerHTML=accountChoices.map(x=>`<option value="${x.id}">${esc(x.label)}</option>`).join('');
      if(state.previewUserId!==null)select.value=String(state.previewUserId);
    });
    $$('[data-roles]').forEach(node => {
      const allowed=node.dataset.roles.split(',').map(role=>role.trim()).includes(state.role);
      node.hidden=!allowed;
      node.setAttribute('aria-hidden',String(!allowed));
    });
    $$('.nav-item[data-page]').forEach(node => {
      const allowed=pageAllowed(node.dataset.page);
      node.hidden=!allowed;
      node.setAttribute('aria-hidden',String(!allowed));
    });
    $('#global-search').parentElement.hidden = state.role==='parent';
    $('#school-name-nav').textContent = db.settings.schoolName.toUpperCase();
    $('#footer-school').textContent = `${db.settings.schoolName.toUpperCase()} · ACTIVITY MANAGER`;
    $('#year-pill').textContent = db.settings.academicYear;
    $('#breadcrumb-title').textContent = pageNames[state.page] || 'Overview';
  }
  function pageAllowed(page) {
    const roleMap = {
      dashboard: ['admin','teacher','parent'], students: ['admin','teacher'],
      arts: ['admin','teacher','parent'], sports: ['admin','teacher','parent'], groups: ['admin','teacher','parent'],
      'programme-detail': ['admin','teacher'], results: ['admin','teacher','parent'],
      reports: ['admin','teacher'], 'not-registered': ['admin','teacher'], calendar: ['admin','teacher','parent'],
      portal: ['parent'], 'house-assign': ['teacher'], admin: ['admin']
    };
    if (!(roleMap[page] || []).includes(state.role)) return false;
    if (page === 'house-assign') return currentTeacherCanAssignHouses();
    if (page === 'reports' && state.role==='teacher') return currentTeacherHas('viewReports');
    return true;
  }
  function fallbackPage() { return state.role === 'parent' ? 'portal' : 'dashboard'; }
  // Some browsers assign file:// pages an opaque origin and reject History API
  // pushState(), even for a same-file hash. Keep the normal HTTP history path,
  // but gracefully fall back to a hash change so direct index.html opening works.
  function updateRouteHistory(fragment) {
    const target = `#${String(fragment || 'dashboard').replace(/^#/, '')}`;
    try {
      if (window.history && typeof window.history.pushState === 'function') {
        window.history.pushState({}, '', target);
        return 'history';
      }
    } catch (error) {
      // Expected on some file:// origins; the hash fallback below is safe.
    }
    try {
      if (window.location.hash !== target) window.location.hash = target;
      return 'hash';
    } catch (error) {
      console.warn('Could not update the portal route. The current page will remain available:', error);
      return 'none';
    }
  }
  function navigate(page, push=true) {
    if (!pageAllowed(page)) { toast('This workspace is not available to the selected role.', 'warning'); return; }
    state.page = page; state.programmeId = null;
    if (push) updateRouteHistory(page);
    closeSidebar(); render();
  }
  function sidebarIsMobile() {
    return window.matchMedia('(max-width: 940px)').matches;
  }
  function navigationForCurrentPage() {
    return document.body.dataset.page === 'admin' ? $('#admin-section-nav') : $('#sidebar');
  }
  let sidebarReturnFocus=null;
  function setNavigationBackgroundInert(isAdmin,open) {
    const targets=isAdmin?[$('.topbar'),$('.admin-content-v2')]:[$('.main-area')];
    targets.filter(Boolean).forEach(node=>{
      node.inert=!!open;
      if(open)node.setAttribute('aria-hidden','true');else node.removeAttribute('aria-hidden');
    });
    if(!open)[$('.topbar'),$('.main-area'),$('.admin-content-v2')].filter(Boolean).forEach(node=>{node.inert=false;node.removeAttribute('aria-hidden');});
  }
  function openSidebar() {
    const sidebar=navigationForCurrentPage(),scrim=$('#mobile-scrim'),button=$('#mobile-menu');
    if(!sidebar||!button)return;
    if(sidebarIsMobile()) {
      const isAdminNavigation=sidebar.id==='admin-section-nav';
      sidebarReturnFocus=document.activeElement;
      sidebar.classList.add('open');
      sidebar.setAttribute('aria-hidden','false');
      sidebar.setAttribute('tabindex','-1');
      if(isAdminNavigation) {
        document.body.classList.add('admin-sidebar-open');
        scrim?.classList.remove('open');
        scrim?.setAttribute('aria-hidden','true');
      } else {
        scrim?.classList.add('open');
        scrim?.setAttribute('aria-hidden','false');
        document.body.classList.add('sidebar-open');
      }
      setNavigationBackgroundInert(isAdminNavigation,true);
      button.setAttribute('aria-expanded','true');
      button.setAttribute('aria-label','Close navigation');
      const first=sidebar.querySelector('.sidebar-mobile-close,.admin-nav-close,button:not([hidden]),a:not([hidden]),.nav-item:not([hidden])');
      if(first)requestAnimationFrame(()=>first.focus({preventScroll:true}));
      else requestAnimationFrame(()=>sidebar.focus({preventScroll:true}));
      return;
    }
    if(sidebar.id==='sidebar')sidebar.classList.add('sidebar-pinned');
    button.setAttribute('aria-expanded','true');
    button.setAttribute('aria-label','Collapse navigation');
  }
  function closeSidebar(restoreFocus=false) {
    const sidebar=navigationForCurrentPage(),scrim=$('#mobile-scrim'),button=$('#mobile-menu');
    const mobile=sidebarIsMobile();
    sidebar?.classList.remove('open','sidebar-pinned');
    $('#sidebar')?.classList.remove('open','sidebar-pinned');
    $('#admin-section-nav')?.classList.remove('open');
    scrim?.classList.remove('open');
    document.body.classList.remove('sidebar-open','admin-sidebar-open');
    sidebar?.setAttribute('aria-hidden',mobile?'true':'false');
    $('#sidebar')?.setAttribute('aria-hidden',mobile?'true':'false');
    $('#admin-section-nav')?.setAttribute('aria-hidden',mobile?'true':'false');
    setNavigationBackgroundInert(false,false);
    scrim?.setAttribute('aria-hidden','true');
    button?.setAttribute('aria-expanded','false');
    button?.setAttribute('aria-label','Open navigation');
    const returnTarget=sidebarReturnFocus&&sidebarReturnFocus.isConnected?sidebarReturnFocus:button;
    sidebarReturnFocus=null;
    if(restoreFocus&&returnTarget&&!returnTarget.inert)returnTarget.focus({preventScroll:true});
  }
  function toggleSidebar() {
    const sidebar=navigationForCurrentPage();
    if(!sidebar)return;
    if(sidebarIsMobile()) {
      sidebar.classList.contains('open') ? closeSidebar(true) : openSidebar();
    } else if(sidebar.id==='sidebar') {
      sidebar.classList.contains('sidebar-pinned') ? closeSidebar(false) : openSidebar();
    }
  }
  function activeNav() { $$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page===state.page || (state.page==='programme-detail' && b.dataset.page===state.programmeArea))); }
  let modalReturnFocus=null;
  function isActuallyVisible(element) {
    if(!element||element.disabled||element.closest('[hidden],[inert],[aria-hidden="true"]'))return false;
    const style=getComputedStyle(element);
    return style.display!=='none'&&style.visibility!=='hidden'&&element.getClientRects().length>0;
  }
  function openModal(title, html, kicker='RECORD') {
    const backdrop=$('#modal-backdrop');
    if(backdrop.hidden)modalReturnFocus=document.activeElement;
    $('#modal-title').textContent=title;$('#modal-kicker').textContent=kicker;$('#modal-body').innerHTML=html;ensureAccessibleControlLabels($('#modal-body'));backdrop.hidden=false;document.body.style.overflow='hidden';
    const target=$$('#modal-body input:not([disabled]),#modal-body select:not([disabled]),#modal-body textarea:not([disabled]),#modal-body button:not([disabled])').find(isActuallyVisible);
    if(target)setTimeout(()=>{if(isActuallyVisible(target))target.focus();},30);
    setTimeout(()=>{syncProgrammeForm();syncStaffForm();},0);
  }
  function closeModal() {
    $('#modal-backdrop').hidden=true;$('#modal-body').innerHTML='';document.body.style.overflow='';
    const target=modalReturnFocus;modalReturnFocus=null;
    if(target?.isConnected&&typeof target.focus==='function')setTimeout(()=>target.focus(),0);
  }
  document.addEventListener('keydown',event=>{
    const backdrop=$('#modal-backdrop');if(!backdrop||backdrop.hidden)return;
    if(event.key==='Escape'){event.preventDefault();closeModal();return;}
    if(event.key!=='Tab')return;
    const modal=$('.modal',backdrop);
    const focusable=$$('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])',modal).filter(isActuallyVisible);
    if(!focusable.length){event.preventDefault();modal?.focus?.();return;}
    const first=focusable[0],last=focusable[focusable.length-1];
    if(event.shiftKey&&(document.activeElement===first||!modal.contains(document.activeElement))){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&(document.activeElement===last||!modal.contains(document.activeElement))){event.preventDefault();first.focus();}
  });
  function applyTheme(theme) { state.theme=theme==='dark'?'dark':'light'; document.documentElement.dataset.theme=state.theme; const themeMeta=document.querySelector('meta[name="theme-color"]'); if(themeMeta)themeMeta.content=state.theme==='dark'?'#111923':'#F5F1E9'; storageSet(THEME_KEY,state.theme); storageSet(THEME_DEFAULT_VERSION_KEY,'3'); $('#theme-symbol').innerHTML=uiIcon(state.theme==='dark'?'sun':'moon','ui-icon theme-symbol-icon'); $('#theme-toggle').setAttribute('aria-label',state.theme==='dark'?'Switch to light theme':'Switch to dark theme'); updateStorageStatus(); }
  function applySchoolBranding() {
    const schoolName=db.settings.schoolName||'Your School';
    const logo=$('#school-logo'); if(logo) logo.src=db.settings.logoDataUrl||'assets/mark.svg';
    const name=$('#school-name-nav'); if(name) name.textContent=schoolName.toUpperCase();
    const footer=$('#footer-school'); if(footer) footer.textContent=`${schoolName} · ACTIVITY MANAGER`;
    document.title=`${schoolName} · Arts & Sports Portal`;
    const bg=db.settings.backgroundDataUrl;document.documentElement.style.setProperty('--school-background',bg?`url("${bg}")`:'url("assets/campus-hero.jpg")');
  }
  let registrationLookupSource=null,registrationLookupLength=-1,registrationByStudent=new Map(),registrationByProgramme=new Map();
  function ensureRegistrationLookups(){
    if(registrationLookupSource===db.registrations&&registrationLookupLength===db.registrations.length)return;
    registrationLookupSource=db.registrations;registrationLookupLength=db.registrations.length;registrationByStudent=new Map();registrationByProgramme=new Map();
    for(const reg of db.registrations){
      const sid=Number(reg.studentId),pid=Number(reg.programmeId);if(!Number.isSafeInteger(sid)||!Number.isSafeInteger(pid))continue;
      if(!registrationByStudent.has(sid))registrationByStudent.set(sid,[]);
      if(!registrationByProgramme.has(pid))registrationByProgramme.set(pid,[]);
      registrationByStudent.get(sid).push(reg);registrationByProgramme.get(pid).push(reg);
    }
  }
  function recordCount(pid){
    ensureRegistrationLookups();
    return (registrationByProgramme.get(Number(pid))||[]).reduce((count,reg)=>{
      const student=studentById(reg.studentId);
      return count+(student&&student.active!==false?1:0);
    },0);
  }
  function registrationsFor(sid){
    ensureRegistrationLookups();
    const student=studentById(sid);
    return student&&student.active!==false?(registrationByStudent.get(Number(sid))||[]):[];
  }
  function isEligible(student,p){
    if(!student||!p||student.active===false||p.archived)return false;
    const classNo=Number(student.classNo),min=Number(p.classMin||1),max=Number(p.classMax||12);
    if(!Number.isInteger(classNo)||classNo<min||classNo>max)return false;
    const category=catForClass(classNo);
    if(p.category==='Group Item'){
      if(p.groupScope==='categories'&&!(Array.isArray(p.eligibleCategories)&&p.eligibleCategories.includes(category)))return false;
    }else if(category!==p.category)return false;
    if(p.gender==='Boys'&&student.gender!=='Boy')return false;
    if(p.gender==='Girls'&&student.gender!=='Girl')return false;
    return true;
  }
  function programmeOpen(p){
    if(!p||p.archived||p.status!=='open')return false;
    const today=localDateString();
    const globalOpen=String(db.settings.registrationOpen||'');
    const globalClose=String(db.settings.registrationClose||'');
    if(globalOpen&&today<globalOpen)return false;
    if(globalClose&&today>globalClose)return false;
    if(p.openDate&&today<p.openDate)return false;
    if(p.closeDate&&today>p.closeDate)return false;
    return true;
  }
  function selectedProgrammeCount(student,area,itemType){
    return registrationsFor(student.id).map(reg=>programmeById(reg.programmeId)).filter(programme=>programme&&!programme.archived&&programme.area===area&&programme.category!=='Group Item'&&inferProgrammeType(programme.area,programme.category,programme.name,programme.description,programme.itemType)===itemType).length;
  }
  function quotaStatus(student, p, options={}) {
    const selected = registrationsFor(student.id).map(r=>programmeById(r.programmeId)).filter(programme=>programme && !programme.archived);
    if(selected.some(x=>x.id===p.id))return {ok:false,reason:'Already selected'};
    const groups=selected.filter(x=>x.category==='Group Item').length;
    if(p.category==='Group Item'&&groups>=Number(db.settings.maxGroup??2))return {ok:false,reason:`Group Item limit reached (${db.settings.maxGroup})`};
    if(p.category!=='Group Item'&&p.area==='Arts'){
      const type=inferProgrammeType(p.area,p.category,p.name,p.description,p.itemType);
      const cap=Number(type==='onstage'?db.settings.maxArtsOnstage??3:db.settings.maxArtsOffstage??3);
      const used=selectedProgrammeCount(student,'Arts',type);
      if(used>=cap)return {ok:false,reason:`Arts ${type} limit reached (${cap})`};
    }
    if(p.category!=='Group Item'&&p.area==='Sports'){
      const type=inferProgrammeType(p.area,p.category,p.name,p.description,p.itemType);
      const total=selected.filter(x=>x.area==='Sports'&&x.category!=='Group Item').length;
      const used=selectedProgrammeCount(student,'Sports',type);
      const totalCap=Number(db.settings.maxSports??3),typeCap=Number(type==='track'?db.settings.maxSportsTrack??2:db.settings.maxSportsField??2);
      if(total>=totalCap)return {ok:false,reason:`Sports limit reached (${totalCap} total)`};
      if(used>=typeCap)return {ok:false,reason:`Sports ${type} limit reached (${typeCap})`};
    }
    if(recordCount(p.id)>=Number(p.capacity||99999))return {ok:false,reason:'Programme capacity reached'};
    if(!options.staffOverride&&!programmeOpen(p))return {ok:false,reason:'The choice period is closed'};
    return {ok:true,reason:''};
  }
  function allowedProgrammes() {
    if (state.role === 'teacher') return db.programmes.filter(p=>!p.archived && p.status!=='draft');
    if (state.role === 'parent') {
      const student=currentLinkedStudent(); return db.programmes.filter(p=>p.status!=='draft'&&!p.archived&&isEligible(student,p));
    }
    return db.programmes.filter(p=>!p.archived);
  }
  function studentCell(s) { return `<div class="student-cell"><span class="student-dot">${esc(initials(s.name))}</span><span class="student-copy"><strong>${esc(s.name)}</strong><small>${esc(s.admissionNo)}</small></span></div>`; }
  function sortStudentRecords(rows, sort='name') {
    const collator=new Intl.Collator('en',{numeric:true,sensitivity:'base'});
    const categoryOrder=new Map(categoryBands().map((band,index)=>[band.name,index]));
    const compare=(a,b)=>{
      switch(sort){
        case 'class': return Number(a.classNo)-Number(b.classNo)||collator.compare(a.section||'',b.section||'')||collator.compare(a.name||'',b.name||'');
        case 'class-desc': return Number(b.classNo)-Number(a.classNo)||collator.compare(a.section||'',b.section||'')||collator.compare(a.name||'',b.name||'');
        case 'section': return Number(a.classNo)-Number(b.classNo)||collator.compare(a.section||'',b.section||'')||collator.compare(a.name||'',b.name||'');
        case 'gender': return collator.compare(a.gender||'Not specified',b.gender||'Not specified')||collator.compare(a.name||'',b.name||'');
        case 'age': return (studentAge(a)??999)-(studentAge(b)??999)||collator.compare(a.name||'',b.name||'');
        case 'age-desc': return (studentAge(b)??-1)-(studentAge(a)??-1)||collator.compare(a.name||'',b.name||'');
        case 'category': return (categoryOrder.get(catForClass(a.classNo))??99)-(categoryOrder.get(catForClass(b.classNo))??99)||Number(a.classNo)-Number(b.classNo)||collator.compare(a.name||'',b.name||'');
        case 'admission': return collator.compare(a.admissionNo||'',b.admissionNo||'');
        case 'name-desc': return collator.compare(b.name||'',a.name||'');
        default: return collator.compare(a.name||'',b.name||'');
      }
    };
    return rows.slice().sort(compare);
  }
  function sortProgrammeRecords(rows, sort='name') {
    const collator=new Intl.Collator('en',{numeric:true,sensitivity:'base'});
    const categoryOrder=new Map(categoryBands().map((band,index)=>[band.name,index]));
    const entryCounts=sort==='entries'?new Map(rows.map(programme=>[Number(programme.id),recordCount(programme.id)])):null;
    return rows.slice().sort((a,b)=>{
      if(sort==='area')return collator.compare(a.area||'',b.area||'')||collator.compare(a.name||'',b.name||'');
      if(sort==='category')return (categoryOrder.get(a.category)??99)-(categoryOrder.get(b.category)??99)||collator.compare(a.name||'',b.name||'');
      if(sort==='gender')return collator.compare(a.gender||'',b.gender||'')||collator.compare(a.name||'',b.name||'');
      if(sort==='deadline')return String(a.closeDate||'9999').localeCompare(String(b.closeDate||'9999'))||collator.compare(a.name||'',b.name||'');
      if(sort==='entries')return entryCounts.get(Number(b.id))-entryCounts.get(Number(a.id))||collator.compare(a.name||'',b.name||'');
      if(sort==='capacity')return Number(b.capacity||0)-Number(a.capacity||0)||collator.compare(a.name||'',b.name||'');
      return collator.compare(a.name||'',b.name||'');
    });
  }
  function groupTeamRows(programmeId){return (db.groupTeams||[]).filter(team=>team.programmeId===Number(programmeId)&&team.mode==='house');}
  function groupTeamLabel(team){return `${team.house} House · ${team.category}`;}
  function groupTeamForm(programme){
    const category=catForClass(programme.classMin),house=(db.settings.houseNames||[])[0]||'';
    const candidates=db.students.filter(student=>student.active&&isEligible(student,programme)&&catForClass(student.classNo)===category&&student.house===house&&(isAdmin()||canViewStudent(student))).sort((a,b)=>a.classNo-b.classNo||String(a.section).localeCompare(String(b.section))||a.name.localeCompare(b.name));
    const checkboxes=candidates.map(student=>`<label class="check-tile"><input type="checkbox" name="studentIds" value="${student.id}">${esc(student.name)} · ${ordinalClass(student.classNo)} ${esc(student.section)} · ${esc(student.house||'No house')}</label>`).join('');
    return `<form data-form="group-team" data-programme="${programme.id}" data-mode="house"><div class="info-box">School competition teams are house-based. Every member must belong to the selected house and match this Group Item's class/category/gender rules. Teachers and administrators can create the team, but no student is added unless they are explicitly selected.</div><div class="form-grid"><div class="form-field"><label>Student category</label><select class="field" name="teamCategory" required>${selectOptions(categoryNames(),category)}</select></div><div class="form-field"><label>House</label><select class="field" name="teamHouse" required>${selectOptions(db.settings.houseNames||[],house)}</select></div></div><div class="form-field full"><label>Team members</label><div class="checkbox-grid" data-group-team-students>${checkboxes||'<p class="subtle-note">No eligible students are available for this house team.</p>'}</div><small class="subtle-note" data-group-team-count>0 students selected. Select the students who will form this team.</small></div><div class="form-actions"><button type="button" class="btn" data-close-modal>Cancel</button><button type="submit" class="btn btn-primary" disabled>Create House team</button></div></form>`;
  }
  function refreshGroupTeamPicker(form){
    const programme=programmeById(Number(form.dataset.programme));if(!programme)return;
    const category=String(form.elements.teamCategory?.value||catForClass(programme.classMin)),house=String(form.elements.teamHouse?.value||'');
    const selected=[...form.querySelectorAll('input[name="studentIds"]:checked')].map(input=>Number(input.value));
    const candidates=db.students.filter(student=>student.active&&isEligible(student,programme)&&catForClass(student.classNo)===category&&student.house===house&&(isAdmin()||canViewStudent(student))).sort((a,b)=>a.classNo-b.classNo||String(a.section).localeCompare(String(b.section))||a.name.localeCompare(b.name));
    const box=form.querySelector('[data-group-team-students]');if(box)box.innerHTML=candidates.map(student=>`<label class="check-tile"><input type="checkbox" name="studentIds" value="${student.id}" ${selected.includes(student.id)?'checked':''}>${esc(student.name)} · ${ordinalClass(student.classNo)} ${esc(student.section)} · ${esc(student.house||'No house')}</label>`).join('')||'<p class="subtle-note">No eligible students are available for this house team.</p>';
    const count=candidates.filter(student=>selected.includes(student.id)).length;const countEl=form.querySelector('[data-group-team-count]');if(countEl)countEl.textContent=`${count} student${count===1?'':'s'} selected. Select the students who will form this team.`;
    const submit=form.querySelector('button[type="submit"]');if(submit)submit.disabled=count===0;
  }
  function syncGroupTeamForm(form){ if(form) refreshGroupTeamPicker(form); }
  function createGroupTeam(programmeId,category,house,studentIds){
    const programme=programmeById(programmeId);if(!programme||programme.category!=='Group Item'||programme.archived||programme.status==='draft')return {ok:false,reason:'This Group Item is unavailable for staff registration.'};
    if(programme.groupMode!=='house')return {ok:false,reason:'This Group Item is configured for house-based teams only.'};
    if(!(db.settings.houseNames||[]).includes(house))return {ok:false,reason:'Choose a configured house.'};
    const ids=[...new Set(studentIds.map(Number).filter(Number.isSafeInteger))];if(!ids.length)return {ok:false,reason:'Select at least one student for the House team.'};
    if((db.groupTeams||[]).some(team=>team.programmeId===programme.id&&team.mode==='house'&&team.category===category&&team.house===house))return {ok:false,reason:'A House team of this category already exists for this programme.'};
    if(recordCount(programme.id)+ids.length>Number(programme.capacity))return {ok:false,reason:'The selected team would exceed the programme capacity.'};
    const students=ids.map(studentById);if(students.some(student=>!student||student.active===false))return {ok:false,reason:'One or more selected students are no longer active.'};
    for(const student of students){
      if(state.role==='teacher'&&!canViewStudent(student))return {ok:false,reason:`${student.name} is outside your assigned classes.`};
      if(!isEligible(student,programme)||catForClass(student.classNo)!==category)return {ok:false,reason:`${student.name} does not match the programme's class/category/gender rules.`};
      if(student.house!==house)return {ok:false,reason:`${student.name} is not assigned to ${house} House.`};
      if(db.registrations.some(reg=>reg.programmeId===programme.id&&reg.studentId===student.id))return {ok:false,reason:`${student.name} is already registered for this Group Item.`};
      const quota=quotaStatus(student,programme,{staffOverride:true});if(!quota.ok)return {ok:false,reason:`${student.name}: ${quota.reason}.`};
    }
    const before={teamLength:db.groupTeams.length,registrationLength:db.registrations.length,nextTeam:db.nextIds.groupTeam,nextRegistration:db.nextIds.registration,audit:db.audit.slice()};
    const team={id:db.nextIds.groupTeam++,programmeId:programme.id,mode:'house',category,house,studentIds:ids,createdAt:localDateString()};
    db.groupTeams.push(team);
    for(const studentId of ids)db.registrations.push({id:db.nextIds.registration++,programmeId:programme.id,studentId,groupTeamId:team.id,createdAt:localDateString(),source:'school-house-team'});
    audit('group_team_created',programme.name,`${groupTeamLabel(team)} · ${ids.length} students · ${state.role}`);
    if(!saveDatabase()){
      db.groupTeams.length=before.teamLength;db.registrations.length=before.registrationLength;db.nextIds.groupTeam=before.nextTeam;db.nextIds.registration=before.nextRegistration;db.audit=before.audit;
      return {ok:false,reason:'The team could not be saved. No team or student registrations were retained.'};
    }
    registrationLookupSource=null;return {ok:true,team};
  }

  function addStudentsToGroupTeam(programme,team,studentIds){
    if(!programme||programme.category!=='Group Item'||!team||team.programmeId!==programme.id||team.mode!=='house')return {ok:false,reason:'House team not found.'};
    const ids=[...new Set(studentIds.map(Number).filter(Number.isSafeInteger))].filter(id=>!team.studentIds.includes(id));
    if(!ids.length)return {ok:false,reason:'No new students selected.'};
    if(recordCount(programme.id)+ids.length>Number(programme.capacity))return {ok:false,reason:'The team would exceed programme capacity.'};
    const students=ids.map(studentById);
    for(const student of students){
      if(!student||!student.active)return {ok:false,reason:'One or more selected students are no longer active.'};
      if(state.role==='teacher'&&!canViewStudent(student))return {ok:false,reason:`${student.name} is outside your assigned classes.`};
      if(!isEligible(student,programme)||catForClass(student.classNo)!==team.category||student.house!==team.house)return {ok:false,reason:`${student.name} does not match the House team eligibility rules.`};
      if(db.registrations.some(reg=>reg.programmeId===programme.id&&reg.studentId===student.id))return {ok:false,reason:`${student.name} is already registered for this Group Item.`};
      const quota=quotaStatus(student,programme,{staffOverride:true});if(!quota.ok)return {ok:false,reason:`${student.name}: ${quota.reason}.`};
    }
    const oldIds=[...team.studentIds],oldLength=db.registrations.length,oldNext=db.nextIds.registration,oldAudit=db.audit.slice();
    team.studentIds.push(...ids);for(const sid of ids)db.registrations.push({id:db.nextIds.registration++,programmeId:programme.id,studentId:sid,groupTeamId:team.id,createdAt:localDateString(),source:'school-house-team'});
    registrationLookupSource=null;audit('group_team_members_added',programme.name,`${groupTeamLabel(team)} · ${ids.length} students`);
    if(!saveDatabase()){team.studentIds=oldIds;db.registrations.length=oldLength;db.nextIds.registration=oldNext;db.audit=oldAudit;registrationLookupSource=null;return {ok:false,reason:'Could not save the House team. No students were added.'};}
    return {ok:true};
  }
  function groupTeamForm(programme,preselectedStudentId=null) {
    const student=preselectedStudentId?studentById(preselectedStudentId):null;
    const category=student?catForClass(student.classNo):catForClass(programme.classMin),house=student?.house||(db.settings.houseNames||[])[0]||'';
    const candidates=db.students.filter(item=>item.active&&isEligible(item,programme)&&catForClass(item.classNo)===category&&item.house===house&&(isAdmin()||canViewStudent(item))).sort((a,b)=>a.classNo-b.classNo||String(a.section).localeCompare(String(b.section))||a.name.localeCompare(b.name));
    const checkboxes=candidates.map(item=>`<label class="check-tile"><input type="checkbox" name="studentIds" value="${item.id}" ${Number(item.id)===Number(preselectedStudentId)?'checked':''}>${esc(item.name)} · ${ordinalClass(item.classNo)} ${esc(item.section)} · ${esc(item.house||'No house')}</label>`).join('');
    return `<form data-form="group-team" data-programme="${programme.id}" data-mode="house"><div class="info-box">House-based Group Item. Every member must belong to the selected house and match the programme's class/category/gender rules.</div><div class="form-grid"><div class="form-field"><label>Student category</label><select class="field" name="teamCategory" required>${selectOptions(categoryNames(),category)}</select></div><div class="form-field"><label>House</label><select class="field" name="teamHouse" required>${selectOptions(db.settings.houseNames||[],house)}</select></div></div><div class="form-field full"><label>Team members</label><div class="checkbox-grid" data-group-team-students>${checkboxes||'<p class="subtle-note">No eligible students are available for this house team.</p>'}</div><small class="subtle-note" data-group-team-count>${preselectedStudentId?'1 student selected.':'0 students selected. Select the students who will form this team.'}</small></div><div class="form-actions"><button type="button" class="btn" data-close-modal>Cancel</button><button type="submit" class="btn btn-primary" ${preselectedStudentId?'':'disabled'}>Create House team</button></div></form>`;
  }
  function programmeRosterRows(programme=programmeById(state.programmeId)) {
    if(!programme||!['admin','teacher'].includes(state.role))return [];
    const f=state.programmeDetailFilters||{};
    const registrations=new Set(db.registrations.filter(reg=>reg.programmeId===programme.id).map(reg=>reg.studentId));
    const ranks=new Map(db.results.filter(result=>result.programmeId===programme.id).map(result=>[result.studentId,result.rank]));
    const selected=db.selections.find(selection=>selection.programmeId===programme.id)?.studentId;
    let rows=db.students.filter(student=>student.active&&(isEligible(student,programme)||registrations.has(student.id))&&(isAdmin()||canViewStudent(student)));
    if(f.q){const q=String(f.q).toLocaleLowerCase();rows=rows.filter(student=>String(student.name||'').toLocaleLowerCase().includes(q)||String(student.admissionNo||'').toLocaleLowerCase().includes(q));}
    if(f.classNo)rows=rows.filter(student=>Number(student.classNo)===Number(f.classNo));
    if(f.section)rows=rows.filter(student=>String(student.section)===String(f.section));
    if(f.category && programme.category==='Group Item')rows=rows.filter(student=>catForClass(student.classNo)===f.category);
    if(f.gender&&programme.gender==='All')rows=rows.filter(student=>student.gender===f.gender);
    if(f.age)rows=rows.filter(student=>matchesAgeFilter(student,f.age));
    if(f.registration==='participating')rows=rows.filter(student=>registrations.has(student.id));
    if(f.registration==='not')rows=rows.filter(student=>!registrations.has(student.id));
    if(f.rank==='none')rows=rows.filter(student=>!ranks.has(student.id));
    if(['1','2','3'].includes(String(f.rank||'')))rows=rows.filter(student=>String(ranks.get(student.id))===String(f.rank));
    return sortStudentRecords(rows,f.sort||'class');
  }


  function renderDashboard() {
    if (state.role==='parent') return renderParentOverview();
    const students = db.students.filter(s=>s.active && canViewStudent(s));
    const programmes = allowedProgrammes();
    const visibleStudentIds=new Set(students.map(student=>Number(student.id)));
    const regs = db.registrations.filter(reg=>visibleStudentIds.has(Number(reg.studentId)));
    const open = programmes.filter(programmeOpen);
    const deadlines = open.filter(p=>p.closeDate).sort((a,b)=>a.closeDate.localeCompare(b.closeDate)).slice(0,4);
    const today=localDateString();
    const events=[];
    for(const event of db.events){
      if(!event.published||String(event.endDate||event.date||'')<today)continue;
      const eventKey=String(event.date||'');let position=0;
      while(position<events.length&&String(events[position].date||'')<=eventKey)position++;
      events.splice(position,0,event);
      if(events.length>4)events.pop();
    }
    return `${`<section class="hero-panel"><div class="hero-copy"><p class="eyebrow">${esc(state.role==='admin'?(db.settings.dashboardEyebrow||'ACTIVITY MANAGER'):'TEACHER WORKSPACE')}</p><h2>${esc(db.settings.dashboardTitle||'Every student has a place to take part.')}</h2><p>${esc(db.settings.dashboardDescription||'Keep programme choices, event schedules and school results organised in one place. Arts and Sports stay separate; student records stay central.')}</p></div>${db.settings.dashboardQuote?`<div class="hero-meta">“${esc(db.settings.dashboardQuote)}”</div>`:''}</section>`}
      <div class="metric-grid">
        <article class="metric-card"><div class="metric-head"><span>Active students</span><span class="metric-icon">${uiIcon('users')}</span></div><div class="metric-value">${students.length}</div><div class="metric-note">${state.role==='admin'?'School directory':'Within assigned sections'}</div></article>
        <article class="metric-card"><div class="metric-head"><span>Programmes</span><span class="metric-icon">${uiIcon('palette')}</span></div><div class="metric-value">${programmes.length}</div><div class="metric-note">Arts, Sports and Group Items</div></article>
        <article class="metric-card"><div class="metric-head"><span>Open for choices</span><span class="metric-icon">${uiIcon('calendar')}</span></div><div class="metric-value">${open.length}</div><div class="metric-note">After global and programme dates</div></article>
        <article class="metric-card"><div class="metric-head"><span>Programme choices</span><span class="metric-icon">${uiIcon('check')}</span></div><div class="metric-value">${regs.length}</div><div class="metric-note">Student programme selections</div></article>
      </div>
      <div class="dashboard-grid">
        <section class="panel"><header class="panel-head"><div><h2>Programme choice deadlines</h2><p>Programmes closing soon</p></div><button class="btn-link" data-action="navigate" data-page="arts">View programmes →</button></header><div class="panel-body"><div class="deadline-list">${deadlines.length?deadlines.map(p=>`<div class="deadline-item"><div><strong>${esc(p.name)} · ${esc(p.category)}</strong><small>${esc(p.area)}${p.gender!=='All'?' · '+esc(p.gender):''}</small></div><span class="deadline-date">Closes ${formatDate(p.closeDate,{day:'2-digit',month:'short'})}</span></div>`).join(''):'<div class="empty-state">No programme choice windows are currently open.</div>'}</div></div></section>
        <section class="panel"><header class="panel-head"><div><h2>Upcoming events</h2><p>Published school calendar</p></div><button class="btn-link" data-action="navigate" data-page="calendar">Open calendar →</button></header><div class="panel-body"><div class="activity-list">${events.map(e=>`<div class="activity-row"><div class="activity-date"><strong>${formatDate(e.date,{day:'numeric'})}</strong><small>${formatDate(e.date,{month:'short'} )}</small></div><div class="activity-copy"><strong>${esc(e.title)}</strong><small>${formatDate(e.date)} · ${esc(e.venue)}</small></div><span class="activity-tag">${esc(e.type)}</span></div>`).join('')||'<div class="empty-state">No upcoming events.</div>'}</div></div></section>
      </div>
      <div class="section-title-row"><div><h2>Activity areas</h2><p>Open a workspace to manage entries and lists.</p></div></div>
      <div class="quick-grid">
        <button class="quick-card" data-action="navigate" data-page="arts"><span class="quick-card-mark">${uiIcon('palette')}</span><strong>Arts programmes</strong><small>Category-led individual and group items</small></button>
        <button class="quick-card" data-action="navigate" data-page="sports"><span class="quick-card-mark">${uiIcon('trophy')}</span><strong>Sports programmes</strong><small>Category and gender-specific events</small></button>
        <button class="quick-card" data-action="navigate" data-page="students"><span class="quick-card-mark">${uiIcon('users')}</span><strong>Student directory</strong><small>Search student records and class placement</small></button>
      </div>`;
  }

  function classRowsMarkup(classList, action, counts, extra='', expandedClass=null, sectionAction='', sectionCounts={}, sectionPairsByClass={}, allowSectionAdd=false) {
    const rows=classList.map(classNo=>{
      const expanded=Number(expandedClass)===Number(classNo);
      const pairs=sectionPairsByClass[classNo]||sectionsForClass(classNo).map(section=>({classNo,section}));
      const detail=expanded&&sectionAction?sectionRowsMarkup(classNo,pairs,sectionAction,sectionCounts,extra,allowSectionAdd):'';
      const total=Number(counts[classNo]||0);
      return `<div class="class-row-block"><button class="class-row ${expanded?'expanded':''}" data-action="${action}" data-class="${classNo}" aria-expanded="${expanded?'true':'false'}" ${extra}><span class="class-row-index">${ordinalClass(classNo)}</span><span class="class-row-name"><strong>Class ${classNo}</strong><small>Open to view sections</small></span><span class="class-row-meta"><strong>${total}</strong><small>Student${total===1?'':'s'}</small></span><span class="class-row-section-count">${pairs.length} section${pairs.length===1?'':'s'}</span><span class="class-row-chevron">${expanded?'−':'+'}</span></button>${detail}</div>`;
    }).join('');
    return `<div class="class-list"><div class="class-list-heading"><span>Class</span><span>Students</span><span>Sections</span><span></span></div>${rows||'<div class="empty-state">No classes are configured.</div>'}</div>`;
  }
  function sectionRowsMarkup(classNo, pairs, action, counts, extra='', allowSectionAdd=false) {
    return `<div class="section-list">${pairs.map(pair=>{const key=`${pair.classNo}|${pair.section}`,total=Number(counts[key]||0);return `<button class="section-row" data-action="${action}" data-class="${pair.classNo}" data-section="${esc(pair.section)}" ${extra}><span class="section-row-index">${ordinalClass(pair.classNo)} ${esc(pair.section)}</span><span class="section-row-name"><strong>${esc(pair.section==='Unsectioned'?'Unsectioned':'Section '+pair.section)}</strong><small>${pair.section==='Unsectioned'?'Records needing section assignment':'Class section'}</small></span><span class="section-row-meta"><strong>${total}</strong><small>Student${total===1?'':'s'}</small></span><span class="class-row-chevron">›</span></button>`;}).join('')||'<div class="empty-state">No sections are configured for this class.</div>'}${allowSectionAdd?`<div class="section-list-tools">${btn('+ Add section','section-add','btn btn-quiet btn-small',`data-class="${classNo}"`)}</div>`:''}</div>`;
  }
  function studentBrowserMarkup(adminMode=false) {
    const browser=adminMode?state.adminStudentBrowser:state.studentBrowser;
    const archived=adminMode&&state.showArchivedStudents;
    const teacherPairs=teacherClassSections();
    const allowedPairs=state.role==='teacher'?[...teacherPairs,...classes.filter(classNo=>teacherCanManageUnsectionedClass(classNo)&&db.students.some(student=>student.active&&student.classNo===classNo&&student.section==='Unsectioned')).map(classNo=>({classNo,section:'Unsectioned'}))]:classes.flatMap(classNo=>sectionsForClass(classNo).map(section=>({classNo,section})));
    const source=db.students.filter(student=>archived?!student.active:student.active).filter(student=>adminMode||canViewStudent(student));
    const registrationCountByStudent=new Map();
    for(const registration of db.registrations)registrationCountByStudent.set(registration.studentId,(registrationCountByStudent.get(registration.studentId)||0)+1);
    const inClass=browser.classNo?source.filter(student=>student.classNo===Number(browser.classNo)):[];
    const inSection=browser.section?inClass.filter(student=>student.section===browser.section):[];
    const title=adminMode?'Student editor':'Student directory';
    const actions=`${adminMode?btn('Import file','student-import','btn btn-secondary'):''}${browser.section?btn('Export this section','student-export','btn btn-quiet'):''}${adminMode?`<input id="student-file" type="file" accept=".csv,.tsv,.txt,.xlsx,.json" hidden>`:''}`;
    const subhead=adminMode?'Manage records by class and section. Open a class row, then a section row, to work with its students.':'Open a class row, then its section row, to view students. Student names stay out of the school-wide overview.';
    const adminFiltersOpen=!!browser.moreOpen;
    const studentFilterToggle=adminMode?`<button type="button" class="btn btn-quiet btn-small filter-more-toggle" data-action="student-browser-filters-toggle" data-admin="1" aria-expanded="${adminFiltersOpen?'true':'false'}">${adminFiltersOpen?'− Less filters':'+ More filters'}</button>`:'';
    const studentFilterExtras=adminMode?`<div class="filter-advanced" ${adminFiltersOpen?'':'hidden'}><label class="filter-field"><span>Category</span><select class="filter-select" id="student-browser-category"><option value="">All categories</option>${selectOptions(categoryNames(),browser.category)}</select></label>${ageFilterMarkup('student-browser-age',browser.section?inSection:source,browser.age)}<label class="filter-field"><span>Sort</span><select class="filter-select" id="student-browser-sort">${selectOptions([{value:'class',label:'Class'},{value:'name',label:'Name'},{value:'name-desc',label:'Name Z–A'},{value:'admission',label:'Admission number'},{value:'age',label:'Age (low to high)'},{value:'age-desc',label:'Age (high to low)'},{value:'category',label:'Category'}],browser.sort||'class')}</select></label></div>`:'';
    let body='';
    if(!browser.section&&browser.q){
      const query=browser.q.toLocaleLowerCase();
      let rows=source.filter(student=>String(student.name||'').toLocaleLowerCase().includes(query)||String(student.admissionNo||'').toLocaleLowerCase().includes(query));if(!adminMode&&browser.gender)rows=rows.filter(student=>student.gender===browser.gender);if(browser.category)rows=rows.filter(student=>catForClass(student.classNo)===browser.category);if(browser.age)rows=rows.filter(student=>matchesAgeFilter(student,browser.age));rows=sortStudentRecords(rows,browser.sort||'class');
      body=`<div class="browser-breadcrumb"><button class="btn btn-quiet btn-small" data-action="student-browse-back" data-admin="${adminMode?'1':'0'}">← All classes</button><strong>Student search results</strong><span>${rows.length} matching record${rows.length===1?'':'s'}</span></div><div class="toolbar"><input class="search-field" id="student-browser-search" placeholder="Search by student name or admission ID" value="${esc(browser.q)}">${adminMode?studentFilterToggle:`<select class="filter-select" id="student-browser-gender"><option value="">All genders</option>${selectOptions(['Boy','Girl','Not specified'],browser.gender)}</select><select class="filter-select" id="student-browser-category"><option value="">All categories</option>${selectOptions(categoryNames(),browser.category)}</select>${ageFilterMarkup('student-browser-age',source,browser.age)}<select class="filter-select" id="student-browser-sort">${selectOptions([{value:'class',label:'Sort: Class'},{value:'name',label:'Name'},{value:'name-desc',label:'Name Z–A'},{value:'admission',label:'Admission number'},{value:'age',label:'Age (low to high)'},{value:'age-desc',label:'Age (high to low)'},{value:'category',label:'Category'}],browser.sort||'class')}</select>`}<span class="year-pill">${rows.length} found</span></div>${studentFilterExtras}<div class="table-panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>Student</th><th>Class / section</th><th>Admission number</th><th>Age</th><th>Gender</th><th>Programme registrations</th><th>Actions</th></tr></thead><tbody>${rows.map(student=>{const registrationCount=registrationCountByStudent.get(student.id)||0;return `<tr><td>${studentCell(student)}</td><td>${ordinalClass(student.classNo)} ${esc(student.section)}</td><td>${esc(student.admissionNo)}</td><td>${studentAgeText(student)}</td><td>${esc(student.gender||'Not specified')}</td><td>${registrationCount?badge('Registered','open'):badge('Not registered','closed')}</td><td><div class="table-actions">${btn('View','student-view','table-action',`data-id="${student.id}"`)}${['admin','teacher'].includes(state.role)&&student.active?btn('Add programme','student-add-programme','table-action',`data-id="${student.id}"`):''}${canEditStudent(student)?btn('Edit','student-edit','table-action',`data-id="${student.id}"`):''}${adminMode&&!archived&&student.active?btn('Move','student-move-one','table-action',`data-id="${student.id}"`):''}${adminMode&&archived?btn('Restore','student-restore','table-action',`data-id="${student.id}"`):canRemoveStudentRecord(student)?btn('Archive','student-archive','table-action danger',`data-id="${student.id}"`):''}</div></td></tr>`;}).join('')||`<tr><td colspan="7"><div class="empty-state">No students match “${esc(browser.q)}”. Check the spelling or admission ID.</div></td></tr>`}</tbody></table></div></div>`;
    } else if(!browser.section){
      const list=classes.filter(c=>allowedPairs.some(x=>x.classNo===c));
      const classCountMap=new Map(),sectionCountMap=new Map();
      for(const student of source){const classNo=Number(student.classNo),sectionKey=`${classNo}|${student.section}`;classCountMap.set(classNo,(classCountMap.get(classNo)||0)+1);sectionCountMap.set(sectionKey,(sectionCountMap.get(sectionKey)||0)+1);}
      const counts=Object.fromEntries(list.map(c=>[c,classCountMap.get(Number(c))||0]));
      const sectionCounts=Object.fromEntries(allowedPairs.map(pair=>[`${pair.classNo}|${pair.section}`,sectionCountMap.get(`${pair.classNo}|${pair.section}`)||0]));
      const pairsByClass=Object.fromEntries(list.map(classNo=>[classNo,allowedPairs.filter(x=>x.classNo===classNo)]));
      body=classRowsMarkup(list,'student-browse-class',counts,`data-admin="${adminMode?'1':'0'}"`,browser.classNo,'student-browse-section',sectionCounts,pairsByClass,adminMode||state.role==='teacher'&&teacherCanAddSections(userByRole('teacher')?.id,browser.classNo));
    } else {
      const pair={classNo:Number(browser.classNo),section:String(browser.section)};
      let rows=inSection.filter(student=>!browser.q||student.name.toLowerCase().includes(browser.q.toLowerCase())||student.admissionNo.toLowerCase().includes(browser.q.toLowerCase()));if(!adminMode&&browser.gender)rows=rows.filter(student=>student.gender===browser.gender);if(browser.category)rows=rows.filter(student=>catForClass(student.classNo)===browser.category);if(browser.age)rows=rows.filter(student=>matchesAgeFilter(student,browser.age));rows=sortStudentRecords(rows,browser.sort||'name');
      const assignableUnsectioned=pair.section==='Unsectioned'&&(isAdmin()||teacherCanManageUnsectionedClass(pair.classNo));
      const selectableRows=assignableUnsectioned;
      body=`<div class="browser-breadcrumb"><button class="btn btn-quiet btn-small" data-action="student-browse-back" data-admin="${adminMode?'1':'0'}">← Class and sections</button><strong>${ordinalClass(pair.classNo)} ${esc(pair.section)}</strong><span>${inSection.length} students</span></div><div class="toolbar"><input class="search-field" id="student-browser-search" placeholder="Search within ${ordinalClass(pair.classNo)} ${esc(pair.section)}" value="${esc(browser.q||'')}">${adminMode?studentFilterToggle:`<select class="filter-select" id="student-browser-gender"><option value="">All genders</option>${selectOptions(['Boy','Girl','Not specified'],browser.gender)}</select><select class="filter-select" id="student-browser-category"><option value="">All categories</option>${selectOptions(categoryNames(),browser.category)}</select>${ageFilterMarkup('student-browser-age',inSection,browser.age)}<select class="filter-select" id="student-browser-sort">${selectOptions([{value:'name',label:'Sort: Name'},{value:'admission',label:'Admission number'},{value:'age',label:'Age (low to high)'},{value:'age-desc',label:'Age (high to low)'},{value:'category',label:'Category'}],browser.sort||'name')}</select>`}<span class="year-pill">${rows.length} shown</span>${canAddStudentToSection(pair.classNo,pair.section)?btn('Add student','student-add','btn btn-primary',`data-class="${pair.classNo}" data-section="${esc(pair.section)}"`):''}${adminMode&&pair.section!=='Unsectioned'?btn('Move selected','student-move-selected','btn btn-secondary'):''}${selectableRows?btn('Assign selected to section','student-assign-unsectioned','btn btn-secondary'):''}</div>${studentFilterExtras}<div class="table-panel"><div class="table-wrap"><table class="data-table"><thead><tr>${adminMode||selectableRows?'<th class="select-col">Select</th>':''}<th>Student</th><th>Admission number</th><th>Age</th><th>Gender</th><th>Programme registrations</th><th>Actions</th></tr></thead><tbody>${rows.map(student=>{const participating=(registrationCountByStudent.get(student.id)||0)>0;return `<tr>${adminMode||selectableRows?`<td><input type="checkbox" class="student-row-select" data-select-student value="${student.id}" aria-label="Select ${esc(student.name)}"></td>`:''}<td>${studentCell(student)}</td><td>${esc(student.admissionNo)}</td><td>${studentAgeText(student)}</td><td>${esc(student.gender||'Not specified')}</td><td>${participating?badge('Registered','open'):badge('Not registered','closed')}</td><td><div class="table-actions">${btn('View','student-view','table-action',`data-id="${student.id}"`)}${['admin','teacher'].includes(state.role)&&student.active?btn('Add programme','student-add-programme','table-action',`data-id="${student.id}"`):''}${canEditStudent(student)?btn('Edit','student-edit','table-action',`data-id="${student.id}"`):''}${adminMode&&!archived&&student.active?btn('Move','student-move-one','table-action',`data-id="${student.id}"`):''}${adminMode&&archived?btn('Restore','student-restore','table-action',`data-id="${student.id}"`):canRemoveStudentRecord(student)?btn('Archive','student-archive','table-action danger',`data-id="${student.id}"`):''}</div></td></tr>`;}).join('')||`<tr><td colspan="${adminMode||selectableRows?7:6}"><div class="empty-state">No students in this section match the search.</div></td></tr>`}</tbody></table></div></div>`;
    }
    return `${heading(title,subhead,'STUDENT RECORDS',actions)}${adminMode?`<div class="toolbar"><button class="btn ${archived?'btn-secondary':'btn-quiet'} btn-small" data-action="student-show-archived">${archived?'Show active records':'View archived records'}</button><span class="year-pill">${source.length} ${archived?'archived':'active'} records</span></div>`:''}${body}`;
  }
  function renderStudents() { return studentBrowserMarkup(false); }

  function parentParticipationCounts(student) {
    const counts={arts:{onstage:0,offstage:0},sports:{track:0,field:0},groups:0};
    if(!student)return counts;
    const selected=registrationsFor(student.id)
      .map(reg=>programmeById(reg.programmeId))
      .filter(programme=>programme&&!programme.archived);
    for(const programme of selected){
      if(programme.category==='Group Item'){counts.groups++;continue;}
      const type=inferProgrammeType(programme.area,programme.category,programme.name,programme.description,programme.itemType);
      if(programme.area==='Arts'&&Object.prototype.hasOwnProperty.call(counts.arts,type))counts.arts[type]++;
      if(programme.area==='Sports'&&Object.prototype.hasOwnProperty.call(counts.sports,type))counts.sports[type]++;
    }
    return counts;
  }
  function parentParticipationPanel(student, compact=false, scope='all') {
    const counts=parentParticipationCounts(student);
    const showArts=scope==='all'||scope==='arts';
    const showSports=scope==='all'||scope==='sports';
    const showGroups=scope==='all'||scope==='groups';
    const panelTitle=scope==='arts'?'Arts choice allowance':scope==='sports'?'Sports choice allowance':'Choice allowance';
    const maxArtsOnstage=Number(db.settings.maxArtsOnstage??3),maxArtsOffstage=Number(db.settings.maxArtsOffstage??3);
    const maxSports=Number(db.settings.maxSports??3),maxSportsTrack=Number(db.settings.maxSportsTrack??2),maxSportsField=Number(db.settings.maxSportsField??2);
    const artsUsed=counts.arts.onstage+counts.arts.offstage,artsMax=maxArtsOnstage+maxArtsOffstage;
    const sportsUsed=counts.sports.track+counts.sports.field;
    const fullSportsAllocations=[];
    for(let track=Math.min(maxSportsTrack,maxSports);track>=0;track--){const field=maxSports-track;if(field>=0&&field<=maxSportsField)fullSportsAllocations.push(`${track} Track + ${field} Field`);}
    const sportsAllocationNote=fullSportsAllocations.length?`A full set of ${maxSports} can be: ${fullSportsAllocations.join(' or ')}.`:`The current Track and Field limits may prevent filling all ${maxSports} Sports choices.`;
    const progress=(used,max)=>max>0?Math.max(0,Math.min(100,used/max*100)):0;
    const meter=(label,used,max)=>`<div class="parent-limit-meter"><div class="parent-limit-meter-label"><span>${label}</span><strong>${used} / ${max}</strong></div><div class="parent-limit-track" role="progressbar" aria-label="${label} choices used" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${Math.min(used,max)}"><span style="width:${progress(used,max)}%"></span></div></div>`;
    return `<section class="parent-participation-panel${compact?' compact':''}${scope!=='all'?` scope-${scope}`:''}" aria-label="Participation limits">
      <header class="parent-participation-heading"><div><span class="eyebrow">PARTICIPATION LIMITS</span><h2>${panelTitle}</h2><p>${scope==='arts'?'Your child’s Arts choices used this school year.':scope==='sports'?'Your child’s Sports choices used this school year.':`See how many individual programme choices ${compact?'are used':'your child can make'} this school year.`}</p></div></header>
      <div class="parent-participation-grid">
        ${showArts?`<article class="parent-limit-card arts">
          <div class="parent-limit-card-heading"><div><span>ARTS</span><strong>${artsUsed} <small>/ ${artsMax}</small></strong></div><span class="parent-limit-remaining">${Math.max(0,artsMax-artsUsed)} left</span></div>
          ${meter('Onstage',counts.arts.onstage,maxArtsOnstage)}
          ${meter('Offstage',counts.arts.offstage,maxArtsOffstage)}
        </article>`:''}
        ${showSports?`<article class="parent-limit-card sports">
          <div class="parent-limit-card-heading"><div><span>SPORTS</span><strong>${sportsUsed} <small>/ ${maxSports}</small></strong></div><span class="parent-limit-remaining">${Math.max(0,maxSports-sportsUsed)} left</span></div>
          ${meter('Track',counts.sports.track,maxSportsTrack)}
          ${meter('Field',counts.sports.field,maxSportsField)}
          <p class="parent-sports-allocation">Choose up to ${maxSports} Sports items: up to ${maxSportsTrack} Track and ${maxSportsField} Field. ${esc(sportsAllocationNote)}</p>
        </article>`:''}
      </div>
      ${showGroups?`<p class="parent-group-limit-note">Group Items are added by school staff and follow a separate limit (${counts.groups} / ${Number(db.settings.maxGroup??2)}).</p>`:''}
    </section>`;
  }

  function parentProgrammeCard(p, student) {
    const selected=registrationsFor(student.id).some(reg=>Number(reg.programmeId)===Number(p.id));
    const quota=quotaStatus(student,p),open=programmeOpen(p);
    const type=p.category==='Group Item'?'Group Item':programmeTypeLabel(inferProgrammeType(p.area,p.category,p.name,p.description,p.itemType));
    const action=selected?badge('Registered','open'):
      p.category==='Group Item'?'<span class="parent-programme-note">Ask class teacher to add</span>':
      btn('Register child','portal-select','btn btn-primary btn-small',`data-id="${Number(p.id)}" ${!quota.ok||!open?'disabled':''}`);
    const note=selected?'Already registered':!open?'Registration closed':!quota.ok?quota.reason:p.closeDate?`Closes ${formatDate(p.closeDate,{day:'2-digit',month:'short'})}`:'Registration open';
    return `<article class="parent-programme-card"><div class="parent-programme-copy"><div class="parent-programme-title"><h3>${esc(p.name)}</h3>${open?badge('Open','open'):badge('Closed','closed')}</div><div class="programme-tags">${catBadge(p.category)}<span class="gender-pill">${esc(type)}</span>${p.gender!=='All'?`<span class="gender-pill">${esc(p.gender)}</span>`:''}</div><p>${esc(p.description||'Programme details have not been added yet.')}</p><small class="parent-programme-meta">${esc(note)}</small></div><div class="parent-programme-action">${action}</div></article>`;
  }

  function renderProgrammeList(kind) {
    const label=kind==='arts'?'Arts':kind==='sports'?'Sports':'Group Items';
    const f=state.programmeFilters[kind]||{};
    const personalView=state.role==='parent';
    // Every category/gender variant is a separate programme record. A repeated
    // title (for example Extempore) is intentionally not merged across cats.
    const eligibleRows=allowedProgrammes().filter(p=>kind==='groups'?p.category==='Group Item':p.area===label && p.category!=='Group Item');
    let rows=eligibleRows.slice();
    if(f.q) rows=rows.filter(p=>p.name.toLowerCase().includes(f.q.toLowerCase())||p.code.toLowerCase().includes(f.q.toLowerCase()));
    if(f.category) rows=rows.filter(p=>p.category===f.category);
    if(f.type) rows=rows.filter(p=>inferProgrammeType(p.area,p.category,p.name,p.description,p.itemType)===f.type);
    if(f.gender) rows=rows.filter(p=>p.gender===f.gender);
    if(f.status==='open') rows=rows.filter(programmeOpen); if(f.status==='closed') rows=rows.filter(p=>!programmeOpen(p));
    rows=sortProgrammeRecords(rows,f.sort||'name');
    const create='';
    const categories=[...new Set(eligibleRows.map(p=>p.category))];
    const typeGroups=[...new Set(eligibleRows.map(p=>inferProgrammeType(p.area,p.category,p.name,p.description,p.itemType)))].filter(Boolean);
    const genderGroups=[...new Set(eligibleRows.map(p=>p.gender))];
    const moreOpen=!!f.moreOpen;
    const filterSummary=[f.type?`Event type: ${programmeTypeLabel(f.type)}`:'',f.gender?`Gender: ${f.gender}`:'',f.status?`Status: ${f.status}`:''].filter(Boolean).join(' · ');
    const advanced=kind==='groups'?'':`${kind==='sports'?`<label class="filter-field"><span>Gender</span><select class="filter-select" id="programme-gender" data-kind="${kind}"><option value="">All gender groups</option>${selectOptions(genderGroups,f.gender)}</select></label>`:''}<label class="filter-field"><span>Choice status</span><select class="filter-select" id="programme-status" data-kind="${kind}"><option value="">All statuses</option><option value="open" ${f.status==='open'?'selected':''}>Open</option><option value="closed" ${f.status==='closed'?'selected':''}>Closed</option></select></label>`;
    const parentStudent=personalView?currentLinkedStudent():null;
    const participationScope=kind==='arts'||kind==='sports'?kind:'all';
    const parentIntro=personalView?`<div class="parent-programme-intro"><span>Viewing ${esc(parentStudent?.name||'your child')}</span><p>Browse eligible items and register your child directly from this page.</p></div>${parentParticipationPanel(parentStudent,true,participationScope)}`:'';
    const feature=personalView?'':`<div class="programme-feature-row programme-feature-row-compact"><div class="programme-feature-image ${kind==='arts'?'arts':kind==='sports'?'sports':'group'}">${programmeImageMarkup(kind,true)}</div><div class="programme-feature-copy"><p class="eyebrow">${kind==='groups'?'TEAM & GROUP ENTRIES':'PROGRAMME CATALOGUE'}</p><h2>${kind==='arts'?'Arts programmes':kind==='sports'?'Sports programmes':'Group Items'}</h2><p>${kind==='arts'?'Choose the exact category and item. A language-specific item is entered as part of its programme name.':kind==='sports'?'Boys’ and girls’ events, and each category, remain separate programme records.':'Group Item entries are listed independently from individual Arts and Sports choices.'}</p></div></div>`;
    const cards=personalView?rows.map(p=>parentProgrammeCard(p,currentLinkedStudent())).join(''):rows.map(p=>programmeCard(p)).join('');
    return `${heading(`${label} ${kind==='groups'?'':'programmes'}`.trim(),kind==='arts'?'Each Arts item is listed separately for its category. Similar names in different categories are separate entries.':kind==='sports'?(personalView?'Only the Sports programmes eligible for this student are shown.':'Each Sports event is a separate category and, where applicable, gender entry.'):'Group Items use their own eligibility and choice limits.',label.toUpperCase(),create)}
      ${parentIntro}${feature}
      <section class="programme-filter-panel" aria-label="Programme filters">
        <div class="toolbar programme-primary-filters ${kind==='groups'?'no-category':''}"><input class="search-field" id="programme-search" data-kind="${kind}" placeholder="Search programme name or code" value="${esc(f.q||'')}">${kind!=='groups'?`<label class="filter-field"><span>Category</span><select class="filter-select" id="programme-category" data-kind="${kind}"><option value="">All categories</option>${selectOptions(categories,f.category)}</select></label><label class="filter-field"><span>Event type</span><select class="filter-select" id="programme-type" data-kind="${kind}"><option value="">All event types</option>${typeGroups.map(type=>`<option value="${esc(type)}" ${type===f.type?'selected':''}>${esc(programmeTypeLabel(type))}</option>`).join('')}</select></label>`:''}<label class="filter-field"><span>Sort</span><select class="filter-select" id="programme-sort" data-kind="${kind}">${selectOptions([{value:'name',label:'Name (A–Z)'},{value:'deadline',label:'Closing date'},{value:'entries',label:'Most entries'}],f.sort||'name')}</select></label><button type="button" class="btn btn-quiet btn-small filter-more-toggle" data-action="programme-filters-toggle" data-kind="${kind}" aria-expanded="${moreOpen?'true':'false'}">${moreOpen?'− Less filters':'+ More filters'}</button><span class="filter-result-count">${rows.length} shown</span></div>
        <div class="filter-advanced" ${moreOpen?'':'hidden'}>${advanced||'<span class="subtle-note">There are no additional filters for Group Items.</span>'}<button type="button" class="btn btn-quiet btn-small" data-action="programme-filter-clear" data-kind="${kind}">Clear filters</button>${filterSummary?`<span class="filter-active-summary">${esc(filterSummary)}</span>`:''}</div>
      </section>
      <div class="programme-grid ${personalView?'parent-compact-programme-grid':''}">${cards||`<div class="panel empty-state"><strong>No ${label} programmes are currently listed</strong><p>${personalView?'The school has not listed an available item in this section for the selected child yet. Please check again later.':'No programme records match the selected category or search.'}</p></div>`}</div>`;
  }
  function programmeImageSource(kind, feature=false) {
    if (kind === 'arts') return feature ? 'assets/arts-performance-new.webp' : 'assets/arts-feature-new.webp';
    if (kind === 'sports') return feature ? 'assets/sports-action-new.webp' : 'assets/sports-feature-new.webp';
    return feature ? 'assets/arts-performance-new.webp' : 'assets/arts-feature-new.webp';
  }
  function programmeImageMarkup(kind, feature=false, area='') {
    const isGroup = kind === 'group' || kind === 'groups';
    if (isGroup && !area && feature) {
      return `<div class="group-image-pair"><img src="assets/arts-performance-new.webp" alt="Arts group performance" loading="lazy" decoding="async"><img src="assets/sports-action-new.webp" alt="Sports team activity" loading="lazy" decoding="async"></div>`;
    }
    const imageKind = isGroup ? (String(area||'Arts').toLowerCase()==='sports'?'sports':'arts') : kind;
    const src = programmeImageSource(imageKind, feature);
    const alt = isGroup ? (imageKind==='arts'?'Arts group activity':'Sports group activity') : (imageKind==='arts'?'Arts activities':'School sports activities');
    return `<img src="${src}" alt="${alt}" loading="lazy" decoding="async">`;
  }
  function programmeCard(p) {
    const n=recordCount(p.id), status=programmeOpen(p)?badge('Open','open'):badge(p.status==='draft'?'Draft':'Closed',p.status==='draft'?'draft':'closed');
    const imageKind=p.category==='Group Item'?'group':p.area.toLowerCase();
    return `<article class="programme-card"><div class="programme-image ${imageKind}">${programmeImageMarkup(imageKind,false,p.area)}</div><div class="programme-card-body"><div class="programme-card-title"><h3>${esc(p.name)}</h3>${status}</div><div class="programme-tags">${catBadge(p.category)}${programmeTypeBadge(inferProgrammeType(p.area,p.category,p.name,p.description,p.itemType))}${p.gender!=='All'?`<span class="gender-pill">${esc(p.gender)}</span>`:''}<span class="gender-pill">${esc(p.area)}</span></div><p>${esc(p.description||'Programme details have not been added yet.')}</p><div class="programme-card-footer"><small>${n} / ${p.capacity} entries · Closes ${formatDate(p.closeDate,{day:'2-digit',month:'short'})}</small>${btn('Open programme →','programme-open','text-link','data-id="'+p.id+'"')}</div></div></article>`;
  }

  function renderProgrammeDetail() {
    const p=programmeById(state.programmeId);
    if(!p)return `<div class="empty-state"><strong>Programme not found</strong><p>Return to the programme list and open a valid item.</p>${btn('Back to programmes','navigate','btn','data-page="arts"')}</div>`;
    if((p.archived||p.status==='draft')&&!isAdmin())return `<div class="empty-state"><strong>Programme unavailable</strong><p>This programme is not published for staff registration management.</p></div>`;
    if(!['admin','teacher'].includes(state.role))return `<div class="empty-state"><strong>Programme workspace unavailable</strong><p>This area is restricted to staff.</p></div>`;
    const f=state.programmeDetailFilters||{registration:'participating',sort:'class'};
    const visibleToStaff=student=>isAdmin()||canViewStudent(student);
    const visibleStudents=db.students.filter(student=>student.active&&visibleToStaff(student));
    const visibleStudentIds=new Set(visibleStudents.map(student=>student.id));
    const allEligible=visibleStudents.filter(student=>isEligible(student,p));
    const participatingIds=new Set(db.registrations.filter(reg=>reg.programmeId===p.id&&visibleStudentIds.has(reg.studentId)).map(reg=>reg.studentId));
    const ranked=new Map(db.results.filter(result=>result.programmeId===p.id&&visibleStudentIds.has(result.studentId)).map(result=>[result.studentId,result.rank]));
    const selectedCandidate=db.selections.find(selection=>selection.programmeId===p.id)?.studentId;
    const selected=visibleStudentIds.has(selectedCandidate)?selectedCandidate:null;
    const rosterStudents=visibleStudents.filter(student=>isEligible(student,p)||participatingIds.has(student.id));
    const rows=programmeRosterRows(p);
    const registered=participatingIds.size;
    const classOptions=[...new Set(rosterStudents.map(student=>Number(student.classNo)))].sort((a,b)=>a-b).map(value=>({value,label:ordinalClass(value)}));
    const sectionOptions=[...new Set(rosterStudents.map(student=>String(student.section)))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
    const groupTeams=p.category==='Group Item'?groupTeamRows(p.id):[];
    const actions=(isAdmin()?btn('Edit programme','programme-edit','btn btn-secondary',`data-id="${p.id}"`):'')+(p.category==='Group Item'?btn('Create team','group-team-add','btn btn-primary',`data-id="${p.id}"`):'')+btn('Print roster','print-roster','btn btn-quiet')+btn('Export CSV','roster-export','btn btn-quiet')+btn('Export Excel','roster-export-xlsx','btn btn-primary');
    const studentDetails=student=>`<div class="student-cell programme-roster-student"><span class="student-dot">${esc(initials(student.name))}</span><span class="student-copy"><strong>${esc(student.name)}</strong><small>${esc(student.admissionNo)}</small><small class="roster-student-meta">${ordinalClass(student.classNo)} · Section ${esc(student.section)} · ${esc(student.gender||'Not specified')} · ${esc(catForClass(student.classNo))}</small></span></div>`;
    const tableRows=rows.map(student=>{
      const participating=participatingIds.has(student.id),rank=ranked.get(student.id);
      return `<tr><td>${studentDetails(student)}</td><td>${ordinalClass(student.classNo)}</td><td>${esc(student.section)}</td><td>${catBadge(catForClass(student.classNo))}</td><td>${esc(student.gender||'Not specified')}</td><td>${studentAgeText(student)}</td><td>${participating?badge('Registered','open'):badge('Not registered','closed')}</td><td>${rank?`${rank}${rank===1?'st':rank===2?'nd':'rd'}`:'—'}</td><td>${selected===student.id?badge('Selected','open'):'—'}</td><td><div class="table-actions">${participating?btn('Remove','registration-remove','table-action danger',`data-id="${student.id}" data-programme="${p.id}"`):p.category==='Group Item'?'<span class="subtle-note">Add through team</span>':btn('Add','registration-add','table-action',`data-id="${student.id}" data-programme="${p.id}"`)}</div></td></tr>`;
    }).join('');
    const moreOpen=!!f.moreOpen;
    const sortOptions=[{value:'class',label:'Class'},{value:'class-desc',label:'Class (high to low)'},{value:'name',label:'Name (A–Z)'},{value:'name-desc',label:'Name (Z–A)'},{value:'admission',label:'Admission number'},{value:'section',label:'Section'},{value:'age',label:'Age (low to high)'},{value:'age-desc',label:'Age (high to low)'},...(p.category==='Group Item'?[{value:'category',label:'Student category'}]:[])];
    const extraCategory=p.category==='Group Item'?`<label class="filter-field"><span>Student category</span><select class="filter-select" id="detail-category"><option value="">All student categories</option>${selectOptions(categoryNames(),f.category)}</select></label>`:'';
    const extraGender='';
    return `${heading('Programme roster',`${p.area} · ${p.category}${p.gender!=='All'?' · '+p.gender:''} · Student age is calculated from DOB and can be filtered for reports.`,'PROGRAMME WORKSPACE',actions)}
      <section class="detail-hero programme-roster-hero"><div><p class="eyebrow">${esc(p.code)} · ${esc(p.area.toUpperCase())}</p><h2>${esc(p.name)}</h2><p>${esc(p.description||'No description added.')}</p></div><div class="detail-stat"><strong>${registered} / ${p.capacity}</strong><small>Registered students</small><div class="roster-capacity-track"><span style="width:${Math.min(100,p.capacity?registered/p.capacity*100:0)}%"></span></div>${registered>=p.capacity?badge('Full','closed'):badge(`${Math.max(0,p.capacity-registered)} places left`,'open')}</div></section>
      <div class="roster-summary-grid"><article><strong>${allEligible.length}</strong><span>Eligible students</span></article><article><strong>${registered}</strong><span>Registered</span></article><article><strong>${allEligible.filter(student=>!participatingIds.has(student.id)).length}</strong><span>Eligible · not registered</span></article><article><strong>${ranked.size}</strong><span>Rank records</span></article></div>
      ${p.category==='Group Item'?`<section class="settings-card group-team-list"><div class="section-title-row"><div><h3>House-based teams</h3><p>Each school team represents one house and one student category. Students are selected individually and every member must satisfy the programme's class/category/gender rules.</p></div></div>${groupTeams.length?groupTeams.map(team=>`<div class="candidate-row"><span><strong>${esc(groupTeamLabel(team))}</strong><small>${team.studentIds.length} students · ${team.studentIds.map(id=>esc(studentById(id)?.name||'Missing student')).join(', ')}</small></span></div>`).join(''):'<p class="subtle-note">No teams have been created for this Group Item yet.</p>'}</section>`:''}
      <section class="programme-filter-panel roster-filter-panel" aria-label="Roster filters"><div class="toolbar programme-primary-filters"><input class="search-field" id="detail-q" placeholder="Search student name or admission number" value="${esc(f.q||'')}"><button type="button" class="btn btn-quiet btn-small filter-more-toggle" data-action="detail-filters-toggle" aria-expanded="${moreOpen?'true':'false'}">${moreOpen?'− Less filters':'+ More filters'}</button><span class="filter-result-count">${rows.length} shown</span></div>
      <div class="filter-advanced" ${moreOpen?'':'hidden'}><label class="filter-field"><span>Class</span><select class="filter-select" id="detail-class"><option value="">All classes</option>${selectOptions(classOptions,f.classNo)}</select></label><label class="filter-field"><span>Sort</span><select class="filter-select" id="detail-sort">${selectOptions(sortOptions.map(option=>({value:option.value,label:option.value===(''+(f.sort||'class'))?`Sort: ${option.label}`:option.label})),f.sort||'class')}</select></label><label class="filter-field"><span>Section</span><select class="filter-select" id="detail-section"><option value="">All sections</option>${selectOptions(sectionOptions,f.section)}</select></label>${extraCategory}${extraGender}${ageFilterMarkup('detail-age',rosterStudents,f.age)}<label class="filter-field"><span>Registration</span><select class="filter-select" id="detail-registration"><option value="">Eligible + existing entries</option><option value="participating" ${f.registration==='participating'?'selected':''}>Registered only</option><option value="not" ${f.registration==='not'?'selected':''}>Not registered</option></select></label><label class="filter-field"><span>Rank</span><select class="filter-select" id="detail-rank"><option value="">All ranks</option><option value="1" ${f.rank==='1'?'selected':''}>1st</option><option value="2" ${f.rank==='2'?'selected':''}>2nd</option><option value="3" ${f.rank==='3'?'selected':''}>3rd</option><option value="none" ${f.rank==='none'?'selected':''}>No rank</option></select></label></div></section>
      <div class="table-panel programme-roster-table-panel roster-print-region"><div class="print-only print-document-heading"><h1>${esc(db.settings.schoolName)}</h1><h2>Report</h2></div><div class="table-wrap"><table class="data-table programme-roster-table"><thead><tr><th>Student</th><th>Class</th><th>Section</th><th>Category</th><th>Gender</th><th>Age</th><th>Registration</th><th>Rank</th><th>Sahodaya</th><th class="no-print">Action</th></tr></thead><tbody>${tableRows||'<tr><td colspan="10"><div class="empty-state">No students match these filters. Change the filters or add eligible students to this programme.</div></td></tr>'}</tbody></table></div><div class="table-footer"><span>${rows.length} students shown · ${registered} registered in total</span><span>Staff can add or remove entries. Programme capacity, eligibility, and each student's choice limits remain enforced.</span></div></div>`;
  }
  function privateViewStudent() {
    if (state.role !== 'parent') return undefined;
    const student = currentLinkedStudent();
    return student && student.active ? student : null;
  }
  function renderResults() {
    if(state.role==='parent'){
      const children=parentStudents();
      if(!children.length)return `${heading('My child’s results','Published competition results for the student linked to this parent account.','RESULTS OFFICE')}<div class="panel empty-state"><strong>No active linked child</strong><p>Ask the school office to check the parent account link.</p></div>`;
      if(!db.settings.publishResults)return `${heading('My child’s results','Published competition results for your linked child or children.','RESULTS OFFICE')}<div class="panel empty-state"><strong>Results have not been published</strong><p>The school will show your child’s results here after final results are published.</p></div>`;
      const childIds=new Set(children.map(student=>Number(student.id)));
      const rows=db.results
        .filter(result=>childIds.has(Number(result.studentId))&&[1,2,3].includes(Number(result.rank)))
        .map(result=>({result,student:studentById(result.studentId),programme:programmeById(result.programmeId)}))
        .filter(item=>item.student&&item.programme&&!item.programme.archived)
        .sort((a,b)=>a.programme.name.localeCompare(b.programme.name)||a.student.name.localeCompare(b.student.name));
      const ordinalRank=rank=>Number(rank)===1?'1st place':Number(rank)===2?'2nd place':'3rd place';
      return `${heading('My child’s results','Published competition results for your linked child or children. Only your linked student records are shown.','RESULTS OFFICE',btn('Print results','print-results','btn btn-secondary'))}
        <div class="results-summary-grid"><article><span>Published results</span><strong>${rows.length}</strong></article><article><span>Linked children</span><strong>${children.length}</strong></article><article><span>Academic year</span><strong>${esc(db.settings.academicYear)}</strong></article></div>
        <section class="results-print-region" data-print-region="results"><div class="print-only print-document-heading"><h1>${esc(db.settings.schoolName)}</h1><h2>My child’s results</h2></div><div class="table-panel results-table-panel"><div class="table-wrap"><table class="data-table parent-results-table"><thead><tr>${children.length>1?'<th>Child</th>':''}<th>Programme</th><th>Area</th><th>Category</th><th>Result</th></tr></thead><tbody>${rows.map(({result,student,programme})=>`<tr>${children.length>1?`<td><strong>${esc(student.name)}</strong><small class="result-code">${esc(student.admissionNo||'')}</small></td>`:''}<td><strong>${esc(programme.name)}</strong><small class="result-code">${esc(programme.code||'')}</small></td><td>${esc(programme.area)}</td><td>${catBadge(programme.category)}</td><td><strong>${ordinalRank(result.rank)}</strong></td></tr>`).join('')||`<tr><td colspan="${children.length>1?5:4}"><div class="empty-state"><strong>No published results for your linked child yet</strong><p>When a linked child receives a published school rank, it will appear here.</p></div></td></tr>`}</tbody></table></div><div class="table-footer"><span>${rows.length} published result${rows.length===1?'':'s'}</span><span>Only your linked child records are displayed.</span></div></div></section>`;
    }
    const f=state.resultsFilters||{sort:'name'};
    const scopedResults=state.role==='teacher'?db.results.filter(result=>teacherCanAccessStudent(studentById(result.studentId))):db.results;
    const scopedSelections=state.role==='teacher'?db.selections.filter(selection=>teacherCanAccessStudent(studentById(selection.studentId))):db.selections;
    let programmes=db.programmes.filter(programme=>!programme.archived);
    if(f.q){const q=String(f.q).toLocaleLowerCase();programmes=programmes.filter(programme=>`${programme.name} ${programme.code}`.toLocaleLowerCase().includes(q));}
    if(f.area)programmes=programmes.filter(programme=>programme.area===f.area);
    if(f.category)programmes=programmes.filter(programme=>programme.category===f.category);
    if(f.classNo)programmes=programmes.filter(programme=>{const ids=[...scopedResults.filter(result=>result.programmeId===programme.id).map(result=>result.studentId),...scopedSelections.filter(item=>item.programmeId===programme.id).map(item=>item.studentId)];return ids.some(id=>Number(studentById(id)?.classNo)===Number(f.classNo));});
    if(f.status==='with-results')programmes=programmes.filter(programme=>scopedResults.some(result=>result.programmeId===programme.id)||scopedSelections.some(selection=>selection.programmeId===programme.id));
    if(f.status==='without-results')programmes=programmes.filter(programme=>!scopedResults.some(result=>result.programmeId===programme.id)&&!scopedSelections.some(selection=>selection.programmeId===programme.id));
    programmes=sortProgrammeRecords(programmes,f.sort||'name');
    if(['class','class-desc'].includes(f.sort)){programmes.sort((a,b)=>{const classOf=programme=>{const winner=scopedResults.find(result=>result.programmeId===programme.id&&Number(result.rank)===1),student=winner?studentById(winner.studentId):null;return Number(student?.classNo||99);};const diff=classOf(a)-classOf(b);return (f.sort==='class-desc'?-diff:diff)||a.name.localeCompare(b.name);});}
    const winnerIndex=new Map();for(const result of scopedResults){if(!winnerIndex.has(result.programmeId))winnerIndex.set(result.programmeId,new Map());winnerIndex.get(result.programmeId).set(Number(result.rank),result);}
    const selectionIndex=new Map(scopedSelections.map(item=>[item.programmeId,item]));
    const winnerFor=(programme,rank)=>winnerIndex.get(programme.id)?.get(rank);
    const winnerCell=(programme,rank)=>{
      const result=winnerFor(programme,rank),winner=result?studentById(result.studentId):null;
      if(!winner||(state.role==='teacher'&&!teacherCanAccessStudent(winner)))return '<span class="result-empty">—</span>';
      return `<div class="result-person"><strong>${esc(winner.name)}</strong><small>${ordinalClass(winner.classNo)} · ${esc(winner.section)} · ${esc(winner.gender||'Not specified')}</small></div>`;
    };
    const representativeCell=programme=>{
      const selection=selectionIndex.get(programme.id),student=selection?studentById(selection.studentId):null;
      if(!student||(state.role==='teacher'&&!teacherCanAccessStudent(student)))return '<span class="result-empty">—</span>';
      return `<div class="result-person"><strong>${esc(student.name)}</strong><small>${ordinalClass(student.classNo)} · ${esc(student.section)} · ${esc(student.gender||'Not specified')}</small></div>`;
    };
    const rankedCount=scopedResults.filter(result=>programmes.some(programme=>programme.id===result.programmeId)).length;
    const representativeCount=scopedSelections.filter(item=>programmes.some(programme=>programme.id===item.programmeId)).length;
    const actions=btn('Print results','print-results','btn btn-secondary')+(['admin','teacher'].includes(state.role)?btn('Export results','results-export','btn btn-primary'):'');
    return `${heading('Final results','A clear results register for school winners and confirmed Sahodaya representatives. Filter the programme list, then print or export the exact view.','RESULTS OFFICE',actions)}
      ${state.role==='admin'?'<div class="info-box results-admin-note">Ranks are optional and limited to 1st, 2nd and 3rd. Sahodaya selection is a separate school decision and is never assigned automatically.</div>':''}
      <div class="results-summary-grid"><article><span>Programmes shown</span><strong>${programmes.length}</strong></article><article><span>Rank records</span><strong>${rankedCount}</strong></article><article><span>Sahodaya selections</span><strong>${representativeCount}</strong></article><article><span>Academic year</span><strong>${esc(db.settings.academicYear)}</strong></article></div>
      <section class="programme-filter-panel results-filter-panel" aria-label="Result filters"><div class="toolbar results-toolbar"><input class="search-field" id="results-q" placeholder="Search programme or code" value="${esc(f.q||'')}"><button type="button" class="btn btn-quiet btn-small filter-more-toggle" data-action="results-filters-toggle" aria-expanded="${f.moreOpen?'true':'false'}">${f.moreOpen?'− Less filters':'+ More filters'}</button><span class="filter-result-count">${programmes.length} programmes</span></div><div class="filter-advanced results-filter-advanced" ${f.moreOpen?'':'hidden'}><label class="filter-field"><span>Area</span><select class="filter-select" id="results-area"><option value="">All areas</option>${selectOptions(['Arts','Sports'],f.area)}</select></label><label class="filter-field"><span>Category</span><select class="filter-select" id="results-category"><option value="">All categories</option>${selectOptions([...categoryNames(),'Group Item'],f.category)}</select></label><label class="filter-field"><span>Winner class</span><select class="filter-select" id="results-class"><option value="">Any class</option>${selectOptions(classes.map(classNo=>({value:classNo,label:ordinalClass(classNo)})),f.classNo)}</select></label><label class="filter-field"><span>Result state</span><select class="filter-select" id="results-status"><option value="">All states</option><option value="with-results" ${f.status==='with-results'?'selected':''}>With results</option><option value="without-results" ${f.status==='without-results'?'selected':''}>No result recorded</option></select></label><label class="filter-field"><span>Sort</span><select class="filter-select" id="results-sort">${selectOptions([{value:'name',label:'Programme'},{value:'area',label:'Area'},{value:'category',label:'Category'},{value:'gender',label:'Gender'},{value:'class',label:'Winner class ↑'},{value:'class-desc',label:'Winner class ↓'},{value:'deadline',label:'Closing date'}],f.sort||'name')}</select></label><button class="btn btn-quiet btn-small" data-action="results-filter-clear">Clear filters</button></div></section>
      <section class="results-print-region" data-print-region="results"><div class="print-only print-document-heading"><h1>${esc(db.settings.schoolName)}</h1><h2>Report</h2></div>
      <div class="table-panel results-table-panel"><div class="table-wrap"><table class="data-table results-table"><thead><tr><th>Programme</th><th>Area</th><th>Category</th><th>Gender</th><th>1st place</th><th>2nd place</th><th>3rd place</th><th>Sahodaya representative</th>${isAdmin()?'<th class="no-print">Manage</th>':''}</tr></thead><tbody>${programmes.map(programme=>`<tr><td><strong>${esc(programme.name)}</strong><small class="result-code">${esc(programme.code)}</small></td><td>${esc(programme.area)}</td><td>${catBadge(programme.category)}</td><td>${esc(programme.gender)}</td><td>${winnerCell(programme,1)}</td><td>${winnerCell(programme,2)}</td><td>${winnerCell(programme,3)}</td><td>${representativeCell(programme)}</td>${isAdmin()?`<td class="no-print">${btn('Manage','result-manage','table-action','data-id="'+programme.id+'"')}</td>`:''}</tr>`).join('')||`<tr><td colspan="${isAdmin()?9:8}"><div class="empty-state">No programmes match the selected filters.</div></td></tr>`}</tbody></table></div><div class="table-footer"><span>${programmes.length} programme records</span><span>Only published final results are visible to parent accounts.</span></div></div></section>`;
  }
  function physicalPrintFiltersMarkup() {
    const f=state.reportPrint||{};
    const students=db.students.filter(st=>st.active);
    const programmeArea=f.area||'Sports';
    const areaProgrammes=db.programmes.filter(p=>!p.archived&&p.area===programmeArea);
    const sectionsForClassList=f.classNo?sectionsForClass(Number(f.classNo)):[];
    return `<section class="physical-print-builder">
      <div class="section-title-row"><div><h2>Physical registration print</h2><p>Choose the students and details you need, then print one clean sheet for Arts or Sports. Students registered for multiple programmes appear under every applicable programme.</p></div></div>
      <div class="print-area-switch"><button class="election-tab ${programmeArea==='Sports'?'active':''}" data-action="physical-print-area" data-area="Sports">Sports print</button><button class="election-tab ${programmeArea==='Arts'?'active':''}" data-action="physical-print-area" data-area="Arts">Arts print</button><button class="btn btn-secondary btn-small" data-action="report-custom-students">Add custom students</button></div><div class="info-box">Custom students are a report-only selection. They do not register the student for any programme and do not change programme records.</div>
      <div class="toolbar physical-print-toolbar">
        <input class="search-field" id="physical-print-q" placeholder="Student name or admission ID" value="${esc(f.q||'')}">
        <select class="filter-select" id="physical-print-programme"><option value="">All ${programmeArea} programmes</option>${selectOptions(areaProgrammes.map(p=>({value:p.id,label:p.name})),f.programme)}</select>
        <select class="filter-select" id="physical-print-class"><option value="">All classes</option>${selectOptions(classes.map(c=>({value:c,label:ordinalClass(c)})),f.classNo)}</select>
        <select class="filter-select" id="physical-print-section"><option value="">All sections</option>${selectOptions(sectionsForClassList,f.section)}</select>
        <select class="filter-select" id="physical-print-gender"><option value="">All genders</option>${selectOptions(['Boy','Girl','Not specified'],f.gender)}</select>
        <select class="filter-select" id="physical-print-category"><option value="">All categories</option>${selectOptions(categoryNames(),f.category)}</select>
        <select class="filter-select" id="physical-print-house"><option value="">All houses</option>${selectOptions(['Emerald','Ruby','Diamond','Sapphire'],f.house)}</select>
        ${ageFilterMarkup('physical-print-age',students,f.age)}
      </div>
      <div class="print-column-picker"><strong>Print details</strong>${[['name','Name'],['admission','Admission ID'],['age','Age'],['dob','Date of birth'],['gender','Gender'],['class','Class'],['section','Section'],['house','House'],['category','Category']].map(([key,label])=>`<label class="check-tile"><input type="checkbox" data-physical-print-column="${key}" ${(f.columns||[]).includes(key)?'checked':''}>${label}</label>`).join('')}</div>
      <div class="form-actions physical-print-actions"><button class="btn btn-primary" data-action="physical-print" data-area="${programmeArea}">Print ${programmeArea} registration sheet</button><button class="btn btn-quiet" data-action="physical-print-clear">Clear filters</button></div>
      <div class="info-box">The printed sheet is grouped by programme. A student who is registered for two or more programmes is listed under each programme. The print contains only the selected area, filters and columns.</div>
    </section>`;
  }

  function buildPhysicalPrintRegion(area) {
    const f=state.reportPrint||{};
    const customIds=new Set((f.customStudentIds||[]).map(Number));const sourceStudents=db.students.filter(st=>st.active&&(((!f.q||String(st.name||'').toLowerCase().includes(String(f.q).toLowerCase())||String(st.admissionNo||'').toLowerCase().includes(String(f.q).toLowerCase()))&&(!f.gender||st.gender===f.gender)&&(!f.category||catForClass(st.classNo)===f.category)&&(!f.classNo||Number(st.classNo)===Number(f.classNo))&&(!f.section||st.section===f.section)&&(!f.house||st.house===f.house)&&(!f.age||matchesAgeFilter(st,f.age)))||customIds.has(Number(st.id))));
    const programmeList=db.programmes.filter(p=>!p.archived&&p.area===area&&(!f.programme||Number(p.id)===Number(f.programme))).sort((a,b)=>a.name.localeCompare(b.name));
    const columns=(f.columns&&f.columns.length?f.columns:['name','admission','age','dob','gender','class','section','house','category']);
    const labels={name:'Student name',admission:'Admission ID',age:'Age',dob:'Date of birth',gender:'Gender',class:'Class',section:'Section',house:'House',category:'Category'};
    const getCell=(st,key)=>key==='name'?esc(st.name):key==='admission'?esc(st.admissionNo||'—'):key==='age'?esc(studentAgeText(st)):key==='dob'?esc(st.dob?formatDateOfBirth(st.dob):'—'):key==='gender'?esc(st.gender||'—'):key==='class'?esc(ordinalClass(st.classNo)):key==='section'?esc(st.section||'—'):key==='house'?esc(st.house||'—'):key==='category'?esc(catForClass(st.classNo)):'—';
    const visibleIds=new Set(sourceStudents.map(student=>Number(student.id))),programmeIds=new Set(programmeList.map(programme=>Number(programme.id))),studentIdsByProgramme=new Map();
    for(const registration of db.registrations){const pid=Number(registration.programmeId),sid=Number(registration.studentId);if(programmeIds.has(pid)&&visibleIds.has(sid)){if(!studentIdsByProgramme.has(pid))studentIdsByProgramme.set(pid,new Set());studentIdsByProgramme.get(pid).add(sid);}}
    const studentsById=new Map(sourceStudents.map(student=>[Number(student.id),student]));
    const groups=programmeList.map(programme=>({p:programme,students:[...(studentIdsByProgramme.get(Number(programme.id))||[])].map(id=>studentsById.get(id)).filter(Boolean)})).filter(group=>group.students.length);
    const customStudents=[...customIds].map(id=>studentsById.get(id)).filter(Boolean);
    return `<div id="physical-print-region" class="physical-print-region"><div class="print-document-heading"><h1>${esc(db.settings.schoolName)}</h1><h2>Report</h2></div>${groups.map(g=>`<section class="physical-print-programme"><h3>${esc(g.p.name)}${g.p.category?` <span>${esc(g.p.category)}</span>`:''}${g.p.gender!=='All'?` <span>${esc(g.p.gender)}</span>`:''}</h3><table><thead><tr>${columns.map(key=>`<th>${labels[key]}</th>`).join('')}</tr></thead><tbody>${g.students.map(st=>`<tr>${columns.map(key=>`<td>${getCell(st,key)}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`).join('')||'<div class="empty-state">No registered students match the selected filters.</div>'}${customStudents.length?`<section class="physical-print-programme"><h3>Custom students</h3><p>Report-only selection · no programme registration implied.</p><table><thead><tr>${columns.map(key=>`<th>${labels[key]}</th>`).join('')}</tr></thead><tbody>${customStudents.map(st=>`<tr>${columns.map(key=>`<td>${getCell(st,key)}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`:''}<p class="physical-print-total">${groups.reduce((n,g)=>n+g.students.length,0)} programme registrations shown across ${groups.length} ${area} programme${groups.length===1?'':'s'}${customStudents.length?` · ${customStudents.length} custom report students`:''}.</p></div>`;
  }

  function renderNotRegistered() {
    const area=['Arts','Sports','Both'].includes(state.notRegisteredBrowser?.area)?state.notRegisteredBrowser.area:'Both';
    const scoped=db.students.filter(st=>st.active&&(isAdmin()||state.role==='teacher'&&canViewStudent(st)));
    const registeredAreas=new Map();
    for(const reg of db.registrations){
      const student=studentById(reg.studentId),programme=programmeById(reg.programmeId);
      if(!student?.active||!programme||programme.archived||programme.category==='Group Item')continue;
      const sid=Number(student.id);if(!registeredAreas.has(sid))registeredAreas.set(sid,new Set());
      if(['Arts','Sports'].includes(programme.area))registeredAreas.get(sid).add(programme.area);
    }
    const missing=scoped.filter(st=>{const areas=registeredAreas.get(Number(st.id))||new Set();return area==='Both'?(!areas.has('Arts')&&!areas.has('Sports')):!areas.has(area);});
    const classList=isAdmin()?classes.slice():teacherClasses();
    const collator=new Intl.Collator('en',{numeric:true,sensitivity:'base'});
    const studentRows=rows=>`<div class="table-panel not-registered-table"><div class="table-wrap"><table class="data-table"><thead><tr><th>Student</th><th>Class / section</th><th>Admission number</th><th>Gender</th><th>Category</th><th>Action</th></tr></thead><tbody>${rows.map(st=>`<tr><td>${studentCell(st)}</td><td>${ordinalClass(st.classNo)} ${esc(st.section||'Unsectioned')}</td><td>${esc(st.admissionNo)}</td><td>${esc(st.gender||'Not specified')}</td><td>${catBadge(catForClass(st.classNo))}</td><td>${btn('Add programme','student-add-programme','table-action',`data-id="${st.id}"`)}</td></tr>`).join('')||'<tr><td colspan="6"><div class="empty-state">No students are missing choices in this area.</div></td></tr>'}</tbody></table></div></div>`;
    const rowsForClass=classNo=>missing.filter(st=>Number(st.classNo)===Number(classNo)).sort((a,b)=>collator.compare(a.section||'',b.section||'')||collator.compare(a.name||'',b.name||''));
    let content='';
    if(state.role==='teacher'&&classList.length===1){
      const rows=rowsForClass(classList[0]);
      content=`<section class="not-registered-class-panel"><header><div><span class="eyebrow">YOUR ASSIGNED CLASS</span><h2>${ordinalClass(classList[0])} Class</h2><p>${rows.length} students without ${area==='Both'?'Arts or Sports choices':`${area} choices`}</p></div></header>${studentRows(rows)}</section>`;
    }else{
      content=`<div class="not-registered-class-list">${classList.map(classNo=>{const rows=rowsForClass(classNo);return `<details class="not-registered-class"><summary><span><strong>${ordinalClass(classNo)} Class</strong><small>${rows.length} students without ${area==='Both'?'Arts or Sports choices':`${area} choices`}</small></span><b>${rows.length}</b><i>+</i></summary><div class="not-registered-class-body">${studentRows(rows)}</div></details>`;}).join('')||'<div class="empty-state">No assigned classes are available for this account.</div>'}</div>`;
    }
    return `${heading('Students not registered','Find active students who have not registered in the selected activity area. Choose a class to view the list.','STUDENT FOLLOW-UP')}<section class="not-registered-toolbar"><div><strong>${missing.length} students</strong><small>Out of ${scoped.length} active students in your access scope</small></div><div class="not-registered-area-filter" role="group" aria-label="Activity area">${['Arts','Sports','Both'].map(value=>`<button type="button" class="${area===value?'active':''}" data-action="not-registered-area" data-area="${value}" aria-pressed="${area===value?'true':'false'}">${value}</button>`).join('')}</div></section>${content}`;
  }

  function renderReports() {
    if(state.role==='teacher'&&!currentTeacherHas('viewReports'))return '<div class="empty-state"><strong>Reports access is not enabled</strong><p>Ask an administrator to grant Reports access in the Teacher accounts panel.</p></div>';
    const f=state.reportFilters,browser=state.reportBrowser||{classNo:null,section:null};
    const printBuilder=physicalPrintFiltersMarkup();
    const scoped=db.students.filter(st=>st.active&&(isAdmin()||state.role==='teacher'&&teacherCanAccessStudent(st)));
    const participated=new Set(db.registrations.filter(r=>programmeById(r.programmeId)&&!programmeById(r.programmeId).archived).map(r=>Number(r.studentId)));
    const groupRows=scoped.filter(st=>participated.has(Number(st.id)));
    const total=scoped.length,participatedCount=groupRows.length;
    const classList=isAdmin()?classes.slice():teacherClasses();
    const pairs=isAdmin()?classList.flatMap(classNo=>sectionsForClass(classNo).map(section=>({classNo,section}))):teacherClassSections();
    let body='';
    if(!browser.section){
      const counts=Object.fromEntries(classList.map(classNo=>[classNo,groupRows.filter(st=>st.classNo===classNo).length]));
      const pairsByClass=Object.fromEntries(classList.map(classNo=>[classNo,pairs.filter(pair=>pair.classNo===classNo)]));
      const sectionCounts=Object.fromEntries(pairs.map(pair=>[classSectionKey(pair.classNo,pair.section),groupRows.filter(st=>st.classNo===pair.classNo&&st.section===pair.section).length]));
      body=classRowsMarkup(classList,'report-browse-class',counts,'',browser.classNo,'report-browse-section',sectionCounts,pairsByClass);
    }else{
      const sectionStudents=groupRows.filter(st=>st.classNo===Number(browser.classNo)&&st.section===String(browser.section));
      let rows=sectionStudents;
      if(f.q)rows=rows.filter(st=>st.name.toLowerCase().includes(f.q.toLowerCase())||st.admissionNo.toLowerCase().includes(f.q.toLowerCase()));
      if(f.category)rows=rows.filter(st=>catForClass(st.classNo)===f.category);if(f.age)rows=rows.filter(st=>matchesAgeFilter(st,f.age));rows=sortStudentRecords(rows,f.sort||'name');
      body=`<div class="browser-breadcrumb"><button class="btn btn-quiet btn-small" data-action="report-browse-back">← Classes and sections</button><strong>${ordinalClass(browser.classNo)} ${esc(browser.section)}</strong><span>${rows.length} students shown</span></div><section class="programme-filter-panel report-filter-panel" aria-label="Report filters"><div class="toolbar programme-primary-filters"><input class="search-field" id="report-q" placeholder="Search within this section" value="${esc(f.q||'')}"><button type="button" class="btn btn-quiet btn-small filter-more-toggle" data-action="report-filters-toggle" aria-expanded="${f.moreOpen?'true':'false'}">${f.moreOpen?'− Less filters':'+ More filters'}</button><span class="filter-result-count">${rows.length} records</span></div><div class="filter-advanced report-filter-advanced" ${f.moreOpen?'':'hidden'}><label class="filter-field"><span>Category</span><select class="filter-select" id="report-category"><option value="">All categories</option>${selectOptions(categoryNames(),f.category)}</select></label>${ageFilterMarkup('report-age',sectionStudents,f.age)}<label class="filter-field"><span>Sort</span><select class="filter-select" id="report-sort">${selectOptions([{value:'name',label:'Name (A–Z)'},{value:'name-desc',label:'Name Z–A'},{value:'admission',label:'Admission number'},{value:'gender',label:'Gender'},{value:'age',label:'Age (low to high)'},{value:'age-desc',label:'Age (high to low)'},{value:'category',label:'Category'}],f.sort||'name')}</select></label></div></section><div class="table-panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>Student</th><th>Class / section</th><th>Age</th><th>Category</th><th>Programmes</th></tr></thead><tbody>${rows.map(st=>{const items=registrationsFor(st.id).map(reg=>programmeById(reg.programmeId)).filter(prog=>prog&&!prog.archived);return `<tr><td>${studentCell(st)}</td><td>${ordinalClass(st.classNo)} ${esc(st.section)}</td><td>${studentAgeText(st)}</td><td>${catBadge(catForClass(st.classNo))}</td><td>${items.length?items.map(prog=>esc(prog.name)).join(', '):'—'}</td></tr>`;}).join('')||'<tr><td colspan="5"><div class="empty-state">No students in this group match the filters.</div></td></tr>'}</tbody></table></div><div class="table-footer"><span>${rows.length} students</span></div></div>`;
    }
    const actions=browser.section?`${btn('Print this section','print-report','btn btn-secondary')}${btn('Export this section','report-export','btn btn-primary')}`:'';
    return `${heading('Programme registration analysis','Review programme registrations for active students. A registration records a programme choice, not daily attendance or confirmed event participation.','REPORTS',actions)}${printBuilder}<div class="report-summary"><div class="report-tile"><strong>${participatedCount}</strong><small>Students with registrations</small></div><div class="report-tile"><strong>${db.registrations.filter(r=>{const st=studentById(r.studentId),prog=programmeById(r.programmeId);return st?.active&&prog&&!prog.archived&&(isAdmin()||state.role==='teacher'&&canViewStudent(st));}).length}</strong><small>Programme entries</small></div><div class="report-tile"><strong>${total}</strong><small>Students in scope</small></div></div>${body}`;
  }
  function calendarDate(value) {
    const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||'').slice(0,10));
    if(!match)return null;
    const date=new Date(Number(match[1]),Number(match[2])-1,Number(match[3]),12);
    return date.getFullYear()===Number(match[1])&&date.getMonth()===Number(match[2])-1&&date.getDate()===Number(match[3])?date:null;
  }
  function calendarKey(date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
  function calendarAddDays(date,amount) { const next=new Date(date);next.setDate(next.getDate()+amount);return next; }
  function calendarOffset(value,amount) { const date=calendarDate(value);return date?calendarKey(calendarAddDays(date,amount)):''; }
  function schoolTodayKey(now=new Date()) { return schoolDateISO(now); }
  function schoolDateLabel(value,options={weekday:'long',day:'numeric',month:'long',year:'numeric'}) {
    const key=String(value||'').slice(0,10);
    if(!calendarDate(key))return 'Date not set';
    // Anchor at UTC noon so the calendar day stays stable even when viewed outside India.
    return new Date(`${key}T12:00:00Z`).toLocaleDateString('en-IN',{timeZone:SCHOOL_TIME_ZONE,...options});
  }
  function calendarEventEnd(event) { return calendarDate(event.endDate||event.date)||calendarDate(event.date); }
  function calendarEventTime(event) {
    if(event.allDay)return 'All day';
    const format=value=>{
      const match=/^(\d{2}):(\d{2})$/.exec(String(value||''));
      if(!match)return '';
      const hour=Number(match[1]),minute=Number(match[2]);
      if(hour>23||minute>59)return '';
      return `${hour%12||12}:${String(minute).padStart(2,'0')} ${hour>=12?'PM':'AM'}`;
    };
    const start=format(event.time),end=format(event.endTime);
    if(!start)return 'Time not set';
    return `${start}${end?` – ${end}`:''} IST`;
  }
  function calendarEventRange(event) {
    const start=String(event.date||'').slice(0,10),end=String(event.endDate||event.date||'').slice(0,10);
    if(!calendarDate(start))return 'Date not set';
    const first=schoolDateLabel(start,{weekday:'short',day:'numeric',month:'short',year:'numeric'});
    return end&&end!==start&&calendarDate(end)?`${first} – ${schoolDateLabel(end,{weekday:'short',day:'numeric',month:'short',year:'numeric'})}`:first;
  }
  function calendarEventRelativeLabel(event,today=schoolTodayKey()) {
    const start=String(event.date||'').slice(0,10),endDate=calendarEventEnd(event),end=endDate?calendarKey(endDate):'';
    if(!calendarDate(start)||!end)return 'Date to be confirmed';
    if(end<today)return 'Past event';
    if(start<today&&end>=today)return 'In progress';
    if(start===today)return 'Today';
    if(start===calendarOffset(today,1))return 'Tomorrow';
    const delta=(Date.parse(`${start}T00:00:00Z`)-Date.parse(`${today}T00:00:00Z`))/86400000;
    return delta>=0&&delta<7?schoolDateLabel(start,{weekday:'long'}):schoolDateLabel(start,{day:'numeric',month:'short',year:'numeric'});
  }
  function calendarEventsVisible() {
    const teacher=userByRole('teacher'),query=String(state.calendarQuery||'').trim().toLocaleLowerCase();
    return db.events.filter(event=>{const start=calendarDate(event.date),end=calendarEventEnd(event);return !!start&&!!end&&end>=start;})
      .filter(event=>isAdmin()||event.published||(state.role==='teacher'&&teacher&&event.coordinator===teacher.displayName))
      .filter(event=>!query||[event.title,event.description,event.venue,event.coordinator,event.type].some(value=>String(value||'').toLocaleLowerCase().includes(query)))
      .filter(event=>state.calendarType==='All'||event.type===state.calendarType)
      .filter(event=>state.role!=='parent'||!['Staff only','Teachers'].includes(event.audience||'Everyone'))
      .slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.time||'').localeCompare(String(b.time||''))||String(a.title).localeCompare(String(b.title)));
  }
  function calendarEventsForPeriod(events,period='upcoming',today=schoolTodayKey()) {
    const startKey=event=>calendarDate(event.date)?calendarKey(calendarDate(event.date)):'';
    const endKey=event=>{const end=calendarEventEnd(event);return end?calendarKey(end):startKey(event);};
    const timeKey=event=>String(event.time||'');
    const titleKey=event=>String(event.title||'').toLocaleLowerCase();
    const compareStart=(a,b)=>startKey(a).localeCompare(startKey(b))||timeKey(a).localeCompare(timeKey(b))||titleKey(a).localeCompare(titleKey(b));
    if(period==='past')return events.filter(event=>endKey(event)<today).slice().sort((a,b)=>endKey(b).localeCompare(endKey(a))||timeKey(b).localeCompare(timeKey(a))||titleKey(a).localeCompare(titleKey(b)));
    if(period==='all')return events.slice().sort(compareStart);
    // An event already in progress belongs at the top of Upcoming, under Today.
    return events.filter(event=>endKey(event)>=today).slice().sort((a,b)=>{
      const aDay=startKey(a)<today?today:startKey(a),bDay=startKey(b)<today?today:startKey(b);
      return aDay.localeCompare(bDay)||timeKey(a).localeCompare(timeKey(b))||titleKey(a).localeCompare(titleKey(b));
    });
  }
  function calendarEventCard(event,today) {
    const start=calendarDate(event.date),day=start?schoolDateLabel(event.date,{day:'numeric'}):'—';
    const month=start?schoolDateLabel(event.date,{month:'short'}):'TBD';
    const year=start?schoolDateLabel(event.date,{year:'numeric'}):'';
    const audience=event.audience||'Everyone';
    const status=isAdmin()?badge(event.published?'Published':'Draft',event.published?'open':'draft'):'';
    const relative=calendarEventRelativeLabel(event,today);
    return `<article class="event-feed-card">
      <div class="event-feed-date"><strong>${esc(day)}</strong><span>${esc(month)}</span><small>${esc(year)}</small></div>
      <div class="event-feed-main"><div class="event-feed-labels">${catBadge(event.type||'School event')}<span class="event-relative-label">${esc(relative)}</span>${status}</div>
        <button type="button" class="event-feed-title" data-action="calendar-event-view" data-id="${event.id}">${esc(event.title)}</button>
        <div class="event-feed-meta"><span>${esc(calendarEventRange(event))}</span><span>${esc(calendarEventTime(event))}</span><span>${esc(event.venue||'Venue not set')}</span></div>
        ${event.description?`<p class="event-feed-description">${esc(event.description)}</p>`:''}
        ${event.coordinator?`<small class="event-feed-coordinator">Coordinator: ${esc(event.coordinator)}</small>`:''}
      </div>
      ${isAdmin()?`<div class="event-feed-actions">${btn('Edit','event-edit','table-action',`data-id="${event.id}"`)}</div>`:''}
    </article>`;
  }
  function calendarEventDetails(event) {
    if(!event)return toast('This event no longer exists.','error');
    if(!calendarEventsVisible().some(item=>Number(item.id)===Number(event.id)))return toast('This event is not available to this account.','error');
    const audience=event.audience||'Everyone';
    openModal(event.title,`<div class="calendar-detail-panel"><div class="calendar-detail-tags">${badge(event.published?'Published':'Draft',event.published?'open':'draft')}${catBadge(event.type||'School event')}${catBadge(audience)}</div><div class="calendar-detail-grid"><div><span>Date</span><strong>${calendarEventRange(event)}</strong></div><div><span>Time</span><strong>${esc(calendarEventTime(event))}</strong></div><div><span>Venue</span><strong>${esc(event.venue||'Not set')}</strong></div><div><span>Coordinator</span><strong>${esc(event.coordinator||'Not assigned')}</strong></div></div>${event.description?`<div class="calendar-detail-description"><span>About this event</span><p>${esc(event.description)}</p></div>`:''}<div class="form-actions"><button type="button" class="btn" data-close-modal>Close</button>${isAdmin()?btn('Edit event','event-edit','btn btn-secondary',`data-id="${event.id}" data-close-after="1"`)+btn('Delete event','event-delete','btn btn-danger',`data-id="${event.id}"`):''}</div></div>`,'EVENT DETAILS');
  }
  function renderCalendar() {
    const events=calendarEventsVisible(),today=schoolTodayKey(),tomorrow=calendarOffset(today,1);
    const period=['upcoming','past','all'].includes(state.calendarPeriod)?state.calendarPeriod:'upcoming';
    const upcoming=calendarEventsForPeriod(events,'upcoming',today);
    const past=calendarEventsForPeriod(events,'past',today);
    const shown=calendarEventsForPeriod(events,period,today);
    const counts={upcoming:upcoming.length,past:past.length,all:events.length};
    const periodButtons=[['upcoming','Upcoming'],['past','Past events'],['all','All events']].map(([key,label])=>`<button type="button" class="event-period-button ${period===key?'active':''}" data-action="calendar-period" data-period="${key}" aria-pressed="${period===key}">${label}<span>${counts[key]}</span></button>`).join('');
    const groups=new Map();
    for(const event of shown){
      const start=String(event.date).slice(0,10),endDate=calendarEventEnd(event),end=endDate?calendarKey(endDate):start;
      const key=period==='past'?end:(start<today&&end>=today?today:start);
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(event);
    }
    const groupEntries=[...groups.entries()].sort(([a],[b])=>period==='past'?b.localeCompare(a):a.localeCompare(b));
    const groupMarkup=groupEntries.map(([key,items])=>{
      const label=key===today?'Today':key===tomorrow?'Tomorrow':schoolDateLabel(key,{weekday:'long'});
      const exact=schoolDateLabel(key,{day:'numeric',month:'long',year:'numeric'});
      return `<section class="event-date-group"><header class="event-date-heading"><strong>${esc(label)}</strong><span>${esc(exact)}</span></header><div class="event-feed-list">${items.map(event=>calendarEventCard(event,today)).join('')}</div></section>`;
    }).join('');
    const emptyText=period==='past'?'There are no past events matching these filters.':period==='all'?'No events match this search.':'There are no upcoming events matching these filters.';
    const empty=`<div class="event-feed-empty"><strong>${esc(emptyText)}</strong><span>Try another event type or clear the search.</span></div>`;
    const todayCount=events.filter(event=>{const start=calendarDate(event.date),end=calendarEventEnd(event);return !!start&&!!end&&calendarKey(start)<=today&&calendarKey(end)>=today;}).length;
    return `${heading('School events','See upcoming school activities, important dates and notices in real date order. Event times are shown in India Standard Time (IST).','EVENTS',isAdmin()?btn('+ Add event','event-add','btn btn-primary'):'' )}
      <section class="events-workspace">
        <div class="events-context-line"><span class="events-context-mark">TODAY</span><strong>${esc(schoolDateLabel(today))}</strong><span>${todayCount} event${todayCount===1?'':'s'} scheduled today</span></div>
        <div class="events-toolbar"><div class="event-period-tabs" role="group" aria-label="Event time period">${periodButtons}</div>
          <div class="events-filterbar"><label class="events-search"><span>⌕</span><input id="calendar-search" type="search" placeholder="Search events, venue or coordinator…" value="${esc(state.calendarQuery)}"></label><select class="filter-select" id="calendar-type" aria-label="Filter by event type"><option value="All">All event types</option>${selectOptions(['Arts','Sports','School event','Rehearsal','Exam','Holiday','Meeting','Notice','Other'],state.calendarType)}</select></div>
        </div>
        <div class="events-result-line"><span>${shown.length} event${shown.length===1?'':'s'} shown</span><span>Dates follow the school calendar · IST</span></div>
        <div class="event-feed-groups">${groupMarkup||empty}</div>
      </section>`;
  }

  function renderParentOverview() {
    const children=parentStudents();
    if(!children.length) return `${heading('Overview','This parent account is not linked to an active student record.','PARENT PORTAL')}<div class="panel empty-state"><strong>No linked child</strong><p>Ask the school office to link the correct student record to this parent account.</p></div>`;
    const student=currentLinkedStudent();
    const eligible=db.programmes.filter(p=>p.status!=='draft'&&!p.archived&&isEligible(student,p));
    const areas=[
      {key:'arts',label:'Arts',desc:'Individual and group performance choices',icon:'palette',items:eligible.filter(p=>p.area==='Arts'&&p.category!=='Group Item')},
      {key:'sports',label:'Sports',desc:'Track, field and other sporting events',icon:'trophy',items:eligible.filter(p=>p.area==='Sports'&&p.category!=='Group Item')},
      {key:'groups',label:'Group Items',desc:'Ensemble and team entries managed by staff',icon:'users-round',items:eligible.filter(p=>p.category==='Group Item')}
    ];
    const childSelect=children.length>1?`<label class="child-switch"><span>Viewing child</span><select class="filter-select" id="parent-child-select">${selectOptions(children.map(x=>({value:x.id,label:`${x.name} · Class ${x.classNo}${x.section}`})),student.id)}</select></label>`:`<span class="year-pill">Class ${esc(student.classNo)}${esc(student.section||'')} · ${esc(catForClass(student.classNo)||'Category not assigned')}</span>`;
    const areaCards=areas.map(area=>`<button type="button" class="parent-area-card" data-action="navigate" data-page="${area.key}"><span class="parent-area-icon">${uiIcon(area.icon)}</span><span class="parent-area-copy"><strong>${area.label}</strong><small>${area.desc}</small><em>${area.items.length} eligible ${area.items.length===1?'item':'items'}</em></span><span class="parent-area-arrow" aria-hidden="true">→</span></button>`).join('');
    return `<section class="hero-panel parent-overview-hero"><div class="hero-copy"><p class="eyebrow">PARENT PORTAL</p><h2>${esc(db.settings.dashboardTitle||'Every student has a place to take part.')}</h2><p>${esc(db.settings.dashboardDescription||'Keep programme choices, event schedules and school results organised in one place. Arts and Sports stay separate; student records stay central.')}</p><div class="parent-hero-context">${childSelect}</div></div>${db.settings.dashboardQuote?`<div class="hero-meta parent-hero-quote">“${esc(db.settings.dashboardQuote)}”</div>`:''}</section>
      ${parentParticipationPanel(student)}
      <section class="parent-explore-section"><header class="parent-section-heading"><div><span class="eyebrow">EXPLORE</span><h2>Choose an activity area</h2><p>Open Arts or Sports to browse programmes. Registration happens inside each area.</p></div></header><div class="parent-area-overview">${areaCards}</div></section>
      ${db.settings.announcements?`<section class="parent-notice"><span class="eyebrow">SCHOOL NOTICE</span><p>${esc(db.settings.announcements)}</p></section>`:''}`;
  }

  function renderPortal() {
    const children=parentStudents();
    if(!children.length) return `${heading('My child','The student profile linked to this parent account.','PARENT PORTAL')}<div class="panel empty-state"><strong>No linked child</strong><p>Ask the school office to link the correct student record to this parent account.</p></div>`;
    const student=currentLinkedStudent();
    const childSelect=children.length>1
      ? `<label class="child-profile-switch"><span>Viewing child</span><select class="filter-select" id="parent-child-select">${selectOptions(children.map(x=>({value:x.id,label:`${x.name} · Class ${x.classNo}${x.section}`})),student.id)}</select></label>`
      : '';
    const classLabel=`${ordinalClass(student.classNo)}${student.section&&student.section!=='Unsectioned'?` · Section ${student.section}`:student.section==='Unsectioned'?' · Unsectioned':''}`;
    const profileFields=[
      ['Admission number',student.admissionNo||'Not recorded'],
      ['Class & section',classLabel],
      ['Category',catForClass(student.classNo)||'Not assigned'],
      ['Gender',student.gender||'Not specified'],
      ['House',student.house||'Not assigned'],
      ['Academic year',db.settings.academicYear||'Current year']
    ];
    const registrations=registrationsFor(student.id)
      .map(reg=>({reg,programme:programmeById(reg.programmeId)}))
      .filter(item=>item.programme&&!item.programme.archived);
    const areaCounts=parentParticipationCounts(student);
    const artsUsed=areaCounts.arts.onstage+areaCounts.arts.offstage;
    const sportsUsed=areaCounts.sports.track+areaCounts.sports.field;
    const activityRows=registrations.map(({reg,programme})=>{
      const result=db.results.find(x=>x.programmeId===programme.id&&x.studentId===student.id);
      
      const type=inferProgrammeType(programme.area,programme.category,programme.name,programme.description,programme.itemType);
      const typeLabel=programme.category==='Group Item'?'Group Item':programmeTypeLabel(type);
      const resultText=db.settings.publishResults&&result?.rank?`${result.rank}${result.rank===1?'st':result.rank===2?'nd':'rd'} place`:db.settings.publishResults?'—':'Not published';
      return `<tr><td><strong>${esc(programme.name)}</strong></td><td>${esc(programme.area)}</td><td>${esc(typeLabel)}</td>${db.settings.publishResults?`<td>${esc(resultText)}</td>`:''}</tr>`;
    }).join('');
    return `${heading('My child', 'A personal school profile and activity record for the student linked to this parent account.', 'STUDENT PROFILE', childSelect)}
      <section class="child-profile-card" aria-labelledby="child-profile-name">
        <div class="child-profile-heading"><div><span class="eyebrow">STUDENT PROFILE</span><h2 id="child-profile-name">${esc(student.name)}</h2><p>${esc(db.settings.schoolName||'School')} · ${classLabel}</p></div><span class="child-profile-state">${student.active?'Active student':'Inactive record'}</span></div>
        <div class="child-profile-details">${profileFields.map(([label,value])=>`<div class="child-profile-detail"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('')}</div>
      </section>
      <section class="child-activity-summary" aria-label="Activity summary">
        <div class="child-activity-summary-heading"><div><span class="eyebrow">PARTICIPATION</span><h2>Activity at a glance</h2></div><span class="child-activity-total">${registrations.length} total</span></div>
        <div class="child-activity-stats">
          <article><span>Arts</span><strong>${artsUsed} / ${(Number(db.settings.maxArtsOnstage??3)+Number(db.settings.maxArtsOffstage??3))}</strong></article>
          <article><span>Sports</span><strong>${sportsUsed} / ${Number(db.settings.maxSports??3)}</strong></article>
          <article><span>Group Items</span><strong>${areaCounts.groups} / ${Number(db.settings.maxGroup??2)}</strong></article>
        </div>
        ${parentParticipationPanel(student,true)}
      </section>
      <section class="panel child-activity-record"><header class="panel-head"><div><h2>My child’s activity</h2><p>Programme entries recorded for ${esc(student.name)}.</p></div><button class="btn btn-secondary btn-small" data-action="navigate" data-page="dashboard">View overview</button></header><div class="table-wrap"><table class="data-table"><thead><tr><th>Programme</th><th>Area</th><th>Event type</th>${db.settings.publishResults?'<th>Rank</th>':''}</tr></thead><tbody>${activityRows||`<tr><td colspan="${db.settings.publishResults?4:3}"><div class="empty-state">No programme activity has been recorded for this child yet.</div></td></tr>`}</tbody></table></div></section>`;
  }

  function makePublicKey(){const bytes=new Uint8Array(18);if(window.crypto?.getRandomValues)window.crypto.getRandomValues(bytes);else for(let i=0;i<bytes.length;i++)bytes[i]=Math.floor(Math.random()*256);return [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');}
  function electionBallotCount(e){const meta=readElectionBallotMeta(e?.id);return meta.corrupt?null:Number(meta.count)||0;}
  function electionBallotCountLabel(e){const count=electionBallotCount(e);return count===null?'Data damaged':String(count);}
  function electionStructureEditable(e) { const count=electionBallotCount(e);return !!e&&!e.recoveryError&&Number.isSafeInteger(count)&&Array.isArray(e.positions)&&(e.status==='draft'||e.status==='closed'&&count===0); }
  function electionTransitionAllowed(e,next,now=Date.now()) {
    if(!e||!['draft','open','closed','published'].includes(next)||!['draft','open','closed','published'].includes(e.status))return false;
    if(next===e.status)return true;
    if(e.status==='published')return false;
    if(next==='published')return e.status==='closed';
    if(next==='closed')return e.status==='open';
    if(next==='open'){
      if(!['draft','closed'].includes(e.status)||!Array.isArray(e.positions)||!e.positions.length||e.positions.some(pos=>!pos.name?.trim()||!Array.isArray(pos.candidates)||!pos.candidates.length))return false;
      const closes=schoolDateTimeMillis(e.closeAt);
      return Number.isFinite(closes)&&closes>now;
    }
    return false;
  }
  function renderElectionSettings(e) {
    if(!isAdmin()) return `<div class="panel empty-state"><strong>Election settings are restricted</strong><p>Only administrators can configure school elections.</p></div>`;
    if(!e) return `<div class="panel empty-state"><strong>No election created</strong><p>Create an election to configure positions and candidates.</p></div>`;
    const structureEditable=electionStructureEditable(e);
    const configurationLocked=!structureEditable;
    const lockAttribute=configurationLocked?'readonly':'';
    const structureLockMessage=e.status==='open'?'Close voting before editing the ballot.':e.status==='published'?'Final results are published. Clear ballots while keeping candidates to edit and reuse this election.':electionBallotCount(e)>0?'This election has recorded ballots. Clear ballots while keeping candidates before editing positions or candidates.':'Edit positions and candidates while the election is in Draft or Closed with no ballots.';
    const canOpen=e.status!=='open'&&electionTransitionAllowed(e,'open');
    const canClose=electionTransitionAllowed(e,'closed')&&e.status==='open';
    const canPublish=e.status==='closed'&&electionTransitionAllowed(e,'published');
    return `<div class="settings-grid"><section class="settings-card"><h3>${esc(e.title)}</h3><p>Dates are the automatic fallback window. <strong>Open voting</strong> and <strong>Close voting</strong> are the authoritative manual controls; opening manually overrides the start date, while the closing date remains the automatic stop unless you close earlier.</p><form data-form="election-settings" data-id="${e.id}"><div class="form-grid"><div class="form-field full"><label>Election title</label><input class="field" name="title" required value="${esc(e.title)}" ${lockAttribute}></div><div class="form-field"><label>Voting opens (IST)</label><input class="field" type="datetime-local" name="openAt" value="${esc(e.openAt)}" ${lockAttribute}></div><div class="form-field"><label>Voting closes (IST)</label><input class="field" type="datetime-local" name="closeAt" value="${esc(e.closeAt)}" ${lockAttribute}></div><div class="form-field"><label>Current status</label><div class="year-pill">${esc(e.status.toUpperCase())}</div><input type="hidden" name="status" value="${esc(e.status)}"></div><div class="form-field full"><label class="check-tile"><input type="checkbox" name="showLive" ${e.showLive?'checked':''}> Show live aggregate results during voting</label><label class="check-tile"><input type="checkbox" name="allowAbstain" ${e.allowAbstain?'checked':''} ${configurationLocked?'disabled':''}> Allow abstaining for individual positions</label></div></div><div class="form-actions"><button class="btn btn-primary" ${configurationLocked?'disabled':''}>Save election settings</button></div></form></section><section class="settings-card"><h3>Voting controls</h3><p>Open or close the ballot, then copy the standalone voting and live-results links.</p><div class="info-box">${badge(e.status==='open'?'Voting open':e.status==='published'?'Published':e.status==='closed'?'Closed':'Draft',e.status==='open'?'open':e.status==='published'?'open':e.status==='closed'?'closed':'draft')}<p>Automatic window: ${formatTime(e.openAt)} – ${formatTime(e.closeAt)}</p><p>Recorded ballots: ${electionBallotCountLabel(e)}</p>${configurationLocked?`<p class="subtle-note">${esc(structureLockMessage)}</p>`:''}</div><div class="form-actions" style="justify-content:flex-start"><button class="btn btn-secondary" data-action="election-toggle" data-status="open" data-id="${e.id}" ${canOpen?'':'disabled'}>Open voting</button><button class="btn btn-quiet" data-action="election-toggle" data-status="closed" data-id="${e.id}" ${canClose?'':'disabled'}>Close voting</button><button class="btn btn-primary" data-action="election-toggle" data-status="published" data-id="${e.id}" ${canPublish?'':'disabled'}>Publish final results</button></div><div class="warning-box"><strong>Election access note:</strong> Anyone holding the voting link can open the poll. Election settings and anonymous ballots are stored separately in this browser; tabs on the same local-server origin can share ballot data. Voter eligibility verification and cross-device deployment require the protected server phase.</div><div class="form-actions" style="justify-content:flex-start"><button class="btn btn-primary" data-action="election-copy-vote-link" data-id="${e.id}">Copy voting link</button><button class="btn btn-secondary" data-action="election-open-vote-link" data-id="${e.id}">Open voting page ↗</button><button class="btn btn-quiet" data-action="election-copy-live-link" data-id="${e.id}">Copy live-results link</button><button class="btn btn-quiet" data-action="election-open-live-link" data-id="${e.id}">Open live results ↗</button></div><div class="election-reset-actions"><h4>Reset this election</h4><p>Clear ballots and keep all positions/candidates, or remove the complete election and its candidate list.</p><div class="form-actions"><button type="button" class="btn btn-secondary" data-action="election-reset-ballots" data-id="${e.id}">Clear ballots · keep candidates</button><button type="button" class="btn btn-danger" data-action="election-reset-full" data-id="${e.id}">Reset full election</button></div></div></section></div>
      <div class="section-title-row"><div><h2>Positions & candidates</h2><p>${esc(structureEditable?'Edit position names and candidate details here. Changes are saved before voting opens.':structureLockMessage)}</p></div>${structureEditable?btn('+ Add position','position-add','btn btn-secondary','data-id="'+e.id+'"'):badge('Structure locked','closed')}</div>
      <form data-form="election-structure" data-id="${e.id}" id="election-structure-form">${e.positions.map(pos=>`<section class="position-card" data-position-editor="${pos.id}"><div class="form-grid"><div class="form-field"><label>Position name</label><input class="field" name="positionName-${pos.id}" maxlength="80" value="${esc(pos.name)}" ${structureEditable?'':'disabled'}></div><div class="form-field"><label>Candidate count</label><div class="year-pill">${pos.candidates.length}</div></div></div>${pos.candidates.map(c=>`<div class="candidate-row"><span><strong>${esc(c.name)}</strong><small class="table-subline">${esc(c.classLabel||'Candidate')}${c.details?` · ${esc(c.details)}`:''}</small></span>${structureEditable?btn('Edit candidate','candidate-edit','table-action',`data-election="${e.id}" data-position="${pos.id}" data-candidate="${c.id}"`)+btn('Remove','candidate-remove','table-action danger',`data-election="${e.id}" data-position="${pos.id}" data-candidate="${c.id}"`):''}</div>`).join('')||'<p class="subtle-note">No candidates added.</p>'}${structureEditable?btn('+ Add candidate','position-candidate-add','btn btn-quiet btn-small',`data-election="${e.id}" data-position="${pos.id}"`)+btn('Remove position','position-remove','table-action danger',`data-election="${e.id}" data-position="${pos.id}"`):''}</section>`).join('')||'<div class="panel empty-state">Add the first position to start building the ballot.</div>'}${structureEditable?`<div class="form-actions"><button class="btn btn-primary">Save position names</button></div>`:''}</form>`;
  }
  function renderAdmin() {
    const activeStudents=db.students.filter(student=>student.active);
    const activeProgrammes=db.programmes.filter(programme=>!programme.archived);
    const currentRegistrations=db.registrations.filter(registration=>{const student=studentById(registration.studentId),programme=programmeById(registration.programmeId);return !!student?.active&&!!programme&&!programme.archived;});
    const missingSection=activeStudents.filter(student=>!String(student.section||'').trim()||String(student.section).toLowerCase()==='unsectioned').length;
    const missingHouse=activeStudents.filter(student=>!String(student.house||'').trim()).length;
    const missingTeachers=classes.reduce((total,classNo)=>total+sectionsForClass(classNo).filter(section=>!assignedTeacherFor(classNo,section)).length,0);
    const groupCounts={
      students:activeStudents.length,
      movement:activeStudents.length,
      incomplete:missingSection+missingHouse,
      'class-teachers':missingTeachers,
      houses:missingHouse,
      admins:roleCountsForAdmin('admin'),
      teachers:roleCountsForAdmin('teacher'),
      parents:roleCountsForAdmin('parent'),
      programmes:activeProgrammes.length,
      registrations:currentRegistrations.length,
      rules:categoryBands().length,
      windows:activeProgrammes.length,
      events:db.events.length,
      elections:electionDb.elections.length,
      school:null,
      data:db.students.length,
      audit:db.audit.length
    };
    const groups=[
      {label:'Students & classes',items:[['students','Student register'],['movement','Promotion & movement'],['incomplete','Needs attention'],['class-teachers','Class teachers'],['houses','House allocation']]},
      {label:'People & access',items:[['admins','Administrators'],['teachers','Teachers'],['parents','Parents & guardians']]},
      {label:'Programmes',items:[['programmes','Programme catalogue'],['registrations','Registrations'],['rules','Categories & limits'],['windows','Registration dates']]},
      {label:'School operations',items:[['events','Events & notices'],['elections','School elections'],['school','School settings']]},
      {label:'Records',items:[['data','Import & backup'],['audit','Activity log']]}
    ];
    let content='';
    switch(state.adminTab){
      case 'students':content=adminStudents();break;case 'movement':content=adminStudentMovement();break;case 'incomplete':content=adminIncomplete();break;
      case 'admins':content=adminStaff('admin');break;case 'teachers':content=adminStaff('teacher');break;case 'parents':content=adminStaff('parent');break;
      case 'class-teachers':content=adminClassTeachers();break;case 'houses':content=adminHouses();break;case 'programmes':content=adminProgrammes();break;
      case 'registrations':content=adminRegistrations();break;case 'rules':content=adminRules();break;case 'windows':content=adminWindows();break;
      case 'events':content=adminEvents();break;case 'school':content=adminSchool();break;case 'elections':content=adminElections();break;
      case 'data':content=adminData();break;case 'audit':content=adminAudit();break;default:state.adminTab='overview';content=adminOverview();
    }
    const labels={overview:'Overview',students:'Student register',movement:'Promotion & movement',incomplete:'Needs attention','class-teachers':'Class teachers',houses:'House allocation',admins:'Administrators',teachers:'Teachers',parents:'Parents & guardians',programmes:'Programme catalogue',registrations:'Registrations',rules:'Categories & limits',windows:'Registration dates',events:'Events & notices',elections:'School elections',school:'School settings',data:'Import & backup',audit:'Activity log'};
    const overviewButton=`<button class="admin-link admin-overview-link ${state.adminTab==='overview'?'active':''}" data-action="admin-tab" data-tab="overview" data-admin-nav-item="overview" ${state.adminTab==='overview'?'aria-current="page"':''}><span>Overview</span><small>School summary</small></button>`;
    const groupMarkup=groups.map(group=>`<section class="admin-nav-group" data-admin-nav-group aria-label="${esc(group.label)}"><h2>${esc(group.label)}</h2>${group.items.map(([id,label])=>{const count=groupCounts[id];return `<button class="admin-link ${state.adminTab===id?'active':''}" data-action="admin-tab" data-tab="${id}" data-admin-nav-item="${id}" ${state.adminTab===id?'aria-current="page"':''}><span>${esc(label)}</span>${Number.isFinite(count)?`<small class="admin-nav-count">${count}</small>`:''}</button>`;}).join('')}</section>`).join('');
    const mobileOptions=`<option value="overview" ${state.adminTab==='overview'?'selected':''}>Overview</option>${groups.map(group=>`<optgroup label="${esc(group.label)}">${group.items.map(([id,label])=>`<option value="${id}" ${state.adminTab===id?'selected':''}>${esc(label)}</option>`).join('')}</optgroup>`).join('')}`;
    return `<div class="admin-workspace admin-workspace-v2">
      <aside class="admin-section-nav" id="admin-section-nav" aria-label="Administration navigation">
        <button class="admin-back-portal" type="button" data-action="admin-back-to-portal" aria-label="Exit administration and return to portal overview"><svg class="ui-icon" aria-hidden="true"><use href="#icon-house"></use></svg><span>Back to Portal</span></button>
        <div class="admin-nav-brand"><span class="admin-nav-brand-mark">A</span><div><strong>Administration</strong><small>School workspace</small></div><button class="icon-button admin-nav-close" id="admin-nav-close" type="button" aria-label="Close administration navigation"><svg class="ui-icon" aria-hidden="true"><use href="#icon-close"></use></svg></button></div>
        <label class="admin-nav-search"><span aria-hidden="true">⌕</span><input id="admin-nav-search" type="search" placeholder="Find a section" aria-label="Find an administration section"></label>
        <nav class="admin-nav-list" aria-label="Management areas">${overviewButton}${groupMarkup}</nav>
        <p class="admin-nav-empty" id="admin-nav-empty" hidden>No matching sections.</p>
        <div class="admin-nav-footer"><span class="admin-status-dot"></span><span>Local workspace</span><small>${esc(db.settings.academicYear||'Academic year not set')}</small></div>
      </aside>
      <main class="admin-content admin-content-v2">
        <div class="admin-mobile-nav"><label for="admin-mobile-tab">Administration area</label><select id="admin-mobile-tab">${mobileOptions}</select></div>
        <div class="admin-workspace-context"><div><span>School workspace</span><b>/</b><strong>Administration</strong><b>/</b><span>${esc(labels[state.adminTab]||'Overview')}</span></div><span class="admin-context-year">${esc(db.settings.academicYear||'Academic year not set')}</span></div>
        <div class="admin-content-body">${content}</div>
      </main>
    </div>`;
  }
  function adminOverview() {
    const activeStudents=db.students.filter(student=>student.active);
    const activeUsers=db.users.filter(user=>user.active);
    const activeProgrammes=db.programmes.filter(programme=>!programme.archived);
    const currentRegistrations=db.registrations.filter(registration=>{const student=studentById(registration.studentId),programme=programmeById(registration.programmeId);return !!student?.active&&!!programme&&!programme.archived;});
    const publishedEvents=db.events.filter(event=>event.published);
    const unsectioned=activeStudents.filter(student=>!String(student.section||'').trim()||String(student.section).toLowerCase()==='unsectioned').length;
    const noHouse=activeStudents.filter(student=>!String(student.house||'').trim()).length;
    const missingDetails=activeStudents.filter(student=>!String(student.dob||'').trim()||!student.gender||student.gender==='Not specified').length;
    const missingTeachers=classes.reduce((total,classNo)=>total+sectionsForClass(classNo).filter(section=>!assignedTeacherFor(classNo,section)).length,0);
    const areaRows=['Arts','Sports','Group Item'].map(area=>({area,count:currentRegistrations.filter(registration=>{const programme=programmeById(registration.programmeId);return programme&&programme.category!=='Group Item'&&programme.area===area||programme?.category==='Group Item'&&area==='Group Item';}).length}));
    const maxArea=Math.max(1,...areaRows.map(row=>row.count));
    const recent=db.audit.slice(-6).reverse();
    const tasks=[
      ['students','Student register','Find, add or update student records'],
      ['movement','Promotion & movement','Move students or promote a class'],
      ['programmes','Programme catalogue','Maintain Arts, Sports and Group Items'],
      ['registrations','Registrations','Review student programme entries'],
      ['windows','Registration dates','Set opening and closing dates'],
      ['data','Import & backup','Import records or save a backup']
    ];
    const rules=[
      ['Categories',categoryBands().map(b=>`${esc(b.name)} · Classes ${b.minClass}–${b.maxClass}`).join('  /  ')],
      ['Arts limits',`${db.settings.maxArtsOnstage??3} onstage · ${db.settings.maxArtsOffstage??3} offstage`],
      ['Sports limit',`${db.settings.maxSports??3} per student`],
      ['Group Item limit',`${db.settings.maxGroup} per student`]
    ];
    const attention=[
      ['Students without a section',unsectioned,'incomplete'],
      ['Students without a house',noHouse,'incomplete'],
      ['Sections without a class teacher',missingTeachers,'class-teachers'],
      ['Student details to review',missingDetails,'incomplete']
    ].filter(item=>item[1]>0);
    return `<section class="admin-overview admin-overview-v2">
      <header class="admin-overview-lead">
        <div><p class="admin-overview-kicker">SCHOOL OPERATIONS</p><h1>Administration</h1><p>Manage the school register, people, programmes and day-to-day operations.</p></div>
        <div class="admin-overview-year"><span>ACADEMIC YEAR</span><strong>${esc(db.settings.academicYear||'Not set')}</strong><small>Local working copy</small></div>
        <span class="admin-hero-light" aria-hidden="true"></span>
      </header>
      <div class="admin-stats-strip" aria-label="School summary">
        <div><span>Active students</span><strong>${activeStudents.length}</strong><small>In the register</small></div>
        <div><span>Active programmes</span><strong>${activeProgrammes.length}</strong><small>Available catalogue</small></div>
        <div><span>Registrations</span><strong>${currentRegistrations.length}</strong><small>Active entries</small></div>
        <div><span>Published events</span><strong>${publishedEvents.length}</strong><small>Visible to the school</small></div>
      </div>
      <div class="admin-overview-grid">
        <section class="admin-home-card admin-home-performance">
          <header class="admin-home-card-head"><div><p class="admin-section-kicker">PARTICIPATION</p><h2>Registrations by area</h2><p>Current programme entries, grouped by activity type.</p></div><span class="admin-data-total">${currentRegistrations.length} total</span></header>
          <div class="admin-area-bars">${areaRows.map(row=>`<div class="admin-area-row"><div><strong>${esc(row.area)}</strong><span>${row.count}</span></div><div class="admin-area-track"><i style="width:${Math.round(row.count/maxArea*100)}%"></i></div></div>`).join('')}</div>
          <div class="admin-performance-foot"><span>${activeStudents.length} active students</span><span>${activeUsers.length} active accounts</span></div>
        </section>
        <section class="admin-home-card admin-home-attention">
          <header class="admin-home-card-head"><div><p class="admin-section-kicker">FOLLOW UP</p><h2>Needs attention</h2><p>${attention.length?`${attention.length} areas need review.`:'No outstanding checks detected.'}</p></div><strong class="admin-attention-total">${attention.reduce((sum,item)=>sum+item[1],0)}</strong></header>
          <div class="admin-attention-list">${attention.map(([title,count,tab])=>`<button data-action="admin-tab" data-tab="${tab}"><span>${esc(title)}</span><b>${count}</b><i aria-hidden="true">↗</i></button>`).join('')||'<p class="admin-clear-state">All current checks are clear.</p>'}</div>
        </section>
      </div>
      <div class="admin-overview-grid admin-overview-lower">
        <section class="admin-home-card admin-home-quick"><header class="admin-home-card-head"><div><p class="admin-section-kicker">SHORTCUTS</p><h2>Common tasks</h2><p>Go straight to a frequently used area.</p></div></header><div class="admin-quick-grid">${tasks.map(([tab,title,desc],index)=>`<button class="admin-quick-action" data-action="admin-tab" data-tab="${tab}"><span class="admin-task-index">0${index+1}</span><span class="admin-quick-copy"><strong>${esc(title)}</strong><small>${esc(desc)}</small></span><span class="admin-quick-arrow" aria-hidden="true">↗</span></button>`).join('')}</div></section>
        <section class="admin-home-card admin-home-recent"><header class="admin-home-card-head"><div><p class="admin-section-kicker">WORKSPACE HISTORY</p><h2>Recent changes</h2><p>Latest recorded administration activity.</p></div><button class="admin-inline-link" data-action="admin-tab" data-tab="audit">View log ↗</button></header><div class="admin-recent-list">${recent.map(entry=>`<div class="admin-recent-item"><span class="admin-recent-mark"></span><div><strong>${esc(String(entry.action||'Activity').replaceAll('_',' '))}</strong><small>${esc(entry.record||'')} · ${esc(entry.actor||'Administrator')}</small></div><time>${esc(formatTime(entry.date))}</time></div>`).join('')||'<p class="admin-clear-state">No changes have been recorded yet.</p>'}</div></section>
      </div>
      <section class="admin-home-card admin-home-rules"><header class="admin-home-card-head"><div><p class="admin-section-kicker">CONFIGURATION</p><h2>Current school rules</h2><p>Eligibility and registration limits currently applied across the portal.</p></div><button class="admin-inline-link" data-action="admin-tab" data-tab="rules">Manage rules ↗</button></header><dl class="admin-rule-list">${rules.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${value}</dd></div>`).join('')}</dl></section>
    </section>`;
  }
  function adminStudents() { return studentBrowserMarkup(true); }
  function roleCountsForAdmin(role){return db.users.filter(user=>user.role===role).length;}
  function adminStaff(role='admin') {
    const roleKey=['admin','teacher','parent'].includes(role)?role:'admin';
    const users=db.users.filter(user=>user.role===roleKey);
    const panelDescription=roleKey==='admin'
      ?'Manage the people who have school-wide administration access. The eventual login and credential system is part of the backend phase.'
      :roleKey==='teacher'
        ?'Manage teacher accounts, assigned sections and additional powers. Access remains active until you remove it.'
        :'Parent accounts will be generated automatically during the future login phase. This directory is for managing existing linked family accounts; manual parent creation is not available.';
    const addLabel=roleKey==='admin'?'Add administrator':'Add teacher';
    const addAction=roleKey==='parent'?'':btn('+ '+addLabel,'staff-add','btn btn-primary',`data-role="${roleKey}"`);
    let content='';
    if(roleKey==='teacher'){
      const rows=users.map(user=>{
        const assigned=Object.entries(db.settings.classTeachers||{}).filter(([,teacherId])=>Number(teacherId)===Number(user.id)).map(([key])=>{const [classNo,section]=key.split('|');return `${ordinalClass(classNo)} ${section}`;});
        const powerLabels=[['viewReports','Reports'],['addStudents','Add students'],['editStudents','Edit students'],['removeStudents','Archive students'],['assignHouses','Assign houses'],['manageSections','Add sections']];
        const powers=powerLabels.filter(([key])=>teacherHasPower(user.id,key)).map(([,label])=>label);
        const permissionText=powers.length?powers.join(' · '):'No additional powers';
        return `<tr><td><strong>${esc(user.displayName)}</strong><small class="table-subline">${assigned.length?assigned.map(esc).join(', '):'No section assigned'}</small></td><td>${user.active?badge('Active','open'):badge('Disabled','closed')}</td><td><div class="permission-summary">${powers.length?powers.map(power=>`<span class="permission-chip">${esc(power)}</span>`).join(''):'<span class="permission-none">No additional powers</span>'}</div></td><td>${btn('Edit','staff-edit','table-action',`data-id="${user.id}"`)}${btn('Manage powers','teacher-manage-powers','table-action',`data-id="${user.id}"`)}${user.active?btn('Disable','staff-disable','table-action danger',`data-id="${user.id}"`):''}</td></tr>`;
      }).join('');
      content=`<div class="table-panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>Teacher / assigned sections</th><th>Status</th><th>Permissions</th><th>Actions</th></tr></thead><tbody>${rows||'<tr><td colspan="4" class="empty-cell">No teacher accounts have been added.</td></tr>'}</tbody></table></div></div>`;
    }else if(roleKey==='parent'){
      const groups=new Map(),unlinked=[];
      for(const user of users){
        const children=(user.linkedStudentIds||[]).map(studentById).filter(st=>st?.active);
        // A linked child's current class is always included, even when an older
        // account has an empty (but valid) classNumbers array.
        const assigned=[...new Set([...(Array.isArray(user.classNumbers)?user.classNumbers:[]),...children.map(st=>st.classNo)].map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=12))].sort((a,b)=>a-b);
        if(!assigned.length){unlinked.push(user);continue;}
        for(const classNo of assigned){if(!groups.has(classNo))groups.set(classNo,[]);groups.get(classNo).push({user,children});}
      }
      const searchValue=String(state.parentAccountQuery||'');
      const groupedMarkup=[...groups.entries()].sort((a,b)=>a[0]-b[0]).map(([classNo,entries])=>{
        entries.sort((a,b)=>String(a.user.displayName||'').localeCompare(String(b.user.displayName||'')));
        const classLabel=`Class ${classNo}`;
        const rows=entries.map(({user,children})=>{
          const childText=children.length?children.map(st=>`${esc(st.name)} · ${ordinalClass(st.classNo)} ${esc(st.section)} · ${esc(st.admissionNo)}`).join('<br>'):'No linked child';
          const searchable=[user.displayName,classLabel,...children.flatMap(st=>[st.name,st.admissionNo,st.classNo,st.section])].join(' ').toLowerCase();
          return `<tr data-parent-row data-parent-search="${esc(searchable)}"><td><strong>${esc(user.displayName)}</strong></td><td>${childText}</td><td>${user.active?badge('Active','open'):badge('Disabled','closed')}</td><td><label class="inline-permission"><input type="checkbox" data-parent-portal-permission data-user="${user.id}" ${user.portalEnabled!==false?'checked':''}><span>Portal enabled</span></label></td><td><div class="table-actions">${btn('Edit','staff-edit','table-action',`data-id="${user.id}"`)}${user.active?btn('Disable','staff-disable','table-action danger',`data-id="${user.id}"`):''}</div></td></tr>`;
        }).join('');
        return `<details class="parent-class-group" data-parent-group><summary class="parent-class-summary"><span class="parent-class-title">${classLabel}</span><span class="parent-class-count">${entries.length} parent account${entries.length===1?'':'s'}</span><span class="parent-class-chevron" aria-hidden="true">+</span></summary><div class="table-panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>Parent / guardian</th><th>Linked child / children</th><th>Status</th><th>Portal access</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div></div></details>`;
      }).join('');
      const unlinkedRows=unlinked.map(user=>`<tr data-parent-row data-parent-search="${esc([user.displayName,'unassigned','unlinked'].join(' ').toLowerCase())}"><td><strong>${esc(user.displayName)}</strong><small class="table-subline">No class assignment or active child linked</small></td><td>${user.active?badge('Active','open'):badge('Disabled','closed')}</td><td><div class="table-actions">${btn('Edit','staff-edit','table-action',`data-id="${user.id}"`)}${user.active?btn('Disable','staff-disable','table-action danger',`data-id="${user.id}"`):''}</div></td></tr>`).join('');
      const unlinkedMarkup=unlinked.length?`<details class="parent-class-group parent-unlinked-group" data-parent-group><summary class="parent-class-summary"><span class="parent-class-title">Unassigned class</span><span class="parent-class-count">${unlinked.length} account${unlinked.length===1?'':'s'}</span><span class="parent-class-chevron" aria-hidden="true">+</span></summary><div class="table-panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>Parent / guardian</th><th>Status</th><th>Actions</th></tr></thead><tbody>${unlinkedRows}</tbody></table></div></div></details>`:'';
      content=`<div class="parent-directory-toolbar"><label class="parent-directory-search"><span>Find parent or student</span><input class="search-field" id="parent-account-search" type="search" placeholder="Search parent name, student name or admission ID" value="${esc(searchValue)}"></label><span class="year-pill">${users.length} parent account${users.length===1?'':'s'}</span></div>${groupedMarkup}${unlinkedMarkup}<p class="subtle-note parent-search-empty" id="parent-search-empty" hidden>No parent accounts match this search.</p>`;
      if(!users.length)content='<div class="empty-state"><strong>No parent accounts yet</strong><p>Parent accounts will appear here when the future login flow creates them automatically from linked student records.</p></div>';
    }else{
      const rows=users.map(user=>`<tr><td><strong>${esc(user.displayName)}</strong></td><td>${user.active?badge('Active','open'):badge('Disabled','closed')}</td><td>Full school administration</td><td>${btn('Edit','staff-edit','table-action',`data-id="${user.id}"`)}${user.active?btn('Disable','staff-disable','table-action danger',`data-id="${user.id}"`):''}</td></tr>`).join('');
      content=`<div class="table-panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>Name</th><th>Status</th><th>Access</th><th>Actions</th></tr></thead><tbody>${rows||'<tr><td colspan="4" class="empty-cell">No administrator accounts have been added.</td></tr>'}</tbody></table></div></div>`;
    }
    const activeCount=users.filter(user=>user.active).length;
    const disabledCount=users.length-activeCount;
    const accountTabs=[['admins','Administrators',roleCountsForAdmin('admin')],['teachers','Teachers',roleCountsForAdmin('teacher')],['parents','Parents & guardians',roleCountsForAdmin('parent')]];
    const accountSwitcher=`<nav class="admin-account-switcher" aria-label="Account directories"><span class="admin-account-switcher-label">ACCOUNT TYPE</span>${accountTabs.map(([tab,label,count])=>`<button class="${roleKey===({admins:'admin',teachers:'teacher',parents:'parent'}[tab])?'active':''}" data-action="admin-tab" data-tab="${tab}"><span>${label}</span><b>${count}</b></button>`).join('')}</nav>`;
    const accountStats=`<div class="admin-account-stats"><div><span>Total accounts</span><strong>${users.length}</strong></div><div><span>Active</span><strong>${activeCount}</strong></div><div><span>Disabled</span><strong>${disabledCount}</strong></div>${roleKey==='teacher'?`<div><span>With additional powers</span><strong>${users.filter(user=>['viewReports','addStudents','editStudents','removeStudents','assignHouses','manageSections'].some(power=>teacherHasPower(user.id,power))).length}</strong></div>`:roleKey==='parent'?`<div><span>Class groups</span><strong>${[...new Set(users.flatMap(user=>[...(Array.isArray(user.classNumbers)?user.classNumbers:[]),...(user.linkedStudentIds||[]).map(id=>studentById(id)?.classNo)].map(Number)).filter(n=>Number.isInteger(n)&&n>=1&&n<=12))].length}</strong></div>`:''}</div>`;
    return `${heading(roleKey==='admin'?'Administrators':roleKey==='teacher'?'Teachers':'Parents & guardians',panelDescription,'PEOPLE & ACCESS',addAction)}${accountStats}${content}`;
  }

  function annualActivityDataCounts() {
    let browserVoterFlags=0;
    browserVoterFlags=storageKeys().filter(key=>key.startsWith('school-poll-voted:')).length;
    return {
      registrations: db.registrations.length,
      ranks: db.results.length,
      sahodaya: db.selections.length,
      ballots: electionDb.elections.every(election=>electionBallotCount(election)!==null)?electionDb.elections.reduce((total,election)=>total+electionBallotCount(election),0):null,
      electionCodes: electionDb.elections.reduce((total,election)=>total+(election.tokens||[]).length,0),
      browserVoterFlags
    };
  }
  function clearAnnualActivityData() {
    const counts=annualActivityDataCounts();
    db.registrations=[];
    db.groupTeams=[];
    db.results=[];
    db.selections=[];
    for(const election of electionDb.elections){
      election.ballots=[];
      election.tokens=[];
      election.usedTokens=[];
      election.status='draft';
      // A fresh key invalidates old voting URLs and per-browser "already voted" flags,
      // including flags held by devices that this local-only portal cannot reach.
      election.publicKey=makePublicKey();
    }
    db.settings.publishResults=false;
    db.settings.publishParticipants=false;
    audit('annual_activity_data_cleared','Annual activity data',`Programme entries ${counts.registrations} · ranks ${counts.ranks} · Sahodaya selections ${counts.sahodaya} · election ballots ${counts.ballots} · election codes ${counts.electionCodes} · local voted flags ${counts.browserVoterFlags}`);
    return counts;
  }
  function clearBrowserVoterFlags(electionId=null, publicKey=null) {
    try{
      const prefix=electionId===null?'school-poll-voted:':`school-poll-voted:${Number(electionId)}:${String(publicKey||'')}`;
      for(const key of storageKeys())if(key.startsWith(prefix))storageRemove(key);
      return true;
    }catch{return false;}
  }
  function performAnnualDataReset() {
    const counts=annualActivityDataCounts();
    // Never allow the reset path to replace an unreadable source database with
    // the temporary demo seed used only to keep the recovery screen renderable.
    if(databaseRecoveryError)return {ok:false,counts,recoveryRequired:true};
    let storageSnapshot;
    try{storageSnapshot=snapshotPortalDataStorage();}catch(error){return {ok:false,counts,storageError:error.message};}
    const previousDatabase=JSON.stringify(db);
    const previousElection=JSON.stringify(electionDb);
    clearAnnualActivityData();
    const rollback=()=>{
      db=JSON.parse(previousDatabase);
      electionDb=JSON.parse(previousElection);
      const restored=restorePortalDataStorage(storageSnapshot);
      syncElectionBallots();
      return restored;
    };
    if(!saveDatabase()||!saveElectionDatabase()){
      const restored=rollback();
      return {ok:false,counts,rollbackFailed:!restored};
    }
    for(const election of electionDb.elections){
      if(!clearElectionBallotChunks(election.id)||!storageSet(electionSummaryKey(election.id),JSON.stringify({acceptedBallots:0,candidateCounts:{}}))){
        const restored=rollback();
        return {ok:false,counts,rollbackFailed:!restored};
      }
    }
    const browserVoterFlagsCleared=clearBrowserVoterFlags();
    if(!browserVoterFlagsCleared){
      const restored=rollback();
      return {ok:false,counts,rollbackFailed:!restored};
    }
    return {ok:true,counts,browserVoterFlagsCleared:true};
  }
  function annualDataResetForm() {
    const counts=annualActivityDataCounts();
    const total=counts.registrations+counts.ranks+counts.sahodaya+(counts.ballots||0)+counts.electionCodes+counts.browserVoterFlags;
    return `<form data-form="annual-data-reset"><div class="warning-box"><strong>This permanently clears this year's activity records.</strong><p>Download a full JSON backup before continuing. This action cannot be undone from the portal.</p></div><div class="report-summary"><div class="report-tile"><strong>${counts.registrations}</strong><small>Programme registrations</small></div><div class="report-tile"><strong>${counts.ranks}</strong><small>School ranks</small></div><div class="report-tile"><strong>${counts.sahodaya}</strong><small>Sahodaya selections</small></div><div class="report-tile"><strong>${counts.ballots===null?'Review required':counts.ballots}</strong><small>Election ballots</small></div><div class="report-tile"><strong>${counts.electionCodes}</strong><small>Legacy token records (not voter codes)</small></div><div class="report-tile"><strong>${counts.browserVoterFlags}</strong><small>This browser's voted flags</small></div></div><p>It also invalidates every existing election link, clears this browser profile's already-voted flags where possible, returns elections to Draft and turns off published results. Old voting links will stop working; create and share new links when reusing the election setup. Voter codes are not issued or verified in this build. Programme and election definitions remain available.</p><p><strong>Kept:</strong> student records and profiles, staff and parent accounts, class/section and house setup, programme catalogue and rules, school settings and branding, events, election positions and candidates, and the audit log.</p><p><strong>Cleared:</strong> programme registrations, school ranks, Sahodaya selections, election ballots and any legacy token records. This version does not maintain separate actual-participation records or issue/verify voter codes.</p><div class="form-field"><label>Type <strong>CLEAR YEAR DATA</strong> to confirm${total===0?' (publication settings and election status will still be reset).':''}</label><input class="field" name="confirmation" autocomplete="off" spellcheck="false" placeholder="CLEAR YEAR DATA" required></div><div class="form-actions"><button class="btn" type="button" data-close-modal>Cancel</button><button class="btn btn-danger">Clear annual activity data</button></div></form>`;
  }
  function adminData() {
    const activeStudents=db.students.filter(student=>student.active).length;
    const archivedStudents=db.students.length-activeStudents;
    const records=db.students.length;
    const activity=annualActivityDataCounts();
    const activityTotal=activity.registrations+activity.ranks+activity.sahodaya+(activity.ballots||0)+activity.electionCodes+activity.browserVoterFlags;
    return `<div class="admin-intro"><h2>Import, export &amp; backup</h2><p>Manage the school records in this browser's local working copy. Back up the data before restoring it or clearing an academic year's activity.</p></div>
      <div class="settings-grid">
        <section class="settings-card"><h3>Student import</h3><p>Import student records from CSV, TSV, JSON or XLSX. Review the preview and validation errors before committing any rows. Blank sections are retained as Unsectioned.</p><div class="form-actions"><button class="btn btn-primary" type="button" data-action="student-import">Choose student file</button></div><input id="student-file" type="file" accept=".csv,.tsv,.txt,.xlsx,.json" hidden><small class="table-subline">Supported: CSV, TSV, TXT, JSON and XLSX. Legacy XLS files are not supported in this offline build; convert them to XLSX or CSV first.</small></section>
        <section class="settings-card"><h3>Full browser backup</h3><p>Download all local portal data, including students, staff, programme records, registrations, results, events and election configuration.</p><div class="form-actions"><button class="btn btn-secondary" type="button" data-action="backup-export">Download JSON backup</button><button class="btn btn-quiet" type="button" data-action="backup-import">Restore JSON backup</button></div><input id="backup-file" type="file" accept=".json,application/json" hidden><small class="table-subline">Restore replaces the current browser data after validation and confirmation. Keep a separate copy of your current backup.</small></section>
        <section class="settings-card"><h3>Export school records</h3><p>Download the programme catalogue, full registration list and activity audit log.</p><div class="form-actions"><button class="btn btn-secondary" type="button" data-action="programme-export">Programmes · CSV</button><button class="btn btn-secondary" type="button" data-action="programme-export-xlsx">Programmes · Excel</button><button class="btn btn-secondary" type="button" data-action="registration-export">Registrations · CSV</button><button class="btn btn-secondary" type="button" data-action="registration-export-xlsx">Registrations · Excel</button><button class="btn btn-quiet" type="button" data-action="audit-export">Audit log · JSON</button></div></section>
        <section class="settings-card"><h3>Prepare for a new school year</h3><p>Clear annual programme registrations and results without rebuilding the school directory or configuring the portal again.</p><div class="report-summary"><div class="report-tile"><strong>${activity.registrations}</strong><small>Programme registrations</small></div><div class="report-tile"><strong>${activity.ranks+activity.sahodaya}</strong><small>Programme outcomes</small></div><div class="report-tile"><strong>${activity.ballots===null?'Review required':activity.ballots}</strong><small>Election ballots</small></div></div><div class="warning-box">This removes programme registrations, school ranks, Sahodaya selections and local election ballots. Voter codes are not issued or verified in this build. Student and setup records stay in place. Back up first.</div><div class="form-actions"><button class="btn btn-danger" type="button" data-action="annual-data-reset">Clear annual registrations &amp; results</button></div><small class="table-subline">${activityTotal} activity records are currently linked to this year's programme and election workflows. Elections return to Draft; their positions and candidates are kept.</small></section>
        <section class="settings-card"><h3>Local data status</h3><div class="report-summary"><div class="report-tile"><strong>${activeStudents}</strong><small>Active students</small></div><div class="report-tile"><strong>${archivedStudents}</strong><small>Archived students</small></div><div class="report-tile"><strong>${records}</strong><small>Total student records</small></div></div><p>Records stay in this browser profile. This is not a shared or server-backed database.</p><div class="warning-box">The demo reset below replaces the entire local working copy with fictional sample data. It is different from the annual activity reset above.</div><div class="form-actions"><button class="btn btn-danger" type="button" data-action="demo-reset">Replace with fictional demo data</button></div></section>
      </div>`;
  }

  function adminIncomplete() {
    const unsectioned=db.students.filter(st=>st.active&&(!String(st.section||'').trim()||st.section==='Unsectioned')).sort((a,b)=>a.classNo-b.classNo||a.name.localeCompare(b.name));
    const missingTeachers=classes.flatMap(classNo=>sections.filter(section=>!assignedTeacherFor(classNo,section)).map(section=>({classNo,section})));
    const noHouse=db.students.filter(st=>st.active&&!st.house).sort((a,b)=>a.classNo-b.classNo||String(a.section).localeCompare(String(b.section))||a.name.localeCompare(b.name));
    const missingDetails=db.students.filter(st=>st.active&&(!String(st.dob||'').trim()||!st.gender||st.gender==='Not specified')).sort((a,b)=>a.classNo-b.classNo||a.name.localeCompare(b.name));
    const unlinkedParents=db.users.filter(user=>user.role==='parent'&&!(user.linkedStudentIds||[]).some(id=>studentById(id)?.active));
    const studentRows=unsectioned.map(st=>`<tr><td>${studentCell(st)}</td><td>${ordinalClass(st.classNo)}</td><td>${esc(st.admissionNo)}</td><td>${btn('Assign section / edit','student-edit','table-action',`data-id="${st.id}"`)}</td></tr>`).join('');
    const teacherRows=missingTeachers.map(pair=>`<tr><td>${ordinalClass(pair.classNo)}</td><td>${esc(pair.section)}</td><td>${badge('No class teacher','closed')}</td></tr>`).join('');
    const houseRows=noHouse.slice(0,100).map(st=>`<tr><td>${studentCell(st)}</td><td>${ordinalClass(st.classNo)} ${esc(st.section)}</td><td>${badge('No house','closed')}</td></tr>`).join('');
    const detailRows=missingDetails.slice(0,100).map(st=>{const missing=[!String(st.dob||'').trim()?'Date of birth':'',(!st.gender||st.gender==='Not specified')?'Gender not specified':''].filter(Boolean).join(', ');return `<tr><td>${studentCell(st)}</td><td>${ordinalClass(st.classNo)} ${esc(st.section)}</td><td>${esc(missing)}</td><td>${btn('Edit details','student-edit','table-action',`data-id="${st.id}"`)}</td></tr>`;}).join('');
    const parentRows=unlinkedParents.map(user=>`<tr><td><strong>${esc(user.displayName)}</strong></td><td>${badge('No active child linked','closed')}</td><td>${btn('Edit','staff-edit','table-action',`data-id="${user.id}"`)}</td></tr>`).join('');
    const total=unsectioned.length+missingTeachers.length+noHouse.length+missingDetails.length+unlinkedParents.length;
    return `<div class="admin-intro"><h2>Needs attention</h2><p>Blank or unassigned fields stay visible here instead of making valid student records disappear. Use this page as a cleanup list.</p></div><div class="metric-grid"><article class="metric-card"><div class="metric-head">Students without sections</div><div class="metric-value">${unsectioned.length}</div><div class="metric-note">Imported as Unsectioned</div></article><article class="metric-card"><div class="metric-head">Sections without teachers</div><div class="metric-value">${missingTeachers.length}</div><div class="metric-note">Optional assignments</div></article><article class="metric-card"><div class="metric-head">Students without houses</div><div class="metric-value">${noHouse.length}</div><div class="metric-note">House allocation pending</div></article><article class="metric-card"><div class="metric-head">Missing optional details</div><div class="metric-value">${missingDetails.length}</div><div class="metric-note">DOB or gender not specified</div></article><article class="metric-card"><div class="metric-head">Parents without linked children</div><div class="metric-value">${unlinkedParents.length}</div><div class="metric-note">Account needs review</div></article></div>${total?`<div class="settings-grid"><section class="settings-card"><h3>Students needing a section</h3><p>These records were kept and assigned to the Unsectioned group.</p><div class="table-panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>Student</th><th>Class</th><th>Admission ID</th><th>Action</th></tr></thead><tbody>${studentRows||'<tr><td colspan="4">None</td></tr>'}</tbody></table></div></div></section><section class="settings-card"><h3>Sections without a class teacher</h3><p>Class teacher assignment is optional, but these blanks are listed for review.</p><div class="table-panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>Class</th><th>Section</th><th>Status</th></tr></thead><tbody>${teacherRows||'<tr><td colspan="3">None</td></tr>'}</tbody></table></div></div><div class="form-actions"><button class="btn btn-secondary" data-action="admin-tab" data-tab="class-teachers">Assign class teachers</button></div></section><section class="settings-card"><h3>Students without a house</h3><p>Showing up to 100 records. House allocation remains a separate task.</p><div class="table-panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>Student</th><th>Class / section</th><th>Status</th></tr></thead><tbody>${houseRows||'<tr><td colspan="3">None</td></tr>'}</tbody></table></div></div><div class="form-actions"><button class="btn btn-secondary" data-action="admin-tab" data-tab="houses">Open house assignment</button></div></section><section class="settings-card"><h3>Students with missing optional details</h3><p>Showing up to 100 records with no date of birth or an unspecified gender. These fields can remain blank when the school does not collect them.</p><div class="table-panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>Student</th><th>Class / section</th><th>Missing details</th><th>Action</th></tr></thead><tbody>${detailRows||'<tr><td colspan="4">None</td></tr>'}</tbody></table></div></div></section><section class="settings-card"><h3>Parent accounts without active children</h3><p>Review or relink the family account.</p><div class="table-panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>Parent</th><th>Status</th><th>Action</th></tr></thead><tbody>${parentRows||'<tr><td colspan="3">None</td></tr>'}</tbody></table></div></div><div class="form-actions"><button class="btn btn-secondary" data-action="admin-tab" data-tab="parents">Open parent accounts</button></div></section></div>`:'<div class="panel empty-state"><strong>All caught up</strong><p>No blank section, teacher, house, optional student-detail or parent-child fields need attention.</p></div>'}`;
  }
  function adminClassTeachers() {
    const allPairs=classes.flatMap(classNo=>sectionsForClass(classNo).map(section=>({classNo,section,key:classSectionKey(classNo,section)})));
    const assigned=allPairs.filter(pair=>db.settings.classTeachers?.[pair.key]&&db.users.some(u=>u.id===Number(db.settings.classTeachers[pair.key])&&u.active&&u.role==='teacher'));
    const unassigned=allPairs.filter(pair=>!db.settings.classTeachers?.[pair.key]||!db.users.some(u=>u.id===Number(db.settings.classTeachers[pair.key])&&u.active&&u.role==='teacher'));
    const activeTeachers=db.users.filter(u=>u.active&&u.role==='teacher');
    const openClass=Number(state.classTeacherClass);
    const classSummary=Object.fromEntries(classes.map(classNo=>{const rows=allPairs.filter(p=>p.classNo===classNo);const count=rows.filter(p=>assigned.includes(p)).length;return [classNo,{count,total:rows.length}];}));
    const classRows=`<div class="class-list class-teacher-list">${classes.map(classNo=>{const info=classSummary[classNo];const status=info.count===0?'Unassigned':info.count===info.total?'Assigned':'Partly assigned';return `<div class="class-row-block"><button class="class-row class-teacher-class-row ${openClass===classNo?'expanded':''}" data-action="class-teacher-expand" data-class="${classNo}" aria-expanded="${openClass===classNo}"><span class="class-row-index">${ordinalClass(classNo)}</span><span class="class-row-name"><strong>Class ${classNo}</strong><small>Open to assign class teachers</small></span><span class="class-row-meta"><strong>${info.count}/${info.total}</strong><small>Sections assigned</small></span><span class="class-row-section-count">${status}</span><span class="class-row-chevron">${openClass===classNo?'−':'+'}</span></button>${openClass===classNo?`<div class="class-section-assignments">${allPairs.filter(p=>p.classNo===classNo).map(pair=>{const teacher=assignedTeacherFor(pair.classNo,pair.section);return `<div class="class-section-assignment"><strong>${ordinalClass(pair.classNo)} ${esc(pair.section)}</strong><span>${teacher?esc(teacher.displayName):'<span class="unassigned-label">Not assigned</span>'}</span><select class="filter-select class-teacher-select" data-class-teacher data-class="${pair.classNo}" data-section="${esc(pair.section)}" aria-label="Class teacher for ${ordinalClass(pair.classNo)} ${esc(pair.section)}"><option value="">Unassigned</option>${selectOptions(activeTeachers.map(u=>({value:u.id,label:u.displayName})),teacher?.id||'')}</select></div>`;}).join('')}</div>`:''}</div>`;}).join('')}</div>`;
    return `<div class="section-title-row" style="margin-top:0"><div><h2>Class teachers</h2><p>Each section can have one class teacher. Assignments are optional; unassigned sections remain visible for follow-up.</p></div></div><div class="report-summary"><div class="report-tile"><strong>${assigned.length}</strong><small>Assigned sections</small></div><div class="report-tile"><strong>${unassigned.length}</strong><small>Unassigned sections</small></div><div class="report-tile"><strong>${activeTeachers.length}</strong><small>Active teachers</small></div></div><div class="settings-grid class-teacher-summary"><section class="settings-card"><h3>Classes with assignments</h3><p>${classes.filter(c=>classSummary[c].count>0).map(ordinalClass).join(', ')||'None yet'}</p></section><section class="settings-card"><h3>Classes without assignments</h3><p>${classes.filter(c=>classSummary[c].count===0).map(ordinalClass).join(', ')||'None'}</p></section></div>${classRows}<div class="info-box">Choose a class row to view its sections. Assign a teacher separately for each section. A teacher can be assigned to several sections; one section has one class teacher. This does not assign programmes to teachers.</div>`;
  }
  function houseClassPairsForCurrentUser(adminMode=true) {
    if (adminMode) return classes.flatMap(classNo => sectionsForClass(classNo).map(section => ({classNo,section})));
    return teacherClassSections();
  }
  function houseStudentsForPair(classNo, section) {
    return db.students.filter(st => st.active && Number(st.classNo)===Number(classNo) && String(st.section)===String(section))
      .sort((a,b)=>String(a.admissionNo).localeCompare(String(b.admissionNo),undefined,{numeric:true,sensitivity:'base'}) || String(a.name).localeCompare(String(b.name),undefined,{sensitivity:'base'}));
  }
  function houseUnassignedCount(classNo, section=null) {
    return db.students.filter(st=>st.active&&!st.house&&Number(st.classNo)===Number(classNo)&&(!section||String(st.section)===String(section))).length;
  }
  function houseNavigatorMarkup(pairs, adminMode) {
    const classList=[...new Set(pairs.map(p=>Number(p.classNo)))].sort((a,b)=>a-b);
    return `<div class="house-class-navigator"><div class="house-navigator-heading"><h3>House assignment progress</h3><p>Unassigned students are shown by class and section.</p></div>${classList.map(classNo=>{
      const sectionsForThisClass=pairs.filter(p=>Number(p.classNo)===classNo);
      const total=sectionsForThisClass.reduce((sum,p)=>sum+houseStudentsForPair(p.classNo,p.section).length,0);
      const blank=sectionsForThisClass.reduce((sum,p)=>sum+houseUnassignedCount(p.classNo,p.section),0);
      const isOpen=Number(state.houseBrowser.classNo)===classNo;
      return `<div class="house-class-group"><button type="button" class="house-class-row ${isOpen?'active':''}" data-action="house-class-expand" data-class="${classNo}"><span class="house-class-ordinal">${ordinalClass(classNo)}</span><span class="house-class-copy"><strong>Class ${classNo}</strong><small>${sectionsForThisClass.length} sections · ${total} students</small></span><span class="house-unassigned-count ${blank===0?'complete':''}">${blank} unassigned</span><span class="house-chevron">${isOpen?'−':'+'}</span></button>${isOpen?`<div class="house-section-list">${sectionsForThisClass.map(pair=>{const selected=Number(state.houseBrowser.classNo)===Number(pair.classNo)&&String(state.houseBrowser.section)===String(pair.section);const students=houseStudentsForPair(pair.classNo,pair.section);const missing=students.filter(st=>!st.house).length;return `<button type="button" class="house-section-row ${selected?'selected':''}" data-action="house-section-select" data-class="${pair.classNo}" data-section="${esc(pair.section)}"><span>${ordinalClass(pair.classNo)} ${esc(pair.section)}</span><small>${students.length} students</small><b class="${missing===0?'complete':''}">${missing} blank</b></button>`;}).join('')}</div>`:''}</div>`;
    }).join('')||'<div class="empty-state">No class sections are assigned to this account.</div>'}</div>`;
  }
  function houseRosterTable(classNo, section, students, adminMode) {
    if (!students.length) return '<div class="empty-state">No active students are listed in this section.</div>';
    return `<div class="table-panel house-roster-panel"><div class="table-wrap"><table class="data-table house-roster-table"><thead><tr>${adminMode?'<th class="select-col">Select</th>':''}<th>Roll</th><th>Student</th><th>Admission ID</th><th>House</th>${adminMode?'<th>Current status</th>':''}</tr></thead><tbody>${students.map((st,index)=>`<tr><td class="select-col">${adminMode?`<input type="checkbox" data-action="house-select-student" data-id="${st.id}" ${state.houseSelectedStudentIds.includes(st.id)?'checked':''} aria-label="Select ${esc(st.name)}">`:`${index+1}`}</td>${adminMode?`<td>${index+1}</td>`:''}<td><strong>${esc(st.name)}</strong></td><td>${esc(st.admissionNo)}</td><td>${adminMode?`<span class="house-current-value ${st.house?'assigned':'unassigned'}">${esc(st.house||'Unassigned')}</span>`:`<select class="field house-inline-select" data-teacher-house-student data-id="${st.id}" aria-label="House for ${esc(st.name)}">${selectOptions(db.settings.houseNames||[],st.house||'','Not assigned')}</select>`}</td>${adminMode?`<td>${st.house?badge('Assigned','open'):badge('Unassigned','closed')}</td>`:''}</tr>`).join('')}</tbody></table></div></div>`;
  }
  function housePrintSheet(classNo, section, students) {
    const names=db.settings.houseNames||[];
    return `<div class="house-print-sheet" id="house-print-sheet"><div class="print-school-name">${esc(db.settings.schoolName)}</div><h1>House assignment sheet</h1><p>${ordinalClass(classNo)} ${esc(section)} · ${esc(db.settings.academicYear)}</p><table><thead><tr><th>Roll</th><th>Student name</th><th>Admission ID</th>${names.map(n=>`<th>${esc(n)}</th>`).join('')}</tr></thead><tbody>${students.map((st,i)=>`<tr><td>${i+1}</td><td>${esc(st.name)}</td><td>${esc(st.admissionNo)}</td>${names.map(()=>'<td class="print-house-box">□</td>').join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function adminHouses() {
    const names=db.settings.houseNames||[];
    const totals=names.map(name=>({name,count:db.students.filter(st=>st.active&&st.house===name).length}));
    const unassigned=db.students.filter(st=>st.active&&!st.house).length;
    const pairs=houseClassPairsForCurrentUser(true);
    if (state.houseBrowser.classNo && state.houseBrowser.section && !pairs.some(p=>p.classNo===Number(state.houseBrowser.classNo)&&p.section===state.houseBrowser.section)) {
      state.houseBrowser={classNo:null,section:null};
    }
    const students=state.houseBrowser.section?houseStudentsForPair(state.houseBrowser.classNo,state.houseBrowser.section):[];
    const selectedVisible=students.filter(st=>state.houseSelectedStudentIds.includes(st.id)).length;
    const navigator=houseNavigatorMarkup(pairs,true);
    const workbench=state.houseBrowser.section?`<div class="house-workbench-heading"><div><p class="eyebrow">MASS HOUSE ASSIGNMENT</p><h3>${ordinalClass(state.houseBrowser.classNo)} ${esc(state.houseBrowser.section)}</h3><p>${students.length} students · ${students.filter(st=>!st.house).length} currently unassigned</p></div><button type="button" class="btn btn-secondary" data-action="print-house-sheet">Print blank house sheet</button></div><div class="house-bulk-toolbar"><label class="house-select-all"><input type="checkbox" data-action="house-select-all" ${students.length&&selectedVisible===students.length?'checked':''}><span>Select all students in this section</span></label><span class="house-selected-count">${selectedVisible} selected</span><div class="house-apply-controls"><select class="field" id="house-apply-name">${selectOptions(names,'','Choose house')}</select><button type="button" class="btn btn-primary" data-action="house-apply-selected" ${selectedVisible?'':'disabled'}>Apply to selected</button></div></div><p class="subtle-note">Tick individual students, select everyone, or shift-click to select a continuous roll range. Applying a house can also reassign students who already have one.</p>${houseRosterTable(state.houseBrowser.classNo,state.houseBrowser.section,students,true)}${housePrintSheet(state.houseBrowser.classNo,state.houseBrowser.section,students)}`:`<div class="empty-state">Choose a class and section to begin assigning houses.</div>`;
    return `<div class="admin-intro"><h2>House assignment</h2><p>Assign houses to students deliberately. No house is assigned automatically, and the house field from imports is ignored.</p></div><section class="settings-card house-names-card"><div><h3>House names</h3><p>These names are configurable for each school. The default set is Emerald, Ruby, Diamond and Sapphire.</p></div><form data-form="house-settings"><div class="form-field"><label>House names (one per line or separated by commas)</label><textarea class="field textarea" name="houseNames" rows="3" maxlength="328">${esc(names.join('\n'))}</textarea></div><div class="form-actions"><button class="btn btn-secondary">Save house names</button></div></form></section><div class="house-stat-grid">${totals.map((h,i)=>`<article class="house-stat"><span class="house-index">${String(i+1).padStart(2,'0')}</span><strong>${esc(h.name)}</strong><span>${h.count} assigned</span></article>`).join('')}<article class="house-stat house-unassigned"><span class="house-index">—</span><strong>Unassigned</strong><span>${unassigned} students</span></article></div><div class="house-admin-layout">${navigator}<section class="settings-card house-assignment-panel"><div class="house-panel-top"><div><h3>Assign students</h3><p>Choose a class and section from the progress list.</p></div><span class="year-pill">Admin mass selection</span></div>${workbench}</section></div>`;
  }
  function renderTeacherHouseAssignment() {
    const teacher=userByRole('teacher');
    if(!teacherCanAssignHouses(teacher?.id))return `<div class="panel empty-state"><h2>House assignment is not enabled</h2><p>An administrator must enable “Can assign houses” for your teacher account. You can only assign houses within sections assigned to you as class teacher.</p></div>`;
    const pairs=teacherClassSections();
    if (state.houseBrowser.classNo && state.houseBrowser.section && !pairs.some(p=>p.classNo===Number(state.houseBrowser.classNo)&&p.section===state.houseBrowser.section)) state.houseBrowser={classNo:null,section:null};
    const students=state.houseBrowser.section?houseStudentsForPair(state.houseBrowser.classNo,state.houseBrowser.section):[];
    const navigator=houseNavigatorMarkup(pairs,false);
    const body=state.houseBrowser.section?`<div class="house-workbench-heading"><div><p class="eyebrow">YOUR CLASS</p><h3>${ordinalClass(state.houseBrowser.classNo)} ${esc(state.houseBrowser.section)}</h3><p>${students.length} students · ${students.filter(st=>!st.house).length} houses not assigned yet</p></div><button type="button" class="btn btn-secondary" data-action="print-house-sheet">Print blank house sheet</button></div><div class="info-box">You can change house assignments only for your class-teacher sections. Other student details, class placement and programme settings are not editable here.</div>${houseRosterTable(state.houseBrowser.classNo,state.houseBrowser.section,students,false)}${housePrintSheet(state.houseBrowser.classNo,state.houseBrowser.section,students)}`:`<div class="empty-state">No class-teacher sections are assigned to this account.</div>`;
    return `${heading('House assignment','Assign or update house membership for students in your class-teacher sections.','STAFF WORKSPACE') }<div class="house-teacher-layout">${navigator}<section class="settings-card house-assignment-panel">${body}</section></div>`;
  }
  function adminStudentMovement() {
    const steps=classes.map(source=>({
      source,
      target:classes.includes(Number(source)+1)?Number(source)+1:null,
      final:Number(source)===Number(classes.at(-1)),
      count:db.students.filter(st=>st.active&&Number(st.classNo)===Number(source)).length
    }));
    const movable=steps.filter(step=>step.target);
    const movingCount=movable.reduce((sum,step)=>sum+step.count,0);
    const finalCount=steps.find(step=>step.final)?.count||0;
    const blocked=steps.filter(step=>!step.final&&!step.target);
    const blockedCount=blocked.reduce((sum,step)=>sum+step.count,0);
    const alreadyPromoted=db.settings.lastBulkPromotionYear===db.settings.academicYear;
    const rolloverCounts={registrations:db.registrations.length,ranks:db.results.length,selections:db.selections.length};
    const suggestedYear=(()=>{const match=String(db.settings.academicYear||'').match(/(\d{4})/);if(!match)return '';const start=Number(match[1])+1;return `${start}–${String((start+1)%100).padStart(2,'0')}`;})();
    return `<div class="admin-intro"><h2>Year rollover & student promotion</h2><p>This is the year-end workflow. Promote the student register, clear the previous year's programme entries and results, then move the school to its next academic year.</p></div><section class="settings-card year-rollover-card"><div class="section-title-row" style="margin-top:0"><div><h3>Complete year rollover</h3><p>One confirmed action updates class placements and clears current activity data. Student profiles, parent links, staff, programme definitions, houses and school setup are retained.</p></div><span class="year-pill">Current year · ${esc(db.settings.academicYear)}</span></div><div class="report-summary"><div class="report-tile"><strong>${movingCount}</strong><small>Students to promote</small></div><div class="report-tile"><strong>${rolloverCounts.registrations}</strong><small>Programme registrations to clear</small></div><div class="report-tile"><strong>${rolloverCounts.ranks}</strong><small>Ranks to clear</small></div><div class="report-tile"><strong>${rolloverCounts.selections}</strong><small>Sahodaya selections to clear</small></div></div><form data-form="year-rollover"><div class="form-grid"><div class="form-field"><label>New academic year</label><input class="field" name="newAcademicYear" value="${esc(suggestedYear)}" maxlength="20" placeholder="2027–28" required></div><div class="form-field"><label>Confirmation phrase</label><input class="field" name="confirmation" placeholder="ROLLOVER SCHOOL YEAR" autocomplete="off" required></div></div><div class="info-box">Students move up exactly one enabled numeric class. Highest-class students and students blocked by a missing next class remain in place. This action does not reset election data; use the election reset controls separately.</div><div class="form-actions"><button class="btn btn-danger" ${!movingCount?'disabled':''}>Complete year rollover</button></div></form></section><section class="settings-card promotion-all-card"><div class="promotion-all-heading"><div><p class="eyebrow">SEPARATE PROMOTION</p><h3>Promote the whole school without resetting activity</h3><p>Use this only when class promotion is needed separately. It moves eligible students by one numeric grade and keeps programme entries and results unchanged.</p></div><div class="promotion-count"><strong>${movingCount}</strong><span>students ready to move</span></div></div><div class="table-panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>Current class</th><th>Next grade</th><th>Active students</th><th>Action</th></tr></thead><tbody>${steps.map(step=>`<tr><td>${ordinalClass(step.source)}</td><td>${step.target?ordinalClass(step.target):step.final?'Final configured class':`Class ${Number(step.source)+1} is not enabled`}</td><td>${step.count}</td><td>${step.target?badge('Will promote','open'):step.final?badge('Graduating / stays','neutral'):badge('Needs school setup','closed')}</td></tr>`).join('')}</tbody></table></div></div><form data-form="promotion-all"><div class="form-actions"><button class="btn btn-primary" ${!movingCount||alreadyPromoted?'disabled':''}>Promote all eligible students</button></div></form>${alreadyPromoted?`<div class="warning-box">A mass promotion has already been recorded for academic year ${esc(db.settings.academicYear)}. Change the academic year after the school year rolls over before running it again.</div>`:`<div class="warning-box">The action asks for confirmation and records the academic year so the same school year cannot be promoted twice. Highest-class students (${finalCount}) stay in place.${blockedCount?` ${blockedCount} students are in classes whose next numeric grade is not enabled; those records will stay in place until the missing class is enabled.`:''}</div>`}</section><section class="settings-card student-movement-tools" style="margin-top:13px"><div class="section-title-row" style="margin-top:0"><div><h3>Move an individual student</h3><p>Move a repeater or non-promoted student individually after the main promotion, or open Student editor for checkbox-based bulk moves.</p></div></div><div class="student-move-quickbar"><select class="field" id="movement-student-select"><option value="">Choose a student</option>${selectOptions(db.students.filter(st=>st.active).sort((a,b)=>a.name.localeCompare(b.name)).map(st=>({value:st.id,label:`${st.name} · ${st.admissionNo} · ${ordinalClass(st.classNo)} ${st.section}`})))}</select><button class="btn btn-primary" data-action="student-move-picked">Move individual student</button><button class="btn btn-secondary" data-action="admin-tab" data-tab="students">Open bulk Student editor</button></div><div class="info-box">Unsectioned students remain in the directory and can be assigned separately. Moving one student does not move classmates or alter their promotion status.</div></section>`;
  }
  function adminProgrammes() {
    const f=state.adminProgrammeFilters||{};let records=db.programmes.slice();
    if(f.q)records=records.filter(p=>String(p.name||'').toLowerCase().includes(String(f.q).toLowerCase())||String(p.code||'').toLowerCase().includes(String(f.q).toLowerCase()));
    if(f.category)records=records.filter(p=>p.category===f.category);
    if(f.status==='active')records=records.filter(p=>!p.archived);if(f.status==='archived')records=records.filter(p=>p.archived);
    records=sortProgrammeRecords(records,f.sort||'name');
    const counts=new Map();for(const r of db.registrations)counts.set(r.programmeId,(counts.get(r.programmeId)||0)+1);
    const row=p=>`<tr><td><strong>${esc(p.name)}</strong><small class="table-subline">${esc(p.code)}</small></td><td>${esc(p.category)}</td><td>${p.category==='Group Item'?'House-based':esc(inferProgrammeType(p.area,p.category,p.name,p.description,p.itemType))}</td><td>${esc(p.gender||'All')}</td><td>${p.category==='Group Item'?`${p.classMin}–${p.classMax}`:esc(catForClass(p.classMin))}</td><td>${counts.get(p.id)||0} / ${p.capacity}</td><td>${p.archived?badge('Archived','closed'):badge(p.status==='draft'?'Draft':programmeOpen(p)?'Open':'Closed',p.status==='draft'?'draft':programmeOpen(p)?'open':'closed')}</td><td>${btn('Edit','programme-edit','table-action',`data-id="${p.id}"`)}${!p.archived?btn('Duplicate','programme-duplicate','table-action',`data-id="${p.id}"`):''}${p.archived?btn('Restore','programme-restore','table-action',`data-id="${p.id}"`):btn('Archive','programme-archive','table-action danger',`data-id="${p.id}"`)}</td></tr>`;
    const table=items=>`<div class="table-panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>Programme</th><th>Category</th><th>Type</th><th>Gender</th><th>Class / category</th><th>Entries / capacity</th><th>Status</th><th>Actions</th></tr></thead><tbody>${items.map(row).join('')||'<tr><td colspan="8"><div class="empty-state">No programmes in this group.</div></td></tr>'}</tbody></table></div></div>`;
    const areaSection=(area,type,label)=>{const items=records.filter(p=>p.area===area&&p.category!=='Group Item'&&inferProgrammeType(p.area,p.category,p.name,p.description,p.itemType)===type);return `<section class="programme-editor-subsection"><header><h4>${label}</h4><span>${items.length} items</span></header>${table(items)}</section>`;};
    const arts=records.filter(p=>p.area==='Arts'&&p.category!=='Group Item'),sports=records.filter(p=>p.area==='Sports'&&p.category!=='Group Item'),groups=records.filter(p=>p.category==='Group Item');
    return `<div class="section-title-row" style="margin-top:0"><div><h2>Programme editor</h2><p>Arts and Sports are kept in separate workspaces, with their own programme types and choice limits.</p></div><div class="heading-actions">${btn('+ Programme','programme-add','btn btn-primary','data-area="Arts"')}</div></div><section class="programme-filter-panel"><div class="toolbar programme-primary-filters"><input class="search-field" id="admin-prog-q" placeholder="Search programme name or code" value="${esc(f.q||'')}"><button type="button" class="btn btn-quiet btn-small filter-more-toggle" data-action="programme-filters-toggle" data-kind="admin" aria-expanded="${f.moreOpen?'true':'false'}">${f.moreOpen?'− Less filters':'+ More filters'}</button><span class="filter-result-count">${records.length} records</span></div><div class="filter-advanced" ${f.moreOpen?'':'hidden'}><label class="filter-field"><span>Category</span><select class="filter-select" id="admin-prog-category"><option value="">All categories</option>${selectOptions([...categoryNames(),'Group Item'],f.category)}</select></label><label class="filter-field"><span>Sort</span><select class="filter-select" id="admin-prog-sort">${selectOptions([{value:'name',label:'Name (A–Z)'},{value:'deadline',label:'Closing date'},{value:'entries',label:'Most entries'}],f.sort||'name')}</select></label><label class="filter-field"><span>Record status</span><select class="filter-select" id="admin-prog-status"><option value="">Active and archived</option>${selectOptions([{value:'active',label:'Active only'},{value:'archived',label:'Archived only'}],f.status)}</select></label><button class="btn btn-quiet btn-small" data-action="programme-filter-clear" data-kind="admin">Clear filters</button></div></section><div class="programme-editor-areas"><section class="programme-editor-area"><header><div><span class="eyebrow">ARTS</span><h3>Arts programmes</h3><p>Onstage and Offstage items.</p></div>${btn('+ Add Arts','programme-add','btn btn-secondary btn-small','data-area="Arts"')}</header>${areaSection('Arts','onstage','Onstage')}${areaSection('Arts','offstage','Offstage')}</section><section class="programme-editor-area"><header><div><span class="eyebrow">SPORTS</span><h3>Sports programmes</h3><p>Track and Field events.</p></div>${btn('+ Add Sports','programme-add','btn btn-secondary btn-small','data-area="Sports"')}</header>${areaSection('Sports','track','Track items')}${areaSection('Sports','field','Field items')}</section><section class="programme-editor-area programme-editor-groups"><header><div><span class="eyebrow">HOUSE TEAMS</span><h3>Group Items</h3><p>House-based teams with separate limits.</p></div>${btn('+ Add Group Item','programme-add','btn btn-secondary btn-small','data-area="Arts" data-category="Group Item"')}</header>${table(groups)}</section></div>`;
  }
  function adminRegistrations() {
    const f=state.adminRegistrationFilters||{};
    const browser=state.adminRegistrationBrowser||{classNo:null,section:null};
    const allRows=db.registrations.map(r=>({r,s:studentById(r.studentId),p:programmeById(r.programmeId)})).filter(x=>x.s?.active&&x.p&&!x.p.archived);
    const classList=classes.slice();
    const classRows=browser.classNo?allRows.filter(x=>x.s.classNo===Number(browser.classNo)):[];
    const registrationCountsByClass=new Map(),registrationCountsBySection=new Map();
    for(const item of allRows){const classNo=Number(item.s.classNo),key=`${classNo}|${item.s.section}`;registrationCountsByClass.set(classNo,(registrationCountsByClass.get(classNo)||0)+1);registrationCountsBySection.set(key,(registrationCountsBySection.get(key)||0)+1);}
    const sectionList=sectionsForClass(browser.classNo||0);
    let rows=browser.section?classRows.filter(x=>x.s.section===browser.section):[];
    if(f.q)rows=rows.filter(x=>x.s.name.toLowerCase().includes(f.q.toLowerCase())||x.s.admissionNo.toLowerCase().includes(f.q.toLowerCase())||x.p.name.toLowerCase().includes(f.q.toLowerCase())||x.p.code.toLowerCase().includes(f.q.toLowerCase()));
    if(f.area)rows=rows.filter(x=>x.p.area===f.area);
    if(f.programme)rows=rows.filter(x=>x.p.id===Number(f.programme));
    if(f.category)rows=rows.filter(x=>catForClass(x.s.classNo)===f.category);
    if(f.age)rows=rows.filter(x=>matchesAgeFilter(x.s,f.age));
    const regSort=f.sort||'programme';
    rows.sort((a,b)=>regSort==='name'?a.s.name.localeCompare(b.s.name):regSort==='class'?a.s.classNo-b.s.classNo||a.s.section.localeCompare(b.s.section)||a.s.name.localeCompare(b.s.name):regSort==='category'?categoryBands().findIndex(x=>x.name===catForClass(a.s.classNo))-categoryBands().findIndex(x=>x.name===catForClass(b.s.classNo))||a.s.name.localeCompare(b.s.name):regSort==='date'?String(b.r.createdAt||'').localeCompare(String(a.r.createdAt||'')):a.p.name.localeCompare(b.p.name)||a.s.name.localeCompare(b.s.name));
    let content='';
    if(!browser.section){
      const counts=Object.fromEntries(classList.map(classNo=>[classNo,registrationCountsByClass.get(Number(classNo))||0]));
      const pairsByClass=Object.fromEntries(classList.map(classNo=>[classNo,sectionsForClass(classNo).map(section=>({classNo,section}))]));
      const sectionCounts=Object.fromEntries(Object.entries(pairsByClass).flatMap(([,pairs])=>pairs.map(pair=>[classSectionKey(pair.classNo,pair.section),registrationCountsBySection.get(classSectionKey(pair.classNo,pair.section))||0])));
      content=classRowsMarkup(classList,'registration-browse-class',counts,'',browser.classNo,'registration-browse-section',sectionCounts,pairsByClass);
    }else{
      content=`<div class="browser-breadcrumb"><button class="btn btn-quiet btn-small" data-action="registration-browse-back">← Class and sections</button><strong>Class ${browser.classNo} · Section ${esc(browser.section)}</strong><span>${rows.length} entries shown</span></div>
        <div class="toolbar programme-primary-filters"><input class="search-field" id="admin-reg-q" placeholder="Search student or programme" value="${esc(f.q||'')}"><button type="button" class="btn btn-quiet btn-small filter-more-toggle" data-action="registration-filters-toggle" aria-expanded="${f.moreOpen?'true':'false'}">${f.moreOpen?'− Less filters':'+ More filters'}</button><span class="year-pill">${rows.length} entries</span></div><div class="filter-advanced registration-filter-advanced" ${f.moreOpen?'':'hidden'}><label class="filter-field"><span>Area</span><select class="filter-select" id="admin-reg-area"><option value="">All areas</option>${selectOptions(['Arts','Sports'],f.area)}</select></label><label class="filter-field"><span>Programme</span><select class="filter-select" id="admin-reg-programme"><option value="">All programmes</option>${selectOptions(db.programmes.filter(p=>!p.archived).map(p=>({value:p.id,label:`${p.name} · ${p.category}${p.gender!=='All'?' · '+p.gender:''}`})),f.programme)}</select></label><label class="filter-field"><span>Category</span><select class="filter-select" id="admin-reg-category"><option value="">All categories</option>${selectOptions(categoryNames(),f.category)}</select></label>${ageFilterMarkup('admin-reg-age',browser.section?classRows.map(x=>x.s):allRows.map(x=>x.s),f.age)}<label class="filter-field"><span>Sort</span><select class="filter-select" id="admin-reg-sort">${selectOptions([{value:'programme',label:'Programme'},{value:'name',label:'Student name'},{value:'class',label:'Class / section'},{value:'category',label:'Category'},{value:'date',label:'Date added'}],f.sort||'programme')}</select></label><button class="btn btn-quiet btn-small" data-action="participation-manager-clear">Clear filters</button></div>
        <div class="table-panel registration-table-panel"><div class="table-wrap"><table class="data-table registration-manager-table"><thead><tr><th>Student</th><th>Programme</th><th>Student details</th><th>Registered on</th><th>Actions</th></tr></thead><tbody>${rows.map(({r,s,p})=>`<tr><td>${studentCell(s)}</td><td><strong>${esc(p.name)}</strong><small style="display:block;color:var(--muted)">${esc(p.code)} · ${esc(p.area)} · ${esc(p.category)}${p.gender!=='All'?' · '+esc(p.gender):''}</small></td><td>Class ${s.classNo} · ${esc(s.section)}<small style="display:block;color:var(--muted)">${esc(s.gender||'Not specified')} · Age ${studentAgeText(s)} · ${esc(catForClass(s.classNo))}</small></td><td>${formatDate(r.createdAt)}</td><td><div class="table-actions">${btn('View','student-view','table-action','data-id="'+s.id+'"')}${btn('Remove','registration-remove','table-action danger','data-id="'+s.id+'" data-programme="'+p.id+'"')}</div></td></tr>`).join('')||'<tr><td colspan="5"><div class="empty-state">No programme choices found in this section.</div></td></tr>'}</tbody></table></div><div class="table-footer"><span>${rows.length} entries shown</span><span>Removal does not delete student or programme records.</span></div></div>`;
    }
    const managerActions=btn('Add programme entry','admin-registration-add','btn btn-primary')+(browser.section?btn('Export this section · CSV','participation-manager-export','btn btn-secondary')+btn('Export this section · Excel','participation-manager-export-xlsx','btn btn-quiet'):'');
    return `<div class="section-title-row" style="margin-top:0"><div><h2>Programme registration manager</h2><p>Review student entries by class and section. Add a student to an eligible programme here or from the Student Register. Within a section, filter by student, programme, category or age. Programme-specific rosters remain ungrouped.</p></div><div class="heading-actions">${managerActions}</div></div>${content}<div class="warning-box">This manager tracks programme registrations and choices. It is not a daily classroom attendance register.</div>`;
  }
  function adminRegistrationStudentForm() {
    const active=db.students.filter(student=>student&&student.active);
    return `<form data-form="admin-registration-student"><p class="subtle-note">Choose a student first. You can then add them to any eligible individual Arts or Sports programme, or place them in a House-based Group Item team.</p>${hierarchicalStudentPicker(active,'','Student')}<div class="form-actions"><button type="button" class="btn" data-close-modal>Cancel</button><button class="btn btn-primary">Choose student</button></div></form>`;
  }
  function hierarchicalStudentPicker(students, selectedId='', label='Student') {
    const active=students.filter(st=>st&&st.active).sort((a,b)=>a.classNo-b.classNo||a.section.localeCompare(b.section)||a.name.localeCompare(b.name));
    const ids=active.map(st=>st.id).join(',');
    const selected=selectedId?active.find(st=>st.id===Number(selectedId))||null:null;
    const initialClass=selected?.classNo||'';
    const initialSection=selected?.section||'';
    const sectionValues=initialClass?[...new Set(active.filter(st=>st.classNo===Number(initialClass)).map(st=>st.section))].sort():[];
    const visible=initialClass&&initialSection?active.filter(st=>st.classNo===Number(initialClass)&&st.section===initialSection):[];
    return `<div class="student-picker" data-student-picker data-student-ids="${esc(ids)}"><div class="form-grid"><div class="form-field"><label>Class</label><select class="field" data-picker-class><option value="">Choose class</option>${selectOptions([...new Set(active.map(st=>st.classNo))].sort((a,b)=>a-b).map(c=>({value:c,label:`Class ${c}`})),initialClass)}</select></div><div class="form-field"><label>Section</label><select class="field" data-picker-section><option value="">Choose section</option>${selectOptions(sectionValues,initialSection)}</select></div><div class="form-field full"><label>${esc(label)}</label><select class="field" name="studentId" data-picker-student required><option value="">Choose student</option>${selectOptions(visible.map(st=>({value:st.id,label:`${st.name} · ${st.admissionNo}`})),selected?.id)}</select></div></div></div>`;
  }
  function syncHierarchicalStudentPicker(wrapper) {
    if(!wrapper)return;
    const ids=String(wrapper.dataset.studentIds||'').split(',').map(Number).filter(Number.isSafeInteger);
    const records=ids.map(studentById).filter(st=>st&&st.active);
    const classSelect=$('[data-picker-class]',wrapper),sectionSelect=$('[data-picker-section]',wrapper),studentSelect=$('[data-picker-student]',wrapper);
    if(!classSelect||!sectionSelect||!studentSelect)return;
    const oldStudent=studentSelect.value,oldClass=classSelect.value,oldSection=sectionSelect.value;
    const classNos=[...new Set(records.map(st=>st.classNo))].sort((a,b)=>a-b);
    classSelect.innerHTML='<option value="">Choose class</option>'+selectOptions(classNos.map(c=>({value:c,label:`Class ${c}`})),classNos.includes(Number(oldClass))?oldClass:'');
    const classNo=Number(classSelect.value);
    const sectionNames=classNo?[...new Set(records.filter(st=>st.classNo===classNo).map(st=>st.section))].sort():[];
    sectionSelect.innerHTML='<option value="">Choose section</option>'+selectOptions(sectionNames,sectionNames.includes(oldSection)?oldSection:'');
    const section=sectionSelect.value;
    const candidates=classNo&&section?records.filter(st=>st.classNo===classNo&&st.section===section):[];
    studentSelect.innerHTML='<option value="">Choose student</option>'+selectOptions(candidates.map(st=>({value:st.id,label:`${st.name} · ${st.admissionNo}`})),candidates.some(st=>String(st.id)===oldStudent)?oldStudent:'');
  }
  function syncParentChildPicker(form) {
    if(!form)return;
    const classSelect=$('#staff-parent-class',form),sectionSelect=$('#staff-parent-section',form),host=$('#staff-parent-child-options',form);
    if(!classSelect||!sectionSelect||!host)return;
    const selected=new Set([...form.querySelectorAll('[name="linkedStudentIds"]:checked')].map(input=>Number(input.value)));
    const classNo=Number(classSelect.value),section=sectionSelect.value;
    const linked=[...selected].map(studentById).filter(st=>st&&st.active);
    const candidates=classNo&&section?db.students.filter(st=>st.active&&st.classNo===classNo&&st.section===section):[];
    const list=[...new Map([...linked,...candidates].map(st=>[st.id,st])).values()].sort((a,b)=>a.classNo-b.classNo||a.section.localeCompare(b.section)||a.name.localeCompare(b.name));
    host.innerHTML=list.length?`<div class="checkbox-grid">${list.map(st=>`<label class="check-tile"><input type="checkbox" name="linkedStudentIds" value="${st.id}" ${selected.has(st.id)?'checked':''}>${esc(st.name)} · Class ${st.classNo}${esc(st.section)} · ${esc(st.admissionNo)}</label>`).join('')}</div>`:'<p class="subtle-note">Choose a class and section to find the child to link.</p>';
  }
  function registrationAdminForm() {
    return `<form data-form="participation-admin-add"><div class="form-field full"><label>Student</label>${hierarchicalStudentPicker(db.students.filter(st=>st.active),'','Choose student')}</div><div class="form-field full" style="margin-top:12px"><label>Programme</label><select class="field" name="programmeId" required><option value="">Choose programme</option>${selectOptions(db.programmes.filter(p=>!p.archived&&p.category!=='Group Item').map(p=>({value:p.id,label:`${p.name} · ${p.area} · ${p.category}${p.gender!=='All'?' · '+p.gender:''}`})))}</select></div><div class="form-field full" style="margin-top:12px"><label>Reason / staff note</label><textarea class="field textarea" name="reason" placeholder="Why is this entry being added by staff?" required></textarea></div><div class="form-field full"><label class="check-tile"><input type="checkbox" name="overrideLimits"> Override a closed choice window or student choice limit</label></div><div class="info-box">Select the child by class and section. Eligibility, capacity and duplicates are always checked. Approved exceptions need a reason.</div><div class="form-actions"><button type="button" class="btn" data-close-modal>Cancel</button><button class="btn btn-primary">Add entry</button></div></form>`;
  }
  function adminRules() {
    const bands=categoryBands();
    const bandEditor=`<section class="settings-card category-band-editor"><div class="section-title-row" style="margin-top:0"><div><h3>Class-to-category mapping</h3><p>Change category labels and class ranges here. Student categories and programme eligibility are recalculated from the saved ranges.</p></div><span class="year-pill">${bands.length} categories</span></div><form data-form="category-bands"><div class="category-band-grid">${bands.map((band,i)=>`<div class="category-band-card"><div class="category-band-index">${i+1}</div><input type="hidden" name="bandId${i}" value="${esc(band.id||`cat${i+1}`)}"><div class="form-field"><label>Category name</label><input class="field" name="bandName${i}" maxlength="24" required value="${esc(band.name)}"></div><div class="category-range-fields"><div class="form-field"><label>From class</label><select class="field" name="bandMin${i}">${selectOptions(Array.from({length:12},(_,n)=>({value:n+1,label:String(n+1)})),band.minClass)}</select></div><span class="range-dash">to</span><div class="form-field"><label>To class</label><select class="field" name="bandMax${i}">${selectOptions(Array.from({length:12},(_,n)=>({value:n+1,label:String(n+1)})),band.maxClass)}</select></div></div><small>Currently covers Classes ${band.minClass}–${band.maxClass}</small></div>`).join('')}</div><input type="hidden" name="bandCount" value="${bands.length}"><div class="form-actions"><button class="btn btn-primary">Save category ranges</button></div></form><div class="info-box">Default mapping: Cat 1 = Classes 1–4 · Cat 2 = Classes 5–7 · Cat 3 = Classes 8–10 · Cat 4 = Classes 11–12. Cat 4 is retained for senior classes but can be renamed or changed. Existing student records and participation history are not deleted when ranges change.</div></section>`;
    return `<div class="settings-grid">${bandEditor}<section class="settings-card"><h3>Choice limits</h3><p>Limits are separate for each type. Sports also has an overall total so a student cannot exceed three Sports items across Track and Field.</p><form data-form="choice-limits"><div class="choice-limit-sections"><div><h4>Arts</h4><div class="form-grid"><div class="form-field"><label>Maximum Onstage</label><input class="field" type="number" min="0" max="50" name="maxArtsOnstage" value="${db.settings.maxArtsOnstage??3}"></div><div class="form-field"><label>Maximum Offstage</label><input class="field" type="number" min="0" max="50" name="maxArtsOffstage" value="${db.settings.maxArtsOffstage??3}"></div></div></div><div><h4>Sports</h4><div class="form-grid"><div class="form-field"><label>Maximum Sports total</label><input class="field" type="number" min="0" max="50" name="maxSports" value="${db.settings.maxSports??3}"></div><div class="form-field"><label>Maximum Track</label><input class="field" type="number" min="0" max="50" name="maxSportsTrack" value="${db.settings.maxSportsTrack??2}"></div><div class="form-field"><label>Maximum Field</label><input class="field" type="number" min="0" max="50" name="maxSportsField" value="${db.settings.maxSportsField??2}"></div></div></div><div><h4>Group Items</h4><div class="form-field"><label>Maximum Group Item choices</label><input class="field" type="number" min="0" max="50" name="maxGroup" value="${db.settings.maxGroup}"></div></div></div><div class="form-actions"><button class="btn btn-primary">Save choice limits</button></div></form><div class="info-box">Defaults: 3 Onstage + 3 Offstage for Arts; 3 Sports total, with up to 2 Track and 2 Field; and 2 Group Items. These values can be changed at any time.</div></section></div><section class="settings-card" style="margin-top:13px"><h3>Eligibility rules</h3><p>Arts items are category-based and split into Onstage and Offstage. Sports items are split into Track and Field and may also be gender-specific. Group Items are House-based teams with a separate student limit.</p></section>`;
  }
  function adminWindows() {
    const programmes=sortProgrammeRecords(db.programmes.filter(programme=>!programme.archived),'name');
    return `<section class="settings-card"><h3>School-wide programme choice window</h3><p>This is the overall boundary. A programme can have a narrower opening and closing date of its own.</p><form data-form="registration-window"><div class="form-grid"><div class="form-field"><label>School name</label><input class="field" name="schoolName" value="${esc(db.settings.schoolName)}" required></div><div class="form-field"><label>Academic year</label><input class="field" name="academicYear" value="${esc(db.settings.academicYear)}" required></div><div class="form-field"><label>Choices open</label><input class="field" type="date" name="registrationOpen" value="${esc(db.settings.registrationOpen)}"></div><div class="form-field"><label>Choices close</label><input class="field" type="date" name="registrationClose" value="${esc(db.settings.registrationClose)}"></div></div><div class="form-actions"><button class="btn btn-primary">Save school settings</button></div></form><div class="info-box">Opening dates are secondary: pressing Open starts the programme immediately. Closing dates remain automatic stop boundaries; pressing Close stops it immediately.</div></section>
    <section class="settings-card bulk-deadline-card"><div class="section-title-row"><div><h3>Set deadlines for multiple programmes</h3><p>Select any number of programmes and apply one or both dates in a single operation. Leave a date blank to keep its current value.</p></div><div class="heading-actions"><button type="button" class="btn btn-quiet btn-small" data-action="deadline-select-all">Select all</button><button type="button" class="btn btn-quiet btn-small" data-action="deadline-select-none">Clear selection</button></div></div><form data-form="bulk-deadlines"><div class="form-grid"><div class="form-field"><label>Opening date (optional)</label><input class="field" type="date" name="openDate"></div><div class="form-field"><label>Closing date (optional)</label><input class="field" type="date" name="closeDate"></div></div><div class="bulk-deadline-programme-list">${programmes.map(programme=>`<label class="bulk-deadline-option"><input type="checkbox" name="programmeIds" value="${programme.id}"><span><strong>${esc(programme.name)}</strong><small>${esc(programme.area)} · ${esc(programme.category)}${programme.gender!=='All'?' · '+esc(programme.gender):''} · Current: ${formatDate(programme.openDate,{day:'2-digit',month:'short'})} – ${formatDate(programme.closeDate,{day:'2-digit',month:'short'})}</small></span></label>`).join('')||'<p class="empty-state">No active programmes to update.</p>'}</div><div class="form-actions"><span class="subtle-note">Only the selected programmes will be changed. Their capacity, entries and results stay untouched.</span><button class="btn btn-primary">Apply dates to selected programmes</button></div></form></section>`;
  }
  function adminSchool() {
    return `<section class="settings-card"><h3>School identity & display</h3><p>Keep the portal template generic. Configure only the details that belong to the school using it.</p><form data-form="school-config"><div class="form-grid"><div class="form-field"><label>School name</label><input class="field" name="schoolName" value="${esc(db.settings.schoolName)}" required></div><div class="form-field"><label>Short name</label><input class="field" name="shortName" value="${esc(db.settings.shortName)}" maxlength="12"></div><div class="form-field full"><label>Classes currently offered</label><p class="subtle-note">Select the classes this school uses. The portal supports classes 1–12, but a school can enable only the grades it actually has.</p><div class="class-config-list">${Array.from({length:12},(_,i)=>i+1).map(c=>`<label class="class-config-option"><input type="checkbox" name="activeClasses" value="${c}" ${classes.includes(c)?'checked':''}><span>${ordinalClass(c)}</span></label>`).join('')}</div></div><div class="form-field full"><label>Section names used by the selected classes</label><input class="field" name="sections" value="${esc(sections.join(', '))}" placeholder="A, B, C"></div><div class="form-field full"><label>School logo</label><div class="branding-upload"><img class="branding-preview" id="logo-preview" src="${esc(db.settings.logoDataUrl||'assets/mark.svg')}" alt="Current school logo"><div><input class="field" type="file" id="school-logo-file" accept="image/png,image/jpeg,image/webp"><small>PNG, JPG or WebP · up to 700 KB. This appears in the portal header.</small><button type="button" class="btn btn-quiet btn-small" data-action="branding-reset-logo">Use default mark</button></div></div></div><div class="form-field full"><label>Portal background image</label><div class="branding-upload background-upload"><div class="branding-background-preview" id="background-preview" style="background-image:${db.settings.backgroundDataUrl?`url('${db.settings.backgroundDataUrl}')`:'url(assets/campus-hero.jpg)'}"></div><div><input class="field" type="file" id="school-background-file" accept="image/png,image/jpeg,image/webp"><small>PNG, JPG or WebP · up to 700 KB. Used behind the dashboard hero area.</small><button type="button" class="btn btn-quiet btn-small" data-action="branding-reset-background">Use default background</button></div></div></div></div><div class="form-actions"><button class="btn btn-primary">Save school configuration</button></div></form></section><section class="settings-card" style="margin-top:13px"><h3>Main screen content</h3><p>Edit the heading, paragraph and quote shown on the portal overview screen. This is separate from the school logo and background.</p><form data-form="home-copy"><div class="form-grid"><div class="form-field full"><label>Small heading</label><input class="field" name="dashboardEyebrow" maxlength="60" value="${esc(db.settings.dashboardEyebrow||'ACTIVITY MANAGER')}"></div><div class="form-field full"><label>Main heading</label><textarea class="field textarea" name="dashboardTitle" rows="2" maxlength="140" required>${esc(db.settings.dashboardTitle||'Every student has a place to take part.')}</textarea></div><div class="form-field full"><label>Description</label><textarea class="field textarea" name="dashboardDescription" rows="3" maxlength="320">${esc(db.settings.dashboardDescription||'')}</textarea></div><div class="form-field full"><label>Quote / short line (optional)</label><input class="field" name="dashboardQuote" maxlength="140" value="${esc(db.settings.dashboardQuote||'')}"></div></div><div class="form-actions"><button class="btn btn-primary">Save main screen text</button></div></form></section><section class="settings-card" style="margin-top:13px"><h3>Publication controls</h3><p>Parents can see their own child’s choices and the school’s final published winners. They never see other students’ participation lists.</p><form data-form="publication"><label class="check-tile"><input type="checkbox" name="publishResults" ${db.settings.publishResults?'checked':''}> Publish final rankings and confirmed Sahodaya outcomes to parent views</label><div class="info-box">Participant rosters are staff-only. The parent portal shows only linked children, plus published final winners.</div><div class="form-actions"><button class="btn btn-primary">Save publication settings</button></div></form></section>`;
  }

  function adminEvents() {
    const ordered=db.events.slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.time||'').localeCompare(String(b.time||''))||String(a.title).localeCompare(String(b.title)));
    return `<div class="section-title-row" style="margin-top:0"><div><h2>Events & school notices</h2><p>Manage event details, coordinators, schedules and publication. Events are ordered by their school dates and times (IST).</p></div>${btn('+ Add event','event-add','btn btn-primary')}</div>${ordered.map(e=>`<div class="event-card" style="margin-bottom:9px"><div class="event-date"><strong>${esc(schoolDateLabel(e.date,{day:'numeric'}))}</strong><small>${esc(schoolDateLabel(e.date,{month:'short'}))}</small></div><div class="event-copy"><strong>${esc(e.title)}</strong><p>${calendarEventRange(e)} · ${esc(calendarEventTime(e))} · ${esc(e.venue||'Venue not set')} · ${esc(e.type||'School event')} · ${e.published?'Published':'Draft'}</p><p>${esc(e.description)}</p></div><div class="event-actions">${btn('Edit','event-edit','table-action','data-id="'+e.id+'"')}${btn('Delete','event-delete','table-action danger','data-id="'+e.id+'"')}</div></div>`).join('')||'<div class="panel empty-state">No events have been created.</div>'}<section class="settings-card" style="margin-top:13px"><h3>Portal announcement</h3><p>Short notice shown to students and parents on their portal.</p><form data-form="announcement"><div class="form-field"><label>Announcement text</label><textarea class="field textarea" name="announcement" maxlength="1000">${esc(db.settings.announcements)}</textarea></div><div class="form-actions"><button class="btn btn-primary">Publish notice</button></div></form></section>`;
  }
  function electionPublicUrl(e, page='poll.html') { const url=new URL(page,window.location.href.split('#')[0]);url.searchParams.set('poll',String(e.id));url.searchParams.set('key',String(e.publicKey||''));return url.href; }
  async function copyText(text) { try { if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);} else {const input=document.createElement('textarea');input.value=text;input.style.position='fixed';input.style.opacity='0';document.body.append(input);input.select();const ok=document.execCommand('copy');input.remove();if(!ok)throw new Error('Clipboard unavailable');}toast('Link copied to clipboard.'); } catch { openModal('Copy poll link',`<p class="subtle-note">Clipboard access is blocked in this browser. Copy the link below manually.</p><textarea class="field textarea" readonly>${esc(text)}</textarea>`,'SHARE POLL'); } }
  function adminElections() {
    const election=electionDb.elections.find(e=>e.id===state.electionId)||electionDb.elections[0];
    const list=`<section class="settings-card"><div class="section-title-row" style="margin-top:0"><div><h3>School polls</h3><p>Create and configure a poll here, then share its public voting link. Voting pages are not part of the portal navigation.</p></div>${btn('+ Create poll','election-add','btn btn-primary')}</div>${electionDb.elections.map(e=>`<div class="deadline-item"><div><strong>${esc(e.title)}</strong><small>${esc(e.status)} · ${electionBallotCount(e)} ballots · ${formatTime(e.openAt)} – ${formatTime(e.closeAt)}</small></div><div class="table-actions">${btn('Manage','election-select-admin','table-action','data-id="'+e.id+'"')}${btn('Copy voting link','election-copy-vote-link','table-action','data-id="'+e.id+'"')}${btn('Copy live link','election-copy-live-link','table-action','data-id="'+e.id+'"')}</div></div>`).join('')||'<div class="empty-state">No polls created yet.</div>'}</section>`;
    return `${list}${election?`<div class="section-title-row"><div><h2>Manage: ${esc(election.title)}</h2><p>Edit the ballot while the election is in Draft or Closed. Resetting ballots lets you reuse the same candidate list for a fresh poll.</p></div></div>${renderElectionSettings(election)}${renderElectionAnalytics(election)}`:''}`;
  }

  function renderElectionAnalytics(election) {
    const summary=readElectionSummary(election.id);
    const candidateCounts=new Map(Object.entries(summary.candidateCounts||{}));
    const acceptedCount=Number(summary.acceptedBallots)||0;
    const groups=(election.positions||[]).map(position=>{
      const counts=(position.candidates||[]).map(candidate=>({candidate,count:candidateCounts.get(`${position.id}:${candidate.id}`)||0}));
      const total=counts.reduce((sum,item)=>sum+item.count,0);
      return `<section class="election-analytics-position"><div class="election-analytics-head"><h3>${esc(position.name)}</h3><span>${total} vote${total===1?'':'s'}</span></div>${counts.map(({candidate,count})=>{const share=total?count/total*100:0;return `<div class="election-bar-row"><div class="election-bar-label"><strong>${esc(candidate.name)}</strong><span>${count} · ${share.toFixed(1)}%</span></div><div class="election-bar-track"><span style="width:${share.toFixed(1)}%"></span></div></div>`;}).join('')||'<p class="subtle-note">No candidates in this position.</p>'}</section>`;
    }).join('');
    const visible=election.status==='published'||(election.status==='open'&&election.showLive===true);
    const body=summary.corrupt?'<div class="warning-box"><strong>Election result summary is damaged.</strong><p>Voting is blocked until the election data is repaired or the ballots are cleared. No guessed totals are shown.</p></div>':visible?groups:'<div class="empty-state"><strong>Results are not visible yet</strong><p>Graphs appear when live results are enabled during voting or final results are published.</p></div>';
    return `<section class="settings-card election-analytics"><div class="section-title-row" style="margin-top:0"><div><h2>Election results & graphs</h2><p>Candidate totals are calculated from accepted anonymous ballots. No voter names or individual ballots are exposed.</p></div><span class="year-pill">${acceptedCount} accepted ballots</span></div>${body}</section>`;
  }

  function adminAudit() {
    return `<div class="section-title-row" style="margin-top:0"><div><h2>Activity log</h2><p>Changes made during this browser session and in the saved local workspace.</p></div><button class="btn btn-secondary" data-action="audit-export">Export log · JSON</button></div><div class="table-panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Actor</th><th>Role</th><th>Action</th><th>Record</th><th>Details</th></tr></thead><tbody>${db.audit.map(a=>`<tr><td>${formatTime(a.date)}</td><td>${esc(a.actor)}</td><td>${esc(a.role)}</td><td>${esc(a.action.replaceAll('_',' '))}</td><td>${esc(a.record)}</td><td>${esc(a.detail)}</td></tr>`).join('')||'<tr><td colspan="6">No activity recorded.</td></tr>'}</tbody></table></div></div>`;
  }

  let lastRenderedPage = null;
  function animatePageEntry(content) {
    if (!content) return;
    // Restart only on route changes. A frame boundary avoids forcing a layout read.
    content.classList.remove('page-enter');
    window.requestAnimationFrame(() => {
      if (!content.isConnected) return;
      content.classList.add('page-enter');
      window.setTimeout(() => content.classList.remove('page-enter'), 240);
    });
  }
  let generatedControlLabelId=0;
  function ensureAccessibleControlLabels(root){
    if(!root?.querySelectorAll)return;
    root.querySelectorAll('input:not([type="hidden"]),select,textarea').forEach(control=>{
      if(control.labels?.length||control.closest('label')||control.getAttribute('aria-label')||control.getAttribute('aria-labelledby'))return;
      const field=control.closest('.form-field');
      const label=field?.querySelector(':scope > label, :scope > .field-label, :scope > label:not(.check-tile)');
      let text=label?.textContent?.replace(/\s+/g,' ').trim()||'';
      if(!text){const filter=control.closest('.filter-field');text=filter?.querySelector('span')?.textContent?.replace(/\s+/g,' ').trim()||'';}
      if(!text&&control.placeholder)text=control.placeholder.trim();
      if(!text&&control.id==='movement-student-select')text='Choose a student to move';
      if(!text&&control.id==='admin-prog-q')text='Search programme name or code';
      if(!text&&control.id)text=control.id.replace(/[-_]/g,' ').replace(/\b\w/g,ch=>ch.toUpperCase());
      if(!text&&control.name)text=control.name.replace(/[-_]/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/\b\w/g,ch=>ch.toUpperCase());
      if(text){
        if(!control.id){let id;do{id=`portal-field-${++generatedControlLabelId}`;}while(document.getElementById(id));control.id=id;}
        if(label&&!label.htmlFor&&!label.querySelector('input,select,textarea'))label.htmlFor=control.id;
        else control.setAttribute('aria-label',text);
      }
    });
  }

  function render() {
    if (!pageAllowed(state.page)) state.page = fallbackPage();
    const motionKey = [
      state.role,
      state.page,
      state.page === 'admin' ? state.adminTab : '',
      state.page === 'programme-detail' ? state.programmeId : '',
      state.role === 'parent' ? state.parentTab : ''
    ].join('|');
    const routeChanged = lastRenderedPage !== motionKey;
    lastRenderedPage = motionKey;
    document.body.dataset.page = state.page;
    const menuToggle=$('#mobile-menu');
    if(menuToggle)menuToggle.setAttribute('aria-controls',state.page==='admin'?'admin-section-nav':'sidebar');
    updateIdentity(); activeNav();
    $$('.nav-item').forEach(node=>{
      const label=[...node.querySelectorAll('span:not(.nav-icon)')].find(span=>!span.hidden)?.textContent?.trim()||node.textContent.trim();
      if(label){node.title=label;node.setAttribute('aria-label',label);}
    });
    const content=$('#page-content');
    if(databaseRecoveryError){
      content.innerHTML=`<section class="data-recovery-screen"><div class="recovery-mark">!</div><p class="eyebrow">LOCAL DATA RECOVERY</p><h1>Saved school data needs recovery</h1><p>The portal could not read the existing saved school database. The original browser data has been preserved. Demo/sample records are not being shown as if they were real school records.</p><div class="recovery-warning">${esc(databaseRecoveryError.message||'Saved data could not be read.')}</div><p>Choose a known-good portal backup JSON file. Do not continue entering or editing school records until recovery is complete.</p><button class="btn btn-primary" data-action="backup-import">Restore a valid backup</button></section>`;
      if (routeChanged) animatePageEntry(content);
      applySchoolBranding();$('#breadcrumb-title').textContent='Data recovery';activeNav();return;
    }
    try {
      let html='';
      switch(state.page){
        case 'students':html=renderStudents();break;
        case 'arts':html=renderProgrammeList('arts');break;
        case 'sports':html=renderProgrammeList('sports');break;
        case 'groups':html=renderProgrammeList('groups');break;
        case 'programme-detail':html=renderProgrammeDetail();break;
        case 'results':html=renderResults();break;
        case 'reports':html=renderReports();break;
        case 'not-registered':html=renderNotRegistered();break;
        case 'calendar':html=renderCalendar();break;
        case 'portal':html=renderPortal();break;
        case 'house-assign':html=renderTeacherHouseAssignment();break;
        case 'admin':html=renderAdmin();break;
        default:html=renderDashboard();
      }
      content.innerHTML=html;
      ensureAccessibleControlLabels(content);
      if (routeChanged) animatePageEntry(content);
      if(state.page==='admin'&&state.adminTab==='parents'&&state.parentAccountQuery){
        const query=state.parentAccountQuery.trim().toLocaleLowerCase();let visible=0;
        $$('.parent-class-group',content).forEach(group=>{let groupVisible=0;$$('[data-parent-row]',group).forEach(row=>{const match=String(row.dataset.parentSearch||'').includes(query);row.hidden=!match;if(match){groupVisible++;visible++;}});group.hidden=groupVisible===0;group.open=groupVisible>0;});
        const empty=$('#parent-search-empty',content);if(empty)empty.hidden=visible>0;
      }
      applySchoolBranding();
      $('#breadcrumb-title').textContent=state.page==='programme-detail'?'Programme details':pageNames[state.page]||'Overview';
      activeNav();
    } catch(err) {
      console.error(err); content.innerHTML=`<div class="panel empty-state"><strong>Page could not be rendered</strong><p>${esc(err.message)}</p></div>`;
      if (routeChanged) animatePageEntry(content);
    }
  }

  function studentForm(s={},placement={}) {
    const teacher=state.role==='teacher',admin=isAdmin();
    const pairs=teacher?teacherClassSections():classes.flatMap(classNo=>sectionsForClass(classNo).map(section=>({classNo,section})));
    const fixedClass=teacher?(s.classNo||placement.classNo||pairs[0]?.classNo||classes[0]||1):(s.classNo||placement.classNo||classes[0]||1);
    const fixedSection=teacher?(s.section||placement.section||pairs.find(x=>x.classNo===fixedClass)?.section||sections[0]||'A'):(s.section||placement.section||sections[0]||'A');
    const classField=admin?`<select class="field" name="classNo">${selectOptions(classes.map(c=>({value:c,label:`Class ${ordinalClass(c)}`})),fixedClass)}</select>`:`<input class="field" value="${ordinalClass(fixedClass)}" disabled><input type="hidden" name="classNo" value="${fixedClass}">`;
    const sectionField=admin?`<select class="field" name="section">${selectOptions([...sectionsForClass(fixedClass),...(fixedSection==='Unsectioned'&&!sectionsForClass(fixedClass).includes('Unsectioned')?['Unsectioned']:[])],fixedSection)}</select>`:`<input class="field" value="${esc(fixedSection)}" disabled><input type="hidden" name="section" value="${esc(fixedSection)}">`;
    return `<form data-form="student" data-id="${s.id||''}"><div class="form-grid"><div class="form-field"><label>Admission / registration ID</label><input class="field" name="admissionNo" maxlength="80" required value="${esc(s.admissionNo||'')}"></div><div class="form-field"><label>Student name</label><input class="field" name="name" maxlength="120" required value="${esc(s.name||'')}"></div><div class="form-field"><label>Date of birth (optional)</label><input class="field" type="text" name="dob" inputmode="text" autocomplete="bday" maxlength="30" placeholder="DD/MM/YYYY · e.g. 2/3/2020" title="Enter day/month/year. Examples: 2/3/2020, 2-3-20, 2 Mar 2020." value="${esc(formatDateOfBirth(s.dob||''))}"><small class="subtle-note">Use day/month/year. Slashes, hyphens, dots and month names are accepted.</small></div><div class="form-field"><label>Gender</label><select class="field" name="gender">${selectOptions(['Boy','Girl','Not specified'],s.gender||'Not specified')}</select></div><div class="form-field"><label>Class</label>${classField}</div><div class="form-field"><label>Section</label>${sectionField}</div><div class="form-field"><label>Calculated category</label><div class="year-pill" id="student-category-preview">${esc(catForClass(fixedClass))}</div></div></div><div class="info-box">A student’s class and section determine category and programme eligibility. Moving a student keeps their historical registrations and results linked to them.</div><div class="form-actions"><button class="btn" type="button" data-close-modal>Cancel</button><button class="btn btn-primary">Save student</button></div></form>`;
  }
  function studentProgrammePickerForm(student) {
    if(!student||!student.active)return '<div class="empty-state">This student is not available for programme registration.</div>';
    const programmes=db.programmes.filter(p=>!p.archived&&p.status!=='draft'&&isEligible(student,p)).sort((a,b)=>String(a.area).localeCompare(String(b.area))||String(a.itemType||'').localeCompare(String(b.itemType||''))||String(a.category).localeCompare(String(b.category))||String(a.name).localeCompare(String(b.name)));
    const rows=programmes.map(p=>{
      const already=!!db.registrations.some(r=>Number(r.programmeId)===Number(p.id)&&Number(r.studentId)===Number(student.id));
      const quota=already?{ok:false,reason:'Already registered'}:quotaStatus(student,p,{staffOverride:true});
      if(p.category==='Group Item'){
        const team=(db.groupTeams||[]).find(item=>item.programmeId===p.id&&item.mode==='house'&&item.category===catForClass(student.classNo)&&item.house===student.house);
        const canStart=!team&&!!student.house&&quota.ok&&recordCount(p.id)<Number(p.capacity||99999);
        const canJoin=!!team&&quota.ok&&recordCount(p.id)<Number(p.capacity||99999);
        const status=already?'Already registered':!student.house?'Assign a house first':!quota.ok?quota.reason:canStart?'Create this House team':canJoin?'Join existing House team':'Programme capacity reached';
        const action=canStart?btn('Start House team','student-group-team-start','table-action',`data-student="${student.id}" data-programme="${p.id}"`):canJoin?btn('Add to team','student-group-team-join','table-action',`data-student="${student.id}" data-programme="${p.id}" data-team="${team.id}"`):'';
        return `<div class="programme-add-option programme-add-group ${!canStart&&!canJoin?'disabled':''}"><span class="programme-add-copy"><strong>${esc(p.name)}</strong><small>${esc(p.area)} · ${esc(student.house||'No house')} House · ${esc(catForClass(student.classNo))}</small><span class="programme-add-tags">${programmeTypeBadge('group')}${catBadge(p.category)}</span></span><span class="programme-add-status ${!canStart&&!canJoin?'blocked':''}">${esc(status)}</span>${action}</div>`;
      }
      const stateLabel=already?'Already registered':quota.ok?'Available':quota.reason;
      return `<label class="programme-add-option ${!quota.ok?'disabled':''}"><input type="radio" name="programmeId" value="${p.id}" ${!quota.ok?'disabled':''} required><span class="programme-add-copy"><strong>${esc(p.name)}</strong><small>${esc(p.area)} · ${esc(p.category)}${p.gender!=='All'?' · '+esc(p.gender):''}</small><span class="programme-add-tags">${programmeTypeBadge(inferProgrammeType(p.area,p.category,p.name,p.description,p.itemType))}${catBadge(p.category)}</span></span><span class="programme-add-status ${!quota.ok?'blocked':''}">${esc(stateLabel)}</span></label>`;
    }).join('');
    const individualCount=programmes.filter(p=>p.category!=='Group Item').length;
    return `<div class="student-add-target"><div class="student-dot">${esc(initials(student.name))}</div><div><strong>${esc(student.name)}</strong><small>${esc(student.admissionNo)} · ${ordinalClass(student.classNo)} ${esc(student.section||'Unsectioned')} · ${esc(student.gender||'Not specified')} · ${esc(catForClass(student.classNo))}</small></div></div><div class="info-box">Choose any eligible programme. Staff can add students even when the parent registration window is closed. Class/category, gender, house-team rules, programme capacity and the student's choice limits are still enforced. Group Items are added through their House team.</div><form data-form="student-programme-add" data-student="${student.id}"><div class="programme-add-list">${rows||'<div class="empty-state">No eligible programmes are currently available for this student.</div>'}</div><div class="form-actions"><button type="button" class="btn" data-close-modal>Close</button><button class="btn btn-primary" ${individualCount?'':'disabled'}>Add to selected programme</button></div></form>`;
  }

  function studentMoveSingleForm(student) {
    const sectionChoices=[...new Set([...sections,'Unsectioned'])];
    return `<form data-form="student-move-single" data-id="${student.id}"><div class="student-move-summary"><strong>${esc(student.name)}</strong><span>${esc(student.admissionNo)} · Currently ${ordinalClass(student.classNo)} ${esc(student.section||'Unsectioned')}</span></div><p class="subtle-note">Move this one student without moving classmates. This is useful for repeaters after the main promotion. Programme registrations, results and linked parent records remain attached.</p><div class="form-grid"><div class="form-field"><label>Destination class</label><select class="field" name="targetClass" required>${selectOptions(classes.map(c=>({value:c,label:`Class ${ordinalClass(c)}`})),student.classNo)}</select></div><div class="form-field"><label>Destination section</label><select class="field" name="targetSection" required>${selectOptions(sectionChoices,student.section||'Unsectioned')}</select></div></div><div class="form-actions"><button type="button" class="btn" data-close-modal>Cancel</button><button class="btn btn-primary">Move this student</button></div></form>`;
  }
  function studentMoveBulkForm(ids) {
    const selected = ids.map(studentById).filter(student => student && student.active);
    const initial = selected[0] || {};
    const targetClass = classes.includes(Number(initial.classNo)) ? Number(initial.classNo) : (classes[0] || 1);
    const targetSection = String(initial.section || sections[0] || 'Unsectioned');
    const sectionChoices = [...new Set([...sections, 'Unsectioned'])];
    return `<form data-form="student-move-bulk"><p class="subtle-note">Move ${selected.length} selected active student record(s). Programme registrations, results and parent links remain attached to each student.</p><div class="form-grid"><div class="form-field"><label>Destination class</label><select class="field" name="targetClass" required>${selectOptions(classes.map(c=>({value:c,label:`Class ${ordinalClass(c)}`})),targetClass)}</select></div><div class="form-field"><label>Destination section</label><select class="field" name="targetSection" required>${selectOptions(sectionChoices,targetSection)}</select></div></div><div class="form-actions"><button type="button" class="btn" data-close-modal>Cancel</button><button class="btn btn-primary">Move ${selected.length} student(s)</button></div></form>`;
  }

  function teacherPermissionForm(user) {
    const current=db.settings.teacherPermissions?.[String(user.id)]||{};
    const options=[['viewReports','viewReports','Access Reports','Allows the teacher to open and export reports for their assigned classes.'],['addStudents','addStudents','Create student records','Allows adding new student records inside assigned classes.'],['editStudents','editStudents','Edit student details','Allows editing student profile fields inside assigned sections.'],['removeStudents','removeStudents','Archive student records','Allows archiving students inside assigned sections.'],['assignHouses','assignHouses','Assign houses','Allows house assignment for the teacher’s assigned sections.'],['manageSections','manageSections','Add section labels','Allows adding a section label to an assigned class.']];
    return `<form data-form="teacher-permissions" data-id="${user.id}"><p class="subtle-note">Grant or remove access whenever needed. These powers remain active until an administrator changes them. Class-based student powers stay limited to the teacher’s assigned sections. Programme and result administration remain administrator-only.</p><div class="teacher-permission-options">${options.map(([key,name,title,description])=>`<label class="teacher-permission-option"><input type="checkbox" name="${name}" ${current[key]?'checked':''}><span><strong>${title}</strong><small>${description}</small></span></label>`).join('')}</div><div class="form-actions"><button type="button" class="btn" data-close-modal>Cancel</button><button class="btn btn-primary">Save teacher powers</button></div></form>`;
  }
  function sectionAddForm(classNo) {
    return `<form data-form="section-add" data-class="${Number(classNo)}"><p class="subtle-note">This adds a section label to the school-wide section list. Current school configuration uses the same section labels across all classes.</p><div class="form-field"><label>New section label</label><input class="field" name="sectionName" maxlength="15" required placeholder="e.g. F"></div><div class="form-actions"><button type="button" class="btn" data-close-modal>Cancel</button><button class="btn btn-primary">Add section</button></div></form>`;
  }
  function programmeForm(p={},area='Arts',defaultCategory=categoryNames()[0]||'Cat 1') {
    const selectedArea=p.area||area,isGroup=p.category==='Group Item';
    const itemType=inferProgrammeType(selectedArea,p.category||defaultCategory,p.name,p.description,p.itemType);
    const options=selectedArea==='Arts'?[{value:'offstage',label:'Offstage'},{value:'onstage',label:'Onstage'}]:[{value:'track',label:'Track item'},{value:'field',label:'Field item'}];
    return `<form data-form="programme" data-id="${p.id||''}"><div class="form-grid"><div class="form-field full"><label>Programme name</label><input class="field" name="name" maxlength="120" required value="${esc(p.name||'')}" placeholder="e.g. Extempore – Malayalam"><small class="subtle-note">Put any language or variant in the programme name.</small></div><div class="form-field"><label>Area</label><select class="field" name="area">${selectOptions(['Arts','Sports'],selectedArea)}</select></div><div class="form-field"><label>Category</label><select class="field" name="category">${selectOptions([...categoryNames(),'Group Item'],p.category||defaultCategory)}</select></div><div class="form-field" id="programme-type-field" ${isGroup?'hidden':''}><label>${selectedArea==='Arts'?'Arts type':'Sports type'}</label><select class="field" name="itemType">${selectOptions(options,itemType)}</select></div><div class="form-field" id="programme-gender-field"><label>Gender</label><select class="field" name="gender">${selectOptions(['All','Boys','Girls'],p.gender||'All')}</select></div><div class="form-field"><label>Capacity</label><input class="field" type="number" min="1" max="5000" name="capacity" value="${p.capacity||80}" required></div><div class="form-field" id="group-mode-field"><label>Group Item participation</label><select class="field" name="groupMode"><option value="house" selected>House-based school team</option></select><small class="subtle-note">Each team represents one House.</small></div><div class="form-field" id="group-scope-field"><label>Group Item eligibility</label><select class="field" name="groupScope">${selectOptions([{value:'classes',label:'Inclusive class range'},{value:'categories',label:'Selected categories'}],p.groupScope||'classes')}</select></div><div class="form-field" id="class-min-field"><label>Minimum class</label><select class="field" name="classMin">${selectOptions(classes.map(c=>({value:c,label:`Class ${c}`})),p.classMin||1)}</select></div><div class="form-field" id="class-max-field"><label>Maximum class</label><select class="field" name="classMax">${selectOptions(classes.map(c=>({value:c,label:`Class ${c}`})),p.classMax||5)}</select></div><div class="form-field full" id="eligible-categories-field"><label>Group Item categories</label><div class="checkbox-grid">${categoryNames().map(c=>`<label class="check-tile"><input type="checkbox" name="eligibleCategories" value="${esc(c)}" ${(p.eligibleCategories||[]).includes(c)?'checked':''}>${esc(c)}</label>`).join('')}</div></div><div class="form-field"><label>Choices open</label><input class="field" type="date" name="openDate" value="${esc(p.openDate||'')}"></div><div class="form-field"><label>Choices close</label><input class="field" type="date" name="closeDate" value="${esc(p.closeDate||'')}"></div><div class="form-field"><label>Status</label><select class="field" name="status">${selectOptions([{value:'draft',label:'Draft'},{value:'open',label:'Open'},{value:'closed',label:'Closed'}],p.status||'open')}</select></div><div class="form-field full"><label>Description / instructions</label><textarea class="field textarea" name="description" maxlength="800">${esc(p.description||'')}</textarea></div></div><div class="info-box">Arts are separated into Onstage and Offstage; Sports into Track and Field. The choice limits for these types are configured separately and can be changed later. Group Items remain House-based.</div><div class="form-actions"><button type="button" class="btn" data-close-modal>Cancel</button><button class="btn btn-primary">Save programme</button></div></form>`;
  }
  function eventForm(e={}) {
    const date=e.date||schoolTodayKey();
    const endDate=e.endDate||date;
    return `<form data-form="event" data-id="${e.id||''}"><div class="form-grid"><div class="form-field full"><label>Event title</label><input class="field" name="title" required maxlength="120" value="${esc(e.title||'')}"></div><div class="form-field"><label>Starts on</label><input class="field" type="date" name="date" required value="${esc(date)}"></div><div class="form-field"><label>Ends on</label><input class="field" type="date" name="endDate" required value="${esc(endDate)}"></div><div class="form-field"><label>Start time (IST)</label><input class="field" type="time" name="time" value="${esc(e.time||'')}"></div><div class="form-field"><label>End time (IST)</label><input class="field" type="time" name="endTime" value="${esc(e.endTime||'')}"></div><div class="form-field full"><label class="check-tile"><input type="checkbox" name="allDay" ${(e.allDay??!e.time)?'checked':''}> All-day event</label></div><div class="form-field"><label>Venue</label><input class="field" name="venue" maxlength="100" value="${esc(e.venue||'')}"></div><div class="form-field"><label>Event type</label><select class="field" name="type">${selectOptions(['Arts','Sports','School event','Rehearsal','Exam','Holiday','Meeting','Notice','Other'],e.type||'School event')}</select></div><div class="form-field"><label>Coordinator</label><input class="field" name="coordinator" maxlength="100" value="${esc(e.coordinator||'')}"></div><div class="form-field"><label>Who can see this?</label><select class="field" name="audience">${selectOptions([{value:'Everyone',label:'Everyone'},{value:'Parents and students',label:'Parents and students'},{value:'Teachers',label:'Teachers only'},{value:'Staff only',label:'Staff only'}],e.audience||'Everyone')}</select></div><div class="form-field"><label>Publication</label><select class="field" name="published">${selectOptions([{value:'true',label:'Published'},{value:'false',label:'Draft / private'}],String(e.published??true))}</select></div><div class="form-field full"><label>Description / details</label><textarea class="field textarea" name="description" rows="3" maxlength="800">${esc(e.description||'')}</textarea></div></div><div class="info-box">Events are ordered by their actual school date. Use the school’s local time (IST). Past events remain available under Past events.</div><div class="form-actions"><button type="button" class="btn" data-close-modal>Cancel</button><button class="btn btn-primary">Save event</button></div></form>`;
  }

  function unsectionedAssignForm(classNo,studentIds) {
    const allowed=isAdmin()?sections:teacherClassSections().filter(pair=>pair.classNo===Number(classNo)).map(pair=>pair.section);
    const targets=[...new Set(allowed.filter(section=>section!=='Unsectioned'))];
    return `<form data-form="student-assign-unsectioned" data-class="${Number(classNo)}"><input type="hidden" name="studentIds" value="${esc(studentIds.join(','))}"><div class="info-box">${studentIds.length} selected student(s) from ${ordinalClass(classNo)}. They will be moved out of Unsectioned into one section. ${isAdmin()?'Administrators can choose any configured section.':'Teachers can choose only their assigned section(s) in this class.'}</div><div class="form-field"><label>Destination section</label><select class="field" name="targetSection" required><option value="">Choose section</option>${selectOptions(targets)}</select></div><div class="form-actions"><button type="button" class="btn" data-close-modal>Cancel</button><button class="btn btn-primary">Assign selected students</button></div></form>`;
  }
  function staffForm(u={}, defaultRole='teacher') {
    const linked=new Set(u.linkedStudentIds|| (u.linkedStudentId?[u.linkedStudentId]:[]));
    const linkedRecords=[...linked].map(studentById).filter(st=>st&&st.active);
    const initialClass=linkedRecords[0]?.classNo||'';
    const initialSection=linkedRecords[0]?.section||'';
    const initialCandidateList=[...new Map([...linkedRecords,...db.students.filter(st=>st.active&&st.classNo===Number(initialClass)&&st.section===initialSection)].map(st=>[st.id,st])).values()];
    const accountRole=u.role||defaultRole;
    const accountRoleLabel=accountRole==='admin'?'Administrator':accountRole==='teacher'?'Teacher':'Parent / guardian';
    return `<form data-form="staff" data-id="${u.id||''}"><input type="hidden" name="role" value="${esc(accountRole)}"><div class="form-grid"><div class="form-field full"><label>Display name</label><input class="field" name="displayName" maxlength="120" required value="${esc(u.displayName||'')}"></div><div class="form-field"><label>Account type</label><div class="field account-role-fixed">${accountRoleLabel}</div></div><div class="form-field"><label>Account status</label><select class="field" name="active">${selectOptions([{value:'true',label:'Active'},{value:'false',label:'Disabled'}],String(u.active??true))}</select></div>
      <div class="form-field full" id="staff-parent-link"><label>Assigned classes</label><p class="subtle-note">Assign each parent or guardian to one or more class groups. Select every class this family account should appear under. Classes of linked children are included automatically when the account is saved.</p><div class="checkbox-grid parent-class-assignment-grid">${classes.map(classNo=>`<label class="check-tile"><input type="checkbox" name="parentClassNumbers" value="${classNo}" ${(Array.isArray(u.classNumbers)&&u.classNumbers.includes(classNo)||linkedRecords.some(st=>Number(st.classNo)===classNo))?'checked':''}>Class ${classNo}</label>`).join('')}</div><div class="parent-child-link-heading"><strong>Link child or children</strong><span>Only linked children can be viewed by this parent account.</span></div><div class="form-grid"><div class="form-field"><label>Find class</label><select class="field" id="staff-parent-class"><option value="">Choose class</option>${selectOptions(classes.map(c=>({value:c,label:`Class ${c}`})),initialClass)}</select></div><div class="form-field"><label>Find section</label><select class="field" id="staff-parent-section"><option value="">Choose section</option>${selectOptions(sections,initialSection)}</select></div></div><div id="staff-parent-child-options">${initialCandidateList.length?`<div class="checkbox-grid">${initialCandidateList.map(st=>`<label class="check-tile"><input type="checkbox" name="linkedStudentIds" value="${st.id}" ${linked.has(st.id)?'checked':''}>${esc(st.name)} · Class ${st.classNo}${esc(st.section)} · ${esc(st.admissionNo)}</label>`).join('')}</div>`:'<p class="subtle-note">Choose a class and section to find the child to link.</p>'}</div></div>
<div class="form-field full" id="staff-class-assign"><div class="info-box">Class teacher assignments are managed separately in Administration → Class teachers. A teacher account can be created without a class assignment.</div></div></div><div class="info-box">Teacher access is determined only by assigned sections. A teacher can browse those sections and add a student to an eligible existing programme. Only administrators can create or edit programmes, quotas, dates, eligibility, ranks and Sahodaya selections.</div><div class="form-actions"><button type="button" class="btn" data-close-modal>Cancel</button><button class="btn btn-primary">Save account</button></div></form>`;
  }
  function rankForm(p, selectedStudentId=null) {
    const regs=db.registrations.filter(r=>r.programmeId===p.id).map(r=>studentById(r.studentId)).filter(st=>st?.active&&isEligible(st,p));
    const selectedId=selectedStudentId||'';
    const current=db.results.find(r=>r.programmeId===p.id&&r.studentId===Number(selectedId));
    return `<form data-form="result" data-programme="${p.id}"><div class="form-field"><label>Registered student</label>${hierarchicalStudentPicker(regs,selectedId,'Choose registered student')}</div><div class="form-field" style="margin-top:10px"><label>Rank</label><select class="field" name="rank"><option value="">No rank recorded</option><option value="1" ${current?.rank===1?'selected':''}>1st place</option><option value="2" ${current?.rank===2?'selected':''}>2nd place</option><option value="3" ${current?.rank===3?'selected':''}>3rd place</option></select></div><div class="form-field" style="margin-top:10px"><label>Notes (optional)</label><textarea class="field textarea" name="notes"></textarea></div><div class="form-actions"><button class="btn btn-primary">Save rank</button></div></form>`;
  }
  function rankRecordsMarkup(p) {
    const records=db.results.filter(r=>r.programmeId===p.id).map(r=>({result:r,student:studentById(r.studentId)})).filter(x=>x.student).sort((a,b)=>a.student.classNo-b.student.classNo||a.student.section.localeCompare(b.student.section)||a.student.name.localeCompare(b.student.name));
    if(!records.length)return '<p class="subtle-note">No ranks recorded yet.</p>';
    const byClass=[...new Set(records.map(x=>x.student.classNo))].sort((a,b)=>a-b);
    return byClass.map(classNo=>{
      const classRecords=records.filter(x=>x.student.classNo===classNo);
      const bySection=[...new Set(classRecords.map(x=>x.student.section))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
      return `<section class="rank-class-group"><h4>Class ${classNo}</h4>${bySection.map(section=>`<div class="rank-section-group"><strong>Section ${esc(section)}</strong>${classRecords.filter(x=>x.student.section===section).map(({result,student})=>`<div class="candidate-row"><span><strong>${esc(student.name)}</strong><small class="winner-meta">${esc(student.admissionNo)} · ${esc(student.gender)}</small><small class="subtle-note">${result.rank}${result.rank===1?'st':result.rank===2?'nd':'rd'} place</small></span>${btn('Edit','rank-edit','table-action',`data-programme="${p.id}" data-id="${student.id}"`)+btn('Clear','rank-clear','table-action danger',`data-programme="${p.id}" data-id="${student.id}"`)}</div>`).join('')}</div>`).join('')}</section>`;
    }).join('');
  }
  function sahodayaForm(p) {
    const selected=db.selections.find(x=>x.programmeId===p.id);
    const initialCandidates=selected?.pathway==='Direct Sahodaya Entry'?db.students.filter(st=>isEligible(st,p)):db.registrations.filter(r=>r.programmeId===p.id).map(r=>studentById(r.studentId)).filter(st=>isEligible(st,p));
    return `<form data-form="sahodaya" data-programme="${p.id}"><p class="subtle-note">This is a separate school decision. It does not automatically follow the first-place winner. No representative is a valid outcome.</p><div class="form-field"><label>Selection pathway</label><select class="field" name="pathway"><option ${!selected||selected.pathway==='School competition'?'selected':''}>School competition</option><option ${selected?.pathway==='Direct Sahodaya Entry'?'selected':''}>Direct Sahodaya Entry</option></select></div><div class="form-field" style="margin-top:10px"><label>Confirmed representative</label><div data-sahodaya-picker>${hierarchicalStudentPicker(initialCandidates,selected?.studentId||'','Choose representative')}</div></div><div class="form-actions"><button class="btn btn-primary">Confirm selection</button></div></form>`;
  }
  function clearElectionBallotStorage(electionId){
    return clearElectionBallotChunks(electionId);
  }
  function electionResetForm(e, mode) {
    const keepCandidates=mode==='ballots';
    const action=keepCandidates?'election-reset-ballots':'election-reset-full';
    const phrase=keepCandidates?'CLEAR ELECTION BALLOTS':'RESET FULL ELECTION';
    const title=keepCandidates?'Clear election ballots':'Reset full election';
    const description=keepCandidates
      ?'This removes every anonymous ballot and legacy token, returns the election to Draft, and creates a new public link. The title, schedule, positions and candidates are kept.'
      :'This permanently deletes this election, including its positions, candidates, ballots and links. Other elections and all school/student records remain untouched.';
    return `<form data-form="${action}" data-id="${e.id}"><div class="warning-box"><strong>${title}: irreversible action</strong><p>${description}</p></div><div class="form-field"><label>Type <strong>${phrase}</strong> to confirm</label><input class="field" name="confirmation" autocomplete="off" spellcheck="false" placeholder="${phrase}" required></div><div class="form-actions"><button type="button" class="btn" data-close-modal>Cancel</button><button class="btn ${keepCandidates?'btn-secondary':'btn-danger'}">${title}</button></div></form>`;
  }

  function createElectionForm() { return `<form data-form="election-create"><div class="form-grid"><div class="form-field full"><label>Election title</label><input class="field" name="title" required placeholder="Student Council Election"></div><div class="form-field"><label>Voting opens (IST)</label><input class="field" type="datetime-local" name="openAt" required></div><div class="form-field"><label>Voting closes (IST)</label><input class="field" type="datetime-local" name="closeAt" required></div></div><div class="form-actions"><button class="btn btn-primary">Create election</button></div></form>`; }

  function handleAction(action, el) {
    if(databaseRecoveryError&&action!=='backup-import'&&action!=='fullscreen')return toast('The saved school data needs recovery. Restore a valid backup before using the portal.','error');
    const adminOnly = new Set(['admin-back-to-portal','account-panel','admin-tab','student-show-archived','student-restore','student-import','programme-add','programme-edit','programme-archive','programme-restore','programme-duplicate','result-manage','rank-edit','rank-clear','event-add','event-edit','event-delete','staff-add','staff-edit','staff-disable','teacher-manage-powers','house-apply-selected','house-select-all','house-select-student','student-move-selected','student-move-one','student-move-picked','programme-export','registration-export','audit-export','backup-export','backup-import','demo-reset','annual-data-reset','election-add','election-toggle','election-select-admin','election-copy-vote-link','election-copy-live-link','election-open-vote-link','election-open-live-link','election-codes','election-codes-revoke','position-add','position-candidate-add','position-remove','candidate-remove','candidate-edit','participation-manager-export','participation-manager-export-xlsx','participation-manager-clear','deadline-select-all','deadline-select-none','results-filter-clear','programme-export-xlsx','registration-export-xlsx','admin-registration-add']);
    if (adminOnly.has(action) && !isAdmin()) { toast('This action is available to administrators only.', 'error'); return; }
    if (action === 'student-export' && !['admin','teacher'].includes(state.role)) { toast('Directory export is not available to this role.', 'error'); return; }
    if (action === 'navigate' && !pageAllowed(el.dataset.page)) { toast('This workspace is not available to the selected role.', 'warning'); return; }
    const id=Number(el.dataset.id); const p=programmeById(id); const s=studentById(id); const u=db.users.find(x=>x.id===id); const e=electionDb.elections.find(x=>x.id===id);
    switch(action) {
      case 'navigate': navigate(el.dataset.page); break;
      case 'admin-back-to-portal':
        if(!isAdmin())return toast('Administrator access required.','error');
        state.adminTab='overview';
        navigate('dashboard');
        break;
      case 'not-registered-area': state.notRegisteredBrowser={area:['Arts','Sports','Both'].includes(el.dataset.area)?el.dataset.area:'Both'};render();break;
      case 'student-browse-class': {const target=el.dataset.admin==='1'?state.adminStudentBrowser:state.studentBrowser;const classNo=Number(el.dataset.class);const allowed=state.role==='teacher'?teacherClassSections().some(x=>x.classNo===classNo):isAdmin();if(!allowed)return toast('This class is outside your assigned sections.','error');target.classNo=Number(target.classNo)===classNo?null:classNo;target.section=null;target.q='';render();break;}
      case 'student-browse-section': {const target=el.dataset.admin==='1'?state.adminStudentBrowser:state.studentBrowser;const classNo=Number(el.dataset.class),section=el.dataset.section;const allowed=isAdmin()||state.role==='teacher'&&(section==='Unsectioned'?teacherCanManageUnsectionedClass(classNo):teacherCanAccessSection(classNo,section));if(!allowed)return toast('This section is outside your assigned access.','error');target.classNo=classNo;target.section=section;target.q='';render();break;}
      case 'student-browse-back': {const target=el.dataset.admin==='1'?state.adminStudentBrowser:state.studentBrowser;target.section=null;target.q='';render();break;}
      case 'programme-roster-class': {const classNo=Number(el.dataset.class);const allowed=isAdmin()||state.role==='teacher';if(!allowed)return toast('Programme management is restricted to staff.','error');state.programmeDetailBrowser={classNo:Number(state.programmeDetailBrowser?.classNo)===classNo?null:classNo,section:null};render();break;}
      case 'programme-roster-section': {const classNo=Number(el.dataset.class),section=String(el.dataset.section||'');const allowed=isAdmin()||state.role==='teacher';if(!allowed)return toast('Programme management is restricted to staff.','error');state.programmeDetailBrowser={classNo,section};state.programmeDetailFilters={};render();break;}
      case 'programme-roster-back': state.programmeDetailBrowser.section=null;state.programmeDetailFilters={};render();break;
      case 'admin-tab': if(!isAdmin())return toast('Administrator access required.','error');state.adminTab=el.dataset.tab;closeSidebar();render();break;
      case 'section-add': {const classNo=Number(el.dataset.class),teacher=state.role==='teacher'?userByRole('teacher'):null;if(!isAdmin()&&(!teacher||!teacherCanAddSections(teacher.id,classNo)))return toast('Section-adding permission is not enabled for this class.','error');openModal(`Add section to ${ordinalClass(classNo)}`,sectionAddForm(classNo),'SCHOOL SECTIONS');break;}
      case 'election-select-admin': if(!isAdmin())return toast('Administrator access required.','error');state.electionId=id;state.adminTab='elections';render();break;
      case 'registration-browse-class': {if(!isAdmin())return toast('Administrator access required.','error');const classNo=Number(el.dataset.class);state.adminRegistrationBrowser={classNo:Number(state.adminRegistrationBrowser?.classNo)===classNo?null:classNo,section:null};state.adminRegistrationFilters={};render();break;}
      case 'registration-browse-section': {if(!isAdmin())return toast('Administrator access required.','error');state.adminRegistrationBrowser={classNo:Number(el.dataset.class),section:String(el.dataset.section||'')};state.adminRegistrationFilters={};render();break;}
      case 'registration-browse-back': if(!isAdmin())return toast('Administrator access required.','error');state.adminRegistrationBrowser.section=null;state.adminRegistrationFilters={};render();break;
      case 'election-copy-vote-link': if(isAdmin()&&e){copyText(electionPublicUrl(e,'poll.html'));}break;
      case 'election-copy-live-link': if(isAdmin()&&e){copyText(electionPublicUrl(e,'poll-live.html'));}break;
      case 'election-open-vote-link': if(isAdmin()&&e){window.open(electionPublicUrl(e,'poll.html'),'_blank','noopener');}break;
      case 'election-open-live-link': if(isAdmin()&&e){window.open(electionPublicUrl(e,'poll-live.html'),'_blank','noopener');}break;
      case 'portal-tab': state.parentTab=el.dataset.tab; render(); break;
      case 'report-custom-students': { if(!['admin','teacher'].includes(state.role))return toast('Only staff can create custom report selections.','error'); const allowed=db.students.filter(st=>st.active&&(isAdmin()||canViewStudent(st))).sort((a,b)=>a.classNo-b.classNo||String(a.section).localeCompare(String(b.section))||a.name.localeCompare(b.name)); const selected=new Set(state.reportPrint?.customStudentIds||[]); const rows=allowed.map(st=>`<label class="check-tile"><input type="checkbox" name="reportCustomStudent" value="${st.id}" ${selected.has(st.id)?'checked':''}>${esc(st.name)} · ${ordinalClass(st.classNo)} ${esc(st.section)} · ${esc(st.house||'No house')}</label>`).join(''); openModal('Custom students for report',`<form data-form="report-custom-students"><p class="subtle-note">These students are added only to the printed report. Nothing is registered or changed in the programme system.</p><div class="checkbox-grid">${rows||'<p class="subtle-note">No active students are available.</p>'}</div><div class="form-actions"><button type="button" class="btn" data-close-modal>Cancel</button><button class="btn btn-primary">Use selected students</button></div></form>`,'REPORT CUSTOM SELECTION'); break; }
case 'physical-print-area': state.reportPrint={...state.reportPrint,area:el.dataset.area,programme:''};render();break;
      case 'physical-print-clear': state.reportPrint={...state.reportPrint,q:'',programme:'',age:'',gender:'',classNo:'',section:'',house:'',category:'',customStudentIds:[]};render();break;
      case 'physical-print': { const area=el.dataset.area||state.reportPrint.area||'Sports'; if(area!==state.reportPrint.area)return toast(`Choose the ${area} print tab before printing its registration sheet.`,'warning'); const old=document.getElementById('physical-print-region'); if(old) old.remove(); const host=document.createElement('div');host.innerHTML=buildPhysicalPrintRegion(area);document.body.appendChild(host.firstElementChild);document.body.classList.add('printing-physical-registration');const cleanup=()=>{document.body.classList.remove('printing-physical-registration');document.getElementById('physical-print-region')?.remove();window.removeEventListener('afterprint',cleanup);};window.addEventListener('afterprint',cleanup);window.print();setTimeout(cleanup,1800);break; }
      case 'report-group': state.reportFilters.group=el.dataset.group;state.reportBrowser={classNo:null,section:null};render();break;
      case 'report-browse-class': {const classNo=Number(el.dataset.class);if(!(isAdmin()||state.role==='teacher'&&teacherClassSections().some(x=>x.classNo===classNo)))return toast('That class is outside your assigned access.','error');state.reportBrowser={classNo:Number(state.reportBrowser?.classNo)===classNo?null:classNo,section:null};render();break;}
      case 'report-browse-section': {const classNo=Number(el.dataset.class),section=String(el.dataset.section||'');if(!(isAdmin()||state.role==='teacher'&&teacherClassSections().some(x=>x.classNo===classNo&&x.section===section)))return toast('That section is outside your assigned access.','error');state.reportBrowser={classNo,section};state.reportFilters.q='';render();break;}
      case 'report-browse-back': state.reportBrowser.section=null;state.reportFilters.q='';render();break;
      case 'teacher-manage-powers': {if(!isAdmin()||!u||u.role!=='teacher')return toast('Choose a teacher account.','error');openModal('Manage teacher powers',teacherPermissionForm(u),'TEACHER ACCESS');break;}
      case 'student-assign-unsectioned': {
        const classNo=Number((state.page==='admin'?state.adminStudentBrowser:state.studentBrowser).classNo),browser=state.page==='admin'?state.adminStudentBrowser:state.studentBrowser;
        if(!(isAdmin()||state.role==='teacher'&&teacherCanManageUnsectionedClass(classNo))||browser.section!=='Unsectioned')return toast('Open Unsectioned in a class you are allowed to manage.','error');
        const ids=$$('input[data-select-student]:checked').map(input=>Number(input.value));
        const candidates=ids.map(studentById);
        if(!ids.length)return toast('Select at least one unsectioned student first.','warning');
        if(candidates.some(student=>!student||!student.active||student.classNo!==classNo||student.section!=='Unsectioned'))return toast('The selected rows changed. Refresh and select them again.','error');
        state.selectedUnsectionedIds=ids;openModal(`Assign ${ids.length} student(s) · ${ordinalClass(classNo)}`,unsectionedAssignForm(classNo,ids),'SECTION ASSIGNMENT');break;
      }
      case 'student-add': {
        const classNo=Number(el.dataset.class), section=String(el.dataset.section||'');
        if(!canAddStudentToSection(classNo,section))return toast('Student-add permission is not enabled for this section.','error');
        if(!classes.includes(classNo)||(!sections.includes(section)&&section!=='Unsectioned'))return toast('Choose a configured class and section.','error');
        state.pendingStudentPlacement={classNo,section};
        openModal(`Add student · ${ordinalClass(classNo)} ${section}`,studentForm({},state.pendingStudentPlacement),'STUDENT RECORDS');
        break;
      }
      case 'student-add-programme': {
        if(!['admin','teacher'].includes(state.role))return toast('Only staff can add students to programmes.','error');
        if(!s||!s.active||!canViewStudent(s))return toast('This student is outside your assigned access.','error');
        openModal(`Add programme · ${s.name}`,studentProgrammePickerForm(s),'PROGRAMME REGISTRATION');
        break;
      }
      case 'student-edit': {
        if(!s||!s.active||!canEditStudent(s))return toast('You do not have permission to edit this student record.','error');
        state.pendingStudentPlacement={classNo:s.classNo,section:s.section};
        openModal(`Edit student · ${s.name}`,studentForm(s,{classNo:s.classNo,section:s.section}),'STUDENT RECORDS');
        break;
      }
      case 'student-view': {
        if(!s||!s.active||!canViewStudent(s))return toast('This student record is outside your assigned access.','error');
        const details=`<div class="settings-card student-basic-profile"><h3>${esc(s.name)}</h3><div class="detail-grid"><div><small>Admission ID</small><strong>${esc(s.admissionNo)}</strong></div><div><small>Class / section</small><strong>${ordinalClass(s.classNo)} ${esc(s.section||'Unsectioned')}</strong></div><div><small>Date of birth</small><strong>${esc(s.dob?formatDateOfBirth(s.dob):'Not recorded')}</strong></div><div><small>Age</small><strong>${studentAgeText(s)}${studentAge(s)===null?'':' years'}</strong></div><div><small>Gender</small><strong>${esc(s.gender||'Not specified')}</strong></div><div><small>House</small><strong>${esc(s.house||'Unassigned')}</strong></div></div></div>`;
        openModal(`Student profile · ${s.name}`,details,'STUDENT DETAILS');
        break;
      }
      case 'student-move-one': {
        if(!isAdmin())return toast('Only administrators can move student records.','error');
        if(!s||!s.active)return toast('Choose an active student record.','error');
        openModal(`Move ${s.name}`,studentMoveSingleForm(s),'INDIVIDUAL STUDENT MOVEMENT');break;
      }
      case 'student-move-picked': {
        if(!isAdmin())return toast('Only administrators can move student records.','error');
        const select=$('#movement-student-select'),student=studentById(Number(select?.value));
        if(!student||!student.active)return toast('Choose an active student first.','warning');
        openModal(`Move ${student.name}`,studentMoveSingleForm(student),'INDIVIDUAL STUDENT MOVEMENT');break;
      }
      case 'student-move-selected': {
        if(!isAdmin())return toast('Only administrators can move students.','error');
        const browser=state.adminStudentBrowser||{};
        const checked=$$('[data-select-student]:checked').map(input=>Number(input.value)).filter(Number.isSafeInteger);
        const selected=[...new Set(checked)].map(studentById);
        if(!selected.length)return toast('Select at least one student to move.','warning');
        if(selected.some(student=>!student||!student.active||student.classNo!==Number(browser.classNo)||student.section!==String(browser.section)))return toast('The selection contains an inactive or out-of-section student. Refresh the list and select again.','error');
        state.selectedMoveStudentIds=selected.map(student=>student.id);
        openModal(`Move ${selected.length} selected student(s)`,studentMoveBulkForm(state.selectedMoveStudentIds),'STUDENT MOVEMENT');
        break;
      }
      case 'student-archive': if(s&&canRemoveStudentRecord(s)&&confirm(`Archive ${s.name}? Historical programme records will remain.`)){s.active=false;audit('student_archived','Student',`${s.name} · ${state.role==='teacher'?'granted teacher permission':'administrator'}`);if(!saveDatabase()){render();return toast('Student archive could not be saved. The previous saved record was restored.','error');}render();toast('Student archived.');} else if(s&&!canRemoveStudentRecord(s))toast('You do not have permission to archive students in this section.','error'); break;
      case 'student-show-archived':state.showArchivedStudents=!state.showArchivedStudents;render();break;
      case 'student-restore':if(isAdmin()&&s){if(db.students.some(x=>x.id!==s.id&&x.active&&x.admissionNo.toLowerCase()===s.admissionNo.toLowerCase()))return toast('An active student already uses this admission number.','error');s.active=true;audit('student_restored','Student',s.name);if(!saveDatabase()){render();return toast('Student restore could not be saved. The previous saved record was restored.','error');}render();toast('Student restored.');}break;
      case 'student-filter-clear':state.studentFilters={};render();break;
      case 'student-import': $('#student-file')?.click();break;
      case 'student-export': exportStudents();break;
      case 'student-export-xlsx': {if(!['admin','teacher'].includes(state.role))return toast('Directory export is not available to this role.','error');const rows=studentExportRows();if(!rows.length)return toast('Open a class and section before exporting student names.','warning');const b=state.role==='admin'?state.adminStudentBrowser:state.studentBrowser;exportExcelRows(rows,`class-${b.classNo}-${b.section}-students.xlsx`,'Students');break;}
      case 'programme-open':{
        if(!p||(p.archived||p.status==='draft')&&!isAdmin())return toast('That programme is not available.','error');
        const linked=state.role==='parent'?currentLinkedStudent():null;
        if(state.role==='parent'&&(!linked||p.status==='draft'||!isEligible(linked,p)))return toast('That programme is not published or eligible for the linked student.','error');
        state.programmeId=id;state.programmeDetailFilters={registration:'participating',sort:'class',moreOpen:false};state.programmeDetailBrowser={classNo:null,section:null};state.programmeArea=p.area.toLowerCase();state.page='programme-detail';updateRouteHistory(`programmes/${id}`);render();break;
      }
      case 'programme-add':if(isAdmin())openModal('Create programme',programmeForm({},el.dataset.area||'Arts',el.dataset.category||categoryNames()[0]||'Cat 1'),'PROGRAMME EDITOR');else toast('Programme control is administrator-only.','error');break;
      case 'programme-edit':if(isAdmin()&&p)openModal('Edit programme',programmeForm(p,p.area),'PROGRAMME EDITOR');break;
      case 'group-team-add':if(['admin','teacher'].includes(state.role)&&p&&p.category==='Group Item')openModal(`Create team · ${p.name}`,groupTeamForm(p),'GROUP ITEM TEAM');else toast('Open a valid Group Item to create a team.','error');break;
      case 'student-group-team-start':{const student=studentById(Number(el.dataset.student)),prog=programmeById(Number(el.dataset.programme));if(!['admin','teacher'].includes(state.role)||!student||!prog||!canViewStudent(student))return toast('This student is outside your access.','error');closeModal();openModal(`Start House team · ${prog.name}`,groupTeamForm(prog,student.id),'GROUP ITEM TEAM');break;}
      case 'student-group-team-join':{const student=studentById(Number(el.dataset.student)),prog=programmeById(Number(el.dataset.programme)),team=(db.groupTeams||[]).find(x=>Number(x.id)===Number(el.dataset.team));if(!['admin','teacher'].includes(state.role)||!student||!prog||!team||!canViewStudent(student))return toast('This student or House team is no longer available.','error');const result=addStudentsToGroupTeam(prog,team,[student.id]);if(!result.ok)return toast(result.reason,'error');closeModal();render();toast(`${student.name} added to ${groupTeamLabel(team)}.`);break;}
      case 'programme-archive':if(isAdmin()&&p&&confirm(`Archive ${p.name} (${p.category}${p.gender!=='All'?' · '+p.gender:''})?`)){p.archived=true;audit('programme_archived','Programme',p.code);if(!saveDatabase()){render();return toast('Programme archive could not be saved. The previous programme state was restored.','error');}render();toast('Programme archived.');}break;
      case 'programme-restore':if(isAdmin()&&p){p.archived=false;audit('programme_restored','Programme',p.code);if(!saveDatabase()){render();return toast('Programme restore could not be saved. The previous programme state was restored.','error');}render();}break;
      case 'programme-duplicate':if(isAdmin()&&p){const copy=JSON.parse(JSON.stringify(p));copy.id=db.nextIds.programme++;copy.code=`${p.code}-COPY-${copy.id}`;copy.name=`${p.name} (copy)`;copy.archived=false;copy.status='draft';db.programmes.push(copy);audit('programme_duplicated','Programme',copy.code);if(!saveDatabase()){render();return toast('Programme copy could not be saved. No duplicate was retained.','error');}render();toast('Programme copied as a draft.');}break;
      case 'programme-filter-clear':if(el.dataset.kind==='admin')state.adminProgrammeFilters={};else state.programmeFilters[el.dataset.kind]={};render();break;
      case 'programme-filters-toggle':if(el.dataset.kind==='admin')state.adminProgrammeFilters={...state.adminProgrammeFilters,moreOpen:!state.adminProgrammeFilters.moreOpen};else{const kind=el.dataset.kind;state.programmeFilters[kind]={...(state.programmeFilters[kind]||{}),moreOpen:!state.programmeFilters[kind]?.moreOpen};}render();break;
      case 'detail-filters-toggle':state.programmeDetailFilters={...state.programmeDetailFilters,moreOpen:!state.programmeDetailFilters.moreOpen};render();break;
      case 'registration-add':{const prog=programmeById(el.dataset.programme),student=studentById(id);if((isAdmin()||state.role==='teacher')&&prog&&student)manualRegister(prog,student);break;}
      case 'portal-select':{
        if(state.role!=='parent')return toast('Only a linked parent account can choose programmes for a child.','error');
        const student=currentLinkedStudent(),prog=programmeById(id);
        if(prog?.category==='Group Item')return toast('Group Items can only be added by a teacher. Please ask the teacher to add your child.','warning');
        if(!student||!prog||!isEligible(student,prog))return toast('This programme is not eligible for the linked student.','error');
        if(!programmeOpen(prog))return toast('This programme is not accepting choices now.','error');
        const q=quotaStatus(student,prog);if(!q.ok){toast(q.reason,'warning');return;}
        db.registrations.push({id:db.nextIds.registration++,programmeId:prog.id,studentId:student.id,createdAt:localDateString()});audit('child_registration_added',prog.name,student.name);if(!saveDatabase()){render();return toast('The programme choice could not be saved. The previous saved choices were restored.','error');}render();toast('Your child has been added to this programme.');break;
      }
      case 'participation-manager-clear':state.adminRegistrationFilters={sort:'programme',moreOpen:false};render();break;
      case 'deadline-select-all':$$('input[name="programmeIds"]',$('#page-content')).forEach(input=>input.checked=true);break;
      case 'deadline-select-none':$$('input[name="programmeIds"]',$('#page-content')).forEach(input=>input.checked=false);break;
      case 'results-filters-toggle':state.resultsFilters={...state.resultsFilters,moreOpen:!state.resultsFilters.moreOpen};render();break;
      case 'report-filters-toggle':state.reportFilters={...state.reportFilters,moreOpen:!state.reportFilters.moreOpen};render();break;
      case 'results-filter-clear':state.resultsFilters={sort:'name',moreOpen:true};render();break;
      case 'results-export':exportResults();break;
      case 'participation-manager-export':case 'participation-manager-export-xlsx':{if(!isAdmin())return toast('Full-school registration export is administrator-only.','error');const f=state.adminRegistrationFilters||{};let rows=db.registrations.map(r=>({r,s:studentById(r.studentId),p:programmeById(r.programmeId)})).filter(x=>x.s&&x.p&&x.s.active);const browser=state.adminRegistrationBrowser||{};if(!browser.classNo||!browser.section)return toast('Open a class and section before exporting names.','warning');rows=rows.filter(x=>x.s.classNo===Number(browser.classNo)&&x.s.section===browser.section);if(f.age)rows=rows.filter(x=>matchesAgeFilter(x.s,f.age));if(f.q)rows=rows.filter(x=>x.s.name.toLowerCase().includes(f.q.toLowerCase())||x.s.admissionNo.toLowerCase().includes(f.q.toLowerCase())||x.p.name.toLowerCase().includes(f.q.toLowerCase())||x.p.code.toLowerCase().includes(f.q.toLowerCase()));if(f.area)rows=rows.filter(x=>x.p.area===f.area);if(f.programme)rows=rows.filter(x=>x.p.id===Number(f.programme));if(f.classNo)rows=rows.filter(x=>x.s.classNo===Number(f.classNo));if(f.category)rows=rows.filter(x=>catForClass(x.s.classNo)===f.category);const regSort=f.sort||'programme';rows.sort((a,b)=>regSort==='name'?a.s.name.localeCompare(b.s.name):regSort==='class'?a.s.classNo-b.s.classNo||a.s.section.localeCompare(b.s.section)||a.s.name.localeCompare(b.s.name):regSort==='gender'?String(a.s.gender||'').localeCompare(String(b.s.gender||''))||a.s.name.localeCompare(b.s.name):regSort==='category'?categoryBands().findIndex(x=>x.name===catForClass(a.s.classNo))-categoryBands().findIndex(x=>x.name===catForClass(b.s.classNo))||a.s.name.localeCompare(b.s.name):regSort==='date'?String(b.r.createdAt||'').localeCompare(String(a.r.createdAt||'')):a.p.name.localeCompare(b.p.name)||a.s.name.localeCompare(b.s.name));const exported=exportRegistrationsRows(rows.map(x=>x.r));if(action==='participation-manager-export-xlsx')exportExcelRows(exported,'filtered-registrations.xlsx','Registrations');else exportRows(exported,'filtered-registrations.csv');break;}
      case 'programme-export-xlsx':if(!isAdmin())return toast('Programme export is administrator-only.','error');exportExcelRows(programmeExportRows(),'school-programmes.xlsx','Programmes');break;
      case 'registration-export-xlsx':if(!isAdmin())return toast('Registration export is administrator-only.','error');exportExcelRows(exportRegistrationsRows(),'school-registrations.xlsx','Registrations');break;
      case 'roster-export-xlsx':exportProgrammeRosterExcel();break;
      case 'registration-remove':{const prog=programmeById(el.dataset.programme),student=studentById(id);if(!(['admin','teacher'].includes(state.role)&&prog&&student&&student.active))return toast('Only staff can remove a programme registration.','error');if(state.role==='teacher'&&!canViewStudent(student))return toast('You can remove registrations only for students in your assigned classes.','error');const hasResult=db.results.some(r=>r.programmeId===prog.id&&r.studentId===student.id),hasSelection=db.selections.some(r=>r.programmeId===prog.id&&r.studentId===student.id);const warning=hasResult||hasSelection?' The linked rank and Sahodaya selection will also be cleared.':'';if(confirm(`Remove ${student.name} from ${prog.name}?${warning}`)){db.registrations=db.registrations.filter(r=>!(r.programmeId===prog.id&&r.studentId===student.id));registrationLookupSource=null;for(const team of (db.groupTeams||[])){if(team.programmeId===prog.id)team.studentIds=team.studentIds.filter(studentId=>Number(studentId)!==student.id);}db.groupTeams=(db.groupTeams||[]).filter(team=>team.studentIds.length);if(hasResult)db.results=db.results.filter(r=>!(r.programmeId===prog.id&&r.studentId===student.id));if(hasSelection)db.selections=db.selections.filter(r=>!(r.programmeId===prog.id&&r.studentId===student.id));audit('programme_registration_removed',prog.name,`${student.name}${warning}${state.role==='teacher'?' · removed by teacher':''}`);if(!saveDatabase()){render();return toast('The registration removal could not be saved. The previous saved entry was restored.','error');}render();toast('Entry removed.');}break;}
      case 'result-manage':if(isAdmin()&&p)openModal(`Results · ${p.name}`,`<div class="settings-card"><h3>Optional rankings</h3><p>Only students registered for this programme can receive a school rank. Leave a student without a rank when no place was awarded.</p>${rankForm(p)}</div><div class="settings-card" style="margin-top:12px"><h3>Current rank records</h3>${rankRecordsMarkup(p)}</div><div class="settings-card" style="margin-top:12px"><h3>Sahodaya representative</h3><p>Separate school confirmation, including direct entry or no representative.</p>${sahodayaForm(p)}</div>`,'RESULTS & SAHODOYA');break;
      case 'rank-edit':{const prog=programmeById(el.dataset.programme),sid=Number(el.dataset.id);if(isAdmin()&&prog)openModal(`Edit rank · ${prog.name}`,rankForm(prog,sid),'RESULTS');break;}
      case 'rank-clear':{const prog=programmeById(el.dataset.programme),sid=Number(el.dataset.id);if(isAdmin()&&prog&&confirm('Clear this rank record?')){db.results=db.results.filter(r=>!(r.programmeId===prog.id&&r.studentId===sid));audit('rank_cleared',prog.name,studentById(sid)?.name||'Student');if(!saveDatabase()){render();return toast('The rank could not be cleared because the change was not saved.','error');}const pNow=programmeById(prog.id);openModal(`Results · ${pNow.name}`,`<div class="settings-card"><h3>Optional rankings</h3><p>Only students registered for this programme can receive a school rank.</p>${rankForm(pNow)}</div><div class="settings-card" style="margin-top:12px"><h3>Current rank records</h3>${rankRecordsMarkup(pNow)}</div><div class="settings-card" style="margin-top:12px"><h3>Sahodaya representative</h3>${sahodayaForm(pNow)}</div>`,'RESULTS & SAHODOYA');}break;}
      case 'print-roster':document.body.classList.add('printing-roster');window.addEventListener('afterprint',()=>document.body.classList.remove('printing-roster'),{once:true});window.print();break;
      case 'roster-export':exportProgrammeRoster();break;
      case 'print-report':if(!state.reportBrowser?.classNo||!state.reportBrowser?.section)return toast('Open a class and section before printing student names.','warning');window.print();break;
      case 'print-results':document.body.classList.add('printing-results');window.addEventListener('afterprint',()=>document.body.classList.remove('printing-results'),{once:true});window.print();break;
      case 'report-export':exportReport();break;
      case 'calendar-period':if(['upcoming','past','all'].includes(el.dataset.period)){state.calendarPeriod=el.dataset.period;render();}break;
      case 'calendar-event-view':calendarEventDetails(db.events.find(event=>event.id===id));break;
      case 'event-add':openModal('Add school event',eventForm({published:true}),'SCHOOL EVENTS');break;
      case 'event-edit':{if(!isAdmin())return toast('Only administrators can edit events.','error');const ev=db.events.find(x=>x.id===id);if(ev){closeModal();openModal('Edit school event',eventForm(ev),'SCHOOL EVENTS');}break;}
      case 'event-delete':if(isAdmin()&&confirm('Delete this event?')){db.events=db.events.filter(x=>x.id!==id);audit('event_deleted','Event',String(id));if(!saveDatabase()){render();return toast('The event could not be deleted because the change was not saved.','error');}closeModal();render();toast('Event deleted.');}break;
      case 'staff-add':{if(!isAdmin())return toast('Only administrators can manage accounts.','error');const requestedRole=el.dataset.role||({admins:'admin',teachers:'teacher'}[state.adminTab]||'teacher');if(!['admin','teacher'].includes(requestedRole))return toast('Parent accounts are generated automatically during the future login phase.','warning');openModal(requestedRole==='admin'?'Create administrator':'Create teacher',staffForm({},requestedRole),'STAFF ACCESS');break;}
      case 'staff-edit':if(isAdmin()&&u)openModal('Edit account',staffForm(u),'STAFF ACCESS');else if(!isAdmin())toast('Only administrators can manage accounts.','error');break;
      case 'staff-disable':if(!isAdmin())return toast('Only administrators can manage accounts.','error');if(u&&u.role==='admin'&&db.users.filter(x=>x.role==='admin'&&x.active).length<=1){toast('The last active administrator cannot be disabled.','error');break;}if(u&&confirm(`Disable ${u.displayName}?`)){u.active=false;if(u.role==='teacher'){for(const [key,teacherId] of Object.entries(db.settings.classTeachers||{}))if(Number(teacherId)===Number(u.id))delete db.settings.classTeachers[key];delete db.settings.teacherPermissions?.[String(u.id)];}audit('account_disabled','Account',u.displayName);if(!saveDatabase()){render();return toast('The account change could not be saved. The previous account state was restored.','error');}render();}break;
      case 'admin-registration-add':if(!isAdmin())return toast('Only administrators can open the full-school registration manager.','error');openModal('Add programme entry',adminRegistrationStudentForm(),'PROGRAMME REGISTRATION');break;
      case 'programme-export':exportProgrammes();break;
      case 'registration-export':exportRegistrations();break;
      case 'audit-export':downloadJSON(db.audit,'school-portal-audit.json');break;
      case 'backup-export':{const backupElections=JSON.parse(JSON.stringify(electionDb.elections)).map(e=>({...e,ballots:readElectionBallots(e.id)}));downloadJSON({...JSON.parse(JSON.stringify(db)),elections:backupElections,nextIds:{...db.nextIds,...electionDb.nextIds}},'school-portal-backup.json');toast('Backup downloaded.');}break;
      case 'annual-data-reset':if(isAdmin())openModal('Clear annual registrations & results',annualDataResetForm(),'YEAR-END DATA RESET');break;
      case 'demo-reset':if(isAdmin()&&confirm('Replace the entire browser workspace with the original fictional sample data? This will delete current students, accounts, settings, programmes, events and activity records. Export a backup first.')){
        let storageSnapshot;try{storageSnapshot=snapshotPortalDataStorage();}catch(error){return toast(`Demo reset stopped before changing data: ${error.message}`,'error');}
        const previousDatabase=JSON.stringify(db),previousElection=JSON.stringify(electionDb),previousSections=[...sections],previousRecovery=electionRecoveryError;
        const oldElections=JSON.parse(JSON.stringify(electionDb.elections||[]));let resetOk=true;
        electionRecoveryError=null;
        for(const oldElection of oldElections)if(!clearElectionBallotChunks(oldElection.id)){resetOk=false;break;}
        if(resetOk){
          db=migrateDatabase(seedDatabase());electionDb=normalizeElectionStore(db.elections,db.nextIds);
          for(const election of electionDb.elections)election.ballots=[];
          delete db.elections;delete db.nextIds.election;delete db.nextIds.position;delete db.nextIds.candidate;
          sections=[...db.settings.sections];
          resetOk=saveDatabase()&&saveElectionDatabase();
        }
        if(!resetOk){
          db=JSON.parse(previousDatabase);electionDb=JSON.parse(previousElection);sections=previousSections;electionRecoveryError=previousRecovery;
          const restored=restorePortalDataStorage(storageSnapshot);syncElectionBallots();
          if(!restored)electionRecoveryError=new Error('Demo reset failed and the previous browser data could not be fully restored. Stop editing and restore a known-good backup.');
          render();return toast(restored?'Demo reset failed. The previous school data was restored.':'Demo reset failed and rollback could not be verified. Stop editing and restore a known-good backup.','error');
        }
        for(const oldElection of oldElections)clearBrowserVoterFlags(oldElection.id,oldElection.publicKey);
        activateSharedStorageFromCurrentBrowser();
        state.adminTab='overview';state.page='dashboard';state.role='admin';state.selectedStudentId=4;render();toast(sharedStorage.status==='connected'?'Fictional demo workspace replaced and shared sync enabled.':'Demo workspace replaced with fictional sample data.');
      }break;
      case 'backup-import':$('#backup-file')?.click();break;
      case 'election-add':openModal('Create election',createElectionForm(),'ELECTION SETUP');break;
      case 'election-toggle':if(e&&isAdmin()){const nextStatus=el.dataset.status;if(!electionTransitionAllowed(e,nextStatus))return toast('That election status transition is not allowed. Published elections cannot be reopened; close voting before publishing.','error');if(!commitElectionMutation(()=>{e.status=nextStatus;if(nextStatus==='open'){e.openAt=electionNowInput();}},'election_status_changed','Election',`${e.title}: ${nextStatus}`))return toast('The election status could not be saved. Check browser storage and try again.','error');render();toast(`Election status: ${nextStatus}`);}break;
      case 'fullscreen':if(document.documentElement.requestFullscreen)document.documentElement.requestFullscreen().catch(()=>{});break;
    }
  }
  function addStudentToProgramme(p,s,source='staff'){
    if(!['admin','teacher'].includes(state.role))return {ok:false,reason:'Only staff can add a student to a programme.'};
    if(!p||p.archived||p.status==='draft'||!s||s.active===false)return {ok:false,reason:'Choose an active, published programme and student.'};
    if(p.category==='Group Item')return {ok:false,reason:'Group Items are registered as House teams. Use Create House team.'};
    if(state.role==='teacher'&&!canViewStudent(s))return {ok:false,reason:'You can add students only from your assigned classes.'};
    if(!isEligible(s,p))return {ok:false,reason:'Student does not match the programme category, class range or gender.'};
    if(db.registrations.some(r=>r.programmeId===p.id&&r.studentId===s.id))return {ok:false,reason:'This student is already registered for this programme.'};
    if(recordCount(p.id)>=Number(p.capacity))return {ok:false,reason:'Programme capacity reached.'};
    const quota=quotaStatus(s,p,{staffOverride:true});if(!quota.ok)return {ok:false,reason:quota.reason};
    const previousNextId=db.nextIds.registration,previousAudit=db.audit.slice(),previousLength=db.registrations.length;
    db.registrations.push({id:db.nextIds.registration++,programmeId:p.id,studentId:s.id,createdAt:localDateString(),source});
    registrationLookupSource=null;
    audit('programme_registration_added',p.name,s.name);
    if(!saveDatabase()){
      db.registrations.length=previousLength;db.nextIds.registration=previousNextId;db.audit=previousAudit;registrationLookupSource=null;
      return {ok:false,reason:'Could not save this registration in browser storage. No registration was retained.'};
    }
    return {ok:true};
  }
  function manualRegister(p,s){const result=addStudentToProgramme(p,s,'staff');if(!result.ok)return toast(result.reason,'error');render();toast('Programme entry added.');}


  async function handleForm(form) {
    const f=new FormData(form), type=form.dataset.form, id=Number(form.dataset.id)||null;
    if(databaseRecoveryError)return toast('The saved school data needs recovery. Restore a valid backup before editing records.','error');
    const adminForms=new Set(['programme','staff','result','sahodaya','choice-limits','registration-window','bulk-deadlines','announcement','school-config','publication','house-settings','promotion','promotion-all','year-rollover','student-move-bulk','student-move-single','category-bands','teacher-permissions','election-settings','election-create','event','annual-data-reset','election-reset-ballots','election-reset-full']);
    if(adminForms.has(type)&&!isAdmin())return toast('This operation is available to administrators only.','error');
    if(type==='annual-data-reset') {
      if(String(f.get('confirmation')||'').trim()!=='CLEAR YEAR DATA')return toast('Type CLEAR YEAR DATA exactly to confirm this reset.','error');
      const reset=performAnnualDataReset();
      if(!reset.ok){render();return toast(reset.rollbackFailed?'The annual reset failed and rollback could not be verified. Stop editing and restore a known-good backup.':'The annual reset could not be completed. Existing saved records were restored where possible. Export a backup and check browser storage before trying again.','error');}
      const {counts}=reset;
      state.adminTab='data';state.page='admin';state.adminRegistrationBrowser={classNo:null,section:null};state.resultsFilters={sort:'name'};
      closeModal();render();
      const removed=counts.registrations+counts.ranks+counts.sahodaya+counts.ballots+counts.electionCodes;
      toast(reset.browserVoterFlagsCleared?`Annual activity data cleared. ${removed} programme and election records removed; student and school setup data kept. Old election links were invalidated; issue fresh links for the new year.`:`Annual activity data cleared and old election links invalidated. ${removed} programme and election records removed; student and school setup data kept.`,reset.browserVoterFlagsCleared?'info':'warning');
      return;
    }
    if(type==='admin-registration-student') {
      if(!isAdmin())return toast('Only administrators can add entries from the full-school registration manager.','error');
      const student=studentById(Number(f.get('studentId')));
      if(!student||!student.active)return toast('Choose an active student.','error');
      closeModal();openModal(`Add programme · ${student.name}`,studentProgrammePickerForm(student),'PROGRAMME REGISTRATION');return;
    }
    if(type==='student-programme-add') {
      if(!['admin','teacher'].includes(state.role))return toast('Only staff can add students to programmes.','error');
      const student=studentById(Number(form.dataset.student)),programme=programmeById(Number(f.get('programmeId')));
      if(!student||!student.active||!canViewStudent(student))return toast('This student is outside your assigned access.','error');
      if(!programme||programme.archived||programme.status==='draft'||programme.category==='Group Item')return toast('Choose a published individual Arts or Sports programme. Group Items require a House team.','error');
      const result=addStudentToProgramme(programme,student,'staff-register');
      if(!result.ok)return toast(result.reason,'error');
      closeModal();render();toast(`${student.name} added to ${programme.name}.`);return;
    }
    if(type==='student-assign-unsectioned') {
      const classNo=Number(form.dataset.class),section=String(f.get('targetSection')||''),ids=[...new Set(String(f.get('studentIds')||'').split(',').map(Number).filter(Number.isSafeInteger))];
      const allowedTargets=isAdmin()?sections:teacherClassSections().filter(pair=>pair.classNo===classNo).map(pair=>pair.section);
      if(!classes.includes(classNo)||!allowedTargets.includes(section)||section==='Unsectioned')return toast('Choose a section in this class that you are allowed to manage.','error');
      const students=ids.map(studentById);
      if(!students.length||students.some(student=>!student||!student.active||Number(student.classNo)!==classNo||student.section!=='Unsectioned'))return toast('The selection changed. Refresh the Unsectioned list and select students again.','error');
      for(const student of students)student.section=section;
      audit('unsectioned_students_assigned','Student section assignment',`${students.length} students · ${ordinalClass(classNo)} Unsectioned → ${section}`);
      if(!saveDatabase())return toast('The section assignment could not be saved. The form was kept open so you can retry.','error');state.selectedUnsectionedIds=[];closeModal();render();toast(`${students.length} student(s) assigned to ${ordinalClass(classNo)} ${section}.`);return;
    }
    if(type==='student') {
      const existingStudent=id?studentById(id):null;const rawDob=String(f.get('dob')||'').trim();const parsedDob=parseDateOfBirth(rawDob);const values={ admissionNo:String(f.get('admissionNo')).trim(),name:String(f.get('name')).trim(),dob:parsedDob||'',gender:f.get('gender')||'Not specified',classNo:Number(f.get('classNo')||1),section:String(f.get('section')||''),house:existingStudent?.house||'',active:existingStudent?existingStudent.active:true };
      if(!values.admissionNo||!values.name) return toast('Admission number and student name are required.','error');
      if(values.admissionNo.length>80||values.name.length>120||/[\u0000-\u001f\u007f]/.test(values.admissionNo+values.name))return toast('Admission ID must be 80 characters or fewer and the student name 120 characters or fewer. Control characters are not allowed.','error');
      if(!['Boy','Girl','Not specified'].includes(values.gender))return toast('Choose a valid student gender.','error');
      if(rawDob&&!parsedDob)return toast('Enter a valid date of birth in day/month/year format, for example 2/3/2020 or 2-3-20.','error');
      if(!classes.includes(values.classNo))return toast('Choose a class from 1 to 12.','error');
      if(!sections.includes(values.section)&&values.section!=='Unsectioned')return toast('Choose a valid school section.','error');
      if(db.students.some(x=>x.admissionNo.toLowerCase()===values.admissionNo.toLowerCase()&&x.id!==id)) return toast('That admission number already exists.','error');
      if(state.role==='teacher'&&id){const old=studentById(id);if(!old||!teacherCanAccessStudent(old)||values.classNo!==old.classNo||values.section!==old.section)return toast('Teachers can only edit existing students inside their assigned section. Class placement changes are administrator-only.','error');}if(state.role==='teacher'&&!id&&(!currentTeacherHas('addStudents')||!state.pendingStudentPlacement||!teacherCanAccessSection(values.classNo,values.section)))return toast('Ask an administrator to grant student-add permission for this section.','error');
      if(id){const existing=studentById(id);if(!existing||!canEditStudent(existing))return toast('You can only edit students within your assigned sections.','error');const oldPlacement=`${ordinalClass(existing.classNo)} ${existing.section}`;const moved=existing.classNo!==values.classNo||existing.section!==values.section;Object.assign(existing,values);audit(moved?'student_moved':'student_updated','Student',moved?`${values.name} · ${oldPlacement} → ${ordinalClass(values.classNo)} ${values.section}`:values.name);}else{const teacherAdd=state.role==='teacher'&&currentTeacherHas('addStudents')&&state.pendingStudentPlacement&&teacherCanAccessSection(values.classNo,values.section);if(!isAdmin()&&!teacherAdd)return toast('Only administrators or teachers with add-student permission can create student records.','error');if(!state.pendingStudentPlacement||values.classNo!==Number(state.pendingStudentPlacement.classNo)||values.section!==String(state.pendingStudentPlacement.section))return toast('Add the student from the correct class and section.','error');values.id=db.nextIds.student++;db.students.push(values);audit('student_created','Student',values.name);}
      if(!saveDatabase())return toast('The student record could not be saved. The form was kept open so you can retry.','error');state.pendingStudentPlacement=null;closeModal();render();toast('Student record saved.');return;
    }
    if(type==='teacher-permissions') {
      if(!isAdmin())return toast('Administrator access required.','error');
      const teacher=db.users.find(u=>u.id===id&&u.role==='teacher'&&u.active);if(!teacher)return toast('Active teacher account not found.','error');
      const powers={viewReports:f.has('viewReports'),addStudents:f.has('addStudents'),editStudents:f.has('editStudents'),removeStudents:f.has('removeStudents'),assignHouses:f.has('assignHouses'),manageSections:f.has('manageSections')};
      if(powers.assignHouses&&!Object.values(db.settings.classTeachers||{}).some(teacherId=>Number(teacherId)===Number(id)))return toast('Assign this teacher to at least one class section before granting house assignment.','error');
      const previous=JSON.stringify(db);
      const next=Object.fromEntries(Object.entries(powers).filter(([,enabled])=>enabled));
      db.settings.teacherPermissions ||= {};
      if(Object.keys(next).length)db.settings.teacherPermissions[String(id)]=next;else delete db.settings.teacherPermissions[String(id)];
      audit('teacher_permissions_updated','Staff access',`${teacher.displayName} · ${Object.keys(next).length?Object.keys(next).join(', '):'all additional powers removed'}`);
      if(!saveDatabase()){db=JSON.parse(previous);return toast('Teacher powers could not be saved. The previous permissions remain in effect.','error');}
      closeModal();render();toast(Object.keys(next).length?'Teacher powers saved.':'All additional teacher powers removed.');return;
    }
    if(type==='section-add') {
      const classNo=Number(form.dataset.class),raw=String(f.get('sectionName')||'').trim(),section=normalizeSection(raw);
      const teacher=state.role==='teacher'?userByRole('teacher'):null;
      if(!isAdmin()&&(!teacher||!teacherCanAddSections(teacher.id,classNo)))return toast('Ask an administrator to grant section-management permission for a class you teach.','error');
      if(!classes.includes(classNo))return toast('Choose a configured class.','error');
      if(!section||section.length>15||! /^[A-Z0-9][A-Z0-9 -]{0,14}$/.test(section)||section==='UNSECTIONED')return toast('Use a short section label (letters, numbers, spaces or hyphens).','error');
      if(sections.some(value=>String(value).toUpperCase()===section))return toast(`Section ${section} already exists in the school configuration.`, 'warning');
      sections=[...sections,section].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));db.settings.sections=[...sections];
      if(teacher){db.settings.classTeachers ||= {};db.settings.classTeachers[classSectionKey(classNo,section)]=teacher.id;}
      audit('school_section_added','School sections',`${section} added${teacher?` by ${teacher.displayName} and assigned to ${ordinalClass(classNo)}`:''}`);
      if(!saveDatabase())return toast('The section could not be saved. The form was kept open so you can retry.','error');closeModal();render();toast(`Section ${section} added to the school${teacher?' and assigned to your class':''}.`);return;
    }
    if(type==='year-rollover') {
      if(!isAdmin())return toast('Only administrators can complete a year rollover.','error');
      const oldYear=String(db.settings.academicYear||'').trim();
      const newYear=String(f.get('newAcademicYear')||'').trim();
      if(String(f.get('confirmation')||'').trim()!=='ROLLOVER SCHOOL YEAR')return toast('Type ROLLOVER SCHOOL YEAR exactly to confirm.','error');
      if(!newYear||newYear.length>20||newYear===oldYear)return toast('Enter a different, valid academic-year label.','error');
      const steps=classes.map(source=>({source,target:classes.includes(Number(source)+1)?Number(source)+1:null})).filter(step=>step.target);
      const byClass=steps.map(step=>({...step,students:db.students.filter(student=>student.active&&Number(student.classNo)===Number(step.source))}));
      const moving=byClass.flatMap(step=>step.students);
      if(!moving.length)return toast('No active students are eligible for promotion. Nothing was changed.','warning');
      if(!confirm(`Complete the year rollover from ${oldYear} to ${newYear}? ${moving.length} students will move up one enabled class. ${db.registrations.length} programme registrations, ${db.results.length} ranks and ${db.selections.length} Sahodaya selections will be cleared. Student records and programme definitions will remain.`))return;
      const previous=JSON.stringify(db);
      for(const step of byClass)for(const student of step.students)student.classNo=step.target;
      const cleared={registrations:db.registrations.length,ranks:db.results.length,selections:db.selections.length,groupTeams:db.groupTeams.length};
      db.registrations=[];db.results=[];db.selections=[];db.groupTeams=[];
      db.settings.academicYear=newYear;
      db.settings.lastBulkPromotionYear=newYear;
      db.settings.publishResults=false;db.settings.publishParticipants=false;
      audit('school_year_rollover_completed','Year rollover',`${oldYear} → ${newYear} · ${moving.length} students promoted · ${cleared.registrations} registrations, ${cleared.ranks} ranks, ${cleared.selections} selections, ${cleared.groupTeams} House teams cleared`);
      if(!saveDatabase()){
        db=JSON.parse(previous);
        return toast('The rollover could not be saved. The previous school year and all records have been restored. Export a backup and check browser storage before retrying.','error');
      }
      state.adminTab='movement';state.adminRegistrationBrowser={classNo:null,section:null};state.resultsFilters={sort:'name'};state.programmeDetailBrowser={classNo:null,section:null};
      render();toast(`Year rollover complete. ${moving.length} students promoted to ${newYear}; previous-year registrations and results cleared.`);return;
    }
    if(type==='promotion-all') {
      if(!isAdmin())return toast('Only administrators can promote students.','error');
      const year=String(db.settings.academicYear||'').trim();
      if(db.settings.lastBulkPromotionYear===year)return toast(`The school has already been promoted for ${year}. Change the academic year before running it again.`, 'warning');
      const steps=classes.map(source=>({source,target:classes.includes(Number(source)+1)?Number(source)+1:null})).filter(step=>step.target);
      const byClass=steps.map(step=>({...step,students:db.students.filter(st=>st.active&&Number(st.classNo)===Number(step.source))}));
      const moving=byClass.flatMap(step=>step.students);
      if(!moving.length)return toast('No active students are eligible for promotion.','warning');
      if(!confirm(`Promote all ${moving.length} active students across the school for ${year}? Each student moves up exactly one numeric grade. Students in the highest configured class stay where they are.`))return;
      const previous=JSON.stringify(db);
      for(const step of byClass)for(const student of step.students)student.classNo=step.target;
      db.settings.lastBulkPromotionYear=year;
      audit('school_mass_promotion','Student progression',`${moving.length} students promoted across ${byClass.map(step=>`${ordinalClass(step.source)}→${ordinalClass(step.target)} (${step.students.length})`).join(', ')} · year ${year}`);
      if(!saveDatabase()){db=JSON.parse(previous);return toast('The school-wide promotion could not be saved. All student classes have been restored.','error');}
      render();toast(`${moving.length} students promoted across the school.`);return;
    }
    if(type==='home-copy') {
      if(!isAdmin())return toast('Administrator access required.','error');
      const values={dashboardEyebrow:String(f.get('dashboardEyebrow')||'').trim(),dashboardTitle:String(f.get('dashboardTitle')||'').trim(),dashboardDescription:String(f.get('dashboardDescription')||'').trim(),dashboardQuote:String(f.get('dashboardQuote')||'').trim()};
      if(!values.dashboardTitle)return toast('The main screen heading cannot be blank.','error');
      if(values.dashboardEyebrow.length>60||values.dashboardTitle.length>140||values.dashboardDescription.length>320||values.dashboardQuote.length>140||Object.values(values).some(value=>/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)))return toast('Main screen text exceeds its length limit or contains unsupported control characters.','error');
      Object.assign(db.settings,values);
      audit('dashboard_content_updated','Main screen','Overview heading and text updated');if(!saveDatabase())return toast('Main screen text could not be saved. The previous saved text was restored.','error');render();toast('Main screen text saved.');return;
    }
    if(type==='house-settings') {
      if(!isAdmin())return toast('Administrator access required.','error');
      const names=[...new Set(String(f.get('houseNames')||'').split(/[\n,;]+/).map(x=>x.trim()).filter(Boolean))];
      if(names.length<2||names.length>8)return toast('Configure between two and eight distinct house names.','error');
      if(names.some(name=>name.length>40||/[\u0000-\u001f\u007f]/.test(name))||new Set(names.map(name=>name.toLocaleLowerCase())).size!==names.length)return toast('Each house name must be unique, 40 characters or fewer, and cannot contain control characters.','error');
      const canonicalByKey=new Map(names.map(name=>[name.toLocaleLowerCase(),name]));
      const removedKeys=new Set((db.settings.houseNames||[]).map(name=>String(name).toLocaleLowerCase()).filter(key=>!canonicalByKey.has(key)));
      const teamsUsingRemovedHouses=(db.groupTeams||[]).filter(team=>removedKeys.has(String(team.house||'').toLocaleLowerCase()));
      if(teamsUsingRemovedHouses.length){
        const labels=teamsUsingRemovedHouses.slice(0,3).map(team=>{const programme=programmeById(team.programmeId);return `${programme?.name||'Group Item'} — ${team.house} (${team.studentIds.length} members)`;}).join('; ');
        const more=teamsUsingRemovedHouses.length>3?` and ${teamsUsingRemovedHouses.length-3} more`:'';
        return toast(`Cannot remove a house while ${teamsUsingRemovedHouses.length} Group Item team(s) still use it: ${labels}${more}. Remove those team registrations from Programme Management first.`, 'error');
      }
      const affected=db.students.filter(student=>student.house&&removedKeys.has(String(student.house).toLocaleLowerCase()));
      if(affected.length&&!confirm(`${affected.length} student house assignment(s) use a house name being removed. These assignments will be cleared and can be reallocated later. Continue?`))return;
      for(const student of db.students){if(!student.house)continue;const key=String(student.house).toLocaleLowerCase(),canonical=canonicalByKey.get(key);if(canonical)student.house=canonical;else if(removedKeys.has(key))student.house='';}
      for(const team of db.groupTeams||[]){const canonical=canonicalByKey.get(String(team.house||'').toLocaleLowerCase());if(canonical)team.house=canonical;}
      db.settings.houseNames=names;audit('house_names_updated','Houses',`${names.join(', ')} · ${affected.length} assignments cleared with confirmation; matching case changes preserved`);if(!saveDatabase())return toast('House names could not be saved. The previous saved settings were restored.','error');render();toast('House names saved.');return;
    }
    if(type==='student-move-single') {
      if(!isAdmin())return toast('Only administrators can move students.','error');
      const student=studentById(Number(form.dataset.id)),targetClass=Number(f.get('targetClass')),targetSection=String(f.get('targetSection')||'');
      if(!student||!student.active)return toast('This active student record no longer exists.','error');
      if(!classes.includes(targetClass)||(!sections.includes(targetSection)&&targetSection!=='Unsectioned'))return toast('Choose a valid destination class and section.','error');
      const before=`${ordinalClass(student.classNo)} ${student.section||'Unsectioned'}`,after=`${ordinalClass(targetClass)} ${targetSection}`;
      if(student.classNo===targetClass&&student.section===targetSection)return toast('The student is already in that class and section.','warning');
      student.classNo=targetClass;student.section=targetSection;
      audit('student_moved_individually','Student movement',`${student.name} · ${before} → ${after}`);if(!saveDatabase())return toast('The student move could not be saved. The form was kept open so you can retry.','error');closeModal();render();toast(`${student.name} moved to ${after}.`);return;
    }
    if(type==='student-move-bulk') {
      if(!isAdmin())return toast('Only administrators can move students.','error');
      const targetClass=Number(f.get('targetClass')),targetSection=String(f.get('targetSection')||'');
      if(!classes.includes(targetClass)||(!sections.includes(targetSection)&&targetSection!=='Unsectioned'))return toast('Choose a valid destination class and section.','error');
      const ids=[...new Set((state.selectedMoveStudentIds||[]).map(Number))],students=ids.map(studentById);
      if(!ids.length||students.some(st=>!st||!st.active))return toast('The selection contains no students or includes an inactive record. Please select active students again.','error');
      const moving=students.filter(student=>student.classNo!==targetClass||student.section!==targetSection);
      if(!moving.length)return toast('All selected students are already in that class and section.','warning');
      const origins=[...new Set(moving.map(student=>`${ordinalClass(student.classNo)} ${student.section}`))].join(', ');
      for(const student of moving){student.classNo=targetClass;student.section=targetSection;}
      audit('students_bulk_moved','Student movement',`${moving.length} students from ${origins} → ${ordinalClass(targetClass)} ${targetSection}`);if(!saveDatabase())return toast('The bulk move could not be saved. The form was kept open so you can retry.','error');state.selectedMoveStudentIds=[];closeModal();render();toast(`${moving.length} students moved.`);return;
    }
    if(type==='promotion') {
      if(!isAdmin())return toast('Only administrators can promote a class.','error');
      const sourceClass=Number(f.get('sourceClass'));
      const targetClass=sourceClass+1;
      if(!classes.includes(sourceClass)||!classes.includes(targetClass))return toast('The next numeric grade is not enabled. Enable it in School configuration first.','error');
      const students=db.students.filter(st=>st.active&&Number(st.classNo)===sourceClass);
      if(!students.length)return toast(`There are no active students in ${ordinalClass(sourceClass)}.`, 'warning');
      if(!confirm(`Promote all ${students.length} active students from ${ordinalClass(sourceClass)} to ${ordinalClass(targetClass)}? Their section letters and existing programme and result records will remain linked to student IDs.`))return;
      const previous=JSON.stringify(db);
      for(const student of students)student.classNo=targetClass;
      audit('class_promoted','Student progression',`${students.length} students · ${ordinalClass(sourceClass)} → ${ordinalClass(targetClass)}`);
      if(!saveDatabase()){db=JSON.parse(previous);return toast('The class promotion could not be saved. All student classes have been restored.','error');}
      render();toast(`${students.length} students promoted to ${ordinalClass(targetClass)}.`);return;
    }
    if(type==='programme') {
      const values={name:String(f.get('name')).trim(),area:f.get('area'),category:f.get('category'),gender:f.get('gender'),itemType:f.get('category')==='Group Item'?'group':String(f.get('itemType')||''),capacity:Number(f.get('capacity')),groupScope:f.get('groupScope'),groupMode:f.get('groupMode'),classMin:Number(f.get('classMin')),classMax:Number(f.get('classMax')),eligibleCategories:f.getAll('eligibleCategories'),ageGroup:'Open',ageCutoffDate:'',maxAge:null,openDate:f.get('openDate'),closeDate:f.get('closeDate'),status:f.get('status'),description:String(f.get('description')).trim()};
      if(!values.name||values.name.length>120||values.description.length>800||/[\u0000-\u001f\u007f]/.test(values.name)||!Number.isSafeInteger(values.capacity)||values.capacity<1||values.capacity>5000||!['Arts','Sports'].includes(values.area)||![...categoryNames(),'Group Item'].includes(values.category)||!['All','Boys','Girls'].includes(values.gender)||!classes.includes(values.classMin)||!classes.includes(values.classMax)||values.classMin>values.classMax||!['Open'].includes(values.ageGroup))return toast('Check the programme name, type, capacity and class range.','error');
      if(values.category==='Group Item')values.itemType='group';
      else if(values.area==='Arts'&&!['onstage','offstage'].includes(values.itemType))return toast('Choose Onstage or Offstage for this Arts programme.','error');
      else if(values.area==='Sports'&&!['track','field'].includes(values.itemType))return toast('Choose Track or Field for this Sports programme.','error');
      if(values.area==='Arts'&&values.category!=='Group Item')values.gender='All';
      if(values.category==='Group Item'&&!['classes','categories'].includes(values.groupScope))return toast('Choose a valid Group Item eligibility method.','error');
      if(values.category==='Group Item'&&values.groupMode!=='house')return toast('Group Items use house-based teams.','error');
      if(values.category!=='Group Item')values.groupMode='';
      if(values.category!=='Group Item')values.groupScope='classes';
      if(values.category==='Group Item'&&values.groupScope==='categories'&&!values.eligibleCategories.length)return toast('Select at least one category for this Group Item.','error');
      if(values.openDate&&values.closeDate&&values.closeDate<values.openDate)return toast('Closing date cannot be earlier than opening date.','error');
      if(id){const existing=programmeById(id);if(!existing)return toast('This programme no longer exists.','error');if(recordCount(id)>values.capacity)return toast('Capacity cannot be lower than the number of existing entries.','error');if(values.category==='Group Item'&&(db.groupTeams||[]).some(team=>team.programmeId===id&&team.mode!=='house'))return toast('This Group Item contains unsupported team data. Remove the old team records before changing its rules.','error');const revised={...existing,...values,archived:false};const linkedStudentIds=new Set([...db.registrations.filter(r=>r.programmeId===id).map(r=>r.studentId),...db.selections.filter(r=>r.programmeId===id).map(r=>r.studentId)]);for(const sid of linkedStudentIds){const student=studentById(sid);if(student&&!isEligible(student,revised))return toast(`These changes would make ${student.name} ineligible. Keep the existing programme rules, or create a new programme record and archive this one.`, 'error');}Object.assign(existing,values);audit('programme_updated','Programme',values.name);}else{values.id=db.nextIds.programme++;values.code=`${values.area.slice(0,2).toUpperCase()}-${values.category.replaceAll(' ','').toUpperCase()}-${values.id}`;values.archived=false;db.programmes.push(values);audit('programme_created','Programme',`${values.name} · ${values.category} · ${values.gender}`);}
      if(!saveDatabase())return toast('Programme could not be saved. The form was kept open so you can retry.','error');closeModal();render();toast('Programme saved.');
    }
    if(type==='group-team'){
      if(!['admin','teacher'].includes(state.role))return toast('Only staff can create teams.','error');
      const pid=Number(form.dataset.programme),mode=form.dataset.mode,category=String(f.get('teamCategory')||''),house=String(f.get('teamHouse')||''),studentIds=f.getAll('studentIds').map(Number);
      const result=createGroupTeam(pid,category,house,studentIds);if(!result.ok)return toast(result.reason,'error');closeModal();render();toast(`${groupTeamLabel(result.team)} created with ${result.team.studentIds.length} students.`);return;
    }
    if(type==='staff') {
      const existing=id?db.users.find(x=>x.id===id):null;
      const values={displayName:String(f.get('displayName')).trim(),role:f.get('role'),active:f.get('active')==='true',linkedStudentIds:f.getAll('linkedStudentIds').map(Number),classNumbers:f.getAll('parentClassNumbers').map(Number),portalEnabled:existing?.portalEnabled!==false};
      if(!values.displayName)return toast('Enter a display name.','error');
      if(values.displayName.length>120||/[\u0000-\u001f\u007f]/.test(values.displayName))return toast('Display name must be 120 characters or fewer and cannot contain control characters.','error');
      if(!['admin','teacher','parent'].includes(values.role))return toast('This account directory has an invalid account type.','error');
      if(!existing&&values.role==='parent')return toast('Parent accounts are generated automatically during the future login phase.','error');
      if(existing&&existing.role!==values.role)return toast('Account type cannot be changed here. Edit the account from its own directory.','error');
      if(values.role==='teacher'&&db.users.some(x=>x.id!==id&&x.active&&x.role==='teacher'&&x.displayName.trim().toLowerCase()===values.displayName.toLowerCase()))return toast('Another active teacher already has this full name. The future teacher username would collide.','error');
      if(values.role==='parent'&&(!values.linkedStudentIds.length||values.linkedStudentIds.some(sid=>!studentById(sid)?.active)))return toast('Link at least one active child to this parent account.','error');if(values.role==='parent'){const linkedClasses=values.linkedStudentIds.map(sid=>Number(studentById(sid)?.classNo)).filter(n=>Number.isInteger(n)&&n>=1&&n<=12);values.classNumbers=[...new Set([...values.classNumbers,...linkedClasses])].sort((a,b)=>a-b);if(!values.classNumbers.length)return toast('Assign this parent to at least one class.','error');}
      if(existing&&existing.role==='admin'&&existing.active&&(!values.active||values.role!=='admin')&&db.users.filter(user=>user.role==='admin'&&user.active).length<=1)return toast('The last active administrator cannot be disabled or changed to another role. Add another administrator first.','error');
      if(values.role!=='teacher'){
        for(const [key,teacherId] of Object.entries(db.settings.classTeachers||{}))if(Number(teacherId)===Number(id))delete db.settings.classTeachers[key];
        if(id)delete db.settings.teacherPermissions?.[String(id)];
      }
      if(values.role!=='parent'){values.linkedStudentIds=[];values.classNumbers=[];}
      if(id){if(!existing)return toast('Account no longer exists.','error');Object.assign(existing,values);audit('account_updated','Account',values.displayName);}else{values.id=db.nextIds.user++;db.users.push(values);audit('account_created','Account',values.displayName);}
      if(!saveDatabase())return toast('Account could not be saved. The form was kept open so you can retry.','error');closeModal();render();toast('Account saved.');
    }
    if(type==='report-custom-students') {
      if(!['admin','teacher'].includes(state.role))return toast('Only staff can create custom report selections.','error');
      const ids=[...new Set(f.getAll('reportCustomStudent').map(Number).filter(Number.isSafeInteger))].filter(id=>studentById(id)?.active&&(isAdmin()||canViewStudent(studentById(id))));
      state.reportPrint={...state.reportPrint,customStudentIds:ids};closeModal();render();toast(`${ids.length} custom student${ids.length===1?'':'s'} added to the report.`);return;
    }
    if(type==='event') {
      if(!isAdmin())return toast('Only administrators can manage calendar events.','error');
      const start=String(f.get('date')||''),end=String(f.get('endDate')||start),allDay=f.has('allDay');
      const values={title:String(f.get('title')||'').trim(),date:start,endDate:end,allDay,time:allDay?'':String(f.get('time')||''),endTime:allDay?'':String(f.get('endTime')||''),venue:String(f.get('venue')||'').trim(),type:String(f.get('type')||'School event'),coordinator:String(f.get('coordinator')||'').trim(),audience:String(f.get('audience')||'Everyone'),published:f.get('published')==='true',description:String(f.get('description')||'').trim()};
      const validDate=value=>{const parsed=calendarDate(value);return !!parsed&&calendarKey(parsed)===value;};
      if(!values.title||!validDate(start)||!validDate(end))return toast('Enter an event title and valid start and end dates.','error');
      if(values.title.length>120||values.venue.length>100||values.coordinator.length>100||values.description.length>800||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(values.title+values.venue+values.coordinator+values.description))return toast('Event text exceeds the permitted length or contains invalid control characters.','error');
      if(end<start)return toast('The event end date cannot be before its start date.','error');
      const validTime=value=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
      if(!allDay&&!validTime(values.time))return toast('Enter a valid start time or select All-day event.','error');
      if(values.endTime&&!validTime(values.endTime))return toast('Enter a valid end time.','error');
      if(!allDay&&values.endTime&&start===end&&values.endTime<values.time)return toast('The end time cannot be earlier than the start time.','error');
      if(!['Arts','Sports','School event','Rehearsal','Exam','Holiday','Meeting','Notice','Other'].includes(values.type))return toast('Choose a valid event type.','error');
      if(!['Everyone','Parents and students','Teachers','Staff only'].includes(values.audience))return toast('Choose a valid audience.','error');
      if(id){const existing=db.events.find(x=>x.id===id);if(!existing)return toast('This event no longer exists. Refresh the calendar and try again.','error');Object.assign(existing,values);audit('event_updated','Event',values.title);}else{values.id=db.nextIds.event++;db.events.push(values);audit('event_created','Event',values.title);}
      if(!saveDatabase())return toast('Event could not be saved. The form was kept open so you can retry.','error');closeModal();render();toast('Event saved.');
    }
    if(type==='result') {
      if(!isAdmin())return toast('Only an administrator can record ranks.','error');
      const pid=Number(form.dataset.programme), sid=Number(f.get('studentId')), rank=f.get('rank')?Number(f.get('rank')):null;
      if(!programmeById(pid)||!studentById(sid)||!db.registrations.some(r=>r.programmeId===pid&&r.studentId===sid))return toast('Only a registered student can receive a school rank.','error');
      if(rank!==null&&![1,2,3].includes(rank))return toast('Only 1st, 2nd or 3rd place can be recorded.','error');
      if(rank&&db.results.some(r=>r.programmeId===pid&&r.studentId!==sid&&r.rank===rank))return toast(`The ${rank}${rank===1?'st':rank===2?'nd':'rd'} place is already assigned for this programme.`, 'error');
      db.results=db.results.filter(r=>!(r.programmeId===pid&&r.studentId===sid)); if(rank)db.results.push({programmeId:pid,studentId:sid,rank,notes:String(f.get('notes')||'')});
      audit('rank_updated',programmeById(pid)?.name||'Programme',`${studentById(sid)?.name||'Student'} · ${rank||'No rank'}`);if(!saveDatabase())return toast('Rank record could not be saved. The form was kept open so you can retry.','error');closeModal();render();toast('Rank record saved.');
    }
    if(type==='sahodaya') {
      if(!isAdmin())return toast('Only an administrator can confirm Sahodaya selection.','error');
      const pid=Number(form.dataset.programme), sid=f.get('studentId')?Number(f.get('studentId')):null, pathway=f.get('pathway');
      if(!programmeById(pid))return toast('Choose a valid programme.','error');
      if(sid && (!studentById(sid)||!isEligible(studentById(sid),programmeById(pid))))return toast('Choose an active student who meets this programme’s category and gender rules.','error');
      if(!['School competition','Direct Sahodaya Entry'].includes(pathway))return toast('Choose a valid Sahodaya selection pathway.','error');
      if(pathway==='School competition'&&sid&&!db.registrations.some(r=>r.programmeId===pid&&r.studentId===sid))return toast('For a school competition pathway, choose a student registered for this programme.', 'error');
      db.selections=db.selections.filter(x=>x.programmeId!==pid); if(sid)db.selections.push({programmeId:pid,studentId:sid,pathway,confirmedAt:new Date().toISOString().slice(0,10)});
      audit('sahodaya_selection_updated',programmeById(pid)?.name||'Programme',sid?studentById(sid)?.name:'No representative selected');if(!saveDatabase())return toast('Sahodaya selection could not be saved. The form was kept open so you can retry.','error');closeModal();render();toast('Sahodaya selection saved.');
    }
    if(type==='category-bands') {
      if(!isAdmin())return toast('Administrator access required.','error');
      const count=Number(f.get('bandCount'));
      if(!Number.isInteger(count)||count<1||count>8)return toast('Category count is invalid.','error');
      const oldBands=categoryBands(),next=[];
      for(let i=0;i<count;i++){
        const name=String(f.get(`bandName${i}`)||'').trim(),minClass=Number(f.get(`bandMin${i}`)),maxClass=Number(f.get(`bandMax${i}`)),bandId=String(f.get(`bandId${i}`)||oldBands[i]?.id||`cat${i+1}`).trim();
        if(!bandId||bandId.length>40||!name||name.length>24||name.toLowerCase()==='group item'||!Number.isInteger(minClass)||!Number.isInteger(maxClass)||minClass<1||maxClass>12||minClass>maxClass)return toast('Every category needs a valid identity, name and class range from 1 to 12.','error');
        next.push({id:bandId,name,minClass,maxClass});
      }
      const names=next.map(b=>b.name.toLowerCase()),bandIds=next.map(b=>b.id);
      if(new Set(names).size!==names.length)return toast('Category names must be unique.','error');
      if(new Set(bandIds).size!==bandIds.length)return toast('Category identities must be unique. Reopen the editor and try again.','error');
      const sorted=next.slice().sort((a,b)=>a.minClass-b.minClass);
      for(let i=1;i<sorted.length;i++)if(sorted[i].minClass<=sorted[i-1].maxClass)return toast(`Category ranges overlap at Class ${sorted[i].minClass}. Adjust the ranges so each class belongs to at most one category.`,'error');
      const activeClasses=classes.filter(classNo=>classNo>=1&&classNo<=12);
      const uncovered=activeClasses.filter(classNo=>!sorted.some(band=>classNo>=band.minClass&&classNo<=band.maxClass));
      if(uncovered.length)return toast(`Every active class must belong to a category. Missing: ${uncovered.map(ordinalClass).join(', ')}.`,'error');
      const nextById=new Map(next.map(band=>[band.id,band]));
      const renameMap=new Map();
      oldBands.forEach(oldBand=>{const updated=nextById.get(oldBand.id);if(updated&&oldBand.name!==updated.name)renameMap.set(oldBand.name,updated.name);});
      const previous=JSON.stringify(db);
      for(const programme of db.programmes){if(renameMap.has(programme.category))programme.category=renameMap.get(programme.category);if(Array.isArray(programme.eligibleCategories))programme.eligibleCategories=programme.eligibleCategories.map(name=>renameMap.get(name)||name).filter(name=>next.some(b=>b.name===name));}
      db.settings.categoryBands=next;
      audit('category_bands_updated','Class categories',next.map(b=>`${b.name}: ${b.minClass}–${b.maxClass}`).join(' · '));
      if(!saveDatabase()){db=JSON.parse(previous);return toast('Category changes could not be saved. The previous mappings have been restored.','error');}
      render();toast('Category names and class ranges saved. Student categories are recalculated automatically.');return;
    }
    if(type==='choice-limits') { const keys=['maxArtsOnstage','maxArtsOffstage','maxSports','maxSportsTrack','maxSportsField','maxGroup'],limits=keys.map(key=>Number(f.get(key)));if(limits.some(x=>!Number.isSafeInteger(x)||x<0||x>50))return toast('Choice limits must be whole numbers from 0 to 50.','error');keys.forEach((key,index)=>db.settings[key]=limits[index]);db.settings.maxArts=Math.max(db.settings.maxArtsOnstage,db.settings.maxArtsOffstage);audit('choice_limits_updated','Settings',`Arts ${db.settings.maxArtsOnstage} onstage / ${db.settings.maxArtsOffstage} offstage; Sports ${db.settings.maxSports} total / ${db.settings.maxSportsTrack} track / ${db.settings.maxSportsField} field; Group ${db.settings.maxGroup}`);if(!saveDatabase())return toast('Choice limits could not be saved.','error');render();toast('Choice limits saved.'); }
    if(type==='registration-window') { const close=f.get('registrationClose'),open=f.get('registrationOpen'),schoolName=String(f.get('schoolName')||'').trim(),academicYear=String(f.get('academicYear')||'').trim();if(!schoolName||!academicYear)return toast('School name and academic year are required.','error');if(open&&close&&close<open)return toast('The school-wide choice closing date cannot be before its opening date.','error');db.settings.schoolName=schoolName;db.settings.academicYear=academicYear;db.settings.registrationOpen=open;db.settings.registrationClose=close;audit('school_settings_updated','Settings',db.settings.academicYear);if(!saveDatabase())return toast('School settings could not be saved. The previous saved settings were restored.','error');render();toast('School settings saved.'); }
    if(type==='bulk-deadlines') {
      const ids=[...new Set(f.getAll('programmeIds').map(Number).filter(Number.isSafeInteger))];
      const open=String(f.get('openDate')||''),close=String(f.get('closeDate')||'');
      const validDate=value=>{
        if(!value)return true;
        const match=value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if(!match)return false;
        const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
        const check=new Date(Date.UTC(year,month-1,day));
        return check.getUTCFullYear()===year&&check.getUTCMonth()===month-1&&check.getUTCDate()===day;
      };
      if(!ids.length)return toast('Select at least one programme.','warning');
      if((!open&&!close)||!validDate(open)||!validDate(close))return toast('Choose at least one valid date. Leave the other date blank to preserve it.','error');
      const targets=ids.map(programmeById);
      if(targets.some(programme=>!programme||programme.archived))return toast('One or more selected programmes are no longer available. Refresh and select them again.','error');
      for(const programme of targets){
        const nextOpen=open||programme.openDate,nextClose=close||programme.closeDate;
        if(nextOpen&&nextClose&&nextClose<nextOpen)return toast(`${programme.name}: closing date cannot be earlier than opening date.`,'error');
      }
      for(const programme of targets){if(open)programme.openDate=open;if(close)programme.closeDate=close;}
      audit('bulk_programme_deadlines_updated','Programme deadlines',`${targets.length} programmes · ${open||'opening unchanged'} · ${close||'closing unchanged'}`);
      if(!saveDatabase())return toast('Programme deadlines could not be saved. The previous dates were restored.','error');render();toast(`Updated ${open&&close?'opening and closing dates':open?'opening dates':'closing dates'} for ${targets.length} programme(s).`);return;
    }
    if(type==='announcement'){const notice=String(f.get('announcement')||'').trim();if(notice.length>1000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(notice))return toast('Portal announcement must be 1,000 characters or fewer and cannot contain unsupported control characters.','error');db.settings.announcements=notice;audit('announcement_updated','Portal notice',notice.slice(0,80));if(!saveDatabase())return toast('Portal announcement could not be saved. The previous saved text was restored.','error');render();toast('Portal notice updated.');}
    if(type==='school-config'){const activeClasses=[...new Set(f.getAll('activeClasses').map(Number))].sort((a,b)=>a-b),sectionsList=[...new Set(String(f.get('sections')).split(',').map(x=>x.trim().toUpperCase()).filter(Boolean))];if(!activeClasses.length||!sectionsList.length)return toast('Select at least one class and one section.','error');if(!activeClasses.every(n=>Number.isInteger(n)&&n>=1&&n<=12))return toast('Class selection is invalid.','error');if(!sectionsList.every(section=>section!=='UNSECTIONED'&&/^[A-Z0-9][A-Z0-9 -]{0,14}$/.test(section)))return toast('Section names must be 1–15 characters, use letters, numbers, spaces or hyphens, and must not use the reserved name Unsectioned.','error');const schoolName=String(f.get('schoolName')||'').trim(),shortName=String(f.get('shortName')||'').trim();if(!schoolName)return toast('School name is required.','error');if(schoolName.length>120||shortName.length>60||/[\u0000-\u001f\u007f]/.test(schoolName+shortName))return toast('School name must be 120 characters or fewer and short name 60 characters or fewer. Control characters are not allowed.','error');const removedStudent=db.students.find(st=>!activeClasses.includes(Number(st.classNo)));if(removedStudent)return toast(`A ${removedStudent.active?'student':'archived student'} record (${removedStudent.name}) still uses ${ordinalClass(removedStudent.classNo)}. Keep this class enabled or move every active and historical record before removing it.`, 'error');const sectionCanonicalByKey=new Map(sectionsList.map(section=>[section.toLocaleUpperCase(),section]));let movedToUnsectioned=0;for(const student of db.students){if(student.section==='Unsectioned')continue;const canonical=sectionCanonicalByKey.get(String(student.section||'').toLocaleUpperCase());if(canonical){student.section=canonical;}else{student.section='Unsectioned';movedToUnsectioned++;}}const nextClassTeachers={};for(const [key,teacherId] of Object.entries(db.settings.classTeachers||{})){const [classText,assignedSection='']=key.split('|'),classNo=Number(classText);if(!activeClasses.includes(classNo))continue;if(assignedSection==='Unsectioned'){nextClassTeachers[`${classNo}|Unsectioned`]=teacherId;continue;}const canonical=sectionCanonicalByKey.get(assignedSection.toLocaleUpperCase());if(canonical)nextClassTeachers[`${classNo}|${canonical}`]=teacherId;}db.settings.classTeachers=nextClassTeachers;db.settings.schoolName=schoolName;db.settings.shortName=shortName;db.settings.classes=activeClasses;db.settings.sections=sectionsList;classes=activeClasses;sections=sectionsList;audit('school_configuration_updated','School settings',`${db.settings.schoolName} · classes ${classes.join(', ')} · ${movedToUnsectioned} students moved to Unsectioned`);if(!saveDatabase())return toast('School configuration could not be saved. The previous saved settings were restored; review storage space and retry.','error');render();toast(movedToUnsectioned?`School configuration saved. ${movedToUnsectioned} students moved to Unsectioned.`:'School configuration saved.');}
    if(type==='publication'){db.settings.publishResults=f.has('publishResults');db.settings.publishParticipants=false;audit('publication_settings_updated','Portal visibility',`Final results ${db.settings.publishResults?'published':'hidden'}; participant rosters remain private`);if(!saveDatabase())return toast('Publication settings could not be saved. The previous visibility settings were restored.','error');render();toast('Publication settings saved.');}
    if(type==='election-settings') {
      const e=electionDb.elections.find(x=>x.id===Number(form.dataset.id));if(!e)return;
      const open=f.get('openAt'),close=f.get('closeAt'),title=String(f.get('title')||'').trim();
      if(!title)return toast('Enter an election title.','error');
      if(open&&close&&close<open)return toast('Voting close time cannot be before opening time.','error');
      const requestedStatus=String(f.get('status')||e.status);
      if(!electionTransitionAllowed(e,requestedStatus))return toast('That election status transition is not allowed. Published elections cannot be reopened; close voting before publishing.','error');
      if(requestedStatus==='open'&&(!e.positions.length||e.positions.some(pos=>!pos.name.trim()||!pos.candidates.length)))return toast('Add at least one candidate to every position before opening voting.','error');
      const configurationLocked=!electionStructureEditable(e);
      const allowAbstain=configurationLocked?e.allowAbstain:f.has('allowAbstain');
      if(configurationLocked&&(title!==e.title||open!==e.openAt||close!==e.closeAt||allowAbstain!==e.allowAbstain))return toast('Election title, voting dates and ballot rules are locked once voting opens or a ballot exists. You can still close voting, publish results or change live-display visibility.','error');
      const updatedTitle=title;
      if(!commitElectionMutation(()=>{e.title=title;e.openAt=open;e.closeAt=close;e.status=requestedStatus;e.eligibleClasses=[...classes];e.showLive=f.has('showLive');e.allowAbstain=allowAbstain;},'election_settings_updated','Election',updatedTitle))return toast('Election settings could not be saved. Check browser storage and try again.','error');
      render();toast('Election settings saved.');
    }
    if(type==='election-create') {
      const title=String(f.get('title')).trim(),open=f.get('openAt'),close=f.get('closeAt');
      if(!title||title.length>100||!open||!close||!Number.isFinite(schoolDateTimeMillis(open))||!Number.isFinite(schoolDateTimeMillis(close))||close<=open)return toast('Enter a title (100 characters or fewer) and a valid voting window.','error');
      const previousElection=JSON.stringify(electionDb),previousDb=JSON.stringify(db),previousSelection={id:state.electionId,tab:state.electionTab};
      const next={id:electionDb.nextIds.election++,title,status:'draft',publicKey:makePublicKey(),openAt:open,closeAt:close,showLive:true,allowAbstain:true,eligibleClasses:[...classes],positions:[],tokens:[],usedTokens:[],ballots:[]};
      electionDb.elections.push(next);state.electionId=next.id;state.electionTab='settings';audit('election_created','Election',title);
      if(!saveElectionDatabase()||!saveDatabase()){
        electionDb=JSON.parse(previousElection);db=JSON.parse(previousDb);state.electionId=previousSelection.id;state.electionTab=previousSelection.tab;
        if(!saveElectionDatabase()||!saveDatabase())electionRecoveryError=new Error('Election creation failed and the previous election workspace could not be restored. Restore a valid backup before continuing.');
        return toast('The election could not be saved. The earlier election workspace has been restored where possible.','error');
      }
      closeModal();render();toast('Election created. Add positions and candidates in its settings.');
    }
  }

  function csvEscape(v) {
    let s=String(v??'');
    if(typeof v==='string' && /^[\s\u0000-\u001f]*[=+@\-]/.test(s))s="'"+s;
    return /[",\n\r]/.test(s)?`"${s.replaceAll('"','""')}"`:s;
  }
  function download(content,filename,type='text/plain;charset=utf-8') { const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),500); }
  function downloadJSON(data,filename) { download(JSON.stringify(data,null,2),filename,'application/json;charset=utf-8'); }
  function exportRows(rows,filename) { if(!rows.length){toast('There are no rows to export.','warning');return;}const headers=Object.keys(rows[0]);const csv=[headers.map(csvEscape).join(','),...rows.map(r=>headers.map(h=>csvEscape(r[h])).join(','))].join('\r\n');download('\ufeff'+csv,filename,'text/csv;charset=utf-8'); }
  function xmlEscape(value){return String(value??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
  function columnName(n){let out='';while(n>0){const r=(n-1)%26;out=String.fromCharCode(65+r)+out;n=Math.floor((n-1)/26);}return out;}
  function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
  function makeZip(files){
    const encoder=new TextEncoder(),local=[],central=[];let offset=0;
    for(const [name,content] of Object.entries(files)){
      const filename=encoder.encode(name),data=encoder.encode(content),crc=crc32(data),localHeader=new Uint8Array(30+filename.length),lv=new DataView(localHeader.buffer);
      lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0,true);lv.setUint16(8,0,true);lv.setUint16(10,0,true);lv.setUint16(12,0,true);lv.setUint32(14,crc,true);lv.setUint32(18,data.length,true);lv.setUint32(22,data.length,true);lv.setUint16(26,filename.length,true);lv.setUint16(28,0,true);localHeader.set(filename,30);local.push(localHeader,data);
      const centralHeader=new Uint8Array(46+filename.length),cv=new DataView(centralHeader.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0,true);cv.setUint16(10,0,true);cv.setUint16(12,0,true);cv.setUint16(14,0,true);cv.setUint32(16,crc,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,filename.length,true);cv.setUint16(30,0,true);cv.setUint16(32,0,true);cv.setUint16(34,0,true);cv.setUint16(36,0,true);cv.setUint32(38,0,true);cv.setUint32(42,offset,true);centralHeader.set(filename,46);central.push(centralHeader);offset+=localHeader.length+data.length;
    }
    const centralSize=central.reduce((n,x)=>n+x.length,0),end=new Uint8Array(22),ev=new DataView(end.buffer);ev.setUint32(0,0x06054b50,true);ev.setUint16(4,0,true);ev.setUint16(6,0,true);ev.setUint16(8,central.length,true);ev.setUint16(10,central.length,true);ev.setUint32(12,centralSize,true);ev.setUint32(16,offset,true);ev.setUint16(20,0,true);
    return new Blob([...local,...central,end],{type:'application/zip'});
  }
  function exportExcelRows(rows,filename='school-export.xlsx',sheetName='Records'){
    if(!rows.length){toast('There are no rows to export.','warning');return;}
    const headers=Object.keys(rows[0]),all=[headers,...rows.map(row=>headers.map(h=>row[h]??''))];
    const sheetRows=all.map((row,ri)=>`<row r="${ri+1}">${row.map((value,ci)=>{const ref=`${columnName(ci+1)}${ri+1}`;return typeof value==='number'&&Number.isFinite(value)?`<c r="${ref}"><v>${value}</v></c>`:`<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;}).join('')}</row>`).join('');
    const safeSheet=String(sheetName).replace(/[\\/?*\[\]:]/g,' ').slice(0,31)||'Records';
    const files={
      '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
      '_rels/.rels':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      'xl/workbook.xml':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEscape(safeSheet)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      'xl/_rels/workbook.xml.rels':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/worksheets/sheet1.xml':`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`
    };
    const blob=makeZip(files);download(blob,filename,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }
  function studentExportRows(){
    const browser=state.page==='admin'?state.adminStudentBrowser:state.studentBrowser;
    if(!browser?.classNo||!browser?.section)return [];
    const visible=db.students.filter(s=>s.active&&canViewStudent(s)&&s.classNo===Number(browser.classNo)&&s.section===String(browser.section));
    return visible.map(s=>state.role==='teacher'?({AdmissionNo:s.admissionNo,Name:s.name,Age:studentAgeText(s),Gender:s.gender,Class:s.classNo,Section:s.section,Category:catForClass(s.classNo)}):({AdmissionNo:s.admissionNo,Name:s.name,DOB:s.dob?formatDateOfBirth(s.dob):'',Age:studentAgeText(s),Gender:s.gender,Class:s.classNo,Section:s.section,Category:catForClass(s.classNo)}));
  }
  function exportStudents() {
    if (!['admin','teacher'].includes(state.role)) { toast('Directory export is not available to this role.', 'error'); return; }
    const rows=studentExportRows();if(!rows.length)return toast('Open a class and section before exporting student names.','warning');
    exportRows(rows, state.role === 'teacher' ? 'assigned-section-students.csv' : `class-${state.adminStudentBrowser.classNo}-${state.adminStudentBrowser.section}-students.csv`);
  }
  function programmeExportRows(){return db.programmes.filter(p=>!p.archived).map(p=>({Code:p.code,Name:p.name,Area:p.area,Category:p.category,Gender:p.gender,ClassMin:p.classMin,ClassMax:p.classMax,OpenDate:p.openDate,CloseDate:p.closeDate,Capacity:p.capacity,Status:p.status}));}
  function exportProgrammes() { if(!isAdmin())return toast('Programme export is administrator-only.','error');exportRows(programmeExportRows(), 'school-programmes.csv'); }
  function exportRegistrationsRows(rows=null){const source=rows||db.registrations;return source.map(r=>({AdmissionNo:studentById(r.studentId)?.admissionNo,Student:studentById(r.studentId)?.name,Programme:programmeById(r.programmeId)?.name,ProgrammeCode:programmeById(r.programmeId)?.code,Area:programmeById(r.programmeId)?.area,Category:programmeById(r.programmeId)?.category,Gender:programmeById(r.programmeId)?.gender,Class:studentById(r.studentId)?.classNo,Section:studentById(r.studentId)?.section,Age:studentAgeText(studentById(r.studentId)),RegisteredOn:r.createdAt})).filter(r=>r.AdmissionNo&&r.Programme);}
  function exportRegistrations(rows = null) {
    if (!isAdmin()) { toast('Full-school registration export is administrator-only.', 'error'); return; }
    const source = rows || db.registrations;
    exportRows(exportRegistrationsRows(source), 'school-registrations.csv');
  }
  function programmeSectionExportRows(){
    const p=programmeById(state.programmeId);
    if(!p||!['admin','teacher'].includes(state.role)||(p.archived||p.status==='draft')&&!isAdmin())return null;
    const rows=programmeRosterRows(p),registrations=new Set(db.registrations.filter(reg=>reg.programmeId===p.id).map(reg=>reg.studentId));
    const ranks=new Map(db.results.filter(result=>result.programmeId===p.id).map(result=>[result.studentId,result.rank]));
    const selected=db.selections.find(item=>item.programmeId===p.id)?.studentId;
    return rows.map(student=>({Student:student.name,AdmissionNo:student.admissionNo,Class:student.classNo,Section:student.section,Category:catForClass(student.classNo),Gender:student.gender,Age:studentAgeText(student),Registration:registrations.has(student.id)?'Registered':'Not registered',Rank:ranks.get(student.id)||'',Sahodaya:selected===student.id?'Selected':''}));
  }
  function exportProgrammeRoster(){const rows=programmeSectionExportRows();if(!rows)return toast('This programme roster is unavailable.','warning');const p=programmeById(state.programmeId);exportRows(rows,`${p.code}-programme-roster.csv`);}
  function exportProgrammeRosterExcel(){const rows=programmeSectionExportRows();if(!rows)return toast('This programme roster is unavailable.','warning');const p=programmeById(state.programmeId);exportExcelRows(rows,`${p.code}-programme-roster.xlsx`,'Registrations');}
  function exportResults(){
    if(state.role==='parent')return toast('Result export is available to staff only.','warning');
    const f=state.resultsFilters||{};const scopedResults=state.role==='teacher'?db.results.filter(result=>teacherCanAccessStudent(studentById(result.studentId))):db.results;const scopedSelections=state.role==='teacher'?db.selections.filter(selection=>teacherCanAccessStudent(studentById(selection.studentId))):db.selections;let programmes=db.programmes.filter(programme=>!programme.archived);
    if(f.q){const q=String(f.q).toLocaleLowerCase();programmes=programmes.filter(programme=>`${programme.name} ${programme.code}`.toLocaleLowerCase().includes(q));}
    if(f.area)programmes=programmes.filter(programme=>programme.area===f.area);if(f.category)programmes=programmes.filter(programme=>programme.category===f.category);if(f.classNo)programmes=programmes.filter(programme=>{const ids=[...scopedResults.filter(result=>result.programmeId===programme.id).map(result=>result.studentId),...scopedSelections.filter(item=>item.programmeId===programme.id).map(item=>item.studentId)];return ids.some(id=>Number(studentById(id)?.classNo)===Number(f.classNo));});
    if(f.status==='with-results')programmes=programmes.filter(programme=>scopedResults.some(result=>result.programmeId===programme.id)||scopedSelections.some(item=>item.programmeId===programme.id));if(f.status==='without-results')programmes=programmes.filter(programme=>!scopedResults.some(result=>result.programmeId===programme.id)&&!scopedSelections.some(item=>item.programmeId===programme.id));
    programmes=sortProgrammeRecords(programmes,f.sort||'name');if(['class','class-desc'].includes(f.sort)){programmes.sort((a,b)=>{const classOf=programme=>{const winner=scopedResults.find(result=>result.programmeId===programme.id&&Number(result.rank)===1),student=winner?studentById(winner.studentId):null;return Number(student?.classNo||99);};const diff=classOf(a)-classOf(b);return (f.sort==='class-desc'?-diff:diff)||a.name.localeCompare(b.name);});}
    const rows=programmes.map(programme=>{const winner=rank=>{const result=scopedResults.find(item=>item.programmeId===programme.id&&Number(item.rank)===rank),student=result?studentById(result.studentId):null;return student&&(state.role!=='teacher'||teacherCanAccessStudent(student))?`${student.name} (${student.admissionNo}) · ${ordinalClass(student.classNo)} ${student.section} · ${student.gender||'Not specified'} · ${catForClass(student.classNo)}`:'';};const selection=scopedSelections.find(item=>item.programmeId===programme.id),representative=selection?studentById(selection.studentId):null;return {AcademicYear:db.settings.academicYear,Programme:programme.name,Code:programme.code,Area:programme.area,Category:programme.category,Gender:programme.gender,First:winner(1),Second:winner(2),Third:winner(3),Sahodaya:representative&&(state.role!=='teacher'||teacherCanAccessStudent(representative))?`${representative.name} (${representative.admissionNo}) · ${ordinalClass(representative.classNo)} ${representative.section} · ${representative.gender||'Not specified'} · ${catForClass(representative.classNo)}`:''};});
    exportRows(rows,'school-final-results.csv');
  }
  function exportReport() {
    const f=state.reportFilters,b=state.reportBrowser||{};
    if(!b.classNo||!b.section)return toast('Open a class and section before exporting student names.','warning');
    let students=db.students.filter(st=>st.active&&st.classNo===Number(b.classNo)&&st.section===String(b.section)&&(isAdmin()||state.role==='teacher'&&teacherCanAccessStudent(st))&&(f.group==='Not registered'?!registrationsFor(st.id).length:registrationsFor(st.id).length>0));
    if(f.q)students=students.filter(st=>st.name.toLowerCase().includes(f.q.toLowerCase())||st.admissionNo.includes(f.q));
    if(f.category)students=students.filter(st=>catForClass(st.classNo)===f.category);
    if(f.age)students=students.filter(st=>matchesAgeFilter(st,f.age));
    students=sortStudentRecords(students,f.sort||'name');
    exportRows(students.map(st=>({AdmissionNo:st.admissionNo,Name:st.name,Class:st.classNo,Section:st.section,Category:catForClass(st.classNo),Gender:st.gender,Age:studentAgeText(st),Registration:f.group||'Registered'})),`registrations-${f.group==='Not registered'?'not-':''}class-${b.classNo}-${b.section}.csv`);
  }
  function parseDelimitedLine(line, delimiter, literalQuotes=false) {
    if(literalQuotes){
      const row=String(line).split(delimiter).map(value=>{let cell=value.trim();if(cell.startsWith('"')&&cell.endsWith('"')&&cell.length>=2)cell=cell.slice(1,-1);return cell.replace(/""/g,'"');});
      return {row,unclosed:false};
    }
    const row=[];let cell='',quoted=false,afterQuote=false;
    for(let i=0;i<line.length;i++){
      const ch=line[i];
      if(quoted){
        if(ch==='"'&&line[i+1]==='"'){cell+='"';i++;}
        else if(ch==='"'&&(i===line.length-1||line[i+1]===delimiter||line[i+1]===' '||line[i+1]==='\t')){quoted=false;afterQuote=true;}
        else cell+=ch;
      }else if(ch==='"'&&cell.trim()===''&&!afterQuote){cell='';quoted=true;}
      else if(ch===delimiter){row.push(cell.trim());cell='';afterQuote=false;}
      else if(afterQuote&&(ch===' '||ch==='\t')){/* whitespace after a closing quote */}
      else{cell+=ch;afterQuote=false;}
    }
    row.push(cell.trim());
    return {row,unclosed:quoted};
  }
  function csvParse(text, delimiter=',') {
    const input=String(text??'').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
    const rows=[];let row=[],cell='',quoted=false,afterQuote=false;
    for(let i=0;i<input.length;i++){
      const ch=input[i];
      if(quoted){
        if(ch==='"'&&input[i+1]==='"'){cell+='"';i++;}
        else if(ch==='"'){quoted=false;afterQuote=true;}
        else cell+=ch;
        continue;
      }
      if(ch==='"'&&cell.trim()===''&&!afterQuote){cell='';quoted=true;continue;}
      if(ch===delimiter){row.push(cell.trim());cell='';afterQuote=false;continue;}
      if(ch==='\n'){
        row.push(cell.trim());
        if(row.some(value=>String(value).trim()!==''))rows.push(row);
        row=[];cell='';afterQuote=false;continue;
      }
      if(afterQuote&&(ch===' '||ch==='\t'))continue;
      cell+=ch;afterQuote=false;
    }
    if(quoted){
      const lines=input.split('\n').filter(line=>line.trim());
      const parsedLines=lines.map(line=>({standard:parseDelimitedLine(line,delimiter,false),literal:parseDelimitedLine(line,delimiter,true)}));
      const frequencies=new Map();
      for(const item of parsedLines){const width=item.standard.row.length;if(width>1)frequencies.set(width,(frequencies.get(width)||0)+1);}
      const targetWidth=[...frequencies.entries()].sort((a,b)=>b[1]-a[1]||b[0]-a[0])[0]?.[0]||0;
      return parsedLines.map(item=>{let parsed=item.standard;if(parsed.unclosed||(targetWidth&&parsed.row.length!==targetWidth&&item.literal.row.length===targetWidth))parsed=item.literal;return parsed.row;}).filter(values=>values.some(value=>String(value).trim()!==''));
    }
    row.push(cell.trim());
    if(row.some(value=>String(value).trim()!==''))rows.push(row);
    return rows;
  }
  async function unzipXlsxTextEntries(buffer) {
    const bytes=new Uint8Array(buffer),view=new DataView(buffer),decoder=new TextDecoder();let end=-1;
    for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){if(view.getUint32(i,true)===0x06054b50){end=i;break;}}
    if(end<0)throw new Error('The Excel file is not a valid ZIP-based .xlsx workbook.');
    const count=view.getUint16(end+10,true),centralOffset=view.getUint32(end+16,true),entries={};if(count>2048)throw new Error('The Excel workbook contains too many internal files.');let cursor=centralOffset,total=0;
    for(let n=0;n<count;n++){if(view.getUint32(cursor,true)!==0x02014b50)throw new Error('The Excel workbook directory is damaged.');const method=view.getUint16(cursor+10,true),compressedSize=view.getUint32(cursor+20,true),plainSize=view.getUint32(cursor+24,true),nameLen=view.getUint16(cursor+28,true),extraLen=view.getUint16(cursor+30,true),commentLen=view.getUint16(cursor+32,true),localOffset=view.getUint32(cursor+42,true);const name=decoder.decode(bytes.slice(cursor+46,cursor+46+nameLen));cursor+=46+nameLen+extraLen+commentLen;total+=plainSize;if(total>30*1024*1024||plainSize>30*1024*1024)throw new Error('The expanded Excel workbook is too large for this browser import.');if(!['xl/workbook.xml','xl/_rels/workbook.xml.rels','xl/sharedStrings.xml'].includes(name)&&!/^xl\/worksheets\/sheet\d+\.xml$/.test(name))continue;
      if(view.getUint32(localOffset,true)!==0x04034b50)throw new Error('The Excel workbook contains a damaged file entry.');const localNameLen=view.getUint16(localOffset+26,true),localExtraLen=view.getUint16(localOffset+28,true),dataStart=localOffset+30+localNameLen+localExtraLen,chunk=bytes.slice(dataStart,dataStart+compressedSize);let plain;
      if(method===0)plain=chunk;else if(method===8){if(typeof DecompressionStream==='undefined')throw new Error('This browser cannot decompress Excel workbooks. Save the sheet as CSV and import that instead.');const stream=new Blob([chunk]).stream().pipeThrough(new DecompressionStream('deflate-raw'));const reader=stream.getReader(),parts=[];let actual=0;try{while(true){const part=await reader.read();if(part.done)break;actual+=part.value.length;if(actual>plainSize||actual>30*1024*1024){await reader.cancel();throw new Error('The expanded Excel workbook exceeds its declared size.');}parts.push(part.value);}}finally{reader.releaseLock();}plain=new Uint8Array(actual);let offset=0;for(const part of parts){plain.set(part,offset);offset+=part.length;}}else throw new Error(`The workbook uses unsupported ZIP compression method ${method}.`);
      if(plain.length!==plainSize)throw new Error('An Excel workbook component did not decompress correctly.');entries[name]=decoder.decode(plain);
    }
    return entries;
  }
  function xlsxXml(text) {const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror'))throw new Error('An Excel worksheet contains invalid XML.');return doc;}
  function xlsxColumnIndex(reference){const letters=String(reference||'').match(/^[A-Z]+/i)?.[0]?.toUpperCase()||'A';let n=0;for(const ch of letters)n=n*26+ch.charCodeAt(0)-64;return n-1;}
  function excelDateToISO(value){const serial=Number(value);if(!Number.isFinite(serial)||serial<1||serial>100000)return String(value??'');const date=new Date(Date.UTC(1899,11,30)+Math.floor(serial)*86400000);return date.toISOString().slice(0,10);}
  async function xlsxParse(file){const entries=await unzipXlsxTextEntries(await file.arrayBuffer());const workbook=entries['xl/workbook.xml'],rels=entries['xl/_rels/workbook.xml.rels'];if(!workbook||!rels)throw new Error('The Excel workbook is missing its workbook metadata.');const wb=xlsxXml(workbook),relDoc=xlsxXml(rels),sheet=wb.getElementsByTagNameNS('*','sheet')[0];if(!sheet)throw new Error('The Excel workbook has no worksheets.');const relId=sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id')||sheet.getAttribute('r:id');const rel=[...relDoc.getElementsByTagNameNS('*','Relationship')].find(x=>x.getAttribute('Id')===relId);if(!rel)throw new Error('The first Excel worksheet could not be located.');let target=rel.getAttribute('Target').replace(/^\//,'');let path=target.startsWith('xl/')?target:`xl/${target}`;if(!entries[path])throw new Error('The first worksheet is missing from the Excel workbook.');const shared=entries['xl/sharedStrings.xml']? [...xlsxXml(entries['xl/sharedStrings.xml']).getElementsByTagNameNS('*','si')].map(si=>[...si.getElementsByTagNameNS('*','t')].map(t=>t.textContent).join('')):[];const doc=xlsxXml(entries[path]),rows=[...doc.getElementsByTagNameNS('*','row')].map(row=>{const cells=[];for(const cell of [...row.getElementsByTagNameNS('*','c')]){const index=xlsxColumnIndex(cell.getAttribute('r'));const type=cell.getAttribute('t'),value=cell.getElementsByTagNameNS('*','v')[0]?.textContent??'';let out=value;if(type==='s')out=shared[Number(value)]??'';else if(type==='inlineStr')out=[...cell.getElementsByTagNameNS('*','t')].map(t=>t.textContent).join('');else if(type==='b')out=value==='1'?'TRUE':'FALSE';cells[index]=out;}return cells.map(x=>x??'');});return rows.filter(row=>row.some(cell=>String(cell).trim()!==''));
  }
  function detectDelimitedFormat(text) {
    const lines=String(text||'').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n').filter(line=>line.trim()).slice(0,40);
    const candidates=[',','\t',';','|'];
    let best=',',bestScore=-1;
    for(const delimiter of candidates){
      const counts=[];
      for(const line of lines){
        let parsed=parseDelimitedLine(line,delimiter,false);
        if(parsed.unclosed)parsed=parseDelimitedLine(line,delimiter,true);
        if(parsed.row.length>1)counts.push(parsed.row.length);
      }
      if(!counts.length)continue;
      const frequencies=new Map();for(const count of counts)frequencies.set(count,(frequencies.get(count)||0)+1);
      const mode=Math.max(...frequencies.values());
      const consistency=mode/counts.length;
      const score=mode*100+consistency*20+Math.max(...counts)*0.01;
      if(score>bestScore){bestScore=score;best=delimiter;}
    }
    return bestScore<0?',':best;
  }
  function decodeDelimitedText(buffer) {
    const bytes=new Uint8Array(buffer);
    if(bytes.length>=2&&bytes[0]===0xff&&bytes[1]===0xfe)return new TextDecoder('utf-16le').decode(bytes.slice(2));
    if(bytes.length>=2&&bytes[0]===0xfe&&bytes[1]===0xff)return new TextDecoder('utf-16be').decode(bytes.slice(2));
    if(bytes.length>=3&&bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf)return new TextDecoder('utf-8').decode(bytes.slice(3));
    return new TextDecoder('utf-8').decode(bytes);
  }
  function normalizeHeader(h) { return String(h||'').replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[^a-z0-9]/g,''); }
  const importAliases={
    admissionNo:['admissionno','admissionnumber','admissionid','admissionnumberid','registrationid','registrationnumber','registrationno','regno','regid','regnumber','admno','admn','admnumber','studentid','studentno','rollno','rollnumber','studentregistrationid','enrollmentno','enrolmentno','uid'],
    name:['name','studentname','studentfullname','fullname','fullnameofstudent','nameofstudent','nameofthestudent','nameofchild','student','nameofpupil','pupilname','learnername','candidatefullname','pupil'],
    classNo:['class','classno','classnumber','standard','std','grade','yeargroup','classgrade','classname','standardname','classstandard','studyingin'],
    section:['section','sectionname','division','div','sec','classsectionname','sectiondivision','sectiondiv'],
    classSection:['classsection','classsec','classdivision','standarddivision','standardsection','stddiv','stdsection','gradedivision','classandsection','classsectiondivision','classsecdiv','standardanddivision'],
    gender:['gender','sex'], dob:['dob','dateofbirth','birthdate','dateofbirthstudent']
  };
  function importFieldForHeader(header){const h=normalizeHeader(header);for(const [field,aliases] of Object.entries(importAliases))if(aliases.includes(h))return field;return '';}
  function findImportHeaderRow(grid) {
    const limit=Math.min(grid.length,12);let bestIndex=0,bestScore=-1;
    for(let i=0;i<limit;i++){
      const fields=grid[i].map(importFieldForHeader).filter(Boolean);
      const unique=new Set(fields);let score=unique.size;
      if(unique.has('admissionNo'))score+=3;if(unique.has('name'))score+=3;if(unique.has('classNo')||unique.has('classSection'))score+=3;if(unique.has('section'))score+=1;
      if(score>bestScore){bestScore=score;bestIndex=i;}
      if(score>=10)break;
    }
    return bestScore>=6?bestIndex:0;
  }

  function classLevelParts(value){
    let text=String(value??'').normalize('NFKC').trim().toLowerCase().replace(/[._]/g,' ').replace(/\bk\s+g\b/g,'kg').replace(/\b([lu])\s+kg\b/g,'$1kg').replace(/\b([js])\s+r\s+kg\b/g,'$1r kg').replace(/\bp\s+p\s*([12])\b/g,'pp$1').replace(/\s+/g,' ');
    if(!text)return null;
    const sectionWords='(?:section|sec|division|div|stream)';
    const prePrimary=/^(?:lkg|ukg|nursery(?:\s+kg)?|pre[ -]?kg|pre[ -]?primary|lower kindergarten|upper kindergarten|lower kg|upper kg|kindergarten|kg|junior kg|jr\s*kg|senior kg|sr\s*kg|montessori|play ?group|balvatika|reception|preschool|pre ?school|pp[12])(?:\s|[-/,.]|$)/i;
    if(prePrimary.test(text))return {classNo:0,section:'',outOfScope:true,label:text};
    text=text.replace(/^(?:class(?:\s+no)?|standard|std|grade|year(?:\s+group)?|year\s+level)\s*[-:#]?\s*/i,'').trim();
    if(prePrimary.test(text))return {classNo:0,section:'',outOfScope:true,label:text};
    text=text.replace(/\s+(?:class|standard|std|grade)$/i,'').trim();
    const words={one:1,first:1,firststandard:1,two:2,second:2,secondstandard:2,three:3,third:3,four:4,fourth:4,five:5,fifth:5,six:6,sixth:6,seven:7,seventh:7,eight:8,eighth:8,nine:9,ninth:9,ten:10,tenth:10,eleven:11,eleventh:11,twelve:12,twelfth:12};
    const romans={i:1,ii:2,iii:3,iv:4,v:5,vi:6,vii:7,viii:8,ix:9,x:10,xi:11,xii:12};
    const tokens=text.match(/^(\d{1,2})(?:st|nd|rd|th)?|^(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)|^(xii|xi|ix|viii|vii|vi|iv|iii|ii|x|v|i)(?=$|[\s,./-])/i);
    if(!tokens)return null;
    const token=tokens[0],tokenNorm=token.toLowerCase();
    const numericMatch=token.match(/^\d+/);
    const classNo=numericMatch?Number(numericMatch[0]):(words[tokenNorm]||romans[tokenNorm]||0);
    if(!classNo && !(numericMatch && Number(numericMatch[0])===0))return null;
    let rest=text.slice(token.length).trim();
    rest=rest.replace(/^[-/,.()\s]+/,'').trim();
    rest=rest.replace(/^(?:standard|std|class|grade)\s+/i,'').trim();
    rest=rest.replace(new RegExp('^(?:'+sectionWords+')\\s*[-:#]?\\s*','i'),'');
    rest=rest.replace(/\s+(?:section|sec|division|div|stream)$/i,'').trim();
    rest=rest.replace(/^[-/,.]\s*/,'').replace(/^\((.*)\)$/,'$1').replace(/[()]/g,'').trim();
    rest=rest.replace(/\s+(?:standard|std|class|grade)$/i,'').trim();
    let section='';
    if(rest){
      const suffix=rest.match(/^([a-z][a-z0-9 -]{0,14})$/i);
      if(suffix)section=suffix[1].trim().replace(/\s+/g,' ').toUpperCase();
      else return null;
    }
    return {classNo,section,outOfScope:classNo<1||classNo>12,label:text};
  }
  function normalizeClassNumber(value){const parsed=classLevelParts(value);return parsed&&!parsed.outOfScope?parsed.classNo:0;}
  function parseClassSection(value){return classLevelParts(value);}
  function shouldSkipImportedClass(parsed){return !!parsed&&(parsed.outOfScope===true||!classes.includes(Number(parsed.classNo)));}
  function normalizeSection(value){
    let text=String(value??'').trim();if(!text)return '';
    text=text.replace(/^(?:section|sec|division|div)\s*[-:#]?\s*/i,'').trim();
    const match=text.match(/^([a-z])$/i);
    return match?match[1].toUpperCase():text.toUpperCase();
  }
  function importRowValue(row,field){const key=state.importColumnMap?.[field];if(!key)return '';return row[key]??'';}
  function rebuildImportRows(){
    const seen=new Set();
    const existingAdmissions=new Set(db.students.map(student=>String(student.admissionNo||'').trim().toLocaleLowerCase()).filter(Boolean));
    state.importRows=state.importSourceRows.map((source,i)=>{
      const admissionNo=String(importRowValue(source,'admissionNo')||'').trim();
      const name=String(importRowValue(source,'name')||'').trim();
      const classRaw=importRowValue(source,'classNo');
      const separateParsed=parseClassSection(classRaw);
      const combinedParsed=parseClassSection(importRowValue(source,'classSection'));
      let parsed=separateParsed&&(separateParsed.classNo||separateParsed.outOfScope)?separateParsed:combinedParsed&&(combinedParsed.classNo||combinedParsed.outOfScope)?combinedParsed:(separateParsed||combinedParsed);
      if(separateParsed&&(separateParsed.classNo||separateParsed.outOfScope)&&combinedParsed&&combinedParsed.classNo===separateParsed.classNo&&!separateParsed.section&&combinedParsed.section)parsed={...separateParsed,section:combinedParsed.section};
      const classNo=parsed?.classNo||0;
      const rawSection=importRowValue(source,'section');
      const section=normalizeSection(rawSection)||parsed?.section||'Unsectioned';
      const rawGender=String(importRowValue(source,'gender')||'').trim().toLowerCase();
      const gender=rawGender?(/^(m|male|boy|boys)$/.test(rawGender)?'Boy':/^(f|female|girl|girls)$/.test(rawGender)?'Girl':rawGender==='not specified'?'Not specified':'Invalid'):'Not specified';
      let rawDob=String(importRowValue(source,'dob')||'').trim();
      if(/^\d+(?:\.\d+)?$/.test(rawDob))rawDob=excelDateToISO(rawDob);
      const dob=parseDateOfBirth(rawDob)||'';
      const skipped=shouldSkipImportedClass(parsed);
      const r={row:Number(source.__sourceRow)||i+2,admissionNo,name,dob,rawDob,gender,classNo,section,skipped,skipReason:skipped?`Class ${String(importRowValue(source,'classNo')||importRowValue(source,'classSection')).trim()} is outside the classes configured for this school`:'' ,error:''};
      if(skipped)return r;
      if(!r.admissionNo)r.error='Missing admission / registration ID';
      else if(!r.name)r.error='Missing student name';
      else if(r.admissionNo.length>80)r.error='Admission / registration ID exceeds 80 characters';
      else if(r.name.length>120)r.error='Student name exceeds 120 characters';
      else if(/[\u0000-\u001f\u007f]/.test(r.admissionNo+r.name))r.error='Admission ID or student name contains unsupported control characters';
      else if(!parsed)r.error=String(classRaw||importRowValue(source,'classSection')||'').trim()?'Class format not recognised':'Missing class';
      else if(!classes.includes(r.classNo))r.error='Class is not configured';
      else if(!sections.includes(r.section)&&r.section!=='Unsectioned')r.error='Unavailable section';
      else if(gender==='Invalid')r.error='Unrecognised gender value; use Boy/Girl or leave blank';
      else if(r.rawDob&&!r.dob)r.error='Date of birth is invalid; use day/month/year such as 2/3/2020';
      else if(existingAdmissions.has(r.admissionNo.toLocaleLowerCase())||seen.has(r.admissionNo.toLocaleLowerCase()))r.error='Duplicate admission / registration ID';
      if(r.admissionNo)seen.add(r.admissionNo.toLowerCase());
      return r;
    });
  }
  function renderImportPreview(){
    rebuildImportRows();
    const mappingFields=[['admissionNo','Admission / registration ID'],['name','Student name'],['classNo','Class number'],['section','Section'],['classSection','Combined class + section (optional)'],['gender','Gender (optional)'],['dob','Date of birth (optional)']];
    const mapping=`<div class="import-mapping-grid">${mappingFields.map(([field,label])=>`<label class="form-field"><span>${label}</span><select class="field" data-import-map="${field}"><option value="">Not provided</option>${selectOptions(state.importHeaders.map(h=>({value:h,label:h})),state.importColumnMap[field]||'')}</select></label>`).join('')}</div>`;
    openModal('Import student records',`<div class="info-box import-speed-note"><strong>Fastest import:</strong> CSV / TSV and modern .xlsx files are read locally without downloading an extra library. Older binary .xls files are not supported in this offline build; open them in Excel or LibreOffice and save as .xlsx or CSV.</div><p class="subtle-note">File: ${esc(state.importFileName)} · ${state.importRows.length} rows detected. Fields are matched by header name, not column position. Required: admission ID, student name and class. A blank section is imported as Unsectioned and can be assigned later from Student editor or Needs attention. Class labels such as 4, 4th Standard, Std. IV, Grade Four, Class IV-B, 4-A and Four Section B are normalized. LKG, UKG, Nursery and classes not offered by this school are skipped automatically. Gender and DOB are optional. DOB accepts day/month/year with slashes, hyphens, dots or month names (for example 2/3/20, 2-3-2026 or 2 Mar 2020). Extra columns such as address, phone, house and notes are ignored. Blank optional cells do not invalidate a row.</p><section class="settings-card import-map-card"><h3>Check column mapping</h3><p>Confirm which source columns contain the fields we need. You can change the mapping if the file uses unusual header names.</p>${mapping}</section><div class="report-summary"><div class="report-tile"><strong>${state.importRows.length}</strong><small>Rows found</small></div><div class="report-tile"><strong>${state.importRows.filter(r=>!r.error&&!r.skipped).length}</strong><small>Valid rows</small></div><div class="report-tile"><strong>${state.importRows.filter(r=>r.error&&!r.skipped).length}</strong><small>Rows to review</small></div><div class="report-tile"><strong>${state.importRows.filter(r=>r.skipped).length}</strong><small>Out-of-scope rows skipped</small></div></div><div class="info-box">Rows for classes the school does not offer (including Nursery, LKG, UKG or grades outside the configured range) are automatically skipped. They are not treated as import errors and are not added to the directory.</div><div class="table-panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>Admission ID</th><th>Name</th><th>Class</th><th>Section</th><th>DOB</th><th>Age</th><th>Gender</th><th>Status</th></tr></thead><tbody>${state.importRows.filter(r=>!r.skipped).slice(0,60).map(r=>`<tr><td>${esc(r.admissionNo)}</td><td>${esc(r.name)}</td><td>${r.classNo?ordinalClass(r.classNo):'—'}</td><td>${esc(r.section==='Unsectioned'?'Unsectioned':r.section||'—')}</td><td>${esc(r.dob?formatDateOfBirth(r.dob):'—')}</td><td>${studentAgeText({dob:r.dob})}</td><td>${esc(r.gender)}</td><td>${r.error?badge(r.error,'closed'):badge('Ready','open')}</td></tr>`).join('')||'<tr><td colspan="8">No in-scope rows to preview.</td></tr>'}</tbody></table></div></div><div class="form-actions"><button class="btn" data-close-modal>Cancel</button><button class="btn btn-quiet" data-action="import-error-export">Download error rows</button><button class="btn btn-primary" data-action="import-commit" ${!state.importRows.some(r=>!r.error&&!r.skipped)?'disabled':''}>Import valid students</button></div>`,'STUDENT IMPORT');
  }
  let sheetJsLoadPromise = null;
  async function loadSheetJs() {
    if (window.XLSX?.read) return window.XLSX;
    throw new Error('Legacy .xls files are not supported in this offline build. Open the workbook in Excel or LibreOffice and save it as .xlsx or CSV, then import the converted file.');
  }
  async function legacyXlsParse(file) {
    const XLSX=await loadSheetJs();
    const workbook=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false,dense:false});
    const first=workbook.SheetNames?.[0];
    if(!first)throw new Error('The .xls workbook contains no worksheets.');
    if(workbook.SheetNames.length>1)throw new Error('This workbook contains multiple worksheets. Save the required worksheet as a separate CSV or single-sheet .xlsx file before importing.');
    const sheet=workbook.Sheets[first];
    if(!sheet)throw new Error('The first worksheet could not be read.');
    return XLSX.utils.sheet_to_json(sheet,{header:1,raw:false,defval:'',blankrows:false}).map(row=>row.map(value=>value instanceof Date?value.toISOString().slice(0,10):String(value??'')));
  }
  async function importStudentFile(file) {
    if (!isAdmin()) throw new Error('Only administrators can import student data.');
    if (file.size > 8 * 1024 * 1024) throw new Error('Student import is limited to 8 MB per file.');
    const extension=file.name.toLowerCase().split('.').pop();let headers=[],rows=[];
    if(extension==='json'){
      const parsed=JSON.parse(await file.text());rows=Array.isArray(parsed)?parsed:parsed.students||[];
      if(!Array.isArray(rows)||!rows.length)throw new Error('The JSON file contains no student records.');
      headers=[...new Set(rows.flatMap(row=>Object.keys(row||{})))];
      state.importSourceRows=rows.map((row,index)=>({...Object.fromEntries(Object.entries(row||{}).map(([key,value])=>[key,String(value??'')])),__sourceRow:index+2}));
      state.importRowBase=2;
    }else{
      let grid;
      if(extension==='xlsx') grid=await xlsxParse(file);
      else if(extension==='xls') grid=await legacyXlsParse(file);
      else if(['csv','tsv','txt'].includes(extension)) {
        const text=decodeDelimitedText(await file.arrayBuffer());
        const delimiter=extension==='tsv'?'\t':detectDelimitedFormat(text);
        grid=csvParse(text,delimiter);
      } else throw new Error('Unsupported file type. Use CSV, TSV, TXT, XLSX or JSON.');
      if(grid.length<2)throw new Error('The file has no recognisable header row and student rows.');
      const headerIndex=findImportHeaderRow(grid);
      headers=grid[headerIndex].map(h=>String(h||'').replace(/^\uFEFF/,'').trim());
      const dataRows=grid.slice(headerIndex+1);
      state.importRowBase=headerIndex+2;
      state.importSourceRows=dataRows.map((cells,index)=>({...Object.fromEntries(headers.map((header,i)=>[header,(normalizeHeader(header).includes('dob')||normalizeHeader(header).includes('dateofbirth'))&&/^\d+(?:\.\d+)?$/.test(String(cells[i]??''))?excelDateToISO(cells[i]):String(cells[i]??'')])),__sourceRow:headerIndex+index+2}));
    }
    if(state.importSourceRows.length>10000)throw new Error('A single import is limited to 10,000 student rows. Split the file and import in batches.');
    state.importHeaders=headers.filter(Boolean);state.importFileName=file.name;state.importColumnMap={};
    for(const header of state.importHeaders){const field=importFieldForHeader(header);if(field&&!state.importColumnMap[field])state.importColumnMap[field]=header;}
    // A combined class-section column should be preferred only if separate fields are absent.
    if(state.importColumnMap.classSection){if(!state.importColumnMap.classNo)state.importColumnMap.classNo='';if(!state.importColumnMap.section)state.importColumnMap.section='';}
    renderImportPreview();
  }
  function commitImport() {
    const previous=JSON.stringify(db);
    let count=0;const skipped=state.importRows.filter(row=>row.skipped).length;
    for(const row of state.importRows){
      if(row.error||row.skipped)continue;
      db.students.push({id:db.nextIds.student++,admissionNo:row.admissionNo,name:row.name,dob:row.dob,gender:row.gender,classNo:row.classNo,section:row.section,active:true});count++;
    }
    audit('student_imported','Student directory',`${count} records imported · ${skipped} out-of-scope class rows skipped · ${state.importFileName}`);
    if(!saveDatabase()){db=JSON.parse(previous);studentLookupSource=null;studentIdLookup=null;programmeIdLookup=null;return toast('Import could not be saved. The student list was restored and no imported records were kept.','error');}
    state.importRows=[];state.importSourceRows=[];closeModal();render();toast(`${count} student records imported${skipped?`; ${skipped} out-of-scope class rows skipped`:''}.`);
  }

  function handleClick(event) {
    const close=event.target.closest('[data-close-modal]');if(close){closeModal();return;}
    const actionEl=event.target.closest('[data-action]');if(!actionEl)return;
    const action=actionEl.dataset.action;
    if(action==='account-panel'){if(!isAdmin())return toast('Administrator access required.','error');state.accountPanel=['admins','teachers','parents'].includes(actionEl.dataset.panel)?actionEl.dataset.panel:'admins';render();return;}
    if(action==='class-teacher-expand'){if(!isAdmin())return toast('Only administrators can assign class teachers.','error');state.classTeacherClass=Number(actionEl.dataset.class)===Number(state.classTeacherClass)?null:Number(actionEl.dataset.class);render();return;}
    if(action==='house-class-expand'){const classNo=Number(actionEl.dataset.class);if(!isAdmin()&&state.role!=='teacher')return toast('House assignment is only available to authorised staff.','error');if(state.role==='teacher'&&(!currentTeacherCanAssignHouses()||!teacherClassSections().some(pair=>pair.classNo===classNo)))return toast('House assignment is not enabled for this class.','error');state.houseBrowser={classNo:classNo===Number(state.houseBrowser.classNo)?null:classNo,section:null};state.houseSelectedStudentIds=[];state.lastHouseSelectionIndex=-1;render();return;}
    if(action==='house-section-select'){const classNo=Number(actionEl.dataset.class),section=String(actionEl.dataset.section);if(!(isAdmin()||(state.role==='teacher'&&currentTeacherCanAssignHouses()&&teacherCanAccessSection(classNo,section))))return toast('That section is outside your house-assignment permission.','error');state.houseBrowser={classNo,section};state.houseSelectedStudentIds=[];state.lastHouseSelectionIndex=-1;render();return;}
    if(action==='house-select-student'){if(!isAdmin())return toast('Only administrators can select students for mass house assignment.','error');const id=Number(actionEl.dataset.id),visible=[...document.querySelectorAll('[data-action="house-select-student"]')].map(el=>Number(el.dataset.id));const idx=visible.indexOf(id),ids=new Set(state.houseSelectedStudentIds);const select=!ids.has(id);if(event.shiftKey&&state.lastHouseSelectionIndex>=0&&idx>=0){const start=Math.min(idx,state.lastHouseSelectionIndex),end=Math.max(idx,state.lastHouseSelectionIndex);for(let i=start;i<=end;i++){if(select)ids.add(visible[i]);else ids.delete(visible[i]);}}else if(select)ids.add(id);else ids.delete(id);state.lastHouseSelectionIndex=idx;state.houseSelectedStudentIds=[...ids];render();return;}
    if(action==='house-select-all'){if(!isAdmin())return;const visible=houseStudentsForPair(state.houseBrowser.classNo,state.houseBrowser.section).map(st=>st.id);state.houseSelectedStudentIds=actionEl.checked?visible:[];state.lastHouseSelectionIndex=-1;render();return;}
    if(action==='house-apply-selected'){if(!isAdmin())return toast('Only administrators can mass-assign houses.','error');const house=$('#house-apply-name')?.value||'';if(!db.settings.houseNames.includes(house))return toast('Choose a house before applying.','warning');const students=state.houseSelectedStudentIds.map(studentById).filter(st=>st?.active&&st.classNo===Number(state.houseBrowser.classNo)&&st.section===state.houseBrowser.section);if(!students.length)return toast('Select at least one student in this section.','warning');if(!confirm(`Assign ${students.length} student(s) to ${house}? Existing house assignments will be changed where necessary.`))return;for(const student of students)student.house=house;audit('houses_mass_assigned','House assignment',`${students.length} students · ${ordinalClass(state.houseBrowser.classNo)} ${state.houseBrowser.section} · ${house}`);if(!saveDatabase()){render();return toast('House assignments could not be saved. Previous assignments were restored.','error');}state.houseSelectedStudentIds=[];state.lastHouseSelectionIndex=-1;render();toast(`${students.length} students assigned to ${house}.`);return;}
    if(action==='print-house-sheet'){if(!(isAdmin()||(state.role==='teacher'&&currentTeacherCanAssignHouses()&&teacherCanAccessSection(state.houseBrowser.classNo,state.houseBrowser.section))))return toast('House sheet printing is unavailable for this account.','error');const sheet=$('#house-print-sheet');if(!sheet)return;document.body.classList.add('printing-house-sheet');const cleanup=()=>{document.body.classList.remove('printing-house-sheet');window.removeEventListener('afterprint',cleanup);};window.addEventListener('afterprint',cleanup);window.print();setTimeout(cleanup,1500);return;}
    if(action==='branding-reset-logo'){if(!isAdmin())return;db.settings.logoDataUrl='';if(!saveDatabase())return toast('The default school mark could not be restored because the change was not saved.','error');render();toast('Default school mark restored.');return;}
    if(action==='branding-reset-background'){if(!isAdmin())return;db.settings.backgroundDataUrl='';if(!saveDatabase())return toast('The default background could not be restored because the change was not saved.','error');render();toast('Default background restored.');return;}
    if(action==='election-reset-ballots'||action==='election-reset-full'){
      if(!isAdmin())return toast('Only administrators can reset elections.','error');
      const election=electionDb.elections.find(item=>item.id===Number(actionEl.dataset.id));
      if(!election)return toast('This election no longer exists.','error');
      openModal(action==='election-reset-ballots'?'Clear election ballots':'Reset full election',electionResetForm(election,action==='election-reset-ballots'?'ballots':'full'),'ELECTION RESET');return;
    }
    if(action==='position-add'){if(!isAdmin()){toast('Only administrators can edit election positions.','error');return;}const e=electionDb.elections.find(x=>x.id===Number(actionEl.dataset.id));if(electionStructureEditable(e)){if(e.positions.length>=30)return toast('An election can contain up to 30 positions.','warning');if(!commitElectionMutation(()=>e.positions.push({id:electionDb.nextIds.position++,name:'New position',candidates:[]}), 'election_position_added','Election',e.title))return toast('The position could not be saved. Check browser storage.','error');render();}return;}
    if(action==='position-candidate-add'){if(!isAdmin()){toast('Only administrators can edit election candidates.','error');return;}const e=electionDb.elections.find(x=>x.id===Number(actionEl.dataset.election));const pos=e?.positions.find(x=>x.id===Number(actionEl.dataset.position));if(electionStructureEditable(e)&&pos){const totalCandidates=e.positions.reduce((sum,item)=>sum+(item.candidates||[]).length,0);if(pos.candidates.length>=100||totalCandidates>=1000)return toast('This election has reached the candidate limit (100 per position, 1,000 overall).','warning');if(!commitElectionMutation(()=>pos.candidates.push({id:electionDb.nextIds.candidate++,name:'Candidate name',classLabel:'Class',details:''})))return toast('The candidate could not be saved. Check browser storage and try again.','error');render();}return;}
    if(action==='position-remove'){if(!isAdmin()){toast('Only administrators can edit election positions.','error');return;}const e=electionDb.elections.find(x=>x.id===Number(actionEl.dataset.election));if(electionStructureEditable(e)){if(!commitElectionMutation(()=>{e.positions=e.positions.filter(x=>x.id!==Number(actionEl.dataset.position));},'election_position_removed','Election',e.title))return toast('The position could not be saved. Check browser storage.','error');render();}return;}
    if(action==='candidate-remove'){if(!isAdmin()){toast('Only administrators can edit election candidates.','error');return;}const e=electionDb.elections.find(x=>x.id===Number(actionEl.dataset.election));const pos=e?.positions.find(x=>x.id===Number(actionEl.dataset.position));if(electionStructureEditable(e)&&pos){if(!commitElectionMutation(()=>{pos.candidates=pos.candidates.filter(x=>x.id!==Number(actionEl.dataset.candidate));},'election_candidate_removed','Election',e.title))return toast('The candidate could not be removed. Check browser storage.','error');render();}return;}
    if(action==='candidate-edit'){if(!isAdmin()){toast('Only administrators can edit election candidates.','error');return;}const e=electionDb.elections.find(x=>x.id===Number(actionEl.dataset.election));const pos=e?.positions.find(x=>x.id===Number(actionEl.dataset.position));const cand=pos?.candidates.find(x=>x.id===Number(actionEl.dataset.candidate));if(cand&&electionStructureEditable(e))openModal('Edit candidate',`<form data-form="candidate" data-election="${e.id}" data-position="${pos.id}" data-candidate="${cand.id}"><div class="form-field"><label>Candidate name</label><input class="field" name="name" maxlength="80" value="${esc(cand.name)}" required></div><div class="form-field" style="margin-top:10px"><label>Class / section label</label><input class="field" name="classLabel" maxlength="40" value="${esc(cand.classLabel||'')}" placeholder="Class 11 · A"></div><div class="form-field" style="margin-top:10px"><label>Additional candidate details (optional)</label><textarea class="field textarea" name="details" rows="3" maxlength="240" placeholder="Short description, house or role details">${esc(cand.details||'')}</textarea></div><div class="form-actions"><button class="btn btn-primary">Save candidate</button></div></form>`,'CANDIDATE');return;}
    if(action==='student-browser-filters-toggle'){const target=state.adminStudentBrowser;target.moreOpen=!target.moreOpen;render();return;}
    if(action==='registration-filters-toggle'){state.adminRegistrationFilters={...state.adminRegistrationFilters,moreOpen:!state.adminRegistrationFilters.moreOpen};render();return;}
    if(action==='import-commit'){if(!isAdmin())return toast('Only administrators can import student records.','error');commitImport();return;}
    if(action==='import-error-export'){if(!isAdmin())return toast('Only administrators can export import error rows.','error');exportRows(state.importRows.filter(r=>r.error&&!r.skipped).map(r=>({Row:r.row,AdmissionNo:r.admissionNo,Name:r.name,Class:r.classNo,Section:r.section,Error:r.error})),'student-import-errors.csv');return;}
    handleAction(action,actionEl);
  }

  window.addEventListener('storage',event=>{
    const configChanged=event.key===ELECTION_INDEX_KEY||event.key?.startsWith(ELECTION_CONFIG_PREFIX)||event.key?.startsWith(ELECTION_PUBLIC_CONFIG_PREFIX)||event.key===ELECTION_KEY;
    const ballotMetaChanged=event.key?.startsWith(BALLOT_META_PREFIX)||event.key?.startsWith(SUMMARY_KEY_PREFIX);
    if(configChanged){electionDb=loadElectionDatabase();syncElectionBallots();if(state.page==='admin'&&state.adminTab==='elections')render();return;}
    // A vote updates a chunk, metadata and summary separately. Only the metadata/summary
    // need a small screen refresh; do not reread every ballot chunk after each storage event.
    if(ballotMetaChanged&&state.page==='admin'&&state.adminTab==='elections')render();
  });
  document.addEventListener('click',handleClick);
  document.addEventListener('submit',event=>{
    const form=event.target.closest('form[data-form]');if(!form)return;event.preventDefault();
    const type=form.dataset.form;
    if(type==='candidate'){if(!isAdmin())return toast('Only administrators can edit election candidates.','error');const f=new FormData(form),e=electionDb.elections.find(x=>x.id===Number(form.dataset.election)),pos=e?.positions.find(x=>x.id===Number(form.dataset.position)),c=pos?.candidates.find(x=>x.id===Number(form.dataset.candidate));if(!e||!electionStructureEditable(e)||!c)return toast('This election is locked or the candidate no longer exists. Clear ballots first when votes have already been cast.','error');const name=String(f.get('name')||'').trim(),classLabel=String(f.get('classLabel')||'').trim(),details=String(f.get('details')||'').trim();if(!name||name.length>80)return toast('Candidate name is required and must be 80 characters or fewer.','error');if(classLabel.length>40)return toast('Class / section label must be 40 characters or fewer.','error');if(details.length>240)return toast('Candidate details must be 240 characters or fewer.','error');if(!commitElectionMutation(()=>{c.name=name;c.classLabel=classLabel;c.details=details;},'election_candidate_updated','Election',name))return toast('The candidate changes could not be saved. Check browser storage and try again.','error');closeModal();render();return;}
    if(type==='election-reset-ballots'||type==='election-reset-full'){
      if(!isAdmin())return toast('Only administrators can reset elections.','error');
      const electionId=Number(form.dataset.id),election=electionDb.elections.find(item=>item.id===electionId);
      if(!election)return toast('This election no longer exists.','error');
      const keepCandidates=type==='election-reset-ballots';
      const phrase=keepCandidates?'CLEAR ELECTION BALLOTS':'RESET FULL ELECTION';
      if(String(new FormData(form).get('confirmation')||'').trim()!==phrase)return toast(`Type ${phrase} exactly to confirm.`, 'error');
      const previous=JSON.stringify(db);
      const previousElection=JSON.stringify(electionDb);
      const previousPublicKey=election.publicKey;
      const storageSnapshot=snapshotPortalDataStorage();
      const priorRecoveryError=electionRecoveryError;
      const oldMeta=readElectionBallotMeta(electionId),oldBallotCount=oldMeta.corrupt?'unknown':oldMeta.count;
      if(keepCandidates){
        election.ballots=[];election.tokens=[];election.usedTokens=[];election.status='draft';election.publicKey=makePublicKey();
        audit('election_ballots_cleared','Election',`${election.title} · ${oldBallotCount} anonymous ballots removed · positions/candidates retained`);
      }else{
        electionDb.elections=electionDb.elections.filter(item=>item.id!==electionId);
        state.electionId=electionDb.elections[0]?.id??null;
        audit('election_fully_reset','Election',`${election.title} · positions, candidates, ballots and public links removed`);
      }
      // The admin explicitly requested a reset. Permit this recovery operation to
      // remove corrupt ballot data; all storage is snapshotted for exact rollback.
      electionRecoveryError=null;
      if(!saveElectionDatabase()||!saveDatabase()||!clearElectionBallotStorage(electionId)){
        db=JSON.parse(previous);electionDb=JSON.parse(previousElection);electionRecoveryError=priorRecoveryError;
        const rolledBack=restorePortalDataStorage(storageSnapshot);
        syncElectionBallots();
        if(!keepCandidates)state.electionId=electionId;
        if(!rolledBack)electionRecoveryError=new Error('Election reset failed and the previous browser data could not be fully restored. Restore a known-good backup.');
        return toast(rolledBack?'The election reset could not be saved. The previous election data was restored.':'The reset failed and rollback could not be verified. Stop editing and restore a known-good backup.','error');
      }
      electionRecoveryError=null;
      clearBrowserVoterFlags(electionId,previousPublicKey);
      closeModal();state.adminTab='elections';render();
      toast(keepCandidates?'Election ballots cleared. Candidate data was kept and a new voting link is ready.':'The complete election was removed. Create a new election to start again.');return;
    }
    if(type==='election-structure'){if(!isAdmin())return toast('Only administrators can edit election positions.','error');const e=electionDb.elections.find(x=>x.id===Number(form.dataset.id));if(electionStructureEditable(e)){const names=e.positions.map(pos=>({pos,name:String($(`[name="positionName-${pos.id}"]`,form)?.value??pos.name).trim()}));if(names.some(item=>!item.name||item.name.length>80))return toast('Position names are required and must be 80 characters or fewer.','error');if(!commitElectionMutation(()=>{for(const item of names)item.pos.name=item.name;},'election_structure_updated','Election',e.title))return toast('The position names could not be saved. Check browser storage.','error');render();toast('Position names saved.');}return;}
    try{const result=handleForm(form);if(result?.catch)result.catch(err=>toast(err.message,'error'));}catch(err){toast(err.message,'error');}
  });
  function isSafeBrandImageDataUrl(value){
    if(value===undefined||value===null||value==='')return true;
    if(typeof value!=='string'||value.length>950000)return false;
    return /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
  }
  function validateBackupShape(data) {
    if(!data||typeof data!=='object'||data.version!==1)throw new Error('This is not a supported portal backup.');
    const arrays=['students','programmes','registrations','results','selections','events','users','elections','audit'];
    for(const key of arrays)if(!Array.isArray(data[key]))throw new Error(`Backup is missing a valid ${key} collection.`);
    if(!Array.isArray(data.groupTeams))data.groupTeams=[];
    if(!data.settings||typeof data.settings!=='object'||!data.nextIds||typeof data.nextIds!=='object')throw new Error('Backup settings or ID counters are missing.');
    for(const key of ['student','programme','registration','groupTeam','event','user','election','position','candidate'])if(!Number.isSafeInteger(Number(data.nextIds[key]))||Number(data.nextIds[key])<1)throw new Error(`Backup ID counter “${key}” is invalid.`);
    if(data.students.length>50000||data.programmes.length>5000||data.registrations.length>250000||data.results.length>250000||data.selections.length>250000||data.events.length>5000||data.users.length>5000||data.elections.length>500||data.groupTeams.length>10000||data.audit.length>300)throw new Error('Backup contains more records than this browser can safely load.');
    const boundedText=(value,max)=>typeof value==='string'&&value.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
    for(const [key,max] of [['schoolName',120],['shortName',60],['academicYear',32],['dashboardEyebrow',60],['dashboardTitle',140],['dashboardDescription',320],['dashboardQuote',140],['announcements',1000]])if(data.settings[key]!==undefined&&!boundedText(String(data.settings[key]),max))throw new Error(`Backup contains invalid or oversized school setting: ${key}.`);
    if(!Array.isArray(data.settings.classes)||!data.settings.classes.length||!Array.isArray(data.settings.sections)||!data.settings.sections.length||!data.settings.classTeachers||typeof data.settings.classTeachers!=='object'||Array.isArray(data.settings.classTeachers))throw new Error('Backup school classes, sections or class teacher assignments are missing.');
    if(data.settings.classes.some(c=>!Number.isInteger(Number(c))||Number(c)<1||Number(c)>12)||new Set(data.settings.classes.map(Number)).size!==data.settings.classes.length)throw new Error('Backup contains an invalid class list.');
    const sectionPattern=/^[A-Z0-9][A-Z0-9 -]{0,14}$/i;
    if(data.settings.sections.length>50||data.settings.sections.some(section=>typeof section!=='string'||!section||section!==section.trim()||section.toUpperCase()==='UNSECTIONED'||!sectionPattern.test(section))||new Set(data.settings.sections.map(section=>String(section).toUpperCase())).size!==data.settings.sections.length)throw new Error('Backup contains invalid, reserved or duplicate section names. Section names must be unique, 1–15 characters, and cannot use the reserved name Unsectioned.');
    if(!isSafeBrandImageDataUrl(data.settings.logoDataUrl)||!isSafeBrandImageDataUrl(data.settings.backgroundDataUrl))throw new Error('Backup contains an invalid school logo or background image. Only PNG, JPEG or WebP data URLs are accepted.');
    if(!Array.isArray(data.settings.houseNames)||data.settings.houseNames.length>8||data.settings.houseNames.some(name=>typeof name!=='string'||!name.trim()||name!==name.trim()||name.length>40||/[\u0000-\u001f\u007f]/.test(name))||new Set(data.settings.houseNames.map(name=>name.trim().toLocaleLowerCase())).size!==data.settings.houseNames.length)throw new Error('Backup contains invalid, oversized or duplicate House names.');
    const limits=['maxArts','maxSports','maxGroup','maxArtsOnstage','maxArtsOffstage','maxSportsTrack','maxSportsField'];for(const key of limits)if(data.settings[key]!==undefined&&(!Number.isSafeInteger(Number(data.settings[key]))||Number(data.settings[key])<0||Number(data.settings[key])>50))throw new Error(`Backup choice limit “${key}” is invalid.`);
    const savedBands=Array.isArray(data.settings.categoryBands)&&data.settings.categoryBands.length?data.settings.categoryBands:defaultCategoryBands();
    if(savedBands.length>8||savedBands.some(b=>!String(b.name||'').trim()||String(b.name).length>40||/[\u0000-\u001f\u007f]/.test(String(b.name))||String(b.name).trim().toLowerCase()==='group item'||!Number.isInteger(Number(b.minClass))||!Number.isInteger(Number(b.maxClass))||Number(b.minClass)<1||Number(b.maxClass)>12||Number(b.minClass)>Number(b.maxClass))||new Set(savedBands.map(b=>String(b.name).trim().toLowerCase())).size!==savedBands.length)throw new Error('Backup contains invalid class category ranges.');
    const orderedBands=savedBands.slice().sort((a,b)=>Number(a.minClass)-Number(b.minClass));for(let i=1;i<orderedBands.length;i++)if(Number(orderedBands[i].minClass)<=Number(orderedBands[i-1].maxClass))throw new Error('Backup contains overlapping class category ranges.');
    const validCategories=new Set(savedBands.map(b=>String(b.name).trim()));
    const uncoveredClasses=data.settings.classes.map(Number).filter(classNo=>!savedBands.some(band=>classNo>=Number(band.minClass)&&classNo<=Number(band.maxClass)));
    if(uncoveredClasses.length)throw new Error(`Backup category bands do not cover active classes: ${uncoveredClasses.map(ordinalClass).join(', ')}.`);
    const studentIds=new Set(),admissions=new Set(),programmeIds=new Set(),programmeCodes=new Set();
    for(const st of data.students){const id=Number(st?.id),admission=String(st?.admissionNo||'').trim().toLowerCase(),name=st?.name;if(!st||typeof st!=='object'||Array.isArray(st)||typeof st.id!=='number'||!Number.isSafeInteger(id)||id<1||studentIds.has(id)||typeof st.admissionNo!=='string'||st.admissionNo.length>80||/[\u0000-\u001f\u007f]/.test(st.admissionNo)||!admission||admissions.has(admission)||typeof name!=='string'||!name.trim()||name.length>120||/[\u0000-\u001f\u007f]/.test(name)||typeof st.classNo!=='number'||!data.settings.classes.map(Number).includes(st.classNo)||!['Boy','Girl','Not specified',undefined,''].includes(st.gender)||!(data.settings.sections.includes(st.section)||st.section==='Unsectioned')||typeof st.section!=='string'||st.section.length>15||st.house!==undefined&&(typeof st.house!=='string'||st.house.length>40||/[\u0000-\u001f\u007f]/.test(st.house)||!!st.house&&!data.settings.houseNames.includes(st.house)))throw new Error('Backup contains an invalid or duplicate student record.');studentIds.add(id);admissions.add(admission);}
    for(const prog of data.programmes){const id=Number(prog.id),code=String(prog.code||'').trim().toLowerCase();if(typeof prog.id!=='number'||!Number.isSafeInteger(id)||id<1||programmeIds.has(id)||!code||programmeCodes.has(code)||!boundedText(String(prog.name||''),120)||!String(prog.name||'').trim()||!boundedText(String(prog.code||''),40)||!String(prog.code||'').trim()||!boundedText(String(prog.description||''),800)||!['Arts','Sports'].includes(prog.area)||!(validCategories.has(prog.category)||prog.category==='Group Item')||!['All','Boys','Girls'].includes(prog.gender)||typeof prog.capacity!=='number'||!Number.isFinite(prog.capacity)||prog.capacity<1||!['open','closed','draft'].includes(prog.status)||(prog.category==='Group Item'&&(!['classes','categories'].includes(prog.groupScope)||!Number.isInteger(prog.classMin)||!Number.isInteger(prog.classMax)||prog.classMin<1||prog.classMax>12||prog.classMin>prog.classMax||(prog.groupScope==='categories'&&(!Array.isArray(prog.eligibleCategories)||!prog.eligibleCategories.length||prog.eligibleCategories.some(c=>!validCategories.has(c)))))))throw new Error('Backup contains an invalid or duplicate programme record.');programmeIds.add(id);programmeCodes.add(code);}
    for(const prog of data.programmes){prog.ageGroup='Open';prog.ageCutoffDate='';prog.maxAge=null;}
    const groupTeamIds=new Set();for(const team of data.groupTeams){const teamId=Number(team?.id),programmeId=Number(team?.programmeId),teamProgramme=data.programmes.find(item=>Number(item.id)===programmeId);if(!team||typeof team!=='object'||Array.isArray(team)||!Number.isSafeInteger(teamId)||teamId<1||groupTeamIds.has(teamId)||!programmeIds.has(programmeId)||teamProgramme?.category!=='Group Item'||team.mode!=='house'||typeof team.house!=='string'||!team.house.trim()||team.house.length>40||!data.settings.houseNames.includes(team.house)||typeof team.category!=='string'||!validCategories.has(team.category)||!Array.isArray(team.studentIds)||team.studentIds.length<1||team.studentIds.length>1000||team.studentIds.some(id=>!Number.isSafeInteger(Number(id))||Number(id)<1)||new Set(team.studentIds.map(Number)).size!==team.studentIds.length)throw new Error('Backup contains an invalid House Team record.');groupTeamIds.add(teamId);}
    const registrationKeys=new Set(),registrationIds=new Set(),registrationsByKey=new Map(),registrationsByTeam=new Map();for(const reg of data.registrations){const sid=Number(reg.studentId),pid=Number(reg.programmeId),rid=Number(reg.id),key=`${sid}:${pid}`;if(typeof reg.id!=='number'||typeof reg.studentId!=='number'||typeof reg.programmeId!=='number'||!Number.isSafeInteger(rid)||rid<1||registrationIds.has(rid)||!studentIds.has(sid)||!programmeIds.has(pid)||registrationKeys.has(key))throw new Error('Backup contains a duplicate or broken registration reference.');registrationIds.add(rid);registrationKeys.add(key);registrationsByKey.set(key,reg);if(reg.groupTeamId!==undefined&&reg.groupTeamId!==null){const teamId=Number(reg.groupTeamId);if(!Number.isSafeInteger(teamId)||!groupTeamIds.has(teamId))throw new Error('Backup contains a registration linked to a missing House Team.');registrationsByTeam.set(`${teamId}:${sid}`,reg);}}
    const groupedStudentsByProgramme=new Set();for(const team of data.groupTeams){const programme=data.programmes.find(item=>Number(item.id)===Number(team.programmeId));for(const rawStudentId of team.studentIds){const sid=Number(rawStudentId),student=data.students.find(item=>Number(item.id)===sid),key=`${team.programmeId}:${sid}`,registration=registrationsByKey.get(`${sid}:${team.programmeId}`);if(!student||student.house!==team.house||!registration||Number(registration.groupTeamId)!==Number(team.id)||groupedStudentsByProgramme.has(key)||catForClassWithBands(student.classNo,savedBands)!==team.category||programme.gender!=='All'&&student.gender!==programme.gender||programme.groupScope==='classes'&&(student.classNo<programme.classMin||student.classNo>programme.classMax)||programme.groupScope==='categories'&&!programme.eligibleCategories.includes(team.category))throw new Error('Backup contains a House Team member with invalid eligibility or a missing/mismatched registration.');groupedStudentsByProgramme.add(key);}}
    for(const reg of data.registrations){if(reg.groupTeamId===undefined||reg.groupTeamId===null)continue;const team=data.groupTeams.find(item=>Number(item.id)===Number(reg.groupTeamId));if(!team||Number(team.programmeId)!==Number(reg.programmeId)||!team.studentIds.map(Number).includes(Number(reg.studentId))||!registrationsByTeam.has(`${team.id}:${reg.studentId}`))throw new Error('Backup contains a registration with a broken House Team membership.');} 
    const resultKeys=new Set(),rankKeys=new Set();for(const result of data.results){const numericRank=Number(result.rank),key=`${Number(result.studentId)}:${Number(result.programmeId)}`,rankKey=`${Number(result.programmeId)}:${numericRank}`;if(typeof result.studentId!=='number'||typeof result.programmeId!=='number'||!studentIds.has(Number(result.studentId))||!programmeIds.has(Number(result.programmeId))||![1,2,3].includes(numericRank)||!registrationKeys.has(key)||resultKeys.has(key)||rankKeys.has(rankKey))throw new Error('Backup contains an invalid or duplicate result record.');result.rank=numericRank;resultKeys.add(key);rankKeys.add(rankKey);} 
    const eventIds=new Set();for(const event of data.events){const id=Number(event.id),date=String(event.date||''),endDate=String(event.endDate||date),validDate=value=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);if(!m)return false;const d=new Date(Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3])));return d.getUTCFullYear()===Number(m[1])&&d.getUTCMonth()===Number(m[2])-1&&d.getUTCDate()===Number(m[3]);};if(typeof event.id!=='number'||!Number.isSafeInteger(id)||id<1||eventIds.has(id)||!boundedText(String(event.title||''),120)||!String(event.title||'').trim()||!boundedText(String(event.venue||''),100)||!boundedText(String(event.coordinator||''),100)||!boundedText(String(event.description||''),800)||!validDate(date)||!validDate(endDate)||endDate<date||event.time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(event.time)||event.endTime&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(event.endTime)||!['Everyone','Parents and students','Teachers','Staff only',undefined].includes(event.audience)||event.description&&String(event.description).length>800)throw new Error('Backup contains an invalid event (title, date, time or audience).');eventIds.add(id);event.endDate=endDate;if(typeof event.allDay!=='boolean')event.allDay=!event.time;}
    const userIds=new Set();for(const user of data.users){if(!user||typeof user!=='object'||Array.isArray(user)||typeof user.id!=='number'||!Number.isSafeInteger(Number(user.id))||Number(user.id)<1||userIds.has(Number(user.id))||!['admin','teacher','parent'].includes(user.role)||typeof user.displayName!=='string'||!user.displayName.trim()||user.displayName.length>120||/[\u0000-\u001f\u007f]/.test(user.displayName))throw new Error('Backup contains an unsupported or invalid account. Developer identities are not part of the HTML workspace.');userIds.add(Number(user.id));if(user.role==='parent'&&(!Array.isArray(user.linkedStudentIds)||user.linkedStudentIds.length>1000||user.linkedStudentIds.some(id=>!studentIds.has(Number(id)))||new Set(user.linkedStudentIds.map(Number)).size!==user.linkedStudentIds.length))throw new Error('Backup contains a parent account with an invalid or duplicate linked child reference.');if(user.role==='parent'&&(!Array.isArray(user.classNumbers)||user.classNumbers.length>12||user.classNumbers.some(n=>!Number.isInteger(Number(n))||Number(n)<1||Number(n)>12)||new Set(user.classNumbers.map(Number)).size!==user.classNumbers.length))throw new Error('Backup contains a parent account with an invalid class assignment.');}
    for(const [key,teacherId] of Object.entries(data.settings.classTeachers)){const parts=key.split('|'),classNo=Number(parts[0]),section=String(parts[1]||'');const teacher=data.users.find(u=>Number(u.id)===Number(teacherId));if(parts.length!==2||!data.settings.classes.map(Number).includes(classNo)||!(data.settings.sections.includes(section)||section==='Unsectioned')||!teacher||teacher.role!=='teacher'||teacher.active===false)throw new Error('Backup contains an invalid class teacher assignment.');}
    if(!data.users.some(u=>u.role==='admin'&&u.active))throw new Error('Backup must retain at least one active administrator.');
    for(const row of data.audit){if(!row||typeof row!=='object'||Array.isArray(row)||!Number.isSafeInteger(Number(row.id))||Number(row.id)<1||typeof row.action!=='string'||row.action.length>100||typeof row.record!=='string'||row.record.length>120||typeof row.detail!=='string'||row.detail.length>2000||row.date&&!Number.isFinite(Date.parse(row.date)))throw new Error('Backup contains an invalid audit-log record.');}
    const teacherIds=new Set(data.users.filter(user=>user.role==='teacher').map(user=>String(user.id)));
    if(data.settings.teacherPermissions!==undefined&&(!data.settings.teacherPermissions||typeof data.settings.teacherPermissions!=='object'||Array.isArray(data.settings.teacherPermissions)))throw new Error('Backup contains an invalid teacher permission map.');
    for(const [teacherId,permissions] of Object.entries(data.settings.teacherPermissions||{}))if(!teacherIds.has(teacherId)||!permissions||typeof permissions!=='object'||Array.isArray(permissions)||Object.entries(permissions).some(([key,value])=>!['viewReports','addStudents','editStudents','removeStudents','assignHouses','manageSections'].includes(key)||typeof value!=='boolean'))throw new Error('Backup contains invalid teacher powers.');
    const selectionKeys=new Set();for(const selection of data.selections){const key=String(selection.programmeId);if(typeof selection.studentId!=='number'||typeof selection.programmeId!=='number'||!studentIds.has(Number(selection.studentId))||!programmeIds.has(Number(selection.programmeId))||selectionKeys.has(key)||!['School competition','Direct Sahodaya Entry'].includes(selection.pathway)||(selection.pathway==='School competition'&&!registrationKeys.has(`${Number(selection.studentId)}:${Number(selection.programmeId)}`)))throw new Error('Backup contains an invalid or duplicate Sahodaya selection.');selectionKeys.add(key);}
    const electionIds=new Set(),globalPositionIds=new Set(),globalCandidateIds=new Set();for(const election of data.elections){const electionId=Number(election.id),opens=schoolDateTimeMillis(election.openAt),closes=schoolDateTimeMillis(election.closeAt);if(typeof election.id!=='number'||!Number.isSafeInteger(electionId)||electionId<1||electionIds.has(electionId)||!boundedText(String(election.title||''),100)||!String(election.title||'').trim()||!Number.isFinite(opens)||!Number.isFinite(closes)||closes<=opens||typeof election.showLive!=='boolean'||typeof election.allowAbstain!=='boolean'||!Array.isArray(election.positions)||election.positions.length>30||!Array.isArray(election.ballots)||election.ballots.length>MAX_ELECTION_BALLOTS||!Array.isArray(election.tokens)||election.tokens.length>50000||!Array.isArray(election.usedTokens)||election.usedTokens.length>50000||!['draft','open','closed','published'].includes(election.status)||typeof election.publicKey!=='string'||election.publicKey.length<8||election.publicKey.length>128||!Array.isArray(election.eligibleClasses)||!election.eligibleClasses.length||new Set(election.eligibleClasses.map(Number)).size!==election.eligibleClasses.length||election.eligibleClasses.some(c=>!data.settings.classes.map(Number).includes(Number(c))))throw new Error('Backup contains an invalid election record.');if(election.status!=='draft'&&(!election.positions.length||election.positions.some(pos=>!Array.isArray(pos.candidates)||!pos.candidates.length)))throw new Error('An opened or completed election must retain at least one candidate for every position.');electionIds.add(electionId);const positions=new Set(election.positions.map(x=>String(x.id)));if(positions.size!==election.positions.length)throw new Error('Backup contains duplicate election positions.');const candidates=new Set();let totalCandidates=0;for(const position of election.positions){const positionId=Number(position.id);if(typeof position.id!=='number'||!Number.isSafeInteger(positionId)||positionId<1||globalPositionIds.has(positionId)||!Array.isArray(position.candidates)||position.candidates.length>100||!boundedText(String(position.name||''),80)||!String(position.name||'').trim())throw new Error('Backup contains an invalid or duplicate election position.');globalPositionIds.add(positionId);for(const candidate of position.candidates){const candidateId=Number(candidate.id);if(typeof candidate.id!=='number'||!Number.isSafeInteger(candidateId)||candidateId<1||candidates.has(candidateId)||globalCandidateIds.has(candidateId)||!boundedText(String(candidate.name||''),80)||!String(candidate.name||'').trim()||!boundedText(String(candidate.classLabel||''),40)||!boundedText(String(candidate.details||''),240))throw new Error('Backup contains an invalid or duplicate candidate.');candidates.add(candidateId);globalCandidateIds.add(candidateId);totalCandidates++;}}if(totalCandidates>1000)throw new Error('Election backup exceeds the public ballot limit of 1,000 candidates.');const ballotIds=new Set();for(const ballot of election.ballots){if(!ballot||typeof ballot.id!=='string'||!/^anon-[a-f0-9]{16,}$/i.test(ballot.id)||ballotIds.has(ballot.id)||typeof ballot.choices!=='object'||Array.isArray(ballot.choices)||Object.keys(ballot).some(key=>!['id','choices'].includes(key)))throw new Error('Backup contains an invalid or identifiable ballot record.');ballotIds.add(ballot.id);if(!election.allowAbstain&&election.positions.some(pos=>!Object.hasOwn(ballot.choices,String(pos.id))))throw new Error('Backup contains an incomplete ballot.');for(const [positionId,candidateId] of Object.entries(ballot.choices)){const pos=election.positions.find(x=>String(x.id)===positionId);if(!positions.has(positionId)||!pos.candidates.some(c=>String(c.id)===String(candidateId)))throw new Error('Backup contains a ballot with an invalid candidate reference.');}}const uniqueTokens=new Set(election.tokens);if(uniqueTokens.size!==election.tokens.length||election.tokens.some(token=>typeof token!=='string'||!token.trim()||token.length>200)||new Set(election.usedTokens).size!==election.usedTokens.length||election.usedTokens.some(token=>!election.tokens.includes(token)))throw new Error('Backup contains invalid or duplicate election eligibility codes.');}
    const max=(arr,key)=>arr.reduce((n,x)=>Math.max(n,Number(x[key])||0),0);
    const maxPosition=Math.max(0,...data.elections.flatMap(e=>e.positions.map(x=>Number(x.id)||0))),maxCandidate=Math.max(0,...data.elections.flatMap(e=>e.positions.flatMap(pos=>pos.candidates.map(x=>Number(x.id)||0))));
    if(data.nextIds.student<=max(data.students,'id')||data.nextIds.programme<=max(data.programmes,'id')||data.nextIds.registration<=max(data.registrations,'id')||data.nextIds.groupTeam<=max(data.groupTeams,'id')||data.nextIds.event<=max(data.events,'id')||data.nextIds.user<=max(data.users,'id')||data.nextIds.election<=max(data.elections,'id')||data.nextIds.position<=maxPosition||data.nextIds.candidate<=maxCandidate)throw new Error('Backup ID counters would cause future record ID collisions.');
    return true;
  }

  const PORTAL_DATA_KEY_PREFIXES=[KEY,ELECTION_KEY,ELECTION_INDEX_KEY,ELECTION_CONFIG_PREFIX,ELECTION_PUBLIC_CONFIG_PREFIX,BALLOT_KEY,BALLOT_KEY_PREFIX,BALLOT_CHUNK_PREFIX,BALLOT_META_PREFIX,SUMMARY_KEY_PREFIX];
  function isPortalDataStorageKey(key){return PORTAL_DATA_KEY_PREFIXES.some(prefix=>key===prefix||key.startsWith(prefix));}
  function snapshotPortalDataStorage(){
    const snapshot=new Map();
    try{
      for(let i=0;i<window.localStorage.length;i++){
        const key=window.localStorage.key(i);
        if(key&&isPortalDataStorageKey(key))snapshot.set(key,window.localStorage.getItem(key));
      }
    }catch{throw new Error('Browser storage is unavailable. Backup restore was stopped before changing any data.');}
    // Only failed persistent writes/removals override the browser's stale values.
    // Ordinary cache entries are not authoritative, but an in-session fallback
    // write must survive a later rollback snapshot.
    for(const [key,value] of memoryStorage)if(isPortalDataStorageKey(key)&&memoryStorageOverrides.has(key))snapshot.set(key,value);
    for(const key of memoryStorageRemoved)if(isPortalDataStorageKey(key))snapshot.delete(key);
    return snapshot;
  }
  function clearPortalDataStorage(){
    const keys=new Set();
    try{for(let i=0;i<window.localStorage.length;i++){const key=window.localStorage.key(i);if(key&&isPortalDataStorageKey(key))keys.add(key);}}
    catch{return false;}
    for(const key of memoryStorage.keys())if(isPortalDataStorageKey(key))keys.add(key);
    let ok=true;for(const key of keys)if(!storageRemove(key))ok=false;
    return ok;
  }
  function restorePortalDataStorage(snapshot){
    let ok=clearPortalDataStorage();
    for(const [key,value] of snapshot)if(!storageSet(key,value))ok=false;
    // Verify through the same read path used by the application so a tab that
    // is already in temporary-session mode can verify its in-memory rollback.
    try{for(const [key,value] of snapshot)if(storageGet(key)!==value)ok=false;}
    catch{ok=false;}
    return ok;
  }

  document.addEventListener('change',async event=>{
    const el=event.target;
    if(el.name==='teamCategory'||el.name==='teamHouse'){syncGroupTeamForm(el.closest('[data-form="group-team"]'));return;}
    if(el.name==='pathway'&&el.closest('form[data-form="sahodaya"]'))syncSahodayaForm(el.closest('form'));if(el.matches('[data-picker-class],[data-picker-section]'))syncHierarchicalStudentPicker(el.closest('[data-student-picker]'));if(el.id==='staff-parent-class'||el.id==='staff-parent-section'){const form=el.closest('[data-form="staff"]');if(el.id==='staff-parent-class'){const section=$('#staff-parent-section',form);section.innerHTML='<option value="">Choose section</option>'+selectOptions(sections);section.value='';}syncParentChildPicker(form);}
    if(el.matches('select[data-workspace-role]')){closeSidebar(false);state.role=el.value;const first=db.users.find(x=>x.role===state.role&&x.active);state.previewUserId=first?.id??null;state.selectedStudentId=state.role==='parent'?(first?.linkedStudentIds?.[0]||first?.linkedStudentId||null):null;state.page='dashboard';state.studentBrowser={classNo:null,section:null,q:'',gender:'',category:'',sort:'name'};state.adminStudentBrowser={classNo:null,section:null,q:'',gender:'',category:'',sort:'name'};state.programmeDetailBrowser={classNo:null,section:null};state.adminRegistrationBrowser={classNo:null,section:null};state.reportBrowser={classNo:null,section:null};render();return;}
    if(el.matches('select[data-preview-account]')){state.previewUserId=Number(el.value)||null;state.selectedStudentId=state.role==='parent'?(userByRole('parent')?.linkedStudentIds?.[0]||userByRole('parent')?.linkedStudentId||null):null;closeSidebar(false);render();return;}
    if(el.id==='parent-child-select'){state.selectedStudentId=Number(el.value);render();return;}
    if(el.id==='student-browser-search'){const target=state.page==='admin'?state.adminStudentBrowser:state.studentBrowser;target.q=el.value;return;}
    if(el.id==='calendar-type'){state.calendarType=el.value||'All';render();return;}
    if(['student-class','student-section','student-gender','student-category'].includes(el.id)){state.studentFilters={q:$('#student-q')?.value||'',classNo:$('#student-class')?.value||'',section:$('#student-section')?.value||'',gender:$('#student-gender')?.value||'',category:$('#student-category')?.value||''};render();return;}
    if(['programme-category','programme-type','programme-gender','programme-status','programme-sort'].includes(el.id)){const kind=el.dataset.kind,previous=state.programmeFilters[kind]||{};state.programmeFilters[kind]={...previous,q:$('#programme-search')?.value||'',category:$('#programme-category')?.value||'',type:$('#programme-type')?.value||'',gender:$('#programme-gender')?.value||'',status:$('#programme-status')?.value||'',sort:$('#programme-sort')?.value||'name',moreOpen:previous.moreOpen};render();return;}
    if(['admin-prog-area','admin-prog-category','admin-prog-status','admin-prog-sort'].includes(el.id)){state.adminProgrammeFilters={...state.adminProgrammeFilters,q:$('#admin-prog-q')?.value||'',area:$('#admin-prog-area')?.value||'',category:$('#admin-prog-category')?.value||'',status:$('#admin-prog-status')?.value||'',sort:$('#admin-prog-sort')?.value||'name',moreOpen:state.adminProgrammeFilters.moreOpen};render();return;}
    if(['admin-reg-area','admin-reg-programme','admin-reg-category','admin-reg-age','admin-reg-sort'].includes(el.id)){state.adminRegistrationFilters={...state.adminRegistrationFilters,q:$('#admin-reg-q')?.value||'',area:$('#admin-reg-area')?.value||'',programme:$('#admin-reg-programme')?.value||'',category:$('#admin-reg-category')?.value||'',age:$('#admin-reg-age')?.value||'',sort:$('#admin-reg-sort')?.value||'programme',moreOpen:true};render();return;}
    if(['detail-class','detail-section','detail-category','detail-age','detail-registration','detail-rank','detail-sort'].includes(el.id)){state.programmeDetailFilters={...state.programmeDetailFilters,q:$('#detail-q')?.value||'',classNo:$('#detail-class')?.value||'',section:$('#detail-section')?.value||'',category:$('#detail-category')?.value||'',age:$('#detail-age')?.value||'',registration:$('#detail-registration')?.value||'',rank:$('#detail-rank')?.value||'',sort:$('#detail-sort')?.value||'class',moreOpen:state.programmeDetailFilters.moreOpen};render();return;}
    if(['report-category','report-age','report-sort'].includes(el.id)){state.reportFilters={...state.reportFilters,q:$('#report-q')?.value||'',category:$('#report-category')?.value||'',age:$('#report-age')?.value||'',sort:$('#report-sort')?.value||'name',moreOpen:true};render();return;}
    if(['physical-print-programme','physical-print-class','physical-print-section','physical-print-gender','physical-print-category','physical-print-house','physical-print-age'].includes(el.id)){state.reportPrint={...state.reportPrint,programme:$('#physical-print-programme')?.value||'',classNo:$('#physical-print-class')?.value||'',section:$('#physical-print-section')?.value||'',gender:$('#physical-print-gender')?.value||'',category:$('#physical-print-category')?.value||'',house:$('#physical-print-house')?.value||'',age:$('#physical-print-age')?.value||''};render();return;}
    if(['results-area','results-category','results-class','results-status','results-sort'].includes(el.id)){state.resultsFilters={...state.resultsFilters,q:$('#results-q')?.value||'',area:$('#results-area')?.value||'',category:$('#results-category')?.value||'',classNo:$('#results-class')?.value||'',status:$('#results-status')?.value||'',sort:$('#results-sort')?.value||'name',moreOpen:true};render();return;}
    if(['student-browser-gender','student-browser-category','student-browser-age','student-browser-sort'].includes(el.id)){const target=state.page==='admin'?state.adminStudentBrowser:state.studentBrowser;if(state.page!=='admin')target.gender=$('#student-browser-gender')?.value||'';target.category=$('#student-browser-category')?.value||'';target.age=$('#student-browser-age')?.value||'';target.sort=$('#student-browser-sort')?.value||'name';target.moreOpen=true;render();return;}
    if(el.matches('[data-physical-print-column]')){const key=el.dataset.physicalPrintColumn;const cols=new Set(state.reportPrint?.columns||[]);if(el.checked)cols.add(key);else cols.delete(key);if(!cols.size){el.checked=true;return toast('Keep at least one detail column for the printed sheet.','warning');}state.reportPrint={...state.reportPrint,columns:[...cols]};render();return;}
    if(el.id==='student-file'&&el.files?.[0]){try{await importStudentFile(el.files[0]);}catch(err){toast(`Could not read import file: ${err.message}`,'error');}el.value='';return;}
    if(el.id==='election-select'){state.electionId=Number(el.value);render();return;}
    if(el.id==='backup-file'&&el.files?.[0]){try{
      if(!isAdmin())throw new Error('Only administrators can restore a backup.');
      if(el.files[0].size>15*1024*1024)throw new Error('A browser backup is limited to 15 MB.');
      const imported=migrateDatabase(JSON.parse(await el.files[0].text()));
      validateBackupShape(imported);
      if(confirm('Replace this browser data with the selected backup? Download a backup first if you need the current data.')){
        const storageSnapshot=snapshotPortalDataStorage();
        const previousDb=db,previousElectionDb=electionDb,previousClasses=classes.slice(),previousSections=sections.slice();
        const previousDatabaseError=databaseRecoveryError,previousElectionError=electionRecoveryError;
        const importedElectionStore=normalizeElectionStore(imported.elections,imported.nextIds||{});
        delete imported.elections;
        delete imported.nextIds.election;delete imported.nextIds.position;delete imported.nextIds.candidate;
        try{
          if(!clearPortalDataStorage())throw new Error('Old portal data could not be cleared safely. No restore was committed.');
          databaseRecoveryError=null;electionRecoveryError=null;
          db=imported;electionDb=importedElectionStore;
          if(!storageSet(KEY,JSON.stringify(db)))throw new Error('School data could not be saved.');
          if(!saveElectionDatabase())throw new Error('Election settings could not be saved.');
          for(const election of electionDb.elections){
            const ballots=Array.isArray(election.ballots)?election.ballots:[];
            if(!writeElectionBallots(election.id,ballots))throw new Error(`Ballots for “${election.title}” could not be saved.`);
            if(!saveElectionSummary(election.id,buildElectionSummary({...election,ballots})))throw new Error(`Results for “${election.title}” could not be saved.`);
            election.ballots=[];
          }
          if(!storageRemove(ELECTION_KEY)||!storageRemove(BALLOT_KEY))throw new Error('Legacy election data could not be cleared.');
          if(!storageSet(KEY,JSON.stringify(db)))throw new Error('Final school data could not be committed.');
          if(Array.isArray(db.settings?.classes)&&db.settings.classes.length)classes=db.settings.classes.map(Number).sort((a,b)=>a-b);
          if(Array.isArray(db.settings?.sections)&&db.settings.sections.length)sections=db.settings.sections.slice();
          persistentStorageAvailable=true;syncElectionBallots();updateStorageStatus();render();toast('Backup restored and verified.');
        }catch(restoreError){
          db=previousDb;electionDb=previousElectionDb;classes=previousClasses;sections=previousSections;
          databaseRecoveryError=previousDatabaseError;electionRecoveryError=previousElectionError;
          const rolledBack=restorePortalDataStorage(storageSnapshot);
          if(!rolledBack){databaseRecoveryError=new Error('Backup restore failed and the previous browser data could not be fully restored. Stop editing and use a known-good backup for recovery.');electionRecoveryError=databaseRecoveryError;}
          syncElectionBallots();updateStorageStatus();
          throw new Error(rolledBack?`${restoreError.message} The previous saved data was restored and verified.`:`${restoreError.message} WARNING: rollback could not be verified. Do not continue editing this browser profile.`);
        }
      }
    }catch(err){toast(err.message,'error');}el.value='';}
    if(el.id==='programme-scope'){syncProgrammeForm();}
    if(el.id==='programme-category-form'){syncProgrammeForm();}
  });
  document.addEventListener('input',event=>{
    const el=event.target;
    if(el.id==='student-browser-search'){clearTimeout(state.searchTimer);const target=state.page==='admin'?state.adminStudentBrowser:state.studentBrowser;const value=el.value;state.searchTimer=setTimeout(()=>{target.q=value;const input=$('#student-browser-search');const pos=input?.selectionStart;render();const refreshed=$('#student-browser-search');if(refreshed){refreshed.focus();refreshed.setSelectionRange(pos,pos);}},180);}
    if(el.id==='admin-nav-search'){
      const query=el.value.trim().toLocaleLowerCase();let matches=0;
      $$('.admin-nav-group').forEach(group=>{
        const groupMatch=group.querySelector('h2')?.textContent.toLocaleLowerCase().includes(query)||false;
        let visible=0;
        $$('[data-admin-nav-item]',group).forEach(item=>{const match=!query||groupMatch||item.textContent.toLocaleLowerCase().includes(query);item.hidden=!match;if(match){visible++;matches++;}});
        group.hidden=!!query&&visible===0;
      });
      const overview=$('[data-admin-nav-item="overview"]');if(overview){const match=!query||overview.textContent.toLocaleLowerCase().includes(query);overview.hidden=!match;if(match)matches++;}
      const empty=$('#admin-nav-empty');if(empty)empty.hidden=matches>0;
    }
    if(el.id==='calendar-search'){clearTimeout(state.searchTimer);const value=el.value;state.searchTimer=setTimeout(()=>{state.calendarQuery=value;const pos=value.length;render();const input=$('#calendar-search');if(input){input.focus();input.setSelectionRange(pos,pos);}},180);}
    if(el.id==='parent-account-search'&&state.role==='admin'&&state.adminTab==='parents'){
      const query=el.value.trim().toLocaleLowerCase();state.parentAccountQuery=el.value.trim();
      let visible=0;
      $$('.parent-class-group').forEach(group=>{let groupVisible=0;$$('[data-parent-row]',group).forEach(row=>{const match=!query||String(row.dataset.parentSearch||'').includes(query);row.hidden=!match;if(match){groupVisible++;visible++;}});group.hidden=groupVisible===0;group.open=!!query&&groupVisible>0;});
      const empty=$('#parent-search-empty');if(empty)empty.hidden=visible>0;
    }
    if(el.id==='student-q'){clearTimeout(state.searchTimer);state.searchTimer=setTimeout(()=>{state.studentFilters={...state.studentFilters,q:el.value};render();},180);}
    if(el.id==='programme-search'){const kind=el.dataset.kind;clearTimeout(state.searchTimer);state.searchTimer=setTimeout(()=>{state.programmeFilters[kind]={...(state.programmeFilters[kind]||{}),q:el.value};render();},180);}
    if(el.id==='admin-prog-q'){clearTimeout(state.searchTimer);state.searchTimer=setTimeout(()=>{state.adminProgrammeFilters={...state.adminProgrammeFilters,q:el.value,area:$('#admin-prog-area')?.value||'',category:$('#admin-prog-category')?.value||'',status:$('#admin-prog-status')?.value||'',sort:$('#admin-prog-sort')?.value||'name',moreOpen:state.adminProgrammeFilters.moreOpen};render();},180);}
    if(el.id==='admin-reg-q'){clearTimeout(state.searchTimer);state.searchTimer=setTimeout(()=>{state.adminRegistrationFilters={...state.adminRegistrationFilters,q:el.value,area:$('#admin-reg-area')?.value||'',programme:$('#admin-reg-programme')?.value||'',category:$('#admin-reg-category')?.value||'',age:$('#admin-reg-age')?.value||'',sort:$('#admin-reg-sort')?.value||'programme',moreOpen:state.adminRegistrationFilters.moreOpen};render();},180);}
    if(el.id==='detail-q'){clearTimeout(state.searchTimer);state.searchTimer=setTimeout(()=>{state.programmeDetailFilters={...state.programmeDetailFilters,q:el.value};render();},180);}
    if(el.id==='results-q'){clearTimeout(state.searchTimer);const value=el.value;state.searchTimer=setTimeout(()=>{state.resultsFilters={...state.resultsFilters,q:value};render();const input=$('#results-q');if(input){input.focus();input.setSelectionRange(value.length,value.length);}},180);}
    if(el.id==='report-q'){clearTimeout(state.searchTimer);const value=el.value;state.searchTimer=setTimeout(()=>{state.reportFilters={...state.reportFilters,q:value};render();const input=$('#report-q');if(input){input.focus();input.setSelectionRange(value.length,value.length);}},180);}
    if(el.id==='physical-print-q'){clearTimeout(state.searchTimer);const value=el.value;state.searchTimer=setTimeout(()=>{state.reportPrint={...state.reportPrint,q:value};render();const input=$('#physical-print-q');if(input){input.focus();input.setSelectionRange(value.length,value.length);}},180);}
    if(el.id==='admin-student-search'){const query=el.value.toLowerCase();$$('.data-table tbody tr').forEach(row=>row.hidden=!row.textContent.toLowerCase().includes(query));}
    if(['classNo','classNoPreview'].includes(el.name)&&$('#student-category-preview'))$('#student-category-preview').textContent=catForClass(el.value);
  });

  function syncSahodayaForm(form=$('[data-form="sahodaya"]',$('#modal-body'))) {
    if(!form)return;
    const pathway=$('[name="pathway"]',form)?.value||'School competition';
    const pid=Number(form.dataset.programme),programme=programmeById(pid);
    const candidates=pathway==='Direct Sahodaya Entry'?db.students.filter(st=>isEligible(st,programme)):db.registrations.filter(r=>r.programmeId===pid).map(r=>studentById(r.studentId)).filter(st=>isEligible(st,programme));
    const previous=$('[name="studentId"]',form)?.value;
    const host=$('[data-sahodaya-picker]',form);if(host)host.innerHTML=hierarchicalStudentPicker(candidates,previous,'Choose representative');
  }

  function syncStaffForm() {
    const role=$('[name="role"]',$('#modal-body'))?.value;
    const parentField=$('#staff-parent-link'),classField=$('#staff-class-assign');
    if(parentField)parentField.hidden=role!=='parent';
    if(classField)classField.hidden=role!=='teacher';
  }

  function syncProgrammeForm() {
    const modal=$('#modal-body'),category=$('[name="category"]',modal),area=$('[name="area"]',modal);if(!category||!area)return;
    const group=category.value==='Group Item',classScope=$('[name="groupScope"]',modal)?.value||'classes';
    const typeField=$('#programme-type-field',modal),genderField=$('#programme-gender-field',modal),groupMode=$('#group-mode-field',modal),groupScope=$('#group-scope-field',modal),minField=$('#class-min-field',modal),maxField=$('#class-max-field',modal),eligible=$('#eligible-categories-field',modal);
    if(typeField)typeField.hidden=group;if(genderField)genderField.hidden=area.value==='Arts'&&!group;if(groupMode)groupMode.hidden=!group;if(groupScope)groupScope.hidden=!group;if(minField)minField.hidden=!group||classScope!=='classes';if(maxField)maxField.hidden=!group||classScope!=='classes';if(eligible)eligible.hidden=!group||classScope!=='categories';
    const typeSelect=$('[name="itemType"]',modal);if(typeSelect){const old=typeSelect.value,values=area.value==='Arts'?[{value:'offstage',label:'Offstage'},{value:'onstage',label:'Onstage'}]:[{value:'track',label:'Track item'},{value:'field',label:'Field item'}];typeSelect.innerHTML=selectOptions(values,values.some(x=>x.value===old)?old:values[0].value);}
  }
  document.addEventListener('change',event=>{
    const el=event.target;
    if(el.id==='admin-mobile-tab'&&isAdmin()&&el.value){state.adminTab=el.value;closeSidebar();render();return;}
    if(el.matches('[data-parent-portal-permission]')){
      if(!isAdmin())return toast('Only administrators can change parent portal access.','error');
      const user=db.users.find(u=>u.id===Number(el.dataset.user)&&u.role==='parent');if(!user)return;
      user.portalEnabled=el.checked;audit('parent_portal_access_changed','Parent account',`${user.displayName} · ${el.checked?'enabled':'disabled'}`);if(!saveDatabase()){render();return toast('Parent portal access could not be saved. The previous setting was restored.','error');}toast(`Parent portal ${el.checked?'enabled':'disabled'}.`);return;
    }
    if(el.matches('[data-teacher-house-student]')){
      if(state.role!=='teacher'||!currentTeacherCanAssignHouses())return toast('House assignment is not enabled for this teacher.','error');
      const student=studentById(el.dataset.id),house=String(el.value||'');
      if(!student||!teacherCanAccessStudent(student)||!teacherCanAccessSection(student.classNo,student.section))return toast('You can assign houses only in your class-teacher sections.','error');
      if(house&&!db.settings.houseNames.includes(house))return toast('Choose a configured house.','error');
      student.house=house;audit('teacher_house_assigned','House assignment',`${student.name} · ${house||'Unassigned'} · ${ordinalClass(student.classNo)} ${student.section}`);if(!saveDatabase()){render();return toast('The house assignment could not be saved. The previous assignment was restored.','error');}
      const select=$(`[data-teacher-house-student][data-id="${student.id}"]`);if(select)select.value=house;toast(`${student.name}: ${house||'Unassigned'}.`);return;
    }
    if(el.matches('[data-class-teacher]')){
      if(!isAdmin()){toast('Only administrators can assign class teachers.','error');return;}
      const key=classSectionKey(el.dataset.class,el.dataset.section),teacherId=Number(el.value||0),teacher=db.users.find(u=>u.id===teacherId&&u.active&&u.role==='teacher');
      if(el.value&&!teacher){toast('Choose an active teacher account.','error');el.value='';return;}
      const previousTeacherId=Number(db.settings.classTeachers[key]||0);
      if(el.value)db.settings.classTeachers[key]=teacherId;else delete db.settings.classTeachers[key];
      audit('class_teacher_assigned','Class teachers',`${ordinalClass(el.dataset.class)} ${el.dataset.section} · ${teacher?.displayName||'Unassigned'}`);if(!saveDatabase()){render();return toast('The class-teacher assignment could not be saved. The previous assignment was restored.','error');}const keep=state.classTeacherClass;render();state.classTeacherClass=keep;return;
    }
    if(el.id==='school-logo-file'||el.id==='school-background-file'){
      if(!isAdmin())return toast('Only administrators can change school branding.','error');
      const file=el.files?.[0];if(!file)return;
      if(!['image/png','image/jpeg','image/webp'].includes(file.type))return toast('Use a PNG, JPG or WebP image. SVG uploads are not accepted.','error');
      if(file.size>700*1024)return toast('Choose an image smaller than 700 KB so it fits safely in browser storage.','error');
      const reader=new FileReader();reader.onload=()=>{if(el.id==='school-logo-file')db.settings.logoDataUrl=String(reader.result);else db.settings.backgroundDataUrl=String(reader.result);audit('school_branding_updated','School identity',el.id==='school-logo-file'?'Logo updated':'Background updated');if(!saveDatabase())return toast('School branding could not be saved. The previous saved branding was restored.','error');render();toast('School branding updated.');};reader.onerror=()=>toast('The image could not be read.','error');reader.readAsDataURL(file);el.value='';
    }
  });
  $('#modal-body').addEventListener('change',event=>{if(event.target.matches('[data-import-map]')){state.importColumnMap[event.target.dataset.importMap]=event.target.value;renderImportPreview();return;}if(['category','area','groupScope','groupMode'].includes(event.target.name))syncProgrammeForm();if(event.target.name==='role')syncStaffForm();if(['teamCategory','teamHouse'].includes(event.target.name))syncGroupTeamForm(event.target.closest('[data-form="group-team"]'));if(event.target.name==='studentIds'){const form=event.target.closest('[data-form="group-team"]');if(form){const count=form.querySelector('[data-group-team-count]');if(count)count.textContent=`${form.querySelectorAll('[name="studentIds"]:checked').length} of ${form.querySelectorAll('[name="studentIds"]').length} eligible students selected.`;const submit=form.querySelector('button[type="submit"]');if(submit)submit.disabled=!form.querySelector('[name="studentIds"]:checked');}}if(event.target.name==='pathway'&&event.target.closest('[data-form="sahodaya"]'))syncSahodayaForm(event.target.closest('[data-form="sahodaya"]'));if(event.target.matches('[data-picker-class],[data-picker-section]'))syncHierarchicalStudentPicker(event.target.closest('[data-student-picker]'));if(event.target.id==='staff-parent-class'||event.target.id==='staff-parent-section'){const form=event.target.closest('[data-form="staff"]');if(event.target.id==='staff-parent-class'){const section=$('#staff-parent-section',form);section.innerHTML='<option value="">Choose section</option>'+selectOptions(sections);section.value='';}syncParentChildPicker(form);}});
  $('#theme-toggle').addEventListener('click',()=>applyTheme(state.theme==='dark'?'light':'dark'));
  $('#mobile-menu').addEventListener('click',toggleSidebar);
  $('#sidebar-close')?.addEventListener('click',()=>closeSidebar(true));
  $('#mobile-scrim').addEventListener('click',()=>closeSidebar(false));
  document.addEventListener('click',event=>{
    if(event.target.closest('#admin-nav-close')){closeSidebar(true);return;}
    const adminNav=$('#admin-section-nav'),target=event.target;
    if(document.body.dataset.page==='admin'&&sidebarIsMobile()&&adminNav?.classList.contains('open')&&!adminNav.contains(target)&&!$('#mobile-menu')?.contains(target))closeSidebar(false);
  });
  document.addEventListener('keydown',event=>{
    const nav=navigationForCurrentPage();
    const isDrawerOpen=sidebarIsMobile()&&!!nav?.classList.contains('open');
    if(event.key==='Escape'&&(isDrawerOpen||$('#sidebar')?.classList.contains('sidebar-pinned'))){event.preventDefault();closeSidebar(true);return;}
    if(event.key!=='Tab'||!isDrawerOpen)return;
    const focusable=[...nav.querySelectorAll('a[href],button:not([disabled]):not([hidden]),input:not([disabled]):not([hidden]),select:not([disabled]):not([hidden]),textarea:not([disabled]):not([hidden]),[tabindex]:not([tabindex="-1"])')].filter(node=>!node.closest('[hidden]')&&node.getClientRects().length);
    if(!focusable.length){event.preventDefault();nav.focus({preventScroll:true});return;}
    const first=focusable[0],last=focusable[focusable.length-1],active=document.activeElement;
    if(event.shiftKey&&(active===first||!nav.contains(active))){event.preventDefault();last.focus({preventScroll:true});}
    else if(!event.shiftKey&&(active===last||!nav.contains(active))){event.preventDefault();first.focus({preventScroll:true});}
  });
  window.addEventListener('resize',()=>{if(window.innerWidth>940)closeSidebar(false);},{passive:true});
  window.addEventListener('orientationchange',()=>{if(window.innerWidth>940)closeSidebar(false);},{passive:true});
  $('#user-menu').addEventListener('click',()=>toast('Account settings are not configured in this local workspace.','warning'));
  $('#main-nav').addEventListener('click',event=>{const button=event.target.closest('button[data-page]');if(button&&!button.hidden&&!button.closest('[hidden]'))navigate(button.dataset.page);});
  $('#global-search').addEventListener('keydown',event=>{if(event.key==='Enter'){const q=event.currentTarget.value.trim();if(!q)return;const target=state.role==='admin'?state.adminStudentBrowser:state.studentBrowser;target.classNo=null;target.section=null;target.q=q;navigate('students');}});
  function syncRouteFromLocation(){const hash=location.hash.replace(/^#/,'');if(hash.startsWith('programmes/')){state.programmeId=Number(hash.split('/')[1]);state.page='programme-detail';}else{state.programmeId=null;state.page=pageNames[hash]?hash:'dashboard';}if(!pageAllowed(state.page)){state.programmeId=null;state.page=fallbackPage();}if(state.page==='programme-detail'){const prog=programmeById(state.programmeId),linked=state.role==='parent'?currentLinkedStudent():null;if(!prog||((prog.archived||prog.status==='draft')&&!isAdmin())||(state.role==='parent'&&(!linked||prog.status==='draft'||!isEligible(linked,prog)))){state.programmeId=null;state.page=fallbackPage();}}}
  window.addEventListener('popstate',()=>{syncRouteFromLocation();render();});
  // Hash navigation is the fallback for browsers that do not permit pushState
  // on local file pages. Keep back/forward navigation working in that mode.
  window.addEventListener('hashchange',()=>{syncRouteFromLocation();render();});
  window.addEventListener('storage',event=>{
    if(event.key!==KEY||!event.newValue)return;
    try{const incoming=migrateDatabase(JSON.parse(event.newValue));validateBackupShape(incoming);db=incoming;if(Array.isArray(db.settings.classes)&&db.settings.classes.length)classes=db.settings.classes.map(Number).sort((a,b)=>a-b);if(Array.isArray(db.settings.sections)&&db.settings.sections.length)sections=db.settings.sections;render();toast('This portal was updated in another tab.','warning');}
    catch(err){console.warn('Ignored an invalid cross-tab data update:',err);toast('An invalid data update from another tab was ignored.','error');}
  });

  function init() {
    applyTheme(state.theme==='dark'?'dark':'light');
    if(location.hash){syncRouteFromLocation();}
    if(!pageAllowed(state.page))state.page=fallbackPage();
    render();
    updateStorageStatus();
    if(databaseRecoveryError)toast('Existing portal data could not be read. The original saved data has been preserved and edits are blocked. Restore a valid backup before continuing; do not replace this workspace with demo data.','error');
  }
  init();
})();
