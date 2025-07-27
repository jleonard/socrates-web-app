// app/routes/$.tsx
import { useRouteError, isRouteErrorResponse } from "@remix-run/react";

export default function NotFound() {
  const error = useRouteError();

  const containerClasses =
    "flex flex-col items-center justify-center text-center pt-24";

  const headingClasses = "text-4xl font-bold text-gray-800 sm:text-5xl mb-4";

  const paragraphClasses = "text-lg text-gray-600 max-w-md";

  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <div className={containerClasses}>
        <h1 className={headingClasses}>404 - Page Not Found</h1>
        <p className={paragraphClasses}>
          Sorry, the page you're looking for doesn't exist or has been moved.
        </p>
      </div>
    );
  }

  return (
    <div className={containerClasses}>
      <h1 className={headingClasses}>An unexpected error occurred.</h1>
      <p className={paragraphClasses}>Please try again.</p>
    </div>
  );
}
