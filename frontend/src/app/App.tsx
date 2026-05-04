import { useState, useEffect, useCallback } from "react";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { DebugPanel } from "../components/DebugPanel";
import { useAuthStore } from "../stores/authStore";

// ─── Auth / Nav screens (named exports) ──────────────────────────────────────
import { LoginScreen }       from "./components/screen-login";
import { RegisterScreen }    from "./components/screen-register";
import { OnboardingScreen }  from "./components/screen-onboarding";

// ─── Main tab screens (named exports) ────────────────────────────────────────
import { ScreenHome }        from "./components/screen-home";
import { HomeHeader }        from "./components/screen-home-header";
import { HomeContent }       from "./components/screen-home-content";
import { ScreenTasks }       from "./components/screen-tasks";
import { ScreenInsights }    from "./components/screen-insights";
import { ScreenGoals }       from "./components/screen-goals";
import { ScreenEmptyGoals }  from "./components/screen-empty-goals";

// ─── Detail / overlay screens (mixed exports) ───────────────────────────────
import { ScreenWeeklySummary } from "./components/screen-weekly-summary";
import { ProfileScreen }      from "./components/screen-profile";
import { AICoachScreen }       from "./components/screen-ai-coach";
import { GoalDetailScreen }    from "./components/screen-goal-detail";
import ScreenSettings          from "./components/screen-settings";
import ScreenMorningCheckin    from "./components/screen-morning-checkin";
import ScreenEveningReview     from "./components/screen-evening-review";

// ─── Bottom-bar type ────────────────────────────────────────────────────────
import type { BottomBarTab } from "./components/molecule-nav-bottom-bar";

// ═══════════════════════════════════════════════════════════════════════════════
//  SCREEN TYPE — single source of truth for every navigable route
// ═══════════════════════════════════════════════════════════════════════════════
export type Screen =
  | "login"
  | "register"
  | "onboarding"
  | "home"
  | "tasks"
  | "insights"
  | "goals"
  | "empty-goals"
  | "weekly-summary"
  | "profile"
  | "settings"
  | "ai-coach"
  | "goal-detail"
  | "morning-checkin"
  | "evening-review";

// ── Tab ↔ Screen mapping ────────────────────────────────────────────────────
const TAB_TO_SCREEN: Record<BottomBarTab, Screen> = {
  Home:     "home",
  Tasks:    "tasks",
  Insights: "insights",
  Goals:    "goals",
  Profile:  "profile",
};

const SCREEN_TO_TAB: Partial<Record<Screen, BottomBarTab>> = {
  home:     "Home",
  tasks:    "Tasks",
  insights: "Insights",
  goals:    "Goals",
  profile:  "Profile",
};

// ═══════════════════════════════════════════════════════════════════════════════
//  APP COMPONENT — the centralized router with real auth
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const { userId, userName, isHydrated, isBootRefreshing, onboardingComplete, hydrate } = useAuthStore();
  const [screen, setScreen]         = useState<Screen>("login");
  const [goalDetailId, setGoalDetailId] = useState("goal-1");

  // ── Boot: hydrate auth store ──────────────────────────────────────────────
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // ── Resolve screen once auth is known ─────────────────────────────────────
  useEffect(() => {
    if (!isHydrated) return;
    if (isBootRefreshing) return; // still refreshing token

    if (!userId) {
      setScreen("login");
    } else if (!onboardingComplete) {
      setScreen("onboarding");
    } else {
      setScreen((prev) => {
        // Only redirect to home if currently on auth screens
        if (prev === "login" || prev === "register" || prev === "onboarding") {
          return "home";
        }
        return prev;
      });
    }
  }, [userId, isHydrated, isBootRefreshing, onboardingComplete]);

  // ── Navigate callback (passed to every screen) ────────────────────────────
  const navigate = useCallback((target: string) => {
    // handle special "goal-detail:123" format
    if (target.startsWith("goal-detail:")) {
      setGoalDetailId(target.split(":")[1]);
      setScreen("goal-detail");
      return;
    }
    setScreen(target as Screen);
  }, []);

  // ── Bottom-bar handler ────────────────────────────────────────────────────
  const handleTabChange = useCallback(
    (tab: BottomBarTab) => {
      const target = TAB_TO_SCREEN[tab];
      if (target) setScreen(target);
    },
    [],
  );

  // ── Loading splash — while auth is being determined ───────────────────────
  if (!isHydrated || isBootRefreshing) {
    return (
      <div
        style={{
          width:          "100vw",
          height:         "100vh",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          background:     "var(--bg-base)",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width:        48,
              height:       48,
              border:       "4px solid rgba(184,71,42,0.2)",
              borderTopColor: "var(--accent-primary)",
              borderRadius: "50%",
              animation:    "spin 0.8s linear infinite",
              margin:       "0 auto 16px",
            }}
          />
          <p
            style={{
              fontFamily: "var(--font-family)",
              fontSize:   14,
              fontWeight:  500,
              color:       "var(--text-secondary)",
              letterSpacing: "0.02em",
            }}
          >
            Loading Momentum…
          </p>
        </div>
      </div>
    );
  }

  // ── Screen renderer ───────────────────────────────────────────────────────
  const activeTab = SCREEN_TO_TAB[screen];

  function renderScreen() {
    switch (screen) {
      // ── Auth flow ─────────────────────────────────────────────────────
      case "login":
        return <LoginScreen navigate={navigate} />;
      case "register":
        return <RegisterScreen navigate={navigate} />;
      case "onboarding":
        return <OnboardingScreen navigate={navigate} />;

      // ── Main tab screens ──────────────────────────────────────────────
      case "home":
        return (
          <ScreenHome
            activeTab={activeTab ?? "Home"}
            onTabChange={handleTabChange}
            header={<HomeHeader name={userName ? `${userName} 👋` : undefined} />}
          >
            <HomeContent />
          </ScreenHome>
        );

      case "tasks":
        return (
          <ScreenTasks
            activeTab={activeTab ?? "Tasks"}
            onTabChange={handleTabChange}
          />
        );

      case "insights":
        return (
          <ScreenInsights
            activeTab={activeTab ?? "Insights"}
            onTabChange={handleTabChange}
          />
        );

      case "goals":
        return (
          <ScreenGoals
            activeTab={activeTab ?? "Goals"}
            onTabChange={handleTabChange}
            onNewGoal={() => navigate("empty-goals")}
          />
        );

      case "empty-goals":
        return (
          <ScreenEmptyGoals
            activeTab="Goals"
            onTabChange={handleTabChange}
            onNewGoal={() => navigate("goals")}
            onCreateGoal={() => navigate("goals")}
            onExploreExamples={() => navigate("goals")}
          />
        );

      // ── Detail / sub-flow screens ────────────────────────────────────
      case "weekly-summary":
        return (
          <ScreenWeeklySummary
            onBack={() => navigate("home")}
            onTabChange={handleTabChange}
          />
        );

      case "profile":
        return <ProfileScreen navigate={navigate} />;

      case "settings":
        return <ScreenSettings navigate={navigate} />;

      case "ai-coach":
        return <AICoachScreen navigate={navigate} />;

      case "goal-detail":
        return <GoalDetailScreen navigate={navigate} goalId={goalDetailId} />;

      case "morning-checkin":
        return <ScreenMorningCheckin navigate={navigate} />;

      case "evening-review":
        return <ScreenEveningReview navigate={navigate} />;

      default:
        return <LoginScreen navigate={navigate} />;
    }
  }

  // ── Layout — centred mobile viewport ──────────────────────────────────────
  return (
    <div
      style={{
        width:          "100vw",
        minHeight:      "100vh",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        background:     "var(--bg-base)",
      }}
    >
      <ErrorBoundary key={screen}>
        {renderScreen()}
      </ErrorBoundary>
      <DebugPanel currentScreen={screen} />
    </div>
  );
}