import { useEffect, useState } from "react";
import { CircleAlert, WifiOff } from "lucide-react";

type EBMMessageVariant = "info" | "error" | "warning" | "success";

type EBMMessageProps = {
  message: string;
  variant?: EBMMessageVariant;
  onClear?: () => void;
};

export function EBMMessage({
  message,
  variant = "info",
  onClear,
}: EBMMessageProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setVisible(false);
      if (onClear) onClear();
    }, 4000);

    return () => clearTimeout(timeout);
  }, [onClear]);

  if (!visible) return null;

  const baseClasses =
    "px-4 py-2 rounded shadow-md transition-opacity duration-500 flex flex-row gap-2 items-center";
  const errorClasses = "bg-yellow-100 text-yellow-900";
  const infoClasses = "bg-blue-100 text-blue-900";
  const colorClasses = variant === "error" ? errorClasses : infoClasses;

  return (
    <div className={`${baseClasses} ${colorClasses}`}>
      {variant === "error" && <CircleAlert className="text-red-900" />}
      {variant === "warning" && <WifiOff className="text-orange-500" />}
      {message}
    </div>
  );
}
