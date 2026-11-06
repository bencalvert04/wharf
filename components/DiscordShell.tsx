'use client';
import {useState,useRef,useEffect,type ReactNode,type RefObject,type FormEvent} from 'react';
import {Bell,ChevronDown,ChevronRight,Hash,Headphones,HelpCircle,Inbox,Mic,MicOff,Pin,Plus,Search,Settings,Smile,Users,Volume2,PhoneOff,Signal,Compass,Download,Command,X} from 'lucide-react';
import shared from '@/app/slack/slack.module.css';
import s from './DiscordShell.module.css';
const people=[{name:'Maya Chen',color:'#a78bfa',initial:'M',status:'Working on the prototype'}, {name:'Jon Park',color:'#62c4a9',initial:'J',status:'Figma'}, {name:'Priya Shah',color:'#eaa578',initial:'P',status:''}, {name:'Sam Rivera',color:'#7db4f0',initial:'S',status:'Away'}, {name:'Wharf',color:'#6baaaa',initial:'⚓',status:'Scheduling made simple',bot:true}];
function DiscordMark(){return <svg width="25" height="20" viewBox="0 0 28 22" fill="currentColor" aria-hidden="true"><path d="M23.5 2.1A22 22 0 0 0 18.2.5l-.7 1.4a20 20 0 0 0-7 0L9.8.5a22 22 0 0 0-5.3 1.6C1.1 7 .2 11.8.7 16.5a22 22 0 0 0 6.6 3.3l1.4-2.2-2-1a16 16 0 0 0 14.6 0l-2 1 1.4 2.2a22 22 0 0 0 6.6-3.3c.6-5.5-1-10.2-3.8-14.4ZM9.4 13.5c-1.4 0-2.4-1.3-2.4-2.8s1-2.8 2.4-2.8 2.5 1.3 2.5 2.8-1.1 2.8-2.5 2.8Zm9.2 0c-1.4 0-2.5-1.3-2.5-2.8s1.1-2.8 2.5-2.8 2.4 1.3 2.4 2.8-1 2.8-2.4 2.8Z"/></svg>}
type Props={active:string;channels:{id:string;topic:string}[];open:(id:string)=>void;draft:string;setDraft:(value:string)=>void;submit:(event:FormEvent)=>void;busy:boolean;typing:boolean;scroller:RefObject<HTMLDivElement|null>;children:ReactNode};
export default function DiscordShell({active,channels,open,draft,setDraft,submit,busy,typing,scroller,children}:Props){
 const [members,setMembers]=useState(true),[collapsed,setCollapsed]=useState(false),[muted,setMuted]=useState(false),[deafened,setDeafened]=useState(false),[voice,setVoice]=useState(''),[search,setSearch]=useState(''),[panel,setPanel]=useState(''),[profile,setProfile]=useState(''),[command,setCommand]=useState(false);
 const app=active==='wharf';
 const inputRef=useRef<HTMLInputElement>(null);
 useEffect(()=>{if(!search&&scroller.current)scroller.current.scrollTop=scroller.current.scrollHeight},[search,scroller]);
 const icon=(label:string,Icon:typeof Users,onClick:()=>void,pressed?:boolean)=><button type="button" title={label} aria-label={label} aria-pressed={pressed} onClick={onClick}><Icon size={19}/></button>;
 const chooseCommand=()=>{setDraft('/wharf request: ');setCommand(false);inputRef.current?.focus()};
 return <div className={`${shared.slack} ${shared.discord} ${s.window}`} role="region" aria-label="Interactive Wharf for Discord demo" onKeyDown={e=>{if(e.key==='Escape'){setPanel('');setProfile('');setCommand(false);if(draft==='/')setDraft('')}}}>
  <div className={s.titlebar}><span><DiscordMark/> Discord</span><strong>Northwind</strong><div><Inbox size={16}/><HelpCircle size={16}/></div></div>
  <div className={s.layout}>
   <nav className={s.servers} aria-label="Demo servers">
    <button title="Direct messages" aria-label="Direct messages" onClick={()=>{open('wharf');setPanel('')}}><DiscordMark/></button><div className={s.separator}/>
    <button className={!app?s.selectedServer:''} aria-label="Northwind server" title="Northwind" onClick={()=>open('design-sync')}>N</button>
    <button className={s.addServer} title="Add a server" aria-label="Add a server" onClick={()=>setPanel('This preview takes place in Northwind. Try a scheduling request in any text channel.')}><Plus size={24}/></button>
    <button className={s.addServer} title="Discover" aria-label="Discover servers" onClick={()=>setPanel('You’re exploring the Northwind demo server. Your real Discord servers are not connected.')}><Compass size={23}/></button>
    <div className={s.separator}/><span title="Discord desktop"><Download size={21}/></span>
   </nav>
   <aside className={s.sidebar}>
    <button className={s.serverName} onClick={()=>setPanel(panel?'':'Northwind · Demo server\nChoose a text channel, type /wharf, and try scheduling with the team.')}>Northwind <ChevronDown size={17}/></button>
    <div className={s.channelList}>
     <button className={s.browse} onClick={()=>setCollapsed(false)}><Users size={19}/> Channels & Roles</button>
     <button className={s.browse} onClick={()=>setPanel('No upcoming server events. Book a meeting with Wharf to see how scheduling works.')}><CalendarIcon/> Events</button>
     <button className={s.category} onClick={()=>setCollapsed(!collapsed)} aria-expanded={!collapsed}>{collapsed?<ChevronRight size={12}/>:<ChevronDown size={12}/>} TEXT CHANNELS</button>
     {!collapsed&&channels.map(c=><button key={c.id} className={`${s.channelLink} ${active===c.id?s.active:''}`} aria-current={active===c.id?'page':undefined} onClick={()=>{open(c.id);setSearch('')}}><Hash size={21}/><span>{c.id}</span>{c.id==='design-sync'&&<Users size={14}/>}</button>)}
     <p className={s.category}><ChevronDown size={12}/> VOICE CHANNELS</p>
     {['Lounge','Meeting room'].map(name=><div key={name}><button className={`${s.channelLink} ${voice===name?s.voiceActive:''}`} onClick={()=>setVoice(voice===name?'':name)}><Volume2 size={20}/><span>{name}</span></button>{voice===name&&<p className={s.voicePerson}><span className={s.miniAvatar}>Y</span> You {muted&&<MicOff size={12}/>}</p>}</div>)}
    </div>
    <div className={s.userArea}>
     {voice&&<div className={s.voiceStatus}><Signal size={16}/><div><strong>Voice connected</strong><small>{voice} / Northwind · Demo</small></div><button aria-label="Disconnect voice" onClick={()=>setVoice('')}><PhoneOff size={17}/></button></div>}
     <div className={s.userBar}><button className={s.self} onClick={()=>setProfile(profile?'':'You')}><span className={s.selfAvatar}>Y<i/></span><span><strong>You</strong><small>Online</small></span></button>{icon(muted?'Unmute microphone':'Mute microphone',muted?MicOff:Mic,()=>setMuted(!muted),muted)}{icon('Deafen',Headphones,()=>setDeafened(!deafened),deafened)}{icon('User settings',Settings,()=>setPanel('This is an interactive preview. Microphone and audio controls change the demo only.'))}</div>
    </div>
   </aside>
   <div className={s.main}>
    <div className={s.channelHeader}><Hash size={23}/><strong>{app?'Wharf':active}</strong><span className={s.topic}>{app?'Your scheduling assistant':channels.find(c=>c.id===active)?.topic}</span><div className={s.headerTools}>{icon('Notification settings',Bell,()=>setPanel('Notifications are muted in this preview.'))}{icon('Pinned messages',Pin,()=>setPanel('Prototype and review notes are pinned in the team’s shared document.'))}{icon('Toggle member list',Users,()=>setMembers(!members),members)}<label className={s.search}><input aria-label="Search demo messages" placeholder="Search" value={search} onChange={e=>setSearch(e.target.value)}/><Search size={14}/></label></div></div>
    <div className={s.mobileChannels}>{channels.map(c=><button key={c.id} className={active===c.id?s.active:''} onClick={()=>open(c.id)}># {c.id}</button>)}</div>
    <div className={s.chatBody}>
     <div className={s.conversation}>
      {search&&<div className={s.searchResult}>Searching this channel for “{search}”<button onClick={()=>setSearch('')} aria-label="Clear search"><X size={14}/></button></div>}
      <div ref={scroller} className={`${shared.messages} ${s.messages}`} aria-live="polite" data-search={search||undefined}>{search?<SearchResults query={search} root={scroller}/>:children}</div>
      <form className={s.composer} onSubmit={e=>{setCommand(false);submit(e)}}>
       {(command||draft==='/')&&!app&&<div className={s.commands}><div>COMMANDS MATCHING /</div><button type="button" onClick={chooseCommand}><img src="/slack/wharf-avatar.png" alt=""/><span><strong>/wharf <em>request</em></strong><small>Find a shared meeting time with Wharf</small></span><b>Wharf</b></button></div>}
       <div className={s.inputRow}><button type="button" aria-label="Open command picker" onClick={()=>setCommand(!command)}><Plus size={20}/></button><input ref={inputRef} enterKeyHint="send" aria-label={`Message #${active}`} placeholder={app?'Message @Wharf':`Message #${active}`} value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(['Tab','Enter'].includes(e.key)&&(draft==='/'||command)){e.preventDefault();chooseCommand()}}} disabled={app}/><div className={s.inputTools}>{icon('Wharf commands',Command,()=>setCommand(!command))}<button type="button" title="Insert emoji" aria-label="Insert emoji" onClick={()=>setDraft(draft+' 🙂')}><Smile size={22}/></button></div></div>
       <div className={s.typing}>{typing?<><i/><i/><i/><strong>Wharf</strong> is typing...</>:draft.startsWith('/wharf')?<span><strong>Enter</strong> to use command <span className={s.hint}>Esc to dismiss</span></span>:<span>Try <button type="button" onClick={chooseCommand}>/wharf</button> to schedule a meeting</span>}{busy&&<span className={s.sr}>Processing request</span>}</div>
      </form>
     </div>
     {members&&<aside className={s.memberList} aria-label="Server members"><p>ONLINE · 5</p>{people.filter(p=>p.name!=='Sam Rivera').map(p=><button key={p.name} onClick={()=>setProfile(profile===p.name?'':p.name)}><span className={s.memberAvatar} style={{background:p.color+'33',color:p.color}}>{p.initial}<i/></span><span><strong style={{color:p.color}}>{p.name}{p.bot&&<b>APP</b>}</strong>{p.status&&<small>{p.status}</small>}</span></button>)}<button onClick={()=>setProfile('You')}><span className={s.memberAvatar}>Y<i/></span><strong>You</strong></button><p>OFFLINE · 1</p><button className={s.offline} onClick={()=>setProfile('Sam Rivera')}><span className={s.memberAvatar}>S</span><strong>Sam Rivera</strong></button></aside>}
    </div>
   </div>
  </div>
  {(panel||profile)&&<div className={s.popover} role="dialog" aria-label={profile?'Member profile':'Discord preview information'}><button className={s.close} aria-label="Close panel" onClick={()=>{setPanel('');setProfile('')}}><X size={17}/></button>{profile?<><div className={s.profileBanner}/><div className={s.profileAvatar}>{profile==='Wharf'?'⚓':profile[0]}</div><h3>{profile}</h3><p>{profile==='Wharf'?'An easier way to find a time together.':'Northwind team member'}</p><small>ABOUT ME</small><p>{profile==='Wharf'?'Use /wharf in a text channel to plan your next meeting.':'Here to build good things with good people.'}</p>{profile==='Wharf'&&<button className={s.profileAction} onClick={()=>{setProfile('');open('design-sync');chooseCommand()}}>Try /wharf</button>}</>:<><h3>Northwind</h3><p>{panel}</p></>}</div>}
 </div>;
}
function CalendarIcon(){return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6m10-6v6M3 11h18"/></svg>}
function SearchResults({query,root}:{query:string;root:RefObject<HTMLDivElement|null>}){
 // Retain a copy of visible chat text before the search panel replaces the message list.
 const [source]=useState(()=>root.current?.innerText||'');
 const matches=source.split('\n').filter(line=>line.toLowerCase().includes(query.toLowerCase()));
 return <div className={s.results}><strong>{matches.length} results</strong>{matches.map((line,i)=><p key={i}>{line}</p>)}{!matches.length&&<p>No messages found. Try another search.</p>}</div>;
}
