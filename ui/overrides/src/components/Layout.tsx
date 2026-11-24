"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, usePathname } from "@/i18n/navigation";
import { useAuth } from "@/context/Authcontext";
import { Home, MapPin, Database, BookOpen, Package, History } from "lucide-react";

export default function Layout({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, logout } = useAuth();

  const typeParam = searchParams.get("type");

  const NAV = [
    {
      id: "home",
      href: "/",
      label: "Home",
      Icon: Home,
      isActive: pathname === "/",
    },
    {
      id: "all-catalogs",
      href: "/datasets?type=catalog",
      label: "All Catalogs",
      Icon: Database,
      isActive: pathname.startsWith("/datasets") && typeParam !== "lookup",
    },
    {
      id: "all-lookups",
      href: "/datasets?type=lookup",
      label: "All Lookups",
      Icon: BookOpen,
      isActive: pathname.startsWith("/datasets") && typeParam === "lookup",
    },
    {
      id: "geo",
      href: "/geo-locations",
      label: "Geography",
      Icon: MapPin,
      isActive: pathname === "/geo-locations" || pathname.startsWith("/geo-locations/"),
    },
    {
      id: "releases",
      href: "/releases",
      label: "Releases",
      Icon: Package,
      isActive: pathname === "/releases" || pathname.startsWith("/releases/"),
    },
    {
      id: "changes",
      href: "/changes",
      label: "Activity",
      Icon: History,
      isActive: pathname === "/changes" || pathname.startsWith("/changes/"),
    },
  ];

  const displayName =
    user?.name ||
    user?.preferred_username ||
    user?.email ||
    user?.sub ||
    "User";

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="bg-black text-white flex flex-col shrink-0 sticky top-0 h-screen w-(--sidebar-width) py-7">
        <Link
          href="/"
          title={t("home")}
          className="px-6 pb-7 flex flex-col items-start border-b border-[rgba(255,255,255,0.08)] mb-5"
        >
          <img
            src="/openg2p-logo-horizontal.svg"
            alt="OpenG2P"
            className="w-41.75 h-auto block"
          />
          <span className="text-[20px] font-medium text-white mt-6 leading-[1.2]">{t("master_data")}</span>
        </Link>
        <nav className="flex-1">
          {NAV.map((item) => {
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`flex items-center gap-3 px-5 text-[16px] py-3 text-[rgba(255,255,255,0.72)] font-medium border-l-[3px] border-transparent transition-all duration-150 ${item.isActive ? "bg-[rgba(244,187,27,0.14)] text-(--color-yellow) border-l-(--color-yellow)" : "hover:bg-[rgba(244,187,27,0.08)] hover:text-white"}`}
              >
                <item.Icon size={18} className={item.isActive ? "text-(--color-yellow)" : ""} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-6 py-4 border-t border-[rgba(255,255,255,0.08)] flex flex-col gap-2.5">
          <div className="flex flex-col gap-0.5">
            <div className="text-white text-[16px] font-medium overflow-hidden text-ellipsis whitespace-nowrap">{displayName}</div>
          </div>
          <button type="button" className="bg-transparent text-white border border-gray-400 rounded-[10px] text-[16px] px-3 py-2 cursor-pointer hover:bg-gray-600 hover:text-white transition-all duration-150 flex items-center gap-2" onClick={logout}>
            {t("logout")}
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 p-8">{children}</main>
    </div>
  );
}
