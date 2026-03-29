import React, { useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import clsx from "clsx";

type CarouselProps = {
  onSlideChange?: (index: number) => void;
  nextTrigger?: number;
  previousTrigger?: number;
  className?: string;
};

export function Carousel({
  onSlideChange,
  nextTrigger,
  previousTrigger,
  className,
}: CarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel();

  useEffect(() => {
    if (nextTrigger && nextTrigger > 0) {
      if (emblaApi) emblaApi.scrollNext();
    }
  }, [nextTrigger, emblaApi]);

  useEffect(() => {
    if (previousTrigger && previousTrigger > 0) {
      if (emblaApi) emblaApi.scrollPrev();
    }
  }, [previousTrigger, emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;

    // handler for when slide changes
    const onSelect = () => {
      if (onSlideChange) {
        onSlideChange(emblaApi.selectedScrollSnap());
      }
    };

    onSelect();
    emblaApi.on("select", onSelect);

    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi]);

  return (
    <div
      ref={emblaRef}
      className={clsx("overflow-hidden h-full select-none", className)}
    >
      <div className="flex h-full">
        <div className="grow-0 shrink-0 basis-full min-w-0 flex items-center justify-center">
          <img
            className="object-center -mt-32"
            src="/images/welcome/welcome-wifi.svg"
          />
        </div>
        <div className="grow-0 shrink-0 basis-full min-w-0 flex items-center justify-center">
          <img
            className="w-72 object-center -mt-32"
            src="/images/welcome/welcome-headphones.png"
          />
        </div>
        <div className="grow-0 shrink-0 basis-full min-w-0 flex items-center justify-center">
          <img
            className="object-center -mt-32 max-w-[398px] h-60"
            src="/images/welcome/welcome-chat-dialog.png"
          />
        </div>
      </div>
    </div>
  );
}
