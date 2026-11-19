import { Carousel } from "components/Carousel/Carousel";
import { ChevronLeft, ChevronRight } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

type OnboardingStep = { title: string; text: string };

const Welcome: React.FC = () => {
  const { t, i18n } = useTranslation("onboarding");

  const [goForward, setGoForward] = useState(0);
  const [goBack, setGoBack] = useState(0);
  const [currentContent, setCurrentContent] = useState(0);

  const raw = t("welcome", { returnObjects: true });
  const content: OnboardingStep[] = Array.isArray(raw) ? raw : [];
  const hasContent = content.length > 0;

  // Height of the bottom text/buttons overlay (+ its bottom offset), so the
  // carousel can keep its images above it instead of underneath.
  const overlayRef = useRef<HTMLDivElement>(null);
  const [overlayHeight, setOverlayHeight] = useState(0);
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const update = () =>
      setOverlayHeight(
        el.offsetHeight + (window.innerHeight - el.getBoundingClientRect().bottom),
      );
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
    // The overlay only mounts once the translations have loaded.
  }, [hasContent]);

  const nextSlide = () => setGoForward(Date.now());
  const prevSlide = () => setGoBack(Date.now());
  const slideChange = (index: number) => setCurrentContent(index);

  const current = content[currentContent];
  console.log(
    "welcome raw:",
    raw,
    "| lang:",
    i18n.language,
    "| loaded:",
    i18n.hasLoadedNamespace("onboarding"),
  );
  if (!current) return null;

  const lightText = currentContent !== 0 && currentContent !== 3;
  const isLast = currentContent === content.length - 1;

  return (
    <>
      <Carousel
        className="absolute top-0 left-1/2 transform -translate-x-1/2 w-full"
        nextTrigger={goForward}
        previousTrigger={goBack}
        onSlideChange={slideChange}
        reservedBottom={overlayHeight}
      />

      <div
        ref={overlayRef}
        className="fixed bottom-12 left-1/2 -translate-x-1/2 flex flex-col w-[366px] pointer-events-none">
        <h2
          className={`text-[32px] leading-10 font-semibold ${lightText ? "text-white" : "text-black"} text-center mb-5 w-3/4 mx-auto`}
        >
          {current.title}
        </h2>
        <p
          className={`${lightText ? "text-white" : "text-black"} text-center mb-8 text-balance`}
        >
          {current.text}
        </p>

        <div className="flex gap-2 justify-center mb-3">
          {content.map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all ${
                i === currentContent
                  ? `w-8 ${lightText ? "bg-black" : "bg-brand"}`
                  : `w-2 ${lightText ? "bg-white" : "bg-brand-400"}`
              }`}
            />
          ))}
        </div>

        <div className="mt-4 w-full flex">
          {!isLast ? (
            <div className="w-full flex flex-row gap-3">
              <button
                onClick={prevSlide}
                disabled={currentContent === 0}
                className={`${currentContent === 0 ? "opacity-50 cursor-not-allowed" : ""} flex gap-2 px-3 py-3 bg-white text-black border border-black rounded-full text-center pointer-events-auto items-center justify-center`}
              >
                <ChevronLeft size={20} strokeWidth={1.5} />
              </button>
              <button
                onClick={nextSlide}
                className="flex gap-2 w-full px-6 py-3 bg-black text-white rounded-full text-center pointer-events-auto items-center justify-center"
              >
                <span className="uppercase text-sm">{t("next")}</span>
                <ChevronRight size={20} strokeWidth={1.5} />
              </button>
            </div>
          ) : (
            <Link
              to="/app"
              className="flex w-full px-6 py-3 bg-black text-white rounded-full text-center pointer-events-auto items-center justify-center"
            >
              <span className="uppercase text-sm">{t("getStarted")}</span>
            </Link>
          )}
        </div>
      </div>
    </>
  );
};

export default Welcome;
