export async function GET(){
 return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>Wharf calendar</title><link rel="stylesheet" href="/slack-calendar/calendar.css"></head><body><div id="calendar"><p>Loading shared availability…</p></div><script defer src="/slack-calendar/calendar.js"></script></body></html>`,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store'}});
}
