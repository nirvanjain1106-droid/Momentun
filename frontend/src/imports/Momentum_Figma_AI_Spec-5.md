# Momentum App — Figma AI Design Spec
**AI-Powered Adaptive Scheduling**
Version: V8 Light Mode (Final)

---

## INSTRUCTIONS FOR FIGMA AI

You are designing a mobile productivity app called **Momentum**.
The app is warm, premium, and data-rich. It feels like Apple Health
meets a personal AI coach. Use this document as the single source
of truth for every design decision. Do not deviate from any value
specified here.

---

## 1. DESIGN TOKENS

### 1.1 Color — Light Mode

```
/* Foundation */
--color-bg-base:          #FAF6F2   /* App background — warm cream */
--color-bg-secondary:     #F2EDE8   /* Section backgrounds, alternate areas */
--color-card-surface:     #FFFFFF   /* All card backgrounds */
--color-card-border:      #EDE5DE   /* 1px card borders */
--color-divider:          #EDE5DE   /* Section dividers */
--color-tab-bar:          #FFFFFF   /* Bottom nav background */

/* Accent */
--color-accent-primary:   #B8472A   /* Deep terracotta-coral — main brand color */
--color-accent-hover:     #A03D22   /* Pressed / hover state */
--color-accent-tint:      #F5E8E4   /* 10% coral — tag backgrounds, icon fills */
--color-accent-mid:       #D4795C   /* Secondary coral — chart fills */
--color-chart-line:       #C4603A   /* Line chart stroke color */

/* Gloss Gradient — Hero Card */
--gloss-hero-start:       #D8694A
--gloss-hero-mid:         #B8472A
--gloss-hero-end:         #A03D22
--gloss-hero-direction:   145deg
--gloss-shine-opacity:    rgba(255,255,255,0.12)
--gloss-shine-height:     45%       /* Top 45% of element only */

/* Gloss Gradient — CTA Buttons */
--gloss-btn-start:        #D8694A
--gloss-btn-mid:          #B8472A
--gloss-btn-end:          #A03D22
--gloss-btn-direction:    160deg
--gloss-btn-shine-height: 50%       /* Top 50% of button only */

/* Typography */
--color-text-primary:     #1A1210   /* Headings, key data */
--color-text-secondary:   #6B5C54   /* Subtitles, labels */
--color-text-muted:       #9C8880   /* Captions, timestamps */
--color-text-on-accent:   #FFFFFF   /* Text on coral backgrounds */

/* Status — DO NOT CHANGE THESE */
--color-success:          #1A7A4A   /* On Track */
--color-warning:          #C47F1A   /* Slightly Behind */
--color-error:            #C0392B   /* Behind */
--color-energy:           #D4920A   /* Streak / Energy badge */
--color-success-bg:       #F0FAF4   /* Success tint background */
--color-warning-bg:       #FEF9EE   /* Warning tint background */
--color-error-bg:         #FEF0EE   /* Error tint background */
```

---

### 1.2 Typography

```
Font Family:     SF Pro Display (iOS) / Inter (fallback)

/* Scale */
--text-large-title:   28px / Bold    / #1A1210   /* Screen titles */
--text-title-1:       22px / Semibold/ #1A1210   /* Card titles */
--text-title-2:       17px / Semibold/ #1A1210   /* Task names, goal names */
--text-body:          15px / Regular / #6B5C54   /* Descriptions, subtitles */
--text-caption:       12px / Regular / #9C8880   /* Timestamps, hints */
--text-metric-large:  34px / Bold    / #1A1210   /* Big numbers: 18h 42m */
--text-metric-mid:    28px / Bold    / #1A1210   /* Medium metrics: 78% */
--text-delta:         12px / Semibold/ #1A7A4A   /* +12% vs last week */
--text-on-accent:     varies/ Semibold/ #FFFFFF  /* Text on coral cards */

Line Height:     1.4× font size for all text
Letter Spacing:  -0.2px for titles, 0px for body
```

---

### 1.3 Spacing

```
--space-xs:    4px
--space-sm:    8px
--space-md:    12px    /* Gap between cards */
--space-lg:    16px    /* Screen horizontal padding / card inner padding */
--space-xl:    20px    /* Hero card inner padding */
--space-2xl:   24px    /* Between major sections */
--space-3xl:   32px    /* Top section spacing */
```

---

### 1.4 Border Radius

```
--radius-card:    16px   /* All cards */
--radius-btn:     12px   /* All buttons */
--radius-pill:    100px  /* Tab pills, status badges */
--radius-chip:    10px   /* Quick action chips */
--radius-avatar:  50%    /* Circular avatars */
--radius-sm:      8px    /* Small tags, duration badges */
```

---

### 1.5 Shadows

```
--shadow-card:
  0px 2px 8px rgba(26, 18, 16, 0.06),
  0px 0px 1px rgba(26, 18, 16, 0.08)

--shadow-tab-bar:
  0px -1px 0px #EDE5DE,
  0px -4px 12px rgba(26, 18, 16, 0.04)

--shadow-btn:
  0px 4px 12px rgba(184, 71, 42, 0.30)

--shadow-hero-card:
  0px 8px 24px rgba(184, 71, 42, 0.20)
```

---

## 2. COMPONENTS

### 2.1 Primary CTA Button (Glossy)

```
Height:           52px
Border Radius:    12px
Padding:          0 24px
Font:             15px / Semibold / #FFFFFF

Background:       linear-gradient(160deg,
                    #D8694A 0%,
                    #B8472A 45%,
                    #A03D22 100%)

Shine Overlay:
  Position:       absolute, top 0, left 0, right 0
  Height:         50% of button
  Background:     linear-gradient(180deg,
                    rgba(255,255,255,0.12) 0%,
                    rgba(255,255,255,0.00) 100%)
  Border Radius:  12px 12px 0 0

Shadow:           0px 4px 12px rgba(184,71,42,0.30)

States:
  Hover:          #A03D22 base, reduce shine to 0.08 opacity
  Pressed:        Scale 0.97, reduce shadow
  Disabled:       #EDE5DE background, #9C8880 text

Usage:
  Add Task button
  Chat with Coach button
  + New Goal button
  View Detailed Report button
  Create Your First Goal button
```

---

### 2.2 Secondary / Ghost Button

```
Height:           44px
Border Radius:    12px
Padding:          0 20px
Font:             15px / Semibold / #B8472A
Background:       #F5E8E4
Border:           none

States:
  Hover:          #EDD5CE background
  Pressed:        Scale 0.97
```

---

### 2.3 Standard Card

```
Background:       #FFFFFF
Border:           1px solid #EDE5DE
Border Radius:    16px
Padding:          16px
Shadow:           --shadow-card

Variants:
  Default:        As above
  Accent Tint:    Background #FFF8F6, border 1px #EDD5CE
  Active (task):  Background glossy coral gradient (same as CTA)
```

---

### 2.4 Hero Card (Today's Focus)

```
Background:       linear-gradient(145deg,
                    #D8694A 0%,
                    #B8472A 50%,
                    #A03D22 100%)

Shine Overlay:
  Position:       absolute, top 0, left 0, right 0
  Height:         45% of card
  Background:     linear-gradient(180deg,
                    rgba(255,255,255,0.12) 0%,
                    rgba(255,255,255,0.00) 100%)
  Border Radius:  16px 16px 0 0

Border Radius:    16px
Padding:          20px
Shadow:           0px 8px 24px rgba(184,71,42,0.20)

Content:
  Label:          "Today's Focus" / 13px / Regular / rgba(255,255,255,0.80)
  Donut chart:    Left aligned, 80px diameter
  Goal list:      Right of chart, 3 items with colored dots
  Percentage:     Center of donut, 22px Bold White
  Footer:         "3 active goals • On track" / 12px / rgba(255,255,255,0.80)
```

---

### 2.5 Stat Card (Tasks Done / Focus Time / Energy Score)

```
Background:       #FFFFFF
Border:           1px solid #EDE5DE
Border Radius:    16px
Padding:          12px 14px
Shadow:           --shadow-card

Layout:           3 cards in a row, equal width
Content per card:
  Icon:           20px, colored (blue clock, yellow bolt, etc.)
  Label:          12px / Regular / #9C8880
  Value:          18px / Bold / #1A1210
  Delta:          11px / Semibold / #1A7A4A (positive) or #C0392B (negative)
```

---

### 2.6 Task Card

```
/* Inactive State */
Background:       #FFFFFF
Border:           1px solid #EDE5DE
Border Radius:    16px
Padding:          14px 16px
Left Accent:      3px solid [category color] on left edge
Shadow:           --shadow-card

Content:
  Title:          15px / Semibold / #1A1210
  Subtitle:       13px / Regular / #6B5C54
  App icons:      20px row, spaced 4px
  Duration badge: 12px / Regular / #9C8880, right aligned
  Time label:     Left of card, 12px / Regular / #9C8880

/* Active / Current State */
Background:       linear-gradient(145deg, #D8694A, #B8472A, #A03D22)
  + shine overlay 12% top 45%
Title color:      #FFFFFF
Subtitle color:   rgba(255,255,255,0.80)
Duration badge:   White pill background, white text

Category Colors (left border accent):
  Work/Strategy:  #6C63FF (purple)
  Meeting:        #2E9FD4 (blue)
  Review:         #F0A500 (amber)
  Break:          #1A7A4A (green)
  Research:       #D4795C (mid coral)
  Fitness:        #E05C7A (pink)
  Reflection:     #9C8880 (muted)
```

---

### 2.7 Goal Card

```
Background:       #FFFFFF
Border:           1px solid #EDE5DE
Border Radius:    16px
Padding:          16px
Shadow:           --shadow-card

Layout:
  Left:           Circular progress ring (64px diameter)
  Right:          Goal name, subtitle, status badge
  Bottom:         Mini trajectory line chart (40px height)

Ring Colors:
  Website Launch: #E05C7A (pink-red)
  Read 12 Books:  #1A7A4A (green)
  Run Marathon:   #2E9FD4 (teal-blue)

Ring Track:       #EDE5DE (background arc)
Ring Width:       6px stroke

Trajectory Chart Line Colors:
  Website Launch: #E05C7A  (MUST match ring)
  Read 12 Books:  #1A7A4A  (MUST match ring)
  Run Marathon:   #2E9FD4  (MUST match ring)

Status Badges:
  On Track:       #F0FAF4 bg / #1A7A4A text / 12px Semibold
  Slightly Behind:#FEF9EE bg / #C47F1A text
  Behind:         #FEF0EE bg / #C0392B text
```

---

### 2.8 AI Coach Card

```
Background:       #FFFFFF
Border:           1px solid #EDE5DE
Border Radius:    16px
Padding:          16px
Left Accent:      2px solid #B8472A (left edge only)
Shadow:           --shadow-card

Content:
  Star icon:      Top right, 16px, #D4920A
  Mascot:         80px, left aligned (DO NOT RECOLOR)
  Name:           "AI Coach" / 15px / Bold / #1A1210
  Body text:      13px / Regular / #6B5C54 / max 3 lines
  CTA button:     Full width, glossy coral — see Button spec
```

---

### 2.9 Tab Pill (Insights Tabs)

```
Container:
  Background:     #FFFFFF
  Border:         1px solid #EDE5DE
  Border Radius:  100px
  Padding:        4px
  Layout:         Horizontal row, equal pills

Active Pill:
  Background:     #B8472A (flat, no gloss)
  Border Radius:  100px
  Padding:        8px 20px
  Font:           14px / Semibold / #FFFFFF

Inactive Pill:
  Background:     transparent
  Padding:        8px 20px
  Font:           14px / Regular / #6B5C54
```

---

### 2.10 Bottom Navigation Bar

```
Background:       #FFFFFF
Height:           80px (including 34px safe area)
Top Border:       0.5px solid #EDE5DE
Shadow:           --shadow-tab-bar
Padding Bottom:   34px (safe area)

Items: Home, Tasks, Insights, Goals, Profile

Active State:
  Icon:           24px / filled / #B8472A
  Label:          11px / Semibold / #B8472A

Inactive State:
  Icon:           24px / outlined / #9C8880
  Label:          11px / Regular / #9C8880

Icons (use SF Symbols or equivalent):
  Home:           house.fill
  Tasks:          checklist
  Insights:       chart.bar.fill
  Goals:          target
  Profile:        person.fill
```

---

### 2.11 Calendar Strip (Tasks Screen)

```
Layout:           7 columns, full width
Day label:        11px / Regular / #9C8880 (MON, TUE etc.)
Date number:      16px / Semibold / #1A1210

Selected Day:
  Circle:         36px diameter / #B8472A fill
  Date text:      16px / Semibold / #FFFFFF

Task Dot:
  Size:           5px circle
  Color:          #B8472A
  Position:       Below date number, centered
  Rule:           Only show on days with scheduled tasks

Timeline:
  Dot:            8px circle / #B8472A (current) / #EDE5DE (past/future)
  Line:           1px / #EDE5DE / vertical connecting dots
  Time text:      12px / Regular / #9C8880
```

---

### 2.12 Focus Heatmap

```
Grid:             7 columns (Mon–Sun) × 7 rows (6AM–9PM)
Cell size:        Approx 28px × 20px
Cell radius:      4px
Cell gap:         3px

Color Ramp (low to high intensity):
  Empty/Zero:     #F5E8E4
  Low:            #F0D0C4
  Low-Mid:        #D4795C
  Mid:            #C4603A
  High:           #B8472A
  Peak:           #8C3520

Axis Labels:
  Row (times):    12px / Regular / #9C8880 — left side
  Col (days):     11px / Regular / #9C8880 — top
  
Legend:
  "Low" label:    12px / Regular / #9C8880
  "High" label:   12px / Regular / #9C8880
  Dots:           5 circles showing color ramp left to right
```

---

### 2.13 Line Chart

```
Line stroke:      2px / #C4603A
Line dots:        5px circle / #C4603A fill / #FFFFFF stroke 1.5px
Area fill:        #B8472A at 8% opacity, below line
Chart background: #FFFFFF
Grid lines:       0.5px / #EDE5DE / horizontal only

Axis labels:
  X-axis:         12px / Regular / #9C8880
  Y-axis:         12px / Regular / #9C8880 / right or left aligned

Goal trajectory charts (inside goal cards):
  Line color:     MUST match goal ring color (not coral)
  Website Launch: #E05C7A
  Read 12 Books:  #1A7A4A
  Run Marathon:   #2E9FD4
```

---

### 2.14 Donut / Ring Chart

```
Diameter:         80px (Today's Focus) / 64px (Goal cards)
Stroke width:     6px
Track color:      rgba(255,255,255,0.25) on coral bg /
                  #EDE5DE on white bg
Center text:      Percentage value, Bold, white on coral / #1A1210 on white

Today's Focus rings (3 layered):
  Ring 1 (outer): #E05C7A — Website Launch
  Ring 2 (mid):   #1A7A4A — Read 12 Books
  Ring 3 (inner): #2E9FD4 — Half Marathon

Completion Rate ring (Insights):
  Color:          #3A3A3A (neutral dark — NOT coral)
  Track:          #EDE5DE
```

---

### 2.15 Status / Delta Badge

```
Positive delta (↑):
  Text:           #1A7A4A
  Icon:           Arrow up / #1A7A4A
  Example:        "+12% vs last week"

Negative delta (↓):
  Text:           #C0392B
  Icon:           Arrow down / #C0392B

Neutral:
  Text:           #9C8880

Background (optional pill):
  Positive:       #F0FAF4
  Negative:       #FEF0EE
  Border radius:  100px
  Padding:        2px 8px
  Font:           11px / Semibold
```

---

### 2.16 Weekly Summary Hero Card

```
Background:       linear-gradient(135deg,
                    #D8694A 0%,
                    #C05A3C 40%,
                    #B8472A 100%)

Shine overlay:    Same as hero card spec (12% opacity, top 45%)
Border radius:    16px
Padding:          20px

Content:
  AI Mascot:      120px, right-center aligned (DO NOT RECOLOR)
  Sparkles:       White/light decorative dots scattered
  Heading:        "Amazing week, Alex! 🎉" / 22px / Bold / #FFFFFF
  Subtext:        "You showed up and made real progress."
                  14px / Regular / rgba(255,255,255,0.85)
```

---

### 2.17 Highlight Row (Weekly Summary)

```
Layout:           Full width row, horizontal
Icon circle:      32px / #F5E8E4 bg / #B8472A icon
Label:            13px / Regular / #9C8880
Value:            17px / Semibold / #1A1210
Delta:            12px / Semibold / #1A7A4A
Divider:          0.5px / #EDE5DE / bottom of each row
```

---

### 2.18 Quick Action Chip (AI Coach Banner)

```
Background:       #FFFFFF
Border:           1px solid #EDE5DE
Border Radius:    10px
Padding:          12px 14px
Min width:        140px

Icon:             20px / #F5E8E4 bg circle / #B8472A icon
Title:            13px / Semibold / #1A1210
Subtitle:         12px / Regular / #6B5C54
```

---

## 3. SCREEN SPECIFICATIONS

### 3.1 Home Screen

```
Background:       #FAF6F2

Header:
  Logo text:      "Momentum" / 20px / Bold / #1A1210
  Greeting:       "Good morning," / 13px / Regular / #9C8880
  Name:           "Alex 👋" / 17px / Semibold / #1A1210
  Avatar:         36px circle
  Icons:          Bell (24px) + Settings gear (24px) / #1A1210

Sections (top to bottom):
  1. Today's Focus Hero Card     (see Component 2.4)
  2. Stat Cards Row              (3 cards: Tasks Done, Focus Time, Energy Score)
  3. Focus Time Today Card       (line chart, label, current value)
  4. AI Coach Card               (see Component 2.8)

Bottom:           Navigation Bar
```

---

### 3.2 Tasks Screen

```
Background:       #FAF6F2

Header:
  "Today ∨"       22px / Semibold / #1A1210 (dropdown arrow)
  Date:           "May 16, 2024" / 13px / Regular / #9C8880
  Calendar icon + menu icon: right aligned / #1A1210

Calendar Strip:   (see Component 2.11)
  Current: THU 16 selected

Add Task Button:  Full width / Glossy coral / see Component 2.1

Task List:        Scrollable / 12px gap between cards
  Tasks shown:
    9:00 AM  — Deep Work Session (90m) — active card
    9:30 AM  — Marketing Sync (30m)
    11:00 AM — Content Review (60m)
    12:30 PM — Lunch Break (60m)
    2:00 PM  — User Research (90m)
    3:30 PM  — Workout (60m)
    5:00 PM  — Evening Reflection (30m)

Bottom:           Navigation Bar (Tasks active)
```

---

### 3.3 Insights Screen

```
Background:       #FAF6F2

Header:
  "Insights"      22px / Bold / #1A1210
  Info icon:      right aligned / #9C8880

Tab Bar:          Focus | Productivity | Habits
  Active:         Focus tab / coral pill

Stat Row:         3 cards side by side
  Current Streak: 7 Days 🔥 "Keep it up!" in #1A7A4A
  Completion Rate:78% circular ring (neutral dark gray ring)
                  "This Week" badge: #F5E8E4 bg / #B8472A text
  Energy Score:   85 ⚡ "High" in #1A7A4A

Focus Time:
  Label:          "Focus Time (This Week)"
  Value:          "18h 42m" / 34px / Bold / #1A1210
  Delta:          "↑ 12% vs last week" / #1A7A4A

Line Chart:       Full width / see Component 2.13
  X: Mon–Sun, Y: 0h–18h

Focus Heatmap:    (see Component 2.12)
  Label: "Focus Heatmap"
  Row labels: 6AM 9AM 12PM 3PM 6PM 9PM
  Col labels: Mon Tue Wed Thu Fri Sat Sun

Bottom:           Navigation Bar (Insights active)
```

---

### 3.4 Goals Screen

```
Background:       #FAF6F2

Header:
  "Goals"         22px / Bold / #1A1210
  "+ New Goal"    Glossy coral button / right aligned

Section:          "Active 3" / 15px / Semibold / #1A1210

Goal Cards (3):
  1. Website Launch  — 65% / pink-red ring / On Track
  2. Read 12 Books   — 58% / green ring / Slightly Behind
  3. Run Half Marathon — 40% / teal ring / Behind
  Each card: see Component 2.7

Accordions:
  "Paused  1  ∨"     15px / Semibold / #6B5C54
  "Completed  2  ∨"  15px / Semibold / #6B5C54

Bottom:           Navigation Bar (Goals active)
```

---

### 3.5 Weekly Summary Screen

```
Background:       #FAF6F2

Header:
  Back arrow:     left / #1A1210
  "Weekly Summary" center / 17px / Semibold / #1A1210
  Share icon:     right / #1A1210

Hero Card:        (see Component 2.16)
  Full width, coral gradient, mascot + celebration text

Highlights:
  Section title:  "Highlights" / 17px / Semibold / #1A1210
  4 rows:         (see Component 2.17)
    Focus Time:   18h 42m / ↑12% vs last week
    Tasks Completed: 36 / ↑8 from last week
    Goals Progress: 3 active / On track
    Best Day:     Thursday / 6h 12m focus time

This Week's Wins:
  Section title   "This Week's Wins ∨" / 17px / Semibold / #1A1210
  Trophy card:    White card / 🏆 gold / "7 Day Streak!"
                  "You're building something incredible." / #6B5C54

CTA:              "View Detailed Report" — Glossy coral / full width

Bottom:           Navigation Bar
```

---

### 3.6 Empty State Screen (No Goals Yet)

```
Background:       #FAF6F2

Center content:
  AI Mascot:      160px centered
  Heading:        "No goals yet" / 22px / Bold / #1A1210
  Subtext:        "Let's set your first goal and
                  start building momentum!"
                  15px / Regular / #6B5C54 / centered

Feature list:     4 rows with icon + label
  🎯  Stay focused on what matters
  📊  Track progress visually
  ✨  Get AI-powered insights

CTA:              "+ Create Your First Goal" — Glossy coral / full width
Secondary link:   "Explore Examples" / 14px / #B8472A / centered / underline
```

---

### 3.7 AI Coach Banner

```
Background:       #FFFFFF
Top Border:       1px solid #EDE5DE
Padding:          16px 16px 24px

Left section:
  Mascot:         64px (DO NOT RECOLOR)
  "AI Coach"      16px / Bold / #1A1210
  Subtext:        "I'm here to help you plan smarter,
                  stay focused, and reach your goals."
                  13px / Regular / #6B5C54

Right section (4 chips in a row):
  Chip 1:  📅 "Optimize my schedule"
           "I'll adjust your day for more focus time."
  Chip 2:  🛡️ "Protect my focus"
           "Block distractions and deep work time."
  Chip 3:  📋 "Plan my week"
           "Create a balanced plan for your goals."
  Chip 4:  🔥 "7 Day Streak"
           "You're on fire! Keep it going!"
  (see Component 2.18 for chip styling)
```

---

## 4. FIGMA VARIABLES SETUP

### Create these Variable Collections:

**Collection 1: Colors/Light**
```
bg/base              #FAF6F2
bg/secondary         #F2EDE8
surface/card         #FFFFFF
surface/border       #EDE5DE
accent/primary       #B8472A
accent/hover         #A03D22
accent/tint          #F5E8E4
accent/mid           #D4795C
chart/line           #C4603A
text/primary         #1A1210
text/secondary       #6B5C54
text/muted           #9C8880
text/on-accent       #FFFFFF
status/success       #1A7A4A
status/warning       #C47F1A
status/error         #C0392B
status/energy        #D4920A
status/success-bg    #F0FAF4
status/warning-bg    #FEF9EE
status/error-bg      #FEF0EE
```

**Collection 2: Spacing**
```
xs    4
sm    8
md    12
lg    16
xl    20
2xl   24
3xl   32
```

**Collection 3: Radius**
```
card    16
btn     12
pill    100
chip    10
sm      8
```

---

## 5. COMPONENT NAMING CONVENTION

```
Use this exact naming in Figma:

Atoms:
  Atom/Button/Primary
  Atom/Button/Secondary
  Atom/Button/Ghost
  Atom/Badge/Status
  Atom/Badge/Delta
  Atom/Avatar/Default
  Atom/Icon/Nav-Active
  Atom/Icon/Nav-Inactive

Molecules:
  Molecule/Card/Stat
  Molecule/Card/Task-Active
  Molecule/Card/Task-Inactive
  Molecule/Card/Goal
  Molecule/Card/AI-Coach
  Molecule/Card/Hero-Focus
  Molecule/Card/Weekly-Hero
  Molecule/Tab/Pill-Group
  Molecule/Chart/Line
  Molecule/Chart/Donut
  Molecule/Chart/Heatmap
  Molecule/Chart/Ring
  Molecule/Nav/Bottom-Bar
  Molecule/Calendar/Strip
  Molecule/Row/Highlight
  Molecule/Chip/Quick-Action

Organisms:
  Organism/Header/Home
  Organism/Header/Tasks
  Organism/Section/Stats-Row
  Organism/Section/Goal-List
  Organism/Banner/AI-Coach

Screens:
  Screen/Home
  Screen/Tasks
  Screen/Insights
  Screen/Goals
  Screen/Weekly-Summary
  Screen/Empty-Goals
```

---

## 6. GLOSS EFFECT IMPLEMENTATION IN FIGMA

```
To create the gloss effect on hero card and buttons:

Step 1 — Base layer:
  Rectangle / same size as element
  Fill: Linear gradient
    Angle: 145deg (hero) / 160deg (button)
    Stop 1: #D8694A at 0%
    Stop 2: #B8472A at 50%
    Stop 3: #A03D22 at 100%

Step 2 — Shine layer (separate rectangle on top):
  Width:  100% of element
  Height: 45% of element (hero) / 50% (button)
  Position: Top of element, clipped to element bounds
  Fill: Linear gradient
    Angle: 270deg (top to bottom)
    Stop 1: rgba(255,255,255,0.12) at 0%
    Stop 2: rgba(255,255,255,0.00) at 100%
  Clip to parent: YES (use clip content on frame)

Step 3 — Group both layers
  Apply corner radius: 16px (hero) / 12px (button)
  Use "Clip content" on the frame
```

---

## 7. DARK MODE TOKENS (Coming Next)

```
Dark mode will use:
bg/base:          #0D0B0A
surface/card:     #1A1612
accent/primary:   #C95F3F
(Full dark mode spec document to follow)
```

---

## 8. ASSETS REQUIRED

```
AI Coach Mascot:
  Style:          Friendly robot, blue/purple/white
  Sizes needed:   64px, 80px, 120px, 160px
  Format:         PNG with transparency
  IMPORTANT:      Do not recolor — character colors are fixed

App Icon:
  The "M" logo:   Coral gradient, rounded square

Icons:
  Style:          SF Symbols (iOS) or equivalent
  Weight:         Regular (inactive) / Filled (active)
  Size:           24px standard / 20px small

Goal Icons:
  🎯 Website Launch
  📚 Read 12 Books
  🏃 Half Marathon

Status Icons:
  🔥 Streak / Fire
  ⚡ Energy / Bolt
  ✅ Completed / Checkmark
  🏆 Trophy / Achievement
```

---

## 9. DO NOT CHANGE — LOCKED VALUES

```
These values are final and must never be altered:

1. Status colors (success/warning/error/energy)
2. AI Coach mascot character colors
3. Goal ring colors (pink/green/teal)
4. Goal trajectory line colors (must match rings)
5. Completion Rate ring color (#3A3A3A neutral)
6. Positive delta color (#1A7A4A green)
7. Page background #FAF6F2
8. Card background #FFFFFF
9. Font family and scale
10. Spacing system
11. Gloss shine opacity (0.12 max in light mode)
```

---

*Momentum V8 Light Mode — Design Spec for Figma AI*
*Generated April 2026*
