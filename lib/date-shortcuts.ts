import {localParts} from './availability';

export function meetingDateShortcuts(zone: string, now = Date.now()) {
 const today = new Date(localParts(now, zone).date + 'T12:00:00Z');
 const dateAfter = (days: number) => new Date(today.getTime() + days * 86400000).toISOString().slice(0, 10);
 const daysSinceMonday = (today.getUTCDay() + 6) % 7;
 const daysUntilMonday = (8 - today.getUTCDay()) % 7 || 7;
 return {today: dateAfter(0), thisWeekStart: dateAfter(-daysSinceMonday), thisWeekEnd: dateAfter(4 - daysSinceMonday), tomorrow: dateAfter(1), nextWeekStart: dateAfter(daysUntilMonday), nextWeekEnd: dateAfter(daysUntilMonday + 4)};
}
