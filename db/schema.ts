import { pgTable, text } from 'drizzle-orm/pg-core';
export const requests = pgTable('requests', {
 id: text('id').primaryKey(), constraints: text('constraints').notNull(), createdAt: text('created_at').notNull(), plannerKey: text('planner_key').notNull(), plannerName: text('planner_name')
});
