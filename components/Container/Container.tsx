import clsx from "clsx";

export function Container({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={clsx("max-w-[1024px] mx-auto px-4", className)}>
      {children}
    </div>
  );
}
