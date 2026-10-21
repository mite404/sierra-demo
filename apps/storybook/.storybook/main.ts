import type { StorybookConfig } from "@storybook/react-vite";

// Stories stay beside their components in the catalog package; this app only hosts them.
const config: StorybookConfig = {
  stories: ["../../../packages/catalog/src/**/*.stories.tsx"],
  framework: "@storybook/react-vite",
  addons: ["@storybook/addon-vitest", "@storybook/addon-a11y"],
  features: {
    // The theme toolbar owns the surface: the background tool painted over it, leaving the light
    // theme's ink on a dark canvas, and the grid belongs to that tool.
    backgrounds: false,
    // Storybook's own setup checklist, a tour of Storybook rather than of these components.
    sidebarOnboardingChecklist: false,
    menuOnboardingChecklist: false,
  },
  core: { disableWhatsNewNotifications: true },
};
export default config;
