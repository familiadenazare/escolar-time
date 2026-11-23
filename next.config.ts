import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Imagem enxuta para o Coolify (ver Dockerfile).
  output: "standalone",
  // Drivers do banco ficam fora do bundle do servidor (o PGlite carrega WebAssembly).
  serverExternalPackages: ["pg", "@electric-sql/pglite"],
};

export default nextConfig;
