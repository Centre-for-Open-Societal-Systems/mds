"use client";

import { useEffect, useState } from "react";
import {
  Home,
  MapPin,
  Database,
  BookOpen,
  Package,
  History,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, usePathname } from "@/i18n/navigation";

const STORAGE_KEY = "master-data-sidebar-collapsed";

export default function Sidebar() {
  const t = useTranslations();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // ignore
    }
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  };

  const typeParam = searchParams.get("type");

  const MENU = [
    {
      id: "home",
      label: "Home",
      href: "/",
      Icon: Home,
      isActive: pathname === "/",
    },
    {
      id: "all-catalogs",
      label: "All Catalogs",
      href: "/datasets?type=catalog",
      Icon: Database,
      isActive: pathname.startsWith("/datasets") && typeParam !== "lookup",
    },
    {
      id: "all-lookups",
      label: "All Lookups",
      href: "/datasets?type=lookup",
      Icon: BookOpen,
      isActive: pathname.startsWith("/datasets") && typeParam === "lookup",
    },
    {
      id: "geo-locations",
      label: "Geography",
      href: "/geo-locations",
      Icon: MapPin,
      isActive: pathname === "/geo-locations" || pathname.startsWith("/geo-locations/"),
    },
    {
      id: "releases",
      label: "Releases",
      href: "/releases",
      Icon: Package,
      isActive: pathname === "/releases" || pathname.startsWith("/releases/"),
    },
    {
      id: "changes",
      label: "Activity",
      href: "/changes",
      Icon: History,
      isActive: pathname === "/changes" || pathname.startsWith("/changes/"),
    },
  ];

  return (
    <aside
      className={`relative flex shrink-0 flex-col self-stretch bg-[#F4BB1B] transition-[width] duration-200 ${
        collapsed ? "w-[88px]" : "w-[250px]"
      }`}
    >
      <div className={`flex pt-4 ${collapsed ? "justify-center px-2" : "justify-end px-3"}`}>
        <button
          type="button"
          onClick={toggle}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg bg-black/10 text-black hover:bg-black/15"
          aria-label={collapsed ? t("expand") : t("collapse")}
          title={collapsed ? t("expand") : t("collapse")}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      <nav className={`space-y-2 p-4 pt-4 ${collapsed ? "px-2" : ""}`}>
        {MENU.map(({ id, label, href, Icon, isActive }) => {
          return (
            <div key={id} className="relative">
              {isActive && (
                <div className="absolute inset-0 rounded-[10px] bg-white/30" />
              )}

              <Link
                href={href}
                title={label}
                className={`relative z-10 flex items-center py-3 ${
                  collapsed ? "justify-center px-2" : "px-4"
                }`}
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    isActive ? "bg-black" : "bg-white"
                  }`}
                >
                  <Icon
                    size={20}
                    strokeWidth={2}
                    className="text-[#EF7C22]"
                  />
                </div>
                {!collapsed ? (
                  <span
                    className={`ml-3 text-base leading-tight text-black ${
                      isActive ? "font-bold" : "font-medium"
                    }`}
                  >
                    {label}
                  </span>
                ) : null}
              </Link>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
