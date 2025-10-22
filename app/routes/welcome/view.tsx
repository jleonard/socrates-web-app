import React, { useState } from "react";
import { Link } from "react-router";
import { Carousel } from "components/Carousel/Carousel";

const Welcome: React.FC = () => {
  const [trigger, setTrigger] = useState(0);
  const [currentContent, setCurrentContent] = useState(0);

  const nextSlide = () => setTrigger(Date.now());

  function slideChange(index: number) {
    setCurrentContent(index);
  }

  const content = [
    {
      title: "Connect to the public WiFi",
      text: "It'll help you maintain connectivity and uninterrupted conversation.",
    },
    {
      title: "Slip on your headphones",
      text: "Ayapi is a conversational guide just for you.",
    },
    {
      title: "No wrong way to start",
      text: "Say the name of the artwork, ask a question, or just speak what's on your mind. Ayapi will follow.",
    },
    {
      title: "Your curiosity is the guide",
      text: "Big questions, quirky thoughts or strange details; Ayapi turns your wonder into conversation.",
    },
  ];

  return (
    <>
      <Carousel
        className="absolute top-0 left-1/2 transform -translate-x-1/2 w-full"
        nextTrigger={trigger}
        onSlideChange={slideChange}
      />

      <div className="fixed bottom-7 left-1/2 -translate-x-1/2 flex flex-col w-[366px] pointer-events-none">
        <h2 className="text-[32px] leading-10 font-semibold text-white text-center mb-5 w-3/4 mx-auto">
          {content[currentContent].title}
        </h2>
        <p className="text-white text-center mb-8">
          {content[currentContent].text}
        </p>

        <div className="flex gap-2 justify-center mb-3">
          {content.map((_, i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full ${
                i === currentContent ? "bg-ayapi-pink" : "bg-white"
              }`}
            />
          ))}
        </div>

        {currentContent < content.length - 1 && (
          <button
            onClick={nextSlide}
            className="mt-4 px-6 py-3 bg-transparent border border-white text-white rounded-full pointer-events-auto"
          >
            Next
          </button>
        )}

        {currentContent === content.length - 1 && (
          <Link
            to="/app"
            className="mt-4 px-6 py-3 bg-transparent border border-white text-white rounded-full text-center pointer-events-auto"
          >
            Get Started
          </Link>
        )}
      </div>
    </>
  );
};

export default Welcome;
