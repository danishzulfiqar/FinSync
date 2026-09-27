Design

                         YOUR ACCOUNTS
                              │
             ┌────────────────┼────────────────┐
             │                │                │
            ABL              HBL             NayaPay
             │                │                │
          Email          ┌─────┴─────┐        Email
             │           │           │          │
             │         Email        SMS         │
             │           │           │          │
             └───────────┴───────────┴──────────┘
                              │
                              ▼
                       Transaction Engine
                              │
                              ▼
                         SQLite/Postgres
                              │
                  ┌───────────┼───────────┐
                  ▼           ▼           ▼
                Excel     Dashboard    Analytics