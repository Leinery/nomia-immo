import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex w-full items-center justify-center p-8 mt-20">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <h1 className="text-2xl font-bold text-foreground">404 Seite nicht gefunden</h1>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Die angeforderte Seite existiert nicht oder wurde verschoben.
          </p>
          <div className="mt-8 flex justify-end">
            <Link href="/">
              <Button>Zurück zum Dashboard</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
