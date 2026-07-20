import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { Shell } from '@/components/layout/shell';

// Pages
import Dashboard from '@/pages/dashboard';
import PropertiesList from '@/pages/properties/index';
import PropertyDetail from '@/pages/properties/detail';
import TenantsList from '@/pages/tenants/index';
import ContractsList from '@/pages/contracts/index';
import DocumentsList from '@/pages/documents/index';
import UtilityCostsList from '@/pages/utility-costs/index';
import UtilityStatementsList from '@/pages/utility-statements/index';
import BankingPage from '@/pages/banking/index';

const queryClient = new QueryClient();

function Router() {
  return (
    <Shell>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/properties" component={PropertiesList} />
        <Route path="/properties/:id" component={PropertyDetail} />
        <Route path="/tenants" component={TenantsList} />
        <Route path="/contracts" component={ContractsList} />
        <Route path="/utility-costs" component={UtilityCostsList} />
        <Route path="/utility-statements" component={UtilityStatementsList} />
        <Route path="/documents" component={DocumentsList} />
        <Route path="/banking" component={BankingPage} />
        <Route component={NotFound} />
      </Switch>
    </Shell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
