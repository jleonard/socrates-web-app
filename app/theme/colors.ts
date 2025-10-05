const coreColors = {
  white: "#FFFFFF",
  blue: {
    "50": "#F9FBFE",
    "100": "#ECF2FE",
    "200": "#B3CDF9",
    "400": "#387BF0",
    "500": "#115EE4",
  },
  granite: {
    "100": "#F4F4F6",
    "200": "#D9DADE",
    "300": "#BDBFC6",
    "400": "#A2A4AE",
    "500": "#878997",
    "600": "#6D707E",
    "700": "#555762",
    "800": "#474952",
    "900": "#2F3037",
    "1000": "#18181B",
    "1100": "#0C0C0E",
  },
  green: {
    "50": "#F9FEFB",
    "100": "#EEFBF1",
    "200": "#BDEFC8",
    "400": "#57D873",
    "700": "#176328",
  },
  grey: {
    "100": "#F7F7F7",
    "200": "#F0F0F0",
    "300": "#EDEDED",
    "400": "#E6E6E6",
    "500": "#E0E0E0",
    "600": "#DBDBDB",
    "700": "#D6D6D6",
    "800": "#D1D1D1",
    "900": "#C7C7C7",
    "1000": "#999999",
    "1100": "#808080",
    "1200": "#666666",
    "1300": "#4D4D4D",
    "1400": "#303236",
    "1500": "#1B1C1E",
  },
  orange: {
    "100": "#FDF4E6",
    "200": "#F8D299",
    "400": "#ED8E00",
  },
  red: {
    "100": "#FFE6E2",
    "200": "#F7A89D",
    "400": "#CB1E07",
  },
  paper: {
    DEFAULT: "#F0EDE4", // base paper color
    dark: "#E3DFD6",
    "800": "#DFD9CD",
  },
};

export const textColors = {
  primary: coreColors.granite["1100"],
  secondary: coreColors.granite["800"],
  tertiary: coreColors.granite["600"],
  disabled: coreColors.grey["900"],
  inverse: coreColors.white,
  emphasis: {
    DEFAULT: coreColors.blue["500"],
    subtle: coreColors.blue["100"],
    subtlest: coreColors.blue["50"],
  },
  success: coreColors.green["700"],
  warning: coreColors.orange["400"],
  critical: coreColors.red["400"],
};

export const linkColors = {
  link: {
    DEFAULT: coreColors.blue["400"],
    hover: coreColors.blue["400"],
  },
};

export const surfaceColors = {
  primary: coreColors.white,
  secondary: coreColors.grey["100"],
  tertiary: coreColors.grey["200"],
  quaternary: coreColors.grey["800"],
  handle: coreColors.grey["700"],
  inverse: coreColors.granite["1100"],
  "ayapi-grey": "#1F1F1F",
  "ayapi-pink": "#FF2F92",
  paper: {
    DEFAULT: coreColors.paper,
    dark: coreColors.paper["dark"],
    background: coreColors.paper["800"],
  },
  emphasis: {
    DEFAULT: coreColors.blue["500"],
    subtle: coreColors.blue["100"],
    subtlest: coreColors.blue["50"],
  },
  warning: {
    DEFAULT: coreColors.orange["400"],
    subtle: coreColors.orange["100"],
  },
  critical: {
    DEFAULT: coreColors.red["400"],
    subtle: coreColors.red["100"],
  },
  success: {
    DEFAULT: coreColors.green["700"],
    subtle: coreColors.green["100"],
    subtlest: coreColors.green["50"],
  },
};

export const actionColors = {
  "action-primary": {
    DEFAULT: coreColors.granite["1100"],
    hover: coreColors.granite["900"],
    focus: coreColors.granite["1100"],
    disabled: coreColors.grey["200"],
  },
  "action-secondary": {
    DEFAULT: coreColors.white,
    hover: coreColors.grey["200"],
    focus: coreColors.white,
    disabled: coreColors.grey["200"],
  },
  "action-tertiary": {
    DEFAULT: coreColors.white,
    hover: coreColors.grey["100"],
    focus: coreColors.white,
    disabled: coreColors.grey["200"],
  },
};

export const borderColors = {
  DEFAULT: coreColors.grey["300"],
  primary: coreColors.grey["300"],
  secondary: coreColors.grey["400"],
  tertiary: coreColors.grey["700"],
  quaternary: coreColors.white,
  inverse: coreColors.grey["1100"],
  focus: coreColors.blue["200"],
  emphasis: {
    DEFAULT: coreColors.blue["400"],
    subtle: coreColors.blue["200"],
  },
  warning: {
    DEFAULT: coreColors.orange["400"],
    subtle: coreColors.orange["200"],
  },
  critical: {
    DEFAULT: coreColors.red["400"],
    subtle: coreColors.red["200"],
  },
  success: {
    DEFAULT: coreColors.green["400"],
    subtle: coreColors.green["200"],
  },
  "action-secondary": {
    DEFAULT: coreColors.grey["300"],
    hover: coreColors.grey["100"],
    focus: coreColors.white,
    disabled: coreColors.grey["300"],
  },
};
