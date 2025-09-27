import { forwardRef } from "react";

import { CircleImageProps } from "./CircleImage.types";

export const CircleImage = forwardRef<HTMLDivElement, CircleImageProps>(
  ({ img, className, ...rest }, ref) => {
    return (
      <div
        ref={ref}
        {...rest}
        className="absolute -top-40 left-1/2 transform -translate-x-1/2 w-[700px] h-[700px] bg-pink-600 rounded-full"
      >
        {img && (
          <img
            src={img}
            alt=""
            className="w-full h-full object-cover object-center"
          />
        )}
      </div>
    );
  }
);
