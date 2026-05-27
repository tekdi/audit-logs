import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { randomUUID } from 'crypto';

export interface Response<T> {
  id: string;
  ver: string;
  ts: string;
  params: {
    resmsgid: string;
    msgid?: string;
    status: string;
    err?: string | null;
    errmsg?: string | null;
    successmessage?: string;
  };
  responseCode: number;
  result: T;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, Response<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T>> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    
    // Generate an ID based on the URL path, e.g., /api/v1/audit/log -> api.audit.log
    const apiId = request.url
      .split('?')[0]
      .replace(/^\/|\/$/g, '')
      .split('/')
      .filter(part => !part.match(/^v\d+$/)) // Remove version parts like v1
      .join('.');

    return next.handle().pipe(
      map((data) => ({
        id: `api.${apiId}`,
        ver: '1.0',
        ts: new Date().toISOString(),
        params: {
          resmsgid: randomUUID(),
          status: 'successful',
          err: null,
          errmsg: null,
          successmessage: data?.message || 'Request processed successfully',
        },
        responseCode: response.statusCode,
        result: data?.result !== undefined ? data.result : data,
      })),
    );
  }
}
