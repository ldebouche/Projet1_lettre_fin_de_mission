import { Injectable } from '@angular/core';
import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { tap } from 'rxjs/operators';
import { Observable } from 'rxjs';

@Injectable()
export class HttpLogInterceptor implements HttpInterceptor {
    intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
        console.log("➡️ HTTP REQUEST:", req.url, req.method);
        return next.handle(req).pipe(
            tap({
                next: (event) => {
                    console.log("⬅️ HTTP RESPONSE:", req.url, event);
                },
                error: (err) => {
                    console.log("❌ HTTP ERROR:", req.url, err);
                }
            })
        );
    }
}
