import { createRequestHandler, type ServerBuild } from "react-router";
import * as serverBuild from "../build/server/index.js";
import type { Env } from "../app/shopify.server";

const build = serverBuild as unknown as ServerBuild;

declare module "react-router" {
  interface AppLoadContext {
    cloudflare: { env: Env; ctx: ExecutionContext };
  }
}

const requestHandler = createRequestHandler(build, "production");

export default {
  async fetch(request, env, ctx) {
    return requestHandler(request, {
      cloudflare: { env, ctx },
    });
  },
} satisfies ExportedHandler<Env>;
