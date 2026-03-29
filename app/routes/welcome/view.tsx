import React, { useState } from "react";
import { Link } from "react-router";
import { Carousel } from "components/Carousel/Carousel";
import { ChevronLeft, ChevronRight } from "lucide-react";

const Welcome: React.FC = () => {
  const [goForward, setGoForward] = useState(0);
  const [goBack, setGoBack] = useState(0);
  const [currentContent, setCurrentContent] = useState(0);

  const nextSlide = () => setGoForward(Date.now());
  const prevSlide = () => setGoBack(Date.now());

  function slideChange(index: number) {
    setCurrentContent(index);
  }

  const content = [
    {
      title: "Connect to the public WiFi",
      text: "Internet connectivity is essential to maintain an uninterrupted conversation.",
    },
    {
      title: "Slip on your headphones",
      text: "We don't want to make it noisy for others.",
    },
    {
      title: "Start by asking",
      text: "Where you are. The name of the art piece. Anything you want to know about it. Switch language on the go.",
    },
    /*
    {
      title: "Your curiosity is the guide",
      text: "Big questions, quirky thoughts or strange details; WonderWay turns your wonder into conversation.",
    },
    */
  ];

  return (
    <>
      <Carousel
        className="absolute top-0 left-1/2 transform -translate-x-1/2 w-full"
        nextTrigger={goForward}
        previousTrigger={goBack}
        onSlideChange={slideChange}
      />

      <div className="fixed bottom-7 left-1/2 -translate-x-1/2 flex flex-col w-[366px] pointer-events-none">
        <h2 className="text-[32px] leading-10 font-semibold text-white text-center mb-5 w-3/4 mx-auto">
          {content[currentContent].title}
        </h2>
        <p className="text-white text-center mb-8 text-balance">
          {content[currentContent].text}
        </p>

        <div className="flex gap-2 justify-center mb-3">
          {content.map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full ${
                i === currentContent ? "bg-black w-8" : "bg-white w-2"
              }`}
            />
          ))}
        </div>

        {/* button container */}
        <div className="mt-4 w-full flex">
          {currentContent < content.length - 1 && (
            <div className="w-full flex flex-row gap-3">
              <button
                onClick={prevSlide}
                disabled={currentContent === 0}
                className={`${currentContent === 0 ? "opacity-50 cursor-not-allowed" : ""} flex gap-2 px-3 py-3 bg-white text-black rounded-full text-center pointer-events-auto items-center justify-center`}
              >
                <ChevronLeft size={20} strokeWidth={1.5} />
              </button>
              <button
                onClick={nextSlide}
                className="flex gap-2 w-full px-6 py-3 bg-black text-white rounded-full text-center pointer-events-auto items-center justify-center"
              >
                <span className="uppercase text-sm">Next</span>
                <ChevronRight size={20} strokeWidth={1.5} />
              </button>
            </div>
          )}

          {currentContent === content.length - 1 && (
            <Link
              to="/app"
              className="flex w-full px-6 py-3 bg-black text-white rounded-full text-center pointer-events-auto items-center justify-center"
            >
              <span className="uppercase text-sm">Get Started</span>
            </Link>
          )}
        </div>
      </div>
    </>
  );
};

export default Welcome;
