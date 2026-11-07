'use client';
import HeaderUtilities from '@/components/HeaderUtilities';
import {calendarDisplayRange,calendarTickLabel} from '@/lib/calendar-display';
import {useState,useMemo,useEffect,useLayoutEffect} from 'react';
import {flushSync} from 'react-dom';
import {samplePeople,demoConstraints} from '@/lib/demo';
import {beginInviteCopy,type InviteCopy} from '@/lib/invite-clipboard';
import ManualAvailability from '@/components/ManualAvailability';
import {manualWindows} from '@/lib/manual-availability';
import AttendanceMethod from '@/components/AttendanceMethod';
import AttendanceComplete from '@/components/AttendanceComplete';
import CalendarPicker,{type CalendarChoice} from '@/components/CalendarPicker';
import AccountButton from '@/components/AccountButton';
import DatePicker from '@/components/DatePicker';
import AvailabilityWindow from '@/components/AvailabilityWindow';
import DeleteMeetingButton from '@/components/DeleteMeetingButton';
import PendingMeetings from '@/components/PendingMeetings';
import GravityClock from '@/components/GravityClock';
import InteractiveGrid from '@/components/InteractiveGrid';
import HeroEntrance from '@/components/HeroEntrance';
import MeetingDurationButtons from '@/components/MeetingDurationButtons';
import SharedAvailabilityPreview from '@/components/SharedAvailabilityPreview';
import {ArrowDown, ArrowUp, ArrowUpRight, ArrowRight, ChevronLeft, ChevronRight, Check, Copy, X, Sun, Moon, Monitor, Clock3, Globe2, CalendarDays} from 'lucide-react';
import {type Constraints,type Attendee,type Window,dates,shared,allowed,alternatives,hasFutureSharedSlot,localParts,validate} from '@/lib/availability';
const initial:Constraints={title:'',start:'2026-10-26',end:'2026-10-30',duration:30,zone:'America/Denver',from:'09:00',to:'17:00',days:[0,1,2,3,4,5,6]};
const zoneNames:Record<string,string>={'America/Denver':'Mountain Time (Denver)','America/Los_Angeles':'Pacific Time (Los Angeles)','America/Chicago':'Central Time (Chicago)','America/New_York':'Eastern Time (New York)','Europe/London':'United Kingdom (London)','Europe/Paris':'Central Europe (Paris)','Asia/Kolkata':'India (Kolkata)','Asia/Tokyo':'Japan (Tokyo)','Australia/Sydney':'Eastern Australia (Sydney)','UTC':'Coordinated Universal Time (UTC)'};
const zones=Object.keys(zoneNames);
const zoneLabel=(zone:string)=>zoneNames[zone]||zone.replaceAll('_',' ');
function dateLabel(s:string,opts:Intl.DateTimeFormatOptions={month:'short',day:'numeric'}){return new Date(s+'T12:00:00Z').toLocaleDateString('en-US',{...opts,timeZone:'UTC'})}
function timeLabel(t:number,z:string){return new Intl.DateTimeFormat('en-US',{timeZone:z,hour:'numeric',minute:'2-digit'}).format(t)}

function Google(){return <span className="google">G</span>}
export default function Home(){
 const [c,setC]=useState<Constraints>(initial),[view,setView]=useState<'home'|'create'|'results'|'docs'|'pending'>('home'),[opening,setOpening]=useState(false),[theme,setTheme]=useState<'system'|'light'|'dark'>('light'),[systemDark,setSystemDark]=useState(false),[demo,setDemo]=useState(false),[meeting,setMeeting]=useState(''),[loading,setLoading]=useState(false),[error,setError]=useState(''),[modal,setModal]=useState(false),[calendarPermission,setCalendarPermission]=useState(false),[copied,setCopied]=useState(false),[count,setCount]=useState(1),[adjustedDemo,setAdjustedDemo]=useState(false),[week,setWeek]=useState(0),[daysPerPage,setDaysPerPage]=useState(5),[mode,setMode]=useState('best'),[selected,setSelected]=useState<Window|null>(null),[notice,setNotice]=useState(''),[invitationName,setInvitationName]=useState('');
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),10000);return()=>clearTimeout(timer)},[notice]);
 useEffect(()=>{if(!error)return;const timer=setTimeout(()=>setError(''),10000);return()=>clearTimeout(timer)},[error]);
 const [attendanceComplete,setAttendanceComplete]=useState(false);
 const [manualOpen,setManualOpen]=useState(false);
 const [attendanceMethodOpen,setAttendanceMethodOpen]=useState(false);
 const [manualPreview,setManualPreview]=useState(false);
 const manualPreviewData=useMemo(()=>{if(!manualPreview)return undefined;const constraints={...demoConstraints(),title:'Project planning'};return {constraints,windows:manualWindows(constraints,samplePeople(constraints).slice(0,2)),revision:0}},[manualPreview]);
 useEffect(()=>{if(process.env.NODE_ENV==='development'&&new URLSearchParams(location.search).get('preview')==='manual-availability'){setManualPreview(true);setManualOpen(true)}},[]);
 useEffect(()=>{if(process.env.NODE_ENV==='development'&&new URLSearchParams(location.search).get('preview')==='attendance')setAttendanceComplete(true)},[]);
 const [backTarget,setBackTarget]=useState<'home'|'create'|'pending'>('pending');
 useEffect(()=>{const pop=()=>location.reload();window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop)},[]);
 useLayoutEffect(()=>{const params=new URLSearchParams(location.search);const id=params.get('meeting');if(id)setOpening(true);else{const page=params.get('view');if(page==='pending'||page==='docs')setView(page);if(page==='new')setView('create');if(page==='demo'){setDemo(true);setView('results');setBackTarget('home')}}},[]);
 useEffect(()=>{const params=new URLSearchParams(location.search);const id=params.get('meeting');if(id){let origin=params.get('from');try{origin=origin||sessionStorage.getItem('wharf-back:'+id);if(origin)sessionStorage.setItem('wharf-back:'+id,origin)}catch{}setBackTarget(origin==='create'?'create':'pending')}let invitation=params.get('invite');if(id){try{if(invitation)sessionStorage.setItem('wharf-invite:'+id,invitation);else invitation=sessionStorage.getItem('wharf-invite:'+id)}catch{}}if(id){setLoading(true);fetch('/api/requests/'+encodeURIComponent(id)+(invitation?'?invite='+encodeURIComponent(invitation):'')).then(r=>r.json()).then((d:any)=>{if(d.error)throw Error(d.error);setLive(d);setC(d.constraints);setInvitationName(d.invitationName||'');setMeeting(id);setView('results');fetch('/api/requests/'+encodeURIComponent(id)+'/activity',{method:'POST'}).catch(()=>{})}).catch(e=>{setError(e.message);setView('create')}).finally(()=>{setLoading(false);setOpening(false)})}else if(params.get('view')==='demo'){
  const example=demoConstraints();
  if(process.env.NODE_ENV==='development'&&params.get('preview')==='alternatives'){
   setC({...example,title:'Project planning',duration:120});setCount(4);setAdjustedDemo(true);
  }else setC(example);
 }else{const today=new Date();const start=new Date(today);start.setDate(start.getDate()+1);const end=new Date(start);end.setDate(end.getDate()+4);const iso=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;setC(v=>({...v,start:iso(start),end:iso(end)}));}},[]);
 useEffect(()=>{const media=window.matchMedia('(max-width:620px)');const sync=()=>{setDaysPerPage(media.matches?2:5);setWeek(0)};sync();media.addEventListener('change',sync);return()=>media.removeEventListener('change',sync)},[]);
 useLayoutEffect(()=>{window.scrollTo({top:0,left:0})},[view]);
 const dark=theme==='system'?systemDark:theme==='dark';
 useEffect(()=>{if(!selected)return;const clear=(event:PointerEvent)=>{if(!(event.target instanceof Element)||!event.target.closest('[data-meeting-slot], [data-meeting-selection]'))setSelected(null)};const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setSelected(null)};document.addEventListener('pointerdown',clear);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',clear);document.removeEventListener('keydown',escape)}},[selected]);
 useEffect(()=>{const media=window.matchMedia('(prefers-color-scheme: dark)');const sync=()=>setSystemDark(media.matches);sync();media.addEventListener('change',sync);try{const saved=localStorage.getItem('wharf-theme');if(saved==='system'||saved==='light'||saved==='dark')setTheme(saved)}catch{}return()=>media.removeEventListener('change',sync)},[]);
 function changeTheme(value:'system'|'light'|'dark'){setTheme(value);try{localStorage.setItem('wharf-theme',value)}catch{}}
 const [checkingAvailability,setCheckingAvailability]=useState(false);
 const [refreshError,setRefreshError]=useState('');
 const [hoveredAlternative,setHoveredAlternative]=useState<Window|null>(null);
 const [selectedRevision,setSelectedRevision]=useState<string|null>(null);
 const [live,setLive]=useState<{availabilityRefresh?:{checkedAt:string|null;error:string|null;refreshing:boolean}|null;attendees:{name:string;sample?:boolean}[];windows:Window[];bestWindows:Window[];joined:boolean;canEnterManual?:boolean;canRejoin?:boolean;canView:boolean;tracked?:boolean;canBookAlternative?:boolean;isPlanner:boolean;revision:string;finalTime:{start:number;end:number}|null;calendar?:{status:'created'|'pending';htmlLink:string|null;error:string|null}|null;delivery?:{total:number;pending:number;needsReview:number}}|null>(null);
 useEffect(() => {
  if (process.env.NODE_ENV !== 'development' ||
      new URLSearchParams(location.search).get('preview') !== 'manual-entry') return;
  setManualPreview(true);
  setDemo(false);
  setView('results');
  setC({...demoConstraints(), title: 'Project planning'});
  setLive({
   attendees: [], windows: [], bestWindows: [], joined: false,
   canEnterManual: true, canView: false, isPlanner: false,
   revision: 'preview', finalTime: null,
  });
 }, []);
 useEffect(()=>{
  if(!meeting||!live)return;
  const url=new URL(location.href);
  if(url.searchParams.get('calendar')!=='joined')return;
  // A successful callback alone is not enough: confirm the saved attendance first.
  if(live.joined&&!live.isPlanner&&!live.finalTime&&!demo&&!c.demo)setAttendanceComplete(true);
  url.searchParams.delete('calendar');history.replaceState({},'',url.pathname+url.search+url.hash);
 },[meeting,live,demo,c.demo]);
 useEffect(()=>{if(!meeting||demo)return;let active=true;const refresh=()=>fetch('/api/requests/'+meeting).then(r=>r.json()).then(d=>{if(active&&!d.error)setLive(d)}).catch(()=>{});refresh();const timer=setInterval(refresh,15000);window.addEventListener('focus',refresh);return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',refresh)}},[meeting,demo]);
 async function refreshAvailability(){
  if(!meeting||demo||c.demo||live?.finalTime)return;
  setCheckingAvailability(true);setRefreshError('');
  try{
   const response=await fetch('/api/requests/'+encodeURIComponent(meeting)+'/refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({force:true})});
   const status=await response.json();
   if(!response.ok)throw Error(status.error||'Could not check calendars. Last known availability is shown.');
   const updated=await fetch('/api/requests/'+encodeURIComponent(meeting)).then(r=>r.json());
   if(!updated.error)setLive(updated);
  }catch(error){setRefreshError((error as Error).message)}finally{setCheckingAvailability(false)}
 }
 useEffect(()=>{
  if(!meeting||demo||c.demo||!live?.isPlanner||live.finalTime)return;
  let active=true,inFlight=false;
  const check=async()=>{
   if(document.visibilityState!=='visible'||inFlight)return;
   inFlight=true;
   if(active)setCheckingAvailability(true);
   try{
    const response=await fetch('/api/requests/'+encodeURIComponent(meeting)+'/refresh',{method:'POST'});
    const status=await response.json();
    if(!response.ok)throw Error(status.error||'Could not check calendars. Last known availability is shown.');
    const updated=await fetch('/api/requests/'+encodeURIComponent(meeting)).then(r=>r.json());
    if(active){setRefreshError('');if(!updated.error)setLive(updated)}
   }catch(error){if(active)setRefreshError((error as Error).message)}finally{inFlight=false;if(active)setCheckingAvailability(false)}
  };
  void check();const timer=setInterval(check,120000);
  document.addEventListener('visibilitychange',check);
  return()=>{active=false;clearInterval(timer);document.removeEventListener('visibilitychange',check)};
 },[meeting,demo,c.demo,live?.isPlanner,!!live?.finalTime]);
 useEffect(()=>{const result=new URLSearchParams(location.search).get('signin');if(result)setNotice(({apple:'Signed in with Apple. Your iCloud calendar has not been connected.',cancelled:'Apple sign-in was cancelled.',expired:'Apple sign-in expired. Please try again.',unavailable:'Sign in with Apple is not available yet.',failed:'Could not complete Apple sign-in. Please try again.'} as Record<string,string>)[result]||'');},[]);
 useEffect(()=>{const result=new URLSearchParams(location.search).get('calendar');if(result)setNotice(({eventready:'Google Calendar invitations enabled. Select a time and create the meeting, or retry a pending invitation.',eventpermission:'Allow calendar event access to send Google Calendar invitations.',signedin:'You’re signed in.',accountswitch:'To use Google, sign out first and sign in with Google as a separate Wharf account. Existing meeting memberships stay with your current account.',connected:'Calendar connected.',joined:'Your availability has been added.',cancelled:'Calendar connection was cancelled.',permission:'Allow ongoing free/busy access to connect your calendar.',expired:'This sign-in expired. Please try again.',failed:'Could not read your calendar. Please try again and allow free/busy access.'} as Record<string,string>)[result]||'');},[]);
 useEffect(()=>{
  const id=new URLSearchParams(location.search).get('meeting');if(!id)return;
  try{const status=sessionStorage.getItem('wharf-copy:'+id);if(!status)return;sessionStorage.removeItem('wharf-copy:'+id);
   setCopied(status==='copied');setNotice(previous=>[previous,status==='copied'?'Invite link copied.':'Use Copy invite link to copy the invitation.'].filter(Boolean).join(' '));
   const timer=setTimeout(()=>setCopied(false),3000);return()=>clearTimeout(timer);
  }catch{}
 },[]);
 const people=useMemo(()=>demo?samplePeople(c).slice(0,count):(live?.attendees||[]).map(p=>({...p,busy:[]})),[demo,c,count,live]);
 const windows=useMemo(()=>demo?(view==='results'&&people.length?shared(c,people):[]):live?.windows||[],[c,people,view,demo,live]);
 const fits=windows.filter(w=>w.end-w.start>=c.duration*60000);
 const hasSharedTime=hasFutureSharedSlot(windows,c.duration);
 const best=useMemo(()=>demo?(view==='results'&&people.length&&!hasSharedTime?alternatives(c,people):[]):live?.bestWindows||[],[c,people,view,hasSharedTime,demo,live]);
 const bestAttendance=best.reduce((max,w)=>Math.max(max,w.people.length),0);
 const showAlternatives=!hasSharedTime&&mode==='best';
 const inspectedAlternative=showAlternatives?(hoveredAlternative||(selected?.conflicts?.length?selected:null)):null;
 useEffect(()=>{setHoveredAlternative(null)},[view,meeting,week,daysPerPage,showAlternatives,count,live?.revision]);
 const selectedAlternative=!!selected?.conflicts?.length;
 const longest=windows.length?Math.max(...windows.map(w=>w.end-w.start)):0;
 const visibleWindows=showAlternatives?best:fits.length?fits:windows.filter(w=>w.end-w.start===longest);
 const allDates=useMemo(()=>dates(c),[c]);const shownDates=allDates.slice(week*daysPerPage,(week+1)*daysPerPage);
 const update=(key:keyof Constraints,value:any)=>{setC(v=>({...v,[key]:value}));setError('')};
 function navigate(change:()=>void){
  if(!document.startViewTransition||window.matchMedia('(prefers-reduced-motion: reduce)').matches){change();return}
  document.startViewTransition(()=>flushSync(change));
 }
 function resetState(){setAttendanceComplete(false);setManualOpen(false);setManualPreview(false);setCalendarPermission(false);setInvitationName('');setC(v=>({...v,demo:false,days:[0,1,2,3,4,5,6]}));setView('create');setDemo(false);setMeeting('');setLive(null);setError('');setSelected(null);setWeek(0);}
 function reset(){navigate(()=>{resetState();history.pushState({},'','/?view=new')})}
 function goHome(){navigate(()=>{resetState();setView('home');history.pushState({},'','/')})}
 function showPending(){navigate(()=>{setView('pending');setError('');setSelected(null);history.pushState({},'','/?view=pending')})}
 function showDocs(){navigate(()=>{setView('docs');history.pushState({},'','/?view=docs')})}
 function goBack(){if(backTarget==='pending')navigate(()=>{setDemo(false);setMeeting('');setLive(null);setSelected(null);setError('');setView('pending');history.replaceState({},'','/?view=pending')});else if(backTarget==='home')goHome();else reset();}
 function showDemo(){const from=view==='home'?'home':'create';navigate(()=>{setC(demoConstraints(c.zone));setLive(null);setMeeting('');setMode('best');setBackTarget(from);history.pushState({},'','/?view=demo');setDemo(true);setView('results');setCount(1);setAdjustedDemo(false);setWeek(0);setSelected(null);setError('')})}
 async function create(connect=false,pendingCopy?:InviteCopy,provider:CalendarChoice|'saved'='saved'){
  let invitationCopy=pendingCopy;
  try{
   validate(c);if(connect&&!invitationCopy)invitationCopy=beginInviteCopy();
   setLoading(true);setError('');setCopied(false);
   const r=await fetch('/api/requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...c,demo:demo&&connect,sampleCount:count,...(demo&&connect?{title:'lucid demo'}:{})})});
   const d:any=await r.json();if(!r.ok)throw Error(d.error||'Could not save this meeting.');
   setC(v=>({...v,demo:demo&&connect,...(demo&&connect?{title:'lucid demo'}:{})}));setBackTarget('create');
   try{sessionStorage.setItem('wharf-back:'+d.id,'create')}catch{}
   setMeeting(d.id);setDemo(false);setView('results');setWeek(0);setLive(null);history.pushState({},'',`/?meeting=${d.id}`);
   if(invitationCopy){
    invitationCopy.resolve(`${location.origin}/?meeting=${encodeURIComponent(d.id)}`);
    const success=await invitationCopy.result;
    setCopied(success);setNotice(success?'Invite link copied.':'Meeting created. Use Copy invite link to copy the invitation.');
    try{sessionStorage.setItem('wharf-copy:'+d.id,success?'copied':'failed')}catch{}
   }
   if(connect)await connectCalendar(d.id,provider);
  }catch(e){invitationCopy?.cancel();setError((e as Error).message);if(connect)throw e}finally{setLoading(false)}
 }
 async function attend(useCalendar=false){
  if(manualPreview){if(useCalendar)setModal(true);else setAttendanceMethodOpen(true);return}
  let invitationCopy:InviteCopy|undefined;
  setLoading(true);
  try{
   if(!meeting||demo){validate(c);invitationCopy=beginInviteCopy()}
   const r=await fetch('/api/auth/account');const d=await r.json();if(!r.ok)throw Error(d.error);
   if(d.user?.calendarConnected){if(meeting&&!demo)await connectCalendar();else await create(true,invitationCopy)}
   else{invitationCopy?.cancel();if(!useCalendar&&live?.canEnterManual)setAttendanceMethodOpen(true);else setModal(true)}
  }catch(e){invitationCopy?.cancel();setError((e as Error).message);setModal(true)}finally{setLoading(false)}
 }
 function invitationFor(id:string){const query=new URLSearchParams(location.search).get("invite");try{return query||sessionStorage.getItem("wharf-invite:"+id)}catch{return query}}
 async function connectCalendar(id=meeting,provider:CalendarChoice|'saved'='saved'){
  setLoading(true);setError('');
  try{const r=await fetch('/api/auth/calendar/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider,meetingId:id,invitationToken:invitationFor(id)})});const d=await r.json();if(!r.ok)throw Error(d.error);location.assign(d.joined?`/?meeting=${encodeURIComponent(id)}&calendar=joined`:d.url)}finally{setLoading(false)}
 }
 async function chooseCalendar(provider:CalendarChoice){if(manualPreview){setModal(false);setNotice('This preview lets you try entering times manually.');return}if(meeting&&!demo)await connectCalendar(meeting,provider);else await create(true,undefined,provider)}

 async function leave(){setLoading(true);try{const r=await fetch('/api/requests/'+meeting+'/leave',{method:'POST'});if(!r.ok)throw Error('Could not remove availability.');const d=await fetch('/api/requests/'+meeting).then(r=>r.json());setLive(d);setSelected(null)}catch(e){setError((e as Error).message)}finally{setLoading(false)}}
 async function enableCalendarInvitations(){
  setLoading(true);setError('');
  try{const r=await fetch('/api/auth/google/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({meetingId:meeting})});const d=await r.json();if(!r.ok)throw Error(d.error);location.assign(d.url)}catch(e){setError((e as Error).message);setLoading(false)}
 }
 async function sendRemaining(){
  setLoading(true);setError('');
  try{let previous=Infinity;
   while(true){const r=await fetch('/api/requests/'+meeting+'/invitations',{method:'POST'});const d=await r.json();if(d.code==='GOOGLE_CALENDAR_PERMISSION_REQUIRED'){setCalendarPermission(true);break}if(!r.ok)throw Error(d.error);if(d.calendar){setNotice(d.calendar.status==='created'?'Google Calendar invitations sent.':'Google Calendar is still pending. You can safely retry.');break}if(d.pending<=d.needsReview||d.pending>=previous)break;previous=d.pending;}
   const d=await fetch('/api/requests/'+meeting).then(r=>r.json());if(!d.error)setLive(d);
  }catch(e){setError((e as Error).message)}finally{setLoading(false)}
 }
 async function finalize(){
  if(!selected||!live)return;
  if(selectedAlternative){
   if(selectedRevision!==live.revision){setError('Availability changed. Your previous selection is shown below; select an updated time to continue.');return}
   const conflicts=selected.conflicts!.join(', ');
   if(!window.confirm(`This time conflicts with ${conflicts}. Schedule anyway? Everyone who joined will still get an invitation.`))return;
  }
  setLoading(true);setError('');
  try{
   const r=await fetch('/api/requests/'+meeting+'/finalize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({start:selected.start,end:selected.end,revision:selectedAlternative?selectedRevision:live.revision,acceptConflicts:selectedAlternative})});
   const d=await r.json();
   if(d.code==='GOOGLE_CALENDAR_PERMISSION_REQUIRED'){setCalendarPermission(true);return}
   if(r.ok&&d.delivery)while(d.delivery.pending>d.delivery.needsReview){
    const next=await fetch('/api/requests/'+meeting+'/invitations',{method:'POST'});const status=await next.json();
    if(!next.ok)break;
    const previous=d.delivery.pending;d.delivery=status;
    if(status.pending>=previous)break;
   }
   const refreshed=await fetch('/api/requests/'+meeting).then(r=>r.json());if(!refreshed.error)setLive(refreshed);
   if(!r.ok)throw Error(d.error||'Could not create meeting.');
   setSelected(null);setNotice(d.calendar?(d.calendar.status==='created'?'Created in Google Calendar. Invitations sent to your guests.':'Time saved. Google Calendar creation is pending; retry from the meeting page.'):d.delivery.needsReview?'Meeting created. Some invitations need delivery review.':d.delivery.pending?'Meeting created. Some invitations are still pending.':'Meeting created. Invitations sent.');
  }catch(e){setError((e as Error).message)}finally{setLoading(false)}
 }
 async function copy(){try{await navigator.clipboard.writeText(`${location.origin}/?meeting=${meeting}`);setCopied(true);setTimeout(()=>setCopied(false),1800)}catch{setNotice('Copy the invitation URL from your address bar.')}}
 const {startMinute,endMinute,ticks}=calendarDisplayRange(c,shownDates);
 return <div className={dark?'app':'app light'}>
 <header className="site-header"><div className="header-left"><button className="brand" onClick={goHome} aria-label="Wharf home"><span className="brandmark" aria-hidden="true">⚓️</span>Wharf</button><nav><button className={view==='create'||view==='results'?'active':''} onClick={reset}>Scheduler</button><button className={view==='pending'?'active':''} aria-current={view==='pending'?'page':undefined} onClick={showPending}>Pending meetings</button></nav></div><nav aria-label="Utilities"><HeaderUtilities onDocs={showDocs} active={view==='docs'}/><span className="nav-divider"/><button type="button" className="icon-button" aria-label={`Appearance: ${theme}. Switch to ${theme==='light'?'dark':theme==='dark'?'system':'light'} mode`} onClick={()=>changeTheme(theme==='light'?'dark':theme==='dark'?'system':'light')}>{theme==='light'?<Sun size={16}/>:theme==='dark'?<Moon size={16}/>:<Monitor size={16}/>}</button><AccountButton navigationKey={`${view}:${meeting}`}/></nav></header>
 <main className={view==='home'||view==='create'?'framed':undefined}>{!opening&&<div key={view} className="view">
 {view==='pending'&&<PendingMeetings onCreate={reset}/>}
 {view==='home'&&<HeroEntrance><InteractiveGrid/><GravityClock/><h1 id="hero-title">Find a time that works for everyone</h1><p>Wharf compares each person’s calendar availability and shows when you can all meet.</p><div className="hero-actions"><button type="button" className="primary pill" onClick={reset}>Create a meeting</button><button type="button" className="outline pill" onClick={showDemo}>View example</button></div></HeroEntrance>}
 {view==='create'&&<>
 <div className="setup-grid meeting-setup"><section className="setup" aria-labelledby="new-meeting-title">
 <h2 id="new-meeting-title" className="cell-title">New meeting</h2>
 <form onSubmit={e=>{e.preventDefault();create()}}>
 <label className="field meeting-name-field">Meeting name<input id="meeting-name" value={c.title} maxLength={100} onChange={e=>update('title',e.target.value)} placeholder="Team sync, study group, etc."/></label>
 <div className="field"><label className="sr-only" htmlFor="meeting-dates">Meeting dates</label><DatePicker shortcutZone={c.zone} start={c.start} end={c.end} onChange={(start,end)=>{setC(v=>({...v,start,end}));setError('')}}/></div>
 <MeetingDurationButtons value={c.duration} onChange={value=>update('duration',value)}/>
 <div className="field"><label>Between these hours</label><div className="hours"><input aria-label="Earliest time" type="time" required value={c.from} onChange={e=>update('from',e.target.value)}/><span>and</span><input aria-label="Latest time" type="time" required value={c.to} onChange={e=>update('to',e.target.value)}/></div></div>
 <label className="field meeting-zone"><span className="sr-only">Time zone</span><div className="select-wrap"><Globe2 size={15}/><select value={c.zone} onPointerDown={e=>{e.currentTarget.dataset.focusMode='pointer'}} onKeyDown={e=>{e.currentTarget.dataset.focusMode='keyboard'}} onBlur={e=>{delete e.currentTarget.dataset.focusMode}} onChange={e=>update('zone',e.target.value)}>{zones.map(z=><option key={z} value={z}>{zoneLabel(z)}</option>)}</select></div></label>
 <div className="form-bottom"><button type="button" className="google-button" disabled={loading} onClick={()=>attend()}><CalendarDays size={18}/> {loading?'Creating…':'Create meeting'} <ArrowRight size={16}/></button><button type="submit" className="text-button" disabled={loading}>{loading?'Creating…':'Create a link without joining'} <ArrowUpRight size={13}/></button><p className="micro">Meeting details are fixed once the link is created.</p></div>
 </form></section>
 <aside className="preview-aside"><SharedAvailabilityPreview refined/></aside></div></>}
 {view==='results'&&<><div className="back-row"><button className="text-button" onClick={goBack}><ChevronLeft size={13}/> {backTarget==='pending'?'Pending meetings':backTarget==='home'?'Home':'New meeting'}</button>{(demo||c.demo)&&<span className="small-tag">{demo?'Sample calendars':live?.joined?'Your calendar + sample calendars':'Sample calendars'}</span>}</div><section className="result-intro"><div><h1>{demo?'lucid demo':c.title||'Untitled meeting'}</h1><div className="meta"><span><Clock3 size={14}/>{c.duration} minutes</span><span><CalendarDays size={14}/>{dateLabel(c.start)}{c.start!==c.end&&<> – {dateLabel(c.end)}</>}</span><span><Globe2 size={14}/>{zoneLabel(c.zone)}</span></div></div><div className="meeting-header-actions">{!demo&&!c.demo&&!live?.tracked&&<button className="primary" onClick={copy}>{copied?<Check size={15}/>:<Copy size={15}/>} {copied?'Copied':'Copy invite link'}</button>}{!demo&&live?.isPlanner&&<DeleteMeetingButton id={meeting} title={c.title} onDeleted={()=>{resetState();showPending();setNotice('Meeting deleted.')}}/>}</div></section>
 {live?.finalTime&&!demo&&<div className="selection meeting-confirmation" role="status"><div><strong>{live.tracked?'Time confirmed':'Meeting created'}</strong><p>{new Intl.DateTimeFormat('en-US',{timeZone:c.zone,dateStyle:'full'}).format(live.finalTime.start)} · {timeLabel(live.finalTime.start,c.zone)} – {timeLabel(live.finalTime.end,c.zone)}</p><p>{live.calendar?(live.calendar.status==='created'?'Created in Google Calendar. Guests receive an invitation; their settings determine when it appears.':'Google Calendar creation is pending. Retry to finish sending invitations.'):live.tracked?'Confirmed in Wharf. No calendar invitation has been sent.':live.delivery?.needsReview?'Some invitations need delivery review.':live.delivery?.pending?'Some invitations are still pending.':live.delivery?.total?'Calendar invitations have been sent to all attendees.':'This time is confirmed in Wharf.'}</p>{live.calendar?.htmlLink&&<p><a className="outline" href={live.calendar.htmlLink} target="_blank" rel="noreferrer">Open in Google Calendar <ArrowUpRight size={14}/></a></p>}{live.calendar?.status==='pending'&&live.isPlanner&&<><p>{live.calendar.error}</p><button className="primary" disabled={loading} onClick={sendRemaining}>{loading?'Checking…':'Retry Google Calendar invitations'}</button></>}{live.isPlanner&&live.delivery&&live.delivery.pending>live.delivery.needsReview&&<button className="primary" disabled={loading} onClick={sendRemaining}>{loading?'Sending…':'Send remaining invitations'}</button>}</div></div>}
 {!demo&&!c.demo&&live?.canView&&!live.finalTime&&<div className="availability-refresh-status" data-meeting-selection="true" role="status">
  <span>{checkingAvailability||live.availabilityRefresh?.refreshing?'Checking calendars…':live.availabilityRefresh?.checkedAt?'Calendars checked at '+new Date(live.availabilityRefresh.checkedAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'Showing saved availability'}</span>
  {live.isPlanner&&<button type="button" className="text-button" disabled={checkingAvailability||loading||live.availabilityRefresh?.refreshing} onClick={()=>void refreshAvailability()}>Refresh</button>}
  {(refreshError||live.availabilityRefresh?.error)&&<p>{refreshError||live.availabilityRefresh?.error}</p>}
 </div>}
 <div className="result-grid"><section className="availability" aria-label="Shared availability">{(!people.length||!hasSharedTime||allDates.length>daysPerPage)&&<div className="result-toolbar">
 {people.length>0&&!hasSharedTime&&<div className="tabs" role="group" aria-label="Calendar view">
  <button type="button" className={!showAlternatives?'chosen':''} aria-pressed={!showAlternatives} onClick={()=>{setMode('everyone');setSelected(null)}}>Everyone available</button>
  <button type="button" className={showAlternatives?'chosen':''} aria-pressed={showAlternatives} onClick={()=>{setMode('best');setSelected(null)}}>Best alternatives</button>
 </div>}{!people.length&&<h2>{!demo&&live&&!live.canView?'Join to see shared availability':'Waiting for the first calendar'}</h2>}{allDates.length>daysPerPage&&<div className="week-nav"><button className="icon-button" aria-label="Previous days" disabled={week===0} onClick={()=>setWeek(week-1)}><ChevronLeft size={17}/></button><span>{shownDates.length?dateLabel(shownDates[0]):''}</span><button className="icon-button" aria-label="Next days" disabled={(week+1)*daysPerPage>=allDates.length} onClick={()=>setWeek(week+1)}><ChevronRight size={17}/></button></div>}</div>}
 {people.length>0&&!hasSharedTime&&<p className="availability-note">{showAlternatives
  ?best.length?'Deeper blue means more people can attend. Hover for details, or tap to select.':'No future start times fit any attendee.'
  :`No shared window fits ${c.duration} minutes. Try Best alternatives to see who can attend.`}</p>}
 <div className="calendar-scroll"><div className="calendar"><div className="cal-head"><span className="tz">Local</span>{shownDates.map(d=><div key={d}><span>{dateLabel(d,{weekday:'short'})}</span><strong>{dateLabel(d,{day:'numeric'})}</strong></div>)}</div><div className="cal-body"><div className="cal-times">{ticks.map(m=><span key={m} style={{top:(m-startMinute)/(endMinute-startMinute)*100+'%'}}>{calendarTickLabel(m)}</span>)}</div>{shownDates.map(d=><div className={'cal-day '+(!c.days.includes(new Date(d+'T12:00Z').getUTCDay())?'off':'')} key={d}>{ticks.map(m=><div className="hour-line" key={m} style={{top:(m-startMinute)/(endMinute-startMinute)*100+'%'}}/>)}{visibleWindows.filter(w=>w.date===d).map((w,i)=>{const from=startMinute,to=endMinute;const parts=localParts(w.start,c.zone).time;const start=Number(parts.slice(0,2))*60+Number(parts.slice(3));return <AvailabilityWindow key={`${w.start}-${w.end}-${w.people.join(',')}`} window={w} bestMatch={showAlternatives&&w.people.length===bestAttendance} duration={c.duration} zone={c.zone} selected={selected} onPreview={setHoveredAlternative} onSelect={slot=>{setSelected(slot);setSelectedRevision(live?.revision??null)}} style={{top:(start-from)/(to-from)*100+'%',height:(w.end-w.start-(w.conflicts?.length?(c.duration-15)*60000:0))/60000/(to-from)*100+'%'}}/>})}</div>)}{!people.length&&<div className="empty-cal"><CalendarDays size={25}/><button className="primary" onClick={()=>attend()}>{live?.canRejoin?'Rejoin meeting':"I’m attending"}</button></div>}</div></div></div><div className="calendar-footer">{showAlternatives&&best.length>0?<><span><i/> More attendees available with deeper shading</span></>:<span><i/> Available</span>}</div>
</section>
 <aside className={`attendee-panel${demo?' demo-panel':''}`}>{selected&&<div className="selection booking-selection" data-meeting-selection="true"><div><strong>{dateLabel(selected.date,{weekday:'long',month:'short',day:'numeric'})} · {timeLabel(selected.start,c.zone)} – {timeLabel(selected.end,c.zone)}</strong>{selectedRevision!==live?.revision&&!demo&&<p role="status">Availability changed. This was your previous selection; choose an updated time below.</p>}{selected.conflicts?.length?<><p><b>{selected.people.length} of {selected.people.length+selected.conflicts!.length} available</b></p><p>{selected.people.join(', ')} can attend.</p><p className="slot-conflicts"><b>Conflicts with:</b> {selected.conflicts!.join(', ')}</p></>:<p>{selected.people.join(', ')} can attend.</p>}{!demo&&!c.demo&&live?.isPlanner&&!live.tracked&&!live.finalTime&&<><button className="primary full" disabled={loading||selectedRevision!==live.revision||!live.joined||selected.end-selected.start!==c.duration*60000||selected.start<=Date.now()||(selectedAlternative?(!live.canBookAlternative||hasSharedTime):!fits.some(w=>selected.start>=w.start&&selected.end<=w.end))} onClick={finalize}>{loading?'Creating…':'Create meeting'}</button><p className="micro">{selectedAlternative&&!live.canBookAlternative?'This meeting requires a shared time to book.':live.joined?'Confirms the time and sends calendar invitations to everyone who joined.':"Choose I’m attending first to include your calendar and invitation."}</p></>}</div><button className="icon-button" aria-label="Close selected window" onClick={()=>setSelected(null)}><X size={16}/></button></div>}<div className="section-title"><span>Attendees</span><span>{String(people.length).padStart(2,'0')}</span></div>{people.map((person,index)=>{
  const available=inspectedAlternative?.people.includes(person.name);
  const unavailable=inspectedAlternative?.conflicts?.includes(person.name);
  const status=available===unavailable?null:unavailable?'Can’t attend':'Available';
  return <div className="person" key={`${person.name}-${index}`}>
   <div className="avatar">{person.name.split(' ').map(part=>part[0]).join('')}</div>
   <div>{person.name}{person.sample&&<small>Sample calendar</small>}</div>
   {inspectedAlternative?<span className="attendee-slot-status" data-unavailable={unavailable&&!!status}>{status}</span>:<Check size={14}/>}
  </div>;
 })}{demo?<><div className="demo-controls"><label htmlFor="responses">Sample attendees <span>{count} / 4</span></label><input id="responses" type="range" min="1" max="4" step="1" aria-describedby="demo-slider-hint" value={count} onInput={e=>{setCount(Number(e.currentTarget.value));setAdjustedDemo(true);setSelected(null)}} onChange={e=>{setCount(Number(e.target.value));setAdjustedDemo(true);setSelected(null)}}/><div className="demo-slider-numbers" aria-hidden="true">{[1,2,3,4].map(n=><span key={n} className={count===n?'active':''}>{n}</span>)}</div><p id="demo-slider-hint" aria-live="polite" className={`demo-slider-hint${!adjustedDemo||count===4?' is-pulsing':''}${count===4?' try-own-schedule':''}`}><span className="demo-hint-copy demo-hint-slide" aria-hidden={count===4}><ArrowUp size={24} strokeWidth={2.5} aria-hidden="true"/>Slide to try more people</span><span className="demo-hint-copy demo-hint-own" aria-hidden={count!==4}><ArrowDown size={24} strokeWidth={2.5} aria-hidden="true"/>Now try with your own schedule</span></p></div><button className="primary full" disabled={loading} onClick={()=>attend()}>Try my calendar</button><p className="micro">Compare your availability with these sample calendars.</p><button className="outline full" onClick={reset}>Create meeting <ArrowRight size={14}/></button></>:live?.finalTime&&!live.tracked?<p className="micro">This meeting’s time is confirmed.</p>:live?.joined?<button disabled={loading} className="outline full" onClick={leave}>Remove my availability</button>:<button disabled={loading} className="outline full" onClick={()=>attend()}>{live?.canRejoin?'Rejoin meeting':"I’m attending"}</button>}
 {!demo&&<p className="micro">Availability is saved when each person joins and does not update automatically.</p>}</aside></div></>}
 {view==='docs'&&<section className="docs"><h1>API for agents</h1><p>Create a meeting link for any group chat in one request. No signup or API key registration required.</p><div className="api-block"><a href="/api/openapi" target="_blank" rel="noreferrer" className="small-tag">OpenAPI spec ↗</a><p>POST /api/v1/meeting-links</p><pre>{`Content-Type: application/json
Idempotency-Key: <your saved random UUID v4>

${JSON.stringify({startDate:c.start,timezone:c.zone},null,2)}`}</pre></div><div className="docs-note"><h2>Share one link</h2><p>Use the date and timezone from your conversation. The response includes invitationUrl and a ready-to-send shareMessage. Share the link with your group so everyone can connect their calendar. The first person to connect becomes the planner, who chooses a time and sends invitations on Wharf.</p><h2>Safe retries</h2><p>Generate and save a random UUID once, keep it private, and reuse it as Idempotency-Key with the same body after a timeout. Defaults are 30 minutes, 9 AM to 5 PM, on the selected date. Links expire after 30 days.</p><p><a href="/agents">Full agent quickstart ↗</a> · <a href="/llms.txt">Plain-text guide ↗</a> · <a href="/api/agent">Discovery JSON ↗</a></p></div><button className="outline" onClick={reset}>Back to scheduler <ArrowRight size={14}/></button></section>}
 </div>}
 {error&&<div role="alert" className="error">{error}<button aria-label="Dismiss error" onClick={()=>setError('')}><X size={14}/></button></div>}{notice&&<div role="status" className="error">{notice}<button aria-label="Dismiss" onClick={()=>setNotice('')}><X size={14}/></button></div>}
 </main><footer><a href="/agents">For agents</a><a href="/privacy">Privacy</a></footer>
 {attendanceComplete&&<AttendanceComplete onClose={()=>setAttendanceComplete(false)}/>}
 {calendarPermission&&<div className="modal-backdrop" onClick={()=>!loading&&setCalendarPermission(false)}><section role="dialog" aria-modal="true" aria-labelledby="calendar-permission-title" className="modal" onClick={e=>e.stopPropagation()}><button className="modal-close icon-button" aria-label="Close calendar permission" disabled={loading} onClick={()=>setCalendarPermission(false)}><X size={18}/></button><Google/><h2 id="calendar-permission-title">Send Google Calendar invites</h2><p>Allow Wharf to create the meeting on your primary Google Calendar and invite everyone who joined.</p><p>Google asks for access to events on calendars you own. Wharf uses it to create and check meetings you confirm here. Guests keep control of their RSVP and invitation settings.</p>{error&&<p role="alert">{error}</p>}<button autoFocus className="primary full" disabled={loading} onClick={enableCalendarInvitations}>Allow Google Calendar invites <ArrowRight size={15}/></button></section></div>}
 {attendanceMethodOpen&&<AttendanceMethod
  onClose={()=>setAttendanceMethodOpen(false)}
  onCalendar={()=>{setAttendanceMethodOpen(false);void attend(true)}}
  onManual={()=>{setAttendanceMethodOpen(false);setManualOpen(true)}}
 />}
 {manualOpen&&<ManualAvailability meetingId={meeting} preview={manualPreviewData} onClose={()=>setManualOpen(false)} onSaved={()=>{setManualOpen(false);if(manualPreview){setAttendanceComplete(true);return}const url=new URL(location.href);url.searchParams.set('calendar','joined');location.assign(url.toString())}}/>}
 {modal&&<CalendarPicker organizer={!demo&&!manualPreview&&(view==='create'||!!live?.isPlanner)} onClose={()=>setModal(false)} onConnect={chooseCalendar} invitationName={invitationName} onManual={live?.canEnterManual?()=>{setModal(false);setManualOpen(true)}:undefined}/>}
 </div>
}
