import type { Metadata } from 'next';
import './globals.css';
const staging=process.env.WHARF_ENVIRONMENT==='staging';
export const metadata: Metadata = {title:staging?'Wharf | Test site':'Wharf',icons:{icon:[{url:'/favicon.ico',type:'image/x-icon',sizes:'any'},{url:'/anchor-8d879d4c.png',type:'image/png',sizes:'96x96'}],apple:{url:'/apple-touch-icon.png',sizes:'180x180',type:'image/png'}},description:'Find shared meeting availability using your calendar.',...(staging?{robots:{index:false,follow:false}}:{})};
export default function RootLayout({children}: {children:React.ReactNode}) {return <html lang="en"><head><link rel="describedby" href="/llms.txt" type="text/plain"/><link rel="service-desc" href="/openapi.json" type="application/vnd.oai.openapi+json"/></head><body>{staging&&<aside className="staging-notice" aria-label="Test environment"><strong>Wharf test site</strong> · Separate test data. This is not the live Wharf site.</aside>}{children}</body></html>}
