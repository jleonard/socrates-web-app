import { useState } from "react";
import { X, Menu } from "lucide-react";
import { Link, useMatches } from "@remix-run/react";

export const Nav = () => {
  const [isOpen, setIsOpen] = useState(false);
  const matches = useMatches();

  type WithUser = { user?: unknown };

  const user = matches
    .map((m) => m.data as WithUser | null)
    .filter((data): data is WithUser => data !== null && data !== undefined)
    .find((m) => m.user)?.user;

  return (
    <>
      {/* Backdrop outside nav, under z-50 */}
      {isOpen && (
        <button
          type="button"
          className="fixed inset-0 bg-paper z-30"
          aria-label="Close navigation menu"
          tabIndex={0}
          onClick={() => setIsOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              setIsOpen(false);
            }
          }}
        />
      )}

      <nav className="sticky top-0 flex flex-col w-full pt-8 z-50 bg-paper-background">
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
                  <Link className="block w-full" to="/privacy">
                    Privacy Policy
                  </Link>
                </li>
                <li className="py-3 border-b-slate-600 border-b">
                  <Link className="block w-full" to="/terms">
                    Terms &amp; Conditions
                  </Link>
                </li>
                <li className="py-3 border-b-slate-600">
                  {user ? (
                    <Link
                      className="block w-full"
                      to="/sign-out"
                      onClick={() => setIsOpen(false)}
                    >
                      Sign Out
                    </Link>
                  ) : (
                    <Link
                      className="block w-full"
                      to="/login"
                      onClick={() => setIsOpen(false)}
                    >
                      Sign In
                    </Link>
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
