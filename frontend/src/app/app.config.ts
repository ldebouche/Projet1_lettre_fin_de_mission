import { ApplicationConfig, importProvidersFrom, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { HTTP_INTERCEPTORS } from '@angular/common/http';

import { AuthInterceptor } from './interceptor/auth.interceptor';

import { MsalModule, MsalRedirectComponent, MsalGuard } from '@azure/msal-angular';
import { PublicClientApplication, InteractionType } from '@azure/msal-browser';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),

    importProvidersFrom(
      MsalModule.forRoot(
        new PublicClientApplication({
          auth: {
            clientId: "171de78f-bfbe-435a-9356-d78a744722f4",
            authority: "https://login.microsoftonline.com/f7f506f7-c551-4a8a-8c5a-b7d339828e4b",
            redirectUri: "http://localhost:4200/"
          }
        }),
        {
          interactionType: InteractionType.Redirect,
          authRequest: {
            scopes: ['user.read']
          }
        },
        {
          interactionType: InteractionType.Redirect,
          protectedResourceMap: new Map([
            ["/api", ["user.read"]]
          ])
        }
      )
    ),

    MsalGuard,

    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true }
  ],
};
