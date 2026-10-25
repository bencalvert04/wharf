import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'Wharf',icons:{icon:'/favicon.svg'},description:'Find shared meeting availability using Google Calendar.'};
export default function RootLayout({children}: {children:React.ReactNode}) {return <html lang="en"><body>{children}</body></html>}
