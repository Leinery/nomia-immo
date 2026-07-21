import * as React from "react"
import { Link, useLocation } from "wouter"
import { LayoutDashboard, Building2, Users, FileText, Euro, Receipt, FileSpreadsheet, Landmark, CreditCard, ListChecks, Wrench } from "lucide-react"
import nomiaLogo from "@assets/0_33951-_Nomia_RM_AB1_1784575571250.jpg"
import { cn } from "@/lib/utils"

interface SidebarContentProps {
  onNavigate?: () => void;
}

export function SidebarContent({ onNavigate }: SidebarContentProps) {
  const [location] = useLocation()

  const navItems = [
    { title: "Dashboard",      href: "/",                   icon: LayoutDashboard },
    { title: "Immobilien",     href: "/properties",         icon: Building2       },
    { title: "Mieter",         href: "/tenants",            icon: Users           },
    { title: "Mietverträge",   href: "/contracts",          icon: FileText        },
    { title: "Sollstellungen", href: "/sollstellungen",     icon: ListChecks      },
    { title: "Nebenkosten",    href: "/utility-costs",      icon: Euro            },
    { title: "Abrechnungen",   href: "/utility-statements", icon: Receipt         },
    { title: "Wartung",        href: "/maintenance",        icon: Wrench          },
    { title: "Dokumente",      href: "/documents",          icon: FileSpreadsheet },
    { title: "Banking",        href: "/banking",            icon: Landmark        },
    { title: "Kredite",        href: "/loans",              icon: CreditCard      },
  ]

  return (
    <>
      {/* Logo header — white strip so the JPG renders cleanly */}
      <div className="bg-white px-6 py-4 border-b border-sidebar-border/30">
        <img
          src={nomiaLogo}
          alt="Nomia Real Estate"
          className="h-10 w-auto object-contain"
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive =
            location === item.href ||
            (item.href !== "/" && location.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => onNavigate?.()}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors font-sans",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
              )}
            >
              <item.icon
                className={cn(
                  "h-4 w-4 shrink-0",
                  isActive ? "text-sidebar-primary" : "text-sidebar-foreground/50",
                )}
              />
              {item.title}
            </Link>
          )
        })}
      </nav>

      {/* Footer brand line */}
      <div className="px-6 py-4 border-t border-sidebar-border/30">
        <p className="text-[10px] tracking-widest uppercase text-sidebar-foreground/30 font-sans">
          Real Estate. Real Value.
        </p>
      </div>
    </>
  )
}

interface SidebarNavProps extends React.HTMLAttributes<HTMLElement> {}

export function Sidebar({ className, ...props }: SidebarNavProps) {
  return (
    <div
      className={cn(
        "hidden md:flex bg-sidebar text-sidebar-foreground border-r border-sidebar-border w-64 shrink-0 flex-col h-full",
        className,
      )}
      {...props}
    >
      <SidebarContent />
    </div>
  )
}
