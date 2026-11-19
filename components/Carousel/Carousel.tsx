import { useEffect } from "react";
import useEmblaCarousel from "embla-carousel-react";
import clsx from "clsx";

type CarouselProps = {
  onSlideChange?: (index: number) => void;
  nextTrigger?: number;
  previousTrigger?: number;
  className?: string;
  /** Space (px) kept free at the bottom of each slide, e.g. for overlaid text. */
  reservedBottom?: number;
};

const SLIDES: { src: string; bg?: string; imgClass?: string }[] = [
  { src: "/images/welcome/welcome-logo.svg" },
  { src: "/images/welcome/welcome-wifi.svg", bg: "bg-ayapi-pink" },
  {
    src: "/images/welcome/welcome-headphones.png",
    bg: "bg-ayapi-pink",
    imgClass: "w-72",
  },
  { src: "/images/welcome/welcome-press-to-talk.svg" },
  { src: "/images/welcome/welcome-chat-dialog.svg", bg: "bg-ayapi-pink" },
];

export function Carousel({
  onSlideChange,
  nextTrigger,
  previousTrigger,
  className,
  reservedBottom = 0,
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
      className={clsx("overflow-hidden h-dvh select-none", className)}
    >
      <div className="flex h-full">
        {SLIDES.map(({ src, bg, imgClass }) => (
          <div
            key={src}
            className={clsx(
              "grow-0 shrink-0 basis-full min-w-0 h-full flex flex-col pt-8",
              bg,
            )}
            style={{ paddingBottom: reservedBottom + 16 }}
          >
            {/* Image is centered in the area above the reserved space and shrinks to fit it. */}
            <div className="flex-1 min-h-0 flex items-center justify-center px-6">
              <img
                className={clsx(
                  "max-h-full max-w-full object-contain",
                  imgClass,
                )}
                src={src}
                alt=""
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
