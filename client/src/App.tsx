import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { HelpDialog } from "@/components/help-dialog";
import { Footer } from "@/components/footer";
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Posts from "@/pages/posts";
import Jobs from "@/pages/jobs";
import MenuTranslation from "@/pages/menu-translation";
import InterfaceTranslation from "@/pages/interface-translation";
import SEOOptimization from "@/pages/seo-optimization";
import SettingsPage from "@/pages/settings";
import EditTranslationPage from "@/pages/edit-translation";
import CreateContent from "@/pages/create-content";
import ContentCorrection from "@/pages/content-correction";
import Archive from "@/pages/archive";
import NotFound from "@/pages/not-found";

function AuthenticatedRouter() {
  return (
    <Switch>
      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/posts" component={Posts} />
      <Route path="/create" component={CreateContent} />
      <Route path="/jobs" component={Jobs} />
      <Route path="/menus" component={MenuTranslation} />
      <Route path="/interface" component={InterfaceTranslation} />
      <Route path="/seo" component={SEOOptimization} />
      <Route path="/correction" component={ContentCorrection} />
      <Route path="/archive" component={Archive} />
      <Route path="/translation" component={EditTranslationPage} />
      <Route path="/configuration" component={SettingsPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <>
      {isAuthenticated ? (
        <SidebarProvider style={sidebarStyle as React.CSSProperties}>
          <div className="flex h-screen w-full flex-col">
            <div className="flex flex-1 overflow-hidden">
              <AppSidebar />
              <div className="flex flex-col flex-1 overflow-hidden">
                <header className="flex items-center justify-between p-2 border-b bg-background">
                  <SidebarTrigger data-testid="button-sidebar-toggle" />
                  <div className="flex items-center gap-2">
                    <HelpDialog />
                  </div>
                </header>
                <main className="flex-1 overflow-auto">
                  <AuthenticatedRouter />
                </main>
              </div>
            </div>
            <Footer />
          </div>
        </SidebarProvider>
      ) : (
        <Switch>
          <Route path="/login" component={Login} />
          <Route>
            <Redirect to="/login" />
          </Route>
        </Switch>
      )}
      <Toaster />
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <ThemeProvider>
          <AuthProvider>
            <TooltipProvider>
              <AppContent />
            </TooltipProvider>
          </AuthProvider>
        </ThemeProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

export default App;
