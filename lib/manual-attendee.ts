import {hash} from './auth';

export function manualAttendeeId(meetingId: string, sessionId: string) {
  return 'manual:' + hash(JSON.stringify([meetingId, sessionId]));
}
