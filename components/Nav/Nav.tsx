import clsx from "clsx";
import { ChevronRight, Menu, X } from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useMatches } from "react-router";

import { usePageConfig } from "app/hooks/usePageConfig";
import { BackButton } from "components/BackButton/BackButton";
import { Container } from "components/Container/Container";

export const Nav = () => {
  const [isOpen, setIsOpen] = useState(false);
  const matches = useMatches();
  const location = useLocation();

  const { hiddenLogo, hiddenNav, backgroundClass: theme } = usePageConfig();
  const showBackButton = location.pathname === "/history";

  type WithUser = { user?: unknown };

  const user = matches
    .map((m) => m.data as WithUser | null)
    .filter((data): data is WithUser => data !== null && data !== undefined)
    .find((m) => m.user)?.user;

  const isTinted = theme === "dark" || theme === "pink";
  const logoSrc = isTinted
    ? "/logos/WonderWay-white.svg"
    : "/logos/WonderWay.svg";

  if (hiddenNav) return null;

  return (
    <>
      {/* Backdrop outside nav, under z-40 */}
      {isOpen && (
        <button
          type="button"
          className="hidden fixed inset-0 bg-paper-background z-10"
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

      {/* Toggle icon */}
      {!hiddenNav && (
        <button
          onClick={() => setIsOpen((prev) => !prev)}
          className="hidden absolute bottom-5 right-8 z-10"
        >
          {isOpen ? (
            <X size={38} strokeWidth={2} />
          ) : (
            <Menu size={38} strokeWidth={3} />
          )}
        </button>
      )}

      <nav
        className={clsx(
          "flex flex-col w-full pt-10 pb-4",
          isOpen ? "z-10" : "z-10",
          isTinted ? "bg-transparent" : "bg-paper-background",
        )}
      >
        <Container className="w-full grid grid-cols-3 items-center">
          <div className="justify-self-start">
            {showBackButton && <BackButton />}
          </div>

          <div className="justify-self-center">
            {!hiddenLogo && (
              <a href="/app">
                <img className="w-[263px]" src={logoSrc} alt="Wonder Way" />
              </a>
            )}
          </div>
          <div />
        </Container>

        {/* Nav Bar */}
        <div className="hidden flex w-full flex-row gap-2 justify-center items-center pt-[45px]"></div>

        {isOpen && (
          <div className="hidden flex py-4 w-full z-10">
            <ul className="space-y-2 w-full">
              <li className="py-3 border-b-[#FAF7F2] border-b">
                <Link
                  className="block w-full flex items-center justify-between text-xl"
                  to="/privacy"
                  onClick={() => setIsOpen(false)}
                >
                  Privacy Policy
                  <ChevronRight size={18} strokeWidth={1} color="#000000" />
                </Link>
              </li>
              <li className="py-3 border-b-[#FAF7F2] border-b">
                <Link
                  className="block w-full flex items-center justify-between text-xl"
                  to="/terms"
                  onClick={() => setIsOpen(false)}
                >
                  Terms &amp; Conditions
                  <ChevronRight size={18} strokeWidth={1} color="#000000" />
                </Link>
              </li>
              <li className="py-3 border-b-[#FAF7F2] border-b">
                {user ? (
                  <Link
                    className="block w-full flex items-center justify-between text-xl"
                    to="/sign-out"
                    onClick={() => setIsOpen(false)}
                  >
                    Sign Out
                  </Link>
                ) : (
                  <Link
                    className="block w-full flex items-center justify-between text-xl"
                    to="/login"
                    onClick={() => setIsOpen(false)}
                  >
                    Sign In
                  </Link>
                )}
              </li>
            </ul>
          </div>
        )}
      </nav>
    </>
  );
};
