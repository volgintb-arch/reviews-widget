import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { Toaster } from '@/components/ui/toaster';
import { ProjectProvider } from '@/lib/project-context';
import '@/styles/globals.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename="/admin">
        <ProjectProvider>
          <App />
          <Toaster />
        </ProjectProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
