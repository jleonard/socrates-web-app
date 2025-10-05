import { forwardRef } from "react";

import { CircleImageProps } from "./CircleImage.types";
import clsx from "clsx";

export const CircleImage = forwardRef<HTMLDivElement, CircleImageProps>(
  ({ img, className, ...rest }, ref) => {
    return (
      <div
        ref={ref}
        {...rest}
        className={clsx(
          "w-[570px] h-[570px] overflow-hidden rounded-full",
          className
        )}
      >
        {img && (
          <img
            src={img}
            alt=""
            className="w-full h-full object-cover object-center translate-y-[60px] scale-125"
          />
        )}
      </div>
    );
  }
);
