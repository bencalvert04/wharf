'use client';
import {useEffect,useState} from 'react';
export default function AnalyticsPreference(){const [off,setOff]=useState(false);useEffect(()=>{try{setOff(localStorage.getItem('wharf-marketing-opt-out')==='true')}catch{setOff(true)}},[]);return <button type="button" onClick={()=>{try{localStorage.setItem('wharf-marketing-opt-out',String(!off));sessionStorage.removeItem('wharf-marketing-visit');setOff(!off)}catch{}}}>{off?'Allow anonymous usage measurement':'Turn off anonymous usage measurement'}</button>}
