// components/EngagementBanner/EngagementBanner.tsx
import { ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";

const TWO_MINUTES = 1 * 60 * 1000;

export const SurveyBanner: React.FC = () => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShow(true), TWO_MINUTES);
    return () => clearTimeout(timer);
  }, []);

  if (!show) return null;

  return (
    <Link
      to="https://museum-voice-survey.vercel.app/companion"
      target="_blank"
      rel="noopener noreferrer"
      className="p-1 fixed left-1/2 -translate-x-1/2 top-36 z-20 w-[400px] inline-flex flex-row gap-1 items-center justify-center bg-[#FCD7C9] text-[#984743]"
    >
      <span>Help us improve by taking a short survey</span>
      <ArrowUpRight size={16} strokeWidth={2} color="#984743" />
    </Link>
  );
};
