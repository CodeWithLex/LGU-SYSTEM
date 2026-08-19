# supabase/

Supabase database configuration for the COE Budget Transparency System.

## Folder Structure

```
supabase/
├── migrations/
│   ├── 001_initial_schema.sql   ← Run first: all tables, triggers, realtime
│   ├── 003_seed_data.sql        ← Run last (optional): test data
│   └── 004_restrict_email_domain.sql ← Run after 001: blocks personal-email signups
└── policies/
    └── 002_rls_policies.sql     ← Run second: Row Level Security rules
```

## How to Apply

1. Open your Supabase project.
2. Go to **SQL Editor**.
3. Run the files **in the numbered order** above.
