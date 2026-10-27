import {build} from 'esbuild';
// Slack's opaque sandbox forbids cookies. Bundle React without Next's router bootstrap.
await build({entryPoints:['scripts/slack-calendar-entry.tsx'],outfile:'public/slack-calendar/calendar.js',bundle:true,minify:true,format:'iife',platform:'browser',target:'es2020',define:{'process.env.NODE_ENV':'"production"'}});
