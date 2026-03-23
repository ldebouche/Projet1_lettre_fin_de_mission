import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler } from '@angular/common/http';
import { MsalService } from '@azure/msal-angular';
import { from, of } from 'rxjs';
import { mergeMap } from 'rxjs/operators';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
    constructor(private msal: MsalService) { }

    intercept(req: HttpRequest<any>, next: HttpHandler) {        
        const activeAccount = this.msal.instance.getActiveAccount() ?? undefined;

        if (!activeAccount) {
            return next.handle(req);
        }

        return from(
            this.msal.acquireTokenSilent({
                scopes: ["api://67336009-376f-424b-882b-8662f86e5eed/access_as_user"],
                account: activeAccount
            })
        ).pipe(
            mergeMap(result => {
                const token = result?.accessToken;

                const clone = req.clone({
                    setHeaders: {
                        Authorization: `Bearer ${token}`
                    }
                });

                return next.handle(clone);
            })
        );
    }
}
