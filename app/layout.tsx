import type { Metadata } from 'next';
import './globals.css';
const staging=process.env.WHARF_ENVIRONMENT==='staging';
export const metadata: Metadata = {title:staging?'Wharf | Test site':'Wharf',icons:{icon:'/favicon.svg'},description:'Find shared meeting availability using your calendar.',...(staging?{robots:{index:false,follow:false}}:{})};
export default function RootLayout({children}: {children:React.ReactNode}) {return <html lang="en"><body>{staging&&<aside className="staging-notice" aria-label="Test environment"><strong>Wharf test site</strong> · Separate test data. This is not the live Wharf site.</aside>}{children}</body></html>}
