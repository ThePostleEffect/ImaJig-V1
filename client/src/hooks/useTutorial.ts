import { useState, useEffect } from 'react';
import { getSetting, setSetting } from '../storage/db';

const TUTORIAL_SEEN_KEY = 'hasSeenTutorial';

interface UseTutorialProps {
  replayNonce?: number; // External trigger for replaying tutorial
}

export function useTutorial(props?: UseTutorialProps) {
  const [hasSeenTutorial, setHasSeenTutorial] = useState(false);
  const [isTutorialVisible, setIsTutorialVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [lastReplayNonce, setLastReplayNonce] = useState(0);

  // Load tutorial state on mount
  useEffect(() => {
    loadTutorialState();
  }, []);

  // Handle replay nonce changes (external replay triggers)
  useEffect(() => {
    if (props?.replayNonce && props.replayNonce > lastReplayNonce) {
      setLastReplayNonce(props.replayNonce);
      setCurrentStep(0);
      setIsTutorialVisible(true);
    }
  }, [props?.replayNonce, lastReplayNonce]);

  const loadTutorialState = async () => {
    try {
      const seen = await getSetting(TUTORIAL_SEEN_KEY);
      const hasSeen = seen === 'true';
      setHasSeenTutorial(hasSeen);
      
      // Show tutorial automatically if not seen before
      if (!hasSeen) {
        setIsTutorialVisible(true);
        setCurrentStep(0);
      }
    } catch (error) {
      console.warn('Failed to load tutorial state, falling back to session storage:', error);
      // Fallback to session storage if DB fails
      const seen = sessionStorage.getItem(TUTORIAL_SEEN_KEY) === 'true';
      setHasSeenTutorial(seen);
      
      if (!seen) {
        setIsTutorialVisible(true);
        setCurrentStep(0);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const markTutorialAsSeen = async () => {
    try {
      await setSetting(TUTORIAL_SEEN_KEY, 'true');
      setHasSeenTutorial(true);
    } catch (error) {
      console.warn('Failed to save tutorial state to DB, using session storage:', error);
      // Fallback to session storage
      sessionStorage.setItem(TUTORIAL_SEEN_KEY, 'true');
      setHasSeenTutorial(true);
    }
  };

  const nextStep = () => {
    setCurrentStep(prev => prev + 1);
  };

  const skipTutorial = async () => {
    await markTutorialAsSeen();
    setIsTutorialVisible(false);
    setCurrentStep(0);
  };

  const closeTutorial = async () => {
    await markTutorialAsSeen();
    setIsTutorialVisible(false);
    setCurrentStep(0);
  };

  const replayTutorial = () => {
    setCurrentStep(0);
    setIsTutorialVisible(true);
  };

  return {
    hasSeenTutorial,
    isTutorialVisible,
    currentStep,
    isLoading,
    nextStep,
    skipTutorial,
    closeTutorial,
    replayTutorial,
  };
}