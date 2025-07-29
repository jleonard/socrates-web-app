import { useState } from "react";
import { X, Menu } from "lucide-react";
import { Link, useMatches } from "@remix-run/react";

export const Nav = () => {
  const [isOpen, setIsOpen] = useState(false);
  const matches = useMatches();

  type WithUser = { user?: unknown };

  const user = matches.map((m) => m.data as WithUser).find((m) => m.user)?.user;

  return (
    <>
      {/* Backdrop outside nav, under z-50 */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-paper z-30"
          onClick={() => setIsOpen(false)}
        />
      )}

      <nav className="sticky top-0 flex flex-col w-full pt-8 z-50 bg-paper">
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
              <>
                <Menu size={32} strokeWidth={2} />
                <img
                  src="/icons/User.svg"
                  className="size-[38px] hidden"
                  alt="open nav"
                />
              </>
            )}
          </button>
        </div>

        {isOpen && (
          <>
            {/* Your menu on top of the overlay */}
            <div className="flex py-4 w-full z-50">
              <ul className="space-y-2 w-full">
                <li className="py-3 border-b-slate-600 border-b">
                  <Link to="/privacy">Privacy Policy</Link>
                </li>
                <li className="py-3 border-b-slate-600 border-b">
                  <Link to="/terms">Terms &amp; Conditions</Link>
                </li>
                <li className="py-3 border-b-slate-600">
                  {user ? (
                    <Link to="/sign-out">Sign Out</Link>
                  ) : (
                    <Link to="/login">Sign In</Link>
                  )}
                </li>
              </ul>
            </div>
          </>
        )}
      </nav>
    </>
  );
};
