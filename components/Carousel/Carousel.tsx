import React, { useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import clsx from "clsx";

type CarouselProps = {
  onSlideChange?: (index: number) => void;
  nextTrigger?: number;
  className?: string;
};

export function Carousel({
  onSlideChange,
  nextTrigger,
  className,
}: CarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel();

  useEffect(() => {
    if (nextTrigger && nextTrigger > 0) {
      if (emblaApi) emblaApi.scrollNext();
    }
  }, [nextTrigger, emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;

    // handler for when slide changes
    const onSelect = () => {
      console.log("Now showing slide:", emblaApi.selectedScrollSnap());
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
    <div ref={emblaRef} className={clsx("overflow-hidden h-full", className)}>
      <div className="flex h-full">
        <div className="grow-0 shrink-0 basis-full min-w-0">
          <img
            className="h-full w-full object-cover object-center"
            src="/images/welcome/FTUE-00.png"
          />
        </div>
        <div className="grow-0 shrink-0 basis-full min-w-0">
          <img
            className="h-full w-full object-cover object-center"
            src="/images/welcome/FTUE-01.png"
          />
        </div>
        <div className="grow-0 shrink-0 basis-full min-w-0 ">
          <img
            className="w-full h-full object-cover object-center"
            src="/images/welcome/FTUE-02.png"
          />
        </div>
        <div className="grow-0 shrink-0 basis-full min-w-0 ">
          <img
            className="w-full h-full object-cover object-center"
            src="/images/welcome/FTUE-03.png"
          />
        </div>
      </div>
    </div>
  );
}
