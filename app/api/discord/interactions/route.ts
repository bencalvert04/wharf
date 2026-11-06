import {discordWebhook} from '@/lib/discord-webhook';
export const runtime='nodejs';
export const maxDuration=120;
export async function POST(req:Request){return discordWebhook(req)}
