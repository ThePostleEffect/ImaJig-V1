import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { useState } from "react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { TutorialOverlay } from "./components/TutorialOverlay";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useTutorial } from "./hooks/useTutorial";
import Home from "./pages/Home";


function Router({ onReplayTutorial }: { onReplayTutorial: () => void }) {
  return (
    <Switch>
      <Route path={"/"} component={() => <Home onReplayTutorial={onReplayTutorial} />} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  const [tutorialReplayNonce, setTutorialReplayNonce] = useState(0);
  
  const {
    isTutorialVisible,
    currentStep,
    nextStep,
    skipTutorial,
    closeTutorial,
    isLoading,
  } = useTutorial({ replayNonce: tutorialReplayNonce });

  const handleReplayTutorial = () => {
    setTutorialReplayNonce(prev => prev + 1);
  };

  // Don't render anything while loading tutorial state to prevent flash
  if (isLoading) {
    return null;
  }

  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router onReplayTutorial={handleReplayTutorial} />
          <TutorialOverlay
            isVisible={isTutorialVisible}
            currentStep={currentStep}
            onNext={nextStep}
            onSkip={skipTutorial}
            onClose={closeTutorial}
          />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
