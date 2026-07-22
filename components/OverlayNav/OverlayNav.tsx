// components/OverlayNav.tsx
import { Container } from "components/Container/Container";
import { ChevronRight } from "lucide-react";
import { Link, useMatches } from "react-router";
import { useNavOverlay } from "~/context/nav-overlay";

export function OverlayNav() {
  const { isOpen, close, toggle } = useNavOverlay();
  const matches = useMatches();

  if (!isOpen) return null;

  type WithUser = { user?: unknown };

  const user = matches
    .map((m) => m.data as WithUser | null)
    .filter((data): data is WithUser => data !== null && data !== undefined)
    .find((m) => m.user)?.user;

  return (
    <div
      className="absolute inset-0 z-50 bg-white backdrop-blur-sm overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <Container>
        <ul className="space-y-2 w-full pt-10">
          <li className="py-3 border-b-[#FAF7F2] border-b">
            <Link
              className="w-full flex items-center justify-between text-xl"
              to="/privacy"
              onClick={() => close()}
            >
              Privacy Policy
              <ChevronRight size={18} strokeWidth={1} color="#000000" />
            </Link>
          </li>
          <li className="py-3 border-b-[#FAF7F2] border-b">
            <Link
              className="w-full flex items-center justify-between text-xl"
              to="/terms"
              onClick={() => close()}
            >
              Terms &amp; Conditions
              <ChevronRight size={18} strokeWidth={1} color="#000000" />
            </Link>
          </li>
          <li className="py-3 border-b-[#FAF7F2] border-b">
            {user ? (
              <Link
                className="w-full flex items-center justify-between text-xl"
                to="/sign-out"
                onClick={() => close()}
              >
                Sign Out
              </Link>
            ) : (
              <Link
                className="w-full flex items-center justify-between text-xl"
                to="/login"
                onClick={() => close()}
              >
                Sign In
              </Link>
            )}
          </li>
        </ul>
      </Container>
    </div>
  );
}
