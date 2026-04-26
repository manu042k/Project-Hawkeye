export type VaultEnvironment = "Production" | "Staging" | "Development";
export type VaultType = "Database" | "API Key" | "Certificate";

export type VaultSecret = {
  id: string;
  name: string;
  environment: VaultEnvironment;
  type: VaultType;
  maskedValue: string;
  lastUpdated: string;
  clearValue: string;
};

export const vaultSecrets: VaultSecret[] = [
  {
    id: "s1",
    name: "STAGING_DB_PASSWORD",
    environment: "Staging",
    type: "Database",
    maskedValue: "••••••••••••••••",
    clearValue: "staging-db-password-demo",
    lastUpdated: "Oct 12 by Alice",
  },
  {
    id: "s2",
    name: "PROD_STRIPE_SECRET_KEY",
    environment: "Production",
    type: "API Key",
    maskedValue: "••••••••••••••••••••••••",
    clearValue: "sk_live_demo_xxxxxxxxxxxxx",
    lastUpdated: "Sep 28 by Bob",
  },
  {
    id: "s3",
    name: "DEV_AWS_ACCESS_KEY",
    environment: "Development",
    type: "Certificate",
    maskedValue: "••••••••••••",
    clearValue: "AKIADEMOXXXXXXXXXXXX",
    lastUpdated: "Nov 02 by Charlie",
  },
];

