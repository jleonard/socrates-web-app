import { createTV } from "tailwind-variants";

import { textColors } from "../theme/colors";
//import { fontSize } from "../theme/type";

export const tv = createTV({
  twMergeConfig: {
    extend: {
      classGroups: {
        // "font-size": [{ text: Object.keys(fontSize) }],
        "font-color": [{ text: Object.keys(textColors) }],
      },
    },
  },
});
