import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Route, Switch, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { Shell } from "@/components/layout/shell";

// Pages
import Dashboard from "@/pages/dashboard";
import PropertiesList from "@/pages/properties/index";
import PropertyDetail from "@/pages/properties/detail";
import TenantsList from "@/pages/tenants/index";
import ContractsList from "@/pages/contracts/index";
import ContractDetail from "@/pages/contracts/detail";
import DocumentsList from "@/pages/documents/index";
import UtilityCostsList from "@/pages/utility-costs/index";
import UtilityStatementsList from "@/pages/utility-statements/index";
import BankingPage from "@/pages/banking/index";
import LoansList from "@/pages/loans/index";
import LoanDetail from "@/pages/loans/detail";
import SollstellungenPage from "@/pages/sollstellungen/index";
import KiImportPage from "@/pages/ki-import/index";
import TenantDetail from "@/pages/tenants/detail";
import MaintenancePage from "@/pages/maintenance/index";

// ─── Clerk config ─────────────────────────────────────────────────────────────

// REQUIRED — resolves publishable key from hostname for multi-domain support
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

// REQUIRED — empty in dev (intentional), auto-set in prod; do NOT gate on NODE_ENV
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#1C3829",
    colorForeground: "#0f1c15",
    colorMutedForeground: "#5a7a6a",
    colorDanger: "#b91c1c",
    colorBackground: "#ffffff",
    colorInput: "#f4f7f5",
    colorInputForeground: "#0f1c15",
    colorNeutral: "#c8d9d1",
    fontFamily: "Inter, system-ui, sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl border border-[#e0ede6]",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[#0f1c15] font-semibold",
    headerSubtitle: "text-[#5a7a6a]",
    socialButtonsBlockButtonText: "text-[#0f1c15]",
    formFieldLabel: "text-[#0f1c15]",
    footerActionLink: "text-[#1C3829] hover:text-[#2a5240] font-medium",
    footerActionText: "text-[#5a7a6a]",
    dividerText: "text-[#5a7a6a]",
    identityPreviewEditButton: "text-[#1C3829]",
    formFieldSuccessText: "text-[#1C3829]",
    alertText: "text-[#0f1c15]",
    logoBox: "flex justify-center py-2",
    logoImage: "h-12 w-auto",
    socialButtonsBlockButton: "border border-[#c8d9d1] hover:bg-[#f4f7f5]",
    formButtonPrimary: "bg-[#1C3829] hover:bg-[#2a5240] text-white",
    formFieldInput: "bg-[#f4f7f5] border-[#c8d9d1] text-[#0f1c15]",
    footerAction: "bg-[#f4f7f5]",
    dividerLine: "bg-[#c8d9d1]",
    alert: "border-[#c8d9d1]",
    otpCodeFieldInput: "border-[#c8d9d1]",
    formFieldRow: "",
    main: "",
  },
};

// ─── Query client ─────────────────────────────────────────────────────────────

const queryClient = new QueryClient();

// ─── Cache invalidation on user change ───────────────────────────────────────

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current === undefined && userId !== null) {
        // Clerk just resolved the session for the first time — invalidate any
        // queries that may have failed with 401 before the session was ready.
        qc.invalidateQueries();
      } else if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        // User changed (login/logout) — clear everything.
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

// ─── Sign-in / Sign-up pages ─────────────────────────────────────────────────

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#f4f7f5] px-4">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
      />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#f4f7f5] px-4">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
      />
    </div>
  );
}

// ─── Protected app shell ──────────────────────────────────────────────────────

function ProtectedRouter() {
  return (
    <>
      <Show when="signed-in">
        <Shell>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/properties" component={PropertiesList} />
            <Route path="/properties/:id" component={PropertyDetail} />
            <Route path="/tenants" component={TenantsList} />
            <Route path="/contracts/:id" component={ContractDetail} />
            <Route path="/contracts" component={ContractsList} />
            <Route path="/utility-costs" component={UtilityCostsList} />
            <Route path="/utility-statements" component={UtilityStatementsList} />
            <Route path="/documents" component={DocumentsList} />
            <Route path="/banking" component={BankingPage} />
            <Route path="/loans/:id" component={LoanDetail} />
            <Route path="/loans" component={LoansList} />
            <Route path="/sollstellungen" component={SollstellungenPage} />
            <Route path="/tenants/:id" component={TenantDetail} />
            <Route path="/maintenance" component={MaintenancePage} />
            <Route path="/ki-import" component={KiImportPage} />
            <Route component={NotFound} />
          </Switch>
        </Shell>
      </Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

// ─── Root provider tree ───────────────────────────────────────────────────────

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey!}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Willkommen zurück",
            subtitle: "Melden Sie sich an um fortzufahren",
          },
        },
        signUp: {
          start: {
            title: "Konto erstellen",
            subtitle: "Registrierung für Nomia Real Estate",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Switch>
            {/* Auth routes — must use /*? wildcard for OAuth sub-paths */}
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            {/* All other routes are protected */}
            <Route component={ProtectedRouter} />
          </Switch>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
