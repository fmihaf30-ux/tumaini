# Tumaini - Anonymous Crisis Sanctuary & Peer Support (Uganda)

Tumaini (Swahili for "Hope") is a privacy-first, clinical-grade emotional support and crisis triage web platform built specifically for university students and young people across Uganda.

It provides a quiet, dignified, and completely anonymous sanctuary for individuals carrying academic pressure, tuition deadlines, exam permit blocks, family friction, grief, heartbreak, or late-night anxiety. No accounts, no phone numbers, and no real names required.

## Live Production Deployments
- **Public User Sanctuary**: [https://tumaini-zeta.vercel.app/](https://tumaini-zeta.vercel.app/)
- **Staff Counselor Console**: [https://tumaini-zeta.vercel.app/staff](https://tumaini-zeta.vercel.app/staff)
- **GitHub Repository**: [https://github.com/fmihaf30-ux/tumaini](https://github.com/fmihaf30-ux/tumaini)

---

## Core Architecture & Dual-Terminal Design

Tumaini operates as two synchronized environments connected via a high-performance cloud backend (Supabase PostgreSQL + Realtime WebSockets) with seamless local-first offline fallback:

### 1. Public User Sanctuary (`index.html`)
- **Anonymous Pseudonym Generator**: Auto-generates calm Ugandan wildlife handles (e.g., "Steady Kob 42", "Quiet Crane 18", "Brave Shoebill 95") or custom handle.
- **Emergency Severity Triage Tiers**:
  - **Tier 1: Critical Crisis / Immediate Danger** (High priority, toll-free 0800 alerts)
  - **Tier 2: Acute Panic / Severe Distress** (Breathing anchors and rapid pacing)
  - **Tier 3: Elevated / Breaking Point** (Overwhelmed, tuition strain, active listening)
  - **Tier 4: Normal / Safe Space** (Gentle space to process daily emotions)
- **WhatsApp-Style Chat Interface**: Clean, familiar conversational bubbles, message status indicators, and instant responsiveness on low-bandwidth mobile networks.
- **Campus Voices (Peer Reflections)**: Anonymously share and read moderated reflections from Makerere, MUBS, Kyambogo, UCU, MUST, Kikoni, and Banda.
- **Somatic Grounding Drawer**: Interactive 4-4-4-4 Box Breathing pacing guide and 5-4-3-2-1 sensory grounding reset.
- **Instant Safety Quick Exit**: Header exit button or "Escape" key redirects instantly to Google for user physical safety.
- **Certified Ugandan Emergency Hotlines**: Mental Health Uganda toll-free (0800 21 21 21), Butabika National Referral Hospital (0800 211 306), and StrongMinds (0800 200 600).
- **In-App Privacy Charter**: Directly visible from header navigation and intake form, articulating statutory compliance with the Uganda Data Protection and Privacy Act, 2019.

### 2. Staff & Counselor Command Terminal (`staff.html`)
- **Zero Public Self-Registration**: Public registration is permanently removed. Counselor accounts must be generated and issued exclusively by the Clinical Supervisor to prevent unauthorized access to vulnerable users.
- **Master Supervisor Access**: Administrative console authenticated via Supervisor ID (`SUPERVISOR`) with cryptographically hashed credentials.
- **Supervisor Credential Generator**: The supervisor can generate unique Operator IDs (e.g. `STF-XXXX`) and secure passwords from the Profile modal, ready to copy and send directly to vetted counselors via WhatsApp or SMS.
- **Active Counselors Roster**: The supervisor can view and revoke active counselor credentials at any time.
- **WhatsApp-Style Clinical Chat**: Real-time 1-on-1 counseling workspace styled with familiar WhatsApp speech bubbles, delivery checkmarks, and timestamps.
- **Shift Duty Engine**: Counselors must "Clock In" to begin handling cases. Shift timer tracks active duty duration.
- **Dual Desk Navigation**:
  - **Emergency Triage Desk**: Real incoming requests sorted by Emergency Severity Tier. All demo tickets and seed data have been completely removed.
  - **Reflection Moderation Desk**: Counselors review, approve, or reject student reflections before they go live on the public community hearth.
- **Clinical Workspace**: One-click case claiming, live WhatsApp-style chat, clinical de-escalation quick snippets, and group support circle invitations.

---

## Production Backend & Database Specification

Tumaini utilizes Supabase as its primary cloud data and realtime infrastructure:
- **PostgreSQL Database** with `pgcrypto` Blowfish one-way password hashing.
- **Realtime WebSocket Channels**: `postgres_changes` triggers instant triage queue alerts and sub-second bidirectional message streaming between seekers and counselors.
- **Server-Side Stored Procedures (RPC)**:
  - `verify_counselor_login`: Server-side credential verification with zero plaintext password exposure to client scripts.
  - `create_counselor_account`: Supervisor-authenticated generation of unique `STF-XXXX` IDs.
  - `revoke_counselor_account`: Supervisor-controlled deactivation of counselor access.
  - `increment_empathy`: Atomic increment of peer support reactions on approved reflections.
- **Row-Level Security (RLS)**:
  - Counselors roster is locked against public reading.
  - Confessions table restricts public queries exclusively to approved posts.
  - Intakes and messages are protected with session tokens.

---

## Data Protection, Privacy & Retention Policy

Tumaini adheres strictly to the Uganda Data Protection and Privacy Act, 2019:

1. **Zero Personal Identifiers**: Tumaini requires no user registration, no email address, no phone number, and no National Identification Number (NIN). Sessions exist under ephemeral pseudonyms.
2. **Ephemeral Storage & Session Purging**:
   - Resolved consultation cases and messages are deleted within 2 hours of completion.
   - Stale or unlinked sessions are purged completely after 24 hours.
   - Zero permanent archiving of crisis chat transcripts.
   - Tapping "End Session" or "Quick Exit" clears active session tokens immediately.
3. **Campus Voices Authenticity & Consent**:
   - The communal reflections board features voluntary anonymous student submissions and synthetic composite archetypes of campus life in Uganda (tuition deadlines, missing marks, hostel rent, family silence).
   - No private conversations or non-consensual personal statements are scraped or published. Every public reflection is screened by on-duty counselors to prevent harassment, doxxing, or self-harm triggers.
4. **Vetted Clinical Access**:
   - Unvetted self-registration is eliminated. Only verified volunteer counselors holding supervisor-issued credentials can access the triage queue.

---

## Local Development & Testing

Prerequisites: Node.js (v18+)

```bash
# 1. Clone the repository
git clone https://github.com/fmihaf30-ux/tumaini.git
cd tumaini

# 2. Start the local server
node local-server.js

# 3. Open in your browser
# Public Sanctuary: http://localhost:3000/
# Staff Console:    http://localhost:3000/staff
```

Default Local Supervisor Credentials:
- **Operator ID**: `SUPERVISOR`
- **Password**: `tumaini2026`

---

## Project Structure

```text
tumaini/
├── index.html            Public User Sanctuary (self-contained production build)
├── staff.html            Staff Counselor Terminal (self-contained production build)
├── vercel.json           Vercel deployment configuration and clean URL routing
├── package.json          Project metadata and local runner scripts
├── local-server.js       Local development HTTP server
├── README                Plain-text documentation
├── README.md             Markdown documentation mirror
├── css/
│   ├── tumaini.css       User sanctuary styling, WhatsApp chat styling, mobile layout
│   ├── staff.css         Staff console layout, duty bar, triage desks, and chat bubbles
│   └── motion.css        Spring motion tokens and micro-interactions
├── js/
│   ├── supabase-client.js Supabase SDK client, Realtime WebSockets, RPC functions
│   ├── store.js          Central state repository, triage queue, and auto-purging
│   ├── auth.js           Staff authentication and supervisor credential engine
│   ├── tumaini-user.js   User sanctuary controller, intake form, and privacy modal
│   ├── tumaini-staff.js  Staff console controller, triage desks, and moderation
│   └── bus.js            Web Audio API dual-harmonic chime synthesis and broadcast bus
├── assets/
│   └── logo.svg          Official Tumaini sanctuary badge mark
├── supabase/
│   └── schema.sql        PostgreSQL DDL schema, pgcrypto hashing, RLS, and RPCs
└── public/               Public distribution directory mirrors for static hosts
```

---

## Emergency Crisis Contacts (Uganda)

- **Mental Health Uganda Toll-Free Helpline**: 0800 21 21 21
- **Butabika National Referral Hospital Helpline**: 0800 211 306
- **StrongMinds Uganda Toll-Free**: 0800 200 600
- **Uganda Police Emergency Dispatch**: 999 / 112
- **Child & Youth Helpline (Sauti)**: 116
