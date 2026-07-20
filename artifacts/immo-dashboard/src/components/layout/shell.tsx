import * as React from "react"
import { Menu } from "lucide-react"
import { Sidebar, SidebarContent } from "./sidebar"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import nomiaLogo from "@assets/0_33951-_Nomia_RM_AB1_1784575571250.jpg"

export function Shell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Mobile Top Bar */}
      <div className="md:hidden sticky top-0 z-50 flex items-center h-16 px-4 bg-sidebar border-b border-sidebar-border">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="text-sidebar-foreground mr-4">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64 bg-sidebar border-sidebar-border flex flex-col">
            <SidebarContent onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
        
        <div className="bg-white px-2 py-1 rounded">
          <img
            src={nomiaLogo}
            alt="Nomia Real Estate"
            className="h-6 w-auto object-contain"
          />
        </div>
      </div>

      <Sidebar />
      <main className="flex-1 bg-background overflow-auto flex flex-col">
        {children}
      </main>
    </div>
  )
}
