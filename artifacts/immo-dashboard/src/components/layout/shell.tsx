import * as React from "react"
import { Sidebar } from "./sidebar"

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 bg-background overflow-auto flex flex-col">
        {children}
      </main>
    </div>
  )
}
