import React from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface TutorialStep {
  title: string;
  description: string;
  highlightSelector?: string;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: "Pan the View",
    description: "Click and drag to move around the puzzle area.",
  },
  {
    title: "Zoom In/Out",
    description: "Use mouse wheel or pinch to zoom in and out.",
  },
  {
    title: "Drag Pieces",
    description: "Click and drag puzzle pieces to move them around.",
  },
  {
    title: "Snap Pieces Together",
    description: "Drop pieces near each other to snap them together.",
  },
];

interface TutorialOverlayProps {
  isVisible: boolean;
  currentStep: number;
  onNext: () => void;
  onSkip: () => void;
  onClose: () => void;
}

export const TutorialOverlay: React.FC<TutorialOverlayProps> = ({
  isVisible,
  currentStep,
  onNext,
  onSkip,
  onClose,
}) => {
  if (!isVisible || currentStep < 0 || currentStep >= TUTORIAL_STEPS.length) {
    return null;
  }

  const step = TUTORIAL_STEPS[currentStep];
  const isLastStep = currentStep === TUTORIAL_STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      
      {/* Tutorial Card */}
      <div className="relative bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-6 mx-4 max-w-md w-full">
        {/* Close button */}
        <button
          onClick={onSkip}
          className="absolute top-2 right-2 p-2 hover:bg-gray-100 transition-colors"
          aria-label="Close tutorial"
        >
          <X size={20} />
        </button>

        {/* Step counter */}
        <div className="absolute top-0 left-0 bg-primary text-white px-3 py-1 border-r-2 border-b-2 border-black font-bold text-sm">
          {currentStep + 1} / {TUTORIAL_STEPS.length}
        </div>

        {/* Content */}
        <div className="mt-8">
          <h2 className="text-2xl font-bold uppercase mb-4 text-center">
            {step.title}
          </h2>
          
          <p className="text-lg text-center mb-8 text-gray-700">
            {step.description}
          </p>

          {/* Action buttons */}
          <div className="flex gap-4 justify-center">
            {!isLastStep ? (
              <>
                <Button
                  variant="outline"
                  onClick={onSkip}
                  className="border-2 border-black hover:bg-gray-100 font-bold uppercase"
                >
                  Skip Tutorial
                </Button>
                <Button
                  onClick={onNext}
                  className="bg-primary border-2 border-black hover:bg-primary/90 font-bold uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                >
                  Next
                </Button>
              </>
            ) : (
              <Button
                onClick={onClose}
                className="bg-primary border-2 border-black hover:bg-primary/90 font-bold uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
              >
                Got It!
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Highlight area for canvas - positioned to highlight the main content area */}
      <div className="absolute inset-4 pointer-events-none border-4 border-primary rounded-lg shadow-[0_0_0_4px_rgba(59,130,246,0.5)]" />
    </div>
  );
};