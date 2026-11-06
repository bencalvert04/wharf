import {localParts} from './availability';

export function meetingDateShortcuts(zone: string, now = Date.now()) {
 const today = new Date(localParts(now, zone).date + 'T12:00:00Z');
 const dateAfter = (days: number) => new Date(today.getTime() + days * 86400000).toISOString().slice(0, 10);
 const daysUntilMonday = (8 - today.getUTCDay()) % 7 || 7;
 return {tomorrow: dateAfter(1), nextWeekStart: dateAfter(daysUntilMonday), nextWeekEnd: dateAfter(daysUntilMonday + 4)};
}
