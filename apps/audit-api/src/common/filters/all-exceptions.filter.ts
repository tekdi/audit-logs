import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { randomUUID } from 'crypto';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    const apiId = request.url
      .split('?')[0]
      .replace(/^\/|\/$/g, '')
      .split('/')
      .filter(part => !part.match(/^v\d+$/))
      .join('.');

    response.status(status).json({
      id: `api.${apiId}`,
      ver: '1.0',
      ts: new Date().toISOString(),
      params: {
        resmsgid: randomUUID(),
        status: 'failed',
        err: status.toString(),
        errmsg: typeof message === 'string' ? message : (message as any)?.message || 'Something went wrong',
      },
      responseCode: status,
      result: null,
    });
  }
}
