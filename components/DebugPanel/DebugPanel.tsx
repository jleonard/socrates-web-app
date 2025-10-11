import { format } from "date-fns";

type DebugPanelProps = {
  access?: { expiration: Date | null };
};

export function DebugPanel({ access }: DebugPanelProps) {
  return (
    <div>
      <div>
        Access expires:{" "}
        {(() => {
          if (!access) {
            return <span className="text-red-600">no access</span>;
          }

          if (access && !access.expiration) {
            return <span className="text-green-600">not set</span>;
          }

          if (access && access.expiration) {
            const expDate = new Date(access.expiration);
            const now = new Date();
            const diffMs = expDate.getTime() - now.getTime();
            const diffHours = diffMs / (1000 * 60 * 60);

            let colorClass = "text-green-600"; // more than 1 hour
            if (diffHours < 0) colorClass = "text-red-600"; // expired
            else if (diffHours < 1) colorClass = "text-orange-500"; // less than 1 hour

            return (
              <span className={colorClass}>{format(expDate, "PPPpp")}</span>
            );
          }
        })()}
      </div>
    </div>
  );
}
