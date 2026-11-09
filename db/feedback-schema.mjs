export const feedbackSchema=[
`CREATE TABLE IF NOT EXISTS feedback_attempts(id text PRIMARY KEY,status text NOT NULL DEFAULT 'sending',created_at timestamptz NOT NULL DEFAULT now())`,
`CREATE TABLE IF NOT EXISTS feedback_limits(key text PRIMARY KEY,attempts integer NOT NULL,expires_at timestamptz NOT NULL)`
];
