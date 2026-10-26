import {slackWebhook} from '../../../../lib/slack-webhook';
export const runtime='nodejs';
export const maxDuration=120;
export async function POST(req:Request){return slackWebhook(req)}
