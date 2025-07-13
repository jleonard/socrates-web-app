import { useEffect, useState } from "react";
import { CircleAlert } from "lucide-react";

type ErrorMessageProps = {
  message: string;
  onClear?: () => void; // optional callback to clear the error externally
};

export function ErrorMessage({ message, onClear }: ErrorMessageProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setVisible(false);
      if (onClear) onClear();
    }, 4000);

    return () => clearTimeout(timeout);
  }, [onClear]);

  if (!visible) return null;

  return (
    <div className=" bg-red-100 text-red-800 px-4 py-2 rounded shadow-md transition-opacity duration-500 flex flex-row gap-2 align-middle">
      <CircleAlert className="text-red-800" /> {message}
    </div>
  );
}
