import React, { ReactElement, useState } from "react";
import { CircleUserRound, X, ChevronRight } from "lucide-react";

export const Nav = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Backdrop outside nav, under z-50 */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-paper z-30"
          onClick={() => setIsOpen(false)}
        />
      )}

      <nav className="relative flex flex-col w-full mt-8 z-50">
        {/* Nav Bar */}
        <div className="flex w-full flex-row gap-2">
          <div>
            <a href="/app">
              <img className="w-24" src="/ayapi.png" alt="Ayapi" />
            </a>
          </div>

          <button
            onClick={() => {
              console.log("cick"), setIsOpen((prev) => !prev);
            }}
            className="ml-auto"
          >
            {/* Swap icon if needed */}
            {isOpen ? (
              <X size={32} strokeWidth={2} />
            ) : (
              <CircleUserRound strokeWidth={2} size={32} />
            )}
          </button>
        </div>

        {isOpen && (
          <>
            {/* Your menu on top of the overlay */}
            <div className="flex py-4 w-full z-50">
              <ul className="space-y-2 w-full">
                <li className="py-3 border-b-slate-600 border-b">
                  <a href="/privacy">Privacy Policy</a>
                </li>
                <li className="py-3 border-b-slate-600 border-b">
                  <a href="/terms">Terms &amp; Conditions</a>
                </li>
                <li className="py-3 border-b-slate-600">
                  <a href="/sign-out">Sign Out</a>
                </li>
              </ul>
            </div>
          </>
        )}
      </nav>
    </>
  );
};
