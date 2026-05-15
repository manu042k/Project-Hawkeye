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

type NotificationStore = {
  notifications: Notification[];
  alertPrefs: Record<string, AlertPrefs>;
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

export const useNotificationStore = create<NotificationStore>()(
  persist(
    (set, get) => ({
      notifications: [],
      alertPrefs: {},

      add: (n) => {
        const notif: Notification = {
          ...n,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          createdAt: new Date().toISOString(),
          read: false,
        };
        set((s) => ({
          notifications: [notif, ...s.notifications].slice(0, 100),
        }));
      },

      markRead: (id) =>
        set((s) => ({
          notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
        })),

      markAllRead: () =>
        set((s) => ({
          notifications: s.notifications.map((n) => ({ ...n, read: true })),
        })),

      remove: (id) =>
        set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),

      clear: () => set({ notifications: [] }),

      setAlertPrefs: (projectId, prefs) =>
        set((s) => ({ alertPrefs: { ...s.alertPrefs, [projectId]: prefs } })),

      getAlertPrefs: (projectId) =>
        get().alertPrefs[projectId] ?? DEFAULT_PREFS,
    }),
    { name: "hawkeye-notifications" }
  )
);

export const unreadCount = (notifications: Notification[]) =>
  notifications.filter((n) => !n.read).length;
