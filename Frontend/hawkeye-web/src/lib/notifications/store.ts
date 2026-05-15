"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type NotifLevel = "success" | "error" | "warning" | "info";

export type Notification = {
  id: string;
  level: NotifLevel;
  title: string;
  body?: string;
  href?: string;
  projectId?: string;
  runId?: string;
  createdAt: string;
  read: boolean;
};

export type AlertPrefs = {
  onFailure: boolean;
  onSuccess: boolean;
  passRateThreshold: number | null;
};

type UserData = {
  notifications: Notification[];
  alertPrefs: Record<string, AlertPrefs>;
};

type NotificationStore = {
  byUser: Record<string, UserData>;
  activeEmail: string | null;
  setActiveEmail: (email: string | null) => void;
  add: (n: Omit<Notification, "id" | "createdAt" | "read">) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  remove: (id: string) => void;
  clear: () => void;
  setAlertPrefs: (projectId: string, prefs: AlertPrefs) => void;
  getAlertPrefs: (projectId: string) => AlertPrefs;
};

const DEFAULT_PREFS: AlertPrefs = {
  onFailure: true,
  onSuccess: false,
  passRateThreshold: null,
};

function emptyUser(): UserData {
  return { notifications: [], alertPrefs: {} };
}

export const useNotificationStore = create<NotificationStore>()(
  persist(
    (set, get) => ({
      byUser: {},
      activeEmail: null,

      setActiveEmail: (email) => set({ activeEmail: email }),

      add: (n) => {
        const { activeEmail } = get();
        if (!activeEmail) return;
        const notif: Notification = {
          ...n,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          createdAt: new Date().toISOString(),
          read: false,
        };
        set((s) => {
          const prev = s.byUser[activeEmail] ?? emptyUser();
          return {
            byUser: {
              ...s.byUser,
              [activeEmail]: { ...prev, notifications: [notif, ...prev.notifications].slice(0, 100) },
            },
          };
        });
      },

      markRead: (id) => {
        const { activeEmail } = get();
        if (!activeEmail) return;
        set((s) => {
          const prev = s.byUser[activeEmail] ?? emptyUser();
          return {
            byUser: {
              ...s.byUser,
              [activeEmail]: {
                ...prev,
                notifications: prev.notifications.map((n) => n.id === id ? { ...n, read: true } : n),
              },
            },
          };
        });
      },

      markAllRead: () => {
        const { activeEmail } = get();
        if (!activeEmail) return;
        set((s) => {
          const prev = s.byUser[activeEmail] ?? emptyUser();
          return {
            byUser: {
              ...s.byUser,
              [activeEmail]: {
                ...prev,
                notifications: prev.notifications.map((n) => ({ ...n, read: true })),
              },
            },
          };
        });
      },

      remove: (id) => {
        const { activeEmail } = get();
        if (!activeEmail) return;
        set((s) => {
          const prev = s.byUser[activeEmail] ?? emptyUser();
          return {
            byUser: {
              ...s.byUser,
              [activeEmail]: { ...prev, notifications: prev.notifications.filter((n) => n.id !== id) },
            },
          };
        });
      },

      clear: () => {
        const { activeEmail } = get();
        if (!activeEmail) return;
        set((s) => ({
          byUser: {
            ...s.byUser,
            [activeEmail]: { ...(s.byUser[activeEmail] ?? emptyUser()), notifications: [] },
          },
        }));
      },

      setAlertPrefs: (projectId, prefs) => {
        const { activeEmail } = get();
        if (!activeEmail) return;
        set((s) => {
          const prev = s.byUser[activeEmail] ?? emptyUser();
          return {
            byUser: {
              ...s.byUser,
              [activeEmail]: { ...prev, alertPrefs: { ...prev.alertPrefs, [projectId]: prefs } },
            },
          };
        });
      },

      getAlertPrefs: (projectId) => {
        const { byUser, activeEmail } = get();
        return (activeEmail ? byUser[activeEmail]?.alertPrefs?.[projectId] : undefined) ?? DEFAULT_PREFS;
      },
    }),
    { name: "hawkeye-notifications" }
  )
);

/** Selector: returns the active user's notifications (empty array if no user set). */
export function useNotifications(): Notification[] {
  return useNotificationStore((s) => s.activeEmail ? (s.byUser[s.activeEmail]?.notifications ?? []) : []);
}

export const unreadCount = (notifications: Notification[]) =>
  notifications.filter((n) => !n.read).length;
