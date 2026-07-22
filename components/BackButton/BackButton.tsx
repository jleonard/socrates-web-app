import { useNavigate } from "react-router";

type BackButtonProps = {
  fallback?: string;
  className?: string;
  label?: string;
};

export function BackButton({
  fallback = "/",
  className,
  label = "Back",
}: BackButtonProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    const canGoBack = window.history.state?.idx > 0;
    if (canGoBack) {
      navigate(-1);
    } else {
      navigate(fallback, { replace: true });
    }
  };

  return (
    <button onClick={handleBack} className={className}>
      <img src="/icons/ArrowBack.svg" alt="back" />
      <span className="hidden">{label}</span>
    </button>
  );
}

export default BackButton;
