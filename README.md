# Tumaini - Anonymous Peer Support & Crisis Triage Platform (Uganda)

A privacy-first, clinical-grade emotional support web platform built with **Emil Kowalski's purposeful motion principles** and **Brandkit & Taste-Skill** anti-slop design sensibilities.

The platform provides two completely independent, dedicated terminals connected in real time:
1. **Public User Sanctuary Terminal (`index.html` / `http://localhost:3000/`)**: An anonymous, gentle intake and live confidential support room for individuals seeking emotional support.
2. **Staff & Counselor Command Terminal (`staff.html` / `http://localhost:3000/staff`)**: An operational triage and clinical counseling console featuring counselor registration, unique Operator ID generation (`STF-XXXX`), shift Clock-In/Clock-Out duty tracking, and an emergency-ranked triage queue with **zero demo data**.

---

## Architecture & Complete Terminal Separation

Unlike generic chat apps that squeeze user and staff into cramped split-screens, Haven Core provides two dedicated, full-width terminals:

- **Public Sanctuary (`/` -> `index.html`)**:
  - Full-screen, soothing experience with zero clutter.
  - One-click private pseudonym generator (e.g. *GentleBrook42*, *QuietPine89*).
  - Category selection: Anxiety & Panic, Burnout & Stress, Loneliness, Grief & Loss, Relationships, Heavy Mood, Need to Vent.
  - Emergency Severity Triage ranking:
    - **Tier 1: Critical Crisis / Immediate Danger** (Immediate harm risk alert + 988 lifeline banner)
    - **Tier 2: Acute Panic / Severe Distress** (Rapid heartbeat / hyperventilating pacing priority)
    - **Tier 3: Overwhelmed / Breaking Point** (High exhaustion, elevated queue priority)
    - **Tier 4: Standard Support / Safe Space** (Warm, calm space to process emotions)
  - Interactive Somatic Grounding Drawer with animated 4-4-4-4 Box Breathing visualizer and 5-4-3-2-1 Sensory Reset.
  - Quick Safety Exit (`Esc` key or header button redirects instantly to weather).

- **Staff Console (`/staff` -> `staff.html`)**:
  - **Staff Registration**: Counselor signs up with Full Name, Clinical Role, and Password. The engine automatically assigns a permanent, unique Operator ID (`STF-XXXX`, e.g. `STF-4821`).
  - **Operator Authentication**: Sign in using `STF-XXXX` and password.
  - **Shift Duty Engine (Clock-In / Clock-Out)**:
    - Counselors start **OFF DUTY**.
    - Must click **Clock In** to begin duty, launching a live shift duration clock (`Shift: HH:MM:SS`).
    - Counselors cannot claim tickets or message seekers while off duty.
  - **Strict Emergency-Ranked Triage Queue**:
    - Incoming requests are strictly ordered by **Emergency Tier** (Tier 1 > Tier 2 > Tier 3 > Tier 4) and wait time.
    - Live wait-time counters on all tickets.
    - Real-time stat counters: Waiting, In Session, and Critical count.
    - Tier filter chips (`All`, `Tier 1 (Critical)`, `Tier 2 (Urgent)`, `Tier 3 (Elevated)`, `Tier 4 (Standard)`).
    - **Zero Demo Data**: Starts 100% empty and only displays actual incoming user requests.
  - **Counselor Clinical Workspace**:
    - One-click ticket claiming.
    - Live chat console with Seeker.
    - 1-click Clinical De-escalation Quick Snippets (safety checks, breathing invitations, 988 offers).
    - Clinical Protocol Checklist (Harm Risk Assessed, Grounding Offered, 988 Provided).
    - Confidential Shift Notes with automatic persistence.

---

## Design System & Anti-Slop Principles

- **Brand Identity (Haven Core)**:
  - Custom SVG Sanctuary geometric shield logo mark.
  - High-contrast, dignified Nordic Slate palette (`#070a12`, `#0e1626`, `#152035`).
  - Semantic emergency color coding: Tier 1 Crimson (`#ef4444`), Tier 2 Amber (`#f59e0b`), Tier 3 Yellow (`#eab308`), Tier 4 Sky Blue (`#0ea5e9`), Duty Emerald (`#10b981`).
  - Zero AI-slop: zero purple glow meshes, zero emojis in UI controls, zero letter-by-letter vertical text breaks.
- **Emil Kowalski Motion Principles (`design-motion-principles`)**:
  - Micro-interactions under 220ms using custom spring easing (`cubic-bezier(0.16, 1, 0.3, 1)`).
  - Tactile button feedback (`transform: scale(0.98)` on `:active`).
  - Accessible with `prefers-reduced-motion` overrides.
- **Cross-Terminal Synchronization & Audio**:
  - `BroadcastChannel` real-time sync between tabs and windows.
  - Web Audio API dual-harmonic chime synthesis for message alerts without external audio files.

---

## Running the Platform

### Running with Antigravity Node Runner:
```powershell
agy-node server.js
```

### URLs:
- **Public Sanctuary (User Terminal)**: [http://localhost:3000/](http://localhost:3000/)
- **Staff & Counselor Console**: [http://localhost:3000/staff](http://localhost:3000/staff)

---

## Testing the End-to-End Workflow

1. Open [http://localhost:3000/staff](http://localhost:3000/staff) in one browser tab.
2. Click **Register New Counselor**, enter name (e.g. *Dr. Sarah Chen*), role, and password.
3. Note your generated Operator ID (e.g. `STF-2894`), and sign in.
4. Notice your status is **OFF DUTY**. Click **Clock In for Shift**. Your shift timer begins running.
5. In a second tab or incognito window, open [http://localhost:3000/](http://localhost:3000/).
6. Click **Randomize Name**, select **Tier 1: Critical Crisis / Immediate Danger**, and click **Enter Confidential Sanctuary**.
7. Switch to the Staff tab: observe the ticket instantly pop to the top of the Triage Queue with an audio alert.
8. Click **Claim Case**. Both terminals are connected in real-time chat with de-escalation snippets, clinical protocol tracking, and somatic breathing guidance.
