import React, { useState, TouchEvent } from 'react';
import { PrimaryButton } from './atom-button-primary';

export interface OnboardingScreenProps {
  navigate: (screen: string) => void;
}

export function OnboardingScreen({ navigate }: OnboardingScreenProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  const minSwipeDistance = 50;

  const slides = [
    {
      id: 0,
      visual: <div className="text-[80px] leading-none select-none drop-shadow-sm">🎯</div>,
      title: "Set your goals",
      body: "Define what matters most and track progress every day."
    },
    {
      id: 1,
      visual: <div className="text-[80px] leading-none select-none drop-shadow-sm">⚡</div>,
      title: "Build focus habits",
      body: "Schedule deep work sessions and protect your most productive hours."
    },
    {
      id: 2,
      visual: (
        <div className="w-[120px] h-[120px] rounded-full bg-[#F5E8E4] flex items-center justify-center shadow-inner relative overflow-hidden">
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_#B8472A_0%,_transparent_70%)] mix-blend-overlay"></div>
          <span className="text-[48px]">🧠</span>
        </div>
      ),
      title: "Meet your AI Coach",
      body: "Get personalized insights and adaptive scheduling powered by AI."
    }
  ];

  const nextSlide = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(prev => prev + 1);
    } else {
      navigate('home');
    }
  };

  const onTouchStart = (e: TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEndHandler = () => {
    if (!touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe && currentSlide < slides.length - 1) {
      setCurrentSlide(prev => prev + 1);
    }
    if (isRightSwipe && currentSlide > 0) {
      setCurrentSlide(prev => prev - 1);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col bg-[#FAF6F2] font-sans relative overflow-hidden">
      
      {/* Top Bar with Skip */}
      <div className="w-full flex justify-end p-6 absolute top-0 z-20">
        <button 
          onClick={() => navigate('home')}
          className="text-[14px] text-[#9C8880] font-medium tracking-wide hover:text-[#B8472A] transition-colors focus:outline-none focus:underline"
        >
          Skip
        </button>
      </div>

      {/* Swipeable Content Area */}
      <div 
        className="flex-1 flex w-full relative"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEndHandler}
      >
        <div 
          className="flex w-full h-full transition-transform duration-500 ease-[cubic-bezier(0.25,1,0.5,1)]"
          style={{ transform: `translateX(-${currentSlide * 100}%)` }}
        >
          {slides.map((slide) => (
            <div key={slide.id} className="min-w-full h-full flex flex-col items-center justify-center px-6">
              
              <div className="mb-12 transition-transform duration-700 ease-out transform scale-100">
                {slide.visual}
              </div>
              
              <h1 className="text-[28px] font-bold text-[#1A1210] mb-4 text-center tracking-tight" style={{ fontFamily: 'var(--font-sf-pro, system-ui)' }}>
                {slide.title}
              </h1>
              
              <p className="text-[15px] text-[#6B5C54] text-center max-w-[280px] leading-[1.6]">
                {slide.body}
              </p>

            </div>
          ))}
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="w-full px-4 pb-8 pt-4 flex flex-col items-center bg-gradient-to-t from-[#FAF6F2] via-[#FAF6F2] to-transparent z-10">
        
        {/* Pagination Dots */}
        <div className="flex gap-2 mb-8">
          {slides.map((_, index) => (
            <div 
              key={index}
              className={`h-2 rounded-full transition-all duration-300 ease-out ${
                index === currentSlide 
                  ? 'w-[24px] bg-[#B8472A]' 
                  : 'w-2 bg-[#EDE5DE]'
              }`}
            />
          ))}
        </div>

        {/* Primary Action */}
        <PrimaryButton 
          label={currentSlide === slides.length - 1 ? "Get Started" : "Next →"}
          onClick={nextSlide}
        />
        
      </div>
    </div>
  );
}
