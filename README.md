# Audit Logger SDK

Plug-and-play, environment-driven audit and activity logging SDK for Node.js and NestJS services.

## Installation

You can install this package directly from the Git repository:

```bash
npm install git+https://github.com/<your-org-name>/audit-logs.git
```

## NestJS Usage

To ensure standard Node applications don't accidentally bundle Nest dependencies, we export the NestJS specific tools from a subpath. 

If you are using NestJS, import the module using the `/nestjs` suffix:

```typescript
import { AuditLoggerModule } from '@your-org/audit-logger/nestjs';

@Module({
  imports: [
    AuditLoggerModule.forRoot({
      // Your configuration here
    })
  ],
})
export class AppModule {}
```

## Standard Node.js Usage

If you are using standard Node.js (like Express, Fastify, etc.), import the SDK from the main path:

```typescript
import { AuditLogger } from '@your-org/audit-logger';

const logger = new AuditLogger({
  // Your configuration here
});
```

## Developer Notes
* Built with TypeScript.
* Exposes `nestjs` module via `exports` definition in `package.json`.