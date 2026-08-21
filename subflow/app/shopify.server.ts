import "@shopify/shopify-api/adapters/cf-worker";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { D1SessionStorage } from "./db.server";

export const MONTHLY_PLAN = "Subflow Pro";
export const apiVersion = ApiVersion.July26;

export interface Env {
  DB: D1Database;
  SHOPIFY_API_KEY: string;
  SHOPIFY_API_SECRET: string;
  SCOPES: string;
  SHOPIFY_APP_URL: string;
}

function buildShopifyApp(env: Env) {
  return shopifyApp({
    apiKey: env.SHOPIFY_API_KEY,
    apiSecretKey: env.SHOPIFY_API_SECRET || "",
    apiVersion,
    scopes: env.SCOPES?.split(","),
    appUrl: env.SHOPIFY_APP_URL || "",
    authPathPrefix: "/auth",
    sessionStorage: new D1SessionStorage(env.DB),
    distribution: AppDistribution.AppStore,
    billing: {
      [MONTHLY_PLAN]: {
        trialDays: 7,
        lineItems: [
          {
            amount: 9.99,
            currencyCode: "USD",
            interval: BillingInterval.Every30Days,
          },
        ],
      },
    },
    future: {
      expiringOfflineAccessTokens: true,
    },
  });
}

let cached: ReturnType<typeof buildShopifyApp> | undefined;

export function getShopify(env: Env) {
  if (!cached) {
    cached = buildShopifyApp(env);
  }
  return cached;
}
