import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
    define: {
      "process.env.GEMINI_API_KEY": JSON.stringify(env.GEMINI_API_KEY),
      "process.env.SERVICE_NAME": JSON.stringify(env.SERVICE_NAME || ""),
      "process.env.SERVICE_DESCRIPTION": JSON.stringify(env.SERVICE_DESCRIPTION || ""),
      "process.env.SERVICE_URL": JSON.stringify(env.SERVICE_URL || ""),
    },
  };
});
