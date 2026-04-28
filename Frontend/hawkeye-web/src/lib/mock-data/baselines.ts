export type DeviceClass = "desktop" | "mobile" | "tablet";
export type BaselineStatus = "needs-review" | "approved";

export type VisualBaseline = {
  id: string;
  title: string;
  assertion: string;
  deviceLabel: string;
  deviceClass: DeviceClass;
  status: BaselineStatus;
  imageUrl: string;
  project: string;
};

export const baselineProjects = ["All Projects", "Checkout Flow", "User Dashboard"] as const;
export const baselineDevices = ["All Devices", "Desktop 1080p", "Mobile iOS", "Tablet"] as const;

export const visualBaselines: VisualBaseline[] = [
  {
    id: "b1",
    title: "Checkout Page - Guest",
    assertion: "Assert: Order Summary loads",
    deviceLabel: "Desktop 1080p • Safari",
    deviceClass: "desktop",
    status: "needs-review",
    project: "Checkout Flow",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuCZmm9gFxvzymFOmh8Bw4F0m_X_VRapvsxyhygkM5ezD7nVt2iMldi8NSNbXfpPOp7VhN2lrEfeAPAZRWbxbKitON0FiCi58u4PBzs1xspaU3KO4pPDjdJd-31c2wotbaBZsoEdTl_It-fVwzVLrHuXoZd17tQTf8iNPrWTd9wamBqdcl2iNTe7wf5VxPOIpgjOUG6Zv9DBG7k1NX_7vTQx2UXfTNP8C_WnhfqY2gUUyWE_05c6tfAgqkp0wjf4LsmQz5sjy9aP9Zk",
  },
  {
    id: "b2",
    title: "Dashboard - Mobile",
    assertion: "Verify: Chart rendering",
    deviceLabel: "iPhone 13 • App",
    deviceClass: "mobile",
    status: "needs-review",
    project: "User Dashboard",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuDYSGTmtunU5FepQ5snbIiVM8SN1-_hYd5X-9Qs16r2E_ehpYUo1OtqLM9aZ7iJ-aNS-ZtMKsbj1b9f1NxPi2OWD-i6_ghP7RHZZx-2I5Zw8gJgUrXs1ETaJqck7sZ0QR9FMpSCFA7a09_doe1c_1oM0vUeflxwxgfUQY1uVd3SylbFQ4ArYF3ze3h-58oVv3GDL9LyfDDfOgT4tDa2dHXXSOFp7bcyClgrI_-QYbwCDnjDSR8UdX1_v2n9lH0BspYLFnk22ao_6dI",
  },
  {
    id: "b3",
    title: "Analytics Overview",
    assertion: "Check: Table layout bounds",
    deviceLabel: "iPad Pro • Chrome",
    deviceClass: "tablet",
    status: "needs-review",
    project: "User Dashboard",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuC4c2saGsgmzoRbx-_Hp9Bb0aZfDpVwqJuqynqg0dqEdxwrFjEQwjGF5CdIIs56hlFIJU3FP0Q_v0hvyom9kMCJnPiWheXrE8QYipxF0umte0AnpYsEY4PVBUobm9uV6MZ7eokraH3MOXW4qZXkPEmg7dDjEhdHACna9i60bW2-5KVEdVTLBdZbinXtykzDY8tWPmROIJ053hqfna_4QY3Gqwmb7aHnB3omxhVj8PA9yHWKxmIlbJz9-5MHS8HeWHxjjuHdQPmtzNc",
  },
  {
    id: "b4",
    title: "Checkout - Confirmation",
    assertion: "Verify: Success banner spacing",
    deviceLabel: "Desktop 1080p • Chrome",
    deviceClass: "desktop",
    status: "approved",
    project: "Checkout Flow",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuC4c2saGsgmzoRbx-_Hp9Bb0aZfDpVwqJuqynqg0dqEdxwrFjEQwjGF5CdIIs56hlFIJU3FP0Q_v0hvyom9kMCJnPiWheXrE8QYipxF0umte0AnpYsEY4PVBUobm9uV6MZ7eokraH3MOXW4qZXkPEmg7dDjEhdHACna9i60bW2-5KVEdVTLBdZbinXtykzDY8tWPmROIJ053hqfna_4QY3Gqwmb7aHnB3omxhVj8PA9yHWKxmIlbJz9-5MHS8HeWHxjjuHdQPmtzNc",
  },
];

