const PREFIX = "💡 skills-attachment";

let enabled = true;

export const logger = {
  enable: () => {
    enabled = true;
  },
  disable: () => {
    enabled = false;
  },
  log: (...args: unknown[]) => {
    if (enabled) {
      console.log(PREFIX, ...args);
    }
  },
  warn: (...args: unknown[]) => {
    if (enabled) {
      console.warn(PREFIX, ...args);
    }
  },
  error: (...args: unknown[]) => {
    if (enabled) {
      console.error(PREFIX, ...args);
    }
  },
};
