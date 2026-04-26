export type TestSuite = {
  id: string;
  name: string;
  testCount: number;
  description: string;
  passRate: number;
};

export const suites: TestSuite[] = [
  {
    id: "auth-core",
    name: "Authentication Core",
    testCount: 14,
    description: "Validates login, registration, password reset, and session management flows.",
    passRate: 0.85,
  },
  {
    id: "payments",
    name: "Payment Gateway",
    testCount: 28,
    description: "Stripe integration, webhook handling, and subscription lifecycle events.",
    passRate: 1.0,
  },
  {
    id: "profile-api",
    name: "User Profile API",
    testCount: 42,
    description: "CRUD operations for user profiles, avatar uploads, and preference settings.",
    passRate: 0.6,
  },
  {
    id: "export",
    name: "Data Export",
    testCount: 8,
    description: "CSV and PDF generation accuracy and formatting validation.",
    passRate: 1.0,
  },
];

